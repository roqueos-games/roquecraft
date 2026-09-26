//
// A FORTALEZA, NO JOGO — o olho aponta, o poço desce, o anel está lá e o
// jogador chega ao Fim pelo caminho do jogador (Goal 21, Onda 5.2).
//
// `fortaleza.spec.js` prova o plano e que o gerador escreve a sala. O que só o
// jogo prova: que o olho usado ao ar livre avisa rumo e distância, que o poço
// gerado é aberto na superfície e termina na piscina (a queda de 16 não
// fere), que o anel na sala tem os olhos do plano, que pôr os que faltam
// acende o miolo, e que o miolo LEVA ao Fim.
//
//   node scripts/qa-roquecraft-fortaleza.mjs
//
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { servirDist } from './lib/servidor-do-dist.mjs'

const SAIDA = path.resolve('scripts/.qa-fortaleza')
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

await page.evaluate(() => window.__roquecraft.entrarNoJogo?.())
await page.waitForTimeout(1500)

// ── 1. O OLHO APONTA ────────────────────────────────────────────────────────
const olho = await page.evaluate(async () => {
  const rc = window.__roquecraft
  const dorme = (ms) => new Promise((k) => setTimeout(k, ms))
  const plano = rc.fortalezaInfo()
  rc.setMode('creative')
  rc.selectSlot(0)
  rc.equipar('ender_eye', 16)
  rc.look(0, 0.9)
  await dorme(300)
  const antes = window.__rosStore.notifications?.length ?? 0
  rc.place()
  await dorme(500)
  const avisos = (window.__rosStore.notifications || []).slice(antes).map((n) => n.message)
  const p = rc.state.player
  const dist = Math.round(Math.hypot(plano.centro.x - p.x, plano.centro.z - p.z) / 10) * 10
  return { plano, avisos, dist, olhos: rc.contarItem('ender_eye') }
})
ok(!!olho.plano, `há fortaleza na semente: ${JSON.stringify(olho.plano?.centro)}`)
ok(
  olho.avisos.length === 1 &&
    /fortaleza/i.test(olho.avisos[0]) &&
    olho.avisos[0].includes(String(olho.dist)),
  `o olho avisa rumo e distância (${olho.dist}): ${JSON.stringify(olho.avisos)}`,
)
ok(olho.olhos === 16, `apontar não gasta o olho (${olho.olhos})`)
const plano = olho.plano

// ── 2. O POÇO DESCE ATÉ A PISCINA ───────────────────────────────────────────
const poco = await page.evaluate(
  async ([plano]) => {
    const rc = window.__roquecraft
    const dorme = (ms) => new Promise((k) => setTimeout(k, ms))
    const { x, z, chao } = plano.centro
    rc.setFlying(true)
    rc.teleport(x + 0.5, chao + 6, z + 0.5)
    await rc.waitChunks?.(2, 30000)
    await dorme(1500)
    const boca = rc.blockKeyAt(x + 2, chao + 1, z)
    const vao = rc.blockKeyAt(x, chao + 1, z)
    const fundo = rc.blockKeyAt(x, plano.chaoDaSala - 1, z)
    rc.setMode('survival')
    rc.teleport(x + 0.5, chao + 1, z + 0.5)
    rc.setFlying(false)
    await dorme(3000)
    const p = rc.state.player
    return {
      boca,
      vao,
      fundo,
      y: +p.y.toFixed(2),
      vida: rc.state.health,
      naSala: p.y < plano.chaoDaSala + 2,
    }
  },
  [plano],
)
ok(
  poco.boca === 'stoneBricks' && poco.vao === 'air',
  `a boca do poço na superfície: ${poco.boca}, vão ${poco.vao}`,
)
ok(poco.fundo === 'water', `a piscina no fundo: ${poco.fundo}`)
ok(
  poco.naSala && poco.vida === 20,
  `caiu 16 blocos na piscina sem se ferir: y ${poco.y}, vida ${poco.vida}`,
)
await foto('1-sala.png')

// ── 3. O ANEL ESTÁ LÁ, COM OS OLHOS DO PLANO ────────────────────────────────
const anel = await page.evaluate(
  ([plano]) => {
    const rc = window.__roquecraft
    const chaves = plano.molduras.map((m) => rc.blockKeyAt(m.x, m.y, m.z))
    const c = plano.anel
    return { chaves, miolo: rc.blockKeyAt(c.x, c.y, c.z), piso: rc.blockKeyAt(c.x, c.y - 1, c.z) }
  },
  [plano],
)
ok(
  anel.chaves.every((k) => k === 'endPortalFrame' || k === 'endPortalFrameEye') &&
    anel.chaves.filter((k) => k === 'endPortalFrameEye').length === plano.olhos,
  `o anel tem 12 molduras, ${plano.olhos} com olho: ${JSON.stringify(anel.chaves)}`,
)
ok(
  anel.miolo === 'air' && anel.piso === 'stoneBricks',
  `o miolo é ar sobre o piso: ${anel.miolo}/${anel.piso}`,
)

// ── 4. PÔR OS OLHOS QUE FALTAM ACENDE O MIOLO, E O MIOLO LEVA AO FIM ────────
const fim = await page.evaluate(
  async ([plano]) => {
    const rc = window.__roquecraft
    const dorme = (ms) => new Promise((k) => setTimeout(k, ms))
    rc.setMode('creative')
    rc.setFlying(true)
    rc.selectSlot(0)
    rc.equipar('ender_eye', 16)
    let postos = 0
    for (const m of plano.molduras) {
      if (rc.blockKeyAt(m.x, m.y, m.z) !== 'endPortalFrame') continue
      rc.teleport(m.x + 0.5, m.y + 2.2, m.z + 0.5)
      rc.look(0, -1.5)
      await dorme(250)
      if (rc.interagir()) postos++
      await dorme(150)
    }
    const c = plano.anel
    const miolo = [-1, 0, 1].flatMap((dx) =>
      [-1, 0, 1].map((dz) => rc.blockKeyAt(c.x + dx, c.y, c.z + dz)),
    )
    // Pisar no miolo.
    rc.teleport(c.x + 0.5, c.y, c.z + 0.5)
    rc.setFlying(false)
    let esperou = 0
    while (rc.dimensaoAtual() !== 'end' && esperou < 6000) {
      await dorme(200)
      esperou += 200
    }
    await dorme(1500)
    return { postos, miolo, dim: rc.dimensaoAtual(), esperou, olhos: rc.contarItem('ender_eye') }
  },
  [plano],
)
ok(fim.postos === 12 - plano.olhos, `pôs os ${12 - plano.olhos} olhos que faltavam (${fim.postos})`)
ok(fim.olhos === 16 - fim.postos, `cada olho posto saiu da mão (${fim.olhos})`)
ok(
  fim.miolo.every((k) => k === 'endPortal'),
  `o miolo acendeu: ${JSON.stringify(fim.miolo)}`,
)
ok(fim.dim === 'end', `o miolo da fortaleza leva ao Fim em ${fim.esperou} ms: ${fim.dim}`)
await foto('2-fim.png')

console.log(v.join('\n'))
console.log(JSON.stringify({ olho, poco, anel, fim, fotos: SAIDA, erros }, null, 2))
ok(erros.length === 0, `sem erro de página (${erros.length})`)
await ctx.close()
await b.close()
await fechar()
process.exit(bom ? 0 : 1)
