//
// TELEPORTE DE DIMENSÃO PELO MENU K (Goal 23, onda 3).
//
// `viagemEntreDimensoes.spec` prova o PLANO — para onde ir e onde pousar.
// `RCCriativo.spec` prova o painel. O que só o jogo prova é a EXECUÇÃO: que o
// clique no botão chega na travessia, que a dimensão viva muda de verdade, que
// o jogador chega EM PÉ SOBRE CHÃO SÓLIDO e não caindo no vazio, e que dá para
// voltar.
//
// ⚠️ E QUE O TELEPORTE NÃO CAVA PORTAL. A travessia a pé constrói o portal de
// chegada, porque quem atravessa a pé precisa de como voltar; quem teleporta
// tem o menu. Cavar obsidiana no mundo de alguém por causa de um clique num
// painel seria uma edição que o jogador não pediu e não desfaz — e é o tipo de
// coisa que só se descobre jogando.
//
//   node scripts/qa-roquecraft-teleporte.mjs
//
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { servirDist } from './lib/servidor-do-dist.mjs'

const SAIDA = path.resolve('scripts/.qa-teleporte')
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

const v = []
let bom = true
const ok = (c, m) => {
  v.push(`${c ? '✅' : '❌'} ${m}`)
  if (!c) bom = false
  return c
}

await page.evaluate(() => window.__roquecraft.entrarNoJogo?.())
await page.waitForTimeout(1500)
const inicio = await page.evaluate(async () => {
  const rc = window.__roquecraft
  rc.setMode('creative')
  rc.setTime(6000)
  await new Promise((r) => setTimeout(r, 600))
  return { dimensao: rc.dimensaoAtual(), modo: rc.state.mode }
})
ok(inicio.dimensao === 'overworld', `o jogo começa no supermundo: ${JSON.stringify(inicio)}`)

/**
 * Clica no botão de um destino, pelo painel, e devolve o que virou o mundo.
 *
 * ⚠️ PELO BOTÃO, e não pelo gancho: o que esta sonda existe para provar é a
 * FIAÇÃO — que o clique chega na travessia. Chamar `irPara` direto testaria a
 * travessia de novo e pularia justamente o que pode quebrar.
 */
async function irPara(destino) {
  await page.evaluate(async (d) => {
    const rc = window.__roquecraft
    if (!rc.criativoAberto()) rc.abrirCriativo()
    await new Promise((r) => setTimeout(r, 300))
    document.querySelector('[data-test="rc-cri-aba-lugares"]')?.click()
    await new Promise((r) => setTimeout(r, 200))
    document.querySelector(`[data-test="rc-cri-ir-${d}"]`)?.click()
  }, destino)
  await page.waitForTimeout(2600)
  return page.evaluate(() => {
    const rc = window.__roquecraft
    const p = rc.state.player
    const pe = Math.floor(p.y) - 1
    return {
      dimensao: rc.dimensaoAtual(),
      y: +p.y.toFixed(1),
      // O bloco DEBAIXO do pé: é ele que diz se o jogador pousou ou está caindo.
      // `blocoEm` devolve a CHAVE, e 'air' é a resposta de "não tem nada".
      blocoNoPe: rc.blocoEm(Math.floor(p.x), pe, Math.floor(p.z)),
      solidoNoPe: rc.solidoEm(Math.floor(p.x), pe, Math.floor(p.z)) > 0,
      vy: +(p.vy ?? 0).toFixed(2),
    }
  })
}

// ── 1. IDA AO NETHER ────────────────────────────────────────────────────────
const nether = await irPara('nether')
ok(nether.dimensao === 'nether', `o clique não levou ao Nether: ${JSON.stringify(nether)}`)
ok(nether.solidoNoPe, `chegou ao Nether caindo no vazio: ${JSON.stringify(nether)}`)
await page.screenshot({ path: path.join(SAIDA, '1-nether.png') })

// ── 2. DO NETHER AO FIM ─────────────────────────────────────────────────────
const fim = await irPara('end')
ok(fim.dimensao === 'end', `o clique não levou ao Fim: ${JSON.stringify(fim)}`)
ok(fim.solidoNoPe, `chegou ao Fim no vazio: ${JSON.stringify(fim)}`)
await page.screenshot({ path: path.join(SAIDA, '2-fim.png') })

// ── 3. E DE VOLTA PARA CASA ─────────────────────────────────────────────────
const volta = await irPara('overworld')
ok(volta.dimensao === 'overworld', `não deu para voltar: ${JSON.stringify(volta)}`)
ok(volta.solidoNoPe, `voltou caindo no vazio: ${JSON.stringify(volta)}`)
await page.screenshot({ path: path.join(SAIDA, '3-volta.png') })

// ── 4. O BOTÃO DE ONDE SE ESTÁ FICA DESLIGADO ───────────────────────────────
const aqui = await page.evaluate(() => {
  const b = document.querySelector('[data-test="rc-cri-ir-overworld"]')
  return { desligado: !!b?.disabled, existe: !!b }
})
ok(
  aqui.existe && aqui.desligado,
  `o botão do destino de agora está clicável: ${JSON.stringify(aqui)}`,
)

// ── 5. NINGUÉM CAVOU PORTAL ─────────────────────────────────────────────────
// Três teleportes; se cada um tivesse construído o portal de chegada, haveria
// obsidiana e portal no mundo — e o jogador não pediu nenhum deles.
const semPortal = await page.evaluate(() => {
  const rc = window.__roquecraft
  const p = rc.state.player
  let obsidiana = 0
  let portal = 0
  for (let dx = -12; dx <= 12; dx++)
    for (let dz = -12; dz <= 12; dz++)
      for (let dy = -3; dy <= 6; dy++) {
        const k = rc.blocoEm(Math.floor(p.x) + dx, Math.floor(p.y) + dy, Math.floor(p.z) + dz)
        if (k === 'obsidian') obsidiana++
        if (k === 'portal' || k === 'nether_portal') portal++
      }
  return { obsidiana, portal }
})
ok(
  semPortal.portal === 0,
  `o teleporte cavou portal no mundo do jogador: ${JSON.stringify(semPortal)}`,
)

// ── 6. A COPA NÃO É CHÃO (Goal 23, onda 4) ─────────────────────────────────
// Em 20/09 esta sonda viu o jogador voltar do Fim em cima de `spruceLeaves`.
ok(
  !/Leaves$|Log$/.test(volta.blocoNoPe || ''),
  `voltou em cima da árvore, e não no chão: ${JSON.stringify(volta)}`,
)

/**
 * Onde o jogador está, com o bloco debaixo do pé.
 *
 * ⚠️ O PÉ PODE ESTAR NUMA LAJE. Na praça da vila o chão é `oakSlab`: o jogador
 * fica em y=68,5, com a laje na célula 68 (a mesma do pé) e AR em 67. Olhar só
 * `floor(y) − 1` acusava "chegou caindo" com o jogador em pé numa laje. O que
 * segura é a primeira célula sólida entre a do pé e a de baixo.
 */
const onde = () =>
  page.evaluate(() => {
    const rc = window.__roquecraft
    const p = rc.state.player
    const bx = Math.floor(p.x)
    const bz = Math.floor(p.z)
    const celulas = [Math.floor(p.y) - 1, Math.floor(p.y)]
    const pe = celulas.find((yy) => rc.solidoEm(bx, yy, bz) > 0) ?? celulas[0]
    return {
      dimensao: rc.dimensaoAtual(),
      x: +p.x.toFixed(1),
      y: +p.y.toFixed(1),
      z: +p.z.toFixed(1),
      blocoNoPe: rc.blocoEm(bx, pe, bz),
      solidoNoPe: rc.solidoEm(bx, pe, bz) > 0,
    }
  })
const naAbaDeLugares = async () => {
  await page.evaluate(async () => {
    const rc = window.__roquecraft
    if (!rc.criativoAberto()) rc.abrirCriativo()
    await new Promise((r) => setTimeout(r, 300))
    document.querySelector('[data-test="rc-cri-aba-lugares"]')?.click()
    await new Promise((r) => setTimeout(r, 200))
  })
}
/**
 * Espera o chão debaixo do jogador CARREGAR, até 20 s. Um pouso a 400 blocos
 * de distância é um mundo inteiro de chunks novos: a física segura o jogador
 * no ar enquanto o chunk dele não chega (`carregado: world.isLoaded`), e o que
 * se mede é onde ele fica DEPOIS que o mundo em volta existe. O tempo até isso
 * sai no relatório, e não é veredito.
 */
const esperarOChao = async () => {
  const t0 = Date.now()
  await page
    .waitForFunction(
      () => {
        const rc = window.__roquecraft
        const p = rc.state.player
        const bx = Math.floor(p.x)
        const bz = Math.floor(p.z)
        return [Math.floor(p.y) - 1, Math.floor(p.y)].some((yy) => rc.solidoEm(bx, yy, bz) > 0)
      },
      null,
      { timeout: 20000 },
    )
    .catch(() => {})
  await page.waitForTimeout(800)
  return Date.now() - t0
}
const clicar = async (seletor) => {
  await naAbaDeLugares()
  await page.evaluate((s) => document.querySelector(s)?.click(), seletor)
  await page.waitForTimeout(600)
  return esperarOChao()
}
const longe = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)

// ── 7. UM LUGAR DO MUNDO: A VILA, PELO BOTÃO ───────────────────────────────
const antesDaVila = await onde()
const msAteAVila = await clicar('[data-test="rc-cri-lugar-vila"]')
const naVila = { ...(await onde()), msAteOChao: msAteAVila }
ok(naVila.dimensao === 'overworld', `a vila não é no supermundo: ${JSON.stringify(naVila)}`)
ok(longe(antesDaVila, naVila) > 32, `o botão da vila não moveu o jogador: ${JSON.stringify(naVila)}`)
ok(naVila.solidoNoPe, `chegou à vila caindo: ${JSON.stringify(naVila)}`)
ok(!/Leaves$|Log$/.test(naVila.blocoNoPe || ''), `pousou na copa: ${JSON.stringify(naVila)}`)
await page.screenshot({ path: path.join(SAIDA, '4-vila.png') })

// ── 8. A COORDENADA DIGITADA, SEM Y: O CHÃO ────────────────────────────────
await naAbaDeLugares()
await page.fill('[data-test="rc-cri-x"]', '300')
await page.fill('[data-test="rc-cri-y"]', '')
await page.fill('[data-test="rc-cri-z"]', '-200')
await page.click('[data-test="rc-cri-ir-coordenada"]')
await page.waitForTimeout(600)
const msAteACoordenada = await esperarOChao()
const naCoordenada = { ...(await onde()), msAteOChao: msAteACoordenada }
ok(
  Math.abs(naCoordenada.x - 300.5) <= 16 && Math.abs(naCoordenada.z + 199.5) <= 16,
  `a coordenada não levou a (300, −200): ${JSON.stringify(naCoordenada)}`,
)
ok(naCoordenada.solidoNoPe, `chegou à coordenada caindo: ${JSON.stringify(naCoordenada)}`)
await page.screenshot({ path: path.join(SAIDA, '5-coordenada.png') })

// ── 9. VOLTAR DE ONDE VEIO, DUAS VEZES: A ORDEM INVERSA ───────────────────
await clicar('[data-test="rc-cri-voltar"]')
const voltou1 = await onde()
ok(
  longe(voltou1, naVila) <= 2,
  `a primeira volta não devolveu à vila: ${JSON.stringify({ voltou1, naVila })}`,
)
await clicar('[data-test="rc-cri-voltar"]')
const voltou2 = await onde()
ok(
  longe(voltou2, antesDaVila) <= 2 && voltou2.dimensao === antesDaVila.dimensao,
  `a segunda volta não devolveu a de onde tudo começou: ${JSON.stringify({ voltou2, antesDaVila })}`,
)

// ── 10. DIGITAR NO CAMPO NÃO É JOGAR: o 1 não troca de slot ────────────────
// O slot começa no 4 de propósito: no slot 0, um `1` que vazasse escolheria o
// próprio slot 0 e a sonda não veria nada.
const slotAntes = await page.evaluate(() => {
  window.__roquecraft.setSlot(4, 'coal', 1)
  return window.__roquecraft.state.hotbar
})
await naAbaDeLugares()
await page.fill('[data-test="rc-cri-x"]', '')
await page.click('[data-test="rc-cri-x"]')
await page.keyboard.type('12')
const digitado = await page.evaluate(() => ({
  campo: document.querySelector('[data-test="rc-cri-x"]')?.value,
  slot: window.__roquecraft.state.hotbar,
}))
ok(
  slotAntes === 4 && digitado.campo === '12' && digitado.slot === 4,
  `digitar no campo vazou para o jogo: ${JSON.stringify({ slotAntes, digitado })}`,
)

console.log(v.join('\n'))
console.log(
  JSON.stringify(
    {
      inicio,
      nether,
      fim,
      volta,
      aqui,
      semPortal,
      naVila,
      naCoordenada,
      voltou1,
      voltou2,
      digitado,
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
