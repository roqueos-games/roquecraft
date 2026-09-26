import { describe, it, expect } from 'vitest'
import { meshSection } from '../../src/servicos/mesher.js'
import { podeInundar } from '../../src/servicos/fluidos.js'
import { ID, AIR, IS_AGUADO } from '../../src/servicos/blocks.js'

// PLANTA DENTRO D'ÁGUA — o conceito de CÉLULA ALAGADA.
//
// "precisamos de algas" — founder, 25/08/2026.
//
// O mundo é UM id por célula. Pôr alga numa célula de água apaga a água dali, e
// isso quebra três coisas de uma vez, todas invisíveis para quem só olha o
// catálogo de blocos:
//
//   1. a água em volta passa a ver um vizinho não-líquido e DESENHA PAREDE —
//      cada pé de alga vira uma caixa de vidro no meio do mar;
//   2. a água logo abaixo da alga passa a achar que ali termina a lâmina e
//      REBAIXA a superfície — um degrau em volta de cada planta;
//   3. a fila de fluidos INUNDA a célula de volta e lava a planta no primeiro
//      tique.
//
// `aguado` responde "a célula continua sendo água" às três perguntas. Cada
// teste abaixo tem o seu PAR DE CONTROLE — a mesma cena com uma planta comum
// (grama alta), que NÃO é alagada e portanto tem que exibir o defeito. Sem o
// par, um teste verde não distingue "a regra funciona" de "a cena não tinha o
// que medir".

// ⚠️ O TANQUE INTEIRO CABE DENTRO DA SEÇÃO (0..15), e isso não é comodidade.
//
// A primeira versão usava `SEA_LEVEL` como topo — 64, muito acima da seção
// medida. O resultado: nenhuma célula de ar dentro da seção, nenhuma face de
// água desenhada, e o teste da parede passou comparando ZERO com ZERO. Passou
// dizendo a verdade por acidente: a alga de fato não abriu face nenhuma, mas
// a cena também não tinha face nenhuma pra abrir.
const FUNDO = 3 // y do leito
const TOPO = 12 // última camada d'água; acima disto é ar, e existe superfície

/**
 * Uma coluna d'água num tanque de pedra, com UMA célula trocada.
 *
 * `plantaId` = o que fica logo acima do leito, no meio da seção.
 */
function tanque(plantaId, alturaDaPlanta = 1) {
  const MEIO = 8
  return {
    block: (x, y, z) => {
      if (y <= FUNDO) return ID.stone
      if (y > TOPO) return AIR
      if (
        plantaId !== AIR &&
        x === MEIO &&
        z === MEIO &&
        y > FUNDO &&
        y <= FUNDO + alturaDaPlanta
      ) {
        return plantaId
      }
      return ID.water
    },
    light: () => 0xf0,
    tint: () => [0.4, 0.7, 0.3],
  }
}

/** Quantos triângulos a malha TRANSPARENTE (a água) tem. */
const trianguloDaAgua = (r) => (r.transparent ? r.transparent.count : 0)

/**
 * A MENOR profundidade de lâmina entre os vértices de água da seção.
 *
 * `aWind` carrega dois significados separados pelo bucket (ver a nota no
 * `emitQuad` do mesher): balanço na folhagem, profundidade na água. Aqui é
 * profundidade, normalizada em 0..255.
 *
 * ⚠️ O MENOR, e não o maior. O defeito é LOCAL — só a coluna que tem a planta
 * dentro se acha rasa —, e o máximo global ignora um buraco local por
 * definição. Foi assim que a primeira régua desta suíte (o y mais alto do
 * tampo) deu o MESMO número com e sem o defeito, e o controle apontou isso
 * antes de eu acreditar no verde.
 */
function menorProfundidade(r) {
  if (!r.transparent) return -1
  const { wind } = r.transparent
  let min = Infinity
  for (let v = 0; v < wind.length; v++) if (wind[v] < min) min = wind[v]
  return min === Infinity ? -1 : min
}

describe('roquecraft — alga vive DENTRO da água (célula alagada)', () => {
  it('o catálogo tem alga e capim marcados como alagados, e a grama alta não', () => {
    expect(IS_AGUADO[ID.kelp], 'kelp deveria ser alagado').toBe(1)
    expect(IS_AGUADO[ID.seagrass], 'seagrass deveria ser alagado').toBe(1)
    // ⚠️ O CONTROLE DO PRÓPRIO CATÁLOGO. Sem ele, `IS_AGUADO` poderia estar
    // marcando TUDO — e os testes abaixo passariam sem provar nada.
    expect(IS_AGUADO[ID.tallGrass], 'grama alta NÃO é alagada').toBe(0)
    expect(IS_AGUADO[ID.water], 'a água em si não precisa da marca').toBe(0)
  })

  it('a fila de fluidos NÃO lava a alga — e lava a grama alta', () => {
    expect(podeInundar(ID.kelp)).toBe(false)
    expect(podeInundar(ID.seagrass)).toBe(false)
    // Controle: planta comum continua sendo lavada, como sempre foi.
    expect(podeInundar(ID.tallGrass)).toBe(true)
    expect(podeInundar(AIR)).toBe(true)
    expect(podeInundar(ID.stone)).toBe(false)
  })

  it('a água NÃO desenha parede em volta da alga — e desenha em volta da grama', () => {
    const soAgua = trianguloDaAgua(meshSection(tanque(AIR), 0, 0, 0))
    const comAlga = trianguloDaAgua(meshSection(tanque(ID.kelp, 5), 0, 0, 0))
    const comGrama = trianguloDaAgua(meshSection(tanque(ID.tallGrass, 5), 0, 0, 0))

    // Piso: a cena TEM que ter água desenhada, senão os dois lados da
    // comparação são zero e o teste vira uma tautologia.
    expect(soAgua, 'o tanque não desenhou água nenhuma').toBeGreaterThan(0)

    // ⚠️ O CONTROLE VEM PRIMEIRO. A grama alta, que não é alagada, TEM que
    // abrir faces novas na água: é o defeito que a marca `aguado` evita, e se
    // ele não aparecer aqui é a CENA que não sabe produzi-lo — e aí o verde da
    // linha seguinte não significa nada.
    expect(
      comGrama,
      'a cena não sabe produzir o defeito: a planta comum não abriu parede nenhuma',
    ).toBeGreaterThan(soAgua)

    // E a alga não abre nenhuma.
    expect(comAlga, 'a alga abriu parede de água em volta de si').toBe(soAgua)
  })

  it('a coluna de profundidade atravessa a alga — e é cortada pela grama', () => {
    // A profundidade da lâmina (o atributo `aWind` dos vértices de água) é
    // contada descendo célula a célula enquanto houver líquido. Uma planta no
    // meio da coluna INTERROMPE essa contagem: a água acima dela passa a se
    // achar rasa, clareia, e some a névoa — no meio do mar.
    //
    // O controle é a mesma cena com grama alta, que não é alagada e portanto
    // TEM que cortar a coluna. Se ela não cortar, a régua não mede nada.
    const ALTA = 5
    const soAgua = menorProfundidade(meshSection(tanque(AIR), 0, 0, 0))
    const comAlga = menorProfundidade(meshSection(tanque(ID.kelp, ALTA), 0, 0, 0))
    const comGrama = menorProfundidade(meshSection(tanque(ID.tallGrass, ALTA), 0, 0, 0))

    expect(soAgua, 'o tanque não tem coluna de água pra medir').toBeGreaterThan(0)
    expect(
      comGrama,
      'a cena não sabe produzir o corte: a planta comum não encurtou coluna nenhuma',
    ).toBeLessThan(soAgua)
    expect(comAlga, 'a alga cortou a coluna de profundidade').toBe(soAgua)
  })
})
