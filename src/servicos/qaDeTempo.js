// GANCHO DE QA: O TEMPO - O DO RELÓGIO E O DO CÉU.
//
// Em português as duas coisas têm o mesmo nome, e aqui elas moram juntas de
// propósito: o clima é função do relógio (`climaEm(semente, ticks)`), então
// quem mexe num precisa poder ler o outro no mesmo lugar.
//
// `climaQA()` lê; `climaQA({ chuva: 0.8 })` FORÇA; `climaQA({ chuva: null })`
// devolve o mando ao mundo. Existe pelo mesmo motivo do congelar-onda: um A/B
// de chuva em que se espera a chuva chegar não é um A/B, é uma espera - chove
// 15% do tempo, e a foto de antes e a de depois cairiam em dias diferentes com
// sol diferente.
//
// ⚠️ `ticks` É ESCRITO AQUI, e é `let` do componente. A escrita volta por
// `andarPara(v)`; escrever numa cópia deixaria `setTime` devolvendo sucesso
// enquanto o sol continuava onde estava (rule 44).
//
// É SERVIÇO E NÃO COMPOSABLE: o clima que TEM ciclo de vida (a fila de trovões
// com até 18 s) é o composable `useRoqueCraftClima`. Isto aqui só o interroga.

import { normalizeTicks } from './daycycle.js'

/**
 * @param {object} ctx
 * @param {(v: number) => void} ctx.andarPara  escreve `ticks` DE VOLTA no dono
 * @param {() => object} ctx.engine  GETTER: recriado ao trocar de qualidade
 * @param {() => object} ctx.world  GETTER: mundo novo recria o cliente
 * @param {object} ctx.player  o objeto vivo do jogador
 * @param {object} ctx.clima  o composable `useRoqueCraftClima`
 * @param {object} ctx.agora  o clima do quadro (`climaAgora`). Entra por VALOR
 *   porque é `const` no componente e reativo: o mesmo objeto sempre, com o
 *   conteúdo mudando dentro dele. A regra do getter vale pros `let`.
 * @param {() => number} [ctx.ticks]  GETTER do relógio, pra ler depois de acertar
 * @param {(r: object) => void} [ctx.receberRelogio]  a entrada do relógio da
 *   sala no multijogador (Onda 6.1), como se tivesse chegado da rede
 */
export function criarQaDeTempo({
  andarPara,
  engine,
  world,
  player,
  clima,
  agora,
  ticks = () => NaN,
  receberRelogio = () => {},
}) {
  return {
    setTime: (v) => {
      andarPara(normalizeTicks(v))
    },

    /**
     * O relógio da sala chegou (Onda 6.1). Mede a FIAÇÃO do convidado no jogo
     * vivo: o acerto tem que chegar no `ticks` do componente e a sobrescrita
     * no clima - a regra em si já tem teste de unidade, e o que só a sonda vê
     * é o adaptador que perde um argumento no caminho (o respingo da poção
     * chegou ao jogador sem escala exatamente assim).
     */
    relogioDaSala: (r) => {
      receberRelogio(r)
      return { ticks: ticks(), forcado: clima.forcado.value }
    },

    climaQA: (o) => {
      // `claraoFixo` atravessa direto pro engine: é lá que o clarão é avaliado
      // por quadro, e é lá que ele tem que ser congelado.
      if (o && 'claraoFixo' in o) engine()?.setClima({ claraoFixo: o.claraoFixo })
      if (o && 'chuva' in o) {
        clima.forcar(o.chuva, world()?.biomeAt(Math.floor(player.x), Math.floor(player.z)) ?? -1)
      }
      return {
        ...agora,
        // Lido do ENGINE, não recalculado aqui: é o número que de fato acendeu
        // o quadro. Recalcular daria um clarão de outro instante.
        clarao: engine()?.clima?.clarao ?? 0,
        forcado: clima.forcado.value,
        // O tempo que o MUNDO daria agora, com ou sem sobrescrita: é o que
        // permite conferir se a sobrescrita está mesmo mudando alguma coisa.
        doMundo: clima.doMundo(),
      }
    },
  }
}
