import { describe, it, expect } from 'vitest'
import {
  alcanceDe,
  COR_DA_POCAO,
  estilhacar,
  frascoDoJogador,
  RAIO_DO_ESTILHACO,
  VELOCIDADE_DO_ARREMESSO,
} from '../../src/servicos/arremesso.js'
import { ALTURA_DO_TIRO } from '../../src/servicos/arco.js'
import { POCOES } from '../../src/servicos/fermentacao.js'

describe('arremesso — a poção arremessável', () => {
  it('o frasco sai do olho, na direção da mira, com a garrafa dentro', () => {
    const f = frascoDoJogador('f1', { x: 1, y: 60, z: 2 }, { x: 0, y: 0, z: -1 }, 'pocao_cura', {
      nivel: 2,
      splash: true,
    })
    expect(f).toMatchObject({ id: 'f1', dono: 'jogador', forma: 'frasco', item: 'pocao_cura' })
    expect(f.y).toBe(60 + ALTURA_DO_TIRO)
    expect(f.z).toBeCloseTo(2 - 0.4)
    expect(f.vz).toBeCloseTo(-VELOCIDADE_DO_ARREMESSO)
    expect(f.pocao).toEqual({ nivel: 2, splash: true })
    expect(f.cor).toBe(COR_DA_POCAO.pocao_cura)
  })

  it('toda poção tem cor', () => {
    for (const p of POCOES) expect(COR_DA_POCAO[p], p).toBeTypeOf('number')
  })

  it('o alcance: 1 no centro, 0 na borda, nada além', () => {
    expect(alcanceDe(0)).toBe(1)
    expect(alcanceDe(RAIO_DO_ESTILHACO / 2)).toBeCloseTo(0.5)
    expect(alcanceDe(RAIO_DO_ESTILHACO)).toBe(0)
    expect(alcanceDe(RAIO_DO_ESTILHACO + 1)).toBe(0)
  })

  it('⚠️ o borrifo alcança quem está perto, com o prazo minguando; o longe fica de fora', () => {
    const f = { x: 0, y: 60, z: 0, item: 'pocao_veneno', pocao: { splash: true } }
    const perto = { x: 0, y: 59.1, z: 0, type: 'pig' }
    const meio = { x: 2, y: 59.1, z: 0, type: 'pig' }
    const longe = { x: 5, y: 59.1, z: 0, type: 'pig' }
    const r = estilhacar(f, [perto, meio, longe], () => 1.8)
    expect(r.map((a) => a.corpo)).toEqual([perto, meio])
    expect(r[0]).toMatchObject({ efeito: 'veneno', nivel: 1, alcance: 1, duracao: 45 })
    expect(r[1].alcance).toBeCloseTo(0.5)
    expect(r[1].duracao).toBeCloseTo(22.5)
  })

  it('o instantâneo não tem prazo; a estranha não borrifa nada', () => {
    const perto = { x: 0, y: 59.1, z: 0, type: 'pig' }
    const cura = estilhacar({ x: 0, y: 60, z: 0, item: 'pocao_cura', pocao: { nivel: 2 } }, [perto])
    expect(cura[0]).toMatchObject({ efeito: 'cura', nivel: 2, duracao: 0 })
    expect(estilhacar({ x: 0, y: 60, z: 0, item: 'pocao_estranha' }, [perto])).toEqual([])
  })
})
