//
// A VIAGEM — para onde o portal leva, e onde o jogador pousa.
//
// ⚠️ O PORTAL DE CHEGADA É CONSTRUÍDO, NÃO PROCURADO. No original, chegar ao
// outro lado e não encontrar portal deixaria o jogador preso — então o jogo
// constrói um. Aqui é a mesma decisão, e ela é o que faz a viagem ser de IDA E
// VOLTA em vez de uma passagem só: o portal que nasce do outro lado é o que
// traz o jogador de volta.
//
// ⚠️ E A RAZÃO 1:8 NÃO É ENFEITE DE FIDELIDADE. É o que dá ao Nether a única
// função que ele tem além de recurso: andar oito blocos lá é andar sessenta e
// quatro aqui. Sem ela, atravessar o portal é só mudar de cenário.
//
import { AIR, ID } from './blocks.js'
import { dimensao, limites } from './dimensoes.js'
import { idDoPortal } from './portal.js'

/** Quantos blocos do overworld cabem num bloco do Nether. */
export const RAZAO = 8

export const DESTINO_DE = { overworld: 'nether', nether: 'overworld' }

/**
 * A coordenada correspondente do outro lado.
 *
 * O Y NÃO se divide: as duas dimensões têm a mesma altura, e dividir a altura
 * por oito jogaria todo mundo no piso de bedrock. Ele só é trazido para dentro
 * da faixa habitável da dimensão de destino.
 */
export function coordenadaDoOutroLado(de, x, y, z) {
  const para = DESTINO_DE[de]
  if (!para) return null
  const fator = para === 'nether' ? 1 / RAZAO : RAZAO
  const { minY, maxY } = limites(para)
  return {
    dimensao: para,
    x: Math.floor(x * fator),
    y: Math.min(maxY - 4, Math.max(minY + 2, Math.floor(y))),
    z: Math.floor(z * fator),
  }
}

/** Um lugar serve de pouso se há chão sólido e altura de sobra para a moldura. */
export const ALTURA_LIVRE = 5

function chaoFirme(blocoEm, x, y, z) {
  const chao = blocoEm(x, y - 1, z)
  if (chao === AIR || chao === ID.lava || chao === ID.water) return false
  for (let i = 0; i < ALTURA_LIVRE; i++) {
    if (blocoEm(x, y + i, z) !== AIR) return false
    // O vão tem DOIS blocos de largura: a moldura precisa dos dois, e um pouso
    // que só cabe de lado obrigaria a escavar logo depois de pousar.
    if (blocoEm(x + 1, y + i, z) !== AIR) return false
  }
  return blocoEm(x + 1, y - 1, z) !== AIR
}

/**
 * O melhor pouso perto do alvo, ou `null`.
 *
 * Anda em ANÉIS a partir do alvo, e dentro de cada anel varre a coluna inteira
 * de cima para baixo. A ordem importa: o mais perto no plano vence o mais perto
 * em altura, porque a razão 1:8 já é o que amarra os dois mundos e errar 20
 * blocos de lado desfaz o alinhamento que o jogador construiu.
 */
export function acharPouso(blocoEm, alvo, raio = 12) {
  // ⚠️ A COLUNA INTEIRA, NÃO UMA FAIXA AO REDOR DO Y. A primeira versão
  // procurava ±24 blocos de altura e forçava plataforma fora disso — e no
  // Nether, onde o salão aberto vive entre 32 e 100, um jogador que atravessa
  // voando a 110 no overworld chegava numa plataforma de obsidiana pendurada,
  // com o chão de verdade vinte blocos abaixo. Chão de verdade é melhor que
  // plataforma, e o laço já prefere o mais perto do alvo.
  const { minY, maxY } = limites(alvo.dimensao)
  const de = minY + 1
  const ate = maxY - ALTURA_LIVRE - 1
  for (let r = 0; r <= raio; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue
        // Do alvo para fora, nas duas direções de altura ao mesmo tempo: o
        // pouso logo acima e o logo abaixo valem o mesmo.
        for (let d = 0; d <= ate - de; d++) {
          for (const y of d === 0 ? [alvo.y] : [alvo.y + d, alvo.y - d]) {
            if (y < de || y > ate) continue
            if (chaoFirme(blocoEm, alvo.x + dx, y, alvo.z + dz)) {
              return { x: alvo.x + dx, y, z: alvo.z + dz }
            }
          }
        }
      }
    }
  }
  return null
}

/**
 * As células do portal de chegada: plataforma, moldura e vão aceso.
 *
 * O vão é 2×3 no eixo X. A plataforma existe porque o pouso FORÇADO (quando
 * nenhum lugar servia) não tem chão nenhum embaixo — e sem ela o jogador
 * chegaria caindo dentro de um portal, que é como se perde um save.
 */
export function celulasDoPortalDeChegada(x, y, z) {
  const celulas = []
  const por = (cx, cy, cz, id) => celulas.push({ x: cx, y: cy, z: cz, id })

  // 1. Plataforma de 4×3, um bloco abaixo do piso do vão.
  for (let dx = -1; dx <= 2; dx++) {
    for (let dz = -1; dz <= 1; dz++) por(x + dx, y - 1, z + dz, ID.obsidian)
  }
  // 2. O anel: base e topo já saem da plataforma e desta linha; os dois lados.
  for (let i = 0; i < 2; i++) por(x + i, y + 3, z, ID.obsidian)
  for (let j = 0; j < 3; j++) {
    por(x - 1, y + j, z, ID.obsidian)
    por(x + 2, y + j, z, ID.obsidian)
  }
  // 3. ⚠️ O ESPAÇO AO REDOR PRECISA SER LIMPO, e não só o vão. Um portal que
  //    nasce dentro de netherrack acende preso: o jogador atravessa e fica
  //    entalado na rocha, sem picareta se tiver morrido antes. Duas colunas de
  //    ar em volta são a diferença entre chegar e ficar preso.
  for (let dx = -1; dx <= 2; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      if (dz === 0) continue
      for (let j = 0; j < 4; j++) por(x + dx, y + j, z + dz, AIR)
    }
  }
  // 4. O vão aceso, por último: ele é escrito por cima do ar da limpeza.
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 3; j++) por(x + i, y + j, z, idDoPortal('x'))
  }
  return celulas
}

/**
 * O plano completo da travessia a partir de uma célula de portal.
 *
 * `blocoEmDestino` lê o mundo de DESTINO — que quem chama tem que ter gerado
 * antes. É a razão de esta função não gerar nada: geração é trabalho de worker,
 * e uma regra pura que espera chunk não é pura coisa nenhuma.
 */
export function planoDaTravessia(de, jogador, blocoEmDestino, raio = 12) {
  const alvo = coordenadaDoOutroLado(de, jogador.x, jogador.y, jogador.z)
  if (!alvo) return null
  const achado = acharPouso(blocoEmDestino, alvo, raio)
  // ⚠️ SEM POUSO, FORÇA-SE UM. Devolver `null` aqui deixaria o jogador do lado
  // de cá olhando um portal que não faz nada — e é o caso comum no Nether, onde
  // o alvo cai dentro de rocha maciça mais vezes do que não.
  const pouso = achado || { x: alvo.x, y: alvo.y, z: alvo.z }
  return {
    dimensao: alvo.dimensao,
    forcado: !achado,
    celulas: celulasDoPortalDeChegada(pouso.x, pouso.y, pouso.z),
    // O jogador chega EM PÉ no meio do vão, não no canto: nascer colado na
    // moldura empurra o corpo para dentro da obsidiana na primeira física.
    pouso: { x: pouso.x + 0.5, y: pouso.y, z: pouso.z + 0.5 },
  }
}

/** A dimensão para onde este id de dimensão leva. Útil para a interface. */
export const outraDimensao = (id) => DESTINO_DE[id] ?? null

/** O nome do líquido do mar da dimensão — o que o céu e o ambiente perguntam. */
export const marDe = (id) => dimensao(id).liquidoDoMar

// ── O TELEPORTE DO CRIATIVO ─────────────────────────────────────────────────
//
// ⚠️ NÃO É UMA SEGUNDA TRAVESSIA, e isso foi decidido antes de escrever. A
// sequência de trocar de dimensão — guardar as edições de onde se sai,
// restaurar as do destino, reconstruir o mundo, pôr o jogador em pé — já mora
// em `criarTravessia`, e um segundo caminho que fizesse "quase isso" é a
// política de nascimento em três cópias de novo: aquilo custou três rodadas e
// um jogador enterrado dentro da montanha. O que entra aqui é só o PLANO: para
// onde ir e onde pousar. Quem executa continua sendo a travessia.
//
// ⚠️ E O TELEPORTE NÃO CONSTRÓI PORTAL. O portal de chegada existe para a
// viagem ser de ida e volta: quem atravessa a pé precisa de como voltar. Quem
// teleporta tem o menu, e volta por ele. Cavar obsidiana no mundo de alguém por
// causa de um clique num painel de criativo seria uma edição que o jogador não
// pediu e não desfaz.

/** As dimensões que o teleporte alcança, na ordem em que o painel as mostra. */
export const DESTINOS_DO_TELEPORTE = ['overworld', 'nether', 'end']

/**
 * A coordenada correspondente, para QUALQUER par de dimensões.
 *
 * `coordenadaDoOutroLado` só conhece o par nether↔overworld, porque é o único
 * que o portal liga. Aqui o par é livre, e a escala sai de quem é cada lado:
 *
 *  - indo PARA o Nether, divide por oito; VINDO dele, multiplica;
 *  - com o Fim em qualquer ponta, a coordenada é crua. O Fim é uma ilha em
 *    torno da origem: escalar a posição do jogador jogaria quem está a 4.000
 *    blocos de casa a 32.000 do centro da ilha, no vazio.
 */
export function coordenadaEscalada(de, para, x, y, z) {
  const { minY, maxY } = limites(para)
  const dentroDaFaixa = Math.min(maxY - 4, Math.max(minY + 2, Math.floor(y)))
  let fator = 1
  if (de !== 'end' && para === 'nether') fator = 1 / RAZAO
  else if (de === 'nether' && para !== 'end') fator = RAZAO
  return {
    dimensao: para,
    x: Math.floor(x * fator),
    y: dentroDaFaixa,
    z: Math.floor(z * fator),
  }
}

/**
 * O plano de um teleporte. Mesma forma do plano da travessia — é ela quem
 * executa —, com `celulas` sempre vazio: teleporte não constrói portal.
 *
 * @param {string} de  dimensão de agora
 * @param {string} para  dimensão de destino
 * @param {{x:number,y:number,z:number}} jogador
 * @param {(x,y,z)=>number} blocoEmDestino  leitor do mundo de destino
 * @param {{x,y,z}} [pousoDoFim]  o ponto de chegada do Fim, que é fixo
 * @returns {object|null} `null` quando o destino não existe ou é o de agora
 */
export function planoDoTeleporte(de, para, jogador, blocoEmDestino, pousoDoFim = null, raio = 16) {
  if (!DESTINOS_DO_TELEPORTE.includes(para)) return null
  // ⚠️ IR PARA ONDE JÁ SE ESTÁ NÃO É VIAGEM. Sem esta linha o painel
  // reconstruiria o mundo inteiro e teleportaria o jogador para longe de onde
  // ele estava — do ponto de vista dele, um clique que embaralhou tudo.
  if (para === de) return null
  // O Fim tem UM ponto de chegada, e é o mesmo do portal: a plataforma de
  // obsidiana. Procurar chão lá daria pouso no vazio ao redor da ilha.
  if (para === 'end' && pousoDoFim)
    return { dimensao: 'end', forcado: false, celulas: [], pouso: { ...pousoDoFim } }
  const alvo = coordenadaEscalada(de, para, jogador.x, jogador.y, jogador.z)
  const achado = acharPouso(blocoEmDestino, alvo, raio)
  const pouso = achado || { x: alvo.x, y: alvo.y, z: alvo.z }
  return {
    dimensao: para,
    forcado: !achado,
    celulas: [],
    pouso: { x: pouso.x + 0.5, y: pouso.y, z: pouso.z + 0.5 },
  }
}
