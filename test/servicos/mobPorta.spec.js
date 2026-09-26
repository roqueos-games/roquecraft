import { describe, it, expect } from 'vitest'
import { stepMob, MOB_TYPES } from '../../src/servicos/mobs.js'
import { SOLIDO_DE_BLOCO } from '../../src/servicos/blocks.js'
import { idDaPorta } from '../../src/servicos/porta.js'
import { centroDoVao } from '../../src/servicos/formas.js'

// O ALDEÃO ABRE A PORTA; O ZUMBI NÃO.
//
// A casa da vila ganhou porta de verdade (Goal 21, Onda 2) e o aldeão nasce
// dentro dela. Sem `abrePortas` ele vivia trancado. E a porta só vale alguma
// coisa se o zumbi ficar do lado de fora — então os dois casos moram aqui,
// como par de controle: o mesmo mundo, a mesma porta, dois bichos.
//
// A porta aqui é um sólido que `portaFechadaEm` reconhece. `abrirPorta` tira o
// sólido; `fecharPorta` devolve. É o contrato que `useRoqueCraftEntidades`
// implementa por cima de `virarPorta` + `mundo.editar`.

function mundoComPorta({ porta = [2, 1, 0], comHooks = true } = {}) {
  const chave = ([x, y, z]) => `${x},${y},${z}`
  const solidos = new Set()
  for (let x = -4; x <= 8; x++) for (let z = -4; z <= 4; z++) solidos.add(chave([x, 0, z]))
  // Parede em x=2, z de -3 a 3, dois de altura — com a porta na célula pedida.
  for (let z = -3; z <= 3; z++) for (let y = 1; y <= 2; y++) solidos.add(chave([2, y, z]))
  const portaBaixo = chave(porta)
  const portaCima = chave([porta[0], porta[1] + 1, porta[2]])
  let aberta = false
  const chamadas = { abrir: [], fechar: [] }
  const env = {
    solidAt: (x, y, z) => {
      const k = chave([x, y, z])
      if (aberta && (k === portaBaixo || k === portaCima)) return 0
      return solidos.has(k) ? 1 : 0
    },
    liquidAt: () => false,
    lightAt: () => 15,
    isDay: true,
    player: null,
  }
  if (comHooks) {
    env.portaFechadaEm = (x, y, z) => !aberta && chave([x, y, z]) === portaBaixo
    env.abrirPorta = (x, y, z) => {
      chamadas.abrir.push([x, y, z])
      aberta = true
    }
    env.fecharPorta = (x, y, z) => {
      chamadas.fechar.push([x, y, z])
      aberta = false
    }
  }
  return { env, chamadas, estaAberta: () => aberta }
}

function criarBicho(type, x, z) {
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

/** Empurra o bicho em +X, repondo o alvo longe a cada quadro. */
function empurrarEmX(env, mob, passos) {
  for (let i = 0; i < passos; i++) {
    mob.state = 'wander'
    mob.timer = 99
    mob.targetX = mob.x + 50
    mob.targetZ = mob.z
    stepMob(mob, env, 1 / 60)
  }
}

describe('a porta no caminho do aldeão', () => {
  it('o aldeão abre a porta que barrou o passo e atravessa a parede', () => {
    const { env, chamadas } = mundoComPorta()
    const mob = criarBicho('aldeao', 0.5, 0.5)
    empurrarEmX(env, mob, 240)
    expect(chamadas.abrir).toEqual([[2, 1, 0]])
    expect(mob.x).toBeGreaterThan(3)
  })

  it('e FECHA a porta quando já está a mais de uma célula e meia dela', () => {
    const { env, chamadas, estaAberta } = mundoComPorta()
    const mob = criarBicho('aldeao', 0.5, 0.5)
    empurrarEmX(env, mob, 600)
    expect(mob.x).toBeGreaterThan(5)
    expect(chamadas.fechar).toEqual([[2, 1, 0]])
    expect(estaAberta()).toBe(false)
    expect(mob.portaAberta).toBeNull()
  })

  it('enquanto ainda está na soleira, a porta continua aberta', () => {
    const { env, chamadas, estaAberta } = mundoComPorta()
    const mob = criarBicho('aldeao', 0.5, 0.5)
    // Anda até o meio da célula da porta e para.
    let passos = 0
    while (mob.x < 2.5 && passos < 600) {
      empurrarEmX(env, mob, 1)
      passos++
    }
    expect(mob.x).toBeGreaterThanOrEqual(2.5)
    expect(estaAberta()).toBe(true)
    expect(chamadas.fechar).toEqual([])
  })

  it('desalinhado com o vão, o aldeão se CENTRA na célula da porta antes de passar', () => {
    // A folha aberta ocupa 3/16 da célula: fora do centro, a quina encosta nela.
    const { env } = mundoComPorta()
    const mob = criarBicho('aldeao', 0.5, 0.85)
    const zNaSoleira = []
    for (let i = 0; i < 400; i++) {
      empurrarEmX(env, mob, 1)
      if (mob.x >= 2 && mob.x < 3) zNaSoleira.push(mob.z)
    }
    expect(mob.x).toBeGreaterThan(3)
    expect(zNaSoleira.length).toBeGreaterThan(0)
    for (const z of zNaSoleira) expect(Math.abs(z - 0.5)).toBeLessThan(0.15)
  })

  it('encostado na parede AO LADO do vão, o bicho não fica pulando', () => {
    // O pulo de degrau olhava a coluna do CENTRO do corpo: na soleira ela é o
    // vão (livre em cima) e a quina que barrou é a parede de dois de altura.
    // O aldeão ficava quicando contra a parede — a sonda fotografou.
    const { env } = mundoComPorta({ comHooks: false })
    // Porta aberta desde o início: um vão de 2 de altura em (2, 1..2, 0).
    env.solidAt = ((antigo) => (x, y, z) =>
      x === 2 && z === 0 && (y === 1 || y === 2) ? 0 : antigo(x, y, z))(env.solidAt)
    const mob = criarBicho('zombie', 0.5, 0.85)
    let pulou = false
    for (let i = 0; i < 300; i++) {
      empurrarEmX(env, mob, 1)
      if (mob.vy > 0.5 || mob.y > 1.05) pulou = true
    }
    expect(pulou, 'pulou contra a parede').toBe(false)
    expect(mob.x).toBeLessThan(2)
  })

  it('mas um degrau de UM de altura continua sendo pulado', () => {
    const { env } = mundoComPorta({ comHooks: false })
    // Degrau: um bloco só em (2, 1, z) para todo z; nada em cima. Reescreve o
    // mundo: parede de 1 de altura.
    env.solidAt = (x, y) => (y === 0 ? 1 : x === 2 && y === 1 ? 1 : 0)
    const mob = criarBicho('pig', 0.5, 0.5)
    empurrarEmX(env, mob, 300)
    expect(mob.x, 'não subiu o degrau').toBeGreaterThan(3)
  })

  it('com `vaoDaPorta` no ambiente, alinha no centro do VÃO e não da célula', () => {
    // A folha come 3/16 de um lado: o meio do que está livre fica em 0,594.
    const { env } = mundoComPorta()
    env.vaoDaPorta = (x, y, z) => ({ x: x + 0.5, z: z + 0.594 })
    const mob = criarBicho('aldeao', 0.5, 0.2)
    const zNaSoleira = []
    for (let i = 0; i < 400; i++) {
      empurrarEmX(env, mob, 1)
      if (mob.x >= 2.3 && mob.x < 3) zNaSoleira.push(mob.z)
    }
    expect(mob.x).toBeGreaterThan(3)
    expect(zNaSoleira.length).toBeGreaterThan(0)
    for (const z of zNaSoleira) expect(Math.abs(z - 0.594)).toBeLessThan(0.05)
  })

  it('⚠️ com a FOLHA DE VERDADE (caixas do catálogo), o aldeão atravessa e fecha', () => {
    // A reprodução exata da sonda: corredor de 1 de largura em x=11, porta
    // aberta em (11, 89, 8) virada pra −Z, folha em x∈[0, 3/16]. É a caixa que
    // `SOLIDO_DE_BLOCO` entrega ao mundo — não um sólido inventado pelo teste.
    const Y = 88
    const PX = 11
    const aberta = idDaPorta('oakDoor', 5, true, false)
    const abertaCima = idDaPorta('oakDoor', 5, true, true)
    let fechada = false
    const solidAt = (x, y, z) => {
      if (y <= Y) return 1
      if (x === PX && z === 8 && y === Y + 1) return fechada ? 1 : SOLIDO_DE_BLOCO[aberta]
      if (x === PX && z === 8 && y === Y + 2) return fechada ? 1 : SOLIDO_DE_BLOCO[abertaCima]
      const parede = x >= PX - 1 && x <= PX + 1 && z >= 8 && z <= 13 && y <= Y + 2
      return parede && !(x === PX && z <= 12) ? 1 : 0
    }
    const env = {
      solidAt,
      liquidAt: () => false,
      lightAt: () => 15,
      isDay: true,
      player: null,
      portaFechadaEm: () => false,
      abrirPorta: () => {},
      fecharPorta: () => {
        fechada = true
      },
      vaoDaPorta: (x, y, z) => {
        const c = centroDoVao(aberta)
        return c && { x: x + c.x, z: z + c.z }
      },
    }
    // ⚠️ JÁ DENTRO DA CÉLULA E ENCOSTADO NA FOLHA — a cena exata da sonda: a
    // porta fechada é fina e fica na face de fora, então o aldeão entra na
    // célula (z=8,55), abre, e a folha aberta nasce colada na quina dele.
    for (const zInicial of [9.6, 8.55]) {
      fechada = false
      const mob = criarBicho('aldeao', PX + 0.5, zInicial)
      mob.y = Y + 1
      mob.portaAberta = { x: PX, y: Y + 1, z: 8 }
      for (let i = 0; i < 600; i++) {
        mob.state = 'wander'
        mob.timer = 99
        mob.targetX = PX + 0.5
        mob.targetZ = 3.5
        stepMob(mob, env, 1 / 60)
      }
      expect(mob.z, `de z=${zInicial}: não atravessou a folha`).toBeLessThan(7)
      expect(fechada, `de z=${zInicial}: não fechou atrás de si`).toBe(true)
      expect(mob.y).toBe(Y + 1)
    }
  })

  // O PAR DE CONTROLE. Mesmo mundo, mesma porta, mesmo empurrão: o zumbi
  // fica do lado de fora. Se este teste passar a falhar, a porta virou enfeite.
  it('o zumbi NÃO abre: bate na porta e fica', () => {
    const { env, chamadas } = mundoComPorta()
    const mob = criarBicho('zombie', 0.5, 0.5)
    empurrarEmX(env, mob, 240)
    expect(chamadas.abrir).toEqual([])
    expect(mob.x).toBeLessThan(2)
  })

  it('só abre PORTA: parede sem porta continua barrando o aldeão', () => {
    const { env, chamadas } = mundoComPorta({ porta: [2, 1, 3] }) // porta longe do caminho
    const mob = criarBicho('aldeao', 0.5, 0.5)
    empurrarEmX(env, mob, 240)
    expect(chamadas.abrir).toEqual([])
    expect(mob.x).toBeLessThan(2)
  })

  it('sem os ganchos no ambiente, o aldeão se comporta como qualquer bicho', () => {
    const { env } = mundoComPorta({ comHooks: false })
    const mob = criarBicho('aldeao', 0.5, 0.5)
    expect(() => empurrarEmX(env, mob, 60)).not.toThrow()
    expect(mob.x).toBeLessThan(2)
  })

  it('o aldeão sabe abrir e o zumbi não — a regra mora na definição', () => {
    expect(MOB_TYPES.aldeao.abrePortas).toBe(true)
    expect(MOB_TYPES.zombie.abrePortas).toBeFalsy()
    expect(MOB_TYPES.pig.abrePortas).toBeFalsy()
  })
})
