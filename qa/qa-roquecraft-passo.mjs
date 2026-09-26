//
// O PASSO, MEDIDO: dispara parado? com que cadência anda?
//
// O founder relatou duas coisas que soam parecidas e têm causas diferentes:
// "na areia dá passo mesmo eu parado" e "na grama demora demais entre um passo
// e outro". A primeira é um disparo que não devia existir; a segunda é uma
// constante mal escolhida. Palpite não separa as duas — contador separa.
//
// Mede pelo caminho REAL: monta um piso do material, segura a tecla de andar e
// conta os disparos que o áudio registrou. Nada de inspecionar variável interna
// do passo: o que interessa é o que o jogador ouve.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const DIST = path.resolve('dist/pwa')
const MATERIAIS = (process.argv[2] || 'grassBlock,sand,stone,gravel,snowLayer,oakPlanks').split(',')
const PARADO_S = Number(process.argv[3] || 6)
const ANDANDO_S = Number(process.argv[4] || 6)

const TIPO = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ogg': 'audio/ogg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
}
const srv = http.createServer((q, r) => {
  const p = decodeURIComponent((q.url || '/').split('?')[0])
  let f = path.join(DIST, p)
  try {
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = shellDoApp(DIST)
  } catch {
    f = shellDoApp(DIST)
  }
  r.setHeader('Content-Type', TIPO[path.extname(f)] || 'application/octet-stream')
  fs.createReadStream(f).pipe(r)
})
await new Promise((r) => srv.listen(0, r))
const base = `http://localhost:${srv.address().port}`

const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] })
const page = await b.newPage({ viewport: { width: 900, height: 600 } })
const erros = []
page.on('pageerror', (e) => erros.push(e.message.slice(0, 160)))
await page.addInitScript(
  `window.__ROS_E2E__={auth:{uid:'e2e',email:'e@e.t',emailVerified:true,displayName:'E',role:'user'},googleDrive:{isConnected:false,files:[],user:{}},googleMapsApiKey:'',roquecraftSeed:20260819}`,
)
await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => !!window.__rosStore, null, { timeout: 30000 })
await page.waitForTimeout(1000)
await page.evaluate(() => window.__rosStore.openWindow('roquecraft'))
await page.waitForFunction(() => window.__roquecraft?.state?.ready === true, null, {
  timeout: 90000,
})
// ⚠️ PROVA DE VIDA DO CONTADOR, ANTES DE MEDIR QUALQUER COISA.
//
// Um contador que só sabe devolver zero não é medição — é um zero. Esta versão
// do harness já me devolveu "nenhum passo andando 28 metros" duas vezes, e as
// duas foram culpa do instrumento: da primeira eu lia uma cópia congelada da
// posição, da segunda o áudio nem tinha instância (sem gesto do usuário o
// contexto não nasce, e `audio?.step()` vira no-op silencioso).
//
// Agora o harness destrava o áudio, confere que existe instância e dispara um
// evento de controle. Se o contador não se mexer aqui, ele aborta em vez de
// produzir uma tabela de zeros convincente.
const vida = await page.evaluate(async () => {
  const g = window.__roquecraft
  g.setMode('creative')
  g.gotoBiome('plains')
  await g.waitChunks(4)
  g.setTime(6000)
  g.somDestravar?.()
  await g.somCarregar?.()
  g.somZerarDisparos()
  // Olhar pros PÉS antes de quebrar: `breakNow` precisa de bloco na mira e
  // devolve false calado se não houver. Com a câmera no horizonte a prova de
  // vida acusava o contador quando o problema era a mira.
  g.look(0, -1.35)
  await new Promise((r) => setTimeout(r, 300))
  const quebrou = g.breakNow?.()
  await new Promise((r) => setTimeout(r, 400))
  // ⚠️ o contador mora em bancoInfo, NÃO em info(): procurei no lugar errado e
  // o harness me devolveu zero em tudo com ar de resultado.
  const info = g.somInfo()
  return {
    instancia: info.instancia,
    ligado: info.ligado,
    quebrou,
    disparos: g.somBanco()?.disparos,
  }
})
if (!vida.instancia || !Object.keys(vida.disparos || {}).length) {
  console.log(
    JSON.stringify(
      { abortado: 'o contador de som nao reagiu ao evento de controle', vida },
      null,
      2,
    ),
  )
  await b.close()
  srv.close()
  process.exit(2)
}

const linhas = []
for (const key of MATERIAIS) {
  const r = await page.evaluate(
    async ([mat, tParado, tAndando]) => {
      const g = window.__roquecraft
      const dorme = (ms) => new Promise((r) => setTimeout(r, ms))
      // ⚠️ `state` é GETTER e devolve uma cópia nova do jogador a cada acesso.
      // Guardar `const p = g.state.player` congela a posição no instante da
      // leitura: a primeira versão deste harness mediu distância 0 em tudo e
      // eu quase reportei "andar não dispara passo".
      const pos = () => g.state.player
      // Pista longa e plana do material, pra andar em linha reta sem degrau:
      // degrau dispara o baque de aterrissagem e contaminaria a contagem.
      const bx = Math.floor(pos().x)
      const bz = Math.floor(pos().z)
      const chao = g.surfaceAt(bx, bz)
      g.fill(bx - 6, chao - 1, bz - 4, bx + 70, chao - 1, bz + 4, mat)
      g.fill(bx - 6, chao, bz - 4, bx + 70, chao + 3, bz + 4, 'air')
      await dorme(500)
      g.setFlying(false)
      g.teleport(bx + 0.5, chao + 0.3, bz + 0.5)
      g.setFlying(false)
      await dorme(1400)

      const px = Math.floor(pos().x)
      const pz = Math.floor(pos().z)
      const soPe = g.blocoEm(px, Math.floor(pos().y) - 1, pz)

      // ── PARADO ──────────────────────────────────────────────────────────
      g.somZerarDisparos()
      const antes = pos()
      await dorme(tParado * 1000)
      const parado = g.somBanco().disparos?.step || 0
      const depois = pos()
      const deslizou = +Math.hypot(depois.x - antes.x, depois.z - antes.z).toFixed(3)

      // ── ANDANDO ─────────────────────────────────────────────────────────
      g.look(Math.PI / 2, 0) // +X, que é o comprimento da pista
      await dorme(200)
      g.somZerarDisparos()
      const a = pos()
      const t0 = performance.now()
      g.press('forward', true)
      await dorme(tAndando * 1000)
      g.press('forward', false)
      const seg = (performance.now() - t0) / 1000
      const andando = g.somBanco().disparos?.step || 0
      const bfim = pos()
      const dist = Math.hypot(bfim.x - a.x, bfim.z - a.z)
      await dorme(300)

      return {
        mat,
        soPe,
        naPista: soPe === mat,
        parado,
        deslizou,
        andando,
        dist: +dist.toFixed(2),
        seg: +seg.toFixed(2),
        vel: +(dist / seg).toFixed(2),
        intervalo: andando ? +(seg / andando).toFixed(3) : null,
        metrosPorPasso: andando ? +(dist / andando).toFixed(2) : null,
      }
    },
    [key, PARADO_S, ANDANDO_S],
  )
  linhas.push(r)
}

await b.close()
srv.close()
const ruins = linhas.filter((l) => l.parado > 0)
console.log(
  JSON.stringify(
    { erros, vida, paradoDisparando: ruins.map((l) => `${l.mat}:${l.parado}`), linhas },
    null,
    2,
  ),
)
