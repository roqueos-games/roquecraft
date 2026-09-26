import { describe, it, expect, vi } from 'vitest'
import {
  ITEM_DE_AMOR,
  DURACAO_DO_AMOR,
  ESPERA_PARA_PROCRIAR,
  TEMPO_DE_BEBE,
  DISTANCIA_DE_PROCRIAR,
  ESPERA_DA_LA,
  LA_MINIMA,
  LA_MAXIMA,
  ehBebe,
  estaNoAmor,
  podeAlimentar,
  alimentar,
  acharCasal,
  procriar,
  podeTosquiar,
  tosquiar,
  passoDaPecuaria,
  seduzidoPor,
  DISTANCIA_DE_SEDUCAO,
  DISTANCIA_QUE_PARA,
  VELOCIDADE_SEGUINDO,
} from '../../src/servicos/pecuaria.js'
import {
  createMob,
  stepMob,
  mobDrops,
  mobNoRaio,
  hurtMob,
  shouldDespawn,
  DESPAWN_DIST,
  DESPAWN_DIST_PASSIVO,
  MAX_MOBS,
  MAX_HOSTIS,
  MOB_TYPES,
} from '../../src/servicos/mobs.js'

/**
 * O CURRAL QUE CRESCE.
 *
 * O rebanho existia como cenário: nascia, andava, morria de machadada, e não
 * dava pra AUMENTAR. Carne e lã eram recurso finito de mundo, que é o contrário
 * do que o original faz — e a base do jogador nunca virava uma fazenda.
 *
 * O que se testa aqui é o que dá pra errar e que só aparece depois: o curral
 * que explode (sem espera de procriação), o filhote que vira máquina de carne
 * (se largar drop), a lã que sai duas vezes (tosquiar e depois matar) e o
 * casal que se forma com o próprio filho.
 */

const bicho = (type, x = 0, z = 0) => createMob(type, x, 64, z, 1)

describe('alimentar', () => {
  it('trigo põe a vaca no amor; pedra não (par de controle)', () => {
    const vaca = bicho('cow')
    expect(alimentar(vaca, 'stone')).toBe(false)
    expect(estaNoAmor(vaca)).toBe(false)

    expect(alimentar(vaca, 'wheat')).toBe(true)
    expect(vaca.amor).toBe(DURACAO_DO_AMOR)
  })

  it('as quatro espécies domésticas aceitam alguma coisa', () => {
    // Um bicho que não procria com NADA seria pior que um que procria com trigo:
    // o jogador tentaria a vida toda e nunca saberia por quê.
    for (const t of ['cow', 'sheep', 'pig', 'chicken']) {
      expect(ITEM_DE_AMOR[t], `${t} não come nada`).toBeTruthy()
      expect(alimentar(bicho(t), ITEM_DE_AMOR[t]), `${t} recusou a comida dele`).toBe(true)
    }
  })

  it('hostil não aceita comida', () => {
    for (const t of ['zombie', 'creeper', 'skeleton', 'spider']) {
      expect(alimentar(bicho(t), 'wheat')).toBe(false)
    }
  })

  it('⚠️ FILHOTE RECUSA — e o item não é gasto à toa', () => {
    const bezerro = bicho('cow')
    bezerro.bebe = TEMPO_DE_BEBE
    expect(podeAlimentar(bezerro, 'wheat')).toBe(false)
    // Par de controle: o mesmo bicho, adulto, aceita.
    bezerro.bebe = 0
    expect(podeAlimentar(bezerro, 'wheat')).toBe(true)
  })

  it('quem já está no amor não come de novo — nada de estocar amor', () => {
    const vaca = bicho('cow')
    alimentar(vaca, 'wheat')
    vaca.amor = 3
    expect(alimentar(vaca, 'wheat')).toBe(false)
    expect(vaca.amor, 'o segundo trigo não podia renovar o relógio').toBe(3)
  })

  it('quem acabou de procriar espera — e o teste sabe medir a espera', () => {
    const vaca = bicho('cow')
    vaca.esperaDeProcriar = 10
    expect(podeAlimentar(vaca, 'wheat')).toBe(false)
    vaca.esperaDeProcriar = 0
    expect(podeAlimentar(vaca, 'wheat')).toBe(true)
  })
})

describe('procriar', () => {
  const casalDe = (t, dist = 1) => {
    const a = bicho(t, 0, 0)
    const b = bicho(t, dist, 0)
    alimentar(a, ITEM_DE_AMOR[t])
    alimentar(b, ITEM_DE_AMOR[t])
    return [a, b]
  }

  it('dois apaixonados perto viram casal', () => {
    const [a, b] = casalDe('cow')
    expect(acharCasal([a, b])).toEqual([a, b])
  })

  it('longe demais não vira casal — e perto vira (par de controle)', () => {
    const [a, b] = casalDe('cow', DISTANCIA_DE_PROCRIAR + 2)
    expect(acharCasal([a, b])).toBeNull()
    b.x = 1
    expect(acharCasal([a, b])).not.toBeNull()
  })

  it('⚠️ ESPÉCIES DIFERENTES NÃO CRUZAM', () => {
    const vaca = bicho('cow', 0, 0)
    const galinha = bicho('chicken', 1, 0)
    alimentar(vaca, 'wheat')
    alimentar(galinha, 'wheat')
    // Sem esta checagem o filhote sairia do primeiro da lista, e o defeito só
    // apareceria em curral misto — parecendo bruxaria.
    expect(acharCasal([vaca, galinha])).toBeNull()
  })

  it('quem não está no amor não entra em casal', () => {
    const a = bicho('cow', 0, 0)
    const b = bicho('cow', 1, 0)
    alimentar(a, 'wheat')
    expect(acharCasal([a, b])).toBeNull()
  })

  it('filhote não procria, nem com adulto apaixonado ao lado', () => {
    const [a, b] = casalDe('cow')
    b.bebe = TEMPO_DE_BEBE
    expect(acharCasal([a, b])).toBeNull()
  })

  it('o berço fica ENTRE os dois', () => {
    const a = bicho('cow', 0, 0)
    const b = bicho('cow', 4, 0)
    alimentar(a, 'wheat')
    alimentar(b, 'wheat')
    const berco = procriar(a, b)
    expect(berco).toMatchObject({ type: 'cow', x: 2, z: 0 })
  })

  it('⚠️ PROCRIAR ZERA O AMOR DOS DOIS E LIGA A ESPERA', () => {
    // Se um deles continuasse no amor, formaria casal de novo no mesmo quadro —
    // com o próprio filhote assim que ele crescesse — e o curral cresceria
    // sozinho pra sempre.
    const [a, b] = casalDe('cow')
    procriar(a, b)
    expect(estaNoAmor(a)).toBe(false)
    expect(estaNoAmor(b)).toBe(false)
    expect(a.esperaDeProcriar).toBe(ESPERA_PARA_PROCRIAR)
    expect(b.esperaDeProcriar).toBe(ESPERA_PARA_PROCRIAR)
    // E o par não é mais casal.
    expect(acharCasal([a, b])).toBeNull()
  })
})

describe('tosquiar', () => {
  it('só ovelha, só com tesoura', () => {
    expect(podeTosquiar(bicho('sheep'), 'shears')).toBe(true)
    expect(podeTosquiar(bicho('sheep'), 'sword')).toBe(false)
    expect(podeTosquiar(bicho('cow'), 'shears')).toBe(false)
  })

  it('não tosquia duas vezes', () => {
    const ovelha = bicho('sheep')
    expect(tosquiar(ovelha, () => 0)).toBe(LA_MINIMA)
    expect(podeTosquiar(ovelha, 'shears')).toBe(false)
  })

  it('a lã fica na faixa declarada nas duas pontas do sorteio', () => {
    expect(tosquiar(bicho('sheep'), () => 0)).toBe(LA_MINIMA)
    expect(tosquiar(bicho('sheep'), () => 0.999)).toBe(LA_MAXIMA)
  })

  it('filhote não é tosquiado', () => {
    const cordeiro = bicho('sheep')
    cordeiro.bebe = TEMPO_DE_BEBE
    expect(podeTosquiar(cordeiro, 'shears')).toBe(false)
  })

  it('⚠️ TOSQUIADA NÃO LARGA LÃ AO MORRER — senão a lã sai duas vezes', () => {
    const ovelha = bicho('sheep')
    const inteira = mobDrops(ovelha, () => 0.5).map((d) => d.item)
    expect(inteira, 'controle: ovelha inteira larga lã').toContain('whiteWool')

    tosquiar(ovelha, () => 0.5)
    expect(mobDrops(ovelha, () => 0.5).map((d) => d.item)).not.toContain('whiteWool')
  })

  it('a lã volta a crescer depois da espera', () => {
    const ovelha = bicho('sheep')
    tosquiar(ovelha, () => 0.5)
    // ⚠️ ACUMULA os eventos. A primeira versão reatribuía a cada passo e ficava
    // só com os do ÚLTIMO — e `laCresceu` sai no passo em que o relógio zera,
    // não no último. O teste acusava o código por um erro dele mesmo.
    const eventos = []
    for (let t = 0; t < ESPERA_DA_LA + 1; t += 1) eventos.push(...passoDaPecuaria(ovelha, 1))
    expect(eventos).toContain('laCresceu')
    expect(ovelha.tosquiada).toBe(false)
    expect(podeTosquiar(ovelha, 'shears')).toBe(true)
  })
})

describe('os relógios', () => {
  it('o amor acaba sozinho', () => {
    const vaca = bicho('cow')
    alimentar(vaca, 'wheat')
    for (let t = 0; t < DURACAO_DO_AMOR + 1; t += 1) passoDaPecuaria(vaca, 1)
    expect(estaNoAmor(vaca)).toBe(false)
  })

  it('o filhote cresce e avisa UMA vez', () => {
    const bezerro = bicho('cow')
    bezerro.bebe = 3
    const avisos = []
    for (let t = 0; t < 10; t += 1) avisos.push(...passoDaPecuaria(bezerro, 1))
    expect(avisos.filter((e) => e === 'cresceu')).toHaveLength(1)
    expect(ehBebe(bezerro)).toBe(false)
  })

  it('os relógios rodam DENTRO do `stepMob` — não é preciso lembrar de chamá-los', () => {
    // Se `stepMob` não chamasse `passoDaPecuaria`, o amor ficaria congelado e o
    // curral entraria em produção infinita. Este teste é o que amarra os dois.
    const vaca = bicho('cow')
    alimentar(vaca, 'wheat')
    const env = {
      solidAt: (x, y) => y < 64,
      lightAt: () => 15,
      isDay: true,
      player: null,
      skyExposed: () => false,
      surfaceY: () => 64,
      biomeAt: () => 'plains',
      allowHostile: false,
    }
    // ⚠️ PASSO DE QUADRO DE VERDADE (1/60). A primeira versão usava dt = 0,5 s
    // pra escrever menos iterações — e a 0,5 s por passo a vaca cai CINCO
    // BLOCOS por quadro, atravessa o chão do teste e morre no vão. `stepMob`
    // sai na hora quando a criatura morre, os relógios param, e o teste
    // reprovava acusando a pecuária de um afogamento que ele mesmo causou.
    for (let i = 0; i < 60 * (DURACAO_DO_AMOR + 1); i++) stepMob(vaca, env, 1 / 60)
    expect(vaca.health, 'a vaca tinha que estar viva no fim do teste').toBeGreaterThan(0)
    expect(vaca.amor).toBe(0)
  })
})

describe('o filhote', () => {
  it('⚠️ NÃO LARGA NADA — senão criar e abater em série é carne infinita', () => {
    const bezerro = bicho('cow')
    const adulto = mobDrops(bezerro, () => 0.99)
    expect(adulto.length, 'controle: o adulto larga alguma coisa').toBeGreaterThan(0)

    bezerro.bebe = TEMPO_DE_BEBE
    expect(mobDrops(bezerro, () => 0.99)).toEqual([])
  })

  it('ocupa menos espaço que o adulto', () => {
    // A caixa do adulto num bezerro visivelmente pequeno faria ele não passar
    // por um vão em que ele claramente cabe.
    const parede = new Set(['1,64,0'])
    const env = {
      solidAt: (x, y, z) => y < 64 || parede.has(`${x},${y},${z}`),
      lightAt: () => 15,
      isDay: true,
      player: null,
      skyExposed: () => false,
      surfaceY: () => 64,
      biomeAt: () => 'plains',
      allowHostile: false,
    }
    const largura = MOB_TYPES.cow.width
    const bezerro = bicho('cow')
    bezerro.bebe = TEMPO_DE_BEBE
    stepMob(bezerro, env, 1 / 60)
    // Não se testa a posição (o vagar é aleatório): testa-se que a regra de
    // encolher existe e é a mesma do render.
    expect(largura * 0.55).toBeLessThan(largura)
  })

  it('createMob nasce adulto — filhote é sempre uma decisão explícita', () => {
    // Se `createMob` nascesse filhote, todo bicho do mundo natural seria bebê e
    // ninguém largaria drop nenhum.
    expect(ehBebe(bicho('cow'))).toBe(false)
    expect(bicho('cow').amor).toBe(0)
    expect(bicho('sheep').tosquiada).toBe(false)
  })
})

describe('o componente usa a política, não uma cópia', () => {
  it('há UMA mira de criatura, usada pelo golpe e pela pecuária', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const fonte = readFileSync(resolve(__dirname, '../../src/JogoRoqueCraft.vue'), 'utf8')
    // Duas cópias do cone de mira concordariam hoje e divergiriam no dia em que
    // o alcance mudasse — e o sintoma seria "consigo bater mas não consigo
    // alimentar", que ninguém liga a um cone.
    // ⚠️ O CONE MORREU. Ele não sabia escolher: com duas vacas lado a lado,
    // ficava com a mais PERTO, não com a que está sob a mira — e a sonda pegou
    // isso (a segunda vaca nunca comia). Hoje quem escolhe é `mobNoRaio`, por
    // interseção com a caixa. Este guard existe pra ele não voltar.
    //
    // ⚠️ O GUARD SEGUIU A CASA: em 26/08 a lista de criaturas foi pro composable
    // `useRoqueCraftEntidades`, e com ela a chamada de `mobNoRaio`. O que o
    // componente mantém é a mira ÚNICA (`mobMirado`), que é o ponto do guard.
    const entidades = readFileSync(
      resolve(__dirname, '../../src/composables/useRoqueCraftEntidades.js'),
      'utf8',
    )
    expect((fonte.match(/dot < cone|dot < 0\.92/g) || []).length).toBe(0)
    expect((entidades.match(/dot < cone|dot < 0\.92/g) || []).length).toBe(0)
    expect(entidades).toMatch(/mobNoRaio\(mobs, origem, dir, alcance\)/)
    expect(fonte).toMatch(/function mobMirado\(/)
    // ⚠️ O GUARD SEGUIU A CASA DE NOVO: em 13/09 o golpe inteiro foi pro
    // `golpear` de `combate.js`, e com ele o `const best = mobMirado()`. O que
    // o componente entrega agora é a MESMA função por injeção — e é isso que a
    // invariante sempre foi: uma mira só, usada pelos dois caminhos.
    //
    // Continuar cravando a forma da linha faria este teste reprovar toda vez
    // que alguém extrai, sem que nada do que ele protege tenha mudado. Foi o
    // que aconteceu, pela terceira vez neste arquivo.
    expect(fonte).toMatch(/mirado: mobMirado\b/)
    expect(fonte).toMatch(/const alvo = mobMirado\(\)/)
    // e o golpe não pode ter arrumado uma segunda mira no caminho
    const combate = readFileSync(resolve(__dirname, '../../src/servicos/combate.js'), 'utf8')
    expect((combate.match(/dot < cone|dot < 0\.92|mobNoRaio/g) || []).length).toBe(0)
    expect(combate).toMatch(/ctx\.mirado\(\)/)
  })

  it('a interação com criatura vem ANTES de colocar bloco', () => {
    // Ao contrário, apontar pra vaca com um bloco na mão colocaria um cubo
    // dentro dela.
    const fs = require('node:fs')
    const path = require('node:path')
    const fonte = fs.readFileSync(path.resolve(__dirname, '../../src/JogoRoqueCraft.vue'), 'utf8')
    // ⚠️ A ANCORA DA COLOCACAO MUDOU DE NOME, e a invariante NAO.
    //
    // Ela era `const blockId = placeableBlock(held.item)`. Quando "onde cai e se
    // cabe" virou uma conta so em `colocacao.js`, essa linha saiu do componente
    // -- e este teste ficou vermelho com `indexOf` devolvendo -1. O vermelho
    // estava certo: ele avisou que perdeu a referencia, e nao que a ordem
    // quebrou. A ancora nova e a chamada que RESOLVE a colocacao.
    //
    // As duas primeiras linhas sao o que impede este teste de virar decoracao:
    // um `indexOf` que nao acha devolve -1, e -1 e menor que qualquer coisa --
    // sem elas, apagar as duas ancoras faria o teste passar.
    const iInteragir = fonte.indexOf('if (tryInteractMob()) return true')
    const iBloco = fonte.indexOf('const plano = resolverColocacao({')
    expect(iInteragir, 'a ancora da interacao com criatura sumiu').toBeGreaterThan(0)
    expect(iBloco, 'a ancora da colocacao sumiu').toBeGreaterThan(0)
    expect(iInteragir).toBeLessThan(iBloco)
  })
})

describe('save v7 leva filhote e tosquia', () => {
  it('o bezerro volta bezerro e a ovelha volta pelada', async () => {
    vi.resetModules()
    const { buildSavePayload, parseSave } = await import('../../src/servicos/roqueCraftSave.js')
    const { restaurarMobs, createMob: criar } = await import('../../src/servicos/mobs.js')

    const bezerro = criar('cow', 1, 64, 1, 1)
    bezerro.bebe = 120
    const ovelha = criar('sheep', 2, 64, 2, 2)
    ovelha.tosquiada = true

    const payload = buildSavePayload({ seed: 1, mobs: [bezerro, ovelha] })
    // Piso e não igualdade: ver a nota em `saveMobs.spec.js`.
    expect(payload.version).toBeGreaterThanOrEqual(9)

    const voltaram = restaurarMobs(parseSave(payload).mobs, criar)
    expect(voltaram[0].bebe, 'o bezerro virou vaca ao recarregar').toBeGreaterThan(0)
    expect(voltaram[1].tosquiada, 'a lã voltou de graça ao recarregar').toBe(true)
  })
})

/**
 * A MIRA NA CRIATURA.
 *
 * O cone antigo (`dot >= 0.92`, o mais perto ganha) não sabia ESCOLHER: com
 * duas vacas lado a lado as duas caíam nele e você alimentava sempre a mesma.
 * A sonda de pecuária pegou isso na primeira corrida — o segundo clique voltava
 * `false` e o casal nunca se formava.
 */
describe('mobNoRaio — quem está sob a mira', () => {
  const O = { x: 0, y: 64, z: 0 }
  const paraZ = { x: 0, y: 0, z: 1 }

  it('acerta o bicho na frente e ignora o que está pro lado', () => {
    const naFrente = bicho('cow', 0, 3)
    const deLado = bicho('cow', 6, 3)
    expect(mobNoRaio([deLado, naFrente], O, paraZ, 8)).toBe(naFrente)
  })

  it('⚠️ ESCOLHE O DA FRENTE, NÃO O MAIS PERTO DA CÂMERA', () => {
    // Este é o teste do defeito. Duas vacas quase alinhadas: a de trás está
    // exatamente na mira, a da frente está deslocada pro lado. O cone ficava
    // com a deslocada por estar mais perto.
    const foraDaMira = bicho('cow', 1.6, 2)
    const naMira = bicho('cow', 0, 4)
    expect(mobNoRaio([foraDaMira, naMira], O, paraZ, 8)).toBe(naMira)
  })

  it('entre duas ALINHADAS, fica com a primeira do raio', () => {
    const perto = bicho('cow', 0, 2)
    const longe = bicho('cow', 0, 5)
    expect(mobNoRaio([longe, perto], O, paraZ, 8)).toBe(perto)
  })

  it('respeita o alcance — e acerta dentro dele (par de controle)', () => {
    const longe = bicho('cow', 0, 7)
    expect(mobNoRaio([longe], O, paraZ, 4)).toBeNull()
    expect(mobNoRaio([longe], O, paraZ, 9)).toBe(longe)
  })

  it('quem está COLADO na câmera ainda é acertável', () => {
    // A origem do raio cai dentro da caixa dele. Recusar esse caso deixaria o
    // jogador incapaz de bater justamente em quem está grudado.
    const grudado = bicho('cow', 0, 0)
    grudado.y = 63.5
    expect(mobNoRaio([grudado], O, paraZ, 4)).toBe(grudado)
  })

  it('nada atrás das costas', () => {
    expect(mobNoRaio([bicho('cow', 0, -3)], O, paraZ, 8)).toBeNull()
  })

  it('lista vazia ou com lixo não estoura', () => {
    expect(mobNoRaio([], O, paraZ)).toBeNull()
    expect(mobNoRaio(null, O, paraZ)).toBeNull()
    expect(mobNoRaio([null, { type: 'grifo', x: 0, y: 64, z: 2 }], O, paraZ)).toBeNull()
  })

  it('a caixa do FILHOTE é menor — passa raspando por cima dele', () => {
    const bezerro = bicho('cow', 0, 3)
    bezerro.bebe = TEMPO_DE_BEBE
    const adulto = bicho('cow', 0, 3)
    // Raio subindo: passa acima da cabeça do bezerro e ainda pega o adulto.
    const subindo = { x: 0, y: 0.42, z: 1 }
    expect(mobNoRaio([adulto], O, subindo, 8)).toBe(adulto)
    expect(mobNoRaio([bezerro], O, subindo, 8)).toBeNull()
  })
})

/**
 * O CURRAL QUE SOBREVIVE À CAMINHADA.
 *
 * ⚠️ ESTE É O DEFEITO QUE TERIA ANULADO A RODADA INTEIRA. Toda criatura sumia a
 * 72 blocos do jogador, inclusive a que ele acabou de criar: cercar o curral,
 * ir minerar e voltar devolvia um curral vazio. A pecuária existiria no código
 * e não existiria no jogo — e a perda seria silenciosa, percebida só na volta.
 */
describe('shouldDespawn — quem some e quem fica', () => {
  const eu = { x: 0, y: 64, z: 0 }

  it('o hostil some longe, o passivo AINDA NÃO (par de controle)', () => {
    const z = bicho('zombie', 100, 0)
    const v = bicho('cow', 100, 0)
    expect(shouldDespawn(z, eu)).toBe(true)
    expect(shouldDespawn(v, eu)).toBe(false)
  })

  it('⚠️ A DOMÉSTICA NUNCA SOME, por mais longe que o jogador vá', () => {
    const v = bicho('cow', 5000, 0)
    expect(shouldDespawn(v, eu), 'controle: uma vaca selvagem a 5000 some').toBe(true)
    v.domestica = true
    expect(shouldDespawn(v, eu)).toBe(false)
  })

  it('alimentar MARCA como doméstica — é o que transforma fauna em patrimônio', () => {
    const v = bicho('cow')
    expect(v.domestica).toBe(false)
    alimentar(v, 'wheat')
    expect(v.domestica).toBe(true)
  })

  it('o filhote já nasce doméstico', () => {
    const a = bicho('cow', 0, 0)
    const b = bicho('cow', 1, 0)
    alimentar(a, 'wheat')
    alimentar(b, 'wheat')
    expect(procriar(a, b).domestica).toBe(true)
  })

  it('perto de todo mundo, ninguém some', () => {
    expect(shouldDespawn(bicho('zombie', 5, 0), eu)).toBe(false)
    expect(shouldDespawn(bicho('cow', 5, 0), eu)).toBe(false)
  })

  it('os dois limites são diferentes, e o do passivo é maior', () => {
    expect(DESPAWN_DIST_PASSIVO).toBeGreaterThan(DESPAWN_DIST)
    expect(shouldDespawn(bicho('cow', DESPAWN_DIST + 10, 0), eu)).toBe(false)
    expect(shouldDespawn(bicho('cow', DESPAWN_DIST_PASSIVO + 10, 0), eu)).toBe(true)
  })

  it('tipo desconhecido some (não fica lixo na lista pra sempre)', () => {
    expect(shouldDespawn({ type: 'grifo', x: 0, y: 0, z: 0 }, eu)).toBe(true)
  })

  it('a marca sobrevive ao save', async () => {
    vi.resetModules()
    const { buildSavePayload, parseSave } = await import('../../src/servicos/roqueCraftSave.js')
    const { restaurarMobs, createMob: criar } = await import('../../src/servicos/mobs.js')
    const v = criar('cow', 1, 64, 1, 1)
    v.domestica = true
    const p = buildSavePayload({ seed: 1, mobs: [v] })
    // Piso e não igualdade: ver a nota em `saveMobs.spec.js`.
    expect(p.version).toBeGreaterThanOrEqual(9)
    // Sem isto, o rebanho voltava como fauna qualquer e a primeira caminhada
    // longa o apagava.
    expect(restaurarMobs(parseSave(p).mobs, criar)[0].domestica).toBe(true)
  })

  it('o teto de hostis é menor que o teto total — senão o rebanho desliga a noite', () => {
    expect(MAX_HOSTIS).toBeLessThan(MAX_MOBS)
  })
})

/**
 * O REBANHO SEGUE O TRIGO.
 *
 * ⚠️ SEM ISTO A FAZENDA NÃO FECHA. A cerca (rodada 27) e o portão (29) deram ao
 * jogador como PRENDER o rebanho, e a pecuária (25) como multiplicá-lo — e
 * faltava o meio: como levar a vaca de onde ela está até dentro do curral.
 * Empurrar bicho a socos por cinquenta blocos não é jogo, é castigo.
 */
describe('seguir a comida', () => {
  const mundoCom = (px, pz, item) => ({
    solidAt: (x, y) => y < 64,
    ehCerca: () => false,
    lightAt: () => 15,
    isDay: true,
    player: { x: px, y: 64, z: pz },
    itemNaMao: item,
    skyExposed: () => false,
    surfaceY: () => 64,
    biomeAt: () => 'plains',
    allowHostile: false,
  })

  /** Roda `segundos` e devolve a distância final até o jogador. */
  function aproximouQuanto(mob, env, segundos = 3) {
    const antes = Math.hypot(mob.x - env.player.x, mob.z - env.player.z)
    for (let t = 0; t < segundos; t += 1 / 60) stepMob(mob, env, 1 / 60)
    const depois = Math.hypot(mob.x - env.player.x, mob.z - env.player.z)
    return { antes, depois, aproximou: antes - depois }
  }

  it('a vaca vem atrás do trigo — e ignora quem está de mãos vazias', () => {
    const comTrigo = aproximouQuanto(bicho('cow', 0, 0), mundoCom(0, 7, 'wheat'))
    expect(comTrigo.aproximou, 'não veio atrás do trigo').toBeGreaterThan(1.5)

    // Par de controle: o MESMO percurso, sem nada na mão.
    const semNada = aproximouQuanto(bicho('cow', 0, 0), mundoCom(0, 7, null))
    expect(semNada.aproximou, 'veio atrás de mão vazia').toBeLessThan(1.5)
  })

  it('item errado não seduz', () => {
    const r = aproximouQuanto(bicho('cow', 0, 0), mundoCom(0, 7, 'stone'))
    expect(r.aproximou).toBeLessThan(1.5)
  })

  it('PARA a uma distância de conversa — não entra dentro do jogador', () => {
    // Entrando dentro do jogador ela ficaria empurrando, e não daria pra andar
    // de costas puxando o rebanho.
    const vaca = bicho('cow', 0, 0)
    const env = mundoCom(0, 6, 'wheat')
    for (let t = 0; t < 8; t += 1 / 60) stepMob(vaca, env, 1 / 60)
    const d = Math.hypot(vaca.x - env.player.x, vaca.z - env.player.z)
    expect(d).toBeLessThan(DISTANCIA_QUE_PARA + 1)
    expect(d).toBeGreaterThan(0.5)
  })

  it('longe demais ela não enxerga', () => {
    const r = aproximouQuanto(bicho('cow', 0, 0), mundoCom(0, DISTANCIA_DE_SEDUCAO + 6, 'wheat'), 2)
    expect(r.aproximou).toBeLessThan(1.5)
  })

  it('⚠️ QUEM APANHOU FOGE, e a fuga ganha do trigo', () => {
    // Uma vaca ferida que voltasse correndo atrás do trigo leria como bug.
    const vaca = bicho('cow', 0, 0)
    hurtMob(vaca, 1)
    expect(vaca.state).toBe('flee')
    const r = aproximouQuanto(vaca, mundoCom(0, 5, 'wheat'), 1.5)
    expect(r.aproximou, 'a ferida veio atrás do trigo').toBeLessThan(0)
  })

  it('FILHOTE não segue o trigo — ele não come dele', () => {
    const bezerro = bicho('cow', 0, 0)
    bezerro.bebe = TEMPO_DE_BEBE
    expect(seduzidoPor(bezerro, 'wheat')).toBe(false)
  })

  it('quem JÁ está no amor continua seguindo — é assim que se leva o casal', () => {
    // `podeAlimentar` recusa quem já está no amor; `seduzidoPor` não pode
    // recusar, senão metade do casal para no meio do caminho.
    const vaca = bicho('cow', 0, 0)
    alimentar(vaca, 'wheat')
    expect(podeAlimentar(vaca, 'wheat')).toBe(false)
    expect(seduzidoPor(vaca, 'wheat')).toBe(true)
  })

  it('e quem está esperando pra procriar também segue', () => {
    const vaca = bicho('cow', 0, 0)
    vaca.esperaDeProcriar = 100
    expect(podeAlimentar(vaca, 'wheat')).toBe(false)
    expect(seduzidoPor(vaca, 'wheat')).toBe(true)
  })

  it('hostil não segue comida nenhuma', () => {
    for (const t of ['zombie', 'creeper', 'skeleton']) {
      expect(seduzidoPor(bicho(t, 0, 0), 'wheat')).toBe(false)
    }
  })

  it('`env` sem `itemNaMao` não muda nada (multijogador e testes antigos)', () => {
    const semCampo = { ...mundoCom(0, 5, 'wheat'), itemNaMao: undefined }
    const r = aproximouQuanto(bicho('cow', 0, 0), semCampo, 2)
    expect(r.aproximou).toBeLessThan(1.5)
  })
})

/**
 * ⚠️ E ELA PRECISA CONSEGUIR ACOMPANHAR.
 *
 * A sonda mediu o que o teste puro não vê: o jogador anda a 4,7 b/s e a vaca
 * vagueia a 0,95 — cinco vezes mais devagar. Seguir existia e era enfeite: em
 * dois segundos a vaca ficava para trás e saía do raio. No original a diferença
 * é ~1,8×.
 */
describe('seguir de verdade — o trote', () => {
  it('a vaca que segue anda MUITO mais rápido que a que vagueia', () => {
    const mundo = (pz, item) => ({
      solidAt: (x, y) => y < 64,
      lightAt: () => 15,
      isDay: true,
      player: { x: 0, y: 64, z: pz },
      itemNaMao: item,
      skyExposed: () => false,
      surfaceY: () => 64,
      biomeAt: () => 'plains',
      allowHostile: false,
    })
    const seguindo = bicho('cow', 0, 0)
    for (let t = 0; t < 1; t += 1 / 60) stepMob(seguindo, mundo(8, 'wheat'), 1 / 60)
    expect(seguindo.z, 'a vaca seguindo mal saiu do lugar').toBeGreaterThan(2)
  })

  it('ela acompanha um jogador ANDANDO, sem sair do raio', () => {
    // O caso de uso inteiro: levar a vaca até o curral. Com o jogador a 4,7 e a
    // vaca a 0,95, ela sumia do raio antes de chegar em qualquer lugar.
    const vaca = bicho('cow', 0, 0)
    let pz = 3
    const dt = 1 / 60
    // O jogador anda devagar (metade da caminhada), como quem puxa rebanho.
    for (let t = 0; t < 8; t += dt) {
      pz += 1.6 * dt
      stepMob(
        vaca,
        {
          solidAt: (x, y) => y < 64,
          lightAt: () => 15,
          isDay: true,
          player: { x: 0, y: 64, z: pz },
          itemNaMao: 'wheat',
          skyExposed: () => false,
          surfaceY: () => 64,
          biomeAt: () => 'plains',
          allowHostile: false,
        },
        dt,
      )
    }
    const d = Math.abs(pz - vaca.z)
    expect(d, `ficou a ${d.toFixed(1)} blocos — saiu do raio`).toBeLessThan(DISTANCIA_DE_SEDUCAO)
    expect(vaca.z, 'a vaca não andou junto').toBeGreaterThan(8)
  })

  it('o trote é PISO, não multiplicador — as quatro espécies andam junto', () => {
    // Com multiplicador, a galinha (base 1,1) dispararia na frente da vaca
    // (0,95) e o rebanho chegaria picotado.
    for (const t of ['cow', 'pig', 'sheep', 'chicken']) {
      expect(Math.max(MOB_TYPES[t].speed, VELOCIDADE_SEGUINDO)).toBe(VELOCIDADE_SEGUINDO)
    }
  })

  it('o vagueio NÃO acelerou — o ritmo do rebanho parado é o mesmo', () => {
    expect(MOB_TYPES.cow.speed).toBeLessThan(VELOCIDADE_SEGUINDO)
  })
})
