import { describe, it, expect } from 'vitest'
import { AIR, BLOCKS, BLOCK_BY_KEY, ID, isReplaceable } from '../../src/servicos/blocks.js'
import { EYE_HEIGHT } from '../../src/servicos/constants.js'
import {
  ehPorta,
  idDaPorta,
  encaixarPorta,
  outraMetadeDaPorta,
  virarPorta,
} from '../../src/servicos/porta.js'
import { resolverColocacao } from '../../src/servicos/colocacao.js'
import { interagirComBloco } from '../../src/servicos/interacao.js'
import {
  CAIXAS_DE_BLOCO,
  FACES_DE_BLOCO,
  EH_FORMA_LIVRE,
  centroDoVao,
} from '../../src/servicos/formas.js'
import { SOLIDO_DE_BLOCO } from '../../src/servicos/blocks.js'

//
// A PORTA — a cama (duas células) casada com o portão (vira para o jogador, o
// clique abre). Goal 21, onda 2: "a vila tem vão aberto" desde 13/09.
//

const PEDRA = BLOCK_BY_KEY.stone.id
const k = (x, y, z) => `${x},${y},${z}`
function mundoDe(mapa) {
  return {
    getBlock: (x, y, z) => mapa[k(x, y, z)] ?? AIR,
    solidAt: (x, y, z) => {
      const id = mapa[k(x, y, z)]
      return id != null && id !== AIR && !isReplaceable(id)
    },
    setBlock: (x, y, z, id) => (mapa[k(x, y, z)] = id),
  }
}
const chao = () => ({ [k(0, 63, 0)]: PEDRA, [k(1, 63, 0)]: PEDRA })
const LONGE = { x: 40.5, y: 64 - EYE_HEIGHT, z: 40.5 }
const cliqueNoTopo = () => ({
  hit: { x: 0, y: 63, z: 0 },
  place: { x: 0, y: 64, z: 0 },
  normal: { x: 0, y: 1, z: 0 },
  point: { x: 0.5, y: 64, z: 0.5 },
})

describe('o catálogo da porta', () => {
  it('são 16 variantes, uma só vira item, uma só dropa', () => {
    const portas = Object.values(BLOCKS).filter((b) => b.porta)
    expect(portas).toHaveLength(16)
    expect(portas.filter((b) => !b.semItem).map((b) => b.key)).toEqual(['oakDoor'])
    expect(portas.filter((b) => b.drops).every((b) => !b.porta.cima)).toBe(true)
    expect(portas.filter((b) => b.porta.cima).every((b) => b.drops === null)).toBe(true)
  })

  it('cada variante tem forma própria: caixa e faces, e sai do greedy', () => {
    for (const b of Object.values(BLOCKS).filter((b) => b.porta)) {
      expect(CAIXAS_DE_BLOCO[b.id], b.key).toHaveLength(1)
      expect(FACES_DE_BLOCO[b.id], b.key).toHaveLength(6)
      expect(EH_FORMA_LIVRE[b.id], b.key).toBe(1)
    }
  })

  it('⚠️ a fechada bloqueia o vão e a aberta deixa 13/16 de passagem', () => {
    // A física lê `SOLIDO_DE_BLOCO`; a aberta colide só na folha junto ao
    // batente (3/16), senão o jogador atravessaria a folha desenhada.
    const fechada = SOLIDO_DE_BLOCO[idDaPorta('oakDoor', 5, false, false)][0]
    const aberta = SOLIDO_DE_BLOCO[idDaPorta('oakDoor', 5, true, false)][0]
    expect(fechada[3] - fechada[0], 'a fechada não cobre a largura').toBe(1)
    expect(fechada[5] - fechada[2], 'a fechada é fina').toBeCloseTo(3 / 16, 6)
    expect(aberta[3] - aberta[0], 'a aberta é fina').toBeCloseTo(3 / 16, 6)
    expect(aberta[5] - aberta[2], 'a aberta corre a célula inteira').toBe(1)
  })

  it('`centroDoVao` aponta o meio do que está LIVRE, não o meio da célula', () => {
    // Para cada orientação aberta: o vão fica do lado oposto ao da folha, com
    // 13/16 de largura; o centro é 0,594 ou 0,406 no eixo da folha e 0,5 no outro.
    for (const orient of [0, 1, 4, 5]) {
      const id = idDaPorta('oakDoor', orient, true, false)
      const folha = SOLIDO_DE_BLOCO[id][0]
      const c = centroDoVao(id)
      expect(c, `orient ${orient}`).not.toBeNull()
      const fina = folha[3] - folha[0] < 0.5 ? 'x' : 'z'
      const [a, b] = fina === 'x' ? [folha[0], folha[3]] : [folha[2], folha[5]]
      const esperado = a <= 0 ? (b + 1) / 2 : a / 2
      expect(c[fina], `orient ${orient}, eixo ${fina}`).toBeCloseTo(esperado, 6)
      expect(c[fina === 'x' ? 'z' : 'x']).toBe(0.5)
      expect(Math.abs(c[fina] - 0.5), 'não é o centro da célula').toBeGreaterThan(0.05)
    }
    expect(centroDoVao(idDaPorta('oakDoor', 5, false, false)), 'fechada não tem vão').toBeNull()
    expect(centroDoVao(BLOCK_BY_KEY.stone.id)).toBeNull()
  })

  it('a metade de cima usa a textura de cima, a de baixo a de baixo', () => {
    expect(BLOCK_BY_KEY.oakDoor.faces.side).toBe('oak_door_bottom')
    expect(BLOCK_BY_KEY.oakDoorCima.faces.side).toBe('oak_door_top')
  })
})

describe('onde a porta cabe', () => {
  const livreEm = (mapa) => (x, y, z) => (mapa[k(x, y, z)] ?? AIR) === AIR
  const apoiadoEm = (mapa) => (x, y, z) => (mapa[k(x, y, z)] ?? AIR) !== AIR

  it('nasce FECHADA, virada para o jogador, com a metade de cima em cima', () => {
    const mapa = chao()
    const r = encaixarPorta({
      item: 'oakDoor',
      destino: { x: 0, y: 64, z: 0 },
      dirX: 0,
      dirZ: 1, // olhando para +Z: o jogador está em −Z
      livre: livreEm(mapa),
      apoiado: apoiadoEm(mapa),
    })
    expect(r).toBeTruthy()
    expect(BLOCKS[r.baixo.id].porta).toEqual({ orient: 5, aberta: false, cima: false })
    expect(r.cima).toEqual({ x: 0, y: 65, z: 0, id: idDaPorta('oakDoor', 5, false, true) })
  })

  it('cada direção do olhar dá uma orientação diferente', () => {
    const mapa = chao()
    const ids = new Set()
    for (const [dx, dz] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ]) {
      const r = encaixarPorta({
        item: 'oakDoor',
        destino: { x: 0, y: 64, z: 0 },
        dirX: dx,
        dirZ: dz,
        livre: livreEm(mapa),
        apoiado: apoiadoEm(mapa),
      })
      ids.add(r.baixo.id)
    }
    expect(ids.size).toBe(4)
  })

  it('⚠️ sem a célula de CIMA livre, não entra nenhuma metade', () => {
    const mapa = { ...chao(), [k(0, 65, 0)]: PEDRA }
    expect(
      encaixarPorta({
        item: 'oakDoor',
        destino: { x: 0, y: 64, z: 0 },
        dirX: 0,
        dirZ: 1,
        livre: livreEm(mapa),
        apoiado: apoiadoEm(mapa),
      }),
    ).toBeNull()
  })

  it('sem apoio embaixo, não entra', () => {
    const mapa = {}
    expect(
      encaixarPorta({
        item: 'oakDoor',
        destino: { x: 0, y: 64, z: 0 },
        dirX: 0,
        dirZ: 1,
        livre: livreEm(mapa),
        apoiado: apoiadoEm(mapa),
      }),
    ).toBeNull()
  })

  it('item que não é porta devolve null', () => {
    const mapa = chao()
    expect(
      encaixarPorta({
        item: 'stone',
        destino: { x: 0, y: 64, z: 0 },
        dirX: 0,
        dirZ: 1,
        livre: livreEm(mapa),
        apoiado: apoiadoEm(mapa),
      }),
    ).toBeNull()
  })

  it('pelo caminho comum: `resolverColocacao` devolve as DUAS células', () => {
    const r = resolverColocacao({
      item: 'oakDoor',
      hit: cliqueNoTopo(),
      olhar: { x: 0, z: 1 },
      mundo: mundoDe(chao()),
      jogador: LONGE,
    })
    expect(r).toBeTruthy()
    expect(r.celulas).toHaveLength(2)
    expect(r.celulas[1].y).toBe(r.celulas[0].y + 1)
    expect(r.principal).toEqual(r.celulas[0])
    expect(r.cama).toBe(false)
  })
})

describe('as duas metades se acham, e viram juntas', () => {
  const baixo = idDaPorta('oakDoor', 5, false, false)
  const cima = idDaPorta('oakDoor', 5, false, true)

  it('de baixo se acha a de cima, e vice-versa', () => {
    const mapa = { ...chao(), [k(0, 64, 0)]: baixo, [k(0, 65, 0)]: cima }
    const m = mundoDe(mapa)
    expect(outraMetadeDaPorta(baixo, 0, 64, 0, m.getBlock)).toEqual({ x: 0, y: 65, z: 0, id: cima })
    expect(outraMetadeDaPorta(cima, 0, 65, 0, m.getBlock)).toEqual({ x: 0, y: 64, z: 0, id: baixo })
  })

  it('metade órfã devolve null; bloco que não é porta nem procura', () => {
    const m = mundoDe({ ...chao(), [k(0, 64, 0)]: baixo })
    expect(outraMetadeDaPorta(baixo, 0, 64, 0, m.getBlock)).toBeNull()
    expect(outraMetadeDaPorta(PEDRA, 0, 63, 0, m.getBlock)).toBeNull()
    expect(ehPorta(PEDRA)).toBe(false)
    expect(ehPorta(baixo)).toBe(true)
  })

  it('⚠️ virar escreve as DUAS metades, abertas; virar de novo fecha as duas', () => {
    const mapa = { ...chao(), [k(0, 64, 0)]: baixo, [k(0, 65, 0)]: cima }
    const m = mundoDe(mapa)
    const abre = virarPorta(baixo, 0, 64, 0, m.getBlock)
    expect(abre).toHaveLength(2)
    for (const e of abre) m.setBlock(e.x, e.y, e.z, e.id)
    expect(BLOCKS[m.getBlock(0, 64, 0)].porta).toEqual({ orient: 5, aberta: true, cima: false })
    expect(BLOCKS[m.getBlock(0, 65, 0)].porta).toEqual({ orient: 5, aberta: true, cima: true })
    const fecha = virarPorta(m.getBlock(0, 65, 0), 0, 65, 0, m.getBlock)
    for (const e of fecha) m.setBlock(e.x, e.y, e.z, e.id)
    expect(m.getBlock(0, 64, 0)).toBe(baixo)
    expect(m.getBlock(0, 65, 0)).toBe(cima)
  })

  it('pelo clique de verdade: `interagirComBloco` vira e toca madeira', () => {
    const mapa = { ...chao(), [k(0, 64, 0)]: baixo, [k(0, 65, 0)]: cima }
    const m = mundoDe(mapa)
    const escritas = []
    const sons = []
    const ok = interagirComBloco(
      { hit: { x: 0, y: 65, z: 0 } },
      {
        blocoEm: m.getBlock,
        editar: (x, y, z, id) => {
          escritas.push([x, y, z, id])
          m.setBlock(x, y, z, id)
        },
        tocar: (s) => sons.push(s),
      },
    )
    expect(ok).toBe(true)
    expect(escritas).toHaveLength(2)
    expect(sons).toEqual(['wood'])
    expect(BLOCKS[m.getBlock(0, 64, 0)].porta.aberta).toBe(true)
  })

  it('o id da variante existe para as 4 orientações × 2 estados × 2 metades', () => {
    for (const o of [0, 1, 4, 5])
      for (const a of [false, true])
        for (const c of [false, true]) expect(idDaPorta('oakDoor', o, a, c)).toBeGreaterThan(0)
    expect(ID.oakDoor).toBe(idDaPorta('oakDoor', 0, false, false))
  })
})
