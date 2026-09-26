// RoqueCraft - as regras de CONSTRUIR, sem Vue e sem three.
//
// Existe porque construir era um clique por bloco: `doPlace()` só era chamado
// no `mousedown`, então levantar uma parede de 40 blocos custava 40 cliques. A
// diferença entre "colocar cubos" e "construir" é ergonomia, e ergonomia é
// cadência — que é uma máquina de estado pequena, e portanto testável fora do
// componente. O idioma do repo pra isso é módulo puro em `services/roquecraft`
// (`camera.js`, `passo.js`, `physics.js` moram aqui pela mesma razão).

import { PLAYER_WIDTH, PLAYER_HEIGHT } from './physics.js'

/**
 * Intervalo entre blocos com o botão segurado, em segundos.
 *
 * 0,18 s ≈ 5,5 blocos por segundo. O jogo de referência usa 4 ticks (0,2 s), e
 * a cadência fixa é de propósito: deixar o bloco sair assim que a mira muda de
 * célula parece mais rápido, mas transforma um tremor de mouse em duas
 * colocações e faz o jogador gastar item sem querer.
 */
export const INTERVALO_COLOCAR = 0.18

/**
 * Intervalo do primeiro bloco depois de apertar. Zero: o clique isolado tem
 * que responder NA HORA. A cadência só governa o segundo bloco em diante.
 */
export const ATRASO_INICIAL = 0

export function criarConstrucao() {
  return {
    colocando: false,
    desdeUltimo: 0,
    // Célula onde o último bloco entrou, pra não repetir no mesmo lugar quando
    // a mira não saiu dali (acontece ao mirar no próprio bloco recém-colocado).
    ultimaCelula: null,
  }
}

export function pressionarColocar(c) {
  c.colocando = true
  c.desdeUltimo = INTERVALO_COLOCAR // o primeiro sai imediatamente
  c.ultimaCelula = null
}

export function soltarColocar(c) {
  c.colocando = false
  c.desdeUltimo = 0
  c.ultimaCelula = null
}

/** Marca que um bloco entrou em `celula` (string "x,y,z" ou null). */
export function registrarColocado(c, celula) {
  c.desdeUltimo = 0
  // `||` e nao `??`: a celula e' a string "x,y,z" ou nada, entao os dois
  // operadores dao a MESMA resposta -- mas so' o `||` pode ser afirmado por um
  // teste (a mutacao para `&&` apaga a memoria da ultima celula e o bloqueio
  // de repeticao para de funcionar). Entre duas formas identicas, fica a que
  // um teste consegue prender.
  c.ultimaCelula = celula || null
}

/**
 * Avança a cadência. Devolve `true` no quadro em que um bloco deve entrar.
 *
 * `celulaAlvo` é a célula onde o bloco entraria agora; passar `null` significa
 * "não há alvo". Repetir na MESMA célula é bloqueado — sem isso, mirar no
 * bloco que acabou de sair colocava outro em cima e a parede subia sozinha.
 */
export function avancarColocar(c, dt, celulaAlvo) {
  if (!c.colocando) return false
  c.desdeUltimo += dt
  if (!celulaAlvo) return false
  if (c.desdeUltimo < INTERVALO_COLOCAR) return false
  if (celulaAlvo === c.ultimaCelula) return false
  return true
}

export const chaveDaCelula = (x, y, z) => `${x},${y},${z}`

/**
 * O bloco (x,y,z) invade o corpo do jogador?
 *
 * A checagem antiga testava UMA coluna — `floor(player.x)`, `floor(player.z)`.
 * O corpo tem 0,6 de largura e quase sempre encosta em duas ou quatro células,
 * então dava pra se emparedar colocando bloco na célula vizinha à do próprio
 * pé. Aqui a conta é a mesma AABB que a física usa, varrendo todas as células
 * que ela cobre.
 */
export function dentroDoJogador(x, y, z, player) {
  const meia = PLAYER_WIDTH / 2
  const x0 = Math.floor(player.x - meia)
  const x1 = Math.floor(player.x + meia)
  const z0 = Math.floor(player.z - meia)
  const z1 = Math.floor(player.z + meia)
  const y0 = Math.floor(player.y)
  const y1 = Math.floor(player.y + PLAYER_HEIGHT - 0.001)
  return x >= x0 && x <= x1 && z >= z0 && z <= z1 && y >= y0 && y <= y1
}

/**
 * Pick block: qual slot da hotbar deve ficar selecionado ao mirar num bloco.
 *
 * Devolve `{ acao: 'selecionar', slot }` quando o item já está na hotbar,
 * `{ acao: 'trazer', slot, de }` quando está na mochila e precisa vir pra
 * hotbar, `{ acao: 'dar', slot }` no criativo quando não se tem o item, e
 * `null` quando não há nada a fazer.
 *
 * A regra de qual slot receber no criativo é a do jogo de referência: usa o
 * slot atual se estiver vazio, senão o primeiro vazio, senão o atual mesmo.
 */
export function escolherPickBlock(slots, item, slotAtual, hotbarSize, criativo) {
  if (!item) return null
  for (let i = 0; i < hotbarSize; i++) {
    if (slots[i]?.item === item) return { acao: 'selecionar', slot: i }
  }
  for (let i = hotbarSize; i < slots.length; i++) {
    if (slots[i]?.item === item)
      return { acao: 'trazer', slot: destino(slots, slotAtual, hotbarSize), de: i }
  }
  if (!criativo) return null
  return { acao: 'dar', slot: destino(slots, slotAtual, hotbarSize) }
}

/**
 * Executa o plano de `escolherPickBlock`, devolvendo um NOVO inventário — ou o
 * mesmo array quando o plano é só selecionar (nada a copiar).
 *
 * Estava no componente porque começou como duas linhas; virou duas cópias de
 * array com uma troca no meio, que é exatamente o tipo de coisa que erra em
 * silêncio (trocar `de` com `slot` na ordem errada duplica o item) e que um
 * teste prende em três linhas.
 */
export function aplicarPickBlock(slots, plano, item, maxDaPilha) {
  if (!plano || plano.acao === 'selecionar') return slots
  const copia = slots.slice()
  if (plano.acao === 'trazer') {
    const tmp = copia[plano.slot]
    copia[plano.slot] = copia[plano.de]
    copia[plano.de] = tmp
  } else if (plano.acao === 'dar') {
    copia[plano.slot] = { item, count: maxDaPilha }
  }
  return copia
}

function destino(slots, slotAtual, hotbarSize) {
  if (!slots[slotAtual]) return slotAtual
  for (let i = 0; i < hotbarSize; i++) if (!slots[i]) return i
  return slotAtual
}
