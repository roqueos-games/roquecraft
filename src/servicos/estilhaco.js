// ESTILHAÇO DE BLOCO, COM FÍSICA.
//
// O que existia: doze cubinhos com gravidade, que subiam, desciam e sumiam no
// ar em 0,85 s. Nada encostava no chão. Quebrar pedra e quebrar terra
// produziam a mesma nuvenzinha sem peso.
//
// O que muda: o caco cai, BATE no chão, quica perdendo energia, gira enquanto
// voa e para de girar quando assenta. É o pedaço do "Physics Mod" que cabe num
// jogo de navegador — fratura de verdade e desabamento de estrutura mexem em
// simulação de mundo, não em efeito, e ficaram de fora com essa justificativa
// escrita no plano.
//
// Puro de propósito: sem three. Trajetória, quique e repouso viram afirmação de
// teste em vez de "parece melhor".

const GRAVIDADE = 26
/** Quanto da velocidade vertical volta no quique. Pedra não é bola. */
const RESTITUICAO = 0.34
/** Perda horizontal a cada toque no chão. */
const ATRITO_TOQUE = 0.62
/** Arrasto no chão: o caco escorrega um pouco e para. */
const ATRITO_CHAO = 4.5
/** Abaixo disto o quique vira repouso, senão o caco treme pra sempre. */
const VY_REPOUSO = 1.1

/**
 * Cria os cacos de um bloco quebrado em (x, y, z), coordenada de bloco.
 *
 * `rnd` injetável pra o teste ser determinístico — trajetória sorteada não se
 * afirma, e sem isso o único jeito de testar seria olhar.
 */
export function criarEstilhacos(x, y, z, quantidade = 18, rnd = Math.random) {
  const cacos = []
  for (let i = 0; i < quantidade; i++) {
    const s = 0.35 + rnd() * 0.75
    cacos.push({
      x: x + 0.5 + (rnd() - 0.5) * 0.8,
      y: y + 0.5 + (rnd() - 0.5) * 0.8,
      z: z + 0.5 + (rnd() - 0.5) * 0.8,
      vx: (rnd() - 0.5) * 3.6,
      // Sempre pra cima: caco que nasce descendo atravessa o chão antes do
      // primeiro quadro e o efeito perde a explosão.
      vy: 1.8 + rnd() * 3.2,
      vz: (rnd() - 0.5) * 3.6,
      s,
      // Giro: o eixo é sorteado, a velocidade escala com a do arremesso.
      rx: rnd() * Math.PI,
      ry: rnd() * Math.PI,
      wx: (rnd() - 0.5) * 14,
      wy: (rnd() - 0.5) * 14,
      parado: false,
    })
  }
  return cacos
}

/**
 * Um passo de simulação. `chaoY` é o Y do piso — a base da célula quebrada, que
 * é o topo do bloco de baixo.
 */
export function passoEstilhacos(cacos, dt, chaoY) {
  for (const p of cacos) {
    const meio = p.s * 0.05 // metade da aresta do caco (geometria de 0,1)
    if (p.parado) {
      // Já assentou: só escorrega até parar. Sem isto o caco congela no ar no
      // instante do toque, que lê como bug de colisão.
      const k = Math.max(0, 1 - ATRITO_CHAO * dt)
      p.vx *= k
      p.vz *= k
      p.x += p.vx * dt
      p.z += p.vz * dt
      continue
    }
    p.vy -= GRAVIDADE * dt
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.z += p.vz * dt
    p.rx += p.wx * dt
    p.ry += p.wy * dt

    const piso = chaoY + meio
    if (p.y <= piso && p.vy < 0) {
      p.y = piso
      if (-p.vy < VY_REPOUSO) {
        p.vy = 0
        p.parado = true
        // Para de girar ao assentar: caco imóvel girando no chão é pior que
        // caco imóvel.
        p.wx = 0
        p.wy = 0
      } else {
        p.vy = -p.vy * RESTITUICAO
        p.vx *= ATRITO_TOQUE
        p.vz *= ATRITO_TOQUE
        p.wx *= ATRITO_TOQUE
        p.wy *= ATRITO_TOQUE
      }
    }
  }
  return cacos
}

/** Quanto do efeito já assentou — o QA usa pra saber se a simulação terminou. */
export const fracaoAssentada = (cacos) =>
  cacos.length ? cacos.filter((p) => p.parado).length / cacos.length : 0
