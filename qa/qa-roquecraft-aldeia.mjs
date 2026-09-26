//
// A ALDEIA E O COMÉRCIO, NO JOGO — a esmeralda finalmente compra alguma coisa.
//
// ⚠️ O QUE OS TESTES DE UNIDADE NÃO PODEM PROVAR. `aldeia.spec.js` prova a
// forma das casas com um relevo de mentira, e `comercio.spec.js` prova a troca
// com um inventário isolado. Nenhum dos dois passa pelo mundo GERADO, pelo mob
// posto em pé dentro da casa, nem pelo clique que abre a tela.
//
// Uma estrutura com a geometria certa e a fiação solta é uma casa que nunca
// nasce; um aldeão sem o degrau de interação é uma estátua. Os dois passam
// verde nos testes de unidade.
//
// Mede, com o jogo rodando:
//
//   1. a aldeia EXISTE no mundo gerado (parede, vidro, piso, caminho);
//   2. os aldeões nascem, um por casa, e não somem;
//   3. clicar num aldeão de MÃO VAZIA abre a tela de comércio;
//   4. uma troca tira o pagamento e entrega a mercadoria;
//   5. sem o pagamento, a troca é recusada e NADA sai do inventário.
//
//   node scripts/qa-roquecraft-aldeia.mjs
//
import { chromium } from 'playwright'
import { servirDist } from './lib/servidor-do-dist.mjs'

const { base, fechar } = await servirDist('dist/pwa')
const b = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const ctx = await b.newContext({ viewport: { width: 900, height: 820 }, serviceWorkers: 'block' })
const page = await ctx.newPage()
const erros = []
page.on('pageerror', (e) => erros.push(String(e.message).slice(0, 160)))
await page.addInitScript(
  `window.__ROS_E2E__={auth:{uid:'e2e',email:'e@e.t',emailVerified:true,displayName:'E',role:'user'},googleDrive:{isConnected:false,files:[],user:{}},googleMapsApiKey:'',roquecraftSeed:1337}`,
)
await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => !!window.__rosStore, null, { timeout: 30000 })
await page.waitForTimeout(500)
await page.evaluate(() => window.__rosStore.openWindow('roquecraft'))
await page.waitForFunction(() => window.__roquecraft?.state?.ready === true, null, {
  timeout: 120000,
})
await page.waitForTimeout(1000)

// ⚠️ A ALDEIA É PERGUNTADA AO MUNDO, e não cravada. Esta sonda nasceu com
// `{ x: -3352, z: -3752 }` no fonte — a aldeia da semente 1337 medida em 13/09
// — e o Goal 19 mudou a grade e o sal por porte. A coordenada ficou, a aldeia
// foi embora, e a sonda passou de 14/09 a 18/09 contando ZERO tábuas num campo
// vazio e acusando o jogo. Uma sonda que sabe onde a aldeia está por decoreba
// mede a decoreba. Agora ela anda até a aldeia como `qa-roquecraft-aldeao.mjs`:
// pergunta, pousa, pergunta de novo até o centro parar de mudar.
const r = await page.evaluate(async () => {
  const rc = window.__roquecraft
  const dorme = (ms) => new Promise((k) => setTimeout(k, ms))
  rc.setMode('creative')
  rc.setFlying(true)
  const achado = rc.procurarAldeia(6)
  if (!achado) return { semAldeia: true }
  let sitio = { x: achado.centro.x, z: achado.centro.z, chao: achado.chao }
  for (let i = 0; i < 5; i++) {
    rc.teleport(sitio.x, sitio.chao + 6, sitio.z)
    await rc.waitChunks(4, 60000)
    const aqui = rc.aldeiaAqui(sitio.x, sitio.z)
    if (!aqui) break
    if (Math.abs(aqui.centro.x - sitio.x) < 1 && Math.abs(aqui.centro.z - sitio.z) < 1) break
    sitio = { x: aqui.centro.x, z: aqui.centro.z, chao: aqui.chao }
  }
  const ax = Math.round(sitio.x)
  const az = Math.round(sitio.z)
  await dorme(1500)

  // ── 1. a aldeia está no mundo ────────────────────────────────────────────
  const chao = rc.surfaceAt(ax, az) ?? sitio.chao ?? 64
  const conta = { tabua: 0, vidro: 0, pedregulho: 0, podzol: 0 }
  // ⚠️ POR COLUNA, não pela altura da praça. O piso e o caminho ficam no chão
  // de CADA coluna, e a vila hoje assenta em terreno com degrau: a faixa fixa
  // `chao − 3 … chao + 8` da praça contava 817 tábuas (parede é alta) e ZERO
  // podzol (caminho é raso) na mesma vila — 253 de podzol medidos por coluna.
  for (let x = ax - 30; x <= ax + 30; x++) {
    for (let z = az - 30; z <= az + 30; z++) {
      // E `surfaceAt` numa coluna de casa devolve o TELHADO (foi assim que a
      // vila ficou sem morador no Goal 20): a faixa desce 12 para pegar a
      // parede e a janela debaixo dele.
      const topo = rc.surfaceAt(x, z) ?? chao
      for (let y = topo - 12; y <= topo + 8; y++) {
        const k = rc.blockKeyAt(x, y, z)
        if (k === 'oakPlanks') conta.tabua++
        else if (k === 'glass') conta.vidro++
        else if (k === 'cobblestone') conta.pedregulho++
        else if (k === 'podzol') conta.podzol++
      }
    }
  }

  // ── 2. os moradores ──────────────────────────────────────────────────────
  //
  // O povoamento roda no passo das criaturas e só em raio curto: desce perto do
  // chão e espera o relógio.
  rc.teleport(ax + 0.5, chao + 2, az + 0.5)
  await dorme(6000)
  const aldeoes = rc.mobsInfo().filter((m) => m.type === 'aldeao')

  // ── 3. o clique de MÃO VAZIA abre a tela ─────────────────────────────────
  rc.equipar(null)
  let abriu = false
  let ofertas = []
  let alvo = null
  let mirasTentadas = 0
  const diag = []
  for (const a0 of aldeoes) {
    // ⚠️ POSIÇÃO FRESCA A CADA VOLTA. O aldeão ANDA (0,75 m/s), e a lista foi
    // lida segundos antes: mirar na posição velha é mirar no chão ao lado.
    const atual = () => rc.mobsInfo().find((m) => m.id === a0.id) || a0
    const a = atual()
    rc.teleport(a.x, a.y + 1.62, a.z + 1.6)
    await dorme(250)
    diag.push({ id: a.id, mob: [a.x, a.y, a.z], jog: { ...rc.state.player } })
    // ⚠️ VARRE O YAW EM VEZ DE CALCULÁ-LO. A convenção de yaw do jogo é a da
    // física (`dirX = ix·cos − iz·sin`), e uma sonda que reimplementa essa
    // conta testa a própria conta: erra o sinal, mede 'não achei o bicho', e o
    // relato vira "o comércio não abre". Dezesseis passos e a resposta do
    // raycast DO JOGO decidem.
    let achou = false
    // ⚠️ O PITCH É CALCULADO, O YAW É VARRIDO. `teleport` sobe o jogador para
    // um ponto seguro (ele liga o voo e enquadra), então o olho fica ACIMA do
    // aldeão: mirar na horizontal passa por cima da cabeça dele, e foi o que a
    // primeira versão desta sonda fez 120 vezes seguidas antes de reclamar do
    // comércio. A altura é geometria e se calcula; a convenção de yaw é do jogo
    // e quem responde por ela é o raycast dele.
    for (let k = 0; k < 24 && !achou; k++) {
      const m = atual()
      const jog = rc.state.player
      const d = Math.max(0.3, Math.hypot(m.x - jog.x, m.z - jog.z))
      const alvoY = m.y + 1.0
      const pitch = Math.atan2(alvoY - (jog.y + 1.62), d)
      rc.look((k / 24) * Math.PI * 2 - Math.PI, pitch)
      await dorme(50)
      mirasTentadas++
      achou = !!rc.miraNoMob()
    }
    if (!achou) continue
    // ⚠️ `interagirComAlvo` e não `interagir`: comerciar entra pela escada da
    // CRIATURA (dentro de `doPlace`), não pela do bloco.
    rc.interagirComAlvo()
    await dorme(300)
    ofertas = rc.ofertasAbertas()
    if (ofertas.length) {
      abriu = true
      alvo = a
      break
    }
  }

  // ── 4 e 5. a troca ───────────────────────────────────────────────────────
  let semPagamento = null
  let comPagamento = null
  if (abriu) {
    // Uma oferta que o jogador NÃO pode pagar: nada pode sair do inventário.
    const i = ofertas.findIndex((o) => o.motivo === 'sem-pagamento')
    if (i >= 0) {
      const antes = rc.contarItem(ofertas[i].recebe.item)
      rc.trocarComAldeao(i)
      await dorme(200)
      semPagamento = { antes, depois: rc.contarItem(ofertas[i].recebe.item) }
    }
    // E uma que ele pode: dá o pagamento na mão e fecha.
    const j = 0
    const paga = ofertas[j].paga[0]
    rc.darItem(paga.item, paga.count * 2)
    await dorme(300)
    const antes = {
      paga: rc.contarItem(paga.item),
      recebe: rc.contarItem(ofertas[j].recebe.item),
    }
    rc.trocarComAldeao(j)
    await dorme(300)
    comPagamento = {
      antes,
      depois: {
        paga: rc.contarItem(paga.item),
        recebe: rc.contarItem(ofertas[j].recebe.item),
      },
      oferta: ofertas[j],
    }
  }

  return {
    chao,
    conta,
    mirasTentadas,
    diag,
    aldeoes: aldeoes.length,
    profissoes: aldeoes.map((a) => a.profissao),
    abriu,
    alvo,
    ofertas,
    semPagamento,
    comPagamento,
  }
})

await ctx.close()
await b.close()
fechar()

const falhas = []
if (r.semAldeia) {
  console.log('VERMELHO: não achei aldeia nenhuma em 6 células — a sonda não chegou a medir nada')
  process.exit(1)
}

// 1 — cinco casas de 7×7: 580 tábuas, 245 pedregulhos, 15 vidros (medido no
// gerador puro). No jogo pode haver mais tábua (baú? não; árvore? não gera
// tábua), então o piso basta.
if (!(r.conta.tabua > 400)) falhas.push(`pouca parede de tabua: ${r.conta.tabua}`)
if (!(r.conta.pedregulho > 150)) falhas.push(`pouco piso de pedregulho: ${r.conta.pedregulho}`)
if (!(r.conta.vidro >= 10)) falhas.push(`poucas janelas: ${r.conta.vidro}`)
if (!(r.conta.podzol > 20)) falhas.push(`o caminho nao saiu: ${r.conta.podzol} de podzol`)

// 2 — um por casa
if (r.aldeoes < 3) falhas.push(`aldeoes de menos: ${r.aldeoes}`)
if (new Set(r.profissoes).size < 3) {
  falhas.push(`profissoes de menos: ${JSON.stringify(r.profissoes)}`)
}

// 3 — a tela abre de mão vazia
if (!r.abriu) {
  falhas.push(
    `clicar no aldeao de mao vazia NAO abriu a tela (${r.mirasTentadas} miras tentadas). ` +
      `Primeiro: ${JSON.stringify(r.diag?.[0])}`,
  )
}

// 4 — a troca paga e entrega
if (r.comPagamento) {
  const c = r.comPagamento
  if (!(c.depois.recebe > c.antes.recebe)) {
    falhas.push(`a troca nao entregou: ${c.antes.recebe} → ${c.depois.recebe}`)
  }
  if (!(c.depois.paga < c.antes.paga)) {
    falhas.push(`a troca nao cobrou: ${c.antes.paga} → ${c.depois.paga}`)
  }
} else if (r.abriu) {
  falhas.push('a tela abriu mas nenhuma troca foi tentada')
}

// 5 — sem pagamento, nada sai
if (r.semPagamento && r.semPagamento.depois !== r.semPagamento.antes) {
  falhas.push(
    `troca recusada ENTREGOU mercadoria: ${r.semPagamento.antes} → ${r.semPagamento.depois}`,
  )
}
if (erros.length) falhas.push(`erro de pagina: ${erros[0]}`)

console.log('')
console.log('aldeia e comercio — a esmeralda finalmente compra alguma coisa')
console.log('')
console.log(
  `  a aldeia            tabua ${r.conta.tabua}  pedregulho ${r.conta.pedregulho}  ` +
    `vidro ${r.conta.vidro}  caminho ${r.conta.podzol}`,
)
console.log(`  moradores           ${r.aldeoes} — ${[...new Set(r.profissoes)].join(', ')}`)
console.log(
  `  tela de mao vazia   ${r.abriu ? 'abriu' : 'NAO abriu'}  (${r.ofertas.length} ofertas)`,
)
if (r.comPagamento) {
  const c = r.comPagamento
  console.log(
    `  troca               paga ${c.antes.paga}→${c.depois.paga}  ` +
      `recebe ${c.antes.recebe}→${c.depois.recebe}`,
  )
}
if (r.semPagamento) {
  console.log(`  troca sem pagar     ${r.semPagamento.antes} → ${r.semPagamento.depois}`)
}
console.log('')
if (falhas.length) {
  console.log('VERMELHO:')
  for (const f of falhas) console.log(`  ✗ ${f}`)
} else {
  console.log('VERDE: a aldeia existe, tem gente dentro, e a troca cobra e entrega.')
}
console.log('')
process.exit(falhas.length ? 1 : 0)
