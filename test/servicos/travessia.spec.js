import { describe, it, expect } from 'vitest'
import { criarTravessia, ESPERA_NO_PORTAL } from '../../src/servicos/travessia.js'
import { ID, AIR } from '../../src/servicos/blocks.js'
import { POUSO_DA_CHEGADA } from '../../src/servicos/endWorldgen.js'

//
// A TRAVESSIA PELO PORTAL DO FIM, sem three.js: um mundo de mentira que só
// sabe o bloco sob os pés do jogador, e um relógio que o teste avança.
//
function montar({ dimensao = 'overworld', sobOsPes = AIR, retorno = { x: 3, y: 70, z: 5 } } = {}) {
  const log = { resets: [], pousos: [], saidas: [] }
  let dim = dimensao
  let bloco = sobOsPes
  const jogador = { x: 0.5, y: 64, z: 0.5, vy: 0 }
  const t = criarTravessia({
    jogador,
    mundo: () => ({ isLoaded: () => true, getBlock: () => bloco }),
    semente: () => 1,
    edicoes: new Map(),
    dimensaoAtual: () => dim,
    emSala: () => false,
    resetar: (d) => {
      log.resets.push(d)
      dim = d
    },
    pousar: (p) => {
      log.pousos.push({ ...p })
      Object.assign(jogador, p)
    },
    pontoDeRetorno: () => retorno,
    aoSairDoFim: () => log.saidas.push(1),
  })
  return { t, log, jogador, trocarBloco: (b) => (bloco = b), dimensao: () => dim }
}

describe('travessia — o portal do Fim', () => {
  it('parado no portal do Fim por 1,2 s, o jogador vai ao Fim e pousa na plataforma', () => {
    const { t, log, trocarBloco } = montar({ sobOsPes: ID.endPortal })
    // Onze passos de 0,1 s: 1,1 s, abaixo da espera de 1,2.
    for (let i = 0; i < 11; i++) expect(t.passo(0.1)).toBe(false)
    expect(t.passo(0.2)).toBe(true)
    expect(log.resets).toEqual(['end'])
    expect(log.pousos).toEqual([POUSO_DA_CHEGADA])
    // Chegou IMUNE: o passo seguinte não atravessa de novo enquanto não sair.
    trocarBloco(ID.endPortal)
    expect(t.passo(5)).toBe(false)
    expect(t.imune()).toBe(true)
  })

  it('do Fim, o portal de saída leva ao ponto de renascimento do overworld', () => {
    const { t, log } = montar({ dimensao: 'end', sobOsPes: ID.endPortal })
    expect(t.atravessar(ID.endPortal)).toBe(true)
    expect(log.resets).toEqual(['overworld'])
    expect(log.pousos).toEqual([{ x: 3, y: 70, z: 5 }])
    // Sair PELO PORTAL avisa o fim de jogo (é ele que decide se é vitória).
    expect(log.saidas).toEqual([1])
  })

  it('morrer no Fim volta ao overworld sem portal; fora do Fim não faz nada', () => {
    const noFim = montar({ dimensao: 'end' })
    expect(noFim.t.voltarDoFim()).toBe(true)
    expect(noFim.dimensao()).toBe('overworld')
    expect(noFim.log.saidas, 'morrer não é sair pelo portal: sem créditos').toEqual([])
    const emCasa = montar()
    expect(emCasa.t.voltarDoFim()).toBe(false)
    expect(emCasa.log.resets).toEqual([])
  })

  it('sem ponto de retorno a saída do Fim não atravessa (não inventa pouso)', () => {
    const { t, log } = montar({ dimensao: 'end', retorno: null })
    expect(t.atravessar(ID.endPortal)).toBe(false)
    expect(log.resets).toEqual([])
  })

  it('o portal do Nether continua indo ao Nether, e não ao Fim', () => {
    const { t, log } = montar({ sobOsPes: ID.netherPortalX })
    for (let s = 0; s < ESPERA_NO_PORTAL + 0.3; s += 0.1) t.passo(0.1)
    expect(log.resets).toEqual(['nether'])
  })
})
