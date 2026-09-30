import { describe, it, expect } from 'vitest'
import {
  proximoFoco,
  focaveisDe,
  indiceFocado,
  usaAsSetas,
  digitandoEm,
  PARA_FRENTE,
  PARA_TRAS,
} from '../../src/servicos/focoDeTela.js'

// ⚠️ NAVEGAR MENU PELO TECLADO NÃO EXISTIA. Medido em 19/09/2026 nos dez
// componentes de tela: zero `@keydown`, zero `tabindex`, zero seta. O que se
// prova aqui são as três bordas que quebram na mão: a volta no fim da lista, a
// entrada sem foco algum, e a lista vazia.

const tecla = (code, shift = false) => ({ code, shift })

describe('focoDeTela — o próximo índice', () => {
  it('anda para frente e VOLTA no fim: a lista é um anel', () => {
    expect(proximoFoco(0, 4, tecla('Tab'))).toBe(1)
    expect(proximoFoco(3, 4, tecla('Tab')), 'parou no último em vez de voltar').toBe(0)
    expect(proximoFoco(3, 4, tecla('ArrowDown'))).toBe(0)
  })

  it('anda para trás e volta pelo outro lado', () => {
    expect(proximoFoco(2, 4, tecla('ArrowUp'))).toBe(1)
    expect(proximoFoco(0, 4, tecla('ArrowUp')), 'travou no primeiro').toBe(3)
    expect(proximoFoco(0, 4, tecla('Tab', true)), 'Shift+Tab tem que andar para trás').toBe(3)
  })

  // ⚠️ SEM FOCO, A TECLA ENTRA PELA PONTA CERTA. Entrar sempre no primeiro faz
  // o Shift+Tab de quem acabou de abrir a tela pular para o item 2.
  it('com nada focado, para frente entra no primeiro e para trás no último', () => {
    expect(proximoFoco(-1, 5, tecla('Tab'))).toBe(0)
    expect(proximoFoco(-1, 5, tecla('ArrowDown'))).toBe(0)
    expect(proximoFoco(-1, 5, tecla('ArrowUp'))).toBe(4)
    expect(proximoFoco(-1, 5, tecla('Tab', true))).toBe(4)
  })

  it('índice fora da lista (o foco escapou) é tratado como sem foco', () => {
    expect(proximoFoco(99, 3, tecla('Tab'))).toBe(0)
    expect(proximoFoco(99, 3, tecla('ArrowUp'))).toBe(2)
  })

  it('Home e End vão às pontas, com foco ou sem', () => {
    expect(proximoFoco(2, 6, tecla('Home'))).toBe(0)
    expect(proximoFoco(2, 6, tecla('End'))).toBe(5)
    expect(proximoFoco(-1, 6, tecla('End'))).toBe(5)
  })

  it('tecla que não é de navegação devolve -1: quem chama não mexe no foco', () => {
    expect(proximoFoco(1, 4, tecla('KeyA'))).toBe(-1)
    expect(proximoFoco(1, 4, tecla('Enter'))).toBe(-1)
    expect(proximoFoco(1, 4, tecla('Escape')), 'o Escape é da pilha de telas, não do foco').toBe(-1)
  })

  // ⚠️ LISTA VAZIA ACONTECE DE VERDADE: a tela de morte tem UM botão, e o
  // inventário fora do criativo esconde a fileira de blocos. Dividir por zero
  // aqui daria NaN, e `focus()` num índice NaN é um erro no console que o
  // jogador não vê — o menu simplesmente para de responder.
  it('lista vazia nunca devolve índice', () => {
    for (const c of ['Tab', 'ArrowDown', 'ArrowUp', 'Home', 'End'])
      expect(proximoFoco(-1, 0, tecla(c)), `${c} achou item numa lista vazia`).toBe(-1)
  })

  it('lista de um só item: andar não sai do lugar, e não quebra', () => {
    expect(proximoFoco(0, 1, tecla('Tab'))).toBe(0)
    expect(proximoFoco(0, 1, tecla('ArrowUp'))).toBe(0)
  })

  it('as duas listas de tecla não se cruzam', () => {
    expect(
      [...PARA_FRENTE].some((c) => PARA_TRAS.has(c)),
      'a mesma tecla anda para os dois lados',
    ).toBe(false)
  })
})

describe('focoDeTela — a lista de focáveis', () => {
  const montar = (html) => {
    const raiz = document.createElement('div')
    raiz.innerHTML = html
    document.body.appendChild(raiz)
    return raiz
  }

  it('raiz que não existe devolve lista vazia, sem explodir', () => {
    expect(focaveisDe(null)).toEqual([])
    expect(focaveisDe({})).toEqual([])
  })

  it('pega botão, campo e select, na ordem do documento', () => {
    const raiz = montar('<button id="a"></button><input id="b" /><select id="c"></select>')
    expect(focaveisDe(raiz).map((e) => e.id)).toEqual(['a', 'b', 'c'])
    raiz.remove()
  })

  // ⚠️ OS DOIS EXISTEM NAS TELAS DE HOJE: o botão de raio do criativo é
  // `:disabled` sem tempestade. Foco que pousa em botão morto lê como menu
  // quebrado.
  it('pula o desabilitado e o campo escondido', () => {
    const raiz = montar(
      '<button id="a"></button><button id="morto" disabled></button>' +
        '<input id="oculto" type="hidden" /><input id="b" />',
    )
    expect(focaveisDe(raiz).map((e) => e.id)).toEqual(['a', 'b'])
    raiz.remove()
  })

  it('tabindex -1 fica de fora; tabindex 0 entra', () => {
    const raiz = montar('<div id="a" tabindex="0"></div><div id="fora" tabindex="-1"></div>')
    expect(focaveisDe(raiz).map((e) => e.id)).toEqual(['a'])
    raiz.remove()
  })

  it('o índice do focado, e -1 quando o foco escapou da tela', () => {
    const raiz = montar('<button id="a"></button><button id="b"></button>')
    const lista = focaveisDe(raiz)
    expect(indiceFocado(lista, lista[1])).toBe(1)
    const forasteiro = document.createElement('button')
    expect(indiceFocado(lista, forasteiro), 'o foco de fora contou como dentro').toBe(-1)
    raiz.remove()
  })
})

// ⚠️ ACHADO DO REVISOR NA ONDA 1, e era defeito de verdade: o painel de criativo
// tem dois `<input type="range">` (a hora e a chuva), e num range a seta é o
// jeito de ajustar o valor. A malha roubando ArrowUp/ArrowDown congelava o sol
// no mesmo dia em que a navegação por teclado passou a existir.
describe('focoDeTela — de quem é a seta', () => {
  const el = (html) => {
    const d = document.createElement('div')
    d.innerHTML = html
    return d.firstElementChild
  }

  it('range, select, textarea e número usam a seta por conta própria', () => {
    expect(usaAsSetas(el('<input type="range" />')), 'a hora do criativo').toBe(true)
    expect(usaAsSetas(el('<select></select>'))).toBe(true)
    expect(usaAsSetas(el('<textarea></textarea>'))).toBe(true)
    expect(usaAsSetas(el('<input type="number" />'))).toBe(true)
  })

  it('campo de texto também: a seta anda com o cursor', () => {
    expect(usaAsSetas(el('<input type="text" />'))).toBe(true)
    // `<input>` sem type É text, e foi assim que o campo de código do lobby
    // está escrito.
    expect(usaAsSetas(el('<input />')), 'input sem type ficou de fora').toBe(true)
  })

  // ⚠️ A FILA DE ABAS TAMBÉM, e é regra do ARIA: num `tablist` a seta TROCA de
  // aba. Hoje o painel de criativo trata a seta no próprio botão e chama
  // `stopPropagation`, então a malha nem veria — mas essa é uma proteção de
  // UMA implementação. Um `tablist` com um controle a mais dentro, ou alguém
  // que tire o `stopPropagation`, e a malha volta a roubar a seta das abas.
  // A regra mora aqui porque é aqui que ela vale para todos.
  it('a fila de abas usa a seta: num tablist, a seta troca de aba', () => {
    const aba = el('<button role="tab"></button>')
    expect(usaAsSetas(aba), 'a malha roubaria a seta das abas').toBe(true)

    const fila = document.createElement('div')
    fila.setAttribute('role', 'tablist')
    const dentro = document.createElement('button')
    fila.appendChild(dentro)
    document.body.appendChild(fila)
    expect(usaAsSetas(dentro), 'controle dentro da fila de abas ficou de fora').toBe(true)
    fila.remove()
  })

  it('botão e caixa de seleção NÃO usam: neles a seta é da malha', () => {
    expect(usaAsSetas(el('<button></button>'))).toBe(false)
    expect(usaAsSetas(el('<input type="checkbox" />'))).toBe(false)
    expect(usaAsSetas(el('<a href="#"></a>'))).toBe(false)
    expect(usaAsSetas(el('<div tabindex="0"></div>'))).toBe(false)
  })

  it('sem elemento nenhum, a seta é da malha', () => {
    expect(usaAsSetas(null)).toBe(false)
    expect(usaAsSetas({})).toBe(false)
  })
})

// GOAL 23, ONDA 4: enquanto o jogador digita, a tecla é do campo. O `1` de uma
// coordenada não é o slot 1; o `f` não liga o voo.
describe('digitandoEm', () => {
  const el = (tag, attrs = {}, extra = {}) => ({
    tagName: tag.toUpperCase(),
    getAttribute: (k) => attrs[k] ?? null,
    ...extra,
  })

  it('campo de texto, número, área de texto, select e editável: está digitando', () => {
    expect(digitandoEm(el('input'))).toBe(true)
    expect(digitandoEm(el('input', { type: 'text' }))).toBe(true)
    expect(digitandoEm(el('input', { type: 'number' }))).toBe(true)
    expect(digitandoEm(el('input', { type: 'search' }))).toBe(true)
    expect(digitandoEm(el('textarea'))).toBe(true)
    expect(digitandoEm(el('select'))).toBe(true)
    expect(digitandoEm(el('div', {}, { isContentEditable: true }))).toBe(true)
  })

  it('botão, caixa de marcar, range e o resto da tela: o jogo ouve', () => {
    expect(digitandoEm(el('input', { type: 'checkbox' }))).toBe(false)
    expect(digitandoEm(el('input', { type: 'range' }))).toBe(false)
    expect(digitandoEm(el('input', { type: 'button' }))).toBe(false)
    expect(digitandoEm(el('button'))).toBe(false)
    expect(digitandoEm(el('div'))).toBe(false)
    expect(digitandoEm(el('canvas'))).toBe(false)
    expect(digitandoEm(null)).toBe(false)
    expect(digitandoEm({})).toBe(false)
  })
})
