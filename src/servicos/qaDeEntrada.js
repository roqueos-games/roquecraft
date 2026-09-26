// GANCHO DE QA: DIRIGIR O JOGO, EM VEZ DE TELEPORTAR.
//
// ⚠️ ESTE MÓDULO INTEIRO EXISTE POR CAUSA DO POINTER LOCK.
//
// `onMouseDown` começa com `if (!pointerLocked) return`, e em headless o
// pointer lock NÃO engata ("The root document of this element is not valid for
// pointer lock"). A primeira sonda de construção mediu ZERO bloco colocado num
// jogo perfeitamente são - não era o recurso, era a trava. Estes ganchos entram
// DEPOIS da trava e exercitam o resto do caminho de verdade: cadência, alvo,
// mundo e inventário.
//
// O mesmo vale pro teclado: teleportar prova posição; só o input de verdade
// prova COLISÃO, degrau e voo - que foi exatamente o que o founder relatou
// quebrado (2026-08-22). O QA segura a tecla e mede onde o jogador parou, igual
// a um humano faria.
//
// É SERVIÇO E NÃO COMPOSABLE: escreve em `keys` e delega. Nada pra desligar.

import { AIR, blockDef, isUnbreakable } from './blocks.js'

/** Nome humano da ação → código de tecla. É o que a sonda escreve. */
const TECLA_DA_ACAO = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  sneak: 'ShiftLeft',
  sprint: 'ControlLeft',
}

/**
 * @param {object} ctx
 * @param {object} ctx.keys  o MESMO mapa que o teclado alimenta
 * @param {() => object} ctx.world  GETTER: mundo novo recria o cliente
 * @param {object} ctx.player  o objeto vivo do jogador
 * @param {() => number} ctx.yaw  GETTER: `yaw` é `let` do componente
 * @param {import('vue').Ref<boolean>} ctx.flying
 * @param {() => object|null} ctx.currentTarget  o raycast DO JOGO
 * @param {() => boolean} ctx.doPlace
 * @param {() => void} ctx.tryInteract
 * @param {Function} ctx.breakBlock
 * @param {object} ctx.entrada  o estado de entrada do jogo (segurar quebrar)
 */
export function criarQaDeEntrada({
  keys,
  world,
  player,
  yaw,
  flying,
  currentTarget,
  doPlace,
  tryInteract,
  breakBlock,
  entrada,
}) {
  return {
    press: (acao, ligado = true) => {
      const code = TECLA_DA_ACAO[acao] || acao
      keys[code] = !!ligado
      return code
    },

    // Segura e solta uma TECLA, pelo mesmo `keys` que o teclado alimenta.
    //
    // Com este gancho a sonda desce segurando Shift, igual ao jogador. Sem ele
    // ela teleportaria pra profundidade, o que provaria que a névoa muda com
    // `profundidade` e NÃO provaria que dá pra mergulhar - e "poder mergulhar"
    // foi exatamente o que o founder disse estar faltando.
    teclar: (codigo, ligado) => {
      keys[codigo] = !!ligado
      return !!keys[codigo]
    },

    place: () => doPlace(),

    // ⚠️ PELO BOTÃO DO CELULAR, como `segurarQuebrar`: é o caminho que existe
    // sem pointer lock, e é o que faz o SOLTAR chegar no arco. A versão antiga
    // chamava `pressionarColocar`/`soltarColocar` direto e o arco nunca atirava
    // pela sonda — o tiro mora no soltar da entrada, não na cadência.
    segurarColocar: (v) => {
      if (v) {
        entrada().onMobilePlaceStart()
        return true
      }
      entrada().onMobilePlaceEnd()
      return false
    },

    // ── SEGURAR O BOTÃO DE QUEBRAR, pelo caminho do jogo ──────────────────
    //
    // ⚠️ `breakNow` NÃO SERVE PRA MEDIR TEMPO DE QUEBRA. Ele chama `breakBlock`
    // direto e pula `tickMining`, que é onde `breakTime` e a eficiência do
    // encanto entram. Uma sonda que cronometrasse `breakNow` mediria a própria
    // chamada e daria verde com o encanto desligado.
    //
    // Aqui a sonda segura o botão como o dedo no celular segura, o laço do
    // quadro roda `tickMining`, e o bloco cai quando a barra encher.
    segurarQuebrar: (v) => {
      if (v) entrada().onMobileBreakStart()
      else entrada().onMobileBreakEnd()
      return !!v
    },

    /**
     * Segura o botão até o bloco mirado virar ar. Devolve `true` se caiu.
     *
     * O relógio é de PAREDE, mas o que ele mede é tempo de jogo: quem decide
     * quando a barra enche é `tickMining`, chamado pelo laço do quadro com o
     * `dt` real. Comparar dois valores medidos assim é honesto; afirmar o valor
     * absoluto de um deles não seria.
     */
    minerarMirado: async (timeout = 9000) => {
      const alvo = currentTarget()
      if (!alvo) return false
      const { x, y, z } = alvo.hit
      const w = world()
      if (w.getBlock(x, y, z) === AIR || isUnbreakable(w.getBlock(x, y, z))) return false
      entrada().onMobileBreakStart()
      const ate = performance.now() + timeout
      let caiu = false
      while (performance.now() < ate) {
        await new Promise((k) => setTimeout(k, 16))
        if (world().getBlock(x, y, z) === AIR) {
          caiu = true
          break
        }
      }
      entrada().onMobileBreakEnd()
      return caiu
    },

    breakNow: () => {
      const hit = currentTarget()
      if (!hit) return false
      const w = world()
      const id = w.getBlock(hit.hit.x, hit.hit.y, hit.hit.z)
      if (id === AIR || isUnbreakable(id)) return false
      breakBlock(hit.hit.x, hit.hit.y, hit.hit.z, id)
      return true
    },

    // Abre a mobília pelo bloco mirado. É entrada (o que a tecla E faz); ler e
    // mexer nos slots é `qaDeInventario`.
    interagir: () => tryInteract(),

    /**
     * O que o clique DIREITO faz, inteiro — criatura primeiro, bloco depois.
     *
     * ⚠️ `interagir` NÃO serve para o aldeão: ele só chama `tryInteract`, que é
     * a escada do BLOCO. Comerciar entra por `doPlace`, junto de tosquiar e
     * alimentar, e uma sonda que chamasse o degrau errado mediria o degrau
     * errado — verde ou vermelho pelo motivo errado nos dois casos.
     */
    interagirComAlvo: () => doPlace(),

    // ONDE a mira está encostando, com a chave do bloco. `blocoMirado()` dá só
    // a chave, e o QA precisava adivinhar a coordenada varrendo uma caixa em
    // volta do jogador - duas versões da sonda de fornalha erraram assim, uma
    // achando o chão e outra não achando nada porque o bloco caiu fora da
    // caixa. Quem sabe a resposta é o raycast.
    miraEm: () => {
      const hit = currentTarget()
      if (!hit) return null
      return {
        x: hit.hit.x,
        y: hit.hit.y,
        z: hit.hit.z,
        // `||` e nao `??`: nenhum bloco da tabela tem chave vazia, entao os dois
        // dao a MESMA resposta -- e so' o `||` pode ser afirmado por um teste
        // (a mutacao para `&&` faz todo bloco de verdade ser relatado como
        // 'air'). Entre duas formas identicas, fica a que um teste prende.
        chave: blockDef(world().getBlock(hit.hit.x, hit.hit.y, hit.hit.z))?.key || 'air',
      }
    },

    setFlying: (v) => {
      flying.value = !!v
      return flying.value
    },

    // Recua/eleva a camera sobre o proprio eixo de visao. E so pra ENQUADRAR o
    // QA: sem isto o print de criaturas saia com a camera encostada num barranco
    // e as sete criaturas fora do quadro.
    dolly: (back = 0, up = 0) => {
      const fx = Math.sin(yaw())
      const fz = -Math.cos(yaw())
      player.x -= fx * back
      player.z -= fz * back
      player.y += up
      player.vy = 0
      flying.value = true
      world()?.setPlayerPosition(player.x, player.y, player.z)
    },
  }
}
