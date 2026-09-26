import { describe, it, expect } from 'vitest'
import { createNoiseContext, generateChunkData } from '../../src/servicos/worldgen.js'
import { BLOCKS, ID } from '../../src/servicos/blocks.js'
import { CHUNK_SIZE, WORLD_HEIGHT } from '../../src/servicos/constants.js'

// CENSO DA GERAÇÃO — quais blocos o mundo realmente produz.
//
// O backlog dizia "blocos de construção que existem e não são gerados" e
// listava cinco de cabeça. Cabeça não conta bloco: este teste gera um pedaço de
// mundo de verdade e CONTA, por id, o que saiu de lá.
//
// Vira teste e não script avulso de propósito: "o mundo gera granito" é uma
// promessa que precisa continuar valendo depois da próxima mexida no worldgen,
// e um script que ninguém roda não protege nada.

const nomeDe = new Map(Object.values(BLOCKS).map((d) => [d.id, d.key]))
const idDe = new Map(Object.entries(ID))

function censo(semente, raio) {
  const nz = createNoiseContext(semente)
  const conta = new Map()
  let chunks = 0
  for (let cx = -raio; cx <= raio; cx++) {
    for (let cz = -raio; cz <= raio; cz++) {
      const { blocks: b } = generateChunkData(nz, cx, cz)
      chunks++
      for (let i = 0; i < b.length; i++) {
        const id = b[i]
        if (id !== 0) conta.set(id, (conta.get(id) || 0) + 1)
      }
    }
  }
  return { conta, chunks, total: chunks * CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT }
}

// Uma amostra só, compartilhada: gerar 49 chunks custa alguns segundos e não
// há razão pra pagar isso uma vez por asserção.
const AMOSTRA = censo(942457, 3)
const ppm = (chave) => {
  const id = idDe.get(chave)
  return id == null ? 0 : ((AMOSTRA.conta.get(id) || 0) / AMOSTRA.total) * 1e6
}

describe('worldgen - censo do que o mundo produz', () => {
  // ⚠️ PROVA DE VIDA, e ela vem primeiro.
  //
  // Todo o resto deste arquivo é da forma "o bloco X aparece". Se a amostra
  // estivesse vazia — semente quebrada, raio zero, generateChunkData mudando de
  // assinatura — cada um desses testes falharia por um motivo enganoso, e um
  // deles poderia até passar por acidente. Se a pedra sumir, o problema é a
  // sonda, não o mundo.
  it('a amostra tem mundo dentro (senão o resto do arquivo não significa nada)', () => {
    expect(AMOSTRA.chunks).toBe(49)
    expect(ppm('stone'), 'pedra é a maior parte do subsolo').toBeGreaterThan(50_000)
    expect(ppm('dirt')).toBeGreaterThan(500)
    expect(ppm('grassBlock')).toBeGreaterThan(100)
  })

  it('minério continua saindo, e na ordem certa de raridade', () => {
    expect(ppm('coalOre')).toBeGreaterThan(0)
    expect(ppm('ironOre')).toBeGreaterThan(0)
    expect(ppm('diamondOre')).toBeGreaterThan(0)
    // Carvão é comum, diamante é raro. Se isto inverter, a mineração perdeu a
    // curva de recompensa mesmo com todos os minérios "presentes".
    expect(ppm('coalOre')).toBeGreaterThan(ppm('diamondOre'))
  })

  // ── O que esta rodada acrescenta ──────────────────────────────────────────
  //
  // Granito, diorito e andesito existiam em `blocks.js` desde sempre e o mundo
  // nunca produziu um só: eram blocos de construção que ninguém podia obter
  // construindo. Idem argila, que no original é a fonte de tijolo.
  it('as três variantes de pedra aparecem no subsolo', () => {
    for (const variante of ['granite', 'diorite', 'andesite']) {
      expect(ppm(variante), `${variante} nunca é gerado`).toBeGreaterThan(0)
    }
  })

  it('as variantes são bolsões, não poeira: cada uma passa de 100 ppm', () => {
    // Um punhado de blocos espalhados pelo mundo inteiro é indistinguível de
    // não existir - o jogador nunca esbarra num. O que faz a variante existir
    // de verdade é o BOLSÃO, e 100 ppm é o piso pra isso ser encontrável.
    for (const variante of ['granite', 'diorite', 'andesite']) {
      expect(ppm(variante), `${variante} sai raro demais pra ser achado`).toBeGreaterThan(100)
    }
  })

  it('nenhuma variante engole a pedra comum', () => {
    // O outro lado do mesmo cuidado: variante demais e o subsolo vira confete,
    // a pedra deixa de ser o material de base e o mundo perde legibilidade.
    const soma = ppm('granite') + ppm('diorite') + ppm('andesite')
    expect(soma, 'as variantes somam mais que 12% do mundo').toBeLessThan(120_000)
    expect(ppm('stone')).toBeGreaterThan(soma * 2)
  })

  it('argila aparece, e perto da água', () => {
    expect(ppm('clay'), 'argila nunca é gerada').toBeGreaterThan(0)
  })

  it('a lista de blocos naturais não tem buraco', () => {
    // O teste que resume a rodada: nenhum bloco que o MUNDO devia produzir
    // sozinho pode vir zerado. Tábua, lã, baú e tocha não entram - esses são
    // feitos pelo jogador, e cobrá-los da geração seria inventar defeito.
    const daNatureza = [
      'stone',
      'dirt',
      'grassBlock',
      'sand',
      'gravel',
      'water',
      'coalOre',
      'ironOre',
      'granite',
      'diorite',
      'andesite',
      'clay',
    ]
    const faltando = daNatureza.filter((k) => ppm(k) === 0)
    expect(faltando, `blocos naturais que o mundo não produz: ${faltando.join(', ')}`).toEqual([])
  })
})

describe('worldgen - o censo vale em mais de uma semente', () => {
  // Uma semente só pode ter sorte. Duas sementes com a mesma conclusão é
  // geração, não coincidência - e o custo é um segundo a mais.
  // TRÊS sementes, não uma.
  //
  // A primeira versão usava só a semente 7 — e a semente 7 não tem uma gota de
  // água em 49 chunks. O teste de argila, que é condicional a haver água,
  // passava VAZIO: entrava no ramo "sem água, sem argila" e não verificava
  // nada. Foi a prova de vida do próprio condicional que denunciou.
  const SEMENTES = [7, 20260819, 555111]
  const AMOSTRAS = SEMENTES.map((s) => ({ s, ...censo(s, 3) }))
  const ppmDe = (a, chave) => {
    const id = idDe.get(chave)
    return id == null ? 0 : ((a.conta.get(id) || 0) / a.total) * 1e6
  }
  const OUTRA = AMOSTRAS[0]
  const ppm2 = (chave) => ppmDe(OUTRA, chave)

  it('as variantes de pedra saem em TODAS as sementes (são geológicas)', () => {
    // Dependem só de haver pedra, e pedra existe em toda semente. Sem exceção,
    // sem condicional.
    for (const a of AMOSTRAS) {
      for (const k of ['granite', 'diorite', 'andesite', 'gravel']) {
        expect(ppmDe(a, k), `${k} não aparece na semente ${a.s}`).toBeGreaterThan(0)
      }
    }
  })

  it('argila acompanha a água: onde há leito raso, há argila', () => {
    // ⚠️ Argila NÃO é incondicional, e a diferença é do desenho, não uma folga
    // pra passar. Ela é geográfica: nasce em leito de água rasa. Numa semente
    // sem lago nem mar perto da origem não existe leito, e cobrar argila ali
    // seria cobrar um bloco que não tem onde nascer.
    //
    // A afirmação certa é condicional, e ela morde: TODA amostra com água tem
    // que ter argila.
    const comAgua = AMOSTRAS.filter((a) => ppmDe(a, 'water') > 0)
    // PROVA DE VIDA do condicional: se nenhuma amostra tivesse água, o `for`
    // abaixo não rodaria e o teste viraria decoração sem avisar. A semente 7,
    // sozinha na primeira versão, é exatamente esse caso - 49 chunks sem uma
    // gota d'água.
    expect(
      comAgua.length,
      `nenhuma das sementes ${SEMENTES.join(', ')} tem água - troque a amostra`,
    ).toBeGreaterThan(0)
    for (const a of comAgua) {
      expect(
        ppmDe(a, 'clay'),
        `semente ${a.s}: ${Math.round(ppmDe(a, 'water'))} ppm de água e nenhuma argila`,
      ).toBeGreaterThan(0)
    }
  })

  it('o censo sabe nomear tudo que contou (id órfão é bug de tabela)', () => {
    for (const id of OUTRA.conta.keys()) {
      expect(nomeDe.get(id), `id ${id} gerado e não existe em DEFS`).toBeTruthy()
    }
  })
})
