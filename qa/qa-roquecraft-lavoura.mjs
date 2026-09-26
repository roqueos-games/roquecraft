//
// A LAVOURA — a enxada arando no JOGO, não no teste de unidade.
//
// `agricultura.spec.js` prova a regra e `usoDeFerramenta.spec.js` prova o
// efeito com um mundo de mentira. Nenhum dos dois passa pelo caminho que o
// jogador percorre: mira do jogo, `doPlace`, `applyEdit`, fila de atualizações
// e malha. Entre a regra e o mundo cabe um jogo inteiro.
//
// ⚠️ PROVA DE VIDA: a sonda mede a célula ANTES e DEPOIS de cada clique, e
// exige as duas coisas — que a grama vire canteiro e que a PEDRA NÃO vire.
// Medir só o caso positivo daria verde para uma enxada que transforma tudo em
// solo arado, que é o defeito mais provável desta etapa.
//
//   node scripts/qa-roquecraft-lavoura.mjs
//
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { servirDist } from './lib/servidor-do-dist.mjs'

const SAIDA = path.resolve('scripts/.qa-lavoura')
fs.mkdirSync(SAIDA, { recursive: true })

// ⚠️ O DIST PODE ESTAR COMPOSTO. Depois de um deploy, a raiz de `dist/pwa` é o
// site e o shell do app é `app.html` — o servidor sabe disso, a sonda não
// precisa saber. Ver `lib/servidor-do-dist.mjs`.
const { base, fechar } = await servirDist('dist/pwa')

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

// Um platô de grama limpo, para a mira não encontrar árvore nem barranco.
const Y = await page.evaluate(() => {
  const rc = window.__roquecraft
  rc.setMode('creative')
  const y = Math.round(rc.surfaceAt(0, 0) ?? 66) + 12
  rc.setFlying(true)
  rc.teleport(0.5, y + 3, 0.5)
  rc.fill(-8, y - 2, -8, 8, y, 8, 'grassBlock')
  rc.fill(-8, y + 1, -8, 8, y + 6, 8, 'air')
  return y
})
await page.waitForTimeout(2600)

/**
 * Olha uma célula de chão de cima e clica com o que estiver na mão.
 *
 * ⚠️ O OLHO FICA 2,4 ACIMA DO TOPO DO BLOCO, olhando quase a pino. Mais perto
 * e o corpo do jogador ocupa a célula; mais longe e a mira pega o vizinho.
 */
async function clicarNoChao(x, z, item) {
  return page.evaluate(
    ([x, z, y, item]) => {
      const rc = window.__roquecraft
      rc.setFlying(true)
      rc.teleport(x + 0.5, y + 1 + 2.4 - 1.62, z + 0.5)
      rc.look(0, -1.45)
      rc.equipar(item, 1)
      const mirado = rc.miraEm()
      const antes = rc.colunaEm(x, z, y, y)?.[0]?.bloco ?? 'nada'
      const ok = rc.place()
      return { mirado, antes, ok }
    },
    [x, z, Y, item],
  )
}

const leitura = (x, z) =>
  page.evaluate(
    ([x, z, y]) => window.__roquecraft.colunaEm(x, z, y, y)?.[0]?.bloco ?? 'nada',
    [x, z, Y],
  )

// ── 1. GRAMA VIRA CANTEIRO ──────────────────────────────────────────────────
const grama = await clicarNoChao(0, 0, 'wood_hoe')
await page.waitForTimeout(900)
const gramaDepois = await leitura(0, 0)

// ── 2. PEDRA NÃO VIRA ───────────────────────────────────────────────────────
await page.evaluate(([y]) => window.__roquecraft.fill(3, y, 0, 3, y, 0, 'stone'), [Y])
await page.waitForTimeout(700)
const pedra = await clicarNoChao(3, 0, 'wood_hoe')
await page.waitForTimeout(900)
const pedraDepois = await leitura(3, 0)

// ── 3. UM CANTEIRO DE VERDADE, PARA A FOTO ──────────────────────────────────
const canteiro = []
for (let x = -2; x <= 2; x++) {
  for (let z = -2; z <= 2; z++) {
    if (x === 0 && z === 0) continue
    canteiro.push([x, z])
  }
}
for (const [x, z] of canteiro) await clicarNoChao(x, z, 'wood_hoe')
await page.waitForTimeout(1400)
const arados = []
for (const [x, z] of canteiro) arados.push(await leitura(x, z))

// ── 4. SEMEAR E VER CRESCER ─────────────────────────────────────────────────
//
// ⚠️ O TEMPO É ACELERADO PELO RELÓGIO DA FILA, não por `waitForTimeout`. Cada
// estágio tem 25% de chance a cada 3 segundos: esperar de verdade levaria mais
// de um minuto e daria uma sonda que às vezes passa. `escoarFluidos` avança o
// MESMO relógio de 20 Hz que o jogo avança, só que o mais rápido que o
// processador deixa.
const semeadas = [
  [-2, -2],
  [0, 0],
  [2, 2],
]
const plantio = []
for (const [x, z] of semeadas) plantio.push(await clicarNoChao(x, z, 'wheat_seeds'))
await page.waitForTimeout(600)
const brotos = []
for (const [x, z] of semeadas) {
  brotos.push(
    await page.evaluate(
      ([x, z, y]) => window.__roquecraft.colunaEm(x, z, y + 1, y + 1)?.[0]?.bloco ?? 'nada',
      [x, z, Y],
    ),
  )
}

const relogio = await page.evaluate(() => window.__roquecraft.escoarFluidos(6000))
await page.waitForTimeout(1200)
const maduras = []
for (const [x, z] of semeadas) {
  maduras.push(
    await page.evaluate(
      ([x, z, y]) => window.__roquecraft.colunaEm(x, z, y + 1, y + 1)?.[0]?.bloco ?? 'nada',
      [x, z, Y],
    ),
  )
}

// A lavoura sem chão morre: tira o canteiro de baixo de uma delas.
await page.evaluate(([y]) => window.__roquecraft.fill(2, y, 2, 2, y, 2, 'stone'), [Y])
await page.evaluate(() => window.__roquecraft.escoarFluidos(200))
await page.waitForTimeout(700)
const semChao = await page.evaluate(
  ([y]) => window.__roquecraft.colunaEm(2, 2, y + 1, y + 1)?.[0]?.bloco ?? 'nada',
  [Y],
)

// ── 5. COLHER ───────────────────────────────────────────────────────────────
//
// A colheita é o elo que fecha a cadeia: sem ela o trigo existe no mundo e não
// chega ao inventário, e a receita de pão continua inalcançável.
//
// ⚠️ NO SURVIVAL, e com o quebrar DO JOGO (`breakNow` → `breakBlock`). No
// criativo nada dropa — medir a colheita em criativo daria zero item com o jogo
// perfeitamente são, que é o defeito clássico desta sonda.
const colheita = await page.evaluate(
  ([y]) => {
    const rc = window.__roquecraft
    rc.setMode('survival')
    const antes = rc.dropsInfo().filter((d) => d.item === 'wheat').length
    // ⚠️ O OLHO FICA TRÊS BLOCOS ACIMA DO TALO, e não encostado nele.
    //
    // A primeira versão punha o olho a 2,4 do topo do canteiro — ou seja,
    // DENTRO da célula onde o trigo está. A mira saía de dentro da planta,
    // ignorava a célula de origem e acertava o canteiro: a sonda quebrou o
    // SOLO, o talo morreu por falta de chão e ainda assim caiu trigo no chão.
    // Verde pelo motivo errado, que é o pior tipo de verde.
    //
    // E não pode ir longe DEMAIS: a 4,5 blocos do corpo o olho passou dos ~4
    // de alcance do raycast e `miraEm()` devolveu nada. Três blocos acima do
    // topo do talo é o ponto em que ele é o primeiro alvo e ainda cabe.
    rc.setFlying(true)
    rc.teleport(-2 + 0.5, y + 1 + 3.2 - 1.62, -2 + 0.5)
    rc.look(0, -1.5)
    const mirado = rc.miraEm()
    const quebrou = rc.breakNow()
    return { mirado, quebrou, antes }
  },
  [Y],
)
await page.waitForTimeout(900)
const caiu = await page.evaluate(() => window.__roquecraft.dropsInfo().map((d) => d.item))
// Delta, e não total: o chão pode ter trigo de antes — o talo de (2,2) morreu
// com o canteiro virado pedra e largou a espiga dele ali.
const trigoNovo = caiu.filter((i) => i === 'wheat').length - colheita.antes

// ── 6. O MATO, QUE É DE ONDE VEM A SEMENTE ──────────────────────────────────
//
// Sem conseguir mirar no mato, o jogador não tem como começar: não há trigo no
// mundo gerado, e o mato é a única fonte de semente.
const mato = await page.evaluate(
  ([y]) => {
    const rc = window.__roquecraft
    rc.setMode('survival')
    rc.fill(5, y, 5, 5, y, 5, 'grassBlock')
    rc.fill(5, y + 1, 5, 5, y + 1, 5, 'tallGrass')
    rc.setFlying(true)
    rc.teleport(5.5, y + 1 + 3.2 - 1.62, 5.5)
    rc.look(0, -1.5)
    const mirado = rc.miraEm()
    const quebrou = rc.breakNow()
    const sobrou = rc.colunaEm(5, 5, y + 1, y + 1)?.[0]?.bloco ?? 'nada'
    return { mirado: mirado?.chave ?? 'nada', quebrou, sobrou }
  },
  [Y],
)

// ── 7. AS RAÍZES ────────────────────────────────────────────────────────────
//
// Cenoura e batata usam a MESMA mecânica do trigo com metade dos estágios. O
// que se mede aqui é que a generalização pegou: o item plantável é o próprio
// alimento, e "madura" é o último estágio DAQUELA cultura — enquanto isso era
// a constante 7 do trigo, a cenoura no estágio 3 seria lida como verde para
// sempre e nunca poderia ser colhida.
const raizes = await page.evaluate(
  ([y]) => {
    const rc = window.__roquecraft
    rc.setMode('creative')
    rc.fill(-4, y, 4, -4, y, 4, 'farmland')
    rc.fill(-2, y, 4, -2, y, 4, 'farmland')
    const plantar = (x, z, item) => {
      rc.setFlying(true)
      rc.teleport(x + 0.5, y + 1 + 2.4 - 1.62, z + 0.5)
      rc.look(0, -1.45)
      rc.equipar(item, 1)
      return rc.place()
    }
    return { cenoura: plantar(-4, 4, 'carrot'), batata: plantar(-2, 4, 'potato') }
  },
  [Y],
)
await page.waitForTimeout(800)
await page.evaluate(() => window.__roquecraft.escoarFluidos(6000))
await page.waitForTimeout(1000)
const raizesMaduras = await page.evaluate(
  ([y]) => {
    const rc = window.__roquecraft
    const em = (x, z) => rc.colunaEm(x, z, y + 1, y + 1)?.[0]?.bloco ?? 'nada'
    return { cenoura: em(-4, 4), batata: em(-2, 4) }
  },
  [Y],
)

// ── 8. A ÁGUA ───────────────────────────────────────────────────────────────
//
// O solo molhado existia como bloco desde a etapa 1 e nada o produzia: uma
// textura que o jogo nunca mostrava. Hidratar é o que dá função ao balde, que
// custa três lingotes de ferro.
const agua = await page.evaluate(
  ([y]) => {
    const rc = window.__roquecraft
    rc.setMode('creative')
    // Um canteiro seco a três blocos de uma cova, e outro longe dela.
    rc.fill(-6, y, -6, -6, y, -6, 'farmland')
    rc.fill(-6, y, 2, -6, y, 2, 'farmland')
    rc.fill(-3, y, -6, -3, y, -6, 'water')
    const em = (x, z) => rc.colunaEm(x, z, y, y)?.[0]?.bloco ?? 'nada'
    return { antesPerto: em(-6, -6), antesLonge: em(-6, 2) }
  },
  [Y],
)
await page.evaluate(() => window.__roquecraft.escoarFluidos(2000))
await page.waitForTimeout(1200)
const aguaDepois = await page.evaluate(
  ([y]) => {
    const rc = window.__roquecraft
    const em = (x, z) => rc.colunaEm(x, z, y, y)?.[0]?.bloco ?? 'nada'
    return { perto: em(-6, -6), longe: em(-6, 2) }
  },
  [Y],
)

// ── 9. O MUNDO SALVO QUE VOLTA ──────────────────────────────────────────────
//
// ⚠️ O DEFEITO QUE SÓ APARECE ENTRE DUAS SESSÕES. A fila deste jogo é reativa:
// quem mantém a lavoura andando é a própria visita se repondo. Ao carregar um
// mundo salvo ninguém começa essa cadeia — o jogador planta, fecha o jogo e
// encontra o broto do mesmo tamanho no dia seguinte.
//
// O autosave está fechado em modo E2E, então o ciclo real (gravar, recarregar,
// abrir) não pode ser medido aqui. O que dá pra fazer é reproduzir o ESTADO em
// que o jogo acorda depois da carga: registro de edições cheio, fila vazia. E
// medir os dois lados — sem acordar não cresce, acordando cresce.
const voltando = await page.evaluate(
  async ([y]) => {
    const rc = window.__roquecraft
    const dorme = (ms) => new Promise((k) => setTimeout(k, ms))
    rc.setMode('creative')
    rc.fill(7, y, -7, 7, y, -7, 'farmland')
    rc.teleport(7.5, y + 1 + 2.4 - 1.62, -7 + 0.5)
    rc.look(0, -1.45)
    rc.equipar('wheat_seeds', 1)
    const plantou = rc.place()
    await dorme(400)
    const brotou = rc.colunaEm(7, -7, y + 1, y + 1)?.[0]?.bloco ?? 'nada'

    // O estado de quem acabou de carregar um save.
    rc.esvaziarFila()
    rc.escoarFluidos(4000)
    await dorme(300)
    const semAcordar = rc.colunaEm(7, -7, y + 1, y + 1)?.[0]?.bloco ?? 'nada'

    const acordadas = rc.acordarPlantios()
    rc.escoarFluidos(8000)
    await dorme(300)
    const depoisDeAcordar = rc.colunaEm(7, -7, y + 1, y + 1)?.[0]?.bloco ?? 'nada'
    return { plantou, brotou, semAcordar, acordadas, depoisDeAcordar }
  },
  [Y],
)

await page.evaluate(
  ([y]) => {
    const rc = window.__roquecraft
    rc.setFlying(true)
    rc.teleport(0.5, y + 6, 7.5)
    rc.look(0, -0.7)
  },
  [Y],
)
await page.waitForTimeout(800)
await foto('1-canteiro-arado.png')

// Uma segunda foto, de perto, com as três culturas no quadro: é a que responde
// "dá pra saber o que está plantado sem quebrar?".
await page.evaluate(
  ([y]) => {
    const rc = window.__roquecraft
    rc.setFlying(true)
    rc.teleport(-3.5, y + 2.2, 7.5)
    rc.look(0, -0.5)
  },
  [Y],
)
await page.waitForTimeout(700)
await foto('2-as-tres-culturas.png')

const viraram = arados.filter((b) => String(b).startsWith('farmland')).length
// ⚠️ `startsWith`, e não `=== 'wheat0'`. A primeira versão cobrava o estágio
// zero e reprovou com 1 de 3 numa execução e 3 de 3 na seguinte: entre plantar
// e medir passam centenas de milissegundos de jogo, e o sorteio de crescimento
// às vezes já avançou. O que se mede aqui é "nasceu trigo", não qual estágio.
const brotou = brotos.filter((b) => String(b).startsWith('wheat')).length
const cresceu = maduras.filter((b) => b === 'wheat7').length
const falhas = []
if (grama.mirado?.chave !== 'grassBlock')
  falhas.push(`a mira não pegou grama: ${grama.mirado?.chave}`)
if (!grama.ok) falhas.push('o clique com a enxada na grama devolveu false')
if (gramaDepois !== 'farmland') falhas.push(`a grama virou "${gramaDepois}", esperado farmland`)
if (pedra.ok) falhas.push('a enxada ACEITOU pedra — deveria recusar')
if (pedraDepois !== 'stone') falhas.push(`a pedra virou "${pedraDepois}"`)
if (viraram !== canteiro.length) falhas.push(`canteiro: ${viraram} de ${canteiro.length} araram`)
if (plantio.some((p) => !p.ok)) falhas.push('uma semente não entrou no canteiro')
if (brotou !== semeadas.length) falhas.push(`brotos: ${brotou} de ${semeadas.length} (${brotos})`)
if (cresceu < semeadas.length) falhas.push(`maduras: ${cresceu} de ${semeadas.length} (${maduras})`)
if (semChao !== 'air') falhas.push(`o talo sem canteiro embaixo continuou lá: ${semChao}`)
if (!colheita.quebrou) falhas.push('a espiga madura não foi quebrada')
if (colheita.mirado?.chave !== 'wheat7') {
  falhas.push(`a mira não pegou a espiga madura: ${colheita.mirado?.chave}`)
}
if (trigoNovo < 1) falhas.push(`colher a espiga madura não deu trigo novo: ${caiu}`)
if (mato.mirado !== 'tallGrass') falhas.push(`a mira não pega o MATO: ${mato.mirado}`)
if (!raizes.cenoura || !raizes.batata) falhas.push('cenoura ou batata não entrou no canteiro')
if (raizesMaduras.cenoura !== 'carrot3') falhas.push(`cenoura ficou em "${raizesMaduras.cenoura}"`)
if (raizesMaduras.batata !== 'potato3') falhas.push(`batata ficou em "${raizesMaduras.batata}"`)
if (aguaDepois.perto !== 'farmlandWet') falhas.push(`canteiro perto da água: ${aguaDepois.perto}`)
if (aguaDepois.longe !== 'farmland') falhas.push(`canteiro longe da água: ${aguaDepois.longe}`)
if (voltando.semAcordar !== voltando.brotou) {
  falhas.push(`sem acordar a lavoura andou sozinha (${voltando.brotou} → ${voltando.semAcordar})`)
}
if (voltando.acordadas < 1) falhas.push('acordarPlantios não achou nada no registro de edições')
if (voltando.depoisDeAcordar === voltando.semAcordar) {
  falhas.push(`acordar não destravou a lavoura: ficou em ${voltando.depoisDeAcordar}`)
}
if (erros.length) falhas.push(`erro de página: ${erros[0]}`)

console.log('')
console.log('lavoura — a enxada no jogo de verdade')
console.log('')
console.log(`  mira na grama      ${grama.mirado?.chave} → ${gramaDepois}`)
console.log(`  mira na pedra      ${pedra.mirado?.chave} → ${pedraDepois} (clique: ${pedra.ok})`)
console.log(`  canteiro 5×5       ${viraram} de ${canteiro.length} células araradas`)
console.log(`  semeadas           ${brotou} brotos de ${semeadas.length} (${brotos})`)
console.log(`  cresceram          ${cresceu} espigas maduras em ${relogio.tiques} tiques de jogo`)
console.log(`  talo sem chao      ${semChao}`)
console.log(
  `  colheita           ${colheita.mirado?.chave} → +${trigoNovo} trigo (chão: ${caiu.join(', ') || 'nada'})`,
)
console.log(
  `  mato               mira: ${mato.mirado} · quebrou: ${mato.quebrou} · sobrou: ${mato.sobrou}`,
)
console.log(
  `  raizes             cenoura: ${raizesMaduras.cenoura} · batata: ${raizesMaduras.batata}`,
)
console.log(
  `  agua               a 3 blocos: ${aguaDepois.perto} · a 8: ${aguaDepois.longe} (antes: ${agua.antesPerto})`,
)
console.log(
  `  save que volta      ${voltando.brotou} → sem acordar: ${voltando.semAcordar} → acordando ${voltando.acordadas}: ${voltando.depoisDeAcordar}`,
)
console.log(
  `  foto               ${path.relative(process.cwd(), path.join(SAIDA, '1-canteiro-arado.png'))}`,
)
console.log('')
if (falhas.length) {
  console.log('VERMELHO:')
  for (const f of falhas) console.log(`  ✗ ${f}`)
} else {
  console.log('VERDE: a enxada ara grama, recusa pedra, e o canteiro fechou.')
}
console.log('')

await b.close()
fechar()
process.exit(falhas.length ? 1 : 0)
