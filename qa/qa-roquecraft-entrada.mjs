//
// ENTRAR NUM MAPA NOVO DEIXA A CENA QUEBRADA?
//
// "hoje uma coisa que eu estou fazendo para poder jogar quando abro um mapa
// novo é ter que entrar e depois que entrei coloco o grafico no minimo e depois
// volto para o ultra para reconstruir o cenario corretamente, porque se não eu
// entro em um mapa todo quebrado com um monte de blocos sem faces, coisas
// voando e etc" — founder, 25/08/2026.
//
// ⚠️ ESTA SONDA EXISTE PORQUE EU PASSEI TRÊS RODADAS MEDINDO A COISA ERRADA.
//
// A auditoria de malha contava BURACO — face que devia existir e não existe —
// e dava zero, sempre. Eu concluí "não há defeito de malha" e fiquei sem
// explicação para o relato. A frase acima trouxe a metade que faltava: "coisas
// voando". Isso não é buraco, é SOBRA — quad que continua desenhado depois de o
// bloco dele deixar de existir. Contador de buraco não enxerga sobra, porque
// não falta nada.
//
// O MÉTODO É O PROCEDIMENTO DO FOUNDER, e é isso que o torna honesto: ele já
// descobriu o controle sozinho. Trocar a qualidade força remalhar tudo, e ele
// usa isso como conserto. Então:
//
//   A. entra no mapa pelo caminho de verdade e mede
//   B. faz a gambiarra dele (ultra → low → ultra) e mede de novo
//
// A diferença entre A e B É o defeito, medida com o próprio remédio do usuário
// como referência. Se A e B derem igual, o defeito não está na malha e eu
// estaria de novo procurando no lugar errado.
//
//   node scripts/qa-roquecraft-entrada.mjs [semente]
//
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const DIST = path.resolve('dist/pwa')
const OUT = path.resolve('scripts/.qa-entrada')
const SEMENTE = Number(process.argv[2] || 771102)
fs.rmSync(OUT, { recursive: true, force: true })
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
const servidor = http.createServer((q, r) => {
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
await new Promise((r) => servidor.listen(0, r))
const base = `http://localhost:${servidor.address().port}`

const erros = []
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
page.on('pageerror', (e) => erros.push(String(e.message).slice(0, 160)))
page.on('console', (m) => {
  const t = m.text()
  if (/Shader|WebGL|INVALID|context lost/i.test(t)) erros.push(t.slice(0, 200))
})
await page.addInitScript(
  `window.__ROS_E2E__={auth:{uid:'e2e',email:'e@e.t',emailVerified:true,displayName:'E',role:'user'},googleDrive:{isConnected:false,files:[],user:{}},googleMapsApiKey:'',roquecraftSeed:${SEMENTE}}`,
)
await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => !!window.__rosStore, null, { timeout: 30000 })
await page.waitForTimeout(900)
await page.evaluate(() => window.__rosStore.openWindow('roquecraft'))
await page.waitForFunction(() => window.__roquecraft?.state?.ready === true, null, {
  timeout: 120000,
})
await page.evaluate(async () => {
  window.__roquecraft.setQuality('ultra')
  await new Promise((r) => setTimeout(r, 2600))
  window.__rosStore?.maximizeWindow?.('roquecraft')
  await new Promise((r) => setTimeout(r, 900))
})
await page.addStyleTag({
  content: '.ros-roquecraft__play,.ros-dock,.ros-menubar,.rc-hud{display:none !important}',
})
const canvas = await page.waitForSelector('.ros-roquecraft__canvas')
const foto = (nome) => canvas.screenshot({ path: path.join(OUT, nome) })

// ── A. ENTRAR NO MAPA PELO CAMINHO DE VERDADE ───────────────────────────────
//
// `entrarNoJogo()` é `startFromSave()`, a mesma porta do jogador: sai do menu e
// POUSA. Teleportar pro chão pularia justamente o trecho sob suspeita — o
// relato é sobre o estado da malha DEPOIS de entrar.
// ⚠️ MAPA NOVO, e não `entrarNoJogo`. A primeira versão usou `startFromSave` e
// não reproduziu nada — zero buraco, zero sobra. Era a porta errada: o founder
// disse "quando abro um mapa NOVO", e mapa novo passa por `startNewWorld`, que
// chama `world.reset(semente)` — troca o mundo inteiro embaixo de uma cena que
// já tem malha desenhada. É outro caminho de código, e é o caminho da queixa.
const entrada = await page.evaluate(async () => {
  const rc = window.__roquecraft
  rc.entrarNoJogo()
  await new Promise((k) => setTimeout(k, 4000))
  const antesDoNovo = { secoes: rc.state.sections, triangulos: rc.state.triangles }
  rc.openMenu()
  await new Promise((k) => setTimeout(k, 600))
  const troca = rc.menuNewWorld()
  await new Promise((k) => setTimeout(k, 1200))
  return { antesDoNovo, troca, menu: rc.menuOpen?.() ?? null }
})

// Espera o mundo assentar: a queixa não é sobre o carregamento em curso, é
// sobre o que sobra DEPOIS que ele termina.
await page.waitForTimeout(9000)
await page.evaluate(async () => {
  const rc = window.__roquecraft
  await rc.waitChunks(6, 40000)
})
await page.waitForTimeout(6000)

const auditar = (raio = 22) => page.evaluate((r) => window.__roquecraft.auditarMalha(r), raio)
const estado = () =>
  page.evaluate(() => {
    const s = window.__roquecraft.state
    return { secoes: s.sections, triangulos: s.triangles, chunks: s.chunks, qualidade: s.quality }
  })

await foto('1-recem-entrado.png')
const antes = await auditar()
const estadoAntes = await estado()

// ── B. A GAMBIARRA DO FOUNDER ───────────────────────────────────────────────
//
// Ultra → low → ultra. Não é um botão de QA: é literalmente o que ele faz com o
// mouse para conseguir jogar. Usar o remédio dele como referência é o que
// impede esta sonda de medir uma coisa e ele estar vendo outra.
await page.evaluate(async () => {
  const rc = window.__roquecraft
  rc.setQuality('low')
  await new Promise((k) => setTimeout(k, 4000))
  rc.setQuality('ultra')
  await new Promise((k) => setTimeout(k, 4000))
})
await page.evaluate(async () => {
  await window.__roquecraft.waitChunks(6, 40000)
})
await page.waitForTimeout(6000)

await foto('2-depois-da-gambiarra.png')
const depois = await auditar()
const estadoDepois = await estado()

const veredito = []
const d = (a, c) => +(c - a).toFixed(0)
veredito.push(
  `seções   ${estadoAntes.secoes} → ${estadoDepois.secoes}  (${d(estadoAntes.secoes, estadoDepois.secoes)})`,
)
veredito.push(
  `triângulos ${estadoAntes.triangulos} → ${estadoDepois.triangulos}  (${d(estadoAntes.triangulos, estadoDepois.triangulos)})`,
)
veredito.push(`BURACOS  ${antes?.buracos} → ${depois?.buracos}`)
veredito.push(`SOBRAS   ${antes?.sobras} → ${depois?.sobras}`)
veredito.push(`quads no índice ${antes?.quads} → ${depois?.quads}`)

if (!antes || !depois) {
  veredito.push('⚠️ a auditoria não rodou — sem malha ou sem mundo')
} else if (antes.sobras === 0 && antes.buracos === 0) {
  // ⚠️ ISTO NÃO É "ESTÁ TUDO BEM". É a sonda dizendo que não reproduziu o que o
  // founder vê — e aí o próximo passo é mudar a sonda, não fechar o achado.
  veredito.push(
    'a sonda NÃO reproduziu o defeito nesta semente: zero buraco e zero sobra logo na entrada',
  )
} else {
  veredito.push(
    `★ REPRODUZIDO: ao entrar havia ${antes.buracos} buracos e ${antes.sobras} sobras; ` +
      `depois de remalhar, ${depois.buracos} e ${depois.sobras}`,
  )
}

const relatorio = {
  semente: SEMENTE,
  entrada,
  estadoAntes,
  estadoDepois,
  antes,
  depois,
  veredito,
  erros,
}
fs.writeFileSync(path.join(OUT, 'relatorio.json'), JSON.stringify(relatorio, null, 2))
console.log(JSON.stringify(relatorio, null, 2))

await b.close()
servidor.close()
// O veredito sai pelo código de saída: o ledger de sondas lê ISSO, não a prosa.
// A sonda existe para REPRODUZIR o defeito de entrada (buraco/sobra); não
// reproduzir é aviso, não vermelho. Vermelho é a auditoria não rodar, ou a
// remalha DEIXAR buraco, ou erro de página.
const reprovou = !antes || !depois || depois.buracos > 0 || depois.sobras > 0 || erros.length > 0
process.exit(reprovou ? 1 : 0)
