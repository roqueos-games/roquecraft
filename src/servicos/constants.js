// RoqueCraft - constantes geométricas do mundo voxel.
//
// O mundo é INFINITO no plano XZ e limitado em Y. O armazenamento é por COLUNA
// de chunk (16 × WORLD_HEIGHT × 16) num Uint8Array, e a malha é gerada por
// SEÇÃO de 16³ (como o Minecraft faz): editar um bloco re-malha 32 KB de voxels,
// não a coluna inteira.
//
// Layout do índice: Y é CONTÍGUO (`(lx * 16 + lz) * H + y`). Isso deixa as
// operações de coluna - geração de terreno, heightmap, propagação de skylight
// de cima pra baixo - varrendo memória sequencial, que é o caminho quente.

// A ALTURA NAO MORA MAIS AQUI. O teto do mundo, o piso, o nível do mar e o
// bedrock são propriedades da DIMENSÃO (ver `dimensoes.js`, trava T2 do plano):
// um Nether de teto baixo ou um fim flutuante precisam de outros números, e
// enquanto "o teto do mundo" era uma constante única nenhum deles era possível.
// O que sobra aqui é o que vale para QUALQUER dimensão: a largura do chunk, as
// máscaras, a indexação e as direções de face.
import { dimensao, DIMENSAO_PADRAO, SECTION_HEIGHT } from './dimensoes.js'

export { SECTION_HEIGHT, DIMENSAO_PADRAO }

export const CHUNK_SIZE = 16 // largura/profundidade de um chunk
export const CHUNK_MASK = 15 // x & 15 = coordenada local
export const CHUNK_SHIFT = 4 // x >> 4 = coordenada do chunk
// Derivados da dimensão PADRÃO. O caminho quente (localIndex, mesher, luz) é
// compilado contra estes números; altura variável por chunk é a fatia seguinte.
export const WORLD_HEIGHT = dimensao().altura
export const SECTION_COUNT = WORLD_HEIGHT / SECTION_HEIGHT
export const CHUNK_AREA = CHUNK_SIZE * CHUNK_SIZE // 256 colunas
export const CHUNK_VOLUME = CHUNK_AREA * WORLD_HEIGHT // 32768 voxels

export const SEA_LEVEL = dimensao().nivelDoMar
export const BEDROCK_Y = dimensao().pisoIndestrutivel
export const MIN_Y = dimensao().minY // piso do mundo: zero HOJE, não por natureza
export const MAX_LIGHT = 15 // nível máximo de luz (4 bits)

export const AIR = 0

/**
 * O RELOGIO DA SIMULACAO: 20 tiques por segundo.
 *
 * ⚠️ UM NUMERO SO, PORQUE E UMA DECISAO SO. Ele governa a agua escorrendo, a
 * areia caindo, o fogo e tudo mais que "acontece sozinho" no mundo. Ele estava
 * escrito DUAS vezes -- em `atualizacoes.js` e em `gravidade.js` -- e mudar so
 * um faria a areia cair num ritmo e o rio correr noutro, sem erro nenhum: o
 * mundo simplesmente deixaria de concordar consigo mesmo.
 *
 * Nao confundir com `TICKS_PER_SECOND` de `daycycle.js`, que e o relogio do
 * CEU (quanto o dia anda por segundo) e nao o da fisica.
 */
export const TIQUES_POR_SEGUNDO = 20

// Índice local dentro do Uint8Array de uma coluna de chunk.
export const localIndex = (lx, y, lz) => (lx * CHUNK_SIZE + lz) * WORLD_HEIGHT + y

// Coordenada global → coordenada do chunk / local. Usa shift/mask pra funcionar
// com negativos sem `Math.floor` (que é bem mais caro no caminho quente).
export const toChunkCoord = (v) => v >> CHUNK_SHIFT
export const toLocalCoord = (v) => v & CHUNK_MASK

// Chave de chunk. String pra ser debugável e serializável direto; o custo do
// hash de string some perto do custo de malhar 32 KB de voxels.
export const chunkKey = (cx, cz) => `${cx},${cz}`
export function parseChunkKey(key) {
  const texto = String(key)
  const i = texto.indexOf(',')
  if (i < 0) return null
  const a = texto.slice(0, i)
  const b = texto.slice(i + 1)
  // ⚠️ PARTE VAZIA NAO E ZERO. `Number('')` da 0, e sem esta linha a chave
  // truncada `'3,'` virava o chunk (3, 0) em silencio -- um chunk REAL, longe
  // do que se pediu, e nada acusaria. Um validador que aceita lixo e pior que
  // nenhum: quem chama confia nele.
  if (!a || !b) return null
  const cx = Number(a)
  const cz = Number(b)
  if (!Number.isFinite(cx) || !Number.isFinite(cz)) return null
  return { cx, cz }
}

// Chave de seção (chunk + índice vertical) - a unidade de malha.
export const sectionKey = (cx, sy, cz) => `${cx},${sy},${cz}`

// Distância de Chebyshev em chunks - usada pelo streaming (carrega/descarrega
// por anel, não por círculo euclidiano, que deixa buraco nos cantos da tela).
export const chunkDistance = (ax, az, bx, bz) => Math.max(Math.abs(ax - bx), Math.abs(az - bz))

// Os 6 vizinhos de face, na ordem canônica usada pelo mesher e pela luz:
// 0:+x 1:-x 2:+y 3:-y 4:+z 5:-z
export const FACE_DIRS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
]

// Quanto a superfície da água fica ABAIXO do topo do bloco. É o degrauzinho que
// dá a borda visível na praia.
//
// Mora aqui porque DOIS lados precisam do mesmo número e eles não se falam: o
// mesher, que baixa o vértice, e o shader da água, que precisa reconhecer
// "este vértice está na superfície" pra ondular junto. Com o valor duplicado,
// mudar um e esquecer o outro reabre a fresta sem nenhum teste acusar.
export const WATER_DROP = 0.12
