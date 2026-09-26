//
// A NOITE TEM PERIGO?
//
// `mobs.js` tem 430 linhas de zumbi, esqueleto e aranha — e nenhum deles nasceu
// uma vez sequer desde que o jogo existe, porque `mobEnv()` dizia
// `lightAt: () => 15`. A luz mora no worker; a thread principal não a via.
//
// Esta sonda mede as duas pontas no jogo rodando:
//   1. a ponte de luz: `luzEm(x,y,z)` responde número onde deve, e `null` fora
//      do raio espelhado — inclusive escuro embaixo da terra e claro no topo;
//   2. o efeito: de NOITE, no modo sobrevivência, criatura hostil aparece.
//
// PROVA DE VIDA: a mesma medição roda de DIA. Se nascer hostil de dia também, a
// luz não está sendo consultada e o resultado da noite não significa nada.
//
//   node scripts/qa-roquecraft-noite.mjs [semente]
//
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const DIST = path.resolve('dist/pwa')
const OUT = path.resolve('scripts/.qa-noite')
fs.mkdirSync(OUT, { recursive: true })
const TIPOS = {
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
const servidor = http.createServer((q, r) => {
  const p = decodeURIComponent((q.url || '/').split('?')[0])
  let f = path.join(DIST, p)
  try {
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = shellDoApp(DIST)
  } catch {
    f = shellDoApp(DIST)
  }
  r.setHeader('Content-Type', TIPOS[path.extname(f)] || 'application/octet-stream')
  fs.createReadStream(f).pipe(r)
})
await new Promise((r) => servidor.listen(0, r))
const base = `http://localhost:${servidor.address().port}`
const SEMENTE = Number(process.argv[2] || 942457)

const navegador = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const ctx = await navegador.newContext({
  viewport: { width: 1280, height: 800 },
  serviceWorkers: 'block',
  locale: 'pt-BR',
})
const pagina = await ctx.newPage()
const erros = []
pagina.on('pageerror', (e) => erros.push(String(e.message).slice(0, 200)))
pagina.on('console', (m) => {
  const t = m.text()
  if (m.type() === 'error' && !/Firebase|service worker|ERR_CONNECTION|permissions/i.test(t)) {
    erros.push(t.slice(0, 200))
  }
})
await pagina.addInitScript(
  `window.__ROS_E2E__={auth:{uid:'e2e',email:'e@e.t',emailVerified:true,displayName:'E',role:'user'},googleDrive:{isConnected:false,files:[],user:{}},googleMapsApiKey:'',roquecraftSeed:${SEMENTE}}`,
)
await pagina.goto(`${base}/app`, { waitUntil: 'domcontentloaded' })
await pagina.waitForFunction(() => !!window.__rosStore, null, { timeout: 30000 })
await pagina.waitForTimeout(1200)
await pagina.evaluate(() => window.__rosStore.openWindow('roquecraft'))
await pagina.waitForFunction(() => window.__roquecraft?.state?.ready === true, null, {
  timeout: 120000,
})
await pagina.evaluate(() => window.__rosStore?.maximizeWindow?.('roquecraft'))
await pagina.waitForTimeout(700)
await pagina.addStyleTag({ content: '.ros-roquecraft__play { display: none !important }' })

const relatorio = { semente: SEMENTE, erros }

await pagina.evaluate(async () => {
  const rc = window.__roquecraft
  rc.setMode('survival')
  const h = rc.surfaceAt(0, 0)
  rc.teleport(0.5, (Number.isFinite(h) ? h : 66) + 1, 0.5)
  rc.setFlying(false)
  await rc.waitChunks(5)
  rc.land()
})
await pagina.waitForTimeout(3000)

// ── 1. A ponte de luz responde? ────────────────────────────────────────────
relatorio.ponteDeLuz = await pagina.evaluate(() => {
  const rc = window.__roquecraft
  rc.setTime(6000) // meio-dia: o céu vale integral
  const p = rc.state.player
  const sup = rc.surfaceAt(Math.floor(p.x), Math.floor(p.z))
  return {
    // logo acima da superfície, céu aberto ao meio-dia
    superficieDeDia: rc.luzEm(Math.floor(p.x), sup + 1, Math.floor(p.z)),
    // bem no fundo da rocha
    fundoDaRocha: rc.luzEm(Math.floor(p.x), 5, Math.floor(p.z)),
    // muito longe: fora do raio espelhado, tem que ser `null`
    foraDoRaio: rc.luzEm(Math.floor(p.x) + 400, sup + 1, Math.floor(p.z)),
  }
})

const contarPor = async (ticks, segundos) => {
  await pagina.evaluate((t) => window.__roquecraft.setTime(t), ticks)
  // limpa o que estiver vivo pra a contagem ser do PERÍODO
  await pagina.evaluate(() => window.__roquecraft.setMode('creative'))
  await pagina.waitForTimeout(600)
  await pagina.evaluate(() => window.__roquecraft.setMode('survival'))
  const t0 = Date.now()
  const vistos = new Map()
  while (Date.now() - t0 < segundos * 1000) {
    await pagina.waitForTimeout(700)
    // o tempo do mundo anda sozinho: reancora pra não amanhecer no meio
    await pagina.evaluate((t) => window.__roquecraft.setTime(t), ticks)
    const bichos = await pagina.evaluate(() => window.__roquecraft.criaturas())
    for (const b of bichos) vistos.set(`${b.tipo}@${Math.round(b.x)},${Math.round(b.z)}`, b.tipo)
  }
  const tipos = {}
  for (const t of vistos.values()) tipos[t] = (tipos[t] || 0) + 1
  const HOSTIS = ['zombie', 'skeleton', 'spider', 'creeper']
  return {
    tipos,
    hostis: Object.entries(tipos)
      .filter(([k]) => HOSTIS.includes(k))
      .reduce((s, [, n]) => s + n, 0),
    passivos: Object.entries(tipos)
      .filter(([k]) => !HOSTIS.includes(k))
      .reduce((s, [, n]) => s + n, 0),
  }
}

// ── 2. De NOITE nasce hostil ───────────────────────────────────────────────
relatorio.noite = await contarPor(16000, 26)
fs.writeFileSync(path.join(OUT, 'noite.png'), await pagina.screenshot())

// ── 3. PROVA DE VIDA: de DIA não nasce hostil ──────────────────────────────
relatorio.dia = await contarPor(6000, 22)
fs.writeFileSync(path.join(OUT, 'dia.png'), await pagina.screenshot())

const l = relatorio.ponteDeLuz
relatorio.veredito = {
  ponteDeLuz:
    typeof l.superficieDeDia === 'number' &&
    l.superficieDeDia >= 12 &&
    l.fundoDaRocha === 0 &&
    l.foraDoRaio === null
      ? 'OK'
      : 'FALHOU',
  noiteTemPerigo: relatorio.noite.hostis > 0 ? 'OK' : 'FALHOU',
  provaDeVida:
    relatorio.dia.hostis === 0
      ? 'de dia não nasce hostil — a luz está sendo consultada'
      : `SONDA CEGA — nasceu hostil de dia (${relatorio.dia.hostis})`,
}

fs.writeFileSync(path.join(OUT, 'relatorio.json'), JSON.stringify(relatorio, null, 2))
console.log(JSON.stringify(relatorio, null, 2))
await navegador.close()
servidor.close()
// O veredito sai pelo código de saída: o ledger de sondas lê ISSO, não a prosa.
const falhou = Object.values(relatorio.veredito).some(
  (v) => v === 'FALHOU' || String(v).startsWith('SONDA CEGA'),
)
process.exit(falhou || erros.length > 0 ? 1 : 0)
