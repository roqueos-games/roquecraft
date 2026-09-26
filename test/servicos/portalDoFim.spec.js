import { describe, it, expect } from 'vitest'
import { ID, AIR } from '../../src/servicos/blocks.js'
import {
  ANEL,
  MIOLO,
  centroDoAnel,
  olhosNoAnel,
  porOlho,
  celulasDoAnel,
  ehMoldura,
  ehPortalDoFim,
} from '../../src/servicos/portalDoFim.js'
import { interagirComBloco } from '../../src/servicos/interacao.js'

const mundo = () => {
  const m = new Map()
  const k = (x, y, z) => `${x},${y},${z}`
  return {
    por: (x, y, z, id) => m.set(k(x, y, z), id),
    em: (x, y, z) => m.get(k(x, y, z)) ?? AIR,
  }
}
const anelEm = (w, cx, y, cz, olhos = 0) => {
  for (const c of celulasDoAnel(cx, y, cz, olhos, () => 0)) w.por(c.x, c.y, c.z, c.id)
}

describe('portalDoFim — o anel de doze molduras', () => {
  it('doze molduras, nove de miolo, e nenhuma se sobrepõe', () => {
    expect(ANEL).toHaveLength(12)
    expect(MIOLO).toHaveLength(9)
    const tudo = new Set([...ANEL, ...MIOLO].map(([x, z]) => `${x},${z}`))
    expect(tudo.size).toBe(21)
    expect(ehMoldura(ID.endPortalFrame) && ehMoldura(ID.endPortalFrameEye)).toBe(true)
    expect(ehPortalDoFim(ID.endPortal)).toBe(true)
    expect(ehMoldura(ID.stone)).toBe(false)
  })

  it('acha o centro a partir de QUALQUER moldura do anel; sem anel completo, null', () => {
    const w = mundo()
    anelEm(w, 10, 64, 10)
    for (const [dx, dz] of ANEL)
      expect(centroDoAnel(w.em, 10 + dx, 64, 10 + dz)).toEqual({ x: 10, y: 64, z: 10 })
    w.por(12, 64, 10, AIR) // tira uma
    expect(centroDoAnel(w.em, 8, 64, 10)).toBe(null)
  })

  it('celulasDoAnel vem com N olhos sorteados, sem repetir', () => {
    let n = 0
    const celulas = celulasDoAnel(0, 64, 0, 5, () => (n++ * 0.37) % 1)
    expect(celulas).toHaveLength(12)
    expect(celulas.filter((c) => c.id === ID.endPortalFrameEye)).toHaveLength(5)
    expect(celulas.filter((c) => c.id === ID.endPortalFrame)).toHaveLength(7)
  })

  it('⚠️ o olho entra na moldura; o DÉCIMO SEGUNDO acende o miolo', () => {
    const w = mundo()
    anelEm(w, 0, 64, 0, 11, () => 0)
    // 11 com olho; a sem olho é a que o sorteio deixou.
    const vazia = celulasDoAnel(0, 64, 0, 11, () => 0).find((c) => c.id === ID.endPortalFrame)
    expect(olhosNoAnel(w.em, { x: 0, y: 64, z: 0 })).toBe(11)
    const r = porOlho(w.em, vazia.x, 64, vazia.z)
    expect(r.completou).toBe(true)
    expect(r.edicoes).toHaveLength(1 + 9)
    expect(r.edicoes[0]).toEqual({ x: vazia.x, y: 64, z: vazia.z, id: ID.endPortalFrameEye })
    expect(r.edicoes.slice(1).every((c) => c.id === ID.endPortal)).toBe(true)
    expect(
      r.edicoes
        .slice(1)
        .map((c) => `${c.x},${c.z}`)
        .sort(),
    ).toEqual(MIOLO.map(([x, z]) => `${x},${z}`).sort())
  })

  it('com o anel incompleto o olho entra mas nada acende; moldura já cheia recusa', () => {
    const w = mundo()
    anelEm(w, 0, 64, 0, 0)
    w.por(2, 64, 0, AIR)
    const r = porOlho(w.em, -2, 64, 0)
    expect(r.completou).toBe(false)
    expect(r.edicoes).toHaveLength(1)
    w.por(-2, 64, 0, ID.endPortalFrameEye)
    expect(porOlho(w.em, -2, 64, 0)).toBe(null)
    expect(porOlho(w.em, 0, 64, 0)).toBe(null)
  })

  it('o clique na moldura: só com o olho na mão, e consome o olho', () => {
    const w = mundo()
    anelEm(w, 0, 64, 0, 0)
    const editou = []
    let consumiu = 0
    const ctx = {
      blocoEm: w.em,
      editar: (x, y, z, id) => editou.push([x, y, z, id]),
      consumir: () => consumiu++,
      tocar: () => {},
      naMao: () => ({ item: 'ender_eye', count: 3 }),
    }
    expect(interagirComBloco({ hit: { x: -2, y: 64, z: 0 } }, ctx)).toBe(true)
    expect(editou).toEqual([[-2, 64, 0, ID.endPortalFrameEye]])
    expect(consumiu).toBe(1)
    const semOlho = { ...ctx, naMao: () => ({ item: 'stone', count: 1 }) }
    expect(interagirComBloco({ hit: { x: 2, y: 64, z: 0 } }, semOlho)).toBe(false)
    expect(editou).toHaveLength(1)
  })
})
