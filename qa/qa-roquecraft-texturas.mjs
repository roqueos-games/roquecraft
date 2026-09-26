// QA DE ORIENTAÇÃO DE TEXTURA — RoqueCraft.
//
// Existe por causa de um relato do founder em 2026-08-22: "as gramas estão de
// ponta cabeça". Fotografar a floresta natural não PROVA nada — o mato é
// irregular e o olho aceita quase qualquer coisa. Então este harness monta uma
// CENA CONTROLADA, esconde a HUD (ela não é o assunto) e mede o pixel:
//
//   · MATO ALTO isolado contra o céu: recorta a coluna da moita e compara a
//     massa de folha da metade de cima com a de baixo. Mato afina pra cima —
//     se a metade de cima pesar MAIS, a textura está invertida.
//   · LATERAL DO BLOCO DE GRAMA contra o céu: a franja verde mora nas primeiras
//     linhas da imagem e tem que aparecer no TOPO do cubo. Mede a altura média
//     dos pixels verdes dentro do recorte da parede de terra.
//
// As duas medidas atacam o MESMO defeito por caminhos independentes (uma no
// recorte da planta, outra na face sólida). Se só uma acusasse, seria bug de
// geometria da cruz; as duas juntas acusam a folha de textura inteira.
//
// Uso: node scripts/qa-roquecraft-texturas.mjs [tag]  (exige dist/pwa construído)
// Saída: scripts/.qa-texturas/*.png + report.json (gitignored)
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { medir } from './lib/qa-orientacao.mjs'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const DIST = path.resolve('dist/pwa')
const TAG = process.argv[2] || 'depois'
const OUT = path.resolve('scripts/.qa-texturas')
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

// A HUD, o "clique pra jogar" e a mão em primeiro plano não são o assunto do
// print e ainda por cima entram VERDES no recorte. Escondê-los é o que torna a
// medição honesta — o que sobra na tela é só o mundo.
const SEM_HUD = `
  .ros-roquecraft__play, .rc-hud, .ros-roquecraft__vignette, .ros-roquecraft__hurt { display: none !important; }
`

await new Promise((r) => server.listen(0, r))
const base = `http://localhost:${server.address().port}`
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
  serviceWorkers: 'block',
  locale: 'pt-BR',
})
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`))
page.on('console', (m) => {
  const t = m.text()
  if (/Shader Error|not compiled|INVALID_OPERATION: useProgram/i.test(t))
    errors.push(`SHADER ${t.slice(0, 500)}`)
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

// ── cena controlada ────────────────────────────────────────────────────────
// Tudo isto acontece no ALTO, longe do terreno, pra que o que aparece no recorte
// seja céu ou o objeto medido. Fotografar contra a paisagem obrigaria a separar
// "verde do mato" de "verde do morro atrás", e essa separação é exatamente o
// tipo de heurística que faz um QA mentir.
//
// Uma FILEIRA DE PILARES, não uma plataforma: o pilar tem um bloco de largura,
// então atrás do mato que cresce nele só existe céu. Foi a segunda tentativa —
// a plataforma larga punha o próprio gramado do topo dentro do recorte, e aí
// "verde acima da linha média" deixava de significar qualquer coisa.
const X = 8,
  Y = 104,
  Z = 8
const cena = await page.evaluate(
  async ({ X, Y, Z }) => {
    const rc = window.__roquecraft
    rc.setTime(6000)
    rc.teleport(X, Y, Z)
    await rc.waitChunks(2)
    rc.fill(X - 10, Y - 6, Z - 10, X + 14, Y + 14, Z + 14, 'air')
    for (let dz = -3; dz <= 3; dz++) {
      rc.fill(X, Y, Z + dz, X, Y + 2, Z + dz, 'dirt')
      rc.fill(X, Y + 3, Z + dz, X, Y + 3, Z + dz, 'grassBlock')
      if (dz % 2 === 0) rc.fill(X, Y + 4, Z + dz, X, Y + 4, Z + dz, 'tallGrass')
    }
    rc.fill(X, Y + 4, Z - 1, X, Y + 4, Z - 1, 'redFlower')
    rc.fill(X, Y + 4, Z + 1, X, Y + 4, Z + 1, 'yellowFlower')
    // Olho na altura do PÉ do mato, mirando na horizontal: o mato ocupa a metade
    // de cima do quadro contra o céu, e a parede de terra a de baixo.
    //
    // `teleport` põe os PÉS na altura pedida — a câmera fica EYE_HEIGHT (1.62)
    // acima. Pedir Y+4 direto deixava o olho um metro e meio acima do mato e o
    // recorte fixo pegava só céu ("SEM DADO" em todas as rodadas).
    rc.teleport(X - 5, Y + 4 - 1.62, Z)
    rc.look(Math.PI / 2, 0)
    await new Promise((r) => setTimeout(r, 1800))
    return { ...rc.state.player, biome: rc.state.biome, secoes: rc.state.sections }
  },
  { X, Y, Z },
)
await page.waitForTimeout(1200)

const arquivo = path.join(OUT, `cena-${TAG}.png`)
await page.locator('canvas').first().screenshot({ path: arquivo })

// MOSTRUÁRIO: uma parede de blocos variados a dois passos da câmera. É o único
// print em que dá pra julgar a ARTE — de longe a névoa e a luz do dia decidem
// mais que a textura, e foi olhando paisagem que a folha passou meses invertida.
await page.evaluate(
  async ({ X, Y, Z }) => {
    const rc = window.__roquecraft
    const grade = [
      ['grassBlock', 'dirt', 'stone', 'cobblestone', 'sand', 'gravel'],
      ['oakLog', 'birchLog', 'oakLeaves', 'oakPlanks', 'bricks', 'mossyCobblestone'],
      ['coalOre', 'ironOre', 'goldOre', 'diamondOre', 'redstoneOre', 'deepslate'],
      ['snowBlock', 'ice', 'clay', 'sandstone', 'obsidian', 'bookshelf'],
    ]
    rc.teleport(X + 40, Y, Z + 40)
    await rc.waitChunks(2)
    const bx = X + 40
    const by = Y
    const bz = Z + 40
    rc.fill(bx - 4, by - 4, bz - 4, bx + 10, by + 10, bz + 10, 'air')
    for (let l = 0; l < grade.length; l++)
      for (let col = 0; col < grade[l].length; col++)
        rc.fill(
          bx,
          by + (grade.length - 1 - l),
          bz + col,
          bx,
          by + (grade.length - 1 - l),
          bz + col,
          grade[l][col],
        )
    rc.setTime(6000)
    rc.teleport(bx - 5.2, by + 2 - 1.62, bz + 2.5)
    rc.look(Math.PI / 2, -0.02)
    await new Promise((r) => setTimeout(r, 1600))
  },
  { X, Y, Z },
)
await page.waitForTimeout(1000)
await page
  .locator('canvas')
  .first()
  .screenshot({ path: path.join(OUT, `mostruario-${TAG}.png`) })

// Print de paisagem, sem medição: é a floresta nas coordenadas do print que o
// founder mandou. Serve pra comparar a olho o que a régua não alcança.
await page.evaluate(async () => {
  const rc = window.__roquecraft
  rc.setTime(2200)
  rc.teleport(-26, 74, -43)
  await rc.waitChunks(4)
  rc.look(2.2, -0.12)
  await new Promise((r) => setTimeout(r, 2500))
})
await page.waitForTimeout(1500)
await page
  .locator('canvas')
  .first()
  .screenshot({ path: path.join(OUT, `floresta-${TAG}.png`) })

const medida = medir(arquivo)
const report = { tag: TAG, cena, ...medida, errors }
fs.writeFileSync(path.join(OUT, `report-${TAG}.json`), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))

await ctx.close()
await browser.close()
server.close()
process.exit(Object.values(medida.veredito).includes('INVERTIDO') ? 1 : 0)
