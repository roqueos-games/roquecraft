import { describe, it, expect, vi } from 'vitest'
import { ref, reactive } from 'vue'
import {
  useRoqueCraftCorpo,
  BRACADA,
  QUEDA_QUE_BATE,
  ESPERA_DO_RESGATE,
} from '../../src/composables/useRoqueCraftCorpo.js'
import { BLOCK_BY_KEY, ID } from '../../src/servicos/blocks.js'

// ⚠️ O LACO DO CORPO NUNCA TEVE TESTE, e a razao era o endereco: ele morava
// dentro de `stepGame`, no meio de cento e dez linhas que tocavam mundo, motor,
// audio, HUD e rede. Cada regra dele so podia ser conferida rodando o jogo.
//
// `physics.js`, `passo.js`, `camera.js` e `survival.js` sao testados de sobra
// cada um por si. O que nao era testado e a LIGACAO - e e nela que estao as
// decisoes que ja custaram defeito:
//
//  - a cadencia do passo vem da DISTANCIA percorrida, nao da velocidade
//    (fisica oscilando dava passo com o jogador parado)
//  - o baque de aterrissagem tem corte por altura (senao cada lombada soma um
//    passo em cima da cadencia normal)
//  - a bracada vem da distancia NADADA, e vira bolha com a cabeca submersa
//  - o corte de 888 Hz entra com a CABECA, nao com o corpo
//  - o resgate de soterramento tem carencia (senao roda 60x por segundo)
//  - lava e cacto nao somam dano no mesmo quadro
//  - no criativo nada disso acontece

function mundoPlano(topo = 64, over = {}) {
  return {
    solidAt: (x, y) => (y <= topo ? 1 : 0),
    liquidAt: () => 0,
    isLoaded: () => true,
    getBlock: (x, y) => (y <= topo ? BLOCK_BY_KEY.stone.id : 0),
    setPlayerPosition: () => {},
    ...over,
  }
}

function montar(over = {}) {
  let world = over.world || mundoPlano()
  const sons = []
  const ondas = []
  const audio = {
    step: (f) => sons.push(['step', f]),
    splash: (v) => sons.push(['splash', v]),
    bracada: () => sons.push(['bracada']),
    bolha: () => sons.push(['bolha']),
    setSubmerso: (v) => sons.push(['submerso', v]),
  }
  const teclas = over.teclas || {}
  const mortes = []
  const andou = []
  const ajustes = reactive({ autoJump: true, viewBob: true, ...over.ajustes })
  const c = useRoqueCraftCorpo({
    mundo: { vivo: () => world, motor: () => ({ ondularAgua: (...a) => ondas.push(a) }) },
    ajustes,
    som: () => (over.semAudio ? null : audio),
    entrada: () => ({
      teclas,
      direcional: () => over.direcional?.() ?? { x: 0, y: 0 },
      correndo: () => over.correndo?.() ?? false,
    }),
    ehCelular: ref(!!over.ehCelular),
    yaw: () => over.yaw?.() ?? 0,
    modo: () => over.modo?.() ?? 'survival',
    aoMorrer: (f) => mortes.push(f),
    aoAndar: (x, z) => andou.push([x, z]),
    chaoParaNascer: over.chaoParaNascer || (() => ({ safe: { x: 100, y: 70, z: 100 } })),
    itemNaMao: over.itemNaMao,
    gastarEscudo: over.gastarEscudo,
  })
  return { c, sons, ondas, mortes, andou, teclas, ajustes, trocarMundo: (w) => (world = w) }
}

/** Roda `n` quadros de 1/60 s, com o relogio andando junto. */
function rodar(c, n, t0 = 0) {
  for (let i = 0; i < n; i++) c.passo(1 / 60, t0 + (i * 1000) / 60)
}

describe('useRoqueCraftCorpo', () => {
  it('sem mundo, o passo não roda e não explode', () => {
    const { c } = montar()
    c.passo // existe
    const semMundo = montar()
    semMundo.trocarMundo(null)
    expect(semMundo.c.passo(1 / 60, 0)).toBe(null)
    expect(c).toBeTruthy()
  })

  it('o corpo cai até o chão e fica lá', () => {
    const { c } = montar()
    c.porEm(0.5, 80, 0.5)
    rodar(c, 400)
    expect(c.corpo.onGround, 'o corpo não pousou').toBe(true)
    expect(c.corpo.y).toBeCloseTo(65, 0)
  })

  it('andar toca passo; ficar parado NÃO toca', () => {
    // A conta era `veloc * dt` com portão em `veloc > 0.9`. Velocidade não é
    // deslocamento: física oscilando dava passo com o jogador no lugar.
    // ⚠️ Pousa PRIMEIRO e so entao conta: cair um bloco ja rende o baque de
    // aterrissagem, e sem assentar o teste mediria o baque achando que media
    // passo.
    const parado = montar()
    parado.c.porEm(0.5, 66, 0.5)
    rodar(parado.c, 120)
    parado.sons.length = 0
    rodar(parado.c, 300)
    expect(parado.sons.filter((s) => s[0] === 'step').length, 'passo com o jogador parado').toBe(0)

    const andando = montar({ teclas: { KeyW: true } })
    andando.c.porEm(0.5, 66, 0.5)
    rodar(andando.c, 120)
    andando.sons.length = 0
    rodar(andando.c, 300)
    expect(andando.sons.filter((s) => s[0] === 'step').length).toBeGreaterThan(0)
  })

  // ⚠️ `teclas.ShiftLeft || teclas.ShiftRight` sobrevivia a `&&`: agachar
  // passaria a exigir os DOIS shifts ao mesmo tempo, e quem usa o direito
  // (canhoto, teclado compacto) simplesmente não agacha. O mesmo vale para o
  // Ctrl do correr, que ainda tem o duplo-toque no W como terceiro caminho.
  it('agachar e correr valem em qualquer um dos dois lados do teclado', () => {
    const distancia = (teclas, extra = {}) => {
      const m = montar({ teclas, ...extra })
      m.c.porEm(0.5, 66, 0.5)
      rodar(m.c, 120) // pousa
      const x0 = m.c.corpo.x
      const z0 = m.c.corpo.z
      rodar(m.c, 180)
      return Math.hypot(m.c.corpo.x - x0, m.c.corpo.z - z0)
    }

    const normal = distancia({ KeyW: true })
    const agachadoEsq = distancia({ KeyW: true, ShiftLeft: true })
    const agachadoDir = distancia({ KeyW: true, ShiftRight: true })
    expect(agachadoEsq).toBeLessThan(normal)
    expect(agachadoDir).toBeLessThan(normal)
    expect(agachadoDir).toBeCloseTo(agachadoEsq, 6) // os dois lados são iguais

    const correndoEsq = distancia({ KeyW: true, ControlLeft: true })
    const correndoDir = distancia({ KeyW: true, ControlRight: true })
    const correndoNoToque = distancia({ KeyW: true }, { correndo: () => true })
    expect(correndoEsq).toBeGreaterThan(normal)
    expect(correndoDir).toBeCloseTo(correndoEsq, 6)
    expect(correndoNoToque).toBeCloseTo(correndoEsq, 6)
  })

  // ⚠️ `ajustes.viewBob !== false` sobrevivia a `===`, que INVERTE o ajuste: o
  // tranco da câmera só aconteceria para quem DESLIGOU o balanço, e quem
  // deixou ligado levaria pancada sem sentir nada.
  it('o tranco de dano segue o ajuste de balanço, e não o contrário', () => {
    const comBalanco = montar({ ajustes: { viewBob: true } })
    comBalanco.c.porEm(0.5, 66, 0.5)
    rodar(comBalanco.c, 120)
    comBalanco.c.machucar(4, 'lava')
    expect(Math.abs(comBalanco.c.camAnim.torcao)).toBeGreaterThan(0)

    const semBalanco = montar({ ajustes: { viewBob: false } })
    semBalanco.c.porEm(0.5, 66, 0.5)
    rodar(semBalanco.c, 120)
    semBalanco.c.machucar(4, 'lava')
    expect(Math.abs(semBalanco.c.camAnim.torcao)).toBe(0)
    expect(semBalanco.c.flashDeDano.value).toBe(1) // o flash é HUD e continua
  })

  it('o baque de aterrissagem tem corte por altura', () => {
    // Sem o corte, andar em terreno irregular somaria um passo extra a cada
    // ondulação, em cima da cadência normal.
    // Queda MENOR que o corte: silêncio absoluto. É esta metade que segura o
    // defeito - contar "o alto bateu mais que o raso" passaria com os dois
    // batendo.
    const raso = montar()
    raso.c.porEm(0.5, 65 + QUEDA_QUE_BATE / 2, 0.5)
    rodar(raso.c, 200)
    expect(
      raso.sons.filter((s) => s[0] === 'step').length,
      'cada lombada do terreno somou um passo extra',
    ).toBe(0)

    // Queda de verdade: bate uma vez.
    const alto = montar()
    alto.c.porEm(0.5, 90, 0.5)
    rodar(alto.c, 400)
    expect(alto.sons.filter((s) => s[0] === 'step').length, 'a queda de 25 blocos não bateu').toBe(
      1,
    )
  })

  it('entrar na água faz respingo e onda, e a força escala com a queda', () => {
    const agua = mundoPlano(64, { liquidAt: (x, y) => (y <= 64 ? 1 : 0), solidAt: () => 0 })
    const raso = montar({ world: agua })
    raso.c.porEm(0.5, 64.5, 0.5)
    rodar(raso.c, 10)
    const alto = montar({ world: agua })
    alto.c.porEm(0.5, 120, 0.5)
    rodar(alto.c, 400)
    const splashRaso = raso.sons.find((s) => s[0] === 'splash')?.[1] ?? 0
    const splashAlto = alto.sons.find((s) => s[0] === 'splash')?.[1] ?? 0
    expect(splashAlto, 'pular do penhasco soou igual a escorregar na margem').toBeGreaterThan(
      splashRaso,
    )
    expect(alto.ondas.length).toBeGreaterThan(0)
  })

  it('a braçada vem da DISTÂNCIA nadada, e vira bolha com a cabeça submersa', () => {
    const fundo = mundoPlano(64, {
      liquidAt: () => 1,
      solidAt: () => 0,
      getBlock: () => BLOCK_BY_KEY.water?.id ?? 0,
    })
    const { c, sons } = montar({ world: fundo, teclas: { KeyW: true } })
    c.porEm(0.5, 40, 0.5)
    rodar(c, 600)
    const bracadas = sons.filter((s) => s[0] === 'bracada' || s[0] === 'bolha')
    expect(bracadas.length, 'nadou e não fez braçada nenhuma').toBeGreaterThan(0)
    // Cabeça dentro: bolha, não braçada. Debaixo d'água ninguém ouve o próprio
    // braço batendo na superfície.
    expect(
      bracadas.every((b) => b[0] === 'bolha'),
      'braçada audível com a cabeça submersa',
    ).toBe(true)
    expect(BRACADA).toBe(1.15)
  })

  it('o corte de 888 Hz entra com a CABEÇA, não com o corpo', () => {
    const { c, sons } = montar()
    c.porEm(0.5, 66, 0.5)
    rodar(c, 5)
    expect(sons.filter((s) => s[0] === 'submerso').every((s) => s[1] === false)).toBe(true)
    expect(c.submerso.value).toBe(false)
  })

  it('o resgate de soterramento tem CARÊNCIA', () => {
    // Sem ela, `preso` num quadro viraria sessenta resgates por segundo.
    let chamadas = 0
    const { c } = montar({
      chaoParaNascer: () => {
        chamadas++
        return { safe: { x: 1, y: 70, z: 1 } }
      },
    })
    expect(c.resgatarDoSoterramento(10_000)).toBe(true)
    expect(c.resgatarDoSoterramento(10_000 + ESPERA_DO_RESGATE / 2), 'resgatou 60x/s').toBe(false)
    expect(c.resgatarDoSoterramento(10_000 + ESPERA_DO_RESGATE + 1)).toBe(true)
    expect(chamadas).toBe(2)
  })

  it('sem lugar seguro, o resgate não teleporta pra lugar nenhum', () => {
    const { c } = montar({ chaoParaNascer: () => ({ safe: null }) })
    c.porEm(5, 5, 5)
    expect(c.resgatarDoSoterramento(10_000)).toBe(false)
    expect([c.corpo.x, c.corpo.y, c.corpo.z]).toEqual([5, 5, 5])
  })

  it('machucar aplica dano, acende o flash e avisa a morte UMA vez', () => {
    const { c, mortes } = montar()
    c.machucar(3, 'fall')
    expect(c.survival.health).toBeLessThan(20)
    expect(c.flashDeDano.value).toBe(1)
    expect(mortes).toEqual([])

    // ⚠️ MEIO SEGUNDO DE INVULNERABILIDADE (`survival.js`): o segundo golpe no
    // mesmo instante NAO entra. E de proposito - sem ele, ficar dentro do fogo
    // seria sessenta danos por segundo.
    c.machucar(999, 'lava')
    expect(c.survival.dead, 'a invulnerabilidade nao segurou o segundo golpe').toBe(false)

    // Passado o meio segundo, entra e mata.
    c.survival.hurtTimer = 0
    c.machucar(999, 'lava')
    expect(c.survival.dead).toBe(true)
    expect(mortes).toEqual(['lava'])
  })

  it('⚠️ a armadura AMENIZA o golpe do bicho e se gasta; a queda passa inteira', () => {
    const { c } = montar()
    c.survival.armadura.chestplate = { item: 'diamond_chestplate', dur: 528 }
    c.survival.armadura.helmet = { item: 'diamond_helmet', dur: 363 }
    // 11 pontos → 44% a menos: 10 de dano viram 5,6 → 6 (arredonda).
    c.machucar(10, 'mob')
    expect(c.survival.health).toBe(14)
    expect(c.survival.armadura.chestplate.dur, 'gastou dano/4').toBe(526)
    expect(c.survival.armadura.helmet.dur).toBe(361)
    c.survival.hurtTimer = 0
    c.machucar(10, 'fall')
    expect(c.survival.health, 'a queda não é amenizada').toBe(4)
    expect(c.survival.armadura.chestplate.dur, 'e não gasta').toBe(526)
  })

  it('⚠️ a GUARDA com escudo apara o golpe pela frente, gasta o escudo e não toca na armadura', () => {
    const gastos = []
    const { c } = montar({
      itemNaMao: () => ({ tool: { kind: 'shield' } }),
      gastarEscudo: (n) => gastos.push(n),
    })
    c.survival.armadura.chestplate = { item: 'iron_chestplate', dur: 240 }
    c.levantarGuarda()
    expect(c.guardaLevantada()).toBe(true)
    // yaw 0 olha para −Z: o bicho em z = −2 está NA FRENTE.
    c.machucar(4, 'mob', { x: c.corpo.x, z: c.corpo.z - 2 })
    expect(c.survival.health, 'o escudo aparou tudo').toBe(20)
    expect(gastos, 'golpe forte: 1 + o dano').toEqual([5])
    expect(c.survival.armadura.chestplate.dur, 'a armadura nem se gastou').toBe(240)
    // Pelas COSTAS passa (amenizado pela armadura de 6 pontos: 4 × 0,76 → 3).
    c.survival.hurtTimer = 0
    c.machucar(4, 'mob', { x: c.corpo.x, z: c.corpo.z + 2 })
    expect(c.survival.health).toBe(17)
    // Guarda baixa: passa.
    c.baixarGuarda()
    c.survival.hurtTimer = 0
    c.machucar(4, 'mob', { x: c.corpo.x, z: c.corpo.z - 2 })
    expect(c.survival.health).toBe(14)
    expect(gastos).toEqual([5])
  })

  // ⚠️ O RETORNO DO `machucar` É O QUE SEGURA O TRANCO.
  //
  // Até 19/09/2026 a guarda cortava o dano e o empurrão passava inteiro: o
  // escudo aparava a pancada do zumbi e o jogador saía voando do mesmo jeito.
  // Quem empurra é o MUNDO (`useRoqueCraftEntidades`), não o corpo — então o
  // corpo precisa DIZER que aparou, e é isso que estas linhas prendem.
  it('machucar diz se a guarda aparou, e só a aparada CHEIA conta', () => {
    const { c } = montar({ itemNaMao: () => ({ tool: { kind: 'shield' } }) })
    c.levantarGuarda()
    // Escudo pela frente: aparada cheia, nada passa.
    const comEscudo = c.machucar(4, 'mob', { x: c.corpo.x, z: c.corpo.z - 2 })
    expect(comEscudo, 'o escudo aparou tudo e não disse').toEqual({ aparado: true, aplicado: 0 })
    // Pelas costas o escudo não pega: não é aparada, e o tranco tem que vir.
    c.survival.hurtTimer = 0
    const pelasCostas = c.machucar(4, 'mob', { x: c.corpo.x, z: c.corpo.z + 2 })
    expect(pelasCostas.aparado, 'pelas costas não é aparada').toBe(false)
    expect(pelasCostas.aplicado).toBeGreaterThan(0)
  })

  it('a mão vazia corta metade, mas NÃO é aparada: o tranco continua', () => {
    const { c } = montar({ itemNaMao: () => null })
    c.levantarGuarda()
    const r = c.machucar(4, 'mob', { x: c.corpo.x, z: c.corpo.z - 2 })
    // `aparar` devolve `passa: ceil(4 × 0,5)` = 2: cortou, não parou.
    expect(r.aparado, 'meia guarda virou aparada cheia e o tranco sumiu').toBe(false)
    expect(r.aplicado, 'metade do golpe passou').toBe(2)
  })

  it('fora da sobrevivência o resultado ainda tem forma (ninguém lê undefined)', () => {
    const { c } = montar({ modo: () => 'creative' })
    expect(c.machucar(9, 'mob')).toEqual({ aparado: false, aplicado: 0 })
  })

  // ⚠️ A POÇÃO INSTANTÂNEA PASSAVA POR OMISSÃO. `tomarEfeito('dano')` é o único
  // caminho do jogo que chama `machucar` com a fonte 'magic', e nenhum teste o
  // exercia: a poção podia ter parado de ferir sem nada acusar. Achado do
  // revisor na Onda 2, e o endereço é este porque a fonte importa — 'magic'
  // NÃO está em `FONTES_APARADAS`, então nem o escudo levantado a segura.
  it('a poção instantânea fere e cura pelo caminho do corpo, e o escudo não apara magia', () => {
    const { c } = montar({ itemNaMao: () => ({ tool: { kind: 'shield' } }) })
    c.levantarGuarda()
    const cheia = c.survival.health
    expect(c.tomarEfeito('dano', 1), 'a poção de dano não fez nada').toBe(true)
    expect(c.survival.health, 'o escudo aparou magia').toBe(cheia - 3)

    c.survival.hurtTimer = 0
    expect(c.tomarEfeito('cura', 1), 'a poção de cura não fez nada').toBe(true)
    expect(c.survival.health).toBe(cheia)

    // O borrifo manda os pontos já minguados pela distância: quem decide o
    // quanto é ele, não a tabela do nível.
    c.survival.hurtTimer = 0
    c.tomarEfeito('dano', 1, null, 1)
    expect(c.survival.health, 'o borrifo minguado bateu como o gole cheio').toBe(cheia - 1)
  })

  it('a guarda decide pelo item NA HORA do golpe: trocou pra espada, o escudo não apara', () => {
    let naMao = { tool: { kind: 'shield' } }
    const { c } = montar({ itemNaMao: () => naMao })
    c.levantarGuarda()
    naMao = { tool: { kind: 'sword' } }
    c.machucar(4, 'mob', { x: c.corpo.x, z: c.corpo.z - 2 })
    expect(c.survival.health).toBe(16)
    // Mão vazia: o braço segura metade do golpe de bicho, e nada da flecha.
    naMao = null
    c.survival.hurtTimer = 0
    c.machucar(4, 'mob', { x: c.corpo.x, z: c.corpo.z - 2 })
    expect(c.survival.health).toBe(14)
    c.survival.hurtTimer = 0
    c.machucar(4, 'arrow', { x: c.corpo.x, z: c.corpo.z - 2 })
    expect(c.survival.health).toBe(10)
  })

  it('⚠️ o VAZIO machuca: abaixo do piso do mundo a vida cai a cada meio segundo', () => {
    // Um mundo sem chão nenhum: o Fim fora da ilha.
    const { c, mortes } = montar({
      world: { ...mundoPlano(), solidAt: () => 0, isLoaded: () => true },
    })
    c.corpo.y = -3
    rodar(c, 6)
    expect(c.survival.health, 'ainda acima do limiar').toBe(20)
    c.corpo.y = -10
    c.corpo.vy = 0
    rodar(c, 2)
    expect(c.survival.health).toBe(16)
    // A invulnerabilidade dita o ritmo: meio segundo depois, mais quatro.
    rodar(c, 40)
    expect(c.survival.health).toBeLessThanOrEqual(12)
    // E mata, com a CAUSA certa: é ela que vira "O vazio não tem chão" na tela.
    for (let i = 0; i < 20 && !c.survival.dead; i++) {
      c.corpo.y = -10
      c.corpo.vy = 0
      rodar(c, 40)
    }
    expect(c.survival.dead).toBe(true)
    expect(mortes).toEqual(['void'])
  })

  it('o instantâneo aceita os pontos já minguados pelo borrifo', () => {
    const { c } = montar()
    c.machucar(10, 'fall')
    c.survival.hurtTimer = 0
    c.tomarEfeito('cura', 2, null, 2)
    expect(c.survival.health, 'curou 2 e não os 6 do nível II').toBe(12)
    c.tomarEfeito('cura', 2)
    expect(c.survival.health, 'sem pontos, a dose cheia').toBe(18)
  })

  it('no CRIATIVO nada machuca', () => {
    const { c, mortes } = montar({ modo: () => 'creative' })
    c.machucar(999, 'lava')
    expect(c.survival.health, 'o criativo levou dano').toBe(20)
    expect(mortes).toEqual([])
  })

  it('a lava machuca, e o cacto NÃO soma no mesmo quadro', () => {
    // Somar os dois faria a lava com cacto no fundo tirar o dobro, o que o
    // jogador leria como "a lava às vezes mata mais rápido".
    const cactoId = BLOCK_BY_KEY.cactus?.id
    const naLava = mundoPlano(64, {
      getBlock: (x, y) => (y > 64 ? ID.lava : (cactoId ?? BLOCK_BY_KEY.stone.id)),
      solidAt: () => 0,
    })
    const { c } = montar({ world: naLava })
    c.porEm(0.5, 66, 0.5)
    const antes = c.survival.health
    rodar(c, 60)
    expect(c.survival.health, 'a lava não machucou').toBeLessThan(antes)
  })

  it('renascerEm zera a velocidade, o flash e a queda', () => {
    const { c } = montar()
    c.porEm(0.5, 90, 0.5)
    rodar(c, 60)
    c.machucar(5, 'fall')
    c.renascerEm({ x: 7, y: 71, z: 8 })
    expect([c.corpo.x, c.corpo.y, c.corpo.z]).toEqual([7, 71, 8])
    expect([c.corpo.vx, c.corpo.vy, c.corpo.vz]).toEqual([0, 0, 0])
    // Sem zerar `fallStart`, renascer conta a queda toda que o corpo já tinha.
    expect(c.corpo.fallStart).toBe(71)
    expect(c.flashDeDano.value).toBe(0)
    expect(c.survival.health).toBe(20)
  })

  it('o balanço de câmera respeita o interruptor de acessibilidade', () => {
    const ligado = montar({ teclas: { KeyD: true, ControlLeft: true } })
    ligado.c.porEm(0.5, 66, 0.5)
    rodar(ligado.c, 200)
    const desligado = montar({
      teclas: { KeyD: true, ControlLeft: true },
      ajustes: { viewBob: false },
    })
    desligado.c.porEm(0.5, 66, 0.5)
    rodar(desligado.c, 200)
    // Quem desliga o balanço quer menos solavanco: a inclinação volta ao neutro.
    expect(desligado.c.entradaDaCamera()).toEqual({ strafe: 0, correndo: false })
    expect(
      ligado.c.entradaDaCamera().strafe,
      'o balanço ficou neutro com o efeito ligado',
    ).not.toBe(0)
  })

  it('o passo avisa quem precisa saber que o jogador andou', () => {
    // É por aqui que o sync de blocos do multijogador se recentra: sem isso,
    // quem anda pra longe para de ver o que o amigo constrói.
    const { c, andou } = montar()
    c.porEm(10, 66, 20)
    rodar(c, 3)
    expect(andou.length).toBe(3)
    expect(andou[0][0]).toBeCloseTo(10, 1)
  })

  it('o direcional do celular entra no mesmo lugar que o teclado', () => {
    const semCelular = montar({ direcional: () => ({ x: 0, y: -1 }), ehCelular: false })
    semCelular.c.porEm(0.5, 66, 0.5)
    rodar(semCelular.c, 120)
    const comCelular = montar({ direcional: () => ({ x: 0, y: -1 }), ehCelular: true })
    comCelular.c.porEm(0.5, 66, 0.5)
    rodar(comCelular.c, 120)
    const parado = Math.hypot(semCelular.c.corpo.x - 0.5, semCelular.c.corpo.z - 0.5)
    const andando = Math.hypot(comCelular.c.corpo.x - 0.5, comCelular.c.corpo.z - 0.5)
    expect(parado, 'o direcional andou sem ser celular').toBeLessThan(0.01)
    expect(andando, 'o direcional do celular não moveu ninguém').toBeGreaterThan(1)
  })

  it('sem áudio (antes do primeiro gesto) o passo não quebra', () => {
    const { c } = montar({ semAudio: true, teclas: { KeyW: true } })
    c.porEm(0.5, 66, 0.5)
    expect(() => rodar(c, 200)).not.toThrow()
  })

  it('aguardandoTerreno acende quando a coluna não chegou', () => {
    // `carregado` é o que impede a física de rodar contra um mundo que ainda não
    // chegou - a causa do jogador cair pelo cenário.
    const vazio = mundoPlano(64, { isLoaded: () => false })
    const { c } = montar({ world: vazio })
    c.porEm(0.5, 80, 0.5)
    const y = c.corpo.y
    rodar(c, 120)
    expect(c.aguardandoTerreno.value, 'a física rodou contra o vazio').toBe(true)
    expect(c.corpo.y, 'o jogador caiu pelo cenário').toBe(y)
  })

  it('vi está disponível (guarda de sanidade do arquivo)', () => {
    expect(typeof vi.fn).toBe('function')
  })
})
