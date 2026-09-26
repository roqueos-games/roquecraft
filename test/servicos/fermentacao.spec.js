import { describe, it, expect } from 'vitest'
import {
  AGUA,
  ESTRANHA,
  FERMENTACOES,
  POCOES,
  EFEITO_DA_POCAO,
  ehPocao,
  efeitoDe,
  fermentar,
  ehIngrediente,
  avancarSuporte,
  fracaoDaFermentada,
  SEGUNDOS_POR_FERMENTADA,
  MODIFICADORES,
  modificar,
  fermentarGarrafa,
  doseDe,
  codigoDaPocao,
  pocaoDoCodigo,
} from '../../src/servicos/fermentacao.js'
import { NOMES_DE_EFEITO } from '../../src/servicos/efeitos.js'

const suporte = (ingrediente = null, garrafas = [null, null, null]) => ({
  tipo: 'suporte',
  ingrediente,
  garrafas: [...garrafas],
  progresso: 0,
})
const item = (k, n = 1) => ({ item: k, count: n })

describe('a tabela', () => {
  it('todo efeito de poção existe no catálogo de efeitos', () => {
    for (const [pocao, efeito] of Object.entries(EFEITO_DA_POCAO)) {
      if (efeito === null) continue
      expect(NOMES_DE_EFEITO, `poção ${pocao}`).toContain(efeito)
    }
  })

  it('toda saída de fermentação é uma poção do catálogo', () => {
    for (const [, , saida] of FERMENTACOES) expect(POCOES).toContain(saida)
  })

  it('a água NÃO é poção: ela não se bebe', () => {
    expect(ehPocao(AGUA)).toBe(false)
    expect(efeitoDe(AGUA)).toBe(null)
  })

  it('a estranha é poção e não faz nada — como no original', () => {
    expect(ehPocao(ESTRANHA)).toBe(true)
    expect(efeitoDe(ESTRANHA)).toBe(null)
  })

  it('toda poção fora a estranha entrega algum efeito', () => {
    for (const p of POCOES) {
      if (p === ESTRANHA) continue
      expect(efeitoDe(p), p).toBeTruthy()
    }
  })

  it('item que não é poção não vira efeito por engano', () => {
    expect(ehPocao('stone')).toBe(false)
    expect(efeitoDe('stone')).toBe(null)
    // ⚠️ `hasOwnProperty` e não `in`: com `in`, 'toString' passaria por poção.
    expect(ehPocao('toString')).toBe(false)
    expect(ehPocao('constructor')).toBe(false)
  })

  it('a água não vira poção direto — o degrau da verruga é obrigatório', () => {
    for (const [, ingrediente] of FERMENTACOES) {
      if (ingrediente === 'nether_wart') continue
      expect(fermentar(AGUA, ingrediente), ingrediente).toBe(null)
    }
    expect(fermentar(AGUA, 'nether_wart')).toBe(ESTRANHA)
  })

  it('o olho fermentado CORROMPE poção pronta, não fabrica do zero', () => {
    expect(fermentar(ESTRANHA, 'fermented_spider_eye')).toBe(null)
    expect(fermentar('pocao_velocidade', 'fermented_spider_eye')).toBe('pocao_lentidao')
    expect(fermentar('pocao_cura', 'fermented_spider_eye')).toBe('pocao_dano')
  })

  it('par desconhecido devolve null, e null é resposta e não erro', () => {
    expect(fermentar(ESTRANHA, 'stone')).toBe(null)
    expect(fermentar('stone', 'sugar')).toBe(null)
    expect(fermentar(null, 'sugar')).toBe(null)
    expect(fermentar(ESTRANHA, null)).toBe(null)
  })

  it('ehIngrediente conhece os ingredientes e só eles', () => {
    expect(ehIngrediente('sugar')).toBe(true)
    expect(ehIngrediente('nether_wart')).toBe(true)
    expect(ehIngrediente('stone')).toBe(false)
    expect(ehIngrediente(ESTRANHA)).toBe(false)
  })
})

describe('o suporte', () => {
  it('sem ingrediente não anda', () => {
    const s = suporte(null, [item(AGUA), null, null])
    expect(avancarSuporte(s, 1)).toBe(false)
    expect(s.progresso).toBe(0)
  })

  it('sem garrafa não anda', () => {
    const s = suporte(item('nether_wart'))
    expect(avancarSuporte(s, 1)).toBe(false)
  })

  it('par que não fermenta não anda', () => {
    const s = suporte(item('sugar'), [item(AGUA), null, null])
    expect(avancarSuporte(s, 1)).toBe(false)
    expect(s.progresso).toBe(0)
  })

  it('com trabalho, o progresso anda e a fração acompanha', () => {
    const s = suporte(item('nether_wart'), [item(AGUA), null, null])
    expect(avancarSuporte(s, SEGUNDOS_POR_FERMENTADA / 2)).toBe(true)
    expect(fracaoDaFermentada(s)).toBeCloseTo(0.5)
    expect(s.garrafas[0].item).toBe(AGUA)
  })

  it('ao completar, converte e consome UM ingrediente', () => {
    const s = suporte(item('nether_wart', 3), [item(AGUA), null, null])
    avancarSuporte(s, SEGUNDOS_POR_FERMENTADA)
    expect(s.garrafas[0]).toEqual({ item: ESTRANHA, count: 1 })
    expect(s.ingrediente.count).toBe(2)
    expect(s.progresso).toBe(0)
  })

  it('UM ingrediente converte ATÉ TRÊS garrafas', () => {
    // ⚠️ É o que faz valer a pena encher o suporte antes de ligar. Um por
    // garrafa tornaria o suporte um lugar onde se espera três vezes.
    const s = suporte(item('nether_wart'), [item(AGUA), item(AGUA), item(AGUA)])
    avancarSuporte(s, SEGUNDOS_POR_FERMENTADA)
    expect(s.garrafas.map((g) => g?.item)).toEqual([ESTRANHA, ESTRANHA, ESTRANHA])
    expect(s.ingrediente).toBe(null)
  })

  it('converte só as garrafas que aceitam aquele ingrediente', () => {
    const s = suporte(item('sugar'), [item(ESTRANHA), item(AGUA), null])
    avancarSuporte(s, SEGUNDOS_POR_FERMENTADA)
    expect(s.garrafas[0].item).toBe('pocao_velocidade')
    expect(s.garrafas[1].item).toBe(AGUA) // água não aceita açúcar
    expect(s.garrafas[2]).toBe(null)
  })

  it('a saída é SEMPRE uma garrafa — pilha de três não vira três poções', () => {
    const s = suporte(item('nether_wart'), [item(AGUA, 3), null, null])
    avancarSuporte(s, SEGUNDOS_POR_FERMENTADA)
    expect(s.garrafas[0]).toEqual({ item: ESTRANHA, count: 1 })
  })

  it('tirar o ingrediente ZERA o progresso — o relógio não se engana', () => {
    // Sem isto, tirar no segundo 19 e pôr outro faria a nova fermentada sair no
    // segundo 20.
    const s = suporte(item('nether_wart'), [item(AGUA), null, null])
    avancarSuporte(s, SEGUNDOS_POR_FERMENTADA - 1)
    expect(s.progresso).toBeGreaterThan(0)
    s.ingrediente = null
    expect(avancarSuporte(s, 0.1)).toBe(true)
    expect(s.progresso).toBe(0)
  })

  it('a soma de passos pequenos não custa um passo a mais', () => {
    // ⚠️ O PASSO DESTE TESTE É 0,02 E ISSO FOI MEDIDO, não escolhido.
    //
    // A primeira versão somava 0,1 duzentas vezes achando que daria 19,999… —
    // e dá 20,000000000000014, ACIMA do alvo. O mutante que tirava a tolerância
    // passou verde, e o teste era decoração.
    //
    // Varrendo os passos que dividem 20 exatamente, ONZE caem abaixo por erro de
    // ponto flutuante, e entre eles estão 0,0666… e 0,02 — tempos de quadro
    // reais. Com 0,02 a soma dá 19,999999999999662: sem a tolerância, CADA
    // fermentada custa um passo a mais, sempre, e a conta que o jogador faz
    // ("um carvão rende oito") passa a mentir. É o mesmo defeito que a fornalha
    // teve com a fundida.
    const s = suporte(item('nether_wart'), [item(AGUA), null, null])
    for (let i = 0; i < SEGUNDOS_POR_FERMENTADA * 50; i++) avancarSuporte(s, 0.02)
    expect(s.garrafas[0].item).toBe(ESTRANHA)
  })

  it('a cadeia inteira: água → estranha → velocidade → lentidão', () => {
    const s = suporte(item('nether_wart'), [item(AGUA), null, null])
    avancarSuporte(s, SEGUNDOS_POR_FERMENTADA)
    expect(s.garrafas[0].item).toBe(ESTRANHA)
    s.ingrediente = item('sugar')
    avancarSuporte(s, SEGUNDOS_POR_FERMENTADA)
    expect(s.garrafas[0].item).toBe('pocao_velocidade')
    s.ingrediente = item('fermented_spider_eye')
    avancarSuporte(s, SEGUNDOS_POR_FERMENTADA)
    expect(s.garrafas[0].item).toBe('pocao_lentidao')
    // e a lentidão não fermenta mais nada
    s.ingrediente = item('fermented_spider_eye')
    expect(avancarSuporte(s, SEGUNDOS_POR_FERMENTADA)).toBe(false)
  })

  it('mobília de outro tipo não é suporte', () => {
    expect(avancarSuporte({ tipo: 'fornalha' }, 1)).toBe(false)
    expect(avancarSuporte(null, 1)).toBe(false)
    expect(fracaoDaFermentada({ tipo: 'bau' })).toBe(0)
    expect(fracaoDaFermentada(null)).toBe(0)
  })
})

//
// OS MODIFICADORES — nível II, prazo dobrado, arremessável (Goal 21, Onda 4).
//
// Não são itens: são o campo `pocao` da pilha. O que se prova aqui é a regra
// de quem aceita o quê, e que o suporte carrega o campo até a garrafa.
describe('os modificadores', () => {
  it('os três ingredientes são ingredientes', () => {
    for (const i of Object.keys(MODIFICADORES)) expect(ehIngrediente(i), i).toBe(true)
  })

  it('glowstone dá nível II a quem tem nível II; a respiração (nível 1) recusa', () => {
    expect(modificar(item('pocao_velocidade'), 'glowstone_dust')).toEqual({
      item: 'pocao_velocidade',
      count: 1,
      pocao: { nivel: 2 },
    })
    expect(modificar(item('pocao_cura'), 'glowstone_dust').pocao).toEqual({ nivel: 2 })
    expect(modificar(item('pocao_respiracao'), 'glowstone_dust')).toBe(null)
  })

  it('redstone dobra o prazo; o instantâneo não se estica', () => {
    expect(modificar(item('pocao_forca'), 'redstone').pocao).toEqual({ longa: true })
    expect(modificar(item('pocao_cura'), 'redstone')).toBe(null)
    expect(modificar(item('pocao_dano'), 'redstone')).toBe(null)
  })

  it('⚠️ nível II e prazo dobrado NÃO se somam, e nada se aplica duas vezes', () => {
    const ii = { item: 'pocao_forca', count: 1, pocao: { nivel: 2 } }
    expect(modificar(ii, 'redstone')).toBe(null)
    expect(modificar(ii, 'glowstone_dust')).toBe(null)
    const longa = { item: 'pocao_forca', count: 1, pocao: { longa: true } }
    expect(modificar(longa, 'glowstone_dust')).toBe(null)
    expect(modificar(longa, 'redstone')).toBe(null)
  })

  it('pólvora torna arremessável qualquer poção com efeito, uma vez; a estranha e a água não', () => {
    expect(modificar(item('pocao_veneno'), 'gunpowder').pocao).toEqual({ splash: true })
    expect(
      modificar({ item: 'pocao_forca', count: 1, pocao: { nivel: 2 } }, 'gunpowder').pocao,
    ).toEqual({ nivel: 2, splash: true })
    expect(modificar({ item: 'pocao_forca', count: 1, pocao: { splash: true } }, 'gunpowder')).toBe(
      null,
    )
    expect(modificar(item(ESTRANHA), 'gunpowder')).toBe(null)
    expect(modificar(item(AGUA), 'gunpowder')).toBe(null)
  })

  it('fermentarGarrafa: a tabela base primeiro, o modificador depois, null quando nada', () => {
    expect(fermentarGarrafa(item(ESTRANHA), 'sugar')).toEqual({
      item: 'pocao_velocidade',
      count: 1,
    })
    expect(fermentarGarrafa(item('pocao_velocidade'), 'redstone').pocao).toEqual({ longa: true })
    expect(fermentarGarrafa(item('pocao_velocidade'), 'stone')).toBe(null)
    expect(fermentarGarrafa(null, 'sugar')).toBe(null)
  })

  it('a dose: nível II corta o prazo pela metade, o prazo dobrado dobra', () => {
    expect(doseDe('pocao_velocidade')).toEqual({
      efeito: 'velocidade',
      nivel: 1,
      duracao: 180,
      splash: false,
    })
    expect(doseDe('pocao_velocidade', { nivel: 2 })).toMatchObject({ nivel: 2, duracao: 90 })
    expect(doseDe('pocao_velocidade', { longa: true })).toMatchObject({ nivel: 1, duracao: 360 })
    expect(doseDe('pocao_cura', { nivel: 2, splash: true })).toEqual({
      efeito: 'cura',
      nivel: 2,
      duracao: 0,
      splash: true,
    })
    expect(doseDe(ESTRANHA)).toBe(null)
    expect(doseDe('stone')).toBe(null)
  })

  it('o código do save vai e volta', () => {
    for (const p of [
      { nivel: 2 },
      { longa: true },
      { splash: true },
      { nivel: 2, splash: true },
      { longa: true, splash: true },
    ]) {
      expect(pocaoDoCodigo(codigoDaPocao(p)), JSON.stringify(p)).toEqual(p)
    }
    expect(codigoDaPocao(null)).toBe(null)
    expect(codigoDaPocao({})).toBe(null)
    expect(pocaoDoCodigo('')).toBe(null)
    expect(pocaoDoCodigo(7)).toBe(null)
  })

  it('⚠️ o suporte CARREGA o campo até a garrafa, e o ingrediente sai', () => {
    const s = suporte(item('glowstone_dust'), [item('pocao_forca'), null, item('pocao_respiracao')])
    avancarSuporte(s, SEGUNDOS_POR_FERMENTADA)
    expect(s.garrafas[0]).toEqual({ item: 'pocao_forca', count: 1, pocao: { nivel: 2 } })
    expect(s.garrafas[2], 'a respiração não tem nível II, fica como está').toEqual(
      item('pocao_respiracao'),
    )
    expect(s.ingrediente).toBe(null)
  })
})

//
// O SUPORTE COMO MOBÍLIA — save, clique e esvaziamento.
//
// `mobilia.js` é quem guarda; aqui se prova que o terceiro tipo entrou nos três
// caminhos que já existiam. O baú e a fornalha ganharam cada um desses por um
// defeito: conteúdo evaporando ao quebrar, e save que esquecia o que havia
// dentro. Um tipo novo que só entra em dois dos três repete o defeito com
// nome novo.
describe('o suporte dentro da mobília', () => {
  it('esvaziar devolve ingrediente E garrafas — nada evapora', async () => {
    const { criarMobilia, abrirMobilia, esvaziarMobilia } = await import(
      '../../src/servicos/mobilia.js'
    )
    const m = criarMobilia()
    const e = abrirMobilia(m, 1, 2, 3, 'suporte')
    e.ingrediente = item('nether_wart', 4)
    e.garrafas[0] = item(ESTRANHA)
    e.garrafas[2] = item(AGUA)
    const fora = esvaziarMobilia(m, 1, 2, 3)
    expect(fora.map((f) => f.item).sort()).toEqual(['nether_wart', ESTRANHA, AGUA].sort())
  })

  it('vai e volta pelo save, com o progresso', async () => {
    const { criarMobilia, abrirMobilia, serializarMobilia, desserializarMobilia, mobiliaEm } =
      await import('../../src/servicos/mobilia.js')
    const m = criarMobilia()
    const e = abrirMobilia(m, 4, 5, 6, 'suporte')
    e.ingrediente = item('sugar', 2)
    e.garrafas[1] = item(ESTRANHA)
    e.progresso = 7.25
    const volta = desserializarMobilia(serializarMobilia(m))
    const s = mobiliaEm(volta, 4, 5, 6)
    expect(s.tipo).toBe('suporte')
    expect(s.ingrediente).toEqual({ item: 'sugar', count: 2 })
    expect(s.garrafas[1]).toEqual({ item: ESTRANHA, count: 1 })
    expect(s.garrafas[0]).toBe(null)
    expect(s.progresso).toBeCloseTo(7.25)
  })

  it('a poção modificada deixada no suporte volta do save com o campo', async () => {
    const { criarMobilia, abrirMobilia, serializarMobilia, desserializarMobilia, mobiliaEm } =
      await import('../../src/servicos/mobilia.js')
    const m = criarMobilia()
    const e = abrirMobilia(m, 1, 2, 3, 'suporte')
    e.garrafas[2] = { item: 'pocao_cura', count: 1, pocao: { nivel: 2, splash: true } }
    const s = mobiliaEm(
      desserializarMobilia(JSON.parse(JSON.stringify(serializarMobilia(m)))),
      1,
      2,
      3,
    )
    expect(s.garrafas[2]).toEqual({
      item: 'pocao_cura',
      count: 1,
      pocao: { nivel: 2, splash: true },
    })
  })

  it('suporte vazio NÃO ocupa save', async () => {
    const { criarMobilia, abrirMobilia, serializarMobilia } = await import(
      '../../src/servicos/mobilia.js'
    )
    const m = criarMobilia()
    abrirMobilia(m, 0, 0, 0, 'suporte')
    expect(serializarMobilia(m)).toEqual([])
  })

  it('o clique: índice 0 é o ingrediente, 1..3 são as garrafas', async () => {
    const { cliqueNaMobilia } = await import('../../src/servicos/mobilia.js')
    const e = { tipo: 'suporte', ingrediente: null, garrafas: [null, null, null], progresso: 0 }
    const inv = new Array(9).fill(null)
    const r0 = cliqueNaMobilia(e, {
      index: 0,
      button: 'left',
      cursor: item('nether_wart', 3),
      inventario: inv,
    })
    expect(e.ingrediente).toEqual({ item: 'nether_wart', count: 3 })
    expect(r0.cursor).toBe(null)
    cliqueNaMobilia(e, { index: 2, button: 'left', cursor: item(AGUA), inventario: inv })
    expect(e.garrafas[1]).toEqual({ item: AGUA, count: 1 })
    expect(e.garrafas[0]).toBe(null)
    // e a garrafa volta pro cursor
    const r = cliqueNaMobilia(e, { index: 2, button: 'left', cursor: null, inventario: inv })
    expect(r.cursor).toEqual({ item: AGUA, count: 1 })
    expect(e.garrafas[1]).toBe(null)
  })

  it('o suporte anda junto com as fornalhas no passo do mundo', async () => {
    const { criarMobilia, abrirMobilia, avancarMobilia } = await import(
      '../../src/servicos/mobilia.js'
    )
    const m = criarMobilia()
    const e = abrirMobilia(m, 9, 9, 9, 'suporte')
    e.ingrediente = item('nether_wart')
    e.garrafas[0] = item(AGUA)
    expect(avancarMobilia(m, SEGUNDOS_POR_FERMENTADA)).toBe(1)
    expect(e.garrafas[0].item).toBe(ESTRANHA)
  })
})
