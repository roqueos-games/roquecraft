import { describe, it, expect } from 'vitest'
import { criarFimDeJogo, celulasDaSaida } from '../../src/servicos/fimDeJogo.js'
import { FONTE } from '../../src/servicos/endWorldgen.js'
import { ID } from '../../src/servicos/blocks.js'

function montar(morto = false) {
  const log = { edicoes: [], avisos: [], salvou: 0, creditos: 0 }
  let dragaoMorto = morto
  const f = criarFimDeJogo({
    dragaoMorto: () => dragaoMorto,
    marcarDragaoMorto: (v) => (dragaoMorto = v),
    editar: (x, y, z, id) => log.edicoes.push([x, y, z, id]),
    avisar: (k) => log.avisos.push(k),
    salvar: () => log.salvou++,
    rolarCreditos: () => log.creditos++,
  })
  return { f, log, morto: () => dragaoMorto }
}

describe('fimDeJogo — o dragão cai, o portal acende, os créditos rolam', () => {
  it('o portal de saída são as nove células do miolo da fonte, um acima do degrau', () => {
    const c = celulasDaSaida()
    expect(c).toHaveLength(9)
    expect(c.every((k) => k.y === FONTE.y + 1 && k.id === ID.endPortal)).toBe(true)
    expect(c.find((k) => k.x === FONTE.x && k.z === FONTE.z)).toBeTruthy()
  })

  it('⚠️ o dragão cai UMA vez: portal escrito, save marcado, aviso, e a segunda chamada é nula', () => {
    const { f, log, morto } = montar()
    expect(f.dragaoDeveExistir()).toBe(true)
    expect(f.dragaoCaiu()).toBe(true)
    expect(morto()).toBe(true)
    expect(log.edicoes).toHaveLength(9)
    expect(log.edicoes.every(([, y, , id]) => y === FONTE.y + 1 && id === ID.endPortal)).toBe(true)
    expect(log.avisos).toEqual(['roqueCraft.fim.dragaoCaiu'])
    expect(log.salvou).toBe(1)
    expect(f.dragaoDeveExistir()).toBe(false)
    expect(f.dragaoCaiu()).toBe(false)
    expect(log.edicoes).toHaveLength(9)
  })

  it('sair do Fim só rola os créditos com o dragão morto', () => {
    const vivo = montar(false)
    expect(vivo.f.saiuDoFim()).toBe(false)
    expect(vivo.log.creditos).toBe(0)
    const morto = montar(true)
    expect(morto.f.saiuDoFim()).toBe(true)
    expect(morto.log.creditos).toBe(1)
    expect(morto.f.dragaoDeveExistir(), 'reabrindo o save com o dragão morto ele não volta').toBe(
      false,
    )
  })
})
