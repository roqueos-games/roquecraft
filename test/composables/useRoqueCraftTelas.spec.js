import { describe, it, expect } from 'vitest'
import { ref, nextTick } from 'vue'
import { useRoqueCraftTelas } from '../../src/composables/useRoqueCraftTelas.js'

//
// A LISTA ÚNICA DE TELAS — a regra que faltava, agora testável sem ler fonte.
//
// ⚠️ ESTE É O TESTE QUE O DEFEITO PEDIA. Havia quatro enumerações de tela no
// componente e três não conheciam o comércio, a mobília nem o painel de
// criativo. Enquanto a regra morava no meio de um arquivo de 2.400 linhas, o
// único jeito de vigiá-la era varrer o texto. Aqui ela é uma função, e uma tela
// esquecida reprova em milissegundos.
//

const montar = (over = {}) => {
  const r = {
    menuOpen: ref(false),
    paused: ref(false),
    inventoryOpen: ref(false),
    lobbyOpen: ref(false),
    aldeao: ref(null),
    mobilia: ref(null),
    criativo: { aberto: ref(false) },
    ...over,
  }
  const soltas = { n: 0 }
  const fechou = []
  // A porta que o componente entrega: fecha a tela dela e anota que foi ela.
  const porta = (chave, nome) => () => {
    r[chave].value = false
    fechou.push(nome)
  }
  const t = useRoqueCraftTelas(
    {
      menuOpen: r.menuOpen,
      paused: r.paused,
      inventoryOpen: r.inventoryOpen,
      lobbyOpen: r.lobbyOpen,
    },
    {
      paineis: { aldeaoAberto: r.aldeao, aberto: r.mobilia },
      criativo: r.criativo,
      soltarPonteiro: () => soltas.n++,
    },
    {
      inventario: porta('inventoryOpen', 'inventario'),
      lobby: porta('lobbyOpen', 'lobby'),
    },
  )
  return { ...t, r, soltas, fechou }
}

describe('useRoqueCraftTelas', () => {
  it('sem tela nenhuma, nada está aberto', () => {
    const { telaAberta, paramOMundo } = montar()
    expect(telaAberta.value).toBe(false)
    expect(paramOMundo.value).toBe(false)
  })

  it('⚠️ TODA tela conta para "está coberto"', () => {
    // A lista inteira, uma por vez. É exatamente a asserção que não existia —
    // e por isso três telas ficaram de fora sem ninguém notar.
    const casos = [
      ['menuOpen', (r) => (r.menuOpen.value = true)],
      ['paused', (r) => (r.paused.value = true)],
      ['inventoryOpen', (r) => (r.inventoryOpen.value = true)],
      ['lobbyOpen', (r) => (r.lobbyOpen.value = true)],
      ['comércio', (r) => (r.aldeao.value = { id: 1 })],
      ['mobília', (r) => (r.mobilia.value = { tipo: 'bau' })],
      ['criativo', (r) => (r.criativo.aberto.value = true)],
    ]
    for (const [nome, abrir] of casos) {
      const { telaAberta, r } = montar()
      abrir(r)
      expect(telaAberta.value, `${nome} não conta como tela aberta`).toBe(true)
    }
  })

  it('⚠️ comércio, mobília e criativo NÃO param o mundo', () => {
    // Cobrir a tela e parar o relógio são decisões diferentes. O aldeão precisa
    // continuar vivo enquanto se negocia com ele.
    const { paramOMundo, telaAberta, r } = montar()
    r.aldeao.value = { id: 1 }
    r.mobilia.value = { tipo: 'bau' }
    r.criativo.aberto.value = true
    expect(telaAberta.value).toBe(true)
    expect(paramOMundo.value, 'o comércio passou a parar o mundo sem ninguém pedir').toBe(false)
  })

  it('menu, pausa, inventário e lobby param o mundo', () => {
    for (const chave of ['menuOpen', 'paused', 'inventoryOpen', 'lobbyOpen']) {
      const { paramOMundo, r } = montar()
      r[chave].value = true
      expect(paramOMundo.value, `${chave} devia parar o mundo`).toBe(true)
    }
  })

  it('⚠️ "na partida" é o menu inicial ter saído, e NÃO "nenhuma tela aberta"', () => {
    // HUD e controles de toque existem com painel por cima; o que os tira da
    // tela é só o menu inicial. Colapsar as duas perguntas numa só sumiria com
    // a hotbar toda vez que o jogador abrisse o inventário.
    const { naPartida, telaAberta, r } = montar()
    expect(naPartida.value).toBe(true)
    r.inventoryOpen.value = true
    expect(telaAberta.value).toBe(true)
    expect(naPartida.value, 'o inventário não é o menu inicial').toBe(true)
    r.menuOpen.value = true
    expect(naPartida.value).toBe(false)
  })

  it('⚠️ abrir QUALQUER tela solta o ponteiro', async () => {
    const { r, soltas } = montar()
    r.criativo.aberto.value = true
    await nextTick()
    expect(soltas.n, 'o painel de criativo abriu com o ponteiro preso — a queixa do founder').toBe(
      1,
    )
  })

  // ── O ESCAPE DESMONTA A PILHA ──────────────────────────────────────────────

  it('⚠️ o Escape fecha o painel de criativo, e NÃO abre a pausa por cima', () => {
    // A queixa do founder, medida antes do conserto: com o painel aberto, o
    // Escape caía no `else` da cascata e abria o menu de pausa POR CIMA — e o
    // painel não fechava por mais que se apertasse.
    const { fecharDoTopo, r } = montar()
    r.criativo.aberto.value = true
    expect(fecharDoTopo(), 'não fechou nada — quem chama vai pausar').toBe(true)
    expect(r.criativo.aberto.value).toBe(false)
  })

  it('⚠️ sem tela nenhuma ele devolve false, para o Escape virar pausa', () => {
    // É este `false` que separa "fechei algo" de "não havia nada": sem ele o
    // Escape ou nunca pausa, ou pausa sempre.
    expect(montar().fecharDoTopo()).toBe(false)
  })

  it('fecha na ordem de empilhamento: o criativo vem antes do resto', () => {
    const { fecharDoTopo, r, fechou } = montar()
    r.inventoryOpen.value = true
    r.criativo.aberto.value = true
    fecharDoTopo()
    expect(r.criativo.aberto.value, 'fechou o de baixo primeiro').toBe(false)
    expect(r.inventoryOpen.value, 'o inventário não devia ter sido tocado').toBe(true)
    expect(fechou).toEqual([])
  })

  it('cada tela da ordem fecha pela porta dela', () => {
    for (const [chave, nome] of [
      ['inventoryOpen', 'inventario'],
      ['lobbyOpen', 'lobby'],
    ]) {
      const { fecharDoTopo, r, fechou } = montar()
      r[chave].value = true
      expect(fecharDoTopo(), nome).toBe(true)
      expect(fechou, `${nome} não fechou pela própria porta`).toEqual([nome])
    }
  })

  it('⚠️ apertar Escape até o fim esvazia a pilha, uma tela por vez', () => {
    // O jogador não pode ficar preso: cada Escape tira uma camada, e quando não
    // sobra nada é que a pausa entra.
    const { fecharDoTopo, telaAberta, r } = montar()
    r.criativo.aberto.value = true
    r.inventoryOpen.value = true
    r.lobbyOpen.value = true
    expect(fecharDoTopo()).toBe(true)
    expect(fecharDoTopo()).toBe(true)
    expect(fecharDoTopo()).toBe(true)
    expect(telaAberta.value, 'sobrou tela aberta depois de esvaziar').toBe(false)
    expect(fecharDoTopo(), 'a pilha vazia tem que devolver false').toBe(false)
  })

  it('fechar a tela não chama de novo', async () => {
    const { r, soltas } = montar()
    r.paused.value = true
    await nextTick()
    r.paused.value = false
    await nextTick()
    expect(soltas.n).toBe(1)
  })

  it('uma tela que abre com outra já aberta não solta duas vezes', async () => {
    const { r, soltas } = montar()
    r.paused.value = true
    await nextTick()
    r.inventoryOpen.value = true
    await nextTick()
    expect(soltas.n, 'o computed não mudou de valor, então não havia o que fazer').toBe(1)
  })
})
