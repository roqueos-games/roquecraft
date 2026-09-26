// RoqueCraft - QUAL VARIANTE DO BLOCO ENTRA NA CELULA.
//
// Um item nao vira um id so. Uma tocha vira tocha de chao ou tocha de parede
// (quatro delas, uma por lado); um portao vira uma de oito variantes, pela
// direcao de quem colocou; uma laje ou escada ja chega com o id decidido pelo
// encaixe. Escolher errado nao da erro nenhum: da uma peca virada pro lado
// errado, e o jogador so descobre quando tenta atravessar o portao.
//
// Isto morava em `doPlace` como um ternario aninhado de vinte e cinco linhas com
// quatro niveis. Estava certo e era ilegivel -- que e a pior combinacao, porque
// ninguem consegue conferir e ninguem ousa mexer.

import {
  ID,
  blockDef,
  TOCHA_DE_PAREDE,
  BLOCO_DO_PORTAO,
  VARIANTE_DE_PORTAO,
  BLOCO_DO_ALCAPAO,
  VARIANTE_DE_ALCAPAO,
} from './blocks.js'
import { orientacaoPeloOlhar } from './escada.js'

/**
 * A parede em que a tocha se pendura, dada a face clicada.
 *
 * ⚠️ E O OPOSTO DA FACE, e nao a face. Quem clica na face +x de um bloco poe a
 * tocha na celula AO LADO; a parede dessa tocha e a que olha de volta pro bloco,
 * no -x. Trocar os dois pendura a tocha do lado de fora, flutuando.
 *
 * Topo e base (2 e 3) nao pendura nada: la a tocha e de chao.
 */
export const PAREDE_DA_FACE = { 0: 1, 1: 0, 4: 5, 5: 4 }

// `?? -1` e nao `face in PAREDE_DA_FACE ? ... : -1`: escrevi a segunda forma
// primeiro e o controle de mutantes mostrou que as duas sao a MESMA coisa aqui
// -- nenhuma chave da tabela guarda `undefined`, que e a unica entrada capaz de
// separa-las. Entre duas formas equivalentes fica a curta. O que segura o -1 nao
// e o operador, e o teste "topo e base nao penduram nada".
export function paredeDaTocha(face) {
  return PAREDE_DA_FACE[face] ?? -1
}

/**
 * Uma tocha so se pendura em parede OPACA.
 *
 * Nao e preciosismo: pendurada em vidro, em folhagem ou noutra tocha, a peca fica
 * no ar com o pe enfiado em nada -- e nada no jogo diz ao jogador por que.
 */
export function podePendurarTocha({ blockId, face, alvoId }) {
  return (
    blockDef(blockId)?.key === 'torch' && paredeDaTocha(face) >= 0 && !!blockDef(alvoId)?.opaque
  )
}

/**
 * O id que vai ser escrito na celula.
 *
 * ⚠️ A ORDEM DAS PERGUNTAS E A REGRA. O encaixe vem primeiro porque ele ja
 * respondeu: uma laje que funde com outra nao pode virar "tocha de parede" no
 * meio do caminho por acaso da face clicada.
 *
 * @param {object} e
 * @param {number} e.blockId  o bloco base que o item coloca
 * @param {object|null} e.encaixe  o que `encaixarLaje`/`encaixarEscada` decidiu
 * @param {number} e.face  a face clicada (0..5)
 * @param {{x:number,z:number}} e.olhar  direcao do olhar, pro portao e a escada
 * @param {number} e.alvoId  o bloco em que se clicou
 */
export function idParaColocar({ blockId, encaixe, face, olhar, alvoId }) {
  if (encaixe) return encaixe.id
  if (podePendurarTocha({ blockId, face, alvoId })) {
    return ID[TOCHA_DE_PAREDE[paredeDaTocha(face)]]
  }
  // O PORTAO NASCE VIRADO PRO JOGADOR: o vao fica perpendicular a quem colocou,
  // que e o unico jeito de ele servir pra passar. Colocado sempre na mesma
  // direcao, metade dos portoes nasceria de lado.
  //
  // ⚠️ A TABELA É `BLOCO_DO_PORTAO` (variante → família), NÃO `PORTAO_DO_BLOCO`
  // (tábua → portão). Com a segunda, desde 25/08 colocar TÁBUA DE CARVALHO
  // escrevia um portão, e o item de portão nascia sempre na mesma orientação —
  // o teste de `variante.spec` prendia o defeito, porque colocava a tábua e
  // esperava o portão. Achado ao ligar o alçapão pela mesma tabela (18/09).
  const familia = BLOCO_DO_PORTAO[blockDef(blockId)?.key]
  if (familia) {
    const chave = `${familia}|${orientacaoPeloOlhar(olhar.x, olhar.z)}|f`
    return ID[VARIANTE_DE_PORTAO[chave]]
  }
  // O ALÇAPÃO nasce fechado e com a dobradiça do lado de quem colocou — é a
  // mesma conta do portão, e pelo mesmo motivo: aberto, a tampa em pé tem que
  // ficar do lado de quem vai descer, não no meio do caminho.
  const alcapao = BLOCO_DO_ALCAPAO[blockDef(blockId)?.key]
  if (alcapao) {
    const chave = `${alcapao}|${orientacaoPeloOlhar(olhar.x, olhar.z)}|f`
    return ID[VARIANTE_DE_ALCAPAO[chave]]
  }
  return blockId
}
