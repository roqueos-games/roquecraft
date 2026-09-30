//
// QA DA GRAVIDADE E DO DESTAQUE — a areia cai de verdade, e o contorno enxerga
// a forma?
//
// Seis perguntas, e nenhuma delas é respondida por print sozinho:
//
//  1. CASCATA — pilha de cinco perde o apoio e desmorona INTEIRA. A regra
//     velha descia uma célula, uma vez: quatro ficavam penduradas no ar.
//  2. BURACO FUNDO — areia sobre buraco de quinze cai os quinze, não um.
//  3. ESTÁ NO AR — durante a queda o bloco existe como entidade e a altura
//     DIMINUI. Sem isto é teletransporte com nome bonito.
//  4. NÃO É CUBO PRETO — o material do mundo exige atributos do mundo, e quem
//     esquece um deles ganha um cubo preto. Já aconteceu com a mão do jogador
//     (20/08/2026). Medido por pixel.
//  5. CONVERGE — a cascata termina, e em quantos quadros. Cascata que não
//     esvazia é travamento disfarçado.
//  6. DESTAQUE COM FORMA — mirar numa laje dá contorno de meia altura; mirar
//     num cubo dá contorno inteiro. O par é obrigatório: contorno de laje sem
//     o controle do cubo não prova nada.
//
// A cena é construída ALTO, acima da copa, e de BAIXO PRA CIMA — apoio antes
// de quem se apoia. Construir a coluna antes do pilar faria a areia começar a
// cair no meio da montagem, e a sonda mediria a própria pressa.
//
//   node scripts/qa-roquecraft-gravidade.mjs [semente]
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
const OUT = path.resolve('scripts/.qa-gravidade')
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

// Plataforma alta e limpa, acima da copa.
const Y = await page.evaluate(async () => {
  const rc = window.__roquecraft
  const y = Math.round(rc.surfaceAt(0, 0) ?? 66) + 24
  rc.setFlying(true)
  rc.teleport(0.5, y + 4, 8.5)
  rc.fill(-10, y, -10, 10, y, 10, 'stone')
  await new Promise((r) => setTimeout(r, 2500))
  rc.setFx({ hand: false, clouds: false })
  rc.setTime(6000)
  return y
})

// ── 1. CASCATA ───────────────────────────────────────────────────────────
//
// Pilar de UM bloco em y+1, coluna de cinco areias de y+2 a y+6. Tirar o pilar
// tem que derrubar as cinco até o piso.
const cascata = await page.evaluate(async (y) => {
  const rc = window.__roquecraft
  const espera = (ms) => new Promise((r) => setTimeout(r, ms))
  // De baixo pra cima: apoio antes de quem se apoia.
  rc.fill(0, y + 1, 0, 0, y + 1, 0, 'stone')
  rc.fill(0, y + 2, 0, 0, y + 6, 0, 'sand')
  await espera(600)
  const antes = []
  for (let j = y + 1; j <= y + 6; j++) antes.push(rc.blocoEm(0, j, 0))

  rc.fill(0, y + 1, 0, 0, y + 1, 0, 'air')
  const escoou = rc.escoarQuedas()
  await espera(400)
  const depois = []
  for (let j = y + 1; j <= y + 7; j++) depois.push(rc.blocoEm(0, j, 0))
  return { antes, depois, escoou }
}, Y)

// ── 2. BURACO FUNDO ──────────────────────────────────────────────────────
const buraco = await page.evaluate(async (y) => {
  const rc = window.__roquecraft
  const espera = (ms) => new Promise((r) => setTimeout(r, ms))
  // Poço de 15 no piso, tampado, com areia em cima da tampa.
  rc.fill(4, y - 15, 4, 4, y, 4, 'air')
  rc.fill(4, y - 16, 4, 4, y - 16, 4, 'stone')
  rc.fill(4, y, 4, 4, y, 4, 'stone')
  rc.fill(4, y + 1, 4, 4, y + 1, 4, 'sand')
  await espera(500)
  rc.fill(4, y, 4, 4, y, 4, 'air')
  const escoou = rc.escoarQuedas()
  await espera(300)
  // Onde parou? Varre de baixo pra cima.
  let pousou = null
  for (let j = y - 16; j <= y + 2; j++) if (rc.blocoEm(4, j, 4) === 'sand') pousou = j
  return { pousou, esperado: y - 15, escoou }
}, Y)

// ── 3 e 4. NO AR, E NÃO PRETO ────────────────────────────────────────────
//
// Queda longa de propósito: 30 blocos dão tempo de fotografar no meio. Aqui
// NÃO se chama `escoarQuedas` — a queda tem que rodar no relógio do jogo, que
// é a coisa que está sendo medida.
// ⚠️ CONTRA O CÉU, CENA CONGELADA, E O MESMO BLOCO COMO SEU PRÓPRIO CONTROLE.
//
// Quatro armadilhas pagas aqui, e as quatro são do INSTRUMENTO, não do jogo:
//
// 1. Contar pixel preto no quadro inteiro deu 174 mil pretos — era a SOMBRA do
//    piso. Contar cor na tela toda mede o cenário, igual a contar vermelho
//    medir os corações do HUD.
//
// 2. Mirar "onde o bloco está agora" é corrida perdida: ele cai onze blocos por
//    segundo e a mira de malha fechada leva meio segundo. Saiu em v = 1,38,
//    fora da tela por baixo.
//
// 3. Mesmo com mira fixa, entre PROJETAR e o obturador abrir o bloco andava até
//    três blocos. O recorte mediu céu, e céu passou por "não é cubo preto" sem
//    nunca ter visto o cubo.
//
// 4. E com a cena congelada o recorte AINDA caiu no céu: a projeção e o quadro
//    desenhado discordam por um deslocamento de ~100 px — as duas caixas, a que
//    cai e a parada, erraram na MESMA direção. `projetar` e a câmera de fato
//    renderizada não são a mesma câmera aqui.
//
// A cura das quatro: não perguntar À PROJEÇÃO onde o bloco está. Perguntar à
// DIFERENÇA entre dois quadros — o que mudou É o bloco, esteja onde estiver na
// tela. E o controle de cor é o MESMO bloco pousado, no mesmo lugar da tela,
// mesma luz, mesma distância: o que sobra de diferença é só "entidade caindo"
// contra "malha do mundo".
const ALTURA_DA_FOTO = Y + 10
await page.evaluate(
  async ([y, altura]) => {
    const rc = window.__roquecraft
    rc.setTime(6000)
    rc.setFlying(true)
    rc.teleport(-1.5, y + 11, 1.5)
    // Pouso combinado: a areia vai parar EM CIMA desta pedra, na mesma altura
    // em que ela vai ser congelada. Assim a foto de controle e a foto do pouso
    // ocupam o mesmo pedaço de tela.
    rc.fill(-6, altura - 1, -6, -6, altura - 1, -6, 'stone')
    await new Promise((r) => setTimeout(r, 1200))
  },
  [Y, ALTURA_DA_FOTO],
)
await mirar(-5.5, ALTURA_DA_FOTO + 0.5, -5.5)
await page.waitForTimeout(500)
// CONTROLE: a cena com a pedra e sem areia nenhuma.
const fotoSemAreia = await page.screenshot()
fs.writeFileSync(path.join(OUT, '00-sem-areia.png'), fotoSemAreia)

const voo = await page.evaluate(
  async ([y, altura]) => {
    const rc = window.__roquecraft
    const espera = (ms) => new Promise((r) => setTimeout(r, ms))
    // ⚠️ O TETO DO MUNDO É 127. A primeira versão soltava de y+30 = 128, fora
    // do mundo: o `fill` não escrevia nada, a areia nunca existia, e a sonda
    // seguiu medindo o nada — projetou altura 0, recortou fora da tela e
    // devolveu área NEGATIVA. Por isso a existência é CONFERIDA aqui.
    const alto = Math.min(y + 20, 126)
    const quadro = () => new Promise((r) => requestAnimationFrame(() => r()))
    // ⚠️ A ARMADILHA TEM QUE FECHAR NUM QUADRO EM QUE A AREIA ESTÁ NA FAIXA. Com
    // amostra a cada 25 ms e quadro lento (swiftshader sob carga), a areia
    // passava da faixa de 0,6 bloco entre duas amostras e POUSAVA antes de ser
    // congelada: `noAr 0`, "nada a medir", vermelho sem defeito nenhum (30/09,
    // três de cinco rodadas). Agora a amostra é por quadro (é no quadro que a
    // areia anda), e se mesmo assim ela pousar antes, a queda é REFEITA, até
    // três vezes. Refazer a medida não é afrouxar o critério: o critério (a
    // areia no ar não é um cubo preto) continua sendo julgado na foto.
    let nasceu = null
    let amostras = []
    let tentativas = 0
    for (; tentativas < 3; tentativas++) {
      rc.fill(-6, alto, -6, -6, alto, -6, 'sand')
      nasceu = rc.blocoEm(-6, alto, -6)
      amostras = []
      for (let i = 0; i < 900; i++) {
        const q = rc.quedasInfo()
        amostras.push({ noAr: q.noAr, malhas: q.malhas, alturas: q.alturas })
        const h = q.alturas[0]
        if (h != null && h <= altura + 0.6) break
        if (i > 3 && q.noAr === 0) break // pousou antes de ser pega
        await quadro()
      }
      rc.congelarQuedas(true)
      if (rc.quedasInfo().noAr > 0) break
      // Pousou: tira a areia pousada e solta de novo.
      rc.congelarQuedas(false)
      rc.fill(-6, altura, -6, -6, altura, -6, 'air')
      await espera(400)
    }
    const q = rc.quedasInfo()
    return {
      amostras: amostras.slice(-14),
      alto,
      nasceu,
      tentativas: tentativas + 1,
      chegou: q.alturas[0] ?? null,
      noAr: q.noAr,
    }
  },
  [Y, ALTURA_DA_FOTO],
)
const fotoNoAr = await page.screenshot()
fs.writeFileSync(path.join(OUT, '01-areia-no-ar.png'), fotoNoAr)
if (voo.noAr === 0) erros.push('a areia não estava no ar na hora da foto — nada a medir')

// Solta o congelamento: ela pousa em cima da pedra, no mesmo lugar da tela.
const pouso = await page.evaluate(
  async ([altura]) => {
    const rc = window.__roquecraft
    rc.congelarQuedas(false)
    const escoou = rc.escoarQuedas()
    await new Promise((r) => setTimeout(r, 1400))
    return { escoou, pousada: rc.blocoEm(-6, altura, -6) }
  },
  [ALTURA_DA_FOTO],
)
const fotoPousada = await page.screenshot()
fs.writeFileSync(path.join(OUT, '02-areia-pousada.png'), fotoPousada)
if (pouso.pousada !== 'sand') erros.push('a areia não pousou onde devia — controle de cor inválido')

const pousouNoPoco = ALTURA_DA_FOTO

// ── 5 e 6. DESTAQUE: LAJE CONTRA CUBO ────────────────────────────────────
//
// O par é obrigatório. Um contorno de meia altura sozinho pode ser coincidência
// de câmera; o mesmo instrumento apontado pro cubo ao lado é o controle.
const destaque = await page.evaluate(async (y) => {
  const rc = window.__roquecraft
  rc.fill(3, y + 1, -3, 3, y + 1, -3, 'stoneSlab')
  rc.fill(5, y + 1, -3, 5, y + 1, -3, 'stone')
  rc.setFlying(true)
  rc.teleport(4.5, y + 2.2, -1.0)
  await new Promise((r) => setTimeout(r, 900))
  return true
}, Y)
await mirar(3.5, Y + 1.25, -2.5)
await page.waitForTimeout(350)
const naLaje = await page.evaluate(() => window.__roquecraft.destaqueInfo())
fs.writeFileSync(path.join(OUT, '02-destaque-laje.png'), await page.screenshot())

await mirar(5.5, Y + 1.5, -2.5)
await page.waitForTimeout(350)
const noCubo = await page.evaluate(() => window.__roquecraft.destaqueInfo())
fs.writeFileSync(path.join(OUT, '03-destaque-cubo.png'), await page.screenshot())

// ── Medição da foto da areia no ar ───────────────────────────────────────
//
// ⚠️ MASCARAR O HUD. Uma contagem de cor numa tela com HUD mede o HUD: em
// 24/08/2026 um detector de vermelho achou os corações e teria aprovado uma
// foto de piso vazio. Só a faixa de jogo conta.
/**
 * O que MUDOU entre dois quadros: quantos pixels, onde ficam, que cor têm.
 *
 * Não recebe projeção nenhuma de propósito. Foi a projeção que errou três
 * vezes; o que mudou entre dois quadros da mesma câmera é o objeto, e ele
 * aparece onde aparecer.
 */
function medirDiferenca(antes, depois) {
  const a = PNG.sync.read(antes)
  const d = PNG.sync.read(depois)
  let mudou = 0
  let somaR = 0
  let somaG = 0
  let somaB = 0
  let somaX = 0
  let somaY = 0
  let escuros = 0
  for (let y = 0; y < d.height; y++) {
    for (let x = 0; x < d.width; x++) {
      const i = (d.width * y + x) << 2
      const dr = d.data[i] - a.data[i]
      const dg = d.data[i + 1] - a.data[i + 1]
      const db = d.data[i + 2] - a.data[i + 2]
      if (Math.abs(dr) + Math.abs(dg) + Math.abs(db) < 30) continue
      mudou++
      somaR += d.data[i]
      somaG += d.data[i + 1]
      somaB += d.data[i + 2]
      somaX += x
      somaY += y
      // "Cubo sem atributos" sai quase 0 nos três canais. É ISTO que o teste
      // procura — não "é claro o bastante", que dependeria da hora do dia.
      if (d.data[i] < 22 && d.data[i + 1] < 22 && d.data[i + 2] < 22) escuros++
    }
  }
  if (!mudou) return { mudou: 0, media: null, centro: null, escuros: 0 }
  return {
    mudou,
    media: [somaR / mudou, somaG / mudou, somaB / mudou].map((n) => +n.toFixed(1)),
    centro: [Math.round(somaX / mudou), Math.round(somaY / mudou)],
    escuros,
  }
}
const caindo = medirDiferenca(fotoSemAreia, fotoNoAr)
const pousada = medirDiferenca(fotoSemAreia, fotoPousada)
const distanciaEntreCentros =
  caindo.centro && pousada.centro
    ? Math.round(
        Math.hypot(caindo.centro[0] - pousada.centro[0], caindo.centro[1] - pousada.centro[1]),
      )
    : null

const alturasCaindo = voo.amostras.filter((a) => a.noAr > 0).flatMap((a) => a.alturas)
const desceu =
  alturasCaindo.length >= 2 && alturasCaindo[alturasCaindo.length - 1] < alturasCaindo[0]

// O veredito é um objeto de booleanos: a prosa o imprime, o código de saída o julga.
const veredito = {
  // As cinco desmoronaram: piso ocupado de y+1 a y+5, ar em cima.
  cascataInteira:
    cascata.depois.slice(0, 5).every((k) => k === 'sand') &&
    cascata.depois.slice(5).every((k) => k === 'air'),
  // E converge: a fila esvazia.
  cascataConverge: cascata.escoou.sobrou === 0 && buraco.escoou.sobrou === 0,
  // Caiu o buraco INTEIRO. Este é o defeito velho escrito como número.
  caiOBuracoInteiro: buraco.pousou === buraco.esperado,
  // Existiu no ar, com malha, e a altura diminuiu.
  esteveNoAr: voo.amostras.some((a) => a.noAr > 0 && a.malhas > 0) && desceu,
  pousouLonge: pouso.pousada === 'sand' && pouso.escoou.sobrou === 0,
  // Areia na tela, e nada de cubo preto.
  // Dentro do recorte em volta do bloco: areia de verdade, e o preto do
  // "cubo sem atributos" ausente. Um cubo preto daria o inverso exato.
  // O cubo APARECEU (mudou pixel onde antes era céu), e o que apareceu
  // não é preto. Um cubo sem atributos daria `mudou` alto com média
  // perto de zero — exatamente o que aconteceu com a mão do jogador em
  // 20/08/2026, e o que este par de fotos separa.
  naoEhCuboPreto: voo.noAr > 0 && caindo.mudou > 300 && caindo.escuros < caindo.mudou * 0.25,
  // E é a MESMA areia: o bloco pousado, no mesmo lugar da tela, com a
  // mesma luz. Se a entidade caindo desenhasse com a camada errada — a
  // areia saindo de pedra —, as duas médias divergiriam. Sem este par,
  // "não é preto" também aprovaria uma pedra.
  mesmaAreiaDaPousada:
    !!caindo.media &&
    !!pousada.media &&
    pousada.mudou > 300 &&
    distanciaEntreCentros != null &&
    // ⚠️ A TOLERÂNCIA TEM QUE CABER A FAIXA DE CONGELAMENTO. A armadilha fecha
    // com a areia até 0,6 bloco acima do pouso, e a esta distância da câmera um
    // bloco são ~75 px: 40 px eram 0,53 bloco, MENOS que a faixa, e a sonda
    // reprovava ou passava conforme o quadro em que a armadilha fechou (30/09:
    // 41 px, com a mesma areia e a mesma cor). A faixa inteira mais folga: 52.
    distanciaEntreCentros < 52 &&
    Math.abs(caindo.media[0] - pousada.media[0]) < 30 &&
    Math.abs(caindo.media[1] - pousada.media[1]) < 30 &&
    Math.abs(caindo.media[2] - pousada.media[2]) < 30,
  // Contorno de meia altura na laje...
  // ⚠️ `visivel` e `alvo` NÃO são detalhe. Na primeira execução a câmera
  // ficou a 5,2 blocos — fora do alcance —, o raycast não pegou nada, o
  // contorno sumiu da tela e o veredito passou medindo a geometria do
  // alvo ANTERIOR, que continuava carregada. Forma certa, tela vazia.
  destaqueDaLaje:
    naLaje.visivel === true &&
    !!naLaje.alvo &&
    !!naLaje.caixaDaMalha &&
    Math.abs(naLaje.caixaDaMalha[4] - naLaje.caixaDaMalha[1] - 0.5) < 0.08,
  // ...e o CONTROLE: o mesmo instrumento no cubo dá altura inteira.
  controleDoCubo:
    noCubo.visivel === true &&
    !!noCubo.alvo &&
    !!noCubo.caixaDaMalha &&
    Math.abs(noCubo.caixaDaMalha[4] - noCubo.caixaDaMalha[1] - 1) < 0.08,
}
console.log(
  JSON.stringify(
    {
      saida: OUT,
      y: Y,
      cascata,
      buraco,
      voo: { ...voo, pousouNoPoco, esperado: ALTURA_DA_FOTO },
      caindo,
      pousada,
      distanciaEntreCentros,
      pouso,

      destaque: { montou: destaque, naLaje, noCubo },
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
