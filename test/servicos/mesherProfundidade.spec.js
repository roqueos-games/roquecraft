import { describe, it, expect } from 'vitest'
import { meshSection, PROF_MAX } from '../../src/servicos/mesher.js'
import { BLOCK_BY_KEY, AIR } from '../../src/servicos/blocks.js'

// A PROFUNDIDADE DA LÂMINA VIAJA DO MESHER ATÉ O SHADER.
//
// A absorção de Beer-Lambert e a espuma de margem precisam saber quanta água a
// luz atravessou. Num motor comum isso sai de um depth buffer e de um segundo
// passe de render; num mundo de blocos a resposta é EXATA e custa uma contagem
// — e ainda acerta na margem, que é onde a versão em espaço de tela erra.
//
// O valor viaja no atributo `aWind`, que é REAPROVEITADO: balanço nas plantas,
// profundidade na água. Economia real (um byte por vértice em todas as malhas
// do mundo) com um risco real: se um byte de profundidade vazar para uma face
// sólida, aquela pedra passa a balançar como mato. Este arquivo guarda os dois
// lados.

const agua = BLOCK_BY_KEY.water.id
const pedra = BLOCK_BY_KEY.stone.id

/** Mundo de teste: coluna de pedra até `fundo`, água de `fundo+1` até `topo`. */
function lago(fundo, topo) {
  return {
    block: (x, y, z) => {
      if (y <= fundo) return pedra
      if (y <= topo) return agua
      return AIR
    },
    light: () => 0xf0,
    tint: () => [0.4, 0.7, 0.3],
  }
}

/** Lê o atributo de profundidade (0..1) dos vértices de um bucket. */
function profundidades(geo) {
  if (!geo) return []
  return Array.from(geo.wind).map((v) => v / 255)
}

/** Converte de volta pra blocos, com a mesma escala do shader. */
const emBlocos = (v) => Math.round(v * PROF_MAX)

describe('roquecraft - profundidade da água no atributo', () => {
  it('a superfície carrega a profundidade REAL da coluna', () => {
    // seção 0 cobre y 0..15. Pedra até 3, água de 4 a 9 → 6 blocos de lâmina.
    const geo = meshSection(lago(3, 9), 0, 0, 0).transparent
    expect(geo, 'não gerou malha transparente').toBeTruthy()
    const vals = profundidades(geo)
      .map(emBlocos)
      .filter((d) => d > 0)
    expect(vals.length, 'nenhum vértice de água recebeu profundidade').toBeGreaterThan(0)
    const unicos = [...new Set(vals)]
    expect(unicos, `profundidades encontradas: ${unicos.join(',')}`).toEqual([6])
  })

  it('lâmina de um bloco reporta 1, e não zero', () => {
    // É o caso que decide a espuma de margem: a rampa do shader tem exatamente
    // um degrau útil, em prof 1. Se a margem chegar como 0, a beira do lago
    // some; se chegar como 2, ela nunca aparece.
    const geo = meshSection(lago(5, 6), 0, 0, 0).transparent
    const vals = [
      ...new Set(
        profundidades(geo)
          .map(emBlocos)
          .filter((d) => d > 0),
      ),
    ]
    expect(vals).toEqual([1])
  })

  it('satura em PROF_MAX em vez de estourar o byte', () => {
    // Lâmina de 21 blocos (y 0..20), fotografada na seção 1 (y 16..31), que é
    // onde a superfície está. Contar até o fundo passaria de 255 no byte.
    const geo = meshSection(lago(-1, 20), 0, 1, 0).transparent
    const vals = [...new Set(profundidades(geo).map(emBlocos))].filter((v) => v > 0)
    expect(vals.length, 'a seção 1 tinha que conter a superfície').toBeGreaterThan(0)
    for (const v of vals) expect(v).toBeLessThanOrEqual(PROF_MAX)
    expect(vals).toContain(PROF_MAX)
  })

  it('⚠️ nenhuma face SÓLIDA recebe profundidade (senão a pedra balança)', () => {
    // O vazamento acontecia porque `maskProf` não é zerado entre fatias.
    //
    // ⚠️ O CENÁRIO IMPORTA, e a primeira versão deste teste não o tinha: as
    // fatias são varridas de baixo pra cima, então só vaza quando existe uma
    // face SÓLIDA ACIMA de uma superfície de água no mesmo plano. Com um lago
    // liso a fatia da lâmina é a última e não sobra nada pra contaminar — a
    // mutação passava e o teste não valia nada.
    //
    // Aqui: lago com a lâmina em y=6 e uma laje de pedra pairando em y=10, bem
    // em cima. A fatia 6 grava a profundidade, a fatia 10 emite pedra no mesmo
    // índice de máscara.
    const comLaje = {
      block: (x, y, z) => {
        if (y <= 3) return pedra
        if (y <= 6) return agua
        if (y === 10) return pedra
        return AIR
      },
      light: () => 0xf0,
      tint: () => [0.4, 0.7, 0.3],
    }
    const secao = meshSection(comLaje, 0, 0, 0)
    expect(secao.opaque, 'o cenário precisa ter face sólida').toBeTruthy()
    for (const nome of ['opaque', 'cutout']) {
      const geo = secao[nome]
      if (!geo) continue
      const sujos = profundidades(geo).filter((v) => v > 0)
      expect(
        sujos.length,
        `${sujos.length} vértices de ${nome} vieram com aWind > 0 — isso é ` +
          'profundidade de água vazando para face sólida, e vira balanço de vento',
      ).toBe(0)
    }
  })

  it('água SUBMERSA (com água em cima) não reporta profundidade', () => {
    // Só a superfície mede. A face LATERAL de um bloco de água no meio da
    // coluna não é lâmina, e dar profundidade a ela pintaria a parede do lago
    // com a cor de fundo do mar.
    //
    // Precisa de um lago FINITO: num lago infinito em x/z a água nunca tem
    // face lateral visível (água encosta em água) e o cenário não existe.
    const finito = {
      block: (x, y, z) => {
        const dentro = x >= 2 && x <= 9 && z >= 2 && z <= 9
        if (y <= 3) return pedra
        if (dentro && y <= 9) return agua
        return AIR
      },
      light: () => 0xf0,
      tint: () => [0.4, 0.7, 0.3],
    }
    const vals = profundidades(meshSection(finito, 0, 0, 0).transparent).map(emBlocos)
    const comProf = vals.filter((d) => d > 0).length
    const semProf = vals.filter((d) => d === 0).length
    expect(comProf, 'a superfície tem que medir').toBeGreaterThan(0)
    expect(semProf, 'as faces laterais submersas não podem medir').toBeGreaterThan(0)
  })
})
