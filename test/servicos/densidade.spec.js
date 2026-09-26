//
// QUÃO LONGE FICA A PRÓXIMA VILA — e o próximo castelo.
//
// ⚠️ ESTE TESTE EXISTE PORQUE O FOUNDER VOOU O MAPA INTEIRO E NÃO ACHOU NADA.
// A suíte estava verde: cada vila era testada por dentro, uma por uma, e
// nenhuma media a única coisa que o jogador percebe primeiro — a distância até
// achar UMA. Vila perfeita a dois quilômetros e meio de distância é vila que
// não existe.
//
// ⚠️ E ELE MEDE COM O RUÍDO DE VERDADE, não com a planície de mentira dos outros
// testes. Numa planície infinita toda célula aceita e a conta dá o tamanho da
// grade; o que decide a densidade real é quantas células o BIOMA e o TERRENO
// recusam, e isso só o mundo responde.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { BIOMAS_DA_ALDEIA, CELULA, planoDaAldeia } from '../../src/servicos/aldeia.js'
import { BIOMAS_DO_CASTELO, CELULA_DO_CASTELO, planoDoCastelo } from '../../src/servicos/castelo.js'
import { MATERIAIS } from '../../src/servicos/vilaCasa.js'
import {
  BIOME_NAMES,
  biomeAt,
  createNoiseContext,
  solidTopAt,
  terrainHeight,
} from '../../src/servicos/worldgen.js'
import { hash3 } from '../../src/servicos/noise.js'
import { SEA_LEVEL } from '../../src/servicos/constants.js'

const manifesto = JSON.parse(
  readFileSync(resolve('test/inventario-da-vila.json'), 'utf8'),
).densidade

const SEMENTE = 1337
const nz = createNoiseContext(SEMENTE)
const hash = (a, b, c) => hash3(a, b, c, SEMENTE)
const base = {
  alturaEm: (x, z) => solidTopAt(nz, x, z),
  nivelDoMar: SEA_LEVEL,
  biomaEm: (x, z) => biomeAt(nz, x, z, terrainHeight(nz, x, z)),
}
const mundoDaVila = {
  ...base,
  biomaAceito: (b) => BIOMAS_DA_ALDEIA.includes(BIOME_NAMES[b]),
  materialDaVila: () => MATERIAIS.carvalho,
}
const mundoDoCastelo = {
  ...base,
  biomaAceito: (b) => BIOMAS_DO_CASTELO.includes(BIOME_NAMES[b]),
}

/** Varre um quadrado de células e devolve os centros achados e o lado em blocos. */
function varrer(celula, plano, n) {
  const achados = []
  for (let gx = -n; gx <= n; gx++) {
    for (let gz = -n; gz <= n; gz++) {
      const p = plano(gx * celula, gz * celula)
      if (p) achados.push(p.centro)
    }
  }
  return { achados, lado: (2 * n + 1) * celula * 16 }
}

/** A distância média entre vizinhas, pela raiz da área por estrutura. */
const espacamento = ({ achados, lado }) =>
  achados.length ? Math.round(Math.sqrt((lado * lado) / achados.length)) : Infinity

// ⚠️ TRINTA E TRÊS POR TRINTA E TRÊS CÉLULAS, e o número é medido: a 21×21 a
// mesma configuração deu 1.035 blocos e a 33×33 deu 1.183 — 13% de diferença só
// pela borda da amostra. Uma faixa apertada sobre uma medida que oscila 13% é
// uma faixa que reprova por sorte. Com a varredura maior a medida estabiliza e
// a faixa pode ser estreita o bastante para significar alguma coisa.
const vilas = varrer(CELULA, (cx, cz) => planoDaAldeia(hash, mundoDaVila, cx, cz), 16)
const castelos = varrer(
  CELULA_DO_CASTELO,
  (cx, cz) => planoDoCastelo(hash, mundoDoCastelo, cx, cz),
  8,
)

describe('quão longe fica a próxima vila', () => {
  it('existe vila no mundo — prova de vida deste teste', () => {
    expect(vilas.achados.length, 'a varredura inteira não achou uma vila').toBeGreaterThan(5)
  })

  it('e a distância entre elas está na FAIXA que o manifesto escreve', () => {
    // ⚠️ Faixa, e com os dois lados. Acima do teto a vila vira lenda: o jogador
    // voa o mapa e não acha nenhuma, que foi o relato que abriu esta onda.
    // Abaixo do piso ela vira subúrbio, e achar uma deixa de significar algo.
    const d = espacamento(vilas)
    const { min, max } = manifesto.vilaACada
    expect(d, `a vila voltou a ser lenda: uma a cada ${d} blocos`).toBeLessThan(max)
    expect(d, `vila demais: uma a cada ${d} blocos`).toBeGreaterThan(min)
  })

  it('a grade não pode aparecer: o centro tem onde variar dentro da célula', () => {
    // ⚠️ Encolher a célula até o limite deixa `livre = 2`, e a vila passa a
    // nascer quase sempre no mesmo ponto dela — o jogador vê isso como uma
    // FILEIRA de vilas igualmente espaçadas, que é pior que vila rara.
    const restos = new Set(vilas.achados.map((c) => (c.x / 16) % CELULA | 0))
    expect(
      restos.size,
      'toda vila caiu no mesmo ponto da célula: a grade está visível',
    ).toBeGreaterThan(2)
  })
})

describe('quão longe fica o próximo castelo', () => {
  it('existe castelo no mundo', () => {
    expect(castelos.achados.length).toBeGreaterThan(5)
  })

  it('e ele é MAIS RARO que a vila, de propósito', () => {
    // A vila é onde se mora e se compra; o castelo é a coisa que o jogador conta
    // para alguém ter achado. Se os dois tiverem a mesma frequência, o castelo
    // deixa de ser um evento.
    const d = espacamento(castelos)
    const { min, max } = manifesto.castelosACada
    expect(d).toBeGreaterThan(min)
    expect(d).toBeLessThan(max)
    expect(d, 'castelo mais comum que vila').toBeGreaterThan(espacamento(vilas))
  })
})
