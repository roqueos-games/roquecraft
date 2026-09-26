// RoqueCraft - armazenamento do mundo INFINITO.
//
// O mundo não é mais um `Map<"x,y,z", tipo>` (a versão antiga: ~40 bytes por
// bloco, e toda edição varria o mundo inteiro pra remontar um chunk). Agora:
//
//   World
//    └── chunks: Map<"cx,cz", Chunk>
//                 ├── blocks : Uint8Array(16 × 128 × 16)   = 32 KB
//                 ├── light  : Uint8Array(mesmo tamanho)   = 32 KB  (sky<<4|block)
//                 └── height : Uint8Array(256)             = heightmap por coluna
//
// 64 KB por coluna de chunk, acesso O(1), e a malha é regerada por SEÇÃO de 16³.
//
// Os EDITS do jogador vivem separados da geração (`world.edits`): o terreno é
// reproduzível pela seed, então o save e o multiplayer só carregam a diferença.
// Recarregar um chunk = gerar da seed + reaplicar os edits daquele chunk.

import {
  CHUNK_SIZE,
  CHUNK_VOLUME,
  CHUNK_AREA,
  WORLD_HEIGHT,
  SECTION_HEIGHT,
  SECTION_COUNT,
  localIndex,
  toChunkCoord,
  toLocalCoord,
  chunkKey,
  parseChunkKey,
  AIR,
} from './constants.js'
import { IS_OPAQUE, IS_SOLID, IS_LIQUID } from './blocks.js'
import { criarPaleta, indiceDe, inserir, compactar, expandirParaIds } from './paleta.js'

// ── A fronteira do id ───────────────────────────────────────────────────────
//
// `chunk.blocks` NAO guarda mais id global: guarda ÍNDICE na paleta do chunk
// (trava T1, ver paleta.js). Quem precisa do id global passa por aqui.
//
// Duas coisas continuam valendo sem tradução, de propósito, e é o que mantém
// metade do código intacto: o índice 0 é SEMPRE ar, então `blocks[i] !== 0`
// continua respondendo "tem bloco aqui"; e um chunk PROMOVIDO (paleta cheia)
// guarda id global direto, com `paleta === null`.

/** Id global no índice bruto `i` do array de blocos. */
export const idNoIndice = (chunk, i) =>
  chunk.paleta ? chunk.paleta.ids[chunk.blocks[i]] : chunk.blocks[i]

/**
 * Instala no chunk um array de IDS GLOBAIS (o que o gerador de terreno produz),
 * montando a paleta. O worldgen fala em id porque é o que ele sabe; a paleta é
 * assunto do armazenamento, e a conversão acontece nesta fronteira, uma vez por
 * chunk gerado. Um chunk de terreno usa umas duas dezenas de tipos, então cabe
 * folgado; se algum dia não couber, o chunk é promovido como qualquer outro.
 */
export function instalarBlocos(chunk, ids) {
  chunk.blocks = new Uint8Array(ids.length)
  chunk.paleta = criarPaleta()
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]
    if (id === AIR) continue // índice 0 já é ar, e o array nasce zerado
    gravarNoIndice(chunk, i, id)
  }
  return chunk
}

/** O chunk deixa a paleta para trás e passa a guardar id global em 16 bits. */
export function promoverChunk(chunk) {
  chunk.blocks = expandirParaIds(chunk.blocks, chunk.paleta)
  chunk.paleta = null
  return chunk
}

/**
 * Grava o id global no índice bruto `i`, abrindo espaço na paleta se precisar.
 * Compacta ANTES de promover: cavar e recolocar deixa entradas órfãs, e sem
 * isso um chunk de três tipos de bloco seria promovido por lixo.
 */
export function gravarNoIndice(chunk, i, id) {
  if (!chunk.paleta) {
    chunk.blocks[i] = id
    return
  }
  let k = indiceDe(chunk.paleta, id)
  if (k < 0) k = inserir(chunk.paleta, id)
  if (k < 0) {
    compactar(chunk.paleta, chunk.blocks)
    k = inserir(chunk.paleta, id)
  }
  if (k < 0) {
    promoverChunk(chunk)
    chunk.blocks[i] = id
    return
  }
  chunk.blocks[i] = k
}

export function createChunk(cx, cz) {
  return {
    cx,
    cz,
    blocks: new Uint8Array(CHUNK_VOLUME),
    // Índice → id global. `null` quando o chunk foi promovido a 16 bits.
    paleta: criarPaleta(),
    light: new Uint8Array(CHUNK_VOLUME),
    height: new Uint8Array(CHUNK_AREA), // maior y com bloco que bloqueia o céu
    generated: false,
    lit: false,
    // Versão do conteúdo. Começa em 1, não em 0: o selo do cache de vizinhança
    // soma o `stamp` dos 9 chunks, e chunk AUSENTE contribui 0. Começando em
    // zero, "não existe" e "acabou de nascer" dariam o mesmo selo.
    stamp: 1,
    // Já entregou malha pro renderizador? Só quem já entregou precisa REMALHAR
    // quando a luz de um vizinho escorre pra cá depois.
    malhado: false,
    // seções cuja malha está desatualizada
    dirty: new Set(),
    // seção → 1 quando a propagação de luz escreveu aqui na rodada atual
    // (ver `toquesDaLuz` em lighting.js)
    luzMexida: new Uint8Array(SECTION_COUNT),
    // seção → true se tem pelo menos um bloco (pula malha de seção vazia)
    nonEmpty: new Uint8Array(SECTION_COUNT),
  }
}

export function createWorld(seed = 1) {
  return {
    seed,
    chunks: new Map(),
    // "cx,cz" → Map<localIndex, blockId>  (diffs do jogador vs a geração)
    edits: new Map(),
    // seções que precisam de malha nova, na ordem em que sujaram
    dirtySections: new Set(),
  }
}

export const getChunk = (world, cx, cz) => world.chunks.get(chunkKey(cx, cz)) || null

export function hasChunk(world, cx, cz) {
  const c = world.chunks.get(chunkKey(cx, cz))
  return !!c && c.generated
}

export function putChunk(world, chunk) {
  world.chunks.set(chunkKey(chunk.cx, chunk.cz), chunk)
  return chunk
}

export function dropChunk(world, cx, cz) {
  const k = chunkKey(cx, cz)
  const c = world.chunks.get(k)
  if (!c) return false
  world.chunks.delete(k)
  for (let sy = 0; sy < SECTION_COUNT; sy++) world.dirtySections.delete(`${cx},${sy},${cz}`)
  return true
}

// ── Leitura ─────────────────────────────────────────────────────────────────

// Bloco em coordenada GLOBAL. Fora do mundo verticalmente = ar. Chunk não
// carregado = ar (o mesher só malha uma seção quando os 8 vizinhos existem,
// então isto nunca produz parede fantasma na borda do carregamento).
export function getBlock(world, x, y, z) {
  if (y < 0 || y >= WORLD_HEIGHT) return AIR
  const c = world.chunks.get(chunkKey(toChunkCoord(x), toChunkCoord(z)))
  if (!c) return AIR
  return idNoIndice(c, localIndex(toLocalCoord(x), y, toLocalCoord(z)))
}

export function getLight(world, x, y, z) {
  if (y < 0) return 0
  if (y >= WORLD_HEIGHT) return 0xf0 // acima do teto = céu cheio
  const c = world.chunks.get(chunkKey(toChunkCoord(x), toChunkCoord(z)))
  if (!c) return 0xf0
  return c.light[localIndex(toLocalCoord(x), y, toLocalCoord(z))]
}

export const skyLightOf = (packed) => (packed >> 4) & 15
export const blockLightOf = (packed) => packed & 15

export const isBlockOpaque = (world, x, y, z) => IS_OPAQUE[getBlock(world, x, y, z)] === 1
export const isBlockSolid = (world, x, y, z) => IS_SOLID[getBlock(world, x, y, z)] === 1
export const isBlockLiquid = (world, x, y, z) => IS_LIQUID[getBlock(world, x, y, z)] === 1

// ── Escrita ─────────────────────────────────────────────────────────────────

const sectionOf = (y) => (y / SECTION_HEIGHT) | 0

// Marca a seção (e as vizinhas quando o bloco está na borda) pra remalhar.
export function markDirty(world, x, y, z) {
  const cx = toChunkCoord(x)
  const cz = toChunkCoord(z)
  const lx = toLocalCoord(x)
  const lz = toLocalCoord(z)
  const ly = y - sectionOf(y) * SECTION_HEIGHT
  const sy = sectionOf(y)
  const touch = (tcx, tsy, tcz) => {
    if (tsy < 0 || tsy >= SECTION_COUNT) return
    const c = world.chunks.get(chunkKey(tcx, tcz))
    if (!c) return
    c.dirty.add(tsy)
    world.dirtySections.add(`${tcx},${tsy},${tcz}`)
  }
  touch(cx, sy, cz)
  if (lx === 0) touch(cx - 1, sy, cz)
  if (lx === CHUNK_SIZE - 1) touch(cx + 1, sy, cz)
  if (lz === 0) touch(cx, sy, cz - 1)
  if (lz === CHUNK_SIZE - 1) touch(cx, sy, cz + 1)
  if (ly === 0) touch(cx, sy - 1, cz)
  if (ly === SECTION_HEIGHT - 1) touch(cx, sy + 1, cz)
  // cantos diagonais: o AO de um vértice de borda lê o chunk na diagonal
  if (lx === 0 && lz === 0) touch(cx - 1, sy, cz - 1)
  if (lx === 0 && lz === CHUNK_SIZE - 1) touch(cx - 1, sy, cz + 1)
  if (lx === CHUNK_SIZE - 1 && lz === 0) touch(cx + 1, sy, cz - 1)
  if (lx === CHUNK_SIZE - 1 && lz === CHUNK_SIZE - 1) touch(cx + 1, sy, cz + 1)
}

// Escreve SEM registrar edit (uso do gerador de terreno).
export function setBlockRaw(world, x, y, z, id) {
  if (y < 0 || y >= WORLD_HEIGHT) return false
  const c = world.chunks.get(chunkKey(toChunkCoord(x), toChunkCoord(z)))
  if (!c) return false
  const i = localIndex(toLocalCoord(x), y, toLocalCoord(z))
  if (idNoIndice(c, i) === id) return false
  gravarNoIndice(c, i, id)
  if (id !== AIR) c.nonEmpty[sectionOf(y)] = 1
  return true
}

// Escreve E registra o diff (uso do jogador e do multiplayer).
export function setBlock(world, x, y, z, id) {
  if (y < 0 || y >= WORLD_HEIGHT) return false
  const cx = toChunkCoord(x)
  const cz = toChunkCoord(z)
  const key = chunkKey(cx, cz)
  const c = world.chunks.get(key)
  const li = localIndex(toLocalCoord(x), y, toLocalCoord(z))
  let edits = world.edits.get(key)
  if (!edits) {
    edits = new Map()
    world.edits.set(key, edits)
  }
  edits.set(li, id)
  if (!c) return false
  if (idNoIndice(c, li) === id) return false
  gravarNoIndice(c, li, id)
  if (id !== AIR) c.nonEmpty[sectionOf(y)] = 1
  recomputeColumnHeight(c, toLocalCoord(x), toLocalCoord(z))
  markDirty(world, x, y, z)
  return true
}

// Aplica os edits guardados sobre um chunk recém-gerado.
export function applyEdits(world, chunk) {
  const edits = world.edits.get(chunkKey(chunk.cx, chunk.cz))
  if (!edits) return 0
  for (const [li, id] of edits) {
    gravarNoIndice(chunk, li, id)
    if (id !== AIR) chunk.nonEmpty[((li % WORLD_HEIGHT) / SECTION_HEIGHT) | 0] = 1
  }
  return edits.size
}

// ── Heightmap ───────────────────────────────────────────────────────────────

/**
 * O topo OPACO de uma coluna, lido direto dos blocos.
 *
 * ⚠️ FONTE ÚNICA DE PROPÓSITO. Esta conta existia só aqui, dentro do worker, e
 * o CLIENTE tinha a própria cópia do heightmap (`c.heights`) que ninguém
 * recalculava ao editar um bloco: quem cavasse um buraco continuava, do lado de
 * cá, com o topo antigo até o worker reenviar o chunk. Spawn de criatura,
 * exposição ao céu e o gancho de QA liam esse número velho (RC-11, 12/09/2026).
 *
 * Recebe o array de blocos, e não o chunk, justamente para servir aos dois
 * lados — no cliente o array de alturas tem outro nome.
 */
export function topoOpacoDaColuna(blocks, lx, lz, paleta = null) {
  const base = (lx * CHUNK_SIZE + lz) * WORLD_HEIGHT
  for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
    const bruto = blocks[base + y]
    if (bruto === 0) continue // índice 0 é ar em qualquer paleta
    const id = paleta ? paleta.ids[bruto] : bruto
    if (IS_OPAQUE[id] === 1) return y + 1
  }
  return 0
}

export function recomputeColumnHeight(chunk, lx, lz) {
  const h = topoOpacoDaColuna(chunk.blocks, lx, lz, chunk.paleta)
  chunk.height[lx * CHUNK_SIZE + lz] = h
  return h
}

export function recomputeHeightmap(chunk) {
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) recomputeColumnHeight(chunk, lx, lz)
  }
  // seções ocupadas
  chunk.nonEmpty.fill(0)
  for (let i = 0; i < CHUNK_VOLUME; i++) {
    if (chunk.blocks[i] !== AIR) chunk.nonEmpty[((i % WORLD_HEIGHT) / SECTION_HEIGHT) | 0] = 1
  }
  return chunk
}

// Altura do topo sólido numa coluna GLOBAL (spawn seguro, sombra, mobs).
export function heightAt(world, x, z) {
  const c = world.chunks.get(chunkKey(toChunkCoord(x), toChunkCoord(z)))
  if (!c) return -1
  return c.height[toLocalCoord(x) * CHUNK_SIZE + toLocalCoord(z)]
}

// Primeiro y livre acima do chão numa coluna (onde o player nasce/renasce).
export function surfaceSpawn(world, x, z) {
  const c = world.chunks.get(chunkKey(toChunkCoord(x), toChunkCoord(z)))
  if (!c) return null
  const lx = toLocalCoord(x)
  const lz = toLocalCoord(z)
  const base = (lx * CHUNK_SIZE + lz) * WORLD_HEIGHT
  for (let y = WORLD_HEIGHT - 2; y > 0; y--) {
    if (c.blocks[base + y] === 0) continue
    const id = idNoIndice(c, base + y)
    if (IS_SOLID[id] !== 1) continue
    if (IS_LIQUID[id] === 1) continue
    return { x: x + 0.5, y: y + 1, z: z + 0.5 }
  }
  return null
}

// ── Marcação de malha ───────────────────────────────────────────────────────

export function markChunkDirty(world, chunk) {
  for (let sy = 0; sy < SECTION_COUNT; sy++) {
    if (!chunk.nonEmpty[sy]) continue
    chunk.dirty.add(sy)
    world.dirtySections.add(`${chunk.cx},${sy},${chunk.cz}`)
  }
}

/**
 * Os 8 vizinhos existem, estão gerados E ACESOS?
 *
 * ⚠️ ESTA É A PRÉ-CONDIÇÃO DE MALHAR, e a falta dela era o defeito que o
 * founder fotografou em 2026-08-23 ("blocos sem fundo, sem lateral", "mundos
 * criados com blocos defeituosos").
 *
 * `neighborsReady` (só `generated`) basta pro CULLING de face, que lê blocos.
 * Não basta pra LUZ: `buildNeighborhood` copia a moldura de luz dos 8 vizinhos,
 * e a luz de um vizinho ainda apagado é um array de zeros. O mesher então
 * calcula a luz dos vértices da borda como média com zero — e como a chave de
 * fusão do greedy inclui luz e AO, faces que deveriam virar UM quad se partem
 * em vários. O resultado é a costura escura em grade e a contagem de vértices
 * diferente da correta.
 *
 * Medido com `scripts/qa-roquecraft-malha.mjs`: 674 de 674 malhas de uma sessão
 * eram construídas com pelo menos um vizinho apagado. Cem por cento.
 */
export function neighborsLit(world, cx, cz) {
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      if (!dx && !dz) continue
      const c = world.chunks.get(chunkKey(cx + dx, cz + dz))
      if (!c || !c.lit) return false
    }
  }
  return true
}

// Os 8 vizinhos de um chunk existem e estão gerados? (Pré-condição pra ACENDER:
// a semeadura de skylight lê a coluna do chunk ao lado.)
export function neighborsReady(world, cx, cz) {
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      if (!dx && !dz) continue
      const c = world.chunks.get(chunkKey(cx + dx, cz + dz))
      if (!c || !c.generated) return false
    }
  }
  return true
}

// ── Serialização dos EDITS (save + multiplayer) ─────────────────────────────

// Achata `world.edits` num array plano [cx, cz, li, id, ...]. Só o que o
// jogador mudou - o terreno volta da seed.
export function serializeEdits(world, maxEntries = 60000) {
  const out = []
  for (const [key, map] of world.edits) {
    // `parseChunkKey`, e nao uma copia: o FORMATO da chave e uma decisao so, e
    // ela mora em `constants.js` junto de `chunkKey`, que a escreve.
    const { cx, cz } = parseChunkKey(key) || {}
    if (cx === undefined) continue
    for (const [li, id] of map) {
      out.push(cx, cz, li, id)
      if (out.length >= maxEntries * 4) return out
    }
  }
  return out
}

export function deserializeEdits(flat) {
  const edits = new Map()
  if (!Array.isArray(flat)) return edits
  for (let i = 0; i + 3 < flat.length; i += 4) {
    const key = chunkKey(flat[i], flat[i + 1])
    let m = edits.get(key)
    if (!m) {
      m = new Map()
      edits.set(key, m)
    }
    m.set(flat[i + 2], flat[i + 3])
  }
  return edits
}

// localIndex ↔ coordenada local (usado pelo multiplayer, que fala em xyz).
export function unpackLocalIndex(li) {
  const y = li % WORLD_HEIGHT
  const rest = (li - y) / WORLD_HEIGHT
  const lz = rest % CHUNK_SIZE
  const lx = (rest - lz) / CHUNK_SIZE
  return { lx, y, lz }
}

export const packLocalIndex = localIndex

export {
  CHUNK_SIZE,
  CHUNK_VOLUME,
  WORLD_HEIGHT,
  SECTION_HEIGHT,
  SECTION_COUNT,
  chunkKey,
  toChunkCoord,
  toLocalCoord,
  localIndex,
}
