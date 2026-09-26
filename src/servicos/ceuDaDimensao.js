//
// O CÉU DE CADA DIMENSÃO — e o que acontece quando não há céu.
//
// ⚠️ O NETHER NÃO TEM RELÓGIO, E ISSO NÃO É DETALHE DE ARTE. A paleta e o
// aparelho de luz do overworld são função de `ticks`: o sol nasce, a direcional
// gira, as estrelas aparecem, o ambiente sobe à noite. Debaixo de um teto de
// bedrock nada disso deveria acontecer — e, pior, aconteceria: a mesma cena
// ficaria mais clara ou mais escura conforme a hora de um dia que não existe
// ali, e o jogador veria o Nether mudar de humor sozinho sem nada no mundo ter
// mudado.
//
// Aqui a dimensão escolhe. O overworld continua exatamente como era — as duas
// funções de `daycycle.js` são as mesmas — e o Nether ganha um céu PARADO.
//
import { skyPalette, lightRig } from './daycycle.js'
import { dimensao } from './dimensoes.js'

/**
 * A paleta do Nether.
 *
 * ⚠️ O ZÊNITE É MAIS ESCURO QUE O HORIZONTE, ao contrário de todo céu de dia: o
 * que se vê "em cima" no Nether é rocha, não abóbada. Um zênite claro leria como
 * céu aberto acima do teto, que é exatamente a sensação que o teto existe para
 * negar.
 *
 * E a névoa é VERMELHA e curta. Ela é o que dá ao Nether a claustrofobia —
 * distância longa demais e o salão vira um galpão iluminado.
 */
export const PALETA_DO_NETHER = {
  zenith: [0.09, 0.03, 0.03],
  horizon: [0.22, 0.05, 0.04],
  sun: [1.0, 0.42, 0.2],
  fog: [0.28, 0.06, 0.05],
}

/**
 * O aparelho de luz do Nether.
 *
 * A direcional é fraca e vem de CIMA, quase a pino: ela não é sol, é o brilho da
 * lava e do teto devolvido pela rocha. Forte demais devolveria sombra de sol
 * debaixo da terra, que é o defeito clássico de quem só troca a cor.
 *
 * `stars: 0` é obrigatório e não estético: estrela através de um teto de bedrock
 * é o tipo de furo que ninguém liga ao código do céu.
 */
export const RIG_DO_NETHER = {
  directional: {
    dir: { x: 0.18, y: 1, z: 0.12 },
    intensity: 0.55,
    color: [1.0, 0.5, 0.28],
    isMoon: false,
  },
  // Mais alto que o do overworld de dia: sem sol e sem céu, o ambiente é
  // praticamente a única luz que não vem de bloco emissivo.
  ambient: 2.1,
  // Névoa densa: é ela que fecha o salão.
  fogDensity: 2.4,
  stars: 0,
  exposure: 1.0,
}

/**
 * O céu do Fim: preto-arroxeado, sem sol, névoa curta e escura. A luz vem de
 * cima e é fria e fraca — o que faz a pedra do Fim ler como pálida em vez de
 * amarela — e as estrelas ficam, porque aqui não há teto entre o jogador e
 * elas.
 */
export const PALETA_DO_FIM = {
  zenith: [0.02, 0.01, 0.04],
  horizon: [0.07, 0.04, 0.1],
  sun: [0.6, 0.5, 0.8],
  fog: [0.06, 0.04, 0.09],
}
export const RIG_DO_FIM = {
  directional: {
    dir: { x: 0.25, y: 1, z: -0.2 },
    intensity: 0.5,
    color: [0.75, 0.7, 0.95],
    isMoon: false,
  },
  ambient: 1.9,
  fogDensity: 1.6,
  stars: 1,
  exposure: 1.0,
}

const PALETA_SEM_CEU = { nether: PALETA_DO_NETHER, end: PALETA_DO_FIM }
const RIG_SEM_CEU = { nether: RIG_DO_NETHER, end: RIG_DO_FIM }

/** `true` quando a dimensão tem céu de verdade — sol, lua, estrelas e relógio. */
export const temCeu = (id) => dimensao(id).temCeu

export function paletaDaDimensao(id, ticks) {
  return temCeu(id) ? skyPalette(ticks) : (PALETA_SEM_CEU[id] ?? PALETA_DO_NETHER)
}

/**
 * ⚠️ DEVOLVE CÓPIA, NÃO A CONSTANTE. Quem consome mexe em `rig.directional.dir`
 * para centrar a sombra no jogador, e devolver o objeto do módulo faria o
 * segundo quadro herdar o vetor normalizado do primeiro — a luz do Nether iria
 * girando sozinha, um pouquinho por quadro, sem nada mandar.
 *
 * ⚠️ E A CÓPIA É DE TRÊS NÍVEIS, não de dois. O primeiro jeito foi
 * `{ ...RIG, directional: { ...RIG.directional } }`, que PARECE fundo e não é:
 * `dir` continua sendo o mesmo objeto, que é exatamente o que o consumidor
 * escreve. O teste pegou na primeira rodada.
 */
export function rigDaDimensao(id, ticks) {
  if (temCeu(id)) return lightRig(ticks)
  const rig = RIG_SEM_CEU[id] ?? RIG_DO_NETHER
  const { directional } = rig
  return {
    ...rig,
    directional: { ...directional, dir: { ...directional.dir }, color: [...directional.color] },
  }
}
