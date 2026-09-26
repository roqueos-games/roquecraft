import { describe, it, expect } from 'vitest'
import { stepMob, MOB_TYPES } from '../../src/servicos/mobs.js'
import {
  rotinaDoAldeao,
  RAIO_DO_QUINTAL,
  RAIO_DA_FUGA,
  FOLGA_DE_CASA,
} from '../../src/servicos/rotina.js'

// A ROTINA DO ALDEÃO — dia no quintal, noite em casa, foge do zumbi.
//
// Até o Goal 21 o aldeão vagueava como um porco. A casa ganhou porta e ele
// aprendeu a abrir; a rotina é o que faz ele USAR a casa. Os testes de
// `stepMob` abaixo rodam a IA inteira num campo aberto: o que se mede é onde
// ele acaba, não o que ele "decidiu".

function campo({ isDay = true, hostis = [] } = {}) {
  return {
    solidAt: (x, y) => (y <= 0 ? 1 : 0),
    liquidAt: () => false,
    lightAt: () => 15,
    isDay,
    player: null,
    ameacaPerto: (x, z, raio) => {
      let melhor = null
      let dm = raio
      for (const h of hostis) {
        const d = Math.hypot(h.x - x, h.z - z)
        if (d < dm) {
          dm = d
          melhor = { x: h.x, z: h.z }
        }
      }
      return melhor
    },
  }
}

let semente = 1
const rnd = () => {
  semente = (semente * 16807) % 2147483647
  return (semente - 1) / 2147483646
}

function aldeao(x, z, { origemX = 10, origemZ = 10 } = {}) {
  return {
    id: 'a',
    type: 'aldeao',
    x,
    y: 1,
    z,
    vy: 0,
    yaw: 0,
    anim: 0,
    onGround: true,
    state: 'idle',
    timer: 0,
    targetX: x,
    targetZ: z,
    attackCooldown: 0,
    hurtFlash: 0,
    health: 20,
    origemX,
    origemZ,
    rnd,
  }
}
const daCasa = (m) => Math.hypot(m.x - 10.5, m.z - 10.5)
const rodar = (m, env, quadros) => {
  for (let i = 0; i < quadros; i++) stepMob(m, env, 1 / 60)
}

describe('rotina.js — a decisão pura', () => {
  it('com hostil perto, FOGE para longe dele, ignorando o relógio', () => {
    const m = aldeao(10.5, 10.5)
    for (const isDay of [true, false]) {
      const d = rotinaDoAldeao(m, campo({ isDay, hostis: [{ x: 14.5, z: 10.5 }] }))
      expect(d.estado).toBe('flee')
      expect(d.fugaDe).toEqual({ x: 14.5, z: 10.5 })
      expect(d.alvo.x, 'o alvo é do lado oposto ao zumbi').toBeLessThan(10.5)
    }
  })

  it('hostil além de RAIO_DA_FUGA não conta', () => {
    const m = aldeao(10.5, 10.5)
    const d = rotinaDoAldeao(m, campo({ hostis: [{ x: 10.5 + RAIO_DA_FUGA + 1, z: 10.5 }] }))
    expect(d.estado).not.toBe('flee')
  })

  it('de noite, longe de casa, anda para a origem; em casa, fica', () => {
    const longe = rotinaDoAldeao(aldeao(20.5, 10.5), campo({ isDay: false }))
    expect(longe.estado).toBe('wander')
    expect(longe.alvo).toEqual({ x: 10.5, z: 10.5 })
    const emCasa = rotinaDoAldeao(aldeao(10.6, 10.5), campo({ isDay: false }))
    expect(emCasa.estado).toBe('idle')
    expect(emCasa.timer).toBeGreaterThan(0)
  })

  it('de dia, o alvo é sorteado AO REDOR DA CASA, nunca além de RAIO_DO_QUINTAL', () => {
    const m = aldeao(30.5, 30.5) // vinte blocos longe
    let andou = 0
    for (let i = 0; i < 200; i++) {
      const d = rotinaDoAldeao(m, campo())
      if (d.estado !== 'wander') continue
      andou++
      expect(Math.hypot(d.alvo.x - 10.5, d.alvo.z - 10.5)).toBeLessThanOrEqual(
        RAIO_DO_QUINTAL + 1e-9,
      )
    }
    expect(andou).toBeGreaterThan(50)
  })
})

describe('rotina no stepMob — onde o aldeão ACABA', () => {
  it('só o aldeão tem rotina', () => {
    expect(MOB_TYPES.aldeao.rotina).toBe(true)
    expect(MOB_TYPES.zombie.rotina).toBeFalsy()
    expect(MOB_TYPES.pig.rotina).toBeFalsy()
  })

  it('de dia fica no quintal: em 40 s nunca passa de RAIO_DO_QUINTAL + 1 da casa, e anda', () => {
    const m = aldeao(10.5, 10.5)
    const env = campo()
    let maxD = 0
    let mexeu = false
    for (let i = 0; i < 2400; i++) {
      const antes = m.x
      stepMob(m, env, 1 / 60)
      if (m.x !== antes) mexeu = true
      maxD = Math.max(maxD, daCasa(m))
    }
    expect(mexeu).toBe(true)
    expect(maxD).toBeLessThanOrEqual(RAIO_DO_QUINTAL + 1)
  })

  it('de dia, empurrado para longe, VOLTA para o quintal', () => {
    const m = aldeao(40.5, 10.5)
    // 30 blocos a 0,75/s com 35% de paradas: ~70 s. Dá 2 min.
    rodar(m, campo(), 60 * 120)
    expect(daCasa(m)).toBeLessThanOrEqual(RAIO_DO_QUINTAL + 1)
  })

  it('de noite vai para casa e FICA lá', () => {
    const m = aldeao(16.5, 10.5)
    const env = campo({ isDay: false })
    rodar(m, env, 60 * 20)
    expect(daCasa(m)).toBeLessThanOrEqual(FOLGA_DE_CASA + 0.2)
    // e nas próximas 20 s não sai
    let maxD = 0
    for (let i = 0; i < 1200; i++) {
      stepMob(m, env, 1 / 60)
      maxD = Math.max(maxD, daCasa(m))
    }
    expect(maxD).toBeLessThanOrEqual(FOLGA_DE_CASA + 0.2)
  })

  it('⚠️ zumbi a 5 blocos: em 3 s a distância até ele CRESCE, e é corrida (mais rápido que o passo)', () => {
    const m = aldeao(10.5, 10.5)
    const zumbi = { x: 15.5, z: 10.5 }
    const env = campo({ hostis: [zumbi] })
    const antes = Math.hypot(m.x - zumbi.x, m.z - zumbi.z)
    rodar(m, env, 180)
    const depois = Math.hypot(m.x - zumbi.x, m.z - zumbi.z)
    expect(depois - antes, 'não fugiu').toBeGreaterThan(2.5)
    expect(m.state).toBe('flee')
    expect(m.x, 'correu para o lado oposto').toBeLessThan(10.5)
  })

  it('⚠️ reage NA HORA, no meio de um passeio: não espera o timer do vagueio', () => {
    // Timer de 5 s andando NA DIREÇÃO do zumbi. Se a ameaça só fosse olhada
    // quando o timer zera, ele passaria 5 s andando para a boca do zumbi.
    const m = aldeao(10.5, 10.5)
    m.state = 'wander'
    m.timer = 5
    m.targetX = 15.5
    m.targetZ = 10.5
    const env = campo({ hostis: [{ x: 15.5, z: 10.5 }] })
    rodar(m, env, 60)
    expect(m.state).toBe('flee')
    expect(m.x, 'em 1 s já está correndo para o outro lado').toBeLessThan(10.5)
  })

  it('o zumbi perto vence a noite: não vai dormir com o hostil na porta', () => {
    const m = aldeao(10.5, 10.5)
    const env = campo({ isDay: false, hostis: [{ x: 12.5, z: 10.5 }] })
    rodar(m, env, 120)
    expect(daCasa(m)).toBeGreaterThan(1)
  })

  it('zumbi some: de dia volta ao quintal', () => {
    const m = aldeao(10.5, 10.5)
    const hostis = [{ x: 14.5, z: 10.5 }]
    const env = campo({ hostis })
    rodar(m, env, 240)
    expect(daCasa(m)).toBeGreaterThan(2)
    hostis.length = 0
    rodar(m, env, 60 * 30)
    expect(daCasa(m)).toBeLessThanOrEqual(RAIO_DO_QUINTAL + 1)
    expect(m.state).not.toBe('flee')
  })

  it('o porco continua o porco: sem rotina, vagueia sem olhar a casa', () => {
    const p = { ...aldeao(40.5, 10.5), type: 'pig', health: 10 }
    rodar(p, campo({ isDay: false }), 60 * 20)
    expect(Math.hypot(p.x - 10.5, p.z - 10.5)).toBeGreaterThan(15)
  })
})
