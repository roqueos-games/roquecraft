import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { criarQaDeFluidos } from '../../src/servicos/qaDeFluidos.js'
import {
  BLOCK_BY_KEY,
  AGUA,
  LAVA,
  FLUIDO_DE_ID,
  NIVEL_DE_FLUIDO,
} from '../../src/servicos/blocks.js'
import { SEA_LEVEL } from '../../src/servicos/constants.js'

// ⚠️ O QUE A EXTRAÇÃO PÔS EM RISCO.
//
// 1. `world` é `let` no componente. Getter, como sempre.
// 2. `escoarFluidos` tem um TETO. Um laço sem teto rodaria até esvaziar e
//    devolveria sempre `sobrou: 0` - escondendo justamente o fluxo que não
//    converge, que é a única coisa que este método existe pra achar. Um teste
//    com piso e sem teto aprovaria o defeito (a lição de `luzSobChuva`).
// 3. `nivelDeAguaEm` tem que separar água de LAVA. Devolver o nível de
//    qualquer fluido faria a sonda de lava passar medindo água.

const idDeAgua = (nivel) => {
  for (let id = 0; id < 256; id++) {
    if (FLUIDO_DE_ID[id] === AGUA && NIVEL_DE_FLUIDO[id] === nivel) return id
  }
  throw new Error(`sem id de água nível ${nivel}`)
}
const idDeLava = (nivel) => {
  for (let id = 0; id < 256; id++) {
    if (FLUIDO_DE_ID[id] === LAVA && NIVEL_DE_FLUIDO[id] === nivel) return id
  }
  throw new Error(`sem id de lava nível ${nivel}`)
}

function filaFalsa(tamanho = 0, esperando = 0) {
  return {
    tamanho,
    esperando,
    descartadas: 3,
    atrasadasDemais: 1,
    avancarTempo() {},
    drenar() {
      if (this.tamanho > 0) this.tamanho--
      else if (this.esperando > 0) this.esperando--
    },
  }
}

function contexto(over = {}) {
  const player = { x: 0, y: 62, z: 0, vy: -1.23456, inWater: true }
  const survival = { air: 8 }
  const submerso = ref(false)
  const fila = over.fila || filaFalsa()
  const ctx = {
    world: () => ({ getBlock: () => BLOCK_BY_KEY.stone.id, liquidAt: () => 0 }),
    player,
    survival,
    submerso,
    fila,
    visitarCelula: () => {},
    ...over,
  }
  return { qa: criarQaDeFluidos(ctx), player, survival, submerso, fila }
}

describe('qaDeFluidos', () => {
  it('segue o mundo VIVO', () => {
    let world = { getBlock: () => idDeAgua(0), liquidAt: () => 0 }
    const { qa } = contexto({ world: () => world })
    expect(qa.nivelDeAguaEm(0, 0, 0)).toBe(0)
    world = { getBlock: () => idDeAgua(4), liquidAt: () => 0 }
    expect(qa.nivelDeAguaEm(0, 0, 0), 'ficou preso no mundo morto').toBe(4)
  })

  it('separa água de lava em vez de devolver "qualquer fluido"', () => {
    const emLava = contexto({
      world: () => ({ getBlock: () => idDeLava(0), liquidAt: () => 0 }),
    }).qa
    expect(emLava.nivelDeLavaEm(0, 0, 0)).toBe(0)
    // CONTROLE: sem a comparação com AGUA, isto devolveria 0 e a sonda de água
    // aprovaria uma poça de lava.
    expect(emLava.nivelDeAguaEm(0, 0, 0), 'chamou lava de água').toBe(-1)

    const emPedra = contexto().qa
    expect(emPedra.nivelDeAguaEm(0, 0, 0)).toBe(-1)
    expect(emPedra.nivelDeLavaEm(0, 0, 0)).toBe(-1)
  })

  it('escoarFluidos respeita o teto e conta o que sobrou', () => {
    const fila = filaFalsa(10, 5)
    const { qa } = contexto({ fila })
    const r = qa.escoarFluidos(4)
    expect(r.tiques).toBe(4)
    // Sem o teto, o laço esvaziaria tudo e devolveria sobrou 0 - que é
    // exatamente o número que esconde um fluxo travado.
    expect(r.sobrou, 'o laço ignorou o limite').toBe(11)
  })

  it('escoarFluidos para sozinho quando a fila esvazia', () => {
    const fila = filaFalsa(3, 0)
    const { qa } = contexto({ fila })
    const r = qa.escoarFluidos(400)
    expect(r).toEqual({ tiques: 3, sobrou: 0 })
  })

  it('aguaInfo espelha o estado vivo do jogador', () => {
    const { qa, player, submerso, survival } = contexto()
    const antes = qa.aguaInfo()
    expect(antes).toEqual({
      y: 62,
      seaLevel: SEA_LEVEL,
      submerso: false,
      naAgua: true,
      vy: -1.235,
      folego: 8,
    })
    submerso.value = true
    player.y = 40
    player.inWater = false
    survival.air = 0
    const depois = qa.aguaInfo()
    expect(depois.submerso, 'o submerso ficou congelado na criação').toBe(true)
    expect([depois.y, depois.naAgua, depois.folego]).toEqual([40, false, 0])
  })

  it('fluidosInfo devolve as quatro contagens da fila', () => {
    const { qa } = contexto({ fila: filaFalsa(7, 2) })
    expect(qa.fluidosInfo()).toEqual({
      fila: 7,
      esperando: 2,
      descartadas: 3,
      atrasadasDemais: 1,
    })
  })
})
