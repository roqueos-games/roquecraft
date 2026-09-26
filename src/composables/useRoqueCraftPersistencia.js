/**
 * useRoqueCraftPersistencia — o autosave do RoqueCraft, com dono próprio.
 *
 * Antes disto o salvamento morava no componente de 4.500 linhas e tinha 19
 * chamadores espalhados. A análise de acoplamento (24/08) mostrou que essa
 * aparência de tentáculo engana: **a persistência não participa do quadro.**
 * Ela não lê nem escreve nada dentro de `frame()` — só agenda um `setTimeout`.
 * Por isso ela é o primeiro bloco do Tier 2 a sair: 19 chamadores, zero
 * acoplamento quente.
 *
 * É composable e não serviço porque tem CICLO DE VIDA: um temporizador que
 * precisa ser cancelado quando o app fecha. Serviço puro não guarda timer.
 *
 * ⚠️ AS TRÊS PORTAS DE SAÍDA, e cada uma custou um defeito real:
 *
 *  1. **Sem uid não salva.** Gravar num documento anônimo é gravar num lugar
 *     que ninguém lê de volta.
 *  2. **Em multijogador não salva.** O dono do mundo é o anfitrião; o convidado
 *     que salvasse por cima do próprio mundo solo perderia a base dele ao
 *     entrar numa sala.
 *  3. **Em modo E2E não salva.** O harness roda dezenas de mundos por corrida;
 *     sem esta porta, cada corrida sobrescreveria o save do founder.
 *
 * ⚠️ E O DEBOUNCE É PARTE DA REGRA, não otimização. Colocar um bloco dispara um
 * agendamento; construir uma parede dispara sessenta. Sem os 2,5 s de espera,
 * cada bloco vira uma escrita no Firestore, e a cota acaba antes da parede.
 *
 * ⚠️ `podeAgendar` E `podeGravar` SÃO PORTAS DIFERENTES DE PROPÓSITO. Entre
 * armar o temporizador e ele disparar passam 2,5 s, e nesses 2,5 s o login pode
 * terminar. Quem só depende do uid (que chega) pertence à porta de GRAVAR;
 * quem já decidiu a sessão inteira (sala, harness) pertence à porta de AGENDAR,
 * pra não armar sessenta temporizadores que vão morrer no gate. Igualar as duas
 * perde o primeiro save de quem construiu antes do auth resolver.
 */

import { ref } from 'vue'

/** Espera entre a última alteração e a gravação de fato. */
export const ESPERA_DO_AUTOSAVE = 2500

export function useRoqueCraftPersistencia({
  montarPayload,
  gravar,
  podeGravar,
  podeAgendar = podeGravar,
  espera = ESPERA_DO_AUTOSAVE,
  aoFalhar = (err) => console.error('[RoqueCraft] falha ao salvar:', err),
}) {
  let timer = null
  /** Quantas gravações já aconteceram. O QA usa; o HUD poderia. */
  const gravacoes = ref(0)
  /** Está com gravação agendada? Serve pra não fechar o app no meio. */
  const agendado = ref(false)

  async function agora() {
    if (!podeGravar()) return false
    try {
      await gravar(montarPayload())
      gravacoes.value++
      return true
    } catch (err) {
      aoFalhar(err)
      return false
    }
  }

  function agendar() {
    if (!podeAgendar()) return false
    clearTimeout(timer)
    agendado.value = true
    timer = setTimeout(() => {
      agendado.value = false
      agora()
    }, espera)
    return true
  }

  /**
   * Cancela o que estiver agendado.
   *
   * ⚠️ Chamar isto no `onBeforeUnmount` NÃO é higiene opcional: um timer que
   * dispara depois do componente morrer chama `montarPayload`, que lê `world` e
   * `player` já destruídos. O sintoma seria um erro no console ao fechar o
   * jogo, e a causa levaria meia hora pra achar.
   */
  function cancelar() {
    clearTimeout(timer)
    timer = null
    agendado.value = false
  }

  return { agendar, agora, cancelar, gravacoes, agendado }
}
