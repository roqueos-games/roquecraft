import { describe, it, expect } from 'vitest'
import { ref, reactive } from 'vue'
import {
  useRoqueCraftEntidades,
  VIDA_DO_ITEM,
  ALCANCE_DA_COLETA,
  CARENCIA_DA_COLETA,
  CARENCIA_DE_QUEM_LARGA,
  PASSO_DO_NASCIMENTO,
} from '../../src/composables/useRoqueCraftEntidades.js'
import { AMIZADE_INICIAL } from '../../src/servicos/npc.js'
import { BIOMAS_DA_ALDEIA, CELULA, LADO_DA_CASA, planoDaAldeia } from '../../src/servicos/aldeia.js'
import { MATERIAIS } from '../../src/servicos/vilaCasa.js'
import { hash3 } from '../../src/servicos/noise.js'
import {
  BIOME_NAMES,
  biomeAt,
  createNoiseContext,
  solidTopAt,
  terrainHeight,
} from '../../src/servicos/worldgen.js'
import { toChunkCoord, SEA_LEVEL } from '../../src/servicos/constants.js'
import { createInventory, addItem } from '../../src/servicos/inventory.js'
import { createSurvivalState } from '../../src/servicos/survival.js'
import { BLOCK_BY_KEY } from '../../src/servicos/blocks.js'
import { idDaPorta } from '../../src/servicos/porta.js'
import { MOB_TYPES, MAX_MOBS, createMob } from '../../src/servicos/mobs.js'

/** Uma criatura com todos os campos que `stepMob` espera, sem depender da IA. */
const criarCriaturaCrua = (tipo) => createMob(tipo, 0, 65, 0, 1)

// ⚠️ ESTE ARQUIVO EXISTE PORQUE AS LISTAS SAIRAM JUNTO COM A LOGICA.
//
// Enquanto `mobs`, `drops` e `flechas` moravam no componente, nada disto podia
// ser medido sem montar o jogo inteiro - e por isso nada disto era medido. O
// que se prova aqui sao regras que ja custaram defeito de verdade:
//
//  - coleta PARCIAL (com a mochila cheia, passar por cima de 32 apagava 30)
//  - o item cai ate o chao de VERDADE (sobre neve ele parava um bloco no ar)
//  - o creeper sai da lista ANTES de estourar (senao ele dropa a propria polvora)
//  - o teto de hostis e SEPARADO do teto total (senao criar gado desliga a noite)
//  - a procriacao roda uma vez por QUADRO, nao por criatura
//  - o item volta do save com a IDADE que tinha
//  - convidado de multijogador NAO simula

/** Mundo plano: solido ate `topo`, ar acima. `solidAt` devolve ALTURA, nao bool. */
function mundoPlano(topo = 64, over = {}) {
  return {
    solidAt: (x, y) => (y <= topo ? 1 : 0),
    liquidAt: () => 0,
    opaqueAt: (x, y) => y <= topo,
    getBlock: (x, y) => (y <= topo ? BLOCK_BY_KEY.stone.id : 0),
    luzCombinada: () => 15,
    skyExposed: () => true,
    surfaceY: () => topo,
    biomeAt: () => 0,
    ...over,
  }
}

function montar(over = {}) {
  const editados = []
  const estilhacos = []
  const ondas = []
  let world = over.world || mundoPlano()
  const player = { x: 0, y: 65, z: 0, vx: 0, vy: 0, vz: 0 }
  const survival = reactive(createSurvivalState())
  const inventario = ref(createInventory())
  const danos = []
  const efeitos = []
  const quedas = []
  let guardou = 0
  const ctx = {
    mundo: {
      vivo: () => world,
      motor: () => ({ ondularAgua: (...a) => ondas.push(a) }),
      particulas: () => ({ spawnBreak: (...a) => estilhacos.push(a) }),
      editar: (x, y, z, id) => editados.push([x, y, z, id]),
    },
    jogador: {
      corpo: player,
      survival,
      inventario,
      modo: () => over.modo?.() ?? 'survival',
      naMao: () => over.naMao?.() ?? null,
      // Devolve o resultado como o corpo devolve: `{ aparado, aplicado }`. É
      // por ele que o empurrão decide vir ou não (a guarda do escudo).
      machucar: (n, f, de) => {
        danos.push([n, f, de])
        return over.aparaTudo ? { aparado: true, aplicado: 0 } : { aparado: false, aplicado: n }
      },
      tomarEfeito: (...a) => efeitos.push(a),
      instante: () => 6000,
      gastarFerramenta: over.gastarFerramenta,
    },
    partida: {
      semente: () => 42,
      simulando: () => over.simulando?.() ?? true,
      guardar: () => guardou++,
      dragaoDeveExistir: () => over.dragaoDeveExistir?.() ?? false,
      dragaoCaiu: () => quedas.push(1),
    },
  }
  return {
    e: useRoqueCraftEntidades(ctx),
    player,
    survival,
    inventario,
    editados,
    estilhacos,
    ondas,
    danos,
    efeitos,
    quedas,
    guardou: () => guardou,
    trocarMundo: (w) => {
      world = w
    },
  }
}

describe('useRoqueCraftEntidades', () => {
  // ── Itens no chão ────────────────────────────────────────────────────────
  it('soltarItem escreve os nove campos, num lugar só', () => {
    const { e } = montar()
    e.soltarItem('dirt', 3, 1, 2, 3, 0x112233)
    const d = e.drops()[0]
    expect(d).toMatchObject({ item: 'dirt', count: 3, x: 1, y: 2, z: 3, color: 0x112233, age: 0 })
    // `phase` é o que faz o item balançar. Três chamadores esqueciam dele.
    expect(typeof d.phase).toBe('number')
    expect(d.id).toMatch(/^d\d+$/)
    // ids não se repetem, senão a camada de entidades reusa a malha errada
    e.soltarItem('stone', 1, 0, 0, 0)
    expect(e.drops()[1].id).not.toBe(d.id)
  })

  it('extras carregam a durabilidade da ferramenta guardada no baú', () => {
    const { e } = montar()
    e.soltarItem('pick', 1, 0, 0, 0, 0, { dur: 17 })
    expect(e.drops()[0].dur, 'largar picareta usada como nova fabrica durabilidade').toBe(17)
  })

  it('o item cai até o chão de VERDADE, não até o topo da célula', () => {
    // `solidAt` devolve ALTURA de apoio. Lido como booleano, o item parava
    // assim que a célula abaixo "era sólida" - sobre meia camada isso é meio
    // bloco no ar. Aqui o topo do bloco 64 é uma MEIA altura (0.5).
    const { e } = montar({ world: mundoPlano(64, { solidAt: (x, y) => (y <= 64 ? 0.5 : 0) }) })
    // LONGE do jogador: perto, ele seria coletado antes de terminar de cair, e
    // o teste mediria a coleta achando que media a queda.
    e.soltarItem('dirt', 1, 100.5, 70, 100.5)
    for (let i = 0; i < 200; i++) e.passoDosItens(1 / 60)
    // apoio = 64 + 0.5 = 64.5; o item repousa 0.1 acima
    expect(e.drops()[0].y).toBeCloseTo(64.6, 2)
  })

  it('coleta PARCIAL: leva o que cabe e DEIXA o resto no chão', () => {
    // Com a mochila cheia, passar por cima de uma pilha de 32 apagava 30 blocos
    // em silêncio. O item tem que sobreviver com o resto.
    const { e, inventario, player } = montar()
    // enche tudo menos duas unidades de um slot
    const inv = inventario.value
    for (let i = 0; i < inv.length; i++) inv[i] = { item: 'stone', count: 64 }
    inv[0] = { item: 'dirt', count: 62 }
    e.soltarItem('dirt', 32, player.x, player.y, player.z)
    e.passoDosItens(CARENCIA_DA_COLETA + 0.1)
    expect(e.drops().length, 'o item sumiu inteiro').toBe(1)
    expect(e.drops()[0].count, 'a sobra evaporou').toBe(30)
    expect(inventario.value[0].count).toBe(64)
  })

  it('⚠️ a coleta CARREGA o que o drop carrega: durabilidade, encanto e poção', () => {
    // O espólio da morte guardava `dur`; a coleta chamava `addItem` sem ele e a
    // picareta em 3 de 1562 voltava NOVA pra mochila.
    const { e, player, inventario } = montar()
    e.soltarItem('diamond_pickaxe', 1, player.x, player.y, player.z, 0, {
      dur: 3,
      enc: { eficiencia: 2 },
    })
    e.soltarItem('pocao_cura', 1, player.x, player.y, player.z, 0, { pocao: { splash: true } })
    e.passoDosItens(CARENCIA_DA_COLETA + 0.1)
    expect(e.drops()).toEqual([])
    const pic = inventario.value.find((s) => s?.item === 'diamond_pickaxe')
    expect(pic.dur, 'a picareta voltou nova').toBe(3)
    expect(pic.enc).toEqual({ eficiencia: 2 })
    expect(inventario.value.find((s) => s?.item === 'pocao_cura').pocao).toEqual({ splash: true })
  })

  it('coleta inteira some com o item e avisa o save', () => {
    const { e, player, guardou } = montar()
    e.soltarItem('dirt', 5, player.x, player.y, player.z)
    e.passoDosItens(CARENCIA_DA_COLETA + 0.1)
    expect(e.drops()).toEqual([])
    expect(guardou()).toBeGreaterThan(0)
  })

  it('a carência impede o item de voltar pra mão no mesmo quadro', () => {
    const { e, player } = montar()
    e.soltarItem('dirt', 1, player.x, player.y, player.z)
    e.passoDosItens(CARENCIA_DA_COLETA - 0.05)
    expect(e.drops().length, 'largou e coletou de volta na hora').toBe(1)
  })

  it('⚠️ o que o jogador LARGA espera mais antes de voltar pra mão', () => {
    // Medido pela sonda do toque (18/09): com 0,4 s e o item a 1,1 bloco do
    // peito, apertar Q parado devolvia o item antes de o jogador ver.
    const { e, player } = montar()
    e.largarAFrente('dirt', {
      origin: { x: player.x, y: player.y + 0.3, z: player.z },
      dir: { x: 0, y: 0, z: 0 },
    })
    e.passoDosItens(CARENCIA_DA_COLETA + 0.1)
    expect(e.drops().length, 'a carência curta valeu para quem largou de propósito').toBe(1)
    for (let i = 0; i < 4; i++) e.passoDosItens(CARENCIA_DE_QUEM_LARGA / 3)
    expect(e.drops().length, 'passada a carência longa, o item volta a ser coletável').toBe(0)
  })

  it('item longe não é coletado', () => {
    const { e, player } = montar()
    e.soltarItem('dirt', 1, player.x + ALCANCE_DA_COLETA + 2, player.y, player.z)
    e.passoDosItens(CARENCIA_DA_COLETA + 0.1)
    expect(e.drops().length).toBe(1)
  })

  it('item velho some', () => {
    const { e } = montar()
    e.soltarItem('dirt', 1, 100, 65, 100)
    e.passoDosItens(VIDA_DO_ITEM + 1)
    expect(e.drops()).toEqual([])
  })

  // ── Save ─────────────────────────────────────────────────────────────────
  it('o item volta do save com a IDADE que tinha', () => {
    // Sem restaurar `age`, recarregar daria vida nova a tudo que estava quase
    // sumindo, e o chão de uma base antiga viraria depósito permanente.
    const { e } = montar()
    e.restaurarDoSave({ drops: [{ item: 'dirt', count: 1, x: 5, y: 65, z: 5, age: 239 }] })
    expect(e.drops()[0].age, 'o item rejuvenesceu no carregamento').toBe(239)
    e.passoDosItens(2)
    expect(e.drops(), 'com a idade certa ele tinha que sumir agora').toEqual([])
  })

  it('flecha no ar NÃO volta do save', () => {
    const { e } = montar()
    e.restaurarDoSave({ mobs: [], drops: [] })
    expect(e.flechas()).toEqual([])
  })

  // ── Criaturas ────────────────────────────────────────────────────────────
  it('convidado de multijogador NÃO simula criatura nem flecha', () => {
    const { e } = montar({ simulando: () => false })
    e.definirMobs([{ id: 'm1', type: 'zombie', x: 0, y: 65, z: 0, health: 10, state: 'chase' }])
    const antes = JSON.stringify(e.mobs())
    e.passoDasCriaturas(1, 1.62)
    expect(JSON.stringify(e.mobs()), 'o convidado rodou a IA e divergiu do anfitrião').toBe(antes)
  })

  // ⚠️ O ESCUDO QUE APARAVA E NÃO SEGURAVA (19/09/2026).
  //
  // A guarda cortava o dano e o `empurrar` vinha logo abaixo, incondicional: o
  // escudo parava a pancada do zumbi e o jogador saía voando do mesmo jeito.
  // Quem empurra é este módulo, então é aqui que a aparada tem que ser lida.
  // ⚠️ `criarCriaturaCrua` e NÃO um literal: sem `attackCooldown` o campo fica
  // `undefined`, e `undefined <= 0` é FALSO — o zumbi encosta e nunca bate. O
  // teste passaria por omissão se a sanidade abaixo não existisse.
  const zumbiColado = (e) =>
    e.definirMobs([{ ...criarCriaturaCrua('zombie'), id: 'm1', x: 0.6, state: 'chase' }])
  /**
   * Roda a IA até o zumbi bater, e devolve o tranco que sobrou no jogador.
   *
   * ⚠️ `kx`/`kz`, NÃO `vx`/`vz`: `empurrar` escreve num campo próprio de
   * propósito, porque `stepPlayer` reescreve `vx` a cada quadro com o input e
   * o tranco duraria zero quadros. Medir `vx` aqui daria zero sempre — os dois
   * lados do teste passariam pelo motivo errado.
   */
  const ateBater = (e, player, danos) => {
    for (let i = 0; i < 80 && !danos.length; i++) e.passoDasCriaturas(0.05, 1.62)
    return Math.hypot(player.kx || 0, player.kz || 0)
  }

  it('golpe APARADO não empurra o jogador; o mesmo golpe sem guarda empurra', () => {
    const aparado = montar({ aparaTudo: true })
    zumbiColado(aparado.e)
    const vAparado = ateBater(aparado.e, aparado.player, aparado.danos)
    expect(aparado.danos.length, 'o zumbi nem bateu: o teste abaixo não valeria').toBeGreaterThan(0)
    expect(vAparado, 'aparado e ainda assim empurrado').toBe(0)

    const semGuarda = montar()
    zumbiColado(semGuarda.e)
    const vSemGuarda = ateBater(semGuarda.e, semGuarda.player, semGuarda.danos)
    expect(semGuarda.danos.length).toBeGreaterThan(0)
    expect(vSemGuarda, 'sem guarda o tranco tem que vir').toBeGreaterThan(0)
  })

  it('a FLECHA aparada não empurra; a mesma flecha sem guarda empurra', () => {
    // O escudo parava o dano da flecha e o tranco passava inteiro: o jogador
    // via a flecha bater no escudo e voava mesmo assim.
    const tiro = (over) => {
      const m = montar(over)
      m.e.atirarFlecha({ id: 's1', type: 'skeleton', x: 0, y: 66, z: 5 })
      for (let i = 0; i < 400 && m.e.flechas().length; i++) m.e.passoDasFlechas(1 / 60)
      expect(m.danos.length, 'a flecha nunca acertou: o teste abaixo não valeria').toBeGreaterThan(
        0,
      )
      return Math.hypot(m.player.kx || 0, m.player.kz || 0)
    }
    expect(tiro({ aparaTudo: true }), 'aparou a flecha e voou junto').toBe(0)
    expect(tiro(), 'sem guarda a flecha tem que trancar').toBeGreaterThan(0)
  })

  it('a EXPLOSÃO aparada não empurra; a mesma explosão sem guarda empurra', () => {
    const estouro = (over) => {
      const m = montar(over)
      m.e.explodir(m.player.x + 2, m.player.y, m.player.z, 3, 1.62)
      expect(m.danos.length, 'o estouro não machucou: o teste abaixo não valeria').toBeGreaterThan(
        0,
      )
      return Math.hypot(m.player.kx || 0, m.player.kz || 0)
    }
    expect(estouro({ aparaTudo: true }), 'aparou o estouro e voou junto').toBe(0)
    expect(estouro(), 'sem guarda o estouro tem que trancar').toBeGreaterThan(0)
  })

  it('o creeper SAI DA LISTA antes de estourar', () => {
    // Se ele continuasse dentro, a própria explosão o acharia no laço de dano,
    // e o `spawnDropsFrom` entregaria a pólvora de quem estourou - que é
    // justamente o que o original não dá.
    const { e, editados, player } = montar()
    // Colado no jogador: o pavio acende (`dist < range`) e queima até o fim.
    e.definirMobs([
      {
        ...criarCriaturaCrua('creeper'),
        id: 'c1',
        x: player.x + 1,
        y: player.y,
        z: player.z,
        health: 20,
      },
    ])
    const pavio = MOB_TYPES.creeper.explode.pavio
    for (let i = 0; i < Math.ceil(pavio / 0.05) + 20 && e.mobs().length; i++)
      e.passoDasCriaturas(0.05, 1.62)

    // ⚠️ SEM ESTA LINHA O TESTE PASSARIA À TOA: se o creeper nunca estourasse,
    // "não dropou pólvora" seria verdade por omissão.
    expect(e.mobs().length, 'o creeper nunca estourou; o teste abaixo não vale').toBe(0)
    expect(editados.length, 'estourou sem abrir buraco nenhum').toBeGreaterThan(0)
    expect(
      e.drops().some((d) => d.item === 'gunpowder'),
      'o creeper que estourou entregou a própria pólvora',
    ).toBe(false)
  })

  // ⚠️ `mobs.filter((x) => x !== m)` sobrevivia a `===`, e a troca não tira UM
  // bicho: ela apaga TODOS MENOS ELE. Um golpe no porco esvaziaria o mundo e
  // deixaria só o porco. `remover` é chamado pelo golpe do jogador e pelo
  // golpe que chega da rede, então o estrago seria em multijogador também.
  it('remover tira só a criatura pedida, e deixa as outras', () => {
    const { e } = montar()
    const bicho = (id, type = 'pig') => ({ ...criarCriaturaCrua(type), id, health: 10 })
    const porco = bicho('p1')
    e.definirMobs([porco, bicho('v1', 'cow'), bicho('g1', 'chicken')])

    e.remover(porco)
    expect(e.mobs().map((m) => m.id)).toEqual(['v1', 'g1'])

    e.remover({ id: 'nao-existe' }) // objeto que não está na lista
    expect(e.mobs().map((m) => m.id)).toEqual(['v1', 'g1'])
  })

  it('o teto de hostis é SEPARADO do teto total', () => {
    // Com um teto só, um curral de vinte vacas ocupava as vagas e a noite
    // parava de nascer bicho: criar gado "resolveria" o perigo.
    const { e } = montar()
    const gado = []
    for (let i = 0; i < MAX_MOBS - 1; i++)
      gado.push({ id: `p${i}`, type: 'pig', x: i, y: 65, z: 0, health: 10, state: 'idle' })
    e.definirMobs(gado)
    e.passoDasCriaturas(10, 1.62)
    // Não pode ter estourado o teto total.
    expect(e.mobs().length).toBeLessThanOrEqual(MAX_MOBS)
  })

  it('a procriação roda uma vez por QUADRO, não por criatura', () => {
    // Dentro do laço das criaturas, um curral com oito vacas apaixonadas
    // geraria oito filhotes no MESMO quadro.
    const { e } = montar()
    const casais = []
    for (let i = 0; i < 8; i++) {
      const c = createMob('cow', i * 0.2, 65, 0, i)
      c.amor = 10
      casais.push(c)
    }
    e.definirMobs(casais)
    const antes = e.mobs().length
    e.passoDasCriaturas(1 / 60, 1.62)
    const nascidos = e.mobs().length - antes

    // ⚠️ SEM ESTA LINHA O TESTE SERIA VAZIO: se nenhum filhote nascesse,
    // "no maximo um" seria verdade por omissao. Quatro casais apaixonados TEM
    // que render exatamente um filhote neste quadro.
    expect(nascidos, 'nenhum filhote nasceu; o limite abaixo nao vale nada').toBe(1)
    expect(e.mobs().filter((m) => m.bebe > 0).length).toBe(1)
  })

  it('sem mundo, nenhum passo explode', () => {
    const { e } = montar({ world: null })
    e.trocarMundo?.(null)
    expect(() => e.passoDosItens(1)).not.toThrow()
    expect(() => e.passoDasFlechas(1)).not.toThrow()
    expect(() => e.passoDasCriaturas(1, 1.62)).not.toThrow()
  })

  // ── Explosão ─────────────────────────────────────────────────────────────
  it('o estouro tira blocos por `editar`, o MESMO caminho de quebrar à mão', () => {
    // Escrever direto no mundo seria mais rápido e deixaria o buraco fora do
    // save, fora da rede e sem acordar a areia em volta.
    const { e, editados, estilhacos, ondas } = montar()
    e.explodir(0, 65, 0, 3, 1.62)
    expect(editados.length, 'o estouro não passou pelo caminho de edição').toBeGreaterThan(0)
    expect(editados.every(([, , , id]) => id === 0)).toBe(true)
    // Estilhaço só nos primeiros: sessenta malhas de uma vez engasgam o celular.
    expect(estilhacos.length).toBeLessThanOrEqual(8)
    expect(ondas.length).toBe(1)
  })

  it('o estouro machuca o jogador perto e poupa o longe', () => {
    const perto = montar()
    perto.e.explodir(perto.player.x, perto.player.y, perto.player.z, 3, 1.62)
    expect(perto.danos.length, 'o estouro no pé não machucou').toBeGreaterThan(0)
    expect(perto.danos[0][1]).toBe('explosion')
    // A ORIGEM vai junto: é o que deixa a guarda saber se o estouro veio pela frente.
    expect(perto.danos[0][2]).toEqual({ x: perto.player.x, z: perto.player.z })

    const longe = montar()
    longe.e.explodir(500, 65, 500, 3, 1.62)
    expect(longe.danos, 'machucou de quinhentos blocos').toEqual([])
  })

  // ── Listas ───────────────────────────────────────────────────────────────
  it('limpar esvazia as três, e o getter enxerga a lista nova', () => {
    const { e } = montar()
    e.soltarItem('dirt', 1, 0, 0, 0)
    e.definirMobs([{ id: 'm', type: 'pig', x: 0, y: 65, z: 0, health: 1 }])
    e.limpar()
    expect([e.mobs(), e.drops(), e.flechas()]).toEqual([[], [], []])
  })

  it('removerHostis tira só o que é hostil', () => {
    const { e } = montar()
    e.definirMobs([
      { id: 'z', type: 'zombie', x: 0, y: 65, z: 0, health: 10 },
      { id: 'p', type: 'pig', x: 1, y: 65, z: 0, health: 10 },
    ])
    e.removerHostis()
    expect(e.mobs().map((m) => m.id)).toEqual(['p'])
    expect(MOB_TYPES.zombie.hostile).toBe(true)
  })

  it('spawnDropsFrom devolve o que a criatura larga e dá xp em sobrevivência', () => {
    const { e, survival } = montar()
    const xpAntes = survival.xp
    e.spawnDropsFrom({ id: 'p', type: 'pig', x: 0, y: 65, z: 0, health: 0 })
    expect(e.drops().length).toBeGreaterThan(0)
    expect(survival.xp).toBeGreaterThan(xpAntes)
  })

  it('no criativo, matar não dá xp', () => {
    const { e, survival } = montar({ modo: () => 'creative' })
    const xpAntes = survival.xp
    e.spawnDropsFrom({ id: 'p', type: 'pig', x: 0, y: 65, z: 0, health: 0 })
    expect(survival.xp, 'o criativo virou farm de xp').toBe(xpAntes)
  })

  it('a flecha VOA no criativo, mas não machuca', () => {
    // Parar de simular no criativo economizaria nada e esconderia o defeito:
    // quem testa o esqueleto no criativo veria o arco disparar e nada sair.
    const { e, danos } = montar({ modo: () => 'creative' })
    e.atirarFlecha({ id: 's1', type: 'skeleton', x: 0, y: 66, z: 5 })
    expect(e.flechas().length).toBe(1)
    for (let i = 0; i < 200 && e.flechas().length; i++) e.passoDasFlechas(1 / 60)
    expect(danos, 'a flecha machucou no criativo').toEqual([])
  })

  it('⚠️ o arco: armar exige flecha, soltar gasta UMA e o arco, e a flecha acerta a criatura', () => {
    const gastos = []
    const { e, inventario } = montar({ gastarFerramenta: () => gastos.push(1) })
    // Sem flecha, nem arma.
    expect(e.armarArco()).toBe(false)
    addItem(inventario.value, 'arrow', 3)
    expect(e.armarArco()).toBe(true)
    expect(e.arcoArmado()).toBe(true)
    // Cancelar (foco perdido) não gasta nada.
    expect(e.soltarArco(null)).toBeNull()
    expect(e.arcoArmado()).toBe(false)
    expect(inventario.value.find((s) => s?.item === 'arrow').count).toBe(3)
    // Armar, esperar a carga, soltar para −Z: uma flecha a menos, o arco gasto.
    e.armarArco()
    const t0 = performance.now()
    while (performance.now() - t0 < 120) {
      /* segura ~0,12 s: acima da carga mínima */
    }
    const f = e.soltarArco({ x: 0, y: 0, z: -1 })
    expect(f).toBeTruthy()
    expect(f.dono).toBe('jogador')
    expect(inventario.value.find((s) => s?.item === 'arrow').count).toBe(2)
    expect(gastos).toHaveLength(1)
    expect(e.flechas()).toHaveLength(1)
    // Um zumbi a 3 blocos na frente: a flecha chega nele e machuca, e some.
    const z = createMob('zombie', 0, 65, -3, 1)
    e.definirMobs([z])
    const vida = z.health
    for (let i = 0; i < 60 && e.flechas().length; i++) e.passoDasFlechas(1 / 60)
    expect(z.health, 'a flecha do jogador não machucou a criatura').toBeLessThan(vida)
    expect(e.flechas()).toHaveLength(0)
  })

  it('⚠️ o frasco voa, quebra no chão e borrifa: o jogador toma a dose, o porco leva o dano instantâneo', () => {
    const { e, efeitos } = montar()
    // Sem direção não sai nada.
    expect(e.arremessar('pocao_dano', { splash: true }, null)).toBeNull()
    // Para baixo, aos pés: quebra no chão (y 64) ao lado do jogador e do porco.
    const porco = createMob('pig', 1, 65, 0, 1)
    e.definirMobs([porco])
    const vida = porco.health
    const f = e.arremessar('pocao_dano', { nivel: 2, splash: true }, { x: 0, y: -1, z: 0.1 })
    expect(f).toMatchObject({ forma: 'frasco', item: 'pocao_dano' })
    expect(e.flechas()).toHaveLength(1)
    for (let i = 0; i < 120 && e.flechas().length; i++) e.passoDasFlechas(1 / 60)
    expect(e.flechas(), 'o frasco não quebrou').toHaveLength(0)
    expect(porco.health, 'o porco não levou o dano do borrifo').toBeLessThan(vida)
    expect(efeitos).toHaveLength(1)
    expect(efeitos[0][0]).toBe('dano')
    expect(efeitos[0][1]).toBe(2)
    // O instantâneo chega MINGUADO: aos pés é quase cheio (6), nunca zero.
    expect(efeitos[0][3]).toBeGreaterThan(0)
    expect(efeitos[0][3]).toBeLessThanOrEqual(6)
    // A estranha quebra e não faz nada a ninguém.
    const v2 = porco.health
    e.arremessar('pocao_estranha', { splash: true }, { x: 0, y: -1, z: 0.1 })
    for (let i = 0; i < 120 && e.flechas().length; i++) e.passoDasFlechas(1 / 60)
    expect(porco.health).toBe(v2)
    expect(efeitos).toHaveLength(1)
  })

  it('o borrifo com prazo chega ao jogador minguado pela distância e NÃO à criatura', () => {
    const { e, efeitos } = montar()
    const porco = createMob('pig', 1, 65, 0, 1)
    e.definirMobs([porco])
    const vida = porco.health
    e.arremessar('pocao_veneno', { splash: true }, { x: 0, y: -1, z: 0.1 })
    for (let i = 0; i < 120 && e.flechas().length; i++) e.passoDasFlechas(1 / 60)
    expect(porco.health, 'veneno em criatura é pendência assumida').toBe(vida)
    expect(efeitos).toHaveLength(1)
    expect(efeitos[0][0]).toBe('veneno')
    expect(efeitos[0][2]).toBeGreaterThan(0)
    expect(efeitos[0][2]).toBeLessThan(45)
  })

  it('⚠️ no Fim o dragão nasce sozinho, UMA vez, e ao cair avisa o fim de jogo', () => {
    let deve = true
    const { e, quedas } = montar({
      world: mundoPlano(64, { dimensao: 'end' }),
      dragaoDeveExistir: () => deve,
    })
    e.passoDasCriaturas(1 / 60, 1.62)
    expect(e.mobs().filter((m) => m.type === 'dragao')).toHaveLength(1)
    e.passoDasCriaturas(1 / 60, 1.62)
    expect(
      e.mobs().filter((m) => m.type === 'dragao'),
      'nasceu dois',
    ).toHaveLength(1)
    // Cai: vida a zero no próximo passo → sai da lista, avisa, e não volta.
    e.mobs().find((m) => m.type === 'dragao').health = 0
    deve = false
    e.passoDasCriaturas(1 / 60, 1.62)
    expect(quedas).toEqual([1])
    expect(e.mobs().filter((m) => m.type === 'dragao')).toHaveLength(0)
    e.passoDasCriaturas(1 / 60, 1.62)
    expect(e.mobs().filter((m) => m.type === 'dragao')).toHaveLength(0)
  })

  it('no overworld não há dragão, mesmo com o fim de jogo dizendo que ele deve existir', () => {
    const { e } = montar({ dragaoDeveExistir: () => true })
    e.passoDasCriaturas(1 / 60, 1.62)
    expect(e.mobs().filter((m) => m.type === 'dragao')).toHaveLength(0)
  })

  it('o ambiente entrega a luz REAL e o item na mão', () => {
    // `lightAt` era `() => 15` - uma linha que anulava as 430 de `mobs.js`.
    const { e } = montar({ naMao: () => ({ item: 'wheat' }) })
    const env = e.ambiente()
    expect(env.lightAt(0, 0, 0)).toBe(15)
    expect(env.itemNaMao, 'o rebanho não enxerga o trigo').toBe('wheat')
    expect(env.allowHostile).toBe(true)
    expect(typeof env.ehCerca).toBe('function')
  })

  it('o ambiente abre e fecha a PORTA pelo `editar`, as duas metades juntas', () => {
    // A porta do aldeão (Goal 21). `abrirPorta` só abre o que está fechado,
    // `fecharPorta` só fecha o que está aberto - senão o aldeão reabriria a
    // porta que o jogador acabou de fechar.
    const baixo = idDaPorta('oakDoor', 5, false, false)
    const cima = idDaPorta('oakDoor', 5, false, true)
    const baixoAberta = idDaPorta('oakDoor', 5, true, false)
    const cimaAberta = idDaPorta('oakDoor', 5, true, true)
    const celulas = new Map([
      ['3,65,4', baixo],
      ['3,66,4', cima],
    ])
    const { e, editados } = montar({
      world: mundoPlano(64, { getBlock: (x, y, z) => celulas.get(`${x},${y},${z}`) ?? 0 }),
    })
    const env = e.ambiente()
    expect(env.portaFechadaEm(3, 65, 4)).toBe(true)
    expect(env.portaFechadaEm(3, 65, 5), 'ar não é porta').toBe(false)
    env.abrirPorta(3, 65, 4)
    expect(editados).toEqual([
      [3, 65, 4, baixoAberta],
      [3, 66, 4, cimaAberta],
    ])
    // Fechar o que ainda está fechado no mundo (o `editar` do teste não escreve
    // de volta) NÃO pode virar de novo.
    env.fecharPorta(3, 65, 4)
    expect(editados.length, 'fechou uma porta fechada').toBe(2)
    celulas.set('3,65,4', baixoAberta)
    celulas.set('3,66,4', cimaAberta)
    expect(env.portaFechadaEm(3, 65, 4)).toBe(false)
    const vao = env.vaoDaPorta(3, 65, 4)
    expect(vao, 'o vão da porta aberta, em coordenada de mundo').toBeTruthy()
    expect(
      Math.abs(vao.x - 3.5) + Math.abs(vao.z - 4.5),
      'não é o centro da célula',
    ).toBeGreaterThan(0.05)
    expect(vao.x).toBeGreaterThan(3)
    expect(vao.z).toBeLessThan(5)
    expect(env.vaoDaPorta(3, 65, 5), 'ar não tem vão').toBeNull()
    env.abrirPorta(3, 65, 4)
    expect(editados.length, 'abriu uma porta aberta').toBe(2)
    env.fecharPorta(3, 65, 4)
    expect(editados.slice(2)).toEqual([
      [3, 65, 4, baixo],
      [3, 66, 4, cima],
    ])
  })

  it('o ambiente diz onde está o hostil mais perto — e ignora vaca e aldeão', () => {
    // É o que faz o aldeão fugir do zumbi (`rotina.js`).
    const { e } = montar()
    const bicho = (id, type, x, z) => ({ ...createMob(type, x, 65, z, 1), id, health: 10 })
    e.definirMobs([
      bicho('v', 'cow', 2, 0),
      bicho('a', 'aldeao', 3, 0),
      bicho('z2', 'zombie', 7, 0),
      bicho('z1', 'zombie', 5, 0),
    ])
    const env = e.ambiente()
    expect(env.ameacaPerto(0, 0, 8), 'o zumbi mais perto, não a vaca').toEqual({ x: 5, z: 0 })
    expect(env.ameacaPerto(0, 0, 4), 'fora do raio é null').toBeNull()
  })

  it('no criativo o ambiente proíbe hostil', () => {
    const { e } = montar({ modo: () => 'creative' })
    expect(e.ambiente().allowHostile).toBe(false)
  })

  it('addItem de fora não confunde a coleta parcial', () => {
    // guarda de sanidade do próprio teste: `espacoPara` é quem decide o quanto
    // cabe, e é ele que a coleta usa.
    const inv = createInventory()
    addItem(inv, 'dirt', 10)
    expect(inv.some((s) => s && s.item === 'dirt')).toBe(true)
  })
})

//
// OS MORADORES NASCEM PESSOAS — onda 9 do Goal 20.
//
// ⚠️ ESTE BLOCO EXISTE POR UM MUTANTE SOBREVIVENTE. Apagar a linha que dá um
// `npc` ao aldeão recém-nascido não reprovava NADA: 26 testes verdes, e o
// jogador abriria o balcão de uma pessoa sem nome. É o mesmo defeito, em
// miniatura, das ondas 6 e 7 — regra escrita, regra desligada, suíte calada.
//
describe('os moradores da aldeia', () => {
  // ⚠️ AQUI O MUNDO É O DE VERDADE, com o ruído da semente 42, e não a planície
  // dos outros testes deste arquivo. Não é capricho: `povoarAldeiaPerto` decide
  // onde a vila fica pelo RUÍDO (`solidTopAt`), e não pelo mundo vivo — ver o
  // comentário grande no composable. Um stub plano responderia "chão 64 em toda
  // parte" e o teste concordaria com uma regra que o jogo não usa.
  const n = createNoiseContext(42)
  const planoDoChunk = (cx, cz) =>
    planoDaAldeia(
      (a, b, c) => hash3(a, b, c, 42),
      {
        alturaEm: (x, z) => solidTopAt(n, x, z),
        nivelDoMar: SEA_LEVEL,
        biomaEm: (x, z) => biomeAt(n, x, z, terrainHeight(n, x, z)),
        biomaAceito: (b) => BIOMAS_DA_ALDEIA.includes(BIOME_NAMES[b]),
        materialDaVila: () => MATERIAIS.carvalho,
      },
      cx,
      cz,
    )

  /** A vila mais próxima da origem, varrendo chunks em anéis. */
  const acharVila = () => {
    // Varre CÉLULA a célula, e não chunk a chunk: a grade da vila é de `CELULA`
    // chunks de lado, e um passo menor que ela só faz perguntar a mesma coisa
    // de novo. É a mesma varredura de `qaDeAldeia.procurarAldeia`.
    for (let anel = 0; anel <= 8; anel++) {
      for (let gx = -anel; gx <= anel; gx++) {
        for (let gz = -anel; gz <= anel; gz++) {
          if (Math.max(Math.abs(gx), Math.abs(gz)) !== anel) continue
          const p = planoDoChunk(gx * CELULA, gz * CELULA)
          if (p) return p
        }
      }
    }
    return null
  }

  // ⚠️ E CHEGAR LÁ É UM LAÇO. O jogo usa o plano do CHUNK EM QUE O JOGADOR
  // ESTÁ: pousar no centro devolvido pela varredura muda o chunk e pode revelar
  // outra vila mais perto — e aí o jogo povoa a outra, longe daqui.
  const andarAteAVila = (player) => {
    const p0 = acharVila()
    if (!p0) return false
    player.x = p0.centro.x
    player.z = p0.centro.z
    for (let i = 0; i < 6; i++) {
      const c = planoDoChunk(
        toChunkCoord(Math.floor(player.x)),
        toChunkCoord(Math.floor(player.z)),
      )?.centro
      if (!c) return false
      if (Math.abs(c.x - player.x) < 1 && Math.abs(c.z - player.z) < 1) return true
      player.x = c.x
      player.z = c.z
    }
    return true
  }

  // ⚠️ DOIS PASSOS, E NÃO UM. O relógio do nascimento começa em 3 segundos (a
  // carência do boot) e só depois cai para `PASSO_DO_NASCIMENTO`. Um passo de
  // 2,3 s não vence a carência, e o teste acusaria "não nasce ninguém" por
  // causa do relógio — que foi exatamente o que aconteceu ao escrevê-lo.
  const povoar = () => {
    const m = montar({ modo: () => 'creative' })
    expect(andarAteAVila(m.player), 'não há vila alcançável na semente 42').toBe(true)
    m.e.passoDasCriaturas(PASSO_DO_NASCIMENTO + 0.1, 1.6)
    m.e.passoDasCriaturas(PASSO_DO_NASCIMENTO + 0.1, 1.6)
    return m.e.mobs().filter((x) => x.type === 'aldeao')
  }

  it('nasce aldeão perto do jogador (prova de vida)', () => {
    expect(povoar().length).toBeGreaterThan(0)
  })

  it('a vila JÁ CONSTRUÍDA não impede os moradores de nascer', () => {
    // ⚠️ ESTE É O DEFEITO QUE DEIXAVA TODA VILA VAZIA, e só uma sonda dentro do
    // jogo o achou (15/09/2026, semente 1337 em 152,−104). O jogo perguntava a
    // altura do chão ao MUNDO VIVO; quando o jogador chega, a vila já está de
    // pé, e `surfaceY` devolve o TELHADO. O plano via degraus de cinco blocos,
    // recusava o sítio e ninguém se mudava para lá — nunca.
    //
    // ⚠️ A MENTIRA É A VILA DE VERDADE, e não um número inventado. Duas versões
    // anteriores deste teste deixaram o mutante vivo: "200 em toda parte" é
    // PLANO (e plano o sítio aceita), e um xadrez de telhados de oito em oito
    // também passava. O que derruba o sítio é o recorte das CASAS DESTA VILA —
    // então a mentira sai do próprio plano: telhado onde há casa, terreno onde
    // não há. É exatamente o que `surfaceY` responde depois que a vila sobe.
    const plano = acharVila()
    const emCasa = (x, z) =>
      plano.casas.some(
        (c) => Math.abs(x - c.x) <= LADO_DA_CASA / 2 && Math.abs(z - c.z) <= LADO_DA_CASA / 2,
      )
    const telhados = (x, z) => (emCasa(x, z) ? plano.chao + 5 : solidTopAt(n, x, z))
    const w = { ...mundoPlano(), surfaceY: telhados, biomeAt: () => 8 }
    const m = montar({ world: w, modo: () => 'creative' })
    expect(andarAteAVila(m.player)).toBe(true)
    // A mentira PRECISA ser letal, senão o teste não prova nada: com ela no
    // lugar da altura, o plano da vila deixa de existir.
    expect(
      planoDaAldeia(
        (a, b, c) => hash3(a, b, c, 42),
        {
          alturaEm: telhados,
          nivelDoMar: SEA_LEVEL,
          // ⚠️ O BIOMA VEM DO RUÍDO AQUI, de propósito. A primeira versão desta
          // asserção usava o bioma do mundo mentiroso (neve, que a vila recusa)
          // e devolvia `null` por causa DO BIOMA — provando outra coisa, e
          // deixando o mutante da altura vivo.
          biomaEm: (x, z) => biomeAt(n, x, z, terrainHeight(n, x, z)),
          biomaAceito: (b) => BIOMAS_DA_ALDEIA.includes(BIOME_NAMES[b]),
          materialDaVila: () => MATERIAIS.carvalho,
        },
        toChunkCoord(Math.floor(m.player.x)),
        toChunkCoord(Math.floor(m.player.z)),
      ),
      'a mentira do mundo vivo não derruba o plano: o teste não prova nada',
    ).toBe(null)
    m.e.passoDasCriaturas(PASSO_DO_NASCIMENTO + 0.1, 1.6)
    m.e.passoDasCriaturas(PASSO_DO_NASCIMENTO + 0.1, 1.6)
    expect(m.e.mobs().filter((x) => x.type === 'aldeao').length).toBeGreaterThan(2)
  })

  it('todo aldeão que nasce TEM NOME, ofício e amizade', () => {
    const aldeoes = povoar()
    // Sem esta linha o laço abaixo passaria com a lista VAZIA — o teste-que-não
    // testa que o próprio ratchet de asserção fraca existe para pegar.
    expect(aldeoes.length).toBeGreaterThan(2)
    for (const a of aldeoes) {
      expect(a.npc, 'aldeão sem pessoa dentro').toBeTruthy()
      expect(a.npc.nome.length).toBeGreaterThan(2)
      expect(a.npc.profissao).toBe(a.profissao)
      expect(a.npc.amizade).toBe(AMIZADE_INICIAL)
    }
  })

  it('todo aldeão que nasce tem BALCÃO — ofertas da profissão dele', () => {
    const aldeoes = povoar()
    expect(aldeoes.length).toBeGreaterThan(2)
    for (const a of aldeoes) expect(a.ofertas.length).toBeGreaterThan(0)
  })

  it('o BERÇO fica gravado, e é dele que o nome sai de novo depois do save', () => {
    const aldeoes = povoar()
    expect(aldeoes.length).toBeGreaterThan(2)
    for (const a of aldeoes) {
      expect(a.origemX).toBe(Math.round(a.x))
      expect(a.origemZ).toBe(Math.round(a.z))
    }
  })

  it('a mesma semente, no mesmo lugar, dá as MESMAS pessoas', () => {
    const um = povoar().map((a) => `${a.origemX},${a.origemZ}:${a.npc.nome}`)
    const dois = povoar().map((a) => `${a.origemX},${a.origemZ}:${a.npc.nome}`)
    expect(um.length).toBeGreaterThan(0)
    expect(dois).toEqual(um)
  })
})
