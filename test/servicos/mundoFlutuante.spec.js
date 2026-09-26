import { desserializarPaleta } from '../../src/servicos/paleta.js'
import { idNoIndice } from '../../src/servicos/chunkStore.js'
import { describe, it, expect, vi } from 'vitest'
import { createPipeline } from '../../src/servicos/chunkPipeline.js'
import { CHUNK_SIZE, WORLD_HEIGHT } from '../../src/servicos/constants.js'
import { BLOCKS, IS_SOLID, AIR } from '../../src/servicos/blocks.js'
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

// COISAS FLUTUANDO NO MAPA.
//
// Relato do founder (2026-08-22): "ainda tem algumas coisas flutuando no mapa,
// como esses blocos de gelo sem a parte das laterais e inferior".
//
// Eu li isso como defeito de RENDER e gastei o dia provando que não era: a
// malha tem todas as faces (633 mil blocos auditados no jogo rodando), e o
// bloco de gelo aparece inteiro de todo ângulo, inclusive por baixo. O que eu
// não tinha lido era a primeira palavra: FLUTUANDO.
//
// Uma camada de neve mede 1/8 de bloco. Vista de longe ela é uma placa branca
// fina: a lateral tem um pixel de altura e o fundo não aparece. Se o gerador a
// deposita sobre AR — sobre folhagem que não é suporte, sobre uma cavidade que
// o ruído 3D abriu embaixo — o resultado é exatamente o que ele descreveu, e a
// leitura natural de quem vê é "um bloco de gelo sem as laterais e o fundo".
//
// Isto é defeito de GERAÇÃO, não de desenho, e é aqui que se mede.

// Quem precisa de chão. A camada de neve é o caso que o founder viu, mas a
// classe é maior: toda planta em cruz (flor, grama alta, muda, cogumelo) tem o
// mesmo contrato com o mundo, e uma flor pendurada no ar é o mesmo defeito com
// outra textura.
const PRECISA_DE_CHAO = (def) =>
  def.key === 'snowLayer' || def.key === 'ice' || def.plant || def.cross

async function mundo(seed, distancia = 2, centro = [0, 0]) {
  const chunks = new Map()
  const pipe = createPipeline({
    seed,
    renderDistance: distancia,
    agora: relogioSintetico(),
    emit: (m) => {
      if (m.t === 'chunk')
        chunks.set(`${m.cx},${m.cz}`, { blocks: m.blocks, paleta: desserializarPaleta(m.paleta) })
    },
  })
  pipe.setCenter(centro[0], centro[1])
  await moer(pipe, { progresso: () => chunks.size })
  return chunks
}

const localIndex = (lx, y, lz) => (lx * CHUNK_SIZE + lz) * WORLD_HEIGHT + y

/** Blocos que precisam de apoio e estão sobre AR. */
function flutuantes(chunks) {
  const bloco = (x, y, z) => {
    if (y < 0 || y >= WORLD_HEIGHT) return AIR
    const b = chunks.get(`${x >> 4},${z >> 4}`)
    if (!b) return null
    return idNoIndice(b, localIndex(x & 15, y, z & 15))
  }
  const porTipo = {}
  const exemplos = []
  let examinados = 0
  for (const key of chunks.keys()) {
    const [cx, cz] = key.split(',').map(Number)
    for (let lx = 0; lx < CHUNK_SIZE; lx++)
      for (let lz = 0; lz < CHUNK_SIZE; lz++)
        for (let y = 1; y < WORLD_HEIGHT; y++) {
          const x = cx * CHUNK_SIZE + lx
          const z = cz * CHUNK_SIZE + lz
          const id = bloco(x, y, z)
          if (!id) continue
          const def = BLOCKS[id]
          if (!def || !PRECISA_DE_CHAO(def)) continue
          examinados++
          const abaixo = bloco(x, y - 1, z)
          if (abaixo === null) continue
          // Apoio válido: bloco sólido embaixo, OU o mesmo bloco — cana e
          // cacto crescem empilhados, e só o pé da pilha toca o chão. Sobre ar
          // não há apoio nenhum, e é esse o defeito.
          if (IS_SOLID[abaixo] === 1 || abaixo === id) continue
          porTipo[def.key] = (porTipo[def.key] || 0) + 1
          if (exemplos.length < 12)
            exemplos.push(`${def.key} em (${x},${y},${z}) sobre id=${abaixo}`)
        }
  }
  return { porTipo, exemplos, examinados }
}

// Sementes escolhidas por medição, não por gosto: a 7 é a que produzia 204
// placas penduradas num raio de 2 chunks. Sem uma semente que FALHAVA, o
// arquivo inteiro seria uma fileira de zeros que nunca provou nada.
const SEMENTES = [7, 20260819, 42, 1234]

describe('roquecraft - nada de neve ou gelo flutuando', () => {
  it('as sementes de teste realmente têm neve pra examinar', async () => {
    // Guarda contra o teste vazio: sem bloco de neve no raio, os `toEqual({})`
    // abaixo passam sem olhar para nada.
    let total = 0
    for (const s of SEMENTES) total += flutuantes(await mundo(s)).examinados
    expect(total, 'nenhum bloco de neve/gelo em nenhuma semente — teste vazio').toBeGreaterThan(200)
  })

  for (const seed of SEMENTES) {
    it(`semente ${seed}: nenhuma camada de neve ou gelo sobre o vazio`, async () => {
      const r = flutuantes(await mundo(seed))
      expect({ porTipo: r.porTipo, exemplos: r.exemplos }).toEqual({ porTipo: {}, exemplos: [] })
    })
  }

  // ── O LUGAR DO PRINT ─────────────────────────────────────────────────────
  //
  // O founder fotografou o defeito em (−98, 65, 82), bioma Praia, semente
  // 20260819. Os casos acima varrem raio 2 em volta da ORIGEM — chunks −3..3 —
  // e a coordenada dele é o chunk (−7, 5). Ou seja: o teste que eu escrevi pra
  // provar o conserto nunca olhou pro lugar onde ele viu o problema.
  //
  // Isso não é detalhe. Ruído de terreno é local: um defeito que depende de
  // caverna sob a superfície aparece onde o ruído abre caverna, e a origem
  // desta semente é oceano raso. Um teste tem que visitar a cena do relato.
  it('no lugar exato do print do founder (−98, 82) não há nada flutuando', async () => {
    // Sem guarda de "teste vazio" AQUI de propósito: aquela coluna é oceano de
    // 21 blocos de profundidade e não tem planta nem neve pra examinar — o
    // guard-rail vive no teste agregado acima, que soma todas as sementes.
    //
    // E o registro honesto: a placa branca que ele fotografou NÃO era bloco
    // flutuando. Era a espuma da água cobrindo todo o raso (ver
    // `voxelMaterial.js`). Este caso fica porque a coordenada dele merece
    // vigilância permanente, não porque foi aqui que o defeito estava.
    const r = flutuantes(await mundo(20260819, 3, [-7, 5]))
    expect({ porTipo: r.porTipo, exemplos: r.exemplos }).toEqual({ porTipo: {}, exemplos: [] })
  })

  // Varredura larga: a semente do jogo, um anel bem maior que o do print.
  it('varredura larga da semente do jogo não acha nada flutuando', async () => {
    const r = flutuantes(await mundo(20260819, 6))
    expect(r.examinados).toBeGreaterThan(100)
    expect({ porTipo: r.porTipo, exemplos: r.exemplos }).toEqual({ porTipo: {}, exemplos: [] })
  })
})
