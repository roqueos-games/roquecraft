// RoqueCraft - O BALDE: encher numa fonte, despejar numa celula livre.
//
// Tres decisoes pequenas e cada uma com um motivo que nao e obvio olhando o
// codigo. Elas moravam soltas dentro de `usarBalde`, no componente, misturadas
// com `applyEdit`, som e save -- e por isso nenhuma tinha teste.

import { ID } from './blocks.js'

/**
 * O que este bloco enche o balde?
 *
 * ⚠️ SO FONTE ENCHE. Encostar o balde numa lamina que escorre nao da nada, e o
 * motivo e bom: se lamina enchesse balde, um rio de sete blocos viraria sete
 * baldes e a agua deixaria de ter custo. E a fonte e a unica gota que o mundo
 * grava no save -- o resto se recalcula.
 */
export function oQueEnche(idNoAlvo) {
  if (idNoAlvo === ID.water) return 'water_bucket'
  if (idNoAlvo === ID.lava) return 'lava_bucket'
  return null
}

/**
 * O balde se gasta?
 *
 * No criativo nao: a pessoa esta construindo, e ter que reencher a cada bloco
 * d'agua seria so atrito.
 */
export const gastaBalde = (modo) => modo !== 'creative'

/**
 * Onde o liquido cai.
 *
 * ⚠️ MIRANDO NUMA LAMINA, DESPEJA NELA. Mirando num solido, na face de fora.
 *
 * Sem o primeiro caso, encher uma cova exigiria mirar na parede: a mira de
 * liquido acerta a agua, e o `place` dela cai sempre um bloco adiante -- o
 * jogador despejaria por cima da propria cova sem entender por que.
 */
export function ondeDespejar({ alvo, destino, ehLamina }) {
  return ehLamina ? alvo : destino
}
