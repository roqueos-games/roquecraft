import { describe, it, expect } from 'vitest'
import { useRoqueCraftIndicadores } from '../../src/composables/useRoqueCraftIndicadores.js'

// ⚠️ O DEFEITO QUE ISTO FECHA É DE SILÊNCIO, não de cálculo. `cargaDoArco` e
// `guardaLevantada` existiam, eram exportadas, tinham teste de unidade — e não
// chegavam na tela. O jogador puxava a corda no escuro, e a única prova de que
// a guarda estava de pé era levar pancada e não perder vida.

function montar(over = {}) {
  const v = {
    cargaDoGolpe: 1,
    critico: false,
    cargaDoArco: 0,
    arcoArmado: false,
    guardaLevantada: false,
    ...over,
  }
  const { estado, passo } = useRoqueCraftIndicadores({
    cargaDoGolpe: () => v.cargaDoGolpe,
    critico: () => v.critico,
    cargaDoArco: () => v.cargaDoArco,
    arcoArmado: () => v.arcoArmado,
    guardaLevantada: () => v.guardaLevantada,
  })
  return { estado, passo, v }
}

describe('useRoqueCraftIndicadores', () => {
  it('começa em repouso: golpe cheio, arco no chão, guarda baixa', () => {
    const { estado } = montar()
    expect(estado).toEqual({
      cargaDoGolpe: 1,
      critico: false,
      cargaDoArco: 0,
      arcoArmado: false,
      guarda: false,
    })
  })

  it('o passo traz o estado vivo — os cinco campos, não só os que já apareciam', () => {
    const c = montar()
    Object.assign(c.v, {
      cargaDoGolpe: 0.4,
      critico: true,
      arcoArmado: true,
      cargaDoArco: 0.75,
      guardaLevantada: true,
    })
    c.passo()
    expect(c.estado).toEqual({
      cargaDoGolpe: 0.4,
      critico: true,
      cargaDoArco: 0.75,
      arcoArmado: true,
      guarda: true,
    })
  })

  // ⚠️ ARMADO É PERGUNTA SEPARADA DA CARGA, e as duas bordas provam por quê.
  it('com o arco no chão a carga é ZERO, mesmo que o getter diga outra coisa', () => {
    const c = montar({ cargaDoArco: 0.9, arcoArmado: false })
    c.passo()
    expect(c.estado.arcoArmado).toBe(false)
    expect(c.estado.cargaDoArco, 'sobrou carga de um arco que não está na mão').toBe(0)
  })

  it('o arco recém-puxado JÁ aparece, com carga zero — senão a barra nasce atrasada', () => {
    const c = montar({ arcoArmado: true, cargaDoArco: 0 })
    c.passo()
    expect(c.estado.arcoArmado, 'a barra só apareceria depois do primeiro instante').toBe(true)
    expect(c.estado.cargaDoArco).toBe(0)
  })

  // ⚠️ ESCREVE SÓ QUANDO MUDA, e isto roda 60×/s. Escrever sempre renderizaria
  // o HUD sessenta vezes por segundo com o jogador parado e nada acontecendo.
  it('quadro sem novidade não escreve nada', () => {
    const c = montar({ arcoArmado: true, cargaDoArco: 0.5, guardaLevantada: true })
    c.passo()
    const escritas = []
    const espiado = new Proxy(c.estado, {})
    // Conta escrita de verdade: troca os campos por acessores que registram.
    const cru = { ...c.estado }
    for (const k of Object.keys(cru)) {
      Object.defineProperty(c.estado, k, {
        get: () => cru[k],
        set: (x) => {
          escritas.push(k)
          cru[k] = x
        },
        configurable: true,
      })
    }
    c.passo()
    c.passo()
    expect(escritas, `escreveu sem nada mudar: ${escritas.join(', ')}`).toEqual([])
    // E volta a escrever assim que muda de verdade.
    c.v.guardaLevantada = false
    c.passo()
    expect(escritas).toEqual(['guarda'])
    expect(espiado.guarda).toBe(false)
  })

  it('a guarda e o crítico chegam como BOOLEANO, venha o que vier do jogo', () => {
    const c = montar({ guardaLevantada: undefined, critico: null })
    c.passo()
    expect(c.estado.guarda).toBe(false)
    expect(c.estado.critico).toBe(false)
    c.v.guardaLevantada = 'sim'
    c.v.critico = 1
    c.passo()
    expect(c.estado.guarda).toBe(true)
    expect(c.estado.critico).toBe(true)
  })
})
