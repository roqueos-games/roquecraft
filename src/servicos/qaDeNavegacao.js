/**
 * Navegação de QA: achar um lugar no mundo e apontar a câmera para ele.
 *
 * Sem isto, toda foto de sonda sai do bioma onde a semente calhou de nascer, e
 * o mundo parece ter um clima só. E cada função aqui carrega uma lição que
 * custou uma medição errada:
 *
 *  · `projetar` devolve u/v NORMALIZADOS (0..1), não pixeis. A sonda da tocha
 *    tratou como pixel, a janela virou NaN, e tudo deu zero, INCLUSIVE o ruído,
 *    que foi o que a denunciou.
 *  · `gotoBiome` pousava na BEIRADA do bioma até 26/08: devolvia a primeira
 *    coluna que casava, que por construção é a borda. A sonda pedia deserto, o
 *    HUD escrevia "Deserto", e a foto era floresta fechada. O `puro` exige
 *    disco inteiro do mesmo bioma, e o padrão é ZERO de propósito, porque um
 *    padrão diferente muda a cena de TODAS as sondas em silêncio (foi o que
 *    quebrou a da cáustica: praia é fronteira por definição).
 *  · `gotoCave` existe porque teleportar pra altura fixa caía DENTRO da rocha,
 *    e câmera dentro de bloco só vê face traseira: a foto saía um raio-X do
 *    mundo, com lençóis brancos de céu e o terreno em silhueta. Parecia defeito
 *    grave de render e não era.
 *
 * ⚠️ ENGINE E WORLD ENTRAM COMO GETTER, não como valor. Os dois são recriados
 * ao trocar de perfil de qualidade e ao abrir mundo novo; capturar o valor aqui
 * prenderia a navegação no motor MORTO. Ver o teste em `qaDeCena.spec.js`, que
 * planta a forma errada e exige o vermelho.
 *
 * Serviço e não composable: não guarda estado nem ciclo de vida.
 */

import { BIOMES, biomeAt, terrainHeight } from './worldgen.js'
import { toChunkCoord } from './constants.js'

/**
 * @param {object} ctx
 * @param {() => object} ctx.engine   motor VIVO
 * @param {() => object} ctx.world    cliente de mundo VIVO
 * @param {object} ctx.player         posição do jogador (mutável no lugar)
 * @param {() => object} ctx.noiseCtx contexto de ruído da semente atual
 * @param {() => object} ctx.flying   ref de voo
 * @param {() => number} ctx.yaw
 * @param {() => number} ctx.pitch
 * @param {(y:number, p:number) => void} ctx.olhar
 */
export function criarQaDeNavegacao(ctx) {
  const engine = () => ctx.engine()
  const world = () => ctx.world()
  const noiseCtx = () => ctx.noiseCtx()
  const flying = () => ctx.flying()
  const yaw = () => ctx.yaw()
  const pitch = () => ctx.pitch()
  const olhar = (y, p) => ctx.olhar(y, p)
  const player = ctx.player
  return {
    /**
     * Para ONDE a câmera olha, lido da matriz dela.
     *
     * ⚠️ DERIVAR A DIREÇÃO DO YAW NA SONDA É REIMPLEMENTAR A CÂMERA. A primeira
     * versão da sonda das lentes fez `(-sin(yaw), 0, -cos(yaw))`, que é a
     * convenção do three, e os pontos saíram DE LADO: o jogo aplica o yaw por
     * outro caminho. O erro não aparece como exceção — aparece como um ponto
     * projetado fora do quadro, que é indistinguível de "o cenário não tem nada
     * ali". Quem sabe para onde a câmera olha é a câmera.
     */
    olharDirecao: () => {
      const c = engine()?.camera
      if (!c) return null
      c.updateMatrixWorld()
      const e = c.matrixWorld.elements
      // A terceira coluna da matriz de rotação é o +Z local; a câmera olha
      // para -Z.
      return { x: -e[8], y: -e[9], z: -e[10] }
    },
    projetar: (x, y, z) => {
      if (!engine()) return null
      const c = engine().camera
      c.updateMatrixWorld()
      // Projeção manual: o componente não importa three, e importar a
      // biblioteca inteira num gancho de QA seria pagar caro por nada.
      const m = c.projectionMatrix.elements
      const w = c.matrixWorldInverse.elements
      const vx = w[0] * x + w[4] * y + w[8] * z + w[12]
      const vy = w[1] * x + w[5] * y + w[9] * z + w[13]
      const vz = w[2] * x + w[6] * y + w[10] * z + w[14]
      const cx = m[0] * vx + m[4] * vy + m[8] * vz + m[12]
      const cy = m[1] * vx + m[5] * vy + m[9] * vz + m[13]
      const cw = m[3] * vx + m[7] * vy + m[11] * vz + m[15]
      if (Math.abs(cw) < 1e-6) return null
      return { u: (cx / cw + 1) / 2, v: (1 - cy / cw) / 2, frente: cw > 0 }
    },
    // AUDITORIA DE MALHA NO JOGO RODANDO. Ver o gancho completo abaixo.

    waitChunks: async (radius = 4, timeout = 25000) => {
      const t0 = Date.now()
      while (Date.now() - t0 < timeout) {
        const cx = toChunkCoord(Math.floor(player.x))
        const cz = toChunkCoord(Math.floor(player.z))
        let missing = 0
        for (let dx = -radius; dx <= radius; dx++) {
          for (let dz = -radius; dz <= radius; dz++) {
            if (!world().isLoaded((cx + dx) * 16 + 1, (cz + dz) * 16 + 1)) missing++
          }
        }
        if (!missing) return true
        await new Promise((r) => setTimeout(r, 150))
      }
      return false
    },

    land: () => {
      const sy = world()?.surfaceY(Math.floor(player.x), Math.floor(player.z))
      if (sy == null) return false
      flying().value = false
      player.y = sy + 0.1
      player.vy = 0
      player.fallStart = player.y
      return true
    },

    teleport: (x, y, z) => {
      player.x = x
      player.y = y
      player.z = z
      player.vy = 0
      // VOAR. Sem isto a gravidade puxa a camera de volta pro chao entre o
      // teleporte e o screenshot: o print de bioma a +40 caia dentro da copa e
      // o de criaturas aterrissava atras de um barranco (QA de 2026-08-19).
      // `land()` continua sendo quem desliga o voo.
      flying().value = true
      world()?.setPlayerPosition(x, y, z)
    },

    look: (y, p) => {
      olhar(y, pitch())
      olhar(yaw(), p)
    },

    gotoBiome: (name, maxRadius = 90, puro = 0) => {
      const want = BIOMES[name]
      if (want === undefined) return false
      const puroEm = (x, z, raio) => {
        if (raio <= 0) return true
        const passo = Math.max(2, raio >> 2)
        for (let dx = -raio; dx <= raio; dx += passo) {
          for (let dz = -raio; dz <= raio; dz += passo) {
            const h = terrainHeight(noiseCtx(), x + dx, z + dz)
            if (biomeAt(noiseCtx(), x + dx, z + dz, h) !== want) return false
          }
        }
        return true
      }
      for (const exigencia of [puro, puro >> 1, 0]) {
        for (let r = 1; r <= maxRadius; r++) {
          for (let i = 0; i < 8 * r; i++) {
            const a = (i / (8 * r)) * Math.PI * 2
            const x = Math.round(Math.cos(a) * r * 24)
            const z = Math.round(Math.sin(a) * r * 24)
            const h = terrainHeight(noiseCtx(), x, z)
            if (biomeAt(noiseCtx(), x, z, h) !== want) continue
            if (!puroEm(x, z, exigencia)) continue
            player.x = x + 0.5
            player.z = z + 0.5
            player.y = h + 2
            player.vy = 0
            flying().value = true
            world().setPlayerPosition(player.x, player.y, player.z)
            return { x: player.x, y: player.y, z: player.z, pureza: exigencia }
          }
        }
      }
      return false
    },
    // Acha uma CAVERNA de verdade e poe o jogador dentro dela. Sem isto o QA
    // teleportava pra uma altura fixa, caia DENTRO da rocha macica, e como a
    // camera dentro de um bloco so ve faces traseiras (culling), a foto saia um
    // raio-X do mundo: lencois brancos de ceu com o terreno em silhueta. O
    // print parecia um defeito grave de render e nao era (QA de 2026-08-19).

    gotoCave: (radius = 8, minY = 12) => {
      const px = Math.floor(player.x)
      const pz = Math.floor(player.z)
      for (let r = 0; r <= radius; r++) {
        for (let dx = -r; dx <= r; dx++) {
          for (let dz = -r; dz <= r; dz++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue
            const x = px + dx * 4
            const z = pz + dz * 4
            const top = world().surfaceY(x, z)
            if (!Number.isFinite(top)) continue
            // procura um bolsao de ar de 3 de altura com chao solido embaixo
            for (let y = Math.min(top - 6, 58); y >= minY; y--) {
              if (!world().solidAt(x, y - 1, z)) continue
              if (
                world().solidAt(x, y, z) ||
                world().solidAt(x, y + 1, z) ||
                world().solidAt(x, y + 2, z)
              )
                continue
              // TEM que ter teto: sem isto, uma saliencia de penhasco (chao
              // solido + ar em cima) passa no teste e a "caverna" e o lado de
              // fora - foi o que aconteceu na primeira versao.
              if (world().skyExposed(x, y, z)) continue
              player.x = x + 0.5
              player.z = z + 0.5
              player.y = y
              player.vy = 0
              flying().value = true
              world().setPlayerPosition(player.x, player.y, player.z)
              // Vira pro lado MAIS ABERTO. Dentro de uma caverna, um yaw() fixo
              // encosta o nariz na parede e o print vira um borrao de textura
              // ampliada - aconteceu duas vezes no QA de 2026-08-19.
              let melhor = 0
              let melhorDist = -1
              for (let k = 0; k < 16; k++) {
                const a = (k / 16) * Math.PI * 2
                const dx = Math.sin(a)
                const dz = -Math.cos(a)
                let d = 0
                while (
                  d < 26 &&
                  !world().solidAt(
                    Math.floor(player.x + dx * d),
                    y + 1,
                    Math.floor(player.z + dz * d),
                  )
                )
                  d += 1
                if (d > melhorDist) {
                  melhorDist = d
                  melhor = a
                }
              }
              olhar(melhor, pitch())
              olhar(yaw(), -0.06)
              return { x: player.x, y: player.y, z: player.z, aberto: melhorDist }
            }
          }
        }
      }
      return false
    },
    // Enquadra um frame de capa: vista elevada olhando a paisagem ao entardecer,
    // que é quando a luz do motor mostra mais (sombra longa + céu quente).,
  }
}
