import { describe, it, expect } from 'vitest'
import {
  criarRuidoDoFim,
  gerarChunkDoFim,
  colunaDaIlha,
  centrosDosPilares,
  RAIO_DA_ILHA,
  CHAO_DA_ILHA,
  PILARES,
  FONTE,
  PLATAFORMA,
  POUSO_DA_CHEGADA,
} from '../../src/servicos/endWorldgen.js'
import { criarGerador } from '../../src/servicos/geradores.js'
import { ID, AIR } from '../../src/servicos/blocks.js'
import {
  CHUNK_SIZE,
  WORLD_HEIGHT,
  toChunkCoord,
  toLocalCoord,
} from '../../src/servicos/constants.js'
import { problemasDoRegistro, dimensao } from '../../src/servicos/dimensoes.js'

const nz = criarRuidoDoFim(7)
const gerado = new Map()
const blocoEm = (x, y, z) => {
  const cx = toChunkCoord(x)
  const cz = toChunkCoord(z)
  const k = `${cx},${cz}`
  if (!gerado.has(k)) gerado.set(k, gerarChunkDoFim(nz, cx, cz).blocks)
  return gerado.get(k)[(toLocalCoord(x) * CHUNK_SIZE + toLocalCoord(z)) * WORLD_HEIGHT + y]
}

describe('o Fim — a ilha no vazio', () => {
  it('a dimensão está no registro, válida, sem mar e sem teto', () => {
    expect(problemasDoRegistro()).toEqual([])
    expect(dimensao('end')).toMatchObject({
      liquidoDoMar: null,
      tetoIndestrutivel: null,
      temCeu: false,
    })
  })

  it('no centro há pedra do Fim no chão; longe do raio só há ar', () => {
    const col = colunaDaIlha(nz, 0, 0)
    expect(col.ate).toBeGreaterThanOrEqual(CHAO_DA_ILHA - 3)
    expect(col.ate).toBeLessThanOrEqual(CHAO_DA_ILHA + 3)
    expect(col.de).toBeLessThan(col.ate - 10)
    expect(colunaDaIlha(nz, RAIO_DA_ILHA + 20, 0)).toBe(null)
    // Um chunk inteiro fora da ilha é só ar — nem bedrock: é o vazio.
    const longe = gerarChunkDoFim(nz, 20, 20).blocks
    expect(longe.every((b) => b === AIR)).toBe(true)
  })

  it('a ilha afina para a borda: a base sobe com a distância', () => {
    const centro = colunaDaIlha(nz, 0, 0)
    const meio = colunaDaIlha(nz, 30, 0)
    expect(meio.de).toBeGreaterThan(centro.de)
  })

  it('os pilares são obsidiana do chão até a altura de cada um, num anel', () => {
    const pilares = centrosDosPilares()
    expect(pilares).toHaveLength(PILARES)
    for (const p of pilares) {
      expect(Math.hypot(p.x, p.z)).toBeGreaterThan(20)
      expect(blocoEm(p.x, p.altura, p.z), `topo do pilar em ${p.x},${p.z}`).toBe(ID.obsidian)
      expect(blocoEm(p.x, p.altura + 1, p.z)).toBe(AIR)
      expect(blocoEm(p.x, CHAO_DA_ILHA + 5, p.z)).toBe(ID.obsidian)
    }
  })

  it('a fonte: bedrock 5×5 no centro com o miolo 3×3 vazio, esperando o portal de saída', () => {
    expect(blocoEm(FONTE.x + 2, FONTE.y + 1, FONTE.z + 2)).toBe(ID.bedrock)
    expect(blocoEm(FONTE.x, FONTE.y, FONTE.z)).toBe(ID.bedrock)
    expect(blocoEm(FONTE.x, FONTE.y + 1, FONTE.z), 'o miolo é ar até o dragão cair').toBe(AIR)
    expect(blocoEm(FONTE.x, FONTE.y + 2, FONTE.z)).toBe(AIR)
  })

  it('a plataforma de chegada é obsidiana com ar em cima, e o pouso é em pé nela', () => {
    expect(blocoEm(PLATAFORMA.x, PLATAFORMA.y, PLATAFORMA.z)).toBe(ID.obsidian)
    expect(blocoEm(PLATAFORMA.x - 2, PLATAFORMA.y, PLATAFORMA.z + 2)).toBe(ID.obsidian)
    for (let y = 1; y <= 3; y++)
      expect(blocoEm(PLATAFORMA.x, PLATAFORMA.y + y, PLATAFORMA.z)).toBe(AIR)
    expect(POUSO_DA_CHEGADA).toEqual({
      x: PLATAFORMA.x + 0.5,
      y: PLATAFORMA.y + 1,
      z: PLATAFORMA.z + 0.5,
    })
  })

  it('o heightmap acompanha: topo sólido da coluna, e 0 no vazio', () => {
    const c = gerarChunkDoFim(nz, 0, 0)
    expect(c.heights[0]).toBeGreaterThan(0)
    expect(gerarChunkDoFim(nz, 20, 20).heights.every((h) => h === 0)).toBe(true)
  })

  it('geradores.js escolhe pela dimensão, e o mesmo ruído dá o mesmo chunk', () => {
    const a = criarGerador(7, 'end')(0, 0).blocks
    const b = gerarChunkDoFim(criarRuidoDoFim(7), 0, 0).blocks
    expect(Array.from(a)).toEqual(Array.from(b))
    expect(criarGerador(7, 'nether')(0, 0).blocks[0]).toBe(ID.bedrock)
    expect(criarGerador(7, 'overworld')(0, 0).blocks[0]).toBe(ID.bedrock)
  })
})
