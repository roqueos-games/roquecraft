// GANCHO DE QA: ONDE ESTÁ A VILA, E O QUE ELA TEM.
//
// ⚠️ A SONDA NÃO PODE REIMPLEMENTAR O GERADOR, e a sonda da aldeia já cravou a
// coordenada `{ x: -3352, z: -3752 }` no fonte porque não tinha como perguntar.
// Coordenada cravada envelhece em silêncio: mude o raio da célula, o ângulo das
// casas ou o critério de terreno, e a sonda passa a fotografar um campo vazio e
// a relatar "a vila não existe" sobre uma vila perfeitamente construída.
//
// É a mesma armadilha que a sonda do comércio documentou sobre o yaw: quem
// reimplementa a conta testa a própria conta. A resposta é perguntar ao JOGO.
//
// É SERVIÇO E NÃO COMPOSABLE: nenhum método guarda timer, assinatura ou
// listener. Todos leem.

import { colunaDaAldeia, CELULA, RAIO_ESCRITO, porteDe, raioEscritoDe } from './aldeia.js'
import { hash3 } from './noise.js'
import { SEA_LEVEL, toChunkCoord } from './constants.js'
import { BIOME_NAMES, createNoiseContext, solidTopAt, terrainHeight, biomeAt } from './worldgen.js'
import { BLOCKS, AIR } from './blocks.js'
import { planoDaVilaEm } from './lugares.js'
import {
  ALTURA_DO_CASTELO,
  BIOMAS_DO_CASTELO,
  CELULA_DO_CASTELO,
  RAIO_DO_CASTELO,
  colunaDoCastelo,
  planoDoCastelo,
} from './castelo.js'

/**
 * @param {object} ctx
 * @param {{ value: number }} ctx.seed  a semente da partida
 */
export function criarQaDeAldeia({ seed }) {
  // ⚠️ O RUÍDO, E NÃO O MUNDO CARREGADO. A primeira versão disto perguntava a
  // altura ao cliente do mundo (`world().surfaceY`) e não achou vila nenhuma:
  // `surfaceY` só responde por chunk CARREGADO, e a vila mais próxima costuma
  // estar a milhares de blocos — longe de tudo que já foi gerado. Para chegar
  // lá é preciso saber onde ela é, e para saber onde ela é seria preciso já
  // estar lá.
  //
  // `solidTopAt` e `biomeAt` são função pura da coordenada e da semente, e são
  // exatamente as que o `worldgen` usa. Perguntar a elas responde de qualquer
  // distância e concorda com o mundo por construção.
  let nz = null
  let nzDe = null
  const ruido = () => {
    if (nz === null || nzDe !== seed.value) {
      nz = createNoiseContext(seed.value)
      nzDe = seed.value
    }
    return nz
  }

  /**
   * O plano da célula que contém este chunk. A conta mora em `lugares.js`
   * desde o Goal 35: é a mesma que leva o jogador à vila pelo menu K, e a sonda
   * e o jogo têm que perguntar à mesma.
   */
  const planoEm = (cx, cz, porte = 'vila') => planoDaVilaEm(ruido(), seed.value, cx, cz, porte)

  const planoDoForte = (cx, cz) => {
    const n = ruido()
    return planoDoCastelo(
      (a, b, c) => hash3(a, b, c, seed.value),
      {
        alturaEm: (x, z) => solidTopAt(n, x, z),
        nivelDoMar: SEA_LEVEL,
        biomaEm: (x, z) => biomeAt(n, x, z, terrainHeight(n, x, z)),
        biomaAceito: (b) => BIOMAS_DO_CASTELO.includes(BIOME_NAMES[b]),
      },
      cx,
      cz,
    )
  }

  return {
    /** O quadrado que o castelo escreve, e quanto ele sobe. */
    raioDoCastelo: () => RAIO_DO_CASTELO,
    alturaDoCastelo: () => ALTURA_DO_CASTELO,

    /**
     * O castelo mais próximo da origem, varrendo as células em espiral.
     *
     * ⚠️ MAIS ANÉIS QUE A ALDEIA porque nem toda célula tem castelo: só 45%
     * delas, e é isso que o torna a coisa que o jogador conta para alguém ter
     * achado em vez de mais um prédio.
     */
    procurarCastelo: (larguraEmCelulas = 8, ruina = null) => {
      for (let anel = 0; anel <= larguraEmCelulas; anel++) {
        for (let gx = -anel; gx <= anel; gx++) {
          for (let gz = -anel; gz <= anel; gz++) {
            if (Math.max(Math.abs(gx), Math.abs(gz)) !== anel) continue
            const plano = planoDoForte(gx * CELULA_DO_CASTELO, gz * CELULA_DO_CASTELO)
            // ⚠️ O FILTRO EXISTE PARA A SONDA. Sem ele, fotografar "o castelo"
            // devolve ora um inteiro ora uma ruína conforme a semente, e a foto
            // deixa de comparar com a anterior — que é a única coisa que uma
            // folha de contato faz.
            if (plano && (ruina === null || plano.ruina === ruina)) return { ...plano, anel }
          }
        }
      }
      return null
    },

    /** O que o gerador manda escrever nesta coluna DESTE castelo. */
    colunaDoForte: (plano, x, z) =>
      colunaDoCastelo(plano, x, z, (a, b) => solidTopAt(ruido(), a, b))?.map(
        (e) => `${e.y}:${BLOCKS[e.id]?.key ?? e.id}`,
      ),

    /** O inventário do plano do castelo, no mesmo formato do da vila. */
    inventarioDoCastelo: (plano) => {
      if (!plano) return null
      const alt = (a, b) => solidTopAt(ruido(), a, b)
      const tipos = {}
      let colunas = 0
      let solidos = 0
      let topo = plano.chao
      let fundo = plano.chao
      const R = RAIO_DO_CASTELO + 3
      for (let x = plano.centro.x - R; x <= plano.centro.x + R; x++) {
        for (let z = plano.centro.z - R; z <= plano.centro.z + R; z++) {
          const col = colunaDoCastelo(plano, x, z, alt)
          if (col === null) continue
          colunas++
          for (const { y, id } of col) {
            if (y > topo) topo = y
            if (y < fundo) fundo = y
            if (id === AIR) continue
            solidos++
            const k = BLOCKS[id]?.key ?? String(id)
            tipos[k] = (tipos[k] ?? 0) + 1
          }
        }
      }
      return {
        colunas,
        blocosSolidos: solidos,
        tiposDeBloco: Object.keys(tipos).length,
        alturaAcimaDoChao: topo - plano.chao,
        profundidade: plano.chao - fundo,
        porTipo: tipos,
      }
    },

    /**
     * O quadrado que a vila ESCREVE, em blocos a partir do centro.
     *
     * ⚠️ A SONDA CRAVAVA 26 e a vila passou a escrever até 33 na onda 2: ela
     * contava sete casas de nove e relatava "planejada e não construída" sobre
     * uma vila inteira e correta. O número tem que sair de quem o define.
     */
    raioDaVila: () => RAIO_ESCRITO,

    /**
     * O que o gerador manda escrever nesta coluna DESTE plano.
     *
     * ⚠️ RECEBE O PLANO, e não o recalcula pela coordenada. `colunaDaVila`
     * recalcula, e por isso discorda de si mesma nas colunas de borda: uma
     * coluna a 33 blocos do centro pode cair no chunk de outra CÉLULA da grade,
     * onde a aldeia é outra ou não existe. Quem compara plano com mundo precisa
     * dos dois lados falando do MESMO plano.
     */
    colunaDoPlano: (plano, x, z) =>
      colunaDaAldeia(plano, x, z, (a, b) => solidTopAt(ruido(), a, b))?.map(
        (e) => `${e.y}:${BLOCKS[e.id]?.key ?? e.id}`,
      ),

    /** O que o GERADOR manda escrever nesta coluna — para comparar com o mundo. */
    colunaDaVila: (x, z) => {
      const plano = planoEm(toChunkCoord(Math.floor(x)), toChunkCoord(Math.floor(z)))
      const alt = (a, b) => solidTopAt(ruido(), a, b)
      const col = colunaDaAldeia(plano, Math.floor(x), Math.floor(z), alt)
      return col && col.map((e) => `${e.y}:${BLOCKS[e.id]?.key ?? e.id}`)
    },

    /** O plano da aldeia da célula onde o jogador está, ou `null`. */
    aldeiaAqui: (x, z) => planoEm(toChunkCoord(Math.floor(x)), toChunkCoord(Math.floor(z))),

    /**
     * A aldeia mais próxima da origem, varrendo as células em espiral quadrada.
     *
     * ⚠️ ISTO CUSTA CINCO `surfaceY` POR CÉLULA e nada mais: `planoDaAldeia`
     * recusa pelo terreno antes de montar qualquer casa. Uma varredura de 8
     * células de lado são 64 planos e ~320 colunas — barato o bastante para uma
     * sonda, caro demais para o laço do jogo, e é por isso que mora aqui.
     */
    /**
     * A CIDADE mais próxima da origem — a grade dela é outra (38 chunks de
     * célula), então a espiral anda em células de cidade. Cara: cada célula
     * são cinco `surfaceY` e a cidade só nasce em terreno plano num raio de
     * 60; 6 anéis são 169 células.
     */
    procurarCidade: (larguraEmCelulas = 6) => {
      const celula = porteDe('cidade').celula
      for (let anel = 0; anel <= larguraEmCelulas; anel++) {
        for (let gx = -anel; gx <= anel; gx++) {
          for (let gz = -anel; gz <= anel; gz++) {
            if (Math.max(Math.abs(gx), Math.abs(gz)) !== anel) continue
            const plano = planoEm(gx * celula, gz * celula, 'cidade')
            if (plano) return { ...plano, anel, raioEscrito: raioEscritoDe('cidade') }
          }
        }
      }
      return null
    },

    procurarAldeia: (larguraEmCelulas = 6) => {
      for (let anel = 0; anel <= larguraEmCelulas; anel++) {
        for (let gx = -anel; gx <= anel; gx++) {
          for (let gz = -anel; gz <= anel; gz++) {
            if (Math.max(Math.abs(gx), Math.abs(gz)) !== anel) continue
            const plano = planoEm(gx * CELULA, gz * CELULA)
            if (plano) return { ...plano, anel }
          }
        }
      }
      return null
    },

    /**
     * O que o GERADOR diz que esta vila tem — a mesma conta do inventário de
     * unidade, mas com o mundo do jogo respondendo pela altura e pelo bioma.
     *
     * ⚠️ NÃO É O QUE ESTÁ NO MUNDO. Isto é o PLANO; comparar este número com a
     * contagem feita por `blockKeyAt` é o que separa "a vila não foi desenhada"
     * de "a vila não foi construída", que são defeitos diferentes e têm donos
     * diferentes.
     */
    inventarioDoPlano: (plano) => {
      if (!plano) return null
      const tipos = {}
      let colunas = 0
      let solidos = 0
      let luzes = 0
      let moveis = 0
      let topo = plano.chao
      let fundo = plano.chao
      // ⚠️ COM O TERRENO REAL, e não sobre uma planície imaginária. A vila
      // preenche até o chão onde ele está abaixo do nível dela; contar o plano
      // sem isso daria menos blocos do que o mundo tem, e a sonda acusaria a
      // vila de ter blocos A MAIS — que é o oposto do defeito que ela procura.
      const alt = (a, b) => solidTopAt(ruido(), a, b)
      // O raio do PORTE do plano: a cidade escreve até a igreja, além do da vila.
      const R = raioEscritoDe(plano.porte)
      for (let x = plano.centro.x - R; x <= plano.centro.x + R; x++) {
        for (let z = plano.centro.z - R; z <= plano.centro.z + R; z++) {
          const col = colunaDaAldeia(plano, x, z, alt)
          if (col === null) continue
          colunas++
          for (const { y, id } of col) {
            if (y > topo) topo = y
            if (y < fundo) fundo = y
            if (id === AIR) continue
            solidos++
            const def = BLOCKS[id]
            const k = def?.key ?? String(id)
            tipos[k] = (tipos[k] ?? 0) + 1
            if (def?.light > 0) luzes++
            if (def?.interact) moveis++
          }
        }
      }
      return {
        colunasDaVila: colunas,
        blocosSolidos: solidos,
        tiposDeBloco: Object.keys(tipos).length,
        fontesDeLuz: luzes,
        moveis,
        alturaAcimaDoChao: topo - plano.chao,
        // ⚠️ A VILA TAMBÉM DESCE. O embasamento que ela põe onde o terreno está
        // abaixo do nível dela fica FORA de qualquer caixa que comece no chão —
        // e a sonda contava 546 pedregulhos onde o plano previa 837, acusando
        // de ausente exatamente a correção que acabara de entrar.
        profundidade: plano.chao - fundo,
        porTipo: tipos,
      }
    },
  }
}
