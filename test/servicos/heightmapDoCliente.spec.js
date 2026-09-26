import { describe, it, expect } from 'vitest'
import { topoOpacoDaColuna } from '../../src/servicos/chunkStore.js'
import { CHUNK_SIZE, WORLD_HEIGHT, localIndex } from '../../src/servicos/constants.js'
import { ID } from '../../src/servicos/blocks.js'

// ⚠️ O CLIENTE TINHA UM HEIGHTMAP QUE NINGUÉM ATUALIZAVA (RC-11).
//
// O worker recalculava o dele a cada `setBlock`; o cliente escrevia o bloco em
// `c.blocks` e deixava `c.heights` como estava. E `c.heights` só chega de novo
// quando o chunk INTEIRO é reenviado — o que uma edição não faz. Quem cavasse
// um buraco continuava, do lado de cá, com o chão onde não há mais chão: spawn
// de criatura, exposição ao céu e o gancho de QA liam o número velho.
//
// A conta agora tem uma fonte só, e é ela que este arquivo guarda.

function colunaVazia() {
  return new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT)
}
const por = (blocks, lx, lz, y, id) => (blocks[localIndex(lx, y, lz)] = id)

describe('topo opaco da coluna (RC-11)', () => {
  it('coluna vazia não tem topo', () => {
    expect(topoOpacoDaColuna(colunaVazia(), 0, 0)).toBe(0)
  })

  it('o topo é o bloco mais alto MAIS UM — é onde se pisa', () => {
    const b = colunaVazia()
    for (let y = 0; y <= 64; y++) por(b, 3, 5, y, ID.stone)
    expect(topoOpacoDaColuna(b, 3, 5)).toBe(65)
  })

  it('cavar o topo baixa a altura na hora', () => {
    const b = colunaVazia()
    for (let y = 0; y <= 64; y++) por(b, 3, 5, y, ID.stone)
    por(b, 3, 5, 64, 0) // o jogador minera o bloco de cima
    expect(topoOpacoDaColuna(b, 3, 5), 'o chão continuou onde não há mais chão').toBe(64)
  })

  it('construir sobe a altura na hora', () => {
    const b = colunaVazia()
    for (let y = 0; y <= 64; y++) por(b, 3, 5, y, ID.stone)
    por(b, 3, 5, 65, ID.oakPlanks)
    expect(topoOpacoDaColuna(b, 3, 5)).toBe(66)
  })

  it('vidro e folha NÃO contam: o topo é OPACO, e é por isso que a luz passa', () => {
    const b = colunaVazia()
    for (let y = 0; y <= 64; y++) por(b, 3, 5, y, ID.stone)
    por(b, 3, 5, 70, ID.glass)
    por(b, 3, 5, 72, ID.oakLeaves)
    expect(topoOpacoDaColuna(b, 3, 5)).toBe(65)
  })

  it('cada coluna é a sua — cavar numa não mexe na vizinha', () => {
    const b = colunaVazia()
    for (let y = 0; y <= 64; y++) {
      por(b, 3, 5, y, ID.stone)
      por(b, 4, 5, y, ID.stone)
    }
    por(b, 3, 5, 64, 0)
    expect(topoOpacoDaColuna(b, 3, 5)).toBe(64)
    expect(topoOpacoDaColuna(b, 4, 5)).toBe(65)
  })
})
