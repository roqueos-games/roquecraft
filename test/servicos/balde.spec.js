import { describe, it, expect } from 'vitest'
import { oQueEnche, gastaBalde, ondeDespejar } from '../../src/servicos/balde.js'
import { ID, AIR, BLOCK_BY_KEY } from '../../src/servicos/blocks.js'

// ⚠️ O QUE ESTE ARQUIVO SEGURA: o custo da agua, e a cova que se enche.
//
// Tres decisoes pequenas, cada uma com um motivo que nao e obvio olhando o
// codigo. Elas moravam soltas dentro de `usarBalde`, misturadas com escrita no
// mundo, som e save -- e por isso nenhuma tinha teste.

describe('oQueEnche: so FONTE enche', () => {
  it('agua da balde de agua, lava da balde de lava', () => {
    expect(oQueEnche(ID.water)).toBe('water_bucket')
    expect(oQueEnche(ID.lava)).toBe('lava_bucket')
  })

  it('ar e pedra nao enchem nada', () => {
    expect(oQueEnche(AIR)).toBe(null)
    expect(oQueEnche(BLOCK_BY_KEY.stone.id)).toBe(null)
  })

  it('a LAMINA que escorre nao enche', () => {
    // Se lamina enchesse balde, um rio de sete blocos viraria sete baldes e a
    // agua deixaria de ter custo. Fonte e lamina sao ids diferentes.
    const laminas = Object.values(BLOCK_BY_KEY).filter(
      (b) => /water|lava/i.test(b.key) && b.id !== ID.water && b.id !== ID.lava,
    )
    // Sem esta linha o laco abaixo passaria sobre lista vazia e nao afirmaria
    // nada. Sao doze: sete niveis de agua, tres de lava e as duas caindo.
    expect(laminas.length).toBeGreaterThan(5)
    for (const l of laminas) {
      expect(oQueEnche(l.id), `${l.key} nao devia encher balde`).toBe(null)
    }
  })
})

describe('gastaBalde: o criativo nao reenche', () => {
  it('sobrevivencia gasta, criativo nao', () => {
    expect(gastaBalde('survival')).toBe(true)
    expect(gastaBalde('creative')).toBe(false)
  })

  it('modo desconhecido gasta: o padrao e o custo, nao a mao aberta', () => {
    expect(gastaBalde(undefined)).toBe(true)
    expect(gastaBalde('')).toBe(true)
  })
})

describe('ondeDespejar: mirando numa lamina, despeja NELA', () => {
  const ALVO = { x: 1, y: 2, z: 3 }
  const DESTINO = { x: 1, y: 3, z: 3 }

  it('numa lamina, cai na propria celula mirada', () => {
    // Sem isto, encher uma cova exigiria mirar na parede: a mira de liquido
    // acerta a agua e o `place` cai sempre um bloco adiante.
    expect(ondeDespejar({ alvo: ALVO, destino: DESTINO, ehLamina: true })).toBe(ALVO)
  })

  it('num solido, cai na face de fora', () => {
    expect(ondeDespejar({ alvo: ALVO, destino: DESTINO, ehLamina: false })).toBe(DESTINO)
  })
})
