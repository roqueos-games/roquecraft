//
// PECUÁRIA — sonda de uma pergunta só: o clique direito CHEGA na criatura?
//
// `pecuaria.spec.js` prova as regras (quem come o quê, quem vira casal, quem
// larga lã). Nenhuma delas prova que o botão direito, apontado pra uma vaca,
// atravessa `doPlace` e chega em `alimentar` — e entre a regra e o botão há o
// cone de mira, a ordem das checagens e o inventário.
//
// ⚠️ TUDO PELO CAMINHO DO JOGO. A sonda usa `equipar` + `place()`, que são o
// mesmo `doPlace` do clique. Um gancho `alimentarQA()` mediria a regra que o
// teste puro já mede, e daria verde com o botão quebrado.
//
// ⚠️ PROVA DE VIDA em cada etapa: o estado é lido ANTES e DEPOIS. "amor > 0"
// só significa alguma coisa se antes era 0; "tem lã no chão" só significa
// alguma coisa se antes não tinha.
//
//   node scripts/qa-roquecraft-pecuaria.mjs
//
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const DIST = path.resolve('dist/pwa')
const SAIDA = path.resolve('scripts/.qa-pecuaria')
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
fs.mkdirSync(SAIDA, { recursive: true })

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

const b = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const ctx = await b.newContext({
  viewport: { width: 900, height: 820 },
  deviceScaleFactor: 1,
  serviceWorkers: 'block',
  locale: 'pt-BR',
})
const page = await ctx.newPage()
const erros = []
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
await page.addStyleTag({ content: '.ros-roquecraft__play{display:none !important}' })
const foto = (nome) => page.screenshot({ path: path.join(SAIDA, nome) })

const y = await page.evaluate(() => {
  const rc = window.__roquecraft
  rc.setMode('creative')
  const y = Math.round(rc.surfaceAt(0, 0) ?? 66) + 16
  rc.setFlying(true)
  rc.teleport(0.5, y + 2, 0.5)
  rc.fill(-10, y - 2, -10, 10, y, 10, 'grassBlock')
  return y
})
await page.waitForTimeout(2600)

/**
 * Mira na criatura mais próxima e clica com o item na mão.
 *
 * ⚠️ A MIRA É CALCULADA, MAS O CLIQUE É O DO JOGO. Calcular pra onde olhar é o
 * que o jogador faz com o mouse; pular `doPlace` seria testar a regra, que o
 * teste puro já testa.
 */
const clicarNoBicho = (item, indice = 0) =>
  page.evaluate(
    ([item, indice, y]) => {
      const rc = window.__roquecraft
      const bichos = rc.mobsInfo()
      const alvo = bichos[indice]
      if (!alvo) return { erro: 'sem criatura' }
      rc.equipar(item, 8)

      // ⚠️ O JOGADOR ANDA ATÉ UM ÂNGULO LIMPO. A primeira versão ficava parada
      // e mirava; as duas vacas vagavam, entravam em fila, e o raio pegava
      // sempre a da frente — `mirou: m1` quando o alvo era `m2`. Isso NÃO era
      // defeito do jogo: o `miradoQA` mostrou que a mira estava certa e a
      // vizinha estava mesmo no caminho.
      //
      // A sonda passou a fazer o que o jogador faria: contornar. Fica do lado
      // OPOSTO à outra criatura, a 2,4 blocos.
      const outra = bichos.find((m) => m.id !== alvo.id)
      let ox = 0
      let oz = 1
      if (outra) {
        const fx = alvo.x - outra.x
        const fz = alvo.z - outra.z
        const n = Math.hypot(fx, fz) || 1
        ox = fx / n
        oz = fz / n
      }
      const px = alvo.x + ox * 2.4
      const pz = alvo.z + oz * 2.4
      rc.setFlying(false)
      rc.teleport(px, y + 1, pz)

      const olhoY = y + 1 + 1.62
      const dx = alvo.x - px
      const dz = alvo.z - pz
      const plano = Math.hypot(dx, dz)
      const yaw = Math.atan2(dx, -dz)
      const pitch = Math.atan2(alvo.y + 0.7 - olhoY, plano)
      rc.look(yaw, pitch)
      const mirado = rc.miradoQA()
      const ok = rc.place()
      return {
        ok,
        naMao: rc.naMao(),
        queria: alvo.id,
        mirou: mirado,
        acertouOAlvo: mirado === alvo.id,
        pos: { x: alvo.x, y: alvo.y, z: alvo.z },
        outros: rc.mobsInfo().map((m) => ({ id: m.id, x: m.x, z: m.z, amor: m.amor })),
      }
    },
    [item, indice, y],
  )

// ── 1. Alimentar ────────────────────────────────────────────────────────────
await page.evaluate((y) => {
  const rc = window.__roquecraft
  rc.limparMobs()
  rc.setFlying(false)
  rc.teleport(0.5, y + 1, 0.5)
  rc.look(0, 0)
  rc.spawnMob('cow', 2.2, -0.6)
  rc.spawnMob('cow', 2.2, 0.6)
}, y)
await page.waitForTimeout(700)
const antesDeAlimentar = await page.evaluate(() =>
  window.__roquecraft.mobsInfo().map((m) => ({ t: m.type, amor: m.amor })),
)
const cliqueA = await clicarNoBicho('wheat', 0)
await page.waitForTimeout(120)
const cliqueB = await clicarNoBicho('wheat', 1)
await page.waitForTimeout(1200)

const depoisDeAlimentar = await page.evaluate(() =>
  window.__roquecraft.mobsInfo().map((m) => ({ t: m.type, amor: m.amor, bebe: m.bebe })),
)
// ⚠️ A FOTO PRECISA DE DISTÂNCIA. Sem isto ela sai do ponto onde o último
// clique aconteceu — a 2,4 blocos de uma vaca — e o quadro vira um close de
// flanco: o bezerro, que é o assunto, fica fora. `frameMobs` recua até caber o
// grupo inteiro, e é aí que a diferença de tamanho aparece.
await page.evaluate(() => window.__roquecraft.frameMobs(7, 2.5))
await page.waitForTimeout(500)
await foto('1-curral.png')

// ── 2. Tosquiar ─────────────────────────────────────────────────────────────
await page.evaluate((y) => {
  const rc = window.__roquecraft
  rc.limparMobs()
  rc.teleport(0.5, y + 1, 0.5)
  rc.look(0, 0)
  rc.spawnMob('sheep', 2.2, 0)
}, y)
await page.waitForTimeout(700)
const laAntes = await page.evaluate(
  () => window.__roquecraft.dropsInfo().filter((d) => d.item === 'whiteWool').length,
)
const cliqueTesoura = await clicarNoBicho('shears', 0)
await page.waitForTimeout(700)
const depoisDaTosquia = await page.evaluate(() => {
  const rc = window.__roquecraft
  return {
    la: rc.dropsInfo().filter((d) => d.item === 'whiteWool').length,
    ovelha: rc.mobsInfo()[0] ?? null,
  }
})

// ── 3. LEVAR A VACA PELO TRIGO ──────────────────────────────────────────────
//
// ⚠️ É O TESTE DO CICLO INTEIRO DA FAZENDA. Cerca + portão dão como PRENDER o
// rebanho e a pecuária como multiplicá-lo; faltava o meio — como levar a vaca
// de onde ela está até dentro do curral. Aqui o jogador anda de costas com
// trigo na mão e a vaca tem que vir junto.
//
// PROVA DE VIDA: a mesma caminhada é feita DUAS vezes, uma com trigo na mão e
// outra de mãos vazias. Se as duas dessem o mesmo, a medida não estaria vendo o
// trigo — estaria vendo a vaca vagando.
async function caminhar(item) {
  await page.evaluate(
    ([y, item]) => {
      const rc = window.__roquecraft
      rc.limparMobs()
      rc.setFlying(false)
      rc.teleport(0.5, y + 1, 0.5)
      rc.look(0, 0)
      rc.equipar(item, item ? 8 : 0)
      rc.spawnMob('cow', 4, 0)
    },
    [y, item],
  )
  await page.waitForTimeout(900)
  const inicio = await page.evaluate(() => {
    const m = window.__roquecraft.mobsInfo()[0]
    return m ? { x: m.x, z: m.z } : null
  })
  // O jogador recua 8 blocos, de meio em meio, como quem puxa o rebanho.
  for (let i = 1; i <= 16; i++) {
    await page.evaluate(([y, i]) => window.__roquecraft.teleport(0.5, y + 1, 0.5 + i * 0.5), [y, i])
    await page.waitForTimeout(180)
  }
  await page.waitForTimeout(600)
  const fim = await page.evaluate(() => {
    const m = window.__roquecraft.mobsInfo()[0]
    return m ? { x: m.x, z: m.z } : null
  })
  return {
    item: item || 'mao vazia',
    // Quanto a vaca ANDOU no eixo em que o jogador recuou.
    andou: inicio && fim ? +(fim.z - inicio.z).toFixed(2) : null,
    distanciaFinalDoJogador: fim ? +Math.hypot(fim.x - 0.5, fim.z - (0.5 + 8)).toFixed(2) : null,
  }
}

const comTrigo = await caminhar('wheat')
const semNada = await caminhar(null)

// ── 4. O que o save leva ────────────────────────────────────────────────────
const payload = await page.evaluate(() => {
  const p = window.__roquecraft.payloadDeSave()
  return { versao: p.version, mobs: p.mobs }
})

console.log(
  JSON.stringify(
    {
      alimentar: {
        // Prova de vida: se `amorAntes` não for [0, 0], o "amor depois" não
        // significa que o clique fez alguma coisa.
        amorAntes: antesDeAlimentar.map((m) => m.amor),
        cliqueA,
        cliqueB,
        depois: depoisDeAlimentar,
        nasceuFilhote: depoisDeAlimentar.some((m) => m.bebe > 0),
      },
      tosquiar: {
        laNoChaoAntes: laAntes,
        clique: cliqueTesoura,
        laNoChaoDepois: depoisDaTosquia.la,
        ovelhaTosquiada: depoisDaTosquia.ovelha?.tosquiada ?? null,
      },
      seguirOTrigo: { comTrigo, semNada },
      save: payload,
      fotos: SAIDA,
      erros,
    },
    null,
    2,
  ),
)

await ctx.close()
await b.close()
s.close()

// `erros` era acumulado e so impresso. A pecuaria ja foi anulada uma vez por uma
// constante escrita meses antes (o despawn a 72 blocos apagava o curral): uma
// sonda que nao reprova nao teria pego isso no dia seguinte.
if (erros.length) {
  console.error('\n[pecuaria] ❌', erros.join(' | '))
  process.exit(1)
}
