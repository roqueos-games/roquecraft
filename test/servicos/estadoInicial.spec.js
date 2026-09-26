import { describe, it, expect } from 'vitest'
import {
  estadoInicial,
  escolherSemente,
  inventarioInicial,
  diaDoSave,
  TICKS_INICIAIS,
} from '../../src/servicos/estadoInicial.js'
import { TICKS_PER_DAY } from '../../src/servicos/daycycle.js'

// ⚠️ O QUE ESTE ARQUIVO SEGURA: o mundo de quem ja jogou.
//
// Cada afirmacao aqui e um estrago concreto que o jogador veria. Nao ha nenhum
// "testa o caminho feliz": o caminho feliz e o unico que nunca quebra sozinho.
//
// Isto morava dentro de `boot`, e nao tinha como ter teste -- para chegar a uma
// linha era preciso Firestore, WebGL e um mundo gerado.

const SALVO = {
  seed: 4242,
  mode: 'creative',
  ticks: 50_000,
  inventory: [{ item: 'stone', count: 3 }],
  hotbar: 5,
  renascimento: { x: 1, y: 2, z: 3 },
  survival: { health: 4, hunger: 9 },
}

describe('escolherSemente: o save vence o harness, que vence o acaso', () => {
  it('com save, a semente e a do save, mesmo com harness e sorteio na mesa', () => {
    // Se esta perder, "Continuar" devolve um mundo DIFERENTE com as construcoes
    // do jogador em cima: casa flutuando sobre um oceano que era planicie.
    expect(escolherSemente({ salvo: { seed: 7 }, doHarness: 99, nova: 123 })).toBe(7)
  })

  it('sem save, o harness vence o sorteio', () => {
    // Sem isto cada rodada do QA gera outro mundo e duas fotos da mesma cena
    // nunca sao comparaveis.
    expect(escolherSemente({ salvo: null, doHarness: 99, nova: 123 })).toBe(99)
  })

  it('sem save e sem harness, sobra o sorteio', () => {
    expect(escolherSemente({ salvo: null, doHarness: null, nova: 123 })).toBe(123)
  })

  it('semente ZERO no save ainda e uma semente', () => {
    // `salvo.seed ?? ...` deixava passar, mas um `||` em qualquer refatoracao
    // futura mandaria o mundo 0 para o sorteio. Zero e um mundo valido.
    expect(escolherSemente({ salvo: { seed: 0 }, doHarness: 99, nova: 123 })).toBe(0)
  })

  it('semente invalida no save cai para a proxima da fila, nao para NaN', () => {
    expect(escolherSemente({ salvo: { seed: null }, doHarness: 99, nova: 123 })).toBe(99)
    expect(escolherSemente({ salvo: { seed: 'abc' }, doHarness: null, nova: 123 })).toBe(123)
  })
})

describe('inventarioInicial: um inventario salvo vazio nao e um inventario salvo', () => {
  it('save com item devolve exatamente o que estava la', () => {
    const inv = [null, { item: 'stone', count: 3 }]
    expect(inventarioInicial({ inventory: inv }, 'survival')).toBe(inv)
  })

  it('save com a lista TODA nula devolve o kit inicial, nao o vazio', () => {
    // Um save truncado traz slots nulos. Sem esta pergunta o jogador volta ao
    // mundo dele de maos vazias -- e em sobrevivencia isso e um mundo intocavel.
    const vazio = inventarioInicial({ inventory: [null, null, null] }, 'creative')
    expect(vazio.some(Boolean)).toBe(true)
  })

  it('sem save, o kit depende do modo', () => {
    expect(inventarioInicial(null, 'creative').some(Boolean)).toBe(true)
    expect(inventarioInicial(null, 'survival').some(Boolean)).toBe(false)
  })
})

describe('diaDoSave: o numero que aparece na porta', () => {
  it('o primeiro dia e 1, nao 0', () => {
    expect(diaDoSave(0)).toBe(1)
    expect(diaDoSave(TICKS_INICIAIS)).toBe(1)
  })

  it('vira o dia exatamente na virada, e nao antes', () => {
    expect(diaDoSave(TICKS_PER_DAY - 1)).toBe(1)
    expect(diaDoSave(TICKS_PER_DAY)).toBe(2)
    expect(diaDoSave(TICKS_PER_DAY * 6)).toBe(7)
  })
})

describe('estadoInicial: mundo novo', () => {
  const novo = () => estadoInicial({ salvo: null, nova: 555 })

  it('comeca de manha, em sobrevivencia, sem save e no dia 1', () => {
    const e = novo()
    expect(e.seed).toBe(555)
    expect(e.mode).toBe('survival')
    expect(e.ticks).toBe(TICKS_INICIAIS)
    expect(e.temSave).toBe(false)
    expect(e.dia).toBe(1)
    expect(e.hotbar).toBe(0)
    expect(e.renascimento).toBe(null)
  })

  it('survival vem NULL, nao um objeto vazio', () => {
    // `Object.assign(survival, {})` seria inofensivo, mas `Object.assign` de um
    // objeto com zeros nao: o jogador nasceria morto. `null` diz "nao mexa".
    expect(novo().survival).toBe(null)
  })
})

describe('estadoInicial: mundo salvo', () => {
  it('devolve tudo que o save guardou', () => {
    const e = estadoInicial({ salvo: SALVO, doHarness: 1, nova: 2 })
    expect(e.seed).toBe(4242)
    expect(e.mode).toBe('creative')
    expect(e.ticks).toBe(50_000)
    expect(e.hotbar).toBe(5)
    expect(e.renascimento).toEqual({ x: 1, y: 2, z: 3 })
    expect(e.survival).toEqual({ health: 4, hunger: 9 })
    expect(e.temSave).toBe(true)
    expect(e.dia).toBe(diaDoSave(50_000))
  })

  it('hotbar ZERO e uma escolha, nao "nao escolheu"', () => {
    expect(estadoInicial({ salvo: { ...SALVO, hotbar: 0 }, nova: 1 }).hotbar).toBe(0)
  })

  it('hotbar corrompida volta ao primeiro slot, e NAO passa adiante', () => {
    // O HUD compara `i === selected` com `===` num prop `Number`. Um `'3'` vindo
    // de um save antigo nao casa com nenhum slot: a hotbar fica sem nada
    // destacado e o Vue ainda avisa do tipo errado no console.
    //
    // Este teste existe porque o mutante `salvo?.hotbar || 0` SOBREVIVEU a
    // primeira versao: para o valor 0 os dois caminhos dao 0, e o `0` sozinho
    // nao prova nada sobre a guarda.
    for (const ruim of ['3', NaN, null, undefined, {}]) {
      expect(estadoInicial({ salvo: { ...SALVO, hotbar: ruim }, nova: 1 }).hotbar).toBe(0)
    }
  })

  it('ticks ZERO e meia-noite, nao "sem horario"', () => {
    // Com `||` no lugar do `Number.isFinite`, um save da meia-noite acordaria de
    // manha: o mundo pula uma noite inteira ao carregar.
    expect(estadoInicial({ salvo: { ...SALVO, ticks: 0 }, nova: 1 }).ticks).toBe(0)
  })

  it('modo corrompido cai em sobrevivencia, nunca em criativo', () => {
    // Criativo por engano da blocos infinitos e voo a quem escolheu sobreviver:
    // o save nao volta atras disso.
    for (const ruim of ['', null, undefined, 0]) {
      expect(estadoInicial({ salvo: { ...SALVO, mode: ruim }, nova: 1 }).mode).toBe('survival')
    }
  })

  it('save de versao antiga (so semente) nao explode e ainda joga', () => {
    const e = estadoInicial({ salvo: { seed: 9 }, nova: 1 })
    expect(e.seed).toBe(9)
    expect(e.mode).toBe('survival')
    expect(e.ticks).toBe(TICKS_INICIAIS)
    expect(e.survival).toBe(null)
    expect(e.inventory.some(Boolean)).toBe(false)
    expect(e.temSave).toBe(true)
  })
})
