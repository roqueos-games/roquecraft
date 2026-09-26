//
// A FAZENDA E O CURRAL.
//
// ⚠️ A VILA TINHA CASA E NÃO TINHA TRABALHO. O aldeão vendia trigo e cenoura
// numa vila sem uma leira plantada; o ferreiro vendia ferro sem fornalha. A
// troca funcionava e mesmo assim mentia: o lugar não sustentava o que oferecia.
import { describe, it, expect } from 'vitest'
import {
  planoDaAldeia,
  colunaDaAldeia,
  animaisQueFaltam,
  ehQuintal,
  CELULA,
} from '../../src/servicos/aldeia.js'
import {
  LEIRA,
  CURRAL,
  BORDA_DA_ROCA,
  colunaDaLeira,
  colunaDoCurral,
  animaisDe,
} from '../../src/servicos/vilaFazenda.js'
import { BLOCO_DE_OFICIO, blocoDaCasa } from '../../src/servicos/vilaCasa.js'
import { ID, BLOCKS, IDS_DO_CULTIVO } from '../../src/servicos/blocks.js'
import { NOMES_DE_PROFISSAO } from '../../src/servicos/comercio.js'

const hash = (a, b, c) => {
  let h = (a * 374761393 + b * 668265263 + c * 2246822519) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
const planicie = { alturaEm: () => 70, nivelDoMar: 62 }
const plano = planoDaAldeia(hash, planicie, 0, 0)
const CHAO = 70
const leira = { x: 0, z: 0, tipo: 'leira' }
const curral = { x: 0, z: 0, tipo: 'curral' }
const chaves = (col) => (col ?? []).map((e) => BLOCKS[e.id]?.key ?? 'ar')

describe('a leira', () => {
  const col = (dx, dz) => colunaDaLeira(hash, leira, CHAO, dx, dz)

  it('tem canal de água no meio', () => {
    expect(chaves(col(0, 0))).toContain('water')
    expect(chaves(col(LEIRA.lx, 0))).toContain('water')
  })

  it('a ÁGUA É FECHADA por terra arada nos quatro lados', () => {
    // ⚠️ A fonte escorre: um lado aberto e a leira alaga a vila inteira na
    // primeira visita da fila de fluidos. `farmland` é sólido e é ele quem
    // segura — e é por isso que o canal não pode encostar na cerca.
    for (const dz of [-1, 1]) {
      for (let dx = -LEIRA.lx; dx <= LEIRA.lx; dx++) {
        expect(chaves(col(dx, dz))[0], `vazamento em ${dx},${dz}`).toBe('farmlandWet')
      }
    }
  })

  it('a terra é IRRIGADA, e não seca', () => {
    // Horta de terra seca é horta abandonada, e `farmland` seca sem água perto.
    expect(chaves(col(1, 1))).toContain('farmlandWet')
  })

  it('os pés estão em ESTÁGIOS DIFERENTES', () => {
    // Uma leira inteira madura parece cenário; uma com pé novo ao lado de pé
    // pronto parece roça em uso.
    const vistos = new Set()
    for (let dx = -LEIRA.lx; dx <= LEIRA.lx; dx++) {
      for (const dz of [-2, -1, 1, 2]) {
        const c = col(dx, dz)
        if (c) vistos.add(c[1]?.id)
      }
    }
    expect(vistos.size, 'a leira inteira saiu no mesmo estágio').toBeGreaterThan(1)
  })

  it('o que nasce é cultura de verdade, e uma só por leira', () => {
    const ids = new Set()
    for (let dx = -LEIRA.lx; dx <= LEIRA.lx; dx++) ids.add(col(dx, 1)[1].id)
    const culturas = Object.entries(IDS_DO_CULTIVO).filter(([, lista]) =>
      [...ids].some((i) => lista.includes(i)),
    )
    expect(culturas.length, 'a leira misturou culturas').toBe(1)
  })

  it('TEM CERCA, e ela se LIGA em vez de virar vinte postes', () => {
    // ⚠️ A conexão está codificada no id: cerca que não declara os vizinhos
    // nasce como poste isolado.
    const canto = colunaDaLeira(hash, leira, CHAO, LEIRA.lx + 1, LEIRA.lz + 1)
    const def = BLOCKS[canto[1].id]
    expect(def.cerca, 'não é cerca').toBeTruthy()
    expect(def.cerca.bits, 'cerca de canto sem nenhuma ligação').toBeGreaterThan(0)
  })

  it('e TEM PORTÃO — horta que se pula não precisava de cerca', () => {
    const col0 = colunaDaLeira(hash, leira, CHAO, 0, -(LEIRA.lz + 1))
    expect(BLOCKS[col0[1].id]?.portao, 'a entrada é cerca, não portão').toBeTruthy()
  })

  it('fora dela o assunto não é da leira', () => {
    expect(colunaDaLeira(hash, leira, CHAO, LEIRA.lx + 2, 0)).toBeNull()
  })
})

describe('o curral', () => {
  it('tem cerca, portão e cocho de água', () => {
    expect(BLOCKS[colunaDoCurral(curral, CHAO, 0, -(CURRAL.lz + 1))[1].id]?.portao).toBeTruthy()
    expect(chaves(colunaDoCurral(curral, CHAO, CURRAL.lx, CURRAL.lz))).toContain('water')
  })

  it('o cocho é cercado de pedra: a água não escorre para o pasto', () => {
    expect(chaves(colunaDoCurral(curral, CHAO, CURRAL.lx - 1, CURRAL.lz))).toContain('cobblestone')
    expect(chaves(colunaDoCurral(curral, CHAO, CURRAL.lx, CURRAL.lz - 1))).toContain('cobblestone')
  })

  it('nasce bicho dentro dele, e de mais de uma espécie', () => {
    // Um curral com um bicho só é um bicho preso.
    const bichos = animaisDe(plano)
    expect(bichos.length).toBeGreaterThan(1)
    expect(new Set(bichos.map((b) => b.tipo)).size).toBeGreaterThan(1)
    for (const b of bichos) {
      const r = plano.rocas.find((x) => x.tipo === 'curral')
      expect(Math.abs(b.x - r.x)).toBeLessThanOrEqual(CURRAL.lx)
      expect(Math.abs(b.z - r.z)).toBeLessThanOrEqual(CURRAL.lz)
    }
  })

  it('a conta é QUANTOS FALTAM, e não um sinalizador de povoado', () => {
    // ⚠️ Um sinalizador perderia o bicho comido pelo lobo e o curral ficaria
    // vazio para sempre — cerca, portão e cocho de pé em volta de nada.
    const perto = { x: plano.centro.x, z: plano.centro.z }
    expect(animaisQueFaltam(plano, perto, () => 0).length).toBe(animaisDe(plano).length)
    expect(animaisQueFaltam(plano, perto, () => 1).length).toBe(0)
    expect(animaisQueFaltam(plano, { x: 99999, z: 99999 }, () => 0).length).toBe(0)
  })
})

describe('a roça na vila', () => {
  it('a vila tem roça, e ela não fica em cima de casa', () => {
    // ⚠️ Leira sobre casa não dá erro nenhum: dá casa com trigo no telhado.
    for (let g = 0; g < 25; g++) {
      const p = planoDaAldeia(hash, planicie, g * CELULA, g * CELULA)
      if (!p) continue
      for (const r of p.rocas) {
        for (const c of p.casas) {
          const folga = Math.max(c.planta.lx, c.planta.lz) + 1 + BORDA_DA_ROCA
          const choca = Math.abs(r.x - c.x) <= folga && Math.abs(r.z - c.z) <= folga
          expect(choca, `aldeia ${g}: roça em cima de casa`).toBe(false)
        }
      }
    }
  })

  it('a roça chega no mundo pelo despachante', () => {
    const r = plano.rocas[0]
    expect(colunaDaAldeia(plano, r.x, r.z), 'a roça não é da vila').not.toBeNull()
  })

  it('e ela tem terreiro: a árvore não nasce colada na cerca', () => {
    const r = plano.rocas[0]
    expect(ehQuintal(plano, r.x + BORDA_DA_ROCA + 2, r.z)).toBe(true)
  })
})

describe('o bloco de ofício', () => {
  it('toda profissão tem o dela, e ele aparece na casa', () => {
    for (const p of NOMES_DE_PROFISSAO) expect(BLOCO_DE_OFICIO[p], p).toBeTruthy()
    // ⚠️ COORDENADA GLOBAL. `blocoDaCasa` recebe (x, y, z) do MUNDO e subtrai o
    // centro da casa por dentro; passar o deslocamento cru devolve `null` em
    // toda a varredura, e o teste reprova dizendo que a casa não tem o bloco —
    // sobre uma casa que tem. Foi o que aconteceu na primeira versão disto.
    const casa = plano.casas[0]
    let achou = false
    for (let dx = -casa.planta.lx; dx <= casa.planta.lx; dx++) {
      for (let dz = -casa.planta.lz; dz <= casa.planta.lz; dz++) {
        const id = blocoDaCasa(casa, plano.chao, casa.x + dx, plano.chao + 1, casa.z + dz)
        if (id === BLOCO_DE_OFICIO[casa.profissao]) achou = true
      }
    }
    expect(achou, `a casa do ${casa.profissao} não tem o bloco dele`).toBe(true)
  })

  it('o bloco é o MESMO que a oferta daquela profissão cita', () => {
    // ⚠️ É o que liga a casa ao comércio. Ferreiro sem fornalha e bibliotecário
    // sem estante vendiam do nada.
    expect(BLOCO_DE_OFICIO.ferreiro).toBe(ID.furnace)
    expect(BLOCO_DE_OFICIO.bibliotecario).toBe(ID.bookshelf)
    expect(BLOCO_DE_OFICIO.clerigo).toBe(ID.brewingStand)
  })

  it('e toda casa tem bancada — a peça que diz "aqui se faz alguma coisa"', () => {
    const casa = plano.casas[0]
    const p = casa.planta
    expect(
      blocoDaCasa(casa, plano.chao, casa.x + p.lx - 1, plano.chao + 1, casa.z + p.lz - 2),
    ).toBe(ID.craftingTable)
  })
})
