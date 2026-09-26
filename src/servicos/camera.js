// A CÂMERA COMO CORPO: o que a cabeça faz que os pés não mandam.
//
// `passo.js` já resolve o balanço da caminhada — uma fase só, compartilhada com
// o som. Este arquivo cuida do resto do que a cabeça faz e que não vem da
// passada: subir um degrau, aterrissar, correr, inclinar na curva.
//
// O pedido do founder (2026-08-23): "melhore a animação da câmera ao andar e
// subir em um bloco sem pular e também melhore as animações gerais da câmera,
// igual você fez do andar que ficou fenomenal".
//
// ⚠️ O DEGRAU É O CASO GRAVE, e é um defeito, não um enfeite. `degrau()` na
// física escreve `pos.y = alvoY` — teleporte de até 1,2 bloco em um frame. A
// câmera lia `player.y` direto, então subir a beira de um bloco andando dava um
// salto seco de 60 pixels. É o mesmo tranco que o founder já tinha reclamado
// ("subir e descer blocos está bem complicado"), agora do lado visual.
//
// A correção é a que todo jogo do gênero usa: a câmera FICA PRA TRÁS do corpo e
// alcança em ~0,1 s. O jogador sobe na hora (a física não muda), o olho desliza.
//
// Puro de propósito: sem three, sem Vue. Dá pra afirmar amortecimento e
// estabilidade de frame rate sem abrir navegador.

import { AUTO_STEP_HEIGHT } from './physics.js'

// ── Constantes, com o porquê ────────────────────────────────────────────────

// Tempo em que a câmera alcança o corpo depois de um degrau. Medido no olho:
// 0,04 s ainda estala; 0,2 s dá a sensação de a cabeça flutuar atrás do corpo.
const TAU_DEGRAU = 0.085

// Nunca deve mais que um degrau automático inteiro: acumular dois degraus
// seguidos afundaria a câmera dentro do chão.
const MAX_DEGRAU = AUTO_STEP_HEIGHT + 0.05

// Abaixo disto é ruído numérico da física, não degrau.
const MIN_DEGRAU = 0.06

// Impacto de aterrissagem: mola amortecida (ζ ≈ 0,5) — desce rápido, volta com
// um único repique curto. Crítica (ζ = 1) fica sem vida; 0,3 balança demais.
const K_IMPACTO = 170
const ZETA_IMPACTO = 0.5
const D_IMPACTO = 2 * ZETA_IMPACTO * Math.sqrt(K_IMPACTO)
const IMPACTO_POR_METRO = 0.035
const IMPACTO_MAX = 0.32

// Inclinação lateral ao andar de lado: 0,022 rad ≈ 1,3°. Passou disso e a tela
// parece torta em vez de "o corpo pendeu".
const ROLAGEM_LATERAL = 0.022
const TAU_ROLAGEM = 0.18

// Correr abre 7,5% do campo de visão. É o suficiente pra ler como velocidade e
// pouco o bastante pra não distorcer a mira.
const FOV_CORRIDA = 1.075
const TAU_FOV = 0.16

// Tranco de dano: 0,05 rad ≈ 2,9° no golpe cheio, sumindo em ~0,25 s. Maior que
// isso desloca a mira o bastante pra ser injusto num combate.
const TORCAO_DANO = 0.05
const TAU_TORCAO = 0.11

// ⚠️ A mola integra em passos FIXOS. Com Euler explícito e dt de um frame
// engasgado (0,1 s), `k·dt² = 1,7` — a mola EXPLODE, e o que o jogador vê é a
// câmera saindo do mundo depois de um travamento. Sub-passo de 1/240 mantém
// `k·dt²` em 0,003 e torna o resultado independente do frame rate, que é a
// mesma regra já aplicada à cadência do passo.
const SUB_PASSO = 1 / 240

const rumoA = (atual, alvo, dt, tau) => atual + (alvo - atual) * (1 - Math.exp(-dt / tau))

export const criarCamera = () => ({
  degrau: 0, // metros que o olho ainda deve ao corpo (negativo = atrás)
  impacto: 0, // deslocamento vertical do baque
  impactoV: 0, // velocidade da mola do baque
  rolagem: 0, // inclinação lateral atual, em radianos
  torcao: 0, // torção do tranco de dano, em radianos
  ladoDano: -1, // de que lado veio o último tranco (alterna)
  fov: 1, // multiplicador do campo de visão
  yAnterior: null,
})

/**
 * Observa a altura do corpo e absorve o degrau.
 *
 * Só absorve SUBIDA com o pé no chão. Pulo e queda têm que chegar ao olho na
 * hora: amortecer a subida de um pulo faz a câmera boiar, e amortecer a queda
 * tira o susto — os dois são o oposto do que se quer.
 *
 * @param {object} cam
 * @param {number} y altura atual do corpo (pés)
 * @param {boolean} noChao
 */
export function seguirAltura(cam, y, noChao) {
  if (!Number.isFinite(y)) return 0
  if (cam.yAnterior === null) {
    cam.yAnterior = y
    return 0
  }
  const dy = y - cam.yAnterior
  cam.yAnterior = y
  if (!noChao || dy < MIN_DEGRAU || dy > MAX_DEGRAU) return 0
  cam.degrau = Math.max(-MAX_DEGRAU, cam.degrau - dy)
  return dy
}

/**
 * Baque de aterrissagem, proporcional à queda.
 *
 * @param {object} cam
 * @param {number} queda altura da queda que acabou, em metros
 */
export function impactoDeQueda(cam, queda) {
  if (!(queda > 0)) return 0
  const d = -Math.min(IMPACTO_MAX, queda * IMPACTO_POR_METRO)
  // o baque mais forte manda: dois pousos no mesmo frame não somam
  if (d < cam.impacto) {
    cam.impacto = d
    cam.impactoV = 0
  }
  return d
}

/**
 * Tranco de dano.
 *
 * O jogo já pisca a tela em vermelho, e piscar é informação de HUD — não é
 * sensação. O corpo levar uma pancada é a cabeça ir junto. Um único impulso na
 * mesma mola do baque, mais uma torção lateral que decai sozinha: o suficiente
 * pra a mira sair um dedo do lugar e voltar, que é o que faz a pancada doer.
 *
 * A torção alterna de lado a cada golpe (`lado`), senão levar cinco pancadas
 * seguidas empurra a tela sempre pro mesmo canto e vira enjoo em vez de susto.
 *
 * @param {object} cam
 * @param {number} dano pontos de vida perdidos
 * @param {number} lado -1 ou 1; alterna a cada chamada quando omitido
 */
export function trancoDeDano(cam, dano, lado) {
  if (!(dano > 0)) return 0
  const forca = Math.min(1, dano / 8)
  cam.impactoV -= forca * 1.6
  // OMITIDO alterna; qualquer valor dado manda. O `??` que estava aqui só se
  // diferenciava de um `||` para `lado === 0`, que está fora do contrato
  // documentado (-1 ou 1) — ou seja, era um operador que nenhum teste podia
  // prender. `=== undefined` diz a MESMA regra e é afirmável.
  const dir = lado === undefined ? (cam.ladoDano = -(cam.ladoDano || -1)) : lado
  cam.torcao = dir * forca * TORCAO_DANO
  return forca
}

/**
 * Avança as animações da câmera.
 *
 * @param {object} cam
 * @param {number} dt segundos
 * @param {{strafe?:number, correndo?:boolean}} entrada
 */
export function avancarCamera(cam, dt, { strafe = 0, correndo = false } = {}) {
  if (!(dt > 0)) return cam
  // degrau: decaimento exponencial, exato para qualquer dt
  cam.degrau *= Math.exp(-dt / TAU_DEGRAU)
  if (Math.abs(cam.degrau) < 1e-4) cam.degrau = 0

  // impacto: mola em sub-passo fixo
  let restante = dt
  while (restante > 1e-6) {
    const h = Math.min(SUB_PASSO, restante)
    restante -= h
    cam.impactoV += (-K_IMPACTO * cam.impacto - D_IMPACTO * cam.impactoV) * h
    cam.impacto += cam.impactoV * h
  }
  if (Math.abs(cam.impacto) < 1e-4 && Math.abs(cam.impactoV) < 1e-3) {
    cam.impacto = 0
    cam.impactoV = 0
  }

  const lado = Math.max(-1, Math.min(1, strafe))
  cam.rolagem = rumoA(cam.rolagem, -lado * ROLAGEM_LATERAL, dt, TAU_ROLAGEM)
  cam.fov = rumoA(cam.fov, correndo ? FOV_CORRIDA : 1, dt, TAU_FOV)
  cam.torcao *= Math.exp(-dt / TAU_TORCAO)
  if (Math.abs(cam.torcao) < 1e-5) cam.torcao = 0
  return cam
}

/** Rolagem total da câmera: o pender do corpo mais o tranco do golpe. */
export const rolagemTotal = (cam) => cam.rolagem + cam.torcao

/**
 * Deslocamento vertical do olho, em metros (soma degrau + baque).
 *
 * O piso existe pro caso improvável de os dois se somarem no mesmo frame: o
 * olho fica a 1,62 do pé, então abaixar mais que 1,3 põe a câmera dentro do
 * chão — e câmera dentro do chão é a tela preta que o founder já fotografou uma
 * vez. Barato, e fecha a porta.
 */
export const deslocamentoY = (cam) => Math.max(-1.3, cam.degrau + cam.impacto)

/**
 * ONDE A CAMERA FICA NESTE QUADRO: posicao, rolagem e campo de visao.
 *
 * ⚠️ O BALANCO E LATERAL AO CORPO, NAO AO MUNDO.
 *
 * `bal.x` e um deslocamento pro lado de quem anda. Somado direto em `x` ele
 * viraria "pro leste": o jogador andando pro norte veria a cabeca balancar pra
 * frente e pra tras em vez de de um lado pro outro. Girar por `yaw` (cos em x,
 * sen em z) e o que amarra o balanco ao corpo -- e e por isso que esta conta
 * mora aqui, testavel, e nao solta no laco de render.
 *
 * @param {object} e
 * @param {[number,number,number]} e.olho  o olho ja resolvido (posicao segura)
 * @param {number} e.yaw
 * @param {object|null} e.bal  balanco da caminhada, ou null se desligado
 * @param {object} e.cam  o estado animado da camera
 * @param {number} e.fovBase  o FOV escolhido pelo jogador nos ajustes
 */
export function poseDaCamera({ olho, yaw, bal, cam, fovBase }) {
  const [x, y, z] = olho
  return {
    x: x + (bal ? bal.x * Math.cos(yaw) : 0),
    y: y + deslocamentoY(cam) + (bal ? bal.y : 0),
    z: z + (bal ? bal.x * Math.sin(yaw) : 0),
    rolagem: (bal ? bal.rolagem : 0) + rolagemTotal(cam),
    fov: fovBase * cam.fov,
  }
}

/**
 * Vale reconstruir a matriz de projecao?
 *
 * `updateProjectionMatrix` nao e de graca, e o FOV so muda quando o jogador
 * comeca ou para de correr -- fracoes de grau por quadro no meio da rampa. O
 * limiar existe pra nao pagar a matriz em todo quadro por uma mudanca que
 * ninguem enxerga; abaixo dele o olho nao distingue.
 */
export const PASSO_MINIMO_DE_FOV = 0.01

export const mudouOFov = (atual, alvo) => Math.abs(atual - alvo) > PASSO_MINIMO_DE_FOV

export {
  TAU_DEGRAU,
  MAX_DEGRAU,
  MIN_DEGRAU,
  FOV_CORRIDA,
  ROLAGEM_LATERAL,
  IMPACTO_MAX,
  TORCAO_DANO,
}

/**
 * A órbita da tela inicial.
 *
 * ⚠️ 0,055 rad/s NÃO É UM NÚMERO BONITO, é um limite de conforto: dá uma volta
 * em ~1min55s. Mais rápido que isso e a tela inicial enjoa — e enjoar na PORTA
 * do jogo é a pior hora possível pra isso acontecer, porque a pessoa ainda não
 * tem motivo nenhum pra aguentar.
 *
 * A câmera dá meia volta de arco por volta de yaw (`yaw * 0.5`): a paisagem
 * muda mais devagar do que o olhar gira, e é isso que faz o mundo parecer
 * grande em vez de fazer a câmera parecer rápida.
 */
export const ORBITA = { velocidade: 0.055, raio: 6, arco: 0.5 }

export function orbitaDoMenu({ ancora, yaw, dt }) {
  const novoYaw = yaw + dt * ORBITA.velocidade
  if (!ancora) return { yaw: novoYaw, pos: null }
  return {
    yaw: novoYaw,
    pos: {
      x: ancora.x + Math.sin(novoYaw * ORBITA.arco) * ORBITA.raio,
      y: ancora.y,
      z: ancora.z + Math.cos(novoYaw * ORBITA.arco) * ORBITA.raio,
    },
  }
}

/**
 * PÕE A CÂMERA DO THREE NO LUGAR que `poseDaCamera` calculou.
 *
 * Isto morava no laço de quadro do componente e saiu porque ele é onde o custo
 * de ler já é maior: seis linhas de escrita em `camera.position`, `rotation.z` e
 * `fov` no meio de trilha, clima e sincronia de entidades.
 *
 * O porta de `mudouOFov` é o que importa aqui e é fácil de perder de vista:
 * `updateProjectionMatrix` é caro, e chamá-lo todo quadro por causa de um
 * centésimo de grau de campo de visão é gastar matriz pra não mudar nada na
 * tela. Junto com o resto, esse portão tem um lugar só e um teste em volta.
 *
 * @param camera a `PerspectiveCamera` do three
 * @param pose o que `poseDaCamera` devolveu
 * @param aplicarOlhar `aplicarNaCamera` de `aim.js` (injetado: este módulo não
 *        conhece o three nem a mira)
 * @returns `true` se o campo de visão foi de fato recalculado
 */
export function assentarCamera(camera, pose, yaw, pitch, aplicarOlhar) {
  camera.position.set(pose.x, pose.y, pose.z)
  aplicarOlhar(camera, yaw, pitch)
  camera.rotation.z = pose.rolagem
  if (!mudouOFov(camera.fov, pose.fov)) return false
  camera.fov = pose.fov
  camera.updateProjectionMatrix()
  return true
}
