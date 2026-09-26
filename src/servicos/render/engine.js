// RoqueCraft - motor de renderização.
//
// Responsável por: renderer + perfis de qualidade, câmera, névoa, o par de luzes
// (sol/lua direcional com sombra + ambiente), o céu, o registro de malhas de
// seção, a cadeia de pós-processamento e o passo de frame.
//
// PERFIS (regra 36-games, obrigatória): efeito bonito no desktop MATA o iPhone.
// `ultra` e `high` ligam sombra, SSAO, bloom e raios de sol; `low` (ponteiro
// grosso ou `html[data-low-end="1"]`) corta a cadeia inteira, desliga sombra e
// normal map, limita o pixelRatio e reduz a distância de renderização. O init é
// TODO guardado por try/catch: sem contexto WebGL o jogo mostra erro com botão
// de tentar de novo, nunca fica preso no "carregando".

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { createSky } from './sky.js'
import {
  createVoxelMaterials,
  updateVoxelUniforms,
  geometryFromBuffers,
  emitirOndulacao,
} from './voxelMaterial.js'
import { createViewModel } from './viewmodel.js'
import { criarDestaque } from './destaque.js'
import { criarBlocosCaindo } from './blocosCaindo.js'
import { criarChuva } from './chuva.js'
import { sunDirection, moonDirection, moonPhase, skyLightFactor, dayFactor } from '../daycycle.js'
import { CHUNK_SIZE, SECTION_HEIGHT } from '../constants.js'
import { paletaDaDimensao, rigDaDimensao } from '../ceuDaDimensao.js'
import { DIMENSAO_PADRAO } from '../dimensoes.js'
import { luzSobChuva, relampagoEm } from '../clima.js'
import {
  BORRAO_DO_GIRO_SHADER,
  BORRAO_MAXIMO,
  DESFOQUE_DE_PROFUNDIDADE_SHADER,
  alvoDoBorrao,
  direcaoDoBorrao,
  giroDoOlhar,
  passoDoBorrao,
} from './lentes.js'

// ⚠️ `shadowRadius` ENCOLHEU EM 25% NOS TRÊS PERFIS (46→34, 38→30, 30→24) e o
// `shadowSize` NÃO subiu — foi o pedido, e a razão é aritmética: o frustum é
// quadrado de lado 2R e o mapa tem `shadowSize` texels, então a resolução é
// 2R/shadowSize blocos por texel. No ultra eram 92/2048 = 0,045 bloco por
// texel; agora são 68/2048 = 0,033. Um terço mais fino sem custar um pixel de
// memória, e é essa finura que faz a sombra encostar no pé do bloco.
//
// O preço é alcance: a sombra deixa de ser desenhada um pouco mais perto. O
// frustum continua empurrado pra frente do olhar (ver `_shadowCenter`), que é o
// que impede o defeito de 2026-08-19 — metade do mapa caindo atrás das costas.
/**
 * O SSAO roda neste quadro?
 *
 * Função pura e exportada para poder ser TESTADA. A regra vive no laço de
 * desenho, mas a decisão é uma linha de lógica, e linha de lógica escondida
 * dentro de um laço que precisa de WebGL é linha que nenhum teste alcança.
 *
 * `querSsao` é a vontade (perfil de qualidade ou botão de QA); `submerso` é o
 * estado do mundo. Ver a nota longa no laço sobre por que a segunda manda.
 */
export const ssaoLigado = (querSsao, submerso) => querSsao !== false && !submerso

export const QUALITY = {
  ultra: {
    shadows: true,
    shadowSize: 2048,
    shadowRadius: 34,
    reflexo: true,
    reflexoEscala: 0.5,
    ssao: true,
    bloom: true,
    godRays: true,
    fxaa: true,
    // ⚠️ SÓ NO DESKTOP, por decisão do founder em 15/09/2026. Ver o cabeçalho de
    // `lentes.js`: o perfil do iPhone dele é o `medium`, e ali todo passe de
    // shader está desligado de propósito.
    lentes: true,
    clouds: true,
    cloudQuality: 2,
    normalMaps: true,
    renderDistance: 12,
    pixelRatio: 2,
    antialias: true,
  },
  high: {
    shadows: true,
    shadowSize: 2048,
    shadowRadius: 30,
    reflexo: true,
    reflexoEscala: 0.5,
    ssao: false,
    bloom: true,
    godRays: true,
    fxaa: true,
    lentes: true,
    clouds: true,
    cloudQuality: 2,
    normalMaps: true,
    renderDistance: 10,
    pixelRatio: 2,
    antialias: true,
  },
  medium: {
    shadows: true,
    shadowSize: 1024,
    shadowRadius: 24,
    // ⚠️ O CELULAR ENTRA AQUI. O founder joga no iPhone e o print dele TEM
    // sombra, então ele não está no perfil `low` (que desliga sombra) — está
    // neste. Deixar o reflexo só no desktop seria entregar a quem não pediu e
    // negar a quem pediu. O preço é a escala: um terço da tela em vez de
    // metade, que é um quarto dos pixels do alvo do ultra.
    reflexo: true,
    reflexoEscala: 0.34,
    ssao: false,
    bloom: false,
    godRays: false,
    lentes: false,
    fxaa: true,
    clouds: true,
    cloudQuality: 1,
    normalMaps: true,
    renderDistance: 8,
    pixelRatio: 1.75,
    antialias: true,
  },
  low: {
    shadows: false,
    shadowSize: 512,
    shadowRadius: 20,
    reflexo: false,
    reflexoEscala: 0,
    ssao: false,
    bloom: false,
    godRays: false,
    lentes: false,
    fxaa: false,
    clouds: false,
    cloudQuality: 0,
    normalMaps: false,
    renderDistance: 5,
    pixelRatio: 1.5,
    antialias: false,
  },
}

/**
 * É neve ou é chuva?
 *
 * ⚠️ Exportada porque o `>` aqui decide entre floco e gota na tela, e o caso que
 * importa é o EMPATE: com céu limpo os dois são zero, e um `>=` faria o mundo
 * inteiro nevar o tempo todo — que é o estado padrão, não um caso de borda.
 */
export const ehNeve = (clima) => (clima.neve > clima.chuva ? 1 : 0)

/**
 * Intensidade do sol depois dos ajustes de cena.
 *
 * ⚠️ `fx.sunMul ?? 1` e não `||`: o painel de FX manda `sunMul: 0` para APAGAR
 * o sol (é como o QA fotografa uma cena só com luz ambiente), e com `||` esse
 * zero viraria 1 — o sol ficaria aceso justamente na foto que existe para
 * mostrá-lo apagado. O `1 + clarao * 1.8` é o relâmpago somando por cima; com
 * `-`, um clarão forte apaga o sol em vez de estourá-lo.
 */
export const intensidadeDoSol = (base, fx = {}, perdaDeSol = 1, clarao = 0) =>
  base * (fx.sunMul ?? 1) * perdaDeSol * (1 + clarao * 1.8)

// `leve` é o `host.desempenho.modoLeve()` do jogo-sdk. Até a extração este
// arquivo lia o sinal direto do `<html data-low-end="1">` do RoqueOS; só a
// ORIGEM do sinal mudou, a decisão é a mesma.
export function detectQuality({ leve = false } = {}) {
  if (typeof window === 'undefined') return 'low'
  if (leve) return 'low'
  const coarse = window.matchMedia?.('(pointer: coarse)').matches
  const noHover = window.matchMedia?.('(hover: none)').matches
  if (coarse || noHover) return 'low'
  const mem = navigator.deviceMemory || 8
  const cores = navigator.hardwareConcurrency || 8
  if (mem <= 4 || cores <= 4) return 'medium'
  if (mem >= 8 && cores >= 8) return 'ultra'
  return 'high'
}

// Raios de sol (god rays) por borrão radial a partir da posição do sol em tela.
// Barato (um passe, 24 amostras) e é o efeito que mais "vende" um amanhecer.
const GOD_RAYS_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uSunScreen: { value: new THREE.Vector2(0.5, 0.5) },
    uIntensity: { value: 0.4 },
    uDecay: { value: 0.94 },
    // ⚠️ O CORTE VIROU UNIFORME por causa da água.
    //
    // Ele era 0.78 fixo: só pixel MUITO claro vira raio, o que no céu é o certo
    // — senão a paisagem inteira borra. Mas debaixo d'água a cena toda é escura
    // e azul, e NADA passa de 0.78: os raios sumiam justo onde o founder mais
    // queria vê-los ("raios de sol dentro do fundo da agua"). Debaixo d'água o
    // corte cai, e quem vira raio é a superfície iluminada lá em cima.
    uCorte: { value: 0.78 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uSunScreen;
    uniform float uIntensity;
    uniform float uDecay;
    uniform float uCorte;
    varying vec2 vUv;
    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      if (uIntensity <= 0.001) { gl_FragColor = base; return; }
      vec2 delta = (vUv - uSunScreen) / 24.0 * 0.9;
      vec2 uv = vUv;
      float illum = 1.0;
      vec3 acc = vec3(0.0);
      for (int i = 0; i < 24; i++) {
        uv -= delta;
        // SAIU DA TELA, PAROU.
        //
        // Era clamp(uv, 0.0, 1.0). Quando a marcha radial passa da borda, o
        // clamp faz ela reamostrar o MESMO texel de borda em todas as
        // iterações restantes, somando o mesmo pixel até 12 vezes. O resultado
        // é uma barra de luz colada na borda do quadro, apontando pra um sol
        // que não está lá - exatamente o "brilho que parte de um ponto do céu
        // onde o céu não está". Parar é o comportamento certo: fora do quadro
        // não há informação, e inventar zero é melhor que inventar o vizinho.
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
        vec3 s = texture2D(tDiffuse, uv).rgb;
        // só o que já é MUITO claro vira raio (céu e sol), não a paisagem
        float lum = max(max(s.r, s.g), s.b);
        acc += s * smoothstep(uCorte, uCorte + 0.22, lum) * illum;
        illum *= uDecay;
      }
      gl_FragColor = vec4(base.rgb + acc * (uIntensity / 24.0), base.a);
    }
  `,
}

// Borrão de ÁGUA. Um passe, nove amostras, e ele SAI DO CAMINHO quando a força
// é zero — que é o estado em terra firme, ou seja, quase sempre.
//
// Por que não um gaussiano separável de dois passes: custaria dois render
// targets a mais em todo quadro do jogo para um efeito que só aparece dentro
// d'água. Nove taps num anel com peso central resolve a "vista embaçada" que o
// founder pediu, e o desfoque de verdade quem faz é a NÉVOA por profundidade —
// o borrão só tira a nitidez de recorte que denuncia que não há água nenhuma
// entre o olho e o bloco.
const AGUA_BORRAO_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uForca: { value: 0 },
    uAspecto: { value: 1 },
    // Deslocamento lento em UV: a lâmina d'água não é uma lente parada.
    uTempo: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uForca;
    uniform float uAspecto;
    uniform float uTempo;
    varying vec2 vUv;
    void main() {
      if (uForca <= 0.001) { gl_FragColor = texture2D(tDiffuse, vUv); return; }
      // Ondulação: duas senoides cruzadas, amplitude em fração de tela. Fica
      // abaixo de meio pixel em telas pequenas de propósito - o que se quer é
      // a sensação de massa d'água, não um efeito de piscina de protetor.
      vec2 onda = vec2(
        sin(vUv.y * 18.0 + uTempo * 0.9),
        cos(vUv.x * 15.0 + uTempo * 0.7)
      ) * 0.0016 * uForca;
      vec2 c = vUv + onda;
      float r = 0.0022 * uForca;
      vec2 e = vec2(r / uAspecto, r);
      vec4 acc = texture2D(tDiffuse, c) * 0.28;
      acc += texture2D(tDiffuse, c + vec2(e.x, 0.0)) * 0.09;
      acc += texture2D(tDiffuse, c - vec2(e.x, 0.0)) * 0.09;
      acc += texture2D(tDiffuse, c + vec2(0.0, e.y)) * 0.09;
      acc += texture2D(tDiffuse, c - vec2(0.0, e.y)) * 0.09;
      acc += texture2D(tDiffuse, c + e) * 0.115;
      acc += texture2D(tDiffuse, c - e) * 0.115;
      acc += texture2D(tDiffuse, c + vec2(e.x, -e.y)) * 0.115;
      acc += texture2D(tDiffuse, c + vec2(-e.x, e.y)) * 0.115;
      gl_FragColor = acc;
    }
  `,
}

// ── ABSORÇÃO POR PROFUNDIDADE ────────────────────────────────────────────────
//
// "estou sentindo falta da sensação de profundidade da agua" — founder.
//
// A névoa de água era UMA SÓ: cor fixa, `far` fixo em 26, do primeiro palmo ao
// fundo do oceano. Estar a um bloco da superfície e estar a vinte pareciam a
// mesma coisa, e é justamente a diferença entre os dois que o olho lê como
// profundidade.
//
// Água absorve luz de forma exponencial e por comprimento de onda: o vermelho
// morre nos primeiros metros, o verde aguenta mais, o azul vai fundo. É por
// isso que o mar fica azul escuro em vez de simplesmente escuro. As duas cores
// abaixo são as pontas dessa curva, e o resto é interpolação.
const AGUA_RASA = new THREE.Color(0.07, 0.26, 0.4)
const AGUA_FUNDA = new THREE.Color(0.01, 0.05, 0.14)
/** Profundidade, em blocos, em que a coluna já engoliu quase toda a cor. */
const FUNDO_DE_REFERENCIA = 22

export async function createEngine({
  canvas,
  container,
  quality = 'high',
  textures,
  preserveDrawingBuffer = false,
}) {
  const q = QUALITY[quality] || QUALITY.high

  // ⚠️ LIMPAR O ESTADO DE UNPACK ANTES DE CRIAR O RENDERER.
  //
  // Trocar de perfil de qualidade reconstrói a engine, e a reconstrução chama
  // `new THREE.WebGLRenderer` no MESMO canvas. Um canvas só tem um contexto:
  // `getContext('webgl2')` devolve o contexto VELHO, não um novo. O renderer
  // novo herda, então, o estado de pixelStorei que o anterior deixou — e o
  // anterior deixou `UNPACK_FLIP_Y_WEBGL` LIGADO, porque a última coisa que
  // ele subiu foi uma `CanvasTexture` (a mão, o céu), e essas nascem com
  // `flipY = true`.
  //
  // A primeira coisa que o `WebGLState` do three faz no construtor é criar as
  // texturas vazias de fallback, duas delas com `texImage3D` — e texImage3D com
  // FLIP_Y ligado é `INVALID_OPERATION` pela especificação da WebGL 2. Daí os
  // dois erros de console que só o perfil `low` mostrava: `low` é o único que
  // troca de perfil de verdade no desktop, e portanto o único que reconstrói.
  //
  // Isso custou duas rodadas de LEITURA de código atrás de um `flipY = true`
  // que não existe no jogo — o valor vinha do contexto, não de nenhuma textura
  // nossa. Quem achou foi a armadilha em `scripts/lib/rc-armadilha-gl.mjs`,
  // que embrulha `texImage3D` e imprime a pilha de quem chamou.
  try {
    const glVelho = canvas?.getContext?.('webgl2')
    if (glVelho) {
      glVelho.pixelStorei(glVelho.UNPACK_FLIP_Y_WEBGL, false)
      glVelho.pixelStorei(glVelho.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    }
  } catch {
    // Canvas sem contexto ainda (primeiro boot) - é o caso limpo, segue.
  }

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: q.antialias,
    powerPreference: 'high-performance',
    // Sem isto o Chrome pode recusar contexto em GPU integrada e o init lança.
    failIfMajorPerformanceCaveat: false,
    stencil: false,
    // Só no harness de QA: sem preservar o buffer, `screenshot()` do Playwright
    // captura um frame VAZIO ou VELHO do canvas WebGL - foi o que fez as fotos
    // oscilarem entre paisagem perfeita e tela lavada durante todo o QA de
    // 2026-08-19, e mandou perseguir um bug de névoa que não existia. Em jogo
    // fica desligado: preservar o buffer custa banda de memória por frame.
    preserveDrawingBuffer,
  })
  const w = container?.clientWidth || 1280
  const h = container?.clientHeight || 720
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio))
  renderer.setSize(w, h, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.0
  // Estado do CLIMA aplicado. Fica declarado aqui, antes do laço de desenho que
  // o lê, e não junto do `setClima` lá embaixo: `const` lido antes da linha que
  // o declara é zona morta esperando alguém reordenar uma função.
  const climaAtual = {
    chuva: 0,
    neve: 0,
    cobertura: 0.36,
    tempestade: 0,
    semente: 1,
    clarao: 0,
    claraoFixo: null,
  }
  // Contagem de gotas por perfil. O celular do founder está no `medium`, e é
  // por isso que ele não leva o número do ultra: cortina de chuva é custo de
  // preenchimento (muitos pixels quase transparentes), que é justamente onde o
  // GPU de celular sofre. O `low` fica sem chuva visível — ele já não tem
  // sombra nem reflexo, e a coerência é essa.
  const GOTAS = { ultra: 3200, high: 2600, medium: 1500, low: 0 }
  const chuvaVisual = criarChuva(THREE, GOTAS[quality] ?? 1500)
  renderer.shadowMap.enabled = q.shadows
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(72, w / h, 0.08, 1400)
  camera.rotation.order = 'YXZ'

  // Névoa LINEAR, não exponencial.
  //
  // A exponencial (medida no QA de 2026-08-19) afogava a paisagem inteira: com
  // densidade calibrada pra esconder a borda do carregamento, o terreno a 60
  // blocos já vinha 30% lavado e a 150 sumia. O resultado era uma tela de bruma
  // com o céu bonito e nada embaixo.
  //
  // A linear dá controle direto: NADA de névoa até `near`, e a dissolução
  // acontece só no último terço, exatamente onde os chunks acabam.
  scene.fog = new THREE.Fog(0x9fc0e8, 60, 200)

  const ambient = new THREE.HemisphereLight(0xbcd6ff, 0x4a4335, 0.4)
  scene.add(ambient)

  const sun = new THREE.DirectionalLight(0xffffff, 3)
  sun.castShadow = q.shadows
  if (q.shadows) {
    sun.shadow.mapSize.set(q.shadowSize, q.shadowSize)
    const r = q.shadowRadius
    sun.shadow.camera.left = -r
    sun.shadow.camera.right = r
    sun.shadow.camera.top = r
    sun.shadow.camera.bottom = -r
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 420
    // ── PETER-PANNING: a sombra descolava da base do bloco ──────────────────
    //
    // Relato do founder (25/08/2026): a sombra sai afastada do pé do bloco e o
    // contato fica sem sombra, pior com sol baixo. Medido ANTES de mexer:
    // `bias = -0.0006`, `normalBias = 0.055`, `radius` nunca escrito (o three
    // deixa em 1), mapa 2048 e frustum de ±46 blocos — 0,045 bloco por texel.
    //
    // ⚠️ O CULPADO PRINCIPAL É O `normalBias`. Ele empurra o ponto de consulta
    // ao longo da NORMAL antes de comparar profundidade: 0,055 são cinco
    // centímetros e meio de bloco, e é exatamente esse tanto que a sombra anda
    // pra longe do contato. O `bias` negativo soma no mesmo sentido.
    //
    // Com a projeção saindo da face de TRÁS (ver `shadowSide` em
    // `voxelMaterial.js`), o acne de sombra que esses dois vieram combater não
    // acontece na geometria fechada do voxel — então dá pra zerar o `bias` e
    // deixar no `normalBias` só o mínimo que segura o serrilhado das quinas.
    sun.shadow.bias = 0
    sun.shadow.normalBias = 0.02
    // Escrito de propósito, mesmo sendo o mesmo do padrão: `radius` é o raio do
    // borrão do PCF, e um valor alto reabre o descolamento por outro caminho.
    // Sem esta linha, o número dependia de um padrão de biblioteca.
    sun.shadow.radius = 2
  }
  scene.add(sun)
  scene.add(sun.target)

  // `cloudQuality`: 2 = cúmulo + cirro (7 oitavas), 1 = só cúmulo (4). O cirro
  // é o que separa "tem nuvem" de "tem céu", mas custa 3 oitavas de ruído por
  // pixel de céu — no perfil médio ele sai.
  const sky = createSky({ clouds: q.clouds, cloudQuality: q.cloudQuality ?? 2 })
  scene.add(sky.group)

  const materials = createVoxelMaterials(textures, { quality })
  // Força do vento DO PERFIL, guardada uma vez. `setFx({wind:false})` zera o
  // uniforme e `setFx({wind:true})` precisa saber pra onde voltar — sem isto o
  // controle da sonda restauraria o valor errado no perfil baixo.
  const forcaDoVento = materials.shared.uWindStrength.value
  // Sombra recortada da folhagem, ligada. Vira chave pro QA poder fazer o A/B
  // NUMA RODADA SÓ: comparar dois builds diferentes acrescenta mob que andou,
  // nuvem que passou e relógio que correu à diferença que se quer medir. Foi
  // exatamente o que aconteceu na primeira tentativa desta medida.
  let sombraFolha = true
  // Mão em primeira pessoa: cena PRÓPRIA desenhada depois do mundo (senão o
  // bloco à frente corta a mão ao meio).
  const viewmodel = createViewModel(renderer)
  viewmodel.setBlockMaterial(materials.opaque)
  // O aspecto TEM que ser dado agora. Nascendo em 1 e só corrigindo no primeiro
  // resize, a mão fica fora do quadro numa tela larga - e "a mão não aparece"
  // parece bug de render, não de câmera (QA de 2026-08-20).
  viewmodel.resize(camera.aspect)

  // ── Registro de malhas de seção ───────────────────────────────────────────
  // "cx,sy,cz" → { opaque?, cutout?, transparent? } (THREE.Mesh)
  const sectionMeshes = new Map()
  const solidGroup = new THREE.Group()
  const waterGroup = new THREE.Group()
  scene.add(solidGroup)
  scene.add(waterGroup)

  function disposeSection(entry) {
    for (const key of ['opaque', 'cutout', 'transparent']) {
      const m = entry[key]
      if (!m) continue
      m.parent?.remove(m)
      m.geometry.dispose()
    }
  }

  function setSection(cx, sy, cz, buffers) {
    const key = `${cx},${sy},${cz}`
    const old = sectionMeshes.get(key)
    if (old) disposeSection(old)
    const entry = {}
    const add = (name, mat, group, order) => {
      const g = buffers[name]
      if (!g || !g.count) return
      const mesh = new THREE.Mesh(geometryFromBuffers(g), mat)
      // Folha e grama precisam do material de profundidade PRÓPRIO, senão a
      // sombra delas é a da caixa inteira. Ver `depthCutout` no voxelMaterial.
      if (name === 'cutout' && sombraFolha) mesh.customDepthMaterial = materials.depthCutout
      mesh.castShadow = q.shadows && name !== 'transparent'
      mesh.receiveShadow = q.shadows
      mesh.renderOrder = order
      mesh.matrixAutoUpdate = false
      mesh.updateMatrix()
      group.add(mesh)
      entry[name] = mesh
    }
    add('opaque', materials.opaque, solidGroup, 0)
    add('cutout', materials.cutout, solidGroup, 1)
    add('transparent', materials.transparent, waterGroup, 2)
    if (Object.keys(entry).length) sectionMeshes.set(key, entry)
    else sectionMeshes.delete(key)
  }

  function removeChunk(cx, cz) {
    for (const key of [...sectionMeshes.keys()]) {
      const [kx, , kz] = key.split(',')
      if (Number(kx) === cx && Number(kz) === cz) {
        disposeSection(sectionMeshes.get(key))
        sectionMeshes.delete(key)
      }
    }
  }

  // ── Destaque do bloco mirado ──────────────────────────────────────────────
  //
  // Mora em `destaque.js` desde a rodada 9 — o contorno agora segue a FORMA do
  // bloco (laje, escada, cama), e a razão de cada decisão de geometria está
  // escrita lá, junto do código que a paga.
  scene.add(chuvaVisual.grupo)

  const destaque = criarDestaque(THREE, mergeGeometries)
  const highlight = destaque.grupo
  scene.add(highlight)

  // Blocos caindo (areia, cascalho). Material do mundo: a areia no ar tem que
  // ser a MESMA areia, com a mesma textura e a mesma luz do dia.
  const blocosCaindo = criarBlocosCaindo(THREE, materials.opaque)
  scene.add(blocosCaindo.grupo)

  // Sobreposição de rachadura ao minerar (10 estágios desenhados por opacidade)
  const crack = new THREE.Mesh(
    new THREE.BoxGeometry(1.005, 1.005, 1.005),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
  )
  crack.visible = false
  scene.add(crack)

  // FANTASMA DO BLOCO A COLOCAR.
  //
  // O contorno mostra o bloco MIRADO; o bloco novo entra na FACE dele, e qual
  // face é depende do ângulo — que é o erro de construção mais comum que
  // existe. Um cubo translúcido no lugar exato onde ele vai entrar remove a
  // adivinhação.
  //
  // `depthWrite: false` e um pouco menor que o cubo: sem isso ele briga em
  // profundidade com o bloco atrás e pisca. Não escreve depth, então nunca
  // esconde nada.
  const fantasma = new THREE.Mesh(
    new THREE.BoxGeometry(0.96, 0.96, 0.96),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    }),
  )
  fantasma.renderOrder = 3
  fantasma.visible = false
  scene.add(fantasma)

  // ── Pós-processamento ─────────────────────────────────────────────────────
  let composer = null
  let bloomPass = null
  let godRaysPass = null
  let borraoAguaPass = null
  let dofPass = null
  let borraoDoGiroPass = null
  /** A profundidade da cena. Mora no alvo PRÓPRIO, fora do pingue-pongue. */
  let depthDaCena = null
  /** O alvo em que a cena é desenhada quando há lente. Nunca é alvo do composer. */
  let alvoDaCena = null
  /** O borrão do giro é uma MOLA: guarda o valor entre quadros. Ver `lentes.js`. */
  let borraoAtual = 0
  const _euler = new THREE.Euler(0, 0, 0, 'YXZ')
  let fxaaPass = null
  let ssaoPass = null

  async function setupPost() {
    if (!q.bloom && !q.fxaa && !q.ssao && !q.godRays && !q.lentes) return
    try {
      const [
        { EffectComposer },
        { RenderPass },
        { ShaderPass },
        { OutputPass },
        { Pass, FullScreenQuad },
        { CopyShader },
      ] = await Promise.all([
        import('three/examples/jsm/postprocessing/EffectComposer.js'),
        import('three/examples/jsm/postprocessing/RenderPass.js'),
        import('three/examples/jsm/postprocessing/ShaderPass.js'),
        import('three/examples/jsm/postprocessing/OutputPass.js'),
        import('three/examples/jsm/postprocessing/Pass.js'),
        import('three/examples/jsm/shaders/CopyShader.js'),
      ])
      composer = new EffectComposer(renderer)
      // ── A PROFUNDIDADE DA CENA MORA FORA DO PINGUE-PONGUE ──────────────────
      //
      // ⚠️ DUAS VERSÕES DISTO DERAM TELA PRETA, E O DRIVER DISSE O PORQUÊ:
      // "Feedback loop formed between Framebuffer and active Texture", 256 vezes
      // num quadro. O `EffectComposer` alterna entre dois alvos; pendurar a
      // `DepthTexture` em qualquer um deles significa que, em algum passe, o
      // alvo de ESCRITA é o mesmo objeto cuja profundidade o shader está LENDO.
      // Ler e escrever o mesmo anexo no mesmo desenho é indefinido, e o que sai
      // é um quadro morto — intermitente, porque comportamento indefinido não
      // tem compromisso de ser sempre igual.
      //
      // A primeira correção foi passar a textura para um alvo só, contando a
      // paridade dos passes que trocam de lado. A conta estava errada — o
      // instrumento mediu `escreveNoDois: true` — e, mesmo certa, seria uma
      // invariante que qualquer passe novo quebra em silêncio anos depois.
      //
      // Aqui a cena é desenhada num alvo NOSSO, que o composer nunca escolhe
      // para escrever, e o primeiro passe só copia a cor dali para o
      // `readBuffer`. A profundidade fica num objeto que ninguém mais toca, e a
      // ordem dos passes deixa de ser uma regra que alguém precisa lembrar.
      // Custo: uma cópia de tela cheia por quadro, só nos perfis com lente.
      if (q.lentes) {
        depthDaCena = new THREE.DepthTexture(w, h)
        depthDaCena.type = THREE.UnsignedShortType
        alvoDaCena = new THREE.WebGLRenderTarget(w, h, {
          type: THREE.HalfFloatType,
          depthTexture: depthDaCena,
        })
        const quadDaCena = new FullScreenQuad(
          new THREE.ShaderMaterial({
            uniforms: THREE.UniformsUtils.clone(CopyShader.uniforms),
            vertexShader: CopyShader.vertexShader,
            fragmentShader: CopyShader.fragmentShader,
            depthTest: false,
            depthWrite: false,
          }),
        )
        class PasseDaCena extends Pass {
          constructor() {
            super()
            // Como o `RenderPass`: escreve no `readBuffer` e NÃO troca de lado.
            this.needsSwap = false
          }
          render(r, writeBuffer, readBuffer) {
            r.setRenderTarget(alvoDaCena)
            r.clear()
            r.render(scene, camera)
            quadDaCena.material.uniforms.tDiffuse.value = alvoDaCena.texture
            r.setRenderTarget(this.renderToScreen ? null : readBuffer)
            r.clear()
            quadDaCena.render(r)
          }
          setSize(cw, ch) {
            alvoDaCena.setSize(cw, ch)
          }
          dispose() {
            quadDaCena.dispose()
            alvoDaCena.dispose()
          }
        }
        composer.addPass(new PasseDaCena())
      } else {
        composer.addPass(new RenderPass(scene, camera))
      }

      if (q.ssao) {
        try {
          const { SSAOPass } = await import('three/examples/jsm/postprocessing/SSAOPass.js')
          ssaoPass = new SSAOPass(scene, camera, w, h)
          ssaoPass.kernelRadius = 0.45
          ssaoPass.minDistance = 0.0018
          ssaoPass.maxDistance = 0.08
          composer.addPass(ssaoPass)
        } catch {
          ssaoPass = null
        }
      }
      if (q.godRays) {
        godRaysPass = new ShaderPass(GOD_RAYS_SHADER)
        composer.addPass(godRaysPass)
        // DEPOIS dos raios: o borrão tem que embaçar os raios também, senão
        // eles ficam nítidos por cima de uma cena embaçada e denunciam o truque.
        borraoAguaPass = new ShaderPass(AGUA_BORRAO_SHADER)
        composer.addPass(borraoAguaPass)
      }
      // ⚠️ AS LENTES ENTRAM ANTES DO BLOOM, e a ordem importa. O desfoque de
      // profundidade tem que embaçar a cena ANTES de o bloom escolher o que
      // floresce: na ordem inversa, o sol florescido fica nítido por cima de um
      // fundo desfocado e denuncia o truque — o mesmo motivo pelo qual o borrão
      // d'água vem depois dos raios, logo acima.
      if (q.lentes) {
        dofPass = new ShaderPass(DESFOQUE_DE_PROFUNDIDADE_SHADER)
        composer.addPass(dofPass)
        borraoDoGiroPass = new ShaderPass(BORRAO_DO_GIRO_SHADER)
        composer.addPass(borraoDoGiroPass)
      }
      if (q.bloom) {
        const { UnrealBloomPass } =
          await import('three/examples/jsm/postprocessing/UnrealBloomPass.js')
        // Limiar ALTO de propósito: só o sol, a lava e a glowstone florescem. O
        // bloom largo é o que "lava" a imagem e faz parecer amador.
        bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.3, 0.5, 0.93)
        // O joelho do passe de luminância nasce em 0.01 - uma função DEGRAU na
        // prática. Um pixel que oscile em volta do limiar (estrela, reflexo na
        // água, borda de nuvem) entra e sai do bloom inteiro a cada quadro:
        // vira vaga-lume. Com 0.22 a entrada é gradual e o piscar some.
        if (bloomPass.highPassUniforms?.smoothWidth) {
          bloomPass.highPassUniforms.smoothWidth.value = 0.22
        }
        composer.addPass(bloomPass)
      }
      if (q.fxaa) {
        const { FXAAShader } = await import('three/examples/jsm/shaders/FXAAShader.js')
        fxaaPass = new ShaderPass(FXAAShader)
        composer.addPass(fxaaPass)
      }
      composer.addPass(new OutputPass())
      resize()
    } catch (err) {
      console.warn('[RoqueCraft] pós-processamento indisponível, seguindo sem:', err?.message)
      composer = null
    }
  }
  await setupPost()

  function resize() {
    const cw = container?.clientWidth || w
    const ch = container?.clientHeight || h
    if (!cw || !ch) return
    camera.aspect = cw / ch
    camera.updateProjectionMatrix()
    renderer.setSize(cw, ch, false)
    composer?.setSize(cw, ch)
    if (fxaaPass) {
      const pr = renderer.getPixelRatio()
      fxaaPass.material.uniforms.resolution.value.set(1 / (cw * pr), 1 / (ch * pr))
    }
    if (ssaoPass) ssaoPass.setSize(cw, ch)
    viewmodel.resize(cw / ch)
  }

  // ── Frame ─────────────────────────────────────────────────────────────────
  const _sunVec = new THREE.Vector3()
  const _screen = new THREE.Vector3()
  const _lookDir = new THREE.Vector3()
  const _shadowCenter = new THREE.Vector3()
  // Base ortonormal da luz, pro texel snapping. Reaproveitadas todo quadro:
  // alocar três vetores por frame é lixo pro coletor no caminho mais quente.
  const _eixoX = new THREE.Vector3()
  const _eixoY = new THREE.Vector3()
  const _eixoZ = new THREE.Vector3()
  const _bufSize = new THREE.Vector2()
  const _corCeu = new THREE.Color()
  const _frente = new THREE.Vector3()

  function updateEnvironment(
    ticks,
    timeSeconds,
    {
      underwater = false,
      profundidade = 0,
      renderDistance = q.renderDistance,
      // ⚠️ O OLHO VÊ O CÉU? A sonda mediu o fundo de uma caverna a 38 blocos
      // ficando quase 3× mais claro quando começava a chover lá fora — a
      // cortina de chuva estava sendo desenhada em volta da câmera onde quer
      // que ela estivesse, inclusive dentro da pedra. O engine não tem como
      // saber sozinho: quem sabe é o mundo, e ele informa aqui.
      ceuAberto = 1,
      // A dimensão manda no céu: sem ela, o Nether herdaria o relógio do
      // overworld e mudaria de humor conforme a hora de um dia que não existe
      // debaixo de um teto de bedrock. Ver `ceuDaDimensao.js`.
      dimensao = DIMENSAO_PADRAO,
    } = {},
  ) {
    const palette = paletaDaDimensao(dimensao, ticks)
    const rig = rigDaDimensao(dimensao, ticks)
    const sDir = sunDirection(ticks)
    const mDir = moonDirection(ticks)

    // luz direcional: acompanha o jogador com deslocamento fixo, pra a sombra
    // ficar sempre centrada no que se vê (frustum pequeno = sombra nítida)
    _sunVec.set(rig.directional.dir.x, rig.directional.dir.y, rig.directional.dir.z).normalize()
    // O frustum da sombra é pequeno pra a sombra ficar nítida, então ele TEM que
    // ser empurrado pra frente do olhar - centrado na câmera, metade do mapa de
    // sombra cai atrás das costas e a paisagem à frente sai sem sombra nenhuma
    // (defeito visto no QA de 2026-08-19).
    _shadowCenter
      .copy(camera.getWorldDirection(_lookDir))
      .setY(0)
      .normalize()
      .multiplyScalar(q.shadowRadius * 0.55)
      .add(camera.position)

    // ── TEXEL SNAPPING ──────────────────────────────────────────────────────
    //
    // ⚠️ SEM ISTO A SOMBRA NADA. O centro do frustum seguia a câmera em
    // coordenada CONTÍNUA, então a cada passo do jogador a grade do mapa de
    // sombra escorregava um pedaço de texel — a borda da sombra fervia e o
    // contato com o pé do bloco piscava. É o defeito irmão do peter-panning:
    // um é a sombra longe do bloco, o outro é a sombra não parando quieta.
    //
    // O conserto é prender o centro à própria grade do mapa: monta-se a base
    // ortonormal da luz (a MESMA convenção do three, que usa `up = +Y` pra
    // olhar do sol pro alvo) e arredonda-se o centro para múltiplos do tamanho
    // do texel nos dois eixos do plano da luz. A componente ao longo da luz não
    // é arredondada — ela não afeta em que texel o ponto cai.
    if (q.shadows) {
      _eixoZ.copy(_sunVec).normalize()
      _eixoX.set(0, 1, 0).cross(_eixoZ)
      // Sol a pino: o `up` fica paralelo à luz e o produto vetorial degenera.
      // Sem esta guarda a base vira NaN e a sombra some da tela inteira.
      if (_eixoX.lengthSq() < 1e-8) _eixoX.set(1, 0, 0)
      _eixoX.normalize()
      _eixoY.copy(_eixoZ).cross(_eixoX).normalize()
      const texel = (2 * q.shadowRadius) / q.shadowSize
      const px = Math.round(_shadowCenter.dot(_eixoX) / texel) * texel
      const py = Math.round(_shadowCenter.dot(_eixoY) / texel) * texel
      const pz = _shadowCenter.dot(_eixoZ)
      _shadowCenter
        .set(0, 0, 0)
        .addScaledVector(_eixoX, px)
        .addScaledVector(_eixoY, py)
        .addScaledVector(_eixoZ, pz)
    }

    sun.position.copy(_shadowCenter).addScaledVector(_sunVec, 150)
    sun.target.position.copy(_shadowCenter)
    sun.target.updateMatrixWorld()
    // ⚠️ A CHUVA ROUBA LUZ, e isso não é enfeite: sem tirar o sol, a chuva vira
    // som e partícula com o mundo continuando ensolarado — o erro clássico. Sob
    // temporal o contraste cai, a sombra some junto e o ambiente ganha peso
    // relativo, que é exatamente o que a vista sob nuvem carregada faz.
    // O CLARÃO. Entra pela luz do céu e pela direcional, não pelo ambiente:
    // ambiente é luz global e acenderia o fundo da caverna, que é exatamente o
    // defeito que a sonda pegou na rodada da chuva. `uSkyFactor` já é modulado
    // por quanto de céu cada face enxerga — caverna fica escura de graça.
    const raio = relampagoEm(climaAtual.semente, timeSeconds, climaAtual.tempestade)
    const clarao = climaAtual.claraoFixo == null ? raio.clarao : climaAtual.claraoFixo
    // Guardado para o QA poder ESPERAR um clarão em vez de torcer por um: com
    // 6 raios por minuto e 0,42 s de duração, o céu fica aceso 1,7% do tempo —
    // fotografar no escuro e chamar de "não flashou" seria fácil demais.
    climaAtual.clarao = clarao
    materials.shared.uClarao.value = clarao
    const perdaDeSol = luzSobChuva(climaAtual.chuva)
    sun.intensity = intensidadeDoSol(rig.directional.intensity, fx, perdaDeSol, clarao)
    sun.color.setRGB(...rig.directional.color)

    // ⚠️ E O AMBIENTE NÃO ENCOSTA NA CHUVA. A primeira versão subia o ambiente
    // 18% sob temporal, com o argumento (correto) de que céu encoberto é um
    // difusor gigante. Só que ambiente é luz GLOBAL: a sonda mediu o fundo de
    // uma caverna a 38 blocos de profundidade ficando 37% MAIS CLARO quando
    // começava a chover lá fora. Chuva acendendo caverna é pior que chuva não
    // fazendo nada — e nenhum olho pegaria isso, porque quem olha para a chuva
    // está do lado de fora.
    //
    // O ar encoberto continua sendo representado, mas por quem não atravessa
    // pedra: a cor do céu (uCover) e a perda de sol acima.
    ambient.intensity = rig.ambient * (fx.ambientMul ?? 1)
    ambient.color.setRGB(
      palette.zenith[0] + 0.35,
      palette.zenith[1] + 0.35,
      palette.zenith[2] + 0.35,
    )
    ambient.groundColor.setRGB(palette.fog[0] * 0.5, palette.fog[1] * 0.45, palette.fog[2] * 0.4)

    // ⚠️ E A EXPOSICAO NAO ENCOSTA NO CLARAO. Ela e global por definicao: subir
    // 30% no raio subia 30% o fundo da caverna junto. Clarao e LUZ, e luz tem
    // que passar pela mesma porta que a luz do dia passa.
    renderer.toneMappingExposure = rig.exposure
    luzDoDia = dayFactor(ticks)

    // Névoa: casada com a cor do horizonte, e a distância acompanha o raio de
    // carregamento - a borda do mundo tem que dissolver na bruma, não num corte
    // reto, mas o miolo da paisagem precisa ficar LIMPO.
    const far = renderDistance * CHUNK_SIZE
    if (!scene.fog) {
      // névoa desligada pelo diagnóstico
    } else if (underwater) {
      // `fundura` sai de uma exponencial, não de uma reta: a absorção da água é
      // exponencial, e uma reta faria os primeiros blocos escurecerem rápido
      // demais e o fundo do oceano nunca terminar de escurecer.
      const fundura = 1 - Math.exp(-Math.max(0, profundidade) / (FUNDO_DE_REFERENCIA * 0.5))
      scene.fog.color.copy(AGUA_RASA).lerp(AGUA_FUNDA, fundura)
      scene.fog.near = 0.5
      // 30 blocos de visão logo abaixo da superfície, 7 lá no fundo. É a
      // distância que encolhe, não só a cor: água funda não é água rasa escura,
      // é água em que a paisagem SOME mais perto do olho.
      scene.fog.far = 30 - 23 * fundura
    } else {
      // NÉVOA CASADA COM O HORIZONTE DO CÉU.
      //
      // Com `fog.color` saindo de uma tabela e o céu saindo de um shader, a
      // silhueta do terreno sempre encostava numa faixa de cor que não é a do
      // céu atrás dela — é o que faz o mundo parecer recortado e colado no
      // fundo. `sky.skyColorAt` é a MESMA conta do shader, avaliada na CPU pra
      // direção em que a câmera olha, rente ao horizonte. A cor da tabela
      // continua pesando: ela é quem carrega a bruma de madrugada.
      camera.getWorldDirection(_frente)
      _frente.y = 0.035
      _frente.normalize()
      sky.skyColorAt(_frente, { palette, sunDir: sDir }, _corCeu)
      scene.fog.color.setRGB(
        palette.fog[0] * 0.45 + _corCeu.r * 0.55,
        palette.fog[1] * 0.45 + _corCeu.g * 0.55,
        palette.fog[2] * 0.45 + _corCeu.b * 0.55,
      )
      // de madrugada a bruma sobe (fogDensity > 1) e o `near` recua
      // Só o ANEL EXTERNO dissolve. Medido no QA de 2026-08-19: com a névoa
      // começando na metade da distância de renderização, um olhar horizontal
      // rasante (que é a maior parte do tempo de jogo) vira uma tela de bruma,
      // porque quase todo pixel cai além do `near`. Começando em 82% o mundo
      // fica limpo e a borda do carregamento continua escondida.
      scene.fog.near = (far * 0.82) / rig.fogDensity
      scene.fog.far = far * 1.15
    }
    camera.far = Math.max(260, far * 1.7)
    camera.updateProjectionMatrix()

    updateVoxelUniforms(materials.shared, {
      // `congelarAgua` para o relógio da onda num instante fixo. Ver o botão
      // em `setFx`: sem ele, o A/B do reflexo comparava duas cenas diferentes.
      // O instante congelado é escolhível: a sonda da cáustica precisa comparar
      // dois instantes DIFERENTES da mesma onda, e um congelamento num valor
      // fixo só permitiria comparar o mesmo com o mesmo.
      timeSecondsOverride: fx.congelarAgua ? (fx.tempoDaAgua ?? 1000) : null,
      // `lavaParada` congela o relógio da lava sem congelar o resto da cena.
      lavaTempo: fx.lavaParada ? 500 : timeSeconds,
      skyFactor: skyLightFactor(ticks),
      skyColor: [
        0.72 + palette.sun[0] * 0.3,
        0.76 + palette.sun[1] * 0.26,
        0.86 + palette.sun[2] * 0.2,
      ],
      timeSeconds,
      // À noite o sol está abaixo do horizonte e o brilho na onda some sozinho
      // (uSkyFactor vai a zero) - não precisa de troca pra lua.
      sunDir: sDir,
    })

    // A cortina de chuva anda no MESMO relógio da onda e some sozinha quando a
    // força é zero — não custa nada em céu limpo, que é 85% do tempo.
    // Chuva OU neve: nunca as duas, porque o bioma decide qual das duas cai.
    const precipita = Math.max(climaAtual.chuva, climaAtual.neve)
    // ⚠️ `congelarAgua` PARA A CHUVA TAMBÉM, e isso foi medido, não suposto.
    //
    // A sonda da refração (que existe desde antes da chuva) começou a recusar o
    // próprio número: duas fotos idênticas passaram a discordar 0,177 enquanto o
    // sinal que ela mede é 0,376 — metade do sinal virou ruído. A causa era a
    // cortina de gotas andando entre um clique e outro, bem na frente da lente,
    // acrescentando detalhe de alta frequência exatamente onde a régua mede
    // NITIDEZ. Com a chuva parada a deriva caiu para 0,017, dez vezes menos.
    //
    // Nenhum autor de sonda anterior a hoje teria como saber que precisa
    // silenciar a chuva. Por isso o conserto mora no interruptor que todos eles
    // JÁ usam: quem congela a água congela a chuva, porque chuva é água andando.
    // E congela o RELÓGIO, não a visibilidade: as gotas param no ar em vez de
    // sumir, então a foto continua mostrando que está chovendo.
    chuvaVisual.update(
      fx.congelarAgua ? (fx.tempoDaAgua ?? 1000) : timeSeconds,
      precipita * (underwater ? 0 : 1) * ceuAberto,
      camera.position,
      ehNeve(climaAtual),
    )

    sky.update({
      palette,
      rig,
      clarao,
      sunDir: sDir,
      moonDir: mDir,
      moonPhase: moonPhase(ticks),
      camera,
      timeSeconds,
      // Tamanho angular de um pixel: é com isto que o disco do sol, o da lua e
      // cada estrela sabem quando são menores que um pixel e precisam ESCURECER
      // em vez de encolher. Sem isso, estrela some e volta a cada passo da
      // câmera e o bloom transforma o piscar em vaga-lume.
      pixelAngle:
        (camera.fov * Math.PI) / 180 / Math.max(1, renderer.getDrawingBufferSize(_bufSize).y),
    })

    if (godRaysPass) {
      _screen.copy(camera.position).addScaledVector(_sunVec, 300).project(camera)
      const atras = _sunVec.dot(camera.getWorldDirection(_lookDir)) <= 0
      godRaysPass.uniforms.uSunScreen.value.set(_screen.x * 0.5 + 0.5, _screen.y * 0.5 + 0.5)

      // O SOL PRECISA ESTAR DENTRO DO QUADRO, não só à frente.
      //
      // O teste antigo era `sunVec · frente > 0.05` — 87° fora do eixo. Mas com
      // FOV 72° em 16:9 o sol SAI do quadro por volta de 50° na horizontal. Na
      // faixa entre um e outro o passe desenhava raios convergindo pra um ponto
      // fora da tela, e a marcha batia na borda: barra de luz sem fonte
      // visível. Medido em 23/08/2026 pela sonda `qa-roquecraft-ceu-pos.mjs`.
      //
      // Agora a intensidade cai a zero na borda do quadro: dentro de 85% do
      // NDC vale cheio, e some até 100%. Assim ninguém vê o efeito ligar ou
      // desligar num quadro.
      const fora = Math.max(Math.abs(_screen.x), Math.abs(_screen.y))
      const dentro = atras ? 0 : 1 - Math.max(0, Math.min(1, (fora - 0.85) / 0.15))
      const alto = Math.min(1, Math.max(0, (sDir.y - 0.02) * 3))
      const vis = 0.55 * dentro * alto
      // Debaixo d'água os raios GANHAM força em vez de perder: a coluna de água
      // é o meio que torna o feixe visível, e é o pedido literal do founder.
      // Mas o `alto` e o `dentro` continuam mandando — raio de sol posto ou de
      // sol fora do quadro continua não existindo, dentro ou fora d'água.
      godRaysPass.uniforms.uIntensity.value = underwater ? vis * 1.35 : vis
      // O corte baixa porque a cena submersa inteira é escura: com 0.78 nenhum
      // pixel qualificava e o efeito sumia justamente onde ele foi pedido.
      godRaysPass.uniforms.uCorte.value = underwater ? 0.42 : 0.78
    }
    if (bloomPass) bloomPass.strength = underwater ? 0.18 : 0.3
    // ── O SSAO SAI DEBAIXO D'ÁGUA ─────────────────────────────────────────
    //
    // "tem um contorno estranho nas algas e nos blocos que estão fora da agua
    // enquanto estou mergulhando" — founder, 25/08/2026.
    //
    // Era o SSAO, e o mecanismo explica por que só aparece mergulhado.
    //
    // A oclusão é calculada a partir da PROFUNDIDADE e aplicada como
    // multiplicador sobre a cor FINAL — depois da névoa. Submerso, a névoa é
    // curta e densa (o `far` cai de 30 para 7 no fundo): o terreno distante
    // vira uma chapa azul uniforme, some inteiro. Mas a silhueta dele continua
    // sendo uma descontinuidade de PROFUNDIDADE, e o SSAO continua escurecendo
    // exatamente ali. O resultado é um traço fino desenhado em volta de coisas
    // que a névoa já apagou — contorno sem objeto.
    //
    // Fora d'água a névoa é longa e fraca, as silhuetas ainda são visíveis por
    // cor, e o mesmo traço lê como sombreado normal. Por isso o founder só vê
    // mergulhando, e por isso a correção é condicional e não global.
    //
    // Desligar (e não atenuar) porque o `SSAOPass` do three não expõe
    // intensidade: os controles são raio e distância de amostragem, nenhum dos
    // dois é "quanto isto aparece". E não se perde nada — oclusão de ambiente
    // sobre uma superfície que a névoa apagou é, por definição, invisível.
    if (ssaoPass) ssaoPass.enabled = ssaoLigado(fx.ssao, underwater)
    if (borraoAguaPass) {
      const fundura = 1 - Math.exp(-Math.max(0, profundidade) / (FUNDO_DE_REFERENCIA * 0.5))
      // Já embaça no primeiro palmo (0.55) e engrossa com a fundura. Zero fora
      // d'água — e zero aqui é `return` na primeira linha do shader, não um
      // borrão de raio zero: passe que custa caro sem aparecer é o pior dos dois
      // mundos.
      borraoAguaPass.uniforms.uForca.value = underwater ? 0.55 + 1.15 * fundura : 0
      borraoAguaPass.uniforms.uTempo.value = timeSeconds
      renderer.getSize(_bufSize)
      borraoAguaPass.uniforms.uAspecto.value = _bufSize.x / Math.max(1, _bufSize.y)
    }
    atualizarLentes(timeSeconds)
  }

  // ── AS LENTES ─────────────────────────────────────────────────────────────
  //
  // ⚠️ O GIRO É MEDIDO AQUI, e não recebido de quem chama. O engine já tem a
  // câmera; derivar a velocidade angular dela entre dois quadros não custa
  // acoplamento nenhum e não depende de o componente lembrar de informar. Quem
  // passa o dado por fora acaba com um caminho (o multijogador, a sonda, o
  // replay) que esqueceu de passar — e o efeito some sem ninguém saber por quê.
  let _yawAnterior = null
  let _pitchAnterior = null
  let _tempoAnterior = null

  function atualizarLentes(timeSeconds) {
    if (!dofPass && !borraoDoGiroPass) return
    const e = _euler.setFromQuaternion(camera.quaternion, 'YXZ')
    const dt = _tempoAnterior === null ? 0 : timeSeconds - _tempoAnterior
    const dYaw = _yawAnterior === null ? 0 : e.y - _yawAnterior
    const dPitch = _pitchAnterior === null ? 0 : e.x - _pitchAnterior
    _yawAnterior = e.y
    _pitchAnterior = e.x
    _tempoAnterior = timeSeconds

    if (borraoDoGiroPass) {
      const alvo = alvoDoBorrao(giroDoOlhar(dYaw, dPitch, dt))
      borraoAtual = passoDoBorrao(borraoAtual, alvo, dt > 0 ? dt : 0.016)
      borraoDoGiroPass.uniforms.uForca.value = borraoAtual * BORRAO_MAXIMO
      const dir = direcaoDoBorrao(dYaw, dPitch)
      borraoDoGiroPass.uniforms.uDirecao.value.set(dir.x, dir.y)
      // ⚠️ DESLIGA O PASSE, e não só zera a força. Um passe com força zero
      // continua lendo e escrevendo a tela inteira — é o custo cheio por um
      // efeito invisível, e num jogo que já mede o orçamento de quadro isso é
      // pior que não ter o efeito.
      borraoDoGiroPass.enabled = fx.borraoDoGiro && borraoAtual > 0.002
    }
    if (dofPass) {
      dofPass.uniforms.tDepth.value = depthDaCena
      dofPass.uniforms.uNear.value = camera.near
      dofPass.uniforms.uFar.value = camera.far
      renderer.getSize(_bufSize)
      dofPass.uniforms.uAspecto.value = _bufSize.x / Math.max(1, _bufSize.y)
      // Debaixo d'água quem embaça é o borrão d'água, que já é forte e tem cor.
      // Somar os dois entrega uma sopa azul sem forma nenhuma.
      dofPass.enabled = fx.post && fx.dof && !!dofPass.uniforms.tDepth.value
    }
  }

  // Chaves de diagnóstico (usadas pelo harness de QA pra separar "a paisagem
  // sumiu" de "a névoa/o bloom lavaram a paisagem"). Inertes em jogo.
  const fx = {
    fog: true,
    ssao: true,
    post: true,
    hand: true,
    reflexo: true,
    refracao: true,
    congelarAgua: false,
    tempoDaAgua: 1000,
    lavaParada: false,
    // ⚠️ VONTADE, e não estado. Quem escreve `enabled` das lentes é
    // `atualizarLentes`, TODO QUADRO — um `pass.enabled = false` escrito pelo QA
    // seria desfeito 16ms depois, e a sonda fotografaria o efeito que acabou de
    // pedir para desligar. O mesmo motivo do `fx.ssao` logo acima.
    dof: true,
    borraoDoGiro: true,
  }
  let savedFog = null

  // ── CLIMA ────────────────────────────────────────────────────────────────
  //
  // O engine não CALCULA o tempo — quem calcula é `clima.js`, que é puro e
  // testável. Aqui só se aplica: uniforme de molhado no material, cobertura no
  // céu, e a perda de sol no laço de desenho. Manter o cálculo fora daqui é o
  // que permite testar clima sem WebGL.
  function setClima(c = {}) {
    if (c.chuva !== undefined) {
      climaAtual.chuva = Math.max(0, Math.min(1, Number(c.chuva) || 0))
      materials.shared.uChuva.value = climaAtual.chuva
    }
    // ⚠️ NEVE NÃO MOLHA. Ela se acumula, e superfície com neve por cima fica
    // mais CLARA, não mais escura — o oposto do modelo de superfície molhada.
    // Por isso ela entra na cortina e não em `uChuva`: mandar neve pelo mesmo
    // caminho da chuva escureceria o campo gelado, que é o erro mais fácil de
    // cometer aqui e o mais difícil de notar (quem vê neve está no gelo, e no
    // gelo tudo já é branco demais pra denunciar 30% a menos de brilho).
    if (c.neve !== undefined) climaAtual.neve = Math.max(0, Math.min(1, Number(c.neve) || 0))
    // ⚠️ A TEMPESTADE VEM COMO PARÂMETRO, MAS O CLARÃO É AVALIADO POR QUADRO.
    //
    // Relâmpago dura 0,42 s. Se o jogo mandasse o clarão pronto no tique do HUD
    // (4×/s), o clarão apareceria em dois quadros de cada oito e sumiria — um
    // pisca quebrado no lugar de um estouro. Por isso o que atravessa esta
    // fronteira é o que muda devagar (semente e força da tempestade), e a função
    // PURA é chamada aqui dentro com o relógio do quadro.
    //
    // O jogo chama a MESMA função no laço dele para disparar o trovão. Duas
    // chamadas, uma resposta: é isso que pureza compra.
    if (c.tempestade !== undefined) {
      climaAtual.tempestade = Math.max(0, Math.min(1, Number(c.tempestade) || 0))
    }
    if (c.semente !== undefined) climaAtual.semente = Number(c.semente) || 1
    // ⚠️ CONGELAR O CLARÃO É O QUE TORNA O A/B POSSÍVEL, e a sonda provou que
    // sem isso não dá: o clarão dura 0,42 s, o obturador do Playwright leva
    // centenas de ms, e a primeira medida saiu com o clarão em 0,587 na leitura
    // e 0,022 depois da foto. A sonda RECUSOU o número, corretamente — mas
    // recusar toda vez não mede nada.
    //
    // É o mesmo movimento de `congelarAgua`: parar o fenômeno num instante
    // escolhido é o que permite fotografar o mesmo instante duas vezes. `null`
    // devolve o mando ao relógio.
    if (c.claraoFixo !== undefined) {
      climaAtual.claraoFixo =
        c.claraoFixo == null ? null : Math.max(0, Math.min(1, Number(c.claraoFixo)))
    }
    if (c.cobertura !== undefined) {
      climaAtual.cobertura = Math.max(0, Math.min(1, Number(c.cobertura) || 0))
      sky.uniforms.uCover.value = climaAtual.cobertura
    }
    return { ...climaAtual }
  }

  function setFx(next) {
    if (next.fog !== undefined && next.fog !== fx.fog) {
      fx.fog = next.fog
      if (!fx.fog) {
        savedFog = scene.fog
        scene.fog = null
      } else if (savedFog) {
        scene.fog = savedFog
      }
      scene.traverse((o) => {
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material]
          for (const m of mats) m.needsUpdate = true
        }
      })
    }
    if (next.post !== undefined) fx.post = next.post
    if (next.hand !== undefined) fx.hand = !!next.hand
    // Ligar e desligar CADA passe separadamente. Com só o `post` geral, uma
    // medição de "o que o pós acrescentou" mistura bloom, raios de sol e SSAO
    // num número só, e não dá pra atribuir o defeito a ninguém — foi o que
    // travou o diagnóstico dos brilhos em 23/08/2026.
    if (next.godRays !== undefined && godRaysPass) godRaysPass.enabled = !!next.godRays
    if (next.bloom !== undefined && bloomPass) bloomPass.enabled = !!next.bloom
    // ⚠️ GUARDA A VONTADE, NÃO O ESTADO. Quem decide se o SSAO roda neste
    // quadro é o laço de desenho, porque a regra depende de estar submerso ou
    // não (ver `aplicarSubmerso`). Escrever `enabled` direto aqui faria o QA e
    // o jogo brigarem pelo mesmo campo, e o último a escrever ganharia.
    if (next.ssao !== undefined) fx.ssao = !!next.ssao
    // O FXAA faltava na lista, e ele é suspeito legítimo de contorno claro na
    // borda de sombra: antialias trabalha exatamente onde há degrau de
    // luminância. Sem o botão, a bisseção teria um culpado impossível de
    // inocentar.
    if (next.fxaa !== undefined && fxaaPass) fxaaPass.enabled = !!next.fxaa
    // ⚠️ O BORRÃO SUBMERSO PRECISAVA DO PRÓPRIO BOTÃO, e a falta dele deixou um
    // BURACO na bisseção: desligando ssao, bloom, fxaa e god rays um a um, cada
    // um mexia menos de 1,3 no quadro — mas desligar o pós INTEIRO mexia 15,8.
    // A diferença toda estava no único passe sem interruptor. Sem ele, a
    // conclusão possível era "é do pós, não sei de qual", que não conserta nada.
    if (next.borrao !== undefined && borraoAguaPass) borraoAguaPass.enabled = !!next.borrao
    // As lentes seguem o padrão do `ssao`: guardam a vontade, e o laço decide.
    if (next.dof !== undefined) fx.dof = !!next.dof
    if (next.borraoDoGiro !== undefined) fx.borraoDoGiro = !!next.borraoDoGiro
    if (next.reflexo !== undefined) fx.reflexo = !!next.reflexo
    if (next.refracao !== undefined) fx.refracao = !!next.refracao
    // CONGELAR A ONDA. Existe porque o A/B do reflexo estava afogado no próprio
    // movimento da água: duas fotos com os MESMOS parâmetros já diferiam mais
    // que a diferença que se queria medir (ruído 4,8 contra sinal 5,2). Onda é
    // ruído de alta frequência e reflexo é sinal de baixa, mas nenhum filtro
    // salva uma comparação em que a cena mudou entre os dois cliques. Congelar
    // o relógio da água torna as duas fotos comparáveis pixel a pixel.
    if (next.congelarAgua !== undefined) fx.congelarAgua = !!next.congelarAgua
    if (next.tempoDaAgua !== undefined) fx.tempoDaAgua = Number(next.tempoDaAgua)
    if (next.lavaParada !== undefined) fx.lavaParada = !!next.lavaParada
    if (next.clouds !== undefined) {
      sky.uniforms.uCloudQ.value = next.clouds ? (q.cloudQuality ?? 2) : 0
    }
    if (next.cover !== undefined) sky.uniforms.uCover.value = next.cover
    // Overrides de diagnostico (QA): forcar ambiente/sol/voxel-light pra isolar
    // QUEM esta iluminando a cena. Sem isto, "a sombra sumiu" e chute.
    if (next.ambientMul !== undefined) fx.ambientMul = next.ambientMul
    if (next.sunMul !== undefined) fx.sunMul = next.sunMul
    if (next.flatVoxelLight !== undefined) {
      materials.shared.uShadeFloor.value = next.flatVoxelLight ? 1 : 0.05
      materials.shared.uAoStrength.value = next.flatVoxelLight ? 0 : 0.72
    }
    // Diagnostico da AGUA. Desligar a onda separa "defeito de deslocamento por
    // vertice" de "defeito de malha", e o wireframe mostra a malha crua - foi o
    // par que identificou os cubos soltos na superficie (QA de 2026-08-20).
    if (next.waterFx !== undefined) materials.shared.uWaterFx.value = next.waterFx ? 1 : 0
    // Desligar o VENTO é o PAR DE CONTROLE da sonda de movimento. Um par de
    // quadros com vento e outro par sem, na mesma câmera e no mesmo instante do
    // dia: o que sobra na subtração é vegetação e só ela. Sem o par, "medi
    // movimento na tela" mede nuvem, mão balançando e ciclo do dia junto — foi
    // exatamente assim que a sonda do pós-processamento mentiu em 23/08/2026.
    if (next.wind !== undefined) {
      materials.shared.uWindStrength.value = next.wind ? forcaDoVento : 0
    }
    if (next.sombraFolha !== undefined) {
      sombraFolha = !!next.sombraFolha
      for (const e of sectionMeshes.values()) {
        if (e.cutout) e.cutout.customDepthMaterial = sombraFolha ? materials.depthCutout : undefined
      }
    }
    // ⚠️ DESLIGAR A SOMBRA É O CONTROLE, não mais um efeito na lista.
    //
    // O "contorno claro na borda da sombra" é o ponto mais antigo do founder e o
    // único que nunca teve culpado, e o motivo é a RÉGUA, não a falta de
    // suspeitos: ela procura o degrau de luminância mais forte de cada linha, e
    // aresta de bloco, silhueta de árvore e borda de sombra são todas degrau de
    // luminância. A régua media as três e chamava todas de sombra.
    //
    // Com este botão o par de fotos responde sozinho: mesma câmera, mesmo
    // instante, uma com sombra e uma sem. Onde a sombra não age as duas fotos
    // são IDÊNTICAS pixel a pixel — aresta e silhueta se cancelam na subtração,
    // e o que sobra é sombra e só sombra. É o mesmo movimento que salvou o A/B
    // da onda (congelar o relógio) e o do vento (par com e sem): o controle não
    // pode ser uma segunda opinião sobre a mesma foto.
    //
    // `q.shadows` continua mandando: perfil que não tem sombra não ganha sombra
    // por aqui. E os materiais TÊM que recompilar — o `#ifdef` de sombra é
    // decidido na compilação do shader, então sem `needsUpdate` a foto "sem
    // sombra" sairia com sombra e o controle seria uma cópia do sujeito.
    if (next.sombras !== undefined) {
      renderer.shadowMap.enabled = !!next.sombras && !!q.shadows
      renderer.shadowMap.needsUpdate = true
      scene.traverse((o) => {
        if (!o.material) return
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        for (const m of mats) m.needsUpdate = true
      })
    }
    if (next.wireframe !== undefined) {
      for (const m of [materials.opaque, materials.cutout, materials.transparent])
        m.wireframe = !!next.wireframe
    }
    if (next.sky !== undefined) sky.group.visible = next.sky
    if (next.solid !== undefined) solidGroup.visible = next.solid
    if (next.water !== undefined) waterGroup.visible = next.water
    if (next.mips !== undefined) {
      for (const t of [textures.albedo, textures.normal, textures.mer]) {
        t.minFilter = next.mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter
        t.generateMipmaps = !!next.mips
        t.needsUpdate = true
      }
    }
    if (next.aniso !== undefined) {
      for (const t of [textures.albedo, textures.normal, textures.mer]) {
        t.anisotropy = next.aniso
        t.needsUpdate = true
      }
    }
  }

  // ── REFLEXO DO CENÁRIO NA ÁGUA ──────────────────────────────────────────
  //
  // "está faltando o reflexo do cenario na agua também para dar uma maior
  // realidade" — founder. O shader da água já refletia o CÉU por fresnel, o que
  // resolve o lago visto de longe e não resolve nada visto de perto: a margem,
  // a árvore e o barranco não apareciam na lâmina.
  //
  // Reflexão PLANAR, que é a técnica certa aqui porque a água deste jogo vive
  // toda num plano só (`SEA_LEVEL`). Espelha-se a câmera nesse plano, desenha-se
  // a cena num alvo de meia resolução e o shader da água amostra esse alvo pela
  // posição de tela do próprio pixel. Não é SSR: SSR só reflete o que já está
  // na tela e some com o que ficou fora do quadro, que num jogo em primeira
  // pessoa é justamente a margem logo à frente.
  //
  // ⚠️ CUSTA UM SEGUNDO DESENHO DA CENA POR QUADRO. Três travas pagam isso:
  // meia resolução, só nos perfis com `reflexo` (ultra e high — o celular NÃO
  // entra), e nada é desenhado quando a câmera está submersa (de baixo não se vê
  // reflexo de superfície) ou quando o olho está abaixo do nível do mar.
  const reflexoRT = q.reflexo
    ? new THREE.WebGLRenderTarget(1, 1, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        type: THREE.HalfFloatType,
        depthBuffer: true,
      })
    : null
  // ── REFRAÇÃO: A CÓPIA DA CENA QUE A ÁGUA VAI BORRAR ────────────────────────
  //
  // "precisamos do blur de fora da agua olhando para o fundo dela, para dar
  // nocao de profundidade" -- founder. O leito visto atraves da lamina e
  // geometria desenhada ANTES da agua, no passe opaco: quando o shader da agua
  // roda, aquele pixel ja esta no framebuffer e o shader nao tem como le-lo.
  //
  // Por isso a refracao precisa de uma COPIA da cena sem agua -- e o alvo em
  // meia resolucao ja entrega metade do borrao de graca, porque amostrar um
  // alvo menor JA e um filtro passa-baixa. As tomadas extras no shader so
  // completam o resto, crescendo com a profundidade.
  const refracaoRT = q.reflexo
    ? new THREE.WebGLRenderTarget(1, 1, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        type: THREE.HalfFloatType,
        depthBuffer: true,
      })
    : null
  let refracaoAtiva = false

  function desenharRefracao() {
    if (!refracaoRT) return false
    // Submerso nao ha o que refratar: o olho ja esta no meio da agua e quem
    // manda na vista e a nevoa, nao a lamina.
    if (camera.position.y <= materials.shared.uSeaLevel.value + 0.05) return false
    renderer.getSize(_bufSize)
    const esc = q.reflexoEscala ?? 0.5
    const w = Math.max(64, Math.floor(_bufSize.x * esc))
    const h = Math.max(64, Math.floor(_bufSize.y * esc))
    if (refracaoRT.width !== w || refracaoRT.height !== h) refracaoRT.setSize(w, h)
    // Mesma armadilha do reflexo: a textura fica ligada no bloco de uniformes
    // COMPARTILHADO, entao ela precisa ser solta antes de virar alvo.
    materials.shared.uRefracao.value = null
    for (const entry of sectionMeshes.values()) {
      if (entry.transparent) entry.transparent.visible = false
    }
    const alvoAntes = renderer.getRenderTarget()
    renderer.setRenderTarget(refracaoRT)
    renderer.clear()
    renderer.render(scene, camera)
    renderer.setRenderTarget(alvoAntes)
    materials.shared.uRefracao.value = refracaoRT.texture
    for (const entry of sectionMeshes.values()) {
      if (entry.transparent) entry.transparent.visible = true
    }
    return true
  }

  const reflexoCam = new THREE.PerspectiveCamera()
  const _matReflexo = new THREE.Matrix4()
  const _alvoReflexo = new THREE.Vector3()
  let reflexoAtivo = false

  function desenharReflexo() {
    if (!reflexoRT) return false
    // Olho abaixo da lâmina: quem está submerso vê a superfície por baixo, e
    // por baixo não há reflexo planar nenhum pra desenhar.
    if (camera.position.y <= materials.shared.uSeaLevel.value + 0.05) return false

    renderer.getSize(_bufSize)
    const esc = q.reflexoEscala ?? 0.5
    const w = Math.max(64, Math.floor(_bufSize.x * esc))
    const h = Math.max(64, Math.floor(_bufSize.y * esc))
    if (reflexoRT.width !== w || reflexoRT.height !== h) reflexoRT.setSize(w, h)

    // ⚠️ ESPELHAR A CÂMERA NÃO É ESPELHAR A MATRIZ DELA.
    //
    // A primeira versão montava a matriz de reflexão, multiplicava pela
    // `matrixWorld` e chamava `decompose`. Não funciona, e o motivo é
    // matemático: reflexão tem determinante −1 e `decompose` devolve quaternion
    // com escala positiva, que só representa rotação. O `updateMatrixWorld`
    // seguinte RECOMPÕE a matriz a partir desse TRS e joga fora exatamente a
    // parte que fazia dela um espelho. O reflexo saía amostrando fora do alvo e
    // a sonda mediu sinal ABAIXO do ruído.
    //
    // A forma que funciona é a do `Reflector` do próprio three: reflete-se a
    // POSIÇÃO, reflete-se o UP, e olha-se para o ponto de mira também
    // refletido. Num plano horizontal isso é só trocar o sinal do Y dos três.
    const nivel = materials.shared.uSeaLevel.value
    reflexoCam.position.set(camera.position.x, 2 * nivel - camera.position.y, camera.position.z)
    camera.getWorldDirection(_lookDir)
    _alvoReflexo.set(
      camera.position.x + _lookDir.x,
      2 * nivel - (camera.position.y + _lookDir.y),
      camera.position.z + _lookDir.z,
    )
    reflexoCam.up.set(0, -1, 0)
    reflexoCam.lookAt(_alvoReflexo)
    reflexoCam.fov = camera.fov
    reflexoCam.aspect = camera.aspect
    reflexoCam.near = camera.near
    // Menos alcance no espelho: reflexo é detalhe, e o custo é linear no que
    // entra no frustum.
    reflexoCam.far = Math.min(camera.far, 140)
    reflexoCam.updateProjectionMatrix()
    reflexoCam.updateMatrixWorld(true)
    reflexoCam.matrixWorldInverse.copy(reflexoCam.matrixWorld).invert()

    // A matriz que leva mundo → UV do alvo. É ela que o shader usa; sem ela o
    // reflexo escorregaria com a câmera em vez de ficar preso ao mundo.
    _matReflexo
      .set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(reflexoCam.projectionMatrix)
      .multiply(reflexoCam.matrixWorldInverse)
    materials.shared.uReflexoMat.value.copy(_matReflexo)

    // A água some do espelho: a lâmina não reflete a si mesma, e deixá-la
    // desenhar aqui fecharia o reflexo com uma tampa azul.
    for (const entry of sectionMeshes.values()) {
      if (entry.transparent) entry.transparent.visible = false
    }
    // ⚠️ SOLTAR A TEXTURA ANTES DE DESENHAR NELA.
    //
    // `uReflexo` vive no bloco de uniformes COMPARTILHADO, então ele fica ligado
    // também no material opaco e no recortado — que são justamente os que vão
    // desenhar aqui dentro. Com a textura ligada numa unidade enquanto ela é o
    // alvo, a WebGL acusa "Feedback loop formed between Framebuffer and active
    // Texture" a cada draw call e para de reportar depois de algumas centenas.
    // Não importa que ninguém amostre: basta estar ligada.
    materials.shared.uReflexo.value = null
    const alvoAntes = renderer.getRenderTarget()
    renderer.setRenderTarget(reflexoRT)
    renderer.clear()
    renderer.render(scene, reflexoCam)
    renderer.setRenderTarget(alvoAntes)
    materials.shared.uReflexo.value = reflexoRT.texture
    for (const entry of sectionMeshes.values()) {
      if (entry.transparent) entry.transparent.visible = true
    }
    return true
  }

  let lastStats = { calls: 0, triangles: 0 }
  // O EffectComposer chama render() varias vezes por frame e o renderer ZERA
  // info.render a cada chamada - lendo depois, o HUD mostrava "1 draw call, 1
  // triangulo" enquanto a cena desenhava 1500. Com autoReset desligado o
  // contador acumula o frame inteiro (cena + passes) e a estatistica volta a
  // significar alguma coisa.
  renderer.info.autoReset = false
  let luzDoDia = 1
  function render() {
    renderer.info.reset()
    // O espelho é desenhado ANTES da cena: a água precisa do alvo já pronto no
    // mesmo quadro, senão o reflexo fica um quadro atrasado e "arrasta" quando
    // a câmera gira.
    reflexoAtivo = fx.reflexo !== false && desenharReflexo()
    materials.shared.uReflexoForca.value = reflexoAtivo ? 1 : 0
    refracaoAtiva = fx.refracao !== false && desenharRefracao()
    materials.shared.uRefracaoForca.value = refracaoAtiva ? 1 : 0
    renderer.getSize(_bufSize)
    materials.shared.uResolucao.value.set(_bufSize.x, _bufSize.y)
    if (composer && fx.post) composer.render()
    else renderer.render(scene, camera)
    // A mão vem por ÚLTIMO, com o depth limpo. Fora do composer de propósito:
    // bloom e god rays na mão a transformam num borrão luminoso na tela.
    // `fx.hand` existe pro QA: a mão OSCILA sozinha, e qualquer medida de
    // "o que se mexeu na tela entre dois quadros" a conta como movimento. É
    // ruído com 5% da tela de área, maior que o efeito medido em mais de uma
    // sonda. Tirar a mão é a diferença entre medir vegetação e medir a mão.
    if (fx.hand) viewmodel.render(luzDoDia)
    lastStats = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }
  }

  function dispose() {
    chuvaVisual.dispose()
    for (const entry of sectionMeshes.values()) disposeSection(entry)
    sectionMeshes.clear()
    sky.dispose()
    destaque.descartar()
    crack.geometry.dispose()
    crack.material.dispose()
    fantasma.geometry.dispose()
    fantasma.material.dispose()
    blocosCaindo.descartar()
    for (const m of Object.values(materials)) m?.dispose?.()
    for (const t of [textures.albedo, textures.normal, textures.mer]) t?.dispose?.()
    composer?.dispose?.()
    renderer.dispose()
  }

  return {
    renderer,
    scene,
    camera,
    sun,
    ambient,
    sky,
    materials,
    viewmodel,
    quality,
    profile: q,
    sectionMeshes,
    setSection,
    removeChunk,
    highlight,
    destaque,
    blocosCaindo,
    crack,
    fantasma,
    resize,
    updateEnvironment,
    setFx,
    setClima,
    get clima() {
      return { ...climaAtual }
    },
    fx,
    render,
    dispose,
    /**
     * Ondulação na lâmina, no ponto (x,z) do mundo.
     *
     * A base de tempo é `uTime`, a MESMA que anima a onda ambiente — usar
     * `performance.now()` aqui faria o anel nascer com uma fase aleatória em
     * relação ao mar. Amplitude em blocos.
     */
    ondularAgua(x, z, amplitude) {
      return emitirOndulacao(materials.shared, x, z, amplitude, materials.shared.uTime.value)
    },
    get drawCalls() {
      return renderer.info.render.calls
    },
    // O estado VIVO das lentes, lido dos UNIFORMES e não das constantes.
    //
    // ⚠️ `tDepth` É A PERGUNTA QUE IMPORTA. O desfoque de profundidade lê a
    // textura de profundidade do alvo do composer; se ela não existir, o shader
    // roda, o passe fica ligado, o quadro sai IGUAL e nada acusa. Ler a
    // constante `DESFOQUE_MAXIMO` do módulo provaria só que o módulo tem a
    // constante — é o mesmo erro das 38 asserções verdes sobre código que o
    // jogo nunca carregou.
    inspecionarLentes() {
      const u = (pass, campo) => (pass ? pass.uniforms[campo]?.value : null)
      return {
        dof: dofPass
          ? {
              ligado: dofPass.enabled,
              vontade: fx.dof,
              temProfundidade: !!u(dofPass, 'tDepth'),
              raio: u(dofPass, 'uRaio'),
              focoAte: u(dofPass, 'uFocoAte'),
              cheioEm: u(dofPass, 'uCheioEm'),
              near: u(dofPass, 'uNear'),
              far: u(dofPass, 'uFar'),
            }
          : null,
        giro: borraoDoGiroPass
          ? {
              ligado: borraoDoGiroPass.enabled,
              vontade: fx.borraoDoGiro,
              forca: Number((u(borraoDoGiroPass, 'uForca') ?? 0).toFixed(5)),
              direcao: [
                Number((u(borraoDoGiroPass, 'uDirecao')?.x ?? 0).toFixed(3)),
                Number((u(borraoDoGiroPass, 'uDirecao')?.y ?? 0).toFixed(3)),
              ],
              mola: Number(borraoAtual.toFixed(4)),
            }
          : null,
      }
    },
    // O estado VIVO da água, lido dos objetos e não das constantes. Existe
    // porque "a água ficou mais funda" é a coisa mais fácil do mundo de afirmar
    // olhando um print azul — e a única prova honesta é a névoa e o borrão
    // MUDAREM entre raso e fundo, com números.
    inspecionarAgua() {
      return {
        nevoa: scene.fog
          ? {
              cor: scene.fog.color.getHexString(),
              near: Number(scene.fog.near.toFixed(2)),
              far: Number(scene.fog.far.toFixed(2)),
            }
          : null,
        borrao: borraoAguaPass ? Number(borraoAguaPass.uniforms.uForca.value.toFixed(3)) : null,
        refracao: {
          disponivel: !!refracaoRT,
          ativa: refracaoAtiva,
          alvo: refracaoRT ? [refracaoRT.width, refracaoRT.height] : null,
        },
        reflexo: {
          disponivel: !!reflexoRT,
          ativo: reflexoAtivo,
          forca: materials.shared.uReflexoForca.value,
          alvo: reflexoRT ? [reflexoRT.width, reflexoRT.height] : null,
        },
        raios: godRaysPass
          ? {
              intensidade: Number(godRaysPass.uniforms.uIntensity.value.toFixed(3)),
              corte: Number(godRaysPass.uniforms.uCorte.value.toFixed(2)),
            }
          : null,
      }
    },
    // Diagnóstico duro: quantas malhas existem, onde estão em relação à câmera,
    // e quantas o frustum de fato aceita. Serve pra distinguir "não gerou",
    // "gerou longe" e "gerou mas está sendo cortado".
    inspect() {
      const cam = camera.position
      let meshes = 0
      let near = 0
      let minD = Infinity
      let sample = null
      const frustum = new THREE.Frustum().setFromProjectionMatrix(
        new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
      )
      let inFrustum = 0
      for (const entry of sectionMeshes.values()) {
        for (const m of Object.values(entry)) {
          if (!m) continue
          meshes++
          const bs = m.geometry.boundingSphere
          if (!bs) continue
          const d = bs.center.distanceTo(cam)
          if (d < minD) {
            minD = d
            sample = {
              c: bs.center.toArray().map((v) => Math.round(v)),
              r: Math.round(bs.radius),
              tri: m.geometry.index.count / 3,
            }
          }
          if (d < 160) near++
          if (frustum.intersectsObject(m)) inFrustum++
        }
      }
      return {
        meshes,
        near,
        inFrustum,
        lastStats,
        groups: { sky: sky.group.visible, solid: solidGroup.visible, water: waterGroup.visible },
        minDist: Math.round(minD),
        sample,
        cam: cam.toArray().map((v) => Math.round(v)),
        dir: camera
          .getWorldDirection(new THREE.Vector3())
          .toArray()
          .map((v) => +v.toFixed(2)),
        sceneChildren: scene.children.length,
        fog: scene.fog
          ? {
              near: Math.round(scene.fog.near),
              far: Math.round(scene.fog.far),
              // A COR da névoa, e não só a distância: é por ela que uma sonda
              // afirma "o Nether está vermelho" sem contar pixel de screenshot.
              cor: scene.fog.color.getHexString(),
            }
          : null,
        // Diagnostico de SOMBRA: sem isto so da pra "achar" que a sombra sumiu.
        shadow: {
          on: renderer.shadowMap.enabled,
          // O recibo do enxerto no material de profundidade da folhagem. Fica
          // `null` até o primeiro frame com sombra: o three só compila o
          // material de profundidade quando alguma malha recortada projeta.
          folha: materials.depthCutout.userData.enxertado ?? null,
          folhaLigada: sombraFolha,
          cast: sun.castShadow,
          inScene: !!sun.parent,
          targetInScene: !!sun.target.parent,
          intensity: +sun.intensity.toFixed(2),
          pos: sun.position.toArray().map((v) => Math.round(v)),
          target: sun.target.position.toArray().map((v) => Math.round(v)),
          cam: [
            sun.shadow.camera.left,
            sun.shadow.camera.right,
            sun.shadow.camera.near,
            sun.shadow.camera.far,
          ],
          // ⚠️ OS NÚMEROS DO PETER-PANNING, lidos do objeto VIVO e não da
          // declaração. `radius` nunca foi escrito no código: só olhando aqui
          // dá pra saber com que valor o three ficou. E `shadowSide` é `null`
          // por padrão — o que o three FAZ com esse null é o que decide se a
          // sombra sai da face de trás ou da frente.
          tipo: renderer.shadowMap.type,
          bias: sun.shadow.bias,
          normalBias: sun.shadow.normalBias,
          radius: sun.shadow.radius,
          mapa: [sun.shadow.mapSize.x, sun.shadow.mapSize.y],
          // Blocos por texel: é ESTE número que diz se o frustum está grande
          // demais pro mapa. Quanto maior, mais grosseira a sombra e maior o
          // descolamento no contato.
          blocosPorTexel: +(
            (sun.shadow.camera.right - sun.shadow.camera.left) /
            sun.shadow.mapSize.x
          ).toFixed(4),
          lados: {
            solido: materials.opaque.side,
            solidoSombra: materials.opaque.shadowSide,
            folha: materials.cutout?.side ?? null,
            folhaSombra: materials.cutout?.shadowSide ?? null,
          },
          casters: (() => {
            let n = 0
            for (const e of sectionMeshes.values())
              for (const m of Object.values(e)) if (m && m.castShadow) n++
            return n
          })(),
          ambient: +ambient.intensity.toFixed(2),
        },
      }
    },
    get triangles() {
      return renderer.info.render.triangles
    },
  }
}

export { CHUNK_SIZE, SECTION_HEIGHT }
