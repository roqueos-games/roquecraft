//
// A MUDA — a única coisa que torna a MADEIRA renovável.
//
// O mapa nasce com as árvores que tem e não faz mais nenhuma. Quem derruba a
// floresta em volta da base fica sem tábua, sem bancada e sem ferramenta nova;
// a muda caía das folhas e só enfeitava o inventário.
//
// ⚠️ PROVA DE VIDA: a sonda mede três coisas, e as três precisam ser
// verdadeiras ao mesmo tempo — a muda vira árvore a céu aberto, NÃO vira
// debaixo de um teto (senão ela arranca a casa do jogador), e a árvore que
// nasce tem tronco E copa. Só a primeira daria verde para uma muda que vira um
// tronco pelado dentro da sala.
//
//   node scripts/qa-roquecraft-muda.mjs
//
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { servirDist } from './lib/servidor-do-dist.mjs'

const SAIDA = path.resolve('scripts/.qa-muda')
fs.mkdirSync(SAIDA, { recursive: true })
const { base, fechar } = await servirDist('dist/pwa')

const b = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const ctx = await b.newContext({
  viewport: { width: 900, height: 820 },
  deviceScaleFactor: 1,
  serviceWorkers: 'block',
  locale: 'pt-BR',
})
const page = await ctx.newPage()
const erros = []
page.on('pageerror', (e) => erros.push(String(e.message).slice(0, 160)))
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
await page.addStyleTag({ content: '.ros-roquecraft__play{display:none !important}' })
const foto = (nome) => page.screenshot({ path: path.join(SAIDA, nome) })

const Y = await page.evaluate(() => {
  const rc = window.__roquecraft
  rc.setMode('creative')
  const y = Math.round(rc.surfaceAt(0, 0) ?? 66) + 12
  rc.setFlying(true)
  rc.teleport(0.5, y + 3, 0.5)
  rc.fill(-10, y - 2, -10, 10, y, 10, 'grassBlock')
  rc.fill(-10, y + 1, -10, 10, y + 20, 10, 'air')
  return y
})
await page.waitForTimeout(2600)

// Uma muda a céu aberto, outra debaixo de um teto de pedra.
await page.evaluate(
  ([y]) => {
    const rc = window.__roquecraft
    rc.fill(0, y + 1, 0, 0, y + 1, 0, 'oakSapling')
    rc.fill(6, y + 1, 6, 6, y + 1, 6, 'oakSapling')
    rc.fill(4, y + 4, 4, 8, y + 4, 8, 'stone') // teto sobre a segunda
  },
  [Y],
)
await page.waitForTimeout(1200)

// ⚠️ O TEMPO É ACELERADO PELO RELÓGIO DA FILA. A muda tem 4% de chance a cada
// 3 segundos: esperar de verdade levaria minutos e daria uma sonda que às vezes
// passa. `escoarFluidos` avança o MESMO relógio de 20 Hz do jogo.
const relogio = await page.evaluate(() => window.__roquecraft.escoarFluidos(20000))
await page.waitForTimeout(1500)

const leitura = await page.evaluate(
  ([y]) => {
    const rc = window.__roquecraft
    const em = (x, yy, z) => rc.colunaEm(x, z, yy, yy)?.[0]?.bloco ?? 'nada'
    let tronco = 0
    let folhas = 0
    for (let yy = y + 1; yy < y + 14; yy++) {
      for (let x = -3; x <= 3; x++) {
        for (let z = -3; z <= 3; z++) {
          const bloco = em(x, yy, z)
          if (bloco === 'oakLog') tronco++
          if (bloco === 'oakLeaves') folhas++
        }
      }
    }
    return { aberta: em(0, y + 1, 0), sobTeto: em(6, y + 1, 6), tronco, folhas }
  },
  [Y],
)

await page.evaluate(
  ([y]) => {
    const rc = window.__roquecraft
    rc.setFlying(true)
    rc.teleport(0.5, y + 5, 9.5)
    rc.look(0, -0.15)
  },
  [Y],
)
await page.waitForTimeout(800)
await foto('1-arvore-da-muda.png')

const falhas = []
if (leitura.aberta !== 'oakLog') falhas.push(`a muda a céu aberto virou "${leitura.aberta}"`)
if (leitura.tronco < 4) falhas.push(`tronco curto demais: ${leitura.tronco} blocos`)
if (leitura.folhas < 10) falhas.push(`copa rala demais: ${leitura.folhas} folhas`)
if (leitura.sobTeto !== 'oakSapling') {
  falhas.push(`a muda sob o teto cresceu assim mesmo: virou "${leitura.sobTeto}"`)
}
if (erros.length) falhas.push(`erro de página: ${erros[0]}`)

console.log('')
console.log('muda — a floresta que se replanta')
console.log('')
console.log(`  a céu aberto       ${leitura.aberta}`)
console.log(`  sob teto de pedra  ${leitura.sobTeto}`)
console.log(`  árvore que nasceu  ${leitura.tronco} de tronco, ${leitura.folhas} de copa`)
console.log(`  relógio            ${relogio.tiques} tiques de jogo`)
console.log(
  `  foto               ${path.relative(process.cwd(), path.join(SAIDA, '1-arvore-da-muda.png'))}`,
)
console.log('')
if (falhas.length) {
  console.log('VERMELHO:')
  for (const f of falhas) console.log(`  ✗ ${f}`)
} else {
  console.log('VERDE: a muda vira árvore a céu aberto, e não arranca o teto de ninguém.')
}
console.log('')

await b.close()
fechar()
process.exit(falhas.length ? 1 : 0)
