//
// "O MAPA MONTA ELE TODO ERRADO" — reproduzindo a queixa como número.
//
// Founder, 25/08/2026: "espere o personagem cair no mapa para depois montar o
// mapa, porque quando eu já caio em um mapa pronto, o mapa monta ele todo
// errado, ai eu tenho que mudar a qualidade grafica para montar o mapa
// novamente".
//
// ⚠️ A FRASE JÁ TRAZ O EXPERIMENTO. "Trocar a qualidade conserta" é um
// controle pronto: trocar de perfil reconstrói a engine e RE-MALHA tudo. Então
// a pergunta vira mensurável — a malha logo depois de pousar é igual à malha
// depois do re-malhamento forçado? Se for diferente, o defeito existe e tem
// tamanho; se for igual, a queixa é de outra coisa e eu ia consertar o lugar
// errado.
//
// Quem responde é `auditarMalha`, que já existia: ele indexa TODO quad na cena
// e pergunta ao mundo quais faces deveriam estar lá. `buracos` é a conta de
// faces que o mundo pede e a cena não tem.
//
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const OUT = path.resolve('scripts/.qa-monta-mapa')
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
  window.__roquecraft.setQuality('high')
  await new Promise((r) => setTimeout(r, 2600))
  window.__rosStore?.maximizeWindow?.('roquecraft')
  await new Promise((r) => setTimeout(r, 900))
})

const relatorio = { semente: SEMENTE, etapas: [], veredito: [], erros }

async function auditar(nome, esperar = 2500) {
  await page.waitForTimeout(esperar)
  const a = await page.evaluate(() => {
    const rc = window.__roquecraft
    return { ...rc.auditarMalha(24), pos: rc.state.player, secoes: rc.state.sections }
  })
  fs.writeFileSync(path.join(OUT, `${nome}.png`), await page.screenshot())
  const m = {
    etapa: nome,
    buracos: a.buracos,
    quads: a.quads,
    examinados: a.examinados,
    secoes: a.secoes,
    porDirecao: a.porDirecao,
    exemplos: (a.exemplos || []).slice(0, 6),
  }
  relatorio.etapas.push(m)
  return m
}

// 1. ASSIM QUE O JOGO ABRE — é o estado que o founder descreve como "montou
//    tudo errado". A câmera do menu está 26 blocos acima; o jogo já malhou o
//    que deu tempo.
const aoAbrir = await auditar('1-ao-abrir', 3500)

// 2. DEPOIS DE POUSAR, que é o "já caio num mapa pronto".
await page.evaluate(async () => {
  const rc = window.__roquecraft
  rc.entrarNoJogo?.()
  await new Promise((r) => setTimeout(r, 2600))
})
const aoPousar = await auditar('2-ao-pousar', 3000)

// 3. O CONTROLE: trocar a qualidade, que é o que o founder faz pra consertar.
//    Ela reconstrói a engine e re-malha tudo do zero.
await page.evaluate(async () => {
  window.__roquecraft.setQuality('ultra')
  await new Promise((r) => setTimeout(r, 3200))
  window.__roquecraft.setQuality('high')
  await new Promise((r) => setTimeout(r, 3200))
})
const depoisDoRemalhamento = await auditar('3-depois-de-remalhar', 3000)

// ── Veredito ─────────────────────────────────────────────────────────────────
const ganho = aoPousar.buracos - depoisDoRemalhamento.buracos
if (aoPousar.examinados < 200) {
  relatorio.veredito.push(
    `CENA VAZIA: só ${aoPousar.examinados} blocos examinados no raio de 24. Sem mundo carregado não há malha pra auditar.`,
  )
} else if (aoPousar.buracos === 0) {
  relatorio.veredito.push(
    `NÃO REPRODUZIU: ao pousar a malha já está completa (0 buraco em ${aoPousar.examinados} blocos). Ou o defeito depende de save/semente, ou é de outra natureza que não face faltando.`,
  )
} else if (ganho <= 0) {
  relatorio.veredito.push(
    `REPRODUZIU MAS O CONTROLE NÃO CONSERTA: ${aoPousar.buracos} buracos ao pousar e ${depoisDoRemalhamento.buracos} depois de re-malhar. Se trocar a qualidade não fecha os buracos, o que o founder vê ao trocar de perfil é outra coisa.`,
  )
} else {
  relatorio.veredito.push(
    `REPRODUZIU: ${aoPousar.buracos} faces faltando ao pousar contra ${depoisDoRemalhamento.buracos} depois de forçar o re-malhamento — o re-malhamento fecha ${ganho}. É malha velha, não mundo errado.`,
  )
  relatorio.veredito.push(`por direção ao pousar: ${JSON.stringify(aoPousar.porDirecao)}`)
  relatorio.veredito.push(`exemplos: ${aoPousar.exemplos.join(' · ')}`)
}
relatorio.veredito.push(
  `linha do tempo de buracos: abrir=${aoAbrir.buracos} · pousar=${aoPousar.buracos} · re-malhar=${depoisDoRemalhamento.buracos}`,
)

fs.writeFileSync(path.join(OUT, 'relatorio.json'), JSON.stringify(relatorio, null, 2))
console.log(JSON.stringify(relatorio, null, 2))
await ctx.close()
await b.close()
servidor.close()
// O veredito sai pelo código de saída: o ledger de sondas lê ISSO, não a prosa.
// A sonda reproduz o buraco de pouso e prova que re-malhar fecha; vermelho é a
// remalha NÃO fechar (`ganho <= 0` com buraco) ou erro de página.
const sobrou = depoisDoRemalhamento?.buracos ?? 0
process.exit(sobrou > 0 || erros.length > 0 ? 1 : 0)
