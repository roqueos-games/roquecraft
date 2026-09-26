// GANCHO DE QA: A ÁGUA E A LAVA.
//
// Espelha `fluidos.js`, do mesmo jeito que `qaDeQuedas` espelha `quedas.js`:
// o que o serviço decide, este gancho deixa a sonda MEDIR no jogo rodando.
//
// A pergunta que ele existe pra responder é "a lâmina é fonte ou é escorrido?".
// Uma foto azul não distingue os dois, e um teste de unidade da regra não prova
// que o id certo chegou à célula certa no mundo real.
//
// É SERVIÇO E NÃO COMPOSABLE: `escoarFluidos` roda um laço e volta. Ele não
// AGENDA nada - não guarda temporizador que precise ser cancelado ao fechar o
// app, que é o critério que separa as duas coisas neste projeto.

import { FLUIDO_DE_ID, NIVEL_DE_FLUIDO, AGUA, LAVA } from './blocks.js'
import { nivelDaAgua } from './physics.js'
import { SEA_LEVEL } from './constants.js'

/**
 * @param {object} ctx
 * @param {() => object} ctx.world  GETTER: mundo novo recria o cliente.
 * @param {object} ctx.player  o objeto vivo do jogador (nunca reatribuído)
 * @param {object} ctx.survival  estado reativo de vida/fome/fôlego
 * @param {import('vue').Ref<boolean>} ctx.submerso
 * @param {object} ctx.fila  a fila de atualizações, criada uma vez
 * @param {Function} ctx.visitarCelula  o MESMO visitador que o jogo drena
 */
export function criarQaDeFluidos({ world, player, survival, submerso, fila, visitarCelula }) {
  return {
    // Espelho do estado da água sob o jogador: é o que separa "não boiou" de
    // "não tinha água ali".
    agua: () => ({
      dentro: !!player.inWater,
      linha: nivelDaAgua(world().liquidAt, player.x, player.y, player.z),
      y: player.y,
      vy: player.vy,
    }),

    // Nivel do mar e estado do jogador na agua. O QA precisa dos dois pra
    // provar que entrar na agua MUDA alguma coisa (submerso, drag, folego) em
    // vez de so mostrar um print azul.
    aguaInfo: () => ({
      y: player.y,
      seaLevel: SEA_LEVEL,
      submerso: submerso.value,
      naAgua: !!player.inWater,
      vy: Number(player.vy.toFixed(3)),
      folego: survival.air,
    }),

    // Nível da água numa célula: −1 fora d'água, 0 fonte, 1..7 escorrendo,
    // 8 caindo. Sem isto a sonda só sabe dizer "tem água", e "tem água" não
    // distingue lâmina de fonte.
    nivelDeAguaEm: (x, y, z) => {
      const id = world().getBlock(x, y, z)
      return FLUIDO_DE_ID[id] === AGUA ? NIVEL_DE_FLUIDO[id] : -1
    },

    nivelDeLavaEm: (x, y, z) => {
      const id = world().getBlock(x, y, z)
      return FLUIDO_DE_ID[id] === LAVA ? NIVEL_DE_FLUIDO[id] : -1
    },

    // Estado do fluido: o que está na fila agora e o que espera o próximo
    // tique. Uma cova enchendo só pode ser MEDIDA se der pra ver as duas.
    fluidosInfo: () => ({
      fila: fila.tamanho,
      esperando: fila.esperando,
      descartadas: fila.descartadas,
      atrasadasDemais: fila.atrasadasDemais,
    }),

    // Roda o fluido até parar, ou até `limite` tiques. Devolve quantos tiques
    // levou - fluxo que não converge é travamento, e sem este número ninguém
    // distingue "demorou" de "ficou oscilando pra sempre".
    escoarFluidos: (limite = 400) => {
      let tiques = 0
      while (tiques < limite && (fila.tamanho > 0 || fila.esperando > 0)) {
        fila.avancarTempo(1 / 20)
        fila.drenar(visitarCelula)
        tiques++
      }
      return { tiques, sobrou: fila.tamanho + fila.esperando }
    },
  }
}
