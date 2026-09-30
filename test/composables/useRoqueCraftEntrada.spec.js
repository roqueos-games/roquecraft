import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, reactive, nextTick } from 'vue'
import {
  useRoqueCraftEntrada,
  SENSIBILIDADE_DO_MOUSE,
  SENSIBILIDADE_DO_TOQUE,
  FOLGA_DO_PITCH,
  FAIXA_DO_DIRECIONAL,
  TOQUE_LONGO_MS,
  FOLGA_DO_TOQUE_LONGO,
} from '../../src/composables/useRoqueCraftEntrada.js'
import { criarConstrucao } from '../../src/servicos/construcao.js'

// ⚠️ A CAMADA DE ENTRADA NUNCA TEVE UM TESTE, e o motivo era o endereço: ela
// morava no componente, presa a `document`, ao canvas e a vinte variáveis de
// módulo. Depois de sair, ela virou o que sempre foi - uma função que traduz
// gesto em VERBO - e cada regra dela pode ser afirmada.
//
// O que se prova aqui já custou defeito ou quase:
//  - Ctrl+W é bloqueado DENTRO do jogo e liberado no menu (quem lê um menu
//    espera que Ctrl+W feche a aba)
//  - Escape fecha o inventário em vez de pausar, e o lobby antes de pausar
//  - duplo-espaço voa SÓ no criativo, e o primeiro espaço nunca é duplo
//  - o botão esquerdo BATE antes de quebrar (senão o clique na vaca cava o chão)
//  - o botão do meio impede a rolagem da página
//  - a mira do toque ignora a metade do direcional e os botões de HUD
//  - o pitch para antes do zênite

function montar(over = {}) {
  const chamadas = []
  const reg =
    (nome, r) =>
    (...a) => {
      chamadas.push([nome, ...a])
      return r
    }
  const telas = {
    menuOpen: ref(false),
    paused: ref(false),
    inventoryOpen: ref(false),
    lobbyOpen: ref(false),
    chatOpen: ref(false),
    loading: ref(false),
  }
  const olho = { yaw: 0, pitch: 0 }
  const canvas = ref({ requestPointerLock: vi.fn() })
  const e = useRoqueCraftEntrada({
    alvo: { canvas, ehCelular: ref(false) },
    ajustes: reactive({ sensitivity: 1 }),
    olhar: {
      yaw: () => olho.yaw,
      pitch: () => olho.pitch,
      definir: (y, p) => {
        olho.yaw = y
        olho.pitch = p
      },
    },
    telas,
    jogo: {
      modo: () => over.modo?.() ?? 'survival',
      construcao: criarConstrucao(),
      emRede: () => over.emRede?.() ?? false,
      slotAtual: () => over.slotAtual?.() ?? 0,
      slotsDaHotbar: () => 9,
      // A janela está em foco no RoqueOS? (`estado.ativo` do jogo-sdk)
      ativo: over.ativo,
    },
    acoes: {
      atacar: reg('atacar', over.atacarPega ?? false),
      interagir: reg('interagir', over.interagirPega ?? false),
      colocar: reg('colocar'),
      soltarArco: reg('soltarArco'),
      baixarGuarda: reg('baixarGuarda'),
      pegarBloco: reg('pegarBloco'),
      largarDaMao: reg('largarDaMao'),
      alternarInventario: reg('alternarInventario'),
      // ⚠️ AS DUAS PORTAS DA LISTA ÚNICA, e o dublê as liga às MESMAS refs de
      // tela — um dublê que sempre diz "não tem nada aberto" deixaria passar
      // exatamente o defeito que o founder viu: o Escape pausando por cima de
      // um painel. Ver `useRoqueCraftTelas`, que é quem manda de verdade.
      temTelaAberta: () =>
        !!(
          telas.menuOpen.value ||
          telas.paused.value ||
          telas.inventoryOpen.value ||
          telas.lobbyOpen.value
        ),
      fecharTelaDoTopo: (...a) => {
        chamadas.push(['fecharTelaDoTopo', ...a])
        for (const r of [telas.inventoryOpen, telas.lobbyOpen]) {
          if (r.value) {
            r.value = false
            return true
          }
        }
        return false
      },
      alternarPausa: reg('alternarPausa'),
      alternarVoo: reg('alternarVoo'),
      selecionarSlot: reg('selecionarSlot'),
      abrirChat: reg('abrirChat'),
      destravarAudio: reg('destravarAudio'),
      avisarSoCriativo: reg('avisarSoCriativo'),
    },
    ...over.ctx,
  })
  const verbos = () => chamadas.map((c) => c[0])
  return { e, telas, olho, canvas, chamadas, verbos }
}

const tecla = (code, extra = {}) => ({ code, key: extra.key ?? '', preventDefault: vi.fn() })

beforeEach(() => {
  // `performance.now()` anda de verdade no vitest; os testes de duplo-toque
  // controlam o tempo com um espião pra não depender do relógio da máquina.
  vi.restoreAllMocks()
})

describe('useRoqueCraftEntrada', () => {
  // ── Teclado ──────────────────────────────────────────────────────────────
  it('rouba a tecla do navegador DENTRO do jogo, e devolve no menu', () => {
    const { e, telas } = montar()
    const dentro = tecla('KeyW')
    e.onKeyDown(dentro)
    expect(dentro.preventDefault, 'o navegador levou o W do jogo').toHaveBeenCalled()

    // No menu o atalho volta a ser do usuário.
    e.onKeyUp(tecla('KeyW'))
    telas.menuOpen.value = true
    const noMenu = tecla('KeyW')
    e.onKeyDown(noMenu)
    expect(noMenu.preventDefault, 'quem lê um menu perdeu o Ctrl+W').not.toHaveBeenCalled()
  })

  // ── O MINIMAPA ───────────────────────────────────────────────────────────
  //
  // ⚠️ A TECLA ESCREVE NO MESMO CAMPO QUE O CLIQUE NO MAPA. Dois donos para "o
  // mapa está aberto" — um estado no componente e outro nos ajustes — é o
  // defeito que sai como "apertei M e não aconteceu nada" depois de esconder o
  // mapa pelo toque, e ninguém consegue reportar isso.
  it('M liga e desliga o minimapa nos AJUSTES', () => {
    const ajustes = reactive({ sensitivity: 1 })
    const { e } = montar({ ctx: { ajustes } })
    // Ausência é LIGADO (mesma regra de `ajustes.js`), então o primeiro M apaga.
    e.onKeyDown(tecla('KeyM'))
    expect(ajustes.minimapa, 'o primeiro M não escondeu o mapa').toBe(false)
    e.onKeyUp(tecla('KeyM'))
    e.onKeyDown(tecla('KeyM'))
    expect(ajustes.minimapa, 'o segundo M não trouxe o mapa de volta').toBe(true)
  })

  it('M é roubado do navegador dentro do jogo', () => {
    // Sem estar em `TECLAS_DO_JOGO`, o M continuaria valendo como atalho do
    // navegador por baixo do jogo.
    const { e } = montar()
    const m = tecla('KeyM')
    e.onKeyDown(m)
    expect(m.preventDefault.mock.calls, 'o navegador levou o M do jogo').toEqual([[]])
  })

  it('M não mexe no mapa com o inventário aberto', () => {
    const ajustes = reactive({ sensitivity: 1 })
    const { e, telas } = montar({ ctx: { ajustes } })
    telas.inventoryOpen.value = true
    e.onKeyDown(tecla('KeyM'))
    expect(ajustes.minimapa).toBeUndefined()
  })

  it('tecla que não é do jogo nunca é roubada', () => {
    const { e } = montar()
    const l = tecla('KeyL')
    e.onKeyDown(l)
    expect(l.preventDefault).not.toHaveBeenCalled()
  })

  it('com o chat aberto o teclado é todo do chat', () => {
    const { e, telas, verbos } = montar()
    telas.chatOpen.value = true
    e.onKeyDown(tecla('KeyE'))
    e.onKeyDown(tecla('Escape'))
    expect(verbos(), 'a tecla vazou do chat pro jogo').toEqual([])
    expect(e.teclas.KeyE).toBeUndefined()
  })

  // GOAL 23, ONDA 4: o painel de criativo ganhou campos de texto (a coordenada).
  it('⚠️ digitando num campo, a tecla é do campo: o 1 não é slot, o E não é inventário', () => {
    const { e, telas, verbos } = montar()
    telas.inventoryOpen.value = true // uma tela aberta, como o painel de criativo
    const campo = { tagName: 'INPUT', getAttribute: () => 'text' }
    const um = { ...tecla('Digit1', { key: '1' }), target: campo }
    e.onKeyDown(um)
    e.onKeyDown({ ...tecla('KeyE'), target: campo })
    e.onKeyDown({ ...tecla('KeyF'), target: campo })
    expect(verbos(), 'a tecla vazou do campo para o jogo').toEqual([])
    expect(um.preventDefault, 'roubou o dígito de quem digitava').not.toHaveBeenCalled()
    // O Escape continua sendo da tela: fecha o painel de cima.
    e.onKeyDown({ ...tecla('Escape'), target: campo })
    expect(verbos()).toEqual(['fecharTelaDoTopo'])
    // E fora do campo o mesmo E abre o inventário, como sempre.
    e.onKeyDown({ ...tecla('KeyE'), target: { tagName: 'CANVAS', getAttribute: () => null } })
    expect(verbos()).toContain('alternarInventario')
  })

  it('⚠️ Escape desmonta a pilha uma tela por vez, e SÓ pausa no vazio', () => {
    // A queixa do founder (16/09): com o painel do criativo aberto, o Escape
    // abria a PAUSA POR CIMA dele e o painel nunca fechava. A entrada não
    // enumera mais tela nenhuma: ela pergunta, e só pausa quando a resposta é
    // "não fechei nada".
    const { e, telas, verbos } = montar()
    telas.inventoryOpen.value = true
    e.onKeyDown(tecla('Escape'))
    expect(verbos()).toEqual(['fecharTelaDoTopo'])
    expect(telas.inventoryOpen.value, 'o Escape não fechou o inventário').toBe(false)

    telas.lobbyOpen.value = true
    e.onKeyDown(tecla('Escape'))
    expect(verbos(), 'pausou com tela aberta — o defeito do founder').toEqual([
      'fecharTelaDoTopo',
      'fecharTelaDoTopo',
    ])

    e.onKeyDown(tecla('Escape'))
    expect(verbos().at(-1), 'com a pilha vazia o Escape tem que pausar').toBe('alternarPausa')
  })

  it('⚠️ o Escape JAMAIS sai do jogo', () => {
    // "o esc jamais deve sair do jogo" — palavras do founder. Sair é `enterMenu`
    // e ele não está entre os verbos que o Escape pode disparar, em nenhum dos
    // dois estados.
    for (const comTela of [true, false]) {
      const { e, telas, verbos } = montar()
      telas.inventoryOpen.value = comTela
      e.onKeyDown(tecla('Escape'))
      expect(verbos(), `saiu do jogo com tela ${comTela ? 'aberta' : 'fechada'}`).not.toContain(
        'sairDoJogo',
      )
      expect(verbos()).not.toContain('enterMenu')
    }
  })

  it('a repetição do sistema não redispara a ação', () => {
    const { e, verbos } = montar()
    e.onKeyDown(tecla('KeyE'))
    e.onKeyDown(tecla('KeyE'))
    e.onKeyDown(tecla('KeyE'))
    expect(verbos(), 'segurar E abriu e fechou o inventário sem parar').toEqual([
      'alternarInventario',
    ])
    e.onKeyUp(tecla('KeyE'))
    e.onKeyDown(tecla('KeyE'))
    expect(verbos().length).toBe(2)
  })

  it('T só abre o chat em rede', () => {
    const solo = montar()
    solo.e.onKeyDown(tecla('KeyT'))
    expect(solo.verbos()).toEqual([])

    const rede = montar({ emRede: () => true })
    rede.e.onKeyDown(tecla('KeyT'))
    expect(rede.verbos()).toEqual(['abrirChat'])
  })

  it('com o inventário aberto, as teclas de JOGO param', () => {
    const { e, telas, verbos } = montar()
    telas.inventoryOpen.value = true
    e.onKeyDown(tecla('KeyQ'))
    e.onKeyDown(tecla('KeyF'))
    e.onKeyDown(tecla('Digit3', { key: '3' }))
    expect(verbos(), 'a tecla do jogo atravessou a tela de inventário').toEqual([])
  })

  it('F voa no criativo e AVISA na sobrevivência', () => {
    const criativo = montar({ modo: () => 'creative' })
    criativo.e.onKeyDown(tecla('KeyF'))
    expect(criativo.verbos()).toEqual(['alternarVoo'])

    const sobrevivencia = montar()
    sobrevivencia.e.onKeyDown(tecla('KeyF'))
    // Silêncio aqui seria lido como "a tecla não funciona".
    expect(sobrevivencia.verbos()).toEqual(['avisarSoCriativo'])
  })

  it('duplo-espaço voa no criativo, e o PRIMEIRO espaço nunca conta', () => {
    let agora = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => agora)
    const { e, verbos } = montar({ modo: () => 'creative' })

    // ⚠️ O primeiro espaço da sessão não pode voar. Com a guarda do "nunca
    // tocou" ausente, `agora - 0 < 320` seria verdade num relógio que começa
    // perto de zero e o jogador decolaria sozinho.
    agora = 100
    e.onKeyDown(tecla('Space'))
    expect(verbos(), 'o primeiro espaço decolou sozinho').toEqual([])

    e.onKeyUp(tecla('Space'))
    agora = 200
    e.onKeyDown(tecla('Space'))
    expect(verbos()).toEqual(['alternarVoo'])
  })

  it('dois espaços LENTOS não voam', () => {
    let agora = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => agora)
    const { e, verbos } = montar({ modo: () => 'creative' })
    e.onKeyDown(tecla('Space'))
    e.onKeyUp(tecla('Space'))
    agora = 5000
    e.onKeyDown(tecla('Space'))
    expect(verbos()).toEqual([])
  })

  it('duplo-espaço NÃO voa na sobrevivência', () => {
    let agora = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => agora)
    const { e, verbos } = montar()
    e.onKeyDown(tecla('Space'))
    e.onKeyUp(tecla('Space'))
    agora = 1100
    e.onKeyDown(tecla('Space'))
    expect(verbos(), 'voou na sobrevivência').toEqual([])
  })

  it('duplo-toque no W corre, e soltar o W para a corrida', () => {
    let agora = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => agora)
    const { e } = montar()
    e.onKeyDown(tecla('KeyW'))
    expect(e.correndo(), 'o primeiro W já saiu correndo').toBe(false)
    e.onKeyUp(tecla('KeyW'))
    agora = 1100
    e.onKeyDown(tecla('KeyW'))
    expect(e.correndo()).toBe(true)
    // Sem isto o jogador correria pra sempre depois de um toque duplo distraído.
    e.onKeyUp(tecla('KeyW'))
    expect(e.correndo()).toBe(false)
  })

  it('os números escolhem o slot, de 1..9 para 0..8', () => {
    const { e, chamadas } = montar()
    e.onKeyDown(tecla('Digit1', { key: '1' }))
    e.onKeyUp(tecla('Digit1'))
    e.onKeyDown(tecla('Digit9', { key: '9' }))
    expect(chamadas.filter((c) => c[0] === 'selecionarSlot').map((c) => c[1])).toEqual([0, 8])
  })

  // ⚠️ `e.deltaY > 0 ? 1 : -1` sobrevivia a `>=`, e as duas versões erram no
  // ZERO: o trackpad fecha o gesto com um evento de deltaY zero, e o slot
  // andava um sem o dedo ter mexido (para trás com `>`, para frente com `>=`).
  // Roda parada não escolhe slot nenhum.
  it('a roda escolhe slot para os dois lados, e roda PARADA não escolhe nada', () => {
    const { e, chamadas } = montar({ slotAtual: () => 3 })
    e.ponteiroTravado.value = true
    const escolhidos = () => chamadas.filter((c) => c[0] === 'selecionarSlot').map((c) => c[1])

    e.onWheel({ deltaY: 0, preventDefault: vi.fn() })
    expect(escolhidos(), 'a roda parada mexeu no slot').toEqual([])

    e.onWheel({ deltaY: 120, preventDefault: vi.fn() })
    e.onWheel({ deltaY: -120, preventDefault: vi.fn() })
    expect(escolhidos()).toEqual([4, 2])
  })

  it('a roda dá a volta na hotbar em vez de sair dela', () => {
    const noFim = montar({ slotAtual: () => 8 })
    noFim.e.ponteiroTravado.value = true
    noFim.e.onWheel({ deltaY: 120, preventDefault: vi.fn() })

    const noComeco = montar({ slotAtual: () => 0 })
    noComeco.e.ponteiroTravado.value = true
    noComeco.e.onWheel({ deltaY: -120, preventDefault: vi.fn() })

    expect(noFim.chamadas.filter((c) => c[0] === 'selecionarSlot').map((c) => c[1])).toEqual([0])
    expect(noComeco.chamadas.filter((c) => c[0] === 'selecionarSlot').map((c) => c[1])).toEqual([8])
  })

  it('sem o ponteiro travado a roda é do navegador', () => {
    const { e, chamadas } = montar()
    const preventDefault = vi.fn()
    e.onWheel({ deltaY: 120, preventDefault })
    expect(preventDefault).not.toHaveBeenCalled()
    expect(chamadas.filter((c) => c[0] === 'selecionarSlot')).toEqual([])
  })

  it('o mapa de teclas é o MESMO objeto que o laço de física lê', () => {
    const { e } = montar()
    e.onKeyDown(tecla('KeyA'))
    expect(e.teclas.KeyA).toBe(true)
    e.onKeyUp(tecla('KeyA'))
    expect(e.teclas.KeyA).toBe(false)
  })

  // ── Mouse ────────────────────────────────────────────────────────────────
  it('sem ponteiro travado, mouse não mexe em nada', () => {
    const { e, olho, verbos } = montar()
    e.onMouseMove({ clientX: 5, clientY: 6, movementX: 100, movementY: 100 })
    expect(olho).toEqual({ yaw: 0, pitch: 0 })
    // ...mas a posição do cursor é registrada mesmo assim (o HUD usa).
    expect(e.posicaoDoMouse).toMatchObject({ x: 5, y: 6 })
    e.onMouseDown({ button: 0, preventDefault: vi.fn() })
    expect(verbos()).toEqual([])
  })

  it('o botão esquerdo BATE antes de quebrar', () => {
    // Com uma vaca na mira, o clique tem que acertar a vaca, não o bloco atrás.
    const pega = montar({ atacarPega: true })
    pega.e.onPointerLockChange.call(null)
    pega.e.ponteiroTravado.value = true
    pega.e.onMouseDown({ button: 0, preventDefault: vi.fn() })
    expect(pega.verbos()).toEqual(['atacar'])
    expect(pega.e.quebrando(), 'atacou E começou a cavar o chão').toBe(false)

    const vazio = montar()
    vazio.e.ponteiroTravado.value = true
    vazio.e.onMouseDown({ button: 0, preventDefault: vi.fn() })
    expect(vazio.e.quebrando()).toBe(true)
  })

  it('o botão do meio pega o bloco e impede a rolagem', () => {
    const { e, verbos } = montar()
    e.ponteiroTravado.value = true
    const ev = { button: 1, preventDefault: vi.fn() }
    e.onMouseDown(ev)
    expect(verbos()).toEqual(['pegarBloco'])
    expect(ev.preventDefault, 'a página rolou junto com o pick block').toHaveBeenCalled()
  })

  it('o botão direito interage antes de colocar', () => {
    const pega = montar({ interagirPega: true })
    pega.e.ponteiroTravado.value = true
    pega.e.onMouseDown({ button: 2, preventDefault: vi.fn() })
    expect(pega.verbos(), 'colocou um cubo dentro do baú').toEqual(['interagir'])

    const vazio = montar()
    vazio.e.ponteiroTravado.value = true
    vazio.e.onMouseDown({ button: 2, preventDefault: vi.fn() })
    expect(vazio.verbos()).toEqual(['interagir', 'colocar'])
  })

  it('⚠️ a recusa do pointer lock (promessa rejeitada) não vira erro de página', async () => {
    const { e, canvas } = montar()
    let tratou = false
    canvas.value.requestPointerLock = () => ({
      catch: (fn) => {
        tratou = typeof fn === 'function'
      },
    })
    e.requestLock()
    expect(tratou, 'a promessa do pointer lock ficou sem catch').toBe(true)
    // E quem devolve nada (navegador antigo) continua funcionando.
    canvas.value.requestPointerLock = () => undefined
    expect(() => e.requestLock()).not.toThrow()
  })

  it('⚠️ o arco atira no SOLTAR do direito, do botão de colocar do celular, e cancela na perda de foco', () => {
    const { e, chamadas } = montar()
    e.ponteiroTravado.value = true
    e.onMouseUp({ button: 2 })
    e.onMobilePlaceEnd()
    e.soltarComandos()
    expect(chamadas.filter((c) => c[0] === 'soltarArco')).toEqual([
      ['soltarArco', false],
      ['soltarArco', false],
      ['soltarArco', true],
    ])
    // Soltar o ESQUERDO não atira.
    e.onMouseUp({ button: 0 })
    expect(chamadas.filter((c) => c[0] === 'soltarArco')).toHaveLength(3)
    // A GUARDA baixa nos mesmos três lugares — e não no esquerdo.
    expect(chamadas.filter((c) => c[0] === 'baixarGuarda')).toHaveLength(3)
  })

  it('soltar o esquerdo para de cavar', () => {
    const { e } = montar()
    e.ponteiroTravado.value = true
    e.onMouseDown({ button: 0, preventDefault: vi.fn() })
    expect(e.quebrando()).toBe(true)
    e.onMouseUp({ button: 0 })
    expect(e.quebrando()).toBe(false)
    expect(e.minerando()).toBe(null)
  })

  it('a roda anda pela hotbar em círculo', () => {
    const { e, chamadas } = montar({ slotAtual: () => 8 })
    e.ponteiroTravado.value = true
    e.onWheel({ deltaY: 1, preventDefault: vi.fn() })
    expect(chamadas.at(-1)).toEqual(['selecionarSlot', 0])

    const zero = montar({ slotAtual: () => 0 })
    zero.e.ponteiroTravado.value = true
    zero.e.onWheel({ deltaY: -1, preventDefault: vi.fn() })
    expect(zero.chamadas.at(-1)).toEqual(['selecionarSlot', 8])
  })

  it('o mouse gira com a sensibilidade do ajuste, e o pitch para antes do zênite', () => {
    const { e, olho } = montar()
    e.ponteiroTravado.value = true
    e.onMouseMove({ clientX: 0, clientY: 0, movementX: 10, movementY: 0 })
    expect(olho.yaw).toBeCloseTo(10 * SENSIBILIDADE_DO_MOUSE, 8)

    // Olhar pra cima sem parar viraria a câmera de cabeça pra baixo.
    for (let i = 0; i < 200; i++)
      e.onMouseMove({ clientX: 0, clientY: 0, movementX: 0, movementY: -100 })
    expect(olho.pitch).toBeCloseTo(Math.PI / 2 - FOLGA_DO_PITCH, 6)
    for (let i = 0; i < 400; i++)
      e.onMouseMove({ clientX: 0, clientY: 0, movementX: 0, movementY: 100 })
    expect(olho.pitch).toBeCloseTo(-Math.PI / 2 + FOLGA_DO_PITCH, 6)
  })

  // ── Toque ────────────────────────────────────────────────────────────────
  it('o primeiro toque destrava o áudio (no celular não há pointer lock)', () => {
    const { e, verbos } = montar()
    e.onTouchStart({ changedTouches: [], target: null })
    expect(verbos(), 'o jogo inteiro rodaria mudo no celular').toEqual(['destravarAudio'])
  })

  it('a mira do toque ignora a metade do direcional', () => {
    const { e, olho } = montar()
    const esquerda = window.innerWidth * FAIXA_DO_DIRECIONAL - 10
    e.onTouchStart({ changedTouches: [{ identifier: 1, clientX: esquerda, clientY: 100 }] })
    e.onTouchMove({ changedTouches: [{ identifier: 1, clientX: esquerda + 200, clientY: 100 }] })
    expect(olho.yaw, 'andar com o direcional virou a câmera junto').toBe(0)
  })

  it('a mira do toque ignora os botões de HUD', () => {
    const { e, olho } = montar()
    const direita = window.innerWidth * 0.9
    e.onTouchStart({
      changedTouches: [{ identifier: 1, clientX: direita, clientY: 100 }],
      target: { closest: () => ({}) },
    })
    e.onTouchMove({ changedTouches: [{ identifier: 1, clientX: direita - 200, clientY: 100 }] })
    expect(olho.yaw, 'apertar o botão de pular arrastou a câmera').toBe(0)
  })

  // ── TOQUE LONGO NA MIRA = PICK BLOCK ─────────────────────────────────────

  it('⚠️ segurar o dedo na mira, no criativo, pega o bloco (o botão do meio do toque)', () => {
    vi.useFakeTimers()
    const { e, verbos } = montar({ modo: () => 'creative' })
    const direita = window.innerWidth * 0.9
    e.onTouchStart({
      changedTouches: [{ identifier: 3, clientX: direita, clientY: 100 }],
      target: { closest: () => null },
    })
    vi.advanceTimersByTime(TOQUE_LONGO_MS - 1)
    expect(verbos(), 'pegou antes de completar o tempo').not.toContain('pegarBloco')
    vi.advanceTimersByTime(2)
    expect(verbos()).toContain('pegarBloco')
    vi.useRealTimers()
  })

  it('arrastar o dedo é olhar, não segurar: cancela o pick block', () => {
    vi.useFakeTimers()
    const { e, verbos } = montar({ modo: () => 'creative' })
    const direita = window.innerWidth * 0.9
    e.onTouchStart({
      changedTouches: [{ identifier: 3, clientX: direita, clientY: 100 }],
      target: { closest: () => null },
    })
    e.onTouchMove({
      changedTouches: [
        { identifier: 3, clientX: direita + FOLGA_DO_TOQUE_LONGO + 5, clientY: 100 },
      ],
    })
    vi.advanceTimersByTime(TOQUE_LONGO_MS + 50)
    expect(verbos(), 'olhar em volta virou pick block').not.toContain('pegarBloco')
    vi.useRealTimers()
  })

  it('soltar antes do tempo não pega nada, e na sobrevivência nunca pega', () => {
    vi.useFakeTimers()
    const direita = window.innerWidth * 0.9
    const a = montar({ modo: () => 'creative' })
    a.e.onTouchStart({
      changedTouches: [{ identifier: 3, clientX: direita, clientY: 100 }],
      target: { closest: () => null },
    })
    a.e.onTouchEnd({ changedTouches: [{ identifier: 3 }] })
    vi.advanceTimersByTime(TOQUE_LONGO_MS + 50)
    expect(a.verbos()).not.toContain('pegarBloco')

    const b = montar({ modo: () => 'survival' })
    b.e.onTouchStart({
      changedTouches: [{ identifier: 3, clientX: direita, clientY: 100 }],
      target: { closest: () => null },
    })
    vi.advanceTimersByTime(TOQUE_LONGO_MS + 50)
    expect(b.verbos(), 'a sobrevivência não tem pick block').not.toContain('pegarBloco')
    vi.useRealTimers()
  })

  it('o toque da direita vira mira, e soltar encerra o gesto', () => {
    const { e, olho } = montar()
    const direita = window.innerWidth * 0.9
    e.onTouchStart({
      changedTouches: [{ identifier: 7, clientX: direita, clientY: 100 }],
      target: { closest: () => null },
    })
    e.onTouchMove({ changedTouches: [{ identifier: 7, clientX: direita + 10, clientY: 100 }] })
    expect(olho.yaw).toBeCloseTo(10 * SENSIBILIDADE_DO_TOQUE, 8)

    e.onTouchEnd({ changedTouches: [{ identifier: 7 }] })
    const antes = olho.yaw
    e.onTouchMove({ changedTouches: [{ identifier: 7, clientX: direita + 500, clientY: 100 }] })
    expect(olho.yaw, 'o dedo já tinha saído e a câmera continuou girando').toBe(antes)
  })

  it('o direcional do celular chega inteiro no laço', () => {
    const { e } = montar()
    e.onStickMove({ x: 0.5, y: -1 })
    expect(e.direcional()).toEqual({ x: 0.5, y: -1 })
  })

  it('os botões de celular respeitam a mesma ordem do mouse', () => {
    const pega = montar({ interagirPega: true })
    pega.e.onMobilePlaceStart()
    expect(pega.verbos()).toEqual(['interagir'])

    const vazio = montar()
    vazio.e.onMobilePlaceStart()
    expect(vazio.verbos()).toEqual(['interagir', 'colocar'])

    const bate = montar({ atacarPega: true })
    bate.e.onMobileBreakStart()
    expect(bate.e.quebrando(), 'bateu na vaca E começou a cavar').toBe(false)
  })

  // ── Ciclo de vida ────────────────────────────────────────────────────────
  it('encerrar solta as teclas e o gesto em andamento', () => {
    const { e } = montar()
    e.onKeyDown(tecla('KeyW'))
    e.ponteiroTravado.value = true
    e.onMouseDown({ button: 0, preventDefault: vi.fn() })
    expect(e.quebrando()).toBe(true)

    e.encerrar()
    // Sem isto, sair do jogo com o W apertado deixa o jogador andando no menu.
    expect(e.teclas.KeyW).toBeUndefined()
    expect(e.quebrando()).toBe(false)
    expect(e.correndo()).toBe(false)
  })
})

// ── O TECLADO DO HOST E A JANELA ATIVA (extração para o jogo-sdk) ────────────
//
// Até a extração a entrada importava o `focoDoTeclado` do RoqueOS e ouvia o
// teclado da página inteira, com a janela em foco ou não. Agora ela pede o
// teclado ao host (`host.teclado`, opcional) e só a janela ativa ouve.
describe('o teclado do host e a janela ativa', () => {
  const tecladoFalso = () => ({ reivindicar: vi.fn(), liberar: vi.fn() })

  it('no jogo pede o teclado ao host; menu, inventário e pausa devolvem', async () => {
    const teclado = tecladoFalso()
    const { e, telas } = montar({ ctx: { teclado } })
    expect(teclado.reivindicar).toHaveBeenCalledTimes(1)
    expect(e.tecladoReivindicado()).toBe(true)
    telas.menuOpen.value = true
    await nextTick()
    expect(teclado.liberar).toHaveBeenCalledTimes(1)
    expect(e.tecladoReivindicado()).toBe(false)
    telas.menuOpen.value = false
    await nextTick()
    expect(teclado.reivindicar).toHaveBeenCalledTimes(2)
  })

  it('desmontar devolve o teclado ao host', () => {
    const teclado = tecladoFalso()
    const { e } = montar({ ctx: { teclado } })
    e.encerrar()
    expect(teclado.liberar).toHaveBeenCalled()
    expect(e.tecladoReivindicado()).toBe(false)
  })

  it('sem `teclado` no host (ele é opcional), a entrada funciona igual', () => {
    const { e, verbos } = montar()
    e.onKeyDown(tecla('KeyE'))
    expect(verbos()).toContain('alternarInventario')
    expect(() => e.encerrar()).not.toThrow()
  })

  it('só a janela ATIVA ouve o teclado, e a que perde o foco solta o que estava seguro', async () => {
    const ativa = ref(false)
    const teclado = tecladoFalso()
    const { e, verbos } = montar({ ativo: () => ativa.value, ctx: { teclado } })
    // Atrás de outra janela: nem pede o teclado, nem ouve, nem rouba do navegador.
    expect(teclado.reivindicar).not.toHaveBeenCalled()
    const w = tecla('KeyW')
    e.onKeyDown(w)
    e.onKeyDown(tecla('KeyE'))
    expect(w.preventDefault).not.toHaveBeenCalled()
    expect(e.teclas.KeyW).toBeUndefined()
    expect(verbos()).toEqual([])

    ativa.value = true
    await nextTick()
    expect(teclado.reivindicar).toHaveBeenCalledTimes(1)
    e.onKeyDown(tecla('KeyW'))
    expect(e.teclas.KeyW).toBe(true)

    // Perdeu o foco com o W apertado: o keyup vai para a outra janela.
    const liberadas = teclado.liberar.mock.calls.length
    ativa.value = false
    await nextTick()
    expect(e.teclas.KeyW, 'o jogador sai andando sozinho').toBeUndefined()
    expect(teclado.liberar).toHaveBeenCalledTimes(liberadas + 1)
    expect(e.tecladoReivindicado()).toBe(false)
  })
})
