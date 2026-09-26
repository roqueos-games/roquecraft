import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * TODA TELA DO JOGO NAVEGA PELO TECLADO.
 *
 * ⚠️ ISTO É UMA CATRACA, e ela existe porque o buraco era de OMISSÃO, não de
 * defeito. Medido em 19/09/2026 nos componentes de tela do RoqueCraft: zero
 * `@keydown`, zero `tabindex`, zero seta ou Tab. Nenhum deles estava errado —
 * simplesmente nenhum tinha sido escrito, e cada tela nova nascia igual.
 *
 * Um teste por tela não fecha isso: ele prova as que existem e cala sobre a
 * oitava. O que fecha é cobrar a LISTA — e a lista aqui é o diretório, que é o
 * mesmo lugar onde uma tela nova nasce.
 *
 * ⚠️ O QUE É "TELA" TEM DEFINIÇÃO, e não é "arquivo que parece um menu": é o
 * componente que COBRE o jogo e recebe o foco. `useRoqueCraftTelas` conhece a
 * lista viva (pausa, inventário, lobby, comércio, mobília, criativo); a tela
 * inicial entra porque também cobre tudo. O que não cobre está dispensado
 * abaixo, cada um com o motivo escrito — dispensa sem motivo é a lista
 * envelhecendo em silêncio.
 */
// Veio de `tests/unit/architecture/tela-com-foco.spec.js` do RoqueOS (7ab22a6f), com os mesmos casos e as mesmas
// asserções; o que mudou foi só o caminho do front para o do repo.
// A pasta das telas é `src/componentes/`, e o import da malha é o relativo do repo.
const TELAS_DIR = resolve('src/componentes')

const DISPENSADOS = {
  'RCHud.vue': 'é o HUD: não cobre o jogo e não recebe foco — o jogador está jogando',
  'RCMira.vue': 'são quatro recibos de combate em 18 px, aria-hidden por natureza',
  'RCIcon.vue': 'é um <svg>, não tem controle nenhum',
  'RCMinimapa.vue': 'mora DENTRO do HUD e some com ele',
  'RCMobile.vue': 'são os controles de TOQUE: existem justamente onde não há teclado',
  'RCTelas.vue': 'é a lista que monta as outras; não tem DOM próprio',
}

const arquivos = readdirSync(TELAS_DIR).filter((f) => f.endsWith('.vue'))
const ler = (f) => readFileSync(resolve(TELAS_DIR, f), 'utf8')

describe('toda tela do RoqueCraft navega pelo teclado', () => {
  it('há telas para examinar, e a lista de dispensados não inventou arquivo', () => {
    expect(arquivos.length).toBeGreaterThan(5)
    const fantasmas = Object.keys(DISPENSADOS).filter((f) => !arquivos.includes(f))
    expect(fantasmas, `dispensado que não existe mais: ${fantasmas.join(', ')}`).toEqual([])
  })

  // ⚠️ PROCURA O IMPORT E A CHAMADA, NÃO A PALAVRA. A primeira versão casava
  // `useFocoDeTela` em qualquer lugar do arquivo — e o COMENTÁRIO que aponta
  // para o composable bastava para o guarda ficar verde. Apaguei o import e a
  // chamada de uma tela e o teste passou feliz, com a navegação inteiramente
  // morta. Guarda que mede a menção não mede mecanismo.
  const IMPORTA =
    /import \{[^}]*\buseFocoDeTela\b[^}]*\} from ['"]\.\.\/composables\/useFocoDeTela\.js['"]/
  const CHAMA = /\buseFocoDeTela\s*\(/

  it('cada tela pendura a malha de foco', () => {
    const sem = arquivos
      .filter((f) => !DISPENSADOS[f])
      .filter((f) => {
        const t = ler(f)
        return !(IMPORTA.test(t) && CHAMA.test(t))
      })
    expect(
      sem,
      `tela sem navegação por teclado — pendure \`useFocoDeTela\` ou dispense com o motivo:\n${sem
        .map((f) => `  ${f}`)
        .join('\n')}`,
    ).toEqual([])
  })

  // ⚠️ PENDURAR SEM LIGAR É O MESMO QUE NÃO PENDURAR, e é o erro fácil: o
  // composable devolve `aoTeclar`, e uma tela que o importa sem escutar a tecla
  // passaria no teste acima com a navegação inteiramente morta.
  it('cada tela LIGA a malha: a raiz escuta a tecla', () => {
    const mudos = arquivos
      .filter((f) => !DISPENSADOS[f])
      .filter((f) => {
        const t = ler(f)
        return !(t.includes('@keydown="aoTeclar"') && /ref="raizDaTela"/.test(t))
      })
    expect(
      mudos,
      `tela que importa a malha e não a escuta:\n${mudos.map((f) => `  ${f}`).join('\n')}`,
    ).toEqual([])
  })

  // ⚠️ ACHADO DO REVISOR NA ONDA 1. A tela sempre foi um `<div>` por cima do
  // canvas; enquanto o Tab saía dela, chamá-la de modal seria mentira. Agora
  // que a malha PRENDE o foco de verdade, `role="dialog"` e `aria-modal` são a
  // declaração honesta do que ela faz — e a catraca existe para a oitava tela
  // não nascer sem eles.
  // A tela INICIAL não é modal: ela não cobre nada, ela É a tela. `role="dialog"`
  // ali seria mentira para o leitor de tela — e mentira declarada é pior que
  // omissão, porque some da lista de pendências.
  const NAO_SAO_MODAIS = {
    'RCStart.vue': 'é a tela inicial do jogo, não um painel por cima dele',
  }

  it('cada tela se declara modal, agora que prende o foco de verdade', () => {
    const mudas = arquivos
      .filter((f) => !DISPENSADOS[f] && !NAO_SAO_MODAIS[f])
      .filter((f) => {
        const t = ler(f)
        return !(t.includes('role="dialog"') && t.includes('aria-modal="true"'))
      })
    expect(
      mudas,
      `tela que prende o foco e não se declara modal:\n${mudas.map((f) => `  ${f}`).join('\n')}`,
    ).toEqual([])
  })

  it('todo dispensado tem motivo escrito, e não uma linha vazia', () => {
    for (const [f, motivo] of Object.entries(DISPENSADOS))
      expect(motivo.length, `${f} foi dispensado sem motivo`).toBeGreaterThan(20)
  })
})
