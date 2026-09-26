//
// O CONSOLE FICA LIMPO ENQUANTO SE JOGA — inclusive trocando de perfil.
//
// ⚠️ NENHUMA SONDA LIA `console.error`. Todas ouvem `pageerror` (exceção que
// derruba) e quase nenhuma o que o WebGL e o three reclamam sem derrubar —
// `INVALID_OPERATION`, `Feedback loop`, shader que não compilou. Foi assim que
// a troca para o perfil `low` em execução ficou emitindo dois
// `INVALID_OPERATION` desde a rodada 5 (24/08) sem que nenhum portão visse:
// o jogo seguia desenhando, e "seguia desenhando" era o único critério.
//
// Três afirmações, num jogo de verdade sobre o `dist`:
//   1. 20 s andando e olhando em volta no perfil inicial: zero erro;
//   2. trocar para `low`, depois `ultra`, depois `medium`, jogando entre uma e
//      outra: zero erro de WebGL/three;
//   3. nenhuma exceção de página no caminho todo.
//
//   node scripts/qa-roquecraft-console-limpo.mjs
//
import { chromium } from 'playwright'
import { servirDist } from './lib/servidor-do-dist.mjs'

const { base, fechar } = await servirDist('dist/pwa')
const b = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
})
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' })
const page = await ctx.newPage()

const erros = []
const graves = []
// Só um erro é do harness: o pointer lock não existe sem gesto de usuário.
const DO_HARNESS = /not valid for pointer lock|Error during service worker registration/
page.on('pageerror', (e) => {
  if (!DO_HARNESS.test(String(e.message)))
    graves.push(`PAGEERROR ${String(e.message).slice(0, 200)}`)
})
page.on('console', (m) => {
  if (m.type() !== 'error' && m.type() !== 'warning') return
  const t = m.text()
  if (DO_HARNESS.test(t)) return
  // ⚠️ O QUE INTERESSA É O RENDER. Aviso de cache de fonte, de política de
  // autoplay e do Vue em dev não são o defeito que esta sonda existe para pegar.
  if (
    /WebGL|INVALID_|GL_|Feedback loop|THREE\.|shader|Shader|glDraw|framebuffer|texture/i.test(t)
  ) {
    erros.push(`${m.type().toUpperCase()} ${t.slice(0, 220)}`)
  }
})

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
  await window.__roquecraft.stage({ height: 8, radius: 5, wait: 1500 })
})
await page.click('.ros-roquecraft__play').catch(() => {})
await page.waitForTimeout(500)

/** Joga por `ms`: olha em volta e anda, como um jogador que explora. */
async function jogar(ms) {
  const t0 = Date.now()
  let k = 0
  while (Date.now() - t0 < ms) {
    await page.evaluate((k) => {
      const rc = window.__roquecraft
      rc.look((k / 12) * Math.PI * 2, Math.sin(k / 3) * 0.4)
    }, k)
    await page.keyboard.down('KeyW')
    await page.waitForTimeout(350)
    await page.keyboard.up('KeyW')
    await page.waitForTimeout(150)
    k++
  }
}

const v = []
let bom = true
const ok = (c, m) => {
  v.push(`${c ? '✅' : '❌'} ${m}`)
  if (!c) bom = false
}
const contar = () => erros.length

const inicial = await page.evaluate(() => window.__roquecraft.state.quality)
await jogar(20000)
ok(contar() === 0, `20 s no perfil inicial (${inicial}): ${contar()} erro(s) de render`)

const roteiro = ['low', 'ultra', 'medium', 'high']
const porPerfil = {}
for (const q of roteiro) {
  const antes = contar()
  await page.evaluate((q) => window.__roquecraft.setQuality(q), q)
  await page.waitForTimeout(1500)
  await jogar(8000)
  porPerfil[q] = contar() - antes
  ok(porPerfil[q] === 0, `trocar para ${q} e jogar 8 s: ${porPerfil[q]} erro(s) de render`)
}
ok(graves.length === 0, `sem exceção de página (${graves.length})`)

console.log(
  JSON.stringify({ veredito: v, inicial, porPerfil, erros: erros.slice(0, 12), graves }, null, 2),
)
await ctx.close()
await b.close()
fechar()
process.exit(bom ? 0 : 1)
