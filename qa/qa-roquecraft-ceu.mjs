//
// SONDA DO CÉU — mede o shader do céu direção por direção, sem jogo em volta.
//
// Por que não um print do jogo: um print mostra 72° de céu de um ponto só. O
// founder relatou "brilhos estranhos que partem de uns pontos do céu". Pra
// achar PONTOS é preciso varrer a ESFERA INTEIRA, e é preciso saber a direção
// exata de cada achado — coisa que print nenhum dá.
//
// Esta sonda pega o texto REAL de SKY_FRAG do módulo sky.js (não uma cópia),
// resolve as constantes interpoladas, compila num quad onde vDir vem de um mapa
// equirretangular, aplica o MESMO tonemap ACES + sRGB do renderer, e mede:
//
//   1. manchas   — regiões conexas com excesso de luz sobre o fundo local,
//                  com direção (azimute/elevação) e ÁREA EM ÂNGULO SÓLIDO.
//                  Sol e lua saem por cone.
//   2. estrelas  — quantas, de que diâmetro angular, e quão REDONDAS. A versão
//                  antiga pintava a célula inteira de uma grade cartesiana:
//                  as estrelas saíam quadradas e triangulares, alinhadas ao
//                  eixo. Redondeza é a medida que pega isso.
//   3. nuvens    — que fração do céu acima do horizonte tem nuvem, e se essa
//                  fração RESPONDE ao parâmetro de cobertura.
//
// PROVA DE VIDA (--vida), sem a qual nenhum zero aqui vale nada:
//   (a) um brilho gaussiano falso plantado numa direção conhecida — o detector
//       de manchas TEM que achar naquela direção;
//   (b) nuvem desligada TEM que dar cobertura zero, e cobertura alta TEM que
//       dar muito mais nuvem que cobertura baixa. Se as duas derem igual, o
//       campo de nuvem é constante — que era exatamente o defeito de 23/08.
//
//   node scripts/qa-roquecraft-ceu.mjs [--vida] [--fotos] [--saida NOME]
//
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const iSaida = process.argv.indexOf('--saida')
const SAIDA = path.join(RAIZ, 'scripts', '.qa-ceu', iSaida > 0 ? process.argv[iSaida + 1] : 'mapa')
fs.mkdirSync(SAIDA, { recursive: true })

const { skyPalette, lightRig, sunDirection, moonDirection, moonPhase } = await import(
  path.join(RAIZ, 'src/services/roquecraft/daycycle.js')
)

const COM_VIDA = process.argv.includes('--vida')
const COM_FOTOS = process.argv.includes('--fotos')

// ── o shader REAL, lido do módulo ──────────────────────────────────────────
const FONTE = fs.readFileSync(path.join(RAIZ, 'src/services/roquecraft/render/sky.js'), 'utf8')
const CRASE = String.fromCharCode(96)
function bloco(nome) {
  const marca = 'const ' + nome + ' = /* glsl */ '
  const i = FONTE.indexOf(marca)
  if (i < 0) throw new Error('não achei ' + nome + ' em sky.js')
  const ini = FONTE.indexOf(CRASE, i) + 1
  const fim = FONTE.indexOf(CRASE, ini)
  if (fim < 0) throw new Error('bloco ' + nome + ' sem fecho')
  return FONTE.slice(ini, fim)
}
// O shader interpola constantes exportadas pra que cada número exista UMA vez
// só em JS. A sonda lê texto cru, então resolve a interpolação lendo os mesmos
// `export const` do arquivo — sem importar o módulo, que puxaria o three.
const CONSTANTES = {}
for (const m of FONTE.matchAll(/export const (\w+) = ([\d.]+)/g)) {
  CONSTANTES[m[1]] = Number(m[2])
}
function resolver(txt) {
  return txt.replace(/\$\{(\w+)\.toFixed\((\d+)\)\}/g, (_, nome, casas) => {
    if (typeof CONSTANTES[nome] !== 'number') {
      throw new Error('sky.js não exporta a constante ' + nome)
    }
    return CONSTANTES[nome].toFixed(Number(casas))
  })
}
const SKY_FRAG = resolver(bloco('SKY_FRAG'))

// ── tonemap: cópia VERBATIM do chunk do three r171 ─────────────────────────
// (three/src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js)
const TONEMAP = [
  'uniform float toneMappingExposure;',
  'vec3 RRTAndODTFit( vec3 v ) {',
  '  vec3 a = v * ( v + 0.0245786 ) - 0.000090537;',
  '  vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;',
  '  return a / b;',
  '}',
  'vec3 ACESFilmicToneMapping( vec3 color ) {',
  '  const mat3 ACESInputMat = mat3(',
  '    vec3( 0.59719, 0.07600, 0.02840 ),',
  '    vec3( 0.35458, 0.90834, 0.13383 ),',
  '    vec3( 0.04823, 0.01566, 0.83777 ) );',
  '  const mat3 ACESOutputMat = mat3(',
  '    vec3(  1.60475, -0.10208, -0.00327 ),',
  '    vec3( -0.53108,  1.10813, -0.07276 ),',
  '    vec3( -0.07367, -0.00605,  1.07602 ) );',
  '  color *= toneMappingExposure / 0.6;',
  '  color = ACESInputMat * color;',
  '  color = RRTAndODTFit( color );',
  '  color = ACESOutputMat * color;',
  '  return clamp( color, 0.0, 1.0 );',
  '}',
  'vec4 sRGBTransferOETF( in vec4 value ) {',
  '  return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ),',
  '                    value.rgb * 12.92,',
  '                    vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );',
  '}',
].join('\n')

function montarFragmento({ vida = false, gnomonico = false } = {}) {
  let corpo = SKY_FRAG
  corpo = corpo.replace('varying vec3 vDir;', '') // o wrapper entrega vDir
  corpo = corpo.replace(
    '#include <tonemapping_fragment>',
    'gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );',
  )
  corpo = corpo.replace(
    '#include <colorspace_fragment>',
    'gl_FragColor = sRGBTransferOETF( gl_FragColor );',
  )
  if (vida) {
    // PROVA DE VIDA: brilho gaussiano plantado em azimute 137°, elevação 41°.
    corpo = corpo.replace(
      'gl_FragColor = vec4(col, 1.0);',
      [
        '{',
        '  vec3 alvoV = vec3(cos(0.7155) * sin(2.3911), sin(0.7155), cos(0.7155) * cos(2.3911));',
        '  float angV = acos(clamp(dot(d, alvoV), -1.0, 1.0));',
        '  col += vec3(1.0, 0.85, 0.6) * exp(-angV * angV / 0.0009) * 2.0;',
        '}',
        'gl_FragColor = vec4(col, 1.0);',
      ].join('\n'),
    )
  }
  const mapa = gnomonico
    ? // LENTE: projeção gnomônica (o que uma câmera de verdade vê) centrada em
      // uCentro, com abertura uFov. É a única forma de olhar UM ponto do céu
      // com resolução angular maior que a do mapa inteiro.
      [
        '  vec3 f = normalize(uCentro);',
        '  vec3 r = normalize(cross(f, abs(f.y) > 0.99 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0)));',
        '  vec3 u = cross(r, f);',
        '  vec2 sxy = (vUv * 2.0 - 1.0) * tan(uFov * 0.5);',
        '  sxy.x *= uAspecto;',
        '  corpoDoCeu(normalize(f + r * sxy.x + u * sxy.y));',
      ].join('\n')
    : [
        '  float az = (vUv.x - 0.5) * 6.28318530718;',
        '  float el = mix(uElMin, uElMax, vUv.y);',
        '  corpoDoCeu(vec3(cos(el) * sin(az), sin(el), cos(el) * cos(az)));',
      ].join('\n')
  return [
    'precision highp float;',
    'varying vec2 vUv;',
    'uniform float uElMin;',
    'uniform float uElMax;',
    'uniform vec3 uCentro;',
    'uniform float uFov;',
    'uniform float uAspecto;',
    TONEMAP,
    corpo.replace('void main() {', 'void corpoDoCeu(vec3 vDir) {'),
    'void main() {',
    mapa,
    '}',
  ].join('\n')
}

const VERT = [
  'attribute vec2 aPos;',
  'varying vec2 vUv;',
  'void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }',
].join('\n')

const MOMENTOS = [
  { nome: 'amanhecer', ticks: 0 },
  { nome: 'manha', ticks: 2400 },
  { nome: 'meio-dia', ticks: 6000 },
  { nome: 'tarde', ticks: 10000 },
  { nome: 'poente', ticks: 12000 },
  { nome: 'crepusculo', ticks: 13200 },
  { nome: 'noite', ticks: 15000 },
  { nome: 'meia-noite', ticks: 18000 },
  { nome: 'madrugada', ticks: 21600 },
]

function estado(ticks, extra = {}) {
  const p = skyPalette(ticks)
  const r = lightRig(ticks)
  const s = sunDirection(ticks)
  const m = moonDirection(ticks)
  const dia = 1 - r.stars
  const brilho = 0.2 + dia * 0.8
  return {
    ticks,
    zenith: p.zenith,
    horizon: p.horizon,
    sun: p.sun,
    sunDir: [s.x, s.y, s.z],
    moonDir: [m.x, m.y, m.z],
    stars: r.stars,
    moonPhase: moonPhase(ticks) / 8,
    exposure: r.exposure,
    // Espelha `sky.update()`: se estes divergirem, a sonda mede outro céu.
    cloudQ: 2,
    cover: 0.36,
    cloudOpacity: 0.72 + dia * 0.18,
    cloudLit: [
      (p.sun[0] * 0.82 + 0.2) * brilho,
      (p.sun[1] * 0.82 + 0.2) * brilho,
      (p.sun[2] * 0.82 + 0.22) * brilho,
    ],
    cloudShadow: [
      (p.zenith[0] * 0.7 + 0.1) * brilho,
      (p.zenith[1] * 0.7 + 0.11) * brilho,
      (p.zenith[2] * 0.7 + 0.15) * brilho,
    ],
    ...extra,
  }
}

const L = 2048
const A = 640
const EL_MIN = (-12 * Math.PI) / 180
const EL_MAX = (Math.PI / 2) * 0.999
// Ângulo por pixel do MAPA, pra que o antialias do disco case com a amostragem.
const PIXEL_ANG = ((EL_MAX - EL_MIN) / A) * 0.5

const navegador = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const pagina = await navegador.newPage()
const erros = []
pagina.on('pageerror', (e) => erros.push(String(e.message).slice(0, 300)))
pagina.on('console', (m) => {
  if (m.type() === 'error') erros.push(m.text().slice(0, 300))
})
await pagina.setContent('<canvas id="c"></canvas>')

const preparado = await pagina.evaluate(
  ({ vert, frag, L, A }) => {
    const cv = document.getElementById('c')
    cv.width = L
    cv.height = A
    const gl = cv.getContext('webgl', { preserveDrawingBuffer: true, antialias: false })
    if (!gl) return { ok: false, erro: 'sem contexto webgl' }
    window.__gl = gl
    window.__compilar = (fonte) => {
      const cs = (tipo, src) => {
        const s = gl.createShader(tipo)
        gl.shaderSource(s, src)
        gl.compileShader(s)
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s))
        return s
      }
      const p = gl.createProgram()
      gl.attachShader(p, cs(gl.VERTEX_SHADER, vert))
      gl.attachShader(p, cs(gl.FRAGMENT_SHADER, fonte))
      gl.bindAttribLocation(p, 0, 'aPos')
      gl.linkProgram(p)
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p))
      return p
    }
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.viewport(0, 0, L, A)
    try {
      window.__prog = { real: window.__compilar(frag) }
      return { ok: true }
    } catch (e) {
      return { ok: false, erro: String(e.message).slice(0, 1200) }
    }
  },
  { vert: VERT, frag: montarFragmento(), L, A },
)
if (!preparado.ok) {
  console.error('SHADER NAO COMPILOU:\n' + preparado.erro)
  await navegador.close()
  process.exit(1)
}

await pagina.evaluate(
  ({ L, A, EL_MIN, EL_MAX, PIXEL_ANG }) => {
    const ELdeY = (y) => EL_MIN + ((EL_MAX - EL_MIN) * (y + 0.5)) / A
    const AZdeX = (x) => ((x + 0.5) / L - 0.5) * Math.PI * 2

    window.__desenhar = function (prog, est) {
      const gl = window.__gl
      gl.useProgram(prog)
      const u = (n) => gl.getUniformLocation(prog, n)
      gl.uniform1f(u('uElMin'), EL_MIN)
      gl.uniform1f(u('uElMax'), EL_MAX)
      gl.uniform3fv(u('uCentro'), est.centro || [0, 1, 0])
      gl.uniform1f(u('uFov'), est.fov || 0.35)
      gl.uniform1f(u('uAspecto'), L / A)
      gl.uniform3fv(u('uZenith'), est.zenith)
      gl.uniform3fv(u('uHorizon'), est.horizon)
      gl.uniform3fv(u('uSunColor'), est.sun)
      gl.uniform3fv(u('uSunDir'), est.sunDir)
      gl.uniform3fv(u('uMoonDir'), est.moonDir)
      gl.uniform1f(u('uStars'), est.stars)
      gl.uniform1f(u('uMoonPhase'), est.moonPhase)
      gl.uniform1f(u('uTime'), 12.5)
      gl.uniform1f(u('uPixelAng'), est.pixelAng === undefined ? PIXEL_ANG : est.pixelAng)
      gl.uniform1f(u('uCloudQ'), est.cloudQ)
      gl.uniform1f(u('uCover'), est.cover)
      gl.uniform1f(u('uCloudOpacity'), est.cloudOpacity)
      gl.uniform3fv(u('uCloudLit'), est.cloudLit)
      gl.uniform3fv(u('uCloudShadow'), est.cloudShadow)
      gl.uniform2fv(u('uWind'), [0.00042, 0.00017])
      gl.uniform1f(u('toneMappingExposure'), est.exposure)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      gl.finish()
    }

    window.__pixels = function () {
      const gl = window.__gl
      const px = new Uint8Array(L * A * 4)
      gl.readPixels(0, 0, L, A, gl.RGBA, gl.UNSIGNED_BYTE, px)
      const lum = new Float32Array(L * A)
      for (let i = 0, n = L * A; i < n; i++) {
        const o = i * 4
        lum[i] = (0.2126 * px[o] + 0.7152 * px[o + 1] + 0.0722 * px[o + 2]) / 255
      }
      return lum
    }

    window.__medir = function (est, guardarPng) {
      const lum = window.__pixels()

      // fundo local: média em caixa 2R+1, azimute circular
      const R = 40
      const somaX = new Float32Array(L * A)
      for (let y = 0; y < A; y++) {
        const b = y * L
        let acc = 0
        for (let k = -R; k <= R; k++) acc += lum[b + ((k + L) % L)]
        somaX[b] = acc
        for (let x = 1; x < L; x++) {
          acc += lum[b + ((x + R) % L)] - lum[b + ((x - R - 1 + L) % L)]
          somaX[b + x] = acc
        }
      }
      const fundo = new Float32Array(L * A)
      for (let x = 0; x < L; x++) {
        for (let y = 0; y < A; y++) {
          let acc = 0
          let n = 0
          for (let k = -R; k <= R; k++) {
            const yy = y + k
            if (yy < 0 || yy >= A) continue
            acc += somaX[yy * L + x]
            n += 2 * R + 1
          }
          fundo[y * L + x] = acc / n
        }
      }
      const exc = new Float32Array(L * A)
      for (let i = 0, n = L * A; i < n; i++) exc[i] = lum[i] - fundo[i]

      const LIMIAR = 0.06
      const grauPxX = 360 / L
      const grauPxY = ((EL_MAX - EL_MIN) * 180) / Math.PI / A
      const visto = new Uint8Array(L * A)
      const pilha = new Int32Array(L * A)
      const manchas = []
      const estrelas = []
      for (let i = 0, n = L * A; i < n; i++) {
        if (visto[i] || exc[i] <= LIMIAR) continue
        let topo = 0
        pilha[topo++] = i
        visto[i] = 1
        let area = 0
        let sr = 0
        let pico = 0
        let somaE = 0
        let sx = 0
        let sy = 0
        let sz = 0
        let x0 = 1e9
        let x1 = -1e9
        let y0 = 1e9
        let y1 = -1e9
        while (topo > 0) {
          const j = pilha[--topo]
          const x = j % L
          const y = (j / L) | 0
          area++
          somaE += exc[j]
          if (lum[j] > pico) pico = lum[j]
          if (x < x0) x0 = x
          if (x > x1) x1 = x
          if (y < y0) y0 = y
          if (y > y1) y1 = y
          const el = ELdeY(y)
          const az = AZdeX(x)
          const w = Math.cos(el)
          sr += w
          sx += Math.cos(el) * Math.sin(az) * w
          sy += Math.sin(el) * w
          sz += Math.cos(el) * Math.cos(az) * w
          const viz = [
            ((x + 1) % L) + y * L,
            ((x - 1 + L) % L) + y * L,
            y + 1 < A ? x + (y + 1) * L : -1,
            y - 1 >= 0 ? x + (y - 1) * L : -1,
          ]
          for (const v of viz) {
            if (v < 0 || visto[v] || exc[v] <= LIMIAR) continue
            visto[v] = 1
            pilha[topo++] = v
          }
        }
        // ÁREA EM ÂNGULO SÓLIDO, não em pixels do mapa.
        //
        // Medir em pixels foi o primeiro erro desta sonda: perto do polo o
        // equirretangular estica 360° de azimute sobre um círculo de 3,8°, e
        // uma estrela vira um risco de 91 px. A sonda reportou "mancha de 2,87
        // graus2 no zênite" em três horários — e a bisseção mostrou que era
        // uma estrela comum. Com o peso cos(el) a mesma mancha dá 0,030
        // graus2, que é exatamente uma estrela.
        const grau2 = sr * grauPxX * grauPxY
        const m = Math.hypot(sx, sy, sz) || 1
        const dir = [sx / m, sy / m, sz / m]
        const el = Math.asin(Math.max(-1, Math.min(1, dir[1])))
        // Largura angular real da caixa: em azimute ela encolhe com cos(el).
        const largura = (x1 - x0 + 1) * grauPxX * Math.cos(el)
        const altura = (y1 - y0 + 1) * grauPxY
        const item = {
          dir,
          az: +((Math.atan2(dir[0], dir[2]) * 180) / Math.PI).toFixed(1),
          el: +((el * 180) / Math.PI).toFixed(1),
          grau2: +grau2.toFixed(4),
          diam: +Math.max(largura, altura).toFixed(3),
          // REDONDEZA: área da mancha sobre a área da caixa que a contém. Um
          // disco dá ~0,785 (pi/4); um quadrado alinhado ao eixo dá ~1,0; um
          // triângulo, ~0,5. É a medida que separa "ponto de luz" de "célula
          // de grade pintada inteira".
          redondeza: +(grau2 / Math.max(1e-9, largura * altura)).toFixed(3),
          pico: +pico.toFixed(3),
          excMedio: +(somaE / area).toFixed(3),
        }
        if (grau2 >= 0.6) manchas.push(item)
        else if (grau2 > 0.0008 && el > 0.35) estrelas.push(item)
      }
      const cos8 = Math.cos((8 * Math.PI) / 180)
      const perto = (d, alvo) => d[0] * alvo[0] + d[1] * alvo[1] + d[2] * alvo[2] > cos8
      const estranhas = manchas
        .filter((m) => !perto(m.dir, est.sunDir) && !perto(m.dir, est.moonDir))
        .sort((a, b) => b.grau2 - a.grau2)

      const mediana = (v) => (v.length ? v.slice().sort((a, b) => a - b)[v.length >> 1] : null)
      return {
        manchas: estranhas.slice(0, 10),
        totalManchas: estranhas.length,
        estrelas: {
          n: estrelas.length,
          diamMediano: mediana(estrelas.map((e) => e.diam)),
          redondezaMediana: mediana(estrelas.map((e) => e.redondeza)),
          picoMediano: mediana(estrelas.map((e) => e.pico)),
        },
        png: guardarPng ? document.getElementById('c').toDataURL('image/png') : null,
      }
    }

    // FORMA DAS ESTRELAS, medida na LENTE e não no mapa.
    //
    // No mapa equirretangular um pixel vale 0,159° e uma estrela mede 0,05° —
    // ela cabe num pixel, e qualquer medida de forma ali devolve "quadrado
    // perfeito" por construção. Foi o que a primeira versão desta função
    // reportou (redondeza 1,000 em todos os horários), e teria dado exatamente
    // o mesmo número pro campo velho, que era quadrado DE VERDADE. Medida que
    // não sabe distinguir os dois casos não é medida.
    //
    // Na lente a 6° sobre 2048 px, um pixel vale 0,0029° e a estrela ocupa ~17.
    window.__medirLente = function () {
      const lum = window.__pixels()
      // A lente aplica o aspecto no eixo X, então o grau-por-pixel é o mesmo
      // nos dois eixos e sai do FOV VERTICAL sobre a altura.
      const grauPx = 6 / A
      let fundo = 0
      for (let i = 0; i < L * A; i++) fundo += lum[i]
      fundo /= L * A
      const LIM = fundo + 0.05
      const visto = new Uint8Array(L * A)
      const pilha = new Int32Array(L * A)
      const achados = []
      for (let i = 0; i < L * A; i++) {
        if (visto[i] || lum[i] <= LIM) continue
        let topo = 0
        pilha[topo++] = i
        visto[i] = 1
        let area = 0
        let x0 = 1e9
        let x1 = -1e9
        let y0 = 1e9
        let y1 = -1e9
        let pico = 0
        while (topo > 0) {
          const j = pilha[--topo]
          const x = j % L
          const y = (j / L) | 0
          area++
          if (x < x0) x0 = x
          if (x > x1) x1 = x
          if (y < y0) y0 = y
          if (y > y1) y1 = y
          if (lum[j] > pico) pico = lum[j]
          const viz = [
            x + 1 < L ? j + 1 : -1,
            x > 0 ? j - 1 : -1,
            y + 1 < A ? j + L : -1,
            y > 0 ? j - L : -1,
          ]
          for (const v of viz) {
            if (v < 0 || visto[v] || lum[v] <= LIM) continue
            visto[v] = 1
            pilha[topo++] = v
          }
        }
        const w = x1 - x0 + 1
        const hh = y1 - y0 + 1
        if (area < 6 || w >= L * 0.5 || hh >= A * 0.5) continue
        achados.push({
          diam: +(Math.max(w, hh) * grauPx).toFixed(4),
          // disco ~0,785 (pi/4) · quadrado ~1,0 · triângulo ~0,5
          redondeza: +(area / (w * hh)).toFixed(3),
          alongamento: +(Math.max(w, hh) / Math.min(w, hh)).toFixed(2),
          pico: +pico.toFixed(3),
        })
      }
      const med = (v) => (v.length ? v.slice().sort((a, b) => a - b)[v.length >> 1] : null)
      return {
        n: achados.length,
        diamMediano: med(achados.map((a) => a.diam)),
        redondezaMediana: med(achados.map((a) => a.redondeza)),
        alongamentoMediano: med(achados.map((a) => a.alongamento)),
        picoMediano: med(achados.map((a) => a.pico)),
      }
    }

    // COBERTURA DE NUVEM: fração do céu acima de 6° em que ligar a nuvem muda
    // a cor de forma perceptível. Diferença, não julgamento de cor.
    window.__cobertura = function (est) {
      window.__desenhar(window.__prog.real, Object.assign({}, est, { cloudQ: 0 }))
      const sem = window.__pixels().slice()
      window.__desenhar(window.__prog.real, est)
      const com = window.__pixels()
      let n = 0
      let cob = 0
      for (let y = 0; y < A; y++) {
        const el = ELdeY(y)
        if (el < 0.105) continue
        const w = Math.cos(el)
        for (let x = 0; x < L; x++) {
          const i = y * L + x
          n += w
          if (Math.abs(com[i] - sem[i]) > 0.012) cob += w
        }
      }
      return +(cob / Math.max(1e-9, n)).toFixed(4)
    }
  },
  { L, A, EL_MIN, EL_MAX, PIXEL_ANG },
)

const relatorio = { momentos: [], vida: null, erros }

for (const m of MOMENTOS) {
  const est = estado(m.ticks)
  const r = await pagina.evaluate(
    ({ est }) => {
      // MANCHAS SEM NUVEM. Nuvem é uma mancha grande e clara por definição —
      // com ela ligada o detector reporta 90 "brilhos estranhos" por noite e o
      // número deixa de significar qualquer coisa. A pergunta "há brilho onde
      // não devia" é sobre os CORPOS do céu, então mede-se sem nuvem.
      window.__desenhar(window.__prog.real, Object.assign({}, est, { cloudQ: 0 }))
      const med = window.__medir(est, false)
      med.cobertura = window.__cobertura(est)
      // a foto guardada é a do céu COMPLETO, que é o que o jogador vê
      window.__desenhar(window.__prog.real, est)
      med.png = document.getElementById('c').toDataURL('image/png')
      return med
    },
    { est },
  )
  if (r.png) {
    fs.writeFileSync(
      path.join(SAIDA, `ceu-${m.nome}.png`),
      Buffer.from(r.png.split(',')[1], 'base64'),
    )
  }
  delete r.png
  relatorio.momentos.push({ nome: m.nome, ticks: m.ticks, uStars: +est.stars.toFixed(3), ...r })
}

// ── prova de vida ──────────────────────────────────────────────────────────
if (COM_VIDA) {
  const vida = {}
  const a = await pagina.evaluate(
    ({ fonte }) => {
      try {
        window.__prog.plantado = window.__compilar(fonte)
        return { ok: true }
      } catch (e) {
        return { ok: false, erro: String(e.message).slice(0, 800) }
      }
    },
    { fonte: montarFragmento({ vida: true }) },
  )
  if (!a.ok) vida.plantado = { erro: a.erro }
  else {
    const est = estado(18000, { cloudQ: 0 })
    const r = await pagina.evaluate(
      ({ est }) => {
        window.__desenhar(window.__prog.plantado, est)
        return window.__medir(est, false)
      },
      { est },
    )
    const alvo = { az: 137, el: 41 }
    const achou = r.manchas.find(
      (x) => Math.abs(((x.az - alvo.az + 540) % 360) - 180) < 4 && Math.abs(x.el - alvo.el) < 4,
    )
    vida.plantado = {
      esperado: alvo,
      achou: achou || null,
      veredito: achou ? 'DETECTOU' : 'CEGO — o instrumento não vale',
    }
  }

  // Nuvem: desligada tem que dar zero; e a cobertura tem que RESPONDER ao
  // parâmetro. O defeito de 23/08 era justamente um campo constante.
  const base = estado(6000)
  const nuvem = await pagina.evaluate(
    ({ base }) => ({
      desligada: window.__cobertura(Object.assign({}, base, { cloudQ: 0 })),
      baixa: window.__cobertura(Object.assign({}, base, { cover: 0.2 })),
      normal: window.__cobertura(base),
      alta: window.__cobertura(Object.assign({}, base, { cover: 0.8 })),
    }),
    { base },
  )
  vida.nuvem = {
    ...nuvem,
    veredito:
      nuvem.desligada === 0 && nuvem.alta > nuvem.baixa + 0.15
        ? 'O CAMPO DE NUVEM RESPONDE'
        : 'campo de nuvem constante ou ausente — é o defeito de 23/08 de volta',
  }
  relatorio.vida = vida
}

// ── forma das estrelas, na lente ───────────────────────────────────────────
{
  const ok = await pagina.evaluate(
    ({ fonte }) => {
      try {
        window.__prog.lente = window.__compilar(fonte)
        return true
      } catch {
        return false
      }
    },
    { fonte: montarFragmento({ gnomonico: true }) },
  )
  if (ok) {
    // Sem nuvem e sem lua no quadro: só estrela. FOV de 6° pra cada estrela
    // ocupar dezenas de pixels e a forma virar mensurável.
    const est = estado(18000, {
      cloudQ: 0,
      centro: [0.62, 0.42, 0.66],
      fov: (6 * Math.PI) / 180,
      // O ângulo por pixel do JOGO, não o da lente: é assim que se mede a
      // estrela do tamanho que o jogador vê, com a lente só ampliando.
      pixelAng: (72 * Math.PI) / 180 / 1080,
    })
    relatorio.formaDasEstrelas = await pagina.evaluate(
      ({ est }) => {
        window.__desenhar(window.__prog.lente, est)
        return window.__medirLente()
      },
      { est },
    )
  }
}

// ── lente: recortes gnomônicos ─────────────────────────────────────────────
if (COM_FOTOS) {
  const lente = await pagina.evaluate(
    ({ fonte }) => {
      try {
        window.__prog.lente = window.__compilar(fonte)
        return { ok: true }
      } catch (e) {
        return { ok: false, erro: String(e.message).slice(0, 800) }
      }
    },
    { fonte: montarFragmento({ gnomonico: true }) },
  )
  if (!lente.ok) relatorio.lenteErro = lente.erro
  else {
    const alvos = {
      zenite: [0, 1, 0],
      'eixo-X': [1, 0.02, 0],
      'canto-do-cubo': [0.5774, 0.5774, 0.5774],
      'meio-neutro': [0.62, 0.42, 0.66],
    }
    for (const [nome, d] of Object.entries(alvos)) {
      for (const ticks of [18000, 6000, 11800]) {
        const est = {
          ...estado(ticks),
          centro: d,
          fov: (14 * Math.PI) / 180,
          pixelAng: (14 * Math.PI) / 180 / A / 2,
        }
        const png = await pagina.evaluate(
          ({ est }) => {
            window.__desenhar(window.__prog.lente, est)
            return document.getElementById('c').toDataURL('image/png')
          },
          { est },
        )
        const rotulo = ticks === 18000 ? 'noite' : ticks === 6000 ? 'dia' : 'poente'
        fs.writeFileSync(
          path.join(SAIDA, `lente-${rotulo}-${nome}.png`),
          Buffer.from(png.split(',')[1], 'base64'),
        )
      }
    }
  }
}

fs.writeFileSync(path.join(SAIDA, 'relatorio.json'), JSON.stringify(relatorio, null, 2))
console.log(JSON.stringify(relatorio, null, 2))
await navegador.close()
