import { describe, it, expect } from 'vitest'
import {
  passoDoDragao,
  ALTURA_DO_VOO,
  RAIO_DO_VOO,
  ESPERA_ENTRE_MERGULHOS,
  RECARGA_DA_MORDIDA,
} from '../../src/servicos/dragao.js'
import { MOB_TYPES, createMob, stepMob, shouldDespawn } from '../../src/servicos/mobs.js'

const def = MOB_TYPES.dragao
const rodar = (mob, env, segundos, dt = 1 / 30) => {
  const eventos = []
  for (let t = 0; t < segundos; t += dt) eventos.push(...passoDoDragao(mob, def, env, dt))
  return eventos
}

describe('dragao — voa, mergulha, morde, sobe', () => {
  it('existe na tabela como o único que voa: hostil, 200 de vida, sem drop, não some por distância', () => {
    expect(def).toMatchObject({ voa: true, hostile: true, health: 200, xp: 500 })
    expect(Object.values(MOB_TYPES).filter((d) => d.voa)).toHaveLength(1)
    const m = createMob('dragao', 0, 85, 0, 1)
    expect(shouldDespawn(m, { x: 500, z: 500 })).toBe(false)
  })

  it('circula no anel, na altura do voo, sem tocar o chão nem cair', () => {
    const m = createMob('dragao', 0, 85, 0, 1)
    const env = { player: { x: 300, y: 60, z: 300 } }
    rodar(m, env, 6)
    expect(m.voo.estado).toBe('circulando')
    expect(Math.abs(Math.hypot(m.x, m.z) - RAIO_DO_VOO)).toBeLessThan(2)
    expect(Math.abs(m.y - ALTURA_DO_VOO)).toBeLessThan(3)
    expect(m.faseNado).toBeGreaterThan(0)
  })

  it('⚠️ com o jogador perto, mergulha depois da espera, MORDE uma vez e sobe de volta', () => {
    const m = createMob('dragao', RAIO_DO_VOO, ALTURA_DO_VOO, 0, 1)
    const env = { player: { x: 5, y: 61, z: 5 } }
    const antes = rodar(m, env, ESPERA_ENTRE_MERGULHOS - 0.5)
    expect(antes).toEqual([])
    expect(m.voo.estado).toBe('circulando')
    const durante = rodar(m, env, 6)
    expect(durante.filter((e) => e === 'attack')).toHaveLength(1)
    expect(m.attackCooldown).toBeLessThanOrEqual(RECARGA_DA_MORDIDA)
    // Depois de morder ele sobe: em poucos segundos está de novo no anel — e
    // AINDA não mergulhou de novo (a espera recomeça ao chegar; 5 s < 8).
    rodar(m, env, 5)
    expect(m.voo.estado).toBe('circulando')
    expect(Math.abs(m.y - ALTURA_DO_VOO)).toBeLessThan(3)
  })

  it('com o jogador longe do centro não mergulha nunca', () => {
    const m = createMob('dragao', RAIO_DO_VOO, ALTURA_DO_VOO, 0, 1)
    const env = { player: { x: 200, y: 61, z: 0 } }
    expect(rodar(m, env, ESPERA_ENTRE_MERGULHOS + 10)).toEqual([])
    expect(m.voo.estado).toBe('circulando')
  })

  it('o mergulho desiste quando não alcança: volta a subir sem morder', () => {
    const m = createMob('dragao', RAIO_DO_VOO, ALTURA_DO_VOO, 0, 1)
    const env = { player: { x: 0, y: 61, z: 0 } }
    rodar(m, env, ESPERA_ENTRE_MERGULHOS + 1.5)
    expect(m.voo.estado).toBe('mergulhando')
    expect(m.y, 'já desceu do anel').toBeLessThan(ALTURA_DO_VOO - 5)
    // O jogador some (null): desiste no próximo passo.
    passoDoDragao(m, def, { player: null }, 1 / 30)
    expect(m.voo.estado).toBe('subindo')
  })

  it('stepMob DESVIA para o passo do dragão: nem gravidade, nem chão', () => {
    const m = createMob('dragao', 0, 85, 0, 1)
    const env = {
      player: { x: 300, y: 60, z: 300 },
      solidAt: () => 0,
      liquidAt: () => 0,
      lightAt: () => 15,
      isDay: true,
    }
    for (let i = 0; i < 60; i++) stepMob(m, env, 1 / 30)
    expect(m.y).toBeGreaterThan(70)
    expect(m.voo.estado).toBe('circulando')
  })
})
