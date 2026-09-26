import { describe, it, expect, vi, beforeEach } from 'vitest'
import { criarHostFalso } from '@roqueos-games/jogo-sdk/host-falso'

// A SALA DO ROQUECRAFT, SOBRE O HOST FALSO DO JOGO-SDK.
//
// Até a extração este arquivo mockava o `firebase/database` e o
// `useRealtimeMatch` do RoqueOS e conferia o caminho de cada `ref`. Agora a
// sala é do host (`salaAoVivo`) e o host falso guarda a sala de verdade, em
// memória, com as regras do contrato (caminho, valor, primeira entrega depois,
// `recusar` no papel da regra do banco). Os casos são os de antes; o que se
// confere é a ÁRVORE da sala (`host.arvoreDaSala`) e o que o jogo pediu ao host
// (`host.chamadas`), no lugar do caminho do `ref`. As partes puras não mudaram.
import {
  chunkPath,
  parseChunkPath,
  editToPath,
  pathToEdit,
  remotePlayerList,
  sanitizeChat,
  normalizeChat,
  lotesDeSemeadura,
  sucessorDoAnfitriao,
  criarSalaDoRoqueCraft,
  CHAT_LIMIT,
  LOTE_DE_SEMEADURA,
  MAX_CHAT_LEN,
} from '../../src/servicos/roqueCraftRoom.js'
import { buildSavePayload, parseSave } from '../../src/servicos/roqueCraftSave.js'
import { createInventory, addItem } from '../../src/servicos/inventory.js'
import { createSurvivalState } from '../../src/servicos/survival.js'
import { localIndex } from '../../src/servicos/constants.js'

// A primeira entrega de observar chega DEPOIS da chamada (como no banco).
const esperar = () => new Promise((fim) => setTimeout(fim, 0))

let host
let sala
let regra
/** Uma sala nova, com o host `h` e a regra do banco que o teste escolher. */
function novaSala({ uid = 'h', nome = 'Host' } = {}) {
  regra = null
  host = criarHostFalso({
    jogoId: 'roquecraft',
    uid,
    nome,
    recusar: (pedido) => Boolean(regra?.(pedido)),
  })
  sala = criarSalaDoRoqueCraft(host.salaAoVivo)
  return sala
}
/** O que o jogo pediu à sala ao vivo, por método. */
const pedidos = (metodo) =>
  host.chamadas.filter((c) => c.capacidade === 'salaAoVivo' && c.metodo === metodo)
/** Uma sala criada, já com o jogo dentro. */
async function salaCriada(opcoes = {}) {
  novaSala()
  const r = await sala.createRoom({ seed: 1, edits: new Map(), ...opcoes })
  return r.code
}

beforeEach(() => novaSala())

describe('roqueCraftRoom - chaves', () => {
  it('chunkPath usa _ e preserva negativos', () => {
    expect(chunkPath(-3, 7)).toBe('-3_7')
    expect(parseChunkPath('-3_7')).toEqual({ cx: -3, cz: 7 })
    expect(parseChunkPath('lixo')).toBe(null)
  })

  it('coordenada global ida e volta por (chunk, índice local)', () => {
    for (const [x, y, z] of [
      [0, 64, 0],
      [-1, 5, -1],
      [37, 120, -42],
      [15, 0, 15],
    ]) {
      const { chunk, li } = editToPath(x, y, z)
      expect(pathToEdit(chunk, li, 3)).toEqual({ x, y, z, id: 3 })
    }
  })

  it('índice fora do intervalo é descartado', () => {
    expect(pathToEdit('0_0', -1, 1)).toBe(null)
    expect(pathToEdit('0_0', 99999999, 1)).toBe(null)
    expect(pathToEdit('x_y', 5, 1)).toBe(null)
  })

  it('o link do convite vem do host, com o código da sala', async () => {
    // Era "deep-link aponta pro jogo certo" (`buildRoomUrl`, do `useRealtimeMatch`
    // do RoqueOS). O link agora é do host: o jogo só repassa o que ele deu.
    const r = await sala.createRoom({ seed: 1, edits: new Map() })
    expect(r.joinUrl).toContain(r.code)
    expect(r.joinUrl).toContain('roquecraft')
  })
})

describe('roqueCraftRoom - listas remotas', () => {
  it('exclui o próprio uid e entradas malformadas', () => {
    const list = remotePlayerList(
      {
        me: { name: 'Eu', x: 0, y: 0, z: 0 },
        a: { name: 'A', x: 1, y: 2, z: 3, yaw: 0.5, health: 12 },
        b: { name: 'B', x: 'nao', y: 2, z: 3 },
        c: null,
      },
      'me',
    )
    expect(list.length).toBe(1)
    expect(list[0]).toEqual(expect.objectContaining({ uid: 'a', name: 'A', health: 12 }))
  })

  it('nome longo é truncado (não estoura a UI)', () => {
    const list = remotePlayerList({ a: { name: 'x'.repeat(80), x: 0, y: 0, z: 0 } }, 'me')
    expect(list[0].name.length).toBe(24)
  })

  it('lista vazia ou inválida devolve []', () => {
    expect(remotePlayerList(null, 'me')).toEqual([])
    expect(remotePlayerList('nao', 'me')).toEqual([])
  })
})

describe('roqueCraftRoom - chat', () => {
  it('remove marcação (o texto vem de outro usuário)', () => {
    expect(sanitizeChat('<script>alert(1)</script>')).toBe('scriptalert(1)/script')
  })
  it('remove caracteres de controle', () => {
    expect(sanitizeChat(`oi${String.fromCharCode(7)}la`)).toBe('oi la')
  })
  it('corta no limite', () => {
    expect(sanitizeChat('a'.repeat(500)).length).toBe(MAX_CHAT_LEN)
  })
  it('mensagem vazia é descartada', () => {
    expect(normalizeChat({ text: '   ' }, 'k')).toBe(null)
    expect(normalizeChat(null, 'k')).toBe(null)
  })
  it('mensagem válida vira objeto normalizado', () => {
    expect(normalizeChat({ uid: 'u', name: 'N', text: ' oi ', t: 5 }, 'k1')).toEqual({
      id: 'k1',
      uid: 'u',
      name: 'N',
      text: 'oi',
      t: 5,
    })
  })
  it('sendChat não envia texto vazio', async () => {
    const code = await salaCriada()
    expect(await sala.sendChat(code, { uid: 'u', name: 'N', text: '  ' })).toBe(false)
    expect(pedidos('empurrar')).toEqual([])
  })
})

describe('roqueCraftRoom - criação de sala', () => {
  it('semeia os edits do host agrupados por chunk', async () => {
    const edits = new Map([
      [
        '0,0',
        new Map([
          [localIndex(1, 70, 2), 3],
          [localIndex(1, 71, 2), 0],
        ]),
      ],
      ['-1,4', new Map([[localIndex(0, 64, 0), 5]])],
    ])
    const r = await sala.createRoom({ hostUid: 'h', hostName: 'Host', seed: 99, edits })
    expect(r.code).toMatch(/^[A-Z0-9]{4,12}$/)
    const arvore = host.arvoreDaSala(r.code)
    // O `meta` é do host (host, hostName, createdAt) com o que o jogo mandou.
    expect(arvore.meta).toMatchObject({ host: 'h', hostName: 'Host', seed: 99, mode: 'survival' })
    const batch = pedidos('atualizar')[0].args[2]
    expect(pedidos('atualizar')[0].args[1]).toBe('blocks')
    expect(batch[`0_0/${localIndex(1, 70, 2)}`]).toBe(3)
    expect(batch[`0_0/${localIndex(1, 71, 2)}`]).toBe(0)
    expect(batch[`-1_4/${localIndex(0, 64, 0)}`]).toBe(5)
    expect(arvore.blocks['-1_4'][localIndex(0, 64, 0)]).toBe(5)
  })

  // Onda 6.1: NÃO HÁ MAIS TETO. Havia um de 8.000 e o resto do mundo ficava
  // no host; o convidado entrava com a casa pela metade, sem aviso.
  it('semeia o mundo INTEIRO, em lotes sequenciais de LOTE_DE_SEMEADURA', async () => {
    const m = new Map()
    const total = LOTE_DE_SEMEADURA * 4 + 500
    for (let i = 0; i < total; i++) m.set(i, 1)
    await sala.createRoom({ hostUid: 'h', hostName: 'H', seed: 1, edits: new Map([['0,0', m]]) })
    const lotes = pedidos('atualizar')
    expect(lotes.length).toBe(5)
    const tamanhos = lotes.map((c) => Object.keys(c.args[2]).length)
    expect(tamanhos).toEqual([2000, 2000, 2000, 2000, 500])
    expect(
      tamanhos.reduce((a, b) => a + b, 0),
      'sobrou edit no host',
    ).toBe(total)
    expect(new Set(lotes.map((c) => c.args[1])).size).toBe(1)
  })

  it('lote recusado derruba a criação, como o `update` que lançava', async () => {
    regra = ({ operacao, caminho }) => operacao === 'atualizar' && caminho === 'blocks'
    await expect(
      sala.createRoom({ seed: 1, edits: new Map([['0,0', new Map([[1, 3]])]]) }),
    ).rejects.toThrow(/semeadura/)
  })

  it('lotesDeSemeadura corta por tamanho, cruza chunks e ignora chave inválida', () => {
    const edits = new Map([
      [
        '0,0',
        new Map([
          [1, 3],
          [2, 4],
          [3, 5],
        ]),
      ],
      ['lixo', new Map([[9, 9]])],
      ['-1,4', new Map([[7, 6]])],
    ])
    const lotes = lotesDeSemeadura(edits, 2)
    expect(lotes).toEqual([
      { '0_0/1': 3, '0_0/2': 4 },
      { '0_0/3': 5, '-1_4/7': 6 },
    ])
    expect(lotesDeSemeadura(new Map(), 2)).toEqual([])
    expect(lotesDeSemeadura(null)).toEqual([])
    // Tamanho absurdo não vira laço infinito nem lote vazio.
    expect(lotesDeSemeadura(edits, 0).length).toBe(4)
  })

  it('a sala nasce com a mobília do anfitrião, por chave', async () => {
    const r = await sala.createRoom({
      hostUid: 'h',
      hostName: 'H',
      seed: 1,
      edits: new Map(),
      mobilia: [
        { k: '1,2,3', t: 'b', s: [['stone', 4]] },
        { t: 'f' }, // sem chave: fora
      ],
    })
    const ultimo = pedidos('atualizar').at(-1)
    expect(ultimo.args[1]).toBe('mobilia')
    expect(ultimo.args[2]).toEqual({ '1,2,3': { t: 'b', s: [['stone', 4]] } })
    expect(host.arvoreDaSala(r.code).mobilia).toEqual({ '1,2,3': { t: 'b', s: [['stone', 4]] } })
  })

  it('publishMobilia escreve a entrada por chave, null apaga, e diz se a sala aceitou', async () => {
    const code = await salaCriada()
    expect(await sala.publishMobilia(code, '1,2,3', { t: 'b', s: [], v: 1 })).toBe(true)
    expect(pedidos('gravar').at(-1).args[1]).toBe('mobilia/1,2,3')
    expect(host.arvoreDaSala(code).mobilia['1,2,3']).toEqual({ t: 'b', v: 1 })
    await sala.publishMobilia(code, '1,2,3', undefined)
    expect(pedidos('gravar').at(-1).args[2]).toBe(null)
    expect(host.arvoreDaSala(code).mobilia).toBeUndefined()
    // A regra do banco (`v === data.v + 1`) recusa: o host devolve false.
    regra = ({ caminho }) => caminho === 'mobilia/1,2,3'
    expect(await sala.publishMobilia(code, '1,2,3', { t: 'b', s: [], v: 1 })).toBe(false)
  })

  it('getMobilia lê a entrada como a sala a tem, null se não há', async () => {
    const code = await salaCriada()
    host.disparar('salaAoVivo', {
      acao: 'gravar',
      codigo: code,
      caminho: 'mobilia/1,2,3',
      valor: { t: 'b', v: 3 },
    })
    expect(await sala.getMobilia(code, '1,2,3')).toEqual({ t: 'b', v: 3 })
    expect(pedidos('ler').at(-1).args[1]).toBe('mobilia/1,2,3')
    expect(await sala.getMobilia(code, '4,5,6')).toBe(null)
    // Leitura recusada também é null: quem chama só quer saber o que reler.
    regra = ({ operacao }) => operacao === 'ler'
    expect(await sala.getMobilia(code, '1,2,3')).toBe(null)
  })

  it('subscribeMobilia entrega nascimento, mudança e remoção (esta como null)', async () => {
    const code = await salaCriada()
    const cb = vi.fn()
    const off = sala.subscribeMobilia(code, cb)
    await esperar()
    const outro = (acao, valor) =>
      host.disparar('salaAoVivo', { acao, codigo: code, caminho: 'mobilia/1,2,3', valor })
    outro('gravar', { t: 'b' })
    outro('gravar', { t: 'f' })
    outro('apagar')
    expect(pedidos('observarFilhos').at(-1).args[1]).toBe('mobilia')
    expect(cb.mock.calls).toEqual([
      ['1,2,3', { t: 'b' }],
      ['1,2,3', { t: 'f' }],
      ['1,2,3', null],
    ])
    expect(() => off()).not.toThrow()
  })

  it('sala sem edits não faz write de bloco', async () => {
    await sala.createRoom({ hostUid: 'h', hostName: 'H', seed: 1, edits: new Map() })
    expect(pedidos('atualizar')).toEqual([])
  })

  it('publishClock escreve ticks e chuva (null quando o mundo manda)', async () => {
    const code = await salaCriada()
    await sala.publishClock(code, { ticks: 6000, chuva: undefined })
    const [, caminho, v] = pedidos('gravar').at(-1).args
    expect(caminho).toBe('relogio')
    expect(v).toMatchObject({ ticks: 6000, chuva: null })
    // A hora vai como o marcador do servidor, que o host troca pela hora dele.
    expect(v.t).toEqual({ '.sv': 'timestamp' })
    await sala.publishClock(code, { ticks: 100, chuva: 0.5 })
    expect(pedidos('gravar').at(-1).args[2]).toMatchObject({ ticks: 100, chuva: 0.5 })
    expect(host.arvoreDaSala(code).relogio).toMatchObject({ ticks: 100, chuva: 0.5 })
  })

  it('subscribeClock entrega só relógio com forma, normalizado', async () => {
    const code = await salaCriada()
    const cb = vi.fn()
    sala.subscribeClock(code, cb)
    await esperar()
    expect(pedidos('observar').at(-1).args[1]).toBe('relogio')
    const relogio = (valor) =>
      host.disparar('salaAoVivo', { acao: 'gravar', codigo: code, caminho: 'relogio', valor })
    relogio({ chuva: 1 })
    expect(cb, 'relógio sem ticks chegou ao jogo').not.toHaveBeenCalled()
    relogio({ ticks: 24010, chuva: 7 })
    expect(cb).toHaveBeenCalledWith({ ticks: 10, chuva: 1 })
  })

  it('sucessorDoAnfitriao é o menor uid, igual em todo cliente', () => {
    expect(sucessorDoAnfitriao(['zed', 'abc', 'mno'])).toBe('abc')
    expect(sucessorDoAnfitriao(['b', '', null, 'a'])).toBe('a')
    expect(sucessorDoAnfitriao([])).toBe(null)
    expect(sucessorDoAnfitriao(null)).toBe(null)
  })

  it('claimHost escreve só o host da meta, e responde false quando a regra recusa', async () => {
    const code = await salaCriada()
    expect(await sala.claimHost(code, 'eu')).toBe(true)
    const [, caminho, v] = pedidos('atualizar').at(-1).args
    expect(caminho).toBe('meta')
    expect(v).toEqual({ host: 'eu' })
    // O `update` preserva o resto do meta (a regra confere o `seed` igual).
    expect(host.arvoreDaSala(code).meta).toMatchObject({ host: 'eu', seed: 1 })
    regra = ({ caminho: c }) => c === 'meta'
    expect(await sala.claimHost(code, 'eu')).toBe(false)
  })

  it('a sala fecha com o ÚLTIMO a sair, não com o host ao entrar', async () => {
    const code = await salaCriada()
    await sala.enterRoom({ code, uid: 'h', name: 'H', pos: { x: 0, y: 0, z: 0 } })
    // Só o próprio jogador se apaga ao cair; a sala não.
    expect(pedidos('aoCair').map((c) => [c.args[1], c.args[2]])).toEqual([['players/h', 'apagar']])
    await sala.fecharSalaAoCair(code, true)
    expect(pedidos('aoCair').at(-1).args.slice(1)).toEqual(['', 'apagar'])
    await sala.fecharSalaAoCair(code, false)
    expect(pedidos('aoCair').at(-1).args.slice(1)).toEqual(['', 'cancelar'])

    await sala.leaveRoom({ code, uid: 'h' })
    expect(pedidos('apagar').at(-1).args[1]).toBe('players/h')
    // Sair para os ouvintes desta janela naquela sala.
    expect(pedidos('sair').at(-1).args[0]).toBe(code)

    const outra = await salaCriada()
    await sala.leaveRoom({ code: outra, uid: 'h', fecharSala: true })
    expect(pedidos('apagar').at(-1).args[1]).toBe('')
    expect(host.arvoreDaSala(outra)).toBe(null)
  })

  it('cair a conexão apaga a presença armada, e a sala só quando o anfitrião armou', async () => {
    // O `onDisconnect` do banco, feito pelo host falso: `disparar('conexao', false)`.
    const code = await salaCriada()
    await sala.enterRoom({ code, uid: 'h', name: 'H', pos: { x: 1, y: 2, z: 3 } })
    expect(host.arvoreDaSala(code).players.h).toMatchObject({ name: 'H', x: 1, y: 2, z: 3 })
    host.disparar('conexao', false)
    expect(host.arvoreDaSala(code).players).toBeUndefined()
    expect(host.arvoreDaSala(code).meta, 'a sala morreu com a presença').toBeTruthy()
  })

  it('publishEdit escreve no caminho do chunk certo', async () => {
    const code = await salaCriada()
    await sala.publishEdit(code, 17, 70, -3, 9)
    const caminho = pedidos('gravar').at(-1).args[1]
    expect(caminho).toBe(`blocks/1_-1/${localIndex(1, 70, 13)}`)
    expect(host.arvoreDaSala(code).blocks['1_-1'][localIndex(1, 70, 13)]).toBe(9)
  })
})

describe('roqueCraftRoom - entrar, quem sou eu e o resto da sala pelo host', () => {
  it('entrar pelo código devolve o meta e diz quem é o jogador na sala', async () => {
    host.disparar('salaAoVivo', { acao: 'criar', codigo: 'WXYZ1', uid: 'outro', meta: { seed: 7 } })
    expect(sala.eu()).toBe(null)
    const meta = await sala.getRoomMeta('WXYZ1')
    expect(meta).toMatchObject({ host: 'outro', seed: 7 })
    expect(sala.eu()).toEqual({ uid: 'h', nome: 'Host' })
    // Na volta de uma queda a janela já está na sala: lê o meta, não entra de novo.
    await sala.getRoomMeta('WXYZ1')
    expect(pedidos('entrar')).toHaveLength(1)
    expect(pedidos('ler').at(-1).args[1]).toBe('meta')
  })

  it('sala que não existe é null; sem conta, lança com o código do host', async () => {
    expect(await sala.getRoomMeta('NADA1')).toBe(null)
    expect(await sala.getRoomMeta('')).toBe(null)
    novaSala({ uid: null })
    await expect(sala.getRoomMeta('WXYZ1')).rejects.toMatchObject({ codigo: 'sem-conta' })
    await expect(sala.createRoom({ seed: 1, edits: new Map() })).rejects.toMatchObject({
      codigo: 'sem-conta',
    })
  })

  it('criar diz quem é o jogador, e o meta sai com o uid DO HOST', async () => {
    const r = await sala.createRoom({ hostUid: 'outra-pessoa', seed: 3, edits: new Map() })
    expect(r.eu).toEqual({ uid: 'h', nome: 'Host' })
    expect(sala.eu()).toEqual({ uid: 'h', nome: 'Host' })
    expect(host.arvoreDaSala(r.code).meta.host).toBe('h')
  })

  it('presença recusada lança, como o `set` do banco lançava', async () => {
    const code = await salaCriada()
    regra = ({ caminho }) => caminho === 'players/h'
    await expect(
      sala.enterRoom({ code, uid: 'h', name: 'H', pos: { x: 0, y: 0, z: 0 } }),
    ).rejects.toThrow(/presença/)
  })

  it('o golpe do convidado sai com `by` null quando não há quem (o banco recusa undefined)', async () => {
    const code = await salaCriada()
    await sala.sendHit(code, { mobId: 42, damage: 3.4 })
    const [, caminho, valor] = pedidos('empurrar').at(-1).args
    expect(caminho).toBe('hits')
    expect(valor).toEqual({ m: '42', d: 3.4, by: null })
  })

  it('o anfitrião consome cada golpe da fila, válido ou não', async () => {
    const code = await salaCriada()
    const cb = vi.fn()
    sala.subscribeHits(code, cb)
    await esperar()
    const golpe = (valor) =>
      host.disparar('salaAoVivo', { acao: 'empurrar', codigo: code, caminho: 'hits', valor })
    golpe({ m: 'm1', d: 4, by: 'outro' })
    golpe({ d: 1, by: 'outro' }) // sem mob: sai da fila sem chegar ao jogo
    await esperar()
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb.mock.calls[0][0]).toMatchObject({ mobId: 'm1', damage: 4, by: 'outro' })
    expect(host.arvoreDaSala(code).hits, 'golpe ficou na fila').toBeUndefined()
  })

  it('o chat assina só as últimas CHAT_LIMIT mensagens e normaliza cada uma', async () => {
    const code = await salaCriada()
    for (let i = 0; i < CHAT_LIMIT + 5; i++) {
      host.disparar('salaAoVivo', {
        acao: 'empurrar',
        codigo: code,
        caminho: 'chat',
        valor: { uid: 'o', name: 'O', text: `m${i}`, t: i },
      })
    }
    const recebidas = []
    sala.subscribeChat(code, (m) => recebidas.push(m.text))
    await esperar()
    expect(pedidos('observarFilhos').at(-1).args[3]).toEqual({ ultimos: CHAT_LIMIT })
    expect(recebidas).toHaveLength(CHAT_LIMIT)
    expect(recebidas[0]).toBe('m5')
    expect(await sala.sendChat(code, { uid: 'h', name: 'H', text: ' oi ' })).toBe(true)
    expect(pedidos('empurrar').at(-1).args[2]).toMatchObject({ uid: 'h', name: 'H', text: 'oi' })
  })

  it('a presença publicada é um update do próprio nó, com a hora do servidor', async () => {
    const code = await salaCriada()
    await sala.enterRoom({ code, uid: 'h', name: 'H', pos: { x: 0, y: 0, z: 0 } })
    await sala.publishPosition(code, 'h', {
      x: 1,
      y: 2,
      z: 3,
      yaw: 0.5,
      health: 18,
      item: 'stone',
      skin: 'brasa',
      act: 'dig',
    })
    const [, caminho, parcial] = pedidos('atualizar').at(-1).args
    expect(caminho).toBe('players/h')
    expect(parcial).toMatchObject({ x: 1, y: 2, z: 3, health: 18, act: 'dig', skin: 'brasa' })
    expect(parcial.t).toEqual({ '.sv': 'timestamp' })
    expect(host.arvoreDaSala(code).players.h).toMatchObject({ name: 'H', x: 1, act: 'dig' })
  })

  it('o sync de blocos assina os chunks do raio e entrega as edições de fora', async () => {
    const code = await salaCriada()
    const lotes = []
    const sync = sala.createBlockSync(code, { radius: 1, onEdits: (l) => lotes.push(l) })
    sync.setCenter(0, 0)
    expect(sync.size).toBe(9)
    await esperar()
    host.disparar('salaAoVivo', {
      acao: 'gravar',
      codigo: code,
      caminho: `blocks/1_-1/${localIndex(1, 70, 13)}`,
      valor: 9,
    })
    expect(lotes.flat()).toEqual([{ x: 17, y: 70, z: -3, id: 9 }])
    // Andou para longe: larga o que saiu do raio (+2 de histerese).
    sync.setCenter(10, 10)
    expect(sync.size).toBe(9)
    sync.close()
    expect(sync.size).toBe(0)
  })
})

describe('roqueCraftSave', () => {
  it('payload sobrevive à ida e volta', () => {
    const inv = createInventory()
    addItem(inv, 'diamond_pickaxe', 1)
    addItem(inv, 'cobblestone', 30)
    const surv = createSurvivalState()
    surv.health = 12
    const payload = buildSavePayload({
      seed: 4242,
      edits: [0, 0, 500, 3, -1, 2, 900, 0],
      player: { x: 1.234567, y: 70.5, z: -3.9, yaw: 1.2, pitch: -0.3 },
      inventory: inv,
      survival: surv,
      ticks: 26000,
      mode: 'creative',
      hotbar: 3,
      settings: {
        renderDistance: 10,
        quality: 'ultra',
        fov: 80,
        sensitivity: 1.4,
        autoJump: false,
        showStats: true,
        sound: true,
      },
    })
    const back = parseSave(payload)
    expect(back.seed).toBe(4242)
    expect(back.mode).toBe('creative')
    expect(back.ticks).toBe(2000) // 26000 normalizado pro dia
    expect(back.hotbar).toBe(3)
    expect(back.player.x).toBeCloseTo(1.23, 2)
    expect(back.inventory[0].item).toBe('diamond_pickaxe')
    expect(back.survival.health).toBe(12)
    expect(back.edits.get('0,0').get(500)).toBe(3)
    expect(back.edits.get('-1,2').get(900)).toBe(0)
    expect(back.settings.quality).toBe('ultra')
  })

  it('save corrompido não derruba o jogo', () => {
    expect(parseSave(null)).toBe(null)
    const junk = parseSave({
      seed: 'x',
      edits: 'nope',
      player: { x: 'a' },
      inventory: 5,
      survival: 'z',
      ticks: NaN,
    })
    expect(junk.seed).toBe(1)
    expect(junk.player).toBe(null)
    expect(junk.edits.size).toBe(0)
    expect(junk.inventory.every((s) => s === null)).toBe(true)
    expect(junk.survival.health).toBe(20)
    expect(junk.mode).toBe('survival')
  })
})

// `skin` e `act` vêm da rede: são conteúdo de outro cliente. Lista fechada ou
// nada - `act` vira classe de animação e `skin` vira índice de paleta, e
// nenhum dos dois pode aceitar string arbitrária.
describe('presença remota - skin e ação', () => {
  const lista = remotePlayerList(
    {
      amigo: { name: 'Ana', x: 1, y: 2, z: 3, yaw: 0, skin: 'brasa', act: 'dig' },
      hacker: { name: 'X', x: 0, y: 0, z: 0, yaw: 0, skin: 'nao-existe', act: 'rm -rf' },
      antigo: { name: 'Bo', x: 4, y: 5, z: 6, yaw: 1 },
    },
    'eu',
  )
  const de = (uid) => lista.find((p) => p.uid === uid)

  it('passa skin e ação conhecidas', () => {
    expect(de('amigo').skin).toBe('brasa')
    expect(de('amigo').act).toBe('dig')
  })

  it('zera skin e ação desconhecidas', () => {
    expect(de('hacker').skin).toBe('')
    expect(de('hacker').act).toBe('')
  })

  it('jogador de versão antiga (sem os campos) continua entrando na lista', () => {
    expect(de('antigo')).toBeTruthy()
    expect(de('antigo').skin).toBe('')
    expect(de('antigo').act).toBe('')
  })
})

// A presença chega a ~10 Hz POR JOGADOR e passa pela normalização antes de
// virar avatar. Numa sala cheia isso roda em todo pacote, no mesmo thread do
// render - por isso tem orçamento, não só teste de correção.
describe('perf - presença de sala cheia', () => {
  it('normaliza 32 jogadores muito abaixo de um quadro', () => {
    const mapa = {}
    for (let i = 0; i < 32; i++) {
      mapa[`u${i}`] = {
        name: `Jogador ${i}`,
        x: i,
        y: 64,
        z: -i,
        yaw: i * 0.1,
        health: 20,
        item: 'stone',
        skin: 'brasa',
        act: i % 3 ? '' : 'dig',
      }
    }
    remotePlayerList(mapa, 'eu') // aquece
    const t0 = performance.now()
    for (let k = 0; k < 200; k++) remotePlayerList(mapa, 'eu')
    const ms = (performance.now() - t0) / 200
    console.log(`  [perf] presença de 32 jogadores: ${ms.toFixed(3)}ms por pacote`)
    expect(remotePlayerList(mapa, 'eu')).toHaveLength(32)
    // Teto folgado de propósito: o que não pode acontecer é isto virar
    // milissegundos e comer o quadro numa sala cheia.
    expect(ms).toBeLessThan(2)
  })
})
