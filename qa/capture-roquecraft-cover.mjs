// Captura a capa real do RoqueCraft (screenshot de gameplay voxel de verdade).
// Headed + GPU real (headless=swiftshader deixa a cena 3D preta). O hook E2E
// window.__roquecraft.stage() posiciona a câmera num frame fotogênico; então
// escondemos o HUD DOM e clipamos o canvas.
//
// Uso: node scripts/capture-roquecraft-cover.mjs   (após yarn build:app)
// Saída: public/games/covers/roquecraft.jpg (committed - arte real).

import http from 'node:http'
import { createReadStream, existsSync, statSync, mkdirSync } from 'node:fs'
import { extname, join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const DIST = join(ROOT, 'dist', 'pwa')
const OUT = join(ROOT, 'public', 'games', 'covers')
const PORT = Number(process.env.RC_COVER_PORT || 9362)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
}

function startServer() {
  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url, `http://localhost:${PORT}`)
      const pathname = decodeURIComponent(url.pathname)
      let filePath = join(DIST, pathname)
      const hasExt = extname(pathname) !== ''
      if (!hasExt || !existsSync(filePath) || !statSync(filePath).isFile()) {
        if (hasExt && !existsSync(filePath)) {
          res.writeHead(404)
          res.end('not found')
          return
        }
        filePath = join(DIST, 'index.html')
      }
      res.writeHead(200, {
        'Content-Type': MIME[extname(filePath)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      })
      createReadStream(filePath).pipe(res)
    } catch (err) {
      res.writeHead(500)
      res.end(String(err))
    }
  })
  return new Promise((res) => server.listen(PORT, () => res(server)))
}

const seed = {
  auth: {
    uid: 'cover-uid',
    email: 'cover@roqueos.test',
    emailVerified: true,
    displayName: 'Cover',
    role: 'user',
  },
}
const HIDE = `.ros-roquecraft__hud, .ros-roquecraft__hotbar, .ros-roquecraft__play-hint,
  .ros-roquecraft__crosshair, .ros-roquecraft__mobile { display: none !important; }`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function run() {
  if (!existsSync(DIST)) {
    console.error('dist/pwa não encontrado - rode `yarn build:app`.')
    process.exit(1)
  }
  mkdirSync(OUT, { recursive: true })
  const server = await startServer()

  let browser
  try {
    browser = await chromium.launch({
      channel: 'chrome',
      headless: false,
      args: ['--ignore-gpu-blocklist', '--enable-webgl', '--enable-gpu'],
    })
  } catch (e) {
    console.error('Falha ao abrir o Chrome do sistema:', e.message)
    server.close()
    process.exit(2)
  }

  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 2,
  })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message.slice(0, 160)))

  await page.addInitScript((s) => {
    window.__ROS_E2E__ = s
  }, seed)
  await page.goto(`http://localhost:${PORT}/app`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!window.__rosStore, { timeout: 30000 })

  await page.evaluate(() => {
    const w = window.__rosStore.openWindow('roquecraft')
    const id = w?.id || (window.__rosStore.windows || []).find((x) => x.appId === 'roquecraft')?.id
    if (id && window.__rosStore.maximizeWindow) window.__rosStore.maximizeWindow(id)
  })
  await page.waitForFunction(() => !!window.__roquecraft?.stage, { timeout: 60000 })
  await page.waitForFunction(() => window.__roquecraft.state.ready === true, { timeout: 30000 })
  await page.evaluate(() => window.__roquecraft.stage())
  const state = await page.evaluate(() => window.__roquecraft.state)
  console.log('estado no stage:', JSON.stringify(state))

  await page.addStyleTag({ content: HIDE })
  await sleep(700)

  const rect = await page.evaluate(() => {
    const el =
      document.querySelector('.ros-roquecraft__canvas') || document.querySelector('.ros-roquecraft')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  })
  if (!rect || rect.width < 100) {
    console.error('sem rect do canvas', rect)
    await browser.close()
    server.close()
    process.exit(3)
  }
  const outPath = join(OUT, 'roquecraft.jpg')
  await page.screenshot({ path: outPath, type: 'jpeg', quality: 90, clip: rect })
  console.log(
    `capturado roquecraft.jpg (${Math.round(rect.width)}×${Math.round(rect.height)}) → ${outPath}`,
  )

  await browser.close()
  server.close()
  process.exit(0)
}

run().catch((e) => {
  console.error('captura falhou:', e)
  process.exit(4)
})
