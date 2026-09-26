import { describe, it, expect } from 'vitest'
import { pickSpawn } from '../../src/servicos/mobs.js'

// "você colocou zumbis e aranhas de baixo da agua ao invés de vida marinha"
// — founder, 25/08/2026.
//
// Não foi escolha: `pickSpawn` pedia chão SÓLIDO embaixo e duas células livres
// em cima, e a lâmina d'água responde não-sólido às duas perguntas. O leito do
// oceano passava como chão e a água por cima passava como ar.
//
// Regra é módulo puro: dá pra provar sem subir jogo — e o teste que importa é o
// PAR, porque um mundo que nunca gera spawn nenhum passaria no teste de "não
// nasce na água" sem provar nada.

/** Oceano: leito sólido até y<=39, água de 40 a 62, ar acima. */
const oceano = (extra = {}) => ({
  player: { x: 0, y: 64, z: 0 },
  surfaceY: () => 40,
  solidAt: (x, y) => y <= 39,
  liquidAt: (x, y) => y >= 40 && y <= 62,
  lightAt: () => 15,
  biomeAt: () => 'ocean',
  isDay: true,
  allowHostile: true,
  ...extra,
})

/** Campo seco: chão sólido até y<=63, ar acima, sem líquido em lugar nenhum. */
const campo = (extra = {}) => ({
  player: { x: 0, y: 64, z: 0 },
  surfaceY: () => 64,
  solidAt: (x, y) => y <= 63,
  liquidAt: () => false,
  lightAt: () => 15,
  biomeAt: () => 'plains',
  isDay: true,
  allowHostile: true,
  ...extra,
})

/** Roda muitas tentativas com um gerador determinístico. */
function tentar(env, n = 400) {
  let semente = 12345
  const rnd = () => {
    semente = (semente * 1664525 + 1013904223) % 4294967296
    return semente / 4294967296
  }
  const saidas = []
  for (let i = 0; i < n; i++) {
    const s = pickSpawn(env, rnd)
    if (s) saidas.push(s)
  }
  return saidas
}

describe('roquecraft - criatura de terra não nasce dentro da água', () => {
  it('no oceano, com luz alta e dia, NENHUMA criatura nasce', () => {
    expect(tentar(oceano())).toHaveLength(0)
  })

  it('no oceano de NOITE, nenhum hostil nasce submerso', () => {
    // Este é o caso do print: escuro embaixo d'água, hostil liberado, e antes
    // da correção o zumbi nascia no leito.
    expect(tentar(oceano({ lightAt: () => 0 }))).toHaveLength(0)
  })

  it('CONTROLE: em campo seco as mesmas regras geram criatura', () => {
    // Sem isto, os dois testes acima passariam num `pickSpawn` que devolvesse
    // null sempre — e eu teria "provado" uma correção que quebrou o spawn.
    expect(tentar(campo()).length).toBeGreaterThan(20)
  })

  it('CONTROLE: em campo seco e escuro nascem hostis', () => {
    const saidas = tentar(campo({ lightAt: () => 0 }))
    expect(saidas.length).toBeGreaterThan(20)
    expect(saidas.every((s) => ['zombie', 'creeper', 'skeleton', 'spider'].includes(s.type))).toBe(
      true,
    )
  })

  it('praia rasa: uma única célula de água acima do chão já barra', () => {
    // A poça de um bloco é o caso limite — e é onde o founder anda. Chão em 63,
    // uma lâmina em 64, ar em 65: o teste antigo aprovava.
    const praia = campo({
      surfaceY: () => 64,
      solidAt: (x, y) => y <= 63,
      liquidAt: (x, y) => y === 64,
    })
    expect(tentar(praia)).toHaveLength(0)
  })
})
