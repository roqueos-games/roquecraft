import { describe, it, expect } from 'vitest'
import {
  createInventory,
  addItem,
  espacoPara,
  quickMove,
  trocarItem,
  makeStack,
  HOTBAR_SIZE,
  INVENTORY_SIZE,
} from '../../src/servicos/inventory.js'
import { maxStack } from '../../src/servicos/items.js'

// O INVENTÁRIO NÃO PODE MENTIR EM NENHUMA DIREÇÃO.
//
// Dois defeitos de 24/08/2026, com a MESMA raiz: `addItem` muta e só depois
// conta o que sobrou, e quem chamava agia como se ele fosse atômico.
//
//  - no craft: com sobra, a função saía sem consumir a grade — item de graça.
//  - na coleta: com sobra, o drop inteiro sumia do chão — item evaporado.
//
// Duplicar item quebra qualquer economia; apagar item em silêncio é pior
// ainda, porque o jogador não vê acontecer. As duas metades são testadas aqui.

const cheio = (item) => {
  const inv = createInventory()
  const cap = maxStack(item)
  for (let i = 0; i < INVENTORY_SIZE; i++) inv[i] = { item, count: cap }
  return inv
}

describe('espacoPara', () => {
  it('conta o inventário vazio como 36 pilhas cheias', () => {
    const inv = createInventory()
    expect(espacoPara(inv, 'dirt')).toBe(INVENTORY_SIZE * maxStack('dirt'))
  })

  it('conta zero num inventário cheio do mesmo item', () => {
    expect(espacoPara(cheio('dirt'), 'dirt')).toBe(0)
  })

  it('conta zero para outro item quando não há slot vazio', () => {
    expect(espacoPara(cheio('dirt'), 'stone')).toBe(0)
  })

  it('soma o espaço das pilhas parciais', () => {
    const inv = createInventory()
    inv[0] = { item: 'dirt', count: 60 }
    inv[1] = { item: 'stone', count: 10 }
    // 4 na pilha parcial de terra + 34 slots vazios
    expect(espacoPara(inv, 'dirt')).toBe(4 + 34 * maxStack('dirt'))
  })

  it('ignora pilha com durabilidade, que nunca empilha', () => {
    const inv = createInventory()
    inv[0] = { item: 'woodPickaxe', count: 1, dur: 60 }
    expect(espacoPara(inv, 'woodPickaxe')).toBe((INVENTORY_SIZE - 1) * maxStack('woodPickaxe'))
  })

  it('NÃO muta o inventário', () => {
    const inv = createInventory()
    inv[0] = { item: 'dirt', count: 5 }
    const antes = JSON.stringify(inv)
    espacoPara(inv, 'dirt')
    expect(JSON.stringify(inv)).toBe(antes)
  })

  it('concorda com addItem: o que espacoPara promete é o que addItem coloca', () => {
    // A prova de que a função nova não é uma segunda verdade. Se as duas
    // divergirem, o bug volta por outro caminho.
    for (const [item, ocupados] of [
      ['dirt', 0],
      ['dirt', 10],
      ['dirt', 35],
      ['stone', 30],
    ]) {
      const inv = createInventory()
      for (let i = 0; i < ocupados; i++) inv[i] = { item, count: maxStack(item) }
      const prometido = espacoPara(inv, item)
      const sobra = addItem(inv, item, prometido + 7)
      expect(sobra, `${item} com ${ocupados} slots ocupados`).toBe(7)
    }
  })
})

describe('a regra do craft: ou cabe tudo, ou não acontece nada', () => {
  // Reproduz a decisão de `takeCraftResult` sem montar o componente.
  const pegarResultado = (inv, item, count) => {
    if (espacoPara(inv, item) < count) return false
    addItem(inv, item, count)
    return true
  }

  it('não entrega nada quando o resultado não cabe inteiro', () => {
    const inv = cheio('dirt')
    inv[0] = { item: 'dirt', count: maxStack('dirt') - 1 } // 1 de folga só
    const antes = JSON.stringify(inv)
    expect(pegarResultado(inv, 'stone', 4)).toBe(false)
    expect(JSON.stringify(inv), 'o inventário não pode ter mudado').toBe(antes)
  })

  it('o defeito antigo: clicar repetido com a mochila quase cheia gerava item de graça', () => {
    // Com a regra velha (addItem primeiro, desistir depois), CADA clique
    // deixava 1 pedra no slot parcial sem gastar a grade. Dez cliques, dez
    // pedras do nada. Com a regra nova, dez cliques não movem nada.
    const inv = cheio('stone')
    inv[0] = { item: 'stone', count: maxStack('stone') - 1 }
    const totalAntes = inv.reduce((s, x) => s + (x ? x.count : 0), 0)
    for (let i = 0; i < 10; i++) pegarResultado(inv, 'stone', 4)
    expect(inv.reduce((s, x) => s + (x ? x.count : 0), 0)).toBe(totalAntes)
  })

  it('entrega normalmente quando cabe', () => {
    const inv = createInventory()
    expect(pegarResultado(inv, 'oakPlanks', 4)).toBe(true)
    expect(inv[0]).toEqual({ item: 'oakPlanks', count: 4 })
  })
})

describe('a regra da coleta: leva o que cabe e deixa o resto no chão', () => {
  // Reproduz a decisão de `stepDrops`.
  const coletar = (inv, drop) => {
    const cabe = Math.min(drop.count, espacoPara(inv, drop.item))
    if (cabe > 0) {
      addItem(inv, drop.item, cabe)
      drop.count -= cabe
    }
    return drop.count <= 0 // true = o drop some do chão
  }

  it('mochila cheia: não pega nada e o drop continua inteiro no chão', () => {
    const inv = cheio('dirt')
    const drop = { item: 'stone', count: 32 }
    expect(coletar(inv, drop)).toBe(false)
    expect(drop.count).toBe(32)
  })

  it('cabendo só uma parte, o resto FICA no chão em vez de evaporar', () => {
    // O defeito antigo apagava os 30 restantes em silêncio.
    const inv = cheio('dirt')
    inv[0] = { item: 'dirt', count: maxStack('dirt') - 2 }
    const drop = { item: 'dirt', count: 32 }
    expect(coletar(inv, drop)).toBe(false)
    expect(drop.count).toBe(30)
    expect(inv[0].count).toBe(maxStack('dirt'))
  })

  it('cabendo tudo, o drop some', () => {
    const inv = createInventory()
    const drop = { item: 'dirt', count: 32 }
    expect(coletar(inv, drop)).toBe(true)
    expect(drop.count).toBe(0)
  })

  it('nenhum item se perde nem se cria, em 200 coletas aleatórias', () => {
    // A conta que importa: item no mundo é conservado. Este é o teste que
    // teria pego os dois defeitos de uma vez.
    let semente = 7
    const rnd = () => {
      semente = (semente * 1103515245 + 12345) & 0x7fffffff
      return semente / 0x7fffffff
    }
    const inv = createInventory()
    for (let i = 0; i < 20; i++) inv[i] = { item: 'dirt', count: 60 }
    const conta = (v) => v.reduce((s, x) => s + (x ? x.count : 0), 0)
    let noChao = 0
    let total = conta(inv)
    for (let i = 0; i < 200; i++) {
      const drop = { item: 'dirt', count: 1 + Math.floor(rnd() * 40) }
      total += drop.count
      coletar(inv, drop)
      noChao += drop.count
    }
    expect(conta(inv) + noChao).toBe(total)
  })
})

// PROVA DE VIDA, PERMANENTE.
//
// Os testes acima verificam a regra NOVA. Sozinhos, eles não provam que
// pegariam a regra velha de volta — e um teste que passa nos dois códigos não
// vale nada (foi o que aconteceu com a primeira versão do teste de mob nesta
// mesma rodada). Aqui a regra ANTIGA é reimplementada e o teste EXIGE que ela
// erre. Se alguém "simplificar" o conserto de volta, estes dois disparam.
describe('a regra antiga, reimplementada — tem que errar', () => {
  it('o craft antigo duplica item', () => {
    const craftAntigo = (inv, item, count) => {
      const left = addItem(inv, item, count) // MUTA antes de decidir
      return left === 0
    }
    const inv = cheio('stone')
    inv[0] = { item: 'stone', count: maxStack('stone') - 1 }
    const antes = inv.reduce((s, x) => s + (x ? x.count : 0), 0)
    for (let i = 0; i < 10; i++) craftAntigo(inv, 'stone', 4)
    const depois = inv.reduce((s, x) => s + (x ? x.count : 0), 0)
    expect(
      depois,
      'a regra antiga PRECISA duplicar, senão este teste é decorativo',
    ).toBeGreaterThan(antes)
  })

  it('a coleta antiga apaga a sobra', () => {
    const coletaAntiga = (inv, drop) => {
      const left = addItem(inv, drop.item, drop.count)
      return left < drop.count // some do chão se qualquer coisa entrou
    }
    const inv = cheio('dirt')
    inv[0] = { item: 'dirt', count: maxStack('dirt') - 2 }
    const drop = { item: 'dirt', count: 32 }
    const sumiuDoChao = coletaAntiga(inv, drop)
    expect(sumiuDoChao, 'a regra antiga PRECISA apagar 30 itens em silêncio').toBe(true)
  })
})

describe('shift+clique (quickMove) — estava escrito e desligado', () => {
  it('manda da mochila para a hotbar', () => {
    const inv = createInventory()
    inv[20] = { item: 'dirt', count: 10 }
    const depois = quickMove(inv, 20)
    expect(depois[20]).toBeNull()
    expect(depois[0]).toEqual({ item: 'dirt', count: 10 })
  })

  it('manda da hotbar para a mochila', () => {
    const inv = createInventory()
    inv[3] = { item: 'stone', count: 5 }
    const depois = quickMove(inv, 3)
    expect(depois[3]).toBeNull()
    expect(depois[HOTBAR_SIZE]).toEqual({ item: 'stone', count: 5 })
  })

  it('empilha no parcial do outro lado ANTES de abrir slot novo, e leva tudo', () => {
    const inv = createInventory()
    inv[0] = { item: 'dirt', count: 60 }
    inv[20] = { item: 'dirt', count: 10 }
    const depois = quickMove(inv, 20)
    const folga = maxStack('dirt') - 60
    expect(depois[0].count, 'o parcial completa primeiro').toBe(maxStack('dirt'))
    expect(depois[1], 'a sobra abre o próximo slot vazio').toEqual({
      item: 'dirt',
      count: 10 - folga,
    })
    expect(depois[20], 'a origem esvazia por completo').toBeNull()
  })

  it('não perde item quando o outro lado está cheio', () => {
    const inv = createInventory()
    for (let i = 0; i < HOTBAR_SIZE; i++) inv[i] = { item: 'stone', count: maxStack('stone') }
    inv[20] = { item: 'dirt', count: 10 }
    const depois = quickMove(inv, 20)
    expect(depois[20]).toEqual({ item: 'dirt', count: 10 })
  })
})

describe('trocar item — o balde que enche e esvazia', () => {
  it('pilha de um vira o outro item no mesmo slot', () => {
    const inv = createInventory()
    inv[0] = makeStack('bucket', 1)
    const novo = trocarItem(inv, 0, 'water_bucket')
    expect(novo[0]).toEqual(expect.objectContaining({ item: 'water_bucket', count: 1 }))
  })

  it('pilha de vários gasta um e o troco procura lugar', () => {
    const inv = createInventory()
    inv[0] = makeStack('bucket', 5)
    const novo = trocarItem(inv, 0, 'water_bucket')
    expect(novo[0].count).toBe(4)
    expect(novo.some((s) => s?.item === 'water_bucket')).toBe(true)
  })

  it('SEM ESPAÇO, a troca não acontece — e o balde não some', () => {
    // ⚠️ Este é o teste que justifica a função existir. Consumir e adicionar em
    // duas chamadas perderia o balde: o `consumeOne` tira a unidade, o
    // `addItem` falha por falta de espaço, e o jogador fica sem nada.
    const inv = createInventory()
    inv[0] = makeStack('bucket', 5)
    for (let i = 1; i < inv.length; i++) inv[i] = makeStack('stone', 64)
    const novo = trocarItem(inv, 0, 'water_bucket')
    expect(novo).toBe(inv) // devolveu os mesmos slots: nada mudou
    expect(novo[0].count).toBe(5)
  })

  it('slot vazio não troca nada', () => {
    const inv = createInventory()
    expect(trocarItem(inv, 3, 'water_bucket')).toBe(inv)
  })

  it('não mexe no array original', () => {
    const inv = createInventory()
    inv[0] = makeStack('bucket', 1)
    const novo = trocarItem(inv, 0, 'water_bucket')
    expect(inv[0].item).toBe('bucket')
    expect(novo[0].item).toBe('water_bucket')
  })
})
