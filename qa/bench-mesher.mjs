// Quanto custa malhar uma seção, em milissegundos. Existe porque "o teste de
// perf passou" e "não ficou mais lento" são frases diferentes: o teto do teste
// é calibrado com folga, e uma piora de 20% cabe embaixo dele sem apitar.
//
//   node qa/bench-mesher.mjs
//
// Veio de `scripts/bench-mesher.mjs` do RoqueOS (7ab22a6f); só os imports
// mudaram, para o motor em `src/servicos/`.
//
import { meshSection } from '../src/servicos/mesher.js'
import { BLOCK_BY_KEY, AIR } from '../src/servicos/blocks.js'

const pedra = BLOCK_BY_KEY.stone.id
const terra = BLOCK_BY_KEY.dirt.id
const grama = BLOCK_BY_KEY.grassBlock.id
const folha = BLOCK_BY_KEY.oakLeaves.id
const tronco = BLOCK_BY_KEY.oakLog.id
const capim = BLOCK_BY_KEY.tallGrass.id

// Cena com relevo, árvore e mato: um chunk liso mede greedy no melhor caso e
// esconde justamente o custo por FACE, que é onde a mudança mexeu.
const alt = (x, z) => 6 + ((x * 7 + z * 5) % 5) + ((x + z) % 3)
const mundo = {
  block: (x, y, z) => {
    const h = alt(x & 15, z & 15)
    if (y < h - 3) return pedra
    if (y < h) return terra
    if (y === h) return grama
    if (y === h + 1 && (x & 3) === 0 && (z & 3) === 0) return capim
    if (y > h && y <= h + 4 && (x & 7) === 3 && (z & 7) === 3) return tronco
    if (y > h + 2 && y <= h + 6 && Math.abs((x & 7) - 3) + Math.abs((z & 7) - 3) < 3) return folha
    return AIR
  },
  light: () => 0xf0,
  tint: () => [0.4, 0.7, 0.3],
}

const N = 200
meshSection(mundo, 0, 0, 0) // aquece
const t0 = performance.now()
let tri = 0
for (let i = 0; i < N; i++) {
  const r = meshSection(mundo, 0, 0, 0)
  tri = (r.opaque?.count || 0) + (r.cutout?.count || 0) + (r.transparent?.count || 0)
}
const ms = (performance.now() - t0) / N
console.log(JSON.stringify({ msPorSecao: +ms.toFixed(3), vertices: tri }))
