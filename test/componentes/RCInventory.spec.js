import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RCInventory from '../../src/componentes/RCInventory.vue'
import { CHAVE_DOS_TEXTOS, criarT } from '../../src/textosDoJogo.js'
import ptBR from '../../i18n/pt-BR.json'
import { createInventory } from '../../src/servicos/inventory.js'

// O INVENTÁRIO COM A ARMADURA (Goal 21, 3.1): quatro lugares, clique tira,
// e o total de pontos ao lado. O vestir é shift+clique no slot da mochila,
// que já existia — a regra mora em `cliqueNoInventario`, não aqui.

// Os textos do jogo, pelo mesmo `t` que o componente do jogo provê (antes, o
// vue-i18n do RoqueOS com o pt-BR inteiro).
const textos = { [CHAVE_DOS_TEXTOS]: criarT(() => ptBR) }
const montar = (props = {}) =>
  mount(RCInventory, {
    props: {
      slots: createInventory(),
      craft: new Array(4).fill(null),
      icons: { iron_helmet: 'data:x', diamond_boots: 'data:y' },
      ...props,
    },
    global: { provide: textos, stubs: { RCIcon: true } },
  })

describe('RCInventory — a armadura', () => {
  it('sem `armadura` não há lugares; com ela, os quatro, de cima para baixo', () => {
    expect(montar().find('[data-test="rc-inv-helmet"]').exists()).toBe(false)
    const w = montar({ armadura: { helmet: null, chestplate: null, leggings: null, boots: null } })
    for (const p of ['helmet', 'chestplate', 'leggings', 'boots']) {
      expect(w.find(`[data-test="rc-inv-${p}"]`).exists(), p).toBe(true)
    }
    expect(w.find('.rc-inv__pontos').text()).toBe('0')
  })

  it('a peça vestida mostra o ícone, soma os pontos, e o clique vai para o cursor', async () => {
    const w = montar({
      armadura: {
        helmet: { item: 'iron_helmet', dur: 10 },
        chestplate: null,
        leggings: null,
        boots: { item: 'diamond_boots', dur: 3 },
      },
    })
    expect(w.find('[data-test="rc-inv-helmet"] img').attributes('src')).toBe('data:x')
    expect(w.find('[data-test="rc-inv-chestplate"] img').exists()).toBe(false)
    expect(w.find('.rc-inv__pontos').text()).toBe('5')
    await w.find('[data-test="rc-inv-boots"]').trigger('click')
    expect(w.emitted('slot-click')).toEqual([['boots', 'left']])
  })
})
