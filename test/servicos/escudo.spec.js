import { describe, it, expect } from 'vitest'
import {
  aparar,
  baixar,
  comQueSeGuarda,
  criarGuarda,
  DURABILIDADE_DO_ESCUDO,
  levantar,
  pelaFrente,
} from '../../src/servicos/escudo.js'
import { itemDef } from '../../src/servicos/items.js'
import { RECIPES } from '../../src/servicos/recipes.js'

describe('escudo — a guarda', () => {
  it('levanta e baixa', () => {
    const g = criarGuarda()
    expect(g.levantada).toBe(false)
    expect(levantar(g).levantada).toBe(true)
    expect(baixar(g).levantada).toBe(false)
  })

  it('com o que se guarda: escudo, mão vazia, ou nada com outro item', () => {
    expect(comQueSeGuarda(itemDef('shield'))).toBe('escudo')
    expect(comQueSeGuarda(null)).toBe('mao')
    expect(comQueSeGuarda(itemDef('bow'))).toBe(null)
    expect(comQueSeGuarda(itemDef('oakPlanks'))).toBe(null)
  })

  it('pela frente: yaw 0 olha para −Z', () => {
    const j = { x: 0, z: 0 }
    expect(pelaFrente(j, 0, { x: 0, z: -3 })).toBe(true)
    expect(pelaFrente(j, 0, { x: 0, z: 3 })).toBe(false)
    expect(pelaFrente(j, Math.PI, { x: 0, z: 3 })).toBe(true)
    expect(pelaFrente(j, Math.PI / 2, { x: 3, z: 0 })).toBe(true)
    expect(pelaFrente(j, Math.PI / 2, { x: -3, z: 0 })).toBe(false)
    expect(pelaFrente(j, 0, null)).toBe(true)
  })

  it('escudo levantado apara tudo que vem pela frente e desgasta', () => {
    const g = levantar(criarGuarda())
    expect(aparar(g, 2, 'mob', true, 'escudo')).toEqual({ passa: 0, desgaste: 1 })
    expect(aparar(g, 5, 'arrow', true, 'escudo')).toEqual({ passa: 0, desgaste: 6 })
    expect(aparar(g, 9, 'explosion', true, 'escudo')).toEqual({ passa: 0, desgaste: 10 })
  })

  it('escudo não apara queda, fome nem golpe pelas costas', () => {
    const g = levantar(criarGuarda())
    expect(aparar(g, 6, 'fall', true, 'escudo')).toEqual({ passa: 6, desgaste: 0 })
    expect(aparar(g, 1, 'hunger', true, 'escudo')).toEqual({ passa: 1, desgaste: 0 })
    expect(aparar(g, 4, 'mob', false, 'escudo')).toEqual({ passa: 4, desgaste: 0 })
  })

  it('guarda baixa ou outro item na mão: passa inteiro', () => {
    expect(aparar(criarGuarda(), 4, 'mob', true, 'escudo')).toEqual({ passa: 4, desgaste: 0 })
    expect(aparar(levantar(criarGuarda()), 4, 'mob', true, null)).toEqual({
      passa: 4,
      desgaste: 0,
    })
  })

  it('mão vazia segura metade do golpe de bicho e nada mais', () => {
    const g = levantar(criarGuarda())
    expect(aparar(g, 4, 'mob', true, 'mao')).toEqual({ passa: 2, desgaste: 0 })
    expect(aparar(g, 3, 'mob', true, 'mao')).toEqual({ passa: 2, desgaste: 0 })
    expect(aparar(g, 5, 'arrow', true, 'mao')).toEqual({ passa: 5, desgaste: 0 })
  })

  it('o item existe, com a durabilidade do escudo, e tem receita', () => {
    const def = itemDef('shield')
    expect(def.kind).toBe('tool')
    expect(def.tool.kind).toBe('shield')
    expect(def.durability).toBe(DURABILIDADE_DO_ESCUDO)
    expect(RECIPES.find((r) => r.result === 'shield').keyMap).toEqual({
      W: 'oakPlanks',
      I: 'iron_ingot',
    })
  })
})
