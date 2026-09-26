import { describe, it, expect } from 'vitest'
import {
  criarRuidoDoNether,
  gerarChunkDoNether,
  bordasDaColuna,
  viesDaAltura,
  MAR_DE_LAVA,
} from '../../src/servicos/netherWorldgen.js'
import { CHUNK_SIZE, WORLD_HEIGHT, localIndex, AIR } from '../../src/servicos/constants.js'
import { ID } from '../../src/servicos/blocks.js'
import { dimensao, limites } from '../../src/servicos/dimensoes.js'

// O NETHER GERADO — e o que só se descobre contando.
//
// ⚠️ TRÊS DEFEITOS DESTE ARQUIVO NASCERAM DE PALPITE E MORRERAM DE MEDIÇÃO, e
// os três estão travados aqui:
//
//   1. `fbm2` tem SINAL. Tratando a saída como 0..1 o teto do mundo subia acima
//      de 127 em parte das colunas e a condição do bedrock não pegava: buraco no
//      teto, que é exatamente por onde o jogador escaparia.
//   2. O limiar do vazio "quase metade" abriu 17% do volume. O jogador
//      atravessaria o portal para dentro de rocha maciça.
//   3. Sem viés de altura, tudo que abre abaixo de 31 vira lava: o corte
//      vertical saiu com 28 blocos de lava de parede a parede, sem uma ilha.
//
// Nenhum dos três aparece lendo o código. Todos aparecem contando blocos.

const NETHER = dimensao('nether')
const nz = criarRuidoDoNether(942457)

const chunks = new Map()
const chunkDe = (cx, cz) => {
  const k = `${cx},${cz}`
  let c = chunks.get(k)
  if (!c) chunks.set(k, (c = gerarChunkDoNether(nz, cx, cz)))
  return c
}

const AMOSTRA = []
for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) AMOSTRA.push(chunkDe(cx, cz))

function censo() {
  const conta = new Map()
  let total = 0
  for (const { blocks } of AMOSTRA) {
    for (let i = 0; i < blocks.length; i++) {
      conta.set(blocks[i], (conta.get(blocks[i]) || 0) + 1)
      total++
    }
  }
  return { conta, total, fracao: (id) => (conta.get(id) || 0) / total }
}
const CENSO = censo()

describe('as bordas do mundo', () => {
  it('o teto e o piso sao bedrock em TODA coluna — nao ha buraco no topo', () => {
    const { maxY, minY } = limites('nether')
    const furos = []
    for (const { blocks } of AMOSTRA) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
          if (blocks[localIndex(lx, maxY, lz)] !== ID.bedrock) furos.push(`teto ${lx},${lz}`)
          if (blocks[localIndex(lx, minY, lz)] !== ID.bedrock) furos.push(`piso ${lx},${lz}`)
        }
      }
    }
    expect(furos.slice(0, 5)).toEqual([])
  })

  it('a rocha eterna e irregular: o teto nao e uma laje de uma altura so', () => {
    const alturas = new Set()
    for (let x = 0; x < 40; x++) alturas.add(bordasDaColuna(nz, x, x * 3).tetoDe)
    expect(alturas.size).toBeGreaterThan(1)
  })

  it('o teto fica DENTRO do mundo em toda coluna que se pergunte', () => {
    const { maxY } = limites('nether')
    for (let x = -300; x < 300; x += 7) {
      const { pisoAte, tetoDe } = bordasDaColuna(nz, x, -x)
      expect(tetoDe).toBeLessThanOrEqual(maxY)
      expect(tetoDe).toBeGreaterThan(pisoAte)
      expect(pisoAte).toBeGreaterThanOrEqual(NETHER.pisoIndestrutivel)
    }
  })
})

describe('o volume', () => {
  it('abre o bastante para ser salao, e nao tanto que vire vazio', () => {
    const aberto = CENSO.fracao(AIR) + CENSO.fracao(ID.lava)
    expect(aberto).toBeGreaterThan(0.3)
    expect(aberto).toBeLessThan(0.6)
  })

  it('tem massa de rocha embaixo: o mar de lava tem margem, nao e oceano', () => {
    let abaixoAberto = 0
    let abaixoTotal = 0
    for (const { blocks } of AMOSTRA) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
          for (let y = 6; y <= MAR_DE_LAVA; y++) {
            abaixoTotal++
            if (blocks[localIndex(lx, y, lz)] === ID.lava) abaixoAberto++
          }
        }
      }
    }
    const fracao = abaixoAberto / abaixoTotal
    expect(fracao).toBeGreaterThan(0.02)
    expect(fracao).toBeLessThan(0.45)
  })

  it('o vies de altura fecha embaixo e em cima, e solta no meio', () => {
    expect(viesDaAltura(0)).toBeGreaterThan(viesDaAltura(64))
    expect(viesDaAltura(NETHER.tetoIndestrutivel)).toBeGreaterThan(viesDaAltura(64))
    expect(viesDaAltura(64)).toBe(0)
  })

  it('da para ficar em pe: ha coluna com folga de corpo acima do mar de lava', () => {
    let melhor = 0
    for (const { blocks } of AMOSTRA) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
          let seguidos = 0
          for (let y = MAR_DE_LAVA + 1; y < WORLD_HEIGHT; y++) {
            seguidos = blocks[localIndex(lx, y, lz)] === AIR ? seguidos + 1 : 0
            if (seguidos > melhor) melhor = seguidos
          }
        }
      }
    }
    expect(melhor).toBeGreaterThanOrEqual(8)
  })
})

describe('a lava', () => {
  it('nunca aparece acima do mar de lava da dimensao', () => {
    const acima = []
    for (const { blocks } of AMOSTRA) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
          for (let y = MAR_DE_LAVA + 1; y < WORLD_HEIGHT; y++) {
            if (blocks[localIndex(lx, y, lz)] === ID.lava) acima.push(`${lx},${y},${lz}`)
          }
        }
      }
    }
    expect(acima.slice(0, 5)).toEqual([])
  })

  it('o nivel dela vem do registro da dimensao, nao de um numero aqui', () => {
    expect(MAR_DE_LAVA).toBe(NETHER.nivelDoMar)
    expect(NETHER.liquidoDoMar).toBe('lava')
  })
})

describe('a pele do salao', () => {
  const varrer = (fn) => {
    const erros = []
    for (const { blocks } of AMOSTRA) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
          for (let y = 1; y < WORLD_HEIGHT - 1; y++) {
            const at = (dy) => blocks[localIndex(lx, y + dy, lz)]
            const e = fn(at(0), at(1), at(-1))
            if (e) erros.push(`${lx},${y},${lz}: ${e}`)
          }
        }
      }
    }
    return erros
  }

  it('glowstone fica PENDURADO: sempre com vazio embaixo, nunca enterrado', () => {
    const erros = varrer((aqui, _acima, abaixo) =>
      aqui === ID.glowstone && abaixo !== AIR && abaixo !== ID.glowstone ? 'enterrado' : null,
    )
    expect(erros.slice(0, 5)).toEqual([])
  })

  it('areia das almas fica no CHAO: sempre com vazio em cima', () => {
    // ⚠️ A VERRUGA CONTA COMO VAZIO AQUI, e não é concessão: o que este teste
    // protege é "areia das almas não é teto nem miolo de rocha". Uma planta em
    // pé sobre ela é justamente a prova de que aquilo é CHÃO — ela só nasce
    // onde há ar em cima (ver `verrugaNasAlmas`).
    const erros = varrer((aqui, acima) =>
      aqui === ID.soulSand && acima !== AIR && acima !== ID.lava && acima !== ID.netherWart
        ? 'no teto'
        : null,
    )
    expect(erros.slice(0, 5)).toEqual([])
  })

  it('a verruga nasce, e SEMPRE em pe sobre areia das almas', () => {
    // A única fonte de poção do jogo. Se ela não sair, a fermentação inteira
    // fica inalcançável e nada mais no jogo acusa isso.
    const erros = varrer((aqui, acima, abaixo) =>
      aqui === ID.netherWart && abaixo !== ID.soulSand ? 'sem chao' : null,
    )
    expect(erros.slice(0, 5)).toEqual([])
    expect(CENSO.conta.get(ID.netherWart) || 0).toBeGreaterThan(0)
  })

  it('magma so existe encostado na lava — e o aviso, nao o piso', () => {
    const erros = varrer((aqui, acima) => (aqui === ID.magma && acima !== ID.lava ? 'seco' : null))
    expect(erros.slice(0, 5)).toEqual([])
  })

  it('ha luz de verdade: glowstone em cacho, nao um bloco perdido por chunk', () => {
    const porChunk = (CENSO.conta.get(ID.glowstone) || 0) / AMOSTRA.length
    expect(porChunk).toBeGreaterThan(20)
  })

  it('a areia das almas vem em mancha, nao em sal', () => {
    expect(CENSO.fracao(ID.soulSand)).toBeGreaterThan(0.001)
  })
})

describe('o quartzo', () => {
  it('existe em quantidade de minerio, nem raro demais nem chao', () => {
    const f = CENSO.fracao(ID.netherQuartzOre)
    expect(f).toBeGreaterThan(0.001)
    expect(f).toBeLessThan(0.03)
  })

  it('nunca come a rocha eterna do piso nem do teto', () => {
    const { maxY, minY } = limites('nether')
    for (const { blocks } of AMOSTRA) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
          expect(blocks[localIndex(lx, maxY, lz)]).toBe(ID.bedrock)
          expect(blocks[localIndex(lx, minY, lz)]).toBe(ID.bedrock)
        }
      }
    }
  })
})

describe('o chunk', () => {
  it('e deterministico: mesma semente e mesmo chunk dao os mesmos bytes', () => {
    const a = gerarChunkDoNether(criarRuidoDoNether(7), 3, -5).blocks
    const b = gerarChunkDoNether(criarRuidoDoNether(7), 3, -5).blocks
    expect(Array.from(a.slice(0, 4096))).toEqual(Array.from(b.slice(0, 4096)))
  })

  it('semente diferente da mundo diferente', () => {
    const a = gerarChunkDoNether(criarRuidoDoNether(7), 0, 0).blocks
    const b = gerarChunkDoNether(criarRuidoDoNether(8), 0, 0).blocks
    expect(Array.from(a.slice(0, 4096))).not.toEqual(Array.from(b.slice(0, 4096)))
  })

  it('devolve a mesma forma do overworld: blocks, heights e biomes', () => {
    const { blocks, heights, biomes } = chunkDe(0, 0)
    expect(blocks.length).toBe(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT)
    expect(heights.length).toBe(CHUNK_SIZE * CHUNK_SIZE)
    expect(biomes.length).toBe(CHUNK_SIZE * CHUNK_SIZE)
    const { minY, maxY } = limites('nether')
    for (const h of heights) {
      expect(h).toBeGreaterThanOrEqual(minY)
      expect(h).toBeLessThanOrEqual(maxY)
    }
  })
})
