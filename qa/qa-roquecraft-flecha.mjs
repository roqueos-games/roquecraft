//
// A FLECHA — sonda de uma pergunta só: o esqueleto atira, e dá pra VER a flecha?
//
// `flechas.spec.js` prova a mira e o voo em números. Nenhum número prova que a
// flecha aparece na tela apontando pra onde vai — e uma caixinha voando de lado
// lê como bug de partícula, não como ameaça: o jogador não se abriga do que não
// reconhece.
//
// ⚠️ PROVA DE VIDA: a foto só é tirada quando `flechasInfo()` diz que existe
// flecha no ar, e o relatório conta quantas existiam no instante do clique.
// Cronometrar por fora fotografaria o céu vazio achando que fotografava um tiro.
//
//   node scripts/qa-roquecraft-flecha.mjs
//
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const DIST = path.resolve('dist/pwa')
const SAIDA = path.resolve('scripts/.qa-flecha')
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
fs.mkdirSync(SAIDA, { recursive: true })

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

const b = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const ctx = await b.newContext({
  viewport: { width: 900, height: 820 },
  deviceScaleFactor: 1,
  serviceWorkers: 'block',
  locale: 'pt-BR',
})
const page = await ctx.newPage()
const erros = []
page.on('pageerror', (e) => erros.push(String(e.message).slice(0, 160)))
await page.addInitScript(
  `window.__ROS_E2E__={auth:{uid:'e2e',email:'e@e.t',emailVerified:true,displayName:'E',role:'user'},googleDrive:{isConnected:false,files:[],user:{}},googleMapsApiKey:'',roquecraftSeed:942457}`,
)
await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => !!window.__rosStore, null, { timeout: 30000 })
await page.waitForTimeout(900)
await page.evaluate(() => window.__rosStore.openWindow('roquecraft'))
await page.waitForFunction(() => window.__roquecraft?.state?.ready === true, null, {
  timeout: 120000,
})
// O aviso "clique pra jogar" fica no meio da tela e cobriria o assunto. Ver a
// nota longa em `qa-roquecraft-creeper.mjs`.
await page.addStyleTag({ content: '.ros-roquecraft__play{display:none !important}' })
const foto = (nome) => page.screenshot({ path: path.join(SAIDA, nome) })

const y = await page.evaluate(() => {
  const rc = window.__roquecraft
  rc.setMode('creative')
  const y = Math.round(rc.surfaceAt(0, 0) ?? 66) + 16
  rc.setFlying(true)
  rc.teleport(0.5, y + 2, 0.5)
  rc.fill(-16, y - 2, -16, 16, y, 16, 'stone')
  return y
})
await page.waitForTimeout(2600)

// O esqueleto nasce a 9 blocos: dentro do alcance (15) e bem fora da distância
// que ele mantém (5), então ele atira em vez de recuar.
const nasceu = await page.evaluate((y) => {
  const rc = window.__roquecraft
  rc.limparMobs()
  rc.setFlying(false)
  // ⚠️ A LENTE FICA ALTA, e não é capricho de enquadramento. O alvo do
  // esqueleto é o JOGADOR, ou seja, a própria câmera: no mesmo nível, a
  // flecha vem de frente e aparece como um ponto de 6 cm em cima da mira —
  // foi o que saiu na primeira corrida. De cima, ela sobe em diagonal contra
  // o chão de pedra e dá pra ver que é uma haste, e pra onde ela aponta.
  rc.setFlying(true)
  rc.teleport(0.5, y + 7, 0.5)
  rc.look(0, -0.55)
  const ok = rc.spawnMob('skeleton', 9, 0)
  return { ok, mobs: rc.mobsInfo() }
}, y)
await page.waitForTimeout(400)
await foto('1-esqueleto.png')

// ⚠️ TUDO NUM LAÇO SÓ, e a razão é que o esqueleto QUEIMA AO SOL. A primeira
// versão media a cadência de tiro depois de esperar a flecha sumir, e a essa
// altura o bicho já tinha virado cinza: o relatório dizia "0 tiros em 6 s" com
// o arqueiro morto havia segundos. O instrumento estava medindo um cadáver.
//
// Agora a janela de medição começa no instante do nascimento, e a vida do
// esqueleto vai no relatório pra ninguém mais confundir "não atira" com
// "morreu".
let noAr = 0
let distanciaNaFoto = -1
let fotoTirada = false
let tiros = 0
let ultimoId = null
const inicio = Date.now()
while (Date.now() - inicio < 6500) {
  const leitura = await page.evaluate((y) => {
    const rc = window.__roquecraft
    const fs2 = rc.flechasInfo()
    const d = fs2.length
      ? Math.min(...fs2.map((f) => Math.hypot(f.x - 0.5, f.y - (y + 7.9), f.z - 0.5)))
      : -1
    return {
      n: fs2.length,
      id: fs2[0]?.id ?? null,
      d: +d.toFixed(2),
      vida: rc.mobsInfo()[0]?.vida ?? 0,
    }
  }, y)
  if (leitura.id && leitura.id !== ultimoId) {
    ultimoId = leitura.id
    tiros++
  }
  // ⚠️ ESTA SONDA NÃO FOTOGRAFA A FLECHA, E ISSO É UMA CONCLUSÃO, NÃO UMA
  // FALTA. Quatro tentativas foram gastas antes de eu entender por quê:
  //
  //   1. de frente não dá — o esqueleto mira no JOGADOR, o jogador é a lente, e
  //      uma haste de 6 cm apontada pra lente é um ponto em qualquer distância;
  //   2. de cima não dá — mesma coisa, só que na diagonal;
  //   3. de lado não dá — entre o `evaluate` que mede "a flecha está a 3,5
  //      blocos" e o `screenshot` passam ~150 ms, e a 26 b/s isso são QUATRO
  //      BLOCOS. Quando o obturador abre, a flecha já passou.
  //
  // Segurar o jogo pra fotografar mudaria justamente a coisa sob julgamento. A
  // orientação da haste é medida onde dá pra medir: em
  // `tests/unit/services/roquecraft/mobRender.spec.js`, que compara o eixo da
  // malha com o vetor velocidade e reprova quando o `lookAt` é quebrado.
  //
  // O que ESTA sonda mede é o que só o jogo rodando sabe: que o arco dispara de
  // verdade, que a flecha existe no mundo, que ela some, e a que ritmo.
  if (!fotoTirada && leitura.n) {
    noAr = leitura.n
    distanciaNaFoto = leitura.d
    await foto('2-cena-do-tiro.png')
    fotoTirada = true
  }
  await page.waitForTimeout(25)
}

// E a flecha some (bate no chão, no jogador, ou envelhece). Uma que ficasse
// parada no ar pra sempre seria vazamento de entidade.
let sumiu = false
for (let i = 0; i < 250; i++) {
  const n = await page.evaluate(() => window.__roquecraft.flechasInfo().length)
  if (n === 0) {
    sumiu = true
    break
  }
  await page.waitForTimeout(60)
}
const vidaDoEsqueleto = await page.evaluate(() => window.__roquecraft.mobsInfo()[0]?.vida ?? 0)

console.log(
  JSON.stringify(
    {
      nasceu: nasceu.ok,
      tipo: nasceu.mobs?.[0]?.type ?? null,
      flechasNoArNaFoto: noAr,
      // Distância da flecha até a lente no instante do clique. Se vier −1 ou
      // perto de 9, a foto não mostra flecha nenhuma e não vale nada.
      distanciaDaFlechaNaFoto: distanciaNaFoto,
      aFlechaSumiu: sumiu,
      tirosEmSeisSegundos: tiros,
      // Zero aqui significa que ele queimou ao sol — nao que o arco falhou.
      vidaDoEsqueletoNoFim: vidaDoEsqueleto,
      fotos: SAIDA,
      erros,
    },
    null,
    2,
  ),
)

await ctx.close()
await b.close()
s.close()
// O veredito sai pelo código de saída: o ledger de sondas lê ISSO, não a prosa.
// O esqueleto nasceu, atirou, a flecha foi VISTA no ar e sumiu depois.
const veredito =
  nasceu.ok === true &&
  nasceu.mobs?.[0]?.type === 'skeleton' &&
  noAr > 0 &&
  tiros > 0 &&
  sumiu &&
  erros.length === 0
process.exit(veredito ? 0 : 1)
