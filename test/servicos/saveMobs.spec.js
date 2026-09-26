import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { buildSavePayload, parseSave } from '../../src/servicos/roqueCraftSave.js'
import { MOB_TYPES, MAX_MOBS, createMob, restaurarMobs } from '../../src/servicos/mobs.js'

/**
 * O CURRAL VAZIO.
 *
 * A mesma auditoria que achou o item no chão (v5) deixou `mobs` na lista de
 * pendências: era o último estado de JOGO que o save não guardava. O sintoma é
 * o mais concreto que existe — você cerca um curral, fecha o app, volta, e o
 * curral está vazio. O terreno voltou, os baús voltaram, a cama voltou, o
 * porco não.
 *
 * ⚠️ ESTE ARQUIVO NÃO TESTA "serializa e desserializa". Testa as quatro
 * decisões que dão pra errar:
 *
 *  1. o hostil vai junto (senão fechar o app vira botão de fuga, já que a vida
 *     do JOGADOR é gravada);
 *  2. a IA NÃO vai junto (é ruído, e um zumbi restaurado no meio de um bote que
 *     não existe mais);
 *  3. vida acima do máximo do tipo é recusada (save adulterado não vira porco
 *     imortal);
 *  4. save antigo carrega, com rebanho vazio, em vez de quebrar.
 */

const mob = (over = {}) => ({
  id: 'm1',
  type: 'cow',
  x: 10.5,
  y: 64.25,
  z: -3.75,
  yaw: 1.23,
  health: 7,
  state: 'wander',
  timer: 4.2,
  targetX: 99,
  targetZ: -99,
  attackCooldown: 0.5,
  ...over,
})

describe('save v6 - o rebanho', () => {
  it('grava e devolve a criatura com tipo, posição, direção e VIDA', () => {
    const p = buildSavePayload({ seed: 1, mobs: [mob()] })
    // ⚠️ PISO, NÃO IGUALDADE. O rebanho entrou na v6 e ganhou campos até a v9;
    // cravar o número fazia este teste reprovar em TODA versão nova do save sem
    // que nada do que ele protege tivesse mudado — aconteceu na v10, que é sobre
    // dimensões e não toca em criatura nenhuma. O que precisa ser verdade é que
    // a versão não ande para trás.
    expect(
      p.version,
      'a versão tem que subir, senão save antigo e novo se confundem',
    ).toBeGreaterThanOrEqual(9)

    const lido = parseSave(p)
    expect(lido.mobs).toHaveLength(1)
    expect(lido.mobs[0]).toMatchObject({ type: 'cow', x: 10.5, y: 64.25, z: -3.75 })
    // ⚠️ A VIDA é o campo que ninguém lembra. Sem ela, a vaca que levou duas
    // machadadas volta inteira e a caçada recomeça do zero a cada recarga.
    expect(lido.mobs[0].health, 'a vida não sobreviveu').toBe(7)
    expect(lido.mobs[0].yaw).toBeCloseTo(1.23, 2)
  })

  it('o HOSTIL vai junto — deslogar não pode ser botão de fuga', () => {
    const p = buildSavePayload({ seed: 1, mobs: [mob({ type: 'zombie', health: 12 })] })
    const lido = parseSave(p)
    // Se o zumbi sumisse, fechar o app com duas vidas seria uma saída grátis:
    // a vida do jogador É gravada, então o combate voltaria desequilibrado.
    expect(lido.mobs).toHaveLength(1)
    expect(lido.mobs[0]).toMatchObject({ type: 'zombie', health: 12 })
  })

  it('a IA fica de fora — o documento não carrega estado que se refaz sozinho', () => {
    const p = buildSavePayload({ seed: 1, mobs: [mob()] })
    const gravado = p.mobs[0]
    for (const campo of ['state', 'timer', 'targetX', 'targetZ', 'attackCooldown', 'id']) {
      expect(Object.keys(gravado), `\`${campo}\` não devia ir pro disco`).not.toContain(campo)
    }
    // E o que volta também não traz: quem monta a criatura de verdade é
    // `createMob`, no componente.
    expect(parseSave(p).mobs[0].state).toBeUndefined()
  })

  it('save v5 (sem o campo) carrega com rebanho vazio em vez de quebrar', () => {
    const antigo = { version: 5, seed: 7 }
    expect(() => parseSave(antigo)).not.toThrow()
    expect(parseSave(antigo).mobs).toEqual([])
  })
})

describe('save v6 - o que NÃO entra', () => {
  it('coordenada não-finita é recusada, mas a vizinha boa passa (prova de vida)', () => {
    const p = buildSavePayload({
      seed: 1,
      mobs: [mob({ x: NaN }), mob({ type: 'pig', y: Infinity }), mob({ type: 'sheep' })],
    })
    expect(p.mobs).toHaveLength(1)
    expect(p.mobs[0].t).toBe('sheep')
  })

  it('tipo desconhecido é recusado na ida E na volta', () => {
    // ⚠️ O EXEMPLO ERA 'dragao', E ELE EXISTE DESDE 18/09/2026 (Goal 21, 5.3).
    // O que se protege é tipo que ninguém registrou.
    expect(buildSavePayload({ seed: 1, mobs: [mob({ type: 'grifo' })] }).mobs).toEqual([])
    expect(
      parseSave({ version: 6, seed: 1, mobs: [{ t: 'grifo', x: 0, y: 0, z: 0 }] }).mobs,
    ).toEqual([])
  })

  it('criatura morta não é gravada — ressuscitar no boot seria pior que sumir', () => {
    const p = buildSavePayload({ seed: 1, mobs: [mob({ health: 0 }), mob({ type: 'pig' })] })
    expect(p.mobs).toHaveLength(1)
    expect(p.mobs[0].t).toBe('pig')
  })

  it('o boneco de OUTRO jogador não é gravado como bicho do mundo', () => {
    // `unpackMobs` marca `remote: true` no que chega pela rede. Gravar isso
    // faria o convidado levar pra casa o rebanho do anfitrião.
    const p = buildSavePayload({ seed: 1, mobs: [mob({ remote: true }), mob({ type: 'pig' })] })
    expect(p.mobs).toHaveLength(1)
    expect(p.mobs[0].t).toBe('pig')
  })

  it('vida acima do máximo do tipo é cortada — save adulterado não vira porco imortal', () => {
    const lido = parseSave({ version: 6, seed: 1, mobs: [{ t: 'pig', x: 0, y: 0, z: 0, v: 400 }] })
    expect(lido.mobs[0].health).toBe(MOB_TYPES.pig.health)
  })

  it('vida ausente ou absurda vira a vida cheia do tipo, nunca zero', () => {
    const lido = parseSave({
      version: 6,
      seed: 1,
      mobs: [
        { t: 'cow', x: 0, y: 0, z: 0 },
        { t: 'cow', x: 1, y: 0, z: 0, v: -5 },
      ],
    })
    expect(lido.mobs[0].health).toBe(MOB_TYPES.cow.health)
    // Zero de vida restaurado seria uma vaca que morre sozinha no primeiro
    // quadro, e o jogador veria o rebanho evaporar sem motivo.
    expect(lido.mobs[1].health).toBeGreaterThanOrEqual(1)
  })

  it('o teto é o mesmo da simulação: nada de gravar mais bicho do que o jogo roda', () => {
    const bando = Array.from({ length: MAX_MOBS + 20 }, (_, i) => mob({ x: i }))
    expect(buildSavePayload({ seed: 1, mobs: bando }).mobs).toHaveLength(MAX_MOBS)
    // E na volta também, senão um documento antigo inflado repovoaria o mundo
    // com o dobro do limite.
    const inflado = Array.from({ length: MAX_MOBS + 20 }, (_, i) => ({
      t: 'cow',
      x: i,
      y: 0,
      z: 0,
      v: 10,
    }))
    expect(parseSave({ version: 6, seed: 1, mobs: inflado }).mobs).toHaveLength(MAX_MOBS)
  })

  it('lista ausente, nula ou de lixo vira lista vazia em vez de estourar', () => {
    expect(buildSavePayload({ seed: 1 }).mobs).toEqual([])
    expect(buildSavePayload({ seed: 1, mobs: null }).mobs).toEqual([])
    expect(parseSave({ version: 6, seed: 1, mobs: 'nao sou lista' }).mobs).toEqual([])
    expect(parseSave({ version: 6, seed: 1, mobs: [null, 42, {}] }).mobs).toEqual([])
  })
})

describe('a ida e a volta fecham com a criatura REAL do jogo', () => {
  it('uma criatura criada por `createMob` sobrevive à volta inteira', () => {
    // Prova de vida do formato: o objeto testado acima é escrito à mão. Este é
    // o que o jogo produz de fato — se `createMob` ganhar um campo obrigatório,
    // é aqui que aparece.
    const original = createMob('sheep', 4.5, 70, -8.5, 3)
    original.health = 5
    original.yaw = -2.1

    const lido = parseSave(buildSavePayload({ seed: 1, mobs: [original] }))
    expect(lido.mobs[0]).toMatchObject({ type: 'sheep', x: 4.5, y: 70, z: -8.5, health: 5 })

    // E o que volta é aceito por `createMob` de novo: é assim que o boot
    // remonta o rebanho.
    const remontado = createMob(
      lido.mobs[0].type,
      lido.mobs[0].x,
      lido.mobs[0].y,
      lido.mobs[0].z,
      1,
    )
    expect(remontado).not.toBeNull()
    expect(typeof remontado.rnd, 'sem `rnd` o primeiro `stepMob` quebra').toBe('function')
  })

  it('todo tipo do jogo faz a volta — nenhum fica de fora por descuido', () => {
    const todos = Object.keys(MOB_TYPES).map((t, i) => mob({ type: t, x: i, health: 1 }))
    const lido = parseSave(buildSavePayload({ seed: 1, mobs: todos }))
    expect(lido.mobs.map((m) => m.type)).toEqual(Object.keys(MOB_TYPES))
  })
})

/**
 * ⚠️ O DEFEITO QUE UM TESTE DE SERIALIZAÇÃO NÃO PEGA: gravar e nunca ler de
 * volta.
 *
 * Tudo acima passaria com o componente escrevendo `mobs` no documento e o boot
 * ignorando o campo. O curral continuaria vazio, e a suíte continuaria verde —
 * o instrumento concordando com o defeito. Foi assim com a cama (v4): o ponto
 * ia pro disco e ninguém lia na volta.
 *
 * Lê o componente como TEXTO de propósito: um guard que importa o que fiscaliza
 * morre junto com o arquivo quebrado e para de fiscalizar.
 */
describe('o componente escreve E lê o rebanho', () => {
  const COMPONENTE = resolve(__dirname, '../../src/JogoRoqueCraft.vue')
  const ENTIDADES = resolve(__dirname, '../../src/composables/useRoqueCraftEntidades.js')
  const fonte = readFileSync(COMPONENTE, 'utf8')
  // ⚠️ O GUARD SEGUIU A CASA. Em 26/08 a lista de criaturas e a restauração
  // dela foram pro composable `useRoqueCraftEntidades`. O componente continua
  // dono do PAYLOAD (é ele que conversa com o save), então cada metade do
  // guard olha o arquivo onde a sua metade mora.
  const entidades = readFileSync(ENTIDADES, 'utf8')

  it('o payload do autosave leva `mobs`', () => {
    const corpo = fonte.slice(
      fonte.indexOf('function montarPayloadDeSave'),
      fonte.indexOf('const persistencia = useRoqueCraftPersistencia'),
    )
    expect(corpo, 'a função existe').not.toHaveLength(0)
    expect(corpo).toMatch(/mobs: entidades\.mobs\(\)/)
  })

  it('o carregamento chama `restaurarMobs` — a política não voltou pra dentro do laço', () => {
    // Enquanto o laço morava solto no componente, a única fiscalização possível
    // era procurar `bicho.health = m.health` como texto, que não sabe dizer se
    // o laço chega a rodar. A regra saiu pro serviço; o guard foi ATRÁS dela.
    expect(entidades).toMatch(/restaurarMobs\(saved\?\.mobs/)
    expect(entidades).toContain('restaurarMobs,')
    // E o componente entrega o save inteiro pro dono das listas, em vez de
    // remontar o rebanho por fora.
    expect(fonte).toMatch(/entidades\.restaurarDoSave\(saved\)/)
  })

  it('e ninguém remonta rebanho por conta própria em outro canto', () => {
    // Uma segunda cópia da política é como a cama e o nascimento quebraram:
    // dois lugares chamando a função certa com argumentos diferentes.
    for (const texto of [fonte, entidades]) {
      const laçosCrus = texto.match(/for \(const \w+ of saved\?\.mobs/g) || []
      expect(laçosCrus).toHaveLength(0)
    }
  })
})

describe('restaurarMobs — a regra, rodando de verdade', () => {
  const salvo = (over = {}) => ({ type: 'cow', x: 1, y: 64, z: 2, yaw: 0.5, health: 6, ...over })

  it('devolve criaturas COMPLETAS, prontas pro `stepMob`', () => {
    const [bicho] = restaurarMobs([salvo()], createMob)
    expect(bicho.type).toBe('cow')
    expect(bicho.health).toBe(6)
    expect(bicho.yaw).toBeCloseTo(0.5, 3)
    // Os campos que o save NÃO tem e sem os quais o primeiro quadro quebra.
    expect(typeof bicho.rnd).toBe('function')
    expect(bicho.id).toBeTruthy()
    expect(bicho.state).toBe('idle')
  })

  it('cada criatura recebe um índice diferente — rebanho não anda em fila', () => {
    const vistos = []
    restaurarMobs([salvo(), salvo({ x: 2 }), salvo({ x: 3 })], (t, x, y, z, i) => {
      vistos.push(i)
      return createMob(t, x, y, z, i + 1)
    })
    expect(vistos).toEqual([0, 1, 2])
  })

  it('o índice conta o que ENTROU, não o que foi lido', () => {
    // Senão um tipo recusado no meio abriria um buraco na sequência, e duas
    // criaturas poderiam acabar com a mesma semente.
    const vistos = []
    restaurarMobs([salvo(), salvo({ type: 'grifo' }), salvo({ x: 9 })], (t, x, y, z, i) => {
      vistos.push(i)
      return createMob(t, x, y, z, 1)
    })
    expect(vistos).toEqual([0, 1])
  })

  it('vida acima do máximo do tipo é cortada, e a de baixo é respeitada', () => {
    expect(restaurarMobs([salvo({ health: 999 })], createMob)[0].health).toBe(MOB_TYPES.cow.health)
    expect(restaurarMobs([salvo({ health: 2 })], createMob)[0].health).toBe(2)
  })

  it('vida ausente vira a vida cheia do tipo, nunca zero', () => {
    const [bicho] = restaurarMobs([salvo({ health: undefined })], createMob)
    expect(bicho.health).toBe(MOB_TYPES.cow.health)
  })

  it('o que `criar` recusa (coordenada NaN) some sem derrubar o resto', () => {
    const lista = restaurarMobs([salvo({ x: NaN }), salvo({ type: 'pig' })], createMob)
    expect(lista).toHaveLength(1)
    expect(lista[0].type).toBe('pig')
  })

  it('lista vazia, nula ou de lixo devolve rebanho vazio', () => {
    expect(restaurarMobs(undefined, createMob)).toEqual([])
    expect(restaurarMobs(null, createMob)).toEqual([])
    expect(restaurarMobs('nao sou lista', createMob)).toEqual([])
    expect(restaurarMobs([null, 42, {}], createMob)).toEqual([])
  })

  it('fecha o círculo: gravar o rebanho vivo e restaurá-lo devolve o mesmo rebanho', () => {
    // Prova de vida do conjunto: sai da criatura REAL, passa pelo documento, e
    // volta a ser criatura real. É o caminho que o jogador faz ao fechar o app.
    const vivos = [createMob('pig', 3.5, 64, 1.5, 1), createMob('zombie', -2, 70, 8, 2)]
    vivos[0].health = 4
    vivos[1].yaw = 2.5

    const voltaram = restaurarMobs(
      parseSave(buildSavePayload({ seed: 1, mobs: vivos })).mobs,
      createMob,
    )

    expect(voltaram.map((m) => m.type)).toEqual(['pig', 'zombie'])
    expect(voltaram[0].health, 'o porco ferido voltou curado').toBe(4)
    expect(voltaram[1].yaw).toBeCloseTo(2.5, 1)
    expect(voltaram[0].x).toBeCloseTo(3.5, 2)
  })
})
