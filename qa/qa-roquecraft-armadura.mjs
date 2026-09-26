//
// A ARMADURA — vestir pelo clique, ver no HUD, apanhar menos (Goal 21, 3.1).
//
// `armadura.spec.js` prova a tabela e o corpo. O que só o jogo prova: que o
// shift+clique no slot do inventário chega em `survival.armadura` (a fiação
// RCInventory → RCTelas → maoDaBancada), que o HUD mostra os pinos, que um
// golpe de bicho chega amenizado e a peça se gasta, e que a queda não.
//
//   1. peitoral de diamante na hotbar; abre o inventário; shift+clique no slot
//      → vestido (8 pontos), o slot esvazia, o lugar mostra o ícone;
//   2. o HUD mostra a barra de armadura com 4 pinos cheios;
//   3. 10 de dano de 'mob': a vida cai 7 (10 × 0,68 = 6,8 → 7), não 10, e a
//      peça perde 2 de durabilidade;
//   4. 10 de dano de 'fall': cai 10 — a armadura não ameniza queda;
//   5. clique no lugar do peitoral → volta para a mochila, 0 pontos, HUD sem barra.
//
//   node scripts/qa-roquecraft-armadura.mjs
//
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { servirDist } from './lib/servidor-do-dist.mjs'

const SAIDA = path.resolve('scripts/.qa-armadura')
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

// Na partida (o HUD só existe com o menu fechado), em sobrevivência, parado
// num platô, vida cheia.
await page.evaluate(() => window.__roquecraft.entrarNoJogo?.())
await page.waitForTimeout(1500)
await page.evaluate(async () => {
  const rc = window.__roquecraft
  rc.setMode('survival')
  const y = Math.round(rc.surfaceAt(0, 0) ?? 66) + 14
  rc.setFlying(true)
  rc.teleport(0.5, y + 3, 0.5)
  rc.fill(-6, y - 2, -6, 6, y, 6, 'stone')
  await new Promise((r) => setTimeout(r, 1500))
  rc.teleport(0.5, y + 1, 0.5)
  rc.setFlying(false)
  rc.selectSlot(0)
  rc.equipar('diamond_chestplate', 1)
})
await page.waitForTimeout(800)

// ── 1. VESTIR PELO CLIQUE ───────────────────────────────────────────────────
await page.evaluate(() => window.__roquecraft.openInventory())
await page.waitForTimeout(500)
const slot0 = page.locator('.rc-inv__row--hot .rc-inv__slot').first()
ok(await slot0.count(), 'o inventário abriu com a hotbar')
await slot0.click({ modifiers: ['Shift'] })
await page.waitForTimeout(400)
let vest = await page.evaluate(() => window.__roquecraft.armaduraVestida())
ok(
  vest.pecas.chestplate === 'diamond_chestplate' && vest.pontos === 8,
  `shift+clique vestiu: ${JSON.stringify(vest)}`,
)
ok((await page.evaluate(() => window.__roquecraft.naMao())) === null, 'o slot da hotbar esvaziou')
ok(
  await page.locator('[data-test="rc-inv-chestplate"] img').count(),
  'o lugar do peitoral mostra o ícone',
)
await foto('1-vestido.png')
await page.evaluate(() => window.__roquecraft.openInventory()) // fecha
await page.waitForTimeout(400)

// ── 2. O HUD ────────────────────────────────────────────────────────────────
const hud = page.locator('[data-test="rc-hud-armadura"]')
ok((await hud.count()) === 1, 'o HUD mostra a barra de armadura')
ok(
  (await hud.locator('.is-full').count()) === 4,
  `4 pinos cheios para 8 pontos (${await hud.locator('.is-full').count()})`,
)
await foto('2-hud.png')

// ── 3. O GOLPE DO BICHO CHEGA AMENIZADO ─────────────────────────────────────
const golpe = await page.evaluate(async () => {
  const rc = window.__roquecraft
  const antes = rc.state.health
  rc.hurt(10, 'mob')
  await new Promise((r) => setTimeout(r, 200))
  return { antes, depois: rc.state.health, vest: rc.armaduraVestida() }
})
ok(
  golpe.antes === 20 && golpe.depois === 13,
  `10 de 'mob' com 8 pontos tira 7: ${golpe.antes} → ${golpe.depois}`,
)
await page.waitForTimeout(700) // passa a invulnerabilidade

// ── 4. A QUEDA NÃO ──────────────────────────────────────────────────────────
const queda = await page.evaluate(async () => {
  const rc = window.__roquecraft
  const antes = rc.state.health
  rc.hurt(10, 'fall')
  await new Promise((r) => setTimeout(r, 200))
  return { antes, depois: rc.state.health }
})
ok(queda.depois === queda.antes - 10, `10 de 'fall' tira 10: ${queda.antes} → ${queda.depois}`)

// ── 5. TIRAR E VESTIR PELO CURSOR — o gesto do toque ────────────────────────
// Clique no lugar (cursor vazio) pega a peça; clique no slot 0 da hotbar põe
// a peça lá; clique no slot 0 pega de novo; clique no lugar veste de novo.
await page.evaluate(() => window.__roquecraft.openInventory())
await page.waitForTimeout(500)
await page.locator('[data-test="rc-inv-chestplate"]').click()
await page.waitForTimeout(300)
vest = await page.evaluate(() => window.__roquecraft.armaduraVestida())
ok(
  vest.pontos === 0 && vest.pecas.chestplate === null,
  `clique no lugar pegou a peça: ${JSON.stringify(vest)}`,
)
await slot0.click()
await page.waitForTimeout(300)
const naMochila = await page.evaluate(() => window.__roquecraft.contarItem('diamond_chestplate'))
ok(naMochila === 1, `e o clique no slot pôs a peça na hotbar (${naMochila})`)
await slot0.click()
await page.waitForTimeout(300)
await page.locator('[data-test="rc-inv-chestplate"]').click()
await page.waitForTimeout(300)
vest = await page.evaluate(() => window.__roquecraft.armaduraVestida())
ok(
  vest.pontos === 8,
  `pegar no slot e clicar no lugar VESTE de novo — sem shift: ${JSON.stringify(vest)}`,
)
await page.locator('[data-test="rc-inv-chestplate"]').click()
await page.waitForTimeout(300)
await slot0.click()
await page.waitForTimeout(300)
// A durabilidade tem que ter perdido 2 (10 de dano ÷ 4).
const dur = await page.evaluate(() => {
  const rc = window.__roquecraft
  rc.selectSlot(0)
  return { item: rc.naMao(), dur: rc.durabilidadeNaMao() }
})
ok(
  dur.item === 'diamond_chestplate' && dur.dur === 526,
  `a peça gastou 2 de durabilidade: ${JSON.stringify(dur)} (528 → 526)`,
)
await page.evaluate(() => window.__roquecraft.openInventory())
await page.waitForTimeout(400)
ok((await hud.count()) === 0, 'sem armadura, o HUD não mostra a barra')

console.log(v.join('\n'))
console.log(JSON.stringify({ golpe, queda, dur, fotos: SAIDA, erros }, null, 2))
ok(erros.length === 0, `sem erro de página (${erros.length})`)
await ctx.close()
await b.close()
await fechar()
process.exit(bom ? 0 : 1)
