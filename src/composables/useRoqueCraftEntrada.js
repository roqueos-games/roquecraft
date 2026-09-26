// RoqueCraft - ENTRADA: teclado, mouse, ponteiro travado e toque.
//
// E COMPOSABLE E NAO SERVICO porque e dono de estado que vive enquanto a
// partida vive - o mapa de teclas que o laco de fisica le sessenta vezes por
// segundo, o gesto de mira em andamento, o botao segurado - e porque pede e
// solta recursos do navegador (pointer lock, keyboard lock) que precisam ser
// devolvidos quando o jogo fecha.
//
// ⚠️ A ENTRADA E UMA FAN-OUT PARA ACOES, e o contrato mostra isso: ela recebe
// `acoes`, um objeto de VERBOS com nome (atacar, colocar, largarDaMao...). Nao
// e um saco de variaveis: e a lista do que o jogador pode fazer. Quem executa
// cada verbo continua sendo quem sabe executa-lo.
//
// O que ela guarda pra si: `teclas`, `mining`, `breaking`, o vetor do direcional
// do celular, o toque de mira, e os dois relogios de duplo-toque.

import { TECLAS_DO_JOGO, ehDuploToque } from '../servicos/teclado.js'
import { pressionarColocar, soltarColocar } from '../servicos/construcao.js'
import { ref, reactive, watch } from 'vue'

/** Sensibilidade base do mouse, multiplicada pelo ajuste do jogador. */
export const SENSIBILIDADE_DO_MOUSE = 0.0022
/** Sensibilidade base do toque. Maior porque o dedo percorre menos tela. */
export const SENSIBILIDADE_DO_TOQUE = 0.0052
/** Quanto o pitch para antes do zenite, pra camera nao virar de cabeca pra baixo. */
export const FOLGA_DO_PITCH = 0.02
/** Metade da tela reservada ao direcional: toque a esquerda disso nao vira mira. */
export const FAIXA_DO_DIRECIONAL = 0.45
/** Elementos de HUD que engolem o toque em vez de virar mira. */
export const ALVOS_DE_HUD = '.rc-mob__btn, .rc-mob__mini, .rc-hud__slot'
/**
 * TOQUE LONGO NA MIRA = PICK BLOCK (o botão do meio do mouse), só no criativo.
 *
 * ⚠️ O toque não tinha como pegar bloco: era gesto só de mouse. 600 ms é o
 * padrão de "segurar" do iOS e do Android; 10 px de folga porque o dedo parado
 * treme, e um tremor não é arrastar a câmera.
 */
export const TOQUE_LONGO_MS = 600
export const FOLGA_DO_TOQUE_LONGO = 10

/**
 * @param {object} ctx
 * @param {object} ctx.alvo  `{ canvas, ehCelular }` - refs
 * @param {object} ctx.ajustes  `settings`, reativo (le `sensitivity`)
 * @param {object} ctx.olhar  `{ yaw, pitch, definir }` - `yaw`/`pitch` sao
 *   variaveis de modulo do componente, entao entram por getter e a escrita
 *   volta por `definir(y, p)` (rule 44).
 * @param {object} ctx.telas  refs de estado de tela que a entrada consulta
 * @param {object} ctx.jogo  `{ modo, construcao, emRede, slotAtual, slotsDaHotbar, ativo }` -
 *   `ativo()` diz se a janela do jogo é a que está em foco no RoqueOS; sem ele, sempre é
 * @param {object} ctx.acoes  os verbos do jogador
 * @param {{ reivindicar: () => void, liberar: () => void }} [ctx.teclado]  a capacidade
 *   `teclado` do host. Opcional: o host que não disputa teclado não a tem.
 */
export function useRoqueCraftEntrada({ alvo, ajustes, olhar, telas, jogo, acoes, teclado }) {
  /**
   * ⚠️ SÓ A JANELA ATIVA OUVE O TECLADO. No RoqueOS várias janelas ficam abertas
   * e o `keydown` é da página inteira: com o jogo atrás de um editor, cada W
   * digitado no editor andava com o jogador. `ativo` vem do `estado.ativo` do
   * contrato do jogo-sdk, que o host troca quando a janela ganha e perde o foco.
   */
  const ativo = () => (jogo.ativo ? jogo.ativo() !== false : true)
  /** Está com o teclado agora? Só o QA lê (antes lia o registro do RoqueOS). */
  let comOTeclado = false
  function reivindicar() {
    comOTeclado = true
    teclado?.reivindicar?.()
  }
  function liberar() {
    comOTeclado = false
    teclado?.liberar?.()
  }

  /** O MESMO mapa que o laco de fisica le. Nao e copia: e a fonte. */
  const teclas = {}
  const ponteiroTravado = ref(false)
  const posicaoDoMouse = reactive({ x: 0, y: 0 })

  /** Bloco sendo minerado agora (`null` = nenhum). Lido pelo passo e pelo HUD. */
  let minerando = null
  /** Botao de quebrar segurado. */
  let quebrando = false
  let direcional = { x: 0, y: 0 }
  let toqueDaMira = null
  let ultimoToque = { x: 0, y: 0 }
  let ultimoEspaco = 0
  let ultimoW = 0
  let correndoPorDuploToque = false

  // ⚠️ A LISTA ÚNICA, e não mais uma cópia. Esta linha enumerava três telas e não
  // conhecia o painel de criativo nem o comércio: com um deles aberto o jogo
  // seguia se achando "em jogo", continuava reivindicando o teclado e engolindo
  // as teclas do navegador. Ver `useRoqueCraftTelas`.
  const noJogo = () => ativo() && !acoes.temTelaAberta()

  /**
   * ⚠️ O JOGO AVISA O DESKTOP DE QUE ESTÁ COM O TECLADO, e isso não é redundante
   * com o ponteiro preso: no CELULAR não há ponteiro para prender, e o jogador
   * com um teclado Bluetooth acoplado continua querendo que `Ctrl+D` não some a
   * tela. O host (antes o `focoDoTeclado` do RoqueOS) responde por qualquer um
   * dos dois sinais.
   *
   * O pedido segue o `noJogo()` — menu, inventário, pausa e a janela perdendo o
   * foco DEVOLVEM o teclado, porque quem está lendo um menu (ou outra janela)
   * espera que o atalho do desktop funcione.
   */
  watch(noJogo, (dentro) => (dentro ? reivindicar() : liberar()), {
    immediate: true,
  })
  // A janela que perde o foco no meio de um W segurado não recebe o `keyup`:
  // ele vai para a janela que ganhou o foco. É o mesmo caso do `blur` abaixo
  // (RC-13), e tem o mesmo remédio.
  watch(ativo, (sim) => {
    if (!sim) soltarComandos()
  })

  function girar(dx, dy) {
    const p = Math.max(
      -Math.PI / 2 + FOLGA_DO_PITCH,
      Math.min(Math.PI / 2 - FOLGA_DO_PITCH, olhar.pitch() - dy),
    )
    olhar.definir(olhar.yaw() + dx, p)
  }

  // ── Teclado do navegador ──────────────────────────────────────────────────
  /**
   * Pede o bloqueio de teclado ao navegador. Silencioso quando nao existe: e
   * recurso de Chromium, e o jogo nao pode depender dele - o duplo-toque no W e
   * quem garante a corrida em toda parte.
   */
  async function travarTeclado() {
    try {
      if (!document.fullscreenElement || !navigator.keyboard?.lock) return false
      await navigator.keyboard.lock([...TECLAS_DO_JOGO])
      return true
    } catch {
      return false
    }
  }

  function soltarTeclado() {
    try {
      navigator.keyboard?.unlock?.()
    } catch {
      // Sem bloqueio pra soltar. Nao e erro: so nao havia o que soltar.
    }
  }

  function onFullscreenChange() {
    if (document.fullscreenElement) travarTeclado()
    else soltarTeclado()
  }

  // ── Teclado ───────────────────────────────────────────────────────────────
  function onKeyDown(e) {
    if (!ativo()) return
    if (telas.chatOpen.value) return
    // ⚠️ ANTES DE QUALQUER COISA: se a tecla e do jogo e o jogo esta em foco, o
    // navegador nao leva. Fora do jogo (menu, inventario, chat) o atalho do
    // navegador continua sendo do usuario - quem esta lendo um menu espera que
    // Ctrl+W feche a aba.
    if (noJogo() && TECLAS_DO_JOGO.has(e.code)) e.preventDefault()
    // ⚠️ O ESCAPE DESMONTA A PILHA, E NUNCA SAI DO JOGO.
    //
    // Esta cascata tinha a PRÓPRIA lista de telas — a quinta do arquivo — e
    // conhecia só inventário e lobby. Com o painel de criativo aberto ela caía
    // no `else` e abria o MENU DE PAUSA POR CIMA dele; o painel não fechava por
    // mais que se apertasse, e o jogador só via o menu com "Continuar" e
    // "Multijogador" aparecer, que lê como ter sido expulso do jogo. Foi assim
    // que o founder relatou: "o esc sobre esse menu está saindo do jogo".
    //
    // Agora quem sabe o que está aberto é `fecharTelaDoTopo`, na lista única. A
    // pausa só entra quando não há mais nada para fechar — e pausa é pausa, não
    // é sair: quem sai do jogo é o botão do menu, com o dedo do jogador.
    if (e.code === 'Escape') {
      e.preventDefault()
      if (!acoes.fecharTelaDoTopo()) acoes.alternarPausa()
      return
    }
    // Repeticao do sistema nao conta: a tecla ja esta valendo.
    if (teclas[e.code]) return
    teclas[e.code] = true

    if (e.code === 'KeyE') {
      e.preventDefault()
      acoes.alternarInventario()
      return
    }
    if (e.code === 'KeyT' && jogo.emRede()) {
      e.preventDefault()
      acoes.abrirChat()
      return
    }
    // ⚠️ ANTES DA GUARDA DE TELA ABERTA, e com a MESMA porta do E: o painel de
    // criativo é uma tela, e uma tela que não fecha na própria tecla é uma tela
    // que prende o jogador. `alternarCriativo` é quem decide se pode abrir —
    // fora do criativo ele avisa em vez de abrir, como o F faz com o voo.
    if (e.code === 'KeyK') {
      e.preventDefault()
      acoes.alternarCriativo()
      return
    }
    if (telas.inventoryOpen.value || telas.paused.value) return

    // DUPLO-TOQUE NO ESPACO liga/desliga o voo no criativo. O atalho existia so
    // no F, e F ninguem adivinha: o founder relatou "no criativo nao funciona o
    // voar" (2026-08-22) tentando o gesto do genero, que e este. O F fica.
    if (e.code === 'Space') {
      e.preventDefault()
      const agora = performance.now()
      if (jogo.modo() === 'creative' && ehDuploToque(ultimoEspaco, agora)) {
        acoes.alternarVoo()
        ultimoEspaco = 0
      } else ultimoEspaco = agora
    }
    if (e.code === 'KeyF') {
      if (jogo.modo() === 'creative') acoes.alternarVoo()
      else acoes.avisarSoCriativo()
    }
    if (e.code === 'KeyW') {
      // A regra (e a guarda do "nunca tocou") mora em `teclado.js`; o relogio e
      // daqui porque so a entrada tem o evento. E a janela e a MESMA do
      // duplo-espaco de proposito: dois gestos do mesmo tipo respondendo
      // diferente e o tipo de detalhe que ninguem consegue reportar.
      const agora = performance.now()
      if (ehDuploToque(ultimoW, agora)) correndoPorDuploToque = true
      ultimoW = agora
    }
    // ⚠️ A TECLA ESCREVE NO MESMO CAMPO QUE O CLIQUE NO MAPA, e nao num
    // estado proprio. Dois donos para "o mapa esta aberto" e o defeito que
    // aparece como "apertei M, nao aconteceu nada" depois de esconder o mapa
    // pelo toque -- e ninguem consegue reportar isso.
    if (e.code === 'KeyM') ajustes.minimapa = ajustes.minimapa === false
    if (e.code === 'KeyQ') acoes.largarDaMao()
    const n = Number(e.key)
    if (n >= 1 && n <= 9) acoes.selecionarSlot(n - 1)
  }

  function onKeyUp(e) {
    teclas[e.code] = false
    // Soltou o W, acabou a corrida por duplo-toque. Sem isto o jogador correria
    // pra sempre depois de um toque duplo distraido.
    if (e.code === 'KeyW') correndoPorDuploToque = false
  }

  // ── Mouse ─────────────────────────────────────────────────────────────────
  function onMouseMove(e) {
    posicaoDoMouse.x = e.clientX
    posicaoDoMouse.y = e.clientY
    if (!ponteiroTravado.value) return
    const s = SENSIBILIDADE_DO_MOUSE * ajustes.sensitivity
    girar(e.movementX * s, e.movementY * s)
  }

  function onMouseDown(e) {
    if (!ponteiroTravado.value) return
    if (e.button === 0) {
      // Bater vem ANTES de quebrar: com uma vaca na mira, o clique tem que
      // acertar a vaca, nao o bloco atras dela.
      if (!acoes.atacar()) {
        quebrando = true
        minerando = null
      }
    } else if (e.button === 1) {
      // Pick block. `preventDefault` porque o botao do meio rola a pagina.
      e.preventDefault()
      acoes.pegarBloco()
    } else if (e.button === 2) {
      if (!acoes.interagir()) {
        pressionarColocar(jogo.construcao)
        acoes.colocar()
      }
    }
  }

  function onMouseUp(e) {
    if (e.button === 0) {
      quebrando = false
      minerando = null
    } else if (e.button === 2) {
      soltarColocar(jogo.construcao)
      // O ARCO atira no SOLTAR: é o gesto que faz a carga existir. A GUARDA
      // baixa no soltar pelo mesmo motivo: segurar é o que a mantém.
      acoes.soltarArco?.(false)
      acoes.baixarGuarda?.()
    }
  }

  function onWheel(e) {
    if (!ponteiroTravado.value) return
    e.preventDefault()
    // ⚠️ `deltaY > 0 ? 1 : -1` mandava a roda PARADA para trás: o trackpad
    // fecha o gesto com um evento de deltaY ZERO, e o slot voltava um sem o
    // dedo ter mexido. Roda parada não escolhe slot nenhum.
    const d = Math.sign(e.deltaY)
    if (!d) return
    const n = jogo.slotsDaHotbar()
    acoes.selecionarSlot((jogo.slotAtual() + d + n) % n)
  }

  // ── Ponteiro travado ──────────────────────────────────────────────────────
  function requestLock() {
    try {
      acoes.destravarAudio()
      // ⚠️ O Chrome moderno devolve uma PROMESSA, e a recusa ("not valid for
      // pointer lock", gesto ausente, iframe sem permissão) chega como
      // rejeição — que o `try` não pega. Sem o `catch` era um erro de página
      // a cada Continuar recusado; a sonda do dragão o filmou.
      const r = alvo.canvas.value?.requestPointerLock?.()
      if (r && typeof r.catch === 'function') r.catch(() => {})
    } catch {
      /* alguns navegadores exigem gesto */
    }
  }

  function exitPointerLock() {
    if (document.pointerLockElement === alvo.canvas.value) document.exitPointerLock?.()
  }

  function onPointerLockChange() {
    ponteiroTravado.value = document.pointerLockElement === alvo.canvas.value
    // perder o lock (Esc do navegador) pausa, como manda o genero
    if (
      !ponteiroTravado.value &&
      !telas.inventoryOpen.value &&
      !telas.lobbyOpen.value &&
      !telas.loading.value &&
      !alvo.ehCelular.value
    ) {
      telas.paused.value = true
    }
  }

  // ── Toque ─────────────────────────────────────────────────────────────────
  function onStickMove(v) {
    direcional = v
  }

  // No celular o botao de colocar tambem repete enquanto segurado: no toque, um
  // bloco por toque e ainda pior que no mouse.
  function onMobilePlaceStart() {
    pressionarColocar(jogo.construcao)
    if (!acoes.interagir()) acoes.colocar()
  }

  function onMobilePlaceEnd() {
    soltarColocar(jogo.construcao)
    acoes.soltarArco?.(false)
    acoes.baixarGuarda?.()
  }

  function onMobileBreakStart() {
    if (!acoes.atacar()) quebrando = true
  }

  function onMobileBreakEnd() {
    quebrando = false
    minerando = null
  }

  let toqueLongo = null
  let inicioDoToque = { x: 0, y: 0 }

  function cancelarToqueLongo() {
    if (toqueLongo) clearTimeout(toqueLongo)
    toqueLongo = null
  }

  function onTouchStart(e) {
    // No celular NAO existe pointer lock, e era o `requestLock` que destravava o
    // audio. Resultado: o jogo inteiro rodava mudo no touch. O primeiro toque e
    // o gesto que o navegador exige - e aqui.
    acoes.destravarAudio()
    for (const tch of e.changedTouches) {
      if (tch.clientX < window.innerWidth * FAIXA_DO_DIRECIONAL) continue
      if (e.target?.closest?.(ALVOS_DE_HUD)) continue
      toqueDaMira = tch.identifier
      ultimoToque = { x: tch.clientX, y: tch.clientY }
      inicioDoToque = { x: tch.clientX, y: tch.clientY }
      cancelarToqueLongo()
      // Só no criativo: na sobrevivência o botão do meio também não faz nada.
      if (jogo.modo() === 'creative') {
        toqueLongo = setTimeout(() => {
          toqueLongo = null
          if (toqueDaMira !== null && noJogo()) acoes.pegarBloco()
        }, TOQUE_LONGO_MS)
      }
    }
  }

  function onTouchMove(e) {
    for (const tch of e.changedTouches) {
      if (tch.identifier !== toqueDaMira) continue
      const s = SENSIBILIDADE_DO_TOQUE * ajustes.sensitivity
      girar((tch.clientX - ultimoToque.x) * s, (tch.clientY - ultimoToque.y) * s)
      ultimoToque = { x: tch.clientX, y: tch.clientY }
      // Arrastou: é olhar, não segurar.
      if (
        Math.hypot(tch.clientX - inicioDoToque.x, tch.clientY - inicioDoToque.y) >
        FOLGA_DO_TOQUE_LONGO
      )
        cancelarToqueLongo()
    }
  }

  function onTouchEnd(e) {
    for (const tch of e.changedTouches) {
      if (tch.identifier !== toqueDaMira) continue
      toqueDaMira = null
      cancelarToqueLongo()
    }
  }

  /**
   * SOLTA TUDO QUE ESTAVA SEGURADO.
   *
   * ⚠️ ISTO EXISTE PORQUE O JOGADOR SAÍA ANDANDO SOZINHO (RC-13). O navegador
   * entrega `keydown` e nunca o `keyup` correspondente quando a janela perde o
   * foco no meio: alt-tab com o W apertado, e o W fica preso no mapa `teclas`
   * para sempre — o jogador volta ao jogo caminhando contra uma parede sem ter
   * mandado. O mesmo vale para o botão de quebrar e para o toque, que some sem
   * `touchend` quando chega uma ligação ou uma notificação.
   *
   * Não solta o teclado do navegador: isso é do desmonte, e soltá-lo aqui faria
   * o jogo perder a tecla Esc toda vez que alguém trocasse de aba.
   */
  function soltarComandos() {
    for (const k of Object.keys(teclas)) delete teclas[k]
    quebrando = false
    minerando = null
    toqueDaMira = null
    // O toque longo também é comando segurado: uma ligação no meio dele não
    // pode virar um pick block três segundos depois.
    cancelarToqueLongo()
    direcional = { x: 0, y: 0 }
    correndoPorDuploToque = false
    // A carga do arco também: a janela que perde o foco no meio não atira.
    acoes.soltarArco?.(true)
    acoes.baixarGuarda?.()
  }

  /** Só quando a aba SOME. `visible` chega ao voltar e não deve soltar nada. */
  function onVisibilityChange() {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') soltarComandos()
  }

  // ⚠️ ESTES TRÊS SÃO REGISTRADOS AQUI, e não no `.vue` como os outros. O
  // critério é a rule 44: quem tem ciclo de vida próprio mora no composable, e
  // estes existem para um evento que não é "o jogador mandou" — é "o jogador
  // sumiu". Deixá-los na fiação do componente é o tipo de linha que a próxima
  // extração leva embora sem ninguém notar, e o sintoma volta como "o jogo anda
  // sozinho", que ninguém liga a um listener faltando.
  if (typeof window !== 'undefined') {
    window.addEventListener('blur', soltarComandos)
    window.addEventListener('touchcancel', soltarComandos, { passive: true })
    window.addEventListener('pointercancel', soltarComandos, { passive: true })
    document.addEventListener('visibilitychange', onVisibilityChange)
  }

  /**
   * ⚠️ CHAMAR NO DESMONTE. Solta o teclado que foi travado no navegador; sem
   * isto, sair do jogo em tela cheia deixa Ctrl+W sequestrado.
   */
  function encerrar() {
    soltarTeclado()
    // ⚠️ DEVOLVE O TECLADO AO FECHAR. Sem esta linha, fechar a janela do jogo
    // deixava o registro com um dono morto e o desktop inteiro ficava sem
    // atalho nenhum até recarregar a página — um defeito bem pior que o que
    // este mecanismo conserta.
    liberar()
    soltarComandos()
    if (typeof window !== 'undefined') {
      window.removeEventListener('blur', soltarComandos)
      window.removeEventListener('touchcancel', soltarComandos)
      window.removeEventListener('pointercancel', soltarComandos)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }

  return {
    teclas,
    ponteiroTravado,
    posicaoDoMouse,
    minerando: () => minerando,
    definirMinerando: (v) => {
      minerando = v
    },
    quebrando: () => quebrando,
    direcional: () => direcional,
    correndo: () => correndoPorDuploToque,
    travarTeclado,
    soltarTeclado,
    onFullscreenChange,
    onKeyDown,
    onKeyUp,
    onMouseMove,
    onMouseDown,
    onMouseUp,
    onWheel,
    requestLock,
    exitPointerLock,
    onPointerLockChange,
    onStickMove,
    onMobilePlaceStart,
    onMobilePlaceEnd,
    onMobileBreakStart,
    onMobileBreakEnd,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    soltarComandos,
    encerrar,
    /** O jogo pediu o teclado ao host e não devolveu. Só o QA lê. */
    tecladoReivindicado: () => comOTeclado,
  }
}
