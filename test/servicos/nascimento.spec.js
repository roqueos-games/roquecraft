import { describe, it, expect } from 'vitest'
import { landingSpot, safeSpawn } from '../../src/servicos/physics.js'
import {
  chaoDeVerdade,
  apoiadoEmArvore,
  topoDoSolo,
  VIZINHAS,
  pousoNaColuna,
  chaoParaNascer,
  pousarJogador,
} from '../../src/servicos/nascimento.js'

// NASCER NA SUPERFÍCIE, NUNCA NUMA CAVERNA.
//
// Em 2026-08-23 o founder mandou um print escuro e fragmentado e disse "o mapa
// gerado está lá no céu". Não estava: o JOGADOR estava embaixo do mapa. O
// harness de nascimento mediu dez mundos novos e achou DOIS abrindo com o
// jogador quarenta blocos abaixo do chão, com a tela em brilho médio 19 de 255
// — semente 942457 em y=34 com o chão em 74, semente 42 em y=31 com o chão
// em 75.
//
// A causa: `landingSpot` desce procurando "sólido embaixo e dois de ar", e o
// componente passava `minY = 1`. Numa coluna com caverna ela atravessa a
// superfície e o piso da caverna satisfaz o teste perfeitamente.
//
// A função em si está certa — quem tem que dar o piso é quem chama, porque só
// ele sabe onde é a superfície. Estes testes fixam o contrato dos dois lados.

/** Coluna com superfície em `sup` e uma caverna vazia entre `c0` e `c1`. */
const comCaverna = (sup, c0, c1) => (x, y) => {
  if (y > sup) return 0
  if (y >= c0 && y <= c1) return 0
  return 1
}

describe('roquecraft - nascimento na superfície', () => {
  it('sem piso, a busca cai na caverna — o defeito', () => {
    // Documenta o comportamento que morde quando o chamador esquece o piso.
    const solidAt = comCaverna(74, 30, 40)
    const semFiltro = () => true
    // topHint baixo de propósito: simula o caso em que o topo real não ajuda
    const spot = landingSpot(solidAt, 8, 8, 29, 1, semFiltro)
    expect(spot, 'sem piso a busca chega na caverna').toBeTruthy()
    expect(spot.y).toBeLessThan(45)
  })

  it('com piso relativo à superfície, nasce no chão de fora', () => {
    const solidAt = comCaverna(74, 30, 40)
    const piso = 74 - 6
    const spot = landingSpot(solidAt, 8, 8, 74, piso)
    expect(spot, 'não achou a superfície').toBeTruthy()
    expect(spot.y).toBe(75)
    expect(spot.y).toBeGreaterThan(piso)
  })

  it('o piso impede QUALQUER resultado dentro da caverna', () => {
    const solidAt = comCaverna(74, 30, 40)
    const piso = 74 - 6
    for (const topHint of [74, 80, 120, 40, 30]) {
      const spot = landingSpot(solidAt, 8, 8, topHint, piso)
      if (spot) expect(spot.y, `topHint ${topHint} caiu na caverna`).toBeGreaterThan(piso)
    }
  })

  it('coluna sem caverna continua nascendo em cima', () => {
    const solidAt = (x, y) => (y <= 70 ? 1 : 0)
    const spot = landingSpot(solidAt, 8, 8, 70, 64)
    expect(spot.y).toBe(71)
  })

  it('o fallback `safeSpawn` também respeita o piso', () => {
    const solidAt = comCaverna(74, 30, 40)
    const piso = 74 - 6
    const spot = safeSpawn(solidAt, 8.5, 8.5, piso)
    if (spot) expect(spot.y).toBeGreaterThanOrEqual(piso)
  })

  /*
   * O PISO CALCULADO A PARTIR DA COPA É UM SOTERRAMENTO AO CONTRÁRIO.
   *
   * `surfaceY` conta folha e tronco, então numa floresta o "topo" é a copa. Com
   * piso `copa - 6` a busca filtrada não chega na terra — para seis blocos
   * acima dela — e a busca sem filtro aceita a copa. O jogador abre o jogo em
   * cima das árvores, vendo o mundo por entre as folhas. Medido em produção
   * (25·74·1, Floresta) e no harness: 7 de 25 mundos.
   *
   * A métrica de soterramento não vê nada: em cima da copa `y == surfaceY`.
   */
  it('piso tirado da COPA faz a busca pousar na copa — o defeito', () => {
    // terra até 74, copa em 80..84, ar entre 75 e 79
    const solidAt = (x, y) => (y <= 74 || (y >= 80 && y <= 84) ? 1 : 0)
    const semFolha = (x, y) => !(y >= 80 && y <= 84)
    const copa = 85 // o que `surfaceY` devolveria
    const pisoErrado = copa - 6 // 79: acima da terra
    const spot =
      landingSpot(solidAt, 8, 8, copa, pisoErrado, semFolha) ||
      landingSpot(solidAt, 8, 8, copa, pisoErrado)
    expect(spot, 'a busca achou alguma coisa').toBeTruthy()
    expect(spot.y, 'pousou na copa, não no chão').toBeGreaterThan(79)
  })

  it('piso tirado do SOLO pousa na terra, atravessando a árvore', () => {
    const solidAt = (x, y) => (y <= 74 || (y >= 80 && y <= 84) ? 1 : 0)
    const semFolha = (x, y) => !(y >= 80 && y <= 84)
    const copa = 85
    const solo = 75 // o que `topoDoSolo` devolve: primeiro não-árvore + 1
    const spot = landingSpot(solidAt, 8, 8, copa, solo - 6, semFolha)
    expect(spot.y, 'tinha que pousar na terra em 75').toBe(75)
  })

  it('nada de nascer em cima de árvore quando há chão logo abaixo', () => {
    // folha em 78..80, chão real em 74; o filtro rejeita folha e a busca
    // continua até o chão — mas sem furar o piso.
    const solidAt = (x, y) => (y <= 74 || (y >= 78 && y <= 80) ? 1 : 0)
    const ehFolha = (x, y) => y >= 78 && y <= 80
    const spot = landingSpot(solidAt, 8, 8, 82, 68, (x, y, z) => !ehFolha(x, y, z))
    expect(spot.y).toBe(75)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// A POLÍTICA, e não mais só os primitivos.
//
// Tudo acima testa `landingSpot` e `safeSpawn`: as peças. A política que as
// COMBINA — atravessar a árvore pra achar a terra, andar de lado quando a
// coluna é um tronco, recusar a vizinha que está num paredão — morava dentro do
// componente de 4.629 linhas, onde ninguém a testava sem subir navegador.
//
// Ela quebrou três vezes em produção, cada uma de um jeito: enterrado na
// montanha, em cima da copa, dentro de uma caverna. Extraída pra
// `services/roquecraft/nascimento.js` na rodada 18, cada armadilha vira aqui um
// mundo de sete linhas.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Mundo de mentira, montado por coluna.
 *
 * `colunas` é um mapa "x,z" → array indexado por y com a CHAVE do bloco. Fora
 * do mapa é ar. Simples de propósito: mundo de teste que precisa de explicação
 * é um segundo mundo pra manter.
 */
function mundo(colunas) {
  const chaveEm = (x, y, z) => colunas[`${x},${z}`]?.[y] || 'air'
  const solidAt = (x, y, z) => {
    const k = chaveEm(x, y, z)
    return k !== 'air' && k !== 'water'
  }
  const surfaceY = (x, z) => {
    const col = colunas[`${x},${z}`]
    if (!col) return null
    for (let y = col.length - 1; y >= 0; y--) if (col[y] && col[y] !== 'air') return y + 1
    return null
  }
  return { chaveEm, solidAt, surfaceY, landingSpot, safeSpawn }
}

/** Coluna de pedra com grama no topo. */
function campo(alturaDoSolo) {
  const col = []
  for (let y = 0; y <= alturaDoSolo; y++) col[y] = y === alturaDoSolo ? 'grassBlock' : 'stone'
  return col
}

/** Terra até `solo`, tronco de `solo+1` a `solo+6`, folha em `solo+7` e `+8`. */
function arvore(solo) {
  const col = campo(solo)
  for (let y = solo + 1; y <= solo + 6; y++) col[y] = 'oakLog'
  col[solo + 7] = 'oakLeaves'
  col[solo + 8] = 'oakLeaves'
  return col
}

describe('nascimento - as peças da política', () => {
  it('folha não conta como chão de verdade; grama conta', () => {
    const m = mundo({ '0,0': arvore(60) })
    expect(chaoDeVerdade(m.chaveEm, 0, 67, 0), 'folha deveria ser recusada').toBe(false)
    expect(chaoDeVerdade(m.chaveEm, 0, 60, 0), 'grama deveria ser aceita').toBe(true)
  })

  it('apoiadoEmArvore olha o bloco SOB o pé, não o do pé', () => {
    const m = mundo({ '0,0': arvore(60) })
    expect(apoiadoEmArvore(m.chaveEm, 0.5, 68, 0.5), 'pé em 68, folha em 67').toBe(true)
    expect(apoiadoEmArvore(m.chaveEm, 0.5, 61, 0.5), 'pé em 61, grama em 60').toBe(false)
  })

  // ⚠️ ARMADILHA 1: `surfaceY` conta árvore.
  it('topoDoSolo atravessa a árvore e devolve a TERRA, não a copa', () => {
    const m = mundo({ '0,0': arvore(60) })
    const copa = m.surfaceY(0, 0)
    expect(copa, 'a coluna tem copa em 69').toBe(69)
    expect(topoDoSolo(m.chaveEm, 0, 0, copa), 'devia devolver a terra, 8 blocos abaixo').toBe(61)
  })

  it('topoDoSolo não chuta em coluna estranha: devolve o topo original', () => {
    const m = mundo({ '0,0': [] })
    expect(topoDoSolo(m.chaveEm, 0, 0, 70)).toBe(70)
    expect(topoDoSolo(m.chaveEm, 0, 0, null)).toBe(null)
    expect(topoDoSolo(m.chaveEm, 0, 0, undefined)).toBe(undefined)
  })

  it('topoDoSolo desce no máximo 26 blocos', () => {
    // Coluna absurda: 40 blocos de tronco. A política não pode descer pra
    // sempre procurando terra numa coluna que o gerador nunca faria.
    const col = campo(20)
    for (let y = 21; y <= 60; y++) col[y] = 'oakLog'
    const m = mundo({ '0,0': col })
    expect(topoDoSolo(m.chaveEm, 0, 0, 61), 'passou do limite de 26').toBeGreaterThan(61 - 27)
  })

  it('as vizinhas vêm em ordem de distância, e a mais perto é a primeira', () => {
    expect(VIZINHAS.length, 'raio 3 sem o centro são 48 casas').toBe(48)
    const d = ([dx, dz]) => dx * dx + dz * dz
    expect(d(VIZINHAS[0]), 'a primeira tem que ser adjacente').toBe(1)
    // A ORDEM é a regra: sem ela, "andar de lado" vira "pular pro canto do
    // quadrado de raio 3".
    for (let i = 1; i < VIZINHAS.length; i++) {
      expect(d(VIZINHAS[i])).toBeGreaterThanOrEqual(d(VIZINHAS[i - 1]))
    }
  })
})

describe('nascimento - a política inteira', () => {
  it('em campo aberto pousa em cima da grama', () => {
    const m = mundo({ '0,0': campo(64) })
    const r = chaoParaNascer(m, 0.5, 0.5)
    expect(r.safe, 'não achou pouso em campo aberto').toBeTruthy()
    expect(r.safe.y).toBe(65)
  })

  it('pousoNaColuna calcula o piso a partir do SOLO, não da copa', () => {
    // É a diferença entre alcançar a terra e ficar oito blocos acima dela.
    const m = mundo({ '0,0': arvore(60) })
    const r = pousoNaColuna(m, 0.5, 0.5, 0, 100)
    expect(r.top, 'top é a copa').toBe(69)
    expect(r.solo, 'solo é a terra').toBe(61)
    expect(r.solo, 'se solo virar igual a top, o piso da busca sobe 8 blocos').toBeLessThan(r.top)
  })

  // ⚠️ ARMADILHA 3: a própria coluna do nascimento é uma árvore.
  it('coluna que é tronco: anda de lado em vez de pousar na copa', () => {
    const m = mundo({
      '0,0': arvore(60), // origem: tronco de 61 a 66, folha em 67 e 68
      '1,0': campo(60), // vizinha imediata, mesma altura de terreno
    })
    const r = chaoParaNascer(m, 0.5, 0.5)
    expect(r.safe, 'não achou pouso nenhum').toBeTruthy()
    expect(
      apoiadoEmArvore(m.chaveEm, r.safe.x, r.safe.y, r.safe.z),
      'pousou EM CIMA da árvore - é o defeito de agosto de volta',
    ).toBe(false)
    expect(Math.floor(r.safe.x), 'devia ter andado pra coluna vizinha').toBe(1)
  })

  it('a vizinha só serve se o terreno estiver na mesma altura (±4)', () => {
    const m = mundo({
      '0,0': arvore(60),
      '1,0': campo(90), // paredão: 30 blocos acima
      '0,1': campo(20), // buraco: 40 blocos abaixo
    })
    const r = chaoParaNascer(m, 0.5, 0.5)
    // Nenhuma vizinha serve. A política devolve o pouso da origem em vez de
    // atirar o jogador pro alto de um paredão.
    expect(r.safe).toBeTruthy()
    expect(Math.floor(r.safe.y), 'subiu no paredão').toBeLessThan(80)
  })

  it('a vizinha EXATAMENTE 4 blocos acima ainda serve; 5 não', () => {
    // ⚠️ `Math.abs(v.safe.y - r.solo) > 4` afrouxado para `>=` corta a borda da
    // tolerância, e a política desiste de uma vizinha perfeitamente boa —
    // caindo no último recurso, que é nascer EM CIMA da árvore. É o defeito de
    // agosto voltando pela porta dos fundos.
    //
    // A origem é tronco (solo 60), então a busca lateral roda. `pousoNaColuna`
    // pousa em `solo + 1`, e o solo da origem é 61: uma vizinha com solo 64
    // pousa em 65, que é exatamente 4 acima.
    const naBorda = mundo({ '0,0': arvore(60), '1,0': campo(64) })
    expect(Math.floor(chaoParaNascer(naBorda, 0.5, 0.5).safe.x)).toBe(1)

    const umAlemDaBorda = mundo({ '0,0': arvore(60), '1,0': campo(65) })
    const r = chaoParaNascer(umAlemDaBorda, 0.5, 0.5)
    expect(Math.floor(r.safe.x), 'subiu no paredão').toBe(0)
  })

  it('sem solo conhecido, a tolerância de altura não recusa a vizinha', () => {
    // `r.solo !== null` invertido inverte a guarda: quando o solo É conhecido
    // ela para de conferir a altura (e o jogador vai parar no alto de um
    // paredão), e quando NÃO é conhecido ela compara com `null` — que vira 0 —
    // e recusa toda vizinha acima de 4.
    const m = mundo({ '0,0': arvore(60), '1,0': campo(60) })
    expect(Math.floor(chaoParaNascer(m, 0.5, 0.5).safe.x)).toBe(1)
  })

  it('a descida pela árvore inclui a última camada do limite', () => {
    // `y >= limite` apertado para `>` perde exatamente o bloco do fundo da
    // busca. Numa coluna com 26 blocos de tronco, a terra está NO limite: com
    // `>` a busca passa reto e devolve a copa como se fosse o solo.
    // Grama em 30, tronco de 31 a 55: a copa fica em 56, o limite da busca é
    // 56 - 26 = 30, e a grama está EXATAMENTE nele.
    const col = campo(30)
    for (let y = 31; y <= 55; y++) col[y] = 'oakLog'
    const m = mundo({ '0,0': col })
    expect(m.surfaceY(0, 0), 'a copa fica em 56').toBe(56)
    expect(topoDoSolo(m.chaveEm, 0, 0, 56)).toBe(31)
  })

  it('sem vizinha nenhuma, devolve o pouso da origem em vez de nada', () => {
    const m = mundo({ '0,0': arvore(60) })
    const r = chaoParaNascer(m, 0.5, 0.5)
    // Melhor nascer em cima da árvore do que não nascer: este último recurso é
    // deliberado, e some se alguém "limpar" o retorno.
    expect(r.safe, 'devolveu nada em vez do último recurso').toBeTruthy()
  })
})

describe('pousarJogador: nascer parado', () => {
  const emQueda = () => ({ x: 1, y: 2, z: 3, vx: 4, vy: -9, vz: 6, fallStart: 200 })

  it('poe o jogador no ponto', () => {
    const j = emQueda()
    pousarJogador(j, { x: 10, y: 70, z: -5 })
    expect([j.x, j.y, j.z]).toEqual([10, 70, -5])
  })

  it('ZERA as tres velocidades', () => {
    // O objeto do jogador sobrevive a "recomecar em outro mundo": sem zerar, a
    // queda do mundo anterior continua no novo -- ele nasce ja caindo e leva
    // dano de uma queda que nunca aconteceu ali.
    const j = emQueda()
    pousarJogador(j, { x: 0, y: 64, z: 0 })
    expect([j.vx, j.vy, j.vz]).toEqual([0, 0, 0])
  })

  it('devolve o olhar salvo', () => {
    expect(pousarJogador(emQueda(), { x: 0, y: 0, z: 0, yaw: 1.5, pitch: -0.3 })).toEqual({
      yaw: 1.5,
      pitch: -0.3,
    })
  })

  it('sem olhar salvo, olha pra frente e reto', () => {
    expect(pousarJogador(emQueda(), { x: 0, y: 0, z: 0 })).toEqual({ yaw: 0, pitch: 0 })
  })

  it('olhar ZERO salvo continua sendo zero, e nao "nao salvou"', () => {
    expect(pousarJogador(emQueda(), { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 })).toEqual({
      yaw: 0,
      pitch: 0,
    })
  })

  it('olhar corrompido NAO chega na camera', () => {
    // Uma camera com angulo NaN nao desenha nada -- e a tela preta nao diz de
    // onde veio. O save volta pro angulo neutro em vez de propagar o lixo.
    for (const ruim of [NaN, null, undefined, '']) {
      const r = pousarJogador(emQueda(), { x: 0, y: 0, z: 0, yaw: ruim, pitch: ruim })
      expect(Number.isFinite(r.yaw), `yaw de ${String(ruim)}`).toBe(true)
      expect(Number.isFinite(r.pitch), `pitch de ${String(ruim)}`).toBe(true)
      expect(r.yaw).toBe(0)
    }
  })
})
