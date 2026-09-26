//
// O GELO QUE PERDE AS LATERAIS E O FUNDO — A/B de `depthWrite`.
//
// Relato do founder (2026-08-22): "ainda tem algumas coisas flutuando no mapa,
// como esses blocos de gelo sem a parte das laterais e inferior".
//
// A auditoria de malha já provou que a geometria ESTÁ lá: 633 mil blocos
// varridos no jogo real — gelo, vidro, água e neve incluídos — sem uma face
// faltando. Então o problema não é a face não existir; é ela não ser PINTADA.
//
// A hipótese tem mecanismo. Gelo e água dividem o mesmo passe transparente, e
// esse material tem `depthWrite: false`. Sem escrita de profundidade, quem
// aparece é quem desenha por último, e a ordem dentro de uma seção é a ordem de
// emissão do mesher — não de trás pra frente. A lâmina d'água em volta do gelo
// é desenhada depois e pinta POR CIMA das laterais e do fundo dele. O topo
// sobrevive porque nada de água passa na frente dele.
//
// Aqui o harness constrói o caso exato — gelo cercado de água — e fotografa o
// MESMO enquadramento com `depthWrite` desligado (como está hoje) e ligado. Se
// a hipótese estiver certa, as laterais aparecem no segundo quadro.
//
// Uso: node scripts/qa-roquecraft-gelo.mjs [tag]   (exige dist/pwa)
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const { PNG } = createRequire(import.meta.url)('pngjs')
const DIST = path.resolve('dist/pwa')
const TAG = process.argv[2] || 'gelo'
const OUT = path.resolve('scripts/.qa-gelo')
fs.mkdirSync(OUT, { recursive: true })

const T = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
}
const server = http.createServer((req, res) => {
  const p = decodeURIComponent((req.url || '/').split('?')[0])
  let fp = path.join(DIST, p)
  try {
    if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) fp = shellDoApp(DIST)
  } catch {
    fp = shellDoApp(DIST)
  }
  res.setHeader('Content-Type', T[path.extname(fp)] || 'application/octet-stream')
  fs.createReadStream(fp).pipe(res)
})
const SEED = `window.__ROS_E2E__ = { auth:{uid:'e2e-uid',email:'e2e@roqueos.test',emailVerified:true,displayName:'E2E',role:'user'}, googleDrive:{isConnected:false,files:[],user:{}}, googleMapsApiKey:'', roquecraftSeed: 20260819 }`
const SEM_HUD = `.ros-roquecraft__play,.rc-hud,.ros-roquecraft__vignette,.ros-roquecraft__hurt,.ros-roquecraft__espera{display:none!important}`

await new Promise((r) => server.listen(0, r))
const base = `http://localhost:${server.address().port}`
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const ctx = await browser.newContext({
  viewport: { width: 1024, height: 640 },
  deviceScaleFactor: 1,
  serviceWorkers: 'block',
  locale: 'pt-BR',
})
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`))
await page.addInitScript(SEED)
await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => !!window.__rosStore, null, { timeout: 30000 })
await page.waitForTimeout(1200)
await page.evaluate(() => window.__rosStore.openWindow('roquecraft'))
await page.waitForFunction(() => window.__roquecraft?.state?.ready === true, null, {
  timeout: 90000,
})
await page.addStyleTag({ content: SEM_HUD })

// ── ACHAR OCEANO E MONTAR O CASO ──────────────────────────────────────────
const cena = await page.evaluate(async () => {
  const rc = window.__roquecraft
  rc.setTime(6000)
  rc.teleport(0, 110, 0)
  await rc.waitChunks(6)
  // coluna de água funda, longe da margem
  let alvo = null
  for (let x = -140; x <= 140 && !alvo; x += 8)
    for (let z = -140; z <= 140; z += 8) {
      if (rc.profundidadeAgua(x, z) >= 5) {
        // exige água em volta também: gelo na margem não é o caso
        const volta = [
          [8, 0],
          [-8, 0],
          [0, 8],
          [0, -8],
        ]
        if (volta.every(([dx, dz]) => rc.profundidadeAgua(x + dx, z + dz) >= 4)) {
          alvo = { x, z, prof: rc.profundidadeAgua(x, z) }
          break
        }
      }
    }
  if (!alvo) return null
  rc.teleport(alvo.x + 0.5, 90, alvo.z + 0.5)
  await rc.waitChunks(5)
  return alvo
})
if (!cena) {
  console.log(JSON.stringify({ erro: 'sem oceano na semente' }))
  process.exit(1)
}

// Topo da lâmina, sem constante mágica: `surfaceAt` devolve o primeiro y livre
// acima do sólido (o leito), e `profundidadeAgua` conta os blocos líquidos
// acima dele. O topo é a soma menos um.
const GELO = await page.evaluate(
  async ({ cena }) => {
    const rc = window.__roquecraft
    const leito = rc.surfaceAt(cena.x, cena.z)
    const prof = rc.profundidadeAgua(cena.x, cena.z)
    const topo = leito + prof - 1
    // um bloco de gelo SOZINHO, no topo da lâmina, cercado de água nos 4 lados
    rc.fill(cena.x, topo, cena.z, cena.x, topo, cena.z, 'ice')
    await new Promise((r) => setTimeout(r, 1600))
    return { x: cena.x, y: topo, z: cena.z, leito, prof, ehGelo: rc.solidoEm(cena.x, topo, cena.z) }
  },
  { cena },
)

const VISTAS = [
  { nome: 'lateral', raio: 4.5, dy: 0.2 },
  { nome: 'debaixo', raio: 3.5, dy: -3.5 },
  { nome: 'diagonal', raio: 5, dy: 1.5 },
]
const AZ = [0, 90, 180, 270]

async function rodada(rotulo) {
  const linhas = []
  for (const v of VISTAS) {
    for (const az of AZ) {
      const caixa = await page.evaluate(
        async ({ GELO, az, v }) => {
          const rc = window.__roquecraft
          const rad = (az * Math.PI) / 180
          const cx = GELO.x + 0.5 + Math.sin(rad) * v.raio
          const cz = GELO.z + 0.5 + Math.cos(rad) * v.raio
          const cy = GELO.y + 0.5 + v.dy
          rc.teleport(cx, cy, cz)
          rc.look(
            Math.atan2(GELO.x + 0.5 - cx, -(GELO.z + 0.5 - cz)),
            Math.atan2(GELO.y + 0.5 - cy, v.raio),
          )
          await new Promise((r) => setTimeout(r, 400))
          let x0 = 1e9,
            y0 = 1e9,
            x1 = -1e9,
            y1 = -1e9
          for (const dx of [0, 1])
            for (const dy of [0, 1])
              for (const dz of [0, 1]) {
                const p = rc.projetar(GELO.x + dx, GELO.y + dy, GELO.z + dz)
                if (!p || !p.frente) return null
                x0 = Math.min(x0, p.u)
                x1 = Math.max(x1, p.u)
                y0 = Math.min(y0, p.v)
                y1 = Math.max(y1, p.v)
              }
          return { x0, y0, x1, y1 }
        },
        { GELO, az, v },
      )
      if (!caixa) {
        linhas.push({ vista: v.nome, az, erro: 'fora do frustum' })
        continue
      }
      const buf = await page.screenshot()
      fs.writeFileSync(path.join(OUT, `${rotulo}-${v.nome}-${az}.png`), buf)
      // contraste DENTRO da caixa do gelo contra a água logo ao lado dela
      const png = PNG.sync.read(buf)
      const W = png.width,
        H = png.height
      const cx0 = Math.max(0, Math.floor(caixa.x0 * W)),
        cx1 = Math.min(W - 1, Math.ceil(caixa.x1 * W))
      const cy0 = Math.max(0, Math.floor(caixa.y0 * H)),
        cy1 = Math.min(H - 1, Math.ceil(caixa.y1 * H))
      const med = (x0, y0, x1, y1) => {
        let r = 0,
          g = 0,
          b = 0,
          n = 0
        for (let y = y0; y <= y1; y++)
          for (let x = x0; x <= x1; x++) {
            const i = (W * y + x) << 2
            r += png.data[i]
            g += png.data[i + 1]
            b += png.data[i + 2]
            n++
          }
        return n ? [r / n, g / n, b / n] : [0, 0, 0]
      }
      const dentro = med(cx0, cy0, cx1, cy1)
      const larg = cx1 - cx0
      const fora = med(Math.max(0, cx0 - larg - 6), cy0, Math.max(1, cx0 - 6), cy1)
      const contraste = Math.round(
        Math.abs(dentro[0] - fora[0]) +
          Math.abs(dentro[1] - fora[1]) +
          Math.abs(dentro[2] - fora[2]),
      )
      linhas.push({
        vista: v.nome,
        az,
        contraste,
        dentro: dentro.map(Math.round),
        fora: fora.map(Math.round),
      })
    }
  }
  return linhas
}

const antes = await rodada('A-depthWriteOFF')
const estado = await page.evaluate(() => window.__roquecraft.matTransparente({ depthWrite: true }))
await page.waitForTimeout(600)
const depois = await rodada('B-depthWriteON')

const resumo = (l) => {
  const c = l.filter((x) => x.contraste !== undefined).map((x) => x.contraste)
  return {
    min: Math.min(...c),
    max: Math.max(...c),
    media: Math.round(c.reduce((a, b) => a + b, 0) / c.length),
  }
}
const saida = {
  tag: TAG,
  cena,
  GELO,
  estado,
  erros: errors,
  antes,
  depois,
  resumoAntes: resumo(antes),
  resumoDepois: resumo(depois),
}
fs.writeFileSync(path.join(OUT, `report-${TAG}.json`), JSON.stringify(saida, null, 2))
console.log(
  JSON.stringify(
    {
      cena,
      GELO,
      estado,
      erros: errors.length,
      'depthWrite OFF (hoje)': saida.resumoAntes,
      'depthWrite ON': saida.resumoDepois,
      detalheAntes: antes.map((x) => `${x.vista}/${x.az}: ${x.contraste ?? x.erro}`),
      detalheDepois: depois.map((x) => `${x.vista}/${x.az}: ${x.contraste ?? x.erro}`),
    },
    null,
    2,
  ),
)
await browser.close()
server.close()
