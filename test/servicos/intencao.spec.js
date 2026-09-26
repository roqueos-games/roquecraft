import { describe, it, expect } from 'vitest'
import {
  golpeAceito,
  DANO_MAXIMO_DO_GOLPE,
  ALCANCE_DO_GOLPE_REMOTO,
} from '../../src/servicos/intencao.js'
import { ALCANCE } from '../../src/servicos/mira.js'

// A intenção de golpe validada pelo anfitrião (Goal 21, Onda 6.4). O banco já
// exige membro e dano ≤ 40; o alcance só o anfitrião conhece.

const em = (x, y, z) => ({ x, y, z })

describe('intencao - golpe remoto', () => {
  it('o teto de dano coincide com a regra do banco, e o alcance é o criativo com folga', () => {
    expect(DANO_MAXIMO_DO_GOLPE).toBe(40)
    expect(ALCANCE_DO_GOLPE_REMOTO).toBeGreaterThan(ALCANCE.creative)
    expect(ALCANCE_DO_GOLPE_REMOTO).toBeLessThanOrEqual(ALCANCE.creative + 3)
  })

  it('aceita o golpe de perto, com dano possível', () => {
    expect(golpeAceito({ dano: 7, atacante: em(0, 64, 0), alvo: em(2, 64, 1) })).toEqual({
      ok: true,
      motivo: null,
    })
  })

  it('recusa dano inválido, zero, negativo ou acima do teto', () => {
    const perto = { atacante: em(0, 0, 0), alvo: em(1, 0, 0) }
    expect(golpeAceito({ dano: 0, ...perto }).motivo).toBe('dano')
    expect(golpeAceito({ dano: -3, ...perto }).motivo).toBe('dano')
    expect(golpeAceito({ dano: NaN, ...perto }).motivo).toBe('dano')
    expect(golpeAceito({ dano: DANO_MAXIMO_DO_GOLPE, ...perto }).ok).toBe(true)
    expect(golpeAceito({ dano: DANO_MAXIMO_DO_GOLPE + 0.5, ...perto }).motivo).toBe('dano')
  })

  it('recusa alvo que não existe e atacante sem posição', () => {
    expect(golpeAceito({ dano: 1, atacante: em(0, 0, 0), alvo: null }).motivo).toBe('alvo')
    expect(golpeAceito({ dano: 1, atacante: null, alvo: em(0, 0, 0) }).motivo).toBe('atacante')
    expect(
      golpeAceito({ dano: 1, atacante: { x: NaN, y: 0, z: 0 }, alvo: em(0, 0, 0) }).motivo,
    ).toBe('atacante')
  })

  it('recusa de longe: um fio além do alcance', () => {
    const alvo = em(0, 64, 0)
    expect(golpeAceito({ dano: 1, atacante: em(ALCANCE_DO_GOLPE_REMOTO, 64, 0), alvo }).ok).toBe(
      true,
    )
    expect(
      golpeAceito({ dano: 1, atacante: em(ALCANCE_DO_GOLPE_REMOTO + 0.01, 64, 0), alvo }).motivo,
    ).toBe('alcance')
    // A altura conta: golpe do alto da montanha não é golpe.
    expect(golpeAceito({ dano: 1, atacante: em(0, 64 + 30, 0), alvo }).motivo).toBe('alcance')
  })
})
