// RoqueCraft — A PEÇA NA MÃO: a forma de cada coisa que o jogador empunha.
//
// ⚠️ ISTO É DADO, E O `viewmodel.js` SÓ MONTA CAIXA A PARTIR DELE.
//
// Antes, o viewmodel tinha UMA geometria — a picareta — e a usava para espada,
// machado, pá, enxada, tesoura e isqueiro, trocando só a cor do metal. A tocha
// era pior: ela nem chegava aqui. Como `torch` é um bloco item normal, ela caía
// no ramo `kind: 'block'` e virava um CUBO CHEIO de 0.125 com a textura de
// tocha nas seis faces — o que o founder viu e descreveu como "sem sentido".
//
// A forma sair como dado resolve três coisas de uma vez:
//   1. a silhueta de cada classe pode ser AFIRMADA em teste de unidade, sem
//      three.js, sem canvas e sem foto;
//   2. o viewmodel para de crescer a cada classe nova;
//   3. quem desenha uma peça nova mexe numa tabela, não num arquivo de render.
//
// ⚠️ NÃO É CÓPIA DO JOGO ORIGINAL, e isso é decisão, não descuido. O founder
// pediu "exatamente a modelagem do original"; aquele conjunto de modelos é
// design de outra empresa e este repo é produto em loja. O alvo é a CONVENÇÃO
// do gênero — voxel, empunhada na diagonal, silhueta que se lê a 40 px — com
// desenho nosso. O que se julga aqui é se lê como espada, não se é a deles.
//
// ⚠️ E É SERVIÇO, NÃO COMPONENTE: nada aqui importa three.js nem toca no DOM.
// Entra o nome da classe, sai uma lista de caixas em unidades do viewmodel.

/**
 * O papel de cada caixa, que decide o MATERIAL que o render dá a ela.
 *
 * `metal` é o único que muda de cor por tier — é o que diferencia uma picareta
 * de madeira de uma de diamante, e já era assim antes desta tabela existir.
 */
import { desenhoDe, extrudarSprite } from './spriteDoItem.js'

export const PAPEIS = Object.freeze(['cabo', 'metal', 'chama', 'brasa', 'corda'])

/** Comprimento do cabo padrão. Todas as classes de cabo partem daqui. */
const CABO = 0.36
/** Espessura do cabo. Abaixo disto ele some contra a mão a 40 px. */
const GROSSURA = 0.032

const caixa = (papel, w, h, d, x = 0, y = 0, z = 0, rot = null) => ({
  papel,
  w,
  h,
  d,
  x,
  y,
  z,
  rx: rot?.rx ?? 0,
  ry: rot?.ry ?? 0,
  rz: rot?.rz ?? 0,
})

/**
 * As peças, por classe.
 *
 * ⚠️ O QUE SEPARA UMA CLASSE DA OUTRA É A SILHUETA, não o detalhe. A 40 px de
 * altura na tela — que é o tamanho real da peça no quadro — textura, bisel e
 * chanfro somem; o que sobra é o contorno. Por isso cada classe abaixo muda
 * uma coisa GRANDE: a espada é comprida e fina no eixo da lâmina, o machado é
 * pesado de um lado só, a pá é larga e chata na ponta, a enxada tem a barra
 * atravessada, a tesoura cruza duas lâminas. Duas classes que só diferissem na
 * espessura da cabeça leriam como a mesma peça.
 */
export const PECAS = Object.freeze({
  // A picareta é a que já existia, e fica como estava: a folha de contato de
  // 24/08/2026 assentou estes números e eles não têm defeito conhecido.
  pickaxe: [
    caixa('cabo', GROSSURA, CABO, GROSSURA),
    caixa('metal', 0.15, 0.042, 0.05, 0, 0.17, 0),
    caixa('metal', 0.055, 0.034, 0.045, -0.082, 0.152, 0, { rz: 0.6 }),
    caixa('metal', 0.055, 0.034, 0.045, 0.082, 0.152, 0, { rz: -0.6 }),
  ],

  // ESPADA: lâmina longa no eixo do cabo, FINA em profundidade, com guarda
  // atravessada. A guarda é o que impede a espada de ler como "cabo comprido":
  // é o único traço horizontal da peça.
  sword: [
    caixa('cabo', 0.028, 0.13, 0.028, 0, -0.1, 0),
    caixa('metal', 0.038, 0.026, 0.038, 0, -0.026, 0), // pomo
    caixa('metal', 0.115, 0.026, 0.042, 0, 0.0, 0), // guarda
    caixa('metal', 0.05, 0.3, 0.018, 0, 0.16, 0), // lâmina
    caixa('metal', 0.05, 0.05, 0.018, 0, 0.325, 0, { rz: Math.PI / 4 }), // ponta
  ],

  // MACHADO: massa toda de um lado. A assimetria é a classe inteira — um
  // machado simétrico é uma picareta.
  axe: [
    caixa('cabo', GROSSURA, CABO, GROSSURA),
    caixa('metal', 0.075, 0.115, 0.05, 0.055, 0.145, 0), // corpo da lâmina
    caixa('metal', 0.032, 0.155, 0.046, 0.108, 0.145, 0), // gume, mais alto
    caixa('metal', 0.05, 0.036, 0.05, 0.01, 0.175, 0), // olhal no cabo
  ],

  // PÁ: uma chapa larga e chata. Nada mais — o que faz pá é a chapa.
  shovel: [
    caixa('cabo', GROSSURA, CABO, GROSSURA),
    caixa('metal', 0.105, 0.115, 0.022, 0, 0.215, 0),
    caixa('metal', 0.105, 0.022, 0.05, 0, 0.162, 0), // ombro que prende no cabo
  ],

  // ENXADA: a barra ATRAVESSADA na ponta, em L. É o oposto da pá: fina no
  // eixo do cabo, larga atravessando.
  hoe: [
    caixa('cabo', GROSSURA, CABO, GROSSURA),
    caixa('metal', 0.13, 0.026, 0.03, 0.045, 0.192, 0),
    caixa('metal', 0.028, 0.055, 0.03, 0.098, 0.165, 0),
  ],

  // TESOURA: duas lâminas cruzadas num eixo. O X é a silhueta.
  shears: [
    caixa('metal', 0.026, 0.22, 0.018, -0.02, 0.06, 0, { rz: 0.16 }),
    caixa('metal', 0.026, 0.22, 0.018, 0.02, 0.06, 0, { rz: -0.16 }),
    caixa('metal', 0.034, 0.034, 0.03, 0, 0.04, 0), // eixo
    caixa('cabo', 0.03, 0.09, 0.024, -0.045, -0.07, 0, { rz: 0.16 }),
    caixa('cabo', 0.03, 0.09, 0.024, 0.045, -0.07, 0, { rz: -0.16 }),
  ],

  // ISQUEIRO: peça curta, sem cabo comprido. Ler como "coisa pequena na mão"
  // já é a informação certa.
  igniter: [
    caixa('metal', 0.075, 0.03, 0.05, 0, 0.02, 0),
    caixa('metal', 0.03, 0.075, 0.045, 0.035, 0.06, 0, { rz: -0.35 }),
    caixa('cabo', 0.05, 0.05, 0.04, -0.02, -0.02, 0),
  ],

  // TOCHA: haste fina e uma cabeça de chama. NÃO é cubo — era exatamente o
  // cubo que o founder viu. As proporções seguem a tocha DO MUNDO (poste de
  // 2/16 de lado, 10/16 de altura, em `formas.js`), reduzidas para a mão: a
  // peça na mão e a peça no chão têm que ser reconhecivelmente a mesma coisa.
  // TOCHA: cabo, brasa e chama — três caixas, e a do meio é a que faz a ponta
  // parecer quente. Com uma só, o topo era um cubo amarelo chapado: a foto da
  // sonda de 15/09/2026 mediu saturação 0,20 ali, e o founder leu "bloco
  // amarelo", não fogo.
  torch: [
    caixa('cabo', 0.026, 0.26, 0.026, 0, 0, 0),
    caixa('brasa', 0.046, 0.04, 0.046, 0, 0.14, 0),
    caixa('chama', 0.034, 0.05, 0.034, 0, 0.175, 0),
  ],
})

/**
 * O ASSENTO de cada classe: onde a peça pousa na mão e quanto ela mede.
 *
 * ⚠️ A ESCALA NÃO É ESTÉTICA, É ENQUADRAMENTO. Com a picareta em escala 1 a
 * cabeça ficava 0.15 acima do punho e mais larga que ele: lia como um machado
 * gigante flutuando ao lado da mão (folha de contato de 24/08/2026). 0.68 põe
 * a cabeça rente ao topo da mão, que está em 0.32.
 *
 * A tocha é a exceção declarada: ela é EMPUNHADA DE PÉ, quase sem inclinação,
 * porque uma tocha deitada não ilumina nada e lê como bastão.
 */
/**
 * A INCLINAÇÃO CANÔNICA da ferramenta na primeira pessoa: 25°.
 *
 * ⚠️ É O ÂNGULO BRUTO DO ASSENTO, e NÃO o ângulo que se vê na tela. A peça
 * herda a rotação do braço e a torção antes de chegar ao olho, então o valor
 * daqui não se compara com nenhuma referência: quem se compara é a MEDIDA na
 * tela, e ela está travada em `silhuetaDaMao.spec.js`.
 *
 * O alvo saiu de pixel, não de gosto: na foto do founder (15/09/2026, espada de
 * diamante), o eixo principal da espada está a **23,1° da vertical, com a ponta
 * para a direita** — medido por PCA nos 7.392 pixels cianos dela. O preset
 * `item/handheld` do original diz a mesma coisa por outro caminho:
 * `rotation: [0, -90, 25]` em `firstperson_righthand`.
 *
 * Este 1.45 foi calibrado por bisseção contra essa medida e entrega 22,9°. A
 * primeira tentativa usou 0.436 rad (os 25° literais do preset) e deu 8,9° na
 * tela — o erro de tratar um ângulo no meio de uma cadeia de rotações como se
 * fosse o ângulo final.
 *
 * A tocha fica FORA desta regra de propósito: uma tocha na diagonal derrama a
 * chama para o lado, e ela é o único item aqui que se segura como vela.
 */
export const INCLINACAO = 1.45

/**
 * ⚠️ A ESCALA CAIU PELA METADE NA ONDA 10, e não é ajuste fino: o desenho
 * extrudado tem 16 pixels de lado, ou seja 1,0 de altura, contra ~0,5 das caixas
 * feitas à mão que ele substituiu. Mesma peça na tela, número diferente na
 * tabela — quem compara com a tabela antiga sem ler isto acha que a mão
 * encolheu.
 */
export const ASSENTOS = Object.freeze({
  pickaxe: { escala: 0.19, x: 0.012, y: 0.2, z: 0.085, rz: -INCLINACAO },
  axe: { escala: 0.21, x: 0.012, y: 0.2, z: 0.085, rz: -INCLINACAO },
  shovel: { escala: 0.22, x: 0.012, y: 0.2, z: 0.085, rz: -INCLINACAO },
  sword: { escala: 0.23, x: 0.02, y: 0.24, z: 0.085, rz: -INCLINACAO, rx: 0.1 },
  hoe: { escala: 0.21, x: 0.012, y: 0.2, z: 0.085, rz: -INCLINACAO },
  shears: { escala: 0.24, x: 0.016, y: 0.24, z: 0.085, rz: -INCLINACAO },
  igniter: { escala: 0.3, x: 0.016, y: 0.26, z: 0.085, rz: -0.1 },
  torch: { escala: 0.32, x: 0.022, y: 0.25, z: 0.085, rz: -0.62 },
})

/**
 * O GOLPE de cada classe.
 *
 * ⚠️ ANTES ERA UM SÓ, e a única diferença entre bater e cavar era a VELOCIDADE
 * (5.4 contra 3.2). Espada, machado e mão vazia produziam o mesmo arco, na
 * mesma amplitude, nos mesmos eixos — que é a segunda metade da queixa "a
 * movimentação está muito ruim".
 *
 * O que muda por classe, e por quê:
 *   · `velocidade` — quantos ciclos por segundo. Espada é rápida, machado é
 *     lento; é o que o jogador sente como peso.
 *   · `rx` — quanto o braço DESCE. O machado vive disto: ele cai.
 *   · `ry`/`rz` — quanto o golpe ATRAVESSA. A espada vive disto: ela corta de
 *     lado, e é o que a separa de uma picareta rápida.
 *   · `recuo` — quanto a peça volta para trás antes de vir. Sem recuo o golpe
 *     começa no meio e não tem impulso.
 */
/**
 * A DURAÇÃO CANÔNICA de um golpe: 0,3 segundo.
 *
 * ⚠️ É O NÚMERO OFICIAL, e o nosso estava na metade. O componente
 * `minecraft:swing_duration` do jogo original tem valor padrão
 * 0.30000001192092896 s. A nossa `velocidade` é o INVERSO disso (ciclos por
 * segundo), e valia 5.4 — ou seja 0,185 s — com a espada em 7.4, isto é 0,135 s.
 * Menos da metade. Um gesto que dura 8 quadros a 60 Hz não lê como golpe: lê
 * como espasmo, e foi a segunda metade da queixa "a movimentação está ruim".
 *
 * As classes continuam tendo peso diferente, mas AO REDOR deste número em vez
 * de todas abaixo dele: o machado é mais lento que 0,3 s, a espada é mais
 * rápida, e a média é a canônica.
 */
export const DURACAO_DO_GOLPE = 0.3
const porSegundo = (segundos) => 1 / segundos

export const GOLPES = Object.freeze({
  // A referência: agora ancorada na duração canônica.
  padrao: {
    velocidade: porSegundo(DURACAO_DO_GOLPE),
    x: 0.09,
    y: 0.045,
    z: 0.05,
    rx: 0.8,
    ry: 0.3,
    rz: 0.26,
    recuo: 0,
  },
  // Cavar já estava no lugar certo — 0,31 s — e é o único que estava.
  cavar: { velocidade: 3.2, x: 0.09, y: 0.045, z: 0.05, rx: 0.8, ry: 0.3, rz: 0.26, recuo: 0 },

  // ESPADA: rápida, e o arco atravessa a tela em vez de descer. `rz` quase
  // dobra e `rx` cai pela metade.
  sword: {
    velocidade: porSegundo(0.25),
    x: 0.16,
    y: 0.02,
    z: 0.03,
    rx: 0.42,
    ry: 0.72,
    rz: 0.5,
    recuo: 0.22,
  },

  // MACHADO: lento e pesado, quase todo em `rx`. O recuo alto é o que dá o
  // "levanta e desce" — sem ele o machado vira uma picareta devagar.
  axe: {
    velocidade: porSegundo(0.37),
    x: 0.05,
    y: 0.11,
    z: 0.08,
    rx: 1.25,
    ry: 0.14,
    rz: 0.12,
    recuo: 0.34,
  },

  // PÁ e ENXADA: trabalho, não combate. Curto, baixo, sem atravessar.
  shovel: {
    velocidade: porSegundo(DURACAO_DO_GOLPE),
    x: 0.07,
    y: 0.07,
    z: 0.06,
    rx: 0.95,
    ry: 0.2,
    rz: 0.14,
    recuo: 0.12,
  },
  hoe: {
    velocidade: porSegundo(DURACAO_DO_GOLPE),
    x: 0.07,
    y: 0.07,
    z: 0.06,
    rx: 0.95,
    ry: 0.2,
    rz: 0.14,
    recuo: 0.12,
  },

  // TESOURA: gesto curto e rápido de pulso, sem braço.
  shears: {
    velocidade: porSegundo(0.23),
    x: 0.05,
    y: 0.02,
    z: 0.085,
    rx: 0.3,
    ry: 0.42,
    rz: 0.2,
    recuo: 0.1,
  },
})

/** A peça desta classe, ou `null` quando a classe não tem desenho próprio. */
/**
 * A GEOMETRIA da peça desta classe.
 *
 * ⚠️ VEM DO DESENHO, e não mais da tabela de caixas à mão. `PECAS` continua
 * existindo logo acima porque ela é a documentação da SILHUETA em prosa e o
 * recuo de qualquer classe que ainda não tenha desenho — mas quem manda é
 * `spriteDoItem.js`, pelo motivo escrito no cabeçalho de lá: cinco retângulos
 * lisos não viram espada, por mais que se acerte o ângulo deles.
 *
 * ⚠️ E É MEMORIZADA. A extrusão varre 256 células com uma varredura gulosa; ela
 * é barata, mas roda a cada troca de item na barra, e a mão é a coisa mais
 * sensível a tempo de primeiro quadro do render.
 */
const extrudadas = new Map()
export function pecaDe(classe) {
  if (extrudadas.has(classe)) return extrudadas.get(classe)
  const desenho = desenhoDe(classe)
  const caixas = desenho ? extrudarSprite(desenho) : (PECAS[classe] ?? null)
  extrudadas.set(classe, caixas)
  return caixas
}

/** O assento desta classe, com o da picareta como recuo. */
export const assentoDe = (classe) => ASSENTOS[classe] ?? ASSENTOS.pickaxe

/**
 * O golpe desta classe.
 *
 * ⚠️ `cavar` GANHA DA CLASSE, de propósito: segurar o botão numa pedra é o
 * mesmo gesto repetido com qualquer ferramenta, e um machado "caindo" em loop
 * a cada 0,24 s lê como falha de animação, não como mineração.
 */
export function golpeDe(classe, tipo) {
  if (tipo === 'dig') return GOLPES.cavar
  return GOLPES[classe] ?? GOLPES.padrao
}

/** Quantas caixas cada classe declara — a régua barata da silhueta. */
export const tamanhoDaPeca = (classe) => (pecaDe(classe) ?? []).length

/**
 * Blocos que, NA MÃO, são peça e não cubo.
 *
 * ⚠️ A TOCHA É OS DOIS: bloco no inventário, peça na mão. Sem esta tabela ela
 * cai no ramo do cubo e vira um cubo cheio de 0.125 com a textura de tocha nas
 * seis faces — foi o que o founder viu e chamou de "sem sentido". No mundo ela
 * já tem forma livre (o poste de `tochaEm`, em `formas.js`); o que faltava era
 * essa forma chegar à mão.
 */
export const PECA_DE_BLOCO = Object.freeze({ torch: 'torch' })

/**
 * O que a mão deve MOSTRAR para este item, ou `null` quando é cubo ou punho.
 *
 * ⚠️ A DECISÃO MORA AQUI, e não no componente, por dois motivos. O primeiro é
 * a catraca de tamanho: `ROSRoqueCraft.vue` está no teto e a regra é "quem
 * precisa de mais linhas divide antes". O segundo é melhor: esta é uma regra de
 * JOGO — que item vira que peça —, e regra de jogo em componente de tela é o
 * tipo de coisa que a próxima extração leva embora sem ninguém notar.
 *
 * ⚠️ O TIER SAI DO `tool`, e não de `split('_')` na chave do item. O componente
 * fazia `'iron_sword' → 'iron'` quebrando a string, com `tool.tier` numérico
 * disponível uma linha acima. Funciona enquanto todo item de ferramenta se
 * chamar `<tier>_<classe>`, e falha calado no dia em que um não se chamar.
 *
 * @param {string} chaveDoItem  ex.: 'iron_sword'
 * @param {object|null} tool  o que `toolOf(chave)` devolveu
 * @param {string|null} chaveDoBloco  a chave do bloco, quando o item é bloco
 */
export function maoDoItem(chaveDoItem, tool, chaveDoBloco = null) {
  if (tool?.kind) return { kind: 'peca', classe: tool.kind, tier: tierDe(chaveDoItem, tool) }
  const classe = chaveDoBloco ? PECA_DE_BLOCO[chaveDoBloco] : null
  return classe ? { kind: 'peca', classe, tier: 'wood' } : null
}

/** Os nomes de tier, na ordem do `tier` numérico de `items.js`. */
export const TIERS = Object.freeze(['wood', 'stone', 'iron', 'diamond'])

/** O nome do tier: pelo número quando ele existe, pela chave como recuo. */
export function tierDe(chaveDoItem, tool) {
  const n = tool?.tier
  if (Number.isInteger(n) && TIERS[n]) return TIERS[n]
  const prefixo = String(chaveDoItem || '').split('_')[0]
  return TIERS.includes(prefixo) ? prefixo : 'wood'
}
