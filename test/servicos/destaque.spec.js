import { describe, it, expect } from 'vitest'
import { caixasDe, criarDestaque } from '../../src/servicos/render/destaque.js'
import { CAIXAS_DE_BLOCO } from '../../src/servicos/formas.js'
import { BLOCK_BY_KEY } from '../../src/servicos/blocks.js'

// ⚠️ ESTE ARQUIVO NAO EXISTIA. `destaque.js` era o ultimo servico do jogo com
// regra de verdade e nenhum teste -- e as duas regras dele, diz o proprio
// cabecalho, "foram aprendidas apanhando".
//
// A que mais importa: O CONTORNO SEGUE A FORMA, nao o cubo. Enquanto tudo era
// cubo, uma moldura 1x1x1 servia. Desde a laje, a escada e a cama, cercar o cubo
// inteiro numa peca de meia altura faz o jogador ver a mira "pegando" ar -- e
// ele aprende a mirar deslocado, que e o pior tipo de erro de interface: ensina.

/** THREE de mentira, so o que este modulo toca. */
function fakeThree() {
  class Vector3 {
    constructor(x = 0, y = 0, z = 0) {
      Object.assign(this, { x, y, z })
    }
    set(x, y, z) {
      Object.assign(this, { x, y, z })
      return this
    }
  }
  class BufferGeometry {
    constructor() {
      this.caixas = []
      this.boundingBox = null
      this.descartada = false
    }
    computeBoundingBox() {
      const min = new Vector3(Infinity, Infinity, Infinity)
      const max = new Vector3(-Infinity, -Infinity, -Infinity)
      for (const c of this.caixas) {
        min.x = Math.min(min.x, c.cx - c.sx / 2)
        min.y = Math.min(min.y, c.cy - c.sy / 2)
        min.z = Math.min(min.z, c.cz - c.sz / 2)
        max.x = Math.max(max.x, c.cx + c.sx / 2)
        max.y = Math.max(max.y, c.cy + c.sy / 2)
        max.z = Math.max(max.z, c.cz + c.sz / 2)
      }
      this.boundingBox = { min, max }
    }
    translate(x, y, z) {
      for (const c of this.caixas) {
        c.cx += x
        c.cy += y
        c.cz += z
      }
      return this
    }
    dispose() {
      this.descartada = true
    }
  }
  class BoxGeometry extends BufferGeometry {
    constructor(sx, sy, sz) {
      super()
      this.caixas = [{ cx: 0, cy: 0, cz: 0, sx, sy, sz }]
    }
  }
  class Mesh {
    constructor(geometry, material) {
      this.geometry = geometry
      this.material = material
      this.renderOrder = 0
    }
  }
  class Group {
    constructor() {
      this.children = []
      this.visible = true
      this.position = new Vector3()
    }
    add(...f) {
      this.children.push(...f)
    }
  }
  class MeshBasicMaterial {
    constructor(o) {
      Object.assign(this, o)
      this.descartado = false
    }
    dispose() {
      this.descartado = true
    }
  }
  return { Vector3, BufferGeometry, BoxGeometry, Mesh, Group, MeshBasicMaterial }
}

/** Junta as caixas de varias geometrias numa so — o que `mergeGeometries` faz. */
function fakeMerge(lista) {
  const T = fakeThree()
  const g = new T.BufferGeometry()
  for (const parte of lista) g.caixas.push(...parte.caixas)
  return g
}

const montar = () => criarDestaque(fakeThree(), fakeMerge)

describe('caixasDe: errar pra MAIS e inofensivo, errar pra MENOS mente', () => {
  it('id desconhecido cai no cubo inteiro, e nao na lista vazia', () => {
    // Lista vazia some o contorno inteiro, e o jogador conclui que a mira nao
    // pega nada ali -- quando pega.
    expect(caixasDe(9999)).toEqual([[0, 0, 0, 1, 1, 1]])
    expect(caixasDe(undefined)).toEqual([[0, 0, 0, 1, 1, 1]])
  })

  it('bloco com forma declarada usa a forma declarada', () => {
    const laje = BLOCK_BY_KEY.stoneSlab.id
    const forma = CAIXAS_DE_BLOCO[laje]
    expect(Array.isArray(forma), 'a laje precisa ter forma propria').toBe(true)
    expect(forma.length).toBeGreaterThan(0)
    expect(caixasDe(laje)).toBe(forma)
  })

  it('a fonte e a MESMA que a fisica usa, e nao uma copia', () => {
    // "Se um dia divergirem, o contorno passa a mentir de novo" -- cabecalho.
    for (const b of Object.values(BLOCK_BY_KEY)) {
      const c = CAIXAS_DE_BLOCO[b.id]
      if (Array.isArray(c) && c.length) expect(caixasDe(b.id)).toBe(c)
    }
  })
})

describe('o contorno segue a FORMA, e nao o cubo', () => {
  const caixaDe = (chave) => {
    const d = montar()
    d.apontarPara(BLOCK_BY_KEY[chave].id, 0, 0, 0)
    return d.caixaDaMalha
  }

  it('a moldura do cubo ocupa a celula inteira', () => {
    const c = caixaDe('stone')
    expect(c[1]).toBeCloseTo(0, 1)
    expect(c[4]).toBeCloseTo(1, 1)
  })

  it('a moldura da LAJE para na metade -- nao cerca ar', () => {
    // Este numero e a regra inteira: 1 aqui significa mira pegando ar.
    const c = caixaDe('stoneSlab')
    expect(c[4]).toBeLessThan(0.75)
    expect(c[4]).toBeGreaterThan(0.25)
  })

  it('a laje de CIMA fica em cima, e nao embaixo', () => {
    const c = caixaDe('stoneSlabTopo')
    expect(c[1]).toBeGreaterThan(0.25)
    expect(c[4]).toBeCloseTo(1, 1)
  })

  it('cubo e laje NAO tem a mesma moldura', () => {
    // Contar vertice diria que sao iguais (uma caixa, seis faces). O que muda e
    // ONDE eles estao -- e por isso a medida e a caixa, e nao a contagem.
    expect(caixaDe('stone')).not.toEqual(caixaDe('stoneSlab'))
  })
})

describe('o cache de formas', () => {
  it('voltar pra uma forma ja vista REUSA a geometria, e nao monta outra', () => {
    // ⚠️ CONTAR O CACHE NAO PROVA ISTO, e um mutante mostrou: `monta()` faz
    // `cache.set` no fim, entao remontar toda vez mantem o TAMANHO do mapa
    // igual. O que muda e a instancia -- e geometria remontada a cada troca de
    // mira e alocacao de GPU a cada bloco que o jogador olha, centenas por
    // minuto.
    const d = montar()
    const pedra = BLOCK_BY_KEY.stone.id
    d.apontarPara(pedra, 0, 0, 0)
    const primeira = d.grupo.children[0].geometry
    d.apontarPara(BLOCK_BY_KEY.stoneSlab.id, 0, 0, 0)
    d.apontarPara(pedra, 0, 0, 0)
    expect(d.grupo.children[0].geometry).toBe(primeira)
  })

  it('formas diferentes entram no cache separadas', () => {
    const d = montar()
    d.apontarPara(BLOCK_BY_KEY.stone.id, 0, 0, 0)
    const n = d.formasEmCache
    d.apontarPara(BLOCK_BY_KEY.stoneSlab.id, 0, 0, 0)
    expect(d.formasEmCache).toBeGreaterThan(n)
  })

  it('descartar solta TODAS as geometrias e os dois materiais', () => {
    // Trocar de forma sem soltar a antiga vaza memoria de GPU a cada bloco
    // diferente que o jogador mira -- e ele mira centenas por minuto.
    const d = montar()
    d.apontarPara(BLOCK_BY_KEY.stone.id, 0, 0, 0)
    d.apontarPara(BLOCK_BY_KEY.stoneSlab.id, 0, 0, 0)
    const geos = d.grupo.children.map((m) => m.geometry)
    const mats = d.grupo.children.map((m) => m.material)
    d.descartar()
    expect(d.formasEmCache).toBe(0)
    expect(geos.every((g) => g.descartada)).toBe(true)
    expect(mats.every((m) => m.descartado)).toBe(true)
  })
})

describe('onde o contorno aparece', () => {
  it('nasce escondido: sem mira, sem contorno', () => {
    expect(montar().grupo.visible).toBe(false)
  })

  it('vai pro CENTRO da celula apontada, e nao pro canto dela', () => {
    // No canto, a moldura fica meio bloco deslocada -- e cerca o vizinho.
    const d = montar()
    d.apontarPara(BLOCK_BY_KEY.stone.id, 10, 64, -3)
    expect([d.grupo.position.x, d.grupo.position.y, d.grupo.position.z]).toEqual([10.5, 64.5, -2.5])
    expect(d.grupo.visible).toBe(true)
  })

  it('esconder some com ele', () => {
    const d = montar()
    d.apontarPara(BLOCK_BY_KEY.stone.id, 0, 0, 0)
    d.esconder()
    expect(d.grupo.visible).toBe(false)
  })
})

describe('as DUAS molduras concentricas', () => {
  it('sao duas, e nao uma', () => {
    // Uma cor so some contra o fundo da mesma cor: preto sobre obsidiana e
    // invisivel, branco sobre neve idem. E o mesmo truque do cursor do sistema.
    const d = montar()
    expect(d.grupo.children).toHaveLength(2)
  })

  it('a escura e escura e a clara e clara, e a clara desenha por cima', () => {
    const d = montar()
    const [escura, clara] = d.grupo.children
    expect(escura.material.color).toBeLessThan(0x333333)
    expect(clara.material.color).toBeGreaterThan(0xcccccc)
    expect(clara.renderOrder).toBeGreaterThan(escura.renderOrder)
  })

  it('nenhuma das duas escreve profundidade', () => {
    // Com `depthWrite`, o contorno tapa o bloco que ele esta cercando.
    for (const m of montar().grupo.children) expect(m.material.depthWrite).toBe(false)
  })
})
