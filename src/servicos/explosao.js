/**
 * EXPLOSÃO — a regra, sem mundo e sem render em volta.
 *
 * Existe porque o creeper existe. E o creeper não é "um zumbi que morre ao
 * encostar": o que o torna ele é o buraco que fica no chão. Sem destruir bloco,
 * o bicho vira só um número tirando vida, e o jogador nunca aprende a correr.
 *
 * Tudo aqui é PURO e recebe o mundo por injeção (`ehDestrutivel`, `ehOpaco`,
 * `rnd`). Isso não é purismo: é a única forma de testar o raio de dano e o
 * formato do buraco sem subir o jogo inteiro, e foi assim que `nascimento.js` e
 * `combate.js` pararam de ser adivinhação.
 *
 * NÚMEROS, e de onde vêm (Minecraft Wiki, consultada em 25/08/2026):
 *  - potência 3 e pavio de 1,5 s são os do creeper comum;
 *  - o dano vai até 2× a potência, ou seja 6 blocos, caindo linearmente;
 *  - encostado, o dano supera a vida cheia — no original também: ponto-vazio
 *    mata. É isso que ensina a manter distância.
 *
 * ⚠️ O QUE NÃO É CÓPIA DO ORIGINAL, e por quê: o original calcula exposição com
 * dezenas de raios pela caixa da entidade. Aqui se amostra UM segmento entre o
 * centro da explosão e o alvo. Com o mesmo resultado prático — parede protege,
 * campo aberto não — e sem um laço de milhares de passos no meio do quadro.
 */

/** Potência do creeper comum. O "3" do original. */
export const POTENCIA_DO_CREEPER = 3

/** Segundos entre chiar e estourar. */
export const PAVIO_DO_CREEPER = 1.5

/** A que distância ele acende o pavio. */
export const DISTANCIA_PARA_ACENDER = 3

/**
 * A que distância o pavio APAGA.
 *
 * Maior que a de acender de propósito: com o mesmo número, andar meio bloco pra
 * trás e pra frente ligaria e desligaria o chiado várias vezes por segundo, e o
 * som viraria uma metralhadora. A folga é o que transforma isso em "deu, fugi".
 */
export const DISTANCIA_PARA_APAGAR = 7

/**
 * Dano máximo, encostado e sem proteção.
 *
 * Acima da vida cheia (20) DE PROPÓSITO: no original o creeper encostado mata.
 * Baixar isso pra "quase mata" parece generoso e é o contrário — tira do bicho
 * a única coisa que ele ensina, que é recuar.
 */
export const DANO_MAXIMO = 24

/** O dano acaba a 2× a potência. Potência 3 ⇒ 6 blocos. */
export const raioDeDano = (potencia) => potencia * 2

/**
 * Quanto de dano chega a `distancia`, já descontada a `exposicao` (0..1).
 *
 * Queda LINEAR, não quadrática: com queda quadrática o dano some perto demais
 * do centro e o jogador aprende que dá pra ficar a dois blocos. Linear mantém
 * a zona de perigo do tamanho que ela parece ter.
 */
export function danoDaExplosao(potencia, distancia, exposicao = 1) {
  const limite = raioDeDano(potencia)
  if (!(distancia >= 0) || distancia >= limite) return 0
  const forca = 1 - distancia / limite
  return Math.max(0, Math.round(DANO_MAXIMO * forca * Math.max(0, Math.min(1, exposicao))))
}

/**
 * Quanto da explosão CHEGA no alvo: 1 em campo aberto, 0 atrás de parede.
 *
 * Amostra o segmento entre os dois pontos e conta quantos passos caem em bloco
 * opaco. Os extremos ficam de fora: o passo 0 está dentro do próprio creeper e
 * o último dentro do alvo — contar os dois daria "protegido" pra quem está
 * encostado, que é o oposto do que acontece.
 */
export function exposicaoEntre(ehOpaco, ax, ay, az, bx, by, bz, passos = 16) {
  const dx = bx - ax
  const dy = by - ay
  const dz = bz - az
  let bloqueados = 0
  let contados = 0
  for (let i = 1; i < passos; i++) {
    const t = i / passos
    contados++
    if (ehOpaco(Math.floor(ax + dx * t), Math.floor(ay + dy * t), Math.floor(az + dz * t))) {
      bloqueados++
    }
  }
  if (!contados) return 1
  return Math.max(0, 1 - bloqueados / contados)
}

/**
 * Os blocos que o estouro leva.
 *
 * ⚠️ A BORDA É IRREGULAR DE PROPÓSITO. Uma esfera perfeita denuncia na hora que
 * o buraco foi feito por uma fórmula, e o do original nunca é redondo. A
 * irregularidade sai de `rnd`, que entra por injeção pra o teste poder fixá-la.
 *
 * A ordem é do centro pra fora. Importa: quem aplica as edições pode ter um
 * teto, e cortar a lista tem que sobrar o miolo do buraco, não um anel.
 */
export function blocosDaExplosao(
  { potencia = POTENCIA_DO_CREEPER, ehDestrutivel, rnd },
  cx,
  cy,
  cz,
) {
  const R = Math.ceil(potencia)
  const centro = { x: Math.floor(cx), y: Math.floor(cy), z: Math.floor(cz) }
  const achados = []
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      for (let dz = -R; dz <= R; dz++) {
        const d = Math.hypot(dx, dy, dz)
        if (d > potencia) continue
        // Só a casca fica sujeita ao sorteio: o miolo sempre vai. Sortear o
        // miolo deixaria pedras soltas boiando dentro do buraco.
        const casca = d / potencia
        if (casca > 0.72 && rnd() < (casca - 0.72) / 0.28) continue
        const x = centro.x + dx
        const y = centro.y + dy
        const z = centro.z + dz
        if (!ehDestrutivel(x, y, z)) continue
        achados.push({ x, y, z, d })
      }
    }
  }
  achados.sort((a, b) => a.d - b.d)
  return achados.map(({ x, y, z }) => [x, y, z])
}

/**
 * Um bloco só é levado se puder ser levado.
 *
 * ⚠️ LÍQUIDO FICA. No original a água contém a explosão, e é justamente por isso
 * que cavar debaixo d'água é seguro. Deixar a água ser apagada abriria um
 * buraco seco no meio do lago — e no quadro seguinte o fluido correria pra
 * dentro dele, dando de graça o pior defeito visual possível.
 */
export const podeExplodir = (def) => !!def && !def.unbreakable && !def.liquid && def.hardness >= 0
