//
// O HALO NA BORDA DA SOMBRA — a régua que separa sombra de silhueta.
//
// Queixa do founder, com print do iPhone: "olha esse contorno claro antes da
// sombra, isso acaba com a aparência da sombra". É o ponto mais antigo da lista
// dele e o único que nunca teve culpado.
//
// ⚠️ E O QUE FALTAVA NÃO ERA SUSPEITO, ERA RÉGUA. A sonda anterior
// (`qa-roquecraft-contorno.mjs`) procura o degrau de luminância mais forte de
// cada linha e chama de borda de sombra. Só que aresta de bloco, silhueta de
// cacto e borda de sombra são TODAS degrau de luminância, e a mais forte da
// linha pode ser qualquer uma. Ela mediu as três e atribuiu tudo à sombra.
//
// A RÉGUA DAQUI usa um par de fotos: mesma câmera, mesmo instante do dia, uma
// COM sombra e uma SEM (`setFx({ sombras })`, adicionado para isto). Onde a
// sombra não age as duas fotos são idênticas pixel a pixel — aresta e silhueta
// se cancelam na subtração. O que sobra é sombra e só sombra.
//
// Daí saem duas medidas independentes:
//
//   1. MAIS CLARO QUE SEM SOMBRA. Sombra só sabe SUBTRAIR luz: em três.js o
//      `shadowMask` multiplica a luz direta por algo em [0,1]. Logo COM sombra
//      nunca pode ser mais claro que SEM sombra. Se existir pixel com A > B,
//      alguém está ACRESCENTANDO luz na borda, e isso não é opinião sobre a
//      foto — é um sinal de sinal trocado.
//
//   2. OVERSHOOT DIFERENCIAL. A borda é localizada pela MÁSCARA (B − A), que só
//      existe onde a sombra age. Nessa mesma coluna mede-se o overshoot (pico
//      colado na borda menos o platô longe dela) nas DUAS fotos, e reporta-se a
//      diferença. Tudo que não vem da sombra aparece igual nas duas e cancela.
//
// ⚠️ E A RÉGUA TEM CONTROLE POSITIVO NA MESMA SESSÃO: `normalBias` alto produz
// peter-panning, que é um halo claro colado na silhueta — um defeito CONHECIDO,
// ligado de propósito. Se a régua não acusar o halo plantado, o verde dela no
// valor de produção não significa nada.
//
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const OUT = path.resolve(
  `scripts/.qa-halo-${process.argv[6] || 'desktop'}-${process.argv[5] || 'desert'}-${process.argv[3] || 'ultra'}-${process.argv[4] || 2300}`,
)
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })

const DIST = path.resolve('dist/pwa')
const SEMENTE = Number(process.argv[2] || 942457)
// ⚠️ E A HORA TAMBÉM ENTRA POR ARGUMENTO, porque a hora do print do founder NÃO
// é esta. O registro de agosto diz 11:03 — sol quase a pino —, e a 34,5° a
// sombra é longa e rasante, geometria completamente diferente. Medir só numa
// hora é medir um instante e concluir sobre o dia.
const TICK = Number(process.argv[4] || 2300)
// ⚠️ E O BIOMA, pelo mesmo motivo. Todas as medidas até aqui foram em AREIA. O
// chão de grama tem outra cor, outro normal map e outra luz de bloco assada na
// malha — concluir "não há linha clara" tendo olhado uma superfície só é
// concluir sobre a areia, não sobre o jogo.
const BIOMA = process.argv[5] || 'desert'
// ⚠️ E A TELA, que era o eixo que eu nunca tinha variado. TODAS as medidas
// anteriores saíram em 1280×720 com pixel ratio 1 — e o print do founder é de
// um iPHONE. O FXAA (que o perfil `medium` liga) trabalha em espaço de TELA, e
// espaço de tela é justamente o que muda com a densidade de pixel. Concluir
// "não há contorno" tendo olhado uma resolução só é concluir sobre aquela tela.
const TELA = process.argv[6] || 'desktop'
const TELAS = {
  desktop: { viewport: { width: 1280, height: 720 }, dpr: 1 },
  // iPhone moderno em pé: 393×852 CSS, 3 pixels físicos por CSS.
  iphone: { viewport: { width: 393, height: 852 }, dpr: 3 },
  // O mesmo iPhone deitado, que é como se joga de verdade.
  'iphone-deitado': { viewport: { width: 852, height: 393 }, dpr: 3 },
}
const ALVO_DE_TELA = TELAS[TELA] || TELAS.desktop
// ⚠️ O PERFIL IMPORTA, e o do founder NÃO é o ultra. Ele joga no iPhone e o
// print dele tem sombra, o que o põe no perfil `medium`: mapa de sombra de
// 1024 contra 2048 e raio 24 contra 34 — texel de sombra 1,4× mais grosso, que
// é exatamente o tipo de diferença capaz de acender borda onde o ultra não
// acende. Medir só no ultra é medir a tela de outra pessoa.
const QUALIDADE = process.argv[3] || 'ultra'

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
  viewport: ALVO_DE_TELA.viewport,
  deviceScaleFactor: ALVO_DE_TELA.dpr,
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
await page.evaluate(async (q) => {
  window.__roquecraft.setQuality(q)
  await new Promise((r) => setTimeout(r, 2500))
  window.__rosStore?.maximizeWindow?.('roquecraft')
  await new Promise((r) => setTimeout(r, 900))
}, QUALIDADE)
// A mira fica no centro exato do canvas, que é a borda de cima do recorte do
// chão — um X branco de alto contraste bem onde a régua procura degrau.
await page.addStyleTag({
  content:
    '.ros-roquecraft__play, .ros-roquecraft__crosshair, .rc-hud { display: none !important }',
})
await page.waitForTimeout(500)

// ── Chegada: bioma aberto, olhando PRO SOL ────────────────────────────────────────
//
// Olhando pro lado oposto ao sol a sombra cai ATRÁS do bloco e não há borda
// nenhuma na tela pra medir — a mesma disciplina das sondas de sombra
// anteriores, e o motivo de a mira ser calculada e não chutada.
const chegada = await page.evaluate(
  async ([tick, bioma]) => {
    const rc = window.__roquecraft
    // Pureza 16: o disco inteiro em volta tem que ser deserto. Sem exigir isso
    // a busca pousa na PRIMEIRA coluna de deserto que acha, que é a beirada, e
    // a foto sai da floresta vizinha. Foi o que aconteceu na primeira rodada
    // desta sonda: HUD escrito "Deserto" e a tela cheia de tronco de árvore.
    const pouso = rc.gotoBiome(bioma, 90, 16)
    if (!pouso) return { erro: `gotoBiome(${bioma}) não achou o bioma` }
    if (!pouso.pureza)
      return { erro: `só achei ${bioma} de beirada — nenhuma cena aberta nesta semente` }
    await rc.waitChunks(6)
    await new Promise((k) => setTimeout(k, 2400))
    rc.setTime(tick)
    const ang = ((tick % 24000) / 24000) * Math.PI * 2
    const sol = { x: Math.cos(ang) * 0.94, y: Math.sin(ang), z: Math.cos(ang) * 0.34 }
    const yaw = Math.atan2(sol.x, -sol.z)
    const quadro = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const p = rc.state.player
    const chao = rc.debug?.groundBelow ?? Math.floor(p.y) - 2
    // ⚠️ SOBE E OLHA PRA BAIXO, e o motivo é geométrico, não estético.
    //
    // Com a câmera quase no nível do chão (pitch −0,05) o solo de 6 a 20 blocos
    // comprime tudo perto do horizonte: a faixa de chão na tela ficou com 55
    // pixeis de altura e a régua teve 27 linhas pra estatística. Um olho 7
    // blocos acima, mirando 10 blocos à frente, abre a mesma faixa em centenas
    // de linhas — e halo é defeito de traço fino, que precisa de amostra.
    rc.teleport(p.x, chao + 7.5, p.z)
    await new Promise((k) => setTimeout(k, 400))
    const alvo = { x: p.x + Math.sin(yaw) * 10, y: chao + 1, z: p.z - Math.cos(yaw) * 10 }
    let melhor = null
    for (let pit = -1.1; pit <= 0.3001; pit += 0.04) {
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
    return {
      x: Math.round(p.x),
      z: Math.round(p.z),
      bioma: rc.state.biome,
      pureza: pouso.pureza,
      pitch: melhor.pit,
    }
  },
  [TICK, BIOMA],
)
if (chegada.erro) {
  console.log(JSON.stringify({ erro: chegada.erro, erros }))
  await ctx.close()
  await b.close()
  servidor.close()
  process.exit(1)
}

// ── O par de fotos ───────────────────────────────────────────────────────────
//
// TUDO que se mexe sozinho fica parado: vento, onda, nuvem e o relógio do dia
// (reescrito antes de cada clique). Duas fotos em que a cena mudou entre os
// cliques não são um par de controle — foi assim que o A/B do reflexo se
// afogou no próprio movimento da água.
//
// O pós-processamento fica DESLIGADO nas duas. Ele já foi inocentado por
// bisseção (sem ele o contorno fica MAIOR), e mantê-lo ligado só acrescenta
// bloom e FXAA à diferença entre A e B, que é justamente o que se quer isolar.
const PARADO = {
  hand: false,
  wind: false,
  clouds: false,
  congelarAgua: true,
  bloom: false,
  fxaa: false,
  ssao: false,
  godRays: false,
}

async function foto(nome, sombras) {
  await page.evaluate(
    async ([parado, sombras, tick]) => {
      const rc = window.__roquecraft
      rc.setFx({ ...parado, sombras })
      rc.setTime(tick)
      await new Promise((r) => setTimeout(r, 900))
      rc.setTime(tick) // o relógio anda entre um clique e outro; reescreve
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    },
    [PARADO, sombras, TICK],
  )
  const buf = await page.screenshot()
  fs.writeFileSync(path.join(OUT, `${nome}.png`), buf)
  return PNG.sync.read(buf)
}

// ⚠️ O RECORTE VEM DO CANVAS, NÃO DE NÚMERO ESCRITO À MÃO.
//
// A primeira rodada usou `{x0:120, x1:1160, y0:400, y1:600}`, herdado da sonda
// anterior. A janela do jogo NÃO ocupa a tela inteira: acima dela tem a barra
// do RoqueOS e a barra de título, abaixo o dock, e à direita o papel de parede
// — que é uma FOTO DE FLORESTA. O recorte fixo passava por dentro do dock e do
// papel de parede, e a régua mediu ícone e wallpaper achando que media sombra.
// É o mesmo erro que a sonda da tocha cometeu com o dock e a hotbar.
const canvas = await page.evaluate(() => {
  const c = document.querySelector('.ros-roquecraft__canvas')
  if (!c) return null
  const r = c.getBoundingClientRect()
  return { x: r.x, y: r.y, w: r.width, h: r.height }
})
if (!canvas || canvas.w < 400 || canvas.h < 300) {
  console.log(
    JSON.stringify({
      erro: `canvas do jogo não encontrado ou pequeno demais: ${JSON.stringify(canvas)}`,
      erros,
    }),
  )
  await ctx.close()
  await b.close()
  servidor.close()
  process.exit(1)
}
// ⚠️ E A FAIXA DO CHÃO É PERGUNTADA AO JOGO, não estimada por fração da tela.
//
// Fração de canvas ainda é chute: na primeira tentativa o topo do recorte caiu
// na LINHA DAS ÁRVORES e o rodapé na hotbar. Aqui a sonda projeta pontos do
// chão a distâncias conhecidas com a câmera do próprio jogo (`projetar`) e usa
// o retângulo que eles ocupam. Se o enquadramento mudar, o recorte muda junto.
const chaoNaTela = await page.evaluate(() => {
  const rc = window.__roquecraft
  const p = rc.state.player
  const yaw = rc.state.yaw
  const y = (rc.debug?.groundBelow ?? Math.floor(p.y) - 2) + 1
  const us = []
  const vs = []
  for (let d = 6; d <= 20; d += 2) {
    for (const lado of [-9, 0, 9]) {
      const x = p.x + Math.sin(yaw) * d + Math.cos(yaw) * lado
      const z = p.z - Math.cos(yaw) * d + Math.sin(yaw) * lado
      const s = rc.projetar(x, y, z)
      if (!s?.frente) continue
      us.push(s.u)
      vs.push(s.v)
    }
  }
  if (us.length < 8) return null
  return { u0: Math.min(...us), u1: Math.max(...us), v0: Math.min(...vs), v1: Math.max(...vs) }
})
if (!chaoNaTela) {
  console.log(JSON.stringify({ erro: 'o chão à frente não projetou em tela', erros }))
  await ctx.close()
  await b.close()
  servidor.close()
  process.exit(1)
}
// `projetar` devolve u/v NORMALIZADOS (0..1), não pixeis — a sonda da tocha já
// ficou cega uma vez por tratar como pixel e virar NaN na janela.
const dentro = (t, lo, hi) => Math.min(hi, Math.max(lo, t))
const RECORTE = {
  x0: Math.round(canvas.x + dentro(chaoNaTela.u0, 0.02, 0.98) * canvas.w),
  x1: Math.round(canvas.x + dentro(chaoNaTela.u1, 0.02, 0.98) * canvas.w),
  y0: Math.round(canvas.y + dentro(chaoNaTela.v0 + 0.02, 0.02, 0.98) * canvas.h),
  y1: Math.round(canvas.y + dentro(chaoNaTela.v1 - 0.02, 0.02, 0.98) * canvas.h),
}
const LUMA = (p, x, y) => {
  const i = (p.width * y + x) << 2
  return 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2]
}
const MASCARA_MINIMA = 8 // quanto a sombra tem que escurecer pra valer como sombra

const RAIO = 44 // meia-largura do perfil recortado em torno da borda
// ⚠️ JANELA FIXA E MÉDIA, NÃO MÁXIMO — e a calibração é que obrigou.
//
// Com `pico = max(offsets 1..8)` um traço plantado de 2 níveis foi recuperado
// como ZERO e o de 8 como 4,5: o máximo já estava lá longe, em offset 7 ou 8,
// porque o perfil médio SOBE ao se afastar da borda (é a rampa da penumbra do
// PCF, não um platô). O máximo media a rampa e engolia o traço.
//
// Com média numa janela fixa colada na borda, o que se pergunta é direto: a
// faixa de 4 pixeis grudada na sombra é mais clara que o chão longe dela? Um
// traço plantado de N níveis volta como N, e aí "não achei" tem tamanho.
const PICO = [1, 4] // offsets, à esquerda da borda, onde o halo moraria
const PLATO = [24, 42] // offsets onde o lado claro já é platô estável

/**
 * A régua diferencial. `a` = com sombra, `b` = sem sombra, mesma câmera.
 *
 * ⚠️ ESTATÍSTICA POR LINHA NÃO SERVE AQUI, e a rodada anterior mostrou por quê:
 * mediana 0, P90 52, e o "controle positivo" com normalBias 0,35 marcando 8
 * bordas contra 7 da produção — diferença de UMA borda em 27, que é ruído com
 * cara de achado. Areia tem textura e normal map: o contraste local numa linha
 * qualquer é alto e aleatório, e afoga um traço fino.
 *
 * O que separa halo de textura não é o tamanho, é o ALINHAMENTO. Halo é
 * sistemático: mora sempre no mesmo lugar em relação à borda da sombra.
 * Textura não. Então a régua ALINHA todos os perfis pela borda e TIRA A MÉDIA:
 * o que é aleatório cai por √n, o que é sistemático fica de pé.
 */
function medir(a, b, nome) {
  const marcado = new PNG({ width: a.width, height: a.height })
  a.data.copy(marcado.data)

  // (1) MAIS CLARO QUE SEM SOMBRA. Sombra multiplica a luz direta por [0,1]:
  // A ≤ B em todo pixel, sempre. Pixel com A > B é luz ACRESCENTADA na conta
  // da sombra — não é interpretação de foto, é sinal trocado.
  let acimaDoTeto = 0
  let excessoMax = 0
  let dentroDoRecorte = 0

  // (2) Perfis alinhados pela borda.
  const somaA = new Float64Array(RAIO * 2 + 1)
  const somaB = new Float64Array(RAIO * 2 + 1)
  let perfis = 0
  const saltos = []

  for (let y = RECORTE.y0; y < RECORTE.y1; y++) {
    let bordaX = -1
    let saltoDaMascara = 0
    for (let x = RECORTE.x0 + RAIO + 4; x < RECORTE.x1 - RAIO - 4; x++) {
      dentroDoRecorte++
      const excesso = LUMA(a, x, y) - LUMA(b, x, y)
      if (excesso > 2) {
        acimaDoTeto++
        if (excesso > excessoMax) excessoMax = excesso
        const i = (a.width * y + x) << 2
        marcado.data[i] = 255
        marcado.data[i + 1] = 40
        marcado.data[i + 2] = 220
      }
      // A borda vem da MÁSCARA (B − A), não da foto: máscara só existe onde a
      // sombra age, então cacto, tronco e aresta de bloco não podem ser
      // confundidos com ela — eles são idênticos nas duas fotos e somem aqui.
      const m0 = LUMA(b, x - 2, y) - LUMA(a, x - 2, y)
      const m1 = LUMA(b, x + 2, y) - LUMA(a, x + 2, y)
      const salto = m1 - m0 // claro → escuro na direção +x
      if (salto > saltoDaMascara) {
        saltoDaMascara = salto
        bordaX = x
      }
    }
    if (bordaX < 0 || saltoDaMascara < MASCARA_MINIMA) continue
    saltos.push(saltoDaMascara)
    perfis++
    for (let k = -RAIO; k <= RAIO; k++) {
      somaA[k + RAIO] += LUMA(a, bordaX + k, y)
      somaB[k + RAIO] += LUMA(b, bordaX + k, y)
    }
    const i = (a.width * y + bordaX) << 2
    marcado.data[i] = 255
    marcado.data[i + 1] = 0
    marcado.data[i + 2] = 0
  }

  // O retângulo do recorte, em ciano. Sonda que não mostra ONDE mediu pode ter
  // medido o dock e chamado de sombra — foi o que a primeira rodada fez.
  for (let x = RECORTE.x0; x <= RECORTE.x1; x++) {
    for (const y of [RECORTE.y0, RECORTE.y1]) {
      const i = (a.width * y + x) << 2
      marcado.data[i] = 0
      marcado.data[i + 1] = 230
      marcado.data[i + 2] = 255
    }
  }
  for (let y = RECORTE.y0; y <= RECORTE.y1; y++) {
    for (const x of [RECORTE.x0, RECORTE.x1]) {
      const i = (a.width * y + x) << 2
      marcado.data[i] = 0
      marcado.data[i + 1] = 230
      marcado.data[i + 2] = 255
    }
  }
  if (nome) fs.writeFileSync(path.join(OUT, `${nome}-bordas.png`), PNG.sync.write(marcado))

  if (perfis < 30) return { perfis, erro: `só ${perfis} bordas de sombra alinhadas` }

  const perfilA = Array.from(somaA, (v) => v / perfis)
  const perfilB = Array.from(somaB, (v) => v / perfis)
  const media = (perfil, de, ate) => {
    let s = 0
    for (let k = de; k <= ate; k++) s += perfil[RAIO - k]
    return s / (ate - de + 1)
  }
  const over = (perfil) => media(perfil, PICO[0], PICO[1]) - media(perfil, PLATO[0], PLATO[1])
  const mediana = (v) => [...v].sort((c, d) => c - d)[v.length >> 1]

  return {
    perfis,
    saltoMedianoDaMascara: Number(mediana(saltos).toFixed(2)),
    // O QUE VALE. Overshoot medido no perfil MÉDIO alinhado: pico colado na
    // borda menos o platô do mesmo lado claro, longe dela.
    overshootComSombra: Number(over(perfilA).toFixed(2)),
    overshootSemSombra: Number(over(perfilB).toFixed(2)),
    // E a manchete: o quanto do overshoot é OBRA DA SOMBRA. O que não vem dela
    // aparece igual nas duas fotos e cancela.
    overshootDaSombra: Number((over(perfilA) - over(perfilB)).toFixed(2)),
    // Perfis inteiros no relatório: número resumido esconde a forma, e a forma
    // é o que diz se é halo (sobe e volta) ou só a rampa da penumbra.
    perfilComSombra: perfilA.map((v) => Number(v.toFixed(2))),
    perfilSemSombra: perfilB.map((v) => Number(v.toFixed(2))),
    pixeisMaisClarosQueSemSombra: acimaDoTeto,
    fracaoMaisClara: Number(((acimaDoTeto / Math.max(1, dentroDoRecorte)) * 100).toFixed(3)),
    excessoMaximo: Number(excessoMax.toFixed(2)),
  }
}

// ── As tomadas ───────────────────────────────────────────────────────────────
//
// A foto SEM sombra é tirada UMA vez e serve de referência para todos os
// estados: `normalBias` não muda nada quando não há sombra map nenhum, então
// re-fotografar seria gastar tempo pra obter a mesma imagem.
async function ajustar(o) {
  return page.evaluate((o) => window.__roquecraft.sombraQA(o), o)
}

const shipped = await ajustar({}) // lê o valor de produção sem mexer nele
const semSombra = await foto('sem-sombra', false)

async function estado(nome, knobs) {
  const cfg = await ajustar(knobs)
  const comSombra = await foto(nome, true)
  return { nome, cfg, ...medir(comSombra, semSombra, nome) }
}

const medidas = []
// SUJEITO: o valor que está no ar hoje.
medidas.push(await estado('producao', { bias: shipped.bias, normalBias: shipped.normalBias }))
// ⚠️ O MESMO ESTADO, FOTOGRAFADO DE NOVO. Este é o PISO DE RUÍDO, e sem ele
// nenhuma diferença pequena significa coisa alguma: se duas fotos idênticas já
// discordam em 1,4, um "achado" de 1,4 é a mesma poeira com outro nome.
medidas.push(
  await estado('producao-repetida', { bias: shipped.bias, normalBias: shipped.normalBias }),
)
// `normalBias` alto e `normalBias` zero. Não são controle positivo de HALO —
// a rodada anterior mostrou que peter-panning em chão plano com o projetor
// longe só DESLOCA a sombra, não acende linha nenhuma. Ficam porque dizem se a
// régua é sensível ao shadow map em geral.
medidas.push(await estado('bias-alto', { bias: 0, normalBias: 0.35 }))
medidas.push(await estado('sem-folga', { bias: 0, normalBias: 0 }))
// ⚠️ O BUILD DO PRINT. Uma rodada anterior anotou, no próprio `sombraQA`, que "o
// filete do print era o sol quase a pino (11:03) mais o peter-panning do build
// antigo" — e desde então o `normalBias` caiu de 0,055 para 0,02. Se a queixa
// nasceu ali, ela já morreu e ninguém confirmou. Este estado reproduz o valor
// antigo para responder: com 0,055 aparece linha clara que com 0,02 não aparece?
// Sem isto, o item fica aberto para sempre por falta de quem pergunte.
medidas.push(await estado('build-antigo', { bias: -0.0006, normalBias: 0.055 }))
// Volta ao valor de produção antes de sair.
await ajustar({ bias: shipped.bias, normalBias: shipped.normalBias })

// ── O CONTROLE POSITIVO DE VERDADE: halo PLANTADO A MÃO na foto ──────────────
//
// Procurar um ajuste do renderizador que fabrique halo foi tentativa e erro, e
// falhou: nem normalBias alto nem zero acendem linha na borda. Sem defeito
// conhecido não há como saber se o zero medido é ausência de halo ou cegueira
// da régua — e essa dúvida é exatamente o que travou este item por semanas.
//
// Então o defeito conhecido é DESENHADO: soma-se um traço de amplitude
// conhecida nos pixeis colados na borda de sombra da foto real e mede-se de
// novo. Isto não prova nada sobre o renderizador — prova sobre a RÉGUA, que é
// o que falta. Se ela recupera um traço de 4 níveis de luma, então "não achei
// halo" passa a significar "se houvesse halo acima de 4, eu teria visto".
function comHaloPlantado(a, b, amplitude) {
  const copia = new PNG({ width: a.width, height: a.height })
  a.data.copy(copia.data)
  for (let y = RECORTE.y0; y < RECORTE.y1; y++) {
    let bordaX = -1
    let melhor = 0
    for (let x = RECORTE.x0 + RAIO + 4; x < RECORTE.x1 - RAIO - 4; x++) {
      const m0 = LUMA(b, x - 2, y) - LUMA(a, x - 2, y)
      const m1 = LUMA(b, x + 2, y) - LUMA(a, x + 2, y)
      if (m1 - m0 > melhor) {
        melhor = m1 - m0
        bordaX = x
      }
    }
    if (bordaX < 0 || melhor < MASCARA_MINIMA) continue
    for (let k = 1; k <= 4; k++) {
      const i = (a.width * y + (bordaX - k)) << 2
      for (let c = 0; c < 3; c++) copia.data[i + c] = Math.min(255, copia.data[i + c] + amplitude)
    }
  }
  return copia
}

const comSombraProd = PNG.sync.read(fs.readFileSync(path.join(OUT, 'producao.png')))
const limiar = []
for (const amp of [2, 4, 8, 16]) {
  const plantada = comHaloPlantado(comSombraProd, semSombra, amp)
  const m = medir(plantada, semSombra, `plantado-${amp}`)
  limiar.push({
    amplitude: amp,
    overshootDaSombra: m.overshootDaSombra,
    recuperado: Number((m.overshootDaSombra - medidas[0].overshootDaSombra).toFixed(2)),
  })
}

// ── Veredito ─────────────────────────────────────────────────────────────────
const prod = medidas[0]
const veredito = []

const repetida = medidas[1]
const ruido = Math.abs(prod.overshootDaSombra - repetida.overshootDaSombra)
// O menor traço plantado que a régua recupera com fidelidade decente.
const detectavel = limiar.find((l) => l.recuperado >= l.amplitude * 0.5)

if (prod.erro || repetida.erro) {
  veredito.push(
    `CENA SEM SOMBRA: ${prod.erro || repetida.erro}. Nenhum número vale — trocar de cena antes de acusar qualquer um.`,
  )
} else if (!detectavel) {
  // ⚠️ A RÉGUA MORTA SE DENUNCIA AQUI, e não no verde do sujeito.
  veredito.push(
    `RÉGUA CEGA: nem o traço de 16 níveis desenhado na mão em cima da borda foi recuperado (${JSON.stringify(limiar)}). NÃO usar o número de produção pra concluir nada.`,
  )
} else {
  veredito.push(
    `régua viva: recupera halo plantado a partir de ${detectavel.amplitude} níveis de luma (${JSON.stringify(limiar)}), sobre ${prod.perfis} perfis alinhados.`,
  )
  veredito.push(
    `piso de ruído: duas fotos IDÊNTICAS discordam em ${ruido.toFixed(2)} (${prod.overshootDaSombra} contra ${repetida.overshootDaSombra}).`,
  )
  // ⚠️ DUAS PERGUNTAS, NÃO UMA — e a varredura de horas provou que separá-las é
  // obrigatório. Às 18° de elevação o `overshootDaSombra` deu 8,92, muito acima
  // do ruído e do limite de detecção, e a versão anterior deste veredito teria
  // escrito "HALO CONFIRMADO". Só que no mesmo quadro o `overshootComSombra`
  // era −9,63: a faixa colada na sombra estava mais ESCURA que o chão. Não
  // havia linha clara nenhuma.
  //
  // A explicação é aritmética: `overshootDaSombra` = quanto a sombra escurece o
  // PLATÔ menos quanto escurece a faixa. Com sol raso a sombra é longuíssima e o
  // platô de referência cai DENTRO de outra sombra — a referência é que estava
  // contaminada, não a faixa é que estava acesa.
  //
  // Então a queixa do founder ("uma linha mais clara que o chão iluminado") só
  // se responde com o sinal de `overshootComSombra`. `overshootDaSombra` diz de
  // quem é a culpa; ele não diz que existe culpa.
  const temLinhaClara = prod.overshootComSombra > 0
  const daSombra =
    prod.overshootDaSombra > ruido * 2 && prod.overshootDaSombra >= detectavel.amplitude
  if (temLinhaClara && daSombra) {
    veredito.push(
      `HALO CONFIRMADO no shadow map: a faixa colada na sombra está ${prod.overshootComSombra} níveis ACIMA do chão iluminado, e ${prod.overshootDaSombra} desse total é obra da sombra (ruído ${ruido.toFixed(2)}, detecção ${detectavel.amplitude}).`,
    )
  } else if (temLinhaClara) {
    veredito.push(
      `HÁ linha clara (${prod.overshootComSombra} acima do chão) mas ela NÃO é da sombra: só ${prod.overshootDaSombra} sobrevive à subtração com a foto sem sombra. Procurar no que desenha o chão, não no shadow map.`,
    )
  } else if (daSombra) {
    veredito.push(
      `CENA CONTAMINADA, não achado: a subtração acusa ${prod.overshootDaSombra}, mas a faixa colada na sombra está ${prod.overshootComSombra} — mais ESCURA que o chão. Com sol raso a sombra é longa e o platô de referência cai dentro de outra sombra. Não há linha clara aqui; repetir com sol mais alto antes de concluir.`,
    )
  } else {
    veredito.push(
      `SEM HALO: a faixa colada na sombra está ${prod.overshootComSombra} níveis em relação ao chão iluminado (negativo = mais escura, que é rampa de penumbra), e só ${prod.overshootDaSombra} vem da sombra, contra ruído ${ruido.toFixed(2)} e limite de detecção ${detectavel.amplitude}. Uma linha clara acima de ${detectavel.amplitude} teria sido vista e NÃO foi.`,
    )
  }
  if (prod.pixeisMaisClarosQueSemSombra > 0) {
    veredito.push(
      `⚠️ ${prod.pixeisMaisClarosQueSemSombra} pixeis (${prod.fracaoMaisClara}% do recorte) ficam MAIS CLAROS com sombra ligada, excesso máximo ${prod.excessoMaximo}. Sombra só sabe subtrair luz: isto é luz sendo acrescentada, marcada em rosa no PNG.`,
    )
  } else {
    veredito.push(
      `nenhum pixel fica mais claro com a sombra ligada — o halo, se existisse, seria contraste de borda e não luz acrescentada.`,
    )
  }
}

const relatorio = {
  semente: SEMENTE,
  tela: TELA,
  bioma: BIOMA,
  qualidade: QUALIDADE,
  tick: TICK,
  chegada,
  canvas,
  RECORTE,
  shipped,
  medidas,
  limiar,
  veredito,
  erros,
}
fs.writeFileSync(path.join(OUT, 'relatorio.json'), JSON.stringify(relatorio, null, 2))
console.log(JSON.stringify({ qualidade: QUALIDADE, chegada, limiar, veredito, erros }, null, 2))
await ctx.close()
await b.close()
servidor.close()
