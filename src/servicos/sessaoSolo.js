// RoqueCraft - VOLTAR PARA O MUNDO SOLO DEPOIS DA SALA.
//
// ⚠️ ESTE ARQUIVO EXISTE PORQUE SAIR DE UMA SALA PODIA APAGAR O MUNDO (RC-03).
//
// O multijogador guardava isto antes de entrar:
//
//     voltaParaSolo = { semente, instante }
//
// Duas coisas. E ao sair só restaurava se a SEMENTE tivesse mudado:
//
//     if (voltaParaSolo.semente !== sessao.semente()) sessao.recomecarEm(...)
//
// O anfitrião joga a sala na própria semente. O convidado que aceita a semente
// do anfitrião também. Nos dois casos a semente é igual ao sair, a condição é
// falsa, e NADA volta: o jogador continua com o inventário, a vida, a posição,
// as edições e as criaturas da SALA — achando que está no mundo dele. E como
// `mp.active` volta a ser falso, o autosave destrava e grava esse estado por
// cima do save solo. O mundo de meses vira o mundo de dez minutos de visita.
//
// A causa não é a condição: é que a sessão foi reduzida a dois números. Aqui
// ela volta a ser o que é — o mesmo payload que o save grava, inteiro.
//
// ⚠️ E A ORDEM IMPORTA. O mundo só reinicia DEPOIS que as edições voltaram ao
// mapa, senão ele regenera o terreno limpo e as construções somem; e o jogador
// só é reposicionado depois do estado, porque a posição salva pertence ao mundo
// salvo. Esta ordem é o que o teste desta função guarda — não o conteúdo de
// cada passo, que tem dono próprio e teste próprio.

import { estadoInicial } from './estadoInicial.js'

/**
 * Devolve a sessão solo inteira a partir de um payload de save.
 *
 * `alvo` é o mundo vivo, entregue por quem o possui (o componente). Cada método
 * é um passo, e o serviço não sabe fazer nenhum deles — ele sabe QUAIS são e em
 * que ordem, que é justamente o que se esqueceu.
 *
 * @param {object|null} salvo  payload no formato do save (já parseado)
 * @param {object} alvo
 * @param {(inicio: object, salvo: object) => void} alvo.definirEstado
 * @param {(edits: Iterable) => void} alvo.definirEdicoes
 * @param {(salvo: object) => void} alvo.definirEntidades
 * @param {(player: object|null) => void} alvo.definirJogador
 * @param {(seed: number) => void} alvo.reiniciarMundo
 * @returns {boolean} restaurou?
 */
export function restaurarSessaoSolo(salvo, alvo) {
  if (!salvo || typeof salvo !== 'object') return false
  // `nova: salvo.seed` e não um sorteio: aqui não existe "mundo novo". Se o
  // payload não trouxer semente, o certo é falhar visivelmente no teste, não
  // abrir um mundo aleatório em cima do mundo de alguém.
  const inicio = estadoInicial({ salvo, doHarness: null, nova: salvo.seed })
  alvo.definirEstado(inicio, salvo)
  alvo.definirEdicoes(salvo.edits || [])
  alvo.definirEntidades(salvo)
  alvo.definirJogador(salvo.player || null)
  alvo.reiniciarMundo(inicio.seed)
  return true
}
