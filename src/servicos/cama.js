// RoqueCraft - a CAMA: onde ela cabe, quando dá pra dormir, e onde se renasce.
//
// Três regras que não se falam, juntas aqui porque as três são a mesma peça:
//
//   1. ENCAIXE — a cama ocupa duas células, e as duas precisam caber.
//   2. DORMIR  — só à noite, e só se não houver monstro por perto.
//   3. RENASCER — dormir grava o ponto; morrer usa o ponto.
//
// A terceira é a razão de a cama existir. Sem ela a cama é um sofá: pula a
// noite e pronto. É o ponto de renascimento que transforma um buraco na
// montanha em BASE — o lugar pra onde se volta.
//
// Puro: sem Vue, sem three, sem mundo. Quem chama passa acessores.

import { BLOCK_BY_KEY, BLOCKS } from './blocks.js'
import { TICKS_PER_DAY, isNight, normalizeTicks } from './daycycle.js'

/** Distância em que um monstro impede o sono, em blocos. */
export const RAIO_DE_MONSTRO = 8

export const ID_PE = BLOCK_BY_KEY.bed.id
export const ID_CABECEIRA = BLOCK_BY_KEY.bedHead.id

// As quatro direções horizontais, no índice de face canônico do mesher.
const PASSOS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 0, 1],
  [0, 0, -1],
]

// Direção de cada face canônica, e a oposta dela.
const DIR = { 0: [1, 0], 1: [-1, 0], 4: [0, 1], 5: [0, -1] }
const OPOSTO = { 0: 1, 1: 0, 4: 5, 5: 4 }
const FACE_DE = { '1,0': 0, '-1,0': 1, '0,1': 4, '0,-1': 5 }

/**
 * Os oito ids da cama, indexados por metade e por ORIENTAÇÃO — a direção pra
 * onde a ponta de fora daquela metade aponta.
 *
 * Sai do catálogo em vez de ser escrito à mão: uma tabela de ids repetida é
 * uma tabela que sai do lugar quando alguém acrescenta uma variante.
 */
export const ID_DA_CAMA = (() => {
  const t = { pe: {}, cabeceira: {} }
  for (const b of Object.values(BLOCKS)) {
    if (!b.cama) continue
    t[b.cama.cabeceira ? 'cabeceira' : 'pe'][b.cama.orient] = b.id
  }
  return t
})()

export const ehCama = (id) => !!BLOCKS[id]?.cama
export const ehCabeceira = (id) => !!BLOCKS[id]?.cama?.cabeceira
export const orientDaCama = (id) => BLOCKS[id]?.cama?.orient ?? null

/**
 * ONDE A CAMA CABE.
 *
 * Devolve `{ pe, cabeceira }` ou `null`. O pé fica na célula mirada; a
 * cabeceira, uma adiante NA DIREÇÃO DO OLHAR — deitar é entrar de cabeça, e o
 * jogador está de fora olhando pra dentro.
 *
 * As duas células precisam estar livres E apoiadas. A segunda condição é o que
 * impede meia cama pendurada no vazio, e ela é conferida nas DUAS: sem isso a
 * cabeceira nasce boiando sobre um penhasco e a cama vira uma prancha.
 */
export function encaixarCama({ item, destino, dirX, dirZ, livre, apoiado }) {
  if (item !== 'bed') return null
  const [dx, dz] = eixoDominante(dirX, dirZ)
  // A ponta de fora da CABECEIRA aponta pra onde o jogador está olhando; a do
  // PÉ aponta pro lado oposto, de volta pra quem colocou.
  //
  // As duas metades apontando pra lados contrários é o que põe os quatro pés
  // nas quatro quinas do móvel. Se as duas apontassem pro mesmo lado, os quatro
  // pés ficariam empilhados numa ponta só e a cama pareceria uma prancheta.
  const orientCabeceira = FACE_DE[`${dx},${dz}`]
  const orientPe = OPOSTO[orientCabeceira]
  const pe = { ...destino, id: ID_DA_CAMA.pe[orientPe] }
  const cabeceira = {
    x: destino.x + dx,
    y: destino.y,
    z: destino.z + dz,
    id: ID_DA_CAMA.cabeceira[orientCabeceira],
  }
  for (const c of [pe, cabeceira]) {
    if (!livre(c.x, c.y, c.z)) return null
    if (!apoiado(c.x, c.y - 1, c.z)) return null
  }
  return { pe, cabeceira }
}

/**
 * A OUTRA METADE de uma cama, ou null.
 *
 * Procura nas quatro vizinhas a metade complementar. Duas camas encostadas
 * cabeceira com cabeceira deixam a busca ambígua — a primeira encontrada vence.
 * O jogo de referência guarda a direção no estado do bloco e não tem esse
 * problema; aqui isso custaria mais quatro ids por metade, e o caso é raro o
 * bastante pra não pagar esse preço agora. Fica registrado como escolha, não
 * como esquecimento.
 */
export function outraMetade(id, x, y, z, blocoEm) {
  if (!ehCama(id)) return null
  const eu = BLOCKS[id].cama
  // CAMINHO EXATO: a outra metade fica do lado OPOSTO à minha ponta de fora, e
  // aponta pro lado contrário ao meu. Duas camas encostadas cabeceira com
  // cabeceira deixavam de ser ambíguas no momento em que a orientação entrou —
  // era esta a dívida registrada aqui como "escolha, não esquecimento".
  const [dx, dz] = DIR[OPOSTO[eu.orient]]
  const esperado = (eu.cabeceira ? ID_DA_CAMA.pe : ID_DA_CAMA.cabeceira)[OPOSTO[eu.orient]]
  if (blocoEm(x + dx, y, z + dz) === esperado) {
    return { x: x + dx, y, z: z + dz, id: esperado }
  }
  // CAMINHO ANTIGO: save de antes da rodada 12 guarda o par 109/110 sem
  // orientação coerente. Quebrar a compatibilidade deixaria meia cama viva no
  // mundo de quem já jogou — pior que a ambiguidade que este ramo carrega.
  const alvoVelho = eu.cabeceira ? ID_PE : ID_CABECEIRA
  for (const [ax, ay, az] of PASSOS) {
    if (blocoEm(x + ax, y + ay, z + az) === alvoVelho) {
      return { x: x + ax, y: y + ay, z: z + az, id: alvoVelho }
    }
  }
  return null
}

/**
 * DÁ PRA DORMIR?
 *
 * Devolve `{ ok }` ou `{ ok: false, motivo }` com um motivo que a interface
 * traduz. Os dois motivos existem no jogo de referência e os dois ensinam
 * alguma coisa: "é dia" ensina o ciclo, "tem monstro" ensina que a cama não é
 * um botão de fugir do perigo.
 */
export function podeDormir({ ticks, monstroPerto }) {
  if (!isNight(ticks)) return { ok: false, motivo: 'dia' }
  if (monstroPerto) return { ok: false, motivo: 'monstro' }
  return { ok: true }
}

/**
 * O relógio DEPOIS de dormir: o amanhecer seguinte.
 *
 * ⚠️ Devolve o tique ABSOLUTO, não o do dia. O contador do mundo é acumulado —
 * é dele que saem o número do dia e a fase da lua — e devolver o tique
 * normalizado faria o jogo VOLTAR no tempo toda vez que alguém dormisse: o dia
 * 7 viraria dia 0, e a lua voltaria pra cheia.
 */
export function amanhecerDepoisDe(ticks) {
  const noDia = normalizeTicks(ticks)
  return ticks + (TICKS_PER_DAY - noDia)
}

/**
 * Tem monstro perto o bastante pra impedir o sono?
 *
 * Recebe a lista JÁ FILTRADA de hostis, em vez de filtrar aqui por um campo.
 * O motivo é chato e real: a hostilidade mora na DEFINIÇÃO da criatura
 * (`hostile`, em inglês, herdado), não na instância, e um `m.hostil` escrito
 * aqui daria `undefined` em toda criatura — a função devolveria `false` sempre
 * e ninguém veria, porque "consegui dormir" é o resultado esperado.
 */
export function monstroPerto(hostis, x, z, raio = RAIO_DE_MONSTRO) {
  const r2 = raio * raio
  for (const m of hostis) {
    const dx = m.x - x
    const dz = m.z - z
    if (dx * dx + dz * dz <= r2) return true
  }
  return false
}

// Qual dos dois eixos horizontais domina o olhar. Empate vai pro X, e é
// determinístico de propósito: dois cliques iguais têm que dar a mesma cama.
function eixoDominante(dirX, dirZ) {
  if (Math.abs(dirX) >= Math.abs(dirZ)) return [dirX >= 0 ? 1 : -1, 0]
  return [0, dirZ >= 0 ? 1 : -1]
}
