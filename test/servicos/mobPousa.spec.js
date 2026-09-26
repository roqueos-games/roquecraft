import { describe, it, expect } from 'vitest'
import { createMob, stepMob, alturaDoApoio, MOB_TYPES } from '../../src/servicos/mobs.js'
import { BLOCK_BY_KEY, SOLIDO_DE_BLOCO } from '../../src/servicos/blocks.js'
import { CAIXAS_DE_BLOCO } from '../../src/servicos/formas.js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * O REBANHO VOANDO SOBRE A NEVE.
 *
 * O founder mandou um print do celular em 25/08/2026: um porco e uma galinha
 * parados no ar, um palmo acima da camada de neve. Não era render, não era
 * interpolação — era o passo vertical da IA.
 *
 * `solidAt` NUNCA foi um booleano. Ele devolve o TOPO sólido da célula: 1 pro
 * cubo cheio, 0,5 pra meia laje, 0,125 pra camada de neve, e uma lista de
 * caixas pra escada e cerca. O passo vertical lia isso como sim-ou-não e
 * pousava a criatura em `floor(y) + 1`, SEMPRE — sete oitavos de bloco acima da
 * neve, meio bloco acima de uma laje.
 *
 * ⚠️ NENHUM TESTE PEGAVA, e o motivo importa: todo `env` de teste deste repo
 * responde `y < 64`, um BOOLEANO. Com booleano o defeito não existe — o topo
 * real é 1 mesmo. A suíte inteira concordava com o defeito porque nunca tinha
 * visto um bloco fino. Este arquivo usa os valores REAIS de `blocks.js`.
 */

/** Mundo de uma laje só: a célula (0,64,0)… e todas as de y=64, com este topo. */
const chaoDe = (topoOuCaixas) => ({
  solidAt: (x, y) => (y === 64 ? topoOuCaixas : 0),
  lightAt: () => 15,
  isDay: true,
  player: null,
  skyExposed: () => false,
  surfaceY: () => 65,
  biomeAt: () => 'plains',
  allowHostile: false,
})

/** Solta a criatura de `y` e roda até ela parar. Devolve onde o pé ficou. */
function ondePousa(env, deY = 66.5, tipo = 'pig') {
  const m = createMob(tipo, 0.5, deY, 0.5, 1)
  for (let i = 0; i < 600; i++) {
    // ⚠️ PRENDE x/z A CADA QUADRO. A criatura VAGA enquanto cai, e num mundo
    // feito só de cercas ela saía de cima do poste e caía pelo vão — o teste
    // media o passeio dela, não o passo vertical. (E o vão existe de verdade:
    // ao lado de um poste não há apoio. Só que isso é outro assunto.)
    m.x = 0.5
    m.z = 0.5
    stepMob(m, env, 1 / 60)
    if (m.onGround) break
  }
  return { y: m.y, noChao: m.onGround }
}

describe('alturaDoApoio — o que cada resposta de `solidAt` significa', () => {
  it('célula vazia não sustenta', () => {
    expect(alturaDoApoio(0)).toBe(0)
    expect(alturaDoApoio(undefined)).toBe(0)
    expect(alturaDoApoio(null)).toBe(0)
    expect(alturaDoApoio(false)).toBe(0)
  })

  it('número é o topo, e é o topo que vale', () => {
    expect(alturaDoApoio(1)).toBe(1)
    expect(alturaDoApoio(0.5)).toBe(0.5)
    expect(alturaDoApoio(0.125)).toBe(0.125)
  })

  it('⚠️ `true` vale cubo cheio — `env` que responde sim-ou-não não derruba ninguém', () => {
    // Doze testes deste repo caíram no primeiro minuto da correção justamente
    // por isto: todos os `env` de teste respondem booleano.
    expect(alturaDoApoio(true)).toBe(1)
  })

  it('lista de caixas: vale a que está SOB o pé, não a mais alta', () => {
    // Escada: metade baixa em 0,5 (z < 0,5) e metade alta em 1.
    const escada = [
      [0, 0, 0, 1, 0.5, 1],
      [0, 0.5, 0, 0.5, 1, 1],
    ]
    expect(alturaDoApoio(escada, 0.25, 0.5), 'pé sobre a parte alta').toBe(1)
    expect(alturaDoApoio(escada, 0.8, 0.5), 'pé sobre o degrau baixo').toBe(0.5)
  })

  it('pé fora de toda caixa não é sustentado', () => {
    // O poste da cerca ocupa só o miolo: ao lado dele não há apoio.
    const poste = [[0.375, 0, 0.375, 0.625, 1, 0.625]]
    expect(alturaDoApoio(poste, 0.5, 0.5)).toBe(1)
    expect(alturaDoApoio(poste, 0.05, 0.5)).toBe(0)
  })

  it('lixo não vira apoio', () => {
    expect(alturaDoApoio('sim')).toBe(0)
    expect(alturaDoApoio({})).toBe(0)
  })
})

describe('a criatura pousa no topo do BLOCO, não no da célula', () => {
  it('⚠️ CAMADA DE NEVE: o defeito do print, com o valor real do jogo', () => {
    const topo = SOLIDO_DE_BLOCO[BLOCK_BY_KEY.snowLayer.id]
    expect(topo, 'a neve deste jogo ocupa 1/8 da célula').toBe(0.125)

    const { y, noChao } = ondePousa(chaoDe(topo))
    expect(noChao).toBe(true)
    expect(y).toBeCloseTo(64 + 0.125, 5)
    // O número que o founder viu: com o defeito, o pé parava em 65 — sete
    // oitavos de bloco no ar.
    expect(65 - y, 'quanto o porco flutuava antes').toBeCloseTo(0.875, 5)
  })

  it('MEIA LAJE: para em 64,5, não em 65', () => {
    const topo = SOLIDO_DE_BLOCO[BLOCK_BY_KEY.stoneSlab.id]
    expect(topo).toBe(0.5)
    expect(ondePousa(chaoDe(topo)).y).toBeCloseTo(64.5, 5)
  })

  it('CUBO CHEIO continua em 65 (par de controle)', () => {
    // Sem este par, um bug que pousasse todo mundo em `floor(y)` passaria nos
    // dois testes acima e quebraria o mundo inteiro em silêncio.
    const topo = SOLIDO_DE_BLOCO[BLOCK_BY_KEY.stone.id]
    expect(topo).toBe(1)
    expect(ondePousa(chaoDe(topo)).y).toBeCloseTo(65, 5)
  })

  it('LAJE DE TOPO: a caixa flutua, e o pé fica no teto da célula', () => {
    const caixas = SOLIDO_DE_BLOCO[BLOCK_BY_KEY.stoneSlabTopo.id]
    expect(Array.isArray(caixas)).toBe(true)
    expect(ondePousa(chaoDe(caixas)).y).toBeCloseTo(65, 5)
  })

  it('CAMA: para em 9/16, que é a altura do colchão', () => {
    const topo = SOLIDO_DE_BLOCO[BLOCK_BY_KEY.bed.id]
    expect(topo).toBe(0.5625)
    expect(ondePousa(chaoDe(topo)).y).toBeCloseTo(64.5625, 5)
  })

  it('ESCADA: o pé fica na metade que está debaixo dele', () => {
    const caixas = CAIXAS_DE_BLOCO[BLOCK_BY_KEY.stoneStairs.id]
    // A criatura em (0.5, 0.5) cobre as duas metades com as quinas; o apoio é o
    // mais alto sob a caixa dela, que é o degrau de cima. Nunca acima de 1.
    const { y } = ondePousa(chaoDe(caixas))
    expect(y).toBeGreaterThanOrEqual(64.5)
    expect(y).toBeLessThanOrEqual(65)
  })

  it('não pousa em NADA quando não há chão — e cai do mundo', () => {
    const vazio = { ...chaoDe(0), solidAt: () => 0 }
    const m = createMob('pig', 0.5, 20, 0.5, 1)
    for (let i = 0; i < 4000; i++) {
      if (stepMob(m, vazio, 1 / 60).includes('died')) break
    }
    expect(m.health).toBe(0)
  })
})

describe('a queda rápida não atravessa o chão fino', () => {
  it('⚠️ UM QUADRO ENGASGADO NÃO PASSA PELA NEVE', () => {
    // A 0,25 s por quadro a criatura desce vários blocos de uma vez. Olhando só
    // a célula final, a camada de 1/8 passa despercebida e o bicho cai pra
    // sempre — o mesmo defeito da flecha, no eixo Y.
    const env = chaoDe(0.125)
    const m = createMob('pig', 0.5, 70, 0.5, 1)
    for (let i = 0; i < 200; i++) {
      stepMob(m, env, 0.25)
      if (m.onGround) break
    }
    expect(m.onGround, 'atravessou a neve').toBe(true)
    expect(m.y).toBeCloseTo(64.125, 5)
  })

  it('e o par de controle: com o passo normal ela pousa igual', () => {
    expect(ondePousa(chaoDe(0.125)).y).toBeCloseTo(64.125, 5)
  })
})

describe('todo bloco fino do jogo sustenta na altura certa', () => {
  it('nenhum sólido deixa a criatura flutuar mais de 1/64 de bloco', () => {
    // Prova de vida do conjunto: varre os blocos REAIS em vez de um caso.
    const errados = []
    for (const b of Object.values(BLOCK_BY_KEY)) {
      if (!b.solid || b.liquid) continue
      const topo = SOLIDO_DE_BLOCO[b.id]
      const esperado = alturaDoApoio(topo, 0.5, 0.5)
      if (esperado <= 0) continue
      const { y } = ondePousa(chaoDe(topo))
      if (Math.abs(y - (64 + esperado)) > 1 / 64) {
        errados.push(`${b.key}: pé em ${y.toFixed(3)}, topo em ${(64 + esperado).toFixed(3)}`)
      }
    }
    expect(errados, errados.slice(0, 5).join(' | ')).toEqual([])
  })

  it('e existe pelo menos um bloco fino no jogo (senão o teste acima é vazio)', () => {
    const finos = Object.values(BLOCK_BY_KEY).filter(
      (b) => b.solid && typeof SOLIDO_DE_BLOCO[b.id] === 'number' && SOLIDO_DE_BLOCO[b.id] < 1,
    )
    expect(finos.length).toBeGreaterThanOrEqual(5)
    expect(finos.map((b) => b.key)).toContain('snowLayer')
  })

  it('a altura de pouso bate com a caixa que a FÍSICA do jogador usa', () => {
    // Se as duas divergirem, a criatura e o jogador ficam em alturas diferentes
    // sobre a mesma laje — e um deles está errado sem que nada acuse.
    for (const chave of ['snowLayer', 'stoneSlab', 'stone', 'bed']) {
      const b = BLOCK_BY_KEY[chave]
      const daFisica = alturaDoApoio(SOLIDO_DE_BLOCO[b.id], 0.5, 0.5)
      const daForma = Math.max(...CAIXAS_DE_BLOCO[b.id].map((c) => c[4]))
      expect(daFisica, `${chave}`).toBeCloseTo(daForma, 5)
    }
  })

  it('a criatura pousada continua sendo alvo de mira (não afundou no bloco)', () => {
    const { y } = ondePousa(chaoDe(0.125))
    expect(y).toBeGreaterThan(64)
    expect(y + MOB_TYPES.pig.height).toBeLessThan(66)
  })
})

/**
 * ⚠️ O ITEM CAÍDO TEM A MESMA RAIZ, e estava a dez linhas de distância.
 *
 * O passo do item caído também lia `solidAt` como sim-ou-não: o item parava
 * assim que a célula abaixo "era sólida", o que sobre uma camada de neve é
 * quase UM BLOCO no ar. O jeito de errar de novo é voltar a tratar `solidAt`
 * como booleano.
 *
 * ⚠️ O GUARD SEGUIU A CASA. O passo morava no componente; em 26/08 ele foi pro
 * composable `useRoqueCraftEntidades`, junto com a lista de itens. O guard
 * aponta pro novo endereço, e o teste de comportamento de verdade (item caindo
 * sobre meia laje) vive lá em `useRoqueCraftEntidades.spec.js`.
 */
describe('o item caído usa a mesma régua', () => {
  const fonte = readFileSync(
    resolve(__dirname, '../../src/composables/useRoqueCraftEntidades.js'),
    'utf8',
  )

  it('o passo do item mede a altura de apoio em vez de perguntar sim-ou-não', () => {
    const corpo = fonte.slice(fonte.indexOf('function passoDosItens'))
    expect(corpo).toMatch(/alturaDoApoio\(/)
    // A forma antiga, que não pode voltar.
    expect(corpo).not.toMatch(/if \(!world\.solidAt\([^)]*\)\) d\.y -= /)
  })

  it('o composable importa `alturaDoApoio` do serviço, não tem cópia própria', () => {
    expect(fonte).toMatch(/^\s*alturaDoApoio,\s*$/m)
    expect(fonte).not.toMatch(/function alturaDoApoio/)
  })
})
