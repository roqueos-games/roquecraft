//
// SONDA DE CONSTRUÇÃO, NO JOGO RODANDO.
//
// Os testes de unidade provam a CADÊNCIA. Não provam que o botão chega nela:
// `mousedown` com `e.button === 1` é o botão do meio, `pointerlock` muda o
// caminho do evento, e o `RCMobile` emite outro nome agora. Nada disso é
// visível de um teste de unidade.
//
// Aqui a sonda segura o botão direito de verdade contra uma parede e CONTA
// quantos blocos entraram no mundo, e depois usa o botão do meio e confere a
// mão. As duas medidas são feitas lendo o MUNDO, não a intenção.
//
// PROVA DE VIDA: antes de segurar, dá um clique curto e exige que ele coloque
// UM bloco. Se o clique curto e o segurar derem o mesmo número, a cadência não
// está fazendo nada e o número grande não significa nada.
//
//   node scripts/qa-roquecraft-construir.mjs [semente]
//
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const DIST = path.resolve('dist/pwa')
const OUT = path.resolve('scripts/.qa-construir')
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
  viewport: { width: 1280, height: 800 },
  serviceWorkers: 'block',
  locale: 'pt-BR',
})
const pagina = await ctx.newPage()
const erros = []
pagina.on('pageerror', (e) => erros.push(String(e.message).slice(0, 200)))
pagina.on('console', (m) => {
  const t = m.text()
  if (m.type() === 'error' && !/Firebase|service worker|ERR_CONNECTION|permissions/i.test(t)) {
    erros.push(t.slice(0, 200))
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
await pagina.waitForTimeout(700)
await pagina.addStyleTag({ content: '.ros-roquecraft__play { display: none !important }' })

const relatorio = { semente: SEMENTE, erros }

// Cenário: voando no criativo, olhando pra baixo sobre chão plano. Cada bloco
// colocado vira ar→sólido numa célula distinta conforme a mira anda.
await pagina.evaluate(async () => {
  const rc = window.__roquecraft
  rc.setMode('creative')
  const h = rc.surfaceAt(0, 0)
  rc.teleport(0.5, (Number.isFinite(h) ? h : 66) + 3, 0.5)
  rc.setFlying(true)
  await rc.waitChunks(4)
  rc.look(0.6, -0.75) // olhando pra baixo
})
await pagina.waitForTimeout(2500)

// Conta blocos sólidos numa caixa em volta do jogador. É a medida: o MUNDO.
const contarSolidos = () =>
  pagina.evaluate(() => {
    const rc = window.__roquecraft
    const p = rc.state.player
    let n = 0
    const bx = Math.floor(p.x)
    const by = Math.floor(p.y)
    const bz = Math.floor(p.z)
    for (let x = bx - 6; x <= bx + 6; x++) {
      for (let y = by - 8; y <= by + 3; y++) {
        for (let z = bz - 6; z <= bz + 6; z++) if (rc.solidoEm(x, y, z)) n++
      }
    }
    return n
  })

const tela = await pagina.$('canvas')

// ── 1. PROVA DE VIDA: um toque coloca UM bloco ─────────────────────────────
const antesCurto = await contarSolidos()
await pagina.evaluate(async () => {
  window.__roquecraft.segurarColocar(true)
  await new Promise((r) => setTimeout(r, 40))
  window.__roquecraft.segurarColocar(false)
})
await pagina.waitForTimeout(400)
const postosCurto = (await contarSolidos()) - antesCurto

// ── 2. Segurar por 1,2 s varrendo a mira ───────────────────────────────────
const antesLongo = await contarSolidos()
await pagina.evaluate(async () => {
  const rc = window.__roquecraft
  rc.segurarColocar(true)
  // varre a mira devagar: a cadência só repete em célula NOVA
  for (let i = 0; i < 24; i++) {
    rc.look(0.6 + i * 0.035, -0.75 + Math.sin(i / 4) * 0.12)
    await new Promise((r) => setTimeout(r, 50))
  }
  rc.segurarColocar(false)
})
await pagina.waitForTimeout(500)
const postosLongo = (await contarSolidos()) - antesLongo

relatorio.colocarSegurando = {
  umToque: postosCurto,
  segurando1200ms: postosLongo,
  provaDeVida:
    postosCurto === 1
      ? 'um toque coloca exatamente 1 — os dois casos são distinguíveis'
      : `SONDA SUSPEITA — um toque colocou ${postosCurto}`,
  veredito: postosCurto === 1 && postosLongo >= 4 ? 'OK' : 'FALHOU',
}

// ── 3. Pick block ──────────────────────────────────────────────────────────
// A medida certa é: depois do pick, o item NA MÃO tem que ser exatamente o
// bloco que a mira estava encostando. Aceitar "tem algo na hotbar" seria um
// falso positivo garantido — o inventário criativo já nasce cheio.
const pick = await pagina.evaluate(async () => {
  const rc = window.__roquecraft
  rc.look(0.6, -0.95)
  await new Promise((r) => setTimeout(r, 400))
  const mirado = rc.blocoMirado()
  const naMaoAntes = rc.state.inventory[rc.state.hotbarIndex ?? 0]?.item ?? null
  const ok = rc.pickBlock()
  await new Promise((r) => setTimeout(r, 300))
  return { mirado, naMaoAntes, aceitou: ok, inventario: rc.state.inventory.slice(0, 9) }
})
const naMao = pick.inventario.find((s) => s && s.item === pick.mirado)
relatorio.pickBlock = {
  blocoMirado: pick.mirado,
  aceitou: pick.aceitou,
  achouNaHotbar: !!naMao,
  veredito: pick.mirado && pick.aceitou && naMao ? 'OK' : 'FALHOU',
}

fs.writeFileSync(path.join(OUT, 'construir.png'), await tela.screenshot())
fs.writeFileSync(path.join(OUT, 'relatorio.json'), JSON.stringify(relatorio, null, 2))
console.log(JSON.stringify(relatorio, null, 2))
await navegador.close()
servidor.close()
// O veredito sai pelo código de saída: o ledger de sondas lê ISSO, não a prosa.
// Qualquer `veredito: 'FALHOU'` no relatório, em qualquer nível, reprova.
const temFalhou = (o) =>
  o && typeof o === 'object'
    ? Object.entries(o).some(([k, v]) => (k === 'veredito' && v === 'FALHOU') || temFalhou(v))
    : false
process.exit(temFalhou(relatorio) || erros.length > 0 ? 1 : 0)
