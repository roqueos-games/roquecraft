import { describe, it, expect } from 'vitest'
import {
  paletaDaDimensao,
  rigDaDimensao,
  temCeu,
  PALETA_DO_NETHER,
  RIG_DO_NETHER,
} from '../../src/servicos/ceuDaDimensao.js'
import { skyPalette, lightRig, TICKS_PER_DAY } from '../../src/servicos/daycycle.js'

// O CÉU DE CADA DIMENSÃO.
//
// ⚠️ O QUE ESTE ARQUIVO PROTEGE É O RELÓGIO NÃO VAZAR. A paleta e o aparelho de
// luz do overworld são função de `ticks`; debaixo de um teto de bedrock isso
// faria a MESMA cena ficar mais clara ou mais escura conforme a hora de um dia
// que não existe ali — o Nether mudando de humor sozinho, sem nada no mundo ter
// mudado. Comparar duas horas distantes é o único jeito de provar que não vaza.

const MEIO_DIA = Math.floor((TICKS_PER_DAY ?? 24000) * 0.25)
const MEIA_NOITE = Math.floor((TICKS_PER_DAY ?? 24000) * 0.75)

describe('o overworld continua sendo o overworld', () => {
  it('a paleta e a mesma de `daycycle`, hora a hora', () => {
    for (const t of [0, MEIO_DIA, MEIA_NOITE]) {
      expect(paletaDaDimensao('overworld', t)).toEqual(skyPalette(t))
    }
  })

  it('o aparelho de luz e o mesmo de `daycycle`', () => {
    expect(rigDaDimensao('overworld', MEIO_DIA)).toEqual(lightRig(MEIO_DIA))
  })

  it('e ele MUDA com a hora — se nao mudasse, o teste do Nether nao provaria nada', () => {
    expect(paletaDaDimensao('overworld', MEIO_DIA)).not.toEqual(
      paletaDaDimensao('overworld', MEIA_NOITE),
    )
  })
})

describe('o Nether nao tem relogio', () => {
  it('a paleta e a mesma ao meio-dia e a meia-noite', () => {
    expect(paletaDaDimensao('nether', MEIO_DIA)).toEqual(paletaDaDimensao('nether', MEIA_NOITE))
    expect(paletaDaDimensao('nether', 0)).toEqual(PALETA_DO_NETHER)
  })

  it('o aparelho de luz tambem nao se mexe com a hora', () => {
    expect(rigDaDimensao('nether', MEIO_DIA)).toEqual(rigDaDimensao('nether', MEIA_NOITE))
  })

  it('nao ha estrela atraves de um teto de bedrock', () => {
    expect(rigDaDimensao('nether', MEIA_NOITE).stars).toBe(0)
  })

  it('o zenite e mais ESCURO que o horizonte: em cima e rocha, nao abobada', () => {
    const { zenith, horizon } = PALETA_DO_NETHER
    const soma = (c) => c[0] + c[1] + c[2]
    expect(soma(zenith)).toBeLessThan(soma(horizon))
  })

  it('a nevoa e vermelha: o vermelho domina os outros dois canais', () => {
    const [r, g, b] = PALETA_DO_NETHER.fog
    expect(r).toBeGreaterThan(g * 2)
    expect(r).toBeGreaterThan(b * 2)
  })

  it('a nevoa e mais densa que a do overworld: e ela que fecha o salao', () => {
    expect(RIG_DO_NETHER.fogDensity).toBeGreaterThan(lightRig(MEIO_DIA).fogDensity)
  })

  it('a direcional e fraca: forte demais devolveria sombra de sol debaixo da terra', () => {
    expect(RIG_DO_NETHER.directional.intensity).toBeLessThan(
      lightRig(MEIO_DIA).directional.intensity / 2,
    )
  })
})

describe('o rig do Nether e CÓPIA, nao a constante', () => {
  it('mexer no vetor de um quadro nao contamina o proximo', () => {
    const a = rigDaDimensao('nether', 0)
    a.directional.dir.x = 999
    a.intensity = -1
    const b = rigDaDimensao('nether', 0)
    expect(b.directional.dir.x).toBe(RIG_DO_NETHER.directional.dir.x)
    expect(RIG_DO_NETHER.directional.dir.x).not.toBe(999)
  })
})

describe('temCeu', () => {
  it('sai do registro de dimensoes, nao de uma lista aqui', () => {
    expect(temCeu('overworld')).toBe(true)
    expect(temCeu('nether')).toBe(false)
  })
})

describe('o Fim', () => {
  it('tem paleta e aparelho próprios, com estrela (não há teto) e sem sol', async () => {
    const { paletaDaDimensao, rigDaDimensao, PALETA_DO_FIM, RIG_DO_FIM } = await import(
      '../../src/servicos/ceuDaDimensao.js'
    )
    expect(paletaDaDimensao('end', 0)).toBe(PALETA_DO_FIM)
    expect(paletaDaDimensao('end', 6000)).toBe(PALETA_DO_FIM)
    const rig = rigDaDimensao('end', 0)
    expect(rig.stars).toBe(1)
    expect(rig.directional.intensity).toBeLessThan(0.7)
    // CÓPIA de três níveis: mexer no vetor devolvido não mexe na constante.
    rig.directional.dir.x = 99
    expect(RIG_DO_FIM.directional.dir.x).not.toBe(99)
    // E o zênite é ESCURO: é noite eterna, não caverna.
    expect(PALETA_DO_FIM.zenith[0]).toBeLessThan(0.05)
  })
})
