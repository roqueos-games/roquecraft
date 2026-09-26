import { describe, it, expect } from 'vitest'
import {
  createNoiseContext,
  findSpawn,
  notaDeSpawn,
  terrainHeight,
  biomeAt,
  SPAWN_ALTURA_IDEAL,
} from '../../src/servicos/worldgen.js'
import { SEA_LEVEL } from '../../src/servicos/constants.js'

// "Não nasci no meio de uma montanha" é o requisito, e ele não se prova numa
// semente só: a versão anterior funcionava na maioria e falhava em algumas -
// justamente as que o founder abriu (y=116, bioma Nevado, print de 2026-08-22).
//
// Por isso o teste varre uma AMOSTRA de sementes e afirma sobre a distribuição.
// É o mesmo tipo de garantia que o jogador tem: ele não escolhe a semente.
const SEMENTES = [
  20260819, 1, 7, 42, 263907, 999, 12345, 88, 20260822, 555, 31337, 2024, 77777, 101, 4242, 6,
  1000003, 314159, 271828, 8675309,
]

const DESNIVEIS = [
  [8, 0],
  [-8, 0],
  [0, 8],
  [0, -8],
  [16, 0],
  [-16, 0],
  [0, 16],
  [0, -16],
]

function medir(semente) {
  const nz = createNoiseContext(semente)
  const t0 = performance.now()
  const sp = findSpawn(nz)
  const ms = performance.now() - t0
  const x = sp.x - 0.5
  const z = sp.z - 0.5
  const h = terrainHeight(nz, x, z)
  let desnivel = 0
  for (const [ox, oz] of DESNIVEIS) {
    desnivel = Math.max(desnivel, Math.abs(terrainHeight(nz, x + ox, z + oz) - h))
  }
  return { semente, sp, h, desnivel, bioma: biomeAt(nz, x, z, h), ms }
}

describe('ponto de nascimento', () => {
  const casos = SEMENTES.map(medir)

  it('nunca nasce afogado', () => {
    for (const c of casos) {
      expect(c.sp.y, `semente ${c.semente} nasce em y=${c.sp.y}`).toBeGreaterThan(SEA_LEVEL)
    }
  })

  it('nunca nasce no topo de uma montanha', () => {
    // O relato foi y=116 com o mar em 62: 54 blocos acima. O teto aqui é o
    // dobro da faixa ideal, que já é folgado - o que ele barra é o pico.
    const teto = SEA_LEVEL + 30
    const altos = casos.filter((c) => c.sp.y > teto)
    expect(
      altos.map((c) => `${c.semente}:y=${Math.round(c.sp.y)}`),
      `nasceu alto demais (teto ${teto})`,
    ).toEqual([])
  })

  it('nasce em terreno plano, não em encosta', () => {
    // Desnível é o que separa platô de ladeira. Num pico passa de 20.
    const ingremes = casos.filter((c) => c.desnivel > 12)
    expect(
      ingremes.map((c) => `${c.semente}:desnível=${Math.round(c.desnivel)}`),
      'nasceu numa encosta',
    ).toEqual([])
  })

  it('a maioria nasce dentro da faixa confortável', () => {
    const bons = casos.filter(
      (c) => c.sp.y >= SPAWN_ALTURA_IDEAL.min && c.sp.y <= SPAWN_ALTURA_IDEAL.max + 6,
    )
    // Não dá pra exigir 100%: numa semente montanhosa o lugar perfeito pode não
    // existir em 1400 blocos, e forçar levaria a procurar pra sempre.
    expect(
      bons.length / casos.length,
      `só ${bons.length}/${casos.length} na faixa: ${casos.map((c) => Math.round(c.sp.y)).join(' ')}`,
    ).toBeGreaterThan(0.7)
  })

  it('não demora a ponto de segurar a tela de carregamento', () => {
    const pior = Math.max(...casos.map((c) => c.ms))
    console.log(
      `  [spawn] pior caso ${pior.toFixed(0)}ms · alturas ${casos.map((c) => Math.round(c.sp.y)).join(' ')}`,
    )
    expect(pior, 'a busca de spawn está cara demais').toBeLessThan(900)
  })
})

// A nota é o coração do conserto: é ela que decide entre um platô e um pico.
// Testá-la direto, com terreno construído à mão, não depende de sorte.
describe('nota de spawn', () => {
  const nz = createNoiseContext(20260819)

  it('recusa o que está no mar', () => {
    // Ponto bem no meio do oceano da semente: sem terra em volta.
    let achou = null
    for (let r = 200; r < 4000 && !achou; r += 200) {
      const h = terrainHeight(nz, r, r)
      if (h <= SEA_LEVEL - 4) achou = r
    }
    if (achou) expect(notaDeSpawn(nz, achou, achou)).toBeNull()
  })

  it('dá nota PIOR pra ponto alto que pra ponto na faixa ideal', () => {
    // Procura na malha um ponto baixo e um alto na mesma semente e compara.
    let baixo = null
    let alto = null
    for (let x = -1200; x <= 1200 && !(baixo && alto); x += 48) {
      for (let z = -1200; z <= 1200; z += 48) {
        const av = notaDeSpawn(nz, x, z)
        if (!av) continue
        if (!baixo && av.h <= SPAWN_ALTURA_IDEAL.max && av.desnivel <= 3) baixo = av
        if (!alto && av.h > SEA_LEVEL + 40) alto = av
        if (baixo && alto) break
      }
    }
    expect(baixo, 'a semente não tem nenhum ponto baixo e plano?').toBeTruthy()
    if (alto) {
      expect(
        alto.nota,
        `alto (y=${Math.round(alto.h)}) tirou ${alto.nota.toFixed(1)} e baixo (y=${Math.round(baixo.h)}) tirou ${baixo.nota.toFixed(1)}`,
      ).toBeGreaterThan(baixo.nota)
    }
  })
})
