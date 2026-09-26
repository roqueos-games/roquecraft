// RoqueCraft — O NOME DE UMA PILHA, com o que a pilha carrega.
//
// Puro (recebe `t`). Três telas escreviam `t(def.i18n)` cada uma por conta
// própria, e nenhuma dizia o nível II, o prazo dobrado ou o "arremessável" da
// poção — o jogador olhava duas garrafas iguais e tinha que jogar uma pra
// descobrir. O nome nasce aqui, uma vez, e as telas só o mostram.

import { itemDef } from './items.js'

/** Nome do item cru, sem metadados. */
export function nomeDoItem(key, t) {
  const def = itemDef(key)
  return def ? t(def.i18n) : key
}

/**
 * Nome da PILHA: o item mais os modificadores de poção, se houver.
 * "Poção de Cura II", "Poção de Velocidade (longa)", "Arremessável: Poção de
 * Veneno". A ordem é fixa pra que duas garrafas iguais leiam igual.
 */
export function nomeDaPilha(slot, t) {
  if (!slot) return ''
  let nome = nomeDoItem(slot.item, t)
  const p = slot.pocao
  if (!p) return nome
  if (p.nivel === 2) nome += ' II'
  if (p.longa) nome += ` (${t('roqueCraft.pocao.longa')})`
  if (p.splash) nome = `${t('roqueCraft.pocao.splash')}: ${nome}`
  return nome
}
