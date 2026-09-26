import { describe, it, expect } from 'vitest'
import { CAIXAS_DE_BLOCO, FACES_DE_BLOCO, EH_FORMA_LIVRE } from '../../src/servicos/formas.js'
import { BLOCKS, BLOCK_BY_KEY, ORIENTACOES, SOLIDO_DE_BLOCO } from '../../src/servicos/blocks.js'
import { createMob as criarMob, stepMob as passoDoMob } from '../../src/servicos/mobs.js'

// A GEOMETRIA DA ESCADA, ANTES DE QUALQUER PIXEL.
//
// Girar e espelhar um polígono é a operação que mais erra em silêncio deste
// motor: o resultado compila, desenha, e sai com a face virada pra dentro — o
// backface culling engole o triângulo e a escada nasce com buraco. Não dá pra
// achar isso em print: um buraco numa escada de teto parece sombra.
//
// Então a forma é verificada por CONTA, não por olho:
//
//   • volume — toda escada ocupa 3/4 da célula, em qualquer orientação
//   • área   — girar e espelhar preservam a área da superfície
//   • NORMAL — a ordem dos cantos de cada retângulo tem que produzir, pelo
//              produto vetorial, exatamente a direção da face declarada
//
// O terceiro é o que pega o winding invertido, e é o motivo deste arquivo.

const escadas = Object.values(BLOCKS).filter((b) => b.escada)
const DIRECAO = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
]

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cruz = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const norma = (v) => Math.hypot(...v)
const volumeDe = (c) => (c[3] - c[0]) * (c[4] - c[1]) * (c[5] - c[2])
const areaDe = (cantos) => {
  const u = sub(cantos[1], cantos[0])
  const v = sub(cantos[3], cantos[0])
  return norma(cruz(u, v))
}

describe('roquecraft - a forma da escada', () => {
  it('existem as 8 variantes de cada material, e só a primeira é item', () => {
    expect(escadas.length, 'quatro materiais × quatro orientações × duas metades').toBe(32)
    for (const chave of ['stoneStairs', 'cobblestoneStairs', 'oakStairs', 'spruceStairs']) {
      const doMaterial = escadas.filter((b) => b.drops === chave)
      expect(doMaterial.length, `variantes de ${chave}`).toBe(8)
      expect(doMaterial.filter((b) => !b.semItem).length, `itens de ${chave}`).toBe(1)
      expect(BLOCK_BY_KEY[chave].semItem, `${chave} é a peça do inventário`).toBe(false)
    }
  })

  it('toda escada ocupa 3/4 da célula, em qualquer orientação', () => {
    for (const b of escadas) {
      const v = CAIXAS_DE_BLOCO[b.id].reduce((s, c) => s + volumeDe(c), 0)
      expect(v, `${b.key} ocupa ${v}`).toBeCloseTo(0.75, 6)
    }
  })

  it('as caixas ficam DENTRO da célula e não se sobrepõem', () => {
    for (const b of escadas) {
      for (const c of CAIXAS_DE_BLOCO[b.id]) {
        for (let e = 0; e < 3; e++) {
          expect(c[e], `${b.key} sai da célula`).toBeGreaterThanOrEqual(0)
          expect(c[e + 3], `${b.key} sai da célula`).toBeLessThanOrEqual(1)
          expect(c[e + 3], `${b.key} tem caixa degenerada`).toBeGreaterThan(c[e])
        }
      }
    }
  })

  it('girar e espelhar preservam a área da superfície', () => {
    const areas = escadas.map(
      (b) => +FACES_DE_BLOCO[b.id].reduce((s, f) => s + areaDe(f.cantos), 0).toFixed(6),
    )
    expect(new Set(areas).size, `áreas diferentes: ${[...new Set(areas)].join(', ')}`).toBe(1)
    expect(areas[0], 'a escada tem menos superfície que o cubo').toBeLessThan(6)
    expect(areas[0]).toBeGreaterThan(5)
  })

  it('⚠️ a NORMAL de cada retângulo aponta pra fora, em todas as 32 variantes', () => {
    // Este é o teste que existe pelo defeito, não pela regra. Espelhar em Y
    // inverte a lateralidade do polígono; sem reordenar os cantos, o winding
    // sai ao contrário e a escada de teto perde faces pro backface culling.
    const errados = []
    for (const b of escadas) {
      for (const f of FACES_DE_BLOCO[b.id]) {
        const n = cruz(sub(f.cantos[1], f.cantos[0]), sub(f.cantos[3], f.cantos[0]))
        const m = norma(n)
        const unit = [n[0] / m, n[1] / m, n[2] / m]
        const alvo = DIRECAO[f.f]
        const casa = unit.every((v, i) => Math.abs(v - alvo[i]) < 1e-9)
        if (!casa) errados.push(`${b.key} face ${f.f}: normal ${unit.map((v) => +v.toFixed(2))}`)
      }
    }
    expect(errados, errados.slice(0, 4).join(' | ')).toEqual([])
  })

  it('só os planos INTERNOS ficam de fora do recorte por vizinho', () => {
    // Duas faces por escada vivem no meio da célula (o tampo do degrau baixo e
    // o espelho vertical). Elas não podem ser escondidas: não existe vizinho do
    // outro lado delas. As outras oito encostam no plano da célula.
    for (const b of escadas) {
      const fora = FACES_DE_BLOCO[b.id].filter((f) => !f.naBorda)
      expect(fora.length, `${b.key} tem ${fora.length} planos internos`).toBe(2)
    }
  })

  it('a orientação muda a forma — as quatro não são a mesma coisa girada em nome', () => {
    // Se o giro não estivesse sendo aplicado, as quatro orientações teriam
    // caixas idênticas e o teste de volume ainda passaria.
    const porOrient = ORIENTACOES.map((o) =>
      JSON.stringify(
        CAIXAS_DE_BLOCO[
          Object.values(BLOCKS).find(
            (b) => b.escada && b.escada.orient === o && !b.escada.topo && b.drops === 'stoneStairs',
          ).id
        ],
      ),
    )
    expect(new Set(porOrient).size, 'as quatro orientações têm a mesma caixa').toBe(4)
  })

  it('⚠️ o DEGRAU BAIXO fica do lado da orientação — é o que a torna subível', () => {
    // O invariante que decide se a escada serve pra alguma coisa. Volume, área
    // e normal podem estar todos certos numa escada virada 180°: ela desenha
    // bem, colide bem, e é impossível subir por ela. Só esta conta separa as
    // duas — e ela é a única que o jogador percebe.
    //
    // A caixa ALTA tem que estar do lado OPOSTO ao da orientação: se o degrau
    // baixo aponta pro -Z, a parte alta ocupa o +Z.
    const EIXO = { 0: 0, 1: 0, 4: 2, 5: 2 } // qual eixo horizontal
    const POSITIVO = { 0: true, 1: false, 4: true, 5: false }
    for (const b of escadas) {
      const caixas = CAIXAS_DE_BLOCO[b.id]
      const e = EIXO[b.escada.orient]
      // a caixa "alta" é a que NÃO ocupa o eixo horizontal inteiro
      const alta = caixas.find((c) => c[e + 3] - c[e] < 1)
      expect(alta, `${b.key} não tem parte alta`).toBeTruthy()
      const noPositivo = alta[e] >= 0.5
      expect(
        noPositivo,
        `${b.key}: orientação ${b.escada.orient} com a parte alta em ${alta[e]}..${alta[e + 3]}`,
      ).toBe(!POSITIVO[b.escada.orient])
      // e ela fica na metade de cima da célula (ou de baixo, se for invertida)
      const emCima = alta[1] >= 0.5
      expect(emCima, `${b.key} tem a parte alta no andar errado`).toBe(!b.escada.topo)
    }
  })

  it('bloco comum não tem forma livre, e continua com uma caixa só', () => {
    const pedra = BLOCK_BY_KEY.stone.id
    expect(EH_FORMA_LIVRE[pedra]).toBe(0)
    expect(FACES_DE_BLOCO[pedra]).toBeNull()
    expect(CAIXAS_DE_BLOCO[pedra]).toEqual([[0, 0, 0, 1, 1, 1]])
    expect(CAIXAS_DE_BLOCO[BLOCK_BY_KEY.stoneSlab.id]).toEqual([[0, 0, 0, 1, 0.5, 1]])
    expect(CAIXAS_DE_BLOCO[BLOCK_BY_KEY.stoneSlabTopo.id]).toEqual([[0, 0.5, 0, 1, 1, 1]])
    expect(CAIXAS_DE_BLOCO[0], 'ar não tem caixa').toBeNull()
  })
})

// A GEOMETRIA DA CAMA, PELA MESMA RÉGUA.
//
// A cama entrou na rodada 12 como forma livre porque a da rodada 8 era um
// bloco: meia laje vermelha, sem pés, sem vão e sem direção. O founder viu na
// tela antes de qualquer sonda achar.
//
// Aqui ela é conferida por conta, e não por olho, exatamente como a escada — e
// pelo mesmo motivo: girar polígono erra em silêncio, e face virada pra dentro
// vira buraco que parece sombra.
describe('formas — a cama', () => {
  const camas = Object.values(BLOCKS).filter((b) => b.cama)
  const P = 3 / 16
  const COLCHAO = 9 / 16

  it('são oito: duas metades × quatro direções', () => {
    expect(camas.length).toBe(8)
    expect(new Set(camas.map((b) => b.cama.orient)).size).toBe(4)
    expect(camas.filter((b) => b.cama.cabeceira).length).toBe(4)
  })

  it('toda variante é forma livre e tem faces próprias', () => {
    for (const b of camas) {
      expect(EH_FORMA_LIVRE[b.id], b.key).toBe(1)
      expect(FACES_DE_BLOCO[b.id], b.key).toBeTruthy()
    }
  })

  it('⚠️ A ORDEM DOS CANTOS É A NORMAL — nas oito variantes', () => {
    // Ordem trocada = face virada pra dentro = triângulo engolido pelo culling.
    // A escada errou 192 de 320 normais na primeira escrita deste arquivo.
    for (const b of camas) {
      for (const parte of FACES_DE_BLOCO[b.id]) {
        const n = cruz(sub(parte.cantos[1], parte.cantos[0]), sub(parte.cantos[3], parte.cantos[0]))
        const esperada = DIRECAO[parte.f]
        const m = norma(n)
        expect(m, `${b.key} face ${parte.f} degenerada`).toBeGreaterThan(0)
        for (let i = 0; i < 3; i++) {
          expect(n[i] / m, `${b.key} face ${parte.f}`).toBeCloseTo(esperada[i], 5)
        }
      }
    }
  })

  it('o colchão vai de 3/16 a 9/16 — e é isso que abre o vão', () => {
    // O colchão FLUTUA. Enquanto ele começava no chão, a cama era um bloco
    // maciço e não havia como ver o piso por baixo.
    for (const b of camas) {
      const ys = FACES_DE_BLOCO[b.id].flatMap((p) => p.cantos.map((c) => c[1]))
      expect(Math.min(...ys), b.key).toBe(0) // o pé encosta no chão
      expect(Math.max(...ys), b.key).toBeCloseTo(COLCHAO, 6)
      // Nenhum ponto entre 0 e 3/16 que não seja pé: o vão é vão.
      const tampo = FACES_DE_BLOCO[b.id].filter((p) => p.f === 2)
      expect(tampo.length, b.key).toBe(1)
      expect(
        tampo[0].cantos.every((c) => Math.abs(c[1] - COLCHAO) < 1e-9),
        b.key,
      ).toBe(true)
    }
  })

  it('dois pés por metade, de 3×3×3, nos cantos da PONTA DE FORA', () => {
    for (const b of camas) {
      // O fundo de cada pé é um retângulo em y = 0 na face −y.
      const fundos = FACES_DE_BLOCO[b.id].filter(
        (p) => p.f === 3 && p.cantos.every((c) => c[1] === 0),
      )
      expect(fundos.length, `${b.key}: dois pés`).toBe(2)
      for (const f of fundos) {
        const xs = f.cantos.map((c) => c[0])
        const zs = f.cantos.map((c) => c[2])
        expect(Math.max(...xs) - Math.min(...xs), b.key).toBeCloseTo(P, 6)
        expect(Math.max(...zs) - Math.min(...zs), b.key).toBeCloseTo(P, 6)
      }
      // E os dois estão do MESMO lado — o lado pra onde a ponta de fora aponta.
      const [dx, dz] = { 0: [1, 0], 1: [-1, 0], 4: [0, 1], 5: [0, -1] }[b.cama.orient]
      for (const f of fundos) {
        const cx = f.cantos.reduce((s2, c) => s2 + c[0], 0) / 4 - 0.5
        const cz = f.cantos.reduce((s2, c) => s2 + c[2], 0) / 4 - 0.5
        expect(cx * dx + cz * dz, `${b.key}: pé na ponta de fora`).toBeGreaterThan(0)
      }
    }
  })

  it('a caixa de colisão continua a do original: um bloco de 9/16', () => {
    // O DESENHO ganhou pés; a COLISÃO não. No original a cama colide como uma
    // caixa cheia de 9/16 — e é isso que deixa subir nela com um passo em vez
    // de tropeçar nos pés.
    for (const b of camas) {
      expect(CAIXAS_DE_BLOCO[b.id], b.key).toEqual([[0, 0, 0, 1, 0.5625, 1]])
    }
  })
})

describe('formas — o uv do tampo gira com a peça', () => {
  const camas = Object.values(BLOCKS).filter((b) => b.cama)

  it('o tampo carrega uv explícito, e as quatro variantes usam o MESMO uv', () => {
    // ⚠️ O uv não é transformado no giro: ele viaja com o índice do canto. É
    // essa imobilidade que faz a textura girar junto com a peça — o canto muda
    // de lugar no mundo levando o mesmo pedaço de imagem consigo.
    const uvs = camas.map((b) => {
      const t = FACES_DE_BLOCO[b.id].find((p) => p.f === 2)
      expect(t.uv, `${b.key}: tampo sem uv explícito`).toBeTruthy()
      return JSON.stringify(t.uv)
    })
    expect(new Set(uvs).size, 'o uv é o mesmo nas quatro').toBe(1)
  })

  it('e o canto que leva o travesseiro muda de lugar a cada giro', () => {
    // O travesseiro é desenhado em v = 0. Achar o canto com v = 0 e ver PRA
    // ONDE ele aponta: tem que ser sempre a ponta de fora daquela variante.
    //
    // Sem uv explícito, o emissor derivava u,v da POSIÇÃO — e como no tampo os
    // dois eixos são horizontais, a mesma função de (x,z) devolvia a mesma
    // textura nas quatro orientações. A cama girava e o travesseiro ficava
    // parado, preso ao terreno.
    const DIR = { 0: [1, 0], 1: [-1, 0], 4: [0, 1], 5: [0, -1] }
    for (const b of camas) {
      const t = FACES_DE_BLOCO[b.id].find((p) => p.f === 2)
      const comV0 = t.cantos.filter((_, i) => t.uv[i][1] === 0)
      expect(comV0.length, b.key).toBe(2)
      const cx = comV0.reduce((s, c) => s + c[0], 0) / 2 - 0.5
      const cz = comV0.reduce((s, c) => s + c[2], 0) / 2 - 0.5
      const [dx, dz] = DIR[b.cama.orient]
      expect(cx * dx + cz * dz, `${b.key}: travesseiro na ponta de fora`).toBeGreaterThan(0)
    }
  })
})

/**
 * A CERCA.
 *
 * São 16 estados — quatro lados, ligado ou não — e cada um monta a forma a
 * partir do poste mais os braços. São 96 retângulos no estado cheio, e escrever
 * isso à mão seria repetir 96 vezes a chance de inverter um winding. Por isso a
 * forma sai de um GERADOR de caixas, e por isso este bloco de testes existe:
 * ele é o que confere o gerador.
 */
describe('formas — a cerca', () => {
  const cercas = Object.values(BLOCKS).filter((b) => b.cerca)
  const naCelula = (c) => c.every((v, i) => (i < 3 ? v >= 0 : v <= 1)) && c[0] < c[3]

  it('existem as 16 variantes, e só a sem conexão é item', () => {
    expect(cercas).toHaveLength(16)
    expect(cercas.filter((b) => !b.semItem).map((b) => b.key)).toEqual(['oakFence'])
    expect(new Set(cercas.map((b) => b.cerca.bits)).size).toBe(16)
  })

  it('toda variante é forma livre e pula o greedy', () => {
    for (const b of cercas) {
      expect(EH_FORMA_LIVRE[b.id], `${b.key} saiu pelo greedy`).toBe(1)
      expect(FACES_DE_BLOCO[b.id].length).toBeGreaterThan(0)
    }
  })

  it('⚠️ a NORMAL de cada retângulo aponta pra fora, nas 16 variantes', () => {
    // O mesmo teste que existe pela escada, pelo mesmo defeito: winding
    // invertido não quebra nada, só faz a peça sumir pelo backface culling — e
    // buraco em cerca parece vão de cerca.
    const errados = []
    for (const b of cercas) {
      for (const f of FACES_DE_BLOCO[b.id]) {
        const n = cruz(sub(f.cantos[1], f.cantos[0]), sub(f.cantos[3], f.cantos[0]))
        const m = norma(n)
        const unit = [n[0] / m, n[1] / m, n[2] / m]
        const alvo = DIRECAO[f.f]
        if (!unit.every((v, i) => Math.abs(v - alvo[i]) < 1e-9)) {
          errados.push(`${b.key} face ${f.f}: ${unit.map((v) => +v.toFixed(2))}`)
        }
      }
    }
    expect(errados, errados.slice(0, 4).join(' | ')).toEqual([])
  })

  it('o poste está SEMPRE lá, e as caixas ficam dentro da célula', () => {
    for (const b of cercas) {
      const caixas = CAIXAS_DE_BLOCO[b.id]
      // O poste é o primeiro e vai do chão ao teto da célula.
      expect(caixas[0], `${b.key} perdeu o poste`).toEqual([0.375, 0, 0.375, 0.625, 1, 0.625])
      for (const c of caixas) expect(naCelula(c), `${b.key}: caixa fora da célula`).toBe(true)
    }
  })

  it('cada conexão acrescenta DUAS travessas — nem uma, nem quatro', () => {
    for (const b of cercas) {
      const ligados = [1, 2, 4, 8].filter((bit) => b.cerca.bits & bit).length
      expect(CAIXAS_DE_BLOCO[b.id], `${b.key}`).toHaveLength(1 + ligados * 2)
    }
  })

  it('⚠️ O BRAÇO CHEGA NA BORDA — é isso que faz duas cercas se encontrarem', () => {
    // Se o braço parasse antes de 0 (ou de 1), duas cercas vizinhas teriam um
    // vão entre elas: visualmente uma cerca quebrada, e um buraco por onde o
    // rebanho sai.
    const bordas = {
      1: (c) => c[2] === 0,
      2: (c) => c[3] === 1,
      4: (c) => c[5] === 1,
      8: (c) => c[0] === 0,
    }
    for (const b of cercas) {
      for (const bit of [1, 2, 4, 8]) {
        if (!(b.cerca.bits & bit)) continue
        const chega = CAIXAS_DE_BLOCO[b.id].some(bordas[bit])
        expect(chega, `${b.key}: o braço do bit ${bit} não chega na borda`).toBe(true)
      }
    }
  })

  it('a cerca SEM conexão não tem braço nenhum — poste solto se contorna', () => {
    const solta = cercas.find((b) => b.cerca.bits === 0)
    expect(CAIXAS_DE_BLOCO[solta.id]).toHaveLength(1)
    // E não bloqueia a célula inteira: dá pra passar ao lado dele.
    const [x0, , z0, x1, , z1] = CAIXAS_DE_BLOCO[solta.id][0]
    expect(x1 - x0).toBeLessThan(0.5)
    expect(z1 - z0).toBeLessThan(0.5)
  })

  it('as 16 formas são DIFERENTES entre si', () => {
    // Um erro de máscara faria várias variantes saírem iguais, e o mundo teria
    // cercas que não conectam sem nada acusar.
    const assinaturas = new Set(cercas.map((b) => JSON.stringify(CAIXAS_DE_BLOCO[b.id])))
    expect(assinaturas.size).toBe(16)
  })
})

/**
 * NINGUÉM PULA CERCA.
 *
 * ⚠️ É A REGRA QUE FAZ O CURRAL EXISTIR. A criatura sobe um degrau de terra sem
 * pensar — e subiria a cerca do mesmo jeito, porque a cerca deste motor tem 1
 * de altura (a caixa vive dentro da célula, então 1,5 como no original não
 * cabe). Sem esta recusa explícita, cercar o rebanho não seguraria nada e o
 * jogador nunca entenderia por quê.
 */
describe('a cerca segura a criatura', () => {
  const cercaEm = (mapa) => ({
    solidAt: (x, y, z) => y < 64 || mapa.has(`${x},${y},${z}`),
    ehCerca: (x, y, z) => mapa.has(`${x},${y},${z}`),
    lightAt: () => 15,
    isDay: true,
    player: null,
    skyExposed: () => false,
    surfaceY: () => 64,
    biomeAt: () => 'plains',
    allowHostile: false,
  })

  /** Empurra a criatura contra o obstáculo e diz se ela chegou a pular. */
  function tentaAtravessar(env) {
    const m = criarMob('cow', 0.5, 64, 0.5, 1)
    m.onGround = true
    m.state = 'wander'
    let pulou = false
    for (let i = 0; i < 40; i++) {
      m.state = 'wander'
      m.targetX = 5
      m.targetZ = 0.5
      m.timer = 5
      m.onGround = true
      m.vy = 0
      passoDoMob(m, env, 1 / 60)
      if (m.vy > 1) pulou = true
    }
    return pulou
  }

  it('pula um degrau de PEDRA, e NÃO pula a cerca (par de controle)', () => {
    // O degrau e a cerca ocupam a MESMA célula. A única diferença é a resposta
    // de `ehCerca` — então este par isola exatamente a regra nova.
    const degrau = new Set(['1,64,0'])
    const semCerca = {
      ...cercaEm(new Set()),
      solidAt: (x, y, z) => y < 64 || degrau.has(`${x},${y},${z}`),
    }
    expect(tentaAtravessar(semCerca), 'controle: o degrau de pedra tem que ser pulável').toBe(true)

    const comCerca = cercaEm(degrau)
    expect(tentaAtravessar(comCerca), 'a vaca pulou a cerca').toBe(false)
  })

  it('sem `ehCerca` no ambiente, o degrau continua funcionando', () => {
    // `env` de teste antigo (e o do multiplayer) não traz o campo. Um `?.` que
    // virasse `false` por engano travaria toda criatura em todo degrau.
    const degrau = new Set(['1,64,0'])
    const antigo = {
      ...cercaEm(new Set()),
      ehCerca: undefined,
      solidAt: (x, y, z) => y < 64 || degrau.has(`${x},${y},${z}`),
    }
    expect(tentaAtravessar(antigo)).toBe(true)
  })
})

/**
 * O PORTÃO.
 *
 * A cerca tirou a passagem do jogador (a caixa dela vai até o teto da célula,
 * porque 1,5 como no original não cabe neste motor). O portão é o conserto — o
 * mesmo do original. 4 orientações × aberto/fechado.
 */
describe('formas — o portão de cerca', () => {
  const portoes = Object.values(BLOCKS).filter((b) => b.portao)
  const fechados = portoes.filter((b) => !b.portao.aberto)
  const abertos = portoes.filter((b) => b.portao.aberto)

  it('são oito: quatro direções × aberto e fechado, e só uma é item', () => {
    expect(portoes).toHaveLength(8)
    expect(fechados).toHaveLength(4)
    expect(abertos).toHaveLength(4)
    expect(portoes.filter((b) => !b.semItem).map((b) => b.key)).toEqual(['oakGate'])
  })

  it('⚠️ FECHADO COLIDE, ABERTO NÃO — e os DOIS continuam visíveis pra mira', () => {
    // A primeira versão usava `solid: false` no aberto, e a sonda achou o
    // defeito: a MIRA filtra por `solidAt`, então o portão aberto ficava
    // invisível pro raycast — dava pra abrir e não dava pra fechar nem quebrar.
    // Agora os dois são `solid` (a mira vê) e só o fechado tem caixa de
    // colisão (a física atravessa o aberto).
    for (const b of portoes) expect(b.solid, `${b.key} sumiu da mira`).toBe(true)
    for (const b of fechados) {
      expect(SOLIDO_DE_BLOCO[b.id].length, `${b.key} devia barrar`).toBeGreaterThan(0)
    }
    for (const b of abertos) {
      expect(SOLIDO_DE_BLOCO[b.id], `${b.key} devia deixar passar`).toEqual([])
    }
  })

  it('⚠️ a NORMAL de cada retângulo aponta pra fora, nas oito variantes', () => {
    const errados = []
    for (const b of portoes) {
      for (const f of FACES_DE_BLOCO[b.id]) {
        const n = cruz(sub(f.cantos[1], f.cantos[0]), sub(f.cantos[3], f.cantos[0]))
        const m = norma(n)
        const unit = [n[0] / m, n[1] / m, n[2] / m]
        const alvo = DIRECAO[f.f]
        if (!unit.every((v, i) => Math.abs(v - alvo[i]) < 1e-9)) {
          errados.push(`${b.key} face ${f.f}: ${unit.map((v) => +v.toFixed(2))}`)
        }
      }
    }
    expect(errados, errados.slice(0, 4).join(' | ')).toEqual([])
  })

  it('as caixas ficam dentro da célula, nas oito variantes', () => {
    for (const b of portoes) {
      for (const c of CAIXAS_DE_BLOCO[b.id]) {
        expect(
          c.slice(0, 3).every((v) => v >= -1e-9),
          `${b.key}`,
        ).toBe(true)
        expect(
          c.slice(3).every((v) => v <= 1 + 1e-9),
          `${b.key}`,
        ).toBe(true)
      }
    }
  })

  it('o ABERTO desocupa o vão do meio, e o FECHADO ocupa', () => {
    // A prova de que abrir serve pra alguma coisa: no meio da célula, na altura
    // do peito, o fechado tem madeira e o aberto não.
    const noMeio = (b) =>
      CAIXAS_DE_BLOCO[b.id].some(
        (c) =>
          0.5 >= c[0] && 0.5 <= c[3] && 0.5 >= c[2] && 0.5 <= c[5] && 0.5 >= c[1] && 0.5 <= c[4],
      )
    for (const b of fechados) expect(noMeio(b), `${b.key} fechado sem madeira no vão`).toBe(true)
    for (const b of abertos) expect(noMeio(b), `${b.key} aberto ainda tapa o vão`).toBe(false)
  })

  it('o aberto MOSTRA as folhas — não some com elas', () => {
    // Sem as folhas encostadas nos montantes, um portão aberto pareceria ter
    // evaporado, e o jogador acharia que quebrou.
    for (const b of abertos) expect(CAIXAS_DE_BLOCO[b.id].length).toBeGreaterThan(2)
  })

  it('as quatro direções são formas DIFERENTES', () => {
    const assinaturas = new Set(fechados.map((b) => JSON.stringify(CAIXAS_DE_BLOCO[b.id])))
    expect(assinaturas.size).toBe(4)
  })
})

describe('formas — a lanterna', () => {
  const lanterna = BLOCK_BY_KEY.lantern

  it('tem forma livre, e NÃO é o cubo cheio que a deixava oca de perto', () => {
    // O defeito de 18/09: sem forma, a lanterna saía pelo greedy como cubo 1×1
    // com `cutout`, e de perto virava uma caixa de vidro vazada. A forma livre
    // é a correção; esta linha cai se alguém tirar o `lanterna` das tabelas.
    expect(EH_FORMA_LIVRE[lanterna.id], 'a lanterna voltou a ser cubo do greedy').toBe(1)
    expect(FACES_DE_BLOCO[lanterna.id], 'a lanterna perdeu as faces próprias').not.toBeNull()
    expect(FACES_DE_BLOCO[lanterna.id].length).toBe(6)
  })

  it('é uma caixa PEQUENA e centrada, dentro da célula', () => {
    const caixas = CAIXAS_DE_BLOCO[lanterna.id]
    expect(caixas.length).toBe(1)
    const [x0, y0, z0, x1, y1, z1] = caixas[0]
    // Menor que meia célula em planta: não é o cubo cheio.
    expect(x1 - x0, 'larga demais pra ser lanterna').toBeLessThan(0.5)
    expect(z1 - z0).toBeLessThan(0.5)
    expect(y1 - y0, 'alta demais').toBeLessThanOrEqual(0.75)
    // Dentro da célula, e assentada no bloco de baixo.
    expect(x0).toBeGreaterThan(0)
    expect(z0).toBeGreaterThan(0)
    expect(x1).toBeLessThan(1)
    expect(z1).toBeLessThan(1)
    expect(y0, 'flutua em vez de assentar').toBe(0)
    // Centrada nos dois eixos do plano.
    expect((x0 + x1) / 2).toBeCloseTo(0.5, 6)
    expect((z0 + z1) / 2).toBeCloseTo(0.5, 6)
  })

  it('só o FUNDO é de borda; laterais e tampo vivem no meio e nunca somem', () => {
    // As laterais e o tampo estão no interior da célula: marcá-los de borda
    // faria a lanterna sumir encostada numa parede. Só o fundo (y=0) toca a
    // divisa — ele some pousado no chão opaco, e aparece no poste de cerca.
    for (const f of FACES_DE_BLOCO[lanterna.id]) {
      const esperado = f.f === 3
      expect(f.naBorda, `face ${f.f}: naBorda deveria ser ${esperado}`).toBe(esperado)
    }
    expect(FACES_DE_BLOCO[lanterna.id].filter((f) => f.naBorda).length, 'só o fundo').toBe(1)
  })

  it('a colisão encolheu para a caixa pequena, não é mais o cubo cheio', () => {
    // A lanterna é sólida; o que muda é o TAMANHO da colisão. Antes o mundo
    // colidia com o cubo inteiro em volta da lanterninha — uma parede
    // invisível. Agora a caixa é a mesma do desenho.
    const solido = SOLIDO_DE_BLOCO[lanterna.id]
    expect(Array.isArray(solido), 'a lanterna deixou de colidir por caixa').toBe(true)
    expect(solido.length).toBe(1)
    const [x0, y0, z0, x1, y1, z1] = solido[0]
    const volume = (x1 - x0) * (y1 - y0) * (z1 - z0)
    expect(volume, 'a colisão voltou a ser o cubo cheio').toBeLessThan(0.25)
    expect(solido).toEqual(CAIXAS_DE_BLOCO[lanterna.id])
  })
})
