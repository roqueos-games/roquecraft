// SMOKE DE PRODUÇÃO do RoqueCraft na rota pública.
//
// O harness de QA serve `dist/pwa` local. Isso prova o código, não a entrega:
// CDN com cache velho, asset faltando, service worker antigo e política de
// `Cache-Control` já produziram uma página quebrada com o build certo. Este
// script abre roqueos.com.br de verdade e faz três perguntas de comportamento,
// não de string — o bundle é minificado e procurar nome de função nele não
// prova nada.
//
// Uso: node scripts/qa-roquecraft-prod.mjs
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'

const { PNG } = createRequire(import.meta.url)('pngjs')

// ⚠️ não chamar de `URL`: isso sombreia o construtor global do Node.
// ⚠️ A ROTA DO JOGO, NÃO A LANDING. Desde o Goal 15 a landing (`/jogos/<slug>`)
// é do SITE, outro repo, e o botão dela mudou de classe sem ninguém avisar este
// script — que ficou vermelho em silêncio de 10/09 a 18/09, procurando um
// `.jogo__btn--primario` que não existe mais. Este repo é dono de
// `/jogar/<slug>` (`routes.js`, `autoplay: true`): o motor monta sozinho ali.
// A landing entra só como PERGUNTA — ela ainda aponta para cá? — e não como
// porta de entrada.
const ALVO = process.argv[2] || 'https://roqueos.com.br/jogar/roquecraft'
const LANDING = new URL('/jogos/roquecraft', ALVO).toString()
const OUT = path.resolve('scripts/.qa-agua')
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
  serviceWorkers: 'block',
  locale: 'pt-BR',
})
const page = await ctx.newPage()
const erros = []
page.on('pageerror', (e) => erros.push(`PAGEERROR ${e.message}`))
page.on('console', (m) => {
  const t = m.text()
  if (/Shader Error|not compiled|INVALID_OPERATION: useProgram/i.test(t))
    erros.push(`SHADER ${t.slice(0, 500)}`)
})
page.on('requestfailed', (r) => {
  if (/\.(js|css|png|json)$/.test(r.url())) erros.push(`FALHOU ${r.url().slice(-70)}`)
})

// 0. A landing do SITE ainda manda o jogador para cá? Quem publica a landing é
//    outro repo; se o link dela quebrar, o jogo continua no ar e ninguém chega.
const landing = await page.request.get(LANDING).catch(() => null)
const landingHtml = landing && landing.ok() ? await landing.text() : ''
const landingAponta =
  /href="?https?:\/\/[^"\s>]*\/jogar\/roquecraft"?|href="?\/jogar\/roquecraft"?/.test(landingHtml)

await page.goto(ALVO, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('canvas', { timeout: 60000 })

// 1. O jogo carrega e desenha. Sem o gancho de E2E em produção (ele é inerte
//    fora do modo de teste), a prova é o canvas existir e o frame não ser um
//    retângulo de uma cor só.
const abriu = await page
  .waitForSelector('canvas', { timeout: 60000 })
  .then(() => true)
  .catch(() => false)
await page.waitForTimeout(14000)
const shot = path.join(OUT, 'prod.png')
await page.locator('canvas').first().screenshot({ path: shot })

// 2. O frame tem CONTEÚDO. Um canvas preto ou de cor chapada é o sintoma de
//    material que não compilou — e ele não derruba a página, então sem esta
//    conta o smoke passaria com o mundo invisível.
//
// ⚠️ A conta é feita no PNG que o Playwright capturou, NÃO por `drawImage` do
// canvas dentro da página. Sem `preserveDrawingBuffer` o buffer de desenho do
// WebGL é descartado depois de compor, e `drawImage` devolve preto — a primeira
// versão deste smoke reprovou o site inteiro por causa disso, com o jogo
// rodando bem na tela.
const png = PNG.sync.read(fs.readFileSync(shot))
const cores = (() => {
  const set = new Set()
  let soma = 0
  let n = 0
  for (let y = 0; y < png.height; y += 4)
    for (let x = 0; x < png.width; x += 4) {
      const i = (y * png.width + x) * 4
      set.add(`${png.data[i] >> 4},${png.data[i + 1] >> 4},${png.data[i + 2] >> 4}`)
      soma += png.data[i] + png.data[i + 1] + png.data[i + 2]
      n++
    }
  return { distintas: set.size, brilhoMedio: +(soma / n / 3).toFixed(1) }
})()

// 3. Os assets do jogo respondem 200.
//
// O pacote de ÁUDIO entra aqui desde 2026-08-22. Ele é servido de
// `public/games/roquecraft/audio/` e o `build:app` remove `pack/` do dist — um
// glob errado ali levaria o áudio junto, e o sintoma em produção seria o jogo
// caindo na síntese de emergência sem avisar ninguém. Um 404 no manifesto é
// mais barato de ver aqui do que de ouvir.
const assets = {}
for (const a of [
  '/games/roquecraft/tex/manifest.json',
  '/games/roquecraft/tex/blocks_albedo.png',
  '/games/roquecraft/tex/blocks_normal.png',
  '/games/roquecraft/audio/manifest.json',
  '/games/roquecraft/audio/p-grama-0.ogg',
  '/games/roquecraft/audio/f-picareta-0.ogg',
  '/games/roquecraft/audio/amb-vento.ogg',
]) {
  const r = await page.request.get(new URL(a, ALVO).toString())
  assets[a] = r.status()
}

// E o manifesto tem que listar o pacote inteiro, não um resto de build antigo.
let audioManifesto = null
try {
  const r = await page.request.get(
    new URL('/games/roquecraft/audio/manifest.json', ALVO).toString(),
  )
  const m = await r.json()
  audioManifesto = {
    grupos: Object.keys(m.grupos || {}).length,
    amostras: Object.values(m.grupos || {}).reduce((a, v) => a + v.length, 0),
    licenca: m.licenca,
  }
} catch {
  audioManifesto = { erro: 'manifesto de áudio ilegível' }
}

const veredito = {
  landing: landingAponta
    ? 'OK'
    : `LANDING NÃO APONTA PARA /jogar/roquecraft (${landing?.status?.() ?? 'sem resposta'})`,
  abriu: abriu ? 'OK' : 'CANVAS NÃO APARECEU',
  desenhou: cores.distintas > 60 ? 'OK' : `SÓ ${cores.distintas} CORES — mundo invisível?`,
  assets: Object.values(assets).every((s) => s === 200) ? 'OK' : 'ASSET FALTANDO',
  audio:
    audioManifesto?.grupos >= 20 && audioManifesto?.amostras >= 80
      ? 'OK'
      : `PACOTE INCOMPLETO (${audioManifesto?.grupos} grupos, ${audioManifesto?.amostras} amostras)`,
  console: erros.length ? `${erros.length} ERRO(S)` : 'OK',
}
console.log(
  JSON.stringify(
    { url: ALVO, cores, assets, audioManifesto, veredito, erros: erros.slice(0, 6) },
    null,
    2,
  ),
)

await ctx.close()
await browser.close()
process.exit(Object.values(veredito).every((v) => v === 'OK') ? 0 : 1)
