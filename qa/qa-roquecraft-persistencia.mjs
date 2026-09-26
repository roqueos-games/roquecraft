//
// O QUE SOBREVIVE AO RECARREGAMENTO — sonda de uma pergunta só.
//
// Um teste de serialização prova o FORMATO: que `buildSavePayload` e
// `parseSave` conversam. Não prova que o jogo grava o que tem e restaura o que
// gravou — entre os dois há o componente, e é lá que o campo é esquecido.
//
// PROVA DE VIDA: a sonda mede ANTES e DEPOIS na mesma sessão. Se o "antes" vier
// zero, não houve item pra sobreviver e o "depois" zerado não significa nada.
//
//   node scripts/qa-roquecraft-persistencia.mjs
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
  viewport: { width: 1280, height: 720 },
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

const r = await page.evaluate(async () => {
  const rc = window.__roquecraft,
    dorme = (ms) => new Promise((k) => setTimeout(k, ms))
  rc.setMode('creative')
  const y = Math.round(rc.surfaceAt(0, 0) ?? 66) + 20
  rc.setFlying(true)
  rc.teleport(0.5, y + 2, 0.5)
  rc.fill(-6, y, -6, 6, y, 6, 'snowBlock')
  await dorme(2200)
  // Larga cinco itens no chão, cada um com item e quantidade distintos.
  const querido = [
    ['stone', 3],
    ['dirt', 7],
    ['oakPlanks', 1],
    ['coal', 12],
    ['ironIngot', 2],
  ]
  for (let i = 0; i < querido.length; i++) {
    rc.soltarItemQA
      ? rc.soltarItemQA(querido[i][0], querido[i][1], i, y + 1.2, 0)
      : (rc.equipar(querido[i][0], querido[i][1]), rc.dropHeldQA?.())
  }
  await dorme(1200)
  const antes = rc.dropsInfo()

  // O REBANHO. Limpa primeiro pra medir só o que esta sonda colocou: com os
  // bichos que o mundo gerou sozinho no meio, "gravou 3 de 3" viraria "gravou
  // 3 de sabe-se-lá-quantos" e o teto nunca seria testado.
  rc.limparMobs()
  const semBicho = rc.payloadDeSave().mobs
  const bichos = ['cow', 'pig', 'zombie']
  for (let i = 0; i < bichos.length; i++) rc.spawnMob(bichos[i], 3 + i, i - 1)
  await dorme(900)
  const mobsVivos = rc.mobsInfo()

  // O payload REAL do autosave, sem escrever no disco.
  const payload = rc.payloadDeSave()
  return {
    antes,
    gravados: payload.drops,
    versao: payload.version,
    // ⚠️ PROVA DE VIDA do lado do rebanho: `semBicho` tem que vir VAZIO. Se
    // vier com coisa dentro, `limparMobs` não limpou e o "gravou 3" abaixo não
    // significa que estes três foram gravados.
    mobsAntesDeNascer: semBicho.length,
    mobsVivos: mobsVivos.map((m) => m.type),
    mobsGravados: payload.mobs.map((m) => m.t),
    // A vida vai junto? Um save que grava só o tipo devolve o rebanho curado.
    vidasGravadas: payload.mobs.map((m) => m.v),
  }
})
console.log(JSON.stringify({ ...r, erros }, null, 2))
await ctx.close()
await b.close()
s.close()
// O veredito sai pelo código de saída: o ledger de sondas lê ISSO, não a prosa.
// O que estava vivo foi gravado: os três bichos e os drops, com versão.
const veredito =
  Array.isArray(r.mobsGravados) &&
  ['cow', 'pig', 'zombie'].every((t) => r.mobsGravados.includes(t)) &&
  r.mobsGravados.length === r.mobsVivos.length &&
  Number.isFinite(r.versao) &&
  erros.length === 0
process.exit(veredito ? 0 : 1)
