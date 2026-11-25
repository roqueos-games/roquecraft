import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Regra do fundador: nenhum texto que o jogador lê leva travessão nem meia-risca. O RoqueOS
// copia as descrições do manifesto para o i18n dele, então o manifesto vale tanto quanto as
// traduções.
const PROIBIDOS = /[—–]/

const raiz = resolve(__dirname, '..')
const arquivos = [
  'jogo.json',
  ...readdirSync(resolve(raiz, 'i18n'))
    .filter((nome) => nome.endsWith('.json'))
    .sort()
    .map((nome) => `i18n/${nome}`),
]

function comTravessao(valor, caminho, achados) {
  if (typeof valor === 'string') {
    if (PROIBIDOS.test(valor)) achados.push(`${caminho}: ${valor}`)
  } else if (Array.isArray(valor)) {
    valor.forEach((item, i) => comTravessao(item, `${caminho}[${i}]`, achados))
  } else if (valor && typeof valor === 'object') {
    for (const [chave, item] of Object.entries(valor)) {
      comTravessao(item, caminho ? `${caminho}.${chave}` : chave, achados)
    }
  }
  return achados
}

describe('textos sem travessão', () => {
  it('lê o manifesto e os dez idiomas', () => {
    expect(arquivos).toContain('jogo.json')
    expect(arquivos.length).toBeGreaterThanOrEqual(11)
  })

  it.each(arquivos)('%s não tem travessão nem meia-risca', (arquivo) => {
    const dados = JSON.parse(readFileSync(resolve(raiz, arquivo), 'utf8'))
    expect(comTravessao(dados, '', [])).toEqual([])
  })
})
