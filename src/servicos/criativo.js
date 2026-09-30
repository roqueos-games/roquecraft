//
// OS CONTROLES DE CRIATIVO — hora, clima, e o cadeado do relógio.
//
// Pedido do founder em 15/09/2026: "ter controle do clima, do horario, chuva e
// etc quando estiver no modo criativo".
//
// ⚠️ NADA DE MOTOR NOVO AQUI, E ISSO FOI MEDIDO ANTES DE ESCREVER. O relógio
// (`advanceTime`, que já aceita uma VELOCIDADE), a sobrescrita de chuva
// (`clima.forcar`, com `forcado = null` para devolver o controle ao mundo), a
// tempestade derivada da chuva (`tempestadeDe`) e a decisão entre chuva e neve
// pelo bioma (`precipitacaoNoBioma`) já existiam e são testados. O que faltava
// era a PORTA. Um painel que reimplementasse qualquer uma dessas contas estaria
// testando a si mesmo.
//
// Puro: sem Vue, sem three, sem DOM.

import { TICKS_PER_DAY, DAWN, NOON, DUSK, MIDNIGHT, normalizeTicks } from './daycycle.js'
import { tempestadeDe } from './clima.js'

/**
 * Acima disto o jogo diz que está caindo alguma coisa.
 *
 * ⚠️ NÃO É O `LIMIAR_CHUVA`, E EU QUASE USEI ELE. Aquele é o limiar de
 * UMIDADE que faz uma frente nascer (0,76 de umidade); este é o limiar da FORÇA
 * de precipitação já resolvida. As duas vivem na escala 0..1 e não são a mesma
 * coisa — trocar uma pela outra faria o painel dizer "céu limpo" com a chuva
 * caindo na tela. O valor sai de `useRoqueCraftClima`, que é quem decide o
 * rótulo que o HUD mostra.
 */
export const CAINDO = 0.05

/** Os quatro instantes que o jogador pede pelo nome. */
export const HORAS = Object.freeze([
  { chave: 'amanhecer', ticks: DAWN },
  { chave: 'meioDia', ticks: NOON },
  { chave: 'porDoSol', ticks: DUSK },
  { chave: 'meiaNoite', ticks: MIDNIGHT },
])

/**
 * A velocidade do relógio para este estado do cadeado.
 *
 * ⚠️ É ISTO QUE TRAVA O CICLO, e não um `if` no laço de quadro. `advanceTime`
 * já recebe uma velocidade — o menu usa a mesma porta para correr o relógio
 * devagar. Um `if (travado) return` no componente seria um segundo mecanismo
 * para a mesma coisa, e os dois divergiriam no primeiro caminho que esquecesse
 * de perguntar (o save, a viagem entre dimensões, o dormir).
 */
export const velocidadeDoRelogio = (travado) => (travado ? 0 : 1)

/** O controle só existe no criativo. Em sobrevivência, escolher o tempo é o jogo. */
export const podeReger = (modo) => modo === 'creative'

/**
 * A fração 0..1 do dia vira ticks, e volta.
 *
 * O controle deslizante fala em fração porque é o que um controle sabe ser; o
 * jogo fala em ticks. A conversão mora aqui para o componente não arredondar de
 * um jeito e o QA de outro.
 */
export const ticksDaFracao = (f) => normalizeTicks(Math.round(clamp01(f) * TICKS_PER_DAY))
export const fracaoDosTicks = (t) => normalizeTicks(t) / TICKS_PER_DAY

const clamp01 = (v) => (Number.isFinite(v) ? (v < 0 ? 0 : v > 1 ? 1 : v) : 0)

/**
 * O que a força de chuva escolhida PRODUZ, para o painel poder dizer em vez de
 * o jogador descobrir arrastando.
 *
 * ⚠️ `precipitacaoNoBioma` NÃO é chamada aqui de propósito: ela precisa do bioma
 * vivo, que é dado do mundo e não deste módulo. O painel pergunta ao jogo qual
 * é o bioma e passa o rótulo pronto. Trazer o mundo para dentro de um serviço
 * puro é como a sonda da aldeia passou a fotografar campo vazio.
 */
export function leituraDoClima(chuva) {
  const c = clamp01(chuva)
  return {
    chuva: c,
    precipita: c > CAINDO,
    tempestade: tempestadeDe(c),
    // Acima disto o clarão é possível; ver `relampagoEm`.
    comRaio: tempestadeDe(c) > 0,
  }
}

/**
 * O estado inicial do painel. `chuva: null` quer dizer "o mundo decide" — é a
 * mesma convenção de `clima.forcado`, e não uma segunda forma de dizer zero.
 * Zero é céu limpo FORÇADO; null é não opinar.
 */
export const estadoInicial = () => ({ travado: false, chuva: null })

/**
 * O que muda ao soltar tudo: o relógio volta a andar e a chuva volta ao mundo.
 * Uma função só porque os dois têm que soltar JUNTOS — soltar o clima e deixar
 * o relógio parado é o estado que faz o jogador achar que o botão não funcionou.
 */
export const soltarTudo = () => ({ travado: false, chuva: null })

// ── AS ABAS DO PAINEL ───────────────────────────────────────────────────────
//
// ⚠️ O PAINEL ERA UMA COLUNA QUE CRESCIA SEM FIM, e ia crescer muito mais: o
// Goal 23 acrescenta teleporte (dimensão, lugares, coordenada) ao mesmo painel.
// Numa coluna só, chegar ao último controle custaria uma rolagem inteira — e
// pelo teclado, uma volta inteira de Tab.
//
// A regra de QUAL aba mora aqui, pura, e não no componente: a fila é a mesma no
// clique, na seta e no leitor de tela, e três noções de "próxima aba" é como as
// quatro listas de tela nasceram (ver `useRoqueCraftTelas`).

/** As abas do painel de criativo, na ordem em que aparecem. */
export const ABAS = [
  { chave: 'hora', i18n: 'roqueCraft.criativo.hora' },
  { chave: 'clima', i18n: 'roqueCraft.criativo.clima' },
  { chave: 'lugares', i18n: 'roqueCraft.criativo.lugares' },
]

/**
 * As dimensões que a aba "Lugares" oferece, com o rótulo de cada uma.
 *
 * ⚠️ A ORDEM É A DO MUNDO, NÃO A DO REGISTRO: supermundo, Nether, Fim é a
 * ordem em que o jogador os conhece, e é a que ele espera na fila de botões.
 */
export const LUGARES = [
  { chave: 'overworld', i18n: 'roqueCraft.criativo.supermundo' },
  { chave: 'nether', i18n: 'roqueCraft.criativo.nether' },
  { chave: 'end', i18n: 'roqueCraft.criativo.fim' },
]

/**
 * Os lugares do mundo que a aba "Lugares" alcança (Goal 23, onda 4), na ordem
 * em que o jogador os ganha: nasce, dorme, procura a vila, cava a fortaleza.
 * Todos ficam no supermundo; quem sabe ONDE é `lugares.js` (semente) e o save
 * (a cama).
 */
export const LUGARES_DO_MUNDO = [
  { chave: 'nascimento', i18n: 'roqueCraft.criativo.nascimento' },
  { chave: 'cama', i18n: 'roqueCraft.criativo.cama' },
  { chave: 'vila', i18n: 'roqueCraft.criativo.vila' },
  { chave: 'fortaleza', i18n: 'roqueCraft.criativo.fortaleza' },
]

/** Até onde uma coordenada digitada vai. O mundo é infinito; o ruído, não. */
export const LIMITE_DA_COORDENADA = 1_000_000

/**
 * A coordenada que o jogador digitou, ou `null` quando não é uma coordenada.
 *
 * X e Z são obrigatórios e inteiros dentro do limite; Y é opcional (vazio =
 * "o chão", que quem sabe é o mundo, não este módulo). Vírgula vale como
 * ponto, porque o teclado brasileiro põe vírgula. `"12abc"` NÃO é 12: um
 * `parseInt` aceitaria e o jogador iria para onde não digitou.
 */
export function coordenadaDigitada({ x, z, y } = {}) {
  const inteiro = (v) => {
    if (v === null || v === undefined) return null
    const s = String(v).trim().replace(',', '.')
    if (s === '' || !/^-?\d+(\.\d+)?$/.test(s)) return null
    const n = Math.trunc(Number(s))
    return Math.abs(n) <= LIMITE_DA_COORDENADA ? n : null
  }
  const cx = inteiro(x)
  const cz = inteiro(z)
  if (cx === null || cz === null) return null
  const semY = y === null || y === undefined || String(y).trim() === ''
  const cy = semY ? null : inteiro(y)
  if (!semY && cy === null) return null
  return { x: cx, z: cz, y: cy }
}

/** Quantas posições "voltar" lembra. Mais que isso é histórico, não volta. */
export const TETO_DO_HISTORICO = 8

/**
 * O histórico com a posição de onde se saiu no fim. Puro: devolve lista nova.
 * `voltar` tira do fim; é o que faz dois teleportes seguidos voltarem na ordem
 * inversa, e não os dois para o mesmo lugar.
 */
export function lembrarDeOndeSaiu(historico, posicao) {
  const p = { dimensao: posicao.dimensao, x: posicao.x, y: posicao.y, z: posicao.z }
  return [...(historico || []), p].slice(-TETO_DO_HISTORICO)
}

export const ABA_PADRAO = ABAS[0].chave

/**
 * A aba seguinte, pela seta. Anel: da última volta para a primeira.
 *
 * ⚠️ É O PADRÃO ARIA DE `tablist`, e por isso a seta é do grupo de abas e não
 * da malha de foco (ver `usaAsSetas` em `focoDeTela.js`). Num `tablist` a seta
 * TROCA de aba — é assim que todo leitor de tela ensina a usar.
 *
 * @param {string} atual  a chave de agora
 * @param {number} passo  +1 para a direita, -1 para a esquerda
 * @returns {string} a chave nova; a atual quando a tecla não é de navegação
 */
export function abaVizinha(atual, passo) {
  const i = ABAS.findIndex((a) => a.chave === atual)
  // Aba desconhecida (save antigo, estado corrompido) cai na primeira em vez de
  // devolver `undefined` — um painel sem aba nenhuma não desenha nada, e o
  // jogador vê um retângulo vazio sem entender o que aconteceu.
  if (i < 0) return ABA_PADRAO
  if (passo !== 1 && passo !== -1) return ABAS[i].chave
  return ABAS[(i + passo + ABAS.length) % ABAS.length].chave
}

/** A aba existe? Serve a quem lê estado de fora (save, gancho de QA). */
export const ehAba = (chave) => ABAS.some((a) => a.chave === chave)
