// RoqueCraft - o pipeline de chunk, escrito UMA vez e rodado nos dois lados.
//
// O mesmo módulo roda dentro do Web Worker (produção) e inline (testes, e
// qualquer navegador onde o worker não suba). Ele é dono do mundo "pesado":
// blocos, luz, geração e malha. A thread principal fica só com uma cópia dos
// BLOCOS - o suficiente pra colisão e raycast - e com as malhas prontas.
//
// Divisão de trabalho medida: gerar um chunk custa ~7 ms e malhar ~34 ms. Os 41
// ms fora da thread principal são a diferença entre 60 fps estável e engasgo a
// cada chunk que entra no horizonte.

import {
  CHUNK_SIZE,
  SECTION_COUNT,
  SECTION_HEIGHT,
  chunkKey,
  chunkDistance,
  toChunkCoord,
  toLocalCoord,
  localIndex,
  parseChunkKey,
} from './constants.js'
import {
  createWorld,
  createChunk,
  putChunk,
  dropChunk,
  recomputeHeightmap,
  neighborsReady,
  neighborsLit,
  setBlock,
  applyEdits,
  instalarBlocos,
} from './chunkStore.js'
import { serializarPaleta } from './paleta.js'
import { createNoiseContext, generateChunkData } from './worldgen.js'
import { criarGerador } from './geradores.js'
import { DIMENSAO_PADRAO } from './dimensoes.js'
import { lightChunk, updateLightAt, toquesDaLuz, TOQUE } from './lighting.js'
import { meshSection } from './mesher.js'
import { buildNeighborhood, neighborhoodAccessor } from './neighborhood.js'

/**
 * @param {object} opts
 *   seed            semente do mundo
 *   renderDistance  raio em chunks
 *   emit(msg, transfer)  callback de saída (postMessage no worker)
 */
export function createPipeline({
  seed = 1,
  // ⚠️ A DIMENSÃO ENTRA PELO CONSTRUTOR E MUDA NO `reset`, e não existe um
  // gerador "atual" global. Um módulo com estado de dimensão seria compartilhado
  // entre o worker e o modo inline, e os dois já convivem no mesmo processo
  // quando o worker cai — o mundo sairia meio Nether, meio overworld.
  dimensao = DIMENSAO_PADRAO,
  renderDistance = 8,
  emit = () => {},
  // ⚠️ RELÓGIO INJETÁVEL. O orçamento do `tick` é em milissegundos de parede,
  // então quantos trabalhos drenam por tick depende da máquina e da carga — e a
  // ORDEM em que a malha sai depende disso. O teste de ordem passava em cinco
  // execuções seguidas e reprovava na sexta, dentro da suíte completa, por
  // 0,12 de diferença. Guarda que oscila é pior que guarda nenhuma: ensina a
  // ignorar o vermelho. Com um relógio de mentira o teste vira determinístico
  // sem mexer em nada da produção.
  agora = Date.now,
} = {}) {
  const world = createWorld(seed)
  const nz = createNoiseContext(seed)
  // O overworld continua com o `nz` daqui (bioma e altura o consultam fora da
  // geração); as outras dimensões vêm de `geradores.js`.
  let outros = { nether: criarGerador(seed, 'nether'), end: criarGerador(seed, 'end') }
  let dimensaoAtual = dimensao
  /** O gerador da dimensão de agora. Uma decisão, num lugar. */
  const gerar = (cx, cz) =>
    outros[dimensaoAtual] ? outros[dimensaoAtual](cx, cz) : generateChunkData(nz, cx, cz)
  // `sy` é a SEÇÃO em que o jogador está, não só o chunk. Ver PESO_VERTICAL.
  let center = { cx: NaN, cz: NaN, sy: 4 } // NaN força o primeiro setCenter a valer
  let distance = renderDistance

  // filas de trabalho, sempre processadas do mais perto pro mais longe
  const genQueue = []
  const lightQueue = []
  // ⚠️ FILA SEPARADA PARA O QUE ESTÁ FORA DE ALCANCE (RC-05).
  //
  // O halo — a margem de chunks gerada ALÉM do raio, para que a borda tenha
  // vizinho — entra na fila de luz e nunca vira elegível: acender só acontece
  // até `distance + 1`. Como o job voltava para a MESMA fila, ela nunca
  // esvaziava, `tick` respondia "ainda tem trabalho" para sempre, e o `pump` do
  // worker reagendava a cada 0 ms com o jogador PARADO. O `emit({t:'idle'})`
  // existe desde sempre no worker e nunca era alcançado.
  //
  // O que muda: adiado por VIZINHO AUSENTE é trabalho pendente de verdade e
  // continua na fila principal; adiado por DISTÂNCIA espera aqui, sem manter o
  // pipeline acordado, até o jogador andar (`setCenter`) ou a distância mudar.
  const lightForaDeAlcance = []
  // Chunks cuja LUZ já foi espelhada pra thread principal. Ver `emitirLuz`.
  const luzEnviada = new Set()
  const meshQueue = []
  const queued = new Set()
  // "cx,sy,cz" já na fila de malha (evita malhar a mesma seção duas vezes
  // quando dois vizinhos acendem na mesma leva)
  const naMalha = new Set()
  // chunks acesos esperando a VIZINHANÇA acender pra poder virar malha
  const esperandoMalha = new Set()

  // ⚠️ MARGENS DE CARREGAMENTO. Três anéis, e cada um existe por um motivo:
  //
  //   distância + 0 → o que o jogador VÊ (precisa dos 8 vizinhos ACESOS)
  //   distância + 1 → acende (precisa dos 8 vizinhos GERADOS)
  //   distância + 2 → gera (é o vizinho gerado de quem acende)
  //
  // A margem era 1. Com a malha agora exigindo vizinho aceso, 1 deixaria o anel
  // visível sem nunca poder malhar: ele precisa que o anel de fora acenda, e
  // pra acender esse anel precisa de um anel gerado além dele. O custo é ~80
  // chunks a mais gerados a distância 8 — geração custa ~7 ms e eles nunca são
  // malhados, que é a parte cara.
  const MARGEM_GERAR = 2
  const MARGEM_SOLTAR = 2
  // Raio (em chunks) do espelho de luz mandado pra thread principal. 5 chunks =
  // 80 blocos, contra 46 de spawn e 72 de despawn de criatura. Ver `emitirLuz`.
  const RAIO_LUZ_CLIENTE = 5

  function pedirMalha(cx, sy, cz) {
    const k = `${cx},${sy},${cz}`
    if (naMalha.has(k)) return
    naMalha.add(k)
    meshQueue.push({ cx, sy, cz })
    malhaSuja = true
  }

  // ⚠️ A PRIORIDADE PRECISA DO EIXO VERTICAL, e a falta dele era um bug visível.
  //
  // `tryLight` empurra as 8 seções de um chunk na ordem sy = 0..7, e o sort do
  // JavaScript é ESTÁVEL: ordenando só por (cx, cz), as seções de um mesmo
  // chunk saem na ordem em que entraram, ou seja de baixo pra cima. Num pico a
  // y=116 o jogador está na seção 7 - a ÚLTIMA das oito a ser malhada. O
  // terreno em volta dele aparecia em lajes horizontais empilhadas, com vão
  // entre elas, enquanto o subsolo que ninguém vê já estava pronto (relato do
  // founder com print, 2026-08-22).
  //
  // Peso 1.5, e não 1: uma seção tem 16 blocos de altura e um chunk 16 de lado,
  // então 1 seria isotrópico em metros. Olhando na horizontal, porém, você
  // enxerga dezenas de chunks de largura e duas ou três seções de altura. Com
  // 1.5, estar uma seção acima custa o mesmo que estar 1,5 chunk de distância:
  // o anel imediato do SEU nível vem primeiro, e o andar de baixo ainda chega
  // antes de você olhar pro pé da montanha.
  const PESO_VERTICAL = 1.5

  const prioridade = (cx, cz, sy) => {
    if (Number.isNaN(center.cx)) return 0
    const dx = cx - center.cx
    const dz = cz - center.cz
    // trabalho sem seção (geração, luz) é um chunk inteiro: só distância no plano
    const ds = sy === undefined ? 0 : (sy - center.sy) * PESO_VERTICAL
    return dx * dx + dz * dz + ds * ds
  }
  const porPrioridade = (a, b) => prioridade(a.cx, a.cz, a.sy) - prioridade(b.cx, b.cz, b.sy)

  // Reordenar 2 mil itens a cada tick custa mais que o trabalho em si. Só vale
  // reordenar quando a fila mudou ou quando o jogador se moveu.
  let genSuja = false
  let luzSuja = false
  let malhaSuja = false

  function enqueueGen(cx, cz) {
    const k = chunkKey(cx, cz)
    if (queued.has(k) || world.chunks.has(k)) return
    queued.add(k)
    genQueue.push({ cx, cz })
    genSuja = true
  }

  // Acender exige os 8 vizinhos GERADOS: a semeadura de skylight e o BFS leem a
  // coluna do chunk ao lado.
  //
  // ⚠️ ACENDER NÃO LIBERA MALHA. Era o que este método fazia, e era o defeito:
  // as 8 seções iam direto pra fila de malha, e a malha lê a LUZ dos vizinhos.
  // Vizinho gerado mas apagado é um array de zeros. Agora acender só coloca o
  // chunk (e os 8 vizinhos, que podem ter acabado de completar a vizinhança
  // deles) na sala de espera; quem libera é `promoverMalhas`.
  function tryLight(cx, cz) {
    const c = world.chunks.get(chunkKey(cx, cz))
    if (!c || !c.generated || c.lit) return false
    if (!neighborsReady(world, cx, cz)) return false
    lightChunk(world, c)

    // ⚠️ NÃO É PRECISO REMALHAR VIZINHO JÁ MALHADO AQUI, e a razão é geométrica.
    //
    // A luz de `c` escorre pros vizinhos (`spreadSky` escreve em coordenada
    // global). A pergunta é se ela pode sujar uma malha JÁ ENTREGUE. Não pode:
    //
    //   · uma malha só sai quando o 3×3 em volta dela está aceso;
    //   · o mesher lê o chunk A mais 1 bloco de moldura, ou seja x,z ∈ [−1, 16]
    //     em coordenada local de A;
    //   · todo chunk FORA do 3×3 de A começa em x ≥ 32 ou termina em x ≤ −17,
    //     logo está a 16 blocos ou mais dessa moldura;
    //   · luz nível 15 alcança 14 células a partir da fonte (cada passo custa
    //     ≥1 e ela morre em 1). 14 < 16.
    //
    // Portanto: se A foi malhado, todo chunk que ainda pode acender está longe
    // demais pra mexer no que A leu. Uma versão anterior tinha o laço de
    // remalha aqui e a mutação mostrou que ele era inalcançável — código morto
    // que parecia proteção. O registro de toque continua existindo, e serve pra
    // EDIÇÃO (ver `edit`), onde o alcance da luz é o mesmo mas a malha ao redor
    // já está toda entregue.

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) esperandoMalha.add(chunkKey(cx + dx, cz + dz))
    }
    emitirLuz(cx, cz, true)
    return true
  }

  /**
   * Espelha a LUZ de um chunk pra thread principal — mas só perto do jogador.
   *
   * A luz mora aqui, no worker. A thread principal precisava dela pra decidir
   * onde criatura nasce, e não tinha: `lightAt: () => 15` numa linha do
   * componente anulava as 430 linhas de `mobs.js`. Nada hostil nascia, nunca, e
   * a noite não tinha perigo nenhum.
   *
   * O espelho é BARATO porque é limitado: 32 KB por chunk, e o spawn só olha de
   * 14 a 46 blocos do jogador (`MIN_SPAWN_DIST`/`MAX_SPAWN_DIST`), com despawn
   * em 72. `RAIO_LUZ_CLIENTE = 5` chunks cobre 80 blocos com folga e custa
   * ~3,9 MB — contra ~27 MB se fosse o raio de renderização inteiro.
   */
  function emitirLuz(cx, cz, forcar = false) {
    if (chunkDistance(cx, cz, center.cx, center.cz) > RAIO_LUZ_CLIENTE) return
    const key = chunkKey(cx, cz)
    if (!forcar && luzEnviada.has(key)) return
    const c = world.chunks.get(key)
    if (!c || !c.lit) return
    const copia = c.light.slice()
    emit({ t: 'luz', cx, cz, light: copia }, [copia.buffer])
    luzEnviada.add(key)
  }

  // Tira da sala de espera todo chunk cuja vizinhança já está acesa.
  function promoverMalhas() {
    if (!esperandoMalha.size) return
    for (const k of [...esperandoMalha]) {
      const c = world.chunks.get(k)
      if (!c) {
        esperandoMalha.delete(k)
        continue
      }
      if (!c.lit || !neighborsLit(world, c.cx, c.cz)) continue
      esperandoMalha.delete(k)
      c.malhado = true
      for (let sy = 0; sy < SECTION_COUNT; sy++) {
        if (c.nonEmpty[sy]) pedirMalha(c.cx, sy, c.cz)
      }
    }
  }

  /**
   * ⚠️ O SELO COBRE OS 9 CHUNKS, porque é isso que a vizinhança contém.
   *
   * O cache era chaveado por `(cx, cz, stamp do chunk central)`. Mas
   * `buildNeighborhood` copia o chunk central MAIS a moldura dos 8 vizinhos:
   * mudar o vizinho envelhece a vizinhança guardada sem mexer no `stamp` do
   * central, e o cache respondia com dado velho.
   *
   * ⚠️ HONESTIDADE SOBRE A COBERTURA: nenhum teste distingue este selo da
   * chave antiga. Tentei três construções pra fazer a chave antiga falhar —
   * duas edições em chunks vizinhos, uma fileira de tochas atravessando duas
   * divisas, e uma edição no anel aceso-mas-não-malhado pra forçar conjunto de
   * remalha de um chunk só. Todas passam com a chave antiga. O motivo é que a
   * fila serve o chunk mais perto primeiro, então entre duas malhas do mesmo
   * chunk quase sempre entra outro e o cache se refaz sozinho.
   *
   * O selo fica assim mesmo. A alternativa é depender de "a ordem da fila de
   * prioridade sempre intercala outro chunk", que não é invariante de nada —
   * é uma propriedade emergente de três heurísticas que alguém vai mexer. O
   * selo torna o cache correto por construção, e custa 9 buscas em Map por
   * seção contra uma montagem de vizinhança que copia 324 colunas. Ruído.
   */
  function seloDaVizinhanca(cx, cz) {
    let s = 0
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        s = (s * 31 + (world.chunks.get(chunkKey(cx + dx, cz + dz))?.stamp || 0)) | 0
      }
    }
    return s
  }

  function meshOne(cx, sy, cz) {
    // Sai da fila ANTES de qualquer retorno: se sair só no fim, a seção de um
    // chunk descarregado fica marcada como "já enfileirada" pra sempre e nunca
    // mais pode ser malhada quando o chunk voltar.
    naMalha.delete(`${cx},${sy},${cz}`)
    const c = world.chunks.get(chunkKey(cx, cz))
    if (!c) return
    // A vizinhança é cara de montar; reaproveitar entre as 8 seções do mesmo
    // chunk economiza 7/8 do custo quando a fila está agrupada.
    const selo = seloDaVizinhanca(cx, cz)
    if (!meshOne._nb || meshOne._nb.cx !== cx || meshOne._nb.cz !== cz || meshOne._selo !== selo) {
      meshOne._nb = buildNeighborhood(world, cx, cz)
      meshOne._acc = neighborhoodAccessor(meshOne._nb)
      meshOne._selo = selo
    }
    const r = meshSection(meshOne._acc, cx, sy, cz)
    const transfer = []
    for (const key of ['opaque', 'cutout', 'transparent']) {
      const g = r[key]
      if (!g) continue
      transfer.push(
        g.position.buffer,
        g.normal.buffer,
        g.uv.buffer,
        g.layer.buffer,
        g.light.buffer,
        g.tint.buffer,
        g.wind.buffer,
        g.index.buffer,
      )
    }
    emit({ t: 'mesh', cx, sy, cz, ...r }, transfer)
    c.dirty.delete(sy)
  }

  /**
   * Este chunk mudou: quem tiver vizinhança guardada que o inclua vai perceber
   * pelo selo (ver `seloDaVizinhanca`). Aqui só se anota a mudança.
   */
  function touch(cx, cz) {
    const c = world.chunks.get(chunkKey(cx, cz))
    if (c) c.stamp = (c.stamp || 0) + 1
  }

  function generateOne(cx, cz) {
    const c = createChunk(cx, cz)
    const g = gerar(cx, cz)
    instalarBlocos(c, g.blocks)
    c.heights = g.heights
    c.biomes = g.biomes
    c.generated = true
    putChunk(world, c)
    applyEdits(world, c)
    recomputeHeightmap(c)
    // A fila de luz existia e nunca era usada: a luz era escolhida varrendo
    // `world.chunks.values()`, que é ORDEM DE INSERÇÃO, não de distância. Como
    // a luz é o portão da malha, o chunk debaixo do seu pé podia esperar atrás
    // de um do outro lado do raio.
    lightQueue.push({ cx, cz })
    luzSuja = true
    queued.delete(chunkKey(cx, cz))
    // a thread principal precisa dos blocos pra colisão/raycast
    const copy = c.blocks.slice()
    // `c.height` (do recomputeHeightmap) é o topo OPACO real; `c.heights` é a
    // altura teórica do ruído. Com densidade 3D os dois divergem, e quem faz
    // colisão, spawn de mob e exposição ao céu precisa do real.
    emit(
      // A PALETA VAI JUNTO. `copy` guarda indice, nao id global, e o indice so
      // significa alguma coisa ao lado da paleta do MESMO chunk. Mandar um sem
      // o outro daria um mundo de blocos trocados do lado do cliente, sem erro
      // nenhum: pedra onde era folha, e a colisao concordando com o engano.
      {
        t: 'chunk',
        cx,
        cz,
        blocks: copy,
        paleta: serializarPaleta(c.paleta),
        biomes: c.biomes.slice(),
        heights: c.height.slice(),
      },
      [copy.buffer],
    )
    return c
  }

  // ── API ───────────────────────────────────────────────────────────────────

  function setCenter(cx, cz, sy) {
    const mesmaSecao = sy === undefined || sy === center.sy
    if (cx === center.cx && cz === center.cz && mesmaSecao) return
    center = {
      cx,
      cz,
      // Sem `sy` (chamador antigo) mantém o que tinha, e no primeiro centro
      // assume o meio do mundo em vez de zero - zero é o fundo da rocha.
      sy: sy === undefined ? center.sy : Math.max(0, Math.min(SECTION_COUNT - 1, sy | 0)),
    }
    // O jogador se moveu: toda prioridade guardada nas filas envelheceu, e o
    // que estava fora de alcance pode ter entrado (RC-05).
    religarLuzForaDeAlcance()
    genSuja = true
    luzSuja = true
    malhaSuja = true
    refresh()
  }

  function setDistance(d) {
    distance = Math.max(2, Math.min(24, d | 0))
    religarLuzForaDeAlcance()
    luzSuja = true
    refresh()
  }

  /** Devolve à fila de luz o que esperava por alcance. Barato: a fila é curta. */
  function religarLuzForaDeAlcance() {
    if (!lightForaDeAlcance.length) return
    lightQueue.push(...lightForaDeAlcance)
    lightForaDeAlcance.length = 0
  }

  // Enfileira o que falta e descarrega o que saiu do raio (+2 de histerese, pra
  // não ficar carregando e descarregando na borda quando o jogador anda em
  // ziguezague).
  function refresh() {
    const load = distance + MARGEM_GERAR
    for (let dx = -load; dx <= load; dx++) {
      for (let dz = -load; dz <= load; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) > load) continue
        enqueueGen(center.cx + dx, center.cz + dz)
      }
    }
    genSuja = true
    for (const key of [...world.chunks.keys()]) {
      const { cx, cz } = parseChunkKey(key) || {}
      if (cx === undefined) continue
      if (chunkDistance(cx, cz, center.cx, center.cz) > load + MARGEM_SOLTAR) {
        dropChunk(world, cx, cz)
        esperandoMalha.delete(key)
        luzEnviada.delete(key)
        emit({ t: 'unload', cx, cz })
      } else if (chunkDistance(cx, cz, center.cx, center.cz) > RAIO_LUZ_CLIENTE) {
        // saiu do raio da luz: esquece, pra reenviar se o jogador voltar
        luzEnviada.delete(key)
      }
    }
    // O jogador andou: chunks que ENTRARAM no raio da luz precisam ser
    // espelhados. `tryLight` só cobre quem acende agora — quem já estava aceso
    // lá fora e só ficou perto depende desta varredura.
    for (let dx = -RAIO_LUZ_CLIENTE; dx <= RAIO_LUZ_CLIENTE; dx++) {
      for (let dz = -RAIO_LUZ_CLIENTE; dz <= RAIO_LUZ_CLIENTE; dz++) {
        emitirLuz(center.cx + dx, center.cz + dz)
      }
    }
  }

  /**
   * Processa até `budgetMs` de trabalho. Chamar em laço no worker.
   * Devolve true se ainda há trabalho.
   */
  function tick(budgetMs = 8) {
    const t0 = agora()
    const noPrazo = () => agora() - t0 < budgetMs
    let did = false

    // 0. Quem acendeu no tick passado pode ter completado a vizinhança de
    // alguém. Barato (só percorre a sala de espera) e tem que vir antes da
    // malha, senão a liberação sempre atrasa um tick.
    promoverMalhas()

    // 1. MALHA primeiro: é o único passo que o jogador VÊ chegar.
    if (malhaSuja) {
      meshQueue.sort(porPrioridade)
      malhaSuja = false
    }
    while (meshQueue.length && noPrazo()) {
      const job = meshQueue.shift()
      meshOne(job.cx, job.sy, job.cz)
      did = true
    }

    // 2. LUZ, que é o portão da malha, na mesma ordem de prioridade.
    //
    // Antes isto varria `world.chunks.values()` e acendia UM por tick, com
    // `break`. Dois problemas: a ordem era de inserção (não de distância), e um
    // por tick é um teto de vazão que fazia o anel próximo esperar atrás de
    // chunks distantes. Agora a fila é ordenada e o passo respeita o orçamento.
    if (lightQueue.length && noPrazo()) {
      if (luzSuja) {
        lightQueue.sort(porPrioridade)
        luzSuja = false
      }
      const adiados = []
      while (lightQueue.length && noPrazo()) {
        const job = lightQueue.shift()
        const c = world.chunks.get(chunkKey(job.cx, job.cz))
        // sumiu do mundo ou já foi aceso por outro caminho: some da fila
        if (!c || !c.generated || c.lit) continue
        if (chunkDistance(job.cx, job.cz, center.cx, center.cz) > distance + 1) {
          lightForaDeAlcance.push(job)
          continue
        }
        // Precisa dos 8 vizinhos: o AO e o culling da borda leem o chunk ao
        // lado. Volta pra fila em vez de ser descartado.
        if (!neighborsReady(world, job.cx, job.cz)) {
          adiados.push(job)
          continue
        }
        tryLight(job.cx, job.cz)
        did = true
      }
      if (adiados.length) {
        // Reentram na frente: já estavam ordenados, e um deles pode virar
        // elegível no próximo tick sem ter que esperar a fila inteira.
        lightQueue.unshift(...adiados)
      }
    }

    // 3. GERAÇÃO por último: é o que alimenta os dois passos acima.
    if (genSuja) {
      genQueue.sort(porPrioridade)
      genSuja = false
    }
    while (genQueue.length && noPrazo()) {
      const job = genQueue.shift()
      if (
        chunkDistance(job.cx, job.cz, center.cx, center.cz) >
        distance + MARGEM_GERAR + MARGEM_SOLTAR
      ) {
        queued.delete(chunkKey(job.cx, job.cz))
        continue
      }
      generateOne(job.cx, job.cz)
      did = true
    }
    return did || genQueue.length > 0 || meshQueue.length > 0 || lightQueue.length > 0
  }

  /**
   * ⚠️ QUEM MUDOU DE LUZ TEM QUE REMALHAR — e `markDirty` sozinho não sabia
   * quem mudou.
   *
   * `updateLightAt` marca as seções afetadas varrendo um RETICULADO de offsets
   * (`dx += CHUNK_SIZE` a partir de −15), o que dá dx ∈ {−15, +1}. Para uma
   * tocha no meio de um chunk isso cobre o chunk anterior e o próprio, mas
   * **não** o chunk que começa em x+15 — que a luz alcança. O sintoma é uma
   * faixa com a luz velha na divisa, do mesmo tipo que o defeito de 2026-08-23,
   * só que disparada por uma tocha em vez de pelo carregamento.
   *
   * Em vez de esticar o reticulado (chutar mais largo, remalhar mais que o
   * necessário), o pipeline lê o registro EXATO de quem a propagação tocou.
   */
  function malharTocadasPelaLuz() {
    const toques = toquesDaLuz()
    // A luz mudou: o espelho da thread principal envelheceu junto. Sem isto,
    // acender uma tocha deixava de impedir spawn até o chunk recarregar.
    const reenviar = new Set()
    for (let i = 0; i < toques.length; i += 2) reenviar.add(toques[i])
    for (const c of reenviar) emitirLuz(c.cx, c.cz, true)
    for (let i = 0; i < toques.length; i += 2) {
      const c = toques[i]
      const sy = toques[i + 1]
      const m = c.luzMexida[sy]
      touch(c.cx, c.cz) // a luz mudou aqui: a vizinhança guardada envelheceu
      // A moldura do mesher tem 1 bloco: só quem encostou na borda arrasta o
      // vizinho junto. Os bits dizem qual borda — nada de remalhar 26 à toa.
      //
      // ⚠️ SOMA, NÃO ESCOLHA. A primeira versão era `m & xBaixo ? [0,-1] : m &
      // xAlto ? [0,1] : [0]`, e uma seção varrida de ponta a ponta pela luz
      // encosta nas DUAS bordas: o ternário pegava a primeira e jogava a
      // segunda fora. Foi exatamente o que sobrou no teste da tocha — a coluna
      // x=15 do chunk 0 mudava em y=64, o lado +x era descartado, e a seção
      // (1,3,0) ficava com a luz velha na moldura.
      const eixo = (baixo, alto) => {
        const d = [0]
        if (m & baixo) d.push(-1)
        if (m & alto) d.push(1)
        return d
      }
      const exs = eixo(TOQUE.xBaixo, TOQUE.xAlto)
      const ezs = eixo(TOQUE.zBaixo, TOQUE.zAlto)
      const eys = eixo(TOQUE.yBaixo, TOQUE.yAlto)
      for (const dx of exs) {
        for (const dz of ezs) {
          const alvo = world.chunks.get(chunkKey(c.cx + dx, c.cz + dz))
          if (!alvo || !alvo.malhado) continue
          for (const dy of eys) {
            const s = sy + dy
            if (s < 0 || s >= SECTION_COUNT || !alvo.nonEmpty[s]) continue
            pedirMalha(alvo.cx, s, alvo.cz)
          }
        }
      }
    }
  }

  // Edição de bloco (jogador ou remoto). Relumina e enfileira as seções sujas.
  function edit(x, y, z, id) {
    setBlock(world, x, y, z, id)
    touch(toChunkCoord(x), toChunkCoord(z))
    updateLightAt(world, x, y, z)
    malharTocadasPelaLuz()
    for (const key of world.dirtySections) {
      const [cx, sy, cz] = key.split(',').map(Number)
      const c = world.chunks.get(chunkKey(cx, cz))
      if (!c) continue
      touch(cx, cz)
      pedirMalha(cx, sy, cz)
    }
    world.dirtySections.clear()
  }

  function editBatch(list) {
    for (const e of list) {
      setBlock(world, e.x, e.y, e.z, e.id)
      touch(toChunkCoord(e.x), toChunkCoord(e.z))
    }
    for (const e of list) {
      updateLightAt(world, e.x, e.y, e.z)
      // dentro do laço: `updateLightAt` zera o registro a cada chamada
      malharTocadasPelaLuz()
    }
    for (const key of world.dirtySections) {
      const [cx, sy, cz] = key.split(',').map(Number)
      if (!world.chunks.has(chunkKey(cx, cz))) continue
      touch(cx, cz)
      pedirMalha(cx, sy, cz)
    }
    world.dirtySections.clear()
  }

  // Semeia os edits de um save/sala ANTES de gerar (assim já nascem aplicados).
  function seedEdits(editsMap) {
    for (const [key, m] of editsMap) world.edits.set(key, new Map(m))
  }

  function reset(newSeed, editsMap, novaDimensao) {
    world.chunks.clear()
    world.edits.clear()
    world.dirtySections.clear()
    genQueue.length = 0
    meshQueue.length = 0
    lightQueue.length = 0
    lightForaDeAlcance.length = 0
    queued.clear()
    naMalha.clear()
    esperandoMalha.clear()
    meshOne._nb = null
    meshOne._selo = null
    if (newSeed != null) {
      world.seed = newSeed
      Object.assign(nz, createNoiseContext(newSeed))
      outros = { nether: criarGerador(newSeed, 'nether'), end: criarGerador(newSeed, 'end') }
    }
    if (novaDimensao) dimensaoAtual = novaDimensao
    if (editsMap) seedEdits(editsMap)
    refresh()
  }

  return {
    world,
    get dimensao() {
      return dimensaoAtual
    },
    setCenter,
    setDistance,
    refresh,
    tick,
    edit,
    editBatch,
    seedEdits,
    reset,
    get pending() {
      return genQueue.length + meshQueue.length
    },
  }
}

export { CHUNK_SIZE, SECTION_COUNT, SECTION_HEIGHT, toChunkCoord, toLocalCoord, localIndex }
