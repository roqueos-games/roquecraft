// RoqueCraft - sobrevivência: vida, fome, saturação, dano e experiência.
//
// Modelo do gênero, simplificado até onde ainda dá tensão sem virar planilha:
//  - 20 de vida (10 corações), 20 de fome (10 coxas), saturação escondida
//  - saturação segura a fome; sem saturação, a fome cai com o ESFORÇO (andar,
//    correr, pular, quebrar bloco), não com o relógio
//  - fome cheia (>=18) regenera vida devagar consumindo comida
//  - fome zerada tira vida até 1 (você não morre de fome, mas fica à mercê)
//  - queda, lava, afogamento e mob tiram vida; morrer larga o inventário
//
// Puro: um `step` recebe estado + eventos e devolve o estado novo.

import { criarArmadura, serializarArmadura, desserializarArmadura } from './armadura.js'

export const MAX_HEALTH = 20
export const MAX_HUNGER = 20

export function createSurvivalState() {
  return {
    health: MAX_HEALTH,
    hunger: MAX_HUNGER,
    saturation: 5,
    exhaustion: 0,
    air: 300, // ticks de fôlego debaixo d'água
    xp: 0,
    level: 0,
    dead: false,
    regenTimer: 0,
    hurtTimer: 0,
    lastDamage: null,
    // O que está vestido (`armadura.js`). É estado de CORPO: não ocupa slot,
    // grava com a vida e cai com a morte.
    armadura: criarArmadura(),
  }
}

// Custo de esforço por segundo, por atividade.
const EXHAUSTION = {
  idle: 0,
  walk: 0.06,
  sprint: 0.32,
  jump: 0.2, // por pulo, não por segundo
  swim: 0.12,
  mine: 0.06, // por bloco quebrado
  attack: 0.1,
  damage: 0.1,
}

export function addExhaustion(state, kind, amount = 1) {
  state.exhaustion += (EXHAUSTION[kind] || 0) * amount
  // cada 4 de esforço consome 1 de saturação; sem saturação, come da fome
  while (state.exhaustion >= 4) {
    state.exhaustion -= 4
    if (state.saturation > 0) state.saturation = Math.max(0, state.saturation - 1)
    else state.hunger = Math.max(0, state.hunger - 1)
  }
  return state
}

export function damage(state, amount, source = 'generic') {
  if (state.dead || state.hurtTimer > 0) return { state, applied: 0 }
  const applied = Math.max(0, Math.round(amount))
  state.health = Math.max(0, state.health - applied)
  state.hurtTimer = 0.5 // meio segundo de invulnerabilidade
  state.lastDamage = source
  state.regenTimer = 0
  if (state.health <= 0) state.dead = true
  return { state, applied }
}

export function heal(state, amount) {
  if (state.dead) return state
  state.health = Math.min(MAX_HEALTH, state.health + amount)
  return state
}

// Comer: restaura fome + saturação. Devolve false se já está cheio.
export function eat(state, food) {
  if (!food || state.hunger >= MAX_HUNGER) return false
  state.hunger = Math.min(MAX_HUNGER, state.hunger + (food.hunger || 0))
  state.saturation = Math.min(state.hunger, state.saturation + (food.saturation || 0))
  return true
}

export function addXp(state, amount) {
  state.xp += amount
  // curva simples: cada nível custa 7 + nível×2
  let need = 7 + state.level * 2
  while (state.xp >= need) {
    state.xp -= need
    state.level++
    need = 7 + state.level * 2
  }
  return state
}

export function xpProgress(state) {
  const need = 7 + state.level * 2
  return Math.min(1, state.xp / need)
}

/**
 * Um passo de sobrevivência.
 * `env` { inWater, headInWater, inLava, onFire, difficulty }
 * Devolve os eventos do passo pra a UI reagir (`hurt`, `died`, `healed`).
 */
export function stepSurvival(state, env, dt) {
  const events = []
  if (state.hurtTimer > 0) state.hurtTimer = Math.max(0, state.hurtTimer - dt)
  if (state.dead) return events

  // fôlego
  if (env.headInWater) {
    // ⚠️ A MORDIDA DA RESPIRAÇÃO AQUÁTICA. O fator nunca é zero (ver
    // `fatorDeFolego`): fôlego infinito apagaria o afogamento, e o
    // afogamento é o que faz o mar ser um lugar e não um corredor.
    state.air -= dt * 20 * (env.fatorDeFolego ?? 1)
    if (state.air <= 0) {
      state.air = 0
      state.drownTimer = (state.drownTimer || 0) + dt
      if (state.drownTimer >= 1) {
        state.drownTimer = 0
        const r = damage(state, 2, 'drown')
        if (r.applied) events.push('hurt')
      }
    }
  } else {
    state.air = Math.min(300, state.air + dt * 60)
    state.drownTimer = 0
  }

  // lava
  if (env.inLava) {
    state.lavaTimer = (state.lavaTimer || 0) + dt
    if (state.lavaTimer >= 0.5) {
      state.lavaTimer = 0
      state.hurtTimer = 0 // lava ignora a invulnerabilidade
      const r = damage(state, 4, 'lava')
      if (r.applied) events.push('hurt')
    }
  } else {
    state.lavaTimer = 0
  }

  // ⚠️ A MORDIDA DA REGENERAÇÃO E DO VENENO, e ela vem ANTES da regeneração
  // por fome de propósito: as duas curas são independentes, e quem bebeu a
  // poção tem que sarar mesmo de barriga vazia — senão a poção só funciona
  // para quem já não precisava dela.
  //
  // O veneno NÃO MATA. Ele para em 1 de vida, como no jogo de referência: um
  // efeito de prazo que mata sozinho tira do jogador a chance de reagir, e o
  // que ele vê é "morri sem nada me atacando".
  if (env.tiqueDeEfeito) {
    const t = env.tiqueDeEfeito
    if (t.regenerar > 0) {
      heal(state, t.regenerar)
      events.push('healed')
    }
    if (t.envenenar > 0 && state.health > 1) {
      state.hurtTimer = 0
      const r = damage(state, Math.min(t.envenenar, state.health - 1), 'poison')
      if (r.applied) events.push('hurt')
    }
  }

  // regeneração / inanição
  if (state.hunger >= 18 && state.health < MAX_HEALTH) {
    state.regenTimer += dt
    if (state.regenTimer >= 3.5) {
      state.regenTimer = 0
      heal(state, 1)
      addExhaustion(state, 'walk', 10)
      events.push('healed')
    }
  } else if (state.hunger <= 0) {
    state.starveTimer = (state.starveTimer || 0) + dt
    if (state.starveTimer >= 4) {
      state.starveTimer = 0
      if (state.health > 1) {
        state.hurtTimer = 0
        const r = damage(state, 1, 'starve')
        if (r.applied) events.push('hurt')
      }
    }
  } else {
    state.regenTimer = 0
  }

  if (state.dead) events.push('died')
  return events
}

export function respawn(state) {
  state.health = MAX_HEALTH
  state.hunger = MAX_HUNGER
  state.saturation = 5
  state.exhaustion = 0
  state.air = 300
  state.dead = false
  state.hurtTimer = 0
  state.regenTimer = 0
  state.lastDamage = null
  // A armadura foi para o chão com o resto (`espolioDaArmadura`); renascer
  // vestido seria renascer com o que se perdeu.
  state.armadura = criarArmadura()
  return state
}

export function serializeSurvival(state) {
  return {
    health: state.health,
    hunger: state.hunger,
    saturation: state.saturation,
    xp: state.xp,
    level: state.level,
    armadura: serializarArmadura(state.armadura),
  }
}

export function deserializeSurvival(data) {
  const s = createSurvivalState()
  if (!data || typeof data !== 'object') return s
  const num = (v, d, lo, hi) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d)
  s.health = num(data.health, MAX_HEALTH, 0, MAX_HEALTH)
  s.hunger = num(data.hunger, MAX_HUNGER, 0, MAX_HUNGER)
  s.saturation = num(data.saturation, 5, 0, MAX_HUNGER)
  s.xp = num(data.xp, 0, 0, 1e9)
  s.level = num(data.level, 0, 0, 1e6)
  s.dead = s.health <= 0
  s.armadura = desserializarArmadura(data.armadura)
  return s
}
