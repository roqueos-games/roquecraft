//
// QA DO FLUXO DA ÁGUA — ela corre, acha a beirada, seca, e a lâmina baixa?
//
// (A sonda da APARÊNCIA da água — onda, espuma, profundidade — é a
// `qa-roquecraft-agua.mjs`. Esta aqui é do movimento.)
//
// Sete perguntas. Cinco são lidas do MUNDO; uma só a foto responde, e vem com
// controle; uma é sobre o que NÃO acontece.
//
//  1. SETE BLOCOS — a fonte alaga exatamente sete, com nível 1 a 7, e o oitavo
//     fica seco. É o alcance do original.
//  2. SECA — tirada a fonte, some tudo. Sem isto o rio fica parado pra sempre
//     e o mundo vira um pântano de água órfã.
//  3. ACHA A BEIRADA — com buraco de um lado só, a água corre pra lá e NÃO
//     enche o outro lado. O par é obrigatório: "correu pro buraco" sem "não
//     correu pro outro lado" também é compatível com "espalhou pra tudo".
//  4. CAI E EMPOÇA — na queda a coluna enche a célula (nível 8) e no pé faz
//     poça, que é o que a força de nascente da coluna faz no original.
//  5. ÁGUA INFINITA — duas fontes com um vão no meio, com chão embaixo, fazem
//     fonte no meio.
//  6. A LÂMINA BAIXA — foto. Nível é altura, e altura só se vê. O controle é a
//     MESMA calha cheia de fonte: lâmina de fonte é plana, lâmina com nível é
//     escada. Sem o controle, a perspectiva sozinha já inclina qualquer
//     superfície e a foto não prova nada.
//  7. NÃO ENTRA NO SAVE — encher uma cova muda milhares de células; nenhuma
//     delas pode virar edição gravada. O que se guarda é a FONTE.
//
// A cena é construída ALTO, acima da copa, e o mundo é relido antes de virar
// foto. As duas regras foram compradas com sondas que mediram o cenário.
//
//   node scripts/qa-roquecraft-fluxo.mjs [semente]
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
const OUT = path.resolve('scripts/.qa-fluxo')
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

const mirar = criarMirar(page)

const Y = await page.evaluate(async () => {
  const rc = window.__roquecraft
  const y = Math.round(rc.surfaceAt(0, 0) ?? 66) + 26
  rc.setFlying(true)
  rc.teleport(0.5, y + 5, 14.5)
  rc.fill(-14, y, -14, 14, y, 14, 'stone')
  await new Promise((r) => setTimeout(r, 2500))
  rc.setFx({ hand: false, clouds: false })
  rc.setTime(6000)
  return y
})

// ── 1. SETE BLOCOS ───────────────────────────────────────────────────────
const alcance = await page.evaluate(async (y) => {
  const rc = window.__roquecraft
  rc.fill(0, y + 1, 0, 0, y + 1, 0, 'water')
  const escoou = rc.escoarFluidos()
  await new Promise((r) => setTimeout(r, 400))
  const niveis = []
  for (let x = 0; x <= 9; x++) niveis.push(rc.nivelDeAguaEm(x, y + 1, 0))
  return { niveis, escoou, gravadas: rc.edicoesGravadas() }
}, Y)

// ── 2. SECA (mesma cena, e por isso vem logo em seguida) ─────────────────
const secagem = await page.evaluate(async (y) => {
  const rc = window.__roquecraft
  rc.fill(0, y + 1, 0, 0, y + 1, 0, 'air')
  const escoou = rc.escoarFluidos()
  await new Promise((r) => setTimeout(r, 400))
  let molhadas = 0
  for (let x = -9; x <= 9; x++) {
    for (let z = -9; z <= 9; z++) if (rc.nivelDeAguaEm(x, y + 1, z) >= 0) molhadas++
  }
  return { molhadas, escoou }
}, Y)

// ── 3. ACHA A BEIRADA ────────────────────────────────────────────────────
const beirada = await page.evaluate(async (y) => {
  const rc = window.__roquecraft
  const espera = (ms) => new Promise((r) => setTimeout(r, ms))
  // Buraco no piso a três blocos, no +x. Nada no −x.
  rc.fill(3, y, -6, 3, y, -6, 'air')
  await espera(300)
  rc.fill(0, y + 1, -6, 0, y + 1, -6, 'water')
  const escoou = rc.escoarFluidos()
  await espera(400)
  return {
    escoou,
    // Correu pro buraco...
    paraOBuraco: [1, 2, 3].map((d) => rc.nivelDeAguaEm(d, y + 1, -6)),
    // ...e NÃO correu pro outro lado. Este é o controle.
    paraOOutroLado: [1, 2, 3].map((d) => rc.nivelDeAguaEm(-d, y + 1, -6)),
    // E desceu pelo buraco.
    desceu: rc.nivelDeAguaEm(3, y, -6),
  }
}, Y)

// ── 4. CAI E EMPOÇA ──────────────────────────────────────────────────────
const queda = await page.evaluate(async (y) => {
  const rc = window.__roquecraft
  const espera = (ms) => new Promise((r) => setTimeout(r, ms))
  // Prateleira 5 acima do piso, com a fonte na ponta de fora.
  rc.fill(-6, y + 5, 6, -3, y + 5, 6, 'stone')
  await espera(300)
  rc.fill(-6, y + 6, 6, -6, y + 6, 6, 'water')
  const escoou = rc.escoarFluidos()
  await espera(400)
  return {
    escoou,
    // A coluna entre a prateleira e o piso é água CAINDO (nível 8).
    coluna: [y + 4, y + 3, y + 2].map((j) => rc.nivelDeAguaEm(-7, j, 6)),
    // E no pé fez poça: a coluna alimenta como nascente.
    poca: [1, 2, 3].map((d) => rc.nivelDeAguaEm(-7 - d, y + 1, 6)),
  }
}, Y)

// ── 5. ÁGUA INFINITA ─────────────────────────────────────────────────────
const infinita = await page.evaluate(async (y) => {
  const rc = window.__roquecraft
  const espera = (ms) => new Promise((r) => setTimeout(r, ms))
  rc.fill(8, y + 1, 8, 8, y + 1, 8, 'water')
  rc.fill(10, y + 1, 8, 10, y + 1, 8, 'water')
  const escoou = rc.escoarFluidos()
  await espera(400)
  return { escoou, meio: rc.nivelDeAguaEm(9, y + 1, 8) }
}, Y)

// ── 6. A LÂMINA BAIXA (foto, com controle) ───────────────────────────────
const CALHA_Y = Y + 1
await page.evaluate(
  async ([y, calha]) => {
    const rc = window.__roquecraft
    // Paredes: sem elas a água escapa pelos lados e a calha não é calha.
    rc.fill(-1, calha, -12, 9, calha, -12, 'stone')
    rc.fill(-1, calha, -10, 9, calha, -10, 'stone')
    rc.fill(-1, calha, -11, -1, calha, -11, 'stone')
    rc.fill(9, calha, -11, 9, calha, -11, 'stone')
    rc.setFlying(true)
    rc.teleport(4.5, y + 4, -4.5)
    await new Promise((r) => setTimeout(r, 1400))
  },
  [Y, CALHA_Y],
)
await mirar(4.5, CALHA_Y + 0.5, -11.5)
await page.waitForTimeout(500)
const fotoSeca = await page.screenshot()
fs.writeFileSync(path.join(OUT, '00-calha-seca.png'), fotoSeca)

const calha = await page.evaluate(
  async ([_y, calha]) => {
    const rc = window.__roquecraft
    rc.fill(0, calha, -11, 0, calha, -11, 'water')
    const escoou = rc.escoarFluidos()
    await new Promise((r) => setTimeout(r, 700))
    const niveis = []
    for (let x = 0; x <= 8; x++) niveis.push(rc.nivelDeAguaEm(x, calha, -11))
    return { escoou, niveis }
  },
  [Y, CALHA_Y],
)
const fotoComNivel = await page.screenshot()
fs.writeFileSync(path.join(OUT, '01-calha-com-nivel.png'), fotoComNivel)

// CONTROLE: a mesma calha, toda fonte. Lâmina plana.
const calhaPlana = await page.evaluate(
  async ([_y, calha]) => {
    const rc = window.__roquecraft
    rc.fill(0, calha, -11, 8, calha, -11, 'water')
    rc.escoarFluidos()
    await new Promise((r) => setTimeout(r, 900))
    const niveis = []
    for (let x = 0; x <= 8; x++) niveis.push(rc.nivelDeAguaEm(x, calha, -11))
    return { niveis }
  },
  [Y, CALHA_Y],
)
const fotoPlana = await page.screenshot()
fs.writeFileSync(path.join(OUT, '02-calha-plana.png'), fotoPlana)

const gravadasNoFim = await page.evaluate(() => window.__roquecraft.edicoesGravadas())

// ── Medição das fotos ────────────────────────────────────────────────────
//
// Por DIFERENÇA, não por cor: a cor da água muda com a hora, com o céu e com a
// espuma, e um limiar absoluto mediria o dia. O que mudou entre a calha seca e
// a calha cheia é a lâmina — e o topo dela, coluna a coluna, é a silhueta.
function silhueta(seca, molhada) {
  const a = PNG.sync.read(seca)
  const d = PNG.sync.read(molhada)
  const topo = []
  for (let x = 0; x < d.width; x++) {
    let primeiro = -1
    let conta = 0
    for (let y = 0; y < d.height; y++) {
      const i = (d.width * y + x) << 2
      const dif =
        Math.abs(d.data[i] - a.data[i]) +
        Math.abs(d.data[i + 1] - a.data[i + 1]) +
        Math.abs(d.data[i + 2] - a.data[i + 2])
      if (dif < 30) continue
      // ⚠️ Mudou NÃO basta. Encher a calha muda também a PAREDE: a água é
      // translúcida e mexe na luz que chega na pedra atrás. A primeira versão
      // pegava o topo de qualquer pixel alterado, achava a parede iluminada
      // lá em cima, e mediu um espalhamento de 312 px nos dois casos — ou
      // seja, mediu a parede nos dois e não viu lâmina nenhuma.
      //
      // A lâmina é AZUL: canal azul acima do vermelho. A pedra iluminada não é.
      if (d.data[i + 2] <= d.data[i] + 10) continue
      conta++
      if (primeiro < 0) primeiro = y
    }
    // Coluna com meia dúzia de pixels de água é respingo de borda, não lâmina.
    if (conta >= 6) topo.push([x, primeiro])
  }
  if (topo.length < 40) return { colunas: topo.length, inclinacao: null }
  // Reta de mínimos quadrados: a INCLINAÇÃO é o sinal. Com nível, a lâmina
  // desce ~8 px por degrau; sem nível ela só acompanha a perspectiva, que é a
  // mesma nas duas fotos porque a câmera não se mexeu.
  const n = topo.length
  const mx = topo.reduce((s2, [x]) => s2 + x, 0) / n
  const my = topo.reduce((s2, [, y]) => s2 + y, 0) / n
  let num = 0
  let den = 0
  for (const [x, y] of topo) {
    num += (x - mx) * (y - my)
    den += (x - mx) ** 2
  }
  const inclinacao = den ? num / den : 0
  const ys = topo.map(([, y]) => y)
  return {
    colunas: n,
    minimo: Math.min(...ys),
    maximo: Math.max(...ys),
    espalhamento: Math.max(...ys) - Math.min(...ys),
    inclinacao: +inclinacao.toFixed(4),
    // Quanto a lâmina desce de ponta a ponta, em pixels.
    descidaTotal: +(
      inclinacao *
      (Math.max(...topo.map(([x]) => x)) - Math.min(...topo.map(([x]) => x)))
    ).toFixed(1),
  }
}
const comNivel = silhueta(fotoSeca, fotoComNivel)
const plana = silhueta(fotoSeca, fotoPlana)

// O veredito é um objeto de booleanos: a prosa o imprime, o código de saída o julga.
const veredito = {
  // Nível 1 a 7 nos sete primeiros, e o oitavo seco.
  seteBlocos:
    JSON.stringify(alcance.niveis.slice(0, 8)) === JSON.stringify([0, 1, 2, 3, 4, 5, 6, 7]) &&
    alcance.niveis[8] === -1,
  converge: alcance.escoou.sobrou === 0 && secagem.escoou.sobrou === 0,
  // Tirada a fonte, some tudo.
  seca: secagem.molhadas === 0,
  // Correu pro buraco E não correu pro outro lado. O par é a prova.
  achaABeirada:
    beirada.paraOBuraco.every((n) => n >= 0) &&
    beirada.paraOOutroLado.every((n) => n === -1) &&
    beirada.desceu >= 0,
  // Coluna cheia na queda, e poça no pé.
  caiEEmpoca: queda.coluna.every((n) => n === 8) && queda.poca.some((n) => n >= 0),
  aguaInfinita: infinita.meio === 0,
  // A lâmina com nível é ESCADA; a mesma calha cheia de fonte é plana.
  // Sem o controle plano, a perspectiva sozinha explicaria o degrau.
  // A lâmina com nível desce mais que a mesma calha cheia de fonte.
  //
  // ⚠️ A conta é a DIFERENÇA entre as duas, não cada uma contra um
  // limiar. Uma superfície plana vista de esguelha já desce sozinha na
  // tela, e quanto ela desce depende de onde a mira parou — que varia de
  // execução pra execução. Com limiar absoluto o teste passou numa
  // execução (plana em −4) e reprovou na seguinte (plana em −20,6) com o
  // mesmo jogo. As duas fotos são tiradas da MESMA câmera, sem mexer
  // nela: subtrair uma da outra apaga a perspectiva e deixa só o nível.
  laminaBaixa:
    comNivel.descidaTotal != null &&
    plana.descidaTotal != null &&
    comNivel.descidaTotal - plana.descidaTotal > 20,
  // Milhares de células mudaram; nenhuma virou edição gravada.
  naoEntraNoSave: gravadasNoFim - alcance.gravadas < 200,
}
console.log(
  JSON.stringify(
    {
      saida: OUT,
      y: Y,
      alcance,
      secagem,
      beirada,
      queda,
      infinita,
      calha: { comNivel: calha, plana: calhaPlana },
      silhueta: { comNivel, plana },
      gravadas: { depoisDoPrimeiroLago: alcance.gravadas, noFim: gravadasNoFim },
      erros,
      veredito,
    },
    null,
    2,
  ),
)
await b.close()
s.close()
// ⚠️ `laminaBaixa` FICA DE FORA do código de saída, por enquanto: em três
// rodadas seguidas (18/09/2026) a diferença de descida deu 31, 142 e 18 pixels
// com o MESMO jogo — a mira sobre a calha varia e o instrumento ainda não é
// estável o bastante para julgar. Continua no relatório; vira veredito quando
// a mira for cravada (pendência registrada no goal).
const { laminaBaixa, ...julgados } = veredito
void laminaBaixa
process.exit(Object.values(julgados).every(Boolean) && erros.length === 0 ? 0 : 1)
