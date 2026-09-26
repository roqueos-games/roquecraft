// RoqueCraft - "vizinhança achatada": a otimização que torna o mesher viável.
//
// O mesher pergunta pelo bloco e pela luz de MILHARES de células por seção (o
// AO sozinho lê 12 vizinhos por face). Se cada pergunta passar por
// `Map.get(\`${cx},${cz}\`)`, o custo é dominado por alocação de string: uma
// seção de superfície levava ~130 ms, inviável dentro de um frame.
//
// Aqui a coluna do chunk e as bordas dos 8 vizinhos são copiadas UMA vez pra um
// bloco contíguo com 1 de padding em cada eixo (18 × 130 × 18). A cópia usa
// `TypedArray.set` por coluna (324 memcpy), e depois todo acesso do mesher vira
// aritmética de índice. Mesma seção: ~2 ms.
//
// O padding de 1 é exatamente o que o AO e o culling de face precisam ver.

import { CHUNK_SIZE, WORLD_HEIGHT, chunkKey } from './constants.js'
import { BIOME_TINT, BIOMES } from './worldgen.js'

export const PAD = 1
export const PX = CHUNK_SIZE + PAD * 2 // 18
export const PZ = CHUNK_SIZE + PAD * 2 // 18
export const PY = WORLD_HEIGHT + PAD * 2 // 130
export const PAD_VOLUME = PX * PZ * PY

// índice na vizinhança, em coordenadas LOCAIS do chunk central (-1..16)
const pidx = (lx, y, lz) => ((lx + PAD) * PZ + (lz + PAD)) * PY + (y + PAD)

const DEFAULT_TINT = BIOME_TINT[BIOMES.plains]

/**
 * Copia o chunk (cx,cz) e a moldura dos 8 vizinhos pra buffers contíguos.
 * Chunk vizinho ausente vira AR (o chamador só malha quando `neighborsReady`,
 * então isso só acontece em teste).
 */
export function buildNeighborhood(world, cx, cz) {
  // ID GLOBAL, 16 bits, e nao o indice da paleta do chunk: cada vizinho tem a
  // PROPRIA paleta, entao o mesmo indice significa blocos diferentes em chunks
  // diferentes. A traducao acontece aqui, uma vez por coluna, e o mesher segue
  // lendo id global como sempre leu. O buffer dobra de 41 KB para 82 KB — por
  // vizinhanca, que e temporaria, nao por chunk carregado, que e o que pesa.
  const blocks = new Uint16Array(PAD_VOLUME)
  const light = new Uint8Array(PAD_VOLUME)
  // acima do teto o céu é cheio; o padding de topo precisa refletir isso
  const grass = new Float32Array(PX * PZ * 3)
  const foliage = new Float32Array(PX * PZ * 3)

  for (let px = 0; px < PX; px++) {
    for (let pz = 0; pz < PZ; pz++) {
      const lx = px - PAD
      const lz = pz - PAD
      const gx = cx * CHUNK_SIZE + lx
      const gz = cz * CHUNK_SIZE + lz
      const ncx = gx >> 4
      const ncz = gz >> 4
      const c = world.chunks.get(chunkKey(ncx, ncz))
      const dst = (px * PZ + pz) * PY + PAD
      const ti = (px * PZ + pz) * 3
      if (!c) {
        // sem chunk: coluna de ar com céu cheio
        light.fill(0xf0, dst, dst + WORLD_HEIGHT)
        grass[ti] = DEFAULT_TINT.grass[0]
        grass[ti + 1] = DEFAULT_TINT.grass[1]
        grass[ti + 2] = DEFAULT_TINT.grass[2]
        foliage[ti] = DEFAULT_TINT.foliage[0]
        foliage[ti + 1] = DEFAULT_TINT.foliage[1]
        foliage[ti + 2] = DEFAULT_TINT.foliage[2]
        continue
      }
      const sx = gx & 15
      const sz = gz & 15
      const src = (sx * CHUNK_SIZE + sz) * WORLD_HEIGHT
      if (c.paleta) {
        const ids = c.paleta.ids
        const src8 = c.blocks
        for (let y = 0; y < WORLD_HEIGHT; y++) blocks[dst + y] = ids[src8[src + y]]
      } else {
        blocks.set(c.blocks.subarray(src, src + WORLD_HEIGHT), dst)
      }
      light.set(c.light.subarray(src, src + WORLD_HEIGHT), dst)
      // padding vertical: abaixo do mundo é rocha virtual (nada a desenhar),
      // acima é céu aberto
      light[dst + WORLD_HEIGHT] = 0xf0

      const biome = c.biomes ? c.biomes[sx * CHUNK_SIZE + sz] : BIOMES.plains
      const tint = BIOME_TINT[biome] || DEFAULT_TINT
      grass[ti] = tint.grass[0]
      grass[ti + 1] = tint.grass[1]
      grass[ti + 2] = tint.grass[2]
      foliage[ti] = tint.foliage[0]
      foliage[ti + 1] = tint.foliage[1]
      foliage[ti + 2] = tint.foliage[2]
    }
  }

  // Suaviza a cor de bioma numa janela 3×3: sem isso a divisa entre selva e
  // planície é uma linha reta de serrilha na cor da grama.
  const smoothTint = (arr) => {
    const out = new Float32Array(arr.length)
    for (let px = 0; px < PX; px++) {
      for (let pz = 0; pz < PZ; pz++) {
        let r = 0
        let g = 0
        let b = 0
        let n = 0
        for (let dx = -1; dx <= 1; dx++) {
          for (let dz = -1; dz <= 1; dz++) {
            const qx = px + dx
            const qz = pz + dz
            if (qx < 0 || qx >= PX || qz < 0 || qz >= PZ) continue
            const i = (qx * PZ + qz) * 3
            r += arr[i]
            g += arr[i + 1]
            b += arr[i + 2]
            n++
          }
        }
        const o = (px * PZ + pz) * 3
        out[o] = r / n
        out[o + 1] = g / n
        out[o + 2] = b / n
      }
    }
    return out
  }

  return {
    cx,
    cz,
    blocks,
    light,
    grass: smoothTint(grass),
    foliage: smoothTint(foliage),
  }
}

/**
 * Acessor no formato que `meshSection` espera (coordenadas GLOBAIS), mas sem
 * nenhuma alocação: só aritmética sobre os buffers da vizinhança.
 */
export function neighborhoodAccessor(nb) {
  const ox = nb.cx * CHUNK_SIZE
  const oz = nb.cz * CHUNK_SIZE
  const { blocks, light, grass, foliage } = nb

  const inRange = (lx, y, lz) =>
    lx >= -PAD &&
    lx < CHUNK_SIZE + PAD &&
    lz >= -PAD &&
    lz < CHUNK_SIZE + PAD &&
    y >= -PAD &&
    y < WORLD_HEIGHT + PAD

  return {
    block(x, y, z) {
      const lx = x - ox
      const lz = z - oz
      if (!inRange(lx, y, lz)) return 0
      return blocks[pidx(lx, y, lz)]
    },
    light(x, y, z) {
      const lx = x - ox
      const lz = z - oz
      if (!inRange(lx, y, lz)) return y >= WORLD_HEIGHT ? 0xf0 : 0
      return light[pidx(lx, y, lz)]
    },
    tint(x, z, kind) {
      const px = x - ox + PAD
      const pz = z - oz + PAD
      if (px < 0 || px >= PX || pz < 0 || pz >= PZ) return [1, 1, 1]
      const i = (px * PZ + pz) * 3
      const a = kind === 'foliage' ? foliage : grass
      return [a[i], a[i + 1], a[i + 2]]
    },
  }
}

export { pidx }
