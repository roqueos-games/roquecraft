//
// ATRAVESSAR — o que acontece entre pisar no portal e chegar do outro lado.
//
// ⚠️ O DESTINO É CALCULADO ANTES DE O MUNDO TROCAR, e isso é o que torna a
// travessia SÍNCRONA. O caminho óbvio seria trocar de dimensão, esperar os
// chunks chegarem e só então procurar onde pousar — mas aí o jogador passa
// segundos dentro de um mundo que ainda não existe, caindo, e o pouso depende
// de quanto o worker adiantou. Aqui o terreno de destino é GERADO na hora, sob
// demanda, pelo mesmo gerador puro que o worker usa: a resposta é a mesma e não
// depende de tempo nenhum.
//
// O preço é medido e aceito: gerar um chunk custa cerca de 10 ms, a busca toca
// poucos chunks, e isso acontece uma vez por travessia — contra uma fração de
// segundo de queda livre num mundo vazio.
//
import { AIR } from './blocks.js'
import {
  CHUNK_SIZE,
  WORLD_HEIGHT,
  localIndex,
  toChunkCoord,
  toLocalCoord,
  chunkKey,
} from './constants.js'
import { criarGerador } from './geradores.js'
import { planoDaTravessia, planoDoTeleporte } from './viagemEntreDimensoes.js'
import { ehPortal } from './portal.js'
import { ehPortalDoFim } from './portalDoFim.js'
import { POUSO_DA_CHEGADA } from './endWorldgen.js'

/** Quantos segundos dentro do portal antes de atravessar. */
export const ESPERA_NO_PORTAL = 1.2

/**
 * Um leitor do mundo de uma dimensão QUE AINDA NÃO ESTÁ CARREGADA.
 *
 * Gera chunk sob demanda e guarda; por cima, aplica as edições que o jogador já
 * fez naquela dimensão — sem isso, um portal que ele mesmo construiu do outro
 * lado seria invisível para a busca, e a travessia cavaria um segundo portal a
 * dez blocos do primeiro.
 */
export function criarLeitorDeDimensao(semente, dimensao, edicoes) {
  const gerar = criarGerador(semente, dimensao)
  const gerado = new Map()
  const blocosDe = (cx, cz) => {
    const k = `${cx},${cz}`
    let b = gerado.get(k)
    if (!b) {
      b = gerar(cx, cz).blocks
      gerado.set(k, b)
    }
    return b
  }
  return (x, y, z) => {
    if (y < 0 || y >= WORLD_HEIGHT) return AIR
    const cx = toChunkCoord(x)
    const cz = toChunkCoord(z)
    const i = localIndex(toLocalCoord(x), y, toLocalCoord(z))
    const editado = edicoes?.get(chunkKey(cx, cz))?.get(i)
    if (editado !== undefined) return editado
    return blocosDe(cx, cz)[i]
  }
}

/**
 * A travessia, com o relógio do portal e a memória das edições de cada dimensão.
 *
 * ⚠️ AS EDIÇÕES SÃO UM MAPA SÓ, TROCADO POR BAIXO. Ele é passado por referência
 * para o worker, para o save e para o `reset`, e criar um novo a cada troca
 * deixaria metade do jogo apontando para o mapa da dimensão anterior. Aqui o
 * conteúdo é guardado, o mapa é esvaziado e recarregado — o objeto é sempre o
 * mesmo.
 */
export function criarTravessia(ctx) {
  let dentroDoPortal = 0
  let atravessando = false
  // ⚠️ QUEM CHEGA FICA IMUNE ATÉ SAIR, e sem isto o portal é um pêndulo. A
  // chegada é DENTRO de um portal: zerar só o relógio faz o jogador atravessar
  // de novo 1,2 s depois, de volta, e de novo — medido na sonda, ele terminava
  // no Nether depois de três idas e voltas, sem nunca ter escolhido nada. É a
  // mesma regra do original: só se viaja depois de ter saído do portal.
  let imune = false
  const guardadas = new Map()

  const guardar = (dimensao) => {
    guardadas.set(
      dimensao,
      [...ctx.edicoes].map(([k, m]) => [k, [...m]]),
    )
  }
  const restaurar = (dimensao) => {
    ctx.edicoes.clear()
    for (const [k, pares] of guardadas.get(dimensao) || []) ctx.edicoes.set(k, new Map(pares))
  }
  /**
   * ⚠️ O GUARDADO É ARRAY, O LEITOR QUER MAPA. Guardar em array é o formato do
   * save e do worker, e passar ele direto para `criarLeitorDeDimensao` explodiu
   * na VOLTA e só nela: na ida o destino ainda não tinha nada guardado e o
   * `?.get` passava batido por ser `undefined`. Um defeito que só aparece na
   * segunda travessia é o tipo que não se vê lendo o código.
   */
  const mapaGuardado = (dimensao) =>
    new Map((guardadas.get(dimensao) || []).map(([k, p]) => [k, new Map(p)]))

  /**
   * O que o jogador está pisando decide para onde vai: portal do Nether leva
   * ao Nether (ou de volta); portal do Fim leva ao Fim (ou, do Fim, de volta
   * ao ponto de renascimento — é o portal de SAÍDA, e não há portal de volta a
   * construir do lado de cá).
   */
  function planoDoPortal(de, idDoPortal) {
    const jogador = ctx.jogador
    if (ehPortalDoFim(idDoPortal)) {
      if (de === 'end') return planoDeVolta()
      return { dimensao: 'end', forcado: false, celulas: [], pouso: { ...POUSO_DA_CHEGADA } }
    }
    return planoDaTravessia(
      de,
      { x: Math.floor(jogador.x), y: Math.floor(jogador.y), z: Math.floor(jogador.z) },
      criarLeitorDeDimensao(ctx.semente(), destinoDe(de), mapaGuardado(destinoDe(de))),
      8,
    )
  }

  /** Voltar ao overworld, no ponto de renascimento: a saída do Fim e a morte lá. */
  function planoDeVolta() {
    const p = ctx.pontoDeRetorno?.()
    if (!p) return null
    return { dimensao: 'overworld', forcado: false, celulas: [], pouso: { ...p } }
  }

  /**
   * Troca de dimensão de verdade: calcula o pouso, guarda o que havia, recarrega
   * o que há do outro lado, reconstrói o mundo e põe o jogador em pé.
   */
  function atravessar(idDoPortal = null, planoPronto = null) {
    const de = ctx.dimensaoAtual()
    guardar(de)
    // ⚠️ O PLANO PODE VIR DE FORA, E ISSO É O QUE IMPEDE UMA SEGUNDA TRAVESSIA.
    // O teleporte do criativo (`irPara`) precisa EXATAMENTE desta sequência —
    // guardar as edições de onde sai, restaurar as do destino, reconstruir o
    // mundo, pôr o jogador em pé — e dela só difere em PARA ONDE. Copiar o
    // corpo daqui para lá seria a política de nascimento em três cópias de
    // novo: aquilo custou três rodadas e um jogador enterrado na montanha.
    const plano =
      planoPronto ??
      (idDoPortal !== null ? planoDoPortal(de, idDoPortal) : de === 'end' ? planoDeVolta() : null)
    if (!plano) return false

    restaurar(plano.dimensao)
    // As células do portal de chegada entram como EDIÇÃO, não como terreno: elas
    // são obra do jogador (indiretamente) e precisam sobreviver a uma recarga do
    // chunk — do contrário o portal de volta some assim que ele se afasta.
    for (const c of plano.celulas) {
      const cx = toChunkCoord(c.x)
      const cz = toChunkCoord(c.z)
      const k = chunkKey(cx, cz)
      if (!ctx.edicoes.has(k)) ctx.edicoes.set(k, new Map())
      ctx.edicoes.get(k).set(localIndex(toLocalCoord(c.x), c.y, toLocalCoord(c.z)), c.id)
    }
    guardar(plano.dimensao)

    ctx.resetar(plano.dimensao)
    ctx.pousar(plano.pouso)
    dentroDoPortal = 0
    imune = true
    // Saiu do Fim PELO PORTAL (não pela morte): é o fim de jogo quem decide
    // se isso é vitória.
    if (de === 'end' && idDoPortal !== null) ctx.aoSairDoFim?.()
    return true
  }

  /**
   * Chamado a cada quadro. Conta o tempo dentro do portal e atravessa.
   *
   * O relógio existe porque atravessar no primeiro contato é o que faz o
   * jogador não conseguir olhar o portal de perto — e porque a chegada é dentro
   * de um portal, o que sem espera viraria um pêndulo entre os dois mundos.
   */
  function passo(dt) {
    if (atravessando) return false
    // ⚠️ EM SALA NÃO SE ATRAVESSA. A sala publica edição por quadro e todo mundo
    // lê do mesmo mapa: um jogador indo para o Nether começaria a publicar
    // netherrack por cima do mundo dos outros. Dimensão no multijogador é outra
    // fatia, e prometer meia dela aqui seria pior que não ter.
    if (ctx.emSala?.()) return false
    const j = ctx.jogador
    const w = ctx.mundo()
    if (!w) return false
    // ⚠️ MUNDO AINDA CHEGANDO NÃO DECIDE NADA, e foi ele que quebrou a imunidade.
    //
    // Logo depois da troca o chunk do pouso ainda não voltou do worker, e
    // `getBlock` responde AR — o que a regra lia como "o jogador saiu do
    // portal". A imunidade caía sozinha, o relógio recomeçava, e ele atravessava
    // de novo. A sonda filmou o pêndulo: nether, overworld, nether, overworld, a
    // cada 1,2 s, com o jogador PARADO. Enquanto a coluna não estiver carregada,
    // esta função não afirma nem nega nada.
    if (!w.isLoaded(Math.floor(j.x), Math.floor(j.z))) return false
    const id = w.getBlock(Math.floor(j.x), Math.floor(j.y), Math.floor(j.z))
    const dentro = ehPortal(id) || ehPortalDoFim(id)
    if (!dentro) {
      dentroDoPortal = 0
      imune = false
      return false
    }
    if (imune) return false
    dentroDoPortal += dt
    if (dentroDoPortal < ESPERA_NO_PORTAL) return false
    atravessando = true
    try {
      return atravessar(id)
    } finally {
      atravessando = false
    }
  }

  /**
   * TELEPORTE DE DIMENSÃO — a porta do painel de criativo (Goal 23).
   *
   * Herda as recusas da travessia, e as duas têm o mesmo motivo de sempre:
   *
   *  - **em sala, não.** A sala publica edição por quadro e todo mundo lê do
   *    mesmo mapa: um jogador indo para o Nether começaria a publicar
   *    netherrack por cima do mundo dos outros. Dimensão no multijogador é
   *    outra fatia, e prometer meia dela é pior que não ter.
   *  - **no meio de outra travessia, não.** `atravessando` existe porque a
   *    troca reconstrói o mundo, e duas reconstruções ao mesmo tempo deixam o
   *    jogador com o terreno de uma dimensão e as edições de outra.
   *
   * @param {string} destino  'overworld' | 'nether' | 'end'
   * @returns {boolean} se foi
   */
  function irPara(destino) {
    if (atravessando) return false
    if (ctx.emSala?.()) return false
    const de = ctx.dimensaoAtual()
    const plano = planoDoTeleporte(
      de,
      destino,
      ctx.jogador,
      criarLeitorDeDimensao(ctx.semente(), destino, mapaGuardado(destino)),
      POUSO_DA_CHEGADA,
    )
    if (!plano) return false
    atravessando = true
    try {
      // ⚠️ IMUNE AO CHEGAR, como na travessia a pé. Quem cai em cima de um
      // portal — e no Nether isso acontece, porque o pouso procura chão e o
      // portal de uma viagem anterior está EM cima de chão — seria mandado de
      // volta 1,2 s depois, sem ter escolhido nada.
      return atravessar(null, plano)
    } finally {
      atravessando = false
    }
  }

  return {
    passo,
    atravessar,
    irPara,
    /**
     * Sair do Fim sem portal: quem morre lá renasce no overworld. `false` se
     * o jogador não está no Fim (aí renascer é só renascer).
     */
    voltarDoFim: () => {
      if (ctx.dimensaoAtual() !== 'end') return false
      return atravessar(null)
    },
    /**
     * As edições das dimensões em que o jogador NÃO está, no formato achatado
     * do save: `[[id, [cx, cz, indice, bloco, ...]], ...]`.
     *
     * ⚠️ O MAPA VIVO É A VERDADE DA DIMENSÃO ATUAL, e por isso ela sai daqui.
     * `guardadas` só é atualizado na hora de atravessar; devolver a entrada dela
     * para a dimensão de agora gravaria o mundo como ele estava na última
     * travessia, e tudo que o jogador construiu depois disso sumiria.
     */
    paraSave: (dimensaoAgora) =>
      [...guardadas]
        .filter(([id]) => id !== dimensaoAgora)
        .map(([id, pares]) => [
          id,
          pares.flatMap(([k, itens]) => {
            const { cx, cz } = lerChave(k)
            return itens.flatMap(([i, id2]) => [cx, cz, i, id2])
          }),
        ]),
    /** O que o save trouxe das outras dimensões, na volta do carregamento. */
    doSave: (lista) => {
      for (const [id, mapa] of lista || []) {
        guardadas.set(
          id,
          [...mapa].map(([k, m]) => [k, [...m]]),
        )
      }
    },
    /** Só pro QA e pro relatório: quanto falta para atravessar. */
    progresso: () => Math.min(1, dentroDoPortal / ESPERA_NO_PORTAL),
    imune: () => imune,
  }
}

const destinoDe = (d) => (d === 'nether' ? 'overworld' : 'nether')

/** "cx,cz" de volta em números. O par de `chunkKey`, e mora junto dele. */
function lerChave(k) {
  const [cx, cz] = String(k).split(',')
  return { cx: Number(cx), cz: Number(cz) }
}

/** Quantos chunks de largura o mundo carrega ao redor. Só para o teste ler. */
export const LADO_DO_CHUNK = CHUNK_SIZE
