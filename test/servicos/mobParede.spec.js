import { describe, it, expect } from 'vitest'
import { stepMob, MOB_TYPES } from '../../src/servicos/mobs.js'

// O MOB ATRAVESSAVA PAREDE PELA DIAGONAL QUE NINGUÉM OLHAVA.
//
// `blocked(x, z)` amostrava duas quinas — (x−half, z−half) e (x+half, z+half).
// É UMA diagonal. As outras duas quinas, (x−half, z+half) e (x+half, z−half),
// não eram consultadas por ninguém.
//
// ⚠️ A PRIMEIRA VERSÃO DESTE TESTE ERA CEGA. Ela punha uma parede reta e larga
// e mandava o bicho contra ela nas quatro direções — e passava nos DOIS
// códigos, o velho e o novo. O motivo é geométrico: com o porco (0,9 de
// largura) parado no meio de uma célula, as quatro quinas caem em no máximo
// duas células, e as duas amostradas já cobrem as duas. O defeito só aparece
// quando o corpo ATRAVESSA uma fronteira de célula em Z e a parede ocupa
// exatamente a célula da diagonal não amostrada.
//
// Então a geometria aqui é construída no dedo, e o comentário existe pra
// ninguém "simplificar" o cenário de volta pra um que não distingue nada.

/** Mundo de teste: um conjunto de blocos sólidos declarados por chave. */
function mundo(solidos) {
  const set = new Set(solidos.map(([x, y, z]) => `${x},${y},${z}`))
  return {
    solidAt: (x, y, z) => (set.has(`${x},${y},${z}`) ? 1 : 0),
    liquidAt: () => false,
    lightAt: () => 15,
    isDay: true,
    player: null,
  }
}

const chaoLargo = () => {
  const out = []
  for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) out.push([x, 0, z])
  return out
}

function criarBicho(x, z, type = 'pig') {
  return {
    id: 'teste',
    type,
    x,
    y: 1,
    z,
    vy: 0,
    yaw: 0,
    anim: 0,
    onGround: true,
    state: 'wander',
    timer: 99,
    targetX: x,
    targetZ: z,
    attackCooldown: 0,
    hurtFlash: 0,
    health: MOB_TYPES[type].health,
    rnd: () => 0.5,
  }
}

/** Empurra o bicho contra (dx, dz), repondo o alvo longe a cada quadro. */
function empurrar(env, mob, dx, dz, passos = 180) {
  for (let i = 0; i < passos; i++) {
    mob.state = 'wander'
    mob.timer = 99
    mob.targetX = mob.x + dx * 50
    mob.targetZ = mob.z + dz * 50
    stepMob(mob, env, 1 / 60)
  }
  return { x: mob.x, z: mob.z }
}

describe('mob e parede — a diagonal não amostrada', () => {
  const meia = MOB_TYPES.pig.width / 2 // 0,45

  // O bicho começa em z = 1.0 EXATO: o corpo vai de z=0,55 a z=1,45, ou seja,
  // ocupa as células de z 0 e 1 ao mesmo tempo. Andando em +X, quando o corpo
  // entra na coluna x=1 ele passa a ocupar quatro células: (0,0) (0,1) (1,0)
  // (1,1). O código velho só olhava (0,0) e (1,1).
  const cenario = (celulaDaParede) => {
    const blocos = [...chaoLargo()]
    for (let y = 1; y <= 2; y++) blocos.push([celulaDaParede[0], y, celulaDaParede[1]])
    return mundo(blocos)
  }

  it('para no bloco que ocupa a célula (1,0) — a quina que não era amostrada', () => {
    const env = cenario([1, 0])
    const mob = criarBicho(0.5, 1.0)
    const fim = empurrar(env, mob, 1, 0)
    expect(fim.x, 'atravessou o bloco pela diagonal cega').toBeLessThan(1 - meia + 0.05)
  })

  it('para no bloco que ocupa a célula (1,1) — a quina que já era amostrada', () => {
    // Contraprova: este caso o código velho JÁ acertava. Se este falhar, o
    // conserto quebrou o que funcionava.
    const env = cenario([1, 1])
    const mob = criarBicho(0.5, 1.0)
    const fim = empurrar(env, mob, 1, 0)
    expect(fim.x).toBeLessThan(1 - meia + 0.05)
  })

  it('para no bloco em (-1,0) andando em -X', () => {
    const env = cenario([-1, 0])
    const mob = criarBicho(0.5, 1.0)
    const fim = empurrar(env, mob, -1, 0)
    expect(fim.x, 'atravessou pela diagonal cega em -X').toBeGreaterThan(0 + meia - 0.05)
  })

  it('para no bloco em (0,-1) andando em -Z, com o corpo cruzando X', () => {
    const blocos = [...chaoLargo()]
    for (let y = 1; y <= 2; y++) blocos.push([0, y, -1])
    const env = mundo(blocos)
    const mob = criarBicho(1.0, 0.5) // corpo cruza a fronteira em X
    const fim = empurrar(env, mob, 0, -1)
    expect(fim.z, 'atravessou pela diagonal cega em -Z').toBeGreaterThan(0 + meia - 0.05)
  })

  it('não cai através do bloco que só sustenta a quina não amostrada', () => {
    // Um bloco de chão só na célula (1,0). O bicho em (1.0, 1.0) tem o corpo
    // sobre as quatro células, e a única sólida é a que o código velho não
    // consultava — então ele despencava por cima de chão sólido.
    const env = mundo([[1, 0, 0]])
    const mob = criarBicho(1.0, 1.0)
    for (let i = 0; i < 40; i++) {
      mob.state = 'idle'
      mob.timer = 99
      stepMob(mob, env, 1 / 60)
    }
    expect(mob.y, 'caiu por um bloco que sustenta a quina').toBeGreaterThanOrEqual(1)
    expect(mob.onGround).toBe(true)
  })
})
