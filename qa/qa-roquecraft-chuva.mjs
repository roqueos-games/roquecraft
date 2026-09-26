//
// A CHUVA MOLHA O CHÃO? — e só o chão que o céu alcança.
//
// A parte da chuva que muda a cara do jogo não são os pingos, é a superfície:
// chuva caindo sobre um mundo seco lê como filtro por cima da foto. A regra
// aplicada no shader vem do modelo de Lagarde (albedo escurece, rugosidade cai,
// F0 não muda), e a pergunta desta sonda é se ela CHEGOU na tela.
//
// ⚠️ E O CONTROLE É O QUE VALE. "Ficou mais escuro com chuva" também acontece
// se alguém tiver escurecido a cena inteira — o que seria um defeito com cara
// de acerto. Por isso são DUAS cenas no mesmo par: o descampado, que TEM que
// escurecer, e o fundo de caverna, que NÃO PODE. Sem a segunda, a primeira não
// distingue "molhou o chão" de "apagou a luz".
//
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const OUT = path.resolve('scripts/.qa-chuva')
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })

const DIST = path.resolve('dist/pwa')
const SEMENTE = Number(process.argv[2] || 942457)
const QUALIDADE = process.argv[3] || 'medium'
const TICK = 5050 // 11:03, sol alto

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
// Faixa central do canvas, longe da moldura. Não precisa da precisão da sonda
// do halo: aqui o que se mede é a MÉDIA de uma área, não um traço de um pixel.
const R = {
  x0: Math.round(canvas.x + canvas.w * 0.12),
  x1: Math.round(canvas.x + canvas.w * 0.88),
  y0: Math.round(canvas.y + canvas.h * 0.55),
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
  return { media: s / n, pixeis: n }
}

async function foto(nome, chuva) {
  await page.evaluate(
    async ([chuva, tick]) => {
      const rc = window.__roquecraft
      rc.setFx({ hand: false, wind: false, congelarAgua: true })
      rc.setTime(tick)
      rc.climaQA({ chuva })
      await new Promise((r) => setTimeout(r, 900))
      rc.setTime(tick)
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    },
    [chuva, TICK],
  )
  const buf = await page.screenshot()
  fs.writeFileSync(path.join(OUT, `${nome}.png`), buf)
  return PNG.sync.read(buf)
}

/** Leva a câmera até uma cena e mira o chão à frente. */
async function irPara(alvo) {
  return page.evaluate(
    async ([alvo, tick]) => {
      const rc = window.__roquecraft
      if (alvo === 'caverna') {
        if (!rc.gotoCave?.()) return { erro: 'não achei caverna' }
        await rc.waitChunks(3)
        await new Promise((k) => setTimeout(k, 1800))
        rc.look(0.7, -0.25)
        await new Promise((k) => setTimeout(k, 900))
        return { onde: 'caverna', y: Math.round(rc.state.player.y) }
      }
      const bioma = alvo === 'gelo' ? 'snowy' : alvo === 'mar' ? 'ocean' : 'plains'
      const pouso = rc.gotoBiome(bioma, 90, 16)
      if (!pouso) return { erro: `não achei ${bioma} aberto` }
      await rc.waitChunks(6)
      await new Promise((k) => setTimeout(k, 2400))
      rc.setTime(tick)
      const ang = ((tick % 24000) / 24000) * Math.PI * 2
      const yaw = Math.atan2(Math.cos(ang) * 0.94, -Math.cos(ang) * 0.34)
      const p = rc.state.player
      const chao = rc.debug?.groundBelow ?? Math.floor(p.y) - 2
      rc.teleport(p.x, chao + 7.5, p.z)
      await new Promise((k) => setTimeout(k, 400))
      rc.look(yaw, -0.5)
      await new Promise((k) => setTimeout(k, 1400))
      return { onde: alvo, bioma: rc.state.biome, pureza: pouso.pureza }
    },
    [alvo, TICK],
  )
}

const medidas = {}
for (const cena of ['campo', 'caverna', 'gelo', 'mar']) {
  const chegada = await irPara(cena)
  if (chegada.erro) {
    medidas[cena] = { erro: chegada.erro }
    continue
  }
  const seco = brilho(await foto(`${cena}-seco`, 0))
  const molhado = brilho(await foto(`${cena}-molhado`, 1))
  // E de volta ao seco, para provar que a mudança é da chuva e não do tempo
  // passando entre um clique e outro.
  const secoDeNovo = brilho(await foto(`${cena}-seco-de-novo`, 0))
  medidas[cena] = {
    ...chegada,
    seco: Number(seco.media.toFixed(2)),
    molhado: Number(molhado.media.toFixed(2)),
    secoDeNovo: Number(secoDeNovo.media.toFixed(2)),
    quedaPorCento: Number((((seco.media - molhado.media) / seco.media) * 100).toFixed(2)),
    // ⚠️ O PISO DE RUÍDO, medido no próprio par: se voltar ao seco não voltar
    // ao mesmo número, a diferença de cima não é da chuva.
    ruidoPorCento: Number((((seco.media - secoDeNovo.media) / seco.media) * 100).toFixed(2)),
  }
}
await page.evaluate(() => window.__roquecraft.climaQA({ chuva: null }))

// ── Veredito ─────────────────────────────────────────────────────────────────
const campo = medidas.campo || {}
const caverna = medidas.caverna || {}
const veredito = []

if (campo.erro) {
  veredito.push(`SEM CENA: ${campo.erro}. Nada a concluir.`)
} else if (Math.abs(campo.ruidoPorCento) > 1) {
  // O par de ida e volta é o primeiro a falar: se o "seco de novo" não bate
  // com o "seco", a cena mudou entre os cliques e a queda do meio não é da
  // chuva. Foi assim que o A/B do reflexo se afogou no movimento da água.
  veredito.push(
    `CENA INSTÁVEL: voltando ao seco o brilho ficou ${campo.ruidoPorCento}% diferente do seco inicial. A diferença medida não é atribuível à chuva.`,
  )
} else if (campo.quedaPorCento < 8) {
  veredito.push(
    `A CHUVA NÃO CHEGOU NA TELA: o descampado escureceu só ${campo.quedaPorCento}% (${campo.seco} → ${campo.molhado}), com ruído de ${campo.ruidoPorCento}%.`,
  )
} else if (campo.quedaPorCento > 45) {
  // ⚠️ O TETO EXISTE PORQUE A PRIMEIRA VERSÃO O ESTOUROU: -60,56%. Chão que
  // perde três quintos do brilho não lê como molhado, lê como anoitecendo às
  // onze da manhã. "Escureceu" não é sinônimo de "acertou".
  veredito.push(
    `ESCURECEU DEMAIS: o descampado perdeu ${campo.quedaPorCento}% do brilho (${campo.seco} → ${campo.molhado}). Isso não é chuva, é noite. Faixa boa: 8% a 45%.`,
  )
} else if (caverna.erro) {
  veredito.push(
    `campo escureceu ${campo.quedaPorCento}% — mas SEM O CONTROLE DA CAVERNA (${caverna.erro}) isso não distingue "molhou o chão" de "apagou a luz da cena".`,
  )
} else if (Math.abs(caverna.quedaPorCento) > 1.5) {
  veredito.push(
    `⚠️ MOLHOU A CAVERNA: o fundo de caverna, onde não chega chuva, mudou ${caverna.quedaPorCento}% (${caverna.seco} → ${caverna.molhado}). A regra do céu não está segurando — está escurecendo a cena inteira, não molhando o que se molha.`,
  )
} else {
  veredito.push(
    `CHUVA MOLHA O QUE DEVE: descampado ${campo.seco} → ${campo.molhado} (−${campo.quedaPorCento}%), caverna ${caverna.seco} → ${caverna.molhado} (${caverna.quedaPorCento}%), ruído do par ${campo.ruidoPorCento}%.`,
  )
  // ⚠️ E O CAMPO GELADO É O TERCEIRO CONTROLE: lá cai NEVE, e neve não molha —
  // ela se acumula e CLAREIA. Se o gelo escurecer como o campo, é sinal de que
  // a neve entrou pelo caminho da chuva, e ninguém veria: no gelo tudo já é
  // branco demais pra denunciar 30% a menos de brilho.
  // ⚠️ E O MAR É O QUARTO CONTROLE, mas ao contrário dos outros ele mede
  // MUDANÇA, não ausência dela. Chuva que ignora a água é o que denuncia chuva
  // de mentira: o mar liso enquanto o chão da praia molha ao lado. A lâmina tem
  // que perder o espelho — e é a normal agitada que faz isso, não um brilho
  // somado por cima.
  const mar = medidas.mar || {}
  if (mar.erro) {
    veredito.push(`sem controle de água nesta semente: ${mar.erro}.`)
  } else if (Math.abs(mar.quedaPorCento) < 2) {
    veredito.push(
      `⚠️ A CHUVA NÃO TOCA A ÁGUA: o mar mediu ${mar.seco} seco e ${mar.molhado} na chuva (${mar.quedaPorCento}%). Superfície lisa sob temporal é o detalhe que derruba a ilusão.`,
    )
  } else {
    veredito.push(
      `a chuva agita a lâmina: mar ${mar.seco} → ${mar.molhado} (${mar.quedaPorCento}%), ruído do par ${mar.ruidoPorCento}%.`,
    )
  }
  const gelo = medidas.gelo || {}
  if (gelo.erro) {
    veredito.push(`sem controle de neve nesta semente: ${gelo.erro}.`)
  } else if (gelo.quedaPorCento > 8) {
    veredito.push(
      `⚠️ A NEVE ESTÁ MOLHANDO: o campo gelado escureceu ${gelo.quedaPorCento}% (${gelo.seco} → ${gelo.molhado}). Neve acumula e clareia; escurecer é a chuva entrando pelo caminho errado.`,
    )
  } else {
    veredito.push(
      `neve não molha, como deve: campo gelado ${gelo.seco} → ${gelo.molhado} (${gelo.quedaPorCento}%).`,
    )
  }
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
