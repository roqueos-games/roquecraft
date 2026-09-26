// Curvas de animação compartilhadas.
//
// Moram fora do render porque DUAS coisas precisam do mesmo movimento e elas
// não se falam: a mão em primeira pessoa (viewmodel.js) e o braço do jogador
// remoto (entities.js). Se cada uma tivesse a sua, o mesmo golpe teria dois
// tempos diferentes na mesma tela - você veria o amigo minerar num ritmo e a
// sua própria mão em outro.
//
// Puro de propósito: sem THREE, sem canvas, testável direto.

// NaN entra aqui de verdade: um `dt` estranho num quadro perdido, um campo de
// rede corrompido. E NaN é pior que fora de faixa - `rotation.x = NaN` faz o
// three descartar a matriz e o braço SOME, sem erro no console. O teste da
// curva pega isto; a comparação invertida (`t > 0` em vez de `t < 0`) é o que
// faz NaN cair no zero em vez de escapar.
const clamp01 = (t) => (t > 0 ? (t < 1 ? t : 1) : 0)

/**
 * A curva do golpe do original: `sin(sqrt(t)·π)`.
 *
 * A raiz é a coisa toda. Ela comprime o começo e estica o fim, então o braço
 * DISPARA e volta devagar - pico em t = 0.25, três quartos do ciclo voltando.
 * Com uma senoide simples (pico em t = 0.5, simétrica) o golpe vira aceno.
 */
export const curvaDeGolpe = (t) => Math.sin(Math.sqrt(clamp01(t)) * Math.PI)

/**
 * Segunda harmônica do mesmo golpe: `sin(sqrt(t)·2π)`. Dá o repique vertical no
 * meio do arco - sem ela o braço desliza numa curva só e não "bate".
 */
export const repiqueDeGolpe = (t) => Math.sin(Math.sqrt(clamp01(t)) * Math.PI * 2)

/** Onde o recuo termina e o golpe começa a valer. */
export const FIM_DO_RECUO = 0.22

/**
 * O RECUO: a peça vai para trás antes de vir.
 *
 * ⚠️ ELE EXISTE PORQUE A CURVA DO GOLPE COMEÇA EM ZERO E DISPARA. Com a raiz,
 * t = 0.05 já vale 0.67 do arco — ou seja, o braço nasce quase no pico e o
 * golpe não tem de onde sair. Numa picareta isso passa; num MACHADO, que é
 * "levanta e desce", o gesto inteiro some e ele lê como picareta devagar.
 *
 * Um sino curto nos primeiros 22% do ciclo, e zero no resto: ele não disputa
 * com a curva principal, só dá o de onde. A amplitude é da CLASSE
 * (`GOLPES[classe].recuo`), então a picareta continua com recuo zero e nada do
 * que já estava calibrado se mexe.
 */
export const recuoDeGolpe = (t) => {
  const u = clamp01(t)
  if (u >= FIM_DO_RECUO) return 0
  return Math.sin((u / FIM_DO_RECUO) * Math.PI)
}
