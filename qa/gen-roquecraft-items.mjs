// RoqueCraft — folha de ÍCONES DE ITEM (o que não é bloco).
//
// Bloco tem ícone de graça: o inventário monta um cubo isométrico com a textura
// das faces. Item não. Até o QA de 2026-08-19 todo item herdava o cubo do
// "material mais próximo" — e a picareta de diamante, a espada de diamante e o
// próprio diamante saíam como TRÊS CUBOS CIANOS IDÊNTICOS no inventário. Não dá
// pra jogar assim.
//
// Aqui cada item é desenhado como sprite chapado 32×32 em pixel art, por
// receita: um cabo + uma cabeça pra ferramenta, um lingote, uma gema, uma
// comida. A cor vem do tier, a forma vem do tipo — então as 16 ferramentas saem
// de 4 formas × 4 paletas, e continuam distinguíveis de relance.
//
// Saída: public/games/roquecraft/tex/items.png + items.json
// Uso: `node scripts/gen-roquecraft-items.mjs` (roda junto do gerador de blocos)

import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(HERE, '../public/games/roquecraft/tex')
const S = 32 // lado do sprite

// ── PNG (mesmo encoder do gerador de blocos: sem dependência externa) ────────
function crc32(buf) {
  let c
  const table = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePNG(rgba, w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0
    for (let x = 0; x < w * 4; x++) raw[y * (w * 4 + 1) + 1 + x] = rgba[y * w * 4 + x]
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ── canvas mínimo ───────────────────────────────────────────────────────────
const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255]
const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v))

function sprite() {
  return { d: new Uint8Array(S * S * 4) }
}

function set(c, x, y, rgb, a = 255) {
  if (x < 0 || y < 0 || x >= S || y >= S) return
  const i = (y * S + x) * 4
  c.d[i] = clamp255(rgb[0])
  c.d[i + 1] = clamp255(rgb[1])
  c.d[i + 2] = clamp255(rgb[2])
  c.d[i + 3] = a
}

const tone = (rgb, k) => [rgb[0] * k, rgb[1] * k, rgb[2] * k]

// Retângulo com "luz" embutida: mais claro em cima/à esquerda, mais escuro
// embaixo/à direita. É o que dá volume ao pixel art sem sombreamento real.
function box(c, x0, y0, w, h, rgb, { light = 0.22, outline = 0.45 } = {}) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const fx = w > 1 ? (x - x0) / (w - 1) : 0
      const fy = h > 1 ? (y - y0) / (h - 1) : 0
      const k = 1 + light - (fx * 0.45 + fy * 0.55) * light * 2
      const borda = x === x0 || y === y0 || x === x0 + w - 1 || y === y0 + h - 1
      set(c, x, y, borda && (w > 2 || h > 2) ? tone(rgb, 1 - outline) : tone(rgb, k))
    }
  }
}

// Linha grossa (usada pro cabo diagonal das ferramentas).
function stroke(c, x0, y0, x1, y1, wdt, rgb) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 + 1
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = Math.round(x0 + (x1 - x0) * t)
    const y = Math.round(y0 + (y1 - y0) * t)
    for (let dy = 0; dy < wdt; dy++)
      for (let dx = 0; dx < wdt; dx++) {
        const k = dx === 0 || dy === 0 ? 1.12 : 0.88
        set(c, x + dx, y + dy, tone(rgb, k))
      }
  }
}

function disc(c, cx, cy, r, rgb, { light = 0.3 } = {}) {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) {
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const d = Math.hypot(x - cx + 0.5, y - cy + 0.5)
      if (d > r) continue
      const k = 1 + light - (d / r) * light * 1.5 - ((y - cy) / r) * 0.12
      set(c, x, y, tone(rgb, k))
    }
  }
}

// ── paletas ─────────────────────────────────────────────────────────────────
const WOOD = hex(0x9a6b3c)
const HANDLE = hex(0x7a5334)
const TIER = {
  wood: hex(0xa9793f),
  stone: hex(0x8c8c92),
  iron: hex(0xd8d8dc),
  diamond: hex(0x4fe3d6),
}

// ── receitas ────────────────────────────────────────────────────────────────
const I = {}

// ── A ARMADURA ──────────────────────────────────────────────────────────────
//
// Quatro peças chapadas, vistas de frente. O couro é castanho; o ferro e o
// diamante usam as paletas das ferramentas, com um brilho no ombro/na testa.
const ARMADURA = {
  leather: hex(0x9c6a3e),
  iron: TIER.iron,
  diamond: TIER.diamond,
}
const brilho = (c, x, y, w, col) => box(c, x, y, w, 1, tone(col, 1.35), { outline: 0 })
const PECA = {
  // Capacete: calota larga, a aba, a abertura da cara.
  helmet: (c, col) => {
    box(c, 7, 6, 18, 8, col)
    box(c, 6, 13, 20, 4, col)
    box(c, 6, 17, 4, 7, col)
    box(c, 22, 17, 4, 7, col)
    box(c, 10, 17, 12, 7, tone(col, 0.45), { outline: 0 })
    brilho(c, 9, 7, 8, col)
  },
  // Peitoral: ombros, o vão do pescoço, o corpo, a cintura mais estreita.
  chestplate: (c, col) => {
    box(c, 4, 5, 8, 6, col)
    box(c, 20, 5, 8, 6, col)
    box(c, 4, 10, 24, 10, col)
    box(c, 6, 20, 20, 7, col)
    box(c, 12, 5, 8, 4, tone(col, 0.45), { outline: 0 })
    brilho(c, 6, 6, 5, col)
    brilho(c, 21, 6, 5, col)
  },
  // Calça: o cós e as duas pernas separadas.
  leggings: (c, col) => {
    box(c, 6, 5, 20, 6, col)
    box(c, 6, 10, 9, 17, col)
    box(c, 17, 10, 9, 17, col)
    brilho(c, 8, 6, 6, col)
  },
  // Botas: duas, lado a lado, com a sola mais escura.
  boots: (c, col) => {
    for (const x of [4, 18]) {
      box(c, x, 9, 8, 10, col)
      box(c, x, 18, 11, 6, col)
      box(c, x, 23, 11, 2, tone(col, 0.5), { outline: 0 })
      brilho(c, x + 1, 10, 4, col)
    }
  },
}

// Cabo diagonal comum a toda ferramenta (canto inferior-esquerdo → meio-alto).
const handle = (c) => stroke(c, 7, 24, 18, 13, 3, HANDLE)

I.stick = (c) => stroke(c, 8, 23, 21, 9, 3, WOOD)

I.pickaxe = (c, col) => {
  handle(c)
  // cabeça: arco de três segmentos + bico dos dois lados
  box(c, 8, 7, 16, 4, col)
  box(c, 5, 9, 4, 4, col)
  box(c, 23, 9, 4, 4, col)
  box(c, 4, 12, 3, 3, tone(col, 0.85))
  box(c, 25, 12, 3, 3, tone(col, 0.85))
}

I.axe = (c, col) => {
  handle(c)
  box(c, 13, 6, 9, 5, col)
  box(c, 9, 8, 6, 9, col)
  box(c, 7, 10, 3, 6, tone(col, 0.88))
}

I.shovel = (c, col) => {
  handle(c)
  box(c, 14, 6, 9, 10, col)
  box(c, 16, 15, 5, 3, tone(col, 0.8))
}

// Enxada: a cabeça é um L deitado, lâmina pra ESQUERDA.
//
// A diferença pro machado não é decorativa: no ícone de 32px o que separa as
// duas ferramentas é a direção da lâmina em relação ao cabo. Machado tem a
// lâmina no prolongamento do cabo, enxada tem a lâmina em ângulo reto com ele —
// é essa perpendicular que faz o olho ler "cava a terra" e não "corta árvore".
I.hoe = (c, col) => {
  handle(c)
  box(c, 8, 6, 13, 4, col)
  box(c, 17, 9, 4, 4, tone(col, 0.88))
}

I.sword = (c, col) => {
  // guarda + punho curto (a espada é vertical, pra não virar "machado torto")
  stroke(c, 8, 24, 12, 20, 3, HANDLE)
  box(c, 8, 18, 9, 3, tone(WOOD, 0.7))
  // lâmina diagonal
  stroke(c, 13, 18, 24, 6, 4, col)
  box(c, 23, 4, 4, 4, tone(col, 1.1))
}

I.shears = (c) => {
  const m = TIER.iron
  stroke(c, 9, 22, 20, 9, 3, m)
  stroke(c, 20, 22, 9, 9, 3, tone(m, 0.82))
  disc(c, 10, 24, 3, hex(0x5a5a60))
  disc(c, 21, 24, 3, hex(0x5a5a60))
}

// gema lapidada
const gem = (c, col) => {
  for (let y = 8; y < 24; y++) {
    const t = (y - 8) / 15
    const w = Math.round(t < 0.35 ? 4 + t * 26 : 14 - (t - 0.35) * 20)
    for (let x = 16 - w / 2; x < 16 + w / 2; x++) {
      const k = 1.25 - t * 0.5 - Math.abs(x - 16) / 22
      set(c, Math.round(x), y, tone(col, k))
    }
  }
  box(c, 13, 9, 3, 2, tone(col, 1.45))
}

// lingote (trapézio com topo claro)
const ingot = (c, col) => {
  for (let y = 12; y < 22; y++) {
    const t = (y - 12) / 9
    const inset = Math.round(t * 3)
    for (let x = 6 + 3 - inset; x < 26 - 3 + inset; x++) {
      set(c, x, y, tone(col, 1.2 - t * 0.45))
    }
  }
  box(c, 9, 12, 14, 2, tone(col, 1.35))
}

// pepita / pedra bruta (blobs irregulares)
const rawChunk = (c, col, seed = 1) => {
  const rnd = (n) => {
    const x = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453
    return x - Math.floor(x)
  }
  for (let i = 0; i < 5; i++) {
    disc(
      c,
      10 + rnd(i) * 12,
      11 + rnd(i + 9) * 11,
      3.4 + rnd(i + 3) * 2.2,
      tone(col, 0.85 + rnd(i + 5) * 0.4),
    )
  }
}

// pó / punhado
const dust = (c, col, seed = 2) => {
  const rnd = (n) => {
    const x = Math.sin(seed * 3.71 + n * 91.7) * 24634.6345
    return x - Math.floor(x)
  }
  for (let i = 0; i < 26; i++) {
    const x = Math.round(8 + rnd(i) * 16)
    const y = Math.round(11 + rnd(i + 40) * 12)
    box(c, x, y, 2, 2, tone(col, 0.8 + rnd(i + 70) * 0.5), { outline: 0 })
  }
}

I.coal = (c) => rawChunk(c, hex(0x2a2a2e), 3)
I.charcoal = (c) => rawChunk(c, hex(0x3a3128), 4)
I.raw_iron = (c) => rawChunk(c, hex(0xb99a7f), 5)
I.raw_copper = (c) => rawChunk(c, hex(0xc07a4e), 6)
I.raw_gold = (c) => rawChunk(c, hex(0xd8b23e), 7)
I.iron_ingot = (c) => ingot(c, hex(0xd8d8dc))
I.copper_ingot = (c) => ingot(c, hex(0xc4744a))
I.gold_ingot = (c) => ingot(c, hex(0xf0c542))
I.brick = (c) => box(c, 6, 12, 20, 9, hex(0xa2564a))
I.diamond = (c) => gem(c, hex(0x4fe3d6))
I.emerald = (c) => gem(c, hex(0x35c95e))
I.redstone = (c) => dust(c, hex(0xd42f2f), 8)
I.glowstone_dust = (c) => dust(c, hex(0xf2d98a), 9)
I.gunpowder = (c) => dust(c, hex(0x6f6f72), 10)
I.flint = (c) => rawChunk(c, hex(0x3d3d42), 11)
// O quartzo do Nether é PEDRA LASCADA, não gema: `gem` daria a silhueta de
// diamante e esmeralda, e na hotbar o jogador leria como uma terceira pedra
// preciosa. Ele é um mineral quebrado, quase branco, e o que o separa dos
// outros `rawChunk` é a cor clara — nenhum outro é.
I.quartz = (c) => rawChunk(c, hex(0xe4dcd2), 23)
// O isqueiro é DUAS peças encostadas, e tem que ser legível a 32 px: a lâmina
// de aço na diagonal e a pedra escura embaixo dela. Desenhar um objeto só daria
// mais uma ferramenta cinza na hotbar.
I.flint_and_steel = (c) => {
  // A pedra PRIMEIRO: `rawChunk` desenha em volta do centro e cobriria a lâmina
  // se viesse depois. Ordem de camada, não de leitura.
  rawChunk(c, hex(0x3d3d42), 17)
  for (let i = 0; i < 15; i++) {
    box(c, 6 + i, 22 - i, 3, 3, tone(hex(0xc8ccd6), 1.05 - i * 0.025), { outline: 0 })
  }
}

I.clay_ball = (c) => disc(c, 16, 17, 7, hex(0xa3a8b8))
I.snowball = (c) => disc(c, 16, 17, 7.5, hex(0xeef3f8))

// ── BALDE ───────────────────────────────────────────────────────────────────
//
// Três desenhos de uma receita só: o vazio, o de água e o de lava. O que muda é
// a lâmina dentro da boca — e é ela que tem que ser legível a 32 px, porque na
// hotbar o jogador distingue os três pela COR do miolo, não pelo formato do
// balde, que é o mesmo nos três.
const METAL = hex(0xb4b8c2)
function balde(c, liquido) {
  // Corpo trapezoidal: mais largo em cima, como um balde de verdade. Feito
  // linha a linha porque `box` só faz retângulo.
  for (let y = 14; y <= 27; y++) {
    const t = (y - 14) / 13
    const meia = Math.round(9 - t * 3)
    const k = 1.1 - t * 0.34
    box(c, 16 - meia, y, meia * 2, 1, tone(METAL, k), { outline: 0 })
    // Borda lateral escura: sem ela o trapézio vira uma mancha cinza.
    set(c, 16 - meia, y, tone(METAL, 0.55))
    set(c, 15 + meia, y, tone(METAL, 0.55))
  }
  // Lâmina dentro da boca. Vem ANTES da borda pra que a borda a emoldure.
  if (liquido) {
    for (let y = 11; y <= 13; y++) {
      const meia = 8 - (y - 11)
      box(c, 16 - meia, y, meia * 2, 1, tone(liquido, 1.15 - (y - 11) * 0.12), { outline: 0 })
    }
  }
  // Boca: aro por cima de tudo.
  box(c, 6, 10, 20, 2, tone(METAL, 1.16), { outline: 0 })
  box(c, 6, 12, 2, 3, tone(METAL, 0.8), { outline: 0 })
  box(c, 24, 12, 2, 3, tone(METAL, 0.8), { outline: 0 })
  // Alça: um arco simples de dois traços.
  stroke(c, 7, 9, 16, 4, 2, tone(METAL, 0.7))
  stroke(c, 16, 4, 25, 9, 2, tone(METAL, 0.7))
}

I.bucket = (c) => balde(c, null)
I.water_bucket = (c) => balde(c, hex(0x3a7fd5))
I.lava_bucket = (c) => balde(c, hex(0xef6c1a))

// O ARCO: um arco de madeira curvo com a corda reta; a FLECHA: haste, ponta
// de pederneira e penas. Arte própria (Goal 21, 3.2).
I.bow = (c) => {
  const corda = hex(0xe4e4e0)
  for (let y = 4; y < 28; y++) {
    const t = (y - 16) / 12
    const x = 12 + Math.round((1 - t * t) * 9)
    box(c, x, y, 3, 1, WOOD, { outline: 0 })
  }
  for (let y = 5; y < 27; y++) set(c, 12, y, corda)
  set(c, 13, 5, corda)
  set(c, 13, 26, corda)
}
I.arrow = (c) => {
  stroke(c, 6, 25, 22, 9, 2, HANDLE)
  const ponta = hex(0x3d3d42)
  stroke(c, 22, 9, 26, 5, 2, ponta)
  box(c, 24, 4, 3, 2, ponta, { outline: 0 })
  box(c, 26, 5, 2, 3, ponta, { outline: 0 })
  const pena = hex(0xf1f1ee)
  box(c, 4, 22, 3, 2, pena, { outline: 0 })
  box(c, 7, 25, 2, 3, pena, { outline: 0 })
  box(c, 5, 27, 3, 2, pena, { outline: 0 })
}

// O ESCUDO: tábua em forma de escudo (largo em cima, ponta embaixo), bordas
// de madeira mais escura e uma faixa de ferro no meio. Arte própria (Goal 21,
// 3.3).
I.shield = (c) => {
  const borda = tone(WOOD, 0.7)
  const ferro = hex(0xc9cbd0)
  for (let y = 3; y < 29; y++) {
    // largura cheia até o meio, depois afunila até a ponta
    const t = y < 16 ? 0 : (y - 16) / 12
    const meia = Math.round(10 * (1 - t * t))
    if (meia < 1) break
    box(c, 16 - meia, y, meia * 2, 1, WOOD, { outline: 0 })
    set(c, 16 - meia, y, borda)
    set(c, 15 + meia, y, borda)
  }
  box(c, 6, 3, 20, 1, borda, { outline: 0 })
  box(c, 14, 4, 4, 22, ferro, { outline: 0 })
  box(c, 7, 12, 18, 3, ferro, { outline: 0 })
  box(c, 15, 5, 1, 20, tone(ferro, 1.2), { outline: 0 })
}

// A PÉROLA: esfera verde-água com brilho; o OLHO: a pérola com pupila escura e
// halo verde. Arte própria (Goal 21, Onda 5).
I.ender_pearl = (c) => {
  const cor = hex(0x2f8f7a)
  for (let y = 7; y < 25; y++) {
    const t = (y - 16) / 9
    const meia = Math.round(Math.sqrt(Math.max(0, 1 - t * t)) * 9)
    box(c, 16 - meia, y, meia * 2, 1, cor, { outline: 0 })
  }
  box(c, 11, 10, 3, 2, tone(cor, 1.6), { outline: 0 })
  box(c, 10, 12, 2, 3, tone(cor, 1.4), { outline: 0 })
}
I.ender_eye = (c) => {
  I.ender_pearl(c)
  const verde = hex(0x6fe89a)
  for (let y = 12; y < 20; y++) {
    const t = (y - 16) / 4
    const meia = Math.round(Math.sqrt(Math.max(0, 1 - t * t)) * 6)
    box(c, 16 - meia, y, meia * 2, 1, verde, { outline: 0 })
  }
  box(c, 14, 14, 4, 4, hex(0x0a1a12), { outline: 0 })
}

I.string = (c) => {
  const col = hex(0xe4e4e0)
  for (let y = 5; y < 27; y++) {
    const x = 16 + Math.round(Math.sin(y * 0.55) * 6)
    box(c, x, y, 2, 1, col, { outline: 0 })
  }
}

I.leather = (c) => {
  box(c, 6, 9, 20, 15, hex(0x8a5a34))
  box(c, 9, 12, 14, 9, tone(hex(0x8a5a34), 1.15), { outline: 0 })
}

I.bone = (c) => {
  const col = hex(0xe8e6da)
  stroke(c, 9, 21, 22, 9, 3, col)
  disc(c, 9, 22, 3.2, col)
  disc(c, 23, 9, 3.2, col)
}

I.feather = (c) => {
  const col = hex(0xf1f1ee)
  stroke(c, 10, 24, 22, 7, 2, tone(col, 0.72))
  for (let i = 0; i < 9; i++) {
    const t = i / 8
    const x = Math.round(10 + 12 * t)
    const y = Math.round(24 - 17 * t)
    box(c, x - 3 + i * 0, y - 1, 4 - Math.round(t * 2), 2, tone(col, 1 - t * 0.15), { outline: 0 })
  }
}

I.wheat = (c) => {
  const stem = hex(0x8f9a3a)
  const grain = hex(0xd8b64a)
  stroke(c, 15, 27, 17, 8, 2, stem)
  for (let i = 0; i < 5; i++) {
    const y = 9 + i * 3
    box(c, 11, y, 4, 3, grain, { outline: 0.2 })
    box(c, 18, y, 4, 3, tone(grain, 0.9), { outline: 0.2 })
  }
}

// Semente: um punhado de grãos, e NÃO uma espiga pequena.
//
// A distinção existe porque os dois itens andam juntos no inventário: se a
// semente for um trigo menor, o jogador confunde os dois slots e planta o que
// ia comer. Grão solto, claro e arredondado lê diferente de talo com espiga.
I.wheat_seeds = (c) => {
  const grao = hex(0x9ec25a)
  const escuro = hex(0x6f8f3c)
  const pos = [
    [10, 14],
    [16, 11],
    [21, 16],
    [12, 20],
    [18, 19],
    [15, 24],
  ]
  for (const [x, y] of pos) {
    disc(c, x + 1.5, y + 1.5, 2.6, grao, { light: 0.45 })
    box(c, x + 1, y + 3, 2, 1, escuro, { outline: 0 })
  }
}

// Cenoura, batata e batata assada.
//
// A batata assada NÃO é a batata mais escura: ela é a batata ABERTA, com o
// miolo claro à mostra. Dois tons da mesma forma ficariam indistinguíveis no
// slot de 32px, e o jogador comeria a crua achando que era a assada.
I.carrot = (c) => {
  const laranja = hex(0xe07a1f)
  for (let i = 0; i < 16; i++) {
    const w = Math.max(1, Math.round(4 - i * 0.22))
    box(c, 14 - w / 2 + i * 0.4, 10 + i, Math.round(w), 2, tone(laranja, 1 - i * 0.012), {
      outline: 0.15,
    })
  }
  stroke(c, 12, 9, 10, 5, 2, hex(0x4f8f34))
  stroke(c, 15, 9, 17, 4, 2, hex(0x63a642))
  stroke(c, 14, 9, 14, 3, 2, hex(0x58993b))
}

I.potato = (c) => {
  disc(c, 16, 17, 9, hex(0xc8a45e), { light: 0.35 })
  for (const [x, y] of [
    [12, 13],
    [19, 15],
    [15, 21],
  ]) {
    box(c, x, y, 2, 2, tone(hex(0xc8a45e), 0.72), { outline: 0 })
  }
}

I.baked_potato = (c) => {
  disc(c, 16, 17, 9, hex(0x8f6a33), { light: 0.3 })
  // O corte: miolo claro no meio, que é o que diz "assada" de longe.
  box(c, 11, 14, 10, 7, hex(0xf0dca0), { outline: 0.25 })
  box(c, 13, 16, 6, 3, hex(0xffefc0), { outline: 0 })
}

// As duas sementes de caule. Diferem da de trigo pela FORMA do grão: a de
// abóbora é a lasca achatada e clara que todo mundo conhece de cuspir; a de
// melancia é a gota preta. Três sementes do mesmo verde no inventário seriam
// três slots indistinguíveis.
I.pumpkin_seeds = (c) => {
  const casca = hex(0xe8dca6)
  for (const [x, y, r] of [
    [11, 13, 0],
    [19, 12, 0.5],
    [14, 20, -0.4],
    [21, 19, 0.3],
  ]) {
    for (let k = 0; k < 7; k++) {
      const w = Math.max(1, 3 - Math.round(Math.abs(k - 3) * 0.9))
      for (let d = -w; d <= w; d++) {
        const xx = Math.round(x + d + r * k)
        const yy = y + k
        set(c, xx, yy, tone(casca, 1.05 - Math.abs(d) * 0.08))
      }
    }
  }
}

I.melon_seeds = (c) => {
  const preta = hex(0x2b2a26)
  for (const [x, y] of [
    [11, 14],
    [18, 12],
    [15, 21],
    [21, 18],
  ]) {
    for (let k = 0; k < 6; k++) {
      const w = Math.max(0, 2 - Math.round(Math.abs(k - 2.5) * 0.8))
      for (let d = -w; d <= w; d++) set(c, x + d, y + k, tone(preta, 1.2 - k * 0.04))
    }
  }
}

// Papel e livro. O livro NÃO é o papel com outra cor: é a capa vista de lado,
// com o miolo claro saindo por uma borda só. No slot de 32px é a lombada que
// diz "livro" — sem ela, três folhas empilhadas e um livro são a mesma mancha.
I.paper = (c) => {
  box(c, 7, 8, 18, 17, hex(0xf2f0e6))
  box(c, 9, 11, 14, 1, tone(hex(0xf2f0e6), 0.82), { outline: 0 })
  box(c, 9, 15, 14, 1, tone(hex(0xf2f0e6), 0.82), { outline: 0 })
  box(c, 9, 19, 10, 1, tone(hex(0xf2f0e6), 0.82), { outline: 0 })
}

I.book = (c) => {
  const capa = hex(0x8c4a2a)
  box(c, 8, 7, 16, 19, capa)
  // A lombada, mais escura, na esquerda.
  box(c, 8, 7, 3, 19, tone(capa, 0.72), { outline: 0 })
  // O miolo de páginas, saindo pela direita.
  box(c, 21, 9, 3, 15, hex(0xf0ead2), { outline: 0.2 })
}

I.apple = (c) => {
  disc(c, 16, 19, 8, hex(0xd8362f))
  box(c, 15, 8, 2, 4, hex(0x6b4a24), { outline: 0 })
  box(c, 17, 8, 4, 2, hex(0x4f8f34), { outline: 0 })
  box(c, 12, 15, 2, 2, hex(0xffb0a8), { outline: 0 })
}

I.bread = (c) => {
  box(c, 5, 11, 22, 12, hex(0xc08a42))
  box(c, 8, 13, 16, 3, tone(hex(0xc08a42), 1.2), { outline: 0 })
  for (let i = 0; i < 3; i++)
    box(c, 10 + i * 5, 17, 3, 2, tone(hex(0xc08a42), 0.75), { outline: 0 })
}

// Carne e OVAL, nao disco: com disco a carne crua saia identica a maca (mesmo
// vermelho, mesmo circulo, so mudava o cabinho) no QA de 2026-08-19.
const meat = (c, col, cooked) => {
  for (let y = 11; y < 26; y++) {
    const t = (y - 11) / 14
    const w = Math.round(10 + Math.sin(t * Math.PI) * 11)
    for (let x = 14 - w / 2; x < 14 + w / 2; x++) {
      set(c, Math.round(x), y, tone(col, 1.18 - t * 0.4 - Math.abs(x - 14) / 40))
    }
  }
  box(c, 19, 6, 4, 9, hex(0xf0e6d2)) // osso
  box(c, 17, 5, 8, 3, hex(0xf6efe0), { outline: 0.15 })
  if (cooked) {
    box(c, 9, 15, 5, 2, tone(col, 0.62), { outline: 0 })
    box(c, 13, 20, 6, 2, tone(col, 0.62), { outline: 0 })
  }
}
// ⚠️ PEIXE E TINTA NÃO SÃO ARTE NOVA: SÃO O CONSERTO DE UM ITEM FANTASMA.
//
// `mobs.js` já dropava `raw_fish` (peixe, pinguim) e `ink_sac` (lula, polvo)
// desde que os aquáticos entraram — e nenhum dos dois existia em `items.js`.
// Quem matasse um peixe recebia uma chave que o inventário não conhece, sem
// ícone e sem nome; o save, ao recarregar, descartava o slot. O jogo prometia e
// não entregava (RC-09, 12/09/2026).
//
// As duas receitas são as que já existem: o peixe é um corpo com cauda, na
// família do `meat`; a tinta é um saco escuro, na família do `rawChunk`. Nada
// de estilo novo — o desenho sai das mesmas primitivas dos outros 50.
I.raw_fish = (c) => {
  // corpo
  for (let y = 12; y < 21; y++) {
    const t = Math.abs(y - 16) / 5
    const w = Math.round(17 - t * 9)
    for (let x = 9; x < 9 + w; x++) set(c, x, y, hex(0x8fb6c9))
  }
  box(c, 10, 13, 8, 3, hex(0xb9d6e4), { outline: 0 }) // brilho do dorso
  box(c, 23, 13, 4, 7, hex(0x6f97ab)) // cauda
  set(c, 12, 15, hex(0x1d2b33)) // olho
}
I.ink_sac = (c) => {
  disc(c, 16, 18, 7, hex(0x241f2e))
  box(c, 13, 9, 6, 4, hex(0x3a3348)) // gargalo do saco
  box(c, 12, 15, 3, 3, hex(0x4d4460), { outline: 0 }) // reflexo
}

I.raw_beef = (c) => meat(c, hex(0xd4574f), false)
I.cooked_beef = (c) => meat(c, hex(0x9a5227), true)
I.raw_porkchop = (c) => meat(c, hex(0xe89a9a), false)
I.cooked_porkchop = (c) => meat(c, hex(0xc4794a), true)

I.melon_slice = (c) => {
  for (let y = 8; y < 25; y++) {
    const t = (y - 8) / 16
    const w = Math.round(3 + t * 22)
    for (let x = 16 - w / 2; x < 16 + w / 2; x++) {
      const rind = y > 22
      set(c, Math.round(x), y, rind ? hex(0x3f7a34) : hex(0xe2453f))
    }
  }
  for (let i = 0; i < 4; i++)
    box(c, 11 + i * 3, 16 + (i % 2) * 3, 2, 2, hex(0x2a2a20), { outline: 0 })
}

// ── monta a folha ───────────────────────────────────────────────────────────
//
// ⚠️ UMA LISTA SÓ, e ela existe porque a duplicada já custou caro: os nomes das
// ferramentas apareciam DUAS vezes aqui — uma pra pular o molde sem tier, outra
// pra emitir os quatro tiers. Acrescentar a enxada em só uma das duas produz a
// sprite `hoe` solta na folha e nenhuma `wood_hoe`, e o sintoma é um item com
// ícone de pedra no inventário, que ninguém liga a esta linha.
const MOLDES_DE_FERRAMENTA = ['pickaxe', 'axe', 'shovel', 'sword', 'hoe']

// ── FERMENTAÇÃO ────────────────────────────────────────────────────────────
//
// ⚠️ GARRAFA COLORIDA POR EFEITO, e essa é a lição que este arquivo inteiro
// existe pra não repetir: até 2026-08-19 todo item emprestava o cubo do
// "material mais próximo", e diamante, picareta e espada saíam como três cubos
// cianos idênticos. Nove poções com a mesma sprite seriam o mesmo defeito com
// nome novo — o jogador precisa distinguir de relance o que está na hotbar.
//
// A silhueta é UMA (bulbo, gargalo, rolha), e o que muda é o líquido dentro.

/** A garrafa vazia: só o vidro e a rolha. `liquido` pinta o conteúdo. */
const garrafa = (c, liquido = null) => {
  const VIDRO = hex(0xc7dfe4)
  // bulbo
  for (let y = 13; y < 27; y++) {
    const t = (y - 13) / 13
    const w = Math.round(6 + Math.sin(t * Math.PI) * 5 + t * 3)
    for (let x = 16 - w; x <= 16 + w; x++) {
      const borda = x <= 16 - w + 1 || x >= 16 + w - 1 || y >= 25
      const dentro = !borda && y > 14
      if (dentro && liquido && y > 17) {
        // o líquido só enche de 17 pra baixo: sobra um dedo de ar no gargalo,
        // que é o que faz a garrafa parecer garrafa e não um bloco de cor
        set(c, x, y, tone(liquido, 1.2 - (y - 17) / 16))
      } else {
        set(c, x, y, tone(VIDRO, borda ? 0.72 : 1.06), borda ? 255 : 150)
      }
    }
  }
  // gargalo
  box(c, 14, 7, 4, 7, tone(VIDRO, 0.95), { outline: 0.3 })
  // rolha
  box(c, 13, 4, 6, 4, hex(0x8a6a3c))
}

I.glass_bottle = (c) => garrafa(c)
I.water_bottle = (c) => garrafa(c, hex(0x3f7fd6))
// A estranha é a única sem efeito, e a cor diz isso: cinza-arroxeada, sem brilho.
I.pocao_estranha = (c) => garrafa(c, hex(0x6b5f7a))
I.pocao_velocidade = (c) => garrafa(c, hex(0x7cd0f0))
I.pocao_lentidao = (c) => garrafa(c, hex(0x5a6a80))
I.pocao_forca = (c) => garrafa(c, hex(0xd4402a))
I.pocao_cura = (c) => garrafa(c, hex(0xf24a72))
I.pocao_dano = (c) => garrafa(c, hex(0x5a1030))
I.pocao_veneno = (c) => garrafa(c, hex(0x5aa02a))
I.pocao_respiracao = (c) => garrafa(c, hex(0x2ab0a8))

I.sugar = (c) => dust(c, hex(0xf0f0f0), 21)
I.spider_eye = (c) => {
  disc(c, 16, 17, 7.5, hex(0x8a2a2a))
  disc(c, 16, 17, 4.5, hex(0xd8a828))
  disc(c, 16, 17, 2, hex(0x1a1010))
  // o brilho que faz o olho parecer úmido e não um botão
  disc(c, 13.5, 14.5, 1.4, hex(0xf0e0c0))
}
I.fermented_spider_eye = (c) => {
  disc(c, 16, 17, 7.5, hex(0x4a2a5a))
  disc(c, 16, 17, 4.5, hex(0x7a9a3a))
  disc(c, 16, 17, 2, hex(0x101010))
  disc(c, 13.5, 14.5, 1.4, hex(0xc0e0a0))
}
// A verruga: três bulbos num talo, como ela aparece no chão do Nether.
I.nether_wart = (c) => {
  stroke(c, 15, 24, 15, 13, 2, hex(0x4a0c12))
  disc(c, 16, 12, 4, hex(0xa02028))
  disc(c, 11, 17, 3.2, hex(0x8a1a20))
  disc(c, 21, 18, 3.2, hex(0x8a1a20))
  disc(c, 15, 11, 1.4, hex(0xd8505a))
}

function main() {
  mkdirSync(OUT, { recursive: true })

  const entries = []
  for (const [key, fn] of Object.entries(I)) {
    if (MOLDES_DE_FERRAMENTA.includes(key)) continue
    entries.push([key, fn])
  }
  for (const tier of ['wood', 'stone', 'iron', 'diamond']) {
    for (const kind of MOLDES_DE_FERRAMENTA) {
      entries.push([`${tier}_${kind}`, (c) => I[kind](c, TIER[tier])])
    }
  }
  // A ARMADURA: quatro formas × três paletas, como as ferramentas. Arte
  // própria (Goal 21, onda 3.1).
  for (const mat of Object.keys(ARMADURA)) {
    for (const peca of Object.keys(PECA)) {
      entries.push([`${mat}_${peca}`, (c) => PECA[peca](c, ARMADURA[mat])])
    }
  }
  entries.sort((a, b) => (a[0] < b[0] ? -1 : 1))

  const names = entries.map((e) => e[0])
  const cols = Math.ceil(Math.sqrt(names.length))
  const rows = Math.ceil(names.length / cols)
  const W = cols * S
  const H = rows * S
  const sheet = new Uint8Array(W * H * 4)

  entries.forEach(([, fn], idx) => {
    const c = sprite()
    fn(c)
    const tx = (idx % cols) * S
    const ty = Math.floor(idx / cols) * S
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const src = (y * S + x) * 4
        const dst = ((ty + y) * W + (tx + x)) * 4
        sheet[dst] = c.d[src]
        sheet[dst + 1] = c.d[src + 1]
        sheet[dst + 2] = c.d[src + 2]
        sheet[dst + 3] = c.d[src + 3]
      }
  })

  writeFileSync(resolve(OUT, 'items.png'), encodePNG(sheet, W, H))
  // A quebra de linha final é a mesma história do manifesto de blocos: sem ela
  // o `format:check` reprova o arquivo toda vez que os ícones são regerados.
  writeFileSync(
    resolve(OUT, 'items.json'),
    JSON.stringify({ tile: S, cols, rows, names }, null, 2) + '\n',
  )
  console.log(`[roquecraft] ${names.length} ícones de item ${S}×${S} → ${W}×${H} (${cols}×${rows})`)
}

main()
