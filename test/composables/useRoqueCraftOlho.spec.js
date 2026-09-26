import { describe, it, expect } from 'vitest'
import { useRoqueCraftOlho, FUNDO_MAXIMO } from '../../src/composables/useRoqueCraftOlho.js'
import { EYE_HEIGHT } from '../../src/servicos/physics.js'

// ⚠️ AS DUAS PERGUNTAS MORAVAM A SETECENTAS LINHAS UMA DA OUTRA dentro de
// `ROSRoqueCraft.vue` — a profundidade lá em cima com o estado de UI, a posição
// lá embaixo junto do laço de quadro. São a mesma pergunta feita duas vezes.

const montar = (over = {}) => {
  const jogador = { x: 3.2, y: 64, z: -2.7, ...over.jogador }
  let mundo = over.mundo === undefined ? mundoDagua(70) : over.mundo
  const o = useRoqueCraftOlho({
    jogador,
    mundo: () => mundo,
    submerso: () => over.submerso ?? true,
    defDoBloco: over.defDoBloco ?? ((id) => (id ? { key: 'stone' } : null)),
  })
  return { o, jogador, trocarMundo: (m) => (mundo = m) }
}

/** Mundo com água da superfície até `topoDagua`. */
const mundoDagua = (topoDagua) => ({
  liquidAt: (x, y) => (y <= topoDagua ? 1 : 0),
  opaqueAt: () => false,
  getBlock: () => 0,
})

describe('useRoqueCraftOlho', () => {
  it("fora d'água a profundidade é ZERO, mesmo com água na coluna", () => {
    const c = montar({ submerso: false })
    expect(c.o.profundidade()).toBe(0)
  })

  it('submerso, conta os blocos de água ACIMA do olho', () => {
    // Olho em 64 + 1,62 = 65; água até 70 → 71, 70…65 são 6 células.
    const c = montar({ submerso: true })
    const esperado = 70 - Math.floor(64 + EYE_HEIGHT) + 1
    expect(c.o.profundidade()).toBe(esperado)
  })

  // ⚠️ O TETO NÃO É MEDO DE LAÇO INFINITO: é custo. Isto roda TODO QUADRO, e
  // uma coluna de oceano tem dezenas de células — a busca para onde a curva de
  // absorção já saturou.
  it('numa coluna de água sem fim, para no teto', () => {
    const c = montar({
      submerso: true,
      mundo: { liquidAt: () => 1, opaqueAt: () => false, getBlock: () => 0 },
    })
    expect(c.o.profundidade()).toBe(FUNDO_MAXIMO)
  })

  it('sem mundo, nada quebra: profundidade zero e o olho na altura da cabeça', () => {
    const c = montar({ mundo: null })
    expect(c.o.profundidade()).toBe(0)
    expect(c.o.posicao()).toEqual([3.2, 64 + EYE_HEIGHT, -2.7])
  })

  it('com mundo, a posição sai da regra pura — e não da soma crua', () => {
    const c = montar({ submerso: false })
    const [x, y, z] = c.o.posicao()
    expect([x, z]).toEqual([3.2, -2.7])
    expect(Number.isFinite(y)).toBe(true)
  })

  // ⚠️ O MUNDO É REATRIBUÍDO em troca de dimensão e de qualidade. Lido por
  // valor, este composable falaria com o mundo de quando foi montado — e a
  // profundidade seria a do oceano de outra dimensão.
  it('fala com o mundo VIVO, não com o de quando foi montado', () => {
    const c = montar({ submerso: true })
    expect(c.o.profundidade()).toBeGreaterThan(0)
    c.trocarMundo({ liquidAt: () => 0, opaqueAt: () => false, getBlock: () => 0 })
    expect(c.o.profundidade(), 'continuou medindo a água do mundo antigo').toBe(0)
  })

  it('o leitor de blocos devolve a CHAVE, e string vazia quando não há bloco', () => {
    const c = montar({ defDoBloco: (id) => (id === 7 ? { key: 'dirt' } : null) })
    expect(c.o.mundoDoOlho.chaveEm(0, 0, 0)).toBe('')
    const comTerra = montar({
      mundo: { liquidAt: () => 0, opaqueAt: () => true, getBlock: () => 7 },
      defDoBloco: (id) => (id === 7 ? { key: 'dirt' } : null),
    })
    expect(comTerra.o.mundoDoOlho.chaveEm(0, 0, 0)).toBe('dirt')
    expect(comTerra.o.mundoDoOlho.ehOpaco(0, 0, 0)).toBe(true)
  })
})
