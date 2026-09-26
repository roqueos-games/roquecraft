// RoqueCraft — O CLIMA, e por que ele é uma função pura.
//
// "Chuva ainda não existe como estado do mundo. O leito está carregado e ligado
// a zero: quando o clima entrar, é uma linha aqui, não um pacote novo." — a nota
// que o `atualizarAmbiente` guardava desde a rodada de áudio. Esta é a linha.
//
// ⚠️ NADA DE SORTEIO NO LAÇO DE DESENHO. Clima por `Math.random()` tem três
// defeitos que só aparecem depois: não sobrevive ao save (o jogador sai na
// chuva e volta no sol), não sobrevive ao multiplayer (cada cliente com um
// tempo), e não sobrevive ao QA (a foto de hoje não se compara com a de ontem).
// Aqui o tempo é FUNÇÃO de (semente, tick): o mesmo mundo no mesmo instante tem
// sempre o mesmo céu, em qualquer máquina, sem guardar um byte no save.

import { TICKS_PER_DAY } from './daycycle.js'

// Quantos "dias de clima" cabem num dia de jogo. Acima de 1 o tempo muda mais
// de uma vez por dia — 1,7 dá duas frentes por dia sem virar pisca-pisca.
const FRENTES_POR_DIA = 1.7

// Acima deste ponto de umidade, chove. NÃO é gosto: está calibrado por
// CONTAGEM, e o teste em `clima.spec.js` varre 200 dias em várias sementes e
// exige a fração de tempo chovendo dentro de uma faixa. Baixar isto aqui e não
// olhar o teste é como o jogo vira "sempre nublado".
//
// Medido em 400 dias × 4 sementes com o valor atual: 15% chovendo, 41%
// nublado, 44% limpo, ~120 chuvas por 400 dias — uma a cada três dias, durando
// algumas horas. Com 0,68 dava 23,5% de chuva, que é mundo encharcado; a
// referência de fora é que chuva real ocupa algo entre 5% e 10% das horas, e
// 15% num jogo é o meio termo entre realismo e o jogador CHEGAR a ver.
const LIMIAR_CHUVA = 0.76
// Onde a chuva satura. A distância pro limiar é a RAMPA: quanto menor, mais
// abrupta a virada de garoa pra temporal.
const CHUVA_CHEIA = 0.95

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const suave = (t) => t * t * (3 - 2 * t)

/**
 * Hash determinístico de (semente, índice) → 0..1.
 *
 * Aritmética inteira de 32 bits de propósito: `Math.sin(x) * 43758.5453` é o
 * hash folclórico do shader e ele é DIFERENTE entre CPUs e entre navegadores,
 * porque a precisão do seno não é garantida. Um clima que depende disso deixa
 * de ser o mesmo entre o cliente e o servidor.
 */
function hash(semente, i) {
  let h = (Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(semente | 0, 0x165667b1)) >>> 0
  h ^= h >>> 15
  h = Math.imul(h, 0x2545f491) >>> 0
  h ^= h >>> 13
  return (h >>> 0) / 4294967296
}

/** Ruído de valor 1D, contínuo: é o que faz a frente CHEGAR em vez de aparecer. */
function ruido(semente, t) {
  const i = Math.floor(t)
  const f = suave(t - i)
  return hash(semente, i) * (1 - f) + hash(semente, i + 1) * f
}

/**
 * O tempo agora.
 *
 * @param {number} semente semente do mundo
 * @param {number} ticks   relógio do jogo
 * @returns {{umidade:number, chuva:number, cobertura:number, estado:string}}
 *   `chuva` 0..1 é a INTENSIDADE (garoa a temporal), `cobertura` 0..1 alimenta
 *   o céu, e `estado` é o rótulo pro HUD e pro save log.
 */
export function climaEm(semente, ticks) {
  const dias = (Number(ticks) || 0) / TICKS_PER_DAY
  const umidade = ruido(semente, dias * FRENTES_POR_DIA)
  // ⚠️ SUAVIZA UMA VEZ SÓ, E O RÓTULO LÊ O MESMO NÚMERO QUE SAI DAQUI.
  //
  // A primeira versão calculava o estado sobre a rampa CRUA e devolvia a
  // suavizada: dava `estado: 'chuva'` com `chuva: 0,035`, ou seja, o HUD
  // dizendo que chove e a intensidade dizendo que não. O teste do rótulo pegou.
  // Rótulo e número que se contradizem é o defeito que faz o jogador achar que
  // o jogo está quebrado quando ele só está mal escrito.
  const chuva = suave(clamp01((umidade - LIMIAR_CHUVA) / (CHUVA_CHEIA - LIMIAR_CHUVA)))
  // A nuvem chega ANTES da chuva e vai embora DEPOIS: céu limpo que abre em
  // temporal no mesmo minuto é o que denuncia clima de brinquedo. Por isso a
  // cobertura sobe desde bem antes do limiar.
  const cobertura = clamp01(0.16 + suave(clamp01(umidade / LIMIAR_CHUVA)) * 0.62 + chuva * 0.22)
  const estado = chuva > 0.05 ? 'chuva' : cobertura > 0.55 ? 'nublado' : 'limpo'
  return { umidade, chuva, cobertura, estado }
}

// ── O bioma tem voto ─────────────────────────────────────────────────────────
//
// Chuva no deserto é o tipo de detalhe que quebra a ilusão de mundo: ninguém
// repara na chuva certa e todo mundo repara na errada. E o bioma gelado não
// chove, NEVA — o floco não existe ainda, então aqui ele é sinalizado e a
// precipitação é devolvida como zero, para o dia em que existir não precisar
// mexer nesta regra de novo.
const SECOS = /desert|badlands|mesa/i
const GELADOS = /snow|ice|frozen|glacial/i

/**
 * Quanto da chuva global cai NESTE bioma.
 * @returns {{chuva:number, neve:number}}
 */
export function precipitacaoNoBioma(chuva, nomeDoBioma = '') {
  const c = clamp01(chuva)
  if (SECOS.test(nomeDoBioma)) return { chuva: 0, neve: 0 }
  if (GELADOS.test(nomeDoBioma)) return { chuva: 0, neve: c }
  return { chuva: c, neve: 0 }
}

/**
 * O quanto a chuva ESCURECE a luz do dia.
 *
 * Multiplicador do sol, não subtração: sob temporal o mundo perde contraste e
 * a sombra some junto. Sem isto a chuva vira só um som com o sol brilhando.
 */
// 0,30 e não 0,55, e o número é medido: com 0,55 o descampado sob temporal
// perdia 60% do brilho — não lia como chuva, lia como noite chegando às onze
// da manhã. Escurecer é obrigatório (sem isso a chuva vira som com sol), mas o
// jogador precisa continuar ENXERGANDO o mundo que ficou molhado.
export const luzSobChuva = (chuva) => 1 - clamp01(chuva) * 0.3

export { LIMIAR_CHUVA, FRENTES_POR_DIA }

// ── TEMPESTADE: O RELÂMPAGO ─────────────────────────────────────────────────
//
// ⚠️ E ELE TAMBÉM É FUNÇÃO PURA DO TEMPO, pelo mesmo motivo do resto do clima e
// por um a mais: relâmpago é um evento CURTO e VIOLENTO. Sorteado por quadro,
// dois jogadores na mesma sala veriam raios diferentes, e o QA não conseguiria
// fotografar um clarão duas vezes para comparar.
//
// A construção é de FATIA: o tempo é cortado em janelas de alguns segundos, e
// para cada janela um hash decide se cai raio, onde no meio dela ele cai, e a
// que distância. Sem lista, sem estado, sem acumulador — dá para perguntar "o
// que estava acontecendo no segundo 91.238?" e receber a resposta certa.

const FATIA = 5 // segundos por janela de sorteio
// Raios por janela na tempestade cheia. 0,55 dá um a cada ~9 s no auge, que é
// denso o bastante para impressionar e raro o bastante para não virar estroboscópio.
const TAXA = 0.55
export const SOM_NO_AR = 340 // m/s — o que faz o trovão chegar depois do clarão

/**
 * Este sorteio virou raio?
 *
 * `h` é o hash da janela (0..1) e `forca` é a tempestade agora (0..1). A
 * probabilidade de raio numa janela é `forca * TAXA`, e o limiar é EXCLUSIVO:
 * um hash exatamente no limiar NÃO vira raio — é a convenção que faz
 * `P(virou) = forca * TAXA` valer de verdade.
 *
 * ⚠️ Exportada, e é por isso que ela existe separada. Dentro do laço o `>=`
 * era um comparador sem dono possível: o hash é opaco e nenhum teste conseguia
 * fazê-lo pousar exatamente no limiar. Recebendo `h` como parâmetro, o limiar
 * vira um valor que o teste escolhe.
 */
export const semRaioNaJanela = (h, forca) => h >= forca * TAXA

/** Perfil do clarão: dois estouros e uma cauda, ~0,42 s no total. */
export function envelope(t) {
  if (t < 0 || t > 0.42) return 0
  // Dois picos, como o raio de verdade: o retorno principal e o secundário.
  const a = Math.exp(-t * 34) * 1.0
  const b = Math.exp(-Math.abs(t - 0.11) * 26) * 0.55
  const cauda = Math.exp(-t * 7) * 0.14
  return clamp01(a + b + cauda)
}

/**
 * O que o céu está fazendo neste instante.
 *
 * @param {number} semente
 * @param {number} segundos relógio contínuo (não o tick do dia)
 * @param {number} tempestade 0..1 — quanta chance de raio existe agora
 * @returns {{clarao:number, desdeORaio:number|null, distanciaKm:number|null}}
 */
export function relampagoEm(semente, segundos, tempestade) {
  const forca = clamp01(tempestade)
  // ⚠️ NÃO HÁ ATALHO PARA `forca === 0`, e não é esquecimento. Ele existia, e
  // era um comparador que nenhum teste podia matar: com força zero o limiar do
  // sorteio também é zero, `semRaioNaJanela` devolve verdadeiro para qualquer
  // hash, e o laço já sai sem nenhum raio — a resposta é a MESMA, byte a byte.
  // O que ele economizava eram quatro hashes por quadro. Guarda que não muda
  // resposta nenhuma é ruído no código e mutante imortal na conta.
  const s = Number(segundos) || 0
  // ⚠️ DUAS COISAS DIFERENTES SAEM DAQUI, e a primeira versão as guardava numa
  // variável só — `melhor` — escrevendo `distanciaKm` junto do maior clarão.
  //
  // ⚠️ E EU IA COMMITAR ISTO COMO CONSERTO DE DEFEITO. Escrevi o teste, ele
  // passou, e então rodei o teste contra a versão ANTIGA para provar que ele
  // sabia reprovar: passou também. A forma antiga só MISTURARIA os dois se um
  // raio mais VELHO tivesse clarão maior que o mais novo — e não tem: as
  // janelas são de 5 s, o envelope morre em 0,42 s, então todo raio de janela
  // anterior contribui clarão ZERO. A ordem da varredura (mais novo primeiro)
  // já garantia a resposta certa. O código estava confuso, não errado.
  //
  // A separação fica porque depender de acidente de ordenação é o que faz o
  // próximo a mexer aqui quebrar sem aviso. Mas o commit não vai dizer que
  // consertou som nenhum, porque não consertou.
  //
  // São perguntas separadas e agora têm respostas separadas:
  //   · o CLARÃO é o máximo, porque dois raios seguidos se somam na retina;
  //   · o TROVÃO pertence ao raio MAIS RECENTE, que é o que ainda não foi
  //     agendado — e a distância sai do mesmo raio, sempre.
  let clarao = 0
  let recente = null
  // Quatro janelas para trás: a cauda do clarão e, principalmente, o trovão da
  // janela passada ainda podem estar a caminho agora.
  for (const d of [0, -1, -2, -3]) {
    const i = Math.floor(s / FATIA) + d
    if (semRaioNaJanela(hash(semente ^ 0x51ed, i), forca)) continue
    const quando = i * FATIA + hash(semente ^ 0x9e37, i) * FATIA
    const dt = s - quando
    if (dt < 0) continue
    clarao = Math.max(clarao, envelope(dt))
    // Distância: perto é raro, longe é comum — é o que faz a maioria dos
    // trovões chegar rolando de longe e um em cada tantos estourar em cima.
    if (!recente || dt < recente.dt) {
      recente = { dt, distanciaKm: 0.15 + Math.pow(hash(semente ^ 0x2f1b, i), 2) * 6.5 }
    }
  }
  return {
    clarao,
    desdeORaio: recente ? recente.dt : null,
    distanciaKm: recente ? recente.distanciaKm : null,
  }
}

/** Quanto tempo o trovão leva pra chegar de uma distância em km. */
export const atrasoDoTrovao = (distanciaKm) => ((distanciaKm || 0) * 1000) / SOM_NO_AR

/**
 * Tempestade é o topo da escala de chuva, não um estado à parte: ela começa
 * onde a chuva já está forte. Sem isso daria "tempestade de céu limpo".
 */
export const tempestadeDe = (chuva) => clamp01((clamp01(chuva) - 0.55) / 0.35)
