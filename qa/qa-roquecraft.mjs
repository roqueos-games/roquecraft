// QA visual + funcional do RoqueCraft: desktop, mobile e low-end, com
// INTERAÇÃO de verdade (minerar, criar, abrir inventário/pausa/lobby, invocar
// criaturas, acender caverna com tocha) e não só render. Substitui a versão v1
// deste arquivo, que fotografava a ilha fechada.
//
// Uso: yarn build:app && node scripts/qa-roquecraft.mjs
// Saída: scripts/.qa-roquecraft/*.png + report.json (ambos gitignored).
//
// Três guardas que este harness carrega por cicatriz (ver
// .claude/dev-docs/roquecraft-v2.md):
//  1. erro de compilação de shader no console = FALHA do cenário (o jogo segue
//     rodando e contando draw calls com o mundo invisível);
//  2. serviceWorkers: 'block' (o precache velho dispara o laço de recuperação
//     de chunk do app e o QA nem abre o jogo);
//  3. openGame() re-tenta por 60s (o reload de recuperação corre com o
//     openWindow).
// Serve dist/pwa, seeda o auth E2E, abre o app pelo store, ESPERA o mundo ficar
// pronto e EXECUTA as interações de verdade antes de fotografar.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'
import { servirDist } from './lib/servidor-do-dist.mjs'

const { PNG } = createRequire(import.meta.url)('pngjs')

const DIST = path.resolve('dist/pwa')
const OUT = path.resolve('scripts/.qa-roquecraft')
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })

// ⚠️ O SERVIDOR É O DE `servirDist`, e não um `http.createServer` próprio. A
// primeira versão deste harness servia `dist/pwa` com fallback para
// `index.html` — que, depois do `compose-site.mjs` (Goal 15), é o shell do
// SITE. O app mora em `app.html`. Resultado: toda cena esperava `__rosStore`
// numa página que era a landing, e o harness ficou vermelho de 10/09 a 18/09
// sem que ninguém o rodasse. Um lugar só para essa regra: `servidor-do-dist`.
const SEED = `window.__ROS_E2E__ = { auth:{uid:'e2e-uid',email:'e2e@roqueos.test',emailVerified:true,displayName:'E2E',role:'user'}, googleDrive:{isConnected:false,files:[],user:{}}, googleMapsApiKey:'', roquecraftSeed: 20260819 }`

const { base, fechar: fecharServidor } = await servirDist(DIST)
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const report = []

async function withPage(
  name,
  { mobile = false, lowEnd = false, menu = false, semJogo = false } = {},
  fn,
) {
  const ctx = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    hasTouch: mobile,
    isMobile: mobile,
    // O service worker do PWA serve o precache ANTIGO depois de um rebuild e o
    // app entra em laço de recuperação de chunk - o QA nem chega a abrir o jogo.
    serviceWorkers: 'block',
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`))
  page.on('console', (m) => {
    const t = m.text()
    // Um erro de compilação de shader NÃO derruba a página: o jogo segue
    // rodando, os draw calls seguem contando e o mundo some. Custou meia dúzia
    // de rodadas de QA em 2026-08-19 - agora é falha explícita.
    if (/Shader Error|not compiled|INVALID_OPERATION: useProgram/i.test(t)) {
      errors.push(`SHADER ${t.slice(0, 700)}`)
      return
    }
    if (m.type() === 'error') errors.push(`CONSOLE ${t.slice(0, 260)}`)
  })
  // `roquecraftMenu` liga a tela inicial no E2E (por padrão o harness pula a
  // porta e vai direto pro mundo, que é o que a maioria das cenas fotografa).
  await page.addInitScript(
    menu
      ? SEED.replace('roquecraftSeed: 20260819', 'roquecraftSeed: 20260819, roquecraftMenu: true')
      : SEED,
  )
  if (lowEnd)
    await page.addInitScript(() => {
      const mark = () => document.documentElement?.setAttribute('data-low-end', '1')
      mark()
      document.addEventListener('DOMContentLoaded', mark)
    })
  await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' })
  if (semJogo) {
    // cenário de vitrine: quem interessa é a galeria/launchpad, não a janela do jogo
    await page.waitForFunction(() => !!window.__rosStore, null, { timeout: 30000 })
    await page.waitForTimeout(1500)
    report.push({ scenario: name, ready: true, state: null, errors })
    try {
      await fn(page)
    } finally {
      await ctx.close()
    }
    return
  }
  const opened = await openGame(page)
  if (lowEnd) await page.evaluate(() => document.documentElement.setAttribute('data-low-end', '1'))
  if (!opened) {
    report.push({
      scenario: name,
      ready: false,
      state: null,
      errors: [...errors, 'JANELA NAO ABRIU'],
    })
    await ctx.close()
    return
  }
  const ok = await page
    .waitForFunction(() => window.__roquecraft && window.__roquecraft.state.ready, null, {
      timeout: 90000,
    })
    .then(() => true)
    .catch(() => false)
  const state = await page.evaluate(() => (window.__roquecraft ? window.__roquecraft.state : null))
  report.push({ scenario: name, ready: ok, state, errors })
  try {
    await fn(page)
  } catch (e) {
    report.at(-1).errors.push(`INTERACTION ${e.message}`)
  }
  await ctx.close()
}

// O app tem recuperação de chunk que RECARREGA a página. Abrir a janela logo
// depois que `__rosStore` aparece pode ser desfeito por esse reload, e o QA
// morre esperando um seletor que nunca vem. Espera assentar e tenta de novo.
async function openGame(page, timeout = 60000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    try {
      await page.waitForFunction(() => !!window.__rosStore, null, { timeout: 20000 })
      await page.waitForTimeout(1200)
      await page.evaluate(() => window.__rosStore.openWindow('roquecraft'))
      await page.waitForSelector('.ros-roquecraft', { timeout: 12000 })
      return true
    } catch {
      await page.waitForTimeout(1000)
    }
  }
  return false
}

const shot = (page, file, sel = '.ros-roquecraft') =>
  page.locator(sel).screenshot({ path: path.join(OUT, `${file}.png`) })

// Esconde o aviso de "clique pra jogar" (e opcionalmente o HUD) - senão toda
// foto sai com o overlay por cima da paisagem.
// O estilo vai com data-qa-hide pra dar pra TIRAR depois. A versao anterior
// usava addStyleTag e nao tinha como desfazer: o print chamado "21-mobile-hud"
// saia com o HUD escondido - a foto que existe pra provar o HUD (QA 19/08/2026).
const hideChrome = (page, alsoHud = false) =>
  page.evaluate((hud) => {
    const el = document.createElement('style')
    el.dataset.qaHide = '1'
    el.textContent =
      '.ros-roquecraft__play{display:none!important}' +
      (hud ? '.ros-roquecraft__crosshair,.rc-hud,.rc-mob{display:none!important}' : '')
    document.head.appendChild(el)
  }, alsoHud)

const showChrome = (page) =>
  page.evaluate(() => document.querySelectorAll('style[data-qa-hide]').forEach((e) => e.remove()))

const settle = (page, ms = 1600) => page.waitForTimeout(ms)

// Compara dois prints numa REGIÃO (fração 0..1 do quadro) e diz quanto mudou.
// Existe porque "a mão apareceu" e "a água mexe" não são afirmações que um
// print sozinho sustenta: são diferenças entre dois prints. O padrão é o canto
// inferior direito, que é onde o modelo de primeira pessoa vive.
function diffCanto(a, b, regiao = { x0: 0.45, y0: 0.45, x1: 1, y1: 1 }) {
  const A = PNG.sync.read(fs.readFileSync(path.join(OUT, `${a}.png`)))
  const B = PNG.sync.read(fs.readFileSync(path.join(OUT, `${b}.png`)))
  if (A.width !== B.width || A.height !== B.height) return { erro: 'tamanhos diferentes' }
  const x0 = Math.floor(A.width * regiao.x0)
  const x1 = Math.floor(A.width * regiao.x1)
  const y0 = Math.floor(A.height * regiao.y0)
  const y1 = Math.floor(A.height * regiao.y1)
  let soma = 0
  let mudou = 0
  let n = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * A.width + x) * 4
      const d =
        Math.abs(A.data[i] - B.data[i]) +
        Math.abs(A.data[i + 1] - B.data[i + 1]) +
        Math.abs(A.data[i + 2] - B.data[i + 2])
      soma += d
      if (d > 12) mudou++
      n++
    }
  }
  return { medio: +(soma / n / 3).toFixed(2), pctMudou: +((100 * mudou) / n).toFixed(1) }
}

// A janela do RoqueOS tem chrome (barra de título) - fotografar só o jogo.
async function scene(page, file, { ticks, yaw, pitch, height, wait = 2600, hud = false } = {}) {
  await hideChrome(page, !hud)
  await page.evaluate(
    ([t, y, p, h, w]) =>
      window.__roquecraft.stage({ ticks: t, yaw: y, pitch: p, height: h, wait: w }),
    [ticks, yaw, pitch, height, wait],
  )
  await settle(page, 1200)
  await shot(page, file)
}

// ── Desktop: paisagem em 4 horas do dia + interações reais ──────────────────
await withPage('desktop', {}, async (page) => {
  await scene(page, '01-desktop-manha', { ticks: 2600, yaw: 0.8, pitch: -0.62, height: 44 })
  await scene(page, '02-desktop-meiodia', { ticks: 6000, yaw: 2.1, pitch: -0.66, height: 52 })
  report.at(-1).debugMeiodia = await page.evaluate(() => window.__roquecraft.debug)
  // BISSEÇÃO: mesma cena sem névoa e sem pós-processamento
  await page.evaluate(() => window.__roquecraft.setFx({ fog: false }))
  await settle(page, 900)
  await shot(page, '02b-diag-sem-nevoa')
  await page.evaluate(() => window.__roquecraft.setFx({ post: false }))
  await settle(page, 900)
  await shot(page, '02c-diag-sem-nevoa-sem-post')
  report.at(-1).inspect = await page.evaluate(() => window.__roquecraft.inspect())
  await page.evaluate(() => window.__roquecraft.setFx({ fog: true }))
  await settle(page, 900)
  await shot(page, '02d-diag-sem-post')
  await page.evaluate(() => window.__roquecraft.setFx({ post: true }))
  await settle(page, 600)
  await scene(page, '03-desktop-entardecer', { ticks: 11200, yaw: 4.2, pitch: -0.5, height: 40 })
  await scene(page, '04-desktop-noite', { ticks: 17200, yaw: 1.2, pitch: -0.46, height: 34 })

  // volta pro chão, modo sobrevivência, e EXECUTA o loop de jogo
  await hideChrome(page, false)
  const landed = await page.evaluate(async () => {
    const g = window.__roquecraft
    g.setTime(5200)
    g.setMode('survival')
    const ok = g.land()
    await g.waitChunks(4)
    await new Promise((r) => setTimeout(r, 1200))
    g.look(0.9, -0.2)
    await new Promise((r) => setTimeout(r, 900))
    return { ok, y: g.state.player.y, ground: g.state.block }
  })
  report.at(-1).landed = landed
  await settle(page, 900)
  await shot(page, '05-desktop-primeira-pessoa')

  // quebrar um bloco (olhando pra baixo) e conferir que o mundo mudou
  const mined = await page.evaluate(async () => {
    const g = window.__roquecraft
    g.look(0.6, -1.05)
    await new Promise((r) => setTimeout(r, 600))
    const before = g.state.block
    const ok = g.breakNow()
    await new Promise((r) => setTimeout(r, 900))
    return { ok, before, after: g.state.block, drops: g.state.drops }
  })
  report.at(-1).mined = mined
  await shot(page, '06-desktop-quebrou-bloco')

  // inventário com itens + crafting
  const craft = await page.evaluate(async () => {
    const g = window.__roquecraft
    g.give('oakLog', 8)
    g.give('cobblestone', 40)
    g.give('stick', 12)
    g.give('diamond', 6)
    g.give('diamond_pickaxe', 1)
    g.give('cooked_beef', 5)
    g.openInventory()
    await new Promise((r) => setTimeout(r, 700))
    return g.state.inventory.filter(Boolean).length
  })
  report.at(-1).invItems = craft
  await settle(page, 700)
  await shot(page, '07-desktop-inventario')

  await page.evaluate(() => window.__roquecraft.openInventory())
  await settle(page, 500)

  // menu de pausa + ajustes
  await page.evaluate(() => window.__roquecraft.openPause())
  await settle(page, 600)
  await shot(page, '08-desktop-pausa')
  await page.click('.rc-pause__btn:nth-of-type(2)').catch(() => {})
  await settle(page, 600)
  await shot(page, '09-desktop-ajustes')

  // lobby multiplayer
  await page.evaluate(() => window.__roquecraft.openLobby())
  await settle(page, 900)
  await shot(page, '10-desktop-lobby')

  // criaturas
  const mobs = await page.evaluate(async () => {
    const g = window.__roquecraft
    g.openLobby()
    g.setMode('creative')
    // planicie: terreno plano, senao as criaturas nascem atras de um barranco
    g.gotoBiome('plains')
    await g.waitChunks(4)
    g.land()
    await new Promise((r) => setTimeout(r, 900))
    g.look(0.9, -0.06)
    await new Promise((r) => setTimeout(r, 400))
    // leque na frente da camera: 7 tipos, dois arcos - senao empilham num ponto
    const tipos = ['cow', 'pig', 'sheep', 'chicken', 'zombie', 'skeleton', 'spider']
    tipos.forEach((t, i) => g.spawnMob(t, i < 4 ? 7 : 10.5, (i % 4) * 3 - 4.5))
    g.setTime(5000)
    await new Promise((r) => setTimeout(r, 700))
    // enquadra pelo CENTROIDE do grupo (recuar a camera nao resolve: o
    // referencial recua junto e o leque sai do quadro atras do matagal)
    const quadro = g.frameMobs(9, 5.5)
    await new Promise((r) => setTimeout(r, 1800))
    return { n: g.state.mobs, quadro }
  })
  report.at(-1).mobs = mobs
  await page.keyboard.press('Escape').catch(() => {})
  await settle(page, 1400)
  await shot(page, '11-desktop-criaturas')

  // caverna: teleporta pro subsolo pra provar a luz de bloco e o AO
  report.at(-1).cave = await page.evaluate(async () => {
    const g = window.__roquecraft
    const s = g.state
    g.setMode('creative')
    g.teleport(s.player.x, 40, s.player.z)
    await g.waitChunks(3)
    // DENTRO de uma caverna de verdade. Teleportar pra uma altura fixa cai na
    // rocha macica e a foto vira um raio-X (a camera dentro do bloco so ve
    // faces traseiras, que o culling descarta).
    const cave = g.gotoCave()
    g.give('torch', 32)
    await g.waitChunks(3)
    await new Promise((r) => setTimeout(r, 1400))
    // ACENDE a caverna. Sem tocha, a foto sai 98,7% preta e nao prova nada
    // sobre luz de bloco (que e justamente o que esta cena existe pra mostrar).
    const slot = g.slotOf('torch')
    const sel = slot >= 0 ? g.selectSlot(slot) : null
    const base = g.state.yaw ?? 0
    const postas = []
    // pitch -0.55: o raio bate no chao uns 2,5 blocos a frente. Olhando muito
    // pra baixo o alvo e o bloco SOB o jogador, e doPlace recusa (nao coloca
    // dentro do proprio corpo).
    for (const dy of [0, 1.1, 2.2, 3.3, 4.4, 5.5]) {
      g.look(base + dy, -0.55)
      await new Promise((r) => setTimeout(r, 240))
      postas.push(g.place())
      g.look(base + dy, -0.2)
      await new Promise((r) => setTimeout(r, 200))
      postas.push(g.place())
    }
    g.look(base, -0.06)
    await new Promise((r) => setTimeout(r, 900))
    return { cave, slot, sel, alvo: g.state.block, tochas: postas.filter(Boolean).length }
  })
  await settle(page, 2600)
  await shot(page, '12-desktop-subsolo')

  // Biomas: o mundo é infinito, então a foto tem que ir ATÉ o bioma - senão
  // toda cena sai do clima onde a semente calhou de nascer.
  for (const [i, b] of [
    ['desert', 4400],
    ['mountains', 3000],
    ['jungle', 5200],
    ['snowy', 9600],
  ].entries()) {
    const [name, tk] = b
    const went = await page.evaluate(
      ([n, t]) => {
        const g = window.__roquecraft
        const r = g.gotoBiome(n)
        if (r) {
          g.setTime(t)
          g.setMode('creative')
          g.teleport(r.x, r.y + 24, r.z)
          g.look(0.9, -0.55)
        }
        return r
      },
      [name, tk],
    )
    if (!went) continue
    await page.evaluate(() => window.__roquecraft.waitChunks(5))
    // Reenquadra pelo topo REAL: gotoBiome usa a altura teorica do ruido, que
    // sob densidade 3D fica bem abaixo do pico da montanha - a camera acabava
    // dentro da encosta e o print de bioma virava um close de neve.
    await page.evaluate(
      ([x, z]) => {
        const g = window.__roquecraft
        const top = g.surfaceAt(x, z)
        // +40: na selva a copa passa de 25 blocos e a camera a +26 nascia DENTRO
        // da folhagem - o print do bioma saia verde-escuro chapado.
        if (Number.isFinite(top)) g.teleport(x, top + 40, z)
        g.look(0.9, -0.46)
      },
      [went.x, went.z],
    )
    await page.evaluate(() => window.__roquecraft.waitChunks(4))
    await settle(page, 2600)
    await hideChrome(page, true)
    await shot(page, `1${i + 4}-desktop-bioma-${name}`)
  }

  // Água de PERTO e em MOVIMENTO: duas fotos com 1,2s de diferença. Se a água
  // estiver parada (o defeito relatado em 20/08/2026), os dois arquivos saem
  // praticamente idênticos - e a diferença média de pixel prova o contrário.
  const marOk = await page.evaluate(async () => {
    const g = window.__roquecraft
    g.setMode('creative')
    const r = g.gotoBiome('ocean') || g.gotoBiome('beach')
    if (!r) return false
    await g.waitChunks(4)
    // ACIMA do nível do mar, não acima do FUNDO: no oceano `surfaceAt` devolve
    // o leito, e +3,5 dali continua debaixo d'água - a primeira foto saiu do
    // fundo do mar olhando areia.
    const top = g.surfaceAt(r.x, r.z)
    g.teleport(r.x, Math.max(Number.isFinite(top) ? top : 62, 62) + 3.2, r.z)
    g.setTime(9200)
    g.look(0.9, -0.22)
    await g.waitChunks(3)
    return true
  })
  if (marOk) {
    await settle(page, 2600)
    await hideChrome(page, true)
    await shot(page, '19-desktop-agua-a')
    await settle(page, 1200)
    await shot(page, '19-desktop-agua-b')
  }

  // Praia/água: a onda, o fresnel e o brilho do sol na água só se julgam de
  // raspão sobre o mar.
  const shore = await page.evaluate(async () => {
    const g = window.__roquecraft
    const r = g.gotoBiome('beach')
    if (!r) return false
    g.setMode('creative')
    g.setTime(10200)
    g.teleport(r.x, r.y + 9, r.z)
    await new Promise((r2) => setTimeout(r2, 3000))
    g.look(2.2, -0.34)
    return r
  })
  if (shore) {
    await page.evaluate(() => window.__roquecraft.waitChunks(5))
    await settle(page, 2400)
    await hideChrome(page, true)
    await shot(page, '18-desktop-praia')
  }

  // close no chão: é aqui que dá pra julgar textura, normal map, AO e sombra
  await page.evaluate(async () => {
    const g = window.__roquecraft
    g.setMode('creative')
    g.setTime(3600)
    const r = g.gotoBiome('plains') || g.gotoBiome('forest')
    if (r) g.teleport(r.x, r.y + 3, r.z)
    await g.waitChunks(4)
    await new Promise((r2) => setTimeout(r2, 1600))
    g.land()
    await new Promise((r2) => setTimeout(r2, 900))
    g.look(0.9, -0.24)
  })
  await settle(page, 1800)
  await hideChrome(page, true)
  await shot(page, '13-desktop-close-chao')

  report.at(-1).finalState = await page.evaluate(() => window.__roquecraft.state)
})

// ── Mobile ──────────────────────────────────────────────────────────────────
// ── Tela inicial + galeria: a PORTA de entrada do jogo ──────────────────────
await withPage('menu', { menu: true }, async (page) => {
  await page.waitForSelector('.rc-start', { timeout: 30000 })
  await settle(page, 2200)
  await shot(page, '40-menu-desktop')
  const menu = await page.evaluate(() => {
    const g = window.__roquecraft
    return {
      aberto: g.menuOpen(),
      botoes: [...document.querySelectorAll('.rc-start__btn')].map((b) => b.dataset.test),
    }
  })
  report.at(-1).menu = menu
  // clicar em "Novo mundo" tem que TROCAR a semente e fechar o menu
  const novo = await page.evaluate(() => window.__roquecraft.menuNewWorld())
  report.at(-1).novoMundo = novo
  await settle(page, 2600)
  await hideChrome(page, true)
  await shot(page, '41-menu-novo-mundo')
})

// ── Galeria de Jogos: onde a capa e o ícone realmente aparecem ──────────────
await withPage('menu-mobile', { menu: true, mobile: true }, async (page) => {
  await page.waitForSelector('.rc-start', { timeout: 30000 })
  await settle(page, 2200)
  await shot(page, '44-menu-mobile')
})

await withPage('galeria', { semJogo: true }, async (page) => {
  // ⚠️ A GALERIA, A JANELA E O DOCK SÃO DO ROQUEOS. Contra o `dist/pwa` deste
  // repo (`qa/lib/preparar-dist.mjs`) não há RoqueOS: o `__rosStore` é de
  // mentira e diz isso. A cena é pulada, e o relatório registra por quê; a
  // prova de que o cartão e o ícone aparecem no RoqueOS é do front.
  if (await page.evaluate(() => !!window.__rosStore?.semRoqueOS)) {
    report.at(-1).pulado = 'galeria, janela e dock são do RoqueOS; sem RoqueOS neste dist'
    return
  }
  await page.evaluate(() => window.__rosStore.openWindow('games'))
  await page.waitForSelector('.ros-games', { timeout: 30000 })
  await settle(page, 2000)
  await page.evaluate(() => {
    const card = [...document.querySelectorAll('.ros-games__card img')].find((i) =>
      /roquecraft/i.test(i.getAttribute('src') || ''),
    )
    card?.closest('.ros-games__card')?.scrollIntoView({ block: 'center' })
  })
  await settle(page, 900)
  await shot(page, '42-galeria-jogos', '.ros-games')
  // O ícone só aparece de verdade na App Store e no Launchpad. O Launchpad é
  // estado do ROSDesktop, não janela - abrir por `openWindow('launchpad')`
  // simplesmente não faz nada (a v1 deste cenário fotografou a área de trabalho).
  // Jogo fica FORA do Launchpad por regra (36-games: jogo vive na galeria). O
  // ícone do app aparece na BARRA DE TÍTULO da janela e no DOCK enquanto ele
  // roda - é lá que a prova tem que ser feita, não na Loja (que é catálogo de
  // links externos) nem no Launchpad (que não lista jogo).
  await page.evaluate(() => window.__rosStore.openWindow('roquecraft'))
  await page.waitForSelector('.ros-roquecraft', { timeout: 40000 })
  await page.waitForFunction(() => window.__roquecraft?.state?.ready, null, { timeout: 90000 })
  // ESPERAR O MUNDO: state.ready só diz que o motor subiu. Sem waitChunks a foto
  // sai preta (o jogador ainda está sob o terreno que não chegou) e a evidência
  // do ícone parece evidência de jogo quebrado.
  await page.evaluate(async () => {
    const g = window.__roquecraft
    await g.waitChunks(3)
    g.land()
    g.look(0.9, -0.12)
  })
  await settle(page, 2600)
  await hideChrome(page, false)
  await settle(page, 800)
  const icone = await page.evaluate(() => {
    const alvo = (i) => /roquecraft\/icon/.test(i.getAttribute('src') || '')
    return {
      titulo: [
        ...document.querySelectorAll(
          '.ros-window img, [class*="titlebar"] img, [class*="title"] img',
        ),
      ].filter(alvo).length,
      dock: [...document.querySelectorAll('.ros-dock img')].filter(alvo).length,
      total: [...document.querySelectorAll('img')].filter(alvo).length,
    }
  })
  report.at(-1).icone = icone
  await page.screenshot({ path: path.join(OUT, '43-icone-janela-dock.png') })
})

await withPage('mobile', { mobile: true }, async (page) => {
  await scene(page, '20-mobile-paisagem', { ticks: 4200, yaw: 1.0, pitch: -0.6, height: 36 })
  await page.evaluate(() => {
    const g = window.__roquecraft
    g.setMode('survival')
    // POUSAR antes. `stage()` deixa a camera a 36 blocos voando; trocar pra
    // sobrevivencia desliga o voo e o jogador despenca - o print do HUD mobile
    // saia na tela de "Voce morreu" (o jogo estava CERTO, o roteiro e que nao).
    g.land()
    g.give('cobblestone', 64)
    g.give('wood_pickaxe', 1)
    g.give('torch', 16)
    g.give('cooked_beef', 3)
    g.setTime(5000)
  })
  // o HUD e o ASSUNTO desta foto: devolve o chrome e enquadra o jogador em pe
  await showChrome(page)
  await hideChrome(page, false)
  await page.evaluate(() => window.__roquecraft.look(0.9, -0.12))
  await settle(page, 2400)
  await shot(page, '21-mobile-hud')
  // toca no botão de inventário (interação de verdade, não só render)
  await page.tap('.rc-mob__mini:nth-child(1)').catch(async () => {
    await page.evaluate(() => window.__roquecraft.openInventory())
  })
  await settle(page, 900)
  await shot(page, '22-mobile-inventario')
  await page.evaluate(() => window.__roquecraft.openInventory())
  await settle(page, 400)
  await page.tap('.rc-mob__mini:nth-child(3)').catch(async () => {
    await page.evaluate(() => window.__roquecraft.openPause())
  })
  await settle(page, 800)
  await shot(page, '23-mobile-pausa')
  report.at(-1).finalState = await page.evaluate(() => window.__roquecraft.state)
})

// ── Os três defeitos relatados pelo founder em 20/08/2026 ───────────────────
// Cada um destes cenários existe porque um print bonito NÃO provou nada na
// rodada anterior: a mão estava desenhada (fora da tela), a água estava
// animada (mas o fundo aparecia através dela) e o spawn parecia certo (até
// alguém entrar pela porta em vez do atalho do E2E).

// 1. SPAWN. O caminho que o jogador usa é o menu, não o atalho do harness.
//    O que se mede é o que dói: vida cheia depois de entrar.
await withPage('spawn', { menu: true }, async (page) => {
  await page.waitForSelector('.rc-start', { timeout: 30000 })
  await settle(page, 1800)
  const antes = await page.evaluate(() => window.__roquecraft.state.health)
  await page.evaluate(() => window.__roquecraft.menuNewWorld())
  // tempo de sobra pra queda acontecer, se ela for acontecer
  await settle(page, 5000)
  const depois = await page.evaluate(() => {
    const g = window.__roquecraft
    const p = g.state.player
    return {
      health: g.state.health,
      y: p.y,
      // `player.y` é o PÉ, não o olho: o bloco de apoio é o de baixo imediato.
      // Com -1.2 a leitura caía um bloco abaixo do chão e dava "air" com o
      // jogador em pé em cima de terra.
      chaoAbaixo: g.blockKeyAt(p.x, p.y - 0.5, p.z),
      olhandoPara: g.blockKeyAt(
        p.x + Math.sin(g.state.yaw) * 2,
        p.y + 1,
        p.z - Math.cos(g.state.yaw) * 2,
      ),
    }
  })
  report.at(-1).spawn = {
    antes,
    ...depois,
    semDanoDeQueda: depois.health === antes,
    pisandoEmChao: depois.chaoAbaixo !== 'air',
  }
  await hideChrome(page, false)
  await shot(page, '50-spawn-primeiro-frame')
  report.at(-1).finalState = await page.evaluate(() => window.__roquecraft.state)
})

// 2. MÃO. Três estados + prova de que o golpe MOVE pixels.
await withPage('mao', {}, async (page) => {
  await hideChrome(page, false)
  await page.evaluate(async () => {
    const g = window.__roquecraft
    g.setMode('creative')
    g.gotoBiome('forest') || g.gotoBiome('plains')
    await g.waitChunks(4)
    const top = g.surfaceAt(g.state.player.x, g.state.player.z)
    g.teleport(g.state.player.x, (Number.isFinite(top) ? top : 70) + 1.7, g.state.player.z)
    await g.waitChunks(3)
    g.land()
    g.setTime(6000)
    g.look(0.9, -0.35)
  })
  await settle(page, 1800)
  await page.evaluate(() => window.__roquecraft.setSlot(0, null))
  await settle(page, 700)
  await shot(page, '51-mao-vazia')
  await page.evaluate(() => window.__roquecraft.setSlot(0, 'diamond_pickaxe', 1))
  await settle(page, 700)
  await shot(page, '52-mao-picareta')
  await page.evaluate(() => window.__roquecraft.setSlot(1, 'grassBlock', 16))
  await settle(page, 700)
  await shot(page, '53-mao-bloco')
  // minerando: dois frames dentro do mesmo golpe. Mirar PRA BAIXO de verdade -
  // com pitch -0.35 a mira caía no horizonte, o clique não pegava bloco nenhum
  // e o diff dava 2% (parecia "o golpe não anima", era "não estava minerando").
  await page.evaluate(() => {
    window.__roquecraft.selectSlot(0)
    window.__roquecraft.look(0.9, -1.05)
  })
  await settle(page, 700)
  const box = await page.locator('.ros-roquecraft').boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(380)
  await shot(page, '54-mao-minerando-a')
  await page.waitForTimeout(240)
  await shot(page, '55-mao-minerando-b')
  await page.mouse.up()
  const alvo = await page.evaluate(() => {
    const g = window.__roquecraft
    const p = g.state.player
    return { mirandoEm: g.blockKeyAt(p.x, p.y - 1, p.z), y: p.y }
  })
  report.at(-1).mao = {
    // o canto inferior direito é onde a mão vive: se ela sumir, este número cai
    picaretaVsVazia: diffCanto('51-mao-vazia', '52-mao-picareta'),
    blocoVsPicareta: diffCanto('52-mao-picareta', '53-mao-bloco'),
    golpeMovePixels: diffCanto('54-mao-minerando-a', '55-mao-minerando-b'),
    alvo,
  }
  report.at(-1).finalState = await page.evaluate(() => window.__roquecraft.state)
})

// 3. ÁGUA. Movimento entre frames + o fundo do mar NÃO aparecendo através dela.
await withPage('agua', {}, async (page) => {
  await hideChrome(page, true)
  const pos = await page.evaluate(async () => {
    const g = window.__roquecraft
    g.setMode('creative')
    const r = g.gotoBiome('ocean') || g.gotoBiome('beach')
    if (!r) return null
    await g.waitChunks(4)
    const top = g.surfaceAt(r.x, r.z)
    g.teleport(r.x, Math.max(Number.isFinite(top) ? top : 62, 62) + 3.2, r.z)
    g.setTime(9200)
    g.look(0.9, -0.18)
    await g.waitChunks(3)
    return { r, top }
  })
  await settle(page, 2600)
  await shot(page, '56-agua-rasante-a')
  await page.waitForTimeout(1400)
  await shot(page, '57-agua-rasante-b')
  await page.evaluate(async () => {
    const g = window.__roquecraft
    const p = g.state.player
    g.teleport(p.x, 92, p.z)
    g.look(0.9, -1.3)
    await g.waitChunks(3)
  })
  await settle(page, 1800)
  await shot(page, '58-agua-de-cima')
  report.at(-1).agua = {
    pos,
    // Sem onda o mar é um decalque: dois frames separados por 1,4s têm que
    // diferir. O piso de 8% de pixels é folgado de propósito - o que se quer
    // detectar é "não mexe NADA", não regressão de amplitude.
    movimento: diffCanto('56-agua-rasante-a', '57-agua-rasante-b', {
      x0: 0,
      y0: 0.45,
      x1: 1,
      y1: 1,
    }),
  }
  report.at(-1).finalState = await page.evaluate(() => window.__roquecraft.state)
})

// ── Low-end ─────────────────────────────────────────────────────────────────
await withPage('low-end', { lowEnd: true }, async (page) => {
  await scene(page, '30-lowend-paisagem', { ticks: 6000, yaw: 1.4, pitch: -0.6, height: 38 })
  await page.evaluate(() => window.__roquecraft.setTime(11200))
  await settle(page, 1800)
  await shot(page, '31-lowend-entardecer')
  report.at(-1).finalState = await page.evaluate(() => window.__roquecraft.state)
})

fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2))
console.log(
  JSON.stringify(
    report.map((r) => ({
      scenario: r.scenario,
      ready: r.ready,
      errors: r.errors.slice(0, 6),
      debug: r.debugMeiodia,
      inspect: r.inspect,
      mined: r.mined,
      invItems: r.invItems,
      mobs: r.mobs,
      spawn: r.spawn,
      mao: r.mao,
      agua: r.agua,
      state: r.finalState
        ? {
            chunks: r.finalState.chunks,
            sections: r.finalState.sections,
            drawCalls: r.finalState.drawCalls,
            triangles: r.finalState.triangles,
            quality: r.finalState.quality,
            worker: r.finalState.usingWorker,
            fps: r.finalState.fps,
            biome: r.finalState.biome,
            mode: r.finalState.mode,
          }
        : r.state || null,
    })),
    null,
    2,
  ),
)
await browser.close()
fecharServidor()
