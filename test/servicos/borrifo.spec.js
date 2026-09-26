import { describe, it, expect } from 'vitest'
import {
  quantasNascem,
  nascerBorrifo,
  passoDoBorrifo,
  opacidadeDa,
  juntar,
  TETO,
  TAXA_MAXIMA,
  VIDA,
} from '../../src/servicos/borrifo.js'

// ⚠️ BORRIFO NÃO É ESTILHAÇO, e este arquivo existe pra segurar a diferença.
//
// O caco de bloco quebrado quica, perde energia no atrito e PARA no chão — e
// isso é o certo pra ele. Gota de água não: ela sobe, abre e some no ar. Com a
// física do caco, o pé da cachoeira acumularia cubinhos brancos parados no chão
// pra sempre, que é a cara de um defeito e não de uma névoa.

/**
 * ⚠️ UM GERADOR NOVO A CADA CHAMADA, e isto foi o que um mutante me ensinou.
 *
 * A primeira versão era um contador COMPARTILHADO entre todas as chamadas. Dois
 * `nascerBorrifo` seguidos recebiam trechos DIFERENTES da sequência — então
 * comparar a média de um com a do outro comparava dois sorteios, não duas
 * forças. O mutante que apagava o impulso (fazendo queda grande e pequena
 * levantarem a mesma névoa) sobreviveu por causa disso: o ruído do sorteio
 * cobria a diferença que o teste dizia medir.
 *
 * Com um gerador novo por chamada, a única coisa que muda entre as duas é a
 * força — que é o que o teste afirma.
 */
const semAcaso = () => {
  let i = 0
  return () => ((i++ * 37) % 100) / 100
}

const BASE = { x: 10, y: 60, z: -4 }

describe('quantasNascem: a cachoeira fraca também borrifa', () => {
  it('a sobra se acumula entre quadros', () => {
    // ⚠️ Com `Math.round` por quadro, uma taxa de 0,4 gota arredonda pra zero
    // PRA SEMPRE, e a cachoeira fraca nunca borrifa. Guardar a sobra é o que
    // transforma "0,4 por quadro" em "2 a cada 5 quadros".
    let sobra = 0
    let total = 0
    for (let i = 0; i < 60; i++) {
      const r = quantasNascem(0.1, 1 / 60, sobra)
      total += r.quantas
      sobra = r.sobra
    }
    expect(total).toBeGreaterThan(0)
    expect(total).toBeCloseTo(0.1 * TAXA_MAXIMA, 0)
  })

  it('a taxa segue a FORÇA da queda', () => {
    const fraca = quantasNascem(0.2, 1, 0).quantas
    const forte = quantasNascem(1, 1, 0).quantas
    expect(forte).toBeGreaterThan(fraca)
    expect(forte).toBe(TAXA_MAXIMA)
  })

  it('sem queda, nenhuma gota', () => {
    expect(quantasNascem(0, 1, 0).quantas).toBe(0)
  })

  it('força fora da faixa não estoura a taxa', () => {
    expect(quantasNascem(9, 1, 0).quantas).toBe(TAXA_MAXIMA)
    expect(quantasNascem(-2, 1, 0).quantas).toBe(0)
  })
})

describe('nascerBorrifo: nasce em ANEL, e não num ponto', () => {
  it('as gotas se espalham em volta da base', () => {
    // Borrifo que sobe reto de um pixel só parece fumaça de chaminé.
    const g = nascerBorrifo(BASE, 40, 0.8, semAcaso())
    const xs = new Set(g.map((d) => Math.round(d.x * 10)))
    const zs = new Set(g.map((d) => Math.round(d.z * 10)))
    expect(xs.size).toBeGreaterThan(3)
    expect(zs.size).toBeGreaterThan(3)
  })

  it('todas nascem PARA CIMA: gota que nasce descendo some antes de aparecer', () => {
    for (const d of nascerBorrifo(BASE, 30, 0.5, semAcaso())) {
      expect(d.vy).toBeGreaterThan(0)
    }
  })

  it('a velocidade horizontal aponta PRA FORA do centro', () => {
    // Água que bate no chão sai pra fora. Pra dentro seria implosão.
    for (const d of nascerBorrifo(BASE, 30, 0.5, semAcaso())) {
      const dx = d.x - (BASE.x + 0.5)
      const dz = d.z - (BASE.z + 0.5)
      expect(dx * d.vx + dz * d.vz, 'gota indo pra dentro do anel').toBeGreaterThan(0)
    }
  })

  it('a queda GRANDE levanta névoa mais alta que a pequena', () => {
    const media = (f) => {
      const g = nascerBorrifo(BASE, 30, f, semAcaso())
      return g.reduce((a, d) => a + d.vy, 0) / g.length
    }
    expect(media(1)).toBeGreaterThan(media(0.15))
  })

  it('a vida fica na faixa declarada', () => {
    for (const d of nascerBorrifo(BASE, 30, 0.5, semAcaso())) {
      expect(d.vida).toBeGreaterThanOrEqual(VIDA.min)
      expect(d.vida).toBeLessThanOrEqual(VIDA.max)
    }
  })
})

describe('passoDoBorrifo: sobe, abre, e some', () => {
  it('a gota MORRE no fim da vida, em vez de ficar', () => {
    let g = nascerBorrifo(BASE, 10, 0.5, semAcaso())
    for (let i = 0; i < 200; i++) g = passoDoBorrifo(g, 1 / 60)
    expect(g).toHaveLength(0)
  })

  it('NÃO quica e NÃO repousa: não sobra cubinho parado no chão', () => {
    // Este é o defeito que a física de estilhaço traria pra cá.
    let g = nascerBorrifo(BASE, 20, 0.9, semAcaso())
    const alturas = []
    for (let i = 0; i < 40; i++) {
      g = passoDoBorrifo(g, 1 / 60)
      if (g.length) alturas.push(g[0].y)
    }
    // Nenhuma gota fica com a mesma altura dois quadros seguidos (repouso).
    let paradas = 0
    for (let i = 1; i < alturas.length; i++) if (alturas[i] === alturas[i - 1]) paradas++
    expect(paradas).toBe(0)
  })

  it('a gravidade puxa: ela sobe e depois desce', () => {
    let g = nascerBorrifo(BASE, 1, 1, () => 0.5)
    const ys = []
    for (let i = 0; i < 40 && g.length; i++) {
      g = passoDoBorrifo(g, 1 / 60)
      if (g.length) ys.push(g[0].y)
    }
    const topo = Math.max(...ys)
    expect(topo).toBeGreaterThan(ys[0])
    expect(ys[ys.length - 1]).toBeLessThan(topo)
  })

  it('o arrasto ABRE a névoa e para: ela não sai reta como cuspe', () => {
    let g = nascerBorrifo(BASE, 1, 1, () => 0.5)
    const v0 = Math.hypot(g[0].vx, g[0].vz)
    for (let i = 0; i < 20; i++) g = passoDoBorrifo(g, 1 / 60)
    expect(Math.hypot(g[0].vx, g[0].vz)).toBeLessThan(v0)
  })

  it('lista vazia não estoura', () => {
    expect(passoDoBorrifo([], 0.016)).toEqual([])
  })
})

describe('opacidadeDa: nasce cheia e apaga', () => {
  it('vai de 1 a 0 ao longo da vida', () => {
    const g = { t: 0, vida: 1 }
    expect(opacidadeDa(g)).toBe(1)
    g.t = 0.5
    expect(opacidadeDa(g)).toBeCloseTo(0.5, 6)
    g.t = 1
    expect(opacidadeDa(g)).toBe(0)
  })

  it('nunca fica negativa', () => {
    expect(opacidadeDa({ t: 9, vida: 1 })).toBe(0)
  })
})

describe('juntar: o teto não é opcional', () => {
  it('acumula enquanto cabe', () => {
    const a = nascerBorrifo(BASE, 10, 0.5, semAcaso())
    const b = nascerBorrifo(BASE, 10, 0.5, semAcaso())
    expect(juntar(a, b)).toHaveLength(20)
  })

  it('a cachoeira é ETERNA: sem teto, um minuto parado mata o quadro', () => {
    let g = []
    for (let i = 0; i < 100; i++) g = juntar(g, nascerBorrifo(BASE, 30, 1, semAcaso()))
    expect(g).toHaveLength(TETO)
  })

  it('quando estoura, saem as MAIS VELHAS', () => {
    // Cortar as novas congelaria a névoa num instante do passado: as presas
    // iriam morrendo e nenhuma nova entraria até a lista esvaziar — o efeito
    // piscaria.
    const velhas = nascerBorrifo(BASE, TETO, 1, semAcaso()).map((d, i) => ({ ...d, marca: i }))
    const novas = nascerBorrifo(BASE, 5, 1, semAcaso()).map((d) => ({ ...d, marca: 'nova' }))
    const r = juntar(velhas, novas)
    expect(r).toHaveLength(TETO)
    expect(r.filter((d) => d.marca === 'nova')).toHaveLength(5)
    expect(r[r.length - 1].marca).toBe('nova')
  })
})

describe('borrifo — a vida e o teto', () => {
  it('a gota morre AO completar a vida, não depois dela', () => {
    // `g.t >= g.vida` apertado para `>`: a gota vive um quadro a mais com
    // opacidade zero (a opacidade é `1 - t/vida`), ou seja um quadro de
    // partícula invisível ocupando lugar no teto de 220.
    const gota = { t: 0.9, vida: 1, vx: 0, vy: 0, vz: 0, x: 0, y: 0, z: 0 }
    expect(passoDoBorrifo([gota], 0.1)).toEqual([])
  })

  it('um instante antes do fim ela ainda vive', () => {
    const gota = { t: 0.9, vida: 1, vx: 0, vy: 0, vz: 0, x: 0, y: 0, z: 0 }
    expect(passoDoBorrifo([gota], 0.05)).toHaveLength(1)
  })

  it('EXATAMENTE no teto, nada é descartado', () => {
    // `todas.length <= teto` apertado para `<`: no tamanho exato do teto a
    // lista já passa a ser cortada, e a gota mais velha some um quadro antes
    // do necessário — a névoa perde uma partícula por quadro sem motivo.
    const gotas = Array.from({ length: 3 }, (_, i) => ({ marca: i }))
    expect(juntar(gotas, [], 3)).toHaveLength(3)
    expect(juntar(gotas, [{ marca: 'nova' }], 3).map((g) => g.marca)).toEqual([1, 2, 'nova'])
  })

  it('quando estoura, saem as MAIS VELHAS', () => {
    const gotas = [{ marca: 'velha' }, { marca: 'meio' }]
    expect(juntar(gotas, [{ marca: 'nova' }], 2).map((g) => g.marca)).toEqual(['meio', 'nova'])
  })
})
