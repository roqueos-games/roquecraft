import { describe, it, expect } from 'vitest'
import { AIR, ID, BLOCK_BY_KEY, TRIGO, blockDrop } from '../../src/servicos/blocks.js'
import { ITEMS, placeableBlock } from '../../src/servicos/items.js'
import { RECIPES, findRecipe } from '../../src/servicos/recipes.js'
import {
  ararComEnxada,
  ARAVEIS,
  plantar,
  crescer,
  estaMadura,
  perdeuOChao,
  LUZ_MINIMA,
  TIQUES_ENTRE_TENTATIVAS,
  mudaVaiCrescer,
  mudaSemChao,
  CHANCE_DA_MUDA,
  ALTURA_MINIMA_DA_ARVORE,
  soloComAgua,
  chanceDeAvancar,
  frutoDoCauleMaduro,
  ladoParaOFruto,
  seguraFruto,
  CHANCE_DE_FRUTIFICAR,
  CHANCE_DE_AVANCAR,
  canaVaiCrescer,
  chaoDeCana,
  ALTURA_DA_CANA,
} from '../../src/servicos/agricultura.js'
import { celulasDaArvore } from '../../src/servicos/worldgen.js'

// A ENXADA E O SOLO ARADO (onda 3, etapa 1).
//
// A agricultura é a cadeia mais longa do jogo e esta é a primeira tranca dela:
// sem enxada não há canteiro, sem canteiro não há trigo, sem trigo não há pão
// nem bezerro. O que este arquivo cobra é justamente o que um `if` solto no
// componente não cobraria.

describe('a enxada existe como ferramenta de verdade', () => {
  it('tem os quatro tiers, com durabilidade e kind hoe', () => {
    for (const tier of ['wood', 'stone', 'iron', 'diamond']) {
      const it_ = ITEMS[`${tier}_hoe`]
      expect(it_, `${tier}_hoe`).toBeTruthy()
      expect(it_.kind).toBe('tool')
      expect(it_.tool.kind).toBe('hoe')
      expect(it_.durability).toBeGreaterThan(0)
    }
  })

  it('duas tábuas e duas varas na bancada dão uma enxada', () => {
    const p = { item: 'oakPlanks', count: 1 }
    const s = { item: 'stick', count: 1 }
    // MM·  /  ·S·  /  ·S·
    const grade = [p, p, null, null, s, null, null, s, null]
    expect(findRecipe(grade, 3, true)).toMatchObject({ item: 'wood_hoe', count: 1 })
  })

  it('não sai na grade 2×2 do inventário — precisa de bancada', () => {
    const p = { item: 'oakPlanks', count: 1 }
    const s = { item: 'stick', count: 1 }
    expect(findRecipe([p, p, null, s], 2, false)).toBeNull()
  })

  it('a receita só usa o que o mundo entrega de graça', () => {
    // Tábua e vara, os dois tirados de uma árvore com a mão. Se um dia a enxada
    // de madeira exigir ferro, a agricultura deixa de ser alcançável numa
    // partida nova — este teste é o aviso que chega antes da sonda de jornada.
    const receita = RECIPES.find((r) => r.result === 'wood_hoe')
    expect(receita).toBeTruthy()
    for (const mat of Object.values(receita.keyMap)) {
      expect(['oakPlanks', 'stick']).toContain(mat)
    }
  })
})

describe('arar', () => {
  it('grama e terra viram solo arado', () => {
    for (const chave of ARAVEIS) {
      const plano = ararComEnxada(ID[chave], AIR)
      expect(plano, chave).toBeTruthy()
      expect(plano.solo).toBe(ID.farmland)
    }
  })

  it('pedra, areia e podzol NÃO viram', () => {
    for (const chave of ['stone', 'sand', 'podzol', 'cobblestone', 'oakLog']) {
      expect(ararComEnxada(ID[chave], AIR), chave).toBeNull()
    }
  })

  it('nada acontece com bloco sólido por cima', () => {
    expect(ararComEnxada(ID.grassBlock, ID.stone)).toBeNull()
    expect(ararComEnxada(ID.dirt, ID.oakPlanks)).toBeNull()
  })

  it('mato por cima não impede, e é limpado no processo', () => {
    const plano = ararComEnxada(ID.grassBlock, ID.tallGrass)
    expect(plano).toBeTruthy()
    expect(plano.limpaAcima).toBe(true)
  })

  it('com ar por cima não há nada pra limpar', () => {
    expect(ararComEnxada(ID.dirt, AIR).limpaAcima).toBe(false)
  })

  it('arar o próprio canteiro não faz nada (não é bloco arável)', () => {
    expect(ararComEnxada(ID.farmland, AIR)).toBeNull()
    expect(ararComEnxada(ID.farmlandWet, AIR)).toBeNull()
  })
})

describe('o canteiro como bloco', () => {
  it('dropa TERRA e não a si mesmo, e não existe como item', () => {
    for (const chave of ['farmland', 'farmlandWet']) {
      expect(ITEMS[chave], `${chave} não pode ser item`).toBeUndefined()
    }
  })
})

// ── ETAPA 2: semente, plantio e crescimento ─────────────────────────────────

describe('a semente', () => {
  it('cai do mato, que é a única fonte numa partida nova', () => {
    const mato = BLOCK_BY_KEY.tallGrass
    expect(mato.drops).toBe('wheat_seeds')
    expect(mato.dropChance).toBeLessThan(1)
    expect(ITEMS.wheat_seeds).toBeTruthy()
  })

  it('não é bloco colocável — planta-se, não se coloca', () => {
    expect(ITEMS.wheat_seeds.kind).toBe('material')
    expect(placeableBlock('wheat_seeds')).toBe(0)
  })

  it('o mato dropa de verdade quando o sorteio favorece', () => {
    const sempre = blockDrop(ID.tallGrass, null, () => 0)
    expect(sempre).toEqual({ item: 'wheat_seeds', count: 1 })
    expect(blockDrop(ID.tallGrass, null, () => 0.99)).toBeNull()
  })
})

describe('plantar', () => {
  it('semente em solo arado dá o broto', () => {
    expect(plantar('wheat_seeds', ID.farmland, AIR)).toBe(ID.wheat0)
    expect(plantar('wheat_seeds', ID.farmlandWet, AIR)).toBe(ID.wheat0)
  })

  it('em grama, terra ou pedra não planta', () => {
    for (const chave of ['grassBlock', 'dirt', 'stone', 'sand']) {
      expect(plantar('wheat_seeds', ID[chave], AIR), chave).toBeNull()
    }
  })

  it('com a célula ocupada não planta', () => {
    expect(plantar('wheat_seeds', ID.farmland, ID.stone)).toBeNull()
  })

  it('mato por cima é substituível', () => {
    expect(plantar('wheat_seeds', ID.farmland, ID.tallGrass)).toBe(ID.wheat0)
  })

  it('outro item na mão não planta nada', () => {
    expect(plantar('wheat', ID.farmland, AIR)).toBeNull()
    expect(plantar('dirt', ID.farmland, AIR)).toBeNull()
  })
})

describe('crescer', () => {
  const sorte = () => 0 // o sorteio sempre favorece
  const azar = () => 0.99

  it('avança um estágio por vez, do broto à espiga', () => {
    let id = ID.wheat0
    const vistos = [id]
    for (let i = 0; i < 20; i++) {
      const p = crescer(id, { idSolo: ID.farmland, luz: 15, rng: sorte })
      if (p === null) break
      id = p
      vistos.push(id)
    }
    expect(vistos.length).toBe(TRIGO.estagios)
    expect(estaMadura(id)).toBe(true)
  })

  it('a madura não cresce mais', () => {
    expect(crescer(ID.wheat7, { idSolo: ID.farmland, luz: 15, rng: sorte })).toBeNull()
  })

  it('no escuro não cresce', () => {
    expect(crescer(ID.wheat0, { idSolo: ID.farmland, luz: LUZ_MINIMA - 1, rng: sorte })).toBeNull()
    expect(crescer(ID.wheat0, { idSolo: ID.farmland, luz: LUZ_MINIMA, rng: sorte })).toBe(ID.wheat1)
  })

  it('luz desconhecida (chunk fora) não é escuro nem claro: não cresce', () => {
    expect(crescer(ID.wheat0, { idSolo: ID.farmland, luz: null, rng: sorte })).toBeNull()
  })

  it('em terra comum não cresce, nem com sol a pino', () => {
    expect(crescer(ID.wheat0, { idSolo: ID.dirt, luz: 15, rng: sorte })).toBeNull()
    expect(crescer(ID.wheat0, { idSolo: ID.grassBlock, luz: 15, rng: sorte })).toBeNull()
  })

  it('o sorteio segura: nem toda visita avança', () => {
    expect(crescer(ID.wheat0, { idSolo: ID.farmland, luz: 15, rng: azar })).toBeNull()
  })

  it('o que não é lavoura não cresce', () => {
    expect(crescer(ID.stone, { idSolo: ID.farmland, luz: 15, rng: sorte })).toBeNull()
  })

  it('a espera cabe no anel de baldes da fila', () => {
    // O anel tem 64 baldes: pedir mais do que isso não dá erro, dá um atraso
    // silenciosamente encurtado. Ver a nota em `agricultura.js`.
    expect(TIQUES_ENTRE_TENTATIVAS).toBeLessThan(64)
  })
})

describe('o talo sem chão', () => {
  it('morre quando o solo deixa de ser lavoura', () => {
    expect(perdeuOChao(ID.wheat3, ID.dirt)).toBe(true)
    expect(perdeuOChao(ID.wheat3, AIR)).toBe(true)
    expect(perdeuOChao(ID.wheat3, ID.farmland)).toBe(false)
  })

  it('o que não é lavoura não morre por isso', () => {
    expect(perdeuOChao(ID.stone, AIR)).toBe(false)
  })

  it('colher verde devolve semente; colher madura dá trigo', () => {
    expect(BLOCK_BY_KEY.wheat0.drops).toBe('wheat_seeds')
    expect(BLOCK_BY_KEY.wheat6.drops).toBe('wheat_seeds')
    expect(BLOCK_BY_KEY.wheat7.drops).toBe('wheat')
  })
})

// ── A MUDA (etapa 6) ────────────────────────────────────────────────────────

describe('a muda vira árvore', () => {
  const sorte = () => 0
  const azar = () => 0.99
  const base = { idCelula: 0, idSolo: 0, luz: 15, colunaLivre: 12, rng: sorte }

  it('em terra ou grama, com luz e céu, cresce', () => {
    for (const solo of ['grassBlock', 'dirt', 'podzol']) {
      expect(mudaVaiCrescer({ ...base, idCelula: ID.oakSapling, idSolo: ID[solo] }), solo).toBe(
        true,
      )
    }
  })

  it('em areia ou pedra não pega', () => {
    for (const solo of ['sand', 'stone', 'cobblestone']) {
      expect(mudaVaiCrescer({ ...base, idCelula: ID.oakSapling, idSolo: ID[solo] }), solo).toBe(
        false,
      )
    }
  })

  it('sem céu não cresce, mesmo com sol e terra boa', () => {
    expect(
      mudaVaiCrescer({ ...base, idCelula: ID.oakSapling, idSolo: ID.dirt, colunaLivre: 3 }),
    ).toBe(false)
  })

  it('no escuro não cresce', () => {
    expect(
      mudaVaiCrescer({ ...base, idCelula: ID.oakSapling, idSolo: ID.dirt, luz: LUZ_MINIMA - 1 }),
    ).toBe(false)
  })

  it('o sorteio segura: ela é MUITO mais lenta que o trigo', () => {
    expect(CHANCE_DA_MUDA).toBeLessThan(0.1)
    expect(mudaVaiCrescer({ ...base, idCelula: ID.oakSapling, idSolo: ID.dirt, rng: azar })).toBe(
      false,
    )
  })

  it('o que não é muda nunca vira árvore', () => {
    expect(mudaVaiCrescer({ ...base, idCelula: ID.tallGrass, idSolo: ID.dirt })).toBe(false)
  })

  it('sem chão, a muda cai', () => {
    expect(mudaSemChao(ID.oakSapling, AIR)).toBe(true)
    expect(mudaSemChao(ID.oakSapling, ID.stone)).toBe(true)
    expect(mudaSemChao(ID.oakSapling, ID.grassBlock)).toBe(false)
    expect(mudaSemChao(ID.stone, AIR)).toBe(false)
  })
})

describe('a forma da árvore é UMA só', () => {
  it('o carvalho tem tronco e copa, e a copa é condicional', () => {
    const cels = celulasDaArvore('oak', () => 0.5)
    const tronco = cels.filter((c) => !c.seAr)
    const copa = cels.filter((c) => c.seAr)
    expect(tronco.length).toBeGreaterThanOrEqual(4)
    expect(copa.length).toBeGreaterThan(10)
    // O pé da árvore é o tronco, na altura 0 — é onde a muda estava.
    expect(tronco.some((c) => c.dx === 0 && c.dy === 0 && c.dz === 0)).toBe(true)
  })

  it('cabe no espaço que a regra exige', () => {
    const alturas = []
    for (let i = 0; i < 30; i++) {
      const cels = celulasDaArvore('oak', Math.random)
      alturas.push(Math.max(...cels.map((c) => c.dy)))
    }
    // Nenhuma árvore pode passar do céu que `mudaVaiCrescer` cobra, senão ela
    // nasce cortada — e o teste de altura mínima vira decoração.
    expect(Math.max(...alturas)).toBeLessThanOrEqual(ALTURA_MINIMA_DA_ARVORE + 4)
  })
})

// ── HIDRATAÇÃO (etapa 4) ────────────────────────────────────────────────────

describe('o canteiro molha e seca', () => {
  it('com água por perto vira solo molhado', () => {
    expect(soloComAgua(ID.farmland, true)).toBe(ID.farmlandWet)
  })

  it('sem água, volta a secar', () => {
    expect(soloComAgua(ID.farmlandWet, false)).toBe(ID.farmland)
  })

  it('sem mudança, não escreve nada', () => {
    // ⚠️ `null` é o que impede a fila de se realimentar para sempre: escrever
    // o mesmo id a cada visita acordaria a vizinhança a cada 3 segundos e
    // gravaria edição idêntica no save, uma por visita.
    expect(soloComAgua(ID.farmland, false)).toBeNull()
    expect(soloComAgua(ID.farmlandWet, true)).toBeNull()
  })

  it('o que não é canteiro não molha', () => {
    expect(soloComAgua(ID.dirt, true)).toBeNull()
    expect(soloComAgua(ID.grassBlock, true)).toBeNull()
  })

  it('molhado faz crescer o DOBRO de rápido — é o que dá função à água', () => {
    expect(chanceDeAvancar(ID.farmlandWet)).toBeGreaterThan(chanceDeAvancar(ID.farmland))
  })

  it('e o crescimento usa essa diferença de verdade', () => {
    // Um sorteio que passa no molhado e falha no seco: se `crescer` ignorasse
    // a hidratação, os dois dariam a mesma resposta.
    const meio = () => (chanceDeAvancar(ID.farmland) + chanceDeAvancar(ID.farmlandWet)) / 2
    expect(crescer(ID.wheat0, { idSolo: ID.farmlandWet, luz: 15, rng: meio })).toBe(ID.wheat1)
    expect(crescer(ID.wheat0, { idSolo: ID.farmland, luz: 15, rng: meio })).toBeNull()
  })
})

// ── O CAULE QUE PARE (onda 4) ───────────────────────────────────────────────

describe('abóbora e melancia', () => {
  it('a fatia de melancia deixa de ser item morto: alguma coisa a produz', () => {
    const fonte = Object.values(BLOCK_BY_KEY).find((b) => b.drops === 'melon_slice')
    expect(fonte, 'nenhum bloco dropa melon_slice').toBeTruthy()
    expect(fonte.dropCount).toBeGreaterThan(1)
  })

  it('as duas sementes saem do fruto, sem molde', () => {
    const f = { item: 'pumpkin', count: 1 }
    expect(findRecipe([f, null, null, null], 2, false)).toMatchObject({ item: 'pumpkin_seeds' })
    const m = { item: 'melon_slice', count: 1 }
    expect(findRecipe([m, null, null, null], 2, false)).toMatchObject({ item: 'melon_seeds' })
  })

  it('plantar a semente de caule dá o estágio 0 do caule certo', () => {
    expect(plantar('pumpkin_seeds', ID.farmland, AIR)).toBe(ID.pumpkinStem0)
    expect(plantar('melon_seeds', ID.farmland, AIR)).toBe(ID.melonStem0)
  })

  it('o caule verde não dá fruto; o maduro dá', () => {
    expect(frutoDoCauleMaduro(ID.pumpkinStem0)).toBeNull()
    expect(frutoDoCauleMaduro(ID.pumpkinStem6)).toBeNull()
    expect(frutoDoCauleMaduro(ID.pumpkinStem7)).toBe('pumpkin')
    expect(frutoDoCauleMaduro(ID.melonStem7)).toBe('melon')
  })

  it('lavoura comum não dá fruto nenhum — só caule tem essa propriedade', () => {
    expect(frutoDoCauleMaduro(ID.wheat7)).toBeNull()
    expect(frutoDoCauleMaduro(ID.carrot3)).toBeNull()
    expect(frutoDoCauleMaduro(ID.stone)).toBeNull()
  })

  it('o fruto só nasce em lado VAZIO e com chão', () => {
    const lados = [
      { dx: 1, dz: 0, vazio: false, chao: true },
      { dx: -1, dz: 0, vazio: true, chao: false },
      { dx: 0, dz: 1, vazio: true, chao: true },
    ]
    expect(ladoParaOFruto(lados, () => 0)).toMatchObject({ dx: 0, dz: 1 })
  })

  it('sem nenhum lado bom, não nasce nada', () => {
    const lados = [
      { dx: 1, dz: 0, vazio: false, chao: true },
      { dx: -1, dz: 0, vazio: true, chao: false },
    ]
    expect(ladoParaOFruto(lados, () => 0)).toBeNull()
  })

  it('o lado é SORTEADO, senão quatro caules dão quatro frutos no mesmo eixo', () => {
    const lados = [
      { dx: 1, dz: 0, vazio: true, chao: true },
      { dx: -1, dz: 0, vazio: true, chao: true },
      { dx: 0, dz: 1, vazio: true, chao: true },
      { dx: 0, dz: -1, vazio: true, chao: true },
    ]
    const escolhidos = new Set(
      [0, 0.3, 0.6, 0.95].map((r) => JSON.stringify(ladoParaOFruto(lados, () => r))),
    )
    expect(escolhidos.size).toBe(4)
  })

  it('terra, grama e canteiro seguram o fruto; pedra e areia não', () => {
    for (const k of ['dirt', 'grassBlock', 'podzol', 'farmland', 'farmlandWet']) {
      expect(seguraFruto(ID[k]), k).toBe(true)
    }
    for (const k of ['stone', 'sand', 'gravel']) expect(seguraFruto(ID[k]), k).toBe(false)
  })

  it('frutificar é bem mais raro que crescer — senão a horta entope', () => {
    expect(CHANCE_DE_FRUTIFICAR).toBeLessThan(CHANCE_DE_AVANCAR)
  })
})

// ── A CANA ──────────────────────────────────────────────────────────────────

describe('cana-de-açúcar', () => {
  const sorte = () => 0
  const base = {
    ehTopo: true,
    alturaAtual: 1,
    acimaVazio: true,
    apoiada: true,
    luz: 15,
    rng: sorte,
  }

  it('cresce na margem, com luz e espaço', () => {
    expect(canaVaiCrescer(base)).toBe(true)
  })

  it('para na altura do original', () => {
    expect(canaVaiCrescer({ ...base, alturaAtual: ALTURA_DA_CANA })).toBe(false)
    expect(canaVaiCrescer({ ...base, alturaAtual: ALTURA_DA_CANA - 1 })).toBe(true)
  })

  it('só o topo cresce', () => {
    expect(canaVaiCrescer({ ...base, ehTopo: false })).toBe(false)
  })

  it('com teto em cima, não cresce', () => {
    expect(canaVaiCrescer({ ...base, acimaVazio: false })).toBe(false)
  })

  it('sem apoio de margem, não cresce', () => {
    expect(canaVaiCrescer({ ...base, apoiada: false })).toBe(false)
  })

  it('o chão dela é areia, terra ou grama — e SÓ com água ao lado', () => {
    for (const k of ['sand', 'dirt', 'grassBlock']) {
      expect(chaoDeCana(ID[k], true), k).toBe(true)
      expect(chaoDeCana(ID[k], false), `${k} sem água`).toBe(false)
    }
    for (const k of ['stone', 'gravel', 'farmland']) {
      expect(chaoDeCana(ID[k], true), k).toBe(false)
    }
  })

  it('a cana vira PAPEL, e o papel vira livro e estante', () => {
    const c = { item: 'sugarCane', count: 1 }
    expect(findRecipe([c, c, c, null, null, null, null, null, null], 3, true)).toMatchObject({
      item: 'paper',
      count: 3,
    })
    const p = { item: 'paper', count: 1 }
    const couro = { item: 'leather', count: 1 }
    expect(findRecipe([p, p, null, p, couro, null, null, null, null], 3, true)).toMatchObject({
      item: 'book',
    })
    // ⚠️ A ESTANTE VOLTOU A SER DE LIVRO: era de couro, adaptação de quando
    // papel não existia, e era o que deixava a cana sem uso nenhum.
    const receita = RECIPES.find((r) => r.result === 'bookshelf')
    expect(Object.values(receita.keyMap)).toContain('book')
    expect(Object.values(receita.keyMap)).not.toContain('leather')
  })
})
