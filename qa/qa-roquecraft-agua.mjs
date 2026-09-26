//
// A SENSAÇÃO DE PROFUNDIDADE DA ÁGUA — e a prova de que raso e fundo são
// estados DIFERENTES, não a mesma tela azul com nome novo.
//
// O founder pediu quatro coisas de uma vez: "sensação de profundidade da agua,
// blur, raios de sol dentro do fundo da agua" e "poder mergulhar". Esta sonda
// responde às três primeiras; a quarta é física pura e está provada em
// `tests/unit/services/roquecraft/mergulho.spec.js`.
//
// ⚠️ O MODO DE FALHA QUE ELA EVITA: uma foto submersa é azul e bonita em
// qualquer profundidade. Olhar duas e dizer "a de baixo parece mais funda" é
// exatamente o tipo de veredito que já custou rodadas nesta empreitada. Então a
// sonda MERGULHA de verdade — com a mesma entrada que o jogador usa — e lê os
// números vivos da névoa, do borrão e dos raios em cada profundidade. Se raso e
// fundo derem os mesmos números, ela denuncia em vez de aprovar.
//
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const OUT = path.resolve('scripts/.qa-agua')
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })

const DIST = path.resolve('dist/pwa')
const SEMENTE = Number(process.argv[2] || 942457)
const TICK = 4200 // sol a 63°: alto o bastante pra atravessar a lâmina d'água

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
  if (/Shader|WebGL|INVALID|context lost/i.test(t)) erros.push(t.slice(0, 160))
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
  await new Promise((r) => setTimeout(r, 2500))
  window.__rosStore?.maximizeWindow?.('roquecraft')
  await new Promise((r) => setTimeout(r, 900))
})
await page.addStyleTag({ content: '.ros-roquecraft__play { display: none !important }' })
await page.waitForTimeout(500)

// ── Achar mar fundo ──────────────────────────────────────────────────────────
const mar = await page.evaluate(async (tick) => {
  const rc = window.__roquecraft
  if (!rc.gotoBiome('ocean')) return { erro: "gotoBiome('ocean') não achou o oceano" }
  await rc.waitChunks(6)
  await new Promise((k) => setTimeout(k, 2400))
  rc.setTime(tick)
  rc.setFx({ hand: false })

  // A coluna mais funda por perto. `profundidadeAgua` é o gancho que já
  // existia justamente pra não construir piscina — ver o comentário dele.
  const p = rc.state.player
  let melhor = null
  for (let dx = -26; dx <= 26; dx += 2) {
    for (let dz = -26; dz <= 26; dz += 2) {
      const d = rc.profundidadeAgua(p.x + dx, p.z + dz)
      if (d > 0 && (!melhor || d > melhor.d)) melhor = { x: p.x + dx, z: p.z + dz, d }
    }
  }
  if (!melhor || melhor.d < 8) {
    return { erro: `sem coluna funda por perto (a melhor tinha ${melhor ? melhor.d : 0} blocos)` }
  }
  return { ...melhor, bioma: rc.state.biome }
}, TICK)
if (mar.erro) {
  console.log(JSON.stringify({ erro: mar.erro, erros }))
  await ctx.close()
  await b.close()
  servidor.close()
  process.exit(1)
}

// ── Mergulhar de verdade, com a entrada do jogador ───────────────────────────
//
// Teleportar pra profundidade seria mais simples e provaria menos: o pedido do
// founder inclui PODER mergulhar, então a sonda desce segurando a mesma tecla
// que ele segura. Se o verbo não existir, ela não chega ao fundo e o relatório
// mostra a profundidade que ela conseguiu — que é o defeito, não um erro dela.
async function mergulhar(segundos) {
  return page.evaluate(async (s) => {
    const rc = window.__roquecraft
    rc.teclar('ShiftLeft', true)
    await new Promise((k) => setTimeout(k, s * 1000))
    rc.teclar('ShiftLeft', false)
    await new Promise((k) => setTimeout(k, 700))
    return rc.aguaVisual()
  }, segundos)
}

// ⚠️ O ESTADO CRU JUNTO DA MEDIDA. A primeira rodada desta sonda devolveu
// "submerso: false" nas três etapas e não havia como saber se o jogador tinha
// boiado, ficado preso no ar ou caído fora da água — o relatório dizia o que
// falhou e não ONDE. Agora cada medida carrega a altura, o chão embaixo e o que
// a física acha da água.
const cruFn = () => {
  const rc = window.__roquecraft
  const p = rc.state.player
  return {
    y: Number(p.y.toFixed(2)),
    chao: rc.debug?.groundBelow,
    agua: rc.agua ? rc.agua() : null,
    colunaAqui: rc.profundidadeAgua(p.x, p.z),
    liquidoNoOlho: rc.blocoEm(p.x, p.y + 1.62, p.z),
    liquidoNoPe: rc.blocoEm(p.x, p.y + 0.1, p.z),
  }
}

async function retrato(nome) {
  const estado = await page.evaluate(async () => {
    const rc = window.__roquecraft
    // ⚠️ OLHANDO PRO SOL, não "pra cima" com um yaw herdado.
    //
    // A primeira rodada olhava com yaw 0,6 e os raios mediram intensidade ZERO
    // em TODAS as etapas — inclusive fora d'água. Não era o efeito desligado:
    // `uIntensity` já zera sozinho quando o sol sai do quadro (é a correção da
    // barra de luz sem fonte, de 23/08). Sem o sol enquadrado, esta sonda não
    // tinha como ver raio nenhum, e teria reprovado um efeito são.
    const tick = rc.state.ticks % 24000
    const ang = (tick / 24000) * Math.PI * 2
    const sol = { x: Math.cos(ang) * 0.94, y: Math.sin(ang), z: Math.cos(ang) * 0.34 }
    const yaw = Math.atan2(sol.x, -sol.z)
    const quadro = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const p = rc.state.player
    // Um ponto BEM longe na direção do sol: é onde o sol aparece na tela.
    const alvo = {
      x: p.x + sol.x * 400,
      y: p.y + 1.62 + sol.y * 400,
      z: p.z + sol.z * 400,
    }
    let melhor = null
    for (let pit = -1.2; pit <= 1.2001; pit += 0.05) {
      rc.look(yaw, pit)
      await quadro()
      const s = rc.projetar(alvo.x, alvo.y, alvo.z)
      if (!s || !s.frente) continue
      const err = Math.abs(s.u - 0.5) + Math.abs(s.v - 0.34)
      if (!melhor || err < melhor.err) melhor = { pit, err }
    }
    rc.look(yaw, melhor ? melhor.pit : -0.45)
    await new Promise((k) => setTimeout(k, 900))
    return rc.aguaVisual()
  })
  const diag = await page.evaluate(cruFn, null).catch(() => null)
  fs.writeFileSync(path.join(OUT, `${nome}.png`), await page.screenshot())
  return { ...estado, ...(diag || {}) }
}

const relatorio = { semente: SEMENTE, mar, medidas: [], veredito: [], erros }

// Entra na água pela superfície do ponto mais fundo.
await page.evaluate(
  async ({ x, z, tick }) => {
    const rc = window.__roquecraft
    rc.teleport(x, 66, z)
    await rc.waitChunks(4)
    rc.setFlying(false)
    rc.setTime(tick)
    await new Promise((k) => setTimeout(k, 2200))
  },
  { x: mar.x, z: mar.z, tick: TICK },
)

// Antes de qualquer foto: entrar na água DE FATO. Boiar não é estar submerso —
// o empuxo estabiliza o corpo com a cabeça de fora, que é exatamente o estado em
// que a primeira rodada tirou as três fotos achando que estava mergulhando.
const entrada = await page.evaluate(async () => {
  const rc = window.__roquecraft
  const trilha = []
  rc.teclar('ShiftLeft', true)
  // ⚠️ CURTO DE PROPÓSITO. A primeira rodada segurava 2,8 s aqui e chegava ao
  // LEITO antes da foto "raso" — a coluna deste mar tem 11 blocos. As duas
  // fotos saíam da mesma profundidade e o relatório, corretamente, recusou.
  // Aqui só se afunda a cabeça; o mergulho de verdade vem depois da foto rasa.
  for (let i = 0; i < 5; i++) {
    await new Promise((k) => setTimeout(k, 200))
    const p = rc.state.player
    trilha.push({
      t: (i + 1) * 0.2,
      y: Number(p.y.toFixed(2)),
      submerso: rc.aguaVisual().submerso,
      dentro: rc.agua ? !!rc.agua().dentro : null,
    })
  }
  rc.teclar('ShiftLeft', false)
  await new Promise((k) => setTimeout(k, 400))
  return trilha
})
relatorio.trilhaDeEntrada = entrada

const raso = await retrato('raso')
relatorio.medidas.push({ etapa: 'raso', ...raso })

await mergulhar(3.2)
const fundo = await retrato('fundo')
relatorio.medidas.push({ etapa: 'fundo', ...fundo })

// Sai da água pra provar que o efeito DESLIGA — passe que fica ligado em terra
// firme custa caro e some do print, que é a pior combinação.
const seco = await page.evaluate(async () => {
  const rc = window.__roquecraft
  rc.setFlying(true)
  const p = rc.state.player
  rc.teleport(p.x, 80, p.z)
  await new Promise((k) => setTimeout(k, 1600))
  return rc.aguaVisual()
})
relatorio.medidas.push({ etapa: 'seco', ...seco })

// ── Os julgamentos ───────────────────────────────────────────────────────────
const dRaso = raso.profundidadeDoOlho
const dFundo = fundo.profundidadeDoOlho

if (!raso.submerso) {
  relatorio.veredito.push('CENA INVÁLIDA: a foto "raso" saiu com a cabeça FORA da água.')
} else if (dFundo - dRaso < 3) {
  relatorio.veredito.push(
    `MERGULHO NÃO ACONTECEU: o olho saiu de ${dRaso} para ${dFundo} blocos de água por cima em 3,2 s segurando agachar. Sem descida, nada abaixo vale.`,
  )
} else {
  relatorio.veredito.push(
    `mergulhou: o olho passou de ${dRaso} para ${dFundo} blocos de água acima dele segurando agachar.`,
  )
  const recuo = raso.nevoa.far - fundo.nevoa.far
  if (recuo < 4) {
    relatorio.veredito.push(
      `SEM PROFUNDIDADE: a névoa mede ${raso.nevoa.far} raso e ${fundo.nevoa.far} fundo. Fundo não está fechando a vista, então raso e fundo são a mesma cena.`,
    )
  } else {
    relatorio.veredito.push(
      `profundidade: a vista fecha de ${raso.nevoa.far} para ${fundo.nevoa.far} blocos, e a cor vai de #${raso.nevoa.cor} para #${fundo.nevoa.cor}.`,
    )
  }
  if (fundo.borrao - raso.borrao < 0.15) {
    relatorio.veredito.push(
      `BORRÃO SEM GRADIENTE: ${raso.borrao} raso contra ${fundo.borrao} fundo.`,
    )
  } else {
    relatorio.veredito.push(`borrão: ${raso.borrao} raso, ${fundo.borrao} fundo.`)
  }
}

if (seco.borrao !== 0) {
  relatorio.veredito.push(
    `BORRÃO VAZOU PRA FORA D'ÁGUA: fora da água a força deveria ser 0 e está ${seco.borrao}.`,
  )
} else {
  relatorio.veredito.push('fora da água o borrão zera - o passe sai do caminho em terra firme.')
}
if (seco.raios && fundo.raios && fundo.raios.corte >= seco.raios.corte) {
  relatorio.veredito.push(
    `RAIOS SEM AJUSTE SUBMERSO: o corte é ${fundo.raios.corte} dentro d'água e ${seco.raios.corte} fora - dentro d'água ele precisa ser MENOR pra a superfície virar feixe.`,
  )
} else if (seco.raios && fundo.raios) {
  relatorio.veredito.push(
    `raios: corte ${fundo.raios.corte} submerso contra ${seco.raios.corte} seco, intensidade ${fundo.raios.intensidade} contra ${seco.raios.intensidade}.`,
  )
}

fs.writeFileSync(path.join(OUT, 'relatorio.json'), JSON.stringify(relatorio, null, 2))
console.log(JSON.stringify(relatorio, null, 2))
await ctx.close()
await b.close()
servidor.close()
