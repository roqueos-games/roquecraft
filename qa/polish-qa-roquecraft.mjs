// /polish-qa multi-device do RoqueCraft: galeria de Jogos (card + capa) + o
// jogo (mundo voxel + HUD + hotbar) em desktop, mobile e low-end. Headed + GPU
// real (a cena 3D fica preta em swiftshader). hasTouch no mobile pros controles
// on-screen montarem.
//
// Uso: node scripts/polish-qa-roquecraft.mjs   (após yarn build:app)
// Saída: scripts/.roquecraft-qa/*.png (gitignored).

import http from 'node:http'
import { createReadStream, existsSync, statSync, mkdirSync } from 'node:fs'
import { extname, join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const DIST = join(ROOT, 'dist', 'pwa')
const OUT = join(ROOT, 'scripts', '.roquecraft-qa')
const PORT = Number(process.env.RC_POLISH_PORT || 9363)

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
  // Áudio: sem estes o servidor do harness devolve octet-stream e o navegador
  // recusa o `<audio>` da trilha — o QA acusaria "sem música" por culpa do
  // próprio QA.
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
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
    uid: 'qa-uid',
    email: 'qa@roqueos.test',
    emailVerified: true,
    displayName: 'QA',
    role: 'user',
  },
}
const IGNORE =
  /insufficient permissions|FirebaseError|permission|version\.json|Failed to load resource|net::ERR|preloader|Analytics|measurement|widgets|load failed|NotificationCenter/i
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const errors = []

async function newPage(browser, viewport, lowEnd = false) {
  const mobile = viewport.width < 500
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
  })
  await ctx.addInitScript((s) => {
    window.__ROS_E2E__ = s
  }, seed)
  const page = await ctx.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORE.test(m.text()))
      errors.push(`console: ${m.text().slice(0, 140)}`)
  })
  page.on('pageerror', (e) => {
    if (!IGNORE.test(e.message)) errors.push(`pageerror: ${e.message.slice(0, 140)}`)
  })
  await page.goto(`http://localhost:${PORT}/app`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!window.__rosStore, { timeout: 30000 })
  if (lowEnd) {
    await page.evaluate(() => document.documentElement.setAttribute('data-low-end', '1'))
    await sleep(200)
  }
  return page
}

async function shotGallery(page, name) {
  await page.evaluate(() => window.__rosStore.openWindow('games'))
  await sleep(1500)
  await page.evaluate(() => {
    const img = document.querySelector('img[src*="roquecraft"]')
    if (img) img.closest('.ros-games__card, [class*="card"]')?.scrollIntoView({ block: 'center' })
  })
  await sleep(800)
  await page.screenshot({ path: join(OUT, `${name}.png`) })
  console.log(`shot ${name}.png`)
}

async function shotGame(page, name, mobile) {
  await page.evaluate(() => window.__rosStore.openWindow('roquecraft'))
  await page.waitForFunction(() => window.__roquecraft?.state?.ready === true, { timeout: 60000 })
  await sleep(1500)
  // olha levemente pra baixo pra mostrar o mundo + o chão
  await page.evaluate(() => window.__roquecraft.look(0.7, 0.02))
  await sleep(500)
  await page.screenshot({ path: join(OUT, `${name}.png`) })
  console.log(`shot ${name}.png`)
  void mobile
}

async function shotLobby(page, name) {
  await page.evaluate(() => window.__rosStore.openWindow('roquecraft'))
  await page.waitForFunction(() => window.__roquecraft?.state?.ready === true, { timeout: 60000 })
  await sleep(900)
  await page.evaluate(() => window.__roquecraft.openLobby())
  await sleep(600)
  await page.screenshot({ path: join(OUT, `${name}.png`) })
  console.log(`shot ${name}.png`)
}

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

  const pDesk = await newPage(browser, { width: 1440, height: 900 })
  await shotGallery(pDesk, 'polish-gallery-desktop')
  await shotGame(pDesk, 'polish-game-desktop', false)
  await shotLobby(pDesk, 'polish-lobby-desktop')

  const pLow = await newPage(browser, { width: 1440, height: 900 }, true)
  await shotGallery(pLow, 'polish-gallery-lowend')

  const pMob = await newPage(browser, { width: 390, height: 844 })
  await shotGallery(pMob, 'polish-gallery-mobile')
  await shotGame(pMob, 'polish-game-mobile', true)
  await shotLobby(pMob, 'polish-lobby-mobile')

  await browser.close()
  server.close()

  console.log('\n===== POLISH QA ROQUECRAFT =====')
  console.log('erros de console/page (fora do ruído):', errors.length)
  errors.slice(0, 12).forEach((e) => console.log('  •', e))
  console.log('prints em:', OUT)
  process.exit(errors.length === 0 ? 0 : 1)
}

run().catch((e) => {
  console.error('polish-qa falhou:', e)
  process.exit(3)
})
