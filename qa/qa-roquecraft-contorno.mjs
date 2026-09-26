//
// O CONTORNO CLARO NA BORDA DA SOMBRA — quem é o culpado.
//
// Queixa do founder, com print do iPhone: "olha esse contorno claro antes da
// sombra, isso acaba com a aparência da sombra". No print há uma linha mais
// clara que o chão iluminado, colada na borda de cada sombra.
//
// ⚠️ ISSO NÃO SE DIAGNOSTICA OLHANDO. São suspeitos legítimos, todos capazes de
// produzir exatamente essa linha, e cada um pediria uma correção diferente:
//   · bloom      — espalha o claro pra dentro do escuro na borda de contraste;
//   · fxaa       — antialias trabalha justamente onde há degrau de luminância;
//   · ssao       — halo é artefato conhecido de oclusão em espaço de tela;
//   · god rays   — a marcha radial acumula o que já é claro;
//   · a sombra   — `normalBias` empurra a amostra pela normal e pode deixar uma
//                  fresta iluminada colada na silhueta.
//
// Então a sonda MEDE e BISSECA. Ela define contorno como OVERSHOOT: numa linha
// que atravessa a borda, o pico do lado claro tem que ficar acima do platô
// iluminado longe da borda. Sem overshoot não há contorno, por mais que a foto
// pareça ter. Depois desliga um passe de cada vez e mede de novo — quem some
// com o overshoot é o culpado.
//
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const OUT = path.resolve('scripts/.qa-contorno')
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })

const DIST = path.resolve('dist/pwa')
const SEMENTE = Number(process.argv[2] || 942457)
const TICK = 2300 // sol a 34,5°: sombra longa e chão ainda bem iluminado

const T = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
}
const servidor = http.createServer((q, r) => {
  const p = decodeURIComponent((q.url || '/').split('?')[0])
  let f = path.join(DIST, p)
  try {
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = shellDoApp(DIST)
  } catch {
    f = shellDoApp(DIST)
  }
  r.setHeader('Content-Type', T[path.extname(f)] || 'application/octet-stream')
  fs.createReadStream(f).pipe(r)
})
await new Promise((r) => servidor.listen(0, r))
const base = `http://localhost:${servidor.address().port}`

const erros = []
const b = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const ctx = await b.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
  serviceWorkers: 'block',
  locale: 'pt-BR',
})
const page = await ctx.newPage()
page.on('pageerror', (e) => erros.push(String(e.message).slice(0, 160)))
await page.addInitScript(
  `window.__ROS_E2E__={auth:{uid:'e2e',email:'e@e.t',emailVerified:true,displayName:'E',role:'user'},googleDrive:{isConnected:false,files:[],user:{}},googleMapsApiKey:'',roquecraftSeed:${SEMENTE}}`,
)
await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => !!window.__rosStore, null, { timeout: 30000 })
await page.waitForTimeout(900)
await page.evaluate(() => window.__rosStore.openWindow('roquecraft'))
await page.waitForFunction(() => window.__roquecraft?.state?.ready === true, null, {
  timeout: 120000,
})
await page.evaluate(async () => {
  window.__roquecraft.setQuality('ultra')
  await new Promise((r) => setTimeout(r, 2500))
  window.__rosStore?.maximizeWindow?.('roquecraft')
  await new Promise((r) => setTimeout(r, 900))
})
await page.addStyleTag({ content: '.ros-roquecraft__play { display: none !important }' })
await page.waitForTimeout(500)

const chegada = await page.evaluate(async (tick) => {
  const rc = window.__roquecraft
  if (!rc.gotoBiome('desert')) return { erro: 'gotoBiome(desert) não achou o bioma' }
  await rc.waitChunks(6)
  await new Promise((k) => setTimeout(k, 2400))
  rc.setTime(tick)
  rc.setFx({ hand: false })
  // Mira vinda do SOL e pitch DESCOBERTO — a mesma disciplina da sonda do
  // lado da sombra, pelo mesmo motivo: olhando pro lado oposto, a sombra cai
  // atrás do bloco e não há borda nenhuma pra medir.
  const ang = ((tick % 24000) / 24000) * Math.PI * 2
  const sol = { x: Math.cos(ang) * 0.94, y: Math.sin(ang), z: Math.cos(ang) * 0.34 }
  const yaw = Math.atan2(sol.x, -sol.z)
  const quadro = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  const p = rc.state.player
  const chao = rc.debug?.groundBelow ?? Math.floor(p.y) - 2
  const alvo = { x: p.x + Math.sin(yaw) * 8, y: chao + 1, z: p.z - Math.cos(yaw) * 8 }
  let melhor = null
  for (let pit = -0.7; pit <= 0.7001; pit += 0.05) {
    rc.look(yaw, pit)
    await quadro()
    const s = rc.projetar(alvo.x, alvo.y, alvo.z)
    if (!s || !s.frente) continue
    const err = Math.abs(s.v - 0.62) + Math.abs(s.u - 0.5)
    if (!melhor || err < melhor.err) melhor = { pit, err }
  }
  if (!melhor) return { erro: 'nenhum pitch pôs o chão em tela' }
  rc.look(yaw, melhor.pit)
  await new Promise((k) => setTimeout(k, 1400))
  return { x: Math.round(p.x), z: Math.round(p.z), bioma: rc.state.biome, pitch: melhor.pit }
}, TICK)
if (chegada.erro) {
  console.log(JSON.stringify({ erro: chegada.erro, erros }))
  await ctx.close()
  await b.close()
  servidor.close()
  process.exit(1)
}

// ── A régua do contorno ──────────────────────────────────────────────────────
//
// Em cada linha do recorte, acha-se o degrau claro→escuro mais forte. Do lado
// CLARO comparam-se duas coisas: o pico colado na borda e o platô longe dela.
// Contorno = pico − platô. Se a luminância só CAI na direção da sombra, o
// overshoot é zero ou negativo e não há contorno, por mais que o olho jure que
// viu um.
const LUMA = (p, x, y) => {
  const i = (p.width * y + x) << 2
  return 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2]
}

// Só o chão: fora daqui entram céu, HUD e a linha das árvores, e cada um deles
// tem degrau de luminância que não é borda de sombra nenhuma.
const RECORTE = { x0: 120, x1: 1160, y0: 400, y1: 600 }
const QUEDA_MINIMA = 14 // degrau em níveis de luma pra valer como borda
const PLATO = [14, 34] // distância, em pixels, onde o lado claro já é platô

function medirContorno(buf, nome) {
  const p = PNG.sync.read(buf)
  const marcado = new PNG({ width: p.width, height: p.height })
  p.data.copy(marcado.data)
  const amostras = []
  for (let y = RECORTE.y0; y < RECORTE.y1; y += 2) {
    // O degrau mais forte da linha, medido sobre 3 px pra não confundir ruído
    // de textura com borda.
    let bordaX = -1
    let queda = 0
    for (let x = RECORTE.x0 + 40; x < RECORTE.x1 - 40; x++) {
      const d = LUMA(p, x - 2, y) - LUMA(p, x + 2, y)
      if (d > queda) {
        queda = d
        bordaX = x
      }
    }
    if (bordaX < 0 || queda < QUEDA_MINIMA) continue
    // Pico do lado claro, nos 6 px colados na borda.
    let pico = -Infinity
    for (let k = 1; k <= 6; k++) pico = Math.max(pico, LUMA(p, bordaX - k, y))
    // Platô: a mediana do lado claro, longe o bastante pra não ter contorno.
    const longe = []
    for (let k = PLATO[0]; k <= PLATO[1]; k++) longe.push(LUMA(p, bordaX - k, y))
    longe.sort((a, c) => a - c)
    const plato = longe[longe.length >> 1]
    amostras.push({ y, bordaX, queda, overshoot: pico - plato })
    // Marca a borda achada em vermelho: sonda que não mostra ONDE mediu é
    // sonda que pode ter medido a copa da árvore e chamado de sombra.
    const i = (p.width * y + bordaX) << 2
    marcado.data[i] = 255
    marcado.data[i + 1] = 0
    marcado.data[i + 2] = 0
  }
  if (nome) fs.writeFileSync(path.join(OUT, `${nome}-bordas.png`), PNG.sync.write(marcado))
  if (amostras.length < 8) return { erro: `só ${amostras.length} bordas de sombra no recorte` }
  const over = amostras.map((a) => a.overshoot).sort((a, c) => a - c)
  return {
    bordas: amostras.length,
    overshootMediano: Number(over[over.length >> 1].toFixed(2)),
    overshootP90: Number(over[Math.floor(over.length * 0.9)].toFixed(2)),
    quedaMediana: Number(
      amostras
        .map((a) => a.queda)
        .sort((a, c) => a - c)
        [amostras.length >> 1].toFixed(2),
    ),
  }
}

async function medir(nome, fx) {
  await page.evaluate(async (fx) => {
    window.__roquecraft.setFx(fx)
    await new Promise((r) => setTimeout(r, 1400))
  }, fx)
  const buf = await page.screenshot()
  fs.writeFileSync(path.join(OUT, `${nome}.png`), buf)
  return { nome, fx, ...medirContorno(buf, nome) }
}

// ── A bisseção ───────────────────────────────────────────────────────────────
const TUDO = { hand: false, bloom: true, fxaa: true, ssao: true, godRays: true }
const medidas = []
medidas.push(await medir('tudo-ligado', TUDO))
medidas.push(await medir('sem-bloom', { ...TUDO, bloom: false }))
medidas.push(await medir('sem-fxaa', { ...TUDO, fxaa: false }))
medidas.push(await medir('sem-ssao', { ...TUDO, ssao: false }))
medidas.push(await medir('sem-godrays', { ...TUDO, godRays: false }))
medidas.push(
  await medir('sem-pos-nenhum', {
    ...TUDO,
    bloom: false,
    fxaa: false,
    ssao: false,
    godRays: false,
  }),
)
await page.evaluate(() =>
  window.__roquecraft.setFx({ bloom: true, fxaa: true, ssao: true, godRays: true }),
)

// ── Veredito ─────────────────────────────────────────────────────────────────
const base0 = medidas[0]
const veredito = []
if (base0.erro) {
  veredito.push(`CENA SEM BORDA: ${base0.erro}. Sem borda de sombra no quadro não há o que medir.`)
} else if (base0.overshootMediano < 1.2) {
  veredito.push(
    `NÃO REPRODUZIU: com tudo ligado o overshoot mediano é ${base0.overshootMediano} nível de luma em ${base0.bordas} bordas. Esta cena não tem o contorno que o founder viu — trocar de cena antes de acusar qualquer passe.`,
  )
} else {
  veredito.push(
    `contorno reproduzido: overshoot mediano ${base0.overshootMediano} (p90 ${base0.overshootP90}) em ${base0.bordas} bordas.`,
  )
  for (const m of medidas.slice(1)) {
    if (m.erro) {
      veredito.push(`[${m.nome}] ${m.erro}`)
      continue
    }
    const queda = base0.overshootMediano - m.overshootMediano
    const parte = (queda / base0.overshootMediano) * 100
    veredito.push(
      `[${m.nome}] overshoot ${m.overshootMediano} — ${parte >= 55 ? 'CULPADO: leva' : 'inocente: leva só'} ${parte.toFixed(0)}% do contorno embora.`,
    )
  }
}

const relatorio = { semente: SEMENTE, chegada, medidas, veredito, erros }
fs.writeFileSync(path.join(OUT, 'relatorio.json'), JSON.stringify(relatorio, null, 2))
console.log(JSON.stringify({ chegada, medidas, veredito, erros }, null, 2))
await ctx.close()
await b.close()
servidor.close()
