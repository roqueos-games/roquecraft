import { describe, it, expect } from 'vitest'
import { criarQaDeAldeia } from '../../src/servicos/qaDeAldeia.js'
import { CELULA_DO_CASTELO } from '../../src/servicos/castelo.js'

//
// ⚠️ O GANCHO DE QA TAMBÉM PRECISA DE TESTE, e este arquivo nasceu de um
// revisor cobrando: os sete irmãos dele (`qaDeTerreno`, `qaDeCena`, `qaDeMobs`,
// `qaDeTempo`, `qaDeFluidos`, `qaDeMira`) têm o seu, e este tinha ficado sem.
//
// Não é formalidade. Este módulo é o INSTRUMENTO: é ele que diz à sonda onde
// está a vila e o que o gerador mandou pôr em cada coluna. Instrumento errado
// acusa o inocente — e nesta rodada ele já fez isso duas vezes, as duas por
// número que ele não devia conhecer:
//
//   · a sonda cravava raio 26 enquanto a vila passou a escrever até 35, e
//     relatou "planejada e não construída" sobre uma vila inteira e correta;
//   · `colunaDaVila` recalcula o plano pela coordenada e por isso discorda de
//     si mesma nas colunas de borda, onde o chunk cai em outra célula da grade.
//
// Os dois viraram teste aqui.

/** A semente entra como REF, porque no componente ela é `let` e troca. */
const contexto = (valor = 1337) => ({ seed: { value: valor } })

describe('o gancho de QA da aldeia', () => {
  it('a semente entra por REF, e o gancho enxerga a troca', () => {
    // ⚠️ A REGRA DA CASA: `let` do componente entra por getter ou ref, nunca por
    // valor. Um falso que devolve sempre o mesmo número passa com as duas
    // formas e não testa nada, então este TROCA no meio.
    const ctx = contexto(1)
    const qa = criarQaDeAldeia(ctx)
    const a = qa.procurarAldeia(2)
    ctx.seed.value = 99
    const b = qa.procurarAldeia(2)
    expect(a && b, 'sem aldeia em nenhuma das sementes: o teste não separa nada').toBeTruthy()
    expect(
      [b.centro.x, b.centro.z],
      'o gancho guardou a semente antiga: a troca não chegou nele',
    ).not.toEqual([a.centro.x, a.centro.z])
  })

  it('acha aldeia SEM chunk carregado — ele pergunta ao ruído, não ao mundo', () => {
    // ⚠️ A primeira versão perguntava a altura ao cliente do mundo e não achava
    // vila nenhuma: `surfaceY` só responde por chunk CARREGADO, e a vila mais
    // próxima costuma estar a milhares de blocos. Para chegar lá é preciso saber
    // onde ela é, e para saber onde ela é seria preciso já estar lá.
    const qa = criarQaDeAldeia(contexto())
    const plano = qa.procurarAldeia(6)
    expect(plano, 'nenhuma aldeia em 13×13 células').not.toBeNull()
    expect(plano.casas.length).toBeGreaterThan(0)
    expect(plano.chao).toBeGreaterThan(0)
  })

  it('o raio que ele publica é o que a vila ESCREVE, não onde os centros caem', () => {
    // ⚠️ É o número que a sonda usa para montar a caixa de contagem. Cravado em
    // 26 na sonda, ele deixou de cobrir a vila quando ela cresceu: 281 escadas
    // contadas de 292, e o relato foi "planejada e não construída" sobre uma
    // vila correta. A casa mais afastada precisa CABER nele.
    const qa = criarQaDeAldeia(contexto())
    const plano = qa.procurarAldeia(6)
    const raio = qa.raioDaVila()
    for (const c of plano.casas) {
      const borda = Math.max(c.planta.lx, c.planta.lz) + 1
      expect(
        Math.abs(c.x - plano.centro.x) + borda,
        `casa ${c.planta.nome} fora da caixa`,
      ).toBeLessThanOrEqual(raio)
      expect(Math.abs(c.z - plano.centro.z) + borda).toBeLessThanOrEqual(raio)
    }
  })

  it('o inventário do plano conta pelo DESPACHANTE, com o terreno real', () => {
    const qa = criarQaDeAldeia(contexto())
    const inv = qa.inventarioDoPlano(qa.procurarAldeia(6))
    expect(inv.blocosSolidos).toBeGreaterThan(0)
    expect(inv.tiposDeBloco).toBeGreaterThan(5)
    expect(inv.alturaAcimaDoChao).toBeGreaterThan(0)
    // A profundidade existe porque a vila também DESCE: o embasamento que ela
    // põe onde o terreno está abaixo dela fica fora de qualquer caixa que
    // comece no chão.
    expect(inv.profundidade).toBeGreaterThanOrEqual(0)
    expect(qa.inventarioDoPlano(null), 'plano nulo tem que devolver nulo, não zero').toBeNull()
  })

  it('`colunaDoPlano` e `colunaDaVila` são coisas DIFERENTES, e a borda mostra', () => {
    // ⚠️ `colunaDaVila` recalcula o plano pela coordenada; uma coluna a 35
    // blocos do centro pode cair no chunk de outra CÉLULA da grade, onde a
    // aldeia é outra ou não existe. Quem compara plano com mundo precisa dos
    // dois lados falando do MESMO plano — foi por isso que `colunaDoPlano`
    // existe, e é por isso que ela recebe o plano em vez de procurá-lo.
    const qa = criarQaDeAldeia(contexto())
    const plano = qa.procurarAldeia(6)
    const c = plano.casas[0]
    expect(qa.colunaDoPlano(plano, c.x, c.z), 'o centro da casa não é da vila').toBeTruthy()
    expect(
      qa.colunaDoPlano(plano, plano.centro.x + qa.raioDaVila() + 40, plano.centro.z),
      'longe demais continua sendo da vila',
    ).toBeFalsy()
  })

  it('acha castelo, e o filtro de ruína separa os dois', () => {
    // ⚠️ Sem o filtro, fotografar "o castelo" devolve ora um inteiro ora uma
    // ruína conforme a semente, e a foto deixa de comparar com a anterior — que
    // é a única coisa que uma folha de contato faz.
    const qa = criarQaDeAldeia(contexto())
    const inteiro = qa.procurarCastelo(10, false)
    const ruina = qa.procurarCastelo(12, true)
    expect(inteiro, 'nenhum castelo inteiro em 21×21 células').not.toBeNull()
    expect(ruina, 'nenhuma ruína em 25×25 células').not.toBeNull()
    expect(inteiro.ruina).toBe(false)
    expect(ruina.ruina).toBe(true)
  })

  it('o inventário do castelo mede o castelo, e não a vila', () => {
    const qa = criarQaDeAldeia(contexto())
    const inv = qa.inventarioDoCastelo(qa.procurarCastelo(10, false))
    expect(inv.blocosSolidos).toBeGreaterThan(1000)
    expect(inv.alturaAcimaDoChao).toBeGreaterThan(10)
    expect(qa.inventarioDoCastelo(null)).toBeNull()
  })

  it('CONTROLE: célula sem castelo devolve nulo, e não um castelo vazio', () => {
    // Sem este controle, um `planoDoCastelo` que devolvesse sempre um objeto
    // faria `procurarCastelo` achar castelo em toda célula — e a frequência,
    // que é uma decisão, viraria 100% sem nada reprovar.
    const qa = criarQaDeAldeia(contexto())
    let nulos = 0
    for (let g = 0; g < 40; g++) {
      if (!qa.colunaDoForte(null, g, 0)) nulos++
    }
    expect(nulos).toBe(40)
    expect(qa.procurarCastelo(0, true) === null || qa.procurarCastelo(0, true).ruina).toBe(true)
    expect(CELULA_DO_CASTELO).toBeGreaterThan(0)
  })
})
