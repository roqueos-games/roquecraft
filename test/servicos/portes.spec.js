//
// OS TRÊS PORTES — aldeia, vila e cidade.
//
// ⚠️ E ELE MEDE COM O RUÍDO DE VERDADE, como `densidade.spec.js`. Numa planície
// de mentira toda célula aceita e a conta devolve o tamanho da grade; o que
// decide se o porte existe no mundo é quantas células o BIOMA e o TERRENO
// recusam — e a cidade, que precisa de um platô de 54 blocos de raio, é
// justamente a que mais apanha disso.
import { describe, it, expect } from 'vitest'
import {
  PORTES,
  PORTES_POR_TAMANHO,
  centroDaCelula,
  planoDaAldeia,
  planoDoAssentamento,
  raioEscritoDe,
} from '../../src/servicos/aldeia.js'
import { BIOMAS_DA_ALDEIA, colunaDaAldeia } from '../../src/servicos/aldeia.js'
import { colunasDaIgreja } from '../../src/servicos/cidade.js'
import { MATERIAIS } from '../../src/servicos/vilaCasa.js'
import {
  BIOME_NAMES,
  biomeAt,
  createNoiseContext,
  solidTopAt,
  terrainHeight,
} from '../../src/servicos/worldgen.js'
import { hash3 } from '../../src/servicos/noise.js'
import { SEA_LEVEL } from '../../src/servicos/constants.js'

const SEMENTE = 1337
const nz = createNoiseContext(SEMENTE)
const hash = (a, b, c) => hash3(a, b, c, SEMENTE)
const mundo = {
  alturaEm: (x, z) => solidTopAt(nz, x, z),
  nivelDoMar: SEA_LEVEL,
  biomaEm: (x, z) => biomeAt(nz, x, z, terrainHeight(nz, x, z)),
  biomaAceito: (b) => BIOMAS_DA_ALDEIA.includes(BIOME_NAMES[b]),
  materialDaVila: () => MATERIAIS.carvalho,
}

/** Varre N×N células daquele porte e devolve os planos achados. */
function varrer(porte, n) {
  const p = PORTES[porte]
  const achados = []
  for (let gx = -n; gx <= n; gx++) {
    for (let gz = -n; gz <= n; gz++) {
      const plano = planoDaAldeia(hash, mundo, gx * p.celula, gz * p.celula, porte)
      if (plano) achados.push(plano)
    }
  }
  return achados
}

describe('a tabela dos portes', () => {
  it('os três existem e crescem de verdade', () => {
    const [maior, meio, menor] = PORTES_POR_TAMANHO.map((n) => PORTES[n])
    expect(maior.casas).toBeGreaterThan(meio.casas)
    expect(meio.casas).toBeGreaterThan(menor.casas)
    expect(maior.raio).toBeGreaterThan(meio.raio)
    expect(meio.raio).toBeGreaterThan(menor.raio)
  })

  it('o mais raro é o maior — é o que faz achar uma valer alguma coisa', () => {
    expect(PORTES.cidade.celula).toBeGreaterThan(PORTES.vila.celula)
    expect(PORTES.vila.celula).toBeGreaterThan(PORTES.aldeia.celula)
  })

  it('cada grade tem SAL próprio', () => {
    // ⚠️ Com o mesmo sal, os três cairiam no mesmo offset dentro da própria
    // célula e o jogador veria FILEIRA — o defeito que a nota de `CELULA`
    // documenta para um porte só, multiplicado por três.
    const sais = new Set(Object.values(PORTES).map((p) => p.sal))
    expect(sais.size).toBe(Object.keys(PORTES).length)
    const a = centroDaCelula(hash, 0, 0, 'aldeia')
    const c = centroDaCelula(hash, 0, 0, 'cidade')
    expect(`${a.x},${a.z}`).not.toBe(`${c.x},${c.z}`)
  })

  it('a VILA não mudou — a catraca mede doze delas', () => {
    // ⚠️ AO ESCREVER ESTA ONDA EU DEI DUAS COROAS À VILA e a catraca caiu em
    // quatro réguas de uma vez. O porte novo se acrescenta ao lado; o que já
    // estava medido não se mexe.
    expect(PORTES.vila.coroas).toBe(1)
    expect(PORTES.vila.celula).toBe(16)
    expect(PORTES.vila.casas).toBe(9)
    expect(PORTES.vila.minimas).toBe(6)
    expect(PORTES.vila.raio).toBe(28)
  })
})

describe('os três nascem no mundo de verdade', () => {
  it('a aldeia existe, e é a mais comum', () => {
    const aldeias = varrer('aldeia', 5)
    expect(aldeias.length, 'nenhuma aldeia em 121 células').toBeGreaterThan(0)
    for (const a of aldeias) {
      expect(a.porte).toBe('aldeia')
      expect(a.casas.length).toBeGreaterThanOrEqual(PORTES.aldeia.minimas)
      expect(a.casas.length).toBeLessThanOrEqual(PORTES.aldeia.casas)
    }
  })

  it('a cidade existe, tem igreja e tem feira', () => {
    // ⚠️ A AFIRMAÇÃO QUE IMPORTA. Um porte declarado na tabela que o terreno
    // nunca aceita é uma cidade que existe só no código — e foi exatamente o
    // que aconteceu na onda 4 com a cachoeira larga.
    const cidades = varrer('cidade', 6)
    expect(cidades.length, 'nenhuma cidade em 169 células: o porte não nasce').toBeGreaterThan(0)
    for (const c of cidades) {
      expect(c.igreja, 'cidade sem igreja').toBeTruthy()
      expect(c.bancas.length, 'cidade sem feira').toBeGreaterThan(0)
      expect(c.casas.length).toBeGreaterThanOrEqual(PORTES.cidade.minimas)
    }
  })

  it('⚠️ a cidade CHEGA AO MUNDO inteira: coroas de fora, igreja e feira têm coluna', () => {
    // `colunaDaAldeia` perguntava `dentroDoEscrito` sem o porte — o raio da
    // VILA (35). A cidade tem raio 54 e igreja a ~59: o plano tinha 20 casas e
    // o mundo recebia 12, sem igreja. A primeira foto da cidade mostrou.
    const cidades = varrer('cidade', 6)
    expect(cidades.length).toBeGreaterThan(0)
    for (const c of cidades) {
      const longe = c.casas.filter(
        (h) => Math.max(Math.abs(h.x - c.centro.x), Math.abs(h.z - c.centro.z)) > 35,
      )
      expect(longe.length, 'a cidade tem casa além do raio da vila').toBeGreaterThan(0)
      for (const h of longe) {
        expect(
          colunaDaAldeia(c, h.x, h.z, mundo.alturaEm),
          `casa em ${h.x},${h.z} sem coluna`,
        ).not.toBeNull()
      }
      const igreja = colunaDaAldeia(c, c.igreja.x, c.igreja.z, mundo.alturaEm)
      expect(igreja, 'igreja sem coluna').not.toBeNull()
      // A PEGADA INTEIRA da igreja tem coluna — inclusive a torre recuada, que
      // é a parte que cai mais longe do centro.
      const pegada = new Set(colunasDaIgreja(c.material).map((p) => `${p.dx},${p.dz}`))
      for (const k of pegada) {
        const [dx, dz] = k.split(',').map(Number)
        expect(
          colunaDaAldeia(c, c.igreja.x + dx, c.igreja.z + dz, mundo.alturaEm),
          `igreja de ${c.centro.x},${c.centro.z}: coluna ${dx},${dz} fora do raio escrito`,
        ).not.toBeNull()
      }
      // A torre fica recuada da nave: o topo é o mais alto num quadrado de 14.
      let topo = c.chao
      for (let x = c.igreja.x - 14; x <= c.igreja.x + 14; x++)
        for (let z = c.igreja.z - 14; z <= c.igreja.z + 14; z++) {
          const col = colunaDaAldeia(c, x, z, mundo.alturaEm)
          for (const e of col ?? []) if (e.id > 0 && e.y > topo) topo = e.y
        }
      expect(topo - c.chao, 'a torre sobe').toBeGreaterThanOrEqual(20)
      for (const b of c.bancas) {
        const col = colunaDaAldeia(c, b.x, b.z, mundo.alturaEm)
        expect(
          col?.some((e) => e.y === c.chao + 3 && e.id > 0),
          'banca sem toldo',
        ).toBe(true)
      }
    }
  })

  it('vila e aldeia não têm igreja nem feira', () => {
    // A graduação é o produto: se todo assentamento tem campanário, achar um
    // deixa de ser acontecimento.
    for (const porte of ['aldeia', 'vila']) {
      for (const p of varrer(porte, 4)) {
        expect(p.igreja, `${porte} ganhou igreja`).toBeUndefined()
        expect(p.bancas, `${porte} ganhou feira`).toBeUndefined()
      }
    }
  })
})

describe('a precedência impede que dois se atravessem', () => {
  it('onde a cidade nasce, o despachante devolve a CIDADE', () => {
    const cidades = varrer('cidade', 6)
    expect(cidades.length).toBeGreaterThan(0)
    const c = cidades[0]
    const escolhido = planoDoAssentamento(
      hash,
      mundo,
      Math.floor(c.centro.x / 16),
      Math.floor(c.centro.z / 16),
    )
    expect(escolhido?.porte, 'o despachante preferiu o porte menor').toBe('cidade')
  })

  it('a cidade cabe dentro da PRÓPRIA célula — é isso que dispensa a guarda', () => {
    // ⚠️ EU ESCREVI UMA GUARDA DE SOBREPOSIÇÃO E ELA ERA DECORAÇÃO: 14 recusas
    // com ela e os MESMOS 14 sem ela, em 841 células de terreno real. O motivo é
    // geométrico — a célula da cidade tem 608 blocos e ela escreve 60 de raio,
    // com o centro preso ao miolo. Nenhum chunk de uma cidade cai na célula de
    // outra, então "a cidade DAQUI existe?" já é a pergunta certa.
    //
    // Esta é a premissa que sustenta isso. Se alguém aumentar o raio ou encolher
    // a célula, ela cai aqui — e aí a guarda passa a ser necessária de verdade.
    for (const nome of PORTES_POR_TAMANHO) {
      const p = PORTES[nome]
      const meiaCelula = (p.celula * 16) / 2
      const escrito = raioEscritoDe(nome)
      expect(escrito, `${nome} escreve além da própria célula`).toBeLessThan(meiaCelula)
    }
  })

  it('cada porte recusa a célula que o maior já ocupou', () => {
    // O que a ordem garante: onde os dois cabem, vem o maior — sempre o mesmo,
    // para o mesmo chunk, em qualquer um dos nove vizinhos que o calcule.
    const cidades = varrer('cidade', 6)
    expect(cidades.length).toBeGreaterThan(0)
    const c = cidades[0]
    const cx = Math.floor(c.centro.x / 16)
    const cz = Math.floor(c.centro.z / 16)
    for (const [dx, dz] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [-1, -1],
    ]) {
      const escolhido = planoDoAssentamento(hash, mundo, cx + dx, cz + dz)
      expect(escolhido?.porte, 'o despachante preferiu o porte menor').toBe('cidade')
    }
  })
})
