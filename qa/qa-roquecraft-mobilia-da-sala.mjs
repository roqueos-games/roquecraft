//
// A MOBÍLIA DA SALA, NO JOGO (Goal 21, Onda 6.3).
//
// `useRoqueCraftPaineis.spec` prova o adaptador; `room.spec` a assinatura.
// O que só o jogo prova: que a entrada que chega da sala vira um baú de
// verdade no mundo vivo, que a TELA aberta redesenha com o que chegou, que a
// entrada que sai tem a forma do save, que `null` esvazia a tela aberta, e que
// quebrar o baú devolve ao chão o que a sala mandou.
//
// O lado da rede (Firebase de verdade, dois clientes) não cabe aqui.
//
//   node scripts/qa-roquecraft-mobilia-da-sala.mjs
//
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { servirDist } from './lib/servidor-do-dist.mjs'

const SAIDA = path.resolve('scripts/.qa-mobilia-da-sala')
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
let passo = 'boot'
page.on('pageerror', (e) => erros.push(`${passo}: ${String(e.message).slice(0, 200)}`))
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

await page.evaluate(() => window.__roquecraft.entrarNoJogo?.())
await page.waitForTimeout(1500)

// ── 1. PLANTAR O BAÚ (o mesmo caminho da sonda do forno) ────────────────────
passo = '1-plantar'
const pos = await page.evaluate(async () => {
  const rc = window.__roquecraft
  rc.setMode('creative')
  const h = rc.surfaceAt(0, 0)
  const base = Number.isFinite(h) ? h : 66
  rc.teleport(0.5, base + 3, 0.5)
  rc.setFlying(true)
  await rc.waitChunks(4)
  rc.look(0.6, -0.75)
  rc.setSlot(0, 'chest', 1)
  await new Promise((r) => setTimeout(r, 2500))
  rc.place()
  await new Promise((r) => setTimeout(r, 600))
  const alvo = rc.miraEm()
  return alvo && alvo.chave === 'chest' ? { x: alvo.x, y: alvo.y, z: alvo.z } : null
})
ok(!!pos, `o baú foi plantado em ${JSON.stringify(pos)}`)
if (!pos) {
  console.log(v.join('\n'))
  await ctx.close()
  await b.close()
  await fechar()
  process.exit(1)
}
const chave = `${pos.x},${pos.y},${pos.z}`

// ── 2. A SALA MANDA UM BAÚ CHEIO, E ELE ESTÁ NO MUNDO ───────────────────────
passo = '2-chega'
const chegou = await page.evaluate(
  ({ chave, pos }) => {
    const rc = window.__roquecraft
    rc.mobiliaDaSala(chave, { t: 'b', s: [['diamond', 3], null, ['stone', 12]] })
    const e = rc.mobiliaEm(pos.x, pos.y, pos.z)
    return { tipo: e?.tipo, s0: e?.slots?.[0], s2: e?.slots?.[2] }
  },
  { chave, pos },
)
ok(
  chegou.tipo === 'bau' && chegou.s0?.item === 'diamond' && chegou.s0.count === 3,
  `a entrada da sala virou baú no mundo: ${JSON.stringify(chegou)}`,
)

// ── 3. ABRIR: A TELA MOSTRA O QUE A SALA MANDOU ─────────────────────────────
passo = '3-abre'
const abriu = await page.evaluate(async () => {
  const rc = window.__roquecraft
  rc.interagir()
  await new Promise((r) => setTimeout(r, 500))
  return { aberto: rc.abertoAgora(), tela: !!document.querySelector('.rc-cont') }
})
ok(
  abriu.tela && abriu.aberto?.tipo === 'bau',
  `a tela do baú abriu (${JSON.stringify(abriu.aberto)})`,
)
const naTela = await page.locator('.rc-cont__bau .rc-slot__n').allTextContents()
ok(
  naTela.map((t) => t.trim()).includes('3') && naTela.map((t) => t.trim()).includes('12'),
  `a tela mostra as pilhas que chegaram: [${naTela.map((t) => t.trim()).join(', ')}]`,
)
await foto('1-bau-da-sala-aberto.png')

// ── 4. O QUE SAI TEM A FORMA DO SAVE ────────────────────────────────────────
passo = '4-sai'
const sai = await page.evaluate((chave) => window.__roquecraft.entradaDaSala(chave), chave)
ok(
  sai?.t === 'b' && Array.isArray(sai.s) && sai.s[0]?.[0] === 'diamond' && sai.s[0]?.[1] === 3,
  `a entrada que sairia pra sala tem a forma do save: ${JSON.stringify(sai).slice(0, 80)}`,
)

// ── 5. A SALA MUDA O BAÚ ABERTO, E A TELA REDESENHA ─────────────────────────
passo = '5-redesenha'
await page.evaluate((chave) => {
  window.__roquecraft.mobiliaDaSala(chave, { t: 'b', s: [['diamond', 7]] })
}, chave)
await page.waitForTimeout(250)
const depois = await page.locator('.rc-cont__bau .rc-slot__n').allTextContents()
ok(
  depois.map((t) => t.trim()).join(',') === '7',
  `a tela aberta redesenhou com o que a sala mandou: [${depois.map((t) => t.trim()).join(', ')}]`,
)
await page.evaluate((chave) => window.__roquecraft.mobiliaDaSala(chave, null), chave)
await page.waitForTimeout(250)
const vazio = await page.locator('.rc-cont__bau .rc-slot__n').count()
ok(vazio === 0, `null da sala esvazia a tela aberta (${vazio} pilhas)`)

// ── 6. QUEBRAR DEVOLVE AO CHÃO O QUE A SALA MANDOU ──────────────────────────
passo = '6-quebra'
const quebra = await page.evaluate(
  async ({ chave }) => {
    const rc = window.__roquecraft
    rc.mobiliaDaSala(chave, { t: 'b', s: [['diamond', 5]] })
    rc.fecharMobilia?.()
    document.querySelector('.rc-cont__x')?.click()
    await new Promise((r) => setTimeout(r, 300))
    const antes = rc.state.drops
    rc.breakNow()
    await new Promise((r) => setTimeout(r, 700))
    return { antes, depois: rc.state.drops, saiu: rc.entradaDaSala(chave) }
  },
  { chave },
)
ok(
  quebra.depois > quebra.antes,
  `quebrar o baú devolveu o conteúdo ao chão (${quebra.antes} → ${quebra.depois} drops)`,
)
ok(quebra.saiu === null, `e a entrada que sairia pra sala é null (apagar)`)

console.log(v.join('\n'))
console.log(
  JSON.stringify({ pos, chegou, abriu, naTela, sai, depois, quebra, fotos: SAIDA, erros }, null, 2),
)
ok(erros.length === 0, `sem erro de página (${erros.length})`)
await ctx.close()
await b.close()
await fechar()
process.exit(bom ? 0 : 1)
