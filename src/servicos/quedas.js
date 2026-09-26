//
// QUEDAS — os blocos que estão no ar agora, e a conta que os leva ao chão.
//
// Pura: sem three.js, sem mundo. Recebe leitura por função e devolve eventos.
// Quem desenha é `render/blocosCaindo.js`; quem escreve no mundo é quem chamou.
//
// Por que uma entidade em vez de teletransporte célula a célula: a areia do
// jogo original CAI — dá pra ver, dá pra correr debaixo, dá pra tapar o buraco
// no meio da queda. Descer uma célula por tique é discreto demais pra parecer
// peso, e o jogador percebe na hora que é outra coisa.
//
import { destinoDaQueda, passoDaQueda } from './gravidade.js'

// O original destrói o bloco caindo depois de 600 tiques (30 s) e deixa cair
// como item.
//
// Aqui é REDE DE SEGURANÇA, não caminho de todo dia: neste mundo o piso é y=0 e
// a reconferência de meio de queda sempre traz a areia pra ele. Isto é o que
// sobra se um dia o fundo sumir — coluna descarregada, destino calculado
// errado, mundo sem piso. Sem a rede, a entidade fica no ar pra sempre
// consumindo uma malha da piscina.
const TIQUES_ATE_DESISTIR = 600
const SEGUNDOS_ATE_DESISTIR = TIQUES_ATE_DESISTIR / 20

export function criarQuedas({ maximo = 192 } = {}) {
  const lista = []
  let recusadas = 0
  let proximo = 1

  /**
   * Começa uma queda. Devolve o registro, ou `null` se a fila está cheia —
   * e nesse caso o chamador deve pousar o bloco na hora, sem animação.
   *
   * Recusar é melhor que crescer sem fim: uma duna de seis mil blocos viraria
   * seis mil malhas e o quadro morreria. Mas recusar CALADO faz a areia sumir,
   * então `recusadas` conta, e quem chama tem que tratar o `null`.
   */
  const comecar = (id, x, y, z, destino) => {
    if (lista.length >= maximo) {
      recusadas++
      return null
    }
    const q = { chave: proximo++, id, x, z, y, destino, vy: 0, idade: 0 }
    lista.push(q)
    return q
  }

  /**
   * Um passo de todas as quedas.
   *
   * `blocoEm(x, y, z)` relê o mundo; `aoPousar(q, motivo)` recebe cada queda
   * que terminou, com motivo `'pousou'` ou `'desistiu'`.
   */
  const passo = (dt, blocoEm, aoPousar, fundo = 0) => {
    for (let i = lista.length - 1; i >= 0; i--) {
      const q = lista[i]
      q.idade += dt
      const anterior = Math.floor(q.y)
      const p = passoDaQueda(q.y, q.vy, dt)
      q.y = p.y
      q.vy = p.vy

      // O destino pode ter MUDADO no meio da queda: alguém construiu embaixo,
      // ou outra areia pousou primeiro. Reconferir só ao trocar de célula é
      // barato e chega a tempo — a areia não anda uma célula por quadro.
      if (Math.floor(q.y) !== anterior) {
        q.destino = destinoDaQueda(blocoEm, q.x, Math.ceil(q.y), q.z, fundo)
      }

      if (q.y <= q.destino) {
        q.y = q.destino
        lista.splice(i, 1)
        aoPousar(q, 'pousou')
      } else if (q.idade >= SEGUNDOS_ATE_DESISTIR) {
        lista.splice(i, 1)
        aoPousar(q, 'desistiu')
      }
    }
  }

  return {
    lista,
    comecar,
    passo,
    get quantas() {
      return lista.length
    },
    get recusadas() {
      return recusadas
    },
    limpar() {
      lista.length = 0
      recusadas = 0
    },
  }
}

export { TIQUES_ATE_DESISTIR, SEGUNDOS_ATE_DESISTIR }
