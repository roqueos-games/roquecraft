// A REDE SIMULADA: o Realtime Database de mentira, com latência e perda.
//
// É o harness da Onda 6 do Goal 21 ("2 a 4 clientes constroem, trocam, morrem
// e reconectam sem duplicar nem perder, com 150 ms e 1% de perda"). Não há
// emulador nem conta aqui: é um banco em memória com o MESMO contrato que
// `roqueCraftRoom.js` expõe ao composable (`rede` injetável), tempo virtual e
// uma fila de entregas.
//
// O que ela imita, e por quê:
//  - LATÊNCIA: todo write chega ao banco depois de `latencia`, e todo
//    assinante recebe depois de mais `latencia` (inclusive quem escreveu - o
//    RTDB ecoa).
//  - PERDA: só nas publicações de MELHOR ESFORÇO (posição, criaturas,
//    relógio), que no SDK real são `update/set` com `catch(() => {})` e sem
//    retry visível. Edição, mobília, golpe e chat são confiáveis (TCP com
//    fila): perdê-las aqui seria imitar um defeito que o banco não tem.
//  - QUEDA: `cair()` executa os `onDisconnect` do cliente (o servidor faz
//    isso) e a partir daí nada dele chega; `voltar()` reconecta e dispara a
//    assinatura de conexão, como o `.info/connected`.
//  - AS REGRAS que importam: só o host escreve criaturas e relógio; só membro
//    escreve mobília; a mobília só aceita `v + 1` (o compare-and-set da 6.4);
//    a sucessão só com o host ausente; só o host apaga a sala.
//
// Determinística: a perda usa um gerador com semente.
//
// Veio de `tests/unit/multijogador/redeSimulada.js` do RoqueOS (7ab22a6f). O
// contrato que ela imita é o que `criarSalaDoRoqueCraft` (`roqueCraftRoom.js`)
// expõe ao composable, e ele mudou num ponto na extração: quem é o jogador vem
// da SALA, não mais da conta. `createRoom` não recebe `hostUid`/`hostName` (o
// host sabe quem é o jogador; aqui é o cliente da rede) e devolve `eu`, e entrar
// pelo código (`getRoomMeta`) também diz quem é o jogador, lido depois por
// `eu()`. O resto (latência, perda, queda, regras) é o de lá, linha por linha.

import {
  chunkPath,
  parseChunkPath,
  editToPath,
  pathToEdit,
} from '../../src/servicos/roqueCraftRoom.js'
import { chunkDistance, parseChunkKey } from '../../src/servicos/constants.js'

function mulberry32(a) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)))

export function criarRedeSimulada({ latencia = 0.15, perda = 0.01, semente = 7 } = {}) {
  const rng = mulberry32(semente)
  const salas = new Map()
  const fila = []
  let agora = 0
  let contador = 0
  const perdidas = { posicao: 0, criaturas: 0, relogio: 0 }
  const recusadas = { mobilia: 0 }

  const entregar = (fn) => fila.push({ em: agora + latencia, seq: contador++, fn })

  /** Avança o tempo virtual e entrega o que venceu, na ordem. */
  function avancar(dt) {
    agora += dt
    fila.sort((a, b) => a.em - b.em || a.seq - b.seq)
    while (fila.length && fila[0].em <= agora + 1e-9) fila.shift().fn()
  }

  const sala = (code) => salas.get(code) || null
  const novaSala = () => ({
    meta: null,
    players: new Map(),
    blocks: new Map(), // chunkPath → Map(li → id)
    mobs: null,
    chat: [],
    relogio: null,
    mobilia: new Map(),
    // assinantes por tópico: Set de { cliente, cb }
    assinantes: {
      players: new Set(),
      meta: new Set(),
      mobs: new Set(),
      hits: new Set(),
      chat: new Set(),
      relogio: new Set(),
      mobilia: new Set(),
      blocks: new Set(), // { cliente, chunks: Set, cb }
    },
  })

  /** Notifica os assinantes vivos de um tópico, cada um depois da latência. */
  function notificar(code, topico, montar) {
    const s = sala(code)
    if (!s) return
    for (const a of s.assinantes[topico]) {
      if (!a.cliente.ligado) continue
      const v = montar(a)
      if (v === undefined) continue
      entregar(() => {
        if (a.cliente.ligado && s.assinantes[topico].has(a)) a.cb(v)
      })
    }
  }

  const mapaDePlayers = (s) => Object.fromEntries([...s.players].map(([u, p]) => [u, clone(p)]))

  function removerSala(code) {
    const s = sala(code)
    if (!s) return
    salas.delete(code)
    for (const a of s.assinantes.meta) if (a.cliente.ligado) entregar(() => a.cb(null))
  }

  function criarCliente(uid) {
    const cliente = { uid, ligado: true, aoConectar: new Set(), aoCair: [] }
    /** O jogador DENTRO da sala, como o host o diz ao criar ou entrar (`eu()`). */
    let eu = null
    const ligado = () => cliente.ligado
    const melhorEsforco = (tipo) => {
      if (rng() >= perda) return false
      perdidas[tipo]++
      return true
    }
    const assinar = (code, topico, cb, inicial) => {
      const s = sala(code)
      if (!s) return () => {}
      const a = { cliente, cb }
      s.assinantes[topico].add(a)
      if (inicial) {
        const v = inicial(s)
        if (v !== undefined) entregar(() => ligado() && s.assinantes[topico].has(a) && cb(v))
      }
      return () => s.assinantes[topico].delete(a)
    }

    const R = {
      eu: () => (eu ? { ...eu } : null),
      // ── ciclo de vida ────────────────────────────────────────────────────
      // O `meta` com `host` e `hostName` é escrito por quem cria (o host, no
      // contrato); o jogo manda só `seed` e `mode`.
      async createRoom({ seed, edits, mobilia = [], mode = 'survival' }) {
        const code = `SALA${salas.size + 1}`
        const s = novaSala()
        s.meta = { host: uid, hostName: uid, seed, mode, createdAt: agora }
        for (const [key, map] of edits || []) {
          const { cx, cz } = parseChunkKey(key) || {}
          if (cx === undefined) continue
          const p = chunkPath(cx, cz)
          if (!s.blocks.has(p)) s.blocks.set(p, new Map())
          for (const [li, id] of map) s.blocks.get(p).set(String(li), id)
        }
        for (const { k, ...dado } of mobilia) s.mobilia.set(k, clone(dado))
        salas.set(code, s)
        eu = { uid, nome: uid }
        return { code, joinUrl: `sim://${code}`, seeded: true, eu: R.eu() }
      },
      async getRoomMeta(code) {
        const s = sala(code)
        // Entrar pelo código é o que diz ao jogo quem ele é na sala.
        if (s?.meta) eu = { uid, nome: uid }
        return s?.meta ? clone(s.meta) : null
      },
      async enterRoom({ code, uid: u, name, pos, skin }) {
        const s = sala(code)
        if (!s || !ligado()) return
        s.players.set(u, {
          name,
          skin: skin || '',
          act: '',
          x: pos.x,
          y: pos.y,
          z: pos.z,
          yaw: pos.yaw,
          health: 20,
          item: '',
        })
        // o onDisconnect do jogador: some ao cair
        cliente.aoCair.push(() => {
          const sl = sala(code)
          if (!sl) return
          sl.players.delete(u)
          notificar(code, 'players', () => mapaDePlayers(sl))
        })
        notificar(code, 'players', () => mapaDePlayers(s))
      },
      async leaveRoom({ code, uid: u, fecharSala = false }) {
        const s = sala(code)
        if (!s) return
        if (fecharSala) {
          if (s.meta?.host !== u) return // a regra: só o host apaga a sala
          removerSala(code)
          return
        }
        s.players.delete(u)
        notificar(code, 'players', () => mapaDePlayers(s))
      },
      fecharSalaAoCair(code, armar) {
        cliente.aoCair = cliente.aoCair.filter((f) => !f.fechaSala)
        if (armar) {
          const f = () => {
            const s = sala(code)
            if (s && s.meta?.host === uid) removerSala(code)
          }
          f.fechaSala = true
          cliente.aoCair.push(f)
        }
        return Promise.resolve()
      },
      subscribeMeta: (code, cb) => assinar(code, 'meta', cb, (s) => clone(s.meta)),
      claimHost(code, u) {
        return new Promise((resolve) => {
          entregar(() => {
            const s = sala(code)
            // a regra: membro, em nome próprio, host ausente
            if (!s || !s.players.has(u) || s.players.has(s.meta.host)) return resolve(false)
            s.meta = { ...s.meta, host: u }
            notificar(code, 'meta', () => clone(s.meta))
            resolve(true)
          })
        })
      },
      subscribeConnection(cb) {
        cliente.aoConectar.add(cb)
        entregar(() => cliente.aoConectar.has(cb) && cb(ligado()))
        return () => cliente.aoConectar.delete(cb)
      },
      sucessorDoAnfitriao: (uids) => [...uids].filter(Boolean).sort()[0] ?? null,
      buildRoomUrl: (code) => `sim://${code}`,
      remotePlayerList(map, selfUid) {
        return Object.entries(map || {})
          .filter(([u, p]) => u !== selfUid && p)
          .map(([u, p]) => ({ uid: u, ...p }))
      },

      // ── presença (melhor esforço) ────────────────────────────────────────
      publishPosition(code, u, pos) {
        if (!ligado() || melhorEsforco('posicao')) return Promise.resolve()
        entregar(() => {
          const s = sala(code)
          const p = s?.players.get(u)
          if (!p) return
          Object.assign(p, clone(pos))
          notificar(code, 'players', () => mapaDePlayers(s))
        })
        return Promise.resolve()
      },
      subscribePlayers: (code, cb) => assinar(code, 'players', cb, (s) => mapaDePlayers(s)),

      // ── blocos (confiável) ───────────────────────────────────────────────
      publishEdit(code, x, y, z, id) {
        if (!ligado()) return Promise.resolve()
        const { chunk, li } = editToPath(x, y, z)
        entregar(() => {
          const s = sala(code)
          if (!s) return
          if (!s.blocks.has(chunk)) s.blocks.set(chunk, new Map())
          s.blocks.get(chunk).set(String(li), id)
          const e = pathToEdit(chunk, li, id)
          for (const a of s.assinantes.blocks) {
            if (!a.cliente.ligado || !a.chunks.has(chunk)) continue
            entregar(() => a.cliente.ligado && s.assinantes.blocks.has(a) && a.cb([e]))
          }
        })
        return Promise.resolve()
      },
      createBlockSync(code, { radius = 6, onEdits = () => {} } = {}) {
        const s = sala(code)
        const a = { cliente, chunks: new Set(), cb: onEdits }
        s?.assinantes.blocks.add(a)
        let r = radius
        let centro = null
        return {
          setCenter(cx, cz) {
            if (!s) return
            centro = { cx, cz }
            for (let dx = -r; dx <= r; dx++)
              for (let dz = -r; dz <= r; dz++) {
                const p = chunkPath(cx + dx, cz + dz)
                if (a.chunks.has(p)) continue
                a.chunks.add(p)
                const atual = s.blocks.get(p)
                if (atual?.size) {
                  const lista = [...atual].map(([li, id]) => pathToEdit(p, li, id)).filter(Boolean)
                  entregar(() => cliente.ligado && s.assinantes.blocks.has(a) && a.cb(lista))
                }
              }
            for (const p of [...a.chunks]) {
              const c = parseChunkPath(p)
              if (c && chunkDistance(c.cx, c.cz, cx, cz) > r + 2) a.chunks.delete(p)
            }
          },
          setRadius(v) {
            r = Math.max(1, Math.min(12, v | 0))
            if (centro) this.setCenter(centro.cx, centro.cz)
          },
          close() {
            s?.assinantes.blocks.delete(a)
          },
          get size() {
            return a.chunks.size
          },
        }
      },

      // ── criaturas e golpes ───────────────────────────────────────────────
      publishMobs(code, packed) {
        if (!ligado() || melhorEsforco('criaturas')) return Promise.resolve()
        entregar(() => {
          const s = sala(code)
          if (!s || s.meta?.host !== uid) return // a regra: só o host
          s.mobs = clone(packed)
          notificar(code, 'mobs', () => clone(s.mobs))
        })
        return Promise.resolve()
      },
      subscribeMobs: (code, cb) =>
        assinar(code, 'mobs', cb, (s) => (s.mobs ? clone(s.mobs) : undefined)),
      sendHit(code, { mobId, damage, by }) {
        if (!ligado()) return Promise.resolve()
        entregar(() => {
          const s = sala(code)
          if (!s || !s.players.has(by) || !(damage > 0 && damage <= 40)) return
          const hit = { mobId: String(mobId), damage, by, key: `h${contador++}` }
          // consumido pelo host: entregue a quem assina, uma vez
          notificar(code, 'hits', () => hit)
        })
        return Promise.resolve()
      },
      subscribeHits: (code, cb) => assinar(code, 'hits', cb),

      // ── relógio (melhor esforço) ─────────────────────────────────────────
      publishClock(code, { ticks, chuva }) {
        if (!ligado() || melhorEsforco('relogio')) return Promise.resolve()
        entregar(() => {
          const s = sala(code)
          if (!s || s.meta?.host !== uid) return
          s.relogio = { ticks, chuva: chuva ?? null }
          notificar(code, 'relogio', () => clone(s.relogio))
        })
        return Promise.resolve()
      },
      subscribeClock: (code, cb) =>
        assinar(code, 'relogio', cb, (s) => (s.relogio ? clone(s.relogio) : undefined)),

      // ── mobília (confiável, compare-and-set) ─────────────────────────────
      publishMobilia(code, k, dado) {
        if (!ligado()) return Promise.resolve(false)
        return new Promise((resolve) => {
          entregar(() => {
            const s = sala(code)
            if (!s || !s.players.has(uid)) return resolve(false)
            if (dado == null) {
              s.mobilia.delete(k)
            } else {
              // a regra: `v` numérico e igual ao atual + 1 (ou entrada nova)
              const atual = s.mobilia.get(k)
              const esperado = atual ? (atual.v | 0) + 1 : dado.v | 0
              if (typeof dado.v !== 'number' || dado.v !== esperado) {
                recusadas.mobilia++
                return resolve(false)
              }
              s.mobilia.set(k, clone(dado))
            }
            notificar(code, 'mobilia', () => [k, dado == null ? null : clone(dado)])
            resolve(true)
          })
        })
      },
      getMobilia(code, k) {
        return new Promise((resolve) =>
          entregar(() => {
            const s = sala(code)
            resolve(s?.mobilia.has(k) ? clone(s.mobilia.get(k)) : null)
          }),
        )
      },
      subscribeMobilia(code, cb) {
        const s = sala(code)
        if (!s) return () => {}
        const a = { cliente, cb: (par) => cb(par[0], par[1]) }
        s.assinantes.mobilia.add(a)
        for (const [k, d] of s.mobilia)
          entregar(() => ligado() && s.assinantes.mobilia.has(a) && cb(k, clone(d)))
        return () => s.assinantes.mobilia.delete(a)
      },

      // ── chat (confiável) ─────────────────────────────────────────────────
      sendChat(code, { uid: u, name, text }) {
        if (!ligado()) return Promise.resolve(false)
        entregar(() => {
          const s = sala(code)
          if (!s || !s.players.has(u)) return
          const m = { id: `c${contador++}`, uid: u, name, text: String(text).trim(), t: agora }
          s.chat.push(m)
          notificar(code, 'chat', () => clone(m))
        })
        return Promise.resolve(true)
      },
      subscribeChat: (code, cb) => assinar(code, 'chat', cb),
    }

    /** A conexão caiu: o servidor executa os onDisconnect; nada mais sai daqui. */
    function cair() {
      if (!cliente.ligado) return
      cliente.ligado = false
      for (const cb of cliente.aoConectar) cb(false)
      const handlers = cliente.aoCair.splice(0)
      entregar(() => handlers.forEach((f) => f()))
    }

    /** De volta: como o `.info/connected` virando true. */
    function voltar() {
      if (cliente.ligado) return
      cliente.ligado = true
      entregar(() => {
        for (const cb of cliente.aoConectar) cb(true)
      })
    }

    return { R, cair, voltar, uid }
  }

  return {
    cliente: criarCliente,
    avancar,
    agora: () => agora,
    sala: (code) => sala(code),
    perdidas: () => ({ ...perdidas }),
    recusadas: () => ({ ...recusadas }),
    pendentes: () => fila.length,
  }
}
