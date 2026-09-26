//
// A CIDADE, FOTOGRAFADA — pela primeira vez (Goal 21, 2.4).
//
// A cidade existe no gerador desde o Goal 20 (26 casas em quatro coroas,
// igreja com torre, feira com cinco bancas, lojas com tabuleta) e nunca teve
// sonda própria: a única medida era o teste puro do plano. Entre o plano e a
// tela há o chunk que carrega, a malha que fecha e — descoberto ao escrever
// isto — os moradores, que só a VILA ganhava (`planoDaAldeia` no povoar).
//
//   1. existe uma cidade nas primeiras células da grade dela;
//   2. a torre da igreja está DE PÉ no mundo (coluna sólida até a altura dela);
//   3. as cinco bancas da feira têm toldo;
//   4. a cidade tem MORADORES (≥ metade das casas), com ofício;
//   5. a malha em volta do centro não tem buraco (`auditarMalha`);
//   6. fotos: aérea, a praça ao nível da rua, a igreja.
//
//   node scripts/qa-roquecraft-cidade.mjs
//
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { servirDist } from './lib/servidor-do-dist.mjs'

const SAIDA = path.resolve('scripts/.qa-cidade')
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
const foto = async (nome, espera = 1500) => {
  await page.waitForTimeout(espera)
  await page.screenshot({ path: path.join(SAIDA, nome) })
}

const v = []
let bom = true
const ok = (c, m) => {
  v.push(`${c ? '✅' : '❌'} ${m}`)
  if (!c) bom = false
  return c
}

// ── 1. A CIDADE ─────────────────────────────────────────────────────────────
const cidade = await page.evaluate(async () => {
  const rc = window.__roquecraft
  rc.setMode('creative')
  rc.setTime(4000)
  const plano = rc.procurarCidade(6)
  if (!plano) return null
  rc.setFlying(true)
  rc.teleport(plano.centro.x + 0.5, plano.chao + 30, plano.centro.z + 0.5)
  // A cidade tem 108 blocos de lado: 8 chunks de raio cobrem o miolo, as
  // coroas e a igreja.
  await rc.waitChunks(8, 60000)
  await new Promise((r) => setTimeout(r, 3000))
  return {
    centro: plano.centro,
    chao: plano.chao,
    porte: plano.porte,
    casas: plano.casas.length,
    igreja: plano.igreja,
    bancas: plano.bancas,
    anel: plano.anel,
  }
})
ok(
  !!cidade && cidade.porte === 'cidade',
  `achou uma cidade: ${JSON.stringify(cidade && { centro: cidade.centro, chao: cidade.chao, casas: cidade.casas, anel: cidade.anel })}`,
)
if (!cidade) {
  console.log(v.join('\n'))
  await b.close()
  await fechar()
  process.exit(1)
}
ok(cidade.casas >= 18, `a cidade tem casas de sobra (${cidade.casas} ≥ 18)`)

// ── 2. A TORRE DA IGREJA ESTÁ DE PÉ ─────────────────────────────────────────
const igreja = await page.evaluate(
  ([ig, chao]) => {
    const rc = window.__roquecraft
    // A coluna mais alta num quadrado de 8 em volta do ponto da igreja: a
    // torre tem 2 de lado e sobe 21 acima da nave.
    let topo = chao
    let onde = null
    for (let x = ig.x - 8; x <= ig.x + 8; x++)
      for (let z = ig.z - 8; z <= ig.z + 8; z++) {
        const s = rc.surfaceAt(x, z)
        if (Number.isFinite(s) && s > topo) {
          topo = s
          onde = { x, z }
        }
      }
    return { topo, altura: topo - chao, onde }
  },
  [cidade.igreja, cidade.chao],
)
ok(
  igreja.altura >= 20,
  `a torre da igreja sobe ${igreja.altura} acima do chão (≥ 20) em ${JSON.stringify(igreja.onde)}`,
)

// ── 3. AS BANCAS DA FEIRA ───────────────────────────────────────────────────
const feira = await page.evaluate(
  ([bancas, chao]) => {
    const rc = window.__roquecraft
    let comToldo = 0
    const detalhe = []
    for (const bnc of bancas) {
      // O toldo é a laje de madeira a 3 acima do chão, sobre o balcão.
      let toldo = 0
      for (let dx = -2; dx <= 2; dx++)
        for (let dz = -1; dz <= 1; dz++) {
          const k = rc.blockKeyAt(bnc.x + dx, chao + 3, bnc.z + dz)
          if (k !== 'air') toldo++
        }
      detalhe.push(toldo)
      if (toldo >= 6) comToldo++
    }
    return { comToldo, detalhe, total: bancas.length }
  },
  [cidade.bancas, cidade.chao],
)
ok(
  feira.total === 5 && feira.comToldo === 5,
  `as 5 bancas da feira têm toldo (${feira.comToldo}/${feira.total}; blocos por toldo: ${feira.detalhe.join(',')})`,
)

// ── 4. MORADORES ────────────────────────────────────────────────────────────
// O povoar roda perto do jogador: desce ao chão no centro e espera.
const moradores = await page.evaluate(
  async ([c, chao]) => {
    const rc = window.__roquecraft
    rc.teleport(c.x + 0.5, chao + 3, c.z + 0.5)
    await new Promise((r) => setTimeout(r, 4000))
    const ms = rc.moradoresPerto()
    const oficios = {}
    for (const m of ms) oficios[m.oficio] = (oficios[m.oficio] || 0) + 1
    return { n: ms.length, oficios }
  },
  [cidade.centro, cidade.chao],
)
ok(
  moradores.n >= Math.floor(cidade.casas / 2),
  `a cidade tem moradores: ${moradores.n} para ${cidade.casas} casas (${JSON.stringify(moradores.oficios)})`,
)
ok(Object.keys(moradores.oficios).length >= 4, `com os quatro ofícios`)

// ── 5. A MALHA NÃO TEM BURACO ───────────────────────────────────────────────
const malha = await page.evaluate(() => window.__roquecraft.auditarMalha(28))
ok(
  malha && malha.buracos === 0,
  `malha em volta do centro sem buraco (${malha?.buracos} em ${malha?.examinados} blocos, ${malha?.secoes} seções)`,
)

// ── 6. FOTOS ────────────────────────────────────────────────────────────────
await page.evaluate(
  ([c, chao]) => {
    const rc = window.__roquecraft
    rc.setFlying(true)
    rc.teleport(c.x + 0.5, chao + 45, c.z + 70)
    rc.look(0, -0.55)
  },
  [cidade.centro, cidade.chao],
)
await foto('1-aerea.png', 2500)
await page.evaluate(
  ([c, chao]) => {
    const rc = window.__roquecraft
    rc.teleport(c.x + 9.5, chao + 1, c.z + 9.5)
    rc.setFlying(false)
    rc.look(Math.atan2(c.x - (c.x + 9.5), -(c.z - (c.z + 9.5))), -0.05)
  },
  [cidade.centro, cidade.chao],
)
await foto('2-praca.png', 2000)
await page.evaluate(
  ([ig, chao]) => {
    const rc = window.__roquecraft
    rc.setFlying(true)
    rc.teleport(ig.x + 16.5, chao + 6, ig.z + 16.5)
    rc.look(Math.atan2(ig.x - (ig.x + 16.5), -(ig.z - (ig.z + 16.5))), 0.15)
  },
  [cidade.igreja, cidade.chao],
)
await foto('3-igreja.png', 2000)

console.log(v.join('\n'))
console.log(
  JSON.stringify(
    {
      cidade: { ...cidade, bancas: undefined },
      igreja,
      feira,
      moradores,
      malha: malha && {
        buracos: malha.buracos,
        examinados: malha.examinados,
        secoes: malha.secoes,
      },
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
