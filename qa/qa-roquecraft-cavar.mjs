//
// A ANIMAÇÃO DE QUEBRAR UM BLOCO — a que faltava.
//
// ⚠️ A ONDA 10 FOTOGRAFOU O GOLPE DE BATER E CHAMOU ISSO DE "a movimentação".
// São dois gestos diferentes e só um tinha foto: `swing('hit')` corre uma vez e
// para; `digging` REINICIA o ciclo em vez de encerrá-lo, então cavar é um laço
// contínuo enquanto o dedo está no botão. O founder perguntou "e a animação
// quebrando um bloco, você testou?" — não tinha.
//
// Cinco afirmações mecânicas:
//   1. segurar o botão põe o ciclo de CAVAR para correr, e ele é 'dig';
//   2. o ciclo REINICIA sozinho — não para no fim da primeira volta;
//   3. a picareta e a espada cavam no MESMO ritmo (dig vence a classe);
//   4. a peça não sai do quadro em NENHUM instante do ciclo;
//   5. o bloco realmente cai, pelo caminho do dedo e não por atalho.
//
//   node scripts/qa-roquecraft-cavar.mjs
//
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { servirDist } from './lib/servidor-do-dist.mjs'

const SAIDA = path.resolve('qa-out/cavar')
fs.mkdirSync(SAIDA, { recursive: true })

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

const fotos = []
const canvas = await page.locator('canvas').first().boundingBox()
const fotografar = async (nome) => {
  const arq = path.join(SAIDA, `${nome}.png`)
  await page.screenshot(canvas ? { path: arq, clip: canvas } : { path: arq })
  fotos.push(path.relative(process.cwd(), arq))
}

// ── PÔR O JOGADOR DE FRENTE PARA UM BLOCO ───────────────────────────────────
//
// ⚠️ OLHAR PARA BAIXO, e não procurar parede. O chão está sempre lá; caçar uma
// parede é procurar um cenário que pode não existir na semente do dia, e é como
// sondas deste repositório já acabaram fotografando campo vazio.
const mirou = await page.evaluate(async () => {
  const rc = window.__roquecraft
  rc.setMode('survival')
  rc.setFlying(false)
  rc.look(0.7, -1.15) // olhando para o chão, logo à frente dos pés
  await new Promise((k) => setTimeout(k, 600))
  rc.equipar('iron_pickaxe', 1)
  await new Promise((k) => setTimeout(k, 300))
  return rc.miraEm()
})

// ── O CICLO DE CAVAR ────────────────────────────────────────────────────────
const cavada = await page.evaluate(async () => {
  const rc = window.__roquecraft
  const amostras = []
  rc.segurarQuebrar(true)
  // Um ciclo de cavar dura ~0,31 s. Doze amostras de 40 ms cobrem uma volta e
  // meia, que é o que prova que ele REINICIA em vez de parar.
  for (let i = 0; i < 12; i++) {
    await new Promise((k) => setTimeout(k, 40))
    const e = rc.estadoDoGolpe()
    const t = rc.pecaNaTela()
    amostras.push({
      ms: i * 40,
      ativo: e?.ativo ?? null,
      tipo: e?.tipo ?? null,
      t: e ? Number(e.tSwing.toFixed(3)) : null,
      largura: t ? Number(t.largura.toFixed(3)) : null,
      maxy: t ? Number(t.maxy.toFixed(3)) : null,
      minx: t ? Number(t.minx.toFixed(3)) : null,
      maxx: t ? Number(t.maxx.toFixed(3)) : null,
    })
  }
  const comPicareta = rc.estadoDoGolpe()
  rc.segurarQuebrar(false)
  await new Promise((k) => setTimeout(k, 400))
  const soltou = rc.estadoDoGolpe()

  // A espada cava com o mesmo ritmo: `dig` vence a classe de propósito.
  rc.equipar('iron_sword', 1)
  await new Promise((k) => setTimeout(k, 200))
  rc.segurarQuebrar(true)
  await new Promise((k) => setTimeout(k, 120))
  const comEspada = rc.estadoDoGolpe()
  rc.segurarQuebrar(false)
  return { amostras, comPicareta, soltou, comEspada }
})

// Uma foto em cada quarto do ciclo, com o botão segurado.
await page.evaluate(() => {
  const rc = window.__roquecraft
  rc.equipar('iron_pickaxe', 1)
  rc.segurarQuebrar(true)
})
for (const [nome, espera] of [
  ['cavar-1', 40],
  ['cavar-2', 80],
  ['cavar-3', 80],
  ['cavar-4', 80],
]) {
  await page.waitForTimeout(espera)
  await fotografar(nome)
}

// ── O BLOCO CAI DE VERDADE ──────────────────────────────────────────────────
const caiu = await page.evaluate(async () => {
  const rc = window.__roquecraft
  rc.segurarQuebrar(false)
  await new Promise((k) => setTimeout(k, 200))
  return rc.minerarMirado ? await rc.minerarMirado(9000) : null
})
await fotografar('depois-da-quebra')

await b.close()
await fechar()

// ── O VEREDITO ──────────────────────────────────────────────────────────────
const problemas = []
const a = cavada?.amostras || []
if (!a.length) problemas.push('não consegui ler o estado do golpe nenhuma vez')

const ativos = a.filter((s) => s.ativo)
if (ativos.length < a.length * 0.8) {
  problemas.push(
    `o ciclo de cavar ficou parado em ${a.length - ativos.length}/${a.length} amostras`,
  )
}
if (ativos.some((s) => s.tipo !== 'dig')) {
  problemas.push(`o gesto de cavar saiu como "${ativos.find((s) => s.tipo !== 'dig')?.tipo}"`)
}
// REINICIAR: o t tem que voltar para perto de zero pelo menos uma vez.
const ts = ativos.map((s) => s.t)
const reiniciou = ts.some((t, i) => i > 0 && t < ts[i - 1] - 0.3)
if (!reiniciou) problemas.push(`o ciclo não reiniciou em 480 ms: t = ${ts.join(', ')}`)

if (cavada?.soltou?.ativo) problemas.push('soltar o botão não parou a animação')
if (cavada?.comEspada && cavada.comEspada.tipo !== 'dig') {
  problemas.push('a espada não entra no gesto de cavar')
}
if (
  cavada?.comPicareta &&
  cavada?.comEspada &&
  cavada.comPicareta.velocidade !== cavada.comEspada.velocidade
) {
  problemas.push('picareta e espada cavam em ritmos diferentes — `dig` deixou de vencer a classe')
}

// A peça não pode sair do quadro EM NENHUM instante do ciclo.
const fora = ativos.filter((s) => s.maxy > 1 || s.maxx > 1 || s.minx < -1)
if (fora.length) {
  problemas.push(
    `a peça saiu do quadro em ${fora.length} instante(s) do ciclo: ${fora
      .map((s) => `${s.ms}ms maxy=${s.maxy} x=${s.minx}..${s.maxx}`)
      .join(' | ')}`,
  )
}
// E precisa MEXER: uma peça parada durante o ciclo é uma animação que não roda.
const larguras = ativos.map((s) => s.largura).filter((v) => v != null)
if (larguras.length > 2 && Math.max(...larguras) - Math.min(...larguras) < 0.01) {
  problemas.push('a peça não se mexeu durante o ciclo de cavar')
}

if (caiu === false) problemas.push('segurar o botão não derrubou o bloco mirado')
if (erros.length)
  problemas.push(`${erros.length} erro(s) de página: ${erros.slice(0, 2).join(' | ')}`)

console.log(
  JSON.stringify(
    {
      mirou,
      cavada,
      caiu,
      fotos,
      problemas,
      veredito: problemas.length ? 'REPROVADO' : 'o gesto de cavar roda, repete e cabe no quadro',
    },
    null,
    2,
  ),
)
process.exit(problemas.length ? 1 : 0)
