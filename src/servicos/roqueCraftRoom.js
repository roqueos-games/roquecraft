// RoqueCraft - salas de multiplayer online, sobre a capacidade `salaAoVivo` do host.
//
// O mundo é INFINITO, então o modelo antigo (assinar TODOS os blocos da sala)
// deixou de servir: entrar numa sala baixaria o mundo inteiro, sem teto. Aqui a
// assinatura é ESCOPADA POR CHUNK - o cliente assina só os chunks dentro do raio
// de visão e larga os que saíram. Um jogador que caminha 2 km não acumula nada.
//
//   roquecraftRooms/{code}/
//     meta:    { host, hostName, seed, createdAt, mode }   host muda na sucessão
//     players/{uid}: { name, x, y, z, yaw, health, item, t }   presença ~10 Hz
//     blocks/{cx_cz}/{li}: type                                 diffs por chunk
//     mobs:    { snap: [...], t }                               só o host escreve
//     relogio: { ticks, chuva, t }                              só o host escreve
//     mobilia/{x,y,z}: entrada no formato do save                membro escreve
//     hits/{pushId}: { m, d, by }                               dano do convidado
//     chat/{pushId}: { uid, name, text, t }
//
// O terreno NÃO trafega: todo mundo roda `generateChunkData` da mesma semente.
// `blocks` guarda só a diferença, indexada por coordenada = último a escrever
// vence, deduplicado por construção (não é um log que cresce pra sempre).
//
// As partes puras (chaves, normalização das listas, sanitização do chat,
// lotes de semeadura, sucessão) são exportadas pra teste sem banco.
//
// ⚠️ ATÉ A EXTRAÇÃO ISTO FALAVA COM O REALTIME DATABASE DIRETO (`firebase/database`,
// `boot/firebase`) e gerava o código e o link com o `useRealtimeMatch` do
// RoqueOS. Agora quem fala com o banco é o host: o código, o link, quem é o
// jogador e o nó `roquecraftRooms/<código>` vêm dele. O BANCO NÃO MUDOU: os nós
// e os campos acima são os mesmos, e é por isso que um jogador no RoqueOS de
// antes e outro no de depois ainda se enxergam. As operações que falavam com o
// banco mantêm o nome e viram métodos de `criarSalaDoRoqueCraft(salaAoVivo)`,
// porque o host é de cada janela e não pode morar num import de módulo. A
// tradução, função por função, é a do desenho da `salaAoVivo` (26/09/2026, §2.1).

import { normalizeSkinId } from './skins.js'
import { normalizarRelogio } from './relogioDaSala.js'
import {
  CHUNK_SIZE,
  WORLD_HEIGHT,
  localIndex,
  toChunkCoord,
  toLocalCoord,
  parseChunkKey,
  chunkDistance,
} from './constants.js'

// Tamanho de cada lote de edits semeados ao criar a sala ("venha jogar no MEU
// mundo"). Até a Onda 6.1 do Goal 21 havia um TETO de 8.000 e o resto do mundo
// simplesmente não ia: o convidado entrava num mundo com a casa pela metade, e
// nada avisava. Agora o mundo inteiro vai, em lotes sequenciais - um write
// único gigante trava o cliente do host, e era só isso que o teto evitava.
export const LOTE_DE_SEMEADURA = 2000
export const CHAT_LIMIT = 60
export const MAX_CHAT_LEN = 160

// ── Chaves seguras pro RTDB (proibido `. $ # [ ] /`) ────────────────────────
// O `_` preserva o sinal do negativo: "-3_7" → { cx: -3, cz: 7 }.
export const chunkPath = (cx, cz) => `${cx}_${cz}`
export function parseChunkPath(key) {
  const p = String(key).split('_')
  if (p.length !== 2) return null
  const cx = Number(p[0])
  const cz = Number(p[1])
  if (!Number.isFinite(cx) || !Number.isFinite(cz)) return null
  return { cx, cz }
}

// Um edit é (chunk, índice local, tipo). Converte de/para coordenada global.
export function editToPath(x, y, z) {
  return {
    chunk: chunkPath(toChunkCoord(x), toChunkCoord(z)),
    li: localIndex(toLocalCoord(x), y, toLocalCoord(z)),
  }
}

export function pathToEdit(chunkKey, li, type) {
  const c = parseChunkPath(chunkKey)
  const i = Number(li)
  if (!c || !Number.isInteger(i) || i < 0 || i >= CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT)
    return null
  const y = i % WORLD_HEIGHT
  const rest = (i - y) / WORLD_HEIGHT
  const lz = rest % CHUNK_SIZE
  const lx = (rest - lz) / CHUNK_SIZE
  return { x: c.cx * CHUNK_SIZE + lx, y, z: c.cz * CHUNK_SIZE + lz, id: Number(type) || 0 }
}

// ── A sucessão do host (puro) ───────────────────────────────────────────────
// Até a Onda 6.2 do Goal 21 a sala morria com o host: `onDisconnect(room)`
// apagava tudo e os convidados ficavam num mundo sem criaturas, sem aviso.
// Agora o host que some deixa a sala, e o MEMBRO de menor uid assume. Sem
// sorteio e sem eleição: a ordem é a mesma em todo cliente, então só um se
// candidata, e a regra do banco recusa quem não é membro ou tenta em nome de
// outro (ver `database.rules.json` e o teste do emulador).
export function sucessorDoAnfitriao(uids) {
  const lista = (uids || []).filter((u) => typeof u === 'string' && u)
  if (!lista.length) return null
  return [...lista].sort()[0]
}

// ── Normalização das listas remotas (puro) ──────────────────────────────────
export function remotePlayerList(map, selfUid) {
  if (!map || typeof map !== 'object') return []
  const out = []
  for (const [uid, p] of Object.entries(map)) {
    if (uid === selfUid || !p) continue
    if (![p.x, p.y, p.z].every((n) => Number.isFinite(n))) continue
    out.push({
      uid,
      name: typeof p.name === 'string' ? p.name.slice(0, 24) : '',
      x: p.x,
      y: p.y,
      z: p.z,
      yaw: Number.isFinite(p.yaw) ? p.yaw : 0,
      health: Number.isFinite(p.health) ? p.health : 20,
      item: typeof p.item === 'string' ? p.item : '',
      // Escolha de aparência. Id desconhecido vira '' e o render sorteia uma
      // skin estável pelo uid - jogador de versão antiga continua aparecendo.
      skin: normalizeSkinId(p.skin),
      // O que ele está FAZENDO. Sem isto o avatar remoto só anda: o amigo
      // quebra um bloco do seu lado e o boneco dele fica parado (relato do
      // founder, 2026-08-22). Valor de fora, então lista fechada.
      act: p.act === 'dig' || p.act === 'hit' ? p.act : '',
    })
  }
  return out
}

// Mensagem de chat: texto é conteúdo de OUTRO usuário, então sai daqui limpo -
// sem tags, sem controle, com teto de tamanho. A UI interpola com `{{ }}`.
export function sanitizeChat(text) {
  // Sem regex de controle (o eslint proíbe `no-control-regex`, e com razão: a
  // classe some no diff). Filtrar por codepoint é explícito e mais barato.
  let out = ''
  for (const ch of String(text ?? '')) {
    const c = ch.codePointAt(0)
    if (c < 0x20 || c === 0x7f) out += ' '
    else if (ch !== '<' && ch !== '>') out += ch
  }
  return out.trim().slice(0, MAX_CHAT_LEN)
}

export function normalizeChat(entry, key) {
  if (!entry || typeof entry !== 'object') return null
  const text = sanitizeChat(entry.text)
  if (!text) return null
  return {
    id: String(key),
    uid: typeof entry.uid === 'string' ? entry.uid : '',
    name: typeof entry.name === 'string' ? entry.name.slice(0, 24) : '?',
    text,
    t: Number.isFinite(entry.t) ? entry.t : 0,
  }
}

/**
 * Divide o `world.edits` (Map<chunkKey, Map<li, id>>) em lotes de multi-path
 * update, cada um com até `tamanho` entradas `"cx_cz/li": id`. Puro: a ordem é
 * a de iteração dos mapas, e um lote nunca fica vazio.
 */
export function lotesDeSemeadura(edits, tamanho = LOTE_DE_SEMEADURA) {
  const lotes = []
  if (!edits || !edits.size) return lotes
  const teto = Math.max(1, tamanho | 0)
  let atual = {}
  let n = 0
  for (const [key, map] of edits) {
    const { cx, cz } = parseChunkKey(key) || {}
    if (cx === undefined) continue
    const path = chunkPath(cx, cz)
    for (const [li, id] of map) {
      atual[`${path}/${li}`] = id
      if (++n >= teto) {
        lotes.push(atual)
        atual = {}
        n = 0
      }
    }
  }
  if (n) lotes.push(atual)
  return lotes
}

// ── A sala, sobre o host ────────────────────────────────────────────────────

/** O erro de "sem conta", com o código que o host usa, para quem chama decidir o aviso. */
function erroSemConta() {
  const erro = new Error('a sala ao vivo pede conta')
  erro.codigo = 'sem-conta'
  return erro
}

/**
 * As operações da sala do RoqueCraft sobre `host.salaAoVivo`. Os nomes são os
 * de antes da extração, e o que mudou está dito em cada uma. `eu()` é novo: o
 * jogador DENTRO da sala (`{ uid, nome }`), que antes vinha da store de conta do
 * RoqueOS e agora vem do host, no `criar` e no `entrar`.
 *
 * @param {object} sala a capacidade `salaAoVivo` do host
 */
export function criarSalaDoRoqueCraft(sala) {
  const hora = () => sala.horaDoServidor()
  /** As salas em que esta janela entrou (criou ou entrou pelo código). */
  const dentro = new Set()
  let eu = null
  const copiaDoEu = () => (eu ? { ...eu } : null)

  return {
    /** Quem é o jogador dentro da sala, ou null antes de criar ou entrar. */
    eu: copiaDoEu,

    /**
     * Host cria a sala. `edits` é o `world.edits` do pipeline (Map<chunkKey, Map>),
     * semeado em lote por chunk pra o convidado já entrar no mundo construído.
     * `mobilia` é a lista do save (`serializarMobilia`): baú, fornalha e suporte
     * com o que têm dentro, chaveados por "x,y,z".
     *
     * O código livre, o link e o `meta` com `host`, `hostName` e `createdAt` são
     * do host agora (antes o jogo conferia três códigos e escrevia o `meta`); o
     * jogo manda `seed` e `mode`. `hostUid` e `hostName` não são mais lidos: o
     * host sabe quem é o jogador, e a regra do banco barraria outro. Sem conta,
     * lança com `.codigo = 'sem-conta'`.
     */
    async createRoom({ seed, edits, mobilia = [], mode = 'survival' }) {
      const { codigo: code, link, eu: quem } = await sala.criar({ meta: { seed, mode } })
      dentro.add(code)
      eu = quem ? { ...quem } : null
      // Sequencial de propósito: em paralelo, os lotes disputam a mesma conexão e
      // o cliente do host trava do mesmo jeito que travava com o write único.
      // Lote recusado lança, como o `update` do banco lançava.
      for (const lote of lotesDeSemeadura(edits)) {
        if (!(await sala.atualizar(code, 'blocks', lote))) {
          throw new Error(`a semeadura de ${code} foi recusada`)
        }
      }
      const moveis = {}
      for (const { k, ...dado } of mobilia || []) if (typeof k === 'string') moveis[k] = dado
      if (Object.keys(moveis).length && !(await sala.atualizar(code, 'mobilia', moveis))) {
        throw new Error(`a mobília de ${code} foi recusada`)
      }
      return { code, joinUrl: link, seeded: true, eu: copiaDoEu() }
    },

    /**
     * O `meta` da sala, ou null se ela não existe. Os dois usos de antes seguem:
     * ENTRAR pelo código (a primeira vez: o host confere a sala e diz quem é o
     * jogador) e a VOLTA DE UMA QUEDA (a janela já está na sala: lê o `meta`).
     * Sem conta, lança com `.codigo = 'sem-conta'`.
     */
    async getRoomMeta(code) {
      if (!code) return null
      if (dentro.has(code)) return (await sala.ler(code, 'meta')) ?? null
      const r = await sala.entrar(code)
      if (r?.erro === 'sem-conta') throw erroSemConta()
      if (!r?.ok || !r.meta) return null
      dentro.add(code)
      eu = r.eu ? { ...r.eu } : null
      return r.meta
    },

    /**
     * Entra (ou REENTRA, depois de uma queda de conexão) como jogador. A presença
     * é reescrita inteira e a limpeza da queda rearmada: o servidor descarta os
     * handlers quando a conexão cai, e sem rearmar o jogador que caiu duas vezes
     * fica na sala como fantasma. Presença recusada lança, como o `set` lançava.
     */
    async enterRoom({ code, uid, name, pos, skin }) {
      const ok = await sala.gravar(code, `players/${uid}`, {
        name: (name || 'Player').slice(0, 24),
        skin: normalizeSkinId(skin),
        act: '',
        x: pos?.x ?? 0,
        y: pos?.y ?? 0,
        z: pos?.z ?? 0,
        yaw: pos?.yaw ?? 0,
        health: 20,
        item: '',
        t: hora(),
      })
      if (!ok) throw new Error(`a presença em ${code} foi recusada`)
      try {
        await sala.aoCair(code, `players/${uid}`, 'apagar')
      } catch {
        /* melhor esforço */
      }
    },

    /**
     * A sala some com o ÚLTIMO a cair, não com o host: armar quando se está
     * sozinho, desarmar quando alguém entra. Era `onDisconnect(room).remove()` no
     * host, e isso matava a sala no exato momento em que a sucessão precisa dela.
     * Só o host pode apagar a sala (regra), então quem arma é o host sozinho.
     */
    fecharSalaAoCair(code, armar) {
      return sala.aoCair(code, '', armar ? 'apagar' : 'cancelar').catch(() => {})
    },

    /**
     * Sai da sala: apaga a própria presença (ou a sala inteira, quando é o
     * último a sair e é o anfitrião) e para os ouvintes desta janela naquela
     * sala. O que foi armado com a limpeza da queda continua armado, como no banco.
     */
    async leaveRoom({ code, uid, fecharSala = false }) {
      try {
        if (fecharSala) await sala.apagar(code, '')
        else await sala.apagar(code, `players/${uid}`)
      } catch {
        /* melhor esforço */
      } finally {
        dentro.delete(code)
        sala.sair(code)
      }
    },

    /** `null` quando a sala deixou de existir. */
    subscribeMeta(code, cb) {
      return sala.observar(code, 'meta', (v) => cb(v ?? null))
    },

    /** Assume a sala. A regra só aceita membro, em nome próprio, com o host ausente. */
    claimHost(code, uid) {
      return sala.atualizar(code, 'meta', { host: uid }).catch(() => false)
    },

    /** `true`/`false` a cada mudança do estado da conexão com o banco. */
    subscribeConnection(cb) {
      return sala.conectado((ligado) => cb(ligado === true))
    },

    // ── Presença ────────────────────────────────────────────────────────────
    publishPosition(code, uid, { x, y, z, yaw, health, item, skin, act }) {
      return sala
        .atualizar(code, `players/${uid}`, {
          x,
          y,
          z,
          yaw,
          health,
          item: item || '',
          skin: normalizeSkinId(skin),
          act: act === 'dig' || act === 'hit' ? act : '',
          t: hora(),
        })
        .catch(() => {})
    },

    subscribePlayers(code, cb) {
      return sala.observar(code, 'players', (v) => cb(v ?? {}))
    },

    // ── Blocos, escopados por chunk ─────────────────────────────────────────
    publishEdit(code, x, y, z, id) {
      const { chunk, li } = editToPath(x, y, z)
      return sala.gravar(code, `blocks/${chunk}/${li}`, id).catch(() => {})
    },

    /**
     * Gerenciador de assinaturas por chunk. `onEdits(list)` recebe lotes de
     * `{x,y,z,id}` - o cliente aplica no pipeline. Chamar `setCenter` a cada troca
     * de chunk do jogador; ele assina o que entrou e larga o que saiu.
     */
    createBlockSync(code, { radius = 6, onEdits = () => {} } = {}) {
      const subs = new Map() // "cx,cz" → unsubscribe
      let center = { cx: NaN, cz: NaN }
      let r = radius
      let closed = false

      function subscribeChunk(cx, cz) {
        const key = `${cx},${cz}`
        if (subs.has(key)) return
        const off = sala.observar(code, `blocks/${chunkPath(cx, cz)}`, (val) => {
          if (closed || !val) return
          const list = []
          for (const [li, type] of Object.entries(val)) {
            const e = pathToEdit(chunkPath(cx, cz), li, type)
            if (e) list.push(e)
          }
          if (list.length) onEdits(list)
        })
        subs.set(key, () => off())
      }

      function setCenter(cx, cz) {
        if (closed) return
        if (cx === center.cx && cz === center.cz) return
        center = { cx, cz }
        for (let dx = -r; dx <= r; dx++) {
          for (let dz = -r; dz <= r; dz++) subscribeChunk(cx + dx, cz + dz)
        }
        // histerese de +2: andar em ziguezague na divisa não fica reassinando
        for (const [key, off] of [...subs]) {
          const alvo = parseChunkKey(key)
          // `chunkDistance`, e nao a conta a mao: distancia em chunks e Chebyshev
          // (por anel, nao por circulo), e essa escolha ja tem nome e teste.
          if (!alvo || chunkDistance(alvo.cx, alvo.cz, cx, cz) > r + 2) {
            off()
            subs.delete(key)
          }
        }
      }

      function setRadius(value) {
        r = Math.max(1, Math.min(12, value | 0))
      }

      function close() {
        closed = true
        for (const off of subs.values()) off()
        subs.clear()
      }

      return {
        setCenter,
        setRadius,
        close,
        get size() {
          return subs.size
        },
      }
    },

    // ── Criaturas (host-autoritativo) ───────────────────────────────────────
    // Só o host roda IA e escreve o snapshot; o convidado renderiza e manda
    // INTENÇÃO de dano, que o host aplica. É o mesmo modelo do co-op do RagnaRoque.
    publishMobs(code, packed) {
      return sala.gravar(code, 'mobs', { snap: packed, t: hora() }).catch(() => {})
    },

    subscribeMobs(code, cb) {
      return sala.observar(code, 'mobs', (v) => cb(v && Array.isArray(v.snap) ? v.snap : []))
    },

    // ── Relógio (host-autoritativo) ─────────────────────────────────────────
    // Hora do mundo e sobrescrita do tempo. A regra pura (desvio circular,
    // tolerância, normalização) mora em `relogioDaSala.js`.
    publishClock(code, { ticks, chuva }) {
      return sala
        .gravar(code, 'relogio', {
          ticks: Number(ticks) || 0,
          chuva: chuva == null ? null : Number(chuva),
          t: hora(),
        })
        .catch(() => {})
    },

    subscribeClock(code, cb) {
      return sala.observar(code, 'relogio', (v) => {
        const r = normalizarRelogio(v)
        if (r) cb(r)
      })
    },

    // ── Mobília compartilhada (Onda 6.3) ────────────────────────────────────
    // Baú, fornalha e suporte são da SALA: quem mexe publica a entrada inteira e
    // `null` apaga - o bloco foi quebrado ou esvaziou. O anfitrião é quem faz a
    // fornalha queimar; o convidado só vê. Desde a Onda 6.4 a regra do banco só
    // aceita `v + 1` sobre o que tem: a resposta é `true` (aceito) ou `false`
    // (outro escreveu antes; quem chamou desfaz e relê). O `false` é o que o
    // host devolve quando a regra recusa.
    publishMobilia(code, k, dado) {
      return sala.gravar(code, `mobilia/${k}`, dado ?? null).catch(() => false)
    },

    /** A entrada como está no banco AGORA (`null` se não existe). */
    getMobilia(code, k) {
      return sala
        .ler(code, `mobilia/${k}`)
        .then((v) => v ?? null)
        .catch(() => null)
    },

    /** `cb(k, dado | null)` por entrada que nasce, muda ou some. */
    subscribeMobilia(code, cb) {
      return sala.observarFilhos(code, 'mobilia', {
        adicionado: (k, dado) => cb(k, dado),
        mudado: (k, dado) => cb(k, dado),
        removido: (k) => cb(k, null),
      })
    },

    // `by` sem conta vira null: o banco (e o host) recusam undefined.
    sendHit(code, { mobId, damage, by }) {
      return sala
        .empurrar(code, 'hits', { m: String(mobId), d: Number(damage) || 0, by: by ?? null })
        .catch(() => {})
    },

    subscribeHits(code, cb) {
      return sala.observarFilhos(code, 'hits', {
        adicionado: (chave, v) => {
          if (v && v.m) cb({ mobId: String(v.m), damage: Number(v.d) || 0, by: v.by, key: chave })
          // o host consome o pedido (a fila não cresce)
          Promise.resolve(sala.apagar(code, `hits/${chave}`)).catch(() => {})
        },
      })
    },

    // ── Chat ────────────────────────────────────────────────────────────────
    sendChat(code, { uid, name, text }) {
      const clean = sanitizeChat(text)
      if (!clean) return Promise.resolve(false)
      return sala
        .empurrar(code, 'chat', {
          uid,
          name: (name || '?').slice(0, 24),
          text: clean,
          t: hora(),
        })
        .then((chave) => chave !== null)
        .catch(() => false)
    },

    subscribeChat(code, cb) {
      return sala.observarFilhos(
        code,
        'chat',
        {
          adicionado: (chave, v) => {
            const msg = normalizeChat(v, chave)
            if (msg) cb(msg)
          },
        },
        { ultimos: CHAT_LIMIT },
      )
    },
  }
}
