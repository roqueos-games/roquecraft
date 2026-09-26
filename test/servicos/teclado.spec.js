import { describe, it, expect } from 'vitest'
import { TECLAS_DO_JOGO, JANELA_DO_DUPLO_TOQUE, ehDuploToque } from '../../src/servicos/teclado.js'

// A regra do duplo-toque saiu do componente porque é PURA e o componente não
// era capaz de testá-la: `performance.now()` não tem como ser plantado de
// dentro de um `.vue` sem simular o DOM inteiro.
//
// ⚠️ A EXTRAÇÃO CORRIGIU UM DEFEITO LATENTE. A versão que morava no componente
// era `agora - ultimoW < JANELA`, sem a guarda do "nunca tocou". Com
// `ultimoW = 0` (o valor inicial) e um relógio monotônico que começa em zero,
// o PRIMEIRO W de uma sessão sairia correndo sozinho se o jogo carregasse em
// menos de 320 ms. Nenhuma sessão real carrega tão rápido, e por isso ninguém
// viu - mas o teste abaixo trava o caso, que agora é impossível.

describe('teclado', () => {
  it('dois toques dentro da janela viram duplo-toque', () => {
    expect(ehDuploToque(1000, 1100)).toBe(true)
    expect(ehDuploToque(1000, 1000 + JANELA_DO_DUPLO_TOQUE - 1)).toBe(true)
  })

  it('fora da janela, não', () => {
    expect(ehDuploToque(1000, 1000 + JANELA_DO_DUPLO_TOQUE)).toBe(false)
    expect(ehDuploToque(1000, 5000)).toBe(false)
  })

  it('o PRIMEIRO toque nunca é duplo, mesmo com o relógio perto do zero', () => {
    // Este é o caso que a versão do componente errava.
    expect(ehDuploToque(0, 10), 'o primeiro W saiu correndo sozinho').toBe(false)
    expect(ehDuploToque(0, 319)).toBe(false)
    expect(ehDuploToque(0, 0)).toBe(false)
  })

  it('a janela é a mesma do duplo-espaço do voo', () => {
    // Dois gestos do mesmo tipo pedem a mesma janela; se alguém mexer num sem
    // mexer no outro, os dois passam a "responder diferente" sem explicação.
    expect(JANELA_DO_DUPLO_TOQUE).toBe(320)
    // E a janela é parametrizável, pra quem precisar medir outra coisa.
    expect(ehDuploToque(0 + 1, 1 + 99, 100)).toBe(true)
    expect(ehDuploToque(0 + 1, 1 + 100, 100)).toBe(false)
  })

  it('as teclas do jogo cobrem movimento, ação e hotbar', () => {
    for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'Tab'])
      expect(TECLAS_DO_JOGO.has(k), `${k} não está reivindicada`).toBe(true)
    for (let i = 1; i <= 9; i++) expect(TECLAS_DO_JOGO.has(`Digit${i}`)).toBe(true)
    // CONTROLE: o jogo NÃO reivindica o que não usa. Uma lista que pegasse tudo
    // roubaria atalhos do navegador sem motivo - e a camada 1 existe justamente
    // pra só roubar o necessário.
    expect(TECLAS_DO_JOGO.has('KeyL')).toBe(false)
    expect(TECLAS_DO_JOGO.has('Digit0')).toBe(false)
    expect(TECLAS_DO_JOGO.has('Escape')).toBe(false)
  })
})
