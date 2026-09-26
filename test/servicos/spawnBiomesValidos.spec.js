import { describe, it, expect } from 'vitest'
import { MOB_TYPES } from '../../src/servicos/mobs.js'
import { BIOMES } from '../../src/servicos/worldgen.js'
import { pickSpawnAquatico } from '../../src/servicos/nadoSpawn.js'

// TODO BIOMA CITADO NUMA REGRA DE SPAWN PRECISA EXISTIR.
//
// ⚠️ ESTE TESTE NASCEU DE UM DEFEITO MUDO. O pinguim declarava
// `spawnBiomes: ['ocean', 'tundra', 'taiga']`, e `tundra` não existe neste
// mundo: o bioma gelado se chama `snowy`. A regra de spawn só pergunta
// `spawnBiomes.includes(biome)` — um nome inventado não estoura, não avisa,
// não aparece em log nenhum. Ele simplesmente NUNCA casa.
//
// O sintoma seria "nunca vi pinguim no gelo", que ninguém reporta como bug
// porque parece azar. Estava assim desde que o pinguim entrou.
describe('spawnBiomes', () => {
  const validos = new Set(Object.keys(BIOMES))

  it('os biomas do mundo estão declarados (prova de vida)', () => {
    expect(validos.size).toBeGreaterThan(5)
    expect(validos.has('snowy')).toBe(true)
  })

  it('nenhuma criatura cita bioma que não existe', () => {
    const erradas = []
    for (const [chave, def] of Object.entries(MOB_TYPES)) {
      for (const b of def.spawnBiomes || []) {
        if (!validos.has(b)) erradas.push(`${chave}: "${b}"`)
      }
    }
    expect(
      erradas,
      `bioma inexistente numa regra de spawn — a criatura nunca nasce lá:\n${erradas.join('\n')}`,
    ).toEqual([])
  })

  it('o pinguim nasce no gelo, que é onde alguém vai procurar por ele', () => {
    expect(MOB_TYPES.penguin.spawnBiomes).toContain('snowy')
  })
})

// E a REGRA, não só a tabela: o filtro de spawn tem que aceitar o pinguim num
// oceano de bioma gelado. Cobrar só o array deixaria passar o dia em que o
// filtro parar de olhar `spawnBiomes`.
describe('a regra de spawn aquático usa o bioma de verdade', () => {
  const mundoDeGelo = (biome) => ({
    player: { x: 0, y: 64, z: 0 },
    surfaceY: () => 40,
    liquidAt: (x, y) => y >= 40 && y <= 60,
    biomeAt: () => biome,
  })

  it('num oceano de bioma `snowy`, o pinguim é elegível', () => {
    const vistos = new Set()
    for (let i = 0; i < 60; i++) {
      const r = pickSpawnAquatico(mundoDeGelo('snowy'), () => (i % 17) / 17)
      for (const m of r || []) vistos.add(m.type)
    }
    expect([...vistos]).toContain('penguin')
  })

  it('num oceano de bioma `desert`, ele não nasce', () => {
    const vistos = new Set()
    for (let i = 0; i < 60; i++) {
      const r = pickSpawnAquatico(mundoDeGelo('desert'), () => (i % 17) / 17)
      for (const m of r || []) vistos.add(m.type)
    }
    expect([...vistos]).not.toContain('penguin')
  })
})
