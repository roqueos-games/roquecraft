import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { criarQaDeMobs } from '../../src/servicos/qaDeMobs.js'
import { BLOCK_BY_KEY } from '../../src/servicos/blocks.js'

// ⚠️ TRÊS RISCOS, TODOS DA MESMA FAMÍLIA: variável `let` do componente.
//
// 1. `mobs` é REATRIBUÍDA em sete lugares (filtro de golpe, amanhecer, entrar e
//    sair do multiplayer, desmontar). Um serviço que capturasse o array leria a
//    lista de uma partida morta. Entra por getter, e o esvaziar volta por função.
// 2. `yaw` é `let`. `frameMobs` MIRA no centroide - escrever numa cópia deixaria
//    a câmera olhando pro lado errado, e a foto sairia do matagal sem nenhum
//    vermelho. A escrita volta por `olhar(y, p)`.
// 3. `world` é `let`. Getter, como sempre.
//
// A rule 44 dizia "engine e world entram por getter". A regra de verdade é mais
// larga, e esta rodada a corrigiu: QUALQUER `let` do componente entra por getter.

const mobFalso = (over = {}) => ({
  id: 'm1',
  type: 'pig',
  health: 10,
  x: 0,
  y: 64,
  z: 0,
  ...over,
})

function contexto(over = {}) {
  let lista = [mobFalso()]
  let world = { surfaceY: () => 64, getBlock: () => 0, setPlayerPosition() {} }
  const player = { x: 0, y: 64, z: 0, vy: 0 }
  const flying = ref(false)
  let yaw = 0
  let pitch = 0
  const ctx = {
    mobs: () => lista,
    esvaziarMobs: () => {
      lista = []
    },
    world: () => world,
    player,
    flying,
    yaw: () => yaw,
    olhar: (y, p) => {
      yaw = y
      pitch = p
    },
    mobMirado: () => null,
    ...over,
  }
  return {
    qa: criarQaDeMobs(ctx),
    player,
    flying,
    olho: () => ({ yaw, pitch }),
    lista: () => lista,
    trocarLista: (nova) => {
      lista = nova
    },
    trocarMundo: (w) => {
      world = w
    },
  }
}

describe('qaDeMobs', () => {
  it('lê a lista VIVA depois que ela é reatribuída', () => {
    const { qa, trocarLista } = contexto()
    expect(qa.criaturas().length).toBe(1)
    trocarLista([mobFalso({ id: 'a' }), mobFalso({ id: 'b' })])
    expect(qa.criaturas().length, 'ficou preso na lista da partida morta').toBe(2)
    expect(qa.mobsInfo().map((m) => m.id)).toEqual(['a', 'b'])
  })

  it('limparMobs esvazia pelo DONO da variável, não pelo array', () => {
    const { qa, lista } = contexto()
    const antes = lista()
    expect(qa.limparMobs()).toBe(1)
    // O componente faz `mobs = []`: a lista nova é OUTRO objeto. Um serviço que
    // fizesse `mobs().length = 0` limparia o mesmo array e o teste de conteúdo
    // não veria diferença - mas quem guardou a referência antiga (o laço do
    // quadro, a camada de entidades) continuaria segurando a lista que o
    // componente já considera substituída.
    expect(lista(), 'esvaziou o array em vez de avisar o dono').not.toBe(antes)
    expect(lista().length).toBe(0)
    expect(qa.criaturas()).toEqual([])
    expect(qa.limparMobs()).toBe(0)
  })

  it('frameMobs escreve a mira DE VOLTA no componente', () => {
    const { qa, olho, flying, player, trocarLista } = contexto()
    trocarLista([mobFalso({ x: 20, y: 64, z: -8 }), mobFalso({ x: 20, y: 64, z: 8 })])
    expect(qa.frameMobs(10, 4.5)).toMatchObject({ cx: 20, cy: 64, cz: 0, n: 2 })

    // O `pitch` é o que MUDA de fato: ele sai de `-atan2(up, dist)`, sem
    // nenhuma relação com o valor anterior. Se a escrita tivesse ido pra uma
    // cópia, ele continuaria zero e a câmera olharia reto pro horizonte em vez
    // de pra baixo, no grupo.
    expect(olho().pitch, 'a mira ficou numa cópia; a câmera não inclinou').toBeCloseTo(
      -Math.atan2(4.5, 10),
      6,
    )

    // E o `yaw` gravado tem que APONTAR pro centroide. (Com a câmera posta em
    // `centroide - frente * dist`, o ângulo resultante coincide com o anterior:
    // a recomputação é redundante hoje, e continua aqui porque ela é o que
    // segura a mira se a colocação da câmera mudar.)
    const fx = Math.sin(olho().yaw)
    const fz = -Math.cos(olho().yaw)
    expect(fx * (0 - player.z) - fz * (20 - player.x), 'a mira não aponta pro grupo').toBeCloseTo(
      0,
      6,
    )
    expect(fx * (20 - player.x) + fz * (0 - player.z)).toBeGreaterThan(0)
    expect(flying.value).toBe(true)
  })

  it('frameMobs recusa lista vazia e coordenada NaN', () => {
    const { qa, trocarLista, olho } = contexto()
    trocarLista([])
    expect(qa.frameMobs()).toBe(false)
    // NaN já custou uma rodada: a criatura nascia em coordenada NaN e
    // contaminava a posição do jogador quando o QA enquadrava pelo centroide.
    trocarLista([mobFalso({ x: NaN, z: 3 })])
    expect(qa.frameMobs(), 'deixou NaN entrar no centroide').toBe(false)
    expect(Number.isFinite(olho().yaw)).toBe(true)
  })

  it('spawnMob nasce na FRENTE da câmera e desce por folhagem', () => {
    // yaw = 0 olha pro -Z, então dist=4 põe a criatura em (0, ?, -4).
    const { qa, lista, trocarMundo } = contexto()
    trocarMundo({
      surfaceY: () => 70,
      // Tudo de 68 pra cima é folha (`cutout`); abaixo disso é chão de verdade.
      getBlock: (x, y) => (y >= 68 ? BLOCK_BY_KEY.oakLeaves.id : BLOCK_BY_KEY.stone.id),
      setPlayerPosition() {},
    })
    expect(qa.spawnMob('pig', 4, 0)).toBe(true)
    const nova = lista()[lista().length - 1]
    expect(nova.x).toBeCloseTo(0, 6)
    expect(nova.z).toBeCloseTo(-4, 6)
    expect(nova.type).toBe('pig')
    // CONTROLE: sem o loop de folhagem a criatura nasceria em 71 (surfaceY+1),
    // ou seja, EM CIMA da copa - foi assim que a ovelha nasceu na árvore no QA
    // de 2026-08-19. Com ele, desce até a primeira célula que não é cutout: as
    // folhas ocupam 68 e 69, então o topo cai pra 68 e a criatura nasce em 69.
    expect(nova.y, 'nasceu em cima da copa').toBe(69)
  })

  it('spawnMob recusa tipo inexistente sem sujar a lista', () => {
    const { qa, lista } = contexto()
    const antes = lista().length
    expect(qa.spawnMob('nao_existe')).toBe(false)
    expect(lista().length).toBe(antes)
  })

  it('mandarMob põe a criatura em `wander` rumo ao alvo, com timer longo', () => {
    const { qa, trocarLista } = contexto()
    const aldeao = mobFalso({ type: 'aldeao', state: 'idle', timer: 1 })
    trocarLista([mobFalso({ type: 'pig' }), aldeao])
    expect(qa.mandarMob('aldeao', 11.5, 4.5)).toBe(true)
    expect(aldeao).toMatchObject({ state: 'wander', targetX: 11.5, targetZ: 4.5 })
    expect(aldeao.timer).toBeGreaterThanOrEqual(60)
    expect(qa.mandarMob('zombie', 0, 0), 'sem criatura do tipo').toBe(false)
    expect(qa.mandarMob('aldeao', NaN, 0), 'alvo NaN é veneno').toBe(false)
  })

  it('criaturas marca hostilidade pela DEFINIÇÃO do tipo', () => {
    const { qa, trocarLista } = contexto()
    trocarLista([mobFalso({ type: 'zombie' }), mobFalso({ type: 'pig' })])
    const [z, p] = qa.criaturas()
    expect(z.hostil).toBe(true)
    // CONTROLE: se a hostilidade viesse da instância (que não a tem), os dois
    // sairiam iguais e a sonda da cama não conseguiria montar a cena.
    expect(p.hostil).toBe(false)
  })

  it('miradoQA devolve o id da mira DO JOGO', () => {
    let mirado = null
    const { qa } = contexto({ mobMirado: () => mirado })
    expect(qa.miradoQA()).toBe(null)
    mirado = { id: 'm42' }
    expect(qa.miradoQA()).toBe('m42')
  })
})

// ⚠️ UMA SONDA DE QA NÃO PODE LAVAR ESTADO RUIM. `?? PADRAO` só troca AUSÊNCIA
// pelo padrão; com `||`, todo valor falsy-porém-PRESENTE vira o padrão.
describe('qaDeMobs — mirado com id vazio não vira "não mirei nada"', () => {
  it('id vazio é relatado como vazio, não como null', () => {
    // `miradoQA` existe porque `place()` devolvendo `false` é ambíguo: pode ser
    // "o raio não pegou bicho" ou "pegou e a regra recusou". Uma criatura com
    // id corrompido virando `null` recria exatamente a ambiguidade que a sonda
    // foi criada pra desfazer — e manda consertar a metade errada.
    const { qa } = contexto({ mobMirado: () => ({ id: '', type: 'pig' }) })
    expect(qa.miradoQA()).toBe('')
  })

  it('sem nada sob a mira, é null', () => {
    const { qa } = contexto({ mobMirado: () => null })
    expect(qa.miradoQA()).toBeNull()
  })

  it('com criatura sob a mira, é o id dela', () => {
    const { qa } = contexto({ mobMirado: () => ({ id: 'm7', type: 'zombie' }) })
    expect(qa.miradoQA()).toBe('m7')
  })
})
