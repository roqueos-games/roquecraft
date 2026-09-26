/**
 * NADO — o passo das criaturas de ÁGUA.
 *
 * "temos que modelar peixes, lulas, polvos, pinguins, e etc para dar mais vida
 * ao nosso minecraft" — founder, 25/08/2026.
 *
 * ⚠️ ARQUIVO PRÓPRIO, E NÃO UM `if (aquatico)` DENTRO DE `stepMob`.
 *
 * A tentação é óbvia e está errada. `stepMob` é a IA de TERRA, e ela é feita de
 * suposições que não valem debaixo d'água em quase nenhuma linha: existe um
 * chão, existe gravidade, o movimento é em DUAS dimensões e o `y` sai do
 * terreno, pular é um evento, cair machuca, e "estar preso" quer dizer bater
 * numa parede lateral. Peixe não tem nada disso — ele se move em três eixos,
 * escolhe a altura, não pula, não cai, e "estar preso" quer dizer estar prestes
 * a sair da água.
 *
 * Enfiar isso num ramo dentro da maior função do módulo teria dois resultados
 * previsíveis: cada regra de terra ganharia um `&& !aquatico`, e a primeira que
 * eu esquecesse produziria um peixe andando no fundo do mar como se fosse um
 * porco molhado. É o mesmo tipo de defeito que pôs zumbi debaixo d'água — uma
 * regra escrita pra um mundo aplicada a outro.
 *
 * O que ELES compartilham fica em `mobs.js` e é chamado daqui: vida, dano,
 * empurrão, drops, despawn. O que muda é só o passo.
 */

/** Quanto o rumo gira por segundo. Peixe vira rápido; polvo, devagar. */
const GIRO_BASE = 2.6

/**
 * Um passo de nado.
 *
 * `env` precisa de: liquidAt(x,y,z), solidAt(x,y,z), player{x,y,z}.
 *
 * O contrato de saída é o mesmo do passo de terra: devolve a lista de eventos e
 * escreve em `mob` — para quem chama, um peixe é uma criatura como outra
 * qualquer.
 */
export function passoDeNado(mob, def, env, dt) {
  const events = []
  if (mob.hurtFlash > 0) mob.hurtFlash = Math.max(0, mob.hurtFlash - dt)
  if (mob.attackCooldown > 0) mob.attackCooldown = Math.max(0, mob.attackCooldown - dt)

  // ── FORA D'ÁGUA ───────────────────────────────────────────────────────────
  //
  // Não é um caso de borda: é o que acontece toda vez que uma onda passa, que o
  // bicho sobe demais, ou que o jogador tira a água debaixo dele. Peixe fora da
  // água AFUNDA e se debate — não paira, e muito menos anda.
  const naAgua = !!env.liquidAt?.(Math.floor(mob.x), Math.floor(mob.y), Math.floor(mob.z))
  if (!naAgua) {
    // O anfíbio (pinguim) fica de pé e caminha; o resto se debate e afunda.
    if (def.anfibio) {
      mob.vy = (mob.vy || 0) - 22 * dt
      mob.y += mob.vy * dt
      if (env.solidAt?.(Math.floor(mob.x), Math.floor(mob.y - 0.1), Math.floor(mob.z))) {
        mob.y = Math.floor(mob.y) + 1
        mob.vy = 0
      }
      mob.debate = 0
      return events
    }
    mob.vy = (mob.vy || 0) - 16 * dt
    mob.y += mob.vy * dt
    // O debate é o que faz o peixe encalhado parecer vivo em vez de morto.
    mob.debate = (mob.debate || 0) + dt
    mob.yaw += Math.sin(mob.debate * 21) * 5 * dt
    if (env.solidAt?.(Math.floor(mob.x), Math.floor(mob.y - 0.1), Math.floor(mob.z))) {
      mob.y = Math.floor(mob.y) + 1
      mob.vy = 0
    }
    // Sufoca devagar: 1 de vida a cada dois segundos fora d'água.
    mob.foraDagua = (mob.foraDagua || 0) + dt
    if (mob.foraDagua >= 2) {
      mob.foraDagua = 0
      mob.health -= 1
      mob.hurtFlash = 0.25
      if (mob.health <= 0) events.push('died')
    }
    return events
  }
  mob.foraDagua = 0
  mob.debate = 0
  mob.vy = 0

  // ── O RUMO ────────────────────────────────────────────────────────────────
  //
  // Guardado como par (yaw, subida) e não como vetor de velocidade, porque o
  // que se quer controlar é o quanto ele VIRA por segundo. Com velocidade
  // livre, a interpolação entre dois rumos passa pelo zero e o bicho para no
  // meio da curva — parece que travou.
  mob.timer -= dt
  if (mob.timer <= 0 || mob.yaw === undefined) {
    // Cada peixe tem seu próprio ritmo, senão o cardume inteiro muda de direção
    // no mesmo instante e lê como bando de robôs.
    mob.timer = 1.4 + (mob.seedRnd?.() ?? Math.random()) * 3.2
    mob.rumo = (mob.rumo ?? mob.yaw ?? 0) + ((mob.seedRnd?.() ?? Math.random()) - 0.5) * 2.4
    mob.subida = ((mob.seedRnd?.() ?? Math.random()) - 0.5) * 0.7
    // Parar de vez em quando é metade do que faz um peixe parecer um peixe.
    mob.parado = (mob.seedRnd?.() ?? Math.random()) < 0.22
  }

  // ── FUGIR DO JOGADOR ──────────────────────────────────────────────────────
  const p = env.player
  let fugindo = false
  if (p) {
    const dx = mob.x - p.x
    const dy = mob.y - p.y
    const dz = mob.z - p.z
    const d = Math.hypot(dx, dy, dz)
    if (d < (def.distanciaDeFuga ?? 4.5) && d > 0.001) {
      mob.rumo = Math.atan2(dx, dz)
      mob.subida = Math.max(-0.8, Math.min(0.8, dy / Math.max(0.6, d)))
      mob.parado = false
      fugindo = true
    }
  }

  // ── NÃO SAIR DA ÁGUA ──────────────────────────────────────────────────────
  //
  // A regra é olhar pra ONDE SE VAI, não pra onde se está: virar só depois de
  // sair já é tarde, e o bicho aparece meio corpo fora da lâmina antes de
  // reagir. Um passo à frente é o horizonte mínimo que evita isso.
  const vel = (def.speed ?? 1) * (mob.parado && !fugindo ? 0.12 : 1) * (fugindo ? 1.9 : 1)
  const passo = Math.max(0.35, vel * 0.55)
  const proxX = mob.x + Math.sin(mob.rumo) * passo
  const proxZ = mob.z + Math.cos(mob.rumo) * passo
  const proxY = mob.y + mob.subida * passo

  const molhadoNoProximo = !!env.liquidAt?.(Math.floor(proxX), Math.floor(proxY), Math.floor(proxZ))
  const solidoNoProximo = !!env.solidAt?.(Math.floor(proxX), Math.floor(proxY), Math.floor(proxZ))
  if (!molhadoNoProximo || solidoNoProximo) {
    // Meia-volta com um desvio: virar exatamente 180° faz o bicho quicar entre
    // duas paredes pra sempre, no mesmo par de células.
    mob.rumo += Math.PI * (0.6 + (mob.seedRnd?.() ?? Math.random()) * 0.8)
    mob.subida = -mob.subida * 0.6
    mob.timer = Math.min(mob.timer, 0.8)
  }

  // Teto e fundo: o peixe não encosta na superfície nem no leito.
  if (!env.liquidAt?.(Math.floor(mob.x), Math.floor(mob.y + 0.8), Math.floor(mob.z))) {
    mob.subida = Math.min(mob.subida, -0.12)
  }
  if (env.solidAt?.(Math.floor(mob.x), Math.floor(mob.y - 0.6), Math.floor(mob.z))) {
    mob.subida = Math.max(mob.subida, 0.12)
  }

  // ── O PASSO ───────────────────────────────────────────────────────────────
  const giro = (def.giro ?? GIRO_BASE) * dt
  mob.yaw = girarSuave(mob.yaw ?? mob.rumo, mob.rumo, giro)
  mob.pitch = (mob.pitch ?? 0) + (mob.subida - (mob.pitch ?? 0)) * Math.min(1, dt * 3)

  const avanco = vel * dt
  const nx = mob.x + Math.sin(mob.yaw) * avanco
  const nz = mob.z + Math.cos(mob.yaw) * avanco
  const ny = mob.y + mob.subida * avanco

  // Só anda pra onde ainda há água e não há bloco. A checagem é por EIXO pra
  // que raspar numa parede não zere o movimento inteiro — bicho que trava
  // encostado em pedra parece bug mesmo quando a IA está certa.
  if (podeIr(env, nx, mob.y, mob.z)) mob.x = nx
  if (podeIr(env, mob.x, mob.y, nz)) mob.z = nz
  if (podeIr(env, mob.x, ny, mob.z)) mob.y = ny

  // A ondulação do corpo: uma fase que só anda, e que o renderizador lê pra
  // torcer a cauda. Guardada aqui e não no render porque ela tem que sobreviver
  // a um quadro perdido — animação amarrada ao relógio de desenho acelera
  // quando o jogo engasga.
  mob.faseNado = ((mob.faseNado || 0) + dt * (2.2 + vel * 1.6)) % (Math.PI * 2)
  return events
}

const podeIr = (env, x, y, z) =>
  !!env.liquidAt?.(Math.floor(x), Math.floor(y), Math.floor(z)) &&
  !env.solidAt?.(Math.floor(x), Math.floor(y), Math.floor(z))

/** Interpola ângulo pelo caminho CURTO (senão o bicho dá a volta ao contrário). */
export function girarSuave(atual, alvo, k) {
  let d = alvo - atual
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return atual + Math.max(-k, Math.min(k, d))
}
