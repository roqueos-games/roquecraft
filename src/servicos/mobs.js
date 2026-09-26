// RoqueCraft - criaturas: definição, spawn e IA.
//
// A IA é uma máquina de estados pequena e PURA: `stepMob` recebe o mob, o
// jogador e um acessor de mundo, e devolve o mob atualizado + os eventos do
// passo (`attack`, `died`, `hurt`). Sem three, sem timers - o renderizador só
// lê `x/y/z/yaw/anim` e desenha.
//
// Passivos (porco, vaca, ovelha, galinha) vagam de dia e fogem ao apanhar.
// Hostis (zumbi, esqueleto, aranha) nascem no escuro, perseguem o jogador
// dentro do alcance e queimam ao sol - o que faz a noite ser um evento de
// verdade e não só uma troca de paleta.
//
// O creeper é a exceção deliberada: não bate, acende pavio, e o dano dele mora
// em `explosao.js`. Não queima ao sol — é o que faz o dia deixar de ser seguro.

import { rotinaDoAldeao, RAIO_DA_FUGA } from './rotina.js'
import { mulberry32 } from './noise.js'
import { ofertasDoSave } from './comercio.js'
import { criarNpc, npcDoSave, registrar } from './npc.js'
import { passoDoDragao } from './dragao.js'
import {
  PAVIO_DO_CREEPER,
  POTENCIA_DO_CREEPER,
  DISTANCIA_PARA_ACENDER,
  DISTANCIA_PARA_APAGAR,
} from './explosao.js'
import { ALCANCE_DO_TIRO, RECARGA_DO_ARCO, DISTANCIA_QUE_MANTEM } from './flechas.js'
import {
  passoDaPecuaria,
  ehBebe,
  seduzidoPor,
  DISTANCIA_DE_SEDUCAO,
  DISTANCIA_QUE_PARA,
  VELOCIDADE_SEGUINDO,
} from './pecuaria.js'

import { passoDeNado } from './nado.js'

export const MOB_TYPES = {
  pig: {
    key: 'pig',
    hostile: false,
    health: 10,
    speed: 1.05,
    width: 0.9,
    height: 0.9,
    drops: [{ item: 'raw_porkchop', min: 1, max: 3 }],
    xp: 1,
    color: 0xf0a5a2,
    spawnBiomes: ['plains', 'forest', 'savanna', 'taiga'],
  },
  cow: {
    key: 'cow',
    hostile: false,
    health: 10,
    speed: 0.95,
    width: 0.9,
    height: 1.4,
    drops: [
      { item: 'raw_beef', min: 1, max: 3 },
      { item: 'leather', min: 0, max: 2 },
    ],
    xp: 1,
    color: 0x50372a,
    spawnBiomes: ['plains', 'forest', 'savanna'],
  },
  sheep: {
    key: 'sheep',
    hostile: false,
    health: 8,
    speed: 1.0,
    width: 0.9,
    height: 1.3,
    drops: [{ item: 'whiteWool', min: 1, max: 1 }],
    xp: 1,
    color: 0xe7e7e7,
    spawnBiomes: ['plains', 'forest', 'mountains', 'taiga'],
  },
  chicken: {
    key: 'chicken',
    hostile: false,
    health: 4,
    speed: 1.1,
    width: 0.4,
    height: 0.7,
    drops: [
      { item: 'feather', min: 0, max: 2 },
      { item: 'raw_beef', min: 0, max: 1 },
    ],
    xp: 1,
    color: 0xf2f2f2,
    spawnBiomes: ['plains', 'forest', 'jungle', 'swamp'],
  },
  zombie: {
    key: 'zombie',
    hostile: true,
    health: 20,
    speed: 1.15,
    width: 0.6,
    height: 1.95,
    damage: 3,
    range: 1.6,
    aggro: 22,
    burnsInSun: true,
    // ⚠️ A PÓLVORA SAIU DAQUI, e não é descuido: pólvora é do creeper. Enquanto
    // o zumbi era o único hostil que largava alguma coisa, ela foi parar nele
    // por falta de dono. Agora o dono existe.
    //
    // PENDÊNCIA ASSUMIDA: no original o zumbi larga carne podre, e carne podre
    // precisa de um ícone novo na folha `items.png` — arte, que está congelada
    // por decisão do founder. Até lá o zumbi paga em XP, que é o que ele já
    // pagava de fato: a pólvora não entrava em receita nenhuma.
    drops: [],
    xp: 5,
    color: 0x3c7a4a,
  },
  skeleton: {
    key: 'skeleton',
    hostile: true,
    health: 20,
    speed: 1.05,
    width: 0.6,
    height: 1.95,
    damage: 2,
    range: 1.6,
    aggro: 20,
    burnsInSun: true,
    // ⚠️ ELE TEM ARCO NA MÃO DESDE QUE FOI DESENHADO, e batia de perto. Não era
    // detalhe de balanceamento: fazia os três hostis serem a MESMA criatura de
    // cores diferentes, todas correndo até encostar. `damage`/`range` ficam
    // como golpe de encurralado; o que ele faz de verdade é atirar e RECUAR.
    tiro: {
      alcance: ALCANCE_DO_TIRO,
      recarga: RECARGA_DO_ARCO,
      mantem: DISTANCIA_QUE_MANTEM,
    },
    drops: [
      { item: 'bone', min: 0, max: 2 },
      { item: 'flint', min: 0, max: 1 },
    ],
    xp: 5,
    color: 0xcfcfc6,
  },
  spider: {
    key: 'spider',
    hostile: true,
    health: 16,
    speed: 1.4,
    width: 1.2,
    height: 0.85,
    damage: 2,
    range: 1.5,
    aggro: 16,
    burnsInSun: false,
    // ⚠️ O OLHO DESTRANCA DUAS POÇÕES (veneno e, fermentado, lentidão e dano), e
    // é por isso que ele cai MENOS que a teia: uma fonte de poção que sai de
    // todo bicho morto tira da aranha a razão de ser procurada.
    drops: [
      { item: 'string', min: 0, max: 2 },
      { item: 'spider_eye', min: 0, max: 1 },
    ],
    xp: 5,
    color: 0x38251f,
  },
  /**
   * O CREEPER.
   *
   * O bicho que define o original: o que ele ensina não é bater, é FUGIR. Por
   * isso ele não tem `damage` nem `range` de golpe — o dano dele mora em
   * `explosao.js`, e o `range` aqui é a distância em que ele acende o pavio.
   *
   * ⚠️ `burnsInSun: false`, ao contrário dos outros hostis. É o do original, e
   * é o que muda o jogo: os outros somem de manhã, o creeper fica. Ligar isso
   * transformaria ele num zumbi verde.
   *
   * ⚠️ `aggro` 16, MENOR que o do zumbi (22): ele te vê de mais perto e chega
   * quieto. Aumentar isso daria um bicho que atravessa o mapa chiando, que é
   * barulhento e menos assustador.
   */
  creeper: {
    key: 'creeper',
    hostile: true,
    health: 20,
    speed: 1.0,
    width: 0.6,
    height: 1.7,
    range: DISTANCIA_PARA_ACENDER,
    aggro: 16,
    burnsInSun: false,
    explode: {
      pavio: PAVIO_DO_CREEPER,
      potencia: POTENCIA_DO_CREEPER,
      apaga: DISTANCIA_PARA_APAGAR,
    },
    // Só cai pólvora de creeper MORTO. Quem estourou não deixa nada, como no
    // original — e é o que dá sentido a matá-lo de longe.
    drops: [{ item: 'gunpowder', min: 0, max: 2 }],
    xp: 5,
    color: 0x4d9c33,
  },
}

// ── VIDA MARINHA ────────────────────────────────────────────────────────────
//
// "temos que modelar peixes, lulas, polvos, pinguins, e etc para dar mais vida
// ao nosso minecraft" — founder, 25/08/2026.
//
// `aquatico` liga DUAS coisas que moram fora deste arquivo de propósito: o
// passo (`nado.js`) e a regra de nascimento (`nadoSpawn.js`). A razão está
// escrita nos dois — em resumo, a IA daqui pressupõe chão, gravidade e duas
// dimensões, e nenhuma das três vale debaixo d'água.
//
// Todos são passivos. Nenhum ataca, nenhum queima ao sol, e o polvo solta tinta
// em vez de bater — a água é pra ser bonita, não perigosa.
Object.assign(MOB_TYPES, {
  fish: {
    key: 'fish',
    hostile: false,
    aquatico: true,
    cardume: true,
    health: 3,
    speed: 2.1,
    giro: 3.4,
    width: 0.42,
    height: 0.3,
    drops: [{ item: 'raw_fish', min: 1, max: 1 }],
    xp: 1,
    color: 0x5b9ec7,
    laminaMinima: 4,
    distanciaDeFuga: 5,
  },
  squid: {
    key: 'squid',
    hostile: false,
    aquatico: true,
    health: 8,
    // Lula não corre: ela pulsa. A velocidade baixa com giro baixo é o que dá
    // o andar pesado — velocidade alta com giro alto faria dela um peixe roxo.
    speed: 1.1,
    giro: 1.4,
    width: 0.8,
    height: 0.9,
    drops: [{ item: 'ink_sac', min: 1, max: 3 }],
    xp: 2,
    color: 0x2a2a4a,
    laminaMinima: 5,
    distanciaDeFuga: 4,
  },
  octopus: {
    key: 'octopus',
    hostile: false,
    aquatico: true,
    health: 10,
    speed: 0.85,
    giro: 1.1,
    width: 0.85,
    height: 0.7,
    drops: [{ item: 'ink_sac', min: 1, max: 2 }],
    xp: 2,
    color: 0x8c3f5d,
    // Polvo é bicho de FUNDO: pede lâmina alta porque ele nasce fundo.
    laminaMinima: 7,
    distanciaDeFuga: 3.5,
  },
  penguin: {
    key: 'penguin',
    hostile: false,
    aquatico: true,
    // ⚠️ ANFÍBIO: nada, mas quando a água acaba ele fica de PÉ e anda, em vez
    // de se debater e sufocar. Sem esta distinção o pinguim morreria na praia,
    // que é onde ele deveria estar mais em casa.
    anfibio: true,
    health: 8,
    speed: 1.6,
    giro: 2.2,
    width: 0.5,
    height: 0.8,
    drops: [{ item: 'raw_fish', min: 0, max: 1 }],
    xp: 1,
    color: 0x1c1c22,
    laminaMinima: 4,
    // ⚠️ ERA 'tundra', QUE NÃO EXISTE NESTE MUNDO. O bioma gelado se chama
    // `snowy` — e como a regra de spawn só pergunta `includes(biome)`, um nome
    // inventado não dá erro: ele simplesmente nunca casa. O pinguim nascia no
    // oceano e na taiga, e nunca no gelo, que é o único lugar em que alguém vai
    // procurar por ele. `spawnBiomesValidos.spec.js` agora recusa nome que não
    // existe em `BIOMES`.
    spawnBiomes: ['ocean', 'snowy', 'taiga'],
    distanciaDeFuga: 4,
  },
})

// ── O ALDEÃO ────────────────────────────────────────────────────────────────
//
// ⚠️ ELE NÃO DROPA NADA, E ISSO É REGRA. Um aldeão que largasse esmeralda ao
// morrer ensinaria o jogador a matar a aldeia em vez de mantê-la viva — e o
// estoque que volta devagar (`comercio.js`) só faz sentido se a alternativa
// "mato e pego tudo" não existir. Pela mesma razão ele não dá XP.
//
// ⚠️ E ELE NÃO TEM `spawnBiomes`. O aldeão não nasce do sistema de spawn por
// bioma como porco e vaca: ele vem COM a aldeia, posto pelo gerador junto das
// casas. Um aldeão solto no campo seria uma loja no meio do nada.
MOB_TYPES.aldeao = {
  key: 'aldeao',
  hostile: false,
  health: 20,
  speed: 0.75,
  width: 0.7,
  height: 1.85,
  drops: [],
  xp: 0,
  color: 0xb5834a,
  comercia: true,
  // ⚠️ SÓ ELE ABRE PORTA. A casa passou a ter porta (Goal 21) e o aldeão nasce
  // DENTRO dela: sem esta regra ele vivia trancado, visível pela janela e
  // inalcançável. O zumbi NÃO abre — é o que faz a porta valer alguma coisa.
  abrePortas: true,
  // E ELE TEM ROTINA (`rotina.js`): dia no quintal, noite em casa, foge do
  // zumbi. Sem isto a casa com porta era cenário — ninguém entrava nela.
  rotina: true,
}

// ── O DRAGÃO DO FIM ─────────────────────────────────────────────────────────
//
// `voa` desvia o passo para `dragao.js`. Não nasce por `pickSpawn` (a lista de
// lá é explícita): quem o põe no mundo é o motor de entidades, uma vez, ao
// entrar no Fim — e nunca mais depois que ele cai. A largura é a da caixa que
// a flecha acerta; o corpo desenhado é maior.
MOB_TYPES.dragao = {
  key: 'dragao',
  hostile: true,
  voa: true,
  health: 200,
  speed: 0,
  width: 5,
  height: 2.4,
  damage: 6,
  range: 3,
  aggro: 80,
  xp: 500,
  color: 0x1a1020,
  drops: [],
}

export const MOB_KEYS = Object.keys(MOB_TYPES)

let nextId = 1
export function createMob(type, x, y, z, seed = 1) {
  const def = MOB_TYPES[type]
  if (!def) return null
  // Coordenada nao-finita e veneno silencioso: a criatura existe no array, some
  // do mundo (a malha vai pro infinito) e contamina qualquer media de posicao.
  // Barrar na criacao e mais barato que caçar NaN depois.
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null
  return {
    id: `m${nextId++}`,
    type,
    x,
    y,
    z,
    vy: 0,
    yaw: 0,
    health: def.health,
    state: 'idle',
    timer: 0,
    targetX: x,
    targetZ: z,
    attackCooldown: 0,
    // Segundos de pavio já queimados. Zero em todo mundo que não é creeper —
    // um campo só, sempre presente, é mais barato que um `if` de tipo em cada
    // leitor (o render lê isto todo quadro pra piscar o bicho).
    pavio: 0,
    /** Segundos até o próximo tiro. Só o arqueiro usa. */
    recargaDoArco: 0,
    // Pecuária. Sempre presentes, mesmo nos hostis, pelo mesmo motivo do
    // `pavio`: um campo que existe sempre é mais barato de ler que um `if` de
    // tipo em cada leitor.
    amor: 0,
    esperaDeProcriar: 0,
    bebe: 0,
    tosquiada: false,
    esperaDaLa: 0,
    /** Criada pelo jogador (alimentada ou nascida de casal): nunca some. */
    domestica: false,
    // Comércio. `profissao` e `ofertas` só existem no aldeão, mas os campos
    // moram aqui pela mesma razão do `pavio`: um campo sempre presente é mais
    // barato de ler que um `if` de tipo em cada leitor — e o save grava só o
    // que não é nulo.
    profissao: null,
    ofertas: null,
    // Quem ele é por dentro: nome, amizade e memória. Ver `npc.js`. Nulo em
    // todo mundo que não é aldeão, pelo mesmo motivo dos dois de cima.
    npc: null,
    // ONDE ELE NASCEU, e não onde ele está. O nome e o sorteio de ofertas saem
    // do hash DESTA posição; a de agora muda a cada passo da IA. Sem os dois, o
    // save teria de gravar nome e ofertas inteiras — duas cópias de uma verdade
    // que a semente do mundo já sabe calcular.
    origemX: 0,
    origemZ: 0,
    relogioDeEstoque: 0,
    hurtFlash: 0,
    onGround: false,
    anim: 0,
    rnd: mulberry32(seed * 7919 + nextId),
  }
}

export const mobDef = (mob) => MOB_TYPES[mob.type]

/**
 * Altura do "olho" da criatura: de onde ela mira e de onde a flecha sai.
 *
 * ⚠️ NÃO É `mob.y`. `mob.y` é o PÉ. Mirando do pé, todo tiro sairia do chão e o
 * primeiro bloco à frente já barraria a linha — o esqueleto ficaria mudo em
 * terreno plano e nada explicaria por quê.
 */
export const alturaDeMira = (def) => def.height * 0.85

/**
 * Tem caminho livre até o jogador?
 *
 * Usa `env.ehOpaco` quando existe (é o que sabe de folha e vidro) e cai pra
 * `solidAt` quando não. Sem NENHUM dos dois, responde SIM: um `env` de teste
 * incompleto não pode calar o arqueiro em silêncio.
 */
function podeAtirar(env, mob, p) {
  const bloqueia = env.ehOpaco || env.solidAt
  if (!bloqueia) return true
  const oy = mob.y + alturaDeMira(mobDef(mob))
  const ay = p.y + 0.9
  const dx = p.x - mob.x
  const dy = ay - oy
  const dz = p.z - mob.z
  for (let i = 1; i < 20; i++) {
    const t = i / 20
    if (bloqueia(Math.floor(mob.x + dx * t), Math.floor(oy + dy * t), Math.floor(mob.z + dz * t))) {
      return false
    }
  }
  return true
}

/**
 * Empurrão. Sem ele, levar e dar pancada é uma barra mudando de tamanho no
 * canto da tela: o zumbi encosta e fica parado dentro de você, e o porco leva
 * machadada sem sair do lugar. Empurrar é o que transforma número em briga.
 *
 * Escreve velocidade, não posição — quem resolve colisão continua sendo a
 * física (do jogador) e o passo de IA (da criatura), então ninguém atravessa
 * parede por causa de um tranco.
 */
export const FORCA_EMPURRAO = 6.2
export const EMPURRAO_VERTICAL = 3.4

export function empurrar(alvo, dx, dz, forca = FORCA_EMPURRAO) {
  // ⚠️ NaN NAO PODE ENTRAR AQUI, e `d < 1e-4` nao segura: `NaN < 1e-4` e FALSO,
  // entao um NaN passava direto e virava `kx`/`kz` NaN -- e a partir dai a
  // posicao do bicho e NaN e ele some do mundo, sem erro nenhum no console.
  //
  // Foi o que aconteceu por tres dias com uma direcao calculada a partir de uma
  // variavel fora de escopo (24/08 a 26/08/2026). O defeito era do chamador,
  // mas a porta estava aberta aqui: um empurrao invalido nao pode ter o poder
  // de apagar uma criatura.
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) return
  const d = Math.hypot(dx, dz)
  if (d < 1e-4) return
  // ⚠️ CAMPO PRÓPRIO (`kx`/`kz`), não `vx`/`vz`.
  //
  // `stepPlayer` faz `state.vx += (wantX - state.vx) * control`, e no chão
  // `control` é 1 — ou seja, `vx` é REESCRITO pelo input a cada quadro.
  // Empurrão escrito em `vx` durava zero quadros com o jogador em pé. Uma
  // velocidade separada, que decai sozinha e é somada no varrimento, sobrevive
  // ao controle sem desligá-lo: dá pra ser empurrado E continuar andando.
  alvo.kx = (alvo.kx || 0) + (dx / d) * forca
  alvo.kz = (alvo.kz || 0) + (dz / d) * forca
  // Um tico pra cima: no chão o atrito come quase todo o empurrão horizontal.
  if (alvo.onGround) alvo.vy = Math.max(alvo.vy || 0, EMPURRAO_VERTICAL)
}

/** Decaimento do empurrão. Some em ~0,4 s. */
export const decairEmpurrao = (alvo, dt) => {
  const f = Math.exp(-6 * dt)
  if (alvo.kx) alvo.kx *= f
  if (alvo.kz) alvo.kz *= f
  if (Math.abs(alvo.kx || 0) < 0.01) alvo.kx = 0
  if (Math.abs(alvo.kz || 0) < 0.01) alvo.kz = 0
}

// ── IA ──────────────────────────────────────────────────────────────────────

const MOB_GRAVITY = 24

/**
 * Degrau que a criatura sobe ANDANDO, sem pular.
 *
 * 0,6 é o do original, e o número importa nos dois sentidos: com ele a criatura
 * sobe meia laje e camada de neve caminhando (que é o que o olho espera), e
 * continua tendo que PULAR o bloco inteiro (1,0) e a cerca.
 */
export const PASSO_DA_CRIATURA = 0.6

/**
 * A que ALTURA, dentro da célula, este bloco sustenta um pé em (dx, dz).
 *
 * ⚠️ `solidAt` NUNCA FOI UM BOOLEANO — e é aí que o defeito morava. Ele devolve
 * o TOPO sólido: 1 pro cubo cheio, 0,5 pra meia laje, 0,125 pra camada de neve,
 * ou uma lista de caixas pra escada, cerca e laje de topo. O passo vertical
 * lia esse número como sim-ou-não e pousava a criatura em `floor(y) + 1`,
 * sempre. Na neve isso são SETE OITAVOS de bloco no ar — o rebanho voando sobre
 * a neve que o founder fotografou no celular em 25/08/2026.
 *
 * ⚠️ E A LISTA DE CAIXAS É FILTRADA POR (dx, dz), não reduzida ao topo mais
 * alto. Na escada, o topo mais alto é 1 (a parte de cima do degrau) e o mais
 * baixo é 0,5: quem pisa na metade baixa tem que ficar em 0,5. Pegar o máximo
 * poria a criatura flutuando meio bloco sobre o degrau de baixo — o mesmo
 * defeito, um andar acima.
 */
export function alturaDoApoio(solido, dx = 0.5, dz = 0.5) {
  if (!solido) return 0
  if (typeof solido === 'number') return solido
  // ⚠️ `true` VALE CUBO CHEIO, e isso não é folga: o `solidAt` do multijogador,
  // o de teste e qualquer chamador de fora podem responder sim-ou-não. Devolver
  // 0 pra um `true` faria a criatura atravessar o chão e cair do mundo — que
  // foi exatamente o que aconteceu em 12 testes no primeiro minuto desta
  // correção. Quem responde booleano está dizendo "célula sólida inteira".
  if (solido === true) return 1
  if (!Array.isArray(solido)) return 0
  let alto = 0
  for (const c of solido) {
    if (dx < c[0] || dx > c[3] || dz < c[2] || dz > c[5]) continue
    if (c[4] > alto) alto = c[4]
  }
  return alto
}

/**
 * Um passo de IA. `env`:
 *   solidAt(x,y,z)  → topo sólido da célula: 0 quando vazia, um número (1 pro
 *                     cubo, 0,5 pra meia laje, 0,125 pra neve) ou uma lista de
 *                     caixas pra escada e cerca. NÃO é booleano — ver
 *                     `alturaDoApoio`, que é onde isso já custou um defeito.
 *   lightAt(x,y,z)  → 0..15 (luz combinada, pra queimar no sol / spawn)
 *   isDay           → boolean
 *   player          → { x, y, z } | null
 * Devolve a lista de eventos (`attack`, `burn`, `died`).
 */
export function stepMob(mob, env, dt) {
  const def = mobDef(mob)
  const events = []
  if (!def || mob.health <= 0) return events

  // ⚠️ A VIDA MARINHA SAI AQUI, NA PRIMEIRA LINHA, e não num ramo lá embaixo.
  //
  // Tudo o que vem depois desta linha pressupõe o mundo de TERRA: existe chão,
  // existe gravidade, o passo é em duas dimensões e o `y` sai do terreno,
  // pular é evento, cair machuca, e "preso" quer dizer parede lateral. Nada
  // disso vale pra um peixe.
  //
  // Desviar cedo é o que impede que a próxima regra de terra escrita aqui
  // valha pro peixe por omissão — que é exatamente como zumbi foi parar no
  // fundo do mar. O passo dele mora em `nado.js`.
  // O DRAGÃO VOA: três estados e nenhum toca o chão. Antes do nado pelo mesmo
  // motivo que o nado vem antes da terra — o que vem depois pressupõe chão.
  if (def.voa) return passoDoDragao(mob, def, env, dt)
  if (def.aquatico) return passoDeNado(mob, def, env, dt)

  if (mob.attackCooldown > 0) mob.attackCooldown = Math.max(0, mob.attackCooldown - dt)
  // Criatura vinda da rede não traz o campo; `undefined - dt` é NaN, e um
  // `NaN <= 0` é falso pra sempre: o esqueleto nunca mais atiraria e nada
  // acusaria.
  if (!(mob.recargaDoArco >= 0)) mob.recargaDoArco = 0
  else if (mob.recargaDoArco > 0) mob.recargaDoArco = Math.max(0, mob.recargaDoArco - dt)
  if (mob.hurtFlash > 0) mob.hurtFlash = Math.max(0, mob.hurtFlash - dt)
  // Os relógios da pecuária (amor, espera, filhote, lã) moram em `pecuaria.js`:
  // não têm nada a ver com IA, colisão nem perseguição, e `stepMob` já é a
  // maior função deste módulo.
  for (const e of passoDaPecuaria(mob, dt)) events.push(e)
  mob.timer -= dt

  // queima ao sol (hostis) - o que faz a manhã limpar o mapa
  if (def.burnsInSun && env.isDay && env.skyExposed?.(mob.x, mob.y, mob.z)) {
    mob.burn = (mob.burn || 0) + dt
    if (mob.burn >= 1) {
      mob.burn = 0
      mob.health -= 2
      mob.hurtFlash = 0.25
      events.push('burn')
      if (mob.health <= 0) {
        events.push('died')
        return events
      }
    }
  } else {
    mob.burn = 0
  }

  // alvo
  const p = env.player
  let dx = 0
  let dz = 0
  let dist = Infinity
  if (p) {
    dx = p.x - mob.x
    dz = p.z - mob.z
    dist = Math.hypot(dx, dz)
  }

  // Pra onde ele OLHA — separado de pra onde ele ANDA.
  //
  // Eram a mesma coisa, e por isso o bicho encostado em você ficava de lado: ao
  // entrar no alcance o passo zera, o yaw parava de ser atualizado e o zumbi te
  // batia virado pro norte. Quem persegue encara o alvo mesmo parado.
  let olharX = 0
  let olharZ = 0

  if (def.hostile && p && dist < def.aggro) {
    mob.state = 'chase'
    olharX = dx
    olharZ = dz
    if (def.explode) {
      // Criatura vinda da rede (`unpackMobs`) ou de um save antigo não tem o
      // campo. `undefined += dt` é NaN, e um pavio NaN nunca chega no limite:
      // o creeper seguiria você pra sempre sem estourar, e nada no console
      // acusaria.
      if (!(mob.pavio >= 0)) mob.pavio = 0
      // ── O PAVIO ────────────────────────────────────────────────────────────
      //
      // ⚠️ ACENDE PERTO, APAGA LONGE, E OS DOIS NÚMEROS SÃO DIFERENTES DE
      // PROPÓSITO (3 e 7). Com um número só, meio passo pra trás e pra frente
      // ligaria e desligaria o chiado várias vezes por segundo: som de
      // metralhadora e nenhuma leitura de perigo. A folga é o que transforma
      // isso em "deu, fugi".
      //
      // ⚠️ E ENTRE OS DOIS O PAVIO VOLTA, não congela. Congelado, recuar pra 4
      // blocos daria um creeper te seguindo com a bomba armada, que estoura no
      // instante em que você se aproxima de novo — mais cruel que o original e
      // ilegível pro jogador. Voltando no mesmo ritmo, afastar-se DESARMA, e o
      // chiado que baixa é o aviso de que deu certo.
      const perto = dist < def.range && Math.abs(p.y - mob.y) < 3
      if (perto) {
        if (mob.pavio <= 0) events.push('pavio')
        mob.pavio += dt
        dx = 0
        dz = 0
        if (mob.pavio >= def.explode.pavio) {
          // Morre com o próprio estouro. Quem aplica o dano é o mundo, não a
          // criatura: `stepMob` é puro e não conhece bloco nenhum.
          mob.health = 0
          events.push('explode')
          return events
        }
      } else if (mob.pavio > 0) {
        mob.pavio = dist > def.explode.apaga ? 0 : Math.max(0, mob.pavio - dt)
        if (mob.pavio <= 0) events.push('pavioApagado')
      }
    } else if (def.tiro) {
      // ── O ARQUEIRO ────────────────────────────────────────────────────────
      //
      // ⚠️ ATIRAR E RECUAR SÃO A MESMA REGRA. Um esqueleto que atira mas
      // continua correndo até encostar vira o zumbi de sempre com um arco na
      // mão. É o recuo que faz a briga contra ele ser diferente.
      //
      // A linha de tiro é OBRIGATÓRIA: sem ela, um esqueleto do lado de fora da
      // casa dispararia pra sempre contra o mesmo tijolo, e o jogador lá dentro
      // ouviria o arco sem nunca ver a flecha.
      if (dist <= def.tiro.alcance && mob.recargaDoArco <= 0 && podeAtirar(env, mob, p)) {
        mob.recargaDoArco = def.tiro.recarga
        events.push('shoot')
      }
      if (dist < def.tiro.mantem) {
        // Recua mantendo a cara virada pro jogador — quem recua de costas não
        // consegue atirar, e o modelo ficaria andando pra trás olhando pra
        // frente sem motivo aparente.
        dx = -dx
        dz = -dz
      } else if (dist < def.tiro.mantem * 1.4) {
        dx = 0
        dz = 0
      }
      if (dist < def.range && Math.abs(p.y - mob.y) < 2.2 && mob.attackCooldown <= 0) {
        // Golpe de encurralado: sem isto, encostar nele é seguro e a tática
        // vira "cole no esqueleto e ele vira estátua".
        mob.attackCooldown = 1.1
        events.push('attack')
      }
    } else if (dist < def.range && Math.abs(p.y - mob.y) < 2.2) {
      if (mob.attackCooldown <= 0) {
        mob.attackCooldown = 1.1
        events.push('attack')
      }
      dx = 0
      dz = 0
    }
  } else if (def.explode && mob.pavio > 0) {
    // Saiu do alcance de perseguição inteiro: desarma na hora.
    mob.pavio = 0
    events.push('pavioApagado')
  } else if (def.rotina && env.ameacaPerto?.(mob.x, mob.z, RAIO_DA_FUGA)) {
    // ── O ALDEÃO VÊ O ZUMBI ────────────────────────────────────────────────
    //
    // ⚠️ ANTES DA FUGA COMUM E ANTES DA COMIDA, e reavaliado a CADA quadro
    // enquanto o hostil estiver perto: o timer da fuga comum é de quem levou
    // pancada e não sabe de onde veio; aqui a ameaça tem posição e continua lá.
    const d = rotinaDoAldeao(mob, env)
    mob.state = d.estado
    mob.fugaDe = d.fugaDe
    mob.timer = d.timer
    // Com ameaça a rotina sempre traz alvo; a guarda é a mesma do ramo do timer,
    // para os dois lerem a decisão do mesmo jeito.
    if (d.alvo) {
      mob.targetX = d.alvo.x
      mob.targetZ = d.alvo.z
    }
  } else if (!def.hostile && mob.state === 'flee' && mob.timer > 0) {
    // continua fugindo
  } else if (!def.hostile && p && dist < DISTANCIA_DE_SEDUCAO && seduzidoPor(mob, env.itemNaMao)) {
    // ── SEGUE A COMIDA ────────────────────────────────────────────────────
    //
    // ⚠️ É ISTO QUE FECHA O CICLO DA FAZENDA. Sem seguir quem segura o trigo, o
    // jogador constrói a cerca e o portão e NÃO TEM COMO PÔR BICHO DENTRO —
    // teria que empurrar vaca a socos por cinquenta blocos.
    //
    // ⚠️ E VEM DEPOIS DA FUGA, de propósito: quem levou machadada foge, e uma
    // vaca ferida que voltasse correndo atrás do trigo leria como bug.
    mob.state = 'seguir'
    olharX = dx
    olharZ = dz
    if (dist < DISTANCIA_QUE_PARA) {
      // Para a uma distância de conversa. Entrando dentro do jogador ela
      // ficaria empurrando, e não daria pra andar de costas puxando o rebanho.
      dx = 0
      dz = 0
    }
  } else if (mob.timer <= 0 && def.rotina) {
    // ── A ROTINA DO ALDEÃO: dia no quintal, noite em casa (`rotina.js`) ────
    const d = rotinaDoAldeao(mob, env)
    mob.state = d.estado
    mob.fugaDe = d.fugaDe
    mob.timer = d.timer
    if (d.alvo) {
      mob.targetX = d.alvo.x
      mob.targetZ = d.alvo.z
    }
  } else if (mob.timer <= 0) {
    // novo destino de vagueio
    mob.state = mob.rnd() < 0.35 ? 'idle' : 'wander'
    mob.timer = 2 + mob.rnd() * 4
    const a = mob.rnd() * Math.PI * 2
    const r = 3 + mob.rnd() * 7
    mob.targetX = mob.x + Math.cos(a) * r
    mob.targetZ = mob.z + Math.sin(a) * r
  }

  // direção de movimento
  let mx = 0
  let mz = 0
  if ((mob.state === 'chase' || mob.state === 'seguir') && p) {
    const d = Math.hypot(dx, dz) || 1
    mx = dx / d
    mz = dz / d
  } else if (mob.state === 'flee' && (mob.fugaDe || p)) {
    // Foge DE ALGUÉM: do zumbi que a rotina viu (`fugaDe`), senão do jogador
    // que bateu. O ponto de fuga é o que separa "correr do zumbi" de "correr
    // do jogador que está do outro lado da rua".
    const de = mob.fugaDe || p
    const d = Math.hypot(mob.x - de.x, mob.z - de.z) || 1
    mx = (mob.x - de.x) / d
    mz = (mob.z - de.z) / d
  } else if (mob.state === 'wander') {
    const tx = mob.targetX - mob.x
    const tz = mob.targetZ - mob.z
    const d = Math.hypot(tx, tz)
    if (d > 0.4) {
      mx = tx / d
      mz = tz / d
    } else mob.timer = 0
  }

  // Quem SEGUE comida trota — ver `VELOCIDADE_SEGUINDO`, que explica por que o
  // vagueio continua lento e só este estado acelera.
  const speed =
    mob.state === 'seguir'
      ? Math.max(def.speed, VELOCIDADE_SEGUINDO)
      : def.speed * (mob.state === 'flee' ? 1.5 : 1)
  decairEmpurrao(mob, dt)
  const nx = mob.x + (mx * speed + (mob.kx || 0)) * dt
  const nz = mob.z + (mz * speed + (mob.kz || 0)) * dt
  // ⚠️ FILHOTE OCUPA MENOS ESPAÇO. Com a caixa do adulto, um bezerro visivelmente
  // pequeno não passaria por uma porta de um bloco que ele claramente cabe — e o
  // jogador culparia a colisão do jogo, não o bezerro.
  const encolhe = ehBebe(mob) ? 0.55 : 1
  const half = (def.width * encolhe) / 2

  // AS QUATRO QUINAS, não duas.
  //
  // Testava só (x−half, z−half) e (x+half, z+half) — uma diagonal só. Uma
  // parede alinhada com a OUTRA diagonal não era vista por nenhuma das duas
  // amostras, e o bicho atravessava. Andar em diagonal contra um canto passava
  // direto.
  //
  // ⚠️ E A CÉLULA DO PÉ SÓ BARRA O QUE SOBE ACIMA DO PÉ. Esta era a outra
  // metade do defeito do print: a criatura parada em cima de uma camada de neve
  // está, em coordenada de CÉLULA, dentro do bloco de neve. Lendo `solidAt`
  // como sim-ou-não, ela se achava dentro de uma parede — não conseguia andar,
  // pulava o "degrau" a cada quadro e ficava pairando. Consertar só a queda
  // baixou o voo de 0,875 pra 0,755 e não resolveu; o resto estava aqui.
  const blocked = (x, z) => {
    const alturas = Math.ceil(def.height)
    for (let by = 0; by < alturas; by++) {
      const y = Math.floor(mob.y + by + 0.1)
      for (const sx of [-half, half]) {
        for (const sz of [-half, half]) {
          const px = x + sx
          const pz = z + sz
          const topo = alturaDoApoio(
            env.solidAt(Math.floor(px), y, Math.floor(pz)),
            px - Math.floor(px),
            pz - Math.floor(pz),
          )
          if (topo > 0 && y + topo > mob.y + 0.06) return true
        }
      }
    }
    return false
  }

  // ⚠️ NINGUÉM PULA CERCA. É a regra que faz o curral existir: a criatura sobe
  // um degrau de terra sem pensar, e subiria a cerca do mesmo jeito — o
  // rebanho sairia por cima e o jogador nunca entenderia por quê. A cerca deste
  // motor tem 1 de altura (a caixa vive dentro da célula), então quem separa
  // "degrau" de "cerca" é esta pergunta, não a geometria.
  //
  // ⚠️ VARRE AS MESMAS QUATRO QUINAS QUE `blocked`. A primeira versão perguntava
  // por `Math.floor(nx)` — a célula do CENTRO da criatura, não a que barrou. A
  // vaca é barrada quando a QUINA dela encosta na cerca, meio bloco antes de o
  // centro entrar na célula da cerca: a pergunta caía na célula errada, sempre
  // dava "não é cerca", e a vaca pulava. O teste do par de controle pegou.
  const cercaNaFrente = (x, z) => {
    if (!env.ehCerca) return false
    const alturas = Math.ceil(def.height)
    for (let by = 0; by < alturas; by++) {
      const y = Math.floor(mob.y + by + 0.1)
      for (const sx of [-half, half]) {
        for (const sz of [-half, half]) {
          if (env.ehCerca(Math.floor(x + sx), y, Math.floor(z + sz))) return true
        }
      }
    }
    return false
  }

  // ── A PORTA NO CAMINHO ────────────────────────────────────────────────────
  //
  // Quem abre porta (`def.abrePortas`) abre a que barrou o passo, entra, e
  // FECHA quando já está a mais de uma célula e meia dela. A porta é do mundo
  // (`env.portaFechadaEm` / `env.abrirPorta` / `env.fecharPorta`); aqui só mora
  // a decisão. Uma porta que o aldeão abrisse e nunca fechasse deixaria a casa
  // aberta na primeira volta ao balcão — e o zumbi entraria por ela.
  //
  // ⚠️ VARRE AS MESMAS QUATRO QUINAS QUE `blocked`, pelo mesmo motivo da cerca:
  // quem bate na porta é a QUINA, meio bloco antes de o centro entrar na célula.
  let deslize = null
  if (def.abrePortas && env.portaFechadaEm) {
    const abrirNaFrente = (x, z) => {
      const y = Math.floor(mob.y + 0.1)
      for (const sx of [-half, half]) {
        for (const sz of [-half, half]) {
          const cx = Math.floor(x + sx)
          const cz = Math.floor(z + sz)
          if (!env.portaFechadaEm(cx, y, cz)) continue
          env.abrirPorta(cx, y, cz)
          mob.portaAberta = { x: cx, y, z: cz }
          return true
        }
      }
      return false
    }
    if (mx !== 0 && blocked(nx, mob.z)) abrirNaFrente(nx, mob.z)
    if (mz !== 0 && blocked(mob.x, nz)) abrirNaFrente(mob.x, nz)
    const p = mob.portaAberta
    if (p && Math.hypot(mob.x - (p.x + 0.5), mob.z - (p.z + 0.5)) > 1.5) {
      env.fecharPorta(p.x, p.y, p.z)
      mob.portaAberta = null
    } else if (p) {
      // ALINHA COM O VÃO. A folha aberta ocupa 3/16 da célula, e o aldeão (0,7
      // de largura) só passa pelos 13/16 que sobram se estiver no meio do que
      // está LIVRE (`env.vaoDaPorta`; sem o gancho, o centro da célula). Sem
      // isto ele abria a porta, encostava a quina na folha e ficava parado na
      // soleira até o vagueio sortear outro rumo — a sonda viu exatamente isso.
      //
      // ⚠️ O DESLIZE É APLICADO DEPOIS DO PASSO E SEM `blocked`, de propósito.
      // A porta fechada é fina e fica na face de FORA da célula: o aldeão entra
      // na célula, abre, e a folha aberta (agora na lateral) já está encostada
      // na quina dele. Qualquer passo lateral "entra" na folha pela conta das
      // quinas e seria recusado; e escrito antes do passo, `mob.x = nx` o
      // desfazia. Deslizar RUMO ao centro do vão só encolhe o que o corpo
      // ocupa da folha — não há célula nova a invadir. Alinha no eixo em que
      // MENOS anda (o dominante é o rumo); exigir `mx === 0` não servia, porque
      // um alvo um centímetro fora do eixo dava `mx` minúsculo e desligava tudo.
      const vao = env.vaoDaPorta?.(p.x, p.y, p.z) || { x: p.x + 0.5, z: p.z + 0.5 }
      const passo = speed * dt
      deslize =
        Math.abs(mz) >= Math.abs(mx)
          ? { x: Math.max(-passo, Math.min(passo, vao.x - mob.x)), z: 0 }
          : { x: 0, z: Math.max(-passo, Math.min(passo, vao.z - mob.z)) }
    }
  }

  // O QUE BARROU TEM SÓ UM DE ALTURA? Só aí é degrau, e só degrau se pula.
  //
  // ⚠️ OLHA A CÉLULA ACIMA DE CADA QUINA QUE BARROU, e não a coluna do CENTRO.
  // A versão antiga perguntava por `solidAt(floor(nx), y+1, floor(z))` — a
  // coluna do centro do corpo. Encostado numa parede de dois de altura ao lado
  // de um vão (a soleira de uma porta), o centro caía na coluna do vão, que é
  // livre em cima, e o bicho pulava contra a parede sem parar. A sonda da porta
  // fotografou o aldeão a 0,97 do chão fazendo exatamente isso.
  const soUmDeAltura = (x, z) => {
    const pe = Math.floor(mob.y + 0.1)
    let barrou = 0
    for (const sx of [-half, half]) {
      for (const sz of [-half, half]) {
        const cx = Math.floor(x + sx)
        const cz = Math.floor(z + sz)
        const topo = alturaDoApoio(env.solidAt(cx, pe, cz), x + sx - cx, z + sz - cz)
        if (!(topo > 0 && pe + topo > mob.y + 0.06)) continue
        barrou++
        if (env.solidAt(cx, pe + 1, cz)) return false
      }
    }
    return barrou > 0
  }

  let moved = false
  if (!blocked(nx, mob.z)) {
    mob.x = nx
    moved = moved || mx !== 0
  } else if (mob.onGround && !cercaNaFrente(nx, mob.z) && soUmDeAltura(nx, mob.z)) {
    mob.vy = 7.2 // pula o degrau
  }
  if (!blocked(mob.x, nz)) {
    mob.z = nz
    moved = moved || mz !== 0
  } else if (mob.onGround && !cercaNaFrente(mob.x, nz) && soUmDeAltura(mob.x, nz)) {
    mob.vy = 7.2
  }
  if (deslize) {
    mob.x += deslize.x
    mob.z += deslize.z
  }

  // ⚠️ `mob.yaw` é RUMO, não ângulo de câmera: `atan2(dirX, dirZ)`, de modo que
  // yaw 0 olha pra +Z. É a mesma convenção do modelo (todo personagem do render
  // olha pra +Z), e é ela que o renderizador consome. Não confundir com o yaw
  // do jogador, que é de câmera e olha pra −Z em 0.
  if (!olharX && !olharZ) {
    olharX = mx
    olharZ = mz
  }
  if (olharX || olharZ) mob.yaw = Math.atan2(olharX, olharZ)
  mob.anim += moved ? dt * speed * 4.2 : -mob.anim * dt * 6

  // gravidade
  mob.vy -= MOB_GRAVITY * dt
  if (mob.vy < -40) mob.vy = -40
  const ny = mob.y + mob.vy * dt

  // O chão também tem QUATRO quinas — mesmo defeito de `blocked`. Com só uma
  // diagonal amostrada, o bicho apoiado na quina oposta caía atravessando o
  // bloco. E agora cada quina devolve ALTURA, não sim-ou-não.
  const apoioEm = (y) => {
    let alto = 0
    const olha = (px, pz) => {
      const h = alturaDoApoio(
        env.solidAt(Math.floor(px), y, Math.floor(pz)),
        px - Math.floor(px),
        pz - Math.floor(pz),
      )
      if (h > alto) alto = h
    }
    olha(mob.x, mob.z)
    for (const sx of [-half, half]) {
      for (const sz of [-half, half]) olha(mob.x + sx, mob.z + sz)
    }
    return alto
  }

  // ⚠️ O PÉ POUSA NO TOPO DO BLOCO, NÃO NO TOPO DA CÉLULA.
  //
  // Era `mob.y = Math.floor(ny) + 1`, sempre. Numa camada de neve — que ocupa
  // 1/8 da célula — o bicho parava SETE OITAVOS de bloco acima do chão, e o
  // founder viu o rebanho voando sobre a neve num print de celular. Meia laje
  // dava meio bloco, cama dava 7/16, escada e cerca davam um bloco inteiro.
  //
  // A varredura de cima pra baixo (e não só a célula de `floor(ny)`) é o mesmo
  // cuidado da flecha: um quadro engasgado desce vários blocos de uma vez, e
  // olhar só a célula final atravessa a neve fina sem ver.
  let pousou = false
  if (mob.vy < 0) {
    const deY = Math.floor(mob.y)
    const ateY = Math.floor(ny)
    for (let y = deY; y >= ateY && y >= -1; y--) {
      const topo = apoioEm(y)
      if (topo <= 0) continue
      const altura = y + topo
      // ⚠️ A FOLGA É O DEGRAU DA CRIATURA (0,6, como no original). Sem ela, quem
      // andasse PARA DENTRO de uma camada de neve — que agora não barra mais —
      // ficaria com o pé em 89 e a neve em 89,125: afundado no bloco, sem nada
      // capaz de levantá-lo. Com ela, a criatura sobe meia laje e camada de
      // neve andando, e continua tendo que PULAR o bloco inteiro.
      if (altura <= mob.y + PASSO_DA_CRIATURA && ny <= altura) {
        mob.y = altura
        mob.vy = 0
        mob.onGround = true
        pousou = true
        break
      }
    }
  }
  if (!pousou) {
    mob.y = ny
    mob.onGround = false
  }

  // caiu do mundo
  if (mob.y < -8) {
    mob.health = 0
    events.push('died')
  }
  return events
}

// Dano no mob. Passivo foge ao apanhar.
//
// ⚠️ `peloJogador` EXISTE PARA A AMIZADE, e por isso é explícito em vez de
// deduzido. Zumbi batendo em aldeão, queda e explosão passam por aqui também;
// sem o sinalizador, o ferreiro guardaria mágoa do viajante por um creeper que
// explodiu perto — e a amizade dele cairia 25 sem nada na tela explicando.
export function hurtMob(mob, amount, peloJogador = false) {
  const def = mobDef(mob)
  mob.health -= amount
  mob.hurtFlash = 0.3
  if (!def.hostile) {
    mob.state = 'flee'
    mob.timer = 4
    // Foge de QUEM BATEU (o jogador), não do zumbi que a rotina viu antes.
    mob.fugaDe = null
  }
  // Evento do JOGO, escrito pela lógica do jogo — a mesma regra da troca.
  if (peloJogador && mob.npc) mob.npc = registrar(mob.npc, 'bateu')
  return mob.health <= 0
}

// O que cai ao morrer. `rng` de fora pra ficar determinístico em teste.
export function mobDrops(mob, rng = Math.random) {
  const def = mobDef(mob)
  const out = []
  // ⚠️ FILHOTE NÃO LARGA NADA, como no original. Sem isto, o caminho mais curto
  // pra carne infinita seria criar e abater filhote em série, e a espera de
  // procriação — que existe justamente pra isso não acontecer — viraria enfeite.
  if (ehBebe(mob)) return out
  for (const d of def.drops || []) {
    // Ovelha já tosquiada não tem lã pra largar. Sem isto, matar depois de
    // tosquiar daria a lã duas vezes e a tosquia viraria bônus em vez de
    // escolha.
    if (mob.tosquiada && d.item === 'whiteWool') continue
    const n = d.min + Math.floor(rng() * (d.max - d.min + 1))
    if (n > 0) out.push({ item: d.item, count: n })
  }
  return out
}

// ── Spawn ───────────────────────────────────────────────────────────────────

export const MAX_MOBS = 30
export const MIN_SPAWN_DIST = 14
export const MAX_SPAWN_DIST = 46
export const DESPAWN_DIST = 72

/**
 * Um ponto sorteado no ANEL em volta do jogador.
 *
 * ⚠️ ANEL, E NAO DISCO. Perto demais e criatura aparecendo na cara de quem
 * joga -- que assusta pelo motivo errado e denuncia o truque. Longe demais e
 * criatura que nasce fora do carregado e some antes de existir pra alguem.
 *
 * A mesma conta servia o spawn de terra e o de agua, escrita duas vezes. Duas
 * copias e o dia em que o peixe nasce num anel e o zumbi noutro.
 */
export function pontoNoAnel(jogador, rnd = Math.random) {
  const angulo = rnd() * Math.PI * 2
  const dist = MIN_SPAWN_DIST + rnd() * (MAX_SPAWN_DIST - MIN_SPAWN_DIST)
  return {
    x: Math.floor(jogador.x + Math.cos(angulo) * dist),
    z: Math.floor(jogador.z + Math.sin(angulo) * dist),
  }
}

/**
 * Teto de HOSTIS, separado do teto total.
 *
 * ⚠️ SEM ELE, O REBANHO DESLIGA A NOITE. Com um teto só, um curral de vinte
 * vacas ocupa as vinte vagas e nenhum zumbi nasce mais — o jogador
 * "resolveria" a noite criando gado, que é um exploit que ninguém planejou e
 * que ninguém entenderia como bug.
 */
export const MAX_HOSTIS = 12

/**
 * Distância em que o PASSIVO some.
 *
 * ⚠️ MUITO MAIOR QUE A DO HOSTIL, e isso é a diferença entre um rebanho e um
 * cenário. Com os 72 blocos do hostil, o jogador criava o curral, ia minerar, e
 * voltava pra um curral vazio — a rodada de pecuária inteira viraria enfeite.
 * O hostil some perto porque a graça dele é ser ameaça do momento; a vaca não.
 */
export const DESPAWN_DIST_PASSIVO = 190

/**
 * Escolhe UM candidato a spawn ao redor do jogador. Devolve `{type,x,y,z}` ou
 * null. Regras:
 *  - hostil só nasce com luz < 8 (de noite na superfície, sempre em caverna)
 *  - passivo só nasce de dia, em grama, com luz >= 9
 *  - nunca perto demais nem longe demais do jogador
 */
export function pickSpawn(env, rnd = Math.random) {
  const { x, z } = pontoNoAnel(env.player, rnd)
  const y = env.surfaceY?.(x, z)
  if (y == null || y < 1) return null

  // `null` = a luz daquele ponto não está espelhada nesta thread. NÃO é
  // "escuro": nascer criatura num lugar cuja luz não se conhece é exatamente o
  // defeito que o espelho veio consertar, invertido. Sem saber, não nasce.
  const light = env.lightAt(x, y, z)
  if (light == null) return null
  const hostile = light < 8
  // precisa de 2 blocos de ar sobre chão sólido
  if (!env.solidAt(x, y - 1, z) || env.solidAt(x, y, z) || env.solidAt(x, y + 1, z)) return null

  // ⚠️ ÁGUA NÃO É SÓLIDA, E ERA ISSO QUE PUNHA ZUMBI NO FUNDO DO MAR.
  //
  // O teste acima pede chão sólido embaixo e duas células livres em cima. No
  // oceano, o LEITO passa como chão e as duas células de ÁGUA por cima passam
  // como livres — porque `solidAt` responde por colisão, e a lâmina não colide.
  // Resultado: zumbi, aranha e esqueleto nascendo submersos, que foi o que o
  // founder viu ("você colocou zumbis e aranhas de baixo da agua ao invés de
  // vida marinha", 25/08/2026).
  //
  // Esta regra é a das criaturas de TERRA. Quando a vida marinha entrar, ela
  // não passa por aqui: peixe quer exatamente a condição que este teste recusa,
  // e vai ter a sua própria — misturar as duas num booleano é como este defeito
  // nasceu.
  if (env.liquidAt?.(x, y, z) || env.liquidAt?.(x, y + 1, z)) return null

  if (hostile) {
    if (!env.allowHostile) return null
    // ⚠️ O CREEPER ENTRA COM PESO 1 DE 5, não 1 de 4 como os outros hostis do
    // original. Lá ele nasce tanto quanto o zumbi; aqui ele leva um pedaço da
    // sua construção junto, e uma noite com 25% de creepers viraria uma base
    // esburacada antes de o jogador entender o que é o bicho. Fica em 20% até o
    // founder jogar uma noite inteira e dizer se é pouco.
    const pool = ['zombie', 'zombie', 'creeper', 'skeleton', 'spider']
    return { type: pool[Math.floor(rnd() * pool.length)], x: x + 0.5, y, z: z + 0.5 }
  }
  if (!env.isDay || light < 9) return null
  const biome = env.biomeAt?.(x, z)
  // ⚠️ A VIDA MARINHA NÃO ENTRA NA PISCINA DE TERRA — e ela entrou.
  //
  // Este filtro pedia "não é hostil e o bioma bate". Peixe, lula e polvo são
  // passivos e não declaram bioma, então passavam por OMISSÃO: o sorteio de
  // terra os colocava em cima da grama, com `x + 0.5` e `z + 0.5`, e eles
  // ficavam lá sufocando à vista de quem passasse.
  //
  // A sonda do leito achou um polvo ROSA em pé num gramado (25/08/2026), e as
  // coordenadas terminadas em ,5 foram o que denunciou a origem — a regra
  // aquática espalha o cardume com deslocamento fracionário, esta aqui não.
  //
  // É o MESMO defeito do zumbi no fundo do mar, com o sinal trocado, e o
  // comentário logo acima já dizia a metade certa da lição. A outra metade é
  // esta: separar as duas regras não basta se a antiga continuar aceitando
  // quem pertence à nova.
  const pool = MOB_KEYS.filter((k) => {
    const d = MOB_TYPES[k]
    if (d.aquatico) return false
    return !d.hostile && (!d.spawnBiomes || !biome || d.spawnBiomes.includes(biome))
  })
  if (!pool.length) return null
  return { type: pool[Math.floor(rnd() * pool.length)], x: x + 0.5, y, z: z + 0.5 }
}

/**
 * QUAL CRIATURA O RAIO ACERTA.
 *
 * ⚠️ ISTO ERA UM CONE, E O CONE NÃO SABE ESCOLHER. A regra antiga aceitava
 * qualquer bicho a menos de 4 blocos com `dot >= 0.92` e ficava com o MAIS
 * PERTO — não com o que está sob a mira. Com duas vacas lado a lado, as duas
 * caem no cone e você alimenta sempre a mesma: a sonda de pecuária pegou isso
 * na primeira corrida (`cliqueB: ok false`, a segunda vaca nunca comia).
 *
 * O mesmo cone servia o GOLPE, então o defeito também estava lá: bater na vaca
 * de trás, com duas alinhadas, era impossível.
 *
 * Agora é interseção raio-caixa de verdade (método das lâminas), ficando com o
 * PRIMEIRO acerto ao longo do raio. É o que o original faz, e é o que faz
 * sentido: quem está atrás está atrás.
 *
 * A folga de 0,1 é assistência de mira deliberada — o original também engorda a
 * caixa da entidade pra seleção. Sem ela, acertar uma galinha (0,4 de largura)
 * a quatro blocos vira teste de pontaria de mouse, não de jogo.
 */
const FOLGA_DE_MIRA = 0.1

export function mobNoRaio(mobs, origin, dir, alcance = 4) {
  let melhor = null
  let melhorT = alcance
  for (const m of Array.isArray(mobs) ? mobs : []) {
    const def = MOB_TYPES[m?.type]
    if (!def) continue
    const encolhe = ehBebe(m) ? 0.55 : 1
    const meia = (def.width * encolhe) / 2 + FOLGA_DE_MIRA
    const alta = def.height * encolhe + FOLGA_DE_MIRA
    const t = tempoDeEntrada(
      origin,
      dir,
      [m.x - meia, m.y - FOLGA_DE_MIRA, m.z - meia],
      [m.x + meia, m.y + alta, m.z + meia],
    )
    if (t == null || t >= melhorT) continue
    melhorT = t
    melhor = m
  }
  return melhor
}

/**
 * Método das lâminas: devolve a distância até a ENTRADA na caixa, ou `null`.
 *
 * ⚠️ DEVOLVE 0 PARA QUEM JÁ ESTÁ DENTRO. Um zumbi colado em você tem a origem
 * do raio dentro da caixa dele; recusar esse caso deixaria o jogador incapaz de
 * bater justamente em quem está grudado.
 */
function tempoDeEntrada(o, d, min, max) {
  let entra = 0
  let sai = Infinity
  const oo = [o.x, o.y, o.z]
  const dd = [d.x, d.y, d.z]
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dd[i]) < 1e-8) {
      if (oo[i] < min[i] || oo[i] > max[i]) return null
      continue
    }
    const inv = 1 / dd[i]
    let t1 = (min[i] - oo[i]) * inv
    let t2 = (max[i] - oo[i]) * inv
    if (t1 > t2) [t1, t2] = [t2, t1]
    entra = Math.max(entra, t1)
    sai = Math.min(sai, t2)
    if (entra > sai) return null
  }
  return entra
}

/**
 * REMONTA O REBANHO SALVO.
 *
 * O save devolve objetos crus — `{type,x,y,z,yaw,health}` e nada mais. Empurrar
 * isso direto na lista dá uma vaca sem `id`, sem `rnd` e sem estado de IA, e o
 * primeiro `stepMob` quebra chamando `mob.rnd()`. Quem sabe montar a criatura
 * inteira é `createMob`, então ele entra por INJEÇÃO: assim esta regra é pura e
 * pode ser testada sem o componente de 4.500 linhas em volta.
 *
 * ⚠️ ESTA FUNÇÃO EXISTE PRA SER TESTÁVEL, e o motivo é concreto. Enquanto o
 * laço morava solto dentro do boot, a única forma de fiscalizá-lo era procurar
 * `bicho.health = m.health` como TEXTO no arquivo — um instrumento que não sabe
 * dizer se o laço chega a rodar. Com a regra separada, o teste roda a regra.
 *
 * `criar` recebe o índice pra semear cada criatura de forma diferente: sem
 * isso, um rebanho restaurado teria todos os bichos com o mesmo gerador
 * aleatório e eles andariam em bloco, como uma fila militar.
 */
export function restaurarMobs(salvos, criar) {
  const out = []
  for (const m of Array.isArray(salvos) ? salvos : []) {
    if (!m || !MOB_TYPES[m.type]) continue
    const bicho = criar(m.type, m.x, m.y, m.z, out.length)
    if (!bicho) continue
    if (Number.isFinite(m.yaw)) bicho.yaw = m.yaw
    // Vida fora da faixa do tipo é save adulterado ou bug: cai pra vida cheia,
    // nunca pra zero — um rebanho que morre sozinho no primeiro quadro é pior
    // que um rebanho que não voltou.
    if (Number.isFinite(m.health)) {
      bicho.health = Math.max(1, Math.min(MOB_TYPES[m.type].health, Math.round(m.health)))
    }
    // Filhote continua filhote, e ovelha tosquiada continua pelada. Sem isto o
    // save levava o rebanho de volta com todo mundo adulto e lanudo.
    if (Number.isFinite(m.bebe)) bicho.bebe = Math.max(0, m.bebe)
    bicho.tosquiada = !!m.tosquiada
    bicho.domestica = !!m.domestica
    // O ALDEÃO volta com o que era dele. Aqui só os campos crus: virar ofertas
    // e virar pessoa exige a semente do mundo, e quem faz isso é
    // `reidratarAldeoes`, no save. Copiar sem entender é de propósito — esta
    // função é de forma, e não conhece comércio nem amizade.
    if (typeof m.profissao === 'string') bicho.profissao = m.profissao
    if (Array.isArray(m.estoqueSalvo)) bicho.estoqueSalvo = m.estoqueSalvo
    if (m.npcSalvo) bicho.npcSalvo = m.npcSalvo
    if (Number.isFinite(m.origemX)) bicho.origemX = m.origemX
    if (Number.isFinite(m.origemZ)) bicho.origemZ = m.origemZ
    out.push(bicho)
  }
  return out
}

/**
 * Devolve a PESSOA e o BALCÃO a cada aldeão que voltou do save.
 *
 * ⚠️ MORA AQUI, AO LADO DE `restaurarMobs`, e não em `roqueCraftSave.js`. São o
 * mesmo trabalho — devolver a criatura inteira a partir do que o save guardou —
 * e `roqueCraftSave.js` importa o handle do Firebase no topo: pendurar esta
 * função lá obrigava o composable das entidades a carregar banco para restaurar
 * um rebanho, e o teste dele passou a exigir `FIREBASE_API_KEY`.
 *
 * ⚠️ E NÃO É `desserializarMobs`, porque precisa da SEMENTE do mundo — o
 * desserializador é uma função de forma, que não conhece mundo nenhum. Quem
 * carrega o save chama isto logo depois, com o hash na mão.
 *
 * ⚠️ E É IDEMPOTENTE de propósito: chamar duas vezes no mesmo array não zera
 * amizade nem estoque. O boot já chamou duas vezes uma coisa dessas antes (o
 * caminho "solo → sala → solo" do RC-03), e um reidratador destrutivo teria
 * apagado o progresso de comércio sem deixar rastro.
 *
 * @param mobs   a lista já desserializada
 * @param hash   `(a,b,c) => number` do mundo, com a semente dentro
 * @param sorteio `(semente) => (() => number)` — o mesmo `mulberry32` do spawn
 */
export function reidratarAldeoes(mobs, hash, sorteio) {
  for (const m of Array.isArray(mobs) ? mobs : []) {
    if (m?.type !== 'aldeao' || !m.profissao) continue
    const x = Number.isFinite(m.origemX) ? m.origemX : Math.round(m.x)
    const z = Number.isFinite(m.origemZ) ? m.origemZ : Math.round(m.z)
    if (!m.ofertas) {
      m.ofertas = ofertasDoSave(m.profissao, sorteio(Math.round(x * 31 + z)), m.estoqueSalvo)
    }
    if (!m.npc) {
      m.npc = npcDoSave(criarNpc(hash, { x, z, profissao: m.profissao }), m.npcSalvo)
    }
  }
  return mobs
}

/**
 * Criatura longe demais some — mas não a que o jogador CRIOU.
 *
 * ⚠️ TRÊS REGRAS, e cada uma existe por um defeito diferente:
 *
 *  1. **`domestica` nunca some.** Quem foi alimentado ou nasceu de um casal é
 *     patrimônio do jogador. Apagar isso por distância é apagar trabalho — e
 *     seria o pior tipo de perda: silenciosa, e só percebida ao voltar.
 *  2. **Passivo some MUITO mais longe.** 190 em vez de 72: sem isso, ir minerar
 *     e voltar já esvaziava o curral, mesmo sem criar nada.
 *  3. **Hostil some perto**, como antes. A graça dele é ser a ameaça do
 *     momento; guardar zumbi a 200 blocos é encher a lista à toa.
 */
export const shouldDespawn = (mob, player) => {
  const def = MOB_TYPES[mob?.type]
  if (!def) return true
  if (mob.domestica) return false
  // O chefe não some por distância: ele É o lugar.
  if (def.voa) return false
  const limite = def.hostile ? DESPAWN_DIST : DESPAWN_DIST_PASSIVO
  return Math.hypot(mob.x - player.x, mob.z - player.z) > limite
}

// Empacota os mobs pro multiplayer (o host manda o snapshot ~8 Hz).
export function packMobs(mobs) {
  return mobs.map((m) => [
    m.id,
    MOB_KEYS.indexOf(m.type),
    Math.round(m.x * 8) / 8,
    Math.round(m.y * 8) / 8,
    Math.round(m.z * 8) / 8,
    Math.round(m.yaw * 100) / 100,
    m.health,
    // ⚠️ A FASE DE NADO VIAJA NA REDE, e não é enfeite. Ela é o relógio da
    // animação da vida marinha: sem ela, `unpackMobs` devolve 0 e o convidado
    // vê um cardume de peixes RÍGIDOS deslizando pela água — o mesmo defeito
    // que `anim` já teve com as pernas dos bichos de terra, e pelo mesmo
    // motivo. Duas casas bastam: é uma fase de seno.
    Math.round((m.faseNado || 0) * 100) / 100,
    Math.round((m.pitch || 0) * 100) / 100,
  ])
}

export function unpackMobs(packed) {
  if (!Array.isArray(packed)) return []
  const out = []
  for (const p of packed) {
    if (!Array.isArray(p) || p.length < 7) continue
    const type = MOB_KEYS[p[1]]
    if (!type) continue
    if (![p[2], p[3], p[4]].every((n) => Number.isFinite(n))) continue
    out.push({
      id: String(p[0]),
      type,
      x: p[2],
      y: p[3],
      z: p[4],
      yaw: Number.isFinite(p[5]) ? p[5] : 0,
      health: Number.isFinite(p[6]) ? p[6] : 1,
      anim: 0,
      // Compatível com pacote ANTIGO (7 campos): o convidado de uma versão
      // anterior manda sete e estes dois chegam `undefined`. Zero em vez de
      // NaN — `rotation.x = NaN` faz o three descartar a matriz e o bicho SOME
      // da tela, sem erro no console. É a mesma armadilha anotada no yaw.
      faseNado: Number.isFinite(p[7]) ? p[7] : 0,
      pitch: Number.isFinite(p[8]) ? p[8] : 0,
      remote: true,
    })
  }
  return out
}
