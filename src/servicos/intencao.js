// RoqueCraft - A INTENÇÃO VALIDADA (Goal 21, Onda 6.4).
//
// O convidado não resolve nada: ele AVISA ("golpeei o mob X com dano Y") e o
// anfitrião aplica. Até aqui o anfitrião aplicava o que chegasse. A regra do
// banco já exige membro e dano ≤ 40; o que só o anfitrião sabe é ONDE o
// atacante estava e onde o mob está. Um golpe de quem está a 60 blocos não é
// golpe, é cliente alterado - ou um bug, e nos dois casos a resposta é
// recusar e contar.
//
// Tudo puro e pequeno, de propósito: a fiação chama, o teste mata mutante.

import { ALCANCE } from './mira.js'

/** Coincide com o `.validate` de `hits` no `database.rules.json`. */
export const DANO_MAXIMO_DO_GOLPE = 40
/**
 * Alcance criativo (8) mais a folga da latência: com 150 ms, mob e jogador
 * andam meio bloco cada um entre a intenção e a chegada dela.
 */
export const ALCANCE_DO_GOLPE_REMOTO = ALCANCE.creative + 2

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

/**
 * @param {object} g  `{ dano, atacante: {x,y,z} | null, alvo: {x,y,z} | null }`
 * @returns {{ ok: boolean, motivo: string | null }}
 */
export function golpeAceito({ dano, atacante, alvo }) {
  if (!Number.isFinite(dano) || dano <= 0) return { ok: false, motivo: 'dano' }
  if (dano > DANO_MAXIMO_DO_GOLPE) return { ok: false, motivo: 'dano' }
  if (!alvo) return { ok: false, motivo: 'alvo' }
  // Atacante que ainda não publicou posição não tem como provar que alcança.
  if (!atacante || ![atacante.x, atacante.y, atacante.z].every(Number.isFinite))
    return { ok: false, motivo: 'atacante' }
  if (dist(atacante, alvo) > ALCANCE_DO_GOLPE_REMOTO) return { ok: false, motivo: 'alcance' }
  return { ok: true, motivo: null }
}
