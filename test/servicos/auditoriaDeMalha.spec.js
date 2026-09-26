import { describe, it, expect } from 'vitest'
import { auditarMalhaViva } from '../../src/servicos/auditoriaDeMalha.js'
import { AIR, ID } from '../../src/servicos/blocks.js'

// ⚠️ ESTE É O INSTRUMENTO QUE ACHOU O DEFEITO QUE IMPEDIA O FOUNDER DE JOGAR, e
// até hoje ele nunca teve teste próprio: rodava só dentro do jogo, pelo gancho
// de QA. Agora que é serviço, dá para plantar o defeito à mão e exigir que ele
// acuse, que é a única forma de o verde dele significar alguma coisa.
//
// A lição que ele custou está no cabeçalho do módulo: a primeira versão só
// sabia contar BURACO e reportou zero por três rodadas com o defeito na tela,
// porque o defeito era SOBRA. Os dois casos abaixo travam as duas metades.

const DIRS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
]

/** Atributo de geometria no formato mínimo que a auditoria lê. */
function atributo(valores) {
  return {
    count: valores.length / 3,
    getX: (i) => valores[i * 3],
    getY: (i) => valores[i * 3 + 1],
    getZ: (i) => valores[i * 3 + 2],
  }
}

/**
 * Um quad da face `f` do bloco (x,y,z), nos 4 cantos, como o mesher emite.
 * Devolve [posições, normais].
 */
function quad(x, y, z, f) {
  const [nx, ny, nz] = DIRS[f]
  const eixo = [nx, ny, nz].findIndex((c) => c !== 0)
  const plano = [nx, ny, nz][eixo] > 0 ? 1 : 0
  const base = [x, y, z]
  const outros = [0, 1, 2].filter((k) => k !== eixo)
  const pos = []
  for (const [da, db] of [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ]) {
    const c = [0, 0, 0]
    c[eixo] = base[eixo] + plano
    c[outros[0]] = base[outros[0]] + da
    c[outros[1]] = base[outros[1]] + db
    pos.push(c[0], c[1], c[2])
  }
  const nor = []
  for (let i = 0; i < 4; i++) nor.push(nx, ny, nz)
  return [pos, nor]
}

/** Motor falso: uma seção só, com os quads que o teste mandar. */
function motorCom(quads) {
  const pos = []
  const nor = []
  for (const [p, n] of quads) {
    pos.push(...p)
    nor.push(...n)
  }
  const malha = {
    geometry: {
      getAttribute: (nome) => (nome === 'position' ? atributo(pos) : atributo(nor)),
    },
  }
  return { sectionMeshes: new Map([['0,4,0', { opaque: malha }]]) }
}

/** Mundo falso: um bloco de pedra em (0,64,0), ar em todo o resto. */
function mundoComUmaPedra() {
  return {
    getBlock: (x, y, z) => (x === 0 && y === 64 && z === 0 ? ID.stone : AIR),
    // A auditoria só examina coluna CARREGADA: na borda do carregamento não há
    // com que comparar, e acusar ali seria acusar o carregador, não a malha.
    isLoaded: () => true,
  }
}

const JOGADOR = { x: 0.5, y: 65, z: 0.5 }

describe('auditoria da malha viva', () => {
  it('cena correta: nem buraco nem sobra', () => {
    const quads = DIRS.map((_, f) => quad(0, 64, 0, f))
    const r = auditarMalhaViva({
      engine: motorCom(quads),
      world: mundoComUmaPedra(),
      player: JOGADOR,
      raio: 3,
    })
    expect(r.quads, 'a auditoria não indexou as seis faces').toBe(6)
    expect(r.buracos, `buracos: ${JSON.stringify(r.exemplos)}`).toBe(0)
    expect(r.sobras, `sobras: ${JSON.stringify(r.exemplosDeSobra)}`).toBe(0)
  })

  it('BURACO plantado: falta uma face e ela é acusada', () => {
    // Tira a face +x do bloco. O mundo continua dizendo que ela deve existir.
    const quads = DIRS.map((_, f) => quad(0, 64, 0, f)).filter((_, f) => f !== 0)
    const r = auditarMalhaViva({
      engine: motorCom(quads),
      world: mundoComUmaPedra(),
      player: JOGADOR,
      raio: 3,
    })
    expect(r.buracos, 'a face que falta não foi acusada').toBe(1)
    expect(r.porDirecao['+x']).toBe(1)
    expect(r.exemplos.join(' ')).toContain('+x')
    expect(r.sobras, 'inventou sobra onde só faltava face').toBe(0)
  })

  it('SOBRA plantada: quad desenhado no ar é acusado', () => {
    // ⚠️ ESTA É A METADE QUE FALTAVA NO INSTRUMENTO. O defeito do mapa novo era
    // exatamente isto, 1.035 vezes: face desenhada onde o mundo só tem ar.
    const quads = DIRS.map((_, f) => quad(0, 64, 0, f))
    quads.push(quad(5, 70, 5, 0)) // no meio do nada
    const r = auditarMalhaViva({
      engine: motorCom(quads),
      world: mundoComUmaPedra(),
      player: JOGADOR,
      raio: 12,
    })
    expect(r.sobras, 'o quad no ar passou batido').toBe(1)
    expect(r.sobrasPorBloco.ar).toBe(1)
    expect(r.exemplosDeSobra.join(' ')).toContain('(5,70,5)')
    expect(r.buracos, 'inventou buraco onde só sobrava face').toBe(0)
  })

  it('sem motor ou sem mundo devolve null em vez de fingir que auditou', () => {
    expect(auditarMalhaViva({ engine: null, world: mundoComUmaPedra(), player: JOGADOR })).toBe(
      null,
    )
    expect(auditarMalhaViva({ engine: motorCom([]), world: null, player: JOGADOR })).toBe(null)
  })

  it('o raio limita o que é examinado', () => {
    // ⚠️ `examinados` conta BLOCO, não célula: com um bloco só no mundo, os dois
    // raios dariam 1 e o teste passaria sem provar nada. Foi o que ele fez na
    // primeira escrita, e o vermelho foi meu, não do código. Aqui o mundo tem
    // duas pedras, uma perto e uma a seis blocos.
    const world = {
      getBlock: (x, y, z) =>
        (x === 0 && y === 64 && z === 0) || (x === 6 && y === 64 && z === 0) ? ID.stone : AIR,
      isLoaded: () => true,
    }
    const motor = motorCom(DIRS.map((_, f) => quad(0, 64, 0, f)))
    const perto = auditarMalhaViva({ engine: motor, world, player: JOGADOR, raio: 2 })
    const longe = auditarMalhaViva({ engine: motor, world, player: JOGADOR, raio: 10 })
    expect(perto.examinados, 'o raio pequeno já pegou tudo').toBe(1)
    expect(longe.examinados, 'o raio grande não alcançou a segunda pedra').toBe(2)
  })
})

describe('auditoria da malha viva — as bordas da janela examinada', () => {
  /** Mundo com uma pedra numa coordenada escolhida. */
  const mundoCom = (bx, by, bz) => ({
    getBlock: (x, y, z) => (x === bx && y === by && z === bz ? ID.stone : AIR),
    isLoaded: () => true,
  })

  it('a coluna EXATAMENTE na borda do raio é examinada', () => {
    // ⚠️ `x <= px + raio` apertado para `<`: a última coluna de cada lado sai
    // da varredura. A auditoria passa a dar verde numa borda que ela nunca
    // olhou — e foi por não olhar o suficiente que ela reportou zero por três
    // rodadas com o defeito na tela.
    const naBorda = 3
    const quads = DIRS.map((_, f) => quad(naBorda, 64, 0, f)).filter((_, f) => f !== 0)
    const r = auditarMalhaViva({
      engine: motorCom(quads),
      world: mundoCom(naBorda, 64, 0),
      player: JOGADOR,
      raio: 3,
    })
    expect(r.buracos, 'a coluna da borda não foi examinada').toBe(1)
  })

  it('um bloco além da borda não é examinado', () => {
    const fora = 4
    const quads = DIRS.map((_, f) => quad(fora, 64, 0, f)).filter((_, f) => f !== 0)
    const r = auditarMalhaViva({
      engine: motorCom(quads),
      world: mundoCom(fora, 64, 0),
      player: JOGADOR,
      raio: 3,
    })
    expect(r.buracos).toBe(0)
  })

  it('a borda vale para o eixo Z também', () => {
    const quads = DIRS.map((_, f) => quad(0, 64, 3, f)).filter((_, f) => f !== 0)
    const r = auditarMalhaViva({
      engine: motorCom(quads),
      world: mundoCom(0, 64, 3),
      player: JOGADOR,
      raio: 3,
    })
    expect(r.buracos).toBe(1)
  })

  it('a faixa vertical inclui as camadas do topo e do fundo da janela', () => {
    // `y <= y1` apertado para `<` perde a última camada da faixa de 24 blocos
    // acima do jogador — justamente onde ficam as copas e os telhados.
    const topo = 65 + 24 // py = 65 → y1 = 89
    const quads = DIRS.map((_, f) => quad(0, topo, 0, f)).filter((_, f) => f !== 0)
    const r = auditarMalhaViva({
      engine: motorCom(quads),
      world: mundoCom(0, topo, 0),
      player: JOGADOR,
      raio: 3,
    })
    expect(r.buracos, 'a camada do topo da janela não foi examinada').toBe(1)
  })

  it('SOBRA na borda exata do raio também é acusada', () => {
    // Mesmo `>` do lado da sobra (`Math.abs(sx - px) > raio`): afrouxado, a
    // face órfã na coluna da borda deixa de contar, e "coisa voando" na beira
    // do campo de visão passa despercebida.
    const naBorda = 3
    const quads = [quad(naBorda, 64, 0, 0)]
    const r = auditarMalhaViva({
      engine: motorCom(quads),
      world: { getBlock: () => AIR, isLoaded: () => true },
      player: JOGADOR,
      raio: 3,
    })
    expect(r.sobras, 'a sobra da borda não foi acusada').toBe(1)
  })

  it('planta em cruz não conta como sobra nem como buraco', () => {
    // `id !== AIR && (!def || def.plant || def.cross || ...)`: os `&&` e `||`
    // desta linha são o que impede a geometria própria de acusar sobra sempre.
    // Virando `||` o primeiro, o AR entra na regra e nenhuma sobra de ar é
    // acusada — que é justamente o caso "bloco sumiu e a face ficou".
    const quads = [quad(0, 64, 0, 0)]
    const r = auditarMalhaViva({
      engine: motorCom(quads),
      world: { getBlock: () => AIR, isLoaded: () => true },
      player: JOGADOR,
      raio: 3,
    })
    expect(r.sobras, 'face sobre o ar tem que ser sobra').toBe(1)
  })
})
