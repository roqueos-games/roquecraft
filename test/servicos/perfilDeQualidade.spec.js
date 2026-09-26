import { describe, it, expect, afterEach } from 'vitest'
import {
  detectQuality,
  QUALITY,
  ehNeve,
  intensidadeDoSol,
} from '../../src/servicos/render/engine.js'

// ─────────────────────────────────────────────────────────────────────────────
// O PERFIL DE QUALIDADE É A PRIMEIRA DECISÃO DO JOGO, e nunca teve teste: ela
// roda uma vez, no boot, e decide sombra, reflexo, nuvem e distância de
// desenho. Errar para MAIS trava o celular do founder; errar para MENOS entrega
// um jogo feio a quem tem máquina. As duas falhas são silenciosas — o jogo abre
// nas duas.
//
// `render/engine.js` tem 1.526 linhas e depende de WebGL, então o que dá para
// afirmar é o que é PURO: a detecção, a tabela calibrada, e as duas contas de
// cena que a varredura de mutação apontou como sem dono.
// ─────────────────────────────────────────────────────────────────────────────

const descritores = []
const trocar = (alvo, chave, valor) => {
  descritores.push([alvo, chave, Object.getOwnPropertyDescriptor(alvo, chave)])
  Object.defineProperty(alvo, chave, { value: valor, configurable: true, writable: true })
}

const maquina = ({ mem, cores, toque = false, semHover = false }) => {
  trocar(navigator, 'deviceMemory', mem)
  trocar(navigator, 'hardwareConcurrency', cores)
  trocar(window, 'matchMedia', (q) => ({
    matches: q.includes('coarse') ? toque : q.includes('hover') ? semHover : false,
  }))
}

afterEach(() => {
  while (descritores.length) {
    const [alvo, chave, desc] = descritores.pop()
    if (desc) Object.defineProperty(alvo, chave, desc)
    else delete alvo[chave]
  }
  document.documentElement.removeAttribute('data-low-end')
})

describe('detectQuality — quem decide o que a máquina aguenta', () => {
  it('o sinalizador de máquina fraca manda em tudo', () => {
    // O sinal invertido inverte a regra inteira: a máquina marcada como fraca
    // passa a receber o perfil ALTO, e toda máquina normal cai no baixo. Até a
    // extração o sinal era o `data-low-end` do `<html>` do RoqueOS; agora é o
    // `host.desempenho.modoLeve()`, que o componente passa como `leve`.
    maquina({ mem: 32, cores: 16 })
    expect(detectQuality({ leve: true })).toBe('low')
    expect(detectQuality({ leve: false })).toBe('ultra')
    // Sem sinal nenhum, como antes sem o atributo: a máquina decide.
    expect(detectQuality()).toBe('ultra')
    // E o atributo do RoqueOS não manda mais: quem manda é o host.
    document.documentElement.setAttribute('data-low-end', '1')
    expect(detectQuality()).toBe('ultra')
  })

  it('toque OU falta de hover já bastam para o perfil baixo', () => {
    // `coarse || noHover` virando `&&` exige as DUAS coisas: um tablet com
    // caneta (toque, mas com hover) passaria a receber o perfil de desktop.
    maquina({ mem: 32, cores: 16, toque: true, semHover: false })
    expect(detectQuality()).toBe('low')

    maquina({ mem: 32, cores: 16, toque: false, semHover: true })
    expect(detectQuality()).toBe('low')
  })

  it('4 GB ou 4 núcleos EXATOS já caem no perfil médio', () => {
    // `mem <= 4 || cores <= 4` apertado para `<` deixa a máquina de exatamente
    // 4 GB subir um degrau — e é a configuração mais comum de celular e de
    // notebook de entrada.
    maquina({ mem: 4, cores: 16 })
    expect(detectQuality()).toBe('medium')

    maquina({ mem: 32, cores: 4 })
    expect(detectQuality()).toBe('medium')
  })

  it('8 GB e 8 núcleos EXATOS já ganham o perfil ultra', () => {
    // `mem >= 8 && cores >= 8` apertado para `>` nega o ultra à máquina que
    // bate exatamente o requisito — e 8/8 é a configuração de catálogo.
    maquina({ mem: 8, cores: 8 })
    expect(detectQuality()).toBe('ultra')
  })

  it('as duas condições do ultra valem JUNTAS', () => {
    // Virando `||`, meia máquina (muita memória e poucos núcleos) recebe o
    // perfil mais caro do jogo.
    maquina({ mem: 32, cores: 6 })
    expect(detectQuality()).toBe('high')

    maquina({ mem: 6, cores: 32 })
    expect(detectQuality()).toBe('high')
  })

  it('navegador que não declara memória nem núcleos é tratado como bom', () => {
    // `navigator.deviceMemory || 8`: o Safari não expõe `deviceMemory`, e
    // tratar ausência como zero jogaria todo iPhone e todo Mac no perfil
    // médio. Virando `&&`, a ausência vira `undefined` e as comparações todas
    // dão falso — a máquina cai em `high` por acidente, não por decisão.
    maquina({ mem: undefined, cores: undefined })
    expect(detectQuality()).toBe('ultra')
  })
})

describe('QUALITY — a tabela calibrada', () => {
  it('o perfil BAIXO desliga o que custa caro', () => {
    // Valores congelados de propósito: são calibração medida, não gosto. Um
    // zero virando um aqui devolve reflexo e nuvem à máquina que não aguenta —
    // e o jogo continua abrindo, só que a 12 quadros por segundo.
    expect(QUALITY.low).toMatchObject({
      shadows: false,
      reflexo: false,
      reflexoEscala: 0,
      ssao: false,
      bloom: false,
      godRays: false,
      fxaa: false,
      clouds: false,
      cloudQuality: 0,
      normalMaps: false,
      renderDistance: 5,
    })
  })

  it('o celular (perfil médio) tem reflexo, mas em um terço da tela', () => {
    // ⚠️ Decisão registrada no fonte: o founder joga no iPhone e o print dele
    // TEM sombra, então ele está no médio. Deixar o reflexo só no desktop seria
    // entregar a quem não pediu e negar a quem pediu; o preço é a escala.
    expect(QUALITY.medium.reflexo).toBe(true)
    expect(QUALITY.medium.reflexoEscala).toBe(0.34)
    expect(QUALITY.medium.shadows).toBe(true)
  })

  it('os quatro perfis existem e crescem em distância de desenho', () => {
    const ordem = ['low', 'medium', 'high', 'ultra']
    expect(Object.keys(QUALITY).sort()).toEqual([...ordem].sort())
    for (let i = 1; i < ordem.length; i++) {
      expect(QUALITY[ordem[i]].renderDistance).toBeGreaterThanOrEqual(
        QUALITY[ordem[i - 1]].renderDistance,
      )
    }
  })
})

describe('render — as duas contas de cena', () => {
  it('céu limpo NÃO é neve', () => {
    // ⚠️ `neve > chuva` no empate. Com `>=`, o estado padrão do mundo (os dois
    // zerados) vira "está nevando", e o sistema de partículas desenha floco o
    // tempo todo, em todo bioma.
    expect(ehNeve({ neve: 0, chuva: 0 })).toBe(0)
    expect(ehNeve({ neve: 0.5, chuva: 0.5 })).toBe(0)
    expect(ehNeve({ neve: 0.6, chuva: 0.5 })).toBe(1)
    expect(ehNeve({ neve: 0.4, chuva: 0.5 })).toBe(0)
  })

  it('sunMul ZERO apaga o sol de verdade', () => {
    // `fx.sunMul ?? 1` com `||`: o painel de FX manda `sunMul: 0` para apagar o
    // sol — é como o QA fotografa uma cena só com luz ambiente — e esse zero
    // viraria 1. O sol ficaria aceso exatamente na foto que existe para
    // mostrá-lo apagado.
    expect(intensidadeDoSol(3, { sunMul: 0 })).toBe(0)
    expect(intensidadeDoSol(3, {})).toBe(3)
    expect(intensidadeDoSol(3, { sunMul: 0.5 })).toBe(1.5)
  })

  it('o clarão do relâmpago SOMA por cima do sol', () => {
    // `1 + clarao * 1.8` virando `-`: um clarão forte (0,8) daria fator
    // negativo, e o relâmpago APAGARIA o sol em vez de estourá-lo.
    expect(intensidadeDoSol(2, {}, 1, 0)).toBe(2)
    expect(intensidadeDoSol(2, {}, 1, 1)).toBeCloseTo(2 * 2.8, 6)
    expect(intensidadeDoSol(2, {}, 1, 0.5)).toBeGreaterThan(2)
  })

  it('a chuva tira sol sem inverter nada', () => {
    expect(intensidadeDoSol(4, {}, 0.7)).toBeCloseTo(2.8, 6)
  })
})
