//
// O SOM NO ARRANQUE — "tem vezes que o jogo começa mudo" (founder, 13/09/2026).
//
// ⚠️ A PERGUNTA NÃO É "o áudio funciona", É "QUANDO o gesto chega".
//
// Navegador nenhum toca áudio antes de um gesto do usuário. O jogo registra
// ouvintes de `pointerdown`/`keydown`/`touchstart` com `once: true` para
// destravar no primeiro gesto — mas eles só entram no ar DEPOIS do `boot()`,
// que é assíncrono e demora segundos (mundo, texturas, motor).
//
// O jogador que clica ANTES do boot terminar gasta o gesto num momento em que
// ninguém está ouvindo. Se ele não der outro gesto depois, joga mudo. Isso é
// intermitente por natureza — depende da máquina, do cache e da pressa de quem
// está jogando —, que é exatamente a cara de "às vezes".
//
// Esta sonda mede os DOIS caminhos no mesmo mundo: clique cedo (durante o boot)
// e clique tarde (depois do ready), e pergunta ao motor se o contexto nasceu.
//
//   node scripts/qa-roquecraft-som-arranque.mjs
//
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { servirDist } from './lib/servidor-do-dist.mjs'

const SAIDA = path.resolve('scripts/.qa-som-arranque')
fs.mkdirSync(SAIDA, { recursive: true })
const { base, fechar } = await servirDist('dist/pwa')

const b = await chromium.launch({
  args: [
    '--use-gl=angle',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    // ⚠️ SEM ISTO O TESTE NÃO VALE NADA: por padrão o Chromium headless libera
    // áudio sem gesto, e o defeito — que é sobre o gesto — some.
    '--autoplay-policy=user-gesture-required',
  ],
})

async function abrir({ gestoAntesDeAbrir = false } = {}) {
  const ctx = await b.newContext({
    viewport: { width: 900, height: 820 },
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
  await page.waitForTimeout(600)
  // O gesto que ABRE o jogo — o mesmo toque no ícone que o jogador dá.
  if (gestoAntesDeAbrir) await page.mouse.click(450, 400)
  await page.evaluate(() => window.__rosStore.openWindow('roquecraft'))
  return { ctx, page, erros }
}

const esperarPronto = (page) =>
  page.waitForFunction(() => window.__roquecraft?.state?.ready === true, null, { timeout: 120000 })

// ── 1. O JOGADOR QUE ABRE O JOGO PELO ÍCONE E NÃO CLICA MAIS ────────────────
//
// ⚠️ ESTE É O CAMINHO REAL DO DEFEITO, e o primeiro teste que escrevi não o
// reproduzia: eu clicava DEPOIS de mandar abrir o jogo, e esse clique tardio
// destravava o som — verde pelo motivo errado.
//
// Na vida, o gesto é o clique QUE ABRE o jogo: o jogador toca no ícone, o
// mundo carrega por segundos, e ele começa a jogar com o mouse capturado, sem
// nunca mais dar um `pointerdown` "novo". Se os ouvintes de destrave só entram
// no ar depois do boot, esse gesto foi gasto com ninguém ouvindo.
const cedo = await abrir({ gestoAntesDeAbrir: true })
await esperarPronto(cedo.page)
await cedo.page.waitForTimeout(1800)
const somCedo = await cedo.page.evaluate(() => ({
  ...window.__roquecraft.somInfo(),
  banco: window.__roquecraft.somBanco(),
}))
await cedo.ctx.close()

// ── 2. O JOGADOR PACIENTE: espera o mundo e só então clica ──────────────────
const tarde = await abrir({})
await esperarPronto(tarde.page)
await tarde.page.waitForTimeout(600)
await tarde.page.mouse.click(450, 400)
await tarde.page.waitForTimeout(1500)
const somTarde = await tarde.page.evaluate(() => ({
  ...window.__roquecraft.somInfo(),
  banco: window.__roquecraft.somBanco(),
}))
await tarde.ctx.close()

// ── 3. O JOGO FAZ SOM NO PRIMEIRO CLIQUE, ou só depois que o banco chega? ───
//
// O código promete: "enquanto o banco não chega, cada efeito cai na síntese —
// o jogo faz som desde o primeiro clique". Isso nunca foi medido. A janela
// entre o mundo pronto e os 87 arquivos baixados é justamente quando o jogador
// dá a primeira machadada.
const terceiro = await abrir({})
await esperarPronto(terceiro.page)
const logo = await terceiro.page.evaluate(async () => {
  const rc = window.__roquecraft
  const dorme = (ms) => new Promise((k) => setTimeout(k, ms))
  rc.setMode('creative')
  const y = Math.round(rc.surfaceAt(0, 0) ?? 66) + 6
  rc.setFlying(true)
  rc.teleport(0.5, y, 0.5)
  rc.fill(-2, y - 2, -2, 2, y - 2, 2, 'stone')
  await dorme(600)
  const banco = rc.somBanco()
  rc.somZerarDisparos?.()
  // Mira no chão e quebra: o caminho de som do jogo, não uma chamada de API.
  rc.teleport(0.5, y - 2 + 1 + 3.2 - 1.62, 0.5)
  rc.look(0, -1.5)
  rc.breakNow()
  await dorme(120)
  const pico = rc.somPico()
  return { banco, pico }
})
await terceiro.page.waitForTimeout(6000)
const depois = await terceiro.page.evaluate(async () => {
  const rc = window.__roquecraft
  const dorme = (ms) => new Promise((k) => setTimeout(k, ms))
  // ⚠️ REPOR O BLOCO ANTES DE QUEBRAR DE NOVO. A primeira versão desta sonda
  // mediu -Infinity aqui e acusou o jogo: o bloco já tinha sido quebrado no
  // teste anterior, e `breakNow` não tinha o que quebrar. Falso vermelho.
  const y = Math.round(rc.surfaceAt(0, 0) ?? 66) + 6
  rc.fill(0, y - 2, 0, 0, y - 2, 0, 'stone')
  await dorme(500)
  rc.teleport(0.5, y - 2 + 1 + 3.2 - 1.62, 0.5)
  rc.look(0, -1.5)
  const mirado = rc.miraEm()
  rc.breakNow()
  await dorme(120)
  return { banco: rc.somBanco(), pico: rc.somPico(), mirado: mirado?.chave ?? 'nada' }
})
await terceiro.ctx.close()

// ⚠️ "VIVO" NÃO É SÓ O CONTEXTO. A primeira versão desta sonda cobrava
// `estado === 'running'` e ficava VERDE com o defeito inteiro presente: o
// contexto subia e o banco ficava em zero, o que na prática é o jogo mudo. O
// que prova som é o BANCO carregado, a TRILHA no ar e o pico dentro da régua.
const vivo = (s) => !!s?.temCtx && s.estado === 'running' && (s.banco?.amostras ?? 0) > 10

const falhas = []
if (!vivo(somTarde))
  falhas.push(`clicando DEPOIS do boot o som não subiu: ${JSON.stringify(somTarde)}`)
if (!vivo(somCedo)) {
  falhas.push(
    `o gesto que ABRIU o jogo não destravou o som: ${JSON.stringify(somCedo)} — ` +
      'é o "às vezes começa mudo"',
  )
}
if (cedo.erros.length) falhas.push(`erro de página (cedo): ${cedo.erros[0]}`)
if (logo.banco?.falha) falhas.push(`o banco de amostras falhou: ${logo.banco.falha}`)
if ((somCedo.banco?.musica?.acervo ?? 0) < 1) falhas.push('sem gesto novo, a trilha não carrega')
if ((logo.banco?.amostras ?? 0) < 10) {
  falhas.push(`o banco não desceu junto com o mundo: ${logo.banco?.amostras} amostras`)
}
// A régua é do próprio `audio.js`: efeito de ação vive entre −12 e −6 dBFS, e
// abaixo de −25 some debaixo de qualquer ambiente.
if (!(logo.pico > -25)) falhas.push(`o efeito saiu inaudível: ${logo.pico} dBFS (régua: > −25)`)
// ⚠️ O PICO É A ÚNICA PROVA DE QUE SAIU SOM. `disparos` conta intenção; o
// medidor conta o que passou pelo master.
if (!(logo.pico > -60)) {
  falhas.push(`quebrar bloco logo após o mundo pronto não fez som: pico ${logo.pico} dBFS`)
}
if (!(depois.pico > -60)) {
  falhas.push(`com o banco carregado, quebrar bloco não fez som: pico ${depois.pico} dBFS`)
}

console.log('')
console.log('som no arranque — o gesto chega antes ou depois do mundo?')
console.log('')
console.log(
  `  gesto ANTES do boot     ctx=${somCedo.estado} banco=${somCedo.banco?.amostras} musica=${somCedo.banco?.musica?.acervo}`,
)
console.log(
  `  clique DEPOIS do boot   ctx=${somTarde.estado} banco=${somTarde.banco?.amostras} musica=${somTarde.banco?.musica?.acervo}`,
)
console.log(`  1º clique (banco ${logo.banco?.amostras ?? '?'} amostras)   pico ${logo.pico} dBFS`)
console.log(
  `  6 s depois (banco ${depois.banco?.amostras ?? '?'} amostras)  pico ${depois.pico} dBFS (mira: ${depois.mirado})`,
)
console.log(`  banco: ${JSON.stringify(depois.banco)}`)
console.log('')
if (falhas.length) {
  console.log('VERMELHO:')
  for (const f of falhas) console.log(`  ✗ ${f}`)
} else {
  console.log('VERDE: o som sobe nos dois caminhos — o gesto não se perde.')
}
console.log('')

await b.close()
fechar()
process.exit(falhas.length ? 1 : 0)
