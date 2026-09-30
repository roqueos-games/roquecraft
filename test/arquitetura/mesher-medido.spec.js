import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  FOLGA_DIAS,
  TOLERANCIA,
  HISTORICO,
  vereditoDoMesher,
  comMedicao,
} from '../../qa/lib/regua-do-mesher.mjs'

//
// O CUSTO DO MESHER TEM QUE TER SIDO MEDIDO, E NÃO PODE TER SUBIDO.
//
// ⚠️ O CI roda em 2 vCPU e não afirma orçamento de quadro nenhum desde a
// extração. O que cabe aqui é o mesmo desenho da varredura das sondas: a
// máquina de verdade mede (`node qa/bench-mesher.mjs --ledger`), grava
// `qa/bench-mesher.json`, e este teste cobra o ledger: existe, não está velho,
// e a medição mais nova não está mais de 10 % acima da melhor da mesma máquina.
// Para aceitar um mesher mais lento DE PROPÓSITO, apaga-se do ledger a medição
// que servia de piso, no mesmo commit, com o motivo escrito nele.
//

const LEDGER = resolve('qa/bench-mesher.json')
const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : null

const mac = { plataforma: 'darwin', arquitetura: 'arm64', cpu: 'Apple M2', node: 'v22' }
const linux = { plataforma: 'linux', arquitetura: 'x64', cpu: 'Xeon', node: 'v22' }
const DIA = 86_400_000
const agora = Date.parse('2026-09-30T12:00:00Z')
const em = (diasAtras, msPorSecao, maquina = mac) => ({
  quando: new Date(agora - diasAtras * DIA).toISOString(),
  maquina,
  msPorSecao,
})

describe('a regra, pura', () => {
  it('sem medição nenhuma reprova, e diz o comando', () => {
    expect(vereditoDoMesher(null, agora)).toMatchObject({ ok: false, motivo: /bench-mesher/ })
    expect(vereditoDoMesher({ medicoes: [] }, agora).ok).toBe(false)
  })

  it('a primeira medição de uma máquina passa: não tem com quem se comparar', () => {
    expect(vereditoDoMesher({ medicoes: [em(0, 1.5)] }, agora).ok).toBe(true)
    // Medições de OUTRA máquina não servem de piso.
    expect(vereditoDoMesher({ medicoes: [em(3, 0.4, linux), em(0, 1.5)] }, agora).ok).toBe(true)
  })

  it('dentro da tolerância passa; acima, reprova dizendo os dois números', () => {
    const piso = 1.2
    const noLimite = +(piso * (1 + TOLERANCIA)).toFixed(3)
    expect(vereditoDoMesher({ medicoes: [em(5, piso), em(0, noLimite)] }, agora).ok).toBe(true)
    const acima = vereditoDoMesher({ medicoes: [em(5, piso), em(0, 1.35)] }, agora)
    expect(acima.ok).toBe(false)
    expect(acima.motivo).toMatch(/mais lento/)
    expect(acima.motivo).toContain('1.35')
    expect(acima.motivo).toContain('1.2')
  })

  it('o piso é a MELHOR medição anterior da máquina, não a última', () => {
    // Uma piora em degraus de 8 % não pode passar só porque cada degrau cabe.
    const degraus = [em(9, 1.0), em(6, 1.08), em(3, 1.16), em(0, 1.25)]
    expect(vereditoDoMesher({ medicoes: degraus }, agora).ok).toBe(false)
  })

  it('medição velha reprova, mesmo boa', () => {
    const velha = vereditoDoMesher({ medicoes: [em(FOLGA_DIAS + 1, 0.5)] }, agora)
    expect(velha.ok).toBe(false)
    expect(velha.motivo).toMatch(/dias/)
    expect(vereditoDoMesher({ medicoes: [em(FOLGA_DIAS, 0.5)] }, agora).ok).toBe(true)
  })

  it('medição sem número reprova', () => {
    expect(vereditoDoMesher({ medicoes: [em(0, 0)] }, agora).ok).toBe(false)
    expect(vereditoDoMesher({ medicoes: [em(0, NaN)] }, agora).ok).toBe(false)
  })

  it('`comMedicao` põe a nova no fim e guarda só as últimas da máquina', () => {
    let ledger = null
    for (let i = 0; i < HISTORICO + 5; i++)
      ledger = comMedicao(ledger, em(HISTORICO + 5 - i, 1 + i))
    expect(ledger.medicoes).toHaveLength(HISTORICO)
    expect(ledger.medicoes.at(-1).msPorSecao).toBe(1 + HISTORICO + 4)
    // Outra máquina não é apagada pela poda desta.
    const comLinux = comMedicao(ledger, em(0, 3, linux))
    expect(comLinux.medicoes).toHaveLength(HISTORICO + 1)
    expect(comLinux.medicoes.at(-1).maquina).toEqual(linux)
  })
})

describe('o ledger deste repo', () => {
  it('existe, é recente, e o mesher não ficou mais lento', () => {
    expect(
      ledger,
      'sem qa/bench-mesher.json: rode node qa/bench-mesher.mjs --ledger',
    ).not.toBeNull()
    const veredito = vereditoDoMesher(ledger)
    expect(veredito.ok, veredito.motivo).toBe(true)
  })
})
