// RoqueCraft - TECLADO: o que é do jogo e o que é do navegador.
//
// ⚠️ ESTE MÓDULO EXISTE PORQUE O NAVEGADOR ROUBA TECLA.
//
// Três camadas defendem o jogo, e as duas primeiras não bastam:
//  1. `preventDefault` nas teclas do jogo, e só quando o jogo está em foco.
//     Fora do jogo (menu, inventário, chat) o atalho do navegador continua
//     sendo do usuário.
//  2. Keyboard Lock, em tela cheia. Ctrl+W, Ctrl+T, Ctrl+N e Ctrl+1..9 são
//     RESERVADOS: `preventDefault` não os segura em navegador nenhum. A única
//     API que segura é `navigator.keyboard.lock()`, e ela só funciona em tela
//     cheia.
//  3. DUPLO-TOQUE NO W pra correr. É a saída que não depende de API nenhuma:
//     funciona no Safari, no Firefox e fora de tela cheia, que é onde as duas
//     camadas acima não alcançam. O Ctrl continua valendo pra quem prefere.
//
// Aqui mora o que é REGRA das três (a lista e a janela); quem chama
// `preventDefault` e `navigator.keyboard` é o componente, porque isso é DOM.

/** As teclas que o jogo reivindica quando está em foco. */
export const TECLAS_DO_JOGO = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyE',
  'KeyQ',
  'KeyF',
  'KeyT',
  'KeyR',
  'KeyM',
  'Space',
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'Tab',
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'Digit5',
  'Digit6',
  'Digit7',
  'Digit8',
  'Digit9',
])

/**
 * Quanto tempo separa dois toques pra virar um gesto de duplo-toque.
 *
 * 320 ms é o mesmo valor do duplo-espaço do voo - dois gestos do mesmo tipo
 * pedem a mesma janela.
 */
export const JANELA_DO_DUPLO_TOQUE = 320

/**
 * Dois toques dentro da janela? Puro, pra poder ser testado sem relógio.
 *
 * ⚠️ `ultimo === 0` significa "nunca tocou". Sem este caso, o primeiro toque
 * de uma sessão que começasse antes de 320 ms do epoch viraria duplo-toque -
 * e, pior, num relógio monotônico que começa em zero (`performance.now()`) o
 * primeiro W do jogo sairia correndo sozinho.
 */
export const ehDuploToque = (ultimo, agora, janela = JANELA_DO_DUPLO_TOQUE) =>
  ultimo > 0 && agora - ultimo < janela
