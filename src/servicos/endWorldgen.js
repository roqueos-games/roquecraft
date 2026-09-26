//
// O FIM — a terceira dimensão, gerada.
//
// Uma ILHA no vazio, e nada mais. O overworld é um mapa de altura, o Nether é
// rocha escavada; o Fim é o inverso do Nether: o volume inteiro é AR, e uma
// única ilha de pedra do Fim existe onde a distância ao centro é menor que o
// raio — com a borda roída por ruído para não ler como moeda. Abaixo da ilha
// não há bedrock: é o vazio, e cair nele mata.
//
// Sobre a ilha, o que o jogador precisa encontrar sem mapa: os PILARES de
// obsidiana num anel (onde o dragão vai morar), a FONTE de bedrock no centro
// (o portal de saída, que só acende quando o dragão cai — `dragao.js`, fatia
// seguinte) e a PLATAFORMA de obsidiana na beira, onde se chega.
//
import { createPerlin, fbm2 } from './noise.js'
import { CHUNK_SIZE, WORLD_HEIGHT, AIR } from './constants.js'
import { ID } from './blocks.js'

/** Raio da ilha principal, em blocos, antes do ruído da borda. */
export const RAIO_DA_ILHA = 56
/** Onde o chão da ilha fica, e quanto o ruído o ondula. */
export const CHAO_DA_ILHA = 60
export const ONDULACAO = 3
/** A ilha afina para baixo: a base fica CHAO − ESPESSURA no centro e sobe até a borda. */
export const ESPESSURA = 22
/** Os pilares: quantos, em que raio, e as alturas (do menor ao maior, em anel). */
export const PILARES = 8
export const RAIO_DOS_PILARES = 34
export const ALTURAS_DOS_PILARES = [76, 79, 82, 85, 88, 91, 94, 97]
export const RAIO_DO_PILAR = 2
/** A fonte do portal de saída: bedrock 5×5 no centro, um degrau acima do chão. */
export const FONTE = { x: 0, z: 0, y: CHAO_DA_ILHA, lado: 2 }
/** A plataforma de chegada: obsidiana 5×5 na beira leste, no nível do chão. */
export const PLATAFORMA = { x: 44, z: 0, y: CHAO_DA_ILHA - 1, lado: 2 }

export function criarRuidoDoFim(seed) {
  return { seed, borda: createPerlin(seed + 201), chao: createPerlin(seed + 202) }
}

/** O raio da ilha naquela direção, roído pelo ruído. */
export function raioEm(nz, x, z) {
  const ang = Math.atan2(z, x)
  return RAIO_DA_ILHA + fbm2(nz.borda, Math.cos(ang) * 3 + 10, Math.sin(ang) * 3 + 10, 3) * 14
}

/** Onde cada pilar está: no anel, a passos iguais, começando no eixo +X. */
export function centrosDosPilares() {
  return ALTURAS_DOS_PILARES.map((altura, i) => {
    const ang = (i / PILARES) * Math.PI * 2
    return {
      x: Math.round(Math.cos(ang) * RAIO_DOS_PILARES),
      z: Math.round(Math.sin(ang) * RAIO_DOS_PILARES),
      altura,
    }
  })
}

/**
 * A coluna (x, z): `{ de, ate }` de pedra do Fim, ou null fora da ilha. A
 * espessura afina com a distância: no centro a ilha desce 22 blocos, na borda
 * quase nada — é o que faz a ilha ler como pedra flutuante e não como laje.
 */
export function colunaDaIlha(nz, x, z) {
  const d = Math.hypot(x, z)
  const raio = raioEm(nz, x, z)
  if (d >= raio) return null
  const fracao = 1 - d / raio
  const ate = CHAO_DA_ILHA + Math.round(fbm2(nz.chao, x * 0.05, z * 0.05, 3) * ONDULACAO)
  const de = Math.round(ate - 1 - ESPESSURA * Math.sqrt(fracao))
  return { de: Math.max(1, de), ate }
}

const dentroDoQuadrado = (x, z, q) => Math.abs(x - q.x) <= q.lado && Math.abs(z - q.z) <= q.lado

export function gerarChunkDoFim(nz, cx, cz) {
  const blocks = new Uint16Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT)
  const heights = new Int16Array(CHUNK_SIZE * CHUNK_SIZE)
  const biomes = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE)
  const pilares = centrosDosPilares()

  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const gx = cx * CHUNK_SIZE + lx
      const gz = cz * CHUNK_SIZE + lz
      const base = (lx * CHUNK_SIZE + lz) * WORLD_HEIGHT
      let topo = 0
      const col = colunaDaIlha(nz, gx, gz)
      if (col) {
        for (let y = col.de; y <= col.ate; y++) blocks[base + y] = ID.endStone
        topo = col.ate
      }
      // Os pilares sobem do chão (ou do vazio, se a borda roída os deixou de fora).
      for (const p of pilares) {
        if (Math.hypot(gx - p.x, gz - p.z) > RAIO_DO_PILAR + 0.5) continue
        const de = col ? col.ate + 1 : CHAO_DA_ILHA
        for (let y = de; y <= p.altura; y++) blocks[base + y] = ID.obsidian
        topo = Math.max(topo, p.altura)
      }
      // A fonte: um degrau de bedrock 5×5 com o miolo 3×3 rebaixado — o portal
      // de saída nasce ali quando o dragão cai. Por cima, ar até o teto.
      if (dentroDoQuadrado(gx, gz, FONTE)) {
        const miolo = Math.abs(gx - FONTE.x) <= 1 && Math.abs(gz - FONTE.z) <= 1
        for (let y = FONTE.y - 1; y <= FONTE.y + 1; y++) blocks[base + y] = ID.bedrock
        if (miolo) blocks[base + FONTE.y + 1] = AIR
        for (let y = FONTE.y + 2; y < WORLD_HEIGHT; y++) blocks[base + y] = AIR
        topo = FONTE.y + 1
      }
      // A plataforma de chegada, e ar livre por cima dela.
      if (dentroDoQuadrado(gx, gz, PLATAFORMA)) {
        blocks[base + PLATAFORMA.y] = ID.obsidian
        for (let y = PLATAFORMA.y + 1; y <= PLATAFORMA.y + 4; y++) blocks[base + y] = AIR
        topo = Math.max(topo, PLATAFORMA.y)
      }
      heights[lx * CHUNK_SIZE + lz] = topo
      biomes[lx * CHUNK_SIZE + lz] = 0
    }
  }
  return { blocks, heights, biomes }
}

/** Onde o jogador pousa ao chegar: em pé no meio da plataforma. */
export const POUSO_DA_CHEGADA = {
  x: PLATAFORMA.x + 0.5,
  y: PLATAFORMA.y + 1,
  z: PLATAFORMA.z + 0.5,
}
