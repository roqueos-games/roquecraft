import { describe, it, expect } from 'vitest'

import {
  encaixarCama,
  orientDaCama,
  ehCabeceira,
  outraMetade,
  podeDormir,
  amanhecerDepoisDe,
  monstroPerto,
  ehCama,
  ID_PE,
  ID_CABECEIRA,
  RAIO_DE_MONSTRO,
} from '../../src/servicos/cama.js'
import { buildSavePayload, parseSave } from '../../src/servicos/roqueCraftSave.js'
import { RECIPES } from '../../src/servicos/recipes.js'
import { itemDef } from '../../src/servicos/items.js'
import { BLOCKS, BLOCK_BY_KEY } from '../../src/servicos/blocks.js'
import { TICKS_PER_DAY, DAWN, NOON, MIDNIGHT, isNight } from '../../src/servicos/daycycle.js'

// A CAMA, DE PONTA A PONTA.
//
// Ela é a primeira peça do jogo que ocupa DUAS células, e a primeira que grava
// estado que precisa sobreviver ao save. Três coisas podem quebrar calado:
//
//   meia cama       — uma célula entra e a outra não, e sobra uma prancha que
//                     ainda responde a "dormir"
//   sono liberado   — a checagem de monstro lê um campo que não existe,
//                     devolve `undefined`, e o jogador dorme cercado
//   ponto perdido   — dormir grava, o save não leva, e a descoberta é morrendo
//
// Os três têm teste aqui, e o do meio tem o formato de prova de vida: a versão
// ingênua da checagem vem reimplementada junto, afirmando que erra.

const livreSempre = () => true
const apoiadoSempre = () => true

describe('roquecraft - onde a cama cabe', () => {
  const base = {
    item: 'bed',
    destino: { x: 4, y: 10, z: 7 },
    livre: livreSempre,
    apoiado: apoiadoSempre,
  }

  it('a cabeceira nasce NA DIREÇÃO DO OLHAR', () => {
    const cel = ({ x, y, z }) => ({ x, y, z })
    expect(cel(encaixarCama({ ...base, dirX: 1, dirZ: 0 }).cabeceira)).toEqual({
      x: 5,
      y: 10,
      z: 7,
    })
    expect(cel(encaixarCama({ ...base, dirX: -1, dirZ: 0 }).cabeceira)).toEqual({
      x: 3,
      y: 10,
      z: 7,
    })
    expect(cel(encaixarCama({ ...base, dirX: 0, dirZ: 1 }).cabeceira)).toEqual({
      x: 4,
      y: 10,
      z: 8,
    })
    expect(cel(encaixarCama({ ...base, dirX: 0, dirZ: -1 }).cabeceira)).toEqual({
      x: 4,
      y: 10,
      z: 6,
    })
  })

  it('o pé fica na célula mirada, e as duas ficam na mesma altura', () => {
    const r = encaixarCama({ ...base, dirX: 0.9, dirZ: 0.3 })
    expect(r.pe.x).toBe(4)
    expect(r.pe.y).toBe(10)
    expect(r.pe.z).toBe(7)
    expect(r.cabeceira.y, 'cama torta não é cama').toBe(r.pe.y)
  })

  it('cada direção devolve uma VARIANTE diferente — é ela que gira o desenho', () => {
    // ⚠️ Este é o teste que o defeito de 24/08/2026 pede. Antes da rodada 12 as
    // quatro direções devolviam o mesmo par de ids: a cama sabia pra onde
    // deitar, mas não sabia pra onde OLHAR, e o travesseiro apontava pro mesmo
    // lado nas quatro. Aqui as quatro têm que dar pares distintos.
    const pares = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].map((d) => {
      const r = encaixarCama({ ...base, dirX: d[0], dirZ: d[1] })
      return `${r.pe.id}/${r.cabeceira.id}`
    })
    expect(new Set(pares).size).toBe(4)
  })

  it('as duas metades apontam pra lados OPOSTOS — é o que põe pé em cada quina', () => {
    // Se as duas apontassem pro mesmo lado, os quatro pés ficariam empilhados
    // numa ponta só e a cama viraria uma prancheta apoiada no ar.
    const r = encaixarCama({ ...base, dirX: 0, dirZ: -1 })
    expect(orientDaCama(r.cabeceira.id)).toBe(5) // ponta de fora no −Z
    expect(orientDaCama(r.pe.id)).toBe(4) // ponta de fora no +Z
    expect(ehCabeceira(r.cabeceira.id)).toBe(true)
    expect(ehCabeceira(r.pe.id)).toBe(false)
  })

  it('sem as DUAS células livres, não entra nenhuma', () => {
    // Meia cama é uma prancha que ainda responde a "dormir". Ou vai inteira ou
    // não vai — e é a cabeceira que costuma ser a que falta, porque o jogador
    // mira no chão livre à frente sem olhar o que tem depois.
    const soOPeLivre = (x) => x === 4
    expect(encaixarCama({ ...base, dirX: 1, dirZ: 0, livre: soOPeLivre })).toBeNull()
    const soACabeceiraLivre = (x) => x === 5
    expect(encaixarCama({ ...base, dirX: 1, dirZ: 0, livre: soACabeceiraLivre })).toBeNull()
  })

  it('sem apoio embaixo das DUAS, não entra nenhuma', () => {
    const soOPeApoiado = (x) => x === 4
    expect(encaixarCama({ ...base, dirX: 1, dirZ: 0, apoiado: soOPeApoiado })).toBeNull()
  })

  it('o apoio é conferido UM ABAIXO, não na própria célula', () => {
    // Se a conta olhasse a própria célula, a cama só entraria dentro da pedra.
    const alturas = []
    encaixarCama({
      ...base,
      dirX: 1,
      dirZ: 0,
      apoiado: (x, y, z) => {
        alturas.push(y)
        return true
      },
    })
    expect([...new Set(alturas)]).toEqual([9])
  })

  it('item que não é cama devolve null e o caminho normal segue', () => {
    expect(encaixarCama({ ...base, item: 'stone', dirX: 1, dirZ: 0 })).toBeNull()
    expect(encaixarCama({ ...base, item: 'bedHead', dirX: 1, dirZ: 0 })).toBeNull()
  })
})

describe('roquecraft - as duas metades se acham', () => {
  const mundo = (mapa) => (x, y, z) => mapa[`${x},${y},${z}`] ?? 0

  it('do pé se acha a cabeceira, e vice-versa', () => {
    const m = mundo({ '4,10,7': ID_PE, '5,10,7': ID_CABECEIRA })
    expect(outraMetade(ID_PE, 4, 10, 7, m)).toMatchObject({ x: 5, y: 10, z: 7, id: ID_CABECEIRA })
    expect(outraMetade(ID_CABECEIRA, 5, 10, 7, m)).toMatchObject({ x: 4, y: 10, z: 7, id: ID_PE })
  })

  it('metade órfã devolve null em vez de inventar vizinho', () => {
    const m = mundo({ '4,10,7': ID_PE })
    expect(outraMetade(ID_PE, 4, 10, 7, m)).toBeNull()
  })

  it('bloco que não é cama nem procura', () => {
    const m = mundo({ '4,10,7': ID_PE, '5,10,7': ID_CABECEIRA })
    expect(outraMetade(BLOCK_BY_KEY.stone.id, 4, 10, 7, m)).toBeNull()
    expect(ehCama(ID_PE) && ehCama(ID_CABECEIRA)).toBe(true)
    expect(ehCama(BLOCK_BY_KEY.stone.id)).toBe(false)
  })
})

describe('roquecraft - quando dá pra dormir', () => {
  it('de dia não dá, de noite dá', () => {
    expect(podeDormir({ ticks: NOON, monstroPerto: false })).toMatchObject({
      ok: false,
      motivo: 'dia',
    })
    expect(podeDormir({ ticks: DAWN + 100, monstroPerto: false }).ok).toBe(false)
    expect(podeDormir({ ticks: MIDNIGHT, monstroPerto: false })).toEqual({ ok: true })
  })

  it('com monstro perto não dá, mesmo de noite', () => {
    expect(podeDormir({ ticks: MIDNIGHT, monstroPerto: true })).toMatchObject({
      ok: false,
      motivo: 'monstro',
    })
  })

  it('o dia vence o monstro na ordem dos motivos', () => {
    // Os dois errados ao mesmo tempo: a mensagem tem que ser a que ensina mais.
    // "É dia" explica o ciclo; "tem monstro" de dia confundiria.
    expect(podeDormir({ ticks: NOON, monstroPerto: true }).motivo).toBe('dia')
  })

  it('⚠️ a checagem de monstro recebe HOSTIS, não a lista crua', () => {
    // A prova de vida deste arquivo. A hostilidade mora na DEFINIÇÃO da
    // criatura, não na instância — um `m.hostil` lido da instância dá
    // `undefined` em TODAS, a função devolve `false` sempre, e o jogador dorme
    // cercado de esqueleto sem nada avisar. O erro é invisível porque o
    // resultado errado é o resultado desejado.
    const perto = [{ x: 2, y: 64, z: 2 }]
    expect(monstroPerto(perto, 0, 0), 'hostil perto tem que barrar').toBe(true)
    // A REGRA INGÊNUA, reimplementada: filtrar por um campo da instância.
    const ingenua = (lista) => lista.filter((m) => m.hostil).length > 0
    expect(ingenua(perto), 'a versão ingênua deixaria dormir — o teste discorda').toBe(false)
  })

  it('o raio é o raio, e ele tem borda', () => {
    expect(monstroPerto([{ x: RAIO_DE_MONSTRO - 0.1, z: 0 }], 0, 0)).toBe(true)
    expect(monstroPerto([{ x: RAIO_DE_MONSTRO + 0.1, z: 0 }], 0, 0)).toBe(false)
    expect(monstroPerto([], 0, 0)).toBe(false)
    // Distância é EUCLIDIANA, não por eixo: um monstro na diagonal a 7+7
    // está a 9,9 de distância e não deve barrar.
    expect(monstroPerto([{ x: 7, z: 7 }], 0, 0)).toBe(false)
  })
})

describe('roquecraft - dormir move o relógio pra frente, nunca pra trás', () => {
  it('cai no amanhecer', () => {
    const depois = amanhecerDepoisDe(MIDNIGHT)
    expect(depois % TICKS_PER_DAY).toBe(0)
    expect(isNight(depois), 'amanheceu').toBe(false)
  })

  it('⚠️ o tique é ABSOLUTO: dormir no dia 7 não devolve pro dia 0', () => {
    // O contador do mundo é acumulado — dele saem o número do dia e a fase da
    // lua. Devolver o tique normalizado faria o jogo VOLTAR no tempo a cada
    // noite dormida, e a lua voltaria pra cheia toda vez.
    const seteDias = TICKS_PER_DAY * 7 + MIDNIGHT
    const depois = amanhecerDepoisDe(seteDias)
    expect(depois).toBeGreaterThan(seteDias)
    expect(Math.floor(depois / TICKS_PER_DAY), 'virou o dia 8').toBe(8)
    // A REGRA INGÊNUA: normalizar. Ela "funciona" e apaga uma semana.
    const ingenua = TICKS_PER_DAY - (seteDias % TICKS_PER_DAY) + (seteDias % TICKS_PER_DAY)
    expect(ingenua).toBeLessThan(seteDias)
  })

  it('nunca pula mais de um dia', () => {
    for (const t of [MIDNIGHT, MIDNIGHT + 500, TICKS_PER_DAY - 1]) {
      const d = amanhecerDepoisDe(t)
      expect(d - t).toBeGreaterThan(0)
      expect(d - t).toBeLessThanOrEqual(TICKS_PER_DAY)
    }
  })
})

describe('roquecraft - a cama no catálogo e no save', () => {
  it('só o pé é item; a cabeceira existe no mundo e dropa o pé', () => {
    expect(itemDef('bed'), 'a peça sumiu do inventário').toBeTruthy()
    expect(itemDef('bedHead'), 'a cabeceira virou item e duplicou a cama').toBeNull()
    expect(BLOCKS[ID_CABECEIRA].drops).toBe('bed')
    expect(BLOCKS[ID_PE].drops ?? 'bed').toBe('bed')
  })

  it('as duas metades têm a mesma altura e as duas chamam pra dormir', () => {
    expect(BLOCKS[ID_PE].slab).toBe(BLOCKS[ID_CABECEIRA].slab)
    expect(BLOCKS[ID_PE].slab).toBeGreaterThan(0.5)
    expect(BLOCKS[ID_PE].slab).toBeLessThan(1)
    expect(BLOCKS[ID_PE].interact).toBe('sleep')
    expect(BLOCKS[ID_CABECEIRA].interact, 'clicar na cabeceira também tem que dormir').toBe('sleep')
  })

  it('nenhuma id de bloco está duplicada', () => {
    // A cama entrou com ids escritas à mão (109 e 110) num arquivo onde escada
    // e laje geram as suas em laço. Duplicar uma id não dá erro: o último a
    // registrar vence, e um bloco some do jogo em silêncio.
    const ids = Object.values(BLOCKS).map((b) => b.id)
    expect(new Set(ids).size, 'há id repetida em blocks.js').toBe(ids.length)
  })

  it('três lãs sobre três tábuas dão UMA cama', () => {
    const r = RECIPES.find((x) => x.result === 'bed')
    expect(r).toBeTruthy()
    expect(r.count).toBe(1)
    expect(r.pattern).toEqual(['LLL', 'MMM'])
  })

  it('o ponto de renascimento sobrevive ao save', () => {
    const p = buildSavePayload({ seed: 1, renascimento: { x: 12.5, y: 70, z: -3.5 } })
    expect(p.version, 'a cama exigiu v4').toBeGreaterThanOrEqual(4)
    expect(parseSave(p).renascimento).toEqual({ x: 12.5, y: 70, z: -3.5 })
  })

  it('save antigo, sem cama, nasce onde o mundo manda', () => {
    expect(parseSave({ version: 3, seed: 1 }).renascimento).toBeNull()
    expect(buildSavePayload({ seed: 1 }).renascimento).toBeNull()
  })

  it('ponto com número quebrado é descartado, não gravado', () => {
    // Um `{x: NaN}` gravado vira renascimento em lugar nenhum, e o jogador cai
    // do mundo ao morrer — falha que só aparece na pior hora possível.
    expect(
      buildSavePayload({ seed: 1, renascimento: { x: NaN, y: 70, z: 0 } }).renascimento,
    ).toBeNull()
    expect(parseSave({ version: 4, seed: 1, renascimento: { x: 1, y: 2 } }).renascimento).toBeNull()
  })
})

describe('cama — as bordas exatas', () => {
  it('monstro NA borda exata do raio já conta', () => {
    // `dx*dx + dz*dz <= r2` apertado para `<`: o monstro parado exatamente na
    // linha do raio deixa de contar, e o jogador dorme com ele ao lado. A
    // regra existe para ensinar que a cama não é botão de fugir do perigo.
    const naBorda = [{ x: RAIO_DE_MONSTRO, z: 0 }]
    expect(monstroPerto(naBorda, 0, 0)).toBe(true)

    const umPassoAlem = [{ x: RAIO_DE_MONSTRO + 0.001, z: 0 }]
    expect(monstroPerto(umPassoAlem, 0, 0)).toBe(false)
  })

  it('sem monstro nenhum, ninguém está perto', () => {
    // `return true` dentro do laço virando `false` deixaria a função responder
    // "não tem monstro" SEMPRE — e ninguém veria, porque conseguir dormir é o
    // resultado que se espera.
    expect(monstroPerto([], 0, 0)).toBe(false)
    expect(monstroPerto([{ x: 100, z: 100 }], 0, 0)).toBe(false)
    expect(
      monstroPerto(
        [
          { x: 100, z: 100 },
          { x: 1, z: 1 },
        ],
        0,
        0,
      ),
    ).toBe(true)
  })

  it('olhar em 45° exato deita a cama no eixo X', () => {
    // `Math.abs(dirX) >= Math.abs(dirZ)`: o empate exato vai pro X, e é
    // determinístico de propósito — dois cliques iguais têm que dar a MESMA
    // cama. Apertado para `>`, a diagonal perfeita passa a cair no Z.
    const livre = () => true
    const apoiado = () => true
    const destino = { x: 0, y: 64, z: 0 }
    const berco = encaixarCama({ item: 'bed', destino, dirX: 1, dirZ: 1, livre, apoiado })
    expect(berco.cabeceira.x).toBe(1)
    expect(berco.cabeceira.z).toBe(0)
  })

  it('o sinal do eixo dominante decide o lado, e o zero conta como positivo', () => {
    // `dirX >= 0 ? 1 : -1`: olhar com componente X exatamente zero cai no lado
    // positivo. Apertado para `>`, a cama vira ao contrário nesse caso.
    const livre = () => true
    const apoiado = () => true
    const destino = { x: 0, y: 64, z: 0 }
    expect(
      encaixarCama({ item: 'bed', destino, dirX: 0, dirZ: 0, livre, apoiado }).cabeceira.x,
    ).toBe(1)
    expect(
      encaixarCama({ item: 'bed', destino, dirX: -0.9, dirZ: 0.1, livre, apoiado }).cabeceira.x,
    ).toBe(-1)
    expect(
      encaixarCama({ item: 'bed', destino, dirX: 0.1, dirZ: 0.9, livre, apoiado }).cabeceira.z,
    ).toBe(1)
    expect(
      encaixarCama({ item: 'bed', destino, dirX: 0.1, dirZ: -0.9, livre, apoiado }).cabeceira.z,
    ).toBe(-1)
  })

  it('só a cama encaixa cama', () => {
    // `item !== 'bed'` invertido faz TODO item que não é cama tentar encaixar
    // duas células — e a cama de verdade parar de funcionar.
    const livre = () => true
    const apoiado = () => true
    const destino = { x: 0, y: 64, z: 0 }
    expect(encaixarCama({ item: 'stone', destino, dirX: 1, dirZ: 0, livre, apoiado })).toBeNull()
    expect(encaixarCama({ item: 'bed', destino, dirX: 1, dirZ: 0, livre, apoiado })).toBeTruthy()
  })

  it('orientação ZERO é uma orientação, não ausência dela', () => {
    // ⚠️ AQUI O `??` DECIDE O JOGO. As orientações são 0, 1, 4 e 5, e a 0 é a
    // cama virada pro +X. Com `||`, essa cama — e só ela — devolve `null`, e
    // `outraMetade` deixa de achar a metade parceira: quebrar um lado some com
    // o outro e sobra meia cama no mundo.
    const viradaPraMaisX = Object.keys(BLOCKS).find((id) => BLOCKS[id]?.cama?.orient === 0)
    expect(viradaPraMaisX, 'a tabela precisa ter uma cama de orientação 0').toBeTruthy()
    expect(orientDaCama(Number(viradaPraMaisX))).toBe(0)
  })

  it('bloco que não é cama não tem orientação', () => {
    // `?? null` também é o que devolve `null` — e não `undefined` — para quem
    // não é cama. Quem lê isso compara com `null`.
    expect(orientDaCama(BLOCK_BY_KEY.stone.id)).toBeNull()
    expect(orientDaCama(999999)).toBeNull()
    expect(typeof orientDaCama(ID_PE)).toBe('number')
  })
})
