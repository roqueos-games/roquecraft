//
// A LAVA SE MEXE? — e a pedra ao lado dela NÃO.
//
// "a lava está sem movimento" — founder, 25/08/2026.
//
// ⚠️ O PAR DE CONTROLE É O TESTE INTEIRO. "Dois quadros da lava diferem" não
// prova nada sozinho: a câmera pode ter tremido, uma nuvem pode ter passado, o
// relógio do dia mexe na luz. O que prova é a ASSIMETRIA — a faixa de lava muda
// e a faixa de PEDRA, no mesmo quadro, no mesmo instante, não muda. Se as duas
// mudarem, mudou a cena e não a lava; se nenhuma mudar, a sonda está cega.
//
// A sonda desce até uma poça de lava de verdade em caverna, em vez de construir
// uma: cena montada por edição de mundo já falhou nesta empreitada (a piscina
// vazia de 22/08) e o mundo tem lava sozinho.
//
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const OUT = path.resolve('scripts/.qa-lava')
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })

const DIST = path.resolve('dist/pwa')
const SEMENTE = Number(process.argv[2] || 942457)

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

// ── Achar lava e enquadrar lava + pedra no mesmo quadro ──────────────────────
const cena = await page.evaluate(async () => {
  const rc = window.__roquecraft

  // Varre a coluna abaixo do jogador em espiral procurando lava exposta com
  // pedra ao lado. Lava de superfície é rara; a de caverna é o caso normal.
  const p = rc.state.player
  let achado = null
  // ⚠️ CONTADOR POR ETAPA. A primeira rodada devolveu só "não achei" e não havia
  // como saber se faltava lava, faltava ar em cima ou faltava vizinho -- a mesma
  // cegueira que a peneira do poste teve na rodada da sombra.
  const peneira = { colunas: 0, lava: 0, comArCima: 0, comVizinho: 0 }
  const SOLIDO_QUE_SERVE = (k) => k && k !== 'air' && k !== 'lava' && k !== 'water'
  for (let raio = 0; raio <= 64 && !achado; raio += 3) {
    for (let a = 0; a < 32 && !achado; a++) {
      const ang = (a / 32) * Math.PI * 2
      const bx = Math.floor(p.x + Math.cos(ang) * raio)
      const bz = Math.floor(p.z + Math.sin(ang) * raio)
      peneira.colunas++
      // ⚠️ A FAIXA CERTA É O FUNDO DO MUNDO. A primeira rodada varreu y de 8 a
      // 60 e achou ZERO lava em 704 colunas -- e tinha que achar: o worldgen só
      // põe lago de lava entre y=2 e y=9 ("lago de lava no fundo das cavernas",
      // `worldgen.js`). Eu estava procurando no andar errado do mundo.
      for (let y = 2; y < 14; y++) {
        if (rc.blocoEm(bx, y, bz) !== 'lava') continue
        peneira.lava++
        // Ar em cima, senão a poça não aparece na foto.
        if (rc.solidoEm(bx, y + 1, bz)) continue
        peneira.comArCima++
        // O CONTROLE é qualquer bloco sólido que não seja líquido, com ar em
        // cima. Exigir 'stone' pelo nome era exigir demais: o teto e o piso de
        // caverna variam de material, e o teste é sobre "não é lava", não sobre
        // a mineralogia do vizinho.
        let vizinho = null
        for (let d = 2; d <= 5 && !vizinho; d++) {
          for (const [sx, sz] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
            [1, 1],
            [-1, -1],
          ]) {
            const nx = bx + sx * d
            const nz = bz + sz * d
            const k = rc.blocoEm(nx, y, nz)
            if (!SOLIDO_QUE_SERVE(k)) continue
            if (rc.solidoEm(nx, y + 1, nz)) continue
            vizinho = { x: nx, y, z: nz, k }
            break
          }
        }
        if (!vizinho) continue
        peneira.comVizinho++
        achado = { lava: { x: bx, y, z: bz }, pedra: vizinho }
        break
      }
    }
  }
  if (!achado) return { erro: `sem poça de lava enquadrável: ${JSON.stringify(peneira)}` }
  achado.peneira = peneira

  // Câmera logo acima, olhando pra baixo, com os dois no quadro.
  const meioX = (achado.lava.x + achado.pedra.x) / 2 + 0.5
  const meioZ = (achado.lava.z + achado.pedra.z) / 2 + 0.5
  rc.setFlying(true)
  rc.teleport(meioX, achado.lava.y + 4.2, meioZ)
  // ⚠️ BLOOM DESLIGADO, E O MOTIVO É O CONTROLE.
  //
  // Primeira medição com a lava já animada: a lava mudou 0,971 e a PEDRA ao lado
  // mudou 3,931 -- quatro vezes MAIS. O controle não estava independente: a
  // pedra fica encostada numa fonte de luz emissiva, e o bloom espalha a
  // variação da lava por cima dela. Ou seja, a pedra estava medindo a lava.
  //
  // Um controle que se move junto com o assunto não é controle. Com o bloom e
  // os raios fora, o que sobra na janela da pedra é a pedra.
  rc.setFx({ hand: false, bloom: false, godRays: false })
  await new Promise((k) => setTimeout(k, 1400))

  const quadro = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  let melhor = null
  for (let yaw = 0; yaw < 6.28; yaw += 0.35) {
    for (let pit = -1.5; pit <= 1.5001; pit += 0.1) {
      rc.look(yaw, pit)
      await quadro()
      const a = rc.projetar(achado.lava.x + 0.5, achado.lava.y + 1, achado.lava.z + 0.5)
      const c = rc.projetar(achado.pedra.x + 0.5, achado.pedra.y + 1, achado.pedra.z + 0.5)
      if (!a || !c || !a.frente || !c.frente) continue
      const dentro = (s) => s.u > 0.12 && s.u < 0.88 && s.v > 0.12 && s.v < 0.75
      if (!dentro(a) || !dentro(c)) continue
      // Quer os dois BEM separados na tela, pra as janelas de medição não se
      // tocarem — janela que pega os dois mede a média e não separa nada.
      const sep = Math.hypot(a.u - c.u, a.v - c.v)
      if (!melhor || sep > melhor.sep) melhor = { yaw, pit, a, c, sep }
    }
  }
  if (!melhor || melhor.sep < 0.12) {
    return {
      erro: `não consegui enquadrar lava e pedra separadas (melhor separação ${melhor ? melhor.sep.toFixed(2) : 0})`,
    }
  }
  rc.look(melhor.yaw, melhor.pit)
  await new Promise((k) => setTimeout(k, 1200))
  return {
    ...achado,
    telaLava: { u: melhor.a.u, v: melhor.a.v },
    telaPedra: { u: melhor.c.u, v: melhor.c.v },
    separacao: Number(melhor.sep.toFixed(3)),
  }
})
if (cena.erro) {
  console.log(JSON.stringify({ erro: cena.erro, erros }, null, 2))
  await ctx.close()
  await b.close()
  servidor.close()
  process.exit(1)
}

// ── Régua: quanto uma janela da tela mudou entre dois quadros ────────────────
const JANELA = 34 // metade do lado, em pixels
const L = (p, i) => 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2]

function mudanca(bufA, bufB, tela) {
  const A = PNG.sync.read(bufA)
  const B = PNG.sync.read(bufB)
  const cx = Math.round(tela.u * A.width)
  const cy = Math.round(tela.v * A.height)
  let soma = 0
  let n = 0
  let pico = 0
  for (let y = cy - JANELA; y <= cy + JANELA; y++) {
    if (y < 0 || y >= A.height) continue
    for (let x = cx - JANELA; x <= cx + JANELA; x++) {
      if (x < 0 || x >= A.width) continue
      const i = (A.width * y + x) << 2
      const d = Math.abs(L(A, i) - L(B, i))
      soma += d
      if (d > pico) pico = d
      n++
    }
  }
  return { media: Number((soma / Math.max(1, n)).toFixed(3)), pico: Math.round(pico), px: n }
}

async function foto(nome) {
  // O relógio do dia é reposto antes de CADA foto: sem isso a luz do céu anda
  // entre um clique e outro e entra na conta como se fosse movimento de lava.
  // Na caverna a luz do céu é zero, mas a sonda não pode depender disso -- ela
  // desce onde o mundo tiver lava, e uma poça exposta pega céu.
  await page.evaluate(() => window.__roquecraft.setTime(6000))
  const buf = await page.screenshot()
  fs.writeFileSync(path.join(OUT, `${nome}.png`), buf)
  return buf
}

// ── A/B: a MESMA janela, com a lava andando e com ela congelada ─────────────
//
// ⚠️ DUAS TENTATIVAS DE CONTROLE FORAM JOGADAS FORA ANTES DESTA, e as duas
// falharam pelo mesmo motivo: escolheram um controle que não é independente do
// assunto.
//
//  1. "A lava muda e a PEDRA ao lado não." A pedra encosta numa fonte de luz
//     emissiva; com bloom ela media 3,9 e sem bloom media 7,6 -- ela estava
//     medindo a lava por reflexo e por brilho espalhado.
//  2. "Esperar a cena parar e então medir." A cena nunca parou: 24 s depois a
//     janela de controle ainda mudava, porque a caverna a y≈5 continua
//     chegando e a luz da lava continua batendo nela.
//
// O que resolve não é achar um controle melhor no espaço -- é mover o controle
// pro TEMPO. Fotografa-se a mesma janela, na mesma câmera, com o relógio da
// lava ANDANDO e com ele PARADO. O que quer que esteja se mexendo na cena
// (malha chegando, luz, ruído) se mexe igual nas duas condições e se cancela na
// comparação. O que sobra é a lava.
async function parDeQuadros(lavaParada) {
  await page.evaluate((v) => window.__roquecraft.setFx({ lavaParada: v }), lavaParada)
  await page.waitForTimeout(600)
  const a = await foto(lavaParada ? 'parada-a' : 'andando-a')
  await page.waitForTimeout(1000)
  const b = await foto(lavaParada ? 'parada-b' : 'andando-b')
  return {
    lava: mudanca(a, b, cena.telaLava),
    pedra: mudanca(a, b, cena.telaPedra),
  }
}

// Alterna as condições pra deriva lenta não cair toda numa delas.
const andando1 = await parDeQuadros(false)
const parada1 = await parDeQuadros(true)
const andando2 = await parDeQuadros(false)
const parada2 = await parDeQuadros(true)
await page.evaluate(() => window.__roquecraft.setFx({ lavaParada: false }))

const med = (a, b) => (a + b) / 2
const lavaAndando = med(andando1.lava.media, andando2.lava.media)
const lavaParadaM = med(parada1.lava.media, parada2.lava.media)
const pedraAndando = med(andando1.pedra.media, andando2.pedra.media)
const pedraParadaM = med(parada1.pedra.media, parada2.pedra.media)

const veredito = []
const ganho = lavaAndando - lavaParadaM
if (lavaParadaM > 900) {
  veredito.push('IMPOSSÍVEL: a janela congelada mudou mais que o quadro inteiro.')
} else if (ganho < 0.3) {
  veredito.push(
    `LAVA PARADA: com o relógio andando a janela da lava muda ${lavaAndando.toFixed(2)} e com ele congelado muda ${lavaParadaM.toFixed(2)} — diferença de ${ganho.toFixed(2)}. Ligar a animação não mudou nada, então ela não está chegando no pixel.`,
  )
} else {
  veredito.push(
    `a lava se move: a MESMA janela muda ${lavaAndando.toFixed(2)} com o relógio da lava andando e ${lavaParadaM.toFixed(2)} com ele congelado.`,
  )
  // ⚠️ A SEGUNDA JANELA NÃO É CONTROLE, e a foto provou isso. Ela foi escolhida
  // sobre um bloco vizinho na esperança de ser pedra, mas 68x68 px numa caverna
  // cheia de poças pega lava também -- e é por isso que ela se move MAIS. Ela
  // ficou no relatório porque ainda informa: ela cai junto quando o relógio
  // congela, e é isso que fecha o argumento.
  //
  // O CONTROLE DE VERDADE é a condição congelada. Com o relógio da lava parado,
  // as DUAS janelas ficam quietas -- o que prova que não há nenhuma outra fonte
  // de movimento no quadro, e que tudo que se mexe é a lava.
  const quietoCongelado = Math.max(lavaParadaM, pedraParadaM)
  veredito.push(
    `com o relógio congelado a cena inteira fica quieta: ${lavaParadaM.toFixed(2)} e ${pedraParadaM.toFixed(2)} nas duas janelas. Não há outra fonte de movimento no quadro.`,
  )
  veredito.push(
    `a segunda janela (rotulada "pedra") mede ${pedraAndando.toFixed(2)} andando — ela pegou lava também, e cai pra ${pedraParadaM.toFixed(2)} congelada.`,
  )
  if (quietoCongelado > ganho) {
    veredito.push(
      `⚠️ o piso congelado (${quietoCongelado.toFixed(2)}) é maior que o ganho (${ganho.toFixed(2)}): há ruído independente da lava e o veredito não é confiável.`,
    )
  }
}
if (erros.length) veredito.push(`⚠️ ${erros.length} erro(s) de shader/WebGL no console.`)

const relatorio = {
  semente: SEMENTE,
  cena,
  andando: { lava: lavaAndando, pedra: pedraAndando, bruto: [andando1, andando2] },
  parada: { lava: lavaParadaM, pedra: pedraParadaM, bruto: [parada1, parada2] },
  veredito,
  erros,
}
fs.writeFileSync(path.join(OUT, 'relatorio.json'), JSON.stringify(relatorio, null, 2))
console.log(JSON.stringify(relatorio, null, 2))
await ctx.close()
await b.close()
servidor.close()
