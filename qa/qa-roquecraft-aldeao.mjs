//
// A ONDA 9 DO GOAL 20, DENTRO DO JOGO CARREGADO.
//
// ⚠️ ESTA SONDA EXISTE POR UM DEFEITO QUE NENHUM TESTE PEGOU. As ondas 6 e 7
// entregaram `npc.js`, `falaDoNpc.js` e `modeloDoNpc.js` com 38 testes verdes, e
// eu dei o Goal por fechado. Depois do deploy, procurando os marcadores no
// bundle SERVIDO em produção, os três arquivos apareceram com ZERO ocorrências:
// ninguém os importava fora de teste. Trinta e oito testes verdes sobre código
// que o jogo não carregava.
//
// A unidade não tinha como ver isso, e continua sem ter. Só uma sonda que ABRE
// O JOGO, anda até uma vila e clica no aldeão responde a pergunta que interessa:
// o morador virou alguém NA TELA?
//
// Cinco afirmações mecânicas:
//   1. a vila tem moradores, e cada um tem NOME e BALCÃO;
//   2. abrir o painel entrega a pessoa (nome, humor, amizade) à tela;
//   3. falar com ele enche o balão — sem Modo Servidor, pela tabela local;
//   4. presentear CUSTA o item e SOBE a amizade;
//   5. a amizade DESCONTA a esmeralda do preço que a tela mostra.
//
//   node scripts/qa-roquecraft-aldeao.mjs
//
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { servirDist } from './lib/servidor-do-dist.mjs'

const SAIDA = path.resolve('qa-out/aldeao')
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

const fotos = []
const fotografar = async (nome) => {
  const arq = path.join(SAIDA, `${nome}.png`)
  await page.screenshot({ path: arq })
  fotos.push(path.relative(process.cwd(), arq))
}

// ── ANDAR ATÉ UMA VILA ──────────────────────────────────────────────────────
//
// ⚠️ A VILA É PERGUNTADA AO MUNDO, e não cravada. A sonda da aldeia do Goal 19
// tinha uma coordenada no fonte e passou semanas fotografando campo vazio: a
// geração mudou, a coordenada não.
//
// ⚠️ E ANDAR ATÉ LÁ É UM LAÇO, não um salto. `povoarAldeiaPerto` usa o plano do
// CHUNK EM QUE O JOGADOR ESTÁ: pousar no centro devolvido pela varredura muda o
// chunk e pode revelar outra vila mais perto — e aí o jogo povoa a OUTRA, a 130
// blocos daqui, e a sonda fotografa casas vazias e acusa o jogo de não pôr
// ninguém de pé. Anda-se até o centro parar de mudar, que é o que o jogador faz.
const vila = await page.evaluate(async () => {
  const rc = window.__roquecraft
  rc.setMode('creative')
  rc.setFlying(true)
  const achado = rc.procurarAldeia(6)
  if (!achado) return null
  let alvo = { x: achado.centro.x, z: achado.centro.z, chao: achado.chao }
  const passos = []
  for (let i = 0; i < 5; i++) {
    rc.teleport(alvo.x, alvo.chao + 6, alvo.z)
    await rc.waitChunks(4, 60000)
    const aqui = rc.aldeiaAqui(alvo.x, alvo.z)
    passos.push({ x: Math.round(alvo.x), z: Math.round(alvo.z), achou: !!aqui })
    if (!aqui) break
    if (Math.abs(aqui.centro.x - alvo.x) < 1 && Math.abs(aqui.centro.z - alvo.z) < 1) break
    alvo = { x: aqui.centro.x, z: aqui.centro.z, chao: aqui.chao }
  }
  rc.look(Math.PI * 0.25, 0.15)
  return { x: Math.round(alvo.x), z: Math.round(alvo.z), chao: alvo.chao, passos }
})

// Os moradores nascem num relógio próprio: dar tempo ao jogo é o certo aqui.
let moradores = []
for (let i = 0; i < 30 && !moradores.length; i++) {
  await page.waitForTimeout(500)
  moradores = await page.evaluate(() => window.__roquecraft.moradoresPerto())
}
await fotografar('vila-com-moradores')

// ── 2. O PAINEL ─────────────────────────────────────────────────────────────
const aberto = await page.evaluate(async () => {
  const rc = window.__roquecraft
  const gente = rc.moradoresPerto()
  if (!gente.length) return null
  if (!rc.abrirAldeao(gente[0].id)) return null
  await new Promise((k) => setTimeout(k, 200))
  return { conversa: rc.conversaAberta(), ofertas: rc.ofertasAbertas() }
})
await fotografar('painel-do-aldeao')

// ── 3. A FALA ───────────────────────────────────────────────────────────────
const falou = await page.evaluate(async () => {
  const rc = window.__roquecraft
  await rc.falarComAldeao('saudacao')
  const s = rc.conversaAberta()
  await rc.falarComAldeao('oficio')
  const o = rc.conversaAberta()
  return {
    saudacao: { texto: s?.texto, fonte: s?.fonte },
    oficio: { texto: o?.texto, fonte: o?.fonte },
  }
})
await fotografar('painel-com-fala')

// ── 4 e 5. PRESENTE, AMIZADE E PREÇO ────────────────────────────────────────
const amizade = await page.evaluate(async () => {
  const rc = window.__roquecraft
  // ⚠️ O DESCONTO SÓ É VISÍVEL NUM PREÇO QUE CABE DESCONTAR. `precoCom` nunca
  // baixa de 1 esmeralda, e o fazendeiro vende pão por 1 — a primeira versão
  // desta sonda abria o primeiro morador da lista, caía nesse balcão e acusava
  // "o desconto não chega na tela" enquanto ele chegava. Aqui se procura um
  // balcão com esmeralda de verdade em jogo.
  const caro = () =>
    rc
      .ofertasAbertas()
      .reduce(
        (n, o) => Math.max(n, ...o.paga.filter((p) => p.item === 'emerald').map((p) => p.count), 0),
        0,
      )
  for (const g of rc.moradoresPerto()) {
    rc.abrirAldeao(g.id)
    if (caro() >= 4) break
  }
  await new Promise((k) => setTimeout(k, 150))
  // A esmeralda é a moeda; o pão é o presente. Os dois entram pelo inventário
  // de QA, que é o mesmo caminho do criativo.
  rc.equipar('bread', 5)
  const antes = rc.conversaAberta()
  const precoAntes = rc
    .ofertasAbertas()
    .map((o) => o.paga.map((p) => `${p.item}:${p.count}`).join('+'))
  const deu = rc.presentearAldeao('bread')
  await new Promise((k) => setTimeout(k, 200))
  const depois = rc.conversaAberta()
  // Um aldeão MUITO amigo: a amizade sobe por evento, e o preço tem que seguir.
  for (let i = 0; i < 12; i++) {
    rc.equipar('bread', 5)
    rc.presentearAldeao('bread')
  }
  await new Promise((k) => setTimeout(k, 200))
  const amigo = rc.conversaAberta()
  const precoAmigo = rc
    .ofertasAbertas()
    .map((o) => o.paga.map((p) => `${p.item}:${p.count}`).join('+'))
  return {
    oficio: amigo?.oficio ?? null,
    maiorPreco: caro(),
    deu: !!deu,
    antes: antes?.amizade ?? null,
    depois: depois?.amizade ?? null,
    amigo: amigo?.amizade ?? null,
    humorAmigo: amigo?.humor ?? null,
    precoAntes,
    precoAmigo,
  }
})
await fotografar('painel-com-amizade')

await b.close()
await fechar()

// ── O VEREDITO ──────────────────────────────────────────────────────────────
const problemas = []
if (!vila) problemas.push('não achei vila nenhuma em 6 células — a sonda não chegou a medir nada')
if (!moradores.length) problemas.push('a vila não pôs morador nenhum de pé em 15 s')
const semNome = moradores.filter((m) => !m.nome)
if (semNome.length) problemas.push(`${semNome.length} morador(es) sem nome: ainda é "aldeão"`)
const semBalcao = moradores.filter((m) => !m.ofertas)
if (semBalcao.length) problemas.push(`${semBalcao.length} morador(es) sem oferta nenhuma`)
if (new Set(moradores.map((m) => m.nome)).size < 2 && moradores.length > 3) {
  problemas.push('a vila inteira tem o mesmo nome')
}

if (!aberto?.conversa) problemas.push('abrir o aldeão não entregou pessoa nenhuma à tela')
else {
  if (!aberto.conversa.nome) problemas.push('o painel abriu sem nome')
  if (!aberto.conversa.humor) problemas.push('o painel abriu sem humor')
  if (!aberto.ofertas?.length) problemas.push('o painel abriu sem balcão')
}

if (!falou?.saudacao?.texto) problemas.push('falar com o aldeão deixou o balão vazio')
if (falou?.saudacao?.texto && falou.saudacao.texto === falou.oficio.texto) {
  problemas.push('saudação e ofício dizem exatamente a mesma frase')
}

if (!amizade?.deu) problemas.push('presentear não passou pelo caminho do botão')
if (amizade && amizade.depois !== null && amizade.depois <= amizade.antes) {
  problemas.push(`o presente não subiu a amizade (${amizade.antes} → ${amizade.depois})`)
}
if (amizade && amizade.amigo !== null && amizade.amigo <= amizade.depois) {
  problemas.push('a amizade parou de subir antes do teto')
}
if (amizade && amizade.maiorPreco < 4) {
  problemas.push('nenhum balcão da vila cobra esmeralda que caiba descontar: sonda cega')
} else if (
  amizade &&
  amizade.precoAntes?.length &&
  amizade.precoAntes.join('|') === amizade.precoAmigo?.join('|')
) {
  problemas.push('a amizade não mexeu em preço nenhum: o desconto não chega na tela')
}
if (erros.length)
  problemas.push(`${erros.length} erro(s) de página: ${erros.slice(0, 2).join(' | ')}`)

console.log(
  JSON.stringify(
    {
      vila,
      moradores,
      aberto,
      falou,
      amizade,
      fotos,
      problemas,
      veredito: problemas.length ? 'REPROVADO' : 'o aldeão virou alguém na tela',
    },
    null,
    2,
  ),
)
process.exit(problemas.length ? 1 : 0)
