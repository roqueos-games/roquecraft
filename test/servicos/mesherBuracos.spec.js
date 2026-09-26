import { desserializarPaleta } from '../../src/servicos/paleta.js'
import { idNoIndice } from '../../src/servicos/chunkStore.js'
import { describe, it, expect, vi } from 'vitest'
import { createPipeline } from '../../src/servicos/chunkPipeline.js'
import { CHUNK_SIZE, WORLD_HEIGHT } from '../../src/servicos/constants.js'
import { IS_OPAQUE, BLOCKS, AIR } from '../../src/servicos/blocks.js'
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

// DETECTOR DE BURACO: toda face exposta tem que existir na malha.
//
// O founder relatou (2026-08-22): "para os lados e para trás os blocos estão
// com faces vazias e sem textura e colisão, dando para entrar dentro nas
// montanhas". A coerência entre colisão e altura do terreno já foi medida em
// campo e está limpa, e um bloco isolado emite as 6 faces com winding certo
// (ver `mesherFaces.spec.js`). Então o buraco é CONTEXTUAL — depende do
// vizinho, e o suspeito natural é a divisa entre chunks, onde o culling de
// face lê o chunk ao lado.
//
// Este teste é a versão exaustiva do que o olho não consegue fazer: gera um
// pedaço de mundo REAL, indexa TODA face emitida, e depois varre TODO bloco
// opaco procurando uma face exposta que ninguém desenhou. Se houver assimetria
// por direção, ela aparece no relatório agrupado.

const DIRS = [
  { nome: '+x', d: [1, 0, 0] },
  { nome: '-x', d: [-1, 0, 0] },
  { nome: '+y', d: [0, 1, 0] },
  { nome: '-y', d: [0, -1, 0] },
  { nome: '+z', d: [0, 0, 1] },
  { nome: '-z', d: [0, 0, -1] },
]

const chaveFace = (x, y, z, f) => `${x},${y},${z},${f}`
const localIndex = (lx, y, lz) => (lx * CHUNK_SIZE + lz) * WORLD_HEIGHT + y

/**
 * Roda o pipeline e devolve os blocos por chunk e o índice de faces emitidas.
 *
 * `caminho` é a sequência de centros — é assim que se reproduz o jogador
 * andando, que é o que faz chunk descarregar atrás e carregar à frente. O
 * índice de faces respeita o `unload`: seção descarregada some do índice, como
 * some da cena.
 */
async function mundo({ seed = 42, distancia = 3, caminho = [[0, 0]] } = {}) {
  const chunks = new Map()
  const faces = new Set()
  // ⚠️ CHUNK CARREGADO NÃO É CHUNK MALHADO, e confundir os dois transformava
  // este detector num acusador de inocentes.
  //
  // O pipeline carrega dois anéis a mais do que desenha: o anel de fora existe
  // só pra permitir ACENDER o anel do meio, que por sua vez permite MALHAR o
  // anel visível (ver MARGEM_GERAR em chunkPipeline.js). Os chunks desses dois
  // anéis têm blocos e nunca terão malha — de propósito. Auditar "todo chunk
  // cercado de blocos" cobrava malha deles e acusava buraco onde não há.
  //
  // O conjunto certo é o que o jogador VÊ: chunks que entregaram malha.
  const malhados = new Set()
  const porChunk = new Map() // "cx,cz" → Set de chaves de face, pra desfazer no unload
  const pipe = createPipeline({
    seed,
    renderDistance: distancia,
    agora: relogioSintetico(),
    emit: (m) => {
      if (m.t === 'chunk')
        chunks.set(`${m.cx},${m.cz}`, { blocks: m.blocks, paleta: desserializarPaleta(m.paleta) })
      if (m.t === 'mesh') {
        const k = `${m.cx},${m.cz}`
        if (!porChunk.has(k)) porChunk.set(k, new Set())
        malhados.add(k)
        indexar(m, faces, porChunk.get(k))
      }
      if (m.t === 'unload') {
        const k = `${m.cx},${m.cz}`
        for (const f of porChunk.get(k) || []) faces.delete(f)
        porChunk.delete(k)
        malhados.delete(k)
        chunks.delete(k)
      }
    },
  })
  for (const [cx, cz] of caminho) {
    pipe.setCenter(cx, cz)
    await moer(pipe, { progresso: () => chunks.size + faces.size })
  }
  return { chunks, faces, malhados }
}

/**
 * Marca no índice toda CÉLULA coberta por cada quad.
 *
 * O mesher é greedy: um quad cobre um retângulo de células, não uma só. Os
 * vértices vêm em grupos de 4 e já em coordenadas de mundo.
 */
function indexar(m, faces, registro) {
  for (const key of ['opaque', 'cutout', 'transparent']) {
    const g = m[key]
    if (!g) continue
    for (let q = 0; q * 4 < g.count; q++) {
      const v = []
      for (let i = 0; i < 4; i++) {
        const j = (q * 4 + i) * 3
        v.push([g.position[j], g.position[j + 1], g.position[j + 2]])
      }
      const n0 = q * 4 * 3
      const nrm = [
        Math.sign(g.normal[n0]),
        Math.sign(g.normal[n0 + 1]),
        Math.sign(g.normal[n0 + 2]),
      ]
      const eixo = nrm.findIndex((c) => c !== 0)
      if (eixo < 0) continue
      const sinal = nrm[eixo]
      const f = DIRS.findIndex((D) => D.d[eixo] === sinal && D.d.every((c, k) => c === nrm[k]))
      if (f < 0) continue
      // plano constante ao longo do eixo; o bloco fica atrás dele
      const plano = Math.round(v[0][eixo])
      const base = sinal > 0 ? plano - 1 : plano
      const outros = [0, 1, 2].filter((k) => k !== eixo)
      const faixa = outros.map((k) => {
        const vals = v.map((p) => p[k])
        return [Math.round(Math.min(...vals)), Math.round(Math.max(...vals))]
      })
      for (let a = faixa[0][0]; a < faixa[0][1]; a++) {
        for (let b = faixa[1][0]; b < faixa[1][1]; b++) {
          const c = [0, 0, 0]
          c[eixo] = base
          c[outros[0]] = a
          c[outros[1]] = b
          const ch = chaveFace(c[0], c[1], c[2], f)
          faces.add(ch)
          registro?.add(ch)
        }
      }
    }
  }
}

/** Varre o mundo e devolve as faces expostas que ninguém desenhou. */
function auditar({ chunks, faces, malhados }) {
  // Varre só os chunks que foram MALHADOS e cujos 8 vizinhos também foram: um
  // chunk de borda não tem com que comparar, e a ausência de face lá é
  // esperada.
  const bloco = (x, y, z) => {
    if (y < 0 || y >= WORLD_HEIGHT) return AIR
    const b = chunks.get(`${x >> 4},${z >> 4}`)
    if (!b) return null // fora do mundo de teste
    return idNoIndice(b, localIndex(x & 15, y, z & 15))
  }

  const porDirecao = Object.fromEntries(DIRS.map((D) => [D.nome, 0]))
  const exemplos = []
  let examinados = 0

  for (const key of malhados) {
    const [cx, cz] = key.split(',').map(Number)
    let cercado = true
    for (let dx = -1; dx <= 1 && cercado; dx++)
      for (let dz = -1; dz <= 1; dz++)
        if (!malhados.has(`${cx + dx},${cz + dz}`) || !chunks.has(`${cx + dx},${cz + dz}`)) {
          cercado = false
          break
        }
    if (!cercado) continue

    for (let lx = 0; lx < CHUNK_SIZE; lx++)
      for (let lz = 0; lz < CHUNK_SIZE; lz++)
        for (let y = 1; y < WORLD_HEIGHT - 1; y++) {
          const x = cx * CHUNK_SIZE + lx
          const z = cz * CHUNK_SIZE + lz
          const id = bloco(x, y, z)
          if (!id || IS_OPAQUE[id] !== 1) continue
          // laje/camada fina desce o topo: a geometria não é a célula cheia
          if (BLOCKS[id].slab) continue
          examinados++
          for (let f = 0; f < DIRS.length; f++) {
            const [dx, dy, dz] = DIRS[f].d
            const viz = bloco(x + dx, y + dy, z + dz)
            if (viz !== AIR) continue
            if (faces.has(chaveFace(x, y, z, f))) continue
            porDirecao[DIRS[f].nome]++
            if (exemplos.length < 12) exemplos.push(`${DIRS[f].nome} em (${x},${y},${z}) id=${id}`)
          }
        }
  }
  return { porDirecao, exemplos, examinados }
}

const LIMPO = { porDirecao: Object.fromEntries(DIRS.map((D) => [D.nome, 0])), exemplos: [] }
const semBuraco = ({ porDirecao, exemplos }) => ({ porDirecao, exemplos })

describe('roquecraft - nenhuma face exposta fica sem malha', () => {
  it('o mundo de teste realmente gerou e malhou', async () => {
    const { chunks, faces } = await mundo()
    expect(chunks.size).toBeGreaterThan(20)
    expect(faces.size).toBeGreaterThan(5000)
  })

  it('mundo parado: todo bloco opaco com vizinho de ar tem a face desenhada', async () => {
    const r = auditar(await mundo())
    expect(r.examinados, 'não examinou bloco nenhum').toBeGreaterThan(10000)
    expect(semBuraco(r)).toEqual(LIMPO)
  })

  // ── O CASO DO FOUNDER ────────────────────────────────────────────────────
  //
  // "você validou a construção dos blocos indo pra frente, mas para os lados e
  // para trás os blocos estão com faces vazias". Andar é o que descarrega o
  // chunk atrás e carrega o da frente; se a malha de um chunk que SOBREVIVE ao
  // movimento foi calculada contra um vizinho que já não é o mesmo, o buraco
  // aparece do lado por onde o jogador passou — e só desse lado.

  it('andando em linha reta e voltando, nenhuma face se perde', async () => {
    const ida = [
      [0, 0],
      [2, 0],
      [4, 0],
      [6, 0],
      [4, 0],
      [2, 0],
      [0, 0],
    ]
    const r = auditar(await mundo({ caminho: ida }))
    expect(r.examinados).toBeGreaterThan(10000)
    expect(semBuraco(r)).toEqual(LIMPO)
  })

  it('andando nas quatro direções, nenhuma face se perde', async () => {
    const volta = [
      [0, 0],
      [5, 0],
      [5, 5],
      [0, 5],
      [-5, 5],
      [-5, 0],
      [0, 0],
    ]
    const r = auditar(await mundo({ caminho: volta }))
    expect(r.examinados).toBeGreaterThan(10000)
    expect(semBuraco(r)).toEqual(LIMPO)
  })
})
