//
// O ESCAPE DESMONTA A PILHA, E JAMAIS SAI DO JOGO.
//
// ⚠️ ESTA SONDA NASCEU DE UM DEFEITO QUE TESTE DE UNIDADE NENHUM VIU, porque o
// defeito não estava na lógica: estava na FIAÇÃO. A entrada tinha a própria
// enumeração de telas — a quinta do componente — e ela conhecia inventário e
// lobby e mais nada. Com o painel do criativo aberto, o `Escape` caía no `else`
// e abria o MENU DE PAUSA POR CIMA do painel, que nunca fechava.
//
// Relato do founder (16/09): "quando eu aperto o K o modal do pause entra sobre
// o menu de configuração de clima e o botão esc sobre esse menu está saindo do
// jogo, e o esc jamais deve sair do jogo".
//
// Medido ANTES do conserto, com estas mesmas teclas:
//   depois do K  {"criativo":true, "pausa":false}
//   1o Escape    {"criativo":true, "pausa":true}   ← a pausa por cima
//   2o Escape    {"criativo":true, "pausa":false}
//   3o Escape    {"criativo":true, "pausa":true}   ← e para sempre
//
// Três afirmações, com teclado de verdade sobre o `dist`:
//   1. o Escape FECHA o painel do criativo, e não abre a pausa;
//   2. um segundo Escape, com a pilha vazia, aí sim pausa;
//   3. em nenhum momento o jogo é abandonado (o menu do jogo não volta).
//
//   node scripts/qa-roquecraft-escape.mjs
//
import { chromium } from 'playwright'
import { servirDist } from './lib/servidor-do-dist.mjs'

const { base, fechar } = await servirDist('dist/pwa')
const b = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' })
const page = await ctx.newPage()
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
  await window.__roquecraft.stage({ height: 8, radius: 4, wait: 1200 })
})

const estado = () =>
  page.evaluate(() => ({
    criativo: window.__roquecraft.criativoAberto(),
    pausa: !!document.querySelector('.rc-pause'),
    // ⚠️ SAIR DO JOGO É ISTO, e não o botão "clique pra jogar": esse some
    // sozinho com QUALQUER tela aberta (`v-if="!telaAberta"`), então medir por
    // ele daria verde mesmo com o jogo abandonado. `menuOpen` é o menu do jogo,
    // para onde `enterMenu` leva — o sintoma que o founder relatou.
    saiu: window.__roquecraft.menuOpen(),
  }))

// Entra pela mesma porta do jogador.
await page.click('.ros-roquecraft__play').catch(() => {})
await page.waitForTimeout(600)

const v = []
let bom = true
const ok = (c, m) => {
  v.push(`${c ? '✅' : '❌'} ${m}`)
  if (!c) bom = false
  return c
}
const tecla = async (k) => {
  await page.keyboard.press(k)
  await page.waitForTimeout(600)
  return estado()
}

const inicio = await estado()
ok(!inicio.saiu && !inicio.pausa, 'começa DENTRO do jogo, sem pausa')

const comK = await tecla('KeyK')
ok(comK.criativo, 'o K abre o painel do criativo')

const esc1 = await tecla('Escape')
ok(!esc1.criativo, 'o 1o Escape FECHA o painel do criativo')
ok(!esc1.pausa, 'o 1o Escape não abre a pausa por cima — o defeito do founder')
ok(!esc1.saiu, 'o 1o Escape não saiu do jogo')

const esc2 = await tecla('Escape')
ok(esc2.pausa, 'com a pilha vazia, o 2o Escape pausa')
ok(!esc2.saiu, 'o 2o Escape não saiu do jogo')

const esc3 = await tecla('Escape')
ok(!esc3.pausa, 'o 3o Escape despausa')
ok(!esc3.saiu, '⚠️ o Escape JAMAIS sai do jogo')

console.log(JSON.stringify({ veredito: v, inicio, comK, esc1, esc2, esc3 }, null, 2))
await ctx.close()
await b.close()
fechar()
process.exit(bom ? 0 : 1)
