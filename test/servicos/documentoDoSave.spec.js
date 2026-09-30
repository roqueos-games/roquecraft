import { describe, it, expect } from 'vitest'
import { criarHostFalso } from '@roqueos-games/jogo-sdk/host-falso'
import {
  CHAVE_DA_LISTA,
  semListaDentroDeLista,
  comListaDentroDeLista,
  ondeHaListaDentroDeLista,
} from '../../src/servicos/documentoDoSave.js'
import {
  buildSavePayload,
  criarSaveDoRoqueCraft,
  parseSave,
} from '../../src/servicos/roqueCraftSave.js'
import { createInventory, serializeInventory } from '../../src/servicos/inventory.js'

// O DOCUMENTO SEM LISTA DENTRO DE LISTA (save v13).
//
// O Firestore recusa array dentro de array, e o save v12 tinha quatro. O que se
// prova aqui: a regra da fronteira (ida e volta), que o payload INTEIRO do jogo,
// com tudo que aninhava, passa pelo host que recusa como o Firestore, e que um
// documento v12 gravado antes do conserto continua abrindo igual.

const A = CHAVE_DA_LISTA

describe('a regra, pura', () => {
  it('lista dentro de lista vira `{ _a }`, em qualquer profundidade', () => {
    expect(semListaDentroDeLista([[1, 2], 3, [4, [5]]])).toEqual([
      { [A]: [1, 2] },
      3,
      { [A]: [4, { [A]: [5] }] },
    ])
    expect(semListaDentroDeLista({ x: [[1]], y: { z: [['a', [2]]] } })).toEqual({
      x: [{ [A]: [1] }],
      y: { z: [{ [A]: ['a', { [A]: [2] }] }] },
    })
  })

  it('a volta desfaz a ida, e o que não foi embrulhado volta igual', () => {
    const original = {
      edits: [1, 2, 3, 4],
      inventory: [
        [0, 'coal', 3, null],
        [5, 'sword', 1, 40],
      ],
      outras: [['nether', [0, 0, 1, 2]]],
      objeto: { [A]: 'não é lista', outra: 1 },
      nulo: null,
    }
    const doc = semListaDentroDeLista(original)
    expect(ondeHaListaDentroDeLista(doc)).toBe(null)
    expect(comListaDentroDeLista(doc)).toEqual(original)
    // Um objeto com `_a` que NÃO é lista não é embrulho: fica como está.
    expect(comListaDentroDeLista({ [A]: 'texto' })).toEqual({ [A]: 'texto' })
  })

  it('lista plana de números é a MESMA referência: as edições não são copiadas', () => {
    const edits = new Array(1000).fill(7)
    expect(semListaDentroDeLista(edits)).toBe(edits)
    expect(comListaDentroDeLista(edits)).toBe(edits)
    expect(semListaDentroDeLista({ edits }).edits).toBe(edits)
  })

  it('o detector diz ONDE está a lista dentro de lista', () => {
    expect(ondeHaListaDentroDeLista({ a: 1, b: [1, [2]] })).toBe('b[1]')
    expect(ondeHaListaDentroDeLista({ a: { b: [{ c: [[1]] }] } })).toBe('a.b[0].c[0]')
    expect(ondeHaListaDentroDeLista({ a: [1, 2], b: [{ c: 1 }] })).toBe(null)
  })
})

// Um mundo com TUDO que aninhava: item com encanto e poção, outra dimensão,
// efeito ativo, baú com coisa dentro.
function mundoQueAninhavaTudo() {
  const inventario = createInventory()
  inventario[0] = { item: 'wood_pickaxe', count: 1 }
  inventario[1] = { item: 'coal', count: 12 }
  inventario[2] = { item: 'diamond_sword', count: 1, dur: 100, enc: { afiacao: 2 } }
  return {
    seed: 7,
    player: { x: 1, y: 2, z: 3, yaw: 0, pitch: 0 },
    dimensionId: 'nether',
    edits: [0, 0, 5, 21],
    outrasDimensoes: [['overworld', [0, 0, 9, 3]]],
    inventory: inventario,
    efeitos: { velocidade: { nivel: 1, restante: 30 } },
    mobilia: [{ k: '1,2,3', t: 'chest', s: [['coal', 3], null, ['stone', 64]] }],
  }
}

describe('o payload inteiro do jogo', () => {
  it('não tem lista dentro de lista em campo nenhum (v13)', () => {
    const payload = buildSavePayload(mundoQueAninhavaTudo())
    expect(payload.version).toBe(13)
    expect(ondeHaListaDentroDeLista(payload)).toBe(null)
    // E o que aninhava está lá, embrulhado, não jogado fora.
    expect(payload.inventory).toHaveLength(3)
    expect(payload.outrasDimensoes).toEqual([{ [A]: ['overworld', { [A]: [0, 0, 9, 3] }] }])
    expect(payload.efeitos).toEqual([{ [A]: ['velocidade', 1, 30] }])
    expect(payload.mobilia[0].s).toEqual([{ [A]: ['coal', 3] }, null, { [A]: ['stone', 64] }])
  })

  it('o host que recusa como o Firestore ACEITA, e o que volta é o mundo', async () => {
    const host = criarHostFalso({ jogoId: 'roquecraft', uid: 'u1', nome: 'Ana', progresso: {} })
    const save = criarSaveDoRoqueCraft(host.progresso)
    const mundo = mundoQueAninhavaTudo()
    await expect(save.saveRoqueCraft(buildSavePayload(mundo))).resolves.toBe(true)
    const lido = await save.loadRoqueCraft()
    expect(lido.dimensionId).toBe('nether')
    expect([...lido.outrasDimensoes[0][1].get('0,0')]).toEqual([[9, 3]])
    expect(lido.inventory[2]).toEqual({
      item: 'diamond_sword',
      count: 1,
      dur: 100,
      enc: { afiacao: 2 },
    })
    expect(lido.efeitos.velocidade).toMatchObject({ nivel: 1, restante: 30 })
    expect(lido.mobilia[0].s).toEqual([['coal', 3], null, ['stone', 64]])
  })

  it('o documento v12, gravado ANTES do conserto, abre igual ao v13 do mesmo mundo', () => {
    const mundo = mundoQueAninhavaTudo()
    const v13 = buildSavePayload(mundo)
    // O v12 é o mesmo mundo no formato antigo: lista dentro de lista, e versão 12.
    const v12 = { ...comListaDentroDeLista(v13), version: 12 }
    expect(v12.inventory).toEqual(serializeInventory(mundo.inventory))
    expect(ondeHaListaDentroDeLista(v12)).toBe('outrasDimensoes[0]')
    const doV12 = parseSave(v12)
    const doV13 = parseSave(v13)
    expect({ ...doV12, version: 13 }).toEqual(doV13)
  })
})
