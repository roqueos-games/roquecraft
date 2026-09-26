import { describe, it, expect } from 'vitest'
import { cliqueNoInventario, HOTBAR_SIZE, quickMove } from '../../src/servicos/inventory.js'
import { escolherPickBlock, aplicarPickBlock } from '../../src/servicos/construcao.js'
import { maxStack } from '../../src/servicos/items.js'

//
// DUAS DECISÕES QUE MORAVAM NO COMPONENTE.
//
// Nenhuma das duas precisa de Vue; as duas eram invisíveis pro vitest enquanto
// estavam lá. O shift-clique é o gesto que todo jogador tenta no primeiro
// minuto, e a aplicação do pick-block é duas cópias de array com uma troca no
// meio — o tipo de coisa que erra em silêncio duplicando item.

const vazio = (n = 36) => new Array(n).fill(null)

describe('cliqueNoInventario', () => {
  it('shift manda o item pra outra metade, e pede save', () => {
    const inv = vazio()
    inv[0] = { item: 'stone', count: 5 }
    const r = cliqueNoInventario(inv, { index: 0, button: 'shift', cursor: null })
    expect(r.salvar).toBe(true)
    expect(r.slots).toEqual(quickMove(inv, 0))
    expect(r.slots[0]).toBe(null)
    // o array original não foi tocado: quem chama troca a referência
    expect(inv[0]).toEqual({ item: 'stone', count: 5 })
  })

  it('shift com o cursor cheio não faz nada', () => {
    const inv = vazio()
    inv[0] = { item: 'stone', count: 5 }
    const r = cliqueNoInventario(inv, {
      index: 0,
      button: 'shift',
      cursor: { item: 'dirt', count: 1 },
    })
    expect(r).toBe(null)
  })

  it('clique normal troca com o cursor e NÃO pede save', () => {
    const inv = vazio()
    inv[3] = { item: 'stone', count: 7 }
    const r = cliqueNoInventario(inv, { index: 3, button: 'left', cursor: null })
    expect(r.cursor).toEqual({ item: 'stone', count: 7 })
    expect(r.slots[3]).toBe(null)
    // ⚠️ `salvar: false` de propósito: o cursor é estado de TELA aberta, e o
    // save sai quando a tela fecha. Agendar a cada clique gravaria o inventário
    // no meio de uma arrumação, com meia pilha pendurada no cursor.
    expect(r.salvar).toBe(false)
  })

  it('botão direito pega metade da pilha', () => {
    const inv = vazio()
    inv[0] = { item: 'stone', count: 8 }
    const r = cliqueNoInventario(inv, { index: 0, button: 'right', cursor: null })
    expect(r.cursor.count).toBe(4)
    expect(r.slots[0].count).toBe(4)
  })
})

describe('aplicarPickBlock', () => {
  const hot = HOTBAR_SIZE

  it('selecionar não copia o array: não há nada a mudar', () => {
    const inv = vazio()
    inv[2] = { item: 'stone', count: 1 }
    const plano = escolherPickBlock(inv, 'stone', 0, hot, false)
    expect(plano).toEqual({ acao: 'selecionar', slot: 2 })
    expect(aplicarPickBlock(inv, plano, 'stone', 64)).toBe(inv)
  })

  it('trazer TROCA os dois slots, sem duplicar nem sumir com nada', () => {
    // ⚠️ A HOTBAR INTEIRA CHEIA. Com um slot livre, `escolherPickBlock` manda a
    // pedra pro VAZIO e a troca não tem o que devolver — o caso que prova a
    // troca é o da hotbar sem folga, onde algo tem mesmo que sair do lugar.
    const inv = vazio()
    for (let i = 0; i < hot; i++) inv[i] = { item: 'dirt', count: 3 }
    inv[20] = { item: 'stone', count: 5 } // na mochila
    const plano = escolherPickBlock(inv, 'stone', 0, hot, false)
    expect(plano).toEqual({ acao: 'trazer', slot: 0, de: 20 })
    const fora = aplicarPickBlock(inv, plano, 'stone', 64)
    // a pedra veio pra hotbar e a terra foi pro lugar dela — nada se perdeu
    expect(fora[plano.slot]).toEqual({ item: 'stone', count: 5 })
    expect(fora[plano.de]).toEqual({ item: 'dirt', count: 3 })
    const conta = (a, k) => a.filter((s) => s?.item === k).length
    expect(conta(fora, 'stone')).toBe(1)
    expect(conta(fora, 'dirt')).toBe(hot)
    expect(inv[20]).toEqual({ item: 'stone', count: 5 }) // original intacto
  })

  it('dar entrega uma pilha cheia, só no criativo', () => {
    const inv = vazio()
    expect(escolherPickBlock(inv, 'stone', 0, hot, false)).toBe(null)
    const plano = escolherPickBlock(inv, 'stone', 0, hot, true)
    const fora = aplicarPickBlock(inv, plano, 'stone', maxStack('stone'))
    expect(fora[plano.slot]).toEqual({ item: 'stone', count: maxStack('stone') })
  })

  it('plano ausente devolve o mesmo inventário', () => {
    const inv = vazio()
    expect(aplicarPickBlock(inv, null, 'stone', 64)).toBe(inv)
  })
})
