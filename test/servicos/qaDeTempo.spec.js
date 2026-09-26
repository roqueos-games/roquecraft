import { describe, it, expect } from 'vitest'
import { ref, reactive } from 'vue'
import { criarQaDeTempo } from '../../src/servicos/qaDeTempo.js'
import { TICKS_PER_DAY } from '../../src/servicos/daycycle.js'

// ⚠️ `ticks` É ESCRITO AQUI, e é `let` do componente.
//
// `setTime` é a única coisa neste módulo que ESCREVE, e a escrita tem que
// chegar no dono. Um serviço que guardasse o valor devolveria sucesso enquanto
// o sol continuava onde estava - e o A/B de dia e noite compararia duas fotos
// do mesmo instante, achando que tinha medido o ciclo.
//
// O resto lê: `engine` e `world` por getter, `climaAgora` por valor (é `const`
// reativo no componente, o mesmo objeto sempre).

function contexto(over = {}) {
  let ticks = 0
  let engine = { clima: { clarao: 0 }, setClima() {} }
  let world = { biomeAt: () => 3 }
  const agora = reactive({ chuva: 0, neve: 0, tempestade: 0 })
  const forcados = []
  const clima = {
    forcar: (chuva, bioma) => forcados.push([chuva, bioma]),
    forcado: ref(false),
    doMundo: () => ({ chuva: 0.42 }),
  }
  const ctx = {
    andarPara: (v) => {
      ticks = v
    },
    engine: () => engine,
    world: () => world,
    player: { x: 10.7, z: -3.2 },
    clima,
    agora,
    ...over,
  }
  return {
    qa: criarQaDeTempo(ctx),
    agora,
    clima,
    forcados,
    relogio: () => ticks,
    trocarMotor: (e) => {
      engine = e
    },
    trocarMundo: (w) => {
      world = w
    },
  }
}

describe('qaDeTempo', () => {
  it('setTime escreve o relógio DE VOLTA no dono', () => {
    const { qa, relogio } = contexto()
    qa.setTime(6000)
    expect(relogio(), 'o relógio ficou numa cópia; o sol não anda').toBe(6000)
  })

  it('relogioDaSala entrega ao multijogador e devolve o relógio e a sobrescrita', () => {
    const recebidos = []
    const c = contexto({
      receberRelogio: (r) => {
        recebidos.push(r)
        c.qa.setTime(r.ticks)
        c.clima.forcado.value = r.chuva
      },
      ticks: () => c.relogio(),
    })
    const r = c.qa.relogioDaSala({ ticks: 6000, chuva: 0.5 })
    expect(recebidos).toEqual([{ ticks: 6000, chuva: 0.5 }])
    expect(r, 'leu antes de acertar, ou de outro dono').toEqual({ ticks: 6000, forcado: 0.5 })
  })

  it('setTime normaliza pra dentro do dia', () => {
    const { qa, relogio } = contexto()
    // CONTROLE: sem `normalizeTicks`, um valor fora da volta deixaria o ciclo
    // num estado que o jogo nunca produz sozinho.
    qa.setTime(TICKS_PER_DAY + 500)
    expect(relogio()).toBe(500)
    qa.setTime(-100)
    expect(relogio()).toBeGreaterThanOrEqual(0)
    expect(relogio()).toBeLessThan(TICKS_PER_DAY)
  })

  it('climaQA sem argumento só LÊ', () => {
    const { qa, forcados, agora } = contexto()
    agora.chuva = 0.7
    const lido = qa.climaQA()
    expect(lido.chuva).toBe(0.7)
    expect(forcados.length, 'ler mexeu no clima').toBe(0)
    expect(lido.forcado).toBe(false)
    expect(lido.doMundo).toEqual({ chuva: 0.42 })
  })

  it('climaQA força a chuva com o bioma do jogador, pelo mundo VIVO', () => {
    const { qa, forcados, trocarMundo } = contexto()
    qa.climaQA({ chuva: 0.8 })
    // `Math.floor(10.7)` e `Math.floor(-3.2)`: a célula, não o ponto.
    expect(forcados[0]).toEqual([0.8, 3])
    trocarMundo({ biomeAt: () => 9 })
    qa.climaQA({ chuva: null })
    expect(forcados[1], 'o bioma veio do mundo morto').toEqual([null, 9])
    // Sem mundo, o bioma vira -1 em vez de derrubar o jogo.
    trocarMundo(null)
    qa.climaQA({ chuva: 0.1 })
    expect(forcados[2]).toEqual([0.1, -1])
  })

  it('o clarão vem do MOTOR, não de uma conta refeita aqui', () => {
    const { qa, trocarMotor } = contexto()
    expect(qa.climaQA().clarao).toBe(0)
    trocarMotor({ clima: { clarao: 0.93 }, setClima() {} })
    // Recalcular o clarão daria o de outro instante: o número que vale é o que
    // de fato acendeu o quadro.
    expect(qa.climaQA().clarao, 'o clarão veio do motor morto').toBe(0.93)
    trocarMotor(null)
    expect(qa.climaQA().clarao).toBe(0)
  })

  it('claraoFixo atravessa direto pro motor', () => {
    const recebidos = []
    const { qa } = contexto()
    qa.climaQA({ claraoFixo: null })
    const motor = { clima: { clarao: 0 }, setClima: (o) => recebidos.push(o) }
    const outro = contexto({ engine: () => motor }).qa
    outro.climaQA({ claraoFixo: 1 })
    expect(recebidos).toEqual([{ claraoFixo: 1 }])
    // CONTROLE: sem `'claraoFixo' in o`, um `climaQA({ chuva: 1 })` mandaria
    // `claraoFixo: undefined` e apagaria o congelamento sem ninguém pedir.
    outro.climaQA({ chuva: 1 })
    expect(recebidos.length, 'mexer na chuva apagou o clarão congelado').toBe(1)
  })
})

// ⚠️ UMA SONDA DE QA NÃO PODE LAVAR ESTADO RUIM. `?? PADRAO` só troca AUSÊNCIA
// pelo padrão; com `||`, todo valor falsy-porém-PRESENTE (`0`, `''`, `NaN`)
// vira o padrão, e a sonda relata "não existe" onde existe algo. Numa
// superfície cujo trabalho é dizer a verdade sobre o mundo, é o defeito mais
// caro possível: o harness fica cego no caso que ele existe pra pegar.
describe('qaDeTempo — a sonda não inventa nem apaga', () => {
  it('o bioma ZERO é um bioma, não "sem bioma"', () => {
    // `world()?.biomeAt(...) ?? -1`: com `||`, o primeiro bioma da tabela —
    // índice 0 — chega em `clima.forcar` como -1, que é o código de "não sei
    // qual bioma". Forçar chuva no bioma 0 passaria a não ter efeito nenhum e
    // ninguém saberia por quê.
    const { qa, forcados } = contexto({ world: () => ({ biomeAt: () => 0 }) })
    qa.climaQA({ chuva: 1 })
    expect(forcados).toEqual([[1, 0]])
  })

  it('sem mundo carregado, o bioma é o código de desconhecido', () => {
    const { qa, forcados } = contexto({ world: () => null })
    qa.climaQA({ chuva: 1 })
    expect(forcados).toEqual([[1, -1]])
  })

  it('clarão NaN sai como NaN, não como zero', () => {
    // Uma sonda que troca NaN por 0 mente sobre um motor quebrado, e o teste de
    // relâmpago passaria a medir "sem clarão" em vez de "conta estourada".
    const { qa } = contexto({ engine: () => ({ clima: { clarao: NaN }, setClima() {} }) })
    expect(Number.isNaN(qa.climaQA({}).clarao)).toBe(true)
  })

  it('sem motor, o clarão é zero', () => {
    const { qa } = contexto({ engine: () => null })
    expect(qa.climaQA({}).clarao).toBe(0)
  })
})
