// RoqueCraft - O CORPO DO JOGADOR: fisica, passo, agua, camera e sobrevivencia.
//
// E COMPOSABLE E NAO SERVICO porque e dono do estado que E o jogador: a caixa
// que anda, a barra de vida, a fase da caminhada, o acumulado da bracada, a
// animacao da camera. Tudo isso nasce com a partida, e trocado em mundo novo e
// morre no desmonte.
//
// ⚠️ AS REGRAS NAO MORAM AQUI. `physics.js` diz como o corpo anda, `passo.js` a
// cadencia do pe, `camera.js` o balanco, `survival.js` a fome e o dano. Aqui
// mora a LIGACAO: chamar cada um na ordem certa e transformar o que eles
// devolvem em som, onda e HUD.
//
// A ordem importa e esta comentada nos pontos em que ela ja custou defeito.

import { FONTES_PROTEGIDAS, pontosDe, reduzirDano, desgastar } from '../servicos/armadura.js'
import {
  aparar,
  baixar,
  comQueSeGuarda,
  criarGuarda,
  levantar,
  pelaFrente,
} from '../servicos/escudo.js'
import { ref, reactive } from 'vue'
import { stepPlayer, EYE_HEIGHT } from '../servicos/physics.js'
import { criarPassoFixo } from '../servicos/passoFixo.js'
import {
  createSurvivalState,
  MAX_HEALTH,
  damage as applyDamage,
  stepSurvival,
  addExhaustion,
  respawn as respawnState,
} from '../servicos/survival.js'
import {
  criarEfeitos,
  aplicarEfeito,
  passoDosEfeitos,
  tiqueDeEfeitos,
  limparEfeitos,
  multiplicadorDeVelocidade,
  fatorDeFolego,
  pontosInstantaneos,
  ehInstantaneo,
} from '../servicos/efeitos.js'
import { criarCaminhada, avancarCaminhada } from '../servicos/passo.js'
import { criarCamera, seguirAltura, impactoDeQueda, trancoDeDano } from '../servicos/camera.js'
import { blockDef, ID } from '../servicos/blocks.js'
import { familyOf } from '../servicos/audio.js'

import { createLogger } from '../logger.js'

const log = createLogger('roquecraft')

/** Distancia nadada, em blocos, entre duas bracadas. */
export const BRACADA = 1.15
/** Queda minima, em blocos, que rende baque de aterrissagem. */
export const QUEDA_QUE_BATE = 0.45
/** Intervalo minimo entre dois resgates de soterramento, em ms. */
export const ESPERA_DO_RESGATE = 1500

/**
 * @param {object} ctx
 * @param {object} ctx.mundo  `{ vivo, motor }` - getters
 * @param {object} ctx.ajustes  `settings`, reativo
 * @param {() => object} ctx.som  o banco de audio (pode ser nulo antes do gesto)
 * @param {() => object} ctx.entrada  o composable de entrada (lazy: ele e
 *   montado depois deste, e passar o valor daria TDZ - ver rule 44)
 * @param {import('vue').Ref<boolean>} ctx.ehCelular
 * @param {() => number} ctx.yaw
 * @param {() => string} ctx.modo
 * @param {(fonte: string) => void} ctx.aoMorrer
 * @param {(cx: number, cz: number) => void} ctx.aoAndar  recentra o sync de rede
 * @param {(teto: number, fundo: number) => object} ctx.chaoParaNascer
 */
/** Abaixo disto é vazio: quatro blocos sob o piso, para a queda pelo mundo ler como queda. */
export const PISO_DO_VAZIO = -4
export const DANO_DO_VAZIO = 4

export function useRoqueCraftCorpo(ctx) {
  const {
    mundo,
    ajustes,
    som,
    entrada,
    ehCelular,
    yaw,
    modo,
    aoMorrer,
    aoAndar,
    chaoParaNascer,
    aoExpirarEfeito,
    itemNaMao = () => null,
    gastarEscudo = () => {},
  } = ctx

  /**
   * A fase da caminhada e a animacao da camera sao ESTADO DO CORPO, e por isso
   * nascem aqui. O som do passo e o balanco da tela leem a MESMA fase; separar
   * os dois foi o que soava amador antes de `passo.js` existir.
   */
  const caminhada = criarCaminhada()
  const camAnim = criarCamera()

  /** Nao-reativo de proposito: o laco de fisica escreve nele 60x por segundo. */
  const corpo = { x: 0, y: 80, z: 0, vx: 0, vy: 0, vz: 0, onGround: false, fallStart: 80 }
  const survival = reactive(createSurvivalState())
  /**
   * Os efeitos com prazo nascem AO LADO da sobrevivência e não no componente,
   * porque quem os consome é este passo: a velocidade entra na entrada da
   * física, e o fôlego, a regeneração e o veneno entram em `stepSurvival`.
   * Passá-los do componente pra cá a cada quadro seria atravessar a fronteira
   * duas vezes por quadro pra buscar um número que mora do lado de dentro.
   *
   * Reativo porque a interface desenha os ícones do que está ativo.
   */
  const efeitos = reactive(criarEfeitos())
  const voando = ref(false)
  const submerso = ref(false)
  const naAgua = ref(false)
  const aguardandoTerreno = ref(false)
  const flashDeDano = ref(0)
  /**
   * A guarda (escudo ou braço) fica AQUI e não no componente porque é o dano
   * que a consulta, e o dano mora neste passo. Não-reativa: sobe e desce com
   * o botão, e a interface não desenha nada dela ainda.
   */
  const guarda = criarGuarda()

  let entradaDaCamera = { strafe: 0, correndo: false }
  let passoUltimoX = 0
  let passoUltimoZ = 0
  let acumuladoDaBracada = 0
  let entrouComVy = 0
  let ultimoResgate = 0
  /** O relógio da física, independente do do monitor (RC-10). */
  const fisica = criarPassoFixo()
  /** O último resultado da física, para os quadros que não completam um passo. */
  let ultimoRes = null

  const emSobrevivencia = () => modo() === 'survival'

  /** O que o teclado, o direcional e o duplo-toque dizem, num objeto so. */
  function lerEntrada() {
    const e = entrada()
    const teclas = e.teclas
    const dir = e.direcional()
    return {
      forward: (teclas.KeyS ? 1 : 0) - (teclas.KeyW ? 1 : 0) + (ehCelular.value ? dir.y : 0),
      strafe: (teclas.KeyD ? 1 : 0) - (teclas.KeyA ? 1 : 0) + (ehCelular.value ? dir.x : 0),
      jump: !!teclas.Space,
      sneak: !!(teclas.ShiftLeft || teclas.ShiftRight),
      // Ctrl OU duplo-toque no W. O Ctrl e o atalho do genero e e justamente o
      // que o navegador sequestra, entao ele nao pode ser o unico caminho.
      sprint: !!(teclas.ControlLeft || teclas.ControlRight || e.correndo()),
      flying: voando.value,
      yaw: yaw(),
      autoJump: ajustes.autoJump,
      // ⚠️ A MORDIDA DA POÇÃO DE VELOCIDADE, no único lugar onde ela cabe: a
      // entrada da física. Mexer em `WALK_SPEED` mudaria o passo de todo mundo,
      // inclusive o dos mobs que compartilham a constante.
      multVelocidade: multiplicadorDeVelocidade(efeitos),
    }
  }

  /**
   * `preso` e a fisica admitindo que nao conseguiu desencalhar o jogador nem
   * subindo oito blocos - save gravado com o jogador enterrado, que e o estado
   * em que o mundo do founder ficou depois de cair pelo cenario. Reposicionar e
   * decisao do JOGO, nao da fisica: so aqui existe a altura real da coluna.
   */
  function resgatarDoSoterramento(agora) {
    if (agora - ultimoResgate < ESPERA_DO_RESGATE) return false // nao resgatar 60x/s
    ultimoResgate = agora
    // Mesma politica do nascimento: resgatar pra dentro de uma caverna e trocar
    // um soterramento por outro. O +2 no teto e porque quem esta soterrado pode
    // estar sob uma saliencia, acima do topo da coluna.
    const { safe } = chaoParaNascer(2, 120)
    if (!safe) return false
    porEm(safe.x, safe.y, safe.z)
    log.info('jogador soterrado; reposicionado na superficie')
    return true
  }

  /** Poe o corpo num ponto e zera tudo que se acumula. */
  function porEm(x, y, z) {
    corpo.x = x
    corpo.y = y
    corpo.z = z
    corpo.vx = 0
    corpo.vy = 0
    corpo.vz = 0
    corpo.fallStart = y
    mundo.vivo()?.setPlayerPosition(x, y, z)
  }

  /**
   * Leva dano. Devolve `{ aparado, aplicado }`.
   *
   * ⚠️ O RETORNO EXISTE POR CAUSA DO EMPURRÃO. Até 19/09/2026 a guarda cortava
   * o dano e o tranco passava inteiro: o escudo aparava a pancada do zumbi e o
   * jogador saía voando do mesmo jeito. Quem empurra é o chamador (o empurrão é
   * do MUNDO, não do corpo), e sem saber se a guarda pegou ele não tinha como
   * decidir. `aparado` é a aparada CHEIA — escudo, `passa: 0`; a mão vazia só
   * reduz pela metade e o tranco continua fazendo sentido.
   */
  function machucar(quanto, fonte, de = null) {
    if (!emSobrevivencia()) return { aparado: false, aplicado: 0 }
    // A GUARDA VEM ANTES DA ARMADURA: o que o escudo apara não chega a
    // amenizar nem a desgastar peça. Com o que se guarda é decidido AGORA,
    // pelo item na mão — trocar de slot com o botão segurado não carrega a
    // guarda do escudo pra espada.
    if (guarda.levantada) {
      const r = aparar(
        guarda,
        quanto,
        fonte,
        pelaFrente(corpo, yaw(), de),
        comQueSeGuarda(itemNaMao()),
      )
      if (r.desgaste > 0) gastarEscudo(r.desgaste)
      if (r.passa <= 0) return { aparado: true, aplicado: 0 }
      quanto = r.passa
    }
    // A ARMADURA AMENIZA o que vem de fora (bicho, flecha, estouro, cacto) e
    // se gasta a cada golpe que amenizou. Queda, afogamento e fome passam
    // inteiros — é a tabela do jogo original, e é o que o jogador espera.
    const protege = FONTES_PROTEGIDAS.has(fonte) && pontosDe(survival.armadura) > 0
    const r = applyDamage(
      survival,
      protege ? reduzirDano(quanto, pontosDe(survival.armadura)) : quanto,
      fonte,
    )
    if (r.applied > 0 && protege) desgastar(survival.armadura, quanto)
    if (r.applied > 0) {
      flashDeDano.value = 1
      // O flash vermelho e HUD; o tranco e SENSACAO. Sem ele levar pancada e
      // uma barra descendo no canto da tela.
      if (ajustes.viewBob !== false) trancoDeDano(camAnim, r.applied)
      if (survival.dead) aoMorrer(fonte)
    }
    return { aparado: false, aplicado: r.applied }
  }

  function renascerEm(ponto) {
    respawnState(survival)
    // Morrer tira os efeitos. O contrário deixaria o jogador renascer
    // envenenado e morrer de novo sem tocar em nada — e é assim que um efeito
    // de prazo vira um laço de morte.
    limparEfeitos(efeitos)
    porEm(ponto.x, ponto.y, ponto.z)
    flashDeDano.value = 0
  }

  /**
   * UM PASSO DO CORPO. A ordem das cinco partes nao e livre:
   *
   *  1. fisica (e o resgate, que so ela sabe pedir)
   *  2. passo do pe, pela DISTANCIA percorrida
   *  3. a camera alcanca o corpo - aqui e nao no render, ver o comentario
   *  4. agua: respingo, bracada e o corte de 888 Hz
   *  5. sobrevivencia: queda, cansaco, lava, cacto
   */
  function passo(dt, agora) {
    const world = mundo.vivo()
    if (!world) return null
    const eng = mundo.motor()
    const audio = som()
    const input = lerEntrada()

    // `carregado` e o que impede a fisica de rodar contra um mundo que ainda
    // nao chegou - a causa do jogador cair pelo cenario. Enquanto a coluna
    // falta, o passo e congelado.
    // ⚠️ A FÍSICA ANDA NO RELÓGIO DELA (RC-10). Antes ela recebia o `dt` do
    // quadro, e havia DOIS cortes de tempo com valores diferentes — 0,1 s no
    // laço e 0,05 s dentro de `physics.js`. A 15 fps o quadro dura 0,067 s, a
    // física recebia 0,05, e o jogador andava 25% menos por segundo do que
    // alguém a 60 fps segurando a mesma tecla. O porquê está em `passoFixo.js`.
    //
    // `ultimoRes` existe porque a 120 fps alguns quadros não completam um passo:
    // o certo ali é o jogador não ter se movido, e não o resto do `passo()`
    // receber `null` e perder o som, o ar e a sobrevivência daquele quadro.
    const env = { solidAt: world.solidAt, liquidAt: world.liquidAt, carregado: world.isLoaded }
    fisica.avancar(dt, (p) => {
      ultimoRes = stepPlayer(corpo, input, env, p)
    })
    const res = ultimoRes || { suspenso: false, headInWater: false, inWater: false }
    aguardandoTerreno.value = !!res.suspenso
    // O VAZIO: abaixo do piso do mundo não há chão que segure (o Fim não tem
    // bedrock). Machuca a cada meio segundo (a invulnerabilidade dita o ritmo)
    // até matar — é a regra do original, e é o que faz a beira da ilha ser beira.
    if (corpo.y < PISO_DO_VAZIO) machucar(DANO_DO_VAZIO, 'void')
    submerso.value = !!res.headInWater
    naAgua.value = !!res.inWater
    if (res.preso) resgatarDoSoterramento(agora)

    // PASSO: cadencia pela distancia REALMENTE percorrida.
    //
    // ⚠️ A conta era `veloc * dt` com portao em `veloc > 0.9`. Velocidade nao e
    // deslocamento: fisica oscilando, pe preso num muro ou analogico encostado
    // davam velocidade sem tirar o jogador do lugar. Delta de posicao e o que o
    // jogador ve; e ele que manda.
    //
    // E a cadencia vive em `passo.js`, junto com o balanco da camera: o som e a
    // tela leem a MESMA fase, entao nao tem como sair de sincronia.
    const andou = Math.hypot(corpo.x - passoUltimoX, corpo.z - passoUltimoZ)
    passoUltimoX = corpo.x
    passoUltimoZ = corpo.z
    const familiaDoPe = () =>
      familyOf(
        blockDef(world.getBlock(Math.floor(corpo.x), Math.floor(corpo.y) - 1, Math.floor(corpo.z)))
          ?.key,
      )
    if (avancarCaminhada(caminhada, andou, dt, corpo.onGround && !res.inWater) > 0) {
      audio?.step(familiaDoPe())
    }
    // BAQUE DE ATERRISSAGEM. So quando houve queda de verdade: andar em terreno
    // irregular tira e devolve o pe ao chao a cada ondulacao, e sem o corte por
    // altura cada lombada soma um passo extra em cima da cadencia normal.
    // Dentro d'agua quem responde e o splash, nao a bota.
    if (res.landed && res.queda > QUEDA_QUE_BATE && !res.inWater) {
      audio?.step(familiaDoPe())
      caminhada.fase = 0
      if (ajustes.viewBob !== false) impactoDeQueda(camAnim, res.queda)
    }

    // ── O OLHO ALCANCA O CORPO ─────────────────────────────────────────────
    //
    // Aqui, e nao no laco de render: `seguirAltura` compara a altura ANTES e
    // DEPOIS de um passo de fisica, e e dentro dele que o degrau automatico
    // teleporta o jogador pra cima. Chamando no render, um frame com dois
    // passos (ou nenhum) mediria a diferenca errada.
    //
    // Sem gate de acessibilidade: isto TIRA movimento da tela, nao poe.
    seguirAltura(camAnim, corpo.y, corpo.onGround)
    // Inclinacao e campo de visao sao EFEITO, nao correcao: seguem o mesmo
    // interruptor de acessibilidade do balanco.
    entradaDaCamera =
      ajustes.viewBob === false
        ? { strafe: 0, correndo: false }
        : {
            strafe: input.strafe,
            correndo: input.sprint && corpo.onGround && caminhada.intensidade > 0.35,
          }

    // ── A LAMINA REAGE AO CORPO ────────────────────────────────────────────
    if (res.enteredWater) {
      // O respingo escala com a queda: um som de tamanho fixo faz "escorregou
      // na margem" e "pulou do penhasco" soarem igual.
      audio?.splash(Math.min(1, 0.25 + Math.abs(entrouComVy) * 0.07))
      eng?.ondularAgua(corpo.x, corpo.z, Math.min(0.26, 0.07 + Math.abs(entrouComVy) * 0.016))
    }
    if (res.inWater) {
      // Bracada: cadencia pela DISTANCIA nadada, nao pelo relogio - nadar
      // devagar tem que fazer menos onda que nadar rapido, igual ao passo.
      acumuladoDaBracada += Math.hypot(corpo.vx, corpo.vz) * dt
      if (acumuladoDaBracada > BRACADA) {
        acumuladoDaBracada = 0
        eng?.ondularAgua(corpo.x, corpo.z, 0.055)
        // Som e onda saem do MESMO evento. Bracada com a cabeca submersa vira
        // bolha - debaixo d'agua ninguem ouve o proprio braco na superficie.
        if (res.headInWater) audio?.bolha()
        else audio?.bracada()
      }
    } else {
      acumuladoDaBracada = 0
    }
    // O corte de 888 Hz entra e sai com a CABECA, nao com o corpo: nadar de
    // peito nao abafa nada, mergulhar abafa tudo.
    audio?.setSubmerso(!!res.headInWater)
    entrouComVy = corpo.vy

    if (emSobrevivencia()) {
      if (res.fallDamage > 0) machucar(res.fallDamage, 'fall')
      if (Math.hypot(corpo.vx, corpo.vz) > 0.4)
        addExhaustion(survival, input.sprint ? 'sprint' : 'walk', dt)
      const naLava =
        world.getBlock(Math.floor(corpo.x), Math.floor(corpo.y + 0.2), Math.floor(corpo.z)) ===
        ID.lava
      // ⚠️ A ORDEM É TICAR, APLICAR, E SÓ ENTÃO DESCONTAR O PRAZO. Descontar
      // antes faria o último tique de um efeito se perder; ticar depois faria
      // um efeito já vencido render mais um. A primeira versão do teste de
      // ponta a ponta esqueceu o desconto e o veneno levou o jogador a 1 de
      // vida — o defeito existe, e é este o lugar dele.
      const tiqueDeEfeito = tiqueDeEfeitos(efeitos, dt)
      const evs = stepSurvival(
        survival,
        {
          headInWater: res.headInWater,
          inLava: naLava,
          fatorDeFolego: fatorDeFolego(efeitos),
          tiqueDeEfeito,
        },
        dt,
      )
      for (const nome of passoDosEfeitos(efeitos, dt)) aoExpirarEfeito?.(nome)
      if (evs.includes('hurt')) flashDeDano.value = 1
      if (evs.includes('died')) aoMorrer(survival.lastDamage)
      // cacto/dano de contato
      const dano = blockDef(
        world.getBlock(Math.floor(corpo.x), Math.floor(corpo.y), Math.floor(corpo.z)),
      )?.damage
      if (dano && !naLava) machucar(dano, 'cactus')
    }

    world.setPlayerPosition(corpo.x, corpo.y, corpo.z)
    aoAndar(corpo.x, corpo.z)
    return res
  }

  return {
    corpo,
    survival,
    voando,
    submerso,
    naAgua,
    aguardandoTerreno,
    flashDeDano,
    caminhada,
    camAnim,
    entradaDaCamera: () => entradaDaCamera,
    alturaDoOlho: EYE_HEIGHT,
    passo,
    machucar,
    levantarGuarda: () => {
      levantar(guarda)
      return true
    },
    baixarGuarda: () => baixar(guarda),
    guardaLevantada: () => guarda.levantada,
    efeitos,
    /**
     * Bebeu. Instantâneo cura ou fere na hora; o resto entra no mapa com prazo.
     * Devolve `true` quando alguma coisa aconteceu — quem chama usa isso pra
     * decidir se gasta a garrafa.
     */
    tomarEfeito: (nome, nivel = 1, duracao = null, pontos = null) => {
      if (ehInstantaneo(nome)) {
        // `pontos` só vem do borrifo, já minguado pela distância.
        pontos = pontos ?? pontosInstantaneos(nivel)
        if (nome === 'cura') {
          survival.health = Math.min(MAX_HEALTH, survival.health + pontos)
          return true
        }
        if (nome === 'dano') {
          machucar(pontos, 'magic')
          return true
        }
        return false
      }
      return aplicarEfeito(efeitos, nome, nivel, duracao)
    },
    limparEfeitos: () => limparEfeitos(efeitos),
    renascerEm,
    porEm,
    resgatarDoSoterramento,
  }
}
