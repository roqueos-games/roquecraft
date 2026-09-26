// RoqueCraft - A FÍSICA ANDA NO RELÓGIO DELA, NÃO NO DO MONITOR.
//
// ⚠️ ESTE ARQUIVO EXISTE PORQUE ANDAR DEPENDIA DA TAXA DE QUADROS (RC-10).
//
// Havia DOIS cortes de tempo, em lugares diferentes e com valores diferentes:
// o laço de render limitava o `dt` a 0,1 s, e `physics.js` limitava de novo a
// 0,05 s. Num aparelho a 15 fps o quadro dura 0,067 s, a física recebia 0,05, e
// o jogador andava 25% MENOS por segundo do que alguém a 60 fps segurando a
// mesma tecla pelo mesmo tempo. O celular do founder não é o desktop dele.
//
// O corte não era o erro — ele existe por um bom motivo, que é um quadro
// gigante (a aba volta do segundo plano depois de um minuto) não virar
// teleporte através de uma parede. O erro era ele ser a ÚNICA resposta: tempo
// demais para um passo só vira VÁRIOS passos, não um passo menor.
//
// ⚠️ E O TETO DE SUBPASSOS NÃO É OTIMIZAÇÃO: sem ele, um quadro de dez segundos
// pede seiscentos passos, que demoram mais que um quadro, que aumenta o `dt`
// seguinte, que pede mais passos ainda. A espiral trava o navegador. Passado o
// teto, o tempo que sobra é DESCARTADO: o jogo perde alguns centímetros de
// deslocamento e continua respondendo, que é o troco certo.

/** Duração de um passo de física. 60 Hz: o mesmo de sempre no desktop. */
export const PASSO_DA_FISICA = 1 / 60

/** Quantos passos, no máximo, um único quadro pode pedir. */
export const MAX_SUBPASSOS = 5

/**
 * Acumulador de tempo com passo fixo.
 *
 * @param {object} [o]
 * @param {number} [o.passo]        segundos por passo
 * @param {number} [o.maxSubpassos] teto de passos por quadro
 */
export function criarPassoFixo({ passo = PASSO_DA_FISICA, maxSubpassos = MAX_SUBPASSOS } = {}) {
  let acumulado = 0

  /**
   * Entrega o tempo do quadro e roda `executar(passo)` quantas vezes couber.
   *
   * @param {number} dt         segundos desde o último quadro
   * @param {(passo:number)=>void} executar
   * @returns {number} quantos passos rodaram (0 é normal em 120 fps)
   */
  function avancar(dt, executar) {
    if (!(dt > 0)) return 0
    acumulado += dt
    // O teto é aplicado ao ACUMULADO, e não ao `dt`: é o acumulado que a
    // espiral faz crescer.
    const teto = passo * maxSubpassos
    if (acumulado > teto) acumulado = teto
    let n = 0
    while (acumulado >= passo) {
      executar(passo)
      acumulado -= passo
      n++
    }
    return n
  }

  /** Quanto sobrou para o próximo quadro. Serve para interpolar o render. */
  const resto = () => acumulado

  /** Zera o tempo pendente. Usado ao voltar de pausa, sala ou troca de mundo. */
  function zerar() {
    acumulado = 0
  }

  return { avancar, resto, zerar }
}
