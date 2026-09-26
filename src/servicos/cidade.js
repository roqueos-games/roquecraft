// RoqueCraft — O QUE FAZ UMA CIDADE SER CIDADE.
//
// ⚠️ UMA CIDADE NÃO É UMA VILA COM MAIS CASAS. Trinta casas iguais em volta de
// uma praça é um condomínio, não um lugar: o que distingue cidade é ter
// EDIFÍCIO PÚBLICO — algo alto que se vê de longe e diz "ali tem gente" — e
// comércio de rua, que é a razão de alguém atravessar o mapa até lá.
//
// Este arquivo é a tabela dessas construções. Ele é dado puro, como
// `pecaNaMao.js` e pelo mesmo motivo: a silhueta de uma igreja pode ser
// AFIRMADA sem three.js, sem chunk e sem foto — e uma torre que encolheu
// reprova num teste de unidade em vez de esperar alguém reparar.
//
// ⚠️ E ELE NÃO DESENHA: devolve caixas em coordenada local, e quem escreve no
// mundo continua sendo o despachante de coluna da aldeia. Worldgen roda para os
// NOVE chunks vizinhos, e tudo aqui precisa ser função pura da coordenada.

import { ID } from './blocks.js'

/**
 * A IGREJA — o edifício que se vê antes da cidade.
 *
 * ⚠️ A ALTURA É A FUNÇÃO, não o enfeite. A vila tem 11 de altura escrita; a
 * torre daqui passa de 20 para aparecer acima dos telhados a duzentos blocos,
 * que é a distância em que o jogador decide se vai até lá. Uma igreja da altura
 * de uma casa não cumpre o papel de ponto de referência, e aí ela é só mais uma
 * casa com nome bonito.
 */
export const IGREJA = Object.freeze({
  nave: { lx: 4, lz: 6 },
  peDaNave: 7,
  torre: { lado: 2 },
  alturaDaTorre: 21,
  /** Quanto a torre avança à frente da nave, no eixo longo. */
  recuoDaTorre: 5,
})

/** A altura total que a igreja escreve acima do chão. Derivada, nunca digitada. */
export const ALTURA_DA_IGREJA = IGREJA.alturaDaTorre + 3

/**
 * Até onde a igreja se estende do próprio centro, no plano: a nave mais a torre
 * recuada. É o que a cidade precisa somar ao raio ESCRITO dela — a igreja fica
 * a ~59 do centro e o raio escrito era 61: a torre caía fora e nunca chegava
 * ao mundo (Goal 21, 2.4). Derivada, nunca digitada.
 */
export const ALCANCE_DA_IGREJA = IGREJA.nave.lz + IGREJA.recuoDaTorre + IGREJA.torre.lado + 1

/**
 * A BANCA DE FEIRA — comércio de rua, na praça.
 *
 * Quatro postes, um toldo e um balcão. É a construção mais barata daqui e a que
 * mais muda a leitura da praça: praça vazia é largo, praça com banca é mercado.
 */
export const BANCA = Object.freeze({ lx: 2, lz: 1, alturaDoToldo: 3 })

/** Quantas bancas a feira tem. Ímpar de propósito: praça com eixo, não grade. */
export const BANCAS_DA_FEIRA = 5

/**
 * As LOJAS, por ofício.
 *
 * ⚠️ LOJA NÃO É CASA COM OUTRO NOME. O que a faz ler como loja é o BALCÃO
 * voltado para a rua e a tabuleta acima da porta — duas peças, e a construção
 * inteira muda de função aos olhos de quem passa. Sem isso, "a cidade tem
 * lojas" seria uma afirmação que só o código conhece.
 */
export const TABULETA_DO_OFICIO = Object.freeze({
  fazendeiro: ID.hayBale ?? ID.oakPlanks,
  ferreiro: ID.furnace,
  bibliotecario: ID.bookshelf,
  clerigo: ID.brewingStand,
})

/** O bloco de tabuleta de um ofício, com um recuo que sempre existe. */
export const tabuletaDe = (oficio) => TABULETA_DO_OFICIO[oficio] ?? ID.oakPlanks

/**
 * Quantas das casas de uma cidade viram loja.
 *
 * ⚠️ NÃO SÃO TODAS, e o número importa. Cidade em que toda porta é comércio
 * lê como cenário de jogo; o que dá vida é a mistura — casa, casa, loja, casa.
 * Um terço é o bastante para o jogador esbarrar numa sem procurar.
 */
export const FRACAO_DE_LOJAS = 1 / 3

/** Esta casa é loja? Função pura do hash, como tudo que worldgen decide. */
export const ehLoja = (hash, casa) => hash(casa.x, casa.z, 91) < FRACAO_DE_LOJAS

/**
 * As caixas da igreja, em coordenada LOCAL ao centro dela.
 *
 * Devolve `{ dx, dz, de, ate, id }` — uma coluna de `de` a `ate` (inclusive),
 * relativa ao chão. Coluna, e não bloco solto, porque é assim que o despachante
 * da aldeia escreve, e converter duas vezes é onde as formas se perdem.
 */
export function colunasDaIgreja(material) {
  const { nave, peDaNave, torre, alturaDaTorre, recuoDaTorre } = IGREJA
  const saida = []
  // ⚠️ `MATERIAIS` GUARDA CHAVES ('oakPlanks'), NÃO IDS. Até 18/09 estas duas
  // linhas passavam a chave adiante, `put` escrevia a string num Uint8Array e
  // ela virava 0 — AR. A igreja e a feira eram "construídas" em ar: o plano
  // dizia que existiam, o teste do plano passava, e a cidade nascia sem as
  // duas coisas que a fazem cidade. A primeira foto da cidade (Goal 21, 2.4)
  // é que mostrou o largo vazio. `ID[chave]`, como `vilaCasa.js` sempre fez.
  const parede = ID[material?.parede] ?? ID.oakPlanks
  const base = ID[material?.base] ?? ID.cobblestone

  // A NAVE: paredes de pedra até a cintura e madeira acima. A cintura de pedra
  // é o que impede o prédio de ler como galpão — templo tem embasamento.
  for (let dx = -nave.lx; dx <= nave.lx; dx++) {
    for (let dz = -nave.lz; dz <= nave.lz; dz++) {
      const borda = Math.abs(dx) === nave.lx || Math.abs(dz) === nave.lz
      if (!borda) {
        saida.push({ dx, dz, de: 0, ate: 0, id: base })
        continue
      }
      saida.push({ dx, dz, de: 1, ate: 2, id: base })
      saida.push({ dx, dz, de: 3, ate: peDaNave, id: parede })
    }
  }
  // Telhado da nave, plano e de pedra: a nave não pode competir com a torre.
  for (let dx = -nave.lx; dx <= nave.lx; dx++) {
    for (let dz = -nave.lz; dz <= nave.lz; dz++) {
      saida.push({ dx, dz, de: peDaNave + 1, ate: peDaNave + 1, id: base })
    }
  }

  // A TORRE, avançada à frente da nave no eixo longo. Avançada, e não centrada:
  // torre no meio do telhado lê como chaminé; na fachada, lê como campanário.
  const cz = -nave.lz + recuoDaTorre - nave.lz
  for (let dx = -torre.lado; dx <= torre.lado; dx++) {
    for (let dz = -torre.lado; dz <= torre.lado; dz++) {
      const borda = Math.abs(dx) === torre.lado || Math.abs(dz) === torre.lado
      const z = cz + dz
      if (borda) saida.push({ dx, dz: z, de: 1, ate: alturaDaTorre, id: base })
      else saida.push({ dx, dz: z, de: 0, ate: 0, id: base })
    }
  }
  // O CORUCHÉU: a torre afina, e é o afinamento que lê como agulha de igreja.
  for (let i = 0; i <= torre.lado; i++) {
    const lado = torre.lado - i
    for (let dx = -lado; dx <= lado; dx++) {
      for (let dz = -lado; dz <= lado; dz++) {
        saida.push({
          dx,
          dz: cz + dz,
          de: alturaDaTorre + 1 + i,
          ate: alturaDaTorre + 1 + i,
          id: base,
        })
      }
    }
  }
  return saida
}

/** As caixas de uma banca de feira, em coordenada local ao centro dela. */
export function colunasDaBanca(material) {
  // Chave → id, pelo mesmo motivo da igreja (ver `colunasDaIgreja`).
  const madeira = ID[material?.viga] ?? ID.oakLog
  const toldo = ID[material?.parede] ?? ID.oakPlanks
  const saida = []
  for (const dx of [-BANCA.lx, BANCA.lx]) {
    for (const dz of [-BANCA.lz, BANCA.lz]) {
      saida.push({ dx, dz, de: 1, ate: BANCA.alturaDoToldo - 1, id: madeira })
    }
  }
  for (let dx = -BANCA.lx; dx <= BANCA.lx; dx++) {
    for (let dz = -BANCA.lz; dz <= BANCA.lz; dz++) {
      saida.push({ dx, dz, de: BANCA.alturaDoToldo, ate: BANCA.alturaDoToldo, id: toldo })
    }
  }
  // O BALCÃO, num lado só: banca fechada dos quatro lados é caixa, não banca.
  for (let dx = -BANCA.lx; dx <= BANCA.lx; dx++) {
    saida.push({ dx, dz: BANCA.lz, de: 1, ate: 1, id: toldo })
  }
  return saida
}

/** Onde as bancas ficam na praça, em coordenada local ao centro dela. */
export function bancasDaFeira(raioDaPraca) {
  const saida = []
  const r = raioDaPraca - BANCA.lx - 1
  for (let i = 0; i < BANCAS_DA_FEIRA; i++) {
    const a = (i / BANCAS_DA_FEIRA) * Math.PI * 2
    saida.push({ dx: Math.round(Math.cos(a) * r), dz: Math.round(Math.sin(a) * r) })
  }
  return saida
}
