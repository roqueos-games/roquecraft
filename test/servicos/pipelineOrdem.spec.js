import { describe, it, expect } from 'vitest'
import { createPipeline } from '../../src/servicos/chunkPipeline.js'
import { SECTION_COUNT } from '../../src/servicos/constants.js'

// O founder nasceu num pico e viu o terreno em volta chegar em LAJES
// HORIZONTAIS empilhadas, com vão entre elas (print de 2026-08-22).
//
// Não era distância: era o eixo vertical não existir na prioridade.
// `tryLight` empurra as 8 seções de um chunk na ordem sy = 0..7, o sort do
// JavaScript é ESTÁVEL, e a comparação usava só (cx, cz). Resultado: as seções
// saíam de baixo pra cima, e quem estava na seção 7 recebia a própria seção por
// ÚLTIMO enquanto o subsolo invisível já estava pronto.
//
// Estes testes olham a ORDEM em que a malha é emitida, que é a única coisa que
// o jogador percebe.

// ⚠️ RELÓGIO DE MENTIRA, um milissegundo por consulta.
//
// O orçamento do `tick` é tempo de parede: numa máquina rápida drena vinte
// trabalhos, numa carregada drena três, e a ORDEM de emissão muda junto. Este
// arquivo reprovou uma vez dentro da suíte completa por 0,12 de diferença
// depois de passar cinco execuções isoladas — flutuação de máquina, não
// regressão. Com o relógio controlado, `tick(30)` sempre drena a mesma
// quantidade e o teste afirma o que quer afirmar.
function rodar({ sy, seed = 20260819, distancia = 2, ticks = 260 }) {
  const malhas = []
  let relogio = 0
  const pipe = createPipeline({
    seed,
    renderDistance: distancia,
    agora: () => (relogio += 1),
    emit: (m) => {
      if (m.t === 'mesh') malhas.push({ cx: m.cx, cz: m.cz, sy: m.sy })
    },
  })
  pipe.setCenter(0, 0, sy)
  for (let i = 0; i < ticks && malhas.length < 90; i++) pipe.tick(30)
  return malhas
}

const distancia3d = (m, sy) => Math.hypot(m.cx, m.cz, (m.sy - sy) * 1.5)

// ⚠️ NÃO dá pra afirmar "a seção do jogador vem primeiro": ela pode ser AR.
// Nesta semente o terreno para na seção 4, então com o jogador na 7 as seções
// 5, 6 e 7 não existem e nunca são emitidas - a primeira versão deste arquivo
// reprovou por essa premissa errada, não por bug. O que dá pra afirmar, e é o
// que o jogador sente, é a DIREÇÃO: a fila anda a partir do nível dele.
const mediaSy = (lista) => lista.reduce((a, m) => a + m.sy, 0) / lista.length

describe('ordem de carregamento da malha', () => {
  it('a mesma semente carrega de cima pra baixo ou de baixo pra cima conforme a altura do jogador', () => {
    // É o teste que prova o eixo vertical existir: só a altura do jogador muda
    // entre as duas execuções, e a ordem tem que inverter.
    //
    // ⚠️ A comparação é sobre as PRIMEIRAS malhas, não sobre a média de dez.
    // Um chunk é aceso de uma vez e emite as cinco seções dele juntas, então a
    // média sobre um múltiplo de cinco dá o mesmo número nos dois casos (2.0
    // contra 1.6, medido) e não discrimina nada. Quem discrimina é a ponta.
    const embaixo = rodar({ sy: 0 })
    const emCima = rodar({ sy: 7 })
    expect(
      emCima[0].sy,
      `a primeira malha com o jogador no topo foi a seção ${emCima[0].sy} e no fundo a ${embaixo[0].sy}`,
    ).toBeGreaterThan(embaixo[0].sy)
    expect(mediaSy(emCima.slice(0, 3))).toBeGreaterThan(mediaSy(embaixo.slice(0, 3)) + 1)
  })

  it('no topo do mundo, o subsolo NÃO chega antes da superfície', () => {
    // O defeito do print: jogador no pico e o pipeline entregando a seção 0
    // primeiro, em lajes empilhadas de baixo pra cima.
    const malhas = rodar({ sy: 7 })
    const primeiras = mediaSy(malhas.slice(0, 8))
    const ultimas = mediaSy(malhas.slice(-8))
    expect(
      primeiras,
      `média sy das 8 primeiras é ${primeiras.toFixed(1)} e das 8 últimas ${ultimas.toFixed(1)} — ` +
        `ordem: ${malhas
          .slice(0, 16)
          .map((m) => m.sy)
          .join('')}`,
    ).toBeGreaterThan(ultimas)
  })

  it('no fundo, a ordem é a oposta', () => {
    const malhas = rodar({ sy: 0 })
    expect(mediaSy(malhas.slice(0, 8))).toBeLessThan(mediaSy(malhas.slice(-8)))
  })

  it('a ordem cresce em distância 3D, não em qualquer ordem', () => {
    const sy = 5
    const malhas = rodar({ sy })
    // Não exige monotonia perfeita: a luz libera um chunk inteiro de cada vez,
    // então há degraus. Exige que o começo esteja mais perto que o fim.
    const n = Math.min(10, malhas.length)
    const inicio = malhas.slice(0, n).reduce((a, m) => a + distancia3d(m, sy), 0) / n
    const fim = malhas.slice(-n).reduce((a, m) => a + distancia3d(m, sy), 0) / n
    expect(inicio, `começo ${inicio.toFixed(2)} contra fim ${fim.toFixed(2)}`).toBeLessThan(fim)
  })

  it('mudar de seção sem mudar de chunk reordena a fila', () => {
    // Escalar uma montanha dentro do mesmo chunk muda a seção e não o chunk.
    // Sem isso, subir 60 blocos não reordenava nada.
    const malhas = []
    const pipe = createPipeline({
      seed: 20260819,
      renderDistance: 2,
      emit: (m) => {
        if (m.t === 'mesh') malhas.push({ cx: m.cx, cz: m.cz, sy: m.sy })
      },
    })
    pipe.setCenter(0, 0, 0)
    for (let i = 0; i < 40 && malhas.length < 10; i++) pipe.tick(30)
    const antes = malhas.length
    const antesMedia = mediaSy(malhas.slice(0, antes))
    pipe.setCenter(0, 0, 7) // mesmo chunk, outra seção
    for (let i = 0; i < 60 && malhas.length < antes + 12; i++) pipe.tick(30)
    const depois = malhas.slice(antes)
    expect(depois.length, 'nada foi malhado depois de subir').toBeGreaterThan(4)
    expect(
      mediaSy(depois.slice(0, 6)),
      `antes de subir a média era ${antesMedia.toFixed(1)} e depois de subir ` +
        `continuou em ${mediaSy(depois.slice(0, 6)).toFixed(1)}: ${depois.map((m) => m.sy).join('')}`,
    ).toBeGreaterThan(antesMedia)
  })

  it('toda seção acaba chegando — priorizar não é esquecer', () => {
    const malhas = rodar({ sy: 7, distancia: 1, ticks: 900 })
    const niveis = new Set(malhas.map((m) => m.sy))
    expect(niveis.size, `só chegaram as seções ${[...niveis].sort().join(',')}`).toBeGreaterThan(2)
    expect(SECTION_COUNT).toBe(8)
  })
})
