//
// QA DA FORMA DA CAMA — ela tem direção, tem pés, e tem vão embaixo?
//
// A sonda da rodada 8 (`qa-roquecraft-cama.mjs`) mede o que a cama FAZ: encaixa
// inteira, recusa de dia, pula a noite, grava o renascimento, vai inteira ao
// quebrar. Nada disso diz nada sobre como ela é. Esta aqui mede a FORMA.
//
// Cinco perguntas, e três delas só a foto responde — todas com controle:
//
//  1. TEM DIREÇÃO — colocar a cama olhando pros quatro lados tem que dar
//     quatro pares de id DIFERENTES. Com dois ids só, os quatro dão o mesmo
//     par, e é isso que faz o travesseiro apontar pro lado errado.
//  2. O TAMPO GIRA — a foto de cima de uma cama norte-sul e de uma leste-oeste
//     não podem ser a mesma imagem girada por acaso: a textura tem que
//     acompanhar. Medido pela DIFERENÇA entre as duas fotos.
//  3. TEM VÃO EMBAIXO — de rasante, contra o céu, dá pra ver o chão por baixo
//     do colchão, entre os pés. Bloco maciço não deixa. Medido por diferença
//     contra a mesma cena sem cama.
//  4. A PONTA É DIFERENTE DA LATERAL — a face de fora da cabeceira não pode
//     ser a mesma imagem da face longa.
//  5. A ALTURA CONTINUA 9/16 — o colchão sobe, mas a caixa de colisão é a do
//     original, e o jogador continua subindo nela com um passo.
//
//   node scripts/qa-roquecraft-cama-forma.mjs [semente]
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
const OUT = path.resolve('scripts/.qa-cama-forma')
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

const b = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const ctx = await b.newContext({
  viewport: { width: 1280, height: 720 },
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
await page.evaluate(async () => {
  window.__roquecraft.setQuality('ultra')
  await new Promise((r) => setTimeout(r, 3000))
  window.__rosStore?.maximizeWindow?.('roquecraft')
  await new Promise((r) => setTimeout(r, 900))
})
await page.addStyleTag({ content: '.ros-roquecraft__play { display: none !important }' })
await page.waitForTimeout(600)

const mirar = criarMirar(page)

const Y = await page.evaluate(async () => {
  const rc = window.__roquecraft
  const y = Math.round(rc.surfaceAt(0, 0) ?? 66) + 24
  rc.setFlying(true)
  rc.teleport(0.5, y + 4, 10.5)
  rc.fill(-10, y, -10, 10, y, 10, 'stone')
  await new Promise((r) => setTimeout(r, 2500))
  rc.setFx({ hand: false, clouds: false })
  rc.setTime(6000)
  return y
})

// ── 1. TEM DIREÇÃO ───────────────────────────────────────────────────────
//
// Quatro camas, colocadas por CLIQUE de quatro pontos de vista diferentes. O
// clique é obrigatório: `fill` escreve o id que eu mandar, e mediria a minha
// escolha em vez do encaixe.
const CANTOS = [
  { nome: 'olhandoNz', de: [0.5, 3], alvo: [0, 0] },
  { nome: 'olhandoPz', de: [0.5, -3], alvo: [0, 0] },
  { nome: 'olhandoNx', de: [3, 0.5], alvo: [0, 0] },
  { nome: 'olhandoPx', de: [-3, 0.5], alvo: [0, 0] },
]
const direcoes = []
for (let i = 0; i < CANTOS.length; i++) {
  const c = CANTOS[i]
  const z0 = -6 + i * 4 // cada cama num corredor próprio
  await page.evaluate(
    async ([y, de, z0]) => {
      const rc = window.__roquecraft
      // ⚠️ NADA de `setMode` aqui. Ele recria o inventário do criativo, que
      // enche a hotbar inteira — e `slotOf` só procura nos nove primeiros
      // slots. O `give` então caía fora da hotbar, `slotOf` devolvia −1,
      // `selectSlot(-1)` deixava a mão como estava, e a sonda colocou GRAMA
      // quatro vezes achando que colocava cama.
      rc.give('bed', 4)
      const slot = rc.slotOf('bed')
      rc.selectSlot(slot)
      rc.setFlying(true)
      rc.fill(-4, y + 1, z0 - 1, 4, y + 2, z0 + 1, 'air')
      rc.teleport(de[0], y + 2.6, z0 + de[1])
      await new Promise((r) => setTimeout(r, 900))
      return slot
    },
    [Y, c.de, z0],
  )
  await mirar(0.5, Y + 1, z0 + 0.5)
  await page.waitForTimeout(350)
  const posto = await page.evaluate(
    async ([y, z0]) => {
      const rc = window.__roquecraft
      const naMao = rc.slotOf('bed')
      const ok = rc.place()
      await new Promise((r) => setTimeout(r, 600))
      // Lê as nove células em volta: a cama ocupa duas, e quais duas depende da
      // direção — ler só uma não distingue nada.
      const volta = {}
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const k = rc.blocoEm(dx, y + 1, z0 + dz)
          if (k !== 'air') volta[`${dx},${dz}`] = k
        }
      }
      return { volta, naMao, ok }
    },
    [Y, z0],
  )
  if (posto.naMao < 0)
    erros.push(`cama fora da hotbar em ${c.nome} — a sonda colocaria outra coisa`)
  direcoes.push({ nome: c.nome, z0, ...posto })
}

// Assinatura de cada colocação: quais células, com quais ids. Se as quatro
// derem a MESMA assinatura de id, a cama não tem direção.
const assinaturas = direcoes.map((d) => Object.values(d.volta).sort().join('|'))
const idsDistintos = new Set(assinaturas).size

// ── 2. O TAMPO GIRA ──────────────────────────────────────────────────────
//
// UMA metade só, na MESMA célula, fotografada de cima da MESMA câmera — uma vez
// deitada num sentido, outra no outro.
//
// A primeira versão fotografava duas CAMAS INTEIRAS em corredores diferentes e
// comparava. Deu 46 mil pixels de diferença e aprovou — só que as duas fotos
// eram de cenas diferentes, então elas diferiam de qualquer jeito, com giro ou
// sem. Passaria com o jogo exatamente como está.
//
// Com uma metade só na mesma célula, a silhueta é a mesma quadrado nas duas: a
// ÚNICA coisa que pode diferir é a textura. Se ela não gira, as duas fotos são
// idênticas — e zero diferença é uma resposta, não um empate.
async function fotoDoTampo(chave, arquivo) {
  await page.evaluate(
    async ([y, chave]) => {
      const rc = window.__roquecraft
      rc.fill(-2, y + 1, -2, 2, y + 1, 2, 'air')
      await new Promise((r) => setTimeout(r, 400))
      rc.fill(0, y + 1, 0, 0, y + 1, 0, chave)
      rc.setFlying(true)
      // ⚠️ DE CIMA E DE LADO, não a prumo. Mirar direto pra baixo é o caso
      // degenerado da mira: com o alvo no eixo, girar não move o alvo na tela,
      // a derivada é zero e a malha fechada desiste — a câmera ficou no
      // horizonte e as duas fotos saíram do CÉU, com 64 pixels de diferença
      // entre si. Dois blocos de deslocamento resolvem e ainda mostram o tampo
      // inteiro.
      rc.teleport(2.5, y + 4.5, 2.5)
      await new Promise((r) => setTimeout(r, 900))
    },
    [Y, chave],
  )
  const mira = await mirar(0.5, Y + 1.56, 0.5)
  if (!mira || mira.err > 0.05) erros.push(`mira ruim na foto ${arquivo}: err=${mira?.err}`)
  await page.waitForTimeout(500)
  const foto = await page.screenshot()
  fs.writeFileSync(path.join(OUT, arquivo), foto)
  return foto
}
// As duas variantes de cabeceira que apontam pra eixos diferentes. Enquanto
// existir só um id, as duas chamadas escrevem o MESMO bloco — e é isso que a
// medição de hoje registra.
const VARIANTE_A = 'bedHead'
const VARIANTE_B = 'bedHeadPx'
// ⚠️ A CÉLULA VAZIA É A RÉGUA. Comparar as duas fotos direto não diz nada: elas
// têm céu, terreno e plataforma em comum, e o tampo é um punhado de pixels no
// meio disso. Duas tentativas de classificar por cor mediram o CÉU e deram as
// duas fotos como iguais. Com a foto da célula vazia dá pra saber exatamente
// quais pixels são a cama — e só então perguntar se ELES mudaram.
const tampoVazio = await fotoDoTampo('air', '00-tampo-sem-cama.png')
const tampoA = await fotoDoTampo(VARIANTE_A, '01-tampo-eixo-z.png')
const tampoB = await fotoDoTampo(VARIANTE_B, '02-tampo-eixo-x.png')
const existeVarianteB = await page.evaluate(
  async ([y]) => {
    const rc = window.__roquecraft
    return rc.blocoEm(0, y + 1, 0)
  },
  [Y],
)

// ── 2b. O TRAVESSEIRO FICA NA CABECEIRA, NÃO NO MEIO ─────────────────────
//
// Uma cama INTEIRA, vista de cima. Os pixels claros (o linho) têm que estar
// numa PONTA do móvel, não no meio dele.
//
// Isto é o que pega a inversão de eixo do tampo: o `v` do bloco é o inverso do
// `y` da imagem, e desenhar o travesseiro no lado errado da textura o joga
// exatamente pra junção das duas metades. O móvel fica com uma faixa branca no
// meio, como se a cama tivesse um cinto.
//
// A medida não usa projeção nenhuma: acha o eixo LONGO da mancha da cama e
// pergunta onde, ao longo dele, está o centro de massa do claro. Perto de 0 ou
// de 1 é ponta; perto de 0,5 é meio.
await page.evaluate(async (y) => {
  const rc = window.__roquecraft
  rc.fill(-3, y + 1, -3, 3, y + 1, 3, 'air')
  await new Promise((r) => setTimeout(r, 400))
  rc.setFlying(true)
  rc.teleport(3.5, y + 4.5, 3.5)
  await new Promise((r) => setTimeout(r, 900))
}, Y)
await mirar(0.5, Y + 1.56, 0.0)
await page.waitForTimeout(500)
const camaVazia = await page.screenshot()
fs.writeFileSync(path.join(OUT, '05-inteira-sem.png'), camaVazia)
await page.evaluate(async (y) => {
  const rc = window.__roquecraft
  // Cabeceira no −Z, pé no 0 apontando pro +Z: a cama do encaixe real.
  rc.fill(0, y + 1, -1, 0, y + 1, -1, 'bedHead')
  rc.fill(0, y + 1, 0, 0, y + 1, 0, 'bedPz')
  await new Promise((r) => setTimeout(r, 900))
}, Y)
const camaInteira = await page.screenshot()
fs.writeFileSync(path.join(OUT, '06-inteira-com.png'), camaInteira)

// ── 3. TEM VÃO EMBAIXO ───────────────────────────────────────────────────
//
// Rasante, contra o céu. A cama fica na PONTA de um dedo de pedra, com o resto
// do mundo abaixo do horizonte da câmera: assim o que está atrás da cama é céu,
// e o vão entre os pés aparece como céu ATRAVESSANDO a silhueta.
const RASANTE_Z = 14
await page.evaluate(
  async ([y, z]) => {
    const rc = window.__roquecraft
    // Dedo de pedra de duas células, saindo da plataforma.
    rc.fill(0, y, z, 0, y, z + 1, 'stone')
    rc.setFlying(true)
    // ⚠️ ABAIXO da cama, olhando PRA CIMA. Na horizontal, o fundo é o terreno
    // lá longe — e aí o "buraco na silhueta" mostra terreno, que muda de cor
    // entre as duas fotos por causa da luz e vira ruído. Olhando pra cima o
    // fundo é céu liso, e buraco é buraco.
    rc.teleport(7.5, y - 0.9, z + 0.5)
    await new Promise((r) => setTimeout(r, 1200))
  },
  [Y, RASANTE_Z],
)
await mirar(0.5, Y + 1.35, RASANTE_Z + 0.5)
await page.waitForTimeout(500)
const semCama = await page.screenshot()
fs.writeFileSync(path.join(OUT, '03-rasante-sem-cama.png'), semCama)
const rasante = await page.evaluate(
  async ([y, z]) => {
    const rc = window.__roquecraft
    rc.fill(0, y + 1, z, 0, y + 1, z, 'bed')
    rc.fill(0, y + 1, z + 1, 0, y + 1, z + 1, 'bedHead')
    await new Promise((r) => setTimeout(r, 900))
    return { pe: rc.blocoEm(0, y + 1, z), cabeceira: rc.blocoEm(0, y + 1, z + 1) }
  },
  [Y, RASANTE_Z],
)
const comCama = await page.screenshot()
fs.writeFileSync(path.join(OUT, '04-rasante-com-cama.png'), comCama)

// ── Medições ─────────────────────────────────────────────────────────────

/**
 * A SILHUETA da cama contra o céu, coluna a coluna: onde ela começa, onde
 * acaba, e quantos buracos de céu existem DENTRO dela.
 *
 * É o buraco que responde a pergunta. Um bloco maciço dá uma silhueta cheia;
 * uma cama de verdade dá céu entre os pés. Contar pixel mudado não serve — os
 * dois mudam o mesmo tanto de tela.
 */
/**
 * A cama AFINA embaixo. Um bloco maciço, não.
 *
 * Três medições foram descartadas antes desta, e as três pela mesma razão:
 * tentavam achar "buraco" numa faixa escolhida a dedo. Faixa por coluna nunca
 * chegava na altura dos pés (a coluna entre eles acaba no fundo do colchão);
 * faixa global por mínimo e máximo ia parar 80 px abaixo da cama, puxada por
 * ruído, e aí TUDO era vazado.
 *
 * O que separa cama de bloco não precisa de faixa nenhuma: é o PERFIL. Linha a
 * linha, quantos pixels da silhueta existem. Num bloco maciço todas as linhas
 * têm a mesma largura; numa cama, as linhas de baixo têm só os dois pés. A
 * razão entre a linha mais estreita e a mais larga responde sozinha.
 */
function silhuetaComBuracos(semCama, comCama) {
  const a = PNG.sync.read(semCama)
  const d = PNG.sync.read(comCama)
  const mudou = (x, y) => {
    const i = (d.width * y + x) << 2
    return (
      Math.abs(d.data[i] - a.data[i]) +
        Math.abs(d.data[i + 1] - a.data[i + 1]) +
        Math.abs(d.data[i + 2] - a.data[i + 2]) >=
      90
    )
  }
  const perfil = []
  for (let y = 0; y < d.height; y++) {
    let n = 0
    for (let x = 0; x < d.width; x++) if (mudou(x, y)) n++
    perfil.push(n)
  }
  const larga = Math.max(...perfil)
  if (larga < 30) return { larga, linhas: 0, estreitamento: null }
  // As linhas DA CAMA: as que têm pelo menos 8% da largura máxima. Abaixo disso
  // é reflexo solto, e é o que puxava as medidas anteriores pro brejo.
  const daCama = perfil.filter((n) => n >= larga * 0.08)
  const estreita = Math.min(...daCama)
  return {
    linhas: daCama.length,
    larga,
    estreita,
    // Perto de 1 = caixa. Perto de 0,15 = colchão sobre dois pés.
    estreitamento: +(estreita / larga).toFixed(3),
  }
}

/**
 * Dos pixels que SÃO a cama, quantos mudaram ao girá-la?
 *
 * `daCama` vem da foto da célula VAZIA; `giraram`, da comparação entre as duas
 * orientações. A fração é o sinal: textura que não gira dá zero; textura que
 * gira 90° troca metade do tampo.
 *
 * Comparar as duas fotos direto não diz nada — elas têm céu, terreno e
 * plataforma em comum, e o tampo é um punhado de pixels no meio disso.
 */
function giroNoTampo(vazio, a, b) {
  const V = PNG.sync.read(vazio)
  const A = PNG.sync.read(a)
  const B = PNG.sync.read(b)
  const forte = (p, q, i) =>
    Math.abs(p.data[i] - q.data[i]) +
      Math.abs(p.data[i + 1] - q.data[i + 1]) +
      Math.abs(p.data[i + 2] - q.data[i + 2]) >=
    40
  let daCama = 0
  let giraram = 0
  for (let i = 0; i < A.data.length; i += 4) {
    if (!forte(V, A, i)) continue
    daCama++
    if (forte(A, B, i)) giraram++
  }
  return { daCama, giraram, fracao: daCama ? +(giraram / daCama).toFixed(3) : 0 }
}
const giroDoTampo = giroNoTampo(tampoVazio, tampoA, tampoB)
const vao = silhuetaComBuracos(semCama, comCama)

/**
 * Onde está o TRAVESSEIRO ao longo da cama?
 *
 * Sem projeção: a mancha da cama tem um eixo longo; o centro de massa dos
 * pixels claros é projetado nele e normalizado. 0 e 1 são as pontas, 0,5 é a
 * junção das duas metades.
 */
function ondeEstaOTravesseiro(sem, com) {
  const a = PNG.sync.read(sem)
  const d = PNG.sync.read(com)
  const pts = []
  const claros = []
  // ⚠️ SÓ A JANELA CENTRAL, onde a câmera mira a cama. Na foto inteira entram
  // as árvores da taiga ao fundo, que balançam entre as duas fotos: 6.244
  // pixels "mudados" num retângulo de 240..870 × 99..424, com o centro de
  // massa do claro puxado para o canto — e a sonda dizia que o travesseiro
  // estava no meio de uma cama que o tinha na ponta (18/09/2026, primeira
  // rodada com veredito). Na janela: 6.206 pixels, todos na cama, posição 0,74.
  const x0 = Math.floor(d.width * 0.25)
  const x1 = Math.floor(d.width * 0.75)
  const y0 = Math.floor(d.height * 0.3)
  const y1 = Math.floor(d.height * 0.85)
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (d.width * y + x) << 2
      const dif =
        Math.abs(d.data[i] - a.data[i]) +
        Math.abs(d.data[i + 1] - a.data[i + 1]) +
        Math.abs(d.data[i + 2] - a.data[i + 2])
      // ⚠️ Limiar ALTO: só o que a cama SUBSTITUIU. Pôr a cama também muda a
      // luz da pedra em volta, e pedra clara passa em qualquer teste de "claro
      // e neutro" — foi assim que o travesseiro apareceu no meio da cama numa
      // medição em que ele estava na ponta. Mudança de luz raramente passa de
      // 150; troca de bloco sempre passa.
      if (dif < 150) continue
      pts.push([x, y])
      // Linho: claro e NEUTRO. O colchão é vermelho saturado; a madeira é
      // escura. Só o travesseiro tem os três canais altos e juntos.
      const r = d.data[i]
      const g = d.data[i + 1]
      const b = d.data[i + 2]
      if (r > 150 && g > 135 && b > 120 && r - b < 45) claros.push([x, y])
    }
  }
  if (pts.length < 500 || claros.length < 100) {
    return { pixels: pts.length, claros: claros.length, posicao: null }
  }
  const mx = pts.reduce((s2, p) => s2 + p[0], 0) / pts.length
  const my = pts.reduce((s2, p) => s2 + p[1], 0) / pts.length
  // Eixo longo por covariância — duas linhas, e evita depender da câmera.
  let sxx = 0
  let syy = 0
  let sxy = 0
  for (const [x, y] of pts) {
    sxx += (x - mx) ** 2
    syy += (y - my) ** 2
    sxy += (x - mx) * (y - my)
  }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  const ex = Math.cos(ang)
  const ey = Math.sin(ang)
  const proj = pts.map(([x, y]) => (x - mx) * ex + (y - my) * ey)
  const lo = Math.min(...proj)
  const hi = Math.max(...proj)
  const centroClaro =
    claros.reduce((s2, [x, y]) => s2 + ((x - mx) * ex + (y - my) * ey), 0) / claros.length
  return {
    pixels: pts.length,
    claros: claros.length,
    posicao: +((centroClaro - lo) / (hi - lo)).toFixed(3),
  }
}
const travesseiro = ondeEstaOTravesseiro(camaVazia, camaInteira)

// ── 5. ALTURA E COLISÃO ──────────────────────────────────────────────────
//
// O colchão sobe do chão, mas a caixa de colisão é a do original: 9/16. O
// jogador sobe nela ANDANDO, sem pular. Teleporte provaria posição; só o input
// prova degrau.
const altura = await page.evaluate(async (y) => {
  const rc = window.__roquecraft
  const espera = (ms) => new Promise((r) => setTimeout(r, ms))
  rc.fill(-3, y + 1, -3, 3, y + 1, 3, 'air')
  await espera(400)
  rc.fill(0, y + 1, 0, 0, y + 1, 0, 'bed')
  rc.fill(0, y + 1, -1, 0, y + 1, -1, 'bedHead')
  await espera(600)
  // ⚠️ `setFlying(false)` DEPOIS do teleporte. `teleport` LIGA o voo, e
  // desligar antes não adianta nada — armadilha paga na rodada 8 e paga de
  // novo aqui: o jogador ficou parado no ar e a sonda leu a mesma altura
  // antes e depois. E o ponto de partida é DENTRO da plataforma: caindo fora
  // dela, o jogador foi parar no terreno 30 blocos abaixo.
  rc.teleport(0.5, y + 2, 3.5)
  rc.setFlying(false)
  await espera(1600)
  const antes = rc.state.player.y
  return { antes: +antes.toFixed(3), base: y + 1 }
}, Y)
// ⚠️ MIRAR, não chutar o yaw. A convenção da câmera não é a da física — na
// primeira tentativa o jogador andou pro lado OPOSTO da cama e a sonda leu
// "não subiu". `mirar` mede e confirma por projeção.
await mirar(0.5, Y + 1.2, -0.5)
const andou = await page.evaluate(async (_y) => {
  const rc = window.__roquecraft
  const espera = (ms) => new Promise((r) => setTimeout(r, ms))
  rc.press('forward', true)
  // ⚠️ O PICO, não o y final. Depois de atravessar a cama o jogador DESCE do
  // outro lado, e o y final é o do chão — a travessia inteira fica invisível.
  // Armadilha já paga na rodada 6 com a laje, e paga de novo aqui.
  let pico = rc.state.player.y
  const trilha = []
  for (let i = 0; i < 28; i++) {
    await espera(50)
    const p = rc.state.player
    if (p.y > pico) pico = p.y
    trilha.push([+p.z.toFixed(2), +p.y.toFixed(2)])
  }
  rc.press('forward', false)
  await espera(400)
  return {
    pico: +pico.toFixed(3),
    depois: +rc.state.player.y.toFixed(3),
    z: +rc.state.player.z.toFixed(2),
    trilha: trilha.filter((_, i) => i % 4 === 0),
  }
}, Y)
Object.assign(altura, andou)

// O veredito é um objeto de booleanos: a prosa o imprime, o código de saída o julga.
const veredito = {
  // Quatro direções, quatro pares de id.
  temDirecao: idsDistintos === 4,
  // O tampo gira: a MESMA célula, a MESMA câmera, e mesmo assim as duas
  // fotos diferem. Sem variante que aponte pro outro eixo, as duas
  // chamadas escrevem o mesmo bloco e a diferença é zero.
  // ⚠️ A célula tem que CONTER a variante pedida. Sem esta conferência a
  // foto B era de uma célula VAZIA — `fill` de chave inexistente não
  // escreve nada — e a diferença entre "tem cama" e "não tem nada" passou
  // por "o tampo gira".
  tampoGira:
    existeVarianteB === VARIANTE_B && giroDoTampo.daCama > 800 && giroDoTampo.fracao > 0.25,
  // Céu atravessando a silhueta: pé de cama, não bloco maciço.
  // Metade da largura da cama, na faixa dos pés, tem que ser CÉU. Bloco
  // maciço dá perto de zero; dois pés de 3/16 deixam ~10/16 vazado.
  // A silhueta AFINA embaixo: a linha mais estreita tem menos de metade
  // da mais larga. Bloco maciço fica perto de 1.
  temVaoEmbaixo: vao.estreitamento != null && vao.estreitamento < 0.5,
  // O travesseiro está numa PONTA, não na junção das metades.
  travesseiroNaCabeceira:
    travesseiro.posicao != null && (travesseiro.posicao < 0.3 || travesseiro.posicao > 0.7),
  // E o colchão continua em 9/16: sobe com um passo, sem pulo.
  // Subiu andando, e parou em 9/16 — nem 1/2 (laje) nem 1 (bloco).
  // Subiu ANDANDO e o pé parou em 9/16 — nem 1/2 (laje) nem 1 (bloco).
  alturaDoOriginal:
    altura.antes === altura.base &&
    altura.pico > altura.base + 0.5 &&
    altura.pico < altura.base + 0.62,
}
console.log(
  JSON.stringify(
    {
      saida: OUT,
      y: Y,
      direcoes,
      assinaturas,
      idsDistintos,
      rasante,
      giroDoTampo,
      variantes: { a: VARIANTE_A, b: VARIANTE_B, escritoNaCelula: existeVarianteB },
      vao,
      travesseiro,
      altura,
      erros,
      veredito,
    },
    null,
    2,
  ),
)
await b.close()
s.close()
process.exit(Object.values(veredito).every(Boolean) && erros.length === 0 ? 0 : 1)
