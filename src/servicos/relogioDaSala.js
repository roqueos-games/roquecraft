// RoqueCraft - O RELÓGIO DA SALA (Onda 6.1 do Goal 21).
//
// Cada cliente avançava o próprio `ticks` e o próprio tempo, e o clima é uma
// função pura de (semente, ticks): dois jogadores na mesma sala viam horas
// diferentes e chuvas diferentes, e ninguém percebia porque cada um olhava só
// para a própria tela. O anfitrião é a fonte da verdade de tudo que a sala
// compartilha; o relógio entra nessa lista.
//
// O anfitrião publica `{ ticks, chuva }` a cada `PASSO_DO_RELOGIO` segundos;
// o convidado continua avançando o relógio local sozinho (a cadência é a mesma
// nos dois lados) e só ACERTA quando o desvio passa da tolerância. Sem a
// tolerância, cada mensagem daria um solavanco de sol de alguns ticks, visível
// no céu; com ela, a latência da rede cabe dentro da folga.
//
// `chuva` é a SOBRESCRITA do tempo (o painel de criativo): `null` quando o
// mundo manda. A chuva natural não precisa viajar - sai da semente e dos ticks.

import { TICKS_PER_DAY } from './daycycle.js'

/** Cadência de publicação do relógio pelo anfitrião, em segundos. */
export const PASSO_DO_RELOGIO = 2
/** Desvio (em ticks) a partir do qual o convidado acerta o relógio. 40 = 2 s. */
export const TOLERANCIA_DO_RELOGIO = 40

/**
 * Desvio CIRCULAR entre o relógio local e o remoto, em ticks, no intervalo
 * (-TICKS_PER_DAY/2, TICKS_PER_DAY/2]. Sem o círculo, 23.990 → 10 pareceria um
 * dia inteiro de atraso e o convidado pularia o dia todo à meia-noite.
 */
export function desvioDoRelogio(local, remoto) {
  const meio = TICKS_PER_DAY / 2
  const d = (((remoto - local) % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY
  return d > meio ? d - TICKS_PER_DAY : d
}

/** O convidado precisa acertar o relógio para este valor remoto? */
export function precisaAcertar(local, remoto, tolerancia = TOLERANCIA_DO_RELOGIO) {
  if (!Number.isFinite(local) || !Number.isFinite(remoto)) return false
  return Math.abs(desvioDoRelogio(local, remoto)) > tolerancia
}

/**
 * Normaliza o que chegou do banco. Valor de fora, então forma fechada:
 * `ticks` finito dentro do dia; `chuva` é `null` ou um número em [0, 1].
 * Devolve `null` quando não há relógio utilizável.
 */
export function normalizarRelogio(v) {
  if (!v || typeof v !== 'object') return null
  const ticks = Number(v.ticks)
  if (!Number.isFinite(ticks)) return null
  const chuva =
    v.chuva == null || !Number.isFinite(Number(v.chuva))
      ? null
      : Math.max(0, Math.min(1, Number(v.chuva)))
  return { ticks: ((ticks % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY, chuva }
}
