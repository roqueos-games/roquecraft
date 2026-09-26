//
// O ARCO DO JOGADOR — segurar carrega, soltar atira (Goal 21, 3.2).
//
// `arco.spec.js` prova a carga e a flecha; `useRoqueCraftEntidades.spec` prova
// que a flecha acha a criatura. O que só o jogo prova é a FIAÇÃO do gesto:
// apertar o botão de colocar com o arco na mão arma (e não coloca bloco),
// soltar atira, a flecha sai do inventário, o arco se gasta, e o porco a
// cinco blocos apanha — mais com carga cheia do que com um peteleco.
//
//   1. arco + 8 flechas na mão, porco a 3 blocos, mira no meio dele;
//      (a 5 blocos a flecha de meia carga cai quase um bloco antes de chegar —
//      é a gravidade da flecha, e é de propósito);
//   2. apertar-e-soltar em 0,05 s (toque curto): NÃO gasta flecha, nada voa;
//   3. segurar 0,35 s e soltar: uma flecha a menos, o arco perde 1, o porco
//      apanha (vida cai);
//   4. segurar 1,2 s e soltar: apanha MAIS (o dano cresce com a carga);
//   5. sem flecha no inventário, apertar não arma.
//
//   node scripts/qa-roquecraft-arco.mjs
//
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { servirDist } from './lib/servidor-do-dist.mjs'

const SAIDA = path.resolve('scripts/.qa-arco')
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

// ── 1. A CENA ───────────────────────────────────────────────────────────────
await page.evaluate(() => window.__roquecraft.entrarNoJogo?.())
await page.waitForTimeout(1500)
const cena = await page.evaluate(async () => {
  const rc = window.__roquecraft
  rc.setMode('survival')
  rc.setTime(6000)
  const y = Math.round(rc.surfaceAt(0, 0) ?? 66) + 14
  rc.setFlying(true)
  rc.teleport(0.5, y + 3, 0.5)
  rc.fill(-8, y - 2, -8, 8, y, 8, 'stone')
  rc.fill(-8, y + 1, -8, 8, y + 4, 8, 'air')
  await new Promise((r) => setTimeout(r, 1500))
  rc.teleport(0.5, y + 1, 0.5)
  rc.setFlying(false)
  rc.look(0, 0) // −Z
  rc.limparMobs()
  rc.selectSlot(0)
  rc.equiparComEncanto('bow') // com durabilidade cheia (384)
  rc.selectSlot(1)
  rc.equipar('arrow', 8)
  rc.selectSlot(0)
  rc.spawnMob('pig', 3)
  await new Promise((r) => setTimeout(r, 400))
  const porco = rc.criaturas().find((c) => c.tipo === 'pig')
  // Mira no meio do corpo do porco (0,9 de altura).
  const dx = porco.x - 0.5
  const dz = porco.z - 0.5
  const olhoY = y + 1 + 1.62
  rc.look(Math.atan2(dx, -dz), -Math.atan2(olhoY - (porco.y + 0.45), Math.hypot(dx, dz)))
  return {
    y,
    porco: { x: porco.x, y: porco.y, z: porco.z },
    naMao: rc.naMao(),
    flechas: rc.contarItem('arrow'),
  }
})
ok(
  cena.naMao === 'bow' && cena.flechas === 8,
  `arco na mão, 8 flechas, porco a 3: ${JSON.stringify(cena)}`,
)
// ⚠️ MIRA NO PORCO NA HORA DE SOLTAR. Ele vagueia; a mira feita um segundo
// antes já apontava para a grama — foi assim que a meia carga "errou".
const dispararSegurando = async (ms) =>
  page.evaluate(
    async ([ms, y]) => {
      const rc = window.__roquecraft
      const mirarNoPorco = () => {
        const porco = rc.criaturas().find((c) => c.tipo === 'pig')
        if (!porco) return
        const dx = porco.x - rc.state.player.x
        const dz = porco.z - rc.state.player.z
        const olhoY = y + 1 + 1.62
        rc.look(Math.atan2(dx, -dz), -Math.atan2(olhoY - (porco.y + 0.45), Math.hypot(dx, dz)))
      }
      // Um porco NOVO a 3 blocos a cada tiro: o anterior fugiu do susto (ou
      // vagueou até 5, onde a flecha fraca cai antes de chegar — medido).
      rc.limparMobs()
      rc.teleport(0.5, y + 1, 0.5)
      rc.look(0, 0)
      rc.spawnMob('pig', 3)
      await new Promise((r) => setTimeout(r, 250))
      mirarNoPorco()
      const vidaDo = () => rc.mobsInfo().find((m) => m.type === 'pig')?.vida ?? null
      const antes = {
        vida: vidaDo(),
        flechas: rc.contarItem('arrow'),
        dur: rc.durabilidadeNaMao(),
        voando: rc.flechasInfo().length,
      }
      rc.segurarColocar(true)
      await new Promise((r) => setTimeout(r, ms))
      mirarNoPorco()
      const p0 = rc.criaturas().find((c) => c.tipo === 'pig')
      const olhar = {
        yaw: +rc.state.yaw.toFixed(3),
        pitch: +rc.state.pitch.toFixed(3),
        jog: rc.state.player,
      }
      rc.segurarColocar(false)
      const rastro = []
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 16))
        const f = rc.flechasInfo()[0]
        if (f) rastro.push(f)
      }
      const voou = rastro.length > 0
      await new Promise((r) => setTimeout(r, 300))
      return {
        antes,
        flechas: rc.contarItem('arrow'),
        dur: rc.durabilidadeNaMao(),
        voou,
        vida: vidaDo(),
        rastro: rastro.slice(0, 6),
        porco: p0 && { x: +p0.x.toFixed(2), y: +p0.y.toFixed(2), z: +p0.z.toFixed(2) },
        olhar,
      }
    },
    [ms, cena.y],
  )

// ── 2. TOQUE CURTO: NADA ────────────────────────────────────────────────────
const curto = await dispararSegurando(40)
ok(
  curto.flechas === 8 && !curto.voou,
  `toque curto não gasta flecha nem atira: ${JSON.stringify(curto)}`,
)

// ── 3. MEIA CARGA: ATIRA, GASTA, ACERTA ─────────────────────────────────────
const meio = await dispararSegurando(350)
ok(
  meio.voou && meio.flechas === 7,
  `segurar 0,35 s atira e gasta UMA flecha: ${JSON.stringify(meio)}`,
)
ok(meio.dur === 383, `o arco perdeu 1 de durabilidade (${meio.antes.dur} → ${meio.dur})`)
ok(
  meio.vida !== null && meio.vida < meio.antes.vida,
  `o porco apanhou: vida ${meio.antes.vida} → ${meio.vida}`,
)
await foto('1-meia-carga.png')

// ── 4. CARGA CHEIA: DÓI MAIS ────────────────────────────────────────────────
const cheia = await dispararSegurando(1200)
const danoMeio = meio.antes.vida - meio.vida
const danoCheio = cheia.antes.vida - cheia.vida
ok(
  cheia.voou && cheia.flechas === 6,
  `carga cheia atira e gasta a segunda flecha: ${JSON.stringify(cheia)}`,
)
ok(danoCheio > danoMeio, `a carga cheia dói mais: ${danoMeio} (meia) < ${danoCheio} (cheia)`)

// ── 5. SEM FLECHA, NÃO ARMA ─────────────────────────────────────────────────
const semFlecha = await page.evaluate(async () => {
  const rc = window.__roquecraft
  rc.selectSlot(1)
  rc.equipar(null)
  rc.selectSlot(0)
  const antes = rc.flechasInfo().length
  rc.segurarColocar(true)
  await new Promise((r) => setTimeout(r, 500))
  rc.segurarColocar(false)
  await new Promise((r) => setTimeout(r, 100))
  return {
    flechas: rc.contarItem('arrow'),
    voou: rc.flechasInfo().length > antes,
    dur: rc.durabilidadeNaMao(),
  }
})
ok(
  semFlecha.flechas === 0 && !semFlecha.voou && semFlecha.dur === 382,
  `sem flecha nada sai e o arco não gasta: ${JSON.stringify(semFlecha)}`,
)

console.log(v.join('\n'))
console.log(
  JSON.stringify(
    {
      cena,
      curto,
      meio,
      cheia,
      semFlecha,
      fotos: SAIDA,
      erros,
    },
    null,
    2,
  ),
)
ok(erros.length === 0, `sem erro de página (${erros.length})`)
await ctx.close()
await b.close()
await fechar()
process.exit(bom ? 0 : 1)
