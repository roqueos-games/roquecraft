//
// A REPETIÇÃO DA MALHA DA ÁGUA, MEDIDA POR AUTOCORRELAÇÃO.
//
// "precisamos de uma malha de agua mais bem feita, a nossa está clara a
// repetição quando olhado de cima" — founder, 25/08/2026, com print.
//
// ⚠️ "PARECE REPETIDO" NÃO É MEDIÇÃO, e esta é justamente a classe de defeito em
// que o olho concorda com qualquer coisa: toda água de voxel tem padrão, e
// olhar duas fotos e dizer "essa repete menos" é o tipo de veredito que já
// custou rodadas nesta empreitada.
//
// Repetição TEM número. Um padrão que se repete com período (dx, dy) faz a
// imagem correlacionar fortemente consigo mesma deslocada desse tanto. Então a
// régua é a autocorrelação normalizada: desliza-se o recorte do mar sobre si
// mesmo e procura-se o PICO SECUNDÁRIO mais alto (o pico em zero é trivial).
// Padrão forte = pico secundário alto. Mar de verdade = pico secundário baixo.
//
// E como sempre, prova de vida antes do veredito: o espectro da onda virou
// uniforme (`uOndaOctavas`, `uOndaLacunaridade`), então a sonda fotografa o
// estado de ONTEM (4 oitavas, lacunaridade 1,5) e o de HOJE na MESMA sessão,
// mesma câmera, mesmo instante da onda. Se os dois medirem igual, a régua é
// cega e o verde dela não vale nada.
//
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const OUT = path.resolve('scripts/.qa-onda')
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })

const DIST = path.resolve('dist/pwa')
const SEMENTE = Number(process.argv[2] || 942457)
const TICK = 5000

const ANTES = { octavas: 4, lacunaridade: 1.5, persistencia: 0.5, L: 11 }
const AGORA = { octavas: 8, lacunaridade: 1.37, persistencia: 0.62, L: 13 }

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
page.on('console', (m) => {
  const t = m.text()
  if (/Shader|WebGL|INVALID|context lost/i.test(t)) erros.push(t.slice(0, 200))
})
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
  await new Promise((r) => setTimeout(r, 2600))
  window.__rosStore?.maximizeWindow?.('roquecraft')
  await new Promise((r) => setTimeout(r, 900))
})
await page.addStyleTag({ content: '.ros-roquecraft__play { display: none !important }' })
await page.waitForTimeout(500)

// Mar aberto, câmera bem alta, olhando pra BAIXO — que é exatamente o
// enquadramento do print do founder e o pior caso pra repetição.
const alto = await page.evaluate(async (tick) => {
  const rc = window.__roquecraft
  if (!rc.gotoBiome('ocean')) return { erro: "gotoBiome('ocean') não achou oceano" }
  await rc.waitChunks(6)
  await new Promise((k) => setTimeout(k, 2400))
  rc.setTime(tick)
  rc.setFx({ hand: false, congelarAgua: true })
  // ⚠️ "OCEANO" NÃO É MAR ABERTO.
  //
  // A primeira rodada caiu num canal estreito com banco de areia dos dois
  // lados e o recorte mediu ESPUMA e PRAIA. A autocorrelação, corretamente,
  // não achou período nenhum — porque o assunto não estava no quadro. O print
  // do founder é mar aberto até o horizonte, então a sonda tem que exigir
  // água em TODAS as direções, não só no bioma.
  const p0 = rc.state.player
  let alvoX = p0.x
  let alvoZ = p0.z
  let melhorAberto = -1
  for (let raio = 0; raio <= 160; raio += 20) {
    for (let a = 0; a < 8; a++) {
      const cx = p0.x + Math.cos((a / 8) * Math.PI * 2) * raio
      const cz = p0.z + Math.sin((a / 8) * Math.PI * 2) * raio
      let agua = 0
      let total = 0
      for (let d = 8; d <= 60; d += 8) {
        for (let b = 0; b < 8; b++) {
          total++
          const x = cx + Math.cos((b / 8) * Math.PI * 2) * d
          const z = cz + Math.sin((b / 8) * Math.PI * 2) * d
          if (rc.profundidadeAgua(x, z) >= 3) agua++
        }
      }
      const frac = agua / total
      if (frac > melhorAberto) {
        melhorAberto = frac
        alvoX = cx
        alvoZ = cz
      }
    }
    if (melhorAberto >= 0.99) break
  }
  if (melhorAberto < 0.9) {
    return {
      erro: `sem mar aberto por perto: o melhor ponto tem ${(melhorAberto * 100).toFixed(0)}% de água em 60 blocos`,
    }
  }
  const p = { x: alvoX, y: p0.y, z: alvoZ, aberto: melhorAberto }
  rc.setFlying(true)
  rc.teleport(alvoX, 96, alvoZ)
  await rc.waitChunks(5)
  await new Promise((k) => setTimeout(k, 2000))
  // Olhando quase a pino: o padrão da onda aparece inteiro, sem perspectiva
  // comprimindo as células longe e falseando a autocorrelação.
  const quadro = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  let melhor = null
  for (let pit = -1.4; pit <= 1.4001; pit += 0.05) {
    rc.look(0.6, pit)
    await quadro()
    const s = rc.projetar(p.x, 62, p.z)
    if (!s || !s.frente) continue
    const err = Math.abs(s.u - 0.5) + Math.abs(s.v - 0.5)
    if (!melhor || err < melhor.err) melhor = { pit, err }
  }
  if (!melhor) return { erro: 'não consegui olhar pra lâmina lá de cima' }
  rc.look(0.6, melhor.pit)
  await new Promise((k) => setTimeout(k, 1400))
  return {
    x: Math.round(p.x),
    z: Math.round(p.z),
    pitch: melhor.pit,
    bioma: rc.state.biome,
    aberto: Number(melhorAberto.toFixed(2)),
  }
}, TICK)
if (alto.erro) {
  console.log(JSON.stringify({ erro: alto.erro, erros }, null, 2))
  await ctx.close()
  await b.close()
  servidor.close()
  process.exit(1)
}

// ── A régua: autocorrelação normalizada ──────────────────────────────────────
const RECORTE = { x0: 300, x1: 1000, y0: 120, y1: 520 }
const DESLOC_MAX = 150
const DESLOC_MIN = 6 // abaixo disso é a própria textura, não período de padrão

function autocorrelacao(buf, nome) {
  const p = PNG.sync.read(buf)
  const W = RECORTE.x1 - RECORTE.x0
  const H = RECORTE.y1 - RECORTE.y0
  const v = new Float64Array(W * H)
  let soma = 0
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (p.width * (RECORTE.y0 + y) + (RECORTE.x0 + x)) << 2
      const l = 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2]
      v[y * W + x] = l
      soma += l
    }
  }
  const media = soma / (W * H)
  let variancia = 0
  for (let i = 0; i < v.length; i++) {
    v[i] -= media
    variancia += v[i] * v[i]
  }
  variancia /= v.length
  if (variancia < 4) {
    // Recorte chapado: sem variação não há padrão pra medir, e uma correlação
    // calculada sobre ruído de arredondamento daria qualquer número.
    return { erro: `recorte sem contraste (variância ${variancia.toFixed(2)})` }
  }

  // ⚠️ O MÁXIMO GLOBAL NÃO MEDE REPETIÇÃO.
  //
  // Primeira versão desta régua: pegava o maior valor da autocorrelação fora do
  // zero. O pico saiu em (0,6) — o MENOR deslocamento permitido — com 0,86 nos
  // dois espectros. E tinha que sair: qualquer imagem suave correlaciona forte
  // com ela mesma deslocada de seis pixels. Isso é vizinhança, não período, e a
  // régua ia declarar empate entre um espectro de 4 e um de 8 oitavas.
  //
  // O que separa campo PERIÓDICO de campo suave é o REPIQUE: o suave decai e
  // fica embaixo; o periódico decai, chega num vale e SOBE de novo, porque
  // encontrou a próxima célula do padrão. Então a medida é: perfil radial, o
  // primeiro vale, e quanto ele sobe depois disso.
  let pico = 0
  let ondePico = null
  const perfil = []
  const radial = new Map()
  for (let dy = 0; dy <= DESLOC_MAX; dy += 2) {
    for (let dx = -DESLOC_MAX; dx <= DESLOC_MAX; dx += 2) {
      const r = Math.hypot(dx, dy)
      if (r < DESLOC_MIN || r > DESLOC_MAX) continue
      let acc = 0
      let n = 0
      // Passo 2 na varredura de pixel: a conta é O(deslocamentos × pixels) e
      // meia resolução não muda o pico, só o custo.
      for (let y = Math.max(0, -dy); y < Math.min(H, H - dy); y += 2) {
        for (let x = Math.max(0, -dx); x < Math.min(W, W - dx); x += 2) {
          acc += v[y * W + x] * v[(y + dy) * W + (x + dx)]
          n++
        }
      }
      if (n < 500) continue
      const c = acc / n / variancia
      perfil.push({ dx, dy, c: Number(c.toFixed(3)) })
      const faixa = Math.round(r / 3) * 3
      const atual = radial.get(faixa) || { soma: 0, n: 0 }
      atual.soma += c
      atual.n++
      radial.set(faixa, atual)
      if (c > pico) {
        pico = c
        ondePico = { dx, dy }
      }
    }
  }
  perfil.sort((a, c) => c.c - a.c)
  // Perfil radial ordenado por distância.
  const faixas = [...radial.entries()]
    .map(([r, v]) => ({ r, c: v.soma / v.n }))
    .sort((a, c) => a.r - c.r)
  let iVale = 0
  for (let i = 1; i < faixas.length; i++) {
    if (faixas[i].c < faixas[iVale].c) iVale = i
    // Para no primeiro vale de verdade: depois que subiu por três faixas
    // seguidas, o vale já ficou pra trás.
    if (i > iVale + 3 && faixas[i].c > faixas[iVale].c) break
  }
  let repique = 0
  let ondeRepique = null
  for (let i = iVale + 1; i < faixas.length; i++) {
    const d = faixas[i].c - faixas[iVale].c
    if (d > repique) {
      repique = d
      ondeRepique = faixas[i].r
    }
  }
  if (nome) {
    const rec = new PNG({ width: W, height: H })
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (p.width * (RECORTE.y0 + y) + (RECORTE.x0 + x)) << 2
        const j = (W * y + x) << 2
        rec.data[j] = p.data[i]
        rec.data[j + 1] = p.data[i + 1]
        rec.data[j + 2] = p.data[i + 2]
        rec.data[j + 3] = 255
      }
    }
    fs.writeFileSync(path.join(OUT, `${nome}-recorte.png`), PNG.sync.write(rec))
  }
  return {
    repique: Number(repique.toFixed(4)),
    ondeRepique,
    valeEm: faixas[iVale]?.r ?? null,
    valeVale: Number((faixas[iVale]?.c ?? 0).toFixed(3)),
    picoSecundario: Number(pico.toFixed(3)),
    ondePico,
    variancia: Number(variancia.toFixed(1)),
    radial: faixas.map((f) => ({ r: f.r, c: Number(f.c.toFixed(3)) })),
  }
}

async function medir(nome, esp) {
  const vivo = await page.evaluate(
    async ({ esp, tick }) => {
      const rc = window.__roquecraft
      rc.setTime(tick)
      const r = rc.ondaQA(esp)
      await new Promise((k) => setTimeout(k, 1400))
      return r
    },
    { esp, tick: TICK },
  )
  const buf = await page.screenshot()
  fs.writeFileSync(path.join(OUT, `${nome}.png`), buf)
  return { nome, vivo, ...autocorrelacao(buf, nome) }
}

const ontem = await medir('ontem', ANTES)
const hoje = await medir('hoje', AGORA)
const hoje2 = await medir('hoje-2', AGORA)
await page.evaluate((e) => window.__roquecraft.ondaQA(e), AGORA)

const veredito = []
if (ontem.erro || hoje.erro) {
  veredito.push(`CENA INVÁLIDA: ${ontem.erro || hoje.erro}`)
} else {
  const deriva = Math.abs(hoje.repique - hoje2.repique)
  if (deriva > 0.02) {
    veredito.push(
      `DERIVA: duas fotos do mesmo espectro medem repique ${hoje.repique} e ${hoje2.repique}. A cena mudou entre elas e a comparação do meio não vale.`,
    )
  }
  const ganho = ontem.repique - hoje.repique
  const parte = ontem.repique > 0 ? (ganho / ontem.repique) * 100 : 0
  if (ontem.repique < 0.01) {
    veredito.push(
      `RÉGUA SEM ASSUNTO: nem o espectro de ontem mostra repique (${ontem.repique}). Ou esta cena não tem a repetição do print, ou a régua não a enxerga — em nenhum dos dois casos ela pode aprovar o de hoje.`,
    )
  } else if (ganho < ontem.repique * 0.2) {
    veredito.push(
      `SEM GANHO: repique de ${ontem.repique} (ontem) contra ${hoje.repique} (hoje) — só ${parte.toFixed(0)}% a menos. O espectro novo não reduziu a repetição de forma que se veja.`,
    )
  } else {
    veredito.push(
      `repetição caiu ${parte.toFixed(0)}%: o repique da autocorrelação foi de ${ontem.repique} (ontem, célula a ${ontem.ondeRepique} px) para ${hoje.repique} (hoje).`,
    )
  }
  veredito.push(`piso de deriva entre duas fotos iguais: ${deriva.toFixed(3)}.`)
}
if (erros.length) veredito.push(`⚠️ ${erros.length} erro(s) de shader/WebGL no console.`)

const relatorio = { semente: SEMENTE, alto, ontem, hoje, hoje2, veredito, erros }
fs.writeFileSync(path.join(OUT, 'relatorio.json'), JSON.stringify(relatorio, null, 2))
console.log(JSON.stringify(relatorio, null, 2))
await ctx.close()
await b.close()
servidor.close()
