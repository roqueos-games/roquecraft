//
// DESTAQUE — o contorno do bloco que a mira está pegando.
//
// Duas coisas que este arquivo carrega, e as duas foram aprendidas apanhando.
//
// 1. A MOLDURA É DEITADA NO PLANO DA FACE, não uma barra de secção quadrada.
//
//    A primeira versão desenhava barras nas 12 arestas. Num bloco encostado no
//    chão, as barras verticais ficam inteiras DENTRO de bloco sólido e o teste
//    de profundidade come todas. Sobra o que a barra do topo projeta pra fora —
//    e uma barra de 1 cm vista a 4 metros num ângulo raso dá 1 pixel. O QA de
//    22/08/2026 mediu `visible: true`, posição certa, 288 vértices por gaiola, e
//    a foto continuou sem contorno. Não era opacidade: era espessura na direção
//    errada. Deitada no plano, a mesma moldura de 4,5 cm dá ~8 px na mesma
//    câmera, e o comportamento fica igual ao do original — no chão plano você vê
//    o quadrado do topo e as faces enterradas não aparecem.
//
// 2. O CONTORNO SEGUE A FORMA, não o cubo.
//
//    Enquanto tudo era cubo, uma moldura 1×1×1 servia. Desde a laje (rodada 6),
//    a escada (rodada 7) e a cama (rodada 8), o contorno mentia: cercava o cubo
//    inteiro numa laje de meia altura, e o jogador via a mira "pegando" ar. É o
//    tipo de erro que ensina errado — a pessoa aprende a mirar deslocado.
//
//    A geometria sai de `CAIXAS_DE_BLOCO`, a MESMA lista que a física e o
//    raycast usam. Se um dia divergirem, o contorno passa a mentir de novo; por
//    isso ninguém aqui redescreve forma nenhuma.
//
// A geometria é cara e as formas são poucas (256 ids, punhado de silhuetas
// distintas), então cada id monta a sua uma vez e fica em cache.
//
import { CAIXAS_DE_BLOCO } from '../formas.js'

const ESP = 0.004 // "espessura" só pra não ser um plano degenerado

/**
 * Moldura de UMA caixa, em coordenadas relativas ao centro da célula.
 * `caixa` é [x0, y0, z0, x1, y1, z1] em 0..1 dentro do bloco.
 */
function molduraDaCaixa(THREE, caixa, largura, saliencia) {
  const partes = []
  const min = [caixa[0] - 0.5, caixa[1] - 0.5, caixa[2] - 0.5]
  const max = [caixa[3] - 0.5, caixa[4] - 0.5, caixa[5] - 0.5]
  const centro = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
  const lado = [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
  for (let eixo = 0; eixo < 3; eixo++) {
    const u = (eixo + 1) % 3
    const v = (eixo + 2) % 3
    // Caixa fina demais num eixo não ganha moldura naquele par de faces: a
    // moldura ficaria maior que a própria caixa e viraria borrão.
    if (lado[u] < largura * 2.2 || lado[v] < largura * 2.2) continue
    for (const sinal of [-1, 1]) {
      for (const s2 of [-1, 1]) {
        // duas barras ao longo de u, nas duas bordas em v
        const d = [0, 0, 0]
        d[eixo] = ESP
        d[u] = lado[u]
        d[v] = largura
        const g = new THREE.BoxGeometry(d[0], d[1], d[2])
        const p = [...centro]
        p[eixo] = centro[eixo] + (sinal * lado[eixo]) / 2 + sinal * saliencia
        p[v] = centro[v] + s2 * (lado[v] / 2 - largura / 2)
        g.translate(p[0], p[1], p[2])
        partes.push(g)
        // e duas ao longo de v, já descontando o canto que a outra ocupa
        const d2 = [0, 0, 0]
        d2[eixo] = ESP
        d2[u] = largura
        d2[v] = lado[v] - largura * 2
        const g2 = new THREE.BoxGeometry(d2[0], d2[1], d2[2])
        const p2 = [...centro]
        p2[eixo] = centro[eixo] + (sinal * lado[eixo]) / 2 + sinal * saliencia
        p2[u] = centro[u] + s2 * (lado[u] / 2 - largura / 2)
        g2.translate(p2[0], p2[1], p2[2])
        partes.push(g2)
      }
    }
  }
  return partes
}

/**
 * As caixas de um id, com defesa: id sem forma declarada vira cubo cheio.
 *
 * ⚠️ O padrão TEM que ser o cubo, não a lista vazia. Id desconhecido com lista
 * vazia some o contorno inteiro — e o jogador conclui que a mira não pega nada
 * ali, quando pega. Errar pra mais é visível e inofensivo; errar pra menos é
 * invisível e mente.
 */
export function caixasDe(id) {
  const c = CAIXAS_DE_BLOCO[id]
  if (Array.isArray(c) && c.length) return c
  return [[0, 0, 0, 1, 1, 1]]
}

export function criarDestaque(THREE, mergeGeometries) {
  const cache = new Map()
  const monta = (id) => {
    const caixas = caixasDe(id)
    const feitas = (largura, saliencia) =>
      mergeGeometries(caixas.flatMap((c) => molduraDaCaixa(THREE, c, largura, saliencia)))
    const g = { escura: feitas(0.05, 0.006), clara: feitas(0.014, 0.008) }
    cache.set(id, g)
    return g
  }

  // Duas molduras concêntricas: a escura larga por fora, a clara fina por
  // dentro. Uma cor só some contra o fundo da mesma cor — preto sobre obsidiana
  // é invisível, branco sobre neve idem. É o mesmo truque do cursor do sistema.
  const material = (cor, opacidade) =>
    new THREE.MeshBasicMaterial({
      color: cor,
      transparent: true,
      opacity: opacidade,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -8,
      polygonOffsetUnits: -8,
    })

  const inicial = monta(1)
  const escura = new THREE.Mesh(inicial.escura, material(0x07070a, 0.95))
  escura.renderOrder = 3
  const clara = new THREE.Mesh(inicial.clara, material(0xffffff, 0.98))
  clara.renderOrder = 4

  const grupo = new THREE.Group()
  grupo.add(escura, clara)
  grupo.visible = false
  let idAtual = 1

  /** Põe o contorno na célula (x,y,z), com a forma do bloco `id`. */
  const apontarPara = (id, x, y, z) => {
    if (id !== idAtual) {
      const g = cache.get(id) || monta(id)
      escura.geometry = g.escura
      clara.geometry = g.clara
      idAtual = id
    }
    grupo.position.set(x + 0.5, y + 0.5, z + 0.5)
    grupo.visible = true
  }

  const esconder = () => {
    grupo.visible = false
  }

  const descartar = () => {
    for (const g of cache.values()) {
      g.escura.dispose()
      g.clara.dispose()
    }
    cache.clear()
    escura.material.dispose()
    clara.material.dispose()
  }

  return {
    grupo,
    apontarPara,
    esconder,
    descartar,
    // Só pro QA: sem isto a sonda não tem como afirmar QUAL forma está na tela.
    get idAtual() {
      return idAtual
    },
    get formasEmCache() {
      return cache.size
    },
    /**
     * A caixa que a GEOMETRIA ocupa agora, em coordenadas do bloco (0..1).
     *
     * É a única medida que separa contorno de laje de contorno de cubo: os dois
     * têm o mesmo número de vértices (uma caixa, seis faces, quatro barras), e
     * contar vértice diria que são iguais. O que muda é ONDE eles estão.
     */
    get caixaDaMalha() {
      escura.geometry.computeBoundingBox()
      const b = escura.geometry.boundingBox
      return [
        +(b.min.x + 0.5).toFixed(3),
        +(b.min.y + 0.5).toFixed(3),
        +(b.min.z + 0.5).toFixed(3),
        +(b.max.x + 0.5).toFixed(3),
        +(b.max.y + 0.5).toFixed(3),
        +(b.max.z + 0.5).toFixed(3),
      ]
    },
  }
}
