import { describe, it, expect } from 'vitest'

// A superfície REAL do módulo: `fApp`, `fAuth`, `fAnalytics`, `fDb`, `fStore`,
// `fStorage`, `fFunctions`. Já esteve dublado como `db`/`auth`/`default`, que o
// módulo não tem -- quem importasse o nome de verdade recebia `undefined`.

import {
  ehAgua,
  ehLava,
  ehFluido,
  fluidoDe,
  nivelDe,
  idDeNivel,
  podeInundar,
  distanciasAteBuraco,
  alimentaNaDirecao,
  nivelIdeal,
  proximoId,
  viraFonte,
  encontro,
  FLUIDOS,
  TIQUES_DA_AGUA,
  TIQUES_DA_LAVA,
} from '../../src/servicos/fluidos.js'
import { ID, AIR, AGUA, LAVA, NIVEL_CAINDO, ALTURA_LIQUIDA } from '../../src/servicos/blocks.js'

const AGUA_F = FLUIDOS[AGUA]
const LAVA_F = FLUIDOS[LAVA]

/**
 * Mundo de mentira, escrito em CAMADAS de texto — uma linha por Z, uma coluna
 * por X. Muito mais legível que um mapa de coordenadas, e um cenário de água
 * errado é indistinguível de um certo quando escrito como `{'3,4,5': 21}`.
 *
 *   '#' pedra · '.' ar · '0'..'7' água daquele nível · 'v' água caindo
 *
 * ⚠️ FORA DO MAPA É PEDRA, e isto não é detalhe.
 *
 * A primeira versão devolvia ar fora do mapa, e as fitas de teste eram
 * unidimensionais — uma linha só em Z. Só que o mundo tem três eixos: a busca
 * de buraco saía da fita pelo Z, encontrava "chão ausente" logo ali, e concluía
 * que o buraco mais perto ficava a um passo de distância na direção errada.
 * Cinco testes reprovaram com o código certo.
 *
 * Uma bancada sem paredes não mede fluido nenhum: tudo vaza pela borda. Aqui a
 * borda é rocha, e o que a fita não descreve é maciço.
 */
function mundo(camadas) {
  const celulas = {}
  let maxX = 0
  let maxZ = 0
  const ys = Object.keys(camadas).map(Number)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  for (const [y, linhas] of Object.entries(camadas)) {
    linhas.forEach((linha, z) => {
      maxZ = Math.max(maxZ, z)
      ;[...linha].forEach((c, x) => {
        maxX = Math.max(maxX, x)
        if (c === '#') celulas[`${x},${y},${z}`] = ID.stone
        else if (c === '0') celulas[`${x},${y},${z}`] = ID.water
        else if (c === 'v') celulas[`${x},${y},${z}`] = idDeNivel(AGUA, NIVEL_CAINDO)
        else if (c >= '1' && c <= '7') celulas[`${x},${y},${z}`] = idDeNivel(AGUA, +c)
        else if (c === 'L') celulas[`${x},${y},${z}`] = ID.lava
        else if (c === 'l') celulas[`${x},${y},${z}`] = idDeNivel(LAVA, 2)
      })
    })
  }
  const blocoEm = (x, y, z) => {
    if (x < 0 || z < 0 || x > maxX || z > maxZ || y < minY) return ID.stone
    if (y > maxY) return AIR
    return celulas[`${x},${y},${z}`] ?? AIR
  }
  const ehFonte = (x, y, z) => blocoEm(x, y, z) === ID.water
  const ehFonteDeLava = (x, y, z) => blocoEm(x, y, z) === ID.lava
  return { blocoEm, ehFonte, ehFonteDeLava, celulas }
}

describe('fluidos — o vocabulário', () => {
  it('fonte é nível 0 e a água caindo é 8', () => {
    expect(nivelDe(ID.water)).toBe(0)
    expect(nivelDe(ID.waterFalling)).toBe(NIVEL_CAINDO)
    expect(ehAgua(ID.water)).toBe(true)
    expect(ehAgua(ID.stone)).toBe(false)
    expect(ehAgua(AIR)).toBe(false)
    expect(ehLava(ID.lava)).toBe(true)
    expect(ehLava(ID.water)).toBe(false)
    expect(fluidoDe(ID.lava)).toBe(LAVA)
    expect(fluidoDe(ID.water)).toBe(AGUA)
    expect(ehFluido(ID.lava)).toBe(true)
    expect(ehFluido(ID.dirt)).toBe(false)
  })

  it('cada nível tem a altura do original: (8 − L)/9', () => {
    for (let n = 1; n <= 7; n++) {
      expect(ALTURA_LIQUIDA[idDeNivel(AGUA, n)]).toBeCloseTo((8 - n) / 9, 5)
    }
    // A que cai enche a célula: queda d'água não tem lâmina rasa.
    expect(ALTURA_LIQUIDA[idDeNivel(AGUA, NIVEL_CAINDO)]).toBe(1)
  })

  it('o passo é o do original: cinco tiques por bloco', () => {
    expect(TIQUES_DA_AGUA).toBe(5)
  })

  it('planta é lavada, sólido não', () => {
    expect(podeInundar(AIR)).toBe(true)
    expect(podeInundar(ID.tallGrass)).toBe(true)
    expect(podeInundar(ID.torch)).toBe(true)
    expect(podeInundar(ID.stone)).toBe(false)
    expect(podeInundar(ID.stoneSlab)).toBe(false)
  })
})

describe('fluidos — quem pode descer, desce', () => {
  it('água sobre buraco NÃO se espalha pros lados', () => {
    // ⚠️ Sem esta regra a lâmina enche o andar inteiro antes de achar a
    // beirada, e ninguém reconhece isso como água.
    const m = mundo({ 1: ['.0.'], 0: ['#.#'] })
    for (let d = 0; d < 4; d++) {
      expect(alimentaNaDirecao(m.blocoEm, 1, 1, 0, d)).toBe(false)
    }
  })

  it('sem buraco à vista, alimenta pros quatro lados', () => {
    const m = mundo({ 1: ['...', '.0.', '...'], 0: ['###', '###', '###'] })
    for (let d = 0; d < 4; d++) {
      expect(alimentaNaDirecao(m.blocoEm, 1, 1, 1, d)).toBe(true)
    }
  })
})

describe('fluidos — a água acha a beirada', () => {
  it('acha o buraco e diz a que distância ele está', () => {
    // Chão em y=0 com um vão em x=3. Água em x=0. O buraco está a 3 passos
    // pelo +x e não existe pelos outros lados.
    const m = mundo({ 1: ['0....'], 0: ['###.#'] })
    const d = distanciasAteBuraco(m.blocoEm, 0, 1, 0)
    expect(d[0]).toBe(3) // +x
    expect(d[1]).toBe(Infinity) // −x
  })

  it('a busca CONTORNA: buraco atrás de uma quina ainda é achado', () => {
    // O original "considera a forma do chão em volta". Uma busca em linha reta
    // não acharia este buraco, e a água encheria o corredor inteiro.
    const m = mundo({
      1: ['0#', '.#', '..'],
      0: ['##', '##', '#.'],
    })
    const d = distanciasAteBuraco(m.blocoEm, 0, 1, 0)
    expect(d[2]).toBe(3) // +z, contornando
  })

  it('não enxerga buraco do outro lado de parede', () => {
    // Andar por cima de sólido acharia o buraco além do muro, e a água
    // escolheria uma direção por onde nunca vai passar.
    const m = mundo({ 1: ['0#..'], 0: ['##.#'] })
    const d = distanciasAteBuraco(m.blocoEm, 0, 1, 0)
    expect(d[0]).toBe(Infinity)
  })

  it('só a direção do buraco MAIS PERTO recebe', () => {
    // Buraco a 1 passo pelo +x, a 3 pelo −x. Só o +x corre.
    const m = mundo({ 1: ['...0...'], 0: ['#.#####'] })
    // fonte em x=3; buraco em x=1 (2 passos pelo −x); nada pelo +x
    expect(alimentaNaDirecao(m.blocoEm, 3, 1, 0, 1)).toBe(true) // −x
    expect(alimentaNaDirecao(m.blocoEm, 3, 1, 0, 0)).toBe(false) // +x
  })
})

describe('fluidos — o nível que cada célula deveria ter', () => {
  it('ao lado da fonte, nível 1', () => {
    const m = mundo({ 1: ['0..'], 0: ['###'] })
    expect(nivelIdeal(m.blocoEm, m.ehFonte, 1, 1, 0, AGUA_F)).toBe(1)
  })

  it('ao lado do nível 1, nível 2', () => {
    const m = mundo({ 1: ['01.'], 0: ['###'] })
    expect(nivelIdeal(m.blocoEm, m.ehFonte, 2, 1, 0, AGUA_F)).toBe(2)
  })

  it('depois do 7 acaba: a água tem alcance', () => {
    const m = mundo({ 1: ['01234567.'], 0: ['#########'] })
    expect(nivelIdeal(m.blocoEm, m.ehFonte, 8, 1, 0, AGUA_F)).toBe(-1)
  })

  it('com água em cima, a célula é COLUNA CAINDO e enche', () => {
    const m = mundo({ 2: ['0'], 1: ['.'], 0: ['#'] })
    expect(nivelIdeal(m.blocoEm, m.ehFonte, 0, 1, 0, AGUA_F)).toBe(NIVEL_CAINDO)
  })

  it('a coluna caindo alimenta o pé como se fosse fonte', () => {
    // No original a queda d'água faz poça larga no pé, não um fiozinho. É esta
    // regra: quem cai chega embaixo com força de nascente.
    const m = mundo({ 1: ['v..'], 0: ['###'] })
    expect(nivelIdeal(m.blocoEm, m.ehFonte, 1, 1, 0, AGUA_F)).toBe(1)
  })

  it('a fonte não se deriva de ninguém', () => {
    const m = mundo({ 1: ['0'], 0: ['#'] })
    expect(nivelIdeal(m.blocoEm, m.ehFonte, 0, 1, 0, AGUA_F)).toBe(0)
  })

  it('dentro de sólido não é água', () => {
    const m = mundo({ 1: ['0#'], 0: ['##'] })
    expect(nivelIdeal(m.blocoEm, m.ehFonte, 1, 1, 0, AGUA_F)).toBe(-1)
  })
})

describe('fluidos — o que escoa quando a fonte some', () => {
  it('sem fonte, o nível SOBE a cada rodada até estourar e secar', () => {
    // ⚠️ Este é o teste que garante que não existe ilha de água estável. Duas
    // células tentando se sustentar uma na outra veem o nível crescer até
    // passar de 7. Sem isso, tapar a nascente deixaria o rio parado pra sempre.
    const m = mundo({ 1: ['.12345...'], 0: ['#########'] })
    const semFonte = () => false
    for (let rodada = 0; rodada < 40; rodada++) {
      const novos = {}
      for (let x = 0; x < 9; x++) {
        const id = proximoId(m.blocoEm, semFonte, x, 1, 0, AGUA_F)
        if (id !== null) novos[`${x},1,0`] = id
      }
      Object.assign(m.celulas, novos)
    }
    for (let x = 0; x < 9; x++) expect(m.blocoEm(x, 1, 0)).toBe(AIR)
  })

  it('com fonte, o rio fica: converge, e para exatamente em sete blocos', () => {
    const m = mundo({ 1: ['0........'], 0: ['#########'] })
    let mudancas = 0
    for (let rodada = 0; rodada < 40; rodada++) {
      mudancas = 0
      for (let x = 0; x < 9; x++) {
        const id = proximoId(m.blocoEm, m.ehFonte, x, 1, 0, AGUA_F)
        if (id !== null) {
          m.celulas[`${x},1,0`] = id
          mudancas++
        }
      }
    }
    expect(mudancas).toBe(0) // convergiu: parou de remalhar
    expect(nivelDe(m.blocoEm(1, 1, 0))).toBe(1)
    expect(nivelDe(m.blocoEm(7, 1, 0))).toBe(7)
    expect(m.blocoEm(8, 1, 0)).toBe(AIR) // sete blocos, como no original
  })

  it('proximoId devolve null quando nada muda — remalhar à toa é caro', () => {
    const m = mundo({ 1: ['01'], 0: ['##'] })
    expect(proximoId(m.blocoEm, m.ehFonte, 1, 1, 0, AGUA_F)).toBe(null)
  })

  it('e NUNCA apaga o que não é água', () => {
    const m = mundo({ 1: ['#'], 0: ['#'] })
    expect(proximoId(m.blocoEm, m.ehFonte, 0, 1, 0, AGUA_F)).toBe(null)
  })
})

describe('fluidos — água infinita', () => {
  it('duas fontes lado a lado, com chão embaixo, fazem fonte no meio', () => {
    const m = mundo({ 1: ['0.0'], 0: ['###'] })
    expect(viraFonte(m.blocoEm, m.ehFonte, 1, 1, 0, AGUA_F)).toBe(true)
  })

  it('sem chão embaixo, não vira: a água cairia', () => {
    const m = mundo({ 1: ['0.0'], 0: ['#.#'] })
    expect(viraFonte(m.blocoEm, m.ehFonte, 1, 1, 0, AGUA_F)).toBe(false)
  })

  it('uma fonte só não basta', () => {
    const m = mundo({ 1: ['0..'], 0: ['###'] })
    expect(viraFonte(m.blocoEm, m.ehFonte, 1, 1, 0, AGUA_F)).toBe(false)
  })
})

describe('fluidos — a lava é outro material com a mesma regra', () => {
  it('anda de dois em dois, e por isso alcança três blocos', () => {
    expect(LAVA_F.passo).toBe(2)
    // Fonte, 2, 4, 6 — e o quarto bloco já pediria 8, que é mais que o alcance.
    const m = mundo({ 1: ['L.....'], 0: ['######'] })
    const niveis = []
    for (let rodada = 0; rodada < 20; rodada++) {
      for (let x = 0; x < 6; x++) {
        const id = proximoId(m.blocoEm, m.ehFonteDeLava, x, 1, 0, LAVA_F)
        if (id !== null) m.celulas[`${x},1,0`] = id
      }
    }
    for (let x = 0; x < 6; x++) niveis.push(nivelDe(m.blocoEm(x, 1, 0)))
    expect(niveis).toEqual([0, 2, 4, 6, -1, -1])
  })

  it('é seis vezes mais lenta que a água — é o que deixa correr dela', () => {
    expect(TIQUES_DA_AGUA).toBe(5)
    expect(TIQUES_DA_LAVA).toBe(30)
    expect(LAVA_F.tiques / AGUA_F.tiques).toBe(6)
  })

  it('lava NÃO faz fonte nova: senão qualquer poça vira fábrica de obsidiana', () => {
    const m = mundo({ 1: ['L.L'], 0: ['###'] })
    expect(viraFonte(m.blocoEm, m.ehFonteDeLava, 1, 1, 0, LAVA_F)).toBe(false)
    expect(AGUA_F.fazFonte).toBe(true)
    expect(LAVA_F.fazFonte).toBe(false)
  })

  it('um fluido não come a célula do outro — quem resolve isso é o encontro', () => {
    // ⚠️ Sem esta recusa, água e lava se sobrescreveriam em alternância, um id
    // a cada tique, pra sempre — e o chunk seria remalhado a cada troca.
    const m = mundo({ 1: ['0L'], 0: ['##'] })
    expect(nivelIdeal(m.blocoEm, m.ehFonte, 1, 1, 0, AGUA_F)).toBe(-1)
    expect(proximoId(m.blocoEm, m.ehFonte, 1, 1, 0, AGUA_F)).toBe(null)
  })
})

describe('fluidos — os três encontros', () => {
  it('lava FONTE encostada em água vira obsidiana', () => {
    const m = mundo({ 1: ['L0'], 0: ['##'] })
    expect(encontro(m.blocoEm, 0, 1, 0)).toBe(ID.obsidian)
  })

  it('lava ESCORRENDO encostada em água vira pedregulho', () => {
    // A assimetria é do original: obsidiana só de fonte é o que a torna um
    // recurso que se planeja, em vez de subproduto de qualquer respingo.
    const m = mundo({ 1: ['l0'], 0: ['##'] })
    expect(encontro(m.blocoEm, 0, 1, 0)).toBe(ID.cobblestone)
  })

  it('água com lava EM CIMA vira pedra', () => {
    const m = mundo({ 2: ['L'], 1: ['0'], 0: ['#'] })
    expect(encontro(m.blocoEm, 0, 1, 0)).toBe(ID.stone)
  })

  it('água AO LADO da lava não vira pedra — quem muda é a lava', () => {
    // As duas regras juntas fariam as duas mudarem no mesmo tique, e o
    // resultado dependeria de quem foi visitado primeiro.
    const m = mundo({ 1: ['0L'], 0: ['##'] })
    expect(encontro(m.blocoEm, 0, 1, 0)).toBe(null)
  })

  it('lava com água EMBAIXO não vira nada', () => {
    // ⚠️ Senão toda lava que escorre pra dentro d'água endureceria antes de
    // encostar, e não existiria o gesto de tapar lava com um balde d'água.
    const m = mundo({ 2: ['L'], 1: ['0'], 0: ['#'] })
    expect(encontro(m.blocoEm, 0, 2, 0)).toBe(null)
  })

  it('lava sozinha não vira nada', () => {
    const m = mundo({ 1: ['L.'], 0: ['##'] })
    expect(encontro(m.blocoEm, 0, 1, 0)).toBe(null)
  })

  it('pedra não é fluido e não participa', () => {
    const m = mundo({ 1: ['#0'], 0: ['##'] })
    expect(encontro(m.blocoEm, 0, 1, 0)).toBe(null)
  })
})
