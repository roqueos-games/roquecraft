// RoqueCraft - crafting (moldado e sem molde) + fundição.
//
// Uma receita MOLDADA (`shaped`) declara um padrão em linhas de caracteres e um
// mapa de char → item. O matcher recorta o menor retângulo ocupado da grade do
// jogador e compara com o padrão, então a mesma receita funciona em qualquer
// canto de uma grade 3×3 (e numa 2×2 quando cabe) - o mesmo comportamento do
// jogo original, sem precisar declarar as 4 posições.
//
// Uma receita SEM MOLDE (`shapeless`) só compara o multiconjunto de ingredientes.
//
// Tudo é puro: a UI passa um array de slots (`{item, count}|null`) e recebe de
// volta o resultado. Zero dependência de three/Firebase.

export const GRID_2 = 2
export const GRID_3 = 3

import { ARMADURAS, FORMA_DA_PECA, MATERIAIS_DE_ARMADURA } from './armadura.js'

const shaped = (result, count, pattern, keyMap, needsTable = true) => ({
  type: 'shaped',
  result,
  count,
  pattern,
  keyMap,
  needsTable,
  w: Math.max(...pattern.map((r) => r.length)),
  h: pattern.length,
})

const shapeless = (result, count, items, needsTable = false) => ({
  type: 'shapeless',
  result,
  count,
  items,
  needsTable,
})

// Ajuda pra declarar as 4 variantes de uma ferramenta.
function toolSet(kind, pattern, mats) {
  return mats.map(([tier, mat]) => shaped(`${tier}_${kind}`, 1, pattern, { M: mat, S: 'stick' }))
}
const TOOL_MATS = [
  ['wood', 'oakPlanks'],
  ['stone', 'cobblestone'],
  ['iron', 'iron_ingot'],
  ['diamond', 'diamond'],
]

export const RECIPES = [
  // ── Básico (cabe na grade 2×2 do inventário) ─────────────────────────────
  shapeless('oakPlanks', 4, ['oakLog'], false),
  shapeless('sprucePlanks', 4, ['spruceLog'], false),
  shapeless('oakPlanks', 4, ['birchLog'], false),
  shapeless('oakPlanks', 4, ['jungleLog'], false),
  shaped('stick', 4, ['M', 'M'], { M: 'oakPlanks' }, false),
  shaped('craftingTable', 1, ['MM', 'MM'], { M: 'oakPlanks' }, false),
  shaped('torch', 4, ['C', 'S'], { C: 'coal', S: 'stick' }, false),
  shapeless('charcoal', 1, ['oakLog', 'coal'], false),

  // ── Armadura: a forma vem da peça, o ingrediente do material (`armadura.js`)
  ...ARMADURAS.map((a) =>
    shaped(a.key, 1, FORMA_DA_PECA[a.peca], { M: MATERIAIS_DE_ARMADURA[a.material].ingrediente }),
  ),

  // ── Arco e flecha ────────────────────────────────────────────────────────
  shaped('bow', 1, [' SC', 'S C', ' SC'], { S: 'stick', C: 'string' }),
  shaped('arrow', 4, ['F', 'S', 'P'], { F: 'flint', S: 'stick', P: 'feather' }),
  shaped('shield', 1, ['WIW', 'WWW', ' W '], { W: 'oakPlanks', I: 'iron_ingot' }),
  // O olho do Fim: pérola + pó luminoso (não há pó de blaze aqui; o glowstone
  // é o brilho que o Nether dá, e é do Nether que a receita tem que depender).
  shapeless('ender_eye', 1, ['ender_pearl', 'glowstone_dust'], false),

  // ── Ferramentas ──────────────────────────────────────────────────────────
  ...toolSet('pickaxe', ['MMM', ' S ', ' S '], TOOL_MATS),
  ...toolSet('axe', ['MM', 'MS', ' S'], TOOL_MATS),
  ...toolSet('shovel', ['M', 'S', 'S'], TOOL_MATS),
  ...toolSet('sword', ['M', 'M', 'S'], TOOL_MATS),
  // Enxada: dois materiais deitados e a vara embaixo, como no original. É a
  // receita que abre a agricultura inteira — sem ela não há solo arado, sem
  // solo arado não há trigo, e sem trigo não há pão nem reprodução de bicho.
  ...toolSet('hoe', ['MM', ' S', ' S'], TOOL_MATS),
  shaped('shears', 1, [' M', 'M '], { M: 'iron_ingot' }),
  // Isqueiro: ferro e pederneira na diagonal, como no original. É a receita
  // que destrava o Nether — sem ela a obsidiana empilhada é só obsidiana.
  shaped('flint_and_steel', 1, ['M ', ' F'], { M: 'iron_ingot', F: 'flint' }),
  // ── SEMENTE DE CAULE ─────────────────────────────────────────────────────
  //
  // ⚠️ É POR AQUI QUE ABÓBORA E MELANCIA VIRAM LAVOURA. A abóbora já nascia no
  // mundo e a fatia de melancia já existia como item; sem estas duas receitas
  // as duas continuam sendo achado de mapa, e uma horta de abóbora é
  // impossível. Sem molde, como no original: basta ter o fruto na grade.
  shapeless('pumpkin_seeds', 4, ['pumpkin'], false),
  shapeless('melon_seeds', 1, ['melon_slice'], false),
  // Balde: três lingotes em V, como no original. É a receita que destrava
  // mover líquido — sem ela a água que escorre só existe onde o mundo pôs.
  shaped('bucket', 1, ['M M', ' M '], { M: 'iron_ingot' }),

  // ── Construção ───────────────────────────────────────────────────────────
  // Cerca: duas fileiras de tábua-vara-tábua dão três, como no original. É a
  // receita que transforma o rebanho em fazenda — sem ela dá pra criar bicho e
  // não dá pra segurar bicho.
  shaped('oakFence', 3, ['MSM', 'MSM'], { M: 'oakPlanks', S: 'stick' }),
  // Portão: as varas por fora e a tábua no meio, como no original. É o que
  // devolve ao jogador a passagem que a cerca tirou.
  shaped('oakGate', 1, ['SMS', 'SMS'], { M: 'oakPlanks', S: 'stick' }),
  // A porta: seis tábuas em duas colunas, três portas — como no original.
  shaped('oakDoor', 3, ['MM', 'MM', 'MM'], { M: 'oakPlanks' }),
  shaped('oakTrapdoor', 2, ['MMM', 'MMM'], { M: 'oakPlanks' }),
  shaped('furnace', 1, ['MMM', 'M M', 'MMM'], { M: 'cobblestone' }),
  shaped('chest', 1, ['MMM', 'M M', 'MMM'], { M: 'oakPlanks' }),
  shaped('stoneBricks', 4, ['MM', 'MM'], { M: 'stone' }),
  shaped('bricks', 1, ['MM', 'MM'], { M: 'brick' }),
  shaped('sandstone', 1, ['MM', 'MM'], { M: 'sand' }),
  // ⚠️ A ESTANTE VOLTOU A SER DE LIVRO. Ela era feita de COURO — adaptação de
  // quando papel e livro não existiam, e que deixava a cana sem uso nenhum.
  // Agora é a receita do original: três livros entre duas fileiras de tábua.
  shaped('bookshelf', 1, ['MMM', 'BBB', 'MMM'], { M: 'oakPlanks', B: 'book' }),
  // A MESA DE ENCANTAMENTO — a receita do original, e ela é cara de propósito.
  //
  // Dois diamantes e quatro obsidianas põem a mesa DEPOIS do balde (que é o que
  // dá obsidiana) e DEPOIS da picareta de ferro (que é o que tira obsidiana do
  // chão). Barateá-la adiantaria o encanto pra antes do jogador ter ferramenta
  // que valha a pena encantar, e o primeiro encanto sairia numa picareta de
  // pedra prestes a quebrar.
  shaped('enchantingTable', 1, [' B ', 'DOD', 'OOO'], {
    B: 'book',
    D: 'diamond',
    O: 'obsidian',
  }),
  // ── FERMENTAÇÃO ──────────────────────────────────────────────────────────
  //
  // O suporte é BARATO de propósito (pedregulho e uma vara). O que custa na
  // cadeia de poções é a verruga, que só existe no Nether: quem paga é a
  // viagem, não a bancada. Cobrar dos dois lados faria a primeira poção sair
  // depois do diamante.
  shaped('brewingStand', 1, [' S ', 'MMM'], { S: 'stick', M: 'cobblestone' }),
  // Três garrafas de três vidros, como no original: encher uma de cada vez
  // seria a tarefa mais chata do jogo.
  shaped('glass_bottle', 3, ['G G', ' G '], { G: 'glass' }),
  shaped('sugar', 1, ['C'], { C: 'sugarCane' }),
  shaped('fermented_spider_eye', 1, ['OA'], { O: 'spider_eye', A: 'sugar' }),
  shaped('paper', 3, ['MMM'], { M: 'sugarCane' }),
  // Nove fatias fecham a melancia de volta: sem isto o bloco só existe no mapa
  // e no que o caule dá, e quem colheu não consegue guardar a colheita inteira.
  shaped('melon', 1, ['MMM', 'MMM', 'MMM'], { M: 'melon_slice' }),
  shaped('book', 1, ['PP', 'PC'], { P: 'paper', C: 'leather' }),
  // Cama: três lãs sobre três tábuas. A receita do jogo de referência, e a
  // primeira que exige um mob — ovelha dá lã, e é isso que faz a cama ser
  // conquista e não item inicial.
  shaped('bed', 1, ['LLL', 'MMM'], { L: 'whiteWool', M: 'oakPlanks' }),
  shaped('lantern', 1, [' I ', 'IGI', ' I '], { I: 'iron_ingot', G: 'glowstone_dust' }),
  shaped('glowstone', 1, ['DD', 'DD'], { D: 'glowstone_dust' }),

  // ── Lajes ────────────────────────────────────────────────────────────────
  // Três blocos deitados viram SEIS lajes: metade da altura, o dobro das peças,
  // material conservado. É a receita do jogo de referência e ela não é
  // arbitrária — é o que faz valer a pena cortar em vez de empilhar.
  //
  // Não existe o caminho de volta (duas lajes viram um bloco). O caminho de
  // volta da laje é ENCAIXAR: duas metades na mesma célula viram o bloco cheio,
  // no mundo, sem passar pela bancada. Ver `laje.js`.
  shaped('stoneSlab', 6, ['MMM'], { M: 'stone' }),
  shaped('cobblestoneSlab', 6, ['MMM'], { M: 'cobblestone' }),
  shaped('oakSlab', 6, ['MMM'], { M: 'oakPlanks' }),
  shaped('spruceSlab', 6, ['MMM'], { M: 'sprucePlanks' }),

  // ── Escadas ──────────────────────────────────────────────────────────────
  // Seis blocos em degrau viram QUATRO escadas. Sai material no caminho — três
  // quartos de bloco por peça, e a receita entrega quatro de seis — e é assim
  // no jogo de referência: escada é a peça cara, laje é a barata.
  shaped('stoneStairs', 4, ['M  ', 'MM ', 'MMM'], { M: 'stone' }),
  shaped('cobblestoneStairs', 4, ['M  ', 'MM ', 'MMM'], { M: 'cobblestone' }),
  shaped('oakStairs', 4, ['M  ', 'MM ', 'MMM'], { M: 'oakPlanks' }),
  shaped('spruceStairs', 4, ['M  ', 'MM ', 'MMM'], { M: 'sprucePlanks' }),

  // ── Blocos de material (e o caminho de volta) ────────────────────────────
  shaped('ironBlock', 1, ['MMM', 'MMM', 'MMM'], { M: 'iron_ingot' }),
  shaped('goldBlock', 1, ['MMM', 'MMM', 'MMM'], { M: 'gold_ingot' }),
  shaped('diamondBlock', 1, ['MMM', 'MMM', 'MMM'], { M: 'diamond' }),
  shaped('coalBlock', 1, ['MMM', 'MMM', 'MMM'], { M: 'coal' }),
  shapeless('iron_ingot', 9, ['ironBlock'], false),
  shapeless('gold_ingot', 9, ['goldBlock'], false),
  shapeless('diamond', 9, ['diamondBlock'], false),
  shapeless('coal', 9, ['coalBlock'], false),

  // ── Lã e comida ──────────────────────────────────────────────────────────
  shaped('whiteWool', 1, ['SS', 'SS'], { S: 'string' }, false),
  shapeless('redWool', 1, ['whiteWool', 'redFlower'], false),
  shapeless('yellowFlower', 1, ['yellowFlower'], false),
  shaped('bread', 1, ['WWW'], { W: 'wheat' }, false),
]

// Fundição: entrada → { result, count, time }
export const SMELTING = {
  raw_iron: { result: 'iron_ingot', count: 1, time: 10 },
  raw_gold: { result: 'gold_ingot', count: 1, time: 10 },
  raw_copper: { result: 'copper_ingot', count: 1, time: 10 },
  sand: { result: 'glass', count: 1, time: 10 },
  cobblestone: { result: 'stone', count: 1, time: 10 },
  clay_ball: { result: 'brick', count: 1, time: 10 },
  raw_beef: { result: 'cooked_beef', count: 1, time: 10 },
  raw_porkchop: { result: 'cooked_porkchop', count: 1, time: 10 },
  oakLog: { result: 'charcoal', count: 1, time: 10 },
  clay: { result: 'terracotta', count: 1, time: 10 },
  // A batata assada é o que dá função de comida à fornalha depois do bife, e é
  // a comida mais barata do jogo: a batata crua vale 1 de fome, a assada 5.
  potato: { result: 'baked_potato', count: 1, time: 10 },
}

// ── Matcher ─────────────────────────────────────────────────────────────────

// Recorta o menor retângulo que contém todos os slots ocupados.
// `slots` = array linear de tamanho size*size com `{item,count}|null`.
export function cropGrid(slots, size) {
  let minR = size
  let maxR = -1
  let minC = size
  let maxC = -1
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!slots[r * size + c]) continue
      if (r < minR) minR = r
      if (r > maxR) maxR = r
      if (c < minC) minC = c
      if (c > maxC) maxC = c
    }
  }
  if (maxR < 0) return { w: 0, h: 0, cells: [] }
  const w = maxC - minC + 1
  const h = maxR - minR + 1
  const cells = []
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      cells.push(slots[(minR + r) * size + (minC + c)]?.item || null)
    }
  }
  return { w, h, cells }
}

function patternCells(recipe) {
  const cells = []
  for (let r = 0; r < recipe.h; r++) {
    const row = recipe.pattern[r]
    for (let c = 0; c < recipe.w; c++) {
      const ch = row[c] || ' '
      cells.push(ch === ' ' ? null : recipe.keyMap[ch] || null)
    }
  }
  return cells
}

function matchShaped(recipe, crop) {
  if (recipe.w !== crop.w || recipe.h !== crop.h) return false
  const want = patternCells(recipe)
  for (let i = 0; i < want.length; i++) {
    if (want[i] !== crop.cells[i]) return false
  }
  return true
}

function matchShapeless(recipe, crop) {
  const have = crop.cells.filter(Boolean).slice().sort()
  const want = recipe.items.slice().sort()
  if (have.length !== want.length) return false
  for (let i = 0; i < have.length; i++) if (have[i] !== want[i]) return false
  return true
}

// Encontra a receita que casa com a grade. `hasTable` = a grade é 3×3 de mesa
// de trabalho (receitas com `needsTable` só saem lá).
export function findRecipe(slots, size, hasTable = size >= 3) {
  const crop = cropGrid(slots, size)
  if (!crop.w) return null
  for (const r of RECIPES) {
    if (r.needsTable && !hasTable) continue
    if (r.type === 'shaped' ? matchShaped(r, crop) : matchShapeless(r, crop)) {
      return { item: r.result, count: r.count, recipe: r }
    }
  }
  return null
}

// Consome 1 de cada slot usado (o que acontece ao pegar o resultado).
export function consumeGrid(slots) {
  return slots.map((s) => {
    if (!s) return null
    if (s.count <= 1) return null
    return { ...s, count: s.count - 1 }
  })
}

// Receitas que o jogador consegue fazer com o que tem (livro de receitas).
export function craftableWith(counts, hasTable) {
  const out = []
  for (const r of RECIPES) {
    if (r.needsTable && !hasTable) continue
    const need = new Map()
    const cells = r.type === 'shaped' ? patternCells(r) : r.items
    for (const c of cells) {
      if (!c) continue
      need.set(c, (need.get(c) || 0) + 1)
    }
    let ok = true
    for (const [k, n] of need) {
      if ((counts[k] || 0) < n) {
        ok = false
        break
      }
    }
    if (ok) out.push(r)
  }
  return out
}

export const smeltingFor = (key) => SMELTING[key] || null
