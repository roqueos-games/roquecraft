import { describe, it, expect } from 'vitest'
import { resolverColocacao } from '../../src/servicos/colocacao.js'
import { BLOCK_BY_KEY, AIR, isReplaceable } from '../../src/servicos/blocks.js'
import { EYE_HEIGHT } from '../../src/servicos/physics.js'

// ⚠️ A DIVERGENCIA QUE ESTE ARQUIVO FECHA.
//
// `doPlace` percorria cama -> laje -> escada -> variante pra achar a celula, e o
// fantasma da mira olhava so `hit.place`. Nos casos comuns as duas respostas
// batem. Na FUSAO DE LAJE nao: `encaixarLaje` devolve a celula do ALVO (a laje
// que ja estava la, que recebe a metade que falta), enquanto `hit.place` e a
// VIZINHA. O fantasma aparecia um bloco ao lado de onde a peca entrava.
//
// O codigo ja dizia a regra -- "um fantasma que aparece onde o bloco nao entra e
// pior que fantasma nenhum, ele ensina errado" -- e mesmo assim tinha duas
// contas pra mesma pergunta. Duas contas divergem; e so questao de qual caso
// ninguem testou.

const PEDRA = BLOCK_BY_KEY.stone.id
const LAJE_BASE = BLOCK_BY_KEY.stoneSlab?.id ?? BLOCK_BY_KEY.stoneSlabBase?.id

function mundoDe(mapa) {
  const k = (x, y, z) => `${x},${y},${z}`
  return {
    getBlock: (x, y, z) => mapa[k(x, y, z)] ?? AIR,
    solidAt: (x, y, z) => {
      const id = mapa[k(x, y, z)]
      return id != null && id !== AIR && !isReplaceable(id)
    },
  }
}

const LONGE = { x: 40.5, y: 64 - EYE_HEIGHT, z: 40.5 }
const OLHAR = { x: 0, z: -1 }

/** Clique no TOPO do bloco em (0,64,0): a peça comum cairia em (0,65,0). */
const cliqueNoTopo = (y = 64) => ({
  hit: { x: 0, y, z: 0 },
  place: { x: 0, y: y + 1, z: 0 },
  normal: { x: 0, y: 1, z: 0 },
  point: { x: 0.5, y: y + 1, z: 0.5 },
})

describe('resolverColocacao: o caso comum', () => {
  it('bloco comum vai pra celula vizinha da face clicada', () => {
    const r = resolverColocacao({
      item: 'stone',
      hit: cliqueNoTopo(),
      olhar: OLHAR,
      mundo: mundoDe({ '0,64,0': PEDRA }),
      jogador: LONGE,
    })
    expect(r.principal).toEqual({ x: 0, y: 65, z: 0 })
    expect(r.celulas).toHaveLength(1)
    expect(r.celulas[0].id).toBe(PEDRA)
    expect(r.cama).toBe(false)
  })

  it('item que nao coloca bloco nenhum nao resolve nada', () => {
    const r = resolverColocacao({
      item: 'stone_pickaxe',
      hit: cliqueNoTopo(),
      olhar: OLHAR,
      mundo: mundoDe({ '0,64,0': PEDRA }),
      jogador: LONGE,
    })
    expect(r).toBe(null)
  })

  it('celula ocupada por bloco solido recusa', () => {
    const r = resolverColocacao({
      item: 'stone',
      hit: cliqueNoTopo(),
      olhar: OLHAR,
      mundo: mundoDe({ '0,64,0': PEDRA, '0,65,0': PEDRA }),
      jogador: LONGE,
    })
    expect(r).toBe(null)
  })

  it('fora do mundo recusa, em vez de escrever num y impossivel', () => {
    const r = resolverColocacao({
      item: 'stone',
      hit: { ...cliqueNoTopo(), place: { x: 0, y: -1, z: 0 } },
      olhar: OLHAR,
      mundo: mundoDe({}),
      jogador: LONGE,
    })
    expect(r).toBe(null)
  })

  it('dentro do proprio corpo recusa', () => {
    const emCima = { x: 0.5, y: 65, z: 0.5 }
    const r = resolverColocacao({
      item: 'stone',
      hit: cliqueNoTopo(),
      olhar: OLHAR,
      mundo: mundoDe({ '0,64,0': PEDRA }),
      jogador: emCima,
    })
    expect(r).toBe(null)
  })
})

describe('resolverColocacao: a FUSAO DE LAJE, que era a divergencia', () => {
  it('a peca entra na celula do ALVO, e nao na vizinha', () => {
    // Uma laje de base em (0,64,0). Clicar no topo dela com outra laje igual
    // funde as duas na PROPRIA celula (0,64,0) -- e nao em (0,65,0), que e o
    // `hit.place` que o fantasma antigo mostrava.
    expect(LAJE_BASE, 'o jogo precisa ter laje de pedra').toBeTruthy()
    const r = resolverColocacao({
      item: 'stoneSlab',
      hit: cliqueNoTopo(),
      olhar: OLHAR,
      mundo: mundoDe({ '0,64,0': LAJE_BASE }),
      jogador: LONGE,
    })
    expect(r).toBeTruthy()
    expect(r.principal).toEqual({ x: 0, y: 64, z: 0 })
    expect(r.principal).not.toEqual({ x: 0, y: 65, z: 0 })
  })

  it('a fusao escreve por cima de bloco NAO substituivel, e isso e legitimo', () => {
    // Quem autorizou foi a regra de encaixe, que ja conferiu material e metade.
    // Sem esta excecao a fusao seria recusada pela checagem de `isReplaceable`.
    expect(isReplaceable(LAJE_BASE)).toBe(false)
    const r = resolverColocacao({
      item: 'stoneSlab',
      hit: cliqueNoTopo(),
      olhar: OLHAR,
      mundo: mundoDe({ '0,64,0': LAJE_BASE }),
      jogador: LONGE,
    })
    expect(r).toBeTruthy()
  })

  it('laje de material DIFERENTE nao funde: continua sendo duas pecas', () => {
    const r = resolverColocacao({
      item: 'oakSlab',
      hit: cliqueNoTopo(),
      olhar: OLHAR,
      mundo: mundoDe({ '0,64,0': LAJE_BASE }),
      jogador: LONGE,
    })
    // Vai pra vizinha, como qualquer peca comum.
    expect(r.principal).toEqual({ x: 0, y: 65, z: 0 })
  })
})

describe('resolverColocacao: a VARIANTE chega no resultado', () => {
  // ⚠️ Este bloco existe porque um mutante sobreviveu sem ele: trocar
  // `idParaColocar(...)` por `blockId` cru passava em tudo. `variante.spec.js`
  // testa a regra; faltava afirmar que ela e mesmo CHAMADA aqui -- a fiacao
  // entre dois modulos certos e onde mora o defeito quando os dois estao certos.

  it('tocha na LATERAL vira a variante de parede, e nao a de chao', () => {
    const deLado = {
      hit: { x: 0, y: 64, z: 0 },
      place: { x: 0, y: 64, z: 1 },
      normal: { x: 0, y: 0, z: 1 },
      point: { x: 0.5, y: 64.5, z: 1 },
    }
    const r = resolverColocacao({
      item: 'torch',
      hit: deLado,
      olhar: OLHAR,
      mundo: mundoDe({ '0,64,0': PEDRA }),
      jogador: LONGE,
    })
    expect(r).toBeTruthy()
    const posta =
      BLOCK_BY_KEY[Object.keys(BLOCK_BY_KEY).find((k) => BLOCK_BY_KEY[k].id === r.celulas[0].id)]
    expect(posta.key, 'a tocha entrou como tocha de chao').toMatch(/Parede/)
    expect(r.celulas[0].id).not.toBe(BLOCK_BY_KEY.torch.id)
  })

  it('laje pela face de BAIXO vira a metade de cima', () => {
    const porBaixo = {
      hit: { x: 0, y: 64, z: 0 },
      place: { x: 0, y: 63, z: 0 },
      normal: { x: 0, y: -1, z: 0 },
      point: { x: 0.5, y: 64, z: 0.5 },
    }
    const r = resolverColocacao({
      item: 'stoneSlab',
      hit: porBaixo,
      olhar: OLHAR,
      mundo: mundoDe({ '0,64,0': PEDRA }),
      jogador: LONGE,
    })
    expect(r).toBeTruthy()
    expect(r.celulas[0].id).toBe(BLOCK_BY_KEY.stoneSlabTopo.id)
  })
})

describe('resolverColocacao: a cama ocupa DUAS celulas', () => {
  it('ou as duas cabem, ou nenhuma entra', () => {
    // Chao inteiro pra apoiar as duas metades.
    const chao = {}
    for (let z = -4; z <= 4; z++) for (let x = -4; x <= 4; x++) chao[`${x},64,${z}`] = PEDRA
    const r = resolverColocacao({
      item: 'bed',
      hit: cliqueNoTopo(),
      olhar: OLHAR,
      mundo: mundoDe(chao),
      jogador: LONGE,
    })
    // ⚠️ SEM `if (!r) return`. A primeira versao deste teste usava a chave
    // 'redBed', que nao existe -- `resolverColocacao` devolvia null, o `return`
    // engolia tudo e o teste passava sem afirmar NADA. Um teste que pode se
    // calar sozinho e um teste que um dia se cala.
    expect(r, 'a cama nao resolveu: a chave do item mudou?').toBeTruthy()
    expect(r.cama).toBe(true)
    expect(r.celulas).toHaveLength(2)
    // O PE e a principal: contar duas colocacoes por cama estragaria a
    // estatistica de construcao.
    expect(r.principal).toEqual(r.celulas[0])
    expect(r.celulas[0]).not.toEqual(r.celulas[1])
  })
})

describe('resolverColocacao: as bordas do mundo e os argumentos que faltam', () => {
  it('y = 0 é dentro do mundo — o piso pode receber bloco', () => {
    // `y >= 0 && y < WORLD_HEIGHT`. Apertado para `>`, a camada ZERO — o piso
    // do mundo — deixa de aceitar colocação, e o jogador não consegue tapar
    // buraco nenhum no chão. É a borda mais visitada do mundo inteiro.
    const r = resolverColocacao({
      item: 'stone',
      hit: {
        hit: { x: 0, y: 0, z: 0 },
        place: { x: 0, y: 0, z: 0 },
        normal: { x: 0, y: 1, z: 0 },
        point: { x: 0.5, y: 0, z: 0.5 },
      },
      olhar: OLHAR,
      mundo: mundoDe({}),
      jogador: LONGE,
    })
    expect(r.principal).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('abaixo do piso e acima do teto são recusados', () => {
    const abaixo = resolverColocacao({
      item: 'stone',
      hit: {
        hit: { x: 0, y: -1, z: 0 },
        place: { x: 0, y: -1, z: 0 },
        normal: { x: 0, y: 1, z: 0 },
        point: { x: 0.5, y: -1, z: 0.5 },
      },
      olhar: OLHAR,
      mundo: mundoDe({}),
      jogador: LONGE,
    })
    expect(abaixo).toBe(null)
  })

  it('as três guardas de entrada valem SEPARADAMENTE', () => {
    // `!blockId || !hit || !mundo` virando `&&` só recusa quando os TRÊS
    // faltam: sem `mundo`, a função segue e estoura em `mundo.getBlock`.
    const base = {
      item: 'stone',
      hit: cliqueNoTopo(),
      olhar: OLHAR,
      mundo: mundoDe({ '0,64,0': PEDRA }),
      jogador: LONGE,
    }
    expect(resolverColocacao({ ...base, item: 'stone_pickaxe' })).toBe(null)
    expect(resolverColocacao({ ...base, hit: null })).toBe(null)
    expect(resolverColocacao({ ...base, mundo: null })).toBe(null)
  })

  it('a célula pedida tem que estar livre E dentro do mundo, ao mesmo tempo', () => {
    // Os `&&` de `livre` viram `||` e cada um afrouxa uma das três condições:
    // fora do mundo, ocupado, ou dentro do próprio jogador.
    const ocupada = resolverColocacao({
      item: 'stone',
      hit: cliqueNoTopo(),
      olhar: OLHAR,
      mundo: mundoDe({ '0,64,0': PEDRA, '0,65,0': PEDRA }),
      jogador: LONGE,
    })
    expect(ocupada).toBe(null)
  })
})

// ── ALVO SUBSTITUÍVEL (mato) ────────────────────────────────────────────────
//
// Desde que a mira passou a enxergar planta (`EH_MIRAVEL`), o mato virou alvo
// de clique — e colocar um bloco mirando nele tem que SUBSTITUIR o tufo, não
// nascer ao lado dele.
describe('resolverColocacao: alvo substituível', () => {
  it('mirar no mato põe a peça NA célula do mato', () => {
    const r = resolverColocacao({
      item: 'stone',
      hit: {
        hit: { x: 0, y: 64, z: 0 },
        place: { x: 0, y: 65, z: 0 },
        normal: { x: 0, y: 1, z: 0 },
        point: { x: 0.5, y: 65, z: 0.5 },
      },
      olhar: OLHAR,
      mundo: mundoDe({ '0,64,0': BLOCK_BY_KEY.tallGrass.id }),
      jogador: LONGE,
    })
    expect(r.principal).toEqual({ x: 0, y: 64, z: 0 })
  })

  it('alvo sólido continua recebendo a peça na face de fora', () => {
    const r = resolverColocacao({
      item: 'stone',
      hit: {
        hit: { x: 0, y: 64, z: 0 },
        place: { x: 0, y: 65, z: 0 },
        normal: { x: 0, y: 1, z: 0 },
        point: { x: 0.5, y: 65, z: 0.5 },
      },
      olhar: OLHAR,
      mundo: mundoDe({ '0,64,0': BLOCK_BY_KEY.stone.id }),
      jogador: LONGE,
    })
    expect(r.principal).toEqual({ x: 0, y: 65, z: 0 })
  })
})
