/**
 * useRoqueCraftClima, o tempo do RoqueCraft com dono próprio.
 *
 * Nasceu no lugar errado. A rodada de chuva, neve e tempestade (25/08) entregou
 * 1.034 linhas, e 246 delas foram parar dentro do componente de 5.152 linhas,
 * contra o passo 4 do método do próprio loop: "extraindo composable quando a
 * rodada tocar um trecho grande". O founder cobrou, com razão, e este arquivo é
 * o conserto.
 *
 * É COMPOSABLE E NÃO SERVIÇO pelo mesmo critério que `useRoqueCraftPersistencia`
 * já tinha escrito: ele guarda CICLO DE VIDA. A fila `trovoesNoAr` é de
 * `setTimeout` com até 18 segundos de vida, e fechar o jogo sem cancelá-la faz
 * um trovão tocar com o motor de áudio já destruído. Serviço puro não guarda
 * timer.
 *
 * A REGRA em si não mora aqui: mora em `services/roquecraft/clima.js`, que é
 * pura, determinística e tem 20 testes. Aqui mora a APLICAÇÃO dela: o bioma tem
 * voto, a rampa suaviza a fronteira, o motor recebe o resultado e o trovão é
 * agendado pela distância. Regra pura no serviço, estado e ciclo de vida no
 * composable, fiação no componente.
 *
 * ⚠️ AS QUATRO DECISÕES QUE CUSTARAM DEFEITO MEDIDO, e por isso viajam junto
 * com o código em vez de ficarem para trás:
 *
 *  1. **A sobrescrita entra ANTES da regra do bioma.** A primeira versão
 *     aplicava `precipitacaoNoBioma` e SÓ ENTÃO sobrescrevia com o valor
 *     forçado, o que atropelava a regra inteira: no campo gelado o forçado
 *     punha chuva 1 E neve 1 juntas, o chão molhava (escureceu 14%, medido) e
 *     nevava ao mesmo tempo. É o mesmo erro do `IS_PLANT` servindo de proxy
 *     para "frágil": duas regras, e a antiga continuava aceitando quem
 *     pertencia à nova. Forçar é sobre o TEMPO DO MUNDO, e quem traduz tempo
 *     em precipitação daqui continua sendo uma função só, que roda sempre.
 *
 *  2. **A rampa mora aqui, não dentro da função pura.** `precipitacaoNoBioma`
 *     responde 0 no deserto e 1 no campo, sem meio termo, porque a regra é
 *     sobre o bioma e não sobre a distância. Aplicada direto, quem atravessa a
 *     divisa vê o chão SALTAR de brilho num quadro. Rampa depende de quanto
 *     tempo passou, que é estado, e função pura não guarda estado.
 *
 *  3. **`imediato` existe para o QA não medir o meio da rampa.** Quatro passos
 *     por segundo com fator 0,27 dá constante de tempo de ~0,8 s. Uma sonda que
 *     força chuva e fotografa 900 ms depois pega 72% do caminho e chama de
 *     "chuva cheia", que é o jeito silencioso de um número virar mentira.
 *
 *  4. **A fila de trovões é fila, não um slot.** A primeira versão guardava um
 *     agendamento e o cancelava ao raio seguinte. Soava certo até fazer a
 *     conta: são ~6 raios por minuto e até 18 s de atraso, então trovão SEMPRE
 *     se sobrepõe a trovão. Com um slot só, cada raio novo calava o anterior.
 */

import { ref, reactive } from 'vue'
import {
  climaEm,
  precipitacaoNoBioma,
  tempestadeDe,
  relampagoEm,
  envelope,
  atrasoDoTrovao,
} from '../servicos/clima.js'

/** Fator de aproximação por passo lento. 0,27 a 4 Hz dá ~0,8 s de constante. */
export const FATOR_DA_RAMPA = 0.27
/** Abaixo disto é zero de verdade: exponencial nunca chega sozinha. */
export const PISO_DA_RAMPA = 0.005
/** Quanto a pedra abafa o trovão, tratado como distância a mais. */
export const ABAFAMENTO_SOB_A_TERRA = 0.35

export function useRoqueCraftClima({
  semente,
  ticks,
  nomeDoBioma,
  ceuAberto,
  aplicarNoMotor,
  tocarTrovao,
  temAudio = () => true,
}) {
  const clima = reactive({
    chuva: 0,
    neve: 0,
    tempestade: 0,
    cobertura: 0.36,
    estado: 'limpo',
  })
  /** O olho vê o céu? Cache do passo lento: `skyExposed` varre a coluna toda. */
  const ceuSobreOOlho = ref(1)
  /** Sobrescrita do QA: `null` = o mundo manda. */
  const forcado = ref(null)

  let ultimoRaio = -1
  const trovoesNoAr = []

  /**
   * Passo LENTO (4 Hz, junto do HUD). Lê o mundo, aplica bioma e rampa, e
   * entrega o resultado ao motor.
   * @param {number} bioma id do bioma sob o jogador
   * @param {boolean} imediato pula a rampa (QA e sobrescrita)
   */
  function passoLento(bioma, imediato = false) {
    ceuSobreOOlho.value = ceuAberto() ? 1 : 0
    const tempo = climaEm(semente(), ticks())
    const nome = nomeDoBioma(bioma) || ''
    const chuvaDoMundo = forcado.value == null ? tempo.chuva : forcado.value
    const precipita = precipitacaoNoBioma(chuvaDoMundo, nome)

    const suaviza = (atual, destino) =>
      imediato ? destino : atual + (destino - atual) * FATOR_DA_RAMPA
    clima.chuva = suaviza(clima.chuva, precipita.chuva)
    clima.neve = suaviza(clima.neve, precipita.neve)
    if (clima.chuva < PISO_DA_RAMPA) clima.chuva = 0
    if (clima.neve < PISO_DA_RAMPA) clima.neve = 0

    clima.cobertura = tempo.cobertura
    clima.estado = clima.neve > 0.05 ? 'neve' : clima.chuva > 0.05 ? 'chuva' : tempo.estado
    // Tempestade é o topo da chuva DAQUI: no deserto não chove, logo não troveja.
    clima.tempestade = tempestadeDe(clima.chuva)

    aplicarNoMotor({
      chuva: clima.chuva,
      neve: clima.neve,
      cobertura: tempo.cobertura,
      tempestade: clima.tempestade,
      semente: semente(),
    })
  }

  /**
   * Passo POR QUADRO. Só o trovão precisa desta cadência: o clarão dura 0,42 s
   * e o motor avalia a MESMA função pura no laço de desenho. Duas chamadas, uma
   * resposta, e nenhum canal entre elas para dessincronizar.
   */
  // ── O RAIO PEDIDO (painel de criativo) ────────────────────────────────────
  //
  // ⚠️ MESMO ENVELOPE DO RAIO NATURAL, e não um flash inventado. `envelope` é a
  // curva de dois estouros e cauda que o motor já avalia por quadro para o raio
  // sorteado; um clarão manual com valor constante seria um quadrado branco na
  // tela, visivelmente de outra origem. O que muda aqui é só QUEM pediu — o
  // sorteio continua intocado, então pedir um raio não rouba nem adianta os
  // raios que a tempestade ia dar.
  let pedidoEm = null

  function dispararRaio() {
    if (pedidoEm != null) return false
    pedidoEm = 0
    return true
  }

  function passoDoPedido(segundos) {
    if (pedidoEm === 0) {
      pedidoEm = segundos
      // Perto, mas não em cima: 0,3 km dá ~0,9 s entre o clarão e o estouro, o
      // suficiente para os dois lerem como o mesmo evento e não como um bug.
      if (temAudio()) {
        const abafado = ceuSobreOOlho.value ? 1 : ABAFAMENTO_SOB_A_TERRA
        const id = setTimeout(
          () => {
            const i = trovoesNoAr.indexOf(id)
            if (i >= 0) trovoesNoAr.splice(i, 1)
            tocarTrovao(0.3 / abafado)
          },
          Math.max(0, atrasoDoTrovao(0.3) * 1000),
        )
        trovoesNoAr.push(id)
      }
    }
    if (pedidoEm == null) return
    const t = segundos - pedidoEm
    if (t > 0.42) {
      pedidoEm = null
      aplicarNoMotor({ claraoFixo: null })
      return
    }
    aplicarNoMotor({ claraoFixo: envelope(t) })
  }

  function passoPorQuadro(segundos) {
    passoDoPedido(segundos)
    if (!temAudio() || clima.tempestade <= 0) return
    const r = relampagoEm(semente(), segundos, clima.tempestade)
    if (r.desdeORaio == null || r.distanciaKm == null) return
    // Identidade do raio é o INSTANTE em que ele caiu. Sem isso o mesmo raio
    // dispararia um trovão por quadro enquanto o clarão dura.
    const quando = segundos - r.desdeORaio
    if (Math.abs(quando - ultimoRaio) < 0.01) return
    ultimoRaio = quando

    const atraso = atrasoDoTrovao(r.distanciaKm)
    const abafado = ceuSobreOOlho.value ? 1 : ABAFAMENTO_SOB_A_TERRA
    const id = setTimeout(
      () => {
        const i = trovoesNoAr.indexOf(id)
        if (i >= 0) trovoesNoAr.splice(i, 1)
        tocarTrovao(r.distanciaKm / abafado)
      },
      Math.max(0, atraso * 1000),
    )
    trovoesNoAr.push(id)
  }

  /**
   * Força o tempo do MUNDO (não a precipitação daqui: o bioma continua tendo
   * voto). `null` devolve o mando ao relógio.
   */
  function forcar(chuva, bioma) {
    forcado.value = chuva == null ? null : Math.max(0, Math.min(1, Number(chuva)))
    passoLento(bioma, true)
    return forcado.value
  }

  /** Cancela a fila de trovões. Obrigatório no `onBeforeUnmount`. */
  function encerrar() {
    for (const id of trovoesNoAr.splice(0)) clearTimeout(id)
  }

  return {
    clima,
    ceuSobreOOlho,
    forcado,
    passoLento,
    passoPorQuadro,
    forcar,
    dispararRaio,
    encerrar,
    /** Só leitura, para o QA conferir o tempo que o mundo daria agora. */
    doMundo: () => climaEm(semente(), ticks()),
  }
}
