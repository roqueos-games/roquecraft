import { describe, it, expect } from 'vitest'
import { createMob, stepMob, MOB_TYPES } from '../../src/servicos/mobs.js'
import {
  PAVIO_DO_CREEPER,
  DISTANCIA_PARA_ACENDER,
  DISTANCIA_PARA_APAGAR,
} from '../../src/servicos/explosao.js'

/**
 * O PAVIO.
 *
 * O creeper não é "um zumbi que morre ao encostar". O que ele ensina é FUGIR, e
 * quem ensina isso é a máquina de estados do pavio: acende perto, volta quando
 * você recua, e só estoura se você ficar. Errar qualquer um desses três dá um
 * bicho que ou nunca explode ou explode sem aviso — nos dois casos o jogador
 * não aprende nada.
 *
 * `stepMob` é puro, então dá pra rodar a briga inteira aqui, quadro a quadro,
 * sem subir o jogo.
 */

const mundo = (px, pz, py = 64) => ({
  solidAt: (x, y) => y < 64,
  lightAt: () => 0,
  isDay: false,
  player: { x: px, y: py, z: pz },
  skyExposed: () => false,
  surfaceY: () => 64,
  biomeAt: () => 'plains',
  allowHostile: true,
})

/** Roda `segundos` de jogo a 60 Hz e devolve todos os eventos vistos. */
function rodar(mob, env, segundos, dt = 1 / 60) {
  const vistos = []
  for (let t = 0; t < segundos; t += dt) {
    for (const e of stepMob(mob, env, dt)) vistos.push(e)
    if (vistos.includes('explode')) break
  }
  return vistos
}

const novoCreeper = (x = 0, z = 0) => createMob('creeper', x, 64, z, 1)

describe('o creeper acende, mantém e estoura', () => {
  it('não acende de longe — e acende de perto (par de controle)', () => {
    const longe = novoCreeper(0, 0)
    expect(rodar(longe, mundo(0, 10), 1)).not.toContain('pavio')
    expect(longe.pavio).toBe(0)

    const perto = novoCreeper(0, 0)
    expect(rodar(perto, mundo(0, 1.5), 0.2)).toContain('pavio')
    expect(perto.pavio).toBeGreaterThan(0)
  })

  it('estoura DEPOIS do pavio, não antes', () => {
    const c = novoCreeper(0, 0)
    const env = mundo(0, 1.5)
    // Um quadro antes do limite ainda não pode ter estourado, senão o aviso
    // visual não teria tempo de existir.
    expect(rodar(c, env, PAVIO_DO_CREEPER - 0.1)).not.toContain('explode')
    expect(rodar(c, env, 0.3)).toContain('explode')
  })

  it('o pavio dura o tempo declarado, com folga de um quadro', () => {
    const c = novoCreeper(0, 0)
    const env = mundo(0, 1.5)
    let t = 0
    const dt = 1 / 60
    while (t < 5) {
      if (stepMob(c, env, dt).includes('explode')) break
      t += dt
    }
    expect(t).toBeGreaterThan(PAVIO_DO_CREEPER - 2 * dt)
    expect(t).toBeLessThan(PAVIO_DO_CREEPER + 2 * dt)
  })

  it('morre com o próprio estouro — quem estourou não pode ser morto de novo', () => {
    const c = novoCreeper(0, 0)
    rodar(c, mundo(0, 1.5), 3)
    expect(c.health).toBe(0)
  })

  it('para de andar enquanto chia — nada de bomba correndo atrás', () => {
    const c = novoCreeper(0, 0)
    const env = mundo(0, 2.5)
    rodar(c, env, 0.5)
    expect(c.pavio).toBeGreaterThan(0)
    // Andou menos de meio bloco no meio segundo em que estava chiando.
    expect(Math.hypot(c.x, c.z)).toBeLessThan(0.5)
  })
})

describe('recuar DESARMA — é o que o bicho ensina', () => {
  it('afastar-se além do limite apaga o pavio na hora', () => {
    const c = novoCreeper(0, 0)
    rodar(c, mundo(0, 1.5), 0.5)
    const aceso = c.pavio
    expect(aceso).toBeGreaterThan(0)

    const eventos = rodar(c, mundo(0, DISTANCIA_PARA_APAGAR + 1), 0.2)
    expect(eventos).toContain('pavioApagado')
    expect(c.pavio).toBe(0)
  })

  it('entre acender e apagar o pavio VOLTA, não congela', () => {
    // Congelado, recuar pra 4 blocos daria um creeper te seguindo com a bomba
    // armada — mais cruel que o original e ilegível.
    const c = novoCreeper(0, 0)
    rodar(c, mundo(0, 1.5), 0.6)
    const aceso = c.pavio
    const meio = (DISTANCIA_PARA_ACENDER + DISTANCIA_PARA_APAGAR) / 2
    rodar(c, mundo(0, meio), 0.3)
    expect(c.pavio).toBeLessThan(aceso)
    expect(c.pavio).toBeGreaterThan(0)
  })

  it('quem recuou e voltou tem o pavio do começo, não o de antes', () => {
    const c = novoCreeper(0, 0)
    rodar(c, mundo(0, 1.5), 1.0)
    rodar(c, mundo(0, DISTANCIA_PARA_APAGAR + 2), 0.2)
    expect(c.pavio).toBe(0)
    // E aproximar de novo não estoura instantaneamente.
    expect(rodar(c, mundo(0, 1.5), 0.3)).not.toContain('explode')
  })

  it('sair do alcance de perseguição inteiro também desarma', () => {
    const c = novoCreeper(0, 0)
    rodar(c, mundo(0, 1.5), 0.5)
    expect(c.pavio).toBeGreaterThan(0)
    const fora = MOB_TYPES.creeper.aggro + 5
    expect(rodar(c, mundo(0, fora), 0.1)).toContain('pavioApagado')
    expect(c.pavio).toBe(0)
  })

  it('jogador pisando pra dentro e pra fora do limite não vira metralhadora', () => {
    // ⚠️ É PRA ISSO QUE SERVEM OS DOIS NÚMEROS (3 e 7). Com um só, cada
    // cruzada da linha zeraria e reacenderia o pavio, e o chiado sairia dez
    // vezes por segundo.
    //
    // O creeper é segurado no lugar a cada quadro de propósito: solto, ele
    // andaria até o jogador e o teste mediria a caminhada, não a histerese.
    const c = novoCreeper(0, 0)
    const dt = 1 / 60
    const eventos = []
    for (let i = 0; i < 120; i++) {
      c.x = 0
      c.z = 0
      // Oscila entre 2,8 e 3,4 blocos: o jogador dançando em cima da linha.
      const d = DISTANCIA_PARA_ACENDER + 0.1 * Math.sin(i * 0.9) - 0.1
      for (const e of stepMob(c, mundo(0, d), dt)) eventos.push(e)
      if (eventos.includes('explode')) break
    }
    expect(eventos.filter((e) => e === 'pavio').length, 'reacendeu mais de uma vez').toBe(1)
    expect(eventos.filter((e) => e === 'pavioApagado').length).toBe(0)
  })
})

describe('o creeper não é um zumbi verde', () => {
  it('nunca emite `attack` — o dano dele não é golpe', () => {
    const c = novoCreeper(0, 0)
    const eventos = rodar(c, mundo(0, 1.2), 3)
    expect(eventos).not.toContain('attack')
    expect(eventos).toContain('explode')
    // Par de controle: o zumbi na mesma situação BATE.
    const z = createMob('zombie', 0, 64, 0, 1)
    expect(rodar(z, mundo(0, 1.2), 1)).toContain('attack')
  })

  it('NÃO queima ao sol, enquanto o zumbi queima (par de controle)', () => {
    const dia = { ...mundo(0, 30), isDay: true, skyExposed: () => true }
    const c = novoCreeper(0, 0)
    rodar(c, dia, 3)
    expect(c.health, 'o creeper não pode sumir ao amanhecer').toBe(MOB_TYPES.creeper.health)

    const z = createMob('zombie', 0, 64, 0, 1)
    rodar(z, dia, 3)
    expect(z.health).toBeLessThan(MOB_TYPES.zombie.health)
  })

  it('pavio ausente (bicho vindo da rede) não vira NaN', () => {
    // `unpackMobs` não traz o campo. `undefined += dt` daria um pavio NaN que
    // nunca chega no limite: o creeper seguiria você pra sempre sem estourar, e
    // nada no console acusaria.
    const c = novoCreeper(0, 0)
    delete c.pavio
    expect(rodar(c, mundo(0, 1.2), 3)).toContain('explode')
    expect(Number.isFinite(c.pavio)).toBe(true)
  })

  it('a definição declara explosão e NÃO declara golpe', () => {
    expect(MOB_TYPES.creeper.explode).toBeTruthy()
    expect(MOB_TYPES.creeper.damage, 'creeper com `damage` bateria E explodiria').toBeUndefined()
    expect(MOB_TYPES.creeper.range).toBe(DISTANCIA_PARA_ACENDER)
  })

  it('a pólvora é dele, e de mais ninguém', () => {
    const donos = Object.values(MOB_TYPES).filter((d) =>
      (d.drops || []).some((x) => x.item === 'gunpowder'),
    )
    expect(donos.map((d) => d.key)).toEqual(['creeper'])
  })
})
