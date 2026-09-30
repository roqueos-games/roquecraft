//
// A TRAVESSIA, NO JOGO — o portal leva ao Nether, e traz de volta.
//
// ⚠️ O QUE SÓ O JOGO RODANDO RESPONDE: a regra pura sabe calcular o destino e
// montar o portal de chegada, e `viagemEntreDimensoes.spec.js` prova isso com
// um mundo de mentira. O que ela não pode provar é que o mundo TROCA — que o
// worker recebe a dimensão nova, que o chunk gerado do outro lado é de
// netherrack, que o jogador pousa em pé em vez de cair, e que o portal de volta
// existe de verdade quando ele chega.
//
// E a volta é metade do teste. Um portal de ida sem volta é um jeito elegante
// de perder o mundo do jogador.
//
//   node scripts/qa-roquecraft-travessia.mjs
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

  const acenderPortalAqui = async (x, z) => {
    const y0 = Math.round(rc.surfaceAt(x, z) ?? 66) + 10
    rc.teleport(x + 0.5, y0 + 6, z + 0.5)
    await rc.waitChunks(2, 30000)
    rc.fill(x, y0 - 1, z, x + 1, y0 - 1, z, 'obsidian')
    rc.fill(x, y0 + 3, z, x + 1, y0 + 3, z, 'obsidian')
    rc.fill(x - 1, y0, z, x - 1, y0 + 2, z, 'obsidian')
    rc.fill(x + 2, y0, z, x + 2, y0 + 2, z, 'obsidian')
    await dorme(400)
    rc.equipar('flint_and_steel', 1)
    rc.teleport(x + 0.5, y0, z + 0.5)
    rc.look(0, -1.5)
    rc.place()
    await dorme(400)
    return y0
  }

  const ondeEstou = () => {
    const pos = rc.state.player
    const f = (v) => Math.floor(v)
    return {
      dimensao: rc.dimensaoAtual(),
      pos,
      sobOsPes: rc.blockKeyAt(f(pos.x), f(pos.y) - 1, f(pos.z)),
      dentro: rc.blockKeyAt(f(pos.x), f(pos.y), f(pos.z)),
      nevoa: rc.inspect()?.fog?.cor ?? null,
    }
  }

  // ── IDA ───────────────────────────────────────────────────────────────────
  const y0 = await acenderPortalAqui(200, 200)
  const antes = ondeEstou()
  void 0
  // O jogador fica parado DENTRO do vão. O relógio do portal faz o resto.
  rc.teleport(200.5, y0, 200.5)
  await dorme(3500)
  const noNether = ondeEstou()

  // ── VOLTA ─────────────────────────────────────────────────────────────────
  // Ele chegou dentro do portal de chegada; SAIR e voltar é o que prova que o
  // portal de volta existe e funciona, e não só que ele está desenhado — e é
  // também o que exercita a imunidade de chegada, que só se solta quando o
  // jogador sai do vão.
  const chegada = { ...noNether.pos }
  rc.teleport(chegada.x + 6, chegada.y + 1, chegada.z)
  await dorme(1200)
  const foraDoPortal = ondeEstou()
  // Uma marca do jogador DENTRO do Nether: é ela que tem que sobreviver no save.
  rc.fill(
    Math.floor(chegada.x) + 6,
    Math.floor(chegada.y) + 2,
    Math.floor(chegada.z),
    Math.floor(chegada.x) + 6,
    Math.floor(chegada.y) + 2,
    Math.floor(chegada.z),
    'glowstone',
  )
  await dorme(300)
  rc.teleport(chegada.x, chegada.y, chegada.z)
  const filme = []
  for (let i = 0; i < 8; i++) {
    await dorme(500)
    const e = ondeEstou()
    filme.push({ t: i * 0.5, dimensao: e.dimensao, y: Math.round(e.pos.y), dentro: e.dentro })
  }
  const deVolta = ondeEstou()

  // ── O SAVE GUARDA AS DUAS DIMENSÕES ───────────────────────────────────────
  //
  // ⚠️ MEDIDO NO PAYLOAD REAL, e não numa reconstrução dele: `payloadDeSave` é a
  // mesma função que o autosave usa. O E2E não grava de verdade (a quarta porta
  // recusa), então gravar e recarregar não é caminho aqui — mas o payload é o
  // que iria para o disco, e é nele que o Nether tem que aparecer.
  const payloadNoOverworld = (() => {
    const p = rc.payloadDeSave()
    return {
      dimensionId: p.dimensionId,
      edits: p.edits.length,
      // O payload é o DOCUMENTO (save v13): lista dentro de lista vai como
      // `{ _a: [...] }`, porque o Firestore recusa a lista crua. A sonda lê
      // as duas formas, a de antes e a de agora.
      outras: (p.outrasDimensoes || []).map((e) => {
        const [id, l] = Array.isArray(e) ? e : e._a
        return [id, (Array.isArray(l) ? l : l._a).length]
      }),
    }
  })()

  return { y0, antes, noNether, chegada, foraDoPortal, deVolta, filme, payloadNoOverworld }
})

await ctx.close()
await b.close()
fechar()

const falhas = []
if (r.antes.dimensao !== 'overworld') falhas.push(`nao comecou no overworld: ${r.antes.dimensao}`)
if (r.noNether.dimensao !== 'nether') {
  falhas.push(`o portal nao levou ao Nether: ainda em ${r.noNether.dimensao}`)
}
if (r.noNether.sobOsPes === 'air') {
  falhas.push('chegou no Nether caindo: nao ha chao sob os pes')
}
if (r.foraDoPortal.dimensao !== 'nether') falhas.push('saiu do Nether sem passar pelo portal')
if (r.deVolta.dimensao !== 'overworld') {
  falhas.push(`o portal de volta nao trouxe: ${r.deVolta.dimensao} — o jogador ficou preso`)
}
if (r.deVolta.sobOsPes === 'air') falhas.push('voltou caindo: nao ha chao sob os pes')
// A NÉVOA É A PROVA DE QUE O CÉU TROCOU, e ela é medida do grafo da cena, não
// de um screenshot: no Nether o vermelho domina, no overworld não.
const canais = (hex) => (hex ? [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) : null)
const vermelha = (hex) => {
  const c = canais(hex)
  return !!c && c[0] > c[1] * 1.6 && c[0] > c[2] * 1.6
}
if (!vermelha(r.noNether.nevoa)) {
  falhas.push(`a nevoa do Nether nao e vermelha: #${r.noNether.nevoa}`)
}
if (vermelha(r.antes.nevoa)) falhas.push(`a nevoa do overworld ja era vermelha: #${r.antes.nevoa}`)
if (vermelha(r.deVolta.nevoa)) {
  falhas.push(`a nevoa do Nether ficou no overworld: #${r.deVolta.nevoa} — o ceu nao voltou`)
}
// ⚠️ A ASSERÇÃO QUE FALTAVA, e sem ela esta sonda ficou VERDE com o defeito
// inteiro presente: parado dentro do portal de chegada, o jogador atravessava de
// volta a cada 1,2 s. Quem chega fica imune ATÉ SAIR, e o filme prova isso —
// depois da primeira troca, a dimensão não muda mais sozinha.
const trocas = (r.filme || []).filter((f, i, a) => i > 0 && f.dimensao !== a[i - 1].dimensao)
if (trocas.length > 1) {
  falhas.push(
    `o portal virou pendulo: ${trocas.length} trocas com o jogador parado — ` +
      (r.filme || []).map((f) => `${f.t}s:${f.dimensao}`).join(' '),
  )
}
// ⚠️ O SAVE TEM QUE LEMBRAR DAS DUAS. Enquanto tinha um mapa só, gravar no
// Nether escrevia a caverna por cima do mundo — e a saída provisória, recusar a
// gravação lá, fazia o jogador perder tudo que construísse no Nether.
const p = r.payloadNoOverworld
if (p.dimensionId !== 'overworld') falhas.push(`o payload gravaria a dimensao errada: ${p.dimensionId}`)
const doNether = (p.outras || []).find(([id]) => id === 'nether')
if (!doNether || doNether[1] <= 0) {
  falhas.push(
    `o que o jogador construiu no Nether nao entrou no save: ${JSON.stringify(p.outras)}`,
  )
}
if (erros.length) falhas.push(`erro de pagina: ${erros[0]}`)

const linha = (nome, e) =>
  `  ${nome.padEnd(12)} ${String(e.dimensao).padEnd(10)} y=${Math.round(e.pos.y)
    .toString()
    .padStart(3)}  sob os pes: ${String(e.sobOsPes).padEnd(12)} nevoa: #${e.nevoa}`

console.log('')
console.log('travessia — ida e volta pelo portal')
console.log('')
console.log(linha('antes', r.antes))
console.log(linha('no Nether', r.noNether))
console.log(linha('andou', r.foraDoPortal))
console.log(linha('de volta', r.deVolta))
console.log('')
console.log(
  `  save: dimensao ${r.payloadNoOverworld.dimensionId}, ${r.payloadNoOverworld.edits} numeros aqui, ` +
    `outras dimensoes ${JSON.stringify(r.payloadNoOverworld.outras)}`,
)
console.log('')
for (const f of r.filme || []) {
  console.log(`    ${f.t}s ${String(f.dimensao).padEnd(10)} y=${f.y} dentro=${f.dentro}`)
}
console.log('')
if (falhas.length) {
  console.log('VERMELHO:')
  for (const f of falhas) console.log(`  ✗ ${f}`)
} else {
  console.log('VERDE: o portal leva ao Nether e o de la traz de volta.')
}
console.log('')
process.exit(falhas.length ? 1 : 0)
