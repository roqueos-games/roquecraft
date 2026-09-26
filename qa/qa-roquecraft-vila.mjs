//
// A VILA, FOTOGRAFADA E CONTADA — a régua visual do Goal 19.
//
// ⚠️ O FOUNDER OLHOU E DISSE QUE ESTAVA FEIO, e a suíte estava verde. Tudo que
// ela media era se a casa tinha a forma que o código dizia que ela tinha —
// forma certa e vila pobre passam juntas. Esta sonda faz as duas coisas que o
// teste de unidade não faz:
//
//   1. FOTOGRAFA a vila de quatro ângulos, de dia e de noite, para o humano
//      olhar. Foto não reprova sozinha, e isso está escrito de propósito.
//   2. CONFERE O PLANO CONTRA O MUNDO. O gerador diz quantos blocos a vila tem;
//      a sonda conta quantos chegaram. Se os dois números divergem, a vila foi
//      planejada e não construída — e esse é um defeito que nenhum teste de
//      unidade enxerga, porque a unidade nunca passa pelo `worldgen`.
//
// ⚠️ E ELA NÃO MEDE POBREZA, de propósito. Plano e mundo saem da MESMA função:
// apague a parede da casa e os dois lados encolhem juntos, a comparação
// continua batendo, e esta sonda passa verde sobre uma vila que piorou. Foi
// medido com mutante em 14/09/2026, e o mutante SOBREVIVEU aqui — enquanto
// `vila-inventario.spec.js` o matou na hora (1.008 blocos para 413).
//
// Os dois instrumentos medem coisas diferentes e nenhum substitui o outro:
//
//   catraca de unidade → a vila ficou mais pobre
//   esta sonda         → a vila não chegou no mundo
//   a foto             → a vila ficou feia (e quem julga é o humano)
//
// ⚠️ A COORDENADA NÃO É CRAVADA. A sonda antiga da aldeia tem
// `const ALDEIA = { x: -3352, z: -3752 }` no fonte: mude o raio da célula ou o
// critério de terreno e ela passa a fotografar um campo vazio, relatando "a
// vila não existe" sobre uma vila perfeitamente construída. Aqui quem responde
// onde está a vila é o JOGO, por `procurarAldeia` (ver `qaDeAldeia.js`).
//
//   node scripts/qa-roquecraft-vila.mjs
//
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { servirDist } from './lib/servidor-do-dist.mjs'

const SAIDA = path.resolve('qa-out/vila')
fs.mkdirSync(SAIDA, { recursive: true })

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
const achado = await page.evaluate(() => {
  const rc = window.__roquecraft
  rc.setMode('creative')
  rc.setFlying(true)
  const plano = rc.procurarAldeia(6)
  return plano ? { centro: plano.centro, chao: plano.chao, casas: plano.casas.length } : null
})
if (!achado) {
  console.error('VILA NÃO ENCONTRADA em 13×13 células a partir da origem.')
  await b.close()
  await fechar()
  process.exit(1)
}

// ── o plano, e o que chegou no mundo ────────────────────────────────────────
const medida = await page.evaluate(
  async ({ cx, cz }) => {
    const rc = window.__roquecraft
    const dorme = (ms) => new Promise((k) => setTimeout(k, ms))
    rc.teleport(cx, 120, cz)
    // ⚠️ RAIO SEIS, e não quatro: a vila escreve até 33 blocos do centro e a
    // caixa de contagem vai até a borda dela. Esperar menos chunk do que se vai
    // ler faz a sonda acusar de ausente o que ainda não chegou.
    await rc.waitChunks(6, 60000)
    await dorme(2500)
    const plano = rc.procurarAldeia(6)
    const doPlano = rc.inventarioDoPlano(plano)
    // O que o mundo REALMENTE tem, na mesma caixa.
    const noMundo = {}
    let solidos = 0
    // ⚠️ O RAIO VEM DO JOGO. Cravado em 26, ele parou de cobrir a vila quando
    // ela cresceu na onda 2: a sonda contava 281 escadas de 292 e acusava
    // "planejada e não construída" sobre uma vila inteira e correta. As onze
    // que faltavam estavam nas quinas, entre 27 e 33 blocos do centro — fora da
    // caixa dela, não fora do mundo.
    const R = rc.raioDaVila()
    for (let x = cx - R; x <= cx + R; x++) {
      for (let z = cz - R; z <= cz + R; z++) {
        for (
          let y = plano.chao - doPlano.profundidade;
          y <= plano.chao + doPlano.alturaAcimaDoChao;
          y++
        ) {
          const k = rc.blockKeyAt(x, y, z)
          // ⚠️ SÓ O AR SAI DA CONTA. A lista de exclusão tinha 'dirt', 'grass' e
          // 'stone' para não contar terreno natural — e quebrou na hora em que a
          // vila passou a TERRACEAR: ela escreve terra e grama no terreiro, o
          // plano contava 682 torrões e o mundo zero, e a sonda acusou de
          // ausente exatamente a correção que acabara de entrar.
          //
          // A comparação é tipo a tipo e a condição é `mundo < plano`: contar a
          // MAIS é inofensivo (grama natural dentro da caixa só engorda o lado
          // do mundo), contar a menos é o que mente. Excluir tipo nenhum é a
          // única escolha que não pode mentir para baixo.
          if (k === 'air') continue
          // ⚠️ A PORTA EM USO CONTINUA SENDO A PORTA. Desde a rotina do aldeão
          // (Goal 21, 2.3) as portas abrem e fecham sozinhas: a sonda pegou uma
          // aberta no instante da contagem, leu `oakDoorNzAberta` e acusou "8
          // de 9" — uma vila inteira e correta. O plano manda a fechada; o
          // mundo responde com a que está lá, no estado em que está.
          const tipo = k.startsWith('oakDoor') ? k.replace('Aberta', '') : k
          noMundo[tipo] = (noMundo[tipo] ?? 0) + 1
          solidos++
        }
      }
    }
    // ⚠️ "FALTAM ONZE ESCADAS" NÃO É DIAGNÓSTICO, é um número. Sem saber ONDE, a
    // investigação vira teoria — e a primeira rodada disto custou meia hora de
    // hipótese sobre divisa de chunk quando o defeito era outro. A sonda agora
    // aponta as primeiras divergências com coordenada, o que o plano mandava pôr
    // e o que o mundo tem.
    const ondeFalta = []
    for (let x = cx - R; x <= cx + R && ondeFalta.length < 8; x++) {
      for (let z = cz - R; z <= cz + R && ondeFalta.length < 8; z++) {
        const col = rc.colunaDoPlano(plano, x, z)
        if (!col) continue
        for (const e of col) {
          const [ys, chave] = [Number(e.split(':')[0]), e.split(':')[1]]
          if (chave === '0') continue
          const real = rc.blockKeyAt(x, ys, z)
          if (real !== chave && real.replace('Aberta', '') !== chave) {
            ondeFalta.push(`${x},${ys},${z} plano=${chave} mundo=${real}`)
            break
          }
        }
      }
    }
    return { doPlano, noMundo, solidosNoMundo: solidos, chao: plano.chao, raio: R, ondeFalta }
  },
  { cx: achado.centro.x, cz: achado.centro.z },
)

// ── as fotos ────────────────────────────────────────────────────────────────
//
// ⚠️ DE FORA E DE CIMA, e não de dentro: a queixa do founder foi sobre a vila
// COMO CONJUNTO ("as vilas estão feias"), e uma foto de dentro de uma casa não
// responde isso. Os quatro ângulos são os quatro cantos.
//
// A distância e a altura foram MEDIDAS na foto, não escolhidas: a 38 blocos e
// 20 de altura a vila virava dois telhados marrons no meio de uma floresta, e
// a foto dizia mais sobre as árvores do que sobre a vila. A 30 e 13 as casas
// enchem o quadro e dá pra ver parede, janela e caminho.
const ANGULOS = [
  ['ne', 1, 1],
  ['nw', -1, 1],
  ['sw', -1, -1],
  ['se', 1, -1],
]
const fotos = []
for (const [hora, nome] of [
  [6000, 'dia'],
  [18000, 'noite'],
]) {
  for (const [lado, sx, sz] of ANGULOS) {
    await page.evaluate(
      async ({ cx, cz, chao, h, sx, sz, raio }) => {
        const rc = window.__roquecraft
        const dorme = (ms) => new Promise((k) => setTimeout(k, ms))
        rc.setTime(h)
        // ⚠️ A DISTÂNCIA ACOMPANHA A VILA. Cravada em 30, ela pôs a câmera
        // DENTRO da vila quando o raio dela subiu na onda 2, e as fotos saíram
        // com um tronco tapando metade do quadro.
        // ⚠️ E A ALTURA PRECISA PASSAR DA COPA. A 0,62 do raio a câmera ficava
        // no nível das folhas (y 80, copa em 80) e metade das fotos era tronco
        // em primeiro plano. Acima delas, a vila aparece inteira de três
        // quartos, que é como se olha uma maquete.
        const d = raio + 10
        const olho = chao + Math.round(raio * 1.1)
        rc.teleport(cx + sx * d, olho, cz + sz * d)
        // ⚠️ A CONVENÇÃO DE YAW É DO JOGO, e a primeira versão desta sonda
        // inverteu os dois sinais: as oito fotos saíram de costas para a vila,
        // enquadrando uma floresta a 40 blocos dali. A frente do jogador é
        // `(sin(yaw), ·, −cos(yaw))` — está em `aim.js` e em `physics.js` —
        // então mirar em (dx, dz) é `atan2(dx, −dz)`, e não o contrário.
        const dx = -sx * d
        const dz = -sz * d
        const chao3 = Math.hypot(dx, dz)
        rc.look(Math.atan2(dx, -dz), Math.atan2(chao - olho, chao3))
        await dorme(900)
      },
      {
        cx: achado.centro.x,
        cz: achado.centro.z,
        chao: medida.chao,
        h: hora,
        sx,
        sz,
        raio: medida.raio,
      },
    )
    const arq = path.join(SAIDA, `vila-${nome}-${lado}.png`)
    await page.screenshot({ path: arq })
    fotos.push(path.relative(process.cwd(), arq))
  }
}

// ── O CASTELO ───────────────────────────────────────────────────────────────
//
// ⚠️ MESMA SONDA, E NÃO OUTRA. O castelo é medido pelo mesmo par de perguntas
// que a vila — o plano bate com o mundo, e as fotos para o humano olhar —, e
// duplicar o arquivo seria duplicar também as duas mentiras que esta sonda já
// contou (raio cravado e câmera cravada). Um instrumento, dois alvos.
const forte = await page.evaluate(() => {
  const p = window.__roquecraft.procurarCastelo(8, false)
  return p ? { centro: p.centro, chao: p.chao, anel: p.anel, ruina: p.ruina } : null
})
const ruina = await page.evaluate(() => {
  const p = window.__roquecraft.procurarCastelo(10, true)
  return p ? { centro: p.centro, chao: p.chao, anel: p.anel, ruina: p.ruina } : null
})
let doCastelo = null
if (forte) {
  doCastelo = await page.evaluate(
    async ({ cx, cz }) => {
      const rc = window.__roquecraft
      const dorme = (ms) => new Promise((k) => setTimeout(k, ms))
      rc.teleport(cx, 120, cz)
      await rc.waitChunks(6, 60000)
      await dorme(2500)
      const plano = rc.procurarCastelo(8, false)
      const inv = rc.inventarioDoCastelo(plano)
      const R = rc.raioDoCastelo() + 3
      const noMundo = {}
      for (let x = cx - R; x <= cx + R; x++) {
        for (let z = cz - R; z <= cz + R; z++) {
          for (
            let y = plano.chao - inv.profundidade;
            y <= plano.chao + inv.alturaAcimaDoChao;
            y++
          ) {
            const k = rc.blockKeyAt(x, y, z)
            if (k === 'air') continue
            noMundo[k] = (noMundo[k] ?? 0) + 1
          }
        }
      }
      return { inv, noMundo, chao: plano.chao, raio: R, altura: rc.alturaDoCastelo() }
    },
    { cx: forte.centro.x, cz: forte.centro.z },
  )
  for (const [hora, nome] of [
    [6000, 'dia'],
    [18000, 'noite'],
  ]) {
    for (const [lado, sx, sz] of ANGULOS) {
      await page.evaluate(
        async ({ cx, cz, chao, h, sx, sz, raio, altura }) => {
          const rc = window.__roquecraft
          const dorme = (ms) => new Promise((k) => setTimeout(k, ms))
          rc.setTime(h)
          // ⚠️ O CASTELO CRESCEU PARA CIMA, e a câmera só sabia do raio: a 23 de
          // raio e 25 de altura de olho, ela ficou ABAIXO da ponta da agulha, de
          // 33. A foto virou um contra-plongée que não mostra o pátio nem o
          // portão. Quem enquadra um objeto alto precisa recuar e subir na
          // proporção da ALTURA dele, não da largura.
          const d = raio + Math.round(altura * 0.55)
          const olho = chao + Math.round(altura * 0.95)
          rc.teleport(cx + sx * d, olho, cz + sz * d)
          const dx = -sx * d
          const dz = -sz * d
          rc.look(Math.atan2(dx, -dz), Math.atan2(chao - olho, Math.hypot(dx, dz)))
          await dorme(900)
        },
        {
          cx: forte.centro.x,
          cz: forte.centro.z,
          chao: doCastelo.chao,
          h: hora,
          sx,
          sz,
          raio: doCastelo.raio,
          altura: doCastelo.altura,
        },
      )
      const arq = path.join(SAIDA, `castelo-${nome}-${lado}.png`)
      await page.screenshot({ path: arq })
      fotos.push(path.relative(process.cwd(), arq))
    }
  }

  // ⚠️ E UMA DE FRENTE, AO NÍVEL DO CHÃO. As quatro de três quartos mostram a
  // silhueta e escondem o que o jogador vê chegando a pé: o portão, o arco dele
  // e o pátio atrás. Defeito de portaria não aparece em foto aérea.
  await page.evaluate(
    async ({ cx, cz, chao, raio }) => {
      const rc = window.__roquecraft
      rc.setTime(6000)
      // Yaw π porque a frente do jogador é (sin, ·, −cos): com yaw 0 ele olha
      // para −Z, que é para longe do castelo. A primeira foto saiu de costas.
      rc.teleport(cx, chao + 6, cz - raio - 10)
      rc.look(Math.PI, 0.05)
      await new Promise((k) => setTimeout(k, 900))
    },
    { cx: forte.centro.x, cz: forte.centro.z, chao: doCastelo.chao, raio: doCastelo.raio },
  )
  const arqPortao = path.join(SAIDA, 'castelo-portao.png')
  await page.screenshot({ path: arqPortao })
  fotos.push(path.relative(process.cwd(), arqPortao))
}

if (ruina) {
  await page.evaluate(
    async ({ cx, cz }) => {
      const rc = window.__roquecraft
      rc.teleport(cx, 120, cz)
      await rc.waitChunks(6, 60000)
      await new Promise((k) => setTimeout(k, 2500))
    },
    { cx: ruina.centro.x, cz: ruina.centro.z },
  )
  for (const [lado, sx, sz] of ANGULOS.slice(0, 2)) {
    await page.evaluate(
      async ({ cx, cz, chao, sx, sz }) => {
        const rc = window.__roquecraft
        rc.setTime(6000)
        const d = 30
        const olho = chao + 22
        rc.teleport(cx + sx * d, olho, cz + sz * d)
        const dx = -sx * d
        const dz = -sz * d
        rc.look(Math.atan2(dx, -dz), Math.atan2(chao - olho, Math.hypot(dx, dz)))
        await new Promise((k) => setTimeout(k, 900))
      },
      { cx: ruina.centro.x, cz: ruina.centro.z, chao: ruina.chao, sx, sz },
    )
    const arq = path.join(SAIDA, `ruina-dia-${lado}.png`)
    await page.screenshot({ path: arq })
    fotos.push(path.relative(process.cwd(), arq))
  }
}

await b.close()
await fechar()

// ── o veredito ──────────────────────────────────────────────────────────────
//
// ⚠️ A SONDA REPROVA, e a régua é a DIVERGÊNCIA entre plano e mundo, não um
// número absoluto de beleza. Beleza é a foto, e a foto é para o humano. O que a
// máquina sabe dizer sozinha é: o gerador prometeu N blocos e o mundo recebeu
// menos que isso.
//
// ⚠️ TIPO A TIPO, E NÃO O TOTAL. A primeira versão comparava a soma de blocos
// da caixa com a soma do plano — e a caixa tem 2.290 blocos de grama, 374 de
// mato e 34 de tronco que não são da vila. O total do mundo ficava QUATRO vezes
// maior que o planejado e a sonda passava sorrindo, inclusive com a vila
// inteira ausente. A conta que vale é: de cada tipo que a vila planejou, o
// mundo tem pelo menos aquilo.
const problemas = []
const faltando = []
for (const [tipo, n] of Object.entries(medida.doPlano.porTipo)) {
  const noMundo = medida.noMundo[tipo] ?? 0
  if (noMundo < n) faltando.push(`${tipo}: ${noMundo} de ${n}`)
}
if (achado.casas < 5) problemas.push(`só ${achado.casas} estruturas no plano`)
if (faltando.length) {
  problemas.push(`a vila foi planejada e não construída — ${faltando.join(', ')}`)
}
if (erros.length)
  problemas.push(`${erros.length} erro(s) de página: ${erros.slice(0, 2).join(' | ')}`)

console.log(
  JSON.stringify(
    {
      vila: { ...achado.centro, chao: medida.chao, estruturas: achado.casas },
      castelo: forte ? { ...forte, plano: doCastelo.inv, mundo: doCastelo.noMundo } : null,
      ruina: ruina ? { ...ruina.centro, chao: ruina.chao, anel: ruina.anel } : null,
      plano: medida.doPlano,
      mundo: { solidos: medida.solidosNoMundo, porTipo: medida.noMundo },
      ondeFalta: medida.ondeFalta,
      fotos,
      problemas,
      veredito: problemas.length ? 'REPROVADA' : 'a vila planejada é a vila construída',
    },
    null,
    2,
  ),
)
process.exit(problemas.length ? 1 : 0)
