import { describe, it, expect } from 'vitest'
import { meshSection } from '../../src/servicos/mesher.js'
import { BLOCK_BY_KEY, BLOCKS, AIR } from '../../src/servicos/blocks.js'
import { FACES_DE_BLOCO } from '../../src/servicos/formas.js'

// SEIS FACES, SEIS DIREÇÕES, TODAS VIRADAS PRA FORA.
//
// O founder relatou (2026-08-22) duas coisas que são a MESMA classe de defeito:
//
//   "para os lados e para trás os blocos estão com faces vazias e sem textura"
//   "blocos de gelo sem a parte das laterais e inferior"
//
// Um bloco isolado no vazio tem que emitir exatamente 6 quads — um por direção
// — e cada quad tem que ter winding CCW visto DE FORA, senão o backface culling
// o descarta e o mundo ganha um buraco naquela direção. Como o winding de cada
// face sai de uma tabela escrita à mão (`FACES`, com o campo `flip`), um erro
// de sinal em UMA linha some com as faces de UM lado só — que é exatamente o
// sintoma "de frente funciona, dos lados e de trás não".
//
// Este arquivo é a rede: varre TODO o catálogo de blocos, não só os que eu
// lembrei de testar.

const NOMES = ['+x', '-x', '+y', '-y', '+z', '-z']
const DIRS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
]

/** Mundo com UM bloco em (8,8,8) e ar em todo o resto. */
function blocoSolto(id) {
  return {
    block: (x, y, z) => (x === 8 && y === 8 && z === 8 ? id : AIR),
    light: () => 0xf0,
    tint: () => [0.4, 0.7, 0.3],
  }
}

/** Junta os três buckets num só array de geometrias não vazias. */
function geometrias(r) {
  return [r.opaque, r.cutout, r.transparent].filter(Boolean)
}

/**
 * Para cada triângulo: a normal GEOMÉTRICA (do winding) e a normal DECLARADA
 * (do atributo). Se as duas divergem, a face é descartada pelo culling.
 */
function triangulos(geo) {
  const out = []
  for (let t = 0; t < geo.index.length; t += 3) {
    const [a, b, c] = [geo.index[t], geo.index[t + 1], geo.index[t + 2]]
    const p = (i) => [geo.position[i * 3], geo.position[i * 3 + 1], geo.position[i * 3 + 2]]
    const [ax, ay, az] = p(a)
    const [bx, by, bz] = p(b)
    const [cx, cy, cz] = p(c)
    const u = [bx - ax, by - ay, bz - az]
    const v = [cx - ax, cy - ay, cz - az]
    // cross(u, v) — aponta pra fora quando o winding é CCW visto de fora
    const geom = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    // A normal viaja como byte assinado escalado por 127 (Int8Array), não
    // como ±1. `Math.sign` traz de volta pro eixo.
    const decl = [
      Math.sign(geo.normal[a * 3]),
      Math.sign(geo.normal[a * 3 + 1]),
      Math.sign(geo.normal[a * 3 + 2]),
    ]
    const dot = geom[0] * decl[0] + geom[1] * decl[1] + geom[2] * decl[2]
    out.push({ decl, dot })
  }
  return out
}

/** Conta quantos triângulos existem por direção de normal declarada. */
function porDirecao(r) {
  const conta = [0, 0, 0, 0, 0, 0]
  for (const geo of geometrias(r)) {
    for (const { decl } of triangulos(geo)) {
      const i = DIRS.findIndex((d) => d[0] === decl[0] && d[1] === decl[1] && d[2] === decl[2])
      if (i >= 0) conta[i]++
    }
  }
  return conta
}

/** Margem para "o plano é vertical" — ver a nota em `auditarWinding`. */
const EPS = 1e-9

/** Quantas faces cruzadas o catálogo declara para este bloco. */
const cruzadasDe = (b) => (FACES_DE_BLOCO[b.id] || []).filter((f) => f.cruzada).length

/**
 * Audita o winding de UM bloco, tolerando exatamente `cruzadasEsperadas` quads
 * verticais na fatia +y — e reclamando se vier um a mais ou um a menos.
 *
 * Extraída pra que a prova de vida possa chamar a auditoria DE VERDADE com o
 * número esperado zerado, em vez de imitá-la.
 */
function auditarWinding(b, cruzadasEsperadas) {
  const quebrados = []
  let cruzadasVistas = 0
  for (const geo of geometrias(meshSection(blocoSolto(b.id), 0, 0, 0))) {
    for (const { decl, dot } of triangulos(geo)) {
      // ⚠️ EPSILON, e não igualdade exata com zero. O quad cruzado do chão dá
      // zero no bit; o da parede passa por uma ROTAÇÃO (giraPonto faz 1 − z),
      // e a subtração de floats já computados deixa poeira da ordem de 1e-17.
      // A margem não afrouxa nada: face de verdade invertida dá |dot| na casa
      // de 0,1 — sete ordens de grandeza acima disto.
      if (dot > EPS) continue
      // Produto escalar ~zero com normal declarada pra cima = plano vertical na
      // fatia +y = quad cruzado. Não é winding invertido: é outra coisa.
      if (Math.abs(dot) <= EPS && decl[1] === 1) {
        cruzadasVistas++
        continue
      }
      const i = DIRS.findIndex((d) => d.every((v, k) => v === decl[k]))
      quebrados.push(`${b.key}: face ${NOMES[i] ?? decl.join(',')} com winding CW`)
    }
  }
  if (cruzadasVistas !== cruzadasEsperadas * 2) {
    // dois triângulos por quad
    quebrados.push(
      `${b.key}: ${cruzadasVistas} triângulos verticais em +y, esperados ${cruzadasEsperadas * 2}`,
    )
  }
  return quebrados
}

/** Blocos que o mesher desenha como cubo (exclui planta em cruz e ar). */
const CUBICOS = Object.values(BLOCKS).filter(
  (b) => b.id !== AIR && !b.plant && !b.cross && b.id !== BLOCK_BY_KEY.water.id,
)

describe('roquecraft - as seis faces de um bloco isolado', () => {
  it('o catálogo de teste não está vazio', () => {
    expect(CUBICOS.length).toBeGreaterThan(10)
  })

  it('pedra isolada emite as 6 direções, 2 triângulos cada', () => {
    const conta = porDirecao(meshSection(blocoSolto(BLOCK_BY_KEY.stone.id), 0, 0, 0))
    expect(Object.fromEntries(NOMES.map((n, i) => [n, conta[i]]))).toEqual({
      '+x': 2,
      '-x': 2,
      '+y': 2,
      '-y': 2,
      '+z': 2,
      '-z': 2,
    })
  })

  it('GELO isolado emite as laterais e o fundo', () => {
    // O relato: "blocos de gelo sem a parte das laterais e inferior".
    const gelo = BLOCK_BY_KEY.ice
    expect(gelo, 'não existe bloco `ice` no catálogo').toBeTruthy()
    const conta = porDirecao(meshSection(blocoSolto(gelo.id), 0, 0, 0))
    const faltando = NOMES.filter((_, i) => conta[i] === 0)
    expect(faltando, `gelo isolado perdeu as faces ${faltando.join(', ')}`).toEqual([])
  })

  it('NENHUM bloco cúbico do catálogo perde uma direção', () => {
    const quebrados = []
    for (const b of CUBICOS) {
      const conta = porDirecao(meshSection(blocoSolto(b.id), 0, 0, 0))
      const faltando = NOMES.filter((_, i) => conta[i] === 0)
      if (faltando.length) quebrados.push(`${b.key}: sem ${faltando.join(', ')}`)
    }
    expect(quebrados).toEqual([])
  })

  it('NENHUM bloco cúbico do catálogo tem winding invertido', () => {
    // Winding CW = descartado pelo backface culling = buraco visível só de um
    // lado. É o defeito mais barato de introduzir e o mais caro de achar no
    // olho, porque o bloco continua lá na colisão.
    //
    // O QUAD CRUZADO É A ÚNICA EXCEÇÃO, e ela é CONTADA, não perdoada. Um plano
    // vertical que mora na fatia +y (a chama da tocha, ver `faceCruzada` em
    // formas.js) tem normal geométrica horizontal e normal declarada pra cima:
    // o produto escalar dá zero por construção, não por defeito. O teste abaixo
    // exige que o número desses triângulos bata EXATAMENTE com o número de
    // faces marcadas como cruzadas no catálogo — então esquecer a marca reprova
    // aqui, e pôr a marca numa face que não é vertical reprova no teste
    // seguinte.
    const quebrados = CUBICOS.flatMap((b) => auditarWinding(b, cruzadasDe(b)))
    expect([...new Set(quebrados)]).toEqual([])
  })

  it('toda face marcada como CRUZADA é mesmo vertical, e mora em bloco cutout', () => {
    // A marca `cruzada` é o que compra a isenção da regra de winding no teste
    // acima. Sem esta verificação, a marca viraria um jeito de calar o teste:
    // bastaria marcar uma face horizontal com o winding trocado pra ela sair
    // contada como cruzada em vez de reprovada.
    //
    // Duas condições, e as duas importam. VERTICAL: a área projetada no plano
    // XZ tem que ser zero, senão o polígono tem componente horizontal e a
    // normal declarada pra cima seria mentira de verdade. CUTOUT: o material do
    // bucket cutout é DoubleSide, e é só por isso que o winding de um quad
    // cruzado não decide nada. Num bucket opaco (FrontSide) a mesma face
    // sumiria de um dos lados.
    const quebrados = []
    for (const b of Object.values(BLOCKS)) {
      for (const f of (FACES_DE_BLOCO[b.id] || []).filter((p) => p.cruzada)) {
        const [a, c1, , c3] = f.cantos
        const u = [c1[0] - a[0], c1[1] - a[1], c1[2] - a[2]]
        const v = [c3[0] - a[0], c3[1] - a[1], c3[2] - a[2]]
        const areaY = u[2] * v[0] - u[0] * v[2] // componente y do produto vetorial
        if (Math.abs(areaY) > EPS) quebrados.push(`${b.key}: face cruzada NÃO é vertical`)
        if (!b.cutout) quebrados.push(`${b.key}: face cruzada em bloco que não é cutout`)
      }
    }
    expect([...new Set(quebrados)]).toEqual([])
  })

  it('a auditoria de winding sabe acusar: a tocha SEM a marca de cruzada reprova', () => {
    // PROVA DE VIDA, e ela roda a auditoria de verdade — não uma imitação dela.
    //
    // Sem isto, os dois testes acima poderiam estar passando por não olharem
    // nada. Foi exatamente assim que o detector de crase em GLSL passou verde
    // estando cego, em 25/08/2026: o próprio par de controle foi quem contou.
    //
    // O controle é a MESMA função com o número esperado de cruzadas zerado, que
    // é o que aconteceria se alguém escrevesse a chama sem marcar. Tem que
    // acusar; se não acusar, a isenção não está sendo contada e sim ignorada.
    const tocha = BLOCK_BY_KEY.torch
    expect(cruzadasDe(tocha), 'a tocha perdeu a chama').toBeGreaterThan(0)
    expect(auditarWinding(tocha, cruzadasDe(tocha))).toEqual([])
    expect(auditarWinding(tocha, 0).join(' | ')).toMatch(/triângulos verticais em \+y/)
  })
})
