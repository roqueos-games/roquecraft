//
// O PÉ NO CHÃO — a sonda do print que o founder mandou.
//
// Em 25/08/2026 chegou uma foto de celular com um porco e uma galinha parados
// no ar, um palmo acima da camada de neve. `mobPousa.spec.js` prova a regra com
// os valores reais de `blocks.js`; esta sonda prova o JOGO, que é onde o
// `solidAt` de verdade responde.
//
// ⚠️ PROVA DE VIDA: mede o mesmo bicho sobre TRÊS chãos — neve (1/8), meia laje
// (1/2) e pedra (1/1). Se os três dessem a mesma altura, a medida não estaria
// vendo a espessura de nada.
//
//   node scripts/qa-roquecraft-pouso.mjs
//
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const DIST = path.resolve('dist/pwa')
const SAIDA = path.resolve('scripts/.qa-pouso')
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
fs.mkdirSync(SAIDA, { recursive: true })

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
  viewport: { width: 900, height: 820 },
  deviceScaleFactor: 1,
  serviceWorkers: 'block',
  locale: 'pt-BR',
})
const page = await ctx.newPage()
const erros = []
page.on('pageerror', (e) => erros.push(String(e.message).slice(0, 160)))
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
await page.addStyleTag({ content: '.ros-roquecraft__play{display:none !important}' })
const foto = (nome) => page.screenshot({ path: path.join(SAIDA, nome) })

const y = await page.evaluate(() => {
  const rc = window.__roquecraft
  rc.setMode('creative')
  const y = Math.round(rc.surfaceAt(0, 0) ?? 66) + 14
  rc.setFlying(true)
  rc.teleport(0.5, y + 3, 0.5)
  rc.fill(-14, y - 2, -14, 14, y, 14, 'stone')
  return y
})
await page.waitForTimeout(2600)

/** Põe o chão pedido, larga o bicho em cima e mede onde o pé parou. */
async function medir(bloco, tipo, alturaEsperada) {
  const r = await page.evaluate(
    ([y, bloco, _tipo]) => {
      const rc = window.__roquecraft
      rc.limparMobs()
      rc.setFlying(true)
      rc.teleport(0.5, y + 4, 0.5)
      rc.look(0, -0.2)
      // ⚠️ A PLACA É GRANDE (17×17) DE PROPÓSITO. Com 9×9 a galinha andava pra
      // fora dela em dois segundos e pousava na PEDRA — a medida comparava o pé
      // dela com o topo de um bloco em que ela não estava mais, e reportava
      // −0,125 como se fosse defeito do jogo.
      if (bloco) rc.fill(-8, y + 1, -8, 8, y + 1, 8, bloco)
      else rc.fill(-8, y + 1, -8, 8, y + 1, 8, 'air')
      return { topoDaPedra: y }
    },
    [y, bloco, tipo],
  )
  await page.waitForTimeout(900)
  await page.evaluate(
    ([tipo]) => {
      const rc = window.__roquecraft
      rc.spawnMob(tipo, 3, 0)
    },
    [tipo],
  )
  await page.waitForTimeout(1600)
  const m = await page.evaluate(() => window.__roquecraft.mobsInfo()[0] ?? null)
  const base = bloco ? y + 1 : y + 1
  return {
    chao: bloco || 'ar (pedra em baixo)',
    tipo,
    // A altura do topo do bloco em que o bicho deveria estar.
    topoEsperado: +(base + alturaEsperada).toFixed(3),
    peDoBicho: m ? +m.y.toFixed(3) : null,
    // ⚠️ É ESTE NÚMERO. Zero é o pé no chão; 0,875 era o porco da foto.
    flutuando: m ? +(m.y - (base + alturaEsperada)).toFixed(3) : null,
    // ⚠️ SE SAIU DA PLACA, A MEDIDA NÃO VALE. Vai no relatório pra ninguém
    // confundir "pousou no bloco errado" com "pousou errado".
    saiuDaPlaca: m ? Math.abs(m.x) > 7.5 || Math.abs(m.z) > 7.5 : null,
    ...r,
  }
}

const medidas = []
medidas.push(await medir('snowLayer', 'pig', 0.125))
medidas.push(await medir('snowLayer', 'chicken', 0.125))
medidas.push(await medir('stoneSlab', 'pig', 0.5))
medidas.push(await medir('stone', 'pig', 1))

// ── O ITEM CAÍDO, que tem a MESMA raiz ──────────────────────────────────────
//
// `stepDrops` também lia `solidAt` como sim-ou-não: sobre uma camada de neve o
// item parava quase UM BLOCO no ar. O defeito era irmão do rebanho voando e
// estava a dez linhas de distância dele.
await page.evaluate((y) => {
  const rc = window.__roquecraft
  rc.limparMobs()
  rc.fill(-8, y + 1, -8, 8, y + 1, 8, 'snowLayer')
  rc.setFlying(true)
  rc.teleport(0.5, y + 6, 0.5)
  rc.soltarItemQA('stone', 1, 2.5, y + 5, 0.5)
  rc.soltarItemQA('coal', 1, 3.5, y + 5, 0.5)
  return rc.dropsInfo().length
}, y)
await page.waitForTimeout(2200)
const itensPousados = await page.evaluate(
  (y) =>
    window.__roquecraft
      .dropsInfo()
      .map((d) => ({ item: d.item, y: d.y, flutuando: +(d.y - (y + 1 + 0.125)).toFixed(3) })),
  y,
)

// ── A DIVISA, que é a cena das duas fotos de 25/08 ──────────────────────────
//
// Metade neve fina (topo 1/8 acima da grama), metade grama cheia, e o bicho
// andando entre as duas. É onde um erro de meio bloco fica mais visível: dá pra
// comparar o pé dele com o vizinho ao lado.
//
// ⚠️ MEDE CONTRA O BLOCO QUE ESTÁ DEBAIXO DELE, lido da coluna — não contra um
// número escolhido por mim. Um bicho que anda da neve pra grama muda de
// referência, e comparar com a referência errada foi o que fez esta sonda
// acusar −0,125 numa galinha que estava certa.
const divisa = await page.evaluate((y) => {
  const rc = window.__roquecraft
  rc.limparMobs()
  rc.fill(-10, y + 1, -10, 10, y + 1, 10, 'air')
  rc.fill(-10, y, -10, 10, y, 10, 'grassBlock')
  rc.fill(-10, y + 1, -10, 0, y + 1, 10, 'snowLayer')
  rc.setFlying(false)
  rc.teleport(0.5, y + 2, 0.5)
  rc.look(0, -0.1)
  return true
}, y)
await page.waitForTimeout(1500)
await page.evaluate(() => {
  const rc = window.__roquecraft
  rc.spawnMob('chicken', 3, -1.2)
  rc.spawnMob('pig', 3.4, 1.2)
  rc.spawnMob('cow', 4.2, -2.4)
})
await page.waitForTimeout(2600)
const naDivisa = await page.evaluate((y) => {
  const rc = window.__roquecraft
  return rc.mobsInfo().map((m) => {
    // Topo REAL do bloco sob os pés, lido da coluna do mundo.
    const col = rc.colunaEm(m.x, m.z, y - 1, y + 2) || []
    const solido = col.find((c) => c.bloco !== 'air')
    const espessura = solido?.bloco === 'snowLayer' ? 0.125 : 1
    const topo = solido ? solido.y + espessura : null
    return {
      tipo: m.type,
      blocoSobOPe: solido?.bloco ?? 'nada',
      topoDoBloco: topo,
      pe: m.y,
      flutuando: topo == null ? null : +(m.y - topo).toFixed(3),
    }
  })
}, y)
await page.waitForTimeout(200)
await foto('2-divisa.png')

// Foto do caso do print: porco em cima da neve, câmera na altura do olho.
await page.evaluate((y) => {
  const rc = window.__roquecraft
  rc.limparMobs()
  rc.fill(-4, y + 1, -4, 4, y + 1, 4, 'snowLayer')
  rc.setFlying(false)
  rc.teleport(0.5, y + 2, 0.5)
  rc.look(0, -0.12)
  rc.spawnMob('pig', 3, -0.5)
  rc.spawnMob('chicken', 3.2, 0.9)
}, y)
await page.waitForTimeout(2600)
await foto('1-pe-na-neve.png')

console.log(JSON.stringify({ medidas, itensPousados, naDivisa, divisa, erros }, null, 2))

await ctx.close()
await b.close()
s.close()
// O veredito sai pelo código de saída: o ledger de sondas lê ISSO, não a prosa.
// Pé no chão: bicho (na placa e na divisa) a menos de 4 cm do apoio. O ITEM
// descansa 10 cm acima do apoio POR DESENHO (`passoDosItens`: `apoio + 0.1`, é
// o "isto é pegável" que flutua e gira) — a régua dele é 10 ± 4 cm.
const FOLGA = 0.04
const REPOUSO_DO_ITEM = 0.1
const noChao = (lista, base = 0) =>
  (lista || []).every((m) => m && m.flutuando != null && Math.abs(m.flutuando - base) <= FOLGA)
process.exit(
  noChao(medidas) &&
    noChao(itensPousados, REPOUSO_DO_ITEM) &&
    noChao(naDivisa) &&
    erros.length === 0
    ? 0
    : 1,
)
