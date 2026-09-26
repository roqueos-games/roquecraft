// RoqueCraft — O DRAGÃO DO FIM: circula os pilares, mergulha, morde e sobe.
//
// Puro. É a única criatura que VOA, e por isso o passo dela não passa por
// `stepMob` (chão, gravidade, pulo): ela tem três estados e nenhum deles toca
// o terreno. Circula num anel dentro dos pilares a uma altura fixa; de tempos
// em tempos mergulha na direção do jogador; ao alcançá-lo morde (um `attack`
// como o do zumbi, com mais dano) e sobe de volta ao anel. Sem cristais, sem
// sopro: é o dragão que dá para provar com uma sonda de dois minutos, e é o
// que faz o Fim ter fim.

/** A altura do voo e o raio do anel (dentro dos pilares, que ficam em 34). */
export const ALTURA_DO_VOO = 82
export const RAIO_DO_VOO = 24
/** Radianos por segundo no anel: uma volta a cada ~18 s. */
export const VELOCIDADE_ANGULAR = 0.35
/** Blocos por segundo: no anel e no mergulho. */
export const VELOCIDADE_DO_VOO = 9
export const VELOCIDADE_DO_MERGULHO = 16
/** Segundos entre mergulhos, e o teto de um mergulho antes de desistir. */
export const ESPERA_ENTRE_MERGULHOS = 8
export const TEMPO_MAXIMO_DE_MERGULHO = 6
/** A mordida: alcance e recarga. O dano vem da tabela do mob. */
export const ALCANCE_DA_MORDIDA = 3.2
export const RECARGA_DA_MORDIDA = 2
/** Só mergulha se o jogador está a menos disto do centro do anel. */
export const ALCANCE_DO_INTERESSE = 70
/** Batidas de asa por segundo (o relógio do `nado` do render). */
export const BATIDA = 2.2

/**
 * O estado do voo mora em `mob.voo`, num objeto só: `estado`, `timer` e
 * `angulo` já existem no mob de terra com outros significados (`estado` é a
 * rotina do aldeão), e reaproveitá-los foi o primeiro defeito deste arquivo.
 */
export function criarEstadoDoDragao(mob) {
  mob.voo = {
    estado: 'circulando',
    angulo: Math.atan2(mob.z, mob.x),
    timer: ESPERA_ENTRE_MERGULHOS,
  }
  mob.faseNado = 0
  mob.vy = 0
  return mob
}

/** Anda `vel * dt` na direção do alvo, sem passar dele. Devolve a distância que faltava. */
function voarPara(mob, alvo, vel, dt) {
  const dx = alvo.x - mob.x
  const dy = alvo.y - mob.y
  const dz = alvo.z - mob.z
  const d = Math.hypot(dx, dy, dz)
  if (d < 1e-6) return 0
  const passo = Math.min(d, vel * dt)
  mob.x += (dx / d) * passo
  mob.y += (dy / d) * passo
  mob.z += (dz / d) * passo
  // Olha para onde vai. `atan2(dx, -dz)` é a convenção de yaw do jogo.
  if (Math.hypot(dx, dz) > 0.01) mob.yaw = Math.atan2(dx, -dz)
  return d - passo
}

/**
 * Um passo. `env.player` é onde o jogador está. Devolve eventos: `attack`
 * quando morde. Nunca `died` por conta própria — quem mata é `hurtMob`.
 */
export function passoDoDragao(mob, def, env, dt) {
  const events = []
  if (!mob.voo) criarEstadoDoDragao(mob)
  const v = mob.voo
  if (mob.hurtFlash > 0) mob.hurtFlash = Math.max(0, mob.hurtFlash - dt)
  if (mob.attackCooldown > 0) mob.attackCooldown = Math.max(0, mob.attackCooldown - dt)
  mob.faseNado = (mob.faseNado || 0) + dt * BATIDA * Math.PI * 2
  const p = env.player

  if (v.estado === 'circulando') {
    v.angulo += VELOCIDADE_ANGULAR * dt
    const alvo = {
      x: Math.cos(v.angulo) * RAIO_DO_VOO,
      y: ALTURA_DO_VOO + Math.sin(v.angulo * 3) * 2,
      z: Math.sin(v.angulo) * RAIO_DO_VOO,
    }
    voarPara(mob, alvo, VELOCIDADE_DO_VOO, dt)
    v.timer -= dt
    if (v.timer <= 0 && p && Math.hypot(p.x, p.z) < ALCANCE_DO_INTERESSE) {
      v.estado = 'mergulhando'
      v.timer = TEMPO_MAXIMO_DE_MERGULHO
    }
    return events
  }

  if (v.estado === 'mergulhando') {
    v.timer -= dt
    if (!p || v.timer <= 0) {
      v.estado = 'subindo'
      return events
    }
    const alvo = { x: p.x, y: p.y + 1, z: p.z }
    const falta = voarPara(mob, alvo, VELOCIDADE_DO_MERGULHO, dt)
    if (falta <= ALCANCE_DA_MORDIDA) {
      if (mob.attackCooldown <= 0) {
        events.push('attack')
        mob.attackCooldown = RECARGA_DA_MORDIDA
      }
      v.estado = 'subindo'
    }
    return events
  }

  // subindo: de volta à altura do anel, no raio do anel.
  const ang = Math.atan2(mob.z, mob.x)
  const alvo = { x: Math.cos(ang) * RAIO_DO_VOO, y: ALTURA_DO_VOO, z: Math.sin(ang) * RAIO_DO_VOO }
  const falta = voarPara(mob, alvo, VELOCIDADE_DO_VOO, dt)
  if (falta < 1.5) {
    v.estado = 'circulando'
    v.angulo = ang
    v.timer = ESPERA_ENTRE_MERGULHOS
  }
  return events
}
