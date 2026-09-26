//
// BLOCOS CAINDO — as malhas da areia no ar.
//
// Uma malha por queda, tiradas de uma piscina que nunca encolhe: criar e
// destruir geometria a cada bloco que cai enche o coletor de lixo e faz o
// quadro engasgar exatamente quando a duna desmorona, que é quando mais se
// olha pra tela.
//
// ⚠️ O material é o DO MUNDO, e material do mundo exige os atributos do mundo.
// Uma BoxGeometry crua não tem aLayer/aLight/aTint/aWind: o shader lê 0 em
// tudo, amostra a camada 0 com luz 0, e sai um cubo PRETO. Foi o que o QA de
// 20/08/2026 fotografou na mão do jogador, e o mesmo erro estava a um passo de
// se repetir aqui.
//
// A ordem das faces da BoxGeometry (+x, −x, +y, −y, +z, −z, 4 vértices cada) é
// a MESMA de FACE_LAYERS. Não é coincidência conveniente: é o que permite
// copiar as camadas por face direto, sem tabela de tradução.
//
import { FACE_LAYERS } from '../blocks.js'
import { cuboParaVoxel } from './voxelMaterial.js'

function novaMalha(THREE, material) {
  // A lista de atributos pertence ao shader, e mora com ele.
  const geo = cuboParaVoxel(THREE, 1)
  const m = new THREE.Mesh(geo, material)
  m.visible = false
  m.frustumCulled = false
  return m
}

function pintar(malha, id) {
  const L = malha.geometry.getAttribute('aLayer')
  for (let f = 0; f < 6; f++) {
    const camada = FACE_LAYERS[id * 6 + f]
    for (let v = 0; v < 4; v++) L.array[f * 4 + v] = camada
  }
  L.needsUpdate = true
}

export function criarBlocosCaindo(THREE, material) {
  const grupo = new THREE.Group()
  const piscina = []
  const pintadas = [] // id atualmente pintado em cada malha da piscina

  /** Espelha a lista de quedas nas malhas. Chamar uma vez por quadro. */
  const sincronizar = (quedas) => {
    for (let i = 0; i < quedas.length; i++) {
      let m = piscina[i]
      if (!m) {
        m = novaMalha(THREE, material)
        piscina[i] = m
        pintadas[i] = -1
        grupo.add(m)
      }
      const q = quedas[i]
      if (pintadas[i] !== q.id) {
        pintar(m, q.id)
        pintadas[i] = q.id
      }
      m.position.set(q.x + 0.5, q.y + 0.5, q.z + 0.5)
      m.visible = true
    }
    for (let i = quedas.length; i < piscina.length; i++) piscina[i].visible = false
  }

  const descartar = () => {
    for (const m of piscina) {
      m.geometry.dispose()
      grupo.remove(m)
    }
    piscina.length = 0
    pintadas.length = 0
  }

  return {
    grupo,
    sincronizar,
    descartar,
    get malhas() {
      return piscina.length
    },
  }
}
