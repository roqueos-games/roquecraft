// RoqueCraft - registro de blocos.
//
// O id numérico é ESTÁVEL e cabe num Uint8 (o mundo é um Uint8Array por chunk).
// Nunca renumerar um id existente: ids são gravados no save do Firestore e nos
// diffs do Realtime Database. Bloco novo entra no fim.
//
// Cada bloco carrega tudo que os sistemas puros precisam: as texturas por face
// (nomes resolvidos em camadas do texture array), dureza + ferramenta correta
// (sobrevivência), drops, emissão e absorção de luz, e as flags de render
// (opaco / recortado / planta / líquido) e de física (sólido / gravidade).
//
// `roqueCraft.blocks.<key>` é a chave i18n do nome visível.

// `constants.js` não importa daqui — nenhum ciclo.
import { WATER_DROP } from './constants.js'

export const AIR = 0
/**
 * O TAMANHO DAS TABELAS POR ID — uma constante, e não um 256 escrito em cada
 * uma.
 *
 * ⚠️ A PALETA POR CHUNK (onda 2, 13/09) levou o MUNDO a 65 mil ids, mas as
 * dezesseis tabelas de consulta por id (`IS_SOLID`, `FACE_LAYERS`, as caixas
 * de forma, a gravidade…) continuaram `new Uint8Array(TABELA_DE_IDS)`. Com 226 blocos em
 * 18/09, o 256º bloco leria `undefined` em toda tabela: invisível, sem
 * colisão, sem textura, sem erro. A porta (16 ids) chegou a 242. Cresce aqui,
 * uma vez, e o teste `tabelasPorId.spec.js` cobra que nenhuma tabela volte ao
 * literal.
 */
export const TABELA_DE_IDS = 512

// tool: null (mão), 'pickaxe', 'axe', 'shovel', 'shears', 'hoe'
// tier: 0 madeira · 1 pedra · 2 ferro · 3 diamante (mínimo pra dropar)
// tint: 'foliage' | 'grass' | null - multiplicado pela cor do bioma no shader
/**
 * A DUREZA DO MATO — o motivo desta onda existir.
 *
 * ⚠️ "NÃO CONSIGO CORTAR A GRAMA" NÃO ERA A MIRA, NEM O DROP. Era que o jogo
 * executava a ação e não contava ao jogador que executou.
 *
 * Com `hardness: 0`, `breakTime` devolve 0; o laço de mineração faz
 * `progress += dt / Math.max(0.05, total)`, então o piso de 0,05 s manda e o
 * tufo some em TRÊS QUADROS a 60 fps. Nesse tempo a rachadura (opacidade =
 * progresso × 0,62) mal chega a aparecer, e o som de cavar, que sai a cada
 * 0,22 s de progresso, NUNCA dispara. Cortar mato não tinha cadência de
 * trabalho nenhuma — e gesto sem retorno lê como gesto ignorado.
 *
 * 0,05 dá 0,25 s na mão: tempo para a rachadura aparecer e para exatamente uma
 * batida de som antes do corte. Com tesoura são 0,019 s — instantâneo, que é o
 * que uma tesoura deve fazer com mato, e agora é diferença que se SENTE.
 *
 * ⚠️ E DECLARAR `tool: 'shears'` SÓ É SEGURO POR CAUSA DE UM PADRÃO.
 *
 * `dropsWith` recusa o drop quando o bloco exige ferramenta e a mão está vazia,
 * a menos que `b.tier === 0`. O mato não declara tier — quem o põe em zero é
 * `normalize` (`tier: d.tier ?? 0`). Se aquele padrão mudar, a semente de trigo
 * para de cair na mão vazia, e ela é a ÚNICA fonte de lavoura numa partida
 * nova: a agricultura inteira sai por essa porta, em silêncio.
 *
 * ⚠️ ISTO ESTAVA ESCRITO ERRADO AQUI. A primeira versão desta nota dizia que a
 * linha `tier: 0` no bloco é que segurava o drop, e o mutante que a apagou
 * PASSOU — porque a linha era decoração em cima do padrão. Comentário que
 * aponta para o lugar errado é pior que comentário nenhum: ele faz a próxima
 * pessoa proteger o que não precisa e mexer no que precisa.
 */
export const DUREZA_DO_MATO = 0.05

const DEFS = [
  // ── Terreno base ─────────────────────────────────────────────────────────
  {
    id: 1,
    key: 'stone',
    all: 'stone',
    hardness: 1.5,
    tool: 'pickaxe',
    tier: 0,
    drops: 'cobblestone',
  },
  { id: 2, key: 'dirt', all: 'dirt', hardness: 0.5, tool: 'shovel' },
  {
    id: 3,
    key: 'grassBlock',
    faces: { top: 'grass_top', side: 'grass_side', bottom: 'dirt' },
    hardness: 0.6,
    tool: 'shovel',
    drops: 'dirt',
    tint: 'grass',
    tintFaces: [2], // só o topo recebe a cor do bioma (o lado tem a franja pintada)
  },
  { id: 4, key: 'cobblestone', all: 'cobblestone', hardness: 2, tool: 'pickaxe', tier: 0 },
  { id: 5, key: 'sand', all: 'sand', hardness: 0.5, tool: 'shovel', gravity: true },
  {
    id: 6,
    key: 'gravel',
    all: 'gravel',
    hardness: 0.6,
    tool: 'shovel',
    gravity: true,
    // A pederneira existia no catálogo e NADA a produzia. No original ela cai
    // de cascalho, e é ela que faz cascalho valer a pena cavar.
    dropExtra: { item: 'flint', chance: 0.1 },
  },
  { id: 7, key: 'bedrock', all: 'bedrock', hardness: -1, unbreakable: true },
  {
    id: 8,
    key: 'clay',
    all: 'clay',
    hardness: 0.6,
    tool: 'shovel',
    drops: 'clay_ball',
    dropCount: 4,
  },
  { id: 9, key: 'snowBlock', all: 'snow', hardness: 0.2, tool: 'shovel' },
  {
    id: 10,
    key: 'ice',
    all: 'ice',
    hardness: 0.5,
    tool: 'pickaxe',
    translucent: true,
    alpha: 0.72,
    filter: 3,
  },

  // ── Madeira e folhagem ───────────────────────────────────────────────────
  {
    id: 11,
    key: 'oakLog',
    faces: { top: 'oak_log_top', side: 'oak_log', bottom: 'oak_log_top' },
    hardness: 2,
    tool: 'axe',
    flammable: true,
  },
  {
    id: 12,
    key: 'oakLeaves',
    all: 'oak_leaves',
    hardness: 0.2,
    tool: 'shears',
    cutout: true,
    filter: 1,
    tint: 'foliage',
    // `wind` na folhagem NÃO é o mesmo balanço da grama: aqui ele é a
    // MACIEZA da espécie, e é por isso que cada uma tem um número. Copa de
    // carvalho é larga e frouxa, bétula é fina e nervosa, selva é pesada,
    // pinheiro é agulha rígida e quase não se mexe. Sem essa diferença, uma
    // floresta mista balança em uníssono e vira papel de parede.
    wind: 0.32,
    drops: 'oakSapling',
    dropChance: 0.06,
    comTesoura: 'oakLeaves',
    // A maçã só cai de folha de CARVALHO, como no original — é o que dá à
    // floresta de carvalho uma razão de ser diferente da de bétula.
    dropExtra: { item: 'apple', chance: 0.008 },
    flammable: true,
  },
  {
    id: 13,
    key: 'birchLog',
    faces: { top: 'birch_log_top', side: 'birch_log', bottom: 'birch_log_top' },
    hardness: 2,
    tool: 'axe',
    flammable: true,
  },
  {
    id: 14,
    key: 'birchLeaves',
    all: 'birch_leaves',
    hardness: 0.2,
    tool: 'shears',
    cutout: true,
    filter: 1,
    tint: 'foliage',
    comTesoura: 'birchLeaves',
    wind: 0.4,
    flammable: true,
  },
  {
    id: 15,
    key: 'spruceLog',
    faces: { top: 'spruce_log_top', side: 'spruce_log', bottom: 'spruce_log_top' },
    hardness: 2,
    tool: 'axe',
    flammable: true,
  },
  {
    id: 16,
    key: 'spruceLeaves',
    all: 'spruce_leaves',
    hardness: 0.2,
    tool: 'shears',
    cutout: true,
    filter: 1,
    tint: 'foliage',
    wind: 0.16,
    flammable: true,
  },
  {
    id: 17,
    key: 'jungleLog',
    faces: { top: 'jungle_log_top', side: 'jungle_log', bottom: 'jungle_log_top' },
    hardness: 2,
    tool: 'axe',
    flammable: true,
  },
  {
    id: 18,
    key: 'jungleLeaves',
    all: 'jungle_leaves',
    hardness: 0.2,
    tool: 'shears',
    cutout: true,
    filter: 1,
    tint: 'foliage',
    wind: 0.26,
    flammable: true,
  },
  { id: 19, key: 'oakPlanks', all: 'oak_planks', hardness: 2, tool: 'axe', flammable: true },
  { id: 20, key: 'sprucePlanks', all: 'spruce_planks', hardness: 2, tool: 'axe', flammable: true },

  // ── Líquidos ─────────────────────────────────────────────────────────────
  {
    id: 21,
    key: 'water',
    all: 'water',
    liquid: true,
    solid: false,
    translucent: true,
    alpha: 0.62,
    filter: 3,
    unbreakable: true,
    replaceable: true,
  },
  {
    id: 22,
    key: 'lava',
    all: 'lava',
    liquid: true,
    solid: false,
    light: 15,
    emissive: 1,
    unbreakable: true,
    replaceable: true,
    damage: 4,
  },

  // ── Minérios ─────────────────────────────────────────────────────────────
  {
    id: 23,
    key: 'coalOre',
    all: 'coal_ore',
    hardness: 3,
    tool: 'pickaxe',
    tier: 0,
    drops: 'coal',
    xp: 1,
  },
  {
    id: 24,
    key: 'ironOre',
    all: 'iron_ore',
    hardness: 3,
    tool: 'pickaxe',
    tier: 1,
    drops: 'raw_iron',
  },
  {
    id: 25,
    key: 'copperOre',
    all: 'copper_ore',
    hardness: 3,
    tool: 'pickaxe',
    tier: 1,
    drops: 'raw_copper',
    dropCount: 3,
  },
  {
    id: 26,
    key: 'goldOre',
    all: 'gold_ore',
    hardness: 3,
    tool: 'pickaxe',
    tier: 2,
    drops: 'raw_gold',
  },
  {
    id: 27,
    key: 'redstoneOre',
    all: 'redstone_ore',
    hardness: 3,
    tool: 'pickaxe',
    tier: 2,
    drops: 'redstone',
    dropCount: 4,
    light: 7,
    emissive: 0.35,
  },
  {
    id: 28,
    key: 'diamondOre',
    all: 'diamond_ore',
    hardness: 3,
    tool: 'pickaxe',
    tier: 2,
    drops: 'diamond',
    xp: 4,
  },
  {
    id: 29,
    key: 'emeraldOre',
    all: 'emerald_ore',
    hardness: 3,
    tool: 'pickaxe',
    tier: 2,
    drops: 'emerald',
    xp: 5,
  },
  {
    id: 30,
    key: 'deepslate',
    all: 'deepslate',
    hardness: 3,
    tool: 'pickaxe',
    tier: 0,
    drops: 'cobblestone',
  },

  // ── Pedras decorativas ───────────────────────────────────────────────────
  { id: 31, key: 'granite', all: 'granite', hardness: 1.5, tool: 'pickaxe', tier: 0 },
  { id: 32, key: 'andesite', all: 'andesite', hardness: 1.5, tool: 'pickaxe', tier: 0 },
  { id: 33, key: 'diorite', all: 'diorite', hardness: 1.5, tool: 'pickaxe', tier: 0 },
  { id: 34, key: 'stoneBricks', all: 'stone_bricks', hardness: 2, tool: 'pickaxe', tier: 0 },
  {
    id: 35,
    key: 'mossyCobblestone',
    all: 'mossy_cobblestone',
    hardness: 2,
    tool: 'pickaxe',
    tier: 0,
  },
  { id: 36, key: 'bricks', all: 'bricks', hardness: 2, tool: 'pickaxe', tier: 0 },
  {
    id: 37,
    key: 'sandstone',
    faces: { top: 'sandstone_top', side: 'sandstone', bottom: 'sandstone_top' },
    hardness: 0.8,
    tool: 'pickaxe',
    tier: 0,
  },
  { id: 38, key: 'obsidian', all: 'obsidian', hardness: 12, tool: 'pickaxe', tier: 3 },
  { id: 39, key: 'terracotta', all: 'terracotta', hardness: 1.4, tool: 'pickaxe', tier: 0 },
  { id: 40, key: 'redSand', all: 'red_sand', hardness: 0.5, tool: 'shovel', gravity: true },

  // ── Blocos de material ───────────────────────────────────────────────────
  { id: 41, key: 'ironBlock', all: 'iron_block', hardness: 5, tool: 'pickaxe', tier: 1 },
  { id: 42, key: 'goldBlock', all: 'gold_block', hardness: 3, tool: 'pickaxe', tier: 2 },
  { id: 43, key: 'diamondBlock', all: 'diamond_block', hardness: 5, tool: 'pickaxe', tier: 2 },
  {
    id: 44,
    key: 'coalBlock',
    all: 'coal_block',
    hardness: 5,
    tool: 'pickaxe',
    tier: 0,
    flammable: true,
  },

  // ── Vidro e luz ──────────────────────────────────────────────────────────
  {
    id: 45,
    key: 'glass',
    all: 'glass',
    hardness: 0.3,
    translucent: true,
    alpha: 0.36,
    filter: 0,
    drops: null,
  },
  {
    id: 46,
    key: 'glowstone',
    all: 'glowstone',
    hardness: 0.3,
    light: 15,
    emissive: 1,
    drops: 'glowstone_dust',
    dropCount: 3,
  },
  // ── A TOCHA ───────────────────────────────────────────────────────────────
  //
  // "A tocha também está horrorosa" — founder, 25/08/2026. Estava, e dá pra
  // dizer exatamente por quê: ela era `plant: true, scale: 0.16`, ou seja o
  // MESMO desenho do matinho — duas folhas cruzadas — encolhido a 16% da
  // célula. Não havia tocha nenhuma no jogo; havia um X de 2,5 pixels flutuando
  // no chão. Nenhuma quantidade de textura conserta isso, porque o defeito é
  // de FORMA.
  //
  // Agora é forma livre: um poste de 2/16 de lado e 10/16 de altura, com a
  // chama em tile próprio (o shader anima essa camada, ver `gIsChama`).
  //
  // `faces.lista` tem a chama SÓ na fatia +y. Não é decoração: o mesher lê a
  // camada por FATIA DE FACE (`FACE_LAYERS[id * 6 + f]`), então é declarando a
  // chama em +y que os quads da chama — que são emitidos com f = 2 — recebem a
  // camada certa. As outras cinco fatias são a madeira do poste.
  {
    id: 47,
    key: 'torch',
    faces: { lista: ['torch', 'torch', 'torch_flame', 'torch', 'torch', 'torch'] },
    hardness: 0,
    light: 14,
    emissive: 1,
    cutout: true,
    solid: false,
    filter: 0,
    tocha: { parede: null },
  },
  {
    id: 48,
    key: 'lantern',
    all: 'lantern',
    hardness: 3.5,
    tool: 'pickaxe',
    tier: 0,
    light: 15,
    emissive: 1,
    cutout: true,
    filter: 0,
    // Forma própria (uma caixa pequena) em `formas.js`; sem ela a lanterna
    // renderiza como cubo 1×1 e vira uma caixa de vidro oca de perto.
    lanterna: {},
  },

  // ── Utilidades ───────────────────────────────────────────────────────────
  {
    id: 49,
    key: 'craftingTable',
    faces: { top: 'crafting_table_top', side: 'crafting_table_side', bottom: 'oak_planks' },
    hardness: 2.5,
    tool: 'axe',
    flammable: true,
    interact: 'crafting',
  },
  {
    id: 50,
    key: 'furnace',
    faces: {
      top: 'furnace_top',
      side: 'furnace_side',
      bottom: 'furnace_top',
      front: 'furnace_front',
    },
    hardness: 3.5,
    tool: 'pickaxe',
    tier: 0,
    interact: 'furnace',
  },
  {
    id: 51,
    key: 'chest',
    faces: { top: 'chest_top', side: 'chest_side', bottom: 'chest_top', front: 'chest_front' },
    hardness: 2.5,
    tool: 'axe',
    flammable: true,
    interact: 'chest',
  },
  // O SUPORTE DE POÇÕES. Terceira mobília, ao lado do baú e da fornalha, e a
  // primeira que não tem combustível: o pó de blaze do jogo de referência vem
  // de um mob do Nether que não existe aqui, e pôr um combustível inalcançável
  // travaria a fermentação inteira. O porquê está em `fermentacao.js`.
  {
    id: 225,
    key: 'brewingStand',
    faces: { top: 'brewing_stand_top', side: 'brewing_stand_side', bottom: 'cobblestone' },
    hardness: 0.5,
    tool: 'pickaxe',
    tier: 0,
    interact: 'brew',
  },

  // A VERRUGA DO NETHER, que cresce no chão de areia das almas.
  //
  // ⚠️ ELA NÃO TEM ESTÁGIO DE CRESCIMENTO, e isso é escolha: plantio pediria o
  // ciclo inteiro da lavoura (solo, hidratação, estágios, fila) por uma planta
  // que só existe numa dimensão. Aqui ela NASCE no Nether e se colhe lá — o que
  // faz do Nether um destino em vez de um cenário, e o que torna a viagem entre
  // dimensões uma coisa que paga.
  //
  // `semItem` não: quebrar dá o item, e é o item que vira poção.
  {
    id: 226,
    key: 'netherWart',
    all: 'nether_wart',
    hardness: 0,
    cutout: true,
    plant: true,
    solid: false,
    filter: 0,
    drops: 'nether_wart',
    semItem: true,
  },

  // A MESA DE ENCANTAMENTO — o primeiro lugar do jogo onde nível vira coisa.
  //
  // Fica junto do baú e da fornalha e não junto da bancada de propósito: como
  // eles, ela tem estado do jogador dentro (o que ela cobra depende do que o
  // item já carrega), e como eles ela responde ao clique direito.
  //
  // Obsidiana embaixo porque é do que ela é feita, e porque dar textura própria
  // a uma face que ninguém vê custaria uma camada do texture array à toa.
  {
    id: 224,
    key: 'enchantingTable',
    faces: {
      top: 'enchanting_table_top',
      side: 'enchanting_table_side',
      bottom: 'obsidian',
    },
    hardness: 5,
    tool: 'pickaxe',
    tier: 0,
    interact: 'enchant',
  },
  {
    id: 52,
    key: 'bookshelf',
    faces: { top: 'oak_planks', side: 'bookshelf', bottom: 'oak_planks' },
    hardness: 1.5,
    tool: 'axe',
    flammable: true,
  },

  // ── Lã (todas as cores no mesmo grupo de som/dureza) ─────────────────────
  { id: 53, key: 'whiteWool', all: 'wool_white', hardness: 0.8, tool: 'shears', flammable: true },
  { id: 54, key: 'redWool', all: 'wool_red', hardness: 0.8, tool: 'shears', flammable: true },
  { id: 55, key: 'blueWool', all: 'wool_blue', hardness: 0.8, tool: 'shears', flammable: true },
  { id: 56, key: 'greenWool', all: 'wool_green', hardness: 0.8, tool: 'shears', flammable: true },

  // ── Plantas (geometria em cruz, sem colisão) ─────────────────────────────
  {
    id: 57,
    key: 'tallGrass',
    all: 'tall_grass',
    hardness: DUREZA_DO_MATO,
    // Tesoura é a ferramenta do mato. O drop na mão vazia sobrevive porque
    // `normalize` já dá `tier: 0` por padrão — ver a nota de DUREZA_DO_MATO.
    tool: 'shears',
    cutout: true,
    plant: true,
    solid: false,
    filter: 0,
    tint: 'grass',
    replaceable: true,
    wind: 1,
    // ⚠️ ERA `drops: null`, E ISSO TRANCAVA A AGRICULTURA INTEIRA.
    //
    // O mato é a ÚNICA fonte de semente numa partida nova: não há trigo no
    // mundo gerado, e sem semente não há lavoura, pão nem reprodução de bicho.
    // Enquanto ele não dropava nada, cortar mato era puro efeito sonoro.
    //
    // A chance é a do jogo de referência, e ela importa: 100% faria uma tarde
    // de foice render mais semente do que qualquer um usa, e a lavoura perderia
    // a razão de existir.
    drops: 'wheat_seeds',
    dropChance: 0.125,
    comTesoura: 'tallGrass',
    flammable: true,
  },
  {
    id: 58,
    key: 'redFlower',
    all: 'flower_red',
    hardness: DUREZA_DO_MATO,
    // Tesoura é a ferramenta do mato. O drop na mão vazia sobrevive porque
    // `normalize` já dá `tier: 0` por padrão — ver a nota de DUREZA_DO_MATO.
    tool: 'shears',
    cutout: true,
    plant: true,
    solid: false,
    filter: 0,
    replaceable: true,
    wind: 0.6,
  },
  {
    id: 59,
    key: 'yellowFlower',
    all: 'flower_yellow',
    hardness: DUREZA_DO_MATO,
    // Tesoura é a ferramenta do mato. O drop na mão vazia sobrevive porque
    // `normalize` já dá `tier: 0` por padrão — ver a nota de DUREZA_DO_MATO.
    tool: 'shears',
    cutout: true,
    plant: true,
    solid: false,
    filter: 0,
    replaceable: true,
    wind: 0.6,
  },
  {
    id: 60,
    key: 'deadBush',
    all: 'dead_bush',
    hardness: DUREZA_DO_MATO,
    // Tesoura é a ferramenta do mato. O drop na mão vazia sobrevive porque
    // `normalize` já dá `tier: 0` por padrão — ver a nota de DUREZA_DO_MATO.
    tool: 'shears',
    cutout: true,
    plant: true,
    solid: false,
    filter: 0,
    replaceable: true,
    wind: 0.5,
    drops: 'stick',
  },
  {
    id: 61,
    key: 'cactus',
    faces: { top: 'cactus_top', side: 'cactus_side', bottom: 'cactus_top' },
    hardness: 0.4,
    damage: 1,
    filter: 0,
    cutout: true,
  },
  {
    id: 62,
    key: 'sugarCane',
    all: 'sugar_cane',
    hardness: 0,
    cutout: true,
    plant: true,
    solid: false,
    filter: 0,
    wind: 0.8,
    // Dropa a si mesma: é a única planta do jogo que se replanta com o próprio
    // bloco, e é assim no original — quem colhe deixa o pé de baixo e volta
    // depois. `cana` marca o que a fila precisa visitar.
    cana: true,
  },
  {
    id: 63,
    key: 'pumpkin',
    faces: { top: 'pumpkin_top', side: 'pumpkin_side', bottom: 'pumpkin_top' },
    hardness: 1,
    tool: 'axe',
  },
  {
    id: 64,
    key: 'podzol',
    faces: { top: 'podzol_top', side: 'podzol_side', bottom: 'dirt' },
    hardness: 0.5,
    tool: 'shovel',
    drops: 'dirt',
  },
  {
    id: 65,
    key: 'snowLayer',
    all: 'snow',
    hardness: 0.1,
    tool: 'shovel',
    // SÓLIDA, com 12,5% de altura. Era `solid: false` — o mesher desenhava a
    // laje fina e a física não a via, então em bioma nevado o jogador andava
    // com os pés dentro da neve. Agora a `slab` vira caixa de colisão de
    // verdade (ver ALTURA_SOLIDA), e `replaceable` continua deixando construir
    // por cima sem precisar cavar.
    solid: true,
    replaceable: true,
    cutout: true,
    filter: 0,
    slab: 0.125,
    drops: 'snowball',
  },
  {
    id: 66,
    key: 'oakSapling',
    all: 'oak_sapling',
    hardness: 0,
    cutout: true,
    plant: true,
    solid: false,
    filter: 0,
    replaceable: true,
    wind: 0.5,
  },
  { id: 67, key: 'moss', all: 'moss', hardness: 0.1, tool: 'hoe', tint: 'grass' },
  {
    id: 68,
    key: 'amethyst',
    all: 'amethyst',
    hardness: 1.5,
    tool: 'pickaxe',
    tier: 0,
    light: 5,
    emissive: 0.6,
    translucent: true,
    alpha: 0.85,
  },
]

// ── Lajes ───────────────────────────────────────────────────────────────────
//
// Meia altura. Cada material tem DUAS ids — a metade de baixo e a de cima — e
// as duas juntas viram o bloco cheio de volta (a "laje dupla" do original, que
// aqui não precisa de id própria: é o bloco cheio mesmo).
//
// POR QUE ID POR VARIANTE, e não byte de estado por voxel. O byte custa uma
// tabela paralela em TODO chunk carregado (32 KB por chunk, o mesmo tamanho dos
// blocos) e atravessa worker, save, rede e multijogador — é uma mudança de
// formato de dados, não uma funcionalidade. A FORMA, por outro lado, já é
// conceito por id no mesher desde que a camada de neve existe (`slab`). A laje
// entra pelo caminho que já está aberto.
//
// O que isso custa: 2 ids por material, num espaço de 256 onde 69 estão em uso.
// Escada custará 8 por material, e é aí que a conta começa a apertar — quando
// apertar, `FORMA_BASE`/`FORMA_TOPO` já são a abstração que o mesher e a física
// leem, e trocar a fonte delas não mexe em nenhum dos dois.
//
// `cutout: true` NÃO é sobre transparência: é o que tira a laje de `IS_OPAQUE`,
// pra que o vizinho continue desenhando a face virada pra ela. Sem isso o chão
// debaixo de uma laje de topo vira buraco. Mesmo motivo da neve.
const LAJES = [
  ['stoneSlab', 'stone', 'stone', 1.5, 'pickaxe'],
  ['cobblestoneSlab', 'cobblestone', 'cobblestone', 2, 'pickaxe'],
  ['oakSlab', 'oakPlanks', 'oak_planks', 2, 'axe'],
  ['spruceSlab', 'sprucePlanks', 'spruce_planks', 2, 'axe'],
]
let proximaIdDeLaje = 69
export const LAJE_DO_BLOCO = {} // 'stone' → { base: 'stoneSlab', topo: 'stoneSlabTopo' }
export const BLOCO_DA_LAJE = {} // 'stoneSlab' → 'stone'
for (const [chave, cheio, textura, hardness, tool] of LAJES) {
  const base = chave
  const topo = `${chave}Topo`
  LAJE_DO_BLOCO[cheio] = { base, topo }
  BLOCO_DA_LAJE[base] = cheio
  BLOCO_DA_LAJE[topo] = cheio
  for (const [key, ehTopo] of [
    [base, false],
    [topo, true],
  ]) {
    DEFS.push({
      id: proximaIdDeLaje++,
      key,
      all: textura,
      hardness,
      tool,
      cutout: true,
      solid: true,
      slab: 0.5,
      slabTopo: ehTopo,
      // As duas metades do mesmo material dropam a MESMA peça: quem quebra uma
      // laje de topo recebe uma laje, e escolhe de novo onde encaixá-la.
      drops: base,
      flammable: tool === 'axe',
      // A metade de cima NÃO vira item. Só existe uma peça de laje por
      // material, e QUEM decide a metade é o encaixe na hora de colocar — não
      // uma segunda entrada no inventário. Sem isto o criativo mostraria oito
      // lajes onde o jogador espera quatro, e o jogador teria que saber de
      // antemão em que metade quer construir.
      semItem: ehTopo,
    })
  }
}

// ── Cama ────────────────────────────────────────────────────────────────────
//
// DUAS células: pé e cabeceira. Só o pé é item — quem coloca põe a peça
// inteira, e é o olhar que decide pra onde a cabeceira aponta.
//
// 9/16 de altura, como no jogo de referência: dá pra pisar em cima sem pular e
// a mesa de trabalho ao lado continua parecendo mais alta que a cama.
//
// ⚠️ ERA duas ids, e a nota antiga aqui defendia isso dizendo que o desenho do
// topo não tinha direção "de propósito". Estava invertido: o desenho não tinha
// direção PORQUE não havia id pra guardá-la. O founder viu na tela em
// 24/08/2026 — a cama não parecia a do original — e a causa era essa. Agora são
// oito.
DEFS.push(
  // Oito ids: duas metades × quatro direções. A `orient` é pra onde a PONTA DE
  // FORA de cada metade aponta — e as duas metades da mesma cama apontam pra
  // lados OPOSTOS, que é o que põe os quatro pés nas quatro quinas do móvel.
  //
  // Só a variante −Z é item. As outras sete existem no mundo, dropam a `bed` e
  // nunca aparecem no inventário: a peça é uma só e a direção sai de para onde
  // o jogador estava olhando. É a mesma regra da laje e da escada.
  //
  // A lista de seis texturas é obrigatória aqui: a cama tem PONTA DE FORA,
  // PONTA DE DENTRO e duas faces LONGAS, todas diferentes — e qual lado recebe
  // qual muda a cada giro. Foi por não ter isso que a cama da rodada 8 nasceu
  // com a mesma textura nos quatro lados e o travesseiro sem direção.
  ...(() => {
    const defs = []
    // ordem canônica das faces: +x −x +y −y +z −z
    const porOrient = {
      5: (fora, dentro, lado, topo, base) => [lado, lado, topo, base, dentro, fora],
      0: (fora, dentro, lado, topo, base) => [fora, dentro, topo, base, lado, lado],
      4: (fora, dentro, lado, topo, base) => [lado, lado, topo, base, fora, dentro],
      1: (fora, dentro, lado, topo, base) => [dentro, fora, topo, base, lado, lado],
    }
    let proximaId = 123
    for (const cabeceira of [false, true]) {
      const raiz = cabeceira ? 'bedHead' : 'bed'
      const fora = cabeceira ? 'bed_end_head' : 'bed_end_foot'
      const dentro = 'bed_end_inner'
      const lado = cabeceira ? 'bed_side_head' : 'bed_side_foot'
      const topo = cabeceira ? 'bed_top_head' : 'bed_top_foot'
      for (const [orient, sufixo] of [
        [5, ''],
        [0, 'Px'],
        [4, 'Pz'],
        [1, 'Nx'],
      ]) {
        // A variante canônica mantém os ids 109 e 110, que já estão em save de
        // gente. Renumerar id existente é o único pecado mortal deste arquivo.
        const id = orient === 5 ? (cabeceira ? 110 : 109) : proximaId++
        defs.push({
          id,
          key: `${raiz}${sufixo}`,
          faces: { lista: porOrient[orient](fora, dentro, lado, topo, 'bed_bottom') },
          hardness: 0.2,
          tool: 'axe',
          cutout: true,
          solid: true,
          slab: 0.5625,
          interact: 'sleep',
          cama: { orient, cabeceira },
          semItem: !(orient === 5 && !cabeceira),
          drops: 'bed',
          flammable: true,
        })
      }
    }
    return defs
  })(),
)

// ── Escadas ─────────────────────────────────────────────────────────────────
//
// Oito ids por material: quatro orientações × duas metades. A orientação é a
// direção pra onde o DEGRAU BAIXO aponta — que é o lado de onde se sobe, e
// portanto o lado do jogador na hora de colocar.
//
// Só a primeira das oito é item. As outras sete existem no mundo, dropam a
// primeira, e nunca aparecem no inventário: a peça é uma só e a orientação sai
// de para onde o jogador estava olhando. É a mesma regra da laje.
//
// `ORIENTACOES` usa o índice de face canônico (0:+x 1:-x 4:+z 5:-z) pra não
// inventar uma segunda convenção de direção dentro do mesmo motor.
export const ORIENTACOES = [0, 1, 4, 5]
const SUFIXO_ORIENT = { 0: '', 1: 'Nx', 4: 'Pz', 5: 'Nz' }

const ESCADAS = [
  ['stoneStairs', 'stone', 'stone', 1.5, 'pickaxe'],
  ['cobblestoneStairs', 'cobblestone', 'cobblestone', 2, 'pickaxe'],
  ['oakStairs', 'oakPlanks', 'oak_planks', 2, 'axe'],
  ['spruceStairs', 'sprucePlanks', 'spruce_planks', 2, 'axe'],
]
let proximaIdDeEscada = 77
export const ESCADA_DO_BLOCO = {} // 'stone' → 'stoneStairs'
export const BLOCO_DA_ESCADA = {} // qualquer das 8 → 'stone'
// chave canônica + orientação + metade → chave da variante
export const VARIANTE_DE_ESCADA = {}
for (const [chave, cheio, textura, hardness, tool] of ESCADAS) {
  ESCADA_DO_BLOCO[cheio] = chave
  for (const o of ORIENTACOES) {
    for (const topo of [false, true]) {
      const key = `${chave}${SUFIXO_ORIENT[o]}${topo ? 'Topo' : ''}`
      BLOCO_DA_ESCADA[key] = cheio
      VARIANTE_DE_ESCADA[`${chave}|${o}|${topo ? 't' : 'b'}`] = key
      DEFS.push({
        id: proximaIdDeEscada++,
        key,
        all: textura,
        hardness,
        tool,
        cutout: true,
        solid: true,
        escada: { orient: o, topo },
        semItem: key !== chave,
        drops: chave,
        flammable: tool === 'axe',
      })
    }
  }
}

// ── Cercas ──────────────────────────────────────────────────────────────────
//
// A cerca entra AGORA porque a pecuária entrou: dá pra criar rebanho e não há
// com o que cercá-lo. Um curral feito de blocos cheios é um muro — você não vê
// os bichos lá dentro, e ver o rebanho é metade do prazer de ter um.
//
// ⚠️ CONEXÃO CODIFICADA NO ID, e a razão é a mesma da laje e da escada: o mundo
// é um `Uint8Array` de ids. Um segundo array de estado por voxel dobraria a
// memória de TODO chunk pra servir uma família de bloco, e obrigaria mesher,
// luz, física e rede a carregar o segundo dado em toda leitura. São 16 estados
// (quatro lados, ligado ou não), então 16 ids — o mesmo preço de duas famílias
// de escada.
//
// ⚠️ E POR ISSO SÓ UM MATERIAL POR ENQUANTO. `blocks.js` tem 128 ids de 256
// usados; cada madeira nova custa mais 16. Carvalho primeiro, o resto quando o
// founder disser que quer — a conta está escrita no plano da rodada.
//
// Os bits: 1 = −Z, 2 = +X, 4 = +Z, 8 = −X. Mesma ordem em `formas.js`.
export const BITS_DA_CERCA = Object.freeze({ nz: 1, px: 2, pz: 4, nx: 8 })
const CERCAS = [['oakFence', 'oakPlanks', 'oak_planks', 2, 'axe']]
let proximaIdDeCerca = 129
/** 'oakPlanks' → 'oakFence' (a chave canônica, a que vira item). */
export const CERCA_DO_BLOCO = {}
/** qualquer variante → a chave canônica. */
export const BLOCO_DA_CERCA = {}
/** `chave|bits` → chave da variante. */
export const VARIANTE_DE_CERCA = {}
for (const [chave, cheio, textura, hardness, tool] of CERCAS) {
  CERCA_DO_BLOCO[cheio] = chave
  for (let bits = 0; bits < 16; bits++) {
    const key = bits === 0 ? chave : `${chave}C${bits}`
    BLOCO_DA_CERCA[key] = chave
    VARIANTE_DE_CERCA[`${chave}|${bits}`] = key
    DEFS.push({
      id: proximaIdDeCerca++,
      key,
      all: textura,
      hardness,
      tool,
      // `cutout` porque a cerca é vazada: sem isto o vizinho esconde as faces
      // dela e o poste some quando encosta em qualquer bloco.
      cutout: true,
      solid: true,
      cerca: { bits },
      semItem: bits !== 0,
      drops: chave,
      flammable: true,
    })
  }
}

// ── Portões ─────────────────────────────────────────────────────────────────
//
// A cerca tirou a passagem do jogador: a caixa dela vai até o teto da célula
// (as caixas deste motor vivem dentro da célula, então 1,5 como no original não
// cabe), e o portão é o conserto certo — o mesmo conserto do original.
//
// 4 orientações × aberto/fechado = 8 ids. Reusa a textura da tábua, como a
// escada e a cerca: nenhuma arte nova, que está congelada.
//
// ⚠️ OS DOIS SÃO `solid`, E O ABERTO TEM CAIXA DE COLISÃO VAZIA. Não é
// rodeio: `solid: false` foi a primeira versão, e a sonda mostrou o defeito na
// hora — a MIRA usa `solidAt` como filtro, então um portão aberto ficava
// invisível pro raycast: dava pra abrir e não dava pra fechar nem pra quebrar.
// Marcado como sólido, a mira o enxerga; com a lista de caixas vazia
// (`registrarCaixas(id, [])` em `formas.js`), a física atravessa. As duas
// perguntas são diferentes e agora têm respostas diferentes.
const PORTOES = [['oakGate', 'oakPlanks', 'oak_planks', 2, 'axe']]
let proximaIdDePortao = 145
/** 'oakPlanks' → 'oakGate'. */
export const PORTAO_DO_BLOCO = {}
/** qualquer variante → a chave canônica. */
export const BLOCO_DO_PORTAO = {}
/** `chave|orient|aberto` → chave da variante. */
export const VARIANTE_DE_PORTAO = {}
for (const [chave, cheio, textura, hardness, tool] of PORTOES) {
  PORTAO_DO_BLOCO[cheio] = chave
  for (const o of ORIENTACOES) {
    for (const aberto of [false, true]) {
      const key = `${chave}${SUFIXO_ORIENT[o]}${aberto ? 'Aberto' : ''}`
      BLOCO_DO_PORTAO[key] = chave
      VARIANTE_DE_PORTAO[`${chave}|${o}|${aberto ? 'a' : 'f'}`] = key
      DEFS.push({
        id: proximaIdDePortao++,
        key,
        all: textura,
        hardness,
        tool,
        cutout: true,
        solid: true,
        portao: { orient: o, aberto },
        semItem: key !== chave,
        drops: chave,
        flammable: true,
        interact: 'gate',
      })
    }
  }
}

// ── A PORTA ─────────────────────────────────────────────────────────────────
//
// "o aldeão não tem casa fechada" — a vila tinha vão aberto desde a onda 5 de
// 13/09 porque não existia bloco de porta no catálogo. Goal 21, onda 2.
//
// Dois blocos de altura, 4 orientações × aberta/fechada × metade de baixo/de
// cima = 16 ids. É o portão (`PORTOES`, acima) esticado para cima: a metade de
// baixo é a chave canônica e a que vira item; a de cima nunca é item e nunca
// dropa — quebrar qualquer metade tira as duas (`porta.js`), como a cama.
//
// ⚠️ AS DUAS SÃO `solid`, E A ABERTA TEM CAIXA FINA NA DOBRADIÇA. A mesma lição
// do portão: `solid: false` some da mira. A aberta mantém 3/16 de espessura
// junto ao batente para o jogador não atravessar a folha — e 13/16 de vão para
// passar. Arte: `oak_door_bottom` e `oak_door_top`, desenhadas no gerador
// (liberadas pelo founder em 18/09).
const PORTAS = [['oakDoor', 'oakPlanks', 'oak_door', 3, 'axe']]
let proximaIdDePorta = 227
/** 'oakPlanks' → 'oakDoor'. */
export const PORTA_DO_BLOCO = {}
/** qualquer variante → a chave canônica. */
export const BLOCO_DA_PORTA = {}
/** `chave|orient|a/f|b/c` → chave da variante. */
export const VARIANTE_DE_PORTA = {}
for (const [chave, cheio, textura, hardness, tool] of PORTAS) {
  PORTA_DO_BLOCO[cheio] = chave
  for (const o of ORIENTACOES) {
    for (const aberta of [false, true]) {
      for (const cima of [false, true]) {
        const key = `${chave}${SUFIXO_ORIENT[o]}${aberta ? 'Aberta' : ''}${cima ? 'Cima' : ''}`
        BLOCO_DA_PORTA[key] = chave
        VARIANTE_DE_PORTA[`${chave}|${o}|${aberta ? 'a' : 'f'}|${cima ? 'c' : 'b'}`] = key
        DEFS.push({
          id: proximaIdDePorta++,
          key,
          all: `${textura}_${cima ? 'top' : 'bottom'}`,
          hardness,
          tool,
          cutout: true,
          solid: true,
          porta: { orient: o, aberta, cima },
          semItem: key !== chave,
          drops: cima ? null : chave,
          flammable: true,
          interact: 'door',
        })
      }
    }
  }
}

// ── O ALÇAPÃO ───────────────────────────────────────────────────────────────
//
// O portão deitado: uma célula, 4 orientações × aberto/fechado = 8 ids.
// Fechado é uma tampa de 3/16 no chão da célula — anda-se por cima, e é o que
// tapa o buraco da escada de mina. Aberto, a tampa levanta e fica em pé,
// encostada na borda da célula do lado da dobradiça; o buraco reaparece.
// Arte própria (`oak_trapdoor`, liberada pelo founder em 18/09).
//
// ⚠️ OS DOIS SÃO `solid` E OS DOIS COLIDEM NA TAMPA (fechado: a laje fina;
// aberto: a folha em pé). Nenhum registra caixa vazia como o portão: a tampa
// em pé continua sendo uma tábua, e uma tábua que se atravessa é o defeito da
// porta aberta, resolvido em `formas.js`.
const ALCAPOES = [['oakTrapdoor', 'oakPlanks', 'oak_trapdoor', 3, 'axe']]
let proximaIdDeAlcapao = 243
/** 'oakPlanks' → 'oakTrapdoor'. */
export const ALCAPAO_DO_BLOCO = {}
/** qualquer variante → a chave canônica. */
export const BLOCO_DO_ALCAPAO = {}
/** `chave|orient|a/f` → chave da variante. */
export const VARIANTE_DE_ALCAPAO = {}
for (const [chave, cheio, textura, hardness, tool] of ALCAPOES) {
  ALCAPAO_DO_BLOCO[cheio] = chave
  for (const o of ORIENTACOES) {
    for (const aberto of [false, true]) {
      const key = `${chave}${SUFIXO_ORIENT[o]}${aberto ? 'Aberto' : ''}`
      BLOCO_DO_ALCAPAO[key] = chave
      VARIANTE_DE_ALCAPAO[`${chave}|${o}|${aberto ? 'a' : 'f'}`] = key
      DEFS.push({
        id: proximaIdDeAlcapao++,
        key,
        all: textura,
        hardness,
        tool,
        cutout: true,
        solid: true,
        alcapao: { orient: o, aberto },
        semItem: key !== chave,
        drops: chave,
        flammable: true,
        interact: 'trapdoor',
      })
    }
  }
}

// ── Vida do leito do mar ────────────────────────────────────────────────────
//
// "precisamos de algas" — founder, 25/08/2026.
//
// As duas são `aguado: true`, que é o que permite existir planta DENTRO da
// água neste motor (ver a nota do campo em `normalize`).
//
// `wind` alto de propósito: o mesmo atributo que balança o mato ao vento
// balança a alga na correnteza, e debaixo d'água o movimento certo é mais lento
// e mais AMPLO que na superfície. É o balanço que separa alga viva de decalque
// verde no fundo.
DEFS.push(
  {
    id: 157,
    key: 'kelp',
    all: 'kelp',
    hardness: 0,
    cutout: true,
    plant: true,
    solid: false,
    filter: 1,
    wind: 1.15,
    aguado: true,
  },
  {
    id: 158,
    key: 'seagrass',
    all: 'seagrass',
    hardness: 0,
    cutout: true,
    plant: true,
    solid: false,
    filter: 0,
    wind: 0.95,
    aguado: true,
    scale: 0.62,
  },
)

// ── Bambu ───────────────────────────────────────────────────────────────────
//
// "precisamos de algas, bambus" — founder, 25/08/2026.
//
// DOIS ids, e a diferença entre eles é só onde há folha. Bambu real é colmo nu
// embaixo e folhagem só no alto; um id só faria uma touceira folhuda da base ao
// topo, que é mato, não bambu. A geração usa `bambooTop` nos dois últimos
// blocos de cada colmo.
//
// `faces.lista` põe a folhagem na fatia +y porque é de lá que os quads cruzados
// da folha tiram a camada — a mesma mecânica da chama da tocha. As outras
// fatias são o colmo.
DEFS.push(
  {
    id: 159,
    key: 'bamboo',
    faces: { lista: ['bamboo', 'bamboo', 'bamboo', 'bamboo', 'bamboo', 'bamboo'] },
    hardness: 0.6,
    tool: 'axe',
    cutout: true,
    // ⚠️ SÓLIDO, e a razão saiu de um teste, não de gosto.
    //
    // `mundoIlha.spec.js` acusou 11 folhas de árvore soltas na semente 999416
    // assim que o bambu entrou. A cadeia era: folha — BAMBU — folha. O colmo
    // cresce por dentro de uma copa de selva e ocupa células que seriam folha;
    // com `solid: false` ele não conta como caminho no preenchimento, e a
    // ponta da copa do outro lado dele ficava órfã.
    //
    // Marcar sólido é o modelo CERTO, não um jeito de calar o teste: bambu
    // segura o corpo de quem sobe nele, e a caixa de colisão registrada abaixo
    // é o próprio colmo de 3/16 — não um cubo cheio.
    solid: true,
    filter: 1,
    flammable: true,
    bambu: { folha: false },
  },
  {
    id: 160,
    key: 'bambooTop',
    faces: {
      lista: ['bamboo', 'bamboo', 'bamboo_leaves', 'bamboo', 'bamboo', 'bamboo'],
    },
    hardness: 0.6,
    tool: 'axe',
    cutout: true,
    solid: true, // ver a nota no colmo sem folha, logo acima
    filter: 1,
    flammable: true,
    wind: 0.5,
    drops: 'bamboo',
    semItem: true,
    bambu: { folha: true },
  },
)

// ── Lavoura ─────────────────────────────────────────────────────────────────
//
// DOIS ids pro mesmo chão, e a diferença é a água. Solo arado seco e solo arado
// molhado são blocos distintos porque a hidratação é ESTADO DURÁVEL do mundo —
// o save grava um byte por célula, e um campo `molhado` fora do byte seria um
// segundo mundo paralelo pra manter em sincronia.
//
// Os dois dropam TERRA, não a si mesmos, e nenhum dos dois é item: lavoura não
// se carrega no bolso. Quebrar um canteiro devolve a terra que ele era, que é
// o contrato do jogo de referência e o que impede "minerar" canteiro alheio
// pra estocar solo pronto.
DEFS.push(
  {
    id: 161,
    key: 'farmland',
    faces: { top: 'farmland', side: 'dirt', bottom: 'dirt' },
    hardness: 0.6,
    tool: 'shovel',
    drops: 'dirt',
    semItem: true,
  },
  {
    id: 162,
    key: 'farmlandWet',
    faces: { top: 'farmland_wet', side: 'dirt', bottom: 'dirt' },
    hardness: 0.6,
    tool: 'shovel',
    drops: 'dirt',
    semItem: true,
  },
)

// ── Trigo: oito ids, um por estágio ─────────────────────────────────────────
//
// O estágio é um BLOCO, não um campo. É a mesma decisão do solo arado e pela
// mesma razão: o mundo é um byte por célula, e um "estágio" fora do byte seria
// um segundo mundo pra manter em sincronia com o save, com o multiplayer e com
// a malha.
//
// Nenhum é item — planta-se a SEMENTE, não o talo. E o que cai ao quebrar
// depende da maturidade: verde devolve a semente (o jogador não perde o
// investimento por colher cedo), maduro dá trigo. No jogo de referência o
// maduro dá trigo MAIS sementes; aqui o `drops` é um item só, e quem mantém o
// ciclo girando é o mato, que dropa semente e nasce sozinho no mundo.
// ⚠️ A TABELA É A FONTE. Três culturas com o mesmo comportamento e números
// diferentes: acrescentar a quarta tem que ser uma linha aqui, e não uma cópia
// do laço. Trigo tem OITO estágios porque a espiga precisa de rampa longa pra
// ler de longe; raiz tem QUATRO, como no original — a folhagem da cenoura muda
// pouco e oito desenhos quase iguais seriam oito texturas sem informação.
export const CULTIVOS = Object.freeze([
  { tipo: 'wheat', estagios: 8, verde: 'wheat_seeds', maduro: 'wheat', semente: 'wheat_seeds' },
  { tipo: 'carrot', estagios: 4, verde: 'carrot', maduro: 'carrot', semente: 'carrot' },
  { tipo: 'potato', estagios: 4, verde: 'potato', maduro: 'potato', semente: 'potato' },
  // ⚠️ CAULE NÃO SE COLHE: ele PARE.
  //
  // Abóbora e melancia são o único cultivo do jogo em que a planta madura não
  // vira item — ela fica madura e passa a gerar o fruto numa célula VIZINHA,
  // uma de cada vez, enquanto houver chão livre ao lado. Quebrar o fruto não
  // mata o caule, e é isso que faz a horta de abóbora ser uma máquina em vez
  // de um replantio: `fruto` é o campo que marca essa diferença.
  //
  // O caule quebrado devolve semente em qualquer estágio — não há "colher cedo"
  // aqui, porque o que se colhe é o fruto.
  {
    tipo: 'pumpkinStem',
    estagios: 8,
    verde: 'pumpkin_seeds',
    maduro: 'pumpkin_seeds',
    semente: 'pumpkin_seeds',
    fruto: 'pumpkin',
  },
  {
    tipo: 'melonStem',
    estagios: 8,
    verde: 'melon_seeds',
    maduro: 'melon_seeds',
    semente: 'melon_seeds',
    fruto: 'melon',
  },
])

export const TRIGO = { estagios: 8, chave: (e) => `wheat${e}` }
/** tipo → ids na ordem dos estágios. É por aqui que o crescimento anda. */
export const IDS_DO_CULTIVO = {}
/** item plantável → tipo de cultura. */
export const CULTURA_DA_SEMENTE = {}
export const ID_DO_TRIGO = []
let proximaIdDeCultivo = 163
for (const c of CULTIVOS) {
  IDS_DO_CULTIVO[c.tipo] = []
  CULTURA_DA_SEMENTE[c.semente] = c.tipo
  for (let e = 0; e < c.estagios; e++) {
    IDS_DO_CULTIVO[c.tipo].push(proximaIdDeCultivo)
    if (c.tipo === 'wheat') ID_DO_TRIGO.push(proximaIdDeCultivo)
    DEFS.push({
      id: proximaIdDeCultivo++,
      key: `${c.tipo}${e}`,
      all: `${c.tipo}_stage${e}`,
      hardness: 0,
      cutout: true,
      plant: true,
      solid: false,
      filter: 0,
      replaceable: false,
      // ⚠️ `wind` baixo e NÃO zero. Lavoura parada ao lado de mato balançando
      // lê como decalque; lavoura balançando igual ao mato lê como mato. O
      // talo é mais rígido que a folha de capim, e a diferença é proposital.
      wind: e >= c.estagios / 2 ? 0.34 : 0.2,
      drops: e === c.estagios - 1 ? c.maduro : c.verde,
      semItem: true,
      flammable: true,
      cultivo: { tipo: c.tipo, estagio: e, fruto: c.fruto || null },
    })
  }
}

// ── Melancia ────────────────────────────────────────────────────────────────
//
// ⚠️ `melon_slice` EXISTIA COMO ITEM E NADA NO MUNDO A PRODUZIA — o mesmo tipo
// de item morto que a tinta de lula já foi (RC-09) e que a semente de trigo era
// até a onda 3. Ela tem fome, saturação, ícone e uma cor de partícula
// declarada em `aparencia.js`; só não havia melancia.
//
// Dropa FATIAS e não a si mesma: a melancia inteira só volta a existir pela
// planta, que é o que dá sentido a plantar uma. São 4 fatias, o meio da faixa
// do original (3 a 7), sem sorteio — variação de drop aqui só faria o jogador
// quebrar e recolocar até dar sorte.
DEFS.push({
  id: proximaIdDeCultivo++,
  key: 'melon',
  faces: { top: 'melon_top', side: 'melon_side', bottom: 'melon_top' },
  hardness: 1,
  tool: 'axe',
  drops: 'melon_slice',
  dropCount: 4,
  flammable: true,
})

// ── O NETHER ────────────────────────────────────────────────────────────────
//
// Quatro blocos, e nenhum deles é decoração: são o que faz a segunda dimensão
// ser um LUGAR e não um mundo cinza com outro céu.
//
// ⚠️ O ID VEM DEPOIS DO CULTIVO E NUNCA SE RENUMERA: há save de gente com esses
// bytes dentro. O sucessor destes quatro é `proximaIdDeCultivo`, que já andou.
//
// ⚠️ E A CONTA DE IDS LIVRES NÃO É MAIS 255 — eu escrevi isso aqui em 13/09/2026
// e estava errado. A trava T1 já caiu: `paleta.js` guarda ÍNDICE LOCAL de 8 bits
// por voxel e a paleta do chunk diz qual id global cada índice é, com teto de
// 65.535. Conferido no mesmo dia: 201 blocos declarados, nenhum buraco, e o
// limite de verdade é quantos tipos DISTINTOS cabem num mesmo chunk (256, e o
// chunk patológico é promovido para 16 bits sozinho). O aperto que eu descrevi
// não existe.
//
// `netherrack` é mole de propósito (0,4): o Nether se cava com a mão, e é isso
// que torna o portal um atalho de VIAGEM em vez de mais uma mina. E é
// inflamável — fogo em netherrack não apaga, e é daí que sai a lareira eterna.
DEFS.push(
  {
    id: proximaIdDeCultivo++,
    key: 'netherrack',
    all: 'netherrack',
    hardness: 0.4,
    tool: 'pickaxe',
    tier: 0,
    flammable: true,
  },
  // ⚠️ A LENTIDÃO DA AREIA DAS ALMAS NÃO ESTÁ AQUI, e é de propósito: a física
  // não tem campo para isso, e um `lento: 0.4` que `normalize` descartasse em
  // silêncio seria decoração — o bloco pareceria implementado e não seria.
  // Ele entra quando a física ganhar o mecanismo, não antes.
  {
    id: proximaIdDeCultivo++,
    key: 'soulSand',
    all: 'soul_sand',
    hardness: 0.5,
    tool: 'shovel',
  },
  {
    id: proximaIdDeCultivo++,
    key: 'netherQuartzOre',
    all: 'nether_quartz_ore',
    hardness: 3,
    tool: 'pickaxe',
    tier: 0,
    drops: 'quartz',
    xp: 2,
    // Minério dropa quartzo, nunca a si mesmo (sem toque suave), então o
    // item do bloco era um fantasma no catálogo — achado pela sonda de itens
    // mortos em 18/09, o mesmo caso dos outros minérios.
    semItem: true,
  },
  // Magma QUEIMA quem pisa. `damage` é o MESMO campo do cacto, já lido pelo
  // corpo do jogador a cada passo — mecanismo que existe, não promessa.
  {
    id: proximaIdDeCultivo++,
    key: 'magma',
    all: 'magma',
    hardness: 0.5,
    tool: 'pickaxe',
    tier: 0,
    light: 3,
    emissive: 1,
    damage: 1,
  },
  // ── O PLANO DO PORTAL ─────────────────────────────────────────────────────
  //
  // Dois ids, um por eixo do vão, porque a face do portal tem orientação e o
  // bloco não teria outro jeito de saber a dele. É o mesmo motivo da laje, da
  // escada e da tocha de parede.
  //
  // ⚠️ INQUEBRÁVEL E SEM ITEM, e os dois são mecanismo e não enfeite: o portal
  // não é uma peça que se carrega, é um estado da moldura. Quem o apaga é a
  // moldura quebrando (`portal.js`), não a picareta. Sem `unbreakable` o
  // jogador mineraria o próprio portal e ficaria do lado de lá sem volta.
  ...['X', 'Z'].map((eixo) => ({
    id: proximaIdDeCultivo++,
    key: `netherPortal${eixo}`,
    all: 'nether_portal',
    hardness: 0,
    unbreakable: true,
    semItem: true,
    drops: null,
    solid: false,
    translucent: true,
    alpha: 0.72,
    filter: 0,
    light: 11,
    emissive: 1,
    replaceable: false,
  })),
)

// ── O FIM ───────────────────────────────────────────────────────────────────
//
// Quatro blocos, a partir de 251 (os alçapões param em 250). A pedra do Fim é
// o chão da ilha; a moldura do portal é inquebrável e tem DUAS caras (sem olho
// e com olho) porque o olho é estado do bloco, como a porta aberta; o portal
// em si é o mesmo desenho do portal do Nether — sem item, inquebrável, não
// sólido: cai-se nele, e é `travessia.js` quem leva.
let proximaIdDoFim = 251
DEFS.push(
  {
    id: proximaIdDoFim++,
    key: 'endStone',
    all: 'end_stone',
    hardness: 3,
    tool: 'pickaxe',
    tier: 0,
  },
  ...[false, true].map((olho) => ({
    id: proximaIdDoFim++,
    key: olho ? 'endPortalFrameEye' : 'endPortalFrame',
    faces: {
      top: olho ? 'end_portal_frame_eye' : 'end_portal_frame_top',
      side: 'end_portal_frame_side',
      bottom: 'end_stone',
    },
    hardness: -1,
    unbreakable: true,
    drops: null,
    semItem: olho,
    light: olho ? 4 : 0,
    interact: olho ? null : 'endPortalFrame',
  })),
  {
    id: proximaIdDoFim++,
    key: 'endPortal',
    all: 'end_portal',
    hardness: 0,
    unbreakable: true,
    semItem: true,
    drops: null,
    solid: false,
    translucent: true,
    alpha: 0.9,
    filter: 0,
    light: 15,
    emissive: 1,
    replaceable: false,
  },
)

// ── REDSTONE ────────────────────────────────────────────────────────────────
//
// Vinte e dois ids, e dezesseis deles são o MESMO pó em níveis diferentes de
// energia. É o mesmo desenho da lavoura (um id por estágio) e pelo mesmo motivo:
// o voxel guarda um número, e o nível do fio É estado do bloco.
//
// ⚠️ O PÓ É UM DEGRAU DE 1/16, E NÃO UMA PLACA SEM COLISÃO. Eu escrevi
// `solid: false` com `slab` e o portão da física reprovou na hora, com a frase
// certa: "tem slab mas não é sólido — o desenho existe e a colisão não". É o
// defeito que a camada de neve já teve, e que fazia o jogador andar com os pés
// dentro da neve que estava vendo.
//
// Então o fio colide com a espessura que tem: um sexto de dezesseis avos. O
// jogador sobe nele sem perceber (a física tem degrau), não fica preso, e o
// desenho e a colisão contam a mesma história.
//
// A COR vem de `tint` por nível: preto-vinho apagado, vermelho vivo no máximo. É
// ela que deixa o jogador LER a energia no chão sem abrir nada — a informação
// mais importante de um circuito é onde ele parou de conduzir.
DEFS.push(
  ...Array.from({ length: 16 }, (_, n) => ({
    id: proximaIdDeCultivo++,
    key: `redstoneDust${n}`,
    all: 'redstone_dust',
    hardness: 0,
    cutout: true,
    filter: 0,
    slab: 0.0625,
    replaceable: false,
    semItem: true,
    drops: 'redstone',
    // 0,32 a 1,0: o apagado precisa continuar VISÍVEL (senão o jogador perde o
    // traçado do próprio fio no escuro), só não pode parecer ligado.
    tint: [0.32 + (n / 15) * 0.68, 0.06 + (n / 15) * 0.1, 0.06],
    light: n > 0 ? Math.min(7, 1 + Math.floor(n / 3)) : 0,
    emissive: n > 0 ? 1 : 0,
  })),
  // A TOCHA: o inversor. Acesa quando o bloco de baixo NÃO tem energia.
  ...['On', 'Off'].map((estado) => ({
    id: proximaIdDeCultivo++,
    key: `redstoneTorch${estado}`,
    all: estado === 'On' ? 'redstone_torch_on' : 'redstone_torch_off',
    hardness: 0,
    solid: false,
    cutout: true,
    plant: true,
    filter: 0,
    replaceable: false,
    // ⚠️ A PEÇA DO INVENTÁRIO É A APAGADA, e as duas variantes dropam ela. A
    // tocha acesa não é uma peça diferente: é a MESMA peça num estado que o
    // circuito decide. Deixar as duas viraram item daria ao jogador duas tochas
    // no inventário que se comportam igual ao serem colocadas.
    semItem: estado === 'On',
    drops: 'redstoneTorchOff',
    light: estado === 'On' ? 7 : 0,
    emissive: estado === 'On' ? 1 : 0,
  })),
  // A ALAVANCA: o único gesto direto do jogador num circuito.
  ...['On', 'Off'].map((estado) => ({
    id: proximaIdDeCultivo++,
    key: `lever${estado}`,
    all: estado === 'On' ? 'lever_on' : 'lever_off',
    hardness: 0.5,
    solid: false,
    cutout: true,
    plant: true,
    filter: 0,
    replaceable: false,
    semItem: estado === 'On',
    drops: 'leverOff',
  })),
  // A LÂMPADA: a saída que se vê de longe.
  ...['On', 'Off'].map((estado) => ({
    id: proximaIdDeCultivo++,
    key: `redstoneLamp${estado}`,
    all: estado === 'On' ? 'redstone_lamp_on' : 'redstone_lamp_off',
    hardness: 0.3,
    tool: 'pickaxe',
    semItem: estado === 'On',
    drops: 'redstoneLampOff',
    light: estado === 'On' ? 15 : 0,
    emissive: estado === 'On' ? 1 : 0,
  })),
)

// ── Tocha de parede ─────────────────────────────────────────────────────────
//
// Quatro ids, um por parede. `parede` é a direção que aponta PRA parede: uma
// tocha pendurada na parede do lado −Z tem `parede: 5` e se inclina pro +Z,
// afastando a chama do bloco que a segura.
//
// Nenhuma delas é item: a peça é UMA só no inventário, e qual das cinco
// variantes nasce sai da face em que o jogador clicou — a mesma regra da laje,
// da escada e do portão.
//
// Ids a partir de 153 porque 145..152 são os oito portões. ⚠️ Id existente
// nunca se renumera: há save de gente com esses bytes dentro.
let proximaIdDeTocha = 153
/** face clicada (índice canônico) → chave da variante de parede. */
export const TOCHA_DE_PAREDE = {}
for (const o of ORIENTACOES) {
  const key = `torch${SUFIXO_ORIENT[o]}Parede`
  TOCHA_DE_PAREDE[o] = key
  DEFS.push({
    id: proximaIdDeTocha++,
    key,
    faces: { lista: ['torch', 'torch', 'torch_flame', 'torch', 'torch', 'torch'] },
    hardness: 0,
    light: 14,
    emissive: 1,
    cutout: true,
    solid: false,
    filter: 0,
    tocha: { parede: o },
    semItem: true,
    drops: 'torch',
  })
}

// ── Fluidos que escorrem ────────────────────────────────────────────────────
//
// A fonte é o líquido de sempre — `water` (id 21) e `lava` (id 22), ambos nível
// 0. O que escorre delas ganha id próprio por NÍVEL, e mais um id pro nível 8:
// a coluna CAINDO, que enche a célula inteira porque queda d'água não tem
// lâmina rasa.
//
// Por que id por nível, e não um byte de estado por voxel: é a mesma decisão da
// laje e da escada, e pelo mesmo motivo. O mundo é um `Uint8Array` de ids; um
// segundo array de estado dobraria a memória de todo chunk pra servir a quatro
// famílias de bloco, e obrigaria mesher, luz, física e rede a carregar o
// segundo dado em toda leitura.
//
// A LAVA SÓ USA NÍVEL PAR. No mundo de cima ela perde dois níveis por bloco em
// vez de um, então só existem 0, 2, 4, 6 — e o alcance sai três blocos, contra
// os sete da água. Declarar os ímpares seria gastar quatro ids em estados que
// nenhuma regra sabe produzir.
//
// Alturas do original: a lâmina do nível L ocupa (8 − L)/9 da célula. A fonte
// fica em 8/9 ≈ 0,889, que é praticamente o `WATER_DROP` de 0,12 que este motor
// já usava — os números batem porque saem da mesma ideia.
//
// Nenhum deles é item: líquido não vai pro inventário, vai pro balde.
export const NIVEL_CAINDO = 8
export const ALCANCE_DE_NIVEL = 7
/** Altura visível da lâmina, em 0..1, para o nível 0..8. */
export const alturaDoNivel = (n) => (n >= NIVEL_CAINDO ? 1 : (8 - n) / 9)

export const AGUA = 1
export const LAVA = 2

/** Qual fluido este id é: 0 nenhum, 1 água, 2 lava. */
export const FLUIDO_DE_ID = new Uint8Array(TABELA_DE_IDS)
/** Nível 0..8 do id, ou −1 se não for fluido. */
export const NIVEL_DE_FLUIDO = new Int16Array(TABELA_DE_IDS).fill(-1)
/** `ID_DE_NIVEL[fluido][nivel]` → id do bloco, ou −1 se aquele nível não existe. */
export const ID_DE_NIVEL = [null, new Int16Array(9).fill(-1), new Int16Array(9).fill(-1)]

const FLUIDOS_DECLARADOS = [
  { tipo: AGUA, chave: 'water', textura: 'water', passo: 1, extra: {} },
  {
    tipo: LAVA,
    chave: 'lava',
    textura: 'lava',
    passo: 2,
    extra: { light: 15, emissive: 1, damage: 4 },
  },
]

let proximaIdDeFluido = 111
for (const f of FLUIDOS_DECLARADOS) {
  for (let n = f.passo; n <= NIVEL_CAINDO; n += f.passo) {
    const key = n === NIVEL_CAINDO ? `${f.chave}Falling` : `${f.chave}Flow${n}`
    DEFS.push({
      id: proximaIdDeFluido,
      key,
      all: f.textura,
      liquid: true,
      solid: false,
      translucent: true,
      alpha: 0.62,
      filter: 3,
      unbreakable: true,
      replaceable: true,
      semItem: true,
      drops: null,
      ...f.extra,
    })
    ID_DE_NIVEL[f.tipo][n] = proximaIdDeFluido
    proximaIdDeFluido++
  }
}

// ── Índices derivados ───────────────────────────────────────────────────────

// Normaliza uma definição crua no formato completo que o resto do engine assume.
function normalize(d) {
  // `lista` é a forma explícita: os SEIS lados, na ordem canônica
  // +x −x +y(topo) −y(base) +z −z.
  //
  // `top`/`side`/`bottom`/`front` cobre 99% dos blocos e é o que se quer
  // escrever pra um cubo. Mas a cama tem quatro texturas laterais diferentes —
  // a ponta de fora, a ponta de dentro e as duas faces longas — e ela gira,
  // então QUAL lado recebe QUAL textura muda por variante. Espremer isso em
  // `front` daria uma cama certa numa direção e errada nas outras três.
  const faces = d.faces?.lista
    ? {
        lista: d.faces.lista,
        top: d.faces.lista[2],
        side: d.faces.lista[0],
        bottom: d.faces.lista[3],
        front: d.faces.lista[4],
      }
    : d.all
      ? { top: d.all, side: d.all, bottom: d.all }
      : {
          top: d.faces.top,
          side: d.faces.side,
          bottom: d.faces.bottom,
          front: d.faces.front || null,
        }
  const translucent = !!d.translucent
  const cutout = !!d.cutout
  return {
    id: d.id,
    key: d.key,
    faces,
    hardness: d.hardness ?? 1,
    tool: d.tool || null,
    tier: d.tier ?? 0,
    drops: d.drops === undefined ? d.key : d.drops, // por padrão dropa a si mesmo
    dropCount: d.dropCount || 1,
    dropChance: d.dropChance ?? 1,
    xp: d.xp || 0,
    light: d.light || 0,
    emissive: d.emissive || 0,
    // Quanto de luz o bloco ABSORVE ao ser atravessado. Opaco = bloqueia tudo.
    filter: d.filter ?? (translucent || cutout ? 1 : 15),
    opaque: !translucent && !cutout && !d.liquid && !d.plant,
    translucent,
    cutout,
    plant: !!d.plant,
    liquid: !!d.liquid,
    // sólido = colide com o player. Padrão true, exceto onde marcado.
    solid: d.solid !== undefined ? d.solid : !d.plant && !d.liquid,
    alpha: d.alpha ?? 1,
    tint: d.tint || null,
    tintFaces: d.tintFaces || null, // null = todas as faces recebem tint
    gravity: !!d.gravity,
    replaceable: !!d.replaceable,
    flammable: !!d.flammable,
    unbreakable: !!d.unbreakable,
    damage: d.damage || 0,
    wind: d.wind || 0,
    scale: d.scale || 1,
    slab: d.slab || 0,
    // Onde a meia altura se apoia. Neve e laje de baixo crescem do CHÃO da
    // célula; laje de topo pende do TETO. É a única diferença entre as duas
    // metades, e ela vira geometria no mesher e caixa na física.
    slabTopo: !!d.slabTopo,
    // { orient, topo } quando o bloco é escada. A geometria em si mora em
    // `formas.js` — aqui fica só a declaração de QUAL forma este id tem.
    escada: d.escada || null,
    // { orient, cabeceira } quando o bloco é metade de cama. `orient` é pra
    // onde a PONTA DE FORA aponta. A geometria mora em `formas.js`.
    cama: d.cama || null,
    // { bits } quando o bloco é cerca — quais dos quatro lados estão ligados.
    // Como a escada e a cama, aqui fica só a DECLARAÇÃO; a geometria mora em
    // `formas.js`.
    //
    // ⚠️ CAMPO NÃO DECLARADO AQUI É CAMPO QUE SOME. `normalize` copia campo a
    // campo, e a primeira versão da cerca esqueceu esta linha: as 16 variantes
    // existiam em `DEFS`, entravam em `BLOCKS`, e chegavam em `formas.js` sem
    // `cerca` — então nenhuma virava forma livre e todas saíam cubo cheio. Nada
    // acusava: o jogo desenhava 16 cubos de madeira.
    cerca: d.cerca || null,
    // { orient, aberto } quando o bloco é portão de cerca.
    portao: d.portao || null,
    porta: d.porta || null,
    // { orient, aberto } quando o bloco é alçapão. Mesma obrigação da cerca.
    alcapao: d.alcapao || null,
    // { parede } quando o bloco é tocha. `parede` é null no chão, ou o índice
    // canônico da face em que ela está pendurada. Como a escada, a cama, a
    // cerca e o portão: aqui fica só a DECLARAÇÃO; a geometria mora em
    // `formas.js`. E, como eles, ESTA LINHA É OBRIGATÓRIA — ver o aviso da
    // cerca oito linhas acima, que é o mesmo defeito esperando acontecer de
    // novo.
    tocha: d.tocha || null,
    // Presente quando o bloco é lanterna — a forma pequena mora em `formas.js`.
    // Sem esta linha, `normalize` descarta o campo e a lanterna volta a sair
    // cubo cheio, o mesmo esquecimento que a cerca cometeu.
    lanterna: d.lanterna || null,
    // A célula está ALAGADA: a peça mora dentro d'água, e a água continua ali.
    //
    // Sem este conceito, planta submersa é impossível neste motor. O mundo é um
    // id por célula: pôr alga numa célula de água APAGA a água dali. A água em
    // volta então enxerga um vizinho não-líquido e desenha parede — cada tufo
    // de alga vira uma caixa de vidro no meio do mar — e a fila de fluidos
    // ainda vem inundar a célula de volta e lavar a planta.
    //
    // `aguado` diz às três perguntas que a célula CONTINUA sendo água: o mesher
    // não desenha face contra ela, `podeInundar` não a lava, e `liquidAt`
    // devolve verdadeiro (então o jogador nada por dentro dela e a névoa de
    // submerso não pisca ao atravessar um pé de alga).
    aguado: !!d.aguado,
    // { folha } quando o bloco é bambu. Como a escada, a cama, a cerca, o
    // portão e a tocha: só a DECLARAÇÃO; a geometria mora em `formas.js`. E,
    // como todos eles, esta linha é obrigatória — ver o aviso da cerca.
    bambu: d.bambu || null,
    // { tipo, estagio } quando o bloco é lavoura. Mesma obrigatoriedade dos de
    // cima: sem esta linha o trigo chega em `agricultura.js` sem estágio, e o
    // crescimento fica parado sem nada acusar.
    cultivo: d.cultivo || null,
    // A cana cresce por conta própria, com regra só dela (ver `agricultura.js`).
    cana: !!d.cana,
    // O que cai quando se usa TESOURA, em vez do drop comum (folha, mato).
    comTesoura: d.comTesoura || null,
    // Bônus raro que sai POR CIMA do drop normal: maçã na folha, pederneira no
    // cascalho. `{ item, chance, count }`.
    dropExtra: d.dropExtra || null,
    semItem: !!d.semItem,
    interact: d.interact || null,
  }
}

export const BLOCKS = {}
export const BLOCK_BY_KEY = {}
for (const d of DEFS) {
  const b = normalize(d)
  // ⚠️ ID REPETIDO ESTOURA, e não sobrescreve em silêncio: cada família aloca
  // a partir de um número solto (`proximaIdDe…`), e duas famílias crescendo
  // uma para dentro da outra trocariam um bloco por outro sem nada acusar.
  if (BLOCKS[b.id]) throw new Error(`bloco ${b.key}: id ${b.id} já é de ${BLOCKS[b.id].key}`)
  if (BLOCK_BY_KEY[b.key]) throw new Error(`bloco ${b.key}: chave repetida`)
  BLOCKS[b.id] = b
  BLOCK_BY_KEY[b.key] = b
}

// Atalhos numéricos usados no worldgen e na física (evita string lookup no
// caminho quente).
// As tabelas inversas só podem ser preenchidas com `BLOCKS` pronto:
// `ID_DE_NIVEL` nasce na declaração das DEFS, `NIVEL_DE_FLUIDO` e `FLUIDO_DE_ID`
// dependem dos ids normalizados.
for (const f of FLUIDOS_DECLARADOS) {
  // A fonte é o líquido de sempre: nível 0. Deixá-la fora faria "é fluido?" e
  // "que nível?" darem respostas contraditórias sobre o mesmo bloco.
  const fonte = BLOCK_BY_KEY[f.chave].id
  ID_DE_NIVEL[f.tipo][0] = fonte
  for (let n = 0; n <= NIVEL_CAINDO; n++) {
    const id = ID_DE_NIVEL[f.tipo][n]
    if (id < 0) continue
    NIVEL_DE_FLUIDO[id] = n
    FLUIDO_DE_ID[id] = f.tipo
  }
}

export const ID = Object.freeze(Object.fromEntries(Object.values(BLOCKS).map((b) => [b.key, b.id])))

// Lista ordenada de TODOS os nomes de textura únicos - é o contrato com o
// gerador de texturas e com o texture array (a ORDEM define a camada de cada
// textura no `DataArrayTexture`).
export const TEXTURE_NAMES = (() => {
  const set = new Set()
  for (const b of Object.values(BLOCKS)) {
    if (b.faces.lista) {
      for (const n of b.faces.lista) set.add(n)
      continue
    }
    set.add(b.faces.top)
    set.add(b.faces.side)
    set.add(b.faces.bottom)
    if (b.faces.front) set.add(b.faces.front)
  }
  return [...set].sort()
})()

export const TEXTURE_LAYER = Object.fromEntries(TEXTURE_NAMES.map((n, i) => [n, i]))

// Camadas por face na ordem canônica [+x,-x,+y,-y,+z,-z]. Pré-computado por id:
// o mesher lê um Int32Array, não um objeto.
export const FACE_LAYERS = (() => {
  const out = new Int32Array(TABELA_DE_IDS * 6).fill(-1)
  for (const b of Object.values(BLOCKS)) {
    if (b.faces.lista) {
      for (let f = 0; f < 6; f++) out[b.id * 6 + f] = TEXTURE_LAYER[b.faces.lista[f]]
      continue
    }
    const top = TEXTURE_LAYER[b.faces.top]
    const side = TEXTURE_LAYER[b.faces.side]
    const bottom = TEXTURE_LAYER[b.faces.bottom]
    const front = b.faces.front ? TEXTURE_LAYER[b.faces.front] : side
    // +x, -x, +y(topo), -y(base), +z(frente), -z
    const arr = [side, side, top, bottom, front, side]
    for (let f = 0; f < 6; f++) out[b.id * 6 + f] = arr[f]
  }
  return out
})()

// Máscaras planas por id (Uint8Array) - o mesher e a luz consultam milhões de
// vezes por frame de geração; ler de um typed array é ordens de grandeza mais
// barato que `BLOCKS[id]?.opaque`.
function flagArray(pick) {
  const a = new Uint8Array(TABELA_DE_IDS)
  for (const b of Object.values(BLOCKS)) a[b.id] = pick(b) ? 1 : 0
  return a
}
/**
 * Altura VISÍVEL da lâmina por id, em 0..1 — o topo que o mesher desenha
 * quando não há líquido em cima.
 *
 * Antes disto o rebaixamento era uma constante única (`WATER_DROP`) aplicada a
 * qualquer líquido de superfície. Isso bastava enquanto só existia água cheia;
 * com nível, cada lâmina tem a sua altura, e uma constante desenharia os sete
 * níveis todos iguais. O valor da fonte é 1 − WATER_DROP, exatamente o que o
 * motor já desenhava: a mudança não mexe em nada que existia.
 */
export const ALTURA_LIQUIDA = (() => {
  const a = new Float32Array(TABELA_DE_IDS).fill(1)
  for (const b of Object.values(BLOCKS)) {
    if (!b.liquid) continue
    const n = NIVEL_DE_FLUIDO[b.id]
    a[b.id] = n > 0 ? alturaDoNivel(n) : 1 - WATER_DROP
  }
  return a
})()

export const IS_OPAQUE = flagArray((b) => b.opaque)
export const IS_SOLID = flagArray((b) => b.solid)
export const IS_LIQUID = flagArray((b) => b.liquid)
export const IS_CUTOUT = flagArray((b) => b.cutout)
export const IS_PLANT = flagArray((b) => b.plant)

/**
 * Peça de ENFEITE: não segura peso e é lavada por líquido.
 *
 * Existe porque `IS_PLANT` vinha sendo usado como apelido disto em dois
 * lugares — o `podeInundar` dos fluidos e o `atravessa` da gravidade. No dia em
 * que a tocha deixou de ser planta (25/08/2026, quando virou poste de verdade
 * em vez de um X encolhido a 16%), os dois passaram a tratá-la como parede: a
 * areia pousava EM CIMA da tocha e a água parava nela. Os dois testes acusaram
 * na mesma rodada, cada um com uma linha.
 *
 * A lição não é "acrescente a tocha na lista". É que `plant` responde QUE FORMA
 * a peça tem, e essas duas perguntas são sobre o que ela SUPORTA — pergunta
 * diferente, tabela diferente. Sem esta separação, a próxima peça frágil que
 * não for planta reintroduz o mesmo defeito, e de novo só nesses dois lugares.
 */
export const IS_FRAGIL = flagArray((b) => b.plant || b.tocha)

/** A célula ALAGADA — a peça mora dentro d'água. Ver a nota em `normalize`. */
export const IS_AGUADO = flagArray((b) => b.aguado)
export const IS_TRANSLUCENT = flagArray((b) => b.translucent)
export const IS_REPLACEABLE = flagArray((b) => b.replaceable)

/**
 * Quanto o bloco cede ao vento, por id, já em 0..255 — a escala do atributo
 * `aWind` do vértice. Typed array porque quem lê é o mesher, no laço mais
 * quente do worker: um lookup em objeto por face custaria o mundo.
 *
 * 0 = pedra, madeira, terra: não se mexe. >0 = grama, flor, muda, folhagem.
 */
export const VENTO_DE_BLOCO = (() => {
  const a = new Uint8Array(TABELA_DE_IDS)
  for (const b of Object.values(BLOCKS)) a[b.id] = Math.round(Math.min(1, b.wind) * 255)
  return a
})()

/**
 * A FORMA do bloco dentro da célula, em 0..1: onde ela começa e onde acaba no
 * eixo Y. Bloco cheio é [0, 1]. Neve é [0, 0.125]. Laje de baixo é [0, 0.5] e
 * laje de topo é [0.5, 1].
 *
 * É a ÚNICA fonte da forma. Mesher, física e culling de face leem daqui — não
 * de `slab`, não de `slabTopo`, não do id. É o que torna o dia da escada uma
 * rodada pequena: a forma passa a ter duas caixas em vez de uma, e quem lê
 * continua lendo o mesmo lugar.
 */
export const FORMA_BASE = (() => {
  const a = new Float32Array(TABELA_DE_IDS)
  for (const b of Object.values(BLOCKS)) a[b.id] = b.slab && b.slabTopo ? 1 - b.slab : 0
  return a
})()
export const FORMA_TOPO = (() => {
  // Começa em 1 e não em 0: id que não existe na tabela tem que ler como CHEIO,
  // não como caixa de espessura zero. Zero ali faria toda face de um id
  // inválido virar "não está na borda" e nada mais seria escondido — buraco no
  // mundo por um índice errado, em vez de um bloco errado bem visível.
  const a = new Float32Array(TABELA_DE_IDS).fill(1)
  for (const b of Object.values(BLOCKS)) a[b.id] = b.slab && !b.slabTopo ? b.slab : 1
  return a
})()

/**
 * A face DESENHADA de um id fica no plano da célula, ou flutua no meio dela?
 *
 * O tampo de uma laje de baixo fica no MEIO: o vizinho de cima está a meio
 * bloco de distância e não tem como escondê-lo. Sem esta tabela, encostar um
 * bloco cheio em cima de uma laje apagava o tampo e abria um vão que deixava
 * ver o subsolo. Vale pro piso da laje de topo pelo mesmo motivo, invertido.
 *
 * Ordem das faces: 0:+x 1:-x 2:+y 3:-y 4:+z 5:-z. Padrão CHEIO (tudo na borda)
 * pra que id inválido não vire mundo furado.
 */
export const FACE_NA_BORDA = (() => {
  const a = new Uint8Array(TABELA_DE_IDS * 6).fill(1)
  for (const b of Object.values(BLOCKS)) {
    const base = FORMA_BASE[b.id]
    const topo = FORMA_TOPO[b.id]
    a[b.id * 6 + 2] = topo === 1 ? 1 : 0
    a[b.id * 6 + 3] = base === 0 ? 1 : 0
  }
  return a
})()

/** O bloco não preenche a célula inteira? */
export const EH_PARCIAL = (() => {
  const a = new Uint8Array(TABELA_DE_IDS)
  for (const b of Object.values(BLOCKS)) a[b.id] = FORMA_BASE[b.id] > 0 || FORMA_TOPO[b.id] < 1
  return a
})()

/**
 * Altura sólida por id, em 0..1 — a caixa de colisão do bloco, não o desenho.
 *
 * Bloco cheio é 1. Bloco parcial (`slab`) vale a fração que o mesher desenha,
 * e é ela que a física usa pra montar a AABB. Enquanto isto não existiu, a
 * camada de neve era desenhada com 12,5% de altura e a física a ignorava por
 * completo: em bioma nevado o jogador pisava DENTRO da neve visível, e subir
 * um degrau coberto de neve não funcionava.
 */
export const ALTURA_SOLIDA = (() => {
  const a = new Float32Array(TABELA_DE_IDS)
  for (const b of Object.values(BLOCKS)) a[b.id] = b.solid ? b.slab || 1 : 0
  return a
})()

/**
 * O que `solidAt` devolve, já pronto por id — a física não deve alocar no laço
 * de colisão, que roda dezenas de vezes por quadro.
 *
 * Formato deliberadamente misto, e o motivo é compatibilidade honesta: enquanto
 * a caixa é UMA, encostada no chão e ocupando a célula inteira em X e Z — o
 * caso de 99,9% do mundo —, o valor é o número que sempre foi, altura em 0..1.
 * Qualquer forma mais complicada que isso vira LISTA DE CAIXAS
 * `[[x0,y0,z0,x1,y1,z1], ...]`. Assim nenhum chamador antigo, nem teste antigo
 * que devolve `true`/`0.125` na mão, precisa saber que formas existem.
 *
 * ⚠️ A lista é preenchida por `formas.js`, que importa daqui. Não dá pra montar
 * a lista aqui sem fechar um ciclo de import — por isso o registro é por
 * injeção (`registrarCaixas`) e não por leitura direta.
 */
export const SOLIDO_DE_BLOCO = (() => {
  const a = new Array(TABELA_DE_IDS).fill(0)
  for (const b of Object.values(BLOCKS)) {
    if (!b.solid) continue
    const base = FORMA_BASE[b.id]
    const topo = FORMA_TOPO[b.id]
    a[b.id] = base > 0 ? Object.freeze([Object.freeze([0, base, 0, 1, topo, 1])]) : topo
  }
  return a
})()

/**
 * `formas.js` avisa aqui quais ids têm mais de uma caixa (hoje, escada).
 *
 * A alternativa seria `blocks.js` importar `formas.js`, e aí o ciclo fecha:
 * `formas.js` precisa de `BLOCKS` pra saber quais ids existem. Injeção num
 * sentido só é mais honesto que um import circular que o bundler resolve por
 * ordem de avaliação — ordem que muda sem aviso e quebra longe daqui.
 */
export function registrarCaixas(id, caixas) {
  SOLIDO_DE_BLOCO[id] = Object.freeze(caixas.map((c) => Object.freeze(c.slice())))
}

/**
 * O bloco pode ser MIRADO, mesmo não sendo sólido?
 *
 * ⚠️ ESTA TABELA NASCEU DE UM DEFEITO QUE ESTAVA NO JOGO DESDE SEMPRE.
 *
 * A mira usava `solidAt` como único critério, e planta tem `solid: false` — o
 * raio atravessava o mato, a flor e a muda e acertava o chão atrás. Ou seja:
 * NUNCA foi possível quebrar mato neste jogo. Ninguém notou porque mato não
 * dropava nada; quando ele virou a única fonte de semente (onda 3), a
 * agricultura inteira ficou sem começo — e a sonda de lavoura acusou "a mira
 * não pega o MATO: grassBlock".
 *
 * A separação já existia no código, escrita para o portão aberto: `mira` e
 * `física` leem tabelas diferentes. Dá pra clicar sem dar pra esbarrar.
 *
 * Líquido continua de fora: a mira normal atravessa água de propósito (é o
 * balde que tem a mira própria), e alga é planta DENTRO d'água.
 */
export const EH_MIRAVEL = (() => {
  const a = new Uint8Array(TABELA_DE_IDS)
  for (const b of Object.values(BLOCKS)) {
    if (b.solid || b.liquid || b.aguado) continue
    a[b.id] = b.plant || b.tocha ? 1 : 0
  }
  return a
})()

export const LIGHT_EMIT = (() => {
  const a = new Uint8Array(TABELA_DE_IDS)
  for (const b of Object.values(BLOCKS)) a[b.id] = b.light
  return a
})()

export const LIGHT_FILTER = (() => {
  const a = new Uint8Array(TABELA_DE_IDS)
  a[AIR] = 0
  for (const b of Object.values(BLOCKS)) a[b.id] = b.filter
  return a
})()

// ── Consultas ───────────────────────────────────────────────────────────────
export const blockDef = (id) => BLOCKS[id] || null
export const isOpaque = (id) => IS_OPAQUE[id] === 1
export const isSolid = (id) => IS_SOLID[id] === 1
export const isLiquid = (id) => IS_LIQUID[id] === 1
export const isPlant = (id) => IS_PLANT[id] === 1
export const isReplaceable = (id) => id === AIR || IS_REPLACEABLE[id] === 1
export const isUnbreakable = (id) => !!BLOCKS[id]?.unbreakable
export const blockExists = (id) => id === AIR || !!BLOCKS[id]

// Tempo (segundos) pra quebrar um bloco com uma ferramenta. Modelo simplificado
// do Minecraft: a ferramenta CERTA acelera por tier; a errada não penaliza além
// do baseline; ferramenta de tier insuficiente quebra mas NÃO dropa.
const TOOL_SPEED = [1, 2, 4, 6, 8, 12] // mão, madeira, pedra, ferro, diamante, ouro-ish
export function breakTime(blockId, tool) {
  const b = BLOCKS[blockId]
  if (!b || b.unbreakable) return Infinity
  if (b.hardness <= 0) return 0
  const right = b.tool && tool?.kind === b.tool
  const speed = right ? TOOL_SPEED[Math.min(TOOL_SPEED.length - 1, (tool?.tier ?? 0) + 1)] : 1
  const base = b.hardness * (right ? 1.5 : 5)
  return base / speed
}

// O bloco dropa item quando quebrado com esta ferramenta?
export function dropsWith(blockId, tool) {
  const b = BLOCKS[blockId]
  if (!b || b.drops === null) return false
  if (!b.tool) return true // quebra na mão (terra, areia, madeira, lã…)
  if (b.tier === 0 && !b.tool) return true
  if (!tool || tool.kind !== b.tool) return b.tier === 0 && b.tool !== 'pickaxe'
  return (tool.tier ?? 0) >= b.tier
}

// O que cai ao quebrar. `rng` recebido de fora pra ficar determinístico em teste.
export function blockDrop(blockId, tool, rng = Math.random) {
  return blockDrops(blockId, tool, rng)[0] ?? null
}

/**
 * TUDO que cai ao quebrar — uma lista, porque um bloco pode dar mais de uma
 * coisa.
 *
 * ⚠️ ISTO EXISTE POR CAUSA DE TRÊS ITENS MORTOS que a sonda de item morto
 * apontou: a MAÇÃ (no original cai de folha de carvalho, raro), a PEDERNEIRA
 * (cai de cascalho) e a FOLHA em si (cai com tesoura). Nenhum dos três cabia
 * num `drops` de um item só, e enquanto coubesse eles continuariam existindo no
 * catálogo sem nada no mundo os produzir.
 *
 * Três campos, e cada um responde uma pergunta diferente:
 *  · `drops`      — o que cai sempre (ou com `dropChance`)
 *  · `comTesoura` — o que cai QUANDO a ferramenta certa é a tesoura. É assim
 *                   que folha e mato viram item sem virar drop comum: quebrar
 *                   na mão continua dando muda e semente.
 *  · `dropExtra`  — o bônus raro, que sai POR CIMA do drop normal.
 */
export function blockDrops(blockId, tool, rng = Math.random) {
  const b = BLOCKS[blockId]
  if (!b || !dropsWith(blockId, tool)) return []
  const saida = []
  if (b.comTesoura && tool?.kind === 'shears') {
    saida.push({ item: b.comTesoura, count: 1 })
  } else if (b.drops !== null && !(b.dropChance < 1 && rng() > b.dropChance)) {
    saida.push({ item: b.drops, count: b.dropCount })
  }
  if (b.dropExtra && rng() < b.dropExtra.chance) {
    saida.push({ item: b.dropExtra.item, count: b.dropExtra.count || 1 })
  }
  return saida
}
