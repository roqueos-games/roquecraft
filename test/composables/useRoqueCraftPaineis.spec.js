import { describe, it, expect, vi, afterEach } from 'vitest'
import { ref } from 'vue'

// ⚠️ A CONEXÃO COM O ROQUEOS É MOCKADA AQUI, e o motivo é o mesmo do
// `useAppMakerJob.spec`: `falaDoRoqueOS` importa a store, a store importa o boot
// do firebase, e o boot exige `FIREBASE_API_KEY` — um composable de painel de
// jogo não pode precisar de credencial de banco para ser testado. O arquivo
// mockado tem 34 linhas e teste próprio (`falaDoRoqueOS.spec.js`), onde a store
// e o HTTP entram falsos.
//
// `null` é o caso REAL da maioria das partidas: sem Modo Servidor não há
// modelo, e a fala local responde.
const ponte = vi.hoisted(() => ({ modelo: null }))
vi.mock('../../src/servicos/falaDoRoqueOS.js', () => ({
  criarFalaDoRoqueOS: () => ponte.modelo,
}))

import { useRoqueCraftPaineis } from '../../src/composables/useRoqueCraftPaineis.js'
import { criarMobilia, abrirMobilia, SLOTS_BAU } from '../../src/servicos/mobilia.js'
import { sortearOfertas, MOEDA } from '../../src/servicos/comercio.js'
import { addItem, removeItem, espacoPara } from '../../src/servicos/inventory.js'

//
// AS TELAS QUE UM BLOCO OU UM BICHO ABREM.
//
// Baú, fornalha, suporte e comércio são quatro coisas no mundo e UMA na
// interface. O que se prova aqui é a LIGAÇÃO: que o painel lê a mobília certa,
// que o clique chega na regra, que fechar não come o cursor, e que o comércio
// e a mobília não se atropelam. As regras em si estão em `mobilia.js`,
// `fermentacao.js` e `comercio.js`, com testes próprios.
//
// ⚠️ Isto tudo morava em setenta linhas do componente e por isso NENHUMA delas
// tinha teste — o único jeito de exercitá-las era abrir o jogo e clicar.

function montar({ itens = {}, cursorInicial = null } = {}) {
  const mobilia = criarMobilia()
  const inventario = ref(new Array(36).fill(null))
  for (const [k, n] of Object.entries(itens)) addItem(inventario.value, k, n)
  const cursor = ref(cursorInicial)
  const log = {
    salvou: 0,
    avisos: [],
    prendeu: 0,
    mudou: [],
    desfazeres: [],
    queimou: [],
    rege: true,
  }
  const p = useRoqueCraftPaineis({
    mobilia: () => mobilia,
    mobiliaMudou: (k, desfazer) => {
      log.mudou.push(k)
      log.desfazeres.push(desfazer)
    },
    mobiliaQueimou: (k) => log.queimou.push(k),
    regeMobilia: () => log.rege,
    inventario: { get: () => inventario.value, set: (v) => (inventario.value = v) },
    cursor: { get: () => cursor.value, set: (v) => (cursor.value = v) },
    maquina: {
      remover: removeItem,
      adicionar: addItem,
      espacoPara: (inv, item) => espacoPara(inv, item),
    },
    salvar: () => log.salvou++,
    avisar: (c) => log.avisos.push(c),
    prenderPonteiro: () => log.prendeu++,
    naMao: () => log.naMao,
    quando: () => 7,
  })
  return { p, mobilia, inventario, cursor, log }
}

const conta = (inv, item) => inv.reduce((n, s) => n + (s?.item === item ? s.count : 0), 0)

describe('a mobília na tela', () => {
  it('sem nada aberto, a tela não mostra nada', () => {
    const { p } = montar()
    expect(p.mobiliaAberta.value).toBe(null)
    expect(p.conteudoAberto.value).toEqual([])
    expect(p.fogoAberto.value).toBe(0)
    expect(p.progressoAberto.value).toBe(0)
  })

  it('o baú vira 27 slots planos', () => {
    const { p, mobilia } = montar()
    const e = abrirMobilia(mobilia, 1, 2, 3, 'bau')
    e.slots[0] = { item: 'stone', count: 4 }
    p.aberto.value = { tipo: 'bau', x: 1, y: 2, z: 3 }
    expect(p.conteudoAberto.value).toHaveLength(SLOTS_BAU)
    expect(p.conteudoAberto.value[0]).toEqual({ item: 'stone', count: 4 })
  })

  it('a fornalha vira entrada, combustível e saída — nessa ordem', () => {
    const { p, mobilia } = montar()
    const e = abrirMobilia(mobilia, 0, 0, 0, 'fornalha')
    e.entrada = { item: 'raw_iron', count: 1 }
    e.combustivel = { item: 'coal', count: 2 }
    p.aberto.value = { tipo: 'fornalha', x: 0, y: 0, z: 0 }
    expect(p.conteudoAberto.value.map((s) => s?.item)).toEqual(['raw_iron', 'coal', undefined])
  })

  it('o suporte vira ingrediente e TRÊS garrafas', () => {
    const { p, mobilia } = montar()
    const e = abrirMobilia(mobilia, 5, 5, 5, 'suporte')
    e.ingrediente = { item: 'nether_wart', count: 1 }
    e.garrafas[1] = { item: 'water_bottle', count: 1 }
    p.aberto.value = { tipo: 'suporte', x: 5, y: 5, z: 5 }
    expect(p.conteudoAberto.value).toHaveLength(4)
    expect(p.conteudoAberto.value[0].item).toBe('nether_wart')
    expect(p.conteudoAberto.value[2].item).toBe('water_bottle')
  })

  it('a MESMA barra serve fornalha e suporte', () => {
    // Duas props separadas fariam a tela conhecer os dois formatos internos
    // para desenhar um retângulo.
    const { p, mobilia } = montar()
    const f = abrirMobilia(mobilia, 0, 0, 0, 'fornalha')
    f.entrada = { item: 'raw_iron', count: 1 }
    f.progresso = 2.5
    p.aberto.value = { tipo: 'fornalha', x: 0, y: 0, z: 0 }
    expect(p.progressoAberto.value).toBeCloseTo(0.25)

    const s = abrirMobilia(mobilia, 1, 1, 1, 'suporte')
    s.progresso = 15
    p.aberto.value = { tipo: 'suporte', x: 1, y: 1, z: 1 }
    p.avisarMobilia()
    // 15 de 20 no suporte; 2,5 de 10 na fornalha. A MESMA prop, duas escalas.
    expect(p.progressoAberto.value).toBeCloseTo(0.75)
  })

  it('a mobília não é reativa: sem BUMPAR a revisão, a tela não vê a mudança', () => {
    // ⚠️ É o preço escolhido, e está no cabeçalho do composable: a mobília é um
    // Map de objetos simples, escrito 60×/s pelo passo do mundo. Um `Proxy` no
    // caminho quente para redesenhar um painel quase sempre fechado seria caro.
    //
    // ⚠️ E A PROVA É COM A BARRA, NÃO COM O BAÚ. O baú devolve `e.slots`, o
    // array VIVO: mexer nele aparece na leitura seguinte mesmo com o `computed`
    // em cache, e a primeira versão deste teste concluiu daí que a revisão não
    // fazia falta. O número da barra é derivado, e aí o cache manda.
    const { p, mobilia } = montar()
    const f = abrirMobilia(mobilia, 0, 0, 0, 'fornalha')
    f.entrada = { item: 'raw_iron', count: 1 }
    f.progresso = 0
    p.aberto.value = { tipo: 'fornalha', x: 0, y: 0, z: 0 }
    expect(p.progressoAberto.value).toBe(0)
    f.progresso = 5
    expect(p.progressoAberto.value).toBe(0) // o computed ainda não viu
    p.avisarMobilia()
    expect(p.progressoAberto.value).toBeCloseTo(0.5)
  })
})

describe('o clique e o fechar', () => {
  it('o clique chega na regra e agenda o save', () => {
    const { p, mobilia, cursor, log } = montar()
    const e = abrirMobilia(mobilia, 0, 0, 0, 'bau')
    e.slots[3] = { item: 'stone', count: 9 }
    p.aberto.value = { tipo: 'bau', x: 0, y: 0, z: 0 }
    p.onContainerClick(3, 'left')
    expect(cursor.value).toEqual({ item: 'stone', count: 9 })
    expect(e.slots[3]).toBe(null)
    expect(log.salvou).toBe(1)
  })

  it('clique que não muda nada NÃO agenda save', () => {
    const { p, mobilia, log } = montar()
    abrirMobilia(mobilia, 0, 0, 0, 'bau')
    p.aberto.value = { tipo: 'bau', x: 0, y: 0, z: 0 }
    p.onContainerClick(0, 'shift') // slot vazio
    expect(log.salvou).toBe(0)
  })

  it('fechar com o cursor cheio DEVOLVE o item — RC-01', () => {
    // O item na mão costuma ser DO BAÚ, e fechar apagava as 64 pedras.
    const { p, mobilia, inventario, cursor } = montar({
      cursorInicial: { item: 'stone', count: 64 },
    })
    abrirMobilia(mobilia, 0, 0, 0, 'bau')
    p.aberto.value = { tipo: 'bau', x: 0, y: 0, z: 0 }
    p.fecharMobilia()
    expect(cursor.value).toBe(null)
    expect(conta(inventario.value, 'stone')).toBe(64)
    expect(p.aberto.value).toBe(null)
  })
})

describe('o comércio', () => {
  const aldeao = (profissao = 'fazendeiro') => ({
    id: 'm1',
    type: 'aldeao',
    profissao,
    ofertas: sortearOfertas(profissao, () => 0),
    comercia: true,
  })

  it('sem aldeão aberto, não há oferta nenhuma', () => {
    const { p } = montar()
    expect(p.ofertasDoAldeao.value).toEqual([])
  })

  it('abre só com quem comercia', () => {
    const { p } = montar()
    expect(p.comercio.abrirCom({ id: 'x' }, false)).toBe(false)
    expect(p.aldeaoAberto.value).toBe(null)
    const a = aldeao()
    expect(p.comercio.abrirCom(a, true)).toBe(true)
    // ⚠️ `toBe` e não `toEqual`: a IDENTIDADE é o que importa aqui. Com um `ref`
    // fundo o Vue devolveria um `Proxy`, e o `m === aberto.get()` do passo de
    // estoque nunca casaria com o mob cru da lista de criaturas — a tela aberta
    // jamais redesenharia. Por isso o composable usa `shallowRef`.
    expect(p.aldeaoAberto.value).toBe(a)
  })

  it('cada oferta vem com o MOTIVO da recusa, não só um booleano', () => {
    // "não tenho o que pagar" e "a oferta acabou" são coisas diferentes, e o
    // jogador precisa saber qual das duas foi.
    const { p } = montar()
    p.comercio.abrirCom(aldeao(), true)
    const o = p.ofertasDoAldeao.value
    expect(o.length).toBeGreaterThan(0)
    expect(o.every((x) => typeof x.motivo === 'string')).toBe(true)
  })

  it('com o pagamento na mão, a troca fecha e o inventário muda de referência', () => {
    const a = aldeao()
    const compra = a.ofertas.findIndex((o) => o.recebe.item === MOEDA)
    const paga = a.ofertas[compra].paga[0]
    const { p, inventario, log } = montar({ itens: { [paga.item]: paga.count * 2 } })
    p.comercio.abrirCom(a, true)
    const antes = inventario.value
    expect(p.comercio.trocar(compra)).toBe(true)
    // ⚠️ A TROCA DE REFERÊNCIA É O QUE A TELA VÊ: `remover`/`adicionar` mutam o
    // array, e sem trocar a referência o inventário muda e nada redesenha.
    expect(inventario.value).not.toBe(antes)
    expect(conta(inventario.value, MOEDA)).toBe(a.ofertas[compra].recebe.count)
    expect(conta(inventario.value, paga.item)).toBe(paga.count)
    expect(log.salvou).toBe(1)
  })

  it('sem o pagamento: avisa com a chave certa, e NADA sai do inventário', () => {
    const a = aldeao()
    const compra = a.ofertas.findIndex((o) => o.recebe.item === MOEDA)
    const { p, inventario, log } = montar()
    p.comercio.abrirCom(a, true)
    const antes = inventario.value
    expect(p.comercio.trocar(compra)).toBe(false)
    expect(inventario.value).toBe(antes)
    expect(log.avisos).toEqual(['roqueCraft.comercio.sem-pagamento'])
    expect(log.salvou).toBe(0)
  })

  it('fechar solta o aldeão e prende o ponteiro de volta', () => {
    const { p, log } = montar()
    p.comercio.abrirCom(aldeao(), true)
    p.fecharComercio()
    expect(p.aldeaoAberto.value).toBe(null)
    expect(log.prendeu).toBe(1)
  })

  it('o passo do estoque só redesenha quando mexe NO ALDEÃO ABERTO', () => {
    const a = aldeao()
    const outro = aldeao('ferreiro')
    a.ofertas[0].restam = 0
    outro.ofertas[0].restam = 0
    const { p } = montar()
    p.comercio.abrirCom(a, true)
    // 999 s: os dois reabastecem, mas só o aberto pede redesenho
    expect(p.passoDoComercio([outro], 999)).toBe(false)
    expect(p.passoDoComercio([a, outro], 999)).toBe(true)
  })

  it('mob sem ofertas não entra no passo do estoque', () => {
    const { p } = montar()
    expect(p.passoDoComercio([{ type: 'cow' }], 999)).toBe(false)
  })
})

//
// A CONVERSA COM O ALDEÃO — onda 9 do Goal 20.
//
// O que se prova aqui é a LIGAÇÃO, e não a fala: `falaDoNpc.js` e `npc.js` têm
// testes próprios. Aqui é o balão chegar na tela, a corrida entre dois cliques,
// e a porta única de ações que o componente usa.
//
const aldeao = (over = {}) => ({
  type: 'aldeao',
  profissao: 'ferreiro',
  ofertas: sortearOfertas('ferreiro', () => 0.5),
  npc: { nome: 'Benedito', profissao: 'ferreiro', amizade: 40, memoria: [] },
  ...over,
})

describe('a conversa com o aldeão', () => {
  afterEach(() => {
    ponte.modelo = null
  })

  it('sem aldeão aberto não há conversa', () => {
    expect(montar().p.conversaDoAldeao.value).toBe(null)
  })

  it('aberto, a tela recebe nome, humor e amizade num objeto só', () => {
    const { p } = montar()
    // 55 de amizade cai na faixa 'cordial' (PISO_DO_HUMOR = [0, 25, 50, 78]):
    // o humor é DERIVADO do número, e não um campo guardado ao lado dele.
    p.comercio.abrirCom(
      aldeao({ npc: { nome: 'Benedito', profissao: 'ferreiro', amizade: 55, memoria: [] } }),
      true,
    )
    const c = p.conversaDoAldeao.value
    expect(c.nome).toBe('Benedito')
    expect(c.humor).toBe('cordial')
    expect(c.amizade).toBe(55)
  })

  it('SEM Modo Servidor, a conversa ainda responde — e diz que veio da tabela', async () => {
    const { p } = montar()
    p.comercio.abrirCom(aldeao(), true)
    await p.conversar('saudacao')
    expect(p.conversaDoAldeao.value.texto.length).toBeGreaterThan(0)
    expect(p.conversaDoAldeao.value.fonte).toBe('local')
    expect(p.conversaDoAldeao.value.modelo).toBe(false)
  })

  it('COM modelo, a fala do modelo vence a da tabela', async () => {
    const falar = async () => 'O carvão acabou ontem.'
    falar.pronto = () => true
    ponte.modelo = falar
    const { p } = montar()
    p.comercio.abrirCom(aldeao(), true)
    await p.conversar('saudacao')
    expect(p.conversaDoAldeao.value.texto).toBe('O carvão acabou ontem.')
    expect(p.conversaDoAldeao.value.fonte).toBe('modelo')
    expect(p.conversaDoAldeao.value.modelo).toBe(true)
  })

  it('com o servidor FORA DO AR, a caixa de texto não aparece', async () => {
    // ⚠️ EXISTIR A PONTE NÃO É TER COM QUEM FALAR. A foto da sonda mostrou o
    // painel oferecendo "pergunte alguma coisa" num jogo sem Modo Servidor:
    // toda pergunta cairia na tabela local, e prometer conversa para devolver
    // frase pronta é pior que não oferecer a caixa.
    const falar = async () => 'não deveria ser chamado'
    falar.pronto = () => false
    ponte.modelo = falar
    const { p } = montar()
    p.comercio.abrirCom(aldeao(), true)
    expect(p.conversaDoAldeao.value.modelo).toBe(false)
  })

  it('modelo que EXPLODE não derruba a conversa: cai na tabela', async () => {
    const falar = async () => {
      throw new Error('502')
    }
    falar.pronto = () => true
    ponte.modelo = falar
    const { p } = montar()
    p.comercio.abrirCom(aldeao(), true)
    await p.conversar('saudacao')
    expect(p.conversaDoAldeao.value.fonte).toBe('local')
    expect(p.conversaDoAldeao.value.texto.length).toBeGreaterThan(0)
  })

  it('a resposta atrasada da PRIMEIRA pergunta não sobrescreve a segunda', async () => {
    // ⚠️ SEM ESTA GUARDA o aldeão responde à pergunta anterior, e lê como se ele
    // não tivesse entendido — um defeito que só aparece com o modelo lento.
    const espera = []
    const falar = (retrato, pergunta) =>
      new Promise((ok) => espera.push(() => ok(`resposta a ${pergunta}`)))
    falar.pronto = () => true
    ponte.modelo = falar
    const { p } = montar()
    p.comercio.abrirCom(aldeao(), true)
    const a = p.conversar('livre', 'primeira')
    const b = p.conversar('livre', 'segunda')
    espera[1]()
    await b
    espera[0]()
    await a
    expect(p.conversaDoAldeao.value.texto).toBe('resposta a segunda')
  })

  it('fechar o painel apaga o balão — o próximo aldeão não herda a fala do anterior', async () => {
    const { p } = montar()
    p.comercio.abrirCom(aldeao(), true)
    await p.conversar('saudacao')
    p.fecharComercio()
    expect(p.conversaDoAldeao.value).toBe(null)
    p.comercio.abrirCom(aldeao(), true)
    expect(p.conversaDoAldeao.value.texto).toBe('')
  })

  it('a porta única leva a troca ao comércio', () => {
    const { p, inventario } = montar()
    const m = aldeao({
      ofertas: [
        {
          paga: [{ item: MOEDA, count: 1 }],
          recebe: { item: 'book', count: 1 },
          usos: 4,
          restam: 4,
        },
      ],
    })
    addItem(inventario.value, MOEDA, 1)
    p.comercio.abrirCom(m, true)
    expect(p.acaoDoAldeao('trocar', 0)).toBe(true)
    expect(conta(inventario.value, 'book')).toBe(1)
    expect(m.npc.memoria.map((e) => e.tipo)).toEqual(['trocou'])
  })

  it('a porta única leva o presente ao comércio, e tira o item', () => {
    const { p, inventario } = montar({ itens: { bread: 2 } })
    const m = aldeao()
    p.comercio.abrirCom(m, true)
    p.acaoDoAldeao('presentear', 'bread')
    expect(conta(inventario.value, 'bread')).toBe(1)
    expect(m.npc.memoria.map((e) => e.tipo)).toEqual(['presenteou'])
  })

  it('presentear de mão vazia AVISA, em vez de não fazer nada em silêncio', () => {
    const { p, log } = montar()
    p.comercio.abrirCom(aldeao(), true)
    p.acaoDoAldeao('presentear', '')
    expect(log.avisos).toContain('roqueCraft.npc.semPresente')
  })

  it('o que está na mão chega na tela como o presente possível', () => {
    const { p, log } = montar()
    log.naMao = 'diamond'
    p.comercio.abrirCom(aldeao(), true)
    expect(p.conversaDoAldeao.value.presente).toBe('diamond')
  })
})

describe('a mobília na sala (Onda 6.3)', () => {
  it('o clique num slot avisa a CHAVE do bloco aberto; sem mobília aberta, não', () => {
    const { p, mobilia, log, cursor } = montar({ itens: { stone: 4 } })
    p.onContainerClick(0, 'left') // nada aberto
    expect(log.mudou).toEqual([])
    abrirMobilia(mobilia, 1, 2, 3, 'bau')
    p.aberto.value = { tipo: 'bau', x: 1, y: 2, z: 3 }
    cursor.value = { item: 'stone', count: 4 }
    p.onContainerClick(0, 'left')
    expect(log.mudou).toEqual(['1,2,3'])
    expect(mobilia.get('1,2,3').slots[0]).toEqual({ item: 'stone', count: 4 })
  })

  it('o clique entrega um `desfazer` que devolve cursor e inventário, não o baú', () => {
    const { p, mobilia, log, cursor } = montar()
    abrirMobilia(mobilia, 1, 2, 3, 'bau')
    p.aberto.value = { tipo: 'bau', x: 1, y: 2, z: 3 }
    cursor.value = { item: 'stone', count: 4 }
    p.onContainerClick(0, 'left')
    expect(cursor.value).toBe(null)
    expect(mobilia.get('1,2,3').slots[0]).toEqual({ item: 'stone', count: 4 })
    expect(log.desfazeres.length).toBe(1)
    // a sala recusou: o cursor volta; o baú fica como a sala mandar
    mobilia.get('1,2,3').slots[0] = { item: 'diamond', count: 1 }
    log.desfazeres[0]()
    expect(cursor.value).toEqual({ item: 'stone', count: 4 })
    expect(mobilia.get('1,2,3').slots[0], 'desfazer mexeu no baú').toEqual({
      item: 'diamond',
      count: 1,
    })
  })

  it('entradaParaEnvio sobe a versão a cada chamada; entradaDeMobilia não', () => {
    const { p, mobilia } = montar()
    abrirMobilia(mobilia, 1, 2, 3, 'bau').slots[0] = { item: 'stone', count: 1 }
    expect(p.entradaDeMobilia('1,2,3').v).toBe(0)
    expect(p.entradaParaEnvio('1,2,3').v).toBe(1)
    expect(p.entradaParaEnvio('1,2,3').v).toBe(2)
    expect(p.entradaDeMobilia('1,2,3').v).toBe(2)
    expect(p.entradaParaEnvio('9,9,9'), 'inexistente').toBe(null)
  })

  it('quebrar devolve o conteúdo, fecha a tela se era ele e avisa a sala', () => {
    const { p, mobilia, log } = montar()
    abrirMobilia(mobilia, 1, 2, 3, 'bau').slots[2] = { item: 'diamond', count: 2 }
    p.aberto.value = { tipo: 'bau', x: 1, y: 2, z: 3 }
    expect(p.quebrarMobilia(1, 2, 3)).toEqual([{ item: 'diamond', count: 2 }])
    expect(p.aberto.value).toBe(null)
    expect(log.mudou).toEqual(['1,2,3'])
    expect(mobilia.size).toBe(0)
  })

  it('o tique só roda em quem rege a mobília, e avisa a fornalha que queimou', () => {
    const { p, mobilia, log } = montar()
    const f = abrirMobilia(mobilia, 0, 64, 0, 'fornalha')
    f.entrada = { item: 'raw_iron', count: 1 }
    f.combustivel = { item: 'coal', count: 1 }
    log.rege = false
    p.tique(0.5)
    expect(f.progresso, 'convidado fez a fornalha queimar').toBe(0)
    expect(log.queimou).toEqual([])
    log.rege = true
    p.tique(0.5)
    expect(f.progresso).toBeGreaterThan(0)
    expect(log.queimou).toEqual(['0,64,0'])
  })

  it('a sala manda uma entrada e ela aparece; null apaga; a tela aberta redesenha', () => {
    const { p, mobilia } = montar()
    p.aberto.value = { tipo: 'bau', x: 1, y: 2, z: 3 }
    const antes = p.revisaoMobilia.value
    p.aplicarMobilia('1,2,3', { t: 'b', s: [['stone', 4]] })
    expect(mobilia.get('1,2,3').slots[0]).toEqual({ item: 'stone', count: 4 })
    expect(p.conteudoAberto.value[0]).toEqual({ item: 'stone', count: 4 })
    expect(p.revisaoMobilia.value).not.toBe(antes)
    expect(p.entradaDeMobilia('1,2,3')).toMatchObject({ t: 'b' })
    p.aplicarMobilia('1,2,3', null)
    expect(mobilia.has('1,2,3')).toBe(false)
    expect(p.entradaDeMobilia('1,2,3')).toBe(null)
  })
})
