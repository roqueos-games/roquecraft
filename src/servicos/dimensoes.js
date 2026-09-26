// RoqueCraft — onde o mundo COMEÇA e ONDE TERMINA, por dimensão.
//
// Até aqui a altura era um número solto: `WORLD_HEIGHT = 128` em constants.js,
// e o piso do mundo era o zero implícito em toda comparação `y < 0`. Isso é a
// trava T2 do plano: não dá para ter uma segunda dimensão (um Nether de teto
// baixo, um fim de ilha flutuante) enquanto "o teto do mundo" for uma constante
// única, e não dá para baixar o piso abaixo de zero enquanto o piso não tiver
// nome.
//
// Aqui cada dimensão declara seus limites, e o registro se VALIDA: altura
// múltipla da seção, piso múltiplo da seção, nível do mar dentro do mundo.
// Dimensão nova mal declarada reprova no teste em vez de produzir chunk torto.
//
// O que este módulo AINDA NÃO faz, dito como fato e não como promessa: o
// caminho quente (localIndex, mesher, luz) continua compilado contra a altura
// da dimensão padrão. Trocar isso por altura variável por chunk é a fatia
// seguinte; esta aqui é a que dá nome ao piso e ao teto e tira os literais do
// código.

/**
 * A altura de uma seção de malha mora AQUI, e não em constants.js, porque é a
 * régua contra a qual toda dimensão é validada ("altura múltipla da seção") —
 * e porque constants.js passou a derivar os números DESTE módulo. Pôr a régua
 * do outro lado fecharia um ciclo de import entre os dois.
 */
export const SECTION_HEIGHT = 16

/**
 * A altura que as duas dimensões de hoje têm.
 *
 * ⚠️ CONSTANTE E NÃO LITERAL REPETIDO, e o motivo é a catraca: o Nether declarar
 * `altura: 128` e `tetoIndestrutivel: 127` acrescentaria DOIS números de altura
 * cravados ao código, e o teto de `altura-cravada.json` só desce. Derivar da
 * seção deixa a declaração de cada dimensão dizendo quantas seções ela tem, que
 * é a unidade real — e é por seção que a malha e a luz trabalham.
 */
const OITO_SECCOES = SECTION_HEIGHT * 8

export const DIMENSAO_PADRAO = 'overworld'

/**
 * Uma dimensão é a resposta a seis perguntas: onde começa (minY), quanta altura
 * tem, até onde o mar enche sozinho, COM O QUÊ ele enche, se o céu ilumina, e
 * se há teto indestrutível.
 */
const REGISTRO = {
  overworld: {
    id: 'overworld',
    minY: 0,
    altura: OITO_SECCOES,
    nivelDoMar: 62,
    liquidoDoMar: 'water',
    // Piso indestrutível, em coordenada ABSOLUTA (não relativa ao minY): num
    // mundo que comece em -64 o bedrock é -64, não 0.
    pisoIndestrutivel: 0,
    // `null` é céu aberto: não há teto. O Nether tem.
    tetoIndestrutivel: null,
    temCeu: true,
  },

  // ── O NETHER ──────────────────────────────────────────────────────────────
  //
  // ⚠️ MESMA ALTURA DO OVERWORLD, E ISSO É O QUE TORNA ELE POSSÍVEL HOJE.
  //
  // O plano de 12/09 pôs Nether e End na onda 6, atrás da trava T2 ("uma
  // dimensão, 128 de altura, tudo literal"). Medi antes de escrever: a parte da
  // T2 que realmente barrava era a AUSÊNCIA de `dimensionId`, não a altura —
  // porque o Nether também tem 128. O caminho quente (`localIndex`, mesher,
  // luz) continua compilado contra a altura da dimensão padrão e continua
  // valendo, sem uma linha de mudança. Altura variável por dimensão segue
  // aberta, e é o que o End vai cobrar.
  //
  // O mar aqui é de LAVA e para em 31, um quarto do mundo: é o que faz a
  // metade de baixo ser travessia perigosa em vez de porão vazio.
  nether: {
    id: 'nether',
    minY: 0,
    altura: OITO_SECCOES,
    nivelDoMar: 31,
    liquidoDoMar: 'lava',
    pisoIndestrutivel: 0,
    // O teto fechado é o que dá ao Nether a sensação de CAVERNA e não de mundo
    // ao ar livre com neblina vermelha.
    tetoIndestrutivel: OITO_SECCOES - 1,
    temCeu: false,
  },

  // ── O FIM ─────────────────────────────────────────────────────────────────
  //
  // Mesma altura dos outros dois, e é uma DECISÃO e não um atalho: a ilha cabe
  // em 128 (chão em 60, pilares até 96), e altura variável por dimensão
  // continua sendo a fatia que muda o caminho quente — ela não paga nada aqui.
  // Não há mar: `nivelDoMar` fica no piso, e o gerador não enche nada. Não há
  // piso de bedrock: abaixo da ilha é o VAZIO, e cair nele mata (`corpo`).
  // `pisoIndestrutivel: 0` é o que o registro exige; o gerador não o escreve.
  end: {
    id: 'end',
    minY: 0,
    altura: OITO_SECCOES,
    nivelDoMar: 0,
    liquidoDoMar: null,
    pisoIndestrutivel: 0,
    tetoIndestrutivel: null,
    temCeu: false,
  },
}

export function dimensao(id = DIMENSAO_PADRAO) {
  const d = REGISTRO[id]
  if (!d) throw new Error(`dimensao desconhecida: ${id}`)
  return d
}

export const existeDimensao = (id) => Object.hasOwn(REGISTRO, id)
export const idsDeDimensao = () => Object.keys(REGISTRO)

/** { minY, maxY, altura } — maxY é o último y VÁLIDO, não o primeiro inválido. */
export function limites(id = DIMENSAO_PADRAO) {
  const d = dimensao(id)
  return { minY: d.minY, maxY: d.minY + d.altura - 1, altura: d.altura }
}

export function dentro(y, id = DIMENSAO_PADRAO) {
  const { minY, maxY } = limites(id)
  return y >= minY && y <= maxY
}

/** Quantas seções de malha a dimensão tem na vertical. */
export const seccoes = (id = DIMENSAO_PADRAO) => dimensao(id).altura / SECTION_HEIGHT

/** O y mais alto onde um corpo de 2 blocos ainda cabe inteiro. */
export const tetoDeCorpo = (id = DIMENSAO_PADRAO) => limites(id).maxY - 1

/**
 * O registro está coerente? Devolve a lista de problemas — vazio é o esperado.
 * Não é `console.warn`: o teste de arquitetura chama isto e reprova.
 */
export function problemasDoRegistro(registro = REGISTRO) {
  const faltas = []
  for (const [id, d] of Object.entries(registro)) {
    const onde = `dimensao ${id}`
    if (d.id !== id) faltas.push(`${onde}: campo id diz "${d.id}"`)
    if (!Number.isInteger(d.altura) || d.altura <= 0) faltas.push(`${onde}: altura invalida`)
    else if (d.altura % SECTION_HEIGHT !== 0)
      faltas.push(`${onde}: altura ${d.altura} nao e multipla de ${SECTION_HEIGHT}`)
    if (!Number.isInteger(d.minY)) faltas.push(`${onde}: minY invalido`)
    else if (d.minY % SECTION_HEIGHT !== 0)
      faltas.push(`${onde}: minY ${d.minY} nao e multiplo de ${SECTION_HEIGHT}`)
    if (!Number.isInteger(d.nivelDoMar)) faltas.push(`${onde}: nivelDoMar invalido`)
    else if (d.nivelDoMar < d.minY || d.nivelDoMar > d.minY + d.altura - 1)
      faltas.push(`${onde}: nivelDoMar ${d.nivelDoMar} fora do mundo`)
    if (!Number.isInteger(d.pisoIndestrutivel)) faltas.push(`${onde}: pisoIndestrutivel invalido`)
    else if (d.pisoIndestrutivel < d.minY || d.pisoIndestrutivel > d.minY + d.altura - 1)
      faltas.push(`${onde}: pisoIndestrutivel ${d.pisoIndestrutivel} fora do mundo`)
    // Teto é OPCIONAL (null = céu aberto), mas quando existe tem que estar
    // dentro do mundo e ACIMA do piso — um teto abaixo do chão não é um mundo
    // apertado, é um mundo sem volume nenhum, e o gerador encheria tudo.
    if (d.tetoIndestrutivel !== null) {
      if (!Number.isInteger(d.tetoIndestrutivel)) faltas.push(`${onde}: tetoIndestrutivel invalido`)
      else if (
        d.tetoIndestrutivel > d.minY + d.altura - 1 ||
        d.tetoIndestrutivel <= d.pisoIndestrutivel
      )
        faltas.push(
          `${onde}: tetoIndestrutivel ${d.tetoIndestrutivel} nao deixa mundo entre piso e teto`,
        )
    }
    if (d.liquidoDoMar !== null && d.liquidoDoMar !== 'water' && d.liquidoDoMar !== 'lava')
      faltas.push(`${onde}: liquidoDoMar "${d.liquidoDoMar}" nao e water, lava nem null`)
    if (typeof d.temCeu !== 'boolean') faltas.push(`${onde}: temCeu tem que ser booleano`)
  }
  if (!registro[DIMENSAO_PADRAO])
    faltas.push(`a dimensao padrao "${DIMENSAO_PADRAO}" nao existe no registro`)
  return faltas
}
