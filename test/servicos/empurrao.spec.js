import { describe, it, expect } from 'vitest'
import { empurrar, decairEmpurrao, stepMob, MOB_TYPES } from '../../src/servicos/mobs.js'
import { stepPlayer } from '../../src/servicos/physics.js'

// LEVAR E DAR PANCADA TEM QUE EMPURRAR.
//
// Sem isso o zumbi encosta e fica parado DENTRO de você, e o porco leva
// machadada sem sair do lugar: a briga vira uma barra encolhendo no canto da
// tela. Empurrar é o que transforma número em briga.
//
// A decisão de desenho que este arquivo protege: o empurrão mora num campo
// PRÓPRIO (`kx`/`kz`), não em `vx`/`vz`. `stepPlayer` faz
// `state.vx += (wantX - state.vx) * control`, e no chão `control` é 1 — o input
// REESCREVE `vx` todo quadro. Empurrão em `vx` durava zero quadros com o
// jogador em pé. O teste de prova de vida abaixo demonstra isso.

const chaoInfinito = { solidAt: (x, y) => (y <= 63 ? 1 : 0), liquidAt: () => false }

const jogador = () => ({
  x: 0,
  y: 64,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  kx: 0,
  kz: 0,
  onGround: true,
  fallStart: 64,
})

const parado = {
  forward: 0,
  strafe: 0,
  jump: false,
  sneak: false,
  sprint: false,
  flying: false,
  yaw: 0,
}

describe('empurrão no jogador', () => {
  it('move o jogador parado na direção do golpe', () => {
    const p = jogador()
    empurrar(p, 1, 0) // pancada vinda de −X, empurra pra +X
    for (let i = 0; i < 30; i++) stepPlayer(p, parado, chaoInfinito, 1 / 60)
    expect(p.x, 'não saiu do lugar').toBeGreaterThan(0.3)
  })

  it('PROVA DE VIDA: o mesmo empurrão escrito em `vx` NÃO sobrevive', () => {
    // É por isso que `kx` existe. Se este teste parar de mostrar a diferença, a
    // separação virou decoração e alguém pode "simplificar" de volta.
    const p = jogador()
    p.vx = 6.2 // exatamente a força do empurrão, mas no campo errado
    for (let i = 0; i < 30; i++) stepPlayer(p, parado, chaoInfinito, 1 / 60)
    const comVx = p.x

    const q = jogador()
    empurrar(q, 1, 0)
    for (let i = 0; i < 30; i++) stepPlayer(q, parado, chaoInfinito, 1 / 60)

    expect(q.x, 'o campo próprio tem que ir mais longe que `vx`').toBeGreaterThan(comVx * 2)
  })

  it('decai e para: o empurrão não é um foguete', () => {
    const p = jogador()
    empurrar(p, 1, 0)
    for (let i = 0; i < 120; i++) stepPlayer(p, parado, chaoInfinito, 1 / 60)
    const x1 = p.x
    for (let i = 0; i < 60; i++) stepPlayer(p, parado, chaoInfinito, 1 / 60)
    expect(Math.abs(p.x - x1), 'depois de 2 s tem que ter parado').toBeLessThan(0.02)
  })

  it('dá pra andar enquanto é empurrado — não tira o controle', () => {
    const p = jogador()
    empurrar(p, 1, 0)
    const andando = { ...parado, forward: 1 }
    for (let i = 0; i < 30; i++) stepPlayer(p, andando, chaoInfinito, 1 / 60)
    // ⚠️ Na FÍSICA, `forward` com yaw 0 anda pra +Z (`dirZ = ix*sin + iz*cos`).
    // Não confundir com o yaw de CÂMERA, que olha pra −Z em 0 — a mesma
    // armadilha que `mobs.js` documenta pro yaw do modelo.
    expect(p.x, 'o empurrão em X aconteceu').toBeGreaterThan(0.2)
    expect(p.z, 'o passo do jogador em Z também').toBeGreaterThan(0.5)
  })

  it('parede não deixa o empurrão atravessar', () => {
    const parede = {
      solidAt: (x, y) => (y <= 63 ? 1 : x >= 1 ? 1 : 0),
      liquidAt: () => false,
    }
    const p = jogador()
    empurrar(p, 1, 0, 40) // força absurda de propósito
    for (let i = 0; i < 60; i++) stepPlayer(p, parado, parede, 1 / 60)
    expect(p.x, 'atravessou a parede com o tranco').toBeLessThan(1)
  })

  it('direção nula não faz nada', () => {
    const p = jogador()
    empurrar(p, 0, 0)
    expect(p.kx).toBe(0)
    expect(p.kz).toBe(0)
  })
})

describe('empurrão na criatura', () => {
  const bicho = () => ({
    id: 'x',
    type: 'pig',
    x: 0,
    y: 1,
    z: 0,
    vy: 0,
    yaw: 0,
    anim: 0,
    onGround: true,
    state: 'idle',
    timer: 99,
    targetX: 0,
    targetZ: 0,
    attackCooldown: 0,
    hurtFlash: 0,
    health: MOB_TYPES.pig.health,
    rnd: () => 0.5,
  })
  const chao = {
    solidAt: (x, y) => (y === 0 ? 1 : 0),
    liquidAt: () => false,
    lightAt: () => 15,
    isDay: true,
    player: null,
  }

  it('a criatura sai do lugar ao levar o golpe', () => {
    const m = bicho()
    empurrar(m, 1, 0)
    for (let i = 0; i < 30; i++) {
      m.state = 'idle'
      m.timer = 99
      stepMob(m, chao, 1 / 60)
    }
    expect(m.x).toBeGreaterThan(0.3)
  })

  it('e para depois de um tempo', () => {
    const m = bicho()
    empurrar(m, 1, 0)
    for (let i = 0; i < 150; i++) {
      m.state = 'idle'
      m.timer = 99
      stepMob(m, chao, 1 / 60)
    }
    expect(Math.abs(m.kx || 0)).toBe(0)
  })
})

describe('decairEmpurrao', () => {
  it('zera de vez quando fica pequeno, em vez de arrastar um resíduo', () => {
    const a = { kx: 0.02, kz: 0.02 }
    decairEmpurrao(a, 0.5)
    expect(a.kx).toBe(0)
    expect(a.kz).toBe(0)
  })

  it('não inventa campo em quem não levou pancada', () => {
    const a = {}
    decairEmpurrao(a, 0.1)
    expect(a.kx).toBe(0)
  })
})

// ⚠️ O DEFEITO QUE ESTE BLOCO FECHA (24/08 a 26/08/2026).
//
// Quando o laço de mira saiu de `tryAttack` pra `mobMirado`, o
// `const { origin } = cameraRay()` foi junto e a linha do empurrão ficou
// apontando pro `origin` GLOBAL do navegador -- uma string com a URL da página.
// `best.x - origin.x` virava NaN.
//
// Nada acusou. O lint não viu (`origin` é global de browser e existe mesmo), o
// console ficou limpo, e o bicho simplesmente SUMIA do mundo no quadro seguinte.
// A guarda `d < 1e-4` não segurava porque `NaN < 1e-4` é falso.
//
// O defeito era do chamador, e foi corrigido lá. Isto aqui fecha a porta: um
// empurrão inválido não pode ter o poder de apagar uma criatura.
describe('empurrar: NaN não apaga bicho', () => {
  const bicho = () => ({ x: 10, y: 64, z: 5, kx: 0, kz: 0, vy: 0, onGround: true })

  it('direção NaN não escreve NADA no bicho', () => {
    const m = bicho()
    empurrar(m, NaN, NaN)
    expect(m.kx).toBe(0)
    expect(m.kz).toBe(0)
    expect(m.vy).toBe(0)
  })

  it('a subtração com variável fora de escopo é exatamente esse NaN', () => {
    // `best.x - origin.x` com `origin` sendo a string do navegador.
    const m = bicho()
    empurrar(m, m.x - undefined, m.z - undefined)
    expect(Number.isFinite(m.kx)).toBe(true)
  })

  it('um só dos eixos inválido também não passa', () => {
    const m = bicho()
    empurrar(m, 1, NaN)
    expect(m.kx).toBe(0)
    const n = bicho()
    empurrar(n, Infinity, 1)
    expect(n.kz).toBe(0)
  })

  it('e o empurrão de verdade continua funcionando', () => {
    const m = bicho()
    empurrar(m, 1, 0)
    expect(m.kx).toBeGreaterThan(0)
    expect(m.vy).toBeGreaterThan(0)
  })
})
