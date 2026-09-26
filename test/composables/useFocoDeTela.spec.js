import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref, h } from 'vue'
import { useFocoDeTela } from '../../src/composables/useFocoDeTela.js'

// ⚠️ AS TRÊS COISAS QUE SÓ O CICLO DE VIDA PROVA: a entrada (abrir já foca), a
// armadilha (o Tab não sai do painel) e a devolução (fechar volta o foco a quem
// abriu). Nenhuma delas existia em tela nenhuma do jogo até 19/09/2026.
//
// Veio de `tests/unit/composables/useFocoDeTela.spec.js` do RoqueOS (7ab22a6f), com os mesmos casos e as mesmas
// asserções; o que mudou foi só o caminho do front para o do repo.

/** Uma tela de mentira com a malha pendurada, montada no documento de verdade. */
const Tela = {
  props: { comFoco: { type: Boolean, default: true }, itens: { type: Number, default: 3 } },
  setup(props) {
    const raiz = ref(null)
    const { aoTeclar, focarPrimeiro } = useFocoDeTela(raiz, { focarAoAbrir: props.comFoco })
    return { raiz, aoTeclar, focarPrimeiro, props }
  },
  render() {
    return h(
      'div',
      { ref: 'raiz', onKeydown: this.aoTeclar },
      Array.from({ length: this.props.itens }, (_, i) =>
        h('button', { id: `b${i}`, disabled: i === 1 && this.props.itens > 2 }, `b${i}`),
      ),
    )
  },
}

const montar = (props = {}) => mount(Tela, { props, attachTo: document.body })
const teclar = (w, code, shiftKey = false) => w.find('div').trigger('keydown', { code, shiftKey })

describe('useFocoDeTela', () => {
  it('abrir já põe o foco no primeiro controle', async () => {
    const w = montar({ itens: 2 })
    await w.vm.$nextTick()
    await w.vm.$nextTick()
    expect(document.activeElement.id, 'abriu sem foco: a primeira tecla se perde').toBe('b0')
    w.unmount()
  })

  it('o Tab anda, PULA o desabilitado, e VOLTA no fim sem sair do painel', async () => {
    const w = montar({ itens: 4 }) // b1 é o desabilitado
    await w.vm.$nextTick()
    await w.vm.$nextTick()
    expect(document.activeElement.id).toBe('b0')
    await teclar(w, 'Tab')
    expect(document.activeElement.id, 'pousou no botão morto').toBe('b2')
    await teclar(w, 'Tab')
    expect(document.activeElement.id).toBe('b3')
    // ⚠️ AQUI ESTÁ A ARMADILHA: mais um Tab teria levado o foco para trás do
    // véu, onde o jogador não o enxerga e o Enter faz outra coisa.
    await teclar(w, 'Tab')
    expect(document.activeElement.id, 'o foco escapou da tela').toBe('b0')
    w.unmount()
  })

  it('as setas andam como o Tab, e Shift+Tab volta', async () => {
    const w = montar({ itens: 2 })
    await w.vm.$nextTick()
    await w.vm.$nextTick()
    await teclar(w, 'ArrowDown')
    expect(document.activeElement.id).toBe('b1')
    await teclar(w, 'ArrowUp')
    expect(document.activeElement.id).toBe('b0')
    await teclar(w, 'Tab', true)
    expect(document.activeElement.id).toBe('b1')
    w.unmount()
  })

  // ⚠️ O ESCAPE É DA PILHA DE TELAS, e o Enter é de quem está focado. Se a malha
  // os engolisse, fechar a tela pararia de funcionar e o botão pararia de
  // responder — os dois calados.
  it('não toca no Enter nem no Escape', async () => {
    const w = montar({ itens: 3 })
    await w.vm.$nextTick()
    await w.vm.$nextTick()
    const antes = document.activeElement.id
    await teclar(w, 'Enter')
    expect(document.activeElement.id).toBe(antes)
    await teclar(w, 'Escape')
    expect(document.activeElement.id).toBe(antes)
    w.unmount()
  })

  it('fechar DEVOLVE o foco a quem abriu', async () => {
    const abridor = document.createElement('button')
    abridor.id = 'abridor'
    document.body.appendChild(abridor)
    abridor.focus()
    expect(document.activeElement.id).toBe('abridor')

    const w = montar({ itens: 2 })
    await w.vm.$nextTick()
    await w.vm.$nextTick()
    expect(document.activeElement.id).toBe('b0')
    w.unmount()
    expect(document.activeElement.id, 'o foco caiu no body: a tecla seguinte se perde').toBe(
      'abridor',
    )
    abridor.remove()
  })

  // Se o jogador já clicou noutro lugar, roubar o foco de volta é pior que não
  // devolver: ele estaria digitando em outro campo.
  // ⚠️ O ABRIDOR TEM QUE SER UM ELEMENTO DE VERDADE. Com o `<body>` como
  // abridor este caso passava com E sem a guarda — `body.focus()` não tira o
  // foco de ninguém, e o mutante "devolve sempre" sobrevivia.
  it('não devolve o foco se a tela já o perdeu', async () => {
    const abridor = document.createElement('button')
    abridor.id = 'abridor2'
    const outro = document.createElement('button')
    outro.id = 'outro'
    document.body.append(abridor, outro)
    abridor.focus()

    const w = montar({ itens: 2 })
    await w.vm.$nextTick()
    await w.vm.$nextTick()
    // O jogador clicou noutro lugar: roubar o foco de volta é pior que não
    // devolver — ele estaria digitando em outro campo.
    outro.focus()
    w.unmount()
    expect(document.activeElement.id, 'a tela roubou o foco de volta ao fechar').toBe('outro')
    abridor.remove()
    outro.remove()
  })

  // ⚠️ A LISTA É RELIDA A CADA TECLA, e este caso é o que prova. As telas deste
  // jogo mudam de conteúdo SEM fechar: a pausa troca de aba, o criativo
  // desabilita o raio conforme a tempestade, o inventário mostra a fileira de
  // blocos só no criativo. Uma lista guardada na abertura apontaria para
  // elementos que já saíram do DOM, e `focus()` neles não faz nada — o menu
  // para de responder sem erro nenhum no console.
  it('controle que NASCE com a tela aberta entra na roda', async () => {
    const w = montar({ itens: 2 })
    await w.vm.$nextTick()
    await w.vm.$nextTick()
    expect(document.activeElement.id).toBe('b0')
    // Cresceu de 2 para 4 (b1 vira o desabilitado, b2 e b3 são novos).
    await w.setProps({ itens: 4 })
    await teclar(w, 'Tab')
    expect(document.activeElement.id, 'a lista ficou congelada na abertura').toBe('b2')
    await teclar(w, 'Tab')
    expect(document.activeElement.id).toBe('b3')
    w.unmount()
  })

  // ⚠️ O CASO DO `range`, achado pelo revisor: com a malha roubando a seta, a
  // hora e a chuva do painel de criativo deixavam de se ajustar pelo teclado.
  it('a seta é do CONTROLE quando o controle a usa; o Tab continua da malha', async () => {
    const Com = {
      setup() {
        const raiz = ref(null)
        const { aoTeclar } = useFocoDeTela(raiz)
        return { raiz, aoTeclar }
      },
      render() {
        return h('div', { ref: 'raiz', onKeydown: this.aoTeclar }, [
          h('input', { id: 'faixa', type: 'range' }),
          h('button', { id: 'depois' }),
        ])
      },
    }
    const w = mount(Com, { attachTo: document.body })
    await w.vm.$nextTick()
    await w.vm.$nextTick()
    expect(document.activeElement.id).toBe('faixa')
    // A seta NÃO move o foco: ela é do slider.
    await w.find('div').trigger('keydown', { code: 'ArrowDown' })
    expect(document.activeElement.id, 'a malha roubou a seta do slider').toBe('faixa')
    await w.find('div').trigger('keydown', { code: 'ArrowRight' })
    expect(document.activeElement.id).toBe('faixa')
    // O Tab continua sendo da malha: é ele que sai do controle.
    await w.find('div').trigger('keydown', { code: 'Tab' })
    expect(document.activeElement.id, 'o Tab parou de sair do slider').toBe('depois')
    // E no botão a seta volta a ser da malha.
    await w.find('div').trigger('keydown', { code: 'ArrowDown' })
    expect(document.activeElement.id).toBe('faixa')
    w.unmount()
  })

  it('tela sem controle nenhum não quebra, e não mexe no foco', async () => {
    const fora = document.createElement('button')
    document.body.appendChild(fora)
    fora.focus()
    const w = montar({ itens: 0 })
    await w.vm.$nextTick()
    await w.vm.$nextTick()
    expect(() => teclar(w, 'Tab')).not.toThrow()
    expect(document.activeElement).toBe(fora)
    w.unmount()
    fora.remove()
  })
})
