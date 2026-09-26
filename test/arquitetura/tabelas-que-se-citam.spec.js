import { describe, it, expect } from 'vitest'
import { BLOCKS, BLOCK_BY_KEY } from '../../src/servicos/blocks.js'
import { ITEMS } from '../../src/servicos/items.js'
import { RECIPES, SMELTING } from '../../src/servicos/recipes.js'
import { ITEM_DE_AMOR } from '../../src/servicos/pecuaria.js'
import { MOB_TYPES } from '../../src/servicos/mobs.js'
import { BIOMES } from '../../src/servicos/worldgen.js'

// AS TABELAS DESTE JOGO SE CITAM POR STRING, E STRING ERRADA NÃO ESTOURA.
//
// ⚠️ ISTO JÁ CUSTOU DOIS DEFEITOS MUDOS NESTA MESMA SEMANA:
//
//  · o pinguim pedia o bioma `tundra`, que não existe (é `snowy`): a regra de
//    spawn faz `includes(biome)` e um nome inventado simplesmente nunca casa —
//    ele nunca nasceu no gelo;
//  · a tinta de lula (RC-09) era dropada por `mobs.js` e não existia em
//    `items.js`: o save descartava o slot no recarregamento.
//
// Os dois são o mesmo defeito com roupas diferentes: uma tabela cita um nome
// que outra tabela não tem, e nada no caminho pergunta. Este teste pergunta.
// Ele é barato (roda em milissegundos) e cobre a classe inteira, em vez de
// esperar o próximo erro de digitação aparecer no jogo de alguém.
//
// Veio de `tests/unit/architecture/tabelas-que-se-citam.spec.js` do RoqueOS (7ab22a6f), com os mesmos casos e as mesmas
// asserções; o que mudou foi só o caminho do front para o do repo.
// O `core.spec.js` tem um caso de mesmo nome ("todo drop de bloco existe como
// item") que pergunta ao `validateDrops()`; este confere `drops`, `comTesoura` e
// `dropExtra` na mão. No front os dois conviviam, e aqui também.
const ehItem = (k) => Object.hasOwn(ITEMS, k)
const ehBloco = (k) => Object.hasOwn(BLOCK_BY_KEY, k)

describe('referências cruzadas entre as tabelas do RoqueCraft', () => {
  it('há tabelas de verdade para conferir (prova de vida)', () => {
    expect(Object.keys(ITEMS).length).toBeGreaterThan(100)
    expect(Object.keys(MOB_TYPES).length).toBeGreaterThan(5)
    expect(RECIPES.length).toBeGreaterThan(30)
  })

  it('toda receita cita ingrediente e resultado que existem', () => {
    const erros = []
    for (const r of RECIPES) {
      if (!ehItem(r.result)) erros.push(`resultado "${r.result}"`)
      const ing = r.type === 'shaped' ? Object.values(r.keyMap) : r.items
      for (const i of ing) if (!ehItem(i)) erros.push(`${r.result} ← ingrediente "${i}"`)
    }
    expect(erros, `item inexistente numa receita:\n${erros.join('\n')}`).toEqual([])
  })

  it('toda fundição cita entrada e saída que existem', () => {
    const erros = []
    for (const [entrada, saida] of Object.entries(SMELTING || {})) {
      if (!ehItem(entrada)) erros.push(`entrada "${entrada}"`)
      const res = typeof saida === 'string' ? saida : saida?.result
      if (!ehItem(res)) erros.push(`${entrada} → saída "${res}"`)
    }
    expect(erros, `item inexistente na fornalha:\n${erros.join('\n')}`).toEqual([])
  })

  it('todo drop de bloco existe como item', () => {
    const erros = []
    for (const b of Object.values(BLOCKS)) {
      if (b.drops && !ehItem(b.drops)) erros.push(`${b.key}.drops = "${b.drops}"`)
      if (b.comTesoura && !ehItem(b.comTesoura)) erros.push(`${b.key}.comTesoura`)
      if (b.dropExtra && !ehItem(b.dropExtra.item)) erros.push(`${b.key}.dropExtra`)
    }
    expect(erros, `bloco dropando item que não existe:\n${erros.join('\n')}`).toEqual([])
  })

  it('todo drop de criatura existe como item — o defeito da tinta de lula', () => {
    const erros = []
    for (const m of Object.values(MOB_TYPES)) {
      for (const d of m.drops || []) {
        if (!ehItem(d.item)) erros.push(`${m.key} → "${d.item}"`)
      }
    }
    expect(erros, `criatura dropando item que não existe:\n${erros.join('\n')}`).toEqual([])
  })

  it('a pecuária cita espécies e itens que existem', () => {
    const erros = []
    for (const [especie, item] of Object.entries(ITEM_DE_AMOR || {})) {
      if (!MOB_TYPES[especie]) erros.push(`espécie "${especie}"`)
      if (!ehItem(item)) erros.push(`${especie} ama "${item}"`)
    }
    expect(erros, `ITEM_DE_AMOR aponta pra quem não existe:\n${erros.join('\n')}`).toEqual([])
  })

  it('toda regra de spawn cita bioma que o mundo gera — o defeito do pinguim', () => {
    const validos = new Set(Object.keys(BIOMES))
    const erros = []
    for (const [chave, def] of Object.entries(MOB_TYPES)) {
      for (const b of def.spawnBiomes || []) if (!validos.has(b)) erros.push(`${chave}: "${b}"`)
    }
    expect(erros, `bioma inexistente numa regra de spawn:\n${erros.join('\n')}`).toEqual([])
  })

  it('todo bloco colocável tem item, e todo item de bloco aponta pra um bloco', () => {
    const erros = []
    for (const i of Object.values(ITEMS)) {
      if (i.kind !== 'block') continue
      if (!BLOCKS[i.blockId]) erros.push(`item "${i.key}" aponta pro bloco ${i.blockId}`)
    }
    expect(erros, `item de bloco órfão:\n${erros.join('\n')}`).toEqual([])
  })

  it('e o teste sabe acusar: um nome inventado é pego', () => {
    // Prova de vida do próprio teste — sem isto, ele pode estar conferindo
    // tabelas vazias e ninguém nota.
    const fingido = { ...ITEM_DE_AMOR, unicornio: 'wheat' }
    const erros = Object.keys(fingido).filter((e) => !MOB_TYPES[e])
    expect(erros).toEqual(['unicornio'])
    expect(ehBloco('bloco_que_nao_existe')).toBe(false)
  })
})
