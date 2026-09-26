import { describe, it, expect } from 'vitest'
import {
  MOEDA,
  PROFISSOES,
  NOMES_DE_PROFISSAO,
  OFERTAS_POR_ALDEAO,
  sortearOfertas,
  quantoTem,
  motivoDeRecusa,
  podeTrocar,
  fecharTroca,
  reabastecer,
  ESPERA_DO_REABASTECIMENTO,
  ofertasParaSave,
  ofertasDoSave,
} from '../../src/servicos/comercio.js'
import { ITEMS } from '../../src/servicos/items.js'
import {
  addItem,
  removeItem,
  espacoPara as espacoDoInventario,
} from '../../src/servicos/inventory.js'

// O inventário de verdade, e não um de mentira: o que se quer provar é que a
// troca respeita empilhamento e espaço, e essas contas moram em `inventory.js`.
const inv = (itens = {}) => {
  const slots = new Array(36).fill(null)
  for (const [k, n] of Object.entries(itens)) addItem(slots, k, n)
  return slots
}
const maquina = {
  remover: removeItem,
  adicionar: addItem,
  espacoPara: null, // preenchido por teste quando importa
}
const comEspaco = (slots) => ({
  ...maquina,
  espacoPara: (item) => espacoDoInventario(slots, item),
})

describe('o catálogo de profissões', () => {
  it('todo item citado numa oferta existe no catálogo de itens', () => {
    for (const [nome, def] of Object.entries(PROFISSOES)) {
      for (const o of def.ofertas) {
        for (const p of o.paga) expect(ITEMS[p.item], `${nome} paga ${p.item}`).toBeTruthy()
        expect(ITEMS[o.recebe.item], `${nome} recebe ${o.recebe.item}`).toBeTruthy()
      }
    }
  })

  it('toda profissão COMPRA e VENDE — nenhuma é um beco', () => {
    // Com só um dos lados, quem planta não compra ferro e quem minera não come.
    for (const nome of NOMES_DE_PROFISSAO) {
      const o = PROFISSOES[nome].ofertas
      expect(
        o.some((x) => x.recebe.item === MOEDA),
        `${nome} não compra nada`,
      ).toBe(true)
      expect(
        o.some((x) => x.paga.some((p) => p.item === MOEDA)),
        `${nome} não vende`,
      ).toBe(true)
    }
  })

  it('toda oferta tem estoque finito', () => {
    for (const def of Object.values(PROFISSOES)) {
      for (const o of def.ofertas) expect(o.usos).toBeGreaterThan(0)
    }
  })

  it('a esmeralda, que não tinha uso nenhum, agora é a moeda dos dois lados', () => {
    // O porquê desta fatia existir, travado num teste: `emerald` aparecia em
    // ZERO receitas e ZERO fundições.
    const citada = Object.values(PROFISSOES).flatMap((d) =>
      d.ofertas.flatMap((o) => [o.recebe.item, ...o.paga.map((p) => p.item)]),
    )
    expect(citada.filter((i) => i === MOEDA).length).toBeGreaterThan(8)
  })
})

describe('sortear as ofertas', () => {
  it('dá o número certo, sem repetir', () => {
    const o = sortearOfertas('ferreiro', () => 0.5)
    expect(o).toHaveLength(OFERTAS_POR_ALDEAO)
    expect(new Set(o.map((x) => x.recebe.item + JSON.stringify(x.paga))).size).toBe(o.length)
  })

  it('o mesmo sorteio dá as mesmas ofertas — o aldeão não muda de ideia', () => {
    const semente = () => {
      let n = 0
      return () => ((n = (n * 1103515245 + 12345) % 2147483648), n / 2147483648)
    }
    expect(sortearOfertas('clerigo', semente())).toEqual(sortearOfertas('clerigo', semente()))
  })

  it('cada oferta nasce com o estoque cheio', () => {
    for (const o of sortearOfertas('fazendeiro', () => 0.2)) expect(o.restam).toBe(o.usos)
  })

  it('quem COMPRA vem antes — a tela não dança entre duas aberturas', () => {
    const o = sortearOfertas('fazendeiro', () => 0)
    const iCompra = o.findLastIndex((x) => x.recebe.item === MOEDA)
    const iVende = o.findIndex((x) => x.recebe.item !== MOEDA)
    if (iVende >= 0 && iCompra >= 0) expect(iCompra).toBeLessThan(iVende)
  })

  it('profissão desconhecida não inventa oferta', () => {
    expect(sortearOfertas('astronauta', () => 0.5)).toEqual([])
  })

  it('a lista de pagamento é CÓPIA — trocar num aldeão não mexe no catálogo', () => {
    const o = sortearOfertas('ferreiro', () => 0)[0]
    const antes = PROFISSOES.ferreiro.ofertas.map((x) => x.paga[0].count)
    o.paga[0].count = 999
    expect(PROFISSOES.ferreiro.ofertas.map((x) => x.paga[0].count)).toEqual(antes)
  })
})

describe('fechar a troca', () => {
  const oferta = () => ({
    paga: [{ item: 'wheat', count: 18 }],
    recebe: { item: MOEDA, count: 1 },
    usos: 3,
    restam: 3,
  })

  it('conta a pilha inteira, não o slot', () => {
    const s = inv({ wheat: 100 })
    expect(quantoTem(s, 'wheat')).toBe(100)
    expect(quantoTem(s, 'stone')).toBe(0)
    expect(quantoTem(null, 'wheat')).toBe(0)
  })

  it('paga, recebe e gasta um uso', () => {
    const s = inv({ wheat: 20 })
    const o = oferta()
    expect(fecharTroca(o, s, comEspaco(s))).toEqual({ ok: true, motivo: null })
    expect(quantoTem(s, 'wheat')).toBe(2)
    expect(quantoTem(s, MOEDA)).toBe(1)
    expect(o.restam).toBe(2)
  })

  it('sem o pagamento: recusa, e NÃO tira nada nem gasta uso', () => {
    const s = inv({ wheat: 5 })
    const o = oferta()
    expect(fecharTroca(o, s, comEspaco(s))).toEqual({ ok: false, motivo: 'sem-pagamento' })
    expect(quantoTem(s, 'wheat')).toBe(5)
    expect(quantoTem(s, MOEDA)).toBe(0)
    expect(o.restam).toBe(3)
  })

  it('oferta esgotada recusa com o motivo dela', () => {
    const s = inv({ wheat: 60 })
    const o = { ...oferta(), restam: 0 }
    expect(motivoDeRecusa(o, s, null)).toBe('esgotada')
    expect(fecharTroca(o, s, comEspaco(s)).motivo).toBe('esgotada')
    expect(quantoTem(s, 'wheat')).toBe(60)
  })

  it('sem espaço para o que se recebe, o pagamento NÃO some', () => {
    // ⚠️ RC-01 de novo, de outro lado: a bancada já consumiu ingrediente e não
    // entregou nada. Aqui sumiria a esmeralda, que custa mais caro.
    const s = new Array(36).fill(null).map(() => ({ item: 'stone', count: 64 }))
    s[0] = { item: 'wheat', count: 18 }
    const o = oferta()
    const r = fecharTroca(o, s, comEspaco(s))
    expect(r).toEqual({ ok: false, motivo: 'sem-espaco' })
    expect(quantoTem(s, 'wheat')).toBe(18)
    expect(o.restam).toBe(3)
  })

  it('podeTrocar concorda com motivoDeRecusa', () => {
    const s = inv({ wheat: 20 })
    expect(podeTrocar(oferta(), s, (i) => espacoDoInventario(s, i))).toBe(true)
    expect(podeTrocar(null, s, null)).toBe(false)
    expect(motivoDeRecusa(null, s, null)).toBe('sem-oferta')
  })

  it('uma oferta com dois pagamentos exige os dois', () => {
    const o = {
      paga: [
        { item: MOEDA, count: 2 },
        { item: 'stick', count: 4 },
      ],
      recebe: { item: 'iron_ingot', count: 1 },
      usos: 2,
      restam: 2,
    }
    const s = inv({ [MOEDA]: 2 })
    expect(fecharTroca(o, s, comEspaco(s)).motivo).toBe('sem-pagamento')
    addItem(s, 'stick', 4)
    expect(fecharTroca(o, s, comEspaco(s)).ok).toBe(true)
    expect(quantoTem(s, MOEDA)).toBe(0)
    expect(quantoTem(s, 'stick')).toBe(0)
  })
})

describe('o estoque volta, devagar', () => {
  const aldeao = () => ({ ofertas: sortearOfertas('fazendeiro', () => 0.3) })

  it('com tudo em estoque, o relógio nem anda', () => {
    const a = aldeao()
    expect(reabastecer(a, 999)).toBe(0)
    expect(a.relogioDeEstoque).toBe(0)
  })

  it('esgotada volta SÓ depois da espera', () => {
    const a = aldeao()
    a.ofertas[0].restam = 0
    expect(reabastecer(a, ESPERA_DO_REABASTECIMENTO - 1)).toBe(0)
    expect(a.ofertas[0].restam).toBe(0)
    expect(reabastecer(a, 2)).toBe(1)
    expect(a.ofertas[0].restam).toBe(a.ofertas[0].usos)
  })

  it('o relógio zera quando não há o que reabastecer', () => {
    // Sem isto, esgotar uma oferta logo depois de outra voltar daria estoque
    // instantâneo — o relógio teria ficado cheio esperando.
    const a = aldeao()
    a.ofertas[0].restam = 0
    reabastecer(a, ESPERA_DO_REABASTECIMENTO - 1)
    a.ofertas[0].restam = 5
    reabastecer(a, 0.1)
    a.ofertas[1].restam = 0
    expect(reabastecer(a, 1)).toBe(0)
  })

  it('aldeão sem oferta não explode', () => {
    expect(reabastecer(null, 1)).toBe(0)
    expect(reabastecer({}, 1)).toBe(0)
  })
})

describe('save', () => {
  const semente =
    (s = 7) =>
    () => {
      s = (s * 1103515245 + 12345) % 2147483648
      return s / 2147483648
    }

  it('grava só o estoque, e reconstrói o resto', () => {
    const o = sortearOfertas('bibliotecario', semente())
    o[0].restam = 2
    const pares = ofertasParaSave(o)
    expect(pares).toEqual(o.map((x) => x.restam))
    const volta = ofertasDoSave('bibliotecario', semente(), pares)
    expect(volta.map((x) => x.recebe.item)).toEqual(o.map((x) => x.recebe.item))
    expect(volta[0].restam).toBe(2)
  })

  it('lista vazia não ocupa save', () => {
    expect(ofertasParaSave([])).toBe(null)
    expect(ofertasParaSave(null)).toBe(null)
  })

  it('save sujo não dá estoque infinito', () => {
    const volta = ofertasDoSave('ferreiro', semente(), [999, -5, 'x'])
    expect(volta[0].restam).toBe(volta[0].usos)
    expect(volta[1].restam).toBe(0)
    expect(volta[2].restam).toBe(volta[2].usos) // 'x' não é número: fica cheio
  })

  it('sem estoque gravado, o aldeão volta com tudo', () => {
    const volta = ofertasDoSave('clerigo', semente(), null)
    for (const o of volta) expect(o.restam).toBe(o.usos)
  })
})
