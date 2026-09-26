import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { criarHostFalso } from '@roqueos-games/jogo-sdk/host-falso'
import { useRoqueCraftMultijogador } from '../../src/composables/useRoqueCraftMultijogador.js'
import { criarSalaDoRoqueCraft } from '../../src/servicos/roqueCraftRoom.js'
import { packMobs } from '../../src/servicos/mobs.js'

// A SALA DE VERDADE: o multijogador inteiro sobre `criarSalaDoRoqueCraft` e o
// host falso do jogo-sdk, sem rede falsa no meio.
//
// `useRoqueCraftMultijogador.spec.js` prova a lógica do composable contra uma
// rede de mentira que o teste controla. Aqui a rede é a de produção (o
// adaptador) e o banco é o do host falso: os nós, os campos, a primeira entrega
// depois da chamada, a queda de conexão rodando o `aoCair`, e a regra do banco
// feita pelo `recusar` (o compare-and-set da mobília e a sucessão recusada).
// O outro jogador entra por `host.disparar('salaAoVivo', …)`.

const esperar = () => new Promise((fim) => setTimeout(fim, 0))

function sessaoFalsa(over = {}) {
  const estado = {
    semente: 1,
    instante: 1000,
    criaturas: [{ id: 'm1', type: 'pig', x: 3, y: 64, z: 0 }],
    golpes: [],
    recomecos: [],
    moveis: new Map([['1,2,3', { t: 'b', s: [['stone', 4]], v: 0 }]]),
    moveisAplicados: [],
    edicoesAplicadas: [],
  }
  const sessao = {
    instantaneo: () => ({ x: 0, y: 64, z: 0, yaw: 0, health: 20, item: '', act: '', skin: '' }),
    instantaneoCompleto: () => ({ seed: estado.semente, ticks: estado.instante }),
    restaurarSolo: () => true,
    criaturas: () => estado.criaturas,
    definirCriaturas: (l) => (estado.criaturas = l),
    golpear: (id, dano) => estado.golpes.push([id, dano]),
    posicaoDaCriatura: (id) => {
      const m = estado.criaturas.find((c) => c.id === id)
      return m ? { x: m.x, y: m.y, z: m.z } : null
    },
    aplicarEdicoes: (l) => estado.edicoesAplicadas.push(...l),
    temMundo: () => false,
    liquidoEm: () => false,
    audio: () => null,
    semente: () => estado.semente,
    modo: () => 'survival',
    edicoes: () => new Map([['0,0', new Map([[5, 21]])]]),
    instante: () => estado.instante,
    acertarRelogio: (t) => (estado.instante = t),
    climaForcado: () => null,
    acertarClima: () => {},
    mobiliaSerializada: () => [...estado.moveis].map(([k, d]) => ({ k, ...d })),
    entradaDeMobilia: (k) => estado.moveis.get(k) ?? null,
    entradaParaEnvio: (k) => {
      const d = estado.moveis.get(k)
      if (!d) return null
      d.v = (d.v | 0) + 1
      return { ...d }
    },
    aplicarMobilia: (k, d) => estado.moveisAplicados.push([k, d]),
    raioDeSync: () => 1,
    centroEmChunk: () => [0, 0],
    recomecarEm: (s) => {
      estado.recomecos.push(s)
      estado.semente = s
    },
    guardar: async () => {},
    definirSkin: (id) => id,
    ...over,
  }
  return { sessao, estado }
}

function montar({ uid = 'h', nome = 'Ana', recusar = null } = {}) {
  const regra = { atual: recusar }
  const host = criarHostFalso({
    jogoId: 'roquecraft',
    uid,
    nome,
    recusar: (p) => Boolean(regra.atual?.(p)),
  })
  const { sessao, estado } = sessaoFalsa()
  const ui = { paused: ref(false), sairDoPonteiro: vi.fn(), focarChat: vi.fn(), avisar: vi.fn() }
  const mj = useRoqueCraftMultijogador({
    identidade: { nomePadrao: () => 'Jogador' },
    sessao,
    ui,
    rede: criarSalaDoRoqueCraft(host.salaAoVivo),
  })
  const pedidos = (metodo) =>
    host.chamadas.filter((c) => c.capacidade === 'salaAoVivo' && c.metodo === metodo)
  return { host, mj, estado, ui, regra, pedidos }
}

describe('o multijogador sobre a sala ao vivo do host', () => {
  it('hospedar grava o meta, semeia o mundo e a mobília, e apresenta o jogador', async () => {
    const { host, mj } = montar()
    await mj.hostRoom()
    expect(mj.mp.mode).toBe('connected')
    expect(mj.mp.isHost).toBe(true)
    expect(mj.meuUid.value).toBe('h')
    const sala = host.arvoreDaSala(mj.mp.code)
    expect(sala.meta).toMatchObject({ host: 'h', hostName: 'Ana', seed: 1, mode: 'survival' })
    expect(sala.blocks['0_0']['5']).toBe(21)
    expect(sala.mobilia['1,2,3']).toMatchObject({ t: 'b', v: 0 })
    expect(sala.players.h).toMatchObject({ name: 'Ana', health: 20 })
    // O link do convite é o do host, e o QR sai dele.
    expect(mj.mp.joinUrl).toContain(mj.mp.code)
  })

  it('o outro jogador que entra aparece no lobby; o que cai some', async () => {
    const { host, mj } = montar()
    await mj.hostRoom()
    await esperar()
    const codigo = mj.mp.code
    host.disparar('salaAoVivo', {
      acao: 'gravar',
      codigo,
      uid: 'bia',
      caminho: 'players/bia',
      valor: { name: 'Bia', x: 1, y: 64, z: 1, yaw: 0, health: 20 },
    })
    host.disparar('salaAoVivo', { acao: 'aoCair', codigo, uid: 'bia', caminho: 'players/bia' })
    expect(mj.mp.players).toBe(2)
    expect(mj.lobbyPlayers.value.map((p) => p.uid)).toEqual(['h', 'bia'])
    host.disparar('salaAoVivo', { acao: 'cair', uid: 'bia' })
    expect(mj.mp.players).toBe(1)
  })

  it('o convidado entra pelo código, recomeça na semente do anfitrião e vê as criaturas dele', async () => {
    const { host, mj, estado } = montar({ uid: 'z' })
    host.disparar('salaAoVivo', {
      acao: 'criar',
      codigo: 'WXYZ1',
      uid: 'a',
      nome: 'Anfitrião',
      meta: { seed: 999, mode: 'survival' },
    })
    await mj.joinByCode('wxyz1')
    expect(mj.mp.mode).toBe('connected')
    expect(mj.mp.isHost).toBe(false)
    expect(mj.mp.hostUid).toBe('a')
    expect(estado.recomecos).toEqual([999])
    // Quem entrou pelo código não recebe link do host: o convite é o código.
    expect(mj.mp.joinUrl).toBe('')
    await esperar()
    host.disparar('salaAoVivo', {
      acao: 'gravar',
      codigo: 'WXYZ1',
      uid: 'a',
      caminho: 'mobs',
      // O retrato no formato do anfitrião (`packMobs`): lista de listas, que o
      // banco guarda por índice e devolve lista.
      valor: {
        snap: packMobs([{ id: 7, type: 'zombie', x: 1, y: 64, z: 2, yaw: 0, health: 20 }]),
        t: 1,
      },
    })
    expect(estado.criaturas).toMatchObject([{ id: '7', type: 'zombie', x: 1, z: 2, remote: true }])
  })

  it('o golpe do convidado chega ao anfitrião, e a fila é consumida', async () => {
    const { host, mj, estado } = montar()
    await mj.hostRoom()
    await esperar()
    const codigo = mj.mp.code
    host.disparar('salaAoVivo', {
      acao: 'gravar',
      codigo,
      uid: 'bia',
      caminho: 'players/bia',
      valor: { name: 'Bia', x: 3, y: 64, z: 1, yaw: 0, health: 20 },
    })
    host.disparar('salaAoVivo', {
      acao: 'empurrar',
      codigo,
      uid: 'bia',
      caminho: 'hits',
      valor: { m: 'm1', d: 5, by: 'bia' },
    })
    expect(estado.golpes).toEqual([['m1', 5]])
    expect(host.arvoreDaSala(codigo).hits).toBeUndefined()
  })

  it('a regra do banco recusa o baú (v + 1): desfaz o clique, conta e relê a entrada', async () => {
    const { host, mj, estado, regra } = montar()
    await mj.hostRoom()
    await esperar()
    const codigo = mj.mp.code
    // Outro jogador mexeu no baú antes: a sala tem v = 5.
    host.disparar('salaAoVivo', {
      acao: 'gravar',
      codigo,
      uid: 'bia',
      caminho: 'mobilia/1,2,3',
      valor: { t: 'b', s: [['dirt', 1]], v: 5 },
    })
    regra.atual = ({ operacao, caminho, valor }) =>
      operacao === 'gravar' && caminho.startsWith('mobilia/') && valor?.v !== 6
    const desfazer = vi.fn()
    mj.publicarMobilia('1,2,3', true, desfazer)
    await vi.waitFor(() => expect(desfazer).toHaveBeenCalledTimes(1))
    expect(mj.mobiliaRecusada()).toBe(1)
    await vi.waitFor(() =>
      expect(estado.moveisAplicados.at(-1)).toEqual(['1,2,3', { t: 'b', s: [['dirt', 1]], v: 5 }]),
    )
  })

  it('a sucessão: o anfitrião some e o menor uid assume; com a regra recusando, não assume', async () => {
    for (const recusa of [false, true]) {
      const { host, mj, regra } = montar({ uid: 'b' })
      host.disparar('salaAoVivo', {
        acao: 'criar',
        codigo: 'SALA1',
        uid: 'a',
        meta: { seed: 1, mode: 'survival' },
      })
      host.disparar('salaAoVivo', {
        acao: 'gravar',
        codigo: 'SALA1',
        uid: 'a',
        caminho: 'players/a',
        valor: { name: 'A', x: 0, y: 64, z: 0, yaw: 0, health: 20 },
      })
      await mj.joinByCode('SALA1')
      await esperar()
      if (recusa) regra.atual = ({ caminho }) => caminho === 'meta'
      host.disparar('salaAoVivo', {
        acao: 'apagar',
        codigo: 'SALA1',
        uid: 'a',
        caminho: 'players/a',
      })
      await vi.waitFor(() =>
        expect(host.chamadas.some((c) => c.metodo === 'atualizar' && c.args[1] === 'meta')).toBe(
          true,
        ),
      )
      await esperar()
      expect(host.arvoreDaSala('SALA1').meta.host).toBe(recusa ? 'a' : 'b')
      expect(mj.mp.isHost).toBe(!recusa)
    }
  })

  it('a queda apaga a presença do convidado (aoCair); a volta reapresenta e rearma', async () => {
    const { host, mj, pedidos } = montar({ uid: 'z' })
    host.disparar('salaAoVivo', {
      acao: 'criar',
      codigo: 'SALA2',
      uid: 'a',
      meta: { seed: 1, mode: 'survival' },
    })
    host.disparar('salaAoVivo', {
      acao: 'gravar',
      codigo: 'SALA2',
      uid: 'a',
      caminho: 'players/a',
      valor: { name: 'A', x: 0, y: 64, z: 0, yaw: 0, health: 20 },
    })
    await mj.joinByCode('SALA2')
    await esperar()
    expect(host.arvoreDaSala('SALA2').players.z).toBeTruthy()
    host.disparar('conexao', false)
    expect(host.arvoreDaSala('SALA2').players.z).toBeUndefined()
    const armadas = pedidos('aoCair').length
    host.disparar('conexao', true)
    await vi.waitFor(() => expect(host.arvoreDaSala('SALA2').players.z).toBeTruthy())
    expect(pedidos('aoCair').length).toBeGreaterThan(armadas)
    expect(mj.mp.active).toBe(true)
  })

  // ⚠️ ACHADO PRÉ-EXISTENTE, NÃO CONSERTADO (relatado ao founder): o anfitrião
  // COM COMPANHIA que cai fica na sala como fantasma. Quando alguém entra, o
  // anfitrião desarma a autodestruição da sala com `onDisconnect(sala).cancel()`
  // (`fecharSalaAoCair(code, false)`), e o banco cancela o `onDisconnect` daquele
  // nó E DE TODOS OS FILHOS — inclusive o `players/<anfitrião>` que o
  // `enterRoom` armou. É o comportamento documentado do Realtime Database, e o
  // host falso do jogo-sdk faz igual. Com a presença dele de pé, ninguém vê o
  // anfitrião sumir, a sucessão (Onda 6.2) não dispara e as criaturas congelam.
  // O código é o de antes da extração; o teste abaixo mostra o defeito e passa a
  // passar quando ele for consertado (e aí a marca `fails` sai).
  it.fails(
    'o anfitrião com companhia que cai some da sala (e a sucessão pode acontecer)',
    async () => {
      const { host, mj } = montar()
      await mj.hostRoom()
      await esperar()
      const codigo = mj.mp.code
      host.disparar('salaAoVivo', {
        acao: 'gravar',
        codigo,
        uid: 'bia',
        caminho: 'players/bia',
        valor: { name: 'Bia', x: 1, y: 64, z: 1, yaw: 0, health: 20 },
      })
      host.disparar('conexao', false)
      expect(host.arvoreDaSala(codigo).players.h).toBeUndefined()
    },
  )

  it('o anfitrião SOZINHO que cai leva a sala junto, e quem volta não acha sala', async () => {
    const { host, mj, ui } = montar()
    await mj.hostRoom()
    await esperar()
    const codigo = mj.mp.code
    host.disparar('conexao', false)
    expect(host.arvoreDaSala(codigo)).toBe(null)
    host.disparar('conexao', true)
    await vi.waitFor(() => expect(mj.mp.active).toBe(false))
    expect(ui.avisar).toHaveBeenCalledWith('roomClosed')
  })

  it('sem conta o host recusa, e o jogo mostra o aviso de conta sem criar nada', async () => {
    const { host, mj, pedidos } = montar({ uid: null, nome: null })
    await mj.hostRoom()
    expect(mj.mp.error).toBe('needAccount')
    expect(mj.semConta.value).toBe(true)
    await mj.joinByCode('ABCDE')
    expect(mj.mp.error).toBe('needAccount')
    expect(pedidos('gravar')).toEqual([])
    expect(host.avisosDoHost).toEqual([])
  })

  it('sair leva a sala junto quando o anfitrião estava sozinho', async () => {
    const { host, mj } = montar()
    await mj.hostRoom()
    await esperar()
    const codigo = mj.mp.code
    await mj.leaveMultiplayer()
    expect(host.arvoreDaSala(codigo)).toBe(null)
    expect(mj.mp.active).toBe(false)
    expect(mj.assinaturasAbertas()).toBe(0)
  })
})
