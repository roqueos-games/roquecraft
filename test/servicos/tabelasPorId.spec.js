import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  BLOCKS,
  TABELA_DE_IDS,
  IS_SOLID,
  FACE_LAYERS,
  NIVEL_DE_FLUIDO,
  FLUIDO_DE_ID,
} from '../../src/servicos/blocks.js'
import {
  CAIXAS_DE_BLOCO,
  FACES_DE_BLOCO,
  EH_FORMA_LIVRE,
  PULA_GREEDY,
} from '../../src/servicos/formas.js'
import { CAI } from '../../src/servicos/gravidade.js'

//
// AS TABELAS POR ID CABEM TODOS OS BLOCOS — e cabem com folga.
//
// ⚠️ A PALETA POR CHUNK LEVOU O MUNDO A 65 MIL IDS E DEIXOU AS TABELAS EM 256.
// Em 18/09 havia 226 blocos e catorze tabelas `new Uint8Array(256)`: o 256º
// bloco leria `undefined` em todas — invisível, sem colisão, sem textura, sem
// nenhum erro. A porta acrescentou 16 ids e chegou a 242. Esta é a régua que
// faltava: o maior id tem que caber, com folga para a próxima onda, e nenhum
// arquivo pode voltar ao literal.
//

const FONTES = ['blocks.js', 'formas.js', 'gravidade.js'].map((f) => resolve('src/servicos', f))
const maiorId = Math.max(...Object.values(BLOCKS).map((b) => b.id))

describe('as tabelas por id', () => {
  it('o maior id cabe na tabela, com folga para a próxima onda', () => {
    expect(maiorId, 'id fora da tabela: todo lookup por id devolve undefined').toBeLessThan(
      TABELA_DE_IDS,
    )
    expect(
      TABELA_DE_IDS - maiorId,
      `só ${TABELA_DE_IDS - maiorId} ids de folga — suba TABELA_DE_IDS antes de a próxima onda entrar`,
    ).toBeGreaterThanOrEqual(32)
  })

  it('toda tabela por id tem o tamanho da constante, não 256', () => {
    for (const [nome, t, por] of [
      ['IS_SOLID', IS_SOLID, 1],
      ['FACE_LAYERS', FACE_LAYERS, 6],
      ['NIVEL_DE_FLUIDO', NIVEL_DE_FLUIDO, 1],
      ['FLUIDO_DE_ID', FLUIDO_DE_ID, 1],
      ['CAIXAS_DE_BLOCO', CAIXAS_DE_BLOCO, 1],
      ['FACES_DE_BLOCO', FACES_DE_BLOCO, 1],
      ['EH_FORMA_LIVRE', EH_FORMA_LIVRE, 1],
      ['PULA_GREEDY', PULA_GREEDY, 1],
      ['CAI', CAI, 1],
    ]) {
      expect(t.length, `${nome} tem ${t.length}, esperado ${TABELA_DE_IDS * por}`).toBe(
        TABELA_DE_IDS * por,
      )
    }
  })

  it('⚠️ nenhuma tabela por id volta ao literal 256 — teto ZERO', () => {
    const culpados = []
    for (const f of FONTES) {
      const src = readFileSync(f, 'utf8').replace(/\/\/[^\n]*/g, '')
      for (const m of src.matchAll(
        /new (?:Uint8Array|Uint16Array|Int16Array|Int32Array|Float32Array|Array)\(256\b/g,
      ))
        culpados.push(`${f.split('/').at(-1)}: ${m[0]}`)
    }
    expect(culpados, 'tabela por id com 256 escrito à mão: use TABELA_DE_IDS').toEqual([])
  })
})
