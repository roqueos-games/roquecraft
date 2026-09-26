import { describe, it, expect } from 'vitest'
import { AIR, ID } from '../../src/servicos/blocks.js'
import { ITEMS, itemDef } from '../../src/servicos/items.js'
import {
  usarBalde,
  usarEnxada,
  plantarSemente,
  usarItemNaMao,
} from '../../src/servicos/usoDeFerramenta.js'

// O EFEITO das duas ferramentas que não colocam bloco.
//
// `balde.js` e `agricultura.js` testam a REGRA (o que enche, o que se ara). O
// que nunca teve teste foi o EFEITO: escreveu no mundo, no lugar certo, trocou
// o item na mão, gastou durabilidade, agendou o save. Isso morava dentro do
// componente e por isso era invisível para o vitest.

/** Um mundo de mentira: um mapa de "x,y,z" → id, e nada mais. */
function mundoFalso(celulas = {}) {
  const k = (x, y, z) => `${x},${y},${z}`
  return {
    mapa: { ...celulas },
    getBlock(x, y, z) {
      return this.mapa[k(x, y, z)] ?? AIR
    },
    liquidAt(x, y, z) {
      const id = this.getBlock(x, y, z)
      return id === ID.water || id === ID.lava
    },
  }
}

function contexto(mundo, { modo = 'survival' } = {}) {
  const log = {
    editou: [],
    tocou: [],
    trocou: [],
    salvou: 0,
    cansou: 0,
    gastou: 0,
    gastouItem: 0,
    balancou: 0,
  }
  return {
    log,
    ctx: {
      mundo,
      modo,
      alturaDoMundo: 128,
      editar: (x, y, z, id) => {
        log.editou.push([x, y, z, id])
        mundo.mapa[`${x},${y},${z}`] = id
      },
      tocar: (f) => log.tocou.push(f),
      balancar: () => log.balancou++,
      salvar: () => log.salvou++,
      dentroDoJogador: () => false,
      trocar: (chave) => log.trocou.push(chave),
      cansar: () => log.cansou++,
      gastarFerramenta: () => log.gastou++,
      consumir: () => log.gastouItem++,
    },
  }
}

const mirandoEm = (x, y, z, place = null) => ({ hit: { x, y, z }, place })

describe('enxada', () => {
  it('grama com céu aberto vira solo arado, na célula do alvo', () => {
    const mundo = mundoFalso({ '4,60,7': ID.grassBlock })
    const { ctx, log } = contexto(mundo)
    expect(usarEnxada(mirandoEm(4, 60, 7), ctx)).toBe(true)
    expect(mundo.getBlock(4, 60, 7)).toBe(ID.farmland)
    // ⚠️ A célula de CIMA não foi tocada: não havia mato ali.
    expect(log.editou).toEqual([[4, 60, 7, ID.farmland]])
    expect(log.salvou).toBe(1)
  })

  it('o mato de cima some junto', () => {
    const mundo = mundoFalso({ '0,10,0': ID.dirt, '0,11,0': ID.tallGrass })
    const { ctx } = contexto(mundo)
    expect(usarEnxada(mirandoEm(0, 10, 0), ctx)).toBe(true)
    expect(mundo.getBlock(0, 11, 0)).toBe(AIR)
    expect(mundo.getBlock(0, 10, 0)).toBe(ID.farmland)
  })

  it('pedra por cima: não faz nada, e nada é gravado', () => {
    const mundo = mundoFalso({ '0,10,0': ID.grassBlock, '0,11,0': ID.stone })
    const { ctx, log } = contexto(mundo)
    expect(usarEnxada(mirandoEm(0, 10, 0), ctx)).toBe(false)
    expect(log.editou).toEqual([])
    expect(log.salvou).toBe(0)
  })

  it('sem mira, não faz nada', () => {
    const { ctx, log } = contexto(mundoFalso())
    expect(usarEnxada(null, ctx)).toBe(false)
    expect(log.editou).toEqual([])
  })

  it('gasta durabilidade e cansa no survival', () => {
    const mundo = mundoFalso({ '0,10,0': ID.dirt })
    const { ctx, log } = contexto(mundo)
    usarEnxada(mirandoEm(0, 10, 0), ctx)
    expect(log.gastou).toBe(1)
    expect(log.cansou).toBe(1)
  })

  it('no criativo a enxada não se gasta', () => {
    const mundo = mundoFalso({ '0,10,0': ID.dirt })
    const { ctx, log } = contexto(mundo, { modo: 'creative' })
    expect(usarEnxada(mirandoEm(0, 10, 0), ctx)).toBe(true)
    expect(log.gastou).toBe(0)
    expect(log.cansou).toBe(0)
  })
})

describe('balde', () => {
  const vazio = ITEMS.bucket
  const cheio = ITEMS.water_bucket

  it('enche numa fonte e apaga a água de lá', () => {
    const mundo = mundoFalso({ '2,50,2': ID.water })
    const { ctx, log } = contexto(mundo)
    expect(usarBalde(vazio, mirandoEm(2, 50, 2), ctx)).toBe(true)
    expect(mundo.getBlock(2, 50, 2)).toBe(AIR)
    expect(log.trocou).toEqual(['water_bucket'])
  })

  it('não enche em pedra', () => {
    const mundo = mundoFalso({ '2,50,2': ID.stone })
    const { ctx, log } = contexto(mundo)
    expect(usarBalde(vazio, mirandoEm(2, 50, 2), ctx)).toBe(false)
    expect(log.editou).toEqual([])
  })

  it('despeja na face de fora quando o alvo é sólido', () => {
    const mundo = mundoFalso({ '2,50,2': ID.stone })
    const { ctx } = contexto(mundo)
    const hit = { hit: { x: 2, y: 50, z: 2 }, place: { x: 2, y: 51, z: 2 } }
    expect(usarBalde(cheio, hit, ctx)).toBe(true)
    expect(mundo.getBlock(2, 51, 2)).toBe(ID.water)
  })

  it('mirando numa lâmina, despeja NELA — não um bloco adiante', () => {
    const mundo = mundoFalso({ '2,50,2': ID.water })
    const { ctx } = contexto(mundo)
    const hit = { hit: { x: 2, y: 50, z: 2 }, place: { x: 2, y: 51, z: 2 } }
    expect(usarBalde(cheio, hit, ctx)).toBe(true)
    expect(mundo.getBlock(2, 51, 2)).toBe(AIR)
    expect(mundo.getBlock(2, 50, 2)).toBe(ID.water)
  })

  it('no criativo o balde não se esvazia', () => {
    const mundo = mundoFalso({ '2,50,2': ID.stone })
    const { ctx, log } = contexto(mundo, { modo: 'creative' })
    usarBalde(cheio, { hit: { x: 2, y: 50, z: 2 }, place: { x: 2, y: 51, z: 2 } }, ctx)
    expect(log.trocou).toEqual([])
  })

  it('não despeja acima do teto do mundo', () => {
    const mundo = mundoFalso({ '2,127,2': ID.stone })
    const { ctx, log } = contexto(mundo)
    const hit = { hit: { x: 2, y: 127, z: 2 }, place: { x: 2, y: 128, z: 2 } }
    expect(usarBalde(cheio, hit, ctx)).toBe(false)
    expect(log.editou).toEqual([])
  })
})

describe('semear', () => {
  it('a semente nasce na célula ACIMA do canteiro clicado', () => {
    const mundo = mundoFalso({ '5,60,5': ID.farmland })
    const { ctx, log } = contexto(mundo)
    expect(plantarSemente('wheat_seeds', mirandoEm(5, 60, 5), ctx)).toBe(true)
    expect(mundo.getBlock(5, 61, 5)).toBe(ID.wheat0)
    expect(log.gastouItem).toBe(1)
    expect(log.salvou).toBe(1)
  })

  it('em grama não planta e não gasta a semente', () => {
    const mundo = mundoFalso({ '5,60,5': ID.grassBlock })
    const { ctx, log } = contexto(mundo)
    expect(plantarSemente('wheat_seeds', mirandoEm(5, 60, 5), ctx)).toBe(false)
    expect(log.editou).toEqual([])
    expect(log.gastouItem).toBe(0)
  })

  it('no criativo a semente não se gasta', () => {
    const mundo = mundoFalso({ '5,60,5': ID.farmland })
    const { ctx, log } = contexto(mundo, { modo: 'creative' })
    expect(plantarSemente('wheat_seeds', mirandoEm(5, 60, 5), ctx)).toBe(true)
    expect(log.gastouItem).toBe(0)
  })

  it('sem mira, nada acontece', () => {
    const { ctx, log } = contexto(mundoFalso())
    expect(plantarSemente('wheat_seeds', null, ctx)).toBe(false)
    expect(log.editou).toEqual([])
  })
})

//
// BEBER E ENCHER — os dois gestos da garrafa.
//
// Os dois entram pela MESMA porta que o balde e a enxada (`usarItemNaMao`), e
// é isso que o teste prende: um gesto novo que não passasse por ali seria uma
// segunda escada de "o que a mão faz", e as duas divergiriam.
describe('a garrafa', () => {
  const ctxDaGarrafa = (mundo) => {
    const log = { trocou: [], efeitos: [], salvou: 0, tocou: [], editou: [] }
    return {
      log,
      mundo,
      modo: 'survival',
      alturaDoMundo: 256,
      editar: (x, y, z, id) => log.editou.push([x, y, z, id]),
      tocar: (f) => log.tocou.push(f),
      balancar: () => {},
      salvar: () => log.salvou++,
      trocar: (k) => log.trocou.push(k),
      tomarEfeito: (nome, nivel, duracao) => log.efeitos.push([nome, nivel, duracao]),
      dentroDoJogador: () => false,
      consumir: () => {},
      cansar: () => {},
      comer: () => true,
      gastarFerramenta: () => {},
    }
  }

  it('encher na ÁGUA troca por garrafa d’água e NÃO tira a água do mundo', () => {
    // ⚠️ O balde carrega um bloco; a garrafa tira um gole. Com a água sumindo,
    // encher três garrafas esvaziaria o lago de casa.
    const mundo = mundoFalso({ '2,60,2': ID.water })
    const ctx = ctxDaGarrafa(mundo)
    const hit = { hit: { x: 2, y: 60, z: 2 }, place: { x: 2, y: 61, z: 2 } }
    expect(usarItemNaMao(itemDef('glass_bottle'), 'glass_bottle', { liquido: hit }, ctx)).toBe(true)
    expect(ctx.log.trocou).toEqual(['water_bottle'])
    expect(ctx.log.editou).toEqual([])
    expect(ctx.log.salvou).toBe(1)
  })

  it('encher na LAVA não faz nada', () => {
    const mundo = mundoFalso({ '2,60,2': ID.lava })
    const ctx = ctxDaGarrafa(mundo)
    const hit = { hit: { x: 2, y: 60, z: 2 }, place: { x: 2, y: 61, z: 2 } }
    expect(usarItemNaMao(itemDef('glass_bottle'), 'glass_bottle', { liquido: hit }, ctx)).toBe(
      false,
    )
    expect(ctx.log.trocou).toEqual([])
  })

  it('sem alvo de líquido, a garrafa não enche sozinha', () => {
    const ctx = ctxDaGarrafa(mundoFalso({}))
    expect(usarItemNaMao(itemDef('glass_bottle'), 'glass_bottle', { liquido: null }, ctx)).toBe(
      false,
    )
  })

  it('beber aplica o efeito e devolve o VIDRO', () => {
    const ctx = ctxDaGarrafa(mundoFalso({}))
    expect(usarItemNaMao(itemDef('pocao_velocidade'), 'pocao_velocidade', {}, ctx)).toBe(true)
    // A dose crua: nível 1, prazo padrão de 180 s.
    expect(ctx.log.efeitos).toEqual([['velocidade', 1, 180]])
    expect(ctx.log.trocou).toEqual(['glass_bottle'])
  })

  it('a poção estranha gasta a garrafa e NÃO aplica efeito nenhum', () => {
    const ctx = ctxDaGarrafa(mundoFalso({}))
    expect(usarItemNaMao(itemDef('pocao_estranha'), 'pocao_estranha', {}, ctx)).toBe(true)
    expect(ctx.log.efeitos).toEqual([])
    expect(ctx.log.trocou).toEqual(['glass_bottle'])
  })

  it('a garrafa d’água NÃO se bebe: ela é ingrediente', () => {
    const ctx = ctxDaGarrafa(mundoFalso({}))
    expect(usarItemNaMao(itemDef('water_bottle'), 'water_bottle', {}, ctx)).toBe(null)
    expect(ctx.log.trocou).toEqual([])
  })

  it('a poção modificada bebe a DOSE: nível II e prazo cortado', () => {
    const ctx = ctxDaGarrafa(mundoFalso({}))
    ctx.pocaoNaMao = () => ({ nivel: 2 })
    expect(usarItemNaMao(itemDef('pocao_forca'), 'pocao_forca', {}, ctx)).toBe(true)
    expect(ctx.log.efeitos).toEqual([['forca', 2, 90]])
    expect(ctx.log.trocou).toEqual(['glass_bottle'])
  })

  it('⚠️ a arremessável VOA em vez de descer, some da mão e não devolve vidro', () => {
    const ctx = ctxDaGarrafa(mundoFalso({}))
    const voos = []
    ctx.pocaoNaMao = () => ({ splash: true, longa: true })
    ctx.arremessar = (item, pocao) => (voos.push([item, pocao]), { id: 'f1' })
    ctx.consumir = () => ctx.log.trocou.push('(consumiu)')
    expect(usarItemNaMao(itemDef('pocao_veneno'), 'pocao_veneno', {}, ctx)).toBe(true)
    expect(voos).toEqual([['pocao_veneno', { splash: true, longa: true }]])
    expect(ctx.log.efeitos, 'arremessar não é beber').toEqual([])
    expect(ctx.log.trocou).toEqual(['(consumiu)'])
    // Sem o gancho de arremesso, não faz nada e devolve false.
    const sem = ctxDaGarrafa(mundoFalso({}))
    sem.pocaoNaMao = () => ({ splash: true })
    expect(usarItemNaMao(itemDef('pocao_veneno'), 'pocao_veneno', {}, sem)).toBe(false)
    expect(sem.log.trocou).toEqual([])
  })

  it('o escudo LEVANTA A GUARDA e não cai na colocação de bloco', () => {
    let levantou = 0
    const ctx = { levantarGuarda: () => (levantou++, true) }
    expect(usarItemNaMao(itemDef('shield'), 'shield', {}, ctx)).toBe(true)
    expect(levantou).toBe(1)
    // Sem o gancho, ainda devolve true: o clique não vira "colocar escudo".
    expect(usarItemNaMao(itemDef('shield'), 'shield', {}, {})).toBe(true)
  })
})
