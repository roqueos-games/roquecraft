import { describe, it, expect } from 'vitest'
import {
  FACE,
  camadasDoBloco,
  camadasParaIcones,
  completarIcones,
  montarIcones,
  ICONE_DE_ULTIMO_RECURSO,
} from '../../src/servicos/icones.js'
import { BLOCKS, FACE_LAYERS } from '../../src/servicos/blocks.js'
import { ITEMS } from '../../src/servicos/items.js'
import { FALLBACK_ICON } from '../../src/servicos/aparencia.js'

// ⚠️ O QUE ESTE ARQUIVO SEGURA: nenhum slot desenhado quebrado.
//
// Um item com icone `undefined` nao aparece vazio, aparece ERRADO -- e o jogador
// nao consegue distinguir "nao tenho" de "tenho e o jogo nao sabe mostrar".
//
// A segunda coisa que ele segura e mais silenciosa: a ordem das faces. Se o
// icone do inventario usar uma camada diferente da que o mesher escreve no
// mundo, o bloco que se ve no slot deixa de ser o bloco que se coloca, e isso so
// aparece no olho de quem joga.

describe('FACE: a ordem do atlas nao e arbitraria', () => {
  it('e a mesma ordem que o mundo usa: +x, -x, +y, -y, +z, -z', () => {
    expect([FACE.LESTE, FACE.OESTE, FACE.TOPO, FACE.BASE, FACE.SUL, FACE.NORTE]).toEqual([
      0, 1, 2, 3, 4, 5,
    ])
  })

  it('o topo do icone e o MESMO indice que o mesher chama de topo', () => {
    // `mesher.js` le `FACE_LAYERS[id * 6 + 2]` para a face de cima de um bloco
    // isolado. Se este numero divergir, o icone mente sobre o bloco.
    const grama = BLOCKS[Object.keys(BLOCKS).find((k) => BLOCKS[k].key === 'grassBlock')]
    const tabela = camadasParaIcones(BLOCKS, FACE_LAYERS)
    expect(tabela.grassBlock.top).toBe(FACE_LAYERS[grama.id * 6 + 2])
  })
})

describe('camadasDoBloco: as seis faces do cubo da mao', () => {
  it('devolve seis camadas, em ordem, a partir do id', () => {
    const fake = Array.from({ length: 60 }, (_, i) => i * 10)
    expect(camadasDoBloco(3, fake)).toEqual([180, 190, 200, 210, 220, 230])
  })

  it('a face de topo bate com a que a tabela de icones escolhe', () => {
    const fake = Array.from({ length: 60 }, (_, i) => i)
    const blocos = { pedra: { key: 'pedra', id: 4 } }
    expect(camadasDoBloco(4, fake)[FACE.TOPO]).toBe(camadasParaIcones(blocos, fake).pedra.top)
  })
})

describe('camadasParaIcones: um par (topo, lado) por bloco', () => {
  it('a tabela e indexada por KEY, que e o que o icone sabe pedir', () => {
    const fake = Array.from({ length: 60 }, (_, i) => i)
    const blocos = { 1: { key: 'terra', id: 1 }, 2: { key: 'areia', id: 2 } }
    expect(camadasParaIcones(blocos, fake)).toEqual({
      terra: { top: 8, side: 6 },
      areia: { top: 14, side: 12 },
    })
  })

  it('cobre TODOS os blocos do jogo, sem buraco', () => {
    const tabela = camadasParaIcones(BLOCKS, FACE_LAYERS)
    for (const b of Object.values(BLOCKS)) {
      expect(tabela[b.key], `bloco ${b.key} ficou sem camadas`).toBeTruthy()
      expect(Number.isFinite(tabela[b.key].top), `topo de ${b.key}`).toBe(true)
      expect(Number.isFinite(tabela[b.key].side), `lado de ${b.key}`).toBe(true)
    }
  })
})

describe('completarIcones: nenhum item fica sem desenho', () => {
  const DEFS = {
    stick: { key: 'stick', kind: 'material' },
    coal: { key: 'coal', kind: 'material' },
    orfao: { key: 'orfao', kind: 'material' },
    dirt: { key: 'dirt', kind: 'block' },
  }

  it('bloco e item ja desenhados passam intactos', () => {
    const r = completarIcones({
      blocos: { dirt: 'D' },
      itens: { stick: 'S' },
      definicoes: DEFS,
      emprestimo: {},
    })
    expect(r.dirt).toBe('D')
    expect(r.stick).toBe('S')
  })

  it('item sem sprite pega emprestado o bloco declarado', () => {
    const r = completarIcones({
      blocos: { oakPlanks: 'TABUA', stone: 'PEDRA' },
      itens: {},
      definicoes: DEFS,
      emprestimo: { stick: 'oakPlanks' },
    })
    expect(r.stick).toBe('TABUA')
  })

  it('item sem sprite E sem emprestimo cai na pedra', () => {
    const r = completarIcones({
      blocos: { stone: 'PEDRA' },
      itens: {},
      definicoes: DEFS,
      emprestimo: {},
    })
    expect(r.orfao).toBe('PEDRA')
    expect(ICONE_DE_ULTIMO_RECURSO).toBe('stone')
  })

  it('bloco NUNCA recebe emprestimo: ele ja e o proprio desenho', () => {
    // Um bloco sem icone e um atlas quebrado; dar pedra a ele esconderia isso e
    // encheria o inventario de pedras identicas.
    const r = completarIcones({ blocos: {}, itens: {}, definicoes: DEFS, emprestimo: {} })
    expect('dirt' in r).toBe(false)
  })

  it('sem NENHUM icone gerado, a resposta e null e nunca undefined', () => {
    // `null` diz "tentamos e nao ha"; `undefined` seria um item que ninguem
    // lembrou de considerar. A diferenca aparece na hora de depurar um atlas.
    const r = completarIcones({ blocos: {}, itens: {}, definicoes: DEFS, emprestimo: {} })
    expect(r.stick).toBe(null)
    expect(r.orfao).toBe(null)
  })

  it('o item vence o bloco de mesmo nome: sprite propria manda', () => {
    const r = completarIcones({
      blocos: { stick: 'CUBO' },
      itens: { stick: 'SPRITE' },
      definicoes: DEFS,
      emprestimo: {},
    })
    expect(r.stick).toBe('SPRITE')
  })

  it('no jogo de verdade, todo item nao-bloco sai com desenho', () => {
    const blocos = {}
    for (const b of Object.values(BLOCKS)) blocos[b.key] = `cubo:${b.key}`
    const r = completarIcones({ blocos, itens: {}, definicoes: ITEMS, emprestimo: FALLBACK_ICON })
    for (const it of Object.values(ITEMS)) {
      if (it.kind === 'block') continue
      expect(r[it.key], `item ${it.key} ficaria sem icone no inventario`).toBeTruthy()
    }
  })
})

describe('montarIcones: as duas metades caem sozinhas', () => {
  const BLOCOS = { 1: { key: 'dirt', id: 1 } }
  const CAMADAS = Array.from({ length: 12 }, (_, i) => i)
  const DEFS = {
    dirt: { key: 'dirt', kind: 'block' },
    stick: { key: 'stick', kind: 'material' },
  }
  const base = (extra = {}) => ({
    manifest: 'M',
    blocos: BLOCOS,
    faceLayers: CAMADAS,
    definicoes: DEFS,
    emprestimo: { stick: 'dirt' },
    desenharBlocos: async () => ({ dirt: 'CUBO' }),
    desenharItens: async () => ({ stick: 'SPRITE' }),
    ...extra,
  })

  it('com os dois atlas, tudo aparece', async () => {
    const r = await montarIcones(base())
    expect(r.dirt).toBe('CUBO')
    expect(r.stick).toBe('SPRITE')
  })

  it('o desenho de blocos recebe as CAMADAS calculadas, nao a tabela crua', async () => {
    let recebido = null
    await montarIcones(
      base({
        desenharBlocos: async (m, camadas) => {
          recebido = { m, camadas }
          return {}
        },
      }),
    )
    expect(recebido.m).toBe('M')
    expect(recebido.camadas).toEqual(camadasParaIcones(BLOCOS, CAMADAS))
  })

  it('se o atlas de BLOCO cai, os itens ainda aparecem', async () => {
    // Um `try` unico em volta das duas perderia as duas.
    const avisos = []
    const r = await montarIcones(
      base({
        desenharBlocos: async () => {
          throw new Error('sem GPU')
        },
        avisar: (metade) => avisos.push(metade),
      }),
    )
    expect(r.stick).toBe('SPRITE')
    expect(avisos).toEqual(['blocos'])
  })

  it('se o atlas de ITEM cai, os blocos ainda aparecem', async () => {
    const avisos = []
    const r = await montarIcones(
      base({
        desenharItens: async () => {
          throw new Error('sem canvas')
        },
        avisar: (metade) => avisos.push(metade),
      }),
    )
    expect(r.dirt).toBe('CUBO')
    expect(avisos).toEqual(['itens'])
  })

  it('com os DOIS no chao, ainda devolve tabela e NAO explode o boot', async () => {
    // O jogo tem que abrir. Um desenho que nao gerou nao pode ser motivo pra
    // ninguem conseguir jogar.
    const r = await montarIcones(
      base({
        desenharBlocos: async () => {
          throw new Error('x')
        },
        desenharItens: async () => {
          throw new Error('y')
        },
      }),
    )
    expect(r.stick).toBe(null)
  })

  it('o emprestimo continua valendo quando so o atlas de item cai', async () => {
    const r = await montarIcones(
      base({
        desenharItens: async () => {
          throw new Error('x')
        },
      }),
    )
    expect(r.stick).toBe('CUBO')
  })
})
