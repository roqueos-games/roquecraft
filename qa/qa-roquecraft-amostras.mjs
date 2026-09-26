//
// A DURAÇÃO DE CADA AMOSTRA, decodificada.
//
// O founder ouviu "dois sons na areia: um certo e outro que às vezes entra
// junto e se repete infinitamente". Contador de disparos não vê isso — ele
// conta gatilhos, não duração. Uma amostra longa demais num grupo de passo
// empilha cópias a cada 0,32 s e soa exatamente como repetição sem fim, e um
// arquivo defeituoso entre seis explica o "às vezes".
//
// Decodifica pelo navegador (mesmo caminho do jogo) e mede: duração, pico e
// silêncio no fim. Nada de deduzir por tamanho de arquivo — Vorbis é variável.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const RAIZ = path.resolve('public/games/roquecraft/audio')
const TIPO = { '.ogg': 'audio/ogg', '.json': 'application/json', '.html': 'text/html' }
const srv = http.createServer((q, r) => {
  const f = path.join(RAIZ, decodeURIComponent((q.url || '/').split('?')[0]))
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    r.statusCode = 404
    return r.end('nao')
  }
  r.setHeader('Content-Type', TIPO[path.extname(f)] || 'application/octet-stream')
  fs.createReadStream(f).pipe(r)
})
await new Promise((r) => srv.listen(0, r))
const base = `http://localhost:${srv.address().port}`

const manifesto = JSON.parse(fs.readFileSync(path.join(RAIZ, 'manifest.json'), 'utf8'))

const b = await chromium.launch()
const page = await b.newPage()
await page.goto(`${base}/manifest.json`, { waitUntil: 'domcontentloaded' })

const medido = await page.evaluate(
  async ([grupos, origem]) => {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext
    const ctx = new OAC(1, 1024, 44100)
    const saida = []
    for (const [grupo, arquivos] of Object.entries(grupos)) {
      for (const arq of arquivos) {
        try {
          const r = await fetch(`${origem}/${arq}`)
          const buf = await ctx.decodeAudioData(await r.arrayBuffer())
          const d = buf.getChannelData(0)
          let pico = 0
          for (let i = 0; i < d.length; i++) pico = Math.max(pico, Math.abs(d[i]))
          // Onde o som REALMENTE acaba: último ponto acima de 1% do pico.
          let fim = 0
          for (let i = d.length - 1; i >= 0; i--) {
            if (Math.abs(d[i]) > pico * 0.01) {
              fim = i
              break
            }
          }
          saida.push({
            grupo,
            arq,
            dur: +buf.duration.toFixed(3),
            util: +(fim / buf.sampleRate).toFixed(3),
            pico: +pico.toFixed(3),
          })
        } catch (e) {
          saida.push({ grupo, arq, erro: String(e).slice(0, 80) })
        }
      }
    }
    return saida
  },
  [manifesto.grupos, base],
)

await b.close()
srv.close()

const porGrupo = new Map()
for (const m of medido) {
  if (!porGrupo.has(m.grupo)) porGrupo.set(m.grupo, [])
  porGrupo.get(m.grupo).push(m)
}
// ⚠️ O que interessa num grupo de EFEITO não é a média, é o DESVIO. Um arquivo
// três vezes mais longo que os irmãos é o que soa como bug.
const suspeitos = []
for (const [, itens] of porGrupo) {
  const bons = itens.filter((i) => !i.erro)
  if (bons.length < 2) continue
  const meds = bons.map((i) => i.util).sort((a, b) => a - b)
  const mediana = meds[Math.floor(meds.length / 2)]
  for (const i of bons) {
    if (mediana > 0 && i.util > mediana * 2.2) {
      suspeitos.push({ ...i, mediana: +mediana.toFixed(3), vezes: +(i.util / mediana).toFixed(1) })
    }
  }
}
// ⚠️ ORÇAMENTO DE PASSO. Correndo (4,7 × 1,35 = 6,345 m/s) e com 1,5 m por
// passada, sai um passo a cada 0,236 s. Amostra mais longa que isso se sobrepõe
// à seguinte enquanto o jogador anda, e continua soando depois que ele para —
// foi o "som repetindo infinitamente na areia" de 2026-08-23.
//
// Aqui isto é RELATÓRIO, não reprovação, e a diferença importa: o arquivo longo
// não é mais um defeito, porque `recortarPasso` corta na carga e a voz única
// corta o que sobrar (ver `passo.js` e `audio.js`, cobertos por
// `passoAmostra.spec.js`). Reprovar o arquivo seria cobrar duas vezes a mesma
// garantia e ainda mandar mexer em asset CC0 versionado à toa.
const ORCAMENTO_PASSO = (1.5 / (4.7 * 1.35)) * 0.85
const acimaDoOrcamento = medido
  .filter((m) => !m.erro && m.grupo.startsWith('passo.') && m.util > ORCAMENTO_PASSO)
  .map((m) => ({ arq: m.arq, util: m.util }))

console.log(
  JSON.stringify(
    {
      erros: medido.filter((m) => m.erro),
      orcamentoPasso: +ORCAMENTO_PASSO.toFixed(3),
      recortadasNaCarga: acimaDoOrcamento,
      suspeitos,
      porGrupo: [...porGrupo].map(([g, i]) => ({
        grupo: g,
        n: i.length,
        durs: i.map((x) => x.util ?? 'ERRO'),
      })),
    },
    null,
    2,
  ),
)
// O veredito sai pelo código de saída: o ledger de sondas lê ISSO, não a prosa.
// Só a amostra que NÃO DECODIFICA reprova: a longa é relatório (ver acima —
// `recortarPasso` corta na carga, e reprovar aqui cobraria a garantia duas vezes).
process.exit(medido.every((m) => !m.erro) ? 0 : 1)
