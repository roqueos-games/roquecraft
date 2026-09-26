import { describe, it, expect } from 'vitest'
import { metadeGemea } from '../../src/servicos/duplos.js'
import { idDaPorta } from '../../src/servicos/porta.js'
import { BLOCK_BY_KEY } from '../../src/servicos/blocks.js'
import { ID_PE, ID_CABECEIRA } from '../../src/servicos/cama.js'

// A ÚNICA PERGUNTA que `breakBlock` faz sobre cama e porta: qual é a outra
// metade. Se uma das duas famílias parar de responder aqui, a metade órfã
// fica no mundo — e este é o teste que grita antes do jogador.
describe('roquecraft - duplos: a outra metade de cama e porta', () => {
  const mundo = (mapa) => (x, y, z) => mapa[`${x},${y},${z}`] ?? 0
  const PE = ID_PE
  const CABECEIRA = ID_CABECEIRA
  const PORTA_BAIXO = idDaPorta('oakDoor', 5, false, false)
  const PORTA_CIMA = idDaPorta('oakDoor', 5, false, true)

  it('da cama responde a cama', () => {
    const m = mundo({ '4,10,7': PE, '5,10,7': CABECEIRA })
    expect(metadeGemea(PE, 4, 10, 7, m)).toMatchObject({ x: 5, y: 10, z: 7, id: CABECEIRA })
  })

  it('da porta responde a porta, nas duas direções', () => {
    const m = mundo({ '4,10,7': PORTA_BAIXO, '4,11,7': PORTA_CIMA })
    expect(metadeGemea(PORTA_BAIXO, 4, 10, 7, m)).toMatchObject({
      x: 4,
      y: 11,
      z: 7,
      id: PORTA_CIMA,
    })
    expect(metadeGemea(PORTA_CIMA, 4, 11, 7, m)).toMatchObject({
      x: 4,
      y: 10,
      z: 7,
      id: PORTA_BAIXO,
    })
  })

  it('pedra não tem gêmea, e metade órfã devolve null', () => {
    const m = mundo({ '4,10,7': PORTA_BAIXO })
    expect(metadeGemea(BLOCK_BY_KEY.stone.id, 4, 10, 7, m)).toBeNull()
    expect(metadeGemea(PORTA_BAIXO, 4, 10, 7, m)).toBeNull()
  })
})
