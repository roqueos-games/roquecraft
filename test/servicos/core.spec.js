import { describe, it, expect } from 'vitest'
import {
  CHUNK_SIZE,
  WORLD_HEIGHT,
  SEA_LEVEL,
  localIndex,
  toChunkCoord,
  toLocalCoord,
  chunkKey,
  parseChunkKey,
} from '../../src/servicos/constants.js'
import { createPerlin, fbm2, mulberry32, hash3 } from '../../src/servicos/noise.js'
import {
  BLOCKS,
  ID,
  TEXTURE_NAMES,
  FACE_LAYERS,
  IS_OPAQUE,
  breakTime,
  blockDrop,
  dropsWith,
} from '../../src/servicos/blocks.js'
import { ITEMS, validateDrops, ITEM_ICON_NAMES } from '../../src/servicos/items.js'
import { findRecipe, cropGrid, RECIPES, SMELTING } from '../../src/servicos/recipes.js'
import {
  createWorld,
  createChunk,
  putChunk,
  setBlock,
  getBlock,
  recomputeHeightmap,
  serializeEdits,
  deserializeEdits,
  neighborsReady,
  unpackLocalIndex,
  instalarBlocos,
  gravarNoIndice,
} from '../../src/servicos/chunkStore.js'
import {
  createNoiseContext,
  generateChunkData,
  terrainHeight,
  biomeAt,
  findSpawn,
  BIOMES,
} from '../../src/servicos/worldgen.js'
import { lightChunk, updateLightAt } from '../../src/servicos/lighting.js'
import { meshSection } from '../../src/servicos/mesher.js'
import {
  createInventory,
  addItem,
  removeItem,
  clickSlot,
  quickMove,
  damageTool,
  serializeInventory,
  deserializeInventory,
} from '../../src/servicos/inventory.js'

describe('constants', () => {
  it('índice local é bijetivo', () => {
    for (const [lx, y, lz] of [
      [0, 0, 0],
      [15, 127, 15],
      [7, 62, 3],
    ]) {
      const i = localIndex(lx, y, lz)
      expect(unpackLocalIndex(i)).toEqual({ lx, y, lz })
    }
  })
  it('coordenada de chunk funciona com negativos', () => {
    expect(toChunkCoord(-1)).toBe(-1)
    expect(toLocalCoord(-1)).toBe(15)
    expect(toChunkCoord(16)).toBe(1)
    expect(toLocalCoord(16)).toBe(0)
  })
  it('chunkKey ida e volta', () => {
    expect(parseChunkKey(chunkKey(-3, 7))).toEqual({ cx: -3, cz: 7 })
  })
})

describe('noise', () => {
  it('mulberry32 é determinístico', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    for (let i = 0; i < 10; i++) expect(a()).toBe(b())
  })
  it('perlin é determinístico e fica em [-1,1]', () => {
    const p1 = createPerlin(7)
    const p2 = createPerlin(7)
    for (let i = 0; i < 50; i++) {
      const v = p1.noise2(i * 0.37, i * 0.11)
      expect(v).toBe(p2.noise2(i * 0.37, i * 0.11))
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThanOrEqual(1)
    }
  })
  it('fbm varia (não é constante)', () => {
    const p = createPerlin(3)
    const vals = new Set()
    for (let i = 0; i < 40; i++) vals.add(Math.round(fbm2(p, i * 3.1, i * 1.7, 4) * 1000))
    expect(vals.size).toBeGreaterThan(20)
  })
  it('hash3 fica em [0,1)', () => {
    for (let i = -20; i < 20; i++) {
      const v = hash3(i, i * 2, -i, 9)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('blocks', () => {
  it('todo id cabe em Uint8 e é único', () => {
    const ids = Object.values(BLOCKS).map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toBeLessThan(256)
  })
  it('toda textura referenciada existe na lista de camadas', () => {
    for (const b of Object.values(BLOCKS)) {
      for (const t of [b.faces.top, b.faces.side, b.faces.bottom]) {
        expect(TEXTURE_NAMES).toContain(t)
      }
    }
  })
  it('FACE_LAYERS resolve as 6 faces de todo bloco', () => {
    for (const b of Object.values(BLOCKS)) {
      for (let f = 0; f < 6; f++) expect(FACE_LAYERS[b.id * 6 + f]).toBeGreaterThanOrEqual(0)
    }
  })
  it('ar não é opaco e pedra é', () => {
    expect(IS_OPAQUE[0]).toBe(0)
    expect(IS_OPAQUE[ID.stone]).toBe(1)
    expect(IS_OPAQUE[ID.glass]).toBe(0)
    expect(IS_OPAQUE[ID.water]).toBe(0)
  })
  it('picareta certa quebra mais rápido que a mão', () => {
    const hand = breakTime(ID.stone, null)
    const wood = breakTime(ID.stone, { kind: 'pickaxe', tier: 0 })
    const diamond = breakTime(ID.stone, { kind: 'pickaxe', tier: 3 })
    expect(wood).toBeLessThan(hand)
    expect(diamond).toBeLessThan(wood)
  })
  it('bedrock é inquebrável', () => {
    expect(breakTime(ID.bedrock, { kind: 'pickaxe', tier: 3 })).toBe(Infinity)
  })
  it('diamante exige picareta de ferro', () => {
    expect(dropsWith(ID.diamondOre, { kind: 'pickaxe', tier: 0 })).toBe(false)
    expect(dropsWith(ID.diamondOre, { kind: 'pickaxe', tier: 2 })).toBe(true)
    expect(blockDrop(ID.diamondOre, { kind: 'pickaxe', tier: 2 }, () => 0)).toEqual({
      item: 'diamond',
      count: 1,
    })
  })
  it('pedra dropa cobblestone', () => {
    expect(blockDrop(ID.stone, { kind: 'pickaxe', tier: 0 }, () => 0).item).toBe('cobblestone')
  })
})

describe('items', () => {
  it('todo drop de bloco existe como item', () => {
    expect(validateDrops()).toEqual([])
  })
  it('ferramentas dos 4 tiers existem', () => {
    for (const t of ['wood', 'stone', 'iron', 'diamond'])
      for (const k of ['pickaxe', 'axe', 'shovel', 'sword']) expect(ITEMS[`${t}_${k}`]).toBeTruthy()
  })
  it('ferramenta não empilha e tem durabilidade', () => {
    expect(ITEMS.diamond_pickaxe.stack).toBe(1)
    expect(ITEMS.diamond_pickaxe.durability).toBeGreaterThan(1000)
  })
  it('lista de ícones não é vazia', () => {
    expect(ITEM_ICON_NAMES.length).toBeGreaterThan(20)
  })
})

describe('recipes', () => {
  const grid = (size, map) => {
    const s = new Array(size * size).fill(null)
    for (const [i, item] of Object.entries(map)) s[Number(i)] = { item, count: 1 }
    return s
  }

  it('tábua sai de tronco (sem molde, 2x2)', () => {
    const r = findRecipe(grid(2, { 0: 'oakLog' }), 2, false)
    expect(r).toEqual(expect.objectContaining({ item: 'oakPlanks', count: 4 }))
  })
  it('graveto exige duas tábuas empilhadas', () => {
    expect(findRecipe(grid(2, { 0: 'oakPlanks', 2: 'oakPlanks' }), 2, false)?.item).toBe('stick')
    expect(findRecipe(grid(2, { 0: 'oakPlanks', 1: 'oakPlanks' }), 2, false)?.item).not.toBe(
      'stick',
    )
  })
  it('mesa de trabalho sai de 4 tábuas', () => {
    const r = findRecipe(
      grid(2, { 0: 'oakPlanks', 1: 'oakPlanks', 2: 'oakPlanks', 3: 'oakPlanks' }),
      2,
      false,
    )
    expect(r?.item).toBe('craftingTable')
  })
  it('picareta de diamante precisa da mesa 3x3', () => {
    const g = grid(3, { 0: 'diamond', 1: 'diamond', 2: 'diamond', 4: 'stick', 7: 'stick' })
    expect(findRecipe(g, 3, true)?.item).toBe('diamond_pickaxe')
    expect(findRecipe(g, 3, false)).toBe(null)
  })
  it('a receita casa deslocada na grade (crop)', () => {
    // graveto no canto inferior direito de uma 3x3
    const g = grid(3, { 4: 'oakPlanks', 7: 'oakPlanks' })
    expect(findRecipe(g, 3, true)?.item).toBe('stick')
  })
  it('cropGrid recorta o retângulo mínimo', () => {
    const g = grid(3, { 4: 'stone' })
    expect(cropGrid(g, 3)).toEqual({ w: 1, h: 1, cells: ['stone'] })
  })
  it('nenhuma receita produz item inexistente', () => {
    for (const r of RECIPES) expect(ITEMS[r.result], r.result).toBeTruthy()
    for (const [k, v] of Object.entries(SMELTING)) {
      expect(ITEMS[k], k).toBeTruthy()
      expect(ITEMS[v.result], v.result).toBeTruthy()
    }
  })
  it('todo ingrediente de receita existe', () => {
    for (const r of RECIPES) {
      const items = r.type === 'shaped' ? Object.values(r.keyMap) : r.items
      for (const i of items) expect(ITEMS[i], `${r.result} ← ${i}`).toBeTruthy()
    }
  })
})

describe('chunkStore', () => {
  it('grava e lê bloco em coordenada global negativa', () => {
    const w = createWorld(1)
    putChunk(w, createChunk(-1, -1))
    setBlock(w, -5, 70, -3, ID.stone)
    expect(getBlock(w, -5, 70, -3)).toBe(ID.stone)
    expect(getBlock(w, -5, 71, -3)).toBe(0)
  })
  it('chunk não carregado devolve ar (sem lançar)', () => {
    const w = createWorld(1)
    expect(getBlock(w, 999, 70, 999)).toBe(0)
  })
  it('edits sobrevivem à serialização', () => {
    const w = createWorld(1)
    putChunk(w, createChunk(0, 0))
    setBlock(w, 3, 70, 4, ID.glass)
    setBlock(w, 3, 71, 4, 0)
    const flat = serializeEdits(w)
    const back = deserializeEdits(flat)
    expect(back.get('0,0').get(localIndex(3, 70, 4))).toBe(ID.glass)
    expect(back.get('0,0').get(localIndex(3, 71, 4))).toBe(0)
  })
  it('heightmap acha o topo opaco', () => {
    const w = createWorld(1)
    const c = putChunk(w, createChunk(0, 0))
    for (let y = 0; y <= 70; y++) gravarNoIndice(c, localIndex(2, y, 2), ID.stone)
    recomputeHeightmap(c)
    expect(c.height[2 * CHUNK_SIZE + 2]).toBe(71)
  })
  it('neighborsReady exige os 8 vizinhos', () => {
    const w = createWorld(1)
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        const c = putChunk(w, createChunk(dx, dz))
        c.generated = true
      }
    expect(neighborsReady(w, 0, 0)).toBe(true)
    w.chunks.delete(chunkKey(1, 1))
    expect(neighborsReady(w, 0, 0)).toBe(false)
  })
})

describe('worldgen', () => {
  const nz = createNoiseContext(1234)

  it('mesma seed gera o mesmo chunk', () => {
    const a = generateChunkData(createNoiseContext(99), 3, -2)
    const b = generateChunkData(createNoiseContext(99), 3, -2)
    expect(a.blocks).toEqual(b.blocks)
  })
  it('seeds diferentes geram mundos diferentes', () => {
    const a = generateChunkData(createNoiseContext(1), 0, 0)
    const b = generateChunkData(createNoiseContext(2), 0, 0)
    expect(a.blocks).not.toEqual(b.blocks)
  })
  it('toda coluna tem bedrock no fundo e nada acima do teto', () => {
    const { blocks } = generateChunkData(nz, 0, 0)
    for (let lx = 0; lx < CHUNK_SIZE; lx++)
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        expect(blocks[localIndex(lx, 0, lz)]).toBe(ID.bedrock)
        expect(blocks[localIndex(lx, WORLD_HEIGHT - 1, lz)]).toBe(0)
      }
  })
  it('altura fica dentro do mundo', () => {
    for (let i = 0; i < 200; i++) {
      const h = terrainHeight(nz, i * 37 - 3000, i * -19 + 500)
      expect(h).toBeGreaterThan(1)
      expect(h).toBeLessThan(WORLD_HEIGHT - 7)
    }
  })
  it('gera vários biomas ao varrer o mapa', () => {
    const found = new Set()
    for (let i = 0; i < 900; i++) {
      const x = (i % 30) * 220 - 3000
      const z = Math.floor(i / 30) * 220 - 3000
      found.add(biomeAt(nz, x, z, terrainHeight(nz, x, z)))
    }
    expect(found.size).toBeGreaterThanOrEqual(4)
  })
  it('gera minério nas faixas de profundidade', () => {
    let found = 0
    for (let cx = 0; cx < 4 && !found; cx++) {
      const { blocks } = generateChunkData(nz, cx, 0)
      for (let i = 0; i < blocks.length; i++) if (blocks[i] === ID.coalOre) found++
    }
    expect(found).toBeGreaterThan(0)
  })
  it('gera cavernas (existe ar abaixo de pedra)', () => {
    let holes = 0
    for (let cx = 0; cx < 3; cx++) {
      const { blocks, heights } = generateChunkData(nz, cx, 5)
      for (let lx = 0; lx < CHUNK_SIZE; lx++)
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
          const h = heights[lx * CHUNK_SIZE + lz]
          for (let y = 6; y < h - 6; y++) if (blocks[localIndex(lx, y, lz)] === 0) holes++
        }
    }
    expect(holes).toBeGreaterThan(50)
  })
  it('spawn cai em terra seca', () => {
    const s = findSpawn(nz)
    expect(s.y).toBeGreaterThan(60)
    expect(terrainHeight(nz, Math.floor(s.x), Math.floor(s.z))).toBeGreaterThan(62)
  })
  it('coloca água até o nível do mar no oceano', () => {
    const { blocks, heights, biomes } = generateChunkData(nz, 40, 40)
    let water = 0
    for (let i = 0; i < blocks.length; i++) if (blocks[i] === ID.water) water++
    // só exige água se de fato houver oceano/costa neste chunk
    const hasLow = [...heights].some((h) => h < 62)
    if (hasLow) expect(water).toBeGreaterThan(0)
    expect(biomes.length).toBe(256)
  })
})

// mundo de teste 3x3 chunks totalmente carregado
function makeWorld(seed = 7, radius = 1) {
  const nz = createNoiseContext(seed)
  const w = createWorld(seed)
  for (let cx = -radius; cx <= radius; cx++)
    for (let cz = -radius; cz <= radius; cz++) {
      const c = createChunk(cx, cz)
      const { blocks, heights, biomes } = generateChunkData(nz, cx, cz)
      instalarBlocos(c, blocks)
      c.heights = heights
      c.biomes = biomes
      c.generated = true
      recomputeHeightmap(c)
      putChunk(w, c)
    }
  for (const c of w.chunks.values()) lightChunk(w, c)
  return { w, nz }
}

describe('lighting', () => {
  it('terreno seco recebe skylight cheio e o subsolo fica escuro', () => {
    // procura um chunk com terra acima do nível do mar (o mundo é infinito e a
    // origem pode cair no oceano)
    let c = null
    for (let seed = 7; seed < 30 && !c; seed++) {
      const world = makeWorld(seed).w
      const cand = world.chunks.get('0,0')
      let dry = 0
      for (let i = 0; i < cand.height.length; i++) if (cand.height[i] > SEA_LEVEL) dry++
      if (dry > 120) c = cand
    }
    expect(c, 'nenhuma seed testada tinha terra firme na origem').toBeTruthy()

    let surfaceLit = 0
    let deepDark = 0
    for (let lx = 0; lx < CHUNK_SIZE; lx++)
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const h = c.height[lx * CHUNK_SIZE + lz]
        if (h > SEA_LEVEL && h < WORLD_HEIGHT - 2) {
          const sky = (c.light[localIndex(lx, h, lz)] >> 4) & 15
          if (sky === 15) surfaceLit++
        }
        const deep = (c.light[localIndex(lx, 5, lz)] >> 4) & 15
        if (deep === 0) deepDark++
      }
    expect(surfaceLit).toBeGreaterThan(100)
    expect(deepDark).toBeGreaterThan(100)
  })

  it('o fundo do oceano é escuro (a água filtra a luz do céu)', () => {
    const { w } = makeWorld(7)
    const c = w.chunks.get('0,0')
    let deepWaterDark = 0
    let checked = 0
    for (let lx = 0; lx < CHUNK_SIZE; lx++)
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const h = c.height[lx * CHUNK_SIZE + lz]
        if (h > SEA_LEVEL - 12) continue // só água funda
        checked++
        const sky = (c.light[localIndex(lx, h, lz)] >> 4) & 15
        if (sky < 8) deepWaterDark++
      }
    if (checked > 10) expect(deepWaterDark / checked).toBeGreaterThan(0.8)
  })

  it('tocha ilumina a vizinhança e apagar devolve a escuridão', () => {
    const { w } = makeWorld(11)
    // cava um bolsão fechado no subsolo
    const bx = 4
    const bz = 4
    const by = 20
    for (let dx = -2; dx <= 2; dx++)
      for (let dy = -2; dy <= 2; dy++)
        for (let dz = -2; dz <= 2; dz++) setBlock(w, bx + dx, by + dy, bz + dz, 0)
    for (let dx = -2; dx <= 2; dx++)
      for (let dy = -2; dy <= 2; dy++)
        for (let dz = -2; dz <= 2; dz++) updateLightAt(w, bx + dx, by + dy, bz + dz)

    const c = w.chunks.get('0,0')
    const before = c.light[localIndex(bx + 1, by, bz)] & 15
    expect(before).toBe(0)

    setBlock(w, bx, by, bz, ID.glowstone)
    updateLightAt(w, bx, by, bz)
    const lit = c.light[localIndex(bx + 1, by, bz)] & 15
    expect(lit).toBeGreaterThan(10)

    setBlock(w, bx, by, bz, 0)
    updateLightAt(w, bx, by, bz)
    const after = c.light[localIndex(bx + 1, by, bz)] & 15
    expect(after).toBe(0)
  })

  it('skylight desce por um poço aberto sem perder nível', () => {
    // procura uma coluna de TERRA SECA (num poço cheio d'água a luz filtra, o
    // que é o comportamento certo mas não é o que este teste mede)
    let w = null
    let c = null
    let lx = -1
    let lz = -1
    for (let seed = 13; seed < 40 && lx < 0; seed++) {
      const world = makeWorld(seed).w
      const cand = world.chunks.get('0,0')
      for (let i = 2; i < 14 && lx < 0; i++)
        for (let j = 2; j < 14 && lx < 0; j++) {
          const hh = cand.height[i * CHUNK_SIZE + j]
          // seca, alta E a céu aberto (sob copa de árvore a folha filtra 2
          // níveis, que é o comportamento correto mas não é o que se mede aqui)
          if (hh > SEA_LEVEL + 6 && ((cand.light[localIndex(i, hh, j)] >> 4) & 15) === 15) {
            w = world
            c = cand
            lx = i
            lz = j
          }
        }
    }
    expect(lx, 'nenhuma seed testada tinha coluna seca alta').toBeGreaterThanOrEqual(0)

    const h = c.height[lx * CHUNK_SIZE + lz]
    for (let y = h - 1; y > h - 11; y--) {
      setBlock(w, lx, y, lz, 0)
      updateLightAt(w, lx, y, lz)
    }
    expect((c.light[localIndex(lx, h - 10, lz)] >> 4) & 15).toBe(15)
  })
})

describe('mesher', () => {
  function accessorFor(w) {
    return {
      block: (x, y, z) => getBlock(w, x, y, z),
      light: (x, y, z) => {
        if (y < 0) return 0
        if (y >= WORLD_HEIGHT) return 0xf0
        const c = w.chunks.get(chunkKey(toChunkCoord(x), toChunkCoord(z)))
        if (!c) return 0xf0
        return c.light[localIndex(toLocalCoord(x), y, toLocalCoord(z))]
      },
      tint: () => [0.5, 0.75, 0.35],
    }
  }

  it('malha a seção de superfície e produz geometria', () => {
    const { w } = makeWorld(21)
    const acc = accessorFor(w)
    let total = 0
    for (let sy = 0; sy < 8; sy++) {
      const r = meshSection(acc, 0, sy, 0)
      total += (r.opaque?.count || 0) + (r.cutout?.count || 0) + (r.transparent?.count || 0)
    }
    expect(total).toBeGreaterThan(400)
  })

  it('greedy funde um plano: 16x16 de chão vira poucos quads', () => {
    // mundo sintético: uma laje de pedra em y=10, nada mais
    const w = createWorld(1)
    for (let cx = -1; cx <= 1; cx++)
      for (let cz = -1; cz <= 1; cz++) {
        const c = createChunk(cx, cz)
        c.generated = true
        for (let lx = 0; lx < 16; lx++)
          for (let lz = 0; lz < 16; lz++) gravarNoIndice(c, localIndex(lx, 10, lz), ID.stone)
        c.light.fill(0xf0)
        putChunk(w, c)
      }
    const acc = {
      block: (x, y, z) => getBlock(w, x, y, z),
      light: () => 0xf0,
      tint: () => [1, 1, 1],
    }
    const r = meshSection(acc, 0, 0, 0)
    // sem greedy seriam 256 topos + 256 bases = 512 quads (2048 vértices).
    // com greedy o topo e a base viram 1 quad cada.
    expect(r.opaque.count).toBeLessThan(80)
    expect(r.opaque.count).toBeGreaterThan(0)
  })

  it('bloco isolado gera 6 faces e índices coerentes', () => {
    const w = createWorld(1)
    for (let cx = -1; cx <= 1; cx++)
      for (let cz = -1; cz <= 1; cz++) {
        const c = createChunk(cx, cz)
        c.generated = true
        c.light.fill(0xf0)
        putChunk(w, c)
      }
    gravarNoIndice(w.chunks.get('0,0'), localIndex(8, 8, 8), ID.stone)
    const acc = {
      block: (x, y, z) => getBlock(w, x, y, z),
      light: () => 0xf0,
      tint: () => [1, 1, 1],
    }
    const r = meshSection(acc, 0, 0, 0)
    expect(r.opaque.count).toBe(24) // 6 faces × 4 vértices
    expect(r.opaque.index.length).toBe(36)
    for (const i of r.opaque.index) expect(i).toBeLessThan(24)
  })

  it('faces internas entre dois blocos opacos não são emitidas', () => {
    const w = createWorld(1)
    for (let cx = -1; cx <= 1; cx++)
      for (let cz = -1; cz <= 1; cz++) {
        const c = createChunk(cx, cz)
        c.generated = true
        c.light.fill(0xf0)
        putChunk(w, c)
      }
    const c0 = w.chunks.get('0,0')
    gravarNoIndice(c0, localIndex(8, 8, 8), ID.stone)
    gravarNoIndice(c0, localIndex(9, 8, 8), ID.stone)
    const acc = {
      block: (x, y, z) => getBlock(w, x, y, z),
      light: () => 0xf0,
      tint: () => [1, 1, 1],
    }
    const r = meshSection(acc, 0, 0, 0)
    // 12 faces expostas, mas o greedy funde os pares coplanares (topo, base,
    // +z e -z viram 1 quad cada) → 6 quads = 24 vértices.
    expect(r.opaque.count).toBe(24)
    expect(r.opaque.index.length).toBe(36)
  })

  it('planta vira cruz de 2 quads dupla-face no bucket de cutout', () => {
    const w = createWorld(1)
    for (let cx = -1; cx <= 1; cx++)
      for (let cz = -1; cz <= 1; cz++) {
        const c = createChunk(cx, cz)
        c.generated = true
        c.light.fill(0xf0)
        putChunk(w, c)
      }
    gravarNoIndice(w.chunks.get('0,0'), localIndex(4, 4, 4), ID.tallGrass)
    const acc = {
      block: (x, y, z) => getBlock(w, x, y, z),
      light: () => 0xf0,
      tint: () => [0.4, 0.8, 0.3],
    }
    const r = meshSection(acc, 0, 0, 0)
    expect(r.opaque).toBe(null)
    expect(r.cutout.count).toBe(8) // 2 quads × 4 vértices
    expect(r.cutout.index.length).toBe(24) // dupla face
  })

  it('água vai pro bucket transparente com o topo rebaixado', () => {
    const w = createWorld(1)
    for (let cx = -1; cx <= 1; cx++)
      for (let cz = -1; cz <= 1; cz++) {
        const c = createChunk(cx, cz)
        c.generated = true
        c.light.fill(0xf0)
        putChunk(w, c)
      }
    gravarNoIndice(w.chunks.get('0,0'), localIndex(4, 4, 4), ID.water)
    const acc = {
      block: (x, y, z) => getBlock(w, x, y, z),
      light: () => 0xf0,
      tint: () => [1, 1, 1],
    }
    const r = meshSection(acc, 0, 0, 0)
    expect(r.transparent).toBeTruthy()
    const ys = []
    for (let i = 1; i < r.transparent.position.length; i += 3) ys.push(r.transparent.position[i])
    expect(Math.max(...ys)).toBeLessThan(5)
    expect(Math.max(...ys)).toBeGreaterThan(4.8)
  })
})

describe('inventory', () => {
  it('empilha nas pilhas parciais antes de abrir slot novo', () => {
    const inv = createInventory()
    inv[0] = { item: 'stone', count: 61 }
    const left = addItem(inv, 'stone', 3)
    expect(left).toBe(0)
    expect(inv[0].count).toBe(64)
    expect(inv[1]).toBe(null)
  })
  it('transborda pro próximo slot', () => {
    const inv = createInventory()
    inv[0] = { item: 'stone', count: 61 }
    addItem(inv, 'stone', 10)
    expect(inv[0].count).toBe(64)
    expect(inv[1].count).toBe(7)
  })
  it('devolve o que não coube', () => {
    const inv = new Array(36).fill(null).map(() => ({ item: 'dirt', count: 64 }))
    expect(addItem(inv, 'stone', 5)).toBe(5)
  })
  it('ferramenta ocupa um slot por unidade', () => {
    const inv = createInventory()
    addItem(inv, 'diamond_pickaxe', 2)
    expect(inv[0].count).toBe(1)
    expect(inv[1].count).toBe(1)
    expect(inv[0].dur).toBeGreaterThan(0)
  })
  it('remove de vários slots', () => {
    const inv = createInventory()
    addItem(inv, 'stone', 100)
    expect(removeItem(inv, 'stone', 70)).toBe(70)
    expect(inv.filter(Boolean).reduce((a, s) => a + s.count, 0)).toBe(30)
  })
  it('clique esquerdo pega, larga e troca', () => {
    let inv = createInventory()
    inv[0] = { item: 'stone', count: 10 }
    let r = clickSlot(inv, null, 0, 'left')
    expect(r.cursor).toEqual({ item: 'stone', count: 10 })
    expect(r.slots[0]).toBe(null)
    r = clickSlot(r.slots, r.cursor, 5, 'left')
    expect(r.slots[5]).toEqual({ item: 'stone', count: 10 })
    expect(r.cursor).toBe(null)
  })
  it('clique direito pega metade e larga um', () => {
    const inv = createInventory()
    inv[0] = { item: 'stone', count: 9 }
    let r = clickSlot(inv, null, 0, 'right')
    expect(r.cursor.count).toBe(5)
    expect(r.slots[0].count).toBe(4)
    r = clickSlot(r.slots, r.cursor, 1, 'right')
    expect(r.slots[1].count).toBe(1)
    expect(r.cursor.count).toBe(4)
  })
  it('shift-clique move da mochila pra hotbar', () => {
    const inv = createInventory()
    inv[20] = { item: 'stone', count: 5 }
    const next = quickMove(inv, 20)
    expect(next[20]).toBe(null)
    expect(next[0]).toEqual({ item: 'stone', count: 5 })
  })
  it('ferramenta quebra ao zerar a durabilidade', () => {
    const inv = createInventory()
    inv[0] = { item: 'wood_pickaxe', count: 1, dur: 2 }
    expect(damageTool(inv, 0)).toBe('used')
    expect(damageTool(inv, 0)).toBe('broke')
    expect(inv[0]).toBe(null)
  })
  it('inventário sobrevive à serialização', () => {
    const inv = createInventory()
    inv[0] = { item: 'stone', count: 32 }
    inv[9] = { item: 'iron_pickaxe', count: 1, dur: 100 }
    const back = deserializeInventory(serializeInventory(inv))
    expect(back[0]).toEqual({ item: 'stone', count: 32 })
    expect(back[9]).toEqual({ item: 'iron_pickaxe', count: 1, dur: 100 })
  })
  it('a poção modificada é o SEXTO campo e volta inteira; sem ela o formato não muda', () => {
    const inv = createInventory()
    inv[2] = { item: 'pocao_forca', count: 1, pocao: { longa: true, splash: true } }
    inv[3] = { item: 'pocao_cura', count: 1 }
    const flat = serializeInventory(inv)
    expect(flat.find((e) => e[0] === 2)).toEqual([2, 'pocao_forca', 1, null, null, 'LS'])
    expect(flat.find((e) => e[0] === 3)).toEqual([3, 'pocao_cura', 1])
    const back = deserializeInventory(flat)
    expect(back[2]).toEqual({ item: 'pocao_forca', count: 1, pocao: { longa: true, splash: true } })
    expect(back[3]).toEqual({ item: 'pocao_cura', count: 1 })
  })
  it('addItem com extras carrega encanto e poção para a pilha nova', () => {
    const inv = createInventory()
    addItem(inv, 'pocao_veneno', 1, null, { pocao: { splash: true } })
    addItem(inv, 'iron_pickaxe', 1, 40, { enc: { eficiencia: 2 } })
    expect(inv[0]).toEqual({ item: 'pocao_veneno', count: 1, pocao: { splash: true } })
    expect(inv[1]).toEqual({ item: 'iron_pickaxe', count: 1, dur: 40, enc: { eficiencia: 2 } })
  })
  it('ignora entrada corrompida na desserialização', () => {
    const back = deserializeInventory([
      [0, 'naoexiste', 5],
      [999, 'stone', 1],
      [1, 'stone', 3],
    ])
    expect(back[0]).toBe(null)
    expect(back[1]).toEqual({ item: 'stone', count: 3 })
  })
})
