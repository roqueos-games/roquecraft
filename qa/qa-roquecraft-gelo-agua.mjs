//
// O GELO NA ÁGUA — o piscar com a câmera PARADA.
//
// Relato do founder (15/09/2026), com dois prints do MESMO quadro, mesma
// posição no HUD, e o gelo diferente nos dois: "os gelos nas aguas estão com as
// faces falhando".
//
// ⚠️ A SONDA DE 22/08 MEDIU A COISA ERRADA, e vale dizer por quê: ela fez um
// A/B de `depthWrite` num gelo SUBMERSO, viu média 33 contra 38, e não separou
// nada. O caso do founder é gelo na SUPERFÍCIE, encostando na lâmina — outra
// geometria, outro defeito.
//
// ⚠️ E ESTA SONDA NÃO PROVA O CONSERTO — ELA MEDE A CENA. Está escrito aqui
// porque medi: rodada com a correção, o pior par de quadros seguidos diferiu em
// 479 pixels; rodada com o defeito DE VOLTA, em 528. Indistinguível. O motivo é
// o harness: em SwiftShader a ordem de desenho é determinística, então duas
// faces coplanares não alternam — elas brigam numa GPU de verdade, que é onde o
// founder viu. Uma sonda que não separa os dois estados não é um portão, e
// fingir que é seria pior do que não ter.
//
// O que PROVA o conserto é `mesherGelo.spec.js`, que mede a CAUSA na malha: 16
// pares de quads coplanares com o defeito, zero sem ele, e o mutante que apaga
// a regra reprova. Aqui ficam a prova de vida da cena e a foto para o founder
// olhar no aparelho dele, que é onde o sintoma mora.
//
//   node scripts/qa-roquecraft-gelo-agua.mjs
//
import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'
import { chromium } from 'playwright'
import { servirDist } from './lib/servidor-do-dist.mjs'

const SAIDA = path.resolve('qa-out/gelo-agua')
fs.mkdirSync(SAIDA, { recursive: true })

const { base, fechar } = await servirDist('dist/pwa')
const b = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
})
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' })
const page = await ctx.newPage()
const erros = []
page.on('pageerror', (e) => erros.push(String(e.message).slice(0, 200)))
await page.addInitScript(
  `window.__ROS_E2E__={auth:{uid:'e2e',email:'e@e.t',emailVerified:true,displayName:'E',role:'user'},googleDrive:{isConnected:false,files:[],user:{}},googleMapsApiKey:'',roquecraftSeed:1337}`,
)
await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => !!window.__rosStore, null, { timeout: 30000 })
await page.evaluate(() => window.__rosStore.openWindow('roquecraft'))
await page.waitForFunction(() => window.__roquecraft?.state?.ready === true, null, {
  timeout: 120000,
})

// ── A CENA, CONSTRUÍDA E NÃO CAÇADA ─────────────────────────────────────────
//
// ⚠️ PROCURAR UM LAGO CONGELADO NA SEMENTE DO DIA é como sondas deste repo já
// acabaram fotografando campo vazio. O caso é construído: um tanque de água com
// uma placa de gelo na superfície, exatamente a geometria dos prints.
const cena = await page.evaluate(async () => {
  const rc = window.__roquecraft
  rc.setFx({ hand: false, congelarAgua: true, tempoDaAgua: 1000 })
  rc.setTime(6000)
  await rc.stage({ height: 30, radius: 5, wait: 2000 })
  const s = rc.state
  const x0 = Math.round(s.player.x) + 6
  const z0 = Math.round(s.player.z) - 6
  const y = Math.round(s.player.y) - 12

  // bacia de pedra, água dentro, placa de gelo por cima de parte dela
  rc.fill(x0 - 1, y - 3, z0 - 1, x0 + 12, y - 1, z0 + 12, 'stone')
  rc.fill(x0, y - 2, z0, x0 + 11, y, z0 + 11, 'water')
  rc.fill(x0 + 3, y, z0 + 3, x0 + 8, y, z0 + 8, 'ice')
  await new Promise((k) => setTimeout(k, 3000))
  // ⚠️ E O MUNDO PARA DE SE MEXER. `congelarAgua` congela a ONDA (o visual); a
  // água que acabou de ser despejada continua se ACOMODANDO por baixo, e foi
  // isso que a segunda medição pegou — a diferença entre quadros subindo em
  // rampa (973, 1250, 2046, 2403, 2829) enquanto o líquido assentava. Rampa
  // monótona nunca foi o sintoma: o piscar é alternância, não deriva.
  rc.esvaziarFila()
  rc.congelarQuedas(true)
  await new Promise((k) => setTimeout(k, 800))

  // Olhar de fora, em ângulo raso — é assim que a fronteira gelo/água aparece
  // nos prints, e é o ângulo em que duas faces coplanares mais brigam.
  rc.teleport(x0 + 5.5, y + 3.2, z0 - 7)
  rc.look(0, -0.16)
  await new Promise((k) => setTimeout(k, 2500))
  return { x0, y, z0, bloco: rc.blocoEm(x0 + 5, y, z0 + 5) }
})

const tirar = async (nome) => {
  const cv = await page.locator('canvas').first().boundingBox()
  const buf = await page.screenshot(cv ? { clip: cv } : {})
  fs.writeFileSync(path.join(SAIDA, `${nome}.png`), buf)
  return PNG.sync.read(buf)
}

// ⚠️ O RELÓGIO VOLTA AO MESMO INSTANTE ANTES DE CADA QUADRO. A primeira versão
// desta sonda tirou seis fotos seguidas e mediu a diferença crescendo em rampa
// — 1026, 1597, 2471, 3810, 4359 pixels. Rampa monótona não é piscar: era o sol
// andando (`setTime` marca a hora, não PARA o relógio) e a névoa junto com ele.
// Uma sonda que confundisse as duas coisas acusaria o defeito em qualquer cena.
const quadros = []
for (let i = 0; i < 6; i++) {
  await page.evaluate(() => window.__roquecraft.setTime(6000))
  await page.waitForTimeout(260)
  quadros.push(await tirar(`q${i}`))
}

// Quantos pixels mudam entre dois quadros com a câmera parada. A água está
// congelada e o relógio parado, então qualquer diferença é instabilidade de
// desenho — não o mundo se mexendo.
const L = (p, i) => 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2]
// ⚠️ SÓ A FAIXA DO GELO. A tela inteira traz céu e nuvens, que se mexem por
// conta própria e afogariam o sinal — e foi o que a primeira medição pegou.
const FAIXA = { y0: 0.42, y1: 0.86 }
function difere(a, c) {
  let n = 0
  let soma = 0
  const yIni = Math.floor(a.height * FAIXA.y0)
  const yFim = Math.floor(a.height * FAIXA.y1)
  for (let y = yIni; y < yFim; y += 2) {
    for (let x = 0; x < a.width; x += 2) {
      const i = (a.width * y + x) << 2
      const d = Math.abs(L(a, i) - L(c, i))
      if (d > 6) {
        n++
        soma += d
      }
    }
  }
  return { pixeis: n, forca: Number((soma / Math.max(1, n)).toFixed(2)) }
}

// ⚠️ ENTRE QUADROS CONSECUTIVOS, E O PRIMEIRO É DESCARTADO. Comparando tudo
// contra o quadro 0 o resultado ficou num patamar constante de ~1370 pixels:
// não era piscar, era o quadro 0 sendo diferente dos outros cinco, que são
// iguais entre si. Primeiro quadro depois de construir e congelar a cena é
// aquecimento, e medir contra ele acusaria qualquer cena do jogo.
//
// Consecutivo é também o teste certo para o defeito: duas faces coplanares sem
// critério de ordem ALTERNAM, e alternância aparece em todo par seguido.
const uteis = quadros.slice(1)
const pares = []
for (let i = 1; i < uteis.length; i++) pares.push(difere(uteis[i - 1], uteis[i]))
const piorPixeis = Math.max(...pares.map((p) => p.pixeis))

const v = []
const ok = (c, t) => {
  v.push(`${c ? '✅' : '❌'} ${t}`)
  return c
}
let bom = true
bom = ok(cena.bloco === 'ice', `a cena tem gelo na superfície (bloco medido: ${cena.bloco})`) && bom
// Prova de vida: um quadro preto seria estável e passaria no teste do piscar.
const vivo = (() => {
  let s = 0
  let n = 0
  const p = quadros[0]
  for (let y = 0; y < p.height; y += 4)
    for (let x = 0; x < p.width; x += 4) {
      s += L(p, (p.width * y + x) << 2)
      n++
    }
  return Number((s / n).toFixed(2))
})()
bom = ok(vivo > 25, `a cena está viva (luz média ${vivo})`) && bom
// RELATADO, não julgado: ver a nota de abertura. O número serve para comparar
// rodadas na mesma máquina, não para aprovar ou reprovar.
v.push(
  `· com a câmera parada, o pior par de quadros seguidos difere em ${piorPixeis} pixels ${JSON.stringify(pares)} — medida da CENA, não prova do conserto`,
)
bom = ok(erros.length === 0, `sem erro de página (${erros.length})`) && bom

console.log(
  JSON.stringify(
    { veredito: v, cena, vivo, pares, fotos: fs.readdirSync(SAIDA).slice(0, 3), erros },
    null,
    2,
  ),
)
await ctx.close()
await b.close()
fechar()
process.exit(bom ? 0 : 1)
