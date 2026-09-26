//
// CORTAR O MATO — a queixa era de retorno, não de mira nem de drop.
//
// ⚠️ O FOUNDER DISSE "NÃO CONSIGO CORTAR A GRAMA" E A SUÍTE ESTAVA VERDE.
// Ela estava certa: a mira enxergava o tufo, a quebra acontecia, o drop saía
// pela regra escrita. O que ninguém media é que a ação inteira cabia em TRÊS
// QUADROS — `hardness: 0` → `breakTime` 0 → o piso de 0,05 s do laço manda.
// Nesse tempo a rachadura não aparece e o som de cavar (a cada 0,22 s de
// progresso) nunca dispara. O jogo executava e não contava que executou.
//
// Este arquivo trava as três coisas que fazem o corte ser SENTIDO: o tempo na
// mão, o tempo com tesoura, e o drop que continua caindo na mão vazia.
import { describe, it, expect } from 'vitest'
import {
  BLOCKS,
  DUREZA_DO_MATO,
  ID,
  blockDrops,
  breakTime,
  dropsWith,
} from '../../src/servicos/blocks.js'
import { toolOf } from '../../src/servicos/items.js'

/** O piso do laço de mineração, em `ROSRoqueCraft.vue`. */
const PISO_DO_LACO = 0.05
/** De quanto em quanto tempo de progresso sai a batida de cavar. */
const BATIDA = 0.22

const MATO = ['tallGrass', 'redFlower', 'yellowFlower', 'deadBush']
const tesoura = toolOf('shears')

describe('o corte tem cadência', () => {
  it('na mão, o tufo demora mais que o piso do laço', () => {
    // ⚠️ A AFIRMAÇÃO EXATA DO DEFEITO. Enquanto `breakTime` devolvia 0, o piso
    // mandava e o corte durava 0,05 s — três quadros, sem rachadura e sem som.
    for (const k of MATO) {
      const t = breakTime(ID[k], null)
      expect(t, `${k} volta a quebrar instantâneo`).toBeGreaterThan(PISO_DO_LACO)
    }
  })

  it('e dura o bastante para UMA batida de som antes de cair', () => {
    // Uma, não zero e não cinco: mato é um golpe, não é trabalho de picareta.
    const t = breakTime(ID.tallGrass, null)
    expect(t, 'sem tempo para o som de cavar disparar').toBeGreaterThan(BATIDA)
    expect(t, 'mato virou trabalho de mineração').toBeLessThan(BATIDA * 2)
  })

  it('a rachadura tem tempo de aparecer', () => {
    // A rachadura desenha com opacidade = progresso × 0.62. A 60 fps, 0,25 s
    // são 15 quadros: ela sobe à vista. Em 3 quadros, não.
    const quadros = breakTime(ID.tallGrass, null) * 60
    expect(quadros).toBeGreaterThan(10)
  })
})

describe('a tesoura é a ferramenta do mato', () => {
  it('corta muito mais rápido que a mão', () => {
    const naMao = breakTime(ID.tallGrass, null)
    const comTesoura = breakTime(ID.tallGrass, tesoura)
    expect(comTesoura, 'a tesoura não acelera nada: era o estado antigo').toBeLessThan(naMao / 5)
  })

  it('e a picareta não serve de tesoura', () => {
    // Ferramenta errada não pode ganhar o atalho da certa, senão a tesoura
    // deixa de ter razão de existir.
    expect(breakTime(ID.tallGrass, toolOf('iron_pickaxe'))).toBe(breakTime(ID.tallGrass, null))
  })
})

describe('o drop não regrediu ao ganhar ferramenta', () => {
  it('a mão vazia continua dando semente', () => {
    // ⚠️ ESTE É O TESTE QUE GUARDA O CONSERTO DE NÃO PIORAR A QUEIXA. Declarar
    // `tool: 'shears'` sem `tier: 0` faz `dropsWith` comparar `undefined === 0`
    // e recusar o drop na mão — e a semente de mato é a ÚNICA fonte de lavoura
    // numa partida nova. O jogo inteiro de agricultura sai por essa porta.
    expect(dropsWith(ID.tallGrass, null), 'o mato parou de dropar na mão vazia').toBe(true)
    const caiu = blockDrops(ID.tallGrass, null, () => 0)
    expect(caiu).toEqual([{ item: 'wheat_seeds', count: BLOCKS[ID.tallGrass].dropCount }])
  })

  it('com tesoura vem o tufo inteiro, e não semente', () => {
    expect(blockDrops(ID.tallGrass, tesoura, () => 0)).toEqual([{ item: 'tallGrass', count: 1 }])
  })

  it('a flor continua caindo inteira na mão', () => {
    for (const k of ['redFlower', 'yellowFlower']) {
      expect(
        blockDrops(ID[k], null, () => 0),
        k,
      ).toEqual([{ item: k, count: 1 }])
    }
  })

  it('a chance de semente NÃO mudou nesta onda', () => {
    // A queixa era de retorno, e o número tem justificativa escrita no bloco
    // (100% faria uma tarde de foice render mais semente do que se usa, e a
    // lavoura perderia a razão). Mudar um número decidido sem medir é reabrir
    // decisão por conta própria — se ainda parecer pouco, é escolha do founder.
    expect(BLOCKS[ID.tallGrass].dropChance).toBe(0.125)
  })
})

describe('o resto do mundo não mudou de dureza', () => {
  it('a tocha e a muda continuam instantâneas', () => {
    // A dureza nova é da VEGETAÇÃO QUE SE CORTA. Tocha, muda e cultura são
    // outro gesto: pegar de volta, não cortar.
    expect(breakTime(ID.torch, null)).toBe(0)
    expect(breakTime(ID.oakSapling, null)).toBe(0)
  })

  it('a pedra continua pedindo picareta, e no mesmo tempo', () => {
    expect(breakTime(ID.stone, null)).toBe(BLOCKS[ID.stone].hardness * 5)
    expect(breakTime(ID.stone, toolOf('iron_pickaxe'))).toBeLessThan(breakTime(ID.stone, null))
  })

  it('a dureza do mato é pequena de verdade — não virou bloco duro', () => {
    expect(DUREZA_DO_MATO).toBeLessThan(BLOCKS[ID.dirt].hardness / 5)
  })
})
