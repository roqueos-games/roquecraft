//
// O QUE FAZ UMA CIDADE SER CIDADE.
//
// ⚠️ TRINTA CASAS EM VOLTA DE UMA PRAÇA É UM CONDOMÍNIO. O founder pediu
// "cidades com casas, igrejas, lojas, feiras" — e o que separa cidade de vila
// grande não é a contagem: é ter EDIFÍCIO PÚBLICO, algo alto que se vê antes de
// chegar, e comércio de rua, que é a razão de atravessar o mapa até lá.
//
// Estas afirmações são de SILHUETA e de função, não de beleza. Beleza é a foto.
import { describe, it, expect } from 'vitest'
import {
  ALTURA_DA_IGREJA,
  BANCA,
  BANCAS_DA_FEIRA,
  FRACAO_DE_LOJAS,
  IGREJA,
  bancasDaFeira,
  colunasDaBanca,
  colunasDaIgreja,
  ehLoja,
  tabuletaDe,
} from '../../src/servicos/cidade.js'
import { ALTURA_DA_ALDEIA, PORTES, RAIO_DA_PRACA } from '../../src/servicos/aldeia.js'
import { MATERIAIS } from '../../src/servicos/vilaCasa.js'
import { NOMES_DE_PROFISSAO } from '../../src/servicos/comercio.js'

const igreja = colunasDaIgreja(MATERIAIS.carvalho)
const topo = (cols) => Math.max(...cols.map((c) => c.ate))

describe('a igreja é o ponto de referência', () => {
  it('⚠️ toda peça é um ID NUMÉRICO do catálogo — chave de material vira ar', () => {
    // `MATERIAIS` guarda chaves ('oakPlanks'); `put` escreve num Uint8Array e
    // uma string vira 0. Até 18/09 a igreja e a feira inteiras eram escritas
    // como AR, e nenhum teste do plano acusava: o plano estava certo, o bloco
    // não. A primeira foto da cidade mostrou o largo vazio.
    for (const m of Object.values(MATERIAIS)) {
      for (const peca of [...colunasDaIgreja(m), ...colunasDaBanca(m)]) {
        expect(typeof peca.id, `${JSON.stringify(peca)} não é id`).toBe('number')
        expect(Number.isInteger(peca.id) && peca.id > 0, `id inválido: ${peca.id}`).toBe(true)
      }
    }
    // E o material MANDA: pinho não é carvalho.
    const carvalho = colunasDaBanca(MATERIAIS.carvalho).map((p) => p.id)
    const pinho = colunasDaBanca(MATERIAIS.pinho).map((p) => p.id)
    expect(carvalho).not.toEqual(pinho)
  })

  it('passa MUITO da altura que a vila escreve', () => {
    // ⚠️ A ALTURA É A FUNÇÃO. A vila escreve 11; a torre precisa aparecer acima
    // dos telhados a duzentos blocos, que é a distância em que o jogador decide
    // se vai até lá. Igreja da altura de uma casa é só uma casa com nome bonito.
    expect(topo(igreja)).toBeGreaterThan(ALTURA_DA_ALDEIA * 1.8)
    expect(ALTURA_DA_IGREJA).toBeGreaterThan(IGREJA.alturaDaTorre)
  })

  it('a torre é mais alta que a nave, e por muito', () => {
    // Se a nave chegar perto da torre, o prédio lê como galpão comprido.
    const naTorre = igreja.filter(
      (c) => Math.abs(c.dx) <= IGREJA.torre.lado && c.ate > IGREJA.peDaNave,
    )
    expect(naTorre.length).toBeGreaterThan(0)
    expect(topo(igreja)).toBeGreaterThan(IGREJA.peDaNave * 2)
  })

  it('a torre AFINA no topo — é o afinamento que lê como agulha', () => {
    const alturaMax = topo(igreja)
    const noTopo = igreja.filter((c) => c.ate === alturaMax)
    const naBase = igreja.filter((c) => c.ate === IGREJA.alturaDaTorre)
    const largura = (cols) => Math.max(...cols.map((c) => Math.abs(c.dx))) * 2 + 1
    expect(largura(noTopo), 'a torre acaba reta: virou caixa d`água').toBeLessThan(largura(naBase))
  })

  it('a nave é oca — dá para entrar', () => {
    // Prédio maciço é monumento, não igreja. O miolo da nave só tem piso.
    const miolo = igreja.filter(
      (c) => Math.abs(c.dx) < IGREJA.nave.lx && Math.abs(c.dz) < IGREJA.nave.lz && c.de > 1,
    )
    const naAlturaDaPorta = miolo.filter((c) => c.de <= 3 && c.ate >= 3)
    expect(naAlturaDaPorta.length, 'a nave está maciça').toBe(0)
  })

  it('cabe dentro do raio que a cidade reserva', () => {
    // ⚠️ Estrutura que escreve além do raio do porte é casa cortada pela metade
    // — o defeito exato que o Goal 19 consertou na vila.
    const r = PORTES.cidade.raio
    for (const c of igreja) {
      expect(Math.abs(c.dx)).toBeLessThan(r)
      expect(Math.abs(c.dz)).toBeLessThan(r)
    }
  })
})

describe('a feira é comércio de rua', () => {
  const banca = colunasDaBanca(MATERIAIS.carvalho)

  it('a banca tem toldo em cima e balcão de um lado só', () => {
    // Fechada dos quatro lados seria caixa. O balcão aberto é o que convida.
    const noToldo = banca.filter((c) => c.de === BANCA.alturaDoToldo)
    expect(noToldo.length).toBeGreaterThan(4)
    const balcao = banca.filter((c) => c.de === 1 && c.ate === 1)
    const lados = new Set(balcao.map((c) => c.dz))
    expect(lados.size, 'o balcão fechou a banca por todos os lados').toBe(1)
  })

  it('a banca é mais baixa que a igreja — a hierarquia tem que aparecer', () => {
    expect(topo(banca)).toBeLessThan(topo(igreja) / 3)
  })

  it('as bancas cabem na praça e não se empilham', () => {
    const postos = bancasDaFeira(RAIO_DA_PRACA)
    expect(postos).toHaveLength(BANCAS_DA_FEIRA)
    const vistos = new Set(postos.map((p) => `${p.dx},${p.dz}`))
    expect(vistos.size, 'duas bancas no mesmo lugar').toBe(BANCAS_DA_FEIRA)
    for (const p of postos) {
      expect(Math.abs(p.dx) + BANCA.lx).toBeLessThanOrEqual(RAIO_DA_PRACA)
      expect(Math.abs(p.dz) + BANCA.lz).toBeLessThanOrEqual(RAIO_DA_PRACA)
    }
  })

  it('a feira tem número ímpar de bancas', () => {
    // Praça com eixo, não tabuleiro. Par gera simetria de grade.
    expect(BANCAS_DA_FEIRA % 2).toBe(1)
  })
})

describe('as lojas', () => {
  it('nem toda casa é loja', () => {
    // ⚠️ CIDADE EM QUE TODA PORTA É COMÉRCIO LÊ COMO CENÁRIO. O que dá vida é a
    // mistura: casa, casa, loja, casa.
    expect(FRACAO_DE_LOJAS).toBeGreaterThan(0.1)
    expect(FRACAO_DE_LOJAS).toBeLessThan(0.5)
  })

  it('a decisão é função pura do hash — a mesma casa é sempre a mesma loja', () => {
    // Worldgen roda para os nove chunks vizinhos: uma casa que fosse loja num
    // chunk e casa noutro sairia com meia tabuleta.
    const hash = (a, b, c) => (((Math.sin(a * 1.1 + b * 2.3 + c * 3.7) * 4375.5) % 1) + 1) % 1
    const casa = { x: 132, z: -76 }
    expect(ehLoja(hash, casa)).toBe(ehLoja(hash, casa))
  })

  it('a proporção sorteada bate com a declarada', () => {
    const hash = (a, b, c) => (((Math.sin(a * 12.9 + b * 78.2 + c * 37.7) * 43758.5) % 1) + 1) % 1
    let lojas = 0
    const N = 2000
    for (let i = 0; i < N; i++) if (ehLoja(hash, { x: i * 7, z: i * 13 })) lojas++
    expect(lojas / N).toBeGreaterThan(FRACAO_DE_LOJAS - 0.08)
    expect(lojas / N).toBeLessThan(FRACAO_DE_LOJAS + 0.08)
  })

  it('todo ofício tem tabuleta, e ofício desconhecido não some', () => {
    for (const o of NOMES_DE_PROFISSAO) {
      expect(tabuletaDe(o), `ofício sem tabuleta: ${o}`).toBeTruthy()
    }
    expect(tabuletaDe('pirata')).toBeTruthy()
  })
})
