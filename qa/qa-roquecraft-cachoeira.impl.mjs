//
// CACHOEIRA DE MONTANHA — ela existe no mundo, e o jogo a OUVE e a VÊ?
//
// "e eu quero cachoeiras em montanhas também" — founder, 13/09/2026.
//
// ⚠️ TRÊS PERGUNTAS DIFERENTES, E SÓ A PRIMEIRA É BARATA.
//
//   1. o worldgen escreve água caindo na montanha?   (teste unitário resolve)
//   2. o jogo ACHA essa queda quando o jogador chega? (só o jogo rodando diz)
//   3. isso vira som e espuma?                        (idem)
//
// O teste unitário cobre a 1 e o ponto fixo da regra dos fluidos. Esta sonda
// existe pela 2 e pela 3: entre o bloco no array e o barulho no alto-falante
// estão `acharQuedas`, o raio da busca, a cadência do ambiente, a rampa do
// leito e o teto do grupo — cinco lugares onde a cachoeira pode existir no mapa
// e não chegar ao jogador.
//
// ⚠️ E TEM O CONTROLE. Medir só "o leito está acima de zero" perto da queda
// deixaria passar o pior defeito possível: um leito que toca SEMPRE. Por isso a
// sonda mede duas vezes — colada na cachoeira e longe dela — e cobra a
// diferença. Um número sem o seu controle não é medição, é torcida.
//
//   node scripts/qa-roquecraft-cachoeira.mjs
//
import { chromium } from 'playwright'
import { createNoiseContext, generateChunkData } from '../src/servicos/worldgen.js'
import { WORLD_HEIGHT, localIndex, AIR } from '../src/servicos/constants.js'
import { AGUA_CAINDO } from '../src/servicos/cachoeiraDeMontanha.js'
import { ehQueda, alturaDaColuna, ALTURA_MINIMA } from '../src/servicos/cachoeira.js'
import { servirDist } from './lib/servidor-do-dist.mjs'

const SEMENTE = 942457

// ── 1. ONDE ELA CAIU, no mesmo mundo que o navegador vai gerar ──────────────
const nz = createNoiseContext(SEMENTE)
const chunks = new Map()
const chunkDe = (cx, cz) => {
  const k = `${cx},${cz}`
  let c = chunks.get(k)
  if (!c) chunks.set(k, (c = generateChunkData(nz, cx, cz).blocks))
  return c
}
const blocoEm = (x, y, z) => {
  if (y < 0 || y >= WORLD_HEIGHT) return AIR
  return chunkDe(x >> 4, z >> 4)[localIndex(x & 15, y, z & 15)]
}

// Busca em anéis a partir da origem: a primeira cachoeira que aparecer é a mais
// perto do spawn, e é a que custa menos chunk pro navegador carregar.
function acharCachoeira(raioMax = 26) {
  for (let r = 0; r <= raioMax; r++) {
    for (let cx = -r; cx <= r; cx++) {
      for (let cz = -r; cz <= r; cz++) {
        if (Math.max(Math.abs(cx), Math.abs(cz)) !== r) continue
        const b = chunkDe(cx, cz)
        for (let lx = 0; lx < 16; lx++) {
          for (let lz = 0; lz < 16; lz++) {
            for (let y = 1; y < WORLD_HEIGHT - 1; y++) {
              if (b[localIndex(lx, y, lz)] !== AGUA_CAINDO) continue
              const x = cx * 16 + lx
              const z = cz * 16 + lz
              if (ehQueda(blocoEm(x, y + 1, z))) continue
              const altura = alturaDaColuna(x, y, z, blocoEm)
              if (altura >= ALTURA_MINIMA) return { x, y, z, altura, chunks: r }
            }
          }
        }
      }
    }
  }
  return null
}

const alvo = acharCachoeira()
if (!alvo) {
  console.log('')
  console.log('VERMELHO:')
  console.log(`  ✗ a semente ${SEMENTE} não gerou cachoeira nenhuma em 53x53 chunks`)
  console.log('')
  process.exit(1)
}

// ── 2. O JOGO, RODANDO ──────────────────────────────────────────────────────
const { base, fechar } = await servirDist('dist/pwa')
const b = await chromium.launch({
  args: [
    '--use-gl=angle',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--autoplay-policy=user-gesture-required',
  ],
})
const ctx = await b.newContext({
  viewport: { width: 900, height: 820 },
  serviceWorkers: 'block',
  locale: 'pt-BR',
})
const page = await ctx.newPage()
const erros = []
page.on('pageerror', (e) => erros.push(String(e.message).slice(0, 160)))
await page.addInitScript(
  `window.__ROS_E2E__={auth:{uid:'e2e',email:'e@e.t',emailVerified:true,displayName:'E',role:'user'},googleDrive:{isConnected:false,files:[],user:{}},googleMapsApiKey:'',roquecraftSeed:${SEMENTE}}`,
)
await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => !!window.__rosStore, null, { timeout: 30000 })
await page.waitForTimeout(600)
// O gesto que ABRE o jogo é o que destrava o áudio — o mesmo caminho do jogador.
await page.mouse.click(450, 400)
await page.evaluate(() => window.__rosStore.openWindow('roquecraft'))
await page.waitForFunction(() => window.__roquecraft?.state?.ready === true, null, {
  timeout: 120000,
})
await page.waitForTimeout(1200)

async function medirEm(x, y, z) {
  return page.evaluate(
    async ([px, py, pz]) => {
      const rc = window.__roquecraft
      const dorme = (ms) => new Promise((k) => setTimeout(k, ms))
      rc.setMode('creative')
      rc.setFlying(true)
      rc.teleport(px + 0.5, py, pz + 0.5)
      await rc.waitChunks(3, 30000)
      // A varredura de queda anda a 1 Hz e o leito sobe numa rampa de 1,5 s:
      // medir antes disso mediria a rampa, não a cachoeira.
      await dorme(5000)
      return {
        leitos: rc.somLeitos(),
        borrifo: rc.borrifoVivo(),
        som: rc.somInfo(),
        blocoNaQueda: rc.blockKeyAt(px, py - 6, pz),
        submerso: rc.state?.underwater ?? null,
      }
    },
    [x, y, z],
  )
}

// ── 3. O CONTROLE VEM PRIMEIRO ──────────────────────────────────────────────
//
// Longe de qualquer queda conhecida, no mesmo mundo e na mesma sessão. Medido
// ANTES de propósito: o leito desce por rampa de 1,5 s, e ler o controle DEPOIS
// da cachoeira leria o rabo dessa rampa em vez do silêncio — foi o que a
// primeira rodada desta sonda pegou (0,002 no controle, resíduo puro).
const longe = await medirEm(alvo.x + 900, alvo.y, alvo.z + 900)

// ⚠️ ACIMA DA NASCENTE, NÃO DENTRO DA COLUNA. A primeira rodada teleportou o
// jogador para o meio da queda e mediu leito ZERO com a cachoeira funcionando
// perfeitamente: `mixDeAmbiente` silencia `amb.cachoeira` quando o jogador está
// SUBMERSO, de propósito — debaixo d'água o ouvido não escuta a queda, escuta a
// água. De dentro da cachoeira ninguém ouve cachoeira. Quatro blocos acima do
// lábio o jogador está no ar, a ~7 blocos do meio da coluna, dentro do raio de
// busca de 14.
const perto = await medirEm(alvo.x, alvo.y + 4, alvo.z)

await ctx.close()
await b.close()
fechar()

const g = (m) => m.leitos?.['amb.cachoeira'] ?? 0
const falhas = []
if (!(perto.som?.temCtx && perto.som.estado === 'running')) {
  falhas.push(`o áudio nem subiu: ${JSON.stringify(perto.som)} — a medição não vale`)
}
if (perto.blocoNaQueda !== 'waterFalling') {
  falhas.push(
    `no mundo do navegador não há água caindo em (${alvo.x},${alvo.y - 2},${alvo.z}): ${perto.blocoNaQueda}`,
  )
}
if (perto.submerso) falhas.push('o jogador ficou submerso — o leito é silenciado e a medida mente')
if (!(g(perto) > 0)) falhas.push(`o jogo não ouviu a cachoeira: leito em ${g(perto)}`)
if (!(perto.borrifo > 0)) falhas.push(`a cachoeira não fez espuma: ${perto.borrifo} gotas`)
if (!(g(longe) < g(perto) / 4)) {
  falhas.push(
    `o leito não é da cachoeira: longe dela ele ficou em ${g(longe)} contra ${g(perto)} perto`,
  )
}
if (longe.borrifo > 0) falhas.push(`borrifo longe de qualquer queda: ${longe.borrifo} gotas`)
if (erros.length) falhas.push(`erro de página: ${erros[0]}`)

console.log('')
console.log('cachoeira de montanha — o mapa, o ouvido e o olho')
console.log('')
console.log(
  `  achada em (${alvo.x}, ${alvo.y}, ${alvo.z}), coluna de ${alvo.altura} blocos, a ${alvo.chunks} chunks do spawn`,
)
console.log(`  PERTO  leito amb.cachoeira ${g(perto).toFixed(3)} | borrifo ${perto.borrifo} gotas`)
console.log(`  LONGE  leito amb.cachoeira ${g(longe).toFixed(3)} | borrifo ${longe.borrifo} gotas`)
console.log(`  bloco no meio da coluna: ${perto.blocoNaQueda}`)
console.log('')
if (falhas.length) {
  console.log('VERMELHO:')
  for (const f of falhas) console.log(`  ✗ ${f}`)
} else {
  console.log('VERDE: a montanha tem cachoeira, o jogo a ouve e ela espuma.')
}
console.log('')
process.exit(falhas.length ? 1 : 0)
