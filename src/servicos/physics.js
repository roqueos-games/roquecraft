// RoqueCraft - física do jogador, pura e testável.
//
// A entidade é uma AABB de 0.6 × 1.8 × 0.6 com o PÉ na posição (o y do jogador
// é a base, não o centro), que é a convenção do gênero e a que casa com a
// convenção de bloco de canto do mesher.
//
// Resolução por EIXO com sub-passos: mover x, resolver; mover y, resolver;
// mover z, resolver. Um passo grande é fatiado em pedaços menores que meio
// bloco - sem isso, cair de muito alto ATRAVESSA o chão (tunelamento), que é o
// bug que faz o jogador aparecer sob o mundo.
//
// Também resolve: degrau automático de meio bloco (não travar em cada bloco de
// terreno), natação com empuxo, e dano de queda.

import { WATER_DROP } from './constants.js'
import { limites, tetoDeCorpo } from './dimensoes.js'

export const PLAYER_WIDTH = 0.6
export const PLAYER_HEIGHT = 1.8
export const EYE_HEIGHT = 1.62
// Degrau automático. 0.6 é o valor do jogo original (sobe laje, não sobe bloco
// inteiro). 1.05 liga o "auto-jump": o jogador sobe um bloco só andando, que é
// a opção padrão no Bedrock e o que faz atravessar terreno acidentado deixar de
// ser um martelar de barra de espaço. Ligado por padrão, desligável nos ajustes.
export const STEP_HEIGHT = 0.6
// 1.05 dava um bloco cheio e mais nada. Assim que a camada de neve virou
// sólida (12,5%), um degrau nevado passou a medir 1,125 — e o jogador travava
// em CADA bloco de terreno em bioma frio, que é metade do mapa. 1.2 cobre bloco
// com laje fina em cima e continua bem longe de 2, que é a parede que o
// auto-degrau nunca pode escalar.
export const AUTO_STEP_HEIGHT = 1.2

export const GRAVITY = 28
export const TERMINAL_V = -60
export const WALK_SPEED = 4.7
export const SPRINT_MULT = 1.35
export const SNEAK_MULT = 0.32
export const JUMP_VELOCITY = 8.6
export const FLY_SPEED = 13
export const FLY_SPRINT = 2.4
export const SWIM_SPEED = 3.2
export const SWIM_UP = 3.4
// ⚠️ SEM ISTO NÃO DAVA PRA MERGULHAR, e o founder sentiu falta exatamente
// assim: "estou sentindo falta de poder mergulhar".
//
// O empuxo de Arquimedes acima estabiliza o corpo em `1/FLUTUACAO` = 43%
// submerso — cabeça e ombros de fora — e não havia NENHUMA entrada que
// empurrasse pra baixo. `input.sneak` só descia com `flying` ligado. Ou seja: o
// jogador entrava na água, boiava, e a única coisa que a água aceitava era
// subir. Nadar fundo era impossível por falta de verbo, não por dificuldade.
//
// Mais lento que o SWIM_UP de propósito: descer é remar CONTRA o empuxo, e
// afundar tão rápido quanto se sobe faria a superfície perder o peso que a
// equação de flutuação passou a rodada inteira construindo.
export const SWIM_DOWN = -2.6
export const WATER_DRAG = 0.55

// ── EMPUXO ──────────────────────────────────────────────────────────────────
//
// A versão anterior era um escalar: gravidade × 0,28 e um teto de −2,6 m/s de
// afundamento. Descia sempre, em qualquer profundidade, e "boiar" era o
// jogador segurando espaço. Não é escolha errada — o próprio Minecraft Bedrock
// resolve com um escalar (`base_buoyancy`) mais um bobbing cosmético — mas ela
// não produz o comportamento que o founder pediu: a lâmina reagir ao corpo.
//
// Aqui é Arquimedes de verdade, na forma mais simples que funciona: a força
// para cima é proporcional ao VOLUME DESLOCADO, e o volume deslocado é a fração
// do corpo abaixo da linha d'água. Como a AABB do jogador é um prisma de seção
// constante, essa fração é só a razão de alturas.
//
//   a = (submerso · FLUTUACAO − 1) · g
//
// O equilíbrio sai sozinho em submerso = 1/FLUTUACAO. Com 2,3, o jogador
// estabiliza com ~43% do corpo na água — cabeça e ombros fora, que é onde um
// corpo humano de fato flutua. E porque é um sistema de segunda ordem com
// amortecimento, ele CHEGA lá oscilando: o bobbing não é animação, é a solução
// da equação. Cair de alto afunda fundo e volta; entrar devagar mal balança.
export const FLUTUACAO = 2.3
/**
 * Empuxo com o corpo INTEIRO debaixo da linha d'água. Ver o bloco no passo.
 * Quase neutro de propósito: acima de 1 pra quem soltar o controle voltar à
 * tona, e perto de 1 pra quem quiser ficar no fundo conseguir.
 */
export const FLUTUACAO_SUBMERSO = 1.02
/** Em quantos blocos abaixo da linha o empuxo termina de virar o de mergulho. */
export const PROFUNDIDADE_NEUTRA = 0.8
/** Arrasto vertical na água, proporcional à parte submersa. */
export const ARRASTO_VERTICAL = 4.2
export const AIR_CONTROL = 0.28 // fração do controle mantida no ar

const HALF = PLAYER_WIDTH / 2

/**
 * Tem chão sob alguma das quatro quinas do corpo?
 *
 * Usado pela trava de borda do agachado. A folga de 0,02 nas quinas é
 * deliberada: sem ela, encostado exatamente na fronteira da célula, o pé
 * "conta" um bloco vizinho que na prática não sustenta nada, e a trava soltava
 * o jogador no vazio.
 */
export function temApoio(solidAt, x, y, z) {
  const yb = Math.floor(y - 0.08)
  const m = HALF - 0.02
  for (const sx of [-m, m]) {
    for (const sz of [-m, m]) {
      if (solidAt(Math.floor(x + sx), yb, Math.floor(z + sz))) return true
    }
  }
  return false
}
const EPS = 1e-4

/**
 * Altura sólida de um bloco, em 0..1.
 *
 * O acessor pode devolver boolean (bloco cheio ou vazio, que é o caso de 95%
 * do mundo) ou um número entre 0 e 1 para bloco PARCIAL — camada de neve,
 * laje. Antes disto a física só conhecia cubo cheio: a camada de neve, que o
 * mesher desenha com 12,5% de altura, era `solid: false` e o jogador
 * atravessava a neve visível pra pousar na grama debaixo.
 */
function alturaDe(acessor, x, y, z) {
  const h = acessor(x, y, z)
  if (h === true) return 1
  if (!h) return 0
  if (typeof h === 'object') {
    let t = 0
    for (const c of h) if (c[4] > t) t = c[4]
    return t
  }
  return h > 1 ? 1 : h
}

// AS CAIXAS SÓLIDAS de uma célula, em fração de bloco, ou null se vazia.
//
// Dois formatos, e é de propósito: enquanto a forma é UMA caixa encostada no
// chão e ocupando a célula inteira em X e Z — o mundo inteiro, menos laje de
// topo e escada — o acessor devolve o NÚMERO que sempre devolveu, e nenhum
// teste antigo que retorna `true` ou `0.125` na mão precisa saber que formas
// existem. Qualquer outra coisa vem como lista `[[x0,y0,z0,x1,y1,z1], ...]`.
//
// `_simples` é de módulo pra não alocar: `collides` chama isto uma vez por
// célula tocada, dezenas de vezes por quadro, e uma lista nova por chamada
// aqui vira lixo de coleta no caminho mais quente da física.
const _simples = [[0, 0, 0, 1, 1, 1]]
function caixasDe(acessor, x, y, z) {
  const h = acessor(x, y, z)
  if (!h) return null
  if (typeof h === 'object') return h.length ? h : null
  _simples[0][4] = h === true || h > 1 ? 1 : h
  return _simples
}

/**
 * Colisão da AABB do jogador contra os blocos.
 *
 * `solidAt(x,y,z)` recebe coordenada de BLOCO (inteiro) e devolve `true`/`1`
 * para bloco cheio, `false`/`0` para vazio, ou a fração de altura de um bloco
 * parcial (ver `alturaDe`). A caixa do bloco parcial é [y, y+h] — ela cresce a
 * partir do CHÃO da célula, que é onde neve e laje se apoiam.
 */
export function collides(solidAt, px, py, pz) {
  const minX = Math.floor(px - HALF + EPS)
  const maxX = Math.floor(px + HALF - EPS)
  // ⚠️ `floor(py)`, sem folga. Com `floor(py + EPS)`, um pé a 1e-4 DENTRO do
  // bloco pulava a célula de baixo e lia como livre — e a bisseção do `sweep`,
  // que caça o ponto de contato, mirava exatamente nessa faixa. O jogador
  // repousava um décimo de milímetro abaixo da superfície em toda queda.
  const minY = Math.floor(py)
  const maxY = Math.floor(py + PLAYER_HEIGHT - EPS)
  const minZ = Math.floor(pz - HALF + EPS)
  const maxZ = Math.floor(pz + HALF - EPS)
  for (let x = minX; x <= maxX; x++)
    for (let y = minY; y <= maxY; y++)
      for (let z = minZ; z <= maxZ; z++) {
        const caixas = caixasDe(solidAt, x, y, z)
        if (!caixas) continue
        for (const c of caixas) {
          // X e Z agora ENTRAM na conta. Enquanto toda forma ocupava a célula
          // inteira no plano, bastava o laço de células — a escada tem meia
          // célula em um dos eixos, e sem este teste ela colidiria como cubo.
          if (px - HALF + EPS >= x + c[3] || px + HALF - EPS <= x + c[0]) continue
          if (pz - HALF + EPS >= z + c[5] || pz + HALF - EPS <= z + c[2]) continue
          const base = c[1]
          const h = c[4]
          // Sobreposição em Y entre [py, py+altura do jogador] e [y, y+h].
          //
          // O pé usa `<` EXATO, sem folga. Com `- EPS` aqui, "livre" incluía uma
          // faixa de 1e-4 DENTRO do bloco — e a bisseção do `sweep`, que procura
          // o ponto de contato, convergia justamente pra essa faixa: o jogador
          // pousava um décimo de milímetro abaixo da superfície. Invisível, mas é
          // dívida: qualquer teste de "está em cima do bloco" passa a precisar de
          // tolerância. A folga fica só na cabeça, onde ela evita tremer ao
          // encostar no teto.
          // ⚠️ A caixa pode FLUTUAR (laje de topo: [y+0.5, y+1]). O piso dela
          // entra na conta com a MESMA folga que o teto — é ele que faz o
          // jogador caber embaixo de uma laje de topo em vez de ficar preso na
          // célula inteira.
          if (py < y + h && py + PLAYER_HEIGHT > y + base + EPS) return true
        }
      }
  return false
}

/**
 * DESENCALHAR. Sobe o jogador até a primeira altura livre.
 *
 * ⚠️ Isto não é paranoia defensiva, é conserto de estado real. Até 2026-08-22 o
 * mundo respondia AR para chunk não carregado, então quem andasse mais rápido
 * que o carregador caía pelo cenário e o terreno materializava EM VOLTA dele.
 * O founder mandou o print: câmera dentro do maciço, mundo em pedaços, "eu ando
 * e caio no meio do bloco". A causa está tapada em `worldClient` (desconhecido
 * agora é sólido) e no congelamento abaixo, mas os saves que já quebraram
 * continuam com o jogador enterrado — e um jogo que abre com a câmera dentro da
 * pedra não tem como se explicar.
 *
 * Sobe no máximo `limite` blocos: se não achar saída, é melhor devolver falso e
 * deixar quem chamou decidir (renascer) do que teleportar pra estratosfera.
 */
export function desencalhar(solidAt, state, limite = 8) {
  if (!collides(solidAt, state.x, state.y, state.z)) return false
  for (let d = 1; d <= limite * 4; d++) {
    const y = Math.floor(state.y) + d * 0.25
    if (!collides(solidAt, state.x, y, state.z)) {
      state.y = y
      state.vy = 0
      state.fallStart = y
      return true
    }
  }
  return false
}

/**
 * Altura da LÂMINA d'água sobre a coluna do jogador, em coordenada de mundo.
 *
 * O mesher desenha a superfície do líquido `WATER_DROP` abaixo do topo do bloco
 * — é o degrau que dá a borda visível na praia. A física precisa da MESMA
 * linha, senão o empuxo equilibra o jogador 12 cm acima de onde a água está
 * desenhada e a cabeça flutua num vazio.
 *
 * Devolve `-Infinity` se não há líquido na coluna.
 */
export function nivelDaAgua(liquidAt, x, y, z) {
  const bx = Math.floor(x)
  const bz = Math.floor(z)
  let by = Math.floor(y)
  if (!liquidAt(bx, by, bz)) {
    // o pé pode estar logo abaixo da lâmina rebaixada
    if (!liquidAt(bx, by + 1, bz)) return -Infinity
    by += 1
  }
  let topo = by
  // 24 é o teto de segurança: coluna de água mais alta que isso é caverna
  // inundada, e o empuxo já saturou muito antes.
  for (let k = 1; k <= 24 && liquidAt(bx, topo + 1, bz); k++) topo++
  return topo + 1 - WATER_DROP
}

// Move um eixo em fatias menores que meio bloco e para na primeira colisão.
//
// ENCOSTAR DE VERDADE. Ao bater, a varredura discreta deixaria o jogador
// parado no último passo LIVRE — até 0,45 bloco antes do obstáculo. Caindo a
// 60 blocos/s isso é pousar flutuando quase meio bloco acima do chão, e com
// bloco parcial (neve, laje) o erro é maior que o próprio bloco. As oito
// bisseções abaixo fecham essa folga em ~0,002 bloco, que é invisível e
// barato: só rodam no frame em que houve contato.
const BISSECOES = 8

function sweep(solidAt, pos, axis, delta) {
  if (delta === 0) return { moved: 0, blocked: false }
  const steps = Math.max(1, Math.ceil(Math.abs(delta) / 0.45))
  const inc = delta / steps
  let moved = 0
  for (let i = 0; i < steps; i++) {
    const test = { ...pos }
    test[axis] += inc
    if (collides(solidAt, test.x, test.y, test.z)) {
      let livre = 0
      let batido = inc
      for (let b = 0; b < BISSECOES; b++) {
        const meio = (livre + batido) / 2
        const t = { ...pos }
        t[axis] += meio
        if (collides(solidAt, t.x, t.y, t.z)) batido = meio
        else livre = meio
      }
      pos[axis] += livre
      return { moved: moved + livre, blocked: true }
    }
    pos[axis] = test[axis]
    moved += inc
  }
  return { moved, blocked: false }
}

/**
 * DEGRAU AUTOMÁTICO. Sobe o mínimo necessário pra desviar do obstáculo, e só se
 * o resto do movimento couber lá em cima.
 *
 * A versão anterior levantava um valor FIXO (1.05) e escrevia direto em `pos.y`:
 * andar contra um degrau de meio bloco teleportava o jogador 1,05 pra cima e a
 * gravidade puxava 0,55 de volta no mesmo frame. O resultado era o tranco que o
 * founder chamou de "subir e descer blocos está bem complicado" - não era falta
 * de degrau, era degrau grande demais e sempre do mesmo tamanho.
 *
 * A versão de 2026-08-22 só testava as FRONTEIRAS inteiras de bloco (base+1,
 * base+2), o que bastava enquanto todo bloco tinha altura 1. Com bloco parcial
 * deixou de bastar: pra pisar num bloco coberto por camada de neve o destino é
 * base+1,125, e testar base+1 dava colisão — o jogador simplesmente NÃO SUBIA
 * em terreno nevado, que é metade do mapa em bioma frio.
 *
 * Agora varre de 1/16 em 1/16 e para no primeiro destino livre, que é
 * literalmente "o mínimo necessário". Dezessete testes, e só no frame em que
 * bateu em alguma coisa.
 */
const PASSO_DEGRAU = 1 / 16

function degrau(solidAt, pos, axis, resto, stepH, wasGround, input) {
  if (!wasGround || input.flying || resto === 0) return false
  // `k * PASSO`, não `lift += PASSO`: somar 1/16 dezesseis vezes dá
  // 0,9999999999999999, e o jogador que sobe um bloco inteiro pousa um
  // bilionésimo ABAIXO da superfície. É invisível na tela e barulhento em
  // teste — e um dia vira colisão de verdade.
  const passos = Math.floor((stepH + EPS) / PASSO_DEGRAU)
  for (let k = 1; k <= passos; k++) {
    const alvoY = pos.y + k * PASSO_DEGRAU
    // cabe em pé na altura nova?
    if (collides(solidAt, pos.x, alvoY, pos.z)) continue
    // e o resto do passo cabe lá em cima?
    const t = { x: pos.x, y: alvoY, z: pos.z }
    t[axis] += resto
    if (collides(solidAt, t.x, t.y, t.z)) continue
    pos.y = alvoY
    pos[axis] = t[axis]
    return true
  }
  return false
}

/**
 * Um passo de física.
 *
 * `state`  { x,y,z, vx,vy,vz, onGround, fallStart }
 * `input`  { forward, strafe, jump, sneak, sprint, flying, yaw }
 * `env`    { solidAt(x,y,z), liquidAt(x,y,z), carregado?(x,z) }
 * Devolve `{ landed, fallDamage, inWater, headInWater, suspenso }`.
 */
export function stepPlayer(state, input, env, dt) {
  const { solidAt, liquidAt, carregado } = env
  const dtc = Math.min(dt, 0.05) // um frame gigante não vira teleporte

  // ⚠️ NÃO SIMULE CONTRA UM MUNDO QUE NÃO CHEGOU.
  //
  // Este é o defeito que o founder fotografou em 2026-08-22: câmera dentro do
  // maciço, mundo em pedaços, "eu ando e caio no meio do bloco". `getBlock`
  // devolvia AR para chunk não carregado, então quem andasse mais rápido que o
  // carregador — ou abrisse o jogo antes da coluna chegar — pisava no vazio, a
  // gravidade puxava a 60 blocos/s, e o terreno materializava EM VOLTA do
  // jogador. Não era bug de colisão: era colisão contra um mundo inexistente.
  //
  // A metade da correção que mora em `worldClient` é responder SÓLIDO para o
  // desconhecido. A outra metade é esta: enquanto a coluna do jogador não
  // existe, o passo inteiro é pulado. Sem gravidade, sem movimento, sem queda
  // acumulando dano. É o "Loading terrain" do gênero, e é a única resposta
  // honesta — mover o jogador exigiria saber o que tem embaixo dele.
  if (carregado && !carregado(Math.floor(state.x), Math.floor(state.z))) {
    state.vx = 0
    state.vy = 0
    state.vz = 0
    state.fallStart = state.y
    state.onGround = false
    return {
      landed: false,
      fallDamage: 0,
      inWater: false,
      headInWater: false,
      enteredWater: false,
      suspenso: true,
    }
  }

  // Estado herdado quebrado (save antigo, edição, teleporte pra dentro de
  // pedra) é consertado antes de integrar, senão toda varredura sai bloqueada e
  // o jogador fica preso no lugar sem entender por quê. Se nem subindo oito
  // blocos há saída, `preso` sobe pra quem chamou — reposicionar de verdade é
  // decisão do jogo (renascer na superfície), não da física.
  desencalhar(solidAt, state)
  const preso = collides(solidAt, state.x, state.y, state.z)

  // corpo/olhos na água
  const feetLiquid = liquidAt(Math.floor(state.x), Math.floor(state.y + 0.2), Math.floor(state.z))
  const headLiquid = liquidAt(
    Math.floor(state.x),
    Math.floor(state.y + EYE_HEIGHT),
    Math.floor(state.z),
  )
  const inWater = !input.flying && (feetLiquid || headLiquid)
  // Fração do corpo abaixo da linha d'água — a entrada do empuxo. Usa a linha
  // REAL (com o rebaixamento do mesher), não o topo do bloco: são 12 cm de
  // diferença, e é justamente na faixa em que o jogador boia que 12 cm decidem
  // se a cabeça está dentro ou fora.
  const linha = inWater ? nivelDaAgua(liquidAt, state.x, state.y, state.z) : -Infinity
  const submerso = Number.isFinite(linha)
    ? Math.max(0, Math.min(1, (linha - state.y) / PLAYER_HEIGHT))
    : 0

  // direção desejada no plano, relativa ao yaw
  let ix = input.strafe
  let iz = input.forward
  const len = Math.hypot(ix, iz)
  if (len > 1) {
    ix /= len
    iz /= len
  }
  const sin = Math.sin(input.yaw)
  const cos = Math.cos(input.yaw)
  const dirX = ix * cos - iz * sin
  const dirZ = ix * sin + iz * cos

  // ⚠️ A MORDIDA DA POÇÃO DE VELOCIDADE ENTRA AQUI, e vale pros três casos —
  // andar, nadar e voar. Multiplicar só o andar faria a poção sumir ao entrar
  // na água, e "bebi e não mudou nada" é indistinguível de defeito. O número
  // mora em `efeitos.js`; aqui só se multiplica.
  //
  // `?? 1` e não `|| 1`: um dia um efeito pode valer 0,25, e `|| 1` devolveria
  // 1 para qualquer valor falsy que aparecesse por engano — inclusive 0.
  const mult = input.multVelocidade ?? 1
  let speed
  if (input.flying) speed = FLY_SPEED * (input.sprint ? FLY_SPRINT : 1)
  else if (inWater) speed = SWIM_SPEED
  else speed = WALK_SPEED * (input.sprint ? SPRINT_MULT : 1) * (input.sneak ? SNEAK_MULT : 1)
  speed *= mult

  const wantX = dirX * speed
  const wantZ = dirZ * speed

  // No chão o controle é total; no ar só uma fração (inércia), que é o que dá
  // peso ao pulo em vez do movimento "sobre trilhos".
  const control = input.flying || state.onGround || inWater ? 1 : AIR_CONTROL
  state.vx += (wantX - state.vx) * control
  state.vz += (wantZ - state.vz) * control

  // vertical
  // No voo o deslocamento vertical vira DELTA, não escrita direta em state.y.
  // Escrevendo direto, o eixo Y pulava o sweep lá embaixo e o jogador
  // atravessava o chão voando pra baixo: voo sem colisão nenhuma.
  let flyDy = 0
  if (input.flying) {
    state.vy = 0
    if (input.jump) flyDy += speed * dtc
    if (input.sneak) flyDy -= speed * dtc
  } else if (inWater) {
    // EMPUXO DE ARQUIMEDES. Ver o cabeçalho de FLUTUACAO: a aceleração vem da
    // fração submersa, então boiar, afundar e o balanço na superfície são todos
    // a mesma equação em regimes diferentes — não três casos escritos à mão.
    // ⚠️ O EMPUXO AFROUXA QUANDO O CORPO SOME DENTRO D'ÁGUA.
    //
    // Com `FLUTUACAO` valendo 2,3 em toda profundidade, soltar o botão de
    // mergulhar disparava o jogador de volta pra superfície a ~8,7 m/s: a sonda
    // mediu a descida funcionando (7 blocos em 2,8 s) e a foto seguinte, 1,3 s
    // depois, saiu com o jogador BOIANDO de novo. Dava pra mergulhar e não dava
    // pra FICAR — que é o que "poder mergulhar" quer dizer na prática.
    //
    // A saída não é baixar `FLUTUACAO`: ela é a rodada inteira de balanço na
    // superfície, e o founder gostou dela. É reparar que os dois regimes são
    // fisicamente diferentes. Um corpo na LINHA D'ÁGUA tem empuxo variável, e é
    // isso que produz o balanço. Um corpo INTEIRAMENTE submerso não tem mais
    // linha pra variar: o empuxo vira constante e, num nadador, quase neutro.
    // `1,02` deixa uma deriva de ~0,13 m/s pra cima — imperceptível no minuto
    // do mergulho, e ainda assim traz de volta quem largou o controle.
    const afundadoDeVez = Math.max(
      0,
      Math.min(1, (linha - (state.y + PLAYER_HEIGHT)) / PROFUNDIDADE_NEUTRA),
    )
    const flutuacao = FLUTUACAO * (1 - afundadoDeVez) + FLUTUACAO_SUBMERSO * afundadoDeVez
    state.vy += (submerso * flutuacao - 1) * GRAVITY * dtc
    state.vy *= 1 - Math.min(0.9, ARRASTO_VERTICAL * submerso * dtc)
    if (state.vy < -6) state.vy = -6
    // Subir vence descer quando as duas entradas vêm juntas: no teclado é fácil
    // ficar com Shift preso de andar agachado, e nesse caso quem pediu Espaço
    // quer ar, não fundo.
    if (input.sneak) state.vy = SWIM_DOWN
    if (input.jump) state.vy = SWIM_UP
    state.fallStart = state.y
  } else {
    state.vy -= GRAVITY * dtc
    if (state.vy < TERMINAL_V) state.vy = TERMINAL_V
    if (input.jump && state.onGround) {
      state.vy = JUMP_VELOCITY
      state.onGround = false
      state.fallStart = state.y
    }
  }

  const pos = { x: state.x, y: state.y, z: state.z }
  const wasGround = state.onGround
  const stepH = input.autoJump === false ? STEP_HEIGHT : AUTO_STEP_HEIGHT

  // AGACHADO NÃO CAI DA BORDA.
  //
  // É o gesto que todo jogador do gênero tenta no primeiro minuto: agachar pra
  // colocar bloco pra fora de uma ponte sem despencar. Sem isso, construir
  // beiral é um passeio de fé.
  //
  // A guarda é por EIXO, e é por isso que ela funciona: andar paralelo à borda
  // continua livre, só o passo que tira o pé do apoio é vetado. Vale só no
  // chão e fora do voo — agachar no ar é descer, não frear.
  const travarBorda = input.sneak && wasGround && !input.flying && !inWater
  const antesX = pos.x
  const antesZ = pos.z

  // Empurrão de pancada: velocidade PRÓPRIA, somada ao passo e decaindo
  // sozinha. Ver `empurrar` em `mobs.js` pra o porquê de não ser `vx`.
  const kf = Math.exp(-6 * dtc)
  state.kx = Math.abs((state.kx || 0) * kf) < 0.01 ? 0 : (state.kx || 0) * kf
  state.kz = Math.abs((state.kz || 0) * kf) < 0.01 ? 0 : (state.kz || 0) * kf
  const passoX = (state.vx + state.kx) * dtc
  const passoZ = (state.vz + state.kz) * dtc

  // ── X ────────────────────────────────────────────────────────────────────
  const rx = sweep(solidAt, pos, 'x', passoX)
  if (rx.blocked && !degrau(solidAt, pos, 'x', passoX - rx.moved, stepH, wasGround, input)) {
    state.vx = 0
    state.kx = 0
  }
  if (travarBorda && !temApoio(solidAt, pos.x, pos.y, pos.z)) {
    pos.x = antesX
    state.vx = 0
  }

  // ── Z ────────────────────────────────────────────────────────────────────
  const rz = sweep(solidAt, pos, 'z', passoZ)
  if (rz.blocked && !degrau(solidAt, pos, 'z', passoZ - rz.moved, stepH, wasGround, input)) {
    state.vz = 0
    state.kz = 0
  }
  if (travarBorda && !temApoio(solidAt, pos.x, pos.y, pos.z)) {
    pos.z = antesZ
    state.vz = 0
  }

  // ── Y ────────────────────────────────────────────────────────────────────
  let landed = false
  let fallDamage = 0
  // Altura da queda que ACABOU de terminar. O jogo usa isto pra separar
  // "desceu um degrau andando" de "caiu": descer terreno irregular reencosta o
  // pé no chão a cada frame, e sem essa distinção cada ondulação do relevo
  // vira um baque de aterrissagem em cima da cadência normal de passo.
  let queda = 0
  if (!input.flying) {
    const ry = sweep(solidAt, pos, 'y', state.vy * dtc)
    if (ry.blocked) {
      if (state.vy < 0) {
        // ⚠️ `landed` é a TRANSIÇÃO ar→chão, não "está apoiado".
        //
        // Parado em pé, a gravidade acelera o corpo pra baixo TODO frame e a
        // varredura barra TODO frame — então `landed = true` aqui disparava
        // sessenta vezes por segundo com o jogador imóvel. Quem consome isso é
        // o som de passo, e foi exatamente o que o founder ouviu (2026-08-22):
        // "mesmo parado o som de passo fica tocando".
        //
        // O contato exato que eu introduzi no passe anterior (pé em `floor(py)`
        // sem folga) PIOROU o sintoma: antes o jogador repousava um décimo de
        // milímetro abaixo da superfície e a varredura às vezes não barrava.
        // Consertar o contato deixou o defeito de cadência tocar limpo.
        landed = !wasGround
        state.onGround = true
        const fell = (state.fallStart ?? pos.y) - pos.y
        if (landed) {
          queda = Math.max(0, fell)
          if (fell > 3.5 && !inWater) fallDamage = Math.floor(fell - 3)
        }
        state.fallStart = pos.y
      }
      state.vy = 0
    } else {
      state.onGround = false
      if (state.vy > 0) state.fallStart = pos.y
    }
  } else {
    // Voar COLIDE. Antes este ramo fazia `pos.y = state.y` e o eixo Y saía do
    // sweep inteiro: dava pra descer atravessando o chão e sair por baixo do
    // mundo. Agora o voo usa a mesma varredura dos outros eixos.
    sweep(solidAt, pos, 'y', flyDy)
    state.onGround = false
    state.fallStart = pos.y
  }

  // arrasto horizontal
  const drag = input.flying ? 0.86 : inWater ? 0.82 : state.onGround ? 0.74 : 0.94
  state.vx *= drag
  state.vz *= drag
  if (Math.abs(state.vx) < 0.001) state.vx = 0
  if (Math.abs(state.vz) < 0.001) state.vz = 0

  state.x = pos.x
  state.y = pos.y
  state.z = pos.z
  if (state.onGround) state.fallStart = state.y

  // TRANSIÇÃO pra dentro d'água, não o estado: o splash tem que tocar uma vez ao
  // entrar, não 60×/s enquanto o jogador boia.
  const enteredWater = inWater && !state.inWater
  state.inWater = inWater
  return { landed, queda, fallDamage, inWater, headInWater: headLiquid, enteredWater, preso }
}

// O jogador está de pé sobre qual bloco? (som de passo, partícula)
export function groundBlock(blockAt, state) {
  return blockAt(Math.floor(state.x), Math.floor(state.y - 0.1), Math.floor(state.z))
}

// Encontra um lugar seguro pra nascer a partir de um palpite: sobe até achar
// espaço com 2 blocos de ar sobre chão sólido. Devolve null se não achar.
// Onde o jogador PODE ficar de pé nesta coluna, procurando de cima pra baixo a
// partir do topo real. `safeSpawn` varre de baixo pra cima e devolve a primeira
// bolha de ar - que dentro de uma caverna é o TETO DA CAVERNA, não a superfície.
// Esta aqui devolve o chão de verdade, e é a que o jogo usa pra pousar o
// jogador ao sair do menu.
//
// Por que existe: ao entrar no jogo o jogador caía de ~40 blocos e morria de
// dano de queda antes de dar o primeiro passo (relato do founder, 2026-08-20).
export function landingSpot(solidAt, x, z, topHint = 120, minY = 1, apoioValido = null) {
  const gx = Math.floor(x)
  const gz = Math.floor(z)
  // O teto da busca é o da DIMENSÃO, não o 126 que estava cravado aqui: num
  // mundo de outro tamanho aquele número procuraria fora do mundo, ou pararia
  // dezenas de blocos antes do topo sem nada acusar.
  const topo = Math.min(tetoDeCorpo(), Math.max(minY + 2, Math.floor(topHint) + 2))
  for (let y = topo; y > minY; y--) {
    // chão sólido embaixo e DOIS blocos de ar pro corpo (1,8 de altura)
    if (solidAt(gx, y - 1, gz) && !solidAt(gx, y, gz) && !solidAt(gx, y + 1, gz)) {
      // Folha COLIDE, então o primeiro apoio de cima pra baixo costuma ser a
      // copa de uma árvore - e nascer em cima de uma árvore é a mesma primeira
      // impressão ruim que nascer no ar (QA de 2026-08-20). Quem sabe o que é
      // folha é a camada de blocos, não a física: por isso o predicado é do
      // chamador.
      if (apoioValido && !apoioValido(gx, y - 1, gz)) continue
      return { x: gx + 0.5, y, z: gz + 0.5 }
    }
  }
  return null
}

/**
 * Melhor DIREÇÃO pra olhar a partir de um ponto: a que tem mais céu aberto.
 *
 * Nasce de um print do QA (2026-08-20): o pouso estava correto - chão sólido,
 * vida cheia, sem dano de queda - e mesmo assim o primeiro frame do jogo era
 * uma parede de terra a meio metro do nariz, porque o yaw tinha ficado no que
 * estava. Pousar certo e olhar pra um barranco é a mesma primeira impressão
 * ruim de cair do céu.
 *
 * Lança 8 raios no nível dos olhos e conta ar. Empate resolve pelo que tem mais
 * ar ACIMA da linha (horizonte livre), que é o que separa "campo aberto" de
 * "corredor entre dois morros".
 *
 * @returns {number} yaw em radianos (a mesma convenção do jogo: x=sin, z=-cos)
 */
export function melhorVista(solidAt, x, y, z, alcance = 14) {
  const gx = Math.floor(x)
  const gy = Math.floor(y) + 1 // altura dos olhos
  const gz = Math.floor(z)
  let melhorYaw = 0
  let melhorNota = -1
  for (let i = 0; i < 8; i++) {
    const yaw = (i * Math.PI) / 4
    const dx = Math.sin(yaw)
    const dz = -Math.cos(yaw)
    let nota = 0
    for (let d = 1; d <= alcance; d++) {
      const px = Math.round(gx + dx * d)
      const pz = Math.round(gz + dz * d)
      if (solidAt(px, gy, pz)) break
      // ar na linha vale 1; ar logo acima vale mais - é horizonte, não túnel
      nota += 1 + (solidAt(px, gy + 2, pz) ? 0 : 0.6)
    }
    if (nota > melhorNota) {
      melhorNota = nota
      melhorYaw = yaw
    }
  }
  return melhorYaw
}

export function safeSpawn(solidAt, x, z, fromY, maxY = limites().maxY) {
  for (let y = Math.max(1, Math.floor(fromY)); y < maxY - 2; y++) {
    if (
      solidAt(Math.floor(x), y - 1, Math.floor(z)) &&
      !solidAt(Math.floor(x), y, Math.floor(z)) &&
      !solidAt(Math.floor(x), y + 1, Math.floor(z))
    ) {
      return { x, y, z }
    }
  }
  return null
}
