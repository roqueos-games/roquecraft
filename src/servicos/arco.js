// RoqueCraft — O ARCO DO JOGADOR: segurar carrega, soltar atira.
//
// Puro. O esqueleto já atirava (`flechas.js`); o que faltava era o gesto do
// jogador, e o gesto é o que faz o arco ser arco: quem solta cedo dá um
// peteleco, quem segura um segundo acerta de longe. Os números seguem o jogo
// original — carga cheia em 1 s, dano de 1 a 9, velocidade proporcional — e é
// por isso que a distância volta a valer alguma coisa do lado de cá também.

import { EYE_HEIGHT } from './physics.js'

/** Segundos segurando até a carga cheia. */
export const TEMPO_DE_CARGA = 1
/** Abaixo disto o tiro nem sai: um toque acidental não gasta flecha. */
export const CARGA_MINIMA = 0.1
/** Dano na carga mínima e na cheia. */
export const DANO_MINIMO = 1
export const DANO_MAXIMO = 9
/** Velocidade da flecha (blocos/s) na carga mínima e na cheia. */
export const VELOCIDADE_MINIMA = 8
export const VELOCIDADE_MAXIMA = 26
/**
 * A flecha sai do OLHO, que é de onde se mira. Saindo da mão (0,22 abaixo), a
 * flecha de meia carga a três blocos chegava 0,2 abaixo da linha da mira e
 * entrava no chão antes do porco — a sonda mediu 10 → 10 de vida.
 */
export const ALTURA_DO_TIRO = EYE_HEIGHT

/** O estado do arco nas mãos do jogador: quando começou a segurar, ou null. */
export const criarArco = () => ({ armadoEm: null })

/** Começa a segurar. Idempotente: segurar de novo não reinicia a carga. */
export function armar(arco, agora) {
  if (arco.armadoEm === null) arco.armadoEm = agora
  return arco
}

/** A carga (0..1) por quanto tempo segurou. */
export function cargaDe(segundos) {
  return Math.max(0, Math.min(1, segundos / TEMPO_DE_CARGA))
}

/**
 * Solta: devolve a carga (0..1) se o tiro sai, ou `null` se foi um toque
 * curto demais. Nos dois casos o arco volta a descansar.
 */
export function soltar(arco, agora) {
  if (arco.armadoEm === null) return null
  const carga = cargaDe(agora - arco.armadoEm)
  arco.armadoEm = null
  return carga >= CARGA_MINIMA ? carga : null
}

export const danoDe = (carga) => Math.round(DANO_MINIMO + (DANO_MAXIMO - DANO_MINIMO) * carga)
export const velocidadeDe = (carga) =>
  VELOCIDADE_MINIMA + (VELOCIDADE_MAXIMA - VELOCIDADE_MINIMA) * carga

/**
 * A flecha que sai do jogador: origem na mão, direção do olhar, módulo pela
 * carga. É o formato de `criarFlecha`, com `dono: 'jogador'` e o dano dentro —
 * a flecha carrega o próprio dano porque a carga já se foi quando ela chega.
 */
export function flechaDoJogador(id, corpo, dir, carga) {
  const v = velocidadeDe(carga)
  const n = Math.hypot(dir.x, dir.y, dir.z) || 1
  return {
    id,
    x: corpo.x + (dir.x / n) * 0.4,
    y: corpo.y + ALTURA_DO_TIRO,
    z: corpo.z + (dir.z / n) * 0.4,
    vx: (dir.x / n) * v,
    vy: (dir.y / n) * v,
    vz: (dir.z / n) * v,
    idade: 0,
    dono: 'jogador',
    dano: danoDe(carga),
  }
}

/**
 * A criatura mais perto da flecha dentro do raio, ou null. O ponto medido é o
 * MEIO DO CORPO (`alturaDe` dá a altura da criatura): com um ponto fixo a
 * 0,9 do pé, o porco (0,9 de altura) só era atingido pela cabeça.
 */
export function criaturaAtingida(f, mobs, raio, alturaDe = () => 1.8) {
  let melhor = null
  let dm = raio
  for (const m of mobs) {
    const d = Math.hypot(f.x - m.x, f.y - (m.y + alturaDe(m) / 2), f.z - m.z)
    if (d < dm) {
      dm = d
      melhor = m
    }
  }
  return melhor
}
