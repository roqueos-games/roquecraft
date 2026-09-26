// RoqueCraft - geração de mundo infinito, determinística por seed.
//
// Um chunk é gerado em 4 passes:
//   1. TERRENO   - altura por coluna a partir de 4 campos de ruído
//                  (continentalidade, erosão, cristas, detalhe) e o bioma vindo
//                  de temperatura × umidade × altura.
//   2. CAVERNAS  - dois campos de ruído 3D em faixa estreita se cruzam e viram
//                  TÚNEL; um terceiro campo abre salões ("queijo") no fundo.
//   3. MINÉRIO   - veios elipsoidais com origem sorteada por chunk, em faixas
//                  de profundidade (carvão raso, diamante fundo).
//   4. FEATURES  - árvores, cactos, grama alta, flores, cana e abóbora. Rodam
//                  pra TODOS os 9 chunks da vizinhança e escrevem só o que cai
//                  dentro deste chunk, então uma árvore na divisa sai inteira.
//
// Nada aqui toca three, Firebase ou DOM: o pipeline inteiro roda dentro de um
// Web Worker e é testável em Node.

import { createPerlin, fbm2, fbm3, ridged2, hash3, smoothstep, mulberry32 } from './noise.js'
import { CHUNK_SIZE, WORLD_HEIGHT, SEA_LEVEL, localIndex, AIR } from './constants.js'
import { ID, IS_SOLID, IDS_DO_CULTIVO } from './blocks.js'
import { planoDaCachoeira, ehCandidata } from './cachoeiraDeMontanha.js'
import { BIOMAS_DA_ALDEIA, planoDoAssentamento, colunaDaAldeia } from './aldeia.js'
import { planoDaFortaleza, colunaDaFortaleza } from './fortaleza.js'
import { MATERIAIS } from './vilaCasa.js'
import { BIOMAS_DO_CASTELO, colunaDoCastelo, planoDoCastelo } from './castelo.js'

export const BIOMES = {
  ocean: 0,
  beach: 1,
  plains: 2,
  forest: 3,
  desert: 4,
  savanna: 5,
  jungle: 6,
  taiga: 7,
  snowy: 8,
  mountains: 9,
  swamp: 10,
}

export const BIOME_NAMES = Object.keys(BIOMES)

// Cor de folhagem e grama por bioma (multiplicada no shader). É o que faz a
// selva ficar verde-vivo e a savana amarelada sem precisar de textura própria.
// As cores abaixo sao escolhidas em sRGB (e o que o olho le num seletor), mas o
// shader multiplica ALBEDO LINEAR. Sem converter, [0.63,0.86,0.34] entrava como
// verde-menta claro e a planicie inteira ficava pastel. A conversao e o que
// devolve o verde cheio.
const s2l = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
// Piso por canal a 22% do maior. O tint e MULTIPLICADOR: zerar um canal apaga a
// informacao da textura naquele canal. Depois de linearizar, a selva
// ([0.2,0.82,0.16] em sRGB) virava (0.03, 0.64, 0.02) - verde neon quase puro,
// com o bioma inteiro saindo em saturacao 0.94 e luminancia 0.08 no QA.
const floorTint = (c) => {
  const l = c.map(s2l)
  const mx = Math.max(...l)
  return l.map((v) => Math.max(v, mx * 0.22))
}
const tint = (g, f) => ({ grass: floorTint(g), foliage: floorTint(f) })

export const BIOME_TINT = {
  [BIOMES.ocean]: tint([0.42, 0.7, 0.44], [0.3, 0.56, 0.32]),
  [BIOMES.beach]: tint([0.66, 0.84, 0.4], [0.42, 0.66, 0.3]),
  [BIOMES.plains]: tint([0.63, 0.86, 0.34], [0.4, 0.68, 0.26]),
  [BIOMES.forest]: tint([0.36, 0.72, 0.28], [0.2, 0.5, 0.17]),
  [BIOMES.desert]: tint([0.82, 0.74, 0.32], [0.6, 0.58, 0.26]),
  [BIOMES.savanna]: tint([0.85, 0.78, 0.28], [0.64, 0.62, 0.24]),
  [BIOMES.jungle]: tint([0.2, 0.82, 0.16], [0.12, 0.56, 0.12]),
  [BIOMES.taiga]: tint([0.44, 0.7, 0.5], [0.22, 0.44, 0.32]),
  [BIOMES.snowy]: tint([0.66, 0.82, 0.72], [0.46, 0.66, 0.56]),
  [BIOMES.mountains]: tint([0.52, 0.76, 0.44], [0.3, 0.54, 0.28]),
  [BIOMES.swamp]: tint([0.44, 0.58, 0.24], [0.3, 0.44, 0.18]),
}

// Um contexto de ruído por mundo. Montar a tabela de permutação custa caro:
// criar UMA vez e passar adiante.
export function createNoiseContext(seed) {
  return {
    seed,
    cont: createPerlin(seed + 1),
    ero: createPerlin(seed + 2),
    ridge: createPerlin(seed + 3),
    det: createPerlin(seed + 4),
    temp: createPerlin(seed + 5),
    hum: createPerlin(seed + 6),
    caveA: createPerlin(seed + 7),
    caveB: createPerlin(seed + 8),
    cheese: createPerlin(seed + 9),
    beach: createPerlin(seed + 10),
    dens: createPerlin(seed + 11),
  }
}

// ── 1. Terreno ──────────────────────────────────────────────────────────────

// Altura do topo sólido em (x,z). Composição:
//  cont  → onde é continente e onde é oceano (escala de centenas de blocos)
//  ero   → quão "gasto" é o relevo: erosão alta achata, baixa deixa erguer
//  ridge → cristas afiadas (o `1-|n|` do ridged), só onde a erosão permite
//  det   → o relevo miúdo que tira o aspecto de terreno interpolado
// A continentalidade tem escala de ~1100 blocos, então uma semente pode
// colocar a origem no meio do oceano - e o jogador (e a foto de capa) nasce
// olhando para uma planície de água. Um viés gaussiano centrado na origem
// garante CONTINENTE onde o mundo começa e some por completo depois de uns 2 km,
// então o resto do mundo continua sendo o que o ruído mandar.
export const SPAWN_BIAS_RADIUS = 900
export function spawnBias(x, z) {
  const d2 = (x * x + z * z) / (SPAWN_BIAS_RADIUS * SPAWN_BIAS_RADIUS)
  return 0.42 * Math.exp(-d2)
}

export function terrainHeight(nz, x, z) {
  const cont = fbm2(nz.cont, x * 0.0009, z * 0.0009, 4) + spawnBias(x, z)
  const ero = fbm2(nz.ero, x * 0.0022, z * 0.0022, 3)
  const ridge = ridged2(nz.ridge, x * 0.0042, z * 0.0042, 3)
  const det = fbm2(nz.det, x * 0.012, z * 0.012, 2)

  const land = smoothstep(-0.12, 0.1, cont) // 0 mar aberto · 1 continente
  let h = 33 + land * 31 // fundo do oceano ~33 · costa ~64

  // EROSÃO como fator de PLANURA. A primeira versão somava ruído fino em toda
  // parte e o mundo saía como um mar de degraus de 1 bloco (visto no QA de
  // 2026-08-19): sem planície de verdade e sem montanha de verdade, só textura.
  // Agora a erosão decide o caráter da região: alta = planície mesmo, baixa =
  // relevo jovem onde as cristas podem subir.
  const flat = smoothstep(-0.15, 0.35, ero) // 1 = planície
  const mountain = (1 - flat) * land
  h += Math.max(0, ridge) * 52 * mountain * mountain
  // o detalhe fino só existe onde o terreno é acidentado
  h += det * (2 + (1 - flat) * 7) * (0.35 + land * 0.65)
  return Math.max(2, Math.min(WORLD_HEIGHT - 8, Math.round(h)))
}

// Quão acidentada é a região (0 = planície lisa, 1 = relevo jovem). É o mesmo
// fator que a altura usa; exportado porque a densidade 3D também precisa dele.
export function ruggedness(nz, x, z) {
  const ero = fbm2(nz.ero, x * 0.0022, z * 0.0022, 3)
  const cont = fbm2(nz.cont, x * 0.0009, z * 0.0009, 4) + spawnBias(x, z)
  const land = smoothstep(-0.12, 0.1, cont)
  return (1 - smoothstep(-0.15, 0.35, ero)) * land
}

// Densidade da rocha em (x,y,z): positivo = sólido. É a MESMA conta do passe de
// terreno, exposta pra quem precisa saber onde a rocha realmente está sem gerar
// o chunk inteiro (as features, por exemplo).
export function density(nz, x, y, z, h, rug) {
  let d = h - y
  if (rug > 0.02) d += fbm3(nz.dens, x * 0.021, y * 0.03, z * 0.021, 3) * 11 * rug
  return d
}

// Topo sólido REAL de uma coluna. As features precisam disto, não do mapa de
// altura: com densidade 3D o topo pode estar vários blocos acima ou abaixo da
// altura teórica, e plantar pela altura teórica deixa tronco flutuando ou
// enterrado (defeito visto no QA de 2026-08-19).
export function solidTopAt(nz, x, z) {
  const h = terrainHeight(nz, x, z)
  const rug = ruggedness(nz, x, z)
  const ceiling = Math.min(WORLD_HEIGHT - 6, h + 2 + Math.round(rug * 9))
  for (let y = ceiling; y > 1; y--) {
    if (density(nz, x, y, z, h, rug) >= 0) return y
  }
  return 1
}

/**
 * Tem ROCHA nesta célula? Densidade 3D menos caverna, em coordenada global.
 *
 * ⚠️ `solidTopAt` NÃO RESPONDE ISTO. Ele dá o topo, e a montanha é oca por
 * dentro: entre o topo e o fundo há vão de densidade (saliência, penhasco) e
 * há caverna. Quem precisa saber se o CHÃO de uma poça existe — a cachoeira —
 * não pode deduzir isso da altura do terreno: a medição de 13/09/2026 achou 32
 * células de poça penduradas sobre caverna numa única semente, e a poça
 * escorreria por elas na primeira visita da fila.
 *
 * Não conhece o descarte de ilhota flutuante, que é do preenchimento da coluna
 * e é raro: ele só apaga faixa fina com vão embaixo.
 */
export function rochaEm(nz, x, y, z) {
  const h = terrainHeight(nz, x, z)
  if (density(nz, x, y, z, h, ruggedness(nz, x, z)) < 0) return false
  return !isCave(nz, x, y, z, h)
}

export function biomeAt(nz, x, z, height) {
  const temp = fbm2(nz.temp, x * 0.0014, z * 0.0014, 3)
  const hum = fbm2(nz.hum, x * 0.0018, z * 0.0018, 3)
  if (height < SEA_LEVEL - 3) return BIOMES.ocean
  if (height <= SEA_LEVEL + 1) {
    return temp < -0.35 ? BIOMES.snowy : BIOMES.beach
  }
  if (height > 92) return temp < -0.1 ? BIOMES.snowy : BIOMES.mountains
  if (temp < -0.32) return hum > 0 ? BIOMES.taiga : BIOMES.snowy
  if (temp > 0.3 && hum < -0.15) return BIOMES.desert
  if (temp > 0.24 && hum > 0.28) return BIOMES.jungle
  if (temp > 0.1 && hum < 0.05) return BIOMES.savanna
  if (hum > 0.34 && height < SEA_LEVEL + 4) return BIOMES.swamp
  if (hum > 0.12) return BIOMES.forest
  return BIOMES.plains
}

// Bloco de superfície e sub-superfície por bioma.
function surfaceFor(biome, height) {
  switch (biome) {
    case BIOMES.desert:
      return { top: ID.sand, sub: ID.sandstone, depth: 4 }
    case BIOMES.savanna:
      return { top: ID.grassBlock, sub: ID.dirt, depth: 3 }
    case BIOMES.beach:
      return { top: ID.sand, sub: ID.sand, depth: 4 }
    case BIOMES.ocean:
      return { top: height < SEA_LEVEL - 12 ? ID.gravel : ID.sand, sub: ID.sand, depth: 3 }
    case BIOMES.snowy:
      return { top: ID.snowBlock, sub: ID.dirt, depth: 3 }
    case BIOMES.taiga:
      return { top: ID.podzol, sub: ID.dirt, depth: 3 }
    case BIOMES.mountains:
      return height > 104
        ? { top: ID.snowBlock, sub: ID.stone, depth: 2 }
        : { top: ID.stone, sub: ID.stone, depth: 3 }
    case BIOMES.swamp:
      return { top: ID.grassBlock, sub: ID.dirt, depth: 4 }
    default:
      return { top: ID.grassBlock, sub: ID.dirt, depth: 3 }
  }
}

// ── 2. Cavernas ─────────────────────────────────────────────────────────────

// Dois campos de ruído 3D em faixa estreita ao redor de zero. Onde AMBOS estão
// perto de zero temos a interseção de duas superfícies = uma LINHA no espaço =
// um túnel. É o truque clássico (worley-free) e sai bem mais barato que
// escavar por caminhada de vermes.
function isCave(nz, x, y, z, surfaceY) {
  if (y < 2 || y > surfaceY - 4) return false
  const a = fbm3(nz.caveA, x * 0.014, y * 0.028, z * 0.014, 2)
  const b = fbm3(nz.caveB, x * 0.014, y * 0.028, z * 0.014, 2)
  // A faixa alarga com a profundidade: caverna estreita perto da superfície,
  // salão largo no fundo (dá progressão de exploração).
  const width = 0.055 + (1 - y / 64) * 0.028
  if (Math.abs(a) < width && Math.abs(b) < width) return true
  // "queijo": bolhas grandes só bem no fundo
  if (y < 34) {
    const c = fbm3(nz.cheese, x * 0.026, y * 0.04, z * 0.026, 2)
    if (c > 0.62) return true
  }
  return false
}

// ── 3. Minério ──────────────────────────────────────────────────────────────

// [id, tentativas por chunk, yMin, yMax, raio]
const ORES = [
  [ID.coalOre, 14, 12, 100, 2.1],
  [ID.copperOre, 8, 20, 76, 1.8],
  [ID.ironOre, 9, 6, 66, 1.7],
  [ID.goldOre, 3, 4, 34, 1.5],
  [ID.redstoneOre, 4, 2, 20, 1.6],
  [ID.diamondOre, 2, 2, 16, 1.3],
  [ID.emeraldOre, 1, 6, 30, 1.0],
]

// ── 3b. Variantes de pedra e argila ─────────────────────────────────────────
//
// Granito, diorito e andesito existiam em `blocks.js` desde o começo e o mundo
// NUNCA produziu um só: eram blocos de construção que ninguém podia obter
// construindo. O censo de geração (`worldgen-censo.spec.js`) foi quem mostrou -
// o backlog listava isso de cabeça, e cabeça não conta bloco.
//
// Por que a tabela é separada da de minério em vez de reusá-la: as duas regras
// são diferentes em três pontos, e amarrá-las obrigaria a inventar campos
// mortos nos minérios.
//
//  · BOLSÃO, não veio. Raio 4,2 contra 2,1 do carvão. Variante que sai do
//    tamanho de um veio de minério vira confete no meio da pedra e não lê como
//    formação - o jogador não percebe que mudou de rocha, só acha o subsolo
//    sujo. É por isso que o teste cobra 100 ppm de piso: menos que isso é
//    indistinguível de não existir.
//  · SEM ACHATAMENTO. O veio de minério é achatado no eixo Y (`dy*dy*1.4`)
//    porque minério corre em camada; bolsão de rocha é bolha, e arredondar
//    custa só tirar o fator.
//  · SÓ SOBRE PEDRA COMUM, e nunca sobre `deepslate` nem sobre minério - a
//    ordem de passagem garante isso, porque as variantes rodam ANTES do
//    minério: quem manda no que é raro continua sendo o minério.
//
// [id, tentativas por chunk, yMin, yMax, raio]
const VARIANTES_DE_PEDRA = [
  [ID.granite, 3, 4, 78, 4.2],
  [ID.diorite, 3, 4, 78, 4.2],
  [ID.andesite, 3, 4, 78, 4.2],
  // CASCALHO também entra aqui, e não é enfeite.
  //
  // Ele já existia na geração, mas SÓ no fundo de oceano abaixo de
  // `SEA_LEVEL - 12`: perto da origem, onde o viés de spawn garante continente,
  // o mundo não produzia um grão. O censo mostrou isso — eu teria jurado que
  // cascalho estava resolvido, porque o nome aparece no arquivo.
  //
  // Bolsão no subsolo é o que o original faz, e tem consequência de
  // jogabilidade: cascalho CAI quando se mina embaixo dele, então um bolsão no
  // teto de caverna é uma armadilha de verdade. A gravidade já existe desde a
  // rodada 9 — isto liga um sistema no outro em vez de acrescentar decoração.
  [ID.gravel, 2, 8, 60, 3.4],
]

/**
 * Argila: manchas rasas no LEITO da água, não no subsolo.
 *
 * No original ela é o que transforma uma margem de rio em recurso - é a fonte
 * de tijolo. A regra é geográfica, não geológica: onde há água por cima e areia
 * ou terra logo abaixo, dentro de dois blocos do nível do mar.
 */
const ARGILA = { tentativas: 6, raio: 2.4, faixa: 3 }

// ── Escrita local ───────────────────────────────────────────────────────────

const inChunk = (lx, lz) => lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE

function put(blocks, lx, y, lz, id) {
  if (!inChunk(lx, lz) || y < 0 || y >= WORLD_HEIGHT) return
  blocks[localIndex(lx, y, lz)] = id
}
function putIfAir(blocks, lx, y, lz, id) {
  if (!inChunk(lx, lz) || y < 0 || y >= WORLD_HEIGHT) return
  const i = localIndex(lx, y, lz)
  if (blocks[i] === AIR) blocks[i] = id
}
/**
 * Escreve SÓ onde já existe água — o oposto de `putIfAir`.
 *
 * A vegetação do leito nasce dentro da lâmina, e a célula-alvo nunca está
 * vazia: está cheia de água. `putIfAir` não escreveria nada ali, e foi o
 * primeiro jeito que eu tentei — a alga simplesmente não aparecia, sem erro
 * nenhum, porque a condição era falsa em todas as células candidatas.
 */
function putIfWater(blocks, lx, y, lz, id) {
  if (!inChunk(lx, lz) || y < 0 || y >= WORLD_HEIGHT) return
  const i = localIndex(lx, y, lz)
  if (blocks[i] === ID.water) blocks[i] = id
}
function readLocal(blocks, lx, y, lz) {
  if (!inChunk(lx, lz) || y < 0 || y >= WORLD_HEIGHT) return -1
  return blocks[localIndex(lx, y, lz)]
}

// ── 4. Features (árvores e vegetação) ───────────────────────────────────────

const TREE_KINDS = {
  oak: { log: ID.oakLog, leaves: ID.oakLeaves, minH: 4, maxH: 6, radius: 2 },
  birch: { log: ID.birchLog, leaves: ID.birchLeaves, minH: 5, maxH: 7, radius: 2 },
  spruce: {
    log: ID.spruceLog,
    leaves: ID.spruceLeaves,
    minH: 6,
    maxH: 9,
    radius: 2,
    conifer: true,
  },
  jungle: { log: ID.jungleLog, leaves: ID.jungleLeaves, minH: 8, maxH: 13, radius: 3 },
}

/**
 * A FORMA de uma árvore, em células RELATIVAS ao pé dela.
 *
 * ⚠️ UMA FONTE SÓ, e a razão é dura: a geração do mundo escreve num array de
 * chunk e a muda que cresce no jogo escreve célula a célula por `applyEdit`.
 * São dois destinos diferentes para a MESMA árvore. Se cada um tivesse a sua
 * cópia da forma, elas concordariam hoje e divergiriam no dia em que a copa
 * mudasse — e o sintoma seria "a árvore plantada é diferente da árvore do
 * mundo", que ninguém liga a um refatoramento de geometria.
 *
 * `seAr: true` marca a célula que só entra se houver ar ali (a copa não come
 * pedra); `false` é o tronco, que entra de qualquer jeito.
 */
export function celulasDaArvore(kind, rnd) {
  const celulas = []
  const poe = (dx, dy, dz, id) => celulas.push({ dx, dy, dz, id, seAr: false })
  const seAr = (dx, dy, dz, id) => celulas.push({ dx, dy, dz, id, seAr: true })
  const oy = 0

  const k = TREE_KINDS[kind]
  const h = k.minH + Math.floor(rnd() * (k.maxH - k.minH + 1))
  for (let i = 0; i < h; i++) poe(0, i, 0, k.log)
  const top = oy + h
  if (k.conifer) {
    // pinheiro: camadas cônicas que estreitam pra cima
    let r = k.radius + 1
    for (let dy = -Math.floor(h * 0.55); dy <= 1; dy++) {
      const rr = Math.max(0, Math.round(r))
      for (let dx = -rr; dx <= rr; dx++) {
        for (let dz = -rr; dz <= rr; dz++) {
          if (dx * dx + dz * dz > rr * rr + 1) continue
          if (dx === 0 && dz === 0 && dy < 1) continue
          seAr(dx, top + dy - oy, dz, k.leaves)
        }
      }
      r -= 0.5
    }
    poe(0, top + 1 - oy, 0, k.leaves)
    return celulas
  }
  // copa arredondada: elipsoide levemente achatado com borda irregular
  const r = k.radius
  for (let dy = -2; dy <= 1; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const d = dx * dx + dz * dz + dy * dy * 1.7
        if (d > r * r + 1.2) continue
        if (d > r * r - 0.4 && rnd() > 0.55) continue // borda mordida
        if (dx === 0 && dz === 0 && dy < 0) continue
        seAr(dx, top + dy - oy, dz, k.leaves)
      }
    }
  }
  poe(0, top + 1 - oy, 0, k.leaves)
  return celulas
}

/** Escreve a árvore no array de blocos de um chunk (geração do mundo). */
function plantTree(blocks, ox, oy, oz, kind, rnd) {
  for (const c of celulasDaArvore(kind, rnd)) {
    const escrever = c.seAr ? putIfAir : put
    escrever(blocks, ox + c.dx, oy + c.dy, oz + c.dz, c.id)
  }
}

// Densidade de árvore e tipo por bioma.
function treePlan(biome) {
  switch (biome) {
    case BIOMES.forest:
      return { chance: 0.1, kinds: ['oak', 'oak', 'birch'] }
    case BIOMES.taiga:
      return { chance: 0.09, kinds: ['spruce'] }
    case BIOMES.jungle:
      return { chance: 0.13, kinds: ['jungle', 'jungle', 'oak'] }
    case BIOMES.plains:
      return { chance: 0.012, kinds: ['oak'] }
    case BIOMES.savanna:
      return { chance: 0.016, kinds: ['oak'] }
    case BIOMES.swamp:
      return { chance: 0.035, kinds: ['oak'] }
    case BIOMES.snowy:
      return { chance: 0.02, kinds: ['spruce'] }
    case BIOMES.mountains:
      return { chance: 0.014, kinds: ['spruce'] }
    default:
      return { chance: 0, kinds: [] }
  }
}

// Roda as features de UM chunk de origem, escrevendo no `blocks` do chunk ALVO.
// `ocx/ocz` = chunk de origem das features; `bcx/bcz` = chunk sendo preenchido.
function runFeatures(nz, blocks, ocx, ocz, bcx, bcz, columnAt) {
  const rnd = mulberry32((ocx * 341873128) ^ (ocz * 132897987) ^ nz.seed)
  const dx = (ocx - bcx) * CHUNK_SIZE
  const dz = (ocz - bcz) * CHUNK_SIZE

  // Topo sólido em coordenada global, com memória. A bacia da cachoeira
  // pergunta a altura de ~50 colunas por tentativa, e `solidTopAt` desce a
  // coluna inteira avaliando densidade 3D a cada bloco: sem o cache, a mesma
  // coluna do anel seria recalculada uma vez por vizinho que a cita.
  const alturas = new Map()
  const alturaGlobal = (x, z) => {
    const k = `${x},${z}`
    let h = alturas.get(k)
    if (h === undefined) {
      h = solidTopAt(nz, x, z)
      alturas.set(k, h)
    }
    return h
  }
  const mundoDaCachoeira = {
    alturaEm: alturaGlobal,
    rochaEm: (x, y, z) => rochaEm(nz, x, y, z),
  }
  const hashDaCachoeira = (a, b, c) => hash3(a, b, c, nz.seed)

  // ⚠️ A ALDEIA É CALCULADA UMA VEZ POR CHUNK VIZINHO, e não por coluna. Cada
  // `planoDaAldeia` mede cinco colunas com `solidTopAt`; perguntar por coluna
  // seria 256 × 5 descidas de densidade 3D por chunk. E o resultado é o MESMO
  // para as 256 colunas, porque ele só depende da célula da grade.
  let planoDaVila
  const aldeiaAqui = () => {
    if (planoDaVila === undefined) {
      // ⚠️ `planoDoAssentamento` E NÃO `planoDaAldeia`: são TRÊS grades agora
      // (aldeia, vila, cidade) e elas se sobrepõem. Quem escolhe entre elas —
      // e recusa a menor quando a maior já reservou o chão — é o despachante.
      planoDaVila = planoDoAssentamento(
        hashDaCachoeira,
        {
          alturaEm: alturaGlobal,
          nivelDoMar: SEA_LEVEL,
          // O bioma do CENTRO manda; ver a nota em `planoDaAldeia`.
          biomaEm: (x, z) => columnAt(x, z)?.biome,
          biomaAceito: (b) => BIOMAS_DA_ALDEIA.includes(BIOME_NAMES[b]),
          // Savana constrói de pinho e pedra-tijolo; planície, de carvalho e
          // pedregulho. É o mesmo dado que já decidiu se a vila cabe.
          materialDaVila: (c) =>
            columnAt(c.x, c.z)?.biome === BIOMES.savanna ? MATERIAIS.pinho : MATERIAIS.carvalho,
        },
        ocx,
        ocz,
      )
    }
    return planoDaVila
  }

  // ⚠️ UMA VEZ POR CHUNK VIZINHO, como a aldeia, e pelo mesmo motivo: cada
  // `planoDoCastelo` mede cinco colunas com `solidTopAt`, e o resultado é o
  // mesmo para as 256 colunas porque só depende da célula da grade.
  let planoDoForte
  const casteloAqui = () => {
    if (planoDoForte === undefined) {
      planoDoForte = planoDoCastelo(
        hashDaCachoeira,
        {
          alturaEm: alturaGlobal,
          nivelDoMar: SEA_LEVEL,
          biomaEm: (x, z) => columnAt(x, z)?.biome,
          // A lista mora em `castelo.js`; ver a nota de BIOMAS_DO_CASTELO.
          biomaAceito: (b) => BIOMAS_DO_CASTELO.includes(BIOME_NAMES[b]),
        },
        ocx,
        ocz,
      )
    }
    return planoDoForte
  }

  for (let i = 0; i < CHUNK_SIZE; i++) {
    for (let j = 0; j < CHUNK_SIZE; j++) {
      const gx = ocx * CHUNK_SIZE + i
      const gz = ocz * CHUNK_SIZE + j
      const col = columnAt(gx, gz)
      if (!col) continue
      const { biome } = col
      // topo REAL (a densidade 3D move o topo em relação ao mapa de altura)
      const height = alturaGlobal(gx, gz)
      // coordenada LOCAL no chunk que está sendo preenchido
      const lx = i + dx
      const lz = j + dz
      const surfaceY = height + 1

      // ── A ALDEIA ─────────────────────────────────────────────────────────
      //
      // Mesma regra da cachoeira, e pelo mesmo motivo: só dado global decide. O
      // plano sai da célula da grade e da altura do terreno, e nenhuma das duas
      // depende de qual buffer está sendo preenchido.
      //
      // Não há teste de bioma AQUI de propósito: quem já testou foi
      // `planoDaAldeia`, pelo bioma do CENTRO. Repetir por coluna traria de
      // volta a aldeia cortada na divisa.
      //
      // ⚠️ O GERADOR NÃO SABE MAIS O QUE É CASA. `colunaDaAldeia` responde o que
      // esta coluna recebe e qual a altura de cada peça; aqui só se escreve. Foi
      // o intervalo `chao..chao+4` cravado NESTE laço que segurou o telhado
      // plano por tanto tempo.
      //
      // ⚠️ E ELA VEM ANTES DE TUDO, inclusive do ramo do nível do mar — este é o
      // lugar dela, não uma conveniência. O ramo de água dá `continue` na coluna
      // inteira, e uma casa cuja pegada encosta na margem de um lago tinha as
      // colunas de terreno baixo puladas em silêncio: a sonda achou uma casa com
      // 63 blocos de 200, metade dela simplesmente ausente, em 14/09/2026.
      // Estar abaixo do nível do mar é assunto do TERRENO; a vila decide sozinha
      // o que fazer com a própria coluna, e ela preenche até o chão.
      //
      // Também vem antes da árvore: casa por baixo de carvalho seria casa com
      // tronco na sala, e o `continue` é o que impede a coluna de ganhar mato e
      // flor por cima do telhado.
      const vila = aldeiaAqui()
      const daVila = colunaDaAldeia(vila, gx, gz, alturaGlobal)
      if (daVila !== null) {
        for (const { y, id } of daVila) put(blocks, lx, y, lz, id)
        continue
      }

      // ── O CASTELO ────────────────────────────────────────────────────────
      //
      // Depois da aldeia porque as duas grades são independentes e a aldeia é
      // quem tem morador: num empate que não deveria existir, quem ganha é a
      // casa de alguém. `planoDoCastelo` recusa o forte que bate em aldeia, e é
      // esse recuo que torna o empate impossível — este `if` é a segunda linha.
      const forte = casteloAqui()
      const doCastelo = colunaDoCastelo(forte, gx, gz, alturaGlobal)
      if (doCastelo !== null) {
        for (const { y, id } of doCastelo) put(blocks, lx, y, lz, id)
        continue
      }

      if (height <= SEA_LEVEL) {
        // cana perto d'água em bioma quente/úmido
        if (
          height === SEA_LEVEL &&
          (biome === BIOMES.swamp || biome === BIOMES.jungle || biome === BIOMES.plains) &&
          rnd() < 0.06
        ) {
          const n = 1 + Math.floor(rnd() * 3)
          for (let k = 0; k < n; k++) putIfAir(blocks, lx, surfaceY + k, lz, ID.sugarCane)
        }
        // ── VIDA DO LEITO ──────────────────────────────────────────────────
        //
        // "precisamos de algas" — founder, 25/08/2026. Isto roda no MESMO ramo
        // da cana, que é o ramo do que está abaixo do nível do mar.
        //
        // Duas peças, e não uma, porque elas fazem trabalhos diferentes: o
        // capim-do-mar é denso e cobre o chão (é ele que faz o leito parecer
        // vivo quando se olha de cima); a alga é rara e SOBE, e é ela que dá
        // escala vertical à coluna d'água quando se mergulha.
        //
        // Fundo de PEDRA não recebe nada: o leito de oceano é areia ou
        // cascalho, e planta brotando em rocha nua foi o defeito que a grama
        // alta já teve em cima de montanha (QA de 2026-08-19).
        const leito = readLocal(blocks, lx, height, lz)
        const areia = leito === ID.sand || leito === ID.gravel || leito === ID.dirt
        const lamina = SEA_LEVEL - height
        if (areia && lamina >= 2) {
          if (rnd() < 0.16) {
            putIfWater(blocks, lx, surfaceY, lz, ID.seagrass)
          } else if (lamina >= 4 && rnd() < 0.035) {
            // A alga para DOIS blocos abaixo da superfície: encostada nela, a
            // ponta fura a lâmina e a planta aparece boiando fora d'água.
            const alto = Math.min(lamina - 2, 3 + Math.floor(rnd() * 8))
            for (let k = 0; k < alto; k++) putIfWater(blocks, lx, surfaceY + k, lz, ID.kelp)
          }
        }
        continue
      }

      // ── BAMBU, na selva ────────────────────────────────────────────────
      //
      // "precisamos de algas, bambus" — founder, 25/08/2026.
      //
      // Em TOUCEIRA e não espalhado: bambu solto no meio do mato lê como
      // vareta esquecida. O que faz o olho reconhecer bambuzal é um punhado de
      // colmos de alturas diferentes num raio de dois blocos, e é por isso que
      // a chance é baixa (2%) mas cada acerto planta várias varas.
      //
      // As DUAS últimas células de cada colmo são `bambooTop` — as únicas com
      // folha. Colmo folhudo da base ao topo é mato, não bambu.
      if (biome === BIOMES.jungle && rnd() < 0.02) {
        const varas = 3 + Math.floor(rnd() * 5)
        for (let v = 0; v < varas; v++) {
          const vx = lx + Math.round((rnd() - 0.5) * 4)
          const vz = lz + Math.round((rnd() - 0.5) * 4)
          const chao = readLocal(blocks, vx, height, vz)
          if (chao !== ID.grassBlock && chao !== ID.dirt && chao !== ID.podzol) continue
          const alto = 6 + Math.floor(rnd() * 9)
          // ⚠️ TUDO OU NADA. `putIfAir` sozinho escreveria o pedaço livre da
          // coluna e pularia o resto — e um colmo com buraco no meio, ou um
          // toco solto acima de uma copa, é pior que nenhum bambu. A checagem
          // prévia também evita que o colmo perfure uma árvore já plantada.
          //
          // Só vale dentro deste chunk: uma vara pode nascer de um chunk de
          // origem vizinho e ser desenhada em pedaços aqui. Por isso a peça é
          // sólida (ver a nota em blocks.js) — é o que garante que nada fique
          // desconectado mesmo quando as duas metades vêm de passadas
          // diferentes.
          let livre = true
          for (let k = 0; k < alto && livre; k++) {
            const c = readLocal(blocks, vx, height + 1 + k, vz)
            if (c !== AIR && c !== -1) livre = false
          }
          if (!livre) continue
          for (let k = 0; k < alto; k++) {
            putIfAir(blocks, vx, height + 1 + k, vz, k >= alto - 2 ? ID.bambooTop : ID.bamboo)
          }
        }
      }

      // O bloco de superfície decide o que pode nascer ali. Sem esta checagem,
      // grama alta brotava em pedra e neve de montanha (visto no QA de
      // 2026-08-19) - o terreno virava um jardim em cima de rocha nua.
      const surf = surfaceFor(biome, height).top
      const soil = surf === ID.grassBlock || surf === ID.dirt || surf === ID.podzol

      // ⚠️ O CHÃO PRECISA EXISTIR DE VERDADE, PRA TUDO — não só pra árvore.
      //
      // `soil` sai de `surfaceFor(biome, height)`: o material que a coluna
      // DEVERIA ter no topo, segundo o ruído 2D. A densidade 3D pode ter comido
      // esse topo (caverna, saliência) e aí `soil` diz "terra" sobre o vazio.
      //
      // A árvore já tinha esta checagem, acrescentada depois de um QA em que a
      // copa ficava flutuando. As PLANTAS não tinham — e é o mesmo defeito, com
      // outra textura: a varredura de 2026-08-22 achou 6 tufos de grama alta
      // pendurados no ar em (43..47, 72, −75..−82) na semente do jogo.
      //
      // Também tem que ser SÓLIDO, não só "não-ar": planta sobre a lâmina
      // d'água boia igual.
      const chao = readLocal(blocks, lx, height, lz)
      const apoiado = chao !== AIR && IS_SOLID[chao] === 1

      // ── CACHOEIRA DE MONTANHA ──────────────────────────────────────────
      //
      // "e eu quero cachoeiras em montanhas também" — founder, 13/09/2026.
      //
      // A forma inteira mora em `cachoeiraDeMontanha.js`, com a medição que
      // provou por que ela é esculpida em vez de achada, e a grade que garante
      // que duas nunca se cruzem. Aqui fica só a escrita.
      //
      // ⚠️ SÓ DADO GLOBAL DECIDE — nem `apoiado`, nem `readLocal`, nem nada que
      // dependa de QUAL buffer está sendo preenchido. Estas features rodam nove
      // vezes, uma por chunk vizinho, e cada rodada escreve no buffer atual só
      // o pedaço que cai dentro dele. Se a decisão olhasse o array local, a
      // coluna da nascente estaria fora do buffer do vizinho, o plano seria
      // recusado lá, e o patamar amanheceria serrado na divisa. `solidTopAt` e
      // `biome` são função pura da coordenada global: respondem igual nos nove.
      if (biome === BIOMES.mountains && ehCandidata(hashDaCachoeira, gx, gz)) {
        const plano = planoDaCachoeira(mundoDaCachoeira, gx, gz, hashDaCachoeira)
        if (plano) {
          for (const c of plano.celulas) {
            put(blocks, lx + (c.x - gx), c.y, lz + (c.z - gz), c.id)
          }
          continue
        }
      }

      const plan = treePlan(biome)
      if (plan.chance > 0 && soil && rnd() < plan.chance) {
        const kind = plan.kinds[Math.floor(rnd() * plan.kinds.length)]
        if (apoiado) plantTree(blocks, lx, surfaceY, lz, kind, rnd)
        continue
      }

      if (!soil || !apoiado) continue
      const r = rnd()
      if (biome === BIOMES.desert) {
        if (r < 0.008) {
          const n = 1 + Math.floor(rnd() * 3)
          for (let k = 0; k < n; k++) putIfAir(blocks, lx, surfaceY + k, lz, ID.cactus)
        } else if (r < 0.02) {
          putIfAir(blocks, lx, surfaceY, lz, ID.deadBush)
        }
        continue
      }
      if (biome === BIOMES.snowy || biome === BIOMES.ocean) continue

      if (r < 0.16) putIfAir(blocks, lx, surfaceY, lz, ID.tallGrass)
      else if (r < 0.18)
        putIfAir(blocks, lx, surfaceY, lz, rnd() < 0.5 ? ID.redFlower : ID.yellowFlower)
      else if (r < 0.183 && (biome === BIOMES.plains || biome === BIOMES.savanna))
        putIfAir(blocks, lx, surfaceY, lz, ID.pumpkin)
      // ⚠️ A MELANCIA PRECISA EXISTIR NO MUNDO, senão a semente dela não existe
      // e o cultivo inteiro fica inalcançável — a fatia era item morto no
      // catálogo desde sempre. Na SELVA, como no original, e em moita: melancia
      // solta no meio do mato lê como bloco largado ali por engano.
      else if (r < 0.186 && biome === BIOMES.jungle) {
        putIfAir(blocks, lx, surfaceY, lz, ID.melon)
        if (rnd() < 0.5) putIfAir(blocks, lx + 1, surfaceY, lz, ID.melon)
        if (rnd() < 0.4) putIfAir(blocks, lx, surfaceY, lz + 1, ID.melon)
      }
      // ── RAÍZ SELVAGEM ──────────────────────────────────────────────────
      //
      // ⚠️ SEM ISTO A CENOURA E A BATATA NÃO EXISTEM NO JOGO. No original elas
      // vêm de aldeia e de zumbi, e este mundo não tem nem uma coisa nem
      // outra: um cultivo cuja semente não existe em lugar nenhum é um item
      // morto no catálogo.
      //
      // Nasce MADURA, porque é assim que ela serve de fonte: quebrar dá o
      // item, e é dele que sai a primeira lavoura. E é RARA (0,15%) de
      // propósito — achar a primeira cenoura é um pequeno acontecimento, não
      // um tapete no chão da planície.
      else if (r < 0.1845 && (biome === BIOMES.plains || biome === BIOMES.forest)) {
        const raiz = rnd() < 0.5 ? 'carrot' : 'potato'
        const ids = IDS_DO_CULTIVO[raiz]
        putIfAir(blocks, lx, surfaceY, lz, ids[ids.length - 1])
      }
    }
  }
}

// ── Pipeline ────────────────────────────────────────────────────────────────

// Cache de coluna (altura + bioma) por chunk gerado - as features leem colunas
// dos 9 chunks vizinhos e recalcular o ruído 9× seria desperdício puro.
function buildColumnCache(nz, cx, cz) {
  const heights = new Int16Array(CHUNK_SIZE * CHUNK_SIZE)
  const biomes = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE)
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const gx = cx * CHUNK_SIZE + lx
      const gz = cz * CHUNK_SIZE + lz
      const h = terrainHeight(nz, gx, gz)
      heights[lx * CHUNK_SIZE + lz] = h
      biomes[lx * CHUNK_SIZE + lz] = biomeAt(nz, gx, gz, h)
    }
  }
  return { heights, biomes }
}

// Gera o conteúdo de um chunk. Retorna `{ blocks, heights, biomes }` - tudo
// typed array, pronto pra `postMessage` com transferência (zero cópia).
export function generateChunkData(nz, cx, cz) {
  // 16 bits: este array e de IDS GLOBAIS, e o espaco de id deixou de caber em
  // 255 (trava T1). E temporario — vive so ate `instalarBlocos` converter para
  // a paleta do chunk —, entao os 32 KB a mais nao ficam na memoria do mundo.
  const blocks = new Uint16Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT)
  const { heights, biomes } = buildColumnCache(nz, cx, cz)

  // 1. TERRENO por DENSIDADE 3D (não por mapa de altura).
  //
  // Preencher cada coluna até `heights[ci]` produz CONTORNO: como a altura é um
  // campo suave e o mundo é discreto, um morro vira uma escadaria de degraus de
  // 1 bloco perfeitamente paralelos - o "terraço de arroz" que apareceu no QA de
  // 2026-08-19 e denuncia terreno de mapa de altura na hora.
  //
  // Aqui a rocha existe onde `densidade > 0`, e a densidade é a distância até a
  // altura-alvo MAIS um ruído 3D proporcional à rugosidade da região. Efeito: a
  // planície continua limpa (rugosidade ~0 → volta a ser o mapa de altura puro),
  // e a montanha ganha penhasco, saliência e aresta quebrada.
  const solidMask = new Uint8Array(WORLD_HEIGHT)
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const ci = lx * CHUNK_SIZE + lz
      const h = heights[ci]
      const biome = biomes[ci]
      const surf = surfaceFor(biome, h)
      const base = ci * WORLD_HEIGHT
      const gx = cx * CHUNK_SIZE + lx
      const gz = cz * CHUNK_SIZE + lz
      const rug = ruggedness(nz, gx, gz)

      const bedrockTop = 1 + Math.floor(hash3(gx, 0, gz, nz.seed) * 3)
      for (let y = 0; y < bedrockTop; y++) blocks[base + y] = ID.bedrock

      const ceiling = Math.min(WORLD_HEIGHT - 6, h + 2 + Math.round(rug * 9))
      solidMask.fill(0, 0, ceiling + 2)
      let maxSolid = bedrockTop - 1
      for (let y = bedrockTop; y <= ceiling; y++) {
        if (density(nz, gx, y, gz, h, rug) >= 0) {
          solidMask[y] = 1
          maxSolid = y
        }
      }

      // ILHOTAS FLUTUANTES: a densidade 3D às vezes cruza o zero num punhado de
      // células isoladas e sobra um cubo boiando no céu (visto no QA de
      // 2026-08-19). Toda faixa sólida fina com muito ar embaixo é descartada -
      // saliência de penhasco (que tem massa) sobrevive, confete não.
      for (let y = maxSolid; y > bedrockTop; y--) {
        if (!solidMask[y] || solidMask[y - 1]) continue
        // achou a base de uma faixa; mede a espessura
        let top = y
        while (top < ceiling && solidMask[top + 1]) top++
        const thickness = top - y + 1
        let gap = 0
        for (let k = y - 1; k > bedrockTop && !solidMask[k] && gap < 5; k--) gap++
        if (thickness <= 2 && gap >= 3) {
          for (let k = y; k <= top; k++) solidMask[k] = 0
          if (top === maxSolid) {
            maxSolid = y - 1
            while (maxSolid > bedrockTop && !solidMask[maxSolid]) maxSolid--
          }
        }
        y = Math.max(bedrockTop + 1, y)
      }

      // rocha, com ardósia no fundo
      for (let y = bedrockTop; y <= maxSolid; y++) {
        if (solidMask[y]) blocks[base + y] = y < 14 ? ID.deepslate : ID.stone
      }

      // Superfície em TODO topo local (inclusive no teto de uma saliência) -
      // é o que faz a grama acompanhar a forma real, não a altura teórica.
      for (let y = maxSolid; y >= bedrockTop; y--) {
        if (!solidMask[y] || solidMask[y + 1]) continue
        blocks[base + y] = y <= SEA_LEVEL + 1 && biome !== BIOMES.mountains ? ID.sand : surf.top
        for (let k = 1; k < surf.depth; k++) {
          const yy = y - k
          if (yy <= bedrockTop || !solidMask[yy]) break
          blocks[base + yy] = y <= SEA_LEVEL + 1 && biome !== BIOMES.mountains ? ID.sand : surf.sub
        }
      }

      // Água: só o que está ABERTO pro céu abaixo do nível do mar (uma bolha de
      // ar fechada dentro da montanha não vira lago suspenso).
      let open = true
      for (let y = SEA_LEVEL; y > bedrockTop; y--) {
        if (blocks[base + y] !== AIR) {
          open = false
          continue
        }
        if (open) blocks[base + y] = ID.water
      }
      if (biome === BIOMES.snowy && blocks[base + SEA_LEVEL] === ID.water) {
        blocks[base + SEA_LEVEL] = ID.ice
      }
    }
  }

  // 2. cavernas
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const ci = lx * CHUNK_SIZE + lz
      const h = heights[ci]
      const base = ci * WORLD_HEIGHT
      const gx = cx * CHUNK_SIZE + lx
      const gz = cz * CHUNK_SIZE + lz
      for (let y = 2; y < h - 3; y++) {
        const id = blocks[base + y]
        if (id === ID.bedrock || id === AIR || id === ID.water) continue
        if (isCave(nz, gx, y, gz, h)) blocks[base + y] = AIR
      }
      // lago de lava no fundo das cavernas
      for (let y = 2; y < 12; y++) {
        if (blocks[base + y] === AIR && blocks[base + y - 1] !== AIR && y < 9) {
          if (hash3(gx, y, gz, nz.seed + 31) < 0.055) blocks[base + y] = ID.lava
        }
      }
    }
  }

  // 3a. variantes de pedra (bolsões), ANTES do minério.
  //
  // A ordem é a regra: bolsão primeiro, minério depois. Assim o veio de ferro
  // atravessa o granito e continua sendo ferro — se rodasse ao contrário, um
  // bolsão de 4,2 de raio apagaria veios inteiros e a mineração ficaria pobre
  // sem que nada no código dissesse que foi isso.
  //
  // Sorteador PRÓPRIO, não o do minério: puxar do mesmo `oreRnd` faria o número
  // de bolsões deslocar toda a sequência do minério, e mudar a raridade de
  // diamante sem querer é o tipo de efeito colateral que não se descobre olhando.
  const varRnd = mulberry32((cx * 7717) ^ (cz * 1543) ^ (nz.seed * 104729))
  for (const [vid, tries, yMin, yMax, radius] of VARIANTES_DE_PEDRA) {
    for (let t = 0; t < tries; t++) {
      const ox = Math.floor(varRnd() * CHUNK_SIZE)
      const oz = Math.floor(varRnd() * CHUNK_SIZE)
      const oy = yMin + Math.floor(varRnd() * Math.max(1, yMax - yMin))
      const r = radius * (0.7 + varRnd() * 0.6)
      const rr = Math.ceil(r)
      for (let dx = -rr; dx <= rr; dx++) {
        for (let dy = -rr; dy <= rr; dy++) {
          for (let dz = -rr; dz <= rr; dz++) {
            // Esfera, não elipsoide: bolsão de rocha é bolha, veio é camada.
            if (dx * dx + dy * dy + dz * dz > r * r) continue
            const lx = ox + dx
            const lz = oz + dz
            const y = oy + dy
            if (!inChunk(lx, lz) || y < 1 || y >= WORLD_HEIGHT) continue
            const i = localIndex(lx, y, lz)
            // SÓ pedra comum. Não come `deepslate` (que é o fundo do mundo e
            // tem identidade própria) nem nada que já tenha sido escrito.
            if (blocks[i] === ID.stone) blocks[i] = vid
          }
        }
      }
    }
  }

  // 3. minério (veios elipsoidais)
  const oreRnd = mulberry32((cx * 1619) ^ (cz * 31337) ^ (nz.seed * 6971))
  for (const [oid, tries, yMin, yMax, radius] of ORES) {
    for (let t = 0; t < tries; t++) {
      const ox = Math.floor(oreRnd() * CHUNK_SIZE)
      const oz = Math.floor(oreRnd() * CHUNK_SIZE)
      const oy = yMin + Math.floor(oreRnd() * Math.max(1, yMax - yMin))
      const r = radius * (0.7 + oreRnd() * 0.6)
      const rr = Math.ceil(r)
      for (let dx = -rr; dx <= rr; dx++) {
        for (let dy = -rr; dy <= rr; dy++) {
          for (let dz = -rr; dz <= rr; dz++) {
            if (dx * dx + dy * dy * 1.4 + dz * dz > r * r) continue
            const lx = ox + dx
            const lz = oz + dz
            const y = oy + dy
            if (!inChunk(lx, lz) || y < 1 || y >= WORLD_HEIGHT) continue
            const i = localIndex(lx, y, lz)
            if (blocks[i] === ID.stone || blocks[i] === ID.deepslate) blocks[i] = oid
          }
        }
      }
    }
  }

  // 3c. ARGILA no leito raso.
  //
  // Regra geográfica, não geológica: a mancha só nasce onde há ÁGUA por cima e
  // areia ou terra logo abaixo, dentro de três blocos do nível do mar. É o que
  // transforma margem de rio e fundo de lago em recurso, e é onde o jogador
  // procura no original.
  //
  // ⚠️ A checagem é do bloco ACIMA, não da altura da coluna. Testar só
  // `y <= SEA_LEVEL` marcaria de argila o interior de qualquer morro que passe
  // abaixo do nível do mar — o mundo é feito por densidade 3D, então "abaixo do
  // mar" e "debaixo d'água" são coisas diferentes aqui.
  const argRnd = mulberry32((cx * 3931) ^ (cz * 6299) ^ (nz.seed * 15485863))
  for (let t = 0; t < ARGILA.tentativas; t++) {
    const ox = Math.floor(argRnd() * CHUNK_SIZE)
    const oz = Math.floor(argRnd() * CHUNK_SIZE)
    const r = ARGILA.raio * (0.6 + argRnd() * 0.8)
    const rr = Math.ceil(r)
    for (let dx = -rr; dx <= rr; dx++) {
      for (let dz = -rr; dz <= rr; dz++) {
        if (dx * dx + dz * dz > r * r) continue
        const lx = ox + dx
        const lz = oz + dz
        if (!inChunk(lx, lz)) continue
        for (let y = SEA_LEVEL - ARGILA.faixa; y <= SEA_LEVEL; y++) {
          const i = localIndex(lx, y, lz)
          const aqui = blocks[i]
          if (aqui !== ID.sand && aqui !== ID.dirt) continue
          if (blocks[localIndex(lx, y + 1, lz)] !== ID.water) continue
          blocks[i] = ID.clay
        }
      }
    }
  }

  // 4. features dos 9 chunks (a árvore da divisa sai inteira)
  const cache = new Map()
  const columnAt = (gx, gz) => {
    const ccx = gx >> 4
    const ccz = gz >> 4
    const key = `${ccx},${ccz}`
    let c = cache.get(key)
    if (!c) {
      c = ccx === cx && ccz === cz ? { heights, biomes } : buildColumnCache(nz, ccx, ccz)
      cache.set(key, c)
    }
    const i = (gx & 15) * CHUNK_SIZE + (gz & 15)
    return { height: c.heights[i], biome: c.biomes[i] }
  }
  for (let ocx = cx - 1; ocx <= cx + 1; ocx++) {
    for (let ocz = cz - 1; ocz <= cz + 1; ocz++) {
      runFeatures(nz, blocks, ocx, ocz, cx, cz, columnAt)
    }
  }

  // 4b. A FORTALEZA — a sala do portal do Fim, enterrada. Vem DEPOIS das
  // features porque ela escava: a sala e o poço atravessam rocha, raiz e o que
  // mais o terreno tiver escrito, e escrever antes deixaria a árvore da divisa
  // encher o poço de novo. Uma por mundo; o plano é barato (doze alturas).
  const fortaleza = planoDaFortaleza((a, b, c) => hash3(a, b, c, nz.seed), {
    alturaEm: (x, z) => terrainHeight(nz, x, z),
    nivelDoMar: SEA_LEVEL,
  })
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const col = colunaDaFortaleza(fortaleza, cx * CHUNK_SIZE + lx, cz * CHUNK_SIZE + lz)
      if (!col) continue
      for (const { y, id } of col) {
        if (y > 0 && y < WORLD_HEIGHT) blocks[localIndex(lx, y, lz)] = id
      }
    }
  }

  // 5. neve por cima em bioma congelado (depois das features, cobre a folhagem)
  //
  // Quantos blocos a placa pode "cair" procurando chão. Ver a nota adiante.
  const QUEDA_MAX = 4
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const ci = lx * CHUNK_SIZE + lz
      if (biomes[ci] !== BIOMES.snowy && biomes[ci] !== BIOMES.taiga) continue
      const h = heights[ci]
      if (h <= SEA_LEVEL) continue
      // ⚠️ A PLACA PRECISA DE CHÃO.
      //
      // `heights` é a altura do ruído 2D. A densidade 3D que abre caverna e
      // saliência derruba o topo REAL da coluna abaixo dele — a mesma
      // divergência que `generateOne` já anota ao emitir `c.height` em vez de
      // `c.heights` pra colisão. Depositar em `h + 1` só porque a célula está
      // vazia pendurava lençóis inteiros de neve no ar: 204 numa varredura de
      // raio 2 na semente 7 (medido em 2026-08-22).
      //
      // O founder viu e descreveu como "coisas flutuando no mapa, como esses
      // blocos de gelo sem a parte das laterais e inferior". A leitura dele é
      // exata: uma placa de 1/8 de bloco, de longe, é um retângulo branco sem
      // lateral visível e sem fundo.
      //
      // Desce no máximo QUEDA_MAX pra absorver o arredondamento entre o ruído
      // 2D e a densidade 3D. Mais fundo que isso a coluna é boca de caverna ou
      // vão sob saliência — ali não há superfície, e neve não cai lá dentro.
      let apoio = -1
      const inicio = Math.min(WORLD_HEIGHT - 2, h)
      for (let y = inicio; y > inicio - QUEDA_MAX && y > SEA_LEVEL; y--) {
        const id = blocks[localIndex(lx, y, lz)]
        if (id === AIR) continue
        if (IS_SOLID[id] === 1) apoio = y
        break
      }
      if (apoio < 0) continue
      const i = localIndex(lx, apoio + 1, lz)
      if (blocks[i] === AIR) blocks[i] = ID.snowLayer
    }
  }

  return { blocks, heights, biomes }
}

// ── Ponto de nascimento ─────────────────────────────────────────────────────
//
// A versão anterior devolvia o PRIMEIRO ponto que passasse em três testes:
// acima do mar, não-oceano, não-praia, com vizinhança seca. Um pico nevado
// passa em todos com folga - e foi exatamente onde o founder nasceu, a y=116
// num bioma Nevado, em cima de uma montanha (print de 2026-08-22).
//
// E não é azar de semente: `spawnBias` soma 0.42 à continentalidade bem na
// origem justamente pra garantir continente ali. Garantir continente é garantir
// terreno ALTO, então em várias sementes a origem cai num maciço. O viés está
// certo; quem estava errado era aceitar o primeiro ponto seco.
//
// Agora todo candidato recebe NOTA e vence o melhor. Duas coisas pesam, e as
// duas são o que faz um lugar ser bom pra começar:
//
//  · ALTURA. Perto do nível do mar você vê o horizonte, tem água por perto e o
//    terreno é navegável. No pico você vê nuvem e cai.
//  · PLANEZA. É o que separa "planície" de "encosta". Medida como o maior
//    desnível entre o ponto e oito vizinhos - num platô dá 1 ou 2, numa
//    montanha passa de 20.

/** Faixa de altura confortável pra nascer, em blocos acima do nível do mar. */
export const SPAWN_ALTURA_IDEAL = { min: SEA_LEVEL + 1, max: SEA_LEVEL + 14 }
/** Desnível máximo tolerado num raio de 16 blocos. Acima disso é encosta. */
export const SPAWN_DESNIVEL_MAX = 7

const ANEL_VIZINHOS = [
  [8, 0],
  [-8, 0],
  [0, 8],
  [0, -8],
  [16, 0],
  [-16, 0],
  [0, 16],
  [0, -16],
]

/**
 * Nota de um candidato a spawn. MENOR é melhor. `null` = descartado.
 *
 * Exportada porque é ela que o teste mede: dá pra afirmar "pico tira nota pior
 * que planície" sem depender de qual semente o mundo sorteou.
 */
export function notaDeSpawn(nz, x, z) {
  const h = terrainHeight(nz, x, z)
  if (h <= SEA_LEVEL + 1) return null
  const bioma = biomeAt(nz, x, z, h)
  if (bioma === BIOMES.ocean) return null

  let secos = 0
  let desnivel = 0
  for (const [ox, oz] of ANEL_VIZINHOS) {
    const hv = terrainHeight(nz, x + ox, z + oz)
    if (hv > SEA_LEVEL) secos++
    const d = Math.abs(hv - h)
    if (d > desnivel) desnivel = d
  }
  // Ilhota de um bloco no meio do mar: metade dos vizinhos precisa ser terra.
  if (secos < 5) return null

  // Cada penalidade em "blocos de desconforto", pra somarem na mesma unidade.
  const acimaDoIdeal = Math.max(0, h - SPAWN_ALTURA_IDEAL.max)
  const abaixoDoIdeal = Math.max(0, SPAWN_ALTURA_IDEAL.min - h)
  const aspereza = Math.max(0, desnivel - 2)
  return {
    nota:
      // A altura pesa dobrado: nascer alto é o defeito relatado, e é o que mais
      // atrapalha - dali toda direção é ladeira abaixo.
      acimaDoIdeal * 2 +
      abaixoDoIdeal * 2 +
      aspereza * 3 +
      // desempate suave: entre dois lugares igualmente bons, o mais perto da
      // origem, pra o mundo "começar" onde o viés de continente age.
      Math.sqrt(x * x + z * z) * 0.004 +
      (bioma === BIOMES.beach ? 4 : 0),
    h,
    desnivel,
    bioma,
  }
}

/** Nota abaixo disto é boa o bastante pra parar de procurar. */
const NOTA_OTIMA = 3

export function findSpawn(nz, maxRing = 60) {
  // Anéis de 24 blocos: até ~1400 de raio. Parar em 192, como já parou, jogava
  // o jogador no oceano quando o continente ficava além disso (QA 2026-08-19).
  let melhor = null
  for (let r = 0; r <= maxRing; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue
        const x = dx * 24
        const z = dz * 24
        const av = notaDeSpawn(nz, x, z)
        if (!av) continue
        if (!melhor || av.nota < melhor.nota) melhor = { ...av, x, z }
      }
    }
    // Achou um lugar bom perto: para. Varrer os 60 anéis inteiros custa ~15 mil
    // amostras de ruído e o jogador está olhando pra tela de carregamento.
    if (melhor && melhor.nota <= NOTA_OTIMA) break
    // Depois de alguns anéis, aceita o que for razoável em vez de procurar o
    // perfeito - numa semente montanhosa o perfeito pode não existir.
    if (r >= 12 && melhor && melhor.nota <= SPAWN_DESNIVEL_MAX * 3) break
  }
  if (melhor) {
    return { x: melhor.x + 0.5, y: solidTopAt(nz, melhor.x, melhor.z) + 2, z: melhor.z + 0.5 }
  }
  // Nem um pedaço de terra em 1400 blocos. Melhor uma ilha improvisada acima do
  // mar do que afogar o jogador no boot.
  return { x: 0.5, y: SEA_LEVEL + 8, z: 0.5 }
}
