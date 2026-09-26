//
// ENCANTAMENTO — o primeiro consumidor de XP que este jogo tem.
//
// ⚠️ O DIAGNÓSTICO DO PLANO DE 12/09 ERA ESTE, COM ESTAS PALAVRAS: "XP: acumula
// e tem barra | falta: NENHUM CONSUMIDOR". O jogador matava, minerava, subia de
// nível — e o número não comprava nada. Uma barra que só enche é enfeite caro:
// ela ocupa tela, ensina o jogador a persegui-la, e não paga.
//
// ⚠️ E O ENCANTO TEM QUE MORDER EM ALGUM LUGAR. Guardar `{eficiencia: 2}` no
// item e não mudar nada no jogo seria a mesma barra que não paga, uma camada
// abaixo. Os três encantos daqui foram escolhidos porque cada um tem um ponto
// EXISTENTE no código onde entra: a velocidade de quebra, o dano do golpe e o
// gasto de durabilidade. Nenhum deles pede sistema novo, e é por isso que são
// estes três e não os quinze do original.
//
const ENCANTOS = {
  // Quebra mais rápido. Entra no cálculo de tempo de mineração.
  eficiencia: { maxNivel: 3, ferramentas: ['pickaxe', 'axe', 'shovel', 'hoe', 'shears'] },
  // Bate mais forte. Entra no dano do golpe.
  afiacao: { maxNivel: 3, ferramentas: ['sword', 'axe'] },
  // Gasta menos. Entra no consumo de durabilidade.
  inquebravel: { maxNivel: 3, ferramentas: ['pickaxe', 'axe', 'shovel', 'hoe', 'sword', 'shears'] },
}

export const NOMES_DE_ENCANTO = Object.keys(ENCANTOS)
export const maxNivelDe = (nome) => ENCANTOS[nome]?.maxNivel ?? 0

/**
 * Quantos níveis custa a próxima melhoria.
 *
 * ⚠️ O CUSTO SOBE COM O QUE O ITEM JÁ TEM, e não é balanceamento de gosto: sem
 * isso, o jogador com muito nível encanta tudo ao máximo na primeira visita e a
 * barra volta a não significar nada — só que agora com um passo a mais. Cada
 * degrau custa três níveis a mais que o anterior.
 */
export const CUSTO_BASE = 3
export const custoDe = (nivelAtual) => CUSTO_BASE * (nivelAtual + 1)

/** Este encanto cabe nesta ferramenta? */
export function cabeNaFerramenta(nome, tipoDeFerramenta) {
  const e = ENCANTOS[nome]
  return !!e && !!tipoDeFerramenta && e.ferramentas.includes(tipoDeFerramenta)
}

/** Os encantos que ainda podem subir neste item. */
export function encantosPossiveis(tipoDeFerramenta, atuais = {}) {
  return NOMES_DE_ENCANTO.filter(
    (n) => cabeNaFerramenta(n, tipoDeFerramenta) && (atuais[n] || 0) < maxNivelDe(n),
  )
}

/**
 * O que acontece ao encantar. Devolve `null` quando não dá, e o MOTIVO importa
 * para quem chama avisar o jogador — "sem nível" e "item errado" são coisas
 * diferentes e o jogador precisa saber qual das duas foi.
 */
export function planoDeEncanto({ tipoDeFerramenta, encantos = {}, nivelDoJogador, sorteio }) {
  const possiveis = encantosPossiveis(tipoDeFerramenta, encantos)
  if (!possiveis.length) return { ok: false, motivo: 'nada-a-encantar' }
  // ⚠️ SORTEIO ENTRE OS POSSÍVEIS, E O CUSTO SAI DEPOIS. Escolher o mais barato
  // faria o jogador subir os três na mesma ordem sempre, e a mesa viraria uma
  // fila. Escolher antes de olhar o bolso é o que dá à mesa a cara de aposta que
  // ela tem no original.
  const nome = possiveis[Math.min(possiveis.length - 1, Math.floor(sorteio() * possiveis.length))]
  const atual = encantos[nome] || 0
  const custo = custoDe(atual)
  if (nivelDoJogador < custo) return { ok: false, motivo: 'sem-nivel', custo, nome }
  return { ok: true, nome, nivel: atual + 1, custo }
}

/**
 * O multiplicador de velocidade de quebra.
 *
 * Cada nível tira uma fatia do tempo, com retorno decrescente: III deixa em
 * 40% do tempo, e não em zero. Encanto que zera o custo de uma ação apaga a ação.
 */
export const fatorDeEficiencia = (nivel = 0) => 1 / (1 + 0.5 * Math.max(0, nivel))

/** Dano extra do golpe, somado ao da arma. */
export const bonusDeAfiacao = (nivel = 0) => 1.25 * Math.max(0, nivel)

/**
 * A durabilidade gasta de fato.
 *
 * ⚠️ NUNCA ZERO. Com `inquebravel III` valendo "não gasta", a ferramenta vira
 * eterna e a progressão de material (madeira → pedra → ferro → diamante) perde o
 * motivo de existir. Aqui ele gasta 1 a cada `nivel + 1` usos, em média — e a
 * conta é DETERMINÍSTICA por uso, com sorteio, para não precisar guardar contador
 * no item.
 */
export function gastaDurabilidade(nivel = 0, sorteio = Math.random) {
  if (nivel <= 0) return true
  return sorteio() < 1 / (nivel + 1)
}

/** Aplica o encanto num mapa de encantos, devolvendo um NOVO mapa. */
export function comEncanto(encantos, nome, nivel) {
  return { ...(encantos || {}), [nome]: nivel }
}

/** Serializa para o save: pares, que é o formato compacto do resto do save. */
export const encantosParaSave = (enc) =>
  enc && Object.keys(enc).length ? Object.entries(enc).map(([n, v]) => [n, v]) : null

/** E de volta, jogando fora o que não existe mais no catálogo. */
export function encantosDoSave(pares) {
  if (!Array.isArray(pares)) return null
  const out = {}
  for (const par of pares) {
    if (!Array.isArray(par) || par.length !== 2) continue
    const [nome, nivel] = par
    if (!ENCANTOS[nome] || !Number.isFinite(nivel)) continue
    out[nome] = Math.max(1, Math.min(maxNivelDe(nome), Math.round(nivel)))
  }
  return Object.keys(out).length ? out : null
}
