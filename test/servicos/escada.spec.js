import { describe, it, expect } from 'vitest'
import { encaixarEscada, orientacaoPeloOlhar, ehItemDeEscada } from '../../src/servicos/escada.js'
import { raycastVoxel } from '../../src/servicos/voxelRaycast.js'
import { CAIXAS_DE_BLOCO } from '../../src/servicos/formas.js'
import { itemDef } from '../../src/servicos/items.js'
import { RECIPES } from '../../src/servicos/recipes.js'
import { BLOCKS, BLOCK_BY_KEY } from '../../src/servicos/blocks.js'
import { direcaoDoOlhar } from '../../src/servicos/aim.js'

// A ESCADA: pra onde ela nasce virada, e o que a mira enxerga.
//
// Orientação é a parte que erra em silêncio: uma escada virada 180° continua
// sendo uma escada, desenha certo, colide certo — e é impossível subir por ela.
// O jogador conclui que a física está quebrada.
//
// Por isso a orientação é testada contra a MESMA função de olhar que a câmera
// usa (`direcaoDoOlhar`), e não contra um seno escrito à mão aqui: duas
// fórmulas independentes pro mesmo vetor já custaram a mira inteira espelhada
// no eixo X neste motor (ver o cabeçalho de `aim.js`).

const escadaDe = (chave) => BLOCK_BY_KEY[chave].id
const orientDe = (id) => BLOCKS[id].escada.orient
const topoDe = (id) => BLOCKS[id].escada.topo

describe('roquecraft - pra onde a escada nasce virada', () => {
  it('o degrau baixo aponta pro JOGADOR, nas quatro direções', () => {
    // yaw 0 olha pro -Z (convenção de `aim.js`). Olhando pro -Z, o bloco está
    // no -Z e o jogador no +Z: o degrau baixo tem que apontar pro +Z, face 4.
    const casos = [
      [0, 4, 'olhando pro -Z'],
      [Math.PI, 5, 'olhando pro +Z'],
      [Math.PI / 2, 1, 'olhando pro +X'],
      [-Math.PI / 2, 0, 'olhando pro -X'],
    ]
    for (const [yaw, esperado, nome] of casos) {
      const d = direcaoDoOlhar(yaw, 0)
      expect(orientacaoPeloOlhar(d.x, d.z), nome).toBe(esperado)
    }
  })

  it('olhar na diagonal escolhe o eixo DOMINANTE, sem empate silencioso', () => {
    expect(orientacaoPeloOlhar(0.9, 0.1)).toBe(1)
    expect(orientacaoPeloOlhar(0.1, 0.9)).toBe(5)
    // Empate exato: o desempate é por X, e é determinístico — sem isto, dois
    // cliques idênticos podiam dar escadas diferentes por ruído de ponto
    // flutuante no yaw.
    expect(orientacaoPeloOlhar(0.5, 0.5)).toBe(orientacaoPeloOlhar(0.5, 0.5))
    expect(orientacaoPeloOlhar(0.5, 0.5)).toBe(1)
  })

  it('a metade segue a MESMA regra da laje', () => {
    const base = { item: 'stoneStairs', destino: { x: 1, y: 2, z: 3 }, dirX: 1, dirZ: 0 }
    expect(topoDe(encaixarEscada({ ...base, face: 2, pontoY: 3 }).id), 'clicou em cima').toBe(false)
    expect(topoDe(encaixarEscada({ ...base, face: 3, pontoY: 2 }).id), 'clicou embaixo').toBe(true)
    expect(topoDe(encaixarEscada({ ...base, face: 0, pontoY: 2.2 }).id), 'lateral baixa').toBe(
      false,
    )
    expect(topoDe(encaixarEscada({ ...base, face: 0, pontoY: 2.8 }).id), 'lateral alta').toBe(true)
  })

  it('a célula é a vizinha, e o id é a variante certa', () => {
    const r = encaixarEscada({
      item: 'oakStairs',
      face: 2,
      pontoY: 5,
      destino: { x: 7, y: 5, z: -2 },
      dirX: 0,
      dirZ: -1,
    })
    expect([r.x, r.y, r.z]).toEqual([7, 5, -2])
    expect(orientDe(r.id)).toBe(4)
    expect(topoDe(r.id)).toBe(false)
    expect(BLOCKS[r.id].drops).toBe('oakStairs')
  })

  it('item que não é escada devolve null e o caminho normal segue', () => {
    const base = { face: 2, pontoY: 3, destino: { x: 0, y: 0, z: 0 }, dirX: 1, dirZ: 0 }
    expect(encaixarEscada({ ...base, item: 'stone' })).toBeNull()
    expect(encaixarEscada({ ...base, item: 'stoneSlab' })).toBeNull()
    expect(ehItemDeEscada('stoneStairs')).toBe(true)
    expect(ehItemDeEscada('stone')).toBe(false)
  })

  it('só a variante canônica é item, e todas as oito dropam ela', () => {
    expect(itemDef('stoneStairs'), 'a peça sumiu do inventário').toBeTruthy()
    expect(itemDef('stoneStairsNx'), 'orientação virou item e multiplicou a peça').toBeNull()
    expect(itemDef('stoneStairsTopo')).toBeNull()
    for (const b of Object.values(BLOCKS)) {
      if (b.escada && b.drops === 'stoneStairs') continue
      if (b.escada) expect(b.drops, `${b.key} dropa outra coisa`).toBeTruthy()
    }
  })

  it('seis blocos em degrau dão QUATRO escadas', () => {
    const r = RECIPES.find((x) => x.result === 'stoneStairs')
    expect(r).toBeTruthy()
    expect(r.count).toBe(4)
    expect(r.pattern).toEqual(['M  ', 'MM ', 'MMM'])
  })
})

describe('roquecraft - a mira enxerga a forma', () => {
  // Um mundo de uma célula só: (0,0,0) tem a forma sob teste, o resto é ar.
  const mundoCom = (id) => ({
    solido: (x, y, z) => (x === 0 && y === 0 && z === 0 ? 1 : 0),
    caixas: (x, y, z) => (x === 0 && y === 0 && z === 0 ? CAIXAS_DE_BLOCO[id] : null),
  })
  const mirar = (id, origin, dir) => {
    const m = mundoCom(id)
    return raycastVoxel(origin, dir, m.solido, 12, m.caixas)
  }
  const cheio = BLOCK_BY_KEY.stone.id
  const laje = BLOCK_BY_KEY.stoneSlab.id
  // Degrau baixo pro -Z: a parte alta ocupa z de 0,5 a 1.
  const escadaNz = escadaDe('stoneStairsNz')

  it('cubo cheio continua sendo acertado como sempre', () => {
    const r = mirar(cheio, { x: 0.5, y: 0.5, z: 5 }, { x: 0, y: 0, z: -1 })
    expect(r, 'errou o cubo').toBeTruthy()
    expect([r.hit.x, r.hit.y, r.hit.z]).toEqual([0, 0, 0])
    expect(r.normal.z, 'entrou pela face +Z').toBe(1)
  })

  it('mirar ACIMA de uma laje atravessa — e sem a forma, não atravessaria', () => {
    // Raio na altura 0,75: passa por cima da laje, que termina em 0,5.
    const raso = { x: 0.5, y: 0.75, z: 5 }
    const dir = { x: 0, y: 0, z: -1 }
    expect(mirar(laje, raso, dir), 'a mira acertou o vazio acima da laje').toBeNull()
    // A REGRA ANTIGA: sem o acessor de caixas, a célula é acertada inteira.
    const m = mundoCom(laje)
    expect(raycastVoxel(raso, dir, m.solido, 12), 'o teste não distingue nada').toBeTruthy()
  })

  it('mirar NA laje acerta, e a face é a da CAIXA', () => {
    const r = mirar(laje, { x: 0.5, y: 0.25, z: 5 }, { x: 0, y: 0, z: -1 })
    expect(r).toBeTruthy()
    expect(r.normal.z).toBe(1)
    // O ponto de impacto tem que cair na lateral da laje, não no plano da
    // célula lá longe: é ele que decide a metade no encaixe.
    expect(r.point.z).toBeCloseTo(1, 6)
  })

  it('mirar de cima acerta o TAMPO da laje, em y = 0,5', () => {
    const r = mirar(laje, { x: 0.5, y: 5, z: 0.5 }, { x: 0, y: -1, z: 0 })
    expect(r).toBeTruthy()
    expect(r.normal.y, 'entrou pelo topo').toBe(1)
    expect(r.point.y, 'o tampo da laje está na metade da célula').toBeCloseTo(0.5, 6)
  })

  it('o VÃO da escada deixa o raio passar', () => {
    // Degrau baixo pro -Z: em z ≈ 0,25 e y ≈ 0,75 a célula está vazia.
    const r = mirar(escadaNz, { x: 0.5, y: 0.75, z: 0.25 }, { x: 1, y: 0, z: 0 })
    expect(r, 'o vão do degrau bloqueou a mira').toBeNull()
  })

  it('a parte ALTA da escada bloqueia, na altura certa', () => {
    const r = mirar(escadaNz, { x: 0.5, y: 0.75, z: 5 }, { x: 0, y: 0, z: -1 })
    expect(r, 'a parte alta não bloqueou').toBeTruthy()
    expect(r.point.z, 'a parte alta começa em z = 1 vindo do +Z').toBeCloseTo(1, 6)
  })

  it('o degrau BAIXO bloqueia rasante, e o tampo dele fica no meio da célula', () => {
    const r = mirar(escadaNz, { x: 0.5, y: 5, z: 0.25 }, { x: 0, y: -1, z: 0 })
    expect(r).toBeTruthy()
    expect(r.normal.y).toBe(1)
    expect(r.point.y, 'o degrau baixo termina em 0,5').toBeCloseTo(0.5, 6)
  })

  it('a mira por forma não muda nada onde não há forma', () => {
    // Prova de vida ao contrário: o caminho novo tem que dar EXATAMENTE o mesmo
    // resultado do antigo quando a célula é cubo. Se divergir, a mudança está
    // cobrando de todo bloco do mundo pra atender dois.
    const m = mundoCom(cheio)
    const origem = { x: 0.3, y: 0.7, z: 4 }
    const dir = { x: 0.05, y: -0.02, z: -1 }
    const antigo = raycastVoxel(origem, dir, m.solido, 12)
    const novo = raycastVoxel(origem, dir, m.solido, 12, m.caixas)
    expect(novo.hit).toEqual(antigo.hit)
    expect(novo.normal).toEqual(antigo.normal)
    expect(novo.distance).toBeCloseTo(antigo.distance, 9)
  })
})

describe('escada — o eixo dominante e a linha do meio', () => {
  const base = { item: 'stoneStairs', destino: { x: 1, y: 2, z: 3 }, dirX: 1, dirZ: 0 }

  it('olhar em 45° exato escolhe o eixo X, não o Z', () => {
    // `Math.abs(dirX) >= Math.abs(dirZ)`: no empate exato — a diagonal
    // perfeita, que é o que sai de um yaw de 45° — o `>=` manda no X. Apertado
    // para `>`, o empate cai no Z e a escada nasce virada 90° errada
    // exatamente na direção mais comum de se olhar num canto.
    expect(orientacaoPeloOlhar(1, 1)).toBe(1)
    expect(orientacaoPeloOlhar(-1, 1)).toBe(0)
    expect(orientacaoPeloOlhar(-1, -1)).toBe(0)
    expect(orientacaoPeloOlhar(1, -1)).toBe(1)
  })

  it('olhar sem componente em X nenhum cai no Z', () => {
    expect(orientacaoPeloOlhar(0, 1)).toBe(5)
    expect(orientacaoPeloOlhar(0, -1)).toBe(4)
  })

  it('o sinal do X decide o lado do degrau', () => {
    // `dirX > 0` invertido faz a escada nascer de costas: ela desenha certo,
    // colide certo, e é impossível subir por ela.
    expect(orientacaoPeloOlhar(0.5, 0.2)).toBe(1)
    expect(orientacaoPeloOlhar(-0.5, 0.2)).toBe(0)
  })

  it('clique NA linha do meio da face lateral assenta a escada no chão', () => {
    // `alturaNaCelula(pontoY) > 0.5`. Afrouxado para `>=`, o clique no ponto
    // médio nasce invertido no teto — mesma regra da laje, e de propósito.
    expect(topoDe(encaixarEscada({ ...base, face: 0, pontoY: 2.5 }).id)).toBe(false)
    expect(topoDe(encaixarEscada({ ...base, face: 0, pontoY: 2.5000001 }).id)).toBe(true)
  })

  it('a face de cima ignora a altura do clique', () => {
    // `face !== 2` é o que impede a altura de mandar quando a face já decidiu.
    // Invertido, clicar no TOPO de um bloco passa a consultar a altura — que
    // ali é sempre 1 — e toda escada nasce de cabeça pra baixo.
    expect(topoDe(encaixarEscada({ ...base, face: 2, pontoY: 3 }).id)).toBe(false)
  })
})
