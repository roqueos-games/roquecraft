// RoqueCraft — QUAL GERADOR PARA QUAL DIMENSÃO. Uma decisão, num lugar.
//
// Antes eram dois ternários iguais, um no pipeline e outro na travessia, e a
// terceira dimensão faria deles dois `if/else if` iguais. Quem precisa gerar um
// chunk de uma dimensão pergunta aqui.
import { createNoiseContext, generateChunkData, terrainHeight } from './worldgen.js'
import { hash3 } from './noise.js'
import { SEA_LEVEL } from './constants.js'
import { planoDaFortaleza } from './fortaleza.js'
import { criarRuidoDoNether, gerarChunkDoNether } from './netherWorldgen.js'
import { criarRuidoDoFim, gerarChunkDoFim } from './endWorldgen.js'

/** `(cx, cz) → { blocks, heights, biomes }` para a dimensão, com o ruído da semente. */
export function criarGerador(semente, dimensao = 'overworld') {
  if (dimensao === 'nether') {
    const nz = criarRuidoDoNether(semente)
    return (cx, cz) => gerarChunkDoNether(nz, cx, cz)
  }
  if (dimensao === 'end') {
    const nz = criarRuidoDoFim(semente)
    return (cx, cz) => gerarChunkDoFim(nz, cx, cz)
  }
  const nz = createNoiseContext(semente)
  return (cx, cz) => generateChunkData(nz, cx, cz)
}

/**
 * O plano da fortaleza desta semente — o MESMO que o gerador escreve, porque
 * é a mesma função com o mesmo ruído. O componente pergunta aqui quando o
 * olho do Fim aponta.
 */
export function fortalezaDaSemente(semente) {
  const nz = createNoiseContext(semente)
  return planoDaFortaleza((a, b, c) => hash3(a, b, c, semente), {
    alturaEm: (x, z) => terrainHeight(nz, x, z),
    nivelDoMar: SEA_LEVEL,
  })
}
