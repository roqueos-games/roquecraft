//
// O CONTORNO QUE SOBREVIVE À NÉVOA — de quem é?
//
// "tem um contorno estranho nas algas e nos blocos que estão fora da agua
// enquanto estou mergulhando" — founder, 25/08/2026, com print.
//
// O QUE O PRINT MOSTRA, ampliado: o terreno distante e as algas do fundo somem
// por completo dentro da névoa de submerso — viram uma chapa azul uniforme —
// mas a SILHUETA deles continua desenhada, como um traço escuro de um pixel.
//
// Isso é uma pista forte, e é ela que define o método. Se a superfície foi
// achatada pela névoa e a BORDA não foi, então quem desenha a borda roda DEPOIS
// da névoa e não olha a cor: olha a PROFUNDIDADE. Em tela, o único passe com
// esse feitio é o SSAO.
//
// ⚠️ MAS ISSO É HIPÓTESE, E HIPÓTESE NÃO ENTRA EM COMMIT. Três vezes nesta
// sessão eu acertei o mecanismo de cabeça e errei o culpado. Então esta sonda
// não confirma a suspeita: ela BISSECCIONA a cadeia inteira, desligando um
// passe por vez na MESMA câmera, e deixa o número dizer.
//
// A RÉGUA: densidade de traço escuro fino.
//
// Um contorno é um mínimo LOCAL de luminância — um pixel mais escuro que os
// dois vizinhos, por uma margem. Isso distingue traço de sombra larga (que não
// é mínimo local) e de ruído (que não passa da margem). Mede-se só na faixa
// enevoada, onde o founder aponta.
//
// DUAS PROVAS DE VIDA, sem as quais nenhum número aqui vale:
//   · a mesma régua num pedaço de água aberta, sem geometria atrás, tem que dar
//     perto de zero — senão ela conta ruído;
//   · com TODO o pós desligado, a régua tem que cair — senão o contorno não é
//     de pós e a bisseção estaria medindo a coisa errada.
//
//   node scripts/qa-roquecraft-contorno-submerso.mjs
//
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const DIST = path.resolve('dist/pwa')
const OUT = path.resolve('scripts/.qa-contorno-submerso')
fs.rmSync(OUT, { recursive: true, force: true })
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
  `window.__ROS_E2E__={auth:{uid:'e2e',email:'e@e.t',emailVerified:true,displayName:'E',role:'user'},googleDrive:{isConnected:false,files:[],user:{}},googleMapsApiKey:'',roquecraftSeed:942457}`,
)
await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => !!window.__rosStore, null, { timeout: 30000 })
await page.waitForTimeout(900)
await page.evaluate(() => window.__rosStore.openWindow('roquecraft'))
await page.waitForFunction(() => window.__roquecraft?.state?.ready === true, null, {
  timeout: 120000,
})
await page.evaluate(async () => {
  // ULTRA de propósito: é o único perfil com SSAO, que é o suspeito principal.
  window.__roquecraft.setQuality('ultra')
  await new Promise((r) => setTimeout(r, 2800))
  window.__rosStore?.maximizeWindow?.('roquecraft')
  await new Promise((r) => setTimeout(r, 900))
})
await page.addStyleTag({
  content: '.ros-roquecraft__play,.ros-dock,.ros-menubar,.rc-hud{display:none !important}',
})
await page.waitForTimeout(500)
const canvas = await page.waitForSelector('.ros-roquecraft__canvas')
const foto = async (nome) => {
  const p = path.join(OUT, nome)
  await canvas.screenshot({ path: p })
  return PNG.sync.read(fs.readFileSync(p))
}

const L = (p, i) => 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2]

/**
 * Densidade de TRAÇO ESCURO FINO numa janela, em pixels por mil.
 *
 * Um contorno é um mínimo LOCAL de luminância: mais escuro que o vizinho da
 * esquerda E que o da direita, por uma margem. Duas propriedades importam:
 *
 *  · sombra larga NÃO conta (o meio de uma sombra não é mínimo local);
 *  · gradiente de névoa NÃO conta (é monótono, nunca vira mínimo).
 *
 * Por isso ela mede contorno e não escuridão — que é exatamente a diferença
 * entre o que o founder apontou e o resto da cena.
 */
function densidadeDeContorno(png, j, margem = 2.2, vao = 2) {
  let n = 0
  let total = 0
  const x0 = Math.max(vao, j.x0)
  const x1 = Math.min(png.width - vao - 1, j.x1)
  for (let y = Math.max(0, j.y0); y < Math.min(png.height, j.y1); y++) {
    for (let x = x0; x < x1; x++) {
      total++
      const i = (png.width * y + x) << 2
      const c = L(png, i)
      if (c + margem < L(png, i - (vao << 2)) && c + margem < L(png, i + (vao << 2))) n++
    }
  }
  return total ? +((n / total) * 1000).toFixed(2) : 0
}

// ── A CENA ──────────────────────────────────────────────────────────────────
//
// Submerso, olhando na horizontal para o terreno distante: é a moldura do
// print. O relógio congela para que os quadros sejam comparáveis pixel a pixel
// — sem isso a onda muda entre uma foto e a seguinte e a diferença de contorno
// fica afogada no movimento da água.
const cena = await page.evaluate(async () => {
  const rc = window.__roquecraft
  // ⚠️ MODO CRIATIVO, E ISSO NÃO É DETALHE DE CONFORTO.
  //
  // A rodada anterior desta sonda mediu SEIS PASSES e deu empate em todos, com
  // deltas entre 0,15 e 3,4. A foto explicou: "Você morreu — Faltou ar". O
  // jogador afogou durante a varredura de enquadramento (uns trinta segundos
  // submerso em sobrevivência) e o quadro inteiro virou a caixa de diálogo de
  // morte, igual em todas as fotos. Todas as medidas concordaram entre si
  // porque nenhuma continha o jogo.
  rc.setMode('creative')
  if (!rc.gotoBiome('ocean')) return { erro: 'não achei oceano' }
  await rc.waitChunks(6)
  await new Promise((k) => setTimeout(k, 2600))
  rc.setTime(5200)
  // ⚠️ CONGELAR TUDO QUE ANDA, e não só a onda.
  //
  // Com só `congelarAgua`, duas fotos do MESMO estado diferiam 9,1 — e o
  // desligamento do pós inteiro dava 15,9. Um sinal de 1,7× o ruído não decide
  // nada. Quem se mexia: as NUVENS (relógio próprio no shader do céu) e os
  // PEIXES, que eu mesmo acabei de pôr no oceano nesta sessão.
  rc.limparMobs()
  rc.setFx({ hand: false, congelarAgua: true, tempoDaAgua: 1000, clouds: false })

  // ⚠️ ACHAR LÂMINA FUNDA, e não simplesmente descer três blocos.
  //
  // A primeira versão punha o olho em `leito + 2,4` e a sonda relatou
  // `submerso: false, prof: 0` — o leito ali tinha um palmo de água em cima e a
  // câmera saiu no ar. Toda a bisseção seguinte mediu uma cena que não continha
  // o fenômeno, e as seis medidas deram o mesmo número por isso.
  const p = rc.state.player
  let alvo = null
  for (let raio = 0; raio <= 40 && !alvo; raio += 2) {
    for (let a = 0; a < 24 && !alvo; a++) {
      const ang = (a / 24) * Math.PI * 2
      const x = Math.floor(p.x + Math.cos(ang) * raio)
      const z = Math.floor(p.z + Math.sin(ang) * raio)
      if (!rc.carregado(x, z)) continue
      const leito = rc.surfaceAt(x, z)
      if (leito == null) continue
      let lamina = 0
      while (lamina < 40 && rc.blocoEm(x, leito + lamina, z)?.includes('water')) lamina++
      if (lamina >= 8) alvo = { x, z, leito, lamina }
    }
  }
  if (!alvo) return { erro: 'não achei lâmina de 8 blocos por perto' }

  rc.setFlying(true)
  // Olho três blocos ABAIXO da superfície: fundo o bastante pra névoa fechar,
  // raso o bastante pra ainda haver luz e silhueta.
  const superficie = alvo.leito + alvo.lamina
  const olho = superficie - 3
  rc.teleport(alvo.x + 0.5, olho - 1.62, alvo.z + 0.5)
  rc.look(0.6, 0.06)
  await new Promise((k) => setTimeout(k, 1200))
  const v = rc.aguaVisual?.() || {}
  return {
    alvo,
    superficie,
    olho,
    submerso: v.submerso ?? null,
    prof: v.profundidadeDoOlho ?? null,
  }
})
if (cena.erro) {
  console.log(JSON.stringify({ erro: cena.erro }))
  await b.close()
  servidor.close()
  process.exit(1)
}

// A faixa ENEVOADA: o terço de cima do quadro, que é onde o founder aponta.
const JANELA = { x0: 60, x1: 1220, y0: 40, y1: 300 }

// ── O CONTROLE, e ele mudou depois da primeira rodada ──────────────────────
//
// A primeira versão usava uma janelinha de "água aberta sem geometria" como
// piso — e ela deu 170 contra 23 na faixa enevoada, ou seja SETE VEZES MAIS.
// Não havia água aberta ali: o recorte caiu em cima do leito, cheio de detalhe.
// A régua acusou a si mesma de cega, e estava certa: o cenário e o recorte é
// que estavam errados.
//
// O controle certo não é espacial, é o que o PRÓPRIO FOUNDER descreveu: o
// contorno aparece "enquanto estou mergulhando". Então a cena de controle é a
// MESMA direção, do MESMO lugar, com o olho FORA da água. Se a régua marcar
// alto lá também, ela está medindo borda em geral e não o defeito.
async function medirForaDagua() {
  const ok = await page.evaluate(
    ([x, z, superficie]) => {
      const rc = window.__roquecraft
      rc.setFlying(true)
      rc.teleport(x + 0.5, superficie + 2.2 - 1.62, z + 0.5)
      rc.look(0.6, 0.06)
      return true
    },
    [cena.alvo.x, cena.alvo.z, cena.superficie],
  )
  await page.waitForTimeout(900)
  const img = await foto('c-fora-da-agua.png')
  const submerso = await page.evaluate(() => window.__roquecraft.aguaVisual?.().submerso ?? null)
  return { ok, submerso, contorno: densidadeDeContorno(img, JANELA) }
}

// ── O INSTRUMENTO, SEGUNDA VERSÃO ───────────────────────────────────────────
//
// ⚠️ A PRIMEIRA TENTAVA CARACTERIZAR O ARTEFATO, e eu não consegui.
//
// Ela contava "traço escuro fino sobre fundo plano" e nunca separou o contorno
// do detalhe normal do leito: varrendo cinco vãos e quatro margens, a faixa
// enevoada NUNCA pontuou mais que a faixa do fundo. Eu estava afinando uma
// régua até ela concordar comigo, que é exatamente o erro que já me custou uma
// retratação pública nesta sessão.
//
// A segunda versão não caracteriza nada. Ela pergunta a única coisa que
// importa: O QUE ESTE PASSE ACRESCENTA AO QUADRO? A resposta é a diferença
// entre a foto com ele e sem ele, e a diferença é uma IMAGEM — se o passe
// desenha o contorno, o contorno aparece nela, e aí não é preciso régua
// nenhuma: é preciso olhar.
//
// O ENQUADRAMENTO TAMBÉM NÃO É CHUTADO. A rodada anterior mediu zero porque a
// câmera olhava pra água vazia: a cena não continha o fenômeno. Agora a sonda
// varre direções e fica com aquela em que o PÓS-PROCESSAMENTO mais mexe no
// quadro — que é onde qualquer artefato de pós tem que estar. Isso não
// pressupõe qual passe é o culpado; só recusa medir onde não há o que medir.

/** Diferença média absoluta de luminância entre duas fotos, numa janela. */
function diferenca(a, c, j) {
  let soma = 0
  let n = 0
  for (let y = Math.max(0, j.y0); y < Math.min(a.height, j.y1); y++) {
    for (let x = Math.max(0, j.x0); x < Math.min(a.width, j.x1); x++) {
      const i = (a.width * y + x) << 2
      soma += Math.abs(L(a, i) - L(c, i))
      n++
    }
  }
  return n ? +(soma / n).toFixed(3) : 0
}

/** Salva a diferença AMPLIFICADA, pra ela ser visível a olho. */
function salvarDiferenca(a, c, nome, ganho = 12) {
  const out = new PNG({ width: a.width, height: a.height })
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.min(255, Math.abs(L(a, i) - L(c, i)) * ganho)
    out.data[i] = out.data[i + 1] = out.data[i + 2] = d
    out.data[i + 3] = 255
  }
  fs.writeFileSync(path.join(OUT, nome), PNG.sync.write(out))
}

/**
 * O jogador está VIVO e no jogo? Guarda contra a foto da tela de morte.
 *
 * Chamado antes e depois da varredura: uma medição feita sobre a caixa de
 * "Você morreu" é uniforme em todos os passes e parece um empate honesto.
 */
const vivo = () =>
  page.evaluate(() => {
    const rc = window.__roquecraft
    return { health: rc.state.health, menu: !!rc.menuOpen?.() }
  })

const olhar = async (yaw, pitch) => {
  await page.evaluate(([y, p]) => window.__roquecraft.look(y, p), [yaw, pitch])
  await page.waitForTimeout(520)
}
const setFx = async (fx) => {
  await page.evaluate((fx) => window.__roquecraft.setFx(fx), fx)
  await page.waitForTimeout(520)
}
// ⚠️ `fog` PRECISA ESTAR NOS DOIS, e a falta dele já falsificou uma rodada.
//
// Sem `fog: true` aqui, o religamento depois do passe "sem névoa" deixava a
// névoa DESLIGADA — e a foto de repetição, que serve de piso de ruído, saía de
// um estado diferente do baseline. O piso deu 9,12 e o passe da névoa deu
// 9,125: dois números iguais até a terceira casa, medindo a mesma coisa. Foi a
// coincidência que denunciou, não o raciocínio.
const TUDO = {
  post: true,
  ssao: true,
  bloom: true,
  fxaa: true,
  godRays: true,
  fog: true,
  borrao: true,
}
const NADA = { post: false, ssao: false, bloom: false, fxaa: false, godRays: false }

// ── VARREDURA DE ENQUADRAMENTO ──────────────────────────────────────────────
const candidatos = []
for (const yaw of [0, 1.2, 2.4, 3.6, 4.8]) {
  for (const pitch of [-0.05, 0.12, 0.3]) {
    await olhar(yaw, pitch)
    await setFx(TUDO)
    const comPos = await foto('_varredura.png')
    await setFx(NADA)
    const semPos = await foto('_varredura2.png')
    candidatos.push({ yaw, pitch, delta: diferenca(comPos, semPos, JANELA) })
  }
}
const vivoDepois = await vivo()
if (!(vivoDepois.health > 0)) {
  console.log(
    JSON.stringify({
      erro: `o jogador MORREU durante a varredura (vida ${vivoDepois.health}) — nenhuma medida vale`,
      vivoDepois,
    }),
  )
  await b.close()
  servidor.close()
  process.exit(1)
}
candidatos.sort((a, c) => c.delta - a.delta)
const melhor = candidatos[0]
await olhar(melhor.yaw, melhor.pitch)

const passes = [
  ['1-sem-ssao', { ssao: false }],
  ['2-sem-bloom', { bloom: false }],
  ['3-sem-fxaa', { fxaa: false }],
  ['4-sem-godrays', { godRays: false }],
  ['5-sem-borrao', { borrao: false }],
  ['6-sem-pos-inteiro', NADA],
  ['7-sem-nevoa', { fog: false }],
]

await setFx(TUDO)
const baseline = await foto('0-tudo-ligado.png')

const medidas = []
for (const [nome, fx] of passes) {
  // Religa tudo antes de cada rodada: bisseção com estado acumulado mede a
  // soma dos desligamentos anteriores, não o passe em questão.
  await setFx(TUDO)
  await setFx(fx)
  const img = await foto(`${nome}.png`)
  salvarDiferenca(baseline, img, `d-${nome}.png`)
  // ⚠️ DUAS JANELAS: a faixa enevoada (onde o defeito mora) e o QUADRO INTEIRO.
  //
  // A do quadro inteiro é a prova de vida do INTERRUPTOR. Um `setFx` cujo passe
  // é nulo não lança erro: ele simplesmente não faz nada, e o "delta zero" que
  // sai disso lê exatamente como "este passe é inocente". Se o quadro inteiro
  // não mudou nada, o que foi testado não foi o passe — foi o botão.
  const inteiro = { x0: 0, x1: img.width, y0: 0, y1: img.height }
  medidas.push({
    nome,
    delta: diferenca(baseline, img, JANELA),
    deltaQuadro: diferenca(baseline, img, inteiro),
  })
}

// Piso de ruído: duas fotos do MESMO estado. Tudo abaixo disto é empate.
await setFx(TUDO)
const repetida = await foto('7-tudo-ligado-de-novo.png')
const ruido = diferenca(baseline, repetida, JANELA)

const fora = await medirForaDagua()
const veredito = []
veredito.push(
  `enquadramento escolhido: yaw ${melhor.yaw} pitch ${melhor.pitch} (delta do pós ${melhor.delta})`,
)
veredito.push(`ruído da medição: ${ruido} (duas fotos do mesmo estado)`)
veredito.push(`contorno fora d'água: ${fora.contorno} — só referência, a régua velha`)
for (const m of medidas) {
  const mexeu = m.deltaQuadro > ruido * 2
  // ⚠️ "não mexeu" NÃO É "é inocente", e chamar isso de interruptor morto foi
  // o erro que quase me fez inocentar o culpado. O contorno é fraco e fino:
  // ele pode ser a diferença INTEIRA e ainda mover pouco a média do quadro.
  // Depois da correção, aliás, o SSAO passa a ser legitimamente inerte aqui,
  // porque ele já sai sozinho debaixo d'água.
  const marca = !mexeu
    ? 'inerte neste quadro — olhe a d-*.png antes de concluir qualquer coisa'
    : m.delta > ruido * 4
      ? '★ mexe na faixa enevoada'
      : 'passe ativo, mas não é ele'
  veredito.push(
    `${m.nome.padEnd(20)} névoa ${String(m.delta).padStart(7)}  quadro ${String(m.deltaQuadro).padStart(7)}  ${marca}`,
  )
}
veredito.push(
  'as imagens d-*.png mostram O QUE cada passe desenha — é nelas que o contorno aparece, se for de pós',
)

const vivoNoFim = await vivo()
if (!(vivoNoFim.health > 0))
  veredito.push(`⚠️ o jogador morreu no meio da bisseção (${JSON.stringify(vivoNoFim)})`)
const relatorio = {
  cena,
  janela: JANELA,
  melhor,
  candidatos,
  medidas,
  ruido,
  fora,
  vivoNoFim,
  veredito,
  erros,
}
fs.writeFileSync(path.join(OUT, 'relatorio.json'), JSON.stringify(relatorio, null, 2))
console.log(JSON.stringify({ cena, melhor, medidas, ruido, veredito, erros }, null, 2))

await b.close()
servidor.close()
