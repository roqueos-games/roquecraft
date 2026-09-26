//
// O MOUSE FUNCIONA NO MENU? — a pergunta que a sonda anterior não fez.
//
// ⚠️ ESTA SONDA EXISTE PORQUE A OUTRA DEU 10 TIQUES VERDES NUM MENU QUE O
// FOUNDER NÃO CONSEGUE USAR. `qa-roquecraft-criativo.mjs` clicava com
// `el.click()` — uma chamada de DOM, que não passa por pointer lock, não passa
// por elemento sobreposto e não passa por z-index. Ela provou que o HANDLER
// funciona. O jogador não usa o handler; ele usa o mouse.
//
// Relato do founder (16/09): "não consigo mexer com o mouse nas opções do modal
// da tecla K, ele fica movendo o jogo ao invés de conseguir usar o menu. Outro
// menu com esse comportamento horroroso é o de conversa por IA com os NPCs".
//
// Três afirmações, com mouse de verdade:
//   1. com a tela aberta, MOVER o mouse não gira a câmera;
//   2. o botão "clique pra jogar" não está por cima da tela;
//   3. um clique real num controle da tela chega nele.
//
//   node scripts/qa-roquecraft-menu-usavel.mjs
//
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { servirDist } from './lib/servidor-do-dist.mjs'

const SAIDA = path.resolve('qa-out/menu-usavel')
fs.mkdirSync(SAIDA, { recursive: true })

const { base, fechar } = await servirDist('dist/pwa')
const b = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
})
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' })
const page = await ctx.newPage()
const erros = []
// ⚠️ UM ERRO, E SÓ ELE, É DO AMBIENTE. O Chromium headless recusa
// `requestPointerLock` com "The root document of this element is not valid for
// pointer lock" porque não existe gesto de usuário válido aqui — é a MESMA
// razão pela qual a medida do giro dá sempre zero neste harness. Filtrar a
// mensagem exata é honesto; filtrar por prefixo esconderia defeito de verdade.
const DO_HARNESS = 'The root document of this element is not valid for pointer lock.'
page.on('pageerror', (e) => {
  const m = String(e.message)
  if (m.trim() !== DO_HARNESS) erros.push(m.slice(0, 200))
})
await page.addInitScript(
  `window.__ROS_E2E__={auth:{uid:'e2e',email:'e@e.t',emailVerified:true,displayName:'E',role:'user'},googleDrive:{isConnected:false,files:[],user:{}},googleMapsApiKey:'',roquecraftSeed:1337}`,
)
await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => !!window.__rosStore, null, { timeout: 30000 })
await page.evaluate(() => window.__rosStore.openWindow('roquecraft'))
await page.waitForFunction(() => window.__roquecraft?.state?.ready === true, null, {
  timeout: 120000,
})
await page.evaluate(async () => {
  window.__roquecraft.setMode('creative')
  await window.__roquecraft.stage({ height: 8, radius: 4, wait: 1500 })
})

const v = []
const ok = (c, t) => {
  v.push(`${c ? '✅' : '❌'} ${t}`)
  return c
}
let bom = true

/**
 * A prova de que a tela está USÁVEL, e não só montada.
 *
 * ⚠️ O `pointer lock` NÃO PODE SER SIMULADO PELO HARNESS: o navegador só
 * concede o bloqueio depois de um gesto do usuário, e em headless ele não
 * engata. Então a pergunta não é "o ponteiro está preso" — é o que o jogo FAZ:
 * se mover o mouse gira a câmera enquanto a tela está aberta, o jogador não
 * consegue mirar num botão, é exatamente a queixa, e isso se mede pelo yaw.
 */
async function medirTela(nome, abrir, seletorDeControle) {
  await page.evaluate(abrir)
  await page.waitForTimeout(700)

  const antes = await page.evaluate(() => window.__roquecraft.state.yaw)
  // Um arrasto largo, como quem vai até um botão do outro lado do painel.
  await page.mouse.move(300, 300)
  await page.mouse.move(900, 500, { steps: 14 })
  await page.waitForTimeout(300)
  const depois = await page.evaluate(() => window.__roquecraft.state.yaw)
  const girou = Math.abs(depois - antes)

  const tapado = await page.evaluate(() => {
    const b = document.querySelector('.ros-roquecraft__play')
    if (!b) return { existe: false }
    const r = b.getBoundingClientRect()
    return { existe: true, area: Math.round(r.width * r.height) }
  })

  const cv = await page.locator('canvas').first().boundingBox()
  await page.screenshot({ path: path.join(SAIDA, `${nome}.png`), clip: cv || undefined })

  // O clique REAL: no centro do controle, com o mouse.
  let chegou = null
  const alvo = await page.$(seletorDeControle)
  if (alvo) {
    const cx = await alvo.boundingBox()
    if (cx) {
      await page.evaluate((s) => {
        window.__cliqueChegou = false
        document.querySelector(s)?.addEventListener('click', () => (window.__cliqueChegou = true), {
          once: true,
        })
      }, seletorDeControle)
      // Quem está NO PONTO: se o clique não chega, a resposta é o elemento que
      // o navegador encontra ali — e não um palpite sobre z-index.
      const noPonto = await page.evaluate(
        ({ x, y }) => {
          const e = document.elementFromPoint(x, y)
          if (!e) return 'nada'
          return `${e.tagName.toLowerCase()}.${String(e.className || '').split(' ').slice(0, 2).join('.')}`
        },
        { x: cx.x + cx.width / 2, y: cx.y + cx.height / 2 },
      )
      await page.mouse.click(cx.x + cx.width / 2, cx.y + cx.height / 2)
      await page.waitForTimeout(250)
      chegou = await page.evaluate(() => window.__cliqueChegou === true)
      if (!chegou) v.push(`   ↳ no ponto do clique está: ${noPonto}`)
    }
  }

  // ⚠️ ESTA AFIRMAÇÃO NÃO PROVA NADA NESTE HARNESS, e está aqui declarada:
  // sem pointer lock em headless, o giro é zero de qualquer jeito, com ou sem
  // defeito. Ela vale como rede para o dia em que a sonda rodar num navegador
  // de verdade. Quem pega o defeito aqui é a afirmação do botão logo abaixo.
  bom =
    ok(
      girou < 0.01,
      `${nome}: mover o mouse girou a câmera ${girou.toFixed(4)} rad (sem pointer lock no harness — não separa)`,
    ) && bom
  bom =
    ok(
      !tapado.existe,
      `${nome}: o botão "clique pra jogar" ${tapado.existe ? `está por cima (${tapado.area} px²)` : 'não está na tela'}`,
    ) && bom
  bom =
    ok(
      chegou === true,
      chegou === null
        ? `${nome}: o controle ${seletorDeControle} NÃO ESTAVA NA TELA — nada foi medido`
        : `${nome}: o clique de mouse chegou em ${seletorDeControle}`,
    ) && bom
  return { girou: Number(girou.toFixed(4)), tapado, chegou }
}

const criativo = await medirTela(
  '1-criativo',
  () => window.__roquecraft.abrirCriativo(),
  '[data-test="rc-cri-meioDia"]',
)

// Fecha o criativo antes de abrir o comércio.
await page.evaluate(() => window.__roquecraft.abrirCriativo())
await page.waitForTimeout(400)

// ⚠️ O ALDEÃO É CRIADO, NÃO CAÇADO. A primeira versão perguntava por moradores
// na semente do dia e não achava nenhum — e uma sonda que pula a metade do
// pedido quando o cenário não colabora é uma sonda que aprova por ausência.
const temAldeao = await page.evaluate(async () => {
  const rc = window.__roquecraft
  rc.spawnMob('aldeao', 3, 0)
  await new Promise((k) => setTimeout(k, 900))
  const m = rc.moradoresPerto?.() ?? []
  if (!m.length) return false
  return rc.abrirAldeao(m[0].id)
})

let comercio = null
if (temAldeao) {
  // ⚠️ O BOTÃO DE FECHAR, e não o de conversar. O aldeão criado por `spawnMob`
  // não recebe persona, então o painel de conversa (`v-if="conversa"`) não
  // monta e `rc-npc-falar` não existe — a sonda media um controle ausente e
  // devolvia `null`, que não é "o clique não chegou", é "não havia onde
  // clicar". O `x` existe em qualquer estado do comércio.
  comercio = await medirTela('2-comercio', () => {}, '.rc-com__x')
} else {
  v.push('· não havia aldeão ao alcance nesta semente — o comércio não foi medido')
}

bom = ok(erros.length === 0, `sem erro de página (${erros.length})`) && bom

console.log(JSON.stringify({ veredito: v, criativo, comercio, temAldeao, erros }, null, 2))
await ctx.close()
await b.close()
fechar()
process.exit(bom ? 0 : 1)
