//
// A PRAÇA, O POÇO E OS POSTES — o que faz a vila virar LUGAR.
//
// ⚠️ ANTES O MEIO DA VILA ERA CAPIM. As casas ficavam num anel e o centro, que
// é para onde todos os caminhos apontam, era exatamente o mesmo campo que havia
// antes da vila existir. O jogador andava até lá e não encontrava nada — e um
// centro vazio não lê como praça, lê como clareira.
//
// O que uma praça precisa para ser uma praça:
//
//   · CHÃO DIFERENTE DO CAMPO. Enquanto o piso for grama, não há praça: há
//     grama entre casas. Pedregulho e terra batida dizem "aqui é pisado".
//   · UM MOTIVO PARA IR ATÉ ELA. O poço é o motivo, e é o marco que faz a vila
//     ter um CENTRO visível de longe em vez de um buraco no meio do anel.
//   · LUZ. À noite a vila apagava por inteiro, e uma vila apagada não é
//     acolhedora: é o lugar onde o zumbi está. Poste com lanterna resolve as
//     duas coisas — ilumina e, de dia, dá verticalidade à silhueta.
//
// ⚠️ TUDO FUNÇÃO PURA DA COORDENADA, como o resto da aldeia: `runFeatures` roda
// para os nove chunks vizinhos e todos precisam concordar.

import {
  ID,
  VARIANTE_DE_ESCADA,
  VARIANTE_DE_CERCA,
  BITS_DA_CERCA,
  LAJE_DO_BLOCO,
} from './blocks.js'
import { AR } from './vilaCasa.js'

/** Metade do lado da praça, em blocos. */
export const RAIO_DA_PRACA = 7
/** Metade do lado do poço. */
const POCO = 1
/** Altura do poste, do chão até a lanterna. */
const ALTURA_DO_POSTE = 4

/** A cerca sem vizinha nenhuma: o poste solto do poço e da lanterna. */
const POSTE = () => ID[VARIANTE_DE_CERCA['oakFence|0']]

/**
 * Onde ficam os postes de luz.
 *
 * ⚠️ NAS QUINAS DA PRAÇA E NO MEIO DO CAMINHO DE CADA CASA, e não espalhados
 * por hash. Poste sorteado cai no meio do nada e lê como tocha esquecida; poste
 * na esquina lê como iluminação pública. O do meio do caminho é o que faz a rua
 * existir à noite: sem ele, o trecho entre a praça e a porta some no escuro e o
 * jogador atravessa a vila sem ver onde está pisando.
 */
export function postesDe(plano) {
  const { centro } = plano
  const fora = []
  const q = RAIO_DA_PRACA - 1
  for (const [sx, sz] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]) {
    fora.push({ x: centro.x + sx * q, z: centro.z + sz * q })
  }
  // ⚠️ A QUINA É PROCURADA, NÃO ESCOLHIDA. A primeira versão punha o poste a
  // dois terços do caminho até a porta, e sete dos onze caíam dentro de OUTRA
  // casa: as casas ocupam justamente a faixa de 17 a 23 blocos do centro. A
  // casa tem precedência no despachante, então o poste sumia em silêncio e a
  // vila amanhecia com quatro luzes de doze.
  //
  // Encostar na quina da frente resolveu onze dos treze — e o teste achou os
  // outros dois, em aldeias onde a casa vizinha cobre justamente aquela quina.
  // Então as quatro quinas são tentadas em ordem, e vale a primeira livre: a da
  // frente é a preferida porque ilumina a entrada, as outras são o plano B.
  const ocupada = (x, z) =>
    plano.casas.some((c) => {
      const b = Math.max(c.planta.lx, c.planta.lz) + 1
      return Math.abs(x - c.x) <= b && Math.abs(z - c.z) <= b
    })
  for (const c of plano.casas) {
    const lx = c.planta.lx + 2
    const lz = c.planta.lz + 2
    for (const [sx, sz] of [
      [1, -1],
      [-1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      const x = c.x + sx * lx
      const z = c.z + sz * lz
      if (ocupada(x, z)) continue
      if (fora.some((p) => p.x === x && p.z === z)) continue
      fora.push({ x, z })
      break
    }
  }
  return fora
}

/**
 * O que esta coluna recebe da praça, do poço ou de um poste.
 *
 * @returns `[{ y, id }]` — pode ser vazio, que quer dizer "é da vila e é para
 *          ficar limpa" — ou `null` quando a coluna não é assunto da praça.
 */
export function colunaDaPraca(plano, postes, x, z) {
  const { centro, chao } = plano
  const dx = x - centro.x
  const dz = z - centro.z
  const adx = Math.abs(dx)
  const adz = Math.abs(dz)

  // ── O poste ──────────────────────────────────────────────────────────────
  for (const p of postes) {
    if (p.x !== x || p.z !== z) continue
    const saida = [{ y: chao, id: ID.cobblestone }]
    for (let i = 1; i < ALTURA_DO_POSTE; i++) saida.push({ y: chao + i, id: POSTE() })
    saida.push({ y: chao + ALTURA_DO_POSTE, id: ID.lantern })
    return saida
  }

  if (adx > RAIO_DA_PRACA || adz > RAIO_DA_PRACA) return null

  // ── O poço ───────────────────────────────────────────────────────────────
  //
  // ⚠️ A ÁGUA É CERCADA POR PEDRA NOS QUATRO LADOS, e isso não é enfeite: a
  // fonte escorre. Um poço com um lado aberto vira um córrego atravessando a
  // praça na primeira visita da fila de fluidos, e o jogador lê isso como
  // vazamento — que é exatamente o que é.
  if (adx <= POCO && adz <= POCO) {
    const saida = []
    if (dx === 0 && dz === 0) {
      saida.push({ y: chao, id: ID.water })
      saida.push({ y: chao + 1, id: ID.water })
    } else {
      saida.push({ y: chao, id: ID.cobblestone })
      saida.push({ y: chao + 1, id: ID.cobblestone })
    }
    // Os quatro pilares, nas quinas; entre eles, o vão por onde se tira água.
    const naQuina = adx === POCO && adz === POCO
    for (let i = 2; i < ALTURA_DO_POSTE; i++) {
      saida.push({ y: chao + i, id: naQuina ? POSTE() : AR })
    }
    // A cobertura: laje, e não bloco cheio. Bloco cheio num telhadinho de 3×3
    // fica com cara de caixote em cima do poço.
    saida.push({ y: chao + ALTURA_DO_POSTE, id: ID[LAJE_DO_BLOCO.oakPlanks.base] })
    return saida
  }

  // ── O piso da praça ──────────────────────────────────────────────────────
  //
  // ⚠️ E ELE LIMPA O QUE ESTÁ POR CIMA. Sem apagar as duas células acima do
  // chão, o capim alto que já nasceu ali continua de pé em cima do pedregulho —
  // e uma praça com mato no meio não parece praça.
  const borda = Math.max(adx, adz) === RAIO_DA_PRACA
  const saida = [{ y: chao, id: borda ? ID.podzol : ID.cobblestone }]
  for (let y = chao + 1; y <= chao + 2; y++) saida.push({ y, id: AR })
  return saida
}

/**
 * A escada que desce da praça para o campo, quando a praça fica acima do chão
 * natural. Existe para o jogador não ficar preso num degrau de um bloco.
 *
 * ⚠️ NÃO É DECORAÇÃO: o chão da aldeia é o ponto MAIS BAIXO dos cinco medidos,
 * mas o terreno em volta pode estar até `DESNIVEL_MAXIMO` acima. Onde a praça
 * corta um barranco, a borda vira um degrau seco.
 */
export const degrauDaBorda = (material, descePara) =>
  ID[VARIANTE_DE_ESCADA[`${material.escada}|${descePara < 0 ? 5 : 4}|b`]]

/** A cerca de um trecho reto no eixo X (liga −X a +X). */
export const cercaNoX = () =>
  ID[VARIANTE_DE_CERCA[`oakFence|${BITS_DA_CERCA.nx | BITS_DA_CERCA.px}`]]

/** A cerca de um trecho reto no eixo Z. */
export const cercaNoZ = () =>
  ID[VARIANTE_DE_CERCA[`oakFence|${BITS_DA_CERCA.nz | BITS_DA_CERCA.pz}`]]
