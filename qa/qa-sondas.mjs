//
// A VARREDURA DAS SONDAS — todas, uma a uma, com o resultado ESCRITO.
//
// ⚠️ ISTO EXISTE PORQUE AS SONDAS APODRECIAM EM SILÊNCIO. Em 18/09/2026 as 91
// foram rodadas uma a uma pela primeira vez em semanas: 3 estavam vermelhas
// por estarem velhas (a aldeia mudou de lugar, o minimapa virou disco, a aranha
// passou a dropar olho), 3 pediam um WebKit que ninguém tinha instalado, e a
// de PRODUÇÃO procurava um botão que o site deixou de ter no Goal 15 — o smoke
// do jogo no ar estava morto havia oito dias e nenhum gate sabia.
//
// Nenhuma delas está em gate: rodar as 85 leva uma hora. O que cabe num gate é
// a PERGUNTA "quando foi a última varredura, e o que ela achou?" — e é isso que
// este script responde, gravando `qa/qa-roquecraft-varredura.json`, que é
// versionado e lido por `test/arquitetura/sondas-varridas.spec.js`.
//
//   node qa/qa-sondas.mjs             # todas, da raiz do repo
//   node qa/qa-sondas.mjs aldeia prod # só as que casam
//
// Veio de `scripts/qa-sondas.mjs` do RoqueOS (7ab22a6f). Aqui as sondas moram
// em `qa/`, e as que abrem o jogo pedem antes o `node qa/lib/preparar-dist.mjs`
// (ver `qa/README.md`).
//
// Quatro estados, e a diferença entre eles é o que importa:
//   verde     — saiu 0
//   vermelha  — saiu ≠ 0 pelo que MEDIU
//   nao-rodou — o navegador que ela pede não está instalado (não é vermelho:
//               é a máquina, e o gate diz qual comando instala)
//   humana    — existe para o olho (`mostra` no manifesto); não se julga
//
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const DIR = path.resolve('qa')
const LEDGER = path.join(DIR, 'qa-roquecraft-varredura.json')
const MANIFESTO = JSON.parse(
  fs.readFileSync(path.join(DIR, 'qa-roquecraft-manifesto.json'), 'utf8'),
)
const TEMPO_MAXIMO_MS = 240_000
const filtros = process.argv.slice(2)

const sondas = fs
  .readdirSync(DIR)
  .filter((f) => /^qa-roquecraft.*\.mjs$/.test(f) && !/\.impl\./.test(f))
  .filter((f) => !filtros.length || filtros.some((x) => f.includes(x)))
  .sort()

const anterior = fs.existsSync(LEDGER)
  ? JSON.parse(fs.readFileSync(LEDGER, 'utf8'))
  : { sondas: {} }
const resultado = { ...anterior.sondas }
const inicio = new Date()

for (const f of sondas) {
  const nome = f.replace(/\.mjs$/, '')
  if (MANIFESTO.mostra.includes(f)) {
    resultado[nome] = { estado: 'humana', quando: inicio.toISOString() }
    console.log(`  humana     ${nome}`)
    continue
  }
  const t0 = Date.now()
  const r = spawnSync(process.execPath, [path.join(DIR, f)], {
    encoding: 'utf8',
    timeout: TEMPO_MAXIMO_MS,
    maxBuffer: 64 * 1024 * 1024,
    env: process.env,
  })
  const segundos = Math.round((Date.now() - t0) / 1000)
  const saida = `${r.stdout || ''}\n${r.stderr || ''}`
  const semNavegador = /Executable doesn't exist|npx playwright install/.test(saida)
  const estouro = r.error?.code === 'ETIMEDOUT' || r.signal === 'SIGTERM'
  const estado = semNavegador
    ? 'nao-rodou'
    : estouro
      ? 'vermelha'
      : r.status === 0
        ? 'verde'
        : 'vermelha'
  const ultimas = saida.trim().split('\n').slice(-6).join('\n').slice(0, 600)
  resultado[nome] = {
    estado,
    exit: estouro ? 'estourou' : r.status,
    segundos,
    quando: new Date().toISOString(),
    ...(estado !== 'verde' ? { ultimas } : {}),
  }
  console.log(`  ${estado.padEnd(10)} ${nome}  ${segundos}s`)
}

// Sonda que saiu do disco sai do ledger: ledger só fala do que existe.
for (const nome of Object.keys(resultado)) {
  if (!fs.existsSync(path.join(DIR, `${nome}.mjs`))) delete resultado[nome]
}

const total = Object.values(resultado).reduce(
  (a, s) => ((a[s.estado] = (a[s.estado] || 0) + 1), a),
  {},
)
// ⚠️ `varridoEm` É A SONDA MAIS VELHA, não o relógio desta rodada. Rodar uma
// sonda só (`node qa/qa-sondas.mjs porta`) NÃO rejuvenesce as outras 90:
// com a data da rodada, um filtro de uma sonda zerava a folga de 21 dias da
// varredura inteira, e o gate de idade virava decoração.
const maisVelha = Object.values(resultado).reduce(
  (a, s) => (s.quando && s.quando < a ? s.quando : a),
  inicio.toISOString(),
)
const ledger = {
  _porque: 'Ver qa/qa-sondas.mjs e test/arquitetura/sondas-varridas.spec.js',
  varridoEm: maisVelha,
  totais: total,
  sondas: Object.fromEntries(Object.entries(resultado).sort(([a], [b]) => a.localeCompare(b))),
}
fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + '\n')
console.log(`\n${JSON.stringify(total)} → ${path.relative(process.cwd(), LEDGER)}`)
const vermelhas = Object.entries(resultado).filter(([, s]) => s.estado === 'vermelha')
for (const [n, s] of vermelhas) console.log(`\nVERMELHA ${n}:\n${s.ultimas}`)
process.exit(vermelhas.length ? 1 : 0)
