//
// O CAULE QUE PARE — abóbora e melancia, o único cultivo que não se colhe.
//
// A planta madura não vira item: ela fica madura e passa a gerar o fruto numa
// célula VIZINHA, uma de cada vez. Quebrar o fruto não mata o caule, e é isso
// que faz a horta ser uma máquina em vez de um replantio.
//
// ⚠️ PROVA DE VIDA: a sonda mede as quatro coisas que podem estar erradas ao
// mesmo tempo — a semente sai do fruto, o caule cresce, o fruto NASCE ao lado
// (e não na célula do caule), e a melancia quebrada devolve fatias. Medir só a
// primeira daria verde para uma horta que nunca produz nada.
//
//   node scripts/qa-roquecraft-caule.mjs
//
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { servirDist } from './lib/servidor-do-dist.mjs'

const SAIDA = path.resolve('scripts/.qa-caule')
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
  rc.fill(-8, y - 2, -8, 8, y, 8, 'grassBlock')
  rc.fill(-8, y + 1, -8, 8, y + 8, 8, 'air')
  // Dois canteiros isolados, um pra cada caule, com terra em volta.
  rc.fill(-3, y, 0, -3, y, 0, 'farmland')
  rc.fill(3, y, 0, 3, y, 0, 'farmland')
  return y
})
await page.waitForTimeout(2600)

// ── 2. PLANTAR E CRESCER ────────────────────────────────────────────────────
const plantio = await page.evaluate(
  ([y]) => {
    const rc = window.__roquecraft
    const semear = (x, z, item) => {
      rc.setFlying(true)
      rc.teleport(x + 0.5, y + 1 + 2.4 - 1.62, z + 0.5)
      rc.look(0, -1.45)
      rc.equipar(item, 1)
      return rc.place()
    }
    return {
      abobora: semear(-3, 0, 'pumpkin_seeds'),
      melancia: semear(3, 0, 'melon_seeds'),
    }
  },
  [Y],
)
await page.waitForTimeout(600)
const brotos = await page.evaluate(
  ([y]) => {
    const rc = window.__roquecraft
    const em = (x, z) => rc.colunaEm(x, z, y + 1, y + 1)?.[0]?.bloco ?? 'nada'
    return { abobora: em(-3, 0), melancia: em(3, 0) }
  },
  [Y],
)

// ⚠️ O relógio da fila, e não `waitForTimeout`: o caule tem 25% de chance de
// avançar a cada 3 s e só 6% de frutificar. Esperar de verdade levaria muitos
// minutos e daria uma sonda que às vezes passa.
const relogio = await page.evaluate(() => window.__roquecraft.escoarFluidos(40000))
await page.waitForTimeout(1500)

const colheita = await page.evaluate(
  ([y]) => {
    const rc = window.__roquecraft
    const em = (x, z, yy = y + 1) => rc.colunaEm(x, z, yy, yy)?.[0]?.bloco ?? 'nada'
    const emVolta = (cx, cz, chave) =>
      [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].filter(([dx, dz]) => em(cx + dx, cz + dz) === chave).length
    return {
      cauleAbobora: em(-3, 0),
      cauleMelancia: em(3, 0),
      abóboras: emVolta(-3, 0, 'pumpkin'),
      melancias: emVolta(3, 0, 'melon'),
    }
  },
  [Y],
)

// ── 3. A MELANCIA DEVOLVE FATIAS ────────────────────────────────────────────
const fatias = await page.evaluate(
  ([y]) => {
    const rc = window.__roquecraft
    rc.setMode('survival')
    // ⚠️ SOMA DOS COUNTS, não número de entidades. Um drop de 4 fatias é UMA
    // entidade com `count: 4` — contar entidades daria "1 fatia" com o jogo
    // entregando quatro, e foi o que a primeira versão desta sonda reprovou.
    const antes = rc
      .dropsInfo()
      .filter((d) => d.item === 'melon_slice')
      .reduce((n, d) => n + d.count, 0)
    rc.fill(6, y + 1, 0, 6, y + 1, 0, 'melon')
    rc.setFlying(true)
    rc.teleport(6.5, y + 1 + 3.2 - 1.62, 0.5)
    rc.look(0, -1.5)
    const mirado = rc.miraEm()
    const quebrou = rc.breakNow()
    return { mirado: mirado?.chave ?? 'nada', quebrou, antes }
  },
  [Y],
)
await page.waitForTimeout(900)
const noChao = await page.evaluate(() =>
  window.__roquecraft
    .dropsInfo()
    .filter((d) => d.item === 'melon_slice')
    .reduce((n, d) => n + d.count, 0),
)

// ── 4. A CANA, QUE ERA ENFEITE DE MARGEM ────────────────────────────────────
//
// Ela nascia na beira do rio, não crescia, e o único uso que teria (papel para
// a estante) não existia — a estante era feita de couro.
await page.evaluate(
  ([y]) => {
    const rc = window.__roquecraft
    rc.setMode('creative')
    // Uma margem de verdade: areia com água encostada, e um pé de cana.
    rc.fill(-6, y, 4, -6, y, 4, 'sand')
    rc.fill(-5, y, 4, -5, y, 4, 'water')
    rc.fill(-6, y + 1, 4, -6, y + 1, 4, 'sugarCane')
    // E um pé longe da água, que não pode crescer.
    rc.fill(-6, y, -4, -6, y, -4, 'sand')
    rc.fill(-6, y + 1, -4, -6, y + 1, -4, 'sugarCane')
  },
  [Y],
)
await page.evaluate(() => window.__roquecraft.escoarFluidos(20000))
await page.waitForTimeout(1200)
const canaDepois = await page.evaluate(
  ([y]) => {
    const rc = window.__roquecraft
    const altura = (x, z) => {
      let n = 0
      for (let yy = y + 1; yy < y + 8; yy++) {
        if ((rc.colunaEm(x, z, yy, yy)?.[0]?.bloco ?? 'nada') === 'sugarCane') n++
      }
      return n
    }
    return { naMargem: altura(-6, 4), noSeco: altura(-6, -4) }
  },
  [Y],
)

await page.evaluate(
  ([y]) => {
    const rc = window.__roquecraft
    rc.setFlying(true)
    rc.teleport(0.5, y + 3.2, 6.5)
    rc.look(0, -0.35)
  },
  [Y],
)
await page.waitForTimeout(800)
await foto('1-horta-de-caule.png')

const falhas = []
if (!plantio.abobora || !plantio.melancia) falhas.push('uma das sementes não entrou no canteiro')
if (!String(brotos.abobora).startsWith('pumpkinStem')) {
  falhas.push(`semente de abóbora virou "${brotos.abobora}"`)
}
if (!String(brotos.melancia).startsWith('melonStem')) {
  falhas.push(`semente de melancia virou "${brotos.melancia}"`)
}
if (colheita.cauleAbobora !== 'pumpkinStem7') {
  falhas.push(`o caule de abóbora ficou em "${colheita.cauleAbobora}"`)
}
if (colheita.abóboras < 1) falhas.push('o caule maduro não deu abóbora nenhuma')
if (colheita.melancias < 1) falhas.push('o caule maduro não deu melancia nenhuma')
if (fatias.mirado !== 'melon') falhas.push(`a mira não pegou a melancia: ${fatias.mirado}`)
if (noChao - fatias.antes < 3)
  falhas.push(`quebrar a melancia deu ${noChao - fatias.antes} fatia(s)`)
if (canaDepois.naMargem < 2) falhas.push(`a cana na margem ficou com ${canaDepois.naMargem}`)
if (canaDepois.naMargem > 3) falhas.push(`a cana passou de 3: ${canaDepois.naMargem}`)
if (canaDepois.noSeco > 1) falhas.push(`a cana longe da água cresceu: ${canaDepois.noSeco}`)
if (erros.length) falhas.push(`erro de página: ${erros[0]}`)

console.log('')
console.log('caule — a horta que produz sozinha')
console.log('')
console.log(`  semente plantada   abóbora: ${brotos.abobora} · melancia: ${brotos.melancia}`)
console.log(`  caule maduro       ${colheita.cauleAbobora} / ${colheita.cauleMelancia}`)
console.log(
  `  frutos ao lado     ${colheita.abóboras} abóbora(s), ${colheita.melancias} melancia(s)`,
)
console.log(`  melancia quebrada  ${fatias.mirado} → ${noChao - fatias.antes} fatia(s)`)
console.log(`  relógio            ${relogio.tiques} tiques de jogo`)
console.log(
  `  cana               na margem: ${canaDepois.naMargem} · no seco: ${canaDepois.noSeco}`,
)
console.log(
  `  foto               ${path.relative(process.cwd(), path.join(SAIDA, '1-horta-de-caule.png'))}`,
)
console.log('')
if (falhas.length) {
  console.log('VERMELHO:')
  for (const f of falhas) console.log(`  ✗ ${f}`)
} else {
  console.log('VERDE: o caule cresce, dá fruto ao lado, e a melancia devolve fatias.')
}
console.log('')

await b.close()
fechar()
process.exit(falhas.length ? 1 : 0)
