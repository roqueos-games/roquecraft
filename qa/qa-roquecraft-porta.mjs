//
// A PORTA — cinco perguntas, todas pelo caminho do JOGO.
//
// `porta.spec.js` prova as 16 variantes, o encaixe e o virar. Nada disso prova
// que no jogo o clique direito coloca DUAS metades, que o clique nela abre as
// duas, que fechada ela BARRA e aberta DEIXA PASSAR, que a casa da vila nasce
// com porta, e que o aldeão sabe abrir a dele. Entre a regra pura e o mundo há
// o `doPlace`, o `tryInteract`, a colisão do jogador e a IA em `mobs.js`.
//
//   1. o clique coloca a porta: duas células, a de cima marcada `Cima`;
//   2. o clique na porta ABRE as duas metades; de novo, FECHA as duas;
//   3. fechada, o jogador andando nela não passa; aberta, atravessa;
//   4. a vila tem porta de verdade (célula `oakDoor*` no raio da vila);
//   5. um aldeão num corredor com uma porta, mandado pra fora, ABRE a porta,
//      sai e a FECHA atrás de si.
//
// ⚠️ PROVA DE VIDA: o par 3 mede a MESMA caminhada com a porta fechada e
// aberta; se as duas leituras coincidirem, a sonda não está medindo a porta.
//
//   node scripts/qa-roquecraft-porta.mjs
//
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { servirDist } from './lib/servidor-do-dist.mjs'

const SAIDA = path.resolve('scripts/.qa-porta')
fs.mkdirSync(SAIDA, { recursive: true })
const { base, fechar } = await servirDist('dist/pwa')
const b = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const ctx = await b.newContext({
  viewport: { width: 1280, height: 800 },
  serviceWorkers: 'block',
  locale: 'pt-BR',
})
const page = await ctx.newPage()
const erros = []
page.on('pageerror', (e) => erros.push(String(e.message).slice(0, 200)))
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
await page.evaluate(() => window.__rosStore?.maximizeWindow?.('roquecraft'))
await page.addStyleTag({ content: '.ros-roquecraft__play{display:none !important}' })
const foto = (nome) => page.screenshot({ path: path.join(SAIDA, nome) })

const v = []
let bom = true
const ok = (c, m) => {
  v.push(`${c ? '✅' : '❌'} ${m}`)
  if (!c) bom = false
  return c
}

// Um platô de grama 14 blocos acima do terreno: nada do mundo atrapalha.
const y = await page.evaluate(() => {
  const rc = window.__roquecraft
  rc.setMode('creative')
  const y = Math.round(rc.surfaceAt(0, 0) ?? 66) + 14
  rc.setFlying(true)
  rc.teleport(0.5, y + 3, 0.5)
  rc.fill(-14, y - 2, -14, 20, y, 20, 'grassBlock')
  return y
})
await page.waitForTimeout(2200)

/** As chaves das duas células da porta em (x, z), de baixo pra cima. */
const metades = (x, z) =>
  page.evaluate(
    ([x, y, z]) => [
      window.__roquecraft.blockKeyAt(x, y + 1, z),
      window.__roquecraft.blockKeyAt(x, y + 2, z),
    ],
    [x, y, z],
  )
/** Olha do olho (ox, oz) pro ponto (tx, ty, tz), parado no chão. */
const olharDe = (ox, oz, tx, ty, tz) =>
  page.evaluate(
    ([ox, oz, tx, ty, tz, y]) => {
      const rc = window.__roquecraft
      rc.setFlying(true)
      rc.teleport(ox, y + 1, oz)
      rc.setFlying(false)
      const olhoY = y + 1 + 1.62
      const dist = Math.hypot(tx - ox, tz - oz)
      rc.look(Math.atan2(tx - ox, -(tz - oz)), -Math.atan2(olhoY - ty, dist))
    },
    [ox, oz, tx, ty, tz, y],
  )

// ── 1. O CLIQUE COLOCA A PORTA ──────────────────────────────────────────────
await page.evaluate(() => window.__roquecraft.equipar('oakDoor', 3))
await olharDe(0.5, -2.5, 0.5, y + 1, 0.5) // o topo do bloco de chão em (0, y, 0)
await page.waitForTimeout(400)
const mirada = await page.evaluate(() => window.__roquecraft.miraEm())
const colocou = await page.evaluate(() => window.__roquecraft.place())
await page.waitForTimeout(500)
let m = await metades(0, 0)
ok(
  mirada && mirada.y === y && mirada.x === 0 && mirada.z === 0,
  `a mira estava no chão em (0,${y},0): ${JSON.stringify(mirada)}`,
)
ok(
  colocou !== false && m[0].startsWith('oakDoor') && !m[0].includes('Cima'),
  `a metade de baixo nasceu: ${m[0]}`,
)
ok(m[1].startsWith('oakDoor') && m[1].includes('Cima'), `a metade de cima nasceu junto: ${m[1]}`)
ok(!m[0].includes('Aberta') && !m[1].includes('Aberta'), 'a porta nasce fechada')
const restou = await page.evaluate(() => window.__roquecraft.contarItem('oakDoor'))
ok(restou === 3, `no criativo a pilha não gasta (${restou} de 3)`)

/** Olha a porta DE LADO, com a mira fora dela (sem fantasma nem contorno). */
const fotoDeLado = () =>
  page.evaluate(
    ([y]) => {
      const rc = window.__roquecraft
      rc.setFlying(true)
      rc.teleport(3.2, y + 2.2, -3.2)
      rc.look(Math.atan2(0.5 - 3.2, -(0.5 + 3.2)), -0.18)
    },
    [y],
  )

/**
 * Mira a PORTA em (0, y+1, 0) e devolve onde a mira encostou.
 *
 * ⚠️ ABERTA, A FOLHA É FINA E FICA NA BORDA DA CÉLULA: mirar o centro da célula
 * passa pelo vão e encosta no chão atrás — foi assim que a primeira rodada
 * "não fechou" a porta. A sonda tenta o centro e depois as quatro bordas, e
 * fica com a primeira que encosta na célula certa. É o que o jogador faz ao
 * clicar na tábua que está vendo.
 */
async function mirarAPorta() {
  for (const [tx, tz] of [
    [0.5, 0.5],
    [0.1, 0.5],
    [0.9, 0.5],
    [0.5, 0.1],
    [0.5, 0.9],
  ]) {
    await olharDe(0.5, -2.5, tx, y + 1.5, tz)
    await page.waitForTimeout(250)
    const m = await page.evaluate(() => window.__roquecraft.miraEm())
    if (m && m.x === 0 && m.y === y + 1 && m.z === 0) return m
  }
  return null
}

// ── 2. O CLIQUE ABRE E FECHA AS DUAS METADES ────────────────────────────────
await page.evaluate(() => window.__roquecraft.equipar(null))
ok(!!(await mirarAPorta()), 'a mira encosta na porta fechada')
const abriu = await page.evaluate(() => window.__roquecraft.interagir())
await page.waitForTimeout(400)
m = await metades(0, 0)
ok(
  abriu && m[0].includes('Aberta') && m[1].includes('Aberta'),
  `o clique abre as DUAS metades: ${m.join(' / ')}`,
)
await fotoDeLado()
await page.waitForTimeout(700)
await foto('1-porta-aberta.png')
ok(!!(await mirarAPorta()), 'a mira encosta na folha da porta aberta')
const fechou = await page.evaluate(() => window.__roquecraft.interagir())
await page.waitForTimeout(400)
m = await metades(0, 0)
ok(
  fechou && !m[0].includes('Aberta') && !m[1].includes('Aberta'),
  `o segundo clique fecha as DUAS: ${m.join(' / ')}`,
)
await fotoDeLado()
await page.waitForTimeout(700)
await foto('2-porta-fechada.png')

// ── 3. FECHADA BARRA, ABERTA DEIXA PASSAR ───────────────────────────────────
// Paredes dos dois lados da porta, pra caminhada só ter um caminho.
await page.evaluate(
  ([y]) => {
    const rc = window.__roquecraft
    rc.fill(-2, y + 1, 0, -1, y + 2, 0, 'stone')
    rc.fill(1, y + 1, 0, 2, y + 2, 0, 'stone')
  },
  [y],
)
await page.waitForTimeout(600)
async function andarContraAPorta() {
  return page.evaluate(
    async ([y]) => {
      const rc = window.__roquecraft
      rc.setFlying(true)
      rc.teleport(0.5, y + 1, -1.5)
      rc.setFlying(false)
      rc.look(Math.PI, 0) // olhando pra +Z
      await new Promise((r) => setTimeout(r, 200))
      rc.press('forward', true)
      await new Promise((r) => setTimeout(r, 1200))
      rc.press('forward', false)
      await new Promise((r) => setTimeout(r, 200))
      return rc.state.player.z
    },
    [y],
  )
}
const zFechada = await andarContraAPorta()
ok(zFechada < 0.5, `fechada, a porta BARRA: z=${zFechada.toFixed(2)} (< 0,5)`)
await mirarAPorta()
await page.evaluate(() => window.__roquecraft.interagir())
await page.waitForTimeout(400)
m = await metades(0, 0)
ok(m[0].includes('Aberta'), `reaberta pra caminhada: ${m[0]}`)
const zAberta = await andarContraAPorta()
ok(zAberta > 1, `aberta, o jogador ATRAVESSA: z=${zAberta.toFixed(2)} (> 1)`)
ok(
  zAberta - zFechada > 1,
  `prova de vida: as duas caminhadas diferem (${(zAberta - zFechada).toFixed(2)})`,
)

// ── 4. A VILA TEM PORTA ─────────────────────────────────────────────────────
const vila = await page.evaluate(async () => {
  const rc = window.__roquecraft
  const plano = rc.procurarAldeia(6)
  if (!plano) return null
  rc.setFlying(true)
  rc.teleport(plano.centro.x + 0.5, plano.chao + 12, plano.centro.z + 0.5)
  await rc.waitChunks(4)
  await new Promise((r) => setTimeout(r, 1500))
  const raio = rc.raioDaVila()
  let baixo = 0
  let cima = 0
  for (let x = plano.centro.x - raio; x <= plano.centro.x + raio; x++) {
    for (let z = plano.centro.z - raio; z <= plano.centro.z + raio; z++) {
      for (let yy = plano.chao - 6; yy <= plano.chao + 12; yy++) {
        const k = rc.blockKeyAt(x, yy, z)
        if (!k.startsWith('oakDoor')) continue
        if (k.includes('Cima')) cima++
        else baixo++
      }
    }
  }
  return { centro: plano.centro, chao: plano.chao, baixo, cima }
})
ok(!!vila, `achou uma vila: ${JSON.stringify(vila)}`)
if (vila) {
  ok(vila.baixo >= 1, `a vila tem porta (${vila.baixo} de baixo)`)
  ok(vila.cima === vila.baixo, `cada porta tem as duas metades (${vila.cima} de cima)`)
  await page.evaluate(
    ([c, chao]) => {
      const rc = window.__roquecraft
      rc.teleport(c.x + 14, chao + 8, c.z + 14)
      rc.look(Math.atan2(c.x - (c.x + 14), -(c.z - (c.z + 14))), -0.35)
    },
    [vila.centro, vila.chao],
  )
  await page.waitForTimeout(1500)
  await foto('3-vila-com-portas.png')
}

// ── 5. O ALDEÃO ABRE A PORTA, SAI E FECHA ───────────────────────────────────
// Um corredor de 1×4 em (11, y+1..y+2, 9..12), porta na ponta z=8. O aldeão
// nasce dentro; qualquer vagueio rumo a −Z leva a quina dele à porta.
const PX = 11
const aldeao = await page.evaluate(
  async ([y, PX]) => {
    const rc = window.__roquecraft
    rc.limparMobs()
    // ⚠️ DE VOLTA AO PLATÔ, E ESPERANDO OS CHUNKS. A sonda vinha da vila, a 400
    // blocos daqui: sem esperar, o `fill` escrevia num chunk que ainda não
    // existia no espelho e o corredor inteiro lia `air`.
    rc.setFlying(true)
    rc.teleport(PX + 0.5, y + 4, 11.5)
    await rc.waitChunks(4)
    await new Promise((r) => setTimeout(r, 1500))
    // Sem teto: `spawnMob` nasce em cima do topo SÓLIDO da coluna, e com teto
    // o aldeão nascia no telhado.
    rc.fill(PX - 1, y + 1, 8, PX + 1, y + 2, 13, 'stone')
    rc.fill(PX, y + 1, 8, PX, y + 2, 12, 'air')
    rc.fill(PX, y + 1, 8, PX, y + 1, 8, 'oakDoorNz')
    rc.fill(PX, y + 2, 8, PX, y + 2, 8, 'oakDoorNzCima')
    await new Promise((r) => setTimeout(r, 800))
    const corredor = [
      rc.blockKeyAt(PX, y + 1, 8),
      rc.blockKeyAt(PX, y + 1, 10),
      rc.blockKeyAt(PX - 1, y + 1, 10),
    ]
    rc.setFlying(true)
    rc.teleport(PX + 0.5, y + 1, 11.5)
    rc.look(0, 0)
    const nasceu = rc.spawnMob('aldeao', 0)
    // ⚠️ MANDADO, NÃO SORTEADO. Com o vagueio a sonda era loteria: em 60 s o
    // aldeão abria a porta, o alvo mudava, ele voltava e fechava sem passar.
    // `mandarMob` põe o alvo do outro lado da porta pelo MESMO estado
    // (`wander`) que o vagueio usa — a IA da porta é a mesma; só o rumo é fixo.
    const mandou = rc.mandarMob('aldeao', PX + 0.5, 3.5)
    // O olho sai pra fora, a 8 blocos, olhando o corredor.
    rc.teleport(PX + 5.5, y + 4, 4.5)
    rc.look(Math.atan2(PX + 0.5 - (PX + 5.5), -(8.5 - 4.5)), -0.35)
    const porta = () => rc.blockKeyAt(PX, y + 1, 8)
    const t0 = Date.now()
    const traco = []
    let abriuEm = null
    let saiuEm = null
    let fechouEm = null
    while (Date.now() - t0 < 45000) {
      await new Promise((r) => setTimeout(r, 250))
      const a = rc.criaturas().find((c) => c.tipo === 'aldeao')
      if (!a) break
      const k = porta()
      traco.push([Date.now() - t0, +a.x.toFixed(3), +a.z.toFixed(3), k])
      if (abriuEm == null && k.includes('Aberta')) abriuEm = Date.now() - t0
      if (saiuEm == null && a.z < 8) saiuEm = Date.now() - t0
      if (saiuEm != null && fechouEm == null && !k.includes('Aberta')) {
        fechouEm = Date.now() - t0
        break
      }
    }
    const a = rc.criaturas().find((c) => c.tipo === 'aldeao')
    return {
      nasceu,
      mandou,
      traco: traco.filter((_, i) => i % 4 === 0).slice(0, 14),
      caixasDaPorta: rc.solidoEm(PX, y + 1, 8),
      corredor,
      porta: porta(),
      abriuEm,
      saiuEm,
      fechouEm,
      onde: a && { x: a.x, y: a.y, z: a.z },
    }
  },
  [y, PX],
)
ok(
  aldeao.corredor[0] === 'oakDoorNz' &&
    aldeao.corredor[1] === 'air' &&
    aldeao.corredor[2] === 'stone',
  `o corredor foi construído: ${aldeao.corredor.join(' / ')}`,
)
ok(
  aldeao.nasceu && aldeao.mandou && aldeao.onde && aldeao.onde.y < y + 1.5,
  `o aldeão nasceu no corredor e foi mandado pra fora (y=${aldeao.onde?.y?.toFixed(2)})`,
)
ok(aldeao.abriuEm != null, `o aldeão ABRIU a porta (${aldeao.abriuEm} ms)`)
ok(
  aldeao.saiuEm != null,
  `o aldeão SAIU do corredor (${aldeao.saiuEm} ms; está em ${JSON.stringify(aldeao.onde)})`,
)
ok(
  aldeao.fechouEm != null,
  `e FECHOU a porta atrás de si (${aldeao.fechouEm} ms; porta agora: ${aldeao.porta})`,
)
await foto('4-aldeao-saiu.png')

console.log(v.join('\n'))
console.log(JSON.stringify({ y, vila, aldeao, fotos: SAIDA, erros }, null, 2))
ok(erros.length === 0, `sem erro de página (${erros.length})`)
await ctx.close()
await b.close()
await fechar()
process.exit(bom ? 0 : 1)
