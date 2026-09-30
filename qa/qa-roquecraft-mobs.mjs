//
// TURNTABLE DOS PERSONAGENS.
//
// A spec (`mobModelo.spec.js`) afirma o que é geometria: frente, altura, pivô,
// fase do passo. O que ela NÃO decide é se a vaca parece uma vaca. Isso precisa
// de olho, e olho precisa de imagem — de vários ângulos, porque um bicho de
// costas parece certo de frente.
//
// Serve o repo cru e importa o módulo do jogo direto no navegador via
// import-map. Sem bundler no caminho: o que aparece aqui é o mesmo código que
// vai pro jogo, não uma cópia que pode divergir.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const RAIZ = path.resolve('.')
const OUT = path.resolve('scripts/.qa-mobs')
fs.mkdirSync(OUT, { recursive: true })

const TIPOS = (process.argv[2] || 'pig,cow,sheep,chicken,zombie,skeleton,spider').split(',')

const MIME = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.html': 'text/html',
  '.json': 'application/json',
}
const srv = http.createServer((q, r) => {
  const p = decodeURIComponent((q.url || '/').split('?')[0])
  let f = path.join(RAIZ, p)
  // O código do jogo importa sem extensão (`../skins`), porque o bundler
  // resolve. O navegador não resolve: pede /src/.../skins e leva 404, o módulo
  // inteiro não carrega e a página fica muda. Resolver aqui é o que permite
  // servir a FONTE DE VERDADE em vez de uma cópia adaptada pro teste.
  if (!path.extname(f) && fs.existsSync(`${f}.js`)) f = `${f}.js`
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    r.statusCode = 404
    return r.end('nao')
  }
  r.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream')
  fs.createReadStream(f).pipe(r)
})
await new Promise((r) => srv.listen(0, r))
const base = `http://localhost:${srv.address().port}`

// ⚠️ SEM CRASE AQUI DENTRO. A página inteira é um template literal: uma crase
// num comentário fecha a string e o arquivo nem carrega. Já mordeu em GLSL, no
// shell e agora aqui — o padrão é sempre o mesmo, código dentro de string.
const PAGINA = `<!doctype html><html><head><meta charset="utf-8">
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/":"/node_modules/three/"}}</script>
<style>html,body{margin:0;background:#20242b}canvas{display:block}</style>
</head><body>
<script type="module">
import * as THREE from 'three'
import { buildMobModel } from '/src/servicos/render/entities.js'
import { MOB_TYPES } from '/src/servicos/mobs.js'

const cena = new THREE.Scene()
cena.background = new THREE.Color(0x20242b)
cena.add(new THREE.HemisphereLight(0xcfe3ff, 0x4a4230, 1.5))
const sol = new THREE.DirectionalLight(0xfff2dd, 2.1)
sol.position.set(4, 8, 6)
cena.add(sol)

// Chão quadriculado de 1 m: dá escala e mostra na hora se o pé afunda ou paira.
const grade = new THREE.GridHelper(8, 8, 0x5a6472, 0x394050)
cena.add(grade)

const cam = new THREE.PerspectiveCamera(38, 1, 0.05, 60)
const rend = new THREE.WebGLRenderer({ antialias: true })
rend.setSize(520, 520, false)
document.body.appendChild(rend.domElement)

let atual = null
window.__mobs = {
  // Põe UM bicho em cena e enquadra pela caixa dele.
  por(tipo) {
    if (atual) cena.remove(atual)
    atual = buildMobModel(tipo, false)
    cena.add(atual)
    return MOB_TYPES[tipo]
  },
  // Ângulo da CÂMERA ao redor do bicho, em graus. 0 = de frente pra cara dele.
  olhar(graus, alturaRel = 0.55, dist = 2.6) {
    const b = new THREE.Box3().setFromObject(atual)
    const alvoY = b.max.y * alturaRel
    const r = Math.max(dist, b.max.y * 2.1)
    const a = (graus * Math.PI) / 180
    // o bicho olha pra +Z, então a câmera em graus=0 fica no +Z olhando pra ele
    cam.position.set(Math.sin(a) * r, alvoY + b.max.y * 0.55, Math.cos(a) * r)
    cam.lookAt(0, alvoY, 0)
    rend.render(cena, cam)
  },
  // Congela o ciclo de passo num instante 0..1 pra fotografar a passada.
  passo(t) {
    for (const p of atual.userData.andar || []) {
      p.mesh.rotation[p.eixo] = Math.sin(t * Math.PI * 2 + p.fase) * p.amp
    }
  },
  caixa() {
    const b = new THREE.Box3().setFromObject(atual)
    return { minY: b.min.y, maxY: b.max.y, larg: b.max.x - b.min.x, comp: b.max.z - b.min.z }
  },
  // Inventário das peças: tamanho e posição de cada caixa do bicho.
  //
  // Serve pra achar erro de proporção sem depender de olho — peça dentro de
  // outra, orelha maior que a cabeça, focinho que não encosta no rosto. O olho
  // continua sendo quem decide se a vaca parece uma vaca; isto é o que dá pra
  // afirmar por número.
  pecas() {
    const out = []
    atual.updateMatrixWorld(true)
    atual.traverse((o) => {
      if (!o.isMesh) return
      o.geometry.computeBoundingBox()
      const g = o.geometry.boundingBox
      const p = new THREE.Vector3()
      o.getWorldPosition(p)
      out.push({
        t: [+(g.max.x - g.min.x).toFixed(2), +(g.max.y - g.min.y).toFixed(2), +(g.max.z - g.min.z).toFixed(2)],
        p: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)],
        cor: '#' + o.material.color.getHexString(),
      })
    })
    return out
  },
}
window.__pronto = true
</script></body></html>`

fs.writeFileSync(path.join(RAIZ, '.qa-mobs.html'), PAGINA)

const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] })
const page = await b.newPage({ viewport: { width: 560, height: 560 } })
const erros = []
page.on('pageerror', (e) => erros.push(e.message.slice(0, 200)))
page.on('console', (m) => {
  if (m.type() === 'error') erros.push(m.text().slice(0, 200))
})
await page.goto(`${base}/.qa-mobs.html`, { waitUntil: 'domcontentloaded' })
try {
  await page.waitForFunction(() => window.__pronto === true, null, { timeout: 30000 })
} catch {
  // Sem isto a falha vira só "timeout" e some o motivo — que da primeira vez
  // era um 404 de import sem extensão, invisível no erro do Playwright.
  console.error('a página não ficou pronta. erros:', JSON.stringify(erros, null, 2))
  await b.close()
  srv.close()
  process.exit(1)
}

const ANGULOS = [
  [0, 'frente'],
  [90, 'lado'],
  [180, 'tras'],
  [225, 'tres-quartos'],
]

const relato = []
for (const tipo of TIPOS) {
  const def = await page.evaluate((t) => window.__mobs.por(t), tipo)
  const caixa = await page.evaluate(() => window.__mobs.caixa())
  const pecas = await page.evaluate(() => window.__mobs.pecas())
  for (const [g, nome] of ANGULOS) {
    await page.evaluate(([gg]) => window.__mobs.olhar(gg), [g])
    await page.locator('canvas').screenshot({ path: path.join(OUT, `${tipo}-${nome}.png`) })
  }
  // Tira de passada: 4 instantes do ciclo, sempre do mesmo ângulo de perfil.
  for (let i = 0; i < 4; i++) {
    await page.evaluate(
      ([t]) => {
        window.__mobs.passo(t)
        window.__mobs.olhar(90)
      },
      [i / 4],
    )
    await page.locator('canvas').screenshot({ path: path.join(OUT, `${tipo}-passo${i}.png`) })
  }
  await page.evaluate(() => window.__mobs.passo(0))
  relato.push({
    tipo,
    caixaColisao: { alt: def.height, larg: def.width },
    modelo: {
      alt: +caixa.maxY.toFixed(2),
      pe: +caixa.minY.toFixed(3),
      larg: +caixa.larg.toFixed(2),
      comp: +caixa.comp.toFixed(2),
    },
    razaoAltura: +(caixa.maxY / def.height).toFixed(2),
    pecas,
  })
}

await b.close()
srv.close()
fs.rmSync(path.join(RAIZ, '.qa-mobs.html'), { force: true })
console.log(JSON.stringify({ erros, relato }, null, 2))
