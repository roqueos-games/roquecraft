//
// O RELÓGIO DA SALA, NO JOGO (Goal 21, Onda 6.1).
//
// `relogioDaSala.spec.js` prova a regra (desvio circular, tolerância) e
// `useRoqueCraftMultijogador.spec.js` prova o composable contra uma rede
// falsa. O que só o jogo prova é a FIAÇÃO do convidado: o acerto que chega
// pela rede tem que escrever no `ticks` do componente (o `let` que o laço do
// quadro lê) e a sobrescrita de tempo tem que chegar ao clima com o bioma do
// jogador. É o adaptador que perde argumento no caminho — o respingo da poção
// chegou ao jogador sem escala exatamente assim, com o unitário verde.
//
// O lado do ANFITRIÃO (publicar no Firebase) não cabe aqui: precisa de conta
// e de duas abas logadas. Fica medido pelo unitário e pela regra do banco.
//
//   node scripts/qa-roquecraft-relogio-da-sala.mjs
//
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { servirDist } from './lib/servidor-do-dist.mjs'

const SAIDA = path.resolve('scripts/.qa-relogio-da-sala')
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

const bioma = await page.evaluate(() => window.__roquecraft.state.biome)
const semChuva = /desert|deserto|desierto/i.test(bioma || '')

// ── 1. FORA DA TOLERÂNCIA: acerta o relógio e adota a chuva ─────────────────
passo = '1-acerta'
const acerto = await page.evaluate(async () => {
  const rc = window.__roquecraft
  rc.setTime(1000)
  const antes = rc.state.ticks
  const r = rc.relogioDaSala({ ticks: 6000, chuva: 1 })
  await new Promise((k) => setTimeout(k, 700))
  const clima = rc.climaQA()
  return {
    antes,
    depois: r.ticks,
    forcado: r.forcado,
    ticksAgora: rc.state.ticks,
    chuva: clima.chuva,
    neve: clima.neve,
    forcadoDepois: clima.forcado,
  }
})
ok(
  Math.abs(acerto.antes - 1000) < 30 && Math.abs(acerto.depois - 6000) < 30,
  `desvio de 5.000 ticks acerta o relógio: ${acerto.antes} → ${acerto.depois}`,
)
ok(
  acerto.ticksAgora > 6000 && acerto.ticksAgora < 6100,
  `e o laço do quadro segue do valor acertado: ${acerto.ticksAgora} (0,7 s depois)`,
)
ok(
  acerto.forcado === 1 && acerto.forcadoDepois === 1,
  `a chuva forçada chegou ao clima (${acerto.forcado})`,
)
ok(
  semChuva || acerto.chuva + acerto.neve > 0.9,
  `e precipita no bioma "${bioma}": chuva ${acerto.chuva.toFixed(2)}, neve ${acerto.neve.toFixed(2)}`,
)
await foto('1-acertado-chovendo.png')

// ── 2. DENTRO DA TOLERÂNCIA: o relógio local não dá solavanco ───────────────
passo = '2-tolerancia'
const folga = await page.evaluate(() => {
  const rc = window.__roquecraft
  rc.setTime(6000)
  return rc.relogioDaSala({ ticks: 6020, chuva: 1 }).ticks
})
ok(Math.abs(folga - 6000) < 10, `20 ticks de desvio não acerta: ${folga} (esperado ~6000)`)

// ── 3. A VIRADA DO DIA: 23.990 contra 20 é 30 de desvio, não um dia ─────────
passo = '3-meia-noite'
const virada = await page.evaluate(() => {
  const rc = window.__roquecraft
  rc.setTime(23990)
  return rc.relogioDaSala({ ticks: 20, chuva: 1 }).ticks
})
ok(virada >= 23980, `na virada do dia o desvio é circular: ${virada} (não pulou para 20)`)

// ── 4. A SOBRESCRITA VOLTA AO MUNDO ─────────────────────────────────────────
passo = '4-solta'
const solto = await page.evaluate(async () => {
  const rc = window.__roquecraft
  const r = rc.relogioDaSala({ ticks: 23990, chuva: null })
  await new Promise((k) => setTimeout(k, 300))
  return { forcado: r.forcado, depois: rc.climaQA().forcado }
})
ok(
  solto.forcado === null && solto.depois === null,
  `chuva null devolve o mando ao mundo (${solto.depois})`,
)

console.log(v.join('\n'))
console.log(JSON.stringify({ bioma, acerto, folga, virada, solto, fotos: SAIDA, erros }, null, 2))
ok(erros.length === 0, `sem erro de página (${erros.length})`)
await ctx.close()
await b.close()
await fechar()
process.exit(bom ? 0 : 1)
