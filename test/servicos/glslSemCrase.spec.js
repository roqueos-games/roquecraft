import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// ⚠️ ESTE TESTE EXISTE PORQUE EU ERREI TRÊS VEZES NO MESMO DIA.
//
// O GLSL deste projeto vive em template literal (`/* glsl */` seguido de crase).
// Uma crase dentro do bloco FECHA a string -- inclusive dentro de comentário --
// e o build morre com "Expected a semicolon" apontando para uma linha de
// comentário, que é o erro mais confuso possível de ler.
//
// Em 25/08/2026 isso derrubou o build três vezes: no voxelMaterial (comentário
// citando um uniforme), no engine (comentário citando uma matriz), e de novo no
// voxelMaterial, DUAS LINHAS ABAIXO do aviso que eu mesmo tinha acabado de
// escrever no topo do arquivo pedindo pra não fazer isso.
//
// A lição não é "prestar mais atenção". Aviso em comentário depende de alguém
// ler antes de escrever, e eu não li nem o meu. O que não depende de memória é
// um teste: ele roda no gate, e o erro que ele dá diz exatamente onde e por quê.

const ARQUIVOS = [
  'src/servicos/render/voxelMaterial.js',
  'src/servicos/render/engine.js',
  'src/servicos/render/sky.js',
  'src/servicos/render/entities.js',
  'src/servicos/render/viewmodel.js',
  'src/servicos/render/chuva.js',
]

const ABERTURA = '/* glsl */ `'

/**
 * Acha crase indevida dentro de um bloco GLSL.
 *
 * ⚠️ A PRIMEIRA VERSÃO DESTE DETECTOR ERA CEGA, e o CONTROLE pegou. Ela achava
 * a crase de fechamento com `indexOf` e depois tentava adivinhar, pelo texto
 * seguinte, se o bloco tinha fechado cedo demais. Não funciona: quando a crase
 * está no meio de um comentário, o que vem logo depois dela é o RESTO DA FRASE
 * na mesma linha, não código GLSL numa linha nova. O detector passava batido
 * exatamente no caso que ele existe para pegar.
 *
 * A versão que funciona não adivinha: ela usa a convenção de fechamento deste
 * repo. Todo bloco GLSL termina numa linha cujo primeiro caractere não-branco é
 * a crase (`\``, `\`,` ou `\`)`). Esse é o fim PRETENDIDO. Qualquer crase entre
 * a abertura e esse fim é uma que não devia estar ali.
 */
function craseNoGlsl(rel) {
  const abs = path.resolve(rel)
  if (!fs.existsSync(abs)) return []
  const linhas = fs.readFileSync(abs, 'utf8').split('\n')
  const achados = []
  let dentro = false
  let abriuNa = 0
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i]
    if (!dentro) {
      if (linha.includes(ABERTURA)) {
        dentro = true
        abriuNa = i + 1
        // A crase de abertura é a última da linha por construção; se houver
        // outra depois dela, o bloco já nasceu fechado.
        const depoisDaAbertura = linha.slice(linha.indexOf(ABERTURA) + ABERTURA.length)
        if (depoisDaAbertura.includes('`')) {
          achados.push({ arquivo: rel, linha: i + 1, texto: linha.trim().slice(0, 100) })
        }
      }
      continue
    }
    // Fim pretendido do bloco.
    if (linha.trimStart().startsWith('`')) {
      dentro = false
      continue
    }
    if (linha.includes('`')) {
      achados.push({ arquivo: rel, linha: i + 1, texto: linha.trim().slice(0, 100), abriuNa })
    }
  }
  return achados
}

describe('roquecraft - nenhum bloco GLSL fechado por crase de comentário', () => {
  for (const rel of ARQUIVOS) {
    it(`${rel} tem todos os blocos de shader inteiros`, () => {
      const achados = craseNoGlsl(rel)
      const mensagem = achados
        .map(
          (a) =>
            `${a.arquivo}:${a.linha} tem crase dentro de um bloco GLSL (aberto na linha ${a.abriuNa}). A crase FECHA o template literal e o build morre apontando pra um comentário. Linha: ${a.texto}`,
        )
        .join('\n')
      expect(achados, mensagem).toHaveLength(0)
    })
  }

  it('CONTROLE: o detector acusa um bloco quebrado de mentira', () => {
    // Sem este controle, um detector que nunca acusa nada passaria como "os
    // arquivos estão limpos" — que é o falso verde de sempre. Aqui a fonte é
    // sintética e SABIDAMENTE quebrada.
    const quebrado = [
      'const X = /* glsl */ `',
      '// olha o `uniforme` aqui, essa crase fecha a string',
      'uniform float uAlgo;',
      'void main() {}',
      '`',
    ].join('\n')
    const tmp = path.resolve('node_modules/.cache/glsl-crase-controle.js')
    fs.mkdirSync(path.dirname(tmp), { recursive: true })
    fs.writeFileSync(tmp, quebrado)
    expect(craseNoGlsl(path.relative(process.cwd(), tmp)).length).toBeGreaterThan(0)
    fs.rmSync(tmp, { force: true })
  })
})
