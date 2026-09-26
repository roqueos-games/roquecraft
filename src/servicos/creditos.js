// CRÉDITOS do RoqueCraft.
//
// O founder pediu "uma menção aos criadores". Ela existe por dois motivos, e o
// segundo é o que faz esta tela ser código e não um parágrafo solto na página
// de marketing:
//
//  1. Dizer de quem é o que se vê. O RoqueCraft é um tributo declarado a um
//     jogo que outras pessoas fizeram, e um tributo que não diz o nome de
//     ninguém é outra coisa.
//  2. Deixar claro o que NÃO é nosso e o que NÃO vai junto. As 81 texturas, os
//     bonecos e todos os sons são gerados por procedimento aqui dentro. Se você
//     instalou um resource pack na SUA máquina, ele aparece aqui - e a linha
//     diz, na cara, que ele fica onde está.
//
// Estrutura de dados, não markup: a tela renderiza, o teste confere que as
// menções obrigatórias estão presentes, e traduzir uma frase não obriga a mexer
// no componente.
//
// Cada linha tem `forte` (nome próprio, nunca traduzido) e/ou `t` (chave i18n
// da prosa). A primeira versão trazia a prosa em português cravada aqui e a
// tela saía com título em inglês e corpo em português - o QA fotografou isso
// em 2026-08-22.

/** Seções fixas. */
export const SECOES = [
  {
    id: 'jogo',
    t: 'roqueCraft.credits.game',
    linhas: [
      { forte: 'RoqueCraft', texto: 'Roque Ribeiro · RoqueOS' },
      { t: 'roqueCraft.credits.engineLine' },
    ],
  },
  {
    id: 'homenagem',
    t: 'roqueCraft.credits.tribute',
    linhas: [
      { forte: 'Minecraft', texto: 'Markus Persson · Mojang Studios' },
      { t: 'roqueCraft.credits.tributeLine' },
    ],
  },
  {
    id: 'tecnologia',
    t: 'roqueCraft.credits.tech',
    linhas: [
      { forte: 'three.js', texto: 'Ricardo Cabello (mrdoob) · MIT' },
      { forte: 'Vue · Quasar', texto: 'Evan You · Razvan Stoenescu · MIT' },
    ],
  },
  {
    id: 'arte',
    t: 'roqueCraft.credits.art',
    linhas: [{ t: 'roqueCraft.credits.artLine' }],
  },
]

/**
 * Seção do resource pack. Só aparece quando um pack local está carregado - caso
 * contrário a tela estaria creditando algo que ninguém está vendo.
 *
 * `pack` é o que `loadBlockTextures` devolve: `{ tile, trocadas, total }`.
 */
export function secaoDoPack(pack) {
  if (!pack || !pack.trocadas) return null
  return {
    id: 'pack',
    t: 'roqueCraft.credits.pack',
    linhas: [
      {
        t: 'roqueCraft.credits.packCount',
        params: { n: pack.trocadas, total: pack.total, px: pack.tile },
      },
      { forte: 'Stratum', texto: 'Continuum Graphics' },
      { t: 'roqueCraft.credits.packLine' },
    ],
  }
}

/** Todas as seções a mostrar agora. */
export function creditos(pack) {
  const extra = secaoDoPack(pack)
  return extra ? [...SECOES, extra] : SECOES
}
