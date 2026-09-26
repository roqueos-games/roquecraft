import { describe, it, expect } from 'vitest'
import { ITEMS } from '../../src/servicos/items.js'
import ptBR from '../../i18n/pt-BR.json'

//
// TODO ITEM TEM NOME — em pt-BR, que é o canônico; os outros nove idiomas o
// gate de sincronia carrega.
//
// ⚠️ TREZE ITENS MOSTRAVAM A CHAVE CRUA NO INVENTÁRIO (`roqueCraft.blocks.
// oakGate`) e nenhum portão via: a chave é montada em tempo de execução
// (`roqueCraft.blocks.${key}`), então "chave usada mas não definida" não a
// enxerga, e "string sem t()" também não — ela passa por `t()`. Cerca, portão,
// alga, bambu, netherrack, areia das almas, magma, tocha e lâmpada de redstone,
// alavanca, quartzo: tudo com nome de variável na tela desde que entrou.
// Achado ao pôr a porta no catálogo (Goal 21, 18/09). Teto ZERO.
//

const lerChave = (obj, chave) =>
  chave
    .split('.')
    .slice(1) // tira o `roqueCraft.` — o arquivo do idioma já é esse namespace
    .reduce((o, p) => (o && typeof o === 'object' ? o[p] : undefined), obj)

describe('todo item do RoqueCraft tem nome em pt-BR', () => {
  it('⚠️ nenhum item cai na chave crua — teto ZERO', () => {
    const semNome = Object.values(ITEMS)
      .filter((i) => typeof lerChave(ptBR, i.i18n) !== 'string')
      .map((i) => `${i.key} → ${i.i18n}`)
    expect(
      semNome,
      'item sem nome mostra a chave crua no inventário; defina em i18n/pt-BR.json (e nos outros nove)',
    ).toEqual([])
  })

  it('a chave de todo item aponta para dentro do namespace do jogo', () => {
    for (const i of Object.values(ITEMS)) expect(i.i18n).toMatch(/^roqueCraft\.(blocks|items)\./)
  })
})
