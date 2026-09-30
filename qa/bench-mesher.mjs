// Quanto custa malhar uma seção, em milissegundos. Existe porque "o teste de
// perf passou" e "não ficou mais lento" são frases diferentes: o teto do teste
// é calibrado com folga, e uma piora de 20% cabe embaixo dele sem apitar.
//
//   node qa/bench-mesher.mjs            # só mede e imprime
//   node qa/bench-mesher.mjs --ledger   # mede e grava em qa/bench-mesher.json
//
// O `--ledger` é o que a régua lê (`test/arquitetura/mesher-medido.spec.js`,
// regra em `qa/lib/regua-do-mesher.mjs`): a medição mais nova não pode ficar
// mais de 10 % acima da melhor medição anterior da MESMA máquina, nem ter mais
// de 21 dias. Cada medição é a MEDIANA de RODADAS rodadas de N seções, porque
// uma rodada só oscila com o que mais está rodando na máquina.
//
// Veio de `scripts/bench-mesher.mjs` do RoqueOS (7ab22a6f); só os imports
// mudaram, para o motor em `src/servicos/`. O ledger é de 30/09/2026.
//
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { meshSection } from '../src/servicos/mesher.js'
import { BLOCK_BY_KEY, AIR } from '../src/servicos/blocks.js'
import { comMedicao, vereditoDoMesher } from './lib/regua-do-mesher.mjs'

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
const RODADAS = 5
meshSection(mundo, 0, 0, 0) // aquece
let tri = 0
const rodadas = []
for (let r = 0; r < RODADAS; r++) {
  const t0 = performance.now()
  for (let i = 0; i < N; i++) {
    const m = meshSection(mundo, 0, 0, 0)
    tri = (m.opaque?.count || 0) + (m.cutout?.count || 0) + (m.transparent?.count || 0)
  }
  rodadas.push((performance.now() - t0) / N)
}
const ordenadas = [...rodadas].sort((a, b) => a - b)
const ms = ordenadas[Math.floor(ordenadas.length / 2)]
const medicao = {
  quando: new Date().toISOString(),
  commit: (() => {
    try {
      return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim()
    } catch {
      return null
    }
  })(),
  maquina: {
    plataforma: os.platform(),
    arquitetura: os.arch(),
    cpu: os.cpus()[0]?.model || 'desconhecida',
    node: process.version,
  },
  msPorSecao: +ms.toFixed(3),
  rodadas: rodadas.map((r) => +r.toFixed(3)),
  vertices: tri,
}
console.log(JSON.stringify(medicao))

if (process.argv.includes('--ledger')) {
  const LEDGER = path.resolve('qa/bench-mesher.json')
  const antes = fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, 'utf8')) : null
  const depois = comMedicao(antes, medicao)
  fs.writeFileSync(LEDGER, JSON.stringify(depois, null, 2) + '\n')
  const veredito = vereditoDoMesher(depois)
  console.log(`${veredito.ok ? 'ok' : 'FALHOU'}  ${veredito.motivo} → ${LEDGER}`)
  process.exit(veredito.ok ? 0 : 1)
}
