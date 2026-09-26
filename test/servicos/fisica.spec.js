import { describe, it, expect } from 'vitest'
import { stepPlayer, collides, PLAYER_HEIGHT } from '../../src/servicos/physics.js'

// Os três defeitos que o founder relatou em 2026-08-22 sobre movimento:
// "as colisões com os objetos, subir e descer blocos está bem complicado" e
// "no modo criativo também não está funcionando o voar".
//
// Física é pura: dá pra provar cada um sem abrir o jogo.

/** Chão sólido até y=63 (topo em y=64), mais os blocos extras que a cena pedir. */
function mundo(extra = []) {
  const chave = new Set(extra.map(([x, y, z]) => `${x},${y},${z}`))
  return (x, y, z) => y <= 63 || chave.has(`${x},${y},${z}`)
}

const jogador = (x, y, z) => ({
  x,
  y,
  z,
  vx: 0,
  vy: 0,
  vz: 0,
  onGround: true,
  fallStart: y,
  inWater: false,
})

const semAgua = () => false
const entrada = (o = {}) => ({
  forward: 0,
  strafe: 0,
  jump: false,
  sneak: false,
  sprint: false,
  flying: false,
  yaw: 0,
  autoJump: true,
  ...o,
})

/** Roda N frames de 1/60 s. */
function correr(estado, env, inp, frames = 60, dt = 1 / 60) {
  let ultimo
  for (let i = 0; i < frames; i++) ultimo = stepPlayer(estado, inp, env, dt)
  return ultimo
}

describe('degrau automático', () => {
  // yaw=0 e strafe=1 andam em +X (dirX = strafe*cos(0) = 1)
  const andarLeste = entrada({ strafe: 1 })

  it('sobe um bloco de altura 1 caminhando, sem pular', () => {
    // PLATAFORMA, nao um bloco solto: com um bloco so o jogador sobe, anda por
    // cima e cai do outro lado - e o teste mediria a queda, nao o degrau.
    const degrauLongo = []
    for (let x = 10; x <= 20; x++) degrauLongo.push([x, 64, 0])
    const solidAt = mundo(degrauLongo)
    const p = jogador(8.5, 64, 0.5)
    correr(p, { solidAt, liquidAt: semAgua }, andarLeste, 90)
    expect(p.x, 'devia ter passado por cima do degrau').toBeGreaterThan(10)
    expect(p.y, 'devia estar em cima do degrau (y=65)').toBeCloseTo(65, 1)
    expect(p.onGround, 'tem que terminar apoiado, nao no ar').toBe(true)
  })

  it('sobe o MÍNIMO necessário, não um valor fixo', () => {
    // A versão antiga levantava 1.05 fixo e a gravidade puxava de volta no mesmo
    // frame - era esse tranco que fazia "subir bloco" parecer travado.
    const solidAt = mundo([[10, 64, 0]])
    const p = jogador(9.4, 64, 0.5)
    let maxY = p.y
    for (let i = 0; i < 60; i++) {
      stepPlayer(p, andarLeste, { solidAt, liquidAt: semAgua }, 1 / 60)
      maxY = Math.max(maxY, p.y)
    }
    // topo do degrau é 65: não pode ter passado disso de forma perceptível
    expect(maxY, `subiu até ${maxY}, mais que o topo do degrau`).toBeLessThan(65.2)
  })

  it('NÃO sobe uma parede de dois blocos', () => {
    const solidAt = mundo([
      [10, 64, 0],
      [10, 65, 0],
    ])
    const p = jogador(8.5, 64, 0.5)
    correr(p, { solidAt, liquidAt: semAgua }, andarLeste, 90)
    expect(p.x, 'a parede tinha que barrar').toBeLessThan(10)
    expect(p.y).toBeCloseTo(64, 1)
  })

  it('não fica preso ao andar por terreno em escada', () => {
    // escada de tres degraus + patamar largo no topo (senao cai do outro lado)
    const cena = [
      [10, 64, 0],
      [11, 64, 0],
      [11, 65, 0],
    ]
    // patamar LONGO: em 240 frames o jogador anda ~19 blocos, e um patamar
    // curto o levaria a cair do outro lado - o teste mediria a queda.
    for (let x = 12; x <= 60; x++) for (let y = 64; y <= 66; y++) cena.push([x, y, 0])
    const solidAt = mundo(cena)
    const p = jogador(8.5, 64, 0.5)
    correr(p, { solidAt, liquidAt: semAgua }, andarLeste, 240)
    expect(p.y, 'devia ter subido a escada ate o patamar (y=67)').toBeCloseTo(67, 1)
    expect(p.x, 'devia ter avancado sobre o patamar').toBeGreaterThan(12)
  })
})

describe('voo do criativo', () => {
  it('sobe e desce de verdade quando está voando', () => {
    const solidAt = mundo()
    const p = jogador(0.5, 70, 0.5)
    correr(p, { solidAt, liquidAt: semAgua }, entrada({ flying: true, jump: true }), 30)
    expect(p.y, 'segurar espaço voando tem que SUBIR').toBeGreaterThan(72)
    const alto = p.y
    correr(p, { solidAt, liquidAt: semAgua }, entrada({ flying: true, sneak: true }), 30)
    expect(p.y, 'segurar shift voando tem que DESCER').toBeLessThan(alto)
  })

  it('não cai enquanto voa parado', () => {
    const solidAt = mundo()
    const p = jogador(0.5, 80, 0.5)
    correr(p, { solidAt, liquidAt: semAgua }, entrada({ flying: true }), 120)
    expect(p.y, 'voando parado a gravidade não pode agir').toBeCloseTo(80, 5)
  })

  it('VOAR COLIDE: descer contra o chão para em cima dele, não atravessa', () => {
    // Este é o defeito real: o ramo de voo pulava o sweep do eixo Y inteiro e
    // dava pra sair por baixo do mundo.
    const solidAt = mundo()
    const p = jogador(0.5, 70, 0.5)
    correr(p, { solidAt, liquidAt: semAgua }, entrada({ flying: true, sneak: true }), 200)
    expect(p.y, `atravessou o chão: parou em y=${p.y}`).toBeGreaterThanOrEqual(63.9)
    expect(collides(solidAt, p.x, p.y, p.z), 'terminou dentro de bloco sólido').toBe(false)
  })

  it('voar contra um teto para embaixo dele', () => {
    const solidAt = mundo([[0, 70, 0]])
    const p = jogador(0.5, 66, 0.5)
    correr(p, { solidAt, liquidAt: semAgua }, entrada({ flying: true, jump: true }), 200)
    expect(p.y + PLAYER_HEIGHT, 'a cabeça passou pelo teto').toBeLessThanOrEqual(70.05)
  })
})

describe('colisão básica', () => {
  it('andar contra parede não atravessa nem gruda', () => {
    const solidAt = mundo([
      [10, 64, 0],
      [10, 65, 0],
      [10, 66, 0],
    ])
    const p = jogador(8.5, 64, 0.5)
    correr(p, { solidAt, liquidAt: semAgua }, entrada({ strafe: 1 }), 120)
    expect(collides(solidAt, p.x, p.y, p.z)).toBe(false)
    expect(p.x, 'parou perto da parede').toBeGreaterThan(9)
    expect(p.x, 'não entrou na parede').toBeLessThan(9.75)
  })

  it('cair de muito alto não atravessa o chão (tunelamento)', () => {
    const solidAt = mundo()
    const p = { ...jogador(0.5, 200, 0.5), onGround: false }
    correr(p, { solidAt, liquidAt: semAgua }, entrada(), 600)
    expect(p.y, 'caiu através do mundo').toBeCloseTo(64, 1)
  })
})
