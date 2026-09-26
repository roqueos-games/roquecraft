import { describe, it, expect } from 'vitest'
import {
  ehQueda,
  alturaDaColuna,
  acharQuedas,
  pesoDaAltura,
  pesoDaDistancia,
  forcaDaCachoeira,
  quedaDominante,
  ALTURA_MINIMA,
  ALTURA_DE_SATURACAO,
  RAIO_DA_BUSCA,
} from '../../src/servicos/cachoeira.js'
import { ID, AIR, BLOCK_BY_KEY } from '../../src/servicos/blocks.js'

// ⚠️ O QUE ESTE ARQUIVO SEGURA: a escala da cachoeira.
//
// A simulação de queda já existia; o que faltava era ela ser ouvida. E o jeito
// óbvio de ouvir — contar células de água caindo — erra por dois lados de uma
// vez: uma cortina larga (represa vazando por dez blocos de beirada) é UMA
// cachoeira com dezenas de células, e uma queda de vinte blocos é uma cachoeira
// com vinte células empilhadas, mas pesa muito mais que uma de três.
//
// O que separa as duas coisas é a ALTURA da coluna. Este arquivo é a prova de
// que a conta mede isso, e não o volume de água na tela.

const CAINDO = BLOCK_BY_KEY.waterFalling.id
const FONTE = ID.water
const PEDRA = BLOCK_BY_KEY.stone.id

/** Mundo de mentira: um dicionário de células, ar em tudo que falta. */
const mundoDe = (mapa) => (x, y, z) => mapa[`${x},${y},${z}`] ?? AIR

/** Uma coluna caindo de `altura` blocos, com o topo em `y`. */
function coluna(x, y, z, altura, mapa = {}) {
  for (let i = 0; i < altura; i++) mapa[`${x},${y - i},${z}`] = CAINDO
  return mapa
}

describe('ehQueda: só a coluna CAINDO, não qualquer água', () => {
  it('a água caindo é queda', () => {
    expect(ehQueda(CAINDO)).toBe(true)
  })

  it('a FONTE não é queda: lago parado não faz barulho de cachoeira', () => {
    expect(ehQueda(FONTE)).toBe(false)
  })

  it('a lâmina que escorre não é queda: rio raso também não', () => {
    // Sem esta distinção qualquer praia viraria Iguaçu.
    const laminas = Object.values(BLOCK_BY_KEY).filter((b) => /^waterFlow\d/.test(b.key))
    expect(laminas.length, 'o jogo precisa ter lâminas de água').toBeGreaterThan(4)
    for (const l of laminas) expect(ehQueda(l.id), l.key).toBe(false)
  })

  it('ar, pedra e lava não são queda d água', () => {
    expect(ehQueda(AIR)).toBe(false)
    expect(ehQueda(PEDRA)).toBe(false)
    expect(ehQueda(ID.lava)).toBe(false)
  })

  it('LAVA CAINDO também não: ela cai igual, e não é água', () => {
    // ⚠️ Este é o teste que faltava, e um mutante mostrou. Eu checava só a lava
    // FONTE — e a lava caindo tem o mesmo nível de "coluna caindo" que a água.
    // Sem o `ehAgua`, uma catarata de lava tocaria o leito de cachoeira: som de
    // riacho saindo de um rio de fogo.
    const lavaCaindo = BLOCK_BY_KEY.lavaFalling
    expect(lavaCaindo, 'o jogo precisa ter lava caindo').toBeTruthy()
    expect(ehQueda(lavaCaindo.id)).toBe(false)
  })
})

describe('alturaDaColuna: conta empilhado, e para no primeiro buraco', () => {
  it('conta a coluna inteira de cima pra baixo', () => {
    expect(alturaDaColuna(0, 70, 0, mundoDe(coluna(0, 70, 0, 9)))).toBe(9)
  })

  it('para no primeiro não-queda: escadinha não vira paredão', () => {
    // Duas quedas separadas por uma saliência são DUAS quedas. Somar daria a
    // uma escadinha o peso de um paredão.
    const m = coluna(0, 70, 0, 3)
    coluna(0, 66, 0, 5, m) // outra coluna, 1 bloco abaixo, separada
    expect(alturaDaColuna(0, 70, 0, mundoDe(m))).toBe(3)
  })

  it('célula que não é queda tem altura zero', () => {
    expect(alturaDaColuna(0, 70, 0, mundoDe({ '0,70,0': FONTE }))).toBe(0)
  })
})

describe('acharQuedas: só o TOPO de cada coluna entra', () => {
  it('uma queda de dez blocos conta UMA vez, e não dez', () => {
    // Varrendo tudo, a mesma água contaria dez cachoeiras.
    const q = acharQuedas({
      jogador: { x: 0.5, y: 66, z: 0.5 },
      blocoEm: mundoDe(coluna(0, 70, 0, 10)),
    })
    expect(q).toHaveLength(1)
    expect(q[0].altura).toBe(10)
    expect(q[0]).toMatchObject({ x: 0, y: 70, z: 0 })
  })

  it('a base é o pé da coluna, e não o topo', () => {
    const q = acharQuedas({
      jogador: { x: 0.5, y: 66, z: 0.5 },
      blocoEm: mundoDe(coluna(0, 70, 0, 6)),
    })
    expect(q[0].base).toEqual({ x: 0, y: 65, z: 0 })
  })

  it('goteira NÃO entra: abaixo da altura mínima é pinga, não cachoeira', () => {
    const q = acharQuedas({
      jogador: { x: 0.5, y: 70, z: 0.5 },
      blocoEm: mundoDe(coluna(0, 71, 0, ALTURA_MINIMA - 1)),
    })
    expect(q).toEqual([])
  })

  it('exatamente na altura mínima já conta', () => {
    const q = acharQuedas({
      jogador: { x: 0.5, y: 70, z: 0.5 },
      blocoEm: mundoDe(coluna(0, 71, 0, ALTURA_MINIMA)),
    })
    expect(q).toHaveLength(1)
  })

  it('uma CORTINA de colunas lado a lado devolve uma por coluna', () => {
    const m = {}
    for (let x = 0; x < 5; x++) coluna(x, 70, 0, 6, m)
    const q = acharQuedas({ jogador: { x: 2.5, y: 66, z: 0.5 }, blocoEm: mundoDe(m) })
    expect(q).toHaveLength(5)
    expect(q.every((c) => c.altura === 6)).toBe(true)
  })

  it('o que está fora do raio não entra', () => {
    const longe = RAIO_DA_BUSCA + 6
    const q = acharQuedas({
      jogador: { x: 0.5, y: 70, z: 0.5 },
      blocoEm: mundoDe(coluna(longe, 71, 0, 8)),
    })
    expect(q).toEqual([])
  })
})

describe('pesoDaAltura: a escala satura', () => {
  it('a queda mínima pesa zero, e a saturada pesa um', () => {
    expect(pesoDaAltura(ALTURA_MINIMA)).toBe(0)
    expect(pesoDaAltura(ALTURA_DE_SATURACAO)).toBe(1)
  })

  it('cem blocos NÃO pesam mais que doze', () => {
    // Sem teto, uma queda enorme abafa tudo o mais que o jogo tem a dizer.
    expect(pesoDaAltura(100)).toBe(1)
    expect(pesoDaAltura(ALTURA_DE_SATURACAO * 3)).toBe(pesoDaAltura(ALTURA_DE_SATURACAO))
  })

  it('entre os dois, cresce: uma queda maior soa maior', () => {
    const a = pesoDaAltura(ALTURA_MINIMA + 2)
    const b = pesoDaAltura(ALTURA_MINIMA + 6)
    expect(b).toBeGreaterThan(a)
    expect(a).toBeGreaterThan(0)
  })
})

describe('pesoDaDistancia: mede até o MEIO da coluna', () => {
  it('debaixo de uma queda alta ela NÃO fica quase muda', () => {
    // Medindo pelo topo, de baixo de uma queda de 20 blocos o topo está a 20 de
    // distância — e o som sumiria justamente onde ela ensurdece.
    const alta = { x: 0, y: 80, z: 0, altura: 20 }
    const noPe = { x: 0.5, y: 61, z: 0.5 }
    expect(pesoDaDistancia(alta, noPe)).toBeGreaterThan(0.3)
  })

  it('em cima da queda, o peso é máximo', () => {
    const q = { x: 0, y: 70, z: 0, altura: 5 }
    expect(pesoDaDistancia(q, { x: 0.5, y: 68, z: 0.5 })).toBeCloseTo(1, 1)
  })

  it('no raio, zera — e não fica negativo além dele', () => {
    const q = { x: 0, y: 70, z: 0, altura: 3 }
    expect(pesoDaDistancia(q, { x: RAIO_DA_BUSCA + 0.5, y: 69, z: 0.5 })).toBe(0)
    expect(pesoDaDistancia(q, { x: 500, y: 69, z: 0.5 })).toBe(0)
  })
})

describe('forcaDaCachoeira: vence a mais forte, NÃO a soma', () => {
  const jogador = { x: 0.5, y: 66, z: 0.5 }

  it('uma cortina de dez colunas não soa dez vezes mais alto que uma', () => {
    // Somar satura na hora, e a partir daí qualquer vazamento de lago soa igual
    // ao paredão. É a escala inteira indo embora.
    const uma = coluna(0, 70, 0, 6)
    const dez = {}
    for (let x = 0; x < 10; x++) coluna(x, 70, 0, 6, dez)
    const f1 = forcaDaCachoeira({
      quedas: acharQuedas({ jogador, blocoEm: mundoDe(uma) }),
      jogador,
    })
    const f10 = forcaDaCachoeira({
      quedas: acharQuedas({ jogador, blocoEm: mundoDe(dez) }),
      jogador,
    })
    expect(f1).toBeGreaterThan(0)
    expect(f10).toBeLessThanOrEqual(1)
    expect(f10 - f1).toBeLessThan(0.3)
  })

  it('a queda ALTA manda sobre a baixa que está do lado', () => {
    const m = coluna(0, 70, 0, ALTURA_MINIMA)
    coluna(3, 78, 0, 14, m)
    const f = forcaDaCachoeira({ quedas: acharQuedas({ jogador, blocoEm: mundoDe(m) }), jogador })
    const soBaixa = forcaDaCachoeira({
      quedas: acharQuedas({ jogador, blocoEm: mundoDe(coluna(0, 70, 0, ALTURA_MINIMA)) }),
      jogador,
    })
    expect(f).toBeGreaterThan(soBaixa)
  })

  it('sem queda nenhuma, é silêncio', () => {
    expect(forcaDaCachoeira({ quedas: [], jogador })).toBe(0)
  })

  it('nunca passa de 1', () => {
    const m = {}
    for (let x = 0; x < 12; x++) coluna(x, 80, 0, 30, m)
    const f = forcaDaCachoeira({ quedas: acharQuedas({ jogador, blocoEm: mundoDe(m) }), jogador })
    expect(f).toBeLessThanOrEqual(1)
    expect(f).toBeGreaterThan(0)
  })
})

describe('quedaDominante: o borrifo sai de onde o barulho vem', () => {
  const jogador = { x: 0.5, y: 66, z: 0.5 }

  it('é a MESMA queda que define a força', () => {
    // Se as duas contas divergissem, o jogador veria espuma num canto e ouviria
    // a queda no outro.
    const m = coluna(0, 70, 0, ALTURA_MINIMA)
    coluna(4, 80, 0, 16, m)
    const quedas = acharQuedas({ jogador, blocoEm: mundoDe(m) })
    const dom = quedaDominante({ quedas, jogador })
    expect(dom.x).toBe(4)
    expect(dom.forca).toBeCloseTo(forcaDaCachoeira({ quedas, jogador }), 9)
  })

  it('sem queda audível, não há de onde borrifar', () => {
    expect(quedaDominante({ quedas: [], jogador })).toBe(null)
  })
})

describe('cachoeira — o desempate e o silêncio', () => {
  const queda = (over = {}) => ({ x: 0, y: 40, z: 0, altura: 6, ...over })

  it('duas quedas iguais: manda a PRIMEIRA, não a última', () => {
    // `g > forte` afrouxado para `>=` troca o desempate: a última da lista
    // ganha. Como a ordem da varredura é a do laço de vizinhança, o borrifo
    // passaria a saltar entre duas quedas idênticas conforme o jogador anda —
    // espuma piscando de um lado pro outro sem que nada tenha mudado no mundo.
    const jogador = { x: 0, y: 40, z: 0 }
    const primeira = queda({ marca: 'a' })
    const segunda = queda({ marca: 'b' })
    const dominante = quedaDominante({ quedas: [primeira, segunda], jogador })
    expect(dominante.marca).toBe('a')
  })

  it('queda fora do raio não vira som nem espuma', () => {
    // `forte > 0` afrouxado para `>=` devolve uma queda de força ZERO como se
    // fosse a dominante: o borrifo nasce numa cachoeira que o jogador não
    // alcança, e o som toca no volume zero mas o efeito visual aparece.
    const jogador = { x: 0, y: 40, z: 0 }
    const longe = queda({ x: 500, z: 500, marca: 'longe' })
    expect(quedaDominante({ quedas: [longe], jogador })).toBeNull()
    expect(forcaDaCachoeira({ quedas: [longe], jogador })).toBe(0)
  })

  it('sem queda nenhuma, silêncio', () => {
    const jogador = { x: 0, y: 40, z: 0 }
    expect(quedaDominante({ quedas: [], jogador })).toBeNull()
    expect(forcaDaCachoeira({ quedas: [], jogador })).toBe(0)
  })

  it('a queda MAIS forte manda, mesmo chegando por último', () => {
    const jogador = { x: 0, y: 40, z: 0 }
    const fraca = queda({ altura: ALTURA_MINIMA, marca: 'fraca' })
    const forte = queda({ altura: ALTURA_DE_SATURACAO, marca: 'forte' })
    expect(quedaDominante({ quedas: [fraca, forte], jogador }).marca).toBe('forte')
  })
})
