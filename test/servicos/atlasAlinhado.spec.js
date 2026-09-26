import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { TEXTURE_NAMES, TEXTURE_LAYER } from '../../src/servicos/blocks.js'
import { ITEM_ICON_NAMES } from '../../src/servicos/items.js'

// O ATLAS E O REGISTRO TÊM QUE CONTAR A MESMA HISTÓRIA.
//
// ⚠️ ESTE TESTE NASCEU DE UM ERRO REAL, cometido em 13/09/2026 ao acrescentar a
// textura do solo arado.
//
// `gen-roquecraft-textures.mjs` monta a folha com `Object.keys(T).sort()` e
// `blocks.js` calcula `TEXTURE_LAYER` com o índice em `TEXTURE_NAMES`, que é o
// conjunto das texturas REFERENCIADAS por algum bloco. As duas listas só
// coincidem enquanto todo nome do gerador tem dono no registro.
//
// Acrescentar `farmland` e `farmland_wet` ao gerador ANTES de declarar o bloco
// deixou duas texturas órfãs na folha — e, como `farmland` entra antes de
// `flower_red` na ordem alfabética, TUDO a partir do índice 37 deslizou duas
// casas. Flor virou terra, folha virou flor, e nenhum teste viu: o único que
// olhava textura conferia que todo nome citado existe na lista (continua
// verdade) e nunca que a lista é a MESMA que está gravada no disco.
//
// O sintoma seria o mundo inteiro texturizado errado, sem erro no console e sem
// vermelho em lugar nenhum — o founder descobrindo pelo olho, que é justo o que
// a barra proíbe.
const TEX = resolve(__dirname, '../../public/games/roquecraft/tex')
const blocos = JSON.parse(readFileSync(resolve(TEX, 'manifest.json'), 'utf8'))
const itens = JSON.parse(readFileSync(resolve(TEX, 'items.json'), 'utf8'))

describe('atlas de blocos', () => {
  it('o manifesto no disco é EXATAMENTE TEXTURE_NAMES, na mesma ordem', () => {
    expect(blocos.names).toEqual([...TEXTURE_NAMES])
  })

  it('a camada de cada nome é o índice dele na folha gravada', () => {
    for (const nome of TEXTURE_NAMES) {
      expect(TEXTURE_LAYER[nome], `camada de "${nome}"`).toBe(blocos.names.indexOf(nome))
    }
  })

  it('a grade do manifesto comporta todas as camadas', () => {
    expect(blocos.cols * blocos.rows).toBeGreaterThanOrEqual(blocos.names.length)
    expect(blocos.cols).toBe(Math.ceil(Math.sqrt(blocos.names.length)))
  })
})

describe('atlas de itens', () => {
  // Aqui a relação é de CONTINÊNCIA, não de igualdade: a folha de itens é
  // indexada por nome (`names.indexOf`), não por posição calculada fora dela,
  // então sprite sobrando é desperdício de bytes e não erro de desenho. O que
  // não pode é item pedir sprite que não existe — esse cai no empréstimo e
  // aparece como cubo de pedra no inventário.
  it('todo ícone que um item pede existe na folha', () => {
    const faltando = ITEM_ICON_NAMES.filter((n) => !itens.names.includes(n))
    expect(faltando).toEqual([])
  })
})
