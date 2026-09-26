//
// FORNALHA E BAÚ FUNCIONAM NO JOGO?
//
// `SMELTING` está escrito e completo em `recipes.js` e `interact: 'chest'`
// está declarado em `blocks.js` — e nada no jogo lia nenhum dos dois. Os
// testes de unidade provam a REGRA da fundição; esta sonda prova que ela chega
// até o jogador: colocar o bloco, interagir, a tela abrir, o fogo acender com
// o jogo rodando, e o conteúdo voltar ao quebrar.
//
// PROVA DE VIDA: uma fornalha SEM combustível, medida do mesmo jeito e pelo
// mesmo tempo. Se ela também produzir, a medida não está olhando a fundição.
//
//   node scripts/qa-roquecraft-forno.mjs [semente]
//
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const DIST = path.resolve('dist/pwa')
const OUT = path.resolve('scripts/.qa-forno')
fs.mkdirSync(OUT, { recursive: true })
const TIPOS = {
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
  r.setHeader('Content-Type', TIPOS[path.extname(f)] || 'application/octet-stream')
  fs.createReadStream(f).pipe(r)
})
await new Promise((r) => servidor.listen(0, r))
const base = `http://localhost:${servidor.address().port}`
const SEMENTE = Number(process.argv[2] || 942457)

const navegador = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const ctx = await navegador.newContext({
  viewport: { width: 1280, height: 860 },
  serviceWorkers: 'block',
  locale: 'pt-BR',
})
const pagina = await ctx.newPage()
const erros = []
pagina.on('pageerror', (e) => erros.push(String(e.message).slice(0, 200)))
pagina.on('console', (m) => {
  const t = m.text()
  if (m.type() === 'error' && !/Firebase|service worker|ERR_CONNECTION|permissions/i.test(t)) {
    erros.push(t.slice(0, 200))
  }
})
await pagina.addInitScript(
  `window.__ROS_E2E__={auth:{uid:'e2e',email:'e@e.t',emailVerified:true,displayName:'E',role:'user'},googleDrive:{isConnected:false,files:[],user:{}},googleMapsApiKey:'',roquecraftSeed:${SEMENTE}}`,
)
await pagina.goto(`${base}/app`, { waitUntil: 'domcontentloaded' })
await pagina.waitForFunction(() => !!window.__rosStore, null, { timeout: 30000 })
await pagina.waitForTimeout(1200)
await pagina.evaluate(() => window.__rosStore.openWindow('roquecraft'))
await pagina.waitForFunction(() => window.__roquecraft?.state?.ready === true, null, {
  timeout: 120000,
})
await pagina.evaluate(() => window.__rosStore?.maximizeWindow?.('roquecraft'))
await pagina.waitForTimeout(700)
await pagina.addStyleTag({ content: '.ros-roquecraft__play { display: none !important }' })

const relatorio = { semente: SEMENTE, erros }

/**
 * Planta um bloco e devolve a posição REAL dele.
 *
 * ⚠️ A primeira versão adivinhava a posição varrendo pra baixo até achar algo
 * sólido — e achava o CHÃO, não o bloco recém-colocado. `porNaMobilia` era
 * chamado numa coordenada onde não havia mobília nenhuma, e a sonda reprovava
 * um jogo que estava certo. Agora a busca é por CHAVE de bloco: só a fornalha
 * é a fornalha.
 */
const plantar = (item) =>
  pagina.evaluate(async (item) => {
    const rc = window.__roquecraft
    rc.setMode('creative')
    const h = rc.surfaceAt(0, 0)
    const base = Number.isFinite(h) ? h : 66
    rc.teleport(0.5, base + 3, 0.5)
    rc.setFlying(true)
    await rc.waitChunks(4)
    // ⚠️ 2,5 s de espera, não 0,8. Depois do teleporte o mundo em volta ainda
    // está chegando, e o raycast de mira devolve `null` num jogo perfeitamente
    // são — foi o que fez esta sonda reprovar duas vezes seguidas.
    rc.look(0.6, -0.75)
    rc.setSlot(0, item, 1)
    await new Promise((r) => setTimeout(r, 2500))
    const colocou = rc.place()
    await new Promise((r) => setTimeout(r, 600))
    // ⚠️ NÃO ADIVINHAR A POSIÇÃO. Duas versões desta sonda varreram uma caixa
    // em volta do jogador atrás do bloco: a primeira achou o CHÃO, a segunda
    // não achou nada porque o bloco caiu fora da caixa (a mira é oblíqua, o
    // bloco entra a dois ou três de distância). O jogo SABE onde ele está — a
    // mira está encostada nele — então é só perguntar.
    const alvo = rc.miraEm()
    if (alvo && alvo.chave === item) return { x: alvo.x, y: alvo.y, z: alvo.z, colocou }
    return { x: null, colocou, alvo, jogador: rc.state.player }
  }, item)

/**
 * Interage com o bloco que a mira JÁ está encostando.
 *
 * ⚠️ Não teleportar pra cima do bloco antes. A versão que fazia isso caía
 * dentro da copa de um pinheiro e a mira acertava `spruceLeaves` — a sonda
 * reprovava a fornalha por causa de uma árvore. Depois de `place()` a mira
 * está no bloco recém-colocado; é só usar.
 */
const abrirAqui = () =>
  pagina.evaluate(async () => {
    const rc = window.__roquecraft
    const mirado = rc.miraEm()
    const ok = rc.interagir()
    await new Promise((r) => setTimeout(r, 400))
    return { mirado, ok, aberto: rc.abertoAgora(), temTela: !!document.querySelector('.rc-cont') }
  })

// ── 1. FORNALHA ────────────────────────────────────────────────────────────
const posForno = await plantar('furnace')
relatorio.forno = { posicao: posForno }

if (!posForno || posForno.x === null) {
  relatorio.forno.veredito = 'NÃO CONSEGUI PLANTAR A FORNALHA — sonda inconclusiva'
} else {
  const abriu = await abrirAqui()
  relatorio.forno.abriu = abriu

  // ── com combustível ──────────────────────────────────────────────────────
  const comCarvao = await pagina.evaluate(async (p) => {
    const rc = window.__roquecraft
    rc.porNaMobilia(p.x, p.y, p.z, 'entrada', 'raw_iron', 5)
    rc.porNaMobilia(p.x, p.y, p.z, 'combustivel', 'coal', 1)
    await new Promise((r) => setTimeout(r, 13000)) // ~1 fundida + folga
    return rc.mobiliaEm(p.x, p.y, p.z)
  }, posForno)
  relatorio.forno.comCombustivel = comCarvao

  fs.writeFileSync(path.join(OUT, 'fornalha.png'), await pagina.screenshot())

  // ── PROVA DE VIDA: sem combustível, nada sai ─────────────────────────────
  const semCarvao = await pagina.evaluate(async (p) => {
    const rc = window.__roquecraft
    rc.porNaMobilia(p.x, p.y, p.z, 'saida', 'air', 0)
    const e = rc.mobiliaEm(p.x, p.y, p.z)
    return e
  }, posForno)
  // zera a saída e o combustível pra medir o caso negativo pelo mesmo tempo
  const controle = await pagina.evaluate(async () => {
    const rc = window.__roquecraft
    // planta OUTRA fornalha no mesmo esquema e não põe combustível nenhum
    rc.setSlot(0, 'furnace', 1)
    rc.look(0.9, -0.7)
    await new Promise((r) => setTimeout(r, 900))
    rc.place()
    await new Promise((r) => setTimeout(r, 500))
    const alvo = rc.miraEm()
    if (!alvo || alvo.chave !== 'furnace') return { erro: 'nao plantou o controle', alvo }
    rc.interagir()
    rc.porNaMobilia(alvo.x, alvo.y, alvo.z, 'entrada', 'raw_iron', 5)
    await new Promise((r) => setTimeout(r, 13000))
    return rc.mobiliaEm(alvo.x, alvo.y, alvo.z)
  })
  relatorio.forno.semCombustivel = controle
  relatorio.forno.estadoIntermediario = semCarvao ? 'lido' : 'nulo'

  relatorio.forno.veredito =
    comCarvao?.saida?.item === 'iron_ingot' ? 'OK — fundiu ferro' : 'FALHOU'
  relatorio.forno.provaDeVida =
    controle && !controle.erro && !controle.saida
      ? 'sem combustível não sai nada — a medida olha a fundição'
      : `SONDA SUSPEITA: ${JSON.stringify(controle)}`
}

// ── 2. BAÚ: guarda e devolve ao quebrar ────────────────────────────────────
const posBau = await plantar('chest')
relatorio.bau = { posicao: posBau }
if (posBau && posBau.x !== null) {
  const abriuBau = await abrirAqui()
  const r = await pagina.evaluate(async (p) => {
    const rc = window.__roquecraft
    const temTela = !!document.querySelector('.rc-cont')
    rc.setMode('creative')
    rc.porNaMobilia(p.x, p.y, p.z, 0, 'diamond', 9)
    await new Promise((r) => setTimeout(r, 300))
    const guardado = rc.mobiliaEm(p.x, p.y, p.z)?.slots?.[0] || null
    // agora quebra e vê se o diamante volta pro chão
    const dropsAntes = rc.state.drops
    rc.breakNow()
    await new Promise((r) => setTimeout(r, 600))
    return { temTela, guardado, dropsAntes, dropsDepois: rc.state.drops }
  }, posBau)
  relatorio.bau = {
    ...relatorio.bau,
    abriu: abriuBau,
    ...r,
    veredito:
      r.temTela && r.guardado?.item === 'diamond' && r.dropsDepois > r.dropsAntes
        ? 'OK — guarda e devolve ao quebrar'
        : 'FALHOU',
  }
  fs.writeFileSync(path.join(OUT, 'bau.png'), await pagina.screenshot())
}

fs.writeFileSync(path.join(OUT, 'relatorio.json'), JSON.stringify(relatorio, null, 2))
console.log(JSON.stringify(relatorio, null, 2))
await navegador.close()
servidor.close()

// O veredito ja era calculado e jogado fora. Fornalha e bau sao o que separa um
// buraco na montanha de uma base: se eles param de guardar, o jogo para.
const reprovados = Object.entries(relatorio)
  .filter(([, v]) => typeof v?.veredito === 'string' && !v.veredito.startsWith('OK'))
  .map(([k, v]) => `${k}: ${v.veredito}`)
if (reprovados.length) {
  console.error('\n[forno] ❌', reprovados.join(' | '))
  process.exit(1)
}
