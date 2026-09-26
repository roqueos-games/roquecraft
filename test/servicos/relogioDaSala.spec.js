import { describe, it, expect } from 'vitest'
import {
  desvioDoRelogio,
  precisaAcertar,
  normalizarRelogio,
  PASSO_DO_RELOGIO,
  TOLERANCIA_DO_RELOGIO,
} from '../../src/servicos/relogioDaSala.js'
import { TICKS_PER_DAY, TICKS_PER_SECOND } from '../../src/servicos/daycycle.js'

// O relógio da sala (Goal 21, Onda 6.1). Cada cliente avançava o próprio tempo
// e o clima é função de (semente, ticks): na mesma sala, horas e chuvas
// diferentes. O anfitrião passa a mandar; aqui é a regra pura do acerto.

describe('relogioDaSala', () => {
  it('a tolerância é maior que a latência que uma publicação carrega', () => {
    // 2 s de passo + ~0,2 s de rede = 44 ticks de idade máxima da mensagem,
    // mas o convidado avança sozinho nesse meio tempo; o que sobra é a latência.
    expect(TOLERANCIA_DO_RELOGIO).toBeGreaterThan(0.5 * TICKS_PER_SECOND)
    expect(TOLERANCIA_DO_RELOGIO).toBeLessThan(PASSO_DO_RELOGIO * TICKS_PER_SECOND * 2)
  })

  it('o desvio é circular: a virada do dia não conta como um dia', () => {
    expect(desvioDoRelogio(1000, 1030)).toBe(30)
    expect(desvioDoRelogio(1030, 1000)).toBe(-30)
    expect(desvioDoRelogio(TICKS_PER_DAY - 10, 10)).toBe(20)
    expect(desvioDoRelogio(10, TICKS_PER_DAY - 10)).toBe(-20)
    expect(desvioDoRelogio(0, TICKS_PER_DAY / 2)).toBe(TICKS_PER_DAY / 2)
  })

  it('acerta só além da tolerância, e nunca com número inválido', () => {
    expect(precisaAcertar(1000, 1000 + TOLERANCIA_DO_RELOGIO)).toBe(false)
    expect(precisaAcertar(1000, 1000 + TOLERANCIA_DO_RELOGIO + 1)).toBe(true)
    expect(precisaAcertar(1000, 1000 - TOLERANCIA_DO_RELOGIO - 1)).toBe(true)
    expect(precisaAcertar(TICKS_PER_DAY - 5, 5)).toBe(false)
    expect(precisaAcertar(NaN, 5)).toBe(false)
    expect(precisaAcertar(5, undefined)).toBe(false)
    expect(precisaAcertar(0, 10, 5)).toBe(true)
  })

  it('normaliza o que vem do banco e recusa o que não tem forma', () => {
    expect(normalizarRelogio(null)).toBe(null)
    expect(normalizarRelogio('x')).toBe(null)
    expect(normalizarRelogio({ chuva: 1 })).toBe(null)
    expect(normalizarRelogio({ ticks: 'abc' })).toBe(null)
    expect(normalizarRelogio({ ticks: 500 })).toEqual({ ticks: 500, chuva: null })
    expect(normalizarRelogio({ ticks: TICKS_PER_DAY + 7, chuva: 0.4 })).toEqual({
      ticks: 7,
      chuva: 0.4,
    })
    expect(normalizarRelogio({ ticks: -1, chuva: 9 })).toEqual({
      ticks: TICKS_PER_DAY - 1,
      chuva: 1,
    })
    expect(normalizarRelogio({ ticks: 1, chuva: 'não' })).toEqual({ ticks: 1, chuva: null })
  })
})
