//
// A TOCHA EXISTE, E ELA SE MEXE?
//
// "A tocha também está horrorosa" — founder, 25/08/2026. Ela era `plant: true,
// scale: 0.16`: o desenho do MATINHO — duas folhas cruzadas — encolhido a 16%
// da célula. Um X de dois pixels e meio no chão.
//
// Esta sonda responde três perguntas, e cada uma tem seu par de controle na
// MESMA sessão. Medir sem par de controle foi o erro que me custou quatro
// rodadas na lava e uma retratação pública na água.
//
//   1. TAMANHO. Quanto da célula a peça ocupa, em BLOCOS e não em pixels. O
//      controle é a mesma moldura com a célula VAZIA: tem que dar zero. Um
//      instrumento que não sabe enxergar "não há tocha" não prova nada quando
//      diz "há tocha".
//
//   2. FORMA. A silhueta tem que ser ALTA e ESTREITA (poste), não um losango
//      largo e baixo (a cruz encolhida). A razão altura/largura separa as duas
//      sem depender de eu achar bonito.
//
//   3. MOVIMENTO. O relógio congelado no mesmo instante duas vezes tem que dar
//      quadros IGUAIS; congelado em dois instantes diferentes, quadros
//      DIFERENTES. É o mesmo A/B no tempo que fechou a lava, a queda e a
//      cáustica — e é a única forma honesta de separar "a chama anima" de "a
//      cena inteira se mexeu entre os dois cliques".
//
// A tocha DE PAREDE não entra por `fill`: ela é colocada com `place()`, o
// caminho de verdade. `fill` com a chave da variante testaria a tabela de ids,
// que o teste puro já testa, e daria verde com a regra de colocação quebrada.
//
//   node scripts/qa-roquecraft-tocha.mjs
//
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const DIST = path.resolve('dist/pwa')
const OUT = path.resolve('scripts/.qa-tocha')
fs.rmSync(OUT, { recursive: true, force: true })
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
const servidor = http.createServer((q, r) => {
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
await new Promise((r) => servidor.listen(0, r))
const base = `http://localhost:${servidor.address().port}`

const erros = []
const b = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const ctx = await b.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
  serviceWorkers: 'block',
  locale: 'pt-BR',
})
const page = await ctx.newPage()
page.on('pageerror', (e) => erros.push(String(e.message).slice(0, 160)))
page.on('console', (m) => {
  const t = m.text()
  if (/Shader|WebGL|INVALID|context lost/i.test(t)) erros.push(t.slice(0, 200))
})
await page.addInitScript(
  `window.__ROS_E2E__={auth:{uid:'e2e',email:'e@e.t',emailVerified:true,displayName:'E',role:'user'},googleDrive:{isConnected:false,files:[],user:{}},googleMapsApiKey:'',roquecraftSeed:942457}`,
)
await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => !!window.__rosStore, null, { timeout: 30000 })
await page.waitForTimeout(900)
await page.evaluate(() => window.__rosStore.openWindow('roquecraft'))
await page.waitForFunction(() => window.__roquecraft?.state?.ready === true, null, {
  timeout: 120000,
})
await page.evaluate(async () => {
  window.__roquecraft.setQuality('ultra')
  await new Promise((r) => setTimeout(r, 2600))
  window.__rosStore?.maximizeWindow?.('roquecraft')
  await new Promise((r) => setTimeout(r, 900))
})
// ⚠️ O DOCK DO ROQUEOS SAI DA FOTO, e ele NÃO some fotografando só o canvas.
//
// O dock flutua POR CIMA da janela do jogo; recortar a foto no elemento do
// canvas continua compondo o que está em cima dele. Só some escondendo.
//
// Ele importa porque o ícone laranja do Notes é marrom-alaranjado — a mesma
// cor que o classificador desta sonda procura. O controle acusou 2.715 pixels
// de "cor de tocha" numa cena SEM tocha nenhuma, e eu chutei o culpado duas
// vezes (o HUD do jogo, depois o recorte do canvas) antes de recortar aqueles
// 61×56 pixels e OLHAR. Era um ícone de bloco de notas.
await page.addStyleTag({
  content: '.ros-roquecraft__play,.ros-dock,.ros-menubar,.rc-hud{display:none !important}',
})
await page.waitForTimeout(500)

// ── A ARENA ─────────────────────────────────────────────────────────────────
//
// Uma plataforma de grama ACIMA do terreno, e não o terreno em si: o chão
// natural tem barranco, mato e sombra de árvore, e qualquer um dos três entra
// no diff e vira "silhueta da tocha". Plataforma limpa é o que torna o par de
// controle honesto — a ÚNICA diferença entre as duas fotos passa a ser a peça.
const cena = await page.evaluate(async () => {
  const rc = window.__roquecraft
  rc.setMode('creative')
  const y = Math.round(rc.surfaceAt(0, 0) ?? 66) + 14
  rc.setFlying(true)
  rc.teleport(0.5, y + 3, 0.5)
  rc.fill(-12, y - 2, -12, 12, y, 12, 'grassBlock')
  rc.setTime(4200) // sol alto: a foto julga a FORMA, não a luz
  rc.setFx({ hand: false })
  // O relógio congelado desde já: as fotos de tamanho também precisam ser
  // comparáveis pixel a pixel, e a chama mexendo entre elas viraria "silhueta".
  rc.setFx({ congelarAgua: true, tempoDaAgua: 1000 })
  await new Promise((k) => setTimeout(k, 2600))
  return { y }
})
const Y = cena.y

/**
 * Põe a câmera no mesmo lugar todas as vezes. Moldura fixa = diff honesto.
 *
 * ⚠️ A MIRA APONTA PRA LONGE DA PEÇA, DE PROPÓSITO — e é a correção mais
 * importante desta sonda.
 *
 * Com a mira EM CIMA da tocha, o jogo desenha duas coisas por cima dela: o
 * contorno branco do destaque e o FANTASMA translúcido do bloco a colocar (um
 * cubo inteiro, de um bloco de lado). Os dois são recursos funcionando. Os dois
 * apareceram nas fotos da primeira rodada, e — pior — os dois entraram no diff:
 * a "silhueta da tocha" media 3,2 × 2,2 blocos, que é o tamanho do FANTASMA, e
 * a sonda concluiu que a peça era "larga como losango". A conclusão era sobre o
 * cubo fantasma, não sobre a tocha.
 *
 * Como a mira mora no CENTRO do quadro, tirar a mira da peça é o mesmo que
 * tirar a peça do centro. Então ela vai pro terço de baixo à esquerda, e o
 * centro do quadro aponta pro céu — onde não há bloco nenhum pra destacar.
 */
async function enquadrar(alvoX, alvoY, alvoZ, recuo = 2.6, altura = 1.1) {
  await page.evaluate(
    ([ax, ay, az, recuo, altura]) => {
      const rc = window.__roquecraft
      const olhoX = ax
      const olhoZ = az + recuo
      const olhoY = ay + altura
      rc.setFlying(true)
      rc.teleport(olhoX, olhoY - 1.62, olhoZ)
      // ⚠️ O YAW SAI DA FÓRMULA. `yaw = 0` olha pra −Z neste jogo, e escrever o
      // número à mão já fotografou o lado errado do mundo em três sondas
      // anteriores desta sessão.
      const dist = Math.hypot(ax - olhoX, az - olhoZ)
      const yaw = Math.atan2(ax - olhoX, -(az - olhoZ))
      const pitchNaPeca = -Math.atan2(olhoY - ay, dist)
      // Sobe a mira meio bloco acima da peça e joga meio bloco pro lado: o raio
      // sai pelo céu, e nem destaque nem fantasma nascem.
      rc.look(yaw + 0.3, pitchNaPeca + 0.34)
    },
    [alvoX, alvoY, alvoZ, recuo, altura],
  )
  await page.waitForTimeout(650)
}

// ⚠️ A FOTO É DO CANVAS, NÃO DA PÁGINA.
//
// O jogo roda numa JANELA do RoqueOS, e a página inteira tem mais coisa: a
// barra de menu no alto e o DOCK no rodapé. O ícone laranja do Notes mora
// exatamente no canto de baixo e é marrom-alaranjado — a mesma cor que o
// classificador procura. O controle acusou 2.641 pixels de "cor de tocha" numa
// cena sem tocha nenhuma, numa caixa de 57×56, e eu chutei duas vezes o culpado
// (achei que era o HUD do jogo, escrevi CSS pra dois seletores que não
// existiam) antes de simplesmente RECORTAR aqueles pixels e olhar. Era o dock.
//
// Fotografar o canvas resolve a causa em vez do sintoma: sobra só o mundo, e
// `projetar` — que devolve u,v do viewport 3D — passa a casar exatamente com o
// quadro medido.
const canvas = await page.waitForSelector('.ros-roquecraft__canvas')
const caixaDoCanvas = await canvas.boundingBox()
const LARG = Math.round(caixaDoCanvas.width)
const ALT = Math.round(caixaDoCanvas.height)

const foto = async (nome) => {
  const p = path.join(OUT, nome)
  await canvas.screenshot({ path: p })
  return PNG.sync.read(fs.readFileSync(p))
}

const L = (png, i) => 0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2]

/**
 * Caixa dos pixels que MUDARAM entre duas fotos, dentro de uma janela.
 *
 * A janela existe porque o céu não congela junto: `congelarAgua` para o relógio
 * do material do voxel, não o das nuvens. Sem recorte, uma nuvem andando no
 * canto da tela entraria na conta como "a tocha tem 400 pixels de altura".
 */
/**
 * Distância de COR, canal a canal — e não de luminância.
 *
 * O poste marrom-alaranjado e a grama têm quase a MESMA luminância (≈148 contra
 * ≈154): medir por brilho não separa a peça do chão em que ela está. Separa por
 * cor: a diferença por canal passa de 80 no poste e fica abaixo de 25 no
 * clarão que a luz da tocha joga na grama em volta. É o que permite medir a
 * FORMA com um limiar alto e o CLARÃO com um limiar baixo, no mesmo par de
 * fotos.
 */
const distCor = (a, c, i) =>
  Math.max(
    Math.abs(a.data[i] - c.data[i]),
    Math.abs(a.data[i + 1] - c.data[i + 1]),
    Math.abs(a.data[i + 2] - c.data[i + 2]),
  )

function caixaDaDiferenca(a, c, janela, limiar = 10) {
  let x0 = 1e9
  let y0 = 1e9
  let x1 = -1e9
  let y1 = -1e9
  let n = 0
  for (let y = Math.max(0, janela.y0); y < Math.min(a.height, janela.y1); y++) {
    for (let x = Math.max(0, janela.x0); x < Math.min(a.width, janela.x1); x++) {
      const i = (a.width * y + x) << 2
      if (distCor(a, c, i) <= limiar) continue
      n++
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  if (!n) return { pixels: 0, largura: 0, altura: 0, x0: 0, y0: 0, x1: 0, y1: 0 }
  return { pixels: n, largura: x1 - x0 + 1, altura: y1 - y0 + 1, x0, y0, x1, y1 }
}

// ── 1. TAMANHO E FORMA ──────────────────────────────────────────────────────
//
// A tocha de chão vai em (0, Y+1, 0). A câmera fica fixa, e a MESMA moldura é
// fotografada duas vezes: sem a peça e com a peça.
const TX = 0
const TY = Y + 1
const TZ = 0
await enquadrar(TX + 0.5, TY + 0.5, TZ + 0.5)

// Escala: quantos pixels tem UM bloco nesta profundidade. É o que transforma a
// silhueta de pixels em blocos, e sem isso o número não significa nada — 40
// pixels é uma tocha inteira de perto e um poste inteiro de longe.
// ⚠️ `projetar` DEVOLVE u E v NORMALIZADOS (0..1), não pixels. A primeira
// versão desta sonda leu `.x`/`.y`, recebeu `undefined`, e a janela virou NaN:
// o laço não rodou nenhuma vez e TUDO deu zero — silhueta zero, ruído zero,
// chama zero. E zero de ruído era a denúncia: duas fotos diferentes não podem
// ter zero pixels de diferença. Número baixo não é achado enquanto o
// instrumento não provar que sabe produzir um alto.
const escala = await page.evaluate(
  ([x, y, z, LARG, ALT]) => {
    const rc = window.__roquecraft
    const pe = rc.projetar(x + 0.5, y, z + 0.5)
    const cabeca = rc.projetar(x + 0.5, y + 1, z + 0.5)
    if (!pe || !cabeca || !pe.frente || !cabeca.frente) return null
    const emPixels = (p) => ({ x: p.u * LARG, y: p.v * ALT })
    const a = emPixels(pe)
    const c = emPixels(cabeca)
    return { pe: a, cabeca: c, pixelsPorBloco: Math.abs(a.y - c.y) }
  },
  [TX, TY, TZ, LARG, ALT],
)
if (!escala || !(escala.pixelsPorBloco > 4)) {
  erros.push(`escala inválida: ${JSON.stringify(escala)} — a janela seria lixo`)
}

const janela =
  escala && escala.pixelsPorBloco > 4
    ? {
        x0: Math.round(escala.pe.x - escala.pixelsPorBloco * 1.6),
        x1: Math.round(escala.pe.x + escala.pixelsPorBloco * 1.6),
        y0: Math.round(escala.cabeca.y - escala.pixelsPorBloco * 1.4),
        y1: Math.round(escala.pe.y + escala.pixelsPorBloco * 0.4),
      }
    : { x0: 440, x1: 840, y0: 160, y1: 620 }

const vazio = await foto('1-sem-tocha.png')
await page.evaluate(
  ([x, y, z]) => window.__roquecraft.fill(x, y, z, x, y, z, 'torch'),
  [TX, TY, TZ],
)
await page.waitForTimeout(1500)
const comTocha = await foto('2-tocha-de-chao.png')

// ⚠️ A FORMA NÃO SAI DE UM DIFF. Duas rodadas tentaram, e as duas mediram
// outra coisa.
//
// A tocha tem `light: 14`. Pôr a peça REACENDE tudo num raio de vários blocos:
// dentro da janela, praticamente TODO pixel muda, e muda muito — mais de 55 por
// canal na grama perto. O diff, com qualquer limiar, devolve a janela inteira e
// chama isso de "silhueta". Foi assim que a rodada anterior concluiu que a peça
// era "larga como losango": ela estava medindo o clarão (e, antes disso, o cubo
// fantasma da mira).
//
// A forma sai por COR. O poste é marrom-alaranjado e a chama é branco-quente:
// nenhuma das duas cores existe em grama, céu ou pedra, iluminadas ou não. O
// controle é o mesmo classificador rodando na foto SEM a peça — ele tem que
// devolver quase zero, e é isso que prova que a cor escolhida é da tocha e não
// do clarão dela.
const ehCorDeTocha = (r, g, b) => (r - b > 62 && r > 120) || (r > 238 && g > 222 && r - b > 26)

function caixaDaCor(png, janela) {
  let x0 = 1e9
  let y0 = 1e9
  let x1 = -1e9
  let y1 = -1e9
  let n = 0
  for (let y = Math.max(0, janela.y0); y < Math.min(png.height, janela.y1); y++) {
    for (let x = Math.max(0, janela.x0); x < Math.min(png.width, janela.x1); x++) {
      const i = (png.width * y + x) << 2
      if (!ehCorDeTocha(png.data[i], png.data[i + 1], png.data[i + 2])) continue
      n++
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  if (!n) return { pixels: 0, largura: 0, altura: 0, x0: 0, y0: 0, x1: 0, y1: 0 }
  return { pixels: n, largura: x1 - x0 + 1, altura: y1 - y0 + 1, x0, y0, x1, y1 }
}

const silhueta = caixaDaCor(comTocha, janela)
// O clarão continua sendo medido, mas com o nome certo: é a luz que a peça
// joga em volta, e ela também é um recurso que pode quebrar sozinho.
const clarao = caixaDaDiferenca(vazio, comTocha, janela, 8)
const emBlocos = (v) =>
  escala && escala.pixelsPorBloco > 4 ? +(v / escala.pixelsPorBloco).toFixed(3) : null

// ⚠️ PROVA DE VIDA DO INSTRUMENTO: a mesma moldura contra ELA MESMA. Tem que
// dar quase zero. Se este número não for muito menor que a silhueta acima, o
// que a sonda chamou de "tocha" era ruído da cena e a medida não vale nada.
const vazioDeNovo = await page.evaluate(
  ([x, y, z]) => {
    window.__roquecraft.fill(x, y, z, x, y, z, 'air')
    return true
  },
  [TX, TY, TZ],
)
await page.waitForTimeout(1500)
const semTochaDeNovo = await foto('3-sem-tocha-de-novo.png')
// O CONTROLE DO CLASSIFICADOR: a mesma janela, a mesma cor, sem a peça.
// Precisa ser quase zero — senão a cor que a sonda chama de "tocha" existe na
// cena sem tocha nenhuma, e todo o resto da medida é sobre grama.
const corSemTocha = caixaDaCor(semTochaDeNovo, janela)
const ruidoDaCena = caixaDaDiferenca(vazio, semTochaDeNovo, janela, 55)

// Repõe a tocha para as medidas seguintes.
await page.evaluate(
  ([x, y, z]) => window.__roquecraft.fill(x, y, z, x, y, z, 'torch'),
  [TX, TY, TZ],
)
await page.waitForTimeout(1500)

// ── 2. MOVIMENTO DA CHAMA ───────────────────────────────────────────────────
//
// Congelado no MESMO instante duas vezes: quadros iguais (é o piso de ruído).
// Congelado em dois instantes: quadros diferentes (é o sinal). O sinal precisa
// ser muito maior que o piso, senão "a chama anima" é só a cena respirando.
async function fotoNoInstante(t, nome) {
  await page.evaluate((t) => window.__roquecraft.setFx({ tempoDaAgua: t }), t)
  await page.waitForTimeout(420)
  return foto(nome)
}
const chamaA1 = await fotoNoInstante(1000, '4-chama-t1000.png')
const chamaA2 = await fotoNoInstante(1000, '5-chama-t1000-de-novo.png')
const chamaB = await fotoNoInstante(1003.4, '6-chama-t1003.png')

// A janela da CHAMA: o terço de cima da silhueta. É onde a chama mora, e
// restringir ali impede que uma sombra mudando no chão conte como "a chama
// mexeu".
const janelaDaChama = silhueta.pixels
  ? {
      x0: silhueta.x0 - 4,
      x1: silhueta.x1 + 5,
      y0: silhueta.y0 - 4,
      y1: silhueta.y0 + Math.round(silhueta.altura * 0.55),
    }
  : janela
const ruidoDaChama = caixaDaDiferenca(chamaA1, chamaA2, janelaDaChama, 6)
const sinalDaChama = caixaDaDiferenca(chamaA1, chamaB, janelaDaChama, 6)

// ── 3. A TOCHA DE PAREDE, PELO CAMINHO DE VERDADE ───────────────────────────
//
// `place()` e não `fill()`: o que está sendo julgado é a REGRA de colocação
// (face clicada → variante), que mora no componente. Um `fill` com a chave da
// variante testaria a tabela de ids, que o teste puro já cobre, e passaria
// verde com a regra quebrada.
const PX = 5
const PZ = 0
const parede = await page.evaluate(
  async ([y, px, pz]) => {
    const rc = window.__roquecraft
    // Um pilar de pedra de três blocos: a tocha vai na face +z dele.
    rc.fill(px, y + 1, pz, px, y + 3, pz, 'stone')
    await new Promise((k) => setTimeout(k, 1200))
    rc.setFlying(true)
    // Olho na altura do meio do pilar, de frente pra face +z.
    //
    // ⚠️ 3,4 DE RECUO, E NÃO 2,2. Com 2,2 o corpo do jogador (0,6 de largura,
    // 1,8 de altura) encostava na célula z = 1, que é justamente onde a tocha
    // ia nascer — e `doPlace` recusa colocar bloco dentro do próprio corpo.
    // A sonda relatou `ok: false` com o jogo perfeitamente são; o defeito era
    // o enquadramento dela.
    const olhoY = y + 2.5
    rc.teleport(px + 0.5, olhoY - 1.62, pz + 3.4)
    rc.look(0, 0) // yaw 0 = −Z = de frente pro pilar
    await new Promise((k) => setTimeout(k, 320))
    rc.equipar('torch', 8)
    const mirado = rc.miraEm()
    const ok = rc.place()
    await new Promise((k) => setTimeout(k, 900))
    // A célula vizinha, do lado +z do pilar, é onde a tocha deve ter nascido.
    const col = rc.colunaEm(px, pz + 1, y + 2, y + 2)
    return { mirado, ok, nasceu: col?.[0]?.bloco ?? 'nada' }
  },
  [Y, PX, PZ],
)
await enquadrar(PX + 0.5, Y + 2.6, PZ + 1.5, 3.0, 0.3)
const _fotoParede = await foto('7-tocha-de-parede-de-frente.png')

// ⚠️ E DE LADO. De frente, a inclinação aponta PRA CÂMERA e some por
// escorço: a foto frontal mostra um poste perfeitamente vertical mesmo com a
// peça inclinada 29°, e julgar a inclinação por ela seria julgar o que a
// projeção apagou. A vista de lado é a única que responde.
await page.evaluate(
  ([y, px, pz]) => {
    const rc = window.__roquecraft
    const olhoX = px + 4.0
    const olhoZ = pz + 1.2
    const olhoY = y + 2.9
    rc.setFlying(true)
    rc.teleport(olhoX, olhoY - 1.62, olhoZ)
    const dist = Math.hypot(px + 0.5 - olhoX, pz + 1.5 - olhoZ)
    rc.look(
      Math.atan2(px + 0.5 - olhoX, -(pz + 1.5 - olhoZ)),
      -Math.atan2(olhoY - (y + 2.5), dist) + 0.3,
    )
  },
  [Y, PX, PZ],
)
await page.waitForTimeout(650)
const _fotoParedeLado = await foto('9-tocha-de-parede-de-lado.png')

// ── 4. À NOITE ──────────────────────────────────────────────────────────────
//
// A tocha é uma fonte de luz. De dia a foto julga a FORMA; de noite julga se
// ela ACENDE — que é a metade do trabalho que a emissão e o bloom fazem, e a
// metade que o founder vê primeiro numa caverna.
await page.evaluate(() => window.__roquecraft.setTime(18000))
await page.waitForTimeout(1400)
await enquadrar(TX + 0.5, TY + 0.5, TZ + 0.5)
const noite = await foto('8-tocha-de-noite.png')
let brilhoDaChama = 0
if (silhueta.pixels) {
  let soma = 0
  let n = 0
  for (let y = janelaDaChama.y0; y < janelaDaChama.y1; y++) {
    for (let x = janelaDaChama.x0; x < janelaDaChama.x1; x++) {
      if (y < 0 || y >= noite.height || x < 0 || x >= noite.width) continue
      soma += L(noite, (noite.width * y + x) << 2)
      n++
    }
  }
  brilhoDaChama = n ? +(soma / n).toFixed(1) : 0
}

const veredito = []
const alturaEmBlocos = emBlocos(silhueta.altura)
const larguraEmBlocos = emBlocos(silhueta.largura)
const razao = silhueta.largura ? +(silhueta.altura / silhueta.largura).toFixed(2) : 0

if (!silhueta.pixels) {
  veredito.push('a sonda NÃO viu tocha nenhuma — a medida abaixo não vale nada')
} else if (corSemTocha.pixels > silhueta.pixels * 0.1) {
  veredito.push(
    `classificador cego: a cor de tocha aparece ${corSemTocha.pixels} px na cena SEM tocha, contra ${silhueta.pixels} px com ela`,
  )
} else {
  veredito.push(
    `a tocha ocupa ${alturaEmBlocos} bloco de altura por ${larguraEmBlocos} de largura (razão ${razao}); a mesma cor sem a peça dá ${corSemTocha.pixels} px`,
  )
  // A cruz encolhida tinha 0,16 de lado e razão ~1. O poste tem 0,9 de alto por
  // 0,3 de largo. Os dois números separam as duas peças sem depender de gosto.
  if (alturaEmBlocos < 0.5) veredito.push('⚠️ ALTURA baixa demais: isto ainda parece a cruz de 16%')
  if (razao < 1.6)
    veredito.push('⚠️ RAZÃO baixa demais: a silhueta é larga como losango, não alta como poste')
}
if (sinalDaChama.pixels <= ruidoDaChama.pixels * 3) {
  veredito.push(
    `⚠️ a chama NÃO se mexe o bastante: sinal ${sinalDaChama.pixels} px contra ruído ${ruidoDaChama.pixels} px`,
  )
} else {
  veredito.push(
    `a chama se mexe: ${sinalDaChama.pixels} px mudam entre dois instantes, contra ${ruidoDaChama.pixels} px entre duas fotos do MESMO instante`,
  )
}
if (!String(parede.nasceu).toLowerCase().includes('torch')) {
  veredito.push(`⚠️ a tocha de PAREDE não nasceu: a célula tem "${parede.nasceu}"`)
} else {
  veredito.push(`a tocha de parede nasceu como ${parede.nasceu}`)
}

const relatorio = {
  arena: { y: Y, tocha: [TX, TY, TZ], pilar: [PX, PZ] },
  escala: escala ? { pixelsPorBloco: +escala.pixelsPorBloco.toFixed(1) } : null,
  tamanho: { silhueta, corSemTocha, clarao, alturaEmBlocos, larguraEmBlocos, razao, ruidoDaCena },
  chama: { ruido: ruidoDaChama, sinal: sinalDaChama, brilhoMedioDeNoite: brilhoDaChama },
  parede,
  vazioDeNovo,
  veredito,
  erros,
}
fs.writeFileSync(path.join(OUT, 'relatorio.json'), JSON.stringify(relatorio, null, 2))
console.log(JSON.stringify(relatorio, null, 2))

await b.close()
servidor.close()
// O veredito sai pelo código de saída: o ledger de sondas lê ISSO, não a prosa.
// Qualquer linha de alerta (⚠️ ou "NÃO viu") no veredito reprova.
const alerta = veredito.some(
  (l) => l.includes('⚠️') || l.includes('NÃO viu') || l.includes('classificador cego'),
)
process.exit(alerta || erros.length > 0 ? 1 : 0)
