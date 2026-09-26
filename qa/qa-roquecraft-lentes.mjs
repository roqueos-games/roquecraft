//
// AS LENTES — desfoque de profundidade (DoF) e borrão ao virar a câmera.
//
// ⚠️ ESTA SONDA EXISTE PORQUE "ficou com profundidade" É INFOTOGRAFÁVEL POR
// OPINIÃO. Um print de paisagem com névoa parece desfocado ao fundo mesmo sem
// lente nenhuma — a névoa É um gradiente de distância. Então a pergunta tem que
// ser feita como diferença medida: a MESMA cena, os MESMOS pixels, com o passe
// ligado e desligado, e a nitidez do fundo cai enquanto a do primeiro plano não.
//
// Cinco afirmações mecânicas:
//   1. no perfil ultra os dois passes existem e o DoF recebeu `tDepth`
//      (sem a textura de profundidade o shader roda e o quadro sai IGUAL);
//   2. a nitidez do FUNDO cai com o DoF ligado, e a diferença é maior que a
//      deriva entre duas fotos do mesmo estado;
//   3. a nitidez do PRIMEIRO PLANO não cai — senão é borrão de tela cheia;
//   4. parado, a força do borrão do giro é zero e o passe fica DESLIGADO;
//      girando, ela sobe e a direção é contrária ao olhar;
//   5. no perfil `medium` — o do iPhone do founder — nenhum dos dois existe.
//
//   node scripts/qa-roquecraft-lentes.mjs
//
import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'
import { chromium } from 'playwright'
import { servirDist } from './lib/servidor-do-dist.mjs'

const SAIDA = path.resolve('qa-out/lentes')
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

const fora = (o) => JSON.stringify(o)

// ── 1. OS PASSES EXISTEM, E O DoF TEM PROFUNDIDADE ──────────────────────────
await page.evaluate(() => window.__roquecraft.setQuality('ultra'))
await page.waitForTimeout(2500)
// Um respiro a mais: a troca de perfil reconstrói a engine inteira.
await page.waitForFunction(() => window.__roquecraft?.state?.ready === true, null, {
  timeout: 60000,
})

// ⚠️ MÃO FORA, CÉU PARADO, ÁGUA PARADA. Três fontes de movimento que mudariam a
// foto entre os dois cliques e entrariam na conta como se fossem o efeito.
//
// ⚠️ A POSE É CALCULADA, NÃO CHUTADA. Com a câmera a 24 blocos do chão e o
// olhar 28° abaixo do horizonte, o chão a 22 blocos à frente cai na metade de
// baixo do quadro (a ~33m da câmera, abaixo do início do foco, que é 28) e o
// chão a 160 blocos cai na metade de cima (a ~162m, além do desfoque cheio, que
// é 150). É a única pose em que os dois extremos da curva aparecem no MESMO
// quadro — sem isso o A/B compara fundo com fundo e não mede nada.
await page.evaluate(async () => {
  window.__roquecraft.setFx({ hand: false, congelarAgua: true, tempoDaAgua: 1000 })
  window.__roquecraft.setTime(10600)
  await window.__roquecraft.stage({ height: 24, radius: 10, wait: 3000 })
  window.__roquecraft.look(window.__roquecraft.state.yaw, -0.489)
  await new Promise((k) => setTimeout(k, 1200))
})

const antes = await page.evaluate(() => window.__roquecraft.lentes())
if (!antes?.dof || !antes?.giro) {
  console.log(fora({ erro: 'os passes das lentes não entraram no composer', antes, erros }))
  await ctx.close()
  await b.close()
  fechar()
  process.exit(1)
}

// ── A RÉGUA: ENERGIA DE GRADIENTE ────────────────────────────────────────────
//
// Nitidez tem número: a soma de |∇luminância| numa região. Imagem nítida tem
// borda forte e gradiente alto; borrada tem gradiente baixo. A mesma régua da
// sonda da refração, e pelo mesmo motivo.
const L = (p, i) => 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2]
function nitidez(png, cx, cy, meia) {
  let soma = 0
  let n = 0
  for (let y = cy - meia; y <= cy + meia; y++) {
    if (y < 1 || y >= png.height - 1) continue
    for (let x = cx - meia; x <= cx + meia; x++) {
      if (x < 1 || x >= png.width - 1) continue
      const i = (png.width * y + x) << 2
      const dx = L(png, i + 4) - L(png, i - 4)
      const dy = L(png, i + (png.width << 2)) - L(png, i - (png.width << 2))
      soma += Math.abs(dx) + Math.abs(dy)
      n++
    }
  }
  return Number((soma / Math.max(1, n)).toFixed(3))
}

// ── OS DOIS PONTOS, COM DISTÂNCIA MEDIDA ────────────────────────────────────
//
// ⚠️ "a parte de cima do quadro é o fundo" É PALPITE, e palpite é como sondas
// deste repositório já mediram o bioma vizinho achando que mediam o certo. Cada
// ponto aqui é um ponto do MUNDO: o `projetar` diz onde ele caiu na tela, e a
// distância sai da posição do jogador. Se o ponto não couber no quadro, a sonda
// desiste em vez de fotografar o que calhar.
//
// ⚠️ A OCLUSÃO NÃO FOI ELIMINADA, E ISSO ESTÁ DECLARADO. Um morro entre a
// câmera e o ponto distante faria o pixel medido ser um morro PERTO, não o
// chão longe. A sonda não sabe disso — mas o erro só anda num sentido: um
// ponto ocluído está mais perto, desfoca MENOS, e a queda medida fica MENOR.
// Oclusão enfraquece um resultado positivo; nunca fabrica um.
const pontos = await page.evaluate(() => {
  const rc = window.__roquecraft
  const s = rc.state
  const dir = rc.olharDirecao()
  if (!dir) return { erro: 'sem direção de câmera' }
  // Só o rumo horizontal: o ponto é do CHÃO, e a altura dele quem dá é o mundo.
  const n = Math.hypot(dir.x, dir.z) || 1
  const dx = dir.x / n
  const dz = dir.z / n
  const achar = (de, ate, passo) => {
    const dentro = (d) => (passo > 0 ? d <= ate : d >= ate)
    for (let d = de; dentro(d); d += passo) {
      const x = s.player.x + dx * d
      const z = s.player.z + dz * d
      const y = rc.surfaceAt(x, z)
      if (y === null || y === undefined) continue
      const p = rc.projetar(x, y + 0.5, z)
      if (!p || !p.frente) continue
      if (p.u < 0.16 || p.u > 0.84 || p.v < 0.12 || p.v > 0.88) continue
      const dist = Math.hypot(x - s.player.x, y - s.player.y, z - s.player.z)
      return { u: p.u, v: p.v, dist: Number(dist.toFixed(1)), chao: d }
    }
    return null
  }
  return { dir, perto: achar(14, 40, 2), longe: achar(170, 110, -6) }
})

if (!pontos.perto || !pontos.longe) {
  console.log(fora({ erro: 'não achei um par perto/longe dentro do quadro', pontos, erros }))
  await ctx.close()
  await b.close()
  fechar()
  process.exit(1)
}

const MEIA = 40
async function fotoDoDof(nome, ligado) {
  await page.evaluate(async (v) => {
    window.__roquecraft.setLentes({ dof: v, borraoDoGiro: false })
    await new Promise((k) => setTimeout(k, 900))
  }, ligado)
  const buf = await page.screenshot()
  fs.writeFileSync(path.join(SAIDA, `${nome}.png`), buf)
  return PNG.sync.read(buf)
}
// ── A PROVA DE VIDA DA FOTO ─────────────────────────────────────────────────
//
// ⚠️ ESTA SONDA JÁ DEU ✅✅ PARA UMA TELA PRETA. A primeira versão mediu o
// fundo caindo de 15,9 para 0,2 de nitidez e escreveu "o FUNDO perdeu 15,7" com
// um tique verde — porque ligar o passe de profundidade apagava a cena inteira,
// e uma cena apagada não tem gradiente nenhum. "Perdeu nitidez" e "sumiu" dão
// o MESMO número numa régua de gradiente, e a régua sozinha não separa os dois.
//
// A partir daqui, toda foto precisa provar que ainda tem cena: a área do jogo
// tem que ter cor média acima de um mínimo e variação de luminância. Um borrão
// legítimo derruba o gradiente LOCAL e deixa a cena de pé; um quadro morto não.
function vidaDaCena(png, caixa) {
  let soma = 0
  let n = 0
  let min = 255
  let max = 0
  for (let y = caixa.y0; y < caixa.y1; y += 3) {
    for (let x = caixa.x0; x < caixa.x1; x += 3) {
      const l = L(png, (png.width * y + x) << 2)
      soma += l
      if (l < min) min = l
      if (l > max) max = l
      n++
    }
  }
  return { media: Number((soma / Math.max(1, n)).toFixed(2)), min, max }
}

const px = (p, t) => ({ x: Math.round(t.u * p.width), y: Math.round(t.v * p.height) })
const medir = (p) => ({
  perto: nitidez(p, px(p, pontos.perto).x, px(p, pontos.perto).y, MEIA),
  longe: nitidez(p, px(p, pontos.longe).x, px(p, pontos.longe).y, MEIA),
})

// ⚠️ A/B/A, e não A/B. Duas fotos do MESMO estado já diferiram mais que o sinal
// que se queria medir na sonda da refração. Sem o segundo "com", não dá para
// saber se a diferença é o efeito ou o ruído do próprio quadro.
const semA = await fotoDoDof('sem-dof', false)
const com = await fotoDoDof('com-dof', true)
const semB = await fotoDoDof('sem-dof-2', false)
const mSemA = medir(semA)
const mCom = medir(com)
const mSemB = medir(semB)

// A caixa do CANVAS do jogo, não da janela: fora dela há papel de parede e dock,
// que continuariam coloridos com o jogo apagado.
const caixa = await page.evaluate(() => {
  const r = document.querySelector('canvas').getBoundingClientRect()
  return {
    x0: Math.round(r.x + 8),
    y0: Math.round(r.y + 8),
    x1: Math.round(r.right - 8),
    y1: Math.round(r.bottom - 8),
  }
})
const vidaSem = vidaDaCena(semA, caixa)
const vidaCom = vidaDaCena(com, caixa)

const derivaLonge = Math.abs(mSemA.longe - mSemB.longe)
const derivaPerto = Math.abs(mSemA.perto - mSemB.perto)
const quedaLonge = mSemA.longe - mCom.longe
const quedaPerto = mSemA.perto - mCom.perto

// ── 4. O BORRÃO DO GIRO ─────────────────────────────────────────────────────
//
// ⚠️ O GIRO É FEITO PELA PORTA DO JOGO (`look`), quadro a quadro, e a força é
// lida do UNIFORME. Escrever o uniforme na mão e fotografar provaria que o
// shader borra — que é o que `lentes.spec.js` já prova. O que só o jogo rodando
// responde é se o engine ENXERGA o giro da câmera.
const giro = await page.evaluate(async () => {
  const rc = window.__roquecraft
  rc.setLentes({ dof: false, borraoDoGiro: true })
  const quadro = () => new Promise((k) => requestAnimationFrame(k))
  const s0 = rc.state
  let yaw = s0.yaw
  const pitch = s0.pitch

  // ── PARA ONDE A IMAGEM ANDA, MEDIDO ────────────────────────────────────────
  //
  // ⚠️ O SINAL DO BORRÃO JÁ ESTEVE INVERTIDO com um comentário convincente por
  // cima. Dedução não decide isto: um ponto FIXO do mundo, projetado antes e
  // depois de um giro do jogo, decide. `u` é a UV da tela; `v` do projetor
  // cresce para BAIXO, e a UV do shader cresce para cima — por isso o eixo
  // vertical entra invertido aqui.
  const dir = rc.olharDirecao()
  const nd = Math.hypot(dir.x, dir.z) || 1
  const alvoX = s0.player.x + (dir.x / nd) * 60
  const alvoZ = s0.player.z + (dir.z / nd) * 60
  const alvoY = rc.surfaceAt(alvoX, alvoZ) + 0.5
  const antesDoPasso = rc.projetar(alvoX, alvoY, alvoZ)
  rc.look(yaw + 0.05, pitch)
  await quadro()
  const depoisDoPasso = rc.projetar(alvoX, alvoY, alvoZ)
  rc.look(yaw, pitch)
  await quadro()
  const andaDaImagem = {
    x: Number((depoisDoPasso.u - antesDoPasso.u).toFixed(5)),
    y: Number((antesDoPasso.v - depoisDoPasso.v).toFixed(5)),
  }

  // ⚠️ 40 QUADROS, E NÃO 6. A medição de "para onde a imagem anda" logo acima
  // gira a câmera, e a mola tem tau de 0,09 s: com 6 quadros (~0,1 s) ela ainda
  // guardava 0,0148 de resíduo, e a sonda acusou "parado com o passe LIGADO" —
  // um defeito que era da própria sonda.
  for (let i = 0; i < 40; i++) await quadro()
  const parado = rc.lentes().giro

  // ~3,5 rad/s: um giro de mira rápido, acima do limiar e abaixo do teto.
  const PASSO = 0.058
  let pico = 0
  let dirNoPico = [0, 0]
  for (let i = 0; i < 30; i++) {
    yaw += PASSO
    rc.look(yaw, pitch)
    await quadro()
    const g = rc.lentes().giro
    if (g.forca > pico) {
      pico = g.forca
      dirNoPico = g.direcao
    }
  }
  const foto = document.querySelector('canvas')?.toDataURL('image/png') ?? null

  for (let i = 0; i < 40; i++) await quadro()
  const depois = rc.lentes().giro
  return { parado, depois, pico, dirNoPico, passo: PASSO, andaDaImagem, foto }
})

if (giro.foto) {
  fs.writeFileSync(
    path.join(SAIDA, 'girando-com-borrao.png'),
    Buffer.from(giro.foto.split(',')[1], 'base64'),
  )
}

// ── 5. O PERFIL DO IPHONE NÃO TEM LENTE NENHUMA ─────────────────────────────
await page.evaluate(() => window.__roquecraft.setQuality('medium'))
await page.waitForTimeout(2600)
const noCelular = await page.evaluate(() => window.__roquecraft.lentes())

// ── VEREDITO ────────────────────────────────────────────────────────────────
const v = []
const ok = (c, t) => {
  v.push(`${c ? '✅' : '❌'} ${t}`)
  return c
}
let bom = true
bom =
  ok(
    vidaCom.media > vidaSem.media * 0.6 && vidaCom.max - vidaCom.min > 40,
    `a cena continua viva com o DoF: luz média ${vidaCom.media} contra ${vidaSem.media} sem ele, amplitude ${vidaCom.max - vidaCom.min}`,
  ) && bom
bom =
  ok(
    antes.dof.temProfundidade,
    `o DoF recebeu tDepth (near ${antes.dof.near}, far ${antes.dof.far})`,
  ) && bom
bom = ok(antes.dof.raio > 0, `o raio do DoF é ${antes.dof.raio}`) && bom
bom =
  ok(
    quedaLonge > 0 && quedaLonge > derivaLonge * 2,
    `o FUNDO (${pontos.longe.dist}m) perdeu ${quedaLonge.toFixed(3)} de nitidez — ${mSemA.longe} → ${mCom.longe}; deriva ${derivaLonge.toFixed(3)}`,
  ) && bom
bom =
  ok(
    quedaPerto <= derivaPerto * 2,
    `o PRIMEIRO PLANO (${pontos.perto.dist}m) ficou: ${mSemA.perto} → ${mCom.perto} (Δ ${quedaPerto.toFixed(3)}, deriva ${derivaPerto.toFixed(3)})`,
  ) && bom
bom =
  ok(
    giro.parado.forca === 0 && !giro.parado.ligado,
    `parado: força ${giro.parado.forca}, passe ${giro.parado.ligado ? 'LIGADO' : 'desligado'}`,
  ) && bom
bom = ok(giro.pico > 0, `girando: pico de força ${giro.pico}`) && bom
bom =
  ok(
    Math.sign(giro.dirNoPico[0]) === Math.sign(giro.andaDaImagem.x),
    `o kernel colhe PARA ONDE A IMAGEM ANDA: com yaw +${giro.passo}/quadro a imagem anda ${giro.andaDaImagem.x} em u, e uDirecao.x é ${giro.dirNoPico[0]}`,
  ) && bom
bom =
  ok(
    giro.depois.forca < giro.pico / 4 || !giro.depois.ligado,
    `parou de girar: força caiu para ${giro.depois.forca}, passe ${giro.depois.ligado ? 'ligado' : 'desligado'}`,
  ) && bom
bom =
  ok(
    !noCelular?.dof && !noCelular?.giro,
    `no perfil medium (o iPhone) não há passe de lente nenhum`,
  ) && bom
bom = ok(erros.length === 0, `sem erro de página (${erros.length})`) && bom

console.log(
  fora({
    veredito: v,
    pontos,
    dof: { semA: mSemA, com: mCom, semB: mSemB, quedaLonge, quedaPerto, derivaLonge, derivaPerto },
    vida: { sem: vidaSem, com: vidaCom, caixa },
    giro: {
      parado: giro.parado,
      pico: giro.pico,
      dirNoPico: giro.dirNoPico,
      andaDaImagem: giro.andaDaImagem,
      depois: giro.depois,
    },
    uniformes: antes,
    noCelular,
    fotos: fs.readdirSync(SAIDA).map((f) => path.join('qa-out/lentes', f)),
    erros,
  }),
)

await ctx.close()
await b.close()
fechar()
process.exit(bom ? 0 : 1)
