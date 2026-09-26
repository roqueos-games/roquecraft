// RoqueCraft — A FORTALEZA: a sala enterrada com o anel do portal do Fim.
//
// Puro. UMA por mundo, e o lugar sai da semente: entre 250 e 400 blocos da
// origem, numa direção sorteada, no primeiro ângulo que cai em terra. O
// jogador não a vê do chão — ela é uma sala de pedra-tijolo 16 blocos abaixo
// — mas vê o POÇO: uma boca de pedra-tijolo à flor da terra, 3×3 de vão,
// que desce direto na sala e termina numa piscina (a queda não fere). Quem
// usa o olho do Fim ao ar livre recebe a direção e a distância
// (`usoDeFerramenta.js`): é o "o olho voa para lá" do original, sem a
// entidade.
//
// A sala, vista de cima (P = poço, M = moldura, · = miolo):
//
//        ┌─────────────┐
//        │             │
//        │    P P P    │
//        │    P P P    │
//        │    P P P    │
//        │     M M M   │
//        │   M · · · M │
//        │   M · · · M │
//        │   M · · · M │
//        │     M M M   │
//        └─────────────┘
//
import { ID } from './blocks.js'
import { AIR } from './constants.js'
import { celulasDoAnel, ANEL, MIOLO } from './portalDoFim.js'

/** Distância da origem, em blocos. */
export const DISTANCIA_MINIMA = 250
export const DISTANCIA_MAXIMA = 400
/** Quantos ângulos se tentam até cair em terra (depois disso, vale o mar). */
export const TENTATIVAS = 12
/** A sala: meio-lado do interior, altura livre, profundidade do chão dela. */
export const MEIO_DA_SALA = 6
export const ALTO_DA_SALA = 6
export const PROFUNDIDADE = 16
/** O poço: meio-lado do vão (3×3) e a boca acima do chão. */
export const MEIO_DO_POCO = 1
export const BOCA_DO_POCO = 2
/** O anel fica deslocado do poço para +Z: o jogador cai na piscina e o vê. */
export const ANEL_EM = { dx: 0, dz: 4 }
/** Quantos olhos já vêm na moldura. */
export const OLHOS_MINIMOS = 2
export const OLHOS_MAXIMOS = 4

/**
 * Onde a fortaleza está. `hash(a, b, c)` é o sorteador da semente (0..1);
 * `mundo.alturaEm(x, z)` e `mundo.nivelDoMar` decidem se é terra.
 */
export function centroDaFortaleza(hash, mundo) {
  const dist = DISTANCIA_MINIMA + hash(1, 2, 301) * (DISTANCIA_MAXIMA - DISTANCIA_MINIMA)
  const ang0 = hash(1, 2, 302) * Math.PI * 2
  let escolhido = null
  for (let i = 0; i < TENTATIVAS; i++) {
    const ang = ang0 + (i / TENTATIVAS) * Math.PI * 2
    const x = Math.round(Math.cos(ang) * dist)
    const z = Math.round(Math.sin(ang) * dist)
    const chao = mundo.alturaEm(x, z)
    if (!escolhido) escolhido = { x, z, chao }
    if (chao > mundo.nivelDoMar) return { x, z, chao }
  }
  return escolhido
}

/** O plano: centro, chão da superfície e o anel com os olhos sorteados. */
export function planoDaFortaleza(hash, mundo) {
  const centro = centroDaFortaleza(hash, mundo)
  if (!centro) return null
  const chaoDaSala = centro.chao - PROFUNDIDADE
  const olhos =
    OLHOS_MINIMOS + Math.floor(hash(centro.x, centro.z, 303) * (OLHOS_MAXIMOS - OLHOS_MINIMOS + 1))
  let n = 0
  const sorteio = () => hash(centro.x, centro.z, 310 + n++)
  const anel = celulasDoAnel(
    centro.x + ANEL_EM.dx,
    chaoDaSala,
    centro.z + ANEL_EM.dz,
    olhos,
    sorteio,
  )
  return { centro, chaoDaSala, olhos, anel }
}

/** O centro do anel do plano, para a sonda e para o olho apontar. */
export const centroDoAnelDe = (plano) => ({
  x: plano.centro.x + ANEL_EM.dx,
  y: plano.chaoDaSala,
  z: plano.centro.z + ANEL_EM.dz,
})

const RAIO = MEIO_DA_SALA + 1

/**
 * O que a coluna (x, z) recebe: `[{ y, id }]` de baixo para cima, ou null
 * quando a coluna não é da fortaleza. Inclui o AR que escava — é assim que a
 * sala e o poço atravessam a rocha que o terreno já escreveu.
 */
export function colunaDaFortaleza(plano, x, z) {
  if (!plano) return null
  const dx = x - plano.centro.x
  const dz = z - plano.centro.z
  if (Math.abs(dx) > RAIO || Math.abs(dz) > RAIO) return null
  const piso = plano.chaoDaSala - 1
  const teto = plano.chaoDaSala + ALTO_DA_SALA
  const parede = Math.abs(dx) === RAIO || Math.abs(dz) === RAIO
  const noPoco = Math.abs(dx) <= MEIO_DO_POCO && Math.abs(dz) <= MEIO_DO_POCO
  const naBocaDoPoco =
    !noPoco && Math.abs(dx) <= MEIO_DO_POCO + 1 && Math.abs(dz) <= MEIO_DO_POCO + 1
  const saida = []
  // O piso, com a piscina sob o poço.
  saida.push({ y: piso - 1, id: ID.stoneBricks })
  saida.push({ y: piso, id: noPoco ? ID.water : ID.stoneBricks })
  // As paredes e o interior.
  for (let y = plano.chaoDaSala; y < teto; y++) saida.push({ y, id: parede ? ID.stoneBricks : AIR })
  // O teto, furado pelo poço; luz nos cantos.
  const canto = Math.abs(dx) === MEIO_DA_SALA && Math.abs(dz) === MEIO_DA_SALA
  saida.push({ y: teto, id: noPoco ? AIR : canto ? ID.glowstone : ID.stoneBricks })
  // O poço sobe até a superfície, com a boca de pedra-tijolo por cima.
  if (noPoco) {
    for (let y = teto + 1; y <= plano.centro.chao + BOCA_DO_POCO; y++) saida.push({ y, id: AIR })
  } else if (naBocaDoPoco) {
    for (let y = plano.centro.chao + 1; y <= plano.centro.chao + BOCA_DO_POCO; y++) {
      saida.push({ y, id: ID.stoneBricks })
    }
  }
  // O anel, no chão da sala, e o miolo (ar por cima do piso).
  const c = centroDoAnelDe(plano)
  const moldura = plano.anel.find((m) => m.x === x && m.z === z)
  if (moldura) saida.push({ y: c.y, id: moldura.id })
  return saida
}

/** Os oito rumos, no sentido horário a partir do norte (−Z). */
export const RUMOS = ['n', 'ne', 'e', 'se', 's', 'so', 'o', 'no']

/**
 * O que o olho diz ao ar livre: o rumo e a distância (arredondada a dez) até
 * a fortaleza, a partir de onde o jogador está. `null` sem fortaleza.
 */
export function ondeFicaAFortaleza(plano, de) {
  if (!plano) return null
  const dx = plano.centro.x - de.x
  const dz = plano.centro.z - de.z
  const dist = Math.round(Math.hypot(dx, dz) / 10) * 10
  // atan2(dx, −dz): 0 é norte, cresce no sentido horário.
  const ang = Math.atan2(dx, -dz)
  const oitavo = Math.round(ang / (Math.PI / 4))
  return { rumo: RUMOS[((oitavo % 8) + 8) % 8], dist }
}

export { ANEL, MIOLO }
