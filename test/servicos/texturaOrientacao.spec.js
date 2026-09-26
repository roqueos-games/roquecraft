import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PNG } from 'pngjs'
import { paraOrdemGL } from '../../src/servicos/render/textures.js'
import { FACES } from '../../src/servicos/mesher.js'
import { heightToNormal } from '../../qa/gen-roquecraft-textures.mjs'

// ORIENTAÇÃO DA TEXTURA, DO PNG ATÉ O PIXEL NA FACE.
//
// Em 2026-08-22 o founder mandou dois prints: "as gramas estão de ponta
// cabeça". Estavam — e não só elas. As 81 texturas subiam espelhadas na
// vertical, porque `DataArrayTexture` nasce com `flipY = false` (a WebGL 2
// proíbe `UNPACK_FLIP_Y_WEBGL` em `texImage3D`) e ninguém invertia as linhas na
// mão. Na pedra e na areia isso não aparece; no mato, na flor e na franja do
// bloco de grama, aparece muito.
//
// O defeito sobreviveu meses porque cada peça, lida sozinha, estava certa: a
// arte é desenhada de cabeça pra cima, o mesher manda `v` subir com o Y do
// mundo, o shader lê `v` sem mexer. O erro só existe na EMENDA entre elas. Por
// isso os testes daqui atravessam a emenda inteira em vez de conferir uma peça:
// leem o PNG que está no disco, aplicam a mesma transformação que o jogo aplica
// e perguntam onde o verde foi parar.
//
// Um teste de pixel é frágil quando compara cor; estes comparam MASSA em metades
// opostas do tile, com margem folgada. Só quebram se a folha inverter de novo.

const TEX = resolve(__dirname, '../../public/games/roquecraft/tex')
const manifesto = JSON.parse(readFileSync(resolve(TEX, 'manifest.json'), 'utf8'))
const folha = PNG.sync.read(readFileSync(resolve(TEX, 'blocks_albedo.png')))

/** Recorta o tile de `nome` da folha em espaço de IMAGEM (linha 0 = topo). */
function tileDaFolha(nome) {
  const { tile, cols, names } = manifesto
  const i = names.indexOf(nome)
  expect(i, `"${nome}" não está no manifesto`).toBeGreaterThanOrEqual(0)
  const tx = (i % cols) * tile
  const ty = Math.floor(i / cols) * tile
  const out = new Uint8Array(tile * tile * 4)
  for (let y = 0; y < tile; y++) {
    const de = ((ty + y) * folha.width + tx) * 4
    out.set(folha.data.subarray(de, de + tile * 4), y * tile * 4)
  }
  return out
}

/**
 * Massa de folhagem nas metades BAIXA e ALTA de uma camada já em ordem de GL.
 * Em ordem de GL, linha 0 é v=0, e v=0 é a base do bloco: `baixo` é o pé da
 * planta e `alto` é a ponta.
 */
function massaVegetal(camada, tile) {
  let baixo = 0
  let alto = 0
  for (let y = 0; y < tile; y++) {
    for (let x = 0; x < tile; x++) {
      const p = (y * tile + x) * 4
      const [r, g, b, a] = [camada[p], camada[p + 1], camada[p + 2], camada[p + 3]]
      if (a < 128) continue
      if (!(g > r + 10 && g > b + 10)) continue
      if (y < tile / 2) baixo++
      else alto++
    }
  }
  return { baixo, alto }
}

describe('roquecraft - orientação vertical do texture array', () => {
  const tile = manifesto.tile

  it('paraOrdemGL espelha as linhas DENTRO de cada camada, sem misturar camadas', () => {
    // Duas camadas 2×2, cada pixel marcado com a própria camada e linha.
    const t = 2
    const dados = new Uint8Array(t * t * 4 * 2)
    for (let c = 0; c < 2; c++)
      for (let y = 0; y < t; y++)
        for (let x = 0; x < t; x++) {
          const p = (c * t * t + y * t + x) * 4
          dados[p] = c * 100 // camada
          dados[p + 1] = y * 10 // linha
          dados[p + 2] = x // coluna
          dados[p + 3] = 255
        }

    const fora = paraOrdemGL(dados, t, 2)
    const em = (c, y, x, canal) => fora[(c * t * t + y * t + x) * 4 + canal]

    // linha 0 da saída = última linha da entrada, e vice-versa
    expect(em(0, 0, 0, 1), 'a linha 0 tinha que trazer a ÚLTIMA linha da imagem').toBe(10)
    expect(em(0, 1, 0, 1), 'a linha 1 tinha que trazer a PRIMEIRA linha da imagem').toBe(0)
    // a camada 1 continua sendo a camada 1 (o espelho não pode vazar entre elas)
    expect(em(1, 0, 0, 0), 'a camada vazou: linha da camada 0 apareceu na 1').toBe(100)
    expect(em(1, 1, 0, 0)).toBe(100)
    // a coluna não se mexe: a inversão é só vertical
    expect(em(0, 0, 1, 2), 'a coluna mudou - a inversão tem que ser só vertical').toBe(1)
  })

  it('paraOrdemGL aplicado duas vezes devolve a folha original', () => {
    const t = 4
    const dados = new Uint8Array(t * t * 4 * 3).map((_, i) => (i * 37) % 251)
    const ida = paraOrdemGL(dados, t, 3)
    expect(Array.from(paraOrdemGL(ida, t, 3))).toEqual(Array.from(dados))
    // e não é a identidade disfarçada
    expect(Array.from(ida)).not.toEqual(Array.from(dados))
  })

  it('o mato alto chega à GPU com a raiz embaixo e a ponta em cima', () => {
    const camada = paraOrdemGL(tileDaFolha('tall_grass'), tile, 1)
    const { baixo, alto } = massaVegetal(camada, tile)
    expect(baixo + alto, 'o tile de mato alto veio vazio - folha errada?').toBeGreaterThan(400)
    // O mato afina pra cima: o pé tem que pesar claramente mais que a ponta.
    expect(
      baixo,
      `mato alto de ponta cabeça: ${alto}px de folha na metade de CIMA contra ` +
        `${baixo}px na de baixo. Em ordem de GL, v=0 é a BASE do bloco.`,
    ).toBeGreaterThan(alto * 1.3)
  })

  it('a franja verde do bloco de grama chega no TOPO da face lateral', () => {
    const camada = paraOrdemGL(tileDaFolha('grass_side'), tile, 1)
    const { baixo, alto } = massaVegetal(camada, tile)
    expect(alto, 'não achei verde nenhum no grass_side').toBeGreaterThan(200)
    expect(
      alto,
      `a franja de grama caiu na BASE do cubo: ${baixo}px de verde embaixo contra ` +
        `${alto}px em cima. É a faixa verde correndo no rodapé de todo barranco.`,
    ).toBeGreaterThan(baixo * 3)
  })

  it('a pétala da flor fica ACIMA do caule', () => {
    const camada = paraOrdemGL(tileDaFolha('flower_red'), tile, 1)
    let yPetala = 0
    let nPetala = 0
    let yCaule = 0
    let nCaule = 0
    for (let y = 0; y < tile; y++)
      for (let x = 0; x < tile; x++) {
        const p = (y * tile + x) * 4
        const [r, g, b, a] = [camada[p], camada[p + 1], camada[p + 2], camada[p + 3]]
        if (a < 128) continue
        if (r > g + 30 && r > b + 30) {
          yPetala += y
          nPetala++
        } else if (g > r + 10 && g > b + 10) {
          yCaule += y
          nCaule++
        }
      }
    expect(nPetala, 'não achei pétala vermelha no flower_red').toBeGreaterThan(50)
    expect(nCaule, 'não achei caule verde no flower_red').toBeGreaterThan(50)
    expect(
      yPetala / nPetala,
      'a flor nasceu com a pétala no pé do caule - a folha subiu invertida',
    ).toBeGreaterThan(yCaule / nCaule)
  })
})

describe('roquecraft - o relevo concorda com a cor', () => {
  it('o TBN do shader usa os MESMOS eixos u/v que a tabela FACES', () => {
    const fonte = readFileSync(
      resolve(__dirname, '../../src/servicos/render/voxelMaterial.js'),
      'utf8',
    )
    const bloco = fonte.match(/const FRAG_NORMAL = [^`]*`([\s\S]*?)`/)
    expect(bloco, 'não achei o bloco FRAG_NORMAL no voxelMaterial').toBeTruthy()

    // `tangent = vec3(0.0, 0.0, 1.0)` → eixo 2. Na ordem em que aparecem: ±X, ±Y, ±Z.
    const eixo = (v) => [v[0], v[1], v[2]].findIndex((c) => Math.abs(Number(c)) > 0.5)
    const lidos = [...bloco[1].matchAll(/(tangent|bitangent) = vec3\(([^)]*)\)/g)].map((m) => ({
      qual: m[1],
      eixo: eixo(m[2].split(',').map((s) => s.trim())),
    }))
    expect(lidos.length, 'esperava 3 pares tangent/bitangent no FRAG_NORMAL').toBe(6)

    // O shader ramifica por |faceN.x| > .5, depois |faceN.y| > .5, senão Z.
    const ramos = [0, 1, 2]
    for (let i = 0; i < 3; i++) {
      const F = FACES.find((f) => f.axis === ramos[i])
      const tangent = lidos[i * 2]
      const bitangent = lidos[i * 2 + 1]
      expect(
        tangent.eixo,
        `face de eixo ${ramos[i]}: o tangente é o eixo ${tangent.eixo} mas FACES.u é ${F.u}. ` +
          'Trocar tangente e bitangente gira o RELEVO 90° e deixa a cor no lugar - ' +
          'o defeito lê como "textura suja", não como textura girada.',
      ).toBe(F.u)
      expect(
        bitangent.eixo,
        `face de eixo ${ramos[i]}: o bitangente é o eixo ${bitangent.eixo} mas FACES.v é ${F.v}.`,
      ).toBe(F.v)
    }
  })

  it('no normal map, uma rampa que sobe em v aponta o verde pra baixo', () => {
    // Campo de altura que cresce com o y da IMAGEM. Depois de `paraOrdemGL` a
    // folha é espelhada, então esse mesmo campo DESCE ao longo de v — e a normal
    // de uma ladeira que desce em v tem componente v positiva.
    const n = 8
    const hg = new Float32Array(n * n)
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) hg[y * n + x] = y / (n - 1)

    const nrm = heightToNormal(hg, n, 2.4)
    // Longe da emenda toroidal (o Sobel dá a volta nas bordas).
    const meio = (Math.floor(n / 2) * n + Math.floor(n / 2)) * 3
    expect(
      nrm[meio + 1],
      'o verde do normal map está com o sinal trocado: a saliência ilumina como ' +
        'cova sob o mesmo sol. Convenção OpenGL, verde pra cima.',
    ).toBeGreaterThan(0.1)
    // o eixo horizontal continua plano nesta rampa
    expect(Math.abs(nrm[meio])).toBeLessThan(0.01)
  })
})
