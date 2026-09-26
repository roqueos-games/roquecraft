//
// A MÃO, DE PERTO — laço rápido de render-e-olhar.
//
// A mão é a única coisa do jogo que está SEMPRE na tela, e foi a única que
// nenhuma sonda olhava: quase todas a desligavam (`setFx({hand:false})`) porque
// ela balançava e sujava a medição. O defeito sobreviveu a cinco rodadas de
// portão verde por causa disso.
//
// Este arquivo é o contrário de uma sonda de veredito: ele não afirma nada. Ele
// monta a tira de quatro quadros — mão vazia, com bloco, com ferramenta, e o
// retrato do celular — em cinquenta segundos, pra dar um laço de iteração
// rápido em cima de uma coisa que só o olho julga.
//
//   node scripts/qa-roquecraft-mao.mjs
//
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const { PNG } = createRequire(import.meta.url)('pngjs')

const DIST = path.resolve('dist/pwa')
const OUT = path.resolve('scripts/.qa-mao')
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
const erros = []
const fotos = []

async function cena({ largura, altura, movel, rotulo, prepara }) {
  const ctx = await b.newContext({
    viewport: { width: largura, height: altura },
    deviceScaleFactor: 1,
    isMobile: movel,
    hasTouch: movel,
    serviceWorkers: 'block',
    locale: 'pt-BR',
  })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => erros.push(`[${rotulo}] ${String(e.message).slice(0, 160)}`))
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
  await page.evaluate(async () => {
    window.__roquecraft.setQuality('ultra')
    await new Promise((r) => setTimeout(r, 2200))
    window.__rosStore?.maximizeWindow?.('roquecraft')
    await new Promise((r) => setTimeout(r, 800))
  })
  await page.addStyleTag({ content: '.ros-roquecraft__play { display: none !important }' })
  // Cenário LISO e claro: a mão contra terreno cheio de folha some no ruído, e
  // a pergunta aqui é a silhueta dela.
  await page.evaluate(async () => {
    const rc = window.__roquecraft
    const y = Math.round(rc.surfaceAt(0, 0) ?? 66) + 20
    rc.setFlying(true)
    rc.teleport(0.5, y + 2, 0.5)
    rc.fill(-12, y, -12, 12, y, 12, 'snowBlock')
    rc.setTime(6000)
    rc.setFx({ hand: true, clouds: false })
    rc.look(0.4, -0.05)
    await new Promise((r) => setTimeout(r, 2500))
  })
  if (prepara) await page.evaluate(prepara)
  await page.waitForTimeout(1200)
  const arquivo = `${rotulo}.png`
  fs.writeFileSync(path.join(OUT, arquivo), await page.screenshot())
  fotos.push({ arquivo, largura, altura })
  await ctx.close()
}

await cena({ largura: 1280, altura: 720, movel: false, rotulo: '1-vazia' })
await cena({
  largura: 1280,
  altura: 720,
  movel: false,
  rotulo: '2-com-bloco',
  prepara: () => {
    const rc = window.__roquecraft
    rc.give('oakPlanks', 1)
    rc.selectSlot(rc.slotOf('oakPlanks'))
  },
})
await cena({
  largura: 1280,
  altura: 720,
  movel: false,
  rotulo: '3-com-picareta',
  prepara: () => {
    const rc = window.__roquecraft
    rc.give('iron_pickaxe', 1)
    rc.selectSlot(rc.slotOf('iron_pickaxe'))
  },
})
await cena({ largura: 430, altura: 932, movel: true, rotulo: '4-celular-retrato' })

// ── Tira de contato + quanto de tela a mão ocupa ─────────────────────────
//
// A área é o número que faltava: "a mão parece grande demais" vira uma fração
// que dá pra comparar entre tentativas.
function areaDaMao(arquivo) {
  const p = PNG.sync.read(fs.readFileSync(path.join(OUT, arquivo)))
  let pele = 0
  let manga = 0
  for (let i = 0; i < p.data.length; i += 4) {
    const r = p.data[i]
    const g = p.data[i + 1]
    const bl = p.data[i + 2]
    // Pele: bege quente. Manga: azul do original.
    if (r > 150 && g > 110 && g < r - 15 && bl < g) pele++
    else if (bl > 90 && bl > r + 30 && bl > g + 20) manga++
  }
  const total = p.width * p.height
  return {
    pele: +((100 * pele) / total).toFixed(2),
    manga: +((100 * manga) / total).toFixed(2),
    braco: +((100 * (pele + manga)) / total).toFixed(2),
  }
}
const medidas = fotos.map((f) => ({ ...f, ...areaDaMao(f.arquivo) }))

const CEL_W = 520
const CEL_H = 340
const tira = new PNG({ width: CEL_W * fotos.length, height: CEL_H })
tira.data = Buffer.alloc(tira.width * tira.height * 4, 20)
fotos.forEach((f, i) => {
  const src = PNG.sync.read(fs.readFileSync(path.join(OUT, f.arquivo)))
  const escala = Math.min(CEL_W / src.width, CEL_H / src.height)
  const w = Math.round(src.width * escala)
  const h = Math.round(src.height * escala)
  const ox = i * CEL_W + Math.round((CEL_W - w) / 2)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.min(src.width - 1, Math.round(x / escala))
      const sy = Math.min(src.height - 1, Math.round(y / escala))
      const si = (src.width * sy + sx) << 2
      const di = (tira.width * y + ox + x) << 2
      tira.data[di] = src.data[si]
      tira.data[di + 1] = src.data[si + 1]
      tira.data[di + 2] = src.data[si + 2]
      tira.data[di + 3] = 255
    }
  }
})
fs.writeFileSync(path.join(OUT, 'tira.png'), PNG.sync.write(tira))

console.log(
  JSON.stringify({ saida: OUT, tira: path.join(OUT, 'tira.png'), medidas, erros }, null, 2),
)
await b.close()
s.close()
