//
// A CÂMERA DENTRO DO TERRENO.
//
// Hipótese final, e a única que explica TUDO no print do founder ao mesmo
// tempo: fragmentos de grama/terra soltos, tufos sem apoio, polígonos PRETOS, e
// um plano liso embaixo. Com a câmera DENTRO da geometria, o culling de face
// frontal remove tudo que está entre o olho e o resto — sobra o avesso do
// mundo, em pedaços, com o interior dos blocos preto.
//
// Nada disso é defeito de malha (auditada: zero faces faltando, inclusive no
// WebKit) nem de geração (zero blocos desconectados, zero colunas com opaco
// entre o jogador e o céu). É o jogador ENTERRADO.
//
// O jogo tem maquinário contra isso — `desencalhar` na física e
// `resgatarDoSoterramento` no componente. Este harness enterra o jogador de
// propósito e mede se o resgate acontece.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { webkit, devices } from 'playwright'
import { shellDoApp } from './lib/servidor-do-dist.mjs'
const DIST = path.resolve('dist/pwa')
const OUT = path.resolve('scripts/.qa-mobile')
fs.mkdirSync(OUT, { recursive: true })
const T = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
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
const b = await webkit.launch()
const ctx = await b.newContext({
  ...devices['iPhone 13'],
  serviceWorkers: 'block',
  locale: 'pt-BR',
})
const page = await ctx.newPage()
await page.addInitScript(
  `window.__ROS_E2E__={auth:{uid:'e2e',email:'e@e.t',emailVerified:true,displayName:'E',role:'user'},googleDrive:{isConnected:false,files:[],user:{}},googleMapsApiKey:'',roquecraftSeed:942457}`,
)
await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => !!window.__rosStore, null, { timeout: 30000 })
await page.waitForTimeout(1500)
await page.evaluate(() => window.__rosStore.openWindow('roquecraft'))
await page.waitForFunction(() => window.__roquecraft?.state?.ready === true, null, {
  timeout: 90000,
})

const r = await page.evaluate(async () => {
  const rc = window.__roquecraft
  rc.setTime(2600)
  // acha terra firme alta o bastante pra enterrar 4 blocos
  let alvo = null
  for (let x = -100; x <= 100 && !alvo; x += 8)
    for (let z = -100; z <= 100; z += 8) {
      const h = rc.surfaceAt(x, z)
      if (Number.isFinite(h) && h > 70 && rc.profundidadeAgua(x, z) === 0) alvo = { x, z, h }
    }
  rc.teleport(alvo.x + 0.5, alvo.h + 2, alvo.z + 0.5)
  await rc.waitChunks(6)
  rc.setFlying(false)
  await new Promise((r) => setTimeout(r, 1200))
  const antes = { ...rc.state.player }
  // ENTERRA: 4 blocos abaixo da superfície
  rc.teleport(alvo.x + 0.5, alvo.h - 4, alvo.z + 0.5)
  rc.setFlying(false)
  rc.look(0.5, 0.7)
  await new Promise((r) => setTimeout(r, 300))
  const logoApos = {
    ...rc.state.player,
    solido: rc.solidoEm(alvo.x, Math.floor(alvo.h - 4), alvo.z),
  }
  return { alvo, antes, logoApos }
})
fs.writeFileSync(path.join(OUT, 'enterrado-t300.png'), await page.screenshot())
const depois = await page.evaluate(async () => {
  await new Promise((r) => setTimeout(r, 3000))
  const rc = window.__roquecraft
  return { pos: rc.state.player, aguardando: rc.debug?.groundBelow }
})
fs.writeFileSync(path.join(OUT, 'enterrado-t3300.png'), await page.screenshot())
console.log(JSON.stringify({ ...r, depois }, null, 2))
await b.close()
s.close()
// O veredito sai pelo código de saída: o ledger de sondas lê ISSO, não a prosa.
// Enterrado de propósito 4 abaixo da superfície: em 3,3 s o resgate tem que
// tê-lo posto DE VOLTA sobre o chão (pé na altura da superfície ou acima).
const resgatou = depois?.pos && depois.pos.y >= r.alvo.h
process.exit(resgatou ? 0 : 1)
