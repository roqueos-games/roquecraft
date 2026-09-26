//
// O INVENTÁRIO DA VILA — a régua do Goal 19.
//
// ⚠️ "ESTÁ FEIO" NÃO REPROVA NADA, e foi assim que a vila ficou cinco casas
// iguais por três rodadas. O founder olhou e disse que estava feio; a suíte
// estava verde, porque tudo que ela media era se a casa tinha a forma que o
// código dizia que ela tinha. Forma certa e vila pobre passam juntas.
//
// Este arquivo conta o que a vila TEM: quantas colunas ela ocupa, quantos
// blocos sólidos, quantos tipos diferentes, quantas fontes de luz, quantos
// móveis, quanto ela sobe acima do chão. Os números vão para
// `test/inventario-da-vila.json` e SÓ SOBEM.
//
// ⚠️ A CONTA PASSA PELO DESPACHANTE, e não pelas peças. Contar `blocoDaCasa`
// diretamente mediria a casa que o teste conhece; `colunaDaAldeia` é o que o
// `worldgen` chama, então estrutura que existe no módulo e não chega no mundo
// aparece aqui como zero — que é exatamente o defeito que a gente quer ver.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  planoDaAldeia,
  colunaDaAldeia,
  dentroDoRaio,
  RAIO_ESCRITO,
  CELULA,
} from '../../src/servicos/aldeia.js'
import { BLOCKS, ID, AIR } from '../../src/servicos/blocks.js'

const MANIFESTO = resolve('test/inventario-da-vila.json')
const manifesto = JSON.parse(readFileSync(MANIFESTO, 'utf8'))

/** O mesmo hash do worldgen: função pura da coordenada e da semente. */
const hash = (a, b, c) => {
  let h = (a * 374761393 + b * 668265263 + c * 2246822519) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** Planície plana e larga: o terreno não é o que está em teste aqui. */
const planicie = { alturaEm: () => 70, nivelDoMar: 62 }

/**
 * Varre o quadrado inteiro da vila pelo despachante e conta o que sai.
 *
 * ⚠️ MÓVEL É O QUE O JOGADOR USA, não o que é bonito: a definição vem de
 * `interact` no catálogo de blocos (cama, baú, bancada, fornalha, mesa de
 * encanto), que é o mesmo dado que faz o clique abrir alguma coisa. Um "móvel"
 * decorativo que não responde ao clique não conta, de propósito.
 */
export function inventario(plano) {
  const tipos = new Map()
  let colunas = 0
  let solidos = 0
  let luzes = 0
  let moveis = 0
  let topo = plano.chao
  // ⚠️ `RAIO_ESCRITO` E NÃO `RAIO`. `RAIO` limita onde o CENTRO de uma estrutura
  // cai; a estrutura avança a partir dele. Esta varredura usou `RAIO` desde a
  // onda 0 e por isso vinha SUBCONTANDO em silêncio conforme a vila crescia —
  // na onda 3 ela via um portão de roça de três. A catraca só sobe, então o erro
  // nunca reprovou nada: ele só escondeu entrega.
  for (let x = plano.centro.x - RAIO_ESCRITO; x <= plano.centro.x + RAIO_ESCRITO; x++) {
    for (let z = plano.centro.z - RAIO_ESCRITO; z <= plano.centro.z + RAIO_ESCRITO; z++) {
      const col = colunaDaAldeia(plano, x, z)
      if (col === null) continue
      colunas++
      for (const { y, id } of col) {
        if (y > topo) topo = y
        if (id === AIR) continue
        solidos++
        tipos.set(id, (tipos.get(id) ?? 0) + 1)
        const def = BLOCKS[id]
        if (def?.light > 0) luzes++
        if (def?.interact) moveis++
      }
    }
  }
  return {
    estruturas: plano.casas.length,
    colunasDaVila: colunas,
    blocosSolidos: solidos,
    tiposDeBloco: tipos.size,
    fontesDeLuz: luzes,
    moveis,
    vidros: tipos.get(ID.glass) ?? 0,
    alturaAcimaDoChao: topo - plano.chao,
    porTipo: tipos,
  }
}

const plano = planoDaAldeia(hash, planicie, 0, 0)

/**
 * A MEDIANA de doze vilas, e não uma.
 *
 * ⚠️ MEDIR UMA VILA SÓ TORNA A RÉGUA REFÉM DA GRADE. Esta catraca media a vila
 * da célula (0,0); quando a célula encolheu de 24 para 16 chunks, a vila daquele
 * ponto virou OUTRA — de nove casas para oito — e a régua acusou queda de 4.775
 * para 4.650 blocos sobre uma entrega que não tinha piorado em nada. Uma régua
 * que se move quando a grade se move mede a grade, não a vila.
 *
 * Doze vilas e a mediana: o número passa a descrever a vila TÍPICA, e sobrevive
 * a qualquer mudança de grade que não mude o que a vila tem dentro.
 */
function inventarioTipico() {
  const medidas = []
  for (let g = 0; medidas.length < 12 && g < 60; g++) {
    const p = planoDaAldeia(hash, planicie, g * CELULA, g * 7 * CELULA)
    if (p) medidas.push(inventario(p))
  }
  const mediana = (chave) => {
    const ord = medidas.map((m) => m[chave]).sort((a, b) => a - b)
    return ord[(ord.length - 1) >> 1]
  }
  const fora = { porTipo: new Map() }
  for (const chave of Object.keys(medidas[0])) {
    if (chave === 'porTipo') continue
    fora[chave] = mediana(chave)
  }
  fora.estruturas = mediana('estruturas')
  return fora
}

describe('o inventário da vila', () => {
  it('a vila da planície existe — sem ela todo o resto mede zero', () => {
    expect(plano, 'planície plana sem aldeia significa que o gerador mudou').not.toBeNull()
    expect(plano.casas.length).toBeGreaterThanOrEqual(manifesto.minimos.estruturas)
  })

  const medido = inventarioTipico()

  for (const [chave, minimo] of Object.entries(manifesto.minimos)) {
    if (chave === 'estruturas') continue
    it(`${chave} tem pelo menos ${minimo} — a catraca só sobe`, () => {
      expect(
        medido[chave],
        `${chave} caiu de ${minimo} para ${medido[chave]}. Se a queda é de propósito, ` +
          `ela precisa estar escrita no histórico de inventario-da-vila.json antes de baixar o número.`,
      ).toBeGreaterThanOrEqual(minimo)
    })
  }

  it('CONTROLE: sem casa nenhuma sobra a praça, e só ela', () => {
    // Sem este controle, um `colunaDaAldeia` que devolvesse `null` para tudo
    // passaria despercebido — a catraca leria "vila pobre" como "vila que
    // encolheu", e não como "vila que sumiu".
    //
    // ⚠️ A PRIMEIRA VERSÃO DISTO ESPERAVA ZERO, e reprovou quando a praça
    // entrou. O teste estava desatualizado, não o código: praça é da VILA, não
    // das casas, e continua de pé mesmo sem nenhuma. O que some junto com as
    // casas é o caminho, porque `ehCaminho` liga a praça a cada porta.
    const vazio = inventario({ ...plano, casas: [], postes: [], rocas: [] })
    expect(vazio.blocosSolidos, 'a praça sumiu junto com as casas').toBeGreaterThan(0)
    expect(
      vazio.porTipo.get(ID.bed) ?? 0,
      'cama sem casa: a mobília vazou da casa para a praça',
    ).toBe(0)
    expect(vazio.colunasDaVila).toBeLessThan(medido.colunasDaVila)
  })

  it('o manifesto diz por que existe, e quando foi medido', () => {
    expect(manifesto._porque.length, 'número sem motivo é número solto').toBeGreaterThan(80)
    expect(manifesto.medidoEm).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(manifesto.historico.length).toBeGreaterThan(0)
  })

  it('a vila cabe no raio que ela declara', () => {
    for (const casa of plano.casas) {
      expect(
        dentroDoRaio(plano.centro, casa.x, casa.z),
        'casa fora do raio vaza pra célula vizinha',
      ).toBe(true)
    }
  })
})
