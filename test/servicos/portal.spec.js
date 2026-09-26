import { describe, it, expect } from 'vitest'
import {
  acharMoldura,
  molduraNoEixo,
  acender,
  apagar,
  ehPortal,
  idDoPortal,
  EIXOS,
  LARGURA_MINIMA,
  ALTURA_MINIMA,
  LADO_MAXIMO,
} from '../../src/servicos/portal.js'
import { AIR, ID } from '../../src/servicos/blocks.js'

// A MOLDURA DO PORTAL — reconhecer, acender e apagar.
//
// ⚠️ O QUE ESTE ARQUIVO PROTEGE É O "MEDIR NÃO É VERIFICAR". A busca acha os
// quatro limites andando por UMA linha e UMA coluna a partir do ponto aceso;
// com isso e mais nada, uma moldura com um buraco no meio do lado passa, e o
// portal sobra para fora da pedra. Os testes de buraco abaixo são o que
// impedem essa versão barata de voltar.

/** Mundo de mentira: um mapa esparso, ar em tudo que não foi escrito. */
function mundo(escrito = {}) {
  const m = new Map(Object.entries(escrito))
  const blocoEm = (x, y, z) => m.get(`${x},${y},${z}`) ?? AIR
  blocoEm.por = (x, y, z, id) => m.set(`${x},${y},${z}`, id)
  blocoEm.mapa = m
  return blocoEm
}

/**
 * Monta a moldura clássica no eixo X: vão de `largura` × `altura` com o canto
 * inferior interno em (x0, y0, z). Os quatro cantos ficam de fora de propósito
 * — é a moldura de dez peças que todo mundo conhece.
 */
function moldar(blocoEm, { x0 = 0, y0 = 10, z = 0, largura = 2, altura = 3, eixo = 'x' } = {}) {
  const dx = eixo === 'x' ? 1 : 0
  const dz = eixo === 'x' ? 0 : 1
  for (let i = 0; i < largura; i++) {
    blocoEm.por(x0 + dx * i, y0 - 1, z + dz * i, ID.obsidian)
    blocoEm.por(x0 + dx * i, y0 + altura, z + dz * i, ID.obsidian)
  }
  for (let j = 0; j < altura; j++) {
    blocoEm.por(x0 - dx, y0 + j, z - dz, ID.obsidian)
    blocoEm.por(x0 + dx * largura, y0 + j, z + dz * largura, ID.obsidian)
  }
  return { x0, y0, z, largura, altura, eixo }
}

describe('reconhecer a moldura', () => {
  it('acha a de dez peças a partir de qualquer ponto do vão', () => {
    const w = mundo()
    const m = moldar(w)
    for (let i = 0; i < m.largura; i++) {
      for (let j = 0; j < m.altura; j++) {
        const achada = acharMoldura(w, m.x0 + i, m.y0 + j, m.z)
        expect(achada, `ponto ${i},${j}`).not.toBeNull()
        expect(achada.largura).toBe(2)
        expect(achada.altura).toBe(3)
        expect(achada.eixo).toBe('x')
      }
    }
  })

  it('funciona nos dois eixos, e o eixo sai no id do bloco', () => {
    const wz = mundo()
    moldar(wz, { eixo: 'z' })
    expect(acharMoldura(wz, 0, 10, 0).eixo).toBe('z')
    expect(idDoPortal('z')).toBe(ID.netherPortalZ)
    expect(idDoPortal('x')).toBe(ID.netherPortalX)
    expect(ehPortal(ID.netherPortalX)).toBe(true)
    expect(ehPortal(ID.obsidian)).toBe(false)
  })

  it('não acha nada a partir de um ponto que não é vão', () => {
    const w = mundo()
    const m = moldar(w)
    // A própria obsidiana da base: é aqui que o jogador clica, e é por isso que
    // quem acende usa a célula do `place` e não a do alvo.
    expect(acharMoldura(w, m.x0, m.y0 - 1, m.z)).toBeNull()
  })

  it('recusa a moldura com UM buraco no lado — medir nao e verificar', () => {
    const w = mundo()
    const m = moldar(w, { altura: 4 })
    expect(acharMoldura(w, m.x0, m.y0, m.z)).not.toBeNull()
    w.por(m.x0 - 1, m.y0 + 2, m.z, AIR)
    expect(acharMoldura(w, m.x0, m.y0, m.z)).toBeNull()
  })

  it('recusa a moldura com UM buraco na base', () => {
    const w = mundo()
    const m = moldar(w, { largura: 3 })
    expect(acharMoldura(w, m.x0, m.y0, m.z)).not.toBeNull()
    w.por(m.x0 + 2, m.y0 - 1, m.z, AIR)
    expect(acharMoldura(w, m.x0, m.y0, m.z)).toBeNull()
  })

  it('recusa quando ha bloco DENTRO do vao', () => {
    const w = mundo()
    const m = moldar(w, { largura: 3, altura: 4 })
    w.por(m.x0 + 1, m.y0 + 1, m.z, ID.stone)
    expect(acharMoldura(w, m.x0, m.y0, m.z)).toBeNull()
  })

  it('recusa vao menor que o minimo', () => {
    const estreita = mundo()
    moldar(estreita, { largura: LARGURA_MINIMA - 1 })
    expect(acharMoldura(estreita, 0, 10, 0)).toBeNull()
    const baixa = mundo()
    moldar(baixa, { altura: ALTURA_MINIMA - 1 })
    expect(acharMoldura(baixa, 0, 10, 0)).toBeNull()
  })

  it('recusa vao maior que o maximo', () => {
    const w = mundo()
    moldar(w, { largura: LADO_MAXIMO + 1 })
    expect(acharMoldura(w, 0, 10, 0)).toBeNull()
  })

  it('o canto NAO precisa ser obsidiana — e a moldura do original', () => {
    const w = mundo()
    const m = moldar(w)
    const cantos = [
      [m.x0 - 1, m.y0 - 1],
      [m.x0 + m.largura, m.y0 - 1],
      [m.x0 - 1, m.y0 + m.altura],
      [m.x0 + m.largura, m.y0 + m.altura],
    ]
    for (const [cx, cy] of cantos) expect(w(cx, cy, m.z)).toBe(AIR)
    expect(acharMoldura(w, m.x0, m.y0, m.z)).not.toBeNull()
  })
})

describe('acender', () => {
  it('devolve uma celula por vao, com o id do eixo', () => {
    const w = mundo()
    const m = moldar(w, { largura: 3, altura: 4 })
    const celulas = acender(w, m.x0, m.y0, m.z)
    expect(celulas).toHaveLength(12)
    expect(new Set(celulas.map((c) => c.id))).toEqual(new Set([ID.netherPortalX]))
  })

  it('devolve VAZIO num portal ja aceso — nao gasta o isqueiro a toa', () => {
    const w = mundo()
    const m = moldar(w)
    for (const c of acender(w, m.x0, m.y0, m.z)) w.por(c.x, c.y, c.z, c.id)
    expect(acender(w, m.x0, m.y0, m.z)).toEqual([])
  })

  it('reacende so o buraco quando o vao perdeu uma celula', () => {
    const w = mundo()
    const m = moldar(w)
    for (const c of acender(w, m.x0, m.y0, m.z)) w.por(c.x, c.y, c.z, c.id)
    w.por(m.x0, m.y0 + 1, m.z, AIR)
    const celulas = acender(w, m.x0, m.y0, m.z)
    expect(celulas).toHaveLength(1)
    expect(celulas[0]).toMatchObject({ x: m.x0, y: m.y0 + 1, z: m.z })
  })

  it('sem moldura nao acende nada', () => {
    expect(acender(mundo(), 0, 10, 0)).toEqual([])
  })
})

describe('apagar quando a moldura quebra', () => {
  const aceso = (opcoes) => {
    const w = mundo()
    const m = moldar(w, opcoes)
    for (const c of acender(w, m.x0, m.y0, m.z)) w.por(c.x, c.y, c.z, c.id)
    return { w, m }
  }

  it('com a moldura inteira, nao apaga nada', () => {
    const { w, m } = aceso()
    expect(apagar(w, m.x0, m.y0, m.z)).toEqual([])
  })

  it('quebrando UMA obsidiana, o plano inteiro se apaga', () => {
    const { w, m } = aceso({ largura: 3, altura: 4 })
    w.por(m.x0 - 1, m.y0 + 1, m.z, AIR)
    const apagadas = apagar(w, m.x0, m.y0, m.z)
    expect(apagadas).toHaveLength(12)
    expect(new Set(apagadas.map((c) => c.id))).toEqual(new Set([AIR]))
  })

  it('nao apaga o que nao e portal', () => {
    const w = mundo()
    w.por(0, 10, 0, ID.stone)
    expect(apagar(w, 0, 10, 0)).toEqual([])
  })

  it('segue por LIGACAO: alcanca a celula do outro canto do vao', () => {
    const { w, m } = aceso({ largura: 4, altura: 5 })
    w.por(m.x0, m.y0 - 1, m.z, AIR)
    const apagadas = apagar(w, m.x0, m.y0, m.z)
    const chaves = new Set(apagadas.map((c) => `${c.x},${c.y},${c.z}`))
    expect(chaves.has(`${m.x0 + 3},${m.y0 + 4},${m.z}`)).toBe(true)
  })
})

describe('molduraNoEixo', () => {
  it('recusa o eixo errado de uma moldura valida no outro', () => {
    const w = mundo()
    const m = moldar(w, { eixo: 'x' })
    expect(molduraNoEixo(w, m.x0, m.y0, m.z, EIXOS[1])).toBeNull()
    expect(molduraNoEixo(w, m.x0, m.y0, m.z, EIXOS[0])).not.toBeNull()
  })
})
