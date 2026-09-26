import { describe, it, expect } from 'vitest'

import {
  buildSavePayload,
  parseSave,
  DIMENSAO_PADRAO,
  GERADOR_ATUAL,
} from '../../src/servicos/roqueCraftSave.js'

// ⚠️ SEMENTE NÃO IDENTIFICA UM MUNDO.
//
// Dois mundos diferentes podem ter a mesma semente, e foi exatamente isso que
// fez "solo → sala → solo" comparar seed e concluir que era a mesma sessão
// (RC-03): o anfitrião jogava a sala na própria semente e saía dela com o
// inventário da sala no mundo dele.
//
// `worldId` responde "qual mundo é este". `dimensionId` responde "onde dentro
// dele" — e entra agora, valendo `overworld` para todos, porque o dia em que o
// Nether existir o save já vai saber dizer onde o jogador estava; migrar save
// NAQUELE dia seria migrar às cegas.
//
// `generatorVersion` é o que permite mudar a geração sem trocar o chão debaixo
// da casa de quem já construiu. Sem ela, melhorar a worldgen é um ato
// destrutivo, e é por isso que a worldgen está congelada na prática.

/** Um save v8 como os que estão no Firestore agora: sem nenhum dos três campos. */
const saveV8 = () => ({
  version: 8,
  seed: 12345,
  mode: 'survival',
  edits: [],
  player: { x: 1, y: 64, z: 2, yaw: 0, pitch: 0 },
  inventory: [],
  survival: null,
  ticks: 5000,
  hotbar: 0,
  settings: null,
  mobilia: [],
  renascimento: null,
  drops: [],
  mobs: [],
})

describe('identidade do mundo (onda 2)', () => {
  it('o save novo nasce com os três campos', () => {
    const p = buildSavePayload({
      worldId: 'w-abc',
      dimensionId: 'overworld',
      generatorVersion: 1,
      seed: 7,
      edits: [],
      player: { x: 0, y: 64, z: 0, yaw: 0, pitch: 0 },
      inventory: [],
      survival: null,
      ticks: 0,
      mode: 'survival',
      hotbar: 0,
      settings: {},
      mobilia: [],
      renascimento: null,
      drops: [],
      mobs: [],
    })
    // ⚠️ PISO, NÃO IGUALDADE. A identidade entrou na v9; cravar `toBe(9)` fazia
    // este teste reprovar em toda versão nova do save sem que nada do que ele
    // protege tivesse mudado — foi o que aconteceu na v10. O que precisa ser
    // verdade é que a versão não ANDE PARA TRÁS abaixo de onde o campo nasceu.
    expect(p.version).toBeGreaterThanOrEqual(9)
    expect(p.worldId).toBe('w-abc')
    expect(p.dimensionId).toBe(DIMENSAO_PADRAO)
    expect(p.generatorVersion).toBe(GERADOR_ATUAL)
  })

  it('nunca grava identidade vazia, mesmo quando o chamador esquece', () => {
    const p = buildSavePayload({
      seed: 99,
      edits: [],
      player: null,
      inventory: [],
      survival: null,
      ticks: 0,
      mode: 'survival',
      hotbar: 0,
      settings: {},
      mobilia: [],
      renascimento: null,
      drops: [],
      mobs: [],
    })
    expect(p.worldId).toBe('w99')
    expect(p.dimensionId).toBe(DIMENSAO_PADRAO)
    expect(p.generatorVersion).toBe(GERADOR_ATUAL)
  })

  it('o save v8 de quem já jogou abre, e ganha identidade derivada da SEMENTE', () => {
    const lido = parseSave(saveV8())
    expect(lido.worldId, 'o mundo antigo não recebeu identidade').toBe('w12345')
    expect(lido.dimensionId).toBe(DIMENSAO_PADRAO)
    expect(lido.generatorVersion, 'o save antigo tem que continuar no gerador antigo').toBe(1)
  })

  it('a identidade derivada é ESTÁVEL — duas leituras do mesmo save dão o mesmo id', () => {
    // ⚠️ ESTE É O MOTIVO DE NÃO SORTEAR. Um id aleatório na migração daria um
    // mundo diferente a cada leitura enquanto o jogador não salvasse, que é
    // exatamente o que a identidade existe para impedir.
    const bruto = saveV8()
    expect(parseSave(bruto).worldId).toBe(parseSave(bruto).worldId)
    expect(parseSave(bruto).worldId).toBe(parseSave({ ...bruto }).worldId)
  })

  it('nada mais do save v8 se perde na migração', () => {
    const lido = parseSave(saveV8())
    expect(lido.seed).toBe(12345)
    expect(lido.ticks).toBe(5000)
    expect(lido.mode).toBe('survival')
    expect(lido.player).toMatchObject({ x: 1, y: 64, z: 2 })
  })

  it('identidade já gravada é respeitada, e não sobrescrita pela derivada', () => {
    const lido = parseSave({ ...saveV8(), version: 9, worldId: 'w-escolhido', generatorVersion: 3 })
    expect(lido.worldId).toBe('w-escolhido')
    expect(lido.generatorVersion).toBe(3)
  })

  it('identidade corrompida cai na derivada em vez de derrubar o mundo', () => {
    for (const lixo of [null, 42, '', {}, []]) {
      const lido = parseSave({ ...saveV8(), worldId: lixo, dimensionId: lixo })
      expect(lido.worldId).toBe('w12345')
      expect(lido.dimensionId).toBe(DIMENSAO_PADRAO)
    }
  })
})
