//
// O SOM, MEDIDO NO JOGO RODANDO.
//
// O founder (2026-08-22): "tem também um grande problema com o som, mesmo
// parado o som de passo fica tocando e o pack de som está horrível... faça uma
// busca aprofundada na internet e busque um pack de áudio profissional".
//
// Duas coisas mudaram e as duas precisam de prova:
//
//  1. O passo parado. Era `landed: true` em todo frame — a gravidade empurra o
//     corpo contra o piso e a varredura barra sempre. Corrigido em `physics.js`
//     e coberto por `fisicaPasso.spec.js`; aqui o harness conta os disparos no
//     jogo real, com o jogador imóvel, que é o que ele descreveu.
//
//  2. O banco CC0. Amostra pode simplesmente não chegar (404, rede, decode
//     recusado) e aí o jogo cai na síntese sem avisar. "Soa ruim" e "o banco
//     não carregou" soam parecido pra quem ouve — aqui a diferença é número.
//
// A medição de nível é por renderização OFFLINE. Num navegador headless o sink
// de áudio é nulo: o contexto fica 'running', o tempo anda, e o grafo não
// renderiza um sample — o medidor ao vivo lê -Infinity mesmo com tudo certo.
//
// Uso: node scripts/qa-roquecraft-som.mjs [tag]   (exige dist/pwa)
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const DIST = path.resolve('dist/pwa')
const TAG = process.argv[2] || 'som'
const OUT = path.resolve('scripts/.qa-som')
fs.mkdirSync(OUT, { recursive: true })

const T = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.ogg': 'audio/ogg',
  '.md': 'text/markdown',
}
const pedidos = []
const server = http.createServer((req, res) => {
  const p = decodeURIComponent((req.url || '/').split('?')[0])
  let fp = path.join(DIST, p)
  let achou = true
  try {
    if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
      achou = false
      fp = shellDoApp(DIST)
    }
  } catch {
    achou = false
    fp = shellDoApp(DIST)
  }
  if (p.includes('/audio/')) pedidos.push({ p, achou })
  res.setHeader('Content-Type', T[path.extname(fp)] || 'application/octet-stream')
  fs.createReadStream(fp).pipe(res)
})
const SEED = `window.__ROS_E2E__ = { auth:{uid:'e2e-uid',email:'e2e@roqueos.test',emailVerified:true,displayName:'E2E',role:'user'}, googleDrive:{isConnected:false,files:[],user:{}}, googleMapsApiKey:'', roquecraftSeed: 20260819 }`

await new Promise((r) => server.listen(0, r))
const base = `http://localhost:${server.address().port}`
const browser = await chromium.launch({
  args: [
    '--use-gl=angle',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--autoplay-policy=no-user-gesture-required',
  ],
})
const ctx = await browser.newContext({
  viewport: { width: 1024, height: 640 },
  deviceScaleFactor: 1,
  serviceWorkers: 'block',
  locale: 'pt-BR',
})
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`))
await page.addInitScript(SEED)
await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => !!window.__rosStore, null, { timeout: 30000 })
await page.waitForTimeout(1200)
await page.evaluate(() => window.__rosStore.openWindow('roquecraft'))
await page.waitForFunction(() => window.__roquecraft?.state?.ready === true, null, {
  timeout: 90000,
})

// ── 1. O BANCO CARREGA? ───────────────────────────────────────────────────
const banco = await page.evaluate(async () => {
  const rc = window.__roquecraft
  rc.somInfo() // garante instância
  await rc.somCarregar()
  return { info: rc.somInfo(), banco: rc.somBanco() }
})

// ── 2. PASSO PARADO ───────────────────────────────────────────────────────
// Conta quantas vezes o jogo pede um passo com o jogador imóvel no chão. Antes
// do conserto eram ~60/s; o correto é 0 (ou 1, da aterrissagem inicial).
// ⚠️ Em terra SECA. A primeira volta mediu no (0,0), que nesta semente é
// oceano: o jogador estava nadando, o contador marcou `bracada: 6` e nenhum
// passo — e "zero passos" pareceria o conserto funcionando quando na verdade
// era o lugar errado.
const seco = await page.evaluate(async () => {
  const rc = window.__roquecraft
  rc.setTime(6000)
  rc.teleport(0, 110, 0)
  await rc.waitChunks(6)
  for (let raio = 8; raio <= 160; raio += 8)
    for (const [dx, dz] of [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
      [1, 1],
      [-1, -1],
      [1, -1],
      [-1, 1],
    ]) {
      const x = dx * raio
      const z = dz * raio
      if (rc.profundidadeAgua(x, z) > 0) continue
      const h = rc.surfaceAt(x, z)
      if (!Number.isFinite(h) || h < 64) continue
      // exige vizinhança seca e plana: andar tem que ser andar, não escalar
      const viz = [
        [6, 0],
        [-6, 0],
        [0, 6],
        [0, -6],
      ].map(([a, b]) => rc.surfaceAt(x + a, z + b))
      if (viz.some((v) => !Number.isFinite(v) || Math.abs(v - h) > 3)) continue
      if (
        [
          [6, 0],
          [-6, 0],
          [0, 6],
          [0, -6],
        ].some(([a, b]) => rc.profundidadeAgua(x + a, z + b) > 0)
      )
        continue
      return { x, z, h }
    }
  return null
})
if (!seco) {
  console.log(JSON.stringify({ erro: 'sem terra seca na semente' }))
  process.exit(1)
}

const parado = await page.evaluate(
  async ({ seco }) => {
    const rc = window.__roquecraft
    rc.teleport(seco.x + 0.5, seco.h + 1, seco.z + 0.5)
    await rc.waitChunks(4)
    rc.setFlying(false)
    rc.land()
    await new Promise((r) => setTimeout(r, 2500)) // assenta e absorve a aterrissagem

    // ⚠️ CONTAR PEDIDOS, não medir nível.
    //
    // A primeira versão lia `somPico()` e chamava de "passo". Leu 120 de 120
    // acima do piso e eu quase reportei isso como defeito — mas o que estava
    // soando era o LEITO DE AMBIENTE, que é exatamente o que deve soar com o
    // jogador parado. Nível de saída não separa passo de vento.
    rc.somZerarDisparos()
    await new Promise((r) => setTimeout(r, 3000))
    const d = rc.somBanco()?.disparos || {}
    return { janelaSegundos: 3, disparos: d, passos: d.step || 0, pos: rc.state.player }
  },
  { seco },
)

// Segunda janela: ANDANDO. Passo parado tem que ser 0 E passo andando > 0 —
// sozinho, o primeiro número também é satisfeito por um jogo mudo.
const andando = await page.evaluate(async () => {
  const rc = window.__roquecraft
  const antes = { ...rc.state.player }
  rc.somZerarDisparos()
  rc.press('forward', true)
  await new Promise((r) => setTimeout(r, 3000))
  rc.press('forward', false)
  const depois = { ...rc.state.player }
  const d = rc.somBanco()?.disparos || {}
  return {
    janelaSegundos: 3,
    passos: d.step || 0,
    andou: +Math.hypot(depois.x - antes.x, depois.z - antes.z).toFixed(1),
    disparos: d,
  }
})

// ── 3. NÍVEL DE CADA EFEITO, POR RENDERIZAÇÃO OFFLINE ─────────────────────
const niveis = await page.evaluate(async () => {
  const rc = window.__roquecraft
  const casos = [
    ['stone', 'dig'],
    ['stone', 'break'],
    ['glass', 'break'],
    ['wood', 'break'],
    ['grass', 'step'],
    ['sand', 'step'],
    ['snow', 'step'],
    ['wood', 'step'],
    ['gravel', 'step'],
    ['leaves', 'step'],
    ['dirt', 'step'],
    ['pedra', 'step'],
    ['grass', 'dig'],
    ['wood', 'dig'],
  ]
  const out = {}
  for (const [fam, acao] of casos) {
    // ⚠️ REPETIR. Cada disparo sorteia uma amostra do grupo e um pitch, e a
    // variação entre amostras do mesmo grupo chega a 9 dB. Uma medição só
    // descreve o sorteio, não o grupo — foi assim que "passo na neve" apareceu
    // 10 dB acima do resto numa volta e dentro da faixa na seguinte.
    const v = []
    for (let i = 0; i < 6; i++) {
      const d = await rc.somMedirOffline(fam, acao)
      if (typeof d === 'number') v.push(d)
    }
    if (!v.length) {
      out[`${acao}:${fam}`] = null
      continue
    }
    const media = v.reduce((a, b) => a + b, 0) / v.length
    out[`${acao}:${fam}`] = {
      media: +media.toFixed(1),
      min: Math.min(...v),
      max: Math.max(...v),
      n: v.length,
    }
  }
  return out
})

// ── 4. FILTRO DE SUBMERSO ─────────────────────────────────────────────────
const submerso = await page.evaluate(async () => {
  const rc = window.__roquecraft
  // ⚠️ O EMPUXO NÃO DEIXA O JOGADOR FICAR SUBMERSO.
  //
  // Duas voltas deste harness leram 20 kHz e concluíram "o filtro não
  // funciona". As duas estavam medindo tarde: a física do jogo é Arquimedes de
  // verdade e o corpo sobe até estabilizar com a cabeça FORA. Quando a primeira
  // amostra chegava, já não havia submersão pra medir. O sinal de que a leitura
  // estava errada e não o código estava ali o tempo todo — `corteMinimo` era
  // 888, ou seja o filtro CHEGOU lá, só não durou.
  //
  // Então o teste segura o jogador embaixo: reteleporta pro fundo a cada
  // amostra. Não é trapaça — é manter o estado que está sendo medido.
  let alvo = null
  for (let x = -140; x <= 140 && !alvo; x += 8)
    for (let z = -140; z <= 140; z += 8)
      if (rc.profundidadeAgua(x, z) >= 8) {
        alvo = { x, z }
        break
      }
  if (!alvo) return { erro: 'sem oceano fundo' }
  const leito = rc.surfaceAt(alvo.x, alvo.z)
  rc.setFlying(false)

  const amostras = []
  for (let i = 0; i < 30; i++) {
    rc.teleport(alvo.x + 0.5, leito + 1, alvo.z + 0.5) // segura no fundo
    await new Promise((r) => setTimeout(r, 60))
    // ⚠️ Perguntar ao JOGO, não recalcular. Eu vinha derivando "cabeça
    // submersa" de `agua()` (linha d'água contra y + 1,62) e ela discordava do
    // `headInWater` que a física devolve — o jogo dizia submerso, meu cálculo
    // dizia que não, e o relatório saía com 0 amostras submersas e o corte
    // em 888 ao mesmo tempo, uma contradição que era minha, não do código.
    amostras.push({ cabeca: !!rc.debug?.underwater, corte: rc.somBanco()?.corte })
  }
  const sub = amostras.filter((s) => s.cabeca)
  const media = (l) => (l.length ? Math.round(l.reduce((a, b) => a + b.corte, 0) / l.length) : null)

  // e agora a volta: em terra seca o corte tem que subir de novo
  const hs = rc.surfaceAt(8, -8)
  rc.teleport(8.5, (Number.isFinite(hs) ? hs : 70) + 1, -7.5)
  await new Promise((r) => setTimeout(r, 1800))

  return {
    alvo,
    amostrasSubmerso: sub.length,
    corteSubmerso: media(sub),
    corteMinimo: Math.min(...amostras.map((s) => s.corte)),
    corteAoVoltarProSeco: rc.somBanco()?.corte,
  }
})

// ── 5. LEITOS DE AMBIENTE ─────────────────────────────────────────────────
const ambiente = await page.evaluate(async () => {
  const rc = window.__roquecraft
  rc.somAmbiente({ 'amb.vento': 1, 'amb.passaros': 0.8, 'amb.ondas': 0.5 })
  await new Promise((r) => setTimeout(r, 600))
  return rc.somBanco()?.leitos || []
})

const faltando = pedidos.filter((x) => !x.achou)
const saida = {
  tag: TAG,
  erros: errors,
  banco,
  seco,
  parado,
  andando,
  niveis,
  submerso,
  ambiente,
  pedidosAudio: pedidos.length,
  arquivosAusentes: faltando.map((x) => x.p),
}
fs.writeFileSync(path.join(OUT, `report-${TAG}.json`), JSON.stringify(saida, null, 2))
console.log(
  JSON.stringify(
    {
      erros: errors.length,
      banco: banco.banco,
      arquivosAudioServidos: pedidos.length,
      arquivosAusentes: faltando.map((x) => x.p),
      terraSeca: seco,
      passoParado: parado.passos,
      passoAndando: andando.passos,
      andou: andando.andou,
      disparosParado: parado.disparos,
      niveis,
      submerso,
      ambiente,
    },
    null,
    2,
  ),
)
await browser.close()
server.close()
