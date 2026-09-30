#!/usr/bin/env node
// RoqueCraft - GABARITO DA MALHA.
//
// O founder reportou (2026-08-23, com print em 90/67/3): "blocos renderizados
// sem fundo, sem lateral e sem colisao que eu ando e atravesso eles", "as vezes
// os mundos sao criados perfeitamente, mas tem vezes que eles sao criados com
// blocos defeituosos, ou voando" e - a pista decisiva - "quando eu reduzo a
// quantidade de blocos de distancia e depois aumento novamente ele recria o
// mundo sem nenhum problema".
//
// Essa ultima frase e um diagnostico: os DADOS estao certos (a mesma seed
// regenera o mesmo terreno) e a MALHA e que esta velha. Entao o teste certo nao
// e olhar screenshot: e perguntar, no fim de uma sessao ja assentada, se a
// malha que o renderizador tem na mao e a mesma que o mesher produziria AGORA,
// com o mundo parado. Toda diferenca e um defeito que o jogador ve.
//
// O harness roda o pipeline de verdade (o mesmo modulo que roda no worker),
// espelha o lado do cliente (blocos) e o lado do renderizador (secoes), passeia
// com o jogador, deixa assentar e compara secao por secao contra o gabarito.
//
// PROVA DE VIDA: `--mutar=N` estraga N secoes de proposito depois da sessao. Um
// comparador que devolve zero sem conseguir mostrar que sabe achar defeito nao
// e medicao, e enfeite.
//
// Uso:
//   node scripts/qa-roquecraft-malha.mjs
//   node scripts/qa-roquecraft-malha.mjs --seed=7 --raio=6 --orcamentos=1,2,4,8
//   node scripts/qa-roquecraft-malha.mjs --mutar=3
//
// ⚠️ RODE PELO LANCADOR (`qa-roquecraft-malha.mjs`), e nao por este arquivo.
// Ele importa `src/` direto, e `src/` tem imports sem extensao que so o Vite
// resolve. Chamado com `node`, este arquivo morre no primeiro import -- e ja
// pareceu sonda com defeito por causa disso.

import { createPipeline } from '../src/servicos/chunkPipeline.js'
import { SECTION_COUNT, chunkKey } from '../src/servicos/constants.js'
import { neighborsReady } from '../src/servicos/chunkStore.js'
import { buildNeighborhood, neighborhoodAccessor } from '../src/servicos/neighborhood.js'
import { meshSection } from '../src/servicos/mesher.js'

const BALDES = ['opaque', 'cutout', 'transparent']

const arg = (nome, padrao) => {
  const p = process.argv.find((a) => a.startsWith(`--${nome}=`))
  return p ? p.slice(nome.length + 3) : padrao
}

// ⚠️ RELOGIO DE VERDADE, DE PROPOSITO.
//
// A primeira versao injetava um relogio falso que andava 1 ms por consulta,
// pra deixar o fatiamento deterministico. Deu falso zero: a fila de luz
// reconsulta `neighborsReady` de cada job adiado, e no modelo falso cada
// consulta custava o mesmo que gerar um chunk. O orcamento inteiro ia embora
// em verificacoes e a geracao parava em 7 chunks - o comparador entao dizia
// "OK" sobre um mundo que nunca existiu.
//
// A licao e a de sempre neste projeto: instrumento que nao consegue se mexer
// nao mede nada. Custo de verificacao e custo de trabalho nao sao a mesma
// coisa, e so o relogio de parede acerta os dois. Em troca a intercalacao
// varia entre execucoes - por isso o harness roda uma MATRIZ de seeds e
// orcamentos em vez de uma corrida so.

const iguais = (a, b) => {
  if (!a || !b || a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

const diferencas = (a, b) => {
  if (!a || !b) return Math.max(a?.length || 0, b?.length || 0)
  let n = 0
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) if (a[i] !== b[i]) n++
  return n
}

// Vizinhos existem, estao gerados E acesos. O gabarito so vale onde o mundo
// ja assentou: na borda do carregamento a malha certa DEPENDE do que ainda vai
// chegar, e cobrar ali seria cobrar adivinhacao.
function vizinhosAcesos(world, cx, cz) {
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const c = world.chunks.get(chunkKey(cx + dx, cz + dz))
      if (!c || !c.generated || !c.lit) return false
    }
  }
  return true
}

// Uma sessao: liga o pipeline, espelha cliente e renderizador, passeia com o
// jogador e deixa assentar.
function sessao({ seed, raio, orcamento }) {
  const espelho = new Map() // "cx,cz"    -> blocos que a colisao enxerga
  const malhas = new Map() // "cx,sy,cz" -> baldes que o renderizador desenha
  let emitidas = 0

  function emit(msg) {
    if (msg.t === 'chunk') {
      espelho.set(chunkKey(msg.cx, msg.cz), msg.blocks)
      return
    }
    if (msg.t === 'mesh') {
      // espelha `engine.setSection`: balde sem vertice nao vira Mesh
      const entrada = {}
      for (const nome of BALDES) if (msg[nome]?.count) entrada[nome] = msg[nome]
      const k = `${msg.cx},${msg.sy},${msg.cz}`
      if (Object.keys(entrada).length) malhas.set(k, entrada)
      else malhas.delete(k)
      emitidas++
      return
    }
    if (msg.t === 'unload') {
      // espelha `worldClient.handle` + `engine.removeChunk`
      espelho.delete(chunkKey(msg.cx, msg.cz))
      for (const k of [...malhas.keys()]) {
        const p = k.split(',')
        if (Number(p[0]) === msg.cx && Number(p[2]) === msg.cz) malhas.delete(k)
      }
    }
  }

  const pipe = createPipeline({ seed, renderDistance: raio, emit })

  // "Assentar" nao e "tick devolveu false uma vez": a fila de luz pode estar
  // vazia num instante e voltar a encher quando o vizinho termina de gerar.
  // Exige QUIETO ticks seguidos sem trabalho.
  const QUIETO = 8
  const rodar = (n) => {
    let quieto = 0
    for (let i = 0; i < n; i++) {
      quieto = pipe.tick(orcamento) ? 0 : quieto + 1
      if (quieto >= QUIETO) return
    }
  }

  pipe.setCenter(0, 0, 4)
  rodar(20000)
  // O jogador anda enquanto o mundo carrega: e nessa intercalacao que a ordem
  // de geracao/luz/malha muda e o defeito nasce.
  const caminho = [
    [1, 0],
    [2, 0],
    [2, 1],
    [3, 1],
    [3, 2],
    [2, 2],
    [1, 2],
    [0, 2],
    [0, 1],
    [0, 0],
  ]
  for (const [cx, cz] of caminho) {
    pipe.setCenter(cx, cz, 4)
    rodar(90)
  }
  rodar(20000)
  return { pipe, espelho, malhas, emitidas }
}

// Compara o que o renderizador TEM com o que o mesher produziria AGORA.
function conferir({ pipe, espelho, malhas }) {
  const world = pipe.world
  const achados = []
  let secoes = 0
  let chunks = 0

  for (const c of world.chunks.values()) {
    if (!c.generated || !c.lit) continue
    if (!neighborsReady(world, c.cx, c.cz)) continue
    if (!vizinhosAcesos(world, c.cx, c.cz)) continue
    // malha desenhada sem bloco embaixo = atravessa o cenario
    if (!espelho.has(chunkKey(c.cx, c.cz))) {
      achados.push({
        tipo: 'semColisao',
        cx: c.cx,
        cz: c.cz,
        sy: -1,
        nota: 'chunk fora do espelho',
      })
    }
    chunks++
    const acc = neighborhoodAccessor(buildNeighborhood(world, c.cx, c.cz))
    for (let sy = 0; sy < SECTION_COUNT; sy++) {
      const gab = meshSection(acc, c.cx, sy, c.cz)
      const tem = malhas.get(`${c.cx},${sy},${c.cz}`) || {}
      secoes++
      for (const nome of BALDES) {
        const g = gab[nome]?.count ? gab[nome] : null
        const t = tem[nome] || null
        if (!g && !t) continue
        const onde = { cx: c.cx, cz: c.cz, sy, balde: nome }
        if (g && !t) {
          achados.push({ ...onde, tipo: 'faltando', nota: `${g.count} vertices nunca desenhados` })
        } else if (!g && t) {
          achados.push({ ...onde, tipo: 'fantasma', nota: `${t.count} vertices sem bloco` })
        } else if (g.count !== t.count || !iguais(g.position, t.position)) {
          achados.push({
            ...onde,
            tipo: 'geometria',
            nota: `vertices ${t.count} != ${g.count}`,
          })
        } else if (!iguais(g.light, t.light)) {
          const n = diferencas(g.light, t.light)
          achados.push({ ...onde, tipo: 'luz', nota: `${n} bytes de luz errados` })
        }
      }
    }
  }
  return { achados, secoes, chunks }
}

// Prova de vida: estraga `n` secoes de proposito. Se o comparador nao acusar
// exatamente essas, o zero dele nao vale nada.
function mutar(malhas, n) {
  const chaves = [...malhas.keys()].filter((k) => malhas.get(k).opaque).slice(0, n * 7)
  const escolhidas = []
  for (let i = 0; i < n && i * 7 < chaves.length; i++) escolhidas.push(chaves[i * 7])
  escolhidas.forEach((k, i) => {
    const e = malhas.get(k)
    if (i % 3 === 0) {
      malhas.delete(k) // secao inteira some -> 'faltando'
    } else if (i % 3 === 1) {
      const luz = e.opaque.light.slice()
      luz[0] = luz[0] ^ 0xff
      malhas.set(k, { ...e, opaque: { ...e.opaque, light: luz } }) // -> 'luz'
    } else {
      const pos = e.opaque.position.slice()
      pos[0] += 1
      malhas.set(k, { ...e, opaque: { ...e.opaque, position: pos } }) // -> 'geometria'
    }
  })
  return escolhidas
}

const resumo = (achados) => {
  const por = {}
  for (const a of achados) por[a.tipo] = (por[a.tipo] || 0) + 1
  return por
}

const raio = Number(arg('raio', '5'))
const nMutar = Number(arg('mutar', '0'))
const lista = (nome, padrao) =>
  arg(nome, padrao)
    .split(',')
    .map(Number)
    .filter((n) => n > 0)
const seeds = lista('seeds', '1337,7,20260823')
const orcamentos = lista('orcamentos', '4,8,16')

console.log(`raio=${raio} seeds=[${seeds}] orcamentos=[${orcamentos}]`)

let falhou = false
let semVida = false

for (const seed of seeds) {
  for (const orcamento of orcamentos) {
    const t0 = Date.now()
    const s = sessao({ seed, raio, orcamento })
    const { achados, secoes, chunks } = conferir(s)
    const ms = Date.now() - t0
    const rotulo = `seed ${String(seed).padEnd(9)} orc ${String(orcamento).padStart(2)}ms`
    console.log(
      `\n${rotulo}  chunks=${chunks} secoes=${secoes} malhas=${s.malhas.size} ` +
        `emitidas=${s.emitidas} (${ms}ms)`,
    )
    // ⚠️ Sem isto o harness volta a dar o falso zero de sempre: comparador que
    // nao comparou nada tambem devolve "nenhum defeito".
    if (!chunks || !secoes || !s.malhas.size) {
      console.log('  SEM VIDA - a sessao nao carregou mundo; o zero abaixo nao vale')
      semVida = true
      continue
    }
    if (!achados.length) {
      console.log('  OK - toda malha bate com o gabarito')
    } else {
      falhou = true
      console.log(`  DEFEITOS ${achados.length}: ${JSON.stringify(resumo(achados))}`)
      for (const a of achados.slice(0, 10)) {
        console.log(`    ${a.tipo.padEnd(10)} ${a.cx},${a.sy},${a.cz} ${a.balde || ''} - ${a.nota}`)
      }
      if (achados.length > 10) console.log(`    ... e mais ${achados.length - 10}`)
    }

    if (nMutar > 0) {
      const alvos = mutar(s.malhas, nMutar)
      const pego = conferir(s).achados.length - achados.length
      const ok = alvos.length > 0 && pego >= alvos.length
      console.log(
        `  prova de vida: ${alvos.length} mutacoes -> ${pego} acusacoes ${ok ? 'OK' : 'FALHOU'}`,
      )
      if (!ok) semVida = true
    }
  }
}

if (semVida) process.exit(2)
process.exit(falhou && nMutar === 0 ? 1 : 0)
