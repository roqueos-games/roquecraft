import { describe, it, expect } from 'vitest'
import {
  mirar,
  criarFlecha,
  passoDaFlecha,
  temLinhaDeTiro,
  VELOCIDADE_DA_FLECHA,
  GRAVIDADE_DA_FLECHA,
  VIDA_DA_FLECHA,
  ALCANCE_DO_TIRO,
  DISTANCIA_QUE_MANTEM,
} from '../../src/servicos/flechas.js'
import { createMob, stepMob, MOB_TYPES, alturaDeMira } from '../../src/servicos/mobs.js'

/**
 * O ARQUEIRO.
 *
 * O esqueleto tinha arco na mão e batia de perto. Isso fazia os três hostis do
 * jogo serem a MESMA criatura de cores diferentes: todas correm até você e
 * encostam. Com flecha, distância significa alguma coisa e parede vira abrigo.
 *
 * O que se testa aqui é o que dá pra errar: a mira (reta erra sempre), o passo
 * (um quadro engasgado atravessa parede), a linha de tiro (senão ele dispara
 * contra tijolo pra sempre) e o RECUO — sem o qual o arco não muda nada.
 */

const chaoEm = (yChao) => (x, y) => y < yChao
const semNada = () => false

describe('mira — reta erra sempre', () => {
  it('acerta um alvo na MESMA altura', () => {
    const v = mirar(0, 64, 0, 10, 64, 0)
    const f = criarFlecha('a', 0, 64, 0, v)
    let r = 'voando'
    for (let i = 0; i < 600 && r === 'voando'; i++) {
      r = passoDaFlecha(f, 1 / 120, { solidAt: semNada, alvo: { x: 10, y: 64, z: 0 } })
    }
    expect(r).toBe('alvo')
  })

  it('acerta um alvo MAIS ALTO — a compensação existe', () => {
    const v = mirar(0, 64, 0, 9, 68, 0)
    expect(v.vy, 'sem compensação a flecha sai reta e passa por baixo').toBeGreaterThan(0)
    const f = criarFlecha('a', 0, 64, 0, v)
    let r = 'voando'
    for (let i = 0; i < 600 && r === 'voando'; i++) {
      r = passoDaFlecha(f, 1 / 120, { solidAt: semNada, alvo: { x: 9, y: 68, z: 0 } })
    }
    expect(r).toBe('alvo')
  })

  it('PROVA DE VIDA: mira RETA no mesmo alvo erra por baixo', () => {
    // Este é o teste que descreve o defeito. Se ele parar de reprovar, a
    // compensação sumiu e ninguém vai notar pelo número.
    const d = Math.hypot(12, 0)
    const f = criarFlecha('a', 0, 64, 0, {
      vx: VELOCIDADE_DA_FLECHA,
      vy: 0,
      vz: 0,
    })
    let r = 'voando'
    for (let i = 0; i < 600 && r === 'voando'; i++) {
      r = passoDaFlecha(f, 1 / 120, { solidAt: semNada, alvo: { x: 12, y: 64, z: 0 } })
    }
    expect(r, 'mira reta não podia acertar').not.toBe('alvo')
    // E erra por BAIXO, na ordem de grandeza que a gravidade manda.
    const t = d / VELOCIDADE_DA_FLECHA
    expect(64 - f.y).toBeGreaterThan(0.5 * GRAVIDADE_DA_FLECHA * t * t * 0.5)
  })

  it('alvo exatamente em cima não vira coordenada NaN', () => {
    const v = mirar(5, 64, 5, 5, 70, 5)
    expect([v.vx, v.vy, v.vz].every(Number.isFinite)).toBe(true)
    expect(v.vy).toBeGreaterThan(0)
  })

  it('o módulo horizontal é o declarado, em qualquer direção', () => {
    for (const [ax, az] of [
      [10, 0],
      [-7, 7],
      [0, -12],
    ]) {
      const v = mirar(0, 64, 0, ax, 64, az)
      expect(Math.hypot(v.vx, v.vz)).toBeCloseTo(VELOCIDADE_DA_FLECHA, 4)
    }
  })
})

describe('o voo', () => {
  it('cai — não é uma reta', () => {
    const f = criarFlecha('a', 0, 64, 0, { vx: VELOCIDADE_DA_FLECHA, vy: 0, vz: 0 })
    passoDaFlecha(f, 0.3, { solidAt: semNada })
    expect(f.y).toBeLessThan(64)
  })

  it('para no bloco', () => {
    const f = criarFlecha('a', 0, 64.5, 0, { vx: VELOCIDADE_DA_FLECHA, vy: 0, vz: 0 })
    expect(passoDaFlecha(f, 0.5, { solidAt: (x) => x >= 5 })).toBe('bloco')
    expect(f.x, 'parou onde bateu, não do outro lado').toBeLessThan(6.5)
  })

  it('⚠️ QUADRO ENGASGADO NÃO ATRAVESSA PAREDE', () => {
    // A 26 b/s um quadro de 200 ms move 5,2 BLOCOS. Testando só o ponto final,
    // a flecha apareceria do outro lado da casa. O caminho é amostrado.
    const f = criarFlecha('a', 0, 64.5, 0, { vx: VELOCIDADE_DA_FLECHA, vy: 0, vz: 0 })
    expect(passoDaFlecha(f, 0.25, { solidAt: (x) => x === 2 })).toBe('bloco')
    expect(f.x).toBeLessThan(3.5)
  })

  it('⚠️ QUADRO ENGASGADO NÃO ATRAVESSA O JOGADOR', () => {
    const f = criarFlecha('a', 0, 64, 0, { vx: VELOCIDADE_DA_FLECHA, vy: 0, vz: 0 })
    const r = passoDaFlecha(f, 0.25, { solidAt: semNada, alvo: { x: 2, y: 64, z: 0 } })
    expect(r).toBe('alvo')
  })

  it('desiste depois da vida declarada — tiro no céu não vira lixo eterno', () => {
    const f = criarFlecha('a', 0, 200, 0, { vx: 0, vy: 30, vz: 0 })
    let r = 'voando'
    let t = 0
    for (let i = 0; i < 2000 && r === 'voando'; i++) {
      r = passoDaFlecha(f, 1 / 60, { solidAt: semNada })
      t += 1 / 60
    }
    expect(r).toBe('velha')
    expect(t).toBeGreaterThan(VIDA_DA_FLECHA - 0.1)
  })

  it('sem alvo, só colide com bloco', () => {
    const f = criarFlecha('a', 0, 64, 0, { vx: VELOCIDADE_DA_FLECHA, vy: 0, vz: 0 })
    expect(passoDaFlecha(f, 0.05, { solidAt: semNada })).toBe('voando')
  })

  it('velocidade ou posição não-finita não cria flecha', () => {
    expect(criarFlecha('a', NaN, 64, 0, { vx: 1, vy: 0, vz: 0 })).toBeNull()
    expect(criarFlecha('a', 0, 64, 0, { vx: NaN, vy: 0, vz: 0 })).toBeNull()
  })
})

describe('linha de tiro', () => {
  it('campo aberto sim, parede não', () => {
    expect(temLinhaDeTiro(semNada, 0, 64, 0, 10, 64, 0)).toBe(true)
    expect(temLinhaDeTiro((x) => x === 5, 0, 64, 0, 10, 64, 0)).toBe(false)
  })

  it('o CHÃO embaixo dos dois não bloqueia', () => {
    expect(temLinhaDeTiro(chaoEm(64), 0, 64.9, 0, 10, 64.9, 0)).toBe(true)
  })
})

describe('o esqueleto atira, e RECUA', () => {
  const mundo = (px, pz) => ({
    solidAt: chaoEm(64),
    ehOpaco: chaoEm(64),
    lightAt: () => 0,
    isDay: false,
    player: { x: px, y: 64, z: pz },
    skyExposed: () => false,
    surfaceY: () => 64,
    biomeAt: () => 'plains',
    allowHostile: true,
  })

  function rodar(mob, env, segundos, dt = 1 / 60) {
    const vistos = []
    for (let t = 0; t < segundos; t += dt) for (const e of stepMob(mob, env, dt)) vistos.push(e)
    return vistos
  }

  it('atira de longe — e o zumbi na mesma distância não faz nada (par de controle)', () => {
    const e = createMob('skeleton', 0, 64, 0, 1)
    expect(rodar(e, mundo(0, 10), 0.2)).toContain('shoot')

    const z = createMob('zombie', 0, 64, 0, 1)
    expect(rodar(z, mundo(0, 10), 0.2)).not.toContain('shoot')
  })

  it('não atira além do alcance', () => {
    const e = createMob('skeleton', 0, 64, 0, 1)
    expect(rodar(e, mundo(0, ALCANCE_DO_TIRO + 3), 1)).not.toContain('shoot')
  })

  it('respeita a recarga — nada de metralhadora de flecha', () => {
    const e = createMob('skeleton', 0, 64, 0, 1)
    const tiros = rodar(e, mundo(0, 10), 4).filter((x) => x === 'shoot').length
    // 4 s de recarga 1,8 s dão 2 ou 3 tiros, nunca 240.
    expect(tiros).toBeGreaterThanOrEqual(2)
    expect(tiros).toBeLessThanOrEqual(3)
  })

  it('⚠️ NÃO ATIRA ATRAVÉS DE PAREDE — e atira sem ela (par de controle)', () => {
    const comParede = { ...mundo(0, 10), ehOpaco: (x, y, z) => z === 5 || y < 64 }
    const e = createMob('skeleton', 0, 64, 0, 1)
    expect(rodar(e, comParede, 1)).not.toContain('shoot')

    const e2 = createMob('skeleton', 0, 64, 0, 1)
    expect(rodar(e2, mundo(0, 10), 1)).toContain('shoot')
  })

  it('usa `ehOpaco`, não `solidAt`: folha não cala o arqueiro', () => {
    // Folha é sólida e não tapa a vista. Com `solidAt`, o esqueleto ficaria
    // mudo dentro de qualquer floresta.
    const folhagem = { ...mundo(0, 10), solidAt: () => true, ehOpaco: chaoEm(64) }
    const e = createMob('skeleton', 0, 64, 0, 1)
    expect(rodar(e, folhagem, 0.2)).toContain('shoot')
  })

  it('RECUA quando o jogador cola nele', () => {
    const e = createMob('skeleton', 0, 64, 0, 1)
    const perto = mundo(0, 2)
    rodar(e, perto, 0.6)
    // Andou pro lado OPOSTO ao jogador (que está em z=+2).
    expect(e.z).toBeLessThan(0)
  })

  it('e AVANÇA quando o jogador está longe (par de controle do recuo)', () => {
    const e = createMob('skeleton', 0, 64, 0, 1)
    rodar(e, mundo(0, 12), 0.6)
    expect(e.z).toBeGreaterThan(0)
  })

  it('mantém distância: parado na zona entre recuar e avançar', () => {
    const e = createMob('skeleton', 0, 64, 0, 1)
    const z0 = e.z
    rodar(e, mundo(0, DISTANCIA_QUE_MANTEM * 1.2), 0.5)
    expect(Math.abs(e.z - z0)).toBeLessThan(0.2)
  })

  it('a mira sai da altura do ARCO, não do pé', () => {
    // Do pé, o primeiro degrau de terreno barraria todo tiro e o esqueleto
    // ficaria mudo em campo aberto sem nada explicar.
    const alto = alturaDeMira(MOB_TYPES.skeleton)
    expect(alto).toBeGreaterThan(1.4)
    expect(alto).toBeLessThan(MOB_TYPES.skeleton.height)
  })

  it('recarga ausente (bicho da rede) não vira NaN e trava o arco pra sempre', () => {
    const e = createMob('skeleton', 0, 64, 0, 1)
    delete e.recargaDoArco
    expect(rodar(e, mundo(0, 10), 0.2)).toContain('shoot')
    expect(Number.isFinite(e.recargaDoArco)).toBe(true)
  })
})

describe('flechas — as bordas', () => {
  it('alvo exatamente à mesma altura atira PRA CIMA, não pra baixo', () => {
    // `dy >= 0 ? velocidade : -velocidade` no caso degenerado (alvo em cima ou
    // embaixo, sem distância no plano). Apertado para `>`, um alvo na MESMA
    // altura — a diferença de altura exatamente zero — recebe uma flecha
    // atirada para baixo, que sai do arqueiro em direção ao chão.
    expect(mirar(0, 10, 0, 0, 10, 0)).toEqual({ vx: 0, vy: VELOCIDADE_DA_FLECHA, vz: 0 })
    expect(mirar(0, 10, 0, 0, 5, 0)).toEqual({ vx: 0, vy: -VELOCIDADE_DA_FLECHA, vz: 0 })
  })

  it('distância mínima no plano decide entre balística e tiro vertical', () => {
    // `!(plano > 0.0001)`: afrouxado para `>=`, o limiar exato passa a ser
    // tratado como vertical, e o tiro perde a componente horizontal.
    const noLimiar = mirar(0, 10, 0, 0.0001, 10, 0)
    expect(noLimiar.vx).toBe(0)
    expect(noLimiar.vy).toBe(VELOCIDADE_DA_FLECHA)

    const acimaDoLimiar = mirar(0, 10, 0, 1, 10, 0)
    expect(acimaDoLimiar.vx).toBeGreaterThan(0)
  })

  it('a flecha morre AO completar a vida, não um quadro depois', () => {
    // `f.idade >= VIDA_DA_FLECHA` apertado para `>`: a flecha vive um quadro a
    // mais. Não é o quadro que importa — é que a idade é somada antes da
    // comparação, então o teste no valor exato é o único que prende o `>=`.
    const f = criarFlecha('f1', 0, 10, 0, { vx: 1, vy: 0, vz: 0 })
    f.idade = VIDA_DA_FLECHA - 0.1
    expect(passoDaFlecha(f, 0.1, {})).toBe('velha')
  })

  it('um instante antes do fim ela ainda voa', () => {
    const f = criarFlecha('f1', 0, 10, 0, { vx: 1, vy: 0, vz: 0 })
    f.idade = VIDA_DA_FLECHA - 0.1
    expect(passoDaFlecha(f, 0.05, {})).toBe('voando')
  })

  it('encostar no raio do alvo JÁ é acerto', () => {
    // `d <= raioDoAlvo`. Apertado para `<`, a flecha que para exatamente na
    // casca do alvo atravessa: o acerto raspando — o mais comum num tiro a
    // distância — deixa de contar.
    // Flecha parada e passo de um microssegundo: a queda no eixo Y fica abaixo
    // do ulp de 1, então a distância ao alvo é EXATAMENTE o raio.
    const f = criarFlecha('f1', 0, 10, 0, { vx: 0, vy: 0, vz: 0 })
    const alvo = { x: 0, y: 10, z: 1 }
    expect(passoDaFlecha(f, 1e-6, { alvo, raioDoAlvo: 1 })).toBe('alvo')
  })

  it('fora do raio, continua voando', () => {
    const f = criarFlecha('f1', 0, 10, 0, { vx: 0, vy: 0, vz: 0 })
    const alvo = { x: 0, y: 10, z: 1 }
    expect(passoDaFlecha(f, 1e-6, { alvo, raioDoAlvo: 0.999999 })).toBe('voando')
  })
})
