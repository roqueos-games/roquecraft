//
// OS RECIBOS DA MIRA — o que o jogo sabia e o jogador não via (Goal 22, onda 1).
//
// `useRoqueCraftIndicadores.spec` prova o estado; `RCMira.spec` prova o
// desenho a partir das props. O que só o jogo prova é a FIAÇÃO: que a carga
// real do arco, a guarda real do corpo e o campo `pocao.splash` do inventário
// chegam nesses elementos — e somem quando o estado acaba.
//
// O defeito era de silêncio: `cargaDoArco()` e `guardaLevantada()` existiam,
// eram calculadas a cada quadro e consumidas por ninguém. Um teste de unidade
// nunca veria isso, porque o cálculo estava certo o tempo todo.
//
//   1. em repouso a mira tem só os dois traços;
//   2. arco puxado: a barra aparece, e a largura CRESCE com o tempo de corda;
//   3. corda cheia: a barra acende (`is-cheio`);
//   4. flecha solta: a barra some;
//   5. escudo segurado: o arco da guarda aparece; soltou, some;
//   6. poção de borrifo na hotbar ganha a marca; a de beber, não.
//
//   node scripts/qa-roquecraft-mira.mjs
//
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { servirDist } from './lib/servidor-do-dist.mjs'

const SAIDA = path.resolve('scripts/.qa-mira')
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

/** O que está desenhado na mira AGORA, lido do DOM de verdade. */
const daMira = () =>
  page.evaluate(() => {
    const m = document.querySelector('.rc-mira')
    const arco = m?.querySelector('.rc-mira__arco')
    return {
      existe: !!m,
      tracos: m ? m.querySelectorAll(':scope > i').length : -1,
      arco: !!arco,
      arcoCheio: !!arco?.classList.contains('is-cheio'),
      // A largura como o navegador resolveu, não como o style pediu.
      arcoPx: arco
        ? +(arco.querySelector('span')?.getBoundingClientRect().width ?? 0).toFixed(1)
        : 0,
      carga: !!m?.querySelector('.rc-mira__carga'),
      critico: !!m?.querySelector('.rc-mira__critico'),
      guarda: !!m?.querySelector('.rc-mira__guarda'),
    }
  })

// ── 1. A CENA, E O REPOUSO ──────────────────────────────────────────────────
await page.evaluate(() => window.__roquecraft.entrarNoJogo?.())
await page.waitForTimeout(1500)
const cena = await page.evaluate(async () => {
  const rc = window.__roquecraft
  rc.setMode('survival')
  rc.setTime(6000)
  const y = Math.round(rc.surfaceAt(0, 0) ?? 66) + 14
  rc.setFlying(true)
  rc.teleport(0.5, y + 3, 0.5)
  rc.fill(-8, y - 2, -8, 8, y, 8, 'stone')
  rc.fill(-8, y + 1, -8, 8, y + 4, 8, 'air')
  await new Promise((r) => setTimeout(r, 1500))
  rc.teleport(0.5, y + 1, 0.5)
  rc.setFlying(false)
  rc.look(0, 0)
  rc.limparMobs()
  rc.selectSlot(0)
  rc.equiparComEncanto('bow')
  rc.selectSlot(1)
  rc.equipar('arrow', 8)
  rc.selectSlot(0)
  return { y, naMao: rc.naMao(), flechas: rc.contarItem('arrow') }
})
ok(cena.naMao === 'bow' && cena.flechas === 8, `arco na mão e 8 flechas: ${JSON.stringify(cena)}`)
await page.waitForTimeout(1500)
const repouso = await daMira()
ok(repouso.existe && repouso.tracos === 2, `a mira está na tela com os dois traços`)
ok(
  !repouso.arco && !repouso.guarda && !repouso.carga,
  `em repouso a mira tem só os traços: ${JSON.stringify(repouso)}`,
)

// ── 2 e 3. A CORDA ──────────────────────────────────────────────────────────
const segurar = (v) => page.evaluate((v) => window.__roquecraft.segurarColocar(v), v)
await segurar(true)
await page.waitForTimeout(150)
const puxando = await daMira()
await page.waitForTimeout(900)
const cheia = await daMira()
await foto('1-arco.png')
ok(puxando.arco, `a corda foi puxada e a barra não apareceu: ${JSON.stringify(puxando)}`)
ok(
  cheia.arcoPx > puxando.arcoPx,
  `a barra do arco não cresceu com a corda: ${puxando.arcoPx} → ${cheia.arcoPx} px`,
)
ok(
  !puxando.arcoCheio && cheia.arcoCheio,
  `a corda cheia tem que ACENDER, e só ela: puxando ${puxando.arcoCheio}, cheia ${cheia.arcoCheio}`,
)

// ── 4. SOLTOU ───────────────────────────────────────────────────────────────
await segurar(false)
await page.waitForTimeout(300)
const soltou = await daMira()
const gastou = await page.evaluate(() => window.__roquecraft.contarItem('arrow'))
// ⚠️ SANIDADE: se a flecha não saiu, "a barra sumiu" seria verdade por omissão.
ok(gastou === 7, `a flecha não saiu (${cena.flechas} → ${gastou}): o caso abaixo não valeria`)
ok(!soltou.arco, `soltou a flecha e a barra do arco ficou: ${JSON.stringify(soltou)}`)

// ── 5. A GUARDA ─────────────────────────────────────────────────────────────
await page.evaluate(() => {
  const rc = window.__roquecraft
  rc.selectSlot(2)
  rc.equiparComEncanto('shield', null)
})
await page.waitForTimeout(200)
await segurar(true)
await page.waitForTimeout(400)
const guardando = await daMira()
const guardaNoJogo = await page.evaluate(() => window.__roquecraft.guardaLevantada())
await foto('2-guarda.png')
await segurar(false)
await page.waitForTimeout(400)
const soltouGuarda = await daMira()
ok(guardaNoJogo, `o jogo não levantou a guarda: o caso abaixo não valeria`)
ok(guardando.guarda, `guarda levantada e nada na tela: ${JSON.stringify(guardando)}`)
ok(!soltouGuarda.guarda, `soltou a guarda e o escudo ficou na tela`)

// ── 6. A MARCA DO BORRIFO ───────────────────────────────────────────────────
const frascos = await page.evaluate(async () => {
  const rc = window.__roquecraft
  rc.selectSlot(3)
  rc.equiparComEncanto('pocao_cura', null, 1, { splash: true })
  rc.selectSlot(4)
  rc.equiparComEncanto('pocao_cura', null, 1, null)
  rc.selectSlot(0)
  await new Promise((r) => setTimeout(r, 400))
  const slots = [...document.querySelectorAll('.rc-hud__slot')]
  return {
    borrifo: !!slots[3]?.querySelector('.rc-hud__slot-splash'),
    beber: !!slots[4]?.querySelector('.rc-hud__slot-splash'),
    frascosNoInventario: rc.contarItem('pocao_cura'),
  }
})
await foto('3-hotbar.png')
ok(frascos.borrifo, `a poção de borrifo ficou sem marca: ${JSON.stringify(frascos)}`)
ok(!frascos.beber, `a poção de BEBER ganhou a marca do borrifo: ${JSON.stringify(frascos)}`)

console.log(v.join('\n'))
console.log(
  JSON.stringify(
    {
      cena,
      repouso,
      puxando,
      cheia,
      soltou,
      guardando,
      soltouGuarda,
      frascos,
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
