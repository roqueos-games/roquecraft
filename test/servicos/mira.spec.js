import { describe, it, expect } from 'vitest'
import { criarMira, alcanceDe, ALCANCE, RACHADURA_MAX } from '../../src/servicos/mira.js'
import { BLOCK_BY_KEY, AIR, ID } from '../../src/servicos/blocks.js'
import { chaveDaCelula } from '../../src/servicos/construcao.js'
import { EYE_HEIGHT } from '../../src/servicos/physics.js'

// ⚠️ O QUE ESTE ARQUIVO SEGURA: o contorno e o golpe apontando pro MESMO bloco.
//
// Isto morava em cento e vinte linhas do componente e nao tinha teste porque
// dependia de `engine`, `world` e `player` ao mesmo tempo. O dublê de cada um
// desses tres cabe em dez linhas -- o que faltava nao era o teste, era a
// fronteira.

const PEDRA = BLOCK_BY_KEY.stone.id
const TOCHA = BLOCK_BY_KEY.torch.id

/** Mundo de mentira: `yaw = 0` olha pro -z, entao a parede fica em z = -5. */
function mundoFalso({ agua = new Set(), solidos = new Set(['0,64,-5']) } = {}) {
  const k = (x, y, z) => `${x},${y},${z}`
  return {
    getBlock: (x, y, z) =>
      solidos.has(k(x, y, z)) ? PEDRA : agua.has(k(x, y, z)) ? ID.water : AIR,
    solidAt: (x, y, z) => solidos.has(k(x, y, z)),
    liquidAt: (x, y, z) => agua.has(k(x, y, z)),
    caixasAt: undefined,
  }
}

function motorFalso() {
  const pos = { x: 0, y: 0, z: 0, set: (x, y, z) => Object.assign(pos, { x, y, z }) }
  const highlight = { visible: false, position: { x: 1, y: 2, z: 3 } }
  return {
    apontou: [],
    destaque: {
      apontarPara(...args) {
        this.__mira.apontou.push(args)
        highlight.visible = true
      },
    },
    highlight,
    crack: {
      visible: false,
      position: { copy: (p) => (crackPos.valor = p) },
      material: { opacity: 0 },
    },
    fantasma: { visible: false, position: pos },
  }
}
const crackPos = { valor: null }

function bancada(opcoes = {}) {
  const motor = motorFalso()
  motor.destaque.__mira = motor
  const estado = {
    jogador: { x: 0, y: 64 - EYE_HEIGHT, z: 0 },
    olhar: { yaw: 0, pitch: 0 },
    modo: 'survival',
    bloqueado: false,
    minerando: null,
    naMao: null,
    ...opcoes,
  }
  const mundo = opcoes.mundo || mundoFalso()
  const mira = criarMira({
    engine: () => (estado.semMotor ? null : motor),
    mundo: () => (estado.semMundo ? null : mundo),
    jogador: estado.jogador,
    olhar: () => estado.olhar,
    modo: () => estado.modo,
    bloqueado: () => estado.bloqueado,
    minerando: () => estado.minerando,
    naMao: () => estado.naMao,
  })
  return { mira, motor, mundo, estado }
}

describe('alcanceDe: o braco do criativo e mais longo de proposito', () => {
  it('criativo 8, sobrevivencia 5', () => {
    expect(alcanceDe('creative')).toBe(ALCANCE.creative)
    expect(alcanceDe('survival')).toBe(ALCANCE.sobrevivencia)
    // Construir de longe e o que o criativo serve pra fazer; o mesmo alcance na
    // sobrevivencia viraria vantagem de combate.
    expect(ALCANCE.creative).toBeGreaterThan(ALCANCE.sobrevivencia)
  })
})

describe('o raio sai do OLHO, e nao do pe', () => {
  it('a origem esta a altura do olho', () => {
    const { mira, estado } = bancada()
    expect(mira.raio().origin.y).toBeCloseTo(estado.jogador.y + EYE_HEIGHT, 9)
  })
})

describe('alvo: o que eu quebro daqui', () => {
  it('acerta a parede dentro do alcance', () => {
    const { mira } = bancada()
    expect(mira.alvo()?.hit).toEqual({ x: 0, y: 64, z: -5 })
  })

  it('NAO acerta o que esta alem do braco na sobrevivencia', () => {
    const { mira } = bancada({ mundo: mundoFalso({ solidos: new Set(['0,64,-7']) }) })
    expect(mira.alvo()).toBe(null)
  })

  it('o criativo alcanca o MESMO bloco que a sobrevivencia nao alcanca', () => {
    const b = bancada({ mundo: mundoFalso({ solidos: new Set(['0,64,-7']) }) })
    b.estado.modo = 'creative'
    expect(b.mira.alvo()?.hit).toEqual({ x: 0, y: 64, z: -7 })
  })

  it('ATRAVESSA agua: quebrar mira no bloco atras do lago', () => {
    const mundo = mundoFalso({ agua: new Set(['0,64,-3']), solidos: new Set(['0,64,-5']) })
    const { mira } = bancada({ mundo })
    expect(mira.alvo()?.hit).toEqual({ x: 0, y: 64, z: -5 })
  })

  it('sem motor ou sem mundo nao ha alvo, e nao ha excecao', () => {
    const a = bancada()
    a.estado.semMotor = true
    expect(a.mira.alvo()).toBe(null)
    const b = bancada()
    b.estado.semMundo = true
    expect(b.mira.alvo()).toBe(null)
  })
})

describe('alvoDeLiquido: o que eu PEGO daqui', () => {
  it('PARA na agua, que a outra mira atravessa', () => {
    // Sem esta segunda pergunta a fonte fica inalcancavel e o balde nunca enche
    // (sonda de 24/08/2026: `alvo: null` com a fonte sob a mira).
    const mundo = mundoFalso({ agua: new Set(['0,64,-3']), solidos: new Set(['0,64,-5']) })
    const { mira } = bancada({ mundo })
    expect(mira.alvoDeLiquido()?.hit).toEqual({ x: 0, y: 64, z: -3 })
    expect(mira.alvo()?.hit).toEqual({ x: 0, y: 64, z: -5 })
  })
})

describe('o fantasma so aparece onde colocar daria certo', () => {
  const comBloco = () => bancada({ naMao: { item: 'stone' } })

  it('com bloco na mao e destino livre, aparece na celula do lado', () => {
    const b = comBloco()
    b.mira.atualizarDestaque()
    expect(b.motor.fantasma.visible).toBe(true)
    expect(b.motor.fantasma.position.z).toBeCloseTo(-3.5, 9)
  })

  it('de MAO VAZIA nao aparece', () => {
    const b = bancada()
    b.mira.atualizarDestaque()
    expect(b.motor.fantasma.visible).toBe(false)
  })

  it('com ferramenta na mao (que nao coloca nada) nao aparece', () => {
    const b = bancada({ naMao: { item: 'stone_pickaxe' } })
    b.mira.atualizarDestaque()
    expect(b.motor.fantasma.visible).toBe(false)
  })

  it('nao aparece dentro do proprio corpo', () => {
    // ⚠️ Este teste ja errou DUAS VEZES, e as duas viraram comentario.
    //
    // Primeiro passou POR OMISSAO: o raio errava a parede, `alvo()` voltava
    // null, e `cabeAqui(null)` dava falso pelo motivo errado. Depois eu
    // "consertei" passando um `hit` feito a mao, `{ place: {...} }` -- uma forma
    // que o raycast NUNCA produz (falta `normal` e `point`), e que quebrou assim
    // que a conta passou a ser a mesma do clique.
    //
    // Agora o `hit` vem do raio de verdade: parede colada no jogador, e a celula
    // de colocar e a que ele ocupa.
    const mundo = mundoFalso({ solidos: new Set(['0,64,-1']) })
    const jogador = { x: 0.5, y: 64 - EYE_HEIGHT, z: 0.5 }
    const fazMira = (j) =>
      criarMira({
        engine: () => motorFalso(),
        mundo: () => mundo,
        jogador: j,
        olhar: () => ({ yaw: 0, pitch: 0 }),
        modo: () => 'survival',
        bloqueado: () => false,
        minerando: () => null,
        naMao: () => ({ item: 'stone' }),
      })
    const m = fazMira(jogador)
    const hit = m.alvo()
    expect(hit.place).toEqual({ x: 0, y: 64, z: 0 })
    expect(m.cabeAqui(hit)).toBe(false)

    // A prova de que a celula em si e boa: o mesmo clique, com o jogador longe,
    // e aceito. Sem isto o falso acima poderia vir de qualquer outra condicao.
    const longe = fazMira({ x: 6.5, y: 64 - EYE_HEIGHT, z: 0.5 })
    expect(fazMira(jogador).cabeAqui({ ...hit })).toBe(false)
    expect(longe.cabeAqui(hit)).toBe(true)
  })

  it('nao aparece num destino nao substituivel que o raio ATRAVESSA', () => {
    // A tocha nao e solida (o raio passa por ela e acerta a parede atras), mas
    // tambem nao e substituivel. Sem `isReplaceable` o fantasma apareceria em
    // cima da tocha e o clique nao faria nada.
    const b = comBloco()
    const comTocha = mundoFalso({ solidos: new Set(['0,64,-5']) })
    const base = comTocha.getBlock
    comTocha.getBlock = (x, y, z) => (`${x},${y},${z}` === '0,64,-4' ? TOCHA : base(x, y, z))
    const m = criarMira({
      engine: () => b.motor,
      mundo: () => comTocha,
      jogador: b.estado.jogador,
      olhar: () => b.estado.olhar,
      modo: () => 'survival',
      bloqueado: () => false,
      minerando: () => null,
      naMao: () => ({ item: 'stone' }),
    })
    const hit = m.alvo()
    expect(hit.place).toEqual({ x: 0, y: 64, z: -4 })
    expect(m.cabeAqui(hit)).toBe(false)
  })

  it('mas AGUA aceita: colocar bloco dentro do lago funciona', () => {
    const b = comBloco()
    const comAgua = mundoFalso({ solidos: new Set(['0,64,-5']) })
    const base = comAgua.getBlock
    comAgua.getBlock = (x, y, z) => (`${x},${y},${z}` === '0,64,-4' ? ID.water : base(x, y, z))
    const m = criarMira({
      engine: () => b.motor,
      mundo: () => comAgua,
      jogador: b.estado.jogador,
      olhar: () => b.estado.olhar,
      modo: () => 'survival',
      bloqueado: () => false,
      minerando: () => null,
      naMao: () => ({ item: 'stone' }),
    })
    expect(m.cabeAqui(m.alvo())).toBe(true)
  })
})

describe('a rachadura e DAQUELA celula', () => {
  it('aparece quando a chave bate com o alvo', () => {
    const b = bancada({ minerando: { key: chaveDaCelula(0, 64, -5), progress: 0.5 } })
    b.mira.atualizarDestaque()
    expect(b.motor.crack.visible).toBe(true)
    expect(b.motor.crack.material.opacity).toBeCloseTo(0.5 * RACHADURA_MAX, 9)
  })

  it('NAO segue o olhar: virar a mira pro vizinho apaga a rachadura', () => {
    // Sem conferir a chave, o progresso pareceria do jogador e nao do bloco.
    const b = bancada({ minerando: { key: chaveDaCelula(9, 9, 9), progress: 0.5 } })
    b.mira.atualizarDestaque()
    expect(b.motor.crack.visible).toBe(false)
  })

  it('a opacidade nunca chega a apagar a textura do bloco', () => {
    const b = bancada({ minerando: { key: chaveDaCelula(0, 64, -5), progress: 5 } })
    b.mira.atualizarDestaque()
    expect(b.motor.crack.material.opacity).toBe(RACHADURA_MAX)
  })
})

describe('com o jogo bloqueado nao ha mira nenhuma', () => {
  it('menu ou inventario aberto apagam contorno, rachadura e fantasma', () => {
    const b = bancada({
      naMao: { item: 'stone' },
      minerando: { key: chaveDaCelula(0, 64, -5), progress: 1 },
    })
    b.mira.atualizarDestaque()
    expect(b.motor.highlight.visible).toBe(true)

    b.estado.bloqueado = true
    expect(b.mira.atualizarDestaque()).toBe(null)
    expect(b.motor.highlight.visible).toBe(false)
    expect(b.motor.crack.visible).toBe(false)
    expect(b.motor.fantasma.visible).toBe(false)
  })
})

describe('o contorno aponta pro bloco que o golpe acerta', () => {
  it('a celula do destaque e a celula do alvo', () => {
    // Contorno cercando um bloco enquanto o golpe acerta outro ensina a mirar
    // errado, e e pior que contorno nenhum.
    const b = bancada()
    const hit = b.mira.atualizarDestaque()
    expect(b.motor.apontou).toHaveLength(1)
    const [id, x, y, z] = b.motor.apontou[0]
    expect([x, y, z]).toEqual([hit.hit.x, hit.hit.y, hit.hit.z])
    expect(id).toBe(PEDRA)
  })
})
