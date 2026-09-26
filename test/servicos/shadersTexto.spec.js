import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'acorn'

// A GUARDA DA CRASE, EM ARQUIVO SEM IMPORT NENHUM.
//
// ⚠️ Este arquivo NÃO PODE importar `voxelMaterial.js` — nem ele, nem nada que
// o alcance. Essa é a razão inteira de ele existir.
//
// A armadilha: uma CRASE dentro de um comentário do GLSL fecha o template
// literal. Ela já mordeu QUATRO vezes (19/08 três, 22/08 a quarta, num
// comentário que eu escrevi pra explicar outro conserto). Existe uma guarda
// estática pra isso em `shaders.spec.js` desde a terceira vez.
//
// Na quarta vez a guarda NÃO DISPAROU. O motivo é estrutural e vale mais que o
// bug: `shaders.spec.js` importa `voxelMaterial.js` no topo, pra checar
// uniforms. Quando a crase quebra o parse, o arquivo de teste inteiro morre na
// coleta — "Failed Suites 1", nenhum teste roda — e a guarda que existia
// exatamente pra esse caso é a primeira coisa a cair.
//
// Uma verificação ESTÁTICA de texto não pode morar num arquivo que importa o
// que ela verifica. Aqui só entra `node:fs`.

const RENDER_DIR = resolve(__dirname, '../../src/servicos/render')
const CRASE = String.fromCharCode(96)

/** Blocos GLSL do arquivo e a linha onde cada um fecha. */
function blocosGlsl(src) {
  const linhas = src.split('\n')
  const blocos = []
  for (let i = 0; i < linhas.length; i++) {
    if (!linhas[i].includes('/* glsl */ ')) continue
    if (!linhas[i].trimEnd().endsWith(CRASE)) continue
    let fim = -1
    for (let j = i + 1; j < linhas.length; j++) {
      const t = linhas[j].trim()
      if (t.includes(CRASE) && /^[,;)]*$/.test(t.replace(CRASE, ''))) {
        fim = j
        break
      }
    }
    blocos.push({ linha: i + 1, fim, corpo: fim < 0 ? '' : linhas.slice(i + 1, fim) })
  }
  return blocos
}

describe('shaders - guarda estática, sem importar o módulo', () => {
  const arquivos = readdirSync(RENDER_DIR).filter((f) => f.endsWith('.js'))

  it('acha os módulos de render', () => {
    expect(arquivos.length).toBeGreaterThan(3)
  })

  it('nenhuma CRASE dentro de um bloco GLSL', () => {
    const culpados = []
    let blocos = 0
    for (const f of arquivos) {
      const src = readFileSync(resolve(RENDER_DIR, f), 'utf8')
      for (const b of blocosGlsl(src)) {
        blocos++
        if (b.fim < 0) {
          culpados.push(`${f}:${b.linha} bloco GLSL sem terminador`)
          continue
        }
        b.corpo.forEach((l, k) => {
          if (l.includes(CRASE)) culpados.push(`${f}:${b.linha + 1 + k} crase dentro do GLSL`)
        })
      }
    }
    expect(blocos, 'não encontrou bloco GLSL nenhum — a guarda ficaria vazia').toBeGreaterThan(2)
    expect(culpados).toEqual([])
  })

  it('todo arquivo de render é JavaScript parseável', () => {
    // A rede embaixo da rede: se o parse quebrar por qualquer outro motivo,
    // este teste diz QUAL arquivo e em que linha, em vez de a suíte inteira
    // sumir da coleta com "Failed Suites 1".
    //
    // Tem que ser um parser de VERDADE, e ele tem que rodar NESTE ambiente.
    // Duas tentativas antes desta: `new Function` não entende `import` e
    // reprovou os seis arquivos por um motivo que não era defeito; o esbuild
    // recusa o jsdom ("TextEncoder ... incorrectly false"). O acorn é JS puro,
    // já vem com o rollup, e não liga pro ambiente.
    const quebrados = []
    for (const f of arquivos) {
      const src = readFileSync(resolve(RENDER_DIR, f), 'utf8')
      try {
        parse(src, { ecmaVersion: 'latest', sourceType: 'module' })
      } catch (e) {
        quebrados.push(`${f}: ${(e.message || '').split('\n')[0].slice(0, 140)}`)
      }
    }
    expect(quebrados).toEqual([])
  })
})
