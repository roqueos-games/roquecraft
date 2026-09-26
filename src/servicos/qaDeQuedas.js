// GANCHO DE QA: O BLOCO QUE CAI.
//
// Espelha `quedas.js`. Areia e cascalho caem, e uma cascata só pode ser MEDIDA
// se der pra ver a fila esvaziando - foto de bloco no ar não distingue "está
// caindo" de "travou no ar".
//
// ⚠️ O CONGELAMENTO ENTRA POR PAR GETTER/SETTER, NÃO POR VALOR.
// `quedasCongeladas` é `let` no componente e é LIDA a cada quadro pelo laço do
// jogo. Um serviço que recebesse a variável escreveria numa cópia: o congelar
// devolveria `true`, a sonda acreditaria, e os blocos continuariam caindo. É o
// mesmo silêncio de escrever em `yaw` de dentro de um módulo (rule 44).
//
// É SERVIÇO E NÃO COMPOSABLE: `escoarQuedas` roda um laço síncrono e volta.
// Nada aqui agenda nada que precise ser cancelado quando o app fecha.

/**
 * @param {object} ctx
 * @param {() => object} ctx.engine  GETTER: recriado ao trocar de qualidade.
 * @param {object} ctx.quedasNoAr  o registro vivo de quedas (criado uma vez)
 * @param {object} ctx.fila  a fila de atualizações (criada uma vez)
 * @param {Function} ctx.tickQuedas  o MESMO passo que o quadro do jogo dá
 * @param {() => boolean} ctx.congelado  lê `quedasCongeladas` do componente
 * @param {(v: boolean) => void} ctx.congelar  escreve nele, DE VOLTA no componente
 */
export function criarQaDeQuedas({ engine, quedasNoAr, fila, tickQuedas, congelado, congelar }) {
  return {
    // Estado do mundo que se mexe: o que está caindo agora e o que a fila ainda
    // deve. Uma cascata só pode ser MEDIDA se der pra ver a fila esvaziando.
    quedasInfo: () => ({
      noAr: quedasNoAr.quantas,
      recusadas: quedasNoAr.recusadas,
      fila: fila.tamanho,
      descartadas: fila.descartadas,
      malhas: engine()?.blocosCaindo?.malhas ?? 0,
      alturas: quedasNoAr.lista.map((q) => +q.y.toFixed(2)),
    }),

    congelarQuedas: (v = true) => {
      congelar(!!v)
      return congelado()
    },

    // Roda a cascata até o fim, ou até `limite` quadros. Devolve quantos
    // quadros levou - cascata que não converge é defeito, e sem este número
    // ninguém consegue distinguir "demorou" de "travou".
    escoarQuedas: (limite = 600, dt = 1 / 60) => {
      // ⚠️ Escoar com a queda congelada rodaria os 600 quadros sem mover nada e
      // devolveria "não converge" - um vermelho que seria do instrumento.
      const estava = congelado()
      congelar(false)
      let quadros = 0
      while (quadros < limite && (quedasNoAr.quantas > 0 || fila.tamanho > 0)) {
        tickQuedas(dt)
        quadros++
      }
      congelar(estava)
      return { quadros, sobrou: quedasNoAr.quantas + fila.tamanho }
    },
  }
}
