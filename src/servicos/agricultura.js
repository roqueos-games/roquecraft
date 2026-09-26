// RoqueCraft - AGRICULTURA: arar, plantar, crescer, colher.
//
// Este módulo é a regra PURA da lavoura. Ele não toca no mundo, não toca no
// inventário e não toca no som: recebe ids, devolve um plano. Quem executa é o
// componente, que é o único lugar com acesso a `applyEdit`.
//
// Por que separado desde a primeira etapa: a agricultura é a cadeia mais longa
// do jogo (arar → semear → hidratar → crescer → colher → assar → comer → criar
// bicho), e cada elo dela tem uma condição que só se enxerga em teste. Enquanto
// essas condições morarem dentro de um `if` no meio de `doPlace`, nenhuma tem
// teste — foi exatamente o que aconteceu com o balde antes de `balde.js`.

import {
  AIR,
  ID,
  IDS_DO_CULTIVO,
  CULTURA_DA_SEMENTE,
  TRIGO,
  blockDef,
  isPlant,
  isReplaceable,
} from './blocks.js'
import { TIQUES_POR_SEGUNDO } from './constants.js'

/**
 * O que a enxada revira.
 *
 * Grama e terra, e mais nada. Areia não vira lavoura, pedra não vira lavoura, e
 * PODZOL também não: no jogo de referência ele é chão de floresta de pinheiro,
 * ácido, e a enxada não o aceita. Deixar o conjunto explícito aqui é o que
 * permite ao teste dizer "só estes dois" sem depender de um atributo que
 * alguém acrescenta a um bloco novo sem perceber a consequência.
 */
export const ARAVEIS = Object.freeze(['grassBlock', 'dirt'])

const idsAraveis = () => new Set(ARAVEIS.map((k) => ID[k]))

/**
 * O que está por cima atrapalha?
 *
 * ⚠️ CÉU ABERTO É REQUISITO, e a razão é física, não estética: solo arado é uma
 * cama de plantio, e planta precisa da célula de cima livre pra nascer. Arar
 * debaixo de um bloco sólido produziria uma lavoura onde nada pode brotar —
 * chão que parece lavoura e não é, que é pior do que não poder arar.
 *
 * Mato e flor NÃO atrapalham: a enxada passa por cima deles como a pá passa
 * pela neve, e eles somem no processo. É o que o jogador espera ao limpar um
 * canteiro.
 */
export const livrePorCima = (id) => id === AIR || isReplaceable(id) || isPlant(id)

/**
 * O plano de arar uma célula, ou `null` se aquela célula não se ara.
 *
 * `{ solo, limpaAcima }` — `solo` é o id que entra no lugar, `limpaAcima` diz
 * se a célula de cima precisa virar ar (havia mato ali).
 */
export function ararComEnxada(idAlvo, idAcima) {
  if (!idsAraveis().has(idAlvo)) return null
  if (!livrePorCima(idAcima)) return null
  return { solo: ID.farmland, limpaAcima: idAcima !== AIR }
}

// ── Plantio e crescimento ───────────────────────────────────────────────────

/** O chão que segura lavoura: solo arado, seco ou molhado. */
export const ehSoloDeLavoura = (id) => id === ID.farmland || id === ID.farmlandWet

/** O estágio de uma célula de lavoura, ou `null` se ali não há lavoura. */
export function estagioDe(id) {
  return blockDef(id)?.cultivo?.estagio ?? null
}

/**
 * ⚠️ "MADURA" É POR CULTURA, e não um número global.
 *
 * Trigo tem oito estágios, cenoura e batata têm quatro. Enquanto `ESTAGIO_MADURO`
 * era a constante 7, a cenoura no estágio 3 — a última dela — seria lida como
 * verde para sempre: cresceria sem parar, nunca pararia de se reagendar e nunca
 * poderia ser colhida como madura.
 */
export const ESTAGIO_MADURO = TRIGO.estagios - 1
export function estaMadura(id) {
  const cultivo = blockDef(id)?.cultivo
  if (!cultivo) return false
  return cultivo.estagio === IDS_DO_CULTIVO[cultivo.tipo].length - 1
}

/**
 * Plantar: devolve o id do broto, ou `null` se não dá.
 *
 * Duas condições, e as duas por motivo de jogo:
 *  · o chão tem que ser solo arado — plantar em grama daria uma lavoura que
 *    não precisa de enxada, e a enxada perde a razão de existir;
 *  · a célula tem que estar livre — semear dentro de pedra não é semear.
 */
export function plantar(itemNaMao, idSolo, idCelula) {
  const tipo = CULTURA_DA_SEMENTE[itemNaMao]
  if (!tipo) return null
  if (!ehSoloDeLavoura(idSolo)) return null
  if (idCelula !== AIR && !isReplaceable(idCelula)) return null
  return IDS_DO_CULTIVO[tipo][0]
}

/**
 * De quanto em quanto tempo a célula TENTA crescer, em tiques (20 por segundo).
 *
 * ⚠️ TENTA, não cresce — e a diferença não é preciosismo. O anel de baldes de
 * `atualizacoes.js` tem teto de 63 tiques (~3 s): pedir um atraso de dois
 * minutos não daria erro, daria um atraso silenciosamente encurtado, que é como
 * se descobre tarde que a lavoura inteira cresce em segundos.
 *
 * Então o modelo é o do jogo de referência: visita frequente com SORTEIO. A
 * cada 3 segundos há 25% de chance de avançar um estágio — média de 12 segundos
 * por estágio, pouco mais de um minuto e meio do broto à espiga, e com a
 * variação que faz duas fileiras plantadas juntas não amadurecerem em bloco.
 */
export const TIQUES_ENTRE_TENTATIVAS = 3 * TIQUES_POR_SEGUNDO
export const CHANCE_DE_AVANCAR = 0.25

/**
 * A luz mínima para a lavoura andar.
 *
 * É a do jogo de referência, e ela existe pra que lavoura seja coisa de fora,
 * de dia, ou de dentro COM tocha. Uma lavoura que cresce no escuro apaga a
 * diferença entre planejar um canteiro e cavar um buraco.
 */
export const LUZ_MINIMA = 9

/**
 * O próximo estágio de uma célula de lavoura, ou `null` se ela não anda agora.
 *
 * `null` tem três causas e o chamador não precisa distinguir: não é lavoura, já
 * está madura, ou falta luz/solo. Todas terminam do mesmo jeito — nada muda e a
 * célula é reagendada.
 */
export function crescer(idCelula, { idSolo, luz, rng = Math.random }) {
  const cultivo = blockDef(idCelula)?.cultivo
  if (!cultivo) return null
  const ids = IDS_DO_CULTIVO[cultivo.tipo]
  const estagio = cultivo.estagio
  if (estagio >= ids.length - 1) return null
  if (!ehSoloDeLavoura(idSolo)) return null
  // ⚠️ `luz` pode ser `null`: é a resposta honesta de `luzCombinada` para um
  // pedaço do mundo que não está espelhado no cliente. "Não sei" não é "está
  // escuro" nem "está claro" — a lavoura simplesmente não anda agora, e tenta
  // de novo quando o chunk chegar.
  if (luz === null || luz === undefined) return null
  if (luz < LUZ_MINIMA) return null
  if (rng() >= chanceDeAvancar(idSolo)) return null
  return ids[estagio + 1]
}

/**
 * A lavoura ainda tem chão?
 *
 * Quebrar o solo debaixo de um pé de trigo tem que MATAR o pé. Sem isto o talo
 * fica flutuando, e pior: continua crescendo no ar, o que é uma lavoura que
 * dispensa o solo arado que a etapa 1 inteira existe pra exigir.
 */
export const perdeuOChao = (idCelula, idSolo) =>
  estagioDe(idCelula) !== null && !ehSoloDeLavoura(idSolo)

// ── A MUDA ──────────────────────────────────────────────────────────────────
//
// Madeira era o único recurso do jogo que ACABAVA. O mapa nasce com as árvores
// que tem e não faz mais nenhuma: quem derruba a floresta em volta da base fica
// sem tábua, sem bancada e sem ferramenta nova. A muda já caía das folhas (6%)
// e só servia de enfeite no inventário.

/** O chão que segura uma muda. Areia não: carvalho não pega em duna. */
export const SOLOS_DE_MUDA = Object.freeze(['grassBlock', 'dirt', 'podzol'])

/**
 * ⚠️ A MUDA É MUITO MAIS LENTA QUE O TRIGO, de propósito.
 *
 * Com a mesma chance do trigo, uma floresta replantada fecharia em dois minutos
 * e a madeira deixaria de ter custo — e é o custo dela que faz o jogador
 * escolher entre a bancada e a cerca. 4% a cada 3 segundos dá uma árvore a cada
 * um minuto e meio, em média, o que continua sendo rápido para quem plantou dez
 * mudas de uma vez e devagar para quem plantou uma e ficou olhando.
 */
export const CHANCE_DA_MUDA = 0.04

/**
 * A muda vira árvore agora?
 *
 * `colunaLivre` é quantas células de ar existem ACIMA dela: sem espaço, uma
 * muda plantada dentro de casa arrancaria o teto do jogador ao crescer.
 */
export function mudaVaiCrescer({ idCelula, idSolo, luz, colunaLivre, rng = Math.random }) {
  if (idCelula !== ID.oakSapling) return false
  if (!SOLOS_DE_MUDA.map((k) => ID[k]).includes(idSolo)) return false
  if (luz === null || luz === undefined || luz < LUZ_MINIMA) return false
  if (colunaLivre < ALTURA_MINIMA_DA_ARVORE) return false
  return rng() < CHANCE_DA_MUDA
}

/**
 * Quanto céu a árvore precisa.
 *
 * É a altura MÍNIMA do carvalho (`TREE_KINDS.oak.minH` = 4) mais a copa. Menos
 * que isso e o tronco nasceria enfiado no teto, com a copa comendo o que
 * estivesse ali — ou, pior, com as folhas puladas por `seAr` e um tronco pelado
 * no meio da sala.
 */
export const ALTURA_MINIMA_DA_ARVORE = 6

/** A muda perdeu o chão? Mesma regra do talo de trigo. */
export const mudaSemChao = (idCelula, idSolo) =>
  idCelula === ID.oakSapling && !SOLOS_DE_MUDA.map((k) => ID[k]).includes(idSolo)

// ── Hidratação ──────────────────────────────────────────────────────────────
//
// O solo arado molhado já existia como bloco desde a etapa 1 e NADA o produzia:
// uma textura bonita que o jogo nunca mostrava. Sem hidratação, a água não tem
// papel nenhum na lavoura, e o balde — que custa três lingotes de ferro — não
// serve pra nada além de decoração.

/**
 * ⚠️ QUATRO BLOCOS, como no original, e é o número que desenha o canteiro.
 *
 * É ele que faz a fazenda clássica: um quadrado de 9×9 com uma cova d'água no
 * centro molha o canteiro inteiro. Com raio 1 a água teria que estar colada em
 * cada célula e o jogador acabaria com faixas de terra alternadas com valas —
 * feio, caro e nada parecido com uma lavoura.
 */
export const RAIO_DE_HIDRATACAO = 4

/** O id que o solo deve ter, dada a presença de água por perto. */
export function soloComAgua(idSolo, temAguaPerto) {
  if (!ehSoloDeLavoura(idSolo)) return null
  const alvo = temAguaPerto ? ID.farmlandWet : ID.farmland
  return alvo === idSolo ? null : alvo
}

/**
 * Solo molhado faz crescer MAIS RÁPIDO — é o que dá função à água.
 *
 * Sem essa diferença, hidratar seria só uma mudança de cor: o jogador veria o
 * canteiro escurecer perto da água e não teria motivo nenhum pra cavar a cova.
 */
export const chanceDeAvancar = (idSolo) =>
  idSolo === ID.farmlandWet ? CHANCE_DE_AVANCAR * 2 : CHANCE_DE_AVANCAR

/**
 * Esta célula precisa do RELÓGIO da lavoura?
 *
 * ⚠️ É A PERGUNTA QUE O CARREGAMENTO DO SAVE FAZ, e ela existe por causa de um
 * defeito que só aparece entre duas sessões: a fila deste jogo é reativa, e
 * quem mantém lavoura, muda e canteiro andando é a própria visita se repondo.
 * Ao carregar um mundo salvo NINGUÉM começa essa cadeia — o jogador planta,
 * fecha o jogo, volta no dia seguinte e encontra o broto do mesmo tamanho,
 * parado para sempre, até quebrar um bloco por perto sem querer.
 *
 * Vale para os três: planta que cresce, muda que vira árvore e canteiro que
 * molha e seca.
 */
export function precisaDeRelogioDeLavoura(id) {
  return (
    estagioDe(id) !== null || id === ID.oakSapling || id === ID.sugarCane || ehSoloDeLavoura(id)
  )
}

// ── O CAULE QUE PARE ────────────────────────────────────────────────────────
//
// Abóbora e melancia são o único cultivo em que a planta madura NÃO vira item.
// Ela fica madura e passa a gerar o fruto numa célula vizinha, uma de cada vez.
// Quebrar o fruto não mata o caule — é isso que faz a horta ser uma máquina em
// vez de um replantio, e é a razão de valer a pena plantar uma.

/** A chave do fruto que este caule dá, ou `null` se não for caule maduro. */
export function frutoDoCauleMaduro(id) {
  const cultivo = blockDef(id)?.cultivo
  if (!cultivo?.fruto) return null
  return estaMadura(id) ? cultivo.fruto : null
}

/**
 * ⚠️ MAIS LENTO QUE O CRESCIMENTO, e por um motivo de jogo: um caule que
 * frutifica a cada visita entope os quatro lados em doze segundos e a horta
 * vira um tapete de abóbora que ninguém consegue atravessar. No original o
 * fruto também demora bem mais que o estágio.
 */
export const CHANCE_DE_FRUTIFICAR = 0.06

/**
 * Onde o fruto nasce, dado o que há nos quatro lados.
 *
 * `lados` é uma lista de `{ dx, dz, vazio, chao }` na ordem em que o chamador
 * leu o mundo. Devolve o escolhido ou `null`.
 *
 * ⚠️ O SORTEIO ESCOLHE O LADO, e não o primeiro que serve. Com "o primeiro", o
 * fruto sempre nasceria no mesmo lado do caule — quatro caules em fila dariam
 * quatro abóboras alinhadas no mesmo eixo, e a horta ficaria com cara de
 * planilha. E é o mesmo `rng` do resto: teste manda nele.
 */
export function ladoParaOFruto(lados, rng = Math.random) {
  const bons = lados.filter((l) => l.vazio && l.chao)
  if (!bons.length) return null
  return bons[Math.min(bons.length - 1, Math.floor(rng() * bons.length))]
}

/** O chão que segura um fruto de caule: terra, grama, lavoura. */
export const seguraFruto = (id) =>
  id === ID.dirt || id === ID.grassBlock || id === ID.podzol || ehSoloDeLavoura(id)

// ── A CANA ──────────────────────────────────────────────────────────────────
//
// A cana nascia na margem dos rios e era enfeite: não crescia, não dropava
// nada que servisse pra alguma coisa, e a estante de livros — o único uso que
// papel teria — era feita de COURO, uma adaptação de quando papel não existia.

/** Altura máxima de um pé de cana, como no original. */
export const ALTURA_DA_CANA = 3

/**
 * A cana está apoiada em chão que ela aceita?
 *
 * Areia ou terra, e **com água encostada na lateral do bloco de baixo** — é o
 * que faz a cana ser planta de MARGEM e não mais uma planta de canteiro. Sem a
 * exigência de água, ela viraria trigo que cresce em pé.
 */
export const chaoDeCana = (idChao, temAguaAoLado) =>
  (idChao === ID.sand || idChao === ID.dirt || idChao === ID.grassBlock) && temAguaAoLado

/**
 * Este pé de cana cresce mais um bloco agora?
 *
 * `alturaAtual` é quantos blocos de cana há DESTE pra baixo, contando ele.
 *
 * ⚠️ SÓ O TOPO CRESCE. Se cada bloco do pé pudesse crescer, uma cana de três
 * viraria três canas de três — o pé se multiplicaria pra dentro de si mesmo.
 */
export function canaVaiCrescer({
  ehTopo,
  alturaAtual,
  acimaVazio,
  apoiada,
  luz,
  rng = Math.random,
}) {
  if (!ehTopo || !apoiada || !acimaVazio) return false
  if (alturaAtual >= ALTURA_DA_CANA) return false
  if (luz === null || luz === undefined || luz < LUZ_MINIMA) return false
  return rng() < CHANCE_DE_AVANCAR
}
