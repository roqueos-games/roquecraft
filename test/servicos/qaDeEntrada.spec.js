import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { criarQaDeEntrada } from '../../src/servicos/qaDeEntrada.js'
import { BLOCK_BY_KEY, AIR } from '../../src/servicos/blocks.js'

// ⚠️ O QUE ESTE MÓDULO NÃO PODE PERDER NA MUDANÇA DE ENDEREÇO.
//
// Ele existe porque o pointer lock não engata em headless, e cada método aqui é
// uma porta que entra DEPOIS da trava e exercita o resto do caminho de verdade.
// Se um deles virar atalho - escrever no mundo em vez de chamar `breakBlock`,
// por exemplo - a sonda continua verde e para de testar o jogo.
//
// Os riscos concretos da extração:
// 1. `keys` tem que ser o MESMO mapa que o teclado alimenta. Uma cópia deixaria
//    a sonda "segurando" uma tecla que o laço do quadro nunca lê.
// 2. `yaw` e `world` são `let` do componente: getters.
// 3. `breakNow` tem que RECUSAR ar e bloco inquebrável. Sem isso a sonda
//    "quebraria" o ar e concluiria que quebrar funciona.

function contexto(over = {}) {
  const keys = {}
  const construcao = { pressionado: false }
  let world = { getBlock: () => BLOCK_BY_KEY.stone.id, setPlayerPosition() {} }
  const player = { x: 0, y: 64, z: 0, vy: 5 }
  let yaw = 0
  const flying = ref(false)
  const quebrados = []
  const colocados = []
  const interacoes = []
  const gestos = []
  const ctx = {
    keys,
    construcao,
    entrada: () => ({
      onMobilePlaceStart: () => {
        construcao.pressionado = true
        colocados.push(1)
        gestos.push('place-start')
      },
      onMobilePlaceEnd: () => {
        construcao.pressionado = false
        gestos.push('place-end')
      },
      onMobileBreakStart: () => gestos.push('break-start'),
      onMobileBreakEnd: () => gestos.push('break-end'),
    }),
    world: () => world,
    player,
    yaw: () => yaw,
    flying,
    currentTarget: () => ({ hit: { x: 1, y: 2, z: 3 } }),
    doPlace: () => {
      colocados.push(1)
      return true
    },
    tryInteract: () => interacoes.push(1),
    breakBlock: (x, y, z, id) => quebrados.push([x, y, z, id]),
    ...over,
  }
  return {
    qa: criarQaDeEntrada(ctx),
    keys,
    construcao,
    player,
    flying,
    quebrados,
    gestos,
    colocados,
    interacoes,
    girar: (v) => {
      yaw = v
    },
    trocarMundo: (w) => {
      world = w
    },
  }
}

describe('qaDeEntrada', () => {
  it('press escreve no MESMO mapa que o teclado alimenta', () => {
    const { qa, keys } = contexto()
    expect(qa.press('forward')).toBe('KeyW')
    expect(keys.KeyW, 'a tecla foi parar numa cópia').toBe(true)
    qa.press('forward', false)
    expect(keys.KeyW).toBe(false)
    // Ação desconhecida passa direto como código - é assim que a sonda usa
    // teclas que não têm nome de ação.
    expect(qa.press('KeyQ')).toBe('KeyQ')
    expect(keys.KeyQ).toBe(true)
  })

  it('press traduz as sete ações e teclar escreve o código cru', () => {
    const { qa, keys } = contexto()
    const esperado = {
      forward: 'KeyW',
      back: 'KeyS',
      left: 'KeyA',
      right: 'KeyD',
      jump: 'Space',
      sneak: 'ShiftLeft',
      sprint: 'ControlLeft',
    }
    for (const [acao, code] of Object.entries(esperado)) expect(qa.press(acao)).toBe(code)
    expect(qa.teclar('ShiftLeft', true)).toBe(true)
    expect(keys.ShiftLeft).toBe(true)
    expect(qa.teclar('ShiftLeft', false)).toBe(false)
  })

  it('breakNow recusa ar e bloco inquebrável, e quebra o resto', () => {
    const semAlvo = contexto({ currentTarget: () => null }).qa
    expect(semAlvo.breakNow()).toBe(false)

    const noAr = contexto({ world: () => ({ getBlock: () => AIR }) })
    expect(noAr.qa.breakNow(), 'a sonda "quebrou" o ar').toBe(false)
    expect(noAr.quebrados.length).toBe(0)

    const naBedrock = contexto({ world: () => ({ getBlock: () => BLOCK_BY_KEY.bedrock.id }) })
    expect(naBedrock.qa.breakNow(), 'quebrou o inquebrável').toBe(false)

    const naPedra = contexto()
    expect(naPedra.qa.breakNow()).toBe(true)
    // CONTROLE: quebrou pelo caminho DO JOGO, com a coordenada do raycast.
    expect(naPedra.quebrados[0]).toEqual([1, 2, 3, BLOCK_BY_KEY.stone.id])
  })

  it('segurarColocar vai pelo BOTÃO DO CELULAR: apertar coloca, largar solta (e é onde o arco atira)', () => {
    const { qa, colocados, construcao, gestos } = contexto()
    expect(qa.segurarColocar(true)).toBe(true)
    expect(colocados.length).toBe(1)
    expect(construcao.pressionado).toBe(true)
    expect(qa.segurarColocar(false)).toBe(false)
    expect(colocados.length, 'soltar colocou um bloco a mais').toBe(1)
    expect(gestos).toEqual(['place-start', 'place-end'])
  })

  it('miraEm devolve a coordenada do raycast e a chave do mundo VIVO', () => {
    const { qa, trocarMundo } = contexto()
    expect(qa.miraEm()).toEqual({ x: 1, y: 2, z: 3, chave: 'stone' })
    trocarMundo({ getBlock: () => BLOCK_BY_KEY.dirt.id, setPlayerPosition() {} })
    expect(qa.miraEm().chave, 'ficou preso no mundo morto').toBe('dirt')
    const semAlvo = contexto({ currentTarget: () => null }).qa
    expect(semAlvo.miraEm()).toBe(null)
  })

  it('dolly recua na direção do olhar VIVO e liga o voo', () => {
    const { qa, player, flying, girar } = contexto()
    // yaw 0 olha pro -Z: recuar 5 leva o jogador pro +Z.
    qa.dolly(5, 2)
    expect(player.z).toBeCloseTo(5, 6)
    expect(player.y).toBeCloseTo(66, 6)
    expect(player.vy, 'a velocidade vertical sobrou e o jogador despenca').toBe(0)
    expect(flying.value).toBe(true)

    // CONTROLE: girando 90°, o recuo passa a ser no eixo X. Um `yaw` capturado
    // continuaria empurrando pelo Z e o print sairia do lugar errado.
    girar(Math.PI / 2)
    const zAntes = player.z
    qa.dolly(5, 0)
    expect(player.x).toBeCloseTo(-5, 6)
    expect(player.z).toBeCloseTo(zAntes, 6)
  })

  it('setFlying e interagir delegam ao caminho do jogo', () => {
    const { qa, flying, interacoes } = contexto()
    expect(qa.setFlying(true)).toBe(true)
    expect(flying.value).toBe(true)
    expect(qa.setFlying(0)).toBe(false)
    qa.interagir()
    expect(interacoes.length).toBe(1)
  })
})

// ⚠️ UMA SONDA DE QA NÃO PODE LAVAR ESTADO RUIM. `?? PADRAO` só troca AUSÊNCIA
// pelo padrão; com `||`, todo valor falsy-porém-PRESENTE vira o padrão, e a
// sonda relata "normal" exatamente quando o mundo está torto.
describe('qaDeEntrada — a sonda diz o que a mira encostou', () => {
  it('bloco com chave VAZIA não é relatado como ar', () => {
    // `blockDef(...)?.key ?? 'air'`. Com `||`, um bloco cuja definição veio
    // torta (chave vazia) é relatado como AR — e o QA conclui que a mira não
    // pegou nada, quando pegou um bloco quebrado. É o oposto do trabalho da
    // sonda: ela existe porque adivinhar a coordenada varrendo uma caixa já
    // errou duas vezes.
    const { qa } = contexto({
      world: () => ({ getBlock: () => 999999, setPlayerPosition() {} }),
    })
    // Um id que não existe na tabela não tem `blockDef`: a sonda cai em 'air'.
    expect(qa.miraEm().chave).toBe('air')
  })

  it('a mira relata a coordenada exata e a chave do bloco', () => {
    const { qa } = contexto()
    expect(qa.miraEm()).toEqual({ x: 1, y: 2, z: 3, chave: 'stone' })
  })

  it('sem nada sob a mira, é null', () => {
    const { qa } = contexto({ currentTarget: () => null })
    expect(qa.miraEm()).toBeNull()
  })

  it('ar e bloco inquebrável são recusados SEPARADAMENTE', () => {
    // `id === AIR || isUnbreakable(id)` virando `&&` só recusa o que for as
    // DUAS coisas — e nada é. A sonda passaria a "quebrar" o ar e a bedrock,
    // e o teste de mineração daria verde num mundo que não mudou.
    const arNaMira = contexto({
      world: () => ({ getBlock: () => AIR, setPlayerPosition() {} }),
    })
    expect(arNaMira.qa.breakNow()).toBe(false)
    expect(arNaMira.quebrados).toEqual([])

    const bedrock = contexto({
      world: () => ({ getBlock: () => BLOCK_BY_KEY.bedrock.id, setPlayerPosition() {} }),
    })
    expect(bedrock.qa.breakNow()).toBe(false)
    expect(bedrock.quebrados).toEqual([])

    const pedra = contexto()
    expect(pedra.qa.breakNow()).toBe(true)
    expect(pedra.quebrados).toHaveLength(1)
  })

  it('ação sem tecla mapeada usa o próprio nome como código', () => {
    // `TECLA_DA_ACAO[acao] || acao` virando `&&` faz TODA ação conhecida
    // devolver o nome cru em vez do código da tecla, e o teclado nunca vê a
    // tecla que o QA apertou.
    const { qa, keys } = contexto()
    expect(qa.press('forward')).toBe('KeyW')
    expect(keys.KeyW).toBe(true)
    expect(qa.press('KeyQ')).toBe('KeyQ')
    expect(keys.KeyQ).toBe(true)
  })

  it('dolly sem argumento não move o jogador, só liga o voo', () => {
    // Os padrões `back = 0, up = 0`: virando 1, um enquadramento pedido sem
    // argumento passa a empurrar a câmera um metro pra trás e um pra cima, e
    // todo print do QA sai de um lugar diferente do pedido.
    const { qa, player } = contexto()
    qa.dolly()
    expect(player.x).toBe(0)
    expect(player.y).toBe(64)
    expect(player.z).toBe(0)
    expect(player.vy).toBe(0)
  })
})
