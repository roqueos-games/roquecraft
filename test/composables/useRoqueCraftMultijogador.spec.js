import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'

// Até a extração este arquivo precisava de um molde do `roqueCraftRoom` só para
// o módulo carregar (ele importava o boot do Firebase). Agora o composable só
// importa as partes puras dele, e a sala chega pela `rede` injetada, que os
// testes controlam. A sala de verdade, sobre o host falso do jogo-sdk, está em
// `salaComHostFalso.spec.js`.

import {
  useRoqueCraftMultijogador,
  PASSO_DA_POSICAO,
  PASSO_DAS_CRIATURAS,
  PASSO_DA_MOBILIA,
  BRACADA_DO_REMOTO,
  MENSAGENS_NO_CHAT,
  MEXEU,
} from '../../src/composables/useRoqueCraftMultijogador.js'
import { PASSO_DO_RELOGIO, TOLERANCIA_DO_RELOGIO } from '../../src/servicos/relogioDaSala.js'

// ⚠️ ESTE TESTE É A PROVA DE QUE A `sessao` É UMA INTERFACE, NÃO UM SACO.
//
// O multijogador morava no componente lendo `player`, `yaw`, `survival`,
// `mobs`, `drops`, `flechas`, `seed`, `ticks`, `noiseCtx`, `world`, `settings`,
// `heldItem`, `mining`, `editsMap` - vinte e três fios. Nada disso podia ser
// testado sem montar o jogo inteiro, e por isso NADA disso era testado.
//
// Aqui o composable roda inteiro contra uma sessão falsa: sem three, sem
// Firestore, sem canvas. Se o corte tivesse sido só uma mudança de endereço,
// este arquivo não existiria.
//
// O que ele trava, e que nunca teve teste nenhum:
//  - a cadência de publicação (0,1 s) e o gatilho de "andou OU mudou de ação"
//  - o anfitrião publicando criaturas a 0,125 s, e o convidado NÃO publicando
//  - anfitrião e convidado assinando coisas DIFERENTES
//  - `leaveMultiplayer` cancelando TODAS as assinaturas
//  - a volta pro mundo solo quando a sala era de outra semente
//  - a braçada derivada do remoto

function redeFalsa(over = {}, quem = { uid: 'eu', nome: 'Eu' }) {
  const chamadas = {
    posicoes: [],
    criaturas: [],
    entrou: [],
    saiu: [],
    chats: [],
    relogios: [],
    reivindicacoes: [],
    fechamentos: [],
    moveis: [],
  }
  let cancelados = 0
  // Como o host: sem conta, criar lança e entrar recusa com `sem-conta`; com
  // conta, os dois dizem quem é o jogador dentro da sala (`eu`).
  const semConta = () =>
    Object.assign(new Error('a sala ao vivo pede conta'), { codigo: 'sem-conta' })
  const assina = (nome) => (code, cb) => {
    chamadas[nome] = cb
    return () => cancelados++
  }
  return {
    chamadas,
    cancelados: () => cancelados,
    rede: {
      createRoom: vi.fn(async () => {
        if (!quem.uid) throw semConta()
        return { code: 'ABCD', joinUrl: 'https://x/ABCD', eu: { ...quem } }
      }),
      getRoomMeta: vi.fn(async () => {
        if (!quem.uid) throw semConta()
        return { host: 'outro', seed: 999 }
      }),
      eu: () => (quem.uid ? { ...quem } : null),
      enterRoom: vi.fn(async (a) => chamadas.entrou.push(a)),
      leaveRoom: vi.fn(async (a) => chamadas.saiu.push(a)),
      publishPosition: vi.fn((code, uid, pos) => chamadas.posicoes.push(pos)),
      publishMobs: vi.fn((code, packed) => chamadas.criaturas.push(packed)),
      subscribePlayers: assina('aoReceberJogadores'),
      subscribeChat: assina('aoReceberChat'),
      subscribeMobs: assina('aoReceberCriaturas'),
      subscribeHits: assina('aoReceberGolpes'),
      subscribeClock: assina('aoReceberRelogio'),
      publishClock: vi.fn((code, r) => chamadas.relogios.push(r)),
      subscribeMeta: assina('aoMudarMeta'),
      subscribeConnection: (cb) => {
        chamadas.aoMudarConexao = cb
        return () => cancelados++
      },
      claimHost: vi.fn(async (code, uid) => {
        chamadas.reivindicacoes.push(uid)
        return true
      }),
      fecharSalaAoCair: vi.fn((code, armar) => chamadas.fechamentos.push(armar)),
      sucessorDoAnfitriao: (uids) => [...uids].sort()[0],
      publishMobilia: vi.fn(async (code, k, dado) => {
        chamadas.moveis.push([k, dado])
        return true
      }),
      getMobilia: vi.fn(async () => null),
      subscribeMobilia: assina('aoReceberMobilia'),
      createBlockSync: vi.fn(() => ({
        setCenter: vi.fn(),
        setRadius: vi.fn(),
        close: vi.fn(() => cancelados++),
      })),
      remotePlayerList: (map) => map,
      sendChat: vi.fn(async (code, m) => chamadas.chats.push(m)),
      ...over,
    },
  }
}

function montar(over = {}) {
  const estado = {
    semente: 1,
    instante: 1000,
    recomeços: [],
    restauracoes: [],
    inventario: [{ item: 'diamond_pickaxe', count: 1 }],
    criaturas: [{ id: 'm1', type: 'pig', x: 3, y: 64, z: 0 }],
    edicoesAplicadas: [],
    golpes: [],
    guardou: 0,
    skin: 'padrao',
    pos: { x: 0, y: 64, z: 0, yaw: 0, health: 20, item: '', act: '' },
    liquido: false,
    sons: [],
    chuvaForcada: null,
    acertos: [],
    climas: [],
    moveis: new Map([['1,2,3', { t: 'b', s: [['stone', 4]] }]]),
    moveisAplicados: [],
  }
  const sessao = {
    instantaneo: () => ({ ...estado.pos, skin: estado.skin }),
    criaturas: () => estado.criaturas,
    definirCriaturas: (l) => {
      estado.criaturas = l
    },
    golpear: (id, dano) => estado.golpes.push([id, dano]),
    posicaoDaCriatura: (id) => {
      const m = estado.criaturas.find((c) => c.id === id)
      return m ? { x: m.x, y: m.y, z: m.z } : null
    },
    aplicarEdicoes: (l) => estado.edicoesAplicadas.push(l),
    temMundo: () => true,
    liquidoEm: () => estado.liquido,
    audio: () => ({
      bracada: (p) => estado.sons.push(['bracada', p]),
      bolha: (p) => estado.sons.push(['bolha', p]),
    }),
    semente: () => estado.semente,
    modo: () => 'survival',
    edicoes: () => new Map(),
    instante: () => estado.instante,
    acertarRelogio: (t) => {
      estado.acertos.push(t)
      estado.instante = t
    },
    climaForcado: () => estado.chuvaForcada,
    acertarClima: (c) => estado.climas.push(c),
    mobiliaSerializada: () => [...estado.moveis].map(([k, d]) => ({ k, ...d })),
    entradaDeMobilia: (k) => estado.moveis.get(k) ?? null,
    // Sobe a versão e serializa, como `paineis.entradaParaEnvio`.
    entradaParaEnvio: (k) => {
      const d = estado.moveis.get(k)
      if (!d) return null
      d.v = (d.v | 0) + 1
      return { ...d }
    },
    aplicarMobilia: (k, d) => estado.moveisAplicados.push([k, d]),
    raioDeSync: () => 8,
    centroEmChunk: () => [0, 0],
    recomecarEm: (s, t) => {
      estado.recomeços.push([s, t])
      estado.semente = s
    },
    // RC-03: a sessão que volta da sala é o payload inteiro do save.
    instantaneoCompleto: () => ({
      seed: estado.semente,
      ticks: estado.instante,
      inventory: estado.inventario,
      player: { ...estado.pos },
    }),
    restaurarSolo: (salvo) => {
      estado.restauracoes.push(salvo)
      estado.semente = salvo.seed
      estado.instante = salvo.ticks
      estado.inventario = salvo.inventory
      return true
    },
    guardar: async () => estado.guardou++,
    definirSkin: (id) => {
      estado.skin = id
      return id
    },
    ...over.sessao,
  }
  // Quem é o jogador na sala vem da rede (do host), não mais de refs do login.
  const quem = over.identidade
    ? { uid: over.identidade.uid.value, nome: over.identidade.nome.value }
    : { uid: 'eu', nome: 'Eu' }
  const r = redeFalsa(over.rede, quem)
  const ui = { paused: ref(true), sairDoPonteiro: vi.fn(), focarChat: vi.fn(), avisar: vi.fn() }
  const mj = useRoqueCraftMultijogador({
    identidade: { nomePadrao: () => 'Jogador' },
    sessao,
    ui,
    rede: r.rede,
  })
  return { mj, estado, ui, ...r }
}

describe('useRoqueCraftMultijogador', () => {
  it('hospedar entra na sala e assina jogadores, chat e GOLPES', async () => {
    const { mj, chamadas, rede } = montar()
    await mj.hostRoom()
    expect(mj.mp.code).toBe('ABCD')
    expect(mj.mp.isHost).toBe(true)
    expect(mj.mp.mode).toBe('connected')
    expect(chamadas.entrou[0]).toMatchObject({ code: 'ABCD', uid: 'eu' })
    expect(mj.mp.hostUid).toBe('eu')
    // Anfitrião recebe golpes (ele é a fonte da verdade das criaturas) e NÃO
    // assina a lista de criaturas de ninguém.
    expect(typeof chamadas.aoReceberGolpes).toBe('function')
    expect(chamadas.aoReceberCriaturas).toBeUndefined()
    // jogadores, chat, meta, conexão, mobília + golpes
    expect(mj.assinaturasAbertas()).toBe(6)
    // A sala nasce com a mobília do anfitrião, como nasce com as edições.
    expect(rede.createRoom.mock.calls[0][0].mobilia).toEqual([
      { k: '1,2,3', t: 'b', s: [['stone', 4]] },
    ])
  })

  it('entrar como convidado assina CRIATURAS, e não golpes', async () => {
    const { mj, chamadas, estado } = montar()
    await mj.joinByCode('WXYZ')
    expect(mj.mp.isHost).toBe(false)
    expect(mj.mp.hostUid).toBe('outro')
    expect(typeof chamadas.aoReceberCriaturas).toBe('function')
    expect(
      chamadas.aoReceberGolpes,
      'convidado assinou golpe: as listas divergiriam',
    ).toBeUndefined()
    // A semente do anfitrião (999) é outra, então a partida recomeça nela.
    expect(estado.recomeços).toEqual([[999, undefined]])
  })

  it('convidado na MESMA semente não recomeça o mundo', async () => {
    const { mj, estado } = montar({
      rede: { getRoomMeta: vi.fn(async () => ({ host: 'outro', seed: 1 })) },
    })
    await mj.joinByCode('WXYZ')
    expect(estado.recomeços, 'recomeçou sem precisar; o mundo do jogador foi jogado fora').toEqual(
      [],
    )
  })

  it('publica na cadência, e só quando andou OU mudou de ação', async () => {
    const { mj, chamadas, estado } = montar()
    await mj.hostRoom()
    const antes = chamadas.posicoes.length

    // Meio passo: ainda não publica.
    mj.stepMultiplayer(PASSO_DA_POSICAO / 2)
    expect(chamadas.posicoes.length).toBe(antes)

    // Passo cheio, parado e sem ação: nada a dizer.
    mj.stepMultiplayer(PASSO_DA_POSICAO)
    const paradoEmSilencio = chamadas.posicoes.length
    mj.stepMultiplayer(PASSO_DA_POSICAO)
    expect(chamadas.posicoes.length, 'publicou estando parado').toBe(paradoEmSilencio)

    // Andou: publica.
    estado.pos.x = 5
    mj.stepMultiplayer(PASSO_DA_POSICAO)
    expect(chamadas.posicoes.length).toBe(paradoEmSilencio + 1)

    // ⚠️ Parado MAS minerando: publica. Com o teste só de posição, o amigo via
    // você imóvel enquanto o bloco na frente rachava sozinho.
    estado.pos.act = 'dig'
    mj.stepMultiplayer(PASSO_DA_POSICAO)
    expect(chamadas.posicoes.length, 'minerar parado não chegou no amigo').toBe(
      paradoEmSilencio + 2,
    )
  })

  // ⚠️ `Math.abs(delta) > MEXEU` sobrevivia a `>=` nos quatro eixos. MEXEU é o
  // piso de ruído: exatamente MEXEU é o valor que a constante chama de "ainda
  // não mexeu", e publicar nele põe uma escrita no Realtime Database a cada
  // 200 ms por jogador parado com o stick encostado. O teste acima anda 5
  // blocos de uma vez, longe da borda.
  it('mexer exatamente o piso ainda não é mexer; um fio além é', async () => {
    const { mj, chamadas, estado } = montar()
    await mj.hostRoom()
    // ⚠️ A referência tem que ser o ZERO: `10 + MEXEU` menos `10` dá
    // 0,019999999999999574 em ponto flutuante, que já é menor que o piso e
    // passa nas duas versões. Saindo de zero, `MEXEU - 0` é 0,02 EXATO.
    mj.stepMultiplayer(PASSO_DA_POSICAO) // o y do molde já força a 1ª publicação
    const referencia = chamadas.posicoes.length
    expect(referencia, 'a referência não foi fixada').toBeGreaterThan(0)

    estado.pos.x = MEXEU // o piso, exato
    mj.stepMultiplayer(PASSO_DA_POSICAO)
    expect(chamadas.posicoes.length, 'publicou no piso do ruído').toBe(referencia)

    estado.pos.x = MEXEU * 2 // agora sim
    mj.stepMultiplayer(PASSO_DA_POSICAO)
    expect(chamadas.posicoes.length).toBe(referencia + 1)
  })

  it('o giro da cabeça sozinho também publica', async () => {
    const { mj, chamadas, estado } = montar()
    await mj.hostRoom()
    mj.stepMultiplayer(PASSO_DA_POSICAO)
    const referencia = chamadas.posicoes.length

    estado.pos.yaw = MEXEU * 4 // só olhou para o lado
    mj.stepMultiplayer(PASSO_DA_POSICAO)
    expect(chamadas.posicoes.length).toBe(referencia + 1)
  })

  it('só o ANFITRIÃO publica criaturas, e na cadência dele', async () => {
    const anfitriao = montar()
    await anfitriao.mj.hostRoom()
    anfitriao.mj.stepMultiplayer(PASSO_DAS_CRIATURAS / 2)
    expect(anfitriao.chamadas.criaturas.length).toBe(0)
    anfitriao.mj.stepMultiplayer(PASSO_DAS_CRIATURAS)
    expect(anfitriao.chamadas.criaturas.length).toBe(1)

    const convidado = montar()
    await convidado.mj.joinByCode('WXYZ')
    convidado.mj.stepMultiplayer(PASSO_DAS_CRIATURAS * 4)
    expect(convidado.chamadas.criaturas.length, 'convidado publicou criatura').toBe(0)
  })

  // ── Onda 6.1: o relógio é do anfitrião ─────────────────────────────────────
  it('o ANFITRIÃO publica o relógio ao entrar e a cada PASSO_DO_RELOGIO', async () => {
    const { mj, chamadas, estado } = montar()
    estado.instante = 4321
    estado.chuvaForcada = 0.7
    await mj.hostRoom()
    expect(chamadas.relogios, 'o convidado que entra leria o relógio vazio').toEqual([
      { ticks: 4321, chuva: 0.7 },
    ])
    expect(chamadas.aoReceberRelogio, 'anfitrião assinou o próprio relógio').toBeUndefined()
    mj.stepMultiplayer(PASSO_DO_RELOGIO / 2)
    expect(chamadas.relogios.length).toBe(1)
    estado.instante = 4400
    mj.stepMultiplayer(PASSO_DO_RELOGIO / 2)
    expect(chamadas.relogios.length).toBe(2)
    expect(chamadas.relogios[1]).toEqual({ ticks: 4400, chuva: 0.7 })
  })

  it('o convidado assina o relógio e NÃO publica', async () => {
    const { mj, chamadas } = montar()
    await mj.joinByCode('WXYZ')
    expect(typeof chamadas.aoReceberRelogio).toBe('function')
    mj.stepMultiplayer(PASSO_DO_RELOGIO * 3)
    expect(chamadas.relogios, 'convidado publicou relógio: dois donos do tempo').toEqual([])
    // jogadores, chat, meta, conexão, mobília + criaturas, relógio
    expect(mj.assinaturasAbertas()).toBe(7)
  })

  it('o convidado acerta o relógio só quando o desvio passa da tolerância', async () => {
    const { mj, chamadas, estado } = montar()
    await mj.joinByCode('WXYZ')
    estado.instante = 1000
    chamadas.aoReceberRelogio({ ticks: 1000 + TOLERANCIA_DO_RELOGIO, chuva: null })
    expect(estado.acertos, 'acertou dentro da folga: o sol pularia a cada mensagem').toEqual([])
    chamadas.aoReceberRelogio({ ticks: 1000 + TOLERANCIA_DO_RELOGIO + 1, chuva: null })
    expect(estado.acertos).toEqual([1000 + TOLERANCIA_DO_RELOGIO + 1])
    // Meia-noite: 23.990 local contra 10 remoto é 20 ticks de desvio, não um dia.
    estado.instante = 23990
    chamadas.aoReceberRelogio({ ticks: 10, chuva: null })
    expect(estado.acertos.length, 'a virada do dia contou como um dia de atraso').toBe(1)
  })

  it('o convidado adota a chuva forçada do anfitrião só quando ela MUDA', async () => {
    const { mj, chamadas, estado } = montar()
    await mj.joinByCode('WXYZ')
    chamadas.aoReceberRelogio({ ticks: 1000, chuva: null })
    expect(estado.climas, 'null de saída é o que já estava; forçar de novo pula a rampa').toEqual(
      [],
    )
    chamadas.aoReceberRelogio({ ticks: 1000, chuva: 1 })
    chamadas.aoReceberRelogio({ ticks: 1000, chuva: 1 })
    expect(estado.climas).toEqual([1])
    chamadas.aoReceberRelogio({ ticks: 1000, chuva: null })
    expect(estado.climas).toEqual([1, null])
  })

  it('sair cancela TODAS as assinaturas e fecha o sync de blocos', async () => {
    const { mj, cancelados, chamadas } = montar()
    await mj.hostRoom()
    expect(mj.assinaturasAbertas()).toBe(6)
    await mj.leaveMultiplayer()
    // seis assinaturas + o blockSync
    expect(cancelados(), 'sobrou assinatura viva depois de sair da sala').toBe(7)
    expect(mj.assinaturasAbertas()).toBe(0)
    expect(mj.mp.active).toBe(false)
    expect(mj.mp.code).toBe('')
    expect(chamadas.saiu[0]).toMatchObject({ uid: 'eu' })
  })

  it('sair de uma sala de OUTRA semente devolve o mundo solo', async () => {
    const { mj, estado } = montar()
    await mj.joinByCode('WXYZ') // semente 999, a solo era 1
    await mj.leaveMultiplayer()
    expect(estado.restauracoes.length, 'o jogador ficou preso no mundo do anfitrião').toBe(1)
    expect(estado.semente).toBe(1)
    expect(estado.instante).toBe(1000)
  })

  // ⚠️ ESTE TESTE AFIRMAVA O DEFEITO (RC-03). Ele dizia "sair de uma sala da
  // MESMA semente não mexe no mundo" e conferia que NADA era restaurado — que é
  // exatamente o que apagava o mundo do anfitrião: ele saía da sala com o
  // inventário, a vida, as edições e as criaturas de lá, e o autosave gravava
  // isso por cima do save solo. Semente igual não é sessão igual.
  it('sair de uma sala da MESMA semente restaura a sessão do mesmo jeito', async () => {
    const { mj, estado } = montar()
    const inventarioSolo = estado.inventario
    await mj.hostRoom()
    // Na sala o jogador gastou a picareta e pegou outras coisas.
    estado.inventario = [{ item: 'dirt', count: 3 }]
    await mj.leaveMultiplayer()
    expect(estado.restauracoes.length, 'a sessão solo não voltou').toBe(1)
    expect(estado.inventario, 'o inventário da SALA virou o inventário solo').toBe(inventarioSolo)
  })

  it("a braçada do remoto é DERIVADA da distância dentro d'água", async () => {
    const { mj, estado, chamadas } = montar()
    await mj.hostRoom()
    estado.liquido = true

    // Primeiro quadro: só registra onde ele está (não há "desde então" ainda).
    chamadas.aoReceberJogadores([{ uid: 'outro', x: 0, y: 60, z: 0 }])
    expect(estado.sons.length).toBe(0)

    // Menos de uma braçada: silêncio.
    chamadas.aoReceberJogadores([{ uid: 'outro', x: BRACADA_DO_REMOTO - 0.2, y: 60, z: 0 }])
    expect(estado.sons.length, 'tocou antes de completar a braçada').toBe(0)

    // Completou: toca.
    chamadas.aoReceberJogadores([{ uid: 'outro', x: BRACADA_DO_REMOTO + 0.5, y: 60, z: 0 }])
    expect(estado.sons.map((s) => s[0])).toEqual(['bolha'])
  })

  it("remoto FORA d'água não faz som nenhum", async () => {
    const { mj, estado, chamadas } = montar()
    await mj.hostRoom()
    estado.liquido = false
    chamadas.aoReceberJogadores([{ uid: 'outro', x: 0, y: 60, z: 0 }])
    chamadas.aoReceberJogadores([{ uid: 'outro', x: 50, y: 60, z: 0 }])
    expect(estado.sons, 'nadou em terra firme').toEqual([])
  })

  it('quem sai da sala para de acumular distância', async () => {
    const { mj, estado, chamadas } = montar()
    await mj.hostRoom()
    estado.liquido = true
    chamadas.aoReceberJogadores([{ uid: 'outro', x: 0, y: 60, z: 0 }])
    chamadas.aoReceberJogadores([{ uid: 'outro', x: 1, y: 60, z: 0 }])
    // Saiu: o acumulado dele morre junto.
    chamadas.aoReceberJogadores([])
    chamadas.aoReceberJogadores([{ uid: 'outro', x: 1, y: 60, z: 0 }])
    // Como o acumulado zerou, o passo de 1 bloco não completa a braçada.
    chamadas.aoReceberJogadores([{ uid: 'outro', x: 2, y: 60, z: 0 }])
    expect(estado.sons.length, 'o acumulado de quem saiu sobreviveu').toBe(0)
  })

  it('o chat corta em MENSAGENS_NO_CHAT e limpa ao entrar e ao sair', async () => {
    const { mj, chamadas } = montar()
    await mj.hostRoom()
    for (let i = 0; i < MENSAGENS_NO_CHAT + 10; i++)
      chamadas.aoReceberChat({ uid: 'outro', name: 'O', text: `m${i}` })
    expect(mj.chatLog.value.length).toBe(MENSAGENS_NO_CHAT)
    expect(mj.chatLog.value[0].text).toBe('m10')
    await mj.leaveMultiplayer()
    expect(mj.chatLog.value).toEqual([])
  })

  it('mandar chat fecha a caixa, limpa o rascunho e não manda vazio', async () => {
    const { mj, chamadas } = montar()
    await mj.hostRoom()
    mj.openChat()
    mj.chatDraft.value = '   '
    await mj.submitChat()
    expect(chamadas.chats, 'mandou mensagem em branco').toEqual([])
    expect(mj.chatOpen.value).toBe(false)

    mj.openChat()
    mj.chatDraft.value = 'oi'
    await mj.submitChat()
    expect(chamadas.chats[0]).toEqual({ uid: 'eu', name: 'Eu', text: 'oi' })
    expect(mj.chatDraft.value).toBe('')
  })

  it('trocar de skin dentro da sala publica na hora', async () => {
    const { mj, chamadas, estado } = montar()
    await mj.hostRoom()
    const antes = chamadas.posicoes.length
    mj.escolherSkin('steve')
    expect(estado.skin).toBe('steve')
    expect(estado.guardou).toBeGreaterThan(0)
    expect(chamadas.posicoes.length, 'o amigo não viu o boneco mudar').toBe(antes + 1)
    expect(chamadas.posicoes.at(-1)).toMatchObject({ skin: 'steve', act: '' })
  })

  it('fora da sala, trocar de skin salva mas não publica', () => {
    const { mj, chamadas, estado } = montar()
    mj.escolherSkin('alex')
    expect(estado.skin).toBe('alex')
    expect(chamadas.posicoes).toEqual([])
  })

  it('sem conta, hospedar e entrar recusam com o motivo certo', async () => {
    // Quem recusa agora é o host (`sem-conta`); o jogo traduz no aviso de
    // sempre e troca o menu do lobby pelo aviso de conta.
    const { mj, chamadas } = montar({ identidade: { uid: ref(''), nome: ref('') } })
    await mj.hostRoom()
    expect(mj.mp.error).toBe('needAccount')
    expect(mj.semConta.value).toBe(true)
    expect(mj.mp.mode).toBe('menu')
    mj.semConta.value = false
    await mj.joinByCode('ABCD')
    expect(mj.mp.error).toBe('needAccount')
    expect(mj.semConta.value).toBe(true)
    // CONTROLE: nada foi para a rede. Uma recusa que ainda cria a sala deixaria
    // sala órfã no Firestore a cada clique.
    expect(chamadas.entrou).toEqual([])
    expect(mj.assinaturasAbertas()).toBe(0)
  })

  it('código curto demais recusa antes de bater na rede', async () => {
    const { mj, chamadas } = montar()
    await mj.joinByCode('AB')
    expect(mj.mp.error).toBe('enterCode')
    expect(chamadas.entrou).toEqual([])
  })

  it('código que não existe volta pro menu sem entrar em nada', async () => {
    const { mj, chamadas } = montar({ rede: { getRoomMeta: async () => null } })
    await mj.joinByCode('ZZZZ')
    expect(mj.mp.error).toBe('codeNotFound')
    expect(mj.mp.mode).toBe('menu')
    expect(chamadas.entrou).toEqual([])
    expect(mj.assinaturasAbertas()).toBe(0)
  })

  it('o lobby abre despausado e solta o ponteiro', () => {
    const { mj, ui } = montar()
    expect(ui.paused.value).toBe(true)
    mj.openLobby()
    expect(mj.lobbyOpen.value).toBe(true)
    // Abrir o lobby PAUSADO deixava o menu de pausa por cima do lobby.
    expect(ui.paused.value).toBe(false)
    expect(ui.sairDoPonteiro).toHaveBeenCalled()
  })

  it('encerrar cancela tudo sem precisar sair da sala', async () => {
    const { mj, cancelados } = montar()
    await mj.hostRoom()
    mj.encerrar()
    expect(cancelados()).toBe(7)
    expect(mj.assinaturasAbertas()).toBe(0)
  })

  // ── Onda 6.4: a intenção de golpe é validada pelo anfitrião ────────────────
  it('o golpe remoto só entra se o atacante está perto do alvo; o resto é contado', async () => {
    const { mj, chamadas, estado } = montar()
    await mj.hostRoom()
    // Antes de qualquer posição publicada, ninguém prova alcance.
    chamadas.aoReceberGolpes({ mobId: 'm1', damage: 5, by: 'outro' })
    expect(estado.golpes).toEqual([])
    expect(mj.golpesRecusados().atacante).toBe(1)
    chamadas.aoReceberJogadores([remoto('outro'), { uid: 'longe', x: 80, y: 64, z: 0 }])
    chamadas.aoReceberGolpes({ mobId: 'm1', damage: 5, by: 'outro' })
    expect(estado.golpes).toEqual([['m1', 5]])
    chamadas.aoReceberGolpes({ mobId: 'm1', damage: 5, by: 'longe' })
    chamadas.aoReceberGolpes({ mobId: 'm1', damage: 500, by: 'outro' })
    chamadas.aoReceberGolpes({ mobId: 'nao-existe', damage: 5, by: 'outro' })
    expect(estado.golpes, 'golpe recusado foi aplicado').toEqual([['m1', 5]])
    expect(mj.golpesRecusados()).toEqual({ dano: 1, alvo: 1, atacante: 1, alcance: 1 })
  })

  // ── Onda 6.3: a mobília é da sala ──────────────────────────────────────────
  it('o clique publica a entrada NA HORA; null quando ela esvaziou ou foi quebrada', async () => {
    const { mj, chamadas, estado } = montar()
    mj.publicarMobilia('1,2,3', true)
    expect(chamadas.moveis, 'publicou fora da sala').toEqual([])
    await mj.joinByCode('WXYZ')
    mj.publicarMobilia('1,2,3', true)
    expect(chamadas.moveis).toEqual([['1,2,3', { t: 'b', s: [['stone', 4]], v: 1 }]])
    await Promise.resolve()
    estado.moveis.delete('1,2,3')
    mj.publicarMobilia('1,2,3', true)
    expect(chamadas.moveis.at(-1)).toEqual(['1,2,3', null])
  })

  it('cada envio é v+1 sobre o anterior, UM de cada vez por chave', async () => {
    const { mj, chamadas, rede } = montar()
    await mj.joinByCode('WXYZ')
    let solta
    rede.publishMobilia.mockImplementationOnce(
      (code, k, dado) =>
        new Promise((r) => {
          chamadas.moveis.push([k, dado])
          solta = r
        }),
    )
    mj.publicarMobilia('1,2,3', true)
    mj.publicarMobilia('1,2,3', true)
    expect(chamadas.moveis.length, 'mandou o segundo antes da resposta do primeiro').toBe(1)
    expect(chamadas.moveis[0][1].v).toBe(1)
    solta(true)
    await new Promise((r) => setTimeout(r, 0))
    expect(chamadas.moveis.length).toBe(2)
    expect(chamadas.moveis[1][1].v).toBe(2)
  })

  it('a sala recusa: desfaz os cliques de trás pra frente, conta e relê a entrada', async () => {
    const { mj, chamadas, rede, estado } = montar()
    await mj.joinByCode('WXYZ')
    const ordem = []
    rede.publishMobilia.mockImplementationOnce(async (code, k, dado) => {
      chamadas.moveis.push([k, dado])
      return false
    })
    rede.getMobilia.mockResolvedValueOnce({ t: 'b', s: [['stone', 9]], v: 7 })
    mj.publicarMobilia('1,2,3', true, () => ordem.push('primeiro'))
    mj.publicarMobilia('1,2,3', true, () => ordem.push('segundo'))
    await new Promise((r) => setTimeout(r, 0))
    expect(ordem, 'desfez na ordem errada ou não desfez').toEqual(['segundo', 'primeiro'])
    expect(mj.mobiliaRecusada()).toBe(1)
    expect(chamadas.moveis.length, 'mandou o segundo depois da recusa do primeiro').toBe(1)
    expect(estado.moveisAplicados.at(-1)).toEqual(['1,2,3', { t: 'b', s: [['stone', 9]], v: 7 }])
    // Depois da recusa a fila está limpa: o próximo clique sai normalmente.
    mj.publicarMobilia('1,2,3', true)
    expect(chamadas.moveis.length).toBe(2)
  })

  it('a fornalha que queima acumula e sai a cada PASSO_DA_MOBILIA, sem repetir chave', async () => {
    const { mj, chamadas } = montar()
    await mj.hostRoom()
    mj.publicarMobilia('1,2,3')
    mj.publicarMobilia('1,2,3')
    mj.publicarMobilia('4,5,6')
    mj.stepMultiplayer(PASSO_DA_MOBILIA / 2)
    expect(chamadas.moveis, 'saiu antes da cadência').toEqual([])
    mj.stepMultiplayer(PASSO_DA_MOBILIA / 2)
    expect(chamadas.moveis.map((m) => m[0])).toEqual(['1,2,3', '4,5,6'])
    mj.stepMultiplayer(PASSO_DA_MOBILIA)
    expect(chamadas.moveis.length, 'republicou sem mudança').toBe(2)
  })

  it('quem rege a fornalha: fora da sala todo mundo; na sala, só o anfitrião', async () => {
    const anfitriao = montar()
    expect(anfitriao.mj.regeMobilia()).toBe(true)
    await anfitriao.mj.hostRoom()
    expect(anfitriao.mj.regeMobilia()).toBe(true)
    const convidado = montar()
    await convidado.mj.joinByCode('WXYZ')
    expect(convidado.mj.regeMobilia()).toBe(false)
    convidado.chamadas.aoMudarMeta({ host: 'eu', seed: 999 })
    expect(convidado.mj.regeMobilia(), 'assumiu a sala e não a fornalha').toBe(true)
  })

  it('o que a sala manda entra na partida, inclusive o null que apaga', async () => {
    const { mj, chamadas, estado } = montar()
    await mj.joinByCode('WXYZ')
    chamadas.aoReceberMobilia('7,8,9', { t: 'f', e: ['raw_iron', 1] })
    chamadas.aoReceberMobilia('7,8,9', null)
    expect(estado.moveisAplicados).toEqual([
      ['7,8,9', { t: 'f', e: ['raw_iron', 1] }],
      ['7,8,9', null],
    ])
  })

  // ── Onda 6.2: a sucessão do host, a volta da queda, a sala que fecha ────────
  const remoto = (uid) => ({ uid, x: 0, y: 64, z: 0 })

  it('o host de registro some e o membro de MENOR uid assume', async () => {
    const { mj, chamadas, ui, estado } = montar()
    await mj.joinByCode('WXYZ')
    chamadas.aoReceberJogadores([remoto('outro'), remoto('zzz')])
    expect(chamadas.reivindicacoes, 'reivindicou com o host presente').toEqual([])
    chamadas.aoReceberJogadores([remoto('zzz')])
    await Promise.resolve()
    expect(chamadas.reivindicacoes).toEqual(['eu'])
    // A reivindicação vira papel só quando `meta` confirma (é o banco que decide).
    expect(mj.mp.isHost).toBe(false)
    chamadas.aoMudarMeta({ host: 'eu', seed: 999 })
    expect(mj.mp.isHost).toBe(true)
    expect(mj.mp.hostUid).toBe('eu')
    expect(typeof chamadas.aoReceberGolpes).toBe('function')
    expect(chamadas.relogios.length, 'host novo publica o relógio ao assumir').toBe(1)
    expect(ui.avisar).toHaveBeenCalledWith('nowHost')
    mj.stepMultiplayer(PASSO_DAS_CRIATURAS)
    expect(chamadas.criaturas.length, 'host novo não publica criaturas').toBe(1)
    expect(estado.criaturas.length).toBe(1)
  })

  it('quem NÃO é o menor uid espera; quem nunca viu o host não toma a sala', async () => {
    const zed = montar({ identidade: { uid: ref('zed'), nome: ref('Zed') } })
    await zed.mj.joinByCode('WXYZ')
    zed.chamadas.aoReceberJogadores([remoto('outro'), remoto('abc')])
    zed.chamadas.aoReceberJogadores([remoto('abc')])
    await Promise.resolve()
    expect(zed.chamadas.reivindicacoes, 'zed passou na frente de abc').toEqual([])

    const cedo = montar()
    await cedo.mj.joinByCode('WXYZ')
    // O host ainda não apareceu em `players` (janela entre criar e entrar).
    cedo.chamadas.aoReceberJogadores([])
    await Promise.resolve()
    expect(
      cedo.chamadas.reivindicacoes,
      'tomou a sala de um host que ainda estava entrando',
    ).toEqual([])
  })

  it('a sala que some tira o jogador dela e avisa', async () => {
    const { mj, ui, chamadas } = montar()
    await mj.joinByCode('WXYZ')
    chamadas.aoMudarMeta(null)
    await Promise.resolve()
    expect(mj.mp.active).toBe(false)
    expect(ui.avisar).toHaveBeenCalledWith('roomClosed')
  })

  it('de volta de uma queda, reapresenta a presença e confere quem manda', async () => {
    const { mj, chamadas, rede } = montar()
    await mj.hostRoom()
    expect(chamadas.entrou.length).toBe(1)
    chamadas.aoMudarConexao(true)
    expect(chamadas.entrou.length, 'a primeira conexão não é uma volta').toBe(1)
    chamadas.aoMudarConexao(false)
    rede.getRoomMeta.mockResolvedValueOnce({ host: 'outro', seed: 1 })
    chamadas.aoMudarConexao(true)
    await new Promise((k) => setTimeout(k, 0))
    expect(chamadas.entrou.length).toBe(2)
    // Enquanto estava fora, outro assumiu: volta como convidado.
    expect(mj.mp.isHost).toBe(false)
    expect(mj.mp.hostUid).toBe('outro')
    expect(typeof chamadas.aoReceberCriaturas).toBe('function')
  })

  it('de volta de uma queda numa sala que já não existe, sai e avisa', async () => {
    const { mj, chamadas, rede, ui } = montar()
    await mj.hostRoom()
    chamadas.aoMudarConexao(false)
    rede.getRoomMeta.mockResolvedValueOnce(null)
    chamadas.aoMudarConexao(true)
    await new Promise((k) => setTimeout(k, 0))
    expect(mj.mp.active).toBe(false)
    expect(ui.avisar).toHaveBeenCalledWith('roomClosed')
  })

  it('o host SOZINHO arma a autodestruição da sala; com companhia, desarma', async () => {
    const { mj, chamadas } = montar()
    await mj.hostRoom()
    chamadas.aoReceberJogadores([])
    chamadas.aoReceberJogadores([])
    expect(chamadas.fechamentos, 'rearmou sem mudança').toEqual([true])
    chamadas.aoReceberJogadores([remoto('outro')])
    expect(chamadas.fechamentos).toEqual([true, false])
    chamadas.aoReceberJogadores([])
    expect(chamadas.fechamentos).toEqual([true, false, true])

    const convidado = montar()
    await convidado.mj.joinByCode('WXYZ')
    convidado.chamadas.aoReceberJogadores([])
    expect(convidado.chamadas.fechamentos, 'convidado armou a autodestruição').toEqual([])
  })

  it('o último a sair leva a sala; com gente dentro, só sai', async () => {
    const sozinho = montar()
    await sozinho.mj.hostRoom()
    sozinho.chamadas.aoReceberJogadores([])
    await sozinho.mj.leaveMultiplayer()
    expect(sozinho.chamadas.saiu[0]).toMatchObject({ fecharSala: true })

    const acompanhado = montar()
    await acompanhado.mj.hostRoom()
    acompanhado.chamadas.aoReceberJogadores([remoto('outro')])
    await acompanhado.mj.leaveMultiplayer()
    expect(acompanhado.chamadas.saiu[0]).toMatchObject({ fecharSala: false })

    const convidado = montar()
    await convidado.mj.joinByCode('WXYZ')
    convidado.chamadas.aoReceberJogadores([])
    await convidado.mj.leaveMultiplayer()
    expect(convidado.chamadas.saiu[0]).toMatchObject({ fecharSala: false })
  })
})
