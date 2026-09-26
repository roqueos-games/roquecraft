//
// O FILETE DE SOMBRA — de que lado a malha do chunk deve projetar.
//
// A queixa do founder, com print do iPhone: "a sombra dos blocos não considera o
// tamanho do bloco completo, vejo em diversos momentos só um filete de sombra".
// No print, uma parede de terra de dois blocos sobre neve plana não tem sombra
// NENHUMA no pé, e a sombra que existe está deslocada lá na frente.
//
// HIPÓTESE: a malha do chunk é CASCA ABERTA. `mesher.js` só emite face visível
// ("uma face é VISÍVEL quando o vizinho não a esconde"), então o terreno não tem
// face de baixo nem faces entre blocos vizinhos. Projetar sombra pela face de
// TRÁS (`shadowSide = BackSide`, que é o que o three 0.171 faz sozinho com
// material `FrontSide`) descarta a face de CIMA — que é justamente a superfície
// mais perto da luz, a que deveria escrever a profundidade. Sobra a lateral
// exposta, que vira um filete.
//
// Isso também explica por que ninguém tinha notado: a VEGETAÇÃO usa material
// `cutout` em `DoubleSide`, então a copa das árvores projeta certo. As fotos
// bonitas do jogo são cheias de sombra de folha, e a sombra de TERRENO some no
// meio delas. A cena que separa os dois casos é deserto: parede de pedra sobre
// areia plana, sem uma folha no enquadramento.
//
// A sonda fotografa o MESMO quadro com os três `shadowSide` e com dois valores
// de `normalBias`, porque a resposta não é só "qual lado": projetar pela face da
// frente traz de volta o risco de ACNE, que é exatamente o que o `normalBias`
// alto de antes escondia. Quem decide é a foto, não o raciocínio.
//
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const OUT = path.resolve('scripts/.qa-sombra-lado')
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })

const DIST = path.resolve('dist/pwa')
const SEMENTE = Number(process.argv[2] || 942457)

// 2300 ticks = 34,5° de elevação. Alto o bastante pro chão receber sol de
// verdade e baixo o bastante pra sombra de uma parede de dois blocos ter uns
// três blocos de comprimento — o tamanho que o founder diz não estar vendo.
const TICK = 2300

const FRONT = 0
const BACK = 1
const DOUBLE = 2
const NOME_DO_LADO = { 0: 'front', 1: 'back', 2: 'double' }

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
await page.evaluate(async () => {
  window.__roquecraft.setQuality('ultra')
  await new Promise((r) => setTimeout(r, 2500))
  window.__rosStore?.maximizeWindow?.('roquecraft')
  await new Promise((r) => setTimeout(r, 900))
})
await page.addStyleTag({ content: '.ros-roquecraft__play { display: none !important }' })
await page.waitForTimeout(500)

const chegada = await page.evaluate(async (tick) => {
  const rc = window.__roquecraft
  if (!rc.gotoBiome('desert')) return { erro: 'gotoBiome(desert) não achou o bioma' }
  await rc.waitChunks(6)
  await new Promise((k) => setTimeout(k, 2400))
  rc.setTime(tick)
  rc.setFx({ hand: false })

  // ⚠️ A MIRA TEM QUE VIR DO SOL, não do enquadramento herdado da sonda do
  // olho. A primeira rodada desta sonda usou `look(0.6, -0.12)` e as sombras
  // caíram ATRÁS dos degraus, escondidas da câmera: seis fotos que não podiam
  // responder à pergunta. Olhando NA direção do sol, a sombra vem em direção à
  // câmera e o pé do bloco fica à vista.
  const ang = ((tick % 24000) / 24000) * Math.PI * 2
  const sol = { x: Math.cos(ang) * 0.94, y: Math.sin(ang), z: Math.cos(ang) * 0.34 }
  const yaw = Math.atan2(sol.x, -sol.z)

  // O sinal do pitch neste jogo já custou quatro fotos erradas, então ele é
  // DESCOBERTO: varre-se o intervalo e pergunta-se à câmera (`projetar`) qual
  // valor põe o chão a 8 blocos na altura certa da tela.
  const quadro = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  const p = rc.state.player
  // `groundBelow` mora em `debug`, não em `state` — pedi no lugar errado e a
  // sonda projetou `undefined`, virou NaN e ela se RECUSOU a fotografar. Foi o
  // comportamento certo: melhor errar em voz alta que fotografar o céu.
  const chao = rc.debug?.groundBelow ?? Math.floor(p.y) - 2
  const alvo = { x: p.x + Math.sin(yaw) * 8, y: chao + 1, z: p.z - Math.cos(yaw) * 8 }
  let melhor = null
  for (let pit = -0.7; pit <= 0.7001; pit += 0.05) {
    rc.look(yaw, pit)
    await quadro()
    const s = rc.projetar(alvo.x, alvo.y, alvo.z)
    if (!s || !s.frente) continue
    const err = Math.abs(s.v - 0.62) + Math.abs(s.u - 0.5)
    if (!melhor || err < melhor.err) melhor = { pit, err, u: s.u, v: s.v }
  }
  if (!melhor) return { erro: 'nenhum pitch pôs o chão em tela - não dá pra julgar sombra assim' }
  rc.look(yaw, melhor.pit)
  await new Promise((k) => setTimeout(k, 1400))
  return {
    x: Math.round(p.x),
    z: Math.round(p.z),
    bioma: rc.state.biome,
    yaw: Number(yaw.toFixed(3)),
    pitch: Number(melhor.pit.toFixed(2)),
    alvoNaTela: { u: Number(melhor.u.toFixed(3)), v: Number(melhor.v.toFixed(3)) },
    elevacaoDoSol: Number(((Math.asin(sol.y) * 180) / Math.PI).toFixed(1)),
  }
}, TICK)
if (chegada.erro) {
  console.log(JSON.stringify({ erro: chegada.erro }))
  await ctx.close()
  await b.close()
  servidor.close()
  process.exit(1)
}

const fotos = []
async function tirar(nome, params) {
  const vivo = await page.evaluate(
    async ({ params, tick }) => {
      const rc = window.__roquecraft
      rc.setTime(tick)
      const s = rc.sombraQA(params)
      await new Promise((r) => setTimeout(r, 2000))
      return s
    },
    { params, tick: TICK },
  )
  fs.writeFileSync(path.join(OUT, `${nome}.png`), await page.screenshot())
  fotos.push({ nome, vivo })
}

// O grid. `back` com 0,02 é o estado que subi hoje; `back` com 0,055 é o de
// ontem; o resto é a hipótese sendo testada.
for (const lado of [BACK, FRONT, DOUBLE]) {
  for (const nb of [0.02, 0.055]) {
    await tirar(`${NOME_DO_LADO[lado]}-nb${String(nb).replace('.', '')}`, {
      lado,
      normalBias: nb,
      bias: 0,
      radius: 2,
    })
  }
}
// Volta pro estado do bundle antes de fechar, pra sonda não deixar o jogo num
// estado que ela mesma inventou.
await page.evaluate(() => window.__roquecraft.sombraQA({ lado: 1, normalBias: 0.02, bias: 0 }))

console.log(JSON.stringify({ onde: chegada, saida: OUT, fotos, erros }, null, 2))
await ctx.close()
await b.close()
servidor.close()
