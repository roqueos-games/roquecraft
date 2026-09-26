import { describe, it, expect, vi } from 'vitest'
import { criarNotificar, TIPO_DO_AVISO } from '../src/avisos.js'

describe('os avisos do jogo chegam ao host com o tipo do contrato', () => {
  it.each([
    ['info', 'info'],
    ['success', 'sucesso'],
    ['warning', 'aviso'],
    ['negative', 'erro'],
  ])('o tipo %s do RoqueOS vira %s', (deles, nosso) => {
    const avisar = vi.fn()
    criarNotificar(avisar)({ type: deles, message: 'olá' })
    expect(avisar).toHaveBeenCalledWith('olá', { tipo: nosso })
  })

  it('sem tipo, ou com um tipo que o contrato não conhece, é info', () => {
    const avisar = vi.fn()
    const notificar = criarNotificar(avisar)
    notificar({ message: 'a' })
    notificar({ type: 'ongoing', message: 'b' })
    expect(avisar.mock.calls).toEqual([
      ['a', { tipo: 'info' }],
      ['b', { tipo: 'info' }],
    ])
  })

  it('os quatro tipos são os do contrato, e nenhum aviso comum é fixo', () => {
    expect(Object.values(TIPO_DO_AVISO).sort()).toEqual(['aviso', 'erro', 'info', 'sucesso'])
    const avisar = vi.fn()
    criarNotificar(avisar)({ type: 'negative', message: 'x' })
    expect(avisar.mock.calls[0][1].fixo).toBeUndefined()
  })
})
