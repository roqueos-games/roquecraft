//
// O FIM, NO JOGO — o anel de molduras, o olho, a travessia, a ilha, o vazio e a
// volta (Goal 21, Onda 5.1).
//
// `portalDoFim.spec.js` prova o anel, `endWorldgen.spec.js` a ilha,
// `travessia.spec.js` o pouso. O que só o jogo prova: que o clique com o olho
// na mão passa pela mira e pela escada de `interacao.js`, que o miolo aceso
// LEVA (o worker troca de gerador, o chunk chega, o jogador pousa em pé na
// obsidiana), que a ilha e os pilares estão onde o gerador diz, que o vazio
// mata e que renascer traz de volta ao overworld.
//
//   1. anel de 12 molduras (11 com olho) num platô; olho na mão; clique na
//      décima segunda → as nove células do miolo viram `endPortal`;
//   2. pisar no miolo: em ~2 s a dimensão é 'end' e o jogador está em pé na
//      plataforma de obsidiana (x 44, y 60);
//   3. a ilha: pedra do Fim perto do centro, obsidiana no pilar de +X, bedrock
//      na fonte com o miolo vazio;
//   4. sobrevivência, pular no vazio: em 4 s a vida cai; morre; renascer → a
//      dimensão volta a 'overworld'.
//
//   node scripts/qa-roquecraft-fim.mjs
//
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { servirDist } from './lib/servidor-do-dist.mjs'

const SAIDA = path.resolve('scripts/.qa-fim')
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

// ── 1. O ANEL E O OLHO ──────────────────────────────────────────────────────
const anel = await page.evaluate(async () => {
  const rc = window.__roquecraft
  const dorme = (ms) => new Promise((k) => setTimeout(k, ms))
  rc.setMode('creative')
  const y = Math.round(rc.surfaceAt(0, 0) ?? 66) + 14
  rc.setFlying(true)
  rc.teleport(0.5, y + 3, 0.5)
  rc.fill(-8, y - 2, -8, 8, y - 1, 8, 'stone')
  rc.fill(-8, y, -8, 8, y + 6, 8, 'air')
  await dorme(1200)
  // O anel no nível do chão (y − 1): o miolo fica um degrau abaixo do jogador,
  // como na fortaleza. Centro em (0, 0); 11 com olho, a de (−2, 0) vazia.
  const ANEL = [
    ...[-1, 0, 1].map((dx) => [dx, -2]),
    ...[-1, 0, 1].map((dx) => [dx, 2]),
    ...[-1, 0, 1].map((dz) => [-2, dz]),
    ...[-1, 0, 1].map((dz) => [2, dz]),
  ]
  for (const [dx, dz] of ANEL) {
    const vazia = dx === -2 && dz === 0
    rc.fill(dx, y - 1, dz, dx, y - 1, dz, vazia ? 'endPortalFrame' : 'endPortalFrameEye')
  }
  // O miolo é um buraco de um bloco: ar em y − 1, pedra em y − 2.
  rc.fill(-1, y - 1, -1, 1, y - 1, 1, 'air')
  await dorme(600)
  rc.selectSlot(0)
  rc.equipar('ender_eye', 3)
  // Em cima da moldura vazia, olhando reto para baixo.
  rc.teleport(-1.5, y + 1.5, 0.5)
  rc.look(0, -1.5)
  await dorme(400)
  const mira = rc.miraEm()
  const antes = rc.blockKeyAt(-2, y - 1, 0)
  const tratou = rc.interagir()
  await dorme(500)
  return {
    y,
    mira: mira?.chave ?? null,
    antes,
    tratou,
    depois: rc.blockKeyAt(-2, y - 1, 0),
    miolo: [-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dz) => rc.blockKeyAt(dx, y - 1, dz))),
    olhos: rc.contarItem('ender_eye'),
  }
})
ok(
  anel.antes === 'endPortalFrame' && anel.depois === 'endPortalFrameEye',
  `o clique com o olho enche a moldura: ${JSON.stringify(anel)}`,
)
ok(
  anel.miolo.every((k) => k === 'endPortal'),
  `a décima segunda acende o miolo 3×3: ${JSON.stringify(anel.miolo)}`,
)
ok(anel.olhos === 2, `o olho foi consumido (3 → ${anel.olhos})`)
await foto('1-portal.png')
const y = anel.y

// ── 2. A TRAVESSIA ──────────────────────────────────────────────────────────
const ida = await page.evaluate(
  async ([y]) => {
    const rc = window.__roquecraft
    const dorme = (ms) => new Promise((k) => setTimeout(k, ms))
    rc.setFlying(false)
    rc.teleport(0.5, y - 1, 0.5)
    rc.setFlying(false)
    const dimAntes = rc.dimensaoAtual()
    let esperou = 0
    while (rc.dimensaoAtual() === dimAntes && esperou < 6000) {
      await dorme(200)
      esperou += 200
    }
    await rc.waitChunks?.(2, 30000)
    await dorme(1500)
    const p = rc.state.player
    return {
      dimAntes,
      dim: rc.dimensaoAtual(),
      esperou,
      jog: { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) },
      sobOsPes: rc.blockKeyAt(Math.floor(p.x), Math.floor(p.y) - 1, Math.floor(p.z)),
    }
  },
  [y],
)
ok(
  ida.dimAntes === 'overworld' && ida.dim === 'end',
  `pisar no miolo leva ao Fim em ${ida.esperou} ms: ${ida.dimAntes} → ${ida.dim}`,
)
ok(
  Math.abs(ida.jog.x - 44.5) < 0.6 &&
    Math.abs(ida.jog.z - 0.5) < 0.6 &&
    ida.sobOsPes === 'obsidian',
  `pousou em pé na plataforma de obsidiana: ${JSON.stringify(ida)}`,
)
await foto('2-chegada.png')

// ── 3. A ILHA ───────────────────────────────────────────────────────────────
const ilha = await page.evaluate(async () => {
  const rc = window.__roquecraft
  const dorme = (ms) => new Promise((k) => setTimeout(k, ms))
  rc.setFlying(true)
  rc.teleport(10.5, 75, 10.5)
  await rc.waitChunks?.(3, 30000)
  await dorme(2500)
  const coluna = (x, z) => {
    for (let y = 70; y > 30; y--) {
      const k = rc.blockKeyAt(x, y, z)
      if (k !== 'air') return { y, k }
    }
    return null
  }
  rc.look(Math.PI * 0.75, -0.3)
  return {
    perto: coluna(10, 10),
    pilar: rc.blockKeyAt(34, 70, 0),
    fonteBorda: rc.blockKeyAt(2, 61, 2),
    fonteMiolo: rc.blockKeyAt(0, 61, 0),
    vazio: coluna(150, 150),
  }
})
ok(ilha.perto?.k === 'endStone', `pedra do Fim perto do centro: ${JSON.stringify(ilha.perto)}`)
ok(
  ilha.pilar === 'obsidian',
  `pilar de obsidiana em (34, 70, 0) (o primeiro pilar sobe até 76): ${ilha.pilar}`,
)
ok(
  ilha.fonteBorda === 'bedrock' && ilha.fonteMiolo === 'air',
  `a fonte: bedrock na borda, miolo vazio: ${ilha.fonteBorda}/${ilha.fonteMiolo}`,
)
ok(ilha.vazio === null, `fora da ilha é vazio: ${JSON.stringify(ilha.vazio)}`)
await page.waitForTimeout(600)
await foto('3-ilha.png')

// ── 4. O VAZIO MATA, E RENASCER VOLTA ───────────────────────────────────────
const vazio = await page.evaluate(async () => {
  const rc = window.__roquecraft
  const dorme = (ms) => new Promise((k) => setTimeout(k, ms))
  rc.setMode('survival')
  rc.teleport(150.5, 30, 150.5)
  rc.setFlying(false)
  const vida0 = rc.state.health
  let t = 0
  while (!rc.estaMorto?.() && rc.state.health > 0 && t < 12000) {
    await dorme(250)
    t += 250
  }
  const vidaFim = rc.state.health
  const dimAoMorrer = rc.dimensaoAtual()
  rc.renascer()
  await dorme(2500)
  return {
    vida0,
    vidaFim,
    t,
    dimAoMorrer,
    dim: rc.dimensaoAtual(),
    y: +rc.state.player.y.toFixed(1),
  }
})
ok(
  vazio.vida0 === 20 && vazio.vidaFim <= 0 && vazio.t < 12000,
  `o vazio mata em ${vazio.t} ms: vida ${vazio.vida0} → ${vazio.vidaFim}`,
)
ok(
  vazio.dimAoMorrer === 'end' && vazio.dim === 'overworld',
  `renascer traz de volta ao overworld: ${vazio.dimAoMorrer} → ${vazio.dim}`,
)

console.log(v.join('\n'))
console.log(JSON.stringify({ anel, ida, ilha, vazio, fotos: SAIDA, erros }, null, 2))
ok(erros.length === 0, `sem erro de página (${erros.length})`)
await ctx.close()
await b.close()
await fechar()
process.exit(bom ? 0 : 1)
