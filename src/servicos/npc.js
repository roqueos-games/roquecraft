// RoqueCraft — O QUE UM NPC TEM POR DENTRO.
//
// ⚠️ ANTES: NADA. A busca por diálogo, conversa ou fala em todo o RoqueCraft
// devolvia ZERO ocorrências. `abrirCom(mob)` ia direto para a tela de ofertas,
// e o único texto que um aldeão "dizia" eram as chaves i18n dos botões de
// troca. Ele não tinha nome, não sabia quem você é, e amanhã não lembrava de
// nada — nove aldeões numa vila eram nove máquinas de venda com pernas.
//
// ⚠️ E ESTE ARQUIVO NÃO CHAMA MODELO NENHUM. Ele é o ESTADO: nome, ofício,
// humor, amizade e memória. A fala — local ou por modelo de linguagem — é a
// onda seguinte e mora noutro lugar. A separação é a decisão de arquitetura
// mais importante das duas ondas, e ela vem da referência de NPC com LLM (ver
// o plano do Goal 20): **evento significativo é escrito pela LÓGICA DO JOGO,
// nunca sintetizado da conversa**. Memória que o próprio modelo escreve deriva
// — o NPC passa a "lembrar" de coisas que nunca aconteceram, e ninguém
// consegue reportar isso como defeito.
//
// Puro de propósito: sem Vue, sem three, sem rede. Entra estado, sai estado.

/**
 * Os nomes possíveis.
 *
 * ⚠️ NOME É A PRIMEIRA COISA QUE TRANSFORMA BICHO EM ALGUÉM. "Aldeão" é uma
 * espécie; "Benedito, o ferreiro" é uma pessoa de quem se lembra o caminho de
 * volta. Vem de tabela e não de sorteio livre de sílabas porque nome gerado por
 * sílaba sai impronunciável uma vez em cada dez, e essa uma estraga as outras
 * nove.
 */
/**
 * OS OFÍCIOS. Mora AQUI, e não em `comercio.js`, e isso é uma decisão.
 *
 * ⚠️ O OFÍCIO É DA PESSOA; o balcão é que se organiza por ele. Enquanto esta
 * lista morava em `comercio.js`, `npc.js` importava comércio e comércio passou a
 * importar `npc.js` (para o desconto da amizade): um CICLO entre dois módulos —
 * do tipo que não estoura na hora, só num dia qualquer em que a ordem de
 * avaliação muda e uma constante aparece `undefined` sem explicação.
 *
 * `comercio.js` continua com a tabela de ofertas por ofício, e um teste de
 * `tabelas-que-se-citam` exige que as duas listas sejam a MESMA — que é o
 * mecanismo que impede as duas fontes de divergirem em silêncio.
 */
export const OFICIOS = Object.freeze(['fazendeiro', 'ferreiro', 'bibliotecario', 'clerigo'])

export const NOMES = Object.freeze([
  'Benedito',
  'Aurora',
  'Caetano',
  'Doralice',
  'Elias',
  'Filomena',
  'Genaro',
  'Heloísa',
  'Isaías',
  'Joana',
  'Lázaro',
  'Marieta',
  'Nazaré',
  'Otávio',
  'Perpétua',
  'Quintino',
  'Rosalina',
  'Sebastião',
  'Tereza',
  'Ubirajara',
  'Vicente',
  'Zulmira',
])

/** Os humores, do pior para o melhor. A ordem é o que os torna comparáveis. */
export const HUMORES = Object.freeze(['desconfiado', 'reservado', 'cordial', 'caloroso'])

/**
 * A AMIZADE vai de 0 a 100, e ela MUDA O JOGO — senão é enfeite.
 *
 * ⚠️ REGRA DURA: quem mexe neste número é a lógica do jogo, por evento que
 * aconteceu de verdade (uma troca fechada, um presente entregue). Nunca a fala.
 */
export const AMIZADE_MAXIMA = 100
export const AMIZADE_INICIAL = 20

/** Quanto cada evento vale. Tabela, para a economia ser lida de uma vez. */
export const VALOR_DO_EVENTO = Object.freeze({
  trocou: 4,
  presenteou: 9,
  cumprimentou: 1,
  bateu: -25,
  quebrouCasa: -12,
})

/** Quantos eventos a memória guarda. Além disto, o mais velho sai. */
export const MEMORIA_MAXIMA = 12

/** A partir de que amizade cada humor começa. */
export const PISO_DO_HUMOR = Object.freeze([0, 25, 50, 78])

/**
 * O humor de quem tem esta amizade.
 *
 * ⚠️ DERIVADO, E NÃO UM CAMPO GUARDADO. Humor guardado ao lado da amizade é
 * duas verdades sobre a mesma coisa: basta um caminho esquecer de atualizar um
 * dos dois para o aldeão ficar "caloroso" com amizade 3, e ninguém entende.
 */
export function humorDe(amizade) {
  let i = 0
  for (let k = 0; k < PISO_DO_HUMOR.length; k++) if (amizade >= PISO_DO_HUMOR[k]) i = k
  return HUMORES[i]
}

const preso = (v) => Math.max(0, Math.min(AMIZADE_MAXIMA, v))

/**
 * Cria o dentro de um NPC. Função pura do hash: o mesmo aldeão, na mesma vila,
 * é sempre a mesma pessoa — inclusive num chunk recarregado.
 */
export function criarNpc(hash, { x, z, profissao }) {
  const i = Math.floor(hash(Math.round(x), Math.round(z), 51) * NOMES.length) % NOMES.length
  return {
    nome: NOMES[i],
    profissao: OFICIOS.includes(profissao) ? profissao : OFICIOS[0],
    amizade: AMIZADE_INICIAL,
    memoria: [],
  }
}

/**
 * Registra um evento e devolve o NPC NOVO.
 *
 * ⚠️ DEVOLVE CÓPIA, não muta. O mesmo NPC é lido pela tela de troca, pelo save e
 * pela fala; mutar no lugar faria a tela desenhar um estado que o save ainda não
 * tem, e o bug apareceria como "a amizade voltou ao recarregar".
 */
export function registrar(npc, tipo, quando = 0) {
  const valor = VALOR_DO_EVENTO[tipo]
  if (valor === undefined) return npc
  const memoria = [...npc.memoria, { tipo, quando }].slice(-MEMORIA_MAXIMA)
  return { ...npc, amizade: preso(npc.amizade + valor), memoria }
}

/** Quantas vezes este evento aconteceu, dentro do que a memória alcança. */
export const vezesQue = (npc, tipo) => npc.memoria.filter((e) => e.tipo === tipo).length

/** O NPC já te conhece? É o que separa "bom dia" de "você de novo". */
export const jaConhece = (npc) => npc.memoria.length > 0

/**
 * O DESCONTO que a amizade dá, de 0 a 1 do preço.
 *
 * ⚠️ ISTO É O QUE IMPEDE A AMIZADE DE SER ENFEITE. Um número que sobe na tela e
 * não muda nada é pior que não existir: ele promete consequência e não entrega.
 * O teto é baixo de propósito — amizade não pode quebrar a economia de esmeralda
 * que o comércio já equilibra.
 */
export const DESCONTO_MAXIMO = 0.25

export function descontoDe(amizade) {
  return (preso(amizade) / AMIZADE_MAXIMA) * DESCONTO_MAXIMO
}

/** O preço que este NPC cobra, nunca abaixo de 1. */
export function precoCom(npc, preco) {
  return Math.max(1, Math.round(preco * (1 - descontoDe(npc.amizade))))
}

/**
 * O que o NPC leva para o SAVE.
 *
 * ⚠️ SÓ O QUE NÃO SE RECALCULA. Nome e profissão saem do hash e da vila; guardá-
 * los seria gravar duas fontes da mesma verdade, e a do save envelheceria na
 * primeira vez que a tabela de nomes mudasse.
 */
export const npcParaSave = (npc) => ({ amizade: npc.amizade, memoria: npc.memoria })

/** Reconstrói o NPC juntando o que o hash sabe com o que o save lembrava. */
export function npcDoSave(base, salvo) {
  if (!salvo) return base
  return {
    ...base,
    amizade: Number.isFinite(salvo.amizade) ? preso(salvo.amizade) : base.amizade,
    memoria: Array.isArray(salvo.memoria) ? salvo.memoria.slice(-MEMORIA_MAXIMA) : [],
  }
}
