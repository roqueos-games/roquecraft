//
// COMBATE — a carga do golpe, o crítico e o empurrão do corrida.
//
// Antes desta rodada o combate era um número só: recarga de 0,42 s pra
// qualquer coisa na mão e dano chapado. Atacar era segurar o botão. A espada
// de diamante e a mão vazia tinham o MESMO ritmo, então escolher arma não
// mudava como o combate se joga — só quanto ele soma.
//
// O que o original faz, e o que este arquivo reimplementa:
//
//  1. CADA ARMA TEM SEU RITMO. Espada 1,6 golpes/s; picareta 1,2; machado e pá
//     1,0; enxada e mão vazia 4,0. Machado bate forte e devagar, espada bate
//     rápido — a escolha vira estilo, não só aritmética.
//  2. GOLPE SEM CARGA QUASE NÃO DÓI. O dano é multiplicado por `0.2 + 0.8p²`,
//     com `p` indo de 0 a 1 conforme a recarga enche. Martelar o botão dá 20%
//     do dano; esperar encher dá 100%. É a regra que transforma "clicar rápido"
//     em "acertar na hora certa", e é a alma da mudança.
//  3. CRÍTICO CAINDO. Atacar no ar, descendo, com a recarga quase cheia e sem
//     correr multiplica por 1,5. É o pulinho antes do golpe.
//  4. CORRENDO EMPURRA MAIS, mas não critica. As duas coisas se excluem no
//     original: ou você ganha distância, ou ganha dano.
//
// Números medidos na documentação do original, não estimados — ver o `Melee
// attack` do wiki. A curva quadrática e o limiar de 84,8% do crítico são
// literais.
//
// Arquivo de REGRA PURA: sem three, sem Vue, sem relógio. Recebe números e
// devolve números, pra que o teste possa varrer a curva inteira em vez de
// espiar um instante.

/** Golpes por segundo, por tipo de ferramenta na mão. */
export const GOLPES_POR_SEGUNDO = {
  sword: 1.6,
  pickaxe: 1.2,
  axe: 1.0,
  shovel: 1.0,
  hoe: 4.0,
  shears: 4.0,
  mao: 4.0,
}

/** Fração da recarga a partir da qual o crítico é aceito. */
export const CARGA_MINIMA_DE_CRITICO = 0.848

/** Multiplicador do crítico. */
export const MULTIPLICADOR_CRITICO = 1.5

/** Empurrão extra de quem ataca correndo, somado ao empurrão normal. */
export const EMPURRAO_DE_CORRIDA = 1

/**
 * Tempo de recarga, em segundos, do que está na mão.
 *
 * Mão vazia e ferramenta desconhecida caem no mesmo ritmo de 4 golpes/s — que
 * é o que o original faz e evita que um item novo sem categoria fique com
 * recarga infinita por descuido.
 */
export function recargaDe(tipoDeFerramenta) {
  const gps = GOLPES_POR_SEGUNDO[tipoDeFerramenta] || GOLPES_POR_SEGUNDO.mao
  return 1 / gps
}

/**
 * Carga do golpe, de 0 a 1.
 *
 * `restante` é quanto ainda falta da recarga; `total` é a recarga cheia da
 * arma. Cheia = 1, recém-atacado = 0.
 *
 * ⚠️ `total <= 0` devolve 1, não `Infinity` nem `NaN`. Uma arma com recarga
 * zero é uma arma sempre pronta, e é assim que ela tem que se comportar se
 * alguém registrar uma - não é motivo pra derrubar o cálculo de dano.
 */
export function cargaDe(restante, total) {
  if (!(total > 0)) return 1
  const p = 1 - restante / total
  return p < 0 ? 0 : p > 1 ? 1 : p
}

/**
 * Multiplicador de dano pela carga: `0.2 + 0.8p²`.
 *
 * Quadrático, não linear, e a diferença é o que se sente na mão: com a curva
 * linear, meia carga dava 60% do dano e martelar o botão continuava valendo a
 * pena. Com a quadrática, meia carga dá 40% - a punição por pressa fica no
 * lugar certo.
 */
export function multiplicadorDeCarga(p) {
  const c = p < 0 ? 0 : p > 1 ? 1 : p
  return 0.2 + 0.8 * c * c
}

/**
 * O golpe é crítico?
 *
 * Todas as condições ao mesmo tempo, como no original: caindo (velocidade
 * vertical negativa), fora do chão, com a carga acima do limiar, sem correr,
 * sem estar na água e sem estar escalando.
 */
export function ehCritico({
  carga = 0,
  vy = 0,
  noChao = true,
  correndo = false,
  naAgua = false,
  escalando = false,
} = {}) {
  return vy < 0 && !noChao && !correndo && !naAgua && !escalando && carga >= CARGA_MINIMA_DE_CRITICO
}

/**
 * Dano final de um golpe, já com carga e crítico.
 *
 * A ORDEM IMPORTA e não é escolha de gosto: o crítico multiplica o dano JÁ
 * reduzido pela carga. Aplicar o crítico antes faria um golpe martelado no ar
 * valer 30% em vez de 20% - e o crítico viraria prêmio por pressa, que é o
 * oposto do que ele existe pra fazer.
 */
export function danoDoGolpe({ base = 1, carga = 1, critico = false } = {}) {
  const d = base * multiplicadorDeCarga(carga)
  return critico ? d * MULTIPLICADOR_CRITICO : d
}

/**
 * Resolve um golpe inteiro a partir do estado do jogador.
 *
 * Existe pra que o componente não precise orquestrar quatro chamadas na ordem
 * certa - a ordem é exatamente o que já deu errado uma vez aqui. Devolve
 * também `carga` e `critico` porque a interface precisa deles pra dar retorno
 * ao jogador: um golpe que dá 20% do dano sem avisar não lê como mecânica, lê
 * como travamento.
 */
export function resolverGolpe({
  base = 1,
  restante = 0,
  total = 0.25,
  vy = 0,
  noChao = true,
  correndo = false,
  naAgua = false,
  escalando = false,
} = {}) {
  const carga = cargaDe(restante, total)
  const critico = ehCritico({ carga, vy, noChao, correndo, naAgua, escalando })
  return {
    carga,
    critico,
    dano: danoDoGolpe({ base, carga, critico }),
    empurraoExtra: correndo ? EMPURRAO_DE_CORRIDA : 0,
  }
}

/**
 * O GOLPE INTEIRO, do alvo ao tranco — o que morava em `tryAttack`.
 *
 * `resolverGolpe` (acima) decide QUANTO dói. Isto decide o que acontece: quem
 * apanha, quem morre, quem voa, quem cansa e quanta durabilidade some. Eram
 * cinquenta linhas no componente, e por isso nenhuma delas tinha teste.
 *
 * ⚠️ A RECARGA DA PRÓXIMA JANELA É DA ARMA QUE ESTÁ NA MÃO AGORA. Trocar de
 * arma troca o ritmo, e isso É a mecânica — não um efeito colateral da ordem
 * das linhas.
 *
 * ⚠️ E O GOLPE SEMPRE SAI. Bloquear até a recarga encher é outro jogo: o botão
 * fica inerte e o jogador não aprende o ritmo, só sente travamento. Deixando o
 * golpe sair fraco, o próprio dano ensina.
 *
 * Devolve `false` quando não havia alvo — é o que diz ao chamador que o clique
 * ainda pode virar "quebrar bloco".
 */
export function golpear(ctx) {
  const alvo = ctx.mirado()
  if (!alvo) return false
  const naMao = ctx.naMao()
  const def = naMao ? ctx.definicaoDe(naMao.item) : null

  const golpe = resolverGolpe({
    base: ctx.baseDoDano(def, naMao),
    restante: ctx.recarga.restante(),
    total: ctx.recarga.total(),
    vy: ctx.jogador.vy,
    noChao: ctx.jogador.onGround,
    correndo: ctx.correndo(),
    naAgua: !!ctx.jogador.inWater,
  })
  ctx.recarga.reiniciar(recargaDe(def?.tool?.kind))
  ctx.registrarGolpe({ carga: golpe.carga, critico: golpe.critico, t: 0 })

  if (!ctx.souQuemResolve()) {
    ctx.avisarRede(alvo, golpe.dano)
  } else if (ctx.ferir(alvo, golpe.dano)) {
    ctx.morreu(alvo)
  } else {
    // Sobreviveu: leva o tranco PRA LONGE DE QUEM BATEU. Quem ataca correndo
    // empurra mais — é a troca que o original oferece em lugar do crítico.
    //
    // ⚠️ A ORIGEM É O JOGADOR, e isso já custou caro: quando o laço de mira saiu
    // de `tryAttack` para `mobMirado` (25/08), o `const { origin } = cameraRay()`
    // foi junto e a linha ficou apontando para o `origin` GLOBAL do navegador —
    // uma string com a URL da página. `alvo.x - origin.x` virava NaN, e o bicho
    // sumia do mundo no quadro seguinte. O lint não viu: `origin` existe mesmo.
    ctx.empurrar(alvo, alvo.x - ctx.jogador.x, alvo.z - ctx.jogador.z, golpe.empurraoExtra)
  }

  ctx.cansar()
  if (naMao?.dur != null) ctx.gastarFerramenta()
  return true
}
