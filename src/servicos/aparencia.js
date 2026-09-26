/**
 * Aparência aproximada: o que mostrar quando não dá para ler a textura de verdade.
 *
 * Duas tabelas que respondem a mesma pergunta em lugares diferentes:
 *
 *  - `FALLBACK_ICON`: o item não tem ícone próprio no atlas, então ele pega
 *    emprestado o de um BLOCO parecido. Vara vira tábua de carvalho, carvão vira
 *    minério de carvão, ferro fundido vira bloco de ferro.
 *  - `blockTintColor`: a partícula de quebra precisa de uma cor, e ler o texel
 *    da GPU para descobrir a cor média de um bloco custaria uma leitura de
 *    volta por estilhaço.
 *
 * ⚠️ SÃO SERVIÇO E NÃO COMPOSABLE porque não guardam ciclo de vida: são tabela
 * e função pura, sem timer, sem assinatura, sem nada para cancelar quando o app
 * fecha. O critério está escrito em `useRoqueCraftPersistencia`, e vale nos dois
 * sentidos: o que não tem ciclo de vida não vira composable só porque saiu do
 * componente.
 *
 * ⚠️ O CACHE É POR `def.id` E A BUSCA É POR `def.key`, e isso não é descuido.
 * `id` é o número do bloco no mundo (8 bits, o recurso escasso); `key` é o nome
 * legível. A tabela é escrita por nome porque nome é o que um humano revisa, e o
 * cache é por número porque número é o que chega no laço de partícula.
 */

/** Item sem ícone próprio empresta o de um bloco parecido. */
export const FALLBACK_ICON = {
  stick: 'oakPlanks',
  coal: 'coalOre',
  charcoal: 'coalBlock',
  raw_iron: 'ironOre',
  iron_ingot: 'ironBlock',
  raw_copper: 'copperOre',
  copper_ingot: 'terracotta',
  raw_gold: 'goldOre',
  gold_ingot: 'goldBlock',
  diamond: 'diamondBlock',
  emerald: 'emeraldOre',
  redstone: 'redstoneOre',
  clay_ball: 'clay',
  brick: 'bricks',
  glowstone_dust: 'glowstone',
  snowball: 'snowBlock',
  string: 'whiteWool',
  leather: 'dirt',
  bone: 'bedrock',
  feather: 'whiteWool',
  gunpowder: 'gravel',
  wheat: 'sand',
  flint: 'gravel',
  apple: 'redFlower',
  bread: 'sand',
  raw_beef: 'redFlower',
  cooked_beef: 'terracotta',
  raw_porkchop: 'redFlower',
  cooked_porkchop: 'terracotta',
  melon_slice: 'greenWool',
  shears: 'ironBlock',
}

// Ferramenta empresta o ícone do MATERIAL dela, e as quatro famílias seguem a
// mesma regra. Gerar em laço em vez de escrever 16 linhas é o que impede a
// picareta de diamante de sair com o ícone da de madeira num dia de pressa.
for (const tier of ['wood', 'stone', 'iron', 'diamond']) {
  const mat = {
    wood: 'oakPlanks',
    stone: 'cobblestone',
    iron: 'ironBlock',
    diamond: 'diamondBlock',
  }[tier]
  for (const kind of ['pickaxe', 'axe', 'shovel', 'sword']) FALLBACK_ICON[`${tier}_${kind}`] = mat
}

/** Cor de partícula por bloco, escrita por nome legível. */
const COR_APROXIMADA = {
  grassBlock: 0x6a9c42,
  dirt: 0x7a5334,
  stone: 0x8b8b90,
  cobblestone: 0x8f8f93,
  sand: 0xdfd0a0,
  oakLog: 0x9a7444,
  oakLeaves: 0x4f8a3a,
  oakPlanks: 0xbb9660,
  water: 0x2f86c8,
  lava: 0xff5a1a,
  coalOre: 0x1b1b1e,
  ironOre: 0xd0a181,
  goldOre: 0xf7d24a,
  diamondOre: 0x5df2e4,
  snowBlock: 0xf2f4f6,
  gravel: 0x8b8580,
}

/** Cinza de pedra: o que um bloco sem cor declarada vira. */
export const COR_PADRAO = 0x8b8b90
/** Cinza neutro para `def` ausente, que é caso de erro e não de bloco. */
export const COR_SEM_BLOCO = 0x888888

const TINT_CACHE = {}

/**
 * Cor média aproximada do bloco, para a partícula de quebra.
 * @param {{id:number, key:string}|null|undefined} def
 * @returns {number} cor em 0xRRGGBB
 */
export function blockTintColor(def) {
  if (!def) return COR_SEM_BLOCO
  if (TINT_CACHE[def.id] != null) return TINT_CACHE[def.id]
  // `in` e nao `??`: a pergunta e' "a tabela DECLARA cor para este bloco?", e
  // ela nao muda se um dia a cor declarada for 0x000000 (preto). O `??`
  // respondia certo hoje por acidente -- nenhuma cor da tabela e' zero --, e
  // por isso nenhum teste conseguia separa-lo de um `||`.
  TINT_CACHE[def.id] = def.key in COR_APROXIMADA ? COR_APROXIMADA[def.key] : COR_PADRAO
  return TINT_CACHE[def.id]
}

/** Esvazia o cache. Existe para o teste, e para troca de resource pack. */
export function limparCacheDeCor() {
  for (const k of Object.keys(TINT_CACHE)) delete TINT_CACHE[k]
}
