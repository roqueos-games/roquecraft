// RoqueCraft - carregamento do texture array PBR.
//
// As 81 texturas vivem em TRÊS folhas (albedo, normal, MER) geradas por
// `scripts/gen-roquecraft-textures.mjs`. Aqui cada folha é fatiada em camadas e
// vira um `DataArrayTexture` (sampler2DArray do WebGL2).
//
// Por que array e não atlas: com atlas, repetir a textura ao longo de um quad
// fundido pelo greedy meshing exigiria `fract()` no shader e mesmo assim
// sangraria a textura vizinha nos mipmaps (as linhas claras entre blocos que
// denunciam voxel amador). Com array, cada camada tem borda própria: `RepeatWrapping`
// funciona nativo, os mipmaps são corretos e um quad de 16 blocos repete limpo.

import * as THREE from 'three'
import { packDisponivel, lerPack, aplicarNoAlbedo } from './resourcePack.js'

import { createLogger } from '../../logger.js'

const log = createLogger('roquecraft')

export const TEX_BASE = '/games/roquecraft/tex/'

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`textura não carregou: ${url}`))
    img.src = url
  })
}

// ⚠️ A LINHA 0 DE UMA CAMADA É O RODAPÉ DA IMAGEM, NÃO O TOPO.
//
// `DataArrayTexture` nasce com `flipY = false` e não tem escolha: a WebGL 2
// proíbe `UNPACK_FLIP_Y_WEBGL` em `texImage3D`. Então quem sobe os dados é quem
// tem que inverter — a primeira linha do buffer vira v=0, e v=0 é a BASE do
// bloco (o mesher manda `v` crescer com o Y do mundo).
//
// Copiando as linhas na ordem do PNG, as 81 texturas subiam espelhadas na
// vertical. Na maioria (pedra, areia, ruído) isso é invisível; nas
// direcionais é gritante, e foi o que o founder viu em 2026-08-22: o mato alto
// pendurado de cabeça pra baixo, a pétala da flor no pé do caule e a franja
// verde do bloco de grama correndo pela BASE do cubo em vez do topo.
//
// A inversão acontece uma vez só, em `paraOrdemGL`, chamada de dentro de
// `makeArrayTexture` — o único lugar do jogo que constrói um `DataArrayTexture`.
// Ficar no construtor da textura é o que torna impossível subir uma folha
// esquecida: quem fatia (`sliceSheet`) e quem sobrescreve (o resource pack)
// continuam trabalhando em espaço de IMAGEM, que é como a arte foi desenhada.
//
// Os ícones do inventário (`buildBlockIcons`, `buildItemIcons`) desenham a
// folha direto num canvas 2D, que já é espaço de imagem: eles não passam por
// aqui, e inverter lá deixaria o ícone de cabeça pra baixo.
export function paraOrdemGL(dados, tile, count) {
  const linha = tile * 4
  const camada = tile * linha
  const out = new Uint8Array(dados.length)
  for (let i = 0; i < count; i++) {
    const base = i * camada
    for (let y = 0; y < tile; y++) {
      const de = base + (tile - 1 - y) * linha
      out.set(dados.subarray(de, de + linha), base + y * linha)
    }
  }
  return out
}

// Fatia a folha (grade cols×rows de tiles `tile`×`tile`) num Uint8Array
// contíguo com uma camada por tile, na ordem do manifesto. Sai em espaço de
// IMAGEM; `makeArrayTexture` é quem vira pra ordem de GL.
function sliceSheet(img, { tile, cols, count, destTile = 0 }) {
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(img.width, img.height)
      : Object.assign(document.createElement('canvas'), { width: img.width, height: img.height })
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0)

  // Caminho REAMOSTRADO: existe pro resource pack local, que costuma ser 128 ou
  // 256 enquanto as nossas sao 64. Um DataArrayTexture exige TODAS as camadas do
  // mesmo tamanho, entao ou o pack desce pro nosso tile (perdendo o motivo de
  // existir) ou as nossas sobem pro dele. Sobem.
  if (destTile && destTile !== tile) {
    const alvo = document.createElement('canvas')
    alvo.width = destTile
    alvo.height = destTile
    const actx = alvo.getContext('2d', { willReadFrequently: true })
    actx.imageSmoothingEnabled = false // pixel-art nao interpola
    const out = new Uint8Array(destTile * destTile * 4 * count)
    for (let i = 0; i < count; i++) {
      const tx = (i % cols) * tile
      const ty = Math.floor(i / cols) * tile
      actx.clearRect(0, 0, destTile, destTile)
      actx.drawImage(img, tx, ty, tile, tile, 0, 0, destTile, destTile)
      out.set(actx.getImageData(0, 0, destTile, destTile).data, i * destTile * destTile * 4)
    }
    return out
  }

  const full = ctx.getImageData(0, 0, img.width, img.height).data
  const out = new Uint8Array(tile * tile * 4 * count)
  for (let i = 0; i < count; i++) {
    const tx = (i % cols) * tile
    const ty = Math.floor(i / cols) * tile
    for (let y = 0; y < tile; y++) {
      const src = ((ty + y) * img.width + tx) * 4
      out.set(full.subarray(src, src + tile * 4), (i * tile * tile + y * tile) * 4)
    }
  }
  return out
}

function makeArrayTexture(data, tile, count, colorSpace) {
  // ⚠️ Última parada antes da GPU: aqui, e só aqui, a folha vira de espaço de
  // imagem pra ordem de GL. Ver o cabeçalho de `paraOrdemGL`.
  const tex = new THREE.DataArrayTexture(paraOrdemGL(data, tile, count), tile, tile, count)
  tex.format = THREE.RGBAFormat
  tex.type = THREE.UnsignedByteType
  if (colorSpace) tex.colorSpace = colorSpace
  // NEAREST na magnificação preserva o pixel-art de perto; mip LINEAR na
  // minificação mata o cintilar (shimmer) do terreno ao longe, que é o defeito
  // visual mais óbvio de um voxel sem mipmap.
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 8
  tex.needsUpdate = true
  return tex
}

/**
 * Carrega as três folhas e devolve `{ albedo, normal, mer, names, layerOf }`.
 * Lança se alguma folha faltar - o chamador transforma isso em erro recuperável
 * na UI (a regra do harness: jogo pesado nunca fica preso no "carregando").
 */
export async function loadBlockTextures(renderer) {
  const manifest = await fetch(`${TEX_BASE}manifest.json`).then((r) => {
    if (!r.ok) throw new Error(`manifest ${r.status}`)
    return r.json()
  })
  const { tile, cols, names } = manifest
  const count = names.length

  const [albedoImg, normalImg, merImg] = await Promise.all([
    loadImage(`${TEX_BASE}blocks_albedo.png`),
    loadImage(`${TEX_BASE}blocks_normal.png`),
    loadImage(`${TEX_BASE}blocks_mer.png`),
  ])

  const opts = { tile, cols, count }
  let dadosAlbedo = sliceSheet(albedoImg, opts)
  let tileAlbedo = tile
  let pack = null

  // RESOURCE PACK LOCAL (opcional). Se a pasta existir, ela vence no albedo.
  // Ver o cabeçalho de `resourcePack.js` pro porquê de ele não vir junto.
  try {
    if (await packDisponivel()) {
      const lido = await lerPack(names)
      if (lido && lido.total > 0) {
        // O pack normalmente é maior que 64: reamostra as NOSSAS pro tile dele,
        // senão as camadas ficam de tamanhos diferentes e o DataArrayTexture
        // nem monta.
        if (lido.tile !== tile) {
          dadosAlbedo = sliceSheet(albedoImg, { ...opts, destTile: lido.tile })
          tileAlbedo = lido.tile
        }
        const trocadas = aplicarNoAlbedo(dadosAlbedo, names, tileAlbedo, lido)
        pack = { tile: lido.tile, trocadas, total: count }
        log.info(`resource pack: ${trocadas}/${count} texturas em ${lido.tile}px`)
      }
    }
  } catch (e) {
    // pack quebrado NUNCA derruba o jogo: cai pro procedural e segue
    console.warn('[roquecraft] resource pack ignorado:', e?.message || e)
  }

  const albedo = makeArrayTexture(dadosAlbedo, tileAlbedo, count, THREE.SRGBColorSpace)
  const normal = makeArrayTexture(sliceSheet(normalImg, opts), tile, count, THREE.NoColorSpace)
  const mer = makeArrayTexture(sliceSheet(merImg, opts), tile, count, THREE.NoColorSpace)

  const maxAniso = renderer?.capabilities?.getMaxAnisotropy?.() || 4
  for (const t of [albedo, normal, mer]) t.anisotropy = Math.min(8, maxAniso)

  const layerOf = Object.fromEntries(names.map((n, i) => [n, i]))
  return { albedo, normal, mer, names, layerOf, tile: tileAlbedo, count, manifest, pack }
}

// Ícone 2D de um bloco pra HUD e inventário.
//
// Desenha as três faces visíveis de um cubo em projeção isométrica recortando o
// tile certo da folha de albedo. A primeira versão fazia isso por faixas
// verticais com `clip()` e saía um retângulo de cor chapada (visto no QA de
// 2026-08-19); esta usa `setTransform`, que é o jeito certo de mapear uma imagem
// quadrada num paralelogramo - a matriz leva o quadrado unitário exatamente nos
// dois vetores da face.
//
// Uma cena three só pros ícones seria mais fiel, mas custaria um render target
// por item; isto roda uma vez no boot e vira dataURL.
// Ícones dos itens que NÃO são bloco (ferramenta, comida, material). Bloco vira
// cubo isométrico; item é sprite chapado. Antes disto toda ferramenta herdava o
// cubo do "material mais próximo" e picareta, espada e o próprio diamante eram
// três cubos cianos idênticos no inventário (QA de 2026-08-19).
export async function buildItemIcons(size = 56) {
  const manifest = await fetch(`${TEX_BASE}items.json`).then((r) => r.json())
  const img = await loadImage(`${TEX_BASE}items.png`)
  const { tile, cols, names } = manifest
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = false
  const out = {}
  names.forEach((name, i) => {
    ctx.clearRect(0, 0, size, size)
    const sx = (i % cols) * tile
    const sy = Math.floor(i / cols) * tile
    const m = Math.round(size * 0.06)
    ctx.drawImage(img, sx, sy, tile, tile, m, m, size - m * 2, size - m * 2)
    out[name] = canvas.toDataURL('image/png')
  })
  return out
}

export async function buildBlockIcons(manifest, faceLayersFor, size = 56) {
  const img = await loadImage(`${TEX_BASE}blocks_albedo.png`)
  const { tile, cols } = manifest
  const out = {}
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = false

  // Geometria do cubo isométrico dentro do quadrado do ícone.
  const m = size * 0.08 // margem
  const w = size - m * 2
  const cx = size / 2
  const yTop = m
  const yMid = m + w * 0.25 // altura do "equador" do losango do topo
  const yLow = m + w * 0.5
  const yBot = size - m
  const xL = m
  const xR = size - m

  // face: origem + vetor U + vetor V (o quadrado unitário vai em O, O+U, O+U+V, O+V)
  const FACES = {
    top: { o: [xL, yMid], u: [cx - xL, yTop - yMid], v: [cx - xL, yLow - yMid], shade: 1 },
    left: { o: [xL, yMid], u: [cx - xL, yLow - yMid], v: [0, yBot - yLow], shade: 0.74 },
    right: { o: [cx, yLow], u: [xR - cx, yMid - yLow], v: [0, yBot - yLow], shade: 0.55 },
  }

  const drawFace = (layer, f) => {
    const sx = (layer % cols) * tile
    const sy = Math.floor(layer / cols) * tile
    ctx.save()
    ctx.setTransform(f.u[0] / tile, f.u[1] / tile, f.v[0] / tile, f.v[1] / tile, f.o[0], f.o[1])
    ctx.drawImage(img, sx, sy, tile, tile, 0, 0, tile, tile)
    if (f.shade < 1) {
      ctx.fillStyle = `rgba(0,0,0,${1 - f.shade})`
      ctx.fillRect(0, 0, tile, tile)
    }
    ctx.restore()
  }

  for (const [key, layers] of Object.entries(faceLayersFor)) {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, size, size)
    drawFace(layers.top, FACES.top)
    drawFace(layers.side, FACES.left)
    drawFace(layers.side, FACES.right)
    out[key] = canvas.toDataURL('image/png')
  }
  return out
}
