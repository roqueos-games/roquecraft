import { describe, it, expect, vi } from 'vitest'
import { restaurarSessaoSolo } from '../../src/servicos/sessaoSolo.js'

// ⚠️ O QUE ESTE ARQUIVO GUARDA É A LISTA E A ORDEM (RC-03).
//
// O defeito não foi um passo errado: foi a sessão inteira ter sido reduzida a
// `{ semente, instante }`. Um teste que conferisse só a semente passaria com o
// código defeituoso — ele restaurava a semente.

const salvoDeExemplo = () => ({
  seed: 4242,
  mode: 'survival',
  ticks: 9000,
  hotbar: 3,
  inventory: [{ item: 'diamond_pickaxe', count: 1, dur: 1500 }],
  survival: { health: 7, hunger: 4 },
  mobilia: [{ t: 'b', k: '1,64,1', s: [] }],
  renascimento: { x: 1, y: 64, z: 1 },
  edits: [['0,0', [[17, 4]]]],
  player: { x: 10, y: 70, z: -3, yaw: 1.2, pitch: -0.3 },
  drops: [],
  mobs: [],
})

function alvoEspiao() {
  const chamadas = []
  const marcar =
    (nome) =>
    (...args) => {
      chamadas.push({ nome, args })
    }
  return {
    chamadas,
    definirEstado: vi.fn(marcar('definirEstado')),
    definirEdicoes: vi.fn(marcar('definirEdicoes')),
    definirEntidades: vi.fn(marcar('definirEntidades')),
    definirJogador: vi.fn(marcar('definirJogador')),
    reiniciarMundo: vi.fn(marcar('reiniciarMundo')),
  }
}

describe('voltar da sala para o solo (RC-03)', () => {
  it('restaura os CINCO passos, e nenhum a menos', () => {
    const alvo = alvoEspiao()
    expect(restaurarSessaoSolo(salvoDeExemplo(), alvo)).toBe(true)
    expect(alvo.chamadas.map((c) => c.nome)).toEqual([
      'definirEstado',
      'definirEdicoes',
      'definirEntidades',
      'definirJogador',
      'reiniciarMundo',
    ])
  })

  it('o mundo só reinicia DEPOIS das edições voltarem', () => {
    // Invertido, o terreno é regenerado limpo e as construções somem.
    const alvo = alvoEspiao()
    restaurarSessaoSolo(salvoDeExemplo(), alvo)
    const nomes = alvo.chamadas.map((c) => c.nome)
    expect(nomes.indexOf('definirEdicoes')).toBeLessThan(nomes.indexOf('reiniciarMundo'))
  })

  it('a sessão que volta é a inteira, não a semente', () => {
    const alvo = alvoEspiao()
    const salvo = salvoDeExemplo()
    restaurarSessaoSolo(salvo, alvo)

    const [inicio] = alvo.definirEstado.mock.calls[0]
    expect(inicio.seed).toBe(4242)
    expect(inicio.ticks).toBe(9000)
    expect(inicio.hotbar).toBe(3)
    expect(inicio.mode).toBe('survival')
    expect(inicio.inventory).toEqual(salvo.inventory)
    expect(inicio.survival).toEqual(salvo.survival)
    expect(inicio.renascimento).toEqual(salvo.renascimento)
    // A mobília e as entidades vêm do payload cru, que também é entregue.
    expect(alvo.definirEstado.mock.calls[0][1]).toBe(salvo)
    expect(alvo.definirEdicoes).toHaveBeenCalledWith(salvo.edits)
    expect(alvo.definirEntidades).toHaveBeenCalledWith(salvo)
    expect(alvo.definirJogador).toHaveBeenCalledWith(salvo.player)
    expect(alvo.reiniciarMundo).toHaveBeenCalledWith(4242)
  })

  it('save sem edições restaura uma lista vazia, não `undefined`', () => {
    const alvo = alvoEspiao()
    const salvo = salvoDeExemplo()
    delete salvo.edits
    restaurarSessaoSolo(salvo, alvo)
    expect(alvo.definirEdicoes).toHaveBeenCalledWith([])
  })

  it('save sem posição do jogador restaura `null`, e quem decide o pouso é o alvo', () => {
    const alvo = alvoEspiao()
    const salvo = salvoDeExemplo()
    delete salvo.player
    restaurarSessaoSolo(salvo, alvo)
    expect(alvo.definirJogador).toHaveBeenCalledWith(null)
  })

  it('sem payload não mexe em nada', () => {
    const alvo = alvoEspiao()
    expect(restaurarSessaoSolo(null, alvo)).toBe(false)
    expect(restaurarSessaoSolo(undefined, alvo)).toBe(false)
    expect(restaurarSessaoSolo('x', alvo)).toBe(false)
    expect(alvo.chamadas).toEqual([])
  })
})
