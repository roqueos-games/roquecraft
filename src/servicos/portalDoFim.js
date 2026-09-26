// RoqueCraft — O PORTAL DO FIM: doze molduras num anel, um olho em cada.
//
// Puro. O portal do Nether é uma moldura de obsidiana que o jogador constrói;
// o do Fim é um anel que o jogador ENCONTRA (na fortaleza) e completa: cada
// clique com um olho do Fim na mão enche uma moldura, e quando a décima
// segunda enche, o miolo 3×3 vira portal. É a regra do original, e o que faz
// o Fim custar doze olhos em vez de um clique.
//
// O anel, visto de cima (M = moldura, · = miolo, o centro é C):
//
//        M M M
//      M · · · M
//      M · C · M
//      M · · · M
//        M M M
//
import { ID } from './blocks.js'

/** As doze posições da moldura, relativas ao centro do miolo. */
export const ANEL = [
  ...[-1, 0, 1].map((dx) => [dx, -2]),
  ...[-1, 0, 1].map((dx) => [dx, 2]),
  ...[-1, 0, 1].map((dz) => [-2, dz]),
  ...[-1, 0, 1].map((dz) => [2, dz]),
]

/** As nove células do miolo. */
export const MIOLO = [-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dz) => [dx, dz]))

export const ehMoldura = (id) => id === ID.endPortalFrame || id === ID.endPortalFrameEye
export const ehPortalDoFim = (id) => id === ID.endPortal

/**
 * O centro do anel a que uma moldura pertence, ou null. Uma moldura em
 * (x, z) está a 2 do centro num eixo e a −1..1 no outro: seis candidatos.
 * O anel vale quando as DOZE posições são moldura (com ou sem olho).
 */
export function centroDoAnel(blocoEm, x, y, z) {
  const candidatos = [
    ...[-1, 0, 1].map((d) => [x - d, z + 2]),
    ...[-1, 0, 1].map((d) => [x - d, z - 2]),
    ...[-1, 0, 1].map((d) => [x + 2, z - d]),
    ...[-1, 0, 1].map((d) => [x - 2, z - d]),
  ]
  for (const [cx, cz] of candidatos) {
    if (ANEL.every(([dx, dz]) => ehMoldura(blocoEm(cx + dx, y, cz + dz))))
      return { x: cx, y, z: cz }
  }
  return null
}

/** Quantas molduras do anel já têm olho. */
export function olhosNoAnel(blocoEm, centro) {
  return ANEL.filter(
    ([dx, dz]) => blocoEm(centro.x + dx, centro.y, centro.z + dz) === ID.endPortalFrameEye,
  ).length
}

/**
 * Põe o olho na moldura clicada. Devolve as edições: a moldura que ganhou o
 * olho e, se ela era a décima segunda, as nove células do miolo viradas
 * portal. `null` quando o bloco não é moldura vazia.
 */
export function porOlho(blocoEm, x, y, z) {
  if (blocoEm(x, y, z) !== ID.endPortalFrame) return null
  const edicoes = [{ x, y, z, id: ID.endPortalFrameEye }]
  const centro = centroDoAnel(blocoEm, x, y, z)
  if (!centro) return { edicoes, completou: false }
  // Este olho conta: o `blocoEm` ainda vê a moldura vazia.
  const cheias = olhosNoAnel(blocoEm, centro) + 1
  if (cheias < ANEL.length) return { edicoes, completou: false }
  for (const [dx, dz] of MIOLO) {
    edicoes.push({ x: centro.x + dx, y, z: centro.z + dz, id: ID.endPortal })
  }
  return { edicoes, completou: true }
}

/**
 * O anel inteiro, pronto para ser ESCRITO no mundo (a fortaleza usa; o
 * criativo também): as doze molduras, cada uma com olho ou sem, e o miolo
 * vazio. `olhos` é quantas já vêm cheias — o original vem com algumas.
 */
export function celulasDoAnel(cx, y, cz, olhos = 0, sorteio = Math.random) {
  const comOlho = new Set()
  const indices = ANEL.map((_, i) => i)
  for (let n = 0; n < Math.min(olhos, ANEL.length); n++) {
    const k = Math.floor(sorteio() * indices.length)
    comOlho.add(indices.splice(k, 1)[0])
  }
  return ANEL.map(([dx, dz], i) => ({
    x: cx + dx,
    y,
    z: cz + dz,
    id: comOlho.has(i) ? ID.endPortalFrameEye : ID.endPortalFrame,
  }))
}
