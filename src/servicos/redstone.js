//
// REDSTONE — a energia, a regra, pura.
//
// ⚠️ A ENERGIA NÃO SE PROPAGA CÉLULA A CÉLULA: A REDE INTEIRA SE RECALCULA.
//
// O caminho intuitivo é o de sempre — "meu vizinho tem 12, logo eu tenho 11" —
// e ele é errado por um motivo que só aparece quando se DESLIGA a fonte. Um fio
// em anel, com a fonte removida, continua se alimentando: cada célula vê a
// vizinha com nível alto e se justifica com ela, para sempre. É o mesmo defeito
// que a água teria sem a regra de "o nível é a DISTÂNCIA até a fonte", e a
// solução aqui é a mesma ideia levada ao extremo: quando algo muda, acha-se a
// REDE conectada inteira, zera-se, e reparte-se o nível a partir das fontes que
// a tocam. Sem fonte, a rede toda vai a zero de uma vez — não existe anel que se
// sustente.
//
// O preço é recalcular um fio inteiro por mudança. É barato porque fio é
// pequeno, e tem teto: acima dele a rede simplesmente não acende, em vez de
// travar o jogo. Fio de dez mil blocos é construção de quem está testando o
// limite, não de quem está jogando.
//
import { AIR, ID, IS_SOLID } from './blocks.js'

/** Quanto vale uma fonte, e quantos blocos o fio anda. */
export const NIVEL_MAXIMO = 15

/**
 * Teto de células numa rede.
 *
 * ⚠️ EXISTE PARA O JOGO NÃO TRAVAR, e não para limitar o jogador. Sem ele, um fio
 * de cem mil blocos congelaria o quadro no meio de uma edição — e a edição é o
 * gesto mais frequente que existe. Estourar o teto apaga a rede em vez de
 * calcular meia: meia rede acesa é pior que rede apagada, porque parece que
 * funcionou.
 */
export const TETO_DA_REDE = 4096

const LADOS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 0, 1],
  [0, 0, -1],
]

export const ehPo = (id) => id >= ID.redstoneDust0 && id <= ID.redstoneDust15
export const nivelDoPo = (id) => (ehPo(id) ? id - ID.redstoneDust0 : -1)
export const idDoPo = (nivel) => ID.redstoneDust0 + Math.max(0, Math.min(NIVEL_MAXIMO, nivel))

export const ehTocha = (id) => id === ID.redstoneTorchOn || id === ID.redstoneTorchOff
export const ehAlavanca = (id) => id === ID.leverOn || id === ID.leverOff
export const ehLampada = (id) => id === ID.redstoneLampOn || id === ID.redstoneLampOff

/**
 * Esta célula é uma FONTE de energia, e com que força?
 *
 * Alavanca ligada e tocha acesa valem o máximo. Pó não é fonte: ele CARREGA, e
 * confundir as duas coisas é o que faz o anel se sustentar sozinho.
 */
export function forcaDaFonte(id) {
  if (id === ID.leverOn || id === ID.redstoneTorchOn) return NIVEL_MAXIMO
  return 0
}

/**
 * A rede de pó conectada a esta célula.
 *
 * ⚠️ SÓ NO PLANO, nesta fatia. No original o fio sobe e desce degrau, e isso é
 * conteúdo: a regra de subida depende de o bloco do degrau ser opaco, e ela
 * merece a sua própria medição. Prometer meia escada aqui daria um fio que às
 * vezes sobe, que é pior que um fio que nunca sobe.
 *
 * Devolve `null` quando a rede estoura o teto.
 */
export function redeDoPo(blocoEm, x, y, z) {
  if (!ehPo(blocoEm(x, y, z))) return null
  const vistos = new Map()
  const fila = [[x, y, z]]
  vistos.set(`${x},${y},${z}`, [x, y, z])
  while (fila.length) {
    const [cx, cy, cz] = fila.pop()
    for (const [dx, , dz] of LADOS) {
      const nx = cx + dx
      const nz = cz + dz
      const k = `${nx},${cy},${nz}`
      if (vistos.has(k)) continue
      if (!ehPo(blocoEm(nx, cy, nz))) continue
      if (vistos.size >= TETO_DA_REDE) return null
      vistos.set(k, [nx, cy, nz])
      fila.push([nx, cy, nz])
    }
  }
  return [...vistos.values()]
}

/**
 * Quanto de fora entra nesta célula de pó.
 *
 * Fonte ao lado, embaixo ou em cima. A de EMBAIXO importa porque a tocha de chão
 * fica sob o fio em metade dos circuitos que alguém constrói de verdade.
 */
function fonteQueToca(blocoEm, x, y, z) {
  let maior = 0
  for (const [dx, , dz] of LADOS) maior = Math.max(maior, forcaDaFonte(blocoEm(x + dx, y, z + dz)))
  maior = Math.max(maior, forcaDaFonte(blocoEm(x, y - 1, z)))
  maior = Math.max(maior, forcaDaFonte(blocoEm(x, y + 1, z)))
  return maior
}

/**
 * Os níveis que a rede DEVERIA ter. Mapa "x,y,z" → nível.
 *
 * Busca em largura a partir de todas as fontes ao mesmo tempo: o nível de uma
 * célula é `15 − (passos até a fonte mais perto)`. Quem não é alcançado fica em
 * zero, e é isso que apaga o anel sem fonte.
 */
export function niveisDaRede(blocoEm, rede) {
  const nivel = new Map()
  const fila = []
  for (const [cx, cy, cz] of rede) {
    const k = `${cx},${cy},${cz}`
    const daFonte = fonteQueToca(blocoEm, cx, cy, cz)
    nivel.set(k, daFonte)
    if (daFonte > 0) fila.push([cx, cy, cz, daFonte])
  }
  // ⚠️ SÃO DOIS MECANISMOS PARA A MESMA GARANTIA, E CADA UM SOZINHO BASTA.
  //
  // Eu tinha escrito aqui que fila e pilha davam respostas diferentes. O teste
  // de mutação disse que não: troquei a fila por pilha e os 23 testes ficaram
  // verdes. Tirei a relaxação (o `continue` abaixo, que reabre uma célula quando
  // um caminho melhor chega) e também ficaram. Só com os DOIS mutantes juntos o
  // teste da bifurcação reprovou.
  //
  // A explicação é essa mesma, e vale escrita: com FILA, a busca em largura já
  // alcança cada célula pelo caminho mais curto primeiro, e a relaxação nunca
  // dispara; com PILHA, o caminho longo pode chegar antes, e aí é a relaxação
  // que conserta. Um cinto e um suspensório — e o teste da bifurcação é o que
  // acusa se alguém tirar os dois.
  let i = 0
  while (i < fila.length) {
    const [cx, cy, cz, n] = fila[i++]
    if (n <= 1) continue
    for (const [dx, , dz] of LADOS) {
      const nx = cx + dx
      const nz = cz + dz
      const k = `${nx},${cy},${nz}`
      if (!nivel.has(k)) continue
      if (nivel.get(k) >= n - 1) continue
      nivel.set(k, n - 1)
      fila.push([nx, cy, nz, n - 1])
    }
  }
  return nivel
}

/**
 * O que escrever para a rede que passa por (x, y, z) ficar certa.
 *
 * Devolve só o que MUDA. Devolver a rede inteira remalharia o chunk a cada
 * visita de fila, e a fila visita muito.
 */
export function recalcularRede(blocoEm, x, y, z) {
  const rede = redeDoPo(blocoEm, x, y, z)
  if (!rede) return []
  const nivel = niveisDaRede(blocoEm, rede)
  const saida = []
  for (const [cx, cy, cz] of rede) {
    const alvo = idDoPo(nivel.get(`${cx},${cy},${cz}`) || 0)
    if (blocoEm(cx, cy, cz) !== alvo) saida.push({ x: cx, y: cy, z: cz, id: alvo })
  }
  return saida
}

/**
 * Este bloco SÓLIDO está energizado?
 *
 * É a pergunta que a tocha faz do bloco em que ela está espetada, e a que a
 * lâmpada faz de si mesma. Pó ao lado com nível > 0 energiza; pó EM CIMA
 * energiza (o fio corre pelo teto do bloco); fonte encostada energiza.
 *
 * ⚠️ PÓ AO LADO COM NÍVEL ZERO NÃO ENERGIZA, e é o que separa um circuito de um
 * curto: fio apagado é fio, não é fonte fraca.
 */
export function blocoEnergizado(blocoEm, x, y, z) {
  for (const [dx, , dz] of LADOS) {
    const viz = blocoEm(x + dx, y, z + dz)
    if (nivelDoPo(viz) > 0) return true
    if (forcaDaFonte(viz) > 0) return true
  }
  const acima = blocoEm(x, y + 1, z)
  if (nivelDoPo(acima) > 0) return true
  // ⚠️ A TOCHA NÃO ENERGIZA O BLOCO EM QUE ELA ESTÁ ESPETADA, e este é o coração
  // do inversor. O teste pegou na primeira rodada: com a tocha contando como
  // fonte para o próprio suporte, ela lia o suporte como energizado e se
  // mandava apagar — e, apagada, o suporte ficava sem energia e ela se mandava
  // acender. Um oscilador de um tique que nenhum jogador pediu, e que faria
  // toda tocha do mundo piscar para sempre.
  //
  // Ela energiza o bloco ACIMA dela, que é o outro lado da mesma regra: é assim
  // que uma tocha sob um bloco acende a lâmpada em cima dele.
  if (acima !== ID.redstoneTorchOn && forcaDaFonte(acima) > 0) return true
  if (blocoEm(x, y - 1, z) === ID.redstoneTorchOn) return true
  return false
}

/**
 * A TOCHA É UM INVERSOR, e é só por causa dela que existe lógica.
 *
 * Ela fica acesa quando o bloco em que está espetada NÃO tem energia, e apaga
 * quando tem. Fio mais tocha dá o NÃO; dois NÃO dão o E; e a partir daí é
 * combinação. Sem inversor, redstone é um interruptor comprido.
 *
 * Devolve o id que ela deveria ter, ou `null` se já está certo.
 */
export function proximoDaTocha(blocoEm, x, y, z) {
  const aqui = blocoEm(x, y, z)
  if (!ehTocha(aqui)) return null
  const suporte = blocoEm(x, y - 1, z)
  // Tocha sem chão não fica no ar: ela cai, e quem cuida disso é a gravidade.
  if (suporte === AIR || IS_SOLID[suporte] !== 1) return null
  const alvo = blocoEnergizado(blocoEm, x, y - 1, z) ? ID.redstoneTorchOff : ID.redstoneTorchOn
  return alvo === aqui ? null : alvo
}

/** A lâmpada acende com energia encostada. Devolve o id novo, ou `null`. */
export function proximoDaLampada(blocoEm, x, y, z) {
  const aqui = blocoEm(x, y, z)
  if (!ehLampada(aqui)) return null
  const alvo = blocoEnergizado(blocoEm, x, y, z) ? ID.redstoneLampOn : ID.redstoneLampOff
  return alvo === aqui ? null : alvo
}

/** Ligar e desligar a alavanca: o único gesto que o jogador faz direto. */
export const alavancaTrocada = (id) =>
  id === ID.leverOn ? ID.leverOff : id === ID.leverOff ? ID.leverOn : null

/**
 * Quem precisa ACORDAR quando uma célula de pó muda.
 *
 * ⚠️ VIZINHO DO VIZINHO, E NÃO VIZINHO. A fila acorda os seis vizinhos de toda
 * edição, e para quase tudo isso basta. Para a redstone não basta, e a sonda
 * mostrou: o fio em (3, y) energiza a pedra em (4, y), mas quem tem que reagir é
 * a TOCHA em (4, y+1) — que é diagonal ao fio e nunca era acordada. O circuito
 * ficava com a regra certa e a tocha parada, e nenhum teste de unidade acusa
 * isso, porque a regra está certa mesmo.
 *
 * Devolve as células a agendar, sem repetir.
 */
export function celulasAAcordar(mudancas) {
  const vizinhos = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ]
  const vistos = new Set()
  const saida = []
  for (const c of mudancas) {
    for (const [ax, ay, az] of vizinhos) {
      for (const [bx, by, bz] of vizinhos) {
        const x = c.x + ax + bx
        const y = c.y + ay + by
        const z = c.z + az + bz
        const k = `${x},${y},${z}`
        if (vistos.has(k)) continue
        vistos.add(k)
        saida.push({ x, y, z })
      }
    }
  }
  return saida
}
