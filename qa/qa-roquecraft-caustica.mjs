//
// A CÁUSTICA VEM DA ONDA, OU É OUTRO PADRÃO?
//
// "precisamos de efeito de reflexo do sol nas ondas da agua para dentro da
// agua" — founder. Metade já existia: havia cáustica no leito desde agosto. O
// que não existia era a LIGAÇÃO — ela vinha de três senos próprios, sem relação
// nenhuma com a onda que a superfície desenha.
//
// ⚠️ COMO SE MEDE ISSO SEM SE ENGANAR. "A cáustica está mais bonita" não é
// medição, e "ela se mexe" também não prova nada: o padrão antigo se mexia. O
// que separa uma coisa da outra é se ela se mexe JUNTO com a onda.
//
// Então a régua é: congelar o relógio da água num instante A, fotografar; mudar
// para um instante B, fotografar. Se a cáustica é filha da onda, o mapa de luz
// no leito muda entre A e B EXATAMENTE porque a onda mudou -- e a prova de vida
// é que ele fique IGUAL quando o relógio não muda. É o mesmo A/B no tempo que
// fechou a lava e a queda, com um par de controle a mais: dois instantes
// diferentes têm que dar quadros diferentes, e o mesmo instante duas vezes tem
// que dar quadros iguais.
//
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const OUT = path.resolve('scripts/.qa-caustica')
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })

const DIST = path.resolve('dist/pwa')
const SEMENTE = Number(process.argv[2] || 942457)

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
page.on('console', (m) => {
  const t = m.text()
  if (/Shader|WebGL|INVALID|context lost/i.test(t)) erros.push(t.slice(0, 200))
})
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
await page.evaluate(async () => {
  window.__roquecraft.setQuality('ultra')
  await new Promise((r) => setTimeout(r, 2600))
  window.__rosStore?.maximizeWindow?.('roquecraft')
  await new Promise((r) => setTimeout(r, 900))
})
await page.addStyleTag({ content: '.ros-roquecraft__play { display: none !important }' })
await page.waitForTimeout(500)

// Leito RASO iluminado: a cáustica só existe nos 6 primeiros blocos de
// profundidade, e só de dia. Praia é o lugar.
const cena = await page.evaluate(async () => {
  const rc = window.__roquecraft
  if (!rc.gotoBiome('beach')) return { erro: "gotoBiome('beach') não achou praia" }
  await rc.waitChunks(6)
  await new Promise((k) => setTimeout(k, 2400))
  rc.setTime(5200) // sol alto: o feixe atravessa a lâmina
  rc.setFx({ hand: false })

  const p = rc.state.player
  // Uma coluna de lâmina RASA -- 1 a 4 blocos -- com leito visível.
  let alvo = null
  for (let raio = 3; raio <= 40 && !alvo; raio += 1) {
    for (let a = 0; a < 24 && !alvo; a++) {
      const ang = (a / 24) * Math.PI * 2
      const x = p.x + Math.cos(ang) * raio
      const z = p.z + Math.sin(ang) * raio
      const d = rc.profundidadeAgua(x, z)
      if (d >= 1 && d <= 4) alvo = { x, z, d }
    }
  }
  if (!alvo) return { erro: 'sem lâmina rasa (1 a 4 blocos) num raio de 40' }

  // Olhando de CIMA pra dentro: é assim que a malha de luz no leito aparece.
  rc.setFlying(true)
  rc.teleport(alvo.x, 74, alvo.z)
  await new Promise((k) => setTimeout(k, 1600))
  const quadro = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  let melhor = null
  for (let pit = -1.5; pit <= 1.5001; pit += 0.05) {
    rc.look(0.5, pit)
    await quadro()
    const s = rc.projetar(alvo.x, 61, alvo.z)
    if (!s || !s.frente) continue
    const err = Math.abs(s.u - 0.5) + Math.abs(s.v - 0.5)
    if (!melhor || err < melhor.err) melhor = { pit, err }
  }
  if (!melhor) return { erro: 'não consegui olhar pro leito' }
  rc.look(0.5, melhor.pit)
  await new Promise((k) => setTimeout(k, 1400))
  return { ...alvo, pitch: melhor.pit, bioma: rc.state.biome }
})
if (cena.erro) {
  console.log(JSON.stringify({ erro: cena.erro, erros }, null, 2))
  await ctx.close()
  await b.close()
  servidor.close()
  process.exit(1)
}

// ── Régua: o leito muda quando a ONDA muda, com o relógio parado ────────────
//
// Este é o teste decisivo, e ele é melhor que comparar dois instantes: com o
// relógio da água CONGELADO, troca-se o ESPECTRO da onda. Uma cáustica que sai
// da onda tem que mudar; a cáustica antiga -- três senos próprios -- não mudaria
// um pixel, porque ela não sabe que a onda existe.
const RECORTE = { x0: 340, x1: 940, y0: 220, y1: 520 }
const L = (p, i) => 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2]

function diferenca(bufA, bufB) {
  const A = PNG.sync.read(bufA)
  const B = PNG.sync.read(bufB)
  let soma = 0
  let n = 0
  for (let y = RECORTE.y0; y < RECORTE.y1; y++) {
    for (let x = RECORTE.x0; x < RECORTE.x1; x++) {
      const i = (A.width * y + x) << 2
      soma += Math.abs(L(A, i) - L(B, i))
      n++
    }
  }
  return Number((soma / Math.max(1, n)).toFixed(3))
}

async function foto(nome, esp) {
  await page.evaluate(
    async ({ esp }) => {
      const rc = window.__roquecraft
      rc.setFx({ congelarAgua: true, tempoDaAgua: 1000 })
      rc.ondaQA(esp)
      await new Promise((k) => setTimeout(k, 1300))
    },
    { esp },
  )
  const buf = await page.screenshot()
  fs.writeFileSync(path.join(OUT, `${nome}.png`), buf)
  return buf
}

const ESPECTRO_A = { octavas: 8, lacunaridade: 1.37, persistencia: 0.62, L: 13 }
const ESPECTRO_B = { octavas: 8, lacunaridade: 1.9, persistencia: 0.4, L: 6 }

const a1 = await foto('espectro-a', ESPECTRO_A)
const bb = await foto('espectro-b', ESPECTRO_B)
const a2 = await foto('espectro-a-2', ESPECTRO_A)
await page.evaluate((e) => {
  window.__roquecraft.ondaQA(e)
  window.__roquecraft.setFx({ congelarAgua: false })
}, ESPECTRO_A)

const sinal = diferenca(a1, bb)
const ruido = diferenca(a1, a2)

const veredito = []
// ⚠️ O PORTÃO ABSOLUTO ERA ARBITRÁRIO e quase custou uma conclusão boa: eu
// tinha posto 0,25 de cabeça, o ruído mediu 0,268 e o veredito travou num sinal
// que era DEZ VEZES maior. O ruído aqui tem origem conhecida: `congelarAgua`
// para o relógio do material de voxel, não o do CÉU -- a nuvem continua andando
// e mexe de leve na luz que chega ao leito.
//
// Quem decide se a cena está estável o bastante não é um número que eu escolhi,
// é a RAZÃO entre ruído e sinal, e o teste logo abaixo já exige 4×. O portão
// absoluto fica só como piso de sanidade, num valor em que ele significa
// "alguma coisa está muito errada" em vez de "o céu se mexeu".
if (ruido > 1.5) {
  veredito.push(
    `CENA INSTÁVEL: duas fotos do MESMO espectro e do MESMO instante diferem ${ruido}. Isso é grande demais pra ser nuvem; o congelamento não está segurando.`,
  )
} else if (sinal <= ruido * 4 + 0.2) {
  veredito.push(
    `A CÁUSTICA NÃO VEM DA ONDA: trocar o espectro da onda com o relógio parado muda o leito em ${sinal}, contra ${ruido} de ruído. Ela continua sendo um padrão paralelo.`,
  )
} else {
  veredito.push(
    `a cáustica é filha da onda: com o relógio da água PARADO, trocar só o espectro da onda muda o leito em ${sinal}, contra ${ruido} entre duas fotos do mesmo espectro.`,
  )
}
if (erros.length) veredito.push(`⚠️ ${erros.length} erro(s) de shader/WebGL no console.`)

const relatorio = { semente: SEMENTE, cena, sinal, ruido, veredito, erros }
fs.writeFileSync(path.join(OUT, 'relatorio.json'), JSON.stringify(relatorio, null, 2))
console.log(JSON.stringify(relatorio, null, 2))
await ctx.close()
await b.close()
servidor.close()
