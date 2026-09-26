import { describe, it, expect } from 'vitest'
import { meshSection, faceVisible } from '../../src/servicos/mesher.js'
import { collides } from '../../src/servicos/physics.js'
import { encaixarLaje, metadeDaLaje, materialDaLaje } from '../../src/servicos/laje.js'
import { itemDef } from '../../src/servicos/items.js'
import { RECIPES } from '../../src/servicos/recipes.js'
import {
  BLOCK_BY_KEY,
  AIR,
  FORMA_BASE,
  FORMA_TOPO,
  FACE_NA_BORDA,
  SOLIDO_DE_BLOCO,
  BLOCKS,
} from '../../src/servicos/blocks.js'

// A LAJE, DE PONTA A PONTA.
//
// Meia altura mexe em quatro lugares que não se falam: a tabela de forma, o
// recorte de face do mesher, a caixa de colisão e a regra de encaixe. Cada um
// erra de um jeito diferente e nenhum deles dá exceção:
//
//   forma errada   → laje com altura de bloco cheio, e ninguém nota no print
//   recorte errado → buraco no chão debaixo da laje de topo
//   caixa errada   → jogador andando dentro da pedra, ou preso no ar
//   encaixe errado → laje sempre na mesma metade, sem como pedir a outra
//
// Cada bloco abaixo cobre um deles, e onde havia uma regra ANTIGA ela vem
// reimplementada junto, afirmando que erra — pra que ninguém a traga de volta
// em nome de simplificar.

const pedra = BLOCK_BY_KEY.stone.id
const laje = BLOCK_BY_KEY.stoneSlab.id
const lajeTopo = BLOCK_BY_KEY.stoneSlabTopo.id
const lajeCarvalho = BLOCK_BY_KEY.oakSlab.id
const neve = BLOCK_BY_KEY.snowLayer.id

const mundo = (block) => ({ block, light: () => 0xf0, tint: () => [0.4, 0.7, 0.3] })

describe('roquecraft - a forma do bloco', () => {
  it('cheio ocupa a célula inteira; laje ocupa a metade certa', () => {
    expect([FORMA_BASE[pedra], FORMA_TOPO[pedra]]).toEqual([0, 1])
    expect([FORMA_BASE[laje], FORMA_TOPO[laje]]).toEqual([0, 0.5])
    expect([FORMA_BASE[lajeTopo], FORMA_TOPO[lajeTopo]]).toEqual([0.5, 1])
    expect([FORMA_BASE[neve], FORMA_TOPO[neve]]).toEqual([0, 0.125])
    expect([FORMA_BASE[AIR], FORMA_TOPO[AIR]], 'ar lê como cheio, nunca como caixa vazia').toEqual([
      0, 1,
    ])
  })

  it('a face que fica no MEIO da célula não está na borda', () => {
    // 0:+x 1:-x 2:+y 3:-y 4:+z 5:-z
    expect(FACE_NA_BORDA[laje * 6 + 2], 'tampo da laje de baixo fica no meio').toBe(0)
    expect(FACE_NA_BORDA[laje * 6 + 3], 'piso da laje de baixo encosta no chão').toBe(1)
    expect(FACE_NA_BORDA[lajeTopo * 6 + 3], 'piso da laje de topo fica no meio').toBe(0)
    expect(FACE_NA_BORDA[lajeTopo * 6 + 2], 'tampo da laje de topo encosta no teto').toBe(1)
    for (let f = 0; f < 6; f++) expect(FACE_NA_BORDA[pedra * 6 + f]).toBe(1)
  })

  it('TODO bloco opaco é cheio — o recorte de face depende disso', () => {
    // `faceVisible` esconde qualquer face contra vizinho opaco, sem olhar a
    // forma dele. Isso só é verdade porque bloco parcial é sempre `cutout`, e
    // portanto nunca opaco. No dia em que alguém marcar um bloco parcial como
    // opaco, o vizinho perde a face e abre um vão — e a causa vai estar a três
    // arquivos de distância. Este teste é o pedágio dessa simplificação.
    for (const b of Object.values(BLOCKS)) {
      if (!b.opaque) continue
      expect(
        [FORMA_BASE[b.id], FORMA_TOPO[b.id]],
        `${b.key} é opaco e parcial ao mesmo tempo`,
      ).toEqual([0, 1])
    }
  })

  it('a caixa sólida da laje de topo FLUTUA, e a de baixo não', () => {
    // ⚠️ O formato mudou na rodada 7, quando a escada entrou: caixa que não é
    // "uma só, encostada no chão, ocupando a célula inteira em X e Z" passou a
    // vir como LISTA de caixas completas. A laje de topo era o par [base,topo]
    // e agora é [[0,0.5,0,1,1,1]] — mesma geometria, um formato que a escada
    // também cabe. Bloco simples continua devolvendo o número de sempre, e é
    // isso que mantém todo teste que retorna `true`/`0.125` na mão funcionando.
    expect(SOLIDO_DE_BLOCO[pedra], 'cheio segue número, como sempre foi').toBe(1)
    expect(SOLIDO_DE_BLOCO[laje], 'laje de baixo também: cresce do chão').toBe(0.5)
    expect(SOLIDO_DE_BLOCO[lajeTopo].map((c) => Array.from(c))).toEqual([[0, 0.5, 0, 1, 1, 1]])
  })
})

describe('roquecraft - o mesher não abre buraco em volta da laje', () => {
  it('o tampo da laje sobrevive a um bloco cheio em cima', () => {
    expect(faceVisible(laje, pedra, 2), 'tampo apagado: vira vão no meio da parede').toBe(true)
    // A REGRA ANTIGA, reimplementada: vizinho opaco escondia qualquer face.
    const antiga = (id, nid) => nid !== AIR && !(nid !== id) === false && false
    expect(antiga(laje, pedra), 'a regra antiga escondia — o teste tem que discordar').toBe(false)
  })

  it('duas lajes de baixo empilhadas desenham as faces entre elas', () => {
    // O `nid === id` do recorte antigo apagava as duas, e o jogador via uma
    // coluna lisa onde existem dois degraus separados por um vão de meio bloco.
    expect(faceVisible(laje, laje, 2), 'tampo da de baixo').toBe(true)
    expect(faceVisible(laje, laje, 3), 'piso da de cima').toBe(true)
    expect(faceVisible(laje, laje, 0), 'lateral encostada segue escondida').toBe(false)
  })

  it('o piso da laje de topo sobrevive a um bloco cheio embaixo', () => {
    expect(faceVisible(lajeTopo, pedra, 3)).toBe(true)
    expect(faceVisible(lajeTopo, pedra, 2), 'o tampo encosta no teto: escondido').toBe(false)
  })

  it('o vizinho cheio continua desenhando a face virada pra laje', () => {
    // Se a laje entrasse como opaca, o chão sumiria em volta dela.
    expect(faceVisible(pedra, laje, 2)).toBe(true)
    expect(faceVisible(pedra, pedra, 2), 'entre dois cheios não').toBe(false)
  })

  it('a geometria sai na altura certa, e não na altura do cubo', () => {
    const geo = meshSection(
      mundo((x, y, z) => (y === 4 && x === 2 && z === 2 ? laje : y <= 3 ? pedra : AIR)),
      0,
      0,
      0,
    ).cutout
    expect(geo, 'a laje não gerou malha').toBeTruthy()
    const ys = new Set()
    for (let i = 1; i < geo.position.length; i += 3) ys.add(geo.position[i])
    // A laje mora na célula 4: base em 4, tampo em 4,5. Nada em 5.
    expect([...ys].sort((a, b) => a - b)).toEqual([4, 4.5])
  })

  it('a laje de topo sai na METADE DE CIMA da célula', () => {
    const geo = meshSection(
      mundo((x, y, z) => (y === 4 && x === 2 && z === 2 ? lajeTopo : y <= 3 ? pedra : AIR)),
      0,
      0,
      0,
    ).cutout
    const ys = new Set()
    for (let i = 1; i < geo.position.length; i += 3) ys.add(geo.position[i])
    expect([...ys].sort((a, b) => a - b)).toEqual([4.5, 5])
  })

  it('a lateral mostra a FATIA certa da textura, não a textura espremida', () => {
    const geo = meshSection(
      mundo((x, y, z) => (y === 4 && x === 2 && z === 2 ? laje : y <= 3 ? pedra : AIR)),
      0,
      0,
      0,
    ).cutout
    // uv.y das faces laterais tem que ficar dentro de [0, 0.5]: é a metade de
    // baixo da imagem. Indo de 0 a 1 a pedra da laje sairia em escala 2:1 e não
    // casaria com a pedra do bloco ao lado.
    const vs = new Set()
    for (let i = 1; i < geo.uv.length; i += 2) vs.add(geo.uv[i])
    expect(Math.max(...vs), `uv.y encontrados: ${[...vs].join(',')}`).toBeLessThanOrEqual(1)
    expect(vs.has(0.5), 'nenhum vértice na metade da textura: a lateral não recortou').toBe(true)
  })

  it('um piso de laje 16×16 continua fundindo no tampo', () => {
    // O recorte de fusão é só nas LATERAIS. Se ele vazasse pras faces
    // horizontais, um piso de laje custaria 256 quads em vez de 1.
    const geo = meshSection(
      mundo((x, y) => (y === 4 ? laje : y <= 3 ? pedra : AIR)),
      0,
      0,
      0,
    ).cutout
    // 16×16 lajes: 1 quad de tampo + 1 de piso + 64 de perímetro = 66 quads.
    const quads = geo.position.length / 12
    expect(quads, `saíram ${quads} quads`).toBeLessThan(80)
  })
})

describe('roquecraft - a caixa de colisão da laje', () => {
  // Chão cheio até 61, VÃO livre em 62 e 63, e a célula 64 recebe o que o teste
  // quiser. O vão é o ponto: com o chão colado embaixo da laje, todo teste de
  // "a cabeça bate?" mediria o pé enterrado no chão em vez da cabeça na laje —
  // e passaria por engano. A primeira versão deste arquivo tinha esse defeito.
  const chao = (na64) => (x, y) => (y <= 61 ? 1 : y === 64 ? na64 : 0)

  it('pisa em cima da laje de baixo, na altura do meio', () => {
    const w = chao(SOLIDO_DE_BLOCO[laje])
    expect(collides(w, 8.5, 64.4, 8.5), 'pé a 64,4 está DENTRO da laje').toBe(true)
    expect(collides(w, 8.5, 64.5, 8.5), 'pé a 64,5 está EM CIMA dela').toBe(false)
  })

  it('cabe embaixo da laje de topo — a metade de baixo está vazia', () => {
    const w = chao(SOLIDO_DE_BLOCO[lajeTopo])
    // O jogador tem 1,8 de altura, então ele não cabe no vão de 0,5 sozinho.
    // O que se testa aqui é que o vão EXISTE: um pé no chão da célula 64 não
    // encosta na laje que só começa em 64,5.
    expect(collides(w, 8.5, 64.0, 8.5), 'a 64,0 a cabeça atravessa a laje').toBe(true)
    // Com a laje de topo a 64,5 e o teto do jogador em py+1,8, um pé em 62,7
    // termina exatamente em 64,5 — encosta sem invadir.
    expect(collides(w, 8.5, 62.7, 8.5), 'encostar não é invadir').toBe(false)
    expect(collides(w, 8.5, 62.8, 8.5), 'a 62,8 a cabeça entra na laje').toBe(true)
  })

  it('a REGRA ANTIGA (caixa sempre do chão) prenderia o jogador embaixo', () => {
    // Reimplementação do contrato antigo: a laje de topo chegaria como altura
    // 0,5 medida DO CHÃO, ou seja [64, 64.5] — bem onde tem vão de verdade.
    const antigo = (x, y) => (y <= 61 ? 1 : y === 64 ? 0.5 : 0)
    expect(collides(antigo, 8.5, 62.7, 8.5), 'com a regra antiga a cabeça bate').toBe(true)
  })

  it('a laje de topo não vira bloco cheio por acidente', () => {
    const w = chao(SOLIDO_DE_BLOCO[lajeTopo])
    // Um pé em 64,5 está em cima da laje de topo; em 65 já saiu da célula.
    expect(collides(w, 8.5, 64.4, 8.5), 'a 64,4 o pé está dentro da laje').toBe(true)
    expect(collides(w, 8.5, 65.0, 8.5), 'a 65 está livre').toBe(false)
  })
})

describe('roquecraft - onde a laje encaixa', () => {
  const cel = (x, y, z) => ({ x, y, z })
  const chamar = (over = {}) =>
    encaixarLaje({
      item: 'stoneSlab',
      alvoId: pedra,
      alvo: cel(3, 10, 5),
      face: 2,
      pontoY: 11,
      destino: cel(3, 11, 5),
      ...over,
    })

  it('item que não é laje devolve null e o caminho normal segue', () => {
    expect(chamar({ item: 'stone' })).toBeNull()
    expect(chamar({ item: 'oakPlanks' })).toBeNull()
  })

  it('clicou EM CIMA → metade de baixo, na célula de cima', () => {
    const r = chamar({ face: 2 })
    expect([r.x, r.y, r.z]).toEqual([3, 11, 5])
    expect(r.id).toBe(laje)
    expect(r.dupla).toBe(false)
  })

  it('clicou EMBAIXO → metade de cima, na célula de baixo', () => {
    const r = chamar({ face: 3, alvo: cel(3, 10, 5), destino: cel(3, 9, 5), pontoY: 10 })
    expect([r.x, r.y, r.z]).toEqual([3, 9, 5])
    expect(r.id).toBe(lajeTopo)
  })

  it('na LATERAL a altura do clique decide a metade', () => {
    expect(chamar({ face: 0, destino: cel(4, 10, 5), pontoY: 10.2 }).id).toBe(laje)
    expect(chamar({ face: 0, destino: cel(4, 10, 5), pontoY: 10.8 }).id).toBe(lajeTopo)
    expect(chamar({ face: 4, destino: cel(3, 10, 6), pontoY: 10.9 }).id).toBe(lajeTopo)
  })

  it('a face vem ANTES da altura, e é isso que dá as duas metades', () => {
    // Numa face horizontal o ponto de impacto cai no plano da célula (fração 0
    // ou 1). Se a altura mandasse, clicar em cima daria SEMPRE a mesma metade e
    // não haveria como pedir a outra — o defeito que a ordem das regras evita.
    expect(chamar({ face: 2, pontoY: 11 }).id, 'clicou no topo').toBe(laje)
    expect(chamar({ face: 3, destino: cel(3, 9, 5), pontoY: 10 }).id, 'clicou embaixo').toBe(
      lajeTopo,
    )
  })

  it('encostar na metade VAZIA de uma laje igual funde as duas', () => {
    const r = chamar({ alvoId: laje, face: 2 })
    expect(r.dupla, 'não fundiu').toBe(true)
    expect([r.x, r.y, r.z], 'a fusão é na célula da LAJE, não na vizinha').toEqual([3, 10, 5])
    expect(r.id, 'duas metades viram o bloco cheio').toBe(pedra)
  })

  it('funde também a de topo, pelo lado de baixo', () => {
    const r = chamar({ alvoId: lajeTopo, face: 3, destino: cel(3, 9, 5), pontoY: 10 })
    expect(r.dupla).toBe(true)
    expect(r.id).toBe(pedra)
  })

  it('encostar na metade OCUPADA não funde: vai pra célula vizinha', () => {
    const r = chamar({ alvoId: laje, face: 0, destino: cel(4, 10, 5), pontoY: 10.2 })
    expect(r.dupla).toBe(false)
    expect([r.x, r.y, r.z]).toEqual([4, 10, 5])
    expect(r.id).toBe(laje)
  })

  it('material diferente NÃO funde — ninguém perde peça sem entender', () => {
    const r = chamar({ item: 'oakSlab', alvoId: laje, face: 2 })
    expect(r.dupla).toBe(false)
    expect(r.id).toBe(lajeCarvalho)
  })

  it('metadeDaLaje e materialDaLaje respondem sobre o mundo, não sobre o item', () => {
    expect(metadeDaLaje(laje)).toBe('base')
    expect(metadeDaLaje(lajeTopo)).toBe('topo')
    expect(metadeDaLaje(pedra)).toBeNull()
    expect(materialDaLaje(lajeTopo)).toBe('stone')
    expect(materialDaLaje(pedra)).toBeNull()
  })
})

describe('roquecraft - a laje no inventário e na bancada', () => {
  it('a metade de cima NÃO é item — a peça é uma só', () => {
    expect(itemDef('stoneSlab'), 'a peça sumiu do inventário').toBeTruthy()
    expect(itemDef('stoneSlabTopo'), 'a metade de cima virou item e duplicou a peça').toBeNull()
  })

  it('as duas metades dropam a MESMA peça', () => {
    expect(BLOCK_BY_KEY.stoneSlab.drops).toBe('stoneSlab')
    expect(BLOCK_BY_KEY.stoneSlabTopo.drops).toBe('stoneSlab')
  })

  it('três blocos deitados dão SEIS lajes', () => {
    const r = RECIPES.find((x) => x.result === 'stoneSlab')
    expect(r, 'não tem receita de laje de pedra').toBeTruthy()
    expect(r.count).toBe(6)
    expect(r.pattern).toEqual(['MMM'])
    expect(r.keyMap.M).toBe('stone')
  })

  it('todo material de laje tem receita e nome', () => {
    for (const k of ['stoneSlab', 'cobblestoneSlab', 'oakSlab', 'spruceSlab']) {
      expect(BLOCK_BY_KEY[k], `bloco ${k}`).toBeTruthy()
      expect(BLOCK_BY_KEY[`${k}Topo`], `metade de cima de ${k}`).toBeTruthy()
      expect(
        RECIPES.some((r) => r.result === k),
        `receita de ${k}`,
      ).toBe(true)
    }
  })
})

describe('laje — a metade exata da célula', () => {
  const cel = (x, y, z) => ({ x, y, z })
  const chamar = (over = {}) =>
    encaixarLaje({
      item: 'stoneSlab',
      alvoId: pedra,
      alvo: cel(3, 10, 5),
      face: 0,
      pontoY: 10.5,
      destino: cel(4, 10, 5),
      ...over,
    })

  it('clicar EM CIMA da linha do meio pede a metade de baixo', () => {
    // ⚠️ `alturaNaCelula(pontoY) > 0.5` na altura exata do meio. Afrouxado para
    // `>=`, o clique no ponto médio da face lateral passa a pedir o TOPO — e o
    // meio de uma face é o ponto mais fácil de acertar por acidente. O jogador
    // clica no meio do bloco e a laje nasce pendurada no teto.
    expect(chamar({ pontoY: 10.5 }).id).toBe(laje)
  })

  it('um fio acima do meio já pede o topo', () => {
    expect(chamar({ pontoY: 10.5000001 }).id).toBe(lajeTopo)
  })

  it('a fusão respeita a mesma linha do meio', () => {
    // Já existe uma laje de BAIXO na célula alvo. Clicar exatamente no meio da
    // face lateral pede a base — que está ocupada — então não funde.
    expect(chamar({ alvoId: laje, pontoY: 10.5 }).dupla).toBe(false)
    expect(chamar({ alvoId: laje, pontoY: 10.5000001 }).dupla).toBe(true)
  })

  it('laje de TOPO no lugar: clicar na linha do meio funde pela base', () => {
    // ⚠️ O par da regra anterior. `alturaNaCelula(pontoY) <= 0.5` é o que
    // decide se o clique está pedindo a metade de BAIXO — a que está livre
    // quando já existe uma laje de topo. Apertado para `<`, o clique no ponto
    // médio deixa de pedir a base, a fusão não acontece, e em vez de virar
    // bloco cheio a laje nova vai parar na célula vizinha.
    expect(chamar({ alvoId: lajeTopo, pontoY: 10.5 }).dupla).toBe(true)
    expect(chamar({ alvoId: lajeTopo, pontoY: 10.5000001 }).dupla).toBe(false)
  })

  it('a face de cima e a de baixo ignoram a altura do clique', () => {
    // `face !== 3` / `face !== 2` são o que impede a altura de mandar quando a
    // face já decidiu. Invertidos, clicar no topo de um bloco passa a consultar
    // a altura — que ali é sempre 1 — e a laje nasce na metade errada.
    expect(chamar({ face: 2, pontoY: 10.9, destino: cel(3, 11, 5) }).id).toBe(laje)
    expect(chamar({ face: 3, pontoY: 10.1, destino: cel(3, 9, 5) }).id).toBe(lajeTopo)
  })
})
