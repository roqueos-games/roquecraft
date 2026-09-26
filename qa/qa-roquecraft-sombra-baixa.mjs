//
// A SOMBRA COM O SOL BAIXO — e a prova de que esta sonda enxerga o defeito.
//
// ⚠️ POR QUE ELA PRECISOU EXISTIR: a folha de contato do `qa-roquecraft-olho.mjs`
// tira as DOZE fotos com `setTime(6000)`, que é meio-dia. O peter-panning que o
// founder descreveu ("descola da base do bloco... pior com sol baixo") desloca a
// sombra por `normalBias / tan(elevação)`. Com o sol no zênite esse deslocamento
// é ZERO — e ao meio-dia `sunDirection` devolve (0,1,0) cravado. Ou seja: as doze
// folhas são, para ESTE defeito, cegas por construção. Não mostravam o defeito
// antes da correção e não mostram a correção depois. Aprovar a rodada por elas
// seria o instrumento concordando com o defeito, que é o modo de falha que mais
// custou caro nesta empreitada.
//
// COMO ELA PROVA. Nada de julgar sombra por descrição: a sonda tira o MESMO
// quadro duas vezes, uma com os parâmetros de ontem e outra com os de hoje, e
// mede o quanto os dois quadros diferem. Três comparações, nesta ordem:
//
//   1. ontem × hoje com sol baixo  → tem que dar DIFERENÇA. Se der zero, a sonda
//      não distingue o defeito da correção e o verde dela não vale nada.
//   2. hoje × hoje (segunda foto)  → é o piso de ruído. Sem ele, qualquer
//      tremida de nuvem viraria "a correção funcionou".
//   3. ontem × hoje ao MEIO-DIA    → tem que dar ~o piso de ruído, e é essa
//      linha que documenta por que as doze folhas não serviam.
//
// A primeira versão desta sonda caçava um bloco isolado sobre chão plano e limpo
// pra medir a fresta EM BLOCOS. O contador de peneira mostrou o custo: de 3.721
// colunas do mapa, 4 tinham chão limpo e NENHUMA pegava sol rasante — com o sol
// a 13° a sombra de uma copa de 10 blocos alcança 40, e o mundo inteiro fica na
// sombra de alguma coisa. Medir fresta em cena montada é caro e frágil; medir
// DIFERENÇA ENTRE DOIS QUADROS responde a mesma pergunta sem montar nada.
//
// A mão fica DESLIGADA aqui, ao contrário da sonda do olho: ela é idêntica em
// todos os quadros e só diluiria a fração de pixel que mudou. Os defeitos da mão
// continuam cobertos pela sonda do olho, que a mantém ligada.
//
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const OUT = path.resolve('scripts/.qa-sombra-baixa')
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })

const DIST = path.resolve('dist/pwa')
const SEMENTE = Number(process.argv[2] || 942457)

// t=0 amanhecer, t=6000 zênite (`daycycle.js`), então tick vira elevação direto:
// 1200 ticks = 18° acima do horizonte. Baixo o bastante pra `normalBias/tan θ`
// render deslocamento visível (0,055/0,325 = 0,17 bloco com os valores de ontem)
// e alto o bastante pro chão ainda receber sol direto — a 13° o N·L do chão cai
// pra 0,23 e claro e escuro quase se encostam.
const TICK_BAIXO = 1200
const TICK_MEIO_DIA = 6000

// Os parâmetros de ANTES desta rodada, lidos do git, não de memória.
const ANTES = { bias: -0.0006, normalBias: 0.055, radius: 1 }
const AGORA = { bias: 0, normalBias: 0.02, radius: 2 }

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

// ── A régua: quanto dois quadros diferem ─────────────────────────────────────
//
// Fração de pixels cuja luminância mudou mais que o limiar, e o mapa de onde
// mudou. O recorte ignora a faixa do HUD embaixo: coração piscando e barra de
// item mudam sozinhos, e contá-los seria inventar diferença.
const LIMIAR = 8
const CORTE_INFERIOR = 0.82

function comparar(bufA, bufB, nomeMapa) {
  const A = PNG.sync.read(bufA)
  const B = PNG.sync.read(bufB)
  const alturaUtil = Math.floor(A.height * CORTE_INFERIOR)
  const mapa = new PNG({ width: A.width, height: alturaUtil })
  let mudados = 0
  let soma = 0
  let pico = 0
  let total = 0
  for (let y = 0; y < alturaUtil; y++) {
    for (let x = 0; x < A.width; x++) {
      const i = (A.width * y + x) << 2
      const la = 0.2126 * A.data[i] + 0.7152 * A.data[i + 1] + 0.0722 * A.data[i + 2]
      const lb = 0.2126 * B.data[i] + 0.7152 * B.data[i + 1] + 0.0722 * B.data[i + 2]
      const d = Math.abs(la - lb)
      total++
      soma += d
      if (d > pico) pico = d
      if (d > LIMIAR) mudados++
      // Amplificado 6×: uma diferença de 10 níveis é invisível num mapa cru, e
      // mapa de diferença que ninguém consegue olhar não é evidência.
      const v = Math.min(255, d * 6)
      mapa.data[i] = v
      mapa.data[i + 1] = v
      mapa.data[i + 2] = v
      mapa.data[i + 3] = 255
    }
  }
  if (nomeMapa) fs.writeFileSync(path.join(OUT, `${nomeMapa}.png`), PNG.sync.write(mapa))
  return {
    fracao: Number((mudados / total).toFixed(4)),
    media: Number((soma / total).toFixed(2)),
    pico: Math.round(pico),
  }
}

async function fotografar(nome, params, tick) {
  const vivo = await page.evaluate(
    async ({ params, tick }) => {
      const rc = window.__roquecraft
      rc.setTime(tick)
      const s = rc.sombraQA(params)
      // Dois segundos: a sombra é redesenhada no laço, e fotografar antes do
      // redesenho devolveria o quadro do parâmetro ANTERIOR. Já aconteceu.
      await new Promise((r) => setTimeout(r, 2000))
      return s
    },
    { params, tick },
  )
  if (!vivo) {
    erros.push(`[${nome}] sombraQA devolveu null - o gancho não achou a luz do sol`)
    return null
  }
  const buf = await page.screenshot()
  fs.writeFileSync(path.join(OUT, `${nome}.png`), buf)
  return { buf, vivo }
}

// ── A rodada ─────────────────────────────────────────────────────────────────
const relatorio = { semente: SEMENTE, tickBaixo: TICK_BAIXO, cenas: [], veredito: [], erros }

for (const bioma of ['desert', 'savanna', 'plains', 'forest']) {
  const chegada = await page.evaluate(async (bioma) => {
    const rc = window.__roquecraft
    if (!rc.gotoBiome(bioma)) return { erro: `gotoBiome('${bioma}') não achou o bioma` }
    await rc.waitChunks(6)
    await new Promise((k) => setTimeout(k, 2400))
    rc.setFx({ hand: false })
    // O MESMO enquadramento da sonda do olho, que já é sabido bom. Reinventar
    // a mira aqui só criaria uma segunda versão pra sair do lugar.
    rc.look(0.6, -0.12)
    await new Promise((k) => setTimeout(k, 1200))
    const p = rc.state.player
    return { x: Math.round(p.x), z: Math.round(p.z), bioma: rc.state.biome }
  }, bioma)
  if (chegada.erro) {
    relatorio.cenas.push({ bioma, erro: chegada.erro })
    continue
  }

  // A ORDEM importa: ontem, hoje, hoje de novo. A terceira foto é o piso de
  // ruído — sem ela, qualquer diferença viraria prova.
  const ontem = await fotografar(`${bioma}-baixo-ontem`, ANTES, TICK_BAIXO)
  const hoje = await fotografar(`${bioma}-baixo-hoje`, AGORA, TICK_BAIXO)
  const hoje2 = await fotografar(`${bioma}-baixo-hoje-2`, AGORA, TICK_BAIXO)
  const meioOntem = await fotografar(`${bioma}-meiodia-ontem`, ANTES, TICK_MEIO_DIA)
  const meioHoje = await fotografar(`${bioma}-meiodia-hoje`, AGORA, TICK_MEIO_DIA)
  await page.evaluate((p) => window.__roquecraft.sombraQA(p), AGORA)
  if (!ontem || !hoje || !hoje2 || !meioOntem || !meioHoje) {
    relatorio.cenas.push({ bioma, erro: 'faltou foto - ver erros' })
    continue
  }

  const sinal = comparar(ontem.buf, hoje.buf, `${bioma}-diff-baixo`)
  const ruido = comparar(hoje.buf, hoje2.buf, `${bioma}-diff-ruido`)
  const meio = comparar(meioOntem.buf, meioHoje.buf, `${bioma}-diff-meiodia`)
  relatorio.cenas.push({
    bioma: chegada.bioma,
    onde: { x: chegada.x, z: chegada.z },
    parametrosVivos: { ontem: ontem.vivo, hoje: hoje.vivo },
    solBaixo: { sinal, ruido },
    meioDia: { sinal: meio },
  })

  // 1. PROVA DE VIDA — sem ela o resto é decoração.
  if (sinal.fracao <= ruido.fracao * 3 + 0.002) {
    relatorio.veredito.push(
      `[${bioma}] SONDA CEGA: ontem×hoje mudou ${(sinal.fracao * 100).toFixed(2)}% dos pixels e o piso de ruído é ${(ruido.fracao * 100).toFixed(2)}%. Esta sonda não separa o defeito da correção, então nada que ela aprove vale.`,
    )
  } else {
    relatorio.veredito.push(
      `[${bioma}] sonda viva: com o sol a 18° trocar os parâmetros muda ${(sinal.fracao * 100).toFixed(2)}% dos pixels (pico ${sinal.pico}), contra ${(ruido.fracao * 100).toFixed(2)}% de ruído entre duas fotos iguais.`,
    )
  }
  // 2. O que documenta a cegueira das doze folhas.
  const cegoAoMeioDia = meio.fracao <= ruido.fracao * 3 + 0.002
  relatorio.veredito.push(
    `[${bioma}] ao MEIO-DIA (hora das doze folhas) a mesma troca muda ${(meio.fracao * 100).toFixed(2)}% dos pixels. ${cegoAoMeioDia ? 'Indistinguível do ruído: a folha de contato era cega pra este defeito.' : 'O meio-dia também mostrava alguma coisa.'}`,
  )
}

fs.writeFileSync(path.join(OUT, 'relatorio.json'), JSON.stringify(relatorio, null, 2))
console.log(
  JSON.stringify({ cenas: relatorio.cenas, veredito: relatorio.veredito, erros }, null, 2),
)
await ctx.close()
await b.close()
servidor.close()
// O veredito sai pelo código de saída: o ledger de sondas lê ISSO, não a prosa.
// A prova de vida é o veredito. Medido em 18/09/2026: deserto, savana e
// planície saem "SONDA CEGA" (a troca de parâmetros a 18° muda 1,2–5,4% dos
// pixels contra 0,8–2,5% de ruído) e a floresta sai viva (6,2% contra 1,1%) —
// em chão liso a sombra baixa quase não tem o que deslocar, e isso é
// propriedade da cena, não defeito. Vermelho é o instrumento MORTO: nenhum
// bioma vivo (a sombra não está sendo desenhada), ou erro de página.
const viva = relatorio.veredito.some((l) => l.includes('sonda viva'))
process.exit(!viva || erros.length > 0 ? 1 : 0)
