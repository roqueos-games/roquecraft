//
// SONDA DO PÓS-PROCESSAMENTO NO CÉU.
//
// A sonda `qa-roquecraft-ceu.mjs` mede o SHADER do céu. Ela não vê bloom nem
// raios de sol, porque esses são passes de tela cheia aplicados DEPOIS. E o
// relato do founder — "brilhos estranhos que partem de uns pontos do céu onde
// o céu não está" — descreve exatamente o que um passe de tela cheia faz de
// errado: inventar luz numa direção onde não há fonte nenhuma.
//
// O instrumento aqui é uma DIFERENÇA, não uma foto: o mesmo quadro, a mesma
// câmera, o mesmo instante do mundo, renderizado com `post: true` e com
// `post: false`. O que sobra na subtração é, por construção, exatamente o que
// o pós-processamento acrescentou. Nenhum julgamento de olho entra nisso.
//
// Prova de vida: o SOL tem que aparecer na diferença. Bloom e raios existem
// justamente pra brilhar em volta dele. Se a diferença for zero até no sol, o
// instrumento está cego e o resto do relatório não vale nada.
//
//   node scripts/qa-roquecraft-ceu-pos.mjs [semente]
//
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { shellDoApp } from './lib/servidor-do-dist.mjs'

const DIST = path.resolve('dist/pwa')
const OUT = path.resolve('scripts/.qa-ceu')
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
const SEMENTE = Number(process.argv[2] || 942457)

const navegador = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const ctx = await navegador.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
  serviceWorkers: 'block',
  locale: 'pt-BR',
})
const pagina = await ctx.newPage()
const erros = []
pagina.on('pageerror', (e) => erros.push(String(e.message).slice(0, 220)))
pagina.on('console', (m) => {
  const t = m.text()
  if (/Shader|WebGL|INVALID|context lost|out of memory/i.test(t)) erros.push(t.slice(0, 220))
})
await pagina.addInitScript(
  `window.__ROS_E2E__={auth:{uid:'e2e',email:'e@e.t',emailVerified:true,displayName:'E',role:'user'},googleDrive:{isConnected:false,files:[],user:{}},googleMapsApiKey:'',roquecraftSeed:${SEMENTE}}`,
)
await pagina.goto(`${base}/app`, { waitUntil: 'domcontentloaded' })
await pagina.waitForFunction(() => !!window.__rosStore, null, { timeout: 30000 })
await pagina.waitForTimeout(1200)
await pagina.evaluate(() => window.__rosStore.openWindow('roquecraft'))
await pagina.waitForFunction(() => window.__roquecraft?.state?.ready === true, null, {
  timeout: 120000,
})

// Qualidade `ultra`: é o único perfil com SSAO + bloom + raios de sol ligados
// ao mesmo tempo. Medir em `high` deixaria o SSAO de fora do diagnóstico.
await pagina.evaluate(async () => {
  window.__roquecraft.setQuality('ultra')
  await new Promise((r) => setTimeout(r, 2500))
})
await pagina.evaluate(async () => {
  const rc = window.__roquecraft
  const h = rc.surfaceAt(0, 0)
  rc.teleport(0.5, (Number.isFinite(h) ? h : 66) + 40, 0.5)
  rc.setFlying(true)
  await rc.waitChunks(5)
})
await pagina.waitForTimeout(2500)

// Analisador dentro da página: nada de 3,7 MB de pixels atravessando JSON.
await pagina.evaluate(() => {
  const tela = () => document.querySelector('canvas.rc-canvas') || document.querySelector('canvas')
  window.__ler = function () {
    const c = tela()
    const off = document.createElement('canvas')
    off.width = c.width
    off.height = c.height
    off.getContext('2d').drawImage(c, 0, 0)
    return {
      w: c.width,
      h: c.height,
      d: off.getContext('2d').getImageData(0, 0, c.width, c.height).data,
    }
  }
  window.__diferenca = function (a, b) {
    // b - a, em luminância. Só o que o pós ACRESCENTOU interessa.
    const n = a.w * a.h
    const dif = new Float32Array(n)
    let soma = 0
    let pico = 0
    for (let i = 0; i < n; i++) {
      const o = i * 4
      const la = (0.2126 * a.d[o] + 0.7152 * a.d[o + 1] + 0.0722 * a.d[o + 2]) / 255
      const lb = (0.2126 * b.d[o] + 0.7152 * b.d[o + 1] + 0.0722 * b.d[o + 2]) / 255
      const e = lb - la
      dif[i] = e
      if (e > 0) soma += e
      if (e > pico) pico = e
    }
    // componentes conexas do ganho, pra saber DE ONDE ele parte
    const LIM = 0.05
    const visto = new Uint8Array(n)
    const pilha = new Int32Array(n)
    const focos = []
    for (let i = 0; i < n; i++) {
      if (visto[i] || dif[i] <= LIM) continue
      let topo = 0
      pilha[topo++] = i
      visto[i] = 1
      let area = 0
      let sx = 0
      let sy = 0
      let pk = 0
      let sm = 0
      while (topo > 0) {
        const j = pilha[--topo]
        const x = j % a.w
        const y = (j / a.w) | 0
        area++
        sx += x
        sy += y
        sm += dif[j]
        if (dif[j] > pk) pk = dif[j]
        const viz = [
          x + 1 < a.w ? j + 1 : -1,
          x > 0 ? j - 1 : -1,
          y + 1 < a.h ? j + a.w : -1,
          y > 0 ? j - a.w : -1,
        ]
        for (const v of viz) {
          if (v < 0 || visto[v] || dif[v] <= LIM) continue
          visto[v] = 1
          pilha[topo++] = v
        }
      }
      if (area < 300) continue
      focos.push({
        x: Math.round(sx / area),
        y: Math.round(sy / area),
        area,
        fracTela: +(area / n).toFixed(4),
        pico: +pk.toFixed(3),
        medio: +(sm / area).toFixed(3),
      })
    }
    focos.sort((p, q) => q.area - p.area)
    // BORDA vs MIOLO. O artefato clássico de raio de sol com `clamp(uv,0,1)`
    // é uma barra colada na BORDA da tela: quando a marcha radial sai do
    // quadro, ela reamostra o mesmo texel da borda dezenas de vezes. Separar
    // as duas médias é o que distingue "bloom levantou o céu inteiro" de
    // "apareceu uma barra de luz onde não há fonte".
    const mb = Math.round(Math.min(a.w, a.h) * 0.06)
    let sB = 0
    let nB = 0
    let sM = 0
    let nM = 0
    for (let y = 0; y < a.h; y++) {
      for (let x = 0; x < a.w; x++) {
        const naBorda = x < mb || y < mb || x >= a.w - mb || y >= a.h - mb
        const noMiolo = x > a.w * 0.25 && x < a.w * 0.75 && y > a.h * 0.25 && y < a.h * 0.75
        if (naBorda) {
          sB += dif[y * a.w + x]
          nB++
        } else if (noMiolo) {
          sM += dif[y * a.w + x]
          nM++
        }
      }
    }
    return {
      w: a.w,
      h: a.h,
      ganhoMedio: +(soma / n).toFixed(4),
      ganhoPico: +pico.toFixed(3),
      ganhoBorda: +(sB / Math.max(1, nB)).toFixed(4),
      ganhoMiolo: +(sM / Math.max(1, nM)).toFixed(4),
      focos: focos.slice(0, 6),
      nFocos: focos.length,
    }
  }
  // Onde está o sol NA TELA (se estiver). Pixel mais claro do quadro sem pós.
  //
  // Só os 55% de cima: a MÃO em primeira pessoa mora no canto inferior direito,
  // é desenhada fora do composer e tem pixels acima de 0,9 sempre. Procurando
  // no quadro inteiro, "o sol está visível" dava verdadeiro até de costas pra
  // ele — a medida estava achando a manga da camisa.
  window.__solNaTela = function (q) {
    let melhor = 0
    let bx = -1
    let by = -1
    const ate = Math.floor(q.w * q.h * 0.55)
    for (let i = 0; i < ate; i++) {
      const o = i * 4
      const l = (0.2126 * q.d[o] + 0.7152 * q.d[o + 1] + 0.0722 * q.d[o + 2]) / 255
      if (l > melhor) {
        melhor = l
        bx = i % q.w
        by = (i / q.w) | 0
      }
    }
    return { lum: +melhor.toFixed(3), x: bx, y: by }
  }
  // Um par de quadros COM A MESMA configuração. Tudo que aparecer aqui é
  // ruído de quadro (a mão balança entre as duas capturas, por exemplo) e não
  // pode ser creditado ao pós-processamento.
  window.__controle = async function () {
    const rc = window.__roquecraft
    rc.setFx({ post: false })
    await new Promise((r) => setTimeout(r, 260))
    const a = window.__ler()
    await new Promise((r) => setTimeout(r, 260))
    const b = window.__ler()
    return window.__diferenca(a, b)
  }
})

const MOMENTOS = [
  { nome: 'nascer', ticks: 700 },
  { nome: 'manha', ticks: 3000 },
  { nome: 'meio-dia', ticks: 6000 },
  { nome: 'poente', ticks: 11800 },
  { nome: 'crepusculo', ticks: 13000 },
  { nome: 'noite', ticks: 16000 },
]
// Olhares: o sol nasce e se põe no plano (0.94, *, 0.34). Varremos o círculo
// inteiro pra pegar o caso "sol fora do quadro" — que é o suspeito principal.
const OLHARES = [0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75].map((k) => ({
  nome: `yaw${Math.round(k * 180)}`,
  yaw: k * Math.PI,
  pitch: 0.25,
}))

const relatorio = { semente: SEMENTE, medidas: [], varredura: [], erros }

// `alvo` = o passe a isolar: 'tudo', 'raios' ou 'bloom'. Com os interruptores
// por passe (`setFx({godRays, bloom, ssao})`) dá pra atribuir o ganho a UM
// efeito. Sem eles o número é a soma de três coisas e não acusa ninguém.
const medir = (ticks, yaw, pitch, alvo = 'tudo') =>
  pagina.evaluate(
    async ({ ticks, yaw, pitch, alvo }) => {
      const rc = window.__roquecraft
      rc.setTime(ticks)
      rc.look(yaw, pitch)
      // mundo fora: só o céu. Assim o ganho medido é o que o pós faz NO CÉU.
      rc.setFx({ solid: false, water: false, fog: false })
      const so = {
        tudo: { godRays: true, bloom: true, ssao: true },
        raios: { godRays: true, bloom: false, ssao: false },
        bloom: { godRays: false, bloom: true, ssao: false },
      }[alvo]
      const nada = { godRays: false, bloom: false, ssao: false }
      await new Promise((r) => setTimeout(r, 300))
      const ctrl = await window.__controle()
      rc.setFx({ post: true, ...nada })
      await new Promise((r) => setTimeout(r, 300))
      const sem = window.__ler()
      rc.setFx({ post: true, ...so })
      await new Promise((r) => setTimeout(r, 300))
      const com = window.__ler()
      const d = window.__diferenca(sem, com)
      const sol = window.__solNaTela(sem)
      rc.setFx({ solid: true, water: true, fog: true, godRays: true, bloom: true, ssao: true })
      return {
        ...d,
        sol,
        // descontado do ruído de quadro medido no controle
        ganhoBordaLiq: +(d.ganhoBorda - ctrl.ganhoBorda).toFixed(4),
        ganhoMioloLiq: +(d.ganhoMiolo - ctrl.ganhoMiolo).toFixed(4),
        ruidoControle: { borda: ctrl.ganhoBorda, miolo: ctrl.ganhoMiolo, focos: ctrl.nFocos },
      }
    },
    { ticks, yaw, pitch, alvo },
  )

for (const m of MOMENTOS) {
  for (const o of OLHARES) {
    const r = await medir(m.ticks, o.yaw, o.pitch)
    relatorio.medidas.push({ momento: m.nome, ticks: m.ticks, olhar: o.nome, ...r })
  }
}

// ── O EXPERIMENTO DECISIVO ────────────────────────────────────────────────
//
// Os raios de sol ligam quando `sunVec · frenteDaCâmera > 0.05` — ou seja, até
// 87° fora do eixo. Mas o sol só APARECE no quadro até ~55° (72° de FOV
// vertical, 16:9). Entre 55° e 87° o passe desenha raios convergindo pra um
// ponto que não está na tela, e a marcha bate no `clamp(uv,0,1)`.
//
// Então: hora fixa com o sol alto, e a câmera girando de 0 a 180° a partir do
// azimute do sol. Se a hipótese estiver certa, o ganho na BORDA sobe justamente
// na faixa em que o sol JÁ SAIU do quadro e ainda não passou dos 87°.
// A CÂMERA ACOMPANHA A ELEVAÇÃO DO SOL. Na primeira tentativa a varredura usou
// pitch 0.2 fixo, e com o sol a 45° o produto escalar já nascia baixo: a janela
// que eu queria observar praticamente não existia naquele arranjo. Olhando NA
// ALTURA do sol, `sunVec · frente = 0.5·cos(Δ) + 0.5`, que passa de 0.05 até
// Δ = 155° — o sol sai do quadro em ~50° e os raios seguiam ligados por mais
// 105° de giro. É essa janela que o conserto tinha que fechar.
{
  const ticks = 3000
  const azSol = Math.atan2(0.94, 0.34) // o plano do sol é (0.94, *, 0.34)
  const elSol = Math.asin(Math.sin((3000 / 24000) * Math.PI * 2))
  for (let g = 0; g <= 180; g += 15) {
    const yaw = azSol + (g * Math.PI) / 180
    const r = await medir(ticks, yaw, elSol, 'raios')
    relatorio.varredura.push({
      grausDoSol: g,
      solVisivel: r.sol.lum > 0.9,
      solNaTela: r.sol,
      ganhoBordaLiq: r.ganhoBordaLiq,
      ganhoMioloLiq: r.ganhoMioloLiq,
      razaoBordaMiolo: +(r.ganhoBordaLiq / Math.max(1e-4, r.ganhoMioloLiq)).toFixed(2),
      ganhoPico: r.ganhoPico,
    })
  }
}

// ── prova de vida: o sol TEM que aparecer na diferença ─────────────────────
// Olhando direto pro sol ao meio-dia, com bloom e raios ligados, o ganho tem
// que ser grande. Se for zero, a sonda está cega.
const vida = await pagina.evaluate(async () => {
  const rc = window.__roquecraft
  rc.setTime(6000)
  rc.look(0.34, 1.35) // quase a pino
  rc.setFx({ solid: false, water: false, fog: false })
  await new Promise((r) => setTimeout(r, 300))
  rc.setFx({ post: false })
  await new Promise((r) => setTimeout(r, 300))
  const sem = window.__ler()
  rc.setFx({ post: true })
  await new Promise((r) => setTimeout(r, 300))
  const com = window.__ler()
  const d = window.__diferenca(sem, com)
  rc.setFx({ solid: true, water: true, fog: true })
  return d
})
relatorio.vida = {
  ...vida,
  veredito: vida.ganhoPico > 0.05 ? 'ENXERGA' : 'CEGA — o relatório não vale',
}

// fotos do pior caso pra olhar depois
const pior = [...relatorio.medidas].sort((a, b) => b.ganhoMedio - a.ganhoMedio)[0]
if (pior) {
  await pagina.evaluate(
    async ({ ticks, yaw }) => {
      const rc = window.__roquecraft
      rc.setTime(ticks)
      rc.look(yaw, 0.25)
      rc.setFx({ solid: false, water: false, fog: false, post: true })
      await new Promise((r) => setTimeout(r, 400))
    },
    { ticks: pior.ticks, yaw: (Number(pior.olhar.replace('yaw', '')) * Math.PI) / 180 },
  )
  fs.writeFileSync(
    path.join(OUT, `pos-pior-${pior.momento}-${pior.olhar}.png`),
    await pagina.screenshot(),
  )
  await pagina.evaluate(async () => {
    window.__roquecraft.setFx({ post: false })
    await new Promise((r) => setTimeout(r, 400))
  })
  fs.writeFileSync(
    path.join(OUT, `pos-pior-${pior.momento}-${pior.olhar}-sem-post.png`),
    await pagina.screenshot(),
  )
  relatorio.pior = pior
}

fs.writeFileSync(path.join(OUT, 'relatorio-pos.json'), JSON.stringify(relatorio, null, 2))
console.log(JSON.stringify(relatorio, null, 2))
await navegador.close()
servidor.close()
