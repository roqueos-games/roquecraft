// GANCHO DE QA: O CONTORNO DO BLOCO MIRADO.
//
// O destaque é a única peça da cena que a sonda não consegue julgar por foto
// sozinha: ele é um traço de um pixel sobre a textura do bloco, e média de
// pixel não vê traço fino (a lição do halo de sombra, 2026-08). Então em vez
// de fotografar, a sonda PERGUNTA: existe, está visível, quantos filhos tem,
// quantos vértices, em que posição, e qual FORMA está no contorno.
//
// `destaqueDebug` é a outra metade: engorda o contorno e desliga o teste de
// profundidade pra que ele apareça na foto quando a pergunta já foi respondida
// e o founder quer VER. Mexe no material da cena, então só o QA chama.
//
// É SERVIÇO E NÃO COMPOSABLE: nenhuma das três funções guarda temporizador ou
// observador. Elas leem o engine e voltam.

import { blockDef } from './blocks.js'
import { caixasDe as caixasDoDestaque } from './render/destaque.js'

/**
 * @param {object} ctx
 * @param {() => object} ctx.engine  GETTER: o engine é recriado a cada troca
 *   de qualidade, e um valor capturado apontaria pro engine morto.
 * @param {() => object} ctx.world  GETTER: idem, mundo novo recria o cliente.
 * @param {() => object|null} ctx.currentTarget  o raycast do jogo, não uma cópia
 */
export function criarQaDeMira({ engine, world, currentTarget }) {
  return {
    // Qual bloco a mira está encostando agora (pro QA saber o que ESPERAR do
    // pick block em vez de aceitar qualquer coisa).
    blocoMirado: () => {
      const hit = currentTarget()
      if (!hit) return null
      return blockDef(world().getBlock(hit.hit.x, hit.hit.y, hit.hit.z))?.key ?? null
    },

    // Estado do contorno do bloco mirado. O print sozinho nao distingue
    // "contorno fraco" de "contorno desligado", e as duas causas sao
    // diferentes.
    // Mexe no contorno em tempo de execucao pra o QA isolar a causa sem
    // recompilar: escala, teste de profundidade e cor.
    destaqueDebug: ({ escala = 1, depthTest = null, cor = null } = {}) => {
      const h = engine()?.highlight
      if (!h) return false
      h.scale.setScalar(escala)
      for (const c of h.children) {
        if (depthTest !== null) c.material.depthTest = depthTest
        if (cor !== null) c.material.color.setHex(cor)
        c.material.needsUpdate = true
        c.frustumCulled = false
      }
      return true
    },

    destaqueInfo: () => {
      const h = engine()?.highlight
      const alvo = currentTarget()
      return {
        existe: !!h,
        visivel: !!h?.visible,
        filhos: h?.children?.length ?? 0,
        vertices: (h?.children || []).map((c) => c.geometry?.attributes?.position?.count ?? -1),
        pos: h ? [h.position.x, h.position.y, h.position.z] : null,
        alvo: alvo ? [alvo.hit.x, alvo.hit.y, alvo.hit.z] : null,
        // Qual FORMA está no contorno agora. Sem isto a sonda só pode dizer
        // "tem contorno" — e um contorno de cubo em cima de uma laje também
        // é um contorno.
        forma: engine()?.destaque?.idAtual ?? null,
        formasEmCache: engine()?.destaque?.formasEmCache ?? 0,
        caixas: alvo
          ? caixasDoDestaque(world().getBlock(alvo.hit.x, alvo.hit.y, alvo.hit.z))
          : null,
        caixaDaMalha: engine()?.destaque?.caixaDaMalha ?? null,
      }
    },
  }
}
