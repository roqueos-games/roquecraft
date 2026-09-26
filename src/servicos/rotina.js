// RoqueCraft — A ROTINA DO ALDEÃO: dia no quintal, noite em casa, fuga do zumbi.
//
// Puro: recebe a criatura e o ambiente, devolve uma DECISÃO. Quem anda é o
// `stepMob`. Até o Goal 21 o aldeão vagueava como um porco: de noite dormia
// no meio da rua e um zumbi a dois blocos não mudava nada. A casa tem porta
// agora (e ele sabe abrir), então a casa passou a valer alguma coisa — e a
// rotina é o que faz o aldeão USAR a casa.
//
// A "casa" é a ORIGEM (`origemX/origemZ`): o aldeão nasce no meio dela, e é o
// mesmo par que dá nome e ofertas. Nenhum campo novo no save.

/** De dia, vagueia até esta distância da casa. Mais que isso, volta. */
export const RAIO_DO_QUINTAL = 6
/** Zumbi (qualquer hostil) a menos disto: foge. */
export const RAIO_DA_FUGA = 8
/** Quanto tempo corre antes de olhar de novo. */
export const TEMPO_DE_FUGA = 2
/** Quão longe corre, por decisão. */
export const PASSO_DA_FUGA = 8
/** Chegou em casa: parado por este tanto, depois decide de novo (e fica). */
export const TEMPO_EM_CASA = 3
/** A menos disto da origem, "está em casa". */
export const FOLGA_DE_CASA = 0.8

/**
 * A decisão do aldeão. `env`:
 *   isDay                        → boolean
 *   ameacaPerto(x, z, raio)      → { x, z } do hostil mais perto, ou null
 *
 * Devolve `{ estado, alvo, timer, fugaDe }`:
 *   estado 'flee'   → correr PARA LONGE de `fugaDe`, até `alvo`
 *   estado 'wander' → andar até `alvo`
 *   estado 'idle'   → ficar
 *
 * @param {object} mob   x, z, origemX, origemZ, rnd()
 */
export function rotinaDoAldeao(mob, env) {
  const casa = { x: mob.origemX + 0.5, z: mob.origemZ + 0.5 }
  // 1. O ZUMBI VEM PRIMEIRO. Noite ou dia, perto de casa ou não: quem tem um
  //    hostil a menos de RAIO_DA_FUGA corre. É a única decisão que ignora o
  //    relógio, e é a que faz a vila reagir à noite em vez de só dormir nela.
  const ameaca = env.ameacaPerto?.(mob.x, mob.z, RAIO_DA_FUGA)
  if (ameaca) {
    const d = Math.hypot(mob.x - ameaca.x, mob.z - ameaca.z) || 1
    return {
      estado: 'flee',
      fugaDe: { x: ameaca.x, z: ameaca.z },
      alvo: {
        x: mob.x + ((mob.x - ameaca.x) / d) * PASSO_DA_FUGA,
        z: mob.z + ((mob.z - ameaca.z) / d) * PASSO_DA_FUGA,
      },
      timer: TEMPO_DE_FUGA,
    }
  }
  const emCasa = Math.hypot(mob.x - casa.x, mob.z - casa.z) <= FOLGA_DE_CASA
  // 2. DE NOITE, EM CASA. Longe, anda até a origem (a porta ele abre); em
  //    casa, fica — e fica de verdade: `idle` com timer, repetido enquanto for
  //    noite. Um aldeão que "dormisse" vagueando dentro da casa bateria nas
  //    paredes a noite inteira.
  if (!env.isDay) {
    if (emCasa) return { estado: 'idle', alvo: null, timer: TEMPO_EM_CASA, fugaDe: null }
    return { estado: 'wander', alvo: casa, timer: 4, fugaDe: null }
  }
  // 3. DE DIA, O QUINTAL. O alvo é sorteado AO REDOR DA CASA, não ao redor de
  //    onde ele está: é isso que impede o passeio aleatório de levá-lo a trinta
  //    blocos da vila em meia hora, e o que o traz de volta se algo o empurrou.
  if (mob.rnd() < 0.35)
    return { estado: 'idle', alvo: null, timer: 2 + mob.rnd() * 3, fugaDe: null }
  const a = mob.rnd() * Math.PI * 2
  const r = 1.5 + mob.rnd() * (RAIO_DO_QUINTAL - 1.5)
  return {
    estado: 'wander',
    alvo: { x: casa.x + Math.cos(a) * r, z: casa.z + Math.sin(a) * r },
    timer: 2 + mob.rnd() * 4,
    fugaDe: null,
  }
}
