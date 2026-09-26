import { describe, it, expect } from 'vitest'

import { createMob, hurtMob, restaurarMobs, reidratarAldeoes } from '../../src/servicos/mobs.js'
import {
  MOEDA,
  criarComercioDaSessao,
  fecharTroca,
  motivoDeRecusa,
  pagamentoDe,
  sortearOfertas,
  quantoTem,
  NOMES_DE_PROFISSAO,
} from '../../src/servicos/comercio.js'
import {
  AMIZADE_INICIAL,
  DESCONTO_MAXIMO,
  OFICIOS,
  criarNpc,
  registrar,
  vezesQue,
} from '../../src/servicos/npc.js'
import { buildSavePayload, parseSave } from '../../src/servicos/roqueCraftSave.js'
import { addItem, removeItem, espacoPara } from '../../src/servicos/inventory.js'
import { mulberry32, hash3 } from '../../src/servicos/noise.js'

//
// O ALDEÃO CHEGOU NA TELA — ONDA 9.
//
// ⚠️ ESTE ARQUIVO EXISTE POR UM DEFEITO QUE EU MESMO PRODUZI. As ondas 6 e 7
// entregaram `npc.js`, `falaDoNpc.js` e `modeloDoNpc.js` com 38 testes verdes, e
// eu declarei o Goal entregue. Depois do deploy, procurando os marcadores no
// bundle SERVIDO, os três arquivos apareceram com ZERO ocorrências: ninguém os
// importava fora de teste. Trinta e oito testes verdes sobre código que o jogo
// não carregava.
//
// A lição virou este arquivo: aqui não se testa a regra (ela já tem teste), e
// sim que ela ESTÁ LIGADA — que o aldeão nasce pessoa, atravessa o save, muda o
// preço e guarda o que aconteceu.
//
const semente = 90210
const hash = (a, b, c) => hash3(a, b, c, semente)
const sorteio = (s) => mulberry32(s)

const aldeaoVivo = (profissao = 'ferreiro', x = 120, z = -44) => {
  const m = createMob('aldeao', x, 70, z, semente)
  m.profissao = profissao
  m.ofertas = sortearOfertas(profissao, mulberry32(Math.round(x * 31 + z)))
  m.npc = criarNpc(hash, { x, z, profissao })
  m.origemX = x
  m.origemZ = z
  m.domestica = true
  return m
}

const maquina = { remover: removeItem, adicionar: addItem, espacoPara }

function balcao(mob, inventario) {
  const ref = { v: mob }
  const rev = { v: 0 }
  const avisos = []
  const com = criarComercioDaSessao({
    aberto: { get: () => ref.v, set: (v) => (ref.v = v) },
    revisao: { get: () => rev.v, set: (v) => (rev.v = v) },
    inventario: { get: () => inventario.lista, set: (v) => (inventario.lista = v) },
    maquina,
    salvar: () => {},
    avisar: (c) => avisos.push(c),
    quando: () => 7,
  })
  return { com, avisos }
}

describe('o aldeão que chega na tela', () => {
  it('há aldeão, ofertas e pessoa para conferir (prova de vida)', () => {
    const m = aldeaoVivo()
    expect(m.ofertas.length).toBeGreaterThan(0)
    expect(m.npc.nome).toBeTruthy()
    expect(m.npc.amizade).toBe(AMIZADE_INICIAL)
  })

  it('a lista de ofícios de `npc.js` é a MESMA do balcão de `comercio.js`', () => {
    // As duas listas são fontes separadas de propósito (foi assim que o ciclo de
    // importação entre os dois módulos morreu). Este teste é o mecanismo que
    // impede as duas de divergirem em silêncio.
    expect([...OFICIOS].sort()).toEqual([...NOMES_DE_PROFISSAO].sort())
  })

  it('o mesmo aldeão, na mesma casa, é sempre a mesma pessoa', () => {
    expect(criarNpc(hash, { x: 12, z: 9, profissao: 'clerigo' }).nome).toBe(
      criarNpc(hash, { x: 12, z: 9, profissao: 'clerigo' }).nome,
    )
  })

  it('aldeões de casas diferentes não são todos o mesmo nome', () => {
    const nomes = new Set()
    for (let i = 0; i < 24; i++) nomes.add(criarNpc(hash, { x: i * 13, z: -i * 7 }).nome)
    expect(nomes.size).toBeGreaterThan(4)
  })

  // ── O PREÇO ───────────────────────────────────────────────────────────────

  it('a amizade DESCONTA a esmeralda que o jogador paga', () => {
    const oferta = {
      paga: [{ item: MOEDA, count: 12 }],
      recebe: { item: 'diamond', count: 1 },
      usos: 3,
      restam: 3,
    }
    const frio = { amizade: 0 }
    const amigo = { amizade: 100 }
    expect(pagamentoDe(oferta, frio)[0].count).toBe(12)
    expect(pagamentoDe(oferta, amigo)[0].count).toBe(Math.round(12 * (1 - DESCONTO_MAXIMO)))
  })

  it('a amizade NÃO mexe no que o aldeão paga em troca do trigo', () => {
    // Desconto é de COMPRA. Mexer nos dois lados daria uma bomba de esmeralda.
    const venda = {
      paga: [{ item: 'wheat', count: 18 }],
      recebe: { item: MOEDA, count: 1 },
      usos: 12,
      restam: 12,
    }
    expect(pagamentoDe(venda, { amizade: 100 })[0].count).toBe(18)
  })

  it('a tela e o fechamento cobram O MESMO — o preço descontado', () => {
    const m = aldeaoVivo()
    m.ofertas = [
      {
        paga: [{ item: MOEDA, count: 8 }],
        recebe: { item: 'iron_ingot', count: 3 },
        usos: 4,
        restam: 4,
      },
    ]
    m.npc = { ...m.npc, amizade: 100 }
    const inv = { lista: new Array(36).fill(null) }
    addItem(inv.lista, MOEDA, 8)
    const { com } = balcao(m, inv)
    const naTela = com.ofertas()[0].paga[0].count
    expect(naTela).toBe(6)
    com.trocar(0)
    // Pagou 6 das 8 que tinha: sobram 2. Se cobrasse cheio, sobraria 0.
    expect(quantoTem(inv.lista, MOEDA)).toBe(8 - naTela)
  })

  it('sem amizade suficiente, a oferta cara continua recusada pelo motivo certo', () => {
    const oferta = {
      paga: [{ item: MOEDA, count: 12 }],
      recebe: { item: 'diamond', count: 1 },
      usos: 3,
      restam: 3,
    }
    const inv = new Array(36).fill(null)
    addItem(inv, MOEDA, 10)
    expect(motivoDeRecusa(oferta, inv, () => 64, { amizade: 0 })).toBe('sem-pagamento')
    // Com amizade cheia, 12 vira 9 e as 10 esmeraldas passam a bastar.
    expect(motivoDeRecusa(oferta, inv, () => 64, { amizade: 100 })).toBe(null)
  })

  it('a devolução por falta de espaço devolve O QUE FOI COBRADO, não o preço cheio', () => {
    const oferta = {
      paga: [{ item: MOEDA, count: 8 }],
      recebe: { item: 'iron_ingot', count: 3 },
      usos: 4,
      restam: 4,
    }
    const inv = new Array(36).fill(null)
    addItem(inv, MOEDA, 8)
    const r = fecharTroca(oferta, inv, {
      remover: removeItem,
      adicionar: (lista, item, n) => (item === MOEDA ? addItem(lista, item, n) : n),
      espacoPara: () => 64,
      npc: { amizade: 100 },
    })
    expect(r.ok).toBe(false)
    expect(quantoTem(inv, MOEDA)).toBe(8)
  })

  // ── A MEMÓRIA ─────────────────────────────────────────────────────────────

  it('uma troca FECHADA sobe a amizade; uma recusada não', () => {
    const m = aldeaoVivo()
    m.ofertas = [
      { paga: [{ item: MOEDA, count: 2 }], recebe: { item: 'book', count: 1 }, usos: 4, restam: 4 },
    ]
    const inv = { lista: new Array(36).fill(null) }
    addItem(inv.lista, MOEDA, 2)
    const { com } = balcao(m, inv)
    expect(com.trocar(0)).toBe(true)
    expect(vezesQue(m.npc, 'trocou')).toBe(1)
    // Sem esmeralda a segunda é recusada, e nada sobe.
    expect(com.trocar(0)).toBe(false)
    expect(vezesQue(m.npc, 'trocou')).toBe(1)
  })

  it('presentear TIRA o item da mão e sobe a amizade', () => {
    const m = aldeaoVivo()
    const inv = { lista: new Array(36).fill(null) }
    addItem(inv.lista, 'bread', 3)
    const { com } = balcao(m, inv)
    const antes = m.npc.amizade
    expect(com.presentear('bread')).toBe(true)
    expect(quantoTem(inv.lista, 'bread')).toBe(2)
    expect(m.npc.amizade).toBeGreaterThan(antes)
  })

  it('presentear o que NÃO SE TEM não sobe nada — o presente custa item', () => {
    const m = aldeaoVivo()
    const inv = { lista: new Array(36).fill(null) }
    const { com } = balcao(m, inv)
    const antes = m.npc.amizade
    expect(com.presentear('diamond')).toBe(false)
    expect(m.npc.amizade).toBe(antes)
  })

  it('bater NO ALDEÃO derruba a amizade; bater em outro bicho não explode', () => {
    const m = aldeaoVivo()
    const antes = m.npc.amizade
    hurtMob(m, 1, true)
    expect(m.npc.amizade).toBeLessThan(antes)
    expect(vezesQue(m.npc, 'bateu')).toBe(1)
    const vaca = createMob('cow', 0, 70, 0, 1)
    expect(() => hurtMob(vaca, 1, true)).not.toThrow()
  })

  it('dano que NÃO veio do jogador não guarda mágoa', () => {
    // Um creeper explodindo perto passa pelo mesmo `hurtMob`. Sem o sinalizador,
    // o ferreiro odiaria o viajante por algo que ele não fez.
    const m = aldeaoVivo()
    hurtMob(m, 2)
    expect(vezesQue(m.npc, 'bateu')).toBe(0)
  })

  // ── O SAVE ────────────────────────────────────────────────────────────────

  const salvarEVoltar = (mobs) => {
    const payload = buildSavePayload({ seed: semente, edits: [], mobs })
    const lido = parseSave(JSON.parse(JSON.stringify(payload)))
    const voltou = restaurarMobs(lido.mobs, (t, x, y, z, i) => createMob(t, x, y, z, semente + i))
    return reidratarAldeoes(voltou, hash, sorteio)
  }

  it('o aldeão volta do save COM profissão e COM ofertas', () => {
    // ⚠️ ESTE ERA O DEFEITO ANTIGO, de antes desta onda: o save gravava um
    // aldeão sem profissão, `aldeoesQueFaltam` já o contava como presente, e a
    // vila inteira ficava muda depois de um recarregamento.
    const [v] = salvarEVoltar([aldeaoVivo('bibliotecario')])
    expect(v.profissao).toBe('bibliotecario')
    expect(v.ofertas.length).toBeGreaterThan(0)
  })

  it('o aldeão volta com o MESMO NOME e a MESMA AMIZADE', () => {
    const m = aldeaoVivo('clerigo', -88, 300)
    m.npc = registrar(registrar(m.npc, 'trocou'), 'presenteou')
    const [v] = salvarEVoltar([m])
    expect(v.npc.nome).toBe(m.npc.nome)
    expect(v.npc.amizade).toBe(m.npc.amizade)
    expect(vezesQue(v.npc, 'presenteou')).toBe(1)
  })

  it('o ESTOQUE gasto não volta cheio', () => {
    const m = aldeaoVivo('fazendeiro')
    m.ofertas[0].restam = 1
    const [v] = salvarEVoltar([m])
    expect(v.ofertas[0].restam).toBe(1)
  })

  it('o aldeão volta com as MESMAS OFERTAS, na mesma ordem', () => {
    const m = aldeaoVivo('ferreiro', 44, 91)
    const [v] = salvarEVoltar([m])
    expect(v.ofertas.map((o) => o.recebe.item)).toEqual(m.ofertas.map((o) => o.recebe.item))
  })

  it('reidratar de novo NÃO desfaz o que aconteceu depois de carregar', () => {
    // ⚠️ O TESTE ANTIGO AQUI ERA CEGO, e dois mutantes sobreviveram a ele: eu
    // reidratava duas vezes a MESMA lista recém-carregada, onde `npcSalvo` e
    // `estoqueSalvo` ainda estavam grudados — trocar `if (!m.npc)` por
    // `if (true)` reconstruía o mesmo estado e nada acusava.
    //
    // O caso real é outro: o boot chama o caminho de carga duas vezes (foi o
    // que o RC-03 mostrou no "solo → sala → solo"), e entre as duas o jogador
    // JOGOU. O que não pode é a segunda passada rebobinar para o save.
    const [v] = salvarEVoltar([aldeaoVivo()])
    v.npc = registrar(registrar(v.npc, 'presenteou'), 'trocou')
    v.ofertas[0].restam = 0
    const amizadeJogada = v.npc.amizade
    reidratarAldeoes([v], hash, sorteio)
    expect(v.npc.amizade).toBe(amizadeJogada)
    expect(v.ofertas[0].restam).toBe(0)
  })

  it('save ANTIGO (sem os campos da v12) não quebra o boot', () => {
    const antigo = [{ t: 'aldeao', x: 10, y: 70, z: 10, r: 0, v: 20, b: 0, l: 0, d: 1 }]
    const voltou = restaurarMobs(
      // o desserializador do save é quem dá forma; aqui vai a forma crua dele
      antigo.map((m) => ({ type: m.t, x: m.x, y: m.y, z: m.z, health: m.v, domestica: true })),
      (t, x, y, z, i) => createMob(t, x, y, z, semente + i),
    )
    expect(() => reidratarAldeoes(voltou, hash, sorteio)).not.toThrow()
    expect(voltou[0].npc).toBe(null)
  })

  it('a vaca do curral não ganha nome nem ofertas', () => {
    const vaca = createMob('cow', 5, 70, 5, semente)
    vaca.domestica = true
    const [v] = salvarEVoltar([vaca])
    expect(v.npc).toBe(null)
    expect(v.ofertas).toBe(null)
  })
})
