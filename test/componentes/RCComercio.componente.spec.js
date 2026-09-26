import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import RCComercio from '../../src/componentes/RCComercio.vue'
import { CHAVE_DOS_TEXTOS } from '../../src/textosDoJogo.js'

// Veio de `tests/component/roqueos/apps/RCComercio.spec.js` do RoqueOS (7ab22a6f), com os mesmos casos e as mesmas
// asserções. Lá o texto vinha do vue-i18n do RoqueOS, e o teste trocava o
// `useI18n` por um dublê; aqui as telas pedem o `t` com `useTextos()`, e o
// teste PROVÊ o mesmo dublê pela chave que o jogo usa (`CHAVE_DOS_TEXTOS`).
// Ele devolve a chave + os parâmetros, pra dar pra afirmar QUE dado entrou na
// frase.
const t = (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key)

// O `RCComercio.spec.js` ao lado veio do OUTRO spec do front
// (`tests/unit/components/roquecraft/`), que troca o `items.js` por um dublê;
// este usa o catálogo de verdade (o rótulo acessível cita o nome do item), e
// por isso são dois arquivos, como eram lá.

const oferta = (extra = {}) => ({
  indice: 0,
  paga: [{ item: 'wheat', count: 18 }],
  recebe: { item: 'emerald', count: 1 },
  restam: 3,
  usos: 12,
  motivo: null,
  ...extra,
})

const conversa = (extra = {}) => ({
  nome: 'Benedito',
  oficio: 'fazendeiro',
  amizade: 20,
  humor: 'reservado',
  texto: '',
  fonte: '',
  pensando: false,
  presente: '',
  modelo: false,
  ...extra,
})

const montar = (props = {}) =>
  mount(RCComercio, {
    props: { conversa: conversa(), ofertas: [oferta()], icons: {}, ...props },
    global: { stubs: { RCIcon: true }, provide: { [CHAVE_DOS_TEXTOS]: t } },
  })

describe('RCComercio (a tela de trocas do aldeão)', () => {
  it('o título diz a PROFISSÃO — é ela que explica o que há para negociar', () => {
    const w = montar({ conversa: conversa({ oficio: 'ferreiro' }) })
    expect(w.find('[data-test="rc-com-titulo"]').text()).toBe(
      'roqueCraft.comercio.profissao.ferreiro',
    )
  })

  it('sem ofertas, diz isso em vez de mostrar uma lista vazia', () => {
    // Painel vazio e sem texto lê como tela quebrada.
    const w = montar({ ofertas: [] })
    expect(w.find('[data-test="rc-com-vazio"]').exists()).toBe(true)
    expect(w.findAll('[data-test="rc-com-linha"]')).toHaveLength(0)
  })

  it('uma linha por oferta', () => {
    const w = montar({ ofertas: [oferta(), oferta({ indice: 1 })] })
    expect(w.findAll('[data-test="rc-com-linha"]')).toHaveLength(2)
  })

  it('o ESTOQUE fica à vista', () => {
    // ⚠️ Sem ele, um botão desabilitado por "esgotada" parece defeito; com ele,
    // o jogador entende que o aldeão repõe e volta depois.
    const w = montar({ ofertas: [oferta({ restam: 0, usos: 12, motivo: 'esgotada' })] })
    expect(w.find('[data-test="rc-com-estoque"]').text()).toBe('0/12')
  })

  it('oferta com motivo de recusa DESABILITA o botão, e o título diz o motivo', () => {
    const w = montar({ ofertas: [oferta({ motivo: 'sem-pagamento' })] })
    const b = w.find('[data-test="rc-com-trocar"]')
    expect(b.attributes('disabled')).toBeDefined()
    expect(b.attributes('title')).toBe('roqueCraft.comercio.sem-pagamento')
  })

  it('oferta possível: botão ativo, e o clique emite o ÍNDICE', () => {
    const w = montar({ ofertas: [oferta({ indice: 7 })] })
    const b = w.find('[data-test="rc-com-trocar"]')
    expect(b.attributes('disabled')).toBeUndefined()
    b.trigger('click')
    expect(w.emitted('acao')?.[0]).toEqual(['trocar', 7])
  })

  it('o rótulo acessível diz a TROCA INTEIRA — quem usa leitor não vê os ícones', () => {
    const w = montar()
    const rotulo = w.find('[data-test="rc-com-trocar"]').attributes('aria-label')
    expect(rotulo).toContain('roqueCraft.comercio.rotulo')
    expect(rotulo).toContain('18')
    expect(rotulo).toContain('roqueCraft.items.wheat')
    expect(rotulo).toContain('roqueCraft.items.emerald')
  })

  it('uma oferta com DOIS pagamentos mostra os dois', () => {
    const w = montar({
      ofertas: [
        oferta({
          paga: [
            { item: 'emerald', count: 2 },
            { item: 'stick', count: 4 },
          ],
        }),
      ],
    })
    const rotulo = w.find('[data-test="rc-com-trocar"]').attributes('aria-label')
    expect(rotulo).toContain('roqueCraft.items.stick')
    expect(rotulo).toContain('roqueCraft.items.emerald')
  })

  it('fechar emite close', () => {
    const w = montar()
    w.find('.rc-com__x').trigger('click')
    expect(w.emitted('close')).toBeTruthy()
  })
})

//
// A PESSOA, E NÃO SÓ O BALCÃO — onda 9 do Goal 20.
//
describe('RCComercio: o aldeão como pessoa', () => {
  it('mostra NOME e HUMOR — é o que separa alguém de uma máquina de venda', () => {
    const w = montar({ conversa: conversa({ nome: 'Doralice', humor: 'caloroso' }) })
    expect(w.find('[data-test="rc-npc-nome"]').text()).toBe('Doralice')
    expect(w.find('[data-test="rc-npc-humor"]').text()).toBe('roqueCraft.npc.humor.caloroso')
  })

  it('a AMIZADE aparece como barra, com o valor legível por leitor de tela', () => {
    // ⚠️ À vista porque ela MUDA O PREÇO. Um desconto que vem de um número
    // escondido é um desconto que ninguém entende de onde saiu.
    const b = montar({ conversa: conversa({ amizade: 73 }) }).find('[data-test="rc-npc-amizade"]')
    expect(b.attributes('aria-valuenow')).toBe('73')
    expect(b.find('i').attributes('style')).toContain('73%')
  })

  it('sem conversa (aldeão de save antigo), o painel não quebra — só o balcão aparece', () => {
    const w = montar({ conversa: null })
    expect(w.find('[data-test="rc-npc"]').exists()).toBe(false)
    expect(w.findAll('[data-test="rc-com-linha"]')).toHaveLength(1)
  })

  it('antes da primeira fala, o balão diz que ele espera — não fica em branco', () => {
    // ⚠️ Balão vazio lê como painel quebrado, e o jogador não descobre que há um
    // botão para apertar. A frase é o convite.
    expect(montar().find('[data-test="rc-npc-fala"]').text()).toBe('roqueCraft.npc.silencio')
  })

  it('enquanto PENSA, mostra que está pensando em vez de um balão vazio', () => {
    const w = montar({ conversa: conversa({ pensando: true, texto: 'velho' }) })
    expect(w.find('[data-test="rc-npc-fala"]').text()).toBe('roqueCraft.npc.pensando')
  })

  it('os botões de conversa emitem o ASSUNTO', () => {
    const w = montar()
    w.find('[data-test="rc-npc-falar"]').trigger('click')
    w.find('[data-test="rc-npc-oficio"]').trigger('click')
    expect(w.emitted('acao')?.[0]).toEqual(['saudacao'])
    expect(w.emitted('acao')?.[1]).toEqual(['oficio'])
  })

  it('sem nada na mão, o botão de presente fica DESABILITADO e diz por quê', () => {
    const b = montar().find('[data-test="rc-npc-presente"]')
    expect(b.attributes('disabled')).toBeDefined()
    expect(b.attributes('title')).toBe('roqueCraft.npc.semPresente')
  })

  it('com item na mão, presentear emite O ITEM', () => {
    const w = montar({ conversa: conversa({ presente: 'bread' }) })
    w.find('[data-test="rc-npc-presente"]').trigger('click')
    expect(w.emitted('acao')?.[0]).toEqual(['presentear', 'bread'])
  })

  it('SEM modelo não há caixa de texto', async () => {
    // ⚠️ Uma caixa que sempre devolve a mesma frase de tabela promete uma
    // conversa que não existe, e o jogador descobre isso na terceira pergunta.
    expect(montar().find('[data-test="rc-npc-pergunta"]').exists()).toBe(false)
  })

  it('COM modelo, a pergunta digitada sai como ação e a caixa esvazia', async () => {
    const w = montar({ conversa: conversa({ modelo: true }) })
    const campo = w.find('[data-test="rc-npc-pergunta"]')
    await campo.setValue('  onde fica a mina?  ')
    await w.find('form.rc-com__caixa').trigger('submit')
    expect(w.emitted('acao')?.[0]).toEqual(['perguntar', 'onde fica a mina?'])
    expect(campo.element.value).toBe('')
  })

  it('pergunta em branco não vira chamada de modelo', async () => {
    const w = montar({ conversa: conversa({ modelo: true }) })
    await w.find('[data-test="rc-npc-pergunta"]').setValue('    ')
    await w.find('form.rc-com__caixa').trigger('submit')
    expect(w.emitted('acao')).toBeFalsy()
  })
})
