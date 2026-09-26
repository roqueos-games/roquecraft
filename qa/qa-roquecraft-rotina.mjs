//
// A ROTINA DO ALDEÃO, medida na vila de verdade: dia no quintal, noite em
// casa (com a porta fechada atrás), fuga do zumbi — e o zumbi que NÃO entra.
//
// `rotina.spec.js` prova a decisão num campo aberto. A vila tem paredes,
// portas e outros nove aldeões; entre a regra e o mundo está a porta que ele
// precisa abrir para sair e para voltar. Quatro afirmações:
//   1. de DIA, em 20 s, nenhum morador passa de RAIO_DO_QUINTAL + 2 da casa;
//   2. de NOITE, em 60 s, todo morador está a menos de 1,5 da casa, e nenhuma
//      porta da vila fica aberta;
//   3. um zumbi posto a 4 blocos de um morador: em 4 s a distância entre os
//      dois CRESCE;
//   4. o jogador dentro de uma casa com a porta fechada e um zumbi do lado de
//      fora: em 10 s o zumbi continua fora e a porta continua fechada.
//
//   node scripts/qa-roquecraft-rotina.mjs
//
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { servirDist } from './lib/servidor-do-dist.mjs'

const SAIDA = path.resolve('scripts/.qa-rotina')
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
const RAIO_DO_QUINTAL = 6

// À vila, de dia, olhando de cima.
const vila = await page.evaluate(async () => {
  const rc = window.__roquecraft
  rc.setMode('creative')
  const plano = rc.procurarAldeia(6)
  if (!plano) return null
  rc.setTime(3000)
  rc.setFlying(true)
  rc.teleport(plano.centro.x + 0.5, plano.chao + 18, plano.centro.z + 0.5)
  await rc.waitChunks(4)
  await new Promise((r) => setTimeout(r, 2500))
  rc.look(0, -1.2)
  return { centro: plano.centro, chao: plano.chao, raio: rc.raioDaVila() }
})
ok(!!vila, `achou a vila: ${JSON.stringify(vila)}`)
const moradores = () => page.evaluate(() => window.__roquecraft.moradoresPerto())
const portasAbertas = () =>
  page.evaluate(
    ([c, chao, raio]) => {
      const rc = window.__roquecraft
      let abertas = 0
      let total = 0
      for (let x = c.x - raio; x <= c.x + raio; x++)
        for (let z = c.z - raio; z <= c.z + raio; z++)
          for (let y = chao - 4; y <= chao + 8; y++) {
            const k = rc.blockKeyAt(x, y, z)
            if (!k.startsWith('oakDoor') || k.includes('Cima')) continue
            total++
            if (k.includes('Aberta')) abertas++
          }
      return { abertas, total }
    },
    [vila.centro, vila.chao, vila.raio],
  )

// ── 1. DE DIA, O QUINTAL ────────────────────────────────────────────────────
let n0 = (await moradores()).length
ok(n0 >= 3, `a vila tem moradores (${n0})`)
let maxDia = 0
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(1000)
  for (const m of await moradores()) maxDia = Math.max(maxDia, m.daCasa)
}
ok(
  maxDia <= RAIO_DO_QUINTAL + 2,
  `de dia ninguém passa do quintal: máximo ${maxDia.toFixed(2)} da casa (teto ${RAIO_DO_QUINTAL + 2})`,
)
await foto('1-dia.png')

// ── 2. DE NOITE, EM CASA, COM A PORTA FECHADA ───────────────────────────────
await page.evaluate(() => window.__roquecraft.setTime(18000))
let noite = null
for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(1000)
  const ms = await moradores()
  noite = { max: Math.max(...ms.map((m) => m.daCasa)), n: ms.length, ms }
  if (noite.max <= 1.5) break
}
ok(
  noite.max <= 1.5,
  `de noite todo mundo em casa: máximo ${noite.max.toFixed(2)} da casa (${noite.n} moradores)`,
)
await page.waitForTimeout(3000)
const portas = await portasAbertas()
ok(
  portas.total >= 3 && portas.abertas === 0,
  `as casas fecham: ${portas.abertas} porta(s) aberta(s) de ${portas.total}`,
)
await foto('2-noite.png')

// ── 3. O ZUMBI CHEGA: O ALDEÃO FOGE ─────────────────────────────────────────
const fuga = await page.evaluate(async () => {
  const rc = window.__roquecraft
  const alvo = rc.moradoresPerto()[0]
  // O jogador desce até o aldeão, põe o zumbi a 4 blocos dele, e SOBE: fora do
  // alcance de perseguição, o zumbi não tem jogador para caçar.
  rc.setFlying(true)
  rc.teleport(alvo.casa.x + 0.5, rc.state.player.y, alvo.casa.z + 0.5)
  const y = rc.surfaceAt(alvo.casa.x, alvo.casa.z - 5) ?? rc.state.player.y
  rc.teleport(alvo.casa.x + 0.5, y + 1, alvo.casa.z - 5)
  rc.look(Math.PI, 0)
  await new Promise((r) => setTimeout(r, 300))
  const nasceu = rc.spawnMob('zombie', 1)
  rc.teleport(alvo.casa.x + 0.5, y + 40, alvo.casa.z - 5)
  const dist = () => {
    const z = rc.criaturas().find((c) => c.tipo === 'zombie')
    const a = rc.moradoresPerto().find((m) => m.id === alvo.id)
    return z && a ? Math.hypot(a.x - z.x, a.z - z.z) : null
  }
  const antes = dist()
  await new Promise((r) => setTimeout(r, 4000))
  const depois = dist()
  const a = rc.moradoresPerto().find((m) => m.id === alvo.id)
  return { nasceu, antes, depois, estado: a?.estado }
})
ok(
  fuga.nasceu && fuga.antes != null && fuga.depois != null,
  `o zumbi nasceu perto do aldeão: ${JSON.stringify(fuga)}`,
)
ok(
  fuga.depois - fuga.antes > 1.5,
  `o aldeão FOGE: ${fuga.antes?.toFixed(1)} → ${fuga.depois?.toFixed(1)} (estado ${fuga.estado})`,
)
await foto('3-fuga.png')

// ── 4. O ZUMBI NÃO ENTRA ────────────────────────────────────────────────────
// O jogador dentro da casa de um morador, porta fechada, zumbi do lado de fora.
const cerco = await page.evaluate(async () => {
  const rc = window.__roquecraft
  // A casa ANTES de limpar as criaturas: `limparMobs` leva os moradores junto.
  const casa = rc.moradoresPerto()[0]?.casa ?? null
  if (!casa) return null
  rc.limparMobs()
  const y = rc.surfaceAt(casa.x, casa.z - 6) ?? 64
  // A porta fica na parede de −Z da casa. Se o morador a deixou aberta, fecha.
  // A parede de −Z fica a `lz` do centro, e `lz` é 2 ou 3 conforme a planta.
  // ⚠️ A ORIGEM É `Math.round(c.x + 0.5)`: pode cair uma coluna à direita do
  // centro da casa. Varre as três colunas em volta.
  const porta = { x: null, z: null }
  let yPorta = null
  for (const dx of [0, -1, 1]) {
    for (const dz of [2, 3, 4]) {
      for (let yy = y - 3; yy <= y + 6 && yPorta == null; yy++) {
        const k = rc.blockKeyAt(casa.x + dx, yy, casa.z - dz)
        if (k.startsWith('oakDoor') && !k.includes('Cima')) {
          yPorta = yy
          porta.x = casa.x + dx
          porta.z = casa.z - dz
        }
      }
      if (yPorta != null) break
    }
    if (yPorta != null) break
  }
  if (yPorta == null) return { casa, semPorta: true }
  if (rc.blockKeyAt(porta.x, yPorta, porta.z).includes('Aberta')) {
    rc.fill(
      porta.x,
      yPorta,
      porta.z,
      porta.x,
      yPorta,
      porta.z,
      rc.blockKeyAt(porta.x, yPorta, porta.z).replace('Aberta', ''),
    )
    rc.fill(
      porta.x,
      yPorta + 1,
      porta.z,
      porta.x,
      yPorta + 1,
      porta.z,
      rc.blockKeyAt(porta.x, yPorta + 1, porta.z).replace('Aberta', ''),
    )
  }
  rc.setFlying(true)
  rc.teleport(casa.x + 0.5, yPorta, casa.z + 0.5) // dentro, no meio da casa
  // ⚠️ YAW 0 OLHA PARA −Z (a convenção da câmera; `Math.PI` olha para +Z e a
  // primeira rodada pôs o zumbi ATRÁS da casa). A porta é a parede de −Z.
  rc.look(0, 0)
  rc.setFlying(false)
  await new Promise((r) => setTimeout(r, 400))
  const nasceu = rc.spawnMob('zombie', 7) // 7 blocos à frente: do lado de fora
  const zumbi = () => rc.criaturas().find((c) => c.tipo === 'zombie')
  const z0 = zumbi()
  await new Promise((r) => setTimeout(r, 10000))
  const z1 = zumbi()
  const p = rc.state.player
  return {
    casa,
    yPorta,
    nasceu,
    zumbiNasceuFora: z0 ? z0.z < porta.z : null,
    distAntes: z0 && Math.hypot(z0.x - p.x, z0.z - p.z),
    distDepois: z1 && Math.hypot(z1.x - p.x, z1.z - p.z),
    zumbiDentro: z1
      ? Math.abs(z1.x - (casa.x + 0.5)) < 3 && Math.abs(z1.z - (casa.z + 0.5)) < 3
      : null,
    portaNoFim: rc.blockKeyAt(porta.x, yPorta, porta.z),
    moradoresNoFim: rc
      .moradoresPerto()
      .map((m) => ({ id: m.id, daCasa: +m.daCasa.toFixed(1), estado: m.estado })),
    jogador: { x: p.x, y: p.y, z: p.z },
  }
})
ok(
  cerco && !cerco.semPorta && cerco.nasceu && cerco.zumbiNasceuFora,
  `o zumbi nasceu do lado de fora da casa: ${JSON.stringify(cerco)}`,
)
ok(
  cerco && cerco.zumbiDentro === false,
  `em 10 s o zumbi NÃO entrou (dist ${cerco?.distAntes?.toFixed(1)} → ${cerco?.distDepois?.toFixed(1)})`,
)
ok(
  cerco && !String(cerco.portaNoFim).includes('Aberta'),
  `e a porta continua fechada: ${cerco?.portaNoFim}`,
)
await foto('4-cerco.png')

console.log(v.join('\n'))
console.log(
  JSON.stringify(
    {
      vila,
      maxDia,
      noite: { max: noite.max, n: noite.n },
      portas,
      fuga,
      cerco,
      fotos: SAIDA,
      erros,
    },
    null,
    2,
  ),
)
ok(erros.length === 0, `sem erro de página (${erros.length})`)
await ctx.close()
await b.close()
await fechar()
process.exit(bom ? 0 : 1)
