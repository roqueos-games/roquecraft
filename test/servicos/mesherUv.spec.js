import { describe, it, expect } from 'vitest'
import { meshSection, FACES } from '../../src/servicos/mesher.js'
import { BLOCK_BY_KEY, AIR } from '../../src/servicos/blocks.js'

// A franja de grama descia pela LATERAL do bloco em vez de correr pelo topo, e
// só nas faces ±X. A causa era a tabela FACES: aquelas duas usavam `u: 1, v: 2`,
// mapeando o eixo HORIZONTAL da textura no Y do mundo - textura girada 90°.
//
// O teste que pega isso NÃO é "a grama está no topo" (isso é um pixel, e depende
// da textura). É a INVARIANTE geométrica: numa face vertical, o eixo v da
// textura tem que subir junto com o Y do mundo, e as quatro faces verticais têm
// que concordar entre si. Enquanto duas discordarem, existe um bloco girado.

const grass = BLOCK_BY_KEY.grassBlock.id
const stone = BLOCK_BY_KEY.stone.id

/** Mundinho de um bloco só: grama isolada, cercada de ar. */
function mundoUmBloco(id = grass, x = 8, y = 8, z = 8) {
  return {
    block: (bx, by, bz) => (bx === x && by === y && bz === z ? id : AIR),
    light: () => 0xf0,
    tint: () => [0.4, 0.7, 0.3],
  }
}

/** Devolve os 4 vértices de cada face, com posição e uv. */
function facesDe(geo) {
  const out = []
  const { position, uv, normal, count } = geo
  for (let i = 0; i < count; i += 4) {
    const verts = []
    for (let k = 0; k < 4; k++) {
      const j = i + k
      verts.push({
        x: position[j * 3],
        y: position[j * 3 + 1],
        z: position[j * 3 + 2],
        u: uv[j * 2],
        v: uv[j * 2 + 1],
      })
    }
    out.push({
      n: [normal[i * 3], normal[i * 3 + 1], normal[i * 3 + 2]].map((v) => Math.round(v / 127)),
      verts,
    })
  }
  return out
}

describe('mesher - orientação da textura nas faces', () => {
  it('a tabela FACES põe o Y do mundo no eixo v das quatro faces verticais', () => {
    for (const F of FACES) {
      if (F.axis === 1) continue // topo e base não têm "em pé"
      expect(
        F.v,
        `face de eixo ${F.axis} sinal ${F.sign}: v=${F.v}, tinha que ser 1 (Y). ` +
          'Com v≠1 a textura sai girada 90° nessa face.',
      ).toBe(1)
    }
  })

  it('em TODA face vertical, subir em v é subir em Y', () => {
    const geo = meshSection(mundoUmBloco(), 0, 0, 0).opaque
    expect(geo, 'a seção devia ter gerado malha opaca').toBeTruthy()

    const verticais = facesDe(geo).filter((f) => f.n[1] === 0)
    expect(verticais.length, 'um cubo isolado tem 4 faces verticais').toBe(4)

    for (const face of verticais) {
      const baixo = face.verts.filter((p) => p.v === Math.min(...face.verts.map((q) => q.v)))
      const cima = face.verts.filter((p) => p.v === Math.max(...face.verts.map((q) => q.v)))
      const yBaixo = Math.max(...baixo.map((p) => p.y))
      const yCima = Math.min(...cima.map((p) => p.y))
      expect(
        yCima,
        `face normal ${face.n}: v maior tinha que estar mais ALTO em Y ` +
          `(v-alto em y=${yCima}, v-baixo em y=${yBaixo})`,
      ).toBeGreaterThan(yBaixo)
    }
  })

  it('nenhuma face vertical mapeia u no Y (seria a textura deitada)', () => {
    const geo = meshSection(mundoUmBloco(), 0, 0, 0).opaque
    for (const face of facesDe(geo).filter((f) => f.n[1] === 0)) {
      const us = [...new Set(face.verts.map((p) => p.u))]
      // pra cada valor de u, o quad tem que ter DOIS ys diferentes: se u variasse
      // com Y, cada u teria um único y (textura deitada).
      for (const u of us) {
        const ys = new Set(face.verts.filter((p) => p.u === u).map((p) => p.y))
        expect(ys.size, `face ${face.n}: u=${u} só existe num Y - textura deitada`).toBe(2)
      }
    }
  })

  it('as faces continuam CCW vistas de fora (senão somem no backface culling)', () => {
    const geo = meshSection(mundoUmBloco(stone), 0, 0, 0).opaque
    const { position, index, normal } = geo
    let conferidas = 0
    for (let t = 0; t < index.length; t += 3) {
      const [i0, i1, i2] = [index[t], index[t + 1], index[t + 2]]
      const p = (i) => [position[i * 3], position[i * 3 + 1], position[i * 3 + 2]]
      const [a, b, c] = [p(i0), p(i1), p(i2)]
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
      const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
      // normal geométrica = ab × ac
      const g = [
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
      ]
      const n = [normal[i0 * 3], normal[i0 * 3 + 1], normal[i0 * 3 + 2]]
      const dot = g[0] * n[0] + g[1] * n[1] + g[2] * n[2]
      expect(dot, `triângulo ${t / 3} está com winding invertido (dot ${dot})`).toBeGreaterThan(0)
      conferidas++
    }
    expect(conferidas, 'um cubo isolado tem 12 triângulos').toBe(12)
  })
})
