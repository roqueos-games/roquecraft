import { describe, it, expect } from 'vitest'
import { aplicarAjustes, LIMITES, FOV_NO_CELULAR } from '../../src/servicos/ajustes.js'

// ⚠️ A REGRA QUE ESTE ARQUIVO EXISTE PRA SEGURAR.
//
// O jogador abre o jogo no desktop, o save guarda `quality: 'high'`, e depois
// abre no celular fraco. A deteccao diz `low`; o save diz `high`. Se o save
// vencer, o aparelho tenta desenhar sombra e pos-processamento que nao aguenta,
// e o resultado nao e "um pouco mais lento": e um quadro por segundo, ou uma
// aba que morre.
//
// Isto morava dentro de `boot`, no meio de cento e setenta linhas de montagem.
// Nunca teve teste, e nao tinha como ter: pra chegar nele era preciso carregar
// textura, criar o motor e abrir o mundo.

const PERFIS = {
  low: { renderDistance: 4 },
  medium: { renderDistance: 8 },
  high: { renderDistance: 12 },
}

const novos = () => ({
  quality: 'high',
  renderDistance: 8,
  fov: 72,
  sensitivity: 1,
  autoJump: true,
  viewBob: true,
  showStats: false,
  sound: true,
  music: 0.55,
})

const aplicar = (over = {}) =>
  aplicarAjustes({
    ajustes: novos(),
    detectada: 'high',
    perfis: PERFIS,
    ehCelular: false,
    salvos: null,
    ...over,
  })

describe('ajustes', () => {
  it('sem save, manda a detecção', () => {
    const a = aplicar({ detectada: 'medium' })
    expect(a.quality).toBe('medium')
    expect(a.renderDistance).toBe(PERFIS.medium.renderDistance)
  })

  it('no celular o campo de visão abre', () => {
    // Tela menor pede ângulo maior, senão o jogador anda olhando por um canudo.
    expect(aplicar({ ehCelular: true }).fov).toBe(FOV_NO_CELULAR)
    expect(aplicar({ ehCelular: false }).fov).toBe(72)
  })

  it('a preferência salva vence a detecção', () => {
    const a = aplicar({ detectada: 'high', salvos: { quality: 'medium' } })
    expect(a.quality).toBe('medium')
  })

  it("⚠️ 'low' NUNCA é elevado por um save", () => {
    // O caso do desktop -> celular fraco. É esta linha que evita um quadro por
    // segundo num aparelho que já se declarou incapaz.
    const a = aplicar({ detectada: 'low', salvos: { quality: 'high' } })
    expect(a.quality, 'o save levantou a qualidade num aparelho low').toBe('low')
    // E a distância de render continua a do perfil detectado, não a salva...
    expect(a.renderDistance).toBe(PERFIS.low.renderDistance)
  })

  it('...mas a distância de render salva ainda vale, presa aos limites', () => {
    // Ela é o ajuste que o jogador mexe pra caber no aparelho dele; recusá-la
    // no `low` tiraria a única alavanca de quem está no limite.
    const a = aplicar({ detectada: 'low', salvos: { renderDistance: 3 } })
    expect(a.renderDistance).toBe(3)
  })

  it('todo número salvo é preso aos limites da tela de opções', () => {
    const alto = aplicar({
      salvos: { renderDistance: 999, fov: 999, sensitivity: 999, music: 999 },
    })
    expect(alto.renderDistance).toBe(LIMITES.renderDistance.max)
    expect(alto.fov).toBe(LIMITES.fov.max)
    expect(alto.sensitivity).toBe(LIMITES.sensitivity.max)
    expect(alto.music).toBe(LIMITES.music.max)

    const baixo = aplicar({
      salvos: { renderDistance: -999, fov: -999, sensitivity: -999, music: -999 },
    })
    expect(baixo.renderDistance).toBe(LIMITES.renderDistance.min)
    expect(baixo.fov).toBe(LIMITES.fov.min)
    expect(baixo.sensitivity).toBe(LIMITES.sensitivity.min)
    expect(baixo.music).toBe(LIMITES.music.min)
  })

  it('número inválido no save não zera o ajuste', () => {
    // Save corrompido ou de versão antiga: `undefined`/`NaN` tem que ser
    // IGNORADO, não convertido em zero. FOV zero é uma tela preta.
    const a = aplicar({ salvos: { fov: NaN, sensitivity: undefined, renderDistance: 'oito' } })
    expect(a.fov).toBe(72)
    expect(a.sensitivity).toBe(1)
    expect(a.renderDistance).toBe(PERFIS.high.renderDistance)
  })

  it('⚠️ ausência de campo booleano vira LIGADO, não desligado', () => {
    // Save feito antes destes ajustes existirem não tem os campos. Com `!!`,
    // quem salvou naquela época abriria o jogo com auto-pulo, balanço e som
    // desligados sem ter pedido nada.
    const a = aplicar({ salvos: { quality: 'high' } })
    expect(a.autoJump, 'o auto-pulo desligou sozinho num save antigo').toBe(true)
    expect(a.viewBob).toBe(true)
    expect(a.sound).toBe(true)
    // O minimapa entrou depois de todos eles e cai na mesma regra: quem salvou
    // antes de ele existir abre o jogo COM o mapa.
    expect(a.minimapa, 'o minimapa nasceu escondido num save antigo').toBe(true)
  })

  it('...e o oposto vale pro que é desligado por padrão', () => {
    // `showStats` não pode acender sozinho: quem nunca pediu o painel de
    // estatística não quer ele por cima do jogo.
    expect(aplicar({ salvos: { quality: 'high' } }).showStats).toBe(false)
    expect(aplicar({ salvos: { showStats: true } }).showStats).toBe(true)
  })

  it('desligar de verdade continua desligando', () => {
    const a = aplicar({
      salvos: { autoJump: false, viewBob: false, sound: false, minimapa: false },
    })
    expect([a.autoJump, a.viewBob, a.sound, a.minimapa]).toEqual([false, false, false, false])
  })

  it('música em zero é respeitada (não confundida com ausência)', () => {
    // Quem joga com podcast no fone põe a trilha em zero. `if (s.music)` teria
    // tratado isso como "não salvou" e devolvido a música ligada.
    expect(aplicar({ salvos: { music: 0 } }).music, 'a trilha voltou sozinha').toBe(0)
  })
})

// ⚠️ A REGRA DA QUALIDADE VALIA SÓ PARA A QUALIDADE (RC-12, 12/09/2026).
//
// O save que dizia `quality: 'high'` era recusado num aparelho `low` — e o save
// que dizia `renderDistance: 16` passava inteiro, porque o único limite era o
// global. O celular que acabou de se declarar incapaz recebia 16 chunks de
// raio: mais de mil chunks para gerar, malhar e desenhar, no aparelho que não
// aguenta nem a sombra. Meia regra é uma regra que não protege.
describe('distância de render respeita o aparelho (RC-12)', () => {
  const PERFIS = {
    low: { renderDistance: 4 },
    medium: { renderDistance: 8 },
    high: { renderDistance: 12 },
    ultra: { renderDistance: 16 },
  }
  const novo = () => ({})

  it('o desktop que salvou 16 e abriu no celular fraco não leva os 16', () => {
    const a = aplicarAjustes({
      ajustes: novo(),
      detectada: 'low',
      perfis: PERFIS,
      ehCelular: true,
      salvos: { quality: 'ultra', renderDistance: 16 },
    })
    expect(a.quality, 'a qualidade já era protegida').toBe('low')
    expect(a.renderDistance, 'o aparelho incapaz recebeu a distância do desktop').toBe(4)
  })

  it('no celular fraco, uma distância MENOR que o teto continua sendo a do jogador', () => {
    const a = aplicarAjustes({
      ajustes: novo(),
      detectada: 'low',
      perfis: PERFIS,
      ehCelular: true,
      salvos: { renderDistance: 3 },
    })
    expect(a.renderDistance).toBe(3)
  })

  it('fora do low, quem tem máquina para ver longe continua vendo longe', () => {
    for (const detectada of ['medium', 'high', 'ultra']) {
      const a = aplicarAjustes({
        ajustes: novo(),
        detectada,
        perfis: PERFIS,
        ehCelular: false,
        salvos: { renderDistance: 16 },
      })
      expect(a.renderDistance, `${detectada} foi limitado sem motivo`).toBe(16)
    }
  })

  it('o teto vem do PERFIL, e não de um número escrito à mão', () => {
    const outros = { ...PERFIS, low: { renderDistance: 6 } }
    const a = aplicarAjustes({
      ajustes: novo(),
      detectada: 'low',
      perfis: outros,
      ehCelular: true,
      salvos: { renderDistance: 16 },
    })
    expect(a.renderDistance).toBe(6)
  })

  it('perfil sem distância declarada cai no limite global, e não em `undefined`', () => {
    const a = aplicarAjustes({
      ajustes: novo(),
      detectada: 'low',
      perfis: { low: {} },
      ehCelular: true,
      salvos: { renderDistance: 99 },
    })
    expect(a.renderDistance).toBe(LIMITES.renderDistance.max)
  })
})
