// A TROCA DE QUALIDADE: o motor que renasce sem levar o mundo junto.
//
// ⚠️ ESTE ARQUIVO EXISTE PORQUE ISTO NUNCA TEVE TESTE. Trocar de perfil não é
// mexer num número: sombra e cadeia de pós-processamento são decididas na
// CRIAÇÃO do renderer, então o motor inteiro morre e nasce de novo com o jogo
// aberto. Três coisas delicadas acontecem nesses milissegundos, e nenhuma era
// conferida sem alguém mexer no menu de ajustes com o olho no canvas:
//
//  1. `motor` e `criaturas` ficam NULOS até o novo existir. É o que segura o
//     laço de quadro, que testa os dois antes de desenhar. Se o nulo não
//     acontecer, o quadro desenha num renderer descartado.
//  2. As seções já carregadas precisam VOLTAR, reaplicando as edições. Sem o
//     `reset` com o mapa, trocar de qualidade apagava o que foi construído.
//  3. Se a criação falhar, o jogador fica sem motor nenhum. Por isso a troca é
//     guardada e o aviso é de erro, não silêncio.
//
// O que NÃO mora aqui: quando salvar (é `useRoqueCraftPersistencia`) e qual
// perfil vence qual (é `ajustes.js`, puro e testado). Aqui é só a troca.

/**
 * @param {object} ctx
 * @param {object} ctx.ajustes  o `settings` reativo do componente
 * @param {[() => object|null, (v)=>void]} ctx.motor  o `engine` do componente
 * @param {[() => object|null, (v)=>void]} ctx.criaturas  o `entities`
 * @param {() => object|null} ctx.som  GETTER: o áudio é recriado no boot
 * @param {() => object|null} ctx.mundo  GETTER: o mundo é recriado
 * @param {() => object|null} ctx.texturas  GETTER
 * @param {() => number} ctx.semente
 * @param {() => Map} ctx.mapaDeEdicoes
 * @param {() => object} ctx.tela  `{ canvas, container }`
 * @param {(raio: number) => void} ctx.raioDaRede
 * @param {() => void} ctx.agendarSave
 * @param {(err: Error) => void} ctx.avisarDaFalha
 * @param {(ctx: object) => Promise<object>} ctx.montarMotor  injetado: o teste dubla
 * @param {() => boolean} ctx.ehE2E
 */
export function useRoqueCraftQualidade(ctx) {
  const {
    ajustes,
    som,
    mundo,
    texturas,
    semente,
    mapaDeEdicoes,
    tela,
    raioDaRede,
    agendarSave,
    avisarDaFalha,
    montarMotor,
    ehE2E,
  } = ctx
  const [lerMotor, porMotor] = ctx.motor
  const [lerCriaturas, porCriaturas] = ctx.criaturas

  /**
   * Recria o renderer com o perfil de agora, pelo MESMO caminho do boot —
   * sombra, pós-processamento, FOV e partícula não podem depender de o jogador
   * ter mexido nos ajustes nesta sessão.
   */
  async function refazerMotor() {
    lerCriaturas()?.dispose()
    lerMotor()?.dispose()
    // ⚠️ NULOS ATÉ O NOVO EXISTIR: é isto que segura o laço de quadro.
    porCriaturas(null)
    porMotor(null)
    const novo = await montarMotor({
      settings: ajustes,
      canvas: tela().canvas,
      container: tela().container,
      textures: texturas(),
      ehE2E: ehE2E(),
    })
    porMotor(novo.engine)
    porCriaturas(novo.entities)
    // As seções já carregadas precisam voltar: pede tudo de novo ao pipeline,
    // reaplicando os edits (senão trocar de qualidade apagaria o que foi
    // construído).
    const w = mundo()
    w.reset(semente(), mapaDeEdicoes())
    w.setRenderDistance(ajustes.renderDistance)
  }

  /** Aplica os ajustes novos. Só recria o motor quando o PERFIL mudou. */
  async function aplicarAjustes(novos) {
    const trocouPerfil = novos.quality !== ajustes.quality
    Object.assign(ajustes, novos)
    som()?.setEnabled(ajustes.sound !== false)
    const motor = lerMotor()
    if (motor) {
      motor.camera.fov = ajustes.fov
      motor.camera.updateProjectionMatrix()
    }
    mundo().setRenderDistance(ajustes.renderDistance)
    // O raio da rede nunca passa do raio do mundo: pedir gente que não se
    // desenha é tráfego por nada.
    raioDaRede(Math.min(8, ajustes.renderDistance))
    if (trocouPerfil) {
      // Guardado: se falhar, o jogador fica sem motor nenhum e precisa saber.
      try {
        await refazerMotor()
      } catch (err) {
        avisarDaFalha(err)
      }
    }
    agendarSave()
  }

  return { aplicarAjustes, refazerMotor }
}
