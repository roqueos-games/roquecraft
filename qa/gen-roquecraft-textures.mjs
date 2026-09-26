// Gera as texturas PBR do RoqueCraft - 100% procedurais, 100% autorais, 100%
// CC0 (nada de asset da Mojang: o risco de IP é real e a regra 36-games proíbe).
//
// Saída (committada, servida estática):
//   public/games/roquecraft/tex/blocks_albedo.png   grade de tiles 64×64
//   public/games/roquecraft/tex/blocks_normal.png   normal map derivado da altura
//   public/games/roquecraft/tex/blocks_mer.png      R=AO  G=roughness  B=emissivo
//   public/games/roquecraft/tex/items.png           ícones 32×32
//   public/games/roquecraft/tex/manifest.json       ordem das camadas
//
// Por que isto é o maior salto visual do projeto: a referência usa tiles 16×16
// com uma cor chapada por pixel. Aqui cada tile tem 64×64, um campo de ALTURA
// que vira NORMAL MAP (relevo real sob a luz direcional), um canal de RUGOSIDADE
// (a pedra molhada do fundo do rio reflete, a areia não) e um de EMISSÃO (a lava
// e a glowstone brilham de verdade no bloom). O ruído é TILEÁVEL por construção,
// então o greedy meshing pode repetir a textura por 16 blocos sem costura.
//
// Uso: node scripts/gen-roquecraft-textures.mjs

import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dirname, '..', 'public', 'games', 'roquecraft', 'tex')

const S = 64 // resolução do tile de bloco

// ── PNG mínimo (sem dependência externa) ────────────────────────────────────
function crc32(buf) {
  let c
  const table =
    crc32.table ||
    (crc32.table = (() => {
      const t = new Int32Array(256)
      for (let n = 0; n < 256; n++) {
        c = n
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
        t[n] = c
      }
      return t
    })())
  let crc = -1
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff]
  return (crc ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

// rgba: Uint8Array de w*h*4
function encodePNG(rgba, w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0 // filtro None
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ── Ruído TILEÁVEL ──────────────────────────────────────────────────────────
// Hash sobre coordenada tomada em módulo do período: o tile emenda consigo
// mesmo, que é o requisito pro greedy meshing repetir sem costura visível.
function hash2(x, y, seed) {
  let h = (Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2147483647)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
const fade = (t) => t * t * (3 - 2 * t)
const lerp = (a, b, t) => a + (b - a) * t
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v)

// valor 0..1, período `p` em pixels (tileável quando S % p === 0)
function vnoise(x, y, p, seed) {
  const fx = x / p
  const fy = y / p
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const tx = fade(fx - x0)
  const ty = fade(fy - y0)
  const per = S / p
  const wrap = (v) => ((v % per) + per) % per
  const a = hash2(wrap(x0), wrap(y0), seed)
  const b = hash2(wrap(x0 + 1), wrap(y0), seed)
  const c = hash2(wrap(x0), wrap(y0 + 1), seed)
  const d = hash2(wrap(x0 + 1), wrap(y0 + 1), seed)
  return lerp(lerp(a, b, tx), lerp(c, d, tx), ty)
}

// Ganho 0.6 (nao 0.5): com a queda padrao de 1/2, a oitava base leva ~52% da
// energia e a textura vira MANCHA - a terra de perto parecia camuflagem, com
// uns 16 borroes por face em vez de grao de solo (QA de 2026-08-19). Com 0.6 o
// detalhe fino sobe de ~6% pra ~15% e a face ganha textura de verdade a um
// palmo da camera, sem virar chuvisco.
const FBM_GAIN = 0.6

function fbm(x, y, p, seed, octaves = 4) {
  let sum = 0
  let amp = 1
  let norm = 0
  let per = p
  for (let i = 0; i < octaves && per >= 1; i++) {
    sum += vnoise(x, y, per, seed + i * 71) * amp
    norm += amp
    amp *= FBM_GAIN
    per /= 2
  }
  return sum / norm
}

// Voronoi tileável (distância ao 2º menos ao 1º dá a "argamassa" entre pedras)
function voronoi(x, y, cells, seed) {
  const g = S / cells
  const cx = Math.floor(x / g)
  const cy = Math.floor(y / g)
  let d1 = 1e9
  let d2 = 1e9
  let id = 0
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const wx = (((cx + dx) % cells) + cells) % cells
      const wy = (((cy + dy) % cells) + cells) % cells
      const px = (cx + dx + hash2(wx, wy, seed)) * g
      const py = (cy + dy + hash2(wx, wy, seed + 999)) * g
      const d = Math.hypot(x - px, y - py)
      if (d < d1) {
        d2 = d1
        d1 = d
        id = hash2(wx, wy, seed + 3131)
      } else if (d < d2) d2 = d
    }
  }
  return { edge: (d2 - d1) / g, id, dist: d1 / g }
}

// ── Tela de trabalho ────────────────────────────────────────────────────────
function canvas(size = S) {
  return {
    size,
    al: new Float32Array(size * size * 3), // albedo linear 0..1
    hg: new Float32Array(size * size), // altura 0..1 (vira normal map)
    ro: new Float32Array(size * size).fill(0.85), // rugosidade
    em: new Float32Array(size * size), // emissão
    ao: new Float32Array(size * size).fill(1), // oclusão embutida
    al_a: new Float32Array(size * size).fill(1), // alfa (recorte)
  }
}

// sRGB -> linear. Os buffers de albedo sao LINEARES (o encoder aplica srgb() na
// gravacao). Sem esta conversao, um 0x8b8b90 escolhido a olho como "cinza medio"
// entrava como 0.545 LINEAR e saia gravado como sRGB 196 - quase branco. Era a
// causa sistemica do mundo pastel/lavado: as 81 texturas nasciam ~1.4x mais
// claras do que a cor escolhida, e ai o sol de meio-dia estourava o resto.
const lin = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
const hex = (h) => [lin(((h >> 16) & 255) / 255), lin(((h >> 8) & 255) / 255), lin((h & 255) / 255)]

function px(c, x, y, rgb, a = 1) {
  const i = (y * c.size + x) * 3
  c.al[i] = rgb[0]
  c.al[i + 1] = rgb[1]
  c.al[i + 2] = rgb[2]
  c.al_a[y * c.size + x] = a
}

function each(c, fn) {
  for (let y = 0; y < c.size; y++) for (let x = 0; x < c.size; x++) fn(x, y)
}

const shade = (rgb, k) => [clamp(rgb[0] * k), clamp(rgb[1] * k), clamp(rgb[2] * k)]
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]

// ── Receitas de textura ─────────────────────────────────────────────────────
// Cada receita pinta albedo + altura + rugosidade (+ emissão quando brilha).

const T = {}

// PEDRA: grão fino uniforme e nada mais.
//
// A versão anterior somava uma mancha de período 8 e um "veio" de período 32
// sobre o grão. Estrutura grande num tile de 64 não lê como rocha: lê como
// DESENHO, e como o mesmo tile repete em toda parede de caverna, o desenho
// vira um padrão reconhecível — no mostruário de 2026-08-22 apareciam umas
// lápides claras repetindo bloco a bloco. Pedra de voxel é ruído fino e poucos
// tons; a variação grande quem dá é o mundo (minério, musgo, luz), não o tile.
T.stone = (c) => {
  const base = hex(0x8a8a90)
  each(c, (x, y) => {
    const grao = fbm(x, y, 32, 11, 5)
    const medio = fbm(x, y, 16, 23, 3)
    const t = grao * 0.74 + medio * 0.26
    let col = shade(base, 0.8 + t * 0.42)
    // sal e pimenta esparso: é o que faz a face ler como mineral e não como
    // papel de parede cinza
    // Célula de 2px (p=32 em tile 64), do tamanho da quadra do acabamento: é
    // grão, não mancha. Com p=24 saíam borrões de meia face que repetiam
    // visivelmente de bloco em bloco.
    if (vnoise(x, y, 32, 57) > 0.78) col = shade(col, 0.84)
    else if (vnoise(x, y, 32, 91) < 0.22) col = shade(col, 1.12)
    px(c, x, y, col)
    c.hg[y * c.size + x] = t * 0.55
    c.ro[y * c.size + x] = 0.74 + grao * 0.18
  })
}

T.deepslate = (c) => {
  T.stone(c)
  each(c, (x, y) => {
    const i = (y * c.size + x) * 3
    const streak = fbm(x * 0.4, y * 2.2, 32, 77, 4)
    const col = mix([c.al[i], c.al[i + 1], c.al[i + 2]], hex(0x3b3b42), 0.72 + streak * 0.2)
    px(c, x, y, col)
    c.ro[y * c.size + x] = 0.6
  })
}

T.cobblestone = (c) => {
  each(c, (x, y) => {
    const v = voronoi(x, y, 5, 7)
    const inMortar = v.edge < 0.16
    const tone = 0.72 + v.id * 0.45
    const grain = fbm(x, y, 16, 31, 4)
    let col = shade(hex(0x8f8f93), tone * (0.85 + grain * 0.3))
    if (inMortar) col = shade(hex(0x4e4e52), 0.9 + grain * 0.25)
    px(c, x, y, col)
    // pedras salientes, argamassa afundada → normal map com relevo forte
    c.hg[y * c.size + x] = inMortar
      ? 0.08 + grain * 0.05
      : 0.55 + clamp(v.edge * 1.6) * 0.4 + grain * 0.1
    c.ro[y * c.size + x] = inMortar ? 0.95 : 0.68 + grain * 0.2
    c.ao[y * c.size + x] = inMortar ? 0.55 : 1
  })
}

T.mossy_cobblestone = (c) => {
  T.cobblestone(c)
  each(c, (x, y) => {
    const i = (y * c.size + x) * 3
    const moss = clamp((fbm(x, y, 16, 91, 4) - 0.42) * 3.4)
    if (moss <= 0) return
    const col = mix([c.al[i], c.al[i + 1], c.al[i + 2]], hex(0x4f7433), moss)
    px(c, x, y, col)
    c.ro[y * c.size + x] = lerp(c.ro[y * c.size + x], 0.95, moss)
    c.hg[y * c.size + x] += moss * 0.08
  })
}

T.granite = (c) => {
  each(c, (x, y) => {
    const g = fbm(x, y, 16, 5, 4)
    const fleck = vnoise(x, y, 2, 17)
    let col = shade(hex(0xa3675a), 0.85 + g * 0.35)
    if (fleck > 0.82) col = hex(0xe0d3ca)
    else if (fleck < 0.16) col = shade(hex(0x5c3a34), 1)
    px(c, x, y, col)
    c.hg[y * c.size + x] = g * 0.5 + fleck * 0.3
    c.ro[y * c.size + x] = 0.55 + g * 0.25
  })
}

T.diorite = (c) => {
  each(c, (x, y) => {
    const g = fbm(x, y, 16, 55, 4)
    const fleck = vnoise(x, y, 2, 61)
    let col = shade(hex(0xdedede), 0.88 + g * 0.24)
    if (fleck > 0.84) col = hex(0x9a9a9a)
    else if (fleck < 0.14) col = hex(0x5f5f5f)
    px(c, x, y, col)
    c.hg[y * c.size + x] = g * 0.5 + fleck * 0.3
    c.ro[y * c.size + x] = 0.5 + g * 0.25
  })
}

T.andesite = (c) => {
  each(c, (x, y) => {
    const g = fbm(x, y, 16, 88, 4)
    const fleck = vnoise(x, y, 2, 12)
    let col = shade(hex(0x8e9091), 0.86 + g * 0.28)
    if (fleck > 0.85) col = hex(0xb6b8b8)
    px(c, x, y, col)
    c.hg[y * c.size + x] = g * 0.5
    c.ro[y * c.size + x] = 0.62 + g * 0.2
  })
}

T.bedrock = (c) => {
  each(c, (x, y) => {
    const v = voronoi(x, y, 7, 3)
    const g = fbm(x, y, 8, 19, 4)
    const col = shade(hex(0x2b2b30), 0.5 + v.id * 1.1 + g * 0.3)
    px(c, x, y, col)
    c.hg[y * c.size + x] = v.dist * 0.6 + g * 0.4
    c.ro[y * c.size + x] = 0.9
  })
}

T.dirt = (c) => {
  each(c, (x, y) => {
    const g = fbm(x, y, 16, 101, 5)
    const clod = vnoise(x, y, 4, 202)
    let col = shade(hex(0x7a5334), 0.78 + g * 0.42)
    col = mix(col, hex(0x4c331d), Math.pow(clod, 4) * 0.6)
    px(c, x, y, col)
    c.hg[y * c.size + x] = g * 0.7 + clod * 0.3
    c.ro[y * c.size + x] = 0.94
  })
}

T.podzol_top = (c) => {
  T.dirt(c)
  each(c, (x, y) => {
    const i = (y * c.size + x) * 3
    const n = fbm(x, y, 8, 303, 4)
    px(c, x, y, mix([c.al[i], c.al[i + 1], c.al[i + 2]], hex(0x4a3116), 0.55 + n * 0.35))
  })
}

T.podzol_side = (c) => {
  T.dirt(c)
  each(c, (x, y) => {
    if (y > c.size * 0.22) return
    const n = fbm(x, y, 8, 305, 4)
    px(c, x, y, mix(hex(0x4a3116), hex(0x6b4a22), n))
    c.hg[y * c.size + x] += 0.15
  })
}

// SOLO ARADO, seco e molhado.
//
// O tile precisa dizer DUAS coisas de longe, e o original resolve as duas com a
// mesma imagem: que ali foi passada a enxada (sulcos paralelos) e se aquilo tem
// agua por perto (mais escuro). Sao dois tiles porque o estado é do BLOCO, e o
// mesher escolhe a camada — nao ha custo de shader nisso.
//
// Os sulcos correm no eixo X e sao de periodo 16 num tile de 64: quatro sulcos
// por bloco, que e o que lê como terra revirada sem virar zebra quando o greedy
// junta dezesseis blocos num quad só.
function soloArado(c, molhado) {
  // ⚠️ A PRIMEIRA VERSÃO VIROU UM DECK DE MADEIRA.
  //
  // Era um seno puro no eixo Y, quatro cristas perfeitas de ponta a ponta, com
  // a base num marrom avermelhado: a foto de QA mostrou um assoalho envernizado
  // no meio da grama. Terra revirada não tem régua — o sulco ondula, quebra e
  // some no torrão. O que conserta é ondular a FASE do sulco com ruído e deixar
  // o torrão dominar por cima, não mexer na amplitude.
  const seco = hex(0x6a4c31)
  const umido = hex(0x402b19)
  const base = molhado ? umido : seco
  each(c, (x, y) => {
    const g = fbm(x, y, 16, 101, 5)
    const torrao = vnoise(x, y, 5, 303)
    const grao = vnoise(x, y, 12, 707)
    // O sulco anda no Y, mas a fase depende do X: a crista serpenteia em vez de
    // ser uma reta, que é o que separa canteiro de tábua corrida.
    const onda = fbm(x, y, 7, 404, 3) - 0.5
    const sulco = Math.sin((y / c.size) * Math.PI * 2 * 4 + onda * 2.2)
    // O torrão APAGA o sulco onde há terra solta amontoada.
    const forca = 0.55 + (1 - torrao) * 0.45
    let col = shade(base, 0.8 + g * 0.34 + sulco * 0.09 * forca + (grao - 0.5) * 0.12)
    col = mix(col, shade(base, 0.58), Math.pow(torrao, 3) * 0.65)
    px(c, x, y, col)
    c.hg[y * c.size + x] = 0.42 + sulco * 0.26 * forca + g * 0.28 + torrao * 0.18
    // terra molhada reflete; terra seca nao. E o canal que faz a diferenca
    // aparecer sob a luz direcional, e nao so na cor.
    c.ro[y * c.size + x] = molhado ? 0.42 : 0.95
  })
}
T.farmland = (c) => soloArado(c, false)
T.farmland_wet = (c) => soloArado(c, true)

T.grass_top = (c) => {
  each(c, (x, y) => {
    // Cinza-esverdeado NEUTRO: a cor real vem do tint de bioma (atributo de
    // vértice). Guardar a cor final aqui congelaria a selva e a savana na mesma
    // cor da planície.
    const blade = fbm(x, y, 8, 404, 5)
    const clump = fbm(x, y, 24, 405, 3)
    // contraste alto no cinza neutro: é o que faz a grama ter DESENHO depois de
    // multiplicada pela cor do bioma, em vez de virar um chapado
    // em sRGB, e sem estourar: a versao antiga chegava a 1.30 e clipava em 1.0,
    // matando justamente o DESENHO que o ruido criava (a grama virava chapado)
    const v = lin(0.4 + blade * 0.3 + clump * 0.14)
    px(c, x, y, [v * 0.98, v * 1.04, v * 0.88])
    c.hg[y * c.size + x] = blade * 0.8 + clump * 0.2
    c.ro[y * c.size + x] = 0.96
  })
}

T.grass_side = (c) => {
  T.dirt(c)
  const fringe = c.size * 0.3
  each(c, (x, y) => {
    const n = fbm(x, y, 6, 406, 4)
    const edge = fringe * (0.6 + n * 0.8)
    if (y > edge) return
    // A franja e pintada de VERDE aqui porque a face lateral nao recebe tint de
    // bioma (tintFaces: [2] em blocks.js - o tint pegaria a terra junto). Sem
    // isto a franja saia CINZA e virava uma faixa de "neve" na beira de todo
    // barranco (QA de 2026-08-19).
    const k = 0.8 + n * 0.45

    px(c, x, y, [lin(0.35) * k, lin(0.57) * k, lin(0.23) * k])
    c.hg[y * c.size + x] = 0.4 + n * 0.5
    c.ro[y * c.size + x] = 0.96
  })
}

T.moss = (c) => {
  each(c, (x, y) => {
    const n = fbm(x, y, 8, 407, 5)
    const v = lin(0.38 + n * 0.3)
    px(c, x, y, [v * 0.9, v, v * 0.7])
    c.hg[y * c.size + x] = n
    c.ro[y * c.size + x] = 0.98
  })
}

T.sand = (c) => {
  each(c, (x, y) => {
    const g = fbm(x, y, 4, 501, 4)
    const dune = fbm(x, y, 32, 502, 2)
    const col = shade(hex(0xdfd0a0), 0.88 + g * 0.2 + dune * 0.1)
    px(c, x, y, col)
    c.hg[y * c.size + x] = g * 0.5 + dune * 0.5
    c.ro[y * c.size + x] = 0.99
  })
}

T.red_sand = (c) => {
  T.sand(c)
  each(c, (x, y) => {
    const i = (y * c.size + x) * 3
    px(c, x, y, mix([c.al[i], c.al[i + 1], c.al[i + 2]], hex(0xbb6532), 0.7))
  })
}

T.gravel = (c) => {
  each(c, (x, y) => {
    const v = voronoi(x, y, 9, 601)
    const g = fbm(x, y, 8, 602, 3)
    const col = shade(mix(hex(0x8b8580), hex(0x5c5854), v.id), 0.8 + g * 0.4)
    px(c, x, y, col)
    c.hg[y * c.size + x] = clamp(1 - v.dist * 1.3) * 0.8 + g * 0.2
    c.ro[y * c.size + x] = 0.9
    c.ao[y * c.size + x] = v.edge < 0.1 ? 0.6 : 1
  })
}

T.clay = (c) => {
  each(c, (x, y) => {
    const g = fbm(x, y, 16, 701, 4)
    px(c, x, y, shade(hex(0xa4a7b5), 0.9 + g * 0.2))
    c.hg[y * c.size + x] = g * 0.3
    c.ro[y * c.size + x] = 0.75
  })
}

T.terracotta = (c) => {
  each(c, (x, y) => {
    const g = fbm(x, y, 16, 702, 4)
    const streak = fbm(x * 3, y * 0.4, 32, 703, 3)
    px(c, x, y, shade(mix(hex(0x9a5b45), hex(0x7d4634), streak), 0.9 + g * 0.22))
    c.hg[y * c.size + x] = g * 0.3
    c.ro[y * c.size + x] = 0.7
  })
}

T.snow = (c) => {
  each(c, (x, y) => {
    const g = fbm(x, y, 8, 801, 5)
    const sparkle = vnoise(x, y, 2, 802) > 0.93 ? 1 : 0
    const v = lin(0.86 + g * 0.09)
    px(c, x, y, [v, v, Math.min(1, v * 1.02)])
    c.hg[y * c.size + x] = g * 0.4
    c.ro[y * c.size + x] = sparkle ? 0.18 : 0.55 + g * 0.2
  })
}

T.ice = (c) => {
  each(c, (x, y) => {
    const crack = Math.pow(clamp(1 - voronoi(x, y, 4, 803).edge * 3), 6)
    const g = fbm(x, y, 16, 804, 4)
    const col = mix(hex(0x93c4ef), hex(0xd6ecff), g * 0.6 + crack * 0.4)
    px(c, x, y, col)
    c.hg[y * c.size + x] = crack * 0.5 + g * 0.2
    c.ro[y * c.size + x] = 0.08 + crack * 0.2
  })
}

T.water = (c) => {
  each(c, (x, y) => {
    const w = fbm(x, y, 16, 901, 4)
    const col = mix(hex(0x1f5f9e), hex(0x2f86c8), w)
    px(c, x, y, col, 0.72)
    c.hg[y * c.size + x] = w
    c.ro[y * c.size + x] = 0.04
  })
}

T.lava = (c) => {
  each(c, (x, y) => {
    const flow = fbm(x, y, 16, 902, 4)
    const crust = clamp((fbm(x, y, 8, 903, 4) - 0.42) * 3)
    const hot = mix(hex(0xffd24a), hex(0xff5a1a), flow)
    const col = mix(hot, hex(0x4a1508), crust * 0.85)
    px(c, x, y, col)
    c.hg[y * c.size + x] = flow * 0.6 + crust * 0.4
    c.ro[y * c.size + x] = 0.55
    c.em[y * c.size + x] = clamp(1 - crust * 0.9)
  })
}

// ── Madeira ────────────────────────────────────────────────────────────────
// CASCA: sulco vertical em faixas, não degradê.
//
// A versão anterior era `fbm(x*4, y*0.35)` — ruído esticado. De perto o tronco
// saía liso com uns riscos de fantasma e um nó desenhado à mão no canto; no
// mostruário de 2026-08-22 era a peça mais fraca da parede. Casca de verdade
// tem SULCO: faixas verticais de largura irregular, algumas fundas e escuras.
//
// A faixa tem dois pixels de largura porque o `acabamento` agrupa em quadras
// de dois — faixa de um pixel seria mediada com a vizinha e sumiria.
function logSide(c, light, dark, semente = 1001) {
  each(c, (x, y) => {
    const faixa = Math.floor(x / 2)
    const tom = hash2(faixa, 3, semente)
    const fundo = hash2(faixa, 9, semente) > 0.76
    // variação AO LONGO da fibra, pra faixa não virar código de barras
    const veio = fbm(x, y, 32, semente, 4)
    let col = mix(hex(light), hex(dark), 0.2 + tom * 0.6 + veio * 0.24)
    if (fundo) col = shade(col, 0.6)
    px(c, x, y, col)
    c.hg[y * c.size + x] = fundo ? 0.1 : 0.45 + tom * 0.35 + veio * 0.2
    c.ro[y * c.size + x] = 0.84
  })
}
function logTop(c, light, dark) {
  each(c, (x, y) => {
    const cx = x - c.size / 2 + 0.5
    const cy = y - c.size / 2 + 0.5
    const r = Math.hypot(cx, cy) / (c.size / 2)
    const ring = Math.sin(r * 34 + fbm(x, y, 16, 1002, 3) * 3) * 0.5 + 0.5
    const col = mix(hex(light), hex(dark), ring * 0.55 + r * 0.2)
    px(c, x, y, col)
    c.hg[y * c.size + x] = ring * 0.6
    c.ro[y * c.size + x] = 0.8
  })
}
T.oak_log = (c) => logSide(c, 0x9a7444, 0x5c4426)
T.oak_log_top = (c) => logTop(c, 0xc09a5c, 0x8a6a38)
// BÉTULA: o desenho da bétula É a lenticela — os traços escuros horizontais.
// Sem eles o tronco fica um retângulo bege e o jogador não distingue bétula de
// carvalho a três blocos de distância. Os traços são deitados e de dois pixels
// de altura, senão o `agrupar` come.
T.birch_log = (c) => {
  each(c, (x, y) => {
    const fibra = fbm(x, y, 32, 1101, 3)
    const linha = Math.floor(y / 2)
    const faixa = hash2(linha, 5, 1102)
    const traco = faixa > 0.66 && vnoise(x, linha, 6, 1103) > 0.52
    const col = traco
      ? shade(hex(0x413b33), 0.9 + fibra * 0.3)
      : mix(hex(0xeae6da), hex(0xc6c0ae), fibra * 0.9)
    px(c, x, y, col)
    c.hg[y * c.size + x] = traco ? 0.12 : 0.5 + fibra * 0.3
    c.ro[y * c.size + x] = 0.86
  })
}
T.birch_log_top = (c) => logTop(c, 0xdcd3b8, 0xb0a684)
T.spruce_log = (c) => logSide(c, 0x6b4a2c, 0x3a2716, 1011)
T.spruce_log_top = (c) => logTop(c, 0x9d7345, 0x6a4c2a)
T.jungle_log = (c) => logSide(c, 0x8a6b3f, 0x4d3a20, 1021)
T.jungle_log_top = (c) => logTop(c, 0xb8975e, 0x7f6335)

function planks(c, light, dark) {
  const rows = 4
  const h = c.size / rows
  each(c, (x, y) => {
    const row = Math.floor(y / h)
    const inRow = y - row * h
    const seam = inRow < 1.5 ? 1 : 0
    // junta vertical deslocada por fileira
    const off = (row % 2) * (c.size / 2)
    const vseam = Math.abs(((x + off) % c.size) - c.size / 2) < 1 ? 1 : 0
    const fiber = fbm(x * 3, y * 0.3 + row * 17, 32, 1201, 4)
    let col = mix(hex(light), hex(dark), fiber * 0.7 + (row % 2) * 0.06)
    if (seam || vseam) col = shade(col, 0.52)
    px(c, x, y, col)
    c.hg[y * c.size + x] = seam || vseam ? 0.05 : 0.45 + fiber * 0.4
    c.ro[y * c.size + x] = 0.78
    c.ao[y * c.size + x] = seam || vseam ? 0.6 : 1
  })
}
T.oak_planks = (c) => planks(c, 0xbb9660, 0x8a6c3c)

// ── A PORTA (Goal 21, arte própria liberada em 18/09) ───────────────────────
//
// Duas metades, cada uma um tile: folha de tábua vertical com moldura, dois
// painéis rebaixados por metade, e na de CIMA uma janela de quatro vidros com
// cruzeta — o vidro é transparente de verdade (alfa), por isso `cutout`. A
// dobradiça fica à esquerda (x pequeno), do lado onde a forma gira.
function porta(c, cima) {
  const light = 0xbb9660
  const dark = 0x8a6c3c
  const moldura = 0x5a3f22
  const S = c.size
  const m = Math.round(S * 0.1) // largura da moldura
  each(c, (x, y) => {
    // fibra VERTICAL, ao contrário da tábua do piso
    const fiber = fbm(y * 3, x * 0.3, 32, 1301, 4)
    let col = mix(hex(light), hex(dark), fiber * 0.7)
    let hg = 0.45 + fiber * 0.4
    let alfa = 1
    const naMoldura = x < m || x >= S - m || y < m || y >= S - m
    // a barra do meio da metade: separa os dois painéis rebaixados
    const barra = Math.abs(y - S / 2) < m / 2
    if (naMoldura || barra) {
      col = mix(hex(moldura), col, 0.35)
      hg = 0.9
    } else {
      // painel rebaixado, com a sombra da moldura na borda interna
      const dm = Math.min(x - m, S - m - 1 - x, Math.abs(y - S / 2) - m / 2, y - m, S - m - 1 - y)
      if (dm < 2) {
        col = shade(col, 0.55)
        hg = 0.25
      } else {
        hg = 0.35 + fiber * 0.3
      }
    }
    // a janela: só na metade de cima, no painel superior
    if (cima && y > m + 2 && y < S / 2 - m / 2 - 2 && x > m + 4 && x < S - m - 4) {
      const cx = S / 2
      const cy = (m + S / 2 - m / 2) / 2
      const cruzeta = Math.abs(x - cx) < 1.5 || Math.abs(y - cy) < 1.5
      if (cruzeta) {
        col = mix(hex(moldura), col, 0.4)
        hg = 0.8
      } else {
        col = hex(0xeaf7ff)
        alfa = 0.18
        hg = 0.5
      }
    }
    px(c, x, y, col, alfa)
    c.hg[y * S + x] = hg
    c.ro[y * S + x] = alfa < 1 ? 0.05 : 0.78
    c.ao[y * S + x] = naMoldura || barra ? 1 : 0.92
  })
}
T.oak_door_bottom = (c) => porta(c, false)
T.oak_door_top = (c) => porta(c, true)

// O ALÇAPÃO: moldura de carvalho escuro com três tábuas horizontais dentro e
// um par de pregos em cada tábua. Arte nossa (Goal 21, 18/09).
function alcapao(c) {
  const light = 0xbb9660
  const dark = 0x8a6c3c
  const moldura = 0x5a3f22
  const prego = 0x3a3a3a
  const S = c.size
  const m = Math.round(S * 0.1)
  const tabuas = 3
  const alturaDaTabua = (S - 2 * m) / tabuas
  each(c, (x, y) => {
    const fiber = fbm(x * 3, y * 0.3, 32, 1777, 4)
    let col = mix(hex(light), hex(dark), fiber * 0.7)
    let hg = 0.45 + fiber * 0.4
    const naMoldura = x < m || x >= S - m || y < m || y >= S - m
    const dentro = (y - m) % alturaDaTabua
    const fresta = !naMoldura && dentro < 1
    if (naMoldura) {
      col = mix(hex(moldura), col, 0.35)
      hg = 0.9
    } else if (fresta) {
      col = shade(col, 0.5)
      hg = 0.2
    } else {
      const t = Math.floor((y - m) / alturaDaTabua)
      const cy = m + (t + 0.5) * alturaDaTabua
      const pregoAqui =
        (Math.abs(x - (m + 3)) < 1.2 || Math.abs(x - (S - m - 4)) < 1.2) && Math.abs(y - cy) < 1.2
      if (pregoAqui) {
        col = hex(prego)
        hg = 0.95
      }
    }
    px(c, x, y, col, 1)
    c.hg[y * S + x] = hg
    c.ro[y * S + x] = 0.78
    c.ao[y * S + x] = naMoldura ? 1 : fresta ? 0.7 : 0.92
  })
}
T.oak_trapdoor = (c) => alcapao(c)
T.spruce_planks = (c) => planks(c, 0x7d5c36, 0x543c22)

// ── CAMA ────────────────────────────────────────────────────────────────────
//
// Quatro texturas: travesseiro, coberta, lateral e estrado.
//
// ⚠️ O TOPO NÃO TEM DIREÇÃO, e isso é decisão de projeto, não desleixo. A cama
// ocupa duas células — travesseiro numa, coberta na outra — e é a CÉLULA que
// diz qual ponta é a cabeceira. Se o desenho do topo tivesse direção (uma
// listra correndo pro pé, por exemplo), cada uma das quatro orientações
// precisaria da sua própria id, e seriam 8 ids em vez de 2 num espaço de 256
// onde 109 já estão em uso.
//
// A troca é honesta: travesseiro cheio na célula da cabeceira, coberta lisa na
// do pé. Lido de cima, em qualquer eixo, a cama continua sendo uma cama.
// ── CAMA ────────────────────────────────────────────────────────────────────
//
// Sete texturas, e todas com DIREÇÃO — que é exatamente o que faltava.
//
// A cama da rodada 8 tinha uma textura de lado só e um tampo desenhado de
// propósito sem direção ("listra teria direção", dizia o comentário). Não era
// preguiça: a cama não sabia pra onde estava virada, então qualquer direção no
// desenho apontaria errado em três das quatro posições. Com as oito variantes
// da rodada 12 o desenho pode finalmente ter frente e trás.
//
// GEOMETRIA QUE ESTAS TEXTURAS SERVEM (dezesseis avos):
//   · colchão de 3/16 a 9/16 · pés de 3×3×3 do chão até 3/16
//
// ⚠️ O v do bloco é INVERTIDO em relação ao y da imagem: o rodapé do bloco sai
// da PARTE DE BAIXO do tile. Por isso a madeira do estrado é desenhada em
// `y > 13/16` — é ela que reveste os pés, que ocupam justamente os 3/16 de
// baixo. Isto não é convenção escolhida aqui: é a que o motor já usava, medida
// na rodada de inversão vertical das texturas.
const CAMA_PANO = 0xa8272b
const CAMA_LINHO = 0xe8e4dc
const CAMA_MADEIRA = 0x8a6c3c

// Lateral e pontas: madeira nos 3/16 de baixo (que é o que o pé mostra),
// colchão acima.
function bedLado(c, corDoColchao) {
  each(c, (x, y) => {
    const s = c.size
    const madeira = y > s * (13 / 16)
    const n = fbm(x, y, 6, 5521, 4)
    if (madeira) {
      const veio = fbm(x, y * 3, 7, 5531, 3)
      px(c, x, y, shade(hex(CAMA_MADEIRA), 0.8 + veio * 0.35))
      c.hg[y * c.size + x] = 0.25 + veio * 0.3
      c.ro[y * c.size + x] = 0.8
      return
    }
    px(c, x, y, shade(hex(corDoColchao), 0.86 + n * 0.22))
    c.hg[y * c.size + x] = 0.5 + n * 0.3
    c.ro[y * c.size + x] = 0.97
  })
}

T.bed_side_foot = (c) => bedLado(c, CAMA_PANO)
T.bed_side_head = (c) => bedLado(c, CAMA_PANO)
T.bed_end_foot = (c) => bedLado(c, CAMA_PANO)
// A ponta da cabeceira mostra o travesseiro de topo: linho na parte de cima do
// colchão, pano embaixo.
T.bed_end_head = (c) => {
  each(c, (x, y) => {
    const s = c.size
    const n = fbm(x, y, 6, 5561, 4)
    if (y > s * (13 / 16)) {
      const veio = fbm(x, y * 3, 7, 5531, 3)
      px(c, x, y, shade(hex(CAMA_MADEIRA), 0.8 + veio * 0.35))
      c.hg[y * c.size + x] = 0.25 + veio * 0.3
      c.ro[y * c.size + x] = 0.8
      return
    }
    const linho = y < s * (10 / 16)
    px(c, x, y, shade(hex(linho ? CAMA_LINHO : CAMA_PANO), 0.86 + n * 0.2))
    c.hg[y * c.size + x] = (linho ? 0.55 : 0.45) + n * 0.3
    c.ro[y * c.size + x] = 0.96
  })
}
// Ponta de DENTRO: encostada na outra metade, quase nunca aparece. Existe pra
// metade solta não ficar vazada.
T.bed_end_inner = (c) => bedLado(c, CAMA_PANO)

/**
 * Tampo, com FRENTE E TRÁS.
 *
 * `v = 0` é a PONTA DE FORA da metade — a cabeceira numa, o pé da cama na
 * outra. Girar a geometria gira o UV junto, então uma textura só serve as
 * quatro direções.
 */
function bedTop(c, cabeceira) {
  each(c, (x, y) => {
    const s = c.size
    const u = x / (s - 1)
    // ⚠️ O v DO TAMPO NÃO É INVERTIDO — e o das LATERAIS é.
    //
    // Isto foi MEDIDO, não deduzido, e a dedução tinha dado o contrário. O
    // raciocínio errado era: "a madeira do estrado é desenhada em y > 13/16 e
    // aparece embaixo no bloco, logo v = 1 − y em todas as faces". Vale pras
    // laterais e não vale pro tampo: as faces do motor têm um `flip` por face,
    // e o emissor de forma livre não o aplica igual ao caminho greedy.
    //
    // Com a inversão o travesseiro caía na ponta de DENTRO — uma faixa branca
    // atravessada no meio da cama, como um cinto. Sem ela, o travesseiro fica
    // na cabeceira. Duas execuções da sonda, mesma cena, só essa linha mudando:
    // 0,506 (meio) contra 0,248 (ponta).
    const v = y / (s - 1)
    const n = fbm(x, y, 6, 5501, 4)
    // Moldura do estrado: as duas laterais longas e a PONTA DE FORA. A ponta de
    // dentro não leva moldura — é onde as duas metades se encontram, e uma
    // linha de madeira ali partiria a cama no meio.
    if (u < 1 / 16 || u > 15 / 16 || v < 1 / 16) {
      const m = fbm(x, y, 5, 5511, 3)
      px(c, x, y, shade(hex(CAMA_MADEIRA), 0.85 + m * 0.3))
      c.hg[y * c.size + x] = 0.2
      c.ro[y * c.size + x] = 0.8
      return
    }
    if (cabeceira && v < 0.52) {
      // TRAVESSEIRO: uma almofada deitada ATRAVESSADA na cama, com vinco no
      // sentido do comprimento. É o vinco que dá a direção — e é ele que a
      // versão sem orientação não podia ter.
      const vinco = Math.abs(Math.sin(u * Math.PI * 3)) * 0.16
      const beirada = Math.min(1, (0.52 - v) * 7)
      px(c, x, y, shade(hex(CAMA_LINHO), 0.84 + vinco + beirada * 0.1 + n * 0.1))
      c.hg[y * c.size + x] = 0.5 + vinco * 1.6
      c.ro[y * c.size + x] = 0.95
      return
    }
    // COBERTA: listras ATRAVESSADAS, perpendiculares ao comprimento da cama.
    // A listra é a direção, e é o oposto exato da decisão da rodada 8.
    const listra = (Math.sin(v * Math.PI * 8) * 0.5 + 0.5) * 0.14
    const trama = (Math.sin(x * 1.7) * Math.sin(y * 1.7) * 0.5 + 0.5) * 0.12
    px(c, x, y, shade(hex(CAMA_PANO), 0.84 + listra + trama + n * 0.14))
    c.hg[y * c.size + x] = 0.35 + listra
    c.ro[y * c.size + x] = 0.97
  })
}
T.bed_top_head = (c) => bedTop(c, true)
T.bed_top_foot = (c) => bedTop(c, false)

T.bed_bottom = (c) => {
  each(c, (x, y) => {
    const veio = fbm(x, y * 3, 7, 5541, 3)
    px(c, x, y, shade(hex(0x6f5530), 0.82 + veio * 0.32))
    c.hg[y * c.size + x] = 0.2 + veio * 0.25
    c.ro[y * c.size + x] = 0.82
  })
}

function leaves(c, seed) {
  each(c, (x, y) => {
    const n = fbm(x, y, 8, seed, 5)
    const clump = fbm(x, y, 16, seed + 1, 3)
    const hole = vnoise(x, y, 4, seed + 2)
    // Folha VAZADA de verdade: com poucos furos o quad fundido pelo greedy vira
    // uma parede verde chapada (visto no QA de 2026-08-19). O recorte é o que
    // deixa a luz atravessar a copa e dá volume à árvore.
    if (hole < 0.34 && n < 0.5) {
      px(c, x, y, [0, 0, 0], 0) // recorte: folhagem vazada deixa a luz passar
      c.hg[y * c.size + x] = 0
      return
    }
    // cinza-esverdeado neutro; a cor vem do tint de bioma
    const v = lin(0.42 + n * 0.3 + clump * 0.12)
    px(c, x, y, [v * 0.9, v, v * 0.68], 1)
    c.hg[y * c.size + x] = n * 0.7 + clump * 0.3
    c.ro[y * c.size + x] = 0.95
    c.ao[y * c.size + x] = 0.7 + n * 0.3
  })
}
T.oak_leaves = (c) => leaves(c, 1301)
T.birch_leaves = (c) => leaves(c, 1311)
T.spruce_leaves = (c) => leaves(c, 1321)
T.jungle_leaves = (c) => leaves(c, 1331)

// ── Minérios ────────────────────────────────────────────────────────────────
// MINÉRIO: cristal com FACE RETA, não bolinha.
//
// A versão anterior misturava a cor da gema por `1 - d` sobre um disco: cada
// veio saía como uma esfera com degradê radial, e seis esferas de plástico
// grudadas na pedra é a coisa mais datada que tinha no mostruário de
// 2026-08-22 — nenhum jogo de bloco desenha minério assim.
//
// Três mudanças, todas geométricas:
//  · distância de LOSANGO (|dx|+|dy|) em vez de círculo: o corte reto é o que
//    o olho lê como cristal;
//  · cor CHAPADA dentro do veio, com corte duro na borda — degradê radial é
//    exatamente o que faz parecer bola;
//  · duas faces por cristal (clara em cima à esquerda, escura embaixo à
//    direita) e um contorno escuro de um pixel. É volume desenhado, do mesmo
//    jeito que um pixel artist desenharia, e sobrevive ao `agrupar`.
function ore(c, gem, glow = 0, deepslateBase = false, semente = 1400) {
  if (deepslateBase) T.deepslate(c)
  else T.stone(c)
  // GRADE SACUDIDA, não hash puro: com posição aleatória livre os cinco veios
  // saíam enfileirados na diagonal (e IGUAIS em todos os minérios, porque a
  // semente era a mesma). Uma grade 3x2 com jitter espalha de verdade.
  const cel = [
    [0, 0],
    [1, 0],
    [2, 0],
    [0, 1],
    [2, 1],
  ]
  const veios = cel.map(([a, b], i) => ({
    gx: ((a + 0.2 + hash2(i, 7, semente) * 0.6) / 3) * c.size,
    gy: ((b + 0.2 + hash2(i, 13, semente) * 0.6) / 2) * c.size,
    r: 6 + hash2(i, 21, semente) * 5,
  }))
  each(c, (x, y) => {
    let melhor = null
    for (let i = 0; i < veios.length; i++) {
      const { gx, gy, r } = veios[i]
      // distância toroidal com SINAL (o sinal escolhe a face iluminada)
      let dx = x - gx
      let dy = y - gy
      if (Math.abs(dx) > c.size / 2) dx -= Math.sign(dx) * c.size
      if (Math.abs(dy) > c.size / 2) dy -= Math.sign(dy) * c.size
      const d = (Math.abs(dx) + Math.abs(dy)) / r + fbm(x, y, 8, semente + i, 3) * 0.4 - 0.2
      if (d < 1 && (!melhor || d < melhor.d)) melhor = { d, dx, dy }
    }
    if (!melhor) return
    const { d, dx, dy } = melhor
    let col
    if (d > 0.86)
      col = shade(hex(gem), 0.42) // contorno
    else if (dx + dy < 0)
      col = shade(hex(gem), 1.18) // face voltada pra luz
    else col = shade(hex(gem), 0.86)
    px(c, x, y, col)
    c.hg[y * c.size + x] = d > 0.86 ? 0.35 : 0.9
    c.ro[y * c.size + x] = 0.3
    if (glow) c.em[y * c.size + x] = glow
  })
}
T.coal_ore = (c) => ore(c, 0x1b1b1e, 0, false, 1401)
T.iron_ore = (c) => ore(c, 0xd0a181, 0, false, 1402)
T.copper_ore = (c) => ore(c, 0xd67a4a, 0, false, 1403)
T.gold_ore = (c) => ore(c, 0xf7d24a, 0, false, 1404)
T.diamond_ore = (c) => ore(c, 0x5df2e4, 0, false, 1405)
T.emerald_ore = (c) => ore(c, 0x2fd25f, 0, false, 1406)
T.redstone_ore = (c) => ore(c, 0xe02020, 0.5, false, 1407)

function metalBlock(c, base) {
  each(c, (x, y) => {
    const g = fbm(x, y, 16, 1500, 3)
    const brush = fbm(x * 6, y * 0.4, 32, 1501, 2)
    const border = x % 16 < 1 || y % 16 < 1 ? 0.7 : 1
    px(c, x, y, shade(hex(base), (0.86 + g * 0.2 + brush * 0.12) * border))
    c.hg[y * c.size + x] = brush * 0.3 + (border < 1 ? 0 : 0.5)
    c.ro[y * c.size + x] = 0.22 + g * 0.12
  })
}
T.iron_block = (c) => metalBlock(c, 0xd8d8d8)
T.gold_block = (c) => metalBlock(c, 0xf5d13a)
T.diamond_block = (c) => {
  metalBlock(c, 0x63e8dc)
  each(c, (x, y) => {
    c.ro[y * c.size + x] = 0.1
  })
}
T.coal_block = (c) => {
  each(c, (x, y) => {
    const g = fbm(x, y, 8, 1502, 5)
    const facet = voronoi(x, y, 8, 1503)
    px(c, x, y, shade(hex(0x1a1a1d), 0.7 + g * 0.7 + facet.id * 0.3))
    c.hg[y * c.size + x] = clamp(1 - facet.dist) * 0.6 + g * 0.4
    c.ro[y * c.size + x] = 0.35
  })
}

// ── Construídos ─────────────────────────────────────────────────────────────
T.stone_bricks = (c) => {
  const bh = c.size / 4
  each(c, (x, y) => {
    const row = Math.floor(y / bh)
    const off = (row % 2) * (c.size / 4)
    const bx = (x + off) % (c.size / 2)
    const seam = y % bh < 2 || bx < 2
    const g = fbm(x, y, 16, 1601, 4)
    const wear = fbm(x, y, 8, 1602, 3)
    let col = shade(hex(0x8d8d8d), 0.86 + g * 0.26)
    if (wear > 0.72) col = shade(col, 0.82)
    if (seam) col = shade(hex(0x545456), 0.9 + g * 0.2)
    px(c, x, y, col)
    c.hg[y * c.size + x] = seam ? 0.06 : 0.55 + g * 0.3
    c.ro[y * c.size + x] = seam ? 0.95 : 0.7
    c.ao[y * c.size + x] = seam ? 0.5 : 1
  })
}

T.bricks = (c) => {
  const bh = c.size / 8
  each(c, (x, y) => {
    const row = Math.floor(y / bh)
    const off = (row % 2) * (c.size / 8)
    const bx = (x + off) % (c.size / 4)
    const seam = y % bh < 1.5 || bx < 1.5
    const g = fbm(x, y, 8, 1701, 4)
    const tone = hash2(Math.floor((x + off) / (c.size / 4)), row, 1702)
    let col = shade(mix(hex(0xa4553f), hex(0x8b4331), tone), 0.9 + g * 0.22)
    if (seam) col = shade(hex(0xc9c2b6), 0.92 + g * 0.16)
    px(c, x, y, col)
    c.hg[y * c.size + x] = seam ? 0.05 : 0.6 + g * 0.25
    c.ro[y * c.size + x] = seam ? 0.98 : 0.8
    c.ao[y * c.size + x] = seam ? 0.55 : 1
  })
}

T.sandstone = (c) => {
  each(c, (x, y) => {
    const strat = Math.sin(y * 0.55 + fbm(x, y, 32, 1801, 3) * 4) * 0.5 + 0.5
    const g = fbm(x, y, 8, 1802, 4)
    px(c, x, y, shade(hex(0xdccb96), 0.86 + strat * 0.18 + g * 0.14))
    c.hg[y * c.size + x] = strat * 0.5 + g * 0.3
    c.ro[y * c.size + x] = 0.92
  })
}
T.sandstone_top = (c) => {
  T.sand(c)
  each(c, (x, y) => {
    c.ro[y * c.size + x] = 0.88
  })
}

T.obsidian = (c) => {
  each(c, (x, y) => {
    const v = voronoi(x, y, 6, 1901)
    const g = fbm(x, y, 8, 1902, 4)
    const purple = clamp(v.id * 0.6 + g * 0.3)
    const col = mix(hex(0x0d0a14), hex(0x2a1c46), purple)
    px(c, x, y, col)
    c.hg[y * c.size + x] = clamp(1 - v.dist) * 0.4 + g * 0.2
    c.ro[y * c.size + x] = 0.12
  })
}

// ── O NETHER ────────────────────────────────────────────────────────────────
//
// Quatro faces novas, e a paleta delas é uma decisão e não gosto: o Nether
// inteiro é vermelho, então o que separa um bloco do outro ali não pode ser
// matiz — é RUGOSIDADE e EMISSÃO. O netherrack é fosco e poroso, a areia das
// almas é mole e sem brilho, o quartzo é o único liso, e o magma é o único que
// acende. Se eu tivesse separado por cor, uma caverna inteira leria como uma
// mancha só.

T.netherrack = (c) => {
  each(c, (x, y) => {
    const grao = fbm(x, y, 24, 3101, 5)
    const veia = fbm(x * 0.5, y * 1.8, 16, 3102, 3)
    let col = mix(hex(0x5c2320), hex(0x8f3a30), grao * 0.7 + veia * 0.3)
    // PORO, não mancha: célula pequena e escura. É ele que faz a rocha do
    // Nether ler como algo queimado em vez de tijolo vermelho.
    if (vnoise(x, y, 40, 3103) > 0.74) col = shade(col, 0.55)
    px(c, x, y, col)
    c.hg[y * c.size + x] = grao * 0.6
    c.ro[y * c.size + x] = 0.88
  })
}

T.soul_sand = (c) => {
  each(c, (x, y) => {
    const grao = fbm(x, y, 40, 3201, 4)
    const v = voronoi(x, y, 3, 3202)
    // As covas são o que dá nome ao bloco. Fundas de altura (`hg` baixo) e
    // escuras, mas SEM emissão: a areia das almas não brilha, ela engole luz.
    const cova = clamp(1 - v.dist * 1.6)
    const col = mix(hex(0x4a3a2c), hex(0x2a1f18), cova * 0.8 + grao * 0.2)
    px(c, x, y, col)
    c.hg[y * c.size + x] = 0.45 - cova * 0.4 + grao * 0.12
    c.ro[y * c.size + x] = 0.95
  })
}

T.nether_quartz_ore = (c) => {
  T.netherrack(c)
  each(c, (x, y) => {
    const v = voronoi(x, y, 4, 3301)
    if (v.dist > 0.52) return
    const cristal = clamp(1 - v.dist * 1.9)
    const i = (y * c.size + x) * 3
    const col = mix([c.al[i], c.al[i + 1], c.al[i + 2]], hex(0xece4dc), 0.35 + cristal * 0.6)
    px(c, x, y, col)
    c.hg[y * c.size + x] = 0.5 + cristal * 0.45
    // O ÚNICO liso da paleta. É por aqui que o olho separa minério de rocha
    // numa parede inteira vermelha, não pela cor.
    c.ro[y * c.size + x] = 0.18
  })
}

T.magma = (c) => {
  each(c, (x, y) => {
    const crosta = fbm(x, y, 20, 3401, 5)
    const v = voronoi(x, y, 4, 3402)
    // A fenda é a BORDA da célula, não o miolo: lava corre entre as placas de
    // crosta, e desenhar o miolo aceso daria bolha, não rachadura.
    const fenda = clamp(1 - Math.abs(v.dist - 0.62) * 6)
    const col = mix(hex(0x2a1411), hex(0xff7a1e), fenda * (0.55 + crosta * 0.45))
    px(c, x, y, col)
    c.hg[y * c.size + x] = 0.55 - fenda * 0.45 + crosta * 0.2
    c.ro[y * c.size + x] = 0.8 - fenda * 0.5
    c.em[y * c.size + x] = fenda * 0.75
  })
}

// ── REDSTONE ────────────────────────────────────────────────────────────────
//
// ⚠️ O PÓ É DESENHADO BRANCO E COLORIDO POR `tint`. Dezesseis texturas, uma por
// nível, seriam dezesseis camadas de atlas para desenhar a MESMA coisa em
// tons diferentes — e o atlas é o que o iPhone carrega. A face sai quase branca
// e o tint do bloco faz o resto: um desenho, dezesseis níveis.
T.redstone_dust = (c) => {
  each(c, (x, y) => {
    const grao = fbm(x, y, 24, 3601, 4)
    // A trilha corre no meio da face, nos dois eixos: é o "+" que o olho lê como
    // fio ligado em cruz, e é o que faz o traçado continuar de bloco em bloco.
    const meio = Math.min(Math.abs(x - c.size / 2), Math.abs(y - c.size / 2))
    const naTrilha = meio < 7
    if (!naTrilha) {
      px(c, x, y, hex(0x000000), 0)
      return
    }
    const nucleo = 1 - meio / 7
    px(c, x, y, mix(hex(0x6a4a4a), hex(0xffffff), nucleo * 0.85 + grao * 0.15))
    c.hg[y * c.size + x] = nucleo * 0.3
    c.ro[y * c.size + x] = 0.5
  })
}

const tocha = (c, aceso) => {
  each(c, (x, y) => {
    const cabo = Math.abs(x - c.size / 2) < 4 && y > 26
    const cabeca = Math.hypot(x - c.size / 2, y - 22) < 6
    if (!cabo && !cabeca) {
      px(c, x, y, hex(0x000000), 0)
      return
    }
    if (cabo) {
      const veio = fbm(x, y, 16, 3701, 3)
      px(c, x, y, mix(hex(0x6b4d22), hex(0x8a6a34), veio))
      c.hg[y * c.size + x] = 0.4
      return
    }
    const brilho = 1 - Math.hypot(x - c.size / 2, y - 22) / 6
    px(c, x, y, aceso ? mix(hex(0x8a1010), hex(0xff5a3c), brilho) : hex(0x4a2020))
    c.hg[y * c.size + x] = 0.5 + brilho * 0.4
    if (aceso) c.em[y * c.size + x] = 0.5 + brilho * 0.5
  })
}
T.redstone_torch_on = (c) => tocha(c, true)
T.redstone_torch_off = (c) => tocha(c, false)

const alavanca = (c, ligada) => {
  each(c, (x, y) => {
    const base = Math.abs(x - c.size / 2) < 10 && y > 40
    // Inclinação oposta nos dois estados: é COMO se lê o estado de longe, e ler
    // por cor seria impossível para quem não distingue vermelho.
    const t = (y - 16) / 28
    const eixo = c.size / 2 + (ligada ? -1 : 1) * t * 10
    const vara = y >= 16 && y <= 44 && Math.abs(x - eixo) < 3.5
    if (!base && !vara) {
      px(c, x, y, hex(0x000000), 0)
      return
    }
    px(c, x, y, base ? hex(0x6b6b70) : hex(0x8a6a34))
    c.hg[y * c.size + x] = base ? 0.3 : 0.7
  })
}
T.lever_on = (c) => alavanca(c, true)
T.lever_off = (c) => alavanca(c, false)

const lampada = (c, acesa) => {
  each(c, (x, y) => {
    const v = voronoi(x, y, 5, 3801)
    const nucleo = clamp(1 - v.dist * 1.4)
    const col = acesa
      ? mix(hex(0x8a5a20), hex(0xffd98a), nucleo * 0.9)
      : mix(hex(0x4a3a2a), hex(0x6b5a46), nucleo * 0.6)
    px(c, x, y, col)
    c.hg[y * c.size + x] = nucleo * 0.4
    c.ro[y * c.size + x] = 0.45
    if (acesa) c.em[y * c.size + x] = 0.4 + nucleo * 0.6
  })
}
T.redstone_lamp_on = (c) => lampada(c, true)
T.redstone_lamp_off = (c) => lampada(c, false)

T.nether_portal = (c) => {
  each(c, (x, y) => {
    // Redemoinho: o ângulo entra na fase do ruído, então o padrão gira em torno
    // do centro em vez de escorrer para um lado. É o que separa "portal" de
    // "cortina roxa".
    const dx = x - c.size / 2
    const dy = y - c.size / 2
    const ang = Math.atan2(dy, dx)
    const raio = Math.hypot(dx, dy) / c.size
    const redemoinho = fbm(x + Math.cos(ang) * 14, y + Math.sin(ang) * 14, 16, 3501, 4)
    const nucleo = Math.max(0, 1 - raio * 2.2)
    const col = mix(hex(0x2a0a3e), hex(0xc26bff), redemoinho * 0.7 + nucleo * 0.45)
    // Alfa alto, não opaco: o portal deixa ver o outro lado embaçado, e é isso
    // que faz o jogador entender que ele se atravessa.
    px(c, x, y, col, 0.82)
    c.hg[y * c.size + x] = redemoinho * 0.35
    c.ro[y * c.size + x] = 0.3
    c.em[y * c.size + x] = 0.4 + redemoinho * 0.45 + nucleo * 0.2
  })
}

// ── O FIM ───────────────────────────────────────────────────────────────────
//
// Quatro faces. A pedra do Fim é PÁLIDA e rachada — amarelo-esverdeado sem
// saturação, o que a separa da areia e do arenito à primeira vista; a moldura
// é pedra do Fim com uma cinta verde-escura; o olho é uma pupila verde que
// brilha; o portal é um céu de estrelas visto por um buraco. Arte própria
// (Goal 21, Onda 5).
T.end_stone = (c) => {
  each(c, (x, y) => {
    const v = voronoi(x, y, 5, 4101)
    const g = fbm(x, y, 12, 4102, 4)
    const racha = v.dist < 0.08 ? 0.25 : 0
    const col = mix(hex(0xd9dfa8), hex(0xf1f3c9), g * 0.7 + v.id * 0.3)
    px(c, x, y, [col[0] * (1 - racha), col[1] * (1 - racha), col[2] * (1 - racha)])
    c.hg[y * c.size + x] = 0.5 + g * 0.3 - racha
    c.ro[y * c.size + x] = 0.85
  })
}
const cintaDaMoldura = (c, x, y) => {
  const borda = x < 3 || y < 3 || x > c.size - 4 || y > c.size - 4
  if (!borda) return false
  const g = fbm(x, y, 10, 4103, 3)
  px(c, x, y, mix(hex(0x2d5a3e), hex(0x4f8a5c), g))
  c.hg[y * c.size + x] = 0.35
  c.ro[y * c.size + x] = 0.5
  return true
}
T.end_portal_frame_side = (c) => {
  T.end_stone(c)
  each(c, (x, y) => {
    if (y > c.size * 0.55) cintaDaMoldura(c, x, y)
  })
}
T.end_portal_frame_top = (c) => {
  T.end_stone(c)
  each(c, (x, y) => {
    cintaDaMoldura(c, x, y)
  })
}
T.end_portal_frame_eye = (c) => {
  T.end_portal_frame_top(c)
  each(c, (x, y) => {
    const dx = (x - c.size / 2 + 0.5) / (c.size * 0.28)
    const dy = (y - c.size / 2 + 0.5) / (c.size * 0.18)
    const r = dx * dx + dy * dy
    if (r > 1) return
    const pupila = Math.hypot(dx, dy * 1.6) < 0.4
    px(c, x, y, pupila ? hex(0x0a1a12) : hex(0x5ce38a))
    c.hg[y * c.size + x] = 0.6
    c.ro[y * c.size + x] = 0.2
    c.em[y * c.size + x] = pupila ? 0 : 0.7
  })
}
T.end_portal = (c) => {
  each(c, (x, y) => {
    const g = fbm(x, y, 20, 4104, 3)
    // Estrelas ESPARSAS: o centro de cada célula de voronoi, e só ele. Um limiar
    // de ruído dava uma poeira uniforme, que lia como estática de TV.
    const estrela = voronoi(x, y, 9, 4105).dist < 0.045
    const col = estrela ? hex(0xcfd8ff) : mix(hex(0x030308), hex(0x0e1230), g)
    px(c, x, y, col, 0.94)
    c.hg[y * c.size + x] = 0.1
    c.ro[y * c.size + x] = 0.2
    c.em[y * c.size + x] = estrela ? 0.9 : 0.15 + g * 0.15
  })
}

T.glass = (c) => {
  each(c, (x, y) => {
    const edge = x < 2 || y < 2 || x > c.size - 3 || y > c.size - 3
    const streak = fbm(x, y, 32, 2001, 2)
    if (edge) {
      px(c, x, y, hex(0xd6ecf5), 0.75)
      c.hg[y * c.size + x] = 0.7
    } else {
      px(c, x, y, hex(0xeaf7ff), 0.13 + streak * 0.06)
      c.hg[y * c.size + x] = 0.5
    }
    c.ro[y * c.size + x] = 0.03
  })
}

T.glowstone = (c) => {
  each(c, (x, y) => {
    const v = voronoi(x, y, 6, 2101)
    const g = fbm(x, y, 8, 2102, 4)
    const core = clamp(1 - v.dist * 1.35)
    const col = mix(hex(0x8a6a34), hex(0xfff2b0), core * 0.9 + g * 0.2)
    px(c, x, y, col)
    c.hg[y * c.size + x] = core * 0.7 + g * 0.3
    c.ro[y * c.size + x] = 0.5
    c.em[y * c.size + x] = 0.35 + core * 0.65
  })
}

T.amethyst = (c) => {
  each(c, (x, y) => {
    const v = voronoi(x, y, 5, 2201)
    const col = mix(hex(0x6b3fa8), hex(0xc79cf0), v.id * 0.7 + clamp(1 - v.dist) * 0.4)
    px(c, x, y, col, 0.9)
    c.hg[y * c.size + x] = clamp(1 - v.dist) * 0.8
    c.ro[y * c.size + x] = 0.12
    c.em[y * c.size + x] = 0.25
  })
}

function wool(c, base) {
  each(c, (x, y) => {
    const weave = (Math.sin(x * 1.6) * Math.sin(y * 1.6) * 0.5 + 0.5) * 0.35
    const fuzz = fbm(x, y, 4, 2301, 4)
    px(c, x, y, shade(hex(base), 0.82 + weave + fuzz * 0.25))
    c.hg[y * c.size + x] = weave + fuzz * 0.4
    c.ro[y * c.size + x] = 0.99
  })
}
T.wool_white = (c) => wool(c, 0xe9e9e6)
T.wool_red = (c) => wool(c, 0xb02a24)
T.wool_blue = (c) => wool(c, 0x2f4fa8)
T.wool_green = (c) => wool(c, 0x3d7a2f)

T.bookshelf = (c) => {
  planks(c, 0xbb9660, 0x8a6c3c)
  const shelfTop = c.size * 0.14
  const shelfBot = c.size * 0.86
  each(c, (x, y) => {
    if (y < shelfTop || y > shelfBot) return
    const b = Math.floor(x / 5)
    const h = hash2(b, Math.floor(y / 26), 2401)
    const tall = shelfTop + 3 + h * 6
    const bandY = y > c.size * 0.5 ? y - c.size * 0.5 : y
    if (bandY < tall * 0.5) return
    const colors = [0xa33c32, 0x3a63a8, 0x3f8c46, 0xd0a83c, 0x7a4aa0]
    const col = hex(colors[Math.floor(h * colors.length) % colors.length])
    const spineEdge = x % 5 === 0
    px(c, x, y, spineEdge ? shade(col, 0.6) : shade(col, 0.85 + hash2(b, y, 2402) * 0.3))
    c.hg[y * c.size + x] = spineEdge ? 0.2 : 0.75
    c.ro[y * c.size + x] = 0.85
  })
}

T.crafting_table_top = (c) => {
  planks(c, 0xa88a52, 0x74562e)
  const g = c.size / 4
  each(c, (x, y) => {
    const gx = x % g < 1.5
    const gy = y % g < 1.5
    if (!gx && !gy) return
    px(c, x, y, hex(0x4a3418))
    c.hg[y * c.size + x] = 0.05
    c.ao[y * c.size + x] = 0.5
  })
}
T.crafting_table_side = (c) => {
  planks(c, 0xa88a52, 0x74562e)
  each(c, (x, y) => {
    if (y > c.size * 0.3) return
    const n = fbm(x, y, 8, 2501, 3)
    px(c, x, y, shade(hex(0x6b4f2a), 0.9 + n * 0.2))
    c.hg[y * c.size + x] = 0.35 + n * 0.3
  })
}

// ── A MESA DE ENCANTAMENTO ─────────────────────────────────────────────────
//
// Duas texturas, e as duas são obsidiana POR BAIXO: a mesa é obsidiana com um
// pano vermelho e um livro em cima, e reaproveitar `T.obsidian` como base é o
// que faz a pedra dela combinar com a do portal sem ninguém ter que igualar
// duas paletas escritas à mão.
//
// ⚠️ A EMISSÃO NA LOMBADA NÃO É ENFEITE. O bloco é quase preto; sem um ponto
// que o bloom pegue, a mesa vira um cubo escuro indistinguível de obsidiana
// pura numa caverna, que é exatamente onde o jogador vai construí-la.
T.enchanting_table_top = (c) => {
  T.obsidian(c)
  const meio = c.size / 2
  each(c, (x, y) => {
    const dx = Math.abs(x - meio)
    const dy = Math.abs(y - meio)
    // o pano: uma toalha vermelha ocupando o miolo do tampo
    if (dx > c.size * 0.36 || dy > c.size * 0.36) return
    const n = fbm(x, y, 7, 2701, 3)
    px(c, x, y, mix(hex(0x5a1018), hex(0x9c2230), 0.45 + n * 0.5))
    c.hg[y * c.size + x] = 0.25 + n * 0.2
    c.ro[y * c.size + x] = 0.85
    // o livro aberto, no centro do pano
    if (dx > c.size * 0.19 || dy > c.size * 0.13) return
    const lombada = dx < c.size * 0.025
    px(c, x, y, lombada ? hex(0xd8c070) : mix(hex(0xe8e0cc), hex(0xbfb49a), n))
    c.hg[y * c.size + x] = lombada ? 0.75 : 0.55 + n * 0.15
    c.ro[y * c.size + x] = 0.55
    c.em[y * c.size + x] = lombada ? 0.55 : 0.08
  })
}
T.enchanting_table_side = (c) => {
  T.obsidian(c)
  each(c, (x, y) => {
    // a faixa de pano que escorre pela lateral, na metade de cima
    if (y < c.size * 0.62 || y > c.size * 0.84) return
    const n = fbm(x, y, 7, 2702, 3)
    px(c, x, y, mix(hex(0x4a0d14), hex(0x8a1e2a), 0.4 + n * 0.5))
    c.hg[y * c.size + x] = 0.3 + n * 0.2
    c.ro[y * c.size + x] = 0.85
  })
}

// ── FERMENTAÇÃO ────────────────────────────────────────────────────────────
T.brewing_stand_top = (c) => {
  T.cobblestone(c)
  const meio = c.size / 2
  each(c, (x, y) => {
    // o pilar central e os três braços onde as garrafas encaixam
    const dx = x - meio
    const dy = y - meio
    const raio = Math.hypot(dx, dy)
    const pilar = raio < c.size * 0.07
    const anel = Math.abs(raio - c.size * 0.3) < c.size * 0.05
    if (!pilar && !anel) return
    const n = fbm(x, y, 7, 2801, 3)
    px(c, x, y, mix(hex(0x4a4038), hex(0x8a7a60), 0.4 + n * 0.4))
    c.hg[y * c.size + x] = pilar ? 0.85 : 0.5
    c.ro[y * c.size + x] = 0.35
    // ⚠️ EMISSÃO NO PILAR. Sem um ponto que o bloom pegue, o suporte some numa
    // parede de pedregulho — e é de pedregulho que ele é feito.
    if (pilar) c.em[y * c.size + x] = 0.45 + n * 0.3
  })
}
T.brewing_stand_side = (c) => {
  T.cobblestone(c)
  each(c, (x, y) => {
    if (y > c.size * 0.34) return
    const n = fbm(x, y, 7, 2802, 3)
    px(c, x, y, mix(hex(0x3a332c), hex(0x6b5f4a), 0.4 + n * 0.4))
    c.hg[y * c.size + x] = 0.4 + n * 0.2
  })
}

// A VERRUGA DO NETHER: touceira vermelha, desenhada em cruz como o mato alto.
// Fundo transparente — o resto do quadro é o que deixa ver a areia das almas.
T.nether_wart = (c) => {
  each(c, (x, y) => {
    c.al_a[y * c.size + x] = 0
  })
  const meio = c.size / 2
  each(c, (x, y) => {
    // três hastes que abrem de baixo pra cima, com bulbos no topo
    const alt = y / c.size
    if (alt > 0.72) return
    const abertura = c.size * (0.04 + alt * 0.26)
    const d = Math.abs(x - meio)
    const nasHastes = Math.abs(d - abertura) < 2.2 || d < 2.2
    const n = fbm(x, y, 7, 2803, 3)
    const bulbo = alt > 0.42 && Math.abs(d - abertura) < 4.5 + n * 3
    if (!nasHastes && !bulbo) return
    const cor = bulbo ? mix(hex(0x7a1018), hex(0xc22a30), n) : mix(hex(0x4a0c12), hex(0x8a1a20), n)
    px(c, x, y, cor)
    c.al_a[y * c.size + x] = 1
    c.hg[y * c.size + x] = bulbo ? 0.6 + n * 0.2 : 0.3
    c.ro[y * c.size + x] = 0.8
  })
}

T.furnace_side = (c) => {
  T.cobblestone(c)
  each(c, (x, y) => {
    c.ro[y * c.size + x] *= 0.95
  })
}
T.furnace_top = (c) => {
  T.cobblestone(c)
  each(c, (x, y) => {
    const ring = Math.abs(Math.hypot(x - 32, y - 32) - 14) < 2
    if (!ring) return
    px(c, x, y, hex(0x3a3a3c))
    c.hg[y * c.size + x] = 0.2
  })
}
T.furnace_front = (c) => {
  T.cobblestone(c)
  each(c, (x, y) => {
    const inMouth = x > 14 && x < 50 && y > 30 && y < 54
    if (!inMouth) return
    const bar = (x - 14) % 9 < 3
    if (bar) {
      px(c, x, y, hex(0x2a2a2c))
      c.hg[y * c.size + x] = 0.6
    } else {
      const heat = fbm(x, y, 8, 2601, 3)
      px(c, x, y, mix(hex(0x1a1210), hex(0xff8a2a), heat * 0.55))
      c.em[y * c.size + x] = heat * 0.5
      c.hg[y * c.size + x] = 0.05
    }
  })
}

T.chest_top = (c) => planks(c, 0x9a7136, 0x6b4d22)
T.chest_side = (c) => {
  planks(c, 0x9a7136, 0x6b4d22)
  each(c, (x, y) => {
    if (Math.abs(y - c.size * 0.42) > 2.5) return
    px(c, x, y, hex(0x3a2a12))
    c.hg[y * c.size + x] = 0.1
    c.ao[y * c.size + x] = 0.5
  })
}
T.chest_front = (c) => {
  T.chest_side(c)
  each(c, (x, y) => {
    const lock = Math.abs(x - 32) < 5 && y > 24 && y < 42
    if (!lock) return
    px(c, x, y, shade(hex(0xd0b048), 0.85 + fbm(x, y, 4, 2701, 3) * 0.3))
    c.hg[y * c.size + x] = 0.9
    c.ro[y * c.size + x] = 0.25
  })
}

T.lantern = (c) => {
  each(c, (x, y) => {
    const cx = Math.abs(x - 32)
    const inBody = cx < 14 && y > 16 && y < 50
    const inCap = cx < 10 && y >= 8 && y <= 16
    const inChain = cx < 2 && y < 8
    if (!inBody && !inCap && !inChain) {
      px(c, x, y, [0, 0, 0], 0)
      return
    }
    if (inBody) {
      const bar = cx > 11 || Math.abs(y - 33) > 14
      if (bar) {
        px(c, x, y, hex(0x3d3a34))
        c.hg[y * c.size + x] = 0.8
        c.ro[y * c.size + x] = 0.4
      } else {
        const glow = 1 - Math.hypot(cx / 12, (y - 33) / 15)
        px(c, x, y, mix(hex(0xffb648), hex(0xfff3c2), clamp(glow)))
        c.em[y * c.size + x] = 0.5 + clamp(glow) * 0.5
        c.ro[y * c.size + x] = 0.6
      }
    } else {
      px(c, x, y, hex(0x4a463e))
      c.hg[y * c.size + x] = 0.6
      c.ro[y * c.size + x] = 0.45
    }
  })
}

T.torch = (c) => {
  each(c, (x, y) => {
    const cx = Math.abs(x - 32)
    const stick = cx < 5 && y > 20
    const flame = cx < 9 && y >= 6 && y < 22
    if (!stick && !flame) {
      px(c, x, y, [0, 0, 0], 0)
      return
    }
    if (flame) {
      const f = clamp(1 - Math.hypot(cx / 9, (y - 15) / 9))
      const n = fbm(x, y, 8, 2801, 3)
      px(c, x, y, mix(hex(0xff6a12), hex(0xfff2a8), clamp(f * 1.2 + n * 0.3)))
      c.em[y * c.size + x] = 0.65 + f * 0.35
      c.hg[y * c.size + x] = f
    } else {
      const fiber = fbm(x, y * 0.4, 16, 2802, 3)
      px(c, x, y, shade(hex(0x8a6438), 0.85 + fiber * 0.3))
      c.hg[y * c.size + x] = 0.6 + fiber * 0.3
    }
  })
}

// A CHAMA DA TOCHA, em tile PRÓPRIO.
//
// Por que tile próprio em vez de um pedaço do tile `torch`: a chama é a única
// parte que o shader ANIMA, e o shader separa por CAMADA de textura — é o mesmo
// mecanismo de `gIsLava`. Recortar por região de uv obrigaria o fragmento a
// adivinhar onde a chama mora dentro do tile, e essa adivinhação erra
// justamente na BORDA, que é onde mora o contorno da chama. Camada própria é
// um teste exato em lugar de um chute com margem.
//
// A gota é larga embaixo e afina até a ponta, e o mais QUENTE é a base — ao
// contrário do que a intuição diz. É onde o combustível ainda não queimou; a
// ponta é gás já gasto, e por isso ela sai vermelha e translúcida. Chama
// pintada ao contrário (branca na ponta) é o erro clássico e lê como plasma.
T.torch_flame = (c) => {
  each(c, (x, y) => {
    const t = clamp((y - 4) / 44) // 0 na ponta (topo), 1 na base
    const meia = 3 + 12 * Math.pow(t, 0.62) // meia-largura, em pixels
    const cx = Math.abs(x - 32)
    if (y < 4 || y > 48 || cx > meia) {
      px(c, x, y, [0, 0, 0], 0)
      return
    }
    const eixo = clamp(1 - cx / meia) // 1 no eixo, 0 na borda
    const n = fbm(x, y * 0.7, 10, 2803, 3)
    const calor = clamp(eixo * (0.45 + t * 0.75) + n * 0.25)
    const cor =
      calor > 0.72
        ? mix(hex(0xffd257), hex(0xfffbe8), clamp((calor - 0.72) / 0.28))
        : mix(hex(0xc22a06), hex(0xffd257), clamp(calor / 0.72))
    // Recorte, não gradiente: o material da tocha é cutout (alfa 0 ou 1). Um
    // alfa intermediário aqui viraria pixel descartado no `discard`, e a chama
    // sairia comida de buracos em vez de suave.
    const a = eixo * 1.35 + n * 0.2 - (1 - t) * 0.25
    px(c, x, y, cor, a > 0.35 ? 1 : 0)
    c.em[y * c.size + x] = 0.55 + calor * 0.45
    c.hg[y * c.size + x] = 0
    c.ro[y * c.size + x] = 1
  })
  // ── A FAÍSCA, no canto livre do MESMO tile ────────────────────────────────
  //
  // "Precisamos que a chama tenha particulas e movimento simulando fogo real"
  // — founder, 25/08/2026.
  //
  // No canto de baixo à esquerda, onde a gota nunca chega (ela para em y = 48).
  // Mora aqui, e não num tile próprio, porque tile próprio significaria uma
  // CAMADA própria — e camada de textura, neste motor, sai de uma fatia de face
  // do bloco. As seis fatias da tocha já estão ocupadas. Reaproveitar o canto
  // vazio de um tile que já existe custa zero e não mexe em nada.
  //
  // ⚠️ O ALFA DA FAÍSCA É GRADUADO, ao contrário do da chama logo acima. É o
  // que a faz APAGAR em vez de piscar: o material é cutout, o fragmento compara
  // o alfa com um limiar, e LEVANTAR o limiar encolhe o disco. Assim a brasa
  // esfria subindo sem precisar de mistura alfa — que exigiria ordenar as
  // partículas por profundidade, coisa que malha de chunk não faz.
  each(c, (x, y) => {
    const d = Math.hypot(x - 10, y - 56) / 7
    if (d > 1) return
    const nucleo = clamp(1 - d)
    px(c, x, y, mix(hex(0xff7a18), hex(0xfff4c8), clamp(nucleo * 1.5)), clamp(nucleo * 1.3))
    c.em[y * c.size + x] = 0.7 + nucleo * 0.3
    c.hg[y * c.size + x] = 0
    c.ro[y * c.size + x] = 1
  })
}

function plant(c, palette, density = 1, seed = 3001) {
  each(c, (x, y) => px(c, x, y, [0, 0, 0], 0))
  const blades = Math.round(14 * density)
  for (let b = 0; b < blades; b++) {
    const bx = hash2(b, 1, seed) * c.size
    const h = (0.45 + hash2(b, 2, seed) * 0.5) * c.size
    const lean = (hash2(b, 3, seed) - 0.5) * 14
    const w = 1 + hash2(b, 4, seed) * 1.6
    const col = palette[Math.floor(hash2(b, 5, seed) * palette.length) % palette.length]
    for (let t = 0; t <= h; t++) {
      const yy = Math.round(c.size - 1 - t)
      const xx = Math.round(bx + (lean * t) / h)
      const ww = Math.max(1, w * (1 - t / h / 1.4))
      for (let d = -ww; d <= ww; d++) {
        const px2 = ((Math.round(xx + d) % c.size) + c.size) % c.size
        if (yy < 0 || yy >= c.size) continue
        const shadeK = 0.8 + (1 - Math.abs(d) / (ww + 0.001)) * 0.35
        px(c, px2, yy, shade(hex(col), shadeK), 1)
        c.hg[yy * c.size + px2] = 0.4 + (t / h) * 0.4
        c.ro[yy * c.size + px2] = 0.95
      }
    }
  }
}
// grama/mudas em tom neutro (o tint de bioma pinta)
T.tall_grass = (c) => plant(c, [0x9fb98f, 0x8fae7f, 0xb0c79f], 1.2, 3001)
T.oak_sapling = (c) => plant(c, [0x6f9a52, 0x86ad63, 0x5c7f42], 0.8, 3002)
T.dead_bush = (c) => plant(c, [0x8a6a3a, 0x6f5228], 0.7, 3003)
T.sugar_cane = (c) => plant(c, [0x9fc46a, 0x86ad4f], 0.5, 3004)

// ── TRIGO: oito estágios do broto à espiga ──────────────────────────────────
//
// O estágio precisa ser legível DE PÉ, olhando o canteiro de cima — que é a
// posição em que o jogador decide se colhe ou espera. Duas coisas mudam junto e
// é a soma das duas que se lê de longe: a ALTURA (broto rente ao chão → talo
// que enche a célula) e a COR (verde → dourado).
//
// ⚠️ SÓ A ALTURA NÃO BASTA. O estágio 3 e o 4 diferem em 9% de altura, e num
// tile de 64px sob luz de bioma isso é invisível. A cor é o que separa "ainda
// crescendo" de "quase lá"; a espiga, que só aparece nos dois últimos, é o que
// diz "colhe agora".
//
// As hastes ficam em colunas FIXAS, com jitter pequeno: trigo é plantado em
// fileira e essa regularidade é o que distingue lavoura de mato — que é
// justamente o `plant()` logo acima, aleatório de propósito.
function trigo(c, estagio) {
  each(c, (x, y) => px(c, x, y, [0, 0, 0], 0))
  const t = estagio / 7
  const base = mix(hex(0x4f8a33), hex(0xc9a13f), t)
  const claro = mix(hex(0x6faa4a), hex(0xe8cf72), t)
  const alturaMax = (0.32 + t * 0.62) * c.size
  // ⚠️ SETE HASTES, E NÃO CINCO. Com cinco talos de um pixel a foto de QA
  // mostrou um punhado de capim seco em cima do canteiro: de longe, lavoura
  // madura tem que parecer CHEIA, e densidade é o que a diferencia de mato
  // ralo. O tile é cutout em cruz — pixel vazio é buraco, não fundo.
  const hastes = 10
  for (let i = 0; i < hastes; i++) {
    const bx = Math.round(((i + 0.5) / hastes) * c.size + (hash2(i, 1, 4100 + estagio) - 0.5) * 4)
    const h = Math.round(alturaMax * (0.82 + hash2(i, 2, 4100 + estagio) * 0.32))
    for (let s = 0; s <= h; s++) {
      const yy = c.size - 1 - s
      if (yy < 0) break
      // A espiga é a parte GROSSA do topo, e só existe do estágio 6 em diante.
      const naEspiga = estagio >= 5 && s > h * 0.55
      const largura = naEspiga ? 2 : 1.4
      for (let d = -largura; d <= largura; d++) {
        const xx = (((bx + d) % c.size) + c.size) % c.size
        const centro = 1 - Math.abs(d) / (largura + 0.4)
        const cor = naEspiga
          ? mix(base, claro, 0.35 + centro * 0.5)
          : mix(base, claro, centro * 0.6)
        px(c, xx, yy, cor, 1)
        c.hg[yy * c.size + xx] = 0.35 + (s / (h || 1)) * 0.35 + (naEspiga ? 0.2 : 0)
        c.ro[yy * c.size + xx] = 0.92
      }
      // Grãos: pontinhos claros salteados ao longo da espiga.
      if (naEspiga && s % 3 === 0) {
        const xx = (((bx + (s % 2 ? 2 : -2)) % c.size) + c.size) % c.size
        px(c, xx, yy, claro, 1)
      }
    }
  }
}
for (let e = 0; e < 8; e++) T[`wheat_stage${e}`] = (c) => trigo(c, e)

// ── RAÍZES: cenoura e batata, quatro estágios cada ──────────────────────────
//
// A parte que se come está ENTERRADA, então o que o tile mostra é a folhagem —
// e é por isso que raiz tem quatro estágios e não oito: a folha de cenoura muda
// pouco entre uma semana e outra, e oito desenhos quase iguais seriam oito
// texturas sem informação nenhuma.
//
// O que separa uma da outra no olho: a cenoura tem folha RECORTADA e clara, em
// tufo alto e estreito; a batata tem folha LARGA e escura, mais baixa e aberta.
// Sem essa diferença o jogador não sabe qual canteiro é qual sem quebrar.
function raiz(c, estagio, { clara, escura, leque, altura, mostra, corDaRaiz }) {
  each(c, (x, y) => px(c, x, y, [0, 0, 0], 0))
  const t = (estagio + 1) / 4
  const base = c.size - 1
  const tufos = 4
  // ⚠️ FOLHA EM LEQUE, e não coluna reta.
  //
  // A primeira versão desenhava talos verticais que abriam no topo, e a foto de
  // QA mostrou duas culturas idênticas: dois tufos de risquinhos verdes. Folha
  // de raiz sai da BASE e se abre pros lados — é esse leque que lê como
  // folhagem, e é a ABERTURA dele que separa cenoura (estreita, recortada) de
  // batata (larga, cheia).
  for (let i = 0; i < tufos; i++) {
    const cx = Math.round(((i + 0.5) / tufos) * c.size)
    const folhas = 3 + Math.round(hash2(i, 1, 4300) * 2)
    for (let k = 0; k < folhas; k++) {
      const ang = ((k + 0.5) / folhas - 0.5) * leque
      const h = altura * c.size * t * (0.75 + hash2(i, k + 2, 4300) * 0.5)
      const passos = Math.max(2, Math.round(h))
      for (let sy = 0; sy <= passos; sy++) {
        const f = sy / passos
        const y = Math.round(base - f * h)
        const x = Math.round(cx + Math.sin(ang) * f * h * 0.9)
        // A folha AFINA na ponta: grossa junto da terra, fina no alto.
        const w = Math.max(0, Math.round(1.6 * (1 - f * 0.55)))
        for (let d = -w; d <= w; d++) {
          const xx = (((x + d) % c.size) + c.size) % c.size
          if (y < 0 || y >= c.size) continue
          const centro = 1 - Math.abs(d) / (w + 0.6)
          px(c, xx, y, mix(escura, clara, centro * 0.75 + f * 0.25), 1)
          c.hg[y * c.size + xx] = 0.3 + f * 0.35
          c.ro[y * c.size + xx] = 0.95
        }
      }
    }
  }
  // MADURA: a parte que se come aparece acima da terra, e é o sinal de colher.
  // Fica no TERÇO DE BAIXO do tile, onde a perspectiva do jogo ainda a mostra —
  // colada na última fileira de pixels ela some atrás do canteiro.
  if (estagio === 3 && mostra) {
    for (let i = 0; i < 3; i++) {
      const cx = 10 + i * 21
      mostra(c, cx, base - 6, corDaRaiz)
    }
  }
}

/** A cenoura: uma cunha laranja apontando pra baixo. */
const pontaDeCenoura = (c, cx, cy, cor) => {
  for (let k = 0; k < 7; k++) {
    const w = Math.max(0, 3 - Math.round(k / 2))
    for (let d = -w; d <= w; d++) {
      const xx = (((cx + d) % c.size) + c.size) % c.size
      const yy = cy + k
      if (yy >= c.size) continue
      px(c, xx, yy, shade(cor, 1.05 - Math.abs(d) * 0.07 - k * 0.02), 1)
    }
  }
}

/** A batata: um tubérculo redondo e claro, meio enterrado. */
const tuberculoDeBatata = (c, cx, cy, cor) => {
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      if ((dx * dx) / 16 + (dy * dy) / 9 > 1) continue
      const xx = (((cx + dx) % c.size) + c.size) % c.size
      const yy = cy + dy + 3
      if (yy < 0 || yy >= c.size) continue
      px(c, xx, yy, shade(cor, 1.08 - Math.abs(dy) * 0.06), 1)
    }
  }
}

for (let e = 0; e < 4; e++) {
  // Cenoura: leque ESTREITO e alto, verde-claro amarelado. Batata: leque LARGO
  // e baixo, verde escuro. É a silhueta que diferencia as duas de longe, antes
  // de qualquer detalhe de folha.
  T[`carrot_stage${e}`] = (c) =>
    raiz(c, e, {
      clara: hex(0x9ecb57),
      escura: hex(0x4c7c2c),
      leque: 1.0,
      altura: 0.72,
      mostra: pontaDeCenoura,
      corDaRaiz: hex(0xe0761b),
    })
  T[`potato_stage${e}`] = (c) =>
    raiz(c, e, {
      clara: hex(0x5f9a48),
      escura: hex(0x2f5a24),
      leque: 2.0,
      altura: 0.5,
      mostra: tuberculoDeBatata,
      corDaRaiz: hex(0xd8b978),
    })
}

// ── CAULE DE ABÓBORA E DE MELANCIA ──────────────────────────────────────────
//
// O caule é a planta mais discreta da horta e precisa ser RECONHECÍVEL mesmo
// assim: o jogador tem que saber, olhando de cima, que aquele tufo vai dar
// abóbora e não trigo. O que faz isso é a GAVINHA — a espiral fininha na ponta,
// que nenhuma outra planta do jogo tem — e o tom amarelado do talo.
//
// Oito estágios como o trigo, mas a mudança é de ALTURA e de CURVATURA: o caule
// jovem é reto e curto, o maduro tomba para o lado e se enrola, que é o que ele
// faz na vida real quando o fruto puxa.
function caule(c, estagio, cor) {
  each(c, (x, y) => px(c, x, y, [0, 0, 0], 0))
  const t = estagio / 7
  const base = c.size - 1
  const altura = (0.22 + t * 0.5) * c.size
  const talos = 3
  for (let i = 0; i < talos; i++) {
    const cx = Math.round(((i + 0.5) / talos) * c.size)
    // O tombo cresce com o estágio: maduro, o talo deita.
    const tombo = t * 10 * (i % 2 === 0 ? 1 : -1)
    const passos = Math.max(3, Math.round(altura))
    for (let sy = 0; sy <= passos; sy++) {
      const f = sy / passos
      const y = Math.round(base - f * altura)
      const x = Math.round(cx + tombo * f * f)
      for (let d = -1; d <= 1; d++) {
        const xx = (((x + d) % c.size) + c.size) % c.size
        if (y < 0 || y >= c.size) continue
        px(c, xx, y, shade(cor, 0.85 + (1 - Math.abs(d)) * 0.3 + f * 0.15), 1)
        c.hg[y * c.size + xx] = 0.3 + f * 0.3
        c.ro[y * c.size + xx] = 0.93
      }
    }
    // A GAVINHA: só a partir da metade, e ela é a assinatura do caule.
    if (estagio >= 4) {
      const topoY = Math.round(base - altura)
      const topoX = Math.round(cx + tombo)
      for (let a = 0; a < 14; a++) {
        const ang = (a / 14) * Math.PI * 2.2
        const r = 2 + a * 0.16
        const xx = Math.round(topoX + Math.cos(ang) * r)
        const yy = Math.round(topoY + 3 + Math.sin(ang) * r * 0.7)
        if (yy < 0 || yy >= c.size) continue
        px(c, ((xx % c.size) + c.size) % c.size, yy, shade(cor, 1.25), 1)
      }
    }
  }
}
for (let e = 0; e < 8; e++) {
  T[`pumpkinStem_stage${e}`] = (c) => caule(c, e, hex(0xb6b23f))
  T[`melonStem_stage${e}`] = (c) => caule(c, e, hex(0x7fae43))
}

// A MELANCIA: casca listrada de verde sobre verde, e o topo com o umbigo do
// pedúnculo. As listras são o que a separa de qualquer outro bloco verde do
// jogo a dez metros de distância.
T.melon_side = (c) => {
  each(c, (x, y) => {
    const claro = hex(0x8fc44a)
    const escuro = hex(0x2f6b2a)
    // Listra vertical ondulada: `sin` puro daria código de barras.
    const onda = Math.sin((x / c.size) * Math.PI * 2 * 4 + Math.sin(y * 0.13) * 0.9)
    const g = fbm(x, y, 10, 707, 4)
    let col = onda > 0.15 ? shade(claro, 0.85 + g * 0.35) : shade(escuro, 0.8 + g * 0.4)
    if (y > c.size - 4) col = shade(col, 0.7)
    px(c, x, y, col)
    c.hg[y * c.size + x] = 0.5 + onda * 0.2 + g * 0.2
    c.ro[y * c.size + x] = 0.55
  })
}

T.melon_top = (c) => {
  each(c, (x, y) => {
    const d = Math.hypot(x - c.size / 2, y - c.size / 2) / (c.size / 2)
    const g = fbm(x, y, 12, 708, 4)
    const casca = mix(hex(0x74a83c), hex(0x3d7a2f), Math.min(1, d))
    // O umbigo do pedúnculo, no meio.
    const col = d < 0.14 ? shade(hex(0x6b5a2a), 0.9 + g * 0.3) : shade(casca, 0.85 + g * 0.35)
    px(c, x, y, col)
    c.hg[y * c.size + x] = d < 0.14 ? 0.2 : 0.6 + g * 0.2
    c.ro[y * c.size + x] = 0.6
  })
}

// ── VIDA DO LEITO: alga e capim-do-mar ──────────────────────────────────────
//
// "precisamos de algas" — founder, 25/08/2026.
//
// A alga NÃO é o matinho pintado de verde-escuro, e a diferença é o que separa
// leito de mar de gramado afogado. Duas coisas mudam:
//
//  · ela é COLUNA, não tufo. Ocupa a célula inteira em altura, porque a planta
//    real cresce em fita puxada pela flutuação até a superfície. O `plant()`
//    daqui de cima desenha lâminas saindo do CHÃO e afinando — o desenho certo
//    pra capim, errado pra alga.
//  · a folha é LARGA e MOLE, e sai em pares alternando de lado. Lâmina fina é
//    folha de gramínea; alga tem lâmina de fita.
T.kelp = (c) => {
  each(c, (x, y) => px(c, x, y, [0, 0, 0], 0))
  const ci = (v) => ((Math.round(v) % c.size) + c.size) % c.size
  for (let y = 0; y < c.size; y++) {
    // O caule serpenteia devagar: alga reta lê como cabo, não como planta.
    const s = 32 + Math.sin(y * 0.11) * 5 + (fbm(0, y, 8, 3301, 3) - 0.5) * 6
    for (let d = -1; d <= 1; d++) {
      const xx = ci(s + d)
      px(c, xx, y, shade(hex(0x1d4a1c), 0.78 + (1 - Math.abs(d)) * 0.28), 1)
      c.ro[y * c.size + xx] = 0.9
    }
    // Folhas em pares, trocando de lado — e o CICLO varia com ruído.
    //
    // Com período fixo (a primeira versão usava 11 pixels cravados), a planta
    // saía com as folhas em intervalos exatos e lia como escada de corda. Vida
    // nenhuma é periódica; o ruído no comprimento do ciclo é o que a faz
    // parecer crescida em vez de desenhada.
    const passo = 9 + Math.round(fbm(0, y * 0.35, 7, 3304, 2) * 5)
    const fase = y % passo
    if (fase < passo - 4) {
      const lado = Math.floor(y / passo) % 2 ? 1 : -1
      const larg = 3 + Math.round(Math.sin((fase / (passo - 4)) * Math.PI) * 11)
      for (let k = 2; k <= larg; k++) {
        const xx = ci(s + lado * k)
        const t = k / larg
        const n = fbm(xx, y, 9, 3302, 2)
        // ⚠️ VERDE FUNDO, e não o verde de folha ao sol.
        //
        // A primeira paleta (0x24551f → 0x54a33d) saiu com cara de alface neon
        // debaixo d'água: contra o azul lavado da lâmina, ela era a coisa mais
        // clara e mais saturada do quadro, e puxava o olho pra si em vez de
        // compor o fundo. Planta submersa recebe pouca luz e ainda perde o
        // vermelho na coluna d'água — ela É escura e dessaturada, e é assim que
        // o olho reconhece que aquilo está fundo.
        px(c, xx, y, mix(hex(0x12360f), hex(0x357a2c), t * 0.7 + n * 0.3), 1)
        c.ro[y * c.size + xx] = 0.92
      }
    }
  }
}

// ── BAMBU ───────────────────────────────────────────────────────────────────
//
// "precisamos de algas, bambus" — founder, 25/08/2026.
//
// O colmo é desenhado numa COLUNA ESTREITA do tile (x de 24 a 40), e não no
// tile inteiro. É a mesma escolha do cabo da tocha: a peça tem 3/16 de largura,
// e esticar um tile de 64 px sobre 3/16 de bloco espremeria a imagem cinco
// vezes. Com o desenho numa coluna e uv explícito na forma, cada pixel do
// desenho cai num pixel da peça.
//
// Os NÓS são o que fazem bambu parecer bambu. Sem eles é uma vareta verde.
T.bamboo = (c) => {
  each(c, (x, y) => px(c, x, y, [0, 0, 0], 0))
  for (let y = 0; y < c.size; y++) {
    // Nó a cada 21 px, com uma faixa escura de dois pixels logo abaixo dele.
    const noProx = y % 21
    const no = noProx < 2
    for (let x = 24; x < 40; x++) {
      const t = (x - 24) / 15
      // Cilindro: claro no meio, escuro nas bordas. É o volume que separa
      // colmo de fita.
      const volume = 0.62 + Math.sin(t * Math.PI) * 0.55
      const fibra = fbm(x, y * 0.5, 12, 3401, 3)
      const base = no ? hex(0x4d6b1f) : hex(0x7fa832)
      px(c, x, y, shade(base, volume * (0.88 + fibra * 0.24)), 1)
      c.hg[y * c.size + x] = 0.35 + volume * 0.3
      c.ro[y * c.size + x] = 0.72
    }
  }
}

// A folhagem do bambu: lâminas longas e finas saindo em leque, claras.
T.bamboo_leaves = (c) => {
  each(c, (x, y) => px(c, x, y, [0, 0, 0], 0))
  for (let b = 0; b < 22; b++) {
    const ang = (hash2(b, 1, 3402) - 0.5) * 2.4
    const comp = 16 + hash2(b, 2, 3402) * 26
    const ox = 32 + (hash2(b, 3, 3402) - 0.5) * 30
    const oy = 12 + hash2(b, 4, 3402) * 40
    const cor = [0x6f9c2c, 0x87b83f, 0x577d22][Math.floor(hash2(b, 5, 3402) * 3) % 3]
    for (let t = 0; t < comp; t++) {
      const larg = Math.max(0.6, 1.8 * Math.sin((t / comp) * Math.PI))
      for (let d = -larg; d <= larg; d++) {
        const xx = Math.round(ox + Math.sin(ang) * t + d)
        const yy = Math.round(oy - Math.cos(ang) * t)
        if (xx < 0 || xx >= c.size || yy < 0 || yy >= c.size) continue
        px(c, xx, yy, shade(hex(cor), 0.85 + (1 - Math.abs(d) / (larg + 0.01)) * 0.35), 1)
        c.hg[yy * c.size + xx] = 0.4
        c.ro[yy * c.size + xx] = 0.94
      }
    }
  }
}

// Capim-do-mar: o tufo BAIXO do leito, e é ele que faz o fundo parecer vivo em
// quantidade. Sai do `plant()` mesmo — aqui o desenho de lâmina saindo do chão
// é o certo — só que na paleta fria de fundo de água.
T.seagrass = (c) => plant(c, [0x1f5c33, 0x2b7040, 0x184a2a], 1.35, 3303)
T.flower_red = (c) => {
  plant(c, [0x5f8a44], 0.5, 3005)
  // pétalas no topo
  each(c, (x, y) => {
    const d = Math.hypot(x - 32, y - 14)
    if (d > 9) return
    const n = fbm(x, y, 4, 3006, 3)
    px(c, x, y, mix(hex(0xd8332c), hex(0xf27a6a), n), 1)
    c.hg[y * c.size + x] = clamp(1 - d / 9)
  })
}
T.flower_yellow = (c) => {
  plant(c, [0x5f8a44], 0.5, 3007)
  each(c, (x, y) => {
    const d = Math.hypot(x - 32, y - 14)
    if (d > 9) return
    const n = fbm(x, y, 4, 3008, 3)
    px(c, x, y, mix(hex(0xefc63c), hex(0xfff0a0), n), 1)
    c.hg[y * c.size + x] = clamp(1 - d / 9)
  })
}

T.cactus_side = (c) => {
  each(c, (x, y) => {
    const rib = Math.abs(((x % 16) - 8) / 8)
    const g = fbm(x, y, 8, 3101, 3)
    px(c, x, y, shade(hex(0x3f7a34), 0.78 + (1 - rib) * 0.28 + g * 0.16))
    c.hg[y * c.size + x] = (1 - rib) * 0.7 + g * 0.2
    c.ro[y * c.size + x] = 0.88
    // espinhos
    if (x % 16 === 8 && y % 9 === 3) {
      px(c, x, y, hex(0xe8e0c0))
      c.hg[y * c.size + x] = 1
    }
  })
}
T.cactus_top = (c) => {
  each(c, (x, y) => {
    const d = Math.hypot(x - 32, y - 32) / 32
    const g = fbm(x, y, 8, 3102, 3)
    px(c, x, y, shade(hex(0x4d8c3f), 0.82 + (1 - d) * 0.24 + g * 0.14))
    c.hg[y * c.size + x] = (1 - d) * 0.6 + g * 0.3
    c.ro[y * c.size + x] = 0.9
  })
}

T.pumpkin_side = (c) => {
  each(c, (x, y) => {
    const rib = Math.abs(((x % 13) - 6.5) / 6.5)
    const g = fbm(x, y, 8, 3201, 3)
    px(c, x, y, shade(hex(0xd47418), 0.8 + (1 - rib) * 0.3 + g * 0.14))
    c.hg[y * c.size + x] = (1 - rib) * 0.8 + g * 0.2
    c.ro[y * c.size + x] = 0.7
  })
}
T.pumpkin_top = (c) => {
  each(c, (x, y) => {
    const d = Math.hypot(x - 32, y - 32) / 32
    const g = fbm(x, y, 8, 3202, 3)
    const stem = d < 0.16
    px(c, x, y, stem ? shade(hex(0x6d7c2a), 0.9 + g * 0.2) : shade(hex(0xc06a16), 0.82 + g * 0.2))
    c.hg[y * c.size + x] = stem ? 0.9 : (1 - d) * 0.4 + g * 0.2
    c.ro[y * c.size + x] = 0.75
  })
}

// ── Acabamento ──────────────────────────────────────────────────────────────
//
// POR QUE EXISTE UMA ETAPA DEPOIS DE TODAS AS RECEITAS.
//
// O founder olhou o jogo em 2026-08-22 e disse que a textura estava "meio
// velha". Estava, e não era paleta: era que 81 receitas de ruído fractal
// produzem GRADIENTE CONTÍNUO, e gradiente contínuo num bloco é a cara de
// terreno procedural de 2010. O que o olho lê como "pixel art" são duas coisas
// que o fbm não dá de graça:
//
//  1. PIXEL GRANDE. Uma textura de voxel é desenhada em 16×16. A nossa é 64×64
//     porque queremos detalhe fino sob o normal map — mas o DESENHO precisa ler
//     como se fosse grosso. Agrupar em quadras de 2px dá 32 pixels aparentes:
//     grosso o bastante pra ter cara de desenho, fino o bastante pra caber
//     grão. Foi calibrado olhando: em 4px vira Lego, em 1px vira fotografia
//     borrada.
//  2. DEGRAU DE TOM. Sombreado de pixel art tem número CONTADO de tons. O
//     `posterizar` quantiza a LUMINÂNCIA e reescala o RGB por ela, o que
//     preserva matiz e saturação — quantizar canal a canal desloca o tom e
//     deixa a pedra roxa nas partes escuras.
//
// A etapa é global de propósito. Reescrever as 81 receitas à mão daria o mesmo
// efeito com 81 vezes mais superfície pra errar, e a próxima textura nova
// nasceria fora do padrão.

/** Lado da "quadra" em pixels do tile: 2 em 64 = 32 pixels aparentes. */
const QUADRA = 2
/** Degraus de luminância. Menos que ~10 chapa a rocha; mais que ~20 não aparece. */
const DEGRAUS = 14

/**
 * Classifica o tile pelo ALFA: 'solido', 'recorte' (planta, folhagem) ou
 * 'translucido' (vidro, água, ametista).
 *
 * ⚠️ Os três precisam de tratamento diferente e a primeira versão do
 * acabamento não separava: bastava um pixel com alfa < 0,5 pra tratar o tile
 * como recorte, e o alfa virava 0 ou 1 por maioria. O vidro tem o miolo em
 * alfa 0,13 — TODO ele foi por maioria pra zero e o bloco de vidro sumiu do
 * jogo. Recorte é alfa BINÁRIO; alfa intermediário uniforme é transparência,
 * e transparência tem que ser preservada como número.
 */
function opacidade(c) {
  let extremos = 0
  let vazio = 0
  let opaco = 0
  for (const a of c.al_a) {
    if (a < 0.05) {
      extremos++
      vazio++
    } else if (a > 0.95) {
      extremos++
      opaco++
    }
  }
  if (opaco === c.al_a.length) return 'solido'
  if (vazio > 0 && extremos / c.al_a.length > 0.98) return 'recorte'
  return 'translucido'
}

/**
 * Agrupa em quadras de `q`×`q`, achatando albedo, altura, rugosidade e emissão.
 *
 * A cor é a média PONDERADA PELO ALFA. Média simples puxa o preto transparente
 * pra dentro da folha e a borda da planta escurece — é o halo escuro clássico
 * de quem redimensionou um sprite com recorte sem pensar no alfa.
 */
function agrupar(c, q) {
  const S = c.size
  const recorte = opacidade(c) === 'recorte'
  for (let by = 0; by < S; by += q) {
    for (let bx = 0; bx < S; bx += q) {
      let r = 0,
        g = 0,
        b = 0,
        peso = 0
      let hg = 0,
        ro = 0,
        em = 0,
        ao = 0,
        al = 0,
        n = 0
      for (let y = by; y < Math.min(by + q, S); y++) {
        for (let x = bx; x < Math.min(bx + q, S); x++) {
          const i = y * S + x
          const a = c.al_a[i]
          r += c.al[i * 3] * a
          g += c.al[i * 3 + 1] * a
          b += c.al[i * 3 + 2] * a
          peso += a
          hg += c.hg[i]
          ro += c.ro[i]
          em += c.em[i]
          ao += c.ao[i]
          al += a
          n++
        }
      }
      const k = peso > 1e-6 ? 1 / peso : 0
      // Alfa por MAIORIA, não por média: recorte com borda semitransparente é
      // exatamente o serrilhado que o alpha test não sabe resolver.
      const alfa = recorte ? (al / n >= 0.5 ? 1 : 0) : al / n
      for (let y = by; y < Math.min(by + q, S); y++) {
        for (let x = bx; x < Math.min(bx + q, S); x++) {
          const i = y * S + x
          c.al[i * 3] = r * k
          c.al[i * 3 + 1] = g * k
          c.al[i * 3 + 2] = b * k
          c.hg[i] = hg / n
          c.ro[i] = ro / n
          c.em[i] = em / n
          c.ao[i] = ao / n
          c.al_a[i] = alfa
        }
      }
    }
  }
}

/** Quantiza a luminância em `passos` degraus, preservando matiz e saturação. */
function posterizar(c, passos) {
  const S = c.size
  for (let i = 0; i < S * S; i++) {
    const s = [srgb(clamp(c.al[i * 3])), srgb(clamp(c.al[i * 3 + 1])), srgb(clamp(c.al[i * 3 + 2]))]
    const luz = 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2]
    if (luz < 1e-3) continue
    const k = Math.max(1 / passos, Math.round(luz * passos) / passos) / luz
    for (let ch = 0; ch < 3; ch++) c.al[i * 3 + ch] = lin(clamp(s[ch] * k))
  }
}

/**
 * Escurece o anel externo do tile.
 *
 * Numa parede fundida pelo greedy meshing a textura repete UMA VEZ POR BLOCO,
 * então este anel vira a junta entre blocos vizinhos — é o contorno que faz um
 * paredão de pedra ler como pedras empilhadas em vez de um retângulo texturado.
 *
 * Só em tile SÓLIDO. Planta não tem junta, e um anel escuro na água desenharia
 * uma grade no lago — a superfície é fundida pelo greedy meshing, então cada
 * bloco da lâmina ganharia sua moldura.
 */
function junta(c, forca) {
  const S = c.size
  if (opacidade(c) !== 'solido') return
  // Anel UNIFORME de uma quadra, não um degradê de dois pixels: um degradê
  // faria as duas metades da quadra de borda diferirem, e aí a textura deixaria
  // de ser agrupada justo na beira — que é onde o olho mais percebe.
  const k = 1 - forca
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (Math.min(x, y, S - 1 - x, S - 1 - y) >= QUADRA) continue
      const i = y * S + x
      for (let ch = 0; ch < 3; ch++) c.al[i * 3 + ch] *= k
      c.ao[i] *= 0.94
    }
  }
}

function acabamento(c) {
  agrupar(c, QUADRA)
  posterizar(c, DEGRAUS)
  junta(c, 0.1)
}

// ── Montagem ────────────────────────────────────────────────────────────────

// Normal map (tangent space) a partir do campo de altura, por Sobel com
// amostragem TOROIDAL (a normal também emenda no tile).
export function heightToNormal(hg, size, strength = 2.4) {
  const out = new Float32Array(size * size * 3)
  const at = (x, y) => hg[(((y % size) + size) % size) * size + (((x % size) + size) % size)]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx =
        at(x - 1, y - 1) +
        2 * at(x - 1, y) +
        at(x - 1, y + 1) -
        (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1))
      const dy =
        at(x - 1, y - 1) +
        2 * at(x, y - 1) +
        at(x + 1, y - 1) -
        (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1))
      // ⚠️ SINAL DO VERDE. A normal de um campo de altura é (-∂h/∂u, -∂h/∂v, 1).
      // `dy` acima é (linha de cima) - (linha de baixo) em espaço de IMAGEM, e
      // o jogo sobe a folha invertida (`paraOrdemGL` em render/textures.js):
      // v cresce pra cima da imagem, logo dy = +∂h/∂v e o que vai no verde é
      // -dy. Escrever +dy fazia o relevo iluminar pelo lado errado — a saliência
      // virava cova sob o mesmo sol, que é a metade "chapada" da queixa de
      // 2026-08-22. Convenção OpenGL (verde pra cima), a mesma dos packs.
      let nx = dx * strength
      let ny = -dy * strength
      const nz = 1
      const len = Math.hypot(nx, ny, nz) || 1
      const i = (y * size + x) * 3
      out[i] = nx / len
      out[i + 1] = ny / len
      out[i + 2] = nz / len
    }
  }
  return out
}

const srgb = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)

function main() {
  mkdirSync(OUT, { recursive: true })

  // A ORDEM define a camada no texture array e TEM que casar com
  // `TEXTURE_NAMES` de src/services/roquecraft/blocks.js.
  const names = Object.keys(T).sort()
  const cols = Math.ceil(Math.sqrt(names.length))
  const rows = Math.ceil(names.length / cols)
  const W = cols * S
  const H = rows * S

  const albedo = new Uint8Array(W * H * 4)
  const normal = new Uint8Array(W * H * 4)
  const mer = new Uint8Array(W * H * 4)

  names.forEach((name, idx) => {
    const c = canvas(S)
    T[name](c)
    acabamento(c)
    const nrm = heightToNormal(c.hg, S)
    const tx = (idx % cols) * S
    const ty = Math.floor(idx / cols) * S
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const src = y * S + x
        const dst = ((ty + y) * W + (tx + x)) * 4
        albedo[dst] = Math.round(clamp(srgb(c.al[src * 3])) * 255)
        albedo[dst + 1] = Math.round(clamp(srgb(c.al[src * 3 + 1])) * 255)
        albedo[dst + 2] = Math.round(clamp(srgb(c.al[src * 3 + 2])) * 255)
        albedo[dst + 3] = Math.round(clamp(c.al_a[src]) * 255)
        normal[dst] = Math.round((nrm[src * 3] * 0.5 + 0.5) * 255)
        normal[dst + 1] = Math.round((nrm[src * 3 + 1] * 0.5 + 0.5) * 255)
        normal[dst + 2] = Math.round((nrm[src * 3 + 2] * 0.5 + 0.5) * 255)
        normal[dst + 3] = 255
        mer[dst] = Math.round(clamp(c.ao[src]) * 255)
        mer[dst + 1] = Math.round(clamp(c.ro[src]) * 255)
        mer[dst + 2] = Math.round(clamp(c.em[src]) * 255)
        mer[dst + 3] = 255
      }
    }
  })

  writeFileSync(resolve(OUT, 'blocks_albedo.png'), encodePNG(albedo, W, H))
  writeFileSync(resolve(OUT, 'blocks_normal.png'), encodePNG(normal, W, H))
  writeFileSync(resolve(OUT, 'blocks_mer.png'), encodePNG(mer, W, H))
  // A quebra de linha final não é capricho: sem ela o `format:check` reprova o
  // manifesto toda vez que as texturas são regeradas, e o portão passa a
  // depender de alguém lembrar de rodar o prettier depois do gerador.
  writeFileSync(
    resolve(OUT, 'manifest.json'),
    JSON.stringify({ tile: S, cols, rows, names }, null, 2) + '\n',
  )
  console.log(`[roquecraft] ${names.length} texturas ${S}×${S} → ${W}×${H} (${cols}×${rows})`)
  console.log(`[roquecraft] saída: ${OUT}`)
}

// Só gera quando o script é EXECUTADO. Sem esta guarda, um `import` de teste
// dispara a regravação das três folhas como efeito colateral.
if (import.meta.url === `file://${process.argv[1]}`) main()
