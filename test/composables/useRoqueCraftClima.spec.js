import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  useRoqueCraftClima,
  FATOR_DA_RAMPA,
  ABAFAMENTO_SOB_A_TERRA,
} from '../../src/composables/useRoqueCraftClima.js'

// ⚠️ CADA TESTE AQUI TRAVA UM DEFEITO QUE A RODADA DO CLIMA REALMENTE COMETEU.
// Nenhum foi inventado para dar cobertura: os cinco aconteceram, foram medidos
// por sonda, e o conserto está no composable. Teste que não corresponde a um
// defeito possível é decoração cara.

/** Monta o composable com dependências controladas e um espião em cada porta. */
function montar(over = {}) {
  const estado = {
    semente: 42,
    ticks: 1000,
    bioma: 'plains',
    ceuAberto: true,
    ...over,
  }
  const motor = []
  const trovoes = []
  const c = useRoqueCraftClima({
    semente: () => estado.semente,
    ticks: () => estado.ticks,
    nomeDoBioma: () => estado.bioma,
    ceuAberto: () => estado.ceuAberto,
    aplicarNoMotor: (x) => motor.push(x),
    tocarTrovao: (km) => trovoes.push(km),
    temAudio: () => true,
  })
  return { c, estado, motor, trovoes }
}

describe('useRoqueCraftClima', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('a sobrescrita entra ANTES da regra do bioma', () => {
    // O DEFEITO: a primeira versão aplicava a regra do bioma e SÓ ENTÃO
    // sobrescrevia com o forçado. No campo gelado isso punha chuva 1 E neve 1
    // ao mesmo tempo, e o chão molhava (escureceu 14%, medido na sonda) numa
    // cena onde deveria só nevar.
    const gelo = montar({ bioma: 'snowy' })
    gelo.c.forcar(1, 0)
    expect(gelo.c.clima.neve).toBe(1)
    expect(gelo.c.clima.chuva, 'forçar chuva no gelo molhou o chão').toBe(0)

    const seco = montar({ bioma: 'desert' })
    seco.c.forcar(1, 0)
    expect(seco.c.clima.chuva, 'choveu no deserto').toBe(0)
    expect(seco.c.clima.neve).toBe(0)

    // ⚠️ CONTROLE: um bioma comum TEM que molhar. Sem este par, tudo acima
    // passaria com um composable que simplesmente devolve zero para todo mundo,
    // que é o defeito mais fácil de escrever e o mais difícil de ver.
    const campo = montar({ bioma: 'plains' })
    campo.c.forcar(1, 0)
    expect(campo.c.clima.chuva, 'o campo não molhou: a regra virou zero pra tudo').toBe(1)
  })

  it('chuva e neve nunca positivas ao mesmo tempo', () => {
    for (const bioma of ['plains', 'desert', 'snowy', 'forest', 'frozen_ocean']) {
      for (const forca of [0, 0.3, 0.7, 1]) {
        const { c } = montar({ bioma })
        c.forcar(forca, 0)
        expect(
          Math.min(c.clima.chuva, c.clima.neve),
          `${bioma} com ${forca} deu chuva ${c.clima.chuva} e neve ${c.clima.neve}`,
        ).toBe(0)
      }
    }
  })

  it('a rampa suaviza a fronteira, e `imediato` pula a rampa', () => {
    // O DEFEITO: `precipitacaoNoBioma` responde 0 no deserto e 1 no campo, sem
    // meio termo. Aplicado direto, atravessar a divisa faz o chão SALTAR de
    // brilho num quadro.
    const { c, estado } = montar({ bioma: 'plains' })
    c.forcar(1, 0)
    expect(c.clima.chuva).toBe(1)

    estado.bioma = 'desert'
    c.passoLento(0)
    // Um passo lento move só uma fração do caminho.
    expect(c.clima.chuva).toBeCloseTo(1 - FATOR_DA_RAMPA, 6)
    expect(c.clima.chuva, 'a fronteira desligou a chuva de uma vez').toBeGreaterThan(0)

    // E converge: vários passos chegam a zero de verdade, não a um resíduo.
    for (let i = 0; i < 40; i++) c.passoLento(0)
    expect(c.clima.chuva, 'a exponencial deixou resíduo eterno no shader').toBe(0)
  })

  it('`imediato` não deixa o QA medir o meio da rampa', () => {
    // O DEFEITO: sem isto, uma sonda que força chuva e fotografa 900 ms depois
    // pega 72% do caminho e chama de "chuva cheia".
    const { c } = montar({ bioma: 'plains' })
    c.forcar(1, 0)
    expect(c.clima.chuva).toBe(1)

    // ⚠️ CONTROLE: o mesmo estado SEM `imediato` tem que ficar no meio, senão
    // "imediato funciona" seria só "a rampa não faz nada".
    const lento = montar({ bioma: 'plains' })
    lento.c.forcado.value = 1
    lento.c.passoLento(0)
    expect(lento.c.clima.chuva, 'a rampa não segurou nada').toBeLessThan(1)
  })

  it('o mesmo raio não dispara dois trovões', () => {
    const { c, trovoes } = montar({ bioma: 'plains' })
    c.forcar(1, 0)
    expect(c.clima.tempestade).toBeGreaterThan(0)

    // Vários quadros dentro do MESMO clarão: o trovão é agendado uma vez só.
    for (let t = 0; t < 0.4; t += 1 / 60) c.passoPorQuadro(100 + t)
    vi.advanceTimersByTime(60_000)
    expect(trovoes.length, `${trovoes.length} trovões para um raio só`).toBeLessThanOrEqual(1)

    // ⚠️ CONTROLE: varrendo tempo de verdade ALGUM trovão tem que sair, senão
    // "não repete" seria só "nunca toca".
    const longo = montar({ bioma: 'plains' })
    longo.c.forcar(1, 0)
    for (let t = 0; t < 300; t += 1 / 20) longo.c.passoPorQuadro(t)
    vi.advanceTimersByTime(120_000)
    expect(longo.trovoes.length, 'nenhum trovão em 5 minutos de tempestade').toBeGreaterThan(3)
  })

  it('debaixo da terra o trovão chega como se viesse de mais longe', () => {
    const aberto = montar({ bioma: 'plains', ceuAberto: true })
    aberto.c.forcar(1, 0)
    for (let t = 0; t < 300; t += 1 / 20) aberto.c.passoPorQuadro(t)
    vi.advanceTimersByTime(120_000)

    const coberto = montar({ bioma: 'plains', ceuAberto: false })
    coberto.c.forcar(1, 0)
    for (let t = 0; t < 300; t += 1 / 20) coberto.c.passoPorQuadro(t)
    vi.advanceTimersByTime(120_000)

    expect(aberto.trovoes.length).toBe(coberto.trovoes.length)
    expect(aberto.trovoes.length).toBeGreaterThan(0)
    for (let i = 0; i < aberto.trovoes.length; i++) {
      expect(coberto.trovoes[i]).toBeCloseTo(aberto.trovoes[i] / ABAFAMENTO_SOB_A_TERRA, 6)
    }
  })

  it('encerrar() cancela a fila inteira de trovões', () => {
    // ⚠️ ESTE É O MOTIVO DE SER COMPOSABLE E NÃO SERVIÇO. Um trovão agendado é
    // um setTimeout com até 18 s de vida: fechar o jogo sem cancelar toca um
    // estouro com o motor de áudio já destruído.
    const { c, trovoes } = montar({ bioma: 'plains' })
    c.forcar(1, 0)
    for (let t = 0; t < 300; t += 1 / 20) c.passoPorQuadro(t)

    // ⚠️ CONTROLE: tem que haver fila pendente, senão cancelar não prova nada.
    const antes = trovoes.length
    c.encerrar()
    vi.advanceTimersByTime(120_000)
    expect(trovoes.length, 'trovão tocou depois do encerrar()').toBe(antes)

    const semEncerrar = montar({ bioma: 'plains' })
    semEncerrar.c.forcar(1, 0)
    for (let t = 0; t < 300; t += 1 / 20) semEncerrar.c.passoPorQuadro(t)
    vi.advanceTimersByTime(120_000)
    expect(
      semEncerrar.trovoes.length,
      'sem encerrar também não tocou: a fila estava vazia e o teste é vazio',
    ).toBeGreaterThan(0)
  })

  // ⚠️ Este teste só conferia que `encerrar()` não estoura -- e ele não estoura
  // nem com a fila cheia de ids mortos, porque `clearTimeout` de um timer já
  // disparado é inofensivo. Com `i >= 0` virando `i > 0`, o PRIMEIRO trovão da
  // fila (índice zero) nunca sai dela: numa tempestade longa a lista só cresce.
  // O que prende é contar as limpezas: fila vazia = zero clearTimeout.
  it('a fila não vaza: o timer que dispara sai dela sozinho', () => {
    const { c, trovoes } = montar({ bioma: 'plains' })
    c.forcar(1, 0)
    for (let t = 0; t < 300; t += 1 / 20) c.passoPorQuadro(t)
    vi.advanceTimersByTime(120_000)
    expect(trovoes.length, 'nenhum trovão tocou: o teste seria vazio').toBeGreaterThan(0)

    const limpar = vi.spyOn(globalThis, 'clearTimeout')
    try {
      c.encerrar()
      expect(limpar.mock.calls).toEqual([]) // não sobrou id nenhum para cancelar
    } finally {
      limpar.mockRestore()
    }
  })

  // ⚠️ `clima.chuva > 0.05` sobrevivia a `>=`. O limiar existe para separar
  // "garoa que não muda a cena" de "está chovendo": no valor EXATO do limiar o
  // estado ainda é o do bioma, e é essa borda que decide se o mundo troca de
  // paleta, de som e de partícula.
  it('exatamente 0,05 de chuva ainda não é "chovendo"; 0,051 é', () => {
    const { c } = montar({ bioma: 'plains' })
    c.forcar(0.05, 'plains')
    expect(c.clima.chuva).toBeCloseTo(0.05, 9)
    expect(c.clima.estado).not.toBe('chuva')

    c.forcar(0.051, 'plains')
    expect(c.clima.estado).toBe('chuva')
  })

  it('entrega ao motor exatamente o que o motor precisa', () => {
    const { c, motor } = montar({ bioma: 'plains' })
    c.forcar(1, 0)
    const ultimo = motor[motor.length - 1]
    expect(Object.keys(ultimo).sort()).toEqual(
      ['chuva', 'cobertura', 'neve', 'semente', 'tempestade'].sort(),
    )
    expect(ultimo.semente).toBe(42)
    expect(ultimo.chuva).toBe(1)
  })

  it('sem áudio não agenda trovão nenhum', () => {
    const trovoes = []
    const c = useRoqueCraftClima({
      semente: () => 42,
      ticks: () => 1000,
      nomeDoBioma: () => 'plains',
      ceuAberto: () => true,
      aplicarNoMotor: () => {},
      tocarTrovao: (km) => trovoes.push(km),
      temAudio: () => false,
    })
    c.forcar(1, 0)
    for (let t = 0; t < 300; t += 1 / 20) c.passoPorQuadro(t)
    vi.advanceTimersByTime(120_000)
    expect(trovoes.length).toBe(0)
  })
})
