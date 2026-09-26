//
// FERMENTAÇÃO — como uma garrafa d'água vira poção.
//
// ⚠️ ISTO É SÓ A TABELA E A CONTA. `efeitos.js` sabe o que um efeito faz;
// `mobilia.js` sabe guardar o estado do suporte; aqui só existe "esta garrafa
// mais este ingrediente dão aquela garrafa". Separado porque é a parte que um
// teste prende inteira, e é a que muda quando um ingrediente novo entra.
//
// ⚠️ O QUE FICOU DE FORA, E POR QUÊ:
//
//  · PÓ DE BLAZE COMO COMBUSTÍVEL. O suporte do jogo de referência queima pó de
//    blaze, e blaze é um mob do Nether que não existe aqui. Pôr um combustível
//    que ninguém consegue conseguir travaria a fermentação inteira; inventar
//    outro seria convenção nova sem nada que a execute. O suporte fermenta sem
//    combustível, e isso fica escrito em vez de ser descoberto.
//
// OS MODIFICADORES (Goal 21, Onda 4) NÃO SÃO ITENS NOVOS. Glowstone (nível II),
// redstone (prazo dobrado) e pólvora (arremessável) viram um campo `pocao` NA
// PILHA — `{ nivel: 2 }`, `{ longa: true }`, `{ splash: true }` — como `enc` e
// `dur` já são. Multiplicar as oito poções por três seria vinte e quatro itens,
// vinte e quatro ícones e 240 traduções pra dizer a mesma coisa.
//
// A cadeia é a do original, e a ordem dela não é decoração: a água não vira
// poção direto. Ela vira ESTRANHA (nether wart), e a estranha é que aceita o
// ingrediente que decide o efeito. Sem esse degrau, a verruga do Nether não
// teria função nenhuma e a viagem entre dimensões não pagaria nada.

import {
  ehInstantaneo,
  maxNivelDe,
  duracaoPadrao,
  FATOR_DE_PRAZO,
  FATOR_DE_POTENCIA,
} from './efeitos.js'

/** Garrafa d'água: o começo de tudo. */
export const AGUA = 'water_bottle'
/** A base fermentada. Sem efeito: quem bebe não sente nada, como no original. */
export const ESTRANHA = 'pocao_estranha'

/**
 * `garrafa + ingrediente → garrafa`. Uma linha por caminho, e nada mais.
 *
 * ⚠️ As duas últimas são CORRUPÇÕES: o olho de aranha fermentado não fabrica um
 * efeito, ele VIRA o de uma poção pronta. É o que faz a lentidão e o dano
 * custarem uma poção boa em vez de um ingrediente barato.
 */
export const FERMENTACOES = [
  [AGUA, 'nether_wart', ESTRANHA],
  [ESTRANHA, 'sugar', 'pocao_velocidade'],
  [ESTRANHA, 'melon_slice', 'pocao_cura'],
  [ESTRANHA, 'spider_eye', 'pocao_veneno'],
  [ESTRANHA, 'raw_fish', 'pocao_respiracao'],
  [ESTRANHA, 'magma', 'pocao_forca'],
  ['pocao_velocidade', 'fermented_spider_eye', 'pocao_lentidao'],
  ['pocao_cura', 'fermented_spider_eye', 'pocao_dano'],
]

/** O efeito que cada poção entrega. `null` = nenhum (a estranha). */
export const EFEITO_DA_POCAO = {
  [ESTRANHA]: null,
  pocao_velocidade: 'velocidade',
  pocao_lentidao: 'lentidao',
  pocao_forca: 'forca',
  pocao_cura: 'cura',
  pocao_dano: 'dano',
  pocao_veneno: 'veneno',
  pocao_respiracao: 'respiracao',
}

/** Toda chave de poção do catálogo, a estranha inclusa. */
export const POCOES = Object.keys(EFEITO_DA_POCAO)

/** É garrafa de poção? (a garrafa d'água NÃO é: ela não se bebe) */
export const ehPocao = (item) => Object.prototype.hasOwnProperty.call(EFEITO_DA_POCAO, item)

/** O efeito de beber, ou `null` quando a garrafa não faz nada. */
export const efeitoDe = (item) => EFEITO_DA_POCAO[item] ?? null

const POR_PAR = new Map(FERMENTACOES.map(([g, i, r]) => [`${g}|${i}`, r]))

/**
 * O que sai. `null` quando o par não existe — e `null` é resposta, não erro: o
 * jogador põe qualquer coisa no slot, e o suporte simplesmente não faz nada.
 */
export function fermentar(garrafa, ingrediente) {
  if (!garrafa || !ingrediente) return null
  return POR_PAR.get(`${garrafa}|${ingrediente}`) ?? null
}

/** Este item serve de ingrediente pra alguma coisa? Só pra interface. */
export const ehIngrediente = (item) =>
  FERMENTACOES.some(([, i]) => i === item) || Object.hasOwn(MODIFICADORES, item)

// ── OS MODIFICADORES ──────────────────────────────────────────────────────
/** Ingrediente → o que ele faz com uma poção pronta. */
export const MODIFICADORES = {
  glowstone_dust: 'nivel',
  redstone: 'longa',
  gunpowder: 'splash',
}

/**
 * Aplica um modificador à garrafa. `null` quando não cabe: só poção com efeito
 * aceita; nível II só onde o efeito tem nível II; prazo só onde há prazo
 * (instantâneo não se estica); nível II e prazo dobrado NÃO se somam (é a
 * regra do original, e é o que impede a poção perfeita); nada se aplica duas
 * vezes.
 */
export function modificar(garrafa, ingrediente) {
  const o = MODIFICADORES[ingrediente]
  const efeito = efeitoDe(garrafa?.item)
  if (!o || !efeito) return null
  const p = garrafa.pocao || {}
  if (o === 'nivel' && (p.nivel === 2 || p.longa || maxNivelDe(efeito) < 2)) return null
  if (o === 'longa' && (p.longa || p.nivel === 2 || ehInstantaneo(efeito))) return null
  if (o === 'splash' && p.splash) return null
  const pocao = { ...p }
  if (o === 'nivel') pocao.nivel = 2
  if (o === 'longa') pocao.longa = true
  if (o === 'splash') pocao.splash = true
  return { item: garrafa.item, count: 1, pocao }
}

/**
 * O que sai de UMA garrafa (pilha) com o ingrediente: a tabela base, ou um
 * modificador. É o que o suporte usa; `fermentar` fica pra tabela crua.
 */
export function fermentarGarrafa(garrafa, ingrediente) {
  if (!garrafa || !ingrediente) return null
  const base = fermentar(garrafa.item, ingrediente)
  if (base) return { item: base, count: 1 }
  return modificar(garrafa, ingrediente)
}

/**
 * A DOSE de uma garrafa: efeito, nível e prazo, com os modificadores. Nível II
 * corta o prazo pela metade e o prazo dobrado dobra — os fatores moram em
 * `efeitos.js`. `null` quando a garrafa não faz nada.
 */
export function doseDe(item, pocao = null) {
  const efeito = efeitoDe(item)
  if (!efeito) return null
  const nivel = pocao?.nivel === 2 ? 2 : 1
  let duracao = duracaoPadrao(efeito)
  if (pocao?.longa) duracao *= FATOR_DE_PRAZO
  if (nivel === 2) duracao /= FATOR_DE_POTENCIA
  return { efeito, nivel, duracao, splash: !!pocao?.splash }
}

/** O campo `pocao` no save: 'II', 'L', 'S', 'IIS', 'LS' — ou null quando não há. */
export function codigoDaPocao(pocao) {
  if (!pocao) return null
  const c = `${pocao.nivel === 2 ? 'II' : ''}${pocao.longa ? 'L' : ''}${pocao.splash ? 'S' : ''}`
  return c || null
}

export function pocaoDoCodigo(codigo) {
  if (typeof codigo !== 'string' || !codigo) return null
  const p = {}
  if (codigo.includes('II')) p.nivel = 2
  if (codigo.includes('L')) p.longa = true
  if (codigo.includes('S')) p.splash = true
  return Object.keys(p).length ? p : null
}

/** Segundos de uma fermentação. Espelha o suporte do jogo de referência. */
export const SEGUNDOS_POR_FERMENTADA = 20

/**
 * Um passo do suporte. Devolve `true` se alguma coisa mudou — a interface
 * precisa saber que precisa redesenhar sem observar objeto profundo, exatamente
 * como a fornalha.
 *
 * ⚠️ O INGREDIENTE É CONSUMIDO UMA VEZ SÓ, e converte ATÉ TRÊS garrafas. É o
 * que faz valer a pena encher o suporte antes de ligar, e é o contrato do jogo
 * de referência. Consumir um por garrafa pareceria mais "justo" e tornaria o
 * suporte um lugar onde se fica esperando três vezes.
 *
 * ⚠️ E O PROGRESSO ZERA QUANDO A RECEITA DEIXA DE EXISTIR. Sem isto, tirar o
 * ingrediente no segundo 19 e pôr outro faria a nova fermentação sair no
 * segundo 20 — um relógio que o jogador consegue enganar.
 */
export function avancarSuporte(s, dt) {
  if (!s || s.tipo !== 'suporte') return false
  const saidas = (s.garrafas || []).map((g) => fermentarGarrafa(g, s.ingrediente?.item))
  const temTrabalho = saidas.some((x) => x !== null)

  if (!temTrabalho) {
    if (!s.progresso) return false
    s.progresso = 0
    return true
  }

  s.progresso = (s.progresso || 0) + dt
  // ⚠️ TOLERÂNCIA, pela mesma razão da fornalha: somar 0,1 duzentas vezes não dá
  // 20. Sem ela, cada fermentada custa um passo a mais, SEMPRE.
  if (s.progresso < SEGUNDOS_POR_FERMENTADA - 1e-9) return true

  s.progresso = 0
  for (let i = 0; i < saidas.length; i++) {
    if (saidas[i] === null) continue
    // A garrafa é UMA: poção não empilha, e converter uma pilha de três daria
    // três poções por um ingrediente sem passar pelos três slots.
    s.garrafas[i] = saidas[i]
  }
  s.ingrediente.count -= 1
  if (s.ingrediente.count <= 0) s.ingrediente = null
  return true
}

/** Fração 0..1 da barra, pra interface. */
export const fracaoDaFermentada = (s) =>
  !s || s.tipo !== 'suporte'
    ? 0
    : Math.max(0, Math.min(1, (s.progresso || 0) / SEGUNDOS_POR_FERMENTADA))
