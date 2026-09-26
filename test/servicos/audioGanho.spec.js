import { describe, it, expect } from 'vitest'
import { PROFILE, FAMILIES } from '../../src/servicos/audio.js'

// "O jogo está mudo" (relato do founder). A causa não era um bug de código: era
// ganho COMPOSTO. Perfil ~0.5 × multiplicador do dig 0.3 × master 0.55 = 0.08
// antes de um bandpass estreito, que joga fora quase toda a energia restante.
// Cada estágio parecia razoável sozinho.
//
// ⚠️ O que este arquivo mede e o que ele NÃO mede.
//
// Ele NÃO mede decibéis: jsdom não tem Web Audio, então não há grafo pra
// renderizar aqui. A medida de verdade é offline, no navegador, pelo hook
// `somMedirOffline` - e os números que ela deu em 2026-08-22 estão no cabeçalho
// de audio.js.
//
// O que ele mede é o PISO DAS ENTRADAS que produziram aqueles números. É um
// arame de tropeço: quem baixar um ganho "só um pouquinho" e reabrir o silêncio
// esbarra aqui antes de chegar na produção. Honesto sobre o que é.
describe('calibração de ganho do áudio', () => {
  it('toda família tem perfil', () => {
    for (const f of FAMILIES) {
      expect(PROFILE[f], `família ${f} sem perfil`).toBeTruthy()
    }
  })

  it('nenhum ganho de perfil cai abaixo do piso medido', () => {
    // 1.5 é o menor da tabela calibrada (lã). Abaixo disso o efeito da família
    // some depois do filtro.
    for (const [nome, p] of Object.entries(PROFILE)) {
      expect(
        p.gain,
        `${nome}: ganho ${p.gain} está abaixo do piso calibrado`,
      ).toBeGreaterThanOrEqual(1.5)
    }
  })

  it('o perfil de pedra continua na faixa que foi medida', () => {
    // Âncora: com gain 2.6 o quebrar de pedra deu -8,4 dBFS na renderização
    // offline. Um teto também importa - ganho alto demais vira clipping, que
    // soa pior que som baixo.
    expect(PROFILE.stone.gain).toBeGreaterThanOrEqual(2.2)
    expect(PROFILE.stone.gain).toBeLessThanOrEqual(4)
  })

  it('todo perfil tem filtro, corpo e decaimento coerentes', () => {
    for (const [nome, p] of Object.entries(PROFILE)) {
      expect(p.hz, `${nome}`).toBeGreaterThan(0)
      expect(p.decay, `${nome}`).toBeGreaterThan(0.05)
      expect(['bandpass', 'lowpass', 'highpass']).toContain(p.type)
    }
  })
})
