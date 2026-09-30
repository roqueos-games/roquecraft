import { describe, it, expect } from 'vitest'
import {
  planoDoTeleporte,
  coordenadaEscalada,
  DESTINOS_DO_TELEPORTE,
  coordenadaDoOutroLado,
  acharPouso,
  celulasDoPortalDeChegada,
  planoDaTravessia,
  outraDimensao,
  marDe,
  RAZAO,
  ALTURA_LIVRE,
  ehCopa,
  planoDoPouso,
  alturaDaSuperficie,
} from '../../src/servicos/viagemEntreDimensoes.js'
import { ehPortal } from '../../src/servicos/portal.js'
import { AIR, ID } from '../../src/servicos/blocks.js'
import { limites } from '../../src/servicos/dimensoes.js'

// A VIAGEM — a conta, o pouso e o portal que nasce do outro lado.
//
// ⚠️ O QUE ESTE ARQUIVO PROTEGE É O JOGADOR NÃO FICAR PRESO. Duas maneiras de
// prender alguém do outro lado, e as duas são fáceis de escrever sem perceber:
// não construir portal de volta, e construir um dentro da rocha. A segunda é a
// pior porque parece que funcionou.

/** Mundo de mentira: sólido abaixo de `chao`, ar acima. */
function mundoPlano(chao = 40, solido = ID.netherrack) {
  return (x, y, z) => (y < chao ? solido : AIR)
}

/** Mundo maciço: rocha em tudo. Nada serve de pouso. */
const macico = () => ID.netherrack

describe('a conta do outro lado', () => {
  it('do overworld para o Nether divide por oito', () => {
    const d = coordenadaDoOutroLado('overworld', 800, 70, -1600)
    expect(d.dimensao).toBe('nether')
    expect(d.x).toBe(100)
    expect(d.z).toBe(-200)
  })

  it('do Nether para o overworld multiplica por oito', () => {
    const d = coordenadaDoOutroLado('nether', 100, 70, -200)
    expect(d.dimensao).toBe('overworld')
    expect(d.x).toBe(800)
    expect(d.z).toBe(-1600)
    expect(RAZAO).toBe(8)
  })

  it('o Y NAO se divide — dividir jogaria todo mundo no piso de bedrock', () => {
    const d = coordenadaDoOutroLado('overworld', 0, 96, 0)
    expect(d.y).toBe(96)
  })

  it('o Y entra na faixa habitavel do destino', () => {
    const { minY, maxY } = limites('nether')
    expect(coordenadaDoOutroLado('overworld', 0, -50, 0).y).toBeGreaterThanOrEqual(minY)
    expect(coordenadaDoOutroLado('overworld', 0, 9999, 0).y).toBeLessThanOrEqual(maxY - 4)
  })

  it('dimensao sem par devolve null em vez de inventar destino', () => {
    expect(coordenadaDoOutroLado('nao-existe', 0, 0, 0)).toBeNull()
    expect(outraDimensao('overworld')).toBe('nether')
    expect(outraDimensao('nao-existe')).toBeNull()
  })

  it('o mar de cada dimensao sai do registro, nao daqui', () => {
    expect(marDe('nether')).toBe('lava')
    expect(marDe('overworld')).toBe('water')
  })
})

describe('achar pouso', () => {
  it('acha o chao do mundo plano', () => {
    const p = acharPouso(mundoPlano(40), { dimensao: 'nether', x: 10, y: 45, z: 10 })
    expect(p).not.toBeNull()
    expect(p.y).toBe(40)
  })

  it('exige altura livre para a moldura INTEIRA, nao so para o corpo', () => {
    // Teto a quatro blocos do chão: cabe o jogador, não cabe o portal.
    const apertado = (x, y) => (y < 40 || y >= 40 + ALTURA_LIVRE - 1 ? ID.netherrack : AIR)
    expect(acharPouso(apertado, { dimensao: 'nether', x: 0, y: 42, z: 0 }, 2)).toBeNull()
  })

  it('exige DOIS blocos de largura: pouso de lado obrigaria a cavar ao chegar', () => {
    // Uma fresta de uma coluna só, em x = 0.
    const fresta = (x, y) => (y >= 40 && x === 0 ? AIR : y < 40 ? ID.netherrack : ID.netherrack)
    expect(acharPouso(fresta, { dimensao: 'nether', x: 0, y: 41, z: 0 }, 1)).toBeNull()
  })

  it('nao pousa sobre lava nem sobre agua', () => {
    const lago = (x, y) => (y < 40 ? ID.lava : AIR)
    expect(acharPouso(lago, { dimensao: 'nether', x: 0, y: 42, z: 0 }, 1)).toBeNull()
  })

  it('devolve null no maciço — e e por isso que o pouso forçado existe', () => {
    expect(acharPouso(macico, { dimensao: 'nether', x: 0, y: 60, z: 0 }, 2)).toBeNull()
  })
})

describe('o portal de chegada', () => {
  const celulas = celulasDoPortalDeChegada(0, 40, 0)
  const em = (x, y, z) => celulas.filter((c) => c.x === x && c.y === y && c.z === z).at(-1)

  it('acende um vao de 2x3', () => {
    const acesas = celulas.filter((c) => ehPortal(c.id))
    expect(acesas).toHaveLength(6)
  })

  it('tem plataforma embaixo: ninguem chega caindo dentro de um portal', () => {
    for (let dx = -1; dx <= 2; dx++) {
      for (let dz = -1; dz <= 1; dz++) expect(em(dx, 39, dz)?.id).toBe(ID.obsidian)
    }
  })

  it('a moldura fecha o vao dos dois lados e por cima', () => {
    for (let j = 0; j < 3; j++) {
      expect(em(-1, 40 + j, 0)?.id).toBe(ID.obsidian)
      expect(em(2, 40 + j, 0)?.id).toBe(ID.obsidian)
    }
    expect(em(0, 43, 0)?.id).toBe(ID.obsidian)
    expect(em(1, 43, 0)?.id).toBe(ID.obsidian)
  })

  it('limpa o espaco em volta — portal aceso dentro da rocha prende o jogador', () => {
    for (const dz of [-1, 1]) {
      for (let dx = -1; dx <= 2; dx++) {
        for (let j = 0; j < 4; j++) expect(em(dx, 40 + j, dz)?.id).toBe(AIR)
      }
    }
  })

  it('o vao vem DEPOIS da limpeza: a ordem e o que impede o ar apagar o portal', () => {
    const ultimoAr = celulas.map((c) => c.id).lastIndexOf(AIR)
    const primeiroPortal = celulas.findIndex((c) => ehPortal(c.id))
    expect(ultimoAr).toBeLessThan(primeiroPortal)
  })
})

describe('o plano da travessia', () => {
  it('leva o jogador para o outro lado, em pe no meio do vao', () => {
    const plano = planoDaTravessia('overworld', { x: 80, y: 70, z: 80 }, mundoPlano(40))
    expect(plano.dimensao).toBe('nether')
    expect(plano.forcado).toBe(false)
    expect(plano.pouso.x % 1).toBe(0.5)
    expect(plano.pouso.z % 1).toBe(0.5)
    expect(plano.celulas.some((c) => ehPortal(c.id))).toBe(true)
  })

  it('FORÇA o pouso no macico em vez de deixar o portal sem efeito', () => {
    const plano = planoDaTravessia('overworld', { x: 80, y: 70, z: 80 }, macico, 2)
    expect(plano).not.toBeNull()
    expect(plano.forcado).toBe(true)
    expect(plano.celulas.filter((c) => ehPortal(c.id))).toHaveLength(6)
  })

  it('sem dimensao de destino nao inventa viagem', () => {
    expect(planoDaTravessia('nao-existe', { x: 0, y: 0, z: 0 }, macico)).toBeNull()
  })

  it('o portal de chegada e valido: acender de novo nao muda nada', async () => {
    const { acender } = await import('../../src/servicos/portal.js')
    const plano = planoDaTravessia('overworld', { x: 80, y: 70, z: 80 }, mundoPlano(40))
    const mapa = new Map()
    for (const c of plano.celulas) mapa.set(`${c.x},${c.y},${c.z}`, c.id)
    const blocoEm = (x, y, z) => mapa.get(`${x},${y},${z}`) ?? AIR
    const meio = plano.celulas.find((c) => ehPortal(c.id))
    // Se a moldura que eu construí não for reconhecida pela MESMA busca que
    // acende, o portal de chegada apaga na primeira visita da fila e o jogador
    // fica preso do outro lado.
    expect(acender(blocoEm, meio.x, meio.y, meio.z)).toEqual([])
  })
})

// ⚠️ O TELEPORTE DO CRIATIVO (Goal 23, onda 3). O que se prova aqui é o PLANO:
// para onde ir e onde pousar. Quem executa continua sendo `criarTravessia` — um
// segundo caminho que fizesse "quase isso" é a política de nascimento em três
// cópias de novo.
describe('o plano do teleporte', () => {
  /** Um mundo de destino com chão sólido até `topo`. */
  const chaoAte = (topo) => (x, y) => (y <= topo ? ID.stone : AIR)
  const POUSO_FIM = { x: 100.5, y: 49, z: 0.5 }
  const jog = { x: 800, y: 70, z: -1600 }

  it('indo PARA o Nether, a coordenada divide por oito', () => {
    const p = planoDoTeleporte('overworld', 'nether', jog, chaoAte(40), POUSO_FIM)
    expect(p.dimensao).toBe('nether')
    // 800/8 = 100, −1600/8 = −200; o +0,5 é o meio do bloco.
    expect(p.pouso.x).toBeCloseTo(100.5, 5)
    expect(p.pouso.z).toBeCloseTo(-199.5, 5)
  })

  it('VINDO do Nether, multiplica', () => {
    const p = planoDoTeleporte(
      'nether',
      'overworld',
      { x: 100, y: 70, z: -200 },
      chaoAte(60),
      POUSO_FIM,
    )
    expect(p.pouso.x).toBeCloseTo(800.5, 5)
    expect(p.pouso.z).toBeCloseTo(-1599.5, 5)
  })

  // ⚠️ O FIM É UMA ILHA EM TORNO DA ORIGEM. Escalar a posição jogaria quem está
  // a 4.000 blocos de casa a 32.000 do centro da ilha, no vazio.
  it('com o Fim numa ponta, a coordenada é CRUA', () => {
    const saindo = coordenadaEscalada('end', 'nether', 800, 70, -1600)
    expect([saindo.x, saindo.z], 'a saída do Fim foi escalada').toEqual([800, -1600])
    const indo = coordenadaEscalada('overworld', 'end', 800, 70, -1600)
    expect([indo.x, indo.z]).toEqual([800, -1600])
  })

  it('ir para o Fim pousa na plataforma, e não procura chão', () => {
    const p = planoDoTeleporte('overworld', 'end', jog, chaoAte(40), POUSO_FIM)
    expect(p.dimensao).toBe('end')
    expect(p.pouso).toEqual(POUSO_FIM)
    expect(p.forcado).toBe(false)
  })

  // ⚠️ SEM ESTA RECUSA o painel reconstruiria o mundo inteiro e teleportaria o
  // jogador para longe de onde ele estava — do ponto de vista dele, um clique
  // que embaralhou tudo.
  it('ir para onde já se está NÃO é viagem', () => {
    expect(planoDoTeleporte('nether', 'nether', jog, chaoAte(40), POUSO_FIM)).toBe(null)
    expect(planoDoTeleporte('overworld', 'overworld', jog, chaoAte(60), POUSO_FIM)).toBe(null)
  })

  it('destino que não existe não vira plano', () => {
    expect(planoDoTeleporte('overworld', 'lua', jog, chaoAte(60), POUSO_FIM)).toBe(null)
    expect(planoDoTeleporte('overworld', '', jog, chaoAte(60), POUSO_FIM)).toBe(null)
  })

  // ⚠️ TELEPORTE NÃO CONSTRÓI PORTAL. Cavar obsidiana no mundo de alguém por
  // causa de um clique num painel seria uma edição que o jogador não pediu.
  it('nenhum destino gera célula de portal', () => {
    for (const d of ['nether', 'overworld', 'end']) {
      const p = planoDoTeleporte(
        d === 'overworld' ? 'nether' : 'overworld',
        d,
        jog,
        chaoAte(40),
        POUSO_FIM,
      )
      expect(p.celulas, `${d} cavou portal`).toEqual([])
    }
  })

  it('sem chão nenhum, o pouso é FORÇADO — e é dito', () => {
    const vazio = () => AIR
    const p = planoDoTeleporte('overworld', 'nether', jog, vazio, POUSO_FIM)
    expect(p.forcado, 'pousou no vazio sem avisar').toBe(true)
    expect(Number.isFinite(p.pouso.y)).toBe(true)
  })

  it('a lista de destinos tem as três dimensões, e só elas', () => {
    expect([...DESTINOS_DO_TELEPORTE].sort()).toEqual(['end', 'nether', 'overworld'])
  })

  // GOAL 23, ONDA 4: um ponto PEDIDO na dimensão de destino (lugar, volta).
  it('com alvo, a coordenada do jogador NÃO é escalada: pousa perto do alvo', () => {
    const alvo = { x: 260, y: 67, z: -168 }
    const p = planoDoTeleporte('nether', 'overworld', jog, chaoAte(66), POUSO_FIM, 16, alvo)
    expect(p.dimensao).toBe('overworld')
    expect(p.pouso.x).toBeCloseTo(260.5, 5)
    expect(p.pouso.z).toBeCloseTo(-167.5, 5)
    expect(p.pouso.y).toBe(67)
    expect(p.celulas).toEqual([])
  })

  it('com alvo no Fim, a volta vai ao alvo e não à plataforma', () => {
    const alvo = { x: 40, y: 60, z: 40 }
    const p = planoDoTeleporte('overworld', 'end', jog, chaoAte(59), POUSO_FIM, 16, alvo)
    expect(p.pouso).toEqual({ x: 40.5, y: 60, z: 40.5 })
  })
})

// A COPA NÃO É CHÃO (Goal 23, onda 4). A sonda de teleporte viu o jogador
// voltar do Fim em cima de `spruceLeaves`; folha é sólida, e `chaoFirme`
// aceitava. Agora a árvore inteira (folha e tronco) é recusada como apoio.
describe('a copa não é chão', () => {
  /** Terra até 40; uma árvore em (0,0): tronco 41..44, folhas 45..46 numa cruz. */
  const comArvore = (x, y, z) => {
    if (y <= 40) return ID.dirt
    if (x === 0 && z === 0 && y >= 41 && y <= 44) return ID.oakLog
    if (Math.abs(x) + Math.abs(z) <= 1 && (y === 45 || y === 46)) return ID.oakLeaves
    return AIR
  }

  it('folha e tronco são copa; terra e pedra não', () => {
    expect(ehCopa(ID.oakLeaves)).toBe(true)
    expect(ehCopa(ID.spruceLeaves)).toBe(true)
    expect(ehCopa(ID.oakLog)).toBe(true)
    expect(ehCopa(ID.dirt)).toBe(false)
    expect(ehCopa(ID.stone)).toBe(false)
    expect(ehCopa(AIR)).toBe(false)
  })

  it('o pouso em cima da árvore é recusado: pousa na terra, ao lado', () => {
    // Alvo bem em cima da copa. Sem a regra, `acharPouso` devolveria y=47
    // (em pé sobre a folha de 46); com ela, o chão de terra em 41, ao lado.
    const p = acharPouso(comArvore, { dimensao: 'overworld', x: 0, y: 47, z: 0 }, 4)
    expect(p).not.toBeNull()
    expect(comArvore(p.x, p.y - 1, p.z)).toBe(ID.dirt)
    expect(p.y).toBe(41)
  })
})

describe('o pouso na mesma dimensão e a superfície', () => {
  const chaoAte = (topo) => (x, y) => (y <= topo ? ID.stone : AIR)

  it('`planoDoPouso` põe o jogador em pé no chão mais perto do ponto', () => {
    const p = planoDoPouso('overworld', { x: 300.5, y: 90, z: -200.5 }, chaoAte(64))
    expect(p.forcado).toBe(false)
    // floor(−200,5) = −201, mais o meio do bloco.
    expect(p.pouso).toEqual({ x: 300.5, y: 65, z: -200.5 })
  })

  it('um tufo de capim no alvo NÃO manda o pouso para uma caverna: vai ao lado', () => {
    // Chão em 70; capim em (0,71) e (1,71); uma caverna livre em y=3..8 na
    // coluna do alvo. Sem a janela, a coluna inteira era varrida primeiro e o
    // jogador pousava a 67 blocos de fundura em vez de um bloco ao lado.
    const mundo = (x, y, z) => {
      // A caverna tem os DOIS blocos de largura que `chaoFirme` exige.
      if ((x === 0 || x === 1) && z === 0 && y >= 3 && y <= 8) return AIR
      if (y <= 70) return ID.stone
      if (y === 71 && (x === 0 || x === 1) && z === 0) return ID.tallGrass
      return AIR
    }
    const p = planoDoPouso('overworld', { x: 0.5, y: 72, z: 0.5 }, mundo)
    expect(p.forcado).toBe(false)
    expect(p.pouso.y).toBe(71)
    expect(Math.abs(p.pouso.x - 0.5) + Math.abs(p.pouso.z - 0.5)).toBeLessThanOrEqual(2)
  })

  it('e a janela é só a primeira tentativa: sem chão perto, a coluna inteira vale', () => {
    // Só uma laje a 60 blocos abaixo do pedido.
    const mundo = (x, y) => (y === 10 ? ID.stone : AIR)
    const p = planoDoPouso('overworld', { x: 0.5, y: 70, z: 0.5 }, mundo, 2)
    expect(p.forcado).toBe(false)
    expect(p.pouso.y).toBe(11)
  })

  it('mato e flor não seguram: o pouso fica no chão de verdade, não em cima do tufo', () => {
    const mundo = (x, y) => (y <= 70 ? ID.stone : y === 71 ? ID.tallGrass : AIR)
    // Alvo em 72, em cima do capim: sem a regra, `chaoFirme` aceitava o capim
    // como chão e o jogador chegava em pé um bloco acima do solo.
    const p = acharPouso(mundo, { dimensao: 'overworld', x: 0, y: 72, z: 0 }, 0, 4)
    expect(p).toBeNull()
  })

  it('sem chão em volta, o pouso é FORÇADO no próprio ponto, e não recusado', () => {
    const p = planoDoPouso('overworld', { x: 10, y: 50, z: 10 }, () => AIR, 2)
    expect(p.forcado).toBe(true)
    expect(p.pouso).toEqual({ x: 10.5, y: 50, z: 10.5 })
  })

  it('`alturaDaSuperficie` é o primeiro bloco de cima para baixo, mais um', () => {
    expect(alturaDaSuperficie(chaoAte(64), 'overworld', 5, 5)).toBe(65)
    expect(alturaDaSuperficie(() => AIR, 'overworld', 5, 5)).toBe(null)
    const { minY } = limites('overworld')
    expect(alturaDaSuperficie(chaoAte(minY), 'overworld', 0, 0)).toBe(minY + 1)
  })
})
