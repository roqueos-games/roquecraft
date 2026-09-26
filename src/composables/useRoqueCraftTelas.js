import { computed, watch } from 'vue'

/**
 * QUE TELAS ESTÃO COBRINDO O JOGO — uma lista só.
 *
 * ⚠️ ISTO NASCEU DE UM DEFEITO QUE UM COMENTÁRIO JÁ TINHA PREVISTO. Em
 * `ROSRoqueCraft.vue` estava escrito, meses antes: "são duas chances de
 * divergir — e o dia em que alguém acrescentar uma janela nova a uma só delas, a
 * mão fica flutuando atrás do modal ou o mundo continua andando por baixo dele".
 *
 * Viraram QUATRO enumerações, e três não conheciam o comércio, a mobília nem o
 * painel de criativo. O sintoma chegou como queixa do founder em 16/09: o botão
 * "clique pra jogar" ocupa a tela inteira (645.120 px² medidos) e aparecia POR
 * CIMA desses painéis, porque ele só se esconde quando o ponteiro está preso. O
 * jogador mira num controle, acerta o botão invisível, e o ponteiro volta a
 * prender — "fica movendo o jogo ao invés de conseguir usar o menu".
 *
 * ⚠️ DOIS GRUPOS, E A DIVISÃO É A REGRA. O primeiro são as telas que PARAM O
 * MUNDO; o segundo, as que só o cobrem. Confundir as duas coisas foi o que
 * criou as quatro listas: quem precisava esconder a mira copiava a lista de
 * quem parava o relógio, e as duas envelheciam separadas.
 *
 * Tudo por REFERÊNCIA: são donos de fora, e este composable não guarda cópia.
 *
 * @param {object} param  telas que param o mundo (menu, pausa, inventário, lobby)
 * @param {object} cobrem `paineis` (comércio e mobília), o criativo, e a porta
 *   que solta o ponteiro
 * @param {object} fechar as portas que o Escape usa, por nome
 */
export function useRoqueCraftTelas(param, cobrem, fechar = {}) {
  const { menuOpen, paused, inventoryOpen, lobbyOpen } = param
  const { paineis, criativo, soltarPonteiro } = cobrem
  const aldeao = paineis.aldeaoAberto
  const mobilia = paineis.aberto

  /**
   * A ORDEM EM QUE O ESCAPE DESMONTA A PILHA, e ela mora AQUI porque é regra.
   * O componente só entrega as portas; qual delas vem primeiro é decisão de
   * comportamento, e decisão de comportamento fora do dono é a sexta lista
   * esperando para nascer.
   */
  const pilha = [
    { tem: () => !!inventoryOpen.value, porta: fechar.inventario },
    { tem: () => !!lobbyOpen.value, porta: fechar.lobby },
  ]

  /**
   * ⚠️ A MENOR DAS DUAS. Comércio, mobília e criativo cobrem a tela mas NÃO
   * param o mundo: o aldeão precisa continuar vivo enquanto se negocia com ele,
   * e travar o relógio no criativo é escolha do jogador, não efeito colateral
   * de abrir um painel.
   */
  const paramOMundo = computed(
    () => !!menuOpen.value || !!paused.value || !!inventoryOpen.value || !!lobbyOpen.value,
  )

  /**
   * A PARTIDA ESTÁ EM CURSO: o menu inicial saiu da frente. É outra pergunta,
   * não uma tela a menos — HUD, controles de toque e o aviso de "carregando"
   * existem quando há partida, com ou sem painel por cima.
   *
   * ⚠️ Antes isto era `!menuOpen` escrito três vezes no template, e o gate
   * `tela-unica` não via porque só reprovava DUAS telas negadas juntas. Uma
   * negada solta é a mesma lista, só que menor.
   */
  const naPartida = computed(() => !menuOpen.value)

  /** Tudo que cobre a tela. É a verdade da interface e do ponteiro. */
  const telaAberta = computed(
    () => paramOMundo.value || !!aldeao.value || !!mobilia.value || !!criativo.aberto.value,
  )

  // A rede que faltava. Antes, cada ponto de abertura lembrava (ou esquecia) de
  // chamar `exitPointerLock` na mão — e o painel de criativo, que nasceu por
  // último, esqueceu.
  watch(telaAberta, (tem) => {
    if (tem) soltarPonteiro()
  })

  /**
   * FECHA A TELA DE CIMA, e devolve se fechou alguma.
   *
   * ⚠️ O ESCAPE TINHA A PRÓPRIA LISTA — a quinta. Ela conhecia inventário e
   * lobby e mais nada, então com o painel de criativo aberto o `Escape` caía no
   * `else` e abria o MENU DE PAUSA POR CIMA dele (medido: painel segue aberto,
   * pausa abre, e o painel nunca fecha por mais que se aperte). Para o jogador
   * isso lê como "o Escape me tirou do jogo", que foi como o founder relatou.
   *
   * Comércio e mobília não entram na pilha porque já fecham pelo próprio
   * `close`, mas entram na conta de `telaAberta` — e quem quiser que o Escape
   * as feche acrescenta uma linha em `pilha`, num lugar só.
   */
  function fecharDoTopo() {
    if (criativo.aberto.value) {
      criativo.aberto.value = false
      return true
    }
    for (const { tem, porta } of pilha) {
      if (tem() && porta) {
        porta()
        return true
      }
    }
    return false
  }

  return { telaAberta, paramOMundo, naPartida, fecharDoTopo }
}
