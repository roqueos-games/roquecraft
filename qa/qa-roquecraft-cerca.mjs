//
// A CERCA — sonda de duas perguntas: ela CONECTA, e ela SEGURA?
//
// `formas.spec.js` prova a geometria das 16 variantes e prova que a criatura
// recusa o degrau quando o bloco é cerca. Nenhum dos dois prova que, no jogo, um
// bloco colocado ao lado de outro vira a variante certa — entre a regra e o
// mundo há a fila de atualizações, o `applyEdit` e a ordem em que os vizinhos
// acordam.
//
// ⚠️ PROVA DE VIDA: a sonda lê o id de CADA célula do curral e conta as
// conexões esperadas por posição. Um curral em que todas as células viram a
// mesma variante (por exemplo, todas sem conexão) daria "16 cercas colocadas"
// e nada mais — verde com a cerca quebrada.
//
//   node scripts/qa-roquecraft-cerca.mjs
//
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const DIST = path.resolve('dist/pwa')
const SAIDA = path.resolve('scripts/.qa-cerca')
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
await page.addStyleTag({ content: '.ros-roquecraft__play{display:none !important}' })
const foto = (nome) => page.screenshot({ path: path.join(SAIDA, nome) })

const y = await page.evaluate(() => {
  const rc = window.__roquecraft
  rc.setMode('creative')
  const y = Math.round(rc.surfaceAt(0, 0) ?? 66) + 14
  rc.setFlying(true)
  rc.teleport(0.5, y + 3, 0.5)
  rc.fill(-12, y - 2, -12, 12, y, 12, 'grassBlock')
  return y
})
await page.waitForTimeout(2600)

// Um curral quadrado de 5×5, aberto em nada: 16 células de borda.
const LADO = 5
const curral = await page.evaluate(
  ([y, LADO]) => {
    const rc = window.__roquecraft
    const celulas = []
    for (let i = 0; i < LADO; i++) {
      for (const [x, z] of [
        [i, 0],
        [i, LADO - 1],
        [0, i],
        [LADO - 1, i],
      ]) {
        const k = `${x},${z}`
        if (!celulas.includes(k)) celulas.push(k)
      }
    }
    for (const k of celulas) {
      const [x, z] = k.split(',').map(Number)
      rc.fill(x, y + 1, z, x, y + 1, z, 'oakFence')
    }
    return celulas
  },
  [y, LADO],
)
// Deixa a fila de atualizações resolver as conexões.
await page.waitForTimeout(1800)

const lidos = await page.evaluate(
  ([y, celulas]) => {
    const rc = window.__roquecraft
    return celulas.map((k) => {
      const [x, z] = k.split(',').map(Number)
      const col = rc.colunaEm(x, z, y + 1, y + 1)
      return { x, z, bloco: col?.[0]?.bloco ?? 'nada' }
    })
  },
  [y, curral],
)

// Quantas conexões CADA célula deveria ter: canto 2, meio de lado 2 (as duas
// vizinhas na mesma linha). Num quadrado fechado toda célula tem exatamente 2.
const semCerca = lidos.filter((c) => !String(c.bloco).startsWith('oakFence'))
const variantes = new Set(lidos.map((c) => c.bloco))

// A vaca fica dentro?
const prova = await page.evaluate(
  ([y, LADO]) => {
    const rc = window.__roquecraft
    rc.limparMobs()
    rc.setFlying(true)
    rc.teleport(LADO / 2, y + 1, LADO / 2)
    rc.setFlying(false)
    rc.spawnMob('cow', 0.8, 0)
    return rc.mobsInfo().length
  },
  [y, LADO],
)
await page.waitForTimeout(9000)
const dentro = await page.evaluate(
  ([LADO]) => {
    const m = window.__roquecraft.mobsInfo()[0]
    if (!m) return null
    return {
      x: m.x,
      z: m.z,
      dentro: m.x > 0.6 && m.x < LADO - 0.6 && m.z > 0.6 && m.z < LADO - 0.6,
    }
  },
  [LADO],
)

await page.evaluate(
  ([y, LADO]) => {
    const rc = window.__roquecraft
    rc.setFlying(true)
    // ⚠️ `yaw = 0` OLHA PRA −Z neste jogo (a frente do jogador é `-cos(yaw)`).
    // A primeira versão usava `atan2(0, -1)` = π, que olha pra +Z: a foto saiu
    // com a floresta atrás da câmera e nenhum curral — e a sonda estava verde.
    rc.teleport(LADO / 2, y + 5, LADO + 7)
    rc.look(0, -0.45)
  },
  [y, LADO],
)
await page.waitForTimeout(700)
await foto('1-curral-de-cerca.png')

// ── O PORTÃO ────────────────────────────────────────────────────────────────
//
// Troca uma célula da cerca por um portão e mede as duas coisas que importam:
// que o clique ALTERNA (fechado ↔ aberto) e que o estado muda o que passa.
//
// ⚠️ O CLIQUE É O DO JOGO (`interagir()` → `tryInteract`). Trocar o id na mão
// testaria a tabela de variantes, que o teste puro já testa, e daria verde com
// o botão direito quebrado.
const portao = await page.evaluate(
  ([y, LADO]) => {
    const rc = window.__roquecraft
    const px = Math.floor(LADO / 2)
    // O portão entra no meio da parede z=0.
    rc.fill(px, y + 1, 0, px, y + 1, 0, 'oakGate')
    return { px, pz: 0 }
  },
  [y, LADO],
)
await page.waitForTimeout(1200)

/** Mira o portão de frente e clica com o botão direito do JOGO. */
async function clicarNoPortao() {
  return page.evaluate(
    ([y, px, pz]) => {
      const rc = window.__roquecraft
      rc.setFlying(true)
      const olhoX = px + 0.5
      const olhoZ = pz - 2.5
      rc.teleport(olhoX, y + 1, olhoZ)
      rc.setFlying(false)
      // ⚠️ O YAW SAI DA FÓRMULA, NÃO DE UM NÚMERO QUE EU ESCREVO. É a quarta
      // vez nesta sessão que `yaw = 0` (que olha pra −Z) me faz fotografar ou
      // clicar no lado errado do mundo. Esta é a mesma conta que `frameMobs`
      // usa dentro do jogo: `atan2(alvoX − x, −(alvoZ − z))`.
      // ⚠️ E O PITCH TAMBÉM SAI DA CONTA. O olho fica em +1,62 e o meio do
      // portão em +1,5 da célula de baixo: mirar na horizontal passa POR CIMA
      // dele. `frameMobs` usa `-atan2(subida, distância)`, e é essa.
      const olhoY = y + 1 + 1.62
      const alvoY = y + 1 + 0.5
      const dist = Math.hypot(px + 0.5 - olhoX, pz + 0.5 - olhoZ)
      rc.look(Math.atan2(px + 0.5 - olhoX, -(pz + 0.5 - olhoZ)), -Math.atan2(olhoY - alvoY, dist))
      const antes = rc.colunaEm(px, pz, y + 1, y + 1)?.[0]?.bloco ?? 'nada'
      const ok = rc.interagir()
      const depois = rc.colunaEm(px, pz, y + 1, y + 1)?.[0]?.bloco ?? 'nada'
      return { ok, antes, depois, mudou: antes !== depois }
    },
    [y, portao.px, portao.pz],
  )
}

const colocado = await page.evaluate(
  ([y, px, pz]) => window.__roquecraft.colunaEm(px, pz, y + 1, y + 1)?.[0]?.bloco ?? 'nada',
  [y, portao.px, portao.pz],
)
/**
 * Olha o portão DE LADO e com a mira FORA dele.
 *
 * ⚠️ A primeira foto saiu inútil: de frente e com o alvo sob a mira, o jogo
 * desenha o FANTASMA DO BLOCO A COLOCAR — um cubo translúcido de um bloco na
 * face mirada — e o contorno branco do destaque. Os dois são recursos
 * funcionando, e os dois lavaram a única coisa que a foto existia pra julgar.
 * Mirar pro lado tira os dois da frente.
 */
async function fotoLimpaDoPortao(nome) {
  await page.evaluate(
    ([y, px, pz]) => {
      const rc = window.__roquecraft
      const olhoX = px + 3.2
      const olhoZ = pz - 3.2
      rc.setFlying(true)
      rc.teleport(olhoX, y + 2.2, olhoZ)
      rc.look(Math.atan2(px + 0.5 - olhoX, -(pz + 0.5 - olhoZ)), -0.18)
    },
    [y, portao.px, portao.pz],
  )
  await page.waitForTimeout(600)
  await foto(nome)
}

const abriu = await clicarNoPortao()
await fotoLimpaDoPortao('2-portao-aberto.png')
const fechou = await clicarNoPortao()
await fotoLimpaDoPortao('3-portao-fechado.png')

console.log(
  JSON.stringify(
    {
      portao: { colocado, abriu, fechou },
      celulas: curral.length,
      // ⚠️ TEM que ser 0. Qualquer célula que não virou cerca é `fill` que não
      // pegou, e aí o resto da medida não vale nada.
      celulasSemCerca: semCerca,
      // ⚠️ TEM que ser mais de uma. Se todas viraram a MESMA variante, a fila
      // não reconectou ninguém e o curral é um monte de postes soltos.
      variantesDistintas: [...variantes],
      vacaNasceu: prova,
      vacaDepoisDeNoveSegundos: dentro,
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
const veredito =
  String(colocado).startsWith('oakGate') &&
  abriu?.mudou === true &&
  fechou?.mudou === true &&
  semCerca.length === 0 &&
  prova === 1 &&
  dentro?.dentro === true &&
  erros.length === 0
process.exit(veredito ? 0 : 1)
