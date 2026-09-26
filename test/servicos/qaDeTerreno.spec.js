import { describe, it, expect } from 'vitest'
import { criarQaDeTerreno } from '../../src/servicos/qaDeTerreno.js'
import { BLOCK_BY_KEY } from '../../src/servicos/blocks.js'
import { toChunkCoord, toLocalCoord, localIndex, chunkKey } from '../../src/servicos/constants.js'

// ⚠️ DOIS RISCOS QUE A EXTRAÇÃO CRIOU.
//
// 1. `world` é `let` no componente (mundo novo recria o cliente) e `ticks` anda
//    a cada quadro. Os dois entram por GETTER; a forma errada compila e só
//    mente depois da primeira troca.
// 2. `fill` tem um caso especial que já custou uma rodada de QA: AIR não está
//    em BLOCKS (é o id 0), e sem o caso o `fill(..., 'air')` devolvia 0 e não
//    limpava nada - a sonda fotografava a floresta intacta achando que tinha
//    limpado. O teste do ar existe pra esse caso não voltar em silêncio.

function mundoFalso(nome, alturaDoTopo = 80) {
  return {
    nome,
    surfaceY: () => alturaDoTopo,
    getBlock: () => BLOCK_BY_KEY.stone.id,
    luzCombinada: (x, y, z, f) => f,
  }
}

function contexto(over = {}) {
  const escritas = []
  const editsMap = new Map()
  const ctx = {
    world: () => mundoFalso('primeiro'),
    ticks: () => 0,
    applyEdit: (x, y, z, id) => escritas.push([x, y, z, id]),
    editsMap,
    ...over,
  }
  return { qa: criarQaDeTerreno(ctx), escritas, editsMap }
}

describe('qaDeTerreno', () => {
  it('segue o mundo e o relógio VIVOS', () => {
    let world = mundoFalso('primeiro', 80)
    let ticks = 0
    const { qa } = contexto({ world: () => world, ticks: () => ticks })
    expect(qa.surfaceAt(0, 0)).toBe(80)
    world = mundoFalso('segundo', 120)
    expect(qa.surfaceAt(0, 0), 'ficou presa no mundo morto').toBe(120)

    // `luzEm` passa `dayFactor(ticks)` adiante; o mundo falso devolve o fator,
    // então mudar o relógio TEM que mudar o número.
    const deDia = qa.luzEm(0, 0, 0)
    ticks = 18000
    const deNoite = qa.luzEm(0, 0, 0)
    expect(deNoite, 'o relógio ficou congelado na criação').not.toBe(deDia)
  })

  it('não explode com o mundo ausente', () => {
    const { qa } = contexto({ world: () => null })
    expect(qa.surfaceAt(0, 0)).toBe(null)
    expect(qa.blockKeyAt(0, 0, 0)).toBe('air')
    expect(qa.luzEm(0, 0, 0)).toBe(null)
    expect(qa.colunaEm(0, 0)).toBe(null)
  })

  it('fill limpa com "air", que NÃO está em BLOCKS', () => {
    const { qa, escritas } = contexto()
    expect(qa.fill(0, 0, 0, 1, 1, 1, 'air')).toBe(8)
    expect(escritas.length).toBe(8)
    // CONTROLE: id 0 de verdade. Um `fill` que caísse no caminho do BLOCKS
    // devolveria 0 escritas e a sonda fotografaria o terreno intacto.
    expect(escritas.every(([, , , id]) => id === 0)).toBe(true)
  })

  it('fill escreve o id do bloco pedido e recusa chave inexistente', () => {
    const { qa, escritas } = contexto()
    expect(qa.fill(2, 3, 4, 2, 3, 4, 'stone')).toBe(1)
    expect(escritas[0]).toEqual([2, 3, 4, BLOCK_BY_KEY.stone.id])
    expect(qa.fill(0, 0, 0, 5, 5, 5, 'nao_existe')).toBe(0)
    expect(escritas.length, 'escreveu com chave inválida').toBe(1)
  })

  it('fill aceita os cantos em qualquer ordem', () => {
    const { qa, escritas } = contexto()
    expect(qa.fill(3, 3, 3, 1, 1, 1, 'stone')).toBe(27)
    expect(escritas.length).toBe(27)
  })

  it('colunaEm devolve do topo pra baixo, com a janela pedida', () => {
    const { qa } = contexto()
    const col = qa.colunaEm(0, 0, 60, 64)
    expect(col.map((c) => c.y)).toEqual([64, 63, 62, 61, 60])
    expect(col[0].bloco).toBe('stone')
  })

  it('gravadaEm distingue "não gravou" de "gravou o ar"', () => {
    // Contar o tamanho do mapa não responde isso: reeditar a mesma célula não
    // aumenta nada, e gravar AIR (id 0) é uma gravação de verdade.
    const { qa, editsMap } = contexto()
    expect(qa.gravadaEm(5, 64, 5)).toBe(null)
    expect(qa.edicoesGravadas()).toBe(0)

    const k = chunkKey(toChunkCoord(5), toChunkCoord(5))
    const dentro = new Map([[localIndex(toLocalCoord(5), 64, toLocalCoord(5)), 0]])
    editsMap.set(k, dentro)
    expect(qa.gravadaEm(5, 64, 5), 'confundiu ar gravado com célula ausente').toBe(0)
    expect(qa.gravadaEm(5, 65, 5)).toBe(null)
    expect(qa.edicoesGravadas()).toBe(1)
  })
})

// ⚠️ UMA SONDA DE QA NÃO PODE LAVAR ESTADO RUIM. `?? PADRAO` só troca AUSÊNCIA
// pelo padrão; com `||`, todo valor falsy-porém-PRESENTE (`0`, `''`, `NaN`)
// vira o padrão, e a sonda relata "não existe" onde existe alguma coisa.
describe('qaDeTerreno — altura zero é uma altura', () => {
  it('superfície no nível ZERO é relatada como 0, não como "sem mundo"', () => {
    // ⚠️ `surfaceY(...) ?? null` com `||` transforma a superfície no fundo do
    // mundo — uma cratera cavada até o piso, ou um mundo de teste raso — em
    // `null`, que a sonda usa para dizer "não há mundo carregado". A checagem
    // "estou perto do chão?" passa a comparar com null e vira NaN.
    const { qa } = contexto({ world: () => mundoFalso('raso', 0) })
    expect(qa.surfaceAt(0, 0)).toBe(0)
  })

  it('sem mundo carregado, é null mesmo', () => {
    const { qa } = contexto({ world: () => null })
    expect(qa.surfaceAt(0, 0)).toBeNull()
    expect(qa.luzEm(0, 0, 0)).toBeNull()
    expect(qa.colunaEm(0, 0)).toBeNull()
  })

  it('luz ZERO é escuridão medida, não ausência de medida', () => {
    // Mesma família: `luzCombinada(...) ?? null`. A luz zero — o fundo de uma
    // caverna sem tocha — é EXATAMENTE o que a sonda de luz existe pra medir.
    const { qa } = contexto({
      world: () => ({ ...mundoFalso('escuro'), luzCombinada: () => 0 }),
    })
    expect(qa.luzEm(0, 0, 0)).toBe(0)
  })

  it('a coluna pode começar na camada ZERO', () => {
    // `deY ?? topo - 24` e `ateY ?? ...`: com `||`, pedir a coluna de 0 até 3
    // é lido como "não disse até onde", e a sonda devolve outra faixa —
    // silenciosamente, com os nomes de bloco certos e as alturas erradas.
    const { qa } = contexto()
    const col = qa.colunaEm(0, 0, 0, 3)
    expect(col.map((c) => c.y)).toEqual([3, 2, 1, 0])
  })

  it('sem faixa pedida, a coluna começa DOIS blocos ACIMA da superfície', () => {
    // `(surfaceY ?? 80) + 2` virando `-` faz a varredura começar dois blocos
    // ABAIXO do chão: a sonda perde justamente a superfície e o ar em cima
    // dela, que é o que ela existe pra fotografar. E os nomes de bloco saem
    // todos plausíveis, então nada denuncia.
    const { qa } = contexto({ world: () => mundoFalso('normal', 80) })
    const col = qa.colunaEm(0, 0)
    expect(col[0].y).toBe(82)
    expect(col[col.length - 1].y).toBe(82 - 24)
  })

  it('a coluna inclui a camada da BASE', () => {
    // `y >= base` apertado para `>` perde a última camada — justamente a do
    // chão, que é a que interessa numa sonda de terreno.
    const { qa } = contexto()
    const col = qa.colunaEm(0, 0, 5, 7)
    expect(col.map((c) => c.y)).toEqual([7, 6, 5])
  })
})
