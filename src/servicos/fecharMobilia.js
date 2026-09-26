// RoqueCraft - FECHAR O BAÚ OU A FORNALHA COM ALGO NA MÃO.
//
// ⚠️ ESTE ARQUIVO EXISTE PORQUE FECHAR A JANELA APAGAVA ITEM (RC-01).
//
// `fecharMobilia` fazia:
//
//     addItem(inventory.value, cursor.item, cursor.count, cursor.dur)
//     cursorStack.value = null
//
// `addItem` devolve quanto NÃO coube, e esse número ia para o lixo junto com os
// itens. E aqui o item costuma vir DO BAÚ, não do inventário: pegar 64 de pedra
// num baú com o inventário cheio e apertar Esc destruía as 64. Em lugar nenhum
// deste jogo fechar uma janela destrói alguma coisa — menos aqui.
//
// A regra: o que não couber no inventário VOLTA PARA O CONTAINER. Isso sempre
// tem para onde ir, e o motivo é aritmético: o item saiu de um dos dois lados,
// então o espaço dele continua vago de um dos dois lados. Se, ainda assim, não
// couber em lugar nenhum (um baú que encheu enquanto a fornalha cozinhava), a
// janela NÃO fecha e o item continua na mão — preso é recuperável, apagado não.
//
// Puro: entra estado, sai estado. Quem muta `ref` é o componente.

import { addItem } from './inventory.js'

const copia = (slots) => slots.map((s) => (s ? { ...s } : null))

/**
 * @param {object} e
 * @param {Array} e.inventario   slots do jogador
 * @param {Array} e.container    slots do baú, ou os da fornalha em ordem
 * @param {object|null} e.cursor o que está na mão
 * @returns {{inventario: Array, container: Array, cursor: object|null, podeFechar: boolean}}
 */
export function devolverCursorAoFechar({ inventario, container = [], cursor }) {
  if (!cursor) {
    return { inventario, container, cursor: null, podeFechar: true }
  }
  const inv = copia(inventario)
  const sobra = addItem(inv, cursor.item, cursor.count, cursor.dur)
  if (sobra === 0) {
    return { inventario: inv, container, cursor: null, podeFechar: true }
  }

  // Não coube tudo no inventário: o resto tenta o container.
  const cont = copia(container)
  const sobraFinal = addItem(cont, cursor.item, sobra, cursor.dur)
  if (sobraFinal === 0) {
    return { inventario: inv, container: cont, cursor: null, podeFechar: true }
  }

  // Nem no container. Nada é destruído: a mão continua cheia e a janela fica
  // aberta, que é o único desfecho em que o jogador ainda tem o item.
  return {
    inventario: inv,
    container: cont,
    cursor: { ...cursor, count: sobraFinal },
    podeFechar: false,
  }
}
