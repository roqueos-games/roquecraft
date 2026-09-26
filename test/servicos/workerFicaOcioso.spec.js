import { describe, it, expect } from 'vitest'
import { createPipeline } from '../../src/servicos/chunkPipeline.js'

// ⚠️ O WORKER NUNCA DORMIA (RC-05).
//
// O halo — a margem de chunks gerada ALÉM do raio, para que a borda tenha
// vizinho — entrava na fila de luz e nunca virava elegível: acender só acontece
// até `distance + 1`. Como o job voltava para a MESMA fila, ela nunca
// esvaziava; `tick` respondia "ainda tem trabalho" para sempre e o `pump` do
// worker reagendava a cada 0 ms com o jogador PARADO. Bateria e CPU num jogo em
// que ninguém está fazendo nada.
//
// O sinal já existia e nunca era alcançado: `emit({ t: 'idle' })`, no worker,
// só roda quando `tick` devolve `false`.
//
// ⚠️ ESTE TESTE MEDE O `tick`, que é o que o `pump` lê. Contar tamanho de fila
// provaria outra coisa: a fila de fora de alcance CONTINUA cheia, de propósito.
// O que não pode é ela manter o pipeline acordado.

/** Roda o pipeline até ele dizer que acabou, ou até estourar o limite. */
function ateOcioso(pipe, limite = 4000) {
  for (let i = 0; i < limite; i++) {
    if (!pipe.tick(12)) return i + 1
  }
  return -1
}

describe('o pipeline fica ocioso com o mundo parado (RC-05)', () => {
  it('com o jogador parado, `tick` acaba dizendo que não há mais trabalho', () => {
    const pipe = createPipeline({ seed: 4242, renderDistance: 2, emit: () => {} })
    pipe.setCenter(0, 0, 4)
    const ticks = ateOcioso(pipe)
    expect(ticks, 'o pipeline nunca parou: o worker giraria para sempre').toBeGreaterThan(0)
  })

  it('depois de ocioso, continua ocioso enquanto nada acontece', () => {
    const pipe = createPipeline({ seed: 4242, renderDistance: 2, emit: () => {} })
    pipe.setCenter(0, 0, 4)
    expect(ateOcioso(pipe)).toBeGreaterThan(0)
    for (let i = 0; i < 20; i++) {
      expect(pipe.tick(12), 'o pipeline acordou sozinho').toBe(false)
    }
  })

  it('o jogador andar acorda o pipeline de novo', () => {
    const pipe = createPipeline({ seed: 4242, renderDistance: 2, emit: () => {} })
    pipe.setCenter(0, 0, 4)
    expect(ateOcioso(pipe)).toBeGreaterThan(0)

    pipe.setCenter(3, 0, 4)
    expect(pipe.tick(12), 'o jogador andou e o pipeline continuou dormindo').toBe(true)
    // E volta a dormir quando termina o que o passo novo pediu.
    expect(ateOcioso(pipe)).toBeGreaterThan(0)
  })

  it('aumentar a distância acorda o pipeline — o halo de ontem é o mundo de hoje', () => {
    const pipe = createPipeline({ seed: 4242, renderDistance: 2, emit: () => {} })
    pipe.setCenter(0, 0, 4)
    expect(ateOcioso(pipe)).toBeGreaterThan(0)

    pipe.setDistance(4)
    expect(pipe.tick(12), 'a distância aumentou e nada foi refeito').toBe(true)
    expect(ateOcioso(pipe)).toBeGreaterThan(0)
  })

  it('editar um bloco acorda o pipeline', () => {
    const pipe = createPipeline({ seed: 4242, renderDistance: 2, emit: () => {} })
    pipe.setCenter(0, 0, 4)
    expect(ateOcioso(pipe)).toBeGreaterThan(0)

    pipe.edit(2, 70, 2, 1)
    expect(pipe.tick(12), 'o jogador construiu e o mundo não remalhou').toBe(true)
  })
})
