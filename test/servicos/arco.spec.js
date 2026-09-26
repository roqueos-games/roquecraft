import { describe, it, expect } from 'vitest'
import {
  TEMPO_DE_CARGA,
  CARGA_MINIMA,
  DANO_MINIMO,
  DANO_MAXIMO,
  VELOCIDADE_MAXIMA,
  criarArco,
  armar,
  soltar,
  cargaDe,
  danoDe,
  velocidadeDe,
  flechaDoJogador,
  criaturaAtingida,
} from '../../src/servicos/arco.js'
import { ITEMS } from '../../src/servicos/items.js'
import { RECIPES } from '../../src/servicos/recipes.js'
import { usarItemNaMao } from '../../src/servicos/usoDeFerramenta.js'
import { passoDaFlecha } from '../../src/servicos/flechas.js'

// O ARCO DO JOGADOR — Goal 21, 3.2. Segurar carrega, soltar atira; o dano
// e a velocidade saem da carga; um toque curto não gasta flecha.

describe('a carga', () => {
  it('sobe com o tempo segurado até 1 em TEMPO_DE_CARGA, e não passa disso', () => {
    expect(cargaDe(0)).toBe(0)
    expect(cargaDe(TEMPO_DE_CARGA / 2)).toBeCloseTo(0.5, 6)
    expect(cargaDe(TEMPO_DE_CARGA)).toBe(1)
    expect(cargaDe(TEMPO_DE_CARGA * 3)).toBe(1)
  })

  it('armar é idempotente; soltar devolve a carga e desarma; toque curto devolve null', () => {
    const a = criarArco()
    armar(a, 10)
    armar(a, 10.5) // não reinicia
    expect(a.armadoEm).toBe(10)
    expect(soltar(a, 10.5)).toBeCloseTo(0.5, 6)
    expect(a.armadoEm).toBeNull()
    expect(soltar(a, 11), 'sem armar, nada').toBeNull()
    armar(a, 20)
    expect(soltar(a, 20 + CARGA_MINIMA * TEMPO_DE_CARGA * 0.5), 'toque curto').toBeNull()
    expect(a.armadoEm, 'e mesmo assim desarma').toBeNull()
  })

  it('o dano vai de 1 a 9 e a velocidade cresce com a carga', () => {
    expect(danoDe(0)).toBe(DANO_MINIMO)
    expect(danoDe(1)).toBe(DANO_MAXIMO)
    expect(danoDe(0.5)).toBe(5)
    expect(velocidadeDe(1)).toBe(VELOCIDADE_MAXIMA)
    expect(velocidadeDe(0)).toBeLessThan(velocidadeDe(1))
  })
})

describe('a flecha do jogador', () => {
  it('sai da mão, na direção do olhar, com o dano da carga, e é do jogador', () => {
    const f = flechaDoJogador('f1', { x: 10, y: 64, z: 10 }, { x: 0, y: 0, z: -1 }, 1)
    expect(f.dono).toBe('jogador')
    expect(f.dano).toBe(DANO_MAXIMO)
    expect(f.vz).toBeCloseTo(-VELOCIDADE_MAXIMA, 6)
    expect(f.vx).toBe(0)
    expect(f.y).toBeGreaterThan(64)
    expect(f.z).toBeLessThan(10)
  })

  it('voa pelo passo comum e cai com a gravidade', () => {
    const f = flechaDoJogador('f1', { x: 0, y: 64, z: 0 }, { x: 0, y: 0, z: -1 }, 1)
    const y0 = f.y
    for (let i = 0; i < 30; i++)
      expect(passoDaFlecha(f, 1 / 60, { solidAt: () => 0 })).toBe('voando')
    expect(f.z).toBeLessThan(-10)
    expect(f.y).toBeLessThan(y0)
  })

  it('acha a criatura mais perto dentro do raio, pelo MEIO do corpo dela', () => {
    const f = { x: 5, y: 65.45, z: 5 }
    const porco = { x: 5.3, y: 65, z: 5, type: 'pig' } // 0,9 de altura: meio em 65,45
    const longe = { x: 9, y: 65, z: 5, type: 'pig' }
    const altura = () => 0.9
    expect(criaturaAtingida(f, [longe, porco], 0.65, altura)).toBe(porco)
    expect(criaturaAtingida(f, [longe], 0.65, altura)).toBeNull()
    // Com o ponto fixo a 0,9 do pé (o padrão de 1,8 de altura), a flecha
    // rasteira passa por baixo do porco: é o caso que a sonda pegou.
    expect(criaturaAtingida({ x: 5, y: 65.2, z: 5 }, [porco], 0.65)).toBeNull()
    expect(criaturaAtingida({ x: 5, y: 65.2, z: 5 }, [porco], 0.65, altura)).toBe(porco)
  })
})

describe('o item e o gesto', () => {
  it('arco e flecha são itens com nome e receita', () => {
    expect(ITEMS.bow).toMatchObject({ kind: 'tool', stack: 1, durability: 384 })
    expect(ITEMS.bow.tool.kind).toBe('bow')
    expect(ITEMS.arrow).toMatchObject({ kind: 'material', stack: 64 })
    expect(RECIPES.find((r) => r.result === 'bow').keyMap).toEqual({ S: 'stick', C: 'string' })
    expect(RECIPES.find((r) => r.result === 'arrow')).toMatchObject({ count: 4 })
  })

  it('apertar com o arco na mão ARMA e não coloca bloco', () => {
    const chamadas = []
    const ctx = { armarArco: () => (chamadas.push('armar'), true) }
    expect(usarItemNaMao(ITEMS.bow, 'bow', { alvo: null, liquido: null }, ctx)).toBe(true)
    expect(chamadas).toEqual(['armar'])
    expect(
      usarItemNaMao(ITEMS.stone ?? { kind: 'block' }, 'stone', { alvo: null }, ctx),
      'bloco segue',
    ).toBeNull()
  })
})
