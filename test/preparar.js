// O que o jsdom não tem e o RoqueCraft usa, e o que a suíte do RoqueOS fazia
// antes de cada teste (o `tests/setup/vitest.setup.js` do front). Os testes
// vieram de lá e contam com isto.
import { afterEach, vi } from 'vitest'

// O jogo mede o próprio tamanho com ResizeObserver. No navegador ele recebe o
// observador de verdade; aqui basta um que não faz nada, porque os testes não
// dependem do tamanho da tela.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// "É celular?" e "o ponteiro é de toque?" saem de `matchMedia` (ver
// `src/tela.js`). O jsdom não tem; sem isto, montar o jogo estoura. Responde
// "não" a tudo: o jogo de teste é o de desktop, e o teste que quer celular
// troca a resposta.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (media = '') => ({
    matches: false,
    media,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}

// A suíte do front restaurava todo espião depois de cada teste, e vários
// testes do RoqueCraft espiam `console` e `Math.random` contando com isso.
afterEach(() => {
  vi.restoreAllMocks()
})
