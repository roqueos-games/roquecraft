import { onMounted, onBeforeUnmount, nextTick } from 'vue'
import { proximoFoco, focaveisDe, indiceFocado, usaAsSetas } from '../servicos/focoDeTela.js'

// PENDURA A MALHA DE FOCO NUMA TELA.
//
// A regra de PARA ONDE o foco vai mora em `focoDeTela.js`, pura e testada. Aqui
// mora o que precisa de DOM e de ciclo de vida, e são três coisas que já
// custaram menu travado em jogo nenhum porque nenhuma existia:
//
//  1. **A entrada.** Ao abrir, o foco vai para o primeiro controle. Sem isso a
//     primeira tecla não faz nada, e a segunda faz o que o navegador quiser.
//  2. **A armadilha.** O Tab NÃO sai do painel. A tela é um `<div>` por cima do
//     canvas, não um `<dialog>`: sem prender, o Tab vai parar nos controles do
//     jogo atrás do véu, onde o jogador não vê o foco e o Enter faz outra coisa.
//  3. **A devolução.** Ao fechar, o foco volta para quem abriu. Sem isso ele
//     volta para o `<body>`, e a tecla seguinte se perde.
//
// ⚠️ A LISTA É LIDA A CADA TECLA, e não guardada na abertura. As telas deste
// jogo mudam de conteúdo sem fechar: o painel de pausa troca de aba, o de
// criativo desabilita o botão de raio conforme a tempestade, o inventário mostra
// a fileira de blocos só no criativo. Uma lista de abertura apontaria para
// elementos que já saíram do DOM, e `focus()` neles não faz nada — o menu
// simplesmente para de responder, sem erro no console.
//
// ⚠️ NÃO TRATA O ESCAPE. Fechar é da pilha de telas (`useRoqueCraftTelas`), que
// sabe a ordem em que as telas se desmontam. Uma segunda noção de "fechar" aqui
// seria a sexta lista que aquele arquivo passou a existir para impedir.

/**
 * @param {import('vue').Ref<HTMLElement|null>} raiz  o elemento da tela
 * @param {object} [opcoes]
 * @param {boolean} [opcoes.focarAoAbrir=true]  entra no primeiro controle
 * @returns {{ aoTeclar: (e: KeyboardEvent) => void, focarPrimeiro: () => void }}
 */
export function useFocoDeTela(raiz, { focarAoAbrir = true } = {}) {
  // ⚠️ GUARDADO ANTES DE FOCAR QUALQUER COISA: depois que a tela rouba o foco,
  // `document.activeElement` já é dela, e a devolução não teria para onde ir.
  let quemAbriu = null

  const lista = () => focaveisDe(raiz.value)

  function focarPrimeiro() {
    const l = lista()
    if (l.length) l[0].focus()
  }

  function aoTeclar(e) {
    const l = lista()
    if (!l.length) return
    const ativo = document.activeElement
    // ⚠️ A SETA É DO CONTROLE QUANDO O CONTROLE A USA. Num `<input
    // type="range">` — a hora e a chuva do painel de criativo — a seta ajusta
    // o valor; roubá-la congelava o sol e ninguém entendia por quê. O Tab
    // continua sendo da malha: é ele que sai do controle.
    if (e.code !== 'Tab' && usaAsSetas(ativo)) return
    const i = proximoFoco(indiceFocado(l, ativo), l.length, {
      code: e.code,
      shift: e.shiftKey,
    })
    if (i < 0) return
    // Só previne o que ELE vai tratar: o Enter, o Escape e o que se digita num
    // campo continuam sendo de quem estava recebendo.
    e.preventDefault()
    e.stopPropagation()
    l[i].focus()
  }

  onMounted(async () => {
    quemAbriu = document.activeElement
    if (!focarAoAbrir) return
    // `nextTick` porque a tela pode abrir com um ramo de `v-if` que ainda não
    // renderizou — e focar o primeiro de uma lista incompleta põe o jogador no
    // controle errado.
    await nextTick()
    focarPrimeiro()
  })

  onBeforeUnmount(() => {
    // Só devolve se a tela ainda TEM o foco. Se o jogador já clicou em outro
    // lugar, roubar de volta é pior que não devolver.
    if (raiz.value?.contains?.(document.activeElement)) quemAbriu?.focus?.()
    quemAbriu = null
  })

  return { aoTeclar, focarPrimeiro }
}
