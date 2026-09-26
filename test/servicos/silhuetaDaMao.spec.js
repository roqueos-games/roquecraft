import { describe, it, expect, beforeAll } from 'vitest'
import * as THREE from 'three'
import { createViewModel } from '../../src/servicos/render/viewmodel.js'

//
// QUANTO DA TELA A MÃO OCUPA — a catraca que faltava na onda 1.
//
// ⚠️ ESTE ARQUIVO EXISTE POR UM NÚMERO QUE MENTIA. `viewmodel.js` tinha um teto
// chamado `larguraMax: 0.2` com um comentário dizendo "20% da tela", e ele media
// a largura da CAIXA do braço no plano do punho. Só que o cotovelo está bem mais
// perto da câmera, e a perspectiva o infla. Projetando os oito cantos de cada
// caixa, em 15/09/2026, o braço ocupava:
//
//     16:9    27,9%        4:3    38,0%        retrato   62,4%
//
// O teto existia, tinha número, tinha comentário — e errava em três aspectos.
// Nenhum teste podia pegar isso porque nenhum teste projetava SILHUETA: o
// `viewmodel.spec` projeta o CENTRO da mão, e centro não tem largura.
//
// A referência do alvo são três fotos do jogo original que o founder mandou em
// 15/09/2026. Medido em pixel na espada de diamante (739×415): a ferramenta
// ocupa 18,0% da largura e 58,1% da altura, entrando pelo canto inferior
// direito. O braço NÃO APARECE em nenhuma das três — e o nosso tinha o DOBRO da
// largura da ferramenta que ele segurava.
//
const ASPECTOS = [
  ['16:9', 16 / 9],
  ['4:3', 4 / 3],
  ['retrato', 430 / 932],
]

function stubCanvas() {
  HTMLCanvasElement.prototype.getContext = function () {
    return {
      fillStyle: '',
      fillRect: () => {},
      drawImage: () => {},
      getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    }
  }
}
const fakeRenderer = () => ({ autoClear: true, clearDepth: () => {}, render: () => {} })

/**
 * A caixa da silhueta PROJETADA, em fração de tela.
 *
 * ⚠️ OITO CANTOS POR CAIXA, e não o centro. É a diferença entre medir "onde a
 * coisa está" e "quanto dela se vê", e foi a segunda que ninguém media.
 */
function silhueta(vm, raiz, filtro = () => true) {
  vm.scene.updateMatrixWorld(true)
  vm.camera.updateMatrixWorld(true)
  const v = new THREE.Vector3()
  let minx = Infinity
  let maxx = -Infinity
  let miny = Infinity
  let maxy = -Infinity
  let n = 0
  raiz.traverse((o) => {
    const p = o.geometry?.parameters
    if (!p || o.visible === false || !filtro(o)) return
    for (const sx of [-0.5, 0.5])
      for (const sy of [-0.5, 0.5])
        for (const sz of [-0.5, 0.5]) {
          v.set(sx * p.width, sy * p.height, sz * p.depth)
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
  // NDC vai de -1 a 1, então a fração de tela é metade do intervalo.
  return { largura: (maxx - minx) / 2, altura: (maxy - miny) / 2, minx, maxx, miny, maxy }
}

const doBraco = (o) => o.userData.braco === true

function medir(aspect, classe = null) {
  const vm = createViewModel(fakeRenderer())
  vm.resize(aspect)
  if (classe) {
    vm.setHeld({ kind: 'peca', classe, tier: 'iron' })
    vm.update(0.016, { moving: false })
  }
  const braco = silhueta(vm, vm.partes.rig, doBraco)
  const peca = classe ? silhueta(vm, vm.partes.peca) : null
  vm.dispose()
  return { braco, peca }
}

describe('a silhueta da mão na tela', () => {
  beforeAll(stubCanvas)

  it('há braço e peça para medir (prova de vida)', () => {
    const { braco, peca } = medir(16 / 9, 'sword')
    expect(braco.largura).toBeGreaterThan(0.02)
    expect(peca.largura).toBeGreaterThan(0.02)
  })

  it('o BRAÇO não passa de um quarto da largura da tela, em nenhum aspecto', () => {
    // Era 27,9% / 38,0% / 62,4%. Um braço que toma mais de um quarto do quadro
    // é o "tronco" que o founder viu.
    const gordos = ASPECTOS.map(([nome, a]) => [nome, medir(a).braco.largura]).filter(
      ([, l]) => l > 0.25,
    )
    expect(gordos.map(([n, l]) => `${n}=${(l * 100).toFixed(1)}%`)).toEqual([])
  })

  it('a FERRAMENTA é mais larga que o braço que a segura', () => {
    // Na referência o braço nem aparece. Aqui basta a inversão: enquanto a
    // ferramenta for a metade do braço, a mão lê como tronco com um enfeite.
    for (const [nome, a] of ASPECTOS) {
      const { braco, peca } = medir(a, 'sword')
      expect(peca.largura / braco.largura, `${nome}: peça/braço`).toBeGreaterThan(1.05)
    }
  })

  it('a espada ocupa em 4:3 o que a referência mostra: ~18% de largura', () => {
    const { peca } = medir(4 / 3, 'sword')
    expect(peca.largura).toBeGreaterThan(0.12)
    expect(peca.largura).toBeLessThan(0.24)
  })

  it('a peça CABE no quadro — a ponta não sai por cima', () => {
    for (const [nome, a] of ASPECTOS) {
      for (const classe of ['sword', 'axe', 'pickaxe', 'torch']) {
        const { peca } = medir(a, classe)
        expect(peca.maxy, `${nome}/${classe} passou do topo`).toBeLessThan(1)
        expect(peca.minx, `${nome}/${classe} passou da esquerda`).toBeGreaterThan(-1)
      }
    }
  })

  it('cada classe ocupa a tela de um jeito diferente', () => {
    // Duas classes com a mesma silhueta na tela são a onda 1 desfeita.
    const vistas = new Map()
    for (const classe of ['sword', 'axe', 'pickaxe', 'shovel', 'hoe', 'shears', 'torch']) {
      const { peca } = medir(16 / 9, classe)
      const chave = `${peca.largura.toFixed(3)}|${peca.altura.toFixed(3)}`
      expect(vistas.has(chave), `${classe} ocupa a tela igual a ${vistas.get(chave)}`).toBe(false)
      vistas.set(chave, classe)
    }
  })
})
