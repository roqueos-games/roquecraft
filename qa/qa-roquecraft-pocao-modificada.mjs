//
// AS POÇÕES MODIFICADAS — nível II, prazo dobrado, arremessável (Goal 21, Onda 4).
//
// `fermentacao.spec.js` prova os modificadores; `arremesso.spec.js` o borrifo;
// `useRoqueCraftEntidades.spec` o voo. O que só o jogo prova: que o suporte
// VIVO carrega o campo `pocao` até a garrafa, que a garrafa modificada na mão
// bebe a dose certa (nível 2, prazo cortado), que a arremessável VOA pelo
// clique de colocar (não desce), quebra e borrifa em quem está perto — o
// jogador e o porco — e que o rótulo do slot lê o modificador.
//
//   1. suporte: poção de força + glowstone → { nivel: 2 } na garrafa;
//   2. beber a força II: efeito força nível 2, restante ≤ 90 s;
//   3. arremessar cura aos pés com 10 de vida: o frasco aparece em voo (forma
//      'frasco'), some da mão sem devolver vidro, e a vida sobe;
//   4. arremessar dano no porco a 2 blocos: a vida dele cai;
//   5. o rótulo do slot da hotbar lê "II" e "Arremessável".
//
//   node scripts/qa-roquecraft-pocao-modificada.mjs
//
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { servirDist } from './lib/servidor-do-dist.mjs'

const SAIDA = path.resolve('scripts/.qa-pocao-modificada')
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

// ── 1. O SUPORTE CARREGA O MODIFICADOR ──────────────────────────────────────
const suporte = await page.evaluate(async () => {
  const rc = window.__roquecraft
  const dorme = (ms) => new Promise((k) => setTimeout(k, ms))
  rc.setMode('creative')
  const y = Math.round(rc.surfaceAt(0, 0) ?? 66) + 14
  rc.setFlying(true)
  rc.teleport(0.5, y + 3, 0.5)
  rc.fill(-6, y - 2, -6, 6, y - 1, 6, 'stone')
  rc.fill(-6, y, -6, 6, y + 3, 6, 'air')
  await dorme(1200)
  rc.fill(0, y, 0, 0, y, 0, 'brewingStand')
  await dorme(400)
  // Abrir antes de encher: a mobília nasce no clique.
  rc.teleport(0.5, y + 1 + 1.62, 0.5)
  rc.look(0, -1.5)
  await dorme(300)
  rc.interagir()
  await dorme(300)
  rc.porNaMobilia(0, y, 0, 'garrafa0', 'pocao_forca', 1)
  rc.porNaMobilia(0, y, 0, 'ingrediente', 'glowstone_dust', 1)
  await dorme(22000)
  const s = rc.mobiliaEm(0, y, 0)
  return { y, garrafa: s?.garrafas?.[0] ?? null, ingrediente: s?.ingrediente ?? null }
})
ok(
  suporte.garrafa?.item === 'pocao_forca' &&
    suporte.garrafa?.pocao?.nivel === 2 &&
    suporte.ingrediente === null,
  `o suporte deu nível II à força e comeu o glowstone: ${JSON.stringify(suporte)}`,
)
const y = suporte.y

// ── 2. BEBER A FORÇA II ─────────────────────────────────────────────────────
const beber = await page.evaluate(
  async ([y]) => {
    const rc = window.__roquecraft
    const dorme = (ms) => new Promise((k) => setTimeout(k, ms))
    rc.setMode('survival')
    rc.teleport(0.5, y + 1, 2.5)
    rc.setFlying(false)
    rc.limparEfeitos()
    rc.selectSlot(0)
    rc.equiparComEncanto('pocao_forca', null, 1, { nivel: 2 })
    rc.look(0, 0.6)
    await dorme(300)
    rc.place()
    await dorme(400)
    return { efeitos: rc.efeitosInfo(), naMao: rc.naMao() }
  },
  [y],
)
const forca = beber.efeitos.find((e) => e.nome === 'forca')
ok(
  forca?.nivel === 2 &&
    forca.restante > 80 &&
    forca.restante <= 90 &&
    beber.naMao === 'glass_bottle',
  `beber a força II: nível 2, restante ≤ 90 s (o glowstone corta o prazo), devolve o vidro: ${JSON.stringify(beber)}`,
)

// ── 3. A ARREMESSÁVEL DE CURA AOS PÉS ───────────────────────────────────────
const cura = await page.evaluate(async () => {
  const rc = window.__roquecraft
  const dorme = (ms) => new Promise((k) => setTimeout(k, ms))
  rc.limparEfeitos()
  rc.hurt(10, 'fall')
  await dorme(700)
  const antes = rc.state.health
  rc.selectSlot(1)
  rc.equiparComEncanto('pocao_cura', null, 1, { splash: true })
  rc.look(0, -1.3)
  await dorme(200)
  rc.place()
  await dorme(60)
  const emVoo = rc.flechasInfo()
  const naMao = rc.naMao()
  await dorme(1200)
  return { antes, depois: rc.state.health, emVoo, naMao, restou: rc.flechasInfo().length }
})
ok(
  cura.emVoo.length === 1 && cura.emVoo[0].forma === 'frasco',
  `o frasco aparece em voo com forma 'frasco': ${JSON.stringify(cura.emVoo)}`,
)
ok(cura.naMao === null, `a arremessável some da mão sem devolver vidro: naMao=${cura.naMao}`)
ok(
  cura.depois > cura.antes && cura.restou === 0,
  `quebrou aos pés e curou: vida ${cura.antes} → ${cura.depois}`,
)
await foto('1-cura.png')

// ── 4. A ARREMESSÁVEL DE DANO NO PORCO ──────────────────────────────────────
const porco = await page.evaluate(async () => {
  const rc = window.__roquecraft
  const dorme = (ms) => new Promise((k) => setTimeout(k, ms))
  rc.limparMobs()
  rc.look(0, 0)
  rc.spawnMob('pig', 2)
  await dorme(250)
  const p = rc.criaturas().find((c) => c.tipo === 'pig')
  const vidaAntes = rc.mobsInfo().find((m) => m.type === 'pig')?.vida
  const dx = p.x - rc.state.player.x
  const dz = p.z - rc.state.player.z
  rc.look(Math.atan2(dx, -dz), -0.35)
  rc.selectSlot(2)
  rc.equiparComEncanto('pocao_dano', null, 1, { nivel: 2, splash: true })
  await dorme(150)
  const vidaJogador = rc.state.health
  rc.place()
  await dorme(1500)
  return {
    vidaAntes,
    vida: rc.mobsInfo().find((m) => m.type === 'pig')?.vida ?? 0,
    vidaJogador,
    vidaJogadorDepois: rc.state.health,
    restou: rc.flechasInfo().length,
  }
})
ok(
  porco.vidaAntes > porco.vida && porco.restou === 0,
  `o dano II arremessado fere o porco: vida ${porco.vidaAntes} → ${porco.vida}`,
)
// O respingo MINGUA: a 2 blocos do porco chega metade do dano II (6 × 0,5 = 3),
// nunca os 6 inteiros — a primeira rodada desta sonda mediu 13 → 7.
const respingo = porco.vidaJogador - porco.vidaJogadorDepois
ok(
  respingo >= 1 && respingo <= 4,
  `o respingo a 2 blocos chega minguado ao jogador (1..4): ${porco.vidaJogador} → ${porco.vidaJogadorDepois}`,
)

// ── 5. O RÓTULO ─────────────────────────────────────────────────────────────
await page.evaluate(() => {
  const rc = window.__roquecraft
  rc.selectSlot(3)
  rc.equiparComEncanto('pocao_veneno', null, 1, { nivel: 2, splash: true })
})
await page.waitForTimeout(300)
const rotulo = await page.locator('.rc-hud__slot').nth(3).getAttribute('title')
ok(
  /II/.test(rotulo || '') && /Arremess/.test(rotulo || ''),
  `o rótulo do slot lê o modificador: "${rotulo}"`,
)
await foto('2-rotulo.png')

console.log(v.join('\n'))
console.log(JSON.stringify({ suporte, beber, cura, porco, rotulo, fotos: SAIDA, erros }, null, 2))
ok(erros.length === 0, `sem erro de página (${erros.length})`)
await ctx.close()
await b.close()
await fechar()
process.exit(bom ? 0 : 1)
