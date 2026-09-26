//
// MUNDO NOVO TEM QUE ABRIR JOGÁVEL E ILUMINADO.
//
// Em 2026-08-23, um mundo novo em produção (semente 312193) abriu com o jogador
// em (1, 52, 1) — dez blocos ABAIXO do nível do mar — e a tela inteira preta.
// É esse o print do founder: não é "o mapa no céu", é o jogador embaixo do
// mapa, vendo o avesso sem luz.
//
// Todo QA anterior teleportava o jogador pra um lugar escolhido antes de
// fotografar, então nenhum deles jamais olhou para o NASCIMENTO. Este olha:
// N sementes, mundo novo, e três perguntas por mundo — onde nasceu, o chão
// estava acima dele, e a tela tem luz.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { chromium, devices } from 'playwright'
import { shellDoApp } from './lib/servidor-do-dist.mjs'
const { PNG } = createRequire(import.meta.url)('pngjs')
const DIST = path.resolve('dist/pwa')
const OUT = path.resolve('scripts/.qa-nascer')
fs.mkdirSync(OUT, { recursive: true })
const T = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
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
const SEMENTES = (process.argv[2] || '312193,942457,999416,89866,1,42,7,20260819,555111,123456')
  .split(',')
  .map(Number)

const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] })
const linhas = []
for (const semente of SEMENTES) {
  const ctx = await b.newContext({
    ...devices['iPhone 13'],
    serviceWorkers: 'block',
    locale: 'pt-BR',
  })
  const page = await ctx.newPage()
  const erros = []
  page.on('pageerror', (e) => erros.push(e.message.slice(0, 140)))
  try {
    await page.addInitScript(
      `window.__ROS_E2E__={auth:{uid:'e2e',email:'e@e.t',emailVerified:true,displayName:'E',role:'user'},googleDrive:{isConnected:false,files:[],user:{}},googleMapsApiKey:'',roquecraftSeed:${semente},roquecraftMenu:true}`,
    )
    await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => !!window.__rosStore, null, { timeout: 30000 })
    await page.waitForTimeout(1200)
    await page.evaluate(() => window.__rosStore.openWindow('roquecraft'))
    await page.waitForFunction(() => window.__roquecraft?.state?.ready === true, null, {
      timeout: 90000,
    })
    // ⚠️ ENTRAR PELO MENU, como um jogador de verdade.
    //
    // No modo E2E o jogo pula o menu e cai direto no mundo — e esse atalho
    // pula `pousarSeguro`, que é justamente quem escolhe o YAW inicial com
    // `melhorVista` (virar as costas pro paredão). Medindo pelo atalho eu
    // estaria julgando um enquadramento que jogador nenhum vê.
    // menuNewWorld sorteia OUTRA semente, e a medição por semente se perderia.
    // menuContinue mantém a semente injetada e passa pelo mesmo leaveMenu().
    // SEM_MENU=1 reproduz o atalho do E2E (sem `melhorVista`). É o grupo de
    // controle: sem ele eu não saberia dizer se um resultado bom veio do
    // seletor de yaw ou de sorte na amostra de sementes.
    if (!process.env.SEM_MENU) {
      await page.evaluate(() => window.__roquecraft.menuContinue?.())
      await page.waitForTimeout(1500)
    }
    // NÃO teleporta. Deixa o jogo colocar o jogador onde ele acha certo.
    const r = await page.evaluate(async () => {
      const rc = window.__roquecraft
      rc.setTime(6000) // meio-dia: se estiver escuro, não é a noite
      await rc.waitChunks(4)
      await new Promise((r) => setTimeout(r, 4000)) // deixa cair/assentar
      const s = rc.state
      const p = s.player
      const chao = rc.surfaceAt(Math.floor(p.x), Math.floor(p.z))
      // QUANTO ESPAÇO LIVRE TEM NA FRENTE DO OLHO.
      //
      // Brilho médio não responde "nasci de cara numa árvore": copa iluminada
      // dá brilho alto E enquadramento péssimo — foi exatamente esse proxy que
      // me fez achar que a tentativa revertida de céu aberto tinha melhorado.
      // A pergunta certa é geométrica: a que distância o raio do olho encosta
      // em algo. Folha conta, porque é sólida pra física e enche a tela igual
      // pedra. O leque de 5 raios separa "um tronco no canto" de "um paredão".
      const raio = (desvio) => {
        const dir = {
          x: Math.sin(s.yaw + desvio) * Math.cos(s.pitch),
          y: Math.sin(s.pitch),
          z: -Math.cos(s.yaw + desvio) * Math.cos(s.pitch),
        }
        const oy = p.y + 1.62
        for (let d = 0.25; d <= 12; d += 0.25) {
          if (
            rc.solidoEm(
              Math.floor(p.x + dir.x * d),
              Math.floor(oy + dir.y * d),
              Math.floor(p.z + dir.z * d),
            ) > 0
          )
            return d
        }
        return 12
      }
      const leque = [-0.35, -0.175, 0, 0.175, 0.35].map(raio)
      // CHÃO OU COPA?
      //
      // `surfaceY` conta árvore: numa floresta o "topo" da coluna é a copa. Um
      // jogador em cima da copa tem `y == chao` e `delta 0` igual a um jogador
      // no chão — a métrica de soterramento não distingue os dois, e o print
      // dele é o mesmo "mapa no céu" pelo avesso: o mundo lá embaixo, visto
      // por entre as folhas.
      //
      // O que separa os dois é a ESPESSURA do que está sob o pé. Copa tem
      // 1 a 4 blocos e ar embaixo; terra tem dezenas.
      //
      // ⚠️ E ESPESSURA SOZINHA NÃO BASTA: crosta de caverna também dá 1 a 5
      // blocos com ar embaixo, e eu concluí "copa" duas vezes olhando só pra
      // ela. Quem responde é a CHAVE do bloco sob o pé.
      let espessura = 0
      const px = Math.floor(p.x),
        pz = Math.floor(p.z)
      for (let y = Math.floor(p.y) - 1; y > 0 && espessura < 24; y--) {
        if (rc.solidoEm(px, y, pz) <= 0) break
        espessura++
      }
      const soPe = rc.blocoEm(px, Math.floor(p.y) - 1, pz)
      const naArvore = /(Leaves|Log)$/.test(soPe)
      // Coluna em volta do pé, pra diagnóstico quando algo der errado.
      const coluna = []
      for (let y = Math.floor(p.y) + 2; y >= Math.floor(p.y) - 10; y--)
        coluna.push(`${y}:${rc.blocoEm(px, y, pz)}`)
      return {
        pos: p,
        bioma: s.biome,
        chao,
        yaw: +s.yaw.toFixed(2),
        espessura,
        soPe,
        naArvore,
        coluna,
        livre: raio(0),
        leque: +(leque.reduce((a, b) => a + b, 0) / leque.length).toFixed(2),
        // ⚠️ `solidoEm > 0` NÃO é "está dentro da pedra": camada de neve
        // é laje, devolve 0,125, e quem está corretamente EM CIMA dela
        // (y = 66,125 na taiga) era acusado de enterrado. O que a
        // célula devolve é a ALTURA do sólido; enterrado é o pé estar
        // abaixo dessa altura.
        dentroDaPedra: p.y - Math.floor(p.y) < rc.solidoEm(px, Math.floor(p.y), pz) - 1e-6,
      }
    })
    const shot = path.join(OUT, `nascer-${semente}.png`)
    await page.locator('canvas').first().screenshot({ path: shot })
    const png = PNG.sync.read(fs.readFileSync(shot))
    let soma = 0,
      n = 0
    for (let y = 0; y < png.height; y += 4)
      for (let x = 0; x < png.width; x += 4) {
        const i = (y * png.width + x) * 4
        soma += png.data[i] + png.data[i + 1] + png.data[i + 2]
        n++
      }
    const brilho = +(soma / n / 3).toFixed(1)
    linhas.push({ semente, ...r, brilho, erros: erros.slice(0, 2) })
  } catch (e) {
    linhas.push({ semente, erro: e.message.slice(0, 120) })
  }
  await ctx.close()
}
await b.close()
s.close()
// ⚠️ `debaixoDoChao` (p.y < surfaceY) SAIU DA CONTA e não volta: `surfaceY`
// conta árvore, então quem está corretamente no chão embaixo de uma copa é
// acusado de enterrado. Essa métrica me fez "consertar" cinco sementes que
// estavam certas, empurrando o jogador pra cima da copa. O que vale é o bloco
// sob o pé e se o jogador está DENTRO de sólido.
const ruins = linhas.filter((l) => l.erro || l.dentroDaPedra || l.naArvore || (l.brilho ?? 99) < 40)
// Cara na parede: 1,5 bloco é menos que o alcance do braço. Abaixo disso o
// primeiro quadro do jogo é uma textura chapada, não uma paisagem.
const naParede = linhas.filter((l) => !l.erro && (l.livre ?? 99) < 1.5)
// Copa é o bloco sob o pé ser folha ou tronco — não é "pouca coisa embaixo".
// Crosta fina de caverna também dá espessura 1 e é chão legítimo.
const naCopa = linhas.filter((l) => !l.erro && l.naArvore)
const ok = linhas.filter((l) => !l.erro && Number.isFinite(l.livre))
const medio = ok.length ? +(ok.reduce((a, b) => a + b.livre, 0) / ok.length).toFixed(2) : null
console.log(
  JSON.stringify(
    {
      total: linhas.length,
      ruins: ruins.length,
      naParede: naParede.length,
      naCopa: naCopa.length,
      copas: naCopa.map((l) => ({ s: l.semente, y: l.pos.y, soPe: l.soPe, bioma: l.bioma })),
      dentro: linhas
        .filter((l) => l.dentroDaPedra)
        .map((l) => ({ s: l.semente, y: l.pos.y, coluna: l.coluna })),
      livreMedio: medio,
      piores: [...ok]
        .sort((a, b) => a.livre - b.livre)
        .slice(0, 5)
        .map((l) => ({ s: l.semente, livre: l.livre, leque: l.leque, brilho: l.brilho })),
      linhas,
    },
    null,
    2,
  ),
)
// O veredito sai pelo código de saída: o ledger de sondas lê ISSO, não a prosa.
// Nenhuma semente pode abrir ruim (dentro da pedra, na copa, escura ou com erro).
process.exit(ruins.length === 0 && linhas.length > 0 ? 0 : 1)
