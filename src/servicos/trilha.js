// A TRILHA: quando tocar, e principalmente QUANDO CALAR.
//
// O founder pediu (2026-08-23): "quero uma trilha sonora de pianos bem lenta e
// calma igual ao jogo original, procure algo similar para a trilha sonora do
// jogo em todos os eventos, como dia, noite, batalha, morte e etc".
//
// ⚠️ "IGUAL AO JOGO ORIGINAL" É SOBRE O SILÊNCIO, não sobre a faixa.
//
// A tentação é pôr um leito em loop e pronto. O original não faz isso, e é por
// isso que a música dele emociona em vez de cansar: uma faixa toca, termina, e
// vêm minutos de silêncio com só o vento e os bichos. A música vira
// acontecimento. Leito contínuo de piano em cima de um jogo que a pessoa deixa
// aberto três horas vira ruído — e ainda por cima esconde o passo e o mob
// chegando por trás, que é informação de jogo.
//
// Então este módulo é um DIRETOR: escolhe faixa, e escolhe o tamanho do
// silêncio depois dela.
//
// Puro de propósito: sem áudio, sem DOM, sem relógio de parede. Recebe `dt` e o
// acervo, devolve ordens. Quem tem `<audio>` é o `audio.js`.

/**
 * Momentos, do mais urgente pro mais ambiente.
 *
 * A prioridade decide quem INTERROMPE quem. Morrer corta o que estiver tocando
 * na hora — é o único momento em que a música é resposta a um evento, e chegar
 * dez segundos depois seria pior que não tocar. Já amanhecer não corta nada:
 * a faixa da noite termina em paz e a próxima já é de dia.
 */
export const PRIORIDADE = { morte: 3, tensao: 2, menu: 1, dia: 1, noite: 1 }

export const MOMENTOS = Object.keys(PRIORIDADE)

/**
 * Silêncio entre faixas, por momento — em segundos, sorteado no intervalo.
 *
 * Dia e noite têm o intervalo longo do original. Tensão é curta porque o perigo
 * também é. Menu é o mais curto: ali a pessoa está parada olhando a tela, e
 * silêncio comprido lê como "travou".
 */
export const ESPERA = {
  dia: [75, 210],
  noite: [75, 210],
  tensao: [15, 35],
  menu: [8, 20],
  // morte toca UMA vez e cala: repetir na tela de morte é castigo em cima de
  // castigo.
  morte: null,
}

export const criarTrilha = (rnd = Math.random) => ({
  momento: null,
  // faixa no ar: { momento, indice, restante }
  tocando: null,
  // segundos de silêncio que faltam antes da próxima faixa
  espera: 0,
  // último índice tocado por momento, pra não repetir de cara
  ultima: new Map(),
  rnd,
})

const sortear = (t, [min, max]) => min + t.rnd() * (max - min)

function escolherFaixa(t, momento, acervo) {
  const lista = acervo?.[momento]
  if (!lista || !lista.length) return -1
  if (lista.length === 1) return 0
  const antes = t.ultima.get(momento)
  let i = Math.floor(t.rnd() * lista.length) % lista.length
  if (i === antes) i = (i + 1) % lista.length
  return i
}

/**
 * Troca de momento. Devolve true quando a faixa no ar deve ser CORTADA.
 *
 * Só corta pra cima: qualquer coisa mais urgente que o que está tocando entra
 * na hora. Igual ou menos urgente espera a faixa acabar — e o silêncio depois
 * dela já é o do momento novo.
 */
export function definirMomento(t, momento) {
  if (momento === t.momento) return false
  const antes = t.momento
  t.momento = momento
  if (!t.tocando) {
    // No silêncio, subir de urgência encurta a espera pra agora; descer só
    // reprograma o intervalo do novo momento.
    // `||` e nao `??` pelo mesmo motivo de `construcao.js`: as prioridades sao
    // numeros positivos, entao os dois dao a mesma resposta e so' o `||` pode
    // ser afirmado (com `&&`, descer de urgencia passaria a encurtar a espera).
    if (PRIORIDADE[momento] > (PRIORIDADE[antes] || 0)) t.espera = 0
    else if (ESPERA[momento]) t.espera = Math.min(t.espera, sortear(t, ESPERA[momento]))
    return false
  }
  if (PRIORIDADE[momento] > PRIORIDADE[t.tocando.momento]) {
    t.tocando = null
    t.espera = 0
    return true
  }
  return false
}

/**
 * Avança o relógio da trilha.
 *
 * @param {object} t
 * @param {number} dt segundos
 * @param {object} acervo  momento → [{ arq, dur }]
 * @returns {{tipo:'tocar',arq:string,momento:string}|null} ordem pro tocador
 */
export function avancarTrilha(t, dt, acervo) {
  if (!(dt > 0) || !t.momento) return null

  if (t.tocando) {
    t.tocando.restante -= dt
    if (t.tocando.restante > 0) return null
    t.tocando = null
    const faixa = ESPERA[t.momento]
    // Momento sem intervalo (morte) toca UMA vez e cala: fica em silêncio até a
    // pessoa renascer e o momento mudar.
    t.espera = faixa ? sortear(t, faixa) : Infinity
    return null
  }

  t.espera -= dt
  if (t.espera > 0) return null

  const lista = acervo?.[t.momento]
  const i = escolherFaixa(t, t.momento, acervo)
  if (i < 0) {
    // acervo vazio pra este momento: não fica tentando a cada quadro
    t.espera = 5
    return null
  }
  t.ultima.set(t.momento, i)
  t.tocando = { momento: t.momento, indice: i, restante: lista[i].dur }
  return { tipo: 'tocar', arq: lista[i].arq, momento: t.momento }
}

/** Está tocando alguma coisa agora? (para o HUD e para o teste) */
export const noAr = (t) => !!t.tocando

// ── QUAL MOMENTO É AGORA ─────────────────────────────────────────────────────
//
// Esta era a última regra da trilha que morava dentro do componente: ele lia o
// estado do jogo e devolvia a string. Regra pura sem Vue e sem timer é serviço
// (rule 44), e o serviço que já conhece os momentos é este.

/**
 * Raio, em blocos, dentro do qual um perseguidor liga a tensão.
 *
 * A faixa de tensão não pode tocar "quando tem monstro no mundo": à noite ela
 * tocaria a noite toda e deixaria de significar qualquer coisa. O gatilho é o
 * mesmo que a IA usa pra perseguir (`state === 'chase'`), dentro de 24 blocos -
 * ou seja: alguma coisa está vindo atrás de você AGORA.
 */
export const PERTO_TENSAO = 24

/**
 * O momento da trilha, do mais urgente pro mais ambiente.
 *
 * Puro: recebe o estado, devolve a string. Sem Vue, sem relógio de parede.
 *
 * @param {object} e
 * @param {boolean} e.morto
 * @param {boolean} e.noMenu
 * @param {Array} e.mobs  as criaturas vivas
 * @param {{x:number,z:number}} e.jogador
 * @param {boolean} e.noite  `isNight(ticks)`, resolvido por quem chama
 */
export function momentoAgora({ morto, noMenu, mobs, jogador, noite }) {
  if (morto) return 'morte'
  if (noMenu) return 'menu'
  for (const m of mobs) {
    if (m.state !== 'chase' || m.dead) continue
    const dx = m.x - jogador.x
    const dz = m.z - jogador.z
    if (dx * dx + dz * dz < PERTO_TENSAO * PERTO_TENSAO) return 'tensao'
  }
  return noite ? 'noite' : 'dia'
}
