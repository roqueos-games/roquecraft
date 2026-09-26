import { desserializarPaleta } from '../../src/servicos/paleta.js'
import { idNoIndice } from '../../src/servicos/chunkStore.js'
import { describe, it, expect, vi } from 'vitest'
import { createPipeline } from '../../src/servicos/chunkPipeline.js'
import { CHUNK_SIZE, WORLD_HEIGHT } from '../../src/servicos/constants.js'
import { BLOCKS, IS_SOLID, AIR } from '../../src/servicos/blocks.js'
import { relogioSintetico, moer } from './relogioDoPipeline.js'
import { TETO_DE_MUNDO } from '../tetos.js'

// ⚠️ ESTE ARQUIVO GERA MUNDO, E GERAR MUNDO CUSTA SEGUNDOS DE VERDADE.
//
// Raio 8 são 289 chunks, cada um com 65 mil blocos de ruído 3D: 8,5s por teste
// numa máquina ociosa, e o trabalho é o mesmo em qualquer uma. O teto global de
// 15s existe para pegar teste que TRAVA, e com a máquina carregada (um build
// ao lado, um sweep de mutação, o LM Studio) ele passa a reprovar teste que está
// fazendo exatamente o que devia -- vermelho que depende da carga, que é o tipo
// que ensina a ignorar vermelho. O teto vem de `tests/setup/tetos.js`, num
// lugar só: sob `--coverage` ele PRECISA ser outro, e o porquê está medido lá.
vi.setConfig({ testTimeout: TETO_DE_MUNDO })

// ILHA FLUTUANTE: O QUE NÃO ESTÁ LIGADO AO CHÃO.
//
// Relato do founder em 2026-08-23, print de (−3, 63, 20) no Safari do iPhone:
// "o mapa gerado está lá no céu". REPRODUZIDO em produção, no WebKit com
// viewport de iPhone, semente 942457: olhando pra cima aparece uma laje de
// terreno pendurada, com tufo de grama apontando pra baixo.
//
// ⚠️ A PRIMEIRA VERSÃO DESTE DETECTOR NÃO ACHAVA NADA, e o motivo é instrutivo:
// ela procurava o "chão da coluna" DE CIMA PRA BAIXO. Numa coluna que tem uma
// ilha flutuando, o primeiro sólido com sólido embaixo É A PRÓPRIA ILHA — ela
// virava o chão de referência, e aí não havia nada acima dela pra acusar. O
// detector reprovava exatamente o caso que existia pra achar.
//
// A pergunta certa não é de coluna, é de CONECTIVIDADE: preencher a partir da
// rocha e ver o que sobra. Terreno de verdade — inclusive saliência e teto de
// caverna — está ligado ao resto por algum caminho. Ilha não está.

const localIndex = (lx, y, lz) => (lx * CHUNK_SIZE + lz) * WORLD_HEIGHT + y

async function mundo(seed, distancia = 2) {
  const chunks = new Map()
  const pipe = createPipeline({
    seed,
    renderDistance: distancia,
    agora: relogioSintetico(),
    emit: (m) => {
      if (m.t === 'chunk')
        chunks.set(`${m.cx},${m.cz}`, { blocks: m.blocks, paleta: desserializarPaleta(m.paleta) })
    },
  })
  pipe.setCenter(0, 0)
  await moer(pipe, { progresso: () => chunks.size })
  return chunks
}

/**
 * Sólidos que NÃO alcançam a base do mundo por caminho sólido (6-vizinhos).
 *
 * Só examina a caixa interna do mundo carregado: uma peça cortada pela borda da
 * varredura pode estar ligada por fora e seria acusada à toa.
 */
function ilhas(chunks) {
  const cs = [...chunks.keys()].map((k) => k.split(',').map(Number))
  // ⚠️ DUAS CAIXAS, NÃO UMA — e usar uma só produzia acusação falsa.
  //
  // O preenchimento tem que enxergar TUDO que está carregado: uma coluna na
  // beirada desce até a rocha por um caminho que às vezes sai e volta pela
  // coluna vizinha. Recortando o preenchimento na mesma caixa do relatório, o
  // caminho era cortado e a peça aparecia "solta" — o próprio artefato de borda
  // que o comentário acima manda evitar, só que um chunk mais pra dentro.
  //
  // Apareceu quando o pipeline passou a carregar um anel a mais (MARGEM_GERAR):
  // a caixa cresceu, a borda mudou de lugar e 8 blocos de pedra no canto de
  // (−3,−3) viraram "ilha". Não eram: o caminho deles saía pelo chunk −4, que
  // estava carregado e o preenchimento se recusava a olhar.
  const caixa = (folga) => ({
    x0: (Math.min(...cs.map((c) => c[0])) + folga) * CHUNK_SIZE,
    x1: (Math.max(...cs.map((c) => c[0])) - folga) * CHUNK_SIZE + CHUNK_SIZE - 1,
    z0: (Math.min(...cs.map((c) => c[1])) + folga) * CHUNK_SIZE,
    z1: (Math.max(...cs.map((c) => c[1])) - folga) * CHUNK_SIZE + CHUNK_SIZE - 1,
  })
  const cheia = caixa(0) // onde o preenchimento anda
  const dentro = caixa(1) // onde vale acusar
  const { x0, x1, z0, z1 } = cheia
  const W = x1 - x0 + 1
  const D = z1 - z0 + 1

  const solido = (x, y, z) => {
    if (y < 0 || y >= WORLD_HEIGHT) return false
    const b = chunks.get(`${x >> 4},${z >> 4}`)
    if (!b) return false
    return IS_SOLID[idNoIndice(b, localIndex(x & 15, y, z & 15))] === 1
  }
  const idAt = (x, y, z) => {
    const b = chunks.get(`${x >> 4},${z >> 4}`)
    return b ? idNoIndice(b, localIndex(x & 15, y, z & 15)) : AIR
  }

  const idx = (x, y, z) => ((x - x0) * D + (z - z0)) * WORLD_HEIGHT + y
  const visto = new Uint8Array(W * D * WORLD_HEIGHT)
  const fila = []
  // semente: TODO sólido em y = 0..2 (a rocha do fundo)
  for (let x = x0; x <= x1; x++)
    for (let z = z0; z <= z1; z++)
      for (let y = 0; y <= 2; y++)
        if (solido(x, y, z) && !visto[idx(x, y, z)]) {
          visto[idx(x, y, z)] = 1
          fila.push(x, y, z)
        }
  const DIRS = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ]
  while (fila.length) {
    const z = fila.pop()
    const y = fila.pop()
    const x = fila.pop()
    for (const [dx, dy, dz] of DIRS) {
      const nx = x + dx
      const ny = y + dy
      const nz = z + dz
      if (nx < x0 || nx > x1 || nz < z0 || nz > z1 || ny < 0 || ny >= WORLD_HEIGHT) continue
      if (!solido(nx, ny, nz) || visto[idx(nx, ny, nz)]) continue
      visto[idx(nx, ny, nz)] = 1
      fila.push(nx, ny, nz)
    }
  }

  const porTipo = {}
  const exemplos = []
  let soltos = 0
  let total = 0
  for (let x = dentro.x0; x <= dentro.x1; x++)
    for (let z = dentro.z0; z <= dentro.z1; z++)
      for (let y = 3; y < WORLD_HEIGHT; y++) {
        if (!solido(x, y, z)) continue
        total++
        if (visto[idx(x, y, z)]) continue
        soltos++
        const k = BLOCKS[idAt(x, y, z)]?.key || idAt(x, y, z)
        porTipo[k] = (porTipo[k] || 0) + 1
        if (exemplos.length < 12) exemplos.push(`${k} (${x},${y},${z})`)
      }
  return { soltos, total, porTipo, exemplos, ppm: Math.round((soltos / total) * 1e6) }
}

describe('roquecraft - nada de ilha desligada do chão', () => {
  // 942457 é a semente que REPRODUZIU o defeito em produção.
  for (const seed of [942457, 999416, 1, 42, 20260819]) {
    it(`semente ${seed}`, async () => {
      const r = ilhas(await mundo(seed))
      expect(r.total, 'mundo vazio — teste sem conteúdo').toBeGreaterThan(20000)
      expect(
        r.soltos,
        `${r.soltos} blocos soltos (${r.ppm} ppm) — ${JSON.stringify(r.porTipo)} — ${r.exemplos.join(' | ')}`,
      ).toBe(0)
    })
  }
})
