// RoqueCraft - O ESTADO EM QUE O JOGO COMECA, dado (ou nao) um save.
//
// Isto morava dentro de `boot`, entre carregar textura e criar o motor. Nunca
// teve teste e nao tinha como ter: para chegar a uma unica linha era preciso
// abrir o Firestore, montar o WebGL e gerar um mundo. E no entanto e AQUI que
// mora a pergunta mais delicada do jogo: "o que acontece com o mundo de quem ja
// jogou quando a versao muda?".
//
// Puro de proposito. Entra o objeto salvo (ou `null`), sai o estado. Sem rede,
// sem Vue, sem `Math.random` - a semente nova entra pronta, por parametro, para
// que a MESMA entrada de sempre a mesma saida e o teste possa afirmar algo.

import { creativeStarter, survivalStarter } from './inventory.js'
import { TICKS_PER_DAY } from './daycycle.js'

/** Manha do primeiro dia: onde um mundo novo comeca. */
export const TICKS_INICIAIS = 1000

/**
 * A semente, em ordem de precedencia.
 *
 * ⚠️ O SAVE VENCE SEMPRE, e o harness vence o acaso.
 *
 * Se a semente do save nao ganhasse, "Continuar" devolveria ao jogador um mundo
 * DIFERENTE com as construcoes dele em cima: casa flutuando sobre um oceano que
 * antes era planicie. E se o acaso vencesse o harness, cada rodada do QA geraria
 * outro mundo e duas fotos da mesma cena nunca seriam comparaveis.
 */
export function escolherSemente({ salvo, doHarness, nova }) {
  if (Number.isFinite(salvo?.seed)) return salvo.seed
  if (Number.isFinite(doHarness)) return doHarness
  return nova
}

/**
 * O inventario com que se comeca.
 *
 * ⚠️ UM INVENTARIO SALVO VAZIO NAO E UM INVENTARIO SALVO.
 *
 * `some(Boolean)` e a diferenca entre devolver o kit inicial e devolver nada: um
 * save de versao antiga (ou truncado) traz a lista de slots toda nula, e sem
 * esta pergunta o jogador voltaria ao mundo dele de maos vazias, sem picareta,
 * sem nada - e no modo sobrevivencia isso e um mundo intocavel.
 */
export function inventarioInicial(salvo, mode) {
  if (salvo?.inventory?.some(Boolean)) return salvo.inventory
  return mode === 'creative' ? creativeStarter() : survivalStarter()
}

/** Que dia o save mostra na porta ("Continuar - dia 7"). */
export function diaDoSave(ticks) {
  return 1 + Math.floor(ticks / TICKS_PER_DAY)
}

/**
 * Tudo junto: o estado inicial completo.
 *
 * @param {object} e
 * @param {object|null} e.salvo      o save carregado, ou null
 * @param {number|null} e.doHarness  semente fixada pelo E2E, se houver
 * @param {number} e.nova            semente sorteada pelo chamador
 */
export function estadoInicial({ salvo, doHarness = null, nova }) {
  // `|| 'survival'` e nao `?? 'survival'`: um save com `mode: ''` esta corrompido
  // e criativo por engano seria pior que sobrevivencia por padrao.
  const mode = salvo?.mode || 'survival'
  const ticks = Number.isFinite(salvo?.ticks) ? salvo.ticks : TICKS_INICIAIS
  return {
    seed: escolherSemente({ salvo, doHarness, nova }),
    mode,
    ticks,
    inventory: inventarioInicial(salvo, mode),
    hotbar: Number.isFinite(salvo?.hotbar) ? salvo.hotbar : 0,
    renascimento: salvo?.renascimento || null,
    dragaoMorto: salvo?.dragaoMorto === true,
    // O que o save nao tem NAO vira objeto vazio: `null` diz "nao mexa no que ja
    // esta la", e e assim que um save antigo mantem vida e fome padrao em vez de
    // receber zeros e morrer ao nascer.
    survival: salvo?.survival || null,
    temSave: !!salvo,
    dia: diaDoSave(ticks),
  }
}
