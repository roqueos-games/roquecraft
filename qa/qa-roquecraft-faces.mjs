//
// AS SEIS FACES, VISTAS DE VERDADE.
//
// Relato do founder (2026-08-22): "você validou a construção dos blocos indo
// pra frente, mas para os lados e para trás os blocos estão com faces vazias e
// sem textura e colisão".
//
// O mesher já foi provado nos dados: `mesherFaces.spec.js` mostra que todo
// bloco do catálogo emite as 6 direções com winding CCW, e
// `mesherBuracos.spec.js` varre um mundo inteiro — parado e com o jogador
// andando nas quatro direções — sem achar uma face exposta sem malha. Se o
// buraco existe, ele nasce DEPOIS do mesher: no renderer.
//
// Então este harness fotografa. Um bloco SOZINHO no ar, com céu atrás, girando
// a câmera em volta dele. Se uma face não é desenhada, daquele ângulo se vê o
// céu ATRAVÉS do bloco — e a silhueta encolhe. A medida é objetiva: quantos
// pixels dentro da caixa projetada NÃO são céu.
//
// O enquadramento não é chutado: `projetar()` devolve onde os 8 cantos do bloco
// caem na tela. Recorte por fração de tela já me fez medir o céu achando que
// media a piscina (QA da água, 2026-08-22) e dar "OK" duas vezes seguidas.
//
// Uso: node scripts/qa-roquecraft-faces.mjs [tag]   (exige dist/pwa)
// Saída: scripts/.qa-faces/*.png + report.json (gitignored)
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const { PNG } = createRequire(import.meta.url)('pngjs')

const DIST = path.resolve('dist/pwa')
const TAG = process.argv[2] || 'faces'
const OUT = path.resolve('scripts/.qa-faces')
fs.mkdirSync(OUT, { recursive: true })

const T = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
}
const server = http.createServer((req, res) => {
  const p = decodeURIComponent((req.url || '/').split('?')[0])
  let fp = path.join(DIST, p)
  try {
    if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) fp = shellDoApp(DIST)
  } catch {
    fp = shellDoApp(DIST)
  }
  res.setHeader('Content-Type', T[path.extname(fp)] || 'application/octet-stream')
  fs.createReadStream(fp).pipe(res)
})
const SEED = `window.__ROS_E2E__ = { auth:{uid:'e2e-uid',email:'e2e@roqueos.test',emailVerified:true,displayName:'E2E',role:'user'}, googleDrive:{isConnected:false,files:[],user:{}}, googleMapsApiKey:'', roquecraftSeed: 20260819 }`
const SEM_HUD = `.ros-roquecraft__play,.rc-hud,.ros-roquecraft__vignette,.ros-roquecraft__hurt,.ros-roquecraft__espera{display:none!important}`

await new Promise((r) => server.listen(0, r))
const base = `http://localhost:${server.address().port}`
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const ctx = await browser.newContext({
  viewport: { width: 1024, height: 640 },
  deviceScaleFactor: 1,
  serviceWorkers: 'block',
  locale: 'pt-BR',
})
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`))
page.on('console', (m) => {
  const t = m.text()
  if (/Shader Error|not compiled|INVALID_OPERATION: useProgram/i.test(t))
    errors.push(`SHADER ${t.slice(0, 400)}`)
})
await page.addInitScript(SEED)
await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => !!window.__rosStore, null, { timeout: 30000 })
await page.waitForTimeout(1200)
await page.evaluate(() => window.__rosStore.openWindow('roquecraft'))
await page.waitForFunction(() => window.__roquecraft?.state?.ready === true, null, {
  timeout: 90000,
})
await page.addStyleTag({ content: SEM_HUD })

// ── CENA: um bloco de cada tipo, sozinho no ar, bem acima do terreno ───────
// Alto o bastante pra que o horizonte fique ABAIXO dele em toda órbita: assim
// o fundo é sempre céu liso e a silhueta é fácil de separar.
const ALVOS = [
  { key: 'stone', x: 40, y: 100, z: 0 },
  { key: 'ice', x: 40, y: 100, z: 24 },
  { key: 'glass', x: 40, y: 100, z: 48 },
  { key: 'oakLog', x: 40, y: 100, z: 72 },
]

await page.evaluate(async (ALVOS) => {
  const rc = window.__roquecraft
  rc.setTime(6000)
  rc.teleport(40, 110, 36)
  await rc.waitChunks(6)
  for (const a of ALVOS) rc.fill(a.x, a.y, a.z, a.x, a.y, a.z, a.key)
  await new Promise((r) => setTimeout(r, 1500))
}, ALVOS)

const RAIO = 7
const AZIMUTES = [0, 45, 90, 135, 180, 225, 270, 315]
// Também de cima e de baixo: a queixa do gelo era "sem as laterais e inferior".
const ELEVACOES = [
  { nome: 'nivel', dy: 0 },
  { nome: 'debaixo', dy: -5 },
  { nome: 'decima', dy: 5 },
]

/** Fração de pixels da caixa que NÃO são o céu de referência. */
function silhueta(buf, caixa, ceu) {
  const png = PNG.sync.read(buf)
  let dentro = 0
  let solido = 0
  const x0 = Math.max(0, Math.floor(caixa.x0))
  const x1 = Math.min(png.width - 1, Math.ceil(caixa.x1))
  const y0 = Math.max(0, Math.floor(caixa.y0))
  const y1 = Math.min(png.height - 1, Math.ceil(caixa.y1))
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (png.width * y + x) << 2
      dentro++
      const d =
        Math.abs(png.data[i] - ceu[0]) +
        Math.abs(png.data[i + 1] - ceu[1]) +
        Math.abs(png.data[i + 2] - ceu[2])
      if (d > 40) solido++
    }
  }
  return { dentro, solido, fracao: dentro ? +(solido / dentro).toFixed(3) : 0 }
}

/** Cor média de um retângulo — usado pra pegar o céu longe do bloco. */
function corMedia(buf, x0, y0, x1, y1) {
  const png = PNG.sync.read(buf)
  let r = 0,
    g = 0,
    b = 0,
    n = 0
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = (png.width * y + x) << 2
      r += png.data[i]
      g += png.data[i + 1]
      b += png.data[i + 2]
      n++
    }
  return [r / n, g / n, b / n]
}

const relatorio = []
for (const alvo of ALVOS) {
  for (const el of ELEVACOES) {
    const medidas = []
    for (const az of AZIMUTES) {
      const caixa = await page.evaluate(
        async ({ alvo, az, el, RAIO }) => {
          const rc = window.__roquecraft
          const rad = (az * Math.PI) / 180
          // câmera na órbita, olhando pro CENTRO do bloco
          const cx = alvo.x + 0.5 + Math.sin(rad) * RAIO
          const cz = alvo.z + 0.5 + Math.cos(rad) * RAIO
          const cy = alvo.y + 0.5 + el.dy
          rc.teleport(cx, cy, cz)
          // yaw pra olhar de volta ao bloco; pitch pela diferença de altura
          const yaw = Math.atan2(alvo.x + 0.5 - cx, -(alvo.z + 0.5 - cz))
          const pitch = Math.atan2(alvo.y + 0.5 - cy, RAIO)
          rc.look(yaw, pitch)
          await new Promise((r) => setTimeout(r, 450))
          // caixa de tela dos 8 cantos do bloco
          let x0 = 1e9,
            y0 = 1e9,
            x1 = -1e9,
            y1 = -1e9
          let frente = true
          for (const dx of [0, 1])
            for (const dy of [0, 1])
              for (const dz of [0, 1]) {
                const p = rc.projetar(alvo.x + dx, alvo.y + dy, alvo.z + dz)
                if (!p) return null
                if (!p.frente) frente = false
                x0 = Math.min(x0, p.u)
                x1 = Math.max(x1, p.u)
                y0 = Math.min(y0, p.v)
                y1 = Math.max(y1, p.v)
              }
          return { x0, y0, x1, y1, frente, inspect: rc.inspect() }
        },
        { alvo, az, el, RAIO },
      )
      if (!caixa || !caixa.frente) {
        medidas.push({ az, erro: 'bloco fora do frustum' })
        continue
      }
      const buf = await page.screenshot()
      const W = 1024,
        H = 640
      const px = { x0: caixa.x0 * W, x1: caixa.x1 * W, y0: caixa.y0 * H, y1: caixa.y1 * H }
      // céu de referência: faixa no alto da tela, longe do bloco
      const ceu = corMedia(buf, 20, 10, 200, 60)
      const s = silhueta(buf, px, ceu)
      medidas.push({ az, ...s, secoes: caixa.inspect?.meshes, noFrustum: caixa.inspect?.inFrustum })
      fs.writeFileSync(
        path.join(OUT, `${alvo.key}-${el.nome}-${String(az).padStart(3, '0')}.png`),
        buf,
      )
    }
    const fracoes = medidas.filter((m) => m.fracao !== undefined).map((m) => m.fracao)
    const min = Math.min(...fracoes)
    const max = Math.max(...fracoes)
    relatorio.push({
      bloco: alvo.key,
      elevacao: el.nome,
      min,
      max,
      // Uma face faltando faz a silhueta despencar naquele azimute. Bloco opaco
      // sólido tem que cobrir quase a mesma área de todo ângulo.
      veredito: min < max * 0.55 ? 'ASSIMETRICO' : min < 0.35 ? 'FRACO' : 'OK',
      medidas,
    })
  }
}

const saida = { tag: TAG, erros: errors, relatorio }
fs.writeFileSync(path.join(OUT, `report-${TAG}.json`), JSON.stringify(saida, null, 2))
console.log(
  JSON.stringify(
    {
      erros: errors.length,
      resumo: relatorio.map((r) => `${r.bloco}/${r.elevacao}: ${r.veredito} (${r.min}..${r.max})`),
    },
    null,
    2,
  ),
)
await browser.close()
server.close()
// O veredito sai pelo código de saída: o ledger de sondas lê ISSO, não a prosa.
// Face FRACA ou ASSIMÉTRICA em qualquer bloco/elevação reprova.
process.exit(relatorio.every((r) => r.veredito === 'OK') && errors.length === 0 ? 0 : 1)
