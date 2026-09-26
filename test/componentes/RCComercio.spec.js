import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { mount } from '@vue/test-utils'
import RCComercio from '../../src/componentes/RCComercio.vue'

//
// A JANELA DE DIÁLOGO DO ALDEÃO — o que ela mostra, o que ela emite, e de que
// design system ela é.
//
// ⚠️ ESTE ARQUIVO NÃO TINHA TESTE NENHUM, e foi o founder quem viu o que
// faltava: "a janela de diálogo também está horrível" (16/09). O painel tinha
// paleta própria, `font-family: monospace` e um `x` desenhado à mão, ao lado de
// uma pausa e de um inventário que usam os primitivos de `roquecraft.scss`.
// Estilo não se prova por captura de tela — mas "usa o primitivo do jogo em vez
// de inventar o próprio" se prova, e é o que trava aqui.
//

// Sem o jogo em volta, `useTextos()` devolve a chave como veio: é o que o dublê
// do vue-i18n fazia aqui antes da extração (o jogo não usa mais vue-i18n).
vi.mock('../../src/servicos/items.js', () => ({
  itemDef: (k) => ({ i18n: `item.${k}` }),
}))

const icone = { name: 'RCIcon', props: ['nome', 'size'], template: '<i />' }
const FONTE = path.resolve('src/componentes/RCComercio.vue')

const oferta = (over = {}) => ({
  indice: 0,
  paga: [{ item: 'trigo', count: 4 }],
  recebe: { item: 'esmeralda', count: 1 },
  restam: 3,
  usos: 8,
  motivo: null,
  ...over,
})

const montar = (props = {}) =>
  mount(RCComercio, {
    props: { conversa: null, ofertas: [oferta()], icons: {}, ...props },
    global: { mocks: { t: (k) => k }, stubs: { RCIcon: icone } },
  })

describe('RCComercio', () => {
  it('⚠️ o cabeçalho NUNCA fica vazio', () => {
    // Aldeão sem persona não tem ofício, e o título saía string vazia: um `x`
    // solto sobre uma faixa cinza. Medido na sonda do menu, em 16/09.
    expect(montar().get('[data-test="rc-com-titulo"]').text()).toBe('roqueCraft.comercio.titulo')
    expect(
      montar({ conversa: { nome: 'Benedito', oficio: 'ferreiro', amizade: 10, humor: 'cordial' } })
        .get('[data-test="rc-com-titulo"]')
        .text(),
    ).toBe('roqueCraft.comercio.profissao.ferreiro')
  })

  it('sem ofertas, diz que não há nada — e não mostra lista vazia', () => {
    const w = montar({ ofertas: [] })
    expect(w.find('[data-test="rc-com-vazio"]').exists()).toBe(true)
    expect(w.find('[data-test="rc-com-linha"]').exists()).toBe(false)
  })

  it('o clique na troca emite o índice da oferta', async () => {
    const w = montar({ ofertas: [oferta({ indice: 2 })] })
    await w.get('[data-test="rc-com-trocar"]').trigger('click')
    expect(w.emitted('acao')[0]).toEqual(['trocar', 2])
  })

  it('⚠️ oferta impedida não é clicável, e DIZ o motivo', () => {
    // Um botão morto sem explicação lê como defeito do jogo.
    const w = montar({ ofertas: [oferta({ motivo: 'sem-pagamento' })] })
    const b = w.get('[data-test="rc-com-trocar"]')
    expect(b.attributes('disabled')).toBeDefined()
    expect(b.attributes('title')).toBe('roqueCraft.comercio.sem-pagamento')
  })

  it('o estoque fica à vista', () => {
    expect(montar().get('[data-test="rc-com-estoque"]').text()).toBe('3/8')
  })

  it('⚠️ a caixa de perguntar só existe quando há modelo atrás', () => {
    // Um campo que sempre devolve a mesma frase de tabela promete uma conversa
    // que não existe, e o jogador descobre na terceira pergunta.
    const base = { nome: 'B', oficio: 'ferreiro', amizade: 10, humor: 'cordial' }
    expect(montar({ conversa: base }).find('[data-test="rc-npc-pergunta"]').exists()).toBe(false)
    expect(
      montar({ conversa: { ...base, modelo: 'haiku' } })
        .find('[data-test="rc-npc-pergunta"]')
        .exists(),
    ).toBe(true)
  })

  it('perguntar emite o texto e ESVAZIA a caixa', async () => {
    const w = montar({
      conversa: { nome: 'B', oficio: 'ferreiro', amizade: 10, humor: 'cordial', modelo: 'haiku' },
    })
    const campo = w.get('[data-test="rc-npc-pergunta"]')
    await campo.setValue('  onde fica a vila?  ')
    await w.get('form').trigger('submit')
    expect(w.emitted('acao')[0]).toEqual(['perguntar', 'onde fica a vila?'])
    expect(campo.element.value).toBe('')
  })

  it('pergunta em branco não vira chamada de modelo', async () => {
    const w = montar({
      conversa: { nome: 'B', oficio: 'ferreiro', amizade: 10, humor: 'cordial', modelo: 'haiku' },
    })
    await w.get('[data-test="rc-npc-pergunta"]').setValue('   ')
    await w.get('form').trigger('submit')
    expect(w.emitted('acao')).toBeUndefined()
  })

  // ── O DESIGN SYSTEM, e ele é verificável ───────────────────────────────────

  it('⚠️ usa os primitivos do jogo: `rc-painel`, `rc-btn`, `rc-recuo`', () => {
    // Era isto que não acontecia. Enquanto o painel desenhava a própria borda e
    // o próprio botão, ele envelhecia sozinho: mudar a paleta do jogo em
    // `roquecraft.scss` não chegava aqui.
    const w = montar({ ofertas: [oferta()] })
    expect(w.get('[role="dialog"]').classes(), 'o painel não é `.rc-painel`').toContain('rc-painel')
    expect(w.get('.rc-com__x').classes(), 'o `x` não é `.rc-btn`').toContain('rc-btn')
    expect(w.get('[data-test="rc-com-linha"]').classes()).toContain('rc-recuo')
  })

  it('⚠️ não traz paleta nem fonte próprias — teto ZERO, não catraca', () => {
    // O defeito exato do relato: `#2b2b2b`, `#1a1a1a`, `#8b8b8b` e
    // `font-family: monospace` cravados no arquivo. Cor deste painel entra como
    // token `--rc-com-*` no topo do bloco, para ser achável; qualquer outra é
    // uma paleta nova nascendo.
    const css = fs.readFileSync(FONTE, 'utf8').split('<style')[1] ?? ''
    const semComentario = css.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
    const hex = [...semComentario.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0])
    const tokens = [...semComentario.matchAll(/--rc-com-[a-z-]+:\s*([^;]+);/g)].map((m) =>
      m[1].trim(),
    )
    const soltos = hex.filter((h) => !tokens.some((t) => t.includes(h)))
    expect(soltos, `cor crua fora dos tokens do painel: ${soltos.join(', ')}`).toEqual([])
    expect(/font-family/.test(semComentario), 'fonte própria de volta no painel').toBe(false)
  })
})
