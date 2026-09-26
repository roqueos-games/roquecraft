//
// GRAVIDADE — quem cai, até onde, e o que acontece ao pousar.
//
// Regras puras, sem three.js e sem estado: recebem o mundo por função de
// leitura e devolvem números. Quem move bloco é o chamador.
//
// O que existia antes desta rodada: ao QUEBRAR um bloco, se o de cima tinha
// `gravity`, ele descia UMA célula. Três buracos nisso, e os três aparecem em
// dois minutos de jogo:
//
//   · pilha de areia não desmorona — só a de baixo desce, as outras quatro
//     ficam penduradas no ar;
//   · areia sobre buraco de vinte de fundo desce um e boia;
//   · e nada cai a não ser quebrando: colocar areia no ar, ou tirar o apoio com
//     `fill`, deixa tudo parado.
//
// Aqui a queda é uma consulta de coluna, não um passo. E quem dispara é a fila
// de atualização (`atualizacoes.js`), não o ato de quebrar.
//
import { TIQUES_POR_SEGUNDO } from './constants.js'

import {
  TABELA_DE_IDS,
  BLOCKS,
  AIR,
  IS_SOLID,
  IS_LIQUID,
  IS_FRAGIL,
  IS_REPLACEABLE,
} from './blocks.js'

/** O bloco cai quando perde apoio? Sai do `gravity` do catálogo. */
export const CAI = (() => {
  const a = new Uint8Array(TABELA_DE_IDS)
  for (const b of Object.values(BLOCKS)) a[b.id] = b.gravity ? 1 : 0
  return a
})()

/**
 * A célula deixa passar um bloco caindo?
 *
 * Ar, líquido, planta e substituível deixam. Areia caindo n'água afunda, e
 * areia caindo em cima de tocha ou grama alta destrói o que estava lá — é o que
 * o jogo original faz, e é o que faz sentido: o que não segura o próprio peso
 * não segura o de ninguém.
 *
 * ⚠️ `IS_SOLID` sozinho não serve. Tocha e grama alta NÃO são sólidas, então
 * "não sólido = passa" acertaria as duas por acidente — mas erraria a laje de
 * topo, que é sólida e por onde a areia também não passa. O que decide é o
 * conjunto, e cada termo aqui está pagando por um caso.
 */
export function atravessa(id) {
  if (id === AIR) return true
  if (IS_SOLID[id] === 1) return false
  return IS_LIQUID[id] === 1 || IS_FRAGIL[id] === 1 || IS_REPLACEABLE[id] === 1
}

/**
 * Até onde este bloco cai, partindo de (x, y, z)?
 *
 * Devolve o Y de pouso — a célula onde ele vai PARAR. Igual a `y` significa
 * que não cai. Nunca desce abaixo de `fundo`.
 *
 * ⚠️ CUSTO O(y − fundo): varre a coluna célula a célula. No jogo `fundo` é 0 e
 * o teto é 127, então são no máximo 127 passos. Passar um fundo absurdo vira um
 * laço de um bilhão — foi assim que um teste travou a suíte inteira em
 * 24/08/2026.
 *
 * `blocoEm(x, y, z)` devolve o id numérico.
 */
export function destinoDaQueda(blocoEm, x, y, z, fundo = 0) {
  let alvo = y
  for (let j = y - 1; j >= fundo; j--) {
    if (!atravessa(blocoEm(x, j, z))) break
    alvo = j
  }
  // `Math.max` e não `alvo` puro: o chamador passa `Math.ceil(altura)`, e um
  // bloco meio pixel abaixo de zero dá `Math.ceil(-0.3) === -0`. Zero negativo
  // atravessa comparação (`-0 === 0`) mas NÃO atravessa igualdade estrutural, e
  // um teste que compara o destino com 0 reprova sem que nada esteja errado.
  // Aqui ele também vale como o contrato: nunca abaixo do fundo.
  return Math.max(fundo, alvo)
}

/**
 * Este bloco deve começar a cair agora?
 *
 * Separado de `destinoDaQueda` de propósito: a fila de atualização faz esta
 * pergunta milhares de vezes por segundo e ela precisa ser barata — uma leitura
 * de vizinho, não uma varredura de coluna.
 */
export function vaiCair(blocoEm, x, y, z, fundo = 0) {
  const id = blocoEm(x, y, z)
  if (CAI[id] !== 1) return false
  if (y <= fundo) return false
  return atravessa(blocoEm(x, y - 1, z))
}

// Física da queda, nos números do jogo original: aceleração de 0,04 bloco por
// tique ao quadrado e arrasto de 0,98 por tique, a 20 tiques por segundo.
// Manter os números originais não é preciosismo — é o que faz a areia cair com
// o peso certo em vez de parecer pena ou tijolo.
export const G_POR_TIQUE = 0.04
export const ARRASTO = 0.98

/**
 * Um passo da queda, em segundos de tempo real.
 *
 * Devolve `{ y, vy }` novos. O chamador compara com o destino e decide pousar.
 * Integra em tiques inteiros pra não depender da taxa de quadros: a mesma queda
 * tem que durar o mesmo tanto a 30 e a 144 fps.
 */
export function passoDaQueda(y, vy, dt) {
  // Teto de segurança: um quadro travado de 2 s não pode virar 40 integrações.
  const tiques = Math.min(8, dt * TIQUES_POR_SEGUNDO)
  let ny = y
  let nvy = vy
  const inteiros = Math.floor(tiques)
  for (let i = 0; i < inteiros; i++) {
    nvy = (nvy - G_POR_TIQUE) * ARRASTO
    ny += nvy
  }
  // A fração de tique que sobrou, sem guarda.
  //
  // ⚠️ Havia um `if (resto > 0)` aqui, e ele era um mutante que NENHUM teste
  // podia matar: com resto zero a conta abaixo é a identidade
  // (`v = nvy * 1`, `ny += 0`), então guardar ou não guardar dá o mesmo
  // resultado. Comparador que não muda resposta nenhuma é ruído, não precisão.
  const resto = tiques - inteiros
  const v = (nvy - G_POR_TIQUE * resto) * (1 - (1 - ARRASTO) * resto)
  ny += v * resto
  return { y: ny, vy: v }
}
