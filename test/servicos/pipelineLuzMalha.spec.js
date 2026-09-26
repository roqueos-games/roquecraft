import { describe, it, expect, vi } from 'vitest'
import { createPipeline } from '../../src/servicos/chunkPipeline.js'
import { SECTION_COUNT, WORLD_HEIGHT, chunkKey } from '../../src/servicos/constants.js'
import { ID } from '../../src/servicos/blocks.js'
import { neighborsLit, neighborsReady } from '../../src/servicos/chunkStore.js'
import { buildNeighborhood, neighborhoodAccessor } from '../../src/servicos/neighborhood.js'
import { meshSection } from '../../src/servicos/mesher.js'
import { relogioSintetico, moer } from './relogioDoPipeline.js'
import { TETO_DE_MUNDO } from '../tetos.js'

// ⚠️ ESTE ARQUIVO GERA MUNDO, E GERAR MUNDO CUSTA SEGUNDOS DE VERDADE.
//
// Raio 8 são 289 chunks, cada um com 65 mil blocos de ruído 3D: 8,5s por teste
// numa máquina ociosa, e o trabalho é o mesmo em qualquer uma. O teto global de
// 15s existe para pegar teste que TRAVA, e com a máquina carregada (um build
// ao lado, um sweep de mutação, o LM Studio) ele passa a reprovar teste que está
// fazendo exatamente o que devia -- vermelho que depende da carga, que é o tipo
// que ensina a ignorar vermelho. O teto vem de `tests/setup/tetos.js`, num
// lugar só: sob `--coverage` ele PRECISA ser outro, e o porquê está medido lá.
vi.setConfig({ testTimeout: TETO_DE_MUNDO })

// A MALHA TEM QUE SER A MESMA, NÃO IMPORTA A ORDEM EM QUE O MUNDO CHEGOU.
//
// Relato do founder (2026-08-23, print em 90/67/3): "tem ainda blocos
// renderizados sem fundo, sem lateral e sem colisão que eu ando e atravesso
// eles... às vezes os mundos são criados perfeitamente, mas tem vezes que eles
// são criados com blocos defeituosos, ou voando". E a pista que resolveu o
// caso: "quando eu reduzo a quantidade de blocos de distância e depois aumento
// novamente ele recria o mundo sem nenhum problema".
//
// Recriar consertar significa que os DADOS estavam certos e a MALHA é que
// estava velha. `scripts/qa-roquecraft-malha.mjs` mediu: 674 de 674 malhas de
// uma sessão eram construídas com pelo menos um vizinho ainda apagado — cem por
// cento — e 232 de 712 seções não batiam com o que o mesher produziria com o
// mundo assentado.
//
// Por que luz apagada muda GEOMETRIA e não só brilho: a chave de fusão do
// greedy inclui luz e AO. Vizinho apagado é um array de zeros, a média da luz
// dos vértices de borda muda, faces que deveriam virar um quad se partem em
// vários. Contagem de vértices diferente, costura escura em grade.
//
// Este arquivo guarda as duas metades do conserto:
//   1. malha só sai com a vizinhança ACESA  (`neighborsLit`)
//   2. luz que escorre pro vizinho já malhado manda remalhar (`toquesDaLuz`)

async function sessao({ seed = 1337, raio = 3, orcamento = 8, caminho = [] } = {}) {
  const malhas = new Map() // "cx,sy,cz" → baldes, como o `engine.sectionMeshes`
  const espelho = new Set() // chunks que a colisão enxerga
  const apagados = [] // malhas emitidas com vizinho apagado — tem que ficar vazio
  let emitidas = 0

  const pipe = createPipeline({
    seed,
    renderDistance: raio,
    agora: relogioSintetico(),
    emit(m) {
      if (m.t === 'chunk') espelho.add(chunkKey(m.cx, m.cz))
      if (m.t === 'mesh') {
        emitidas++
        // ⚠️ medido NO INSTANTE do emit: depois a luz chega e o flagrante some
        if (!neighborsLit(pipe.world, m.cx, m.cz)) apagados.push(`${m.cx},${m.sy},${m.cz}`)
        const e = {}
        for (const b of ['opaque', 'cutout', 'transparent']) if (m[b]?.count) e[b] = m[b]
        const k = `${m.cx},${m.sy},${m.cz}`
        if (Object.keys(e).length) malhas.set(k, e)
        else malhas.delete(k)
      }
      if (m.t === 'unload') {
        espelho.delete(chunkKey(m.cx, m.cz))
        for (const k of [...malhas.keys()]) {
          const p = k.split(',')
          if (Number(p[0]) === m.cx && Number(p[2]) === m.cz) malhas.delete(k)
        }
      }
    },
  })

  // "assentado" exige ticks seguidos sem trabalho: a fila de luz esvazia e
  // volta a encher quando o vizinho termina de gerar.
  const rodar = async () => {
    await moer(pipe, { orcamento, progresso: () => emitidas + espelho.size })
  }
  pipe.setCenter(0, 0, 4)
  await rodar()
  for (const [cx, cz] of caminho) {
    pipe.setCenter(cx, cz, 4)
    await rodar()
  }
  return {
    pipe,
    malhas,
    espelho,
    apagados,
    rodar,
    get emitidas() {
      return emitidas
    },
  }
}

/** Primeiro ar acima do terreno numa coluna — onde uma tocha pode ficar. */
function arNaColuna(world, x, z) {
  const c = world.chunks.get(chunkKey(x >> 4, z >> 4))
  const base = ((x & 15) * 16 + (z & 15)) * WORLD_HEIGHT
  for (let y = WORLD_HEIGHT - 2; y > 1; y--) {
    if (c.blocks[base + y] !== 0) return y + 1
  }
  return null
}

const iguais = (a, b) => {
  if (!a || !b || a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

const todosAcesos = (world, cx, cz) => {
  const c = world.chunks.get(chunkKey(cx, cz))
  return !!c?.lit && neighborsReady(world, cx, cz) && neighborsLit(world, cx, cz)
}

/**
 * Compara cada malha entregue com o que o mesher produziria AGORA, no mundo já
 * parado. Diferença = o jogador está vendo uma malha velha.
 */
function conferir({ pipe, malhas }) {
  const world = pipe.world
  const achados = []
  let secoes = 0
  for (const c of world.chunks.values()) {
    if (!todosAcesos(world, c.cx, c.cz)) continue
    const acc = neighborhoodAccessor(buildNeighborhood(world, c.cx, c.cz))
    for (let sy = 0; sy < SECTION_COUNT; sy++) {
      const gab = meshSection(acc, c.cx, sy, c.cz)
      const tem = malhas.get(`${c.cx},${sy},${c.cz}`) || {}
      secoes++
      for (const b of ['opaque', 'cutout', 'transparent']) {
        const g = gab[b]?.count ? gab[b] : null
        const t = tem[b] || null
        if (!g && !t) continue
        const onde = `${c.cx},${sy},${c.cz} ${b}`
        if (g && !t) achados.push(`faltando  ${onde} (${g.count} vertices)`)
        else if (!g && t) achados.push(`fantasma  ${onde} (${t.count} vertices)`)
        else if (g.count !== t.count || !iguais(g.position, t.position))
          achados.push(`geometria ${onde} (${t.count} != ${g.count})`)
        else if (!iguais(g.light, t.light)) achados.push(`luz       ${onde}`)
      }
    }
  }
  return { achados, secoes }
}

const CAMINHO = [
  [1, 0],
  [2, 1],
  [1, 2],
  [0, 0],
]

describe('roquecraft - malha nunca sai contra vizinho apagado', () => {
  it('mundo parado: nenhuma seção é malhada com vizinho sem luz', async () => {
    const s = await sessao()
    expect(s.emitidas, 'nada foi malhado — o teste não mediu nada').toBeGreaterThan(100)
    expect(s.apagados.slice(0, 8)).toEqual([])
  })

  it('jogador andando: nenhuma seção é malhada com vizinho sem luz', async () => {
    const s = await sessao({ caminho: CAMINHO })
    expect(s.emitidas).toBeGreaterThan(100)
    expect(s.apagados.slice(0, 8)).toEqual([])
  })
})

describe('roquecraft - a malha entregue bate com o mundo assentado', () => {
  for (const orcamento of [2, 8, 32]) {
    it(`orçamento de ${orcamento} ms não muda o resultado`, async () => {
      const s = await sessao({ orcamento })
      const { achados, secoes } = conferir(s)
      // ⚠️ prova de vida: comparador que não comparou nada também devolve zero
      expect(secoes, 'nenhuma seção comparada').toBeGreaterThan(200)
      expect(malhasVivas(s), 'nenhuma malha na mão do renderizador').toBeGreaterThan(50)
      expect(achados.slice(0, 8)).toEqual([])
    })
  }

  it('depois de andar e voltar, nada fica para trás', async () => {
    const s = await sessao({ caminho: CAMINHO })
    const { achados, secoes } = conferir(s)
    expect(secoes).toBeGreaterThan(200)
    expect(achados.slice(0, 8)).toEqual([])
  })

  it('o detector sabe achar defeito: uma malha estragada é acusada', async () => {
    // Sem isto o zero acima não vale nada.
    const s = await sessao()
    const antes = conferir(s).achados.length
    const k = [...s.malhas.keys()].find((x) => s.malhas.get(x).opaque)
    const e = s.malhas.get(k)
    const luz = e.opaque.light.slice()
    luz[0] ^= 0xff
    s.malhas.set(k, { ...e, opaque: { ...e.opaque, light: luz } })
    expect(conferir(s).achados.length).toBeGreaterThan(antes)
  })

  it('toda malha entregue tem bloco por trás dela (colisão e desenho concordam)', async () => {
    // "blocos renderizados... sem colisão que eu ando e atravesso eles": uma
    // seção desenhada de um chunk que sumiu do espelho é exatamente isso.
    const s = await sessao({ caminho: CAMINHO })
    const orfas = [...s.malhas.keys()].filter((k) => {
      const p = k.split(',')
      return !s.espelho.has(chunkKey(Number(p[0]), Number(p[2])))
    })
    expect(s.malhas.size).toBeGreaterThan(50)
    expect(orfas.slice(0, 8)).toEqual([])
  })
})

const malhasVivas = (s) => s.malhas.size

const TOCHA = ID.torch

describe('roquecraft - editar também não pode deixar malha velha', () => {
  it('a tocha existe no catálogo (senão o teste abaixo não testa nada)', async () => {
    expect(TOCHA).toBeGreaterThan(0)
  })

  it('tocha no MEIO do chunk: o vizinho que a luz alcança é remalhado', async () => {
    // ⚠️ x = 8 é o ponto que denuncia o buraco. `updateLightAt` marcava as
    // seções sujas por um reticulado de offsets (−15 e +1), que a partir de
    // x = 8 cobre o chunk −1 e o chunk 0 — e NÃO o chunk 1, que começa em
    // x = 16 e recebe luz até x = 21 (tocha nível 14 alcança 13 células).
    // Com o registro de toque, quem mudou de luz é remalhado por medição, não
    // por chute de raio.
    const s = await sessao()
    expect(conferir(s).achados.slice(0, 8)).toEqual([])

    const y = arNaColuna(s.pipe.world, 8, 8)
    expect(y, 'não achei ar na coluna — o teste não colocaria tocha nenhuma').toBeTruthy()
    s.pipe.edit(8, y, 8, TOCHA)
    await s.rodar()

    const { achados, secoes } = conferir(s)
    expect(secoes).toBeGreaterThan(200)
    expect(achados.slice(0, 8)).toEqual([])
  })

  it('duas edições seguidas em chunks vizinhos: a segunda não reusa a vizinhança da primeira', async () => {
    // ⚠️ Este é o caso que o cache de vizinhança do `meshOne` deixava passar.
    // Ele guarda UMA vizinhança, chaveada pelo chunk central e pelo `stamp`
    // dele. Mas a vizinhança copia a moldura dos 8 vizinhos: mexer no chunk 1
    // envelhece a vizinhança guardada do chunk 0, e o `stamp` do chunk 0 não
    // muda. Com a invalidação por igualdade exata, a segunda edição era malhada
    // com a moldura de antes da primeira.
    //
    // Duas edições em chunks vizinhos, com a malha rodando entre elas, é o
    // mínimo pra o cache estar quente no chunk errado na hora errada.
    const s = await sessao()
    const y0 = arNaColuna(s.pipe.world, 14, 8)
    s.pipe.edit(14, y0, 8, TOCHA)
    await s.rodar()
    const y1 = arNaColuna(s.pipe.world, 17, 8)
    s.pipe.edit(17, y1, 8, TOCHA)
    await s.rodar()
    expect(conferir(s).achados.slice(0, 8)).toEqual([])
  })

  it('uma fileira de tochas atravessando duas divisas não deixa costura em lugar nenhum', async () => {
    // ⚠️ UMA POSIÇÃO SÓ NÃO BASTA, e isso é sobre o que cada bit de borda
    // realmente protege.
    //
    // Com a tocha em x = 8, a luz ENTRA no chunk −1 (alcança x = −5). Aí o
    // chunk −1 é tocado diretamente e seria remalhado mesmo sem o bit
    // `xBaixo` — o teste passava com o bit morto. O caso que só o bit pega é a
    // luz que morre EXATAMENTE na divisa: chega a acender a coluna x = 0 do
    // chunk 0 (que a malha do chunk −1 lê como moldura) e não passa dali.
    //
    // Achar essa posição no papel dependeria do relevo da semente. Varrer a
    // fileira acha sem depender de sorte, e de quebra exercita o cache de
    // vizinhança com o conjunto de remalha de um chunk só.
    const s = await sessao({ raio: 2 })
    let postas = 0
    for (const x of [1, 5, 8, 11, 13, 14, 15, 16, 17, 19, 22, 26, 29]) {
      const y = arNaColuna(s.pipe.world, x, 8)
      if (!y) continue
      s.pipe.edit(x, y, 8, TOCHA)
      await s.rodar()
      postas++
    }
    expect(postas, 'nenhuma tocha foi posta — o teste não testou nada').toBeGreaterThan(8)
    const { achados, secoes } = conferir(s)
    expect(secoes).toBeGreaterThan(100)
    expect(achados.slice(0, 8)).toEqual([])
  })

  it('edição na FRONTEIRA da malha não deixa o vizinho visível com dado velho', async () => {
    // ⚠️ Este é o caso que o selo do cache de vizinhança existe pra cobrir, e
    // ele é estreito de propósito — foi preciso construí-lo.
    //
    // `meshOne` guarda UMA vizinhança. Normalmente isso basta: a fila serve o
    // chunk mais perto primeiro, então entre duas malhas do mesmo chunk quase
    // sempre entra outro chunk e o cache se refaz sozinho. "Quase sempre" não é
    // invariante.
    //
    // Aqui o conjunto de remalha tem UM chunk só. Editando dentro do anel que
    // está ACESO mas ainda NÃO MALHADO (raio+1), a luz atravessa pro anel
    // visível (raio) e só ele precisa remalhar — o chunk editado não, porque
    // ninguém desenha ele. Com o cache quente nesse mesmo chunk visível e o
    // selo olhando só o `stamp` do centro, a remalha devolve exatamente a malha
    // velha: o pipeline faz tudo certo e o defeito fica na tela.
    //
    // É o que uma edição remota de multiplayer faz na beira do raio.
    const raio = 3
    const s = await sessao({ raio })
    // esquenta o cache no chunk visível mais distante
    const yQuente = arNaColuna(s.pipe.world, raio * 16 + 8, 8)
    s.pipe.edit(raio * 16 + 8, yQuente, 8, TOCHA)
    await s.rodar()
    // agora edita no anel de fora, encostado na divisa
    const xFora = (raio + 1) * 16
    const yFora = arNaColuna(s.pipe.world, xFora, 8)
    expect(yFora, 'o anel de fora não estava carregado').toBeTruthy()
    const fora = s.pipe.world.chunks.get(chunkKey(raio + 1, 0))
    expect(fora?.lit, 'o anel de fora tem que estar aceso').toBe(true)
    expect(fora?.malhado, 'o anel de fora NÃO pode estar malhado').toBe(false)
    s.pipe.edit(xFora, yFora, 8, TOCHA)
    await s.rodar()

    const { achados, secoes } = conferir(s)
    expect(secoes).toBeGreaterThan(100)
    expect(achados.slice(0, 8)).toEqual([])
  })

  it('quebrar um bloco na divisa não deixa costura', async () => {
    const s = await sessao()
    const y = arNaColuna(s.pipe.world, 15, 15)
    s.pipe.edit(15, y - 1, 15, 0) // tira o bloco do topo, bem no canto do chunk
    await s.rodar()
    expect(conferir(s).achados.slice(0, 8)).toEqual([])
  })
})
