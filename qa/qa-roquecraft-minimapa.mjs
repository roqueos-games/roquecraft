//
// O MINIMAPA, FOTOGRAFADO E CONFERIDO.
//
// ⚠️ ESTA SONDA EXISTE PORQUE O TESTE DE UNIDADE NÃO ATRAVESSA A TELA.
//
// `minimapa.spec.js` prova que a conta está certa: a cor, o relevo, a marca no
// lugar que o gerador construiu. Nada disso diz que o mapa CHEGOU NO CANVAS —
// e entre a conta e o pixel tem um `setInterval`, um cache de peça, um clipe
// redondo e um `drawImage` com deslocamento arredondado. Qualquer um dos quatro
// pode estar errado com os 31 testes verdes.
//
// É a mesma divisão de trabalho da sonda da vila, e pelos mesmos motivos:
//
//   unidade → a conta do mapa está errada
//   ESTA    → o mapa não chegou na tela
//   a foto  → o mapa ficou ilegível (e quem julga é o humano)
//
// ⚠️ E ELA REPROVA POR PIXEL, não por foto. Três afirmações mecânicas:
//   1. o disco não ficou vazio  — as peças de terreno foram geradas e pintadas;
//   2. a vila ao lado está MARCADA — a cor da marca aparece no canvas;
//   3. a tecla M esconde e traz de volta — o atalho que o founder pediu;
//   4. NO NETHER O DISCO APAGA — e esta é a que já pegou um defeito de verdade.
//
// ⚠️ A QUARTA EXISTE PORQUE O REVISOR LEU O COMENTÁRIO E NÃO O CÓDIGO. O
// componente barrava a GERAÇÃO de peça fora do supermundo e deixava o
// `drawImage` das peças em cache passar. O cache não esvazia ao trocar de
// dimensão, e o Nether vive em coordenada dividida por oito — bem dentro do
// quadrado que o jogador acabou de percorrer. O resultado era um mapa de
// supermundo perfeitamente legível desenhado por cima do Nether. Nenhum teste de
// unidade alcança isso: o defeito mora entre um `if` e um laço, num componente.
//
//   node scripts/qa-roquecraft-minimapa.mjs
//
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { servirDist } from './lib/servidor-do-dist.mjs'

const SAIDA = path.resolve('qa-out/minimapa')
fs.mkdirSync(SAIDA, { recursive: true })

/** A cor da marca de vila, como `minimapa.js` a declara. */
const COR_DA_VILA = [244, 201, 96]
/** O fundo da peça que ainda não foi amostrada. */
const COR_DO_VAZIO = [24, 26, 30]
/** Quanto do disco pode continuar vazio depois de esperar as peças. */
const VAZIO_TOLERADO = 0.05
/** O id da dimensão em que o mapa vale. Igual ao `DIMENSAO_PADRAO` do jogo. */
const DIMENSAO_PADRAO = 'overworld'
/**
 * Quanto pixel pode sobrar ACESO no Nether: só a seta do jogador, que é um
 * losango de ~7×10 com contorno. Cento e vinte dá folga de dobro e ainda
 * reprova qualquer peça de terreno, que pinta milhares.
 */
const SETA_SOZINHA = 120

const { base, fechar } = await servirDist('dist/pwa')
const b = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
})
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' })
const page = await ctx.newPage()
const erros = []
page.on('pageerror', (e) => erros.push(String(e.message).slice(0, 200)))
await page.addInitScript(
  `window.__ROS_E2E__={auth:{uid:'e2e',email:'e@e.t',emailVerified:true,displayName:'E',role:'user'},googleDrive:{isConnected:false,files:[],user:{}},googleMapsApiKey:'',roquecraftSeed:1337}`,
)
await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => !!window.__rosStore, null, { timeout: 30000 })
await page.evaluate(() => window.__rosStore.openWindow('roquecraft'))
await page.waitForFunction(() => window.__roquecraft?.state?.ready === true, null, {
  timeout: 120000,
})
await page.waitForTimeout(800)

// ── onde está a vila ────────────────────────────────────────────────────────
//
// ⚠️ A COORDENADA SAI DO JOGO, como na sonda da vila. Cravá-la aqui faria esta
// sonda fotografar um mapa vazio e relatar "a marca não apareceu" no dia em que
// a grade mudar — acusando o mapa de um defeito do próprio instrumento.
const achado = await page.evaluate(() => {
  const rc = window.__roquecraft
  rc.setMode('creative')
  rc.setFlying(true)
  const plano = rc.procurarAldeia(6)
  return plano ? { centro: plano.centro, chao: plano.chao } : null
})
if (!achado) {
  console.error('VILA NÃO ENCONTRADA em 13×13 células a partir da origem.')
  await b.close()
  await fechar()
  process.exit(1)
}

// ⚠️ AO LADO DA VILA, E NÃO EM CIMA DELA. No centro, a marca fica debaixo da
// seta do jogador e a contagem de pixel não separa uma da outra: a sonda passaria
// com a marca apagada. A 85 blocos ela cai dentro do disco e longe do meio.
const DESVIO = 60
await page.evaluate(
  async ({ cx, cz, chao }) => {
    const rc = window.__roquecraft
    rc.teleport(cx + 60, chao + 30, cz + 60)
    rc.look(Math.PI * 1.25, 0.1)
    await rc.waitChunks(4, 60000)
  },
  { cx: achado.centro.x, cz: achado.centro.z, chao: achado.chao },
)

/**
 * O que há dentro do disco do minimapa, contado pixel a pixel.
 *
 * ⚠️ A VILA É PROCURADA NO PIXEL ONDE ELA TEM QUE ESTAR, e não no disco inteiro.
 *
 * A primeira versão contava pixels da cor da vila em qualquer lugar do canvas e
 * deu 37 — todos das SETAS de borda, que são da mesma cor porque marcam vilas
 * distantes. A vila a 85 blocos podia estar apagada e a sonda passava. Contar a
 * cor certa no lugar errado é o mesmo defeito que contar bloco de vila fora da
 * caixa: o número existe e não afirma nada.
 *
 * A conta abaixo é a MESMA de `projetar` — dois blocos por pixel, centro do
 * disco no jogador — feita a partir da coordenada que o JOGO deu para a vila.
 */
const ler = (vila) =>
  page.evaluate(
    ({ corDaVila, corDoVazio, alvo }) => {
      const cv = document.querySelector('.rc-mini__tela')
      if (!cv) return { existe: false }
      const n = cv.width
      const raio = n / 2
      const px = cv.getContext('2d').getImageData(0, 0, n, n).data
      const em = (x, y) => (y * n + x) * 4
      const perto = (o, c, tol) =>
        Math.hypot(px[o] - c[0], px[o + 1] - c[1], px[o + 2] - c[2]) < tol
      const cores = new Set()
      let dentro = 0
      let vazios = 0
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          if (Math.hypot(x - raio + 0.5, y - raio + 0.5) > raio - 4) continue
          const o = em(x, y)
          dentro++
          cores.add((px[o] << 16) | (px[o + 1] << 8) | px[o + 2])
          if (perto(o, corDoVazio, 6)) vazios++
        }
      }
      // Onde a marca da vila TEM que estar, e o que há lá de verdade.
      const rc = window.__roquecraft
      const p = rc.state.player
      const mx = Math.round(raio + (alvo.x - p.x) / 2)
      const my = Math.round(raio + (alvo.z - p.z) / 2)
      let naMarca = 0
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const x = mx + dx
          const y = my + dy
          if (x < 0 || y < 0 || x >= n || y >= n) continue
          if (perto(em(x, y), corDaVila, 34)) naMarca++
        }
      }
      return {
        existe: true,
        lado: n,
        dentro,
        vazios,
        cores: cores.size,
        marca: { mx, my, naMarca },
      }
    },
    { corDaVila: COR_DA_VILA, corDoVazio: COR_DO_VAZIO, alvo: vila },
  )

// ⚠️ ESPERA A CONDIÇÃO, E NÃO O RELÓGIO. A primeira versão dormia seis segundos
// fixos e mediu 1,9% de disco vazio numa rodada e 4,9% na seguinte — a mesma
// build, o mesmo mundo. O mapa gera UMA peça por tique de 110 ms e o tique
// escorrega quando o quadro do jogo está caro, então o número de peças prontas
// depende da carga da máquina. Um limite de 5% com medida que oscila entre 2 e 5
// é uma sonda que reprova sozinha uma noite dessas, e sonda que reprova à toa é
// sonda que se para de rodar.
const alvoDaVila = {
  x: achado.centro.x,
  z: achado.centro.z,
  jx: achado.centro.x + DESVIO,
  jz: achado.centro.z + DESVIO,
}
const PACIENCIA = 25
let aberto = null
for (let i = 0; i < PACIENCIA; i++) {
  aberto = await ler(alvoDaVila)
  if (!aberto.existe) break
  if (aberto.vazios === 0) break
  await page.waitForTimeout(700)
}

// ── as fotos ────────────────────────────────────────────────────────────────
const fotos = []
const fotografar = async (nome) => {
  const arq = path.join(SAIDA, `${nome}.png`)
  await page.screenshot({ path: arq })
  fotos.push(path.relative(process.cwd(), arq))
}
await fotografar('tela-com-mapa')
const caixa = await page.locator('.rc-mini__disco').boundingBox()
if (caixa) {
  const arq = path.join(SAIDA, 'mapa-de-perto.png')
  await page.screenshot({
    path: arq,
    clip: { x: caixa.x - 8, y: caixa.y - 8, width: caixa.width + 16, height: caixa.height + 16 },
  })
  fotos.push(path.relative(process.cwd(), arq))
}

// ── a tecla ─────────────────────────────────────────────────────────────────
await page.keyboard.press('KeyM')
await page.waitForTimeout(400)
const escondido = {
  semTela: (await page.locator('.rc-mini__tela').count()) === 0,
  comBotao: (await page.locator('.rc-mini__botao').count()) === 1,
}
await fotografar('tela-sem-mapa')
await page.keyboard.press('KeyM')
await page.waitForTimeout(900)
const devolta = (await page.locator('.rc-mini__tela').count()) === 1

// ── O NETHER ────────────────────────────────────────────────────────────────
//
// ⚠️ A COORDENADA É ESCOLHIDA, e não a que o portal deu. Depois de atravessar, a
// sonda teleporta o jogador para a coordenada do SUPERMUNDO onde as peças estão
// comprovadamente em cache — a mesma que ela acabou de fotografar. Se o mapa
// desenhar peça fora do supermundo, ali ele desenha o disco INTEIRO, e o defeito
// não depende de sorte de geometria para aparecer.
const noNether = await page.evaluate(
  async ({ vx, vz }) => {
    const rc = window.__roquecraft
    const dorme = (ms) => new Promise((k) => setTimeout(k, ms))
    const x = 200
    const z = 200
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
    // ⚠️ ESPERA A TRAVESSIA, e não um relógio. Com 3.500 ms fixos o jogador
    // ficava no supermundo sob a carga do mapa desenhando, e a quarta afirmação
    // reprovava por não ter medido nada — que é o certo, mas é ruído.
    rc.teleport(x + 0.5, y0, z + 0.5)
    let dimensao = rc.dimensaoAtual()
    for (let i = 0; i < 24 && dimensao === 'overworld'; i++) {
      await dorme(500)
      rc.teleport(x + 0.5, y0, z + 0.5)
      dimensao = rc.dimensaoAtual()
    }
    // Em cima da coordenada cujas peças estão em cache.
    const p = rc.state.player
    rc.teleport(vx, p.y, vz)
    await dorme(1200)
    return { dimensao }
  },
  { vx: achado.centro.x + DESVIO, vz: achado.centro.z + DESVIO },
)
const discoNoNether = noNether.dimensao === DIMENSAO_PADRAO ? null : await ler(alvoDaVila)
await fotografar('tela-no-nether')

await b.close()
await fechar()

// ── o veredito ──────────────────────────────────────────────────────────────
const problemas = []
if (!aberto.existe) problemas.push('o canvas do minimapa não existe na tela')
else {
  const fracaoVazia = aberto.vazios / aberto.dentro
  if (fracaoVazia > VAZIO_TOLERADO) {
    problemas.push(
      `o disco ficou ${(fracaoVazia * 100).toFixed(1)}% vazio: a peça de terreno não chegou no canvas`,
    )
  }
  if (aberto.cores < 40) {
    problemas.push(
      `só ${aberto.cores} cores no disco: o terreno saiu chapado, sem bioma nem relevo`,
    )
  }
  if (!aberto.marca || aberto.marca.naMarca === 0) {
    problemas.push(
      `a vila a ${Math.round(DESVIO * Math.SQRT2)} blocos não está marcada no pixel ` +
        `${aberto.marca?.mx},${aberto.marca?.my} do disco, que é onde ela cai`,
    )
  }
}
if (!escondido.semTela) problemas.push('a tecla M não escondeu o mapa')
if (!escondido.comBotao) problemas.push('escondido, o mapa não deixou o botão de trazer de volta')
if (!devolta) problemas.push('a tecla M não trouxe o mapa de volta')
if (noNether.dimensao === DIMENSAO_PADRAO) {
  problemas.push(
    'a travessia falhou: o jogador não chegou no Nether, e a 4ª afirmação não mediu nada',
  )
} else if (discoNoNether?.existe) {
  const acesos = discoNoNether.dentro - discoNoNether.vazios
  if (acesos > SETA_SOZINHA) {
    problemas.push(
      `no Nether o disco tem ${acesos} pixels acesos (só a seta caberia em ${SETA_SOZINHA}): ` +
        'o mapa está desenhando peça de supermundo por cima de outra dimensão',
    )
  }
}
if (erros.length)
  problemas.push(`${erros.length} erro(s) de página: ${erros.slice(0, 2).join(' | ')}`)

console.log(
  JSON.stringify(
    {
      vila: achado.centro,
      jogadorEm: { x: achado.centro.x + DESVIO, z: achado.centro.z + DESVIO },
      disco: aberto,
      tecla: { ...escondido, devolta },
      nether: { dimensao: noNether.dimensao, disco: discoNoNether },
      fotos,
      problemas,
      veredito: problemas.length ? 'REPROVADO' : 'o mapa chegou na tela e a tecla M funciona',
    },
    null,
    2,
  ),
)
process.exit(problemas.length ? 1 : 0)
