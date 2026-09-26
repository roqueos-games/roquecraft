import { describe, it, expect } from 'vitest'
import { BLOCKS, blockDrops } from '../../src/servicos/blocks.js'
import { ITEMS } from '../../src/servicos/items.js'
import { RECIPES, SMELTING } from '../../src/servicos/recipes.js'
import { FERMENTACOES } from '../../src/servicos/fermentacao.js'
import { PROFISSOES } from '../../src/servicos/comercio.js'

// ITEM MORTO — o que existe no catálogo e o jogador nunca alcança.
//
// ⚠️ É O DEFEITO MAIS CARO DESTE JOGO, e já apareceu cinco vezes: a tinta de
// lula (RC-09), a semente de trigo, a fatia de melancia, a cana e a abóbora. Em
// todas, o item tinha chave, ícone, fome, receita — e NADA no mundo o produzia.
// Sistemas escritos e mortos, verdes em todo teste de unidade, porque "a chave
// existe" sempre foi verdade.
//
// A conta é o fecho transitivo: o que o mundo dropa, mais tudo que receita e
// fundição fazem a partir disso, repetido até parar de crescer. O que ficar de
// fora é item que só existe no criativo.
//
// A sonda `qa/qa-roquecraft-itens-mortos.mjs` imprime a mesma conta com
// nome e motivo; este teste é o portão que roda no `yarn verificar` (pre-push e
// CI).
//
// Veio de `tests/unit/architecture/itens-mortos.spec.js` do RoqueOS (7ab22a6f), com os mesmos casos e as mesmas
// asserções; o que mudou foi só o caminho do front para o do repo.

/**
 * ITENS DISPENSADOS, com o motivo escrito.
 *
 * Dispensar é decisão, não esquecimento: o que entra aqui tem que ter uma razão
 * que sobrevive à pergunta "então por que ele existe?". A lista é curta de
 * propósito — quando ela cresce, é sinal de catálogo inchando.
 */
const DISPENSADOS = {
  water_bucket: 'sai de usar o balde na água, não de receita',
  lava_bucket: 'sai de usar o balde na lava, não de receita',
  coalOre: 'sem toque suave: dá carvão',
  ironOre: 'sem toque suave: dá ferro cru',
  copperOre: 'sem toque suave: dá cobre cru',
  goldOre: 'sem toque suave: dá ouro cru',
  diamondOre: 'sem toque suave: dá diamante',
  emeraldOre: 'sem toque suave: dá esmeralda',
  redstoneOre: 'sem toque suave: dá redstone',
  netherQuartzOre: 'sem toque suave: dá quartzo',
  clay: 'sem toque suave: dá bola de argila',
  deepslate: 'sem toque suave: dá pedregulho',
  grassBlock: 'sem toque suave: dá terra, como no original',
  podzol: 'sem toque suave: dá terra',
  snowLayer: 'sem toque suave: dá bola de neve',
  deadBush: 'arbusto seco não dá nada nem com tesoura, como no original',
  bedrock: 'não se pega: é o piso do mundo',
  water: 'líquido: pega-se com balde',
  lava: 'líquido: pega-se com balde',
  endPortalFrame: 'inquebrável: a fortaleza a produz; o item existe só no criativo',
}

const DO_MUNDO_SEM_BLOCO = [
  // A aranha larga o olho, e é ele que destranca veneno, lentidão e dano.
  'spider_eye',
  // ⚠️ A GARRAFA D'ÁGUA ENTRA AQUI E NÃO EM DISPENSADOS, e a diferença importa:
  // o balde d'água é FOLHA (ninguém fabrica nada a partir dele), mas a garrafa
  // é o COMEÇO da cadeia de poções. Dispensá-la tiraria a cadeia inteira da
  // conta, e as oito poções voltariam a parecer mortas.
  'water_bottle',
  'raw_beef',
  'raw_porkchop',
  'raw_chicken',
  'raw_fish',
  'leather',
  'feather',
  'wool',
  'whiteWool',
  'bone',
  'string',
  'gunpowder',
  'ink_sac',
]

const ingredientesDe = (r) =>
  r.type === 'shaped' ? [...new Set(Object.values(r.keyMap))] : [...new Set(r.items)]

function doMundo() {
  const base = new Set()
  for (const b of Object.values(BLOCKS)) {
    // Inquebrável e líquido não dropam nada. Sem esta linha, bedrock e água
    // "caem neles mesmos" (`drops ?? key`) e a conta mente a favor.
    if (b.unbreakable || b.liquid) continue
    if (b.drops !== null) base.add(b.drops ?? b.key)
    // A tesoura é alcançável (dois lingotes), então o que ela derruba conta.
    if (b.comTesoura) base.add(b.comTesoura)
    if (b.dropExtra?.item) base.add(b.dropExtra.item)
  }
  for (const m of DO_MUNDO_SEM_BLOCO) if (ITEMS[m]) base.add(m)
  return base
}

function alcancaveis() {
  const tem = doMundo()
  const fundicao = Object.entries(SMELTING || {})
  let cresceu = true
  while (cresceu) {
    cresceu = false
    for (const r of RECIPES) {
      if (tem.has(r.result)) continue
      if (ingredientesDe(r).every((i) => tem.has(i))) {
        tem.add(r.result)
        cresceu = true
      }
    }
    // ⚠️ A FERMENTAÇÃO É UMA TERCEIRA MÁQUINA, ao lado da bancada e da
    // fornalha, e ela precisava entrar nesta conta. Sem isto as oito poções, a
    // garrafa d'água e a verruga apareciam como itens mortos — o teste estaria
    // certo em acusar, porque de fato nenhuma RECEITA as produz: quem as produz
    // é o suporte. A máquina nova entra aqui, e não em DISPENSADOS, porque
    // dispensar é para item que o jogador de fato não alcança.
    for (const [garrafa, ingrediente, saida] of FERMENTACOES) {
      if (tem.has(saida)) continue
      if (tem.has(garrafa) && tem.has(ingrediente)) {
        tem.add(saida)
        cresceu = true
      }
    }
    // ⚠️ O COMÉRCIO É A QUARTA MÁQUINA: o aldeão vende o que o jogador não
    // fabrica (a pérola do Fim é o caso). Uma oferta conta quando tudo que
    // ela cobra é alcançável — a esmeralda vem do minério.
    for (const prof of Object.values(PROFISSOES)) {
      for (const o of prof.ofertas) {
        if (tem.has(o.recebe.item)) continue
        if (o.paga.every((p) => tem.has(p.item))) {
          tem.add(o.recebe.item)
          cresceu = true
        }
      }
    }
    for (const [entrada, saida] of fundicao) {
      const res = typeof saida === 'string' ? saida : saida?.result || saida?.out
      if (!res || tem.has(res)) continue
      if (tem.has(entrada)) {
        tem.add(res)
        cresceu = true
      }
    }
  }
  return tem
}

describe('nenhum item morto no catálogo', () => {
  const alcance = alcancaveis()

  it('todo item do catálogo é alcançável, ou está dispensado com motivo', () => {
    const mortos = Object.keys(ITEMS)
      .filter((k) => !alcance.has(k) && !DISPENSADOS[k])
      .sort()
    expect(
      mortos,
      `item existe e o jogador nunca alcança:\n${mortos.join('\n')}\n` +
        'Ou o mundo passa a produzi-lo, ou ele entra em DISPENSADOS com o motivo.',
    ).toEqual([])
  })

  it('e nenhum dispensado virou alcançável sem sair da lista', () => {
    const atoa = Object.keys(DISPENSADOS).filter((k) => alcance.has(k))
    expect(atoa, `já são alcançáveis, tire de DISPENSADOS:\n${atoa.join('\n')}`).toEqual([])
  })

  it('a conta é grande o bastante para significar alguma coisa', () => {
    expect(alcance.size).toBeGreaterThan(100)
  })
})

describe('os drops que trouxeram maçã, pederneira e folha de volta', () => {
  const tesoura = { kind: 'shears', tier: 1 }
  const machado = { kind: 'axe', tier: 1 }

  it('folha de carvalho com TESOURA dá folha; na mão dá muda', () => {
    const comTesoura = blockDrops(BLOCKS_BY('oakLeaves'), tesoura, () => 0.5)
    expect(comTesoura.map((d) => d.item)).toContain('oakLeaves')
    const naMao = blockDrops(BLOCKS_BY('oakLeaves'), null, () => 0)
    expect(naMao.map((d) => d.item)).toContain('oakSapling')
  })

  it('a maçã é rara, e sai POR CIMA do drop normal', () => {
    const sortudo = blockDrops(BLOCKS_BY('oakLeaves'), machado, () => 0)
    expect(sortudo.map((d) => d.item)).toContain('apple')
    const azarado = blockDrops(BLOCKS_BY('oakLeaves'), machado, () => 0.99)
    expect(azarado.map((d) => d.item)).not.toContain('apple')
  })

  it('cascalho dá pederneira de vez em quando, e cascalho sempre', () => {
    const sortudo = blockDrops(BLOCKS_BY('gravel'), { kind: 'shovel', tier: 0 }, () => 0)
    expect(sortudo.map((d) => d.item)).toEqual(['gravel', 'flint'])
  })

  it('mato com tesoura dá mato; na mão, semente', () => {
    expect(blockDrops(BLOCKS_BY('tallGrass'), tesoura, () => 0.5).map((d) => d.item)).toEqual([
      'tallGrass',
    ])
    expect(blockDrops(BLOCKS_BY('tallGrass'), null, () => 0).map((d) => d.item)).toEqual([
      'wheat_seeds',
    ])
  })
})

/** id do bloco pela chave — os testes acima leem por nome, não por número. */
function BLOCKS_BY(chave) {
  return Object.values(BLOCKS).find((b) => b.key === chave)?.id
}
