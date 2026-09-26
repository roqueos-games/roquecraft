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
})
