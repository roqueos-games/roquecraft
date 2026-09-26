import { describe, it, expect } from 'vitest'
import {
  createWorld,
  createChunk,
  putChunk,
  getBlock,
  recomputeHeightmap,
  instalarBlocos,
} from '../../src/servicos/chunkStore.js'
import { createNoiseContext, generateChunkData } from '../../src/servicos/worldgen.js'
import { lightChunk } from '../../src/servicos/lighting.js'
import { meshSection } from '../../src/servicos/mesher.js'
import { buildNeighborhood, neighborhoodAccessor } from '../../src/servicos/neighborhood.js'
import { BLOCK_BY_KEY } from '../../src/servicos/blocks.js'
import {
  localIndex,
  chunkKey,
  toChunkCoord,
  toLocalCoord,
  WORLD_HEIGHT,
} from '../../src/servicos/constants.js'

// ── orçamento de perf: onde ele vale, e onde ele MENTE ──────────────────────
// Sob `test:unit:coverage` o v8 instrumenta cada ramo. A geração de chunk, que
// custa ~8 ms, passa de 116 - 15× mais lenta. Isso derrubou o gate em
// 20/08/2026 sem nenhuma regressão real.
//
// Tentei calibrar com uma carga de referência aritmética: não funciona. A
// referência é um laço simples (um contador por iteração) e o código real tem
// dezenas de ramos por voxel - a instrumentação pesa em proporções diferentes,
// e a calibração deu 1,6× onde o custo verdadeiro era 15×.
//
// A resposta honesta é: relógio de parede através de runtime instrumentado não
// mede o que este teste afirma medir. Sob cobertura o teste RODA (o caminho
// continua exercitado, e regressão de correção continua pegando) e IMPRIME o
// tempo, mas não afirma orçamento. Na rodada normal - que é onde o número
// significa alguma coisa - o teto continua apertado.
const SOB_COBERTURA =
  !!globalThis.__vitest_worker__?.config?.coverage?.enabled ||
  /coverage/i.test(process.env.npm_lifecycle_event || '') ||
  /coverage/i.test(process.env.npm_lifecycle_script || '')

// Fator da máquina, só pra CI lento (não tenta compensar instrumentação).
function fatorDaMaquina() {
  const t0 = performance.now()
  let acc = 0
  for (let i = 0; i < 3_000_000; i++) acc += Math.sqrt(i % 997) * 1.0000001
  const ms = performance.now() - t0
  if (acc < 0) throw new Error('nunca')
  return Math.max(1, Math.min(6, ms / 8)) // ~8 ms num M-series = 1×
}

// ⚠️ O FATOR É AMOSTRADO NA HORA, não uma vez no carregamento do módulo.
//
// A suíte roda ~650 arquivos em paralelo, e a máquina não está igualmente
// ocupada o tempo todo: o fator medido no carregamento pegava a máquina de um
// jeito e a malha rodava com ela de outro. O resultado era um teste que passa
// sozinho, três vezes seguidas, e reprova na suíte cheia — 101 ms contra um
// teto de 40, sem regressão nenhuma por trás (a bancada `bench-mesher.mjs`
// media +3,6% no mesmo commit).
//
// Relógio de parede sob concorrência não medida não é medida. Amostrar a carga
// de referência ADJACENTE ao trecho medido faz as duas inflarem juntas, e a
// razão entre elas volta a significar alguma coisa. O orçamento nominal
// continua o mesmo — o que mudou é quando o régua é lida, não o tamanho dela.
// No CI do GitHub o orçamento também não é afirmado: o runner é compartilhado e mede o
// vizinho, não o código (26/09/2026: 43,9 contra 40 e 17,3 contra 14 no primeiro CI, com
// o mesmo commit verde no Mac). Quem cobra o orçamento é o pre-push, na máquina de
// desenvolvimento, onde o `fatorDaMaquina` foi calibrado.
function teto(msReais, nome) {
  if (SOB_COBERTURA || process.env.CI) {
    console.warn(
      `  [perf] ${nome}: ${SOB_COBERTURA ? 'sob cobertura' : 'no CI'}, orçamento não é afirmado aqui`,
    )
    return Infinity
  }
  return msReais * melhorDe(3, fatorDaMaquina)
}

/**
 * O MELHOR de N amostras, não a média.
 *
 * Sob concorrência a distribuição do tempo é assimétrica: existe um piso — o
 * custo real, sem interrupção — e uma cauda longa de amostras em que o
 * escalonador tirou o núcleo no meio. A média persegue a cauda; o mínimo
 * persegue o piso, que é o que este teste quer saber.
 *
 * É por isso que amostrar uma vez só não funcionava: o teste passava sozinho
 * três vezes e reprovava na suíte cheia, sem regressão nenhuma por trás.
 */
function melhorDe(n, medir) {
  let melhor = Infinity
  for (let i = 0; i < n; i++) melhor = Math.min(melhor, medir())
  return melhor
}

function build(seed = 5, radius = 1) {
  const nz = createNoiseContext(seed)
  const w = createWorld(seed)
  for (let cx = -radius; cx <= radius; cx++)
    for (let cz = -radius; cz <= radius; cz++) {
      const c = createChunk(cx, cz)
      const g = generateChunkData(nz, cx, cz)
      instalarBlocos(c, g.blocks)
      c.heights = g.heights
      c.biomes = g.biomes
      c.generated = true
      recomputeHeightmap(c)
      putChunk(w, c)
    }
  for (const c of w.chunks.values()) lightChunk(w, c)
  return w
}

const slowAccessor = (w) => ({
  block: (x, y, z) => getBlock(w, x, y, z),
  light: (x, y, z) => {
    if (y < 0) return 0
    if (y >= WORLD_HEIGHT) return 0xf0
    const c = w.chunks.get(chunkKey(toChunkCoord(x), toChunkCoord(z)))
    if (!c) return 0xf0
    return c.light[localIndex(toLocalCoord(x), y, toLocalCoord(z))]
  },
  tint: () => [1, 1, 1],
})

describe('neighborhood', () => {
  it('produz a MESMA malha que o acessor lento (posições e índices)', () => {
    const w = build(5)
    const fast = neighborhoodAccessor(buildNeighborhood(w, 0, 0))
    const slow = slowAccessor(w)
    // tint fixo dos dois lados pra comparar só geometria/luz
    const fastNoTint = { ...fast, tint: () => [1, 1, 1] }
    for (let sy = 0; sy < 8; sy++) {
      const a = meshSection(slow, 0, sy, 0)
      const b = meshSection(fastNoTint, 0, sy, 0)
      for (const k of ['opaque', 'cutout', 'transparent']) {
        if (!a[k] && !b[k]) continue
        expect(b[k], `${k}@${sy}`).toBeTruthy()
        expect(b[k].count, `${k}@${sy} count`).toBe(a[k].count)
        expect(Array.from(b[k].position)).toEqual(Array.from(a[k].position))
        expect(Array.from(b[k].light)).toEqual(Array.from(a[k].light))
        expect(Array.from(b[k].index)).toEqual(Array.from(a[k].index))
      }
    }
  })

  it('malha um chunk inteiro em tempo de frame', () => {
    const w = build(9)
    const nb = buildNeighborhood(w, 0, 0)
    const acc = neighborhoodAccessor(nb)
    let quads = 0
    const ms = melhorDe(3, () => {
      const t0 = performance.now()
      quads = 0
      for (let sy = 0; sy < 8; sy++) {
        const r = meshSection(acc, 0, sy, 0)
        quads += ((r.opaque?.count || 0) + (r.cutout?.count || 0) + (r.transparent?.count || 0)) / 4
      }
      return performance.now() - t0
    })
    console.warn(`  [perf] chunk inteiro: ${ms.toFixed(1)}ms · ${quads} quads`)
    expect(quads).toBeGreaterThan(50)
    // Guarda de REGRESSÃO, não benchmark: antes da vizinhança achatada este
    // mesmo caminho custava ~1000 ms. O que não pode voltar é a ordem de
    // grandeza - por isso o teto é calibrado, não absoluto.
    expect(ms).toBeLessThan(teto(40, 'malha do chunk'))
  })

  it('gerar um chunk é rápido o bastante pro worker', () => {
    const nz = createNoiseContext(3)
    const ms = melhorDe(3, () => {
      const t0 = performance.now()
      for (let i = 0; i < 4; i++) generateChunkData(nz, i, 0)
      return (performance.now() - t0) / 4
    })
    console.warn(`  [perf] geração por chunk: ${ms.toFixed(1)}ms`)
    expect(ms).toBeLessThan(teto(14, 'geração de chunk'))
  })
})

describe('lighting perf', () => {
  it('iluminar um chunk cabe no orçamento do worker', async () => {
    const { createNoiseContext, generateChunkData } = await import('../../src/servicos/worldgen.js')
    const { createWorld, createChunk, putChunk, recomputeHeightmap } = await import(
      '../../src/servicos/chunkStore.js'
    )
    const { lightChunk } = await import('../../src/servicos/lighting.js')
    const nz = createNoiseContext(77)
    const w = createWorld(77)
    for (let cx = -1; cx <= 1; cx++)
      for (let cz = -1; cz <= 1; cz++) {
        const c = createChunk(cx, cz)
        const g = generateChunkData(nz, cx, cz)
        instalarBlocos(c, g.blocks)
        c.heights = g.heights
        c.biomes = g.biomes
        c.generated = true
        recomputeHeightmap(c)
        putChunk(w, c)
      }
    const t0 = performance.now()
    for (const c of w.chunks.values()) lightChunk(w, c)
    const ms = (performance.now() - t0) / 9
    console.warn(`  [perf] luz por chunk: ${ms.toFixed(1)}ms`)
    expect(ms).toBeLessThan(teto(6, 'luz do chunk'))
  })
})

// ── custo do conserto da água ───────────────────────────────────────────────
// A superfície da água deixou de fundir (senão a onda rasga a malha - ver
// mesherAgua.spec.js). Isso troca 1 quad por até 256 num chunk de oceano, e
// esse é exatamente o tipo de conserto que resolve o visual e derruba o FPS
// sem ninguém perceber. Aqui o preço fica MEDIDO.
describe('perf - oceano com a superfície sem fundir', () => {
  const AGUA = BLOCK_BY_KEY.water.id
  const PEDRA = BLOCK_BY_KEY.stone.id

  // Oceano cheio: pior caso possível: 16×16 de superfície em cada chunk.
  const oceano = {
    block: (x, y, z) => (y <= 58 ? PEDRA : y <= 62 ? AGUA : 0),
    light: () => 0xf0,
    tint: () => [0.3, 0.5, 0.9],
  }

  it('malha uma seção de oceano em tempo de frame', () => {
    // aquece
    meshSection(oceano, 0, 3, 0)
    const t0 = performance.now()
    let quads = 0
    for (let i = 0; i < 8; i++) {
      const r = meshSection(oceano, i, 3, 0)
      quads += (r.transparent?.count || 0) / 4
    }
    const ms = (performance.now() - t0) / 8
    console.warn(`  [perf] seção de oceano: ${ms.toFixed(2)}ms · ${quads / 8} quads de água`)
    // 256 é a superfície inteira em 1×1. Se cair muito abaixo disso a fusão
    // voltou e a fresta voltou junto.
    expect(quads / 8).toBeGreaterThanOrEqual(256)
    expect(ms).toBeLessThan(teto(12, 'oceano'))
  })
})
