//
// QA DA ESCADA — nasce virada certo, e dá pra SUBIR por ela?
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
//   node scripts/qa-roquecraft-escada.mjs [semente]
//
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'
import { criarMirar } from './lib/rc-mirar.mjs'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const { PNG } = createRequire(import.meta.url)('pngjs')

const DIST = path.resolve('dist/pwa')
const OUT = path.resolve('scripts/.qa-escada')
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

// Plataforma de pedra alta, acima da copa: nada pra limpar, e `fill` grande não
// sobrevive ao remalhamento (armadilha registrada em 22/08/2026).
const Y = await page.evaluate(async () => {
  const rc = window.__roquecraft
  const y = Math.round(rc.surfaceAt(0, 0) ?? 66) + 22
  rc.setFlying(true)
  rc.teleport(0.5, y + 3, 10.5)
  rc.fill(-12, y, -8, 12, y, 8, 'stone')
  await new Promise((r) => setTimeout(r, 2500))
  rc.setTime(4200)
  rc.setFx({ hand: false, clouds: false })
  await new Promise((r) => setTimeout(r, 800))
  return y
})

// ── 1. A ORIENTAÇÃO VEM DO OLHAR, no jogo rodando ────────────────────────
//
// O teste de unidade prova a REGRA (vetor → orientação). Isto prova a CADEIA:
// posição do jogador → câmera → raycast → encaixe → mundo. Entre a regra e o
// mundo tem quatro peças, e escada virada 180° não se denuncia sozinha — ela
// desenha igual e colide igual, só não dá pra subir.
//
// De cada lado do MESMO bloco, mirando no tampo dele: o degrau baixo tem que
// nascer virado pro lado onde o jogador está.
const orientacao = []
for (const [nome, dx, dz, esperado] of [
  ['jogador no +X', 3, 0, 'stoneStairs'],
  ['jogador no -X', -3, 0, 'stoneStairsNx'],
  ['jogador no +Z', 0, 3, 'stoneStairsPz'],
  ['jogador no -Z', 0, -3, 'stoneStairsNz'],
]) {
  const bx = dx * 2
  const bz = dz * 2
  await page.evaluate(
    async ([y, bx, bz, dx, dz]) => {
      const rc = window.__roquecraft
      rc.fill(bx, y + 1, bz, bx, y + 3, bz, 'air')
      rc.fill(bx, y + 1, bz, bx, y + 1, bz, 'stone')
      rc.give('stoneStairs', 8)
      rc.selectSlot(rc.slotOf('stoneStairs'))
      rc.setFlying(true)
      rc.teleport(bx + 0.5 + dx, y + 3.4, bz + 0.5 + dz)
      await new Promise((r) => setTimeout(r, 900))
    },
    [Y, bx, bz, dx, dz],
  )
  // Mira MEDIDA no tampo do bloco. O olhar que enquadra é o MESMO que decide a
  // orientação — é assim no jogo, e é por isso que o teste é este.
  const mira = await mirar(bx + 0.5, Y + 2, bz + 0.5)
  await page.waitForTimeout(400)
  const r = await page.evaluate(
    async ([y, bx, bz]) => {
      const rc = window.__roquecraft
      const alvo = rc.miraEm()
      rc.place()
      await new Promise((r) => setTimeout(r, 500))
      return { alvo, virou: rc.blocoEm(bx, y + 2, bz) }
    },
    [Y, bx, bz],
  )
  orientacao.push({ nome, esperado, ...r, err: mira ? +mira.err.toFixed(3) : null })
}

// ── 2. A FÍSICA ENXERGA A FORMA, não a célula ────────────────────────────
//
// Pousar no DEGRAU BAIXO tem que parar em meio bloco, e na PARTE ALTA em um
// bloco. O controle é o cubo cheio no mesmo lugar: ali os dois pontos param em
// um bloco. Sem o controle, "parou em 1" não distingue escada de caixa.
const fisica = await page.evaluate(async (y) => {
  const rc = window.__roquecraft
  const espera = (ms) => new Promise((r) => setTimeout(r, ms))
  const pousar = async (px, pz) => {
    rc.teleport(px, y + 4, pz)
    rc.setFlying(false)
    await espera(1500)
    return +(rc.state.player.y - (y + 1)).toFixed(2)
  }
  // Escada com o degrau baixo pro -Z: parte alta em z de 0,5 a 1.
  rc.fill(0, y + 1, 0, 0, y + 3, 0, 'air')
  rc.fill(0, y + 1, 0, 0, y + 1, 0, 'stoneStairsNz')
  await espera(1200)
  const degrauBaixo = await pousar(0.5, 0.2)
  const parteAlta = await pousar(0.5, 0.8)
  // Controle: o MESMO par de pontos sobre um cubo cheio.
  rc.fill(0, y + 1, 0, 0, y + 1, 0, 'stone')
  await espera(1200)
  const cuboBaixo = await pousar(0.5, 0.2)
  const cuboAlto = await pousar(0.5, 0.8)
  rc.setFlying(true)
  return { degrauBaixo, parteAlta, cuboBaixo, cuboAlto }
}, Y)

// ── 3. FOTOS de um lance de escada ────────────────────────────────────────
await page.evaluate(async (y) => {
  const rc = window.__roquecraft
  // Lance de cinco degraus subindo pro -Z, apoiado numa rampa de pedra.
  for (let i = 0; i < 5; i++) {
    const z = 2 - i
    if (i > 0) rc.fill(0, y + 1, z, 0, y + i, z, 'stone')
    rc.fill(0, y + 1 + i, z, 0, y + 1 + i, z, 'stoneStairsNz')
  }
  // E um lance invertido, pendurado no teto, pro caso da metade de cima.
  for (let i = 0; i < 3; i++) rc.fill(3, y + 4 - i, 2 - i, 3, y + 4 - i, 2 - i, 'oakStairsNzTopo')
  rc.fill(-3, y + 1, 0, -3, y + 1, 0, 'cobblestoneStairs')
  rc.fill(-3, y + 1, 2, -3, y + 1, 2, 'spruceStairsPz')
  await new Promise((r) => setTimeout(r, 2500))
}, Y)
const fotos = []
for (const [nome, px, py, pz, ax, ay, az] of [
  ['01-lance-de-lado', 7.5, Y + 5, 0.5, 0.5, Y + 3, -0.5],
  ['02-lance-de-frente', 0.5, Y + 3.4, 8.5, 0.5, Y + 3, -1.5],
  ['03-quatro-materiais', -6.5, Y + 3.2, 6.5, -2.5, Y + 2, 1],
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
  await page.waitForTimeout(1100)
  fs.writeFileSync(path.join(OUT, `${nome}.png`), await (tela || page).screenshot())
  fotos.push(nome)
}
await page.evaluate(() => window.__roquecraft.setFx({ hand: true }))

// ── 4. A SILHUETA, EM TEXTO ───────────────────────────────────────────────
//
// A foto vai pro disco, mas nem sempre dá pra abrir a foto de onde este
// harness roda. A silhueta em texto é a mesma informação para a pergunta que
// importa aqui: o degrau tem o RECORTE em L, ou saiu um bloco maciço? Um
// buraco de face invertida também aparece — vira céu no meio do sólido.
//
// `#` = escuro (pedra na sombra), `+` = médio, `.` = claro, ' ' = céu.
function silhueta(buf, x0, y0, larg, alt, passo) {
  const img = PNG.sync.read(buf)
  const linhas = []
  for (let j = 0; j < alt; j += passo * 2) {
    let linha = ''
    for (let i = 0; i < larg; i += passo) {
      const px = ((y0 + j) * img.width + (x0 + i)) * 4
      // CÉU ou SÓLIDO, e nada entre os dois. Classificar por faixa de
      // luminância parecia mais informativo e era ruído: o sol anda entre uma
      // foto e outra, a sombra muda de tom, e caracteres viravam de nível o
      // quadro inteiro. A pergunta aqui é SILHUETA — o resto é decoração que
      // contamina o controle.
      const azul = img.data[px + 2] > img.data[px] + 14 && img.data[px + 2] > 150
      linha += azul ? ' ' : '#'
    }
    linhas.push(linha)
  }
  return linhas
}
//
// UMA escada só, de perto, isolada no ar. O lance inteiro não serve pra isto:
// ele foi construído sobre uma rampa de pedra, e trocar a escada por cubo mexe
// em um bloco de cada coluna — a silhueta quase não muda e o controle não
// controla nada. Foi o que aconteceu na primeira tentativa.
await page.evaluate(async (y) => {
  const rc = window.__roquecraft
  rc.fill(-6, y + 2, -6, -4, y + 6, -4, 'air')
  rc.fill(-5, y + 4, -5, -5, y + 4, -5, 'stoneStairsNz')
  rc.setFlying(true)
  rc.setFx({ hand: false })
  // Câmera ABAIXO da escada, olhando pra cima: o fundo vira CÉU e a silhueta
  // fica sem ambiguidade. Contra o terreno distante, o recorte do degrau some
  // no meio da paisagem.
  rc.teleport(-1.2, y + 2.2, -5.5)
  await new Promise((r) => setTimeout(r, 2200))
}, Y)
await mirar(-4.5, Y + 4.9, -4.5)
await page.evaluate(() => window.__roquecraft.setTime(4200))
await page.waitForTimeout(1000)
// ⚠️ O RECORTE É MEDIDO, não chutado. A primeira versão cravou um retângulo em
// pixels e caiu no terreno de fundo: as duas silhuetas saíram idênticas e o
// veredito virou ruído. Aqui os cantos do lance são PROJETADOS na tela e o
// recorte é o que sobrar deles.
const janela = await page.evaluate(async (y) => {
  const rc = window.__roquecraft
  let u0 = 1
  let v0 = 1
  let u1 = 0
  let v1 = 0
  for (const dz of [0, 1]) {
    for (const dy of [0, 1]) {
      for (const dx of [0, 1]) {
        const p = rc.projetar(-5 + dx, y + 4 + dy, -5 + dz)
        if (!p || !p.frente) continue
        u0 = Math.min(u0, p.u)
        v0 = Math.min(v0, p.v)
        u1 = Math.max(u1, p.u)
        v1 = Math.max(v1, p.v)
      }
    }
  }
  return { u0, v0, u1, v1 }
}, Y)
const LARG = 1280
const ALT = 720
const cx0 = Math.max(0, Math.round((janela.u0 - 0.02) * LARG))
const cy0 = Math.max(0, Math.round((janela.v0 - 0.02) * ALT))
const cw = Math.min(LARG - cx0, Math.round((janela.u1 - janela.u0 + 0.04) * LARG))
const ch = Math.min(ALT - cy0, Math.round((janela.v1 - janela.v0 + 0.04) * ALT))
const passo = Math.max(3, Math.round(cw / 78))
const tiraEscada = silhueta(await (tela || page).screenshot(), cx0, cy0, cw, ch, passo)
// CONTROLE: o mesmo lance em cubo cheio, da mesma câmera. Sem ele, "vi degrau"
// é impressão — com ele, a diferença entre as duas silhuetas É o recorte.
await page.evaluate(async (y) => {
  const rc = window.__roquecraft
  rc.fill(-5, y + 4, -5, -5, y + 4, -5, 'stone')
  await new Promise((r) => setTimeout(r, 2200))
  // ⚠️ MESMO instante do dia das duas fotos. O sol anda entre elas, e sombra
  // que muda de tom vira diferença de silhueta que não existe.
  rc.setTime(4200)
}, Y)
await page.waitForTimeout(800)
const tiraCubo = silhueta(await (tela || page).screenshot(), cx0, cy0, cw, ch, passo)
// Quantos caracteres a escada tem de céu onde o cubo tem sólido. É o RECORTE,
// contado — "as duas strings são diferentes" aceitaria uma folha tremendo ao
// fundo como prova de que a escada tem degrau.
let recortou = 0
for (let j = 0; j < Math.min(tiraEscada.length, tiraCubo.length); j++) {
  for (let i = 0; i < Math.min(tiraEscada[j].length, tiraCubo[j].length); i++) {
    if (tiraEscada[j][i] === ' ' && tiraCubo[j][i] === '#') recortou++
  }
}

// O veredito é um objeto de booleanos: a prosa o imprime, o código de saída o julga.
const veredito = {
  // Os quatro lados produziram as quatro variantes esperadas.
  orientacaoChega: orientacao.every((o) => o.virou === o.esperado),
  // A física distingue as duas metades da escada...
  formaNaFisica: fisica.degrauBaixo === 0.5 && fisica.parteAlta === 1,
  // ...e o controle mostra que o medidor NÃO daria isso pra um cubo.
  controleDoCubo: fisica.cuboBaixo === 1 && fisica.cuboAlto === 1,
  // A silhueta tem o recorte em L: céu onde o cubo seria sólido.
  temRecorte: recortou > 30,
}
console.log(
  JSON.stringify(
    {
      saida: OUT,
      y: Y,
      tiraEscada,
      tiraCubo,
      recortou,
      orientacao,
      fisica,
      fotos,
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
