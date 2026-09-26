//
// O GOAL 20, FOTOGRAFADO E CONFERIDO.
//
// ⚠️ TUDO QUE AS SETE ONDAS FIZERAM É VISUAL, e teste de unidade não atravessa
// a tela. `pecaNaMao.spec.js` prova que a espada é comprida e fina; nada nele
// diz que ela CHEGOU na mão. `aldeaoModelo.spec.js` prova que o traje chega ao
// modelo; nada nele diz que o aldeão apareceu na vila.
//
// A divisão é a mesma da sonda do minimapa, e pelos mesmos motivos:
//   unidade → a conta está errada
//   ESTA    → a conta não chegou na tela
//   a foto  → ficou feio, e quem julga é o humano
//
// ⚠️ E ELA REPROVA POR MEDIÇÃO, não por foto. Quatro afirmações mecânicas:
//   1. cada classe de ferramenta desenha uma peça DIFERENTE na mão;
//   2. a tocha na mão não é um cubo;
//   3. cortar mato leva tempo de verdade (a queixa era de retorno);
//   4. o aldeão tem mais peças que o zumbi, e ofícios diferentes diferem.
//
//   node scripts/qa-roquecraft-goal20.mjs
//
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { servirDist } from './lib/servidor-do-dist.mjs'

const SAIDA = path.resolve('qa-out/goal20')
fs.mkdirSync(SAIDA, { recursive: true })

/** As classes que a mão tem que saber desenhar, e o item que as representa. */
const NA_MAO = [
  ['espada', 'iron_sword'],
  ['machado', 'iron_axe'],
  ['picareta', 'iron_pickaxe'],
  ['pa', 'iron_shovel'],
  ['enxada', 'wood_hoe'],
  ['tesoura', 'shears'],
  ['tocha', 'torch'],
]

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
await page.waitForTimeout(800)
await page.evaluate(() => {
  window.__roquecraft.setMode('creative')
  window.__roquecraft.setFlying(true)
})

const fotos = []
const fotografar = async (nome, clip = null) => {
  const arq = path.join(SAIDA, `${nome}.png`)
  await page.screenshot(clip ? { path: arq, clip } : { path: arq })
  fotos.push(path.relative(process.cwd(), arq))
}

/**
 * O quadrante inferior direito do CANVAS DO JOGO — onde a mão pousa.
 *
 * ⚠️ PERGUNTADO, NÃO CRAVADO. A primeira versão desta sonda usou
 * `{ x: 780, y: 420 }` e fotografou a doca do RoqueOS: o jogo roda numa JANELA
 * dentro do desktop, e a posição dela não é a do viewport. É o mesmo erro da
 * coordenada cravada da sonda da aldeia, cometido de novo três ondas depois.
 *
 * ⚠️ E AGORA É O CANVAS INTEIRO, não o canto. O recorte de 58% × 62% economizava
 * pixel e CUSTOU UM DIAGNÓSTICO ERRADO: em 15/09/2026 eu olhei essas fotos e
 * disse ao founder que a lâmina saía pelo topo da tela. Ela saía pelo topo do
 * RECORTE. Sonda que mostra menos que a tela faz quem olha julgar outra coisa.
 */
const cantoDaMao = async () => {
  const caixa = await page.locator('canvas').first().boundingBox()
  if (!caixa) return null
  return { x: caixa.x, y: caixa.y, width: caixa.width, height: caixa.height }
}
const recorte = await cantoDaMao()

// ── 1 e 2. O QUE ESTÁ NA MÃO ────────────────────────────────────────────────
//
// ⚠️ A MEDIÇÃO É A CAIXA ENVOLVENTE DA PEÇA NO MUNDO 3D, e não o pixel. Contar
// pixel na tela mediria também a luz, a pose e o recuo do golpe; o que se quer
// afirmar é que a GEOMETRIA é outra. Duas classes com a mesma caixa são duas
// classes com o mesmo desenho, que é literalmente o defeito da onda 1.
const naMao = {}
for (const [nome, item] of NA_MAO) {
  naMao[nome] = await page.evaluate(async (chave) => {
    const rc = window.__roquecraft
    rc.equipar(chave, 1)
    await new Promise((k) => setTimeout(k, 260))
    // ⚠️ QUEM MEDE É O JOGO, pelo gancho de QA. A primeira versão desta sonda
    // alcançava o engine por uma global que não existe e varria a árvore de
    // three aqui dentro — ou seja, reimplementava o que media. É o mesmo erro
    // que a sonda da aldeia cometeu com a coordenada cravada.
    return rc.pecaNaMao()
  }, item)
  await fotografar(`mao-${nome}`, recorte)
  // ⚠️ E UMA NO MEIO DO GOLPE. A queixa do founder era "a movimentação está
  // muito ruim", e uma foto em repouso não mostra movimentação nenhuma. O
  // instante é o PICO do arco, que `anim.js` põe em ~25% do ciclo.
  await page.evaluate(async () => {
    const rc = window.__roquecraft
    rc.golpear?.()
    await new Promise((k) => setTimeout(k, 75))
  })
  await fotografar(`golpe-${nome}`, recorte)
}

// ── 3. CORTAR O MATO ────────────────────────────────────────────────────────
const mato = await page.evaluate(async () => {
  const rc = window.__roquecraft
  rc.setMode('survival')
  return {
    naMao: rc.tempoDeQuebra('tallGrass'),
    comTesoura: rc.tempoDeQuebra('tallGrass', 'shears'),
  }
})

// ── 4. O ALDEÃO ─────────────────────────────────────────────────────────────
const aldeao = await page.evaluate(() => {
  const rc = window.__roquecraft
  return {
    zumbi: rc.modeloDeMob('zombie'),
    ferreiro: rc.modeloDeMob('aldeao', 'ferreiro'),
    clerigo: rc.modeloDeMob('aldeao', 'clerigo'),
  }
})

await b.close()
await fechar()

// ── O VEREDITO ──────────────────────────────────────────────────────────────
const problemas = []
const faltando = NA_MAO.filter(([n]) => !naMao[n])
if (faltando.length) {
  problemas.push(`a mão não desenhou peça para: ${faltando.map(([n]) => n).join(', ')}`)
} else {
  // Duas classes com a mesma caixa é o defeito da onda 1 de volta.
  const assinatura = (c) => `${c.caixas}|${c.w.toFixed(3)}|${c.h.toFixed(3)}|${c.d.toFixed(3)}`
  const vistas = new Map()
  for (const [nome] of NA_MAO) {
    const a = assinatura(naMao[nome])
    if (vistas.has(a)) problemas.push(`${nome} desenha igual a ${vistas.get(a)} na mão`)
    vistas.set(a, nome)
  }
  // A tocha não pode ser cubo: era exatamente o que o founder viu.
  const t = naMao.tocha
  if (t && t.h / Math.max(t.w, t.d) < 3) {
    problemas.push(`a tocha na mão está cúbica (h/l = ${(t.h / Math.max(t.w, t.d)).toFixed(2)})`)
  }
}
if (mato.naMao !== null && mato.naMao <= 0.05) {
  problemas.push(`cortar mato leva ${mato.naMao}s: voltou ao piso do laço, sem rachadura nem som`)
}
if (mato.comTesoura !== null && mato.comTesoura >= mato.naMao / 5) {
  problemas.push('a tesoura parou de ser a ferramenta do mato')
}
if (aldeao.ferreiro && aldeao.zumbi && aldeao.ferreiro.pecas <= aldeao.zumbi.pecas) {
  problemas.push('o aldeão voltou a ter o corpo do zumbi')
}
if (aldeao.ferreiro && aldeao.clerigo && aldeao.ferreiro.traje === aldeao.clerigo.traje) {
  problemas.push('ferreiro e clérigo saíram com o mesmo traje')
}
if (erros.length)
  problemas.push(`${erros.length} erro(s) de página: ${erros.slice(0, 2).join(' | ')}`)

console.log(
  JSON.stringify(
    {
      naMao,
      mato,
      aldeao,
      fotos,
      problemas,
      veredito: problemas.length ? 'REPROVADO' : 'as sete ondas chegaram na tela',
    },
    null,
    2,
  ),
)
process.exit(problemas.length ? 1 : 0)
