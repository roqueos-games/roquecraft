//
// FILA DE ATUALIZAÇÃO DE BLOCO — o mundo reage a quem mexe nele.
//
// Uma célula muda; os vizinhos precisam ser reavaliados. Areia perde apoio,
// planta perde o chão, um dia água precisa escorrer. Sem fila, cada sistema
// desses vira um `if` no meio do `breakBlock` e a regra fica espalhada por
// quem quebrou, não por quem manda.
//
// Três coisas que a fila precisa ter, e a razão de cada uma:
//
//  1. DEDUPE. Tirar o apoio de uma pilha agenda a mesma célula por seis
//     caminhos diferentes. Sem `Set`, uma cascata de mil blocos vira dezenas de
//     milhares de checagens repetidas.
//  2. LIMITE POR TIQUE. Uma duna de seis mil blocos desmoronando não pode
//     comer o quadro. Drena um pedaço e o resto fica pro próximo — o jogador vê
//     desmoronar em cascata, que é como desmorona de verdade.
//  3. ORDEM ESTÁVEL. Primeiro a entrar, primeiro a sair. Sem isso, a mesma
//     cascata dá resultado diferente a cada execução e nenhum teste pode
//     afirmar nada.
//
// ── Atualização COM ATRASO ───────────────────────────────────────────────────
//
// Areia cai no quadro seguinte; água NÃO. No original ela anda um bloco a cada
// cinco tiques, e a lava do mundo de cima a cada trinta. Sem atraso, um lago
// furado se espalharia inteiro num quadro só — o que além de errado esconde a
// coisa que dá prazer de olhar, que é a água ACHANDO o caminho.
//
// O atraso é em TIQUES do jogo (20 por segundo), não em segundos de relógio:
// o mesmo rio tem que escorrer na mesma velocidade a 30 e a 144 quadros.
//
// A estrutura é um anel de baldes, um por tique, e não uma lista com prazo em
// cada item. Com prazo por item, cada quadro percorre tudo que está esperando —
// e o que está esperando pode ser dezenas de milhares de células de um lago. Com
// o anel, avançar o tempo é trocar de balde: custo fixo, não importa quanto
// esteja na fila.
import { TIQUES_POR_SEGUNDO } from './constants.js'

const ANEIS = 64 // teto de atraso: 63 tiques, ~3 s. A lava usa 30.
const LIMITE_PADRAO = 512
// Teto de memória: cascata patológica não pode crescer sem fim. Ao estourar,
// as MAIS ANTIGAS saem — quem entrou primeiro está mais perto da origem da
// mudança, e é o que o jogador está olhando.
const TETO_PADRAO = 65536

const chave = (x, y, z) => `${x},${y},${z}`

export function criarFila({ limite = LIMITE_PADRAO, teto = TETO_PADRAO } = {}) {
  // `Set` de string guarda ordem de inserção por especificação da linguagem, e
  // é isso que dá o FIFO de graça sem uma segunda estrutura pra manter em dia.
  const pendentes = new Set()
  // Anel de baldes: `esperando[(agora + n) % ANEIS]` guarda quem acorda daqui a
  // n tiques. `dentroDoAnel` evita reagendar quem já está esperando — sem ele,
  // uma célula citada por quatro vizinhos entra quatro vezes e a água pisca.
  const esperando = Array.from({ length: ANEIS }, () => new Set())
  const dentroDoAnel = new Set()
  let agora = 0
  let sobra = 0
  let descartadas = 0
  let atrasadasDemais = 0

  const agendar = (x, y, z) => {
    const k = chave(x, y, z)
    // Reagendar não repõe no fim: quem já está na fila mantém o lugar. Do
    // contrário uma célula muito citada nunca chega a ser processada.
    if (pendentes.has(k)) return false
    if (pendentes.size >= teto) {
      const maisAntiga = pendentes.values().next().value
      pendentes.delete(maisAntiga)
      descartadas++
    }
    pendentes.add(k)
    return true
  }

  /**
   * Agenda para daqui a `tiques` tiques do jogo. `tiques <= 0` é imediato.
   *
   * Quem já está esperando NÃO é reagendado: a água é citada pelos quatro
   * vizinhos e pelo de cima, e cinco entradas pro mesmo tique fariam a célula
   * ser reavaliada cinco vezes seguidas — que é como o fluxo começa a piscar.
   */
  const agendarEm = (x, y, z, tiques) => {
    if (tiques <= 0) return agendar(x, y, z)
    if (tiques >= ANEIS) {
      // Não existe balde pra isso. Enfia no mais distante e CONTA: atraso
      // silenciosamente encurtado vira "às vezes a lava anda rápido demais".
      atrasadasDemais++
      tiques = ANEIS - 1
    }
    const k = chave(x, y, z)
    if (pendentes.has(k) || dentroDoAnel.has(k)) return false
    esperando[(agora + tiques) % ANEIS].add(k)
    dentroDoAnel.add(k)
    return true
  }

  /**
   * Anda o relógio do jogo e acorda quem venceu. Custo fixo por tique — é o
   * anel pagando por si: não percorre quem ainda está esperando.
   */
  const avancarTempo = (dt) => {
    sobra += dt * TIQUES_POR_SEGUNDO
    // Teto: um quadro travado de dois segundos não pode avançar 40 tiques de
    // fluido de uma vez. O rio fica pra trás um instante em vez de dar um salto
    // que o jogador leria como teleporte.
    let tiques = Math.min(Math.floor(sobra), 8)
    sobra -= Math.floor(sobra)
    while (tiques-- > 0) {
      agora = (agora + 1) % ANEIS
      const balde = esperando[agora]
      if (balde.size) {
        for (const k of balde) {
          dentroDoAnel.delete(k)
          if (!pendentes.has(k)) pendentes.add(k)
        }
        balde.clear()
      }
    }
  }

  /** A célula mexeu: ela e os seis vizinhos precisam ser reavaliados. */
  const agendarVizinhos = (x, y, z) => {
    agendar(x, y, z)
    agendar(x, y + 1, z)
    agendar(x, y - 1, z)
    agendar(x + 1, y, z)
    agendar(x - 1, y, z)
    agendar(x, y, z + 1)
    agendar(x, y, z - 1)
  }

  /**
   * Processa até `limite` células. `visitar(x, y, z)` decide o que fazer com
   * cada uma — e pode agendar mais, que entram no fim e ficam pro próximo
   * tique. Devolve quantas foram visitadas.
   */
  const drenar = (visitar, quantas = limite) => {
    let n = 0
    // Fotografa o lote ANTES de visitar. Sem isto, uma célula agendada durante
    // a visita entraria neste mesmo lote e uma cascata vertical drenaria o
    // mundo inteiro num quadro só — exatamente o travamento que o limite
    // existe pra evitar.
    const lote = []
    for (const k of pendentes) {
      if (lote.length >= quantas) break
      lote.push(k)
    }
    for (const k of lote) {
      pendentes.delete(k)
      const [x, y, z] = k.split(',')
      visitar(+x, +y, +z)
      n++
    }
    return n
  }

  return {
    agendar,
    agendarEm,
    agendarVizinhos,
    avancarTempo,
    drenar,
    get tamanho() {
      return pendentes.size
    },
    get esperando() {
      return dentroDoAnel.size
    },
    get descartadas() {
      return descartadas
    },
    get atrasadasDemais() {
      return atrasadasDemais
    },
    limpar() {
      pendentes.clear()
      dentroDoAnel.clear()
      for (const b of esperando) b.clear()
      descartadas = 0
      atrasadasDemais = 0
      sobra = 0
    },
  }
}

export { TIQUES_POR_SEGUNDO, ANEIS }
