import { afterEach, describe, expect, it } from 'vitest'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { validarArteImportada } from '../qa/gen-roquecraft-art.mjs'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const meta = JSON.parse(readFileSync(resolve(raiz, 'arte/manifesto.json'), 'utf8'))
const temporarios = []
const hash = (arquivo) => createHash('sha256').update(readFileSync(arquivo)).digest('hex')

function copiaParaTeste() {
  const pasta = mkdtempSync(resolve(tmpdir(), 'roquecraft-arte-'))
  temporarios.push(pasta)
  const arquivos = [
    'arte/manifesto.json',
    ...Object.values(meta.fonte).map((fonte) => `arte/${fonte.arquivo}`),
    ...Object.keys(meta.exportacoes),
  ]
  for (const arquivo of arquivos) {
    const destino = resolve(pasta, arquivo)
    mkdirSync(dirname(destino), { recursive: true })
    copyFileSync(resolve(raiz, arquivo), destino)
  }
  return pasta
}

afterEach(() => {
  for (const pasta of temporarios.splice(0)) rmSync(pasta, { recursive: true, force: true })
})

describe('arte importada preservada pelo antigo gerador', () => {
  it('executar o comando confere as fontes e preserva todas as exportações', () => {
    const antes = Object.keys(meta.exportacoes).map((arquivo) => hash(resolve(raiz, arquivo)))
    const resultado = spawnSync(process.execPath, ['qa/gen-roquecraft-art.mjs'], {
      cwd: raiz,
      encoding: 'utf8',
    })
    expect(resultado.status, resultado.stderr).toBe(0)
    expect(resultado.stdout).toContain('arte preservada')
    expect(Object.keys(meta.exportacoes).map((arquivo) => hash(resolve(raiz, arquivo)))).toEqual(
      antes,
    )
  })

  it('reprova uma exportação alterada sem regenerar o desenho procedural', () => {
    const pasta = copiaParaTeste()
    const capa = resolve(pasta, 'public/capa.jpg')
    writeFileSync(capa, 'conteúdo adulterado')
    expect(() => validarArteImportada(pasta)).toThrow('SHA-256 divergente: public/capa.jpg')
    expect(readFileSync(capa, 'utf8')).toBe('conteúdo adulterado')
  })

  it('reprova uma fonte alterada mesmo quando as exportações continuam iguais', () => {
    const pasta = copiaParaTeste()
    writeFileSync(resolve(pasta, `arte/${meta.fonte.capa.arquivo}`), 'fonte adulterada')
    expect(() => validarArteImportada(pasta)).toThrow('SHA-256 divergente: arte/')
  })

  it('não aceita manifesto ausente nem lista vazia de exportações', () => {
    const pasta = copiaParaTeste()
    const manifesto = resolve(pasta, 'arte/manifesto.json')
    writeFileSync(manifesto, JSON.stringify({ ...meta, exportacoes: {} }))
    expect(() => validarArteImportada(pasta)).toThrow('Exportação sem registro: public/capa.jpg')
    rmSync(manifesto)
    expect(() => validarArteImportada(pasta)).toThrow()
  })
})
