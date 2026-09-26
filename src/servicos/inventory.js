// RoqueCraft - modelo puro de inventário.
//
// 36 slots: 0-8 são a HOTBAR (o que aparece embaixo da tela), 9-35 a mochila.
// Um slot é `null` ou `{ item, count, dur? }` - `dur` é a durabilidade restante
// de uma ferramenta.
//
// Todas as operações são PURAS ou mutam um objeto explicitamente passado; nada
// aqui conhece Vue, three ou Firebase, então a lógica de arrastar/empilhar/
// dividir é testável sem montar componente.

import { vestir, clicarNoLugar } from './armadura.js'
import { maxStack, itemDef } from './items.js'
import { encantosParaSave, encantosDoSave } from './encantamento.js'
import { codigoDaPocao, pocaoDoCodigo } from './fermentacao.js'

export const HOTBAR_SIZE = 9
export const INVENTORY_SIZE = 36

export function createInventory() {
  return new Array(INVENTORY_SIZE).fill(null)
}

export const makeStack = (item, count = 1) => {
  const def = itemDef(item)
  if (!def) return null
  const s = { item, count }
  if (def.durability) s.dur = def.durability
  return s
}

// Slots ocupados por um item, contagem total.
export function countItem(slots, item) {
  let n = 0
  for (const s of slots) if (s && s.item === item) n += s.count
  return n
}

export function countAll(slots) {
  const out = {}
  for (const s of slots) {
    if (!s) continue
    out[s.item] = (out[s.item] || 0) + s.count
  }
  return out
}

/**
 * Quantos `item` ainda cabem, SEM mutar nada.
 *
 * Existe porque `addItem` muta e só depois conta o que sobrou — e quem chama
 * precisa decidir ANTES. Foram dois bugs de 24/08/2026, os dois com a mesma
 * raiz:
 *
 *  - no craft: `addItem` colocava o que coubesse e, com sobra, a função saía
 *    sem consumir a grade. Inventário quase cheio + cliques repetidos =
 *    item infinito de graça.
 *  - na coleta: sobrando item, o drop inteiro era removido do chão e a sobra
 *    evaporava.
 *
 * Com esta função quem chama pergunta primeiro e age depois: o craft só entrega
 * se couber tudo, e a coleta pega só o que cabe e deixa o resto no chão.
 */
export function espacoPara(slots, item) {
  const cap = maxStack(item)
  let espaco = 0
  for (const s of slots) {
    if (!s) espaco += cap
    else if (s.item === item && s.dur == null) espaco += Math.max(0, cap - s.count)
  }
  return espaco
}

// Adiciona ao inventário respeitando o limite de pilha. Preenche primeiro as
// pilhas parciais existentes (comportamento esperado: pegar 3 de terra não abre
// um slot novo se já tem 61 num), depois os slots vazios. MUTA `slots`.
// Retorna quantos NÃO couberam.
/**
 * `extras` (`{ enc, pocao }`) entram SÓ na pilha nova: são metadados de item
 * que não empilha (ferramenta encantada, poção modificada). Sem eles, catar
 * uma poção arremessável do chão devolvia uma poção comum.
 */
export function addItem(slots, item, count = 1, dur = null, extras = null) {
  const cap = maxStack(item)
  let left = count
  if (cap > 1) {
    for (let i = 0; i < slots.length && left > 0; i++) {
      const s = slots[i]
      if (!s || s.item !== item || s.count >= cap) continue
      const room = cap - s.count
      const take = Math.min(room, left)
      s.count += take
      left -= take
    }
  }
  for (let i = 0; i < slots.length && left > 0; i++) {
    if (slots[i]) continue
    const take = Math.min(cap, left)
    const st = { item, count: take }
    if (dur != null) st.dur = dur
    else {
      const def = itemDef(item)
      if (def?.durability) st.dur = def.durability
    }
    if (extras?.enc) st.enc = { ...extras.enc }
    if (extras?.pocao) st.pocao = { ...extras.pocao }
    slots[i] = st
    left -= take
  }
  return left
}

// Remove `count` do item (de qualquer slot). Retorna quanto removeu de fato.
export function removeItem(slots, item, count = 1) {
  let left = count
  for (let i = 0; i < slots.length && left > 0; i++) {
    const s = slots[i]
    if (!s || s.item !== item) continue
    const take = Math.min(s.count, left)
    s.count -= take
    left -= take
    if (s.count <= 0) slots[i] = null
  }
  return count - left
}

// Tira 1 do slot (usado ao colocar um bloco). Retorna true se consumiu.
export function consumeOne(slots, index) {
  const s = slots[index]
  if (!s) return false
  s.count -= 1
  if (s.count <= 0) slots[index] = null
  return true
}

/**
 * Troca UMA unidade do slot por outro item — o balde que enche e esvazia.
 *
 * Devolve uma cópia dos slots; quem chama reatribui. Consumir e adicionar em
 * duas chamadas não serve: se o inventário estiver cheio, o `addItem` falha
 * DEPOIS do `consumeOne` já ter tirado a unidade, e o balde some. Aqui, se o
 * troco não couber, nada acontece — e a função diz isso devolvendo os slots
 * intactos.
 */
export function trocarItem(slots, index, item, count = 1) {
  const s = slots[index]
  if (!s) return slots
  const copia = slots.slice()
  if (s.count <= 1) {
    copia[index] = makeStack(item, count)
    return copia
  }
  // A pilha tem mais de um: gasta um e o troco procura lugar. Sem espaço, a
  // troca inteira é cancelada.
  const resto = copia.map((k) => (k ? { ...k } : null))
  resto[index] = { ...s, count: s.count - 1 }
  const sobrou = addItem(resto, item, count)
  if (sobrou > 0) return slots
  return resto
}

// Gasta durabilidade de uma ferramenta. Quebra (vira null) ao chegar em 0.
// Retorna 'broke' | 'used' | 'none'.
export function damageTool(slots, index, amount = 1) {
  const s = slots[index]
  if (!s || s.dur == null) return 'none'
  s.dur -= amount
  if (s.dur <= 0) {
    slots[index] = null
    return 'broke'
  }
  return 'used'
}

// ── Interação de slot (clique do mouse com uma pilha "na mão") ──────────────
// Retorna SEMPRE um novo par { slots, cursor } - a UI faz o replace reativo.
// Modelo do jogo original:
//  - clique esquerdo: pega tudo / larga tudo / empilha / troca
//  - clique direito: pega metade / larga 1
export function clickSlot(slots, cursor, index, button = 'left') {
  const next = slots.slice()
  const cur = cursor ? { ...cursor } : null
  const slot = next[index] ? { ...next[index] } : null

  if (button === 'right') {
    if (!cur) {
      if (!slot) return { slots: next, cursor: null }
      const half = Math.ceil(slot.count / 2)
      const taken = { ...slot, count: half }
      slot.count -= half
      next[index] = slot.count > 0 ? slot : null
      return { slots: next, cursor: taken }
    }
    if (!slot) {
      next[index] = { ...cur, count: 1 }
      cur.count -= 1
      return { slots: next, cursor: cur.count > 0 ? cur : null }
    }
    if (slot.item === cur.item && slot.count < maxStack(slot.item)) {
      slot.count += 1
      cur.count -= 1
      next[index] = slot
      return { slots: next, cursor: cur.count > 0 ? cur : null }
    }
    return { slots: next, cursor: cur }
  }

  // esquerdo
  if (!cur) {
    next[index] = null
    return { slots: next, cursor: slot }
  }
  if (!slot) {
    next[index] = cur
    return { slots: next, cursor: null }
  }
  if (slot.item === cur.item && slot.dur == null && cur.dur == null) {
    const cap = maxStack(slot.item)
    const room = cap - slot.count
    const move = Math.min(room, cur.count)
    slot.count += move
    cur.count -= move
    next[index] = slot
    return { slots: next, cursor: cur.count > 0 ? cur : null }
  }
  // troca
  next[index] = cur
  return { slots: next, cursor: slot }
}

// Shift+clique: manda o slot pra "outra metade" (hotbar ↔ mochila).
export function quickMove(slots, index) {
  const next = slots.slice()
  const s = next[index]
  if (!s) return next
  const toHotbar = index >= HOTBAR_SIZE
  const from = toHotbar ? 0 : HOTBAR_SIZE
  const to = toHotbar ? HOTBAR_SIZE : INVENTORY_SIZE
  const cap = maxStack(s.item)
  let left = s.count
  // empilha nos parciais
  for (let i = from; i < to && left > 0; i++) {
    const d = next[i]
    if (!d || d.item !== s.item || d.count >= cap || d.dur != null) continue
    const move = Math.min(cap - d.count, left)
    next[i] = { ...d, count: d.count + move }
    left -= move
  }
  // slots vazios
  for (let i = from; i < to && left > 0; i++) {
    if (next[i]) continue
    const move = Math.min(cap, left)
    next[i] = { item: s.item, count: move, ...(s.dur != null ? { dur: s.dur } : {}) }
    left -= move
  }
  next[index] = left > 0 ? { ...s, count: left } : null
  return next
}

// Inventário inicial de um mundo criativo: um de cada bloco útil na hotbar.
export function creativeStarter() {
  const inv = createInventory()
  const start = [
    'grassBlock',
    'stone',
    'cobblestone',
    'oakPlanks',
    'oakLog',
    'glass',
    'sand',
    'torch',
    'glowstone',
  ]
  start.forEach((k, i) => {
    inv[i] = { item: k, count: 64 }
  })
  return inv
}

// Inventário inicial da sobrevivência: nada (você começa de mãos vazias,
// como manda o gênero).
export const survivalStarter = () => createInventory()

// Serialização compacta pro save (array esparso vira lista de trincas).
export function serializeInventory(slots) {
  const out = []
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i]
    if (!s) continue
    // ⚠️ O ENCANTO É O QUINTO CAMPO, e `dur` vira `null` quando não existe —
    // sem isso um item encantado SEM durabilidade (não há hoje, mas há amanhã)
    // teria o encanto lido como durabilidade. Formato antigo de 3 e 4 campos
    // continua abrindo: o quinto só aparece em quem tem encanto.
    const enc = encantosParaSave(s.enc)
    // A POÇÃO É O SEXTO CAMPO, pela mesma razão do quinto: só aparece em quem
    // tem, e o formato antigo continua abrindo.
    const pocao = codigoDaPocao(s.pocao)
    if (pocao) out.push([i, s.item, s.count, s.dur ?? null, enc, pocao])
    else if (enc) out.push([i, s.item, s.count, s.dur ?? null, enc])
    else out.push(s.dur != null ? [i, s.item, s.count, s.dur] : [i, s.item, s.count])
  }
  return out
}

export function deserializeInventory(flat) {
  const inv = createInventory()
  if (!Array.isArray(flat)) return inv
  for (const e of flat) {
    if (!Array.isArray(e) || e.length < 3) continue
    const [i, item, count, dur, enc, pocao] = e
    if (!Number.isInteger(i) || i < 0 || i >= INVENTORY_SIZE) continue
    if (!itemDef(item) || !Number.isFinite(count) || count <= 0) continue
    const encantos = encantosDoSave(enc)
    inv[i] = dur != null ? { item, count, dur } : { item, count }
    if (encantos) inv[i].enc = encantos
    const p = pocaoDoCodigo(pocao)
    if (p) inv[i].pocao = p
  }
  return inv
}

/**
 * Um clique num slot do inventário do JOGADOR. Irmão de `cliqueNaMobilia` em
 * `mobilia.js`, e saiu do componente pela mesma razão: a decisão entre
 * shift-clique e clique normal não precisa de Vue, e enquanto estava lá dentro
 * o único jeito de exercitá-la era abrir o jogo.
 *
 * Devolve `null` quando o clique não muda nada — o que evita agendar save à toa.
 *
 * @returns {{slots: Array, cursor: object|null, salvar: boolean}|null}
 */
export function cliqueNoInventario(slots, { index, button, cursor, armadura }) {
  // O LUGAR DA ARMADURA: `index` é o nome da peça ('helmet', ...). Funciona com
  // o CURSOR, como qualquer slot — pega a peça vestida, ou veste a que o cursor
  // segura — porque é o único gesto que existe igual no mouse e no toque.
  if (typeof index === 'string') {
    const r = clicarNoLugar(armadura, index, cursor)
    return r && { slots, cursor: r.cursor, salvar: true, armadura: r.armadura }
  }
  // Shift+clique manda o item pra outra metade (hotbar ↔ mochila). O `quickMove`
  // estava escrito e testado aqui desde sempre e ninguém chamava — o gesto que
  // todo jogador do gênero tenta no primeiro minuto simplesmente não fazia nada.
  //
  // E, numa PEÇA DE ARMADURA, o shift+clique VESTE: é o gesto do original, e o
  // único que funciona igual no teclado e no toque (o toque longo do slot).
  if (button === 'shift') {
    if (cursor) return null // com item no cursor o gesto não se aplica
    const vestida = armadura && vestir(slots, armadura, index)
    if (vestida) return { slots: vestida.slots, cursor, salvar: true, armadura: vestida.armadura }
    return { slots: quickMove(slots, index), cursor, salvar: true }
  }
  const r = clickSlot(slots, cursor, index, button)
  return { slots: r.slots, cursor: r.cursor, salvar: false }
}
