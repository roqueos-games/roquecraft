import { describe, it, expect } from 'vitest'
import { createMob, stepMob, pickSpawn, MOB_TYPES } from '../../src/servicos/mobs.js'
import { pickSpawnAquatico, AQUATICOS } from '../../src/servicos/nadoSpawn.js'

// A VIDA MARINHA NADA — E NÃO ANDA.
//
// "temos que modelar peixes, lulas, polvos, pinguins, e etc para dar mais vida
// ao nosso minecraft" — founder, 25/08/2026.
//
// O risco desta funcionalidade não é o peixe não aparecer: é ele aparecer e se
// comportar como um porco molhado. `stepMob` é a IA de TERRA e pressupõe chão,
// gravidade, movimento em duas dimensões e queda que machuca. O desvio pro
// `nado.js` é a primeira linha da função, e é isso que os testes abaixo
// protegem — não o resultado bonito, mas o DESVIO.
//
// Cada teste tem seu par de controle na mesma cena, e o controle é sempre a
// mesma coisa: o que aconteceria SEM a separação.

/**
 * Um tanque: água de `fundo` a `topo`, pedra abaixo, ar acima, num quadrado de
 * 80 blocos de lado.
 *
 * ⚠️ A POSIÇÃO DO JOGADOR É PARÂMETRO, e a primeira versão pagou caro por ela
 * ser fixa. Com o jogador cravado em (200, 200) — longe, pra o peixe não fugir
 * dele —, `pickSpawnAquatico` sorteava pontos a 14..46 blocos DALI, ou seja
 * sempre fora do tanque: o teste do cardume media zero e parecia um defeito da
 * geração. Era o cenário. As duas perguntas querem jogadores em lugares
 * diferentes, então elas passam o seu.
 */
function tanque({ fundo = 10, topo = 20, player = { x: 200, y: 15, z: 200 } } = {}) {
  return {
    liquidAt: (x, y, z) => y >= fundo && y <= topo && Math.abs(x) < 40 && Math.abs(z) < 40,
    solidAt: (x, y, z) => y < fundo && Math.abs(x) < 40 && Math.abs(z) < 40,
    // ⚠️ `surfaceY` É A PRIMEIRA CÉLULA NÃO-SÓLIDA — o LEITO, não o topo da
    // água. A primeira versão deste cenário devolvia `topo + 1` (o ar acima
    // das ondas) e com isso ESCONDEU um defeito real: o código de nascimento
    // tinha o mesmo mal-entendido, e os dois errados juntos davam verde. Foi a
    // sonda no mundo de verdade que acusou — nenhum peixe nascia, e o único
    // bicho marinho vivo tinha vindo do sorteio de terra.
    //
    // Cenário de teste que copia a suposição do código não é teste: é a mesma
    // frase escrita duas vezes.
    surfaceY: () => fundo,
    biomeAt: () => 'ocean',
    player,
  }
}

/** Um mundo seco — nem uma gota. */
const deserto = {
  liquidAt: () => false,
  solidAt: (x, y) => y < 10,
  surfaceY: () => 10,
  biomeAt: () => 'desert',
  player: { x: 0, y: 11, z: 0 },
}

const rodar = (mob, env, passos = 400, dt = 1 / 20) => {
  for (let i = 0; i < passos; i++) stepMob(mob, env, dt)
  return mob
}

describe('roquecraft — a vida marinha nada', () => {
  it('o catálogo declara os quatro bichos que o founder pediu, todos aquáticos', () => {
    for (const k of ['fish', 'squid', 'octopus', 'penguin']) {
      expect(MOB_TYPES[k], `falta ${k}`).toBeTruthy()
      expect(MOB_TYPES[k].aquatico, `${k} não é aquático`).toBe(true)
      expect(MOB_TYPES[k].hostile, `${k} não pode ser hostil`).toBeFalsy()
    }
    // ⚠️ CONTROLE DO CATÁLOGO: a marca não pode ter vazado pros bichos de
    // terra. Sem esta linha, `aquatico: true` no lugar errado passaria — e uma
    // vaca aquática nadaria pelo pasto.
    for (const k of ['cow', 'pig', 'zombie']) {
      expect(MOB_TYPES[k].aquatico, `${k} virou aquático`).toBeFalsy()
    }
    expect(AQUATICOS.sort()).toEqual(['fish', 'octopus', 'penguin', 'squid'])
  })

  it('o peixe FICA na água depois de 400 passos — e a régua sabe ver quem sai', () => {
    const env = tanque()
    const peixe = createMob('fish', 0.5, 15, 0.5, 7)
    rodar(peixe, env)
    expect(env.liquidAt(Math.floor(peixe.x), Math.floor(peixe.y), Math.floor(peixe.z))).toBe(true)
    // Ele também não pode ter ficado PARADO: um peixe que não sai do lugar
    // satisfaz "continua na água" sem nadar nada.
    expect(Math.hypot(peixe.x - 0.5, peixe.z - 0.5), 'o peixe não saiu do lugar').toBeGreaterThan(1)

    // ⚠️ O CONTROLE. O MESMO peixe, no MESMO tanque, com a marca de aquático
    // apagada — ou seja, exatamente o que aconteceria se o desvio da primeira
    // linha de `stepMob` sumisse. Ele cai na IA de terra, que trata a água como
    // vazio, e a régua tem que acusar.
    const semMarca = { ...MOB_TYPES.fish, aquatico: false }
    const original = MOB_TYPES.fish
    MOB_TYPES.fish = semMarca
    try {
      const afogado = createMob('fish', 0.5, 15, 0.5, 7)
      rodar(afogado, env)
      const continuaNaAgua = env.liquidAt(
        Math.floor(afogado.x),
        Math.floor(afogado.y),
        Math.floor(afogado.z),
      )
      expect(
        continuaNaAgua && Math.abs(afogado.y - 15) < 0.5,
        'a cena não sabe produzir o defeito: sem o desvio o peixe se comportou igual',
      ).toBe(false)
    } finally {
      MOB_TYPES.fish = original
    }
  })

  it('o peixe encalhado sufoca — e o pinguim, que é anfíbio, não', () => {
    const peixe = createMob('fish', 0.5, 11, 0.5, 3)
    const vidaInicial = peixe.health
    rodar(peixe, deserto, 200)
    expect(peixe.health, 'peixe fora d’água não perdeu vida').toBeLessThan(vidaInicial)

    // CONTROLE: mesma cena seca, bicho anfíbio. Sem esta metade, o teste acima
    // não distingue "peixe sufoca" de "todo bicho aquático sufoca em terra" —
    // e o pinguim morreria na praia, que é onde ele deveria estar em casa.
    const pinguim = createMob('penguin', 0.5, 11, 0.5, 3)
    const vidaPinguim = pinguim.health
    rodar(pinguim, deserto, 200)
    expect(pinguim.health, 'o pinguim sufocou em terra firme').toBe(vidaPinguim)
  })

  it('o peixe inclina o nariz quando sobe ou desce', () => {
    const env = tanque()
    const peixe = createMob('fish', 0.5, 15, 0.5, 11)
    let maiorInclinacao = 0
    for (let i = 0; i < 400; i++) {
      stepMob(peixe, env, 1 / 20)
      maiorInclinacao = Math.max(maiorInclinacao, Math.abs(peixe.pitch || 0))
    }
    // Sem inclinação o peixe sobe deitado, como um elevador com olhos.
    expect(maiorInclinacao, 'o peixe nada sempre na horizontal').toBeGreaterThan(0.05)
  })

  it('a fase de nado ANDA — é o relógio da animação', () => {
    const env = tanque()
    const peixe = createMob('fish', 0.5, 15, 0.5, 5)
    stepMob(peixe, env, 1 / 20)
    const a = peixe.faseNado
    for (let i = 0; i < 5; i++) stepMob(peixe, env, 1 / 20)
    expect(a, 'a fase nem começou').toBeGreaterThan(0)
    expect(peixe.faseNado, 'a fase travou — o cardume ficaria rígido').not.toBe(a)
  })

  it('o cardume nasce DENTRO da água — e nada nasce no deserto', () => {
    const env = tanque({ player: { x: 0, y: 15, z: 0 } })
    let achou = 0
    let peixes = 0
    for (let i = 0; i < 60; i++) {
      const g = pickSpawnAquatico(env, semente(i))
      if (!g) continue
      achou++
      peixes += g.length
      for (const c of g) {
        expect(
          env.liquidAt(Math.floor(c.x), Math.floor(c.y), Math.floor(c.z)),
          'nasceu fora da água',
        ).toBe(true)
      }
    }
    expect(achou, 'não nasceu nada no oceano').toBeGreaterThan(0)
    expect(peixes / achou, 'nasceu um bicho por vez — cardume nenhum').toBeGreaterThan(1)

    // ⚠️ O CONTROLE. Mesma função, mundo seco: tem que devolver nada, sempre.
    // É o espelho exato do que `pickSpawn` (terra) faz com a água.
    for (let i = 0; i < 60; i++) {
      expect(pickSpawnAquatico(deserto, semente(i)), 'nasceu peixe no deserto').toBeNull()
    }
  })

  it('o sorteio de TERRA nunca devolve bicho marinho — e continua devolvendo os de terra', () => {
    // ⚠️ O DEFEITO QUE ESTE TESTE FIXA JÁ ACONTECEU, e foi uma foto que o
    // achou: um polvo ROSA em pé num gramado, sufocando (25/08/2026).
    //
    // `pickSpawn` filtrava a piscina passiva por "não é hostil e o bioma bate".
    // Peixe, lula e polvo são passivos e não declaram bioma — passavam por
    // OMISSÃO. Separar as duas regras de nascimento não bastou: a antiga
    // continuava aceitando quem pertencia à nova.
    //
    // A segunda metade do teste é o que impede a correção de virar uma peneira
    // que não deixa passar nada.
    const campo = {
      solidAt: (x, y) => (y < 70 ? 1 : 0),
      liquidAt: () => false,
      lightAt: () => 15,
      surfaceY: () => 70,
      biomeAt: () => 'plains',
      isDay: true,
      allowHostile: false,
      player: { x: 0, y: 71, z: 0 },
    }
    const tipos = new Set()
    for (let i = 0; i < 400; i++) {
      const c = pickSpawn(campo, semente(i))
      if (c) tipos.add(c.type)
    }
    expect(tipos.size, 'o sorteio de terra não devolveu nada — a régua está cega').toBeGreaterThan(
      0,
    )
    for (const t of tipos) {
      expect(MOB_TYPES[t].aquatico, `${t} nasceu em terra firme`).toBeFalsy()
    }
  })

  it('poça rasa não vira berçário', () => {
    // Um bloco de lâmina satisfaz "a célula é água" e é onde um cardume ficaria
    // com o dorso de fora, batendo no teto e no chão ao mesmo tempo.
    const poca = tanque({ fundo: 10, topo: 10, player: { x: 0, y: 11, z: 0 } })
    for (let i = 0; i < 40; i++) {
      expect(pickSpawnAquatico(poca, semente(i)), 'nasceu cardume numa poça').toBeNull()
    }
  })
})

/** Gerador determinístico por semente — teste com Math.random não reproduz. */
function semente(n) {
  let s = n * 1103515245 + 12345
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

// ── O QUE OS TESTES ACIMA NÃO ALCANÇAM ──────────────────────────────────────
//
// Eles exercitam o nado por `stepMob`, que é o caminho de verdade — e é assim
// que tem que ser pro comportamento. Mas quatro regras ficaram sem afirmação
// nenhuma, e as quatro são do tipo que quebra sem barulho:
//
//  · `girarSuave` é EXPORTADA e não tinha um teste sequer;
//  · fugir do jogador nunca foi medido (nem a direção, nem o alcance);
//  · o ritmo próprio de cada peixe — o que impede o cardume de virar em bloco;
//  · a fase da animação andar com o TEMPO e não com o quadro.
import { passoDeNado, girarSuave } from '../../src/servicos/nado.js'

const DEF_PEIXE = { speed: 1, giro: 2.6 }

/** Tanque de mentira: água num paralelepípedo, pedra abaixo do fundo. */
function tanqueDeTeste({ yMin = 40, yMax = 60, raio = 20 } = {}) {
  const dentro = (x, y, z) => Math.abs(x) <= raio && Math.abs(z) <= raio && y >= yMin && y <= yMax
  return {
    liquidAt: (x, y, z) => dentro(x, y, z),
    solidAt: (x, y, z) => y < yMin,
    player: null,
  }
}

const bicho = (extra = {}) => ({
  x: 0,
  y: 50,
  z: 0,
  health: 3,
  timer: 99,
  yaw: 0,
  rumo: 0,
  subida: 0,
  hurtFlash: 0,
  attackCooldown: 0,
  // Sorteio determinista: sem isto o teste mede o acaso, não a regra.
  seedRnd: () => 0.5,
  ...extra,
})

describe('girarSuave — sempre pelo caminho CURTO', () => {
  it('não dá a volta ao contrário na virada do círculo', () => {
    // De 175° pra −175° são 10° pela borda e 350° pelo outro lado. Um peixe que
    // escolhe os 350 gira o corpo inteiro pra virar um tico — e lê como bug.
    const quase = Math.PI - 0.1
    expect(girarSuave(quase, -quase, 1)).toBeGreaterThan(quase)
  })

  it('respeita o limite de giro do passo, nos dois sentidos', () => {
    expect(girarSuave(0, Math.PI / 2, 0.1)).toBeCloseTo(0.1, 9)
    expect(girarSuave(0, -Math.PI / 2, 0.1)).toBeCloseTo(-0.1, 9)
  })

  it('já no rumo, não mexe', () => {
    expect(girarSuave(1.2, 1.2, 0.5)).toBeCloseTo(1.2, 9)
  })

  it('com passo grande, chega no alvo e não passa dele', () => {
    expect(girarSuave(0, 0.3, 10)).toBeCloseTo(0.3, 9)
  })
})

describe('fugir do jogador', () => {
  it('perto, o peixe vira PRA LONGE e deixa de estar parado', () => {
    const t = tanqueDeTeste()
    t.player = { x: 0, y: 50, z: -2 }
    const m = bicho({ parado: true })
    passoDeNado(m, DEF_PEIXE, t, 0.05)
    // Jogador no −z ⇒ o rumo aponta pro +z.
    expect(Math.cos(m.rumo)).toBeGreaterThan(0)
    expect(m.parado).toBe(false)
  })

  it('longe, ignora e segue o rumo que tinha', () => {
    const t = tanqueDeTeste()
    t.player = { x: 0, y: 50, z: -18 }
    const m = bicho({ rumo: 1.234 })
    passoDeNado(m, DEF_PEIXE, t, 0.05)
    expect(m.rumo).toBeCloseTo(1.234, 9)
  })

  it('o alcance do susto vem do BICHO, e não é um número solto no arquivo', () => {
    const t = tanqueDeTeste()
    // ⚠️ FORA DO EIXO de propósito. Com o jogador exatamente no −z, fugir dá
    // `atan2(0, +8) = 0` — o MESMO rumo inicial, e o teste não distinguiria
    // "fugiu" de "ignorou". A primeira versão deste teste caiu nisso.
    t.player = { x: -6, y: 50, z: -6 }
    const covarde = bicho({ rumo: 0 })
    passoDeNado(covarde, { ...DEF_PEIXE, distanciaDeFuga: 12 }, t, 0.05)
    expect(covarde.rumo).not.toBe(0)

    const valente = bicho({ rumo: 0 })
    passoDeNado(valente, { ...DEF_PEIXE, distanciaDeFuga: 2 }, t, 0.05)
    expect(valente.rumo).toBe(0)
  })

  it('jogador EXATAMENTE em cima não redefine o rumo pra zero', () => {
    // ⚠️ A primeira versão deste teste só pedia número finito — e passava com ou
    // sem a guarda `d > 0.001`, porque `atan2(0, 0)` é 0 e não NaN. O mutante
    // sobreviveu e mostrou isso.
    //
    // O que a guarda REALMENTE impede é o peixe "fugir" de uma direção que não
    // existe: com distância zero não há pra onde correr, e sem ela o rumo dele
    // é reescrito pra 0 — uma virada brusca, sem causa visível na tela.
    const t = tanqueDeTeste()
    t.player = { x: 0, y: 50, z: 0 }
    const m = bicho({ rumo: 1.5 })
    passoDeNado(m, DEF_PEIXE, t, 0.05)
    expect(m.rumo).toBeCloseTo(1.5, 9)
    expect(Number.isFinite(m.x + m.y + m.z)).toBe(true)
  })
})

describe('cada peixe tem o ritmo dele', () => {
  it('o cardume NÃO muda de direção no mesmo instante', () => {
    // Com um timer só, o cardume inteiro vira junto e lê como bando de robôs.
    const t = tanqueDeTeste()
    const timers = new Set()
    for (let i = 1; i <= 8; i++) {
      const m = bicho({ timer: 0, seedRnd: () => i / 10 })
      passoDeNado(m, DEF_PEIXE, t, 0.05)
      timers.add(Math.round(m.timer * 100))
    }
    expect(timers.size).toBeGreaterThan(4)
  })

  it('o peixe parado ainda se move — devagar, não congelado', () => {
    const t = tanqueDeTeste()
    const m = bicho({ parado: true, rumo: 0, yaw: 0 })
    const z0 = m.z
    for (let i = 0; i < 20; i++) passoDeNado(m, DEF_PEIXE, t, 0.05)
    expect(m.z).not.toBe(z0)
  })
})

describe('a animação segue o relógio do MUNDO, não o do desenho', () => {
  it('dez quadros curtos andam o mesmo que um quadro longo', () => {
    // Animação amarrada ao relógio de desenho acelera quando o jogo engasga.
    const t = tanqueDeTeste()
    const rapido = bicho()
    const lento = bicho()
    for (let i = 0; i < 10; i++) passoDeNado(rapido, DEF_PEIXE, t, 0.02)
    passoDeNado(lento, DEF_PEIXE, t, 0.2)
    expect(rapido.faseNado).toBeCloseTo(lento.faseNado, 1)
  })

  it('a fase dá a volta em vez de crescer pra sempre', () => {
    const t = tanqueDeTeste()
    const m = bicho()
    for (let i = 0; i < 500; i++) passoDeNado(m, DEF_PEIXE, t, 0.1)
    expect(m.faseNado).toBeGreaterThanOrEqual(0)
    expect(m.faseNado).toBeLessThan(Math.PI * 2)
  })
})

describe('o peixe não entra na pedra', () => {
  it('a checagem POR EIXO segura o que o olhar à frente não vê', () => {
    // ⚠️ ESTE TESTE NASCEU DE DOIS MUTANTES QUE SOBREVIVERAM.
    //
    // O passo à frente (`solidoNoProximo`) usa o RUMO — pra onde o peixe quer
    // ir. O movimento usa o YAW — pra onde o corpo já está apontado. Numa
    // curva os dois DISCORDAM, e é aí que o olhar à frente diz "livre" e o
    // corpo entra na pedra assim mesmo.
    //
    // Nos testes anteriores o olhar à frente sempre salvava antes, e por isso
    // apagar a checagem por eixo não quebrava nada: ela parecia código morto e
    // não é. Aqui o rumo aponta pra LONGE da parede e o yaw ainda aponta pra
    // dentro dela — exatamente o instante da virada.
    const base = tanqueDeTeste()
    const parede = {
      ...base,
      solidAt: (x, y, z) => base.solidAt(x, y, z) || x >= 2,
    }
    const m = bicho({ x: 1.9, rumo: -Math.PI / 2, yaw: Math.PI / 2 })
    // A virada leva ~24 passos (2,6 rad/s × 0,05 s por passo pra girar 180°), e
    // durante ela o corpo avança pra dentro da parede. Um passo só não cruza os
    // 0,1 que faltam — foi assim que a primeira versão deste teste deixou os
    // dois mutantes vivos.
    for (let i = 0; i < 15; i++) {
      passoDeNado(m, DEF_PEIXE, parede, 0.05)
      expect(m.x, `o corpo entrou na parede no passo ${i}`).toBeLessThan(2)
    }
    expect(parede.solidAt(Math.floor(m.x), Math.floor(m.y), Math.floor(m.z))).toBe(false)
  })

  it('cento e vinte passos contra uma parede e ele continua do lado de fora', () => {
    // Ficar na água já é testado acima; isto é a outra metade: não atravessar
    // bloco sólido submerso, como a parede de uma gruta alagada.
    const base = tanqueDeTeste()
    const comParede = {
      ...base,
      solidAt: (x, y, z) => base.solidAt(x, y, z) || (x >= 2 && x <= 4),
    }
    const m = bicho({ rumo: Math.PI / 2, yaw: Math.PI / 2 })
    for (let i = 0; i < 120; i++) {
      passoDeNado(m, DEF_PEIXE, comParede, 0.05)
      expect(
        comParede.solidAt(Math.floor(m.x), Math.floor(m.y), Math.floor(m.z)),
        `entrou na pedra no passo ${i}`,
      ).toBe(false)
    }
  })
})

describe('os relógios do bicho param no zero', () => {
  it('o clarão de dano some e não fica negativo', () => {
    const m = bicho({ hurtFlash: 0.1 })
    passoDeNado(m, DEF_PEIXE, tanqueDeTeste(), 1)
    expect(m.hurtFlash).toBe(0)
  })

  it('a recarga de ataque também', () => {
    const m = bicho({ attackCooldown: 0.1 })
    passoDeNado(m, DEF_PEIXE, tanqueDeTeste(), 1)
    expect(m.attackCooldown).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// O PASSO DE NADO, CHAMADO DIRETO. Os testes acima montam o tanque e olham o
// resultado; estes olham as DECISÕES: o segundo exato em que o peixe sufoca, o
// ponto de vida em que ele morre, a distância exata em que ele foge, e o que
// acontece com um peixe que ainda não tem rumo nenhum.
//
// A varredura de mutação deixou onze padrões vivos neste arquivo — mais que em
// qualquer outro do RoqueCraft. Um cenário grande prova que o conjunto anda;
// não prova nenhum limite.
// ─────────────────────────────────────────────────────────────────────────────

const seco = {
  liquidAt: () => false,
  solidAt: () => false,
  player: null,
}

const peixeSeco = (over = {}) => ({
  x: 0,
  y: 30,
  z: 0,
  yaw: 0,
  health: 4,
  timer: 10,
  ...over,
})

describe('nado — fora d’água', () => {
  it('sufoca no segundo 2 exato, não no 2 e pouco', () => {
    // `foraDagua >= 2`. Apertado para `>`, o peixe encalhado leva um quadro a
    // MAIS por dano — e como o acumulador zera junto, o erro se soma a cada
    // ciclo: com dt de 1/60, é meio segundo de vida extra por ponto.
    const mob = peixeSeco({ foraDagua: 1.5 })
    passoDeNado(mob, {}, seco, 0.5)
    expect(mob.health).toBe(3)
    expect(mob.foraDagua).toBe(0)
    expect(mob.hurtFlash).toBe(0.25)
  })

  it('um instante antes de 2 segundos ainda não machuca', () => {
    const mob = peixeSeco({ foraDagua: 1.5 })
    passoDeNado(mob, {}, seco, 0.49)
    expect(mob.health).toBe(4)
    expect(mob.foraDagua).toBeCloseTo(1.99, 5)
  })

  it('o ponto de vida ZERO já é morte', () => {
    // `health <= 0`. Com `<`, o peixe fica nadando com 0 de vida: nenhum evento
    // `died` sai, e quem escuta o evento é quem tira o bicho do mundo.
    const mob = peixeSeco({ foraDagua: 2, health: 1 })
    const eventos = passoDeNado(mob, {}, seco, 0.01)
    expect(mob.health).toBe(0)
    expect(eventos).toContain('died')
  })

  it('peixe encalhado AFUNDA — e a queda é um número, não NaN', () => {
    // `(mob.vy || 0) - 16 * dt`: um peixe que nunca caiu não tem `vy`. Virando
    // `&&`, a conta vira `undefined - 16*dt` = NaN, e o NaN contamina `y`,
    // depois `Math.floor(y)` na consulta de líquido, e o bicho some do mundo.
    const mob = peixeSeco()
    passoDeNado(mob, {}, seco, 0.1)
    expect(Number.isFinite(mob.vy)).toBe(true)
    expect(mob.vy).toBeLessThan(0)
    expect(Number.isFinite(mob.y)).toBe(true)
    expect(mob.y).toBeLessThan(30)
  })

  it('o anfíbio fica de pé no chão em vez de se debater', () => {
    const chao = { liquidAt: () => false, solidAt: (x, y) => y <= 10, player: null }
    const mob = peixeSeco({ y: 10.5, debate: 3 })
    passoDeNado(mob, { anfibio: true }, chao, 0.1)
    expect(mob.vy).toBe(0)
    expect(mob.debate).toBe(0)
    expect(mob.y).toBe(11)
  })
})

describe('nado — o rumo', () => {
  const tanqueSimples = (player = null) => ({
    liquidAt: () => true,
    solidAt: () => false,
    player,
  })

  it('peixe recém-nascido, sem yaw, ganha rumo no primeiro quadro', () => {
    // `timer <= 0 || mob.yaw === undefined`: o `||` é o que socorre o peixe que
    // nasceu sem rumo. Virando `&&`, ele só seria socorrido se o cronômetro
    // ZERASSE junto — até lá, `yaw` fica `undefined`, vira NaN no seno, e o
    // peixe nada para lugar nenhum.
    const mob = { x: 0, y: 15, z: 0, yaw: undefined, timer: 10, health: 4 }
    passoDeNado(mob, {}, tanqueSimples(), 0.016)
    expect(Number.isFinite(mob.rumo)).toBe(true)
    expect(Number.isFinite(mob.yaw)).toBe(true)
    expect(mob.timer).toBeGreaterThan(1)
  })

  it('peixe COM rumo não re-sorteia a cada quadro', () => {
    // `yaw === undefined` invertido faz todo peixe do cardume re-sortear rumo a
    // cada quadro: o cardume inteiro vibra no lugar.
    const mob = { x: 0, y: 15, z: 0, yaw: 0.5, rumo: 0.5, timer: 10, health: 4, seedRnd: () => 0.5 }
    passoDeNado(mob, {}, tanqueSimples(), 0.016)
    expect(mob.timer).toBeCloseTo(10 - 0.016, 5)
    expect(mob.rumo).toBe(0.5)
  })
})

describe('nado — fugir do jogador', () => {
  const tanqueCom = (player) => ({ liquidAt: () => true, solidAt: () => false, player })

  const peixeParado = (over = {}) => ({
    x: 0,
    y: 15,
    z: 0,
    yaw: 0,
    rumo: 0,
    subida: 0,
    parado: true,
    timer: 10,
    health: 4,
    seedRnd: () => 0.5,
    ...over,
  })

  it('distância de fuga ZERO significa que o bicho nunca foge', () => {
    // ⚠️ `def.distanciaDeFuga ?? 4.5`: com `||`, um bicho declarado com fuga 0
    // — o que existe justamente para a vida marinha decorativa, que não deve
    // sair correndo do jogador — herda a fuga padrão e sai nadando.
    const mob = peixeParado()
    passoDeNado(mob, { distanciaDeFuga: 0, speed: 1 }, tanqueCom({ x: 0.5, y: 15, z: 0 }), 0.016)
    expect(mob.parado).toBe(true)
  })

  it('o jogador EXATAMENTE em cima não conta como direção de fuga', () => {
    // `d > 0.001` é a guarda contra direção degenerada. Afrouxada para `>=`, a
    // distância no limite passa e o rumo vira o ângulo de um vetor quase nulo.
    const mob = peixeParado()
    passoDeNado(mob, { speed: 1 }, tanqueCom({ x: -0.001, y: 15, z: 0 }), 0.016)
    expect(mob.parado).toBe(true)
  })

  it('jogador perto: foge, e foge MAIS RÁPIDO do que nada', () => {
    // `fugindo = true` alimenta o multiplicador 1.9 da velocidade. Virando
    // `false`, o peixe "foge" na mesma velocidade de passeio — a fuga fica
    // visualmente idêntica a não fugir.
    const fugindo = peixeParado({ z: 0 })
    passoDeNado(fugindo, { speed: 1 }, tanqueCom({ x: 0, y: 15, z: -2 }), 0.2)
    expect(fugindo.parado).toBe(false)
    const distanciaFugindo = Math.hypot(fugindo.x, fugindo.z)

    const passeando = peixeParado({ parado: false, rumo: 0, yaw: 0 })
    passoDeNado(passeando, { speed: 1 }, tanqueCom(null), 0.2)
    const distanciaPasseando = Math.hypot(passeando.x, passeando.z)

    expect(distanciaFugindo).toBeGreaterThan(distanciaPasseando * 1.5)
  })

  it('parado nada devagar; solto nada inteiro', () => {
    // `mob.parado && !fugindo ? 0.12 : 1`. Virando `||`, QUALQUER peixe que não
    // esteja fugindo nada a 12% da velocidade: o oceano inteiro em câmera lenta.
    const parado = peixeParado({ parado: true, yaw: 0, rumo: 0 })
    passoDeNado(parado, { speed: 1 }, tanqueCom(null), 0.2)

    const solto = peixeParado({ parado: false, yaw: 0, rumo: 0 })
    passoDeNado(solto, { speed: 1 }, tanqueCom(null), 0.2)

    expect(Math.hypot(solto.x, solto.z)).toBeGreaterThan(Math.hypot(parado.x, parado.z) * 3)
  })

  it('velocidade ZERO é uma velocidade: o bicho fica onde está', () => {
    // `def.speed ?? 1` com `||` dá 1 para quem declarou 0 — a criatura fixa
    // (a que existe para decorar o fundo) sai passeando pelo oceano.
    const mob = peixeParado({ parado: false, yaw: 0, rumo: 0 })
    passoDeNado(mob, { speed: 0 }, tanqueCom(null), 0.5)
    expect(mob.x).toBe(0)
    expect(mob.z).toBe(0)
  })
})

describe('nado — não sair da água', () => {
  it('parede à frente faz o peixe virar mesmo com água em volta', () => {
    // `!molhadoNoProximo || solidoNoProximo`: virando `&&`, só vira quando as
    // DUAS coisas valem ao mesmo tempo — e "seco" e "sólido" quase nunca
    // coincidem, então o peixe atravessa a pedra em linha reta.
    const parede = {
      liquidAt: () => true,
      solidAt: (x) => x >= 1,
      player: null,
    }
    const mob = {
      x: 0.5,
      y: 15,
      z: 0,
      yaw: Math.PI / 2,
      rumo: Math.PI / 2,
      subida: 0,
      timer: 10,
      health: 4,
      seedRnd: () => 0.5,
    }
    passoDeNado(mob, { speed: 1 }, parede, 0.016)
    expect(mob.rumo).not.toBeCloseTo(Math.PI / 2, 5)
    expect(mob.timer).toBeLessThanOrEqual(0.8)
  })
})
