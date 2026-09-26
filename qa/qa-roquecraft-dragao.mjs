//
// O DRAGÃO, O PORTAL DE SAÍDA E OS CRÉDITOS, NO JOGO (Goal 21, Onda 5.3).
//
// `dragao.spec.js` prova o voo; `fimDeJogo.spec.js` a ordem das três coisas.
// O que só o jogo prova: que o dragão NASCE ao chegar no Fim (o motor de
// entidades, com a lista zerada pela troca de dimensão), que ele voa de
// verdade (a posição muda), que a queda dele acende o portal de saída na
// fonte e grava no save, que atravessar o portal de saída volta ao overworld
// COM os créditos na tela, e que voltar ao Fim depois disso não traz o dragão.
//
//   node scripts/qa-roquecraft-dragao.mjs
//
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { servirDist } from './lib/servidor-do-dist.mjs'

const SAIDA = path.resolve('scripts/.qa-dragao')
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

/** Um portal do Fim pronto num platô, e o jogador dentro dele. */
const irAoFim = async () =>
  page.evaluate(async () => {
    const rc = window.__roquecraft
    const dorme = (ms) => new Promise((k) => setTimeout(k, ms))
    rc.setMode('creative')
    const y = Math.round(rc.surfaceAt(0, 0) ?? 66) + 14
    rc.setFlying(true)
    rc.teleport(0.5, y + 3, 0.5)
    rc.fill(-8, y - 2, -8, 8, y - 1, 8, 'stone')
    rc.fill(-8, y, -8, 8, y + 6, 8, 'air')
    await dorme(1000)
    rc.fill(-1, y - 1, -1, 1, y - 1, 1, 'endPortal')
    await dorme(400)
    rc.teleport(0.5, y - 1, 0.5)
    rc.setFlying(false)
    let esperou = 0
    while (rc.dimensaoAtual() !== 'end' && esperou < 6000) {
      await dorme(200)
      esperou += 200
    }
    await rc.waitChunks?.(2, 30000)
    return rc.dimensaoAtual()
  })

passo = '1-nasce'
// ── 1. O DRAGÃO NASCE E VOA ─────────────────────────────────────────────────
const dim1 = await irAoFim()
ok(dim1 === 'end', `chegou ao Fim: ${dim1}`)
const voo = await page.evaluate(async () => {
  const rc = window.__roquecraft
  const dorme = (ms) => new Promise((k) => setTimeout(k, ms))
  await dorme(1500)
  const d = () => rc.mobsInfo().find((m) => m.type === 'dragao') ?? null
  const a = d()
  await dorme(2000)
  const b = d()
  const dragoes = rc.mobsInfo().filter((m) => m.type === 'dragao').length
  return { a, b, dragoes, moveu: a && b ? Math.hypot(a.x - b.x, a.z - b.z) : 0 }
})
ok(
  voo.dragoes === 1 && voo.a?.vida === 200,
  `UM dragão nasceu, com 200 de vida: ${JSON.stringify(voo.a)}`,
)
ok(
  voo.a && voo.a.y > 70 && voo.moveu > 4,
  `ele voa: y ${voo.a?.y}, andou ${voo.moveu.toFixed(1)} em 2 s`,
)
// A foto: do centro da ilha, olhando para onde ele está agora.
await page.evaluate(() => {
  const rc = window.__roquecraft
  rc.setFlying(true)
  rc.teleport(0.5, 63, 0.5)
  const d = rc.mobsInfo().find((m) => m.type === 'dragao')
  if (d) rc.look(Math.atan2(d.x - 0.5, -(d.z - 0.5)), Math.atan2(d.y - 64.6, Math.hypot(d.x, d.z)))
})
await page.waitForTimeout(600)
await foto('1-dragao.png')

passo = '2-queda'
// ── 2. A QUEDA ACENDE O PORTAL DE SAÍDA E GRAVA NO SAVE ─────────────────────
const queda = await page.evaluate(async () => {
  const rc = window.__roquecraft
  const dorme = (ms) => new Promise((k) => setTimeout(k, ms))
  const antes = rc.blockKeyAt(0, 61, 0)
  const avisosAntes = window.__rosStore.notifications?.length ?? 0
  const vida = rc.ferirMob('dragao', 199)
  await dorme(300)
  const aindaVivo = rc.mobsInfo().some((m) => m.type === 'dragao')
  const portalAntesDeCair = rc.blockKeyAt(0, 61, 0)
  rc.ferirMob('dragao', 5)
  await dorme(600)
  const miolo = [-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dz) => rc.blockKeyAt(dx, 61, dz)))
  const avisos = (window.__rosStore.notifications || []).slice(avisosAntes).map((n) => n.message)
  const save = rc.payloadDeSave()
  return {
    antes,
    vida,
    aindaVivo,
    portalAntesDeCair,
    miolo,
    dragoes: rc.mobsInfo().filter((m) => m.type === 'dragao').length,
    avisos,
    dragaoMorto: save?.dragaoMorto,
    xp: rc.state.level,
  }
})
ok(
  queda.antes === 'air' && queda.vida === 1 && queda.aindaVivo && queda.portalAntesDeCair === 'air',
  `com 1 de vida ele ainda voa e a fonte segue vazia: ${JSON.stringify({ vida: queda.vida, portal: queda.portalAntesDeCair })}`,
)
ok(
  queda.dragoes === 0 && queda.miolo.every((k) => k === 'endPortal'),
  `caiu: o portal de saída acendeu na fonte: ${JSON.stringify(queda.miolo)}`,
)
ok(queda.dragaoMorto === true, `o save grava que o dragão caiu: ${queda.dragaoMorto}`)
ok(
  queda.avisos.some((a) => /drag/i.test(a)),
  `avisou: ${JSON.stringify(queda.avisos)}`,
)
await page.evaluate(() => {
  const rc = window.__roquecraft
  rc.teleport(0.5, 64, 6.5)
  rc.look(Math.PI, -0.6)
})
await page.waitForTimeout(600)
await foto('2-saida.png')

passo = '3-volta'
// ── 3. ATRAVESSAR A SAÍDA: VOLTA COM OS CRÉDITOS ────────────────────────────
const volta = await page.evaluate(async () => {
  const rc = window.__roquecraft
  const dorme = (ms) => new Promise((k) => setTimeout(k, ms))
  rc.setMode('survival')
  rc.teleport(0.5, 61, 0.5)
  rc.setFlying(false)
  let esperou = 0
  while (rc.dimensaoAtual() !== 'overworld' && esperou < 6000) {
    await dorme(200)
    esperou += 200
  }
  await dorme(800)
  return { dim: rc.dimensaoAtual(), esperou, pausado: rc.state.paused }
})
ok(volta.dim === 'overworld', `a saída leva de volta ao overworld em ${volta.esperou} ms`)
const creditos = await page.locator('[data-test="rc-venceu"]').count()
const titulo = await page.locator('.rc-pause__title').first().textContent()
ok(
  creditos === 1 && /venceu/i.test(titulo || ''),
  `os créditos rolam com o título da vitória: "${titulo}"`,
)
await foto('3-creditos.png')

passo = '4-volta-ao-fim'
// ── 4. DE VOLTA AO FIM, SEM DRAGÃO ──────────────────────────────────────────
passo = '3b-continuar'
// Sai dos créditos pelo caminho do jogador: Voltar → Continuar.
await page.getByRole('button', { name: 'Voltar' }).first().click()
await page.waitForTimeout(200)
await page.getByRole('button', { name: 'Continuar' }).first().click()
await page.waitForTimeout(400)
const pausaSumiu = (await page.locator('.rc-pause').count()) === 0
ok(pausaSumiu, 'Voltar → Continuar fecha os créditos')
const dim2 = await irAoFim()
const semDragao = await page.evaluate(async () => {
  const rc = window.__roquecraft
  await new Promise((k) => setTimeout(k, 2500))
  return {
    dragoes: rc.mobsInfo().filter((m) => m.type === 'dragao').length,
    saida: rc.blockKeyAt(0, 61, 0),
  }
})
ok(
  dim2 === 'end' && semDragao.dragoes === 0,
  `de volta ao Fim o dragão não renasce (${semDragao.dragoes})`,
)
ok(semDragao.saida === 'endPortal', `e o portal de saída continua lá: ${semDragao.saida}`)

console.log(v.join('\n'))
console.log(JSON.stringify({ voo, queda, volta, semDragao, fotos: SAIDA, erros }, null, 2))
ok(erros.length === 0, `sem erro de página (${erros.length})`)
await ctx.close()
await b.close()
await fechar()
process.exit(bom ? 0 : 1)
