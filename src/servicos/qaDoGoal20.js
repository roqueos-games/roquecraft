// GANCHO DE QA DO GOAL 20 — o que a sonda precisa perguntar AO JOGO.
//
// ⚠️ A SONDA NÃO PODE REIMPLEMENTAR O QUE ELA MEDE, e este repositório já pagou
// por isso duas vezes: a sonda da aldeia cravou uma coordenada no fonte e passou
// a fotografar campo vazio; a do minimapa contou a cor da vila no disco inteiro
// e mediu as setas de borda. Sonda que recalcula testa a própria conta.
//
// Aqui ficam as três perguntas das sete ondas que só o jogo carregado responde:
// que peça está na mão AGORA, quanto tempo leva cortar mato com a regra de
// verdade, e de quantas peças um mob é feito com o ofício dele.
//
// É SERVIÇO E NÃO COMPOSABLE: nenhum método guarda timer, assinatura ou
// listener. Todos leem.

import * as THREE from 'three'
import { ID, breakTime } from './blocks.js'
import { toolOf } from './items.js'
import { buildMobModel } from './render/entities.js'

/**
 * @param {object} ctx
 * @param {() => object} ctx.engine  getter do engine (o viewmodel mora nele)
 */
export function criarQaDoGoal20({ engine }) {
  return {
    /**
     * A CAIXA ENVOLVENTE da peça que está na mão agora, em unidades do
     * viewmodel, com quantas malhas ela tem.
     *
     * ⚠️ A CAIXA, E NÃO O PIXEL. Contar pixel na tela mediria também a luz, a
     * pose e o recuo do golpe — três coisas que mudam sem a peça mudar. O que a
     * onda 1 precisa afirmar é que a GEOMETRIA de uma classe é outra: duas
     * classes com a mesma caixa são duas classes com o mesmo desenho, que é
     * literalmente o defeito que ela conserta.
     */
    pecaNaMao: () => {
      const g = engine()?.viewmodel?.partes?.peca
      if (!g) return null
      const min = [Infinity, Infinity, Infinity]
      const max = [-Infinity, -Infinity, -Infinity]
      let caixas = 0
      g.traverse((o) => {
        const p = o.geometry?.parameters
        if (!p) return
        caixas++
        const eixos = [
          [o.position.x, p.width],
          [o.position.y, p.height],
          [o.position.z, p.depth],
        ]
        eixos.forEach(([c, tam], i) => {
          min[i] = Math.min(min[i], c - tam / 2)
          max[i] = Math.max(max[i], c + tam / 2)
        })
      })
      if (!caixas) return null
      return { caixas, w: max[0] - min[0], h: max[1] - min[1], d: max[2] - min[2] }
    },

    /**
     * O ESTADO DO GOLPE AGORA: se está correndo, qual, e onde no ciclo.
     *
     * ⚠️ QUEBRAR BLOCO NÃO É O MESMO GESTO QUE BATER, e a onda 10 fotografou só
     * o de bater. `digging` reinicia o ciclo em vez de encerrá-lo (`tSwing = 0`
     * quando chega a 1), então cavar é um laço CONTÍNUO enquanto o dedo está no
     * botão — e `golpeDe` faz `dig` vencer a classe, ou seja a picareta e a
     * espada cavam com o mesmo ritmo de propósito. Nada disso tinha leitura.
     */
    estadoDoGolpe: () => {
      const vm = engine()?.viewmodel
      return vm?.estadoDoGolpe ? vm.estadoDoGolpe() : null
    },

    /**
     * A silhueta PROJETADA da peça, em fração de tela.
     *
     * ⚠️ O MESMO QUE `silhuetaDaMao.spec.js` MEDE, mas com o jogo rodando. A
     * catraca de unidade olha a pose de REPOUSO; o que ninguém media é se a
     * peça sai do quadro NO MEIO do ciclo de cavar, que é onde ela vai mais
     * longe.
     */
    pecaNaTela: () => {
      const vm = engine()?.viewmodel
      const g = vm?.partes?.peca
      if (!g || !vm.camera) return null
      vm.scene.updateMatrixWorld(true)
      vm.camera.updateMatrixWorld(true)
      let minx = Infinity
      let maxx = -Infinity
      let miny = Infinity
      let maxy = -Infinity
      let n = 0
      g.traverse((o) => {
        const p = o.geometry?.parameters
        if (!p) return
        for (const sx of [-0.5, 0.5])
          for (const sy of [-0.5, 0.5])
            for (const sz of [-0.5, 0.5]) {
              const v = new THREE.Vector3(sx * p.width, sy * p.height, sz * p.depth)
              o.localToWorld(v)
              v.project(vm.camera)
              minx = Math.min(minx, v.x)
              maxx = Math.max(maxx, v.x)
              miny = Math.min(miny, v.y)
              maxy = Math.max(maxy, v.y)
              n++
            }
      })
      if (!n) return null
      return {
        largura: (maxx - minx) / 2,
        altura: (maxy - miny) / 2,
        minx,
        maxx,
        miny,
        maxy,
      }
    },

    /**
     * O estado VIVO das lentes (DoF e borrão do giro), lido dos uniformes.
     *
     * ⚠️ A SONDA NÃO RECALCULA A CURVA. `lentes.spec.js` já prova a matemática
     * com 20 asserções e 10 mutantes mortos; o que só o jogo rodando responde é
     * se os passes ENTRARAM no composer, se `tDepth` chegou, e se a força do
     * borrão sobe quando a câmera gira de verdade.
     */
    lentes: () => engine()?.inspecionarLentes?.() ?? null,

    /** Liga e desliga cada lente, pelo mesmo `setFx` do resto do pós. */
    setLentes: (opts) => {
      engine()?.setFx?.(opts)
      return engine()?.inspecionarLentes?.() ?? null
    },

    /** Quanto tempo leva quebrar este bloco com esta ferramenta, pela regra. */
    tempoDeQuebra: (chave, ferramenta = null) =>
      ID[chave] === undefined ? null : breakTime(ID[chave], ferramenta ? toolOf(ferramenta) : null),

    /** Um modelo de mob, montado como o mundo o monta — com o ofício. */
    modeloDeMob: (tipo, oficio = null) => {
      const g = buildMobModel(tipo, false, oficio)
      let pecas = 0
      g.traverse(() => pecas++)
      return {
        pecas,
        traje: g.userData?.traje?.avental ?? null,
        oficio: g.userData?.oficio ?? null,
      }
    },
  }
}
