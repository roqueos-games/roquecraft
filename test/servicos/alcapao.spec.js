import { describe, it, expect } from 'vitest'
import {
  AIR,
  BLOCKS,
  BLOCK_BY_KEY,
  ID,
  SOLIDO_DE_BLOCO,
  ALCAPAO_DO_BLOCO,
  BLOCO_DO_ALCAPAO,
  VARIANTE_DE_ALCAPAO,
} from '../../src/servicos/blocks.js'
import { CAIXAS_DE_BLOCO, FACES_DE_BLOCO, EH_FORMA_LIVRE } from '../../src/servicos/formas.js'
import { idParaColocar } from '../../src/servicos/variante.js'
import { interagirComBloco } from '../../src/servicos/interacao.js'
import { alturaDoApoio } from '../../src/servicos/mobs.js'
import { RECIPES } from '../../src/servicos/recipes.js'
import { ITEMS } from '../../src/servicos/items.js'

//
// O ALÇAPÃO — o portão deitado. Goal 21, onda 2.1: tapa o buraco da escada de
// mina; o clique levanta a tampa.
//

const PEDRA = BLOCK_BY_KEY.stone.id
const idDe = (orient, aberto) =>
  ID[VARIANTE_DE_ALCAPAO[`oakTrapdoor|${orient}|${aberto ? 'a' : 'f'}`]]

describe('o catálogo do alçapão', () => {
  it('são 8 variantes, uma só vira item, todas dropam a canônica', () => {
    const variantes = Object.values(BLOCKS).filter((b) => b.alcapao)
    expect(variantes).toHaveLength(8)
    expect(variantes.filter((b) => !b.semItem).map((b) => b.key)).toEqual(['oakTrapdoor'])
    for (const b of variantes) {
      expect(b.drops).toBe('oakTrapdoor')
      expect(b.interact).toBe('trapdoor')
      expect(BLOCO_DO_ALCAPAO[b.key]).toBe('oakTrapdoor')
    }
    expect(ALCAPAO_DO_BLOCO.oakPlanks).toBe('oakTrapdoor')
    expect(ITEMS.oakTrapdoor, 'o item existe').toBeTruthy()
  })

  it('cada variante tem forma própria: caixa, faces, e sai do greedy', () => {
    for (const b of Object.values(BLOCKS).filter((b) => b.alcapao)) {
      expect(CAIXAS_DE_BLOCO[b.id], b.key).toBeTruthy()
      expect(FACES_DE_BLOCO[b.id], b.key).toBeTruthy()
      expect(EH_FORMA_LIVRE[b.id], b.key).toBe(1)
    }
  })

  it('⚠️ fechado é uma tampa de 3/16 no chão; aberto é a tampa em pé numa borda', () => {
    for (const o of [0, 1, 4, 5]) {
      const fechado = SOLIDO_DE_BLOCO[idDe(o, false)][0]
      expect(fechado[4] - fechado[1], `fechado orient ${o} é fino`).toBeCloseTo(3 / 16, 6)
      expect(fechado[1], 'deitado no chão').toBe(0)
      expect(fechado[3] - fechado[0], 'cobre x').toBe(1)
      expect(fechado[5] - fechado[2], 'cobre z').toBe(1)
      const aberto = SOLIDO_DE_BLOCO[idDe(o, true)][0]
      expect(aberto[4] - aberto[1], `aberto orient ${o} tem a altura da célula`).toBe(1)
      const fino = Math.min(aberto[3] - aberto[0], aberto[5] - aberto[2])
      expect(fino, 'em pé, é fino').toBeCloseTo(3 / 16, 6)
    }
  })

  it('a criatura PISA na tampa fechada, a 3/16, e não pisa no alçapão aberto pelo meio', () => {
    expect(alturaDoApoio(SOLIDO_DE_BLOCO[idDe(0, false)], 0.5, 0.5)).toBeCloseTo(3 / 16, 6)
    expect(alturaDoApoio(SOLIDO_DE_BLOCO[idDe(0, true)], 0.5, 0.5)).toBe(0)
  })

  it('a receita: 6 tábuas dão 2 alçapões', () => {
    const r = RECIPES.find((r) => r.result === 'oakTrapdoor')
    expect(r).toMatchObject({ count: 2, pattern: ['MMM', 'MMM'], keyMap: { M: 'oakPlanks' } })
  })
})

describe('colocar e virar o alçapão', () => {
  const TABUA_ALCAPAO = ID.oakTrapdoor
  const olhando = (x, z) =>
    idParaColocar({
      blockId: TABUA_ALCAPAO,
      encaixe: null,
      face: 2,
      olhar: { x, z },
      alvoId: PEDRA,
    })

  it('nasce FECHADO e virado para quem colocou', () => {
    const leste = olhando(1, 0)
    const norte = olhando(0, -1)
    expect(BLOCKS[leste].key).toMatch(/^oakTrapdoor/)
    expect(BLOCKS[leste].alcapao.aberto).toBe(false)
    expect(leste).not.toBe(norte)
  })

  it('pelo clique de verdade: `interagirComBloco` levanta, e de novo baixa', () => {
    const mapa = { '0,64,0': idDe(5, false) }
    const k = (x, y, z) => `${x},${y},${z}`
    const blocoEm = (x, y, z) => mapa[k(x, y, z)] ?? AIR
    const sons = []
    const ctx = {
      blocoEm,
      editar: (x, y, z, id) => (mapa[k(x, y, z)] = id),
      tocar: (s) => sons.push(s),
    }
    expect(interagirComBloco({ hit: { x: 0, y: 64, z: 0 } }, ctx)).toBe(true)
    expect(BLOCKS[blocoEm(0, 64, 0)].alcapao).toEqual({ orient: 5, aberto: true })
    expect(interagirComBloco({ hit: { x: 0, y: 64, z: 0 } }, ctx)).toBe(true)
    expect(blocoEm(0, 64, 0)).toBe(idDe(5, false))
    expect(sons).toEqual(['wood', 'wood'])
  })
})
