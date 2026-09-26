import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RCPause from '../../src/componentes/RCPause.vue'

//
// A TELA DE PAUSA — e o que ela vira quando o jogador VENCE O FIM.
//
// `creditos.js` sempre existiu e "nunca rolou": a única porta era o botão do
// menu. Com `venceu`, a tela abre direto nos créditos com o título da vitória
// — é a recompensa de voltar do Fim, e é o que este teste trava.
//
// Sem o jogo em volta, `useTextos()` devolve a chave como veio: é o que o dublê
// do vue-i18n fazia aqui antes da extração (o jogo não usa mais vue-i18n).

const montar = (props = {}) =>
  mount(RCPause, {
    props: { settings: {}, mode: 'survival', seed: 1, ...props },
  })

describe('RCPause', () => {
  it('sem vitória abre no menu, e os créditos ficam atrás do botão', async () => {
    const w = montar()
    expect(w.text()).toContain('roqueCraft.pause.resume')
    expect(w.find('[data-test="rc-venceu"]').exists()).toBe(false)
    const botoes = w.findAll('button').filter((b) => b.text().includes('roqueCraft.pause.credits'))
    await botoes[0].trigger('click')
    expect(w.text()).toContain('roqueCraft.credits.game')
    expect(w.find('[data-test="rc-venceu"]').exists()).toBe(false)
  })

  it('⚠️ com `venceu` abre DIRETO nos créditos, com o título e a linha da vitória', async () => {
    const w = montar({ venceu: true })
    expect(w.text()).toContain('roqueCraft.fim.venceu')
    expect(w.find('[data-test="rc-venceu"]').text()).toBe('roqueCraft.fim.venceuLinha')
    expect(w.text()).toContain('roqueCraft.credits.tribute')
    expect(w.text()).not.toContain('roqueCraft.pause.resume')
    // E ligar `venceu` numa tela já aberta troca para os créditos.
    const w2 = montar()
    await w2.setProps({ venceu: true })
    expect(w2.text()).toContain('roqueCraft.fim.venceu')
  })

  it('a morte continua por cima de tudo', () => {
    const w = montar({ venceu: true, dead: true, deathReason: 'x' })
    expect(w.text()).toContain('roqueCraft.death.title')
    expect(w.text()).not.toContain('roqueCraft.fim.venceu')
  })
})
