//
// EFEITOS COM PRAZO — o que uma poção deixa no jogador depois que a garrafa
// esvazia.
//
// ⚠️ O MESMO CRITÉRIO DO ENCANTAMENTO, E PELA MESMA RAZÃO. Guardar
// `{velocidade: 1}` num mapa e não mudar nada no jogo seria a barra de XP que
// não paga, uma camada abaixo. Cada efeito daqui foi escolhido por ter um ponto
// EXISTENTE onde entra, e nenhum deles pede sistema novo:
//
//   velocidade / lentidao → o multiplicador de passo de `physics.js`
//   forca                 → a base do golpe em `tryAttack`, ao lado da afiação
//   regeneracao           → o tique de cura de `stepSurvival`
//   veneno                → o tique de dano de `stepSurvival`
//   respiracao            → o consumo de fôlego de `stepSurvival`
//   cura / dano           → instantâneos, direto em `heal`/`damage`
//
// ⚠️ E ESTE MÓDULO NÃO CONHECE NENHUM DELES. Ele guarda nome, nível e prazo, e
// devolve o que está ativo. Quem morde é quem tem o ponto — senão o dano do
// golpe passaria a morar aqui, longe do golpe, que é como um sistema de efeitos
// vira um segundo jogo paralelo ao jogo.
//
// ⚠️ NÍVEL É 1..N, NUNCA 0. `nivelDe` devolve 0 para efeito ausente, e é isso
// que deixa quem morde escrever `1 + 0.2 * nivelDe(e, 'velocidade')` sem um `if`
// em volta. Um efeito com nível 0 guardado seria indistinguível de ausente, e a
// primeira versão disto gravava exatamente isso ao expirar.

/**
 * O catálogo. `instantaneo` não tem prazo: o efeito acontece e acaba, e nunca
 * entra no mapa.
 */
export const EFEITOS = {
  velocidade: { duracao: 180, maxNivel: 2 },
  lentidao: { duracao: 90, maxNivel: 2, ruim: true },
  forca: { duracao: 180, maxNivel: 2 },
  regeneracao: { duracao: 45, maxNivel: 2 },
  veneno: { duracao: 45, maxNivel: 2, ruim: true },
  respiracao: { duracao: 180, maxNivel: 1 },
  cura: { instantaneo: true, maxNivel: 2 },
  dano: { instantaneo: true, maxNivel: 2, ruim: true },
}

export const NOMES_DE_EFEITO = Object.keys(EFEITOS)
export const ehInstantaneo = (nome) => !!EFEITOS[nome]?.instantaneo
export const duracaoPadrao = (nome) => EFEITOS[nome]?.duracao ?? 0
export const maxNivelDe = (nome) => EFEITOS[nome]?.maxNivel ?? 0
export const ehRuim = (nome) => !!EFEITOS[nome]?.ruim

/** Multiplicadores de garrafa. Espelham `fermentacao.js`. */
export const FATOR_DE_POTENCIA = 2 // glowstone: dobra o nível, corta o prazo
export const FATOR_DE_PRAZO = 2 // redstone: dobra o prazo

/** O mapa vazio. É um objeto simples, para caber no save sem tradução. */
export function criarEfeitos() {
  return {}
}

/**
 * Põe (ou renova) um efeito.
 *
 * ⚠️ RENOVAR É O MAIOR DOS DOIS PRAZOS, NÃO A SOMA. Somar deixaria o jogador
 * estocar dez poções de velocidade e andar meia hora depressa por uma tarde de
 * cana — e o jogo de referência resolve isso do mesmo jeito. Nível MAIOR
 * substitui o prazo do menor; nível menor não derruba o maior.
 *
 * Devolve `false` quando não mudou nada (nome desconhecido, instantâneo, ou
 * oferta pior que o que já está lá).
 */
export function aplicarEfeito(efeitos, nome, nivel = 1, duracao = null) {
  const def = EFEITOS[nome]
  if (!def || def.instantaneo) return false
  const n = Math.max(1, Math.min(def.maxNivel, Math.round(nivel)))
  const prazo = Math.max(0, duracao ?? def.duracao)
  if (prazo <= 0) return false
  const atual = efeitos[nome]
  if (atual) {
    if (n < atual.nivel) return false
    if (n === atual.nivel && prazo <= atual.restante) return false
  }
  efeitos[nome] = { nivel: n, restante: prazo }
  return true
}

/** Nível ativo do efeito, ou 0. É o que quem morde consulta. */
export function nivelDe(efeitos, nome) {
  return efeitos?.[nome]?.nivel || 0
}

/** Segundos restantes, ou 0. Só a interface precisa disto. */
export const restanteDe = (efeitos, nome) => efeitos?.[nome]?.restante || 0

/** Os efeitos ativos, para a interface desenhar. Ordenado por nome, estável. */
export function efeitosAtivos(efeitos) {
  return Object.keys(efeitos || {})
    .sort()
    .map((nome) => ({ nome, nivel: efeitos[nome].nivel, restante: efeitos[nome].restante }))
}

/**
 * Um passo do relógio. Devolve os nomes que EXPIRARAM neste passo, para quem
 * chama avisar o jogador — efeito que some em silêncio vira "o jogo ficou
 * lento do nada".
 */
export function passoDosEfeitos(efeitos, dt) {
  const expirados = []
  for (const nome of Object.keys(efeitos)) {
    const e = efeitos[nome]
    e.restante -= dt
    // ⚠️ APAGA A CHAVE, não zera o nível. Guardar `{nivel: 1, restante: 0}`
    // faria `nivelDe` responder 1 para um efeito que acabou, e o jogador
    // continuaria depressa para sempre.
    if (e.restante <= 0) {
      delete efeitos[nome]
      expirados.push(nome)
    }
  }
  return expirados
}

/**
 * Quantos tiques de regeneração e de veneno saíram neste passo.
 *
 * ⚠️ O ACUMULADOR MORA NO PRÓPRIO EFEITO e não numa variável de fora. Um
 * contador solto no componente seria zerado na troca de qualidade (o motor
 * renasce) e o veneno recomeçaria do zero a cada ajuste — o mesmo defeito que
 * a fornalha teve com o progresso.
 *
 * ⚠️ E ELE NÃO VAI PRO SAVE. `efeitosParaSave` grava nome, nível e prazo; o
 * meio-tique perdido ao fechar o jogo é meio segundo, e gravá-lo custaria um
 * número por efeito em todo autosave.
 *
 * Chame ANTES de `passoDosEfeitos`: efeito que acaba neste passo ainda tica o
 * tempo que lhe restava, e não o passo inteiro.
 */
export function tiqueDeEfeitos(efeitos, dt) {
  const fora = { regenerar: 0, envenenar: 0 }
  for (const [nome, campo] of [
    ['regeneracao', 'regenerar'],
    ['veneno', 'envenenar'],
  ]) {
    const e = efeitos?.[nome]
    if (!e) continue
    const intervalo = intervaloDoTique(e.nivel)
    e.acumulado = (e.acumulado || 0) + Math.min(dt, e.restante)
    // ⚠️ TETO NO LAÇO. `dt` normalmente é 1/60, mas um quadro perdido (aba em
    // segundo plano, mundo carregando) já chegou com segundos inteiros — e sem
    // teto o veneno descontaria trinta tiques de uma vez, matando o jogador
    // enquanto ele olhava para outra janela.
    let n = 0
    while (e.acumulado >= intervalo && n < 4) {
      e.acumulado -= intervalo
      n++
    }
    if (n >= 4) e.acumulado = 0
    fora[campo] += n
  }
  return fora
}

export function limparEfeitos(efeitos) {
  for (const nome of Object.keys(efeitos)) delete efeitos[nome]
  return efeitos
}

// ── As mordidas, como FUNÇÕES PURAS ────────────────────────────────────────
//
// Moram aqui e não no ponto que morde porque a conta é a regra, e a regra é o
// que um teste prende. O ponto que morde chama uma destas e multiplica — é uma
// linha lá, e a linha não tem número mágico dentro.

/**
 * Multiplicador de passo. Velocidade e lentidão se cancelam pela MESMA conta, e
 * não por um `if` que escolhe uma das duas: beber as duas tem que dar um número
 * no meio, senão a poção ruim vira interruptor.
 */
export function multiplicadorDeVelocidade(efeitos) {
  const rapido = nivelDe(efeitos, 'velocidade')
  const lento = nivelDe(efeitos, 'lentidao')
  return Math.max(0.25, 1 + 0.2 * rapido - 0.15 * lento)
}

/** Dano extra do golpe, somado ao da arma — irmão de `bonusDeAfiacao`. */
export const bonusDeForca = (efeitos) => 3 * nivelDe(efeitos, 'forca')

/** Quanto o fôlego rende a mais. Nível 1 já é "não afoga". */
export const fatorDeFolego = (efeitos) => 1 / (1 + nivelDe(efeitos, 'respiracao'))

/** Vida curada (ou tirada) por um efeito instantâneo. */
export const pontosInstantaneos = (nivel = 1) => 3 * Math.max(1, nivel)

/** Segundos entre dois tiques de regeneração ou de veneno. */
export const INTERVALO_DO_TIQUE = 2.5
export const intervaloDoTique = (nivel = 1) => INTERVALO_DO_TIQUE / Math.max(1, nivel)

// ── Save ───────────────────────────────────────────────────────────────────
// Pares compactos, como o resto do save. Prazo com uma casa: meio centésimo de
// segundo de efeito não é coisa que o jogador perceba, e cada dígito a menos é
// espaço no teto de 240.000 números.

export function efeitosParaSave(efeitos) {
  const fora = []
  for (const nome of Object.keys(efeitos || {}).sort()) {
    const e = efeitos[nome]
    if (e?.restante > 0) fora.push([nome, e.nivel, Number(e.restante.toFixed(1))])
  }
  return fora.length ? fora : null
}

/** E de volta, jogando fora o que não existe mais no catálogo. */
export function efeitosDoSave(trincas) {
  const out = criarEfeitos()
  if (!Array.isArray(trincas)) return out
  for (const t of trincas) {
    if (!Array.isArray(t) || t.length !== 3) continue
    const [nome, nivel, restante] = t
    if (!EFEITOS[nome] || EFEITOS[nome].instantaneo) continue
    if (!Number.isFinite(nivel) || !Number.isFinite(restante) || restante <= 0) continue
    out[nome] = {
      nivel: Math.max(1, Math.min(maxNivelDe(nome), Math.round(nivel))),
      restante: Math.min(EFEITOS[nome].duracao * FATOR_DE_PRAZO, restante),
    }
  }
  return out
}
