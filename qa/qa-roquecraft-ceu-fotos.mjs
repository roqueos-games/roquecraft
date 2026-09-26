//
// FOTOS DO CÉU NO JOGO DE VERDADE — ao nível do chão, qualidade máxima.
// Sem análise: o objetivo aqui é OLHAR. Medida sem foto erra de alvo; foto sem
// medida erra de causa. Precisa das duas.
//
//   node scripts/qa-roquecraft-ceu-fotos.mjs [semente] [sufixo]
//
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const DIST = path.resolve('dist/pwa')
const SUFIXO = process.argv[3] || 'antes'
const OUT = path.resolve('scripts/.qa-ceu', SUFIXO)
fs.mkdirSync(OUT, { recursive: true })
const T = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
}
const s = http.createServer((q, r) => {
  const p = decodeURIComponent((q.url || '/').split('?')[0])
  let f = path.join(DIST, p)
  try {
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = shellDoApp(DIST)
  } catch {
    f = shellDoApp(DIST)
  }
  r.setHeader('Content-Type', T[path.extname(f)] || 'application/octet-stream')
  fs.createReadStream(f).pipe(r)
})
await new Promise((r) => s.listen(0, r))
const base = `http://localhost:${s.address().port}`
const SEMENTE = Number(process.argv[2] || 942457)

const b = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
// `ESCALA=3` quadruplica os pixels (o perfil ultra limita o pixelRatio em 2).
// É o modo de MEDIR CUSTO: a 1440x810 o jogo bate no teto de 120 fps e a
// diferença entre nuvem ligada e desligada dá zero — zero de teto, não zero de
// custo. Medida que não consegue variar não é medida.
const ESCALA = Number(process.env.ESCALA || 1)
const ctx = await b.newContext({
  viewport: { width: 1440, height: 810 },
  deviceScaleFactor: ESCALA,
  serviceWorkers: 'block',
  locale: 'pt-BR',
})
const page = await ctx.newPage()
const erros = []
page.on('pageerror', (e) => erros.push(String(e.message).slice(0, 200)))
page.on('console', (m) => {
  const t = m.text()
  if (/Shader|WebGL|INVALID|context lost/i.test(t)) erros.push(t.slice(0, 200))
})
await page.addInitScript(
  `window.__ROS_E2E__={auth:{uid:'e2e',email:'e@e.t',emailVerified:true,displayName:'E',role:'user'},googleDrive:{isConnected:false,files:[],user:{}},googleMapsApiKey:'',roquecraftSeed:${SEMENTE}}`,
)
await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => !!window.__rosStore, null, { timeout: 30000 })
await page.waitForTimeout(1200)
await page.evaluate(() => window.__rosStore.openWindow('roquecraft'))
await page.waitForFunction(() => window.__roquecraft?.state?.ready === true, null, {
  timeout: 120000,
})
await page.evaluate(async () => {
  window.__roquecraft.setQuality('ultra')
  await new Promise((r) => setTimeout(r, 3000))
})
// Maximiza a janela e TIRA o véu do "clique para jogar" — ele é um scrim
// translúcido por cima da tela inteira, e fotografar através dele mede a
// opacidade do véu, não o céu (a mesma armadilha que custou uma rodada no QA
// da interface).
await page.evaluate(async () => {
  window.__rosStore?.maximizeWindow?.('roquecraft')
  await new Promise((r) => setTimeout(r, 900))
})
// Em headless o pointer lock não engata, então o botão nunca some sozinho. Ele
// é um scrim translúcido sobre a tela inteira: fotografar através dele mede a
// opacidade do véu, não o céu (a mesma armadilha que custou uma rodada no QA da
// interface). Sai por CSS.
await page.addStyleTag({ content: '.ros-roquecraft__play { display: none !important }' })
await page.waitForTimeout(600)
await page.evaluate(async () => {
  const rc = window.__roquecraft
  const h = rc.surfaceAt(0, 0)
  rc.teleport(0.5, (Number.isFinite(h) ? h : 66) + 2, 0.5)
  rc.setFlying(false)
  await rc.waitChunks(6)
})
await page.waitForTimeout(3500)

// azimute do sol: plano (0.94, *, 0.34)
const AZ_SOL = Math.atan2(0.94, 0.34)
const CENAS = [
  { nome: '01-nascer-para-o-sol', ticks: 700, yaw: AZ_SOL, pitch: 0.12 },
  { nome: '02-manha-90-do-sol', ticks: 3000, yaw: AZ_SOL + Math.PI / 2, pitch: 0.35 },
  { nome: '03-manha-para-o-sol-alto', ticks: 3000, yaw: AZ_SOL, pitch: 0.7 },
  { nome: '04-meio-dia-horizonte', ticks: 6000, yaw: 1.0, pitch: 0.18 },
  { nome: '05-meio-dia-para-cima', ticks: 6000, yaw: 1.0, pitch: 1.1 },
  { nome: '06-tarde-nuvens', ticks: 9500, yaw: AZ_SOL + 2.2, pitch: 0.45 },
  { nome: '07-poente', ticks: 11800, yaw: AZ_SOL + Math.PI, pitch: 0.12 },
  { nome: '08-poente-de-costas', ticks: 11800, yaw: AZ_SOL, pitch: 0.3 },
  { nome: '09-crepusculo', ticks: 13200, yaw: AZ_SOL + Math.PI, pitch: 0.2 },
  { nome: '10-noite-para-cima', ticks: 16000, yaw: 0.6, pitch: 1.0 },
  { nome: '11-noite-horizonte', ticks: 16000, yaw: 0.6, pitch: 0.1 },
  { nome: '12-meia-noite-lua', ticks: 18000, yaw: AZ_SOL + Math.PI, pitch: 1.2 },
]

const tela = await page.$('canvas')
const custo = []
for (const c of CENAS) {
  const fps = await page.evaluate(async ({ ticks, yaw, pitch }) => {
    const rc = window.__roquecraft
    rc.setTime(ticks)
    rc.look(yaw, pitch)
    await new Promise((r) => setTimeout(r, 1400))
    // média dos quadros do último segundo: o céu novo faz até 10 oitavas de
    // ruído por pixel e o custo tem que aparecer num número, não no olho.
    const a = []
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 180))
      a.push(rc.state.fps)
    }
    return { fps: Math.round(a.reduce((s, v) => s + v, 0) / a.length), tri: rc.state.triangles }
  }, c)
  custo.push({ cena: c.nome, ...fps })
  fs.writeFileSync(path.join(OUT, `${c.nome}.png`), await (tela || page).screenshot())
}

// Quanto custam as NUVENS. O céu novo faz até 10 oitavas de ruído de gradiente
// por pixel de céu; "parece rápido" não é medida. Olhando pra cima, onde o céu
// ocupa o quadro inteiro, é onde o custo aparece inteiro.
const precoDaNuvem = []
for (const [nome, ticks, pitch] of [
  ['meio-dia-para-cima', 6000, 1.1],
  ['meio-dia-horizonte', 6000, 0.18],
  ['noite-para-cima', 16000, 1.0],
]) {
  const medida = await page.evaluate(
    async ({ ticks, pitch }) => {
      const rc = window.__roquecraft
      rc.setTime(ticks)
      rc.look(1.0, pitch)
      const amostra = async () => {
        await new Promise((r) => setTimeout(r, 1500))
        const a = []
        for (let i = 0; i < 8; i++) {
          await new Promise((r) => setTimeout(r, 170))
          a.push(rc.state.fps)
        }
        return Math.round(a.reduce((s, v) => s + v, 0) / a.length)
      }
      rc.setFx({ clouds: true })
      const com = await amostra()
      rc.setFx({ clouds: false })
      const sem = await amostra()
      rc.setFx({ clouds: true })
      return { com, sem }
    },
    { ticks, pitch },
  )
  precoDaNuvem.push({
    cena: nome,
    ...medida,
    custoFps: medida.sem - medida.com,
    // Se os dois lados estão no teto, o zero não significa "de graça".
    noTeto: medida.com >= 118 && medida.sem >= 118,
  })
}

console.log(JSON.stringify({ saida: OUT, custo, precoDaNuvem, erros }, null, 2))
await b.close()
s.close()
