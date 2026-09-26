//
// O ESCUDO — segurar o botão direito apara o que vem pela frente (Goal 21, 3.3).
//
// `escudo.spec.js` prova a tabela; `useRoqueCraftCorpo.spec` prova o corpo. O
// que só o jogo prova: que o gesto de segurar (o botão de colocar do celular,
// que é o mesmo caminho do mouse) chega em `levantarGuarda`, que o dano com
// origem passa pela guarda antes da armadura, que o escudo se gasta na mão, e
// que o zumbi de verdade — com a origem que `passoDosMobs` manda — não fere.
//
//   1. escudo na mão, guarda baixa: 2 de 'mob' pela frente tira 2;
//   2. segurando: 4 de 'mob' pela frente não tira nada e o escudo perde 5;
//   3. segurando: 2 de 'mob' pelas COSTAS tira 2;
//   4. segurando: 2 de 'fall' tira 2 — a guarda não apara queda;
//   5. soltou: 2 de 'mob' pela frente tira 2;
//   6. mão vazia segurando: 4 de 'mob' pela frente tira 2 (metade); 2 de
//      'arrow' tira 2 (o braço não apara flecha);
//   7. zumbi de verdade a 2 blocos, de noite, escudo na mão segurando: em 3 s
//      a vida não cai e o escudo se gastou;
//   8. O TRANCO: o mesmo zumbi, sem guarda, EMPURRA o jogador para fora do
//      lugar; com o escudo levantado ele não sai. Dano zerado e tranco inteiro
//      era o defeito, e nenhum teste de unidade o via.
//
//   node scripts/qa-roquecraft-escudo.mjs
//
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { servirDist } from './lib/servidor-do-dist.mjs'

const SAIDA = path.resolve('scripts/.qa-escudo')
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

// Na partida, em sobrevivência, parado num platô de pedra, olhando para −Z
// (yaw 0): "pela frente" é z menor que o do jogador.
await page.evaluate(() => window.__roquecraft.entrarNoJogo?.())
await page.waitForTimeout(1500)
const cena = await page.evaluate(async () => {
  const rc = window.__roquecraft
  rc.setMode('survival')
  const y = Math.round(rc.surfaceAt(0, 0) ?? 66) + 14
  rc.setFlying(true)
  rc.teleport(0.5, y + 3, 0.5)
  rc.fill(-6, y - 2, -6, 6, y, 6, 'stone')
  await new Promise((r) => setTimeout(r, 1500))
  rc.teleport(0.5, y + 1, 0.5)
  rc.setFlying(false)
  rc.look(0, 0)
  rc.selectSlot(0)
  rc.equiparComEncanto('shield', null)
  return { y, naMao: rc.naMao(), dur: rc.durabilidadeNaMao(), vida: rc.state.health }
})
ok(
  cena.naMao === 'shield' && cena.dur === 336 && cena.vida === 20,
  `escudo na mão (336), vida cheia: ${JSON.stringify(cena)}`,
)

/** Um golpe com origem, e a vida antes/depois; espera a invulnerabilidade passar. */
const golpe = async (n, fonte, de) => {
  const r = await page.evaluate(
    async ([n, fonte, de]) => {
      const rc = window.__roquecraft
      const p = rc.state.player
      const origem = de ? { x: p.x + de.x, z: p.z + de.z } : null
      const antes = rc.state.health
      const durAntes = rc.durabilidadeNaMao()
      rc.hurt(n, fonte, origem)
      await new Promise((r) => setTimeout(r, 150))
      return {
        antes,
        depois: rc.state.health,
        durAntes,
        dur: rc.durabilidadeNaMao(),
        guarda: rc.guardaLevantada(),
      }
    },
    [n, fonte, de],
  )
  await page.waitForTimeout(650)
  return r
}
const FRENTE = { x: 0, z: -2 }
const COSTAS = { x: 0, z: 2 }
const segurar = (v) => page.evaluate((v) => window.__roquecraft.segurarColocar(v), v)

// ── 1. GUARDA BAIXA: PASSA ──────────────────────────────────────────────────
const baixa = await golpe(2, 'mob', FRENTE)
ok(
  !baixa.guarda && baixa.depois === baixa.antes - 2,
  `guarda baixa, 2 de 'mob' pela frente tira 2: ${JSON.stringify(baixa)}`,
)

// ── 2. SEGURANDO COM O ESCUDO: NADA PASSA, O ESCUDO SE GASTA ────────────────
await segurar(true)
await page.waitForTimeout(200)
const aparado = await golpe(4, 'mob', FRENTE)
ok(
  aparado.guarda && aparado.depois === aparado.antes,
  `segurando, 4 de 'mob' pela frente não tira nada: ${JSON.stringify(aparado)}`,
)
ok(
  aparado.dur === aparado.durAntes - 5,
  `o escudo perdeu 5 (golpe forte: 1 + 4): ${aparado.durAntes} → ${aparado.dur}`,
)
await foto('1-guarda.png')

// ── 3. PELAS COSTAS PASSA ───────────────────────────────────────────────────
const costas = await golpe(2, 'mob', COSTAS)
ok(
  costas.guarda && costas.depois === costas.antes - 2 && costas.dur === costas.durAntes,
  `segurando, 2 de 'mob' pelas costas tira 2 e não gasta: ${JSON.stringify(costas)}`,
)

// ── 4. A QUEDA NÃO SE APARA ─────────────────────────────────────────────────
const queda = await golpe(2, 'fall', null)
ok(
  queda.guarda && queda.depois === queda.antes - 2 && queda.dur === queda.durAntes,
  `segurando, 2 de 'fall' tira 2: ${JSON.stringify(queda)}`,
)

// ── 5. SOLTOU: PASSA DE NOVO ────────────────────────────────────────────────
await segurar(false)
await page.waitForTimeout(200)
const soltou = await golpe(2, 'mob', FRENTE)
ok(
  !soltou.guarda && soltou.depois === soltou.antes - 2,
  `soltou, 2 de 'mob' pela frente tira 2: ${JSON.stringify(soltou)}`,
)

// ── 6. MÃO VAZIA: O BRAÇO SEGURA METADE DO BICHO, E NADA DA FLECHA ─────────
await page.evaluate(() => window.__roquecraft.selectSlot(2))
await segurar(true)
await page.waitForTimeout(200)
const braco = await golpe(4, 'mob', FRENTE)
ok(
  braco.guarda && braco.depois === braco.antes - 2,
  `mão vazia segurando, 4 de 'mob' pela frente tira 2: ${JSON.stringify(braco)}`,
)
const flecha = await golpe(2, 'arrow', FRENTE)
ok(
  flecha.guarda && flecha.depois === flecha.antes - 2,
  `mão vazia segurando, 2 de 'arrow' tira 2: ${JSON.stringify(flecha)}`,
)
await segurar(false)

// ── 7. O ZUMBI DE VERDADE ───────────────────────────────────────────────────
// De noite (o zumbi queima ao sol), a 2 blocos na frente, escudo na mão e
// segurando. A origem do golpe vem de `passoDosMobs`; se ela não chegar, a
// guarda apara "sem origem" do mesmo jeito — por isso o zumbi nasce na FRENTE
// e a prova é a vida parada MAIS o escudo gasto.
const zumbi = await page.evaluate(async () => {
  const rc = window.__roquecraft
  rc.setTime(18000)
  rc.limparMobs()
  rc.selectSlot(0)
  rc.look(0, 0)
  rc.spawnMob('zombie', 2)
  await new Promise((r) => setTimeout(r, 200))
  rc.segurarColocar(true)
  const antes = rc.state.health
  const durAntes = rc.durabilidadeNaMao()
  await new Promise((r) => setTimeout(r, 3000))
  const zumbis = rc.mobsInfo().filter((m) => m.type === 'zombie')
  rc.segurarColocar(false)
  const p = rc.state.player
  return {
    antes,
    depois: rc.state.health,
    durAntes,
    dur: rc.durabilidadeNaMao(),
    zumbis: zumbis.length,
    // As posições dizem onde os dois acabaram. Quem APARA não é empurrado
    // (caso 8); aqui a posição é só contexto do quadro.
    jogador: { x: +p.x.toFixed(2), z: +p.z.toFixed(2) },
    mais: zumbis[0] ? { x: +zumbis[0].x.toFixed(2), z: +zumbis[0].z.toFixed(2) } : null,
  }
})
// A vida pode SUBIR (regeneração com a fome cheia), nunca cair. A noite pode
// trazer um segundo zumbi de nascimento natural — por isso `>= 1`.
ok(
  zumbi.zumbis >= 1 && zumbi.depois >= zumbi.antes && zumbi.dur < zumbi.durAntes,
  `zumbi na frente por 3 s: vida ${zumbi.antes} → ${zumbi.depois}, escudo ${zumbi.durAntes} → ${zumbi.dur}: ${JSON.stringify(zumbi)}`,
)
await foto('2-zumbi.png')

// ── 8. O TRANCO ─────────────────────────────────────────────────────────────
//
// ⚠️ ISTO SÓ O JOGO PROVA. `escudo.js` sabe cortar o dano e nada mais; quem
// decide o empurrão é `useRoqueCraftEntidades`, no chamador. Por meses a guarda
// zerava o dano e o tranco passava inteiro: o escudo parava a pancada e o
// jogador voava do mesmo jeito — e nenhum teste de unidade via isso, porque o
// dano medido estava certo.
//
// Mede DESLOCAMENTO, não velocidade: `kx`/`kz` decaem em ~0,4 s e uma leitura
// entre golpes daria zero nos dois lados. O que o jogador vê é sair do lugar.
const tranco = async (guarda) => {
  return page.evaluate(async (guarda) => {
    const rc = window.__roquecraft
    rc.setTime(18000)
    rc.limparMobs()
    rc.segurarColocar(false)
    rc.selectSlot(0)
    // ⚠️ VOLTA PRO CENTRO E ESPERA O CHÃO. A fase sem guarda empurra o jogador
    // pra fora do platô; sem o teleporte a segunda mediria outra briga. E sem a
    // pausa o zumbi nasce enquanto o corpo ainda está assentando, e ele perde o
    // primeiro golpe — foi o que deu `andou: 0` nas duas fases na primeira vez.
    const y = Math.round(rc.surfaceAt(0, 0) ?? 66) + 14
    rc.teleport(0.5, y + 1, 0.5)
    // ⚠️ `teleport` LIGA O VOO (é o que impede a câmera de cair entre o pulo e
    // o print). Voando não há tranco nenhum pra medir: as duas fases davam
    // `andou: 0` e o caso passaria a dizer que o escudo funciona quando o que
    // funcionava era a gravidade desligada.
    rc.setFlying(false)
    rc.look(0, 0)
    // ⚠️ VIDA CHEIA ANTES DE CADA FASE. Sem isto a primeira fase levava o
    // jogador a zero e a segunda media um corpo que nao reage: "com o escudo a
    // vida nao caiu" era verdade porque nao havia mais vida pra cair, e "nao
    // andou" era o morto parado. Cura pelo caminho do jogo (`tomarEfeito`).
    for (let i = 0; i < 8 && rc.state.health < 20; i++) rc.darEfeito('cura', 5)
    await new Promise((r) => setTimeout(r, 1200))
    rc.spawnMob('zombie', 2)
    await new Promise((r) => setTimeout(r, 400))
    const p = rc.state.player
    const de = { x: p.x, z: p.z }
    const vidaAntes = rc.state.health
    if (guarda) rc.segurarColocar(true)
    await new Promise((r) => setTimeout(r, 3200))
    rc.segurarColocar(false)
    const q = rc.state.player
    return {
      andou: +Math.hypot(q.x - de.x, q.z - de.z).toFixed(2),
      vidaAntes,
      vida: rc.state.health,
      morto: !!rc.state.dead,
      zumbis: rc.mobsInfo().filter((m) => m.type === 'zombie').length,
    }
  }, guarda)
}
const semGuarda = await tranco(false)
const comGuarda = await tranco(true)
// ⚠️ AS DUAS SANIDADES PRIMEIRO, e as duas já salvaram este caso de passar
// mentindo: (a) se o zumbi não bateu, "não andou" é verdade por omissão; (b) se
// a fase começou com o jogador em frangalhos, "a vida não caiu" é o chão do
// medidor, e não o escudo.
ok(
  semGuarda.vidaAntes >= 15 && comGuarda.vidaAntes >= 15,
  `fase começou sem vida: a medida abaixo não valeria: sem ${semGuarda.vidaAntes}, com ${comGuarda.vidaAntes}`,
)
ok(
  semGuarda.vida < semGuarda.vidaAntes,
  `o zumbi nem bateu sem guarda: o caso abaixo não valeria: ${JSON.stringify(semGuarda)}`,
)
ok(semGuarda.andou > 0.5, `sem guarda o zumbi tem que trancar o jogador: andou ${semGuarda.andou}`)
ok(
  comGuarda.vida >= comGuarda.vidaAntes && !comGuarda.morto,
  `com o escudo a vida não pode cair: ${JSON.stringify(comGuarda)}`,
)
ok(
  comGuarda.andou < semGuarda.andou * 0.5,
  `aparou e voou junto: com guarda ${comGuarda.andou}, sem ${semGuarda.andou}`,
)
await foto('3-tranco.png')

console.log(v.join('\n'))
console.log(
  JSON.stringify(
    {
      cena,
      baixa,
      aparado,
      costas,
      queda,
      soltou,
      braco,
      flecha,
      zumbi,
      semGuarda,
      comGuarda,
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
