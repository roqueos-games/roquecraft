// RoqueCraft - MOBÍLIA: os blocos que guardam estado.
//
// O mundo é um `Uint8Array` de id puro. Um baú não é só "id 42 em (10,64,10)":
// ele tem 27 slots dentro. Uma fornalha tem três slots, um fogo aceso e uma
// barra de progresso. Nada disso cabe num byte, e é por isso que fornalha e baú
// existiam no jogo como blocos INERTES — `SMELTING` estava escrito e completo
// em `recipes.js`, `interact: 'chest'` estava declarado em `blocks.js`, e nada
// no jogo lia nenhum dos dois.
//
// Aqui mora o registro paralelo: posição → estado. Puro, sem Vue e sem three,
// e serializável junto com o save.
//
// ⚠️ NÃO CONFUNDIR COM O BYTE DE ESTADO POR VOXEL (rotação, variante de laje e
// escada). Aquilo é outro problema, precisa viajar até o mesher e vale por
// milhões de células. Isto aqui vale por punhados de blocos e nunca entra no
// caminho quente do render.

import { maxStack, itemDef } from './items.js'
import { addItem, clickSlot } from './inventory.js'
import { smeltingFor } from './recipes.js'
import { avancarSuporte, codigoDaPocao, pocaoDoCodigo } from './fermentacao.js'

export const SLOTS_BAU = 27
/** Segundos de fogo que UMA unidade de combustível rende. */
export const SEGUNDOS_POR_COMBUSTIVEL = 10
/** Segundos pra fundir um item. Espelha `SMELTING[].time`. */
export const SEGUNDOS_POR_FUNDIDA = 10

/**
 * Segundos que a receita pede.
 *
 * ⚠️ `??` e nao `||`: `time: 0` e' uma fundida INSTANTANEA, nao uma receita sem
 * tempo declarado. As duas unicas chamadas passavam por aqui com a mesma
 * expressao repetida -- juntar as duas foi o que deu ao operador um lugar onde
 * um teste consegue prende-lo.
 */
export const tempoDaReceita = (receita) => receita?.time ?? SEGUNDOS_POR_FUNDIDA

export const chaveDaMobilia = (x, y, z) => `${x},${y},${z}`

export function criarMobilia() {
  return new Map()
}

const bauNovo = () => ({ tipo: 'bau', slots: new Array(SLOTS_BAU).fill(null) })

const fornalhaNova = () => ({
  tipo: 'fornalha',
  entrada: null,
  combustivel: null,
  saida: null,
  // Segundos de fogo restantes, e de quanto era a carga (pra desenhar a chama).
  fogo: 0,
  fogoTotal: 0,
  // Segundos já cozidos do item atual.
  progresso: 0,
})

// O suporte de poções: um ingrediente em cima, três garrafas embaixo. Sem
// combustível — o porquê está em `fermentacao.js`.
const suporteNovo = () => ({
  tipo: 'suporte',
  ingrediente: null,
  garrafas: [null, null, null],
  progresso: 0,
})

const NOVOS = { bau: bauNovo, fornalha: fornalhaNova, suporte: suporteNovo }

/**
 * Estado do bloco em (x,y,z), criando na primeira vez.
 *
 * `tipo` vem do `interact` do bloco (`'chest'` → `'bau'`, `'furnace'` →
 * `'fornalha'`), então quem chama não precisa conhecer o formato.
 */
export function abrirMobilia(m, x, y, z, tipo) {
  const criar = NOVOS[tipo]
  if (!criar) return null
  const k = chaveDaMobilia(x, y, z)
  const atual = m.get(k)
  if (atual && atual.tipo === tipo) return atual
  const novo = criar()
  m.set(k, novo)
  return novo
}

export const mobiliaEm = (m, x, y, z) => m.get(chaveDaMobilia(x, y, z)) || null

/**
 * Tira a mobília do registro e devolve TUDO que estava dentro, pra virar drop.
 *
 * Quebrar um baú cheio e o conteúdo evaporar em silêncio é a pior coisa que um
 * jogo de construção pode fazer com o tempo de alguém.
 */
export function esvaziarMobilia(m, x, y, z) {
  const k = chaveDaMobilia(x, y, z)
  const e = m.get(k)
  if (!e) return []
  m.delete(k)
  const fora = []
  const solta = (s) => {
    if (s && s.count > 0) fora.push(s)
  }
  if (e.tipo === 'bau') e.slots.forEach(solta)
  else if (e.tipo === 'suporte') {
    solta(e.ingrediente)
    e.garrafas.forEach(solta)
  } else {
    solta(e.entrada)
    solta(e.combustivel)
    solta(e.saida)
  }
  return fora
}

/** Quantos segundos de fogo uma unidade deste item rende. 0 = não queima. */
export function poderDeQueima(item) {
  if (!item) return 0
  return (itemDef(item)?.fuel || 0) * SEGUNDOS_POR_COMBUSTIVEL
}

/**
 * Um passo da fornalha. Devolve `true` se alguma coisa mudou (pra a interface
 * saber que precisa redesenhar sem observar objeto profundo).
 *
 * A ordem importa e é a do jogo de referência:
 *   1. o fogo aceso queima, tendo o que cozinhar ou não;
 *   2. sem fogo, mas com entrada fundível E espaço na saída, gasta uma unidade
 *      de combustível — nunca antes, senão o carvão some à toa;
 *   3. com fogo e entrada válida, o progresso anda; ao completar, transfere.
 *   4. entrada trocada no meio zera o progresso.
 */
export function avancarFornalha(f, dt) {
  if (!f || f.tipo !== 'fornalha') return false
  let mudou = false

  if (f.fogo > 0) {
    f.fogo = Math.max(0, f.fogo - dt)
    mudou = true
    if (f.fogo === 0) f.fogoTotal = 0
  }

  const receita = f.entrada ? smeltingFor(f.entrada.item) : null
  const cabeNaSaida =
    receita &&
    (!f.saida ||
      (f.saida.item === receita.result &&
        f.saida.count + receita.count <= maxStack(receita.result)))

  if (!receita || !cabeNaSaida) {
    // Nada a fazer: o progresso volta, mas o fogo aceso continua queimando —
    // é o que o original faz, e é o que faz "desperdiçar carvão" ser uma
    // decisão do jogador e não um acidente da simulação.
    if (f.progresso !== 0) {
      f.progresso = 0
      mudou = true
    }
    return mudou
  }

  // Mesma razão da tolerância abaixo: `fogo` desce por subtração repetida e
  // nunca pousa exatamente em zero.
  if (f.fogo <= 1e-9) {
    const rende = poderDeQueima(f.combustivel?.item)
    if (rende > 0) {
      f.fogo = rende
      f.fogoTotal = rende
      f.combustivel.count -= 1
      if (f.combustivel.count <= 0) f.combustivel = null
      mudou = true
    } else {
      // sem fogo e sem combustível: o que estava cozido esfria
      if (f.progresso > 0) {
        f.progresso = Math.max(0, f.progresso - dt * 2)
        mudou = true
      }
      return mudou
    }
  }

  f.progresso += dt
  mudou = true
  const tempo = tempoDaReceita(receita)
  // ⚠️ TOLERÂNCIA E SOBRA, as duas coisas.
  //
  // Somar 0,1 cem vezes dá 9,99999999999998, não 10. Sem a tolerância cada
  // fundida custava 101 passos em vez de 100 — um erro SISTEMÁTICO, não ruído.
  // Ao longo de uma carga de carvão isso acumulava 0,8 s e a oitava fundida não
  // cabia: uma unidade de carvão rendia 7 em vez de 8, que é o número que o
  // jogador conta. E a sobra tem que ser CARREGADA, não descartada, senão o
  // mesmo centésimo se perde de novo a cada item.
  if (f.progresso >= tempo - 1e-9) {
    f.progresso = Math.max(0, f.progresso - tempo)
    f.entrada.count -= 1
    if (f.entrada.count <= 0) f.entrada = null
    if (f.saida) f.saida.count += receita.count
    else f.saida = { item: receita.result, count: receita.count }
  }
  return mudou
}

/**
 * Avança fornalhas E suportes do mundo. Devolve quantos mudaram e, se houver
 * `aoMudar(chave, entrada)`, chama por cada um — é por aí que o anfitrião da
 * sala publica a fornalha que queimou (Onda 6.3).
 */
export function avancarMobilia(m, dt, aoMudar = null) {
  let n = 0
  for (const [k, e] of m) {
    const mudou =
      (e.tipo === 'fornalha' && avancarFornalha(e, dt)) ||
      (e.tipo === 'suporte' && avancarSuporte(e, dt))
    if (!mudou) continue
    n++
    aoMudar?.(k, e)
  }
  return n
}

/** Fração 0..1 da barra de progresso, pra interface. */
export const fracaoDeFundicao = (f) => {
  if (!f || f.tipo !== 'fornalha' || !f.entrada) return 0
  const r = smeltingFor(f.entrada.item)
  if (!r) return 0
  return Math.max(0, Math.min(1, f.progresso / tempoDaReceita(r)))
}

/** Fração 0..1 da chama. */
export const fracaoDeFogo = (f) =>
  !f || f.tipo !== 'fornalha' || !f.fogoTotal ? 0 : Math.max(0, Math.min(1, f.fogo / f.fogoTotal))

// ── Serialização ───────────────────────────────────────────────────────────
// Formato compacto: uma entrada por bloco com estado. Vazio não é gravado, e é
// isso que mantém o save pequeno: mundo com mil baús vazios grava mil entradas
// minúsculas, e mundo sem mobília nenhuma não grava nada.

// O quarto campo é a poção modificada (`'II'`, `'L'`, `'S'`…), só quando há:
// uma garrafa deixada no suporte não pode perder o nível II ao recarregar.
const slotOut = (s) => {
  if (!s || !(s.count > 0)) return null
  const p = codigoDaPocao(s.pocao)
  return p ? [s.item, s.count, s.dur ?? 0, p] : [s.item, s.count, s.dur ?? 0]
}
// ⚠️ FORMA FECHADA: isto lê o save e, desde a Onda 6.3, o que OUTRO jogador
// escreveu na sala. Item que não existe não entra; pilha acima do teto do item
// é cortada no teto (Onda 6.4). Sem isso, 999 diamantes num baú é um write.
const slotIn = (a) => {
  if (!Array.isArray(a) || !a[0] || !(a[1] > 0)) return null
  const item = String(a[0])
  if (!itemDef(item)) return null
  const s = { item, count: Math.min(maxStack(item), Math.max(1, a[1] | 0)) }
  if (a[2] > 0) s.dur = a[2] | 0
  const p = pocaoDoCodigo(a[3])
  if (p) s.pocao = p
  return s
}

/**
 * UMA entrada no formato do save (sem a chave), ou `null` quando está vazia -
 * vazio não ocupa save, e na sala (Onda 6.3) `null` é "apague a chave".
 *
 * `v` é a VERSÃO da entrada na sala (Onda 6.4): o banco só aceita `v + 1`
 * sobre o que tem, então dois jogadores no mesmo baú dentro da latência não
 * duplicam nem perdem - um vence, o outro desfaz. Sobe em `versionar`, uma
 * vez por publicação, nunca por mudança (a fornalha muda 60× por segundo).
 */
export function serializarEntrada(e) {
  if (!e) return null
  const v = e.v | 0
  if (e.tipo === 'bau') {
    const slots = e.slots.map(slotOut)
    if (slots.every((s) => s === null)) return null
    return { t: 'b', s: slots, v }
  }
  if (e.tipo === 'suporte') {
    const ing = slotOut(e.ingrediente)
    const gar = e.garrafas.map(slotOut)
    if (!ing && gar.every((g) => g === null)) return null
    return { t: 's', i: ing, g: gar, p: Number((e.progresso || 0).toFixed(2)), v }
  }
  if (e.tipo === 'fornalha') {
    const ent = slotOut(e.entrada)
    const com = slotOut(e.combustivel)
    const sai = slotOut(e.saida)
    if (!ent && !com && !sai && e.fogo <= 0) return null
    return {
      t: 'f',
      e: ent,
      c: com,
      o: sai,
      g: Number((e.fogo || 0).toFixed(2)),
      gt: Number((e.fogoTotal || 0).toFixed(2)),
      p: Number((e.progresso || 0).toFixed(2)),
      v,
    }
  }
  return null
}

/** Sobe a versão da entrada. Chamar UMA vez por publicação na sala. */
export function versionar(e) {
  if (!e) return 0
  e.v = (e.v | 0) + 1
  return e.v
}

/** A volta de `serializarEntrada`. Forma desconhecida devolve `null`. */
export function desserializarEntrada(d) {
  if (!d || typeof d !== 'object') return null
  const e = montarEntrada(d)
  if (e) e.v = Math.max(0, d.v | 0)
  return e
}

function montarEntrada(d) {
  if (d.t === 'b') {
    const b = bauNovo()
    const s = Array.isArray(d.s) ? d.s : []
    for (let i = 0; i < SLOTS_BAU; i++) b.slots[i] = slotIn(s[i])
    return b
  }
  if (d.t === 's') {
    const sup = suporteNovo()
    sup.ingrediente = slotIn(d.i)
    const g = Array.isArray(d.g) ? d.g : []
    for (let i = 0; i < 3; i++) sup.garrafas[i] = slotIn(g[i])
    sup.progresso = Math.max(0, Number(d.p) || 0)
    return sup
  }
  if (d.t === 'f') {
    const f = fornalhaNova()
    f.entrada = slotIn(d.e)
    f.combustivel = slotIn(d.c)
    f.saida = slotIn(d.o)
    f.fogo = Math.max(0, Number(d.g) || 0)
    f.fogoTotal = Math.max(f.fogo, Number(d.gt) || 0)
    f.progresso = Math.max(0, Number(d.p) || 0)
    return f
  }
  return null
}

export function serializarMobilia(m) {
  const fora = []
  for (const [k, e] of m) {
    const d = serializarEntrada(e)
    if (d) fora.push({ k, ...d })
  }
  return fora
}

export function desserializarMobilia(dados) {
  const m = criarMobilia()
  if (!Array.isArray(dados)) return m
  for (const d of dados) {
    if (!d || typeof d.k !== 'string') continue
    const e = desserializarEntrada(d)
    if (e) m.set(d.k, e)
  }
  return m
}

// ── O clique dentro da mobília ─────────────────────────────────────────────
//
// Isto morava no componente, e morava lá porque começou como três linhas de
// "pega o slot e troca". Cresceu junto com a fornalha: o baú aceita shift pra
// mandar pro inventário, a saída da fornalha só ENTREGA, e os três campos dela
// não são um array. Nada disso precisa de Vue, e enquanto estava lá dentro não
// tinha teste — o único jeito de exercitar era abrir o jogo e clicar.
//
// Devolve `null` quando o clique não mudou nada, e é isso que deixa quem chama
// não redesenhar nem agendar save à toa. Mutação é em `e` e em `inventario`,
// como já era; o cursor volta pelo retorno porque ele é do chamador.

/**
 * Um clique num slot de baú ou fornalha.
 *
 * @param e mobília aberta (`{tipo:'bau'|'fornalha'}`)
 * @param index slot clicado; na fornalha 0=entrada, 1=combustível, 2=saída
 * @param button `'left' | 'right' | 'shift'`
 * @returns `{ cursor, mexeuNoInventario }` ou `null` se nada mudou
 */
export function cliqueNaMobilia(e, { index, button, cursor, inventario }) {
  if (!e) return null
  if (e.tipo === 'bau') {
    if (button === 'shift') {
      // manda pro inventário do jogador
      const s = e.slots[index]
      if (!s || cursor) return null
      const sobra = addItem(inventario, s.item, s.count, s.dur)
      e.slots[index] = sobra > 0 ? { ...s, count: sobra } : null
      return { cursor, mexeuNoInventario: true }
    }
    const r = clickSlot(e.slots, cursor, index, button)
    for (let i = 0; i < r.slots.length; i++) e.slots[i] = r.slots[i]
    return { cursor: r.cursor, mexeuNoInventario: false }
  }
  if (e.tipo === 'suporte') {
    // 0 é o ingrediente; 1..3 são as garrafas. A saída do suporte é a PRÓPRIA
    // garrafa (ela se transforma no lugar), então aqui não há slot que só
    // entrega — o que não existe também não precisa de guarda.
    const alvo = index === 0 ? [e.ingrediente] : [e.garrafas[index - 1]]
    const r = clickSlot(alvo, cursor, 0, button)
    if (index === 0) e.ingrediente = r.slots[0]
    else e.garrafas[index - 1] = r.slots[0]
    return { cursor: r.cursor, mexeuNoInventario: false }
  }
  const campo = ['entrada', 'combustivel', 'saida'][index]
  if (campo === 'saida') {
    // A saída só ENTREGA. Deixar largar item ali deixaria o jogador enfiar
    // pedra no lugar da barra de ferro e travar a fornalha sem entender.
    const s = e.saida
    if (!s) return null
    let novo
    if (cursor) {
      if (cursor.item !== s.item) return null
      novo = { ...cursor, count: cursor.count + s.count }
    } else {
      novo = { ...s }
    }
    e.saida = null
    return { cursor: novo, mexeuNoInventario: false }
  }
  const r = clickSlot([e[campo]], cursor, 0, button)
  e[campo] = r.slots[0]
  return { cursor: r.cursor, mexeuNoInventario: false }
}
