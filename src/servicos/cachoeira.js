// RoqueCraft - CACHOEIRA: achar as quedas d'agua perto, e o quanto elas pesam.
//
// A SIMULACAO DE QUEDA JA EXISTE e nao se mexe nela: `fluidos.js` marca a
// coluna caindo com `NIVEL_CAINDO`, e ela alimenta como fonte -- e o que faz a
// queda formar poca larga no pe em vez de um fiozinho. O que faltava era a
// queda ser OUVIDA e VISTA. Sao sete leitos de ambiente e nenhum era cachoeira;
// a unica particula do jogo era bloco quebrando.
//
// ⚠️ UMA CACHOEIRA E UMA COLUNA, NAO UMA CELULA.
//
// Contar celula seria o caminho obvio e esta errado por dois lados. Uma cortina
// larga de agua (uma represa rompida, um lago vazando por uma beirada de dez
// blocos) tem dezenas de celulas caindo lado a lado e e UMA cachoeira. E uma
// queda de vinte blocos de altura tem vinte celulas empilhadas e tambem e uma
// so -- mas essa pesa muito mais que a de dois. O que separa as duas coisas e a
// ALTURA da coluna, e e por ela que este arquivo mede.

import { ehAgua, nivelDe } from './fluidos.js'
import { NIVEL_CAINDO } from './blocks.js'

/**
 * Uma celula de agua caindo -- o tijolo de que a coluna e feita.
 *
 * Fonte e lamina que escorre NAO contam: rio raso nao faz barulho de cachoeira,
 * e sem esta distincao qualquer praia viraria Iguacu.
 */
export const ehQueda = (id) => ehAgua(id) && nivelDe(id) === NIVEL_CAINDO

/** Abaixo disto e goteira, nao cachoeira. */
export const ALTURA_MINIMA = 3

/**
 * Onde a altura para de aumentar o som.
 *
 * ⚠️ SEM TETO, UMA QUEDA DE CEM BLOCOS FICA CEM VEZES MAIS ALTA que uma de um,
 * e o jogador nao ouve mais nada alem dela. Doze blocos ja e uma cachoeira
 * respeitavel; o que passa disso e mais alto de olhar, nao de ouvir.
 */
export const ALTURA_DE_SATURACAO = 12

/** Ate onde se procura, e onde o som ja sumiu. */
export const RAIO_DA_BUSCA = 14

/**
 * Quantas celulas de queda ha EMPILHADAS a partir daqui, descendo.
 *
 * Para no primeiro nao-queda: a coluna e contigua por definicao. Duas quedas
 * separadas por uma saliencia sao duas quedas, e somar as duas daria a uma
 * escadinha o peso de um paredao.
 */
export function alturaDaColuna(x, y, z, blocoEm, teto = 64) {
  if (!ehQueda(blocoEm(x, y, z))) return 0
  let h = 1
  while (h < teto && ehQueda(blocoEm(x, y - h, z))) h += 1
  return h
}

/**
 * O topo de cada coluna de queda perto do jogador.
 *
 * ⚠️ SO O TOPO ENTRA. Varrendo tudo, uma queda de dez blocos apareceria dez
 * vezes -- uma por celula -- e a mesma agua contaria dez cachoeiras. Uma celula
 * so e topo quando a de cima NAO e queda.
 */
export function acharQuedas({ jogador, blocoEm, raio = RAIO_DA_BUSCA, minima = ALTURA_MINIMA }) {
  const px = Math.floor(jogador.x)
  const py = Math.floor(jogador.y)
  const pz = Math.floor(jogador.z)
  const achadas = []
  for (let dx = -raio; dx <= raio; dx++) {
    for (let dz = -raio; dz <= raio; dz++) {
      for (let dy = -raio; dy <= raio; dy++) {
        const x = px + dx
        const y = py + dy
        const z = pz + dz
        if (!ehQueda(blocoEm(x, y, z))) continue
        if (ehQueda(blocoEm(x, y + 1, z))) continue // nao e o topo
        const altura = alturaDaColuna(x, y, z, blocoEm)
        if (altura < minima) continue
        achadas.push({ x, y, z, altura, base: { x, y: y - altura + 1, z } })
      }
    }
  }
  return achadas
}

/** O peso da altura, saturando. 0..1 */
export const pesoDaAltura = (altura) =>
  Math.max(0, Math.min(1, (altura - ALTURA_MINIMA) / (ALTURA_DE_SATURACAO - ALTURA_MINIMA)))

/**
 * O quanto a distancia cala. 1 em cima, 0 no raio.
 *
 * Medido ate o MEIO da coluna e nao ate o topo: de baixo de uma queda de vinte
 * blocos o topo esta a vinte de distancia, e medir por ele deixaria a cachoeira
 * quase muda justamente onde ela ensurdece.
 */
export function pesoDaDistancia(queda, jogador, raio = RAIO_DA_BUSCA) {
  const meio = queda.y - (queda.altura - 1) / 2
  const d = Math.hypot(queda.x + 0.5 - jogador.x, meio - jogador.y, queda.z + 0.5 - jogador.z)
  return Math.max(0, Math.min(1, 1 - d / raio))
}

/**
 * O ganho do leito de cachoeira, dado tudo que ha por perto.
 *
 * ⚠️ VENCE A MAIS FORTE, NAO A SOMA.
 *
 * Somar parece justo e destroi a escala: uma cortina de dez colunas lado a lado
 * -- que e UMA cachoeira -- satura na hora, e a partir dai qualquer vazamento
 * de lago soa igual ao paredao. Com o maximo, o que manda e a maior queda
 * audivel, que e como o ouvido funciona: perto de uma cachoeira grande ninguem
 * escuta a pequena ao lado.
 */
export function forcaDaCachoeira({ quedas, jogador, raio = RAIO_DA_BUSCA }) {
  let forte = 0
  for (const q of quedas) {
    const g = pesoDaAltura(q.altura) * pesoDaDistancia(q, jogador, raio)
    if (g > forte) forte = g
  }
  return forte
}

/**
 * A queda que manda -- a que o borrifo deve seguir.
 *
 * E a MESMA conta do som, de proposito: o borrifo tem que sair de onde o
 * barulho vem, senao o jogador ve espuma num canto e ouve a queda no outro.
 */
export function quedaDominante({ quedas, jogador, raio = RAIO_DA_BUSCA }) {
  let melhor = null
  let forte = 0
  for (const q of quedas) {
    const g = pesoDaAltura(q.altura) * pesoDaDistancia(q, jogador, raio)
    if (g > forte) {
      forte = g
      melhor = q
    }
  }
  return melhor && forte > 0 ? { ...melhor, forca: forte } : null
}
