// RoqueCraft — A POÇÃO ARREMESSÁVEL: o frasco voa, quebra e borrifa em volta.
//
// Puro. Um frasco é uma flecha com outra forma (`forma: 'frasco'`): mesma
// física de `flechas.js`, mesmo passo amostrado, mesma lista — o que muda é o
// que acontece quando ele para. Em vez de dano num alvo, a DOSE da garrafa cai
// em quem está a até RAIO_DO_ESTILHACO do ponto de quebra, cheia no centro e
// minguando até zero na borda. É a regra do original, e é o que faz jogar a
// poção AOS PÉS ser o jeito de tomar uma poção de cura sem parar pra beber.

import { ALTURA_DO_TIRO } from './arco.js'
import { doseDe } from './fermentacao.js'

/** Blocos por segundo. Mais lento que a flecha: o frasco é pra perto. */
export const VELOCIDADE_DO_ARREMESSO = 12
/** Raio do borrifo, em blocos. */
export const RAIO_DO_ESTILHACO = 4
/** Raio de acerto em criatura, em blocos: o frasco é mais gordo que a flecha. */
export const RAIO_DO_FRASCO = 0.6

/** A cor do líquido, pra malha em voo. Espelha os ícones das garrafas. */
export const COR_DA_POCAO = {
  pocao_estranha: 0x6b5f7a,
  pocao_velocidade: 0x7cd0f0,
  pocao_lentidao: 0x5a6a80,
  pocao_forca: 0xd4402a,
  pocao_cura: 0xf24a72,
  pocao_dano: 0x5a1030,
  pocao_veneno: 0x5aa02a,
  pocao_respiracao: 0x2ab0a8,
}

/**
 * O frasco que sai do jogador: da altura do olho, na direção da mira, com a
 * garrafa (item + modificadores) dentro — a dose só se resolve na quebra.
 */
export function frascoDoJogador(id, corpo, dir, item, pocao = null) {
  const n = Math.hypot(dir.x, dir.y, dir.z) || 1
  const v = VELOCIDADE_DO_ARREMESSO
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
    forma: 'frasco',
    item,
    pocao: pocao ? { ...pocao } : null,
    cor: COR_DA_POCAO[item] ?? 0xcccccc,
  }
}

/** Quanto da dose chega a `d` blocos do centro: 1 no centro, 0 na borda. */
export function alcanceDe(d) {
  return Math.max(0, Math.min(1, 1 - d / RAIO_DO_ESTILHACO))
}

/**
 * O borrifo: quem foi alcançado e com que fração. `corpos` é uma lista de
 * `{ x, y, z, ... }` (o jogador e as criaturas); o ponto medido é o meio do
 * corpo, por `alturaDe`. Devolve `[]` quando a garrafa não faz nada (a
 * estranha) — quebrar sem efeito é a resposta, não um erro.
 */
export function estilhacar(frasco, corpos, alturaDe = () => 1.8) {
  const dose = doseDe(frasco.item, frasco.pocao)
  if (!dose) return []
  const saida = []
  for (const c of corpos) {
    const d = Math.hypot(frasco.x - c.x, frasco.y - (c.y + alturaDe(c) / 2), frasco.z - c.z)
    const alcance = alcanceDe(d)
    if (alcance <= 0) continue
    saida.push({
      corpo: c,
      alcance,
      efeito: dose.efeito,
      nivel: dose.nivel,
      // O prazo minga com a distância; o instantâneo (cura, dano) não tem prazo.
      duracao: dose.duracao ? dose.duracao * alcance : 0,
    })
  }
  return saida
}
