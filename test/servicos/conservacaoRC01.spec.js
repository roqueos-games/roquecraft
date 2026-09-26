import { describe, it, expect } from 'vitest'
import { devolverAoInventario, montarDireto } from '../../src/servicos/bancada.js'
import { devolverCursorAoFechar } from '../../src/servicos/fecharMobilia.js'
import { countAll } from '../../src/servicos/inventory.js'
import { RECIPES } from '../../src/servicos/recipes.js'

// ⚠️ A PERGUNTA DESTE ARQUIVO É UMA SÓ: A CONTA FECHA? (RC-01)
//
// Nada pode ser criado e nada pode ser destruído por uma operação de inventário.
// Três lugares jogavam fora o retorno de `addItem` — que é justamente quanto
// NÃO coube — e em cada um deles o item sumia em silêncio.
//
// Todo teste aqui soma o mundo inteiro antes e depois: inventário + cursor +
// grade + container. Somar só o inventário deixaria passar exatamente o defeito,
// porque o defeito é o item sair de um lado e não chegar no outro.

const vazio = (n = 36) => Array.from({ length: n }, () => null)

/** Tudo que existe, em qualquer um dos lugares, contado por chave. */
function total({ inventario = [], cursor = null, grade = [], container = [] }) {
  const soma = {}
  const por = (s) => {
    if (!s) return
    soma[s.item] = (soma[s.item] || 0) + s.count
  }
  inventario.forEach(por)
  grade.forEach(por)
  container.forEach(por)
  por(cursor)
  return soma
}

/** Inventário cheio de ferramentas: item com durabilidade não empilha. */
function cheioDeFerramentas(n = 36) {
  return Array.from({ length: n }, () => ({ item: 'wood_pickaxe', count: 1, dur: 60 }))
}

describe('nada some ao fechar a grade (RC-01)', () => {
  it('inventário cheio: a ferramenta da grade não evapora', () => {
    const antes = {
      inventario: cheioDeFerramentas(),
      cursor: null,
      grade: [{ item: 'stone_pickaxe', count: 1, dur: 132 }, ...Array(8).fill(null)],
    }
    const r = devolverAoInventario(antes)
    expect(total(r)).toEqual(total(antes))
    // E ela continua visível na grade, não num limbo.
    expect(r.grade[0]).toEqual({ item: 'stone_pickaxe', count: 1, dur: 132 })
    expect(r.coubeTudo).toBe(false)
  })

  it('inventário cheio: o que está na mão também não evapora', () => {
    const antes = {
      inventario: cheioDeFerramentas(),
      cursor: { item: 'iron_pickaxe', count: 1, dur: 251 },
      grade: vazio(9),
    }
    const r = devolverAoInventario(antes)
    expect(total(r)).toEqual(total(antes))
    expect(r.cursor).toEqual({ item: 'iron_pickaxe', count: 1, dur: 251 })
    expect(r.coubeTudo).toBe(false)
  })

  it('com espaço, tudo volta e a grade esvazia', () => {
    const antes = {
      inventario: vazio(),
      cursor: { item: 'dirt', count: 5 },
      grade: [{ item: 'oakLog', count: 3 }, ...Array(8).fill(null)],
    }
    const r = devolverAoInventario(antes)
    expect(total(r)).toEqual(total(antes))
    expect(r.cursor).toBe(null)
    expect(r.grade.every((s) => !s)).toBe(true)
    expect(r.coubeTudo).toBe(true)
  })
})

describe('montar pelo livro não empobrece o jogador (RC-01)', () => {
  const tabuas = RECIPES.find((r) => r.result === 'oakPlanks')

  it('sem espaço para o resultado, o craft é recusado INTEIRO', () => {
    // ⚠️ A PILHA DE 64 É O QUE FAZ ESTE TESTE VALER, e a primeira versão dele
    // não tinha: com UM tronco no slot, consumi-lo esvazia o slot e as tábuas
    // cabem nele — então o teste passava com e sem o conserto, e o controle de
    // mutantes mostrou isso na hora. Com 64, o slot continua ocupado por 63
    // troncos e as 4 tábuas não têm para onde ir.
    const inventario = cheioDeFerramentas(35).concat([{ item: 'oakLog', count: 64 }])
    const r = montarDireto({ inventario, receita: tabuas })
    expect(r.ok).toBe(false)
    expect(r.inventario).toBe(inventario) // o MESMO array, intocado
    expect(countAll(r.inventario).oakLog).toBe(64) // o tronco NÃO foi gasto
    expect(countAll(r.inventario).oakPlanks).toBeUndefined()
  })

  it('o ingrediente consumido é que abre o espaço, e isso continua valendo', () => {
    // 35 ferramentas + 1 slot com tronco. Consumir o tronco libera o slot, e as
    // tábuas cabem nele. Conferir espaço ANTES da remoção reprovaria um craft
    // que é perfeitamente possível.
    const inventario = cheioDeFerramentas(35).concat([{ item: 'oakLog', count: 1 }])
    const r = montarDireto({ inventario, receita: tabuas })
    expect(r.ok).toBe(true)
    expect(countAll(r.inventario).oakPlanks).toBe(4)
  })

  it('sem ingrediente, nada acontece', () => {
    const inventario = vazio()
    const r = montarDireto({ inventario, receita: tabuas })
    expect(r.ok).toBe(false)
    expect(r.inventario).toBe(inventario)
  })
})

describe('fechar o baú com a mão cheia (RC-01)', () => {
  it('o que veio do baú volta pro baú quando o inventário está cheio', () => {
    const antes = {
      inventario: cheioDeFerramentas(),
      container: vazio(27),
      cursor: { item: 'cobblestone', count: 64 },
    }
    const r = devolverCursorAoFechar(antes)
    expect(total(r)).toEqual(total(antes))
    expect(r.cursor).toBe(null)
    expect(r.podeFechar).toBe(true)
    expect(countAll(r.container).cobblestone).toBe(64)
  })

  it('sem espaço em lugar nenhum, a janela NÃO fecha e o item fica na mão', () => {
    const antes = {
      inventario: cheioDeFerramentas(),
      container: cheioDeFerramentas(27),
      cursor: { item: 'diamond_pickaxe', count: 1, dur: 1562 },
    }
    const r = devolverCursorAoFechar(antes)
    expect(total(r)).toEqual(total(antes))
    expect(r.podeFechar).toBe(false)
    expect(r.cursor).toEqual({ item: 'diamond_pickaxe', count: 1, dur: 1562 })
  })

  it('com espaço, vai tudo pro inventário e a janela fecha', () => {
    const antes = { inventario: vazio(), container: vazio(27), cursor: { item: 'coal', count: 12 } }
    const r = devolverCursorAoFechar(antes)
    expect(total(r)).toEqual(total(antes))
    expect(r.cursor).toBe(null)
    expect(r.podeFechar).toBe(true)
    expect(countAll(r.inventario).coal).toBe(12)
  })

  it('mão vazia fecha sem mexer em nada', () => {
    const inventario = vazio()
    const container = vazio(27)
    const r = devolverCursorAoFechar({ inventario, container, cursor: null })
    expect(r.inventario).toBe(inventario)
    expect(r.container).toBe(container)
    expect(r.podeFechar).toBe(true)
  })
})
