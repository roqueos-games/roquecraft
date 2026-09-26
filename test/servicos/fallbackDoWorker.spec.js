import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createWorldClient } from '../../src/servicos/worldClient.js'

// ⚠️ O FALLBACK RENASCIA NO MUNDO ERRADO (RC-06).
//
// `worker.onerror` chamava `startInline(cx, cz, edits)` com os argumentos que o
// `start` recebeu: a semente inicial, a posição inicial e as edições iniciais.
// Se o worker morre depois de o jogador ter andado, entrado numa sala de outra
// semente ou quebrado quinhentos blocos, o modo inline renasce no mundo de
// antes — e ninguém avisa. O jogo vira outro jogo.
//
// ⚠️ O TESTE PRECISA DE UM WORKER QUE FALHA, e `Worker` não existe no ambiente
// de teste — é por isso que o caminho nunca foi exercido. Aqui ele é um dublê
// que só serve para estourar `onerror`, que é exatamente o momento do defeito.

const SEMENTE_A = 111
const SEMENTE_B = 999

let workerCriado

class WorkerFalso {
  constructor() {
    workerCriado = this
    this.postMessage = vi.fn()
    this.terminate = vi.fn()
  }
  quebrar() {
    this.onerror?.({ message: 'boom' })
  }
}

describe('o worker morre no meio do jogo (RC-06)', () => {
  let originalWorker, originalURL, erro
  beforeEach(() => {
    workerCriado = null
    originalWorker = globalThis.Worker
    originalURL = globalThis.URL
    globalThis.Worker = WorkerFalso
    // `new URL('./chunkWorker.js', import.meta.url)` não resolve em node.
    globalThis.URL = class {
      constructor() {
        return 'chunkWorker.js'
      }
    }
    erro = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    globalThis.Worker = originalWorker
    globalThis.URL = originalURL
    erro.mockRestore()
  })

  function cliente() {
    return createWorldClient({
      seed: SEMENTE_A,
      renderDistance: 1,
      onMesh: () => {},
      onUnload: () => {},
    })
  }

  it('depois de um reset, o fallback nasce na semente NOVA', async () => {
    const c = cliente()
    c.start(0, 0, new Map())
    expect(workerCriado, 'o dublê de worker não foi usado').toBeTruthy()

    // O jogador entra numa sala de outra semente.
    c.reset(SEMENTE_B, null)
    workerCriado.quebrar()

    // O inline agora é o dono do mundo. A prova de qual mundo ele gerou é o
    // relevo: duas sementes diferentes não dão a mesma altura no mesmo ponto.
    const outro = createWorldClient({
      seed: SEMENTE_B,
      renderDistance: 1,
      forceInline: true,
      onMesh: () => {},
      onUnload: () => {},
    })
    outro.start(0, 0, new Map())

    const esperar = async (w) => {
      for (let i = 0; i < 300; i++) {
        if (w.heightAt(0, 0) > 0) return w.heightAt(0, 0)
        await new Promise((r) => setTimeout(r, 10))
      }
      return -1
    }
    const doFallback = await esperar(c)
    const daSementeNova = await esperar(outro)
    expect(doFallback, 'o mundo não carregou — teste inconclusivo').toBeGreaterThan(0)
    expect(doFallback, 'o fallback renasceu na semente de ANTES do reset').toBe(daSementeNova)
    c.dispose()
    outro.dispose()
  })

  it('o fallback nasce onde o jogador ESTÁ, não onde ele entrou', async () => {
    const c = cliente()
    c.start(0, 0, new Map())
    // O jogador caminhou para longe (em blocos, que é o que o jogo informa).
    c.setPlayerPosition(40 * 16 + 8, 70, -25 * 16 + 8)
    workerCriado.quebrar()
    // O chunk do novo centro é o que tem que existir.
    for (let i = 0; i < 300; i++) {
      if (c.heightAt(40 * 16, -25 * 16) > 0) break
      await new Promise((r) => setTimeout(r, 10))
    }
    expect(
      c.heightAt(40 * 16, -25 * 16),
      'o fallback carregou o mundo em volta da posição do boot',
    ).toBeGreaterThan(0)
    c.dispose()
  })
})
