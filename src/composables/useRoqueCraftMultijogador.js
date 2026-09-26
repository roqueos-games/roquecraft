// RoqueCraft - MULTIJOGADOR: a sala, os remotos, o chat e o lobby.
//
// É COMPOSABLE E NÃO SERVIÇO porque tem CICLO DE VIDA, pelo mesmo critério que
// `useRoqueCraftPersistencia` fixou: ele guarda ASSINATURAS (jogadores, chat,
// golpes, criaturas) e um `blockSync` aberto, e todos precisam ser cancelados
// quando a sala fecha ou o app sai. Serviço puro não guarda assinatura.
//
// ⚠️ O CONTRATO É UMA INTERFACE DA PARTIDA, NÃO UM SACO DE VARIÁVEIS.
//
// A tentação era receber `player`, `yaw`, `survival`, `mobs`, `drops`,
// `flechas`, `seed`, `ticks`, `noiseCtx`, `world`, `settings`, `heldItem`,
// `mining`, `editsMap`... vinte e três fios. Isso não é separação, é mudança de
// endereço (rule 44). Em vez disso o componente monta uma `sessao`: o que a
// rede precisa PUBLICAR da partida e o que ela precisa APLICAR nela.
//
// O teste de que a interface é real é `useRoqueCraftMultijogador.spec.js`: ele
// roda este arquivo inteiro contra uma sessão falsa, sem Vue de jogo, sem
// three, sem Firestore. Um saco de variáveis não passaria por esse teste.

import { ref, reactive, computed } from 'vue'
import { remotePlayerList, sucessorDoAnfitriao } from '../servicos/roqueCraftRoom.js'
import { packMobs, unpackMobs } from '../servicos/mobs.js'
import { PASSO_DO_RELOGIO, precisaAcertar } from '../servicos/relogioDaSala.js'
import { golpeAceito } from '../servicos/intencao.js'

/** Cadência de publicação da posição, em segundos. */
export const PASSO_DA_POSICAO = 0.1
/** Cadência de publicação das criaturas pelo anfitrião, em segundos. */
export const PASSO_DAS_CRIATURAS = 0.125
/**
 * Quanto um remoto precisa percorrer dentro d'água pra render uma braçada.
 *
 * A MESMA constante do jogador local, de propósito: se um dia a cadência
 * mudar, ela muda para os dois, e a piscina não fica com um nadando no
 * compasso do outro.
 */
export const BRACADA_DO_REMOTO = 1.15
/** Cadência com que o anfitrião publica a fornalha que queima, em segundos. */
export const PASSO_DA_MOBILIA = 1
/** Quantas mensagens de chat ficam na tela. */
export const MENSAGENS_NO_CHAT = 40
/** Movimento mínimo, em blocos, que vale uma publicação. */
export const MEXEU = 0.02

/**
 * @param {object} ctx
 * @param {object} [ctx.identidade]  `{ nomePadrao }`: o nome de quem não tem nome
 *   (`roqueCraft.mp.player`). Quem é o jogador na sala vem da `rede` (`eu()`).
 * @param {object} ctx.sessao  a interface da partida (ver o bloco acima)
 * @param {object} ctx.ui  `{ paused, sairDoPonteiro, focarChat, avisar(chave) }` -
 *   `avisar` recebe a chave de `roqueCraft.mp.*` ('copied', 'nowHost', 'roomClosed')
 * @param {object} ctx.rede  a sala: `criarSalaDoRoqueCraft(host.salaAoVivo)` em
 *   produção, uma falsa no teste. As partes puras vêm do módulo e a rede pode
 *   sobrescrevê-las.
 *
 * ⚠️ QUEM É O JOGADOR NA SALA VEM DA SALA, e não mais da conta. Até a extração
 * o componente passava o uid e o nome do `authStore`, e o jogo recusava a sala
 * sozinho quando não havia uid. Agora o host diz quem é o jogador ao criar ou
 * entrar (o `eu` da `salaAoVivo`) e é o HOST que recusa a sala sem conta: o jogo
 * só traduz a recusa (`sem-conta`) no aviso de sempre, `mp.needAccount`. É o que
 * deixa a sala funcionar entre duas abas no `yarn dev`, onde não há conta.
 */
export function useRoqueCraftMultijogador({ identidade = {}, sessao, ui, rede }) {
  const R = {
    remotePlayerList,
    sucessorDoAnfitriao,
    ...rede,
  }
  /** O jogador dentro da sala (`{ uid, nome }`), do host; null fora dela. */
  const euNaSala = ref(null)
  const meuUid = () => euNaSala.value?.uid || ''
  const meuNome = () => euNaSala.value?.nome || identidade.nomePadrao?.() || ''
  /** O host recusou a sala por falta de conta. O lobby troca o menu pelo aviso. */
  const semConta = ref(false)
  const lembrarQuemSou = (quem) => {
    euNaSala.value = quem ? { uid: quem.uid, nome: quem.nome } : euNaSala.value
  }
  const recusouPorConta = (err) => err?.codigo === 'sem-conta'

  // ── Estado que sai do componente e passa a morar aqui ──────────────────────
  const mp = reactive({
    active: false,
    mode: 'menu',
    code: '',
    codeInput: '',
    joinUrl: '',
    qr: '',
    players: 1,
    isHost: false,
    /** Quem manda na sala AGORA (muda na sucessão). */
    hostUid: '',
    error: '',
  })
  const lobbyOpen = ref(false)
  const lobbyPlayers = ref([])
  const chatOpen = ref(false)
  const chatDraft = ref('')
  const chatLog = ref([])

  let assinaturas = []
  /** As assinaturas que dependem do PAPEL (host: golpes; convidado: criaturas e relógio). */
  let assinaturasDoPapel = []
  let blockSync = null
  /** A conexão caiu desde a entrada? Só o retorno de uma queda reentra. */
  let caiu = false
  /** O host de registro já foi visto em `players`? Sem isso, o convidado que entra na janela entre `createRoom` e `enterRoom` do host tomaria a sala dele. */
  let viuAnfitriao = false
  let reivindicando = false
  /** O `onDisconnect(room).remove()` está armado? (só o host, sozinho) */
  let fechamentoArmado = false
  let acumuladorDaPosicao = 0
  let acumuladorDasCriaturas = 0
  let acumuladorDoRelogio = 0
  let acumuladorDaMobilia = 0
  /** Chaves de mobília que mudaram por tique (fornalha, suporte) e ainda não saíram. */
  const mobiliaSuja = new Set()
  /**
   * Por chave, os envios em fila: `{ desfazer }` na ordem dos cliques. Um de
   * cada vez, porque cada um é `v + 1` sobre o anterior; se a sala recusa um,
   * os seguintes nasceram de um estado que não existe e caem juntos.
   */
  const envios = new Map()
  /** Publicações de mobília recusadas pela sala (só pro QA e pro harness). */
  let recusadasNaMobilia = 0
  /** Última sobrescrita de tempo que o convidado adotou do anfitrião. */
  let chuvaAdotada = null
  let ultimaPublicada = { x: 0, y: 0, z: 0, yaw: 0, act: '' }
  /** Onde a partida solo estava antes de entrar numa sala de outra semente. */
  let voltaParaSolo = null
  /** Última posição vista de cada remoto, pra saber quanto ele nadou desde então. */
  const nadoRemoto = new Map()
  /**
   * Última posição publicada de cada remoto, pra validar a intenção de golpe.
   * Separada de `nadoRemoto`, que só existe com áudio e mundo.
   */
  const posicaoDosRemotos = new Map()
  /** Golpes remotos recusados pela validação de intenção, por motivo (só pro QA). */
  const recusados = { dano: 0, alvo: 0, atacante: 0, alcance: 0 }

  // ── Lobby ─────────────────────────────────────────────────────────────────
  function openLobby() {
    mp.error = ''
    mp.mode = mp.active ? 'connected' : 'menu'
    lobbyOpen.value = true
    ui.paused.value = false
    ui.sairDoPonteiro()
  }

  function closeLobby() {
    lobbyOpen.value = false
    mp.error = ''
  }

  // Trocar de skin já DENTRO da sala publica na hora: quem está com você vê o
  // boneco mudar sem precisar sair e voltar.
  function escolherSkin(id) {
    const skin = sessao.definirSkin(id)
    sessao.guardar()
    if (mp.active && meuUid()) {
      R.publishPosition(mp.code, meuUid(), { ...sessao.instantaneo(), skin, act: '' })
    }
  }

  async function makeQr(url) {
    // O convidado não recebe link do host (o contrato dá o link a quem cria):
    // sem link não há o que desenhar, e o código na tela basta.
    if (!url) {
      mp.qr = ''
      return
    }
    try {
      const QRCode = (await import('qrcode')).default
      mp.qr = await QRCode.toDataURL(url, {
        width: 320,
        margin: 1,
        color: { dark: '#0d1b2a', light: '#e8f4ff' },
      })
    } catch {
      mp.qr = ''
    }
  }

  // ── Entrar e sair ─────────────────────────────────────────────────────────
  async function hostRoom() {
    mp.mode = 'creating'
    mp.error = ''
    try {
      const {
        code,
        joinUrl,
        eu: quem,
      } = await R.createRoom({
        seed: sessao.semente(),
        edits: sessao.edicoes(),
        mobilia: sessao.mobiliaSerializada(),
        mode: sessao.modo(),
      })
      lembrarQuemSou(quem ?? R.eu?.())
      semConta.value = false
      mp.code = code
      mp.joinUrl = joinUrl
      mp.isHost = true
      mp.hostUid = meuUid()
      await makeQr(joinUrl)
      await enterMultiplayer(sessao.semente(), true)
      mp.mode = 'connected'
    } catch (err) {
      mp.mode = 'menu'
      // Sem conta não há sala: quem recusa é o host, e o aviso é o de sempre.
      if (recusouPorConta(err)) {
        semConta.value = true
        mp.error = 'needAccount'
        return
      }
      console.error('[RoqueCraft] criar sala falhou:', err)
      mp.error = 'joinFailed'
    }
  }

  async function joinByCode(preset) {
    const code = String(preset || mp.codeInput || '')
      .trim()
      .toUpperCase()
    if (code.length < 4) {
      mp.error = 'enterCode'
      return
    }
    mp.mode = 'joining'
    mp.error = ''
    try {
      const meta = await R.getRoomMeta(code)
      if (!meta) {
        mp.error = 'codeNotFound'
        mp.mode = 'menu'
        return
      }
      lembrarQuemSou(R.eu?.())
      semConta.value = false
      mp.code = code
      // O link do convite o host só dá a quem cria; quem entrou convida pelo código.
      mp.joinUrl = ''
      mp.hostUid = meta.host
      mp.isHost = meta.host === meuUid()
      await makeQr(mp.joinUrl)
      await enterMultiplayer(meta.seed, mp.isHost)
      mp.mode = 'connected'
    } catch (err) {
      mp.mode = 'menu'
      if (recusouPorConta(err)) {
        semConta.value = true
        mp.error = 'needAccount'
        return
      }
      console.error('[RoqueCraft] entrar na sala falhou:', err)
      mp.error = 'joinFailed'
    }
  }

  async function enterMultiplayer(roomSeed, asHost) {
    await sessao.guardar()
    // ⚠️ A SESSÃO INTEIRA, NÃO DOIS NÚMEROS (RC-03). Isto era
    // `{ semente, instante }`, e o resto — inventário, vida, posição, edições,
    // mobília, criaturas — simplesmente não voltava. O porquê está em
    // `sessaoSolo.js`.
    voltaParaSolo = sessao.instantaneoCompleto()
    // Convidado numa semente diferente recomeça no mundo do anfitrião. Quem faz
    // o recomeço é o componente: ele é dono do mundo, do ruído e das entidades.
    if (!asHost && roomSeed !== sessao.semente()) sessao.recomecarEm(roomSeed)
    mp.active = true
    mp.players = 1
    chatLog.value = []

    await apresentar()

    assinaturas.push(R.subscribePlayers(mp.code, onRemotePlayers))
    assinaturas.push(R.subscribeMeta(mp.code, aoMudarMeta))
    assinaturas.push(R.subscribeConnection(aoMudarConexao))
    assinaturas.push(R.subscribeMobilia(mp.code, (k, dado) => sessao.aplicarMobilia(k, dado)))
    assinaturas.push(
      R.subscribeChat(mp.code, (m) => {
        chatLog.value = [...chatLog.value, m].slice(-MENSAGENS_NO_CHAT)
      }),
    )
    blockSync = R.createBlockSync(mp.code, {
      radius: sessao.raioDeSync(),
      onEdits: (list) =>
        sessao.aplicarEdicoes(list.map((e) => ({ x: e.x, y: e.y, z: e.z, id: e.id }))),
    })
    const [cx, cz] = sessao.centroEmChunk()
    blockSync.setCenter(cx, cz)

    assumirPapel(asHost)
  }

  /** Escreve a presença inteira e (re)arma o `onDisconnect` do jogador. */
  function apresentar() {
    const inicio = sessao.instantaneo()
    return R.enterRoom({
      code: mp.code,
      uid: meuUid(),
      name: meuNome(),
      pos: { x: inicio.x, y: inicio.y, z: inicio.z, yaw: inicio.yaw },
      skin: inicio.skin,
    })
  }

  /**
   * ⚠️ ANFITRIÃO E CONVIDADO ASSINAM COISAS DIFERENTES, e trocar os dois faria
   * as criaturas de todo mundo divergirem em silêncio: o anfitrião é a fonte
   * da verdade (recebe golpes, publica criaturas e relógio) e o convidado é
   * espelho. Desde a Onda 6.2 o papel pode MUDAR no meio da partida (sucessão),
   * por isso as assinaturas do papel vivem separadas das da sala.
   */
  function assumirPapel(host) {
    assinaturasDoPapel.forEach((u) => u?.())
    assinaturasDoPapel = []
    mp.isHost = host
    if (host) {
      assinaturasDoPapel.push(R.subscribeHits(mp.code, aoReceberGolpe))
      // O relógio sai JÁ: o convidado que entra lê o valor atual na assinatura,
      // e sem este write ele ficaria no próprio horário até o primeiro passo.
      publicarRelogio()
    } else {
      assinaturasDoPapel.push(
        R.subscribeMobs(mp.code, (packed) => sessao.definirCriaturas(unpackMobs(packed))),
      )
      assinaturasDoPapel.push(R.subscribeClock(mp.code, aoReceberRelogio))
    }
  }

  // ── Mobília compartilhada ─────────────────────────────────────────────────
  /**
   * Um baú/fornalha/suporte mudou aqui. Clique do jogador sai NA HORA; a
   * fornalha queimando (tique do anfitrião) acumula e sai a cada
   * `PASSO_DA_MOBILIA`, senão seriam 60 writes por segundo por fornalha.
   */
  function publicarMobilia(k, imediato = false, desfazer = () => {}) {
    if (!mp.active) return
    if (!imediato) {
      mobiliaSuja.add(k)
      return
    }
    mobiliaSuja.delete(k)
    enfileirar(k, desfazer)
  }

  function despacharMobilia() {
    acumuladorDaMobilia = 0
    for (const k of mobiliaSuja) enfileirar(k, () => {})
    mobiliaSuja.clear()
  }

  function enfileirar(k, desfazer) {
    const fila = envios.get(k) || []
    fila.push({ desfazer })
    envios.set(k, fila)
    if (fila.length === 1) enviarProximo(k)
  }

  /**
   * O COMPARE-AND-SET do baú (Onda 6.4). `entradaParaEnvio` sobe a versão
   * local e serializa; o banco só aceita `v + 1` sobre o que tem. Recusado:
   * desfaz este clique e os que vieram atrás (de trás pra frente), conta, e
   * relê a entrada como a sala a tem.
   */
  async function enviarProximo(k) {
    const fila = envios.get(k)
    if (!fila?.length) return
    const aceito = await R.publishMobilia(mp.code, k, sessao.entradaParaEnvio(k))
    if (!mp.active) return
    if (aceito) {
      fila.shift()
      if (fila.length) enviarProximo(k)
      else envios.delete(k)
      return
    }
    recusadasNaMobilia++
    for (const e of fila.splice(0).reverse()) e.desfazer()
    envios.delete(k)
    const atual = await R.getMobilia(mp.code, k)
    if (mp.active) sessao.aplicarMobilia(k, atual)
  }

  /** Quem faz a fornalha queimar: fora da sala, todo mundo; na sala, só o anfitrião. */
  const regeMobilia = () => !mp.active || mp.isHost

  /**
   * A INTENÇÃO DE GOLPE, validada (Onda 6.4). O atacante é quem `by` diz; a
   * posição dele é a última publicada (a mesma que o som da braçada usa), e a
   * do alvo vem da partida. O que não passa é contado, não aplicado.
   */
  function aoReceberGolpe({ mobId, damage, by }) {
    const atacante = posicaoDosRemotos.get(by) || null
    const v = golpeAceito({ dano: damage, atacante, alvo: sessao.posicaoDaCriatura(mobId) })
    if (!v.ok) {
      recusados[v.motivo]++
      return
    }
    sessao.golpear(mobId, damage)
  }

  // ── A sucessão do host e a volta de uma queda ─────────────────────────────
  /** `meta` mudou: outro host, ou a sala deixou de existir. */
  function aoMudarMeta(meta) {
    if (!mp.active) return
    if (!meta) {
      leaveMultiplayer()
      ui.avisar('roomClosed')
      return
    }
    if (meta.host === mp.hostUid) return
    mp.hostUid = meta.host
    const souHost = meta.host === meuUid()
    if (souHost !== mp.isHost) assumirPapel(souHost)
    if (souHost) ui.avisar('nowHost')
  }

  /** O host de registro sumiu de `players`: o membro de menor uid assume. */
  function sucederSePreciso(uidsPresentes) {
    if (mp.isHost || reivindicando) return
    if (uidsPresentes.includes(mp.hostUid)) {
      viuAnfitriao = true
      return
    }
    if (!viuAnfitriao) return
    if (R.sucessorDoAnfitriao(uidsPresentes) !== meuUid()) return
    reivindicando = true
    Promise.resolve(R.claimHost(mp.code, meuUid())).finally(() => {
      reivindicando = false
    })
  }

  /** O host sozinho arma a autodestruição da sala; com companhia, desarma. */
  function armarFechamento(sozinho) {
    const armar = mp.isHost && sozinho
    if (armar === fechamentoArmado) return
    fechamentoArmado = armar
    R.fecharSalaAoCair(mp.code, armar)
  }

  function aoMudarConexao(ligado) {
    if (!ligado) {
      caiu = true
      return
    }
    if (!caiu || !mp.active) return
    caiu = false
    reentrar()
  }

  /**
   * De volta de uma queda: a presença foi apagada pelo `onDisconnect` e os
   * handlers do servidor se foram. Reescreve, rearma, e confere quem manda -
   * a sala pode ter trocado de host (ou sumido) enquanto se estava fora.
   */
  async function reentrar() {
    const meta = await R.getRoomMeta(mp.code)
    if (!mp.active) return
    if (!meta) {
      await leaveMultiplayer()
      ui.avisar('roomClosed')
      return
    }
    await apresentar()
    fechamentoArmado = false
    aoMudarMeta(meta)
    armarFechamento(mp.players === 1)
  }

  // ── Relógio da sala ───────────────────────────────────────────────────────
  function publicarRelogio() {
    acumuladorDoRelogio = 0
    R.publishClock(mp.code, { ticks: sessao.instante(), chuva: sessao.climaForcado() })
  }

  /**
   * O convidado acerta o relógio só quando o desvio passa da tolerância (a
   * regra está em `relogioDaSala.js`), e adota a sobrescrita de tempo do
   * anfitrião só quando ela MUDA: `acertarClima` pula a rampa, e chamá-la a
   * cada mensagem faria o céu saltar a cada 2 s.
   */
  function aoReceberRelogio({ ticks, chuva }) {
    if (precisaAcertar(sessao.instante(), ticks)) sessao.acertarRelogio(ticks)
    if (chuva !== chuvaAdotada) {
      chuvaAdotada = chuva
      sessao.acertarClima(chuva)
    }
  }

  async function leaveMultiplayer() {
    assinaturas.forEach((u) => u?.())
    assinaturas = []
    assinaturasDoPapel.forEach((u) => u?.())
    assinaturasDoPapel = []
    blockSync?.close()
    blockSync = null
    const estavaAtivo = mp.active
    // O último a sair leva a sala junto; senão ela ficaria no banco pra sempre.
    if (mp.code && meuUid())
      await R.leaveRoom({
        code: mp.code,
        uid: meuUid(),
        fecharSala: estavaAtivo && mp.isHost && mp.players === 1,
      })
    mp.active = false
    mp.mode = 'menu'
    mp.code = ''
    mp.joinUrl = ''
    mp.qr = ''
    mp.players = 1
    mp.isHost = false
    mp.hostUid = ''
    mobiliaSuja.clear()
    envios.clear()
    acumuladorDaMobilia = 0
    caiu = false
    viuAnfitriao = false
    reivindicando = false
    fechamentoArmado = false
    lobbyOpen.value = false
    lobbyPlayers.value = []
    chatLog.value = []
    chuvaAdotada = null
    acumuladorDoRelogio = 0
    // ⚠️ SEM A COMPARAÇÃO DE SEMENTE, e ela era o defeito (RC-03). Era
    // `voltaParaSolo.semente !== sessao.semente()`, e o anfitrião — que joga a
    // sala na própria semente — nunca entrava no `if`. Ele saía da sala com o
    // inventário, a vida, as edições e as criaturas DA SALA, achando que estava
    // no mundo dele; e com `mp.active` de volta a falso, o autosave gravava
    // isso por cima do save solo. Semente igual não é sessão igual.
    if (estavaAtivo && voltaParaSolo) sessao.restaurarSolo(voltaParaSolo)
    voltaParaSolo = null
  }

  // ── Remotos ───────────────────────────────────────────────────────────────
  /**
   * OUTRO JOGADOR NADANDO.
   *
   * O founder pediu isso por nome. A braçada dele não é um evento que chega
   * pela rede - o protocolo manda posição, não som - então ela é DERIVADA: se o
   * remoto está dentro d'água e percorreu a distância de uma braçada desde o
   * último quadro, toca, na posição dele.
   */
  function somDosRemotos(list) {
    const audio = sessao.audio()
    if (!audio || !sessao.temMundo()) return
    const vistos = new Set()
    for (const p of list) {
      if (!p?.uid || !Number.isFinite(p.x)) continue
      vistos.add(p.uid)
      const dentro = sessao.liquidoEm(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))
      const ant = nadoRemoto.get(p.uid)
      nadoRemoto.set(p.uid, { x: p.x, y: p.y, z: p.z, acc: ant?.acc || 0 })
      if (!dentro || !ant) continue
      const st = nadoRemoto.get(p.uid)
      st.acc = (ant.acc || 0) + Math.hypot(p.x - ant.x, p.z - ant.z)
      if (st.acc < BRACADA_DO_REMOTO) continue
      st.acc = 0
      const cabeca = sessao.liquidoEm(Math.floor(p.x), Math.floor(p.y + 1.6), Math.floor(p.z))
      const pos = { x: p.x, y: p.y + 1, z: p.z }
      if (cabeca) audio.bolha(pos)
      else audio.bracada(pos)
    }
    // quem saiu da sala não fica acumulando distância pra sempre
    for (const uid of [...nadoRemoto.keys()]) if (!vistos.has(uid)) nadoRemoto.delete(uid)
  }

  function onRemotePlayers(map) {
    const list = R.remotePlayerList(map, meuUid())
    mp.players = list.length + 1
    posicaoDosRemotos.clear()
    for (const p of list) posicaoDosRemotos.set(p.uid, { x: p.x, y: p.y, z: p.z })
    somDosRemotos(list)
    sucederSePreciso([meuUid(), ...list.map((p) => p.uid)])
    armarFechamento(list.length === 0)
    const eu = sessao.instantaneo()
    lobbyPlayers.value = [
      {
        uid: meuUid(),
        name: meuNome(),
        health: eu.health,
        x: eu.x,
        y: eu.y,
        z: eu.z,
        yaw: eu.yaw,
      },
      ...list,
    ]
  }

  function stepMultiplayer(dt) {
    acumuladorDaPosicao += dt
    if (acumuladorDaPosicao >= PASSO_DA_POSICAO && meuUid()) {
      acumuladorDaPosicao = 0
      const agora = sessao.instantaneo()
      const andou =
        Math.abs(agora.x - ultimaPublicada.x) > MEXEU ||
        Math.abs(agora.y - ultimaPublicada.y) > MEXEU ||
        Math.abs(agora.z - ultimaPublicada.z) > MEXEU ||
        Math.abs(agora.yaw - ultimaPublicada.yaw) > MEXEU
      // Publica também quando a AÇÃO muda, não só quando o corpo anda. Minerar é
      // a única coisa que se faz parado: com o teste só de posição, o amigo via
      // você imóvel enquanto o bloco na frente rachava sozinho.
      if (andou || agora.act !== ultimaPublicada.act) {
        ultimaPublicada = { x: agora.x, y: agora.y, z: agora.z, yaw: agora.yaw, act: agora.act }
        R.publishPosition(mp.code, meuUid(), agora)
      }
    }
    if (mp.isHost) {
      acumuladorDasCriaturas += dt
      if (acumuladorDasCriaturas >= PASSO_DAS_CRIATURAS) {
        acumuladorDasCriaturas = 0
        R.publishMobs(mp.code, packMobs(sessao.criaturas()))
      }
      acumuladorDoRelogio += dt
      if (acumuladorDoRelogio >= PASSO_DO_RELOGIO) publicarRelogio()
      acumuladorDaMobilia += dt
      if (acumuladorDaMobilia >= PASSO_DA_MOBILIA && mobiliaSuja.size) despacharMobilia()
    }
  }

  // ── Chat e convite ────────────────────────────────────────────────────────
  async function copyInvite() {
    try {
      // Sem link (quem entrou pelo código não recebe link do host), o convite é o código.
      await navigator.clipboard.writeText(mp.joinUrl || mp.code)
      ui.avisar('copied')
    } catch (err) {
      console.error('[RoqueCraft] copiar convite falhou:', err)
    }
  }

  function openChat() {
    chatOpen.value = true
    ui.sairDoPonteiro()
    ui.focarChat()
  }

  function closeChat() {
    chatOpen.value = false
    chatDraft.value = ''
  }

  async function submitChat() {
    const text = chatDraft.value
    closeChat()
    if (!text.trim() || !mp.active) return
    await R.sendChat(mp.code, {
      uid: meuUid(),
      name: meuNome(),
      text,
    })
  }

  /**
   * O sync de blocos segue o jogador: ele so troca as edicoes de quem esta
   * perto. Sem recentrar, quem anda pra longe do ponto de entrada para de ver
   * o que o amigo constroi.
   */
  function recentrar(cx, cz) {
    blockSync?.setCenter(cx, cz)
  }

  /** A distancia de render mudou; o sync acompanha. */
  function definirRaio(r) {
    blockSync?.setRadius(r)
  }

  /**
   * ⚠️ CHAMAR NO `onBeforeUnmount` E NO DESMONTE DO JOGO.
   *
   * É a razão de isto ser composable: sem cancelar, as assinaturas continuam
   * recebendo e escrevendo num jogo que já não existe.
   */
  function encerrar() {
    assinaturas.forEach((u) => u?.())
    assinaturas = []
    assinaturasDoPapel.forEach((u) => u?.())
    assinaturasDoPapel = []
    blockSync?.close()
    blockSync = null
    nadoRemoto.clear()
    posicaoDosRemotos.clear()
  }

  return {
    mp,
    lobbyOpen,
    lobbyPlayers,
    chatOpen,
    chatDraft,
    chatLog,
    ativo: computed(() => mp.active),
    /** O uid do jogador DENTRO da sala (do host), ou '' fora dela. */
    meuUid: computed(meuUid),
    semConta,
    openLobby,
    closeLobby,
    escolherSkin,
    hostRoom,
    joinByCode,
    enterMultiplayer,
    leaveMultiplayer,
    stepMultiplayer,
    onRemotePlayers,
    recentrar,
    definirRaio,
    publicarMobilia,
    regeMobilia,
    copyInvite,
    openChat,
    closeChat,
    submitChat,
    encerrar,
    /** Só pro QA: quantas assinaturas estão abertas agora (sala + papel). */
    assinaturasAbertas: () => assinaturas.length + assinaturasDoPapel.length,
    /** Só pro QA: o relógio da sala chegou, como se viesse da rede. */
    receberRelogio: aoReceberRelogio,
    /** Só pro QA e pro harness: golpes remotos recusados, por motivo. */
    golpesRecusados: () => ({ ...recusados }),
    /** Só pro QA e pro harness: publicações de mobília que a sala recusou. */
    mobiliaRecusada: () => recusadasNaMobilia,
  }
}
