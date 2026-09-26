import { describe, it, expect, vi } from 'vitest'
import {
  devolverAoInventario,
  retirarResultado,
  ingredientesDe,
  montarDireto,
  criarMaoDaBancada,
} from '../../src/servicos/bancada.js'
import {
  createInventory,
  countItem,
  addItem,
  INVENTORY_SIZE,
} from '../../src/servicos/inventory.js'
import { RECIPES } from '../../src/servicos/recipes.js'

// ⚠️ O QUE ESTE ARQUIVO SEGURA: item que nao some nem se multiplica.
//
// As tres regras aqui tem a mesma forma e o mesmo perigo -- elas TIRAM de um
// lugar e POEM noutro, e no meio existe um instante em que o item nao esta em
// nenhum dos dois. Uma delas ja custou item de graca ao jogo (ver o cabecalho de
// `retirarResultado`), e o defeito nao era da conta: era do `addItem` mutar
// antes de a funcao decidir desistir.

const vazio = () => createInventory()
const grade = (...itens) => {
  const g = new Array(9).fill(null)
  itens.forEach((it, i) => (g[i] = it))
  return g
}

describe('devolverAoInventario: fechar nao destroi nada', () => {
  it('o item do cursor volta pra mochila', () => {
    const r = devolverAoInventario({
      inventario: vazio(),
      cursor: { item: 'stone', count: 7 },
      grade: grade(),
    })
    expect(countItem(r.inventario, 'stone')).toBe(7)
    expect(r.cursor).toBe(null)
  })

  it('a grade inteira volta, e volta VAZIA', () => {
    const r = devolverAoInventario({
      inventario: vazio(),
      cursor: null,
      grade: grade({ item: 'oakLog', count: 2 }, null, { item: 'stone', count: 3 }),
    })
    expect(countItem(r.inventario, 'oakLog')).toBe(2)
    expect(countItem(r.inventario, 'stone')).toBe(3)
    expect(r.grade.every((s) => s === null)).toBe(true)
    expect(r.grade).toHaveLength(9)
  })

  it('cursor e grade juntos, sem perder nenhum dos dois', () => {
    const r = devolverAoInventario({
      inventario: vazio(),
      cursor: { item: 'stone', count: 4 },
      grade: grade({ item: 'stone', count: 5 }),
    })
    expect(countItem(r.inventario, 'stone')).toBe(9)
  })

  it('a durabilidade da ferramenta volta junto', () => {
    // Sem levar `dur`, fechar o inventario com uma picareta gasta no cursor
    // devolveria uma picareta NOVA -- reparo de graca.
    const r = devolverAoInventario({
      inventario: vazio(),
      cursor: { item: 'stone_pickaxe', count: 1, dur: 12 },
      grade: grade(),
    })
    expect(r.inventario.find((s) => s?.item === 'stone_pickaxe')?.dur).toBe(12)
  })

  it('NAO muta o inventario que recebeu', () => {
    const original = vazio()
    devolverAoInventario({
      inventario: original,
      cursor: { item: 'stone', count: 7 },
      grade: grade(),
    })
    expect(countItem(original, 'stone')).toBe(0)
  })
})

describe('retirarResultado: pergunta antes de entregar', () => {
  const RES = { item: 'oakPlanks', count: 4 }
  const gradeCheia = () => grade({ item: 'oakLog', count: 1 })

  it('cabendo, entrega e consome a grade', () => {
    const r = retirarResultado({ inventario: vazio(), grade: gradeCheia(), resultado: RES })
    expect(r.ok).toBe(true)
    expect(countItem(r.inventario, 'oakPlanks')).toBe(4)
    expect(r.grade.every((s) => s === null)).toBe(true)
  })

  it('SEM ESPACO, nao entrega NEM consome', () => {
    // Este e o defeito que ja saiu em producao: com o inventario quase cheio
    // saia item de graca sem gastar ingrediente, clicando repetido.
    const cheio = vazio()
    for (let i = 0; i < INVENTORY_SIZE; i++) cheio[i] = { item: 'stone', count: 64 }
    const g = gradeCheia()
    const r = retirarResultado({ inventario: cheio, grade: g, resultado: RES })
    expect(r.ok).toBe(false)
    expect(countItem(r.inventario, 'oakPlanks')).toBe(0)
    expect(r.grade[0]).toEqual({ item: 'oakLog', count: 1 })
  })

  it('cabendo so PARTE, tambem nao entrega nada', () => {
    // O caso perigoso de verdade: `addItem` colocaria o que coubesse e sairia.
    const quase = vazio()
    for (let i = 0; i < INVENTORY_SIZE - 1; i++) quase[i] = { item: 'stone', count: 64 }
    quase[INVENTORY_SIZE - 1] = { item: 'oakPlanks', count: 62 }
    const r = retirarResultado({ inventario: quase, grade: gradeCheia(), resultado: RES })
    expect(r.ok).toBe(false)
    expect(countItem(r.inventario, 'oakPlanks')).toBe(62)
  })

  it('sem resultado nenhum, nada acontece', () => {
    const r = retirarResultado({ inventario: vazio(), grade: gradeCheia(), resultado: null })
    expect(r.ok).toBe(false)
    expect(r.grade[0]).toEqual({ item: 'oakLog', count: 1 })
  })

  it('NAO muta o que recebeu', () => {
    const inv = vazio()
    const g = gradeCheia()
    retirarResultado({ inventario: inv, grade: g, resultado: RES })
    expect(countItem(inv, 'oakPlanks')).toBe(0)
    expect(g[0]).toEqual({ item: 'oakLog', count: 1 })
  })
})

describe('ingredientesDe: de que, e quantos', () => {
  it('receita com forma conta cada celula', () => {
    const r = ingredientesDe({
      type: 'shaped',
      pattern: ['XX', 'XX'],
      keyMap: { X: 'oakPlanks' },
    })
    expect(r.get('oakPlanks')).toBe(4)
  })

  it('espaco no padrao e buraco, nao ingrediente', () => {
    const r = ingredientesDe({
      type: 'shaped',
      pattern: ['X X', ' X '],
      keyMap: { X: 'stick' },
    })
    expect(r.get('stick')).toBe(3)
    expect(r.size).toBe(1)
  })

  it('receita sem forma conta a lista', () => {
    const r = ingredientesDe({ type: 'shapeless', items: ['oakLog', 'oakLog', 'coal'] })
    expect(r.get('oakLog')).toBe(2)
    expect(r.get('coal')).toBe(1)
  })

  it('toda receita do jogo produz ingredientes contaveis', () => {
    for (const rec of RECIPES) {
      const r = ingredientesDe(rec)
      expect(r.size, `receita de ${rec.result} nao tem ingrediente`).toBeGreaterThan(0)
      for (const [k, n] of r) {
        expect(typeof k, `${rec.result} tem chave estranha`).toBe('string')
        expect(n).toBeGreaterThan(0)
      }
    }
  })
})

describe('montarDireto: confere tudo antes de tirar qualquer coisa', () => {
  const RECEITA = { type: 'shapeless', items: ['oakLog'], result: 'oakPlanks', count: 4 }

  it('tendo o ingrediente, troca', () => {
    const inv = vazio()
    addItem(inv, 'oakLog', 3)
    const r = montarDireto({ inventario: inv, receita: RECEITA })
    expect(r.ok).toBe(true)
    expect(countItem(r.inventario, 'oakLog')).toBe(2)
    expect(countItem(r.inventario, 'oakPlanks')).toBe(4)
  })

  it('faltando UM ingrediente, nao gasta NENHUM', () => {
    // Conferir e tirar no mesmo laco gastaria a madeira e desistiria na pedra:
    // o jogador clica, nao recebe nada, e perdeu material.
    const receita = { type: 'shapeless', items: ['oakLog', 'stone'], result: 'x', count: 1 }
    const inv = vazio()
    addItem(inv, 'oakLog', 5)
    const r = montarDireto({ inventario: inv, receita })
    expect(r.ok).toBe(false)
    expect(countItem(r.inventario, 'oakLog')).toBe(5)
  })

  it('com o inventario vazio nao monta nada', () => {
    expect(montarDireto({ inventario: vazio(), receita: RECEITA }).ok).toBe(false)
  })

  it('NAO muta o inventario que recebeu', () => {
    const inv = vazio()
    addItem(inv, 'oakLog', 3)
    montarDireto({ inventario: inv, receita: RECEITA })
    expect(countItem(inv, 'oakLog')).toBe(3)
    expect(countItem(inv, 'oakPlanks')).toBe(0)
  })
})

// ⚠️ A LETRA ORFA: o buraco que `ingredientesDe` nao consegue enxergar.
//
// Uma letra do padrao que nao exista no `keyMap` vira `undefined`, e o
// `if (!c) continue` a descarta junto com os espacos. A receita passa a custar
// MENOS ingrediente do que o autor escreveu -- item de graca por erro de
// digitacao, e nenhum teste de craft acusaria, porque ela funcionaria.
//
// `ingredientesDe` nao tem como distinguir buraco de erro. Quem distingue e
// isto, varrendo o livro inteiro.
describe('o livro de receitas nao tem letra orfa', () => {
  it('toda letra do padrao existe no keyMap', () => {
    for (const rec of RECIPES) {
      if (rec.type !== 'shaped') continue
      for (const linha of rec.pattern) {
        for (const ch of linha) {
          if (ch === ' ') continue
          expect(
            rec.keyMap?.[ch],
            `receita de ${rec.result}: a letra "${ch}" nao esta no keyMap`,
          ).toBeTruthy()
        }
      }
    }
  })

  it('toda receita sem forma lista itens de verdade', () => {
    for (const rec of RECIPES) {
      if (rec.type === 'shaped') continue
      expect(Array.isArray(rec.items), `receita de ${rec.result} sem lista`).toBe(true)
      for (const it of rec.items) {
        expect(typeof it, `receita de ${rec.result} com item vazio`).toBe('string')
      }
    }
  })
})

//
// A COLA COM OS REFS — a parte que morava no componente.
//
// Os "refs" aqui são objetos simples com `get`/`set`, e é essa injeção que
// torna testável o que antes só dava pra exercitar abrindo o jogo. O que se
// prova é a FORMA que se repetia quatro vezes: quando a regra recusa, NADA é
// escrito e o save NÃO é agendado — que é onde o `if (!r.ok) return` se perde
// num refactor e o jogador ganha item de graça (RC-01).
describe('criarMaoDaBancada', () => {
  const refDe = (v) => {
    const caixa = { v }
    return { get: () => caixa.v, set: (x) => (caixa.v = x), caixa }
  }
  const montar = ({ inv, grade = new Array(9).fill(null), resultado = null, cursor = null }) => {
    const r = {
      inventario: refDe(inv),
      grade: refDe(grade),
      cursor: refDe(cursor),
      resultado: { get: () => resultado },
    }
    const salvos = { n: 0 }
    return {
      refs: r,
      salvos,
      mao: criarMaoDaBancada({ ...r, salvar: () => salvos.n++ }),
    }
  }

  it('retirar escreve inventário e grade, e agenda o save', () => {
    const grade = new Array(9).fill(null)
    grade[0] = { item: 'oakPlanks', count: 2 }
    const { mao, refs, salvos } = montar({
      inv: new Array(36).fill(null),
      grade,
      resultado: { item: 'stick', count: 4 },
    })
    expect(mao.retirar()).toBe(true)
    expect(refs.inventario.get().some((s) => s?.item === 'stick')).toBe(true)
    expect(refs.grade.get()[0].count).toBe(1)
    expect(salvos.n).toBe(1)
  })

  it('sem resultado NÃO escreve nada e NÃO agenda save', () => {
    const inv = new Array(36).fill(null)
    const { mao, refs, salvos } = montar({ inv, resultado: null })
    expect(mao.retirar()).toBe(false)
    expect(refs.inventario.get()).toBe(inv)
    expect(salvos.n).toBe(0)
  })

  it('inventário cheio recusa a retirada inteira — nada sai da grade', () => {
    const cheio = new Array(36).fill(null).map(() => ({ item: 'stone', count: 64 }))
    const grade = new Array(9).fill(null)
    grade[0] = { item: 'oakPlanks', count: 2 }
    const { mao, refs, salvos } = montar({
      inv: cheio,
      grade,
      resultado: { item: 'stick', count: 4 },
    })
    expect(mao.retirar()).toBe(false)
    expect(refs.grade.get()[0].count).toBe(2)
    expect(salvos.n).toBe(0)
  })

  it('montar direto consome do inventário e agenda o save', () => {
    const inv = new Array(36).fill(null)
    inv[0] = { item: 'oakPlanks', count: 8 }
    const { mao, refs, salvos } = montar({ inv })
    const receita = RECIPES.find((r) => r.result === 'stick')
    expect(mao.montar(receita)).toBe(true)
    expect(refs.inventario.get()[0].count).toBeLessThan(8)
    expect(salvos.n).toBe(1)
  })

  it('sem ingrediente, montar não escreve nem salva', () => {
    const inv = new Array(36).fill(null)
    const { mao, refs, salvos } = montar({ inv })
    expect(mao.montar(RECIPES.find((r) => r.result === 'stick'))).toBe(false)
    expect(refs.inventario.get()).toBe(inv)
    expect(salvos.n).toBe(0)
  })

  it('gastar desconta do slot, avisa quando quebra e o inquebrável poupa', () => {
    const inv = new Array(36).fill(null)
    inv[0] = { item: 'iron_pickaxe', count: 1, dur: 3 }
    inv[1] = { item: 'shield', count: 1, dur: 10 }
    inv[2] = { item: 'diamond_sword', count: 1, dur: 5, enc: { inquebravel: 3 } }
    const { mao, refs } = montar({ inv })
    expect(mao.gastar(0)).toBe('used')
    expect(refs.inventario.get()[0].dur).toBe(2)
    expect(mao.gastar(1, 4), 'gasta mais de um de uma vez').toBe('used')
    expect(refs.inventario.get()[1].dur).toBe(6)
    expect(mao.gastar(0, 2)).toBe('broke')
    expect(refs.inventario.get()[0]).toBe(null)
    // Inquebrável III gasta só quando o sorteio cai abaixo de 1/4.
    const sorteio = vi.spyOn(Math, 'random')
    sorteio.mockReturnValue(0.9)
    expect(mao.gastar(2), 'poupou').toBe('none')
    expect(refs.inventario.get()[2].dur).toBe(5)
    sorteio.mockReturnValue(0.1)
    expect(mao.gastar(2), 'gastou').toBe('used')
    expect(refs.inventario.get()[2].dur).toBe(4)
    sorteio.mockRestore()
    expect(mao.gastar(9), 'slot vazio').toBe('none')
  })

  it('clique na grade mexe em grade e cursor, e NÃO agenda save', () => {
    const grade = new Array(9).fill(null)
    grade[3] = { item: 'stone', count: 6 }
    const { mao, refs, salvos } = montar({ inv: new Array(36).fill(null), grade })
    mao.cliqueNaGrade(3, 'left')
    expect(refs.cursor.get()).toEqual({ item: 'stone', count: 6 })
    expect(refs.grade.get()[3]).toBe(null)
    // grade aberta é tela aberta: o save sai quando ela fecha
    expect(salvos.n).toBe(0)
  })
})
