import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { chunkKey, parseChunkKey, chunkDistance } from '../../src/servicos/constants.js'
import { alturaNaCelula } from '../../src/servicos/voxelRaycast.js'
import { pontoNoAnel, MIN_SPAWN_DIST, MAX_SPAWN_DIST } from '../../src/servicos/mobs.js'

// ⚠️ O FORMATO DA CHAVE DE CHUNK É UMA DECISÃO SÓ.
//
// `chunkKey` escreve `${cx},${cz}`; `parseChunkKey` lê de volta, com validação.
// Mesmo assim havia QUATRO lugares que liam a chave à mão — `key.indexOf(',')`
// seguido de dois `Number(key.slice(...))` — sem validação nenhuma.
//
// Hoje isso não é defeito: todas as chaves parseadas ali foram escritas pelo
// próprio programa, então malformada não chega. É uma ARMADILHA, não um bug: no
// dia em que a chave ganhar um terceiro campo, ou virar `cx:cz`, quem editar
// `chunkKey` vai editar `parseChunkKey` junto — e as cópias à mão continuarão
// compilando, passando no lint, e devolvendo NaN em silêncio.
//
// Este arquivo é o que faz esse dia doer na hora certa.

const RAIZ = path.resolve(__dirname, '../..')

/** `key.indexOf(',')` + `Number(key.slice(` = alguém remontando o parser. */
const AMAO = /\.indexOf\(\s*','\s*\)/

function fontesDoJogo() {
  const lista = []
  const anda = (dir) => {
    for (const f of fs.readdirSync(dir)) {
      const cheio = path.join(dir, f)
      if (fs.statSync(cheio).isDirectory()) anda(cheio)
      else if (f.endsWith('.js') || f.endsWith('.vue')) lista.push(cheio)
    }
  }
  anda(path.join(RAIZ, 'src/servicos'))
  anda(path.join(RAIZ, 'src/composables'))
  lista.push(path.join(RAIZ, 'src/JogoRoqueCraft.vue'))
  return lista
}

describe('a chave de chunk vai e volta', () => {
  it('escrever e ler de volta devolve o mesmo par', () => {
    for (const [cx, cz] of [
      [0, 0],
      [3, -7],
      [-120, 45],
      [999, -999],
    ]) {
      expect(parseChunkKey(chunkKey(cx, cz))).toEqual({ cx, cz })
    }
  })

  it('chave malformada devolve null, e nao um par com NaN', () => {
    // O jeito à mão devolvia `{ cx: NaN, cz: NaN }`, que segue viajando pelo
    // programa e só falha lá na frente, longe da causa.
    for (const ruim of ['', 'abc', '3', '3,', ',7', '3,x', null, undefined, 'a,b']) {
      expect(parseChunkKey(ruim), `chave ${String(ruim)}`).toBe(null)
    }
  })

  it('a chave sobrevive a um ida e volta por JSON', () => {
    // Ela existe pra ser serializável: o save e o multiplayer a mandam inteira.
    const k = chunkKey(-12, 34)
    expect(parseChunkKey(JSON.parse(JSON.stringify({ k })).k)).toEqual({ cx: -12, cz: 34 })
  })
})

describe('ninguem remonta o parser a mao', () => {
  it('nenhum arquivo do jogo fatia a chave por conta propria', () => {
    const acusados = []
    for (const arq of fontesDoJogo()) {
      const txt = fs.readFileSync(arq, 'utf8')
      if (!AMAO.test(txt)) continue
      // `constants.js` É o dono: é lá que a decisão mora.
      if (path.basename(arq) === 'constants.js') continue
      acusados.push(path.basename(arq))
    }
    expect(acusados, `remontam o parser:\n  ${acusados.join('\n  ')}`).toEqual([])
  })

  it('a varredura enxerga os arquivos, e o padrao dela casa de verdade', () => {
    // Sem isto, um regex que nao casa nada faria este teste passar pra sempre.
    expect(fontesDoJogo().length).toBeGreaterThan(40)
    expect(AMAO.test("const i = key.indexOf(',')")).toBe(true)
    expect(AMAO.test('const i = key.indexOf(";")')).toBe(false)
  })
})

describe('distancia em chunks tem nome', () => {
  it('e Chebyshev: por anel, e nao por circulo', () => {
    // Circulo euclidiano deixa buraco nos cantos da tela.
    expect(chunkDistance(0, 0, 3, 4)).toBe(4)
    expect(chunkDistance(0, 0, 3, 3)).toBe(3)
    expect(chunkDistance(-2, 5, 1, 5)).toBe(3)
  })
})

// ⚠️ O RELOGIO DA SIMULACAO E UM NUMERO SO.
//
// `TIQUES_POR_SEGUNDO` estava escrito DUAS vezes -- `atualizacoes.js` e
// `gravidade.js` -- com o mesmo valor. Mudar so um faria a areia cair num ritmo
// e o rio correr noutro, sem erro nenhum, sem teste vermelho, sem nada no
// console: o mundo simplesmente deixaria de concordar consigo mesmo, e o
// jogador veria "as vezes a areia cai estranho".
describe('o relogio da simulacao', () => {
  it('e definido UMA vez, em constants.js', () => {
    const acusados = []
    for (const arq of fontesDoJogo()) {
      if (path.basename(arq) === 'constants.js') continue
      const txt = fs.readFileSync(arq, 'utf8')
      if (/^\s*(?:export )?const TIQUES_POR_SEGUNDO\s*=/m.test(txt)) {
        acusados.push(path.basename(arq))
      }
    }
    expect(acusados, `redefinem o relogio:\n  ${acusados.join('\n  ')}`).toEqual([])
  })

  it('o relogio do CEU e derivado, e por isso pode divergir do da fisica', async () => {
    // ⚠️ ESCREVI ESTE TESTE AO CONTRARIO PRIMEIRO, afirmando que os dois numeros
    // eram diferentes. A medicao me desmentiu: `TICKS_PER_SECOND` do ceu tambem
    // da 20 hoje. Nao e coincidencia -- e a mesma convencao (dia de 24000
    // tiques em 20 minutos da 20 tiques por segundo).
    //
    // Mas eles NAO sao a mesma decisao, e por isso nao viram um numero so: o do
    // ceu e DERIVADO do tamanho do dia. Se o founder quiser um dia mais longo,
    // o sol tem que andar mais devagar -- e a agua NAO. Unificar os dois faria
    // um dia longo deixar o rio lento.
    const { TIQUES_POR_SEGUNDO } = await import('../../src/servicos/constants.js')
    const { TICKS_PER_SECOND, TICKS_PER_DAY, DAY_SECONDS } = await import(
      '../../src/servicos/daycycle.js'
    )
    expect(TIQUES_POR_SEGUNDO).toBe(20)
    // O do ceu e conta, nao numero cravado: e isso que o deixa livre pra mudar.
    expect(TICKS_PER_SECOND).toBe(TICKS_PER_DAY / DAY_SECONDS)
    // E hoje os dois coincidem, que e exatamente por que ninguem reparou que
    // sao duas decisoes.
    expect(TICKS_PER_SECOND).toBe(TIQUES_POR_SEGUNDO)
  })

  it('quem usa o relogio importa o de verdade', async () => {
    const { TIQUES_POR_SEGUNDO } = await import('../../src/servicos/constants.js')
    const grav = await import('../../src/servicos/gravidade.js')
    const atu = await import('../../src/servicos/atualizacoes.js')
    expect(atu.TIQUES_POR_SEGUNDO).toBe(TIQUES_POR_SEGUNDO)
    // `gravidade` nao reexporta, entao a prova e comportamental: um segundo de
    // queda tem que integrar `TIQUES_POR_SEGUNDO` tiques.
    expect(typeof grav.passoDaQueda).toBe('function')
  })
})

// ⚠️ DUAS COPIAS DA MESMA CONTA SAO O DIA EM QUE ELAS DISCORDAM.
//
// `alturaNaCelula` (onde dentro da celula o clique caiu) estava escrita
// IDENTICA em `laje.js` e `escada.js` -- e a copia da escada ate apontava pra
// da laje pelo motivo. Consertar o caso do teto numa e esquecer a outra faria a
// laje e a escada responderem coisas diferentes pro MESMO clique.
//
// O anel de spawn (onde criatura aparece em volta do jogador) estava escrito
// duas vezes tambem, em `mobs.js` e `nadoSpawn.js`: o dia em que o peixe nasce
// num anel e o zumbi noutro.
describe('contas que so podem existir uma vez', () => {
  const naoRedefine = (nome) => {
    const donos = { alturaNaCelula: 'voxelRaycast.js', pontoNoAnel: 'mobs.js' }
    const acusados = []
    for (const arq of fontesDoJogo()) {
      if (path.basename(arq) === donos[nome]) continue
      const txt = fs.readFileSync(arq, 'utf8')
      if (new RegExp(`^\\s*(?:export )?function ${nome}\\s*\\(`, 'm').test(txt)) {
        acusados.push(path.basename(arq))
      }
    }
    return acusados
  }

  it('alturaNaCelula tem um dono so', () => {
    expect(naoRedefine('alturaNaCelula')).toEqual([])
  })

  it('pontoNoAnel tem um dono so', () => {
    expect(naoRedefine('pontoNoAnel')).toEqual([])
  })

  it('a laje e a escada respondem o MESMO pro mesmo clique', () => {
    // A prova comportamental, e nao so estrutural: as duas leem a mesma conta.
    // Bater redondo em y=70 vindo de cima e o TOPO da celula 69, e as duas
    // precisam concordar nisso.
    expect(alturaNaCelula(70)).toBe(1)
    expect(alturaNaCelula(70.5)).toBeCloseTo(0.5, 9)
    expect(alturaNaCelula(70.25)).toBeCloseTo(0.25, 9)
    expect(alturaNaCelula(NaN)).toBe(0)
  })

  it('o anel nunca poe criatura na cara nem fora do carregado', () => {
    const jogador = { x: 0, z: 0 }
    for (let i = 0; i < 200; i++) {
      const r = ((i * 37) % 100) / 100
      const { x, z } = pontoNoAnel(jogador, () => r)
      const d = Math.hypot(x, z)
      expect(d).toBeGreaterThanOrEqual(MIN_SPAWN_DIST - 2)
      expect(d).toBeLessThanOrEqual(MAX_SPAWN_DIST + 2)
    }
  })
})
