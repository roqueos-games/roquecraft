// RoqueCraft — arte de capa, fundo do menu e ícones. TUDO autoral.
//
// Por que este arquivo existe: a regra 36-games manda a capa de jogo nativo ser
// frame de gameplay real. O founder revogou a regra PARA ESTE JOGO em
// 2026-08-20 e pediu key art ilustrada (registrado em 36-games.md). Então a
// arte é DESENHADA — não é screenshot com filtro.
//
// Como é desenhada: um renderizador isométrico mínimo (dentro deste arquivo)
// recebe uma cena declarada em voxels e emite SVG. Cada cubo vira três
// polígonos (topo, esquerda, direita) com a mesma paleta do jogo. É a mesma
// linguagem visual do RoqueCraft, mas COMPOSTA — ilha flutuante, cachoeira,
// casa, árvore, silhueta de montanha ao fundo, hora dourada.
//
// O SVG é rasterizado pelo Chromium do Playwright (o mesmo que o harness de QA
// já usa) — sem dependência nova.
//
// Uso: node scripts/gen-roquecraft-art.mjs
// Saída (committada):
//   public/games/covers/roquecraft.jpg        capa da galeria (1024×642)
//   public/games/roquecraft/art/menu-bg.jpg   fundo do menu/boot (1920×1080)
//   public/games/roquecraft/icon.svg          ícone vetorial (dock, 24-32px)
//   public/games/roquecraft/icon.png          ícone renderizado (512px, alpha)

import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const COVERS = resolve(ROOT, 'public/games/covers')
const ART = resolve(ROOT, 'public/games/roquecraft/art')
const GAME = resolve(ROOT, 'public/games/roquecraft')

// ── projeção isométrica ─────────────────────────────────────────────────────
// Cubo de lado 1 vira um hexágono: topo em losango, duas laterais em
// paralelogramo. TW/TH controlam o "achatamento" (2:1 é o iso clássico de
// pixel art; 1.9 dá um respiro a mais na altura).
const TW = 30 // meia largura do losango do topo
const TH = 15 // meia altura do losango do topo
const CH = 26 // altura da lateral do cubo

const proj = (x, y, z) => [(x - z) * TW, (x + z) * TH - y * CH]

// ── paleta (mesma família das texturas do jogo, em sRGB) ────────────────────
const P = {
  grass: { top: '#7cb342', left: '#6b4426', right: '#553618', fringe: '#5f9134' },
  dirt: { top: '#7a5334', left: '#6b4426', right: '#553618' },
  stone: { top: '#9aa0a6', left: '#7e848a', right: '#666c72' },
  darkstone: { top: '#6f757b', left: '#5a6066', right: '#474d53' },
  sand: { top: '#e5d5a3', left: '#cbbb87', right: '#b3a471' },
  log: { top: '#a1753f', left: '#7d5730', right: '#634426' },
  planks: { top: '#c39b5f', left: '#a37f4a', right: '#87683a' },
  leaves: { top: '#4e9440', left: '#3f7d34', right: '#336629' },
  leavesDeep: { top: '#3f7d34', left: '#336629', right: '#2a5522' },
  water: { top: '#3d7fc4', left: '#2f68a6', right: '#265789' },
  snow: { top: '#f2f6fb', left: '#dbe3ec', right: '#c3ccd8' },
  glow: { top: '#ffd97a', left: '#f0b849', right: '#d99a2f' },
  roof: { top: '#b4553f', left: '#94422f', right: '#7a3626' },
}

// ── cena declarada: [x, y, z, tipo] ─────────────────────────────────────────
// A ilha é gerada por uma função de raio (fica orgânica sem eu digitar 400
// coordenadas), e o que é "desenho" mesmo — casa, árvore, cachoeira — é posto
// à mão em cima.
//
// Formato de GOTA, não de prato: a primeira versão tinha o fundo raso e a ilha
// lia como uma placa de lego. O que faz o pedaço de mundo arrancado funcionar é
// a massa de pedra afunilando por 12 blocos embaixo da grama.
function ilha() {
  const v = []
  const R = 7.2
  const topo = (x, z) => {
    const d = Math.hypot(x, z)
    if (d > R) return null
    let h = Math.round(1.9 * Math.cos((d / R) * 1.35))
    if (x > 2.5 && z < 1) h += 1 // platô onde a casa senta
    return h
  }
  for (let x = -8; x <= 8; x++) {
    for (let z = -8; z <= 8; z++) {
      const h = topo(x, z)
      if (h === null) continue
      const d = Math.hypot(x, z)
      const t = 1 - d / R
      // expoente 1.35 (não 2): com t² o centro descia 12 blocos e as bordas 1,
      // e a ilha ganhava duas PERNAS de pedra penduradas. Gota, não mesa.
      const fundo = h - Math.round(1.2 + Math.pow(t, 1.15) * 6.2)
      for (let y = fundo; y <= h; y++) {
        let tipo = 'stone'
        if (y === h) tipo = 'grass'
        else if (y > h - 2) tipo = 'dirt'
        else if (y < fundo + 3) tipo = 'darkstone'
        v.push([x, y, z, tipo])
      }
    }
  }
  return v
}

function arvore(cx, cy, cz, alt = 5) {
  const v = []
  for (let i = 0; i < alt; i++) v.push([cx, cy + i, cz, 'log'])
  const copa = [
    [alt - 2, 2.3],
    [alt - 1, 2.5],
    [alt, 2.1],
    [alt + 1, 1.45],
    [alt + 2, 0.8],
  ]
  for (const [oy, r] of copa) {
    for (let x = -3; x <= 3; x++) {
      for (let z = -3; z <= 3; z++) {
        const d = Math.hypot(x, z)
        if (d > r) continue
        if (x === 0 && z === 0 && oy < alt) continue
        v.push([cx + x, cy + oy, cz + z, d > r - 1 ? 'leavesDeep' : 'leaves'])
      }
    }
  }
  return v
}

// Casa com PAREDE visível: a v1 tinha telhado largo demais e a casa sumia
// debaixo dele — lia como uma laje vermelha no meio do gramado.
function casa(cx, cy, cz) {
  const v = []
  const W = 4
  const D = 4
  const H = 4
  for (let x = 0; x < W; x++) {
    for (let z = 0; z < D; z++) {
      for (let y = 0; y < H; y++) {
        const borda = x === 0 || z === 0 || x === W - 1 || z === D - 1
        if (!borda) continue
        const quina = (x === 0 || x === W - 1) && (z === 0 || z === D - 1)
        const janela = (y === 2 && z === D - 1 && x === 2) || (y === 2 && x === W - 1 && z === 1)
        const porta = y < 2 && z === D - 1 && x === 1
        if (porta) {
          v.push([cx + x, cy + y, cz + z, 'log'])
          continue
        }
        v.push([cx + x, cy + y, cz + z, janela ? 'glow' : quina ? 'log' : 'planks'])
      }
    }
  }
  // Telhado de duas águas DE VERDADE: a cumeeira corre no eixo X e só o Z
  // estreita. Estreitando os dois eixos (v2) sai um zigurate de pagode, não uma
  // casa — foi o defeito mais gritante da segunda arte.
  for (let y = 0; y < 3; y++) {
    for (let x = -1; x < W + 1; x++) {
      for (let z = -1 + y; z < D + 1 - y; z++) {
        v.push([cx + x, cy + H + y, cz + z, 'roof'])
      }
    }
  }
  // tocha na frente da porta: o ponto quente que faz o olho pousar
  v.push([cx + 1, cy + 2, cz + D, 'glow'])
  return v
}

// A cachoeira é o que dá MOVIMENTO a uma imagem parada. Larga em cima,
// afinando na queda, e morrendo em névoa — não um palito azul (v1).
function cachoeira(cx, cy, cz, prof = 11) {
  const v = []
  // poça em cima, na grama
  for (let x = -2; x <= 1; x++) for (let z = -1; z <= 2; z++) v.push([cx + x, cy, cz + z, 'water'])
  // A queda AFINA e desloca meio bloco por fiada. Coluna reta de largura fixa
  // (v1..v3) lê como cano azul, não como água caindo.
  for (let y = -1; y >= -prof; y--) {
    const t = -y / prof
    const larg = t < 0.3 ? 3 : t < 0.62 ? 2 : 1
    const off = t < 0.3 ? 0 : t < 0.62 ? 0 : 1
    for (let w = 0; w < larg; w++) v.push([cx - 2 + off + w, cy + y, cz, 'water'])
    if (t < 0.45) v.push([cx - 2, cy + y, cz + 1, 'water'])
  }
  return v
}

// Ilha pequena ao fundo: dá ESCALA e profundidade. Sem ela a arte tem um
// assunto só, e o olho não tem pra onde ir depois.
function ilhota(cx, cy, cz) {
  const v = []
  for (let x = -3; x <= 3; x++) {
    for (let z = -3; z <= 3; z++) {
      const d = Math.hypot(x, z)
      if (d > 3) continue
      const h = Math.round(0.8 * Math.cos((d / 3) * 1.3))
      const fundo = h - Math.round(1 + (1 - d / 3) * 4)
      for (let y = fundo; y <= h; y++) {
        v.push([cx + x, cy + y, cz + z, y === h ? 'grass' : y > h - 2 ? 'dirt' : 'stone'])
      }
    }
  }
  v.push(...arvore(cx, cy + 1, cz, 3))
  return v
}

// ── SVG ─────────────────────────────────────────────────────────────────────
function cubosSvg(voxels, { opacidade = 1 } = {}) {
  // pintor: mais fundo primeiro. Em iso, (x + z + y) cresce na direção da câmera.
  const ord = [...voxels].sort((a, b) => a[0] + a[2] + a[1] * 0.9 - (b[0] + b[2] + b[1] * 0.9))
  const out = []
  for (const [x, y, z, tipo] of ord) {
    const cor = P[tipo] || P.stone
    const [px, py] = proj(x, y, z)
    const t = `${px},${py - TH} ${px + TW},${py} ${px},${py + TH} ${px - TW},${py}`
    const l = `${px - TW},${py} ${px},${py + TH} ${px},${py + TH + CH} ${px - TW},${py + CH}`
    const r = `${px + TW},${py} ${px},${py + TH} ${px},${py + TH + CH} ${px + TW},${py + CH}`
    const o = tipo === 'water' ? opacidade * 0.82 : opacidade
    out.push(
      `<polygon points="${l}" fill="${cor.left}" opacity="${o}"/>` +
        `<polygon points="${r}" fill="${cor.right}" opacity="${o}"/>` +
        `<polygon points="${t}" fill="${cor.top}" opacity="${o}"/>`,
    )
    // franja de grama: a listra verde que escorre da borda do bloco de grama
    if (tipo === 'grass') {
      const f = P.grass.fringe
      out.push(
        `<polygon points="${px - TW},${py} ${px},${py + TH} ${px},${py + TH + 7} ${px - TW},${py + 7}" fill="${f}" opacity="${o}"/>` +
          `<polygon points="${px + TW},${py} ${px},${py + TH} ${px},${py + TH + 7} ${px + TW},${py + 7}" fill="${f}" opacity="${o * 0.86}"/>`,
      )
    }
  }
  return out.join('')
}

function nuvem(x, y, s, op) {
  const b = []
  for (const [dx, dy, r] of [
    [0, 0, 34],
    [30, 6, 26],
    [-28, 8, 22],
    [12, -14, 22],
    [-10, -10, 24],
  ]) {
    b.push(`<ellipse cx="${x + dx * s}" cy="${y + dy * s}" rx="${r * s * 1.5}" ry="${r * s}" />`)
  }
  return `<g fill="#ffffff" opacity="${op}">${b.join('')}</g>`
}

function passaro(x, y, s) {
  return `<path d="M ${x} ${y} q ${6 * s} ${-5 * s} ${12 * s} 0 q ${6 * s} ${-5 * s} ${12 * s} 0"
    fill="none" stroke="#2b3d52" stroke-width="${2.2 * s}" stroke-linecap="round" opacity="0.5"/>`
}

// A serra ao fundo saiu da arte e a FUNÇÃO saiu daqui junto, mas a lição
// fica: montanha desenhada com o mesmo renderizador iso projeta PRA CIMA e
// vira bloco gigante boiando no céu — foi o defeito mais visível da v1. Se
// ela voltar, volta como SILHUETA em degraus, não como cubos.

// Mar de nuvens: faixas de elipses macias, mais quentes embaixo (o sol raso
// bate por baixo) e mais frias em cima. Três camadas com opacidade crescente
// dão volume sem custar nada.
function marDeNuvens(W, H, base) {
  let sd = 4242
  const rnd = () => {
    sd = (sd * 1103515245 + 12345) & 0x7fffffff
    return sd / 0x7fffffff
  }
  const camadas = [
    { dy: -H * 0.02, r: 0.055, op: 0.45, cor: '#cfd9e8', n: 16 },
    { dy: H * 0.03, r: 0.075, op: 0.62, cor: '#eadfd0', n: 14 },
    { dy: H * 0.085, r: 0.1, op: 0.85, cor: '#f6e2c8', n: 12 },
  ]
  const out = [
    `<rect x="0" y="${base + H * 0.06}" width="${W}" height="${H}" fill="#f4dcc0" opacity="0.9"/>`,
  ]
  for (const c of camadas) {
    const g = []
    for (let i = 0; i < c.n; i++) {
      const x = (i / (c.n - 1)) * W + (rnd() - 0.5) * W * 0.09
      const y = base + c.dy + (rnd() - 0.5) * H * 0.03
      const rx = W * c.r * (0.7 + rnd() * 0.8)
      g.push(`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${rx * 0.42}"/>`)
    }
    out.push(`<g fill="${c.cor}" opacity="${c.op}">${g.join('')}</g>`)
  }
  return out.join('')
}

// Exportada porque o gerador de herói (`gen-game-heroes.mjs`) precisa da MESMA
// cena renderizada em 1920 de largura. Ampliar a capa de 1024 dava um herói
// mole; chamar a cena de novo dá pixel de verdade.
export function keyart({ W, H }) {
  // Composição: o assunto denso fica no CENTRO-DIREITA porque o hero da galeria
  // recorta com object-position: 62% center — a coluna esquerda vive sob o
  // scrim do texto (regra 36-games).
  const cx = W * 0.58
  const cy = H * 0.46
  const esc = W / 1250 // ilha ocupando o quadro: a v1 usava W/1600 e ficava miúda

  const cena = [
    ...ilha(),
    ...arvore(-4, 2, -1, 5),
    ...arvore(2, 3, 4, 4),
    ...arvore(-1, 2, -5, 4),
    ...casa(2, 3, -3),
    ...cachoeira(-4, 1, 5, 11),
  ]

  const horizonte = H * 0.74

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="ceu" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#12305e"/>
      <stop offset="26%" stop-color="#3f6fae"/>
      <stop offset="52%" stop-color="#8fb3d6"/>
      <stop offset="70%" stop-color="#e8c491"/>
      <stop offset="86%" stop-color="#f2a35f"/>
      <stop offset="100%" stop-color="#d97a4a"/>
    </linearGradient>
    <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#fff6e0" stop-opacity="1"/>
      <stop offset="30%" stop-color="#ffe0a6" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#ffb45f" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="vinheta" cx="0.5" cy="0.46" r="0.78">
      <stop offset="52%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#06121e" stop-opacity="0.52"/>
    </radialGradient>
    <linearGradient id="bruma" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f0d9b8" stop-opacity="0"/>
      <stop offset="100%" stop-color="#f6cfa0" stop-opacity="0.75"/>
    </linearGradient>
    <filter id="suave"><feGaussianBlur stdDeviation="${W * 0.005}"/></filter>
    <filter id="muitoSuave"><feGaussianBlur stdDeviation="${W * 0.016}"/></filter>
    <filter id="fora"><feGaussianBlur stdDeviation="${W * 0.009}"/></filter>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#ceu)"/>

  <!-- sol baixo: a fonte de luz que justifica a hora dourada e a sombra longa -->
  <ellipse cx="${W * 0.17}" cy="${H * 0.58}" rx="${W * 0.4}" ry="${W * 0.4}" fill="url(#halo)"/>
  <circle cx="${W * 0.17}" cy="${H * 0.58}" r="${W * 0.03}" fill="#fffaf0"/>

  <!-- Serra distante, pequena, logo acima do mar de nuvens -->

  <!-- terceira ilha, minúscula e quase dissolvida na bruma: profundidade sem
       roubar atenção. Serra de pedra aqui virava entulho cinza (v3). -->
  <g transform="translate(${W * 0.86} ${H * 0.52}) scale(${(W / 1250) * 0.2})" opacity="0.35" filter="url(#suave)">
    ${cubosSvg(ilhota(0, 0, 0))}
  </g>

  <!-- MAR DE NUVENS: as ilhas flutuam ACIMA dele. Resolve dois problemas de uma
       vez - o chão chapado que a v3 tinha embaixo, e a pergunta "flutuando sobre
       o quê?". É a imagem que o gênero usa desde sempre, e por bom motivo. -->
  ${marDeNuvens(W, H, horizonte + H * 0.04)}

  ${nuvem(W * 0.13, H * 0.16, W / 1500, 0.42)}
  ${nuvem(W * 0.8, H * 0.11, W / 1200, 0.38)}
  ${nuvem(W * 0.44, H * 0.24, W / 2100, 0.3)}
  ${passaro(W * 0.3, H * 0.19, W / 950)}
  ${passaro(W * 0.36, H * 0.15, W / 1250)}
  ${passaro(W * 0.26, H * 0.14, W / 1350)}

  <!-- ilhota atrás, menor e mais clara: dá escala e um segundo ponto de parada -->
  <g transform="translate(${W * 0.2} ${H * 0.38}) scale(${esc * 0.34})" opacity="0.95">
    ${cubosSvg(ilhota(0, 0, 0))}
  </g>

  <!-- ilha principal -->
  <g transform="translate(${cx} ${cy}) scale(${esc})">
    <ellipse cx="20" cy="360" rx="380" ry="72" fill="#8a4a26" opacity="0.18" filter="url(#muitoSuave)"/>
    ${cubosSvg(cena)}
  </g>

  <!-- sombra da ilha projetada no mar de nuvens: é o que a ancora no espaço -->
  <ellipse cx="${cx - W * 0.03}" cy="${horizonte + H * 0.09}" rx="${W * 0.2}" ry="${H * 0.035}"
    fill="#b08a63" opacity="0.3" filter="url(#muitoSuave)"/>

  <!-- névoa onde a cachoeira morre -->
  <g opacity="0.55" filter="url(#muitoSuave)">
    <ellipse cx="${cx - W * 0.245}" cy="${cy + H * 0.5}" rx="${W * 0.085}" ry="${H * 0.05}" fill="#fdf4e6"/>
    <ellipse cx="${cx - W * 0.235}" cy="${cy + H * 0.44}" rx="${W * 0.05}" ry="${H * 0.03}" fill="#fdf4e6" opacity="0.7"/>
  </g>

  <!-- moldura fora de foco: folhagem entrando no quadro. É o truque mais barato
       pra criar profundidade numa ilustração chapada. -->
  <g filter="url(#fora)" opacity="0.9">
    <g transform="translate(${W * 0.02} ${H * 0.99}) scale(${esc * 2.0})">
      ${cubosSvg([
        [0, 0, 0, 'leavesDeep'],
        [1, 0, 0, 'leavesDeep'],
        [0, 0, 1, 'leaves'],
        [1, 1, 1, 'leavesDeep'],
        [2, 0, 1, 'leavesDeep'],
      ])}
    </g>
    <g transform="translate(${W * 1.0} ${H * 0.86}) scale(${esc * 2.2})">
      ${cubosSvg([
        [0, 0, 0, 'leavesDeep'],
        [0, 1, 0, 'leavesDeep'],
        [0, 0, 1, 'leaves'],
        [-1, 1, 1, 'leavesDeep'],
      ])}
    </g>
  </g>

  <rect width="${W}" height="${H}" fill="url(#vinheta)"/>
</svg>`
}

// ── ícone ───────────────────────────────────────────────────────────────────
// Cubo de grama de três faces. O SVG é o ícone de sistema (leve, nítido a
// 24px); o PNG é o mesmo desenho com grão e cantos, pros tamanhos grandes.
function iconeSvg({ detalhe = false } = {}) {
  const S = 512
  const cx = S / 2
  const w = 196 // meia largura do losango
  const h = 98 // meia altura do losango
  const alt = 168 // altura da lateral
  // centraliza a silhueta INTEIRA (losango + lateral) no quadro
  const cy = (S - (h * 2 + alt)) / 2 + h

  const top = `${cx},${cy - h} ${cx + w},${cy} ${cx},${cy + h} ${cx - w},${cy}`
  const left = `${cx - w},${cy} ${cx},${cy + h} ${cx},${cy + h + alt} ${cx - w},${cy + alt}`
  const right = `${cx + w},${cy} ${cx},${cy + h} ${cx},${cy + h + alt} ${cx + w},${cy + alt}`

  // Grão RECORTADO por face. Sem clip-path (v1) os quadradinhos vazavam pra
  // fora da silhueta e o ícone ficava com sujeira em volta.
  const grao = []
  if (detalhe) {
    let seed = 7
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    const bloco = (n, x0, y0, x1, y1, cores, clip) => {
      const g = []
      for (let i = 0; i < n; i++) {
        const px = x0 + rnd() * (x1 - x0)
        const py = y0 + rnd() * (y1 - y0)
        const c = cores[Math.floor(rnd() * cores.length)]
        g.push(`<rect x="${px}" y="${py}" width="22" height="12" fill="${c}" opacity="0.42"/>`)
      }
      return `<g clip-path="url(#${clip})">${g.join('')}</g>`
    }
    grao.push(bloco(120, cx - w, cy - h, cx + w, cy + h, ['#9ad861', '#67a833', '#8ccc55'], 'cTop'))
    grao.push(bloco(90, cx - w, cy, cx, cy + h + alt, ['#8a5f3c', '#5c3d24', '#7a5334'], 'cLeft'))
    grao.push(bloco(90, cx, cy, cx + w, cy + h + alt, ['#6d4b2e', '#48301c', '#5f4227'], 'cRight'))
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs>
    <clipPath id="cTop"><polygon points="${top}"/></clipPath>
    <clipPath id="cLeft"><polygon points="${left}"/></clipPath>
    <clipPath id="cRight"><polygon points="${right}"/></clipPath>
    <linearGradient id="gt" x1="0.1" y1="0" x2="0.6" y2="1">
      <stop offset="0%" stop-color="#95d75c"/><stop offset="100%" stop-color="#6cae3c"/>
    </linearGradient>
    <linearGradient id="gl" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#639736"/><stop offset="15%" stop-color="#639736"/>
      <stop offset="16%" stop-color="#8a5f3c"/><stop offset="100%" stop-color="#5f4128"/>
    </linearGradient>
    <linearGradient id="gr" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#4f7c2c"/><stop offset="15%" stop-color="#4f7c2c"/>
      <stop offset="16%" stop-color="#70502f"/><stop offset="100%" stop-color="#4d351f"/>
    </linearGradient>
  </defs>
  <polygon points="${left}" fill="url(#gl)"/>
  <polygon points="${right}" fill="url(#gr)"/>
  <polygon points="${top}" fill="url(#gt)"/>
  ${grao.join('')}
  <!-- aresta viva: separa as duas laterais, que senão viram uma mancha só -->
  <line x1="${cx}" y1="${cy + h}" x2="${cx}" y2="${cy + h + alt}" stroke="#000" stroke-opacity="0.16" stroke-width="3"/>
  <polygon points="${top}" fill="none" stroke="#ffffff" stroke-opacity="0.28" stroke-width="4"/>
</svg>`
}

// ── rasterização ────────────────────────────────────────────────────────────
async function raster(page, svg, { W, H, path, type = 'jpeg', quality = 90, escala = 2 }) {
  await page.setViewportSize({ width: W, height: H })
  await page.setContent(
    `<html><body style="margin:0;background:${type === 'png' ? 'transparent' : '#0b1622'}">${svg}</body></html>`,
    { waitUntil: 'load' },
  )
  await page.evaluate(() => document.fonts?.ready)
  const opts = { path, clip: { x: 0, y: 0, width: W, height: H } }
  if (type === 'jpeg') Object.assign(opts, { type: 'jpeg', quality })
  else Object.assign(opts, { type: 'png', omitBackground: true })
  await page.screenshot(opts)
  console.log(
    `  ${path.split('/').slice(-2).join('/')} (${W}×${H}${escala > 1 ? ` @${escala}x` : ''})`,
  )
}

async function main() {
  mkdirSync(COVERS, { recursive: true })
  mkdirSync(ART, { recursive: true })
  mkdirSync(GAME, { recursive: true })

  // o SVG do ícone é arquivo de verdade (é ele que o dock carrega)
  writeFileSync(resolve(GAME, 'icon.svg'), iconeSvg())
  console.log('  public/games/roquecraft/icon.svg')

  const browser = await chromium.launch()
  const page = await browser.newPage({ deviceScaleFactor: 2 })

  // capa da galeria: mesma proporção das outras (1024×642 ≈ 1.6:1)
  await raster(page, keyart({ W: 1024, H: 642 }), {
    W: 1024,
    H: 642,
    path: resolve(COVERS, 'roquecraft.jpg'),
  })

  // fundo do menu/boot: 16:9 pra caber em qualquer janela
  await raster(page, keyart({ W: 1920, H: 1080 }), {
    W: 1920,
    H: 1080,
    path: resolve(ART, 'menu-bg.jpg'),
    quality: 86,
  })

  // ícone grande com grão, alpha preservado
  await raster(page, iconeSvg({ detalhe: true }), {
    W: 512,
    H: 512,
    path: resolve(GAME, 'icon.png'),
    type: 'png',
  })

  await browser.close()
  console.log('[roquecraft] arte gerada')
}

// Só executa quando chamado direto. Sem esta guarda, importar `keyart` daqui
// dispararia a geração inteira da arte do RoqueCraft como efeito colateral.
if (import.meta.url === `file://${process.argv[1]}`)
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
