// GANCHO DE QA: INVENTÁRIO, MÃO E MOBÍLIA.
//
// Tudo que a sonda precisa pra montar uma situação de item sem passar pela
// TELA. As telas de inventário e de baú só existem com pointer lock, e em
// headless o pointer lock não engata — sem estes métodos a sonda teria que
// clicar num overlay que nunca aparece.
//
// POR QUE MOBÍLIA MORA AQUI. Baú e fornalha são inventário que vive no mundo
// em vez de na mão. O conteúdo é o mesmo tipo de coisa ({ item, count }), e a
// pergunta que a sonda faz é a mesma ("o que está no slot?"). Cortar mobília
// pra um módulo próprio separaria a pergunta da resposta.
//
// É SERVIÇO E NÃO COMPOSABLE. Nada aqui tem ciclo de vida: não há temporizador
// pra cancelar, nem observador pra desligar quando o app fecha. É um punhado
// de funções sobre o estado que o componente já mantém.

import { addItem } from './inventory.js'
import { itemDef } from './items.js'
import { mobiliaEm } from './mobilia.js'

/**
 * @param {object} ctx
 * @param {import('vue').Ref} ctx.inventory  ref do array de slots
 * @param {import('vue').Ref} ctx.selectedSlot  ref do índice da hotbar
 * @param {import('vue').Ref} ctx.aberto  ref da mobília aberta ({ tipo, x, y, z })
 * @param {() => object} ctx.mobilia  GETTER: `mobilia` é reatribuída em mundo
 *   novo (`criarMobilia()`), então um valor capturado aqui apontaria pro mapa
 *   do mundo anterior e o QA leria baú de outro mundo.
 * @param {() => object|null} ctx.heldItem
 * @param {() => void} ctx.avisarMobilia  força o recomputo da tela de mobília
 * @param {() => void} ctx.toggleInventory
 * @param {() => void} ctx.pickBlock
 * @param {Function} ctx.soltarItem  o MESMO caminho do jogo
 * @param {() => Array} ctx.drops  GETTER: `drops` é `let` no componente e é
 *   REATRIBUÍDA ao entrar e ao sair do multiplayer e ao desmontar o jogo.
 *   Capturar o array deixaria a sonda contando os itens de uma partida morta.
 */
export function criarQaDeInventario({
  inventory,
  selectedSlot,
  aberto,
  mobilia,
  heldItem,
  avisarMobilia,
  toggleInventory,
  pickBlock,
  soltarItem,
  drops,
}) {
  return {
    give: (item, count = 1) => {
      addItem(inventory.value, item, count)
      inventory.value = inventory.value.slice()
    },

    // Poe o item DIRETO num slot da hotbar. `give` empilha no primeiro slot
    // livre - com a hotbar cheia (criativo) a picareta ia parar no slot 12, o
    // `slotOf` devolvia -1 e o QA fotografava a mao segurando outra coisa
    // achando que era a picareta (QA de 2026-08-20).
    setSlot: (i, item, count = 1) => {
      const s = Math.max(0, Math.min(8, i | 0))
      const inv = inventory.value.slice()
      inv[s] = item ? { item, count } : null
      inventory.value = inv
      selectedSlot.value = s
      return inventory.value[s]?.item ?? null
    },

    // Põe o item DIRETO no slot selecionado e devolve o que ficou na mão.
    //
    // `give` + `slotOf` não serve pra armar uma bancada: `slotOf` só varre a
    // hotbar, e no modo criativo a hotbar já vem cheia — o item novo cai no
    // slot 10 e o `slotOf` devolve -1 em silêncio. A sonda de combate mediu um
    // golpe inteiro de MÃO VAZIA achando que era espada de ferro (dano base 1
    // em vez de 7) por causa disso.
    equipar: (item, count = 1) => {
      const inv = inventory.value.slice()
      inv[selectedSlot.value] = item ? { item, count } : null
      inventory.value = inv
      return heldItem()?.item ?? null
    },

    naMao: () => heldItem()?.item ?? null,

    /** Quanto deste item o inventário tem no TOTAL — a sonda conta a troca. */
    contarItem: (item) => inventory.value.reduce((n, s) => n + (s?.item === item ? s.count : 0), 0),

    /** Põe item no inventário pelo caminho do jogo (`addItem`, que empilha). */
    darItem: (item, count = 1) => {
      const inv = inventory.value.slice()
      const sobra = addItem(inv, item, count)
      inventory.value = inv
      return count - sobra
    },

    // Equipa JÁ ENCANTADO. Não é atalho: a sonda que mede a mordida precisa de
    // duas ferramentas idênticas fora o encanto, e chegar lá pela mesa exigiria
    // acertar o sorteio três vezes seguidas — o que mediria o sorteio e não a
    // mordida. O caminho da MESA é medido em outro trecho da mesma sonda.
    equiparComEncanto: (item, enc = null, count = 1, pocao = null) => {
      const inv = inventory.value.slice()
      const def = itemDef(item)
      inv[selectedSlot.value] = { item, count }
      if (def?.durability) inv[selectedSlot.value].dur = def.durability
      if (enc && Object.keys(enc).length) inv[selectedSlot.value].enc = { ...enc }
      // A poção modificada (`{ nivel: 2 }`, `{ longa: true }`, `{ splash: true }`)
      // vai pela mesma porta: a sonda do suporte já a fabrica; a do arremesso
      // precisa dela pronta na mão.
      if (pocao && Object.keys(pocao).length) inv[selectedSlot.value].pocao = { ...pocao }
      inventory.value = inv
      return {
        item: heldItem()?.item ?? null,
        enc: { ...(heldItem()?.enc || {}) },
        pocao: heldItem()?.pocao ?? null,
      }
    },

    // Os encantos do item na mão. A sonda da mesa precisa disto e o `stats` não
    // serve: ele achata o slot em `{item, count}` de propósito, pra não despejar
    // durabilidade e encanto de 36 slots em toda leitura de estado.
    encantosNaMao: () => ({ ...(heldItem()?.enc || {}) }),

    /** Os modificadores da poção na mão, ou null. */
    pocaoNaMao: () => heldItem()?.pocao ?? null,

    // Durabilidade do item na mão, pra medir o gasto de verdade em vez de
    // acreditar que `inquebravel` mordeu.
    durabilidadeNaMao: () => heldItem()?.dur ?? null,

    // Indice do primeiro slot da hotbar com o item pedido (-1 se nao tem).
    slotOf: (item) => inventory.value.slice(0, 9).findIndex((s) => s && s.item === item),

    // Seleciona o slot da hotbar (0..8) - o QA precisa disto pra colocar tocha.
    selectSlot: (i) => {
      selectedSlot.value = Math.max(0, Math.min(8, i | 0))
      return inventory.value[selectedSlot.value]?.item ?? null
    },

    openInventory: () => toggleInventory(),

    pickBlock: () => pickBlock(),

    // Larga um item no chão pelo MESMO caminho do jogo (`soltarItem`), não por
    // um atalho: uma sonda que empurrasse direto no array testaria o array, não
    // o jogo.
    soltarItemQA: (item, count, x, y, z) => {
      soltarItem(item, count, x, y, z)
      return drops().length
    },

    // Item no chão, pra sonda poder provar que ele SOBREVIVE ao recarregamento.
    // Um teste de serialização prova o formato; só o jogo rodando prova que o
    // que foi gravado é o que volta.
    dropsInfo: () =>
      drops().map((d) => ({
        item: d.item,
        count: d.count,
        x: +d.x.toFixed(2),
        y: +d.y.toFixed(2),
        z: +d.z.toFixed(2),
        age: +(d.age || 0).toFixed(1),
      })),

    // ── Mobília (baú e fornalha) ────────────────────────────────────────────
    //
    // Ler o estado e mexer nos slots sem abrir a tela. O gancho `interagir`,
    // que abre a mobília pelo bloco mirado, ficou no componente porque ele é
    // entrada de teclado/mouse, não inventário.
    mobiliaEm: (x, y, z) => {
      const e = mobiliaEm(mobilia(), x, y, z)
      if (!e) return null
      if (e.tipo === 'bau') {
        return { tipo: 'bau', slots: e.slots.map((s) => (s ? { ...s } : null)) }
      }
      if (e.tipo === 'suporte') {
        return {
          tipo: 'suporte',
          ingrediente: e.ingrediente && { ...e.ingrediente },
          garrafas: e.garrafas.map((g) => (g ? { ...g } : null)),
          progresso: e.progresso,
        }
      }
      return {
        tipo: 'fornalha',
        entrada: e.entrada && { ...e.entrada },
        combustivel: e.combustivel && { ...e.combustivel },
        saida: e.saida && { ...e.saida },
        fogo: e.fogo,
        progresso: e.progresso,
      }
    },

    porNaMobilia: (x, y, z, campo, item, count = 1) => {
      const e = mobiliaEm(mobilia(), x, y, z)
      if (!e) return false
      if (e.tipo === 'bau') e.slots[campo] = { item, count }
      // O suporte guarda as garrafas num array; `garrafa0..2` é o nome que a
      // sonda usa, e ele mapeia pro índice. Sem isto a sonda escreveria um
      // campo `garrafa0` solto no objeto e o suporte nunca veria a garrafa.
      else if (e.tipo === 'suporte' && /^garrafa[0-2]$/.test(campo)) {
        e.garrafas[Number(campo.slice(7))] = { item, count }
      } else e[campo] = { item, count }
      avisarMobilia()
      return true
    },

    abertoAgora: () => (aberto.value ? { ...aberto.value } : null),
  }
}
