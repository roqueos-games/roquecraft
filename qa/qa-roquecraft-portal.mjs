//
// O PORTAL, NO JOGO — a moldura acende, e apaga quando quebra.
//
// ⚠️ O TESTE DE UNIDADE PROVA A REGRA, NÃO O CLIQUE. `portal.spec.js` exercita
// `acharMoldura` com um mundo de mentira de dez linhas e prova que a forma é
// reconhecida. Entre isso e o portal aceso na tela há a mira (qual célula o
// clique resolve), o despacho do item na mão, a escrita no mundo e a fila de
// atualização — quatro lugares onde a regra certa não vira portal nenhum.
//
// Esta sonda faz o caminho do jogador: empilha obsidiana, equipa o isqueiro,
// olha para dentro do vão e clica. Depois quebra UMA peça da moldura e cobra
// que o plano roxo se apague.
//
//   node scripts/qa-roquecraft-portal.mjs
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

  // Um vão de 2×3 no ar, longe do terreno, para que nada do mundo encoste.
  const y0 = Math.round(rc.surfaceAt(0, 0) ?? 66) + 12
  rc.teleport(0.5, y0 + 6, 0.5)
  await rc.waitChunks(2, 30000)

  // A moldura de dez peças: base, topo e os dois lados. Os CANTOS ficam de fora
  // de propósito — é a moldura que todo jogador constrói.
  rc.fill(0, y0 - 1, 0, 1, y0 - 1, 0, 'obsidian')
  rc.fill(0, y0 + 3, 0, 1, y0 + 3, 0, 'obsidian')
  rc.fill(-1, y0, 0, -1, y0 + 2, 0, 'obsidian')
  rc.fill(2, y0, 0, 2, y0 + 2, 0, 'obsidian')
  await dorme(500)

  const vao = () => {
    const saida = []
    for (let x = 0; x <= 1; x++) for (let y = y0; y <= y0 + 2; y++) saida.push(rc.blockKeyAt(x, y, 0))
    return saida
  }
  const antes = vao()

  // O jogador olha PARA BAIXO de dentro do vão: o raio bate no topo da
  // obsidiana da base e a célula de colocar é a de baixo do vão.
  rc.equipar('flint_and_steel', 1)
  // ⚠️ O OLHO TEM QUE FICAR DENTRO DO VÃO. A primeira versão pôs o jogador
  // acima da moldura: o raio batia na obsidiana do TOPO, a célula de colocar
  // caía fora do vão e `acharMoldura` recusava — mira verde, portal nenhum.
  rc.teleport(0.5, y0, 0.5)
  rc.look(0, -1.5)
  const mirado = rc.miraEm()
  const naMao = rc.naMao()
  const colocou = rc.place()
  await dorme(400)
  const depois = vao()

  // Agora quebra UMA peça do lado. O portal tem que apagar inteiro.
  rc.teleport(0.5, y0 + 6, 0.5)
  rc.fill(-1, y0 + 1, 0, -1, y0 + 1, 0, 'air')
  await dorme(1500)
  const apagado = vao()

  return { y0, antes, depois, apagado, mirado: mirado?.chave ?? 'nada', colocou, naMao }
})

await ctx.close()
await b.close()
fechar()

const roxos = (v) => v.filter((k) => k === 'netherPortalX' || k === 'netherPortalZ').length
const falhas = []
if (r.mirado !== 'obsidian') falhas.push(`a mira nao pegou a moldura: ${r.mirado}`)
if (r.naMao !== 'flint_and_steel') falhas.push(`o isqueiro nao foi para a mao: ${r.naMao}`)
if (r.colocou !== true) falhas.push(`o clique com o isqueiro nao foi tratado: ${r.colocou}`)
if (roxos(r.antes) !== 0) falhas.push(`o vao ja nascia aceso: ${JSON.stringify(r.antes)}`)
if (roxos(r.depois) !== 6) {
  falhas.push(`acender nao encheu o vao: ${roxos(r.depois)} de 6 — ${JSON.stringify(r.depois)}`)
}
if (roxos(r.apagado) !== 0) {
  falhas.push(
    `quebrar a moldura nao apagou o portal: ${roxos(r.apagado)} celulas ainda acesas — ` +
      'o plano roxo ficou pendurado no ar, e atravessavel',
  )
}
if (erros.length) falhas.push(`erro de pagina: ${erros[0]}`)

console.log('')
console.log('portal — a moldura acende e apaga')
console.log('')
console.log(`  vao em y=${r.y0}, mira: ${r.mirado}, na mao: ${r.naMao}`)
console.log(`  antes do isqueiro: ${roxos(r.antes)}/6 acesas`)
console.log(`  depois do clique:  ${roxos(r.depois)}/6 acesas`)
console.log(`  moldura quebrada:  ${roxos(r.apagado)}/6 acesas`)
console.log('')
if (falhas.length) {
  console.log('VERMELHO:')
  for (const f of falhas) console.log(`  ✗ ${f}`)
} else {
  console.log('VERDE: a moldura vira portal ao clique, e apaga quando quebra.')
}
console.log('')
process.exit(falhas.length ? 1 : 0)
