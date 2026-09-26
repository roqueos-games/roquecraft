//
// A ÁGUA ESCORRENDO SE MEXE? — a face VERTICAL, não a superfície.
//
// "a agua escorrendo esta horrivel e mal feita" — founder, 25/08/2026. Não era
// animação feia: era animação NENHUMA. Toda a onda deste shader é função de
// vWorldPos.xz, e numa parede de água o xz é constante ao longo da face inteira.
//
// ⚠️ O CONTROLE É NO TEMPO, não no espaço. Na rodada da lava eu queimei duas
// tentativas com controle espacial: a janela "de pedra" ao lado da lava estava
// medindo a própria lava (por luz emissiva e por conter lava), e "esperar a cena
// parar" nunca convergiu numa caverna que continua sendo malhada. O que funciona
// é fotografar a MESMA janela com o relógio da água andando e congelado
// (`congelarAgua`): o que quer que se mexa na cena se mexe igual nas duas
// condições e se cancela.
//
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const OUT = path.resolve('scripts/.qa-queda')
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

// ── Achar uma PAREDE de água: coluna com água e ar ao lado ──────────────────
const cena = await page.evaluate(async () => {
  const rc = window.__roquecraft
  if (!rc.gotoBiome('ocean')) return { erro: "gotoBiome('ocean') não achou oceano" }
  await rc.waitChunks(6)
  await new Promise((k) => setTimeout(k, 2400))
  rc.setTime(4000)
  rc.setFx({ hand: false })

  // ⚠️ ESTE MUNDO NÃO GERA CACHOEIRA NENHUMA, e isso foi MEDIDO antes de eu
  // construir uma. Varri cinco biomas -- planície, floresta, montanha, pântano
  // e selva -- somando 1.297 células de água, e em NENHUMA delas havia ar como
  // vizinho lateral na mesma altura. O oceano enche até o nível do mar e a
  // margem sobe sólida; face vertical de água exposta simplesmente não existe
  // no worldgen.
  //
  // Ou seja: a água escorrendo que o founder viu não veio do mundo, veio do
  // BALDE -- água que ele colocou e viu espalhar e cair. Então é essa que a
  // sonda tem que montar. O aviso de 22/08 sobre cena construída continua
  // valendo (a piscina de 12 mil edições que não sobreviveu ao recarregamento),
  // e é por isso que esta cena é MINÚSCULA: um pilar oco e uma fonte no topo.
  const p = rc.state.player
  const bx = Math.floor(p.x) + 6
  const bz = Math.floor(p.z)
  const chao = rc.debug?.groundBelow ?? Math.floor(p.y) - 2
  const topo = chao + 9
  // Uma parede de pedra e uma fonte de água em cima dela: a água cai pela face
  // livre e é essa face que se quer medir.
  rc.fill(bx - 3, chao + 1, bz - 3, bx + 3, topo + 3, bz + 3, 'air')
  rc.fill(bx, chao + 1, bz - 2, bx, topo, bz + 2, 'stone')
  rc.fill(bx, topo + 1, bz - 1, bx, topo + 1, bz + 1, 'water')
  // ⚠️ ESPERAR RELÓGIO DE PAREDE FOI O ERRO, e ele me fez publicar um achado
  // FALSO. A primeira versão desta sonda dormia segundos esperando a água
  // descer, media dois blocos molhados e concluiu que "água colocada não cai" --
  // e eu escrevi isso num commit como se fosse defeito do jogo.
  //
  // Não é. A fila de atualização drena por TIQUE, com limite por lote, e ao
  // entrar num mundo recém-carregado ela já vem com mais de mil células
  // pendentes. Somando o throttle de requestAnimationFrame no headless, dormir
  // não faz a fila andar o suficiente. O gancho `escoarFluidos` existe
  // exatamente pra isso: ele roda a fila até convergir e devolve em quantos
  // tiques. Com ele, a queda desce a parede inteira em 117 tiques, sem sobrar
  // nada na fila.
  const escoou = rc.escoarFluidos(600)
  await new Promise((k) => setTimeout(k, 400))

  // Confere que a queda ACONTECEU. Sem isto a sonda fotografaria uma parede de
  // pedra seca e mediria a imobilidade dela.
  // ⚠️ `blocoEm` SÓ DEVOLVE 'water' PARA A FONTE. Água caindo e água escorrendo
  // são outros ids, com outra chave -- só um bloco em `blocks.js` tem
  // `key: 'water'`. Medindo por chave, a sonda contou ZERO numa parede que
  // estava molhada de cima a baixo. Quem sabe responder é `nivelDeAguaEm`:
  // -1 fora d'água, 0 fonte, 1..7 escorrendo, 8 caindo.
  let alturaMolhada = 0
  for (let y = topo; y > chao; y--) {
    if (rc.nivelDeAguaEm(bx - 1, y, bz) >= 0) alturaMolhada++
  }
  if (alturaMolhada < 3) {
    return {
      erro: `a água não desceu pela parede (só ${alturaMolhada} bloco molhado em ${topo - chao}). Sem queda não há o que medir.`,
    }
  }
  const achado = { x: bx - 1, y: topo - 2, z: bz, ar: { dx: -1, dz: 0 }, altura: alturaMolhada }
  const peneira = { construida: true, alturaMolhada, escoou }

  // Câmera no lado do ar, olhando pra parede.
  const cx = achado.x + 0.5 + achado.ar.dx * 4.5
  const cz = achado.z + 0.5
  rc.setFlying(true)
  rc.teleport(cx, achado.y + 0.9, cz)
  await new Promise((k) => setTimeout(k, 1600))
  const quadro = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  const alvo = { x: achado.x + 0.5, y: achado.y + 0.9, z: achado.z + 0.5 }
  let melhor = null
  const baseYaw = Math.atan2(alvo.x - cx, -(alvo.z - cz))
  for (let pit = -0.8; pit <= 0.8001; pit += 0.05) {
    rc.look(baseYaw, pit)
    await quadro()
    const s = rc.projetar(alvo.x, alvo.y, alvo.z)
    if (!s || !s.frente) continue
    const err = Math.abs(s.u - 0.5) + Math.abs(s.v - 0.5)
    if (!melhor || err < melhor.err) melhor = { pit, err, u: s.u, v: s.v }
  }
  if (!melhor || melhor.err > 0.12) {
    return { erro: `não enquadrei a parede (erro de mira ${melhor ? melhor.err.toFixed(2) : '—'})` }
  }
  rc.look(baseYaw, melhor.pit)
  await new Promise((k) => setTimeout(k, 1400))
  return { ...achado, peneira, tela: { u: melhor.u, v: melhor.v } }
})
if (cena.erro) {
  console.log(JSON.stringify({ erro: cena.erro, erros }, null, 2))
  await ctx.close()
  await b.close()
  servidor.close()
  process.exit(1)
}

const JANELA = 40
const L = (p, i) => 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2]

function mudanca(bufA, bufB, tela) {
  const A = PNG.sync.read(bufA)
  const B = PNG.sync.read(bufB)
  const cx = Math.round(tela.u * A.width)
  const cy = Math.round(tela.v * A.height)
  let soma = 0
  let n = 0
  for (let y = cy - JANELA; y <= cy + JANELA; y++) {
    if (y < 0 || y >= A.height) continue
    for (let x = cx - JANELA; x <= cx + JANELA; x++) {
      if (x < 0 || x >= A.width) continue
      const i = (A.width * y + x) << 2
      soma += Math.abs(L(A, i) - L(B, i))
      n++
    }
  }
  return Number((soma / Math.max(1, n)).toFixed(3))
}

async function foto(nome) {
  const buf = await page.screenshot()
  fs.writeFileSync(path.join(OUT, `${nome}.png`), buf)
  return buf
}

async function par(congelada) {
  await page.evaluate((v) => window.__roquecraft.setFx({ congelarAgua: v }), congelada)
  await page.waitForTimeout(700)
  const a = await foto(congelada ? 'congelada-a' : 'correndo-a')
  await page.waitForTimeout(900)
  const b = await foto(congelada ? 'congelada-b' : 'correndo-b')
  return mudanca(a, b, cena.tela)
}

const correndo = [await par(false), await par(false)]
const congelada = [await par(true), await par(true)]
await page.evaluate(() => window.__roquecraft.setFx({ congelarAgua: false }))

const med = (a) => a.reduce((x, y) => x + y, 0) / a.length
const mCorrendo = med(correndo)
const mCongelada = med(congelada)
const ganho = mCorrendo - mCongelada

const veredito = []
if (mCongelada > 0.9) {
  veredito.push(
    `CENA INQUIETA: com o relógio da água congelado a janela ainda muda ${mCongelada.toFixed(2)}. Há outra fonte de movimento e o veredito não é confiável.`,
  )
} else if (ganho < 0.3) {
  veredito.push(
    `PAREDE PARADA: ${mCorrendo.toFixed(2)} correndo contra ${mCongelada.toFixed(2)} congelada — ligar o relógio não muda a face vertical.`,
  )
} else {
  veredito.push(
    `a face vertical se move: a MESMA janela muda ${mCorrendo.toFixed(2)} com o relógio da água andando e ${mCongelada.toFixed(2)} com ele congelado.`,
  )
}
if (erros.length) veredito.push(`⚠️ ${erros.length} erro(s) de shader/WebGL no console.`)

const relatorio = {
  semente: SEMENTE,
  cena,
  correndo,
  congelada,
  mCorrendo,
  mCongelada,
  veredito,
  erros,
}
fs.writeFileSync(path.join(OUT, 'relatorio.json'), JSON.stringify(relatorio, null, 2))
console.log(JSON.stringify(relatorio, null, 2))
await ctx.close()
await b.close()
servidor.close()
