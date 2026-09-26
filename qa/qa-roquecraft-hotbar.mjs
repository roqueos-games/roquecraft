//
// A HOTBAR ESTÁ VISÍVEL? — medida no jogo rodando, não no CSS.
//
// A folha de contato de 12/09/2026 mostrou, nas quatro cenas de desktop, a
// hotbar do jogador reduzida a uma faixa preta de ~17px espremida entre os
// corações e a dock do RoqueOS. Nas quatro cenas de celular ela aparecia
// inteira. Nenhuma sonda numérica tinha como pegar isso: nenhuma perguntava
// "a hotbar tem altura" nem "tem alguma coisa por cima dela".
//
// ⚠️ ESTA SONDA NÃO OLHA O CSS. Ler `height: 46px` na folha de estilo prova que
// alguém escreveu 46, não que o jogador vê 46 — e o defeito aqui é justamente
// um em que o CSS está certo e a tela não. Tudo abaixo é `getBoundingClientRect`
// do elemento vivo.
//
//   node scripts/qa-roquecraft-hotbar.mjs
//
// Sai 0 quando a hotbar está inteira e desobstruída em toda largura testada.
// Sai 1 quando não está, com o número que prova.
//
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const DIST = path.resolve('dist/pwa')
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

// A altura MÍNIMA que a barra precisa ter para ser a barra. O slot tem 46px e a
// moldura soma 10 (padding 3+3, borda 2+2). Aceito 50 para não reprovar por
// arredondamento de zoom — abaixo disso não é "um pouco menor", é outra coisa.
const ALTURA_MINIMA = 50

const TELAS = [
  { nome: 'desktop', largura: 1280, altura: 720, movel: false },
  { nome: 'desktop-largo', largura: 1920, altura: 1080, movel: false },
  { nome: 'celular', largura: 430, altura: 932, movel: true },
]

const b = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const achados = []

for (const tela of TELAS) {
  const ctx = await b.newContext({
    viewport: { width: tela.largura, height: tela.altura },
    deviceScaleFactor: 1,
    isMobile: tela.movel,
    hasTouch: tela.movel,
    serviceWorkers: 'block',
    locale: 'pt-BR',
  })
  const page = await ctx.newPage()
  await page.addInitScript(
    `window.__ROS_E2E__={auth:{uid:'e2e',email:'e@e.t',emailVerified:true,displayName:'E',role:'user'},googleDrive:{isConnected:false,files:[],user:{}},googleMapsApiKey:'',roquecraftSeed:942457}`,
  )
  await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!window.__rosStore, null, { timeout: 30000 })
  await page.waitForTimeout(800)
  await page.evaluate(() => window.__rosStore.openWindow('roquecraft'))
  await page.waitForFunction(() => window.__roquecraft?.state?.ready === true, null, {
    timeout: 120000,
  })
  // ⚠️ ENTRAR NO JOGO ANTES DE MEDIR, E PELA PORTA. A primeira versão mediu com
  // a cortina de "clique para jogar" na frente e reportou a hotbar coberta por
  // `ros-roquecraft__play` — que é o estado NORMAL de quem ainda não clicou: a
  // sonda estava fotografando a porta de entrada e chamando de defeito.
  //
  // E a segunda tentação seria a da folha de contato: `display: none` na
  // cortina. Esconder o que atrapalha é como o defeito da mão sobreviveu a
  // cinco rodadas. `entrarNoJogo()` é o mesmo caminho que o clique percorre.
  await page.evaluate(() => window.__roquecraft?.entrarNoJogo?.())
  await page.waitForTimeout(800)

  const medida = await page.evaluate(() => {
    const barra = document.querySelector('.rc-hud__hotbar')
    if (!barra) return { erro: 'hotbar não existe no DOM' }
    const r = barra.getBoundingClientRect()
    const slots = [...barra.querySelectorAll('.rc-hud__slot')].map((e) => {
      const b = e.getBoundingClientRect()
      return { w: Math.round(b.width), h: Math.round(b.height) }
    })
    // ⚠️ QUEM ESTÁ NA FRENTE, perguntado ao NAVEGADOR e não deduzido do
    // z-index: `elementFromPoint` no meio do primeiro slot devolve quem o
    // jogador de fato clicaria ali. Se não for a própria hotbar, tem coisa por
    // cima — e uma barra coberta é tão inútil quanto uma barra sem altura.
    const alvo = slots.length
      ? document.elementFromPoint(r.left + 23, r.top + r.height / 2)
      : document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    // A CADEIA, e não só a folha: `q-icon material-icons` não diz nada sobre
    // QUEM está na frente — a resposta útil é "a dock", e ela está três níveis
    // acima do ícone.
    const cadeia = (e) => {
      const nomes = []
      for (let n = e; n && n !== document.body; n = n.parentElement) {
        const c = typeof n.className === 'string' ? n.className.split(' ')[0] : ''
        nomes.push(c || n.tagName.toLowerCase())
      }
      return nomes.slice(0, 6).join(' < ')
    }
    const cobertaPor = alvo && !barra.contains(alvo) ? cadeia(alvo) : null
    return {
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      altura: Math.round(r.height),
      largura: Math.round(r.width),
      slots: slots.length,
      alturaDoSlot: slots[0]?.h ?? 0,
      cobertaPor,
      janela: window.innerHeight,
    }
  })

  const problemas = []
  if (medida.erro) problemas.push(medida.erro)
  else {
    if (medida.slots !== 9) problemas.push(`${medida.slots} slots (esperado 9)`)
    if (medida.altura < ALTURA_MINIMA) {
      problemas.push(`altura ${medida.altura}px (mínimo ${ALTURA_MINIMA})`)
    }
    if (medida.bottom > medida.janela) {
      problemas.push(`passa do fim da janela em ${medida.bottom - medida.janela}px`)
    }
    // ⚠️ A CORTINA DE PLAY NÃO É OBSTÁCULO, É CONSEQUÊNCIA DO HEADLESS. Ela
    // existe enquanto o ponteiro não está travado, e navegador sem janela real
    // não trava ponteiro nenhum — nem depois de `entrarNoJogo()`. Reprovar por
    // ela seria reprovar o laboratório, não o jogo. O que a sonda procura é
    // coisa de FORA do jogo em cima do HUD, que é o caso da dock.
    const ehACortina = medida.cobertaPor?.includes('ros-roquecraft__play')
    if (medida.cobertaPor && !ehACortina) problemas.push(`coberta por "${medida.cobertaPor}"`)
  }
  achados.push({ tela: tela.nome, ...medida, problemas })
  await ctx.close()
}

await b.close()
s.close()

console.log(JSON.stringify({ alturaMinima: ALTURA_MINIMA, achados }, null, 2))
const ruins = achados.filter((a) => a.problemas.length)
if (ruins.length) {
  console.error(`\n❌ hotbar com problema em ${ruins.length} tela(s):`)
  for (const r of ruins) console.error(`  ${r.tela}: ${r.problemas.join(' · ')}`)
  process.exit(1)
}
console.log('\n✅ hotbar inteira e desobstruída nas', achados.length, 'telas')
