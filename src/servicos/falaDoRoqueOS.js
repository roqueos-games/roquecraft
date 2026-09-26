// RoqueCraft — ONDE O ALDEÃO ENCOSTA NO ROQUEOS DE VERDADE.
//
// ⚠️ ESTE É O ÚNICO ARQUIVO DA CONVERSA QUE CONHECE O HOST, e ele é curto de
// propósito. `modeloDoNpc.js` monta o prompt, `falaDoNpc.js` decide o que fazer
// com o texto e `npc.js` guarda o estado — nenhum dos três conhece o host, senão
// o teste deles passa a exigir um jogo montado, e a regra do jogo deixa de ser
// exercitável sem o jogo.
//
// ⚠️ E A CHAVE NÃO PASSA POR AQUI. Até a extração isto chamava o
// `/assistant/complete` do servidor do RoqueOS (pela store e pelo `apiService`)
// e perguntava à store se o Modo Servidor estava ligado E no ar. Agora o jogo
// fala com o modelo só pela capacidade `ia` do host: `disponivel()` é aquela
// mesma pergunta, feita antes, e `completar` é a chamada, com a chave onde
// sempre esteve, do lado do host. Uma chave de provedor dentro do jogo seria
// uma chave exposta num jogo, que é o pior lugar possível para ela estar.
//
// Sem `ia` no host (o de desenvolvimento não tem nenhuma), não há modelo: a
// caixa de texto do aldeão não aparece e ele fala a fala local, como no RoqueOS
// sem Modo Servidor.
import { criarModeloDoServidor } from './modeloDoNpc.js'

/**
 * A função de fala do NPC ligada no host — ou `null` quando o host não tem `ia`.
 *
 * @param {{ disponivel: () => boolean, completar: (pedido: object) => Promise<string|null> } | undefined} ia
 *   a capacidade `ia` do host
 */
export function criarFalaDoRoqueOS(ia) {
  if (!ia || typeof ia.completar !== 'function') return null
  return criarModeloDoServidor({
    // ⚠️ PERGUNTADO A CADA FALA, e não uma vez: o Modo Servidor cai e volta
    // durante a partida (ver `criarModeloDoServidor`).
    pronto: () => Boolean(ia.disponivel?.()),
    // O pedido no formato do contrato: o prompt do aldeão é o `sistema`, e a
    // fala do jogador (já cortada em `modeloDoNpc.js`) é a única mensagem.
    completar: ({ message, systemPrompt }) =>
      ia.completar({
        sistema: systemPrompt,
        mensagens: [{ papel: 'jogador', texto: message }],
      }),
  })
}
