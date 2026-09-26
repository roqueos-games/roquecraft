//
// QA DA LAJE — ela existe, encaixa, funde e dá pra pisar em cima?
//
// Quatro perguntas, e nenhuma delas é respondida por print sozinho:
//
//  1. GEOMETRIA — a laje tem meia altura e não abre buraco no vizinho. Só a
//     foto responde, e é por isso que a cena é CONSTRUÍDA: terreno natural não
//     tem laje, e comparar encostas diferentes não prova nada.
//  2. ENCAIXE — clicar em cima dá a metade de baixo, clicar embaixo dá a de
//     cima. Medido lendo o MUNDO depois do clique, não olhando a tela.
//  3. FUSÃO — encostar laje na metade vazia de outra igual vira bloco cheio.
//  4. FÍSICA — dá pra subir na laje andando, e o pé para em +0,5.
//
// A cena é construída ALTO, acima da copa: assim não há nada pra limpar, e
// `fill` com 6 mil edições não sobrevive ao remalhamento (armadilha de
// 22/08/2026, paga de novo na rodada 5). Tudo que é construído é CONFERIDO
// relendo o mundo antes de virar foto.
//
//   node scripts/qa-roquecraft-laje.mjs [semente]
//
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { criarMirar } from './lib/rc-mirar.mjs'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const DIST = path.resolve('dist/pwa')
const OUT = path.resolve('scripts/.qa-laje')
fs.mkdirSync(OUT, { recursive: true })
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
const SEMENTE = Number(process.argv[2] || 942457)

const b = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const ctx = await b.newContext({
  viewport: { width: 1280, height: 720 },
  serviceWorkers: 'block',
  locale: 'pt-BR',
})
const page = await ctx.newPage()
const erros = []
page.on('pageerror', (e) => erros.push(String(e.message).slice(0, 200)))
page.on('console', (m) => {
  const t = m.text()
  if (/Shader|WebGL|INVALID|context lost/i.test(t)) erros.push(t.slice(0, 200))
})
await page.addInitScript(
  `window.__ROS_E2E__={auth:{uid:'e2e',email:'e@e.t',emailVerified:true,displayName:'E',role:'user'},googleDrive:{isConnected:false,files:[],user:{}},googleMapsApiKey:'',roquecraftSeed:${SEMENTE}}`,
)
await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => !!window.__rosStore, null, { timeout: 30000 })
await page.waitForTimeout(1200)
await page.evaluate(() => window.__rosStore.openWindow('roquecraft'))
await page.waitForFunction(() => window.__roquecraft?.state?.ready === true, null, {
  timeout: 120000,
})
await page.evaluate(async () => {
  window.__roquecraft.setQuality('ultra')
  await new Promise((r) => setTimeout(r, 3000))
  window.__rosStore?.maximizeWindow?.('roquecraft')
  await new Promise((r) => setTimeout(r, 900))
})
await page.addStyleTag({ content: '.ros-roquecraft__play { display: none !important }' })
await page.waitForTimeout(600)
await page.evaluate(async () => {
  const rc = window.__roquecraft
  const h = rc.surfaceAt(0, 0)
  rc.teleport(0.5, (Number.isFinite(h) ? h : 66) + 2, 0.5)
  await rc.waitChunks(5)
})
await page.waitForTimeout(2500)

const tela = await page.$('canvas')
// Mira MEDIDA e PROVADA — ver scripts/lib/rc-mirar.mjs. Enumerar convenções de
// yaw acertava por sorte em foto picada e errava a tela inteira em foto rasa
// (24/08/2026, sonda da cama). Agora mede a resposta e fecha a malha.
const mirar = criarMirar(page)

// ── 1. A CENA CONSTRUÍDA ──────────────────────────────────────────────────
const cena = await page.evaluate(async () => {
  const rc = window.__roquecraft
  const y = Math.round(rc.surfaceAt(0, 0) ?? 66) + 22
  rc.setFlying(true)
  rc.teleport(0.5, y + 4, 14.5)
  // Piso de pedra 21×13, e em cima dele os casos que interessam.
  rc.fill(-10, y, -6, 10, y, 6, 'stone')
  // (a) fila de laje de BAIXO
  rc.fill(-8, y + 1, -4, -4, y + 1, -4, 'stoneSlab')
  // (b) fila de laje de TOPO — flutua na metade de cima da célula
  rc.fill(-2, y + 1, -4, 2, y + 1, -4, 'stoneSlabTopo')
  // (c) escada feita de laje: cada degrau meio bloco acima do anterior
  for (let i = 0; i < 5; i++) {
    rc.fill(4 + i, y + 1 + Math.floor(i / 2), 0, 4 + i, y + 1 + Math.floor(i / 2), 0, 'stoneSlab')
  }
  // (d) BLOCO CHEIO em cima de laje — é onde o tampo da laje sumia
  rc.fill(-8, y + 1, 2, -8, y + 1, 2, 'oakSlab')
  rc.fill(-8, y + 2, 2, -8, y + 2, 2, 'stone')
  // (e) laje de TOPO com bloco cheio embaixo — é onde o piso dela sumia
  rc.fill(-5, y + 1, 2, -5, y + 1, 2, 'stone')
  rc.fill(-5, y + 2, 2, -5, y + 2, 2, 'oakSlabTopo')
  // (f) duas lajes de baixo EMPILHADAS: tem que ver dois degraus, não parede
  rc.fill(-2, y + 1, 2, -2, y + 1, 2, 'cobblestoneSlab')
  rc.fill(-2, y + 2, 2, -2, y + 2, 2, 'cobblestoneSlab')
  // (g) piso de laje 3×3 pra conferir que o tampo funde sem costura
  rc.fill(1, y + 1, 2, 3, y + 1, 4, 'spruceSlab')
  await new Promise((r) => setTimeout(r, 3000))
  rc.setTime(4200)
  rc.setFx({ clouds: false, hand: false })
  await new Promise((r) => setTimeout(r, 1500))
  // PROVA DE VIDA DA CENA: `fill` devolver número não prova que sobreviveu ao
  // remalhamento. Quem responde é o mundo, relido.
  return {
    y,
    piso: rc.blocoEm(0, y, 0),
    lajeBaixo: rc.blocoEm(-6, y + 1, -4),
    lajeTopo: rc.blocoEm(0, y + 1, -4),
    sobLajeDeCarvalho: rc.blocoEm(-8, y + 2, 2),
    empilhada: rc.blocoEm(-2, y + 2, 2),
  }
})
if (cena.piso !== 'stone' || cena.lajeBaixo !== 'stoneSlab' || cena.lajeTopo !== 'stoneSlabTopo') {
  console.log(JSON.stringify({ erro: 'a cena construída não sobreviveu', cena }, null, 2))
  await b.close()
  s.close()
  process.exit(1)
}

const fotos = []
for (const [nome, px, py, pz, ax, ay, az] of [
  ['01-lajes-de-frente', 0.5, cena.y + 2.2, 10.5, 0, cena.y + 1.4, -2],
  ['02-lajes-de-lado', -13.5, cena.y + 2.4, 0.5, 0, cena.y + 1.4, 0],
  ['03-escada-de-laje', 9.5, cena.y + 2.6, 6.5, 6, cena.y + 2, 0],
  ['04-de-cima', 0.5, cena.y + 9, 9.5, 0, cena.y + 1, 0],
]) {
  await page.evaluate(
    async ([px, py, pz]) => {
      window.__roquecraft.setFlying(true)
      window.__roquecraft.teleport(px, py, pz)
      await new Promise((r) => setTimeout(r, 500))
    },
    [px, py, pz],
  )
  await mirar(ax, ay, az)
  await page.waitForTimeout(1200)
  fs.writeFileSync(path.join(OUT, `${nome}.png`), await (tela || page).screenshot())
  fotos.push(nome)
}

// ── 2. ENCAIXE E FUSÃO, NO JOGO RODANDO ───────────────────────────────────
//
// O teste de unidade prova a REGRA; isto prova que a regra chegou ao mundo.
// São coisas diferentes: entre a regra e o mundo tem raycast, item na mão,
// checagem de replaceable e o `applyEdit`. Cada um já quebrou uma cadeia
// dessas em rodada anterior.
//
// ⚠️ A altura vem de FORA. Recalcular `surfaceAt` aqui devolve outro número:
// a plataforma que acabei de construir virou a superfície daquela coluna, e a
// bancada nasceria 24 blocos acima da cena. Aconteceu na primeira execução.
const Y = cena.y
await page.evaluate(async (y) => {
  const rc = window.__roquecraft
  rc.fill(8, y + 1, -5, 8, y + 4, -5, 'air')
  rc.fill(8, y + 1, -5, 8, y + 1, -5, 'stone')
  rc.give('stoneSlab', 8)
  rc.selectSlot(rc.slotOf('stoneSlab'))
  rc.setFlying(true)
  rc.teleport(8.5, y + 5, -4.5)
  await new Promise((r) => setTimeout(r, 1400))
}, Y)
// Mira no TAMPO do bloco de pedra. Medida, não deduzida.
const miraEncaixe = await mirar(8.5, Y + 2, -4.5)
await page.waitForTimeout(500)
const encaixe = await page.evaluate(async (y) => {
  const rc = window.__roquecraft
  const espera = (ms) => new Promise((r) => setTimeout(r, ms))
  rc.miraEm()
  const alvo = rc.blocoMirado()
  rc.place()
  await espera(700)
  const aposCima = rc.blocoEm(8, y + 2, -5)
  // Segundo clique na MESMA mira: agora o alvo é a laje, e o tampo dela é a
  // metade vazia → as duas viram bloco cheio, na célula DA LAJE.
  rc.place()
  await espera(700)
  const aposFusao = rc.blocoEm(8, y + 2, -5)
  return { alvo, aposCima, aposFusao }
}, Y)

// ── 3. FÍSICA: sobe na laje andando, e o pé para em +0,5 ──────────────────
await page.evaluate(async (y) => {
  const rc = window.__roquecraft
  // Corredor limpo, com UMA laje no meio do caminho.
  rc.fill(-9, y + 1, 5, 9, y + 4, 5, 'air')
  rc.fill(0, y + 1, 5, 0, y + 1, 5, 'stoneSlab')
  // ⚠️ `setFlying(false)` vem DEPOIS do teleporte. O teleporte LIGA o voo (é
  // o que deixa o QA enquadrar cena sem despencar), então desligar antes não
  // desliga nada — e voando o `degrau` nunca dispara, porque ele exige estar
  // no chão. O jogador batia na laje e parava, e parecia defeito de física.
  rc.teleport(-3.5, y + 1.2, 5.5)
  rc.setFlying(false)
  await new Promise((r) => setTimeout(r, 1600))
}, Y)
// Vira pro +X ANTES de andar: `press('forward')` anda na direção da câmera, e
// a convenção de yaw não é chutável (ver `mirar`).
await mirar(9, Y + 1.6, 5.5)
const fisica = await page.evaluate(async (y) => {
  const rc = window.__roquecraft
  const espera = (ms) => new Promise((r) => setTimeout(r, ms))
  const antes = rc.state.player.y
  // ⚠️ Medir o y FINAL não responde nada: depois de passar por cima da laje o
  // jogador desce de volta pro piso, e o número volta ao inicial. Quem
  // responde "subiu" é o PICO durante a travessia. A primeira versão desta
  // sonda mediu o fim e concluiu que não subia — com o jogador já do outro
  // lado da laje, 5 blocos adiante.
  let pico = antes
  rc.press('forward', true)
  for (let i = 0; i < 18; i++) {
    await espera(100)
    pico = Math.max(pico, rc.state.player.y)
  }
  rc.press('forward', false)
  await espera(500)
  const p = rc.state.player
  return {
    antes: +antes.toFixed(2),
    pico: +pico.toFixed(2),
    depois: +p.y.toFixed(2),
    x: +p.x.toFixed(2),
    // O piso está em y+1 e o tampo da laje em y+1,5.
    subiuMeioBloco: Math.abs(pico - (y + 1.5)) < 0.12,
    passouDaLaje: p.x > 0.5,
  }
}, Y)

console.log(
  JSON.stringify(
    {
      saida: OUT,
      cena,
      fotos,
      encaixe,
      miraEncaixe,
      fisica,
      erros,
      veredito: {
        cliqueDeCimaDaMetadeDeBaixo: encaixe.aposCima === 'stoneSlab',
        duasMetadesViramBlocoCheio: encaixe.aposFusao === 'stone',
        sobeNaLajeAndando: fisica.subiuMeioBloco && fisica.passouDaLaje,
      },
    },
    null,
    2,
  ),
)
await b.close()
s.close()
