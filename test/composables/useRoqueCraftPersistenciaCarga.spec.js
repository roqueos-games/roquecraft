import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useRoqueCraftPersistencia } from '../../src/composables/useRoqueCraftPersistencia.js'
import { CARGA, classificarCarga, podeSalvar } from '../../src/servicos/cargaDoSave.js'

// ⚠️ ESTE ARQUIVO AMARRA DUAS COISAS QUE ESTAVAM CERTAS SEPARADAS (RC-02).
//
// `cargaDoSave.spec.js` prova a política e `useRoqueCraftPersistencia.spec.js`
// prova o temporizador. Nenhum dos dois nota se a fiação entre eles sumir do
// componente — e é a fiação que impede o mundo de ser apagado. É o mesmo
// motivo de `restaurarMobs` ter virado função pura na rodada 22: quando a única
// fiscalização possível é `grep` no `.vue`, o guard não sabe dizer se a regra
// chega a rodar.

describe('persistência × carga do save (RC-02)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  /** Monta a persistência com as MESMAS portas do componente. */
  function montar(estado) {
    const gravar = vi.fn().mockResolvedValue(undefined)
    const p = useRoqueCraftPersistencia({
      montarPayload: () => ({ seed: 1 }),
      gravar,
      podeGravar: () => podeSalvar(estado),
      podeAgendar: () => podeSalvar(estado),
      espera: 10,
    })
    return { p, gravar }
  }

  it('carga que falhou NÃO grava, nem agora nem depois', async () => {
    const { p, gravar } = montar(CARGA.INDISPONIVEL)

    expect(p.agendar()).toBe(false)
    await vi.advanceTimersByTimeAsync(50)
    expect(gravar).not.toHaveBeenCalled()

    expect(await p.agora()).toBe(false)
    expect(gravar).not.toHaveBeenCalled()
  })

  it('mundo novo de verdade continua gravando', async () => {
    const { p, gravar } = montar(CARGA.VAZIO)
    expect(p.agendar()).toBe(true)
    await vi.advanceTimersByTimeAsync(50)
    expect(gravar).toHaveBeenCalledWith({ seed: 1 })
  })

  it('save carregado continua gravando', async () => {
    const { p, gravar } = montar(CARGA.CARREGADO)
    expect(await p.agora()).toBe(true)
    expect(gravar).toHaveBeenCalledWith({ seed: 1 })
  })

  it('a jornada que apagava mundo, do erro até a não-gravação', async () => {
    // O Firestore cai no boot de quem tem mundo de meses.
    const estado = classificarCarga({ tentou: true, erro: new Error('unavailable'), salvo: null })
    const { p, gravar } = montar(estado)
    // O jogador entra, olha em volta e coloca um bloco: sessenta agendamentos.
    for (let i = 0; i < 60; i++) p.agendar()
    await vi.advanceTimersByTimeAsync(200)
    // Nenhum deles chega ao servidor.
    expect(gravar).not.toHaveBeenCalled()
    expect(p.gravacoes.value).toBe(0)
  })
})
