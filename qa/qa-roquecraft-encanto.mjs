//
// A MESA DE ENCANTAMENTO, NO JOGO — o nível vira coisa e a coisa MORDE.
//
// ⚠️ O QUE O TESTE DE UNIDADE NÃO PODE PROVAR. `encantamento.spec.js` prova a
// regra e `interacaoEncanto.spec.js` prova o degrau da escada com um contexto de
// mentira. Nenhum dos dois passa pelo componente, e é lá que moram as três
// MORDIDAS: o tempo de quebra multiplicado por `fatorDeEficiencia`, o dano
// somado a `bonusDeAfiacao` e o `damageTool` filtrado por `gastaDurabilidade`.
//
// Um encanto que grava `{eficiencia: 2}` no item e não muda nada no jogo passa
// verde nos dois specs e é exatamente a barra de XP que não paga, uma camada
// abaixo — que é o defeito que este slice nasceu para consertar. Então a sonda
// mede o EFEITO, no jogo, com o item na mão:
//
//   1. clicar na mesa sem nível NÃO encanta e NÃO cobra;
//   2. com nível, encanta, cobra, e o item carrega o encanto;
//   3. a mesma pedra quebra mais RÁPIDO com a picareta encantada;
//   4. com `inquebravel` alto a durabilidade cai MENOS a cada quebra.
//
//   node scripts/qa-roquecraft-encanto.mjs
//
import { chromium } from 'playwright'
import { servirDist } from './lib/servidor-do-dist.mjs'

const { base, fechar } = await servirDist('dist/pwa')
const b = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const ctx = await b.newContext({ viewport: { width: 900, height: 820 }, serviceWorkers: 'block' })
const page = await ctx.newPage()
const erros = []
page.on('pageerror', (e) => erros.push(String(e.message).slice(0, 160)))
await page.addInitScript(
  `window.__ROS_E2E__={auth:{uid:'e2e',email:'e@e.t',emailVerified:true,displayName:'E',role:'user'},googleDrive:{isConnected:false,files:[],user:{}},googleMapsApiKey:'',roquecraftSeed:942457}`,
)
await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => !!window.__rosStore, null, { timeout: 30000 })
await page.waitForTimeout(500)
await page.evaluate(() => window.__rosStore.openWindow('roquecraft'))
await page.waitForFunction(() => window.__roquecraft?.state?.ready === true, null, {
  timeout: 120000,
})
await page.waitForTimeout(1000)

const r = await page.evaluate(async () => {
  const rc = window.__roquecraft
  const dorme = (ms) => new Promise((k) => setTimeout(k, ms))
  rc.setMode('creative')
  rc.setFlying(true)

  const y = Math.round(rc.surfaceAt(0, 0) ?? 66) + 8
  rc.teleport(0.5, y + 4, 0.5)
  await rc.waitChunks(2, 30000)

  // Chão e a mesa, com o jogador em cima olhando pra baixo.
  rc.fill(-3, y - 1, -3, 3, y - 1, 3, 'stone')
  rc.fill(0, y, 0, 0, y, 0, 'enchantingTable')
  await dorme(500)
  rc.teleport(0.5, y + 1 + 1.62, 1.5)
  rc.look(0, -1.2)
  await dorme(300)
  const mirado = rc.miraEm()?.chave ?? 'nada'

  // ── 1. sem nível ──────────────────────────────────────────────────────────
  rc.setMode('survival')
  rc.equipar('iron_pickaxe', 1)
  await dorme(200)
  const antesSemNivel = { nivel: rc.state.level, enc: rc.encantosNaMao() }
  rc.interagir()
  await dorme(300)
  const semNivel = { nivel: rc.state.level, enc: rc.encantosNaMao() }

  // ── 2. com nível ──────────────────────────────────────────────────────────
  rc.darNivel(40)
  await dorme(200)
  const antes = { nivel: rc.state.level, enc: rc.encantosNaMao() }
  // até três cliques: o sorteio pode cair em qualquer dos possíveis, e o que a
  // sonda precisa é que ALGUM encanto entre e que o nível caia.
  for (let i = 0; i < 3; i++) {
    rc.interagir()
    await dorme(250)
  }
  const depois = { nivel: rc.state.level, enc: rc.encantosNaMao() }

  // ── 3. a mordida da EFICIÊNCIA ───────────────────────────────────────────
  //
  // A mesma pedra, a mesma picareta, duas vezes: uma limpa e uma com eficiência
  // III. O relógio é o do jogo (`rc.minerar` segura o botão e devolve quando o
  // bloco cai), então o que se compara é tempo de jogo e não de parede.
  const cronometrar = async (enc) => {
    rc.setMode('survival')
    rc.equiparComEncanto('iron_pickaxe', enc)
    rc.fill(1, y, 1, 1, y, 1, 'stone')
    await dorme(250)
    rc.teleport(1.5, y + 1 + 1.62, 2.5)
    rc.look(0, -1.2)
    await dorme(200)
    const t0 = performance.now()
    const caiu = await rc.minerarMirado(9000)
    return { ms: performance.now() - t0, caiu, alvo: rc.miraEm()?.chave ?? 'nada' }
  }
  const limpa = await cronometrar(null)
  const rapida = await cronometrar({ eficiencia: 3 })

  // ── 4. a mordida do INQUEBRÁVEL ──────────────────────────────────────────
  const gastar = async (enc, quantas) => {
    rc.setMode('survival')
    rc.equiparComEncanto('iron_pickaxe', enc)
    const antesDur = rc.durabilidadeNaMao()
    for (let i = 0; i < quantas; i++) {
      rc.fill(1, y, 1, 1, y, 1, 'stone')
      await dorme(120)
      rc.teleport(1.5, y + 1 + 1.62, 2.5)
      rc.look(0, -1.2)
      await dorme(80)
      await rc.minerarMirado(9000)
    }
    return antesDur - rc.durabilidadeNaMao()
  }
  const gastoLimpo = await gastar(null, 12)
  const gastoInquebravel = await gastar({ inquebravel: 3 }, 12)

  return {
    y,
    mirado,
    antesSemNivel,
    semNivel,
    antes,
    depois,
    limpa,
    rapida,
    gastoLimpo,
    gastoInquebravel,
  }
})

await ctx.close()
await b.close()
fechar()

const falhas = []
const n = (o) => Object.keys(o.enc || {}).length

if (r.mirado !== 'enchantingTable') falhas.push(`a mira nao pegou a mesa: ${r.mirado}`)

// 1 — sem nível, nada acontece
if (n(r.semNivel) !== 0) {
  falhas.push(`encantou sem nivel: ${JSON.stringify(r.semNivel.enc)}`)
}
if (r.semNivel.nivel !== r.antesSemNivel.nivel) {
  falhas.push(`cobrou sem encantar: ${r.antesSemNivel.nivel} → ${r.semNivel.nivel}`)
}

// 2 — com nível, encanta e cobra
if (n(r.depois) === 0) falhas.push('com 40 niveis, tres cliques na mesa nao encantaram nada')
if (r.depois.nivel >= r.antes.nivel) {
  falhas.push(`encantou de graca: ${r.antes.nivel} → ${r.depois.nivel}`)
}

// 3 — a eficiência morde: a pedra cai mais rápido
if (!r.limpa.caiu || !r.rapida.caiu) {
  falhas.push(`a pedra nao caiu: limpa ${r.limpa.caiu}, encantada ${r.rapida.caiu}`)
} else if (!(r.rapida.ms < r.limpa.ms * 0.75)) {
  falhas.push(
    `eficiencia III nao mordeu no tempo de quebra: ${Math.round(r.limpa.ms)}ms → ` +
      `${Math.round(r.rapida.ms)}ms (esperado abaixo de ${Math.round(r.limpa.ms * 0.75)}ms)`,
  )
}

// 4 — o inquebrável morde: gasta menos, e NUNCA zero
if (!(r.gastoLimpo > 0)) falhas.push(`a picareta limpa nao gastou durabilidade: ${r.gastoLimpo}`)
if (!(r.gastoInquebravel > 0)) {
  falhas.push(`inquebravel III zerou o gasto — a ferramenta virou eterna: ${r.gastoInquebravel}`)
}
if (!(r.gastoInquebravel < r.gastoLimpo)) {
  falhas.push(`inquebravel III nao mordeu: ${r.gastoLimpo} → ${r.gastoInquebravel} de 12 quebras`)
}
if (erros.length) falhas.push(`erro de pagina: ${erros[0]}`)

console.log('')
console.log('mesa de encantamento — o nivel vira coisa, e a coisa morde')
console.log('')
console.log(`  mira                 ${r.mirado}`)
console.log(
  `  sem nivel            nivel ${r.antesSemNivel.nivel} → ${r.semNivel.nivel}  ` +
    `encantos ${JSON.stringify(r.semNivel.enc)}`,
)
console.log(
  `  com nivel            nivel ${r.antes.nivel} → ${r.depois.nivel}  ` +
    `encantos ${JSON.stringify(r.depois.enc)}`,
)
console.log(
  `  quebra da pedra      limpa ${Math.round(r.limpa.ms)}ms  ` +
    `eficiencia III ${Math.round(r.rapida.ms)}ms`,
)
console.log(
  `  gasto em 12 quebras  limpa ${r.gastoLimpo}  inquebravel III ${r.gastoInquebravel}`,
)
console.log('')
if (falhas.length) {
  console.log('VERMELHO:')
  for (const f of falhas) console.log(`  ✗ ${f}`)
} else {
  console.log('VERDE: a mesa cobra, o encanto entra, e os dois mordem no jogo.')
}
console.log('')
process.exit(falhas.length ? 1 : 0)
