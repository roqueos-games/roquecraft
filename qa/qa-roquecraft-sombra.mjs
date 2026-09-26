//
// OS NÚMEROS VIVOS DA SOMBRA, nos três perfis que a desenham.
//
// ⚠️ LIDOS DO OBJETO EM EXECUÇÃO, não da declaração. `radius` nunca foi escrito
// no código antes desta rodada: o valor real só aparecia aqui. E `blocosPorTexel`
// é a conta que diz se o frustum está grande demais pro mapa — é ele que
// governa o quanto a sombra descola no contato.
//
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const DIST = path.resolve('dist/pwa')
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
const b = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const ctx = await b.newContext({
  viewport: { width: 1000, height: 700 },
  deviceScaleFactor: 1,
  serviceWorkers: 'block',
  locale: 'pt-BR',
})
const page = await ctx.newPage()
const erros = []
page.on('pageerror', (e) => erros.push(String(e.message).slice(0, 140)))
await page.addInitScript(
  `window.__ROS_E2E__={auth:{uid:'e2e',email:'e@e.t',emailVerified:true,displayName:'E',role:'user'},googleDrive:{isConnected:false,files:[],user:{}},googleMapsApiKey:'',roquecraftSeed:942457}`,
)
await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => !!window.__rosStore, null, { timeout: 30000 })
await page.waitForTimeout(900)
await page.evaluate(() => window.__rosStore.openWindow('roquecraft'))
await page.waitForFunction(() => window.__roquecraft?.state?.ready === true, null, {
  timeout: 120000,
})

const medidas = []
for (const perfil of ['ultra', 'high', 'medium']) {
  await page.evaluate((p) => window.__roquecraft.setQuality(p), perfil)
  await page.waitForTimeout(2600)
  const m = await page.evaluate(() => window.__roquecraft.inspect().shadow)
  medidas.push({ perfil, ...m })
}
console.log(JSON.stringify({ medidas, erros }, null, 2))
await ctx.close()
await b.close()
s.close()
// O veredito sai pelo código de saída: o ledger de sondas lê ISSO, não a prosa.
// Os três perfis respondem com números finitos; sem eles a sombra não está ligada.
const lidas = medidas.every(
  (m) => m && Number.isFinite(m.radius) && Number.isFinite(m.blocosPorTexel),
)
process.exit(lidas && erros.length === 0 ? 0 : 1)
