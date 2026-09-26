// Trava T2 do plano: o teto do mundo era `WORLD_HEIGHT = 128` e o piso era o
// zero implícito de todo `y < 0`. Com isso, uma segunda dimensão (Nether de teto
// baixo, fim flutuante) é impossível — e pior, cada literal solto é um lugar que
// vai continuar procurando no mundo antigo sem nada acusar.
//
// A altura passou a morar em `dimensoes.js`. Esta catraca é o que impede ela de
// voltar a se espalhar: qualquer 126/127/128 em código dentro do RoqueCraft tem
// que estar na lista de exceções, e cada exceção diz por que NÃO é altura.
// Teto que só desce.
//
// Veio de `tests/unit/architecture/altura-cravada.spec.js` do RoqueOS (7ab22a6f), com os mesmos casos e as mesmas
// asserções; o que mudou foi só o caminho do front para o do repo.
// A varredura olha `src/servicos/`, que é o `src/services/roquecraft/` de lá.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import manifesto from './altura-cravada.json'
import {
  problemasDoRegistro,
  limites,
  dentro,
  seccoes,
  tetoDeCorpo,
  idsDeDimensao,
  existeDimensao,
  dimensao,
} from '../../src/servicos/dimensoes.js'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const ALVO = 'src/servicos'

/** Linha de comentário não conta: o que faz mal é o número que EXECUTA. */
export function ehComentario(linha) {
  const t = linha.trim()
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')
}

export const TEM_ALTURA_CRAVADA = /(?<![\w.])12[678](?![\w.])/

export function varrer(dir, base) {
  const achados = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) achados.push(...varrer(p, base))
    else if (p.endsWith('.js')) {
      const rel = path.relative(base, p).split(path.sep).join('/')
      fs.readFileSync(p, 'utf8')
        .split('\n')
        .forEach((linha, i) => {
          if (ehComentario(linha) || !TEM_ALTURA_CRAVADA.test(linha)) return
          achados.push({ arquivo: rel, linha: i + 1, texto: linha.trim() })
        })
    }
  }
  return achados
}

describe('a altura do mundo nao volta a se espalhar', () => {
  const achados = varrer(path.join(raiz, ALVO), raiz)
  const permitidos = new Set(manifesto.excecoes.map((e) => e.arquivo))

  it('nenhum arquivo novo crava 126/127/128', () => {
    const novos = achados.filter((a) => !permitidos.has(a.arquivo))
    expect(
      novos,
      novos.map((n) => `${n.arquivo}:${n.linha} ${n.texto}`).join('\n') +
        '\n→ use limites()/tetoDeCorpo() de dimensoes.js, ou declare a excecao em altura-cravada.json dizendo por que NAO e altura',
    ).toEqual([])
  })

  it('o teto so desce', () => {
    expect(
      achados.length,
      `${achados.length} ocorrencias; teto ${manifesto.teto}`,
    ).toBeLessThanOrEqual(manifesto.teto)
  })

  it('toda excecao declarada ainda existe (lista nao vira museu)', () => {
    const comAchado = new Set(achados.map((a) => a.arquivo))
    const mortas = [...permitidos].filter((p) => !comAchado.has(p))
    expect(mortas, `excecao sem ocorrencia: ${mortas.join(', ')}`).toEqual([])
  })

  it('toda excecao diz por que NAO e altura', () => {
    for (const e of manifesto.excecoes)
      expect(e.motivo?.length, `${e.arquivo} sem motivo`).toBeGreaterThan(20)
  })

  it('a regua sabe achar: um literal novo seria acusado', () => {
    expect(TEM_ALTURA_CRAVADA.test('for (let y = 0; y < 128; y++)')).toBe(true)
    expect(TEM_ALTURA_CRAVADA.test('const topo = Math.min(126, alvo)')).toBe(true)
    expect(TEM_ALTURA_CRAVADA.test('maxY = 127')).toBe(true)
  })

  it('a regua nao confunde 128 dentro de outro numero nem de um nome', () => {
    expect(TEM_ALTURA_CRAVADA.test('const n = 1280')).toBe(false)
    expect(TEM_ALTURA_CRAVADA.test('const n = 4128')).toBe(false)
    expect(TEM_ALTURA_CRAVADA.test('v.x128 = 1')).toBe(false)
    expect(TEM_ALTURA_CRAVADA.test('const n = 1.128')).toBe(false)
  })

  it('comentario nao conta, codigo conta', () => {
    expect(ehComentario('// o teto e 127')).toBe(true)
    expect(ehComentario(' * altura 128')).toBe(true)
    expect(ehComentario('const maxY = 127 // o teto')).toBe(false)
  })
})

describe('o registro de dimensoes', () => {
  it('esta coerente', () => {
    const faltas = problemasDoRegistro()
    expect(faltas, faltas.join('; ')).toEqual([])
  })

  it('o overworld continua com os numeros que o mundo salvo tem', () => {
    const d = dimensao('overworld')
    expect({
      minY: d.minY,
      altura: d.altura,
      mar: d.nivelDoMar,
      bedrock: d.pisoIndestrutivel,
    }).toEqual({
      minY: 0,
      altura: 128,
      mar: 62,
      bedrock: 0,
    })
    expect(limites('overworld')).toEqual({ minY: 0, maxY: 127, altura: 128 })
    expect(seccoes('overworld')).toBe(8)
    expect(tetoDeCorpo('overworld'), 'um corpo de 2 blocos precisa do y de cima livre').toBe(126)
  })

  it('as bordas de dentro() sao inclusivas no piso e no teto', () => {
    expect(dentro(0)).toBe(true)
    expect(dentro(127)).toBe(true)
    expect(dentro(-1)).toBe(false)
    expect(dentro(128)).toBe(false)
  })

  it('dimensao desconhecida ESTOURA em vez de virar overworld em silencio', () => {
    // ⚠️ O EXEMPLO ERA 'nether', E ELE EXISTE DESDE 13/09/2026. Um teste que
    // afirma "o Nether não existe" vira falso no dia em que ele nasce, e o que
    // ele PROTEGE — id desconhecido estourar em vez de virar overworld calado —
    // continua valendo. O exemplo passou a ser um id que ninguém vai registrar.
    expect(() => dimensao('nao-existe')).toThrow(/desconhecida/)
    expect(existeDimensao('nao-existe')).toBe(false)
    expect(idsDeDimensao()).toEqual(['overworld', 'nether', 'end'])
  })

  it('o validador reprova de verdade: altura fora da secao, mar fora do mundo, piso fora do mundo', () => {
    const base = {
      id: 'x',
      minY: 0,
      altura: 128,
      nivelDoMar: 62,
      liquidoDoMar: 'water',
      pisoIndestrutivel: 0,
      tetoIndestrutivel: null,
      temCeu: true,
    }
    expect(problemasDoRegistro({ x: { ...base, altura: 100 } }).join()).toMatch(/nao e multipla/)
    expect(problemasDoRegistro({ x: { ...base, minY: 7 } }).join()).toMatch(/nao e multiplo/)
    expect(problemasDoRegistro({ x: { ...base, nivelDoMar: 900 } }).join()).toMatch(
      /nivelDoMar 900 fora do mundo/,
    )
    expect(problemasDoRegistro({ x: { ...base, pisoIndestrutivel: -5 } }).join()).toMatch(
      /pisoIndestrutivel -5 fora do mundo/,
    )
    expect(problemasDoRegistro({ x: { ...base, temCeu: 'sim' } }).join()).toMatch(/booleano/)
    // Os dois campos que o Nether trouxe. Teto ABAIXO do piso nao e mundo
    // apertado: e mundo sem volume, e o gerador encheria tudo de rocha.
    expect(problemasDoRegistro({ x: { ...base, liquidoDoMar: 'suco' } }).join()).toMatch(
      /liquidoDoMar/,
    )
    expect(problemasDoRegistro({ x: { ...base, tetoIndestrutivel: -3 } }).join()).toMatch(
      /nao deixa mundo entre piso e teto/,
    )
    expect(problemasDoRegistro({ x: { ...base, id: 'y' } }).join()).toMatch(/campo id/)
    expect(
      problemasDoRegistro({ x: base }).join(),
      'sem a dimensao padrao o registro nao serve',
    ).toMatch(/padrao/)
  })

  it('uma dimensao com piso NEGATIVO e valida: e o ponto de tudo isto existir', () => {
    const nether = {
      id: 'n',
      minY: -64,
      altura: 256,
      nivelDoMar: -64,
      liquidoDoMar: 'lava',
      pisoIndestrutivel: -64,
      tetoIndestrutivel: null,
      temCeu: false,
    }
    expect(problemasDoRegistro({ overworld: dimensao('overworld'), n: nether })).toEqual([])
  })
})
