import { describe, it, expect } from 'vitest'
import {
  criarConstrucao,
  pressionarColocar,
  soltarColocar,
  registrarColocado,
  avancarColocar,
  chaveDaCelula,
  dentroDoJogador,
  escolherPickBlock,
  INTERVALO_COLOCAR,
} from '../../src/servicos/construcao.js'
import { stepPlayer, temApoio, PLAYER_WIDTH } from '../../src/servicos/physics.js'
import { HOTBAR_SIZE, INVENTORY_SIZE } from '../../src/servicos/inventory.js'

// AS REGRAS DE CONSTRUIR.
//
// Construir era um clique por bloco. A cadência de colocar segurando, o pick
// block e a trava de borda do agachado são todos máquinas de estado pequenas —
// e por isso moram num módulo puro, testável sem montar componente nenhum.

describe('cadência de colocar segurando', () => {
  it('o primeiro bloco sai imediatamente ao apertar', () => {
    const c = criarConstrucao()
    pressionarColocar(c)
    expect(avancarColocar(c, 0, '1,2,3')).toBe(true)
  })

  it('não repete antes do intervalo', () => {
    const c = criarConstrucao()
    pressionarColocar(c)
    registrarColocado(c, '1,2,3')
    // meio intervalo, e a mira já mudou de célula
    expect(avancarColocar(c, INTERVALO_COLOCAR * 0.5, '2,2,3')).toBe(false)
  })

  it('repete depois do intervalo, se a mira mudou de célula', () => {
    const c = criarConstrucao()
    pressionarColocar(c)
    registrarColocado(c, '1,2,3')
    expect(avancarColocar(c, INTERVALO_COLOCAR + 0.01, '2,2,3')).toBe(true)
  })

  it('NÃO repete na mesma célula, por mais tempo que passe', () => {
    // Sem esta regra, mirar no bloco que acabou de sair colocava outro em cima
    // e a parede subia sozinha enquanto o dedo estivesse no botão.
    const c = criarConstrucao()
    pressionarColocar(c)
    registrarColocado(c, '1,2,3')
    for (let i = 0; i < 30; i++) {
      expect(avancarColocar(c, 0.05, '1,2,3')).toBe(false)
    }
  })

  it('sem alvo não coloca, e o tempo continua correndo', () => {
    const c = criarConstrucao()
    pressionarColocar(c)
    registrarColocado(c, '1,2,3')
    expect(avancarColocar(c, INTERVALO_COLOCAR, null)).toBe(false)
    // com alvo novo logo depois, sai na hora — o tempo não foi perdido
    expect(avancarColocar(c, 0, '9,9,9')).toBe(true)
  })

  it('soltar o botão para tudo', () => {
    const c = criarConstrucao()
    pressionarColocar(c)
    soltarColocar(c)
    expect(avancarColocar(c, 10, '1,2,3')).toBe(false)
  })

  it('a cadência é ~5,5 blocos por segundo, arrastando por células diferentes', () => {
    const c = criarConstrucao()
    pressionarColocar(c)
    let postos = 0
    for (let i = 0; i < 60; i++) {
      // um quadro de 1/60 s, mirando numa célula nova a cada quadro
      if (avancarColocar(c, 1 / 60, `${i},0,0`)) {
        registrarColocado(c, `${i},0,0`)
        postos++
      }
    }
    expect(postos).toBeGreaterThanOrEqual(5)
    expect(postos).toBeLessThanOrEqual(7)
  })
})

describe('não colocar dentro do próprio corpo', () => {
  // O corpo tem 0,6 de largura e 1,8 de altura. Parado em (8.5, 64, 8.5) ele
  // cabe numa coluna só; parado na FRONTEIRA de duas células, ocupa duas.
  it('barra o bloco na célula do pé', () => {
    const p = { x: 8.5, y: 64, z: 8.5 }
    expect(dentroDoJogador(8, 64, 8, p)).toBe(true)
    expect(dentroDoJogador(8, 65, 8, p)).toBe(true)
  })

  it('libera o bloco acima da cabeça e abaixo do pé', () => {
    const p = { x: 8.5, y: 64, z: 8.5 }
    expect(dentroDoJogador(8, 66, 8, p)).toBe(false)
    expect(dentroDoJogador(8, 63, 8, p)).toBe(false)
  })

  it('barra as DUAS células quando o corpo está na fronteira', () => {
    // Era o defeito: a conta antiga usava `floor(player.x)` e via uma coluna
    // só, então dava pra se emparedar na célula vizinha à do próprio pé.
    const meia = PLAYER_WIDTH / 2
    const p = { x: 9.0, y: 64, z: 8.5 } // corpo de 8,7 a 9,3 em X
    expect(Math.floor(p.x - meia), 'o corpo tem que cruzar a fronteira').toBe(8)
    expect(Math.floor(p.x + meia)).toBe(9)
    expect(dentroDoJogador(8, 64, 8, p)).toBe(true)
    expect(dentroDoJogador(9, 64, 8, p)).toBe(true)
  })

  it('barra as QUATRO células quando o corpo está na quina', () => {
    const p = { x: 9.0, y: 64, z: 9.0 }
    for (const [x, z] of [
      [8, 8],
      [9, 8],
      [8, 9],
      [9, 9],
    ]) {
      expect(dentroDoJogador(x, 64, z, p), `célula ${x},${z}`).toBe(true)
    }
    expect(dentroDoJogador(10, 64, 9, p)).toBe(false)
  })
})

describe('pick block', () => {
  const vazio = () => new Array(INVENTORY_SIZE).fill(null)

  it('seleciona o slot da hotbar quando o item já está lá', () => {
    const inv = vazio()
    inv[4] = { item: 'stone', count: 10 }
    expect(escolherPickBlock(inv, 'stone', 0, HOTBAR_SIZE, false)).toEqual({
      acao: 'selecionar',
      slot: 4,
    })
  })

  it('traz da mochila pra hotbar quando está guardado', () => {
    const inv = vazio()
    inv[20] = { item: 'stone', count: 10 }
    const r = escolherPickBlock(inv, 'stone', 0, HOTBAR_SIZE, false)
    expect(r).toEqual({ acao: 'trazer', slot: 0, de: 20 })
  })

  it('na sobrevivência não dá item que não se tem', () => {
    expect(escolherPickBlock(vazio(), 'diamondBlock', 0, HOTBAR_SIZE, false)).toBeNull()
  })

  it('no criativo dá o item', () => {
    expect(escolherPickBlock(vazio(), 'diamondBlock', 3, HOTBAR_SIZE, true)).toEqual({
      acao: 'dar',
      slot: 3,
    })
  })

  it('no criativo prefere um slot vazio a sobrescrever o atual', () => {
    const inv = vazio()
    inv[0] = { item: 'dirt', count: 64 }
    const r = escolherPickBlock(inv, 'stone', 0, HOTBAR_SIZE, true)
    expect(r.slot, 'não pode apagar o que está na mão').toBe(1)
  })

  it('com a hotbar cheia, sobrescreve o slot atual', () => {
    const inv = vazio()
    for (let i = 0; i < HOTBAR_SIZE; i++) inv[i] = { item: 'dirt', count: 64 }
    expect(escolherPickBlock(inv, 'stone', 5, HOTBAR_SIZE, true).slot).toBe(5)
  })

  it('item nenhum não faz nada', () => {
    expect(escolherPickBlock(vazio(), null, 0, HOTBAR_SIZE, true)).toBeNull()
  })
})

describe('agachado não cai da borda', () => {
  /** Chão só nas células listadas. */
  const chao = (celulas) => {
    const set = new Set(celulas.map(([x, z]) => `${x},${z}`))
    return (x, y, z) => (y === 63 && set.has(`${x},${z}`) ? 1 : 0)
  }

  const jogador = (x, z) => ({
    x,
    y: 64,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    onGround: true,
    fallStart: 64,
  })

  const andar = (state, env, input, quadros = 90) => {
    for (let i = 0; i < quadros; i++) {
      stepPlayer(state, input, env, 1 / 60)
    }
    return state
  }

  const entrada = (over) => ({
    forward: 1,
    strafe: 0,
    jump: false,
    sneak: false,
    sprint: false,
    flying: false,
    yaw: 0,
    ...over,
  })

  it('temApoio enxerga o bloco sob a quina', () => {
    const solidAt = chao([[10, 10]])
    expect(temApoio(solidAt, 10.5, 64, 10.5)).toBe(true)
    expect(temApoio(solidAt, 12.5, 64, 12.5)).toBe(false)
  })

  it('PROVA DE VIDA: sem agachar, o jogador CAI da ponte', () => {
    // Sem este teste, o de baixo não significa nada: se o cenário não derrubar
    // ninguém, "não caiu agachado" é verdade por acidente.
    const ponte = []
    for (let z = 0; z <= 6; z++) ponte.push([10, z])
    const env = { solidAt: chao(ponte), liquidAt: () => false }
    const p = jogador(10.5, 0.5)
    // yaw 0 anda pra −Z no jogo; usamos strafe pra sair de LADO da ponte
    andar(p, env, entrada({ forward: 0, strafe: 1 }))
    expect(p.y, 'o cenário precisa derrubar quem não agacha').toBeLessThan(63.5)
  })

  it('agachado, o mesmo passo NÃO tira o pé da ponte', () => {
    const ponte = []
    for (let z = 0; z <= 6; z++) ponte.push([10, z])
    const env = { solidAt: chao(ponte), liquidAt: () => false }
    const p = jogador(10.5, 0.5)
    andar(p, env, entrada({ forward: 0, strafe: 1, sneak: true }))
    expect(p.y, 'agachado não pode cair').toBeGreaterThanOrEqual(64)
    expect(p.onGround).toBe(true)
  })

  it('agachado continua andando ao LONGO da ponte', () => {
    // A trava é por eixo justamente pra isso: ela veta o passo que tira o
    // apoio, não o movimento inteiro.
    const ponte = []
    for (let z = -8; z <= 8; z++) ponte.push([10, z])
    const env = { solidAt: chao(ponte), liquidAt: () => false }
    const p = jogador(10.5, 0.5)
    const z0 = p.z
    andar(p, env, entrada({ forward: 1, sneak: true }))
    expect(Math.abs(p.z - z0), 'agachado tem que conseguir andar').toBeGreaterThan(1)
    expect(p.y).toBeGreaterThanOrEqual(64)
  })

  it('agachado no ar não trava nada (agachar voando é descer)', () => {
    const env = { solidAt: () => 0, liquidAt: () => false }
    const p = jogador(10.5, 0.5)
    p.onGround = false
    andar(p, env, entrada({ forward: 1, sneak: true, flying: true }), 30)
    expect(Math.abs(p.x) + Math.abs(p.z), 'voando agachado tem que se mover').toBeGreaterThan(0)
  })
})

describe('chaveDaCelula', () => {
  it('é estável e distingue células', () => {
    expect(chaveDaCelula(1, 2, 3)).toBe('1,2,3')
    expect(chaveDaCelula(1, 2, 3)).not.toBe(chaveDaCelula(1, 2, 4))
  })
})
