import { describe, it, expect } from 'vitest'
import { stepPlayer, PLAYER_HEIGHT } from '../../src/servicos/physics.js'

// O PASSO QUE NÃO PODE TOCAR COM O JOGADOR PARADO.
//
// Relato do founder (2026-08-22): "mesmo parado o som de passo fica tocando".
//
// A causa não estava no áudio. `stepPlayer` devolvia `landed: true` em TODO
// frame em que a varredura vertical barrava — e com o jogador em pé a gravidade
// o empurra contra o piso a cada frame, então barrava sempre. Quem escuta
// `landed` é o baque de aterrissagem: sessenta por segundo, imóvel.
//
// O detalhe cruel é que o conserto ANTERIOR piorou este: quando eu acertei o
// contato exato (o pé em `floor(py)`, sem folga de 1e-4), o jogador parou de
// repousar um décimo de milímetro abaixo da superfície — e a varredura, que
// antes às vezes não barrava, passou a barrar limpo em todo frame.
//
// `landed` tem que significar a TRANSIÇÃO ar→chão. O mesmo arquivo já tratava
// `enteredWater` assim, com o comentário certo ao lado; só `landed` ficou para
// trás.

/** Chão sólido em y < 64, ar acima. */
const chaoEm = (nivel) => (x, y) => (y < nivel ? 1 : 0)

const parado = {
  forward: 0,
  right: 0,
  jump: false,
  sneak: false,
  sprint: false,
  flying: false,
}
const env = (solidAt) => ({ solidAt, liquidAt: () => 0, carregado: () => true })

function novoJogador(y) {
  return { x: 0.5, y, z: 0.5, vx: 0, vy: 0, vz: 0, onGround: false, fallStart: y }
}

describe('roquecraft - cadência de passo', () => {
  it('parado em pé, `landed` dispara UMA vez e nunca mais', () => {
    const solidAt = chaoEm(64)
    const p = novoJogador(64)
    const e = env(solidAt)
    let disparos = 0
    // 180 frames = 3 segundos parado. Antes do conserto: 180 disparos.
    for (let i = 0; i < 180; i++) {
      const r = stepPlayer(p, parado, e, 1 / 60)
      if (r.landed) disparos++
    }
    expect(p.onGround, 'o jogador nem chegou a encostar no chão').toBe(true)
    expect(disparos, 'passo tocando com o jogador imóvel').toBeLessThanOrEqual(1)
  })

  it('caindo de 5 blocos, `landed` dispara exatamente uma vez, com a altura certa', () => {
    const solidAt = chaoEm(64)
    const p = novoJogador(69)
    const e = env(solidAt)
    let disparos = 0
    let quedaVista = 0
    for (let i = 0; i < 240; i++) {
      const r = stepPlayer(p, parado, e, 1 / 60)
      if (r.landed) {
        disparos++
        quedaVista = r.queda
      }
    }
    expect(disparos).toBe(1)
    expect(quedaVista).toBeGreaterThan(4)
    expect(quedaVista).toBeLessThan(6)
    expect(p.y).toBeCloseTo(64, 3)
  })

  it('pular e cair de volta dispara `landed` de novo', () => {
    const solidAt = chaoEm(64)
    const p = novoJogador(64)
    const e = env(solidAt)
    // assenta
    for (let i = 0; i < 5; i++) stepPlayer(p, parado, e, 1 / 60)
    let disparos = 0
    for (let i = 0; i < 180; i++) {
      const pulo = i === 0 ? { ...parado, jump: true } : parado
      const r = stepPlayer(p, pulo, e, 1 / 60)
      if (r.landed) disparos++
    }
    expect(disparos, 'o pulo tem que produzir uma aterrissagem').toBe(1)
  })

  it('a queda de um degrau raso fica ABAIXO do corte de baque', () => {
    // Andar em terreno irregular reencosta o pé no chão o tempo todo. Se o
    // jogo tocasse baque em toda reencostada, o relevo viraria um tamborilar.
    const solidAt = (x, y) => (y < (x >= 1 ? 63.5 : 64) ? 1 : 0)
    const p = novoJogador(64)
    p.x = 1.5
    const e = env(solidAt)
    let maiorQueda = 0
    for (let i = 0; i < 120; i++) {
      const r = stepPlayer(p, parado, e, 1 / 60)
      if (r.landed) maiorQueda = Math.max(maiorQueda, r.queda)
    }
    expect(maiorQueda).toBeLessThan(0.45)
  })

  it('o jogador parado permanece EXATAMENTE em cima da superfície', () => {
    // Guarda do conserto anterior: sem ele a bisseção do sweep converge pra
    // dentro do bloco e o jogador afunda um décimo de milímetro.
    const solidAt = chaoEm(64)
    const p = novoJogador(70)
    const e = env(solidAt)
    for (let i = 0; i < 300; i++) stepPlayer(p, parado, e, 1 / 60)
    expect(p.y).toBeGreaterThanOrEqual(64)
    expect(p.y).toBeLessThan(64 + 1e-3)
    expect(PLAYER_HEIGHT).toBe(1.8)
  })
})
