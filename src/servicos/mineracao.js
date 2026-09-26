// RoqueCraft — A MINERAÇÃO: segurar o botão até o bloco quebrar.
//
// Puro (recebe o mundo e a entrada por `ctx`). Morava no componente como
// `tickMining`; a regra é curta e tem três decisões que já custaram defeito
// cada uma: o progresso recomeça quando a mira muda de célula, a eficiência
// morde no tempo de quebra (encanto guardado e não lido é XP que não paga),
// e a batida da picareta sai pelo PROGRESSO e não pelo quadro — bloco duro
// soa como trabalho, bloco mole como um toque só.

/** Segundos entre batidas da ferramenta enquanto a barra sobe. */
export const CADENCIA_DA_BATIDA = 0.22
/** O criativo quebra "na hora": este é o tempo que a barra leva lá. */
export const QUEBRA_NO_CRIATIVO = 0.08

/**
 * Um passo. Devolve `null` (nada na mira ou nada quebrável), `'minerando'`,
 * ou `'quebrou'` — e chama `aoBater`/`aoQuebrar` nos momentos certos.
 *
 * @param {number} dt
 * @param {object} ctx
 * @param {{x,y,z}|null} ctx.alvo  a célula sob a mira
 * @param {(x,y,z) => number} ctx.blocoEm
 * @param {(id:number) => boolean} ctx.quebravel
 * @param {() => object|null} ctx.minerando  o estado guardado na entrada
 * @param {(m) => void} ctx.definirMinerando
 * @param {(id:number) => number} ctx.tempoDeQuebra  segundos, já com ferramenta e encanto
 * @param {boolean} ctx.criativo
 * @param {(id:number) => void} ctx.aoBater
 * @param {(x,y,z,id) => void} ctx.aoQuebrar
 */
export function passoDaMineracao(dt, ctx) {
  const alvo = ctx.alvo
  if (!alvo) {
    ctx.definirMinerando(null)
    return null
  }
  const id = ctx.blocoEm(alvo.x, alvo.y, alvo.z)
  if (!ctx.quebravel(id)) {
    ctx.definirMinerando(null)
    return null
  }
  const key = `${alvo.x},${alvo.y},${alvo.z}`
  let m = ctx.minerando()
  if (!m || m.key !== key) {
    m = { key, progress: 0, id, tick: 0 }
    ctx.definirMinerando(m)
  }
  const total = ctx.criativo ? QUEBRA_NO_CRIATIVO : ctx.tempoDeQuebra(id)
  m.progress += dt / Math.max(0.05, total)
  m.tick += dt
  if (m.tick >= CADENCIA_DA_BATIDA) {
    m.tick = 0
    ctx.aoBater(id)
  }
  if (m.progress >= 1) {
    ctx.aoQuebrar(alvo.x, alvo.y, alvo.z, id)
    ctx.definirMinerando(null)
    return 'quebrou'
  }
  return 'minerando'
}
