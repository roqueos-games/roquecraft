// Trava T1: o mundo cabia em 255 tipos de bloco porque `chunk.blocks` era um
// Uint8Array de ids globais. Agora ele guarda ÍNDICE, e a paleta do chunk diz
// qual id cada índice é.
//
// O critério do plano é este arquivo: "mais de 256 estados fazem ida e volta".
import { describe, it, expect } from 'vitest'
import {
  criarPaleta,
  indiceDe,
  inserir,
  compactar,
  clonarPaleta,
  serializarPaleta,
  desserializarPaleta,
  expandirParaIds,
  tabelaLocal,
  MAX_ENTRADAS,
} from '../../src/servicos/paleta.js'
import {
  createWorld,
  createChunk,
  putChunk,
  getBlock,
  setBlock,
  setBlockRaw,
  instalarBlocos,
  gravarNoIndice,
  idNoIndice,
  promoverChunk,
} from '../../src/servicos/chunkStore.js'
import { buildNeighborhood, neighborhoodAccessor } from '../../src/servicos/neighborhood.js'
import { localIndex, AIR, CHUNK_VOLUME } from '../../src/servicos/constants.js'
import { ID } from '../../src/servicos/blocks.js'

const mundoCom1Chunk = () => {
  const w = createWorld(1)
  const c = createChunk(0, 0)
  c.generated = true
  putChunk(w, c)
  return { w, c }
}

describe('a paleta em si', () => {
  it('o indice 0 e AR, sempre: chunk novo nasce vazio sem ninguem escrever nada', () => {
    const p = criarPaleta()
    expect(p.ids[0]).toBe(AIR)
    expect(indiceDe(p, AIR)).toBe(0)
    expect(p.tamanho).toBe(1)
  })

  it('inserir o mesmo id duas vezes nao gasta duas entradas', () => {
    const p = criarPaleta()
    expect(inserir(p, ID.stone)).toBe(1)
    expect(inserir(p, ID.stone)).toBe(1)
    expect(p.tamanho).toBe(2)
  })

  it('enche em 256 e ai recusa, sem estourar o array', () => {
    const p = criarPaleta()
    for (let i = 1; i < MAX_ENTRADAS; i++) expect(inserir(p, i)).toBe(i)
    expect(p.tamanho).toBe(MAX_ENTRADAS)
    expect(inserir(p, 9000), 'cheia devolve -1 em vez de escrever fora').toBe(-1)
  })

  it('compactar recolhe entrada que nenhum voxel usa mais, e os indices continuam certos', () => {
    const p = criarPaleta()
    const blocks = new Uint8Array(8)
    const pedra = inserir(p, ID.stone)
    const terra = inserir(p, ID.dirt)
    const orfa = inserir(p, ID.sand)
    blocks[0] = pedra
    blocks[1] = terra
    expect(p.tamanho).toBe(4)
    expect(compactar(p, blocks), 'a areia nao esta em nenhum voxel').toBe(1)
    expect(p.tamanho).toBe(3)
    expect(p.ids[blocks[0]]).toBe(ID.stone)
    expect(p.ids[blocks[1]]).toBe(ID.dirt)
    expect(indiceDe(p, ID.sand)).toBe(-1)
    expect(orfa).toBeGreaterThan(0)
  })

  it('compactar guarda o AR mesmo num chunk sem um voxel de ar', () => {
    const p = criarPaleta()
    const blocks = new Uint8Array(4)
    blocks.fill(inserir(p, ID.stone))
    compactar(p, blocks)
    expect(p.ids[0], 'zero tem que continuar significando ar').toBe(AIR)
    expect(p.ids[blocks[0]]).toBe(ID.stone)
  })

  it('clonar de verdade: mexer na copia nao mexe no original', () => {
    const p = criarPaleta()
    inserir(p, ID.stone)
    const q = clonarPaleta(p)
    inserir(q, ID.dirt)
    expect(indiceDe(p, ID.dirt), 'paleta compartilhada e um chunk escrevendo no outro').toBe(-1)
    expect(indiceDe(q, ID.dirt)).toBe(2)
  })

  it('ida e volta pela serializacao', () => {
    const p = criarPaleta()
    inserir(p, ID.stone)
    inserir(p, 4000)
    const q = desserializarPaleta(serializarPaleta(p))
    expect(serializarPaleta(q)).toEqual([AIR, ID.stone, 4000])
    expect(indiceDe(q, 4000)).toBe(2)
  })

  it('entrada corrompida no save vira AR em vez de derrubar o mundo', () => {
    const q = desserializarPaleta([0, ID.stone, 'lixo', -3, 999999])
    expect(serializarPaleta(q)).toEqual([AIR, ID.stone, AIR, AIR, AIR])
  })

  it('paleta ausente e chunk PROMOVIDO, nao paleta vazia', () => {
    expect(desserializarPaleta(null)).toBeNull()
    expect(serializarPaleta(null)).toBeNull()
  })

  it('a tabela local responde a mesma coisa que a global, por indice', () => {
    const p = criarPaleta()
    const i = inserir(p, ID.stone)
    const global = new Uint8Array(70000)
    global[ID.stone] = 1
    const local = tabelaLocal(p, global)
    expect(local[i]).toBe(1)
    expect(local[0], 'ar nao e opaco').toBe(0)
    expect(tabelaLocal(null, global), 'chunk promovido le a global direto').toBeNull()
  })
})

describe('o chunk com paleta', () => {
  it('grava e le id global: a paleta e invisivel para quem usa o mundo', () => {
    const { w } = mundoCom1Chunk()
    setBlockRaw(w, 3, 10, 4, ID.stone)
    expect(getBlock(w, 3, 10, 4)).toBe(ID.stone)
    expect(getBlock(w, 3, 11, 4)).toBe(AIR)
  })

  it('MAIS DE 256 ESTADOS fazem ida e volta — o criterio do plano', () => {
    const { w, c } = mundoCom1Chunk()
    // 400 tipos distintos espalhados em colunas (o mundo tem 128 de altura)
    const pos = []
    for (let i = 0; i < 400; i++)
      pos.push({ id: 1000 + i, x: i % 16, y: 10 + ((i / 256) | 0), z: (i >> 4) % 16 })
    for (const p of pos) setBlockRaw(w, p.x, p.y, p.z, p.id)
    for (const p of pos) expect(getBlock(w, p.x, p.y, p.z), `(${p.x},${p.y},${p.z})`).toBe(p.id)
    expect(
      c.paleta,
      '400 tipos num chunk so nao cabem em 256 indices: ele foi promovido',
    ).toBeNull()
    expect(c.blocks.BYTES_PER_ELEMENT).toBe(2)
  })

  it('promover NAO perde nem troca nenhum bloco que ja estava la', () => {
    const { w, c } = mundoCom1Chunk()
    setBlockRaw(w, 1, 5, 1, ID.stone)
    setBlockRaw(w, 1, 6, 1, ID.dirt)
    promoverChunk(c)
    expect(c.paleta).toBeNull()
    expect(getBlock(w, 1, 5, 1)).toBe(ID.stone)
    expect(getBlock(w, 1, 6, 1)).toBe(ID.dirt)
    expect(getBlock(w, 1, 7, 1)).toBe(AIR)
  })

  it('cavar e recolocar 300 vezes o MESMO tipo nao promove o chunk', () => {
    const { w, c } = mundoCom1Chunk()
    for (let i = 0; i < 300; i++) {
      setBlockRaw(w, 2, 20, 2, ID.stone)
      setBlockRaw(w, 2, 20, 2, AIR)
    }
    expect(c.paleta, 'entrada orfa nao pode custar a promocao do chunk').not.toBeNull()
    expect(c.paleta.tamanho).toBeLessThan(5)
  })

  it('a paleta enche de LIXO e a compactacao devolve o espaco antes de promover', () => {
    const { w, c } = mundoCom1Chunk()
    // 255 tipos diferentes no MESMO voxel: cada um deixa a entrada anterior orfa
    for (let i = 1; i <= 255; i++) setBlockRaw(w, 5, 30, 5, 2000 + i)
    expect(c.paleta, 'so um voxel usado: compactar tinha que ter bastado').not.toBeNull()
    expect(getBlock(w, 5, 30, 5)).toBe(2255)
  })

  it('setBlock (com edit) tambem passa pela paleta', () => {
    const { w } = mundoCom1Chunk()
    setBlock(w, 7, 40, 8, 3000)
    expect(getBlock(w, 7, 40, 8)).toBe(3000)
    expect([...w.edits.get('0,0').values()], 'o EDIT guarda id global, nao indice').toEqual([3000])
  })

  it('instalarBlocos converte o array de ids do gerador sem mudar um voxel', () => {
    const c = createChunk(0, 0)
    const ids = new Uint16Array(CHUNK_VOLUME)
    ids[localIndex(1, 2, 3)] = ID.stone
    ids[localIndex(1, 3, 3)] = ID.dirt
    instalarBlocos(c, ids)
    expect(idNoIndice(c, localIndex(1, 2, 3))).toBe(ID.stone)
    expect(idNoIndice(c, localIndex(1, 3, 3))).toBe(ID.dirt)
    expect(idNoIndice(c, localIndex(0, 0, 0))).toBe(AIR)
    expect(c.blocks.BYTES_PER_ELEMENT, 'o armazenamento continua em 8 bits').toBe(1)
  })

  it('expandirParaIds devolve o mesmo array quando nao ha paleta', () => {
    const b = new Uint16Array([1, 2, 3])
    expect(expandirParaIds(b, null)).toBe(b)
  })

  it('o zero continua sendo ar mesmo depois de 200 tipos entrarem na paleta', () => {
    const { w, c } = mundoCom1Chunk()
    for (let i = 1; i <= 200; i++) setBlockRaw(w, i % 16, 60 + (i % 30), (i * 3) % 16, 500 + i)
    expect(c.paleta.ids[0]).toBe(AIR)
    expect(getBlock(w, 0, 5, 0), 'voxel nunca tocado continua ar').toBe(AIR)
  })

  it('gravarNoIndice aceita id acima de 255 — o ponto de tudo isto', () => {
    const c = createChunk(0, 0)
    gravarNoIndice(c, 10, 60000)
    expect(idNoIndice(c, 10)).toBe(60000)
  })
})

describe('a vizinhanca que o mesher le', () => {
  // Cada vizinho tem a PROPRIA paleta: o mesmo indice significa blocos
  // diferentes em chunks diferentes. Se a vizinhanca copiasse indice em vez de
  // traduzir para id global, o mesher desenharia o bloco errado — e a colisao
  // concordaria com o engano, porque ela le por outro caminho.
  const mundo3x3 = () => {
    const w = createWorld(5)
    for (let cx = -1; cx <= 1; cx++)
      for (let cz = -1; cz <= 1; cz++) {
        const c = createChunk(cx, cz)
        c.generated = true
        c.lit = true
        putChunk(w, c)
      }
    return w
  }

  it('devolve ID GLOBAL, nao o indice da paleta do chunk', () => {
    const w = mundo3x3()
    // um id BEM longe de 1, senao o indice 1 coincidiria com o id e o teste
    // passaria com a traducao e sem ela
    const ALTO = 4096
    setBlockRaw(w, 3, 20, 4, ALTO)
    const c = w.chunks.get('0,0')
    const indice = c.blocks[localIndex(3, 20, 4)]
    expect(indice, 'primeiro tipo do chunk: indice 1').toBe(1)
    const acc = neighborhoodAccessor(buildNeighborhood(w, 0, 0))
    expect(acc.block(3, 20, 4)).toBe(ALTO)
  })

  it('dois vizinhos com paletas DIFERENTES nao trocam de bloco na moldura', () => {
    const w = mundo3x3()
    // no chunk central o indice 1 e pedra; no vizinho da esquerda, e areia
    setBlockRaw(w, 0, 30, 0, ID.dirt)
    setBlockRaw(w, -1, 30, 0, ID.sand)
    expect(w.chunks.get('0,0').blocks[localIndex(0, 30, 0)]).toBe(1)
    expect(w.chunks.get('-1,0').blocks[localIndex(15, 30, 0)]).toBe(1)
    expect(ID.dirt, 'os dois tem o indice 1 e ids DIFERENTES: e esse o teste').not.toBe(ID.sand)
    const acc = neighborhoodAccessor(buildNeighborhood(w, 0, 0))
    expect(acc.block(0, 30, 0)).toBe(ID.dirt)
    expect(acc.block(-1, 30, 0), 'a moldura vem do vizinho, com a paleta DELE').toBe(ID.sand)
  })

  it('id acima de 255 chega inteiro na vizinhanca', () => {
    const w = mundo3x3()
    setBlockRaw(w, 2, 40, 2, 4321)
    const acc = neighborhoodAccessor(buildNeighborhood(w, 0, 0))
    expect(acc.block(2, 40, 2)).toBe(4321)
  })

  it('chunk PROMOVIDO tambem entrega id global', () => {
    const w = mundo3x3()
    setBlockRaw(w, 6, 50, 6, ID.dirt)
    promoverChunk(w.chunks.get('0,0'))
    const acc = neighborhoodAccessor(buildNeighborhood(w, 0, 0))
    expect(acc.block(6, 50, 6)).toBe(ID.dirt)
  })
})
