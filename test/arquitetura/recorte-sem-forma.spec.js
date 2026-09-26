import { describe, it, expect } from 'vitest'
import { BLOCKS, FORMA_BASE, FORMA_TOPO } from '../../src/servicos/blocks.js'
import { EH_FORMA_LIVRE } from '../../src/servicos/formas.js'

// RECORTE SEM FORMA — a textura desenhada com margem transparente num CUBO
// CHEIO.
//
// ⚠️ ESTE É O DEFEITO DOS POSTES DE LUZ (founder, 18/09/2026: "os postes de luz
// estão todos bugados"). A lanterna tinha `cutout: true` e nenhuma forma, então
// saía pelo greedy como cubo 1×1. A textura dela é um corpo luminoso no meio
// com margem transparente em volta; recortada nas seis faces do cubo, sobrava
// uma CAIXA DE VIDRO OCA com dois painéis boiando dentro. De longe lia como
// lanterninha e ninguém viu; de perto era óbvio.
//
// É o mesmo defeito que a tocha teve até 25/08 (`plant: true, scale: 0.16`) e
// que a cerca teve ao nascer (esqueceu a linha do `normalize` e as 16 variantes
// saíram cubo cheio). Três vezes o mesmo erro, nenhuma delas pega por teste —
// porque "a chave existe" e "a textura existe" continuavam verdadeiras.
//
// A regra: bloco com recorte que ocupa a célula INTEIRA e não tem forma livre
// precisa de uma razão escrita. Ou ganha forma, ou entra na lista abaixo.
//
// O que este guarda NÃO pega: textura opaca demais ou de menos dentro de uma
// forma que existe. Isso é olho, e mora na folha de contato das sondas.
//
// Veio de `tests/unit/architecture/recorte-sem-forma.spec.js` do RoqueOS (7ab22a6f), com os mesmos casos e as mesmas
// asserções; o que mudou foi só o caminho do front para o do repo.

/**
 * CUBO CHEIO COM RECORTE, com o motivo escrito.
 *
 * Como em `itens-mortos`, dispensar é decisão e não esquecimento: o que entra
 * aqui responde "então por que ele é um cubo cheio?" sem hesitar.
 */
const DISPENSADOS = {
  oakLeaves: 'folha é massa densa com furos; o cubo cheio é a forma certa',
  birchLeaves: 'idem oakLeaves',
  spruceLeaves: 'idem oakLeaves',
  jungleLeaves: 'idem oakLeaves',
  // Medido em 19/09/2026 no gerador: `cactus_side` e `cactus_top` pintam TODOS
  // os pixels opacos, então não há margem pra recortar. O `cutout` aqui é
  // supérfluo, não defeito — tirar é limpeza de outro dia.
  cactus: 'a textura é 100% opaca: não há margem transparente pra virar buraco',
}

/** Ocupa a célula inteira? (laje, neve e poeira usam base/topo e saem daqui.) */
const cubocheio = (id) => FORMA_BASE[id] === 0 && FORMA_TOPO[id] === 1

describe('recorte sem forma — a caixa de vidro oca', () => {
  it('todo bloco com recorte em cubo cheio tem forma livre ou razão escrita', () => {
    const infratores = []
    for (const b of Object.values(BLOCKS)) {
      // Planta é cruz, caminho próprio de render; não é cubo.
      if (!b.cutout || b.plant) continue
      if (EH_FORMA_LIVRE[b.id] === 1) continue
      if (!cubocheio(b.id)) continue
      if (DISPENSADOS[b.key]) continue
      infratores.push(b.key)
    }
    expect(
      infratores,
      `bloco com textura recortada ocupando o cubo inteiro e sem forma própria:\n` +
        `  ${infratores.join(', ')}\n` +
        `Ou ele ganha forma em \`formas.js\` (como a lanterna e a tocha), ou entra\n` +
        `em DISPENSADOS aqui com o motivo escrito.`,
    ).toEqual([])
  })

  it('a lista de dispensados não guarda bloco que já foi consertado', () => {
    const jaTem = Object.keys(DISPENSADOS).filter((k) => {
      const b = Object.values(BLOCKS).find((x) => x.key === k)
      return b && (EH_FORMA_LIVRE[b.id] === 1 || !cubocheio(b.id) || !b.cutout)
    })
    expect(jaTem, `estes já não são cubo cheio com recorte — tire-os da lista: ${jaTem}`).toEqual(
      [],
    )
  })

  it('a lista não guarda bloco que não existe mais', () => {
    const fantasmas = Object.keys(DISPENSADOS).filter(
      (k) => !Object.values(BLOCKS).some((b) => b.key === k),
    )
    expect(fantasmas, `bloco na lista e não no catálogo: ${fantasmas}`).toEqual([])
  })
})
