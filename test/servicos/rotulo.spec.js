import { describe, it, expect } from 'vitest'
import { nomeDaPilha, nomeDoItem } from '../../src/servicos/rotulo.js'

const t = (k) => `[${k}]`

describe('rotulo — o nome da pilha', () => {
  it('item cru: a chave i18n do item; desconhecido devolve a chave', () => {
    expect(nomeDoItem('stone', t)).toBe('[roqueCraft.blocks.stone]')
    expect(nomeDoItem('naoexiste', t)).toBe('naoexiste')
    expect(nomeDaPilha(null, t)).toBe('')
  })

  it('a poção lê o nível II, o prazo e o arremessável, nessa ordem', () => {
    const base = '[roqueCraft.items.pocao_cura]'
    expect(nomeDaPilha({ item: 'pocao_cura', count: 1 }, t)).toBe(base)
    expect(nomeDaPilha({ item: 'pocao_cura', count: 1, pocao: { nivel: 2 } }, t)).toBe(`${base} II`)
    expect(nomeDaPilha({ item: 'pocao_cura', count: 1, pocao: { longa: true } }, t)).toBe(
      `${base} ([roqueCraft.pocao.longa])`,
    )
    expect(
      nomeDaPilha({ item: 'pocao_cura', count: 1, pocao: { nivel: 2, splash: true } }, t),
    ).toBe(`[roqueCraft.pocao.splash]: ${base} II`)
  })
})
