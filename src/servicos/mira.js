// RoqueCraft - A MIRA: o que esta sob o retículo, e o que o jogador ve disso.
//
// Duas coisas moram aqui, e elas sao a mesma: descobrir a celula apontada, e
// mostrar ao jogador que ela e essa. Separadas, o contorno e a acao podem
// discordar -- e um contorno que cerca um bloco enquanto o golpe acerta outro e
// pior que nenhum contorno: ensina a mirar errado.
//
// Isto morava em cento e vinte linhas do componente e nao tinha teste porque
// dependia de `engine`, `world` e `player` de uma vez. Agora esses tres entram
// por acessador, e o dublê de cada um cabe em dez linhas.

import { raycastVoxel } from './voxelRaycast.js'
import { direcaoDoOlhar } from './aim.js'
import { EYE_HEIGHT } from './physics.js'
import { chaveDaCelula } from './construcao.js'
import { resolverColocacao } from './colocacao.js'

/**
 * Ate onde o braco chega.
 *
 * ⚠️ O CRIATIVO ALCANCA MAIS DE PROPOSITO. Construir de longe e o que o modo
 * serve pra fazer; cinco blocos obrigam a andar ate cada canto de uma parede.
 * Na sobrevivencia o mesmo alcance viraria vantagem de combate.
 */
export const ALCANCE = { creative: 8, sobrevivencia: 5 }

export const alcanceDe = (modo) => (modo === 'creative' ? ALCANCE.creative : ALCANCE.sobrevivencia)

/** Opacidade maxima da rachadura: em 1 ela apagaria a textura do bloco. */
export const RACHADURA_MAX = 0.62

/**
 * @param {object} e
 * @param {function} e.engine  o motor VIVO (ele e recriado na troca de qualidade)
 * @param {function} e.mundo   o cliente de mundo VIVO (recriado no boot)
 * @param {object} e.jogador   a posicao do jogador (objeto reativo, estavel)
 * @param {function} e.olhar   `() => ({ yaw, pitch })`
 * @param {function} e.modo    `() => 'creative' | 'survival'`
 * @param {function} e.bloqueado  `() => boolean` -- menu ou inventario abertos
 * @param {function} e.minerando  `() => ({ key, progress }) | null`
 * @param {function} e.naMao   `() => ({ item }) | null`
 */
export function criarMira({ engine, mundo, jogador, olhar, modo, bloqueado, minerando, naMao }) {
  // A direcao vem de `aim.js`, a MESMA funcao que orienta a camera. Ela ja teve
  // uma copia local com o sinal de X trocado, e a mira apontava pro bloco
  // espelhado -- ver a nota no cabecalho daquele arquivo.
  const raio = () => {
    const { yaw, pitch } = olhar()
    return {
      origin: { x: jogador.x, y: jogador.y + EYE_HEIGHT, z: jogador.z },
      dir: direcaoDoOlhar(yaw, pitch),
    }
  }

  /** O que eu quebro daqui? Atravessa liquido. */
  const alvo = () => {
    const w = mundo()
    if (!engine() || !w) return null
    const { origin, dir } = raio()
    return raycastVoxel(
      origin,
      dir,
      // ⚠️ SÓLIDO **OU** MIRÁVEL. Planta e tocha não colidem, e por isso a
      // versão que só olhava `solidAt` atravessava o mato: nunca deu pra
      // quebrar mato neste jogo. Ver `EH_MIRAVEL` em `blocks.js`.
      (x, y, z) => (w.solidAt(x, y, z) || w.miravelAt?.(x, y, z)) && !w.liquidAt(x, y, z),
      alcanceDe(modo()),
      // A mira enxerga a FORMA: sem isto, apontar pro vazio acima de uma laje ou
      // pro vao de uma escada acerta a celula como se fosse cubo.
      w.caixasAt,
    )
  }

  /**
   * O que eu PEGO daqui? So o balde usa.
   *
   * ⚠️ DUAS MIRAS PORQUE SAO DUAS PERGUNTAS. A mira normal atravessa agua e lava
   * de proposito: quebrar mira no bloco atras do lago, e um contorno piscando na
   * superficie a cada passo seria ruido. Mas isso deixa a fonte inalcancavel, e
   * sem alcancar a fonte o balde nunca enche -- a sonda de 24/08/2026 mediu
   * `alvo: null` com a fonte exatamente sob a mira, e o defeito nao era do balde.
   */
  const alvoDeLiquido = () => {
    const w = mundo()
    if (!engine() || !w) return null
    const { origin, dir } = raio()
    return raycastVoxel(
      origin,
      dir,
      (x, y, z) => !!w.solidAt(x, y, z) || w.liquidAt(x, y, z),
      alcanceDe(modo()),
    )
  }

  /**
   * Onde a peca cairia, se o jogador clicasse agora.
   *
   * ⚠️ A MESMA CONTA DO CLIQUE, e nao uma parecida. Um fantasma que aparece onde
   * o bloco nao entra e pior que fantasma nenhum: ele ensina errado, e o jogador
   * clica e nada acontece sem entender por que.
   *
   * Isto ja foi uma conta separada (`hit.place` mais tres condicoes) e divergia
   * do clique na FUSAO DE LAJE: a peca entrava na celula do alvo e o fantasma
   * aparecia na vizinha. Ver o cabecalho de `colocacao.js`.
   */
  const ondeCai = (hit) => {
    const w = mundo()
    const held = naMao()
    if (!hit || !held || !w) return null
    const { yaw, pitch } = olhar()
    return resolverColocacao({
      item: held.item,
      hit,
      olhar: direcaoDoOlhar(yaw, pitch),
      mundo: w,
      jogador,
    })
  }

  const cabeAqui = (hit) => !!ondeCai(hit)

  const atualizarFantasma = (hit) => {
    const f = engine()?.fantasma
    if (!f) return
    const plano = ondeCai(hit)
    f.visible = !!plano
    if (plano)
      f.position.set(plano.principal.x + 0.5, plano.principal.y + 0.5, plano.principal.z + 0.5)
  }

  /** Contorno, rachadura e fantasma, no quadro. Devolve o alvo pra quem quiser. */
  const atualizarDestaque = () => {
    const e = engine()
    const w = mundo()
    if (!e || !w) return null
    const hit = bloqueado() ? null : alvo()
    if (hit) {
      // O contorno segue a FORMA do bloco. Antes cercava sempre o cubo inteiro,
      // e numa laje de meia altura mostrava a mira "pegando" ar -- ensinando o
      // jogador a mirar deslocado.
      e.destaque.apontarPara(
        w.getBlock(hit.hit.x, hit.hit.y, hit.hit.z),
        hit.hit.x,
        hit.hit.y,
        hit.hit.z,
      )
      const cavando = minerando()
      // ⚠️ A RACHADURA E DAQUELA CELULA, e nao "de onde eu estou olhando".
      // Sem conferir a chave, virar a mira para o bloco vizinho no meio da
      // mineracao levaria a rachadura junto, como se o progresso fosse do
      // jogador e nao do bloco.
      if (cavando && cavando.key === chaveDaCelula(hit.hit.x, hit.hit.y, hit.hit.z)) {
        e.crack.visible = true
        e.crack.position.copy(e.highlight.position)
        e.crack.material.opacity = Math.min(RACHADURA_MAX, cavando.progress * RACHADURA_MAX)
      } else {
        e.crack.visible = false
      }
    } else {
      e.highlight.visible = false
      e.crack.visible = false
    }
    atualizarFantasma(hit)
    return hit
  }

  return { raio, alvo, alvoDeLiquido, ondeCai, cabeAqui, atualizarFantasma, atualizarDestaque }
}
