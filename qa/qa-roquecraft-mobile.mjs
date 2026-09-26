//
// REPRODUZIR O CÉU CHEIO DE TERRENO, NO MOTOR DO IPHONE.
//
// O founder mandou print de (−3, 63, 20) no Safari do iPhone: "o mapa gerado
// está lá no céu". A geração está limpa — `mundoPendurado.spec.js` varre cinco
// sementes e não acha um bloco sólido no céu aberto. Logo o defeito é de
// DESENHO, e o que meu QA nunca tocou é justamente a plataforma dele: todo
// print meu saiu de Chromium, em desktop, no perfil de qualidade alta.
//
// Aqui roda WebKit (o motor do Safari) com viewport de iPhone, que é o mais
// perto do aparelho dele que dá pra chegar sem o aparelho.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { webkit, chromium, devices } from 'playwright'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const DIST = path.resolve('dist/pwa')
const OUT = path.resolve('scripts/.qa-mobile')
fs.mkdirSync(OUT, { recursive: true })
const T = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ogg': 'audio/ogg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
}
const s = http.createServer((q, r) => {
  const p = decodeURIComponent((q.url || '/').split('?')[0])
  let f = path.join(DIST, p)
  try {
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = shellDoApp(DIST)
  } catch {
    f = shellDoApp(DIST)
  }
  r.setHeader('Content-Type', T[path.extname(f)] || 'application/octet-stream')
  fs.createReadStream(f).pipe(r)
})
await new Promise((r) => s.listen(0, r))
const base = `http://localhost:${s.address().port}`
// Por padrão testa o build local; passe uma URL pra testar PRODUÇÃO, que é
// onde o founder está.
// ⚠️ `/jogar/:slug`, e não `/jogos/`: a rota mudou no Goal 15 e esta sonda
// ficou meses apontando para um 404 — e verde, porque não tinha veredito.
const ALVO = process.argv[2] || `${base}/jogar/roquecraft`

const SEED = `window.__ROS_E2E__={auth:{uid:'e2e',email:'e@e.t',emailVerified:true,displayName:'E',role:'user'},googleDrive:{isConnected:false,files:[],user:{}},googleMapsApiKey:'',roquecraftSeed:20260819}`

const cenarios = [
  { nome: 'webkit-iphone', motor: webkit, device: devices['iPhone 13'] },
  { nome: 'chromium-iphone', motor: chromium, device: devices['iPhone 13'] },
]
const saida = []
for (const c of cenarios) {
  let b
  try {
    b = await c.motor.launch({
      args: c.motor === chromium ? ['--use-gl=angle', '--enable-unsafe-swiftshader'] : [],
    })
  } catch (e) {
    saida.push({ cenario: c.nome, erro: e.message.slice(0, 140) })
    continue
  }
  const ctx = await b.newContext({ ...c.device, serviceWorkers: 'block', locale: 'pt-BR' })
  const page = await ctx.newPage()
  const erros = []
  page.on('pageerror', (e) => erros.push(`PAGEERROR ${e.message.slice(0, 200)}`))
  page.on('console', (m) => {
    const t = m.text()
    // O registro do service worker falha DE PROPÓSITO aqui (`serviceWorkers:
    // 'block'` faz `register()` devolver undefined): é artefato do harness.
    if (/service worker registration/i.test(t)) return
    if (/Shader|WebGL|INVALID|not compiled|error/i.test(t)) erros.push(`CONSOLE ${t.slice(0, 220)}`)
  })
  try {
    if (ALVO.startsWith('http://localhost')) await page.addInitScript(SEED)
    await page.goto(ALVO, { waitUntil: 'domcontentloaded' })
    // ⚠️ A rota pública é uma LANDING prerenderizada: o botão existe no HTML
    // estático ANTES de o Vue montar, e clicar nessa janela não faz nada. O
    // smoke de produção já tinha aprendido isso; este harness repetiu o erro e
    // ficou 90 s esperando um jogo que nunca começou. Esperar a hidratação.
    await page.waitForSelector('canvas', { timeout: 60000 })
    await page.waitForTimeout(3000)
    // A página de jogar abre no lobby: entra pelo MESMO botão do jogador
    // (o que `qa-roquecraft-prod-mobile` faz em produção).
    for (const t of ['Novo mundo', 'Continuar', 'Jogar']) {
      const b2 = page.locator(`text=${t}`).first()
      if (await b2.count()) {
        await b2.click({ force: true }).catch(() => {})
        break
      }
    }
    await page.waitForFunction(() => window.__roquecraft?.state?.ready === true, null, {
      timeout: 90000,
    })
    // ⚠️ NÃO esperar os chunks. A hipótese é que o print dele é o mundo AINDA
    // CARREGANDO: num celular o streaming é lento, e seção que chega antes da
    // vizinha aparece como fragmento solto com céu em volta. Todo print meu até
    // hoje veio depois de `waitChunks`, que é exatamente o estado que esconde
    // isso.
    const serie = []
    await page.evaluate(async () => {
      const rc = window.__roquecraft
      rc.setTime(2600)
      const h = rc.surfaceAt(-3, 20)
      rc.teleport(-2.5, (Number.isFinite(h) ? h : 66) + 1, 20.5)
      rc.setFlying(false)
      rc.look(0.4, 0.12)
    })
    for (const ms of [400, 900, 1800, 3500, 7000]) {
      await page.waitForTimeout(ms === 400 ? 400 : ms - serie.reduce((a, _b) => a + 0, 0) - 0)
      const st = await page.evaluate(() => {
        const rc = window.__roquecraft
        return { chunks: rc.state.chunks, secoes: rc.state.sections, tri: rc.state.triangles }
      })
      serie.push({ ms, ...st })
      fs.writeFileSync(path.join(OUT, `${c.nome}-t${ms}.png`), await page.screenshot())
    }
    const info = await page.evaluate(async () => {
      const rc = window.__roquecraft
      return {
        pos: rc.state.player,
        bioma: rc.state.biome,
        quality: rc.state.quality,
        secoes: rc.state.sections,
        tri: rc.state.triangles,
        serieFinal: true,
      }
    })
    info.serie = serie
    fs.writeFileSync(path.join(OUT, `${c.nome}.png`), await page.screenshot())
    saida.push({ cenario: c.nome, ...info, erros: erros.slice(0, 6) })
  } catch (e) {
    saida.push({ cenario: c.nome, erro: e.message.slice(0, 200), erros: erros.slice(0, 6) })
  }
  await b.close()
}
console.log(
  JSON.stringify(
    saida.map((x) => ({
      cenario: x.cenario,
      erro: x.erro,
      quality: x.quality,
      secoes: x.secoes,
      tri: x.tri,
      pos: x.pos,
      bioma: x.bioma,
      erros: x.erros,
      serie: x.serie,
    })),
    null,
    2,
  ),
)
s.close()
// O veredito sai pelo código de saída: o ledger de sondas lê ISSO, não a prosa.
// Nenhum cenário pode ter estourado, e nenhum pode ter erro de página.
const limpo = saida.length > 0 && saida.every((x) => !x.erro && (!x.erros || x.erros.length === 0))
process.exit(limpo ? 0 : 1)
