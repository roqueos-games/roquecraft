// CARREGADOR DE RESOURCE PACK LOCAL.
//
// Por que existe, e por que ele NÃO acompanha nenhum pack:
//
// O founder tem licença do Stratum (Continuum Graphics) e quis usá-lo no jogo.
// A licença permite USAR; ela proíbe REDISTRIBUIR - "you may not redistribute
// (...) or otherwise transfer your rights to use the Software" - e crédito não
// substitui permissão (em CC-BY o crédito é a condição da redistribuição; aqui
// ela é proibida de qualquer forma). Publicar os arquivos em roqueos.web.app
// seria redistribuir, com ou sem fins financeiros.
//
// A saída que respeita as duas coisas: o jogo sabe LER um pack, e o pack fica
// na máquina de quem tem a licença. `public/games/roquecraft/pack/` está no
// .gitignore - não entra no repositório, não entra no build, não sobe. Quem não
// tiver pack nenhum joga com as 81 texturas procedurais de sempre, sem perceber
// que este arquivo existe.
//
// Formato aceito: a árvore padrão de um resource pack de Minecraft
// (`assets/minecraft/textures/block/<nome>.png`), porque é o que os packs de
// verdade trazem. Cada textura NOSSA tem um ou mais candidatos lá; a primeira
// que existir vence, e o que faltar continua procedural.

export const PACK_BASE = '/games/roquecraft/pack/'

// Nome nosso → candidatos no pack, em ordem de preferência. Os nomes do
// Minecraft mudaram entre versões (grass_side → grass_block_side), então cada
// entrada aceita as duas grafias.
const MAPA = {
  grass_top: ['grass_block_top', 'grass_top'],
  grass_side: ['grass_block_side', 'grass_side'],
  oak_log: ['oak_log', 'log_oak'],
  oak_log_top: ['oak_log_top', 'log_oak_top'],
  birch_log: ['birch_log', 'log_birch'],
  birch_log_top: ['birch_log_top', 'log_birch_top'],
  spruce_log: ['spruce_log', 'log_spruce'],
  spruce_log_top: ['spruce_log_top', 'log_spruce_top'],
  jungle_log: ['jungle_log', 'log_jungle'],
  jungle_log_top: ['jungle_log_top', 'log_jungle_top'],
  oak_leaves: ['oak_leaves', 'leaves_oak'],
  birch_leaves: ['birch_leaves', 'leaves_birch'],
  spruce_leaves: ['spruce_leaves', 'leaves_spruce'],
  jungle_leaves: ['jungle_leaves', 'leaves_jungle'],
  oak_planks: ['oak_planks', 'planks_oak'],
  spruce_planks: ['spruce_planks', 'planks_spruce'],
  oak_sapling: ['oak_sapling', 'sapling_oak'],
  tall_grass: ['short_grass', 'grass', 'tall_grass_top'],
  flower_red: ['poppy', 'flower_rose'],
  flower_yellow: ['dandelion', 'flower_dandelion'],
  wool_white: ['white_wool', 'wool_colored_white'],
  wool_red: ['red_wool', 'wool_colored_red'],
  wool_green: ['green_wool', 'wool_colored_green'],
  wool_blue: ['blue_wool', 'wool_colored_blue'],
  water: ['water_still', 'water'],
  lava: ['lava_still', 'lava'],
  torch: ['torch', 'torch_on'],
  // Pack externo não costuma trazer a chama separada: nesse caso cai no tile
  // da tocha inteira, que ao menos tem a chama desenhada dentro dele.
  torch_flame: ['torch_flame', 'torch', 'torch_on'],
  // Sem tile equivalente em pack externo: cai na grama alta, que ao menos é
  // vegetação, em vez de aparecer como textura faltando.
  kelp: ['kelp', 'kelp_plant', 'short_grass', 'grass'],
  bamboo: ['bamboo_stalk', 'bamboo', 'sugar_cane'],
  bamboo_leaves: ['bamboo_large_leaves', 'bamboo_leaves', 'jungle_leaves'],
  seagrass: ['seagrass', 'short_grass', 'grass'],
  sandstone_top: ['sandstone_top'],
  red_sand: ['red_sand'],
  moss: ['moss_block', 'moss'],
  podzol_top: ['podzol_top', 'dirt_podzol_top'],
  podzol_side: ['podzol_side', 'dirt_podzol_side'],
  sugar_cane: ['sugar_cane', 'reeds'],
  chest_front: ['chest_front', 'oak_planks'],
  chest_side: ['chest_side', 'oak_planks'],
  chest_top: ['chest_top', 'oak_planks'],
  lantern: ['lantern'],
  amethyst: ['amethyst_block'],
  deepslate: ['deepslate'],
  terracotta: ['terracotta', 'hardened_clay'],
}

const candidatos = (nome) => MAPA[nome] || [nome]

function carregar(url) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

/**
 * O pack existe?
 *
 * ⚠️ NÃO basta olhar o status. Este site é uma SPA: o Firebase Hosting reescreve
 * todo caminho desconhecido pro `index.html` e responde **200**. Testar só
 * `r.ok` dava "tem pack" em TODA carga em produção, e o jogo saía pedindo as 85
 * imagens do pack, cada uma recebendo HTML de volta, falhando a decodificação e
 * caindo no procedural - o resultado era certo e o custo era absurdo (medido em
 * roqueos.web.app em 2026-08-22).
 *
 * O que prova que existe pack é o CONTEÚDO: um `pack.mcmeta` de verdade é JSON
 * com um objeto `pack` dentro. HTML não passa por `JSON.parse`.
 */
export async function packDisponivel() {
  try {
    const r = await fetch(`${PACK_BASE}pack.mcmeta`, { method: 'GET', cache: 'no-cache' })
    if (!r.ok) return false
    const texto = await r.text()
    const meta = JSON.parse(texto)
    return !!meta && typeof meta === 'object' && !!meta.pack
  } catch {
    // JSON inválido (o index.html da SPA cai aqui), rede fora, CORS: sem pack.
    return false
  }
}

/**
 * Lê o pack e devolve `{ tile, camadas }`, onde `camadas` é um mapa
 * nome→ImageData já no tamanho `tile`. As que faltarem ficam de fora e o
 * chamador mantém a procedural daquela camada.
 *
 * A resolução vem da PRIMEIRA textura encontrada: um pack 128× tem tudo 128×,
 * mas se vier misturado tudo é reamostrado pro mesmo tile - `DataArrayTexture`
 * exige camadas do mesmo tamanho.
 */
export async function lerPack(nomes, { tileMax = 256 } = {}) {
  const achadas = new Map()
  let tile = 0

  for (const nome of nomes) {
    for (const cand of candidatos(nome)) {
      const img = await carregar(`${PACK_BASE}assets/minecraft/textures/block/${cand}.png`)
      if (!img) continue
      // Textura ANIMADA (água, lava) vem como tira vertical de quadros: a
      // largura manda, e a gente fica com o primeiro quadro. Sem isto a água
      // entra esticada em 1/32 da altura e o mar vira listra.
      const lado = Math.min(img.width, tileMax)
      if (!tile) tile = lado
      achadas.set(nome, img)
      break
    }
  }
  if (!tile) return null

  const canvas = document.createElement('canvas')
  canvas.width = tile
  canvas.height = tile
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const camadas = new Map()
  for (const [nome, img] of achadas) {
    ctx.clearRect(0, 0, tile, tile)
    // recorta só o primeiro quadro (quadrado) e reamostra pro tile comum
    const q = Math.min(img.width, img.height)
    ctx.drawImage(img, 0, 0, q, q, 0, 0, tile, tile)
    camadas.set(nome, ctx.getImageData(0, 0, tile, tile).data.slice())
  }
  return { tile, camadas, total: camadas.size }
}

/**
 * Substitui, no buffer de uma folha já fatiada, as camadas que o pack trouxe.
 * Mexe só no ALBEDO: normal e MER continuam os nossos, porque pack de terceiro
 * usa convenção própria de canal (specular/roughness trocados) e misturar as
 * duas convenções deixa o mundo com brilho errado - pior que não usar.
 */
export function aplicarNoAlbedo(dados, nomes, tile, pack) {
  let trocadas = 0
  for (let i = 0; i < nomes.length; i++) {
    const px = pack.camadas.get(nomes[i])
    if (!px) continue
    dados.set(px, i * tile * tile * 4)
    trocadas++
  }
  return trocadas
}

// ⚠️ NÃO construa `DataArrayTexture` aqui.
//
// Existia neste arquivo uma `texturaDeCamadas()` — cópia da `makeArrayTexture`
// de `textures.js`, exportada e nunca chamada. Foi removida em 2026-08-22 junto
// com a correção da inversão vertical: `textures.js` agora vira as linhas pra
// ordem de GL DENTRO do construtor da textura, e uma segunda fábrica por aí é
// exatamente o caminho pelo qual o defeito volta pela porta dos fundos.
// Quem precisar de um texture array chama `makeArrayTexture` lá.
