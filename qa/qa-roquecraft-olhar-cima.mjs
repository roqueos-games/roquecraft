//
// OLHAR PRA CIMA E AUDITAR A MALHA NO MESMO QUADRO.
//
// O print do founder, ampliado, mostra fragmentos de grama/terra soltos, tufos
// de grama sem apoio e polígonos PRETOS. Isso não é geração — a geração foi
// medida: zero blocos desconectados, e zero colunas com algo opaco entre o
// jogador e o céu, em 62.720 colunas.
//
// Então a pergunta é: naquele quadro, falta face na malha? O gancho
// `auditarMalha` responde isso comparando a CENA com as regras de culling. Aqui
// ele roda no motor do Safari, com viewport de iPhone, olhando pra cima — que é
// a combinação que nunca foi testada.
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
const SEMENTE = Number(process.argv[2] || 942457)

const b = await webkit.launch()
const ctx = await b.newContext({
  ...devices['iPhone 13'],
  serviceWorkers: 'block',
  locale: 'pt-BR',
})
const page = await ctx.newPage()
const erros = []
page.on('pageerror', (e) => erros.push(`PAGEERROR ${e.message.slice(0, 200)}`))
page.on('console', (m) => {
  const t = m.text()
  if (/Shader|WebGL|INVALID|context lost|out of memory/i.test(t)) erros.push(t.slice(0, 220))
})
await page.addInitScript(
  `window.__ROS_E2E__={auth:{uid:'e2e',email:'e@e.t',emailVerified:true,displayName:'E',role:'user'},googleDrive:{isConnected:false,files:[],user:{}},googleMapsApiKey:'',roquecraftSeed:${SEMENTE}}`,
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
  // procura uma floresta densa: muita árvore perto, chão baixo
  let alvo = null
  for (let x = -120; x <= 120 && !alvo; x += 8)
    for (let z = -120; z <= 120; z += 8) {
      const h = rc.surfaceAt(x, z)
      if (!Number.isFinite(h) || h < 64) continue
      // conta blocos opacos acima da superfície num raio pequeno = copa
      let copa = 0
      for (let dx = -3; dx <= 3; dx++)
        for (let dz = -3; dz <= 3; dz++)
          for (let y = h + 2; y < h + 12; y++) if (rc.solidoEm(x + dx, y, z + dz)) copa++
      if (copa > 25) alvo = { x, z, h, copa }
    }
  if (!alvo) {
    const h = rc.surfaceAt(0, 0)
    alvo = { x: 0, z: 0, h: Number.isFinite(h) ? h : 66, copa: 0 }
  }
  rc.teleport(alvo.x + 0.5, alvo.h + 1, alvo.z + 0.5)
  await rc.waitChunks(6)
  rc.setFlying(false)
  rc.land()
  rc.look(0.5, 0.75) // olhando bem pra cima
  await new Promise((r) => setTimeout(r, 3000))
  return {
    alvo,
    pos: rc.state.player,
    bioma: rc.state.biome,
    auditoria: rc.auditarMalha(26),
    state: { secoes: rc.state.sections, tri: rc.state.triangles },
  }
})
fs.writeFileSync(path.join(OUT, `olhando-cima-${SEMENTE}.png`), await page.screenshot())
console.log(
  JSON.stringify(
    {
      semente: SEMENTE,
      alvo: r.alvo,
      pos: r.pos,
      bioma: r.bioma,
      state: r.state,
      erros,
      auditoria: r.auditoria && {
        examinados: r.auditoria.examinados,
        buracos: r.auditoria.buracos,
        porDirecao: r.auditoria.porDirecao,
        porBloco: r.auditoria.porBloco,
        exemplos: r.auditoria.exemplos?.slice(0, 8),
      },
    },
    null,
    2,
  ),
)
await b.close()
s.close()
// O veredito sai pelo código de saída: o ledger de sondas lê ISSO, não a prosa.
// Olhando pra cima a malha auditada não pode ter face faltando.
process.exit((r.auditoria?.buracos ?? 1) === 0 ? 0 : 1)
