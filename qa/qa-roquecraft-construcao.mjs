//
// CONSTRUIR E QUEBRAR NAS SEIS DIREÇÕES, E AUDITAR DEPOIS DE CADA UMA.
//
// Leitura literal do relato do founder (2026-08-22): "você validou a construção
// dos blocos indo pra frente, mas para os lados e para trás os blocos estão com
// faces vazias e sem textura e colisão, dando para entrar dentro nas montanhas".
//
// "Construção dos blocos" pode ser o mesher montando o mundo — e essa leitura
// já foi esgotada: `mesherFaces`, `mesherBuracos` e `qa-roquecraft-auditoria`
// varreram 187 mil blocos opacos em quatro maciços, no jogo real com worker,
// sem achar UMA face faltando. Sobra a leitura literal: ele estava CONSTRUINDO,
// com o mouse, e a malha não acompanhou de alguns lados.
//
// O suspeito tem nome. `markDirty` suja a seção do bloco editado e as vizinhas
// quando ele cai na borda do chunk — e a lista de bordas é escrita à mão, uma
// linha por caso (lx===0, lx===15, lz===0, lz===15, e as quatro diagonais). Uma
// linha faltando ali some com a atualização de UM lado só, que é exatamente a
// assimetria que ele descreve.
//
// Aqui o harness constrói uma parede e ESCAVA um túnel em cada uma das quatro
// direções cardeais, atravessando divisa de chunk de propósito, e pergunta à
// cena depois de cada uma.
//
// Uso: node scripts/qa-roquecraft-construcao.mjs [tag]   (exige dist/pwa)
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const DIST = path.resolve('dist/pwa')
const TAG = process.argv[2] || 'construcao'
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
await page.addInitScript(SEED)
await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => !!window.__rosStore, null, { timeout: 30000 })
await page.waitForTimeout(1200)
await page.evaluate(() => window.__rosStore.openWindow('roquecraft'))
await page.waitForFunction(() => window.__roquecraft?.state?.ready === true, null, {
  timeout: 90000,
})
await page.addStyleTag({ content: SEM_HUD })

// Base escolhida EM CIMA de uma divisa de chunk: x=-1..0 e z=-1..0 são quatro
// chunks diferentes. É o pior caso pro `markDirty`.
const BASE = { x: 0, z: 0 }
const passos = []
const anotar = async (etapa) => {
  const r = await page.evaluate(() => window.__roquecraft.auditarMalha(26))
  passos.push({ etapa, ...r })
  return r
}

const alt = await page.evaluate(
  async ({ BASE }) => {
    const rc = window.__roquecraft
    rc.setTime(6000)
    const h = rc.surfaceAt(BASE.x, BASE.z)
    rc.teleport(BASE.x + 0.5, (Number.isFinite(h) ? h : 70) + 3, BASE.z + 0.5)
    await rc.waitChunks(6)
    await new Promise((r) => setTimeout(r, 1500))
    return rc.surfaceAt(BASE.x, BASE.z)
  },
  { BASE },
)

const DIRS = [
  { nome: '+x', dx: 1, dz: 0 },
  { nome: '-x', dx: -1, dz: 0 },
  { nome: '+z', dx: 0, dz: 1 },
  { nome: '-z', dx: 0, dz: -1 },
]

// 1. CONSTRUIR: uma parede de 24 blocos em cada direção, 3 de altura. Atravessa
//    duas divisas de chunk em cada sentido.
for (const d of DIRS) {
  await page.evaluate(
    async ({ d, BASE, alt }) => {
      const rc = window.__roquecraft
      const x1 = BASE.x + d.dx * 24
      const z1 = BASE.z + d.dz * 24
      rc.fill(BASE.x, alt + 1, BASE.z, x1, alt + 3, z1, 'stone')
      await new Promise((r) => setTimeout(r, 1600))
    },
    { d, BASE, alt },
  )
  const r = await anotar(`construiu ${d.nome}`)
  console.error(`  construiu ${d.nome}: buracos=${r?.buracos}`)
}
fs.writeFileSync(path.join(OUT, 'con-parede.png'), await page.screenshot())

// 2. ESCAVAR: abre um túnel de ar DENTRO da parede em cada direção. Quebrar é o
//    caso que revela face nova — é aqui que um `markDirty` incompleto aparece.
for (const d of DIRS) {
  await page.evaluate(
    async ({ d, BASE, alt }) => {
      const rc = window.__roquecraft
      const x1 = BASE.x + d.dx * 24
      const z1 = BASE.z + d.dz * 24
      rc.fill(BASE.x, alt + 2, BASE.z, x1, alt + 2, z1, 'air')
      await new Promise((r) => setTimeout(r, 1600))
    },
    { d, BASE, alt },
  )
  const r = await anotar(`escavou ${d.nome}`)
  console.error(`  escavou ${d.nome}: buracos=${r?.buracos}`)
}
fs.writeFileSync(path.join(OUT, 'con-tunel.png'), await page.screenshot())

// 3. ESCAVAR NA MONTANHA: o caso que ele nomeou. Abre uma galeria horizontal
//    dentro do maciço em cada direção e audita.
const pico = await page.evaluate(async () => {
  const rc = window.__roquecraft
  let melhor = null
  for (let x = -120; x <= 120; x += 16)
    for (let z = -120; z <= 120; z += 16) {
      const h = rc.surfaceAt(x, z)
      if (!Number.isFinite(h) || h < 75) continue
      if (!melhor || h > melhor.h) melhor = { x, z, h }
    }
  if (!melhor) return null
  rc.teleport(melhor.x + 0.5, melhor.h + 2, melhor.z + 0.5)
  await rc.waitChunks(6)
  await new Promise((r) => setTimeout(r, 1500))
  return melhor
})
if (pico) {
  for (const d of DIRS) {
    await page.evaluate(
      async ({ d, pico }) => {
        const rc = window.__roquecraft
        // galeria 20 blocos pra dentro do maciço, 6 abaixo do cume
        const y = pico.h - 6
        rc.fill(pico.x, y, pico.z, pico.x + d.dx * 20, y + 2, pico.z + d.dz * 20, 'air')
        await new Promise((r) => setTimeout(r, 1600))
      },
      { d, pico },
    )
    const r = await anotar(`galeria ${d.nome} no pico`)
    console.error(`  galeria ${d.nome}: buracos=${r?.buracos}`)
  }
  fs.writeFileSync(path.join(OUT, 'con-galeria.png'), await page.screenshot())
}

const saida = {
  tag: TAG,
  pico,
  alt,
  erros: errors,
  passos,
  veredito: passos.every((p) => p && p.buracos === 0) ? 'SEM BURACO' : 'BURACO ENCONTRADO',
}
fs.writeFileSync(path.join(OUT, `report-${TAG}.json`), JSON.stringify(saida, null, 2))
console.log(
  JSON.stringify(
    {
      erros: errors.length,
      veredito: saida.veredito,
      pico,
      passos: passos.map((p) => ({
        etapa: p.etapa,
        examinados: p.examinados,
        buracos: p.buracos,
        porDirecao: p.porDirecao,
        exemplos: p.exemplos?.slice(0, 8),
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
