import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import RCHud from '../../src/componentes/RCHud.vue'

//
// O HUD — e o gesto de toque que a hotbar ganhou.
//
// ⚠️ SEM TESTE ATÉ 18/09. O que se trava: segurar um slot LARGA o item (o Q do
// teclado, que o toque não tinha), na ordem certa — selecionar primeiro, largar
// depois — e tocar de leve não larga nada. Sem a ordem, segurar o slot 3 com o
// slot 1 na mão largava o item do slot 1.
//

// Sem o jogo em volta, `useTextos()` devolve a chave como veio: é o que o dublê
// do vue-i18n fazia aqui antes da extração (o jogo não usa mais vue-i18n).
vi.mock('../../src/servicos/items.js', () => ({ itemDef: (k) => ({ i18n: `item.${k}` }) }))

const stubs = {
  RCIcon: { name: 'RCIcon', props: ['nome', 'size'], template: '<i />' },
  RCMinimapa: { name: 'RCMinimapa', template: '<i />' },
}
const montar = (props = {}) =>
  mount(RCHud, {
    props: {
      pos: { x: 0, y: 64, z: 0 },
      hotbar: [{ item: 'stone', count: 3 }, null, { item: 'dirt', count: 1 }],
      selected: 0,
      ...props,
    },
    global: { stubs },
  })

describe('RCHud', () => {
  // ⚠️ A POÇÃO DE ARREMESSO ERA PIXEL POR PIXEL IGUAL À DE BEBER: mesmo frasco,
  // mesma cor, e a única diferença no rótulo que só aparece ao passar o mouse —
  // num jogo que se joga com a mão na hotbar e o olho na tela. Quem tinha as
  // duas na barra tomava a de jogar e jogava a de tomar.
  it('a poção de BORRIFO ganha marca no slot; a de beber não', () => {
    const w = montar({
      hotbar: [
        { item: 'potion', count: 1, pocao: { splash: true } },
        { item: 'potion', count: 1, pocao: { nivel: 2 } },
        { item: 'potion', count: 1 },
      ],
    })
    const marcas = w.findAll('.rc-hud__slot').map((s) => s.find('.rc-hud__slot-splash').exists())
    expect(marcas, 'a marca saiu no frasco errado').toEqual([true, false, false])
  })

  it('a marca do borrifo é aria-hidden: o rótulo do botão já diz em texto', () => {
    const w = montar({ hotbar: [{ item: 'potion', count: 1, pocao: { splash: true } }] })
    expect(w.find('.rc-hud__slot-splash').attributes('aria-hidden')).toBe('true')
  })

  it('clicar num slot (mouse) seleciona', async () => {
    const w = montar()
    await w.findAll('.rc-hud__slot')[2].trigger('click')
    expect(w.emitted('select')[0]).toEqual([2])
    expect(w.emitted('largar')).toBeUndefined()
  })

  it('⚠️ toque CURTO seleciona pelo touchend, porque o touchstart é prevenido', async () => {
    // Sem o prevent o navegador cancelava o dedo parado aos ~500 ms (menu de
    // contexto) e o toque longo nunca completava; com ele, o clique sintético
    // some — e quem seleciona passa a ser o touchend.
    vi.useFakeTimers()
    const w = montar()
    const slot = w.findAll('.rc-hud__slot')[1]
    await slot.trigger('touchstart')
    vi.advanceTimersByTime(120)
    await slot.trigger('touchend')
    expect(w.emitted('select')[0]).toEqual([1])
    expect(w.emitted('largar')).toBeUndefined()
    vi.useRealTimers()
  })

  it('⚠️ segurar um slot SELECIONA e depois LARGA — nesta ordem', async () => {
    vi.useFakeTimers()
    const w = montar()
    const slot = w.findAll('.rc-hud__slot')[2]
    await slot.trigger('touchstart')
    vi.advanceTimersByTime(599)
    expect(w.emitted('largar'), 'largou antes do tempo').toBeUndefined()
    vi.advanceTimersByTime(2)
    expect(w.emitted('select')[0]).toEqual([2])
    expect(w.emitted('largar')[0]).toEqual([2])
    vi.useRealTimers()
  })

  it('soltar ou arrastar antes do tempo não larga', async () => {
    vi.useFakeTimers()
    const w = montar()
    const slot = w.findAll('.rc-hud__slot')[0]
    await slot.trigger('touchstart')
    await slot.trigger('touchend')
    vi.advanceTimersByTime(700)
    expect(w.emitted('largar')).toBeUndefined()
    expect(w.emitted('select'), 'o toque curto tem que selecionar').toHaveLength(1)

    await slot.trigger('touchstart')
    await slot.trigger('touchmove')
    vi.advanceTimersByTime(700)
    expect(w.emitted('largar'), 'arrastar o dedo largou o item').toBeUndefined()
    vi.useRealTimers()
  })

  it('a armadura aparece acima da vida só quando há pontos, um pino por 2', () => {
    const sem = montar({ survivalMode: true, armadura: 0 })
    expect(sem.find('[data-test="rc-hud-armadura"]').exists()).toBe(false)
    const com = montar({ survivalMode: true, armadura: 7 })
    const barra = com.find('[data-test="rc-hud-armadura"]')
    expect(barra.exists()).toBe(true)
    expect(barra.findAll('.is-full')).toHaveLength(3)
    expect(barra.findAll('.is-half')).toHaveLength(1)
    expect(barra.findAll('.is-empty')).toHaveLength(6)
  })

  it('a hotbar tem nove slots quando o inventário tem nove', () => {
    expect(montar({ hotbar: Array(9).fill(null) }).findAll('.rc-hud__slot')).toHaveLength(9)
  })

  it('a poção modificada lê o nível II, o prazo e o arremessável no rótulo do slot', () => {
    const w = montar({
      hotbar: [
        { item: 'pocao_cura', count: 1, pocao: { nivel: 2, splash: true } },
        { item: 'pocao_forca', count: 1, pocao: { longa: true } },
        { item: 'pocao_forca', count: 1 },
      ],
    })
    const rotulos = w.findAll('.rc-hud__slot').map((s) => s.attributes('title'))
    expect(rotulos[0]).toMatch(/II/)
    expect(rotulos[0]).toMatch(/roqueCraft\.pocao\.splash|Arremess/)
    expect(rotulos[1]).toMatch(/roqueCraft\.pocao\.longa|longa/)
    expect(rotulos[2]).not.toMatch(/II|longa|splash/)
  })
})
