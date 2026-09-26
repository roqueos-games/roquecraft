import { describe, it, expect } from 'vitest'
import {
  EFEITOS,
  NOMES_DE_EFEITO,
  criarEfeitos,
  aplicarEfeito,
  nivelDe,
  restanteDe,
  efeitosAtivos,
  passoDosEfeitos,
  limparEfeitos,
  multiplicadorDeVelocidade,
  bonusDeForca,
  fatorDeFolego,
  pontosInstantaneos,
  intervaloDoTique,
  INTERVALO_DO_TIQUE,
  efeitosParaSave,
  efeitosDoSave,
  maxNivelDe,
  ehInstantaneo,
  duracaoPadrao,
  FATOR_DE_PRAZO,
  tiqueDeEfeitos,
} from '../../src/servicos/efeitos.js'

describe('o catálogo', () => {
  it('todo efeito tem prazo OU é instantâneo, nunca os dois nem nenhum', () => {
    for (const nome of NOMES_DE_EFEITO) {
      const d = EFEITOS[nome]
      expect(!!d.instantaneo !== d.duracao > 0).toBe(true)
    }
  })

  it('todo efeito tem nível máximo de pelo menos 1', () => {
    for (const nome of NOMES_DE_EFEITO) expect(maxNivelDe(nome)).toBeGreaterThanOrEqual(1)
  })

  it('nome desconhecido não inventa prazo nem nível', () => {
    expect(maxNivelDe('voar')).toBe(0)
    expect(duracaoPadrao('voar')).toBe(0)
    expect(ehInstantaneo('voar')).toBe(false)
  })
})

describe('aplicar e expirar', () => {
  it('põe o efeito com o prazo do catálogo', () => {
    const e = criarEfeitos()
    expect(aplicarEfeito(e, 'velocidade')).toBe(true)
    expect(nivelDe(e, 'velocidade')).toBe(1)
    expect(restanteDe(e, 'velocidade')).toBe(EFEITOS.velocidade.duracao)
  })

  it('instantâneo NUNCA entra no mapa — ele acontece e acaba', () => {
    const e = criarEfeitos()
    expect(aplicarEfeito(e, 'cura', 2)).toBe(false)
    expect(Object.keys(e)).toEqual([])
  })

  it('nome desconhecido não entra', () => {
    const e = criarEfeitos()
    expect(aplicarEfeito(e, 'voar')).toBe(false)
    expect(Object.keys(e)).toEqual([])
  })

  it('o nível é preso ao máximo do catálogo', () => {
    const e = criarEfeitos()
    aplicarEfeito(e, 'velocidade', 99)
    expect(nivelDe(e, 'velocidade')).toBe(EFEITOS.velocidade.maxNivel)
  })

  it('renovar é o MAIOR prazo, nunca a soma', () => {
    // Somar deixaria estocar dez poções e andar meia hora depressa.
    const e = criarEfeitos()
    aplicarEfeito(e, 'velocidade', 1, 100)
    aplicarEfeito(e, 'velocidade', 1, 40)
    expect(restanteDe(e, 'velocidade')).toBe(100)
    aplicarEfeito(e, 'velocidade', 1, 160)
    expect(restanteDe(e, 'velocidade')).toBe(160)
  })

  it('nível maior substitui; nível menor não derruba o maior', () => {
    const e = criarEfeitos()
    aplicarEfeito(e, 'velocidade', 2, 100)
    expect(aplicarEfeito(e, 'velocidade', 1, 999)).toBe(false)
    expect(nivelDe(e, 'velocidade')).toBe(2)
    expect(restanteDe(e, 'velocidade')).toBe(100)
    expect(aplicarEfeito(e, 'velocidade', 2, 999)).toBe(true)
    expect(restanteDe(e, 'velocidade')).toBe(999)
  })

  it('prazo zero ou negativo não entra', () => {
    const e = criarEfeitos()
    expect(aplicarEfeito(e, 'velocidade', 1, 0)).toBe(false)
    expect(aplicarEfeito(e, 'velocidade', 1, -5)).toBe(false)
    expect(Object.keys(e)).toEqual([])
  })

  it('o passo desconta e APAGA a chave ao acabar', () => {
    const e = criarEfeitos()
    aplicarEfeito(e, 'velocidade', 1, 1)
    expect(passoDosEfeitos(e, 0.4)).toEqual([])
    expect(nivelDe(e, 'velocidade')).toBe(1)
    expect(passoDosEfeitos(e, 0.7)).toEqual(['velocidade'])
    // ⚠️ A CHAVE SOME. Guardar `{nivel:1, restante:0}` faria `nivelDe` responder
    // 1 pra um efeito que acabou, e o jogador ficaria rápido pra sempre.
    expect(Object.prototype.hasOwnProperty.call(e, 'velocidade')).toBe(false)
    expect(nivelDe(e, 'velocidade')).toBe(0)
  })

  it('vários efeitos correm ao mesmo tempo e expiram cada um no seu prazo', () => {
    const e = criarEfeitos()
    aplicarEfeito(e, 'velocidade', 1, 1)
    aplicarEfeito(e, 'forca', 1, 3)
    expect(passoDosEfeitos(e, 1.5)).toEqual(['velocidade'])
    expect(nivelDe(e, 'forca')).toBe(1)
    expect(passoDosEfeitos(e, 2)).toEqual(['forca'])
    expect(efeitosAtivos(e)).toEqual([])
  })

  it('ativos sai ordenado, pra interface não pular de lugar', () => {
    const e = criarEfeitos()
    aplicarEfeito(e, 'veneno', 1, 10)
    aplicarEfeito(e, 'forca', 2, 20)
    expect(efeitosAtivos(e).map((a) => a.nome)).toEqual(['forca', 'veneno'])
    expect(efeitosAtivos(e)[0]).toEqual({ nome: 'forca', nivel: 2, restante: 20 })
  })

  it('limpar esvazia o MESMO objeto (a morte não troca a referência)', () => {
    const e = criarEfeitos()
    aplicarEfeito(e, 'veneno')
    expect(limparEfeitos(e)).toBe(e)
    expect(efeitosAtivos(e)).toEqual([])
  })
})

describe('as mordidas', () => {
  it('sem efeito nenhum, tudo é neutro', () => {
    const e = criarEfeitos()
    expect(multiplicadorDeVelocidade(e)).toBe(1)
    expect(bonusDeForca(e)).toBe(0)
    expect(fatorDeFolego(e)).toBe(1)
  })

  it('velocidade acelera e lentidão freia', () => {
    const rapido = criarEfeitos()
    aplicarEfeito(rapido, 'velocidade', 2)
    expect(multiplicadorDeVelocidade(rapido)).toBeCloseTo(1.4)
    const lento = criarEfeitos()
    aplicarEfeito(lento, 'lentidao', 2)
    expect(multiplicadorDeVelocidade(lento)).toBeCloseTo(0.7)
  })

  it('as duas juntas dão um número NO MEIO, não uma delas vencendo', () => {
    // ⚠️ Se fosse um `if` escolhendo uma das duas, a poção ruim viraria
    // interruptor: beber velocidade II com lentidão I daria "lento", e não
    // "quase normal".
    const e = criarEfeitos()
    aplicarEfeito(e, 'velocidade', 2)
    aplicarEfeito(e, 'lentidao', 1)
    const m = multiplicadorDeVelocidade(e)
    expect(m).toBeGreaterThan(1)
    expect(m).toBeLessThan(1.4)
  })

  it('o multiplicador nunca chega a zero — parar o jogador não é efeito, é trava', () => {
    const e = { lentidao: { nivel: 99, restante: 10 } }
    expect(multiplicadorDeVelocidade(e)).toBeGreaterThan(0)
  })

  it('força soma no golpe e cresce com o nível', () => {
    const um = criarEfeitos()
    aplicarEfeito(um, 'forca', 1)
    const dois = criarEfeitos()
    aplicarEfeito(dois, 'forca', 2)
    expect(bonusDeForca(dois)).toBeGreaterThan(bonusDeForca(um))
    expect(bonusDeForca(um)).toBeGreaterThan(0)
  })

  it('respiração faz o fôlego render mais, sem zerar o consumo', () => {
    const e = criarEfeitos()
    aplicarEfeito(e, 'respiracao', 1)
    const f = fatorDeFolego(e)
    expect(f).toBeLessThan(1)
    expect(f).toBeGreaterThan(0)
  })

  it('instantâneo cura mais com nível maior', () => {
    expect(pontosInstantaneos(2)).toBeGreaterThan(pontosInstantaneos(1))
    expect(pontosInstantaneos(0)).toBe(pontosInstantaneos(1))
  })

  it('nível maior tica mais rápido', () => {
    expect(intervaloDoTique(1)).toBe(INTERVALO_DO_TIQUE)
    expect(intervaloDoTique(2)).toBeLessThan(intervaloDoTique(1))
    expect(intervaloDoTique(2)).toBeGreaterThan(0)
  })
})

describe('save', () => {
  it('mapa vazio não ocupa save', () => {
    expect(efeitosParaSave(criarEfeitos())).toBe(null)
    expect(efeitosParaSave(null)).toBe(null)
  })

  it('vai e volta inteiro', () => {
    const e = criarEfeitos()
    aplicarEfeito(e, 'velocidade', 2, 100)
    aplicarEfeito(e, 'veneno', 1, 12.34)
    const pares = efeitosParaSave(e)
    expect(pares).toEqual([
      ['velocidade', 2, 100],
      ['veneno', 1, 12.3],
    ])
    const volta = efeitosDoSave(pares)
    expect(nivelDe(volta, 'velocidade')).toBe(2)
    expect(restanteDe(volta, 'veneno')).toBeCloseTo(12.3)
  })

  it('save sujo não vira efeito: nome morto, nível absurdo, prazo eterno', () => {
    const volta = efeitosDoSave([
      ['voar', 1, 100],
      ['cura', 1, 100],
      ['velocidade', 99, 1e9],
      ['veneno', 1, -3],
      ['forca'],
      'lixo',
    ])
    expect(Object.keys(volta).sort()).toEqual(['velocidade'])
    expect(nivelDe(volta, 'velocidade')).toBe(maxNivelDe('velocidade'))
    // ⚠️ O PRAZO É PRESO AO TETO. Sem isto, um save adulterado dava velocidade
    // por 31 anos, e o teto é o maior prazo que uma garrafa consegue comprar.
    expect(restanteDe(volta, 'velocidade')).toBe(EFEITOS.velocidade.duracao * FATOR_DE_PRAZO)
  })

  it('entrada que não é lista devolve mapa vazio', () => {
    expect(efeitosDoSave(null)).toEqual({})
    expect(efeitosDoSave('x')).toEqual({})
  })
})

describe('o tique de regeneração e de veneno', () => {
  it('sem efeito, nenhum tique', () => {
    expect(tiqueDeEfeitos(criarEfeitos(), 10)).toEqual({ regenerar: 0, envenenar: 0 })
    expect(tiqueDeEfeitos(null, 10)).toEqual({ regenerar: 0, envenenar: 0 })
  })

  it('só tica ao completar o intervalo, e o resto fica pro passo seguinte', () => {
    const e = criarEfeitos()
    aplicarEfeito(e, 'regeneracao', 1, 60)
    const i = intervaloDoTique(1)
    expect(tiqueDeEfeitos(e, i * 0.6).regenerar).toBe(0)
    expect(tiqueDeEfeitos(e, i * 0.6).regenerar).toBe(1)
    // ⚠️ A SOBRA É CARREGADA. Descartá-la faria cada tique custar um pouco mais
    // que o intervalo, e ao longo de um prazo inteiro o jogador perderia
    // tiques — o mesmo erro sistemático que a fornalha teve com a fundida.
    expect(tiqueDeEfeitos(e, i * 0.9).regenerar).toBe(1)
  })

  it('nível 2 tica o dobro no mesmo tempo', () => {
    const um = criarEfeitos()
    aplicarEfeito(um, 'veneno', 1, 60)
    const dois = criarEfeitos()
    aplicarEfeito(dois, 'veneno', 2, 60)
    const t = INTERVALO_DO_TIQUE
    expect(tiqueDeEfeitos(dois, t).envenenar).toBeGreaterThan(tiqueDeEfeitos(um, t).envenenar)
  })

  it('quadro perdido não descarrega o veneno todo de uma vez', () => {
    // ⚠️ Aba em segundo plano já entregou `dt` de segundos inteiros. Sem teto
    // no laço, trinta tiques sairiam juntos e o jogador morreria olhando pra
    // outra janela.
    const e = criarEfeitos()
    aplicarEfeito(e, 'veneno', 2, 999)
    expect(tiqueDeEfeitos(e, 120).envenenar).toBeLessThanOrEqual(4)
  })

  it('o acumulador não passa do prazo que resta', () => {
    const e = criarEfeitos()
    aplicarEfeito(e, 'regeneracao', 1, 0.2)
    // o efeito tem 0,2 s de vida; um passo de 10 s não pode render tique nenhum
    expect(tiqueDeEfeitos(e, 10).regenerar).toBe(0)
  })

  it('o acumulador NÃO vai pro save', () => {
    const e = criarEfeitos()
    aplicarEfeito(e, 'veneno', 1, 30)
    tiqueDeEfeitos(e, 1)
    expect(efeitosParaSave(e)).toEqual([['veneno', 1, 30]])
  })

  it('os dois correm juntos, cada um no seu relógio', () => {
    const e = criarEfeitos()
    aplicarEfeito(e, 'regeneracao', 2, 60)
    aplicarEfeito(e, 'veneno', 1, 60)
    const r = tiqueDeEfeitos(e, INTERVALO_DO_TIQUE)
    expect(r.regenerar).toBe(2)
    expect(r.envenenar).toBe(1)
  })
})
