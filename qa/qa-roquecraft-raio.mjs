//
// O RELÂMPAGO ACENDE A TELA? — e acende só quem está sob o céu.
//
// ⚠️ O DIFÍCIL AQUI É PEGAR O CLARÃO NO ATO. Com ~6 raios por minuto e 0,42 s
// de duração, o céu fica aceso 1,7% do tempo: uma foto tirada na hora errada
// mostraria "não acendeu" com toda a convicção do mundo, e seria a hora errada
// em 98 de cada 100 tentativas.
//
// Então a sonda não fotografa e torce — ela ESPERA. `climaQA().clarao` devolve
// o número que o engine usou para acender o quadro; a sonda enquete até ele
// passar de um limiar e só então dispara o obturador. E tira o par escuro no
// mesmo lugar, entre um raio e outro.
//
// O controle é o de sempre: a caverna. Relâmpago que acende o fundo da caverna
// é o mesmo defeito da chuva que acendia caverna — e a razão de o clarão entrar
// por `uSkyFactor` e pela direcional, e não pelo ambiente.
//
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const OUT = path.resolve('scripts/.qa-raio')
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })

const DIST = path.resolve('dist/pwa')
const SEMENTE = Number(process.argv[2] || 942457)
const QUALIDADE = process.argv[3] || 'medium'
const TICK = 15000 // NOITE: o clarão de dia se perde no sol, e o founder joga os dois

const T = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
}
const servidor = http.createServer((q, r) => {
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
await new Promise((r) => servidor.listen(0, r))
const base = `http://localhost:${servidor.address().port}`

const erros = []
const b = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const ctx = await b.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
  serviceWorkers: 'block',
  locale: 'pt-BR',
})
const page = await ctx.newPage()
page.on('pageerror', (e) => erros.push(String(e.message).slice(0, 160)))
await page.addInitScript(
  `window.__ROS_E2E__={auth:{uid:'e2e',email:'e@e.t',emailVerified:true,displayName:'E',role:'user'},googleDrive:{isConnected:false,files:[],user:{}},googleMapsApiKey:'',roquecraftSeed:${SEMENTE}}`,
)
await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => !!window.__rosStore, null, { timeout: 30000 })
await page.waitForTimeout(900)
await page.evaluate(() => window.__rosStore.openWindow('roquecraft'))
await page.waitForFunction(() => window.__roquecraft?.state?.ready === true, null, {
  timeout: 120000,
})
await page.evaluate(async (q) => {
  window.__roquecraft.setQuality(q)
  await new Promise((r) => setTimeout(r, 2500))
  window.__rosStore?.maximizeWindow?.('roquecraft')
  await new Promise((r) => setTimeout(r, 900))
}, QUALIDADE)
// A mira fica no centro exato do canvas, que é a borda de cima do recorte do
// chão — um X branco de alto contraste bem onde a régua procura degrau.
await page.addStyleTag({
  content:
    '.ros-roquecraft__play, .ros-roquecraft__crosshair, .rc-hud { display: none !important }',
})
await page.waitForTimeout(500)

const canvas = await page.evaluate(() => {
  const c = document.querySelector('.ros-roquecraft__canvas')
  if (!c) return null
  const r = c.getBoundingClientRect()
  return { x: r.x, y: r.y, w: r.width, h: r.height }
})
if (!canvas) {
  console.log(JSON.stringify({ erro: 'canvas não encontrado', erros }))
  process.exit(1)
}
const LUMA = (p, x, y) => {
  const i = (p.width * y + x) << 2
  return 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2]
}
const R = {
  x0: Math.round(canvas.x + canvas.w * 0.12),
  x1: Math.round(canvas.x + canvas.w * 0.88),
  y0: Math.round(canvas.y + canvas.h * 0.5),
  y1: Math.round(canvas.y + canvas.h * 0.85),
}
function brilho(png) {
  let s = 0
  let n = 0
  for (let y = R.y0; y < R.y1; y++) {
    for (let x = R.x0; x < R.x1; x++) {
      s += LUMA(png, x, y)
      n++
    }
  }
  return s / n
}

async function irPara(onde) {
  return page.evaluate(
    async ([onde, tick]) => {
      const rc = window.__roquecraft
      if (onde === 'caverna') {
        if (!rc.gotoCave?.()) return { erro: 'não achei caverna' }
        await rc.waitChunks(3)
        await new Promise((k) => setTimeout(k, 1800))
        rc.setTime(tick)
        rc.look(0.7, -0.25)
        await new Promise((k) => setTimeout(k, 900))
        return { onde }
      }
      const pouso = rc.gotoBiome('plains', 90, 16)
      if (!pouso) return { erro: 'não achei campo aberto' }
      await rc.waitChunks(6)
      await new Promise((k) => setTimeout(k, 2400))
      rc.setTime(tick)
      const p = rc.state.player
      const chao = rc.debug?.groundBelow ?? Math.floor(p.y) - 2
      rc.teleport(p.x, chao + 7.5, p.z)
      await new Promise((k) => setTimeout(k, 400))
      rc.look(0.8, -0.5)
      await new Promise((k) => setTimeout(k, 1200))
      return { onde, bioma: rc.state.biome }
    },
    [onde, TICK],
  )
}

/**
 * Foto com o clarão CONGELADO no valor pedido.
 *
 * ⚠️ A PRIMEIRA VERSÃO PERSEGUIA O CLARÃO e não conseguia. Ela enquetava
 * `climaQA().clarao` até passar de um limiar e então fotografava — mas o clarão
 * dura 0,42 s e o obturador do Playwright leva centenas de ms. A medida saiu
 * com 0,587 na leitura e 0,022 depois da foto, e a própria sonda recusou o
 * número. Recusar é certo; recusar toda vez não mede nada.
 *
 * Congelar é o mesmo movimento que salvou o A/B da onda: parar o fenômeno num
 * instante escolhido é o que permite fotografar o mesmo instante duas vezes.
 */
async function fotoComClarao(nome, valor) {
  await page.evaluate(
    async ([valor, tick]) => {
      const rc = window.__roquecraft
      rc.climaQA({ claraoFixo: valor })
      rc.setTime(tick)
      await new Promise((r) => setTimeout(r, 700))
      rc.setTime(tick)
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    },
    [valor, TICK],
  )
  const buf = await page.screenshot()
  fs.writeFileSync(path.join(OUT, `${nome}.png`), buf)
  const conferido = await page.evaluate(() => window.__roquecraft.climaQA().clarao)
  return { png: PNG.sync.read(buf), clarao: conferido }
}

const medidas = {}
for (const cena of ['campo', 'caverna']) {
  const chegada = await irPara(cena)
  if (chegada.erro) {
    medidas[cena] = { erro: chegada.erro }
    continue
  }
  // ⚠️ E A CHUVA FICA DESLIGADA NESTA MEDIDA, o que parece contra-intuitivo
  // numa sonda de relâmpago. O clarão está CONGELADO por `claraoFixo`, então
  // ele não precisa da tempestade para existir — e a tempestade traz junto duas
  // coisas que se mexem sozinhas entre um clique e outro: a cortina de gotas e
  // a nuvem andando no relógio de parede. Foi exatamente isso que fez o par de
  // ida e volta discordar em 1,04% e a sonda recusar o número (com razão).
  //
  // O sujeito aqui é "o clarão acende o mundo?", não "a tempestade é bonita?".
  // Tirar tudo o que não é o sujeito é o que deixa o ruído em zero.
  await page.evaluate(() => {
    window.__roquecraft.climaQA({ chuva: 0 })
    window.__roquecraft.setFx({ clouds: false, wind: false, congelarAgua: true, hand: false })
  })
  await page.waitForTimeout(600)
  const escuro = await fotoComClarao(`${cena}-escuro`, 0)
  const aceso = await fotoComClarao(`${cena}-clarao`, 1)
  // E de volta ao escuro: se não voltar ao mesmo número, a diferença do meio
  // não é do clarão.
  const escuroDeNovo = await fotoComClarao(`${cena}-escuro-de-novo`, 0)
  medidas[cena] = {
    ...chegada,
    clarao: Number(aceso.clarao.toFixed(3)),
    escuro: Number(brilho(escuro.png).toFixed(2)),
    aceso: Number(brilho(aceso.png).toFixed(2)),
    ruidoPorCento: Number(
      (((brilho(escuro.png) - brilho(escuroDeNovo.png)) / brilho(escuro.png)) * 100).toFixed(2),
    ),
  }
  medidas[cena].ganhoPorCento = Number(
    (
      ((medidas[cena].aceso - medidas[cena].escuro) / Math.max(0.01, medidas[cena].escuro)) *
      100
    ).toFixed(2),
  )
}
await page.evaluate(() => window.__roquecraft.climaQA({ chuva: null, claraoFixo: null }))

// ── Veredito ─────────────────────────────────────────────────────────────────
const campo = medidas.campo || {}
const caverna = medidas.caverna || {}
const veredito = []

if (campo.erro) {
  veredito.push(`SEM MEDIDA NO CAMPO: ${campo.erro}.`)
} else if (campo.clarao < 0.9) {
  veredito.push(
    `CONGELADOR NÃO PEGOU: pedi clarão 1 e o jogo relatou ${campo.clarao}. A foto não é do clarão — não dá pra concluir.`,
  )
} else if (Math.abs(campo.ruidoPorCento) > 1) {
  veredito.push(
    `CENA INSTÁVEL: voltando ao escuro o brilho ficou ${campo.ruidoPorCento}% diferente. A diferença medida não é atribuível ao raio.`,
  )
} else if (campo.ganhoPorCento < 15) {
  veredito.push(
    `O RAIO NÃO ACENDE: o campo foi de ${campo.escuro} para ${campo.aceso} (${campo.ganhoPorCento}%) num clarão de ${campo.clarao}.`,
  )
} else if (caverna.erro) {
  veredito.push(
    `campo acendeu ${campo.ganhoPorCento}% — mas SEM O CONTROLE DA CAVERNA (${caverna.erro}) isso não distingue "o céu clareou" de "a cena inteira clareou".`,
  )
} else if (caverna.ganhoPorCento > 12) {
  veredito.push(
    `⚠️ O RAIO ACENDE A CAVERNA: o fundo foi de ${caverna.escuro} para ${caverna.aceso} (${caverna.ganhoPorCento}%). Clarão tem que entrar pela luz do CÉU, e céu não atravessa pedra.`,
  )
} else {
  veredito.push(
    `RELÂMPAGO ACENDE O QUE DEVE: campo ${campo.escuro} → ${campo.aceso} (+${campo.ganhoPorCento}%) num clarão de ${campo.clarao}; caverna ${caverna.escuro} → ${caverna.aceso} (${caverna.ganhoPorCento}%).`,
  )
}

const relatorio = {
  semente: SEMENTE,
  qualidade: QUALIDADE,
  tick: TICK,
  canvas,
  R,
  medidas,
  veredito,
  erros,
}
fs.writeFileSync(path.join(OUT, 'relatorio.json'), JSON.stringify(relatorio, null, 2))
console.log(JSON.stringify({ medidas, veredito, erros }, null, 2))
await ctx.close()
await b.close()
servidor.close()
