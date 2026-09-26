//
// REDSTONE, NO JOGO — a alavanca acende a lâmpada, e a tocha inverte.
//
// ⚠️ O TESTE DE UNIDADE PROVA A REGRA COM UM MUNDO DE MENTIRA. O que ele não
// pode provar é que a energia CORRE: entre a regra certa e o circuito que
// funciona estão a fila de atualização (quem acorda quem, e quando), a escrita
// no mundo e o clique na alavanca. Um circuito com a regra certa e a fila errada
// fica parado, e nenhum teste de unidade acusa.
//
// O circuito é o mais simples que tem lógica de verdade:
//
//   alavanca → fio → [bloco] com TOCHA em cima → fio → lâmpada
//
// Com a alavanca DESLIGADA a tocha fica acesa e a lâmpada acende. Ligando a
// alavanca, o bloco energiza, a tocha APAGA e a lâmpada apaga junto. É um NÃO —
// e é por ele que redstone deixa de ser um interruptor comprido.
//
//   node scripts/qa-roquecraft-redstone.mjs
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

  // Uma laje de pedra para tudo se apoiar, e o circuito por cima.
  rc.fill(-2, y - 1, -2, 10, y - 1, 2, 'stone')
  await dorme(300)

  // alavanca em x=0; fio de 0..3; bloco em x=4 com a tocha em cima;
  // fio de 5..7 no nível de cima; lâmpada em x=8.
  rc.fill(0, y, 0, 0, y, 0, 'leverOff')
  rc.fill(1, y, 0, 3, y, 0, 'redstoneDust0')
  rc.fill(4, y, 0, 4, y, 0, 'stone')
  rc.fill(4, y + 1, 0, 4, y + 1, 0, 'redstoneTorchOn')
  rc.fill(5, y, 0, 7, y, 0, 'stone')
  rc.fill(5, y + 1, 0, 7, y + 1, 0, 'redstoneDust0')
  rc.fill(8, y, 0, 8, y, 0, 'stone')
  rc.fill(8, y + 1, 0, 8, y + 1, 0, 'redstoneLampOff')
  await dorme(1500)

  const ler = () => ({
    fio: [1, 2, 3].map((x) => rc.blockKeyAt(x, y, 0)),
    tocha: rc.blockKeyAt(4, y + 1, 0),
    fio2: [5, 6, 7].map((x) => rc.blockKeyAt(x, y + 1, 0)),
    lampada: rc.blockKeyAt(8, y + 1, 0),
    alavanca: rc.blockKeyAt(0, y, 0),
  })

  const desligada = ler()

  // O jogador VIRA a alavanca: olha para ela e interage, como no jogo.
  rc.teleport(0.5, y + 1 + 1.62, 0.5)
  rc.look(0, -1.5)
  const mirado = rc.miraEm()
  rc.interagir()
  await dorme(1500)
  const ligada = ler()

  rc.interagir()
  await dorme(1500)
  const desligadaDeNovo = ler()

  return { y, desligada, ligada, desligadaDeNovo, mirado: mirado?.chave ?? 'nada' }
})

await ctx.close()
await b.close()
fechar()

const nivel = (k) => (k?.startsWith('redstoneDust') ? Number(k.slice(12)) : -1)
const falhas = []

if (r.mirado !== 'leverOff') falhas.push(`a mira nao pegou a alavanca: ${r.mirado}`)
if (r.ligada.alavanca !== 'leverOn') falhas.push(`o clique nao virou a alavanca: ${r.ligada.alavanca}`)

// ── ALAVANCA DESLIGADA: a tocha fica acesa e a lâmpada acende ───────────────
if (r.desligada.tocha !== 'redstoneTorchOn') {
  falhas.push(`com a alavanca desligada a tocha devia estar acesa: ${r.desligada.tocha}`)
}
if (nivel(r.desligada.fio2[0]) <= 0) {
  falhas.push(`a tocha nao alimentou o segundo fio: ${JSON.stringify(r.desligada.fio2)}`)
}
if (r.desligada.lampada !== 'redstoneLampOn') {
  falhas.push(`a lampada devia estar acesa: ${r.desligada.lampada}`)
}

// ── ALAVANCA LIGADA: o fio acende, a tocha apaga, a lâmpada apaga ──────────
const niveis = r.ligada.fio.map(nivel)
if (!(niveis[0] > niveis[1] && niveis[1] > niveis[2])) {
  falhas.push(`o fio nao decaiu com a distancia: ${JSON.stringify(niveis)}`)
}
if (r.ligada.tocha !== 'redstoneTorchOff') {
  falhas.push(`a tocha nao inverteu — sem inversor nao ha logica: ${r.ligada.tocha}`)
}
if (r.ligada.lampada !== 'redstoneLampOff') {
  falhas.push(`a lampada nao apagou: ${r.ligada.lampada}`)
}

// ── E VOLTA: circuito que só liga é interruptor, não circuito ──────────────
if (r.desligadaDeNovo.tocha !== 'redstoneTorchOn' || r.desligadaDeNovo.lampada !== 'redstoneLampOn') {
  falhas.push(
    `desligando de novo o circuito nao voltou: tocha ${r.desligadaDeNovo.tocha}, ` +
      `lampada ${r.desligadaDeNovo.lampada}`,
  )
}
if (r.desligadaDeNovo.fio.map(nivel).some((n) => n > 0)) {
  falhas.push(`o fio ficou aceso sem fonte: ${JSON.stringify(r.desligadaDeNovo.fio)}`)
}
if (erros.length) falhas.push(`erro de pagina: ${erros[0]}`)

const linha = (nome, e) =>
  `  ${nome.padEnd(16)} fio ${JSON.stringify(e.fio.map(nivel))}  tocha ${String(e.tocha).padEnd(18)} ` +
  `fio2 ${JSON.stringify(e.fio2.map(nivel))}  ${e.lampada}`

console.log('')
console.log('redstone — alavanca, fio, tocha (o NÃO) e lampada')
console.log('')
console.log(linha('desligada', r.desligada))
console.log(linha('LIGADA', r.ligada))
console.log(linha('desligada again', r.desligadaDeNovo))
console.log('')
if (falhas.length) {
  console.log('VERMELHO:')
  for (const f of falhas) console.log(`  ✗ ${f}`)
} else {
  console.log('VERDE: a energia corre, decai com a distancia e a tocha inverte.')
}
console.log('')
process.exit(falhas.length ? 1 : 0)
