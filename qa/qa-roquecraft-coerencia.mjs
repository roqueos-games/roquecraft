// COERÊNCIA ENTRE O QUE SE VÊ E O QUE SE TOCA — RoqueCraft.
//
// Relato do founder em 2026-08-22: "para os lados e para trás os blocos estão
// com faces vazias e sem textura e colisão, dando para entrar dentro nas
// montanhas".
//
// Andar contra a montanha não serve de teste: subir uma encosta suave e
// atravessá-la produzem a mesma leitura de "andou 25 blocos". O que separa os
// dois é se a COLISÃO concorda com a GEOMETRIA — e isso dá pra perguntar
// diretamente, coluna por coluna, sem depender de enquadramento nem de pixel.
//
// Três invariantes por coluna, e o relatório separa o resultado por QUADRANTE
// em relação ao jogador. Se o defeito depende da direção, é aqui que aparece.
//
//   1. o bloco logo abaixo da superfície é sólido
//   2. o bloco logo acima da superfície não é
//   3. a coluna está carregada (senão as duas perguntas acima não valem)
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const DIST = path.resolve('dist/pwa')
const TAG = process.argv[2] || 'coer'
const OUT = path.resolve('scripts/.qa-colisao')
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

await new Promise((r) => server.listen(0, r))
const base = `http://localhost:${server.address().port}`
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const ctx = await browser.newContext({
  viewport: { width: 1024, height: 640 },
  serviceWorkers: 'block',
  locale: 'pt-BR',
})
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`))
await page.addInitScript(SEED)
await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => !!window.__rosStore, null, { timeout: 30000 })
await page.waitForTimeout(1200)
await page.evaluate(() => window.__rosStore.openWindow('roquecraft'))
await page.waitForFunction(() => window.__roquecraft?.state?.ready === true, null, {
  timeout: 90000,
})

async function varrer(px, pz, raio) {
  return page.evaluate(
    async ({ px, pz, raio }) => {
      const rc = window.__roquecraft
      rc.teleport(px, 100, pz)
      await rc.waitChunks(Math.min(6, Math.ceil(raio / 16)))
      await new Promise((r) => setTimeout(r, 1500))
      const quad = {}
      const nomes = ['NO', 'NE', 'SO', 'SE']
      for (const n of nomes) quad[n] = { colunas: 0, semChunk: 0, ocoAbaixo: 0, solidoAcima: 0 }
      const exemplos = []
      for (let dx = -raio; dx <= raio; dx += 2) {
        for (let dz = -raio; dz <= raio; dz += 2) {
          const x = Math.floor(px + dx)
          const z = Math.floor(pz + dz)
          const n = (dz < 0 ? 'N' : 'S') + (dx < 0 ? 'O' : 'E')
          const q = quad[n]
          if (!rc.carregado(x, z)) {
            q.semChunk++
            continue
          }
          const h = rc.surfaceAt(x, z)
          if (!Number.isFinite(h) || h < 1) continue
          q.colunas++
          // 1. o bloco logo abaixo da superfície tem que ser sólido
          if (!rc.solidoEm(x, h - 1, z)) {
            q.ocoAbaixo++
            if (exemplos.length < 12) exemplos.push({ tipo: 'ocoAbaixo', x, y: h - 1, z, h })
          }
          // 2. o bloco logo acima não pode ser
          if (rc.solidoEm(x, h + 1, z)) {
            q.solidoAcima++
            if (exemplos.length < 12) exemplos.push({ tipo: 'solidoAcima', x, y: h + 1, z, h })
          }
        }
      }
      return { quad, exemplos, jogador: { ...rc.state.player } }
    },
    { px, pz, raio },
  )
}

// Três pontos: a origem, o litoral do relato anterior, e as coordenadas do
// print mais recente do founder. Se o defeito for de vizinhança de chunk, ele
// aparece em qualquer um.
const pontos = [
  { nome: 'origem', x: 0, z: 0 },
  { nome: 'litoral', x: -26, z: -43 },
  { nome: 'print-do-founder', x: -98, z: 82 },
]
const achados = []
for (const p of pontos) {
  const r = await varrer(p.x, p.z, 40)
  achados.push({ ...p, ...r })
}

const somar = (chave) =>
  achados.reduce((a, p) => a + Object.values(p.quad).reduce((b, q) => b + q[chave], 0), 0)
const veredito = {
  ocoAbaixo: somar('ocoAbaixo') === 0 ? 'OK' : `${somar('ocoAbaixo')} COLUNAS OCAS`,
  solidoAcima: somar('solidoAcima') === 0 ? 'OK' : `${somar('solidoAcima')} COLUNAS TAMPADAS`,
  console: errors.length ? `${errors.length} ERRO(S)` : 'OK',
}
const report = { tag: TAG, achados, veredito, errors: errors.slice(0, 5) }
fs.writeFileSync(path.join(OUT, `coerencia-${TAG}.json`), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))

await ctx.close()
await browser.close()
server.close()
process.exit(Object.values(veredito).every((v) => v === 'OK') ? 0 : 1)
