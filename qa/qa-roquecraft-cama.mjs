//
// QA DA CAMA — cabe inteira, dorme só quando pode, e leva o renascimento junto?
//
// Cinco perguntas, e nenhuma delas é respondida por print sozinho:
//
//  1. ENCAIXE — um clique tem que virar DUAS células (pé + cabeceira) na
//     direção do olhar, e só duas. Medido relendo o MUNDO depois do clique,
//     não olhando a tela: meia cama e cama de três células desenham igual de
//     longe.
//  2. RECUSA DE DIA — avisa, não grava ponto de renascimento e não mexe no
//     relógio. É o "não" que dá sentido ao "sim".
//  3. SONO DE NOITE — pula pro amanhecer e grava o ponto.
//  4. RENASCIMENTO — morrer a 85 blocos da cama e acordar EM CIMA dela. Sem
//     isto a cama é só um botão de pular a noite.
//  5. METADE GÊMEA — quebrar o pé PELO JOGO leva a cabeceira junto. Pelo
//     `fill` não valeria: `fill` escreve direto no mundo e desvia justamente
//     do `breakBlock`, que é onde a regra mora.
//
// A cena é construída ALTO, acima da copa: assim não há nada pra limpar, e
// `fill` com 6 mil edições não sobrevive ao remalhamento (armadilha de
// 22/08/2026, paga de novo na rodada 5). Tudo que é construído é CONFERIDO
// relendo o mundo antes de virar foto.
//
//   node scripts/qa-roquecraft-cama.mjs [semente]
//
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { criarMirar } from './lib/rc-mirar.mjs'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const DIST = path.resolve('dist/pwa')
const OUT = path.resolve('scripts/.qa-cama')
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
// Mira MEDIDA e PROVADA — ver scripts/lib/rc-mirar.mjs. Devolve o erro de
// enquadramento, e esse erro entra no veredito: foto desenquadrada reprova.
const mirar = criarMirar(page)

// Plataforma alta e limpa, acima da copa.
const Y = await page.evaluate(async () => {
  const rc = window.__roquecraft
  const y = Math.round(rc.surfaceAt(0, 0) ?? 66) + 22
  rc.setFlying(true)
  rc.teleport(0.5, y + 3, 6.5)
  rc.fill(-8, y, -8, 8, y, 8, 'stone')
  await new Promise((r) => setTimeout(r, 2500))
  rc.setFx({ hand: false, clouds: false })
  return y
})

// ── 1. A CAMA ENTRA INTEIRA, colocada pelo jogador ───────────────────────
//
// `fill` das duas metades provaria que o mesher desenha. Só o clique prova a
// cadeia: raycast → encaixe → duas escritas no mundo. E é aí que meia cama
// nasce, se nascer.
await page.evaluate(async (y) => {
  const rc = window.__roquecraft
  rc.give('bed', 4)
  rc.selectSlot(rc.slotOf('bed'))
  rc.setFlying(true)
  rc.teleport(3.5, y + 3, 0.5)
  await new Promise((r) => setTimeout(r, 900))
}, Y)
// Mira no tampo do piso em (0, y, 0): o pé nasce em (0, y+1, 0) e a cabeceira
// uma adiante NA DIREÇÃO DO OLHAR — que daqui é o -X.
await mirar(0.5, Y + 1, 0.5)
await page.waitForTimeout(400)
const colocacao = await page.evaluate(async (y) => {
  const rc = window.__roquecraft
  const alvo = rc.miraEm()
  rc.place()
  await new Promise((r) => setTimeout(r, 700))
  return {
    alvo,
    pe: rc.blocoEm(0, y + 1, 0),
    cabeceira: rc.blocoEm(-1, y + 1, 0),
    // A célula do outro lado NÃO pode ter nada: a cama tem duas células, não
    // três, e um encaixe que erra o eixo escreveria aqui.
    atras: rc.blocoEm(1, y + 1, 0),
  }
}, Y)

// ── 2. DORMIR: os dois "não" e o "sim" ───────────────────────────────────
const sono = await page.evaluate(async (y) => {
  const rc = window.__roquecraft
  const espera = (ms) => new Promise((r) => setTimeout(r, ms))
  const tentar = async (tick) => {
    rc.setTime(tick)
    await espera(350)
    rc.dormirEm(0, y + 1, 0)
    await espera(200)
    return { aviso: rc.avisoDaCama(), hora: rc.state.ticks, ponto: rc.pontoDeRenascimento() }
  }
  const deDia = await tentar(6000)
  const deNoite = await tentar(18000)
  return { deDia, deNoite }
}, Y)

// ── 3. MORRER E RENASCER NA CAMA ─────────────────────────────────────────
//
// A pergunta que dá sentido à peça. Sem isto a cama é um botão de pular a
// noite, e o jogador que constrói base longe continua renascendo no outro
// lado do mundo.
const renascimento = await page.evaluate(async (y) => {
  const rc = window.__roquecraft
  const espera = (ms) => new Promise((r) => setTimeout(r, ms))
  // Longe da cama, pra que "renasceu perto" não possa ser coincidência.
  rc.setFlying(true)
  rc.teleport(60.5, y + 3, 60.5)
  await espera(900)
  const antes = { ...rc.state.player }
  rc.matar()
  await espera(400)
  const depois = rc.renascer()
  await espera(600)
  const ponto = rc.pontoDeRenascimento()
  return {
    antes: { x: +antes.x.toFixed(1), z: +antes.z.toFixed(1) },
    depois: { x: +depois.x.toFixed(1), y: +depois.y.toFixed(1), z: +depois.z.toFixed(1) },
    ponto,
    // Renasceu EM CIMA da cama, não em qualquer lugar perto dela.
    naCama: ponto && Math.hypot(depois.x - ponto.x, depois.z - ponto.z) < 0.6,
  }
}, Y)

// ── 4. QUEBRAR UMA METADE LEVA A OUTRA ───────────────────────────────────
const quebra = await page.evaluate(async (y) => {
  const rc = window.__roquecraft
  const espera = (ms) => new Promise((r) => setTimeout(r, ms))
  rc.setFlying(true)
  rc.teleport(0.5, y + 3.4, 3.5)
  await espera(700)
  return {
    antes: [rc.blocoEm(0, y + 1, 0), rc.blocoEm(-1, y + 1, 0)],
    // Quebra o PÉ; a cabeceira tem que sumir junto.
    quebrado: (() => {
      rc.fill(0, y + 1, 0, 0, y + 1, 0, 'air')
      return true
    })(),
  }
}, Y)
// ⚠️ `fill('air')` NÃO passa pelo `breakBlock` — ele escreve direto no mundo,
// e é justamente o caminho de quebrar que carrega a regra da metade gêmea.
// Testar por `fill` mediria o `fill`. A quebra de verdade vai pelo jogo.
await page.evaluate(async (y) => {
  const rc = window.__roquecraft
  // Recoloca a cama e quebra pelo jogo, mirando nela.
  rc.fill(-1, y + 1, 0, -1, y + 1, 0, 'air')
  await new Promise((r) => setTimeout(r, 800))
  rc.give('bed', 2)
  rc.selectSlot(rc.slotOf('bed'))
  rc.teleport(3.5, y + 3, 0.5)
  await new Promise((r) => setTimeout(r, 700))
}, Y)
await mirar(0.5, Y + 1, 0.5)
await page.waitForTimeout(400)
await page.evaluate(async () => {
  window.__roquecraft.place()
  await new Promise((r) => setTimeout(r, 700))
})
await mirar(0.5, Y + 1.3, 0.5)
await page.waitForTimeout(400)
const quebraDeVerdade = await page.evaluate(async (y) => {
  const rc = window.__roquecraft
  const espera = (ms) => new Promise((r) => setTimeout(r, ms))
  const antes = [rc.blocoEm(0, y + 1, 0), rc.blocoEm(-1, y + 1, 0)]
  rc.breakNow()
  await espera(700)
  return { antes, depois: [rc.blocoEm(0, y + 1, 0), rc.blocoEm(-1, y + 1, 0)] }
}, Y)

// ── 5. FOTO ──────────────────────────────────────────────────────────────
await page.evaluate(async (y) => {
  const rc = window.__roquecraft
  // Um quarto: cama, baú ao lado, tocha na parede — pra ver a cama em uso.
  rc.give('bed', 4)
  rc.selectSlot(rc.slotOf('bed'))
  rc.fill(-2, y + 1, -2, -1, y + 1, -2, 'air')
  rc.fill(-2, y + 1, -2, -2, y + 1, -2, 'bed')
  rc.fill(-1, y + 1, -2, -1, y + 1, -2, 'bedHead')
  rc.fill(1, y + 1, -2, 1, y + 1, -2, 'chest')
  rc.fill(-4, y + 1, -2, -4, y + 4, -2, 'oakPlanks')
  rc.setTime(13500)
  rc.setFlying(true)
  rc.teleport(2.5, y + 2.4, 1.5)
  await new Promise((r) => setTimeout(r, 2500))
}, Y)
// ⚠️ CONFERIR ANTES DE FOTOGRAFAR. A foto de 24/08/2026 saiu com o piso vazio
// e eu quase culpei o `fill`: o quarto ESTAVA lá (a foto de cima mostrou), quem
// errou foi a mira. Foto sem leitura do mundo não distingue "não construiu" de
// "olhou pro lado" — e as duas explicações levam a consertos opostos.
const quarto = await page.evaluate((y) => {
  const rc = window.__roquecraft
  return {
    pe: rc.blocoEm(-2, y + 1, -2),
    cabeceira: rc.blocoEm(-1, y + 1, -2),
    bau: rc.blocoEm(1, y + 1, -2),
    parede: rc.blocoEm(-4, y + 2, -2),
  }
}, Y)
const mira01 = await mirar(-1.5, Y + 1.4, -1.5)
await page.waitForTimeout(1200)
fs.writeFileSync(path.join(OUT, '01-quarto.png'), await (tela || page).screenshot())
await page.evaluate(async (y) => {
  window.__roquecraft.teleport(-1.5, y + 6, 2.5)
  await new Promise((r) => setTimeout(r, 500))
}, Y)
await mirar(-1.5, Y + 1.4, -2)
await page.waitForTimeout(1000)
fs.writeFileSync(path.join(OUT, '02-cama-de-cima.png'), await (tela || page).screenshot())
await page.evaluate(() => window.__roquecraft.setFx({ hand: true }))

// O veredito é um objeto de booleanos: a prosa o imprime, o código de saída o julga.
const veredito = {
  // Duas células, e só duas.
  // ⚠️ Desde a rodada 12 a cama tem OITO variantes — quatro direções ×
  // duas metades — e qual par sai depende de para onde o jogador olhava.
  // Comparar com `'bed'` e `'bedHead'` na unha só passaria numa das
  // quatro direções, e a sonda passaria a testar a direção da câmera em
  // vez do encaixe.
  cabeInteira:
    /^bed(Px|Pz|Nx)?$/.test(colocacao.pe) &&
    /^bedHead(Px|Pz|Nx)?$/.test(colocacao.cabeceira) &&
    colocacao.atras === 'air',
  // De dia recusa: avisa, não grava ponto e não pula o relógio.
  //
  // ⚠️ NÃO comparar `hora === 6000`. O relógio do jogo ANDA enquanto a
  // sonda espera — meio segundo de espera vale ~12 ticks — e igualdade
  // exata contra um valor que se move é defeito do instrumento, não do
  // jogo (custou um veredito falso-vermelho em 24/08/2026). O que separa
  // "continuou correndo" de "pulou pro amanhecer" é a DISTÂNCIA: dormir
  // salta ~18 mil ticks, a deriva da espera não passa de dezenas.
  naoDormeDeDia:
    sono.deDia.ponto === null &&
    Math.abs(sono.deDia.hora - 6000) < 200 &&
    !!sono.deDia.aviso &&
    sono.deDia.aviso !== sono.deNoite.aviso,
  // De noite dorme, pula pro amanhecer e grava o ponto.
  dormeDeNoite: sono.deNoite.ponto !== null && sono.deNoite.hora % 24000 < 200,
  renasceNaCama: renascimento.naCama === true,
  // Quebrar uma metade pelo JOGO leva a outra.
  vaiInteira:
    quebraDeVerdade.antes[0] !== 'air' && quebraDeVerdade.depois.every((k) => k === 'air'),
  // O quarto existe NO MUNDO e a foto que o mostra está enquadrada nele.
  // Sem a segunda metade, a primeira foto de 24/08/2026 teria passado —
  // era um piso vazio com um erro de mira de 0,95.
  quartoNaFoto:
    /^bed(Px|Pz|Nx)?$/.test(quarto.pe) &&
    /^bedHead(Px|Pz|Nx)?$/.test(quarto.cabeceira) &&
    quarto.bau === 'chest' &&
    quarto.parede === 'oakPlanks' &&
    mira01 != null &&
    mira01.err < 0.05,
}
console.log(
  JSON.stringify(
    {
      saida: OUT,
      y: Y,
      colocacao,
      sono,
      renascimento,
      quebra: { fill: quebra, jogo: quebraDeVerdade },
      // O quarto lido do mundo, e o erro de mira da foto que o enquadra: se o
      // quarto está certo e a foto sai vazia, o defeito é da mira.
      quarto,
      mira01: mira01 && { err: +mira01.err.toFixed(4), passos: mira01.passos },
      erros,
      veredito,
    },
    null,
    2,
  ),
)
await b.close()
s.close()
process.exit(Object.values(veredito).every(Boolean) && erros.length === 0 ? 0 : 1)
