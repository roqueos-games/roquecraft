import { describe, it, expect } from 'vitest'

import {
  buildSavePayload,
  parseSave,
  recortarOutrasDimensoes,
} from '../../src/servicos/roqueCraftSave.js'
import { TETO_DO_PAYLOAD } from '../../src/servicos/edicoes.js'
import { DIMENSAO_PADRAO } from '../../src/servicos/dimensoes.js'

// O SAVE COM MAIS DE UMA DIMENSÃO — v10.
//
// ⚠️ O QUE ESTE ARQUIVO PROTEGE É O MUNDO DE QUEM ATRAVESSOU. Enquanto havia um
// mapa de edições só, gravar estando no Nether escreveria a caverna por cima do
// mundo construído — e a saída provisória (recusar a gravação fora do
// overworld) fazia o jogador perder tudo que construísse lá. As duas coisas são
// perda de trabalho do jogador, que é o defeito mais caro que este jogo tem.
//
// E o teto do payload NÃO dobrou por existir uma segunda dimensão: ele é o que
// o documento aguenta. Quem está sendo jogado enche primeiro.

const base = { seed: 7, player: { x: 1, y: 2, z: 3, yaw: 0, pitch: 0 } }
const edicoes = (n, id = 5) => Array.from({ length: n * 4 }, (_, i) => (i % 4 === 3 ? id : 0))

describe('gravar', () => {
  it('grava a dimensao em que o jogador esta, e as outras junto', () => {
    const p = buildSavePayload({
      ...base,
      dimensionId: 'nether',
      edits: edicoes(2, 9),
      outrasDimensoes: [['overworld', edicoes(3, 4)]],
    })
    // ⚠️ `>=` e não `===`. Cravar a versão faz este teste reprovar em toda
    // versão nova do save sem que NADA do que ele protege tenha mudado — é o
    // mesmo conserto que quatro specs já levaram na v10.
    expect(p.version).toBeGreaterThanOrEqual(10)
    expect(p.dimensionId).toBe('nether')
    expect(p.edits).toHaveLength(8)
    expect(p.outrasDimensoes).toEqual([['overworld', edicoes(3, 4)]])
  })

  it('o dragão caído grava e volta; save sem o campo diz que ele está vivo', () => {
    const vivo = parseSave(buildSavePayload({ ...base }))
    expect(vivo.dragaoMorto).toBe(false)
    const morto = parseSave(buildSavePayload({ ...base, dragaoMorto: true }))
    expect(morto.dragaoMorto).toBe(true)
    // Só `true` de verdade conta: um save torto não mata o dragão.
    expect(parseSave({ ...buildSavePayload({ ...base }), dragaoMorto: 'sim' }).dragaoMorto).toBe(
      false,
    )
  })

  it('sem outra dimensao o campo fica vazio, nao ausente', () => {
    const p = buildSavePayload({ ...base, edits: [] })
    expect(p.outrasDimensoes).toEqual([])
    expect(p.dimensionId).toBe(DIMENSAO_PADRAO)
  })
})

describe('ler', () => {
  it('a ida e a volta preservam as duas dimensoes', () => {
    const p = buildSavePayload({
      ...base,
      dimensionId: 'nether',
      edits: [3, -4, 17, 9],
      outrasDimensoes: [['overworld', [0, 0, 5, 21]]],
    })
    const lido = parseSave(p)
    expect(lido.dimensionId).toBe('nether')
    expect(lido.outrasDimensoes).toHaveLength(1)
    const [id, mapa] = lido.outrasDimensoes[0]
    expect(id).toBe('overworld')
    expect([...mapa.get('0,0')]).toEqual([[5, 21]])
  })

  it('SAVE v9 ABRE SEM PERDA: sem o campo, o jogador fica com o mundo que tinha', () => {
    // Um v9 de verdade: o que `buildSavePayload` gravava antes desta fatia.
    const v9 = {
      version: 9,
      worldId: 'w7',
      dimensionId: 'overworld',
      generatorVersion: 1,
      seed: 7,
      mode: 'survival',
      edits: [0, 0, 5, 21],
      player: { x: 1, y: 2, z: 3, yaw: 0, pitch: 0 },
      inventory: [],
      survival: null,
      ticks: 1000,
      hotbar: 0,
    }
    const lido = parseSave(v9)
    expect(lido.version).toBe(9)
    expect(lido.dimensionId).toBe('overworld')
    expect(lido.outrasDimensoes).toEqual([])
    expect([...lido.edits.get('0,0')]).toEqual([[5, 21]])
  })

  it('campo torto do documento nao derruba a leitura', () => {
    const lido = parseSave({ ...base, version: 10, outrasDimensoes: 'nao é lista' })
    expect(lido.outrasDimensoes).toEqual([])
    const sujo = parseSave({ ...base, version: 10, outrasDimensoes: [null, ['x'], [1, []]] })
    expect(sujo.outrasDimensoes).toEqual([])
  })
})

describe('o teto do payload', () => {
  it('a dimensao atual enche primeiro; a outra leva a sobra', () => {
    const quase = edicoes(TETO_DO_PAYLOAD / 4 - 2)
    const recorte = recortarOutrasDimensoes(quase, [['nether', edicoes(100)]])
    expect(recorte[0][1]).toHaveLength(8)
  })

  it('sem sobra nenhuma, a outra dimensao nao entra', () => {
    const cheio = edicoes(TETO_DO_PAYLOAD / 4)
    expect(recortarOutrasDimensoes(cheio, [['nether', edicoes(10)]])).toEqual([])
  })

  it('o recorte e MULTIPLO DE QUATRO: meia edicao nao e edicao', () => {
    // Sobra de 10 números: cabem duas edições (8), não duas e meia.
    const quase = edicoes(TETO_DO_PAYLOAD / 4).slice(0, TETO_DO_PAYLOAD - 10)
    const recorte = recortarOutrasDimensoes(quase, [['nether', edicoes(100)]])
    expect(recorte[0][1].length % 4).toBe(0)
    expect(recorte[0][1].length).toBeLessThanOrEqual(10)
  })

  it('o total nunca passa do teto', () => {
    const meio = edicoes(TETO_DO_PAYLOAD / 8)
    const recorte = recortarOutrasDimensoes(meio, [
      ['nether', edicoes(TETO_DO_PAYLOAD / 4)],
      ['x', edicoes(TETO_DO_PAYLOAD / 4)],
    ])
    const total = meio.length + recorte.reduce((s, [, l]) => s + l.length, 0)
    expect(total).toBeLessThanOrEqual(TETO_DO_PAYLOAD)
  })
})
