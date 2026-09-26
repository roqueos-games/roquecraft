// RoqueCraft — A ARMADURA: o que veste, quanto protege, quanto se gasta.
//
// Puro: nada de Vue, nada de mundo. O corpo (`useRoqueCraftCorpo.machucar`)
// pergunta "quanto deste dano passa?"; o inventário pergunta "este item é
// peça? de qual lugar?". Os números são os do jogo original — três materiais,
// quatro peças, 4% de redução por ponto até 20 pontos (80%) — porque é a
// tabela que o jogador já tem na cabeça, e a graça de uma armadura é saber o
// que ela vale antes de vestir.
//
// A armadura mora em `survival.armadura` (estado de corpo, gravado com vida e
// fome) e NÃO no inventário: vestida, ela não ocupa slot, não vai pro chão
// pela mochila e não entra na conta de "cabe mais um". Cai com a morte, como
// tudo que o corpo carrega.

/** As quatro peças, na ordem de cima para baixo. */
export const PECAS = Object.freeze(['helmet', 'chestplate', 'leggings', 'boots'])

/**
 * Por material: pontos por peça (capacete, peitoral, calça, bota), durabilidade
 * por peça, e o ingrediente da receita.
 */
export const MATERIAIS_DE_ARMADURA = Object.freeze({
  leather: { pontos: [1, 3, 2, 1], durabilidade: [55, 80, 75, 65], ingrediente: 'leather' },
  iron: { pontos: [2, 6, 5, 2], durabilidade: [165, 240, 225, 195], ingrediente: 'iron_ingot' },
  diamond: { pontos: [3, 8, 6, 3], durabilidade: [363, 528, 495, 429], ingrediente: 'diamond' },
})

/** Quanto cada ponto tira do dano, e o teto de pontos que conta. */
export const REDUCAO_POR_PONTO = 0.04
export const PONTOS_MAXIMOS = 20

/** As fontes de dano que a armadura ameniza. Queda, afogamento e fome, não. */
export const FONTES_PROTEGIDAS = Object.freeze(new Set(['mob', 'arrow', 'explosion', 'cactus']))

/** As formas das receitas, na grade 3×3. */
export const FORMA_DA_PECA = Object.freeze({
  helmet: ['MMM', 'M M'],
  chestplate: ['M M', 'MMM', 'MMM'],
  leggings: ['MMM', 'M M', 'M M'],
  boots: ['M M', 'M M'],
})

/** As doze peças, prontas para virar item: `{ key, material, peca, pontos, durabilidade }`. */
export const ARMADURAS = Object.freeze(
  Object.entries(MATERIAIS_DE_ARMADURA).flatMap(([material, m]) =>
    PECAS.map((peca, i) => ({
      key: `${material}_${peca}`,
      material,
      peca,
      pontos: m.pontos[i],
      durabilidade: m.durabilidade[i],
    })),
  ),
)
const POR_CHAVE = Object.fromEntries(ARMADURAS.map((a) => [a.key, a]))

/** A definição da peça, ou `null` se o item não é armadura. */
export const pecaDe = (item) => POR_CHAVE[item] ?? null

/** O corpo sem nada vestido. */
export const criarArmadura = () => ({ helmet: null, chestplate: null, leggings: null, boots: null })

/** Quantos pontos o que está vestido soma. */
export function pontosDe(armadura) {
  let n = 0
  for (const p of PECAS) n += pecaDe(armadura?.[p]?.item)?.pontos ?? 0
  return n
}

/** Quanto do dano passa, com estes pontos. */
export function reduzirDano(dano, pontos) {
  const p = Math.max(0, Math.min(PONTOS_MAXIMOS, pontos))
  return dano * (1 - p * REDUCAO_POR_PONTO)
}

/**
 * Cada peça vestida perde durabilidade a cada golpe amenizado: 1, ou o dano
 * dividido por 4, o que for maior. A peça que chega a zero SOME — devolve a
 * lista das que quebraram, para quem quiser avisar.
 */
export function desgastar(armadura, dano) {
  const quebradas = []
  const perda = Math.max(1, Math.floor(dano / 4))
  for (const p of PECAS) {
    const s = armadura?.[p]
    if (!s) continue
    s.dur = (s.dur ?? pecaDe(s.item)?.durabilidade ?? 1) - perda
    if (s.dur <= 0) {
      quebradas.push(s.item)
      armadura[p] = null
    }
  }
  return quebradas
}

/**
 * VESTIR o que está no slot `index` do inventário. A peça vai para o lugar
 * dela e o que estava lá volta para o mesmo slot — troca, nunca perda.
 * Devolve `null` se o slot não tem peça.
 */
export function vestir(slots, armadura, index) {
  const s = slots[index]
  const def = s && pecaDe(s.item)
  if (!def) return null
  const novos = slots.slice()
  const nova = { ...armadura }
  const estava = nova[def.peca]
  nova[def.peca] = { item: s.item, dur: s.dur ?? def.durabilidade }
  novos[index] = estava ? { item: estava.item, count: 1, dur: estava.dur } : null
  return { slots: novos, armadura: nova }
}

/**
 * O CLIQUE NO LUGAR DA ARMADURA, com o cursor: é o gesto que funciona igual no
 * mouse e no TOQUE (não há shift no celular). Cursor vazio pega a peça vestida
 * para o cursor; cursor com uma peça DAQUELE lugar veste-a e devolve a que
 * estava (troca); cursor com qualquer outra coisa não faz nada.
 * Devolve `{ armadura, cursor }` ou `null`.
 */
export function clicarNoLugar(armadura, peca, cursor) {
  const vestida = armadura?.[peca] ?? null
  if (!cursor) {
    if (!vestida) return null
    return {
      armadura: { ...armadura, [peca]: null },
      cursor: { item: vestida.item, count: 1, dur: vestida.dur },
    }
  }
  const def = pecaDe(cursor.item)
  if (!def || def.peca !== peca) return null
  return {
    armadura: { ...armadura, [peca]: { item: cursor.item, dur: cursor.dur ?? def.durabilidade } },
    cursor: vestida ? { item: vestida.item, count: 1, dur: vestida.dur } : null,
  }
}

/**
 * TIRAR a peça `peca` para o primeiro slot livre do inventário. `null` quando
 * não há peça ou não há lugar — a peça nunca evapora.
 */
export function tirar(slots, armadura, peca) {
  const s = armadura?.[peca]
  if (!s) return null
  const livre = slots.findIndex((x) => !x)
  if (livre < 0) return null
  const novos = slots.slice()
  novos[livre] = { item: s.item, count: 1, dur: s.dur }
  return { slots: novos, armadura: { ...armadura, [peca]: null } }
}

/** O que a armadura larga no chão ao morrer, no mesmo formato do espólio. */
export function espolioDaArmadura(armadura, onde, cor) {
  const saida = []
  for (const p of PECAS) {
    const s = armadura?.[p]
    if (!s) continue
    saida.push({
      item: s.item,
      count: 1,
      dur: s.dur ?? null,
      x: onde.x,
      y: onde.y + 0.5,
      z: onde.z,
      cor,
    })
  }
  return saida
}

/** Serialização: só o que está vestido. */
export function serializarArmadura(armadura) {
  const out = {}
  for (const p of PECAS)
    if (armadura?.[p]) out[p] = { item: armadura[p].item, dur: armadura[p].dur }
  return out
}
export function desserializarArmadura(data) {
  const a = criarArmadura()
  if (!data || typeof data !== 'object') return a
  for (const p of PECAS) {
    const s = data[p]
    const def = s && typeof s.item === 'string' ? pecaDe(s.item) : null
    if (!def || def.peca !== p) continue
    const dur = Number.isFinite(s.dur)
      ? Math.max(1, Math.min(def.durabilidade, s.dur))
      : def.durabilidade
    a[p] = { item: s.item, dur }
  }
  return a
}
