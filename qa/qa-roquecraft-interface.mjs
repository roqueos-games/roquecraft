// A INTERFACE, MEDIDA — não olhada.
//
// O founder pediu (2026-08-23) menus e HUD com a identidade do jogo. Print
// resolve estética; não resolve as três perguntas que decidem se a interface
// FUNCIONA, e que foi justamente onde a leitura a olho me enganou uma vez nesta
// mesma tarefa (achei que o rodapé colorido dos prints era a hotbar vazando por
// cima dos modais — era o dock do sistema, e o defeito de verdade era o
// contrário: a hotbar não aparecia).
//
// As três perguntas:
//
//  1. A hotbar está VISÍVEL e clicável? Ela é o controle mais usado do jogo, e
//     o dock do sistema mora exatamente onde ela fica.
//  2. Sobrou ícone Material dentro do jogo? É o que mais denuncia "aplicativo".
//  3. Sobrou canto arredondado de aplicativo (raio > 2px) em painel de menu?
//
// Mede a geometria REAL do navegador (getBoundingClientRect + elementFromPoint),
// não o CSS que eu acho que escrevi.
//
// Uso: yarn build:app && node scripts/qa-roquecraft-interface.mjs
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const DIST = path.resolve('dist/pwa')
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
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
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

await new Promise((r) => server.listen(0, r))
const base = `http://localhost:${server.address().port}`
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  serviceWorkers: 'block',
  locale: 'pt-BR',
})
const page = await ctx.newPage()
const erros = []
page.on('pageerror', (e) => {
  // Pointer lock é recusado em navegador sem cabeça, e isso é do ambiente, não
  // do jogo. Filtrar aqui é honesto; deixar passar treinaria a ignorar o vermelho.
  if (/pointer lock/i.test(e.message)) return
  erros.push(`PAGEERROR ${e.message}`)
})
await page.addInitScript(SEED)
await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => !!window.__rosStore, null, { timeout: 30000 })
await page.waitForTimeout(1000)
await page.evaluate(() => window.__rosStore.openWindow('roquecraft'))
await page.waitForFunction(() => window.__roquecraft?.state?.ready === true, null, {
  timeout: 90000,
})
await page.waitForTimeout(1500)

// ── 1. A HOTBAR ESTÁ ALCANÇÁVEL? ────────────────────────────────────────────
//
// Não basta existir no DOM: `elementFromPoint` no centro de cada slot responde
// quem REALMENTE recebe o clique. Se o dock estiver por cima, é ele que
// aparece — e aí a hotbar existe, está pintada, e mesmo assim não dá pra usar.
// ⚠️ CLICAR PRA JOGAR ANTES DE MEDIR, e isto foi uma armadilha de verdade: a
// primeira versão mediu com o convite "clique pra jogar" ainda na tela, acusou
// os 9 slots como bloqueados e me fez quase consertar um defeito que não
// existe. O convite é uma superfície de tela cheia de propósito — ele some
// quando o ponteiro trava. Medir antes disso é medir outra tela.
await page.click('.ros-roquecraft__play').catch(() => {})
await page.waitForTimeout(400)
const convite = await page.$('.ros-roquecraft__play')

const hotbar = await page.evaluate(() => {
  const barra = document.querySelector('.rc-hud__hotbar')
  if (!barra) return { existe: false }
  const r = barra.getBoundingClientRect()
  const slots = [...barra.querySelectorAll('.rc-hud__slot')]
  const cobertos = []
  for (const [i, s] of slots.entries()) {
    const b = s.getBoundingClientRect()
    const alvo = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
    // O convite "clique pra jogar" não conta como cobertura: ele é de tela
    // cheia por design e some no pointer lock. Em navegador sem cabeça o lock
    // é recusado ("not valid for pointer lock"), então ele fica na tela e
    // acusaria os nove slots toda rodada. O que se procura aqui é o resto: o
    // dock, um modal esquecido aberto, um overlay com z-index solto.
    if (alvo?.closest?.('.ros-roquecraft__play')) continue
    if (!alvo || !s.contains(alvo)) {
      cobertos.push({ slot: i, porQuem: alvo?.className?.toString?.().slice(0, 60) || '?' })
    }
  }
  const dock = document.querySelector('.ros-dock')?.getBoundingClientRect() || null
  return {
    existe: true,
    slots: slots.length,
    rect: { top: Math.round(r.top), bottom: Math.round(r.bottom), altura: Math.round(r.height) },
    forapDaTela: r.bottom > window.innerHeight || r.top < 0,
    dockTopo: dock ? Math.round(dock.top) : null,
    dockOffset: getComputedStyle(document.documentElement).getPropertyValue('--ros-dock-offset'),
    cobertos,
  }
})

// ── 2. SOBROU ÍCONE MATERIAL? ───────────────────────────────────────────────
// A fonte Material Icons desenha por ligadura: o texto do elemento É o nome do
// ícone. Procurar pela classe é o jeito de achar sem depender de render.
// Escape, e não um gancho de teste: é o caminho que o jogador usa, e um gancho
// próprio poderia abrir a pausa por um atalho que na prática está quebrado.
const abrirPausa = async () => {
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => !!document.querySelector('.rc-pause'), null, { timeout: 5000 })
  await page.waitForTimeout(300)
}

const varrer = () =>
  page.evaluate(() => {
    const dentro = document.body
    // Só dentro do jogo: o resto do sistema operacional usa Material de
    // propósito, e contar aqueles daria um número que nunca chega a zero.
    const raizes = [...document.querySelectorAll('[class^="rc-"], [class*=" rc-"]')].filter(
      (e) => !e.closest('.ros-dock') && !e.closest('.ros-menubar'),
    )
    // Set: as raízes se aninham, e sem isto o mesmo ícone é contado uma vez
    // por ancestral — o número inflava e não dizia nada.
    const achados = new Set()
    for (const r of raizes)
      for (const e of r.querySelectorAll('.q-icon, .material-icons')) achados.add(e)
    const material = [...achados].map((e) => e.textContent.trim() || e.className.toString())
    // Raio de aplicativo: qualquer painel/botão do jogo com canto > 2px
    const gordos = []
    for (const e of dentro.querySelectorAll('[class*="rc-"]')) {
      const r = parseFloat(getComputedStyle(e).borderTopLeftRadius) || 0
      const cls = e.className.toString()
      // O disco do minimapa é redondo de propósito (bússola).
      if (r > 2.5 && !/rc-mini__disco/.test(cls)) gordos.push({ cls: cls.slice(0, 50), raio: r })
    }
    // Desfoque de fundo: a assinatura de sistema operacional
    const borrados = [...dentro.querySelectorAll('[class*="rc-"]')]
      .filter((e) => (getComputedStyle(e).backdropFilter || 'none') !== 'none')
      .map((e) => e.className.toString().slice(0, 50))
    return { material, gordos, borrados }
  })

const emJogo = await varrer()
await abrirPausa()
const naPausa = await varrer()

// ── 3. OS IDIOMAS CABEM? ────────────────────────────────────────────────────
//
// ⚠️ ESTE É O QUE PRINT NENHUM PEGA, e é onde a interface de jogo costuma
// quebrar: o layout é desenhado em português, e aí chega o alemão com
// "Bewegungsunschärfe" ou o japonês com altura de linha diferente. `scrollWidth
// > clientWidth` é o texto que não coube — o navegador responde, não o olho.
const IDIOMAS = ['pt-BR', 'en-US', 'de-DE', 'ru-RU', 'ja-JP', 'zh-CN', 'ar-AR', 'hi-IN']
// ⚠️ NO REPO DO JOGO NÃO HÁ `__ROS_I18N__`: o idioma vem do host, e o host de
// desenvolvimento lê `navigator.language` e ouve `languagechange`. A sonda faz
// o que um usuário trocando o idioma do sistema faria: muda a língua do
// navegador e avisa. O jogo carrega os textos do idioma novo de forma
// assíncrona, por isso a espera é maior que era no front.
const trocarIdioma = async (l) => {
  await page.evaluate((idioma) => {
    Object.defineProperty(navigator, 'language', { get: () => idioma, configurable: true })
    window.dispatchEvent(new Event('languagechange'))
  }, l)
  await page.waitForTimeout(700)
}
const porIdioma = []
for (const loc of IDIOMAS) {
  await trocarIdioma(loc)
  const r = await page.evaluate(() => {
    const dentro = document.body
    const estourou = []
    for (const e of dentro.querySelectorAll('.rc-btn, .rc-pause__title, .rc-pause__seg button')) {
      // 1px de folga: subpixel de fonte não é estouro
      if (e.scrollWidth > e.clientWidth + 1) {
        estourou.push({
          cls: e.className.toString().slice(0, 40),
          texto: (e.textContent || '').trim().slice(0, 28),
          sobra: e.scrollWidth - e.clientWidth,
        })
      }
    }
    return estourou
  })
  porIdioma.push({ loc, estouros: r.length, exemplos: r.slice(0, 3) })
}
await trocarIdioma('pt-BR')

// ── 4. PRINTS ───────────────────────────────────────────────────────────────
// Medida diz que não sobrou ícone Material; não diz se ficou BONITO. As duas
// coisas precisam de instrumento diferente.
const OUT = path.resolve('scripts/.qa-interface')
fs.mkdirSync(OUT, { recursive: true })
await page.keyboard.press('Escape') // fecha a pausa, volta pro jogo
await page.waitForTimeout(400)
await page.screenshot({ path: path.join(OUT, '1-hud.png') })
await abrirPausa()
await page.screenshot({ path: path.join(OUT, '2-pausa.png') })
await page.evaluate(() => document.querySelectorAll('.rc-pause__btn')[1]?.click())
await page.waitForTimeout(400)
await page.screenshot({ path: path.join(OUT, '3-ajustes.png') })
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
await page.keyboard.press('KeyE')
await page.waitForTimeout(600)
await page.screenshot({ path: path.join(OUT, '4-inventario.png') })

// ── 5. A MESMA VARREDURA NO CELULAR ─────────────────────────────────────────
//
// ⚠️ ESTA SEÇÃO EXISTE POR UMA FALHA DESTA SONDA. A varredura só rodava em
// viewport de desktop, onde `RCMobile` nem monta — e passou batido que os três
// botões de ação de toque continuavam círculos translúcidos de `border-radius:
// 50%`, a última peça da interface que ainda parecia de outro jogo. Critério
// que só é medido numa viewport é critério medido pela metade.
const ctxM = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  serviceWorkers: 'block',
  locale: 'pt-BR',
})
const pageM = await ctxM.newPage()
await pageM.addInitScript(SEED)
await pageM.goto(`${base}/app`, { waitUntil: 'domcontentloaded' })
await pageM.waitForFunction(() => !!window.__rosStore, null, { timeout: 30000 })
await pageM.waitForTimeout(900)
await pageM.evaluate(() => window.__rosStore.openWindow('roquecraft'))
await pageM.waitForFunction(() => window.__roquecraft?.state?.ready === true, null, {
  timeout: 90000,
})
await pageM.waitForTimeout(1500)
const celular = await pageM.evaluate(() => {
  const gordos = []
  const pequenos = []
  for (const e of document.querySelectorAll('[class*="rc-"]')) {
    const cs = getComputedStyle(e)
    const r = parseFloat(cs.borderTopLeftRadius) || 0
    // O analógico e o botão dele são redondos de propósito: ali o formato é
    // FUNÇÃO (o dedo pode ir pra qualquer direção; quadrado sugeriria quatro).
    // O disco do minimapa (Goal 19) também: é uma bússola, e bússola é redonda.
    // A sonda ficou vermelha de 14/09 a 18/09 acusando `rc-mini__disco`.
    const cls = e.className.toString()
    const redondoDeProposito = /stick|knob|rc-mini__disco/.test(cls)
    if (r > 2.5 && !redondoDeProposito) {
      gordos.push({ cls: cls.slice(0, 40), raio: cs.borderTopLeftRadius })
    }
    // Alvo de toque: 44px é o piso da Apple e do Material.
    if (e.tagName === 'BUTTON') {
      const b = e.getBoundingClientRect()
      // ⚠️ SÓ A ALTURA. A largura do slot da hotbar é imposta pela tela: nove
      // slots a 44px dariam 396px de conteúdo numa tela de 390px, e a saída
      // seria esconder slot ou rolar a barra — as duas piores que um alvo de
      // 40px de largura. Altura, essa não tem desculpa: sobra tela vertical.
      const larguraLivre = !e.className.toString().includes('rc-hud__slot')
      if (b.width > 0 && ((larguraLivre && b.width < 43.5) || b.height < 43.5)) {
        pequenos.push({
          cls: e.className.toString().slice(0, 40),
          w: Math.round(b.width),
          h: Math.round(b.height),
        })
      }
    }
  }
  return { gordos, pequenos }
})
await pageM.screenshot({ path: path.join(OUT, '5-celular.png') })

const relatorio = {
  erros,
  celular,
  conviteAindaNaTela: !!convite, // se sobrou, a medição da hotbar não vale
  hotbar,
  emJogo: { material: emJogo.material, raiosGordos: emJogo.gordos, comBlur: emJogo.borrados },
  naPausa: { material: naPausa.material, raiosGordos: naPausa.gordos, comBlur: naPausa.borrados },
  idiomas: porIdioma,
}
console.log(JSON.stringify(relatorio, null, 2))

await browser.close()
server.close()

const reprovou =
  erros.length > 0 ||
  !hotbar.existe ||
  hotbar.cobertos.length > 0 ||
  hotbar.foraDaTela ||
  naPausa.material.length > 0 ||
  naPausa.gordos.length > 0 ||
  celular.gordos.length > 0 ||
  celular.pequenos.length > 0 ||
  porIdioma.some((i) => i.estouros > 0)
process.exit(reprovou ? 1 : 0)
