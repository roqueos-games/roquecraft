// RoqueCraft - registro de itens.
//
// Tudo que ocupa um slot de inventário é um ITEM. Um item pode ser:
//  - `block`    → colocável no mundo (`blockId`)
//  - `tool`     → tem `tool {kind, tier}` e durabilidade
//  - `food`     → restaura fome/saturação ao comer
//  - `material` → só serve de ingrediente
//
// Todo bloco que dropa a si mesmo ganha automaticamente um item homônimo, então
// a tabela abaixo só declara o que NÃO é bloco (e os poucos blocos que precisam
// de stack/ícone especial).
//
// A chave do item é a mesma string usada em `BLOCKS[].drops` e nas receitas.

import { ARMADURAS } from './armadura.js'
import { BLOCKS, BLOCK_BY_KEY } from './blocks.js'
import { POCOES } from './fermentacao.js'

export const TOOL_TIERS = { wood: 0, stone: 1, iron: 2, diamond: 3 }
export const TIER_NAME = ['wood', 'stone', 'iron', 'diamond']
const TIER_DURABILITY = [60, 132, 251, 1562]

const MATERIALS = [
  { key: 'stick', icon: 'stick' },
  { key: 'coal', icon: 'coal', fuel: 8 },
  { key: 'charcoal', icon: 'charcoal', fuel: 8 },
  { key: 'raw_iron', icon: 'raw_iron' },
  { key: 'iron_ingot', icon: 'iron_ingot' },
  { key: 'raw_copper', icon: 'raw_copper' },
  { key: 'copper_ingot', icon: 'copper_ingot' },
  { key: 'raw_gold', icon: 'raw_gold' },
  { key: 'gold_ingot', icon: 'gold_ingot' },
  { key: 'diamond', icon: 'diamond' },
  { key: 'emerald', icon: 'emerald' },
  // ⚠️ O PÓ É MATERIAL E VIRA BLOCO. Os dezesseis níveis de energia são
  // `semItem`, porque o que o jogador carrega é UM pó — o nível é estado do
  // circuito, não da peça na mochila. `colocaBloco` é como um material diz qual
  // bloco ele vira, sem precisar existir um item por estado.
  { key: 'redstone', icon: 'redstone', colocaBloco: 'redstoneDust0' },
  { key: 'clay_ball', icon: 'clay_ball' },
  { key: 'brick', icon: 'brick' },
  { key: 'glowstone_dust', icon: 'glowstone_dust' },
  // O quartzo do Nether. Existe porque o minério existe: minério que dropa a
  // si mesmo não é recurso, é enfeite com etapa a mais.
  { key: 'quartz', icon: 'quartz' },
  { key: 'snowball', icon: 'snowball', stack: 16 },
  { key: 'string', icon: 'string' },
  { key: 'leather', icon: 'leather' },
  { key: 'bone', icon: 'bone' },
  { key: 'feather', icon: 'feather' },
  { key: 'gunpowder', icon: 'gunpowder' },
  // A pérola e o olho do Fim: o olho é o que abre o portal (`portalDoFim.js`).
  { key: 'ender_pearl', icon: 'ender_pearl', stack: 16 },
  { key: 'ender_eye', icon: 'ender_eye' },
  { key: 'wheat', icon: 'wheat' },
  // A semente é MATERIAL, não bloco: ela não se coloca, se PLANTA — e plantar
  // só funciona em solo arado, o que é regra de `agricultura.js` e não de
  // `placeableBlock`. Fosse item de bloco, o jogador espalharia trigo brotando
  // em cima de pedra.
  { key: 'wheat_seeds', icon: 'wheat_seeds', planta: 'wheat' },
  // As duas sementes de caule. `planta` aponta pro TIPO de cultivo, e é o mesmo
  // campo que a cenoura usa — quem resolve o que nasce é `agricultura.js`.
  { key: 'pumpkin_seeds', icon: 'pumpkin_seeds', planta: 'pumpkinStem' },
  { key: 'melon_seeds', icon: 'melon_seeds', planta: 'melonStem' },
  { key: 'flint', icon: 'flint' },
  // ⚠️ PAPEL E LIVRO existem pra dar função à CANA, que era enfeite de margem.
  // Não entrou açúcar junto: açúcar só tem uso em bolo e poção, e nenhum dos
  // dois existe neste jogo — seria criar item morto pra consertar item morto.
  { key: 'paper', icon: 'paper' },
  { key: 'book', icon: 'book' },
  // ⚠️ A TINTA JÁ CAÍA DA LULA E DO POLVO ANTES DE EXISTIR AQUI (RC-09).
  // `mobs.js` a dropava, o inventário não a conhecia, e o save descartava o
  // slot no recarregamento. Item que o jogo entrega tem que existir.
  { key: 'ink_sac', icon: 'ink_sac' },

  // ── FERMENTAÇÃO ──────────────────────────────────────────────────────────
  //
  // ⚠️ TODA GARRAFA EMPILHA UMA SÓ. É o contrato do jogo de referência, e aqui
  // ele também é MECANISMO: o suporte converte a garrafa do slot inteira, e uma
  // pilha de três viraria três poções por um ingrediente. Com `stack: 1` o
  // jogador não consegue montar essa pilha nem por engano.
  //
  // `raw_fish` e `melon_slice` já existiam e viram ingrediente sem mudar nada:
  // o que faz deles ingrediente é a tabela de `fermentacao.js`, não uma marca
  // aqui — senão a mesma verdade viveria em dois lugares.
  //
  // ⚠️ O `icon` É SPRITE DA FOLHA DE ITENS, não textura de bloco. A primeira
  // escrita disto pôs `icon: 'glass'` e `icon: 'amethyst'` — nomes de BLOCO — e
  // `atlasAlinhado.spec.js` reprovou na hora. As nove garrafas são desenhadas
  // em `gen-roquecraft-items.mjs`, uma cor de líquido por efeito: garrafa igual
  // pra todas seria a mesma coisa que os três cubos cianos de 2026-08-19.
  { key: 'glass_bottle', icon: 'glass_bottle', stack: 16 },
  // ⚠️ SEM `contem`. A primeira escrita pôs `contem: 'water'` por simetria com
  // o balde, e `usarBalde` passou a interceptar a garrafa cheia antes do degrau
  // de beber — ela DESPEJAVA um bloco de água no mundo. `contem` é o campo que
  // faz um item ser balde; garrafa não é balde.
  { key: 'water_bottle', icon: 'water_bottle', stack: 1 },
  { key: 'sugar', icon: 'sugar' },
  { key: 'spider_eye', icon: 'spider_eye' },
  { key: 'fermented_spider_eye', icon: 'fermented_spider_eye' },
  { key: 'nether_wart', icon: 'nether_wart' },
]

// ── BALDES ──────────────────────────────────────────────────────────────────
//
// Três itens, um objeto. `contem` é o que está dentro: `null` vazio, ou a chave
// do bloco de fonte. É esse campo que a ação de usar lê — nada de comparar a
// string do item, que espalharia a regra por três `if` de nome.
//
// O vazio empilha até 16, como no original; os cheios não empilham. Um balde
// cheio é uma unidade de líquido, e empilhar unidades de líquido num slot só
// seria uma nascente de bolso.
const BUCKETS = [
  { key: 'bucket', contem: null, stack: 16 },
  { key: 'water_bucket', contem: 'water', stack: 1 },
  { key: 'lava_bucket', contem: 'lava', stack: 1 },
]

const FOODS = [
  { key: 'apple', icon: 'apple', hunger: 4, saturation: 2.4 },
  { key: 'bread', icon: 'bread', hunger: 5, saturation: 6 },
  { key: 'raw_beef', icon: 'raw_beef', hunger: 3, saturation: 1.8 },
  { key: 'cooked_beef', icon: 'cooked_beef', hunger: 8, saturation: 12.8 },
  { key: 'raw_porkchop', icon: 'raw_porkchop', hunger: 3, saturation: 1.8 },
  { key: 'cooked_porkchop', icon: 'cooked_porkchop', hunger: 8, saturation: 12.8 },
  { key: 'melon_slice', icon: 'melon_slice', hunger: 2, saturation: 1.2 },
  // Mesma história da tinta (RC-09): peixe e pinguim já dropavam `raw_fish`.
  // Fome e saturação são as da carne crua — é carne crua.
  { key: 'raw_fish', icon: 'raw_fish', hunger: 2, saturation: 1.2 },
  // ── RAÍZES: comida que não precisa de fornalha ────────────────────────────
  //
  // Numa partida nova o jogador come carne, e carne crua mata de fome devagar
  // enquanto ele procura carvão pra fornalha. A cenoura é a única comida do
  // jogo que se come do jeito que sai da terra e vale a pena — é ela que
  // separa "sobrevivi porque achei carvão" de "sobrevivi porque plantei".
  //
  // A batata CRUA é de propósito quase inútil (1 de fome): ela existe pra ser
  // assada, e é o que dá função de comida à fornalha depois do bife.
  { key: 'carrot', icon: 'carrot', hunger: 3, saturation: 3.6, planta: 'carrot' },
  { key: 'potato', icon: 'potato', hunger: 1, saturation: 0.6, planta: 'potato' },
  { key: 'baked_potato', icon: 'baked_potato', hunger: 5, saturation: 6 },
]

// Ferramentas: 5 tipos × 4 tiers + tesoura. `kind` casa com `BLOCKS[].tool`.
//
// ⚠️ A ENXADA CHEGOU DEPOIS DO TIPO 'hoe'. `blocks.js` já reconhecia `tool:
// 'hoe'` desde o musgo, e o inventário não tinha como produzir uma: o jogo
// declarava uma ferramenta que ninguém podia ter. Ferramenta que o mundo exige
// tem que ser craftável.
const TOOL_KINDS = [
  { kind: 'pickaxe', label: 'Pickaxe' },
  { kind: 'axe', label: 'Axe' },
  { kind: 'shovel', label: 'Shovel' },
  { kind: 'sword', label: 'Sword' },
  { kind: 'hoe', label: 'Hoe' },
]

export const ITEMS = {}

// AS POÇÕES, GERADAS DA TABELA DE FERMENTAÇÃO.
//
// ⚠️ NÃO SÃO ESCRITAS À MÃO de propósito: poção nova entra em `fermentacao.js`
// (que é onde a cadeia mora) e o item aparece sozinho. Escrever as duas listas
// separadas é como uma poção existiria na tabela e não no inventário — e o
// sintoma seria "fermentei e sumiu".
//
// `stack: 1` pela razão acima; o ícone é emprestado, porque garrafa colorida por
// efeito é arte que esta fatia não tem (`aparencia.js` faz o mesmo com trinta
// itens desde sempre).
const POCOES_COMO_ITENS = POCOES.map((key) => ({ key, icon: key, stack: 1 }))

function register(item) {
  ITEMS[item.key] = {
    stack: 64,
    kind: 'material',
    durability: 0,
    attack: 1,
    fuel: 0,
    ...item,
  }
}

// COMBUSTÍVEL DE MADEIRA.
//
// Só carvão e carvão vegetal tinham `fuel`, e os dois vêm DA fornalha ou de
// minerar carvão. Numa partida nova, sem picareta, a fornalha não acendia — e
// a fornalha é justamente o que destrava o ferro. O que quebra o círculo é o
// mesmo do original: madeira queima.
//
// A unidade é "quantos itens esta unidade funde" (ver `poderDeQueima` em
// `mobilia.js`). Carvão = 8; tábua = 1,5 no original, aqui 1 pra não precisar
// de fração no estado.
const COMBUSTIVEL_DE_BLOCO = {
  oakPlanks: 1,
  birchPlanks: 1,
  sprucePlanks: 1,
  junglePlanks: 1,
  oakLog: 1,
  birchLog: 1,
  spruceLog: 1,
  jungleLog: 1,
  craftingTable: 1,
  bookshelf: 1,
}

// 1. Blocos → itens (o ícone é a textura do TOPO do bloco, renderizada em cubo
//    isométrico pela UI).
for (const b of Object.values(BLOCKS)) {
  // Variante de FORMA não é item. A metade de cima da laje existe no mundo mas
  // não no inventário: a peça é uma só e a metade sai do encaixe. Ver `semItem`.
  if (b.semItem) continue
  register({
    key: b.key,
    kind: 'block',
    blockId: b.id,
    icon: null,
    iconBlock: b.id,
    fuel: COMBUSTIVEL_DE_BLOCO[b.key] || 0,
    i18n: `roqueCraft.blocks.${b.key}`,
  })
}

// 2. Materiais e comidas.
for (const m of MATERIALS) {
  register({ ...m, kind: 'material', i18n: `roqueCraft.items.${m.key}` })
}
for (const p of POCOES_COMO_ITENS) {
  register({ ...p, kind: 'material', i18n: `roqueCraft.items.${p.key}` })
}
for (const f of FOODS) {
  register({
    key: f.key,
    icon: f.icon,
    kind: 'food',
    stack: 64,
    hunger: f.hunger,
    saturation: f.saturation,
    // Raiz é comida QUE SE PLANTA: o mesmo item alimenta e vira lavoura. Sem
    // propagar este campo, `doPlace` trataria a cenoura só como comida e
    // plantar cenoura seria impossível.
    ...(f.planta ? { planta: f.planta } : {}),
    i18n: `roqueCraft.items.${f.key}`,
  })
}

// 2b. Baldes.
for (const b of BUCKETS) {
  register({
    key: b.key,
    icon: b.key,
    kind: 'material',
    stack: b.stack,
    balde: { contem: b.contem },
    i18n: `roqueCraft.items.${b.key}`,
  })
}

// 3. Ferramentas.
for (const t of TOOL_KINDS) {
  for (let tier = 0; tier < 4; tier++) {
    const key = `${TIER_NAME[tier]}_${t.kind}`
    register({
      key,
      kind: 'tool',
      stack: 1,
      icon: key,
      tool: { kind: t.kind, tier },
      durability: TIER_DURABILITY[tier],
      attack: t.kind === 'sword' ? 4 + tier * 1.5 : 1 + tier * 0.5,
      i18n: `roqueCraft.items.${key}`,
    })
  }
}
// ── O ISQUEIRO ──────────────────────────────────────────────────────────────
//
// Existe por UMA razão: acender o portal. E é por isso que ele tem durabilidade
// e não é infinito — o isqueiro é o custo de abrir um caminho entre mundos, e
// custo que não se gasta não é custo.
//
// A corrente inteira fecha sem atalho: cascalho dá pederneira, minério de ferro
// dá ferro cru, forno dá lingote, bancada junta os dois. Nenhum elo é achado de
// mapa.
register({
  key: 'flint_and_steel',
  kind: 'tool',
  stack: 1,
  icon: 'flint_and_steel',
  tool: { kind: 'igniter', tier: 1 },
  durability: 64,
  i18n: 'roqueCraft.items.flint_and_steel',
})

// ── A ARMADURA ──────────────────────────────────────────────────────────────
//
// Doze peças de uma tabela só (`armadura.js`): o item nasce da tabela, como a
// poção nasce da fermentação. Uma peça escrita aqui e não lá seria uma armadura
// que veste e não protege.
for (const a of ARMADURAS) {
  register({
    key: a.key,
    kind: 'armor',
    stack: 1,
    icon: a.key,
    armadura: { peca: a.peca, pontos: a.pontos },
    durability: a.durabilidade,
    i18n: `roqueCraft.items.${a.key}`,
  })
}

// ── O ARCO E A FLECHA ───────────────────────────────────────────────────────
//
// O arco é ferramenta de `kind: 'bow'`: segurar o botão direito carrega e
// soltar atira (`arco.js`). A flecha é munição: sem ela o arco não faz nada,
// e é ela que dá o motivo de recolher pena, pederneira e vara.
register({
  key: 'bow',
  kind: 'tool',
  stack: 1,
  icon: 'bow',
  tool: { kind: 'bow', tier: 1 },
  durability: 384,
  i18n: 'roqueCraft.items.bow',
})
register({
  key: 'arrow',
  kind: 'material',
  stack: 64,
  icon: 'arrow',
  i18n: 'roqueCraft.items.arrow',
})
// O escudo é ferramenta de `kind: 'shield'`: segurar o botão direito levanta a
// guarda (`escudo.js`) e apara golpe, flecha e estouro que vêm pela frente.
register({
  key: 'shield',
  kind: 'tool',
  stack: 1,
  icon: 'shield',
  tool: { kind: 'shield', tier: 1 },
  durability: 336,
  i18n: 'roqueCraft.items.shield',
})

register({
  key: 'shears',
  kind: 'tool',
  stack: 1,
  icon: 'shears',
  tool: { kind: 'shears', tier: 1 },
  durability: 238,
  i18n: 'roqueCraft.items.shears',
})

export const itemDef = (key) => ITEMS[key] || null
export const isBlockItem = (key) => ITEMS[key]?.kind === 'block'
export const blockIdOf = (key) => ITEMS[key]?.blockId ?? 0
export const toolOf = (key) => ITEMS[key]?.tool || null
export const maxStack = (key) => ITEMS[key]?.stack ?? 64

// Todos os ícones NÃO-bloco que o gerador de texturas precisa produzir.
export const ITEM_ICON_NAMES = [
  ...new Set(
    Object.values(ITEMS)
      .map((i) => i.icon)
      .filter(Boolean),
  ),
].sort()

// Item que um bloco vira ao ser quebrado (já resolvido em `blocks.js`), mas
// alguns blocos dropam um item que NÃO existe como bloco: valida no boot.
export function validateDrops() {
  const missing = []
  for (const b of Object.values(BLOCKS)) {
    if (b.drops && !ITEMS[b.drops]) missing.push(`${b.key} → ${b.drops}`)
  }
  return missing
}

// Item → bloco colocável (null se não for colocável).
export function placeableBlock(key) {
  const it = ITEMS[key]
  if (!it) return 0
  if (it.kind === 'block') return it.blockId
  // Material que vira bloco: o pó de redstone é o primeiro, e a porta fica
  // aberta para o próximo (semente de melancia já seria um, se plantar não
  // fosse outra ação).
  if (it.colocaBloco) return BLOCK_BY_KEY[it.colocaBloco]?.id || 0
  return 0
}

export { BLOCK_BY_KEY }
