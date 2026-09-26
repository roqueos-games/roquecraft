import { describe, it, expect } from 'vitest'
import { ITEMS } from '../../src/servicos/items.js'
import { MOB_TYPES } from '../../src/servicos/mobs.js'
import { BLOCKS } from '../../src/servicos/blocks.js'
import { RECIPES, SMELTING } from '../../src/servicos/recipes.js'

// ⚠️ ITEM QUE O JOGO ENTREGA TEM QUE EXISTIR (RC-09).
//
// `mobs.js` dropava `raw_fish` (peixe, pinguim) e `ink_sac` (lula, polvo) desde
// que os aquáticos entraram, e nenhum dos dois existia em `items.js`. Quem
// matasse um peixe recebia uma chave que o inventário não conhece: sem ícone,
// sem nome, e — o pior — descartada pelo save no recarregamento. O jogador
// pescava, guardava, fechava o jogo e voltava sem nada.
//
// Nada disso aparecia em lint, em build ou em teste: as duas tabelas moram em
// arquivos diferentes e ninguém as cruzava. É um defeito de PLANILHA, e o único
// jeito de pegá-lo é cruzar as planilhas.
//
// ⚠️ TETO ZERO, e não catraca. Um item fantasma não é dívida a pagar aos poucos:
// é uma promessa que o jogo já está fazendo ao jogador.

const nomes = (lista) => lista.sort().join(', ')

describe('nenhum item fantasma', () => {
  it('todo drop de criatura é um item que existe', () => {
    const fantasmas = []
    for (const [especie, def] of Object.entries(MOB_TYPES)) {
      for (const d of def.drops || []) {
        if (!ITEMS[d.item]) fantasmas.push(`${especie} → ${d.item}`)
      }
    }
    expect(fantasmas, `criatura droppando item inexistente: ${nomes(fantasmas)}`).toEqual([])
  })

  it('todo drop de bloco é um item que existe', () => {
    const fantasmas = []
    for (const b of Object.values(BLOCKS)) {
      if (b.drops && !ITEMS[b.drops]) fantasmas.push(`${b.key} → ${b.drops}`)
    }
    expect(fantasmas, `bloco droppando item inexistente: ${nomes(fantasmas)}`).toEqual([])
  })

  it('toda receita produz e consome itens que existem', () => {
    const fantasmas = []
    for (const r of RECIPES) {
      if (!ITEMS[r.result]) fantasmas.push(`receita → ${r.result}`)
      const entradas = r.type === 'shaped' ? Object.values(r.keyMap || {}) : r.items || []
      for (const i of entradas) if (i && !ITEMS[i]) fantasmas.push(`ingrediente → ${i}`)
    }
    for (const [de, para] of Object.entries(SMELTING)) {
      if (!ITEMS[de]) fantasmas.push(`fundir → ${de}`)
      if (!ITEMS[para.result]) fantasmas.push(`fundido → ${para.result}`)
    }
    expect(fantasmas, `receita com item inexistente: ${nomes([...new Set(fantasmas)])}`).toEqual([])
  })

  it('todo item tem ícone declarado — sem ícone ele é invisível no inventário', () => {
    const semIcone = Object.values(ITEMS)
      .filter((i) => !i.icon && !i.blockId)
      .map((i) => i.key)
    expect(semIcone, `item sem ícone nem bloco: ${nomes(semIcone)}`).toEqual([])
  })
})
