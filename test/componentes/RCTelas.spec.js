import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref, computed } from 'vue'
import RCTelas from '../../src/componentes/RCTelas.vue'

//
// AS TELAS SOBREPOSTAS — este arquivo é FIAÇÃO, e fiação quebra em silêncio.
//
// ⚠️ ELE NASCEU DE UMA EXTRAÇÃO, que é o momento mais perigoso para uma prop.
// Comércio, mobília e inventário funcionavam dentro do `ROSRoqueCraft.vue` e
// foram movidos para cá inteiros. Um `:slots` que vira `:slot` no caminho não
// quebra o build, não acende o lint e não estoura em runtime: a tela só abre
// vazia, e alguém descobre jogando. O que se trava aqui é que cada tela recebe
// o que precisa e que cada evento volta para quem sabe agir.
//

// Sem o jogo em volta, `useTextos()` devolve a chave como veio: é o que o dublê
// do vue-i18n fazia aqui antes da extração (o jogo não usa mais vue-i18n).

const espiao = (nome, props, emits = []) => ({
  name: nome,
  props,
  emits,
  template: `<div class="${nome}" />`,
})

const comercio = espiao('RCComercio', ['conversa', 'ofertas', 'icons'], ['close', 'acao'])
const container = espiao(
  'RCContainer',
  ['tipo', 'conteudo', 'slots', 'fogo', 'progresso', 'cursor', 'mouse', 'icons'],
  ['close', 'container-click', 'slot-click'],
)
const inventario = espiao(
  'RCInventory',
  [
    'slots',
    'craft',
    'gridSize',
    'hasTable',
    'result',
    'cursor',
    'mouse',
    'icons',
    'craftable',
    'creative',
    'allBlocks',
    'armadura',
  ],
  ['close', 'slot-click', 'craft-click', 'take-result', 'auto-craft', 'give'],
)
const criativoStub = espiao('RCCriativo', ['ticks', 'travado', 'chuva', 'bioma', 'neva'], ['close'])

const criativoFalso = {
  aberto: ref(true),
  vista: computed(() => ({ ticks: 6000, travado: false, chuva: null, bioma: 'X', neva: false })),
  acoes: { close: () => {} },
}

const montar = (props = {}) =>
  mount(RCTelas, {
    props: {
      icons: { a: 1 },
      criativo: criativoFalso,
      ponteiro: { cursor: { item: 'x' }, mouse: { x: 1, y: 2 } },
      ...props,
    },
    global: {
      stubs: {
        RCComercio: comercio,
        RCContainer: container,
        RCInventory: inventario,
        RCCriativo: criativoStub,
      },
    },
  })

describe('RCTelas', () => {
  it('cada tela só aparece quando a sua condição é verdadeira', () => {
    const vazio = montar({ criativo: { ...criativoFalso, aberto: ref(false) } })
    expect(vazio.findComponent(comercio).exists()).toBe(false)
    expect(vazio.findComponent(container).exists()).toBe(false)
    expect(vazio.findComponent(inventario).exists()).toBe(false)
    expect(vazio.findComponent(criativoStub).exists()).toBe(false)
  })

  it('⚠️ o comércio recebe conversa E ofertas', () => {
    // As duas: a conversa é a pessoa e as ofertas são o balcão. Perder uma
    // devolve o aldeão à condição de máquina de venda com pernas.
    const w = montar({
      aldeaoAberto: { id: 7 },
      conversa: { nome: 'Alda' },
      ofertas: [{ da: 'trigo' }],
    })
    const c = w.findComponent(comercio)
    expect(c.props('conversa')).toEqual({ nome: 'Alda' })
    expect(c.props('ofertas')).toEqual([{ da: 'trigo' }])
    expect(c.props('icons')).toEqual({ a: 1 })
  })

  it('⚠️ a mobília recebe o TIPO de dentro do objeto aberto', () => {
    // No pai isto era `:tipo="aberto.tipo"`. Repassar o objeto inteiro como
    // `tipo` abriria sempre a tela errada.
    const w = montar({ mobilia: { tipo: 'forno' }, conteudo: [], fogo: { ate: 3 }, progresso: 0.5 })
    expect(w.findComponent(container).props('tipo')).toBe('forno')
    expect(w.findComponent(container).props('progresso')).toBe(0.5)
  })

  it('⚠️ o inventário deriva hasTable de gridSize, como o pai fazia', () => {
    expect(
      montar({ inventarioAberto: true, gridSize: 3 }).findComponent(inventario).props('hasTable'),
    ).toBe(true)
    expect(
      montar({ inventarioAberto: true, gridSize: 2 }).findComponent(inventario).props('hasTable'),
    ).toBe(false)
  })

  it('a armadura vestida chega no inventário', () => {
    const armadura = { helmet: { item: 'iron_helmet', dur: 1 } }
    const w = montar({ inventarioAberto: true, armadura })
    expect(w.findComponent(inventario).props('armadura')).toEqual(armadura)
  })

  it('o ponteiro chega nas duas telas que o usam', () => {
    const w = montar({ mobilia: { tipo: 'bau' }, inventarioAberto: true })
    expect(w.findComponent(container).props('cursor')).toEqual({ item: 'x' })
    expect(w.findComponent(inventario).props('mouse')).toEqual({ x: 1, y: 2 })
  })

  it('⚠️ todo evento das telas volta para cima', async () => {
    // A lista é o contrato com o `ROSRoqueCraft`: um evento que morre aqui é um
    // clique que não acontece, sem erro nenhum no console.
    const w = montar({ aldeaoAberto: { id: 1 }, mobilia: { tipo: 'bau' }, inventarioAberto: true })
    w.findComponent(comercio).vm.$emit('close')
    w.findComponent(comercio).vm.$emit('acao', 'trocar', 2)
    w.findComponent(container).vm.$emit('close')
    w.findComponent(container).vm.$emit('container-click', 3)
    w.findComponent(inventario).vm.$emit('close')
    w.findComponent(inventario).vm.$emit('slot-click', 4)
    w.findComponent(inventario).vm.$emit('take-result')
    w.findComponent(inventario).vm.$emit('give', 'stone')
    await w.vm.$nextTick()
    expect(w.emitted('fechar-comercio')).toHaveLength(1)
    expect(w.emitted('acao-aldeao')[0]).toEqual(['trocar', 2])
    expect(w.emitted('fechar-mobilia')).toHaveLength(1)
    expect(w.emitted('container-click')[0]).toEqual([3])
    expect(w.emitted('fechar-inventario')).toHaveLength(1)
    expect(w.emitted('slot-click')[0]).toEqual([4])
    expect(w.emitted('pegar-resultado')).toHaveLength(1)
    expect(w.emitted('dar')[0]).toEqual(['stone'])
  })

  it('o criativo entra pelo composable, sem fiação própria', () => {
    const w = montar()
    expect(w.findComponent(criativoStub).props('ticks')).toBe(6000)
  })
})
