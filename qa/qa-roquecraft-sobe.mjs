//
// SONDA MAIS BARATA DA CASA: O JOGO SOBE?
//
// Ela existe por causa de 26/08/2026. Numa rodada de separacao eu quebrei o
// componente DUAS vezes seguidas, e nas duas o gate inteiro ficou verde:
//
//   1. `useRoqueCraftEntrada` foi declarado ANTES de `exitPointerLock`, que
//      nasce do composable de multijogador. `ReferenceError` no setup.
//   2. O componente desestruturou `keys` de um composable que exporta
//      `teclas`. Virou `undefined`, e o laco de fisica quebrou por quadro.
//
// Nos dois casos: `yarn lint` 0 erros, `yarn test:unit` 7.445 verdes, build OK.
// Nenhum teste de unidade monta o componente, entao nenhum deles podia ver.
// Quem viu foram as dez sondas caras, cada uma gastando 120 s ate estourar o
// `waitForFunction` - dez minutos pra descobrir o que esta sonda descobre em
// vinte segundos, e sem dizer qual era o erro.
//
// Ela nao mede nada do jogo. Ela responde tres perguntas e para:
//   o componente montou? o gancho instalou? algum erro apareceu no console?
//
//   node scripts/qa-roquecraft-sobe.mjs
//
// Codigo 0 = subiu limpo. 1 = nao subiu, ou subiu sujando o console.
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
const srv = http.createServer((q, r) => {
  const p = decodeURIComponent((q.url || '/').split('?')[0])
  let f = path.join(DIST, p)
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = shellDoApp(DIST)
  r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' })
  fs.createReadStream(f).pipe(r)
})
await new Promise((r) => srv.listen(0, r))
const base = `http://localhost:${srv.address().port}`
const b = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const ctx = await b.newContext({
  viewport: { width: 1024, height: 640 },
  serviceWorkers: 'block',
  locale: 'pt-BR',
})
const page = await ctx.newPage()
const erros = []
page.on('pageerror', (e) =>
  erros.push('PAGEERROR: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')),
)
page.on('console', (m) => {
  const t = m.text()
  if (
    /before initialization|ReferenceError|TypeError|is not a function|is not defined|Vue warn|roquecraft/i.test(
      t,
    )
  )
    erros.push('[' + m.type() + '] ' + t.slice(0, 400))
})
await page.addInitScript(
  `window.__ROS_E2E__ = { auth:{uid:'e2e-uid',email:'e2e@roqueos.test',emailVerified:true,displayName:'E2E',role:'user'}, googleDrive:{isConnected:false,files:[],user:{}}, googleMapsApiKey:'', roquecraftSeed: 20260819 }`,
)
await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => !!window.__rosStore, null, { timeout: 30000 })
await page.waitForTimeout(1500)
await page.evaluate(() => window.__rosStore.openWindow('roquecraft'))
await page.waitForTimeout(9000)
const st = await page.evaluate(() => ({
  temHook: !!window.__roquecraft,
  ready: window.__roquecraft?.state?.ready,
  erro: window.__roquecraft?.state?.error,
  temRaiz: !!document.querySelector('.ros-roquecraft'),
  temCanvas: !!document.querySelector('.ros-roquecraft canvas'),
  janelas: [...document.querySelectorAll('[class*=window]')].length,
  texto: (document.querySelector('.ros-roquecraft')?.innerText || '').slice(0, 300),
}))
// RUIDO CONHECIDO: o registro do service worker reclama em `file://`-like e em
// contexto sem HTTPS. E anterior a esta sonda e nao e do jogo.
const RUIDO = [/service worker registration/i, /Missing or insufficient permissions/i]
const relevantes = erros.filter((e) => !RUIDO.some((r) => r.test(e)))
const veredito = []
if (!st.temRaiz) veredito.push('O COMPONENTE NAO MONTOU: nao existe `.ros-roquecraft` na pagina.')
else if (!st.temCanvas) veredito.push('MONTOU SEM CANVAS: o render nunca comecou.')
else if (!st.temHook) veredito.push('SEM GANCHO DE QA: `installE2EHook` nao rodou.')
else if (st.ready !== true) veredito.push(`NAO FICOU PRONTO: ready=${st.ready} erro=${st.erro}`)
if (relevantes.length) veredito.push(`${relevantes.length} ERRO(S) NOVO(S) no console.`)
if (!veredito.length)
  veredito.push('o jogo sobe limpo: monta, desenha, instala o gancho e fica pronto.')
console.log(
  JSON.stringify(
    { estado: st, erros: relevantes, ruidoConhecido: erros.length - relevantes.length, veredito },
    null,
    2,
  ),
)
await b.close()
srv.close()
process.exit(veredito[0].startsWith('o jogo sobe') ? 0 : 1)
