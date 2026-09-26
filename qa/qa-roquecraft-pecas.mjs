//
// A FOLHA DE CONTATO DAS PEÇAS (Goal 22, onda 0).
//
// ⚠️ ESTA SONDA NASCEU DE UM DEFEITO QUE VIVEU SEMANAS. A lanterna não tinha
// forma própria e saía como cubo 1×1 com textura recortada: de perto, uma caixa
// de vidro oca com dois painéis boiando. Ninguém viu porque NENHUMA SONDA OLHA
// UMA PEÇA DE PERTO — a da cidade fotografa a praça de longe, e de longe a
// caixa oca lia como lanterninha ("os postes de luz estão todos bugados",
// founder, 18/09/2026).
//
// ⚠️ ELA É UMA FOLHA DE CONTATO, NÃO UM PORTÃO — e isso foi MEDIDO, não
// escolhido por preguiça.
//
// Tentei três vereditos mecânicos em cima da diferença de pixel. Os três
// passaram no mutante, cada um por um motivo diferente, e estão escritos aqui
// pra ninguém tentar de novo achando que é fácil:
//
//   1. "a silhueta é mais estreita que a do cubo" — plantar QUALQUER bloco muda
//      ~45 mil pixels (remesh e luz do chunk, nuvem, folhagem). Tocha, cerca,
//      laje e escada deram todas entre 0,63 e 1,0 da referência: números que
//      não separam nada.
//   2. "a peça difere de um cubo liso" — mutante: cerca SEM faces próprias,
//      virando cubo cheio. Passou verde com 31.799 px de diferença, porque o
//      check comparava TEXTURA: um cubo de tábua difere de um de pedra sempre.
//   3. "a peça aparece na tela" — mutante: lanterna com ZERO faces. Passou
//      verde com 53.180 px, porque a lanterna EMITE LUZ e a cena inteira muda
//      mesmo sem geometria nenhuma.
//
// A conclusão é do próprio repo, escrita em `sondas-com-veredito.spec.js`:
// exigir veredito de uma folha de contato "seria pedir que a foto se julgasse
// sozinha, que é exatamente o erro que a folha de contato existe para
// consertar". O veredito mecânico de GEOMETRIA pede outro instrumento — a
// malha gerada, não o pixel da tela — e isso é trabalho próprio, não um
// remendo aqui.
//
// O que ela AFIRMA, e pode reprovar: que a câmera está mesmo na célula, e que
// cada peça fotografada foi mesmo PLANTADA (o mundo responde a chave certa).
// Sem isso a folha fotografaria uma célula vazia e chamaria de lanterna — o
// defeito silencioso que estraga qualquer evidência visual.
//
// Quem pega a lanterna oca por REGRA é
// `tests/unit/architecture/recorte-sem-forma.spec.js`. As duas existem porque
// são coisas diferentes: uma é o portão, esta é o olho.
//
//   node scripts/qa-roquecraft-pecas.mjs
//
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'
import { servirDist } from './lib/servidor-do-dist.mjs'
import { criarMirar } from './lib/rc-mirar.mjs'

const { PNG } = createRequire(import.meta.url)('pngjs')

const SAIDA = path.resolve('scripts/.qa-pecas')
fs.mkdirSync(SAIDA, { recursive: true })

// As peças de forma livre, uma por quadro. `stone` é a REFERÊNCIA: o cubo
// cheio contra o qual toda silhueta é medida.
const REFERENCIA = 'stone'
const PECAS = [
  'lantern',
  'torch',
  'oakFence',
  'oakGate',
  'oakTrapdoor',
  'oakDoor',
  'oakSlab',
  'oakStairs',
  'bamboo',
]

const { base, fechar } = await servirDist('dist/pwa')
const b = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const ctx = await b.newContext({
  viewport: { width: 1280, height: 800 },
  serviceWorkers: 'block',
  locale: 'pt-BR',
})
const page = await ctx.newPage()
const erros = []
let passo = 'boot'
page.on('pageerror', (e) => erros.push(`${passo}: ${String(e.message).slice(0, 200)}`))
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
await page.evaluate(() => window.__rosStore?.maximizeWindow?.('roquecraft'))
await page.addStyleTag({ content: '.ros-roquecraft__play{display:none !important}' })
await page.evaluate(() => window.__roquecraft.entrarNoJogo?.())
await page.waitForTimeout(1200)
const mirar = criarMirar(page)

const v = []
let bom = true
const ok = (c, m) => {
  v.push(`${c ? '✅' : '❌'} ${m}`)
  if (!c) bom = false
  return c
}

// ── O platô: céu atrás da peça, chão longe, nada por perto ──────────────────
passo = 'plato'
const ALVO = await page.evaluate(async () => {
  const rc = window.__roquecraft
  const dorme = (ms) => new Promise((k) => setTimeout(k, ms))
  rc.setMode('creative')
  rc.setTime(6000)
  const h = rc.surfaceAt(0, 0)
  const base = Number.isFinite(h) ? h : 66
  const y = base + 20
  rc.setFlying(true)
  rc.teleport(0.5, y + 2, 0.5)
  await rc.waitChunks(4, 45000)
  // ⚠️ A CÂMERA FICA NA ALTURA DA PEÇA, NÃO EM CIMA DELA. A primeira versão
  // punha o jogador 1,5 bloco acima e mirava pra baixo: a peça saía do tamanho
  // de um respingo no meio da mata, e a "folha de contato" não mostrava nada.
  // De lado, na mesma altura, o fundo é céu e a peça ocupa o quadro.
  rc.fill(-8, y - 2, -8, 8, y + 10, 8, 'air')
  rc.fill(0, y - 1, 0, 0, y - 1, 0, 'stone')
  await dorme(900)
  rc.teleport(0.5, y, 3.5)
  await dorme(900)
  return { x: 0, y, z: 0 }
}, null)

// O recorte: um quadrado no CENTRO do canvas do jogo, que é onde a mira está.
// A tela inteira tem menu, dock e HUD; a peça mora num punhado de pixels no
// meio. Sem recortar, nem o olho nem a diferença de pixel enxergam a peça.
const LADO = 420
const janela = await page.evaluate(() => {
  const c = document.querySelector('.ros-roquecraft canvas') || document.querySelector('canvas')
  const r = c.getBoundingClientRect()
  return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }
})
const RECORTE = {
  x: Math.round(janela.cx - LADO / 2),
  y: Math.round(janela.cy - LADO / 2),
  width: LADO,
  height: LADO,
}

const foto = async (arquivo) => {
  await page.waitForTimeout(450)
  const buf = await page.screenshot({ clip: RECORTE })
  if (arquivo) fs.writeFileSync(path.join(SAIDA, arquivo), buf)
  return buf
}

/**
 * A silhueta da peça: os pixels que MUDARAM entre a célula vazia e a com peça.
 *
 * ⚠️ PERFIL DE COLUNA, NÃO CAIXA ENVOLVENTE. A primeira versão pegava o bbox
 * dos pixels mudados e devolvia a tela quase inteira (1007 de 1024) mesmo com a
 * câmera parada: entre duas fotos, nuvem, folhagem e dither de sombra mudam
 * pixels espalhados, e um único pixel numa ponta estica o bbox até lá. A peça é
 * uma mancha COMPACTA — as colunas dela têm muitos pixels mudados, as do ruído
 * têm um punhado. Filtrar por altura de coluna separa os dois, e é a mesma
 * técnica que a sonda da cama usa nas linhas.
 */
function silhueta(vazio, com) {
  const a = PNG.sync.read(vazio)
  const d = PNG.sync.read(com)
  const mudou = (x, y) => {
    const i = (d.width * y + x) << 2
    return (
      Math.abs(d.data[i] - a.data[i]) +
        Math.abs(d.data[i + 1] - a.data[i + 1]) +
        Math.abs(d.data[i + 2] - a.data[i + 2]) >=
      90
    )
  }
  const colunas = new Array(d.width).fill(0)
  let n = 0
  for (let y = 0; y < d.height; y++) {
    for (let x = 0; x < d.width; x++) {
      if (!mudou(x, y)) continue
      n++
      colunas[x]++
    }
  }
  const pico = Math.max(...colunas)
  if (!pico) return { pixels: 0, largura: 0, pico: 0, colunasDaPeca: 0 }
  // 15% do pico: acima disso é a peça, abaixo é ruído de quadro.
  const corte = pico * 0.15
  let min = -1
  let max = -1
  let daPeca = 0
  for (let x = 0; x < d.width; x++) {
    if (colunas[x] < corte) continue
    daPeca++
    if (min < 0) min = x
    max = x
  }
  return { pixels: n, largura: max - min + 1, pico, colunasDaPeca: daPeca }
}

// ⚠️ A CÂMERA MIRA UMA VEZ SÓ, E NÃO SE MEXE MAIS.
//
// A primeira versão mirava DEPOIS de plantar cada peça. A câmera andava entre a
// foto da célula vazia e a foto com a peça, então a tela INTEIRA mudava e a
// diferença de pixel devolvia a viewport toda: o cubo de referência "media"
// 1024×630 e toda peça dava 0,98 dele, tocha e cerca inclusive. O instrumento
// concordava com qualquer coisa. Mirar ANTES, e uma vez, é o conserto.
const mira = await mirar(ALVO.x + 0.5, ALVO.y + 0.5, ALVO.z + 0.5)

// Mede uma chave com a câmera PARADA: foto vazia, planta, foto com, diferença.
async function medir(chave, arquivo) {
  passo = `medir:${chave}`
  const vazio = await foto(null)
  await page.evaluate(
    ({ chave, A }) => window.__roquecraft.fill(A.x, A.y, A.z, A.x, A.y, A.z, chave),
    { chave, A: ALVO },
  )
  await page.waitForTimeout(650)
  const com = await foto(arquivo)
  const forma = await page.evaluate((c) => window.__roquecraft.formaDoBloco(c), chave)
  const posta = await page.evaluate(({ A }) => window.__roquecraft.blockKeyAt(A.x, A.y, A.z), {
    A: ALVO,
  })
  await page.evaluate(({ A }) => window.__roquecraft.fill(A.x, A.y, A.z, A.x, A.y, A.z, 'air'), {
    A: ALVO,
  })
  await page.waitForTimeout(350)
  return { chave, posta, forma, ...silhueta(vazio, com) }
}

// ── 1. A REFERÊNCIA: o cubo cheio ───────────────────────────────────────────
const cubo = await medir(REFERENCIA, '0-cubo-referencia.png')
ok(
  Number.isFinite(mira?.err) && mira.err < 0.05,
  `a câmera está na célula (erro de mira ${mira?.err ?? 'n/d'}, ${mira?.passos ?? '?'} passos)`,
)
ok(
  cubo.posta === REFERENCIA,
  `a referência (${REFERENCIA}) foi plantada (${cubo.pixels} px mudaram)`,
)
if (!cubo.largura) {
  console.log(v.join('\n'))
  await ctx.close()
  await b.close()
  await fechar()
  process.exit(1)
}

// ── 2. CADA PEÇA, de perto ──────────────────────────────────────────────────
const medidas = []
let i = 1
for (const chave of PECAS) {
  const m = await medir(chave, `${i}-${chave}.png`)
  i++
  if (m.posta !== chave) {
    ok(false, `${chave}: não consegui plantar (o mundo diz "${m.posta}") — sonda cega`)
    continue
  }
  if (!m.forma) {
    ok(false, `${chave}: o jogo não conhece esta chave`)
    continue
  }
  medidas.push({ chave, declarada: m.forma.larguraMaxima, ...m })
  ok(true, `${chave}: plantada e fotografada (${m.pixels} px mudaram na tela)`)
}

// ── 3. A folha de contato, de noite ─────────────────────────────────────────
passo = 'noite'
await page.evaluate(() => window.__roquecraft.setTime(18000))
await page.waitForTimeout(600)
for (const chave of ['lantern', 'torch']) {
  await page.evaluate(
    ({ chave, A }) => window.__roquecraft.fill(A.x, A.y, A.z, A.x, A.y, A.z, chave),
    { chave, A: ALVO },
  )
  await mirar(ALVO.x + 0.5, ALVO.y + 0.5, ALVO.z + 0.5)
  await foto(`noite-${chave}.png`)
  await page.evaluate(({ A }) => window.__roquecraft.fill(A.x, A.y, A.z, A.x, A.y, A.z, 'air'), {
    A: ALVO,
  })
}

console.log(v.join('\n'))
console.log(
  JSON.stringify(
    {
      // `silhueta` devolve largura/pico/colunas — não altura. A primeira versão
      // imprimia `altura: undefined` no relatório, achado pelo revisor.
      referencia: {
        largura: cubo.largura,
        pico: cubo.pico,
        colunasDaPeca: cubo.colunasDaPeca,
        pixels: cubo.pixels,
      },
      medidas: medidas.map((m) => ({
        peca: m.chave,
        px: m.pixels,
        declarada: m.declarada,
      })),
      fotos: SAIDA,
      erros,
    },
    null,
    2,
  ),
)
ok(erros.length === 0, `sem erro de página (${erros.length})`)
await ctx.close()
await b.close()
await fechar()
process.exit(bom ? 0 : 1)
