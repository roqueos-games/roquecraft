import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ref } from 'vue'
import { useRoqueCraftEntrada } from '../../src/composables/useRoqueCraftEntrada.js'

// ⚠️ O JOGADOR SAÍA ANDANDO SOZINHO (RC-13).
//
// O navegador entrega `keydown` e nunca o `keyup` correspondente quando a
// janela perde o foco no meio. Alt-tab com o W apertado e o W fica preso no
// mapa `teclas` para sempre: o jogador volta ao jogo caminhando contra uma
// parede sem ter mandado. No celular é pior — o toque some sem `touchend`
// quando chega uma ligação, e o botão de quebrar fica segurado.
//
// Nenhum teste pegava isso porque ninguém disparava `blur`: a suíte só mandava
// `keydown`/`keyup` em pares bem-comportados, que é justamente o caso que
// funciona.
//
// Veio de `tests/unit/composables/entradaPerdeOFoco.spec.js` do RoqueOS (7ab22a6f), com os mesmos casos e as mesmas
// asserções; o que mudou foi só o caminho do front para o do repo.

function montar() {
  const telas = { menuOpen: ref(false), inventoryOpen: ref(false), paused: ref(false) }
  const e = useRoqueCraftEntrada({
    alvo: { value: null },
    ajustes: { sensitivity: 1, invertY: false },
    olhar: { girar: vi.fn() },
    telas,
    jogo: { modo: () => 'survival', voar: vi.fn() },
    // A entrada pergunta isto no primeiro tique: quem a monta responde.
    acoes: { temTelaAberta: () => false },
  })
  return e
}

describe('perder o foco solta o que estava segurado (RC-13)', () => {
  let entrada
  beforeEach(() => {
    entrada = montar()
  })
  afterEach(() => entrada.encerrar())

  it('a tecla presa é solta quando a janela perde o foco', () => {
    entrada.teclas.KeyW = true
    entrada.teclas.ShiftLeft = true
    window.dispatchEvent(new Event('blur'))
    expect(entrada.teclas.KeyW, 'o jogador continuou andando sozinho').toBeUndefined()
    expect(entrada.teclas.ShiftLeft).toBeUndefined()
  })

  it('o botão de quebrar é solto junto', () => {
    entrada.definirMinerando({ x: 1, y: 2, z: 3 })
    window.dispatchEvent(new Event('blur'))
    expect(entrada.minerando()).toBe(null)
    expect(entrada.quebrando()).toBe(false)
  })

  it('trocar de aba solta; VOLTAR para a aba não solta nada', () => {
    entrada.teclas.KeyW = true

    // A aba some.
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(entrada.teclas.KeyW).toBeUndefined()

    // O jogador volta com a tecla apertada de novo — e `visible` não pode
    // limpar o que ele acabou de apertar.
    entrada.teclas.KeyW = true
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(entrada.teclas.KeyW, 'voltar para a aba apagou o comando do jogador').toBe(true)
  })

  it('toque cancelado (ligação, notificação) solta o comando', () => {
    entrada.teclas.KeyW = true
    window.dispatchEvent(new Event('touchcancel'))
    expect(entrada.teclas.KeyW).toBeUndefined()
  })

  it('o direcional do celular volta ao centro', () => {
    entrada.onStickMove({ x: 1, y: -1 })
    expect(entrada.direcional()).toEqual({ x: 1, y: -1 })
    window.dispatchEvent(new Event('blur'))
    expect(entrada.direcional(), 'o analógico ficou preso numa direção').toEqual({ x: 0, y: 0 })
  })

  it('depois de encerrar, o listener não responde mais', () => {
    // Um listener que sobrevive ao desmonte escreve num jogo que não existe
    // mais — e o erro só aparece muito depois, sem causa aparente.
    entrada.teclas.KeyW = true
    entrada.encerrar()
    entrada.teclas.KeyA = true
    window.dispatchEvent(new Event('blur'))
    expect(entrada.teclas.KeyA, 'o listener continuou vivo depois do desmonte').toBe(true)
  })
})
