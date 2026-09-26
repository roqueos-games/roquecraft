//
// O ALÇAPÃO — e o defeito da tábua que virava portão.
//
// `alcapao.spec.js` prova o catálogo, a forma e o clique. Nada disso prova que
// no jogo a tampa fechada SEGURA o jogador sobre o buraco e que, aberta, ele
// cai — que é a única razão de o alçapão existir. E a mesma tabela que liga o
// alçapão à colocação (`variante.js`) tinha um defeito desde 25/08: colocar
// TÁBUA DE CARVALHO escrevia um portão, e o portão nascia sempre na mesma
// orientação. Esta sonda mede os dois.
//
//   1. o clique coloca o alçapão FECHADO sobre um buraco de 3 de fundo;
//   2. andar por cima NÃO cai (y fica na plataforma);
//   3. o clique levanta a tampa; andar por cima CAI no buraco;
//   4. tábua colocada continua tábua; portão colocado olhando pra +X e pra −Z
//      dá duas orientações diferentes.
//
// ⚠️ PROVA DE VIDA: 2 e 3 são a MESMA caminhada; se os dois y coincidirem, a
// sonda não mediu o alçapão.
//
//   node scripts/qa-roquecraft-alcapao.mjs
//
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { servirDist } from './lib/servidor-do-dist.mjs'

const SAIDA = path.resolve('scripts/.qa-alcapao')
fs.mkdirSync(SAIDA, { recursive: true })
const { base, fechar } = await servirDist('dist/pwa')
const b = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const ctx = await b.newContext({
  viewport: { width: 1280, height: 800 },
  serviceWorkers: 'block',
  locale: 'pt-BR',
})
const page = await ctx.newPage()
const erros = []
page.on('pageerror', (e) => erros.push(String(e.message).slice(0, 200)))
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
await page.evaluate(() => window.__rosStore?.maximizeWindow?.('roquecraft'))
await page.addStyleTag({ content: '.ros-roquecraft__play{display:none !important}' })
const foto = (nome) => page.screenshot({ path: path.join(SAIDA, nome) })

const v = []
let bom = true
const ok = (c, m) => {
  v.push(`${c ? '✅' : '❌'} ${m}`)
  if (!c) bom = false
  return c
}

// Platô de pedra 14 acima do terreno, com um buraco de 3 de fundo em (0, ., 0).
const y = await page.evaluate(() => {
  const rc = window.__roquecraft
  rc.setMode('creative')
  const y = Math.round(rc.surfaceAt(0, 0) ?? 66) + 14
  rc.setFlying(true)
  rc.teleport(0.5, y + 3, 0.5)
  rc.fill(-10, y - 4, -10, 10, y, 10, 'stone')
  rc.fill(0, y - 2, 0, 0, y, 0, 'air')
  return y
})
await page.waitForTimeout(2200)

const olharDe = (ox, oz, tx, ty, tz) =>
  page.evaluate(
    ([ox, oz, tx, ty, tz, y]) => {
      const rc = window.__roquecraft
      rc.setFlying(true)
      rc.teleport(ox, y + 1, oz)
      rc.setFlying(false)
      const olhoY = y + 1 + 1.62
      const dist = Math.hypot(tx - ox, tz - oz)
      rc.look(Math.atan2(tx - ox, -(tz - oz)), -Math.atan2(olhoY - ty, dist))
    },
    [ox, oz, tx, ty, tz, y],
  )
const chaveEm = (x, yy, z) =>
  page.evaluate(([x, yy, z]) => window.__roquecraft.blockKeyAt(x, yy, z), [x, yy, z])

// ── 1. COLOCA FECHADO SOBRE O BURACO ────────────────────────────────────────
// Mira a face de cima do bloco (0, y-3, 0), no fundo do buraco? Não: a mira
// alcança no máximo ~5 blocos e o alçapão tem que ficar em (0, y, 0). Mira a
// PAREDE do buraco: a face −Z do bloco (0, y, 1), que dá a célula (0, y, 0).
await page.evaluate(() => window.__roquecraft.equipar('oakTrapdoor', 2))
await olharDe(0.5, -2.5, 0.5, y + 0.5, 1.0)
await page.waitForTimeout(400)
const mirada = await page.evaluate(() => window.__roquecraft.miraEm())
await page.evaluate(() => window.__roquecraft.place())
await page.waitForTimeout(500)
let k = await chaveEm(0, y, 0)
ok(
  mirada && mirada.x === 0 && mirada.y === y && mirada.z === 1,
  `a mira estava na parede do buraco: ${JSON.stringify(mirada)}`,
)
ok(
  k.startsWith('oakTrapdoor') && !k.includes('Aberto'),
  `o alçapão nasceu fechado sobre o buraco: ${k}`,
)
await page.evaluate(
  ([y]) => {
    const rc = window.__roquecraft
    rc.setFlying(true)
    rc.teleport(2.8, y + 2.6, -2.8)
    rc.look(Math.atan2(0.5 - 2.8, -(0.5 + 2.8)), -0.55)
  },
  [y],
)
await page.waitForTimeout(700)
await foto('1-alcapao-fechado.png')

// ── 2. ANDAR POR CIMA, FECHADO: NÃO CAI ─────────────────────────────────────
async function andarSobreOBuraco() {
  return page.evaluate(
    async ([y]) => {
      const rc = window.__roquecraft
      rc.setFlying(true)
      rc.teleport(0.5, y + 1, -1.5)
      rc.setFlying(false)
      rc.look(Math.PI, 0)
      await new Promise((r) => setTimeout(r, 300))
      rc.press('forward', true)
      await new Promise((r) => setTimeout(r, 520))
      rc.press('forward', false)
      await new Promise((r) => setTimeout(r, 900))
      return { x: rc.state.player.x, y: rc.state.player.y, z: rc.state.player.z }
    },
    [y],
  )
}
const fechado = await andarSobreOBuraco()
ok(
  fechado.z > 0 && fechado.z < 1.6,
  `a caminhada chegou em cima do buraco: z=${fechado.z.toFixed(2)}`,
)
// A tampa fica no FUNDO da célula de cima do buraco: quem pisa nela desce de
// y+1 (a plataforma) para y+3/16 — e para ali, em vez de cair os três blocos.
ok(
  fechado.y >= y + 3 / 16 - 0.05 && fechado.y < y + 1,
  `fechado, a tampa SEGURA a 3/16: y=${fechado.y.toFixed(2)} (tampa em ${(y + 3 / 16).toFixed(2)}, fundo em ${y - 2})`,
)

// ── 3. ABRE, ANDA DE NOVO: CAI ──────────────────────────────────────────────
await page.evaluate(() => window.__roquecraft.equipar(null))
// ⚠️ DA BEIRA DO BURACO, olhando bem pra baixo: de 2,5 blocos de distância o
// raio até a tampa (que está no fundo da célula) passava por DENTRO da beira da
// plataforma e a mira acusava pedra em (0, y, −1).
await olharDe(0.5, -0.9, 0.5, y + 0.19, 0.8)
await page.waitForTimeout(400)
const miraNaTampa = await page.evaluate(() => window.__roquecraft.miraEm())
ok(
  miraNaTampa && miraNaTampa.x === 0 && miraNaTampa.y === y && miraNaTampa.z === 0,
  `a mira encosta na tampa: ${JSON.stringify(miraNaTampa)}`,
)
const abriu = await page.evaluate(() => window.__roquecraft.interagir())
await page.waitForTimeout(400)
k = await chaveEm(0, y, 0)
ok(abriu && k.includes('Aberto'), `o clique levanta a tampa: ${k}`)
await page.evaluate(
  ([y]) => {
    const rc = window.__roquecraft
    rc.setFlying(true)
    rc.teleport(2.8, y + 2.6, -2.8)
    rc.look(Math.atan2(0.5 - 2.8, -(0.5 + 2.8)), -0.55)
  },
  [y],
)
await page.waitForTimeout(700)
await foto('2-alcapao-aberto.png')
const aberto = await andarSobreOBuraco()
ok(aberto.y < y - 0.5, `aberto, o jogador CAI no buraco: y=${aberto.y.toFixed(2)}`)
ok(
  fechado.y - aberto.y > 1,
  `prova de vida: as duas caminhadas diferem em y (${(fechado.y - aberto.y).toFixed(2)})`,
)

// ── 4. A TÁBUA CONTINUA TÁBUA; O PORTÃO OLHA PRA QUEM COLOCOU ───────────────
const colocar = async (item, ox, oz, x, z) => {
  await page.evaluate(([item]) => window.__roquecraft.equipar(item, 4), [item])
  await olharDe(ox, oz, x + 0.5, y + 1, z + 0.5) // o topo do bloco (x, y, z)
  await page.waitForTimeout(350)
  await page.evaluate(() => window.__roquecraft.place())
  await page.waitForTimeout(400)
  return chaveEm(x, y + 1, z)
}
const tabua = await colocar('oakPlanks', 5.5, 2.5, 5, 5)
ok(tabua === 'oakPlanks', `tábua colocada continua tábua: ${tabua} (era portão desde 25/08)`)
const portaoX = await colocar('oakGate', -5.5, 5.5, -3, 5) // olhando pra +X
const portaoZ = await colocar('oakGate', -7.5, 2.5, -7, 5) // olhando pra +Z
ok(
  portaoX.startsWith('oakGate') && portaoZ.startsWith('oakGate'),
  `os dois portões nasceram: ${portaoX} / ${portaoZ}`,
)
ok(portaoX !== portaoZ, `o portão olha pra quem colocou: +X → ${portaoX}, +Z → ${portaoZ}`)

console.log(v.join('\n'))
console.log(
  JSON.stringify({ y, fechado, aberto, tabua, portaoX, portaoZ, fotos: SAIDA, erros }, null, 2),
)
ok(erros.length === 0, `sem erro de página (${erros.length})`)
await ctx.close()
await b.close()
await fechar()
process.exit(bom ? 0 : 1)
