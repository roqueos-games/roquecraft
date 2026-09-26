// GANCHO DE QA: O MUNDO DE BLOCOS PARADO.
//
// Ler a coluna, ler a chave, ler a luz, escrever um paralelepípedo, e perguntar
// ao save o que ele guardou. Tudo que responde "o que EXISTE nesta célula" sem
// depender de tempo passar.
//
// O que se MEXE (fluido escorrendo, bloco caindo) mora em `qaDeFluidos` e
// `qaDeQuedas`, que espelham os serviços `fluidos.js` e `quedas.js` - a mesma
// divisão que o jogo já usa.
//
// É SERVIÇO E NÃO COMPOSABLE: nenhum destes métodos guarda timer, assinatura
// ou listener. Todos leem, um escreve, e nenhum precisa ser desligado.

import { AIR, BLOCKS, BLOCK_BY_KEY, blockDef } from './blocks.js'
import { CAIXAS_DE_BLOCO, EH_FORMA_LIVRE } from './formas.js'
import { dayFactor } from './daycycle.js'
import { toChunkCoord, toLocalCoord, localIndex, chunkKey, SEA_LEVEL } from './constants.js'

/**
 * @param {object} ctx
 * @param {() => object} ctx.world  GETTER: mundo novo recria o cliente.
 * @param {() => number} ctx.ticks  GETTER: `ticks` é variável de módulo do
 *   componente e anda a cada quadro. Um valor capturado daria a luz de um
 *   instante que já passou.
 * @param {Function} ctx.applyEdit  o MESMO caminho de edição do jogo
 * @param {Map} ctx.editsMap  o mapa do registro de edições (criado uma vez)
 */
export function criarQaDeTerreno({ world, ticks, applyEdit, editsMap }) {
  return {
    seaLevel: () => SEA_LEVEL,

    // ⚠️ `surfaceAt` conta FOLHA como topo. Numa floresta ele devolve a copa,
    // não o chão - e a sonda visual passou uma rodada fotografando o telhado da
    // mata achando que fotografava a mata (24/08/2026). Pior: a checagem "estou
    // perto do chão?" comparava a altura do jogador com `surfaceAt`, e os dois
    // mediam a mesma copa. O instrumento concordava com o defeito.
    surfaceAt: (x, z) => world()?.surfaceY(Math.floor(x), Math.floor(z)) ?? null,

    blockKeyAt: (x, y, z) =>
      blockDef(world()?.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)) ?? 0)?.key ?? 'air',

    /**
     * A FORMA DECLARADA de um bloco: as caixas que o render desenha.
     *
     * ⚠️ EXISTE PRA A SONDA NÃO REIMPLEMENTAR A TABELA. A folha de contato de
     * peças (Goal 22, onda 0) compara o que a tela MOSTRA com o que o jogo
     * DECLARA; se a sonda trouxesse as medidas cravadas no próprio arquivo,
     * ela concordaria com o defeito no dia em que a tabela mudasse — que é
     * exatamente o erro que a sonda da aldeia já cometeu uma vez.
     *
     * Devolve `{ caixas, formaLivre, larguraMaxima }` — `larguraMaxima` é o
     * maior lado em X ou Z entre as caixas, que é com o que a silhueta na tela
     * se compara.
     */
    formaDoBloco: (chave) => {
      const b = BLOCK_BY_KEY[chave]
      if (!b) return null
      const caixas = CAIXAS_DE_BLOCO[b.id] || []
      let larguraMaxima = 0
      let alturaMaxima = 0
      for (const c of caixas) {
        larguraMaxima = Math.max(larguraMaxima, c[3] - c[0], c[5] - c[2])
        alturaMaxima = Math.max(alturaMaxima, c[4] - c[1])
      }
      return {
        caixas: caixas.map((c) => c.slice()),
        formaLivre: EH_FORMA_LIVRE[b.id] === 1,
        larguraMaxima: +larguraMaxima.toFixed(4),
        alturaMaxima: +alturaMaxima.toFixed(4),
      }
    },

    // A luz que o motor de criaturas está lendo naquele ponto. `null` = fora do
    // raio espelhado. É a medida direta da ponte de luz.
    luzEm: (x, y, z) => world()?.luzCombinada(x, y, z, dayFactor(ticks())) ?? null,

    // Leitura crua do mundo carregado. O QA precisa disto pra separar "defeito
    // de shader" de "defeito de terreno": quando a agua apareceu com cubos
    // soltos na superficie, so o scan de coluna disse que a geometria estava
    // certa e o problema era o deslocamento por vertice (QA de 2026-08-20).
    //
    // `colunaEm` devolve a coluna CRUA, com o nome de cada bloco, pra quem
    // mede poder decidir o que conta como chão em vez de confiar num número.
    colunaEm: (x, z, deY, ateY) => {
      const w = world()
      if (!w) return null
      const bx = Math.floor(x)
      const bz = Math.floor(z)
      const topo = Math.min(ateY ?? (w.surfaceY(bx, bz) ?? 80) + 2, 255)
      const base = Math.max(deY ?? topo - 24, 0)
      const col = []
      for (let y = topo; y >= base; y--) {
        col.push({ y, bloco: blockDef(w.getBlock(bx, y, bz) ?? 0)?.key || 'air' })
      }
      return col
    },

    // Constroi um paralelepipedo de um bloco so. O QA precisa de CENA
    // CONTROLADA: terreno natural tem inclinacao diferente em cada encosta e
    // nao da pra comparar a mesma face de dois angulos.
    fill: (x0, y0, z0, x1, y1, z1, key) => {
      // AIR nao esta em BLOCKS (e o id 0, ausencia de bloco). Sem este caso o
      // `fill(..., 'air')` devolvia 0 e nao limpava NADA - e todo cenario de QA
      // que dependia de limpar o terreno fotografava a floresta intacta
      // achando que tinha limpado (2026-08-22).
      const id = key === 'air' ? AIR : Object.values(BLOCKS).find((b) => b.key === key)?.id
      if (id === undefined) return 0
      let n = 0
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
        for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
          for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) {
            applyEdit(x, y, z, id)
            n++
          }
      return n
    },

    // Quantas edições estão gravadas pro save. A água muda milhares de células
    // ao encher uma cova; se elas entrassem aqui, o save cresceria sem limite
    // guardando estado que se recalcula sozinho.
    edicoesGravadas: () => {
      let n = 0
      for (const m of editsMap.values()) n += m.size
      return n
    },

    /**
     * O id GRAVADO nesta célula, ou `null` se ela não está no save.
     *
     * Contar o tamanho do mapa não responde a pergunta certa: o mapa é por
     * célula, então reeditar a mesma célula não aumenta nada, e uma sonda que
     * conta tamanho não distingue "não gravou" de "já estava gravada". Isto
     * aqui pergunta a coisa exata - esta gota está no save?
     */
    gravadaEm: (x, y, z) => {
      const m = editsMap.get(chunkKey(toChunkCoord(x), toChunkCoord(z)))
      if (!m) return null
      const v = m.get(localIndex(toLocalCoord(x), y, toLocalCoord(z)))
      return v === undefined ? null : v
    },
  }
}
