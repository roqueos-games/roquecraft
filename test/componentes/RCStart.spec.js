import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import RCStart from '../../src/componentes/RCStart.vue'
import { CHAVE_DOS_TEXTOS } from '../../src/textosDoJogo.js'

// Veio de `tests/component/roqueos/apps/RCStart.spec.js` do RoqueOS (7ab22a6f), com os mesmos casos e as mesmas
// asserções. Lá o texto vinha do vue-i18n do RoqueOS, e o teste trocava o
// `useI18n` por um dublê; aqui as telas pedem o `t` com `useTextos()`, e o
// teste PROVÊ o mesmo dublê pela chave que o jogo usa (`CHAVE_DOS_TEXTOS`).
// Ele devolve a chave + os parâmetros, pra dar pra afirmar QUE dado entrou na
// frase.
const t = (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key)

const montar = (props = {}) =>
  mount(RCStart, {
    props: { hasSave: true, seed: 20260819, mode: 'survival', day: 3, ...props },
    global: { provide: { [CHAVE_DOS_TEXTOS]: t } },
  })

describe('RCStart (tela inicial do RoqueCraft)', () => {
  it('mostra as quatro portas de entrada quando existe save', () => {
    const w = montar()
    expect(w.find('[data-test="rc-continue"]').exists()).toBe(true)
    expect(w.find('[data-test="rc-new"]').exists()).toBe(true)
    expect(w.find('[data-test="rc-friends"]').exists()).toBe(true)
    expect(w.find('[data-test="rc-settings"]').exists()).toBe(true)
  })

  it('sem save, NÃO oferece Continuar (botão que não continua nada é mentira)', () => {
    const w = montar({ hasSave: false })
    expect(w.find('[data-test="rc-continue"]').exists()).toBe(false)
    // e o destaque passa pro Novo mundo, que vira a ação principal
    expect(w.find('[data-test="rc-new"]').classes()).toContain('rc-start__btn--primary')
  })

  it('a linha do save diz o MODO e o DIA (senão Continuar é um botão cego)', () => {
    const w = montar({ mode: 'creative', day: 7 })
    const txt = w.find('[data-test="rc-continue"]').text()
    expect(txt).toContain('roqueCraft.menu.mode.creative')
    expect(txt).toContain('"day":7')
  })

  it('emite o evento certo em cada botão', async () => {
    const w = montar()
    await w.find('[data-test="rc-continue"]').trigger('click')
    await w.find('[data-test="rc-new"]').trigger('click')
    await w.find('[data-test="rc-friends"]').trigger('click')
    await w.find('[data-test="rc-settings"]').trigger('click')
    expect(w.emitted('continue')).toHaveLength(1)
    expect(w.emitted('new-world')).toHaveLength(1)
    expect(w.emitted('friends')).toHaveLength(1)
    expect(w.emitted('settings')).toHaveLength(1)
  })

  it('usa o ÍCONE do jogo, não um glifo genérico', () => {
    const w = montar()
    expect(w.find('.rc-start__mark').attributes('src')).toBe('/games/roquecraft/icon.svg')
  })

  it('mostra a semente (é o que o jogador precisa pra recriar o mundo)', () => {
    const w = montar({ seed: 4242 })
    expect(w.find('.rc-start__foot').text()).toContain('4242')
  })
})
