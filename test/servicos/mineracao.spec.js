import { describe, it, expect } from 'vitest'
import {
  passoDaMineracao,
  CADENCIA_DA_BATIDA,
  QUEBRA_NO_CRIATIVO,
} from '../../src/servicos/mineracao.js'

function montar(over = {}) {
  const log = { batidas: [], quebrou: [], definiu: [] }
  let m = null
  const ctx = {
    alvo: { x: 1, y: 2, z: 3 },
    blocoEm: () => 7,
    quebravel: (id) => id !== 0 && id !== 99,
    minerando: () => m,
    definirMinerando: (v) => {
      m = v
      log.definiu.push(v)
    },
    tempoDeQuebra: () => 1,
    criativo: false,
    aoBater: (id) => log.batidas.push(id),
    aoQuebrar: (x, y, z, id) => log.quebrou.push([x, y, z, id]),
    ...over,
  }
  return { ctx, log, estado: () => m }
}

describe('mineracao — segurar até quebrar', () => {
  it('sem alvo, ou alvo que não se quebra, limpa o estado e não faz nada', () => {
    const semAlvo = montar({ alvo: null })
    expect(passoDaMineracao(0.1, semAlvo.ctx)).toBe(null)
    expect(semAlvo.log.definiu).toEqual([null])
    const bedrock = montar({ blocoEm: () => 99 })
    expect(passoDaMineracao(0.1, bedrock.ctx)).toBe(null)
    expect(bedrock.log.quebrou).toEqual([])
  })

  it('o progresso sobe pelo tempo de quebra e o bloco cai em 1 s; a batida sai pela cadência', () => {
    const { ctx, log } = montar()
    let r
    for (let t = 0; t < 0.95; t += 0.05) r = passoDaMineracao(0.05, ctx)
    expect(r).toBe('minerando')
    expect(log.quebrou).toEqual([])
    // Passos de 0,05: a batida cai no passo em que o acumulado passa de 0,22 —
    // a cada 0,25 s. Em 0,95 s são três (0,25, 0,5, 0,75); a quarta seria em 1,0.
    expect(CADENCIA_DA_BATIDA).toBe(0.22)
    expect(log.batidas.length).toBe(3)
    expect(passoDaMineracao(0.1, ctx)).toBe('quebrou')
    expect(log.quebrou).toEqual([[1, 2, 3, 7]])
  })

  it('⚠️ mudar a mira de célula RECOMEÇA o progresso', () => {
    const { ctx, estado } = montar()
    for (let t = 0; t < 0.5; t += 0.05) passoDaMineracao(0.05, ctx)
    expect(estado().progress).toBeGreaterThan(0.4)
    ctx.alvo = { x: 5, y: 2, z: 3 }
    passoDaMineracao(0.05, ctx)
    expect(estado().key).toBe('5,2,3')
    expect(estado().progress).toBeLessThan(0.1)
  })

  it('o criativo quebra quase na hora, sem olhar o tempo do bloco', () => {
    const { ctx, log } = montar({ criativo: true, tempoDeQuebra: () => 999 })
    expect(passoDaMineracao(QUEBRA_NO_CRIATIVO, ctx)).toBe('quebrou')
    expect(log.quebrou).toHaveLength(1)
  })
})
