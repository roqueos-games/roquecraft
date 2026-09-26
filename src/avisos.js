// Os avisos do jogo, que eram `showNotification` da store do RoqueOS, vão ao
// `host.avisar`. Os tipos do Quasar (`info`, `success`, `warning`, `negative`)
// viram os do contrato (`info`, `sucesso`, `aviso`, `erro`); as chamadas do
// componente ficaram com a forma de antes, para a troca ser só de quem recebe.
//
// Mora fora do `.vue` para ter teste: um tipo trocado aqui não quebra nada que
// se veja no jsdom, só faz o erro do jogador chegar ao host como "info".

export const TIPO_DO_AVISO = Object.freeze({
  info: 'info',
  success: 'sucesso',
  warning: 'aviso',
  negative: 'erro',
})

/**
 * @param {(mensagem: string, opcoes: { tipo: string }) => void} avisar  o `host.avisar`
 * @returns {(aviso: { type?: string, message: string }) => void}
 */
export function criarNotificar(avisar) {
  return ({ type = 'info', message }) => avisar(message, { tipo: TIPO_DO_AVISO[type] ?? 'info' })
}
