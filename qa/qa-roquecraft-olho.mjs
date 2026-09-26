//
// O OLHO — um contato-folha do jogo, pra OLHAR.
//
// Este arquivo existe por causa de um erro meu, e o erro merece ficar escrito.
//
// Entre as rodadas 8 e 12 eu subi cinco melhorias para produção com o portão
// verde: lint limpo, seis mil testes, sondas de 5/5 e 10/10, harness de nove
// cenários dizendo "abriu, desenhou, zero erro". E o founder abriu o jogo no
// celular e viu vegetação virando placas chapadas e a mão virando uma lasca
// atravessada na tela.
//
// Todas as minhas sondas mediam RETÂNGULOS: a altura de uma lâmina d'água, a
// silhueta de uma cama, a cor de um cubo caindo. Nenhuma olhava o jogo. Pior:
// várias DESLIGAVAM a mão (`setFx({hand:false})`) porque ela atrapalhava a
// medição — então o defeito da mão era invisível pra todas elas, por construção.
//
// Um número que passa não é a mesma coisa que uma tela que presta.
//
// Este harness não decide nada sozinho. Ele monta as cenas que um jogador
// realmente vê — cada bioma, cada perfil de qualidade, primeira pessoa com a
// mão LIGADA, vegetação de perto, o inventário aberto — e devolve uma folha de
// contato pra ser OLHADA antes de qualquer deploy.
//
//   node scripts/qa-roquecraft-olho.mjs [semente]
//
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { chromium, webkit } from 'playwright'
import { instalarArmadilhaGL, colherArmadilhaGL } from './lib/rc-armadilha-gl.mjs'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const { PNG } = createRequire(import.meta.url)('pngjs')

const DIST = path.resolve('dist/pwa')
const OUT = path.resolve(
  process.env.MOTOR === 'webkit' ? 'scripts/.qa-olho-webkit' : 'scripts/.qa-olho',
)
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
const SEMENTE = Number(process.argv[2] || 942457)

// MOTOR=webkit roda a MESMA folha no motor do iPhone.
//
// O founder mandou um print do celular com a vegetação chapada em quadrados
// cruzados e textura errada. Nada disso reproduz no Chromium, em nenhum perfil
// — o que sobra como hipótese é o motor. Safari e Chrome não são o mesmo
// WebGL: driver diferente, limites diferentes, e um `sampler2DArray` com 81
// camadas é exatamente o tipo de coisa em que eles divergem.
//
// Rodar a mesma sonda em dois motores, em vez de escrever uma segunda sonda
// pro celular, é o que mantém a comparação honesta: se a foto muda, mudou o
// motor, não o método.
const MOTOR = process.env.MOTOR === 'webkit' ? webkit : chromium
const b = await MOTOR.launch(
  process.env.MOTOR === 'webkit'
    ? {}
    : { args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
)

const erros = []
const fotos = []
// Onde cada foto foi tirada: copa, solo e espessura do dossel. Vai pro
// relatório porque a foto sozinha não conta de onde foi tirada, e "isso é uma
// floresta ou é o telhado dela?" é uma pergunta que já custou uma rodada.
const enquadramentos = []

async function abrir({ largura, altura, movel, qualidade }) {
  const ctx = await b.newContext({
    viewport: { width: largura, height: altura },
    deviceScaleFactor: 1,
    isMobile: movel,
    hasTouch: movel,
    serviceWorkers: 'block',
    locale: 'pt-BR',
  })
  const page = await ctx.newPage()
  await instalarArmadilhaGL(page)
  page.on('pageerror', (e) => erros.push(`[${qualidade}] ${String(e.message).slice(0, 160)}`))
  page.on('console', (m) => {
    const t = m.text()
    if (/Shader|WebGL|INVALID|context lost|texImage/i.test(t)) {
      erros.push(`[${qualidade}] ${t.slice(0, 160)}`)
    }
  })
  await page.addInitScript(
    `window.__ROS_E2E__={auth:{uid:'e2e',email:'e@e.t',emailVerified:true,displayName:'E',role:'user'},googleDrive:{isConnected:false,files:[],user:{}},googleMapsApiKey:'',roquecraftSeed:${SEMENTE}}`,
  )
  await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!window.__rosStore, null, { timeout: 30000 })
  await page.waitForTimeout(1000)
  await page.evaluate(() => window.__rosStore.openWindow('roquecraft'))
  await page.waitForFunction(() => window.__roquecraft?.state?.ready === true, null, {
    timeout: 120000,
  })
  await page.evaluate(
    async (q) => {
      window.__roquecraft.setQuality(q)
      await new Promise((r) => setTimeout(r, 2500))
      window.__rosStore?.maximizeWindow?.('roquecraft')
      await new Promise((r) => setTimeout(r, 900))
    },
    qualidade === 'auto' ? 'ultra' : qualidade,
  )
  await page.addStyleTag({ content: '.ros-roquecraft__play { display: none !important }' })
  await page.waitForTimeout(600)
  return { ctx, page }
}

/**
 * Leva o jogador até um bioma e tira a foto de PRIMEIRA PESSOA, com a mão
 * LIGADA — que é como o jogador vê.
 */
async function retrato(page, bioma, nome, qualidade) {
  // `gotoBiome` já existe como gancho de QA e faz a busca em espiral pela
  // geração, que é pura. Reescrever a busca aqui só criaria uma segunda versão
  // pra sair do lugar — a primeira tentativa desta sonda fez isso e nem achou o
  // gancho certo.
  const achou = await page.evaluate(async (bioma) => {
    const rc = window.__roquecraft
    if (!rc.gotoBiome(bioma)) return null
    await rc.waitChunks(6)
    await new Promise((k) => setTimeout(k, 2200))
    const p = rc.state.player
    return { x: Math.round(p.x), z: Math.round(p.z), bioma: rc.state.biome }
  }, bioma)
  if (!achou) {
    erros.push(`[${qualidade}] não achei o bioma ${bioma}`)
    return
  }
  // POUSAR NO CHÃO antes de fotografar.
  //
  // `gotoBiome` deixou o jogador em y=76 na floresta, com o chão em 66: a foto
  // de "floresta" era o TELHADO da mata vista de cima, um mar de cubos verdes
  // sem um tronco à vista. Passei uma rodada olhando essa foto achando que
  // estava olhando uma floresta.
  //
  // ⚠️ `teleport` LIGA o voo. Por isso `setFlying(false)` vem DEPOIS dele - na
  // ordem inversa não faz nada, armadilha já paga duas vezes neste projeto.
  // ⚠️ Não use `surfaceAt` pra achar o chão: ele conta FOLHA como topo. A
  // primeira versão desta checagem comparava a altura do jogador com
  // `surfaceAt` e dava verde na floresta - os dois mediam a mesma copa. O
  // instrumento concordava com o defeito, que é o modo de falha mais caro
  // deste projeto.
  //
  // `colunaEm` devolve a coluna com o NOME de cada bloco; aqui a gente decide
  // o que é chão: o primeiro sólido que não seja folha nem tronco.
  // E não adianta só medir: `teleport` procura ponto SEGURO e devolve o
  // jogador pro topo da copa se o destino estiver debaixo de árvore. Pra
  // fotografar a floresta por dentro é preciso pousar numa CLAREIRA - de onde,
  // aliás, se vê tronco e copa, que é o enquadramento certo de qualquer jeito.
  const enquadramento = await page.evaluate(async () => {
    const rc = window.__roquecraft
    const VEGETAL = /leaves|log|wood|sapling|flower|bush|cactus/i
    const sonda = (x, z) => {
      const col = rc.colunaEm(x, z) || []
      const copa = rc.surfaceAt(x, z)
      const solo = col.find((c) => c.bloco !== 'air' && !VEGETAL.test(c.bloco))
      if (!solo || !Number.isFinite(copa)) return null
      return { x, z, copa, solo: solo.y, bloco: solo.bloco, dossel: copa - solo.y }
    }
    const p = rc.state.player
    const x0 = Math.floor(p.x)
    const z0 = Math.floor(p.z)
    // Uma coluna aberta NÃO basta: a primeira versão achou a primeira brecha e
    // colou a câmera num tronco - a foto da floresta virou um close de casca.
    // O que se procura é uma CLAREIRA: aberta com folga em volta, pra que a
    // árvore mais próxima fique a alguns blocos e apareça inteira.
    const clareira = (x, z, raio) => {
      const centro = sonda(x, z)
      if (!centro || centro.dossel > 1) return null
      for (let dx = -raio; dx <= raio; dx++) {
        for (let dz = -raio; dz <= raio; dz++) {
          const c = sonda(x + dx, z + dz)
          if (!c || c.dossel > 1) return null
        }
      }
      return centro
    }
    let alvo = null
    // Tenta 5×5; se a mata for fechada demais, aceita 3×3; e por último uma
    // coluna solta. Cair pro plano B fica REGISTRADO no relatório - "não achei
    // clareira" é informação sobre o bioma, não detalhe da sonda.
    let folga = 2
    for (const raio of [2, 1, 0]) {
      folga = raio
      if ((alvo = clareira(x0, z0, raio))) break
      busca: for (let r = 1; r <= 14; r++) {
        for (let dx = -r; dx <= r; dx++) {
          for (let dz = -r; dz <= r; dz++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue
            const c = clareira(x0 + dx, z0 + dz, raio)
            if (c) {
              alvo = c
              break busca
            }
          }
        }
      }
      if (alvo) break
    }
    if (alvo) {
      rc.teleport(alvo.x + 0.5, alvo.solo + 2.6, alvo.z + 0.5)
      rc.setFlying(false)
      await new Promise((k) => setTimeout(k, 1000))
    }
    // Reporta a posição FINAL, não a pretendida: o teleporte pode ter mudado
    // de ideia, e foi exatamente isso que aconteceu na primeira tentativa.
    const f = rc.state.player
    const real = sonda(Math.floor(f.x), Math.floor(f.z))
    return {
      y: Math.round(f.y),
      copa: real ? real.copa : null,
      solo: real ? real.solo : null,
      bloco: real ? real.bloco : null,
      dossel: real ? real.dossel : null,
      folga: alvo ? folga : null,
      // O bioma DEPOIS de andar até a clareira. A busca pode ter atravessado a
      // fronteira: a foto rotulada "forest" saiu num pântano, e sem esta linha
      // eu teria olhado um pântano acreditando estar olhando uma floresta.
      bioma: rc.state.biome,
    }
  })
  if (enquadramento.solo === null) {
    erros.push(`[${qualidade}] ${nome}: não achei o solo na coluna - foto sem chão sob os pés`)
  } else if (enquadramento.y - enquadramento.solo > 5) {
    erros.push(
      `[${qualidade}] ${nome}: foto tirada ${enquadramento.y - enquadramento.solo} blocos acima do solo (${enquadramento.bloco} em y=${enquadramento.solo}) - é foto do telhado, não do bioma`,
    )
  }
  enquadramentos.push({ cena: nome, ...enquadramento })
  await page.evaluate(async () => {
    const rc = window.__roquecraft
    rc.setTime(6000)
    // ⚠️ A MÃO FICA LIGADA. Foi por desligá-la em toda sonda que o defeito dela
    // sobreviveu a cinco rodadas de portão verde.
    rc.setFx({ hand: true })
    rc.look(0.6, -0.12)
    await new Promise((r) => setTimeout(r, 1200))
  })
  const arquivo = `${nome}.png`
  fs.writeFileSync(path.join(OUT, arquivo), await page.screenshot())
  fotos.push(arquivo)
}

const CENAS = [
  { qualidade: 'ultra', largura: 1280, altura: 720, movel: false, rotulo: 'desktop-ultra' },
  { qualidade: 'low', largura: 1280, altura: 720, movel: false, rotulo: 'desktop-low' },
  { qualidade: 'low', largura: 430, altura: 932, movel: true, rotulo: 'celular-low' },
]
// Nomes do worldgen (`BIOME_NAMES`), não rótulos de tela.
const BIOMAS = ['savanna', 'plains', 'desert', 'forest']

const infracoesGL = []
for (const cena of CENAS) {
  const { ctx, page } = await abrir(cena)
  for (const bioma of BIOMAS) {
    await retrato(page, bioma, `${cena.rotulo}-${bioma.toLowerCase()}`, cena.rotulo)
  }
  const gl = await colherArmadilhaGL(page)
  // `limpas: 0` é sinal de armadilha morta, não de perfil limpo — vai pro
  // relatório junto, senão um zero de infração vira falso verde.
  infracoesGL.push({ perfil: cena.rotulo, limpas: gl.limpas, achados: gl.infracoes.slice(0, 3) })
  await ctx.close()
}

// ── Folha de contato ─────────────────────────────────────────────────────
//
// Uma imagem só, com todas as cenas lado a lado. Doze arquivos soltos ninguém
// abre; uma folha de contato se olha em cinco segundos.
const COL = 4
const CEL_W = 480
const CEL_H = 300
const linhas = Math.ceil(fotos.length / COL)
// `new PNG({width,height})` não aloca `data` em todas as versões; alocar à mão
// é o que garante a folha existir.
const folha = new PNG({ width: COL * CEL_W, height: Math.max(1, linhas) * CEL_H })
folha.data = Buffer.alloc(folha.width * folha.height * 4, 24)
fotos.forEach((arquivo, i) => {
  const src = PNG.sync.read(fs.readFileSync(path.join(OUT, arquivo)))
  const cx = (i % COL) * CEL_W
  const cy = Math.floor(i / COL) * CEL_H
  const escala = Math.min(CEL_W / src.width, CEL_H / src.height)
  const w = Math.round(src.width * escala)
  const h = Math.round(src.height * escala)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.min(src.width - 1, Math.round(x / escala))
      const sy = Math.min(src.height - 1, Math.round(y / escala))
      const si = (src.width * sy + sx) << 2
      const di = (folha.width * (cy + y) + cx + x) << 2
      folha.data[di] = src.data[si]
      folha.data[di + 1] = src.data[si + 1]
      folha.data[di + 2] = src.data[si + 2]
      folha.data[di + 3] = 255
    }
  }
})
// ── Diferença contra a folha ANTERIOR ────────────────────────────────────────
//
// Olhar a folha continua sendo o passo 6 e não sai. Mas olhar não escala e nem
// sempre está disponível: em 24/08 o login do app do Mac expirou e eu fiquei
// sem conseguir abrir o PNG, com uma refatoração pronta pra subir.
//
// Esta medida não substitui o olho — ela cobre o que o olho é RUIM de fazer:
// notar que 0,6% dos pixels mudaram num canto. O olho pega o que ela não pega
// (a coisa errada que sempre esteve lá); ela pega o que o olho não pega (a
// mudança pequena entre duas corridas).
//
// A folha anterior fica GUARDADA fora do diretório que a sonda apaga, senão
// não há o que comparar.
const ANTERIOR = path.resolve('scripts/.qa-olho-anterior.png')
const destino = path.join(OUT, 'folha-de-contato.png')
let diff = null
if (fs.existsSync(ANTERIOR)) {
  try {
    const velha = PNG.sync.read(fs.readFileSync(ANTERIOR))
    if (velha.width === folha.width && velha.height === folha.height) {
      let mudados = 0
      for (let i = 0; i < folha.data.length; i += 4) {
        const d = Math.max(
          Math.abs(folha.data[i] - velha.data[i]),
          Math.abs(folha.data[i + 1] - velha.data[i + 1]),
          Math.abs(folha.data[i + 2] - velha.data[i + 2]),
        )
        if (d > 8) mudados++
      }
      const total = folha.width * folha.height
      diff = { mudados, total, pct: +((mudados / total) * 100).toFixed(3) }
    } else {
      diff = { erro: 'tamanho diferente da anterior' }
    }
  } catch (e) {
    diff = { erro: String(e.message).slice(0, 80) }
  }
}
fs.writeFileSync(destino, PNG.sync.write(folha))
fs.copyFileSync(destino, ANTERIOR)

console.log(
  JSON.stringify(
    {
      saida: OUT,
      folha: path.join(OUT, 'folha-de-contato.png'),
      fotos,
      erros,
      infracoesGL,
      diffDaFolha: diff,
      enquadramentos,
    },
    null,
    2,
  ),
)
await b.close()
s.close()
