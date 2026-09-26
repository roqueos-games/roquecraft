import { describe, it, expect } from 'vitest'
import { meshSection, faceVisible } from '../../src/servicos/mesher.js'
import { BLOCK_BY_KEY, AIR, IS_TRANSLUCENT, FACE_NA_BORDA } from '../../src/servicos/blocks.js'
import { WATER_DROP } from '../../src/servicos/constants.js'

//
// O GELO NA ÁGUA — relato do founder em 15/09/2026, com dois prints do MESMO
// quadro (posição idêntica no HUD, -178 · 63 · 107) em que o gelo aparece
// diferente: "os gelos nas aguas estão com as faces falhando".
//
// ⚠️ NÃO É FACE FALTANDO, E JÁ FOI DIAGNOSTICADO ASSIM UMA VEZ. Em 22/08 a
// mesma queixa ("blocos de gelo sem a parte das laterais e inferior") levou a
// uma sonda de `depthWrite`, e a auditoria de malha varreu 633 mil blocos sem
// achar uma face ausente. A geometria SEMPRE esteve lá. O que existe é geometria
// A MAIS, e de dois tipos — os dois porque o mesher não sabe que gelo é a tampa
// de uma lâmina d'água:
//
//   1. FACES COINCIDENTES. `faceVisible(água, gelo)` e `faceVisible(gelo, água)`
//      devolviam AMBAS `true`, então os dois blocos emitiam um quad no mesmo
//      plano. Os dois caem no bucket transparente, que tem `depthWrite: false`:
//      sem escrita de profundidade quem aparece é quem desenhou por último, e a
//      ordem dentro da seção é a de emissão do mesher. Daí o piscar entre
//      quadros com a câmera PARADA, que é o que os dois prints mostram.
//
//   2. A FRESTA. O rebaixamento da lâmina (`WATER_DROP`, o degrau que dá a borda
//      na praia) é decidido por `!ehMolhado(vizinho de cima)`. Gelo não é
//      molhado, então a água ABAIXO do gelo rebaixava 0,12 e abria um vão entre
//      o topo dela e o fundo do bloco — um fio de nada visível de lado.
//
// A correção é um conceito só: o gelo TAMPA líquido. Ver `ehTampaDeLiquido`.
//

const water = BLOCK_BY_KEY.water.id
const ice = BLOCK_BY_KEY.ice.id
const glass = BLOCK_BY_KEY.glass?.id
const stone = BLOCK_BY_KEY.stone.id

/** Lago com uma PLACA DE GELO na superfície, e água em volta e embaixo. */
function lagoComGelo({ y = 8, lado = 8, gelo = [3, 6] } = {}) {
  const [g0, g1] = gelo
  return {
    block: (bx, by, bz) => {
      const dentro = bx >= 2 && bx < 2 + lado && bz >= 2 && bz < 2 + lado
      if (!dentro) return AIR
      if (by > y) return AIR
      const naPlaca = bx >= g0 && bx <= g1 && bz >= g0 && bz <= g1
      if (by === y) return naPlaca ? ice : water
      if (by === y - 1) return water
      return stone
    },
    light: () => 0xf0,
    tint: () => [0.3, 0.5, 0.9],
  }
}

function quadsDe(geo) {
  if (!geo) return []
  const out = []
  const { position, normal, count } = geo
  for (let i = 0; i < count; i += 4) {
    const xs = []
    const ys = []
    const zs = []
    for (let k = 0; k < 4; k++) {
      xs.push(position[(i + k) * 3])
      ys.push(position[(i + k) * 3 + 1])
      zs.push(position[(i + k) * 3 + 2])
    }
    out.push({
      n: [normal[i * 3], normal[i * 3 + 1], normal[i * 3 + 2]].map((v) => Math.round(v / 127)),
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
      minZ: Math.min(...zs),
      maxZ: Math.max(...zs),
    })
  }
  return out
}

describe('o gelo na água', () => {
  // ── 1. A REGRA, DIRETO ────────────────────────────────────────────────────

  it('⚠️ a ÁGUA não desenha parede contra o gelo', () => {
    // O gelo é um bloco CHEIO: ele cobre o plano inteiro daquela face. A parede
    // de água ali dentro não acrescenta pixel nenhum e briga pelo mesmo plano.
    // Face 0 = +x (lateral), face 2 = +y (topo), face 3 = -y (fundo).
    for (const f of [0, 1, 2, 3, 4, 5]) {
      expect(faceVisible(water, ice, f), `água contra gelo, face ${f}`).toBe(false)
    }
  })

  it('⚠️ mas o GELO continua desenhando a dele', () => {
    // A face externa do gelo é o que o jogador vê. Esconder as duas deixaria um
    // buraco — que é exatamente o defeito que o founder ACHOU que estava vendo.
    for (const f of [0, 1, 2, 3, 4, 5]) {
      expect(faceVisible(ice, water, f), `gelo contra água, face ${f}`).toBe(true)
    }
  })

  it('a regra vale para a classe, não só para o gelo', () => {
    // Vidro submerso tem exatamente a mesma forma de defeito.
    if (glass === undefined) return
    for (const f of [0, 2]) {
      expect(faceVisible(water, glass, f), `água contra vidro, face ${f}`).toBe(false)
      expect(faceVisible(glass, water, f), `vidro contra água, face ${f}`).toBe(true)
    }
  })

  it('⚠️ SENTINELA: todo bloco translúcido é CHEIO hoje', () => {
    // A regra nova tem uma guarda — só esconde a face do líquido se o vizinho
    // cobrir a face INTEIRA. Um mutante que apagou essa guarda SOBREVIVEU, e a
    // investigação explicou por quê: nenhum bloco translúcido do jogo é parcial
    // hoje, então a guarda nunca decide nada. Condição que nunca decide é
    // decoração, e decoração que parece guarda é pior — o próximo a ler acha
    // que existe uma regra ali.
    //
    // Ela fica, porque o dia em que nascer uma LAJE ou um PAINEL de vidro ela é
    // o que impede a água de sumir atrás de um bloco vazado. E para não ficar
    // sem mecanismo, este teste é o despertador: no dia em que esse bloco
    // nascer, ele cai e manda escrever o caso de verdade em vez de descobrir
    // pelo print de um jogador.
    const parciais = Object.values(BLOCK_BY_KEY)
      .filter((b) => b && IS_TRANSLUCENT[b.id] === 1)
      .filter((b) => [0, 1, 2, 3, 4, 5].some((f) => FACE_NA_BORDA[b.id * 6 + f] !== 1))
      .map((b) => b.key)
    expect(
      parciais,
      'nasceu um bloco translúcido PARCIAL: escreva o caso dele em faceVisible antes de seguir',
    ).toEqual([])
  })

  it('não mexeu no que já estava certo', () => {
    expect(faceVisible(ice, ice, 0), 'gelo com gelo continua escondendo').toBe(false)
    expect(faceVisible(water, water, 0), 'água com água continua escondendo').toBe(false)
    expect(faceVisible(water, stone, 0), 'água contra pedra continua escondendo').toBe(false)
    expect(faceVisible(ice, stone, 0), 'gelo contra pedra continua escondendo').toBe(false)
  })

  // ── 2. A MALHA, NO CASO CONSTRUÍDO ────────────────────────────────────────

  const quads = quadsDe(meshSection(lagoComGelo(), 0, 0, 0).transparent)

  it('emite geometria', () => {
    expect(quads.length).toBeGreaterThan(0)
  })

  it('⚠️ nenhum par de quads divide o MESMO plano', () => {
    // A prova direta do piscar: dois quads com a mesma normal e a mesma caixa.
    // Com `depthWrite: false` quem ganha é o último desenhado, e a ordem não é
    // por distância — então o resultado muda de quadro para quadro com a câmera
    // parada, que é o que os dois prints do founder mostram.
    // ⚠️ SOBREPOSIÇÃO, E NÃO IGUALDADE — e eu já errei este instrumento DUAS
    // vezes no mesmo teste. Primeiro comparei a normal COM SINAL, e as duas
    // faces em briga são opostas (a água emite +x onde o gelo emite -x), então
    // nunca casavam. Depois comparei a caixa inteira, e o greedy meshing funde
    // a água num retângulo e o gelo em outro de tamanho diferente: as caixas
    // divergem, a área compartilhada continua lá. Um teste que exige igualdade
    // exata de dois quads gerados por caminhos diferentes declara paz sempre.
    //
    // O material é `DoubleSide`, então o sinal da normal não protege ninguém: o
    // que importa é dois quads no mesmo EIXO, na mesma COORDENADA desse eixo, e
    // com área em comum.
    const eixoDe = (q) => q.n.findIndex((c) => c !== 0)
    const planoDe = (q, e) => [q.minX, q.minY, q.minZ][e]
    const retDe = (q, e) =>
      e === 0
        ? [q.minY, q.maxY, q.minZ, q.maxZ]
        : e === 1
          ? [q.minX, q.maxX, q.minZ, q.maxZ]
          : [q.minX, q.maxX, q.minY, q.maxY]
    const area = (a, b) =>
      Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0])) *
      Math.max(0, Math.min(a[3], b[3]) - Math.max(a[2], b[2]))

    const brigas = []
    for (let i = 0; i < quads.length; i++) {
      for (let j = i + 1; j < quads.length; j++) {
        const e = eixoDe(quads[i])
        if (e !== eixoDe(quads[j])) continue
        if (Math.abs(planoDe(quads[i], e) - planoDe(quads[j], e)) > 0.001) continue
        const s = area(retDe(quads[i], e), retDe(quads[j], e))
        if (s > 0.001)
          brigas.push(`eixo ${e} em ${planoDe(quads[i], e).toFixed(2)}: ${s.toFixed(2)}`)
      }
    }
    expect(brigas.slice(0, 6), `${brigas.length} pares de quads brigam pelo mesmo plano`).toEqual(
      [],
    )
  })

  it('⚠️ a lâmina SOB o gelo é cheia — não abre fresta', () => {
    // Sob o gelo a água é tampada, então não é superfície e não rebaixa. Um vão
    // de 0,12 entre o topo da água e o fundo do gelo é um fio visível de lado.
    // ⚠️ A ALTURA, E NÃO A FAIXA QUE EU CHUTEI. A primeira versão filtrava
    // `minY > 8`, e o topo rebaixado da água sob o gelo cai em 7,88 — abaixo do
    // filtro. O teste não via o próprio caso que existia para ver.
    //
    // A pergunta certa é simples: sob a placa de gelo, algum topo de água está
    // numa altura QUEBRADA? Água tampada é cheia; só superfície livre rebaixa.
    const sobOGelo = quads.filter(
      (q) =>
        q.n[1] === 1 && q.minX >= 3 && q.maxX <= 7 && q.minZ >= 3 && q.maxZ <= 7 && q.minY < 8.5,
    )
    const comFresta = sobOGelo.filter((q) => Math.abs(q.minY - Math.round(q.minY)) > 0.001)
    expect(
      comFresta.map((q) => q.minY.toFixed(3)),
      `a água rebaixou ${WATER_DROP} sob o gelo e abriu fresta`,
    ).toEqual([])
  })
})
