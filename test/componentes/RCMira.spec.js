import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RCMira from '../../src/componentes/RCMira.vue'

// A MIRA E OS QUATRO RECIBOS DE COMBATE.
//
// ⚠️ DOIS DELES NÃO EXISTIAM ATÉ A ONDA 1 DO GOAL 22, e não por falta de
// cálculo: `cargaDoArco` e `guardaLevantada` eram calculadas a cada quadro e
// consumidas por ninguém. O que se trava aqui é APARECER e SUMIR na hora
// certa — um mostrador que fica na tela quando o estado acabou é pior que
// nenhum, porque ensina o jogador a não olhar.

const montar = (props = {}) => mount(RCMira, { props })

describe('RCMira', () => {
  it('em repouso só tem os dois traços: nada de barra, recibo ou guarda', () => {
    const w = montar()
    expect(w.findAll('i')).toHaveLength(2)
    expect(w.find('.rc-mira__carga').exists(), 'barra de golpe cheia continuou na tela').toBe(false)
    expect(w.find('.rc-mira__arco').exists()).toBe(false)
    expect(w.find('.rc-mira__critico').exists()).toBe(false)
    expect(w.find('.rc-mira__guarda').exists()).toBe(false)
  })

  it('a carga do GOLPE aparece enquanto recarrega e some quando enche', async () => {
    const w = montar({ cargaDoGolpe: 0.25 })
    expect(w.find('.rc-mira__carga span').attributes('style')).toContain('width: 25%')
    await w.setProps({ cargaDoGolpe: 1 })
    expect(w.find('.rc-mira__carga').exists(), 'barra permanente vira sujeira na mira').toBe(false)
  })

  // ⚠️ SAI DE `arcoArmado`, NÃO DE `cargaDoArco > 0`. Com a carga zero no
  // primeiro instante da puxada, a barra nasceria atrasada; e no quadro em que
  // a flecha sai ela sumiria antes de o jogador entender que saiu.
  it('a barra do ARCO aparece assim que a corda é puxada, com carga zero', () => {
    const w = montar({ arcoArmado: true, cargaDoArco: 0 })
    expect(w.find('.rc-mira__arco').exists()).toBe(true)
    expect(w.find('.rc-mira__arco span').attributes('style')).toContain('width: 0%')
  })

  it('o arco cheio acende — é o instante que decide o tiro', async () => {
    const w = montar({ arcoArmado: true, cargaDoArco: 0.6 })
    expect(w.find('.rc-mira__arco').classes()).not.toContain('is-cheio')
    await w.setProps({ cargaDoArco: 1 })
    expect(w.find('.rc-mira__arco').classes(), 'cheio e apagado: o tiro sai no chute').toContain(
      'is-cheio',
    )
  })

  it('soltou a flecha, a barra do arco some', async () => {
    const w = montar({ arcoArmado: true, cargaDoArco: 1 })
    await w.setProps({ arcoArmado: false, cargaDoArco: 0 })
    expect(w.find('.rc-mira__arco').exists()).toBe(false)
  })

  it('a GUARDA fica enquanto o botão está segurado, e some quando solta', async () => {
    const w = montar({ guarda: true })
    expect(w.find('.rc-mira__guarda').exists()).toBe(true)
    await w.setProps({ guarda: false })
    expect(w.find('.rc-mira__guarda').exists(), 'guarda baixa e o escudo na tela').toBe(false)
  })

  it('as duas barras convivem no mesmo quadro, e em pontos diferentes', () => {
    const w = montar({ cargaDoGolpe: 0.5, arcoArmado: true, cargaDoArco: 0.5 })
    expect(w.find('.rc-mira__carga').exists()).toBe(true)
    expect(w.find('.rc-mira__arco').exists()).toBe(true)
    // Classes diferentes = pontos diferentes no SCSS (uma acima, outra abaixo).
    // Empilhadas viravam uma barra de dois andares sem legenda nenhuma.
    expect(w.find('.rc-mira__carga').classes()).not.toEqual(w.find('.rc-mira__arco').classes())
  })

  it('a mira inteira é aria-hidden: é reforço visual, o HUD já fala em texto', () => {
    expect(montar({ guarda: true }).attributes('aria-hidden')).toBe('true')
  })
})
