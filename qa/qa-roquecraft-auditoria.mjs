//
// AUDITORIA DE MALHA NO JOGO DE VERDADE — com worker, andando, por direção.
//
// Relato do founder (2026-08-22): "você validou a construção dos blocos indo
// pra frente, mas para os lados e para trás os blocos estão com faces vazias e
// sem textura e colisão, dando para entrar dentro nas montanhas".
//
// O que já foi descartado, com prova:
//   · o mesher emite as 6 faces de todo bloco do catálogo, com winding CCW
//     (`mesherFaces.spec.js`)
//   · um mundo inteiro gerado — parado E com o jogador andando nas quatro
//     direções — não perde uma face sequer (`mesherBuracos.spec.js`)
//   · bloco isolado no ar aparece inteiro de 8 azimutes × 3 elevações
//     (`qa-roquecraft-faces.mjs`)
//
// O que NENHUM desses cobre: o jogo real roda o pipeline num WEB WORKER. Chunk
// chega fora de ordem, descarrega atrás do jogador e volta quando ele retorna.
// Se existe buraco, é aí. Este harness pergunta à CENA — não ao pipeline —
// depois de cada trecho caminhado, e agrupa o que falta POR DIREÇÃO, que é o
// eixo do relato.
//
// Uso: node scripts/qa-roquecraft-auditoria.mjs [tag]   (exige dist/pwa)
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const DIST = path.resolve('dist/pwa')
const TAG = process.argv[2] || 'auditoria'
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
  if (/Shader Error|not compiled|INVALID_OPERATION/i.test(t))
    errors.push(`SHADER ${t.slice(0, 300)}`)
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

const usandoWorker = await page.evaluate(() => window.__roquecraft.state.usingWorker)

// Coordenada do print do founder MAIS os maiores maciços da semente. A
// primeira rodada auditou a praia dele e examinou 24 mil blocos; num litoral
// quase tudo é água e areia rasa, e "entrar dentro da montanha" não se testa
// onde não há montanha. Então o harness procura os picos.
const CASA = { x: -98, z: 82 }

// ── ACHAR OS MACIÇOS DA SEMENTE ───────────────────────────────────────────
const picos = await page.evaluate(async () => {
  const rc = window.__roquecraft
  rc.setTime(6000)
  rc.teleport(0, 130, 0)
  await rc.waitChunks(6)
  const achados = []
  for (let x = -160; x <= 160; x += 16)
    for (let z = -160; z <= 160; z += 16) {
      const h = rc.surfaceAt(x, z)
      if (!Number.isFinite(h)) continue
      const viz = [
        rc.surfaceAt(x + 10, z),
        rc.surfaceAt(x - 10, z),
        rc.surfaceAt(x, z + 10),
        rc.surfaceAt(x, z - 10),
      ].filter(Number.isFinite)
      if (viz.length < 4) continue
      const desnivel = viz.reduce((a, v) => a + Math.abs(h - v), 0)
      achados.push({ x, z, h, desnivel })
    }
  achados.sort((a, b) => b.desnivel - a.desnivel)
  return achados.slice(0, 4)
})
console.error('picos:', JSON.stringify(picos))

const passos = []
const anotar = async (etapa) => {
  const r = await page.evaluate(() => window.__roquecraft.auditarMalha(28))
  passos.push({ etapa, ...r })
  return r
}

await page.evaluate(
  async ({ CASA }) => {
    const rc = window.__roquecraft
    rc.setTime(6000)
    const solo = rc.surfaceAt(CASA.x, CASA.z)
    rc.teleport(CASA.x + 0.5, (Number.isFinite(solo) ? solo : 70) + 2, CASA.z + 0.5)
    await rc.waitChunks(6)
    rc.land()
    await new Promise((r) => setTimeout(r, 1500))
  },
  { CASA },
)
await anotar('chegada')

// ── ANDAR DE VERDADE NAS QUATRO DIREÇÕES, AUDITANDO DEPOIS DE CADA TRECHO ──
// Cada trecho é longo o bastante pra cruzar divisa de chunk várias vezes e pra
// fazer o carregador descarregar o que ficou pra trás.
const TRECHOS = [
  { nome: 'norte', yaw: 0 },
  { nome: 'leste', yaw: Math.PI / 2 },
  { nome: 'sul', yaw: Math.PI },
  { nome: 'oeste', yaw: -Math.PI / 2 },
  { nome: 'volta-norte', yaw: 0 },
]

for (const t of TRECHOS) {
  await page.evaluate(
    async ({ t }) => {
      const rc = window.__roquecraft
      rc.setFlying(false)
      rc.look(t.yaw, -0.1)
      rc.press('forward', true)
      rc.press('sprint', true)
      await new Promise((r) => setTimeout(r, 6000))
      rc.press('forward', false)
      rc.press('sprint', false)
      await new Promise((r) => setTimeout(r, 2000))
    },
    { t },
  )
  const r = await anotar(t.nome)
  fs.writeFileSync(path.join(OUT, `aud-${t.nome}.png`), await page.screenshot())
  console.error(`  ${t.nome}: buracos=${r?.buracos} em ${r?.examinados} blocos`)
}

// ── AUDITAR EM CIMA DE CADA MACIÇO ────────────────────────────────────────
// É aqui que a queixa dele vive: "dando para entrar dentro nas montanhas".
for (const [i, pico] of picos.entries()) {
  await page.evaluate(
    async ({ pico }) => {
      const rc = window.__roquecraft
      rc.teleport(pico.x + 0.5, pico.h + 2, pico.z + 0.5)
      await rc.waitChunks(6)
      rc.land()
      await new Promise((r) => setTimeout(r, 1800))
    },
    { pico },
  )
  const r = await anotar(`pico-${i}(${pico.x},${pico.z},h=${pico.h})`)
  fs.writeFileSync(path.join(OUT, `aud-pico-${i}.png`), await page.screenshot())
  console.error(`  pico-${i}: buracos=${r?.buracos} em ${r?.examinados} blocos`)
}

const saida = {
  tag: TAG,
  picos,
  usandoWorker,
  erros: errors,
  passos,
  veredito: passos.every((p) => p && p.buracos === 0) ? 'SEM BURACO' : 'BURACO ENCONTRADO',
}
fs.writeFileSync(path.join(OUT, `report-${TAG}.json`), JSON.stringify(saida, null, 2))
console.log(
  JSON.stringify(
    {
      usandoWorker,
      erros: errors.length,
      veredito: saida.veredito,
      passos: passos.map((p) => ({
        etapa: p.etapa,
        pos: p.pos,
        examinados: p.examinados,
        quads: p.quads,
        buracos: p.buracos,
        porDirecao: p.porDirecao,
        exemplos: p.exemplos?.slice(0, 6),
      })),
    },
    null,
    2,
  ),
)
await browser.close()
server.close()
// O veredito sai pelo código de saída: o ledger de sondas lê ISSO, não a prosa.
process.exit(saida.veredito === 'SEM BURACO' && errors.length === 0 ? 0 : 1)
