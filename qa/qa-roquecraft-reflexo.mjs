//
// O REFLEXO DO CENÁRIO NA ÁGUA — e a prova de que é CENÁRIO, não céu.
//
// "está faltando o reflexo do cenario na agua também para dar uma maior
// realidade" — founder. O shader já refletia o CÉU por fresnel, então uma foto
// de lâmina azulada com um brilho claro em cima não prova nada: era exatamente
// isso que já existia antes.
//
// ⚠️ O QUE ESTA SONDA EXIGE: a mesma lâmina d'água, no mesmo quadro, COM e SEM o
// alvo planar ligado. Se as duas fotos forem iguais, o reflexo de cenário não
// está chegando na água e o verde não vale nada. E a diferença tem que estar
// EM BAIXO — na água — não no céu: por isso a medição é feita só na metade
// inferior do quadro, com a linha do horizonte fora do recorte.
//
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const OUT = path.resolve('scripts/.qa-reflexo')
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })

const DIST = path.resolve('dist/pwa')
const SEMENTE = Number(process.argv[2] || 942457)
const TICK = 3000 // sol a 45°: cenário bem iluminado, lâmina ainda com raspão

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
  if (/Shader|WebGL|INVALID|context lost|GL_/i.test(t)) erros.push(t.slice(0, 200))
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

// ── A margem: terra de um lado, água do outro ────────────────────────────────
//
// Praia, não oceano aberto: reflexo de cenário só existe se houver cenário pra
// refletir. No meio do mar o alvo planar desenha céu e o teste seria vazio.
const margem = await page.evaluate(async (tick) => {
  const rc = window.__roquecraft
  // ⚠️ OCEANO, NÃO PRAIA. A praia desta semente tem lâmina de UM bloco: a
  // sonda procurou coluna com 2+ e não achou nenhuma no rumo do mar. Reflexo
  // de cenário quer água funda embaixo e cenário alto na frente — o oceano dá
  // a primeira, e a linha da costa vista de dentro d'água dá a segunda.
  if (!rc.gotoBiome('ocean')) return { erro: "gotoBiome('ocean') não achou oceano" }
  await rc.waitChunks(6)
  await new Promise((k) => setTimeout(k, 2400))
  rc.setTime(tick)
  rc.setFx({ hand: false })

  const p = rc.state.player
  // O rumo da COSTA: onde há mais bloco acima do nível do mar em 70 blocos.
  let costa = null
  for (let i = 0; i < 48; i++) {
    const yaw = (i / 48) * Math.PI * 2
    let volume = 0
    for (let d = 10; d <= 70; d += 2) {
      const x = Math.floor(p.x + Math.sin(yaw) * d)
      const z = Math.floor(p.z - Math.cos(yaw) * d)
      for (let h = 2; h <= 16; h += 2) if (rc.solidoEm(x, 62 + h, z)) volume++
    }
    if (!costa || volume > costa.volume) costa = { yaw, volume }
  }
  if (!costa || costa.volume < 8) {
    return {
      erro: `mar aberto demais: nenhuma costa com volume em 70 blocos (melhor teve ${costa ? costa.volume : 0})`,
    }
  }
  // Fica onde está (mar), olhando pra costa. A água do primeiro plano é o
  // espelho, e a costa é o assunto refletido.
  const ax = p.x
  const az = p.z
  if (rc.profundidadeAgua(ax, az) < 2) {
    return { erro: `o ponto do oceano tem só ${rc.profundidadeAgua(ax, az)} bloco de lâmina` }
  }
  rc.setFlying(true)
  rc.teleport(ax, 63.4, az)
  await new Promise((k) => setTimeout(k, 900))
  const melhor = { yaw: costa.yaw, agua: rc.profundidadeAgua(ax, az), margemAlta: costa.volume }
  rc.look(melhor.yaw, 0.02)
  await new Promise((k) => setTimeout(k, 900))
  // Quanta LÂMINA existe de fato na metade inferior do quadro? A medição toda
  // acontece ali; se ali houver areia, o veredito seria sobre areia.
  let comAgua = 0
  let olhados = 0
  for (let d = 2; d <= 26; d += 2) {
    for (const lado of [-6, -3, 0, 3, 6]) {
      const x = ax + Math.sin(melhor.yaw) * d + Math.cos(melhor.yaw) * lado
      const z = az - Math.cos(melhor.yaw) * d + Math.sin(melhor.yaw) * lado
      olhados++
      if (rc.profundidadeAgua(x, z) > 0) comAgua++
    }
  }
  melhor.aguaNoQuadro = Number((comAgua / olhados).toFixed(2))
  if (melhor.aguaNoQuadro < 0.5) {
    return {
      erro: `só ${(melhor.aguaNoQuadro * 100).toFixed(0)}% de lâmina à frente da câmera - o recorte mediria areia`,
    }
  }
  await new Promise((k) => setTimeout(k, 1400))
  return {
    x: Math.round(p.x),
    y: Math.round(p.y),
    z: Math.round(p.z),
    bioma: rc.state.biome,
    yaw: Number(melhor.yaw.toFixed(3)),
    amostrasDeAgua: melhor.agua,
    margemAlta: melhor.margemAlta,
    aguaNoQuadro: melhor.aguaNoQuadro,
  }
}, TICK)
if (margem.erro) {
  console.log(JSON.stringify({ erro: margem.erro, erros }, null, 2))
  await ctx.close()
  await b.close()
  servidor.close()
  process.exit(1)
}

async function foto(nome, ligado) {
  const estado = await page.evaluate(async (ligado) => {
    const rc = window.__roquecraft
    // Onda congelada nas três fotos: é o que torna a comparação pixel a pixel
    // honesta. Sem isso o piso de ruído (4,84) ficava acima do sinal (5,23).
    rc.setFx({ reflexo: ligado, congelarAgua: true })
    await new Promise((r) => setTimeout(r, 1600))
    return rc.aguaVisual()
  }, ligado)
  const buf = await page.screenshot()
  fs.writeFileSync(path.join(OUT, `${nome}.png`), buf)
  return { buf, estado }
}

const com = await foto('com-reflexo', true)
const sem = await foto('sem-reflexo', false)
const com2 = await foto('com-reflexo-2', true)
await page.evaluate(() => window.__roquecraft.setFx({ reflexo: true }))

// ── Régua: quanto mudou, e ONDE ──────────────────────────────────────────────
const L = (p, i) => 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2]
function comparar(a, b, nome) {
  const A = PNG.sync.read(a)
  const B = PNG.sync.read(b)
  // Metade INFERIOR e acima do HUD: é onde a lâmina está. O céu fica de fora de
  // propósito — reflexo de céu já existia antes desta rodada e contá-lo seria
  // creditar ao cenário um efeito que não é dele.
  const y0 = Math.floor(A.height * 0.5)
  const y1 = Math.floor(A.height * 0.82)
  const mapa = new PNG({ width: A.width, height: y1 - y0 })
  // ⚠️ MÉDIA POR LADRILHO, não pixel a pixel.
  //
  // A onda anda sozinha: duas fotos com os MESMOS parâmetros já diferiam em
  // 8,4% dos pixels, e o sinal do reflexo media 8,57% — indistinguível. O ruído
  // é de alta frequência (a crista mexe de um pixel pro outro) e o reflexo é de
  // baixa (uma mancha de árvore ocupa um pedaço inteiro da lâmina). Medindo a
  // média de blocos de 32×32, a onda se cancela e o reflexo sobrevive.
  const LADRILHO = 32
  let somaTiles = 0
  let nTiles = 0
  let pico = 0
  for (let ty = y0; ty + LADRILHO <= y1; ty += LADRILHO) {
    for (let tx = 0; tx + LADRILHO <= A.width; tx += LADRILHO) {
      let sa = 0
      let sb = 0
      for (let y = ty; y < ty + LADRILHO; y++) {
        for (let x = tx; x < tx + LADRILHO; x++) {
          const i = (A.width * y + x) << 2
          sa += L(A, i)
          sb += L(B, i)
        }
      }
      const n = LADRILHO * LADRILHO
      const d = Math.abs(sa / n - sb / n)
      somaTiles += d
      nTiles++
      if (d > pico) pico = d
      for (let y = ty; y < ty + LADRILHO; y++) {
        for (let x = tx; x < tx + LADRILHO; x++) {
          const j = (A.width * (y - y0) + x) << 2
          const v = Math.min(255, d * 24)
          mapa.data[j] = v
          mapa.data[j + 1] = v
          mapa.data[j + 2] = v
          mapa.data[j + 3] = 255
        }
      }
    }
  }
  if (nome) fs.writeFileSync(path.join(OUT, `${nome}.png`), PNG.sync.write(mapa))
  return {
    mediaPorLadrilho: Number((somaTiles / Math.max(1, nTiles)).toFixed(3)),
    picoLadrilho: Number(pico.toFixed(2)),
    ladrilhos: nTiles,
  }
}

const sinal = comparar(com.buf, sem.buf, 'diff-reflexo')
const ruido = comparar(com.buf, com2.buf, 'diff-ruido')

const veredito = []
if (!com.estado.reflexo?.disponivel) {
  veredito.push('PERFIL SEM REFLEXO: o alvo planar não foi criado neste perfil.')
} else if (!com.estado.reflexo.ativo) {
  veredito.push(
    `ALVO NÃO DESENHOU: reflexo.ativo=false com a câmera em y=${margem.y}. Sem alvo, o shader ignora e a foto "com" é igual à "sem" por construção.`,
  )
} else if (sinal.mediaPorLadrilho <= ruido.mediaPorLadrilho * 2.5 + 0.05) {
  veredito.push(
    `REFLEXO NÃO CHEGA NA ÁGUA: ligar e desligar move a média do ladrilho em ${sinal.mediaPorLadrilho}, com piso de ruído de ${ruido.mediaPorLadrilho}. O alvo é desenhado e não aparece na lâmina.`,
  )
} else {
  veredito.push(
    `reflexo do cenário chega na água: a média por ladrilho move ${sinal.mediaPorLadrilho} (pico ${sinal.picoLadrilho}) contra ${ruido.mediaPorLadrilho} de ruído entre duas fotos iguais.`,
  )
  veredito.push(
    `alvo planar em ${com.estado.reflexo.alvo?.join('×')} — metade da resolução da tela, um desenho de cena a mais por quadro.`,
  )
}
if (erros.length) veredito.push(`⚠️ ${erros.length} erro(s) de shader/WebGL no console.`)

const relatorio = {
  semente: SEMENTE,
  margem,
  sinal,
  ruido,
  estados: { com: com.estado, sem: sem.estado },
  veredito,
  erros,
}
fs.writeFileSync(path.join(OUT, 'relatorio.json'), JSON.stringify(relatorio, null, 2))
console.log(JSON.stringify(relatorio, null, 2))
await ctx.close()
await b.close()
servidor.close()
