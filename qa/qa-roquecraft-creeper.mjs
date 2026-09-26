//
// O CREEPER — sonda de uma pergunta só: ele lê como creeper, e ele deixa buraco?
//
// Um teste puro prova o pavio (`creeper.spec.js`) e outro prova o formato do
// buraco (`explosao.spec.js`). Nenhum dos dois prova que o bicho aparece na tela
// parecendo um creeper, nem que o buraco chega ao MUNDO — entre a regra e o
// mundo há o componente, e é lá que o `applyEdit` some.
//
// ⚠️ PROVA DE VIDA, em três lugares:
//   1. a coluna é medida ANTES e DEPOIS; sem o "antes" cheio, um "depois" vazio
//      não significa explosão — significa que nunca teve bloco ali;
//   2. a foto do pavio só é tirada quando `mobsInfo().pavio` passa do limiar,
//      lido do jogo; adivinhar o instante fotografaria um creeper calmo achando
//      que era um aceso;
//   3. a contagem de criaturas cai de 1 pra 0 — se ficasse em 1, o que quer que
//      tenha acontecido não foi o creeper estourando.
//
//   node scripts/qa-roquecraft-creeper.mjs
//
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const DIST = path.resolve('dist/pwa')
const SAIDA = path.resolve('scripts/.qa-creeper')
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
  // ⚠️ JANELA ALTA DE PROPÓSITO. Na primeira corrida ela tinha 620 px e a doca
  // do sistema comeu o terço de baixo do quadro: o creeper aceso ficou ATRÁS da
  // doca e a foto que devia julgar o inchaço não mostrava o bicho. A sonda
  // dizia "verde" com a evidência escondida.
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

// ⚠️ O AVISO "CLIQUE PRA JOGAR" SAI DA FRENTE. Sem bloqueio de ponteiro (que o
// Chromium sem cabeça não concede), o botão fica no MEIO da tela — exatamente
// onde o creeper aparece. Na primeira corrida ele cobriu o bicho inteiro e a
// foto que devia julgar o modelo mostrava um retângulo cinza.
//
// Esconder um overlay de interface não é maquiar o assunto: o que está sob
// julgamento aqui é a criatura, e nada do mundo 3D é tocado. Se um dia o
// assunto for a interface, esta linha sai.
await page.addStyleTag({ content: '.ros-roquecraft__play{display:none !important}' })

const foto = (nome) => page.screenshot({ path: path.join(SAIDA, nome) })

// 1. Palco: uma laje de pedra plana, pra o buraco ser legível na foto e a
//    medição da coluna não depender do relevo que a semente calhou de dar.
const y = await page.evaluate(() => {
  const rc = window.__roquecraft
  rc.setMode('creative')
  const y = Math.round(rc.surfaceAt(0, 0) ?? 66) + 16
  rc.setFlying(true)
  rc.teleport(0.5, y + 2, 0.5)
  rc.fill(-12, y - 3, -12, 12, y, 12, 'stone')
  return y
})
await page.waitForTimeout(2600)

// 2. O jogador fica EM PÉ na laje, olhando quase na horizontal, e o creeper
//    nasce a 3,2 blocos — logo fora do pavio (3) e dentro da perseguição.
//
//    ⚠️ A CÂMERA NÃO SE MEXE DAQUI EM DIANTE. A primeira versão usava
//    `frameMobs` e o creeper vinha andando até ficar debaixo da lente: as duas
//    fotos saíam de distâncias diferentes e não dava pra comparar calmo com
//    aceso. Câmera parada é o que transforma as duas fotos num PAR DE CONTROLE.
const nasceu = await page.evaluate((y) => {
  const rc = window.__roquecraft
  rc.limparMobs()
  rc.setFlying(false)
  rc.teleport(0.5, y + 1, 0.5)
  rc.look(0, -0.12)
  // ⚠️ 5 BLOCOS, NÃO 3,2. Com 3,2 o bicho andava os 20 cm que faltavam em
  // menos de um quinto de segundo e a foto "calma" já saía com o pavio aceso:
  // as duas fotos do par de controle mostravam a MESMA coisa, e eu passei uma
  // corrida achando que o modelo era um retângulo branco.
  const ok = rc.spawnMob('creeper', 5, 0)
  return { ok, mobs: rc.mobsInfo() }
}, y)
await page.waitForTimeout(250)
const pavioNaFotoCalma = await page.evaluate(() => window.__roquecraft.mobsInfo()[0]?.pavio ?? -1)
await foto('1-creeper-calmo.png')

// 3. Espera o pavio passar de 60% e fotografa o bicho inchado e piscando.
//    O limiar é lido do JOGO, não cronometrado por fora.
let pavioVisto = 0
for (let i = 0; i < 160; i++) {
  const p = await page.evaluate(() => {
    const m = window.__roquecraft.mobsInfo()[0]
    return m ? m.pavio : -1
  })
  if (p < 0) break
  pavioVisto = Math.max(pavioVisto, p)
  if (p >= 0.6) break
  await page.waitForTimeout(50)
}
await foto('2-creeper-pavio.png')

// 4. Coluna ANTES: é a prova de vida do buraco.
const alvo = await page.evaluate(() => {
  const m = window.__roquecraft.mobsInfo()[0]
  return m ? { x: m.x, y: m.y, z: m.z } : null
})
const antes = alvo
  ? await page.evaluate(
      ([x, z, de, ate]) => window.__roquecraft.colunaEm(x, z, de, ate),
      [alvo.x, alvo.z, y - 3, y + 1],
    )
  : null

// 5. Deixa estourar.
await page.waitForTimeout(2200)
const depois = alvo
  ? await page.evaluate(
      ([x, z, de, ate]) => window.__roquecraft.colunaEm(x, z, de, ate),
      [alvo.x, alvo.z, y - 3, y + 1],
    )
  : null
const sobrou = await page.evaluate(() => window.__roquecraft.mobsInfo().length)

// 6. Olha o buraco de cima.
await page.evaluate(
  ([x, y, z]) => {
    const rc = window.__roquecraft
    rc.setFlying(true)
    rc.teleport(x, y + 7, z + 9)
    rc.look?.(0, -0.6)
  },
  [alvo?.x ?? 0, y, alvo?.z ?? 0],
)
await page.waitForTimeout(900)
await foto('3-cratera.png')

const solidos = (col) => (col || []).filter((c) => c.bloco !== 'air').length
console.log(
  JSON.stringify(
    {
      nasceu: nasceu.ok,
      tipo: nasceu.mobs?.[0]?.type ?? null,
      // ⚠️ A SONDA DENUNCIA A SI MESMA. `pavioNaFotoCalma` TEM que ser 0: se
      // vier maior, a foto "calma" foi tirada com o bicho já aceso e o par de
      // controle não existe — as duas fotos mostram a mesma coisa e qualquer
      // conclusão sobre o modelo é chute.
      pavioNaFotoCalma,
      pavioMaximoVisto: pavioVisto,
      criaturasDepois: sobrou,
      colunaAntes: { solidos: solidos(antes), total: (antes || []).length },
      colunaDepois: { solidos: solidos(depois), total: (depois || []).length },
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
// Nasceu um creeper, o pavio subiu, ele estourou (sumiu) e a coluna perdeu bloco.
const veredito =
  nasceu.ok === true &&
  nasceu.mobs?.[0]?.type === 'creeper' &&
  pavioVisto > 0 &&
  sobrou === 0 &&
  antes &&
  depois &&
  solidos(depois) < solidos(antes) &&
  erros.length === 0
process.exit(veredito ? 0 : 1)
