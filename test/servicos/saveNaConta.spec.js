import { describe, it, expect } from 'vitest'
import { criarHostFalso } from '@roqueos-games/jogo-sdk/host-falso'
import {
  buildSavePayload,
  criarSaveDoRoqueCraft,
  parseSave,
} from '../../src/servicos/roqueCraftSave.js'
import { CARGA, carregarSave, podeSalvar } from '../../src/servicos/cargaDoSave.js'
import { criarTravessia, ESPERA_NO_PORTAL } from '../../src/servicos/travessia.js'
import { ID } from '../../src/servicos/blocks.js'

// O MUNDO NA CONTA, SOBRE O `progresso` DO HOST.
//
// Até a extração isto era `setDoc`/`getDoc` do Firestore no documento
// `users/{uid}/roqueos/roquecraft`. Agora quem escolhe o documento é o host, e
// o host falso do jogo-sdk faz o papel do Firestore: guarda em memória e RECUSA
// o que o Firestore recusa (undefined, array dentro de array, documento acima
// de 1 MiB). O que se prova aqui é a ponte (`criarSaveDoRoqueCraft`) e o RC-02
// ponta a ponta com ela.

const base = { seed: 7, player: { x: 1, y: 2, z: 3, yaw: 0, pitch: 0 } }
const conta = (progresso = {}) =>
  criarHostFalso({ jogoId: 'roquecraft', uid: 'u1', nome: 'Ana', progresso })
const pedidos = (host, metodo) =>
  host.chamadas.filter((c) => c.capacidade === 'progresso' && c.metodo === metodo)

describe('o save na conta, pelo host', () => {
  it('convidado não salva nem lê: sem onde guardar, nem pergunta ao host', async () => {
    const host = criarHostFalso({ jogoId: 'roquecraft' })
    const save = criarSaveDoRoqueCraft(host.progresso)
    expect(save.disponivel()).toBe(false)
    expect(await save.saveRoqueCraft(buildSavePayload(base))).toBe(false)
    expect(await save.loadRoqueCraft()).toBe(null)
    expect(pedidos(host, 'salvar')).toEqual([])
    expect(pedidos(host, 'carregar')).toEqual([])
  })

  it('host sem `progresso` é convidado para o save, e não quebra', async () => {
    const save = criarSaveDoRoqueCraft(undefined)
    expect(save.disponivel()).toBe(false)
    expect(await save.saveRoqueCraft({ seed: 1 })).toBe(false)
    expect(await save.loadRoqueCraft()).toBe(null)
  })

  it('grava SUBSTITUINDO o documento, como o `setDoc` sem merge', async () => {
    const host = conta({ salvo: { ...buildSavePayload(base), campoDeOutraVersao: 'lixo' } })
    const save = criarSaveDoRoqueCraft(host.progresso)
    expect(await save.saveRoqueCraft(buildSavePayload({ ...base, seed: 9 }))).toBe(true)
    const [dados, opcoes] = pedidos(host, 'salvar')[0].args
    expect(dados.seed).toBe(9)
    // Sem `mesclar`: o campo que não veio some, como sumia no Firestore.
    expect(opcoes?.mesclar ?? false).toBe(false)
    expect(host.progressoGuardado().campoDeOutraVersao).toBeUndefined()
    expect(host.progressoGuardado().seed).toBe(9)
  })

  it('lê o documento já passado pelo `parseSave`; sem documento, null', async () => {
    const payload = buildSavePayload({ ...base, edits: [0, 0, 5, 21], mode: 'creative' })
    const cheio = criarSaveDoRoqueCraft(conta({ salvo: payload }).progresso)
    const lido = await cheio.loadRoqueCraft()
    expect(lido).toEqual(parseSave(payload))
    expect([...lido.edits.get('0,0')]).toEqual([[5, 21]])
    expect(await criarSaveDoRoqueCraft(conta().progresso).loadRoqueCraft()).toBe(null)
  })

  it('leitura que FALHA rejeita (não vira "sem save"), com o código do host', async () => {
    const save = criarSaveDoRoqueCraft(conta({ falharLeitura: true }).progresso)
    await expect(save.loadRoqueCraft()).rejects.toMatchObject({ codigo: 'indisponivel' })
  })

  it('escrita recusada pelo host LANÇA, como o `setDoc` lançava (o autosave conta como falha)', async () => {
    const save = criarSaveDoRoqueCraft(conta({ falharEscrita: true }).progresso)
    await expect(save.saveRoqueCraft(buildSavePayload(base))).rejects.toThrow(/recusou/)
  })
})

// ⚠️ ACHADO PRÉ-EXISTENTE, MAIOR QUE O DO PORTAL (abaixo), NÃO CONSERTADO: o
// inventário vai como lista de listas (`serializeInventory`: `[[slot, item,
// quantidade], …]`), e o Firestore recusa array dentro de array. Medido em
// 26/09/2026 com o `firebase` 12.7.0 do front, sem rede: `setDoc` com
// `inventory: [[0, 'wooden_pickaxe', 1]]` lança "Nested arrays are not
// supported" (o mesmo vale para a mobília com itens, `s: [[item, n]]`). Pela
// leitura do código, todo save com UM item no inventário falha no RoqueOS. O
// host falso recusa igual; quando o formato for consertado, a marca sai.
describe('o save com item no inventário (achado pré-existente, não consertado)', () => {
  it.fails('um mundo com qualquer item no inventário grava na conta', async () => {
    const host = conta()
    const save = criarSaveDoRoqueCraft(host.progresso)
    const inventario = Array.from({ length: 36 }, () => null)
    inventario[0] = { item: 'wooden_pickaxe', count: 1 }
    await expect(
      save.saveRoqueCraft(buildSavePayload({ ...base, inventory: inventario })),
    ).resolves.toBe(true)
  })

  it('o host diz exatamente o que recusou', async () => {
    const host = conta()
    const save = criarSaveDoRoqueCraft(host.progresso)
    const inventario = Array.from({ length: 36 }, () => null)
    inventario[0] = { item: 'wooden_pickaxe', count: 1 }
    await expect(
      save.saveRoqueCraft(buildSavePayload({ ...base, inventory: inventario })),
    ).rejects.toThrow(/recusou/)
    expect(host.avisosDoHost.join(' ')).toMatch(/inventory\[0\].*array dentro de array/)
    expect(host.progressoGuardado()).toBe(null)
  })
})

describe('RC-02 pela ponte: leitura que falhou não grava por cima', () => {
  it('a conta com mundo de meses e o host fora do ar no boot', async () => {
    const meses = buildSavePayload({ ...base, edits: [0, 0, 5, 21] })
    const host = conta({ salvo: meses, falharLeitura: true })
    const save = criarSaveDoRoqueCraft(host.progresso)
    const carga = await carregarSave({
      disponivel: save.disponivel(),
      ler: () => save.loadRoqueCraft(),
    })
    expect(carga.estado).toBe(CARGA.INDISPONIVEL)
    expect(carga.aviso).toBe('roqueCraft.error.saveIndisponivel')
    // A porta: com a leitura falha, o jogo não grava o mundo novo por cima.
    expect(podeSalvar(carga.estado)).toBe(false)
    expect(host.progressoGuardado()).toEqual(meses)
  })

  it('convidado nem tenta ler: NÃO_TENTOU, e não INDISPONÍVEL', async () => {
    const host = criarHostFalso({ jogoId: 'roquecraft', progresso: { falharLeitura: true } })
    const save = criarSaveDoRoqueCraft(host.progresso)
    const carga = await carregarSave({ disponivel: save.disponivel(), ler: save.loadRoqueCraft })
    expect(carga.estado).toBe(CARGA.NAO_TENTOU)
    expect(pedidos(host, 'carregar')).toEqual([])
  })
})

// ⚠️ O ACHADO DO SAVE (desenho da `salaAoVivo`/`progresso`, 26/09/2026, §2.2),
// NÃO CONSERTADO DE PROPÓSITO: o founder decide quando e como.
//
// `buildSavePayload` grava `outrasDimensoes` como `[[id, [cx, cz, li, id, …]]]`,
// array dentro de array, e o Firestore recusa (medido no desenho com o
// `firebase` 12.7.0 do front: "Nested arrays are not supported"). A travessia
// guarda a dimensão de onde o jogador saiu, então depois do PRIMEIRO portal todo
// autosave cai no `aoFalhar` (só `console.error`) e o mundo para de salvar em
// silêncio, inclusive de volta ao overworld.
//
// O host falso do jogo-sdk recusa array aninhado como o Firestore, e é isso que
// este teste mostra. Ele está marcado como "falha esperada": quando o formato
// for consertado (e o `parseSave` passar a ler os dois), ele passa a passar, o
// Vitest reprova o `it.fails`, e a marca sai junto com o conserto.
describe('o save depois do portal (achado pré-existente, não consertado)', () => {
  function atravessarUmPortal() {
    const edicoes = new Map([['0,0', new Map([[5, 21]])]])
    let dimensao = 'overworld'
    const travessia = criarTravessia({
      jogador: { x: 0.5, y: 64, z: 0.5, vy: 0 },
      mundo: () => ({ isLoaded: () => true, getBlock: () => ID.netherPortalX }),
      semente: () => 1,
      edicoes,
      dimensaoAtual: () => dimensao,
      emSala: () => false,
      resetar: (d) => (dimensao = d),
      pousar: () => {},
      pontoDeRetorno: () => ({ x: 3, y: 70, z: 5 }),
      aoSairDoFim: () => {},
    })
    for (let s = 0; s < ESPERA_NO_PORTAL + 0.3; s += 0.1) travessia.passo(0.1)
    return { dimensao, outras: travessia.paraSave(dimensao) }
  }

  it('o mundo que atravessou o portal leva o overworld junto no payload', () => {
    // O que o jogo MONTA está certo; o que o documento aceita, não.
    const { dimensao, outras } = atravessarUmPortal()
    expect(dimensao).toBe('nether')
    const payload = buildSavePayload({ ...base, dimensionId: dimensao, outrasDimensoes: outras })
    expect(payload.outrasDimensoes).toEqual([['overworld', [0, 0, 5, 21]]])
    expect(Array.isArray(payload.outrasDimensoes[0][1])).toBe(true)
  })

  it.fails('depois do primeiro portal, o mundo continua gravando na conta', async () => {
    const { dimensao, outras } = atravessarUmPortal()
    const host = conta()
    const save = criarSaveDoRoqueCraft(host.progresso)
    const payload = buildSavePayload({ ...base, dimensionId: dimensao, outrasDimensoes: outras })
    // Hoje: o host recusa (array dentro de array), a ponte lança, o autosave só
    // escreve no console, e nada chega à conta.
    await expect(save.saveRoqueCraft(payload)).resolves.toBe(true)
    expect(host.progressoGuardado()?.dimensionId).toBe('nether')
  })
})
