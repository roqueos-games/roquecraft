// RoqueCraft - O QUE CAI NO CHÃO QUANDO O JOGADOR MORRE.
//
// ⚠️ ESTE ARQUIVO EXISTE PORQUE MORRER CONSERTAVA FERRAMENTA (RC-08).
//
// O laço era:
//
//     for (const s of inventory.value) {
//       if (!s) continue
//       soltarItem(s.item, s.count, x, y, z, cor)
//     }
//
// Sem `s.dur`. E `soltarItem` aceita `extras` justamente porque item com
// durabilidade não pode ser largado como novo — o comentário de lá diz isso,
// para o caso do baú. Aqui ninguém passou.
//
// O efeito é pior do que parece. Não é só "a picareta volta nova": é que morrer
// vira uma OFICINA. Com a picareta de diamante em 3 de 1562 de durabilidade,
// pular de um penhasco e recolher os itens devolve uma picareta zerada. O
// jogador que descobre isso para de reparar qualquer coisa, e o custo inteiro
// das ferramentas — que é metade da progressão do jogo — deixa de existir.
//
// Puro: entra o inventário e onde o jogador morreu, sai a lista do que cai.
// Quem cria as entidades no mundo é o componente.

/** Cor do brilho do item largado na morte. Mesma de antes. */
import { espolioDaArmadura } from './armadura.js'

export const COR_DO_ESPOLIO = 0xcccccc

/**
 * @param {Array} inventario  slots do jogador (com buracos)
 * @param {{x:number,y:number,z:number}} onde
 * @returns {Array<{item:string,count:number,dur:number|null,x:number,y:number,z:number,cor:number}>}
 */
export function espolioDaMorte(inventario, onde, armadura = null) {
  // A armadura vestida cai junto: ela não está na mochila, e sem esta linha
  // morrer de peitoral de diamante era perder o peitoral em silêncio.
  const saida = espolioDaArmadura(armadura, onde, COR_DO_ESPOLIO)
  for (const s of inventario || []) {
    if (!s || !s.item || !(s.count > 0)) continue
    saida.push({
      item: s.item,
      count: s.count,
      // `?? null` e não `|| null`: durabilidade 0 é um valor legítimo (a
      // ferramenta na última batida), e `||` a transformaria em "sem
      // durabilidade" — ou seja, em ferramenta nova, que é o defeito.
      dur: s.dur ?? null,
      // Encanto e poção modificada vão junto pelo mesmo motivo.
      ...(s.enc ? { enc: { ...s.enc } } : {}),
      ...(s.pocao ? { pocao: { ...s.pocao } } : {}),
      x: onde.x,
      y: onde.y + 0.5,
      z: onde.z,
      cor: COR_DO_ESPOLIO,
    })
  }
  return saida
}
