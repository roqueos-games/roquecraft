//
// A CADEIA DE POÇÕES, NO JOGO — da garrafa vazia ao efeito na pele.
//
// ⚠️ O QUE OS TESTES DE UNIDADE NÃO PODEM PROVAR. `fermentacao.spec.js` prova a
// tabela, `efeitosMordem.spec.js` prova as mordidas, `usoDeFerramenta.spec.js`
// prova o gesto de beber com um mundo de mentira. Nenhum deles passa pelo
// suporte VIVO dentro do mundo: pela mobília registrada na célula, pelo passo
// do quadro que a avança, pelo clique que mete o item no slot.
//
// Uma cadeia com as três partes certas e a fiação solta fica parada, e o que o
// jogador vê é um suporte que não faz nada — exatamente o que baú e fornalha
// eram antes de alguém ler `interact: 'chest'`.
//
// Mede, com o jogo rodando:
//
//   1. encher a garrafa na água NÃO tira a água do mundo;
//   2. o suporte fermenta água + verruga → estranha;
//   3. e estranha + açúcar → poção de velocidade;
//   4. beber deixa o efeito ativo E devolve o vidro;
//   5. o efeito morde: o jogador anda mais longe em três segundos.
//
//   node scripts/qa-roquecraft-pocao.mjs
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
  `window.__ROS_E2E__={auth:{uid:'e2e',email:'e@e.t',emailVerified:true,displayName:'E',role:'user'},googleDrive:{isConnected:false,files:[],user:{}},googleMapsApiKey:'',roquecraftSeed:942457}`,
)
await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => !!window.__rosStore, null, { timeout: 30000 })
await page.waitForTimeout(500)
await page.evaluate(() => window.__rosStore.openWindow('roquecraft'))
await page.waitForFunction(() => window.__roquecraft?.state?.ready === true, null, {
  timeout: 120000,
})
await page.waitForTimeout(1000)

const r = await page.evaluate(async () => {
  const rc = window.__roquecraft
  const dorme = (ms) => new Promise((k) => setTimeout(k, ms))
  rc.setMode('creative')
  rc.setFlying(true)

  const y = Math.round(rc.surfaceAt(0, 0) ?? 66) + 6
  rc.teleport(0.5, y + 4, 0.5)
  await rc.waitChunks(3, 30000)
  rc.fill(-4, y - 1, -60, 4, y - 1, 60, 'stone')
  rc.fill(-4, y, -60, 4, y + 2, 60, 'air')
  // ⚠️ ÁGUA E SUPORTE FICAM SOBRE O PISO, e o jogador em cima deles olhando
  // reto para baixo — a mesma receita da sonda de redstone. Mirar de lado num
  // poço cavado no chão fez a primeira versão desta sonda medir o piso ao lado.
  rc.fill(2, y, 2, 2, y, 2, 'water')
  rc.fill(0, y, 0, 0, y, 0, 'brewingStand')
  await dorme(800)

  // ── 1. encher a garrafa ──────────────────────────────────────────────────
  rc.setMode('survival')
  // ⚠️ UMA GARRAFA, e não uma pilha. `trocarItem` gasta uma da pilha e manda a
  // cheia procurar OUTRO slot (é o certo: o balde faz igual), então com três na
  // mão a mão continua com vidro vazio — a primeira versão desta sonda leu isso
  // como "encher não funcionou". Com uma só, a mão vira o resultado.
  rc.equipar('glass_bottle', 1)
  // ⚠️ EM CIMA DA LÂMINA, olhando reto para baixo. A primeira versão mirava de
  // lado a -1,2 rad e o raio pegava o PISO ao lado do poço: a sonda mediu
  // 'stone' e acusou a garrafa, quando o errado era a mira dela.
  rc.teleport(2.5, y + 2 + 1.62, 2.5)
  rc.look(0, -1.5)
  await dorme(400)
  // ⚠️ `miraEm` É O ALVO DE QUEBRAR, e líquido não se quebra: ele responde
  // 'nada' sobre a água mesmo com a mira certa. Quem vê a lâmina é o SEGUNDO
  // alvo (`alvoDeLiquido`), o mesmo que o balde usa — e o que esta sonda mede
  // é o resultado, não por onde ele passou.
  rc.place()
  await dorme(400)
  const naMaoDepoisDeEncher = rc.naMao()
  const aguaContinua = rc.blockKeyAt(2, y, 2)

  // ── 2 e 3. o suporte fermenta ────────────────────────────────────────────
  //
  // Os itens entram pelo MESMO caminho do jogador: o slot da mobília, e não um
  // atalho que escrevesse no objeto. `porNaMobilia` usa o campo, e o campo é o
  // que a tela clica.
  // ⚠️ ABRIR ANTES DE ENCHER. A mobília não existe na célula até alguém clicar
  // nela — é o registro paralelo de `mobilia.js`, criado sob demanda. A
  // primeira versão desta sonda encheu slots de um suporte que ainda não
  // existia, `porNaMobilia` devolveu false em silêncio, e o relato foi
  // "fermentação não funciona".
  rc.teleport(0.5, y + 1 + 1.62, 0.5)
  rc.look(0, -1.5)
  await dorme(300)
  const miraNoSuporte = rc.miraEm()?.chave ?? 'nada'
  rc.interagir()
  await dorme(300)
  rc.porNaMobilia(0, y, 0, 'garrafa0', 'water_bottle', 1)
  rc.porNaMobilia(0, y, 0, 'ingrediente', 'nether_wart', 2)
  await dorme(300)
  const antesDeFermentar = rc.mobiliaEm(0, y, 0)
  // 20 s de fermentação; o mundo anda no relógio do quadro.
  await dorme(22000)
  const depoisDaPrimeira = rc.mobiliaEm(0, y, 0)

  rc.porNaMobilia(0, y, 0, 'ingrediente', 'sugar', 1)
  await dorme(22000)
  const depoisDaSegunda = rc.mobiliaEm(0, y, 0)

  // ── 4. beber ─────────────────────────────────────────────────────────────
  rc.limparEfeitos()
  rc.equipar('pocao_velocidade', 1)
  rc.look(0, 0.6) // pro alto: beber não pode depender de mirar em nada
  await dorme(200)
  rc.place()
  await dorme(400)
  const efeitosDepoisDeBeber = rc.efeitosInfo().map((e) => e.nome)
  const naMaoDepoisDeBeber = rc.naMao()

  // ── 5. e o efeito morde ──────────────────────────────────────────────────
  const correr = async (comEfeito) => {
    rc.limparEfeitos()
    if (comEfeito) rc.darEfeito('velocidade', 2, 600)
    rc.teleport(0.5, y + 1, 0.5)
    rc.setFlying(false) // depois do teleporte: ele LIGA o voo
    rc.look(0, 0)
    await dorme(900)
    const p0 = { ...rc.state.player }
    rc.press('forward', true)
    await dorme(3000)
    rc.press('forward', false)
    await dorme(200)
    const p1 = { ...rc.state.player }
    return Math.hypot(p1.x - p0.x, p1.z - p0.z)
  }
  const normal = await correr(false)
  const rapido = await correr(true)
  rc.limparEfeitos()

  return {
    y,
    miraNoSuporte,
    naMaoDepoisDeEncher,
    aguaContinua,
    antesDeFermentar,
    depoisDaPrimeira,
    depoisDaSegunda,
    efeitosDepoisDeBeber,
    naMaoDepoisDeBeber,
    normal,
    rapido,
  }
})

await ctx.close()
await b.close()
fechar()

const falhas = []
const m = (n) => Number(n).toFixed(2)
const garrafa = (e, i) => e?.garrafas?.[i]?.item ?? 'vazio'

if (r.miraNoSuporte !== 'brewingStand') {
  falhas.push(`a mira nao pegou o suporte: ${r.miraNoSuporte}`)
}
if (r.naMaoDepoisDeEncher !== 'water_bottle') {
  falhas.push(`encher a garrafa nao deu garrafa d'agua: ${r.naMaoDepoisDeEncher}`)
}
if (r.aguaContinua !== 'water') {
  falhas.push(`encher a garrafa SUMIU com a agua do mundo: ${r.aguaContinua}`)
}

if (garrafa(r.antesDeFermentar, 0) !== 'water_bottle') {
  falhas.push(`a garrafa nao entrou no suporte: ${garrafa(r.antesDeFermentar, 0)}`)
}
if (garrafa(r.depoisDaPrimeira, 0) !== 'pocao_estranha') {
  falhas.push(`agua + verruga nao deu estranha: ${garrafa(r.depoisDaPrimeira, 0)}`)
}
if (garrafa(r.depoisDaSegunda, 0) !== 'pocao_velocidade') {
  falhas.push(`estranha + acucar nao deu velocidade: ${garrafa(r.depoisDaSegunda, 0)}`)
}

if (!r.efeitosDepoisDeBeber.includes('velocidade')) {
  falhas.push(`beber nao aplicou o efeito: ${JSON.stringify(r.efeitosDepoisDeBeber)}`)
}
if (r.naMaoDepoisDeBeber !== 'glass_bottle') {
  falhas.push(`beber nao devolveu o vidro: ${r.naMaoDepoisDeBeber}`)
}

if (!(r.normal > 8 && r.normal < 20)) {
  falhas.push(`3 s andando deram ${m(r.normal)} blocos; a pe sao ~14 (39 e o voo)`)
}
if (!(r.rapido > r.normal * 1.12)) {
  falhas.push(`o efeito nao mordeu: ${m(r.normal)} → ${m(r.rapido)} blocos`)
}
if (erros.length) falhas.push(`erro de pagina: ${erros[0]}`)

console.log('')
console.log('cadeia de pocoes — da garrafa vazia ao efeito na pele')
console.log('')
console.log(`  encher na agua      ${r.naMaoDepoisDeEncher}`)
console.log(`  a agua continua la  ${r.aguaContinua}`)
console.log(
  `  suporte             ${garrafa(r.antesDeFermentar, 0)} → ` +
    `${garrafa(r.depoisDaPrimeira, 0)} → ${garrafa(r.depoisDaSegunda, 0)}`,
)
console.log(
  `  beber               efeitos ${JSON.stringify(r.efeitosDepoisDeBeber)}  ` +
    `na mao ${r.naMaoDepoisDeBeber}`,
)
console.log(`  3 s andando         sem ${m(r.normal)}  com ${m(r.rapido)} blocos`)
console.log('')
if (falhas.length) {
  console.log('VERMELHO:')
  for (const f of falhas) console.log(`  ✗ ${f}`)
} else {
  console.log('VERDE: a cadeia inteira fecha — enche, fermenta, bebe e morde.')
}
console.log('')
process.exit(falhas.length ? 1 : 0)
