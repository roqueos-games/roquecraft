//
// NAVEGAR OS MENUS PELO TECLADO (Goal 23, onda 1).
//
// `focoDeTela.spec` prova a regra pura; `useFocoDeTela.spec` prova o ciclo de
// vida contra uma tela de mentira. O que SÓ o jogo prova é que a malha está
// pendurada nas telas de verdade, com o conteúdo de verdade, por cima de um
// canvas que também escuta teclado — que é justamente onde o Tab escapava.
//
// Para cada tela alcançável: abrir põe o foco DENTRO dela; Tab circula; e
// depois de mais Tabs que o número de controles, o foco CONTINUA dentro. Esta
// última é a armadilha, e é a que falta em toda tela que é um `<div>` por cima
// do jogo em vez de um `<dialog>`.
//
//   node scripts/qa-roquecraft-navegacao.mjs
//
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { servirDist } from './lib/servidor-do-dist.mjs'

const SAIDA = path.resolve('scripts/.qa-navegacao')
fs.mkdirSync(SAIDA, { recursive: true })
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
page.on('pageerror', (e) => erros.push(String(e.message).slice(0, 200)))
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

const v = []
let bom = true
const ok = (c, m) => {
  v.push(`${c ? '✅' : '❌'} ${m}`)
  if (!c) bom = false
  return c
}

await page.evaluate(() => window.__roquecraft.entrarNoJogo?.())
await page.waitForTimeout(1500)
await page.evaluate(() => {
  const rc = window.__roquecraft
  rc.setMode('creative')
  rc.setTime(6000)
})
await page.waitForTimeout(400)

/** Onde o foco está agora, e se está dentro da tela pedida. */
const foco = (seletor) =>
  page.evaluate((sel) => {
    const SEL =
      'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const tela = document.querySelector(sel)
    const a = document.activeElement
    const lista = tela ? [...tela.querySelectorAll(SEL)] : []
    return {
      existe: !!tela,
      dentro: !!(tela && a && tela.contains(a) && a !== document.body),
      // ⚠️ O ALVO É O ÍNDICE, NÃO A TAG. Identificar por `tagName` fazia todos
      // os botões de um menu virarem a mesma string "button": o inventário
      // contou UM alvo em 286 Tabs e o caso acusou "o Tab não moveu o foco"
      // com a navegação funcionando perfeitamente. A medida é que estava cega.
      alvo: lista.indexOf(a),
      rotulo: a ? `${a.tagName.toLowerCase()}${a.id ? '#' + a.id : ''}` : null,
      focaveis: lista.length,
    }
  }, seletor)

/**
 * Uma tela inteira: abre, mede a entrada, anda com Tab e confere que o foco
 * ficou dentro depois de dar a volta.
 */
async function medir(nome, seletor, abrir, fecharTela) {
  await page.evaluate(abrir)
  await page.waitForTimeout(500)
  const entrada = await foco(seletor)
  if (!ok(entrada.existe, `${nome}: a tela nem abriu`)) return null
  ok(entrada.focaveis > 0, `${nome}: nenhum controle focável (${entrada.focaveis})`)
  ok(entrada.dentro, `${nome}: abriu sem foco — a primeira tecla se perde: ${entrada.rotulo}`)

  // Anda uma volta INTEIRA mais dois: se a armadilha não existir, em algum
  // momento o foco sai para trás do véu e não volta.
  const voltas = entrada.focaveis + 2
  const vistos = new Set()
  for (let i = 0; i < voltas; i++) {
    await page.keyboard.press('Tab')
    const f = await foco(seletor)
    if (!f.dentro) {
      ok(false, `${nome}: o foco ESCAPOU no Tab ${i + 1} de ${voltas} (foi para ${f.rotulo})`)
      await page.evaluate(fecharTela)
      await page.waitForTimeout(300)
      return null
    }
    vistos.add(f.alvo)
  }
  ok(true, `${nome}: ${entrada.focaveis} focáveis, ${voltas} Tabs, o foco nunca saiu`)
  // Mais de um alvo visto prova que o Tab ANDOU — um foco preso num controle
  // só passaria no teste acima sem navegar nada.
  ok(vistos.size > 1 || entrada.focaveis === 1, `${nome}: o Tab não moveu o foco (${vistos.size})`)
  await page.screenshot({ path: path.join(SAIDA, `${nome}.png`) })
  await page.evaluate(fecharTela)
  await page.waitForTimeout(400)
  return entrada
}

const inv = await medir(
  'inventario',
  '.rc-inv',
  () => window.__roquecraft.openInventory(),
  () => window.__roquecraft.openInventory(),
)
const pausa = await medir(
  'pausa',
  '.rc-pause',
  () => window.__roquecraft.openPause(),
  () => window.__roquecraft.openPause(),
)
const criativo = await medir(
  'criativo',
  '.rc-cri',
  () => window.__roquecraft.abrirCriativo(),
  () => window.__roquecraft.abrirCriativo(),
)
const lobby = await medir(
  'lobby',
  '.rc-lobby',
  () => window.__roquecraft.openLobby(),
  () => window.__rosStore && window.__roquecraft.openLobby(),
)

console.log(v.join('\n'))
console.log(JSON.stringify({ inv, pausa, criativo, lobby, fotos: SAIDA, erros }, null, 2))
ok(erros.length === 0, `sem erro de página (${erros.length})`)
await ctx.close()
await b.close()
await fechar()
process.exit(bom ? 0 : 1)
