//
// TELEPORTE DE DIMENSÃO PELO MENU K (Goal 23, onda 3).
//
// `viagemEntreDimensoes.spec` prova o PLANO — para onde ir e onde pousar.
// `RCCriativo.spec` prova o painel. O que só o jogo prova é a EXECUÇÃO: que o
// clique no botão chega na travessia, que a dimensão viva muda de verdade, que
// o jogador chega EM PÉ SOBRE CHÃO SÓLIDO e não caindo no vazio, e que dá para
// voltar.
//
// ⚠️ E QUE O TELEPORTE NÃO CAVA PORTAL. A travessia a pé constrói o portal de
// chegada, porque quem atravessa a pé precisa de como voltar; quem teleporta
// tem o menu. Cavar obsidiana no mundo de alguém por causa de um clique num
// painel seria uma edição que o jogador não pediu e não desfaz — e é o tipo de
// coisa que só se descobre jogando.
//
//   node scripts/qa-roquecraft-teleporte.mjs
//
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { servirDist } from './lib/servidor-do-dist.mjs'

const SAIDA = path.resolve('scripts/.qa-teleporte')
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
const inicio = await page.evaluate(async () => {
  const rc = window.__roquecraft
  rc.setMode('creative')
  rc.setTime(6000)
  await new Promise((r) => setTimeout(r, 600))
  return { dimensao: rc.dimensaoAtual(), modo: rc.state.mode }
})
ok(inicio.dimensao === 'overworld', `o jogo começa no supermundo: ${JSON.stringify(inicio)}`)

/**
 * Clica no botão de um destino, pelo painel, e devolve o que virou o mundo.
 *
 * ⚠️ PELO BOTÃO, e não pelo gancho: o que esta sonda existe para provar é a
 * FIAÇÃO — que o clique chega na travessia. Chamar `irPara` direto testaria a
 * travessia de novo e pularia justamente o que pode quebrar.
 */
async function irPara(destino) {
  await page.evaluate(async (d) => {
    const rc = window.__roquecraft
    if (!rc.criativoAberto()) rc.abrirCriativo()
    await new Promise((r) => setTimeout(r, 300))
    document.querySelector('[data-test="rc-cri-aba-lugares"]')?.click()
    await new Promise((r) => setTimeout(r, 200))
    document.querySelector(`[data-test="rc-cri-ir-${d}"]`)?.click()
  }, destino)
  await page.waitForTimeout(2600)
  return page.evaluate(() => {
    const rc = window.__roquecraft
    const p = rc.state.player
    const pe = Math.floor(p.y) - 1
    return {
      dimensao: rc.dimensaoAtual(),
      y: +p.y.toFixed(1),
      // O bloco DEBAIXO do pé: é ele que diz se o jogador pousou ou está caindo.
      // `blocoEm` devolve a CHAVE, e 'air' é a resposta de "não tem nada".
      blocoNoPe: rc.blocoEm(Math.floor(p.x), pe, Math.floor(p.z)),
      solidoNoPe: rc.solidoEm(Math.floor(p.x), pe, Math.floor(p.z)) > 0,
      vy: +(p.vy ?? 0).toFixed(2),
    }
  })
}

// ── 1. IDA AO NETHER ────────────────────────────────────────────────────────
const nether = await irPara('nether')
ok(nether.dimensao === 'nether', `o clique não levou ao Nether: ${JSON.stringify(nether)}`)
ok(nether.solidoNoPe, `chegou ao Nether caindo no vazio: ${JSON.stringify(nether)}`)
await page.screenshot({ path: path.join(SAIDA, '1-nether.png') })

// ── 2. DO NETHER AO FIM ─────────────────────────────────────────────────────
const fim = await irPara('end')
ok(fim.dimensao === 'end', `o clique não levou ao Fim: ${JSON.stringify(fim)}`)
ok(fim.solidoNoPe, `chegou ao Fim no vazio: ${JSON.stringify(fim)}`)
await page.screenshot({ path: path.join(SAIDA, '2-fim.png') })

// ── 3. E DE VOLTA PARA CASA ─────────────────────────────────────────────────
const volta = await irPara('overworld')
ok(volta.dimensao === 'overworld', `não deu para voltar: ${JSON.stringify(volta)}`)
ok(volta.solidoNoPe, `voltou caindo no vazio: ${JSON.stringify(volta)}`)
await page.screenshot({ path: path.join(SAIDA, '3-volta.png') })

// ── 4. O BOTÃO DE ONDE SE ESTÁ FICA DESLIGADO ───────────────────────────────
const aqui = await page.evaluate(() => {
  const b = document.querySelector('[data-test="rc-cri-ir-overworld"]')
  return { desligado: !!b?.disabled, existe: !!b }
})
ok(
  aqui.existe && aqui.desligado,
  `o botão do destino de agora está clicável: ${JSON.stringify(aqui)}`,
)

// ── 5. NINGUÉM CAVOU PORTAL ─────────────────────────────────────────────────
// Três teleportes; se cada um tivesse construído o portal de chegada, haveria
// obsidiana e portal no mundo — e o jogador não pediu nenhum deles.
const semPortal = await page.evaluate(() => {
  const rc = window.__roquecraft
  const p = rc.state.player
  let obsidiana = 0
  let portal = 0
  for (let dx = -12; dx <= 12; dx++)
    for (let dz = -12; dz <= 12; dz++)
      for (let dy = -3; dy <= 6; dy++) {
        const k = rc.blocoEm(Math.floor(p.x) + dx, Math.floor(p.y) + dy, Math.floor(p.z) + dz)
        if (k === 'obsidian') obsidiana++
        if (k === 'portal' || k === 'nether_portal') portal++
      }
  return { obsidiana, portal }
})
ok(
  semPortal.portal === 0,
  `o teleporte cavou portal no mundo do jogador: ${JSON.stringify(semPortal)}`,
)

console.log(v.join('\n'))
console.log(
  JSON.stringify({ inicio, nether, fim, volta, aqui, semPortal, fotos: SAIDA, erros }, null, 2),
)
ok(erros.length === 0, `sem erro de página (${erros.length})`)
await ctx.close()
await b.close()
await fechar()
process.exit(bom ? 0 : 1)
