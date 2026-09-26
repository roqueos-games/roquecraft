// RoqueCraft - onde a ESCADA encaixa, e virada pra onde.
//
// Arquivo próprio, e não um `if` dentro de `laje.js`, pelo motivo escrito lá:
// forma nova não deve reabrir o arquivo da forma anterior. A laje decide UMA
// coisa (qual metade); a escada decide duas (metade e orientação), e a segunda
// depende de para onde o jogador está olhando — uma entrada que a laje não tem.
//
// Puro: recebe números e chaves, devolve onde, o quê e virado pra onde.

import { BLOCK_BY_KEY, BLOCO_DA_ESCADA, ESCADA_DO_BLOCO, VARIANTE_DE_ESCADA } from './blocks.js'
import { alturaNaCelula } from './voxelRaycast.js'

/** O item é uma escada? (só a variante canônica vira item) */
export const ehItemDeEscada = (item) => !!BLOCO_DA_ESCADA[item]

/**
 * A orientação da escada a partir da direção do OLHAR.
 *
 * O degrau baixo aponta pro jogador — é o lado de onde se sobe. Como o bloco
 * está à frente, a direção do bloco pro jogador é o olhar INVERTIDO, e o eixo
 * dominante desse vetor manda.
 *
 * Recebe o vetor de olhar já pronto (`direcaoDoOlhar` em `aim.js`) em vez de
 * `yaw`: existe UMA fórmula de yaw→vetor neste motor, e ela mora lá. Duas
 * fórmulas independentes pro mesmo vetor já custaram a mira inteira espelhada
 * no eixo X (ver o cabeçalho de `aim.js`).
 */
export function orientacaoPeloOlhar(dirX, dirZ) {
  return Math.abs(dirX) >= Math.abs(dirZ)
    ? dirX > 0
      ? 1 // olhando pro +X → o jogador está no -X → degrau baixo pro -X
      : 0
    : dirZ > 0
      ? 5
      : 4
}

/**
 * ONDE A ESCADA ENCAIXA.
 *
 * Devolve `{ x, y, z, id }` ou `null` se o item não é escada e o chamador deve
 * seguir pelo caminho normal.
 *
 * A METADE segue a mesma regra da laje, e de propósito: quem já entendeu que
 * clicar embaixo de um bloco pendura a laje no teto não deveria ter que
 * reaprender nada pra pendurar uma escada. Face de cima manda a metade de
 * baixo, face de baixo manda a de cima, face lateral decide pela altura do
 * clique.
 *
 * A ORIENTAÇÃO vem do olhar, sempre — inclusive quando se clica no chão ou no
 * teto, onde não há direção horizontal nenhuma na face.
 */
export function encaixarEscada({ item, face, pontoY, destino, dirX, dirZ }) {
  const material = BLOCO_DA_ESCADA[item]
  if (!material) return null
  const canonica = ESCADA_DO_BLOCO[material]
  if (!canonica) return null

  const topo = face === 3 || (face !== 2 && alturaNaCelula(pontoY) > 0.5)
  const orient = orientacaoPeloOlhar(dirX, dirZ)
  const key = VARIANTE_DE_ESCADA[`${canonica}|${orient}|${topo ? 't' : 'b'}`]
  if (!key) return null
  return { ...destino, id: BLOCK_BY_KEY[key].id, orient, topo }
}
