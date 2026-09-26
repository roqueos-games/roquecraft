//
// ONDE A CÂMERA PODE FICAR sem enfiar o olho dentro de um bloco.
//
// A altura do olho é 1,62 acima do pé — mas o pé nem sempre está num lugar com
// 1,62 de ar acima. Encostar num teto baixo, subir uma laje, ser empurrado por
// um mob contra a parede, ou (o caso feio) ficar soterrado: em todos, o olho
// entra no sólido e a tela vira a face interna de um cubo. Não é um bug de
// render — é a câmera num lugar onde não cabe.
//
// A regra sobe em passos de 1/4 de bloco procurando ar; se não achar subindo,
// desce; e se não achar descendo, usa o pé. Última tentativa antes de desistir,
// porque o pé é o único ponto que a física garante estar livre.
//
// ⚠️ O DEGRAU DO PÉ É EXPLÍCITO, e a razão é aritmética: 1,62 / 0,25 = 6,48,
// então o laço de descida para em 1,50 e nunca chega ao pé. Com o jogador
// soterrado, faltavam 0,12 de bloco e a tela ficava preta. Um laço que "quase"
// alcança o alvo é pior que um que não tenta.
//
// FOLHA CONTA COMO TAPA-VISÃO mesmo não sendo opaca pro motor de luz. Quem tem
// a cara dentro de uma copa não enxerga nada útil, e a câmera precisa sair de
// lá igual sai da pedra.

/** Altura do olho acima do pé. Mesmo valor da física. */
export const ALTURA_DO_OLHO = 1.62

/**
 * O bloco em (x,y,z) impede a visão?
 *
 * `ehOpaco` e `chaveEm` entram por parâmetro: o teste monta a coluna sem
 * precisar de mundo, e a regra fica legível sem abrir o componente.
 */
export function tapaVisao({ ehOpaco, chaveEm }, x, y, z) {
  if (ehOpaco(x, y, z)) return true
  return /leaves/i.test(chaveEm(x, y, z) || '')
}

/**
 * A posição onde a câmera enxerga, a partir do pé do jogador.
 *
 * Devolve sempre uma posição — nunca `null`. Câmera sem lugar é tela preta, e
 * uma tela preta sem explicação é pior que uma câmera meio metro fora do lugar.
 */
export function olhoSeguro(mundo, x, pe, z, alturaDoOlho = ALTURA_DO_OLHO) {
  const alvo = pe + alturaDoOlho
  const bloqueado = (y) => tapaVisao(mundo, Math.floor(x), Math.floor(y), Math.floor(z))
  if (!bloqueado(alvo)) return [x, alvo, z]

  // Sobe primeiro: sair por cima mantém o enquadramento mais parecido com o
  // que o jogador esperava. Dois blocos é o teto da busca.
  for (let d = 0.25; d <= 2; d += 0.25) {
    if (!bloqueado(alvo + d)) return [x, alvo + d, z]
  }
  // Depois desce.
  for (let d = 0.25; d < alturaDoOlho; d += 0.25) {
    if (!bloqueado(alvo - d)) return [x, alvo - d, z]
  }
  // ⚠️ E o PÉ, explícito — ver a nota lá em cima sobre 1,62 / 0,25 = 6,48.
  const noPe = pe + 0.1
  if (!bloqueado(noPe)) return [x, noPe, z]

  return [x, alvo, z]
}
