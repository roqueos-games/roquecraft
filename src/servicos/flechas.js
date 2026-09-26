/**
 * FLECHAS — a regra, sem mundo e sem render em volta.
 *
 * O esqueleto tinha arco na mão e batia de perto. Isso não é um detalhe de
 * balanceamento: é o que fazia os três hostis do jogo serem a MESMA criatura
 * com cores diferentes — todos correm até você e encostam. Com flecha, a
 * distância passa a significar alguma coisa, parede vira abrigo, e o jogador
 * aprende a escolher terreno.
 *
 * Tudo aqui é PURO e recebe o mundo por injeção (`solidAt`), como em
 * `explosao.js` e `nascimento.js`: dá pra medir a trajetória inteira sem subir
 * o jogo.
 *
 * NÚMEROS (Minecraft Wiki, consultada em 25/08/2026): a flecha do esqueleto sai
 * a ~1,6 bloco por tique (≈32 b/s), o intervalo entre tiros é de 1 a 2 s e o
 * alcance de mira é 15 blocos. Aqui a velocidade é 26 b/s — mais lenta de
 * propósito: a 32 b/s a flecha some do quadro antes de o olho registrar que
 * veio uma, e o jogador só vê a vida cair. Ver a flecha vindo é a metade do
 * mecanismo.
 */

/** Blocos por segundo na saída do arco. */
export const VELOCIDADE_DA_FLECHA = 26

/** Queda. Menor que a do jogador: flecha pesada demais vira pedra atirada. */
export const GRAVIDADE_DA_FLECHA = 14

/** Segundos até a flecha desistir. Sem isto, tiro no céu vira lixo eterno. */
export const VIDA_DA_FLECHA = 4

export const DANO_DA_FLECHA = 3

/** Intervalo entre tiros. */
export const RECARGA_DO_ARCO = 1.8

/** Até onde o esqueleto tenta acertar. */
export const ALCANCE_DO_TIRO = 15

/**
 * Distância que o esqueleto tenta MANTER.
 *
 * ⚠️ SEM ISTO O ARCO NÃO MUDA NADA. Um esqueleto que continua correndo até
 * encostar vira o zumbi de sempre, só que atirando na cara. Recuar é o que
 * transforma a briga contra ele numa briga diferente da briga contra o zumbi.
 */
export const DISTANCIA_QUE_MANTEM = 5

/** Raio de acerto no jogador. Generoso: flecha que atravessa não assusta. */
export const RAIO_DE_ACERTO = 0.65

/**
 * Para onde apontar pra acertar um alvo mais alto ou mais baixo.
 *
 * ⚠️ MIRA RETA ERRA SEMPRE. Apontando direto pro alvo, a gravidade come a
 * flecha no caminho e ela passa por baixo — a 12 blocos, quase um bloco e meio
 * abaixo. O esqueleto pareceria míope de propósito. Aqui o tempo de voo sai da
 * distância HORIZONTAL e a altura é compensada por ele.
 *
 * Devolve um vetor de velocidade já com o módulo certo na horizontal.
 */
export function mirar(
  deX,
  deY,
  deZ,
  alvoX,
  alvoY,
  alvoZ,
  velocidade = VELOCIDADE_DA_FLECHA,
  gravidade = GRAVIDADE_DA_FLECHA,
) {
  const dx = alvoX - deX
  const dz = alvoZ - deZ
  const dy = alvoY - deY
  const plano = Math.hypot(dx, dz)
  if (!(plano > 0.0001)) {
    // Alvo exatamente em cima ou embaixo: atira pra cima e deixa a gravidade
    // resolver. Dividir por zero aqui daria uma flecha em coordenada NaN, que
    // some do mundo sem erro nenhum no console.
    return { vx: 0, vy: dy >= 0 ? velocidade : -velocidade, vz: 0 }
  }
  const t = plano / velocidade
  return {
    vx: (dx / plano) * velocidade,
    vy: (dy + 0.5 * gravidade * t * t) / t,
    vz: (dz / plano) * velocidade,
  }
}

export function criarFlecha(id, x, y, z, { vx, vy, vz }, dono = 'mob') {
  if (![x, y, z, vx, vy, vz].every((n) => Number.isFinite(n))) return null
  return { id, x, y, z, vx, vy, vz, idade: 0, dono }
}

/**
 * Um passo da flecha. Devolve o que aconteceu.
 *
 * ⚠️ O CAMINHO É AMOSTRADO, NÃO SALTADO. A 26 b/s, um quadro de 60 Hz move a
 * flecha 43 cm — mas um quadro engasgado de 200 ms move 5,2 BLOCOS, e testar só
 * o ponto final faria a flecha atravessar parede e jogador. Divide-se o passo
 * em pedaços de no máximo 25 cm.
 *
 * `alvo` é opcional: sem ele a flecha só colide com bloco (é o caso do tiro do
 * jogador contra criatura, que é resolvido por quem chama).
 */
export function passoDaFlecha(f, dt, { solidAt, alvo, raioDoAlvo = RAIO_DE_ACERTO } = {}) {
  f.idade += dt
  if (f.idade >= VIDA_DA_FLECHA) return 'velha'

  const passos = Math.max(1, Math.ceil((Math.hypot(f.vx, f.vy, f.vz) * dt) / 0.25))
  const h = dt / passos
  for (let i = 0; i < passos; i++) {
    f.vy -= GRAVIDADE_DA_FLECHA * h
    f.x += f.vx * h
    f.y += f.vy * h
    f.z += f.vz * h
    if (alvo) {
      const d = Math.hypot(f.x - alvo.x, f.y - alvo.y, f.z - alvo.z)
      if (d <= raioDoAlvo) return 'alvo'
    }
    if (solidAt?.(Math.floor(f.x), Math.floor(f.y), Math.floor(f.z))) return 'bloco'
  }
  return 'voando'
}

/**
 * Tem linha de tiro?
 *
 * ⚠️ SEM ISTO O ESQUELETO ATIRA ATRAVÉS DA PAREDE. Não literalmente — a flecha
 * bate no bloco — mas ele gasta o tiro, e o jogador do outro lado ouve o arco e
 * nunca vê a flecha. Pior: dentro de uma casa, um esqueleto do lado de fora
 * ficaria disparando pra sempre contra o mesmo tijolo.
 *
 * Amostra o segmento, como `exposicaoEntre` em `explosao.js`. Os extremos ficam
 * de fora: o passo 0 está dentro do próprio atirador.
 */
export function temLinhaDeTiro(solidAt, ax, ay, az, bx, by, bz, passos = 20) {
  const dx = bx - ax
  const dy = by - ay
  const dz = bz - az
  for (let i = 1; i < passos; i++) {
    const t = i / passos
    if (solidAt(Math.floor(ax + dx * t), Math.floor(ay + dy * t), Math.floor(az + dz * t))) {
      return false
    }
  }
  return true
}
