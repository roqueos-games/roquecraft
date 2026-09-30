import { describe, it, expect } from 'vitest'
import {
  criarLocalizadorDeLugares,
  planoDaVilaEm,
  vilaMaisPertoDaOrigem,
} from '../../src/servicos/lugares.js'
import { createNoiseContext, findSpawn } from '../../src/servicos/worldgen.js'
import { fortalezaDaSemente } from '../../src/servicos/geradores.js'
import { criarQaDeAldeia } from '../../src/servicos/qaDeAldeia.js'

// OS LUGARES DO MUNDO, PELA SEMENTE (Goal 23, onda 4).
//
// O que se prova: cada lugar é a MESMA conta que o gerador usa (o nascimento é
// o `findSpawn`, a fortaleza é a do gerador, a vila é a que a sonda de aldeia
// acha), a resposta é um ponto com dimensão e pé no chão, e a conta cara não
// se repete a cada clique.

const SEMENTE = 942457 // a semente das sondas

describe('o localizador de lugares', () => {
  const l = criarLocalizadorDeLugares({ semente: () => SEMENTE })

  it('o nascimento é o `findSpawn` da semente, no supermundo', () => {
    const esperado = findSpawn(createNoiseContext(SEMENTE))
    expect(l.nascimento()).toEqual({ dimensao: 'overworld', ...esperado })
  })

  it('a fortaleza é a do gerador: a boca do poço, na superfície', () => {
    const f = fortalezaDaSemente(SEMENTE)
    expect(l.fortaleza()).toEqual({
      dimensao: 'overworld',
      x: f.centro.x,
      y: f.centro.chao + 1,
      z: f.centro.z,
    })
  })

  it('a vila é a que a sonda de aldeia acha: a mesma conta, e não uma cópia', () => {
    const daSonda = criarQaDeAldeia({ seed: { value: SEMENTE } }).procurarAldeia()
    const v = l.vila()
    expect(daSonda).not.toBeNull()
    expect(v).toEqual({
      dimensao: 'overworld',
      x: daSonda.centro.x,
      y: daSonda.chao + 1,
      z: daSonda.centro.z,
    })
  })

  it('a resposta é guardada por semente: o mesmo objeto no segundo clique', () => {
    expect(l.vila()).toBe(l.vila())
    expect(l.nascimento()).toBe(l.nascimento())
  })

  it('trocar a semente troca a resposta', () => {
    let semente = SEMENTE
    const troca = criarLocalizadorDeLugares({ semente: () => semente })
    const antes = troca.fortaleza()
    semente = 7
    const depois = troca.fortaleza()
    const f7 = fortalezaDaSemente(7)
    expect(depois).toEqual({
      dimensao: 'overworld',
      x: f7.centro.x,
      y: f7.centro.chao + 1,
      z: f7.centro.z,
    })
    expect(depois).not.toEqual(antes)
  })

  it('sem vila por perto, a resposta é `null`, não um chute', () => {
    const nz = createNoiseContext(SEMENTE)
    // Zero anéis: só a célula da origem. Se ela não tem vila, é null.
    const soOrigem = vilaMaisPertoDaOrigem(nz, SEMENTE, 0)
    const naOrigem = planoDaVilaEm(nz, SEMENTE, 0, 0)
    expect(soOrigem === null).toBe(naOrigem === null)
  })
})
