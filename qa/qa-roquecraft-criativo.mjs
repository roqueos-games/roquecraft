//
// REGER O MUNDO — o painel de criativo, com o jogo rodando.
//
// ⚠️ A PERGUNTA NÃO É "O PAINEL ABRE". É se o botão CHEGA no mundo. Este
// repositório já teve 38 asserções verdes sobre código que o jogo nunca
// importou, e já teve uma sonda que deu dois tiques verdes para uma tela preta.
// Então cada afirmação aqui compara o ESTADO DO MUNDO antes e depois de mexer
// no controle — a hora que o jogo diz, o tick andando ou parado, a chuva que o
// clima reporta — e não a existência do componente.
//
// Seis afirmações:
//   1. no criativo o K abre; em sobrevivência ele NÃO abre (e avisa);
//   2. escolher a hora muda o relógio do JOGO, não só o controle;
//   3. o cadeado PARA o tick — medido deixando o jogo correr;
//   4. destravar volta a andar;
//   5. a chuva forçada chega no clima do jogo, e soltar devolve ao mundo;
//   6. o painel some quando o modo vira sobrevivência.
//
//   node scripts/qa-roquecraft-criativo.mjs
//
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { servirDist } from './lib/servidor-do-dist.mjs'

const SAIDA = path.resolve('qa-out/criativo')
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
await page.evaluate(async () => {
  await window.__roquecraft.stage({ height: 8, radius: 4, wait: 1500 })
})

const fotografar = async (nome) => {
  const cv = await page.locator('canvas').first().boundingBox()
  const arq = path.join(SAIDA, `${nome}.png`)
  await page.screenshot(cv ? { path: arq, clip: cv } : { path: arq })
  return path.relative(process.cwd(), arq)
}

const v = []
const ok = (c, t) => {
  v.push(`${c ? '✅' : '❌'} ${t}`)
  return c
}
let bom = true

// ── 1. SÓ NO CRIATIVO ───────────────────────────────────────────────────────
const emSobrevivencia = await page.evaluate(async () => {
  const rc = window.__roquecraft
  rc.setMode('survival')
  await new Promise((k) => setTimeout(k, 400))
  rc.abrirCriativo()
  await new Promise((k) => setTimeout(k, 300))
  return { modo: rc.state.mode, aberto: rc.criativoAberto() }
})
bom =
  ok(
    emSobrevivencia.aberto === false,
    `em ${emSobrevivencia.modo} o painel NÃO abre (aberto: ${emSobrevivencia.aberto})`,
  ) && bom

const noCriativo = await page.evaluate(async () => {
  const rc = window.__roquecraft
  rc.setMode('creative')
  await new Promise((k) => setTimeout(k, 400))
  rc.abrirCriativo()
  await new Promise((k) => setTimeout(k, 400))
  return { modo: rc.state.mode, aberto: rc.criativoAberto() }
})
bom = ok(noCriativo.aberto === true, `no criativo o painel abre`) && bom
const fotoPainel = noCriativo.aberto ? await fotografar('1-painel-aberto') : null

// ── 2. A HORA CHEGA NO MUNDO ────────────────────────────────────────────────
const hora = await page.evaluate(async () => {
  const antes = window.__roquecraft.state.ticks
  const el = document.querySelector('[data-test="rc-cri-meiaNoite"]')
  if (!el) return { erro: 'botão de meia-noite não está na tela' }
  el.click()
  await new Promise((k) => setTimeout(k, 500))
  return { antes, depois: window.__roquecraft.state.ticks }
})
bom =
  ok(
    !hora.erro && Math.abs(hora.depois - 18000) < 400,
    `o botão de meia-noite levou o relógio do JOGO de ${hora.antes} para ${hora.depois}`,
  ) && bom
const fotoNoite = hora.erro ? null : await fotografar('2-meia-noite')

// ── 3 e 4. O CADEADO PARA O TICK ────────────────────────────────────────────
const cadeado = await page.evaluate(async () => {
  const rc = window.__roquecraft
  const caixa = document.querySelector('[data-test="rc-cri-travar"]')
  if (!caixa) return { erro: 'cadeado não está na tela' }
  caixa.click()
  await new Promise((k) => setTimeout(k, 200))
  const travado = rc.relogioTravado()
  const t0 = rc.state.ticks
  // 2,5 s de jogo correndo: solto, isto move ~50 ticks (20 ticks/s).
  await new Promise((k) => setTimeout(k, 2500))
  const t1 = rc.state.ticks
  caixa.click()
  await new Promise((k) => setTimeout(k, 200))
  const t2 = rc.state.ticks
  await new Promise((k) => setTimeout(k, 2500))
  const t3 = rc.state.ticks
  return { travado, parado: Math.abs(t1 - t0), andou: Math.abs(t3 - t2) }
})
bom = ok(!cadeado.erro && cadeado.travado === true, `o cadeado ligou`) && bom
bom =
  ok(
    !cadeado.erro && cadeado.parado === 0,
    `travado, o relógio andou ${cadeado.parado} ticks em 2,5 s`,
  ) && bom
bom =
  ok(
    !cadeado.erro && cadeado.andou > 20,
    `destravado, ele voltou a andar: ${cadeado.andou} ticks em 2,5 s`,
  ) && bom

// ── 5. A CHUVA CHEGA, E SOLTAR DEVOLVE ──────────────────────────────────────
// ⚠️ O CLIMA MUDOU DE ENDEREÇO NA ONDA 2 DO GOAL 23: virou aba, e a aba
// escondida sai do DOM. A sonda passa a CLICAR na aba antes, que é o que o
// jogador faz — e é justamente por isso que ela é sonda: um teste de unidade
// com o painel montado na mão não teria notado a mudança de caminho.
const chuva = await page.evaluate(async () => {
  const rc = window.__roquecraft
  const aba = document.querySelector('[data-test="rc-cri-aba-clima"]')
  if (!aba) return { erro: 'a aba do clima não está na tela' }
  aba.click()
  await new Promise((k) => setTimeout(k, 300))
  const range = document.querySelector('[data-test="rc-cri-chuva"]')
  if (!range) return { erro: 'controle de chuva não está na tela' }
  const setar = (v) => {
    const proto = Object.getPrototypeOf(range)
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(range, String(v))
    range.dispatchEvent(new Event('input', { bubbles: true }))
  }
  setar(0.9)
  await new Promise((k) => setTimeout(k, 700))
  const forcado = rc.climaQA({}).forcado
  const noJogo = rc.climaQA({}).chuva
  const soltar = document.querySelector('[data-test="rc-cri-soltar"]')
  soltar.click()
  await new Promise((k) => setTimeout(k, 700))
  return { forcado, noJogo, depoisDeSoltar: rc.climaQA({}).forcado }
})
bom =
  ok(
    !chuva.erro && chuva.forcado > 0.85,
    `a chuva forçada chegou no clima do jogo: forcado ${chuva.forcado}, na tela ${chuva.noJogo}`,
  ) && bom
bom =
  ok(
    !chuva.erro && chuva.depoisDeSoltar === null,
    `soltar devolveu o clima ao mundo (forcado: ${chuva.depoisDeSoltar})`,
  ) && bom

// ── 6. TROCAR DE MODO FECHA O PAINEL ────────────────────────────────────────
const fechou = await page.evaluate(async () => {
  const rc = window.__roquecraft
  rc.setMode('survival')
  await new Promise((k) => setTimeout(k, 500))
  return rc.criativoAberto()
})
bom = ok(fechou === false, `virar sobrevivência fecha o painel (aberto: ${fechou})`) && bom
bom = ok(erros.length === 0, `sem erro de página (${erros.length})`) && bom

console.log(
  JSON.stringify(
    { veredito: v, hora, cadeado, chuva, fotos: [fotoPainel, fotoNoite].filter(Boolean), erros },
    null,
    2,
  ),
)
await ctx.close()
await b.close()
fechar()
process.exit(bom ? 0 : 1)
