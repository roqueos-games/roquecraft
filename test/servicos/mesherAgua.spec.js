import { describe, it, expect } from 'vitest'
import { meshSection } from '../../src/servicos/mesher.js'
import { BLOCK_BY_KEY, AIR } from '../../src/servicos/blocks.js'
import { WATER_DROP } from '../../src/servicos/constants.js'

// A malha da água abria uma fresta quando a onda subia (relato do founder,
// 2026-08-22).
//
// O teste que pega isso não é "tem buraco na tela" - buraco é um pixel e some
// com qualquer mudança de câmera. É a INVARIANTE que faz o buraco existir:
//
//   deslocamento de vértice + retângulos fundidos de tamanhos diferentes
//   = junção em T = rasgo.
//
// A onda é função de (x,z), então dois quads vizinhos só continuam colados se
// os dois tiverem vértice nos mesmos (x,z). Um quad 4×4 encostando num 1×1 não
// tem: a borda do grande é uma reta entre os cantos, e o vizinho pequeno sobe
// um vértice no meio dela.
//
// Logo: nenhum quad da SUPERFÍCIE da água pode ser maior que 1×1.

const water = BLOCK_BY_KEY.water.id
const stone = BLOCK_BY_KEY.stone.id

/** Lago raso de 6×6 na altura y, com fundo de pedra. */
function lago({ y = 8, lado = 6 } = {}) {
  return {
    block: (bx, by, bz) => {
      const dentro = bx >= 2 && bx < 2 + lado && bz >= 2 && bz < 2 + lado
      if (!dentro) return AIR
      if (by === y) return water
      if (by < y) return stone
      return AIR
    },
    light: () => 0xf0,
    tint: () => [0.3, 0.5, 0.9],
  }
}

/** Cada quad como { n, minX, maxX, minY, maxY, minZ, maxZ }. */
function quadsDe(geo) {
  if (!geo) return []
  const out = []
  const { position, normal, count } = geo
  for (let i = 0; i < count; i += 4) {
    const xs = []
    const ys = []
    const zs = []
    for (let k = 0; k < 4; k++) {
      xs.push(position[(i + k) * 3])
      ys.push(position[(i + k) * 3 + 1])
      zs.push(position[(i + k) * 3 + 2])
    }
    out.push({
      n: [normal[i * 3], normal[i * 3 + 1], normal[i * 3 + 2]].map((v) => Math.round(v / 127)),
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
      minZ: Math.min(...zs),
      maxZ: Math.max(...zs),
    })
  }
  return out
}

describe('mesher - superfície da água', () => {
  const geo = meshSection(lago(), 0, 0, 0).transparent
  const quads = quadsDe(geo)

  it('emite geometria de água', () => {
    expect(quads.length).toBeGreaterThan(0)
  })

  it('nenhum quad do topo da água é maior que 1×1', () => {
    const topo = quads.filter((q) => q.n[1] === 1)
    expect(topo.length, 'o lago 6×6 tem que virar 36 quads de topo, não 1 fundido').toBe(36)
    for (const q of topo) {
      expect(q.maxX - q.minX, 'quad de topo fundido em X reabre a junção em T').toBeCloseTo(1, 5)
      expect(q.maxZ - q.minZ, 'quad de topo fundido em Z reabre a junção em T').toBeCloseTo(1, 5)
    }
  })

  it('nenhum quad lateral da superfície é maior que 1 de largura', () => {
    const laterais = quads.filter((q) => q.n[1] === 0)
    expect(laterais.length).toBeGreaterThan(0)
    for (const q of laterais) {
      const largura = Math.max(q.maxX - q.minX, q.maxZ - q.minZ)
      expect(largura, 'lateral fundida: a borda de cima dela ondula em reta').toBeCloseTo(1, 5)
    }
  })

  it('o topo e a borda de cima das laterais estão na MESMA altura', () => {
    // É o que o shader usa pra decidir quem ondula: fract(y) == 1 - WATER_DROP.
    // Se as duas alturas divergirem, uma sobe e a outra não.
    const alturas = new Set(quads.map((q) => Number(q.maxY.toFixed(4))))
    expect(alturas.size, `alturas de topo distintas: ${[...alturas]}`).toBe(1)
    const y = [...alturas][0]
    expect(y - Math.floor(y)).toBeCloseTo(1 - WATER_DROP, 5)
  })
})
