import { describe, it, expect, vi } from 'vitest'
import { ref, reactive } from 'vue'
import { useRoqueCraftAbertura } from '../../src/composables/useRoqueCraftAbertura.js'

// ⚠️ NADA DISTO TINHA TESTE, e o endereço era a razão: as sete funções moravam
// soltas dentro de `ROSRoqueCraft.vue`, cada uma mexendo num `let` do
// componente. O histórico delas é uma lista de defeito caro — sair do menu
// deixando o jogador cair de 40 blocos, nascer empoleirado num galho, o pouso
// com política própria enterrando na caverna — e cada um só foi descoberto
// jogando. O que se prova aqui é exatamente isso.

/** Mundo plano: sólido até `topo`, o chunk do jogador já carregado. */
function mundoPlano(topo = 64, over = {}) {
  return {
    solidAt: (x, y) => (y <= topo ? 1 : 0),
    liquidAt: () => 0,
    getBlock: (x, y) => (y <= topo ? 7 : 0),
    surfaceY: () => topo,
    isLoaded: () => true,
    setPlayerPosition: vi.fn(),
    reset: vi.fn(),
    ...over,
  }
}

function montar(over = {}) {
  const jogador = { x: 3.5, y: 65, z: -2.5, vy: -9, fallStart: 200 }
  const voando = ref(false)
  const menuAberto = ref(false)
  const pausado = ref(true)
  const temSave = ref(false)
  const diaDoSave = ref(7)
  const semente = ref(42)
  const modo = ref('survival')
  const slotEscolhido = ref(5)
  const inventario = ref(['velho'])
  const sobrevivencia = reactive({ health: 3, food: 1 })
  const limpou = []
  const ancoras = []
  const ponteiro = vi.fn()
  let mundo = over.mundo || mundoPlano()
  let ticks = 18000
  let yaw = 9
  let pitch = 9
  let salvo = over.salvo !== undefined ? over.salvo : { x: 100, y: 70, z: 200 }
  let ruido = { fake: 'velho' }
  // A ordem entre pousar e desligar o voo é o que este arquivo prova: o
  // registro guarda o estado do voo NO INSTANTE de cada reposicionamento.
  const vooNoPouso = []
  mundo.setPlayerPosition = vi.fn(() => vooNoPouso.push(voando.value))

  const regras = {
    blockDef: (id) => (id ? { key: 'stone' } : { key: 'air' }),
    landingSpot: vi.fn(),
    safeSpawn: vi.fn(),
    melhorVista: vi.fn(() => 1.75),
    politicaDeNascimento: over.politicaDeNascimento ?? vi.fn(() => ({ top: 64, safe: null })),
    createNoiseContext: vi.fn((s) => ({ fake: 'novo', s })),
    createSurvivalState: vi.fn(() => ({ health: 20, food: 20 })),
    creativeStarter: vi.fn(() => ['criativo']),
    survivalStarter: vi.fn(() => ['sobrevivencia']),
    findSpawn: vi.fn(() => ({ x: 10, y: 80, z: -10 })),
  }

  const a = useRoqueCraftAbertura({
    jogador,
    voando,
    menuAberto,
    pausado,
    temSave,
    diaDoSave,
    semente,
    modo,
    slotEscolhido,
    inventario,
    sobrevivencia,
    entidades: { limpar: () => limpou.push(1) },
    mundo: () => mundo,
    instante: [() => ticks, (v) => (ticks = v)],
    guinada: [() => yaw, (v) => (yaw = v)],
    inclinacao: [() => pitch, (v) => (pitch = v)],
    posicaoDoSave: [() => salvo, (v) => (salvo = v)],
    ruido: [() => ruido, (v) => (ruido = v)],
    ancorarMenu: (x) => ancoras.push(x),
    cancelado: () => over.cancelado?.() ?? false,
    soltarPonteiro: ponteiro,
    regras,
  })

  return {
    a,
    jogador,
    voando,
    menuAberto,
    pausado,
    temSave,
    diaDoSave,
    semente,
    modo,
    slotEscolhido,
    inventario,
    sobrevivencia,
    limpou,
    ancoras,
    ponteiro,
    regras,
    vooNoPouso,
    ticks: () => ticks,
    yaw: () => yaw,
    pitch: () => pitch,
    salvo: () => salvo,
    ruido: () => ruido,
    trocarMundo: (m) => {
      mundo = m
    },
    mundo: () => mundo,
  }
}

describe('useRoqueCraftAbertura', () => {
  it('entrar no menu sobe a câmera pra órbita, liga o voo e devolve o ponteiro', () => {
    const c = montar({ mundo: mundoPlano(70) })
    c.a.entrarNoMenu()
    expect(c.menuAberto.value).toBe(true)
    expect(c.pausado.value, 'menu e pausa acesos ao mesmo tempo').toBe(false)
    expect(c.jogador.y, 'a câmera tem que subir 26 acima do topo').toBe(96)
    expect(c.jogador.vy, 'subiu com velocidade herdada: cai na hora').toBe(0)
    expect(c.voando.value).toBe(true)
    expect(c.pitch()).toBe(-0.3)
    // O ponteiro volta pro jogador SEM argumento: o menu é mouse livre.
    expect(c.ponteiro.mock.calls, 'o menu ficou com o ponteiro preso').toEqual([[]])
    expect(c.ancoras.at(-1)).toEqual({ x: 3.5, y: 96, z: -2.5 })
  })

  it('sem topo (chunk ainda não veio) a órbita sai da altura do jogador, não de NaN', () => {
    const c = montar({ mundo: mundoPlano(70, { surfaceY: () => undefined }) })
    c.a.entrarNoMenu()
    expect(Number.isFinite(c.jogador.y)).toBe(true)
    expect(c.jogador.y).toBe(65 + 26)
  })

  // ⚠️ A ORDEM É O DEFEITO DE 20/08: sair do menu desligava o voo e deixava
  // cair, e o jogador morria de dano de queda antes do primeiro passo.
  it('sair do menu POUSA antes de desligar o voo', async () => {
    const c = montar()
    c.a.entrarNoMenu()
    await c.a.sairDoMenu()
    expect(c.menuAberto.value).toBe(false)
    expect(c.ancoras.at(-1), 'a âncora da órbita ficou pra trás').toBe(null)
    expect(c.vooNoPouso, 'reposicionou com o voo já desligado: é queda livre').toEqual([true])
    expect(c.voando.value, 'terminou voando').toBe(false)
  })

  it('pousar põe o jogador no chão seguro, zera a queda e olha pro lado aberto', async () => {
    const c = montar({ politicaDeNascimento: () => ({ top: 64, safe: { x: 8, y: 65, z: 9 } }) })
    c.jogador.fallStart = 200
    await c.a.pousarSeguro()
    expect([c.jogador.x, c.jogador.y, c.jogador.z]).toEqual([8, 65, 9])
    expect(c.jogador.vy).toBe(0)
    expect(c.jogador.fallStart, 'sem isto o motor acha que ele despencou do céu').toBe(65)
    expect(c.yaw(), 'pousou de cara na parede').toBe(1.75)
    expect(c.pitch()).toBe(-0.05)
  })

  it('sem chão seguro, pousa no topo da coluna — nunca fica onde estava', async () => {
    const c = montar({ politicaDeNascimento: () => ({ top: 120, safe: null }) })
    await c.a.pousarSeguro()
    expect(c.jogador.y).toBe(121)
  })

  it('a espera do chão responde ao chunk, ao tempo e ao componente que desmontou', async () => {
    const chegando = montar({ mundo: mundoPlano(64, { isLoaded: () => true }) })
    await expect(chegando.a.esperarOChaoChegar(500)).resolves.toBe(true)

    const nunca = montar({ mundo: mundoPlano(64, { isLoaded: () => false }) })
    await expect(nunca.a.esperarOChaoChegar(120)).resolves.toBe(false)

    // ⚠️ Sem o corte por `cancelado`, a promessa segue viva depois do desmonte
    // e mexe num jogador que não está mais na tela. E O QUE PROVA O CORTE É O
    // RELÓGIO, não o `false`: com o limite em 9 s, um `false` que demora 9 s é
    // o tempo esgotando, não o corte. Sem esta medida o mutante que apaga a
    // linha SOBREVIVE — e sobreviveu, na primeira versão deste teste.
    const morto = montar({
      mundo: mundoPlano(64, { isLoaded: () => false }),
      cancelado: () => true,
    })
    const t0 = Date.now()
    await expect(morto.a.esperarOChaoChegar(9000)).resolves.toBe(false)
    expect(
      Date.now() - t0,
      'esperou o tempo inteiro: o corte por desmonte não existe',
    ).toBeLessThan(1000)
  })

  it('"continuar" volta pra posição do save e avisa o mundo', async () => {
    const c = montar({ salvo: { x: 100, y: 70, z: 200 } })
    c.a.entrarNoMenu()
    await c.a.comecarDoSave()
    // Pousou depois de voltar: a posição final é a do pouso, mas o mundo foi
    // avisado das duas — e a PRIMEIRA é a do save. Sem essa primeira, o jogador
    // pousaria onde o menu deixou a câmera, e não onde ele parou de jogar.
    expect(c.mundo().setPlayerPosition.mock.calls[0]).toEqual([100, 70, 200])
    expect(c.voando.value).toBe(false)
  })

  it('sem posição salva, "continuar" não quebra: só pousa onde está', async () => {
    const c = montar({ salvo: null })
    await expect(c.a.comecarDoSave()).resolves.toBeUndefined()
    expect(c.voando.value).toBe(false)
  })

  it('mundo novo zera tudo o que é do mundo velho, e grava onde o jogador nasceu', async () => {
    const c = montar()
    const velha = c.semente.value
    await c.a.comecarMundoNovo()
    expect(c.semente.value, 'semente nova é o mundo novo').not.toBe(velha)
    expect(c.ticks(), 'o relógio tem que voltar pra manhã').toBe(1000)
    expect(c.sobrevivencia.health, 'entrou no mundo novo com a vida do mundo velho').toBe(20)
    expect(c.inventario.value).toEqual(['sobrevivencia'])
    expect(c.slotEscolhido.value).toBe(0)
    expect(c.limpou.length, 'os bichos do mundo velho continuaram vivos').toBe(1)
    expect(c.ruido(), 'o ruído continuou o do mundo velho').toEqual({
      fake: 'novo',
      s: c.semente.value,
    })
    expect(c.mundo().reset).toHaveBeenCalledWith(c.semente.value, null)
    expect(c.temSave.value).toBe(true)
    expect(c.diaDoSave.value).toBe(1)
    // A posição gravada é a do NASCIMENTO (spawn + 2), não a do pouso que vem
    // logo depois: `comecarMundoNovo` grava antes de sair do menu. E está
    // certo — quem clicar "continuar" passa por `pousarSeguro` de novo e a
    // altura é corrigida com o topo real. O que não pode é ficar sem nada.
    expect(c.salvo(), '"continuar" não saberia pra onde voltar').toEqual({ x: 10, y: 82, z: -10 })
  })

  it('no criativo o mundo novo começa com o inventário do criativo', async () => {
    const c = montar()
    c.modo.value = 'creative'
    await c.a.comecarMundoNovo()
    expect(c.inventario.value).toEqual(['criativo'])
  })

  // ⚠️ O MUNDO É REATRIBUÍDO (troca de qualidade, mundo novo, troca de
  // dimensão). Lido por valor, este composable falaria com o mundo de quando
  // foi montado — e o leitor de blocos da política de nascimento leria a
  // coluna errada, que é o defeito mais silencioso possível.
  it('o leitor de blocos fala com o mundo VIVO, não com o de quando foi montado', () => {
    const c = montar()
    expect(c.a.mundoDoNascimento().chaveEm(0, 60, 0)).toBe('stone')
    c.trocarMundo(mundoPlano(64, { getBlock: () => 0 }))
    expect(c.a.mundoDoNascimento().chaveEm(0, 60, 0)).toBe('air')
  })

  // ⚠️ ACHADO DO REVISOR NA ONDA 4, e a resposta é o contrato, não o `?.`:
  // nada neste caminho roda antes de o boot criar o mundo. Uma meia-defesa
  // (`w?.getBlock` ao lado de `w.solidAt`) não protege — a segunda linha
  // estoura igual — e faria o leitor acreditar que o nulo está tratado. Se o
  // mundo faltar, tem que aparecer alto: uma coluna de ar silenciosa joga o
  // jogador pro vazio, que é bem pior que um erro no console.
  it('sem mundo, a amarração falha ALTO — não devolve coluna de ar', () => {
    const c = montar()
    c.trocarMundo(null)
    expect(() => c.a.mundoDoNascimento()).toThrow()
    expect(() => c.a.chaoParaNascer()).toThrow()
  })

  it('a política de nascimento recebe a posição do jogador e os tetos pedidos', () => {
    const espia = vi.fn(() => ({ top: 64, safe: null }))
    const c = montar({ politicaDeNascimento: espia })
    c.a.chaoParaNascer(3, 90)
    expect(espia).toHaveBeenCalledWith(expect.any(Object), 3.5, -2.5, 3, 90)
    c.a.chaoParaNascer()
    expect(espia).toHaveBeenLastCalledWith(expect.any(Object), 3.5, -2.5, 0, 100)
  })
})
