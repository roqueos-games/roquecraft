//
// O GOLPE TEM RITMO? — sonda de uma pergunta, com par de controle.
//
// A rodada 15 trocou "recarga de 0,42 s pra qualquer arma e dano chapado" por
// carga quadrática, ritmo por arma e crítico. Nada disso aparece num print: o
// que muda é QUANTO de vida some do bicho, e quando.
//
// A pergunta que esta sonda faz é uma só: **martelar o botão dói menos que
// esperar a recarga encher?** Se a resposta for "igual", a mecânica não está
// ligada — mesmo com os 19 testes de unidade verdes, porque teste de unidade
// prova o módulo, não a fiação.
//
// PROVA DE VIDA: ela mede os dois casos na MESMA sessão, no mesmo bicho, com a
// mesma arma. Um número sozinho ("o golpe deu 7") não sabe dizer se a carga
// existe; o PAR sabe. Foi medir sem par de controle que deixou passar cinco
// rodadas de defeito neste projeto.
//
//   node scripts/qa-roquecraft-combate.mjs
//
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const DIST = path.resolve('dist/pwa')
const T = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
}
const s = http.createServer((q, r) => {
  const p = decodeURIComponent((q.url || '/').split('?')[0])
  let f = path.join(DIST, p)
  try {
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = shellDoApp(DIST)
  } catch {
    f = shellDoApp(DIST)
  }
  r.setHeader('Content-Type', T[path.extname(f)] || 'application/octet-stream')
  fs.createReadStream(f).pipe(r)
})
await new Promise((r) => s.listen(0, r))
const base = `http://localhost:${s.address().port}`

const b = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const ctx = await b.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
  serviceWorkers: 'block',
  locale: 'pt-BR',
})
const page = await ctx.newPage()
const erros = []
page.on('pageerror', (e) => erros.push(String(e.message).slice(0, 140)))
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

const r = await page.evaluate(async () => {
  const rc = window.__roquecraft
  const dorme = (ms) => new Promise((k) => setTimeout(k, ms))

  // Bancada plana e sem bicho selvagem por perto: o que se mede é o golpe, e
  // uma ovelha aleatória entrando na mira estraga a conta.
  rc.setMode('creative')
  const y = Math.round(rc.surfaceAt(0, 0) ?? 66) + 20
  rc.setFlying(true)
  rc.teleport(0.5, y + 2, 0.5)
  rc.fill(-10, y, -10, 10, y, 10, 'snowBlock')
  rc.setTime(6000)
  await dorme(2200)
  rc.setFlying(false)
  await dorme(1200)

  // Uma medição = nasce um bicho, mira nele, bate, lê quanto de vida sumiu.
  // ⚠️ MIRAR NO BICHO faz parte do PREPARO, não da pergunta.
  //
  // A primeira versão nascia o porco 2,2 blocos à frente e batia: `tryAttack`
  // exige `dot >= 0.92` com o raio da câmera, e o bicho ficava fora do cone.
  // Resultado: `ok: false`, dano 0 nos dois lados, e a sonda "reprovando" uma
  // mecânica que nunca chegou a ser exercitada.
  //
  // Usar `frameMobs`, que já existe pra isso, em vez de escrever uma terceira
  // versão de "aponta pro bicho" aqui dentro.
  // VOANDO, e mirando de novo antes de cada golpe. Duas correções, cada uma
  // paga por uma corrida que mediu errado:
  //
  //  1. O porco ANDA, e o empurrão do golpe o joga pra trás. Mirar uma vez no
  //     começo e bater 2,3 s depois erra o alvo: `ok: false`, dano 0, e a
  //     sonda "reprovando" uma mecânica que nunca foi exercitada.
  //  2. Voando, `vy ≈ 0` e nenhum golpe vira crítico. Assentar no chão parecia
  //     mais realista, mas quem cai critica — e aí o par de controle compara
  //     um golpe crítico com um normal e a razão mente.
  //  3. E MIRAR PRA BAIXO. `frameMobs` põe o jogador na altura do bicho e o
  //     yaw certo, mas a CÂMERA fica 1,62 acima do pé: a 2,56 de distância, o
  //     porco está 24,6° abaixo da horizontal, o que dá `dot = 0.909` contra o
  //     limite de 0,92 do cone de ataque. Reprovava por um fio, e o número que
  //     a sonda mostrava era só `ok: false` - foi o diagnóstico de posição que
  //     respondeu, não mais uma tentativa.
  const mirar = async () => {
    rc.setFlying(true)
    rc.frameMobs(2.6, 0)
    await dorme(120)
    const p = rc.state.player
    const m = rc.mobsInfo?.()?.[0]
    if (!m) return
    const dx = m.x - p.x
    const dz = m.z - p.z
    const dy = m.y + 0.45 - (p.y + 1.62)
    // Convenção do jogo: dir = (sin yaw, -cos yaw).
    rc.look(Math.atan2(dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)))
    await dorme(60)
  }
  const bater = async ({ esperar, arma }) => {
    // `equipar`, não `give` + `slotOf`: no criativo a hotbar vem cheia, o item
    // novo cai fora dela e `slotOf` devolve -1 calado. A primeira corrida
    // mediu um golpe de MÃO VAZIA (dano base 1) achando que era espada de
    // ferro (base 7).
    const naMao = rc.equipar(arma, 1)
    rc.spawnMob('pig', 2.5, 0)
    await dorme(400)
    await mirar()
    // MARTELAR é atacar com a recarga ainda quente — ou seja, é preciso um
    // golpe ANTES pra esvaziar a barra. A primeira versão só deixava de
    // esperar, e entre um caso e outro havia 1,6 s de `dorme`: a recarga
    // enchia sozinha e os dois casos mediam a mesma coisa.
    // MARTELAR é atacar DUAS VEZES NO MESMO QUADRO: o preparo esvazia a barra
    // e o golpe medido sai antes de o laço de física rodar. Re-mirar entre os
    // dois enchia 73% da recarga - a "martelada" da primeira corrida tinha
    // carga 0.733 e não media pressa nenhuma.
    if (!esperar) rc.attack()
    else {
      await dorme(esperar)
      await mirar()
    }
    // `antes` é lido DEPOIS do golpe de preparo, senão o dano dele entraria na
    // conta do golpe que interessa.
    const antes = rc.mobsInfo?.()?.[0]?.vida
    // DIAGNÓSTICO no momento exato do golpe. Sem isto eu fiquei duas corridas
    // chutando por que o golpe não acertava - que é exatamente o hábito que
    // este projeto passou o dia inteiro consertando.
    const p = rc.state.player
    const alvo = rc.mobsInfo?.()?.[0]
    const diag = alvo
      ? {
          jogador: { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) },
          alvo: { x: alvo.x, y: alvo.y, z: alvo.z },
          dist: +Math.hypot(alvo.x - p.x, alvo.z - p.z).toFixed(2),
          yaw: +rc.state.yaw.toFixed(2),
          pitch: +rc.state.pitch.toFixed(2),
        }
      : null
    const ok = rc.attack()
    await dorme(120)
    const info = rc.combateInfo()
    const depois = rc.mobsInfo?.()?.[0]?.vida
    rc.limparMobs?.()
    await dorme(200)
    return {
      ok,
      antes,
      depois,
      dano: antes != null && depois != null ? +(antes - depois).toFixed(3) : null,
      diag,
      naMao,
      ...info.ultimo,
    }
  }

  rc.give('iron_sword', 1)
  await dorme(300)

  // O PAR DE CONTROLE. Mesmo bicho, mesma arma, mesma sessão: só muda a espera.
  const carregado = await bater({ esperar: 1400, arma: 'iron_sword' })
  const martelado = await bater({ esperar: 0, arma: 'iron_sword' })

  // E a régua por arma: espada e machado não podem ter a mesma recarga.
  rc.give('iron_axe', 1)
  await dorme(300)
  const regua = async (arma) => {
    rc.equipar(arma, 1)
    rc.spawnMob('pig', 2.5, 0)
    await dorme(400)
    await mirar()
    const ok = rc.attack()
    const total = rc.combateInfo().total
    rc.limparMobs?.()
    await dorme(200)
    return { ok, total: +total.toFixed(3) }
  }
  const espada = await regua('iron_sword')
  const machado = await regua('iron_axe')
  const regraEspada = espada.total
  const regraMachado = machado.total

  return { carregado, martelado, regraEspada, regraMachado }
})

// O veredito é uma RAZÃO, não um valor absoluto: dano base muda com a arma e
// com o tier, mas a razão entre carregado e martelado é a mecânica.
const razao =
  r.carregado?.dano && r.martelado?.dano ? +(r.carregado.dano / r.martelado.dano).toFixed(2) : null

const veredito = []
if (!(r.carregado?.dano > 0)) veredito.push('golpe carregado não tirou vida — a fiação quebrou')
if (razao !== null && razao < 2)
  veredito.push(`martelar dói quase igual a esperar (razão ${razao}, esperado ~5)`)
if (!(r.regraMachado > r.regraEspada))
  veredito.push(
    `machado não é mais lento que espada (${r.regraMachado} vs ${r.regraEspada}) — ritmo por arma não ligou`,
  )

console.log(JSON.stringify({ ...r, razao, veredito, erros }, null, 2))
await ctx.close()
await b.close()
s.close()
process.exit(veredito.length ? 1 : 0)
