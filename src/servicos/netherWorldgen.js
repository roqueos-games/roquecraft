//
// O NETHER — a segunda dimensão, gerada.
//
// ⚠️ ELE É O NEGATIVO DO OVERWORLD, E ISSO NÃO É METÁFORA: É O ALGORITMO.
//
// No overworld a rocha existe onde a densidade 3D é positiva ABAIXO de uma
// altura-alvo, e o resto é ar aberto para o céu. Aqui é o contrário: o volume
// inteiro é rocha, e o ruído ABRE nele. Por isso não há mapa de altura, não há
// bioma por temperatura e umidade, e não há superfície — há teto, piso e o que
// o ruído escavou entre os dois.
//
// Escrever isto como "worldgen com outros blocos" foi a primeira tentativa e
// dava um overworld vermelho: morro, céu vermelho por cima, grama de
// netherrack. O que faz o Nether ser o Nether é a sensação de estar DENTRO de
// alguma coisa, e essa sensação vem do teto fechado — a razão de
// `tetoIndestrutivel` existir no registro de dimensões.
//
import { createPerlin, fbm3, fbm2, mulberry32 } from './noise.js'
import { CHUNK_SIZE, WORLD_HEIGHT, localIndex, AIR } from './constants.js'
import { ID } from './blocks.js'
import { dimensao } from './dimensoes.js'

const NETHER = dimensao('nether')

/** Até onde o mar de lava enche. Vem do registro, não de um literal aqui. */
export const MAR_DE_LAVA = NETHER.nivelDoMar

/**
 * As camadas de rocha eterna, em número de blocos.
 *
 * Irregular nos dois extremos, e por motivos diferentes: embaixo, para que o
 * piso não leia como laje de concreto; em cima, porque o teto do Nether é o
 * primeiro lugar onde o jogador vai tentar cavar para escapar, e um teto
 * perfeitamente plano entrega que ele é uma parede de jogo.
 */
export const ESPESSURA_DA_ROCHA_ETERNA = 5

/**
 * Acima disto a célula é vazio.
 *
 * ⚠️ NÚMERO MEDIDO, NÃO ESCOLHIDO. A mistura de fbm3 abaixo não vive em [−1, 1]:
 * medida em 60 mil amostras, ela vai de −0,54 a 0,48 com mediana em 0,004 — a
 * soma de oitavas com ganho 0,5 fica muito mais estreita que a intuição diz. O
 * primeiro palpite (0,08, na cabeça um "quase metade") abriu 17% do volume, e o
 * jogador atravessava o portal para dentro de rocha maciça. Este valor é o que
 * dá a fração de vazio medida em `tests/.../netherWorldgen.spec.js`.
 */
export const LIMIAR_DO_VAZIO = -0.055

/** Ruído próprio: o Nether não compartilha campo nenhum com o overworld. */
export function criarRuidoDoNether(seed) {
  return {
    seed,
    vazio: createPerlin(seed + 101),
    veio: createPerlin(seed + 102),
    teto: createPerlin(seed + 103),
    piso: createPerlin(seed + 104),
  }
}

/**
 * Esta célula é VAZIO?
 *
 * Duas escalas somadas: uma larga, que decide onde há salão, e uma miúda, que
 * quebra a parede do salão para ela não ler como caverna de tutorial. E o eixo
 * Y é comprimido (0,7) de propósito: ruído isotrópico dá bolha, e bolha empilha
 * — o Nether tem que ser mais largo que alto para se atravessar andando.
 */
export function ehVazio(nz, x, y, z) {
  const largo = fbm3(nz.vazio, x * 0.012, y * 0.0084, z * 0.012, 3)
  const miudo = fbm3(nz.veio, x * 0.045, y * 0.0315, z * 0.045, 2)
  return largo * 0.78 + miudo * 0.22 > LIMIAR_DO_VAZIO + viesDaAltura(y)
}

/**
 * O quanto é MAIS DIFÍCIL abrir perto do piso e do teto.
 *
 * ⚠️ SEM ISTO O NETHER É UM OCEANO DE LAVA. Com limiar uniforme em toda altura,
 * a metade de baixo abre tanto quanto o meio — e como tudo que abre abaixo de
 * 31 vira lava, o corte vertical do primeiro chunk medido saiu com 28 blocos de
 * lava de parede a parede, sem uma ilha. O piso do Nether é maciço com poças, e
 * a diferença entre as duas coisas é este viés.
 *
 * O número de baixo é maior que o de cima de propósito: a massa do piso é
 * travessia, a do teto é só a casca.
 */
export function viesDaAltura(y) {
  const doPiso = Math.min(1, Math.max(0, y / 40))
  const doTeto = Math.min(1, Math.max(0, (NETHER.tetoIndestrutivel - 8 - y) / 22))
  return (1 - doPiso) * 0.2 + (1 - doTeto) * 0.1
}

/**
 * A espessura da rocha eterna no piso e no teto, nesta coluna.
 *
 * ⚠️ `fbm2` É COM SINAL. Eu tratei a saída como 0..1 e o primeiro corte vertical
 * mostrou netherrack em y=127: com ruído negativo o teto subia ACIMA do topo do
 * mundo e a condição `y >= tetoDe` não pegava coluna nenhuma — buraco no teto
 * do mundo, que é exatamente por onde o jogador escaparia. Medido: `fbm2` com
 * duas oitavas vai de −0,58 a 0,61. `meio()` traz para 0..1 antes de virar
 * espessura.
 */
const meio = (v) => Math.min(1, Math.max(0, v * 0.9 + 0.5))

export function bordasDaColuna(nz, x, z) {
  const grossura = (v) => 1 + Math.floor(meio(v) * (ESPESSURA_DA_ROCHA_ETERNA - 1))
  return {
    pisoAte: NETHER.pisoIndestrutivel + grossura(fbm2(nz.piso, x * 0.3, z * 0.3, 2)),
    tetoDe: NETHER.tetoIndestrutivel - grossura(fbm2(nz.teto, x * 0.3, z * 0.3, 2)) + 1,
  }
}

/**
 * Gera um chunk do Nether.
 *
 * Devolve a MESMA forma que `generateChunkData` do overworld — `{ blocks,
 * heights, biomes }` — porque quem consome (o pipeline, o mesher, a luz) não
 * pode precisar saber em que dimensão está. `heights` aqui é o topo SÓLIDO da
 * coluna, que num mundo com teto é quase sempre o teto; ele existe para o
 * heightmap do cliente continuar respondendo a mesma pergunta.
 */
export function gerarChunkDoNether(nz, cx, cz) {
  const blocks = new Uint16Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT)
  const heights = new Int16Array(CHUNK_SIZE * CHUNK_SIZE)
  const biomes = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE)
  const rnd = mulberry32((cx * 374761393) ^ (cz * 668265263) ^ (nz.seed + 77))

  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const gx = cx * CHUNK_SIZE + lx
      const gz = cz * CHUNK_SIZE + lz
      const base = (lx * CHUNK_SIZE + lz) * WORLD_HEIGHT
      const { pisoAte, tetoDe } = bordasDaColuna(nz, gx, gz)
      const manchaDeAlmas = fbm2(nz.piso, gx * 0.055, gz * 0.055, 2) > 0.16

      for (let y = 0; y < WORLD_HEIGHT; y++) {
        if (y <= pisoAte || y >= tetoDe) {
          blocks[base + y] = ID.bedrock
          continue
        }
        if (!ehVazio(nz, gx, y, gz)) {
          blocks[base + y] = ID.netherrack
          continue
        }
        // ⚠️ O MAR DE LAVA ENCHE O VAZIO, NÃO SUBSTITUI A ROCHA. Encher por
        // altura sem olhar a rocha afogaria o interior maciço do terreno em
        // lava invisível — e o jogador que cavasse a 20 de altura seria morto
        // por um bloco que nada no mundo tinha mostrado.
        blocks[base + y] = y <= MAR_DE_LAVA ? ID.lava : AIR
      }

      // ── A pele do vazio ───────────────────────────────────────────────────
      //
      // Varre a coluna UMA vez procurando fronteira, em vez de decidir por
      // altura: o Nether tem teto e piso em toda altura, e "y baixo é chão" é
      // falso aqui — a primeira versão pôs areia das almas no teto.
      let topoSolido = 0
      for (let y = 1; y < WORLD_HEIGHT - 1; y++) {
        const aqui = blocks[base + y]
        if (aqui !== AIR && aqui !== ID.lava) topoSolido = y
        if (aqui !== ID.netherrack) continue
        const acima = blocks[base + y + 1]
        // "Chão de salão" é a rocha com vazio EM CIMA. `abaixo` não entra:
        // quem pisa pisa no topo, e o que há sob a rocha não muda a pele dela.
        const chaoDeSalao = acima === AIR || acima === ID.lava

        // MAGMA NA BEIRA DA LAVA, e só ali: é o aviso visual de que o chão
        // adiante queima. Espalhado pelo mundo inteiro ele deixaria de avisar.
        if (chaoDeSalao && acima === ID.lava && rnd() < 0.34) {
          blocks[base + y] = ID.magma
          continue
        }
        // ⚠️ MANCHA, NÃO SORTEIO POR CÉLULA. A primeira versão tirava 11% de
        // cada célula de chão e o resultado, medido, foi 0,05% do volume
        // espalhado um bloco aqui, outro trinta blocos adiante: sal, não
        // terreno. Areia das almas é um CAMPO — quem atravessa um percebe que
        // atravessou. O ruído 2D decide a coluna inteira.
        if (chaoDeSalao && manchaDeAlmas) {
          blocks[base + y] = ID.soulSand
          continue
        }
      }
      heights[lx * CHUNK_SIZE + lz] = topoSolido
      biomes[lx * CHUNK_SIZE + lz] = 0
    }
  }

  veiosDeQuartzo(nz, blocks, cx, cz)
  cachosDeGlowstone(nz, blocks, cx, cz)
  verrugaNasAlmas(nz, blocks, cx, cz)
  return { blocks, heights, biomes }
}

/**
 * Quartzo em veios elipsoidais, como o minério do overworld.
 *
 * Sorteador PRÓPRIO e não o da pele: puxar do mesmo faria o número de blocos de
 * areia das almas deslocar a posição de todo o quartzo do chunk — o tipo de
 * acoplamento que muda a raridade de um recurso sem que nada no código diga.
 */
function veiosDeQuartzo(nz, blocks, cx, cz) {
  const rnd = mulberry32((cx * 1103515245) ^ (cz * 12345) ^ (nz.seed + 991))
  for (let t = 0; t < 14; t++) {
    const ox = Math.floor(rnd() * CHUNK_SIZE)
    const oz = Math.floor(rnd() * CHUNK_SIZE)
    const oy = 6 + Math.floor(rnd() * (WORLD_HEIGHT - 18))
    const r = 2.2 * (0.7 + rnd() * 0.6)
    const rr = Math.ceil(r)
    for (let dx = -rr; dx <= rr; dx++) {
      for (let dy = -rr; dy <= rr; dy++) {
        for (let dz = -rr; dz <= rr; dz++) {
          if (dx * dx + dy * dy * 1.4 + dz * dz > r * r) continue
          const lx = ox + dx
          const lz = oz + dz
          const y = oy + dy
          if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) continue
          if (y < 1 || y >= WORLD_HEIGHT) continue
          const i = localIndex(lx, y, lz)
          // SÓ netherrack. Não come bedrock (que é o piso e o teto do mundo),
          // nem a pele de magma e areia das almas que acabou de ser desenhada.
          if (blocks[i] === ID.netherrack) blocks[i] = ID.netherQuartzOre
        }
      }
    }
  }
}

/**
 * Glowstone em CACHO pendurado no teto, não em bloco solto.
 *
 * ⚠️ A LUZ DO NETHER É A ÚNICA QUE EXISTE ALI, e bloco solto não ilumina nada:
 * a primeira versão sorteava 1,8% de cada célula de teto e saíram 4 blocos por
 * chunk, espalhados — o jogador via um ponto brilhante longe e continuava no
 * escuro. Um cacho de meia dúzia acende o salão em volta, e é o que faz o
 * glowstone valer a escalada até o teto.
 *
 * Pendurado quer dizer que ele cresce PARA BAIXO a partir do teto do salão: um
 * cacho centrado dentro da rocha não apareceria, e é onde um blob ingênuo cai.
 */
function cachosDeGlowstone(nz, blocks, cx, cz) {
  const rnd = mulberry32((cx * 2654435761) ^ (cz * 40503) ^ (nz.seed + 313))
  for (let t = 0; t < 10; t++) {
    const ox = 2 + Math.floor(rnd() * (CHUNK_SIZE - 4))
    const oz = 2 + Math.floor(rnd() * (CHUNK_SIZE - 4))
    const deY = 40 + Math.floor(rnd() * (WORLD_HEIGHT - 56))
    // Procura, subindo a partir de uma altura sorteada, a primeira rocha com
    // vazio embaixo: é o teto do salão em que o jogador vai estar.
    let teto = -1
    for (let y = deY; y < WORLD_HEIGHT - 2; y++) {
      const i = localIndex(ox, y, oz)
      if (blocks[i] !== ID.netherrack) continue
      if (blocks[localIndex(ox, y - 1, oz)] !== AIR) continue
      teto = y
      break
    }
    if (teto < 0) continue
    const raio = 1 + rnd() * 1.4
    const rr = Math.ceil(raio)
    // ⚠️ DE BAIXO PARA CIMA, E SÓ ONDE A FACE ESTÁ EXPOSTA. O cacho cresce para
    // dentro da rocha do teto, e o teto do salão é curvo: nas colunas de fora
    // do centro, a altura `teto` já é rocha com rocha embaixo. Um blob ingênuo
    // acende essa célula e o resultado é glowstone ENTERRADO — luz que não
    // ilumina nada, encontrada pelo teste `glowstone fica PENDURADO` com cinco
    // ocorrências em nove chunks. Exigir vazio (ou o próprio cacho) logo abaixo
    // faz o cacho seguir o contorno do teto, que é o que se quer ver.
    for (let dy = 0; dy <= rr; dy++) {
      for (let dx = -rr; dx <= rr; dx++) {
        for (let dz = -rr; dz <= rr; dz++) {
          if (dx * dx + dy * dy + dz * dz > raio * raio) continue
          const lx = ox + dx
          const lz = oz + dz
          if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) continue
          const i = localIndex(lx, teto + dy, lz)
          if (blocks[i] !== ID.netherrack) continue
          const abaixo = blocks[localIndex(lx, teto + dy - 1, lz)]
          if (abaixo !== AIR && abaixo !== ID.glowstone) continue
          blocks[i] = ID.glowstone
        }
      }
    }
  }
}

/**
 * A VERRUGA CRESCE NA AREIA DAS ALMAS, e só nela.
 *
 * ⚠️ ELA É A ÚNICA FONTE DE POÇÃO DO JOGO, e é por isso que ela nasce aqui em
 * vez de se plantar no overworld. `fermentacao.js` exige o degrau da verruga
 * antes de qualquer efeito: sem vir ao Nether, nenhuma poção existe. Foi o que
 * transformou a dimensão de cenário em destino.
 *
 * ⚠️ E ELA SÓ NASCE ONDE JÁ HÁ AREIA DAS ALMAS — que é um CAMPO, decidido pelo
 * ruído 2D da mancha (ver o comentário lá em cima). Sortear a verruga por
 * célula do chão inteiro daria um talo aqui, outro trinta blocos adiante: o
 * mesmo defeito de "sal, não terreno" que a areia das almas já teve, uma camada
 * acima. Amarrada à mancha, ela sai em touceiras dentro dos campos — e quem
 * acha um campo acha a colheita.
 */
function verrugaNasAlmas(nz, blocks, cx, cz) {
  const rnd = mulberry32((cx * 92837111) ^ (cz * 689287499) ^ (nz.seed + 0x7761))
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let y = 1; y < WORLD_HEIGHT - 1; y++) {
        if (blocks[localIndex(lx, y, lz)] !== ID.soulSand) continue
        if (blocks[localIndex(lx, y + 1, lz)] !== AIR) continue
        // Uma em cada oito colunas de areia das almas com céu aberto. Densidade
        // medida, não escolhida: acima disso o campo vira tapete vermelho e a
        // colheita deixa de ser uma coisa que se procura.
        if (rnd() < 0.125) blocks[localIndex(lx, y + 1, lz)] = ID.netherWart
        break
      }
    }
  }
}
