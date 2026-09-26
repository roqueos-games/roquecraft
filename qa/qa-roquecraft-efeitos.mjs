//
// EFEITOS COM PRAZO, NO JOGO — a poção morde, e o prazo acaba.
//
// ⚠️ O QUE OS TESTES DE UNIDADE NÃO PODEM PROVAR. `efeitos.spec.js` prova a
// regra (o multiplicador é 1,4) e `efeitosMordem.spec.js` prova as mordidas com
// a física e a sobrevivência isoladas. Nenhum dos dois passa pelo componente,
// pelo composable do corpo e pelo laço de quadro — e é ali que mora a diferença
// entre "o número está certo" e "o jogador anda mais depressa".
//
// Mede, com o jogo rodando:
//
//   1. velocidade II leva o jogador MAIS LONGE em três segundos de tecla presa;
//   2. lentidão II leva MENOS;
//   3. veneno TIRA vida e PARA em 1 — não mata;
//   4. cura instantânea devolve vida na hora;
//   5. o prazo ACABA sozinho, e o efeito some do mapa.
//
//   node scripts/qa-roquecraft-efeitos.mjs
//
import { chromium } from 'playwright'
import { servirDist } from './lib/servidor-do-dist.mjs'

const { base, fechar } = await servirDist('dist/pwa')
const b = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const ctx = await b.newContext({ viewport: { width: 900, height: 820 }, serviceWorkers: 'block' })
const page = await ctx.newPage()
const erros = []
page.on('pageerror', (e) => erros.push(String(e.message).slice(0, 160)))
await page.addInitScript(
  `window.__ROS_E2E__={auth:{uid:'e2e',email:'e@e.t',emailVerified:true,displayName:'E',role:'user'},googleDrive:{isConnected:false,files:[],user:{}},googleMapsApiKey:'',roquecraftSeed:942457}`,
)
await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => !!window.__rosStore, null, { timeout: 30000 })
await page.waitForTimeout(500)
await page.evaluate(() => window.__rosStore.openWindow('roquecraft'))
await page.waitForFunction(() => window.__roquecraft?.state?.ready === true, null, {
  timeout: 120000,
})
await page.waitForTimeout(1000)

const r = await page.evaluate(async () => {
  const rc = window.__roquecraft
  const dorme = (ms) => new Promise((k) => setTimeout(k, ms))
  rc.setMode('creative')
  rc.setFlying(true)

  const y = Math.round(rc.surfaceAt(0, 0) ?? 66) + 6
  rc.teleport(0.5, y + 4, 0.5)
  await rc.waitChunks(3, 30000)
  // Uma pista plana e comprida, para a corrida não esbarrar em nada.
  rc.fill(-4, y - 1, -60, 4, y - 1, 60, 'stone')
  rc.fill(-4, y, -60, 4, y + 2, 60, 'air')
  await dorme(600)

  // ── 1 e 2. o passo ───────────────────────────────────────────────────────
  //
  // Anda de verdade: segura a tecla, como o jogador. Teleportar mediria o
  // teleporte. `setFlying(false)` porque o voo tem velocidade própria.
  const correr = async (efeito) => {
    rc.limparEfeitos()
    if (efeito) rc.darEfeito(efeito, 2, 600)
    rc.teleport(0.5, y + 1, 0.5)
    // ⚠️ DEPOIS DO TELEPORTE, e não antes. `teleport` LIGA o voo pra enquadrar
    // cena (está escrito no gancho), e a primeira versão desta sonda mediu
    // 13 m/s — que é `FLY_SPEED`, não `WALK_SPEED`. Ela teria dado verde
    // provando a mordida no ramo errado da física.
    rc.setFlying(false)
    rc.look(0, 0)
    await dorme(900)
    const p0 = { ...rc.state.player }
    rc.press('forward', true)
    await dorme(3000)
    rc.press('forward', false)
    await dorme(200)
    const p1 = { ...rc.state.player }
    return Math.hypot(p1.x - p0.x, p1.z - p0.z)
  }
  const normal = await correr(null)
  const rapido = await correr('velocidade')
  const lento = await correr('lentidao')
  rc.limparEfeitos()

  // ── 3. o veneno ──────────────────────────────────────────────────────────
  rc.setMode('survival')
  rc.teleport(0.5, y + 1, 0.5)
  await dorme(400)
  const vidaAntesDoVeneno = rc.state.health
  rc.darEfeito('veneno', 2, 30)
  await dorme(9000)
  const vidaComVeneno = rc.state.health
  const aindaVivo = !rc.state.dead

  // ── 4. a cura instantânea ────────────────────────────────────────────────
  //
  // ⚠️ FERE DE PROPÓSITO ANTES. A primeira versão contava com o veneno ter
  // machucado, e num mutante que desligava o veneno esta medida ficava vermelha
  // JUNTO — dois defeitos diferentes acusando a mesma coisa. Medida que só
  // funciona se a anterior funcionou não é medida independente.
  rc.hurt(8)
  await dorme(300)
  const antesDaCura = rc.state.health
  rc.darEfeito('cura', 2)
  await dorme(300)
  const depoisDaCura = rc.state.health

  // ── 5. o prazo acaba ─────────────────────────────────────────────────────
  rc.limparEfeitos()
  rc.darEfeito('forca', 1, 2)
  await dorme(300)
  const comPrazo = rc.efeitosInfo().map((e) => e.nome)
  await dorme(3000)
  const depoisDoPrazo = rc.efeitosInfo().map((e) => e.nome)
  rc.limparEfeitos()

  return {
    y,
    normal,
    rapido,
    lento,
    vidaAntesDoVeneno,
    vidaComVeneno,
    aindaVivo,
    antesDaCura,
    depoisDaCura,
    comPrazo,
    depoisDoPrazo,
  }
})

await ctx.close()
await b.close()
fechar()

const falhas = []
const m = (n) => Number(n).toFixed(2)

// ⚠️ O TETO IMPORTA TANTO QUANTO O PISO. Três segundos andando dão perto de
// 3 × WALK_SPEED (4,7 m/s) = 14 blocos. Medir 39 é medir o VOO, e foi o que a
// primeira versão desta sonda fez — verde, provando o ramo errado da física.
if (!(r.normal > 8 && r.normal < 20)) {
  falhas.push(`3 s andando deram ${m(r.normal)} blocos; a pe sao ~14 (39 e o voo)`)
}
if (!(r.rapido > r.normal * 1.12)) {
  falhas.push(`velocidade II nao mordeu no passo: ${m(r.normal)} → ${m(r.rapido)} blocos`)
}
if (!(r.lento < r.normal * 0.92)) {
  falhas.push(`lentidao II nao mordeu no passo: ${m(r.normal)} → ${m(r.lento)} blocos`)
}

if (!(r.vidaComVeneno < r.vidaAntesDoVeneno)) {
  falhas.push(`o veneno nao tirou vida: ${r.vidaAntesDoVeneno} → ${r.vidaComVeneno}`)
}
if (!r.aindaVivo || r.vidaComVeneno < 1) {
  falhas.push(`o veneno MATOU — ele tem que parar em 1: vida ${r.vidaComVeneno}, morto ${!r.aindaVivo}`)
}

if (!(r.depoisDaCura > r.antesDaCura)) {
  falhas.push(`a cura instantanea nao curou: ${r.antesDaCura} → ${r.depoisDaCura}`)
}

if (!r.comPrazo.includes('forca')) falhas.push(`o efeito nao entrou: ${JSON.stringify(r.comPrazo)}`)
if (r.depoisDoPrazo.includes('forca')) {
  falhas.push(`o prazo NAO acabou — efeito eterno: ${JSON.stringify(r.depoisDoPrazo)}`)
}
if (erros.length) falhas.push(`erro de pagina: ${erros[0]}`)

console.log('')
console.log('efeitos com prazo — a pocao morde, e o prazo acaba')
console.log('')
console.log(
  `  3 s andando         sem efeito ${m(r.normal)}  velocidade II ${m(r.rapido)}  ` +
    `lentidao II ${m(r.lento)} blocos`,
)
console.log(
  `  veneno II, 9 s      vida ${r.vidaAntesDoVeneno} → ${r.vidaComVeneno}  ` +
    `vivo ${r.aindaVivo}`,
)
console.log(`  cura instantanea    vida ${r.antesDaCura} → ${r.depoisDaCura}`)
console.log(
  `  prazo de 2 s        ${JSON.stringify(r.comPrazo)} → ${JSON.stringify(r.depoisDoPrazo)}`,
)
console.log('')
if (falhas.length) {
  console.log('VERMELHO:')
  for (const f of falhas) console.log(`  ✗ ${f}`)
} else {
  console.log('VERDE: o passo muda, a vida sobe e desce, e o prazo acaba sozinho.')
}
console.log('')
process.exit(falhas.length ? 1 : 0)
