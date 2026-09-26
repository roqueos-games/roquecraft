// RoqueCraft - A BANCADA: fechar o inventario, tirar o resultado, montar direto.
//
// Tres regras que moravam soltas no componente e ja custaram item de graca uma
// vez. Todas tem a mesma forma e o mesmo perigo: elas TIRAM de um lugar e POEM
// noutro, e no meio existe um instante em que o item nao esta em nenhum dos
// dois. Se a operacao desiste ali, o item some -- ou aparece duas vezes.
//
// ⚠️ NADA AQUI MUTA O QUE RECEBE.
//
// `addItem` e `removeItem` de `inventory.js` mutam o array, e foi exatamente
// isso que produziu o defeito do item de graca: `addItem` ja tinha colocado o
// que cabia quando a funcao desistiu, e o `consumeGrid` nunca rodou. Aqui tudo
// entra, e uma COPIA sai; ou a copia inteira vale, ou nada vale.

import {
  addItem,
  removeItem,
  countAll,
  espacoPara,
  clickSlot,
  cliqueNoInventario,
  damageTool,
} from './inventory.js'
import { consumeGrid } from './recipes.js'
import { gastaDurabilidade } from './encantamento.js'

const copia = (slots) => slots.map((s) => (s ? { ...s } : null))

/**
 * Fechar o inventario devolve TUDO que estava na mao e na grade.
 *
 * Sem isto, o item no cursor e os ingredientes na grade somem ao fechar a
 * janela -- e o jogador nao tem como saber que fechar destroi, porque em
 * lugar nenhum do jogo fechar uma janela destroi alguma coisa.
 */
export function devolverAoInventario({ inventario, cursor, grade }) {
  const inv = copia(inventario)
  // ⚠️ O QUE NÃO COUBER FICA ONDE ESTÁ, em vez de sumir (RC-01, 12/09/2026).
  //
  // `addItem` devolve quanto NÃO coube e as três chamadas daqui jogavam esse
  // número fora. O caso em que isso morde é raro e existe: ferramenta tem
  // durabilidade, item com durabilidade não empilha, e cada uma ocupa um slot
  // inteiro. Com o inventário cheio de ferramentas e a grade com mais uma,
  // fechar a janela apagava a ferramenta.
  //
  // Devolver o resto ao cursor e à grade mantém a conta fechada: nada é criado,
  // nada é destruído, e o jogador vê o que ficou para trás em vez de descobrir
  // depois que não tem mais.
  const sobraDoCursor = cursor ? addItem(inv, cursor.item, cursor.count, cursor.dur) : 0
  const gradeRestante = grade.map((s) => {
    if (!s) return null
    const sobra = addItem(inv, s.item, s.count, s.dur)
    return sobra > 0 ? { ...s, count: sobra } : null
  })
  return {
    inventario: inv,
    cursor: sobraDoCursor > 0 ? { ...cursor, count: sobraDoCursor } : null,
    grade: gradeRestante,
    // Quem fecha a janela precisa saber que ela não pode fechar ainda.
    coubeTudo: sobraDoCursor === 0 && gradeRestante.every((s) => !s),
  }
}

/**
 * Tirar o resultado da bancada.
 *
 * ⚠️ PERGUNTA ANTES DE ENTREGAR.
 *
 * Era `addItem` primeiro e "se sobrou, desiste" depois. So que `addItem` MUTA:
 * com o inventario quase cheio ele ja tinha colocado o que coubesse, e a saida
 * antecipada pulava o `consumeGrid`. Clicando repetido saia item de graca sem
 * gastar ingrediente nenhum.
 *
 * Ou cabe tudo e o craft acontece inteiro, ou nada acontece.
 */
export function retirarResultado({ inventario, grade, resultado }) {
  if (!resultado) return { ok: false, inventario, grade }
  if (espacoPara(inventario, resultado.item) < resultado.count) {
    return { ok: false, inventario, grade }
  }
  const inv = copia(inventario)
  addItem(inv, resultado.item, resultado.count)
  return { ok: true, inventario: inv, grade: consumeGrid(copia(grade)) }
}

/**
 * Os ingredientes de uma receita, contados por chave.
 *
 * Uma receita com forma e uma grade de linhas; sem forma, uma lista. As duas
 * viram a mesma pergunta: de que, e quantos. O espaco no padrao e buraco, nao
 * ingrediente.
 *
 * ⚠️ O TERNARIO DO ESPACO E EQUIVALENTE AO ACESSO DIRETO, e eu medi isso: o
 * mutante que troca `ch === ' ' ? null : keyMap[ch]` por `keyMap[ch]` SOBREVIVE,
 * porque `keyMap[' ']` ja e `undefined` e o `if (!c)` ja descarta. Ele fica pelo
 * que diz, nao pelo que impede.
 *
 * O que o `if (!c)` REALMENTE esconde e outra coisa, e essa e perigosa: uma
 * letra do padrao que nao exista no `keyMap` some em silencio, e a receita passa
 * a custar menos ingrediente do que devia -- item de graca por erro de digitacao.
 * Nao da pra decidir isso aqui (a funcao nao sabe o que e erro e o que e buraco),
 * entao quem segura e o teste que varre RECIPES inteiro atras de letra orfa.
 */
export function ingredientesDe(receita) {
  const celulas =
    receita.type === 'shaped'
      ? receita.pattern.flatMap((linha) =>
          [...linha].map((ch) => (ch === ' ' ? null : receita.keyMap[ch])),
        )
      : receita.items
  const precisa = new Map()
  for (const c of celulas || []) {
    if (!c) continue
    precisa.set(c, (precisa.get(c) || 0) + 1)
  }
  return precisa
}

/**
 * Montar pelo livro de receitas, direto do inventario.
 *
 * ⚠️ CONFERE TUDO ANTES DE TIRAR QUALQUER COISA. Conferir e tirar no mesmo laco
 * gastaria os primeiros ingredientes e desistiria no que faltasse -- o jogador
 * clicaria uma vez, nao receberia nada, e teria perdido madeira.
 */
export function montarDireto({ inventario, receita }) {
  const precisa = ingredientesDe(receita)
  const tem = countAll(inventario)
  for (const [k, n] of precisa) if ((tem[k] || 0) < n) return { ok: false, inventario }
  const inv = copia(inventario)
  for (const [k, n] of precisa) removeItem(inv, k, n)
  // ⚠️ E CONFERE O ESPAÇO DEPOIS DE TIRAR, não antes (RC-01, 12/09/2026).
  //
  // Esta linha ignorava a sobra: com o inventário cheio, os ingredientes eram
  // consumidos e o resultado ia para o lixo. O jogador clicava no livro e ficava
  // mais pobre.
  //
  // Conferir ANTES de remover seria pessimista e erraria para o outro lado: são
  // os próprios ingredientes que abrem o espaço (oito tábuas viram uma bancada e
  // liberam o slot). Por isso a conta é feita na CÓPIA, depois da remoção — e se
  // ainda assim não couber, a cópia inteira é descartada e nada aconteceu.
  if (addItem(inv, receita.result, receita.count) > 0) return { ok: false, inventario }
  return { ok: true, inventario: inv }
}

/**
 * A COLA DA BANCADA COM OS REFS, num lugar só.
 *
 * As quatro funções abaixo moravam no componente, e as quatro eram a mesma
 * forma repetida: chama a regra daqui, e se ela disse `ok`, escreve em dois ou
 * três refs e agenda o save. Repetida quatro vezes, essa forma é onde um dos
 * `if (!r.ok) return` se perde num refactor e o jogador ganha item de graça —
 * que já aconteceu uma vez, e é o RC-01 documentado acima.
 *
 * Os refs entram por injeção (`{ inventario, grade, cursor, resultado }`, cada
 * um com `get`/`set`), então isto é exercitável sem Vue: um objeto simples com
 * duas funções passa no lugar de um `ref`.
 */
export function criarMaoDaBancada({
  inventario,
  grade,
  cursor,
  resultado,
  salvar,
  armadura,
  aoQuebrar = () => {},
}) {
  const aplicar = (r) => {
    if (!r.ok) return false
    inventario.set(r.inventario)
    if (r.grade) grade.set(r.grade)
    salvar()
    return true
  }
  return {
    /** Clique num slot da GRADE. Não agenda save: a grade é tela aberta. */
    cliqueNaGrade(index, button) {
      const r = clickSlot(grade.get(), cursor.get(), index, button)
      grade.set(r.slots)
      cursor.set(r.cursor)
    },

    /** Retira o resultado, se couber. `false` quando não coube. */
    retirar() {
      return aplicar(
        retirarResultado({
          inventario: inventario.get(),
          grade: grade.get(),
          resultado: resultado.get(),
        }),
      )
    },

    /** Livro de receitas: monta e consome direto do inventário. */
    montar(receita) {
      return aplicar(montarDireto({ inventario: inventario.get(), receita }))
    },

    /**
     * Clique num slot da MOCHILA/HOTBAR (ou num lugar de armadura, quando
     * `index` é o nome da peça). A regra mora em `cliqueNoInventario`; aqui
     * só os refs. Saiu do componente pela catraca de tamanho, como o resto.
     */
    cliqueNoSlot(index, button) {
      const r = cliqueNoInventario(inventario.get(), {
        index,
        button,
        cursor: cursor.get(),
        armadura: armadura?.get(),
      })
      if (!r) return false
      inventario.set(r.slots)
      cursor.set(r.cursor)
      if (r.armadura) armadura.set(r.armadura)
      if (r.salvar) salvar()
      return true
    },

    /** Criativo: 64 do item, direto na mochila. */
    dar(key) {
      const inv = inventario.get()
      addItem(inv, key, 64)
      inventario.set(inv.slice())
    },

    /**
     * Gasta a ferramenta do slot. O INQUEBRÁVEL MORDE AQUI, e poupando em vez
     * de zerar: ferramenta eterna apaga a progressão de material que o jogo
     * inteiro se apoia. Devolve o veredito de `damageTool` ('none' | 'used' |
     * 'broke'), ou 'none' quando o encanto poupou.
     */
    gastar(slot, quanto = 1) {
      const inv = inventario.get()
      if (!gastaDurabilidade(inv[slot]?.enc?.inquebravel)) return 'none'
      const r = damageTool(inv, slot, quanto)
      inventario.set(inv.slice())
      // Quem avisa "quebrou" é quem tem tela; aqui só se chama.
      if (r === 'broke') aoQuebrar()
      return r
    },
  }
}
