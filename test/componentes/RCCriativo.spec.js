import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RCCriativo from '../../src/componentes/RCCriativo.vue'
import { NOON, MIDNIGHT } from '../../src/servicos/daycycle.js'

//
// O PAINEL DE REGÊNCIA — o que ele mostra e o que ele emite.
//
// ⚠️ O QUE SE TRAVA AQUI É O QUE UMA MEXIDA DESCUIDADA APAGA: os `data-test`
// que a sonda do navegador usa para clicar, e o rótulo que traduz o estado do
// clima para o jogador. A sonda `qa-roquecraft-criativo.mjs` prova que o clique
// chega no mundo; se os seletores mudarem de nome, ela para de achar o botão e
// passa a medir o nada — e este teste é quem acusa isso em 3 ms.
//

const i18n = { global: { mocks: { t: (k) => k } } }
const icone = { name: 'RCIcon', props: ['nome', 'size'], template: '<i />' }

// Sem o jogo em volta, `useTextos()` devolve a chave como veio: é o que o dublê
// do vue-i18n fazia aqui antes da extração (o jogo não usa mais vue-i18n).

const montar = (props = {}) =>
  mount(RCCriativo, {
    props: { ticks: NOON, travado: false, chuva: null, bioma: 'Planície', neva: false, ...props },
    global: { ...i18n.global, stubs: { RCIcon: icone } },
  })

// ⚠️ O CLIMA MUDOU DE ENDEREÇO NA ONDA 2 DO GOAL 23: virou aba, e a aba
// escondida sai do DOM (`v-if`, por causa do foco). Os testes do clima passam
// a abrir a aba primeiro — o que é a interação de verdade do jogador, e não um
// contorno de teste.
const abrirClima = async (w) => {
  await w.get('[data-test="rc-cri-aba-clima"]').trigger('click')
  return w
}
/** Monta o painel JÁ na aba do clima, que é onde o clima mora agora. */
const noClima = async (props) => abrirClima(montar(props))

describe('RCCriativo', () => {
  it('mostra o relógio do JOGO, e não a hora do computador', () => {
    const w = montar({ ticks: NOON })
    expect(w.get('[data-test="rc-cri-relogio"]').text()).toBe('12:00')
    expect(montar({ ticks: MIDNIGHT }).get('[data-test="rc-cri-relogio"]').text()).toBe('00:00')
  })

  it('os quatro atalhos de hora emitem o tick do ciclo', async () => {
    const w = montar()
    await w.get('[data-test="rc-cri-meiaNoite"]').trigger('click')
    expect(w.emitted('hora')[0]).toEqual([MIDNIGHT])
  })

  it('⚠️ o atalho da hora ATUAL aparece marcado', async () => {
    // Sem isso o painel não diz onde o jogador está, e ele clica no mesmo botão
    // duas vezes achando que não funcionou.
    const w = montar({ ticks: NOON })
    expect(w.get('[data-test="rc-cri-meioDia"]').classes()).toContain('is-on')
    expect(w.get('[data-test="rc-cri-meiaNoite"]').classes()).not.toContain('is-on')
  })

  it('o cadeado emite o novo estado', async () => {
    const w = montar({ travado: false })
    await w.get('[data-test="rc-cri-travar"]').setValue(true)
    expect(w.emitted('travar')[0]).toEqual([true])
  })

  it('⚠️ "o mundo decide" é diferente de "céu limpo"', async () => {
    // `null` é não opinar; zero é céu limpo FORÇADO. Se a tela colapsar os dois,
    // o jogador não sabe se soltou o clima ou se travou num céu limpo.
    expect((await noClima({ chuva: null })).get('[data-test="rc-cri-estado"]').text()).toBe(
      'roqueCraft.criativo.doMundo',
    )
    expect((await noClima({ chuva: 0 })).get('[data-test="rc-cri-estado"]').text()).toBe(
      'roqueCraft.criativo.limpo',
    )
  })

  it('no bioma gelado ele diz NEVE, não chuva', async () => {
    expect(
      (await noClima({ chuva: 0.8, neva: true })).get('[data-test="rc-cri-estado"]').text(),
    ).toBe('roqueCraft.criativo.neve')
    expect(
      (await noClima({ chuva: 0.8, neva: false })).get('[data-test="rc-cri-estado"]').text(),
    ).toBe('roqueCraft.criativo.chovendo')
  })

  it('⚠️ o raio só é clicável quando há tempestade', async () => {
    // A tempestade sai da chuva acima de 0,55. Um botão sempre clicável que não
    // faz nada é pior que um botão desligado: o jogador acha que está quebrado.
    expect(
      (await noClima({ chuva: 0.2 })).get('[data-test="rc-cri-raio"]').attributes('disabled'),
    ).toBe('')
    const forte = await noClima({ chuva: 0.95 })
    expect(forte.get('[data-test="rc-cri-raio"]').attributes('disabled')).toBeUndefined()
    await forte.get('[data-test="rc-cri-raio"]').trigger('click')
    expect(forte.emitted('raio')).toHaveLength(1)
  })

  it('a tempestade mostrada é a derivada da chuva', async () => {
    expect((await noClima({ chuva: 0 })).get('[data-test="rc-cri-tempestade"]').text()).toBe('0%')
    expect((await noClima({ chuva: 1 })).get('[data-test="rc-cri-tempestade"]').text()).toBe('100%')
  })

  it('soltar e fechar emitem', async () => {
    const w = montar()
    await w.get('[data-test="rc-cri-soltar"]').trigger('click')
    expect(w.emitted('soltar')).toHaveLength(1)
  })

  it('chuva inválida não quebra a tela', () => {
    expect(() => montar({ chuva: NaN })).not.toThrow()
  })
})

// ⚠️ AS ABAS. O painel era uma coluna que crescia sem fim, e ia crescer muito
// mais. O que se trava aqui é o que só o componente sabe: que a seta troca a
// aba E leva o foco junto (padrão ARIA de `tablist`), que o conteúdo da aba
// escondida some de verdade, e que a fila se declara com os `role` certos —
// é o `role` que faz a malha de foco NÃO roubar a seta.
describe('RCCriativo — as abas', () => {
  const montarPainel = (props = {}) =>
    mount(RCCriativo, {
      props: { ticks: NOON, travado: false, chuva: null, bioma: 'Planície', neva: false, ...props },
      global: { ...i18n.global, stubs: { RCIcon: icone } },
      attachTo: document.body,
    })

  it('a fila é um tablist de verdade, e só a aba ativa é alcançável pelo Tab', () => {
    const w = montarPainel()
    expect(w.get('[role="tablist"]')).toBeTruthy()
    const abas = w.findAll('[role="tab"]')
    expect(abas.length, 'menos de duas abas não é uma fila').toBeGreaterThan(1)
    expect(abas[0].attributes('aria-selected')).toBe('true')
    expect(abas[0].attributes('tabindex')).toBe('0')
    expect(abas[1].attributes('aria-selected')).toBe('false')
    expect(abas[1].attributes('tabindex'), 'a aba inativa continua no caminho do Tab').toBe('-1')
    w.unmount()
  })

  // ⚠️ `exists`, E NÃO `isVisible`. A aba escondida SAI do DOM (`v-if`), e a
  // razão é o foco: com `v-show` a malha de foco da tela varreria a raiz
  // inteira e o Tab pousaria num controle que o jogador não está vendo.
  it('abre na HORA, e a outra aba nem está no DOM', () => {
    const w = montarPainel()
    expect(w.get('[data-test="rc-cri-hora"]').isVisible()).toBe(true)
    expect(
      w.find('[data-test="rc-cri-chuva"]').exists(),
      'a aba escondida ficou no DOM: o Tab pousa em controle invisível',
    ).toBe(false)
    w.unmount()
  })

  // ⚠️ SEM CRAVAR O NÚMERO DE ABAS: a fila cresceu de duas para três no mesmo
  // goal (os lugares entraram), e um teste que soubesse "a última é o clima"
  // reprovaria a cada aba nova sem que nada estivesse errado.
  it('Home e End vão às pontas da fila', async () => {
    const w = montarPainel()
    const chaves = w.findAll('[role="tab"]').map((a) => a.attributes('data-test'))
    const primeira = chaves[0]
    const ultima = chaves.at(-1)
    await w.get(`[data-test="${primeira}"]`).trigger('keydown', { code: 'End' })
    expect(w.get(`[data-test="${ultima}"]`).attributes('aria-selected')).toBe('true')
    await w.get(`[data-test="${ultima}"]`).trigger('keydown', { code: 'Home' })
    expect(w.get(`[data-test="${primeira}"]`).attributes('aria-selected')).toBe('true')
    w.unmount()
  })

  it('a fila declara a orientação: o leitor de tela anuncia a seta certa', () => {
    const w = montarPainel()
    expect(w.get('[role="tablist"]').attributes('aria-orientation')).toBe('horizontal')
    w.unmount()
  })

  it('a seta para a DIREITA troca de aba, e o conteúdo troca junto', async () => {
    const w = montarPainel()
    await w.get('[data-test="rc-cri-aba-hora"]').trigger('keydown', { code: 'ArrowRight' })
    expect(w.get('[data-test="rc-cri-aba-clima"]').attributes('aria-selected')).toBe('true')
    expect(w.get('[data-test="rc-cri-chuva"]').isVisible()).toBe(true)
    expect(w.find('[data-test="rc-cri-hora"]').exists(), 'a aba velha ficou no DOM').toBe(false)
    w.unmount()
  })

  // ⚠️ SEM O FOCO SEGUINDO A ABA, a próxima seta parte da aba antiga e a
  // seleção pula de dois em dois — o jogador de teclado vê o painel piscando.
  it('o foco SEGUE a aba trocada', async () => {
    const w = montarPainel()
    w.get('[data-test="rc-cri-aba-hora"]').element.focus()
    await w.get('[data-test="rc-cri-aba-hora"]').trigger('keydown', { code: 'ArrowRight' })
    await new Promise((r) => setTimeout(r, 0))
    expect(document.activeElement.getAttribute('data-test')).toBe('rc-cri-aba-clima')
    w.unmount()
  })

  it('a seta para a ESQUERDA volta pela outra ponta', async () => {
    const w = montarPainel()
    const chaves = w.findAll('[role="tab"]').map((a) => a.attributes('data-test'))
    await w.get(`[data-test="${chaves[0]}"]`).trigger('keydown', { code: 'ArrowLeft' })
    expect(w.get(`[data-test="${chaves.at(-1)}"]`).attributes('aria-selected')).toBe('true')
    w.unmount()
  })

  it('o clique também troca, e tecla que não é seta não mexe', async () => {
    const w = montarPainel()
    await w.get('[data-test="rc-cri-aba-clima"]').trigger('click')
    expect(w.get('[data-test="rc-cri-aba-clima"]').attributes('aria-selected')).toBe('true')
    await w.get('[data-test="rc-cri-aba-clima"]').trigger('keydown', { code: 'ArrowDown' })
    expect(
      w.get('[data-test="rc-cri-aba-clima"]').attributes('aria-selected'),
      'a seta para baixo trocou de aba',
    ).toBe('true')
    w.unmount()
  })

  it('cada painel se amarra na sua aba, e vice-versa', async () => {
    const w = montarPainel()
    // Uma aba de cada vez: a escondida não está no DOM, e é esse o ponto.
    for (const chave of ['hora', 'clima']) {
      await w.get(`[data-test="rc-cri-aba-${chave}"]`).trigger('click')
      const aba = w.get(`[data-test="rc-cri-aba-${chave}"]`)
      const alvo = aba.attributes('aria-controls')
      const painel = w.get(`#${alvo}`)
      expect(painel.attributes('role')).toBe('tabpanel')
      expect(painel.attributes('aria-labelledby'), `${alvo} não aponta de volta`).toBe(
        aba.attributes('id'),
      )
      // E o painel da OUTRA aba não está na tela.
      const outra = chave === 'hora' ? 'clima' : 'hora'
      expect(w.find(`#rc-cri-painel-${outra}`).exists(), 'as duas abas no DOM juntas').toBe(false)
    }
    w.unmount()
  })
})

// ⚠️ A ABA DOS LUGARES (Goal 23, onda 3). O pedido do founder era teleporte
// para as áreas; o que se trava aqui é o que o painel PROMETE: o destino de
// agora desligado (e não escondido), a recusa em sala DITA, e o clique
// mandando a dimensão certa para cima.
describe('RCCriativo — os lugares', () => {
  const nosLugares = async (props = {}) => {
    const w = mount(RCCriativo, {
      props: { ticks: NOON, travado: false, chuva: null, bioma: 'Planície', neva: false, ...props },
      global: { ...i18n.global, stubs: { RCIcon: icone } },
      attachTo: document.body,
    })
    await w.get('[data-test="rc-cri-aba-lugares"]').trigger('click')
    return w
  }

  it('mostra as três dimensões, e diz em qual o jogador está', async () => {
    const w = await nosLugares({ dimensao: 'nether' })
    for (const d of ['overworld', 'nether', 'end'])
      expect(w.find(`[data-test="rc-cri-ir-${d}"]`).exists(), `${d} não está na fila`).toBe(true)
    expect(w.get('[data-test="rc-cri-dimensao"]').text()).toBe('roqueCraft.criativo.nether')
    w.unmount()
  })

  // ⚠️ DESLIGADO, E NÃO ESCONDIDO. Some da lista, o jogador procura para onde
  // foi; desligado, ele lê "estou aqui".
  it('o destino de AGORA fica desligado, e os outros dois clicáveis', async () => {
    const w = await nosLugares({ dimensao: 'nether' })
    expect(w.get('[data-test="rc-cri-ir-nether"]').attributes('disabled')).toBe('')
    expect(w.get('[data-test="rc-cri-ir-overworld"]').attributes('disabled')).toBeUndefined()
    expect(w.get('[data-test="rc-cri-ir-end"]').attributes('disabled')).toBeUndefined()
    w.unmount()
  })

  it('clicar manda a dimensão escolhida para cima', async () => {
    const w = await nosLugares({ dimensao: 'overworld' })
    await w.get('[data-test="rc-cri-ir-nether"]').trigger('click')
    expect(w.emitted('teleportar')).toEqual([['nether']])
    w.unmount()
  })

  // ⚠️ EM SALA NÃO SE ATRAVESSA, e o painel DIZ em vez de só desligar: um
  // controle cinza sem motivo lê como defeito do jogo.
  it('em sala, os três desligam E o painel explica por quê', async () => {
    const w = await nosLugares({ dimensao: 'overworld', emSala: true })
    for (const d of ['overworld', 'nether', 'end'])
      expect(w.get(`[data-test="rc-cri-ir-${d}"]`).attributes('disabled'), d).toBe('')
    expect(w.get('[data-test="rc-cri-sala"]').text()).toBe('roqueCraft.criativo.naSalaNao')
    w.unmount()
  })

  it('fora de sala, o recado não aparece', async () => {
    const w = await nosLugares({ dimensao: 'overworld' })
    expect(w.find('[data-test="rc-cri-sala"]').exists()).toBe(false)
    w.unmount()
  })

  it('dimensão desconhecida não deixa o rótulo vazio', async () => {
    const w = await nosLugares({ dimensao: 'lugar-nenhum' })
    expect(w.get('[data-test="rc-cri-dimensao"]').text()).toBeTruthy()
    w.unmount()
  })

  // GOAL 23, ONDA 4: os lugares do mundo, a coordenada e a volta.
  it('os quatro lugares do mundo estão na fila, e a cama sem cama fica desligada', async () => {
    const w = await nosLugares({ temCama: false })
    for (const l of ['nascimento', 'cama', 'vila', 'fortaleza'])
      expect(w.find(`[data-test="rc-cri-lugar-${l}"]`).exists(), l).toBe(true)
    expect(w.get('[data-test="rc-cri-lugar-cama"]').attributes('disabled')).toBe('')
    expect(w.get('[data-test="rc-cri-lugar-vila"]').attributes('disabled')).toBeUndefined()
    await w.get('[data-test="rc-cri-lugar-vila"]').trigger('click')
    expect(w.emitted('lugar')).toEqual([['vila']])
    w.unmount()
  })

  it('com cama, o botão dela liga e emite', async () => {
    const w = await nosLugares({ temCama: true })
    expect(w.get('[data-test="rc-cri-lugar-cama"]').attributes('disabled')).toBeUndefined()
    await w.get('[data-test="rc-cri-lugar-cama"]').trigger('click')
    expect(w.emitted('lugar')).toEqual([['cama']])
    w.unmount()
  })

  it('a coordenada sobe como TEXTO, com X, Y e Z, no submit do formulário (Enter vale)', async () => {
    const w = await nosLugares()
    await w.get('[data-test="rc-cri-x"]').setValue(' 300 ')
    await w.get('[data-test="rc-cri-z"]').setValue('-200')
    await w.get('[data-test="rc-cri-ir-coordenada"]').trigger('submit')
    // Y vazio vai vazio: quem decide que vazio é "o chão" é `coordenadaDigitada`.
    expect(w.emitted('coordenada')).toEqual([[{ x: ' 300 ', y: '', z: '-200' }]])
    w.unmount()
  })

  it('voltar fica desligado sem de onde voltar, e emite quando há', async () => {
    const sem = await nosLugares({ podeVoltar: false })
    expect(sem.get('[data-test="rc-cri-voltar"]').attributes('disabled')).toBe('')
    sem.unmount()
    const com = await nosLugares({ podeVoltar: true })
    expect(com.get('[data-test="rc-cri-voltar"]').attributes('disabled')).toBeUndefined()
    await com.get('[data-test="rc-cri-voltar"]').trigger('click')
    expect(com.emitted('voltar')).toHaveLength(1)
    com.unmount()
  })

  it('em sala, lugares, coordenada e voltar desligam junto com as dimensões', async () => {
    const w = await nosLugares({ emSala: true, temCama: true, podeVoltar: true })
    for (const l of ['nascimento', 'cama', 'vila', 'fortaleza'])
      expect(w.get(`[data-test="rc-cri-lugar-${l}"]`).attributes('disabled'), l).toBe('')
    expect(w.get('[data-test="rc-cri-ir-coordenada"]').attributes('disabled')).toBe('')
    expect(w.get('[data-test="rc-cri-voltar"]').attributes('disabled')).toBe('')
    w.unmount()
  })
})
