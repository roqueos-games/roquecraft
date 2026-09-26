import { describe, it, expect } from 'vitest'
import {
  createSurvivalState,
  stepSurvival,
  MAX_HEALTH,
  damage,
} from '../../src/servicos/survival.js'
import { stepPlayer, WALK_SPEED } from '../../src/servicos/physics.js'
import {
  criarEfeitos,
  aplicarEfeito,
  tiqueDeEfeitos,
  multiplicadorDeVelocidade,
  fatorDeFolego,
  INTERVALO_DO_TIQUE,
  passoDosEfeitos,
  nivelDe,
} from '../../src/servicos/efeitos.js'

//
// ONDE OS EFEITOS MORDEM — a parte que `efeitos.spec.js` não pode provar.
//
// Lá se prova a REGRA: o multiplicador é 1,4, o fator de fôlego é 0,5. Aqui se
// prova que o número chega no jogo: que a física anda mais, que o fôlego dura
// mais, que a vida sobe e desce. Um sistema de efeitos com a regra certa e a
// fiação solta passa verde no primeiro e não muda nada na tela — que é
// exatamente a barra de XP que não pagava, uma camada abaixo.

const entrada = (extra = {}) => ({
  forward: -1,
  strafe: 0,
  jump: false,
  sneak: false,
  sprint: false,
  flying: false,
  yaw: 0,
  autoJump: false,
  ...extra,
})

/** Um mundo com chão em y=0 e ar acima. */
const mundo = {
  solidAt: (x, y) => y < 0,
  liquidAt: () => false,
  isLoaded: () => true,
  carregado: () => true,
}

function andarUmSegundo(mult) {
  const corpo = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, onGround: true }
  for (let i = 0; i < 50; i++) {
    stepPlayer(corpo, entrada({ multVelocidade: mult }), mundo, 0.02)
  }
  return Math.hypot(corpo.x, corpo.z)
}

describe('velocidade e lentidão chegam na física', () => {
  it('sem efeito, o passo é o de sempre', () => {
    const d = andarUmSegundo(1)
    // um segundo de caminhada, com a aceleração do começo: perto de WALK_SPEED
    expect(d).toBeGreaterThan(WALK_SPEED * 0.5)
    expect(d).toBeLessThan(WALK_SPEED * 1.2)
  })

  it('com velocidade II o jogador anda MAIS longe no mesmo tempo', () => {
    const e = criarEfeitos()
    aplicarEfeito(e, 'velocidade', 2)
    const rapido = andarUmSegundo(multiplicadorDeVelocidade(e))
    expect(rapido).toBeGreaterThan(andarUmSegundo(1) * 1.15)
  })

  it('com lentidão II ele anda MENOS', () => {
    const e = criarEfeitos()
    aplicarEfeito(e, 'lentidao', 2)
    expect(andarUmSegundo(multiplicadorDeVelocidade(e))).toBeLessThan(andarUmSegundo(1) * 0.9)
  })

  it('entrada sem o campo anda igual a entrada com 1 — nada quebra sem poção', () => {
    const corpoA = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, onGround: true }
    const corpoB = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, onGround: true }
    for (let i = 0; i < 30; i++) {
      stepPlayer(corpoA, entrada(), mundo, 0.02)
      stepPlayer(corpoB, entrada({ multVelocidade: 1 }), mundo, 0.02)
    }
    expect(corpoA.z).toBeCloseTo(corpoB.z, 6)
  })
})

describe('respiração aquática chega no fôlego', () => {
  const afogarAte = (fator) => {
    const s = createSurvivalState()
    let t = 0
    while (s.air > 0 && t < 120) {
      stepSurvival(s, { headInWater: true, fatorDeFolego: fator }, 0.1)
      t += 0.1
    }
    return t
  }

  it('com respiração o fôlego dura mais, e sem ela nada muda', () => {
    const semCampo = (() => {
      const s = createSurvivalState()
      let t = 0
      while (s.air > 0 && t < 120) {
        stepSurvival(s, { headInWater: true }, 0.1)
        t += 0.1
      }
      return t
    })()
    const e = criarEfeitos()
    aplicarEfeito(e, 'respiracao', 1)
    expect(afogarAte(1)).toBeCloseTo(semCampo, 1)
    expect(afogarAte(fatorDeFolego(e))).toBeGreaterThan(semCampo * 1.5)
  })

  it('mas ele AINDA acaba — fôlego infinito apagaria o afogamento', () => {
    const e = criarEfeitos()
    aplicarEfeito(e, 'respiracao', 1)
    expect(afogarAte(fatorDeFolego(e))).toBeLessThan(120)
  })
})

describe('regeneração e veneno chegam na vida', () => {
  it('a regeneração cura MESMO de barriga vazia', () => {
    // ⚠️ A regeneração por fome exige `hunger >= 18`. Se a poção passasse por
    // ela, só funcionaria pra quem já não precisava.
    const s = createSurvivalState()
    s.hunger = 0
    damage(s, 10, 'generic')
    const antes = s.health
    const evs = stepSurvival(s, { tiqueDeEfeito: { regenerar: 2, envenenar: 0 } }, 0.05)
    expect(s.health).toBe(antes + 2)
    expect(evs).toContain('healed')
  })

  it('o veneno tira vida', () => {
    const s = createSurvivalState()
    const evs = stepSurvival(s, { tiqueDeEfeito: { regenerar: 0, envenenar: 2 } }, 0.05)
    expect(s.health).toBe(MAX_HEALTH - 2)
    expect(evs).toContain('hurt')
  })

  it('o veneno NÃO MATA: ele para em 1 de vida', () => {
    // Efeito de prazo que mata sozinho tira do jogador a chance de reagir, e o
    // que ele vê é "morri sem nada me atacando".
    const s = createSurvivalState()
    damage(s, MAX_HEALTH - 2, 'generic')
    for (let i = 0; i < 20; i++) {
      stepSurvival(s, { tiqueDeEfeito: { regenerar: 0, envenenar: 4 } }, 0.05)
    }
    expect(s.health).toBe(1)
    expect(s.dead).toBe(false)
  })

  it('sem o campo, a sobrevivência anda igual a antes', () => {
    const s = createSurvivalState()
    damage(s, 5, 'generic')
    const antes = s.health
    stepSurvival(s, {}, 0.05)
    expect(s.health).toBe(antes)
  })

  it('ponta a ponta: um prazo de veneno tira vida e para sozinho', () => {
    const s = createSurvivalState()
    const e = criarEfeitos()
    aplicarEfeito(e, 'veneno', 1, INTERVALO_DO_TIQUE * 3 + 0.05)
    let t = 0
    while (t < 60) {
      // ⚠️ A ORDEM É ESTA, E É A DO JOGO: tica, aplica, e SÓ ENTÃO desconta o
      // prazo. A primeira versão deste teste esqueceu o `passoDosEfeitos` e o
      // veneno levou o jogador a 1 de vida — que é precisamente o defeito que
      // a fiação não pode ter, e que nenhum teste de unidade do módulo pegaria.
      const tique = tiqueDeEfeitos(e, 0.05)
      stepSurvival(s, { tiqueDeEfeito: tique }, 0.05)
      passoDosEfeitos(e, 0.05)
      t += 0.05
      // sem fome nem água, nada mais mexe na vida
      s.hunger = 10
    }
    expect(nivelDe(e, 'veneno')).toBe(0)
    expect(s.health).toBeLessThan(MAX_HEALTH)
    expect(s.health).toBeGreaterThan(MAX_HEALTH - 5)
    expect(s.dead).toBe(false)
  })
})
