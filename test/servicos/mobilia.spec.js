import { describe, it, expect } from 'vitest'
import {
  criarMobilia,
  abrirMobilia,
  mobiliaEm,
  esvaziarMobilia,
  avancarFornalha,
  avancarMobilia,
  poderDeQueima,
  fracaoDeFundicao,
  fracaoDeFogo,
  tempoDaReceita,
  SEGUNDOS_POR_FUNDIDA,
  serializarMobilia,
  desserializarMobilia,
  serializarEntrada,
  desserializarEntrada,
  SLOTS_BAU,
  SEGUNDOS_POR_COMBUSTIVEL,
  cliqueNaMobilia,
} from '../../src/servicos/mobilia.js'
import { SMELTING } from '../../src/servicos/recipes.js'
import { itemDef, maxStack } from '../../src/servicos/items.js'

// FORNALHA E BAÚ ERAM BLOCOS INERTES.
//
// `SMELTING` está escrito e completo em `recipes.js` desde sempre, e
// `interact: 'chest'` está declarado em `blocks.js` — e nada no jogo lia
// nenhum dos dois. Sem fornalha não há barra de ferro; sem ferro não há
// tesoura, ferramenta de ferro, vidro nem comida cozida. Metade da árvore de
// progressão estava desligada por falta de uma tela.
//
// O que faltava de estrutura: o mundo é `Uint8Array` de id puro, e um baú tem
// 27 slots dentro. `mobilia.js` é o registro paralelo posição → estado.

const fornalha = (m) => abrirMobilia(m, 0, 64, 0, 'fornalha')
const bau = (m) => abrirMobilia(m, 1, 64, 0, 'bau')

describe('registro de mobília', () => {
  it('cria na primeira abertura e devolve a MESMA na segunda', () => {
    const m = criarMobilia()
    const a = fornalha(m)
    a.entrada = { item: 'raw_iron', count: 3 }
    expect(fornalha(m).entrada.count, 'reabrir não pode zerar o conteúdo').toBe(3)
  })

  it('baú nasce com 27 slots vazios', () => {
    const b = bau(criarMobilia())
    expect(b.slots.length).toBe(SLOTS_BAU)
    expect(b.slots.every((s) => s === null)).toBe(true)
  })

  it('tipo desconhecido não cria nada', () => {
    const m = criarMobilia()
    expect(abrirMobilia(m, 0, 0, 0, 'foguete')).toBeNull()
    expect(m.size).toBe(0)
  })

  it('posições diferentes são baús diferentes', () => {
    const m = criarMobilia()
    abrirMobilia(m, 0, 64, 0, 'bau').slots[0] = { item: 'dirt', count: 5 }
    expect(abrirMobilia(m, 0, 64, 1, 'bau').slots[0]).toBeNull()
  })

  it('quebrar devolve TUDO que estava dentro', () => {
    // Conteúdo evaporando em silêncio é a pior coisa que um jogo de construção
    // pode fazer com o tempo de alguém.
    const m = criarMobilia()
    const b = bau(m)
    b.slots[0] = { item: 'diamond', count: 9 }
    b.slots[17] = { item: 'iron_ingot', count: 4 }
    const fora = esvaziarMobilia(m, 1, 64, 0)
    expect(fora).toHaveLength(2)
    expect(fora.reduce((s, x) => s + x.count, 0)).toBe(13)
    expect(mobiliaEm(m, 1, 64, 0), 'o registro tem que sumir junto').toBeNull()
  })

  it('quebrar fornalha devolve entrada, combustível e saída', () => {
    const m = criarMobilia()
    const f = fornalha(m)
    f.entrada = { item: 'raw_iron', count: 2 }
    f.combustivel = { item: 'coal', count: 1 }
    f.saida = { item: 'iron_ingot', count: 3 }
    expect(esvaziarMobilia(m, 0, 64, 0)).toHaveLength(3)
  })

  it('quebrar o que não existe devolve lista vazia, sem explodir', () => {
    expect(esvaziarMobilia(criarMobilia(), 9, 9, 9)).toEqual([])
  })
})

describe('combustível', () => {
  it('carvão rende 8 fundidas', () => {
    expect(poderDeQueima('coal')).toBe(8 * SEGUNDOS_POR_COMBUSTIVEL)
  })

  it('MADEIRA QUEIMA — sem isso a partida nova trava', () => {
    // Só carvão e carvão vegetal tinham `fuel`, e os dois saem DA fornalha ou
    // de minerar carvão com picareta. Sem madeira queimando, a fornalha nunca
    // acende na primeira hora de jogo, e é justamente ela que destrava o ferro.
    expect(poderDeQueima('oakPlanks')).toBeGreaterThan(0)
    expect(poderDeQueima('oakLog')).toBeGreaterThan(0)
  })

  it('pedra não queima', () => {
    expect(poderDeQueima('stone')).toBe(0)
    expect(poderDeQueima('diamond')).toBe(0)
    expect(poderDeQueima(null)).toBe(0)
  })

  it('toda receita de fundição tem um resultado que existe como item', () => {
    for (const [entrada, r] of Object.entries(SMELTING)) {
      expect(itemDef(entrada), `entrada ${entrada}`).toBeTruthy()
      expect(itemDef(r.result), `resultado ${r.result}`).toBeTruthy()
    }
  })
})

describe('a fornalha funde', () => {
  const passar = (f, segundos, passo = 0.1) => {
    for (let t = 0; t < segundos; t += passo) avancarFornalha(f, passo)
  }

  it('sem combustível não acende', () => {
    const f = fornalha(criarMobilia())
    f.entrada = { item: 'raw_iron', count: 1 }
    passar(f, 20)
    expect(f.saida).toBeNull()
    expect(f.fogo).toBe(0)
  })

  it('com carvão e minério, sai barra de ferro', () => {
    const f = fornalha(criarMobilia())
    f.entrada = { item: 'raw_iron', count: 1 }
    f.combustivel = { item: 'coal', count: 1 }
    passar(f, 12)
    expect(f.saida, 'não fundiu nada').toEqual({ item: 'iron_ingot', count: 1 })
    expect(f.entrada, 'a entrada tem que ser consumida').toBeNull()
  })

  it('NÃO gasta combustível quando não há o que fundir', () => {
    // Senão o carvão some sozinho numa fornalha parada, e o jogador nunca
    // entende pra onde foi.
    const f = fornalha(criarMobilia())
    f.combustivel = { item: 'coal', count: 3 }
    passar(f, 30)
    expect(f.combustivel.count).toBe(3)
    expect(f.fogo).toBe(0)
  })

  it('NÃO gasta combustível quando a saída está cheia', () => {
    const f = fornalha(criarMobilia())
    f.entrada = { item: 'raw_iron', count: 5 }
    f.combustivel = { item: 'coal', count: 1 }
    f.saida = { item: 'iron_ingot', count: maxStack('iron_ingot') }
    passar(f, 20)
    expect(f.combustivel.count).toBe(1)
  })

  it('uma unidade de carvão funde 8 e acaba', () => {
    const f = fornalha(criarMobilia())
    f.entrada = { item: 'raw_iron', count: 20 }
    f.combustivel = { item: 'coal', count: 1 }
    passar(f, 8 * SEGUNDOS_POR_COMBUSTIVEL + 5)
    expect(f.saida.count, 'carvão tem que render exatamente 8').toBe(8)
    expect(f.combustivel, 'e a unidade tem que ter sido gasta').toBeNull()
  })

  it('o fogo aceso continua queimando mesmo sem o que fundir', () => {
    // É o contrato do original: desperdiçar carvão é decisão do jogador, não
    // acidente da simulação.
    const f = fornalha(criarMobilia())
    f.entrada = { item: 'raw_iron', count: 1 }
    f.combustivel = { item: 'coal', count: 1 }
    passar(f, 12) // funde o único item e sobra fogo
    const fogoRestante = f.fogo
    expect(fogoRestante).toBeGreaterThan(0)
    passar(f, 5)
    expect(f.fogo).toBeLessThan(fogoRestante)
  })

  it('trocar a entrada no meio zera o progresso', () => {
    const f = fornalha(criarMobilia())
    f.entrada = { item: 'raw_iron', count: 1 }
    f.combustivel = { item: 'coal', count: 1 }
    passar(f, 5)
    expect(f.progresso).toBeGreaterThan(0)
    f.entrada = { item: 'stone', count: 1 } // pedra não funde
    avancarFornalha(f, 0.1)
    expect(f.progresso).toBe(0)
  })

  it('madeira funde carvão vegetal, que é o caminho de saída do círculo', () => {
    const f = fornalha(criarMobilia())
    f.entrada = { item: 'oakLog', count: 1 }
    f.combustivel = { item: 'oakPlanks', count: 1 }
    passar(f, 12)
    expect(f.saida).toEqual({ item: 'charcoal', count: 1 })
  })

  it('as frações de interface ficam entre 0 e 1', () => {
    const f = fornalha(criarMobilia())
    f.entrada = { item: 'raw_iron', count: 1 }
    f.combustivel = { item: 'coal', count: 1 }
    passar(f, 4)
    for (const v of [fracaoDeFundicao(f), fracaoDeFogo(f)]) {
      expect(v).toBeGreaterThan(0)
      expect(v).toBeLessThanOrEqual(1)
    }
    expect(fracaoDeFundicao(fornalha(criarMobilia()))).toBe(0)
  })

  it('avancarMobilia mexe nas fornalhas e ignora os baús', () => {
    const m = criarMobilia()
    const f = fornalha(m)
    f.entrada = { item: 'raw_iron', count: 1 }
    f.combustivel = { item: 'coal', count: 1 }
    bau(m).slots[0] = { item: 'dirt', count: 1 }
    expect(avancarMobilia(m, 0.1)).toBe(1)
  })

  it('avancarMobilia avisa a CHAVE de cada uma que mudou (a sala publica por aí)', () => {
    const m = criarMobilia()
    const f = fornalha(m)
    f.entrada = { item: 'raw_iron', count: 1 }
    f.combustivel = { item: 'coal', count: 1 }
    bau(m).slots[0] = { item: 'dirt', count: 1 }
    abrirMobilia(m, 9, 9, 9, 'fornalha') // fria: não muda, não avisa
    const mudaram = []
    expect(avancarMobilia(m, 0.1, (k, e) => mudaram.push([k, e.tipo]))).toBe(1)
    expect(mudaram).toEqual([['0,64,0', 'fornalha']])
  })
})

describe('uma entrada de cada vez (a sala, Onda 6.3)', () => {
  it('serializarEntrada é null para vazio e para o que não existe', () => {
    expect(serializarEntrada(null)).toBe(null)
    expect(serializarEntrada(abrirMobilia(criarMobilia(), 0, 0, 0, 'bau'))).toBe(null)
    expect(serializarEntrada(abrirMobilia(criarMobilia(), 0, 0, 0, 'fornalha'))).toBe(null)
    expect(serializarEntrada(abrirMobilia(criarMobilia(), 0, 0, 0, 'suporte'))).toBe(null)
    expect(serializarEntrada({ tipo: 'lixo' })).toBe(null)
  })

  it('o que chega de fora tem forma fechada: item inexistente não entra, pilha corta no teto', () => {
    const b = desserializarEntrada({
      t: 'b',
      s: [
        ['nao_existe', 5],
        ['stone', 999],
        ['diamond', 3],
      ],
    })
    expect(b.slots[0], 'item que não existe entrou no baú').toBe(null)
    expect(b.slots[1]).toEqual({ item: 'stone', count: maxStack('stone') })
    expect(b.slots[2]).toEqual({ item: 'diamond', count: 3 })
    const f = desserializarEntrada({ t: 'f', e: ['raw_iron', 200], c: ['coal', 1] })
    expect(f.entrada.count).toBe(maxStack('raw_iron'))
  })

  it('ida e volta de uma entrada preserva o conteúdo, e a lista usa a mesma forma', () => {
    const m = criarMobilia()
    const b = abrirMobilia(m, 1, 2, 3, 'bau')
    b.slots[5] = { item: 'diamond', count: 3 }
    const d = serializarEntrada(b)
    expect(d.t).toBe('b')
    expect(desserializarEntrada(d).slots[5]).toEqual({ item: 'diamond', count: 3 })
    expect(serializarMobilia(m)).toEqual([{ k: '1,2,3', ...d }])
    expect(desserializarEntrada(null)).toBe(null)
    expect(desserializarEntrada({ t: 'x' })).toBe(null)
    expect(desserializarEntrada('b')).toBe(null)
  })
})

describe('serialização', () => {
  it('ida e volta preserva baú e fornalha', () => {
    const m = criarMobilia()
    const b = bau(m)
    b.slots[3] = { item: 'diamond', count: 7 }
    b.slots[26] = { item: 'iron_pickaxe', count: 1, dur: 199 }
    const f = fornalha(m)
    f.entrada = { item: 'raw_iron', count: 2 }
    f.combustivel = { item: 'coal', count: 1 }
    f.saida = { item: 'iron_ingot', count: 5 }
    f.fogo = 33.3
    f.fogoTotal = 80
    f.progresso = 4.5

    const volta = desserializarMobilia(JSON.parse(JSON.stringify(serializarMobilia(m))))
    const b2 = mobiliaEm(volta, 1, 64, 0)
    const f2 = mobiliaEm(volta, 0, 64, 0)
    expect(b2.slots[3]).toEqual({ item: 'diamond', count: 7 })
    expect(b2.slots[26]).toEqual({ item: 'iron_pickaxe', count: 1, dur: 199 })
    expect(f2.entrada).toEqual({ item: 'raw_iron', count: 2 })
    expect(f2.saida).toEqual({ item: 'iron_ingot', count: 5 })
    expect(f2.fogo).toBeCloseTo(33.3, 1)
    expect(f2.progresso).toBeCloseTo(4.5, 1)
  })

  it('mobília VAZIA não ocupa espaço no save', () => {
    // Um mundo com mil baús vazios não pode inflar o documento.
    const m = criarMobilia()
    for (let i = 0; i < 1000; i++) abrirMobilia(m, i, 64, 0, 'bau')
    expect(serializarMobilia(m)).toHaveLength(0)
  })

  it('aguenta lixo sem explodir', () => {
    expect(desserializarMobilia(null).size).toBe(0)
    expect(desserializarMobilia('nada').size).toBe(0)
    const m = desserializarMobilia([
      null,
      { k: 1 },
      { k: 'a', t: 'z' },
      { k: '0,0,0', t: 'b', s: [['dirt', 0, 0], 'lixo', ['stone', 3, 0]] },
    ])
    const b = mobiliaEm(m, 0, 0, 0)
    expect(b.slots[0], 'count 0 não pode virar item').toBeNull()
    expect(b.slots[1]).toBeNull()
    expect(b.slots[2]).toEqual({ item: 'stone', count: 3 })
  })
})

describe('mobilia — o tempo que a receita pede', () => {
  it('receita SEM tempo declarado cai no padrão de 10 segundos', () => {
    // O VALOR, não a constante: comparar com `SEGUNDOS_POR_FUNDIDA` seria
    // comparar o código com ele mesmo.
    expect(SEGUNDOS_POR_FUNDIDA).toBe(10)
    expect(tempoDaReceita({ result: 'iron', count: 1 })).toBe(10)
    expect(tempoDaReceita(null)).toBe(10)
    expect(tempoDaReceita(undefined)).toBe(10)
  })

  it('receita com tempo ZERO é instantânea, não "sem tempo"', () => {
    // ⚠️ `receita?.time ?? SEGUNDOS_POR_FUNDIDA`. Com `||`, uma receita
    // declarada como instantânea (`time: 0`) herda os 10 segundos padrão — o
    // oposto exato do que ela pede.
    expect(tempoDaReceita({ time: 0 })).toBe(0)
  })

  it('receita com tempo próprio manda', () => {
    expect(tempoDaReceita({ time: 3.5 })).toBe(3.5)
  })
})

describe('a fornalha e o centésimo que falta', () => {
  it('progresso um bilionésimo abaixo do tempo JÁ conta como fundida', () => {
    // ⚠️ A TOLERÂNCIA. Somar 0,1 cem vezes dá 9,99999999999998, não 10, e sem a
    // margem cada fundida custava 101 passos em vez de 100 — um erro
    // SISTEMÁTICO. Ao longo de uma carga de carvão isso acumulava 0,8 s e a
    // oitava fundida não cabia: uma unidade de carvão rendia 7 em vez de 8.
    //
    // `progresso >= tempo - 1e-9` apertado para `>` desliga a margem no valor
    // exato dela, que é justamente onde a soma repetida pousa.
    const f = fornalha(criarMobilia())
    f.entrada = { item: 'raw_iron', count: 1 }
    f.combustivel = { item: 'coal', count: 1 }
    f.fogo = 50
    f.fogoTotal = 50
    // Um passo de duração ZERO: o progresso fica exatamente no limiar.
    f.progresso = tempoDaReceita(SMELTING.raw_iron) - 1e-9
    avancarFornalha(f, 0)
    expect(f.saida).toEqual({ item: 'iron_ingot', count: 1 })
    expect(f.entrada).toBeNull()
  })

  it('um pouco antes da margem ainda não funde', () => {
    const f = fornalha(criarMobilia())
    f.entrada = { item: 'raw_iron', count: 1 }
    f.combustivel = { item: 'coal', count: 1 }
    f.fogo = 50
    f.fogoTotal = 50
    f.progresso = tempoDaReceita(SMELTING.raw_iron) - 1e-6
    avancarFornalha(f, 0)
    expect(f.saida).toBeNull()
    expect(f.entrada.count).toBe(1)
  })
})

// ── O clique dentro da mobília ─────────────────────────────────────────────
//
// Esta lógica viveu 100% dentro do componente até hoje: o único jeito de
// exercitá-la era abrir o jogo e clicar. Os casos abaixo são exatamente os que
// ninguém conseguia testar de lá — shift com o cursor cheio, a saída da
// fornalha recusando item diferente, e o clique que NÃO muda nada.
describe('cliqueNaMobilia', () => {
  const bau = () => ({ tipo: 'bau', slots: new Array(SLOTS_BAU).fill(null) })
  const forno = () => ({
    tipo: 'fornalha',
    entrada: null,
    combustivel: null,
    saida: null,
    fogo: 0,
    fogoTotal: 0,
    progresso: 0,
  })
  const vazio = () => new Array(9).fill(null)

  it('shift no baú manda o slot pro inventário e diz que mexeu nele', () => {
    const e = bau()
    e.slots[3] = { item: 'stone', count: 5 }
    const inv = vazio()
    const r = cliqueNaMobilia(e, { index: 3, button: 'shift', cursor: null, inventario: inv })
    expect(r.mexeuNoInventario).toBe(true)
    expect(e.slots[3]).toBe(null)
    expect(inv.find((s) => s?.item === 'stone').count).toBe(5)
  })

  it('shift devolve a sobra pro baú quando o inventário lota', () => {
    const e = bau()
    const cap = maxStack('stone')
    e.slots[0] = { item: 'stone', count: cap }
    // um único slot livre, já com uma pilha cheia dentro dos outros
    const inv = new Array(2).fill(null)
    inv[0] = { item: 'stone', count: cap - 2 }
    inv[1] = { item: 'dirt', count: 1 }
    const r = cliqueNaMobilia(e, { index: 0, button: 'shift', cursor: null, inventario: inv })
    expect(r.mexeuNoInventario).toBe(true)
    expect(inv[0].count).toBe(cap)
    expect(e.slots[0].count).toBe(cap - 2)
  })

  it('shift com o cursor cheio não faz nada', () => {
    const e = bau()
    e.slots[1] = { item: 'stone', count: 2 }
    const inv = vazio()
    const r = cliqueNaMobilia(e, {
      index: 1,
      button: 'shift',
      cursor: { item: 'dirt', count: 1 },
      inventario: inv,
    })
    expect(r).toBe(null)
    expect(e.slots[1].count).toBe(2)
    expect(inv.every((s) => s === null)).toBe(true)
  })

  it('shift em slot vazio não faz nada', () => {
    const e = bau()
    expect(
      cliqueNaMobilia(e, { index: 0, button: 'shift', cursor: null, inventario: vazio() }),
    ).toBe(null)
  })

  it('clique normal no baú troca com o cursor sem tocar no inventário', () => {
    const e = bau()
    e.slots[2] = { item: 'stone', count: 4 }
    const inv = vazio()
    const r = cliqueNaMobilia(e, {
      index: 2,
      button: 'left',
      cursor: null,
      inventario: inv,
    })
    expect(r.mexeuNoInventario).toBe(false)
    expect(r.cursor).toEqual({ item: 'stone', count: 4 })
    expect(e.slots[2]).toBe(null)
    expect(inv.every((s) => s === null)).toBe(true)
  })

  it('índice 0 e 1 da fornalha são entrada e combustível', () => {
    const e = forno()
    const a = cliqueNaMobilia(e, {
      index: 0,
      button: 'left',
      cursor: { item: 'stone', count: 1 },
      inventario: vazio(),
    })
    expect(e.entrada).toEqual({ item: 'stone', count: 1 })
    expect(a.cursor).toBe(null)
    cliqueNaMobilia(e, {
      index: 1,
      button: 'left',
      cursor: { item: 'coal', count: 3 },
      inventario: vazio(),
    })
    expect(e.combustivel).toEqual({ item: 'coal', count: 3 })
  })

  it('a saída da fornalha entrega e não aceita nada de volta', () => {
    const e = forno()
    e.saida = { item: 'iron_ingot', count: 2 }
    const r = cliqueNaMobilia(e, {
      index: 2,
      button: 'left',
      cursor: null,
      inventario: vazio(),
    })
    expect(r.cursor).toEqual({ item: 'iron_ingot', count: 2 })
    expect(e.saida).toBe(null)
    // com a saída vazia, largar item ali é recusado
    e.saida = null
    expect(
      cliqueNaMobilia(e, {
        index: 2,
        button: 'left',
        cursor: { item: 'stone', count: 1 },
        inventario: vazio(),
      }),
    ).toBe(null)
  })

  it('a saída recusa cursor de item diferente e aceita o mesmo, somando', () => {
    const e = forno()
    e.saida = { item: 'iron_ingot', count: 2 }
    expect(
      cliqueNaMobilia(e, {
        index: 2,
        button: 'left',
        cursor: { item: 'stone', count: 1 },
        inventario: vazio(),
      }),
    ).toBe(null)
    expect(e.saida).toEqual({ item: 'iron_ingot', count: 2 })
    const r = cliqueNaMobilia(e, {
      index: 2,
      button: 'left',
      cursor: { item: 'iron_ingot', count: 1 },
      inventario: vazio(),
    })
    expect(r.cursor).toEqual({ item: 'iron_ingot', count: 3 })
    expect(e.saida).toBe(null)
  })

  it('mobília ausente não explode', () => {
    expect(cliqueNaMobilia(null, { index: 0, button: 'left', cursor: null, inventario: [] })).toBe(
      null,
    )
  })
})
