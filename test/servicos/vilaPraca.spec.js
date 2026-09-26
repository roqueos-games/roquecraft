//
// A PRAÇA, O POÇO, OS POSTES E O QUINTAL.
//
// ⚠️ O MEIO DA VILA ERA CAPIM. As casas ficavam num anel e o centro — para onde
// todos os caminhos apontam — era o mesmo campo de antes. Centro vazio não lê
// como praça: lê como clareira.
import { describe, it, expect } from 'vitest'
import {
  planoDaAldeia,
  colunaDaAldeia,
  ehQuintal,
  CELULA,
  RAIO_DA_PRACA,
  ALTURA_DA_ALDEIA,
} from '../../src/servicos/aldeia.js'
import { colunaDaPraca, postesDe } from '../../src/servicos/vilaPraca.js'
import { BLOCKS } from '../../src/servicos/blocks.js'

const hash = (a, b, c) => {
  let h = (a * 374761393 + b * 668265263 + c * 2246822519) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
const planicie = { alturaEm: () => 70, nivelDoMar: 62 }
const plano = planoDaAldeia(hash, planicie, 0, 0)
const chaves = (col) => (col ?? []).map((e) => BLOCKS[e.id]?.key ?? 'ar')

describe('a praça', () => {
  it('o meio da vila tem chão DIFERENTE do campo', () => {
    // Enquanto o piso for grama não há praça: há grama entre casas.
    const col = colunaDaPraca(plano, [], plano.centro.x + 4, plano.centro.z + 4)
    expect(chaves(col)).toContain('cobblestone')
  })

  it('e ela LIMPA o que está por cima', () => {
    // Praça com mato alto no meio não parece praça.
    const col = colunaDaPraca(plano, [], plano.centro.x + 4, plano.centro.z + 4)
    const acima = col.filter((e) => e.y > plano.chao)
    expect(acima.length, 'nada foi apagado acima do piso').toBeGreaterThan(0)
    for (const e of acima) expect(e.id).toBe(0)
  })

  it('fora dela o assunto não é da praça', () => {
    expect(colunaDaPraca(plano, [], plano.centro.x + RAIO_DA_PRACA + 1, plano.centro.z)).toBeNull()
  })
})

describe('o poço', () => {
  const col = (dx, dz) => colunaDaPraca(plano, [], plano.centro.x + dx, plano.centro.z + dz)

  it('tem água no meio', () => {
    expect(chaves(col(0, 0))).toContain('water')
  })

  it('a água é CERCADA DE PEDRA nos quatro lados', () => {
    // ⚠️ A fonte escorre. Um poço com um lado aberto vira um córrego
    // atravessando a praça na primeira visita da fila de fluidos.
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const c = col(dx, dz)
      const noNivel = c.filter((e) => e.y === plano.chao || e.y === plano.chao + 1)
      for (const e of noNivel) {
        expect(BLOCKS[e.id]?.key, `vazamento em ${dx},${dz}`).toBe('cobblestone')
      }
    }
  })

  it('tem quatro pilares e cobertura de LAJE', () => {
    // Bloco cheio num telhadinho de 3×3 fica com cara de caixote sobre o poço.
    expect(chaves(col(1, 1))).toContain('oakFence')
    const topo = col(0, 0).at(-1)
    expect(BLOCKS[topo.id]?.key).toBe('oakSlab')
  })
})

describe('os postes', () => {
  const postes = postesDe(plano)

  it('são as quatro quinas da praça MAIS uma varanda por casa', () => {
    expect(postes.length).toBe(4 + plano.casas.length)
  })

  it('toda casa tem a luz dela por perto', () => {
    for (const c of plano.casas) {
      const perto = postes.some(
        (p) => Math.abs(p.x - c.x) <= c.planta.lx + 3 && Math.abs(p.z - c.z) <= c.planta.lz + 3,
      )
      expect(perto, `a casa em ${c.x},${c.z} ficou no escuro`).toBe(true)
    }
  })

  it('cada um termina em lanterna', () => {
    for (const p of postes) {
      const col = colunaDaPraca(plano, postes, p.x, p.z)
      expect(BLOCKS[col.at(-1).id]?.key, `poste em ${p.x},${p.z}`).toBe('lantern')
    }
  })

  it('e TODOS chegam no mundo — nenhum nasce dentro de uma casa', () => {
    // ⚠️ A primeira versão punha o poste a dois terços do caminho até a porta, e
    // sete dos onze caíam dentro de OUTRA casa. A casa tem precedência no
    // despachante, então o poste sumia em silêncio e a vila amanhecia com
    // quatro luzes de doze.
    for (let g = 0; g < 20; g++) {
      const p = planoDaAldeia(hash, planicie, g * CELULA, g * CELULA)
      if (!p) continue
      let acesos = 0
      for (const q of p.postes) {
        if (chaves(colunaDaAldeia(p, q.x, q.z)).includes('lantern')) acesos++
      }
      expect(acesos, `aldeia ${g}: ${acesos} de ${p.postes.length} postes`).toBe(p.postes.length)
    }
  })
})

describe('o quintal', () => {
  it('a vila tem terreiro em volta das casas', () => {
    const c = plano.casas[0]
    const fora = c.planta.lx + 3
    expect(ehQuintal(plano, c.x + fora, c.z)).toBe(true)
    expect(ehQuintal(plano, c.x + 40, c.z + 40)).toBe(false)
  })

  it('o terreiro APLAINA o terreno no nível da vila', () => {
    // ⚠️ ANTES ELE DEVOLVIA LISTA VAZIA — "deixe o terreno como está" — e era
    // isso que cortava a casa pela metade: uma lomba de três blocos encostada na
    // parede tapa a porta e a janela, e o jogador lê a casa como enterrada.
    const c = plano.casas[0]
    const x = c.x + c.planta.lx + 3
    const z = c.z + c.planta.lz + 3

    const morro = colunaDaAldeia(plano, x, z, () => plano.chao + 4)
    expect(
      morro.filter((e) => e.y > plano.chao).every((e) => e.id === 0),
      'a lomba ficou de pé',
    ).toBe(true)

    const buraco = colunaDaAldeia(plano, x, z, () => plano.chao - 4)
    expect(buraco.filter((e) => e.y < plano.chao).length, 'a depressão não foi preenchida').toBe(4)
  })

  it('e ele é de GRAMA em cima e TERRA embaixo, nunca do material da fundação', () => {
    // ⚠️ Calçar o terreiro com o pedregulho da base transformaria a vila num
    // pátio: o piso duro é a marca da PRAÇA, e se ele vaza para o quintal a
    // praça deixa de significar alguma coisa.
    //
    // ⚠️ E O ATERRO CONTA TANTO QUANTO A SUPERFÍCIE. A primeira versão deste
    // teste só olhava o bloco do nível do chão, e o mutante que trocava a terra
    // do aterro por pedregulho SOBREVIVEU — o corte na borda do terraço mostra
    // exatamente essa camada, e uma parede de pedregulho de quatro blocos em
    // volta da vila é a diferença entre um terreno preparado e uma pedreira.
    const c = plano.casas[0]
    const x = c.x + c.planta.lx + 3
    const z = c.z + c.planta.lz + 3
    const col = colunaDaAldeia(plano, x, z, () => plano.chao - 4)
    expect(BLOCKS[col.find((e) => e.y === plano.chao).id]?.key).toBe('grassBlock')
    for (const e of col.filter((q) => q.y < plano.chao)) {
      expect(BLOCKS[e.id]?.key, `aterro de ${BLOCKS[e.id]?.key} em y=${e.y}`).toBe('dirt')
    }
  })
})

describe('a vila aplaina o que encontra', () => {
  it('PREENCHE até o chão onde o terreno está abaixo dela', () => {
    // ⚠️ `terrenoPlano` mede CINCO pontos num quadrado de 56 de lado: uma poça
    // ou a margem de um lago entre eles é invisível. A casa que caía ali nascia
    // com o piso pairando acima da areia — a sonda achou uma com 63 blocos de
    // 200 em 14/09/2026, porque a coluna inteira estava abaixo do nível do mar.
    const c = plano.casas[0]
    const col = colunaDaAldeia(plano, c.x, c.z, () => plano.chao - 4)
    const abaixo = col.filter((e) => e.y < plano.chao)
    expect(abaixo.length, 'a casa ficou de pernas para o ar').toBe(4)
    for (const e of abaixo) expect(BLOCKS[e.id]?.key).toBe(plano.material.base)
  })

  it('LIMPA até o topo, para a copa não entrar pela janela', () => {
    const c = plano.casas[0]
    const col = colunaDaAldeia(plano, c.x, c.z)
    expect(col.at(-1).y).toBe(plano.chao + ALTURA_DA_ALDEIA)
  })

  it('sem terreno informado, não inventa embasamento', () => {
    const c = plano.casas[0]
    const col = colunaDaAldeia(plano, c.x, c.z)
    expect(col.filter((e) => e.y < plano.chao)).toHaveLength(0)
  })
})
