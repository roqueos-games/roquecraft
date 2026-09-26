import { describe, it, expect } from 'vitest'
import {
  PECAS,
  ARMADURAS,
  MATERIAIS_DE_ARMADURA,
  FONTES_PROTEGIDAS,
  pecaDe,
  criarArmadura,
  pontosDe,
  reduzirDano,
  desgastar,
  vestir,
  tirar,
  clicarNoLugar,
  espolioDaArmadura,
  serializarArmadura,
  desserializarArmadura,
} from '../../src/servicos/armadura.js'
import { ITEMS } from '../../src/servicos/items.js'
import { RECIPES } from '../../src/servicos/recipes.js'
import { createInventory, cliqueNoInventario } from '../../src/servicos/inventory.js'
import {
  createSurvivalState,
  serializeSurvival,
  deserializeSurvival,
  respawn,
} from '../../src/servicos/survival.js'
import { espolioDaMorte } from '../../src/servicos/morte.js'

// A ARMADURA — Goal 21, onda 3.1. Três materiais × quatro peças; 4% por ponto
// até 80%; mora em `survival.armadura`, cai com a morte.

const vestido = (...pecas) => {
  const a = criarArmadura()
  for (const k of pecas) a[pecaDe(k).peca] = { item: k, dur: pecaDe(k).durabilidade }
  return a
}

describe('o catálogo', () => {
  it('são 12 peças, todas item, todas com receita e nome', () => {
    expect(ARMADURAS).toHaveLength(12)
    for (const a of ARMADURAS) {
      expect(ITEMS[a.key], `${a.key} não é item`).toBeTruthy()
      expect(ITEMS[a.key].kind).toBe('armor')
      expect(ITEMS[a.key].stack).toBe(1)
      expect(ITEMS[a.key].durability).toBe(a.durabilidade)
      expect(
        RECIPES.some((r) => r.result === a.key),
        `${a.key} sem receita`,
      ).toBe(true)
      expect(pecaDe(a.key)).toBe(a)
    }
    expect(pecaDe('stone')).toBeNull()
    expect(pecaDe(undefined)).toBeNull()
  })

  it('o conjunto completo dá 7, 15 e 20 pontos — a tabela do original', () => {
    const total = (m) => MATERIAIS_DE_ARMADURA[m].pontos.reduce((a, b) => a + b, 0)
    expect(total('leather')).toBe(7)
    expect(total('iron')).toBe(15)
    expect(total('diamond')).toBe(20)
  })

  it('a receita usa o ingrediente do material e a forma da peça', () => {
    const r = RECIPES.find((r) => r.result === 'iron_chestplate')
    expect(r.pattern).toEqual(['M M', 'MMM', 'MMM'])
    expect(r.keyMap).toEqual({ M: 'iron_ingot' })
    expect(RECIPES.find((r) => r.result === 'leather_boots').keyMap).toEqual({ M: 'leather' })
  })
})

describe('quanto protege', () => {
  it('sem nada, o dano passa inteiro; com 20 pontos, passa 20%', () => {
    expect(pontosDe(criarArmadura())).toBe(0)
    expect(reduzirDano(10, 0)).toBe(10)
    expect(reduzirDano(10, 20)).toBeCloseTo(2, 6)
    expect(reduzirDano(10, 40), 'o teto é 20 pontos').toBeCloseTo(2, 6)
    expect(reduzirDano(10, 7)).toBeCloseTo(7.2, 6)
  })

  it('o conjunto de diamante inteiro soma 20', () => {
    const a = vestido('diamond_helmet', 'diamond_chestplate', 'diamond_leggings', 'diamond_boots')
    expect(pontosDe(a)).toBe(20)
    expect(pontosDe(vestido('leather_boots'))).toBe(1)
  })

  it('protege do bicho, da flecha, do estouro e do cacto; não da queda nem do afogamento', () => {
    for (const f of ['mob', 'arrow', 'explosion', 'cactus'])
      expect(FONTES_PROTEGIDAS.has(f)).toBe(true)
    for (const f of ['fall', 'drown', 'starve', 'magic', 'lava'])
      expect(FONTES_PROTEGIDAS.has(f)).toBe(false)
  })

  it('cada golpe amenizado gasta cada peça (1, ou dano/4), e a peça que zera SOME', () => {
    const a = vestido('leather_helmet', 'leather_boots')
    expect(desgastar(a, 3)).toEqual([])
    expect(a.helmet.dur).toBe(54)
    expect(a.boots.dur).toBe(64)
    expect(desgastar(a, 12)).toEqual([])
    expect(a.helmet.dur).toBe(51)
    a.boots.dur = 1
    expect(desgastar(a, 1)).toEqual(['leather_boots'])
    expect(a.boots).toBeNull()
    expect(a.helmet.dur).toBe(50)
  })
})

describe('vestir e tirar', () => {
  it('vestir tira do slot e põe no lugar; a que estava lá volta para o slot', () => {
    const slots = createInventory()
    slots[3] = { item: 'iron_helmet', count: 1, dur: 100 }
    const r1 = vestir(slots, criarArmadura(), 3)
    expect(r1.armadura.helmet).toEqual({ item: 'iron_helmet', dur: 100 })
    expect(r1.slots[3]).toBeNull()
    r1.slots[5] = { item: 'diamond_helmet', count: 1 }
    const r2 = vestir(r1.slots, r1.armadura, 5)
    expect(r2.armadura.helmet).toEqual({ item: 'diamond_helmet', dur: 363 })
    expect(r2.slots[5]).toEqual({ item: 'iron_helmet', count: 1, dur: 100 })
    expect(vestir(r2.slots, r2.armadura, 3), 'slot vazio não veste').toBeNull()
    r2.slots[3] = { item: 'stone', count: 4 }
    expect(vestir(r2.slots, r2.armadura, 3), 'pedra não veste').toBeNull()
  })

  it('tirar vai para o primeiro slot livre; sem lugar, não tira (a peça nunca evapora)', () => {
    const cheio = createInventory().map(() => ({ item: 'stone', count: 1 }))
    const a = vestido('iron_boots')
    expect(tirar(cheio, a, 'boots')).toBeNull()
    cheio[20] = null
    const r = tirar(cheio, a, 'boots')
    expect(r.slots[20]).toEqual({ item: 'iron_boots', count: 1, dur: 195 })
    expect(r.armadura.boots).toBeNull()
    expect(tirar(r.slots, r.armadura, 'boots'), 'lugar vazio').toBeNull()
  })

  it('⚠️ o lugar da armadura funciona com o CURSOR — o gesto do toque', () => {
    // Sem shift no celular: pegar a peça no slot (cursor) e pôr no lugar.
    const a = criarArmadura()
    const cursor = { item: 'iron_helmet', count: 1, dur: 100 }
    const veste = clicarNoLugar(a, 'helmet', cursor)
    expect(veste.armadura.helmet).toEqual({ item: 'iron_helmet', dur: 100 })
    expect(veste.cursor).toBeNull()
    // Cursor com outra peça DO MESMO lugar: troca.
    const troca = clicarNoLugar(veste.armadura, 'helmet', { item: 'diamond_helmet', count: 1 })
    expect(troca.armadura.helmet).toEqual({ item: 'diamond_helmet', dur: 363 })
    expect(troca.cursor).toEqual({ item: 'iron_helmet', count: 1, dur: 100 })
    // Cursor vazio: pega a peça vestida.
    const pega = clicarNoLugar(troca.armadura, 'helmet', null)
    expect(pega.armadura.helmet).toBeNull()
    expect(pega.cursor.item).toBe('diamond_helmet')
    // Bota no lugar do capacete, pedra, ou lugar vazio com cursor vazio: nada.
    expect(clicarNoLugar(a, 'helmet', { item: 'iron_boots', count: 1 })).toBeNull()
    expect(clicarNoLugar(a, 'helmet', { item: 'stone', count: 1 })).toBeNull()
    expect(clicarNoLugar(a, 'helmet', null)).toBeNull()
  })

  it('pelo clique do inventário: shift+clique VESTE, o lugar conversa com o cursor', () => {
    const slots = createInventory()
    slots[9] = { item: 'leather_chestplate', count: 1 }
    const armadura = criarArmadura()
    const v = cliqueNoInventario(slots, { index: 9, button: 'shift', cursor: null, armadura })
    expect(v.armadura.chestplate.item).toBe('leather_chestplate')
    expect(v.slots[9]).toBeNull()
    expect(v.salvar).toBe(true)
    const t = cliqueNoInventario(v.slots, {
      index: 'chestplate',
      button: 'left',
      cursor: null,
      armadura: v.armadura,
    })
    expect(t.armadura.chestplate).toBeNull()
    expect(t.cursor.item, 'a peça foi para o cursor').toBe('leather_chestplate')
    expect(t.slots).toBe(v.slots)
    // Pedra no cursor: o lugar não aceita.
    const pedra = { item: 'stone', count: 1 }
    expect(
      cliqueNoInventario(v.slots, {
        index: 'chestplate',
        button: 'left',
        cursor: pedra,
        armadura: v.armadura,
      }),
    ).toBeNull()
    // Shift num item comum continua sendo o quickMove de sempre.
    slots[0] = { item: 'stone', count: 3 }
    const q = cliqueNoInventario(slots, { index: 0, button: 'shift', cursor: null, armadura })
    expect(q.armadura).toBeUndefined()
    expect(q.slots[0]).toBeNull()
  })
})

describe('o corpo e o save', () => {
  it('nasce sem armadura, grava só o que veste, e volta igual', () => {
    const s = createSurvivalState()
    expect(s.armadura).toEqual(criarArmadura())
    s.armadura = vestido('iron_helmet', 'diamond_boots')
    s.armadura.boots.dur = 7
    const data = JSON.parse(JSON.stringify(serializeSurvival(s)))
    expect(Object.keys(data.armadura)).toEqual(['helmet', 'boots'])
    const volta = deserializeSurvival(data)
    expect(volta.armadura.helmet).toEqual({ item: 'iron_helmet', dur: 165 })
    expect(volta.armadura.boots).toEqual({ item: 'diamond_boots', dur: 7 })
    expect(volta.armadura.chestplate).toBeNull()
  })

  it('save sem armadura (v12) e save adulterado voltam limpos', () => {
    expect(deserializeSurvival({ health: 10 }).armadura).toEqual(criarArmadura())
    const torto = desserializarArmadura({
      helmet: { item: 'iron_boots' },
      boots: { item: 'stone' },
      leggings: { item: 'iron_leggings', dur: 99999 },
    })
    expect(torto.helmet, 'bota no lugar do capacete').toBeNull()
    expect(torto.boots).toBeNull()
    expect(torto.leggings.dur, 'durabilidade acima do máximo cai no máximo').toBe(225)
  })

  it('morrer larga a armadura junto com a mochila, e renascer é sem nada', () => {
    const s = createSurvivalState()
    s.armadura = vestido('iron_helmet')
    s.armadura.helmet.dur = 42
    const inv = createInventory()
    inv[0] = { item: 'stone', count: 2 }
    const espolio = espolioDaMorte(inv, { x: 1, y: 2, z: 3 }, s.armadura)
    expect(espolio.map((e) => e.item)).toEqual(['iron_helmet', 'stone'])
    expect(espolio[0].dur).toBe(42)
    expect(serializarArmadura(respawn(s).armadura)).toEqual({})
    expect(espolioDaArmadura(null, { x: 0, y: 0, z: 0 }, 0)).toEqual([])
  })

  it('PECAS é a ordem de cima para baixo', () => {
    expect(PECAS).toEqual(['helmet', 'chestplate', 'leggings', 'boots'])
  })
})
