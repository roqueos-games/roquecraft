import { describe, it, expect } from 'vitest'
import { BLOCKS, ID, blockDrop, dropsWith } from '../../src/servicos/blocks.js'
import { ITEMS } from '../../src/servicos/items.js'
import { RECIPES, SMELTING } from '../../src/servicos/recipes.js'

// BLOCO QUE NINGUÉM CONSEGUE OBTER É BLOCO QUE NÃO EXISTE.
//
// O censo da geração (rodada 16) perguntou "o mundo produz este bloco?". Esta é
// a outra metade da mesma pergunta: **o jogador consegue pôr a mão nele?**
//
// Um bloco pode estar declarado, texturizado, gerado e ainda assim ser
// inalcançável - se quebrá-lo não dropa nada e nenhuma receita o produz, ele é
// cenário, não material. E o inverso: um item que nada dropa e nada fabrica é
// um buraco na cadeia, como a argila era até a rodada 16 (existia bola de
// argila, fornalha e receita de tijolo, e nada no mundo produzia argila).
//
// Estes testes são de ALCANCE, não de valor: não opinam se o número está bom,
// só se o caminho existe.

const todos = Object.values(BLOCKS)
const chaveDeItem = new Set(Object.keys(ITEMS))
const chaveDeBloco = new Set(todos.map((b) => b.key))
const existeComoCoisa = (k) => chaveDeItem.has(k) || chaveDeBloco.has(k)

describe('blocos - o que se pode obter', () => {
  it('a tabela tem blocos dentro (senão o resto não significa nada)', () => {
    // Prova de vida. Todo teste abaixo é da forma "para cada bloco...", e uma
    // lista vazia faz todos passarem sem verificar coisa alguma - foi
    // exatamente assim que o censo da geração quase mentiu na rodada 16.
    expect(todos.length).toBeGreaterThan(50)
    expect(ID.stone).toBeGreaterThan(0)
    // E a tabela de ITENS também: `existeComoCoisa` consulta as duas, e se a
    // de itens viesse vazia o teste de drops órfãos acusaria meio jogo — ou,
    // pior, um fallback silencioso o faria passar sem verificar nada.
    expect(chaveDeItem.size, 'a tabela de itens veio vazia').toBeGreaterThan(20)
    expect(chaveDeItem.has('clay_ball'), 'bola de argila sumiu da tabela').toBe(true)
  })

  it('todo drop declarado aponta pra alguma coisa que existe', () => {
    // Um `drops: 'clay_ball'` com o item inexistente quebra em silêncio: o
    // bloco some e nada cai na mão do jogador.
    const orfaos = todos
      .filter((b) => b.drops && !existeComoCoisa(b.drops))
      .map((b) => `${b.key} → ${b.drops}`)
    expect(orfaos, `drops apontando pro vazio: ${orfaos.join(', ')}`).toEqual([])
  })

  it('todo bloco quebrável dropa alguma coisa, ou declara que não dropa de propósito', () => {
    // `drops: null` é uma decisão (bedrock, folha sem sorte). Ausência de drop
    // sem declaração é esquecimento.
    const mudos = todos
      .filter((b) => !b.unbreakable && b.hardness >= 0)
      .filter((b) => b.drops === undefined)
      .map((b) => b.key)
    expect(mudos, `blocos que somem sem deixar nada: ${mudos.join(', ')}`).toEqual([])
  })

  // ── Folhagem ──────────────────────────────────────────────────────────────
  //
  // O backlog dizia "folha de bétula/pinheiro/selva dropa a própria folha" como
  // se fosse trabalho a fazer. Não é: `drops` já cai no `key` do próprio bloco
  // quando ninguém declara outro. O item estava escrito de memória, e a memória
  // errou - é a terceira vez em um dia que isso acontece. Este teste TRAVA o
  // comportamento em vez de deixá-lo por acidente.
  it('quebrar folha de qualquer espécie dá alguma coisa', () => {
    const semSorte = () => 0 // rng que sempre "acerta" o dropChance
    for (const especie of ['oakLeaves', 'birchLeaves', 'spruceLeaves', 'jungleLeaves']) {
      const id = ID[especie]
      expect(id, `${especie} não existe`).toBeGreaterThan(0)
      const caiu = blockDrop(id, null, semSorte)
      expect(caiu, `${especie} não dropa nada na mão`).toBeTruthy()
      expect(existeComoCoisa(caiu.item), `${especie} dropa ${caiu.item}, que não existe`).toBe(true)
    }
  })

  it('folha dá pra quebrar na mão, sem tesoura (senão a árvore vira parede)', () => {
    for (const especie of ['oakLeaves', 'birchLeaves', 'spruceLeaves', 'jungleLeaves']) {
      expect(dropsWith(ID[especie], null), `${especie} exige ferramenta`).toBe(true)
    }
  })

  it('carvalho é a exceção deliberada: dropa muda, não folha', () => {
    // As outras três dão a própria folha; o carvalho dá `oakSapling` a 6%. A
    // assimetria é intencional (só o carvalho tem muda no jogo) e fica
    // registrada aqui pra não ser "corrigida" por engano depois.
    expect(BLOCKS[ID.oakLeaves].drops).toBe('oakSapling')
    expect(BLOCKS[ID.oakLeaves].dropChance).toBeLessThan(1)
    expect(BLOCKS[ID.birchLeaves].drops).toBe('birchLeaves')
  })
})

describe('blocos - a cadeia da argila, ponta a ponta', () => {
  // A rodada 16 gerou argila. Este teste prova que a cadeia INTEIRA está ligada
  // - era ela que estava morta no primeiro elo: existia bola de argila,
  // fornalha, tijolo e receita do bloco de tijolos, e nada no mundo produzia
  // argila pra começar.
  it('argila dropa bola de argila', () => {
    const caiu = blockDrop(ID.clay, { kind: 'shovel', tier: 1 }, () => 0)
    expect(caiu?.item).toBe('clay_ball')
    expect(caiu.count).toBeGreaterThan(1)
  })

  it('bola de argila vira tijolo na fornalha', () => {
    expect(SMELTING.clay_ball?.result).toBe('brick')
  })

  it('tijolo vira bloco de tijolos na bancada', () => {
    const receita = RECIPES.find((r) => r.result === 'bricks')
    expect(receita, 'não existe receita de bloco de tijolos').toBeTruthy()
  })
})
