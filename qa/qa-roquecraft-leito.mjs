//
// O LEITO DO MAR TEM VIDA, E A ÁGUA NÃO SE PARTE EM VOLTA DELA?
//
// "precisamos de algas" — founder, 25/08/2026.
//
// `algaAlagada.spec.js` prova as regras numa seção sintética: a água não abre
// parede em volta da alga, a fila de fluidos não a lava, a coluna de
// profundidade atravessa. Nada disso prova que existe alga NO MUNDO — entre a
// regra e o mar há a geração, o bioma, o material do leito e a espessura da
// lâmina, e qualquer um dos quatro pode nunca satisfazer a condição.
//
// Esta sonda responde duas perguntas, no mundo de verdade:
//
//   1. NASCEU? Conta células de alga e de capim num raio em volta do jogador,
//      no oceano. O controle é o MESMO raio num bioma seco: tem que dar zero.
//      Sem esse par, "achei 300 algas" não distingue "a geração funciona" de
//      "eu estou contando qualquer planta".
//
//   2. APARECE? Uma foto submersa. Ela é o único juiz de "parece vida marinha"
//      — e é também o que denunciaria a caixa de vidro em volta de cada planta,
//      que é o defeito que o conceito de célula alagada existe pra evitar.
//
//   node scripts/qa-roquecraft-leito.mjs
//
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const DIST = path.resolve('dist/pwa')
const OUT = path.resolve('scripts/.qa-leito')
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })

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
const servidor = http.createServer((q, r) => {
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
await new Promise((r) => servidor.listen(0, r))
const base = `http://localhost:${servidor.address().port}`

const erros = []
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
page.on('pageerror', (e) => erros.push(String(e.message).slice(0, 160)))
page.on('console', (m) => {
  const t = m.text()
  if (/Shader|WebGL|INVALID|context lost/i.test(t)) erros.push(t.slice(0, 200))
})
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
await page.evaluate(async () => {
  window.__roquecraft.setQuality('ultra')
  await new Promise((r) => setTimeout(r, 2600))
  window.__rosStore?.maximizeWindow?.('roquecraft')
  await new Promise((r) => setTimeout(r, 900))
})
await page.addStyleTag({
  content: '.ros-roquecraft__play,.ros-dock,.ros-menubar,.rc-hud{display:none !important}',
})
await page.waitForTimeout(500)

const canvas = await page.waitForSelector('.ros-roquecraft__canvas')
const foto = (nome) => canvas.screenshot({ path: path.join(OUT, nome) })

/** Conta alga e capim num prisma em volta do jogador. */
async function censo(raio = 22) {
  return page.evaluate(
    ([raio]) => {
      const rc = window.__roquecraft
      const p = rc.state.player
      let alga = 0
      let capim = 0
      let agua = 0
      let colunas = 0
      for (let dx = -raio; dx <= raio; dx++) {
        for (let dz = -raio; dz <= raio; dz++) {
          const x = Math.floor(p.x) + dx
          const z = Math.floor(p.z) + dz
          if (!rc.carregado(x, z)) continue
          colunas++
          const col = rc.colunaEm(x, z, 20, 80) || []
          for (const c of col) {
            if (c.bloco === 'kelp') alga++
            else if (c.bloco === 'seagrass') capim++
            else if (c.bloco === 'water') agua++
          }
        }
      }
      return { alga, capim, agua, colunas, bioma: rc.state.biome }
    },
    [raio],
  )
}

// ── 1. NO OCEANO ────────────────────────────────────────────────────────────
const oceano = await page.evaluate(async () => {
  const rc = window.__roquecraft
  if (!rc.gotoBiome('ocean')) return { erro: "gotoBiome('ocean') não achou oceano" }
  await rc.waitChunks(6)
  await new Promise((k) => setTimeout(k, 2600))
  rc.setTime(5200)
  rc.setFx({ hand: false })
  return { ok: true }
})
const noMar = oceano.erro ? { erro: oceano.erro } : await censo()

// ── 2. O CONTROLE: um bioma SECO ────────────────────────────────────────────
//
// ⚠️ Sem ele, o número do oceano não significa nada. Um censo que conta alga em
// QUALQUER lugar estaria contando outra coisa — e um censo que conta zero em
// todo lugar não saberia dizer que o oceano está vazio.
const seco = await page.evaluate(async () => {
  const rc = window.__roquecraft
  if (!rc.gotoBiome('desert') && !rc.gotoBiome('plains')) return { erro: 'sem bioma seco' }
  await rc.waitChunks(5)
  await new Promise((k) => setTimeout(k, 2200))
  return { ok: true }
})
const emTerra = seco.erro ? { erro: seco.erro } : await censo()

// ── 3. A FOTO SUBMERSA ──────────────────────────────────────────────────────
const mergulho = await page.evaluate(async () => {
  const rc = window.__roquecraft
  if (!rc.gotoBiome('ocean')) return { erro: 'não voltou pro oceano' }
  await rc.waitChunks(6)
  await new Promise((k) => setTimeout(k, 2600))
  rc.setTime(5200)

  // Acha uma coluna com alga por perto e põe a câmera ao lado dela, olhando
  // na horizontal: é assim que se vê se a água abriu parede em volta da planta.
  const p = rc.state.player
  let alvo = null
  for (let raio = 2; raio <= 30 && !alvo; raio++) {
    for (let a = 0; a < 32 && !alvo; a++) {
      const ang = (a / 32) * Math.PI * 2
      const x = Math.floor(p.x + Math.cos(ang) * raio)
      const z = Math.floor(p.z + Math.sin(ang) * raio)
      if (!rc.carregado(x, z)) continue
      const col = rc.colunaEm(x, z, 20, 80) || []
      const c = col.find((k) => k.bloco === 'kelp')
      if (c) alvo = { x, y: c.y, z }
    }
  }
  if (!alvo) return { erro: 'nenhuma alga encontrada perto do jogador' }

  const olhoX = alvo.x + 3.5
  const olhoZ = alvo.z + 3.5
  const olhoY = alvo.y + 1.2
  rc.setFlying(true)
  rc.teleport(olhoX, olhoY - 1.62, olhoZ)
  const dist = Math.hypot(alvo.x + 0.5 - olhoX, alvo.z + 0.5 - olhoZ)
  rc.look(
    Math.atan2(alvo.x + 0.5 - olhoX, -(alvo.z + 0.5 - olhoZ)),
    -Math.atan2(olhoY - (alvo.y + 0.5), dist) + 0.18,
  )
  await new Promise((k) => setTimeout(k, 900))
  return { alvo, submerso: rc.aguaVisual?.().submerso ?? null }
})
if (!mergulho.erro) await foto('1-alga-submersa.png')

// ── 4. O BAMBUZAL, na selva ─────────────────────────────────────────────────
//
// A outra metade do pedido ("algas, bambus"). Mesma disciplina: contar no
// bioma certo E no bioma errado.
const selva = await page.evaluate(async () => {
  const rc = window.__roquecraft
  if (!rc.gotoBiome('jungle')) return { erro: 'não achei selva' }
  await rc.waitChunks(6)
  await new Promise((k) => setTimeout(k, 2600))
  rc.setTime(4200)

  const p = rc.state.player
  let colmos = 0
  // ⚠️ O ALVO É A COLUNA MAIS ALTA, não a primeira encontrada.
  //
  // A primeira versão pegava a primeira célula da varredura e a foto saiu de
  // dentro de uma copa de selva: tela inteira de folha verde, zero bambu
  // visível. Enquadrar a vara mais alta é o que dá chance de haver linha de
  // visada — e, ainda assim, a câmera sobe acima do topo dela pra olhar de
  // cima do dossel.
  let alvo = null
  let melhorAltura = 0
  for (let dx = -26; dx <= 26; dx++) {
    for (let dz = -26; dz <= 26; dz++) {
      const x = Math.floor(p.x) + dx
      const z = Math.floor(p.z) + dz
      if (!rc.carregado(x, z)) continue
      const col = rc.colunaEm(x, z, 40, 110) || []
      let nesta = 0
      let base = null
      for (const c of col) {
        if (c.bloco === 'bamboo' || c.bloco === 'bambooTop') {
          colmos++
          nesta++
          if (base === null) base = c.y
        }
      }
      if (nesta > melhorAltura) {
        melhorAltura = nesta
        alvo = { x, y: base, z, alto: nesta }
      }
    }
  }
  if (alvo) {
    const meio = alvo.y + alvo.alto / 2
    const olhoX = alvo.x + 7
    const olhoZ = alvo.z + 7
    const olhoY = alvo.y + alvo.alto + 2.5
    rc.setFlying(true)
    rc.teleport(olhoX, olhoY - 1.62, olhoZ)
    const dist = Math.hypot(alvo.x + 0.5 - olhoX, alvo.z + 0.5 - olhoZ)
    // O deslocamento de mira tira o contorno branco do destaque da foto — ele
    // apareceu bem no meio do bambuzal na rodada anterior.
    rc.look(
      Math.atan2(alvo.x + 0.5 - olhoX, -(alvo.z + 0.5 - olhoZ)) + 0.26,
      -Math.atan2(olhoY - meio, dist) + 0.3,
    )
    await new Promise((k) => setTimeout(k, 900))
  }
  return { colmos, alvo, bioma: rc.state.biome }
})
if (selva.alvo) await foto('2-bambuzal.png')

// ── 5. A VIDA MARINHA ───────────────────────────────────────────────────────
//
// ⚠️ PELO CAMINHO DE VERDADE: modo sobrevivência, oceano, e ESPERAR nascer.
//
// `spawnMob` põe a criatura na superfície sólida — é o gancho dos bichos de
// terra, e usá-lo aqui provaria só que o modelo desenha. O que está sob
// julgamento é a regra de nascimento aquática (`nadoSpawn.js`), e ela só roda
// no laço do jogo.
const vidaMarinha = await page.evaluate(async () => {
  const rc = window.__roquecraft
  rc.limparMobs()
  rc.setMode('survival')
  if (!rc.gotoBiome('ocean')) return { erro: 'não voltou pro oceano' }
  await rc.waitChunks(6)
  rc.setTime(5200)
  // Mergulha: o cardume nasce a 14..46 blocos do JOGADOR, e o jogador tem que
  // estar dentro d'água pra que a coluna sorteada tenha lâmina.
  const p = rc.state.player
  const fundo = rc.surfaceAt(Math.floor(p.x), Math.floor(p.z))
  rc.setFlying(true)
  rc.teleport(p.x, (fundo ?? 50) + 3, p.z)
  await new Promise((k) => setTimeout(k, 26000))
  const bichos = rc
    .mobsInfo()
    .filter((m) => ['fish', 'squid', 'octopus', 'penguin'].includes(m.type))
  const porTipo = {}
  for (const b of bichos) porTipo[b.type] = (porTipo[b.type] || 0) + 1
  // ⚠️ QUANTOS ESTÃO FORA D'ÁGUA. Bicho marinho encalhado é o defeito mais
  // caro desta funcionalidade — ele sufoca à vista do jogador e parece um bug
  // de física. A foto de uma rodada anterior mostrou um polvo ROSA em cima da
  // grama, e a pergunta "como ele chegou lá" só tem resposta com o bloco em
  // que ele está.
  // ⚠️ A REGRA DE "ENCALHADO" FOI CORRIGIDA EM 26/08 - ela acusava inocente.
  //
  // A versão antiga era "a célula do bicho não é água". Mas planta aquática
  // (alga, capim marinho) OCUPA a célula: o id ali é `seagrass`, não `water`,
  // com água em cima e areia embaixo. Um peixe nadando dentro do capim, no
  // fundo do mar, era acusado de encalhado - e com 18 peixes num leito cheio
  // de capim isso passou a acontecer quase sempre.
  //
  // A regra certa precisa das DUAS células: um bicho está seco quando não há
  // água nem onde ele está nem logo acima. O polvo ROSA em cima da grama, que
  // motivou este teste, continua sendo pego (grama embaixo, AR em cima).
  // ⚠️ E CORRIGIDA DE NOVO EM 18/09, no primeiro dia em que a sonda teve
  // veredito: um pinguim dentro de uma alga de três de altura (alga embaixo,
  // na célula e em cima) saía "encalhado" — a alga e o capim são `aguado` em
  // `blocks.js` (nada-se por dentro deles), e a régua só aceitava `water`.
  const AGUADO = /water|kelp|seagrass/
  const molhado = (x, y, z) =>
    AGUADO.test(rc.blocoEm(x, y, z) || '') || AGUADO.test(rc.blocoEm(x, y + 1, z) || '')
  const seco = (b) => !molhado(Math.floor(b.x), Math.floor(b.y), Math.floor(b.z))
  const descrever = (b) => ({
    tipo: b.type,
    x: Math.round(b.x * 10) / 10,
    y: Math.round(b.y * 10) / 10,
    z: Math.round(b.z * 10) / 10,
    bloco: rc.blocoEm(Math.floor(b.x), Math.floor(b.y), Math.floor(b.z)),
    abaixo: rc.blocoEm(Math.floor(b.x), Math.floor(b.y) - 1, Math.floor(b.z)),
    acima: rc.blocoEm(Math.floor(b.x), Math.floor(b.y) + 1, Math.floor(b.z)),
  })
  const encalhados = bichos.filter(seco).map(descrever)

  // PROVA DE VIDA DA REGRA. Uma régua que nunca acusa não é régua. Aqui ela é
  // apontada pra uma coluna SECA de verdade (a superfície de terra firme onde o
  // jogador começou), e tem que acusar. Se este controle ficar verde-por-nada,
  // o número de encalhados acima não vale.
  const provaDaRegua = (() => {
    const bx = Math.floor(p.x)
    const bz = Math.floor(p.z)
    const topo = rc.surfaceAt(bx, bz)
    if (topo == null) return { erro: 'sem coluna pra apontar a régua' }
    const acusa = seco({ type: 'fish', x: bx + 0.5, y: topo + 3, z: bz + 0.5 })
    return { alturaSeca: topo + 3, acusa }
  })()
  // Enquadra o mais perto, de lado.
  let alvo = null
  let melhor = 1e9
  for (const b of bichos) {
    const d = Math.hypot(b.x - p.x, b.z - p.z)
    if (d < melhor) {
      melhor = d
      alvo = b
    }
  }
  if (alvo) {
    const olhoX = alvo.x + 2.6
    const olhoZ = alvo.z + 2.6
    rc.teleport(olhoX, alvo.y - 1.62 + 0.4, olhoZ)
    const dist = Math.hypot(alvo.x - olhoX, alvo.z - olhoZ)
    rc.look(Math.atan2(alvo.x - olhoX, -(alvo.z - olhoZ)), -Math.atan2(0.4, dist))
    await new Promise((k) => setTimeout(k, 900))
  }
  return {
    total: bichos.length,
    porTipo,
    encalhados,
    provaDaRegua,
    alvo,
    submerso: rc.aguaVisual?.().submerso ?? null,
  }
})
if (vidaMarinha.alvo) await foto('3-vida-marinha.png')

const veredito = []
if (noMar.erro) veredito.push(`não deu pra medir o oceano: ${noMar.erro}`)
else if (!emTerra.erro) {
  veredito.push(
    `oceano: ${noMar.alga} algas e ${noMar.capim} capins em ${noMar.colunas} colunas; ` +
      `terra seca: ${emTerra.alga} e ${emTerra.capim}`,
  )
  if (noMar.alga + noMar.capim === 0) {
    veredito.push('⚠️ o leito do oceano nasceu PELADO — a geração não colocou nada')
  }
  if (emTerra.alga + emTerra.capim > 0) {
    veredito.push('⚠️ nasceu vegetação de mar em bioma SECO — a condição de bioma está frouxa')
  }
}
if (mergulho.erro) veredito.push(`⚠️ foto submersa não saiu: ${mergulho.erro}`)

if (selva.erro) veredito.push(`⚠️ selva: ${selva.erro}`)
else if (!selva.colmos) veredito.push('⚠️ a selva nasceu SEM bambu nenhum')
else veredito.push(`selva: ${selva.colmos} células de bambu; oceano tinha 0`)

if (vidaMarinha.erro) veredito.push(`⚠️ vida marinha: ${vidaMarinha.erro}`)
// ⚠️ NAO CULPE O JOGO POR UMA NAVEGACAO QUE FALHOU.
//
// O cardume nasce a 14..46 blocos do JOGADOR e exige coluna com lamina. Se o
// mergulho nao aconteceu (o `gotoBiome` parou numa praia rasa, por exemplo), o
// zero nao diz nada sobre o nascimento: diz que a cena nao foi montada. Em
// 26/08 esta sonda acusou "NENHUM bicho marinho" com `submerso: false`, e a
// mesma sonda rodada de novo, submersa, achou cinco -- eu quase fui atras de um
// defeito que nao existia.
else if (vidaMarinha.submerso !== true)
  veredito.push(
    `⚠️ A CENA NAO FOI MONTADA: o mergulho nao submergiu (submerso=${vidaMarinha.submerso}), entao o zero de bichos nao vale. Rode de novo.`,
  )
else if (!vidaMarinha.total)
  veredito.push('⚠️ NENHUM bicho marinho nasceu em 26 s de oceano SUBMERSO')
else {
  veredito.push(
    `vida marinha: ${vidaMarinha.total} bichos — ${JSON.stringify(vidaMarinha.porTipo)}`,
  )
  if (vidaMarinha.provaDaRegua && !vidaMarinha.provaDaRegua.acusa) {
    veredito.push(
      `⚠️ A RÉGUA DE ENCALHADO NÃO ACUSA NEM NO SECO (y=${vidaMarinha.provaDaRegua.alturaSeca}): o zero de encalhados abaixo não vale nada.`,
    )
  }
  if (vidaMarinha.encalhados?.length) {
    veredito.push(
      `⚠️ ${vidaMarinha.encalhados.length} ENCALHADOS: ${JSON.stringify(vidaMarinha.encalhados)}`,
    )
  }
}

const relatorio = { noMar, emTerra, mergulho, selva, vidaMarinha, veredito, erros }
fs.writeFileSync(path.join(OUT, 'relatorio.json'), JSON.stringify(relatorio, null, 2))
console.log(JSON.stringify(relatorio, null, 2))

await b.close()
servidor.close()
// O veredito sai pelo código de saída: o ledger de sondas lê ISSO, não a prosa.
// `veredito` mistura medidas e ALERTAS (⚠️): só o alerta reprova.
process.exit(veredito.some((l) => l.includes('⚠️')) || erros.length > 0 ? 1 : 0)
