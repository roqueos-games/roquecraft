//
// O FUNDO PERDE NITIDEZ ATRAVÉS DA LÂMINA?
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

const OUT = path.resolve('scripts/.qa-refracao')
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
  // ⚠️ PRAIA NÃO TEM LÂMINA FUNDA. A rodada anterior procurou 3 a 6 blocos na
  // praia e não achou nenhuma -- é praia, a água ali tem um palmo. O borrão de
  // refração só existe onde há coluna de água, então o lugar é o OCEANO, na
  // faixa em que o leito ainda aparece.
  if (!rc.gotoBiome('ocean')) return { erro: "gotoBiome('ocean') não achou oceano" }
  await rc.waitChunks(6)
  await new Promise((k) => setTimeout(k, 2400))
  rc.setTime(5200) // sol alto: o feixe atravessa a lâmina
  rc.setFx({ hand: false })

  const p = rc.state.player
  // Uma coluna de lâmina RASA -- 1 a 4 blocos -- com leito visível.
  let alvo = null
  for (let raio = 3; raio <= 60 && !alvo; raio += 1) {
    for (let a = 0; a < 24 && !alvo; a++) {
      const ang = (a / 24) * Math.PI * 2
      const x = p.x + Math.cos(ang) * raio
      const z = p.z + Math.sin(ang) * raio
      const d = rc.profundidadeAgua(x, z)
      // ⚠️ 3 a 6 BLOCOS, não 1. A primeira rodada aceitava lâmina de UM bloco e
      // caiu justamente nela -- e em um palmo de água o fundo é nítido mesmo,
      // por física. Medir o borrão ali é medir onde ele não deve existir.
      if (d >= 3 && d <= 8) alvo = { x, z, d }
    }
  }
  if (!alvo) return { erro: 'sem lâmina de 3 a 8 blocos num raio de 60' }

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

// ── Régua: ENERGIA DE GRADIENTE, que é nitidez medida ────────────────────────
//
// ⚠️ "Está mais borrado" é a coisa mais fácil do mundo de dizer olhando uma foto
// azul. Nitidez tem número: a soma de |∇luminância| numa região. Uma imagem
// nítida tem bordas fortes e gradiente alto; borrada tem gradiente baixo.
//
// E a comparação certa NÃO é "antes contra depois" -- é, na MESMA foto, o leito
// visto ATRAVÉS da água contra o chão SECO ao lado. Assim qualquer coisa que
// afete a foto inteira (nuvem, hora, exposição) afeta os dois lados e se
// cancela. O par de controle é espacial aqui porque, ao contrário da lava, os
// dois lados são a mesma areia sob a mesma luz -- só que um tem água em cima.
const L = (p, i) => 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2]

function nitidez(png, cx, cy, meia) {
  let soma = 0
  let n = 0
  for (let y = cy - meia; y <= cy + meia; y++) {
    if (y < 1 || y >= png.height - 1) continue
    for (let x = cx - meia; x <= cx + meia; x++) {
      if (x < 1 || x >= png.width - 1) continue
      const i = (png.width * y + x) << 2
      const dx = L(png, i + 4) - L(png, i - 4)
      const dy = L(png, i + (png.width << 2)) - L(png, i - (png.width << 2))
      soma += Math.abs(dx) + Math.abs(dy)
      n++
    }
  }
  return Number((soma / Math.max(1, n)).toFixed(3))
}

async function foto(nome, comRefracao) {
  // ⚠️ ONDA CONGELADA. Sem isso a deriva mata a medição: a distorção da
  // refração É a normal da onda, então enquanto a onda anda a nitidez do leito
  // anda junto. Duas fotos com o MESMO estado mediram 3,69 e 4,50 -- mais que a
  // diferença que eu queria medir. Com o relógio parado, o único que muda entre
  // as fotos é o botão da refração.
  await page.evaluate(async (v) => {
    window.__roquecraft.setFx({ refracao: v, congelarAgua: true, tempoDaAgua: 1000 })
    await new Promise((k) => setTimeout(k, 1400))
  }, comRefracao)
  const buf = await page.screenshot()
  fs.writeFileSync(path.join(OUT, `${nome}.png`), buf)
  return PNG.sync.read(buf)
}

// ⚠️ O CONTROLE DE VAZAMENTO SAIU DAQUI, E ISSO É UMA CORREÇÃO DE LUGAR.
//
// A primeira versão pedia, no mesmo quadro, o leito molhado E areia seca, para
// provar que o borrão não escapava pra fora d'água. Em praia não há lâmina
// funda; em mar aberto não há areia seca. Exigir os dois no mesmo quadro é
// exigir uma geografia que não existe.
//
// Mas a pergunta continua válida -- ela só não é uma pergunta de FOTO. "O ramo
// da refração só roda em face de água virada pra cima" é uma garantia de
// CÓDIGO, e ela virou asserção no teste de shader, onde não depende de achar o
// cenário certo. Aqui fica o que só a foto responde: a nitidez caiu?
const pontos = await page.evaluate(
  ({ x, z }) => {
    const s = window.__roquecraft.projetar(x, 61.5, z)
    return { molhado: s && s.frente ? { u: s.u, v: s.v } : null }
  },
  { x: cena.x, z: cena.z },
)
if (!pontos.molhado) {
  console.log(JSON.stringify({ erro: 'o leito não caiu no quadro', erros }, null, 2))
  await ctx.close()
  await b.close()
  servidor.close()
  process.exit(1)
}

const MEIA = 44
const comA = await foto('com-refracao', true)
const sem = await foto('sem-refracao', false)
const comB = await foto('com-refracao-2', true)
await page.evaluate(() => window.__roquecraft.setFx({ refracao: true, congelarAgua: false }))

const px = (p, t) => ({ x: Math.round(t.u * p.width), y: Math.round(t.v * p.height) })
const medir = (p) => ({
  molhado: nitidez(p, px(p, pontos.molhado).x, px(p, pontos.molhado).y, MEIA),
})
const mCom = medir(comA)
const mSem = medir(sem)
const mCom2 = medir(comB)

const veredito = []
const deriva = Math.abs(mCom.molhado - mCom2.molhado)
const quedaMolhado = mSem.molhado - mCom.molhado
if (deriva > quedaMolhado * 0.5) {
  veredito.push(
    `DERIVA: duas fotos COM refração medem ${mCom.molhado} e ${mCom2.molhado} de nitidez no molhado. A cena não está estável o bastante.`,
  )
} else if (quedaMolhado <= 0.4) {
  veredito.push(
    `SEM BORRÃO: o leito através da lâmina mede ${mCom.molhado} com refração e ${mSem.molhado} sem — não perdeu nitidez.`,
  )
} else {
  veredito.push(
    `o fundo borra através da lâmina: a nitidez do leito cai de ${mSem.molhado} para ${mCom.molhado} (−${quedaMolhado.toFixed(2)}), com deriva de ${deriva.toFixed(3)} entre duas fotos iguais.`,
  )
}
if (erros.length) veredito.push(`⚠️ ${erros.length} erro(s) de shader/WebGL no console.`)

const relatorio = {
  semente: SEMENTE,
  cena,
  pontos,
  comRefracao: mCom,
  semRefracao: mSem,
  repeticao: mCom2,
  veredito,
  erros,
}
fs.writeFileSync(path.join(OUT, 'relatorio.json'), JSON.stringify(relatorio, null, 2))
console.log(JSON.stringify(relatorio, null, 2))
await ctx.close()
await b.close()
servidor.close()
