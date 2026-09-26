import { describe, it, expect } from 'vitest'
import {
  GOLPES_POR_SEGUNDO,
  CARGA_MINIMA_DE_CRITICO,
  recargaDe,
  cargaDe,
  multiplicadorDeCarga,
  ehCritico,
  danoDoGolpe,
  resolverGolpe,
} from '../../src/servicos/combate.js'

// O combate era um número só: recarga de 0,42 s pra qualquer coisa e dano
// chapado. Estes testes existem pra travar as três regras que dão forma ao
// golpe - ritmo por arma, punição por pressa e prêmio por precisão - e pra
// provar a ORDEM em que elas se compõem, que é onde dá pra errar sem perceber.

describe('combate - ritmo por arma', () => {
  it('cada arma tem seu tempo de recarga, e a espada é a mais rápida das armas', () => {
    expect(recargaDe('sword')).toBeCloseTo(0.625, 5)
    expect(recargaDe('pickaxe')).toBeCloseTo(1 / 1.2, 5)
    expect(recargaDe('axe')).toBeCloseTo(1, 5)
    expect(recargaDe('shovel')).toBeCloseTo(1, 5)
    // Machado bate mais devagar que espada: é o que faz a escolha ser estilo,
    // não só aritmética. Se este teste inverter, o combate perdeu o desenho.
    expect(recargaDe('axe')).toBeGreaterThan(recargaDe('sword'))
  })

  it('mão vazia e item sem categoria caem no mesmo ritmo, não em recarga infinita', () => {
    expect(recargaDe('mao')).toBeCloseTo(0.25, 5)
    expect(recargaDe(undefined)).toBeCloseTo(0.25, 5)
    expect(recargaDe('inventadoAgora')).toBeCloseTo(0.25, 5)
    expect(Number.isFinite(recargaDe(null))).toBe(true)
  })

  it('a mão é mais rápida que a espada, e é por isso que ela não vence', () => {
    // 4 golpes/s contra 1,6 - mas o dano por golpe é que separa os dois. Se a
    // mão ficasse mais LENTA que a espada, ela seria pior em tudo e a curva de
    // carga não teria o que ensinar.
    expect(GOLPES_POR_SEGUNDO.mao).toBeGreaterThan(GOLPES_POR_SEGUNDO.sword)
  })
})

describe('combate - a carga do golpe', () => {
  it('recém-atacado é 0, recarga cheia é 1', () => {
    expect(cargaDe(0.625, 0.625)).toBe(0)
    expect(cargaDe(0, 0.625)).toBe(1)
    expect(cargaDe(0.3125, 0.625)).toBeCloseTo(0.5, 5)
  })

  it('não vaza fora de 0..1 nem com entrada absurda', () => {
    expect(cargaDe(-5, 0.625)).toBe(1)
    expect(cargaDe(999, 0.625)).toBe(0)
    // Recarga zero é arma sempre pronta, não NaN.
    expect(cargaDe(0, 0)).toBe(1)
    expect(Number.isNaN(cargaDe(1, 0))).toBe(false)
  })

  it('a curva é QUADRÁTICA, não linear - meia carga dá 40%, não 60%', () => {
    expect(multiplicadorDeCarga(0)).toBeCloseTo(0.2, 5)
    expect(multiplicadorDeCarga(1)).toBeCloseTo(1, 5)
    // A prova de que não é linear: linear daria 0.6 na metade.
    expect(multiplicadorDeCarga(0.5)).toBeCloseTo(0.4, 5)
    expect(multiplicadorDeCarga(0.5)).toBeLessThan(0.6)
  })

  it('a curva é monótona: esperar mais nunca dói menos', () => {
    // Varre em vez de espiar dois pontos - uma curva com um vale no meio
    // passaria num teste de extremos e ensinaria o jogador a martelar.
    let anterior = -1
    for (let i = 0; i <= 40; i++) {
      const m = multiplicadorDeCarga(i / 40)
      expect(m).toBeGreaterThanOrEqual(anterior)
      anterior = m
    }
  })

  it('martelar o botão custa 5x o dano de esperar', () => {
    expect(multiplicadorDeCarga(1) / multiplicadorDeCarga(0)).toBeCloseTo(5, 5)
  })
})

describe('combate - crítico', () => {
  const caindoLimpo = {
    carga: 1,
    vy: -3,
    noChao: false,
    correndo: false,
    naAgua: false,
    escalando: false,
  }

  it('caindo, no ar, carregado e sem correr: crítico', () => {
    expect(ehCritico(caindoLimpo)).toBe(true)
  })

  it('cada condição sozinha derruba o crítico', () => {
    expect(ehCritico({ ...caindoLimpo, vy: 3 }), 'subindo não critica').toBe(false)
    expect(ehCritico({ ...caindoLimpo, vy: 0 }), 'parado não critica').toBe(false)
    expect(ehCritico({ ...caindoLimpo, noChao: true }), 'no chão não critica').toBe(false)
    expect(ehCritico({ ...caindoLimpo, correndo: true }), 'correndo não critica').toBe(false)
    expect(ehCritico({ ...caindoLimpo, naAgua: true }), 'na água não critica').toBe(false)
    expect(ehCritico({ ...caindoLimpo, escalando: true }), 'escalando não critica').toBe(false)
  })

  it('o limiar de carga é 84,8%, e ele morde', () => {
    expect(ehCritico({ ...caindoLimpo, carga: CARGA_MINIMA_DE_CRITICO })).toBe(true)
    expect(ehCritico({ ...caindoLimpo, carga: CARGA_MINIMA_DE_CRITICO - 0.001 })).toBe(false)
    // Pular e martelar o botão NÃO dá crítico - é o buraco que o limiar fecha.
    expect(ehCritico({ ...caindoLimpo, carga: 0.2 })).toBe(false)
  })

  it('sem argumento nenhum não critica (o padrão é o jogador em pé)', () => {
    expect(ehCritico()).toBe(false)
    expect(ehCritico({})).toBe(false)
  })
})

describe('combate - o dano final, e a ordem em que as regras se compõem', () => {
  it('carga cheia sem crítico é o dano base', () => {
    expect(danoDoGolpe({ base: 7, carga: 1, critico: false })).toBeCloseTo(7, 5)
  })

  it('crítico multiplica o dano JÁ reduzido pela carga, não o base', () => {
    // Esta é a ordem que importa. Com base 7 e carga 0 (martelado):
    //   certo:  7 * 0.2 * 1.5 = 2.1
    //   errado: 7 * 1.5 * 0.2 é o mesmo número aqui, mas a diferença aparece
    //   quando alguém "otimiza" aplicando o crítico sobre o base cheio: 10.5.
    expect(danoDoGolpe({ base: 7, carga: 0, critico: true })).toBeCloseTo(2.1, 5)
    expect(danoDoGolpe({ base: 7, carga: 0, critico: true })).toBeLessThan(7)
  })

  it('um golpe martelado com crítico dói MENOS que um golpe carregado sem crítico', () => {
    // É a frase inteira da mecânica em um assert: precisão vence pressa mesmo
    // quando a pressa vem com prêmio.
    const martelado = danoDoGolpe({ base: 7, carga: 0.1, critico: true })
    const carregado = danoDoGolpe({ base: 7, carga: 1, critico: false })
    expect(martelado).toBeLessThan(carregado)
  })
})

describe('combate - resolverGolpe monta tudo na ordem certa', () => {
  it('espada carregada, caindo: crítico e dano cheio vezes 1,5', () => {
    const r = resolverGolpe({ base: 7, restante: 0, total: 0.625, vy: -4, noChao: false })
    expect(r.carga).toBe(1)
    expect(r.critico).toBe(true)
    expect(r.dano).toBeCloseTo(10.5, 5)
    expect(r.empurraoExtra).toBe(0)
  })

  it('correndo: empurrão extra e nada de crítico, mesmo caindo carregado', () => {
    const r = resolverGolpe({
      base: 7,
      restante: 0,
      total: 0.625,
      vy: -4,
      noChao: false,
      correndo: true,
    })
    expect(r.critico).toBe(false)
    expect(r.dano).toBeCloseTo(7, 5)
    expect(r.empurraoExtra).toBeGreaterThan(0)
  })

  it('martelando no chão: 20% do dano e sem empurrão extra', () => {
    const r = resolverGolpe({ base: 7, restante: 0.625, total: 0.625 })
    expect(r.carga).toBe(0)
    expect(r.critico).toBe(false)
    expect(r.dano).toBeCloseTo(1.4, 5)
    expect(r.empurraoExtra).toBe(0)
  })

  it('devolve carga e crítico pra interface poder mostrar', () => {
    // Sem retorno visível, um golpe de 20% lê como travamento, não como
    // mecânica. Por isso `resolverGolpe` entrega os dois, e não só o dano.
    const r = resolverGolpe({ base: 4, restante: 0.3, total: 0.625 })
    expect(r).toHaveProperty('carga')
    expect(r).toHaveProperty('critico')
    expect(r.carga).toBeGreaterThan(0)
    expect(r.carga).toBeLessThan(1)
  })
})

describe('combate — a curva da carga e os padrões do crítico', () => {
  it('a carga é somada à base, não subtraída dela', () => {
    // `0.2 + 0.8 * c * c`. Virando `-`, a carga cheia dá multiplicador
    // -0,6: o golpe passa a CURAR quem levou. E o golpe sem carga nenhuma
    // continua dando 0,2 nos dois — por isso o teste tem que ser na carga alta.
    expect(multiplicadorDeCarga(0)).toBeCloseTo(0.2, 10)
    expect(multiplicadorDeCarga(1)).toBeCloseTo(1, 10)
    expect(multiplicadorDeCarga(0.5)).toBeCloseTo(0.4, 10)
  })

  it('carga fora de 0..1 é presa na faixa', () => {
    expect(multiplicadorDeCarga(-5)).toBeCloseTo(0.2, 10)
    expect(multiplicadorDeCarga(9)).toBeCloseTo(1, 10)
  })

  it('sem dizer nada, o jogador está NO CHÃO — e no chão não há crítico', () => {
    // ⚠️ `noChao = true` como padrão. Virando `false`, um golpe que não informa
    // o estado do chão passa a ser tratado como golpe no ar: chamado sem esse
    // dado, `ehCritico` e `resolverGolpe` dariam crítico de graça.
    expect(ehCritico({ carga: 1, vy: -5 })).toBe(false)
    expect(ehCritico({ carga: 1, vy: -5, noChao: false })).toBe(true)

    const semInformar = resolverGolpe({ base: 4, restante: 0, total: 0.25, vy: -5 })
    expect(semInformar.critico).toBe(false)

    const noAr = resolverGolpe({ base: 4, restante: 0, total: 0.25, vy: -5, noChao: false })
    expect(noAr.critico).toBe(true)
  })

  it('o crítico exige TODAS as condições ao mesmo tempo', () => {
    const noAr = { carga: 1, vy: -5, noChao: false }
    expect(ehCritico(noAr)).toBe(true)
    expect(ehCritico({ ...noAr, correndo: true })).toBe(false)
    expect(ehCritico({ ...noAr, naAgua: true })).toBe(false)
    expect(ehCritico({ ...noAr, escalando: true })).toBe(false)
    expect(ehCritico({ ...noAr, vy: 5 })).toBe(false)
    expect(ehCritico({ ...noAr, carga: CARGA_MINIMA_DE_CRITICO - 0.01 })).toBe(false)
    expect(ehCritico({ ...noAr, carga: CARGA_MINIMA_DE_CRITICO })).toBe(true)
  })
})
