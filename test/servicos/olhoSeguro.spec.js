import { describe, it, expect } from 'vitest'
import { EYE_HEIGHT } from '../../src/servicos/physics.js'

// O OLHO NUNCA DENTRO DE UM BLOCO.
//
// Com a câmera dentro da geometria, o culling de face frontal apaga tudo entre
// o olho e o resto do mundo, e a tela mostra o avesso: pedaços soltos de
// terreno, tufo de grama sem apoio, interior de bloco em preto, céu nos vãos.
// Foi assim que o founder descreveu o print de 2026-08-23 — "o mapa gerado está
// lá no céu".
//
// A regra que fecha a classe: se o olho cai numa célula opaca, ele sobe até a
// primeira livre; não achando em dois blocos, desce até os pés.
//
// ⚠️ A lógica vive no componente (precisa de `player` e `world`), então aqui ela
// é reimplementada com a MESMA forma e testada contra mundos sintéticos. Isso
// prova a regra, não a fiação — a fiação é coberta pelo harness de tela.

/** Mesma forma de `olhoSeguro` no componente. */
function olhoSeguro(opaqueAt, player) {
  const x = player.x
  const z = player.z
  const alvo = player.y + EYE_HEIGHT
  if (!opaqueAt(Math.floor(x), Math.floor(alvo), Math.floor(z))) return [x, alvo, z]
  for (let d = 0.25; d <= 2; d += 0.25) {
    const y = alvo + d
    if (!opaqueAt(Math.floor(x), Math.floor(y), Math.floor(z))) return [x, y, z]
  }
  // ⚠️ o passo de 0,25 nao alcanca os pes: 1,62 / 0,25 = 6,48, entao a busca
  // parava em 1,50 e o olho ficava dentro da pedra no caso do jogador enterrado.
  // O ultimo degrau e o pe, explicito.
  for (let d = 0.25; d < EYE_HEIGHT; d += 0.25) {
    const y = alvo - d
    if (!opaqueAt(Math.floor(x), Math.floor(y), Math.floor(z))) return [x, y, z]
  }
  const pe = player.y + 0.1
  if (!opaqueAt(Math.floor(x), Math.floor(pe), Math.floor(z))) return [x, pe, z]
  return [x, alvo, z]
}

const jog = (y) => ({ x: 8.5, y, z: 8.5 })

describe('roquecraft - o olho nunca dentro da pedra', () => {
  it('em campo aberto não mexe na câmera', () => {
    const vazio = () => false
    const [x, y, z] = olhoSeguro(vazio, jog(64))
    expect([x, y, z]).toEqual([8.5, 64 + EYE_HEIGHT, 8.5])
  })

  it('cabeça dentro de um teto baixo: o olho sobe pra célula livre', () => {
    // sólido só em y = 65 (o jogador em 64 tem o olho em 65,62 → dentro)
    const teto = (x, y) => y === 65
    const [, y] = olhoSeguro(teto, jog(64))
    expect(teto(8, Math.floor(64 + EYE_HEIGHT), 8), 'o caso de teste não enterra o olho').toBe(true)
    expect(Math.floor(y), 'o olho continuou dentro do bloco').not.toBe(65)
    expect(y).toBeGreaterThan(64 + EYE_HEIGHT)
  })

  it('cabeça enterrada e pés livres: desce pros pés', () => {
    // Maciço de 65 a 70 com o jogador em 64: os PÉS estão livres (64) e só a
    // cabeça entrou. É o caso de verdade — bloco colocado na própria cabeça,
    // degrau automático sob um teto, um frame de lag antes de a física resolver.
    const macico = (x, y) => y >= 65 && y <= 70
    const [, y] = olhoSeguro(macico, jog(64))
    expect(macico(8, Math.floor(y), 8), 'o olho ficou dentro da pedra').toBe(false)
    expect(y).toBeLessThan(64 + EYE_HEIGHT)
  })

  it('corpo inteiro dentro da pedra: devolve o nominal sem travar', () => {
    // Sem célula livre nem acima nem nos pés não há o que fazer — o que não
    // pode é o laço rodar pra sempre nem devolver NaN.
    const tudo = () => true
    const [, y] = olhoSeguro(tudo, jog(64))
    expect(y).toBe(64 + EYE_HEIGHT)
  })

  it('nunca devolve NaN nem sai do eixo', () => {
    const aleatorio = (x, y) => (y * 37) % 5 === 0
    for (let base = 40; base < 90; base += 0.5) {
      const [x, y, z] = olhoSeguro(aleatorio, jog(base))
      expect(Number.isFinite(y)).toBe(true)
      expect(x).toBe(8.5)
      expect(z).toBe(8.5)
    }
  })
})
