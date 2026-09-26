// RoqueCraft — AS LENTES: o que muda quando o olho se mexe e o que fica longe.
//
// Duas coisas que o founder pediu em 15/09/2026, e uma correção do que ele
// achava que faltava:
//
//  · **FOV ao correr JÁ EXISTIA** (`camera.js`), +7,5% entrando em 0,16 s. A
//    névoa de distância também (60 a 200 blocos, recuando de madrugada). Não
//    havia o que construir ali — havia o que medir antes de construir.
//  · **DESFOQUE DE PROFUNDIDADE**: o que está longe sai de foco.
//  · **BORRÃO AO VIRAR A CÂMERA**: girar rápido arrasta a imagem.
//
// ⚠️ SÓ NO DESKTOP, e isso é decisão do founder registrada, não omissão. O
// perfil do iPhone dele é o `medium`, que tem `bloom`, `godRays` e `ssao` em
// `false` DE PROPÓSITO: passe de shader ali é exatamente o que a regra da casa
// proíbe sem evidência no aparelho-alvo, e "verde no desktop não é verde no
// iPhone" já derrubou este jogo uma vez. `q.lentes` fica ligado em `high` e
// `ultra` e desligado no resto — o celular não recebe nem o custo nem o risco.
//
// ⚠️ E A REGRA MORA AQUI, SEPARADA DO SHADER. O GLSL só roda na GPU e só se
// julga por foto; o QUANTO borrar, QUANDO borrar e o que fazer com o giro são
// contas, e conta se afirma num teste. Foi assim que o borrão d'água nasceu, e
// é o que impede "liguei o efeito" de virar evidência de que ele funciona.

import * as THREE from 'three'

// ── O BORRÃO AO VIRAR ───────────────────────────────────────────────────────

/**
 * Abaixo disto o giro é mão parada, e borrar seria ruído.
 *
 * ⚠️ O LIMIAR NÃO É ENFEITE: sem ele, o tremor de um mouse apoiado na mesa
 * (décimos de grau por quadro) já borra a tela, e o jogador vê uma imagem suja
 * sem saber por quê. 1,2 rad/s ≈ 69°/s — meia volta de cabeça em dois segundos
 * e meio.
 */
export const GIRO_MINIMO = 1.2

/** Acima disto o borrão já está no teto: girar mais rápido não suja mais. */
export const GIRO_CHEIO = 9.0

/** O quanto a imagem arrasta, em fração de tela, no giro cheio. */
export const BORRAO_MAXIMO = 0.016

/**
 * Constante de tempo da subida e da descida do borrão.
 *
 * ⚠️ SEM SUAVIZAÇÃO O EFEITO PISCA. A velocidade angular de um quadro é ruidosa
 * (um mouse entrega passos irregulares), e ligar/desligar o borrão quadro a
 * quadro lê como defeito de render, não como movimento. É a mesma mola do FOV
 * de corrida em `camera.js`, e de propósito: dois efeitos que respondem ao mesmo
 * gesto com tempos diferentes brigam entre si.
 */
export const TAU_BORRAO = 0.09

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

/**
 * Quanto borrar AGORA, dada a velocidade angular do olhar.
 *
 * @param giro rad/s (o módulo, já somando yaw e pitch)
 * @returns 0..1
 */
export function alvoDoBorrao(giro) {
  // ⚠️ O `Number.isFinite` FICA, o `giro <= GIRO_MINIMO` SAIU. A versão anterior
  // tinha os dois, e um mutante provou que o segundo nunca decidia nada: abaixo
  // do limiar o numerador é negativo e o `clamp01` já devolve zero. Condição que
  // nunca decide é decoração — e decoração que parece guarda é pior, porque o
  // próximo a ler acha que existe uma regra ali. O `isFinite` não é redundante:
  // `clamp01(NaN)` devolve `NaN`, e um uniforme NaN apaga a tela inteira.
  if (!Number.isFinite(giro)) return 0
  return clamp01((giro - GIRO_MINIMO) / (GIRO_CHEIO - GIRO_MINIMO))
}

/**
 * A velocidade angular do olhar entre dois quadros.
 *
 * ⚠️ O PITCH ENTRA COM O COSSENO DO... não: entra CRU, e isso é uma escolha. Um
 * grau de pitch e um grau de yaw arrastam a mesma quantidade de pixels no meio
 * da tela, que é onde o olho está. Corrigir por latitude é conta de globo, e
 * aqui a tela é plana.
 */
export function giroDoOlhar(dYaw, dPitch, dt) {
  if (!(dt > 0)) return 0
  // O yaw dá volta: um giro de 359° é -1°, e sem isto uma volta completa vira
  // um pico de borrão que some no quadro seguinte.
  let y = dYaw
  while (y > Math.PI) y -= Math.PI * 2
  while (y < -Math.PI) y += Math.PI * 2
  return Math.hypot(y, dPitch) / dt
}

/** Passo da mola: aproxima `atual` de `alvo` com a constante de tempo `tau`. */
export function passoDoBorrao(atual, alvo, dt, tau = TAU_BORRAO) {
  if (!(dt > 0) || !(tau > 0)) return alvo
  const k = 1 - Math.exp(-dt / tau)
  return atual + (alvo - atual) * k
}

/**
 * A DIREÇÃO em que o kernel colhe, em UV — que é a direção em que a IMAGEM ANDA.
 *
 * ⚠️ ESTE SINAL JÁ ESTEVE INVERTIDO, E A PRIMEIRA VERSÃO DESTE COMENTÁRIO
 * DEFENDIA O ERRO com uma frase que soa óbvia: "girar para a direita arrasta a
 * imagem para a esquerda, então o borrão vai contra o olhar". A frase está
 * certa e a conclusão não: o que vai contra o olhar é a IMAGEM, e o kernel
 * colhe justamente na direção da imagem.
 *
 * A conta que decide, e não a intuição: um quadro com borrão de movimento é a
 * MÉDIA da exposição, isto é, a média dos quadros recentes. Se a imagem anda
 * `m` por quadro, um traço que agora está em `q` estava em `q - m` antes —
 * ou seja `anterior(p) = agora(p + m)`. A exposição é
 * `∫ anterior_s(p) ds = ∫ agora(p + m·s) ds`, e o shader colhe exatamente
 * `agora(vUv + uDirecao·uForca·s)`. Logo `uDirecao` É `m` normalizado.
 *
 * ⚠️ E `m` NÃO SE DEDUZ DO YAW DO JOGO. A sonda mediu, projetando um ponto fixo
 * do mundo antes e depois de um giro: com o yaw do jogo subindo 0,05, o euler
 * da câmera cai 0,05 e a imagem anda -0,0198 em u. Ou seja `m.x` tem o MESMO
 * sinal de `dYaw` (que aqui é o delta do euler, que é o que o engine mede). No
 * eixo vertical o sinal é oposto: o `v` do `projetar` cresce para BAIXO e o `y`
 * da UV cresce para CIMA, e a sonda mediu `dv = +0,0346` para `dPitch = +0,05`.
 *
 * `qa-roquecraft-lentes.mjs` afere isto contra o movimento MEDIDO da imagem, e
 * não contra esta prosa — se um dia o jogo trocar a convenção do yaw, quem
 * acusa é a sonda.
 *
 * @param dYaw   delta do euler Y da câmera entre dois quadros
 * @param dPitch delta do euler X da câmera entre dois quadros
 */
export function direcaoDoBorrao(dYaw, dPitch) {
  const n = Math.hypot(dYaw, dPitch)
  if (!(n > 0)) return { x: 0, y: 0 }
  return { x: dYaw / n, y: -dPitch / n }
}

// ── O DESFOQUE DE PROFUNDIDADE ──────────────────────────────────────────────

/**
 * Até onde tudo está em foco, em blocos.
 *
 * ⚠️ O PLANO DE FOCO É FIXO E LONGE, e não acompanha o que está sob a mira.
 * Foco automático num jogo em primeira pessoa é náusea: a cena inteira respira
 * a cada vez que o jogador passa o olho por uma parede. O que se quer aqui é
 * profundidade — o fundo cede, o que está ao alcance da mão fica nítido.
 */
export const FOCO_ATE = 28

/** Onde o desfoque chega ao máximo. Depois disto, não piora. */
export const DESFOQUE_CHEIO_EM = 150

/** Raio máximo do desfoque, em fração de tela. */
export const DESFOQUE_MAXIMO = 0.0042

/**
 * Quanto desfoque uma coisa a esta distância recebe, de 0 a 1.
 *
 * ⚠️ A CURVA É QUADRÁTICA, e não reta. Com rampa linear o desfoque aparece cedo
 * demais no meio-campo: a 60 blocos, onde o jogador ainda reconhece um aldeão,
 * a reta já entrega 26% do borrão. A quadrática entrega 7% ali e guarda o efeito
 * para o fundo de verdade, que é o que a palavra "profundidade" promete.
 */
export function desfoqueEm(distancia) {
  if (!Number.isFinite(distancia) || distancia <= FOCO_ATE) return 0
  const t = clamp01((distancia - FOCO_ATE) / (DESFOQUE_CHEIO_EM - FOCO_ATE))
  return t * t
}

/**
 * O shader do borrão direcional. Oito amostras: o bastante para arrastar sem
 * virar fantasma, e barato o suficiente para caber ao lado do bloom.
 */
export const BORRAO_DO_GIRO_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uForca: { value: 0 },
    uDirecao: { value: new THREE.Vector2(0, 0) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uForca;
    uniform vec2 uDirecao;
    varying vec2 vUv;
    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      if (uForca <= 0.0005) { gl_FragColor = base; return; }
      vec2 passo = uDirecao * uForca;
      vec3 acc = base.rgb;
      // ⚠️ O CENTRO DA TELA BORRA MENOS. É onde a mira está e onde o olho
      // repousa; borrar o centro tanto quanto a borda faz o jogador perder o
      // alvo ao girar, e aí o efeito vira desvantagem competitiva em vez de
      // sensação de velocidade.
      float peso = smoothstep(0.05, 0.55, length(vUv - vec2(0.5)));
      for (int i = 1; i <= 7; i++) {
        float f = float(i) / 7.0;
        acc += texture2D(tDiffuse, vUv + passo * f * peso).rgb;
      }
      gl_FragColor = vec4(acc / 8.0, base.a);
    }
  `,
}

/**
 * O shader do desfoque de profundidade.
 *
 * ⚠️ LÊ A PROFUNDIDADE DO BUFFER, e não a névoa. Usar a névoa como pista de
 * distância seria mais barato e estaria errado de duas formas: a névoa muda com
 * a hora do dia (de madrugada ela sobe), então o foco mudaria sozinho à noite; e
 * ela não existe debaixo d'água nem no Nether.
 */
export const DESFOQUE_DE_PROFUNDIDADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    uNear: { value: 0.1 },
    uFar: { value: 400 },
    uFocoAte: { value: FOCO_ATE },
    uCheioEm: { value: DESFOQUE_CHEIO_EM },
    uRaio: { value: DESFOQUE_MAXIMO },
    uAspecto: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    #include <packing>
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform float uNear;
    uniform float uFar;
    uniform float uFocoAte;
    uniform float uCheioEm;
    uniform float uRaio;
    uniform float uAspecto;
    varying vec2 vUv;

    float distanciaEm(vec2 uv) {
      float z = texture2D(tDepth, uv).x;
      float vz = perspectiveDepthToViewZ(z, uNear, uFar);
      return -vz;
    }

    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      if (uRaio <= 0.0) { gl_FragColor = base; return; }
      float d = distanciaEm(vUv);
      float t = clamp((d - uFocoAte) / max(1.0, uCheioEm - uFocoAte), 0.0, 1.0);
      // A MESMA curva quadrática da funcao desfoqueEm, que tem teste de unidade.
      float f = t * t;
      if (f <= 0.002) { gl_FragColor = base; return; }
      float r = uRaio * f;
      vec2 e = vec2(r / uAspecto, r);
      vec3 acc = base.rgb;
      // Oito vizinhos num anel. Um kernel gaussiano seria mais bonito e custaria
      // três vezes mais amostras para uma diferença que ninguém vê no fundo.
      acc += texture2D(tDiffuse, vUv + vec2( e.x, 0.0)).rgb;
      acc += texture2D(tDiffuse, vUv + vec2(-e.x, 0.0)).rgb;
      acc += texture2D(tDiffuse, vUv + vec2( 0.0, e.y)).rgb;
      acc += texture2D(tDiffuse, vUv + vec2( 0.0,-e.y)).rgb;
      acc += texture2D(tDiffuse, vUv + vec2( e.x, e.y) * 0.7).rgb;
      acc += texture2D(tDiffuse, vUv + vec2(-e.x, e.y) * 0.7).rgb;
      acc += texture2D(tDiffuse, vUv + vec2( e.x,-e.y) * 0.7).rgb;
      acc += texture2D(tDiffuse, vUv + vec2(-e.x,-e.y) * 0.7).rgb;
      gl_FragColor = vec4(acc / 9.0, base.a);
    }
  `,
}
