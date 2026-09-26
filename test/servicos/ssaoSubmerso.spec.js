import { describe, it, expect } from 'vitest'
import { ssaoLigado, QUALITY } from '../../src/servicos/render/engine.js'

// O SSAO NÃO PODE RODAR DEBAIXO D'ÁGUA.
//
// "tem um contorno estranho nas algas e nos blocos que estão fora da agua
// enquanto estou mergulhando" — founder, 25/08/2026, com print.
//
// O QUE ERA: a oclusão de ambiente é calculada a partir da PROFUNDIDADE e
// aplicada como multiplicador sobre a cor FINAL, depois da névoa. Submerso, a
// névoa é curta e densa e o terreno distante vira uma chapa azul uniforme — mas
// a silhueta dele continua sendo uma descontinuidade de profundidade, e o SSAO
// continua escurecendo exatamente ali. Sai um traço fino em volta de coisas que
// a névoa já apagou: contorno sem objeto.
//
// ⚠️ COMO ISSO FOI ACHADO, porque a lição vale mais que a linha de código.
//
// A bisseção mediu quanto cada passe muda o quadro. O SSAO mudava 1,39 num
// ruído de 0,79 — e eu tinha escrito um limiar que chamava isso de
// "INTERRUPTOR MORTO". O limiar estava errado: o artefato é fraco e fino, então
// ele PODE ser a diferença inteira e ainda assim mover pouco a média. Quem
// desempatou foi olhar as duas fotos normalizadas lado a lado — com SSAO os
// traços estão lá, sem SSAO sumiram, e nenhum outro passe faz isso.
//
// Número pequeno não é passe inocente. É só número pequeno.

describe('roquecraft — o SSAO sai debaixo d’água', () => {
  it('submerso desliga, mesmo quando o perfil pede SSAO', () => {
    expect(ssaoLigado(true, true), 'SSAO ligado submerso — o contorno volta').toBe(false)
  })

  it('fora d’água continua ligado — a correção não pode virar "desligar SSAO"', () => {
    // ⚠️ ESTA METADE É O CONTROLE. Sem ela, apagar o SSAO do jogo inteiro
    // passaria no teste acima e ninguém notaria: some o defeito e some também
    // o recurso, que é a correção preguiçosa que este par existe pra barrar.
    expect(ssaoLigado(true, false), 'SSAO deveria rodar fora d’água').toBe(true)
  })

  it('o botão de QA continua mandando: desligado é desligado nos dois casos', () => {
    expect(ssaoLigado(false, false)).toBe(false)
    expect(ssaoLigado(false, true)).toBe(false)
  })

  it('indefinido conta como ligado — perfil que não fala do assunto não perde o efeito', () => {
    expect(ssaoLigado(undefined, false)).toBe(true)
    expect(ssaoLigado(undefined, true)).toBe(false)
  })

  it('só o perfil ultra pede SSAO — é lá que o defeito aparecia', () => {
    // Ancora o alcance do achado: se um dia `high` ganhar SSAO, este teste cai e
    // obriga quem mexeu a reler a nota acima antes de seguir.
    expect(QUALITY.ultra.ssao).toBe(true)
    expect(QUALITY.high.ssao).toBe(false)
  })
})
