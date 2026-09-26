import { describe, it, expect } from 'vitest'
import { ref } from 'vue'

// Veio de `tests/unit/multijogador/salaSimulada.spec.js` do RoqueOS (7ab22a6f),
// com os mesmos dez casos e as mesmas asserções. Lá o `roqueCraftRoom` importava
// o boot do Firebase e o `useRealtimeMatch` do RoqueOS, e o teste os trocava por
// dublês; aqui o módulo fala com o host (`salaAoVivo`) e não importa nada disso,
// então os dublês saíram. Quem é o jogador na sala vem da rede (`eu()`), e o
// composable recebe só o nome padrão.
import { useRoqueCraftMultijogador } from '../../src/composables/useRoqueCraftMultijogador.js'
import {
  criarMobilia,
  abrirMobilia,
  serializarMobilia,
  serializarEntrada,
  desserializarEntrada,
  versionar,
} from '../../src/servicos/mobilia.js'
import { criarRedeSimulada } from './redeSimulada.js'

/**
 * O CRITÉRIO DA ONDA 6 (Goal 21): "2 a 4 clientes constroem, trocam, morrem
 * e reconectam sem duplicar nem perder, com 150 ms e 1% de perda simulados".
 *
 * Cada cliente é o composable DE VERDADE contra uma partida falsa (estado
 * mínimo: posição, vida, inventário, edições aplicadas, mobília real do
 * `mobilia.js`, criaturas, relógio) e a rede simulada (`redeSimulada.js`),
 * que tem latência, perda nas publicações de melhor esforço e as regras que
 * importam. O tempo é virtual: `correr(segundos)` avança todos os clientes
 * e a rede em passos de 50 ms.
 *
 * O que NÃO está aqui: o Firebase real, o render, a física. O que está: a
 * autoridade (host), a sucessão, a reconexão, o relógio, a mobília com
 * compare-and-set, a validação de golpe. Se qualquer um deles duplicar ou
 * perder, é aqui que reprova.
 */

const PASSO = 0.05
const BAU = '1,64,1'

function criarJogador(rede, uid, { semente = 1, x = 0 } = {}) {
  const c = rede.cliente(uid)
  const estado = {
    pos: { x, y: 64, z: 0, yaw: 0, health: 20, item: '', act: '' },
    ticks: 1000,
    semente,
    inventario: new Map(),
    edicoes: new Map(), // "x,y,z" → id
    mobilia: criarMobilia(),
    criaturas: [{ id: 'm1', type: 'pig', x: 2, y: 64, z: 0, health: 10 }],
    golpesAplicados: [],
    chuvaForcada: null,
    avisos: [],
    recomecos: 0,
    restauracoes: 0,
  }
  const sessao = {
    instantaneo: () => ({ ...estado.pos, skin: 'roque' }),
    criaturas: () => estado.criaturas,
    definirCriaturas: (l) => {
      estado.criaturas = l
    },
    posicaoDaCriatura: (id) => {
      const m = estado.criaturas.find((c) => c.id === id)
      return m ? { x: m.x, y: m.y, z: m.z } : null
    },
    golpear: (id, dano) => {
      estado.golpesAplicados.push([id, dano])
      const m = estado.criaturas.find((c) => c.id === id)
      if (m) m.health -= dano
    },
    aplicarEdicoes: (lista) => {
      for (const e of lista) estado.edicoes.set(`${e.x},${e.y},${e.z}`, e.id)
    },
    temMundo: () => true,
    liquidoEm: () => false,
    audio: () => null,
    semente: () => estado.semente,
    modo: () => 'survival',
    edicoes: () => new Map(),
    instante: () => estado.ticks,
    acertarRelogio: (t) => {
      estado.ticks = t
    },
    climaForcado: () => estado.chuvaForcada,
    acertarClima: (c) => {
      estado.chuvaForcada = c
    },
    mobiliaSerializada: () => serializarMobilia(estado.mobilia),
    entradaDeMobilia: (k) => serializarEntrada(estado.mobilia.get(k)),
    entradaParaEnvio: (k) => {
      const e = estado.mobilia.get(k)
      versionar(e)
      return serializarEntrada(e)
    },
    aplicarMobilia: (k, dado) => {
      const e = desserializarEntrada(dado)
      if (e) estado.mobilia.set(k, e)
      else estado.mobilia.delete(k)
    },
    raioDeSync: () => 2,
    centroEmChunk: () => [0, 0],
    recomecarEm: (s) => {
      estado.recomecos++
      estado.semente = s
      estado.mobilia = criarMobilia()
    },
    instantaneoCompleto: () => ({ seed: estado.semente, ticks: estado.ticks }),
    restaurarSolo: () => {
      estado.restauracoes++
      return true
    },
    guardar: async () => {},
    definirSkin: (id) => id,
  }
  const ui = {
    paused: ref(false),
    sairDoPonteiro: () => {},
    focarChat: () => {},
    avisar: (chave) => estado.avisos.push(chave),
  }
  const mj = useRoqueCraftMultijogador({
    identidade: { nomePadrao: () => uid },
    sessao,
    ui,
    rede: c.R,
  })
  return { uid, mj, estado, cliente: c, R: c.R }
}

/** Uma foto do baú por jogador: quantos diamantes cada um vê no slot 0. */
const diamantesNoBau = (j) => j.estado.mobilia.get(BAU)?.slots[0]?.count ?? 0
const total = (jogadores) => {
  const noBau = diamantesNoBau(jogadores[0])
  return noBau + jogadores.reduce((n, j) => n + (j.estado.inventario.get('diamond') || 0), 0)
}

/** O jogador pega `n` do slot 0 do baú, como um clique faria, e publica. */
function pegarDoBau(j, n) {
  const e = j.estado.mobilia.get(BAU)
  const s = e?.slots[0]
  if (!s || s.count < n) return false
  const antesInv = j.estado.inventario.get('diamond') || 0
  s.count -= n
  if (s.count === 0) e.slots[0] = null
  j.estado.inventario.set('diamond', antesInv + n)
  // `desfazer` devolve o lado PRIVADO (o baú vem da sala)
  j.mj.publicarMobilia(BAU, true, () => j.estado.inventario.set('diamond', antesInv))
  return true
}

async function montarSala({ perda = 0.01, latencia = 0.15, semente = 7, convidados = 2 } = {}) {
  const rede = criarRedeSimulada({ latencia, perda, semente })
  const host = criarJogador(rede, 'b-host')
  // Um baú com 10 diamantes no mundo do anfitrião: nasce com a sala.
  abrirMobilia(host.estado.mobilia, 1, 64, 1, 'bau').slots[0] = { item: 'diamond', count: 10 }
  await host.mj.hostRoom()
  const code = host.mj.mp.code
  const jogadores = [host]
  const nomes = ['c-um', 'a-dois', 'd-tres']
  for (let i = 0; i < convidados; i++) {
    const j = criarJogador(rede, nomes[i], { semente: 99, x: 1 + i })
    await j.mj.joinByCode(code)
    jogadores.push(j)
  }
  async function correr(segundos, aCadaPasso = null) {
    for (let t = 0; t < segundos - 1e-9; t += PASSO) {
      aCadaPasso?.(t)
      for (const j of jogadores) {
        if (!j.mj.mp.active && !j.mj.mp.code) continue
        j.estado.ticks = (j.estado.ticks + PASSO * 20) % 24000
        j.mj.stepMultiplayer(PASSO)
      }
      rede.avancar(PASSO)
      // promessas do composable (reivindicar, publicar, reler)
      for (let k = 0; k < 4; k++) await new Promise((r) => setTimeout(r, 0))
    }
  }
  return { rede, code, host, jogadores, correr }
}

describe('a sala simulada: 3 clientes, 150 ms, 1% de perda', () => {
  it('todos se veem, o relógio é o do anfitrião e a mobília chega inteira', async () => {
    const { jogadores, correr, host, rede } = await montarSala()
    // Todo mundo anda: é a posição a 10 Hz que sente a perda de 1%.
    await correr(3, () => jogadores.forEach((j) => (j.estado.pos.x += 0.1)))
    for (const j of jogadores) expect(j.mj.mp.players).toBe(3)
    for (const j of jogadores.slice(1)) {
      expect(j.mj.mp.isHost).toBe(false)
      expect(j.mj.mp.hostUid).toBe(host.uid)
      // 150 ms de latência a 20 ticks/s são 3 ticks; a tolerância é 40.
      expect(Math.abs(j.estado.ticks - host.estado.ticks)).toBeLessThan(40)
      expect(diamantesNoBau(j)).toBe(10)
      expect(j.estado.recomecos, 'convidado de outra semente recomeça').toBe(1)
    }
    // ~90 publicações de posição a 1%: a perda existiu e ninguém sentiu. O
    // remoto fica ATRÁS pela latência (2 blocos/s × 0,3 s = 0,6), nunca mais.
    expect(rede.perdidas().posicao).toBeGreaterThan(0)
    for (const j of jogadores.slice(1))
      expect(
        Math.abs(j.mj.lobbyPlayers.value.find((p) => p.uid === host.uid).x - host.estado.pos.x),
      ).toBeLessThan(1)
  })

  it('constroem: 60 edições de dois clientes chegam a todos, apesar da perda', async () => {
    const { jogadores, correr, code } = await montarSala()
    await correr(1)
    const [a, b, c] = jogadores
    for (let i = 0; i < 30; i++) {
      a.R.publishEdit(code, i, 70, 0, 1)
      b.R.publishEdit(code, i, 71, 0, 2)
    }
    await correr(1)
    for (const j of [a, b, c]) {
      let n = 0
      for (let i = 0; i < 30; i++) {
        if (j.estado.edicoes.get(`${i},70,0`) === 1) n++
        if (j.estado.edicoes.get(`${i},71,0`) === 2) n++
      }
      expect(n, `${j.uid} perdeu edição`).toBe(60)
    }
  })

  it('trocam: um pega do baú, todos convergem, e nada some nem dobra', async () => {
    const { jogadores, correr } = await montarSala()
    await correr(1)
    const [, b] = jogadores
    expect(pegarDoBau(b, 4)).toBe(true)
    await correr(1)
    for (const j of jogadores) expect(diamantesNoBau(j)).toBe(6)
    expect(b.estado.inventario.get('diamond')).toBe(4)
    expect(total(jogadores)).toBe(10)
  })

  it('DOIS pegam do mesmo baú dentro da latência: um vence, o outro desfaz, o total fecha', async () => {
    const { jogadores, correr, rede } = await montarSala()
    await correr(1)
    const [, b, c] = jogadores
    expect(pegarDoBau(b, 3)).toBe(true)
    expect(pegarDoBau(c, 3)).toBe(true)
    // Os dois VIRAM 7 e 3 no bolso: o otimismo local.
    expect(diamantesNoBau(b) + diamantesNoBau(c)).toBe(14)
    await correr(2)
    expect(rede.recusadas().mobilia, 'os dois passaram: duplicou').toBe(1)
    const bolsos = [b, c].map((j) => j.estado.inventario.get('diamond') || 0)
    expect(bolsos.sort()).toEqual([0, 3])
    for (const j of jogadores) expect(diamantesNoBau(j)).toBe(7)
    expect(total(jogadores)).toBe(10)
    expect(b.mj.mobiliaRecusada() + c.mj.mobiliaRecusada()).toBe(1)
  })

  it('clique DUPLO em cima de um perdedor: os dois cliques caem juntos, nenhum passa por cima', async () => {
    const { jogadores, correr, rede } = await montarSala()
    await correr(1)
    const [, b, c] = jogadores
    // c chega primeiro no banco; b clica duas vezes seguidas sobre o estado velho.
    expect(pegarDoBau(c, 2)).toBe(true)
    expect(pegarDoBau(b, 2)).toBe(true)
    expect(pegarDoBau(b, 2)).toBe(true)
    await correr(2)
    // Sem a fila por chave, o segundo clique de b sairia como v+2 sobre o v+1
    // de c e o banco ACEITARIA um estado que nasceu de outro: 12 diamantes.
    expect(total(jogadores)).toBe(10)
    expect(b.estado.inventario.get('diamond') || 0).toBe(0)
    expect(c.estado.inventario.get('diamond')).toBe(2)
    for (const j of jogadores) expect(diamantesNoBau(j)).toBe(8)
    expect(rede.recusadas().mobilia).toBe(1)
  })

  it('golpeiam: o golpe de perto entra no anfitrião, o de longe é recusado', async () => {
    const { jogadores, correr, code, host } = await montarSala()
    await correr(1)
    const [, b, c] = jogadores
    c.estado.pos.x = 90
    await correr(0.5)
    b.R.sendHit(code, { mobId: 'm1', damage: 4, by: b.uid })
    c.R.sendHit(code, { mobId: 'm1', damage: 4, by: c.uid })
    await correr(1)
    expect(host.estado.golpesAplicados).toEqual([['m1', 4]])
    expect(host.mj.golpesRecusados().alcance).toBe(1)
    // a criatura publicada pelo host chega aos convidados com a vida nova
    expect(b.estado.criaturas.find((m) => m.id === 'm1')?.health).toBe(6)
  })

  it('reconectam: quem cai some da sala, volta como estava, e continua na mesma semente', async () => {
    const { jogadores, correr, host } = await montarSala()
    await correr(1)
    const [, b, c] = jogadores
    c.cliente.cair()
    await correr(1)
    expect(host.mj.mp.players).toBe(2)
    expect(b.mj.mp.players).toBe(2)
    c.cliente.voltar()
    await correr(1.5)
    expect(host.mj.mp.players).toBe(3)
    expect(c.mj.mp.active).toBe(true)
    expect(c.mj.mp.isHost).toBe(false)
    expect(c.estado.recomecos, 'a volta recomeçou o mundo de novo').toBe(1)
  })

  it('o anfitrião cai: o menor uid assume, publica criaturas e relógio; ele volta convidado', async () => {
    const { jogadores, correr, host, rede, code } = await montarSala()
    await correr(1)
    const [, b, c] = jogadores // 'c-um' e 'a-dois': o menor é 'a-dois' (c)
    host.cliente.cair()
    await correr(2)
    expect(rede.sala(code), 'a sala morreu com o anfitrião').not.toBe(null)
    expect(c.mj.mp.isHost).toBe(true)
    expect(b.mj.mp.isHost).toBe(false)
    expect(b.mj.mp.hostUid).toBe(c.uid)
    expect(c.estado.avisos).toContain('nowHost')
    expect(b.estado.avisos).not.toContain('nowHost')
    // o novo host manda: relógio e criaturas dele chegam em b
    c.estado.ticks = 5000
    await correr(3)
    expect(Math.abs(b.estado.ticks - c.estado.ticks)).toBeLessThan(40)
    host.cliente.voltar()
    await correr(2)
    expect(host.mj.mp.active).toBe(true)
    expect(host.mj.mp.isHost).toBe(false)
    expect(host.mj.mp.hostUid).toBe(c.uid)
    expect(host.mj.mp.players).toBe(3)
  })

  it('o último a sair leva a sala; quem sai antes só sai', async () => {
    const { jogadores, correr, rede, code } = await montarSala()
    await correr(1)
    const [a, b, c] = jogadores
    await b.mj.leaveMultiplayer()
    await c.mj.leaveMultiplayer()
    await correr(1)
    expect(a.mj.mp.players).toBe(1)
    expect(rede.sala(code)).not.toBe(null)
    await a.mj.leaveMultiplayer()
    await correr(0.5)
    expect(rede.sala(code), 'a sala ficou no banco pra sempre').toBe(null)
    expect(b.estado.restauracoes).toBe(1)
  })

  it('quatro clientes, 5% de perda: o mundo continua um só', async () => {
    const { jogadores, correr, rede } = await montarSala({ perda: 0.05, convidados: 3 })
    await correr(3)
    for (const j of jogadores) expect(j.mj.mp.players).toBe(4)
    const [, b, c, d] = jogadores
    expect(pegarDoBau(b, 2)).toBe(true)
    await correr(1)
    expect(pegarDoBau(c, 2)).toBe(true)
    expect(pegarDoBau(d, 2)).toBe(true)
    await correr(2)
    expect(total(jogadores)).toBe(10)
    expect(rede.recusadas().mobilia).toBe(1)
    for (const j of jogadores) expect(diamantesNoBau(j)).toBe(6)
  })
})
