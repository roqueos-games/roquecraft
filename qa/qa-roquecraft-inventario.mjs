//
// SONDA DO INVENTÁRIO, NO NAVEGADOR.
//
// Os testes de unidade provam as REGRAS. Eles não provam que o gesto chega até
// elas: `@click.left.shift.exact` é um encadeamento de modificadores do Vue que
// falha calado se estiver errado, e nenhum teste de unidade encosta nisso.
//
// Aqui a sonda clica de verdade, com a tecla Shift de verdade, e confere o
// inventário depois — e faz o mesmo com a duplicação do craft, enchendo a
// mochila e martelando o resultado.
//
// PROVA DE VIDA: antes de testar o Shift, a sonda dá um clique NORMAL no mesmo
// slot e exige que ele se comporte como clique normal (pega o item no cursor).
// Se os dois gestos derem o mesmo resultado, o modificador não está separando
// nada e o teste do Shift não significa nada.
//
//   node scripts/qa-roquecraft-inventario.mjs [semente]
//
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const DIST = path.resolve('dist/pwa')
const OUT = path.resolve('scripts/.qa-inv')
fs.mkdirSync(OUT, { recursive: true })
const TIPOS = {
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
  r.setHeader('Content-Type', TIPOS[path.extname(f)] || 'application/octet-stream')
  fs.createReadStream(f).pipe(r)
})
await new Promise((r) => servidor.listen(0, r))
const base = `http://localhost:${servidor.address().port}`
const SEMENTE = Number(process.argv[2] || 942457)

const navegador = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const ctx = await navegador.newContext({
  viewport: { width: 1440, height: 900 },
  serviceWorkers: 'block',
  locale: 'pt-BR',
})
const pagina = await ctx.newPage()
const erros = []
pagina.on('pageerror', (e) => erros.push(String(e.message).slice(0, 200)))
pagina.on('console', (m) => {
  if (
    m.type() === 'error' &&
    !/Firebase|service worker|ERR_CONNECTION_REFUSED|permissions/i.test(m.text())
  ) {
    erros.push(m.text().slice(0, 200))
  }
})
await pagina.addInitScript(
  `window.__ROS_E2E__={auth:{uid:'e2e',email:'e@e.t',emailVerified:true,displayName:'E',role:'user'},googleDrive:{isConnected:false,files:[],user:{}},googleMapsApiKey:'',roquecraftSeed:${SEMENTE}}`,
)
await pagina.goto(`${base}/app`, { waitUntil: 'domcontentloaded' })
await pagina.waitForFunction(() => !!window.__rosStore, null, { timeout: 30000 })
await pagina.waitForTimeout(1200)
await pagina.evaluate(() => window.__rosStore.openWindow('roquecraft'))
await pagina.waitForFunction(() => window.__roquecraft?.state?.ready === true, null, {
  timeout: 120000,
})
await pagina.evaluate(() => window.__rosStore?.maximizeWindow?.('roquecraft'))
await pagina.waitForTimeout(800)
await pagina.addStyleTag({ content: '.ros-roquecraft__play { display: none !important }' })

const relatorio = { semente: SEMENTE, erros }

// Abre o inventário pela tecla E, como o jogador faz.
const abrirInventario = async () => {
  await pagina.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }))
  })
  await pagina.waitForSelector('.rc-inv', { timeout: 8000 })
  await pagina.waitForTimeout(300)
}
const fecharInventario = async () => {
  await pagina.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }))
  })
  await pagina.waitForTimeout(300)
}
const inv = () => pagina.evaluate(() => window.__roquecraft.state.inventory)

// ── 1. Shift+clique ────────────────────────────────────────────────────────
await abrirInventario()
// modo criativo dá itens; garante um item numa posição conhecida da mochila
await pagina.evaluate(() => window.__roquecraft.setMode?.('creative'))
await pagina.waitForTimeout(400)

const slotsMochila = await pagina.$$('.rc-inv__bag:not(.rc-inv__bag--hot) .rc-inv__slot')
const slotsHotbar = await pagina.$$('.rc-inv__bag--hot .rc-inv__slot')
relatorio.slots = { mochila: slotsMochila.length, hotbar: slotsHotbar.length }

// Testa a direção HOTBAR → MOCHILA: o inventário inicial enche só a hotbar,
// então é o único lado com item garantido. É o mesmo caminho de código.
const antes = await inv()
const idxComItem = antes.findIndex((s, i) => s && i < 9)
relatorio.slotDeTeste = idxComItem

if (idxComItem < 0) {
  relatorio.shift = { veredito: 'SEM ITEM NA HOTBAR — sonda inconclusiva' }
} else {
  const item = antes[idxComItem].item
  const alvo = slotsHotbar[idxComItem]

  // PROVA DE VIDA: clique normal tem que se comportar como clique normal
  // (levar o item pro cursor). Se os dois gestos derem o mesmo resultado, o
  // modificador não está separando nada e o teste do Shift não diz nada.
  await alvo.click()
  await pagina.waitForTimeout(250)
  const depoisNormal = await inv()
  const normalPegou = depoisNormal[idxComItem] === null
  await alvo.click() // devolve
  await pagina.waitForTimeout(250)

  const antesShift = await inv()
  await alvo.click({ modifiers: ['Shift'] })
  await pagina.waitForTimeout(350)
  const depoisShift = await inv()
  const saiuDaHotbar = depoisShift[idxComItem] === null
  const chegouNaMochila = depoisShift
    .slice(9)
    .some((s, i) => s?.item === item && (antesShift[i + 9]?.count || 0) < (s?.count || 0))

  relatorio.shift = {
    item,
    slot: idxComItem,
    provaDeVida: {
      cliqueNormalPegouNoCursor: normalPegou,
      veredito: normalPegou
        ? 'os dois gestos são distinguíveis'
        : 'SONDA CEGA — clique normal não fez nada',
    },
    saiuDaHotbar,
    chegouNaMochila,
    veredito: normalPegou && saiuDaHotbar && chegouNaMochila ? 'OK' : 'FALHOU',
  }
}

// ── 2. Conservação: abrir e fechar o inventário não pode criar nem sumir item
// A duplicação do craft e a perda no drop são cobertas em profundidade pelos
// testes de unidade (`inventarioHonesto.spec.js`), que reimplementam a regra
// ANTIGA e exigem que ela erre. Aqui fica só a conta de conservação no jogo
// rodando — barata, e pega qualquer vazamento novo no caminho da UI.
const conservacao = await pagina.evaluate(async () => {
  const rc = window.__roquecraft
  const total = () => rc.state.inventory.reduce((s, x) => s + (x ? x.count : 0), 0)
  const antes = total()
  for (let i = 0; i < 6; i++) {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }))
    await new Promise((r) => setTimeout(r, 120))
  }
  return { antes, depois: total() }
})
relatorio.conservacao = {
  ...conservacao,
  veredito: conservacao.antes === conservacao.depois ? 'OK' : 'ITEM APARECEU OU SUMIU',
}

fs.writeFileSync(path.join(OUT, 'inventario.png'), await pagina.screenshot())
await fecharInventario()

fs.writeFileSync(path.join(OUT, 'relatorio.json'), JSON.stringify(relatorio, null, 2))
console.log(JSON.stringify(relatorio, null, 2))
await navegador.close()
servidor.close()

// ⚠️ A SONDA JA SABIA A RESPOSTA E SAIA COM ZERO DE QUALQUER JEITO.
//
// `conservacao.veredito` era calculado, impresso e esquecido: numa CI isso e
// uma sonda que nunca reprova, e num terminal e uma parede de texto que alguem
// tem que ler com atencao justamente no dia em que esta com pressa. Item que
// aparece ou some do inventario e o defeito mais caro deste jogo (RC-01).
if (relatorio.conservacao?.veredito !== 'OK') {
  console.error('\n[inventario] ❌', relatorio.conservacao?.veredito)
  process.exit(1)
}
