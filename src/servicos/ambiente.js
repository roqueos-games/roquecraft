// RoqueCraft - O LEITO DE AMBIENTE: que sons de fundo tocam, e com que forca.
//
// O founder pediu vento, chuva e passaros por nome. Eles nao sao um "som de
// bioma": sao SEIS leitos que tocam ao mesmo tempo, cada um com um ganho, e o
// que faz um lugar soar como aquele lugar e a MISTURA.
//
// Puro de proposito: entra o estado (bioma, hora, altura, se esta submerso ou
// sob a terra, quanto chove), sai o objeto de ganhos. Sem audio, sem mundo, sem
// Vue - quem tem `AudioContext` e o `audio.js`, e quem sabe a altura da coluna
// e o componente.
//
// ⚠️ A DECISAO QUE MANDA EM TODAS AS OUTRAS: `ceuAberto`.
//
// Debaixo d'agua e debaixo da terra o de fora NAO ENTRA. Nao e "entra abafado":
// o leito externo vai a zero. Um vento tocando por tras de um filtro passa-baixa
// dentro de uma caverna soa como um defeito de mixagem, nao como uma caverna. E
// e por isso que a chuva tambem some la embaixo, junto com o resto do mundo.

/** Altura em que o vento comeca a subir, e em quantos blocos ele satura. */
export const ALTURA_DO_VENTO = { base: 70, faixa: 40 }
/** Vento de fundo por tipo de terreno: descampado assobia mais que clareira. */
export const VENTO_DE_FUNDO = { descampado: 0.6, resto: 0.25 }

const LITORAL = /ocean|beach/i
const ARBORIZADO = /forest|jungle|taiga|plains|savanna/i
const DESCAMPADO = /desert|snowy|mountains|savanna/i

const preso = (v) => Math.max(0, Math.min(1, v))

/**
 * Os ganhos dos seis leitos.
 *
 * @param {object} e
 * @param {string} e.bioma  nome do bioma (`BIOME_NAMES[i]`), ou vazio
 * @param {boolean} e.noite
 * @param {boolean} e.subterraneo
 * @param {boolean} e.submerso
 * @param {number} e.altura  a altura do jogador, em blocos
 * @param {number} e.chuva  0..1
 * @param {number} e.cachoeira  0..1, o quanto a queda d'agua perto pesa
 */
export function mixDeAmbiente({
  bioma = '',
  noite,
  subterraneo,
  submerso,
  altura,
  chuva = 0,
  cachoeira = 0,
}) {
  const ceuAberto = submerso || subterraneo ? 0 : 1
  const litoral = LITORAL.test(bioma) ? 1 : 0
  const arborizado = ARBORIZADO.test(bioma) ? 1 : 0
  // Vento sobe com a altitude e no descampado: e o que faz um pico nevado soar
  // diferente de uma clareira.
  const altitude = preso((altura - ALTURA_DO_VENTO.base) / ALTURA_DO_VENTO.faixa)
  const fundo = DESCAMPADO.test(bioma) ? VENTO_DE_FUNDO.descampado : VENTO_DE_FUNDO.resto

  return {
    'amb.vento': ceuAberto * Math.min(1, fundo + altitude),
    'amb.ondas': ceuAberto * litoral,
    // Passaro e grilo sao o MESMO leito em horarios opostos: um entra quando o
    // outro sai, e nunca tocam juntos. E o que faz o anoitecer ser audivel sem
    // nenhum evento de "anoiteceu".
    'amb.passaros': ceuAberto * arborizado * (noite ? 0 : 1),
    'amb.grilos': ceuAberto * arborizado * (noite ? 1 : 0),
    // ⚠️ SUBMERSO VENCE SUBTERRANEO. Um lago dentro da caverna e agua, nao
    // caverna: com os dois ligados o jogador ouviria o eco da pedra por cima do
    // abafamento da agua, que e a soma de dois lugares e nao um lugar.
    'amb.caverna': subterraneo && !submerso ? 1 : 0,
    'amb.submerso': submerso ? 1 : 0,
    // `ceuAberto` manda tambem aqui: debaixo da terra e debaixo d'agua a chuva
    // de fora nao se ouve, ela some junto com o resto do mundo externo.
    'amb.chuva': ceuAberto * preso(chuva),
    // ⚠️ CACHOEIRA NAO OBEDECE `ceuAberto`, E ESSA E A DIFERENCA DELA.
    //
    // Vento, chuva, onda e passaro sao o mundo LA FORA, e por isso somem quando
    // se entra numa caverna. Cachoeira nao e o mundo la fora: e uma coisa que
    // esta ali, a dez blocos, caindo. Uma gruta com queda d'agua dentro e um
    // dos lugares mais bonitos que este jogo consegue fazer, e calar a agua
    // justamente ali seria trocar o efeito pela regra.
    //
    // Submerso ela some, sim -- de dentro d'agua o que se ouve e o abafamento,
    // e o leito de `amb.submerso` ja conta essa historia inteira.
    'amb.cachoeira': submerso ? 0 : preso(cachoeira),
  }
}

/**
 * Esta sob a terra? Nao basta estar fundo: e preciso ter mundo POR CIMA.
 *
 * ⚠️ So a altura daria "caverna" pra quem esta num vale ao ar livre a y=40, e
 * silencio pra quem esta numa gruta alta na montanha. O que define caverna e a
 * distancia ate o topo da coluna, nao a distancia ate o nivel do mar.
 */
export const TETO_DA_CAVERNA = { altura: 48, folga: 8 }

// ⚠️ NAO HA GUARDA DE `Number.isFinite` AQUI, E ISSO E DE PROPOSITO.
//
// Escrevi uma, e o controle de mutantes mostrou que ela nao segurava nada: o
// mutante que a apagava sobreviveu. Antes do mundo carregar, `heightAt` nao
// existe e o argumento chega `undefined`; `undefined - altura` e NaN, e
// `NaN > folga` ja e falso. A guarda so mudava a resposta para `Infinity`, que
// uma altura de coluna nao pode ser. Codigo defensivo que nao defende de nada e
// pior que a ausencia dele: faz o leitor acreditar que ha um caso tratado ali.
//
// Quem segura o comportamento e o teste ("sem mundo carregado nao ha caverna"),
// e ele tem prova de vida: o mutante que nega a comparacao faz o `undefined`
// virar caverna e o teste acusa.
export function estaSobATerra(altura, topoDaColuna) {
  return altura < TETO_DA_CAVERNA.altura && topoDaColuna - altura > TETO_DA_CAVERNA.folga
}
