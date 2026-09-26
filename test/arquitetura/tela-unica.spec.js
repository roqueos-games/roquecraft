import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

//
// UMA LISTA SÓ DE TELAS ABERTAS.
//
// ⚠️ ESTE PORTÃO NASCEU DE UM DEFEITO QUE UM COMENTÁRIO JÁ TINHA PREVISTO. Em
// `ROSRoqueCraft.vue` estava escrito, meses antes: "são duas chances de
// divergir — e o dia em que alguém acrescentar uma janela nova a uma só delas, a
// mão fica flutuando atrás do modal ou o mundo continua andando por baixo dele".
//
// Viraram QUATRO enumerações, e três não conheciam o comércio, a mobília nem o
// painel de criativo. O resultado chegou como queixa do founder: o botão
// "clique pra jogar" (tela inteira, 645.120 px² medidos) ficava POR CIMA desses
// painéis, e o clique que ele achava que era no menu re-prendia o ponteiro.
//
// Aviso não é mecanismo. Este teste é.
//
// Veio de `tests/unit/architecture/tela-unica.spec.js` do RoqueOS (7ab22a6f), com os mesmos casos e as mesmas
// asserções; o que mudou foi só o caminho do front para o do repo.
// O `ROSRoqueCraft.vue` de lá é o `src/JogoRoqueCraft.vue` daqui.
//
const FONTE = resolve('src/JogoRoqueCraft.vue')
const src = readFileSync(FONTE, 'utf8')

/** Comentário não é declaração — a lição de `vidro-so-sobre-vidro`. */
const semComentario = (s) =>
  s
    .replace(/<!--[\s\S]*?-->/g, (m) => ' '.repeat(m.length))
    .replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m) => ' '.repeat(m.length))

const limpo = semComentario(src)
const template = limpo.slice(limpo.indexOf('<template>'), limpo.indexOf('</template>'))

/** As telas que, juntas, formam a resposta de `TELA_ABERTA`. */
const TELAS = ['menuOpen', 'paused', 'inventoryOpen', 'lobbyOpen', 'aldeaoAberto', 'aberto']

describe('uma lista só de telas abertas', () => {
  it('⚠️ nenhum v-if do template enumera telas NEGADAS na mão', () => {
    // ⚠️ NEGADAS, e a precisão importa. A primeira versão acusava duas telas
    // quaisquer na mesma condição e pegou `menuOpen && !lobbyOpen` — que não é
    // o defeito: é a tela inicial dizendo que o lobby passa na frente dela.
    //
    // O defeito tem outra forma: `!a && !b && !c`, isto é "só apareça quando
    // não houver tela nenhuma". Essa é a lista que envelhece, porque toda tela
    // nova precisa ser lembrada em cada cópia dela.
    //
    // ⚠️ E UMA NEGADA SOLTA TAMBÉM É LISTA. A segunda versão só reprovava DUAS
    // negadas juntas, e `isMobile && !menuOpen` passou (18/09) — o HUD, os
    // controles de toque e o aviso de carregamento tinham cada um a própria
    // cópia de "o menu saiu da frente". A pergunta tem nome no composable
    // (`naPartida`); o template pergunta, não recalcula.
    //
    // O que continua permitido: negada ao lado de uma POSITIVA na mesma
    // condição (`menuOpen && !lobbyOpen`), que é precedência entre duas telas
    // e não enumeração de "nenhuma aberta".
    const culpados = []
    for (const m of template.matchAll(/v-(?:if|show)="([^"]+)"/g)) {
      const cond = m[1]
      const negadas = TELAS.filter((t) => new RegExp(`![\\s]*${t}\\b`).test(cond))
      const positivas = TELAS.filter((t) => new RegExp(`(^|[^!\\w])${t}\\b`).test(cond))
      if (negadas.length && !positivas.length) culpados.push(cond.slice(0, 90))
    }
    expect(
      culpados,
      'tela negada no template: pergunte ao composable (`telaAberta`, `paramOMundo`, `naPartida`), senão a próxima tela nasce esquecida numa das listas',
    ).toEqual([])
  })

  it('o componente pega a lista do composable, e não monta a própria', () => {
    expect(limpo.includes('useRoqueCraftTelas('), 'o componente parou de usar o composable').toBe(
      true,
    )
  })
})
