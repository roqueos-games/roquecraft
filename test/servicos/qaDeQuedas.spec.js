import { describe, it, expect } from 'vitest'
import { criarQaDeQuedas } from '../../src/servicos/qaDeQuedas.js'

// ⚠️ ESTE TESTE EXISTE POR CAUSA DA ESCRITA EM `quedasCongeladas`.
//
// No componente ela é `let`, lida pelo laço do jogo a cada quadro. Um serviço
// que a recebesse por VALOR escreveria numa cópia: `congelarQuedas(true)`
// devolveria `true`, a sonda acreditaria, e a areia continuaria caindo. É o
// mesmo silêncio de escrever em `yaw` de dentro de um módulo - o defeito que a
// rule 44 registra como o mais caro de achar, porque nada fica vermelho.
//
// Por isso o congelamento entra por PAR getter/setter, e os testes abaixo
// exigem que a escrita chegue de volta ao dono da variável.

function contexto(over = {}) {
  // Espelha o componente: a variável mora AQUI, não dentro do serviço.
  let congeladaNoDono = false
  const quedasNoAr = { quantas: 0, recusadas: 0, lista: [] }
  const fila = { tamanho: 0, descartadas: 0 }
  const passos = []
  const ctx = {
    engine: () => ({ blocosCaindo: { malhas: 7 } }),
    quedasNoAr,
    fila,
    tickQuedas: (dt) => {
      passos.push(dt)
      // Cada passo derruba uma queda, como o jogo faria.
      if (quedasNoAr.quantas > 0) quedasNoAr.quantas--
      else if (fila.tamanho > 0) fila.tamanho--
    },
    congelado: () => congeladaNoDono,
    congelar: (v) => {
      congeladaNoDono = v
    },
    ...over,
  }
  return { qa: criarQaDeQuedas(ctx), quedasNoAr, fila, passos, dono: () => congeladaNoDono }
}

describe('qaDeQuedas', () => {
  it('a escrita do congelar chega no DONO da variável', () => {
    const { qa, dono } = contexto()
    expect(qa.congelarQuedas(true)).toBe(true)
    expect(dono(), 'o congelar escreveu numa cópia; a areia continuaria caindo').toBe(true)
    expect(qa.congelarQuedas(false)).toBe(false)
    expect(dono()).toBe(false)
    // Sem argumento, congela - é o padrão que as sondas usam.
    qa.congelarQuedas()
    expect(dono()).toBe(true)
  })

  it('escoarQuedas descongela pra rodar e RESTAURA o estado anterior', () => {
    // Sem descongelar, os 600 quadros rodariam sem mover nada e a sonda leria
    // "não converge" - um vermelho que seria do instrumento, não do jogo.
    const { qa, quedasNoAr, dono, passos } = contexto()
    qa.congelarQuedas(true)
    quedasNoAr.quantas = 3
    const r = qa.escoarQuedas(600)
    expect(r).toEqual({ quadros: 3, sobrou: 0 })
    expect(passos.length).toBe(3)
    expect(dono(), 'escoar deixou a queda descongelada por conta própria').toBe(true)
  })

  it('escoarQuedas respeita o limite e conta o que sobrou', () => {
    const { qa, quedasNoAr, fila } = contexto()
    quedasNoAr.quantas = 10
    fila.tamanho = 5
    const r = qa.escoarQuedas(4)
    expect(r.quadros).toBe(4)
    // CONTROLE: um laço sem teto rodaria até esvaziar e devolveria sobrou 0,
    // escondendo justamente a cascata que não converge.
    expect(r.sobrou).toBe(11)
  })

  it('quedasInfo lê o motor VIVO', () => {
    let engine = { blocosCaindo: { malhas: 7 } }
    const { qa, quedasNoAr } = contexto({ engine: () => engine })
    quedasNoAr.lista = [{ y: 64.123456 }, { y: 70.9 }]
    expect(qa.quedasInfo().malhas).toBe(7)
    expect(qa.quedasInfo().alturas).toEqual([64.12, 70.9])
    engine = { blocosCaindo: { malhas: 99 } }
    expect(qa.quedasInfo().malhas, 'ficou presa no motor morto').toBe(99)
    engine = null
    expect(qa.quedasInfo().malhas).toBe(0)
  })
})

// ⚠️ UMA SONDA DE QA NÃO PODE LAVAR ESTADO RUIM. `?? PADRAO` só troca AUSÊNCIA
// pelo padrão; com `||`, todo valor falsy-porém-PRESENTE (`0`, `NaN`) vira o
// padrão. Numa sonda, isso é o pior defeito possível: ela passa a relatar
// "normal" exatamente quando o mundo está quebrado.
describe('qaDeQuedas — a sonda não maquia a contagem de malhas', () => {
  it('contagem NaN sai como NaN, não como zero', () => {
    // A piscina de malhas de bloco caindo é justamente o recurso que a sonda
    // existe pra vigiar. Uma contagem estourada virando 0 faz o teste de
    // cascata medir "nenhuma malha em uso" e dar verde num vazamento.
    const { qa } = contexto({ engine: () => ({ blocosCaindo: { malhas: NaN } }) })
    expect(Number.isNaN(qa.quedasInfo().malhas)).toBe(true)
  })

  it('sem motor ainda, a contagem é zero', () => {
    const { qa } = contexto({ engine: () => null })
    expect(qa.quedasInfo().malhas).toBe(0)
  })

  it('com motor, relata a contagem viva', () => {
    const { qa } = contexto({ engine: () => ({ blocosCaindo: { malhas: 12 } }) })
    expect(qa.quedasInfo().malhas).toBe(12)
  })
})
