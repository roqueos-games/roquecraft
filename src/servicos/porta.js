// RoqueCraft — A PORTA: onde cabe, qual é a outra metade, e como vira.
//
// Puro: sem three, sem mundo, sem Vue. É a cama (duas células, ou as duas ou
// nenhuma) casada com o portão (nasce virada para o jogador, o clique vira).
//
// ⚠️ A METADE DE CIMA NÃO É UM BLOCO SOZINHO. Ela existe porque a porta tem
// dois blocos de altura, e por mais nada: não vira item, não dropa, e some com
// a de baixo. Um mundo com uma metade de cima órfã é um mundo com uma tábua
// flutuando que ainda responde a "abrir".
import { BLOCKS, ID, BLOCO_DA_PORTA, VARIANTE_DE_PORTA } from './blocks.js'
import { orientacaoPeloOlhar } from './escada.js'

export const ehPorta = (id) => !!BLOCKS[id]?.porta

/** O id da variante pedida, ou `undefined` se a família não existe. */
export function idDaPorta(chave, orient, aberta, cima) {
  return ID[VARIANTE_DE_PORTA[`${chave}|${orient}|${aberta ? 'a' : 'f'}|${cima ? 'c' : 'b'}`]]
}

/**
 * ONDE A PORTA CABE.
 *
 * Devolve `{ baixo, cima }` ou `null`. A de baixo fica na célula mirada; a de
 * cima, uma acima. As duas precisam estar livres e a de baixo apoiada — porta
 * pendurada no ar é a mesma tábua-fantasma da cama sem chão.
 *
 * Nasce FECHADA e virada para o jogador: a folha fica no plano mais próximo de
 * quem colocou, que é o único jeito de a porta "olhar" para fora da casa.
 */
export function encaixarPorta({ item, destino, dirX, dirZ, livre, apoiado }) {
  // O item é a chave canônica da família (`oakDoor`): a metade de baixo, fechada,
  // na primeira orientação. Qualquer outra chave não é porta na mão.
  const familia = BLOCO_DA_PORTA[item] === item ? item : null
  if (!familia) return null
  const orient = orientacaoPeloOlhar(dirX, dirZ)
  const baixo = { ...destino, id: idDaPorta(familia, orient, false, false) }
  const cima = {
    x: destino.x,
    y: destino.y + 1,
    z: destino.z,
    id: idDaPorta(familia, orient, false, true),
  }
  if (baixo.id === undefined || cima.id === undefined) return null
  if (!livre(baixo.x, baixo.y, baixo.z) || !livre(cima.x, cima.y, cima.z)) return null
  if (!apoiado(baixo.x, baixo.y - 1, baixo.z)) return null
  return { baixo, cima }
}

/**
 * A OUTRA METADE desta porta, ou `null` se ela não estiver lá.
 *
 * Não há ambiguidade aqui, ao contrário da cama: a outra metade é sempre a
 * célula de cima (se sou a de baixo) ou a de baixo (se sou a de cima), e tem
 * que ser a MESMA família, orientação e estado — senão é outra porta.
 */
export function outraMetadeDaPorta(id, x, y, z, blocoEm) {
  const eu = BLOCKS[id]?.porta
  if (!eu) return null
  const familia = BLOCO_DA_PORTA[BLOCKS[id].key]
  const yOutra = eu.cima ? y - 1 : y + 1
  const esperado = idDaPorta(familia, eu.orient, eu.aberta, !eu.cima)
  if (blocoEm(x, yOutra, z) !== esperado) return null
  return { x, y: yOutra, z, id: esperado }
}

/**
 * ABRIR OU FECHAR: as duas metades viram JUNTAS.
 *
 * Devolve a lista de escritas `[{x,y,z,id}]`, ou `[]` se o id não é porta.
 * Se a outra metade sumiu (save antigo, edição estranha), vira só esta — uma
 * metade que não vira é pior que uma porta de uma folha só.
 */
export function virarPorta(id, x, y, z, blocoEm) {
  const eu = BLOCKS[id]?.porta
  if (!eu) return []
  const familia = BLOCO_DA_PORTA[BLOCKS[id].key]
  const escritas = [{ x, y, z, id: idDaPorta(familia, eu.orient, !eu.aberta, eu.cima) }]
  const outra = outraMetadeDaPorta(id, x, y, z, blocoEm)
  if (outra) escritas.push({ ...outra, id: idDaPorta(familia, eu.orient, !eu.aberta, !eu.cima) })
  return escritas
}
