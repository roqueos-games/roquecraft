//
// A FAZENDA E O CURRAL — o que a vila FAZ.
//
// ⚠️ A VILA TINHA CASA E NÃO TINHA TRABALHO. O aldeão vendia trigo e cenoura
// numa vila onde não havia uma única leira plantada; o ferreiro vendia ferro sem
// fornalha. A troca funcionava e mesmo assim mentia: o lugar não sustentava o
// que oferecia, e isso o jogador lê antes de saber explicar.
//
// O que entra, e por quê:
//
//   · LEIRA IRRIGADA. É a imagem que diz "aqui mora gente que planta". E a
//     irrigação não é enfeite: `farmlandWet` existe no catálogo, seca sem água
//     por perto, e uma horta de terra seca é uma horta abandonada.
//   · CULTURAS EM ESTÁGIOS DIFERENTES. Uma leira inteira madura parece cenário;
//     uma leira com pé recém-nascido ao lado de pé pronto parece uma roça em uso.
//   · CERCA COM PORTÃO. Sem ela a vaca entra e come a plantação — e, mesmo com
//     o rebanho longe, uma horta sem cerca lê como mato mais alto.
//   · CURRAL. O trigo alimenta alguém. Sem bicho na vila, a fazenda fica sem
//     destino e o couro do ferreiro vem do nada.
//
// ⚠️ TUDO FUNÇÃO PURA DA COORDENADA, como o resto da aldeia.

import { ID, VARIANTE_DE_CERCA, BITS_DA_CERCA, IDS_DO_CULTIVO } from './blocks.js'
import { AR } from './vilaCasa.js'

/** Metade da leira, sem a cerca. */
export const LEIRA = { lx: 3, lz: 2 }
/** Metade do curral, sem a cerca. */
export const CURRAL = { lx: 3, lz: 3 }
/** Meia-largura total de uma estrutura de roça, cerca inclusa. */
export const BORDA_DA_ROCA = Math.max(LEIRA.lx, LEIRA.lz, CURRAL.lx, CURRAL.lz) + 1

const CULTURAS = ['wheat', 'carrot', 'potato']

/** A cerca de um trecho, pelos vizinhos que ela tem. */
const cerca = (bits) => ID[VARIANTE_DE_CERCA[`oakFence|${bits}`]]

/**
 * A cerca de uma célula do perímetro, ligada só a quem é perímetro também.
 *
 * ⚠️ SEM ISTO A CERCA SAI SOLTA. A conexão está codificada no id (ver a nota em
 * `blocks.js`), então uma cerca que não declara os vizinhos nasce como poste
 * isolado — vinte postes em fila, e não uma cerca.
 */
function cercaDoPerimetro(dx, dz, lx, lz) {
  let bits = 0
  const ehPerimetro = (x, z) =>
    Math.abs(x) <= lx + 1 &&
    Math.abs(z) <= lz + 1 &&
    (Math.abs(x) === lx + 1 || Math.abs(z) === lz + 1)
  if (ehPerimetro(dx, dz - 1)) bits |= BITS_DA_CERCA.nz
  if (ehPerimetro(dx, dz + 1)) bits |= BITS_DA_CERCA.pz
  if (ehPerimetro(dx - 1, dz)) bits |= BITS_DA_CERCA.nx
  if (ehPerimetro(dx + 1, dz)) bits |= BITS_DA_CERCA.px
  return cerca(bits)
}

/**
 * A coluna de uma LEIRA, ou `null`.
 *
 * ⚠️ O CANAL FICA NO MEIO E É FECHADO POR TERRA ARADA NOS QUATRO LADOS. A água
 * é fonte: se um lado ficar aberto ela escorre pela vila inteira na primeira
 * visita da fila de fluidos. `farmland` é sólido, e é ele quem segura.
 */
export function colunaDaLeira(hash, roca, chao, x, z) {
  const dx = x - roca.x
  const dz = z - roca.z
  const { lx, lz } = LEIRA
  if (Math.abs(dx) > lx + 1 || Math.abs(dz) > lz + 1) return null

  if (Math.abs(dx) === lx + 1 || Math.abs(dz) === lz + 1) {
    // O portão fica no meio da cerca de −Z: horta sem entrada é horta que o
    // jogador pula, e pular cerca é como ele descobre que ela não devia existir.
    if (dz === -(lz + 1) && dx === 0) {
      return [
        { y: chao, id: ID.podzol },
        { y: chao + 1, id: ID.oakGateNz },
      ]
    }
    return [
      { y: chao, id: ID.podzol },
      { y: chao + 1, id: cercaDoPerimetro(dx, dz, lx, lz) },
    ]
  }

  if (dz === 0)
    return [
      { y: chao, id: ID.water },
      { y: chao + 1, id: AR },
    ]

  const cultura = CULTURAS[Math.floor(hash(roca.x, roca.z, 3) * CULTURAS.length) % CULTURAS.length]
  const estagios = IDS_DO_CULTIVO[cultura]
  // ⚠️ ESTÁGIO POR CÉLULA, e não por leira: uma roça inteira madura parece
  // cenário. O hash da coluna é o que faz a leira parecer em uso.
  const e = Math.floor(hash(x, z, 5) * estagios.length)
  return [
    { y: chao, id: ID.farmlandWet },
    { y: chao + 1, id: estagios[Math.min(e, estagios.length - 1)] },
  ]
}

/**
 * A coluna do CURRAL, ou `null`. Cerca em volta, chão de terra, e um cocho de
 * água na quina para o bicho beber.
 */
export function colunaDoCurral(roca, chao, x, z) {
  const dx = x - roca.x
  const dz = z - roca.z
  const { lx, lz } = CURRAL
  if (Math.abs(dx) > lx + 1 || Math.abs(dz) > lz + 1) return null

  if (Math.abs(dx) === lx + 1 || Math.abs(dz) === lz + 1) {
    if (dz === -(lz + 1) && dx === 0) {
      return [
        { y: chao, id: ID.podzol },
        { y: chao + 1, id: ID.oakGateNz },
      ]
    }
    return [
      { y: chao, id: ID.podzol },
      { y: chao + 1, id: cercaDoPerimetro(dx, dz, lx, lz) },
    ]
  }
  // O cocho: água cercada de pedra, no canto oposto ao portão.
  const noCocho = dx >= lx - 1 && dz >= lz - 1
  if (noCocho) {
    if (dx === lx && dz === lz) return [{ y: chao, id: ID.water }]
    return [{ y: chao, id: ID.cobblestone }]
  }
  return [
    { y: chao, id: ID.grassBlock },
    { y: chao + 1, id: AR },
  ]
}

/**
 * Onde ficam as roças: fora do anel das casas, alinhadas com a praça.
 *
 * ⚠️ FORA DO ANEL, E NÃO ENTRE AS CASAS. A faixa entre a praça e as casas é
 * onde passam os caminhos e onde ficam os quintais; uma leira ali corta a rua.
 * Do lado de fora ela é o que o jogador vê ANTES da vila, e é assim que uma
 * roça anuncia um povoado.
 */
export function rocasDe(hash, plano, raioDaRoca) {
  const { centro } = plano
  const fora = []
  const giro = hash(centro.gx, centro.gz, 61) * Math.PI * 2
  // ⚠️ OITO CANDIDATAS PARA TRÊS VAGAS, e não três para três. A primeira versão
  // punha as três num anel de raio fixo dentro da faixa das casas: duas das três
  // batiam em casa e eram rejeitadas, e a vila saía com um curral e nenhuma
  // leira. O problema não era a rejeição — era não ter para onde ir.
  //
  // Elas ficam FORA do anel das casas de propósito. A faixa entre a praça e as
  // casas é onde passam os caminhos e onde ficam os quintais; uma leira ali
  // corta a rua. Do lado de fora ela é o que o jogador vê ANTES da vila, e é
  // assim que uma roça anuncia um povoado.
  const CANDIDATAS = 8
  const VAGAS = 3
  for (let i = 0; i < CANDIDATAS && fora.length < VAGAS; i++) {
    const a = giro + (i / CANDIDATAS) * Math.PI * 2
    const c = {
      x: centro.x + Math.round(Math.cos(a) * raioDaRoca),
      z: centro.z + Math.round(Math.sin(a) * raioDaRoca),
      // A primeira aceita é o curral: duas leiras e um curral é a proporção de
      // uma vila que planta para comer e cria para o couro.
      tipo: fora.length === 0 ? 'curral' : 'leira',
    }
    // ⚠️ MESMA REJEIÇÃO DAS CASAS, e pelo mesmo motivo: uma leira em cima de uma
    // casa não dá erro nenhum — dá uma casa com trigo brotando no telhado.
    const choca = plano.casas.some((h) => {
      const folga = Math.max(h.planta.lx, h.planta.lz) + 1 + BORDA_DA_ROCA
      return Math.abs(c.x - h.x) <= folga && Math.abs(c.z - h.z) <= folga
    })
    if (choca) continue
    const encosta = fora.some(
      (r) => Math.abs(c.x - r.x) <= BORDA_DA_ROCA * 2 && Math.abs(c.z - r.z) <= BORDA_DA_ROCA * 2,
    )
    if (encosta) continue
    fora.push(c)
  }
  return fora
}

/** O que esta coluna recebe da roça, ou `null`. */
export function colunaDaRoca(hash, plano, x, z) {
  for (const r of plano.rocas ?? []) {
    const col =
      r.tipo === 'curral'
        ? colunaDoCurral(r, plano.chao, x, z)
        : colunaDaLeira(hash, r, plano.chao, x, z)
    if (col) return col
  }
  return null
}

/** Onde os bichos do curral nascem. */
export function animaisDe(plano) {
  const fora = []
  for (const r of plano.rocas ?? []) {
    if (r.tipo !== 'curral') continue
    // Três bichos e as duas espécies: um curral com um bicho só é um bicho preso.
    for (const [i, tipo] of ['cow', 'pig', 'cow'].entries()) {
      fora.push({ x: r.x - 1 + i, y: plano.chao + 1, z: r.z - 1, tipo })
    }
  }
  return fora
}
