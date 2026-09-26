import { describe, it, expect } from 'vitest'
import {
  centroDaFortaleza,
  planoDaFortaleza,
  colunaDaFortaleza,
  centroDoAnelDe,
  ondeFicaAFortaleza,
  DISTANCIA_MINIMA,
  DISTANCIA_MAXIMA,
  PROFUNDIDADE,
  MEIO_DA_SALA,
  ALTO_DA_SALA,
  BOCA_DO_POCO,
  OLHOS_MINIMOS,
  OLHOS_MAXIMOS,
} from '../../src/servicos/fortaleza.js'
import { fortalezaDaSemente } from '../../src/servicos/geradores.js'
import { generateChunkData, createNoiseContext } from '../../src/servicos/worldgen.js'
import { ID, AIR } from '../../src/servicos/blocks.js'
import {
  CHUNK_SIZE,
  WORLD_HEIGHT,
  toChunkCoord,
  toLocalCoord,
} from '../../src/servicos/constants.js'
import { usarItemNaMao } from '../../src/servicos/usoDeFerramenta.js'
import { itemDef } from '../../src/servicos/items.js'

// Um sorteador determinístico e um mundo plano em 70 (mar em 62).
const hash = (a, b, c) => (((a * 73856093) ^ (b * 19349663) ^ (c * 83492791)) >>> 0) / 4294967296
const plano70 = { alturaEm: () => 70, nivelDoMar: 62 }

describe('fortaleza — uma por mundo, enterrada', () => {
  it('fica entre 250 e 400 blocos da origem, em terra', () => {
    const c = centroDaFortaleza(hash, plano70)
    const d = Math.hypot(c.x, c.z)
    expect(d).toBeGreaterThanOrEqual(DISTANCIA_MINIMA - 1)
    expect(d).toBeLessThanOrEqual(DISTANCIA_MAXIMA + 1)
    expect(c.chao).toBe(70)
  })

  it('pula o mar: tenta outros ângulos até achar terra', () => {
    // Terra só onde x > 0.
    const mundo = { alturaEm: (x) => (x > 0 ? 70 : 40), nivelDoMar: 62 }
    const c = centroDaFortaleza(hash, mundo)
    expect(c.x).toBeGreaterThan(0)
    expect(c.chao).toBe(70)
  })

  it('o plano tem o anel com 2 a 4 olhos, no chão da sala, 16 abaixo da superfície', () => {
    const p = planoDaFortaleza(hash, plano70)
    expect(p.chaoDaSala).toBe(70 - PROFUNDIDADE)
    expect(p.olhos).toBeGreaterThanOrEqual(OLHOS_MINIMOS)
    expect(p.olhos).toBeLessThanOrEqual(OLHOS_MAXIMOS)
    expect(p.anel).toHaveLength(12)
    expect(p.anel.filter((m) => m.id === ID.endPortalFrameEye)).toHaveLength(p.olhos)
    expect(p.anel.every((m) => m.y === p.chaoDaSala)).toBe(true)
  })

  it('a coluna: piso, piscina sob o poço, paredes, teto furado, boca na superfície, anel', () => {
    const p = planoDaFortaleza(hash, plano70)
    const { x, z } = p.centro
    const em = (dx, dz) =>
      Object.fromEntries((colunaDaFortaleza(p, x + dx, z + dz) || []).map((c) => [c.y, c.id]))
    // O centro do poço: piscina no piso, ar até a superfície e acima da boca.
    const poco = em(0, 0)
    expect(poco[p.chaoDaSala - 1]).toBe(ID.water)
    expect(poco[p.chaoDaSala - 2]).toBe(ID.stoneBricks)
    expect(poco[p.chaoDaSala + ALTO_DA_SALA]).toBe(AIR)
    expect(poco[70 + BOCA_DO_POCO]).toBe(AIR)
    // A boca do poço: pedra-tijolo acima do chão.
    expect(em(2, 0)[71]).toBe(ID.stoneBricks)
    expect(em(2, 0)[72]).toBe(ID.stoneBricks)
    // A parede e o teto.
    expect(em(MEIO_DA_SALA + 1, 0)[p.chaoDaSala + 2]).toBe(ID.stoneBricks)
    expect(em(3, 3)[p.chaoDaSala + ALTO_DA_SALA]).toBe(ID.stoneBricks)
    expect(em(MEIO_DA_SALA, MEIO_DA_SALA)[p.chaoDaSala + ALTO_DA_SALA]).toBe(ID.glowstone)
    // O anel no chão da sala; o miolo é ar sobre o piso.
    const c = centroDoAnelDe(p)
    expect([ID.endPortalFrame, ID.endPortalFrameEye]).toContain(em(c.x - x, c.z - z - 2)[c.y])
    expect(em(c.x - x, c.z - z)[c.y]).toBe(AIR)
    expect(em(c.x - x, c.z - z)[c.y - 1]).toBe(ID.stoneBricks)
    // Fora do quadrado, nada.
    expect(colunaDaFortaleza(p, x + 40, z)).toBe(null)
  })

  it('⚠️ o gerador ESCREVE a fortaleza: o chunk do centro tem o anel e o poço', () => {
    const semente = 942457
    const p = fortalezaDaSemente(semente)
    const nz = createNoiseContext(semente)
    const gerado = new Map()
    const blocoEm = (gx, y, gz) => {
      const cx = toChunkCoord(gx)
      const cz = toChunkCoord(gz)
      const k = `${cx},${cz}`
      if (!gerado.has(k)) gerado.set(k, generateChunkData(nz, cx, cz).blocks)
      return gerado.get(k)[(toLocalCoord(gx) * CHUNK_SIZE + toLocalCoord(gz)) * WORLD_HEIGHT + y]
    }
    const c = centroDoAnelDe(p)
    const molduras = p.anel.map((m) => blocoEm(m.x, m.y, m.z))
    expect(molduras.every((id) => id === ID.endPortalFrame || id === ID.endPortalFrameEye)).toBe(
      true,
    )
    expect(molduras.filter((id) => id === ID.endPortalFrameEye)).toHaveLength(p.olhos)
    expect(blocoEm(c.x, c.y, c.z)).toBe(AIR)
    expect(blocoEm(p.centro.x, p.chaoDaSala - 1, p.centro.z)).toBe(ID.water)
    expect(
      blocoEm(p.centro.x, p.centro.chao + 1, p.centro.z),
      'o poço está aberto na superfície',
    ).toBe(AIR)
  })

  it('o olho aponta: rumo e distância arredondada a dez', () => {
    const p = { centro: { x: 300, z: -300 } }
    expect(ondeFicaAFortaleza(p, { x: 0, z: 0 })).toEqual({ rumo: 'ne', dist: 420 })
    expect(ondeFicaAFortaleza(p, { x: 300, z: 0 })).toEqual({ rumo: 'n', dist: 300 })
    expect(ondeFicaAFortaleza(p, { x: 300, z: -600 })).toEqual({ rumo: 's', dist: 300 })
    expect(ondeFicaAFortaleza(p, { x: 0, z: -300 })).toEqual({ rumo: 'e', dist: 300 })
    expect(ondeFicaAFortaleza(null, { x: 0, z: 0 })).toBe(null)
  })

  it('usar o olho ao ar livre avisa com o rumo traduzido e NÃO gasta o olho', () => {
    const avisos = []
    let consumiu = 0
    const ctx = {
      fortaleza: () => ({ rumo: 'ne', dist: 420 }),
      rumo: (r) => `[${r}]`,
      avisar: (chave, p) => avisos.push([chave, p]),
      consumir: () => consumiu++,
    }
    expect(usarItemNaMao(itemDef('ender_eye'), 'ender_eye', {}, ctx)).toBe(true)
    expect(avisos).toEqual([['roqueCraft.fim.olhoAponta', { dist: 420, rumo: '[ne]' }]])
    expect(consumiu).toBe(0)
    // Sem fortaleza (sem mundo), o clique segue a escada.
    expect(usarItemNaMao(itemDef('ender_eye'), 'ender_eye', {}, { fortaleza: () => null })).toBe(
      false,
    )
  })
})
