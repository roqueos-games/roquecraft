// RoqueCraft - propagação de luz (skylight + luz de bloco).
//
// É daqui que vem a maior parte do "look" de um jogo de voxel: cada voxel
// guarda dois níveis 0-15 empacotados num byte (`sky << 4 | block`), o mesher
// interpola os 4 vizinhos de cada vértice, e o resultado é a SOMBRA MACIA que
// escurece o interior de uma caverna, a base de uma árvore e o fundo de um
// buraco - sem custar nada em GPU.
//
// Dois níveis separados porque eles reagem diferente ao ciclo dia/noite: a luz
// do CÉU é multiplicada pela intensidade do sol (de dia 1, de noite ~0.12), a
// luz de BLOCO (tocha, lava, glowstone) é constante e quente. O shader combina.
//
// Algoritmo clássico do gênero: descida por coluna pra semear o skylight,
// depois BFS (fila) pra espalhar; ao editar um bloco, um BFS de REMOÇÃO seguido
// de um BFS de adição a partir das bordas remanescentes.

import { CHUNK_SIZE, WORLD_HEIGHT, MAX_LIGHT, localIndex, chunkKey, AIR } from './constants.js'
import { LIGHT_EMIT, LIGHT_FILTER, IS_OPAQUE } from './blocks.js'
import { idNoIndice } from './chunkStore.js'
import { tabelaLocal } from './paleta.js'

// As varreduras de luz leem 32.768 celulas por chunk. Com paleta, perguntar
// "este id e opaco?" custaria uma indirecao a mais POR CELULA. Entao a tabela
// global e reprojetada UMA vez sobre os 256 indices da paleta do chunk, e o
// laco volta a ser um lookup so — o mesmo custo de antes da paleta existir.
// Chunk promovido (paleta null) le a tabela global direto, que ja e por id.
const porIndice = (chunk, tabelaGlobal) =>
  chunk.paleta ? tabelaLocal(chunk.paleta, tabelaGlobal) : tabelaGlobal
import { markDirty } from './chunkStore.js'

const NEIGH = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
]

// Acesso a um voxel de qualquer chunk carregado.
//
// O BFS de luz visita centenas de milhares de células e é MUITO local: dois
// acessos seguidos quase sempre caem no mesmo chunk. Sem memo, cada acesso
// montava a string `${cx},${cz}` e alocava um objeto `{c,i}` - medido em ~120 ms
// por chunk, o gargalo real do carregamento. Com o memo de um slot e sem
// alocação, cai pra ~8 ms.
let _cc = -1e9
let _ccz = -1e9
let _cch = null

export function resetLightCache() {
  _cc = -1e9
  _ccz = -1e9
  _cch = null
}

function chunkAt(world, cx, cz) {
  if (cx === _cc && cz === _ccz) return _cch
  _cc = cx
  _ccz = cz
  _cch = world.chunks.get(chunkKey(cx, cz)) || null
  return _cch
}

const getSky = (world, x, y, z) => {
  if (y >= WORLD_HEIGHT) return MAX_LIGHT
  if (y < 0) return 0
  const c = chunkAt(world, x >> 4, z >> 4)
  if (!c) return 0
  return (c.light[localIndex(x & 15, y, z & 15)] >> 4) & 15
}
const getBlk = (world, x, y, z) => {
  if (y < 0 || y >= WORLD_HEIGHT) return 0
  const c = chunkAt(world, x >> 4, z >> 4)
  if (!c) return 0
  return c.light[localIndex(x & 15, y, z & 15)] & 15
}
/**
 * ⚠️ A LUZ NÃO RESPEITA A DIVISA DO CHUNK, e é por isso que este registro
 * existe.
 *
 * `spreadSky`/`spreadBlock` escrevem em coordenada GLOBAL: acender o chunk C
 * escreve luz DENTRO dos vizinhos dele. Quem já mandou malha pro renderizador
 * antes disso ficou com a luz velha na mão — e ninguém remalhava. Era metade do
 * defeito de 2026-08-23 (a outra metade era malhar com vizinho apagado, ver
 * `neighborsLit`).
 *
 * Em vez de adivinhar o raio de dano, o registro é EXATO: toda escrita marca a
 * seção que tocou. Custo: dois acessos a array por escrita — sem alocação, sem
 * string, sem Set — no caminho mais quente do carregamento.
 */
const TOCADAS = [] // pares achatados [chunk, sy, chunk, sy, ...]

/**
 * Bits de `luzMexida[sy]`: além de "mexeu", QUAL borda mexeu.
 *
 * ⚠️ Guardar só "mexeu" não bastava, e o teste da tocha pegou isso: o mesher lê
 * o chunk mais 1 BLOCO DE MOLDURA dos vizinhos. Mudar a luz da coluna x=15 do
 * chunk 0 muda o que a malha do chunk 1 leu — mesmo que nenhuma célula do
 * chunk 1 tenha mudado. Sem esses bits sobravam duas saídas ruins: remalhar os
 * 26 vizinhos de toda seção tocada (caro: ~650 ms por tocha) ou deixar a
 * costura. Com eles a remalha é exata.
 */
export const TOQUE = Object.freeze({
  mexeu: 1,
  xBaixo: 2,
  xAlto: 4,
  zBaixo: 8,
  zAlto: 16,
  yBaixo: 32,
  yAlto: 64,
})

export function limparToque() {
  for (let i = 0; i < TOCADAS.length; i += 2) TOCADAS[i].luzMexida[TOCADAS[i + 1]] = 0
  TOCADAS.length = 0
}

export const toquesDaLuz = () => TOCADAS

const marcarToque = (c, x, y, z) => {
  if (!c.luzMexida) return
  const sy = y >> 4
  let m = TOQUE.mexeu
  const lx = x & 15
  const lz = z & 15
  const ly = y & 15
  if (lx === 0) m |= TOQUE.xBaixo
  else if (lx === 15) m |= TOQUE.xAlto
  if (lz === 0) m |= TOQUE.zBaixo
  else if (lz === 15) m |= TOQUE.zAlto
  if (ly === 0) m |= TOQUE.yBaixo
  else if (ly === 15) m |= TOQUE.yAlto
  const antes = c.luzMexida[sy]
  if ((antes | m) === antes) return
  if (!antes) TOCADAS.push(c, sy)
  c.luzMexida[sy] = antes | m
}

const setSky = (world, x, y, z, v) => {
  if (y < 0 || y >= WORLD_HEIGHT) return false
  const c = chunkAt(world, x >> 4, z >> 4)
  if (!c) return false
  const i = localIndex(x & 15, y, z & 15)
  const antes = c.light[i]
  const depois = (antes & 0x0f) | ((v & 15) << 4)
  if (depois !== antes) {
    c.light[i] = depois
    marcarToque(c, x, y, z)
  }
  return true
}
const setBlk = (world, x, y, z, v) => {
  if (y < 0 || y >= WORLD_HEIGHT) return false
  const c = chunkAt(world, x >> 4, z >> 4)
  if (!c) return false
  const i = localIndex(x & 15, y, z & 15)
  const antes = c.light[i]
  const depois = (antes & 0xf0) | (v & 15)
  if (depois !== antes) {
    c.light[i] = depois
    marcarToque(c, x, y, z)
  }
  return true
}
const blockAt = (world, x, y, z) => {
  if (y < 0 || y >= WORLD_HEIGHT) return -1
  const c = chunkAt(world, x >> 4, z >> 4)
  if (!c) return -1
  return idNoIndice(c, localIndex(x & 15, y, z & 15))
}

// ── Semeadura do skylight (descida por coluna) ──────────────────────────────

// Para cada coluna do chunk, desce do teto: enquanto nada bloqueia, o nível é
// 15 (luz direta do céu). Ao atravessar algo que filtra (folha, água, vidro), o
// nível cai pelo filtro e continua descendo já atenuado. Bloco opaco zera.
export function seedSkylight(chunk) {
  const light = chunk.light
  const blocks = chunk.blocks
  const opaco = porIndice(chunk, IS_OPAQUE)
  const filtro = porIndice(chunk, LIGHT_FILTER)
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const base = (lx * CHUNK_SIZE + lz) * WORLD_HEIGHT
      let level = MAX_LIGHT
      for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
        const id = blocks[base + y]
        if (id !== AIR) {
          if (opaco[id] === 1) {
            level = 0
          } else {
            const f = filtro[id]
            level = Math.max(0, level - Math.max(1, f))
          }
        }
        light[base + y] = (light[base + y] & 0x0f) | (level << 4)
        if (level === 0) {
          // resto da coluna fica escuro; o BFS lateral preenche o que couber
          for (let yy = y - 1; yy >= 0; yy--) light[base + yy] &= 0x0f
          break
        }
      }
    }
  }
  return chunk
}

// ── BFS de adição ───────────────────────────────────────────────────────────

// Fila plana [x,y,z,level,...] - evita alocar um objeto por célula (o BFS de um
// chunk toca dezenas de milhares de células).
function pushQ(q, x, y, z, l) {
  q.push(x, y, z, l)
}

function spreadSky(world, q) {
  for (let h = 0; h < q.length; h += 4) {
    const x = q[h]
    const y = q[h + 1]
    const z = q[h + 2]
    const l = q[h + 3]
    if (l <= 1) continue
    for (const [dx, dy, dz] of NEIGH) {
      const nx = x + dx
      const ny = y + dy
      const nz = z + dz
      if (ny < 0 || ny >= WORLD_HEIGHT) continue
      const id = blockAt(world, nx, ny, nz)
      if (id < 0 || IS_OPAQUE[id] === 1) continue
      // Luz do céu descendo em linha reta por material que NÃO filtra (ar,
      // vidro) não perde nível: é o que mantém um poço fundo iluminado até o
      // fundo. Atravessando água ou folha, perde o filtro - por isso o fundo do
      // oceano é escuro e a sombra da copa existe.
      const f = LIGHT_FILTER[id]
      const cost = dy === -1 && l === MAX_LIGHT && f === 0 ? 0 : Math.max(1, f)
      const nl = l - cost
      if (nl <= 0) continue
      if (getSky(world, nx, ny, nz) >= nl) continue
      if (!setSky(world, nx, ny, nz, nl)) continue
      pushQ(q, nx, ny, nz, nl)
    }
  }
}

function spreadBlock(world, q) {
  for (let h = 0; h < q.length; h += 4) {
    const x = q[h]
    const y = q[h + 1]
    const z = q[h + 2]
    const l = q[h + 3]
    if (l <= 1) continue
    for (const [dx, dy, dz] of NEIGH) {
      const nx = x + dx
      const ny = y + dy
      const nz = z + dz
      if (ny < 0 || ny >= WORLD_HEIGHT) continue
      const id = blockAt(world, nx, ny, nz)
      if (id < 0 || IS_OPAQUE[id] === 1) continue
      const nl = l - Math.max(1, LIGHT_FILTER[id] || 1)
      if (nl <= 0) continue
      if (getBlk(world, nx, ny, nz) >= nl) continue
      if (!setBlk(world, nx, ny, nz, nl)) continue
      pushQ(q, nx, ny, nz, nl)
    }
  }
}

// Um vizinho DENTRO do chunk tem skylight menor? Se todos os 6 vizinhos já
// estão no mesmo nível ou mais claros, enfileirar esta célula é ruído: o BFS
// descartaria na primeira comparação, mas só depois de 6 sondagens.
function hasDarkerNeighbor(chunk, lx, y, lz, s) {
  const at = (ax, ay, az) => {
    if (ax < 0 || ax > 15 || az < 0 || az > 15 || ay < 0 || ay >= WORLD_HEIGHT) return -1
    return (chunk.light[localIndex(ax, ay, az)] >> 4) & 15
  }
  return (
    at(lx + 1, y, lz) < s ||
    at(lx - 1, y, lz) < s ||
    at(lx, y, lz + 1) < s ||
    at(lx, y, lz - 1) < s ||
    at(lx, y + 1, lz) < s ||
    at(lx, y - 1, lz) < s
  )
}

// ── Iluminação inicial de um chunk ──────────────────────────────────────────

// Semeia o skylight por coluna, enfileira TODAS as células com luz (as do chunk
// + a moldura de 1 bloco dos vizinhos, pra a luz atravessar a divisa) e espalha.
export function lightChunk(world, chunk) {
  const emissao = porIndice(chunk, LIGHT_EMIT)
  resetLightCache()
  limparToque()
  seedSkylight(chunk)
  const ox = chunk.cx * CHUNK_SIZE
  const oz = chunk.cz * CHUNK_SIZE

  const skyQ = []
  const blkQ = []

  // Teto útil: acima da coluna mais alta do chunk (e das vizinhas) tudo é céu
  // cheio e não há nada pra espalhar - semear ali é trabalho puro jogado fora.
  let ceiling = 0
  for (let i = 0; i < chunk.height.length; i++)
    if (chunk.height[i] > ceiling) ceiling = chunk.height[i]
  ceiling = Math.min(WORLD_HEIGHT - 1, ceiling + 2)

  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const base = (lx * CHUNK_SIZE + lz) * WORLD_HEIGHT
      for (let y = 0; y <= ceiling; y++) {
        const emit = emissao[chunk.blocks[base + y]]
        if (emit > 0) {
          chunk.light[base + y] = (chunk.light[base + y] & 0xf0) | emit
          pushQ(blkQ, ox + lx, y, oz + lz, emit)
        }
        const s = (chunk.light[base + y] >> 4) & 15
        // só vale espalhar de uma célula que tenha um vizinho MAIS ESCURO
        if (s > 1 && hasDarkerNeighbor(chunk, lx, y, lz, s)) pushQ(skyQ, ox + lx, y, oz + lz, s)
      }
    }
  }

  // moldura: as bordas dos 4 vizinhos alimentam luz pra dentro
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const n = world.chunks.get(chunkKey(chunk.cx + dx, chunk.cz + dz))
    if (!n || !n.lit) continue
    for (let t = 0; t < CHUNK_SIZE; t++) {
      const nx = dx === 0 ? ox + t : dx > 0 ? ox + CHUNK_SIZE : ox - 1
      const nz = dz === 0 ? oz + t : dz > 0 ? oz + CHUNK_SIZE : oz - 1
      for (let y = 0; y <= ceiling; y++) {
        const s = getSky(world, nx, y, nz)
        if (s > 1) pushQ(skyQ, nx, y, nz, s)
        const b = getBlk(world, nx, y, nz)
        if (b > 1) pushQ(blkQ, nx, y, nz, b)
      }
    }
  }

  spreadSky(world, skyQ)
  spreadBlock(world, blkQ)
  chunk.lit = true
  return chunk
}

// ── Atualização ao editar um bloco ──────────────────────────────────────────

// Remoção: apaga a luz que VINHA da célula editada, guardando as bordas onde
// encontrou luz mais forte (essas viram fontes do BFS de adição que vem depois).
// Sem isso, tapar uma janela deixaria um bloco de luz fantasma pra sempre.
function removeLight(world, x, y, z, getter, setter, seedsOut) {
  const start = getter(world, x, y, z)
  if (start === 0) return
  setter(world, x, y, z, 0)
  const q = [x, y, z, start]
  for (let h = 0; h < q.length; h += 4) {
    const cx = q[h]
    const cy = q[h + 1]
    const cz = q[h + 2]
    const cl = q[h + 3]
    for (const [dx, dy, dz] of NEIGH) {
      const nx = cx + dx
      const ny = cy + dy
      const nz = cz + dz
      if (ny < 0 || ny >= WORLD_HEIGHT) continue
      const nl = getter(world, nx, ny, nz)
      if (nl === 0) continue
      if (nl < cl || (dy === -1 && cl === MAX_LIGHT && nl === MAX_LIGHT)) {
        setter(world, nx, ny, nz, 0)
        q.push(nx, ny, nz, nl)
      } else if (nl >= cl) {
        seedsOut.push(nx, ny, nz, nl)
      }
    }
  }
}

// Recalcula a luz depois de colocar/quebrar um bloco em (x,y,z) e marca as
// seções afetadas pra remalhar. O raio de dano é limitado pelo próprio alcance
// da luz (15), então é barato mesmo em mundo grande.
export function updateLightAt(world, x, y, z) {
  resetLightCache()
  limparToque()
  const id = blockAt(world, x, y, z)
  if (id < 0) return

  // --- luz de bloco
  const blkSeeds = []
  removeLight(world, x, y, z, getBlk, setBlk, blkSeeds)
  const emit = LIGHT_EMIT[id]
  if (emit > 0) {
    setBlk(world, x, y, z, emit)
    blkSeeds.push(x, y, z, emit)
  }
  if (blkSeeds.length) spreadBlock(world, blkSeeds)

  // --- skylight: se o bloco virou opaco, a coluna abaixo perde o céu; se virou
  // ar, a coluna pode reabrir até o topo. Recalcular a COLUNA é mais simples e
  // mais correto que tentar remendar só a célula.
  const skySeeds = []
  const opaqueNow = IS_OPAQUE[id] === 1
  if (opaqueNow) {
    for (let yy = y; yy >= 0; yy--) {
      if (getSky(world, x, yy, z) === 0) break
      removeLight(world, x, yy, z, getSky, setSky, skySeeds)
    }
  } else {
    // reabre: semeia a partir do céu descendo pela coluna
    let level = getSky(world, x, y + 1, z)
    if (y + 1 >= WORLD_HEIGHT) level = MAX_LIGHT
    for (let yy = y; yy >= 0; yy--) {
      const bid = blockAt(world, x, yy, z)
      if (bid < 0) break
      if (IS_OPAQUE[bid] === 1) break
      const f = LIGHT_FILTER[bid]
      const cost = f === 0 ? 0 : Math.max(1, f)
      level = level === MAX_LIGHT && cost === 0 ? MAX_LIGHT : Math.max(0, level - cost)
      if (level <= getSky(world, x, yy, z)) break
      setSky(world, x, yy, z, level)
      skySeeds.push(x, yy, z, level)
    }
  }
  // vizinhos alimentam de volta
  for (const [dx, dy, dz] of NEIGH) {
    const s = getSky(world, x + dx, y + dy, z + dz)
    if (s > 1) skySeeds.push(x + dx, y + dy, z + dz, s)
    const b = getBlk(world, x + dx, y + dy, z + dz)
    if (b > 1) blkSeeds.push(x + dx, y + dy, z + dz, b)
  }
  if (skySeeds.length) spreadSky(world, skySeeds)

  // ⚠️ AQUI HAVIA UM RETICULADO, E ELE ERRAVA DOS DOIS LADOS.
  //
  // A versão anterior remalhava "tudo no raio da luz" varrendo offsets de
  // `-MAX_LIGHT` a `+MAX_LIGHT` de 16 em 16 — o que, com MAX_LIGHT = 15, dá
  // exatamente dois valores por eixo: −15 e +1. Ou seja:
  //
  //   · marcava DE MENOS: o chunk que começa em x+15 recebe luz e ficava de
  //     fora. Uma tocha no meio de um chunk deixava a divisa do lado +x com a
  //     luz velha (visto em teste, `pipelineLuzMalha.spec.js`);
  //   · e marcava DE MAIS: as oito combinações eram marcadas sempre, mesmo
  //     quando a luz não tinha chegado perto — remalha paga de graça.
  //
  // O registro de toque (`toquesDaLuz`) sabe exatamente quais seções mudaram,
  // porque quem escreve a luz é que anota. Chute com raio saiu; medição entrou.
  // Quem consome é `chunkPipeline.malharTocadasPelaLuz`.
  //
  // O bloco editado continua marcado aqui: a GEOMETRIA dele mudou, e isso não é
  // assunto da luz.
  markDirty(world, x, y, z)
}

export { getSky, getBlk, setSky, setBlk }
