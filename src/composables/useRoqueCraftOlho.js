import { olhoSeguro as olhoLivre } from '../servicos/olho.js'
import { EYE_HEIGHT } from '../servicos/physics.js'

// O OLHO: onde a câmera está, e o quanto de água há entre ela e o ar.
//
// ⚠️ AS DUAS PERGUNTAS ANDAM JUNTAS e moravam separadas por setecentas linhas
// dentro de `ROSRoqueCraft.vue` — `profundidadeDoOlho` lá em cima, com o estado
// de UI, e `olhoSeguro` lá embaixo, junto do laço de quadro. São a MESMA
// pergunta feita duas vezes: onde está o olho do jogador, e o que ele atravessa
// para enxergar. Juntá-las não é arrumação: é o que impede a terceira versão de
// "a posição da câmera" de nascer num terceiro canto do arquivo.
//
// A regra de onde a câmera CABE (não renderizar de dentro de um bloco) é pura e
// mora em `services/roquecraft/olho.js`. Aqui fica a amarração com o mundo vivo,
// que é a parte que precisa do `world` — e o `world` é reatribuído em troca de
// dimensão e de qualidade, por isso ele entra por ACESSOR e nunca por valor.

/** Até onde a absorção de água ainda muda alguma coisa. Ver `FUNDO_DE_REFERENCIA`. */
export const FUNDO_MAXIMO = 64

/**
 * @param {object} ctx
 * @param {object} ctx.jogador  o corpo (x, y, z)
 * @param {() => object|null} ctx.mundo  GETTER: o mundo é recriado
 * @param {() => boolean} ctx.submerso  a cabeça está na água?
 * @param {(id:number) => object|null} ctx.defDoBloco  `blockDef`
 */
export function useRoqueCraftOlho({ jogador: p, mundo, submerso, defDoBloco }) {
  /** O que a regra pura pergunta ao mundo. */
  const mundoDoOlho = {
    ehOpaco: (x, y, z) => !!mundo()?.opaqueAt(x, y, z),
    chaveEm: (x, y, z) => defDoBloco(mundo()?.getBlock(x, y, z))?.key || '',
  }

  /** A posição da câmera, já afastada de dentro de um bloco se preciso. */
  const posicao = () => {
    const w = mundo()
    return w ? olhoLivre(mundoDoOlho, p.x, p.y, p.z, EYE_HEIGHT) : [p.x, p.y + EYE_HEIGHT, p.z]
  }

  /**
   * Espessura de água entre a superfície e o OLHO, em blocos.
   *
   * Sobe a coluna a partir da câmera enquanto houver líquido e devolve quantos
   * blocos percorreu. Zero fora d'água. O teto de 64 não é medo de laço
   * infinito — é o custo: uma coluna de oceano tem dezenas de células e isto
   * roda todo quadro, então a busca para onde a curva de absorção já saturou
   * de qualquer jeito (`FUNDO_DE_REFERENCIA` é 22).
   */
  const profundidade = () => {
    const w = mundo()
    if (!w || !submerso()) return 0
    const bx = Math.floor(p.x)
    const bz = Math.floor(p.z)
    const olho = Math.floor(p.y + EYE_HEIGHT)
    let d = 0
    while (d < FUNDO_MAXIMO && w.liquidAt(bx, olho + d, bz)) d++
    return d
  }

  return { mundoDoOlho, posicao, profundidade }
}
