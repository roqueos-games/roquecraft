// RoqueCraft - ONDE O BLOCO VAI CAIR, e se ele cabe. Uma resposta so.
//
// ⚠️ ISTO NASCEU DE UMA DIVERGENCIA REAL ENTRE O FANTASMA E O CLIQUE.
//
// `doPlace` percorria cama -> laje -> escada -> variante pra descobrir a celula,
// e o fantasma da mira olhava so `hit.place`. Nos casos comuns as duas respostas
// batem. Na FUSAO DE LAJE nao: `encaixarLaje` devolve a celula do ALVO (a laje
// que ja estava la, que recebe a metade que falta), enquanto `hit.place` e a
// celula VIZINHA. O fantasma aparecia um bloco ao lado de onde a peca entrava.
//
// O proprio codigo ja dizia a regra -- "um fantasma que aparece onde o bloco nao
// entra e pior que fantasma nenhum, ele ensina errado" -- e mesmo assim tinha
// duas contas diferentes pra mesma pergunta. Duas contas pra uma pergunta
// divergem: e so questao de qual caso ninguem testou.
//
// Agora ha UMA conta, e os dois a chamam.

import { encaixarCama } from './cama.js'
import { encaixarPorta } from './porta.js'
import { encaixarLaje } from './laje.js'
import { encaixarEscada } from './escada.js'
import { idParaColocar } from './variante.js'
import { faceFromNormal } from './voxelRaycast.js'
import { AIR, isReplaceable } from './blocks.js'
import { placeableBlock } from './items.js'
import { dentroDoJogador } from './construcao.js'
import { WORLD_HEIGHT } from './constants.js'

/**
 * @param {object} e
 * @param {string} e.item   o que esta na mao
 * @param {object} e.hit    o alvo da mira (`{ hit, place, normal, point }`)
 * @param {{x:number,z:number}} e.olhar
 * @param {object} e.mundo  `{ getBlock, solidAt }`
 * @param {object} e.jogador
 * @returns {null | { celulas: Array<{x,y,z,id}>, principal: {x,y,z}, cama: boolean }}
 */
export function resolverColocacao({ item, hit, olhar, mundo, jogador }) {
  const blockId = placeableBlock(item)
  if (!blockId || !hit || !mundo) return null

  // ⚠️ ALVO SUBSTITUÍVEL RECEBE A PEÇA NA PRÓPRIA CÉLULA.
  //
  // Desde que a mira passou a enxergar planta (`EH_MIRAVEL`), mirar num tufo de
  // mato e colocar um bloco punha a peça na face DE FORA do mato — o jogador
  // via o cubo nascer ao lado, e o mato continuava lá. No jogo de referência a
  // peça entra no lugar do mato, que é o que "substituível" quer dizer.
  // ⚠️ E AR NÃO CONTA. Ar é `replaceable`, e um `hit` de teste (ou um alvo que
  // sumiu entre o raycast e o clique) apontando pra célula vazia passaria a
  // escrever NELA, atropelando a guarda de `y` fora do mundo que olha `place`.
  const alvoAqui = mundo.getBlock(hit.hit.x, hit.hit.y, hit.hit.z)
  const destino = alvoAqui !== AIR && isReplaceable(alvoAqui) ? hit.hit : hit.place

  const livre = (x, y, z) =>
    dentroDoMundo(y) && isReplaceable(mundo.getBlock(x, y, z)) && !dentroDoJogador(x, y, z, jogador)

  // A CAMA ocupa DUAS celulas e por isso nao passa pelo caminho comum, que
  // devolve uma. Ou as duas cabem, ou nenhuma entra: meia cama e uma prancha, e
  // o jogador nao teria como ver que faltou metade.
  const berco = encaixarCama({
    item,
    destino,
    dirX: olhar.x,
    dirZ: olhar.z,
    livre,
    apoiado: (x, y, z) => !!mundo.solidAt(x, y, z),
  })
  if (berco) {
    return {
      celulas: [berco.pe, berco.cabeceira],
      // O PE, e nao as duas: a cama e uma peca so pro construtor, e contar duas
      // colocacoes por cama estragaria a estatistica de construcao.
      principal: berco.pe,
      cama: true,
    }
  }

  // A PORTA tambem ocupa DUAS celulas, uma em cima da outra, pelo mesmo motivo
  // da cama: ou as duas cabem, ou nenhuma entra.
  const vao = encaixarPorta({
    item,
    destino,
    dirX: olhar.x,
    dirZ: olhar.z,
    livre,
    apoiado: (x, y, z) => !!mundo.solidAt(x, y, z),
  })
  if (vao) {
    return { celulas: [vao.baixo, vao.cima], principal: vao.baixo, cama: false }
  }

  const face = faceFromNormal(hit.normal)
  const alvoId = mundo.getBlock(hit.hit.x, hit.hit.y, hit.hit.z)
  const encaixe =
    encaixarLaje({
      item,
      alvoId,
      alvo: hit.hit,
      face,
      pontoY: hit.point.y,
      destino,
    }) ||
    encaixarEscada({
      item,
      face,
      pontoY: hit.point.y,
      destino,
      dirX: olhar.x,
      dirZ: olhar.z,
    })

  const celula = encaixe || destino
  const id = idParaColocar({ blockId, encaixe, face, olhar, alvoId })
  if (!dentroDoMundo(celula.y)) return null

  // ⚠️ A FUSAO ESCREVE POR CIMA DE UMA LAJE, que nao e `replaceable` -- e nao
  // precisa ser: quem autorizou foi a regra de encaixe, que ja conferiu que e o
  // mesmo material e a metade que falta.
  if (!encaixe?.dupla && !isReplaceable(mundo.getBlock(celula.x, celula.y, celula.z))) return null

  // Nao colocar dentro do proprio corpo. A conta usa a MESMA AABB da fisica: a
  // versao antiga testava uma coluna so e o corpo tem 0,6 de largura, quase
  // sempre encostando em duas ou quatro celulas -- dava pra se emparedar na
  // celula vizinha a do proprio pe.
  if (dentroDoJogador(celula.x, celula.y, celula.z, jogador)) return null

  return {
    celulas: [{ x: celula.x, y: celula.y, z: celula.z, id }],
    principal: { x: celula.x, y: celula.y, z: celula.z },
    cama: false,
  }
}

const dentroDoMundo = (y) => y >= 0 && y < WORLD_HEIGHT
