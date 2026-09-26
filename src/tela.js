// "A tela é de celular?" pela largura, como o RoqueOS responde.
//
// Vinha do `useMobileViewport` do RoqueOS, que não viaja com o jogo: ele lê a
// consulta de uma store do sistema (`stores/roqueos/uiViewport`). A consulta é
// a mesma de lá, `(max-width: 768px)`, copiada aqui porque fora do RoqueOS não
// há de onde importá-la; o `jogo check` e a régua do front não deixam o jogo
// alcançar a store. Se o RoqueOS mudar o corte, o jogo não muda junto: é o
// preço de o jogo rodar sozinho, e ele fica escrito aqui.
//
// A resposta é reativa: girar o aparelho ou redimensionar a janela do RoqueOS
// abaixo do corte troca o HUD de celular com o jogo aberto, como antes.
import { onUnmounted, ref } from 'vue'

export const CONSULTA_DE_CELULAR = '(max-width: 768px)'

/** A resposta de agora, sem reatividade. Sem `matchMedia` (jsdom cru), não é celular. */
export function ehTelaDeCelular(janela = globalThis.window) {
  if (!janela || typeof janela.matchMedia !== 'function') return false
  return janela.matchMedia(CONSULTA_DE_CELULAR).matches === true
}

/**
 * A resposta reativa, para o `setup` de um componente. Solta o ouvinte quando o
 * componente desmonta. O nome é o do RoqueOS, para o componente não mudar.
 * @returns {{ isMobile: import('vue').Ref<boolean> }}
 */
export function useMobileViewport(janela = globalThis.window) {
  const isMobile = ref(false)
  if (!janela || typeof janela.matchMedia !== 'function') return { isMobile }

  const lista = janela.matchMedia(CONSULTA_DE_CELULAR)
  isMobile.value = lista.matches === true
  const aoMudar = (e) => {
    isMobile.value = e.matches === true
  }
  if (typeof lista.addEventListener === 'function') {
    lista.addEventListener('change', aoMudar)
    onUnmounted(() => lista.removeEventListener('change', aoMudar))
  } else if (typeof lista.addListener === 'function') {
    // Safari antes do 14 e WebView antigo só têm a API velha.
    lista.addListener(aoMudar)
    onUnmounted(() => lista.removeListener(aoMudar))
  }
  return { isMobile }
}
