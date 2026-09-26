// RoqueCraft - o lado LEVE do mundo, na thread principal.
//
// Espelha só os BLOCOS dos chunks carregados (o que a colisão e o raycast
// precisam) e repassa as malhas prontas pro renderizador. Luz, geração e mesher
// ficam no worker.
//
// Quando o worker não sobe (navegador antigo, ambiente de teste, política de
// CSP), o mesmo pipeline roda inline num laço de `requestIdleCallback`: o jogo
// fica mais lento pra carregar mas NÃO quebra - a regra do harness é que jogo
// pesado nunca pode ficar preso na tela de carregando.

import { desserializarPaleta } from './paleta.js'
import {
  CHUNK_SIZE,
  WORLD_HEIGHT,
  SECTION_HEIGHT,
  SECTION_COUNT,
  chunkKey,
  toChunkCoord,
  toLocalCoord,
  localIndex,
  AIR,
} from './constants.js'
import { IS_SOLID, IS_LIQUID, IS_AGUADO, IS_OPAQUE, EH_MIRAVEL, SOLIDO_DE_BLOCO } from './blocks.js'
import { CAIXAS_DE_BLOCO } from './formas.js'
import { createPipeline } from './chunkPipeline.js'
import { DIMENSAO_PADRAO } from './dimensoes.js'
import { topoOpacoDaColuna, idNoIndice, gravarNoIndice } from './chunkStore.js'

export function createWorldClient({
  seed = 1,
  renderDistance = 8,
  onMesh = () => {},
  onChunk = () => {},
  onUnload = () => {},
  onReady = () => {},
  forceInline = false,
} = {}) {
  // espelho leve: "cx,cz" → { blocks, biomes, heights }
  const chunks = new Map()
  // Espelho da LUZ dos chunks perto do jogador (sky<<4 | block por célula).
  // Só existe num raio pequeno — ver `emitirLuz` em `chunkPipeline.js`.
  const luzes = new Map()
  let worker = null
  let inline = null
  let disposed = false
  let inlineTimer = null

  function handle(msg) {
    if (disposed) return
    switch (msg.t) {
      case 'chunk':
        chunks.set(chunkKey(msg.cx, msg.cz), {
          blocks: msg.blocks,
          // O indice de `blocks` so tem sentido com a paleta do mesmo chunk.
          paleta: desserializarPaleta(msg.paleta),
          biomes: msg.biomes,
          heights: msg.heights,
        })
        onChunk(msg.cx, msg.cz)
        break
      case 'mesh':
        onMesh(msg)
        break
      case 'luz':
        // Espelho da luz perto do jogador. Chega DEPOIS do bloco (a luz só
        // existe depois que o chunk acende) e é reenviado quando muda.
        luzes.set(chunkKey(msg.cx, msg.cz), msg.light)
        break
      case 'unload':
        chunks.delete(chunkKey(msg.cx, msg.cz))
        luzes.delete(chunkKey(msg.cx, msg.cz))
        onUnload(msg.cx, msg.cz)
        break
      case 'ready':
        onReady()
        break
      case 'error':
        console.error('[RoqueCraft] worker:', msg.message)
        break
      default:
        break
    }
  }

  // ── Inicialização ─────────────────────────────────────────────────────────
  //
  // ⚠️ O QUE O FALLBACK PRECISA SABER É O ESTADO DE AGORA, NÃO O DO BOOT
  // (RC-06). `worker.onerror` chamava `startInline(cx, cz, edits)` com os
  // argumentos que o `start` recebeu — a semente inicial, a posição inicial e as
  // edições iniciais. Se o worker morre depois de o jogador ter andado, entrado
  // numa sala de outra semente ou quebrado quinhentos blocos, o modo inline
  // renasce no mundo ERRADO, no lugar errado e sem nada do que ele construiu; e
  // como ninguém avisa, o jogo simplesmente vira outro jogo.
  //
  // Estas três variáveis são a resposta, e elas são atualizadas por quem muda o
  // estado — `start`, `reset` e `setCenter`.
  let sementeAtual = seed
  let edicoesAtuais = null
  // A dimensão de AGORA, pelo mesmo motivo das duas acima: se o worker cair
  // enquanto o jogador está no Nether, o modo inline tem que renascer no Nether.
  let dimensaoAtual = DIMENSAO_PADRAO
  // Onde o carregamento está centrado agora. Declarados aqui, junto do resto do
  // estado vigente, porque o fallback do worker lê os três.
  let lastCx = null
  let lastCz = null
  let lastSy = null

  function startInline(cx, cz, edits, sy) {
    inline = createPipeline({
      seed: sementeAtual,
      dimensao: dimensaoAtual,
      renderDistance,
      emit: handle,
    })
    if (edits) inline.seedEdits(edits)
    inline.setCenter(cx, cz, sy)
    const loop = () => {
      if (disposed || !inline) return
      inline.tick(6)
      inlineTimer = setTimeout(loop, 8)
    }
    loop()
    onReady()
  }

  function start(cx = 0, cz = 0, edits = null) {
    edicoesAtuais = edits
    lastCx = cx
    lastCz = cz
    if (!forceInline && typeof Worker !== 'undefined') {
      try {
        worker = new Worker(new URL('./chunkWorker.js', import.meta.url), { type: 'module' })
        worker.onmessage = (e) => handle(e.data)
        worker.onerror = (e) => {
          console.error('[RoqueCraft] worker falhou, caindo pro modo inline:', e.message)
          worker?.terminate()
          worker = null
          // O estado de AGORA, e não o do boot (RC-06).
          startInline(lastCx ?? cx, lastCz ?? cz, edicoesAtuais, lastSy ?? undefined)
        }
        worker.postMessage({
          t: 'init',
          seed,
          dimensao: dimensaoAtual,
          renderDistance,
          cx,
          cz,
          edits: edits ? [...edits].map(([k, m]) => [k, [...m]]) : null,
        })
        return
      } catch (err) {
        console.warn('[RoqueCraft] sem Web Worker, modo inline:', err?.message)
        worker = null
      }
    }
    startInline(cx, cz, edits)
  }

  const post = (msg) => {
    if (worker) worker.postMessage(msg)
  }

  // ── Leitura (colisão, raycast, mobs) ──────────────────────────────────────
  function getBlock(x, y, z) {
    if (y < 0 || y >= WORLD_HEIGHT) return AIR
    const c = chunks.get(chunkKey(toChunkCoord(x), toChunkCoord(z)))
    if (!c) return AIR
    return idNoIndice(c, localIndex(toLocalCoord(x), y, toLocalCoord(z)))
  }

  const isLoaded = (x, z) => chunks.has(chunkKey(toChunkCoord(x), toChunkCoord(z)))

  /**
   * ⚠️ CHUNK DESCONHECIDO RESPONDE SÓLIDO, NUNCA AR.
   *
   * `getBlock` devolve AR para chunk ausente, e isso está certo para leitura
   * (raycast, mob, luz): ninguém quer minerar o que não existe. Para COLISÃO
   * está catastroficamente errado, e foi o bug que o founder fotografou em
   * 2026-08-22 — câmera enterrada no maciço, mundo em pedaços. Ar significa
   * "pode passar", então bastava a coluna atrasar o carregamento pro jogador
   * despencar pelo cenário e o terreno aparecer em volta dele.
   *
   * Sólido é a resposta conservadora: no pior caso o jogador encosta numa
   * parede invisível por uma fração de segundo até o chunk chegar; no melhor,
   * não acontece nada, porque `stepPlayer` congela antes disso quando é a
   * coluna DELE que falta. Cair pelo mundo deixa de ser possível por
   * construção.
   *
   * Devolve NÚMERO, não boolean: bloco parcial (camada de neve, laje) informa a
   * fração de altura que a física usa pra montar a AABB. Sem isso o jogador
   * atravessava a neve visível.
   */
  const solidAt = (x, y, z) => {
    if (y < 0) return 1 // fundo do mundo não se atravessa
    if (y >= WORLD_HEIGHT) return 0
    const c = chunks.get(chunkKey(toChunkCoord(x), toChunkCoord(z)))
    if (!c) return 1
    const id = idNoIndice(c, localIndex(toLocalCoord(x), y, toLocalCoord(z)))
    if (IS_SOLID[id] !== 1) return 0
    // Número enquanto a caixa cresce do CHÃO (o mundo inteiro menos a laje de
    // topo); par [base, topo] quando ela FLUTUA. Ver `SOLIDO_DE_BLOCO`.
    return SOLIDO_DE_BLOCO[id]
  }

  /**
   * As caixas da célula, pra MIRA enxergar a forma.
   *
   * Vem de `CAIXAS_DE_BLOCO` e não de `SOLIDO_DE_BLOCO`: ali o bloco simples é
   * um número, e o raycast precisa de caixa sempre. Cubo cheio devolve a caixa
   * unitária, que o raycast reconhece e descarta antes de fazer conta.
   */
  const caixasAt = (x, y, z) => {
    if (y < 0 || y >= WORLD_HEIGHT) return null
    const c = chunks.get(chunkKey(toChunkCoord(x), toChunkCoord(z)))
    if (!c) return null
    return CAIXAS_DE_BLOCO[idNoIndice(c, localIndex(toLocalCoord(x), y, toLocalCoord(z)))]
  }

  /**
   * Luz em (x,y,z), 0..15, ou `null` quando este pedaço do mundo não está
   * espelhado aqui.
   *
   * `null` é uma resposta de verdade, não um erro: quem decide spawn precisa
   * saber a diferença entre "está claro" e "não sei". Devolver 15 no lugar de
   * `null` seria repetir o defeito que isto veio consertar — o `lightAt: () =>
   * 15` que anulava `mobs.js` inteiro.
   *
   * `fatorDia` é 0..1 (`dayFactor`): a luz do céu vale integral ao meio-dia e
   * zero à noite, e é isso que faz a caverna e a noite serem escuras pelo
   * MESMO número.
   */
  function luzCombinada(x, y, z, fatorDia = 1) {
    if (y < 0 || y >= WORLD_HEIGHT) return null
    const l = luzes.get(chunkKey(toChunkCoord(x), toChunkCoord(z)))
    if (!l) return null
    const p = l[localIndex(toLocalCoord(x), y, toLocalCoord(z))]
    const ceu = Math.round(((p >> 4) & 15) * Math.max(0, Math.min(1, fatorDia)))
    return Math.max(ceu, p & 15)
  }

  // Alagado conta como líquido: o jogador NADA por dentro de um pé de alga,
  // e a névoa de submerso não pode piscar toda vez que a cabeça atravessa
  // uma planta.
  const liquidAt = (x, y, z) => {
    const id = getBlock(x, y, z)
    return IS_LIQUID[id] === 1 || IS_AGUADO[id] === 1
  }
  const opaqueAt = (x, y, z) => IS_OPAQUE[getBlock(x, y, z)] === 1
  // Clicável sem ser sólido: mato, flor, muda, tocha. Ver `EH_MIRAVEL`.
  const miravelAt = (x, y, z) => EH_MIRAVEL[getBlock(x, y, z)] === 1

  function heightAt(x, z) {
    const c = chunks.get(chunkKey(toChunkCoord(x), toChunkCoord(z)))
    if (!c || !c.heights) return -1
    return c.heights[toLocalCoord(x) * CHUNK_SIZE + toLocalCoord(z)]
  }

  function biomeAt(x, z) {
    const c = chunks.get(chunkKey(toChunkCoord(x), toChunkCoord(z)))
    if (!c || !c.biomes) return -1
    return c.biomes[toLocalCoord(x) * CHUNK_SIZE + toLocalCoord(z)]
  }

  // O céu alcança este ponto? (queimar mob de dia, decidir spawn hostil)
  function skyExposed(x, y, z) {
    for (let yy = Math.ceil(y) + 1; yy < WORLD_HEIGHT; yy++) {
      if (opaqueAt(Math.floor(x), yy, Math.floor(z))) return false
    }
    return true
  }

  // Primeiro espaço livre acima do chão numa coluna carregada.
  function surfaceY(x, z) {
    const c = chunks.get(chunkKey(toChunkCoord(x), toChunkCoord(z)))
    if (!c) return null
    const base = (toLocalCoord(x) * CHUNK_SIZE + toLocalCoord(z)) * WORLD_HEIGHT
    for (let y = WORLD_HEIGHT - 2; y > 0; y--) {
      if (c.blocks[base + y] === 0) continue // indice 0 e ar em qualquer paleta
      const id = idNoIndice(c, base + y)
      if (IS_SOLID[id] !== 1 || IS_LIQUID[id] === 1) continue
      return y + 1
    }
    return null
  }

  // ── Escrita ───────────────────────────────────────────────────────────────
  // Aplica LOCAL na hora (o jogador vê o bloco sumir sem esperar o round-trip)
  // e manda pro worker recalcular luz e malha.
  function setBlockLocal(x, y, z, id) {
    if (y < 0 || y >= WORLD_HEIGHT) return false
    const c = chunks.get(chunkKey(toChunkCoord(x), toChunkCoord(z)))
    if (!c) return false
    const lx = toLocalCoord(x)
    const lz = toLocalCoord(z)
    gravarNoIndice(c, localIndex(lx, y, lz), id)
    // ⚠️ O HEIGHTMAP DO CLIENTE TAMBÉM (RC-11). Só o worker recalculava o dele,
    // e o daqui ficava com o topo ANTERIOR até o chunk ser reenviado — que pode
    // não acontecer nunca, porque uma edição não reenvia o chunk inteiro. Quem
    // cavasse um buraco continuava, deste lado, com o chão onde não há mais
    // chão: spawn de criatura, exposição ao céu e o gancho de QA liam o número
    // velho. A conta é a MESMA do worker, e agora tem uma fonte só.
    if (c.heights) c.heights[lx * CHUNK_SIZE + lz] = topoOpacoDaColuna(c.blocks, lx, lz, c.paleta)
    return true
  }

  function edit(x, y, z, id) {
    if (!setBlockLocal(x, y, z, id)) return false
    if (worker) post({ t: 'edit', x, y, z, id })
    else inline?.edit(x, y, z, id)
    return true
  }

  function editBatch(list) {
    for (const e of list) setBlockLocal(e.x, e.y, e.z, e.id)
    if (worker) post({ t: 'editBatch', list })
    else inline?.editBatch(list)
  }

  /**
   * Onde o carregamento se centra.
   *
   * ⚠️ O `y` NÃO é enfeite: a fila de malha prioriza a seção do jogador (ver
   * PESO_VERTICAL em chunkPipeline.js). E a comparação inclui a SEÇÃO porque
   * subir uma montanha muda de seção sem mudar de chunk - sem isso, escalar 60
   * blocos dentro do mesmo chunk não reordenava nada e o topo continuava
   * chegando por último.
   */
  function setPlayerPosition(x, y, z) {
    const cx = toChunkCoord(Math.floor(x))
    const cz = toChunkCoord(Math.floor(z))
    const sy = Math.max(0, Math.min(SECTION_COUNT - 1, Math.floor(y / SECTION_HEIGHT)))
    if (cx === lastCx && cz === lastCz && sy === lastSy) return
    lastCx = cx
    lastCz = cz
    lastSy = sy
    if (worker) post({ t: 'center', cx, cz, sy })
    else inline?.setCenter(cx, cz, sy)
  }

  function setRenderDistance(value) {
    if (worker) post({ t: 'distance', value })
    else inline?.setDistance(value)
  }

  function reset(newSeed, edits, novaDimensao = dimensaoAtual) {
    // ⚠️ AVISA CADA CHUNK ANTES DE ESQUECER TODOS — e este laço é o conserto do
    // único defeito que impedia o founder de jogar.
    //
    // "eu entro em um mapa todo quebrado com um monte de blocos sem faces,
    // coisas voando e etc" — founder, 25/08/2026. A gambiarra dele era entrar,
    // baixar o gráfico pro mínimo e voltar pro ultra, o que reconstrói o
    // renderizador inteiro e limpa tudo.
    //
    // O QUE ACONTECIA: `chunks.clear()` apagava a memória do mundo antigo em
    // silêncio. A malha, porém, não mora aqui — mora no engine, que só descarta
    // seção quando ouve `onUnload`. E o único lugar que dispara `onUnload` é a
    // mensagem 'unload' do worker, que o reset não produz. Resultado: TODA a
    // geometria do mundo anterior continuava na cena. Onde o mundo novo tinha
    // chunk no mesmo lugar, `setSection` sobrescrevia; onde não tinha — outro
    // relevo, outro bioma, oceano onde era montanha — a malha velha ficava
    // pendurada no ar para sempre.
    //
    // MEDIDO na sonda `qa-roquecraft-entrada.mjs`, abrindo um mapa novo:
    // 1.035 faces desenhadas em células de AR, 113 seções e 278 mil triângulos
    // a mais. Depois da gambiarra do founder: zero. Depois deste laço: zero,
    // sem gambiarra.
    //
    // ⚠️ E ELE MORA AQUI, NÃO NO CHAMADOR. Há quatro lugares que chamam
    // `reset` (mundo novo, carregar save, entrar em sala multiplayer, e mais
    // um), e a correção no chamador seria quatro linhas que o quinto chamador
    // vai esquecer. O invariante pertence ao lugar onde o estado morre.
    for (const key of chunks.keys()) {
      const [cx, cz] = key.split(',')
      onUnload(Number(cx), Number(cz))
    }
    chunks.clear()
    luzes.clear()
    lastCx = null
    lastCz = null
    // RC-06: a partir daqui, o mundo é este. Um fallback que acontecer depois
    // tem que renascer nele, e não no mundo em que o jogo abriu.
    sementeAtual = newSeed
    edicoesAtuais = edits || null
    dimensaoAtual = novaDimensao
    const payload = edits ? [...edits].map(([k, m]) => [k, [...m]]) : null
    if (worker) post({ t: 'reset', seed: newSeed, edits: payload, dimensao: novaDimensao })
    else inline?.reset(newSeed, edits, novaDimensao)
  }

  function dispose() {
    disposed = true
    clearTimeout(inlineTimer)
    inline = null
    if (worker) {
      try {
        worker.postMessage({ t: 'dispose' })
      } catch {
        /* já morto */
      }
      worker.terminate()
      worker = null
    }
    chunks.clear()
    luzes.clear()
  }

  return {
    start,
    dispose,
    get dimensao() {
      return dimensaoAtual
    },
    /**
     * A semente VIGENTE, e não a que o jogo abriu.
     *
     * ⚠️ AS DUAS DIVERGEM DEPOIS DE UM `reset`, que é exatamente o caso em que
     * alguém de fora precisa perguntar. O minimapa gera terreno a partir dela:
     * lendo a semente inicial, ele continuaria desenhando o mundo ANTERIOR
     * depois de trocar de mundo — um mapa correto de um lugar onde o jogador
     * não está mais, que é a forma mais cara de mapa errado.
     */
    get semente() {
      return sementeAtual
    },
    /**
     * Diz em que dimensão o mundo vai NASCER. Só vale antes do `start`: depois
     * dele quem troca é o `reset`, que também precisa limpar chunk e edição.
     */
    definirDimensao: (id) => {
      if (id) dimensaoAtual = id
    },
    chunks,
    getBlock,
    solidAt,
    caixasAt,
    liquidAt,
    opaqueAt,
    miravelAt,
    luzCombinada,
    isLoaded,
    heightAt,
    biomeAt,
    surfaceY,
    skyExposed,
    edit,
    editBatch,
    setPlayerPosition,
    setRenderDistance,
    reset,
    get loadedCount() {
      return chunks.size
    },
    get usingWorker() {
      return !!worker
    },
  }
}
