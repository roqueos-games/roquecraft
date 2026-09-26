import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PNG } from 'pngjs'

// O ACABAMENTO DAS TEXTURAS, CONFERIDO NA FOLHA QUE ESTÁ NO DISCO.
//
// `gen-roquecraft-textures.mjs` passa toda receita por uma etapa final —
// agrupar em quadras, quantizar o tom, escurecer a junta — que foi o que tirou
// o aspecto de "ruído fractal borrado" que o founder chamou de velho em
// 2026-08-22. Esta etapa é global: um erro nela erra as 81 de uma vez.
//
// O primeiro erro dela custou o bloco de vidro. A regra era "tem pixel com alfa
// abaixo de 0,5? então é recorte, arredonda o alfa pra 0 ou 1 por maioria" — e
// o vidro tem o MIOLO INTEIRO em alfa 0,15. Foi tudo por maioria pra zero e o
// vidro sumiu do mundo, sem erro no console, sem teste quebrando.
//
// Por isso o teste é sobre a FOLHA GRAVADA, não sobre a função: é o arquivo que
// o jogo carrega, e é nele que dá pra afirmar "o vidro ainda é vidro".

const TEX = resolve(__dirname, '../../public/games/roquecraft/tex')
const manifesto = JSON.parse(readFileSync(resolve(TEX, 'manifest.json'), 'utf8'))
const folha = PNG.sync.read(readFileSync(resolve(TEX, 'blocks_albedo.png')))

function pixels(nome) {
  const { tile, cols, names } = manifesto
  const i = names.indexOf(nome)
  expect(i, `"${nome}" não está no manifesto`).toBeGreaterThanOrEqual(0)
  const tx = (i % cols) * tile
  const ty = Math.floor(i / cols) * tile
  const out = []
  for (let y = 0; y < tile; y++)
    for (let x = 0; x < tile; x++) {
      const p = ((ty + y) * folha.width + tx + x) * 4
      out.push({
        x,
        y,
        r: folha.data[p],
        g: folha.data[p + 1],
        b: folha.data[p + 2],
        a: folha.data[p + 3],
      })
    }
  return out
}

const luz = (p) => (0.2126 * p.r + 0.7152 * p.g + 0.0722 * p.b) / 255

describe('roquecraft - acabamento das texturas', () => {
  it('o vidro continua translúcido (nem opaco, nem apagado)', () => {
    const meio = pixels('glass').filter(
      (p) => p.x > 4 && p.y > 4 && p.x < manifesto.tile - 5 && p.y < manifesto.tile - 5,
    )
    const media = meio.reduce((s, p) => s + p.a, 0) / meio.length
    expect(
      media,
      'o miolo do vidro ficou transparente: o bloco de vidro some do mundo inteiro',
    ).toBeGreaterThan(10)
    expect(media, 'o miolo do vidro ficou opaco: deixou de ser vidro').toBeLessThan(140)
  })

  it('a água mantém o alfa uniforme dela', () => {
    const a = new Set(pixels('water').map((p) => p.a))
    expect(a.size, `a água ficou com ${a.size} valores de alfa; tinha que ter um só`).toBe(1)
    const unico = [...a][0]
    expect(unico).toBeGreaterThan(120)
    expect(unico).toBeLessThan(230)
  })

  it('planta e folhagem têm alfa BINÁRIO (o alpha test não resolve meio-termo)', () => {
    for (const nome of ['tall_grass', 'oak_leaves', 'flower_red', 'dead_bush']) {
      const meio = pixels(nome).filter((p) => p.a > 8 && p.a < 247)
      expect(
        meio.length,
        `${nome}: ${meio.length} pixels com alfa intermediário — borda serrilhada`,
      ).toBe(0)
    }
  })

  it('os blocos sólidos continuam 100% opacos', () => {
    for (const nome of ['stone', 'dirt', 'grass_side', 'oak_planks', 'sand']) {
      const vazando = pixels(nome).filter((p) => p.a !== 255)
      expect(vazando.length, `${nome} ganhou transparência que não devia ter`).toBe(0)
    }
  })

  it('o tom é QUANTIZADO: poucos degraus de luminância, não um degradê', () => {
    // Quantizar em `DEGRAUS` passos deixa a face com um punhado de tons — as
    // medidas de hoje vão de 4 (pedra, terra, areia) a 10 (pedregulho). Um
    // gerador de ruído sem quantização produz dezenas, e é isso que faz a
    // textura ler como fotografia borrada em vez de desenho.
    for (const nome of ['stone', 'dirt', 'sand', 'oak_planks']) {
      const niveis = new Set(pixels(nome).map((p) => Math.round(luz(p) * 255)))
      expect(
        niveis.size,
        `${nome}: ${niveis.size} níveis de luminância distintos — o tom não foi quantizado`,
      ).toBeLessThan(16)
    }
  })

  it('o desenho é AGRUPADO em quadras: quase nenhum pixel difere do vizinho par', () => {
    // Com quadras de 2, as colunas 2k e 2k+1 são iguais dentro do tile. Um
    // punhado de exceções é aceitável (a junta e o arredondamento do encoder);
    // uma folha não agrupada teria dezenas de milhares.
    const tile = manifesto.tile
    for (const nome of ['stone', 'dirt', 'cobblestone']) {
      const p = pixels(nome)
      const em = (x, y) => p[y * tile + x]
      let diferentes = 0
      for (let y = 0; y < tile; y += 2)
        for (let x = 0; x < tile; x += 2) {
          const a = em(x, y)
          const b = em(x + 1, y)
          if (Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b) > 6) diferentes++
        }
      expect(
        diferentes,
        `${nome}: ${diferentes} quadras com metades diferentes — o agrupamento não rodou`,
      ).toBeLessThan(40)
    }
  })
})
