// RoqueCraft — O FIM DE JOGO: o dragão cai, o portal de saída acende, os
// créditos rolam.
//
// Puro (recebe o que precisa por `ctx`). É o único lugar que sabe a ORDEM das
// três coisas, e ela importa: o portal acende no mesmo quadro em que o dragão
// cai (o jogador está olhando), o save guarda que ele caiu (o dragão não
// renasce ao reabrir), e os créditos só rolam quando o jogador ATRAVESSA o
// portal de saída — não ao cair o dragão, porque a recompensa é a volta.
//
import { FONTE } from './endWorldgen.js'
import { MIOLO } from './portalDoFim.js'
import { ID } from './blocks.js'

/** As nove células do portal de saída: o miolo da fonte, um acima do degrau. */
export const celulasDaSaida = () =>
  MIOLO.map(([dx, dz]) => ({ x: FONTE.x + dx, y: FONTE.y + 1, z: FONTE.z + dz, id: ID.endPortal }))

/**
 * @param {object} ctx
 * @param {() => boolean} ctx.dragaoMorto  GETTER do save
 * @param {(v: boolean) => void} ctx.marcarDragaoMorto  ESCRITA no save
 * @param {(x, y, z, id) => void} ctx.editar  o caminho de edição do mundo
 * @param {(chave: string) => void} ctx.avisar
 * @param {() => void} ctx.salvar
 * @param {() => void} ctx.rolarCreditos  abre a tela de créditos
 */
export function criarFimDeJogo(ctx) {
  return {
    /** O motor de entidades pergunta: o dragão deve estar no Fim? */
    dragaoDeveExistir: () => !ctx.dragaoMorto(),

    /** O dragão caiu: portal de saída, save, aviso. Idempotente. */
    dragaoCaiu() {
      if (ctx.dragaoMorto()) return false
      ctx.marcarDragaoMorto(true)
      for (const c of celulasDaSaida()) ctx.editar(c.x, c.y, c.z, c.id)
      ctx.avisar('roqueCraft.fim.dragaoCaiu')
      ctx.salvar()
      return true
    },

    /**
     * O jogador saiu do Fim pelo portal. Com o dragão morto, é a vitória: os
     * créditos rolam. Sem (não há portal de saída sem dragão morto, mas a
     * fortaleza-para-o-Fim também é um portal), nada.
     */
    saiuDoFim() {
      if (!ctx.dragaoMorto()) return false
      ctx.rolarCreditos()
      return true
    },
  }
}
