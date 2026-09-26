import { describe, it, expect } from 'vitest'
import { espolioDaMorte, COR_DO_ESPOLIO } from '../../src/servicos/morte.js'

const ONDE = { x: 10, y: 64, z: -3 }

describe('o que cai quando o jogador morre (RC-08)', () => {
  it('a ferramenta cai com a durabilidade que tinha', () => {
    // O defeito: morrer com a picareta em 3 de 1562 devolvia uma picareta nova.
    // Morrer virava oficina, e o custo das ferramentas deixava de existir.
    const espolio = espolioDaMorte([{ item: 'diamond_pickaxe', count: 1, dur: 3 }], ONDE)
    expect(espolio).toHaveLength(1)
    expect(espolio[0].dur).toBe(3)
  })

  it('encanto e poção modificada vão junto no espólio', () => {
    const espolio = espolioDaMorte(
      [
        { item: 'diamond_sword', count: 1, dur: 9, enc: { afiacao: 3 } },
        { item: 'pocao_cura', count: 1, pocao: { nivel: 2, splash: true } },
      ],
      ONDE,
    )
    expect(espolio[0].enc).toEqual({ afiacao: 3 })
    expect(espolio[1].pocao).toEqual({ nivel: 2, splash: true })
  })

  it('durabilidade ZERO continua sendo zero, e não "ferramenta nova"', () => {
    // `|| null` no lugar de `?? null` reintroduz o defeito exatamente aqui: a
    // ferramenta na última batida vira uma ferramenta inteira.
    const espolio = espolioDaMorte([{ item: 'wood_pickaxe', count: 1, dur: 0 }], ONDE)
    expect(espolio[0].dur).toBe(0)
  })

  it('item sem durabilidade cai sem durabilidade', () => {
    const espolio = espolioDaMorte([{ item: 'cobblestone', count: 64 }], ONDE)
    expect(espolio[0].dur).toBe(null)
    expect(espolio[0].count).toBe(64)
  })

  it('a conta fecha: nada é criado e nada é destruído', () => {
    const inv = [
      { item: 'cobblestone', count: 64 },
      null,
      { item: 'iron_sword', count: 1, dur: 200 },
      null,
      { item: 'bread', count: 3 },
    ]
    const espolio = espolioDaMorte(inv, ONDE)
    expect(espolio).toHaveLength(3)
    const soma = (lista) =>
      lista.filter(Boolean).reduce((a, s) => ({ ...a, [s.item]: (a[s.item] || 0) + s.count }), {})
    expect(soma(espolio)).toEqual(soma(inv))
  })

  it('cai onde o jogador morreu, meio bloco acima do pé', () => {
    const espolio = espolioDaMorte([{ item: 'dirt', count: 1 }], ONDE)
    expect(espolio[0]).toMatchObject({ x: 10, y: 64.5, z: -3, cor: COR_DO_ESPOLIO })
  })

  it('slot vazio, contagem zero e lixo não viram item no chão', () => {
    const espolio = espolioDaMorte(
      [null, undefined, { item: 'dirt', count: 0 }, { count: 5 }, { item: '', count: 2 }],
      ONDE,
    )
    expect(espolio).toEqual([])
  })

  it('inventário ausente não estoura', () => {
    expect(espolioDaMorte(null, ONDE)).toEqual([])
    expect(espolioDaMorte(undefined, ONDE)).toEqual([])
  })
})
