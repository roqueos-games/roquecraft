// QA DE COLISÃO EM TODAS AS DIREÇÕES — RoqueCraft.
//
// Relato do founder em 2026-08-22: "você validou a construção dos blocos indo
// pra frente, mas para os lados e para trás os blocos estão com faces vazias e
// sem textura e colisão, dando para entrar dentro nas montanhas".
//
// Ele está certo sobre o método: TODO print que eu tirei até agora olhava numa
// direção só. Um defeito que depende do eixo — e existem vários assim num
// mesher (a tabela FACES tem seis entradas, cada uma com seu `flip`) — passa
// direto por um harness que sempre aponta a câmera pro mesmo lado.
//
// Este harness ANDA CONTRA A MONTANHA nas quatro direções cardeais, com input
// de verdade (`press`), e mede três coisas por direção:
//
//  1. PENETROU? A posição final está dentro de bloco sólido. É o defeito que
//     ele descreveu, e é objetivo: ou o bloco sob a caixa do jogador é sólido
//     ou não é.
//  2. PAROU? Andar contra a montanha tem que barrar. Se o jogador percorreu a
//     distância inteira, ou ele atravessou ou não havia montanha ali.
//  3. A PAREDE TEM FACE? Print por direção, e a conta de quantos pixels do
//     quadro são céu. Parede sem face vira buraco: o céu aparece onde tinha
//     que ter pedra.
//
// Uso: node scripts/qa-roquecraft-colisao.mjs [tag]  (exige dist/pwa)
// Saída: scripts/.qa-colisao/*.png + report.json (gitignored)
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const { PNG } = createRequire(import.meta.url)('pngjs')

const DIST = path.resolve('dist/pwa')
const TAG = process.argv[2] || 'colisao'
const OUT = path.resolve('scripts/.qa-colisao')
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
}
const server = http.createServer((req, res) => {
  const p = decodeURIComponent((req.url || '/').split('?')[0])
  let fp = path.join(DIST, p)
  try {
    if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) fp = shellDoApp(DIST)
  } catch {
    fp = shellDoApp(DIST)
  }
  res.setHeader('Content-Type', T[path.extname(fp)] || 'application/octet-stream')
  fs.createReadStream(fp).pipe(res)
})
const SEED = `window.__ROS_E2E__ = { auth:{uid:'e2e-uid',email:'e2e@roqueos.test',emailVerified:true,displayName:'E2E',role:'user'}, googleDrive:{isConnected:false,files:[],user:{}}, googleMapsApiKey:'', roquecraftSeed: 20260819 }`
const SEM_HUD = `.ros-roquecraft__play,.rc-hud,.ros-roquecraft__vignette,.ros-roquecraft__hurt,.ros-roquecraft__espera{display:none!important}`

await new Promise((r) => server.listen(0, r))
const base = `http://localhost:${server.address().port}`
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
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
page.on('console', (m) => {
  const t = m.text()
  if (/Shader Error|not compiled|INVALID_OPERATION: useProgram/i.test(t))
    errors.push(`SHADER ${t.slice(0, 400)}`)
})
await page.addInitScript(SEED)
await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => !!window.__rosStore, null, { timeout: 30000 })
await page.waitForTimeout(1200)
await page.evaluate(() => window.__rosStore.openWindow('roquecraft'))
await page.waitForFunction(() => window.__roquecraft?.state?.ready === true, null, {
  timeout: 90000,
})
await page.addStyleTag({ content: SEM_HUD })

// ── ACHAR UMA MONTANHA COM ENCOSTA NOS QUATRO LADOS ────────────────────────
// Não adianta testar contra qualquer parede: se por acaso não houver bloco
// naquela direção, "não parou" é a resposta certa e o teste vira ruído. O
// harness procura um pico com desnível em volta e mede a partir do cume.
const alvo = await page.evaluate(async () => {
  const rc = window.__roquecraft
  rc.setTime(6000)
  rc.teleport(0, 110, 0)
  await rc.waitChunks(6)
  let melhor = null
  for (let x = -120; x <= 120; x += 8) {
    for (let z = -120; z <= 120; z += 8) {
      const h = rc.surfaceAt(x, z)
      if (!Number.isFinite(h)) continue
      // desnível médio contra os quatro vizinhos a 6 blocos
      const viz = [
        rc.surfaceAt(x + 6, z),
        rc.surfaceAt(x - 6, z),
        rc.surfaceAt(x, z + 6),
        rc.surfaceAt(x, z - 6),
      ].filter(Number.isFinite)
      if (viz.length < 4) continue
      const subida = viz.reduce((a, v) => a + Math.max(0, h - v), 0)
      // quer um pico: alto E cercado por terreno mais baixo dos quatro lados
      const cercado = viz.every((v) => h - v >= 4)
      if (cercado && (!melhor || subida > melhor.subida)) melhor = { x, z, h, subida, viz }
    }
  }
  return melhor
})

if (!alvo) {
  console.log(JSON.stringify({ erro: 'nenhuma montanha encontrada na semente' }))
  process.exit(1)
}

// ── ANDAR CONTRA A ENCOSTA NAS QUATRO DIREÇÕES ─────────────────────────────
// O jogador nasce ABAIXO do pico, num dos lados, e anda pra dentro dele.
const DIRECOES = [
  { nome: 'norte', yaw: 0, dx: 0, dz: -1 },
  { nome: 'leste', yaw: Math.PI / 2, dx: 1, dz: 0 },
  { nome: 'sul', yaw: Math.PI, dx: 0, dz: 1 },
  { nome: 'oeste', yaw: -Math.PI / 2, dx: -1, dz: 0 },
]

const resultados = []
for (const d of DIRECOES) {
  const r = await page.evaluate(
    async ({ alvo, d }) => {
      const rc = window.__roquecraft
      // parte de 10 blocos ANTES do pico, na direção oposta à caminhada
      const px = alvo.x - d.dx * 10
      const pz = alvo.z - d.dz * 10
      const solo = rc.surfaceAt(px, pz)
      rc.teleport(px + 0.5, (Number.isFinite(solo) ? solo : 70) + 1, pz + 0.5)
      await rc.waitChunks(4)
      rc.setFlying(false)
      rc.look(d.yaw, -0.05)
      await new Promise((r) => setTimeout(r, 900))
      const inicio = { ...rc.state.player }

      // ANDA DE VERDADE por 4 segundos, correndo (o pior caso pra colisão)
      rc.press('forward', true)
      rc.press('sprint', true)
      await new Promise((r) => setTimeout(r, 4000))
      rc.press('forward', false)
      rc.press('sprint', false)
      await new Promise((r) => setTimeout(r, 400))

      const fim = { ...rc.state.player }
      // DENTRO DA PEDRA? Testa a coluna do corpo inteiro, não só os pés.
      const bx = Math.floor(fim.x)
      const bz = Math.floor(fim.z)
      const dentro = []
      for (const dy of [0.1, 0.9, 1.7]) {
        const by = Math.floor(fim.y + dy)
        if (rc.solidoEm && rc.solidoEm(bx, by, bz)) dentro.push(dy)
      }
      const andou = Math.hypot(fim.x - inicio.x, fim.z - inicio.z)
      return {
        dir: d.nome,
        inicio: { x: +inicio.x.toFixed(2), y: +inicio.y.toFixed(2), z: +inicio.z.toFixed(2) },
        fim: { x: +fim.x.toFixed(2), y: +fim.y.toFixed(2), z: +fim.z.toFixed(2) },
        andou: +andou.toFixed(2),
        dentroDaPedra: dentro,
        superficieAqui: rc.surfaceAt(fim.x, fim.z),
      }
    },
    { alvo, d },
  )
  await page.waitForTimeout(500)
  await page
    .locator('canvas')
    .first()
    .screenshot({ path: path.join(OUT, `${d.nome}-${TAG}.png`) })
  // fração de CÉU no quadro: parede sem face vira buraco, e buraco mostra céu
  const png = PNG.sync.read(fs.readFileSync(path.join(OUT, `${d.nome}-${TAG}.png`)))
  let ceu = 0
  let n = 0
  for (let y = Math.round(png.height * 0.45); y < png.height * 0.95; y += 2)
    for (let x = 0; x < png.width; x += 2) {
      const p = (y * png.width + x) * 4
      const [R, G, B] = [png.data[p], png.data[p + 1], png.data[p + 2]]
      // céu: azul claro dominante e muito brilhante
      if (B > 170 && B > R + 6 && B >= G) ceu++
      n++
    }
  r.ceuNaMetadeDeBaixo = +(ceu / n).toFixed(3)
  resultados.push(r)
}

// ── A PAREDE DE VERDADE ────────────────────────────────────────────────────
//
// ⚠️ O TESTE ANTIGO DE "BARROU" NAO MEDIA O QUE DIZIA, e ficou vermelho por
// dias sem que ninguem soubesse se era defeito.
//
// Ele andava contra uma ENCOSTA (um pico com 4 blocos de desnivel a 6 de
// distancia) e acusava se o jogador cobrisse os 10 blocos. So que encosta nao e
// parede: uma rampa de 4 em 6 se SOBE, e subir os 10 blocos e o comportamento
// certo. Pior, o jogador as vezes caia numa ravina no caminho e cobria a
// distancia CAINDO -- a medida dizia "atravessou a pedra" e o proprio relatorio
// mostrava `dentroDaPedra: []`, ou seja, ele nunca entrou em pedra nenhuma.
//
// Instrumento que acusa sem defeito ensina a ser ignorado. Agora a parede e
// CONSTRUIDA: cinco blocos de largura, tres de altura (mais que a cabeca, mais
// que o passo automatico), no caminho, em terreno achatado de proposito. Ou o
// jogador para nela, ou o jogo tem um defeito de colisao -- nao ha terceira
// leitura.
const PAREDE = await page.evaluate(async () => {
  const rc = window.__roquecraft
  const x0 = 300
  const z0 = 300
  // ⚠️ CHUNK PRIMEIRO, EDICAO DEPOIS. `fill` escreve num mundo que ainda nao
  // existe se o chunk nao estiver carregado -- e a primeira versao disto
  // construiu a parede no vazio, longe do chao de verdade (o jogador foi parar
  // 18 blocos abaixo do `solo` que eu tinha chutado). A guarda `ergueu` pegou.
  rc.teleport(x0 + 0.5, 120, z0 + 0.5)
  await rc.waitChunks(4)
  const chao = rc.surfaceAt(x0, z0)
  const solo = Number.isFinite(chao) ? chao : 70
  // Achata um corredor: sem isto o relevo natural vira rampa e a medida
  // volta a ser ambigua -- que foi exatamente o defeito do teste antigo.
  rc.fill(x0 - 3, solo, z0 - 8, x0 + 3, solo + 8, z0 + 4, 'air')
  rc.fill(x0 - 3, solo - 2, z0 - 8, x0 + 3, solo - 1, z0 + 4, 'stone')
  // A parede: 3 de altura, atravessando o corredor.
  rc.fill(x0 - 3, solo, z0 - 4, x0 + 3, solo + 2, z0 - 4, 'stone')
  await new Promise((r) => setTimeout(r, 900))
  // ⚠️ O JOGADOR PODE ESTAR MORTO AQUI. As quatro caminhadas contra a encosta
  // rodaram antes, e uma queda numa ravina mata. Com o jogador morto o laco de
  // jogo nao anda, o andar nao acontece, e "nao atravessou a parede" viraria
  // verdade pelo motivo errado -- um verde vazio.
  if (rc.state.health <= 0) rc.renascer()
  await new Promise((r) => setTimeout(r, 600))
  rc.teleport(x0 + 0.5, solo + 0.2, z0 + 0.5)
  rc.setFlying(false)
  await new Promise((r) => setTimeout(r, 1200))

  // A parede EXISTE? Sem esta pergunta, um `fill` que falhasse daria "parou"
  // por nao haver nada -- e o teste passaria pelo motivo errado.
  const ergueu = [0, 1, 2].every((dy) => !!rc.solidoEm(x0, solo + dy, z0 - 4))
  const inicio = { ...rc.state.player }
  rc.look(0, -0.05) // olhando pro -z, contra a parede
  rc.press('forward', true)
  rc.press('sprint', true)
  await new Promise((r) => setTimeout(r, 3000))
  rc.press('forward', false)
  rc.press('sprint', false)
  await new Promise((r) => setTimeout(r, 400))
  const fim = { ...rc.state.player }
  return {
    ergueu,
    vida: rc.state.health,
    inicio: { x: +inicio.x.toFixed(2), y: +inicio.y.toFixed(2), z: +inicio.z.toFixed(2) },
    fim: { x: +fim.x.toFixed(2), y: +fim.y.toFixed(2), z: +fim.z.toFixed(2) },
    // A parede esta em z0-4; o corpo tem 0,3 de meia-largura. Parar em z0-3,x
    // e o esperado; passar de z0-4 e atravessar.
    zDaParede: z0 - 4,
    atravessou: fim.z < z0 - 4,
    andou: +(inicio.z - fim.z).toFixed(2),
    // ⚠️ SEM ISTO O TESTE PASSA DE GRACA. Um jogador que nao anda nunca
    // atravessa parede nenhuma -- e um verde assim nao afirma nada sobre
    // colisao. Ele TEM que chegar na parede pra que parar nela signifique algo.
    chegouNaParede: inicio.z - fim.z > 3,
  }
})

const penetrou = resultados.filter((r) => r.dentroDaPedra.length)
// Buraco de parede: metade de baixo do quadro cheia de céu enquanto o jogador
// está encostado na encosta.
const buraco = resultados.filter((r) => r.ceuNaMetadeDeBaixo > 0.35)

const veredito = {
  penetracao: penetrou.length
    ? `DENTRO DA PEDRA em ${penetrou.map((r) => r.dir).join(', ')}`
    : 'OK',
  barrou: !PAREDE.ergueu
    ? 'INCONCLUSIVO: a parede de teste nao foi erguida'
    : !PAREDE.chegouNaParede
      ? `INCONCLUSIVO: o jogador nao andou (${PAREDE.andou} blocos) -- parar nao prova nada`
      : PAREDE.atravessou
        ? `ATRAVESSOU a parede construida (parou em z=${PAREDE.fim.z}, parede em z=${PAREDE.zDaParede})`
        : 'OK',
  faces: buraco.length ? `BURACO DE PAREDE em ${buraco.map((r) => r.dir).join(', ')}` : 'OK',
  console: errors.length ? `${errors.length} ERRO(S)` : 'OK',
}
const report = { tag: TAG, alvo, resultados, parede: PAREDE, veredito, errors: errors.slice(0, 5) }
fs.writeFileSync(path.join(OUT, `report-${TAG}.json`), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))

await ctx.close()
await browser.close()
server.close()
process.exit(Object.values(veredito).every((v) => v === 'OK') ? 0 : 1)
