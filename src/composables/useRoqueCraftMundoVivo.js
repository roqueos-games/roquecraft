// RoqueCraft - O MUNDO QUE SE MEXE: edicao, fluido, gravidade e cerca.
//
// A fila diz QUEM reavaliar; `gravidade.js` diz se cai e ate onde; `quedas.js`
// segura quem esta no ar; `fluidos.js` decide o nivel. Nada disso mora aqui -
// aqui mora a LIGACAO entre eles e o mundo, mais o registro de edicoes que vai
// pro save.
//
// E COMPOSABLE E NAO SERVICO porque e dono de estado que vive enquanto a
// partida vive: a fila de atualizacoes, o registro de quedas no ar, o mapa de
// edicoes do save, e o interruptor de congelamento do QA.
//
// ⚠️ O CONTRATO E CURTO DE PROPOSITO: cinco entradas. `world` e `motor` sao
// `let` do componente (recriados em troca de qualidade e mundo novo), entao
// entram por getter.

import { criarFila } from '../servicos/atualizacoes.js'
import { ehPortal, apagar as apagarPortal } from '../servicos/portal.js'
import {
  ehPo,
  ehTocha,
  ehLampada,
  recalcularRede,
  proximoDaTocha,
  proximoDaLampada,
  celulasAAcordar,
} from '../servicos/redstone.js'
import { criarQuedas } from '../servicos/quedas.js'
import { criarRegistroDeEdicoes } from '../servicos/edicoes.js'
import { vaiCair, destinoDaQueda, atravessa } from '../servicos/gravidade.js'
import { proximoId, viraFonte, encontro, OS_FLUIDOS } from '../servicos/fluidos.js'
import {
  AIR,
  ID,
  blockDef,
  BLOCO_DA_CERCA,
  BLOCO_DO_PORTAO,
  BITS_DA_CERCA,
  VARIANTE_DE_CERCA,
} from '../servicos/blocks.js'
import { blockTintColor } from '../servicos/aparencia.js'
import {
  crescer,
  estaMadura,
  estagioDe,
  perdeuOChao,
  mudaVaiCrescer,
  mudaSemChao,
  soloComAgua,
  ehSoloDeLavoura,
  precisaDeRelogioDeLavoura,
  frutoDoCauleMaduro,
  ladoParaOFruto,
  seguraFruto,
  CHANCE_DE_FRUTIFICAR,
  canaVaiCrescer,
  chaoDeCana,
  ALTURA_DA_CANA,
  RAIO_DE_HIDRATACAO,
  ALTURA_MINIMA_DA_ARVORE,
  TIQUES_ENTRE_TENTATIVAS,
} from '../servicos/agricultura.js'
import { celulasDaArvore } from '../servicos/worldgen.js'
import {
  chunkKey,
  parseChunkKey,
  toChunkCoord,
  toLocalCoord,
  localIndex,
  CHUNK_SIZE,
} from '../servicos/constants.js'
import { unpackLocalIndex } from '../servicos/chunkStore.js'

/** Forca da onda que uma edicao encostada na lamina provoca. */
export const ONDA_DA_EDICAO = 0.09

/**
 * @param {object} ctx
 * @param {() => object} ctx.world  GETTER: o cliente do mundo
 * @param {() => object} ctx.motor  GETTER: o engine de render
 * @param {object} ctx.rede  `{ ativo, codigo, publicar }` - em sala, a edicao
 *   vai pra rede. O TRANSPORTE entra por parametro, e nao por import: assim
 *   este arquivo nao arrasta o boot do Firebase (que exige variavel de ambiente
 *   na carga do modulo) e pode ser testado sem o jogo montado.
 * @param {() => void} ctx.guardar  agenda o autosave
 * @param {Function} ctx.soltarItem  bloco que caiu em cima de algo vira item
 * @param {Function} ctx.luzEm  luz 0..15 na celula, ou `null` se o pedaco do
 *   mundo nao esta espelhado aqui. Entra por parametro porque depende da HORA
 *   do dia, que e `let` do componente: ler `luzCombinada` com fator 1 daria
 *   lavoura crescendo a noite.
 */
export function useRoqueCraftMundoVivo({
  world,
  motor,
  rede,
  guardar,
  soltarItem,
  // O padrão é "NÃO SEI", e não 15. Quem não passa `luzEm` (um teste de fluido,
  // por exemplo) não deve ganhar de brinde uma lavoura crescendo a pleno sol —
  // deve ganhar uma lavoura que não anda, que é a verdade do que ele montou.
  luzEm = () => null,
  // ⚠️ O SORTEIO ENTRA POR PARÂMETRO por causa de TESTE FLAKY, não por gosto.
  //
  // Crescimento é sorteado (25% no trigo, 4% na muda), e um teste que espera
  // "virou espiga" depois de N visitas passa quase sempre e reprova de vez em
  // quando — foi o que aconteceu no pre-push: `expected 168 to be 170`, com o
  // código certo. Teste que reprova 2% das vezes é pior que teste nenhum: ele
  // ensina a ignorar vermelho.
  sorteio = Math.random,
}) {
  // O worker e dono do mundo, mas o SAVE e o `reset` (troca de qualidade, entrar
  // e sair de sala) precisam dos edits do lado de ca. O cliente mantem o mesmo
  // mapa: "cx,cz" -> Map<indiceLocal, id>. Custa uma entrada por bloco editado.
  const registroDeEdicoes = criarRegistroDeEdicoes({
    chunkKey,
    // Ler a chave de volta e a MESMA decisao que escreve-la, e por isso as duas
    // entram juntas em vez de o arquivo remontar o parser a mao.
    parseChunkKey,
    toChunkCoord,
    toLocalCoord,
    localIndex,
  })
  const fila = criarFila()
  const quedasNoAr = criarQuedas()

  // So pro QA: congelar a queda no ar. Um bloco caindo anda onze blocos por
  // segundo, e entre projetar a posicao e o obturador abrir ele ja saiu do
  // recorte - a sonda mediu ceu tres vezes achando que media areia. Com a cena
  // parada, mira e medida falam do mesmo instante.
  let quedasCongeladas = false

  const lerBloco = (x, y, z) => world().getBlock(x, y, z)
  /** Fonte e o liquido de sempre - agua id 21, lava id 22. O resto tem nivel. */
  const ehFonteDe = (fluido) => (x, y, z) => world().getBlock(x, y, z) === fluido.fonte

  function editar(x, y, z, id) {
    const w = world()
    const eng = motor()
    // Mexer num bloco encostado na lamina faz onda. E de graca (o mundo ja sabe
    // se tem liquido em volta) e e o tipo de detalhe que separa "tem agua" de
    // "a agua esta ali".
    if (
      eng &&
      (w.liquidAt(x, y + 1, z) ||
        w.liquidAt(x + 1, y, z) ||
        w.liquidAt(x - 1, y, z) ||
        w.liquidAt(x, y, z + 1) ||
        w.liquidAt(x, y, z - 1))
    ) {
      eng.ondularAgua(x + 0.5, z + 0.5, ONDA_DA_EDICAO)
    }
    w.edit(x, y, z, id)
    // Toda edicao do mundo acorda a vizinhanca. E por aqui que a areia descobre
    // que perdeu o apoio - e por aqui que ela descobre INDEPENDENTE de como
    // perdeu: quebrando, com `fill`, ou porque outra areia pousou embaixo.
    fila.agendarVizinhos(x, y, z)
    if (rede.ativo()) {
      rede.publicar(rede.codigo(), x, y, z, id)
    } else {
      registroDeEdicoes.registrar(x, y, z, id)
      guardar()
    }
  }

  /**
   * Escreve uma celula de fluido.
   *
   * ⚠️ NAO passa por `editar`, e isto e o ponto inteiro. `editar` registra a
   * edicao no save e publica no multijogador - e o fluido muda MILHARES de
   * celulas ao encher uma cova. Registrar tudo isso encheria o save de estado
   * derivado e afogaria a rede.
   *
   * O que se guarda e a FONTE; o resto se recalcula. E por isso que o nivel e
   * uma funcao dos vizinhos: carregar o mundo e reagendar as fontes reproduz o
   * rio inteiro sem ter gravado uma gota dele.
   *
   * O atraso dos vizinhos E a velocidade do fluxo - cinco tiques na agua,
   * trinta na lava. Sem ele o lago inteiro se espalha num quadro.
   */
  function escreverFluido(x, y, z, id, tiques) {
    world().edit(x, y, z, id)
    fila.agendarEm(x, y, z, tiques)
    fila.agendarEm(x, y + 1, z, tiques)
    fila.agendarEm(x, y - 1, z, tiques)
    fila.agendarEm(x + 1, y, z, tiques)
    fila.agendarEm(x - 1, y, z, tiques)
    fila.agendarEm(x, y, z + 1, tiques)
    fila.agendarEm(x, y, z - 1, tiques)
  }

  /**
   * A cerca olha os quatro lados e vira a variante certa.
   *
   * ⚠️ RODA NA MESMA FILA QUE FAZ A AREIA CAIR, e e o ponto inteiro: quem coloca
   * ou quebra um bloco ja acorda os vizinhos por `editar`. Uma cerca colocada
   * ao lado de outra e acordada, se reconecta, e as duas se encontram - sem
   * nenhum codigo de "avisar as cercas em volta" espalhado pelo componente.
   *
   * ⚠️ E SO ESCREVE QUANDO MUDA. `editar` acorda os vizinhos de novo; escrever
   * o mesmo id a cada visita faria a fila se realimentar pra sempre e o mundo
   * ficaria gravando edicao identica no save, uma por quadro.
   */
  function reconectarCerca(x, y, z) {
    const w = world()
    const chave = BLOCO_DA_CERCA[blockDef(w.getBlock(x, y, z))?.key]
    if (!chave) return false
    const liga = (bx, by, bz) => {
      const def = blockDef(w.getBlock(bx, by, bz))
      if (!def) return false
      // Liga em cerca, em PORTAO e em bloco cheio e opaco. Sem o portao nesta
      // lista, a cerca ao lado dele nasceria com a ponta solta e o curral teria
      // um vao visivel bem na entrada.
      return !!BLOCO_DA_CERCA[def.key] || !!BLOCO_DO_PORTAO[def.key] || (def.opaque && def.solid)
    }
    let bits = 0
    if (liga(x, y, z - 1)) bits |= BITS_DA_CERCA.nz
    if (liga(x + 1, y, z)) bits |= BITS_DA_CERCA.px
    if (liga(x, y, z + 1)) bits |= BITS_DA_CERCA.pz
    if (liga(x - 1, y, z)) bits |= BITS_DA_CERCA.nx
    const alvo = ID[VARIANTE_DE_CERCA[`${chave}|${bits}`]]
    if (alvo === undefined || alvo === w.getBlock(x, y, z)) return false
    editar(x, y, z, alvo)
    return true
  }

  /**
   * A LAVOURA: cresce, ou morre quando some o chão.
   *
   * ⚠️ ELA SE REAGENDA. A fila deste jogo é REATIVA — só acorda quem tem um
   * vizinho mexido —, e plantação não tem vizinho mexendo: ela cresce sozinha,
   * com o mundo parado em volta. Quem mantém o relógio andando é a própria
   * visita, que se repõe na fila com atraso enquanto houver o que crescer.
   *
   * A cadeia para sozinha quando a espiga fica madura: nada mais a fazer ali
   * até alguém colher. Se o solo for quebrado depois disso, `editar` acorda a
   * vizinhança (inclusive esta célula) e o talo cai aqui mesmo.
   */
  function cuidarDaLavoura(x, y, z) {
    const w = world()
    const id = w.getBlock(x, y, z)
    if (estagioDe(id) === null) return false
    const solo = w.getBlock(x, y - 1, z)
    if (perdeuOChao(id, solo)) {
      const def = blockDef(id)
      editar(x, y, z, AIR)
      if (def?.drops) soltarItem(def.drops, 1, x + 0.5, y + 0.3, z + 0.5, blockTintColor(def))
      return true
    }
    const proximo = crescer(id, { idSolo: solo, luz: luzEm(x, y, z), rng: sorteio })
    if (proximo !== null) editar(x, y, z, proximo)
    // O CAULE MADURO não para: ele passa a dar fruto ao lado, um de cada vez.
    if (frutificar(x, y, z, proximo ?? id)) return true
    if (!estaMadura(proximo ?? id)) fila.agendarEm(x, y, z, TIQUES_ENTRE_TENTATIVAS)
    return true
  }

  /**
   * A CANA, que sobe sozinha na margem.
   *
   * ⚠️ SÓ O TOPO CRESCE, e a conta de altura olha PRA BAIXO. Se cada bloco do
   * pé pudesse crescer, uma cana de três viraria três canas de três: o pé se
   * multiplicaria pra dentro de si mesmo. E o apoio (areia ou terra COM água
   * encostada) é medido na base do pé, não embaixo do topo — senão o segundo
   * bloco de cana, cujo "chão" é outra cana, nunca seria válido.
   */
  function cuidarDaCana(x, y, z) {
    const w = world()
    if (!blockDef(w.getBlock(x, y, z))?.cana) return false
    const ehTopo = !blockDef(w.getBlock(x, y + 1, z))?.cana
    let base = y
    while (blockDef(w.getBlock(x, base - 1, z))?.cana) base--
    const chao = w.getBlock(x, base - 1, z)
    const aguaAoLado =
      w.liquidAt(x + 1, base - 1, z) ||
      w.liquidAt(x - 1, base - 1, z) ||
      w.liquidAt(x, base - 1, z + 1) ||
      w.liquidAt(x, base - 1, z - 1)
    const apoiada = chaoDeCana(chao, aguaAoLado)
    if (!apoiada) {
      // Perdeu a margem: o pé inteiro cai, de cima pra baixo, virando item.
      editar(x, y, z, AIR)
      soltarItem('sugarCane', 1, x + 0.5, y + 0.3, z + 0.5, 0xffffff)
      return true
    }
    if (
      canaVaiCrescer({
        ehTopo,
        alturaAtual: y - base + 1,
        acimaVazio: w.getBlock(x, y + 1, z) === AIR,
        apoiada,
        luz: luzEm(x, y, z),
        rng: sorteio,
      })
    ) {
      editar(x, y + 1, z, ID.sugarCane)
    }
    if (ehTopo && y - base + 1 < ALTURA_DA_CANA) fila.agendarEm(x, y, z, TIQUES_ENTRE_TENTATIVAS)
    return true
  }

  /**
   * O CANTEIRO que molha e seca.
   *
   * ⚠️ ELE SE REAGENDA COMO A LAVOURA, e pelo mesmo motivo: a água pode chegar
   * a quatro blocos de distância, e a fila só acorda quem tem vizinho IMEDIATO
   * mexido. Um balde despejado a três células daqui nunca acordaria este
   * canteiro — ele ficaria seco com um lago ao lado.
   *
   * O custo é uma visita por célula de canteiro a cada 3 s, e a leitura de um
   * quadrado 9×9 em duas alturas. Numa fazenda de 9×9 isso é o teto do que a
   * fila drena num tique — e é por isso que o raio não cresce além de quatro.
   */
  function cuidarDoSolo(x, y, z) {
    const w = world()
    const id = w.getBlock(x, y, z)
    if (!ehSoloDeLavoura(id)) return false
    let molhado = false
    const r = RAIO_DE_HIDRATACAO
    for (let dx = -r; dx <= r && !molhado; dx++) {
      for (let dz = -r; dz <= r && !molhado; dz++) {
        // Mesma altura e uma acima: a água que corre POR CIMA do canteiro
        // molha, a que está enterrada embaixo dele não.
        if (w.liquidAt(x + dx, y, z + dz) || w.liquidAt(x + dx, y + 1, z + dz)) molhado = true
      }
    }
    const alvo = soloComAgua(id, molhado)
    if (alvo !== null) editar(x, y, z, alvo)
    fila.agendarEm(x, y, z, TIQUES_ENTRE_TENTATIVAS)
    return true
  }

  /**
   * O CAULE MADURO dá fruto num dos quatro lados.
   *
   * ⚠️ E CONTINUA NA FILA DEPOIS DE DAR, ao contrário da lavoura comum, que
   * para quando amadurece. Um caule que saísse da fila ao dar a primeira
   * abóbora daria UMA abóbora na vida — o jogador colheria e ficaria com um
   * talo morto, que é o oposto do que a horta promete.
   *
   * Devolve `true` quando este caule é um caule de fruto (tenha frutificado ou
   * não), porque nesse caso quem cuida do reagendamento é esta função.
   */
  function frutificar(x, y, z, id) {
    const fruto = frutoDoCauleMaduro(id)
    if (!fruto) return false
    fila.agendarEm(x, y, z, TIQUES_ENTRE_TENTATIVAS)
    if (sorteio() >= CHANCE_DE_FRUTIFICAR) return true
    const w = world()
    const lados = [
      { dx: 1, dz: 0 },
      { dx: -1, dz: 0 },
      { dx: 0, dz: 1 },
      { dx: 0, dz: -1 },
    ].map((l) => ({
      ...l,
      vazio: w.getBlock(x + l.dx, y, z + l.dz) === AIR,
      chao: seguraFruto(w.getBlock(x + l.dx, y - 1, z + l.dz)),
    }))
    const escolhido = ladoParaOFruto(lados, sorteio)
    if (escolhido) editar(x + escolhido.dx, y, z + escolhido.dz, ID[fruto])
    return true
  }

  /**
   * A MUDA que vira árvore.
   *
   * Mesmo relógio da lavoura (a visita se repõe na fila), chance bem menor, e
   * uma condição a mais: CÉU. Sem contar o espaço livre acima, uma muda
   * plantada dentro de casa arrancaria o teto do jogador — e as folhas que o
   * `seAr` pula deixariam um tronco pelado no meio da sala.
   *
   * A FORMA da árvore vem de `worldgen.js`, a mesma que gera as do mapa. Duas
   * cópias da copa concordariam hoje e divergiriam depois.
   */
  function cuidarDaMuda(x, y, z) {
    const w = world()
    const id = w.getBlock(x, y, z)
    if (id !== ID.oakSapling) return false
    const solo = w.getBlock(x, y - 1, z)
    if (mudaSemChao(id, solo)) {
      editar(x, y, z, AIR)
      soltarItem('oakSapling', 1, x + 0.5, y + 0.3, z + 0.5, 0xffffff)
      return true
    }
    let livre = 0
    while (livre < ALTURA_MINIMA_DA_ARVORE + 4 && w.getBlock(x, y + 1 + livre, z) === AIR) livre++
    if (
      mudaVaiCrescer({
        idCelula: id,
        idSolo: solo,
        luz: luzEm(x, y, z),
        colunaLivre: livre,
        rng: sorteio,
      })
    ) {
      editar(x, y, z, AIR)
      for (const c of celulasDaArvore('oak', sorteio)) {
        const bx = x + c.dx
        const by = y + c.dy
        const bz = z + c.dz
        if (c.seAr && w.getBlock(bx, by, bz) !== AIR) continue
        editar(bx, by, bz, c.id)
      }
      return true
    }
    fila.agendarEm(x, y, z, TIQUES_ENTRE_TENTATIVAS)
    return true
  }

  /** Uma celula da fila: cerca, lavoura, muda, solo, gravidade, encontro, fluxo. */
  /**
   * O PORTAL SE APAGA QUANDO A MOLDURA QUEBRA.
   *
   * ⚠️ SEM ISTO O PLANO ROXO FICA PENDURADO NO AR — e, pior, atravessável: o
   * jogador viajaria por um portal que já não existe. A regra mora em
   * `portal.js`; aqui fica a visita.
   *
   * Entra ANTES de tudo na visita porque é o caso mais barato de descartar
   * (`ehPortal` é uma comparação de id) e porque uma célula de portal não é
   * nenhuma das outras coisas que a visita sabe tratar.
   */
  function apagarPortalOrfao(x, y, z) {
    if (!ehPortal(lerBloco(x, y, z))) return false
    const celulas = apagarPortal(lerBloco, x, y, z)
    if (!celulas.length) return false
    for (const c of celulas) editar(c.x, c.y, c.z, c.id)
    return true
  }

  /**
   * A REDSTONE, na fila.
   *
   * ⚠️ A FILA JÁ É O TIQUE DE MUNDO QUE A REDSTONE PEDIA. O plano listava "ordem
   * de tick" como trava; ela já estava resolvida desde a agricultura — toda
   * edição acorda a vizinhança, e `escrever` aqui acorda de novo. É o que faz a
   * mudança CORRER pelo circuito em vez de esperar alguém passar por perto.
   *
   * A tocha vira no ritmo da fila, e não no mesmo tique: é isso que permite
   * construir um oscilador (uma tocha alimentada pela própria saída), que é uma
   * peça de verdade e não um defeito.
   */
  function cuidarDaRedstone(x, y, z) {
    const id = lerBloco(x, y, z)
    if (ehPo(id)) {
      const mudancas = recalcularRede(lerBloco, x, y, z)
      for (const c of mudancas) editar(c.x, c.y, c.z, c.id)
      // A tocha espetada no bloco AO LADO do fio é diagonal ao fio, e `editar`
      // só acorda os seis vizinhos. Ver `celulasAAcordar`.
      for (const c of celulasAAcordar(mudancas)) fila.agendar(c.x, c.y, c.z)
      return mudancas.length > 0
    }
    if (ehTocha(id)) {
      const novo = proximoDaTocha(lerBloco, x, y, z)
      if (novo === null) return false
      editar(x, y, z, novo)
      return true
    }
    if (ehLampada(id)) {
      const novo = proximoDaLampada(lerBloco, x, y, z)
      if (novo === null) return false
      editar(x, y, z, novo)
      return true
    }
    return false
  }

  function visitarCelula(x, y, z) {
    if (cuidarDaRedstone(x, y, z)) return
    if (apagarPortalOrfao(x, y, z)) return
    if (reconectarCerca(x, y, z)) return
    if (cuidarDaLavoura(x, y, z)) return
    if (cuidarDaMuda(x, y, z)) return
    if (cuidarDaCana(x, y, z)) return
    if (cuidarDoSolo(x, y, z)) return
    const w = world()
    if (vaiCair(lerBloco, x, y, z)) {
      const id = w.getBlock(x, y, z)
      const destino = destinoDaQueda(lerBloco, x, y, z)
      if (destino < y) {
        editar(x, y, z, AIR)
        // Fila cheia: pousa na hora, sem animacao. Sumir da tela seria pior.
        if (!quedasNoAr.comecar(id, x, y, z, destino)) {
          pousarQueda({ id, x, y, z, destino }, 'pousou')
        }
        return
      }
    }
    // ENCONTRO ANTES DO FLUXO. Uma celula que virou pedra nao e mais fluido, e
    // perguntar o nivel dela primeiro seria perguntar o nivel de uma pedra.
    //
    // E vai por `editar`, ao contrario do fluxo: pedra, pedregulho e obsidiana
    // sao estado DURAVEL - o jogador construiu aquilo, mesmo que sem querer, e
    // tem que estar la quando ele voltar.
    const virou = encontro(lerBloco, x, y, z)
    if (virou !== null) {
      editar(x, y, z, virou)
      return
    }
    for (const fluido of OS_FLUIDOS) {
      const ehFonte = ehFonteDe(fluido)
      // Duas fontes lado a lado com chao embaixo viram fonte: a agua infinita.
      // A lava nao faz - `fazFonte` e falso nela.
      if (viraFonte(lerBloco, ehFonte, x, y, z, fluido)) {
        if (w.getBlock(x, y, z) !== fluido.fonte) {
          escreverFluido(x, y, z, fluido.fonte, fluido.tiques)
        }
        return
      }
      const novo = proximoId(lerBloco, ehFonte, x, y, z, fluido)
      if (novo !== null) {
        escreverFluido(x, y, z, novo, fluido.tiques)
        return
      }
    }
  }

  function pousarQueda(q, motivo) {
    // ⚠️ Desistir e pousar tem ALTURAS diferentes. Quem desistiu esta no ar, na
    // sua altura corrente; quem pousou esta no destino. Usar o destino nos dois
    // faria o item de quem desistiu aparecer num chao que ela nunca alcancou -
    // possivelmente do outro lado de um abismo sem fundo.
    const y = motivo === 'desistiu' ? Math.floor(q.y) : q.destino
    const def = blockDef(q.id)
    const ocupado = world().getBlock(q.x, y, q.z)
    // Alguem construiu no destino enquanto ela caia: vira item no chao, em vez
    // de sumir ou de comer o bloco de quem construiu.
    if (motivo === 'desistiu' || !atravessa(ocupado)) {
      if (def?.drops) soltarItem(def.drops, 1, q.x + 0.5, y + 0.3, q.z + 0.5, blockTintColor(def))
      return
    }
    editar(q.x, y, q.z, q.id)
  }

  /**
   * ACORDA O QUE CRESCE, depois de carregar um mundo salvo.
   *
   * ⚠️ SEM ISTO A AGRICULTURA MORRE ENTRE DUAS SESSÕES. A fila é reativa e
   * quem mantém lavoura, muda e canteiro andando é a própria visita se
   * repondo. Ao carregar o save ninguém começa essa cadeia: o jogador planta,
   * fecha o jogo, volta no dia seguinte e encontra o broto do mesmo tamanho —
   * até quebrar um bloco por perto sem querer e ver tudo destravar.
   *
   * Varre o REGISTRO DE EDIÇÕES, e não o mundo: lavoura só existe onde alguém
   * plantou, e o registro é exatamente a lista do que alguém mexeu. Varrer os
   * chunks seria ler milhões de células pra achar dezenas.
   *
   * Devolve quantas células entraram na fila — o QA precisa do número pra
   * distinguir "não achou nada" de "achou e não agendou".
   */
  function acordarPlantios() {
    let n = 0
    for (const [key, m] of registroDeEdicoes.mapa) {
      const { cx, cz } = parseChunkKey(key) || {}
      if (cx === undefined) continue
      for (const [li, id] of m) {
        if (!precisaDeRelogioDeLavoura(id)) continue
        const { lx, y, lz } = unpackLocalIndex(li)
        if (fila.agendar(cx * CHUNK_SIZE + lx, y, cz * CHUNK_SIZE + lz)) n++
      }
    }
    return n
  }

  function passo(dt) {
    // O relogio do fluido anda ANTES de drenar: quem venceu neste tique tem que
    // estar na fila quando ela for lida, senao o fluxo perde um quadro a cada
    // passo e escorre na metade da velocidade.
    fila.avancarTempo(dt)
    fila.drenar(visitarCelula)
    if (!quedasCongeladas) quedasNoAr.passo(dt, lerBloco, pousarQueda)
    motor()?.blocosCaindo?.sincronizar(quedasNoAr.lista)
  }

  return {
    editar,
    escreverFluido,
    reconectarCerca,
    visitarCelula,
    acordarPlantios,
    pousarQueda,
    passo,
    fila,
    quedasNoAr,
    congelado: () => quedasCongeladas,
    congelar: (v) => {
      quedasCongeladas = !!v
    },
    // O registro de edicoes: o componente conversa com o save por aqui.
    mapaDeEdicoes: registroDeEdicoes.mapa,
    registrar: registroDeEdicoes.registrar,
    coletar: registroDeEdicoes.coletar,
  }
}
