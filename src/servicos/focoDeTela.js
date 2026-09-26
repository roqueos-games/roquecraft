// A MALHA DE FOCO DAS TELAS DO JOGO.
//
// ⚠️ ESTE ARQUIVO EXISTE PORQUE NAVEGAR MENU PELO TECLADO NÃO EXISTIA. Medido
// em 19/09/2026, nos dez componentes de tela do RoqueCraft: zero `@keydown`,
// zero `tabindex`, zero seta ou Tab. `Escape` fechava a tela do topo, `E` abria
// o inventário, `K` o criativo — e acabou. Uma vez DENTRO de um painel, só o
// mouse funcionava.
//
// O Tab do navegador não resolve sozinho, e a razão é o jogo por baixo: a tela
// é um `<div>` por cima do canvas, não um `<dialog>`, então o Tab sai do painel
// e vai parar nos controles do jogo atrás do véu — onde o jogador não vê o foco
// e o Enter faz outra coisa. Quem não enxerga o foco acha que o menu travou.
//
// ⚠️ PURO: recebe uma LISTA e devolve um ÍNDICE. Não conhece DOM, Vue nem
// evento. É o que permite provar a volta no fim da lista, o pulo do
// desabilitado e a entrada sem foco algum sem montar tela nenhuma — e essas
// três são as que quebram na mão.

/** Teclas que andam para a FRENTE na lista. */
export const PARA_FRENTE = new Set(['Tab', 'ArrowDown', 'ArrowRight'])
/** Teclas que andam para TRÁS. */
export const PARA_TRAS = new Set(['ArrowUp', 'ArrowLeft'])

/**
 * O próximo índice focado.
 *
 * @param {number} atual  índice de agora; `-1` quando nada está focado
 * @param {number} total  quantos focáveis existem
 * @param {object} tecla  `{ code, shift }` — Shift+Tab anda para trás
 * @returns {number} o índice novo, ou `-1` quando a tecla não é de navegação
 *
 * ⚠️ VOLTA NO FIM, e não para. Uma lista que para no último item obriga o
 * jogador a adivinhar que precisa voltar com Shift+Tab; e o painel de pausa tem
 * seis botões em coluna, onde "descer" é o gesto óbvio e infinito.
 */
export function proximoFoco(atual, total, { code, shift = false } = {}) {
  if (total <= 0) return -1
  const frente = PARA_FRENTE.has(code) && !(code === 'Tab' && shift)
  const tras = PARA_TRAS.has(code) || (code === 'Tab' && shift)
  if (code === 'Home') return 0
  if (code === 'End') return total - 1
  // ⚠️ SEM FOCO, A PRIMEIRA TECLA ENTRA PELA PONTA CERTA: para frente entra no
  // primeiro, para trás entra no último. Entrar sempre no primeiro faria o
  // Shift+Tab de quem acabou de abrir a tela pular para o item 2.
  if (atual < 0 || atual >= total) {
    if (frente) return 0
    if (tras) return total - 1
    return -1
  }
  if (frente) return (atual + 1) % total
  if (tras) return (atual - 1 + total) % total
  return -1
}

/**
 * Os focáveis de uma tela, na ordem em que aparecem.
 *
 * ⚠️ DESABILITADO E ESCONDIDO FICAM DE FORA, e os dois já existem nas telas de
 * hoje: o botão de raio do painel de criativo é `:disabled` sem tempestade, e o
 * inventário esconde metade dos controles fora do criativo. Um foco que pousa
 * em botão morto lê como menu quebrado.
 *
 * ⚠️ A VISIBILIDADE É MEDIDA EM DOIS NÍVEIS, E O SEGUNDO NÃO EXISTE NO TESTE.
 * A primeira versão filtrava por `offsetParent === null` e devolvia lista VAZIA
 * em todo teste de unidade — o jsdom não faz layout, então `offsetParent` é
 * sempre nulo e o filtro comia a tela inteira. Quatro testes acusaram na hora.
 *
 * Então: o que dá para saber sem layout (atributo `hidden`, `display:none`
 * escrito no elemento, ancestral escondido) sai aqui, e vale nos dois mundos.
 * O que só o layout sabe — escondido por CLASSE — sai por `checkVisibility`,
 * que o navegador tem e o jsdom não; onde ele não existe, esta função não
 * afirma nada sobre isso, e quem cobre esse caso é a sonda no jogo.
 */
export const SELETOR_FOCAVEL =
  'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Escondido pelo que dá para ler sem layout nenhum. */
function escondidoNoPapel(el) {
  if (el.hasAttribute?.('hidden')) return true
  if (el.style?.display === 'none' || el.style?.visibility === 'hidden') return true
  return !!el.closest?.('[hidden]')
}

export function focaveisDe(raiz) {
  if (!raiz?.querySelectorAll) return []
  return [...raiz.querySelectorAll(SELETOR_FOCAVEL)].filter((el) => {
    if (escondidoNoPapel(el)) return false
    // `checkVisibility` só existe no navegador. Sem ele, o que foi medido acima
    // é tudo o que se sabe — e é melhor um focável a mais que uma tela vazia.
    return typeof el.checkVisibility === 'function' ? el.checkVisibility() : true
  })
}

/**
 * O controle focado usa as SETAS por conta própria?
 *
 * ⚠️ ACHADO DO REVISOR NA ONDA 1, E ERA DEFEITO DE VERDADE. O painel de
 * criativo tem dois `<input type="range">` — a hora do dia e a chuva —, e num
 * range as setas são o jeito de ajustar o valor. Com a malha roubando
 * ArrowUp/ArrowDown, arrastar o sol pelo teclado deixava de funcionar no mesmo
 * dia em que a navegação por teclado passou a existir: a tecla mudava o FOCO
 * em vez do valor, e o jogador via a hora congelada sem entender por quê.
 *
 * Vale para todo controle cuja seta tem significado nativo: range, select,
 * textarea, número e campo de texto (onde a seta anda com o cursor). O TAB
 * continua sendo da malha em todos eles — é ele que sai do controle.
 */
const TIPOS_QUE_USAM_SETA = new Set([
  'range',
  'number',
  'text',
  'search',
  'url',
  'tel',
  'email',
  'password',
  'date',
  'time',
  'datetime-local',
  'month',
  'week',
])

export function usaAsSetas(el) {
  if (!el?.tagName) return false
  // ⚠️ A FILA DE ABAS TAMBÉM USA A SETA, e é regra do ARIA, não invenção: num
  // `tablist` a seta TROCA de aba, e é assim que todo leitor de tela ensina a
  // usar. A malha roubando a seta ali faria o painel de criativo ter abas que
  // só o mouse alcança — que é o defeito que este goal existe para fechar.
  if (el.getAttribute?.('role') === 'tab' || el.closest?.('[role="tablist"]')) return true
  const tag = el.tagName.toLowerCase()
  if (tag === 'select' || tag === 'textarea') return true
  if (tag !== 'input') return false
  // Um `<input>` sem `type` é `text`, e texto anda com as setas.
  return TIPOS_QUE_USAM_SETA.has((el.getAttribute('type') || 'text').toLowerCase())
}

/**
 * Onde o foco está, na lista. `-1` quando está fora dela — que é o caso logo
 * depois de abrir a tela, e o caso de alguém ter escapado para trás do véu.
 */
export const indiceFocado = (lista, ativo) => lista.indexOf(ativo)
