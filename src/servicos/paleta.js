// RoqueCraft — a paleta por chunk: como o mundo passa de 255 blocos para 65 mil
// sem dobrar a memória.
//
// TRAVA T1 DO PLANO. `chunk.blocks` era um `Uint8Array` de ids GLOBAIS, então o
// jogo inteiro cabia em 255 tipos de bloco — 160 já em uso, 95 livres. A onda de
// agricultura sozinha come dezenas (cada estágio de crescimento é um estado), e
// quando o último id acabasse não haveria saída barata.
//
// A saída óbvia seria `Uint16Array`. **Medido antes de descartar**, na distância
// de render máxima (16 chunks, 1.089 colunas carregadas): os voxels vão de
// 68,1 MB para 102,1 MB. Trinta e quatro megabytes a mais num aparelho onde o
// Safari mata a aba por memória — e "verde no desktop não é verde no iPhone" já
// derrubou este jogo uma vez.
//
// Então: `blocks` guarda ÍNDICE LOCAL (8 bits) e a paleta diz qual id global
// cada índice é. Um chunk típico tem uma dúzia de tipos de bloco. O custo de
// memória fica igual ao de hoje, mais 512 bytes de paleta por coluna.
//
// O ÍNDICE 0 É AR, SEMPRE. `new Uint8Array(n)` nasce zerado, e chunk recém-criado
// tem que ser ar sem ninguém escrever nada. Trocar isso faria todo chunk novo
// nascer cheio de um bloco qualquer.
//
// E QUANDO 256 TIPOS NÃO BASTAM NUM MESMO CHUNK? O chunk é PROMOVIDO: `blocks`
// vira `Uint16Array` de ids globais e a paleta vira `null` (identidade). Só o
// chunk patológico paga a memória, e nenhuma edição é recusada — recusar a
// edição do jogador para caber na estrutura seria a estrutura mandando no jogo.
import { AIR } from './constants.js'

export const MAX_ENTRADAS = 256
export const ID_MAXIMO = 65535

export function criarPaleta() {
  const ids = new Uint16Array(MAX_ENTRADAS)
  ids[0] = AIR
  return { ids, tamanho: 1, porId: new Map([[AIR, 0]]) }
}

/** O índice deste id nesta paleta, ou -1 se ele ainda não está nela. */
export const indiceDe = (paleta, id) => {
  const i = paleta.porId.get(id)
  return i === undefined ? -1 : i
}

export const idDoIndice = (paleta, i) => paleta.ids[i]

/**
 * Insere o id e devolve o índice; -1 quando a paleta está cheia.
 * Não promove nada: quem decide promover é o dono do chunk.
 */
export function inserir(paleta, id) {
  const existente = indiceDe(paleta, id)
  if (existente >= 0) return existente
  if (paleta.tamanho >= MAX_ENTRADAS) return -1
  const i = paleta.tamanho++
  paleta.ids[i] = id
  paleta.porId.set(id, i)
  return i
}

/** Uma cópia independente — paleta compartilhada entre dois chunks é um chunk escrevendo no outro. */
export function clonarPaleta(paleta) {
  if (!paleta) return null
  return {
    ids: Uint16Array.from(paleta.ids),
    tamanho: paleta.tamanho,
    porId: new Map(paleta.porId),
  }
}

/**
 * Uma tabela de 256 posições que responde a pergunta do caminho quente
 * ("este índice é opaco?") sem passar pelo id global. É o que mantém o mesher e
 * a luz com o MESMO custo de antes: um lookup em array de 256, como era.
 */
export function tabelaLocal(paleta, tabelaGlobal, vazio = 0) {
  const out = new Uint8Array(MAX_ENTRADAS)
  if (!paleta) return null // chunk promovido lê a tabela global direto
  for (let i = 0; i < paleta.tamanho; i++) out[i] = tabelaGlobal[paleta.ids[i]] ?? vazio
  return out
}

/** Serialização da paleta: só as entradas em uso, como array simples. */
export const serializarPaleta = (paleta) =>
  paleta ? Array.from(paleta.ids.subarray(0, paleta.tamanho)) : null

export function desserializarPaleta(lista) {
  if (!Array.isArray(lista) || !lista.length) return null
  const p = criarPaleta()
  p.tamanho = 0
  p.porId.clear()
  for (const id of lista) {
    const n = Number(id)
    // Entrada inválida vira AR em vez de derrubar a carga do mundo: um save
    // corrompido numa entrada não pode custar o mundo inteiro do jogador.
    const limpo = Number.isInteger(n) && n >= 0 && n <= ID_MAXIMO ? n : AIR
    const i = p.tamanho++
    p.ids[i] = limpo
    if (!p.porId.has(limpo)) p.porId.set(limpo, i)
  }
  if (p.tamanho === 0) return criarPaleta()
  return p
}

/**
 * Recolhe as entradas que nenhum voxel usa mais e reescreve os índices.
 * Quem quebra o último bloco de um tipo deixa a entrada órfã para trás; sem
 * isto, cavar e recolocar 256 vezes promoveria um chunk que tem três tipos.
 * Devolve quantas entradas sumiram.
 */
export function compactar(paleta, blocks) {
  if (!paleta) return 0
  const usado = new Uint8Array(MAX_ENTRADAS)
  for (let i = 0; i < blocks.length; i++) usado[blocks[i]] = 1
  usado[0] = 1 // o ar fica, mesmo num chunk sólido: é o índice que zero significa
  const de = new Uint8Array(MAX_ENTRADAS)
  const novosIds = new Uint16Array(MAX_ENTRADAS)
  let n = 0
  for (let i = 0; i < paleta.tamanho; i++) {
    if (!usado[i]) continue
    de[i] = n
    novosIds[n] = paleta.ids[i]
    n++
  }
  const sumiram = paleta.tamanho - n
  if (!sumiram) return 0
  for (let i = 0; i < blocks.length; i++) blocks[i] = de[blocks[i]]
  paleta.ids.set(novosIds)
  paleta.ids.fill(0, n)
  paleta.tamanho = n
  paleta.porId.clear()
  for (let i = 0; i < n; i++)
    if (!paleta.porId.has(paleta.ids[i])) paleta.porId.set(paleta.ids[i], i)
  return sumiram
}

/**
 * Converte os índices em ids globais num `Uint16Array` novo. É o que acontece
 * quando a paleta enche, e é também como a vizinhança do mesher é montada.
 */
export function expandirParaIds(blocks, paleta) {
  if (!paleta) return blocks
  const out = new Uint16Array(blocks.length)
  const ids = paleta.ids
  for (let i = 0; i < blocks.length; i++) out[i] = ids[blocks[i]]
  return out
}
