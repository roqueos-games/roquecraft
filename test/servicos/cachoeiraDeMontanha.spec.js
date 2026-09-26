import { describe, it, expect } from 'vitest'
import {
  planoDaCachoeira,
  direcaoDaDescida,
  ehCandidata,
  AGUA_CAINDO,
  PROFUNDIDADE,
  COMPRIMENTO,
  LARGURA,
  ALTURA_DA_QUEDA,
  ALCANCE_DO_PLANO,
  CELULA,
  LARGURA_MAXIMA_DA_QUEDA,
  deslocamentosDaQueda,
  larguraDaQueda,
  meiaDoPatamar,
} from '../../src/servicos/cachoeiraDeMontanha.js'
import { createNoiseContext, generateChunkData } from '../../src/servicos/worldgen.js'
import { proximoId, OS_FLUIDOS } from '../../src/servicos/fluidos.js'
import { ehQueda, alturaDaColuna, ALTURA_MINIMA } from '../../src/servicos/cachoeira.js'
import { ID } from '../../src/servicos/blocks.js'
import { WORLD_HEIGHT, localIndex, AIR } from '../../src/servicos/constants.js'

// CACHOEIRA DE MONTANHA — a forma, e o mundo que sai dela.
//
// ⚠️ O CRITÉRIO DESTE ARQUIVO É O PONTO FIXO, não "tem água no lugar certo".
//
// A cachoeira é escrita pronta pelo worldgen — nascente, coluna caindo e poça —
// porque a fila de atualização é reativa e nunca varre chunk recém-gerado atrás
// de líquido. O risco disso é a geração escrever um arranjo que a REGRA de
// `fluidos.js` não reconhece: aí a cachoeira existe até o jogador chegar perto,
// a fila acorda, e ela se desmancha na frente dele. Um teste que só conferisse
// os ids passaria feliz nesse cenário. Perguntar à regra o que cada célula
// deveria ser, e exigir "nada a mudar", é o único critério que pega isso — e
// foi ele que pegou, em 13/09/2026, as três causas reais de vazamento: o lábio
// aberto, a poça pendurada sobre caverna, e dois patamares se cruzando.

const rochaSempre = () => true
const planalto = { alturaEm: () => 80, rochaEm: rochaSempre }
const rampa = (passo) => ({ alturaEm: (x) => 80 - x * passo, rochaEm: rochaSempre })
const degrau = (baixos) => ({
  alturaEm: (x, z) => (baixos.some(([a, b]) => a === x && b === z) ? 79 : 80),
  rochaEm: rochaSempre,
})
/** O degrau fechado que os testes de plano usam. */
const mundoDeTeste = () => degrau([[1, 0]])

describe('direcaoDaDescida', () => {
  it('não acha direção nenhuma no platô', () => {
    expect(direcaoDaDescida(planalto.alturaEm, 0, 0)).toBeNull()
  })

  it('aponta para o vizinho mais baixo', () => {
    expect(direcaoDaDescida(rampa(1).alturaEm, 0, 0)).toEqual([1, 0])
  })
})

describe('ehCandidata — a grade que impede duas cachoeiras de se cruzarem', () => {
  const hash = (a, b, c) =>
    (((Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453) % 1) + 1) % 1

  const candidatasEm = (raio) => {
    const saida = []
    for (let x = -raio; x <= raio; x++) {
      for (let z = -raio; z <= raio; z++) if (ehCandidata(hash, x, z)) saida.push([x, z])
    }
    return saida
  }

  it('elege exatamente uma coluna por célula da grade', () => {
    const porCelula = new Map()
    for (const [x, z] of candidatasEm(CELULA * 3)) {
      const k = `${Math.floor(x / CELULA)},${Math.floor(z / CELULA)}`
      porCelula.set(k, (porCelula.get(k) || 0) + 1)
    }
    expect(porCelula.size).toBeGreaterThan(8)
    expect([...porCelula.values()].every((n) => n === 1)).toBe(true)
  })

  it('duas candidatas nunca ficam perto o bastante para os planos se tocarem', () => {
    const candidatas = candidatasEm(CELULA * 4)
    let menor = Infinity
    for (let i = 0; i < candidatas.length; i++) {
      for (let j = i + 1; j < candidatas.length; j++) {
        const d = Math.max(
          Math.abs(candidatas[i][0] - candidatas[j][0]),
          Math.abs(candidatas[i][1] - candidatas[j][1]),
        )
        if (d < menor) menor = d
      }
    }
    // O plano LÊ até `ALCANCE_DO_PLANO` de cada lado. Duas nascentes a duas
    // vezes isso já bastariam para uma escrever dentro do que a outra mediu —
    // e foi assim que um patamar escavou por baixo da poça do vizinho.
    expect(menor).toBeGreaterThan(2 * ALCANCE_DO_PLANO)
  })
})

describe('planoDaCachoeira', () => {
  it('recusa o platô — sem descida não há queda', () => {
    expect(planoDaCachoeira(planalto, 0, 0)).toBeNull()
  })

  it('recusa a encosta aberta — a poça vazaria pela borda', () => {
    expect(planoDaCachoeira(rampa(3), 0, 0)).toBeNull()
  })

  it('recusa quando falta rocha sob a poça — ela escorreria pra caverna', () => {
    const mundo = degrau([[1, 0]])
    const fundo = 80 + 1 - PROFUNDIDADE
    const semChao = { ...mundo, rochaEm: (x, y) => y !== fundo }
    expect(planoDaCachoeira(mundo, 0, 0)).not.toBeNull()
    expect(planoDaCachoeira(semChao, 0, 0)).toBeNull()
  })

  it('recusa quando outro lado do lábio também tem vão', () => {
    // Dois vizinhos abaixo: a fonte empataria a distância até o buraco e
    // alimentaria os dois — e o que o worldgen escreveu deixaria de ser o
    // ponto fixo da regra.
    const doisVaos = degrau([
      [1, 0],
      [0, 1],
    ])
    expect(planoDaCachoeira(doisVaos, 0, 0)).toBeNull()
  })

  it('aceita o degrau fechado e devolve a queda inteira', () => {
    const plano = planoDaCachoeira(degrau([[1, 0]]), 0, 0)
    expect(plano).not.toBeNull()
    expect(plano.direcao).toEqual([1, 0])
    expect(plano.nascente).toBe(81)
    expect(plano.lamina).toBe(81 - PROFUNDIDADE + 1)

    const agua = plano.celulas.filter((c) => c.id === ID.water)
    const caindo = plano.celulas.filter((c) => c.id === AGUA_CAINDO)
    // A poça é uma fonte por coluna do patamar, mais a nascente no lábio.
    expect(agua).toHaveLength(COMPRIMENTO * (2 * LARGURA + 1) + 1)
    expect(caindo).toHaveLength(ALTURA_DA_QUEDA)
    // E a coluna caindo é CONTÍGUA: `cachoeira.js` conta empilhado, e um furo
    // no meio partiria uma queda de oito em duas de quatro.
    const ys = caindo.map((c) => c.y).sort((a, b) => a - b)
    expect(ys[ys.length - 1] - ys[0]).toBe(ALTURA_DA_QUEDA - 1)
    expect(new Set(caindo.map((c) => `${c.x},${c.z}`)).size).toBe(1)
  })

  it('não escreve além do alcance que a grade reserva', () => {
    const plano = planoDaCachoeira(degrau([[1, 0]]), 0, 0)
    const longe = plano.celulas.filter(
      (c) => Math.max(Math.abs(c.x), Math.abs(c.z)) > ALCANCE_DO_PLANO,
    )
    expect(longe).toEqual([])
  })

  it('escava antes de encher — ordem invertida apagaria a poça', () => {
    const { celulas } = planoDaCachoeira(degrau([[1, 0]]), 0, 0)
    const ultimoAr = celulas.map((c) => c.id).lastIndexOf(AIR)
    const primeiraAgua = celulas.findIndex((c) => c.id !== AIR)
    expect(ultimoAr).toBeLessThan(primeiraAgua)
  })
})

describe('a cachoeira no mundo gerado', () => {
  const nz = createNoiseContext(1337)
  const chunks = new Map()
  const chunkDe = (cx, cz) => {
    const k = `${cx},${cz}`
    let c = chunks.get(k)
    if (!c) chunks.set(k, (c = generateChunkData(nz, cx, cz).blocks))
    return c
  }
  const blocoEm = (x, y, z) => {
    if (y < 0 || y >= WORLD_HEIGHT) return AIR
    return chunkDe(x >> 4, z >> 4)[localIndex(x & 15, y, z & 15)]
  }

  // Uma serra conhecida da semente 1337: a cachoeira mais perto da origem cai
  // em (−42, 98, −115), dentro deste retângulo. Medido em 13/09/2026.
  const topos = []
  for (let cx = -5; cx <= -1; cx++) {
    for (let cz = -10; cz <= -6; cz++) {
      const b = chunkDe(cx, cz)
      for (let lx = 0; lx < 16; lx++) {
        for (let lz = 0; lz < 16; lz++) {
          for (let y = 1; y < WORLD_HEIGHT - 1; y++) {
            if (b[localIndex(lx, y, lz)] !== AGUA_CAINDO) continue
            const x = cx * 16 + lx
            const z = cz * 16 + lz
            if (ehQueda(blocoEm(x, y + 1, z))) continue
            topos.push({ x, y, z, altura: alturaDaColuna(x, y, z, blocoEm) })
          }
        }
      }
    }
  }

  it('a montanha gera cachoeira', () => {
    expect(topos.length).toBeGreaterThan(0)
  })

  it('toda coluna é alta o bastante para `cachoeira.js` chamar de cachoeira', () => {
    for (const t of topos) expect(t.altura).toBeGreaterThanOrEqual(ALTURA_MINIMA)
  })

  it('a regra dos fluidos não mudaria nada ao redor delas', () => {
    const divergencias = []
    for (const t of topos) {
      for (let dx = -8; dx <= 8; dx++) {
        for (let dz = -8; dz <= 8; dz++) {
          for (let dy = -14; dy <= 4; dy++) {
            const x = t.x + dx
            const y = t.y + dy
            const z = t.z + dz
            for (const fluido of OS_FLUIDOS) {
              const ehFonte = (a, b, c) => blocoEm(a, b, c) === fluido.fonte
              const novo = proximoId(blocoEm, ehFonte, x, y, z, fluido)
              if (novo !== null) divergencias.push(`(${x},${y},${z}) -> ${novo}`)
            }
          }
        }
      }
    }
    expect(divergencias).toEqual([])
  })
})

// ── A LARGURA DA CORTINA (onda 4 do Goal 20) ────────────────────────────────
//
// ⚠️ "AS CACHOEIRAS NUNCA SÃO MAIORES QUE UM BLOCO" — e não havia constante
// errada para corrigir. A largura 1 era IMPLÍCITA: o plano escrevia UMA
// nascente e derivava dela UM par `(qx, qz)`. O que existia era uma forma que
// só sabia fazer um fio.
describe('a cortina tem largura', () => {
  it('os deslocamentos são centrados e não se repetem', () => {
    expect(deslocamentosDaQueda(1)).toEqual([0])
    expect(deslocamentosDaQueda(2)).toEqual([0, 1])
    expect(deslocamentosDaQueda(3)).toEqual([-1, 0, 1])
    for (const n of [1, 2, 3]) {
      expect(new Set(deslocamentosDaQueda(n)).size, `largura ${n} repete coluna`).toBe(n)
    }
  })

  it('largura fora da faixa é presa, e não vira cortina absurda', () => {
    expect(deslocamentosDaQueda(0)).toEqual([0])
    expect(deslocamentosDaQueda(99)).toHaveLength(LARGURA_MAXIMA_DA_QUEDA)
    expect(deslocamentosDaQueda(NaN)).toEqual([0])
  })

  it('a poça cresce COM a cortina, e sempre com folga', () => {
    // ⚠️ A PRIMEIRA VERSÃO DESTA ONDA SUBIU `LARGURA` DIRETO PARA 2 e o mundo
    // real passou a gerar ZERO cachoeiras: `baciaFechada` exige rocha sob toda
    // coluna do patamar e parede em todo o anel, e cinco colunas pedem um platô
    // que a montanha quase não tem. A poça larga só se paga quando a cortina é
    // larga de verdade.
    expect(meiaDoPatamar([0])).toBe(LARGURA)
    expect(meiaDoPatamar([-1, 0, 1])).toBe(2)
    for (const n of [1, 2, 3]) {
      const d = deslocamentosDaQueda(n)
      expect(meiaDoPatamar(d), `largura ${n} sem folga na poça`).toBeGreaterThan(
        Math.max(...d.map(Math.abs)),
      )
    }
  })

  it('com terreno que permite, a cortina SAI larga', () => {
    // ⚠️ ESTE É O TESTE DA ONDA, e ele faltava. O primeiro conjunto afirmava
    // "cada coluna tem sua nascente" — verdade também para largura 1. O mutante
    // que travava a busca em `n = 1` PASSOU: a suíte não cobrava que a cortina
    // larga chegasse a existir, só que fosse coerente se existisse.
    const plano = planoDaCachoeira(mundoDeTeste(), 0, 0, () => 0.99)
    expect(plano.largura, 'a cortina voltou a ter uma coluna só').toBeGreaterThan(1)
    expect(plano.largura).toBe(LARGURA_MAXIMA_DA_QUEDA)
  })

  it('a largura sorteada cobre a faixa inteira ao longo do mundo', () => {
    // Um `larguraDaQueda` que devolvesse sempre 1 passaria em tudo que é
    // coerência. O que se afirma aqui é VARIEDADE: a queixa do founder foi
    // justamente que todas eram iguais.
    const hash = (a, b, c) => (((Math.sin(a * 12.9 + b * 78.2 + c * 37.7) * 43758.5) % 1) + 1) % 1
    const vistas = new Set()
    for (let i = 0; i < 400; i++) vistas.add(larguraDaQueda(hash, i, i * 3))
    expect(vistas.size, 'a largura sorteada não varia').toBe(LARGURA_MAXIMA_DA_QUEDA)
  })

  it('lábio torto derruba a cortina larga para a que cabe', () => {
    // ⚠️ O MUTANTE QUE APAGOU `labioPlano` TAMBÉM PASSOU, porque todo mundo de
    // teste tinha lábio plano. Sem esta checagem, uma nascente da ponta nasce
    // ENTERRADA onde o lábio sobe, ou boiando onde ele desce — e ali a regra a
    // derruba pelo lado em vez de pela queda, abrindo um fio no lugar errado.
    const tortoNaPonta = {
      alturaEm: (x, z) => (x === 1 && z === 0 ? 79 : z === 1 ? 81 : 80),
      rochaEm: () => true,
    }
    const plano = planoDaCachoeira(tortoNaPonta, 0, 0, () => 0.99)
    expect(plano, 'o degrau deixou de gerar cachoeira').toBeTruthy()
    expect(plano.largura, 'a cortina ignorou o lábio torto').toBeLessThan(LARGURA_MAXIMA_DA_QUEDA)
    // E toda nascente pousa no mesmo lábio.
    const fontes = plano.celulas.filter((c) => c.y === plano.nascente && c.id === ID.water)
    for (const f of fontes) expect(tortoNaPonta.alturaEm(f.x, f.z)).toBe(plano.nascente - 1)
  })

  it('cada coluna da cortina tem a SUA nascente', () => {
    // ⚠️ É A REGRA DE FLUIDO QUE OBRIGA. Água que CAI não alimenta os lados:
    // quem tem buraco embaixo despenca em vez de se espalhar. Uma nascente só
    // nunca produziria duas colunas — era isso que travava a largura em 1, e a
    // resposta não é burlar a regra, é dar a cada fio a sua fonte.
    const plano = planoDaCachoeira(mundoDeTeste(), 0, 0, () => 0.99)
    expect(plano, 'o degrau de teste parou de gerar cachoeira').toBeTruthy()
    const fontes = plano.celulas.filter((c) => c.y === plano.nascente && c.id === ID.water)
    expect(fontes.length, 'menos fontes que colunas de queda').toBe(plano.largura)
  })

  it('sem semente, a cachoeira é a de antes desta onda', () => {
    // O recuo por assinatura: quem não passa hash recebe exatamente uma coluna.
    const plano = planoDaCachoeira(mundoDeTeste(), 0, 0)
    expect(plano.largura).toBe(1)
  })

  it('a cortina larga cabe dentro do alcance que a grade reserva', () => {
    // ⚠️ `MARGEM` é o que impede duas cachoeiras de se cruzarem, e a conta dela
    // foi feita para a largura 1. Se a cortina passar do alcance, dois planos
    // vizinhos podem se tocar — e o de 13/09/2026 mostrou o que isso faz: um
    // patamar escava por baixo da poça do outro.
    const plano = planoDaCachoeira(mundoDeTeste(), 0, 0, () => 0.99)
    for (const c of plano.celulas) {
      expect(Math.abs(c.x), `escreve além do alcance em x`).toBeLessThanOrEqual(ALCANCE_DO_PLANO)
      expect(Math.abs(c.z), `escreve além do alcance em z`).toBeLessThanOrEqual(ALCANCE_DO_PLANO)
    }
  })
})
