// O `t` DO ROQUECRAFT, para o componente do jogo e para as telas `RC*`.
//
// No RoqueOS as treze telas pediam `useI18n()` e liam `roqueCraft.<chave>` do
// vue-i18n do sistema. O jogo agora roda num app Vue próprio, sem vue-i18n: o
// texto chega pelo `estado.textos` que o `index.js` carrega, e o componente do
// jogo PROVÊ um `t` que as telas pedem com `useTextos()`. Uma função só, lida a
// cada chamada, então trocar o idioma com o jogo aberto troca todas as telas
// na mesma renderização.
//
// ⚠️ O PREFIXO `roqueCraft.` CONTINUA VALENDO, e é de propósito. Os serviços
// guardam a chave inteira nas tabelas (`items.js`, `blocks.js`, `creditos.js`,
// `cargaDoSave.js`: `'roqueCraft.blocks.stone'`), e mudar as tabelas para tirar
// o prefixo seria mexer no motor para acomodar a tela. O `t` tira o prefixo, e
// a chave de fora do jogo que ele conhece (`common.close`, `common.back`) mora
// no JSON do jogo, com o texto que o RoqueOS tinha.
import { inject } from 'vue'
import { traduzir } from './textos.js'

export const CHAVE_DOS_TEXTOS = Symbol('textos do RoqueCraft')
export const PREFIXO = 'roqueCraft.'

/** A chave como o JSON do jogo a guarda: sem o `roqueCraft.` do RoqueOS. */
export const chaveDoJogo = (chave) =>
  typeof chave === 'string' && chave.startsWith(PREFIXO) ? chave.slice(PREFIXO.length) : chave

/**
 * O `t` de um conjunto de textos. `textos` é função porque os textos trocam
 * quando o idioma troca, e quem guardou o `t` não pode ficar com os velhos.
 * @param {() => Record<string, unknown> | null} textos
 */
export function criarT(textos) {
  return (chave, valores) => traduzir(textos(), chaveDoJogo(chave), valores)
}

/**
 * O `t` que o componente do jogo provê. Fora dele (o teste que monta uma tela
 * solta) devolve a chave como veio, que é o que o dublê do vue-i18n fazia.
 */
export function useTextos() {
  return inject(CHAVE_DOS_TEXTOS, (chave) => chave)
}
