//
// O TOQUE ALCANÇA O QUE O TECLADO ALCANÇA — medido com dedo de verdade.
//
// ⚠️ ESTA SONDA EXISTE PORQUE O FOUNDER JOGA NO IPHONE e tudo que entrou pela
// tecla (K para reger o mundo, T para o chat, Q para largar, botão do meio
// para pick block) era invisível lá. Cada gesto abaixo é despachado pelo
// protocolo do navegador (`Input.dispatchTouchEvent`), não por `el.click()`:
// a lição de `qa-roquecraft-menu-usavel` — o handler pode funcionar e o dedo
// não chegar.
//
// Quatro afirmações, em viewport de iPhone 13:
//   1. no criativo há um botão de REGER, e tocá-lo abre o painel;
//   2. SEGURAR um slot da hotbar larga o item (o Q): o inventário perde 1 e
//      um item aparece no chão;
//   3. SEGURAR o dedo na mira, no criativo, pega o bloco mirado (pick block);
//   4. fora de rede não há botão de chat (o botão nasce com a sala).
//
//   node scripts/qa-roquecraft-toque.mjs
//
import { chromium, devices } from 'playwright'
import { servirDist } from './lib/servidor-do-dist.mjs'

const { base, fechar } = await servirDist('dist/pwa')
const b = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const ctx = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' })
const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page)
const erros = []
page.on('pageerror', (e) => erros.push(String(e.message).slice(0, 200)))

await page.addInitScript(
  `window.__ROS_E2E__={auth:{uid:'e2e',email:'e@e.t',emailVerified:true,displayName:'E',role:'user'},googleDrive:{isConnected:false,files:[],user:{}},googleMapsApiKey:'',roquecraftSeed:1337}`,
)
await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => !!window.__rosStore, null, { timeout: 30000 })
await page.evaluate(() => window.__rosStore.openWindow('roquecraft'))
await page.waitForFunction(() => window.__roquecraft?.state?.ready === true, null, {
  timeout: 120000,
})
await page.evaluate(async () => {
  window.__roquecraft.setMode('creative')
  await window.__roquecraft.stage({ height: 8, radius: 3, wait: 1200 })
})
await page.evaluate(() => window.__roquecraft.entrarNoJogo?.())
await page.waitForTimeout(600)

const v = []
let bom = true
const ok = (c, m) => {
  v.push(`${c ? '✅' : '❌'} ${m}`)
  if (!c) bom = false
  return c
}
const centro = (sel) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }
  }, sel)
/**
 * Um dedo que encosta, espera `ms` e sai. Toque de verdade, pelo protocolo.
 *
 * ⚠️ O "SEGURAR" AQUI É DE 1,5 s, E NÃO OS 600 ms DO JOGO. Sem GPU, um quadro
 * do SwiftShader leva centenas de ms e o `touchstart` espera a fila do laço de
 * desenho: com 750 ms de dedo o `touchend` chegava ANTES de o `touchstart` ter
 * sido tratado, o timer nascia e morria no mesmo tique, e a sonda acusava o
 * jogo de não largar. No iPhone o quadro é de 16 ms; aqui a folga é do harness.
 */
async function segurar(x, y, ms) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  await page.waitForTimeout(ms)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

// 1. reger o mundo
const reger = await centro('[data-test="rc-mob-reger"]')
ok(!!reger, 'no criativo existe o botão de reger no HUD móvel')
if (reger) {
  ok(
    reger.w >= 44 && reger.h >= 44,
    `o botão de reger tem alvo de toque ≥ 44px (${reger.w}×${reger.h})`,
  )
  await segurar(reger.x, reger.y, 60)
  await page.waitForTimeout(400)
  const abriu = await page.evaluate(() => window.__roquecraft.criativoAberto())
  ok(abriu, 'tocar em reger abre o painel do criativo')
  // fecha pelo x do painel, como o jogador
  const x = await centro('.rc-cri__x')
  if (x) await segurar(x.x, x.y, 60)
  await page.waitForTimeout(300)
}

// 2. segurar um slot da hotbar larga o item
const antes = await page.evaluate(() => {
  const rc = window.__roquecraft
  rc.selectSlot(0)
  rc.equipar('stone', 5)
  return { pedras: rc.contarItem('stone'), chao: rc.dropsInfo().length }
})
const slot0 = await centro('.rc-hud__slot')
const naFrenteDoSlot = slot0
  ? await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.className?.toString().slice(0, 40) ?? null,
      slot0,
    )
  : null
if (ok(!!slot0, `a hotbar está na tela (na frente do slot: ${naFrenteDoSlot})`)) {
  await segurar(slot0.x, slot0.y, 1500)
  // Lido LOGO depois: o item cai a 1,1 bloco do peito e, passada a carência de
  // quem larga (1,5 s), volta para a mão de quem ficou parado — o que é certo.
  const depois = await page.evaluate(() => ({
    pedras: window.__roquecraft.contarItem('stone'),
    chao: window.__roquecraft.dropsInfo().length,
  }))
  ok(
    depois.pedras === antes.pedras - 1,
    `segurar o slot largou 1 (${antes.pedras} → ${depois.pedras})`,
  )
  ok(depois.chao === antes.chao + 1, `o item foi para o chão (${antes.chao} → ${depois.chao})`)
  // toque curto NÃO larga (e o item largado já pode ter voltado para a mão —
  // por isso a conta é contra o que estava ANTES de largar, não contra `depois`)
  await page.waitForTimeout(2000)
  await segurar(slot0.x, slot0.y, 80)
  await page.waitForTimeout(300)
  const curto = await page.evaluate(() => window.__roquecraft.contarItem('stone'))
  ok(curto === antes.pedras, `toque curto no slot não larga (${antes.pedras} → ${curto})`)
}

// 3. segurar na mira pega o bloco
const alvo = await page.evaluate(() => {
  const rc = window.__roquecraft
  rc.selectSlot(1)
  rc.equipar(null)
  rc.look(0, -0.9) // olha para o chão
  // O que a MIRA DO JOGO vê, não o bloco sob os pés: o mato em cima da grama
  // é mirável (onda 3), e é ele que o pick block pega — corretamente.
  return rc.blocoMirado()
})
const vp = page.viewportSize()
await segurar(vp.width * 0.75, vp.height * 0.5, 1500)
await page.waitForTimeout(300)
const naMao = await page.evaluate(() => window.__roquecraft.naMao())
ok(!!alvo && naMao === alvo, `segurar na mira pegou o bloco mirado (${alvo} → mão: ${naMao})`)

// 4. sem sala, sem chat
ok(!(await centro('[data-test="rc-mob-chat"]')), 'fora de rede não há botão de chat')

ok(erros.length === 0, `sem erro de página (${erros.length})`)
console.log(JSON.stringify({ veredito: v, erros }, null, 2))
await ctx.close()
await b.close()
fechar()
process.exit(bom ? 0 : 1)
