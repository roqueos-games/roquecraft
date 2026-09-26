import { describe, it, expect } from 'vitest'
import { criarFila } from '../../src/servicos/atualizacoes.js'

describe('fila de atualização — dedupe', () => {
  it('a mesma célula agendada seis vezes entra uma', () => {
    const f = criarFila()
    for (let i = 0; i < 6; i++) f.agendar(1, 2, 3)
    expect(f.tamanho).toBe(1)
  })

  it('reagendar NÃO manda pro fim da fila', () => {
    // Se reagendar repusesse no fim, uma célula muito citada — a que está no
    // meio da cascata — nunca seria processada, e a cascata travaria viva.
    const f = criarFila()
    f.agendar(0, 0, 0)
    f.agendar(1, 1, 1)
    f.agendar(0, 0, 0)
    const vistas = []
    f.drenar((x) => vistas.push(x), 1)
    expect(vistas).toEqual([0])
  })

  it('agendarVizinhos pega a célula e os seis vizinhos', () => {
    const f = criarFila()
    f.agendarVizinhos(0, 0, 0)
    expect(f.tamanho).toBe(7)
  })
})

describe('fila de atualização — limite por tique', () => {
  it('drena só o lote pedido', () => {
    const f = criarFila()
    for (let i = 0; i < 100; i++) f.agendar(i, 0, 0)
    expect(f.drenar(() => {}, 10)).toBe(10)
    expect(f.tamanho).toBe(90)
  })

  it('o que a visita agenda fica pro PRÓXIMO tique', () => {
    // ⚠️ Este é o teste que impede o travamento. Se o lote fosse lido enquanto
    // se visita, uma cascata vertical drenaria o mundo inteiro num quadro só —
    // que é exatamente o que o limite existe pra evitar. Aqui cada visita
    // agenda uma célula nova, e mesmo assim o drenar para em 5.
    const f = criarFila()
    for (let i = 0; i < 5; i++) f.agendar(i, 0, 0)
    let n = 0
    const visitadas = f.drenar((x) => {
      n++
      f.agendar(x, 1, 0)
    }, 50)
    expect(visitadas).toBe(5)
    expect(n).toBe(5)
    expect(f.tamanho).toBe(5) // as cinco novas, ainda por fazer

    // Prova de vida: a versão ingênua, iterando o Set enquanto insere, não
    // pararia em 5. É por isso que o lote é fotografado antes.
    const ingenua = new Set([0, 1, 2, 3, 4])
    let voltas = 0
    for (const v of ingenua) {
      voltas++
      if (voltas > 40) break
      ingenua.delete(v)
      ingenua.add(v + 100)
    }
    expect(voltas).toBeGreaterThan(5)
  })

  it('ordem estável: primeiro a entrar, primeiro a sair', () => {
    const f = criarFila()
    for (const x of [7, 3, 9, 1]) f.agendar(x, 0, 0)
    const ordem = []
    f.drenar((x) => ordem.push(x))
    expect(ordem).toEqual([7, 3, 9, 1])
  })
})

describe('fila de atualização — teto de memória', () => {
  it('estourando o teto, sai a mais antiga e conta o descarte', () => {
    const f = criarFila({ teto: 3 })
    f.agendar(1, 0, 0)
    f.agendar(2, 0, 0)
    f.agendar(3, 0, 0)
    f.agendar(4, 0, 0)
    expect(f.tamanho).toBe(3)
    expect(f.descartadas).toBe(1)
    const ordem = []
    f.drenar((x) => ordem.push(x))
    expect(ordem).toEqual([2, 3, 4])
  })

  it('o descarte é CONTADO, não silencioso', () => {
    // Uma fila que descarta calada faz a cascata parar no meio sem explicação,
    // e o defeito vira "às vezes a areia não cai".
    const f = criarFila({ teto: 2 })
    for (let i = 0; i < 10; i++) f.agendar(i, 0, 0)
    expect(f.descartadas).toBe(8)
  })
})

describe('fila de atualização — coordenadas negativas', () => {
  it('sobrevive à volta pelo texto', () => {
    // A chave é string; um parse ingênuo com `parseInt` sem sinal, ou um split
    // por '-', devolveria a célula errada e a cascata cairia no lugar errado do
    // mundo — a 512 blocos de onde o jogador está olhando.
    const f = criarFila()
    f.agendar(-12, -3, -400)
    const vistas = []
    f.drenar((x, y, z) => vistas.push([x, y, z]))
    expect(vistas).toEqual([[-12, -3, -400]])
  })
})

describe('fila de atualização — atraso em tiques', () => {
  const tique = 1 / 20

  it('agendado com atraso NÃO entra na fila agora', () => {
    const f = criarFila()
    f.agendarEm(1, 2, 3, 5)
    expect(f.tamanho).toBe(0)
    expect(f.esperando).toBe(1)
  })

  it('acorda no tique combinado, nem antes nem depois', () => {
    const f = criarFila()
    f.agendarEm(1, 2, 3, 5)
    for (let i = 0; i < 4; i++) f.avancarTempo(tique)
    expect(f.tamanho).toBe(0)
    f.avancarTempo(tique)
    expect(f.tamanho).toBe(1)
    expect(f.esperando).toBe(0)
  })

  it('atraso zero ou negativo é agora', () => {
    const f = criarFila()
    f.agendarEm(1, 2, 3, 0)
    f.agendarEm(4, 5, 6, -3)
    expect(f.tamanho).toBe(2)
  })

  it('quem já espera NÃO é reagendado — senão a água pisca', () => {
    // A mesma célula é citada pelos quatro vizinhos e pelo de cima. Cinco
    // entradas pro mesmo tique fariam a célula ser reavaliada cinco vezes
    // seguidas, e o fluxo começa a oscilar.
    const f = criarFila()
    expect(f.agendarEm(1, 2, 3, 5)).toBe(true)
    expect(f.agendarEm(1, 2, 3, 5)).toBe(false)
    expect(f.agendarEm(1, 2, 3, 2)).toBe(false)
    expect(f.esperando).toBe(1)
  })

  it('a taxa é do JOGO, não do monitor', () => {
    // O mesmo rio tem que escorrer na mesma velocidade a 30 e a 144 quadros.
    //
    // ⚠️ O teste enquadra em vez de cravar o tique exato. Somar `dt * 20` em
    // ponto flutuante 72 vezes dá 9,99999… e não 10: a versão cravada reprovou
    // com o relógio certo. O que importa não é acertar o tique na casa decimal
    // — é as duas taxas de quadro concordarem sobre antes e depois.
    const rapido = criarFila()
    const lento = criarFila()
    rapido.agendarEm(0, 0, 0, 10)
    lento.agendarEm(0, 0, 0, 10)
    // 0,4 s = 8 tiques: cedo demais nas duas.
    for (let i = 0; i < 58; i++) rapido.avancarTempo(1 / 144)
    for (let i = 0; i < 12; i++) lento.avancarTempo(1 / 30)
    expect(rapido.tamanho).toBe(0)
    expect(lento.tamanho).toBe(0)
    // 0,6 s = 12 tiques: passou nas duas.
    for (let i = 0; i < 29; i++) rapido.avancarTempo(1 / 144)
    for (let i = 0; i < 6; i++) lento.avancarTempo(1 / 30)
    expect(rapido.tamanho).toBe(1)
    expect(lento.tamanho).toBe(1)
  })

  it('quadro travado não adianta o fluido de uma vez só', () => {
    // Dois segundos travados são 40 tiques. Sem teto, o rio daria um salto que
    // o jogador leria como teleporte.
    const f = criarFila()
    f.agendarEm(0, 0, 0, 20)
    f.avancarTempo(2)
    expect(f.tamanho).toBe(0) // só andou 8 tiques
    expect(f.esperando).toBe(1)
  })

  it('atraso maior que o anel é ENCURTADO, e contado', () => {
    // Encurtar em silêncio vira "às vezes a lava anda rápido demais", que é
    // exatamente o tipo de defeito que ninguém consegue reproduzir.
    const f = criarFila()
    f.agendarEm(0, 0, 0, 5000)
    expect(f.atrasadasDemais).toBe(1)
  })

  it('limpar esvazia também quem está esperando', () => {
    const f = criarFila()
    f.agendarEm(0, 0, 0, 5)
    f.agendar(1, 1, 1)
    f.limpar()
    expect(f.tamanho).toBe(0)
    expect(f.esperando).toBe(0)
  })
})
