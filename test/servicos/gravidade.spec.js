import { describe, it, expect } from 'vitest'

// A superfície REAL do módulo: `fApp`, `fAuth`, `fAnalytics`, `fDb`, `fStore`,
// `fStorage`, `fFunctions`. Já esteve dublado como `db`/`auth`/`default`, que o
// módulo não tem -- quem importasse o nome de verdade recebia `undefined`.

import {
  CAI,
  atravessa,
  destinoDaQueda,
  vaiCair,
  passoDaQueda,
  G_POR_TIQUE,
  ARRASTO,
} from '../../src/servicos/gravidade.js'
import { ID, AIR } from '../../src/servicos/blocks.js'

/** Mundo de mentira: mapa esparso de 'x,y,z' → id, resto é ar. */
function mundo(celulas = {}) {
  return (x, y, z) => celulas[`${x},${y},${z}`] ?? AIR
}

describe('gravidade — quem cai', () => {
  it('areia, cascalho e areia vermelha caem; pedra e terra não', () => {
    expect(CAI[ID.sand]).toBe(1)
    expect(CAI[ID.gravel]).toBe(1)
    expect(CAI[ID.redSand]).toBe(1)
    expect(CAI[ID.stone]).toBe(0)
    expect(CAI[ID.dirt]).toBe(0)
    expect(CAI[AIR]).toBe(0)
  })
})

describe('gravidade — o que deixa passar', () => {
  it('ar e água deixam; pedra não', () => {
    expect(atravessa(AIR)).toBe(true)
    expect(atravessa(ID.water)).toBe(true)
    expect(atravessa(ID.stone)).toBe(false)
  })

  it('tocha e planta não seguram peso — a areia passa por cima delas', () => {
    expect(atravessa(ID.torch)).toBe(true)
    expect(atravessa(ID.tallGrass)).toBe(true)
  })

  it('LAJE SEGURA. É o caso que "não sólido = passa" erraria', () => {
    // A laje de baixo é sólida e ocupa meia célula. Se a areia atravessasse,
    // ela cairia DENTRO da laje e o jogador veria areia enterrada no degrau.
    expect(atravessa(ID.stoneSlab)).toBe(false)
  })
})

describe('gravidade — até onde cai', () => {
  it('não cai quando há chão logo abaixo', () => {
    const b = mundo({ '0,10,0': ID.sand, '0,9,0': ID.stone })
    expect(destinoDaQueda(b, 0, 10, 0)).toBe(10)
    expect(vaiCair(b, 0, 10, 0)).toBe(false)
  })

  it('cai o buraco INTEIRO, não uma célula', () => {
    // ⚠️ Este é o defeito de antes desta rodada, escrito como teste. A regra
    // velha descia exatamente um: areia em 30 sobre chão em 9 parava em 29,
    // boiando vinte blocos no ar.
    const b = mundo({ '0,30,0': ID.sand, '0,9,0': ID.stone })
    expect(destinoDaQueda(b, 0, 30, 0)).toBe(10)

    const regraVelha = (y) => y - 1
    expect(regraVelha(30)).toBe(29)
    expect(regraVelha(30)).not.toBe(destinoDaQueda(b, 0, 30, 0))
  })

  it('para em cima da laje, não dentro dela', () => {
    const b = mundo({ '0,20,0': ID.sand, '0,12,0': ID.stoneSlab })
    expect(destinoDaQueda(b, 0, 20, 0)).toBe(13)
  })

  it('afunda na água até o fundo', () => {
    const b = mundo({
      '0,20,0': ID.sand,
      '0,15,0': ID.water,
      '0,14,0': ID.water,
      '0,13,0': ID.water,
      '0,12,0': ID.stone,
    })
    expect(destinoDaQueda(b, 0, 20, 0)).toBe(13)
  })

  it('respeita o fundo do mundo', () => {
    const b = mundo({ '0,30,0': ID.sand })
    expect(destinoDaQueda(b, 0, 30, 0, 5)).toBe(5)
  })

  it('vaiCair é barato: uma leitura de vizinho, não a coluna', () => {
    const lidas = []
    const b = (x, y, z) => {
      lidas.push([x, y, z])
      return `0,10,0` === `${x},${y},${z}` ? ID.sand : AIR
    }
    expect(vaiCair(b, 0, 10, 0)).toBe(true)
    expect(lidas.length).toBe(2) // a própria célula e a de baixo
  })
})

describe('gravidade — a cascata que a regra velha não fazia', () => {
  it('pilha de cinco desmorona inteira ao perder o apoio', () => {
    // Coluna de areia de 20 a 24, apoiada num pilar de pedra em 19.
    const celulas = { '0,19,0': ID.stone, '0,5,0': ID.stone }
    for (let y = 20; y <= 24; y++) celulas[`0,${y},0`] = ID.sand
    const b = mundo(celulas)

    // Tira o pilar e deixa a cascata rodar, de baixo pra cima.
    delete celulas['0,19,0']
    for (let y = 20; y <= 24; y++) {
      const destino = destinoDaQueda(b, 0, y, 0)
      delete celulas[`0,${y},0`]
      celulas[`0,${destino},0`] = ID.sand
    }
    const pousadas = Object.keys(celulas)
      .filter((k) => celulas[k] === ID.sand)
      .map((k) => +k.split(',')[1])
      .sort((a, c) => a - c)
    expect(pousadas).toEqual([6, 7, 8, 9, 10])

    // A regra velha (uma célula, só a de baixo) teria deixado quatro no ar.
    const velha = [19, 21, 22, 23, 24]
    expect(velha).not.toEqual(pousadas)
  })
})

describe('gravidade — a física da queda', () => {
  it('um tique bate na conta do jogo original', () => {
    const { y, vy } = passoDaQueda(10, 0, 1 / 20)
    expect(vy).toBeCloseTo(-G_POR_TIQUE * ARRASTO, 6)
    expect(y).toBeCloseTo(10 - G_POR_TIQUE * ARRASTO, 6)
  })

  it('acelera: cada tique desce mais que o anterior', () => {
    let y = 100
    let vy = 0
    const quedas = []
    for (let i = 0; i < 5; i++) {
      const p = passoDaQueda(y, vy, 1 / 20)
      quedas.push(y - p.y)
      y = p.y
      vy = p.vy
    }
    for (let i = 1; i < quedas.length; i++) expect(quedas[i]).toBeGreaterThan(quedas[i - 1])
  })

  it('não depende da taxa de quadros: 20 passos de 1 tique ≈ 1 passo de 20', () => {
    let y = 100
    let vy = 0
    for (let i = 0; i < 20; i++) {
      const p = passoDaQueda(y, vy, 1 / 20)
      y = p.y
      vy = p.vy
    }
    // O teto de 8 tiques por chamada existe pra quadro travado; com 20 tiques
    // de uma vez ele CORTA, e é isso que este teste fixa — o corte é
    // deliberado, não um erro de integração.
    const grande = passoDaQueda(100, 0, 1)
    expect(grande.y).toBeGreaterThan(y)
  })

  it('quadro travado não vira teletransporte', () => {
    // Dois segundos de travada = 40 tiques. Sem teto, a areia atravessaria o
    // mundo num quadro e pousaria em qualquer lugar.
    const p = passoDaQueda(100, 0, 2)
    expect(100 - p.y).toBeLessThan(2)
  })
})

describe('gravidade — as bordas da queda', () => {
  it('bloco NO piso não cai; um acima do piso cai', () => {
    // `y <= fundo` apertado para `<`: a areia assentada EM CIMA do piso passa a
    // "cair" para dentro dele, e a coluna do mundo perde o bloco de baixo.
    const mundo = (celulas) => (x, y, z) => celulas[`${x},${y},${z}`] ?? AIR
    const noPiso = mundo({ '0,0,0': ID.sand })
    expect(vaiCair(noPiso, 0, 0, 0, 0)).toBe(false)

    const acimaDoPiso = mundo({ '0,1,0': ID.sand })
    expect(vaiCair(acimaDoPiso, 0, 1, 0, 0)).toBe(true)
  })

  it('o piso pode não ser zero, e a borda anda junto', () => {
    const mundo = (celulas) => (x, y, z) => celulas[`${x},${y},${z}`] ?? AIR
    const emCimaDoFundo = mundo({ '0,5,0': ID.sand })
    expect(vaiCair(emCimaDoFundo, 0, 5, 0, 5)).toBe(false)
    expect(vaiCair(emCimaDoFundo, 0, 5, 0, 4)).toBe(true)
  })
})

describe('gravidade — o teto do passo travado', () => {
  it('um quadro de 2 segundos não vira quarenta integrações', () => {
    // `if (tiques > 8) tiques = 8`. Afrouxado para `>=`, o teto passa a cortar
    // em 8 mesmo quando o quadro pediu exatamente 8 — e o que se perde é o
    // caso normal, não o travado: a 2,5 fps o passo já é o teto.
    //
    // O que se afirma aqui é o TETO: 2 s de quadro (40 tiques) tem que dar o
    // mesmo resultado que 0,4 s (8 tiques), senão a areia teleporta ao voltar
    // de uma aba em segundo plano.
    const travado = passoDaQueda(100, 0, 2)
    const noTeto = passoDaQueda(100, 0, 8 / 20)
    expect(travado.y).toBeCloseTo(noTeto.y, 10)
    expect(travado.vy).toBeCloseTo(noTeto.vy, 10)
  })

  it('meio tique conta como meio tique, não como nada', () => {
    // `if (resto > 0)`. Virando `>=`, o ramo do resto roda SEMPRE — inclusive
    // com resto zero, onde ele recalcula `vy` a partir de uma fração nula e
    // devolve uma velocidade que não é a integrada.
    const inteiro = passoDaQueda(100, 0, 1 / 20)
    const inteiroEMeio = passoDaQueda(100, 0, 1.5 / 20)
    expect(inteiroEMeio.y).toBeLessThan(inteiro.y)

    // Um número exato de tiques não pode ser afetado pelo ramo do resto.
    const doisTiques = passoDaQueda(100, 0, 2 / 20)
    let y = 100
    let vy = 0
    for (let i = 0; i < 2; i++) {
      vy = (vy - G_POR_TIQUE) * ARRASTO
      y += vy
    }
    expect(doisTiques.y).toBe(y)
    expect(doisTiques.vy).toBe(vy)
  })
})
