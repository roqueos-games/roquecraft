// RoqueCraft - entidades e efeitos: criaturas, jogadores remotos, itens caídos
// e partículas.
//
// Nota de direção de arte: a regra 36-games manda usar MODELOS reais texturizados
// em jogo 3D "complexo/proporcional". Num jogo de VOXEL a forma cúbica não é
// economia, é a linguagem visual - o mundo inteiro é feito de cubos de 1 m. O
// que a regra combate (cena proporcional feita de primitivos sem textura) é
// evitado de outro jeito: cada parte recebe uma textura procedural com grão,
// sombreamento por parte e animação de membro, então nada aqui é um cubo de cor
// chapada.

import * as THREE from 'three'
// ⚠️ `MOB_TYPES` NÃO é importado aqui de propósito. A anatomia deixou de sair
// de `def.width`/`def.height` por multiplicação — era isso que dava um porco
// tão comprido quanto largo e uma vaca sem focinho. O vínculo com a caixa de
// colisão continua existindo, mas onde ele pode ser AFIRMADO em vez de
// presumido: `mobModelo.spec.js` exige o modelo entre 85% e 115% da altura
// declarada, e falha se alguém mexer num dos dois lados e esquecer o outro.
import { skinDe } from '../skins.js'
import { curvaDeGolpe } from '../anim.js'
import { criarEstilhacos, passoEstilhacos } from '../estilhaco.js'
import { TETO as BORRIFO_TETO, opacidadeDa as opacidadeDaGota } from '../borrifo.js'

// ─────────────────────────────────────────────────────────────────────────────
// CONVENÇÃO DE ORIENTAÇÃO — LEIA ANTES DE MEXER EM QUALQUER MODELO.
//
// ⚠️ TODO MODELO DESTE ARQUIVO OLHA PARA +Z. Sem exceção.
//
// Havia DUAS convenções aqui e só uma tinha sido conferida. O boneco de jogador
// remoto olhava pra +Z e usava `-yaw + PI`, certo. Os bichos olhavam pra −Z (a
// cabeça do quadrúpede em `-bodyLen*0.62`, o bico da galinha em `-bodyLen*0.9`,
// os olhos da aranha em `z=-0.82`) e o renderizador aplicava
// `rotation.y = atan2(mx, mz)`, que aponta o +Z pra direção do movimento.
// Resultado medido em 2026-08-23, three headless, nas quatro direções e em
// todos os tipos: dot = −1.00. **Todo mob do jogo andava de ré.** É a "cabeça
// pro lado errado" do relato do founder.
//
// Com uma convenção só, a regra inteira cabe numa linha e tem teste:
//   rotation.y = anguloDeFrente(fx, fz)
// onde (fx, fz) é pra onde o personagem OLHA, em coordenada de mundo.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ângulo de `rotation.y` que faz o +Z local apontar para (fx, fz) no mundo.
 *
 * Vetor nulo devolve `null` — quem chama mantém o ângulo anterior, que é o que
 * um bicho parado faz. Devolver 0 aqui seria pior que não girar: o bicho
 * viraria pro norte toda vez que parasse de andar.
 */
export function anguloDeFrente(fx, fz) {
  if (!Number.isFinite(fx) || !Number.isFinite(fz)) return null
  if (Math.abs(fx) < 1e-6 && Math.abs(fz) < 1e-6) return null
  return Math.atan2(fx, fz)
}

/**
 * Aproxima `atual` de `alvo` pelo caminho curto do círculo.
 *
 * Sem isto o bicho ESTALA: `rotation.y` era atribuído direto, e o mob remoto
 * chega a 8 Hz — a cada pacote a cabeça pulava. E interpolar ângulo sem
 * normalizar a diferença é pior ainda: indo de +179° pra −179° o bicho dá a
 * volta inteira em vez de andar 2°.
 */
export function girarPara(atual, alvo, k) {
  if (alvo == null || !Number.isFinite(alvo)) return atual
  const d = Math.atan2(Math.sin(alvo - atual), Math.cos(alvo - atual))
  return atual + d * Math.min(1, Math.max(0, k))
}

// Textura procedural pequena (32×32) com grão - tira o aspecto de plástico dos
// cubos sem custar um asset externo.
function grainTexture(hex, seed = 1, rough = 0.16) {
  const S = 32
  const c = document.createElement('canvas')
  c.width = S
  c.height = S
  const ctx = c.getContext('2d')
  const img = ctx.createImageData(S, S)
  const r = (hex >> 16) & 255
  const g = (hex >> 8) & 255
  const b = hex & 255
  let s = seed
  const rnd = () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    return ((s >>> 8) & 0xffff) / 0xffff
  }
  for (let i = 0; i < S * S; i++) {
    const n = (rnd() - 0.5) * rough * 255
    img.data[i * 4] = Math.max(0, Math.min(255, r + n))
    img.data[i * 4 + 1] = Math.max(0, Math.min(255, g + n))
    img.data[i * 4 + 2] = Math.max(0, Math.min(255, b + n))
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(c)
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

const matCache = new Map()
function bodyMaterial(hex, seed) {
  const key = `${hex}:${seed}`
  let m = matCache.get(key)
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      map: grainTexture(hex, seed),
      roughness: 0.92,
      metalness: 0,
    })
    matCache.set(key, m)
  }
  return m
}

// ⚠️ MATERIAL DE BICHO É CÓPIA, NÃO O DO CACHE.
//
// O flash vermelho de dano fazia `o.material.emissive.setRGB(...)` no material
// que veio do cache — e o cache é COMPARTILHADO por todos os bichos da mesma
// cor. Bater num porco acendia todos os porcos do mapa. Cada bicho leva cópias
// (o `map` continua sendo o mesmo objeto de textura, então isto não custa
// memória de imagem) e devolve a lista pra quem tem que liberar.
//
// ⚠️ E "liberável" não é a mesma lista que "pintável". Os olhos da aranha
// nascem acesos de propósito (emissivo forte, é o sinal de "isto te machuca").
// Na primeira versão eu joguei tudo numa lista só: o flash de dano terminava
// apagando o emissivo de TODO material registrado, e a aranha ficava cega pro
// resto da vida depois de apanhar uma vez.
function pincelDe(pintaveis) {
  return (hex, seed) => {
    const m = bodyMaterial(hex, seed).clone()
    pintaveis.push(m)
    return m
  }
}

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  m.position.set(x, y, z)
  m.castShadow = true
  return m
}

/**
 * Membro que gira a partir da ARTICULAÇÃO, não do meio.
 *
 * `new BoxGeometry` nasce centrada na origem, então uma perna que gira em
 * `rotation.x` gira em torno da própria cintura: o pé vai pra frente e a coxa
 * atravessa a barriga. Transladar a geometria pra baixo põe o pivô no quadril,
 * que é onde a perna de um bicho realmente dobra.
 */
function membro(w, h, d, mat, x, yTopo, z) {
  const m = box(w, h, d, mat, x, yTopo, z)
  m.geometry.translate(0, -h / 2, 0)
  return m
}

// ─────────────────────────────────────────────────────────────────────────────
// ANATOMIA POR ESPÉCIE.
//
// Antes tudo saía de `def.width` e `def.height` por multiplicação: o corpo era
// `width*0.72 × height*0.5 × width*1.5`, o que amarrava o COMPRIMENTO do bicho
// à largura dele e dava um porco tão comprido quanto largo, uma vaca sem
// focinho e uma ovelha de cara branca em corpo branco. Proporção derivada é
// exatamente o "sem sentido" do relato.
//
// Agora cada espécie tem os números dela, escritos à mão e conferidos contra a
// altura declarada em `MOB_TYPES` (a spec exige o modelo entre 85% e 115% da
// caixa de colisão — modelo que não preenche a própria caixa é bicho que apanha
// no ar).
//
// GAIT: cada perna carrega a FASE dela. Quadrúpede anda em trote diagonal
// (dianteira esquerda junto com a traseira direita); antes era `i % 2`, que
// punha as duas dianteiras juntas e as duas traseiras juntas — o bicho pulava
// como coelho. Bípede alterna. Aranha faz tetrápode alternado e varre no eixo Y,
// porque a perna dela aponta pra FORA: girar em X faria a pata riscar o chão de
// lado em vez de dar o passo.
// ─────────────────────────────────────────────────────────────────────────────

const TROTE = [0, Math.PI, Math.PI, 0] // FE, FD, TE, TD
const DIANTE = 1
const ATRAS = -1

/** Quatro patas nos cantos, com a fase do trote diagonal. */
function quatroPatas(g, pincel, cor, { larg, alt, dx, dz }, andar) {
  let i = 0
  for (const lado of [-1, 1]) {
    for (const ponta of [DIANTE, ATRAS]) {
      const p = membro(larg, alt, larg, pincel(cor, 21 + i), lado * dx, alt, ponta * dz)
      g.add(p)
      // ordem do TROTE: dianteira-esq, dianteira-dir, traseira-esq, traseira-dir
      const idx = (lado < 0 ? 0 : 1) + (ponta === DIANTE ? 0 : 2)
      andar.push({ mesh: p, parte: 'perna', fase: TROTE[idx], eixo: 'x', amp: 0.6 })
      i++
    }
  }
}
// ⚠️ A CABEÇA PRECISA DE UM DEGRAU. Aprendido olhando o turntable.
//
// Na primeira versão o porco e a vaca tinham a cabeça na MESMA altura do corpo
// e da mesma cor: de perfil viravam um pão com pernas, sem cabeça nenhuma. Não
// aparece em nenhuma medida — altura bate, peça encosta, nada flutua — e é a
// primeira coisa que o olho vê. A cabeça agora fica mais BAIXA que o dorso e
// avança pra frente, então o contorno tem ombro, pescoço e focinho.
function montarPorco(g, pincel, andar) {
  const pele = pincel(0xf0a5a2, 3)
  const casco = pincel(0x6b4a44, 7)
  const focinho = pincel(0xcf7d78, 11)
  quatroPatas(g, pincel, 0xd98a86, { larg: 0.18, alt: 0.34, dx: 0.2, dz: 0.28 }, andar)
  g.add(box(0.6, 0.48, 0.86, pele, 0, 0.58, 0))
  const cabeca = box(0.42, 0.38, 0.34, pele, 0, 0.54, 0.6)
  g.add(cabeca)
  g.add(box(0.2, 0.14, 0.1, focinho, 0, 0.5, 0.82))
  for (const s of [-1, 1]) g.add(box(0.12, 0.09, 0.05, pele, s * 0.13, 0.75, 0.56))
  g.add(box(0.07, 0.07, 0.12, casco, 0, 0.66, -0.49))
  return cabeca
}

function montarVaca(g, pincel, andar) {
  const couro = pincel(0x6b4a37, 3)
  const branco = pincel(0xd8d2c8, 5)
  const chifre = pincel(0xd6cdb4, 7)
  const rosa = pincel(0xd98a86, 9)
  // Perna mais curta e tronco mais fundo que na primeira versão: com 0.66 de
  // pata e 0.56 de tronco a vaca ficava de pernas de pau, mais mesa que bicho.
  quatroPatas(g, pincel, 0x4a3529, { larg: 0.21, alt: 0.58, dx: 0.26, dz: 0.32 }, andar)
  g.add(box(0.68, 0.62, 1.06, couro, 0, 0.89, 0))
  // ⚠️ MANCHA DE VACA NÃO É ETIQUETA.
  //
  // Eram duas faixas retangulares centradas, do mesmo tamanho, uma de cada
  // lado: no print pareciam adesivos colados no flanco. Mancha de verdade é
  // assimétrica e de tamanhos diferentes — cada caixa aqui é deslocada pra um
  // lado só, então aparece num flanco e some no outro.
  // A mancha das costas saiu: no print ela lia como uma SELA branca sobre o
  // lombo. Manchas ficam só nos flancos, e o branco baixou de 0xe8e4dc pra cá
  // porque branco puro sobre marrom escuro recorta demais e vira etiqueta.
  g.add(box(0.36, 0.22, 0.3, branco, 0.18, 1.0, 0.16))
  g.add(box(0.36, 0.16, 0.22, branco, -0.16, 0.82, -0.16))
  g.add(box(0.42, 0.15, 0.2, branco, 0.14, 0.76, 0.36))
  const cabeca = box(0.44, 0.44, 0.4, couro, 0, 0.88, 0.71)
  g.add(cabeca)
  g.add(box(0.26, 0.16, 0.09, branco, 0, 0.8, 0.95))
  for (const s of [-1, 1]) {
    g.add(box(0.07, 0.11, 0.07, chifre, s * 0.17, 1.16, 0.71))
    g.add(box(0.13, 0.07, 0.09, couro, s * 0.26, 1.02, 0.68))
  }
  g.add(box(0.2, 0.1, 0.22, rosa, 0, 0.53, -0.22))
  g.add(membro(0.06, 0.42, 0.06, couro, 0, 1.06, -0.56))
  return cabeca
}

function montarOvelha(g, pincel, andar) {
  const la = pincel(0xf2f0ea, 3)
  const cara = pincel(0x35302c, 5)
  quatroPatas(g, pincel, 0x35302c, { larg: 0.15, alt: 0.54, dx: 0.21, dz: 0.26 }, andar)
  g.add(box(0.74, 0.64, 0.96, la, 0, 0.86, 0))
  // A cara é ESCURA e fica ADIANTE E ABAIXO da lã. Escura porque cabeça branca
  // em corpo branco vira um travesseiro sem frente nem trás. Adiante e abaixo
  // porque, alinhada com o dorso, o velo a engolia: de perfil só aparecia uma
  // lasca escura atrás da lã.
  const cabeca = box(0.34, 0.34, 0.34, cara, 0, 0.8, 0.66)
  g.add(cabeca)
  g.add(box(0.38, 0.14, 0.2, la, 0, 1.0, 0.62))
  for (const s of [-1, 1]) g.add(box(0.09, 0.07, 0.13, cara, s * 0.2, 0.84, 0.6))
  g.add(box(0.11, 0.13, 0.07, la, 0, 1.02, -0.51))
  return cabeca
}

/**
 * O CREEPER.
 *
 * ⚠️ ELE É QUADRÚPEDE COM CORPO DE BÍPEDE, e é isso que o torna reconhecível.
 * As quatro patas são CURTAS e ficam quase debaixo do tronco (o corpo tem 0.26
 * de profundidade e as patas ficam a ±0.13), então de perfil ele lê como um
 * poste com pezinhos — não como um cachorro verde. Afastar as patas pro molde
 * do porco destruiria a silhueta.
 *
 * PROPORÇÃO: 26 unidades pra 1,7 m (6 de pata + 12 de tronco + 8 de cabeça),
 * que é a divisão do original. Como nos outros, tudo deriva de `V`, então mexer
 * na altura não descola uma peça da outra.
 *
 * ⚠️ A CARA É A ASSINATURA. Sem os dois olhos e a boca em T o bicho vira uma
 * caixa verde e ninguém sabe o que é. Ela é feita de caixas escuras RASAS
 * (0.03) grudadas na face frontal da cabeça — pintar seria textura nova, e
 * textura está congelada. Geometria não é textura: nada de arte de terceiro
 * entrou aqui, que é a regra de asset da casa.
 */
function montarCreeper(g, pincel, andar) {
  const V = 1.7 / 26
  const pele = pincel(0x4d9c33, 3)
  const manchaClara = pincel(0x67b247, 5)
  const manchaEscura = pincel(0x3a7a26, 7)
  const cara = pincel(0x0f1f0b, 9)
  const pe = pincel(0x3f7f2a, 11)

  const altPata = 6 * V
  const altTronco = 12 * V
  const larg = 8 * V
  const fundo = 4 * V

  quatroPatas(
    g,
    pincel,
    0x3f7f2a,
    { larg: fundo, alt: altPata, dx: fundo / 2, dz: fundo / 2 },
    andar,
  )
  g.add(box(larg, altTronco, fundo, pele, 0, altPata + altTronco / 2, 0))

  // Manchas: creeper de verdade é MALHADO, não verde chapado. Duas caixas
  // deslocadas pra um lado só, como na vaca — mancha simétrica vira etiqueta.
  g.add(box(2 * V, 5 * V, fundo + 0.004, manchaEscura, 2 * V, altPata + 8 * V, 0))
  g.add(box(3 * V, 3 * V, fundo + 0.004, manchaClara, -2 * V, altPata + 4 * V, 0))

  const yCabeca = altPata + altTronco + (8 * V) / 2
  const cabeca = box(larg, larg, larg, pele, 0, yCabeca, 0)
  g.add(cabeca)

  // A cara vai na cabeça (filha), não no grupo: assim ela vira junto quando o
  // bicho olha pro jogador. Presa no grupo, o creeper encararia você de nuca.
  const frente = larg / 2 + 0.015
  for (const s of [-1, 1]) {
    cabeca.add(box(2 * V, 2 * V, 0.03, cara, s * 2 * V, 1 * V, frente))
  }
  cabeca.add(box(2 * V, 3 * V, 0.03, cara, 0, -1.5 * V, frente))
  for (const s of [-1, 1]) {
    cabeca.add(box(2 * V, 2 * V, 0.03, cara, s * 2 * V, -3 * V, frente))
  }
  g.add(box(2 * V, 1.5 * V, 0.03, pe, 0, altPata + altTronco - 2 * V, fundo / 2 + 0.01))
  return cabeca
}

function montarGalinha(g, pincel, andar) {
  const pena = pincel(0xf2f2f2, 3)
  const bico = pincel(0xe8a020, 5)
  const crista = pincel(0xd23b2f, 7)
  let i = 0
  for (const s of [-1, 1]) {
    const p = membro(0.06, 0.24, 0.06, bico, s * 0.09, 0.24, 0)
    g.add(p)
    andar.push({ mesh: p, parte: 'perna', fase: i * Math.PI, eixo: 'x', amp: 0.7 })
    i++
  }
  g.add(box(0.28, 0.3, 0.38, pena, 0, 0.39, 0))
  g.add(box(0.22, 0.22, 0.08, pena, 0, 0.5, -0.22))
  const cabeca = box(0.2, 0.22, 0.2, pena, 0, 0.54, 0.16)
  g.add(cabeca)
  g.add(box(0.1, 0.07, 0.1, bico, 0, 0.52, 0.31))
  g.add(box(0.05, 0.1, 0.16, crista, 0, 0.68, 0.14))
  g.add(box(0.04, 0.08, 0.06, crista, 0, 0.45, 0.26))
  // Asa pendura do OMBRO. Como caixa centrada ela girava no próprio meio: a
  // ponta de cima entrava no corpo enquanto a de baixo saía. `membro` põe o
  // pivô em cima, que é onde a asa de um bicho de verdade se articula.
  const asas = []
  for (const s of [-1, 1]) {
    const a = membro(0.05, 0.2, 0.28, pena, s * 0.165, 0.5, -0.02)
    g.add(a)
    asas.push({ mesh: a, eixo: 'z', amp: 0.25, freq: 5.5, fase: s > 0 ? Math.PI : 0, base: 0 })
  }
  return { cabeca, ocioso: asas }
}
// ⚠️ OMBRO É O TOPO DO TRONCO, NÃO A ALTURA DA CABEÇA.
//
// O pior defeito que o turntable mostrou: o braço estava pendurado em y=1.76 e
// a cabeça ocupava 1.52 a 2.04. Os braços saíam DA CABEÇA — no print de frente
// os blocos azuis ladeavam o rosto verde, não o peito. Nenhuma medida
// geométrica reclamava, porque tudo encostava em tudo.
//
// PROPORÇÃO: a referência que o founder mandou é a divisão clássica de 32
// unidades pra 1,95 m — perna 12, tronco 12, cabeça 8. Tudo aqui deriva de
// `U`, então mexer na altura do bicho não descola mais uma peça da outra.
//
// A COR é procedural, feita pelo `grainTexture` daqui. A referência serviu de
// paleta e proporção; nenhuma textura de terceiro entrou no repo, que é a regra
// de asset da casa.
const U = 1.95 / 32

const CORPOS = {
  zombie: {
    pele: 0x6b9455,
    cara: 0x4e7a3c,
    camisa: 0x2fb3b8,
    calca: 0x4a44bd,
    pe: 0x8c8c8c,
    membro: 4 * U,
    tronco: 8 * U,
    fundo: 4 * U,
  },
  skeleton: {
    pele: 0xcfcfc6,
    cara: 0xdad8cf,
    camisa: 0xc4c4bb,
    calca: 0xb0b0a7,
    pe: 0xa8a89f,
    membro: 2.2 * U,
    tronco: 6 * U,
    fundo: 3.2 * U,
  },
  // O ALDEÃO USA O MESMO MOLDE HUMANOIDE do zumbi e do esqueleto, e só a paleta
  // muda: túnica marrom, avental, pele clara. Um terceiro `montar*` para a mesma
  // anatomia seria uma terceira cópia da conta de proporção — e é ela que
  // `mobModelo.spec.js` cobra bater com a caixa de colisão.
  aldeao: {
    pele: 0xc89a6a,
    cara: 0xbe8f5f,
    camisa: 0x7a5030,
    calca: 0x5a3f28,
    pe: 0x4a3322,
    membro: 3.4 * U,
    tronco: 7.4 * U,
    fundo: 3.8 * U,
  },
}

/**
 * O TRAJE DE CADA OFÍCIO.
 *
 * ⚠️ ANTES NÃO EXISTIA VARIAÇÃO NENHUMA. `buildMobModel` recebia só o tipo, era
 * chamado uma vez por mob e nunca consultava a profissão: os quatro ofícios
 * mudavam a CASA (fornalha, estante, alambique, baú) e as OFERTAS, e nunca o
 * boneco. Quatro aldeões idênticos numa praça, cada um vendendo outra coisa, é
 * uma vila que obriga a clicar em todos para saber quem é quem.
 *
 * ⚠️ E NÃO É CÓPIA DO BONECO DE OUTRO JOGO. O founder pediu "o villager do
 * original"; aquele personagem é design de outra empresa e este repo está em
 * loja. O que separa os quatro aqui é COR DE AVENTAL e CHAPÉU — o vocabulário
 * de ofício de qualquer feira medieval, e desenho nosso. A ler de vinte metros,
 * é a faixa de cor no peito que diz quem é quem.
 */
export const TRAJE_DO_OFICIO = Object.freeze({
  fazendeiro: { avental: 0xb8a75c, chapeu: 0xc9b46a },
  ferreiro: { avental: 0x4b3a2e, chapeu: 0x6d6d73 },
  bibliotecario: { avental: 0x8d3f3f, chapeu: 0x5c2f2f },
  clerigo: { avental: 0xd8d2c4, chapeu: 0xe6e1d6 },
})

/** O traje de um ofício, com o do fazendeiro como recuo. */
export const trajeDe = (oficio) => TRAJE_DO_OFICIO[oficio] || TRAJE_DO_OFICIO.fazendeiro

function montarHumanoide(g, pincel, andar, bracos, tipo, oficio = null) {
  const d = CORPOS[tipo]
  const ossudo = tipo === 'skeleton'
  const pele = pincel(d.pele, 3)
  const cara = pincel(d.cara, 7)
  const camisa = pincel(d.camisa, 11)
  const calca = pincel(d.calca, 13)

  const PERNA = 12 * U // 0.73
  const TRONCO = 12 * U
  const CABECA = 8 * U
  const OMBRO = PERNA + TRONCO

  // Pernas coladas no meio, como na referência: de longe elas formam UM bloco
  // de calça com uma costura, e não dois palitos separados.
  let i = 0
  for (const s of [-1, 1]) {
    const p = membro(d.membro, PERNA, d.fundo, calca, (s * d.membro) / 2, PERNA, 0)
    // O pé é FILHO da perna: acompanha o passo sem precisar de outra entrada de
    // animação, e é ele que dá o apoio visual no chão.
    p.add(box(d.membro + 0.006, 2 * U, d.fundo + 0.006, pincel(d.pe, 15), 0, -PERNA + U, 0))
    g.add(p)
    andar.push({ mesh: p, parte: 'perna', fase: i * Math.PI, eixo: 'x', amp: 0.65 })
    i++
  }

  g.add(box(d.tronco, TRONCO, d.fundo, camisa, 0, PERNA + TRONCO / 2, 0))
  // Clavícula: dá ao esqueleto o ombro largo sobre o tronco estreito, que é a
  // silhueta dele. Substituiu três anéis brancos em volta do peito que, no
  // print, pareciam múmia enfaixada — nada de costela.
  if (ossudo) g.add(box(10 * U, 1.6 * U, d.fundo + 0.006, pele, 0, OMBRO - 1.2 * U, 0))
  // Pescoço: aparece só um dedo acima da gola, como na referência.
  g.add(box(3 * U, 1.6 * U, 3 * U, cara, 0, OMBRO + 0.4 * U, 0.4 * U))

  const cabeca = box(CABECA, CABECA, CABECA, cara, 0, OMBRO + CABECA / 2, 0)
  g.add(cabeca)
  const olho = pincel(0x14180f, 17)
  for (const s of [-1, 1]) {
    g.add(box(2.6 * U, 1.4 * U, 0.06, olho, s * 1.7 * U, OMBRO + CABECA / 2 + 0.6 * U, CABECA / 2))
  }

  for (const s of [-1, 1]) {
    const b = membro(d.membro, PERNA, d.fundo, pele, s * (d.tronco / 2 + d.membro / 2), OMBRO, 0)
    // Manga: a camisa desce até o meio do braço e o antebraço fica de pele. É o
    // que separa o zumbi de um boneco monocromático a vinte metros.
    b.add(box(d.membro + 0.006, 5 * U, d.fundo + 0.006, camisa, 0, (-5 * U) / 2, 0))
    g.add(b)
    bracos.push(b)
  }

  if (ossudo) {
    // ⚠️ O ARCO É FILHO DO BRAÇO, não uma caixa solta perto dele.
    //
    // Antes eu o posicionei em coordenada de mundo, "onde o braço deveria
    // estar": o braço punha a mão em z≈0.72 e o arco ficava em z=0.40, boiando
    // ao lado do esqueleto. Pendurado no braço ele acompanha a pose sozinho.
    //
    // E o arco tem BRAÇOS ANGULADOS, não uma vareta reta — no primeiro print
    // ele lia como um graveto. Duas caixas inclinadas e a corda entre as pontas.
    const pose = -0.8
    bracos[0].rotation.x = pose * 0.6
    bracos[1].rotation.x = pose
    const madeira = pincel(0x7a5433, 19)
    const corda = pincel(0xf0ece2, 23)
    const arco = new THREE.Group()
    arco.position.set(0, -0.62, 0.07)
    arco.rotation.x = -pose // desfaz a pose do braço: o arco fica em pé
    const cima = box(0.06, 0.34, 0.07, madeira, 0, 0.21, -0.04)
    cima.rotation.x = -0.42
    const baixo = box(0.06, 0.34, 0.07, madeira, 0, -0.21, -0.04)
    baixo.rotation.x = 0.42
    arco.add(cima, baixo, box(0.07, 0.18, 0.08, madeira, 0, 0, 0))
    arco.add(box(0.03, 0.68, 0.03, corda, 0, 0, -0.14))
    bracos[1].add(arco)
  } else {
    // ⚠️ BRAÇO DO ZUMBI FICA AO LADO DO CORPO, e BALANÇA com o passo.
    //
    // A pose esticada pra frente era o clássico, mas a referência que o founder
    // mandou tem os braços caídos — e braço caído e rígido fica de manequim, por
    // isso ele entra na lista do passo, em contrafase com a perna do mesmo lado,
    // que é como um bípede anda.
    bracos.forEach((b, k) => {
      andar.push({ mesh: b, parte: 'braco', fase: k ? 0 : Math.PI, eixo: 'x', amp: 0.42 })
    })
  }

  // ── O ALDEÃO DEIXA DE SER UM ZUMBI REPINTADO ──────────────────────────────
  //
  // ⚠️ ELE ERA LITERALMENTE O MESMO MOLDE. Treze caixas idênticas às do zumbi,
  // com outra paleta — sem nariz, sem avental, sem nada de ofício. O comentário
  // de `CORPOS.aldeao` PROMETIA "túnica marrom, avental" e o corpo montado era
  // o genérico: o texto descrevia uma intenção que o código nunca cumpriu.
  //
  // O que entra aqui é o que faz a silhueta ler como GENTE QUE TRABALHA, e não
  // como monstro pintado de marrom: rosto com relevo, avental com alça, e a cor
  // do ofício onde ela é vista de longe.
  if (tipo === 'aldeao') {
    const t = trajeDe(oficio)
    // ⚠️ GRAVADO NO MODELO, e não só usado para pintar. A cor final mora numa
    // textura procedural que ninguém consegue ler de volta do material — então,
    // sem isto, "a profissão chegou no boneco?" vira pergunta sem resposta, que
    // é exatamente o defeito que esta onda conserta. Com o traje no `userData`,
    // o teste afirma a fiação em vez de tentar adivinhar pelo pixel.
    g.userData.traje = t
    g.userData.oficio = oficio || null
    const aventalP = pincel(t.avental, 29)
    const chapeuP = pincel(t.chapeu, 31)

    // ROSTO COM RELEVO. Uma cabeça cúbica com dois olhos pretos é a mesma cara
    // do zumbi. O que dá feição é a sombra que uma saliência joga: nariz e
    // sobrancelha custam duas caixas e mudam o bicho inteiro.
    const alturaDaCara = OMBRO + CABECA / 2
    g.add(box(2.2 * U, 2.8 * U, 1.7 * U, cara, 0, alturaDaCara - 0.7 * U, CABECA / 2))
    g.add(box(6.2 * U, 1 * U, 0.7 * U, pincel(d.calca, 33), 0, alturaDaCara + 1.5 * U, CABECA / 2))

    // AVENTAL: a peça que o comentário prometia. Chapa na frente do tronco, do
    // quadril ao meio do peito, mais as duas alças por cima do ombro. A alça é
    // o que impede o avental de ler como "camisa de outra cor".
    const alturaDoAvental = TRONCO * 0.62
    g.add(
      box(
        d.tronco * 0.82,
        alturaDoAvental,
        d.fundo + 0.01,
        aventalP,
        0,
        PERNA + alturaDoAvental / 2,
        0,
      ),
    )
    for (const s of [-1, 1]) {
      g.add(
        box(
          1.6 * U,
          TRONCO * 0.5,
          d.fundo + 0.012,
          aventalP,
          s * 2.4 * U,
          OMBRO - TRONCO * 0.25,
          0,
        ),
      )
    }

    // CHAPÉU do ofício: um pouco mais largo que a cabeça, para fazer aba. É a
    // segunda leitura de ofício, e a que sobrevive quando o peito está de costas.
    g.add(box(CABECA + 1.4 * U, 1.4 * U, CABECA + 1.4 * U, chapeuP, 0, OMBRO + CABECA + 0.2 * U, 0))

    // BRAÇOS RECOLHIDOS. O passo escreve `rotation.x` a cada quadro, então
    // qualquer pose em x é apagada; z é livre. Puxar os braços para dentro dá a
    // postura de quem espera atrás de um balcão, e continua balançando ao andar.
    for (const b of bracos) b.rotation.z = (b.position.x > 0 ? -1 : 1) * 0.16
  }
  return cabeca
}

function montarAranha(g, pincel, andar) {
  const quitina = pincel(0x4a332a, 3)
  const pelo = pincel(0x2b1c17, 5)
  // O cefalotórax ENCOSTA no abdômen e é mais CLARO que ele. Encosta porque
  // antes havia oito centímetros de ar entre os dois — cabeça flutuando, achada
  // pelo inventário de peças. Mais claro porque, na mesma cor, os dois viravam
  // um bloco preto só e a aranha perdia a frente.
  g.add(box(0.52, 0.36, 0.46, quitina, 0, 0.5, 0.26))
  g.add(box(0.7, 0.52, 0.62, pelo, 0, 0.52, -0.28))
  // ⚠️ A PATA ABRE PRA FORA ENQUANTO DESCE.
  //
  // Antes eram oito caixas compridas no eixo Z presas nas laterais: pareciam
  // trilhos. Depois viraram fêmur horizontal + tíbia reta pra baixo, e no print
  // ficaram oito ripas verticais — uma mesa, não uma aranha. Agora a tíbia
  // inclina pra fora ao descer, que é o joelho de aranha.
  let i = 0
  for (const lado of [-1, 1]) {
    for (const z of [0.36, 0.14, -0.08, -0.3]) {
      const ombro = new THREE.Group()
      ombro.position.set(lado * 0.22, 0.5, z)
      const femur = box(0.3, 0.07, 0.07, quitina, lado * 0.15, 0.08, 0)
      const tibia = membro(0.07, 0.63, 0.07, quitina, lado * 0.3, 0.08, 0)
      tibia.rotation.z = lado * 0.42
      ombro.add(femur, tibia)
      g.add(ombro)
      // tetrápode alternado: 1-3-5-7 contra 2-4-6-8
      andar.push({ mesh: ombro, parte: 'perna', fase: i % 2 ? Math.PI : 0, eixo: 'y', amp: 0.34 })
      i++
    }
  }
  const brilho = new THREE.MeshStandardMaterial({
    color: 0xff2b1c,
    emissive: 0xff2b1c,
    emissiveIntensity: 2.2,
    roughness: 0.4,
  })
  g.userData.materiaisExtra = [brilho]
  for (const s of [-1, 1]) {
    g.add(box(0.09, 0.09, 0.05, brilho, s * 0.13, 0.58, 0.5))
    g.add(box(0.06, 0.06, 0.05, brilho, s * 0.2, 0.51, 0.49))
  }
  return null // aranha não vira a cabeça: ela vira o corpo inteiro
}

/**
 * Monta um bicho. Todo modelo olha para +Z (ver a convenção no topo).
 *
 * `userData`:
 *   andar    → [{ mesh, fase, eixo, amp }] passo, uma entrada por membro
 *   ocioso   → [{ mesh, eixo, amp, freq, fase }] respiro/asa, roda parado
 *   bracos   → membros de golpe (humanoides)
 *   cabeca   → o que acompanha o alvo, quando a espécie vira a cabeça
 *   materiais→ cópias a liberar no dispose
 */
// ── VIDA MARINHA ────────────────────────────────────────────────────────────
//
// "temos que modelar peixes, lulas, polvos, pinguins" — founder, 25/08/2026.
//
// Os quatro guardam suas partes móveis em `g.userData.nado`, e não em
// `andar`: o ciclo de andar é uma perna indo e voltando em torno do quadril, e
// o de nadar é uma ONDA que percorre o corpo de frente pra trás. Reaproveitar a
// lista de andar faria a cauda do peixe bater como uma perna — o movimento
// certo pro bicho errado.
function montarPeixe(g, pincel, nado, cor) {
  const corpo = pincel(cor)
  const barriga = pincel(0xdfe8ee)
  // ⚠️ A ORIGEM DO MODELO É O FUNDO DELE, como em todo bicho deste jogo: o
  // renderizador põe `group.position.y = mob.y` e `mobModelo.spec.js` exige
  // pé no chão com 4 cm de folga. Peixe não tem pé, mas tem a MESMA convenção —
  // inventar outra aqui faria o cardume nadar meio corpo dentro do leito.
  g.add(box(0.3, 0.22, 0.18, corpo, 0, 0.13, 0.01))
  g.add(box(0.26, 0.07, 0.14, barriga, 0, 0.05, 0.01))
  // Dorsal: é ela que leva o topo do modelo até a altura da caixa de colisão.
  g.add(box(0.03, 0.1, 0.14, corpo, 0, 0.265, -0.02))
  const cabeca = box(0.18, 0.18, 0.12, corpo, 0, 0.14, 0.14)
  g.add(cabeca)
  const olho = pincel(0x14181c)
  for (const s of [-1, 1]) g.add(box(0.05, 0.05, 0.04, olho, s * 0.07, 0.17, 0.19))
  // Cauda e peitorais entram na lista de NADO: a onda passa por elas.
  const cauda = box(0.04, 0.2, 0.16, corpo, 0, 0.14, -0.16)
  g.add(cauda)
  nado.push({ mesh: cauda, eixo: 'y', amp: 0.85, fase: 0 })
  for (const s of [-1, 1]) {
    const nadadeira = box(0.12, 0.03, 0.1, corpo, s * 0.16, 0.11, 0.03)
    g.add(nadadeira)
    nado.push({ mesh: nadadeira, eixo: 'z', amp: 0.5, fase: Math.PI * 0.5 * s })
  }
  return cabeca
}

/**
 * O DRAGÃO: corpo comprido, pescoço, cabeça, cauda em três gomos afinando, e
 * duas asas planas que BATEM pela lista de `nado` (o relógio vem de
 * `dragao.js`, como o do peixe vem de `nado.js`). Origem no fundo, como todo
 * bicho — ele voa, mas a convenção é uma só. Arte própria (Goal 21, 5.3).
 */
function montarDragao(g, pincel, nado) {
  const pele = pincel(0x1a1020)
  const barriga = pincel(0x2c2340)
  const membrana = pincel(0x3a2c55)
  const olho = pincel(0xc060ff)
  g.add(box(1.4, 1.2, 3.2, pele, 0, 0.9, 0))
  g.add(box(1.0, 0.5, 2.6, barriga, 0, 0.25, 0.1))
  g.add(box(0.7, 0.7, 1.4, pele, 0, 1.5, 2.0))
  const cabeca = box(1.0, 0.8, 1.2, pele, 0, 1.6, 3.1)
  g.add(cabeca)
  for (const s of [-1, 1]) {
    g.add(box(0.16, 0.16, 0.08, olho, s * 0.3, 1.8, 3.72))
    g.add(box(0.14, 0.4, 0.14, barriga, s * 0.32, 2.15, 2.75))
  }
  let z = -1.6
  for (const [w, d] of [
    [0.9, 1.4],
    [0.7, 1.4],
    [0.5, 1.6],
  ]) {
    const gomo = box(w, w, d, pele, 0, 0.9, z - d / 2)
    g.add(gomo)
    nado.push({ mesh: gomo, eixo: 'y', amp: 0.12, fase: z })
    z -= d
  }
  for (const s of [-1, 1]) {
    const asa = box(3.6, 0.08, 2.2, membrana, s * 2.4, 1.5, 0.2)
    g.add(asa)
    // Fases opostas: giradas em torno do próprio centro, as duas asas sobem juntas.
    nado.push({ mesh: asa, eixo: 'z', amp: 0.55, fase: s > 0 ? 0 : Math.PI })
    g.add(box(0.7, 0.12, 0.12, pele, s * 0.95, 1.55, 1.2))
  }
  return cabeca
}

function montarLula(g, pincel, pulsos) {
  const manto = pincel(0x39335e)
  const pele = pincel(0x453e6e)
  // De baixo pra cima: os braços tocam o chão (origem), o manto sobe até a
  // altura declarada. Lula é bicho de manto ALTO e cabeça baixa — a proporção
  // invertida vira polvo.
  const base = box(0.5, 0.2, 0.48, pele, 0, 0.4, 0)
  g.add(base)
  g.add(box(0.46, 0.3, 0.44, manto, 0, 0.63, 0))
  g.add(box(0.3, 0.14, 0.28, manto, 0, 0.83, 0))
  // A cabeça é a parte dos OLHOS, e ela avança: o teste de anatomia exige que a
  // cabeça de bicho não-colunar fique à frente, e é a mesma regra que impede um
  // bicho de nadar de ré sem ninguém notar.
  const cabeca = box(0.3, 0.18, 0.16, pele, 0, 0.4, 0.2)
  g.add(cabeca)
  const olho = pincel(0xf2e9c8)
  const pupila = pincel(0x14121c)
  for (const s of [-1, 1]) {
    g.add(box(0.1, 0.12, 0.05, olho, s * 0.1, 0.41, 0.27))
    g.add(box(0.05, 0.07, 0.04, pupila, s * 0.1, 0.41, 0.29))
  }
  // Oito braços que abrem e fecham JUNTOS — o pulso da lula. Fase igual em
  // todos, de propósito: é a única diferença de animação para o polvo.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const braco = box(0.08, 0.3, 0.08, pele, Math.sin(a) * 0.16, 0.15, Math.cos(a) * 0.16)
    g.add(braco)
    pulsos.push({ mesh: braco, dirX: Math.sin(a), dirZ: Math.cos(a), raio: 0.16, fase: 0 })
  }
  return cabeca
}

function montarPolvo(g, pincel, pulsos) {
  const couro = pincel(0x8c3f5d)
  const pele = pincel(0xa8536f)
  const base = box(0.5, 0.16, 0.48, pele, 0, 0.4, 0)
  g.add(base)
  g.add(box(0.62, 0.28, 0.58, couro, 0, 0.56, 0))
  const cabeca = box(0.34, 0.2, 0.16, couro, 0, 0.5, 0.24)
  g.add(cabeca)
  const olho = pincel(0xf5efd6)
  const pupila = pincel(0x1a1218)
  for (const s of [-1, 1]) {
    g.add(box(0.14, 0.14, 0.05, olho, s * 0.15, 0.56, 0.28))
    g.add(box(0.06, 0.08, 0.04, pupila, s * 0.15, 0.56, 0.3))
  }
  // Oito braços longos, cada um com a SUA fase: é o desencontro entre eles que
  // faz o polvo parecer polvo. Em fase, viram uma saia rodando — que é
  // exatamente o que a lula faz, e é só isso que separa os dois em movimento.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const braco = box(0.09, 0.36, 0.09, pele, Math.sin(a) * 0.2, 0.18, Math.cos(a) * 0.2)
    g.add(braco)
    pulsos.push({ mesh: braco, dirX: Math.sin(a), dirZ: Math.cos(a), raio: 0.2, fase: a })
  }
  return cabeca
}

function montarPinguim(g, pincel, andar, nado) {
  const casaca = pincel(0x1c1c22)
  const peito = pincel(0xf2f2ee)
  const bico = pincel(0xe8a33d)
  g.add(box(0.42, 0.44, 0.34, casaca, 0, 0.38, 0))
  g.add(box(0.28, 0.34, 0.06, peito, 0, 0.36, 0.16))
  // A cabeça avança um pouco: pinguim de pé se inclina pra frente, e o teste de
  // anatomia exige cabeça à frente em bicho que não é colunar.
  const cabeca = box(0.3, 0.24, 0.28, casaca, 0, 0.7, 0.06)
  g.add(cabeca)
  g.add(box(0.1, 0.07, 0.12, bico, 0, 0.66, 0.22))
  const olho = pincel(0xf5f5f0)
  for (const s of [-1, 1]) g.add(box(0.06, 0.06, 0.04, olho, s * 0.08, 0.74, 0.19))
  // As asas são nadadeira debaixo d'água e braço fora dela: a MESMA peça,
  // movida pela lista de nado.
  for (const s of [-1, 1]) {
    const asa = box(0.06, 0.26, 0.16, casaca, s * 0.22, 0.4, 0)
    g.add(asa)
    nado.push({ mesh: asa, eixo: 'z', amp: 0.9, fase: Math.PI * (s > 0 ? 0 : 1) })
  }
  for (const s of [-1, 1]) {
    const pe = membro(0.14, 0.16, 0.22, bico, s * 0.12, 0.16, 0.03)
    g.add(pe)
    andar.push({ mesh: pe, parte: 'perna', fase: s > 0 ? 0 : Math.PI, eixo: 'x', amp: 0.65 })
  }
  return cabeca
}

/**
 * @param {string} type  o tipo do bicho
 * @param {boolean} shadows
 * @param {string|null} oficio  a profissão, quando o bicho é aldeão. ⚠️ ESTE
 *   TERCEIRO PARÂMETRO É A ONDA INTEIRA: sem ele, `buildMobModel` não tinha
 *   como saber que aldeão é qual, e os quatro ofícios saíam idênticos.
 */
export function buildMobModel(type, shadows, oficio = null) {
  const g = new THREE.Group()
  const pintaveis = []
  const pincel = pincelDe(pintaveis)
  const andar = []
  const bracos = []
  let cabeca = null
  let ocioso = []

  // `nado` é a onda que percorre o corpo (cauda, nadadeira, asa); `pulsos` é a
  // contração radial dos braços de lula e polvo. São duas listas porque são
  // dois movimentos diferentes — ver a nota acima de `montarPeixe`.
  const nado = []
  const pulsos = []

  if (type === 'dragao') {
    cabeca = montarDragao(g, pincel, nado)
  } else if (type === 'fish') {
    cabeca = montarPeixe(g, pincel, nado, 0x5b9ec7)
  } else if (type === 'squid') {
    cabeca = montarLula(g, pincel, pulsos)
  } else if (type === 'octopus') {
    cabeca = montarPolvo(g, pincel, pulsos)
  } else if (type === 'penguin') {
    cabeca = montarPinguim(g, pincel, andar, nado)
  } else if (type === 'zombie' || type === 'skeleton' || type === 'aldeao') {
    cabeca = montarHumanoide(g, pincel, andar, bracos, type, oficio)
  } else if (type === 'spider') {
    cabeca = montarAranha(g, pincel, andar)
  } else if (type === 'creeper') {
    cabeca = montarCreeper(g, pincel, andar)
  } else if (type === 'cow') {
    cabeca = montarVaca(g, pincel, andar)
  } else if (type === 'sheep') {
    cabeca = montarOvelha(g, pincel, andar)
  } else if (type === 'chicken') {
    const r = montarGalinha(g, pincel, andar)
    cabeca = r.cabeca
    ocioso = r.ocioso
  } else {
    cabeca = montarPorco(g, pincel, andar)
  }

  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = shadows
      o.receiveShadow = shadows
    }
  })
  g.userData.andar = andar
  // ⚠️ O ALDEÃO PARADO ERA UMA ESTÁTUA. `ocioso` só era preenchido pela galinha;
  // humanoide sem velocidade tem amplitude zero no passo e congela no lugar. Um
  // respiro lento no tronco e um olhar que vira devagar custam duas entradas e
  // separam "NPC" de "manequim de vitrine".
  if (type === 'aldeao' && cabeca) {
    ocioso = [
      ...ocioso,
      { mesh: cabeca, eixo: 'y', amp: 0.26, freq: 0.55, fase: 0 },
      { mesh: g.children[2] || cabeca, eixo: 'x', amp: 0.015, freq: 1.1, fase: 1.4 },
    ]
  }
  g.userData.ocioso = ocioso
  g.userData.nado = nado
  g.userData.pulsos = pulsos
  g.userData.bracos = bracos
  g.userData.cabeca = cabeca
  // `pintaveis` é o que o flash de dano pode mexer; `materiais` é o que o
  // dispose tem que liberar. Os olhos da aranha entram só na segunda.
  g.userData.pintaveis = pintaveis
  g.userData.materiais = pintaveis.concat(g.userData.materiaisExtra || [])
  return g
}

// Avatar de jogador remoto: corpo blocky + placa com o nome.
//
// A cor da camisa saía de um hash do NOME. Dois nomes vizinhos no espaço do
// hash davam dois bonecos quase iguais, e numa sala de três ninguém sabia quem
// era quem (relato do founder, 2026-08-22). Agora a aparência vem de uma SKIN
// escolhida - um conjunto fechado de paletas que se distinguem de longe -, e o
// hash só decide pra quem não escolheu.
export function buildPlayerModel(name, shadows, skinId, uid) {
  const g = new THREE.Group()
  const pal = skinDe(skinId, uid || name)
  const shirt = bodyMaterial(pal.camisa, 11)
  const skin = bodyMaterial(pal.pele, 3)
  const pants = bodyMaterial(pal.calca, 5)
  const hair = bodyMaterial(pal.cabelo, 17)
  const legs = []
  const arms = []
  g.add(box(0.5, 0.72, 0.26, shirt, 0, 1.14, 0))
  g.add(box(0.5, 0.5, 0.5, skin, 0, 1.75, 0))
  // Cabelo: casca fina em cima e atrás da cabeça. É o que faz duas skins de
  // pele parecida ainda se distinguirem a 20 metros, quando a camisa já virou
  // um pixel.
  g.add(box(0.54, 0.14, 0.54, hair, 0, 1.95, 0))
  g.add(box(0.54, 0.3, 0.1, hair, 0, 1.8, -0.23))
  for (const s of [-1, 1]) {
    const leg = box(0.22, 0.76, 0.24, pants, s * 0.13, 0, 0)
    leg.geometry.translate(0, -0.38, 0)
    leg.position.y = 0.78
    g.add(leg)
    legs.push(leg)
    const arm = box(0.2, 0.7, 0.22, shirt, s * 0.35, 0, 0)
    arm.geometry.translate(0, -0.35, 0)
    arm.position.y = 1.72
    g.add(arm)
    arms.push(arm)
  }
  g.userData.legs = legs
  g.userData.arms = arms
  g.userData.skinId = skinId || ''

  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  const label = (name || 'Player').slice(0, 16)
  ctx.font = 'bold 30px -apple-system, BlinkMacSystemFont, sans-serif'
  const tw = Math.min(240, ctx.measureText(label).width + 26)
  ctx.fillStyle = 'rgba(8,14,24,0.66)'
  if (ctx.roundRect) {
    ctx.beginPath()
    ctx.roundRect((256 - tw) / 2, 12, tw, 40, 10)
    ctx.fill()
  } else ctx.fillRect((256 - tw) / 2, 12, tw, 40)
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, 128, 33)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }),
  )
  sprite.scale.set(1.6, 0.4, 1)
  sprite.position.y = 2.28
  sprite.renderOrder = 999
  g.add(sprite)
  g.userData.tag = { sprite, tex }

  g.traverse((o) => {
    if (o.isMesh) o.castShadow = shadows
  })
  return g
}

export function createEntityLayer(scene, { shadows = true, particles = true } = {}) {
  const mobGroup = new THREE.Group()
  const playerGroup = new THREE.Group()
  const dropGroup = new THREE.Group()
  const fxGroup = new THREE.Group()
  scene.add(mobGroup, playerGroup, dropGroup, fxGroup)

  const mobs = new Map() // id → { group, target }
  const players = new Map()
  const drops = new Map()
  const flechas = new Map()
  const bursts = []

  // Libera um bicho por inteiro: geometria E as cópias de material dele.
  //
  // Só a geometria era liberada. Cada bicho carrega 5 a 8 cópias de material
  // (elas existem pra que o flash de dano não vaze pros outros) e a aranha
  // ainda cria o material dos olhos na mão — com 26 bichos vivos e o rodízio de
  // spawn e despawn da noite inteira, isso é vazamento de verdade. A textura
  // NÃO é liberada aqui de propósito: o `map` é do cache e é compartilhado.
  function soltarMob(group) {
    group.traverse((o) => o.geometry?.dispose?.())
    for (const m of group.userData.materiais || []) m.dispose()
  }

  // ── Criaturas ─────────────────────────────────────────────────────────────
  function syncMobs(list, dt) {
    const seen = new Set()
    for (const m of list) {
      seen.add(m.id)
      let e = mobs.get(m.id)
      if (!e) {
        const group = buildMobModel(m.type, shadows, m.profissao)
        group.position.set(m.x, m.y, m.z)
        mobGroup.add(group)
        e = { group, target: { x: m.x, y: m.y, z: m.z, yaw: m.yaw }, flash: 0, passo: 0 }
        mobs.set(m.id, e)
      }
      e.target.x = m.x
      e.target.y = m.y
      e.target.z = m.z
      e.target.yaw = m.yaw
      e.flash = m.hurtFlash || 0
      // interpolação: o mob remoto chega a 8 Hz, o frame roda a 60
      const k = Math.min(1, dt * 14)
      const ax = e.group.position.x
      const az = e.group.position.z
      e.group.position.x += (e.target.x - ax) * k
      e.group.position.y += (e.target.y - e.group.position.y) * k
      e.group.position.z += (e.target.z - az) * k

      // ORIENTAÇÃO. `mob.yaw` é a direção pra onde ele OLHA, e o modelo olha
      // pra +Z: `anguloDeFrente(sin, cos)` fecha a conta. Antes era
      // `rotation.y = yaw` num modelo de cara pra −Z, e o bicho andava de ré.
      // O giro é interpolado, senão a cabeça estala a cada pacote de rede.
      //
      // Passar `sin/cos` em vez do ângulo direto não é rodeio: é o que põe os
      // dois tipos de personagem na MESMA regra, com as duas semânticas de yaw
      // visíveis lado a lado (o bicho guarda rumo, o jogador guarda ângulo de
      // câmera), e é o que barra NaN — `rotation.y = NaN` faz o three descartar
      // a matriz e o bicho SOME da tela, sem erro no console.
      const alvo = anguloDeFrente(Math.sin(m.yaw), Math.cos(m.yaw))
      e.group.rotation.y = girarPara(e.group.rotation.y, alvo, dt * 9)

      // PASSO PELA VELOCIDADE OBSERVADA, não por `mob.anim`.
      //
      // `anim` só existe no host: `unpackMobs` devolve 0 e o convidado via o
      // bicho DESLIZAR de pernas paradas. Medir o deslocamento do próprio grupo
      // funciona nos dois lados, e é o mesmo caminho que o jogador remoto já
      // usa.
      const vel = Math.hypot(e.group.position.x - ax, e.group.position.z - az) / Math.max(dt, 1e-4)
      e.passo += Math.min(vel, 6) * dt * 3.4
      const amp = Math.min(1, vel / 1.6)
      for (const p of e.group.userData.andar || []) {
        p.mesh.rotation[p.eixo] = Math.sin(e.passo * 2 + p.fase) * p.amp * amp
      }
      // ── NADO ────────────────────────────────────────────────────────────
      //
      // O relógio vem do MOB (`faseNado`, avançado em `nado.js`) e não daqui.
      // Animação amarrada ao relógio de desenho acelera quando o jogo engasga,
      // e um cardume inteiro acelerando junto é a coisa mais fácil de notar
      // numa queda de quadro.
      //
      // A onda percorre o corpo: cada peça entra com a SUA fase, e é o atraso
      // entre elas que faz a cauda parecer empurrar água em vez de abanar.
      const fase = m.faseNado || 0
      for (const n of e.group.userData.nado || []) {
        n.mesh.rotation[n.eixo] = Math.sin(fase + n.fase) * n.amp
      }
      // O PULSO de lula e polvo: os braços abrem e fecham RADIALMENTE, e por
      // isso o que muda é a posição, não a rotação. Girar os braços em torno do
      // próprio eixo não abriria nada — eles são simétricos.
      for (const q of e.group.userData.pulsos || []) {
        const abre = 0.72 + 0.28 * Math.sin(fase * 1.3 + q.fase)
        q.mesh.position.x = q.dirX * q.raio * abre
        q.mesh.position.z = q.dirZ * q.raio * abre
        q.mesh.rotation.x = q.dirZ * (abre - 1) * 1.6
        q.mesh.rotation.z = -q.dirX * (abre - 1) * 1.6
      }
      // INCLINAÇÃO. Peixe que sobe aponta o nariz pra cima; sem isto ele sobe
      // deitado, como um elevador com olhos. Só a vida marinha tem: bicho de
      // terra não inclina, e aplicar em todos deixaria a vaca torta em ladeira.
      if (m.pitch !== undefined) {
        e.group.rotation.x = girarPara(e.group.rotation.x, -m.pitch, dt * 6)
      }

      // Respiro / asa: roda mesmo parado, senão bicho ocioso vira estátua.
      e.ocio = (e.ocio || 0) + dt
      for (const o of e.group.userData.ocioso || []) {
        o.mesh.rotation[o.eixo] = (o.base || 0) + Math.sin(e.ocio * o.freq + o.fase) * o.amp
      }

      // Flash vermelho ao apanhar. Só nos materiais DESTE bicho — eles são
      // cópias justamente pra isto (ver `pincelDe`). Com o material do cache,
      // bater num porco acendia todos os porcos do mapa.
      const mats = e.group.userData.pintaveis || []
      // ⚠️ O PAVIO PRECISA SER VISTO ANTES DE SER OUVIDO. O creeper chega
      // quieto e o jogador só tem 1,5 s: sem o bicho piscar e INCHAR, a única
      // pista seria a barra de vida sumindo. O ritmo acelera com o pavio (de
      // ~6 Hz pra ~18 Hz) porque piscar em ritmo constante lê como decoração, e
      // acelerando lê como contagem regressiva.
      const pavio = Math.max(0, m.pavio || 0)
      if (e.flash > 0) {
        for (const mt of mats) {
          if (!mt.emissive) continue
          mt.emissive.setRGB(0.8, 0.05, 0.05)
          mt.emissiveIntensity = e.flash * 2
        }
      } else if (pavio > 0) {
        const p = Math.min(1, pavio / 1.5)
        const pulso = 0.5 + 0.5 * Math.sin(pavio * (6 + p * 12) * Math.PI)
        for (const mt of mats) {
          if (!mt.emissive) continue
          mt.emissive.setRGB(1, 0.98, 0.86)
          // ⚠️ TETO BAIXO, E ELE CUSTOU UMA FOTO. A primeira versão ia até 2.0
          // de intensidade: no print o creeper virou um RETÂNGULO BRANCO CHAPADO
          // — sem cara, sem pernas, sem silhueta. O jogador precisa reconhecer
          // QUE COISA está piscando, senão o aviso não avisa nada. Aqui o pulso
          // clareia o verde e deixa a cara legível o tempo todo.
          mt.emissiveIntensity = pulso * (0.12 + p * 0.5)
        }
      } else if (e.wasFlash || e.wasPavio) {
        for (const mt of mats) {
          if (!mt.emissive) continue
          mt.emissive.setRGB(0, 0, 0)
          mt.emissiveIntensity = 0
        }
      }
      // TAMANHO = FILHOTE × INCHAÇO, nesta ordem e num lugar só.
      //
      // ⚠️ Eram duas escritas concorrentes em `scale` na primeira versão desta
      // rodada: o pavio do creeper e o porte do filhote. Quem escrevesse por
      // último ganhava, e um filhote perto de um creeper aceso mudava de
      // tamanho sozinho. Uma conta só, todo quadro, resolve.
      //
      // O 0.55 é o mesmo fator da caixa de colisão em `mobs.js` — se os dois
      // divergirem, o bezerro apanha no ar.
      const porte = m.bebe > 0 ? 0.55 : 1
      const alvoEscala = porte * (1 + Math.min(1, pavio / 1.5) * 0.22)
      if (e.group.scale.x !== alvoEscala) e.group.scale.setScalar(alvoEscala)
      e.wasFlash = e.flash > 0
      e.wasPavio = pavio > 0
    }
    for (const [id, e] of mobs) {
      if (seen.has(id)) continue
      mobGroup.remove(e.group)
      soltarMob(e.group)
      mobs.delete(id)
    }
  }

  // ── Jogadores remotos ─────────────────────────────────────────────────────
  function syncPlayers(list, dt) {
    const seen = new Set()
    for (const p of list) {
      seen.add(p.uid)
      let e = players.get(p.uid)
      // Trocar de skin no meio da partida reconstrói o boneco. É raro e barato,
      // e evita ter que trocar material de sete partes na mão.
      if (e && e.group.userData.skinId !== (p.skin || '')) {
        playerGroup.remove(e.group)
        e.group.traverse((o) => o.geometry?.dispose?.())
        e.group.userData.tag?.tex?.dispose?.()
        players.delete(p.uid)
        e = null
      }
      if (!e) {
        const group = buildPlayerModel(p.name, shadows, p.skin, p.uid)
        group.position.set(p.x, p.y, p.z)
        playerGroup.add(group)
        e = { group, target: { ...p }, prev: { x: p.x, z: p.z }, walk: 0, golpe: 0, agindo: '' }
        players.set(p.uid, e)
      }
      e.target = p
      const k = Math.min(1, dt * 12)
      const dx = p.x - e.group.position.x
      const dz = p.z - e.group.position.z
      e.group.position.x += dx * k
      e.group.position.y += (p.y - e.group.position.y) * k
      e.group.position.z += dz * k
      // Mesma regra do bicho, semântica de yaw diferente: aqui é ângulo de
      // CÂMERA, e `direcaoDoOlhar` diz que ele olha pra (sin yaw, −cos yaw).
      e.group.rotation.y = girarPara(
        e.group.rotation.y,
        anguloDeFrente(Math.sin(p.yaw), -Math.cos(p.yaw)),
        dt * 16,
      )
      const speed = Math.hypot(dx, dz)
      e.walk += speed * 6
      const swing = Math.sin(e.walk) * Math.min(0.7, speed * 9)
      const legs = e.group.userData.legs
      const arms = e.group.userData.arms
      if (legs) {
        legs[0].rotation.x = swing
        legs[1].rotation.x = -swing
      }
      if (arms) {
        arms[0].rotation.x = -swing
        arms[1].rotation.x = swing
      }

      // GOLPE. Enquanto `act` chega, o ciclo se repete; quando para de chegar,
      // termina o ciclo em curso em vez de cortar o braço no meio do arco.
      //
      // `act` é presença, não evento: chega a ~10 Hz e pode se perder. Por isso
      // o cliente conta o tempo do golpe LOCALMENTE (0.36 s por ciclo, o mesmo
      // da mão em primeira pessoa) em vez de tentar sincronizar quadro a quadro
      // com a rede - sincronizar daria um braço tremendo a cada pacote perdido.
      const querGolpear = p.act === 'dig' || p.act === 'hit'
      if (querGolpear) e.agindo = p.act
      if (e.agindo) {
        e.golpe += dt / 0.36
        if (e.golpe >= 1) {
          e.golpe = 0
          // Só solta o braço no FIM do arco. Cortar no meio deixa o boneco com
          // o braço travado no ar até o próximo pacote.
          if (!querGolpear) e.agindo = ''
        }
      }
      if (arms && e.agindo) {
        // O braço direito é o que bate; o outro segue o passo.
        const c = curvaDeGolpe(e.golpe)
        arms[1].rotation.x = -c * 2.1
        arms[1].rotation.z = -c * 0.35
      } else if (arms) {
        arms[1].rotation.z = 0
      }
    }
    for (const [uid, e] of players) {
      if (seen.has(uid)) continue
      playerGroup.remove(e.group)
      e.group.traverse((o) => o.geometry?.dispose?.())
      e.group.userData.tag?.tex?.dispose?.()
      players.delete(uid)
    }
  }

  // ── Itens caídos ──────────────────────────────────────────────────────────
  const dropGeo = new THREE.BoxGeometry(0.28, 0.28, 0.28)
  // Haste comprida no eixo Z porque é o eixo que `lookAt` alinha com o alvo.
  // Feita no eixo errado, a flecha voaria de través — e "de través" foi
  // exatamente o defeito que a caixa de item já teve neste arquivo.
  const flechaGeo = new THREE.BoxGeometry(0.06, 0.06, 0.62)
  const flechaMat = new THREE.MeshStandardMaterial({ color: 0x9a8b74, roughness: 0.9 })
  // O FRASCO (poção arremessável) é um cubinho da cor do líquido. Um material
  // por cor, guardado: oito poções, oito materiais, e nunca um por frasco.
  const frascoGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22)
  const frascoMats = new Map()
  const frascoMat = (cor) => {
    let m = frascoMats.get(cor)
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color: cor,
        roughness: 0.35,
        emissive: new THREE.Color(cor).multiplyScalar(0.25),
      })
      frascoMats.set(cor, m)
    }
    return m
  }
  function syncDrops(list, dt, timeSeconds) {
    const seen = new Set()
    for (const d of list) {
      seen.add(d.id)
      let e = drops.get(d.id)
      if (!e) {
        const mat = new THREE.MeshStandardMaterial({
          color: d.color || 0xcccccc,
          roughness: 0.7,
          metalness: 0.1,
          emissive: new THREE.Color(d.color || 0xcccccc).multiplyScalar(0.08),
        })
        const mesh = new THREE.Mesh(dropGeo, mat)
        mesh.castShadow = shadows
        dropGroup.add(mesh)
        e = { mesh, mat }
        drops.set(d.id, e)
      }
      // flutua e gira - o "isto é pegável" sem precisar de HUD
      e.mesh.position.set(d.x, d.y + 0.22 + Math.sin(timeSeconds * 2.2 + d.phase) * 0.07, d.z)
      e.mesh.rotation.y = timeSeconds * 1.4 + d.phase
    }
    for (const [id, e] of drops) {
      if (seen.has(id)) continue
      dropGroup.remove(e.mesh)
      e.mat.dispose()
      drops.delete(id)
    }
  }

  /**
   * FLECHAS.
   *
   * ⚠️ ELA PRECISA APONTAR PRA ONDE VAI. Uma caixinha voando de lado lê como
   * "bug de partícula", não como flecha: o jogador não entende que aquilo vem
   * na direção dele e não aprende a se abrigar. `lookAt` no ponto seguinte da
   * trajetória resolve, e de graça — a velocidade já está no objeto.
   *
   * A geometria é compartilhada e o material é UM só pra todas: flecha não
   * pisca, não muda de cor e não recebe dano. Um material por flecha seria
   * dezenas de `dispose` por minuto sem nenhum ganho.
   */
  function syncFlechas(list) {
    const seen = new Set()
    for (const f of list) {
      seen.add(f.id)
      let e = flechas.get(f.id)
      if (!e) {
        const frasco = f.forma === 'frasco'
        const mesh = frasco
          ? new THREE.Mesh(frascoGeo, frascoMat(f.cor ?? 0xcccccc))
          : new THREE.Mesh(flechaGeo, flechaMat)
        mesh.castShadow = shadows
        fxGroup.add(mesh)
        e = { mesh, frasco }
        flechas.set(f.id, e)
      }
      e.mesh.position.set(f.x, f.y, f.z)
      // O frasco gira em vez de apontar: ele não tem ponta.
      if (e.frasco) e.mesh.rotation.set(f.idade * 6, f.idade * 4, 0)
      else e.mesh.lookAt(f.x + f.vx, f.y + f.vy, f.z + f.vz)
    }
    for (const [id, e] of flechas) {
      if (seen.has(id)) continue
      fxGroup.remove(e.mesh)
      flechas.delete(id)
    }
  }

  // ── Partículas de quebra ──────────────────────────────────────────────────
  // ── BORRIFO DA CACHOEIRA ───────────────────────────────────────────────
  //
  // ⚠️ UMA MALHA SÓ, RECICLADA — e não uma por leva como o estilhaço faz.
  //
  // Estilhaço é EVENTO: o bloco quebra, nascem 18 cacos, morrem em 2,2 s.
  // Criar e destruir uma `InstancedMesh` por evento é barato porque o evento é
  // raro. Cachoeira não é evento, é REGIME: ela emite enquanto o jogador
  // estiver por perto. Com o padrão do estilhaço seriam dezenas de alocações de
  // GPU por segundo, pra sempre — e o coletor de lixo cobraria isso em engasgo.
  //
  // Aqui a malha nasce uma vez com `TETO` instâncias e as sobrando ficam
  // escondidas fora da vista.
  let borrifoMesh = null
  let borrifoGotas = []
  const _mB = new THREE.Matrix4()
  const _vB = new THREE.Vector3()
  const _sB = new THREE.Vector3()
  const _qB = new THREE.Quaternion()

  function garantirBorrifo() {
    if (borrifoMesh) return borrifoMesh
    const geo = new THREE.BoxGeometry(1, 1, 1)
    const mat = new THREE.MeshBasicMaterial({
      color: 0xf2f8ff,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    })
    borrifoMesh = new THREE.InstancedMesh(geo, mat, BORRIFO_TETO)
    borrifoMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    borrifoMesh.frustumCulled = false
    borrifoMesh.count = 0
    fxGroup.add(borrifoMesh)
    return borrifoMesh
  }

  /** Entrega a névoa deste quadro. Lista vazia = cachoeira longe ou nenhuma. */
  function syncBorrifo(gotas) {
    if (!particles) return
    borrifoGotas = gotas
    if (!gotas.length) {
      if (borrifoMesh) borrifoMesh.count = 0
      return
    }
    const m = garantirBorrifo()
    const n = Math.min(gotas.length, BORRIFO_TETO)
    for (let i = 0; i < n; i++) {
      const g = gotas[i]
      // A gota ENCOLHE ao morrer em vez de só apagar: `InstancedMesh` divide um
      // material só, então opacidade por instância não existe. Escala é a única
      // via de fade que sobra, e ela funciona — névoa some ficando fina.
      const k = g.s * opacidadeDaGota(g)
      _vB.set(g.x, g.y, g.z)
      _sB.set(k, k, k)
      _mB.compose(_vB, _qB, _sB)
      borrifoMesh.setMatrixAt(i, _mB)
    }
    borrifoMesh.count = n
    borrifoMesh.instanceMatrix.needsUpdate = true
  }

  const partGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1)
  function spawnBreak(x, y, z, colorHex) {
    if (!particles) return
    const mat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 1 })
    const cacos = criarEstilhacos(x, y, z, 18)
    const mesh = new THREE.InstancedMesh(partGeo, mat, cacos.length)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    fxGroup.add(mesh)
    // Vive bem mais que os 0,85 s de antes, e o piso é a BASE da célula
    // quebrada — que é o topo do bloco de baixo, onde o caco tem que bater.
    bursts.push({ mesh, mat, parts: cacos, chao: y, life: 2.2, max: 2.2 })
  }

  const _m4 = new THREE.Matrix4()
  const _q = new THREE.Quaternion()
  const _e = new THREE.Euler()
  const _v = new THREE.Vector3()
  const _s = new THREE.Vector3()
  function stepParticles(dt) {
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i]
      b.life -= dt
      if (b.life <= 0) {
        fxGroup.remove(b.mesh)
        b.mesh.dispose()
        b.mat.dispose()
        bursts.splice(i, 1)
        continue
      }
      // Simulação em `estilhaco.js`: quique, atrito e repouso são afirmáveis por
      // teste lá, sem three no caminho.
      passoEstilhacos(b.parts, dt, b.chao)
      // ⚠️ Some só no FIM. Antes a escala caía junto com a vida desde o quadro
      // zero, então o caco encolhia no ar durante o voo inteiro e nunca chegava
      // ao chão com tamanho — o quique não teria o que mostrar.
      const t = b.life / b.max
      const fade = t > 0.25 ? 1 : t / 0.25
      b.parts.forEach((p, idx) => {
        _v.set(p.x, p.y, p.z)
        _e.set(p.rx, p.ry, 0)
        _q.setFromEuler(_e)
        _s.setScalar(p.s * fade)
        _m4.compose(_v, _q, _s)
        b.mesh.setMatrixAt(idx, _m4)
      })
      b.mesh.instanceMatrix.needsUpdate = true
      b.mat.opacity = fade
    }
  }

  function dispose() {
    for (const e of mobs.values()) soltarMob(e.group)
    for (const e of players.values()) {
      e.group.traverse((o) => o.geometry?.dispose?.())
      e.group.userData.tag?.tex?.dispose?.()
    }
    for (const e of drops.values()) e.mat.dispose()
    for (const b of bursts) {
      b.mesh.dispose()
      b.mat.dispose()
    }
    bursts.length = 0
    mobs.clear()
    players.clear()
    drops.clear()
    flechas.clear()
    dropGeo.dispose()
    partGeo.dispose()
    flechaGeo.dispose()
    flechaMat.dispose()
    frascoGeo.dispose()
    for (const m of frascoMats.values()) m.dispose()
    frascoMats.clear()
    for (const m of matCache.values()) {
      m.map?.dispose()
      m.dispose()
    }
    matCache.clear()
    if (borrifoMesh) {
      fxGroup.remove(borrifoMesh)
      borrifoMesh.geometry.dispose()
      borrifoMesh.material.dispose()
      borrifoMesh = null
      borrifoGotas = []
    }
    scene.remove(mobGroup, playerGroup, dropGroup, fxGroup)
  }

  return {
    syncMobs,
    syncPlayers,
    syncDrops,
    syncFlechas,
    spawnBreak,
    syncBorrifo,
    stepParticles,
    dispose,
    mobs,
    players,
  }
}
