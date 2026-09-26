import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildMobModel, anguloDeFrente, girarPara } from '../../src/servicos/render/entities.js'
import { MOB_TYPES, MOB_KEYS } from '../../src/servicos/mobs.js'

/**
 * OS PERSONAGENS ESTÃO DE PÉ E DE FRENTE?
 *
 * O founder relatou em 2026-08-23: "estão tortos e sem sentido, a cabeça pro
 * lado errado". Estava certo, e o defeito era único e geral — os modelos tinham
 * a cara em −Z e o renderizador apontava o +Z pra direção do movimento. Todo
 * mob do jogo andava de ré, nas quatro direções.
 *
 * Isso não é coisa que se pega olhando print: de longe, um porco de ré parece
 * só um porco. Pega-se medindo o vetor.
 *
 * Aqui mora a parte que é GEOMETRIA e por isso é afirmável sem olho: convenção
 * de frente, altura contra a caixa de colisão, pé no chão, pivô no lugar e fase
 * do passo. O que é composição — se a vaca parece uma vaca — é o turntable
 * (`scripts/qa-roquecraft-mobs.mjs`), e esse a máquina não decide.
 */

// jsdom não tem canvas 2D e o grão procedural precisa de um. A textura não é o
// assunto desta spec: um ctx de mentira basta e mantém a spec sobre geometria.
//
// ⚠️ No topo do módulo, não em `beforeAll`. Os modelos são montados na hora de
// COLETAR os testes (`it.each` precisa da lista pronta), e `beforeAll` só roda
// depois disso — a primeira versão morria na coleta.
{
  const ctx2d = {
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData: () => {},
    measureText: () => ({ width: 80 }),
    fillText: () => {},
    fillRect: () => {},
    beginPath: () => {},
    roundRect: () => {},
    fill: () => {},
    set font(_v) {},
    set fillStyle(_v) {},
    set textAlign(_v) {},
    set textBaseline(_v) {},
  }
  HTMLCanvasElement.prototype.getContext = () => ctx2d
}

const FRENTE = new THREE.Vector3(0, 0, 1)

/** Para onde a frente do modelo aponta no mundo, com este `rotation.y`. */
function paraOndeOlha(rotY) {
  const o = new THREE.Object3D()
  o.rotation.y = rotY
  o.updateMatrixWorld()
  return FRENTE.clone().applyQuaternion(o.quaternion)
}

function caixa(obj) {
  obj.updateMatrixWorld(true)
  return new THREE.Box3().setFromObject(obj)
}

/** Toda caixa do modelo, em mundo, com 2 cm de folga: encostado conta. */
function pecasDe(g) {
  const out = []
  g.updateMatrixWorld(true)
  g.traverse((o) => {
    if (o.isMesh) out.push({ o, b: caixa(o).expandByScalar(0.02) })
  })
  return out
}

/** Só as pernas: o braço do zumbi também entra em `andar`, e ele não é pata. */
const pernasDe = (g) => (g.userData.andar || []).filter((p) => p.parte !== 'braco')

const ondeFica = (c) => {
  const p = new THREE.Vector3()
  c.o.getWorldPosition(p)
  return `(${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`
}

describe('roquecraft - convenção de frente', () => {
  /*
   * O TESTE QUE TERIA PEGADO O DEFEITO ORIGINAL.
   *
   * `atan2(mx, mz)` num modelo de cara pra −Z dava dot = −1.00: de ré em todas
   * as direções. Com a cara em +Z o mesmo ângulo dá +1.00.
   */
  it('a frente aponta para a direção pedida, nas oito direções', () => {
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4
      const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a))
      const olha = paraOndeOlha(anguloDeFrente(dir.x, dir.z))
      expect(olha.dot(dir), `direção ${i} (${a.toFixed(2)} rad)`).toBeGreaterThan(0.999)
    }
  })

  it('rumo de mob e ângulo de câmera de jogador chegam na mesma frente', () => {
    // mob: yaw é rumo, yaw 0 olha pra +Z
    expect(paraOndeOlha(anguloDeFrente(Math.sin(0), Math.cos(0))).z).toBeCloseTo(1, 5)
    // jogador: yaw é de câmera, `direcaoDoOlhar` dá (sin, -cos); yaw 0 olha -Z
    expect(paraOndeOlha(anguloDeFrente(Math.sin(0), -Math.cos(0))).z).toBeCloseTo(-1, 5)
  })

  /*
   * Vetor nulo tem que devolver `null`, e não 0. Bicho parado com alvo 0 viraria
   * pro norte toda vez que parasse de andar — um rebanho inteiro se alinhando
   * sozinho é bem mais estranho que um bicho parado torto.
   */
  it('vetor nulo e NaN não viram ângulo', () => {
    expect(anguloDeFrente(0, 0)).toBeNull()
    expect(anguloDeFrente(NaN, 1)).toBeNull()
    expect(anguloDeFrente(1, undefined)).toBeNull()
  })
})

describe('roquecraft - giro sem estalo', () => {
  it('anda em direção ao alvo sem passar dele', () => {
    let a = 0
    for (let i = 0; i < 40; i++) a = girarPara(a, 1.2, 0.2)
    expect(a).toBeCloseTo(1.2, 3)
  })

  /*
   * O caminho curto do círculo. Sem normalizar a diferença, ir de +179° pra
   * −179° faz o bicho girar 358° — ele roda no próprio eixo à vista de todos
   * em vez de andar 2°.
   */
  it('vai de +179° a -179° pelo caminho curto', () => {
    const de = (179 * Math.PI) / 180
    const para = (-179 * Math.PI) / 180
    const passo = girarPara(de, para, 0.5)
    // meio caminho pelo curto passa POR 180°, não por 0
    expect(Math.abs(Math.atan2(Math.sin(passo - de), Math.cos(passo - de)))).toBeLessThan(0.04)
  })

  it('alvo nulo ou NaN mantém o ângulo — nunca vira NaN', () => {
    expect(girarPara(0.7, null, 0.5)).toBe(0.7)
    expect(girarPara(0.7, NaN, 0.5)).toBe(0.7)
    expect(Number.isFinite(girarPara(0.7, 1.2, 0.5))).toBe(true)
  })
})

describe('roquecraft - anatomia de cada espécie', () => {
  const modelos = MOB_KEYS.map((k) => [k, buildMobModel(k, false)])

  /*
   * ⚠️ A tolerância de flutuação é 4 cm, não 10.
   *
   * Com 10 cm a mutação "a tíbia da aranha encolhe" passava batido: o bicho
   * ficava pairando 8 cm e o teste dava verde. 8 cm num bicho de 78 cm é
   * visível — é a sombra descolada da pata. Todo modelo hoje mede pé = 0,000,
   * então a folga não precisa existir pra nada.
   */
  it.each(modelos)('%s: fica de pé no chão, sem afundar nem flutuar', (key, g) => {
    const b = caixa(g)
    expect(b.min.y, `${key} afunda no chão`).toBeGreaterThan(-0.04)
    expect(b.min.y, `${key} flutua`).toBeLessThan(0.04)
  })

  /*
   * O modelo tem que PREENCHER a caixa de colisão. Um bicho cujo desenho é bem
   * menor que a caixa apanha no ar e o tiro que passa raspando acerta; um bem
   * maior atravessa parede com a cabeça. Faixa de 85% a 115% da altura.
   */
  it.each(modelos)('%s: a altura do modelo bate com a caixa de colisão', (key, g) => {
    const alt = caixa(g).max.y
    const esperado = MOB_TYPES[key].height
    expect(alt / esperado, `${key}: modelo ${alt.toFixed(2)} vs caixa ${esperado}`).toBeGreaterThan(
      0.85,
    )
    expect(alt / esperado, `${key}: modelo ${alt.toFixed(2)} vs caixa ${esperado}`).toBeLessThan(
      1.15,
    )
  })

  it.each(modelos)('%s: a largura do modelo bate com a caixa de colisão', (key, g) => {
    const b = caixa(g)
    const larg = Math.max(b.max.x - b.min.x, b.max.z - b.min.z)
    // O comprimento de um quadrúpede é maior que a largura da caixa por
    // natureza; o limite existe pra pegar desproporção grosseira, não pra
    // impor cubo.
    expect(larg, `${key} largura ${larg.toFixed(2)}`).toBeGreaterThan(MOB_TYPES[key].width * 0.5)
    expect(larg, `${key} largura ${larg.toFixed(2)}`).toBeLessThan(MOB_TYPES[key].width * 2.2)
  })

  /*
   * A cabeça (ou o que faz as vezes dela) tem que estar do lado da FRENTE.
   * Era exatamente o contrário: `-bodyLen*0.62`. A aranha não tem cabeça
   * separada — ela vira o corpo — então o que se exige dela são os olhos.
   */
  it.each(modelos.filter(([k]) => k !== 'spider'))('%s: a cabeça está à frente', (key, g) => {
    const cabeca = g.userData.cabeca
    expect(cabeca, `${key} não expôs a cabeça`).toBeTruthy()
    // ⚠️ A CLASSE VIROU REGRA EM VEZ DE LISTA DE NOMES. Era
    // `key === 'zombie' || key === 'skeleton'`, e o creeper — que também tem a
    // cabeça em cima, e é justamente isso que o faz parecer um creeper e não um
    // cachorro verde — teria que entrar na lista à mão. Uma lista de nomes num
    // guard é um convite a acrescentar o nome e seguir em frente; a proporção
    // classifica sozinha quem vier depois.
    const def = MOB_TYPES[key]
    const colunar = def.height / def.width >= 2.5
    if (colunar) {
      // Cabeça EM CIMA: o que se exige é altura...
      expect(caixa(cabeca).min.y, `${key}: cabeça baixa demais`).toBeGreaterThan(
        caixa(g).max.y * 0.6,
      )
      // ...E QUE ELA NÃO ESTEJA JOGADA PRA TRÁS. Sem esta parte, a exigência
      // anterior sozinha aprovaria uma cabeça pendurada na nuca — o teste
      // ficaria mais fraco pro colunar do que pro quadrúpede.
      const b = caixa(g)
      const fundo = Math.max(0.001, b.max.z - b.min.z)
      expect(Math.abs(cabeca.position.z) / fundo, `${key}: cabeça deslocada`).toBeLessThan(0.5)
    } else {
      expect(cabeca.position.z, `${key} tem a cabeça atrás`).toBeGreaterThan(0)
    }
  })

  /*
   * NENHUMA PEÇA SOLTA NO AR.
   *
   * O instrumento que faltava. A aranha tinha oito centímetros de vazio entre o
   * cefalotórax e o abdômen — uma cabeça flutuando — e o esqueleto segurava um
   * arco que estava a trinta centímetros da mão dele, porque eu o posicionei em
   * coordenada de mundo "onde o braço deveria estar". Nenhum dos dois aparece
   * numa medida de altura, largura ou fase; os dois aparecem aqui.
   *
   * Folga de 2 cm por lado: peça encostada tem que passar, peça a 5 cm não.
   */
  it.each(modelos)('%s: nenhuma peça flutua solta', (key, g) => {
    const partes = pecasDe(g)
    expect(partes.length, `${key} não tem peça nenhuma`).toBeGreaterThan(2)
    for (let i = 0; i < partes.length; i++) {
      const toca = partes.some((c, j) => j !== i && c.b.intersectsBox(partes[i].b))
      expect(toca, `${key}: peça ${ondeFica(partes[i])} não encosta em nada`).toBe(true)
    }
  })

  /*
   * ⚠️ "ENCOSTA EM ALGUMA COISA" NÃO BASTA — O TRONCO TEM QUE SER UM SÓ.
   *
   * A mutação que devolvia a cabeça flutuante da aranha PASSOU no teste acima,
   * e com razão: o cefalotórax solto ainda encostava nas patas, e as patas no
   * abdômen. Todo mundo encostava em alguém e o bicho continuava partido em
   * dois.
   *
   * É o mesmo erro do "bloco flutuando" no mundo, onde heurística por coluna
   * falhou e só conectividade respondeu. Aqui a pergunta certa é: tirando os
   * membros, o corpo forma UMA peça? Membro não pode servir de ponte entre duas
   * metades de tronco.
   */
  it.each(modelos)('%s: o tronco é uma peça só, sem membro fazendo de ponte', (key, g) => {
    const membros = new Set()
    for (const p of g.userData.andar || []) p.mesh.traverse((o) => membros.add(o))
    const tronco = pecasDe(g).filter((c) => !membros.has(c.o))
    expect(tronco.length, `${key}: tronco sem peça`).toBeGreaterThan(0)

    // Flood-fill sobre "encosta em": tem que sobrar um componente só.
    const vistos = new Set([0])
    const fila = [0]
    while (fila.length) {
      const i = fila.pop()
      tronco.forEach((c, j) => {
        if (!vistos.has(j) && c.b.intersectsBox(tronco[i].b)) {
          vistos.add(j)
          fila.push(j)
        }
      })
    }
    const soltas = tronco.filter((_, j) => !vistos.has(j)).map(ondeFica)
    expect(soltas, `${key}: tronco partido; desligado do resto: ${soltas.join(' ')}`).toEqual([])
  })

  /*
   * A CABEÇA PRECISA DE DEGRAU — a lição que só o print deu.
   *
   * Na primeira versão o porco e a vaca tinham a cabeça na mesma altura do
   * dorso: de perfil viravam um pão com pernas, sem cabeça nenhuma. Passava em
   * tudo — altura certa, peça encostando, nada flutuando — porque "tem cabeça"
   * não é a mesma pergunta que "dá pra VER a cabeça".
   *
   * Duas condições fazem a silhueta ter cabeça: ela termina ABAIXO do dorso, e
   * avança à FRENTE do peito. Vira asserção pra não voltar no próximo ajuste.
   */
  it.each(['pig', 'cow', 'sheep'])('%s: a cabeça se destaca da silhueta', (key) => {
    const g = buildMobModel(key, false)
    const corpo = caixa(g)
    const cab = caixa(g.userData.cabeca)
    expect(cab.max.y, `${key}: a cabeça está na altura do dorso e some no perfil`).toBeLessThan(
      corpo.max.y - 0.04,
    )
    // o focinho e as orelhas podem passar do corpo; o que importa é a cabeça
    // adiantar-se o suficiente pra recortar contra o fundo.
    const frenteCorpo = Math.max(
      ...pecasDe(g)
        .filter((c) => c.o !== g.userData.cabeca)
        .map((c) => c.b.max.z),
    )
    expect(cab.max.z, `${key}: a cabeça não passa do peito`).toBeGreaterThan(frenteCorpo - 0.3)
  })

  /*
   * ⚠️ OMBRO NÃO PODE ESTAR NA ALTURA DA CABEÇA.
   *
   * O defeito mais feio que o turntable mostrou: braço pendurado em y=1.76 com
   * a cabeça ocupando 1.52 a 2.04 — os braços saíam DA CABEÇA. Tudo encostava
   * em tudo, então nenhuma medida existente reclamou.
   */
  it.each(['zombie', 'skeleton'])('%s: o braço sai do tronco, não da cabeça', (key) => {
    const g = buildMobModel(key, false)
    const baseCabeca = caixa(g.userData.cabeca).min.y
    expect(g.userData.bracos.length).toBe(2)
    for (const b of g.userData.bracos) {
      expect(b.position.y, `${key}: ombro dentro da cabeça`).toBeLessThanOrEqual(baseCabeca + 0.01)
    }
  })

  it('a aranha tem os olhos na frente do corpo', () => {
    const g = buildMobModel('spider', false)
    const vermelhos = []
    g.traverse((o) => {
      if (o.isMesh && o.material?.emissiveIntensity > 1) vermelhos.push(o)
    })
    expect(vermelhos.length, 'aranha sem olhos').toBeGreaterThanOrEqual(2)
    for (const o of vermelhos) expect(o.position.z).toBeGreaterThan(0.3)
  })
})

describe('roquecraft - o andar faz sentido pro corpo', () => {
  /*
   * TROTE DIAGONAL, NÃO PULO DE COELHO.
   *
   * A fase saía de `i % 2` sobre uma lista construída como
   * [esq-frente, esq-trás, dir-frente, dir-trás]: dava as duas dianteiras em
   * fase e as duas traseiras em fase. Quadrúpede que anda assim está pulando,
   * não trotando. O certo é diagonal: dianteira esquerda com traseira direita.
   */
  it.each(['pig', 'cow', 'sheep'])('%s: quatro patas em trote diagonal', (key) => {
    const g = buildMobModel(key, false)
    const patas = pernasDe(g)
    expect(patas).toHaveLength(4)
    const chave = (p) => `${p.mesh.position.x > 0 ? 'D' : 'E'}${p.mesh.position.z > 0 ? 'F' : 'T'}`
    const fase = Object.fromEntries(patas.map((p) => [chave(p), p.fase]))
    expect(Object.keys(fase).sort()).toEqual(['DF', 'DT', 'EF', 'ET'])
    // diagonais em fase
    expect(Math.cos(fase.EF - fase.DT), `${key}: EF e DT fora de fase`).toBeCloseTo(1, 5)
    expect(Math.cos(fase.DF - fase.ET), `${key}: DF e ET fora de fase`).toBeCloseTo(1, 5)
    // e os dois pares em contrafase entre si
    expect(Math.cos(fase.EF - fase.DF), `${key}: os dois pares andam juntos`).toBeCloseTo(-1, 5)
  })

  /*
   * A referência que o founder mandou tem os braços do zumbi CAÍDOS, e braço
   * caído e rígido fica de manequim. Ele balança em contrafase com a perna do
   * mesmo lado, que é como um bípede anda. O esqueleto fica de fora: os braços
   * dele seguram o arco.
   */
  it('zumbi: os braços balançam em contrafase com as pernas', () => {
    const g = buildMobModel('zombie', false)
    const bracos = (g.userData.andar || []).filter((p) => p.parte === 'braco')
    const pernas = pernasDe(g)
    expect(bracos).toHaveLength(2)
    for (const b of bracos) {
      const mesmoLado = pernas.find(
        (p) => Math.sign(p.mesh.position.x) === Math.sign(b.mesh.position.x),
      )
      expect(mesmoLado, 'braço sem perna do mesmo lado').toBeTruthy()
      expect(
        Math.cos(b.fase - mesmoLado.fase),
        'o braço acompanha a perna do mesmo lado em vez de contrariá-la',
      ).toBeCloseTo(-1, 5)
    }
  })

  it('esqueleto: os braços NÃO entram no passo — eles seguram o arco', () => {
    const g = buildMobModel('skeleton', false)
    expect((g.userData.andar || []).filter((p) => p.parte === 'braco')).toHaveLength(0)
  })

  it.each(['zombie', 'skeleton', 'chicken'])('%s: bípede alterna as duas pernas', (key) => {
    const g = buildMobModel(key, false)
    const pernas = pernasDe(g)
    expect(pernas).toHaveLength(2)
    expect(Math.cos(pernas[0].fase - pernas[1].fase)).toBeCloseTo(-1, 5)
  })

  /*
   * A aranha varre no eixo Y porque a perna dela aponta pra FORA. Girar em X
   * uma perna que sai de lado não dá passo: raspa a pata no chão de lado.
   */
  it('aranha: oito patas, tetrápode alternado, varrendo no eixo certo', () => {
    const g = buildMobModel('spider', false)
    const patas = pernasDe(g)
    expect(patas).toHaveLength(8)
    for (const p of patas) expect(p.eixo).toBe('y')
    const fases = patas.map((p) => p.fase)
    expect(new Set(fases.map((f) => Math.round(Math.cos(f)))).size).toBe(2)
  })

  it('aranha: as patas saem PRA FORA do corpo, não pra frente', () => {
    const g = buildMobModel('spider', false)
    const corpo = 0.35 // meia-largura do abdômen
    for (const p of pernasDe(g)) {
      const b = caixa(p.mesh)
      const alcance = Math.max(Math.abs(b.min.x), Math.abs(b.max.x))
      expect(alcance, 'pata não passa da lateral do corpo').toBeGreaterThan(corpo)
    }
  })

  /*
   * Pivô no quadril. Geometria de caixa nasce centrada, e uma perna que gira no
   * próprio meio manda a coxa pra dentro da barriga enquanto o pé vai pra
   * frente. Com o pivô certo, girar a perna NÃO muda onde o topo dela está.
   */
  it.each(MOB_KEYS)('%s: os membros giram a partir da articulação', (key) => {
    const g = buildMobModel(key, false)
    for (const p of g.userData.andar) {
      if (p.eixo === 'x') {
        // Membro que balança pra frente e pra trás PENDURA do quadril: a
        // geometria mora abaixo da própria origem.
        //
        // ⚠️ A primeira versão deste teste girava o membro e comparava o topo
        // da caixa. Isso mede a ESPESSURA do membro, não o pivô: uma perna de
        // 24 cm de profundidade levanta 7 cm de canto ao girar 0,6 rad mesmo
        // com o pivô perfeito — e foi assim que ele acusou o zumbi, que estava
        // certo. Estado da geometria é afirmação exata; comportamento sob
        // rotação é proxy.
        p.mesh.geometry.computeBoundingBox()
        const bb = p.mesh.geometry.boundingBox
        expect(bb.max.y, `${key}: o membro não pendura da articulação`).toBeLessThan(0.02)
        expect(bb.min.y, `${key}: o membro não tem comprimento`).toBeLessThan(-0.05)
      } else {
        // Varredura em Y não muda altura nenhuma; o que importa é o pivô estar
        // no CORPO, e não na ponta da pata.
        expect(Math.abs(p.mesh.position.x), `${key}: pivô fora do corpo`).toBeLessThan(0.3)
      }
    }
  })
})

describe('roquecraft - um bicho não contamina o outro', () => {
  /*
   * O flash de dano escrevia `emissive` no material vindo do cache, e o cache é
   * compartilhado por cor. Bater num porco acendia TODOS os porcos do mapa.
   */
  it('dois bichos da mesma espécie não dividem material', () => {
    const a = buildMobModel('pig', false)
    const b = buildMobModel('pig', false)
    expect(a.userData.materiais.length).toBeGreaterThan(0)
    for (const m of a.userData.materiais) expect(b.userData.materiais).not.toContain(m)
  })

  it('mas dividem a TEXTURA — cópia de material não pode duplicar imagem', () => {
    const a = buildMobModel('pig', false)
    const b = buildMobModel('pig', false)
    const mapsA = new Set(a.userData.materiais.map((m) => m.map).filter(Boolean))
    const mapsB = b.userData.materiais.map((m) => m.map).filter(Boolean)
    expect(mapsB.length).toBeGreaterThan(0)
    for (const t of mapsB) expect(mapsA.has(t)).toBe(true)
  })

  it('todo material do bicho está registrado pra ser liberado', () => {
    for (const key of MOB_KEYS) {
      const g = buildMobModel(key, false)
      const registrados = new Set(g.userData.materiais)
      g.traverse((o) => {
        if (o.isMesh) expect(registrados.has(o.material), `${key}: material órfão`).toBe(true)
      })
    }
  })
})
