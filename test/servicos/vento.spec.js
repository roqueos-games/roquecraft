import { describe, it, expect } from 'vitest'
import { meshSection } from '../../src/servicos/mesher.js'
import { BLOCK_BY_KEY, AIR, VENTO_DE_BLOCO } from '../../src/servicos/blocks.js'

// O VENTO CHEGA NA FOLHA, E A MOITA SE DOBRA INTEIRA.
//
// Três invariantes vivem aqui, e as três já foram quebradas ou nunca
// existiram:
//
//  1. A folhagem CEDE ao vento. Até esta rodada só a grama cedia: o `emitQuad`
//     escrevia zero fixo no atributo e a copa das árvores era a única
//     vegetação congelada do mundo.
//  2. A folhagem NÃO FUNDE no greedy. Deslocar vértice em quad fundido abre a
//     junção em T clássica — o quad grande só tem vértice nos cantos, o vizinho
//     pequeno tem um no meio da aresta, e o do meio anda enquanto a aresta não.
//  3. A cruz da planta cabe DENTRO da célula. A fase do vento vem de
//     `floor(worldPos.xz)`, e uma ponta em x+1 cai no bloco vizinho: metade da
//     moita balançaria com a fase de um bloco e metade com a de outro.
//
// Cada teste traz junto a REGRA ANTIGA reimplementada, e afirma que ela erra.
// É o que impede alguém de "simplificar" o conserto de volta ao defeito: um
// teste que passa nos dois códigos não testa nada.

const folha = BLOCK_BY_KEY.oakLeaves.id
const folhaPinheiro = BLOCK_BY_KEY.spruceLeaves.id
const pedra = BLOCK_BY_KEY.stone.id
const terra = BLOCK_BY_KEY.dirt.id
const capim = BLOCK_BY_KEY.tallGrass.id

/** Acessor de teste com luz e tint CONSTANTES — assim a chave do greedy só
 *  depende do bloco, e "não fundiu" não pode ser efeito colateral da luz. */
const mundo = (block) => ({ block, light: () => 0xf0, tint: () => [0.4, 0.7, 0.3] })

/** Vértices em grupos de 4 (o mesher emite quad por quad). */
function quads(geo) {
  if (!geo) return []
  const out = []
  for (let q = 0; q * 12 < geo.position.length; q++) {
    const v = []
    for (let i = 0; i < 4; i++) {
      const b = q * 12 + i * 3
      v.push([geo.position[b], geo.position[b + 1], geo.position[b + 2]])
    }
    out.push(v)
  }
  return out
}

/** Maior lado do quad em qualquer eixo — 1 significa "uma célula". */
const lado = (q) =>
  Math.max(
    ...[0, 1, 2].map((e) => Math.max(...q.map((v) => v[e])) - Math.min(...q.map((v) => v[e]))),
  )

describe('roquecraft - vento na folhagem', () => {
  it('a tabela de vento separa folhagem de estrutura, e espécie de espécie', () => {
    expect(VENTO_DE_BLOCO[pedra]).toBe(0)
    expect(VENTO_DE_BLOCO[terra]).toBe(0)
    expect(VENTO_DE_BLOCO[BLOCK_BY_KEY.oakLog.id], 'tronco não balança').toBe(0)
    expect(VENTO_DE_BLOCO[folha]).toBeGreaterThan(0)
    expect(VENTO_DE_BLOCO[capim]).toBeGreaterThan(0)
    // Agulha de pinheiro é rígida, folha de bétula é nervosa. Se todas as
    // espécies tiverem o mesmo número, a floresta mista balança em uníssono e
    // vira papel de parede — foi por isso que o número virou por espécie.
    const especies = [
      VENTO_DE_BLOCO[BLOCK_BY_KEY.oakLeaves.id],
      VENTO_DE_BLOCO[BLOCK_BY_KEY.birchLeaves.id],
      VENTO_DE_BLOCO[BLOCK_BY_KEY.spruceLeaves.id],
      VENTO_DE_BLOCO[BLOCK_BY_KEY.jungleLeaves.id],
    ]
    expect(new Set(especies).size, `valores: ${especies.join(',')}`).toBe(4)
    expect(VENTO_DE_BLOCO[folhaPinheiro], 'agulha de pinheiro tem que ser a mais rígida').toBe(
      Math.min(...especies),
    )
  })

  it('a face de folha carrega vento — e a REGRA ANTIGA (zero fixo) erraria', () => {
    const geo = meshSection(
      mundo((x, y, z) => (y === 3 && x === 0 && z === 0 ? folha : y <= 2 ? pedra : AIR)),
      0,
      0,
      0,
    ).cutout
    expect(geo, 'nenhuma malha recortada').toBeTruthy()
    const ventos = [...new Set(Array.from(geo.wind))]
    expect(ventos, `ventos encontrados: ${ventos.join(',')}`).toEqual([VENTO_DE_BLOCO[folha]])
    // A regra antiga: `bucket.wind.push(0)` em toda face não-água.
    const antigo = geo.wind.every((v) => v === 0)
    expect(antigo, 'a regra antiga passaria neste teste — ele não prova nada').toBe(false)
  })
})

describe('roquecraft - folhagem não funde no greedy', () => {
  // Fila de 8 folhas idênticas, luz e tint constantes: é o caso em que o
  // greedy fundiria com mais gosto. Se algum quad medir mais de uma célula,
  // existe junção em T possível e o deslocamento por vértice rasga a copa.
  const fila = (id) =>
    mundo((x, y, z) => (y === 3 && z === 0 && x >= 0 && x < 8 ? id : y <= 2 ? pedra : AIR))

  it('nenhum quad de folha passa de uma célula', () => {
    const qs = quads(meshSection(fila(folha), 0, 0, 0).cutout)
    expect(qs.length, 'nenhum quad de folha').toBeGreaterThan(0)
    const maior = Math.max(...qs.map(lado))
    expect(maior, `maior quad de folha mede ${maior} blocos`).toBe(1)
  })

  it('o medidor ENXERGA fusão: a mesma fila em pedra funde', () => {
    // Prova de vida do medidor. Sem esta metade, `lado() === 1` poderia estar
    // devolvendo 1 por um erro de leitura do buffer e ninguém saberia.
    const qs = quads(meshSection(fila(pedra), 0, 0, 0).opaque)
    const maior = Math.max(...qs.map(lado))
    expect(maior, 'pedra em fila TEM que fundir — senão o medidor está cego').toBeGreaterThan(1)
  })

  it('o preço da fatura é linear, não explosivo', () => {
    // Não fundir custa vértice. O custo aceitável é "proporcional às folhas",
    // e o inaceitável seria explodir a malha inteira: aqui o número fica
    // registrado pra quem vier depois discutir com dado, não com impressão.
    const oito = meshSection(fila(folha), 0, 0, 0).cutout
    const dezesseis = meshSection(
      mundo((x, y, z) => (y === 3 && z === 0 && x >= 0 && x < 16 ? folha : y <= 2 ? pedra : AIR)),
      0,
      0,
      0,
    ).cutout
    const razao = dezesseis.count / oito.count
    expect(razao, `dobrar as folhas multiplicou os vértices por ${razao.toFixed(2)}`).toBeLessThan(
      2.3,
    )
    expect(razao).toBeGreaterThan(1.7)
  })
})

describe('roquecraft - a cruz da planta cabe na célula', () => {
  // A fase do vento sai de `floor(worldPos.xz)`. Se um canto da cruz cair no
  // bloco vizinho, a moita recebe DUAS fases e se rasga no meio em vez de
  // dobrar. O teste é geométrico e não depende do shader.
  const comCapim = mundo((x, y, z) =>
    y === 3 && x === 5 && z === 7 ? capim : y <= 2 ? terra : AIR,
  )

  it('todos os vértices da moita caem na mesma célula', () => {
    const geo = meshSection(comCapim, 0, 0, 0).cutout
    expect(geo, 'a planta não gerou malha').toBeTruthy()
    const xs = new Set()
    const zs = new Set()
    for (let i = 0; i < geo.position.length; i += 3) {
      xs.add(Math.floor(geo.position[i]))
      zs.add(Math.floor(geo.position[i + 2]))
    }
    expect([...xs], `células em x: ${[...xs].join(',')}`).toEqual([5])
    expect([...zs], `células em z: ${[...zs].join(',')}`).toEqual([7])
  })

  it('a REGRA ANTIGA (cruz encostando na parede) daria duas células', () => {
    // Reimplementação literal do que o mesher fazia: `lo = 0`, `hi = 1` para
    // escala cheia. Se este bloco algum dia passar a concordar com o de cima,
    // é porque o recuo saiu do mesher — e a moita voltou a se rasgar.
    const sc = 1
    const inset = (1 - sc) / 2
    const lo = inset
    const hi = 1 - inset
    const cantos = [lo, hi].map((c) => Math.floor(5 + c))
    expect(new Set(cantos).size, 'a regra antiga cabia numa célula só').toBe(2)
  })

  it('o recuo é invisível: a cruz perde menos de 5% da largura', () => {
    const geo = meshSection(comCapim, 0, 0, 0).cutout
    const xs = []
    for (let i = 0; i < geo.position.length; i += 3) xs.push(geo.position[i])
    const largura = Math.max(...xs) - Math.min(...xs)
    expect(largura, `largura da cruz: ${largura}`).toBeGreaterThan(0.95)
    expect(largura).toBeLessThan(1)
  })
})

describe('roquecraft - a fronteira dos dois significados do byte', () => {
  // `aWind` guarda balanço fora da água e profundidade da lâmina dentro dela.
  // A conta que escolhe entre os dois roda por vértice, e um erro ali não dá
  // exceção nenhuma: dá pedra balançando ou lago sem espuma de margem.
  const agua = BLOCK_BY_KEY.water.id

  const lagoComArvore = mundo((x, y, z) => {
    if (x >= 8 && y >= 4 && y <= 6) return agua // lâmina de 3 na metade leste
    if (x >= 8 && y <= 3) return pedra
    if (x < 8 && y === 5 && z === 5) return folha // uma folha na metade oeste
    if (x < 8 && y <= 3) return pedra
    return AIR
  })

  it('a água leva profundidade e a folha leva vento, na mesma seção', () => {
    const { cutout, transparent } = meshSection(lagoComArvore, 0, 0, 0)
    const naFolha = [...new Set(Array.from(cutout.wind))]
    expect(naFolha, `vento na folha: ${naFolha.join(',')}`).toEqual([VENTO_DE_BLOCO[folha]])
    const naAgua = [...new Set(Array.from(transparent.wind))].filter((v) => v > 0)
    expect(naAgua.length, 'a superfície da água perdeu a profundidade').toBeGreaterThan(0)
    // E o valor da água NÃO pode ser o vento de nenhum bloco de folha: se
    // fosse, os dois ramos do `? :` estariam trocados sem ninguém notar.
    expect(naAgua).not.toContain(VENTO_DE_BLOCO[folha])
  })

  it('pedra continua imóvel — o vazamento antigo do byte não voltou', () => {
    // Já aconteceu: `maskProf` não é zerado entre fatias, e escrever só quando
    // há água deixava o valor da fatia anterior valendo pra uma face de PEDRA.
    // A pedra começava a balançar como mato, e não aparecia em print nenhum.
    const { opaque } = meshSection(lagoComArvore, 0, 0, 0)
    const ventos = [...new Set(Array.from(opaque.wind))]
    expect(ventos, `pedra recebeu vento: ${ventos.join(',')}`).toEqual([0])
  })
})
