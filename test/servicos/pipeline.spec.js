import { describe, it, expect, vi } from 'vitest'
import { createPipeline } from '../../src/servicos/chunkPipeline.js'
import { createWorldClient } from '../../src/servicos/worldClient.js'
import { ID } from '../../src/servicos/blocks.js'
import { SEA_LEVEL } from '../../src/servicos/constants.js'
import { stepPlayer, collides, PLAYER_HEIGHT, safeSpawn } from '../../src/servicos/physics.js'
import { raycastVoxel } from '../../src/servicos/voxelRaycast.js'
import {
  sunDirection,
  dayFactor,
  skyLightFactor,
  skyPalette,
  lightRig,
  advanceTime,
  isNight,
  clockLabel,
  normalizeTicks,
  NOON,
  MIDNIGHT,
} from '../../src/servicos/daycycle.js'
import {
  createSurvivalState,
  damage,
  heal,
  eat,
  stepSurvival,
  addExhaustion,
  respawn,
  addXp,
  serializeSurvival,
  deserializeSurvival,
  MAX_HEALTH,
} from '../../src/servicos/survival.js'
import {
  createMob,
  stepMob,
  hurtMob,
  mobDrops,
  packMobs,
  unpackMobs,
  MOB_TYPES,
} from '../../src/servicos/mobs.js'
import { relogioSintetico, moer } from './relogioDoPipeline.js'
import { TETO_DE_MUNDO } from '../tetos.js'

// ⚠️ ESTE ARQUIVO GERA MUNDO, E GERAR MUNDO CUSTA SEGUNDOS DE VERDADE.
//
// Raio 8 são 289 chunks, cada um com 65 mil blocos de ruído 3D: 8,5s por teste
// numa máquina ociosa, e o trabalho é o mesmo em qualquer uma. O teto global de
// 15s existe para pegar teste que TRAVA, e com a máquina carregada (um build
// ao lado, um sweep de mutação, o LM Studio) ele passa a reprovar teste que está
// fazendo exatamente o que devia -- vermelho que depende da carga, que é o tipo
// que ensina a ignorar vermelho. O teto vem de `tests/setup/tetos.js`, num
// lugar só: sob `--coverage` ele PRECISA ser outro, e o porquê está medido lá.
vi.setConfig({ testTimeout: TETO_DE_MUNDO })

// ⚠️ O `drain` ANTIGO ERA UM RELÓGIO DE PAREDE DISFARÇADO: `pipe.tick(50)`
// gastava 50 ms de VERDADE por tick, então quanto mundo existia no fim dependia
// da máquina. Ver `relogioDoPipeline.js`.
const drain = (pipe, msgs) => moer(pipe, { progresso: () => msgs.length })

describe('chunkPipeline (inline)', () => {
  it('gera chunks, ilumina e emite malhas', async () => {
    const msgs = []
    const pipe = createPipeline({
      seed: 42,
      renderDistance: 2,
      agora: relogioSintetico(),
      emit: (m) => msgs.push(m),
    })
    pipe.setCenter(0, 0)
    await drain(pipe, msgs)
    const chunkMsgs = msgs.filter((m) => m.t === 'chunk')
    const meshMsgs = msgs.filter((m) => m.t === 'mesh')
    expect(chunkMsgs.length).toBeGreaterThanOrEqual(25) // (2+1)*2+1 = 7x7
    expect(meshMsgs.length).toBeGreaterThan(20)
    const withGeo = meshMsgs.filter((m) => m.opaque || m.cutout || m.transparent)
    expect(withGeo.length).toBeGreaterThan(15)
    // toda malha tem índices válidos
    for (const m of withGeo) {
      for (const k of ['opaque', 'cutout', 'transparent']) {
        const g = m[k]
        if (!g) continue
        expect(g.position.length).toBe(g.count * 3)
        expect(g.light.length).toBe(g.count * 3)
        for (const i of g.index) expect(i).toBeLessThan(g.count)
      }
    }
  })

  it('editar um bloco reemite só as seções afetadas', async () => {
    const msgs = []
    const pipe = createPipeline({
      seed: 8,
      renderDistance: 1,
      agora: relogioSintetico(),
      emit: (m) => msgs.push(m),
    })
    pipe.setCenter(0, 0)
    await drain(pipe, msgs)
    msgs.length = 0
    pipe.edit(4, 70, 4, ID.glowstone)
    await drain(pipe, msgs)
    const meshes = msgs.filter((m) => m.t === 'mesh')
    expect(meshes.length).toBeGreaterThan(0)
    expect(meshes.length).toBeLessThan(60) // não remalha o mundo inteiro
  })

  it('reset troca a semente e regenera', async () => {
    const msgs = []
    const pipe = createPipeline({
      seed: 1,
      renderDistance: 1,
      agora: relogioSintetico(),
      emit: (m) => msgs.push(m),
    })
    pipe.setCenter(0, 0)
    await drain(pipe, msgs)
    const a = msgs.find((m) => m.t === 'chunk' && m.cx === 0 && m.cz === 0).blocks.slice()
    msgs.length = 0
    pipe.reset(777)
    await drain(pipe, msgs)
    const b = msgs.find((m) => m.t === 'chunk' && m.cx === 0 && m.cz === 0).blocks
    expect(Array.from(a)).not.toEqual(Array.from(b))
  })

  it('andar pra longe descarrega o que ficou pra trás', async () => {
    const msgs = []
    const pipe = createPipeline({
      seed: 5,
      renderDistance: 1,
      agora: relogioSintetico(),
      emit: (m) => msgs.push(m),
    })
    pipe.setCenter(0, 0)
    await drain(pipe, msgs)
    msgs.length = 0
    pipe.setCenter(12, 0)
    await drain(pipe, msgs)
    expect(msgs.filter((m) => m.t === 'unload').length).toBeGreaterThan(0)
  })
})

/**
 * ⚠️ DORMIR UM TEMPO FIXO NÃO É ESPERAR CARREGAR. Os 700 ms daqui bastavam num
 * Mac ocioso e não bastavam sob `--coverage` com a máquina carregada: o teste
 * reprovava em `loadedCount > 4` com 3, que é a PREMISSA e não o defeito. O
 * cliente inline roda num laço de `setTimeout`, então o certo é esperar a
 * CONDIÇÃO -- e estourar o prazo tem que ser falha com mensagem, não silêncio.
 */
async function esperarChunks(client, minimo, prazo = 15000) {
  const t0 = Date.now()
  while (Date.now() - t0 < prazo) {
    if (client.loadedCount >= minimo) return
    await new Promise((r) => setTimeout(r, 25))
  }
  throw new Error(
    `o cliente carregou ${client.loadedCount} chunks em ${prazo}ms, mínimo ${minimo} -- ` +
      `mundo incompleto, não adianta medir nada em cima dele`,
  )
}

describe('worldClient (inline)', () => {
  it('espelha os blocos e responde colisão/altura', async () => {
    const client = createWorldClient({ seed: 33, renderDistance: 1, forceInline: true })
    client.start(0, 0)
    await esperarChunks(client, 5)
    expect(client.loadedCount).toBeGreaterThan(4)
    const h = client.heightAt(0, 0)
    expect(h).toBeGreaterThan(0)
    // `solidAt` devolve a ALTURA sólida (0..1), não boolean: é o que permite
    // bloco parcial (camada de neve, laje) ter caixa de colisão.
    expect(client.solidAt(0, h - 1, 0)).toBe(1)
    expect(client.solidAt(0, h + 3, 0)).toBe(0)

    // ⚠️ E o contrato que impede o jogador de cair pelo mundo: coluna que NÃO
    // está carregada responde SÓLIDO. Antes respondia ar, e quem andasse mais
    // rápido que o carregador despencava pelo cenário (print do founder,
    // 2026-08-22). Cem mil blocos de distância é território garantidamente não
    // carregado.
    expect(client.isLoaded(100000, 100000)).toBe(false)
    expect(
      client.solidAt(100000, 64, 100000),
      'chunk desconhecido respondeu vazio — é por aí que o jogador cai pelo mundo',
    ).toBe(1)
    client.dispose()
  })

  it('edit local aparece imediatamente', async () => {
    const client = createWorldClient({ seed: 34, renderDistance: 1, forceInline: true })
    client.start(0, 0)
    await esperarChunks(client, 5)
    const h = client.heightAt(2, 2)
    client.edit(2, h + 1, 2, ID.stone)
    expect(client.getBlock(2, h + 1, 2)).toBe(ID.stone)
    client.dispose()
  })
})

describe('physics', () => {
  const flat = (y0) => (x, y, z) => y < y0
  it('não atravessa o chão caindo de muito alto', () => {
    const solid = flat(64)
    const st = { x: 0.5, y: 120, z: 0.5, vx: 0, vy: -55, vz: 0, onGround: false, fallStart: 120 }
    for (let i = 0; i < 120; i++)
      stepPlayer(
        st,
        { forward: 0, strafe: 0, jump: false, yaw: 0 },
        { solidAt: solid, liquidAt: () => false },
        1 / 60,
      )
    expect(st.y).toBeGreaterThanOrEqual(63.9)
    expect(st.y).toBeLessThan(64.6)
    expect(st.onGround).toBe(true)
  })

  it('queda alta causa dano proporcional', () => {
    const solid = flat(64)
    const st = { x: 0.5, y: 90, z: 0.5, vx: 0, vy: 0, vz: 0, onGround: false, fallStart: 90 }
    let dmg = 0
    for (let i = 0; i < 300; i++) {
      const r = stepPlayer(
        st,
        { forward: 0, strafe: 0, jump: false, yaw: 0 },
        { solidAt: solid, liquidAt: () => false },
        1 / 60,
      )
      dmg += r.fallDamage
      if (r.landed) break
    }
    expect(dmg).toBeGreaterThan(10)
  })

  it('sobe degrau de um bloco sem pular', () => {
    // chão em y<64, com um degrau em x>=2 até y<65
    const solid = (x, y, z) => (x >= 2 ? y < 65 : y < 64)
    const st = { x: 0.5, y: 64, z: 0.5, vx: 0, vy: 0, vz: 0, onGround: true, fallStart: 64 }
    for (let i = 0; i < 180; i++)
      stepPlayer(
        st,
        { forward: -1, strafe: 0, jump: false, yaw: Math.PI / 2, autoJump: true },
        { solidAt: solid, liquidAt: () => false },
        1 / 60,
      )
    expect(st.x).toBeGreaterThan(2.5)
    expect(st.y).toBeGreaterThanOrEqual(65)
  })

  it('sem auto-jump, um bloco inteiro barra (comportamento do original)', () => {
    const solid = (x, y, z) => (x >= 2 ? y < 65 : y < 64)
    const st = { x: 0.5, y: 64, z: 0.5, vx: 0, vy: 0, vz: 0, onGround: true, fallStart: 64 }
    for (let i = 0; i < 180; i++)
      stepPlayer(
        st,
        { forward: -1, strafe: 0, jump: false, yaw: Math.PI / 2, autoJump: false },
        { solidAt: solid, liquidAt: () => false },
        1 / 60,
      )
    expect(st.x).toBeLessThan(2)
  })

  it('AABB do jogador ocupa 1.8 de altura', () => {
    const solid = (x, y, z) => y === 66
    expect(collides(solid, 0.5, 65, 0.5)).toBe(true)
    expect(collides(solid, 0.5, 64, 0.5)).toBe(false)
    expect(PLAYER_HEIGHT).toBe(1.8)
  })

  it('flutua na água em vez de afundar pra sempre', () => {
    const solid = () => false
    const liquid = (x, y, z) => y < 64
    const st = { x: 0.5, y: 60, z: 0.5, vx: 0, vy: 0, vz: 0, onGround: false, fallStart: 60 }
    for (let i = 0; i < 240; i++)
      stepPlayer(
        st,
        { forward: 0, strafe: 0, jump: true, yaw: 0 },
        { solidAt: solid, liquidAt: liquid },
        1 / 60,
      )
    expect(st.y).toBeGreaterThan(62)
  })

  it('safeSpawn acha o primeiro vão de 2 blocos', () => {
    const solid = (x, y, z) => y < 70
    expect(safeSpawn(solid, 0, 0, 1)).toEqual({ x: 0, y: 70, z: 0 })
  })
})

describe('raycast', () => {
  const solid = (x, y, z) => x === 5 && y === 0 && z === 0
  it('acerta o bloco e devolve a normal correta', () => {
    const r = raycastVoxel({ x: 0.5, y: 0.5, z: 0.5 }, { x: 1, y: 0, z: 0 }, solid, 10)
    expect(r.hit).toEqual({ x: 5, y: 0, z: 0 })
    expect(r.normal).toEqual({ x: -1, y: 0, z: 0 })
    expect(r.place).toEqual({ x: 4, y: 0, z: 0 })
  })
  it('respeita o alcance', () => {
    expect(raycastVoxel({ x: 0.5, y: 0.5, z: 0.5 }, { x: 1, y: 0, z: 0 }, solid, 3)).toBe(null)
  })
  it('ignora o bloco onde a câmera está', () => {
    const inside = (x, y, z) => (x === 0 && y === 0 && z === 0) || (x === 3 && y === 0 && z === 0)
    const r = raycastVoxel({ x: 0.5, y: 0.5, z: 0.5 }, { x: 1, y: 0, z: 0 }, inside, 10)
    expect(r.hit.x).toBe(3)
  })
  it('funciona em diagonal', () => {
    const s = (x, y, z) => x === 3 && y === 3 && z === 0
    const d = 1 / Math.sqrt(2)
    const r = raycastVoxel({ x: 0.5, y: 0.5, z: 0.5 }, { x: d, y: d, z: 0 }, s, 10)
    expect(r).toBeTruthy()
    expect(r.hit).toEqual({ x: 3, y: 3, z: 0 })
  })
})

describe('daycycle', () => {
  it('sol acima do horizonte ao meio-dia e abaixo à meia-noite', () => {
    expect(sunDirection(NOON).y).toBeGreaterThan(0.9)
    expect(sunDirection(MIDNIGHT).y).toBeLessThan(-0.9)
  })
  it('dayFactor vai de 1 ao meio-dia a 0 à meia-noite', () => {
    expect(dayFactor(NOON)).toBeCloseTo(1, 2)
    expect(dayFactor(MIDNIGHT)).toBeCloseTo(0, 2)
  })
  it('skylight nunca zera (a noite ainda é jogável)', () => {
    for (let t = 0; t < 24000; t += 500) {
      const f = skyLightFactor(t)
      expect(f).toBeGreaterThan(0.05)
      expect(f).toBeLessThanOrEqual(1)
    }
  })
  it('a paleta é contínua ao longo do dia', () => {
    let prev = skyPalette(0)
    for (let t = 100; t <= 24000; t += 100) {
      const cur = skyPalette(t)
      for (const k of ['zenith', 'horizon', 'fog']) {
        for (let i = 0; i < 3; i++) expect(Math.abs(cur[k][i] - prev[k][i])).toBeLessThan(0.12)
      }
      prev = cur
    }
  })
  it('à noite a direcional vira a lua', () => {
    expect(lightRig(MIDNIGHT).directional.isMoon).toBe(true)
    expect(lightRig(NOON).directional.isMoon).toBe(false)
    expect(lightRig(NOON).directional.intensity).toBeGreaterThan(
      lightRig(MIDNIGHT).directional.intensity,
    )
  })
  it('o tempo avança e dá a volta', () => {
    expect(normalizeTicks(advanceTime(23990, 100))).toBeLessThan(24000)
    expect(isNight(MIDNIGHT)).toBe(true)
    expect(isNight(NOON)).toBe(false)
    expect(clockLabel(NOON)).toBe('12:00')
    expect(clockLabel(MIDNIGHT)).toBe('00:00')
  })
})

describe('survival', () => {
  it('dano respeita a invulnerabilidade', () => {
    const s = createSurvivalState()
    expect(damage(s, 5).applied).toBe(5)
    expect(damage(s, 5).applied).toBe(0) // ainda invulnerável
    expect(s.health).toBe(15)
  })
  it('morre ao zerar a vida', () => {
    const s = createSurvivalState()
    damage(s, 25)
    expect(s.dead).toBe(true)
    expect(s.health).toBe(0)
    respawn(s)
    expect(s.dead).toBe(false)
    expect(s.health).toBe(MAX_HEALTH)
  })
  it('comer restaura fome mas não passa do teto', () => {
    const s = createSurvivalState()
    s.hunger = 15
    expect(eat(s, { hunger: 8, saturation: 6 })).toBe(true)
    expect(s.hunger).toBe(20)
    expect(eat(s, { hunger: 4 })).toBe(false)
  })
  it('esforço consome saturação e depois fome', () => {
    const s = createSurvivalState()
    s.saturation = 1
    addExhaustion(s, 'sprint', 30)
    expect(s.saturation).toBe(0)
    expect(s.hunger).toBeLessThan(20)
  })
  it('regenera com fome cheia', () => {
    const s = createSurvivalState()
    s.health = 10
    for (let i = 0; i < 40; i++) stepSurvival(s, {}, 0.5)
    expect(s.health).toBeGreaterThan(10)
  })
  it('afoga com a cabeça na água', () => {
    const s = createSurvivalState()
    let hurt = 0
    for (let i = 0; i < 200; i++) {
      s.hurtTimer = 0
      hurt += stepSurvival(s, { headInWater: true }, 0.2).filter((e) => e === 'hurt').length
    }
    expect(hurt).toBeGreaterThan(0)
    expect(s.health).toBeLessThan(MAX_HEALTH)
  })
  it('inanição não mata (para em 1 de vida)', () => {
    const s = createSurvivalState()
    s.hunger = 0
    for (let i = 0; i < 400; i++) stepSurvival(s, {}, 0.5)
    expect(s.health).toBe(1)
    expect(s.dead).toBe(false)
  })
  it('xp sobe de nível', () => {
    const s = createSurvivalState()
    addXp(s, 100)
    expect(s.level).toBeGreaterThan(3)
  })
  it('sobrevive à serialização', () => {
    const s = createSurvivalState()
    s.health = 7
    s.hunger = 12
    const back = deserializeSurvival(serializeSurvival(s))
    expect(back.health).toBe(7)
    expect(back.hunger).toBe(12)
    expect(deserializeSurvival({ health: 999 }).health).toBe(MAX_HEALTH)
    expect(deserializeSurvival(null).health).toBe(MAX_HEALTH)
  })
})

describe('mobs', () => {
  const flatEnv = (player) => ({
    solidAt: (x, y, z) => y < 64,
    lightAt: () => 15,
    isDay: true,
    player,
    skyExposed: () => false,
  })

  it('coordenada nao-finita nao vira criatura', () => {
    // NaN aqui e veneno silencioso: a criatura fica no array, some do mundo e
    // contamina qualquer media de posicao. Veio de um `player.yaw` que nao
    // existia (QA de 2026-08-19).
    expect(createMob('pig', NaN, 64, 0, 1)).toBe(null)
    expect(createMob('pig', 0, undefined, 0, 1)).toBe(null)
    expect(createMob('pig', 0, 64, Infinity, 1)).toBe(null)
    expect(createMob('nao_existe', 0, 64, 0, 1)).toBe(null)
    expect(createMob('pig', 0, 64, 0, 1)).not.toBe(null)
  })

  it('zumbi persegue o jogador e ataca de perto', () => {
    const m = createMob('zombie', 0, 64, 0, 1)
    const env = flatEnv({ x: 6, y: 64, z: 0 })
    let attacked = 0
    for (let i = 0; i < 600; i++)
      attacked += stepMob(m, env, 1 / 60).filter((e) => e === 'attack').length
    expect(m.x).toBeGreaterThan(3)
    expect(attacked).toBeGreaterThan(0)
  })

  it('passivo vagueia e foge ao apanhar', () => {
    const m = createMob('pig', 0, 64, 0, 2)
    const env = flatEnv({ x: 1, y: 64, z: 0 })
    for (let i = 0; i < 300; i++) stepMob(m, env, 1 / 60)
    hurtMob(m, 3)
    expect(m.state).toBe('flee')
    const before = Math.hypot(m.x - 1, m.z)
    for (let i = 0; i < 120; i++) stepMob(m, env, 1 / 60)
    expect(Math.hypot(m.x - 1, m.z)).toBeGreaterThan(before)
  })

  it('mob cai até o chão e para', () => {
    const m = createMob('cow', 0, 100, 0, 3)
    const env = flatEnv(null)
    for (let i = 0; i < 400; i++) stepMob(m, env, 1 / 60)
    expect(m.y).toBe(64)
    expect(m.onGround).toBe(true)
  })

  it('hostil queima no sol', () => {
    const m = createMob('zombie', 0, 64, 0, 4)
    const env = { ...flatEnv(null), skyExposed: () => true }
    let burned = 0
    for (let i = 0; i < 900; i++)
      burned += stepMob(m, env, 1 / 60).filter((e) => e === 'burn').length
    expect(burned).toBeGreaterThan(0)
    expect(m.health).toBeLessThan(MOB_TYPES.zombie.health)
  })

  it('drops são determinísticos com rng fixo', () => {
    const m = createMob('cow', 0, 64, 0, 5)
    const d = mobDrops(m, () => 0.99)
    expect(d.find((x) => x.item === 'raw_beef').count).toBe(3)
  })

  it('pack/unpack preserva a lista e descarta lixo', () => {
    const list = [createMob('pig', 1.5, 64, 2.5, 6), createMob('zombie', -3, 70, 4, 7)]
    const back = unpackMobs(packMobs(list))
    expect(back.length).toBe(2)
    expect(back[0].type).toBe('pig')
    expect(back[1].x).toBe(-3)
    expect(unpackMobs([[1, 99, 0, 0, 0, 0, 1], null, 'x'])).toEqual([])
  })
})
