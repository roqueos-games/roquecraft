import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { criarQaDeInventario } from '../../src/servicos/qaDeInventario.js'
import { criarMobilia, abrirMobilia } from '../../src/servicos/mobilia.js'

// ⚠️ ESTE TESTE EXISTE POR CAUSA DOS DOIS RISCOS QUE A EXTRAÇÃO CRIOU.
//
// 1. `mobilia` é `let` no componente: mundo novo faz `mobilia = criarMobilia()`.
//    Receber o VALOR compilaria, passaria no lint, e a superfície de QA
//    continuaria lendo o baú do mundo ANTERIOR — em silêncio. Por isso entra
//    como getter, e o primeiro teste prova que o getter é seguido.
//
// 2. `inventory.value = inventory.value.slice()` é o que faz a hotbar
//    redesenhar. Um refactor que mexesse no array no lugar (`inventory.value[i] = x`)
//    passaria em qualquer teste que só lesse o array de volta, e a tela ficaria
//    congelada no jogo. O segundo teste vigia a IDENTIDADE do array.

/** `mobilia` é um Map de verdade no jogo — `mobiliaEm` chama `.get` nele. */
const mobiliaFalsa = () => criarMobilia()

function ctxBase(over = {}) {
  const inventory = ref([null, null, null, null, null, null, null, null, null])
  const selectedSlot = ref(0)
  const aberto = ref(null)
  let lista = []
  const trocarLista = () => {
    lista = []
  }
  const ctx = {
    inventory,
    selectedSlot,
    aberto,
    mobilia: () => mobiliaFalsa(),
    heldItem: () => inventory.value[selectedSlot.value] || null,
    avisarMobilia: () => {},
    toggleInventory: () => 'abriu',
    pickBlock: () => 'pegou',
    soltarItem: (item, count, x, y, z) => lista.push({ item, count, x, y, z }),
    drops: () => lista,
    ...over,
  }
  return {
    ctx,
    qa: criarQaDeInventario(ctx),
    inventory,
    selectedSlot,
    aberto,
    drops: () => lista,
    trocarLista,
  }
}

describe('qaDeInventario', () => {
  it('lê a mobília VIVA a cada consulta, não uma capturada na criação', () => {
    // Mundo novo faz `mobilia = criarMobilia()`. Se o serviço tivesse guardado
    // o VALOR, o QA passaria o resto da sessão lendo o mapa do mundo morto.
    let mapa = mobiliaFalsa()
    abrirMobilia(mapa, 5, 6, 7, 'bau')
    const { qa } = ctxBase({ mobilia: () => mapa })
    expect(qa.mobiliaEm(5, 6, 7).tipo).toBe('bau')

    // CONTROLE: o baú existe SÓ no primeiro mapa. Um serviço que tivesse
    // capturado `mapa` na criação continuaria achando o baú aqui; com o getter
    // ele lê o mapa novo, que está vazio.
    mapa = mobiliaFalsa()
    expect(qa.mobiliaEm(5, 6, 7), 'a mobília do mundo morto sobreviveu').toBe(null)

    // E o mapa novo é o que passa a valer pras escritas também.
    abrirMobilia(mapa, 1, 2, 3, 'fornalha')
    expect(qa.porNaMobilia(1, 2, 3, 'combustivel', 'coal', 4)).toBe(true)
    expect(qa.mobiliaEm(1, 2, 3)).toMatchObject({
      tipo: 'fornalha',
      combustivel: { item: 'coal', count: 4 },
    })
  })

  it('avisa a tela quando escreve num slot de mobília', () => {
    // Sem o aviso, o `computed` da tela de baú não recomputa e o jogador vê o
    // slot vazio depois de a sonda ter posto o item lá.
    let avisos = 0
    const mapa = mobiliaFalsa()
    abrirMobilia(mapa, 0, 0, 0, 'bau')
    const { qa } = ctxBase({ mobilia: () => mapa, avisarMobilia: () => avisos++ })
    expect(qa.porNaMobilia(0, 0, 0, 2, 'dirt', 9)).toBe(true)
    expect(avisos, 'escreveu no baú sem avisar a tela').toBe(1)
    // CONTROLE: numa célula sem mobília não há o que avisar.
    expect(qa.porNaMobilia(9, 9, 9, 0, 'dirt')).toBe(false)
    expect(avisos).toBe(1)
  })

  it('troca a IDENTIDADE do array a cada escrita (é o que redesenha a hotbar)', () => {
    const { qa, inventory } = ctxBase()
    const antes = inventory.value
    qa.setSlot(3, 'torch', 5)
    expect(inventory.value, 'mexeu no array no lugar; a tela não redesenharia').not.toBe(antes)
    expect(inventory.value[3]).toEqual({ item: 'torch', count: 5 })
    expect(qa.slotOf('torch')).toBe(3)

    const antesDoEquipar = inventory.value
    qa.equipar('sword', 1)
    expect(inventory.value).not.toBe(antesDoEquipar)
  })

  it('setSlot prende o índice em 0..8 e move a seleção junto', () => {
    const { qa, selectedSlot } = ctxBase()
    expect(qa.setSlot(99, 'pick')).toBe('pick')
    expect(selectedSlot.value).toBe(8)
    expect(qa.setSlot(-7, 'axe')).toBe('axe')
    expect(selectedSlot.value).toBe(0)
    // CONTROLE: sem o prende, `inv[99]` cria buraco e `naMao` devolve null.
    expect(qa.naMao()).toBe('axe')
  })

  it('equipar escreve no slot SELECIONADO, não no primeiro livre', () => {
    const { qa, selectedSlot, inventory } = ctxBase()
    qa.selectSlot(4)
    qa.equipar('iron_sword')
    expect(selectedSlot.value).toBe(4)
    expect(inventory.value[4]).toEqual({ item: 'iron_sword', count: 1 })
    // CONTROLE: se tivesse empilhado no primeiro livre (comportamento de
    // `give`), o slot 0 é que teria a espada — e a sonda de combate mediria
    // um golpe de mão vazia achando que era ferro.
    expect(inventory.value[0]).toBe(null)
    expect(qa.naMao()).toBe('iron_sword')
  })

  it('soltarItemQA passa pelo caminho do jogo e devolve o total no chão', () => {
    const { qa, drops } = ctxBase()
    expect(qa.soltarItemQA('dirt', 2, 1, 2, 3)).toBe(1)
    expect(drops()[0]).toEqual({ item: 'dirt', count: 2, x: 1, y: 2, z: 3 })
    expect(qa.soltarItemQA('stone', 1, 0, 0, 0)).toBe(2)
  })

  it('conta os itens da partida VIVA depois que a lista é trocada', () => {
    // `drops` é `let` no componente e é REATRIBUÍDA ao entrar e ao sair do
    // multiplayer e ao desmontar o jogo. Um serviço que capturasse o array
    // continuaria contando os itens da partida morta - e a sonda leria um
    // número que não existe mais na tela.
    const { qa, trocarLista } = ctxBase()
    expect(qa.soltarItemQA('dirt', 1, 0, 0, 0)).toBe(1)
    expect(qa.soltarItemQA('dirt', 1, 0, 0, 0)).toBe(2)
    trocarLista()
    expect(qa.soltarItemQA('stone', 1, 0, 0, 0), 'ficou preso na lista morta').toBe(1)
  })

  it('abertoAgora devolve uma CÓPIA do estado, não a ref viva', () => {
    const { qa, aberto } = ctxBase()
    expect(qa.abertoAgora()).toBe(null)
    aberto.value = { tipo: 'bau', x: 1, y: 2, z: 3 }
    const lido = qa.abertoAgora()
    expect(lido).toEqual({ tipo: 'bau', x: 1, y: 2, z: 3 })
    lido.x = 999
    expect(aberto.value.x, 'a sonda conseguiu escrever no estado do jogo').toBe(1)
  })

  it('delega openInventory e pickBlock ao caminho do jogo', () => {
    let abriu = 0
    let pegou = 0
    const { qa } = ctxBase({
      toggleInventory: () => abriu++,
      pickBlock: () => pegou++,
    })
    qa.openInventory()
    qa.pickBlock()
    expect([abriu, pegou]).toEqual([1, 1])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ UMA SONDA DE QA NÃO PODE LAVAR ESTADO RUIM.
//
// `?? null` só troca AUSÊNCIA (null/undefined) pelo padrão. Com `||`, todo
// valor falsy-porém-PRESENTE — `0`, `''`, `NaN` — vira o padrão, e a sonda
// passa a relatar "não tem nada aqui" onde tem alguma coisa errada. Numa
// superfície cujo único trabalho é dizer a verdade sobre o mundo, isso é o
// defeito mais caro que existe: o harness fica cego exatamente no caso que ele
// existe pra pegar.
// ─────────────────────────────────────────────────────────────────────────────
describe('qaDeInventario — a sonda relata o que está lá, mesmo torto', () => {
  it('slot com item de nome VAZIO é relatado como vazio-string, não como slot livre', () => {
    const { qa, inventory } = ctxBase()
    inventory.value = [{ item: '', count: 1 }, ...inventory.value.slice(1)]
    expect(qa.selectSlot(0)).toBe('')
    expect(qa.naMao()).toBe('')
  })

  it('slot realmente livre é null', () => {
    const { qa } = ctxBase()
    expect(qa.selectSlot(0)).toBeNull()
    expect(qa.naMao()).toBeNull()
  })

  it('setSlot e equipar devolvem o que ficou no slot, incluindo o vazio', () => {
    const { qa } = ctxBase()
    expect(qa.setSlot(2, 'stone', 5)).toBe('stone')
    expect(qa.setSlot(2, null)).toBeNull()
    expect(qa.equipar('torch')).toBe('torch')
    expect(qa.equipar(null)).toBeNull()
  })

  it('idade do item no chão sai como número, e a idade ZERO é uma idade', () => {
    // `d.age || 0` já devolve 0 nos dois casos; o que este teste segura é que a
    // sonda não perde a idade REAL de um item recém-solto.
    const { qa } = ctxBase()
    qa.soltarItemQA('stone', 1, 1, 2, 3)
    expect(qa.dropsInfo()[0]).toMatchObject({ item: 'stone', count: 1, age: 0 })
  })
})
