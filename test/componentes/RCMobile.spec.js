import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RCMobile from '../../src/componentes/RCMobile.vue'

//
// OS CONTROLES DE TOQUE — o que o polegar alcança.
//
// ⚠️ ESTE ARQUIVO NÃO TINHA TESTE, e o toque estava atrás do teclado sem que
// nada acusasse: reger o mundo (K) e o chat (T) nasceram só como tecla, e no
// iPhone — onde o founder joga — o painel de clima e a conversa da sala não
// existiam (Goal 21, 18/09). O que se trava aqui é a PARIDADE: cada verbo que o
// teclado dispara tem um botão de toque quando a ação existe, e o botão emite
// o verbo certo.
//

// Sem o jogo em volta, `useTextos()` devolve a chave como veio: é o que o dublê
// do vue-i18n fazia aqui antes da extração (o jogo não usa mais vue-i18n).
const icone = { name: 'RCIcon', props: ['nome', 'size'], template: '<i :data-nome="nome" />' }

const montar = (props = {}) => mount(RCMobile, { props, global: { stubs: { RCIcon: icone } } })

const toque = (w, sel) => w.get(sel).trigger('touchstart')

describe('RCMobile', () => {
  it('os três botões de sempre existem e emitem o verbo deles', async () => {
    const w = montar()
    await toque(w, '[data-test="rc-mob-inventario"]')
    await toque(w, '[data-test="rc-mob-voar"]')
    await toque(w, '[data-test="rc-mob-pausa"]')
    expect(w.emitted('inventory')).toHaveLength(1)
    expect(w.emitted('fly')).toHaveLength(1)
    expect(w.emitted('pause')).toHaveLength(1)
  })

  it('⚠️ no criativo existe o botão de REGER O MUNDO, e ele emite `criativo`', async () => {
    // O K do teclado. Sem este botão, o painel de clima era invisível no toque.
    const w = montar({ criativo: true })
    await toque(w, '[data-test="rc-mob-reger"]')
    expect(w.emitted('criativo')).toHaveLength(1)
  })

  it('na sobrevivência o botão de reger NÃO aparece', () => {
    // A tecla K também não faz nada fora do criativo (`avisarSoCriativo`): um
    // botão que só avisa "não pode" é polegar gasto à toa.
    expect(montar({ criativo: false }).find('[data-test="rc-mob-reger"]').exists()).toBe(false)
  })

  it('⚠️ numa sala existe o botão de CHAT, e ele emite `chat`', async () => {
    // O T do teclado. Quem jogava no celular numa sala não conseguia falar.
    const w = montar({ emRede: true })
    await toque(w, '[data-test="rc-mob-chat"]')
    expect(w.emitted('chat')).toHaveLength(1)
  })

  it('fora de rede o botão de chat NÃO aparece', () => {
    expect(montar({ emRede: false }).find('[data-test="rc-mob-chat"]').exists()).toBe(false)
  })

  it("o mergulho só existe dentro d'água", () => {
    expect(montar({ naAgua: false }).find('.rc-mob__btn--dive').exists()).toBe(false)
    expect(montar({ naAgua: true }).find('.rc-mob__btn--dive').exists()).toBe(true)
  })

  it('todo botão de toque usa um ícone do catálogo do jogo, não um ícone Material', () => {
    const w = montar({ criativo: true, emRede: true, naAgua: true })
    expect(w.findAll('.q-icon, .material-icons')).toHaveLength(0)
    expect(w.findAll('i[data-nome]').length).toBeGreaterThanOrEqual(8)
  })
})
