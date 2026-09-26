import { describe, it, expect } from 'vitest'

// A superfície REAL do módulo: `fApp`, `fAuth`, `fAnalytics`, `fDb`, `fStore`,
// `fStorage`, `fFunctions`. Já esteve dublado como `db`/`auth`/`default`, que o
// módulo não tem -- quem importasse o nome de verdade recebia `undefined`.

import { criarBlocosCaindo } from '../../src/servicos/render/blocosCaindo.js'
import { FACE_LAYERS, ID } from '../../src/servicos/blocks.js'

/**
 * THREE de mentira, só o que o módulo toca. Fingir a biblioteca inteira seria
 * fingir o teste; aqui só existe o que o código de fato usa, e qualquer uso
 * novo estoura na hora em vez de passar batido.
 */
function fakeThree() {
  class BufferAttribute {
    constructor(array, itemSize, normalized = false) {
      this.array = array
      this.itemSize = itemSize
      this.normalized = normalized
      this.count = array.length / itemSize
      this.needsUpdate = false
    }
  }
  class BufferGeometry {
    constructor() {
      this.attributes = {}
      this.descartada = false
    }
    setAttribute(nome, attr) {
      this.attributes[nome] = attr
    }
    getAttribute(nome) {
      return this.attributes[nome]
    }
    dispose() {
      this.descartada = true
    }
  }
  class BoxGeometry extends BufferGeometry {
    constructor(w, h, d) {
      super()
      this.parametros = [w, h, d]
      // 6 faces × 4 vértices, como a BoxGeometry de verdade.
      this.setAttribute('position', new BufferAttribute(new Float32Array(24 * 3), 3))
    }
  }
  class Group {
    constructor() {
      this.children = []
    }
    add(...o) {
      this.children.push(...o)
    }
    remove(o) {
      const i = this.children.indexOf(o)
      if (i >= 0) this.children.splice(i, 1)
    }
  }
  class Mesh {
    constructor(geometry, material) {
      this.geometry = geometry
      this.material = material
      this.visible = true
      this.frustumCulled = true
      this.position = {
        x: 0,
        y: 0,
        z: 0,
        set(x, y, z) {
          this.x = x
          this.y = y
          this.z = z
        },
      }
    }
  }
  return { BufferAttribute, BufferGeometry, BoxGeometry, Group, Mesh }
}

const material = { fake: true }

// ⚠️ A PROVA DE QUE O THREE DE MENTIRA E MESMO O USADO.
//
// O modulo recebe a biblioteca por PARAMETRO de proposito -- e o teste so vale
// se ele de fato usar a que recebeu. Quando o cubo saiu daqui pra
// `voxelMaterial.cuboParaVoxel`, a primeira versao importava o `three` de
// verdade la dentro: o teste continuava VERDE, porque o three real tambem
// funciona. Um dublê que pode ser ignorado sem ninguem notar nao e dublê, e
// enfeite.
//
// Esta afirmacao fecha a porta: a geometria criada tem que ser da classe DESTE
// arquivo, e nada mais.
describe('o THREE injetado e o que o modulo usa', () => {
  it('a geometria do bloco que cai vem do dublê, e nao do three de verdade', () => {
    const T = fakeThree()
    const bc = criarBlocosCaindo(T, material)
    bc.sincronizar([{ id: ID.sand, x: 0, y: 10, z: 0 }])
    const malha = bc.grupo.children[0]
    expect(malha.geometry).toBeInstanceOf(T.BoxGeometry)
    // E o cubo do mundo tem aresta 1: se virar outro tamanho, ele deixa de
    // ocupar a celula que o bloco ocupava.
    expect(malha.geometry.parametros).toEqual([1, 1, 1])
  })

  it('o cubo chega com os quatro atributos que o shader le', () => {
    const T = fakeThree()
    const bc = criarBlocosCaindo(T, material)
    bc.sincronizar([{ id: ID.sand, x: 0, y: 10, z: 0 }])
    const geo = bc.grupo.children[0].geometry
    for (const nome of ['aLayer', 'aLight', 'aTint', 'aWind']) {
      expect(geo.getAttribute(nome), `faltou ${nome}`).toBeTruthy()
    }
    // Ceu cheio e AO cheio: o cubo acompanha a luz do dia como o mundo.
    const luz = geo.getAttribute('aLight')
    expect(luz.array[0]).toBe(255)
    expect(luz.array[1]).toBe(255)
    expect(luz.array[2]).toBe(0)
  })
})

describe('blocos caindo — os atributos que o material do mundo exige', () => {
  it('a malha traz aLayer, aLight, aTint e aWind', () => {
    const bc = criarBlocosCaindo(fakeThree(), material)
    bc.sincronizar([{ id: ID.sand, x: 0, y: 10, z: 0 }])
    const g = bc.grupo.children[0].geometry
    for (const nome of ['aLayer', 'aLight', 'aTint', 'aWind']) {
      expect(g.getAttribute(nome), nome).toBeTruthy()
      expect(g.getAttribute(nome).count).toBe(24)
    }
  })

  it('CUBO PRETO: luz e tint cheios, senão o shader amostra com luz zero', () => {
    // ⚠️ O defeito que este teste existe pra impedir tem foto: 20/08/2026, a mão
    // do jogador entrou no quadro como um cubo PRETO ocupando um terço da tela.
    // Não era o modelo nem a textura — era `aLight` ausente, lido como 0.
    const bc = criarBlocosCaindo(fakeThree(), material)
    bc.sincronizar([{ id: ID.sand, x: 0, y: 10, z: 0 }])
    const g = bc.grupo.children[0].geometry
    const luz = g.getAttribute('aLight').array
    const tint = g.getAttribute('aTint').array
    for (let i = 0; i < 24; i++) {
      expect(luz[i * 3]).toBe(255) // AO cheio
      expect(luz[i * 3 + 1]).toBe(255) // céu cheio
      expect(tint[i * 3]).toBe(255)
      expect(tint[i * 3 + 1]).toBe(255)
      expect(tint[i * 3 + 2]).toBe(255)
    }
  })

  it('cada face recebe a camada de textura DAQUELE bloco, na ordem da BoxGeometry', () => {
    const bc = criarBlocosCaindo(fakeThree(), material)
    bc.sincronizar([{ id: ID.sand, x: 0, y: 10, z: 0 }])
    const L = bc.grupo.children[0].geometry.getAttribute('aLayer').array
    for (let f = 0; f < 6; f++) {
      const esperado = FACE_LAYERS[ID.sand * 6 + f]
      for (let v = 0; v < 4; v++) expect(L[f * 4 + v]).toBe(esperado)
    }
  })

  it('cascalho e areia não desenham com a mesma camada', () => {
    // Prova de vida da camada: se o emissor ignorasse o id e pintasse sempre a
    // camada 0, este teste passaria em tudo e não veria nada. Duas areias
    // diferentes têm que sair diferentes.
    const bc = criarBlocosCaindo(fakeThree(), material)
    bc.sincronizar([{ id: ID.sand, x: 0, y: 10, z: 0 }])
    const daAreia = [...bc.grupo.children[0].geometry.getAttribute('aLayer').array]
    bc.sincronizar([{ id: ID.gravel, x: 0, y: 10, z: 0 }])
    const doCascalho = [...bc.grupo.children[0].geometry.getAttribute('aLayer').array]
    expect(doCascalho).not.toEqual(daAreia)
  })
})

describe('blocos caindo — a piscina de malhas', () => {
  it('reusa malha em vez de criar uma por queda', () => {
    const bc = criarBlocosCaindo(fakeThree(), material)
    bc.sincronizar([
      { id: ID.sand, x: 0, y: 10, z: 0 },
      { id: ID.sand, x: 1, y: 10, z: 0 },
    ])
    expect(bc.malhas).toBe(2)
    bc.sincronizar([{ id: ID.sand, x: 0, y: 9, z: 0 }])
    expect(bc.malhas).toBe(2) // não encolhe: criar e destruir enche o coletor
    bc.sincronizar([
      { id: ID.sand, x: 0, y: 8, z: 0 },
      { id: ID.sand, x: 1, y: 8, z: 0 },
      { id: ID.sand, x: 2, y: 8, z: 0 },
    ])
    expect(bc.malhas).toBe(3)
  })

  it('a malha que sobra fica INVISÍVEL, não pousada no ar', () => {
    // Sem esconder, a areia que já pousou continuaria desenhada boiando onde
    // estava — e o jogador veria dois blocos onde só existe um.
    const bc = criarBlocosCaindo(fakeThree(), material)
    bc.sincronizar([
      { id: ID.sand, x: 0, y: 10, z: 0 },
      { id: ID.sand, x: 1, y: 10, z: 0 },
    ])
    bc.sincronizar([{ id: ID.sand, x: 0, y: 9, z: 0 }])
    expect(bc.grupo.children[0].visible).toBe(true)
    expect(bc.grupo.children[1].visible).toBe(false)
  })

  it('a posição é o CENTRO da célula', () => {
    const bc = criarBlocosCaindo(fakeThree(), material)
    bc.sincronizar([{ id: ID.sand, x: 3, y: 10.25, z: -4 }])
    const p = bc.grupo.children[0].position
    expect([p.x, p.y, p.z]).toEqual([3.5, 10.75, -3.5])
  })

  it('descartar solta as geometrias', () => {
    const bc = criarBlocosCaindo(fakeThree(), material)
    bc.sincronizar([{ id: ID.sand, x: 0, y: 10, z: 0 }])
    const g = bc.grupo.children[0].geometry
    bc.descartar()
    expect(g.descartada).toBe(true)
    expect(bc.malhas).toBe(0)
  })
})
