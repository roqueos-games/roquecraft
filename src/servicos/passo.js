// A CAMINHADA: uma fase só, que serve o som E a câmera.
//
// Antes eram duas coisas soltas. O som saía de um acumulador de distância no
// componente; o balanço existia só na mão, com um relógio próprio em
// `viewmodel.js`. Nada amarrava um ao outro, então o pé "batia" num instante e
// a mão subia noutro — é essa desconexão que o founder ouviu como falta de
// profissionalismo.
//
// Aqui existe UMA fase em radianos que avança com a distância percorrida. Cada
// múltiplo de π é uma passada. O som dispara na virada; a câmera desce no mesmo
// ponto porque lê a mesma variável. Dessincronizar virou impossível, não
// improvável.
//
// Puro de propósito: sem three, sem áudio, sem Vue. Dá pra afirmar cadência e
// estabilidade de frame rate sem abrir um navegador.

import { WALK_SPEED, SPRINT_MULT } from './physics.js'

/**
 * Metros por passada.
 *
 * Medido no jogo: a versão anterior andava 3,13 m entre passos (0,667 s a
 * 4,7 m/s). Um humano nessa velocidade dá passo a cada ~0,32 s. 1,5 m põe a
 * cadência em 0,32 s na caminhada, que é o que o founder pediu quando disse que
 * estava "muito lento entre um passo e outro".
 */
export const METROS_POR_PASSO = 1.5

/**
 * Abaixo disto o acumulador ESVAZIA em vez de somar.
 *
 * ⚠️ Não é um limiar de velocidade — é o que substitui um. O código antigo
 * liberava o passo com `veloc > 0.9`, e como o input só é normalizado acima de
 * 1, qualquer analógico encostado punha o jogador exatamente nessa fronteira.
 * Deslocamento real por quadro é imune a isso: física oscilando, pé na água,
 * manche com resíduo — nada disso move o jogador, então nada disso dá passo.
 */
const PARADO_M_POR_S = 0.35

export const criarCaminhada = () => ({ fase: 0, intensidade: 0, passos: 0 })

/**
 * Avança a caminhada em `andou` metros percorridos neste quadro.
 *
 * Devolve quantas passadas viraram (quase sempre 0 ou 1; mais que isso só num
 * quadro muito longo) para quem quiser tocar o som.
 *
 * @param {{fase:number,intensidade:number,passos:number}} c
 * @param {number} andou distância REAL percorrida no quadro, em metros
 * @param {number} dt segundos do quadro
 * @param {boolean} noChao só anda quem tem pé no chão
 */
export function avancarCaminhada(c, andou, dt, noChao) {
  const passo = Math.max(1e-6, dt)
  const vel = andou / passo
  if (!noChao || !Number.isFinite(andou) || vel < PARADO_M_POR_S) {
    // Esvazia em vez de zerar de uma vez: parar de andar devolve a câmera ao
    // repouso em ~0,2 s, sem o solavanco de cortar o balanço no meio do arco.
    c.intensidade = Math.max(0, c.intensidade - dt * 5)
    // A fase continua onde estava. Zerar aqui faria a câmera saltar pro ponto
    // baixo toda vez que o jogador encostasse num muro.
    return 0
  }
  c.intensidade = Math.min(1, c.intensidade + dt * 6)

  // ⚠️ SUBTRAI o limiar, não zera. Zerando, o excesso do último quadro é
  // jogado fora e a cadência passa a depender do frame rate: medido, a 60 fps
  // dava 2,15 m por passada e a 5 fps dava 3,13 m. O ritmo do jogo mudava
  // conforme a máquina engasgava.
  const antes = c.fase
  c.fase += (andou * Math.PI) / METROS_POR_PASSO
  const viraram = Math.floor(c.fase / Math.PI) - Math.floor(antes / Math.PI)
  c.passos += viraram
  // Mantém a fase pequena sem perder o resto: 2π é uma passada de cada pé.
  //
  // ⚠️ Resto e não subtração única. A subtração só dava conta de UMA volta: um
  // quadro longo o bastante para andar mais de duas passadas deixava a fase
  // acima de 2π mesmo depois do ajuste. E o `>` que a guardava era um
  // comparador sem dono possível — a fase cair EXATAMENTE em 2π depende de a
  // soma em ponto flutuante pousar no valor exato, o que não acontece.
  c.fase %= Math.PI * 2
  return viraram
}

/**
 * Deslocamento da câmera para esta fase.
 *
 * `y` é NEGATIVO no instante da passada e volta a zero no meio dela: a cabeça
 * afunda quando o pé bate, que é o que o corpo faz. `x` completa um ciclo a
 * cada DUAS passadas, porque o peso alterna de perna. `rolagem` é o mesmo
 * balanço aplicado à inclinação — é ela que separa "a tela sobe e desce" de
 * "eu estou andando".
 */
export function balancoDaCamera(c, amplitude = 1) {
  const k = c.intensidade * amplitude
  if (k <= 0) return { x: 0, y: 0, rolagem: 0 }
  return {
    x: Math.sin(c.fase) * 0.045 * k,
    y: -Math.abs(Math.cos(c.fase)) * 0.062 * k,
    rolagem: Math.sin(c.fase) * 0.011 * k,
  }
}

// ── Orçamento de duração da amostra de passo ────────────────────────────────

/**
 * Menor intervalo possível entre duas passadas, em segundos.
 *
 * Derivado, não copiado: `METROS_POR_PASSO` mora aqui e a velocidade mora em
 * `physics.js`. Se alguém acelerar o sprint, este número anda junto — e o teste
 * que compara amostra com orçamento acompanha sem ninguém lembrar dele.
 *
 * Hoje: 1,5 / (4,7 × 1,35) ≈ 0,236 s.
 */
export const INTERVALO_MINIMO_PASSO = METROS_POR_PASSO / (WALK_SPEED * SPRINT_MULT)

/**
 * Teto de duração de uma amostra de passo.
 *
 * ⚠️ ESTE É O NÚMERO QUE FALTAVA. O banco tinha `passo.areia` de 0,30 a 0,42 s
 * e `passo.cascalho` de 0,66 s, contra um intervalo mínimo de 0,236 s. Correndo
 * na areia, cada passo começava antes do anterior terminar; a pilha crescia
 * enquanto o jogador andasse e continuava soando depois que ele parava. Foi
 * exatamente o que o founder descreveu: "um som que fica entrando junto e se
 * repetindo infinitamente" e "passo sozinho mesmo eu sem andar".
 *
 * 0,85 do intervalo deixa uma folga audível entre uma passada e a seguinte —
 * som colado ponta com ponta ainda soa como zumbido contínuo.
 */
export const DUR_MAX_PASSO = INTERVALO_MINIMO_PASSO * 0.85

const FADE_PASSO = 0.03

/**
 * Encurta uma amostra longa demais, com esmaecimento no fim.
 *
 * Feito na CARGA e não no arquivo, de propósito: as amostras são CC0 de
 * terceiros e ficam versionadas como vieram, com a procedência intacta em
 * `CREDITOS.md`. Recortar em código também vale pra qualquer amostra que
 * alguém adicionar amanhã, sem depender de lembrar de rodar um script.
 *
 * Puro: recebe e devolve canais como Float32Array. Quem tem AudioContext é o
 * `audio.js`.
 *
 * @param {Float32Array[]} canais
 * @param {number} taxa amostras por segundo
 * @param {number} durMax teto em segundos
 * @returns {Float32Array[]|null} null quando não precisa recortar
 */
export function recortarPasso(canais, taxa, durMax = DUR_MAX_PASSO) {
  if (!canais.length) return null
  const n = Math.floor(durMax * taxa)
  // ⚠️ Uma conta só, em vez de duas guardas. O `!(taxa > 0)` que existia aqui
  // era redundante: taxa zero ou negativa já cai em `n <= 0`, e NaN já cai no
  // `Number.isInteger`. Comparador coberto por outro comparador não tem como
  // ter dono — nenhum teste consegue separá-lo do seu mutante. De quebra o
  // `Number.isInteger` passou a cobrir `Infinity`, que atravessava as duas.
  if (!Number.isInteger(n) || n <= 0 || canais[0].length <= n) return null
  const nFade = Math.min(n, Math.max(1, Math.floor(FADE_PASSO * taxa)))
  return canais.map((src) => {
    const dst = src.slice(0, n)
    for (let i = 0; i < nFade; i++) dst[n - nFade + i] *= 1 - i / nFade
    return dst
  })
}
