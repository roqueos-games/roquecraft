//
// QA DO VENTO — a vegetação se mexe, e SÓ ela?
//
// A pergunta parece boba e não é. "Olhei e balança" não distingue folha
// balançando de nuvem passando, de mão do jogador oscilando, de céu mudando de
// cor no ciclo do dia. Todos aparecem numa diferença de quadros e todos já
// enganaram uma sonda deste projeto.
//
// O método é o PAR DE CONTROLE: dois quadros com vento, dois quadros sem, na
// mesma câmera e no mesmo instante do jogo. O que sobra na subtração é vento.
//
//   difSem  ≈ 0  → a cena está parada quando o vento sai. A sonda enxerga.
//   difCom  >> 0 → o vento move a cena.
//
// Se difSem NÃO for ~0, a medida está contaminada e o veredito é nulo — não
// vale "mas o difCom deu alto". Um contador que só sabe subir não é medida.
//
// A cena da copa é escolhida pra ser PROVA POR CONSTRUÇÃO: enquadra folha e
// céu, mais nada. Antes desta rodada a folha tinha aWind = 0 e ficava congelada,
// então este mesmo número dava zero no código antigo — foi rodado lá pra
// conferir, não deduzido.
//
//   node scripts/qa-roquecraft-vento.mjs [semente] [sufixo]
//
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'
import { criarMirar } from './lib/rc-mirar.mjs'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const { PNG } = createRequire(import.meta.url)('pngjs')

const DIST = path.resolve('dist/pwa')
const SUFIXO = process.argv[3] || 'depois'
const OUT = path.resolve('scripts/.qa-vento', SUFIXO)
fs.mkdirSync(OUT, { recursive: true })
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
const s = http.createServer((q, r) => {
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
await new Promise((r) => s.listen(0, r))
const base = `http://localhost:${s.address().port}`
const SEMENTE = Number(process.argv[2] || 942457)
const ESCALA = Number(process.env.ESCALA || 1)
const PERFIL = process.env.PERFIL || 'ultra'

const b = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const ctx = await b.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: ESCALA,
  serviceWorkers: 'block',
  locale: 'pt-BR',
})
const page = await ctx.newPage()
const erros = []
page.on('pageerror', (e) => erros.push(String(e.message).slice(0, 200)))
page.on('console', (m) => {
  const t = m.text()
  if (/Shader|WebGL|INVALID|context lost/i.test(t)) erros.push(t.slice(0, 200))
})
await page.addInitScript(
  `window.__ROS_E2E__={auth:{uid:'e2e',email:'e@e.t',emailVerified:true,displayName:'E',role:'user'},googleDrive:{isConnected:false,files:[],user:{}},googleMapsApiKey:'',roquecraftSeed:${SEMENTE}}`,
)
await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => !!window.__rosStore, null, { timeout: 30000 })
await page.waitForTimeout(1200)
await page.evaluate(() => window.__rosStore.openWindow('roquecraft'))
await page.waitForFunction(() => window.__roquecraft?.state?.ready === true, null, {
  timeout: 120000,
})
await page.evaluate(async (perfil) => {
  window.__roquecraft.setQuality(perfil)
  await new Promise((r) => setTimeout(r, 3000))
}, PERFIL)
await page.evaluate(async () => {
  window.__rosStore?.maximizeWindow?.('roquecraft')
  await new Promise((r) => setTimeout(r, 900))
})
// O véu do "clique para jogar" é um scrim sobre a tela inteira e em headless
// nunca some sozinho — fotografar através dele mede a opacidade do véu.
await page.addStyleTag({ content: '.ros-roquecraft__play { display: none !important }' })
await page.waitForTimeout(600)

// ── Achar a árvore mais frondosa perto do nascimento ───────────────────────
await page.evaluate(async () => {
  const rc = window.__roquecraft
  const h = rc.surfaceAt(0, 0)
  rc.teleport(0.5, (Number.isFinite(h) ? h : 66) + 2, 0.5)
  rc.setFlying(false)
  await rc.waitChunks(6)
})
await page.waitForTimeout(3000)

// ⚠️ Duas armadilhas, as duas pagas em rodada perdida:
//
//  1. `blocoEm` devolve a CHAVE do bloco, não o id numérico. Comparar com
//     `12` não dá erro — dá `false` sempre, e a sonda relata "não achei
//     árvore" num mundo cheio de floresta.
//  2. `surfaceAt` é o primeiro espaço LIVRE acima do topo sólido, e folha é
//     sólida: numa coluna com copa ele devolve o topo da COPA. Varrer pra cima
//     a partir dele varre só ar. A folha está ABAIXO.
const arvore = await page.evaluate(() => {
  const rc = window.__roquecraft
  const FOLHAS = new Set(['oakLeaves', 'birchLeaves', 'spruceLeaves', 'jungleLeaves'])
  let melhor = null
  let total = 0
  for (let x = -40; x <= 40; x++) {
    for (let z = -40; z <= 40; z++) {
      const topo = rc.surfaceAt(x, z)
      if (!Number.isFinite(topo)) continue
      let n = 0
      let soma = 0
      let baixo = Infinity
      for (let y = topo; y >= topo - 26; y--) {
        if (FOLHAS.has(rc.blocoEm(x, y, z))) {
          n++
          soma += y
          baixo = Math.min(baixo, y)
        }
      }
      total += n
      if (n && (!melhor || n > melhor.n)) melhor = { x, z, n, y: soma / n, baixo }
    }
  }
  if (!melhor) return null
  // Chão de VERDADE: a coluna do tronco tem copa em cima, então o `surfaceAt`
  // dela é o topo da árvore. O chão sai de uma coluna vizinha sem folha.
  let chao = null
  for (let d = 3; d <= 10 && chao === null; d++) {
    for (const [dx, dz] of [
      [d, 0],
      [-d, 0],
      [0, d],
      [0, -d],
    ]) {
      const h = rc.surfaceAt(melhor.x + dx, melhor.z + dz)
      if (Number.isFinite(h) && h < melhor.baixo) {
        chao = h
        break
      }
    }
  }
  return { ...melhor, chao: chao ?? melhor.baixo - 4, folhasNaVarredura: total }
})
if (!arvore) {
  console.log(JSON.stringify({ erro: 'nenhuma folha encontrada perto do nascimento' }))
  await b.close()
  s.close()
  process.exit(1)
}

// ── Ferramentas de medida ─────────────────────────────────────────────────
const tela = await page.$('canvas')
const foto = async () => PNG.sync.read(await (tela || page).screenshot())

// Diferença média de luminância entre dois quadros, em 0..255, contando só os
// pixels que mudaram acima do ruído de quantização. Devolve também a FRAÇÃO da
// tela que se mexeu: uma folha que anda 2 px muda pouco em média e muito em
// área, e os dois números juntos separam "andou" de "piscou".
function diferenca(a, c) {
  const n = Math.min(a.data.length, c.data.length)
  let soma = 0
  let mexeu = 0
  let px = 0
  for (let i = 0; i < n; i += 4) {
    const la = a.data[i] * 0.299 + a.data[i + 1] * 0.587 + a.data[i + 2] * 0.114
    const lc = c.data[i] * 0.299 + c.data[i + 1] * 0.587 + c.data[i + 2] * 0.114
    const d = Math.abs(la - lc)
    soma += d
    if (d > 6) mexeu++
    px++
  }
  return { media: +(soma / px).toFixed(3), area: +((mexeu / px) * 100).toFixed(2) }
}

// Imagem da diferença, amplificada. Um número diz QUANTO mudou; só a imagem
// diz O QUE mudou. A primeira rodada desta sonda deu `sem vento` = 0.6 e eu
// teria chutado a causa — a imagem mostrou a mão do jogador oscilando no canto.
function salvarDiff(a, c, arquivo) {
  const out = new PNG({ width: a.width, height: a.height })
  const n = Math.min(a.data.length, c.data.length, out.data.length)
  for (let i = 0; i < n; i += 4) {
    const la = a.data[i] * 0.299 + a.data[i + 1] * 0.587 + a.data[i + 2] * 0.114
    const lc = c.data[i] * 0.299 + c.data[i + 1] * 0.587 + c.data[i + 2] * 0.114
    const v = Math.min(255, Math.abs(la - lc) * 14)
    out.data[i] = v
    out.data[i + 1] = v
    out.data[i + 2] = v
    out.data[i + 3] = 255
  }
  fs.writeFileSync(path.join(OUT, arquivo), PNG.sync.write(out))
}

let TICK = 6000

// Mira MEDIDA e PROVADA — ver scripts/lib/rc-mirar.mjs. Enumerar convenções de
// yaw acertava por sorte em foto picada e errava a tela inteira em foto rasa
// (24/08/2026, sonda da cama). Agora mede a resposta e fecha a malha.
const mirar = criarMirar(page)

// Um par de quadros separados por ~`ms`, com o vento no estado pedido.
//
// A MÃO SAI DO QUADRO (`hand:false`) e o relógio do dia é RECOLOCADO no mesmo
// tique antes de cada foto. Os dois são movimento próprio da cena: a mão
// oscila sozinha e o sol anda. Sem tirar os dois, o "sem vento" não dá zero e
// o par de controle não controla nada.
async function par(vento, ms = 500, dump = null) {
  await page.evaluate((v) => window.__roquecraft.setFx({ wind: v, hand: false }), vento)
  await page.waitForTimeout(700)
  await page.evaluate((t) => window.__roquecraft.setTime(t), TICK)
  const a = await foto()
  await page.waitForTimeout(ms)
  await page.evaluate((t) => window.__roquecraft.setTime(t), TICK)
  const c = await foto()
  if (dump) salvarDiff(a, c, dump)
  return diferenca(a, c)
}

// Mediana de 3 pares: um quadro perdido no meio de um par vira um pico, e a
// média carrega o pico pra dentro do veredito.
async function medir(vento, dump) {
  const v = []
  for (let i = 0; i < 3; i++) v.push(await par(vento, 500, i === 0 ? dump : null))
  v.sort((x, y) => x.media - y.media)
  return v[1]
}

// ── Cenas ─────────────────────────────────────────────────────────────────
// Meio-dia fixo, nuvem fora, água fora: sobra folha, grama e céu liso. Cada
// coisa que fica no quadro e se mexe sozinha é ruído somado ao veredito.
async function preparar(cena) {
  await page.evaluate(async (c) => {
    const rc = window.__roquecraft
    rc.setTime(6000)
    rc.setFx({ clouds: false, water: false })
    rc.setFlying(c.voando)
    rc.teleport(c.px, c.py, c.pz)
    rc.look(c.yaw, c.pitch)
    await new Promise((r) => setTimeout(r, 1200))
  }, cena)
  // Cena com alvo declarado mira POR MEDIDA. Cena sem alvo usa o ângulo fixo.
  if (cena.alvo) await mirar(...cena.alvo)
  await page.waitForTimeout(600)
}

const olharPara = (px, py, pz, ax, ay, az) => {
  const dx = ax - px
  const dy = ay - py
  const dz = az - pz
  return { yaw: Math.atan2(dx, dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) }
}

// Altura do chão em cada ponto de câmera, medida no mundo — enquadrar pela
// altura teórica põe a câmera dentro da encosta.
const chaoEm = async (x, z) =>
  page.evaluate(([a, c]) => window.__roquecraft.surfaceAt(a, c), [x, z])

const cenas = []
{
  // COPA CONTRA O CÉU — a prova por construção. Ao lado do tronco, olhando pra
  // cima: no quadro só entra folha e céu. No código antigo a folha tinha
  // aWind = 0 e este número dava zero.
  const px = arvore.x + 2.5
  const pz = arvore.z + 2.5
  const py = ((await chaoEm(arvore.x + 2, arvore.z + 2)) ?? arvore.chao) + 1.7
  cenas.push({
    nome: '01-copa-contra-o-ceu',
    px,
    py,
    pz,
    voando: true,
    ...olharPara(px, py, pz, arvore.x + 0.5, arvore.y + 1.5, arvore.z + 0.5),
  })
  // COPA DE FORA — a silhueta da árvore inteira contra o céu, de longe. É onde
  // um rasgo entre quads fundidos apareceria como buraco piscando.
  const ox = arvore.x + 9.5
  const oz = arvore.z + 9.5
  cenas.push({
    nome: '02-copa-de-fora',
    px: ox,
    py: arvore.y + 1,
    pz: oz,
    voando: true,
    alvo: [arvore.x + 0.5, arvore.y, arvore.z + 0.5],
    ...olharPara(ox, arvore.y + 1, oz, arvore.x + 0.5, arvore.y, arvore.z + 0.5),
  })
  // CAMPO DE GRAMA — o chão longe da árvore, sem copa no quadro.
  const gx = arvore.x + 18.5
  const gz = arvore.z + 18.5
  cenas.push({
    nome: '03-campo-de-grama',
    px: gx,
    py: ((await chaoEm(gx, gz)) ?? arvore.chao) + 1.6,
    pz: gz,
    voando: true,
    yaw: 0.7,
    pitch: -0.3,
  })
}

const medidas = []
for (const c of cenas) {
  await preparar(c)
  const com = await medir(true, `${c.nome}-diff-com-vento.png`)
  const sem = await medir(false, `${c.nome}-diff-sem-vento.png`)
  await page.evaluate(() => window.__roquecraft.setFx({ wind: true, hand: true }))
  await page.waitForTimeout(700)
  fs.writeFileSync(path.join(OUT, `${c.nome}.png`), await (tela || page).screenshot())
  medidas.push({
    cena: c.nome,
    com,
    sem,
    // O veredito. `provaDeVida` é a pergunta que vem PRIMEIRO: sem vento a cena
    // tem que estar PARADA. Se não estiver, `mexe` não vale nada — não adianta
    // o número com vento estar alto se a cena se mexe sozinha.
    provaDeVida: sem.media < 0.3 && sem.area < 0.8,
    mexe: com.area > 1.5 && com.media > Math.max(sem.media, 0.1) * 4,
  })
}

// ── Preço do vento ────────────────────────────────────────────────────────
// Vento é deslocamento por VÉRTICE, e vértice de planta é uma fração ínfima do
// mundo — a expectativa é custo zero. Expectativa não é medida: aqui ela vira
// número, com a checagem de teto junto (dois lados a 120 fps dão diferença
// zero porque bateram no teto, não porque o efeito é grátis).
const preco = []
for (const c of cenas.slice(0, 2)) {
  await preparar(c)
  const m = await page.evaluate(async () => {
    const rc = window.__roquecraft
    const amostra = async () => {
      await new Promise((r) => setTimeout(r, 1500))
      const a = []
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 170))
        a.push(rc.state.fps)
      }
      return Math.round(a.reduce((s, v) => s + v, 0) / a.length)
    }
    rc.setFx({ wind: true })
    const com = await amostra()
    rc.setFx({ wind: false })
    const sem = await amostra()
    rc.setFx({ wind: true })
    return { com, sem, tri: rc.state.triangles }
  })
  preco.push({
    cena: c.nome,
    ...m,
    custoFps: m.sem - m.com,
    noTeto: m.com >= 118 && m.sem >= 118,
  })
}

// ── Sombra da copa ────────────────────────────────────────────────────────
// Pergunta separada e igualmente concreta: a copa projeta sombra de FOLHA ou
// de caixa? O passe de sombra do three usa um material de profundidade próprio,
// que não conhece o texture array do voxel — se ninguém deu um material de
// profundidade ao bucket recortado, a copa vira um bloco maciço na sombra.
// Três horas do dia, de cima, sem a mão no quadro: se a sombra da copa for um
// RETÂNGULO e não um rendilhado, o passe de profundidade está ignorando o
// recorte da folha.
for (const [nome, tick, alt, dist] of [
  ['04-sombra-manha', 2200, 22, 18],
  ['05-sombra-meio-dia', 6000, 18, 12],
  ['06-sombra-tarde', 9800, 22, 18],
]) {
  await page.evaluate(
    async ({ a, tick, alt, dist }) => {
      const rc = window.__roquecraft
      rc.setTime(tick)
      rc.setFx({ clouds: false, water: true, hand: false, wind: true })
      rc.setFlying(true)
      rc.teleport(a.x + 0.5, a.chao + alt, a.z + dist)
      const dy = a.chao - (a.chao + alt)
      rc.look(Math.atan2(0, -dist), Math.atan2(dy, dist))
      await new Promise((r) => setTimeout(r, 2200))
    },
    { a: arvore, tick, alt, dist },
  )
  fs.writeFileSync(path.join(OUT, `${nome}.png`), await (tela || page).screenshot())
}
await page.evaluate(() => window.__roquecraft.setFx({ hand: true }))

// ── A sombra da folha é RENDILHADA ou é uma CAIXA? ────────────────────────
//
// A floresta natural não responde essa pergunta: numa taiga fechada a luz não
// passa de jeito nenhum, e as duas versões dão a mesma foto (medido: 0,5 de
// diferença média entre os dois builds — nada). A cena tem que ser CONSTRUÍDA:
// um telhado de folha isolado sobre um piso liso, com sol de lado. Aí a
// resposta é a forma da mancha no chão, e não sobra o que interpretar.
//
// O A/B roda NA MESMA SESSÃO (`setFx({sombraFolha})`). Comparar dois builds
// mistura mob que andou e relógio que correu na conta.
const sombra = await (async () => {
  // A cena é construída ALTO, acima da copa: assim não há nada pra limpar. A
  // primeira versão limpava um volume de 21×13×21 antes de construir — 6 mil
  // edições — e o mundo não segurou: a foto saiu com a floresta intacta e a
  // plataforma em lugar nenhum. É a armadilha registrada em 22/08/2026, e eu
  // caí nela de novo. Aqui são 338 edições e o resultado é CONFERIDO.
  const chao = arvore.chao + 24
  const cena = await page.evaluate(
    async ({ a, chao }) => {
      const rc = window.__roquecraft
      const x = a.x
      const z = a.z
      rc.setFlying(true)
      rc.teleport(x + 0.5, chao + 14, z + 17.5)
      const piso = rc.fill(x - 10, chao, z - 10, x + 10, chao, z + 10, 'stone')
      const telhado = rc.fill(x - 3, chao + 4, z - 3, x + 3, chao + 4, z + 3, 'oakLeaves')
      await new Promise((r) => setTimeout(r, 3000))
      // ⚠️ SOL BAIXO, e isso é o ponto da cena inteira.
      //
      // Ao meio-dia esta medida deu ZERO — e por um motivo que não é o
      // material de profundidade: com o sol a pino a sombra do telhado cai
      // exatamente em cima da mancha da LUZ DE CÉU do voxel (a folha tem
      // `filter: 1` e escurece a coluna abaixo dela no mesher). Duas coisas
      // diferentes empilhadas no mesmo retângulo, e nenhuma A/B consegue
      // separá-las ali. Com o sol de lado a sombra do mapa desliza ~7 blocos
      // pro lado e cai em piso de luz cheia: ali só o mapa de sombra escurece,
      // e a forma da mancha responde a pergunta sozinha.
      rc.setTime(1900)
      rc.setFx({ clouds: false, hand: false, wind: false })
      await new Promise((r) => setTimeout(r, 2000))
      // PROVA DE VIDA DA CENA: `fill` devolver um número não prova que o bloco
      // sobreviveu ao remalhamento. Quem responde é o mundo, relido depois.
      return {
        piso,
        telhado,
        pisoVivo: rc.blocoEm(x, chao, z),
        telhadoVivo: rc.blocoEm(x, chao + 4, z),
        onde: { ...rc.state.player },
      }
    },
    { a: arvore, chao },
  )
  if (cena.pisoVivo !== 'stone' || cena.telhadoVivo !== 'oakLeaves') {
    return { erro: 'a cena construída não sobreviveu', cena }
  }
  // Mira no centro do piso, logo abaixo do telhado de folha — é ali que a
  // mancha cai. E confere que o alvo REALMENTE ficou no quadro.
  const mira = await mirar(arvore.x + 0.5, chao + 0.5, arvore.z + 0.5)
  await page.waitForTimeout(1200)
  if (!mira || mira.err > 0.35) return { erro: 'não consegui enquadrar o piso', cena, mira }
  const medir = async (ligada, arquivo) => {
    await page.evaluate((v) => window.__roquecraft.setFx({ sombraFolha: v }), ligada)
    await page.waitForTimeout(1400)
    const buf = await (tela || page).screenshot()
    fs.writeFileSync(path.join(OUT, arquivo), buf)
    const img = PNG.sync.read(buf)
    // Só a metade de cima do quadro (o piso construído); a barra do sistema e
    // o inventário ficam embaixo e não têm nada a ver com sombra.
    let soma = 0
    let n = 0
    const lim = Math.floor(img.height * 0.62) * img.width * 4
    for (let i = 0; i < lim; i += 4) {
      soma += img.data[i] * 0.299 + img.data[i + 1] * 0.587 + img.data[i + 2] * 0.114
      n++
    }
    return { brilho: +(soma / n).toFixed(2), img }
  }
  // O RECIBO do enxerto, antes de qualquer foto. `String.replace` com alvo
  // ausente não avisa: sem esta leitura, "não vi diferença" seria indistinguível
  // de "o código não rodou".
  const enxerto = await page.evaluate(() => window.__roquecraft.inspect()?.shadow?.folha ?? null)
  const caixa = await medir(false, '07-sombra-de-caixa.png')
  const recorte = await medir(true, '08-sombra-rendilhada.png')
  salvarDiff(caixa.img, recorte.img, '09-sombra-diff.png')
  const d = diferenca(caixa.img, recorte.img)

  // O PREÇO. O passe de sombra passou a amostrar textura e descartar pixel, e
  // isso não é de graça em lugar nenhum. Medido numa cena de floresta cheia,
  // que é onde o bucket recortado é grande.
  await preparar(cenas[1])
  const custo = await page.evaluate(async () => {
    const rc = window.__roquecraft
    const amostra = async () => {
      await new Promise((r) => setTimeout(r, 1500))
      const a = []
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 170))
        a.push(rc.state.fps)
      }
      return Math.round(a.reduce((s, v) => s + v, 0) / a.length)
    }
    rc.setFx({ sombraFolha: true })
    const com = await amostra()
    rc.setFx({ sombraFolha: false })
    const sem = await amostra()
    rc.setFx({ sombraFolha: true })
    return { com, sem, custoFps: sem - com, noTeto: com >= 118 && sem >= 118 }
  })
  return {
    cena,
    mira,
    enxerto,
    brilhoCaixa: caixa.brilho,
    brilhoRecorte: recorte.brilho,
    // Rendilhado deixa passar luz: o piso TEM que ficar mais claro. Se os dois
    // brilhos forem iguais, o material de profundidade não está sendo usado.
    passouLuz: recorte.brilho > caixa.brilho + 0.5,
    diff: d,
    custo,
  }
})()

console.log(
  JSON.stringify(
    {
      saida: OUT,
      perfil: PERFIL,
      arvore,
      medidas,
      preco,
      sombra,
      erros,
      veredito: {
        // A sonda enxerga? (sem vento, cena parada em TODAS as cenas)
        enxerga: medidas.every((m) => m.provaDeVida),
        copaMexe: medidas.find((m) => m.cena === '01-copa-contra-o-ceu')?.mexe === true,
        gramaMexe: medidas.find((m) => m.cena === '03-campo-de-grama')?.mexe === true,
        sombraRendilhada: sombra.passouLuz === true,
      },
    },
    null,
    2,
  ),
)
await b.close()
s.close()
