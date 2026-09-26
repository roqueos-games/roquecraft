//
// FLUIDO QUE ESCORRE — a regra, pura, sem mundo e sem three.js.
//
// Uma regra só serve os dois líquidos. O que muda entre água e lava são três
// números — quanto o nível sobe por bloco, quantos tiques entre um passo e o
// outro, e se duas fontes geram uma terceira — e é dessas três linhas de tabela
// que saem duas sensações completamente diferentes de material.
//
// O modelo é PUXADO, não empurrado: o estado de uma célula é uma função dos
// vizinhos dela, e mais nada. Ninguém "manda água" pra ninguém.
//
// A alternativa — cada célula empurrando pros lados — parece mais natural e é
// onde mora o bug: dois vizinhos empurram pra mesma célula no mesmo tique, a
// ordem decide quem ganha, e a mesma cena dá resultado diferente a cada
// execução. Puxando, a ordem não importa: pergunte a qualquer célula, a
// qualquer hora, e ela dá a mesma resposta.
//
// E a drenagem sai de graça. O nível é a DISTÂNCIA até a fonte: nível 3 só
// existe encostado em nível 2. Tire a fonte e todo mundo passa a ver vizinhos
// piores que si, o número sobe, passa de 7 e a água some — de dentro pra fora,
// que é como escoa de verdade. Não existe ilha estável sem fonte: duas células
// que tentassem se sustentar uma na outra veriam o nível subir a cada rodada
// até estourar o 7.
//
// Números do original: nível 0 é fonte, 1 a 7 escorre, 8 é a coluna caindo. A
// água anda um bloco a cada 5 tiques e alcança sete; a lava do mundo de cima
// anda a cada 30 e alcança três. A lâmina do nível L ocupa (8 − L)/9 da célula.
//
import {
  AIR,
  ID,
  AGUA,
  LAVA,
  ID_DE_NIVEL,
  NIVEL_DE_FLUIDO,
  FLUIDO_DE_ID,
  NIVEL_CAINDO,
  ALCANCE_DE_NIVEL,
  IS_SOLID,
  IS_LIQUID,
  IS_REPLACEABLE,
  IS_FRAGIL,
  IS_AGUADO,
} from './blocks.js'

/**
 * Os dois fluidos, com os números do original.
 *
 * `passo` é quanto o nível sobe por bloco andado — e é ele que dá o alcance: a
 * água sobe de um em um e chega a sete blocos; a lava do mundo de cima sobe de
 * dois em dois e morre em três. Um número, duas sensações completamente
 * diferentes de material.
 *
 * `tiques` é a espera entre um passo e o outro. A lava é seis vezes mais lenta,
 * e é isso que torna possível correr dela.
 *
 * `fazFonte` é a água infinita: duas fontes vizinhas com chão embaixo geram uma
 * terceira. No original a lava NÃO faz — senão qualquer poça viraria fábrica de
 * obsidiana e a lava deixaria de ser um recurso.
 */
export const FLUIDOS = {
  [AGUA]: { tipo: AGUA, fonte: ID.water, passo: 1, tiques: 5, fazFonte: true },
  [LAVA]: { tipo: LAVA, fonte: ID.lava, passo: 2, tiques: 30, fazFonte: false },
}

/**
 * Os dois fluidos, na ordem em que o tique do mundo os visita.
 *
 * Morava no componente como `const OS_FLUIDOS = [FLUIDOS[AGUA], FLUIDOS[LAVA]]`.
 * É derivação da tabela acima, então mora aqui: quem ganhar um terceiro fluido
 * um dia mexe num arquivo só.
 */
export const OS_FLUIDOS = [FLUIDOS[AGUA], FLUIDOS[LAVA]]

/** Tiques entre um passo do fluxo e o próximo. Cinco, como no original. */
export const TIQUES_DA_AGUA = FLUIDOS[AGUA].tiques
export const TIQUES_DA_LAVA = FLUIDOS[LAVA].tiques

/** Quantas células a busca de buraco enxerga à frente. O original usa 5. */
export const ALCANCE_DA_BUSCA = 5

const DIRECOES = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

export const ehFluido = (id) => NIVEL_DE_FLUIDO[id] >= 0
export const fluidoDe = (id) => FLUIDO_DE_ID[id]
export const nivelDe = (id) => NIVEL_DE_FLUIDO[id]
export const idDeNivel = (tipo, n) => {
  // So' numero conta. O `?? -1` que existia aqui nao tinha como ter dono: a
  // tabela e' preenchida com -1 e os ids de fluido comecam em 111, entao
  // nenhum valor falsy-nao-nulo podia sair dela e `??` e `||` davam sempre a
  // mesma resposta.
  const id = ID_DE_NIVEL[tipo]?.[n]
  return typeof id === 'number' ? id : -1
}
/** Atalho de leitura: é água? é lava? */
export const ehAgua = (id) => FLUIDO_DE_ID[id] === AGUA
export const ehLava = (id) => FLUIDO_DE_ID[id] === LAVA

/**
 * A água entra nesta célula?
 *
 * Ar entra. Planta e tocha entram — e são LAVADAS, que é o que o original faz:
 * o que não segura o próprio peso não segura uma enxurrada. Sólido não entra.
 * Água entra (é ela mesma se reavaliando).
 */
export function podeInundar(id) {
  if (id === AIR) return true
  if (IS_LIQUID[id] === 1) return true
  if (IS_SOLID[id] === 1) return false
  // ⚠️ CÉLULA ALAGADA NÃO É INUNDÁVEL, e é o contrário do que a intuição diz.
  // A alga JÁ está dentro d'água: a água dela é a própria célula. Deixar a
  // fila inundar de novo trocaria o id da planta por água e lavaria toda a
  // vegetação do leito no primeiro tique — a alga nasceria e sumiria.
  return IS_AGUADO[id] !== 1 && (IS_FRAGIL[id] === 1 || IS_REPLACEABLE[id] === 1)
}

/**
 * Quanto uma célula de água ALIMENTA o vizinho do lado.
 *
 * A coluna caindo alimenta como fonte. É o que faz uma queda d'água formar
 * poça larga no pé em vez de um fiozinho: no original, água que cai chega
 * embaixo com força de nascente.
 */
const forcaDe = (nivel) => (nivel === NIVEL_CAINDO ? 0 : nivel)

/**
 * BFS no plano: por qual das quatro direções se chega mais rápido a um buraco?
 *
 * Devolve um vetor de 4 distâncias (Infinity onde não há buraco alcançável).
 *
 * Isto é o que separa "água que se espalha em losango" de "água que ACHA a
 * beirada e despenca". No original a preferência por buraco é o que dá o
 * comportamento que todo mundo reconhece: a lâmina corre reta até a queda em
 * vez de encher o andar todo primeiro.
 *
 * ⚠️ A busca anda por células ATRAVESSÁVEIS e olha o chão de cada uma. Andar
 * por cima de sólido acharia buracos do outro lado de uma parede, e a água
 * escolheria uma direção onde nunca vai conseguir passar.
 */
export function distanciasAteBuraco(blocoEm, x, y, z, alcance = ALCANCE_DA_BUSCA) {
  const dist = [Infinity, Infinity, Infinity, Infinity]
  for (let d = 0; d < 4; d++) {
    const [dx, dz] = DIRECOES[d]
    const px = x + dx
    const pz = z + dz
    if (!podeInundar(blocoEm(px, y, pz))) continue
    // Busca em largura a partir do primeiro passo desta direção. `vistas` é
    // por direção de propósito: a mesma célula pode ser alcançada por duas
    // direções, e as duas têm o direito de contá-la.
    const vistas = new Set([`${px},${pz}`])
    let fila = [[px, pz, 1]]
    while (fila.length) {
      const proxima = []
      for (const [cx, cz, passos] of fila) {
        if (podeInundar(blocoEm(cx, y - 1, cz))) {
          dist[d] = passos
          proxima.length = 0
          fila.length = 0
          break
        }
        if (passos >= alcance) continue
        for (const [ex, ez] of DIRECOES) {
          const nx = cx + ex
          const nz = cz + ez
          const k = `${nx},${nz}`
          if (vistas.has(k)) continue
          if (!podeInundar(blocoEm(nx, y, nz))) continue
          vistas.add(k)
          proxima.push([nx, nz, passos + 1])
        }
      }
      if (dist[d] !== Infinity) break
      fila = proxima
    }
  }
  return dist
}

/**
 * Uma célula de água em (sx, sy, sz) alimenta o vizinho na direção `dir`?
 *
 * Duas recusas, e as duas vêm do original:
 *
 *  1. QUEM PODE DESCER, DESCE. Água em cima de buraco não se espalha pros
 *     lados: despenca. Sem esta regra a lâmina enche o andar inteiro antes de
 *     achar a beirada, e ninguém reconhece isso como água.
 *  2. QUEM NÃO PODE DESCER ESCOLHE. Entre os lados abertos, só os que levam ao
 *     buraco MAIS PERTO recebem. Empate recebe junto; sem buraco nenhum à
 *     vista, todos recebem — e aí sim vira o losango.
 */
export function alimentaNaDirecao(blocoEm, sx, sy, sz, dir, alcance = ALCANCE_DA_BUSCA) {
  if (podeInundar(blocoEm(sx, sy - 1, sz))) return false
  const dist = distanciasAteBuraco(blocoEm, sx, sy, sz, alcance)
  const menor = Math.min(...dist)
  if (menor === Infinity) return true
  return dist[dir] === menor
}

/**
 * O nível que esta célula DEVERIA ter, olhando só os vizinhos DO MESMO FLUIDO.
 *
 * Devolve 0..8, ou −1 para "aqui não é este fluido".
 *
 * `ehFonte(x, y, z)` diz se a célula é fonte deste fluido — fonte não se deriva
 * de ninguém. Quem sabe disso é o mundo (worldgen, balde, save), não esta
 * função.
 */
export function nivelIdeal(blocoEm, ehFonte, x, y, z, fluido, alcance = ALCANCE_DA_BUSCA) {
  const aqui = blocoEm(x, y, z)
  if (!podeInundar(aqui)) return -1
  // Outro fluido já ocupa a célula: quem resolve isso é `encontro`, não o
  // fluxo. Deixar o fluxo decidir faria água e lava se sobrescreverem em
  // alternância, um id a cada tique, pra sempre.
  if (ehFluido(aqui) && fluidoDe(aqui) !== fluido.tipo) return -1
  if (ehFonte(x, y, z)) return 0

  // Fluido em cima = esta célula é coluna caindo, e coluna caindo enche a
  // célula.
  const acima = blocoEm(x, y + 1, z)
  if (fluidoDe(acima) === fluido.tipo) return NIVEL_CAINDO

  let melhor = NIVEL_CAINDO
  for (let d = 0; d < 4; d++) {
    const [dx, dz] = DIRECOES[d]
    const vx = x + dx
    const vz = z + dz
    const vizinho = blocoEm(vx, y, vz)
    if (fluidoDe(vizinho) !== fluido.tipo || !ehFluido(vizinho)) continue
    // A direção que o vizinho enxerga é a oposta da que eu vejo dele.
    const oposta = d ^ 1
    if (!alimentaNaDirecao(blocoEm, vx, y, vz, oposta, alcance)) continue
    const n = forcaDe(nivelDe(vizinho)) + fluido.passo
    if (n < melhor) melhor = n
  }
  return melhor > ALCANCE_DE_NIVEL ? -1 : melhor
}

/**
 * O id que esta célula deveria ter. `null` quando nada muda.
 *
 * Devolver `null` em vez de "o id atual" não é detalhe de estilo: quem chama
 * escreve no mundo, e escrever o mesmo id de novo remalha o chunk. Uma lâmina
 * parada remalharia o mundo inteiro a cada cinco tiques.
 */
export function proximoId(blocoEm, ehFonte, x, y, z, fluido, alcance = ALCANCE_DA_BUSCA) {
  const atual = blocoEm(x, y, z)
  const ideal = nivelIdeal(blocoEm, ehFonte, x, y, z, fluido, alcance)
  const novo = ideal < 0 ? AIR : idDeNivel(fluido.tipo, ideal)
  if (novo === atual) return null
  // Não apaga o que não é DESTE fluido: uma célula de pedra nunca "deveria ser
  // ar", e uma poça de lava não some porque a regra da água passou por ali.
  if (ideal < 0 && fluidoDe(atual) !== fluido.tipo) return null
  return novo
}

/**
 * Duas fontes lado a lado, com chão embaixo, fazem fonte no meio — a água
 * infinita do original, e a razão de qualquer poço de dois por um funcionar.
 *
 * A lava não faz: `fazFonte` é falso nela. Se fizesse, qualquer poça viraria
 * fábrica de obsidiana e a lava deixaria de ser um recurso.
 */
export function viraFonte(blocoEm, ehFonte, x, y, z, fluido) {
  if (!fluido.fazFonte) return false
  if (!podeInundar(blocoEm(x, y, z))) return false
  if (podeInundar(blocoEm(x, y - 1, z))) return false
  let fontes = 0
  for (const [dx, dz] of DIRECOES) {
    if (ehFonte(x + dx, y, z + dz)) fontes++
  }
  return fontes >= 2
}

/**
 * ÁGUA E LAVA SE ENCONTRANDO — as três trocas do original.
 *
 * Devolve o id que esta célula vira, ou `null` se nada acontece. É consultada
 * ANTES do fluxo: uma célula que virou pedra não é mais fluido, e perguntar o
 * nível dela primeiro seria perguntar o nível de uma pedra.
 *
 *   · lava FONTE encostada em água (em cima ou nos lados) → obsidiana
 *   · lava ESCORRENDO encostada em água (idem)            → pedregulho
 *   · água com lava EM CIMA                               → pedra
 *
 * A assimetria é do original e não é arbitrária: obsidiana só de fonte é o que
 * torna a obsidiana um recurso que se planeja, em vez de um subproduto de
 * qualquer respingo.
 *
 * ⚠️ O lado de BAIXO não conta pra lava. Lava com água embaixo não vira nada —
 * senão toda lava que escorre pra dentro d'água endureceria antes de encostar,
 * e não existiria o gesto de tapar lava com um balde d'água.
 */
export function encontro(blocoEm, x, y, z) {
  const aqui = blocoEm(x, y, z)
  const tipo = fluidoDe(aqui)
  if (tipo === LAVA) {
    const vizinhos = [
      blocoEm(x, y + 1, z),
      blocoEm(x + 1, y, z),
      blocoEm(x - 1, y, z),
      blocoEm(x, y, z + 1),
      blocoEm(x, y, z - 1),
    ]
    if (!vizinhos.some(ehAgua)) return null
    return nivelDe(aqui) === 0 ? ID.obsidian : ID.cobblestone
  }
  if (tipo === AGUA) {
    // Só de CIMA: é a lava caindo dentro d'água que faz pedra. De lado, quem
    // muda é a lava (vira pedregulho), e as duas regras juntas fariam as duas
    // mudarem no mesmo tique.
    if (ehLava(blocoEm(x, y + 1, z))) return ID.stone
  }
  return null
}
