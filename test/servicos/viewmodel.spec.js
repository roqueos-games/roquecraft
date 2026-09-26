import { describe, it, expect, beforeAll } from 'vitest'
import * as THREE from 'three'
import { createViewModel } from '../../src/servicos/render/viewmodel.js'
import { GOLPES } from '../../src/servicos/pecaNaMao.js'

// A mão em primeira pessoa passou uma rodada inteira de QA "invisível" e não
// havia nada de errado com o render: a cena estava montada, a luz estava lá, o
// draw call acontecia. O rig é que nascia ABAIXO da borda inferior do frustum
// (punho em y=-0.76 com meia-altura de 0.344). Um teste que só perguntasse "a
// mão está na cena?" seguiria verde.
//
// Por isso este arquivo faz a única pergunta que importa: PROJETADA na câmera
// do viewmodel, a mão cai dentro do quadro? Em repouso, no pico do golpe, e em
// aspectos de tela largos e estreitos.
const CANTOS = { NDC: 1 }

function stubCanvas() {
  // jsdom não tem contexto 2D. `grain()` só precisa de fillStyle/fillRect.
  HTMLCanvasElement.prototype.getContext = function () {
    return {
      fillStyle: '',
      fillRect: () => {},
      drawImage: () => {},
      getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    }
  }
}

const fakeRenderer = () => ({
  autoClear: true,
  clearDepth: () => {},
  render: () => {},
})

// NDC de um objeto na câmera do viewmodel.
function ndc(vm, obj) {
  vm.scene.updateMatrixWorld(true)
  vm.camera.updateMatrixWorld(true)
  const p = new THREE.Vector3()
  obj.getWorldPosition(p)
  return p.project(vm.camera)
}

// VARRE o golpe inteiro em vez de olhar um instante.
//
// A versão anterior avançava direto pro "pico", assumindo sin(t·π) com máximo
// em t = 0.5. A curva do original é sin(sqrt(t)·π), cujo pico está em t = 0.25:
// o mesmo teste continuaria verde olhando pro meio da volta, e o pico de
// verdade passaria sem ninguém medir. Varrer o ciclo não depende de saber onde
// é o pico - e continua valendo se a curva mudar de novo.
function varreOGolpe(vm, tipo, fn) {
  vm.swing(tipo)
  // ⚠️ LIDO DA TABELA, não cravado. A versão anterior tinha `3.2 : 5.4` no
  // fonte; quando a onda 10 ancorou o golpe na duração canônica (0,3 s), o
  // teste passou a avançar o relógio com a velocidade ERRADA e acusou o pico em
  // 38% do ciclo — um defeito do instrumento, não do jogo.
  const vel = tipo === 'dig' ? GOLPES.cavar.velocidade : GOLPES.padrao.velocidade
  const passos = 24
  for (let i = 0; i <= passos; i++) {
    vm.update(1 / vel / passos, { moving: true })
    fn(i / passos)
  }
}

describe('viewmodel (mão em primeira pessoa)', () => {
  beforeAll(stubCanvas)

  const ASPECTOS = [
    { nome: 'ultrawide 21:9', a: 21 / 9 },
    { nome: 'desktop 16:9', a: 16 / 9 },
    { nome: 'janela 1100x700', a: 1100 / 700 },
    { nome: 'tablet 4:3', a: 4 / 3 },
    { nome: 'quadrado', a: 1 },
    { nome: 'retrato 3:4', a: 0.75 },
  ]

  for (const { nome, a } of ASPECTOS) {
    it(`a mão fica DENTRO do quadro em ${nome}`, () => {
      const vm = createViewModel(fakeRenderer())
      vm.resize(a)
      vm.setHeld({ kind: 'tool', tier: 'diamond' })

      // repouso
      vm.update(0.016, { moving: false })
      let p = ndc(vm, vm.partes.mao)
      expect(Math.abs(p.x), `${nome}: mão fora na horizontal (x=${p.x.toFixed(2)})`).toBeLessThan(
        CANTOS.NDC,
      )
      expect(Math.abs(p.y), `${nome}: mão fora na vertical (y=${p.y.toFixed(2)})`).toBeLessThan(
        CANTOS.NDC,
      )
      expect(p.z, `${nome}: mão atrás do near/far plane`).toBeLessThan(1)

      // o GOLPE INTEIRO: é onde a pose viaja mais, e onde a versão anterior
      // saía do quadro pela borda de baixo (medido: y = -1.03)
      for (const tipo of ['dig', 'hit']) {
        varreOGolpe(vm, tipo, (t) => {
          const q = ndc(vm, vm.partes.mao)
          expect(
            Math.abs(q.x),
            `${nome}: mão fora em ${tipo} t=${t.toFixed(2)} (x=${q.x.toFixed(2)})`,
          ).toBeLessThan(CANTOS.NDC)
          expect(
            Math.abs(q.y),
            `${nome}: mão fora em ${tipo} t=${t.toFixed(2)} (y=${q.y.toFixed(2)})`,
          ).toBeLessThan(CANTOS.NDC)
        })
      }

      // o CUBO na mão também. É o objeto mais largo do rig e o que mais tende a
      // vazar pela borda.
      vm.setBlockMaterial(new THREE.MeshStandardMaterial())
      vm.setHeld({ kind: 'block', faceLayers: [1, 1, 0, 2, 1, 1] })
      vm.update(0.016, { moving: false })
      const cubo = ndc(vm, vm.partes.bloco())
      expect(Math.abs(cubo.x), `${nome}: cubo na mão fora (x=${cubo.x.toFixed(2)})`).toBeLessThan(
        CANTOS.NDC,
      )
      expect(Math.abs(cubo.y), `${nome}: cubo na mão fora (y=${cubo.y.toFixed(2)})`).toBeLessThan(
        CANTOS.NDC,
      )

      // a cabeça da ferramenta também: mão dentro e picareta fora é o mesmo bug
      vm.setHeld({ kind: 'tool', tier: 'diamond' })
      vm.update(0.016, { moving: false })
      const t = ndc(vm, vm.partes.cabecaFerramenta)
      expect(
        Math.abs(t.x),
        `${nome}: cabeça da ferramenta fora (x=${t.x.toFixed(2)})`,
      ).toBeLessThan(CANTOS.NDC)
      expect(
        Math.abs(t.y),
        `${nome}: cabeça da ferramenta fora (y=${t.y.toFixed(2)})`,
      ).toBeLessThan(CANTOS.NDC)
      vm.dispose()
    })
  }

  // Não basta "está no quadro": já esteve no quadro E no meio da mira, com o
  // braço todo fora por baixo (QA de 2026-08-20, print 'm1-mao'). A pose certa
  // é canto INFERIOR DIREITO, e a ponta da ferramenta subindo pro centro.
  it('em repouso a mão fica no canto inferior direito, não sobre a mira', () => {
    const vm = createViewModel(fakeRenderer())
    vm.resize(16 / 9)
    vm.setHeld({ kind: 'tool', tier: 'iron' })
    vm.update(0.016, { moving: false })
    const p = ndc(vm, vm.partes.mao)
    expect(p.y, 'a mão em repouso fica bem abaixo do centro').toBeLessThan(-0.35)
    expect(p.x, 'a mão em repouso vem do lado direito').toBeGreaterThan(0.4)
    // a ponta da ferramenta sobe pro centro-direita, mas não POR CIMA da mira
    const t = ndc(vm, vm.partes.cabecaFerramenta)
    expect(t.y, 'a cabeça da ferramenta não pode cobrir a mira').toBeLessThan(-0.05)
    expect(t.x, 'a ferramenta aponta do lado direito').toBeGreaterThan(0.15)
    vm.dispose()
  })

  it('o cotovelo sai POR BAIXO do quadro (o braço tem que vir de algum lugar)', () => {
    const vm = createViewModel(fakeRenderer())
    vm.resize(16 / 9)
    vm.update(0.016, { moving: false })
    const p = ndc(vm, vm.partes.rig)
    expect(p.y, 'a origem do rig fica fora do quadro, embaixo').toBeLessThan(-1)
    vm.dispose()
  })

  it('o golpe move a mão de verdade (senão a animação é decorativa)', () => {
    const vm = createViewModel(fakeRenderer())
    vm.resize(16 / 9)
    vm.update(0.016, { moving: false })
    const repouso = ndc(vm, vm.partes.mao).clone()
    let maior = 0
    varreOGolpe(vm, 'hit', () => {
      maior = Math.max(maior, repouso.distanceTo(ndc(vm, vm.partes.mao)))
    })
    expect(maior, 'o balanço praticamente não move a mão').toBeGreaterThan(0.15)
    vm.dispose()
  })

  it('minerar segurando o botão religa o ciclo, e soltar para', () => {
    const vm = createViewModel(fakeRenderer())
    vm.resize(16 / 9)
    vm.digging(true)
    vm.update(0.2, { moving: false })
    const meio = ndc(vm, vm.partes.mao).clone()
    vm.digging(false)
    // depois de soltar, o ciclo termina e a mão volta pro repouso
    for (let i = 0; i < 40; i++) vm.update(0.05, { moving: false })
    const fim = ndc(vm, vm.partes.mao)
    expect(meio.distanceTo(fim), 'soltar o botão devia devolver a mão ao repouso').toBeGreaterThan(
      0.05,
    )
    vm.dispose()
  })

  it('setVisible(false) some com o rig (senão a mão flutua atrás do inventário)', () => {
    const vm = createViewModel(fakeRenderer())
    vm.setVisible(false)
    expect(vm.partes.rig.visible).toBe(false)
    vm.setVisible(true)
    expect(vm.partes.rig.visible).toBe(true)
    vm.dispose()
  })

  it('o bloco na mão só aparece quando o item é bloco', () => {
    const vm = createViewModel(fakeRenderer())
    vm.setBlockMaterial(new THREE.MeshStandardMaterial())
    const bloco = vm.partes.bloco()
    expect(bloco.visible, 'mão vazia não mostra cubo').toBe(false)

    vm.setHeld({ kind: 'block', faceLayers: [4, 4, 9, 3, 4, 4] })
    expect(bloco.visible).toBe(true)
    // as camadas foram PRA GEOMETRIA. Sem isto o shader amostra a camada 0 e o
    // cubo sai preto - o defeito real de 2026-08-20.
    const L = bloco.geometry.getAttribute('aLayer').array
    expect([...L.slice(0, 4)], '+x usa a camada lateral').toEqual([4, 4, 4, 4])
    expect([...L.slice(8, 12)], '+y usa a camada do topo').toEqual([9, 9, 9, 9])
    expect([...L.slice(12, 16)], '-y usa a camada da base').toEqual([3, 3, 3, 3])
    // luz cheia, senão o cubo nasce preto mesmo com a camada certa
    const luz = bloco.geometry.getAttribute('aLight').array
    expect(luz[0], 'AO cheio').toBe(255)
    expect(luz[1], 'luz do céu cheia').toBe(255)

    vm.setHeld({ kind: 'tool', tier: 'iron' })
    expect(bloco.visible, 'segurando ferramenta não mostra cubo').toBe(false)
    expect(vm.partes.cabecaFerramenta.parent.visible).toBe(true)

    vm.setHeld({ kind: 'hand' })
    expect(vm.partes.cabecaFerramenta.parent.visible).toBe(false)
    vm.dispose()
  })

  it('bloco sem as seis camadas resolvidas não vira cubo preto: some', () => {
    const vm = createViewModel(fakeRenderer())
    vm.setBlockMaterial(new THREE.MeshStandardMaterial())
    vm.setHeld({ kind: 'block', faceLayers: [1, 1, -1, 1, 1, 1] })
    expect(vm.partes.bloco().visible, 'camada -1 é textura desconhecida').toBe(false)
    vm.setHeld({ kind: 'block' })
    expect(vm.partes.bloco().visible, 'sem camadas nenhuma').toBe(false)
    vm.dispose()
  })

  it('o tint do bloco chega na geometria (grama na mão não pode sair cinza)', () => {
    const vm = createViewModel(fakeRenderer())
    vm.setBlockMaterial(new THREE.MeshStandardMaterial())
    vm.setHeld({ kind: 'block', faceLayers: [1, 1, 2, 3, 1, 1], tint: 0x86b356 })
    const T = vm.partes.bloco().geometry.getAttribute('aTint').array
    expect([T[0], T[1], T[2]]).toEqual([0x86, 0xb3, 0x56])
    vm.dispose()
  })
})

// A ASSINATURA da animação do original é a curva, não a pose. Lá o braço é
// movido por sin(sqrt(t)·π): dispara e volta devagar. Uma senoide simples sobe
// e desce igual, e o golpe vira aceno. Este teste mede a assimetria em vez de
// olhar a fórmula, então continua valendo se a implementação mudar de forma.
describe('viewmodel - o golpe ataca rápido e volta devagar', () => {
  beforeAll(stubCanvas)

  function trajetoria() {
    const vm = createViewModel(fakeRenderer())
    vm.resize(16 / 9)
    vm.swing('hit')
    const passos = 60
    const ys = []
    for (let i = 0; i < passos; i++) {
      vm.update(1 / GOLPES.padrao.velocidade / passos, { moving: false })
      ys.push(vm.partes.rig.rotation.x)
    }
    vm.dispose()
    return ys
  }

  it('o pico do golpe acontece no PRIMEIRO terço do ciclo', () => {
    const ys = trajetoria()
    // rotation.x fica mais NEGATIVO no pico (o braço derruba pra frente)
    let iPico = 0
    for (let i = 1; i < ys.length; i++) if (ys[i] < ys[iPico]) iPico = i
    const fracao = iPico / ys.length
    expect(
      fracao,
      `pico em ${(fracao * 100).toFixed(0)}% do ciclo - com senoide simples cai em 50%`,
    ).toBeLessThan(0.34)
  })

  it('a volta é mais longa que a ida', () => {
    const ys = trajetoria()
    let iPico = 0
    for (let i = 1; i < ys.length; i++) if (ys[i] < ys[iPico]) iPico = i
    const ida = iPico
    const volta = ys.length - iPico
    expect(volta, `ida ${ida} quadros, volta ${volta} - golpe sem peso`).toBeGreaterThan(ida * 1.6)
  })
})

describe('viewmodel — o cubo na mão e a cor da ferramenta', () => {
  const novo = () => {
    const vm = createViewModel(fakeRenderer())
    vm.setBlockMaterial(new THREE.MeshStandardMaterial())
    return vm
  }

  it('a camada ZERO é uma textura válida: o primeiro bloco da atlas aparece', () => {
    // ⚠️ `faceLayers.every((l) => Number.isFinite(l) && l >= 0)`. Apertado para
    // `>`, a camada 0 — a PRIMEIRA textura da atlas — passa a valer como "não
    // sei que textura é essa", e o bloco correspondente some da mão do jogador.
    // O bloco desaparece e nada fica vermelho.
    const vm = novo()
    vm.setHeld({ kind: 'block', faceLayers: [0, 0, 0, 0, 0, 0] })
    expect(vm.partes.bloco().visible).toBe(true)
  })

  it('camada -1 esconde o cubo: melhor mão vazia do que cubo errado', () => {
    const vm = novo()
    vm.setHeld({ kind: 'block', faceLayers: [1, 1, -1, 2, 1, 1] })
    expect(vm.partes.bloco().visible).toBe(false)
  })

  it('as quatro condições do cubo valem JUNTAS', () => {
    // Cada `&&` virado deixa passar um cubo mal formado: sem ser bloco, sem
    // lista, com menos de seis faces, ou com camada inválida.
    const vm = novo()
    vm.setHeld({ kind: 'tool', faceLayers: [0, 0, 0, 0, 0, 0] })
    expect(vm.partes.bloco().visible, 'ferramenta não é bloco').toBe(false)

    vm.setHeld({ kind: 'block', faceLayers: null })
    expect(vm.partes.bloco().visible, 'sem lista de camadas').toBe(false)

    vm.setHeld({ kind: 'block', faceLayers: [0, 0, 0] })
    expect(vm.partes.bloco().visible, 'faltam faces').toBe(false)

    vm.setHeld({ kind: 'block', faceLayers: [0, 0, NaN, 0, 0, 0] })
    expect(vm.partes.bloco().visible, 'camada não numérica').toBe(false)
  })

  it('nível de ferramenta desconhecido cai na cor da madeira', () => {
    // `TIER_COLOR[tier] || TIER_COLOR.wood` virando `&&`: um nível conhecido
    // devolve a cor da MADEIRA (todas as picaretas ficam iguais na tela) e um
    // nível desconhecido devolve `undefined`, que vira `NaN` na textura.
    //
    // ⚠️ A cor NÃO está em `material.color` — ela é pintada dentro da textura
    // de ruído (`grain(hex, seed)`), então quem responde é o `fillStyle` do
    // canvas. Perguntar ao `color` daria branco nos três casos e o teste
    // passaria com o defeito no lugar.
    const pintadas = []
    const originalGetContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function () {
      return {
        set fillStyle(v) {
          pintadas.push(v)
        },
        get fillStyle() {
          return pintadas[pintadas.length - 1]
        },
        fillRect: () => {},
        drawImage: () => {},
        getImageData: () => ({ data: new Uint8ClampedArray(4) }),
      }
    }
    try {
      const vm = novo()

      pintadas.length = 0
      vm.setHeld({ kind: 'tool', tier: 'diamond' })
      const diamante = [...pintadas]

      pintadas.length = 0
      vm.setHeld({ kind: 'tool', tier: 'wood' })
      const madeira = [...pintadas]
      expect(diamante).not.toEqual(madeira)

      pintadas.length = 0
      vm.setHeld({ kind: 'tool', tier: 'netherite-inexistente' })
      expect(pintadas).toEqual(madeira)
      expect(pintadas.every((c) => !String(c).includes('NaN'))).toBe(true)
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext
    }
  })

  it('o golpe termina quando o ciclo COMPLETA, não depois dele', () => {
    // `tSwing >= 1` apertado para `>`: o golpe simples fica um quadro a mais
    // no ar, e o de mineração — que reinicia em vez de terminar — atrasa o
    // ciclo inteiro. Um quadro por golpe, em cada golpe.
    const vm = novo()
    vm.swing('hit')
    // 5.4 por segundo: um passo de exatamente 1/5.4 leva tSwing a 1.
    vm.update(1 / 5.4, { moving: false })
    // Terminou: um novo `update` não mexe mais no ciclo.
    const depois = vm.partes.mao.rotation.x
    vm.update(0.5, { moving: false })
    expect(vm.partes.mao.rotation.x).toBeCloseTo(depois, 6)
  })
})

//
// CAVAR É OUTRO GESTO, E ELE PRECISA GANHAR DE QUEM ESTIVER BATENDO — onda 10.
//
describe('viewmodel - segurar para cavar', () => {
  beforeAll(stubCanvas)

  const novo = () => {
    const vm = createViewModel(fakeRenderer())
    vm.resize(16 / 9)
    return vm
  }

  it('segurar o botão põe o gesto de CAVAR para correr', () => {
    const vm = novo()
    vm.digging(true)
    const e = vm.estadoDoGolpe()
    expect(e.ativo).toBe(true)
    expect(e.tipo).toBe('dig')
    vm.dispose()
  })

  it('⚠️ cavar TOMA O CONTROLE de um golpe de ataque já correndo', () => {
    // O defeito: `breakBlock` dispara `swing('hit')` a cada bloco que cai, então
    // quem quebra rápido está SEMPRE com um ataque ativo — e a condição antiga
    // (`if (on && !ativo)`) fazia o gesto de cavar nunca entrar. A sonda mediu
    // doze amostras seguidas com `tipo: "hit"` segurando o botão com picareta.
    const vm = novo()
    vm.swing('hit')
    expect(vm.estadoDoGolpe().tipo).toBe('hit')
    vm.digging(true)
    expect(vm.estadoDoGolpe().tipo, 'o ataque engoliu o gesto de cavar').toBe('dig')
    vm.dispose()
  })

  it('mas NÃO reinicia um ciclo de cavar que já está correndo', () => {
    // Reiniciar a cada quadro faria a ferramenta tremer no lugar de girar.
    const vm = novo()
    vm.digging(true)
    vm.update(0.1, { moving: false })
    const meio = vm.estadoDoGolpe().tSwing
    expect(meio).toBeGreaterThan(0)
    vm.digging(true)
    expect(vm.estadoDoGolpe().tSwing).toBe(meio)
    vm.dispose()
  })

  it('o ciclo de cavar REINICIA sozinho em vez de acabar', () => {
    const vm = novo()
    vm.digging(true)
    // Uma volta inteira e um tico.
    for (let i = 0; i < 20; i++) vm.update(1 / GOLPES.cavar.velocidade / 15, { moving: false })
    const e = vm.estadoDoGolpe()
    expect(e.ativo, 'cavar parou no fim da primeira volta').toBe(true)
    expect(e.tipo).toBe('dig')
    vm.dispose()
  })

  it('soltar o botão encerra', () => {
    const vm = novo()
    vm.digging(true)
    vm.digging(false)
    expect(vm.estadoDoGolpe().ativo).toBe(false)
    vm.dispose()
  })

  it('soltar o botão NÃO encerra um ataque que não é de cavar', () => {
    const vm = novo()
    vm.swing('hit')
    vm.digging(false)
    expect(vm.estadoDoGolpe().ativo, 'soltar de cavar matou o golpe de bater').toBe(true)
    vm.dispose()
  })

  it('cavar tem o MESMO ritmo com qualquer ferramenta — dig vence a classe', () => {
    const vm = novo()
    vm.setHeld({ kind: 'peca', classe: 'pickaxe', tier: 'iron' })
    vm.digging(true)
    const comPicareta = vm.estadoDoGolpe().velocidade
    vm.digging(false)
    vm.setHeld({ kind: 'peca', classe: 'sword', tier: 'iron' })
    vm.digging(true)
    expect(vm.estadoDoGolpe().velocidade).toBe(comPicareta)
    expect(comPicareta).toBe(GOLPES.cavar.velocidade)
    vm.dispose()
  })
})
