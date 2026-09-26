//
// O PORTAL — a moldura de obsidiana, a regra, pura.
//
// ⚠️ A MOLDURA NÃO SE DESENHA: ELA SE RECONHECE. O jogador empilha obsidiana do
// jeito dele e acende um ponto qualquer do vão; quem decide se aquilo é um
// portal é esta busca, a partir do ponto aceso. Exigir que ele construísse uma
// forma exata, ou clicasse num canto específico, seria o jogo dizendo ao
// jogador como ele deve empilhar blocos.
//
// ⚠️ O CANTO NÃO ENTRA, e é de propósito (é assim no original). O que tem que
// ser obsidiana é o ANEL de lados, base e topo — os quatro cantos podem ser
// qualquer coisa. Exigir canto quebraria a moldura de 4×5 que todo mundo
// conhece, que é a menor que se faz com dez blocos de obsidiana.
//
import { AIR, ID } from './blocks.js'

/** Vão mínimo e máximo, em blocos. O 2×3 é a moldura clássica de dez peças. */
export const LARGURA_MINIMA = 2
export const ALTURA_MINIMA = 3
export const LADO_MAXIMO = 21

/**
 * Os dois eixos possíveis do plano do portal.
 *
 * `x` quer dizer que o vão se estende no eixo X (e o jogador atravessa andando
 * em Z). São dois blocos diferentes no mundo porque a face do portal tem
 * orientação, e um portal só teria como saber a dele pelo id.
 */
export const EIXOS = [
  { eixo: 'x', dx: 1, dz: 0 },
  { eixo: 'z', dx: 0, dz: 1 },
]

export const ehPortal = (id) => id === ID.netherPortalX || id === ID.netherPortalZ
export const idDoPortal = (eixo) => (eixo === 'x' ? ID.netherPortalX : ID.netherPortalZ)

/**
 * O vão é atravessável aqui?
 *
 * Ar conta, e portal aceso também: reacender um portal que já existe tem que
 * achar a mesma moldura, senão quebrar um bloco do vão e recolocá-lo deixaria o
 * portal impossível de refazer.
 */
const vago = (id) => id === AIR || ehPortal(id)

/**
 * Caminha de (x, y, z) na direção (dx, dy, dz) enquanto o vão estiver vago, e
 * devolve quantos passos deu antes de encontrar obsidiana — ou −1 se encontrou
 * outra coisa, ou se andou mais que o lado máximo.
 */
function ateAObsidiana(blocoEm, x, y, z, dx, dy, dz) {
  for (let n = 0; n <= LADO_MAXIMO; n++) {
    const id = blocoEm(x + dx * n, y + dy * n, z + dz * n)
    if (id === ID.obsidian) return n
    if (!vago(id)) return -1
  }
  return -1
}

/**
 * A moldura que contém este ponto, no eixo dado — ou `null`.
 *
 * Devolve `{ eixo, celulas, largura, altura }`, com `celulas` em coordenada
 * absoluta e na ordem em que devem ser escritas.
 */
export function molduraNoEixo(blocoEm, x, y, z, { eixo, dx, dz }) {
  if (!vago(blocoEm(x, y, z))) return null

  // 1. Os quatro limites, medidos a partir do ponto aceso.
  const menos = ateAObsidiana(blocoEm, x, y, z, -dx, 0, -dz)
  const mais = ateAObsidiana(blocoEm, x, y, z, dx, 0, dz)
  const baixo = ateAObsidiana(blocoEm, x, y, z, 0, -1, 0)
  const cima = ateAObsidiana(blocoEm, x, y, z, 0, 1, 0)
  if (menos < 1 || mais < 1 || baixo < 1 || cima < 1) return null

  const largura = menos + mais - 1
  const altura = baixo + cima - 1
  if (largura < LARGURA_MINIMA || largura > LADO_MAXIMO) return null
  if (altura < ALTURA_MINIMA || altura > LADO_MAXIMO) return null

  const x0 = x - dx * (menos - 1)
  const z0 = z - dz * (menos - 1)
  const y0 = y - (baixo - 1)

  // 2. ⚠️ MEDIR NÃO É VERIFICAR. Os limites vieram de UMA linha e UMA coluna: o
  // resto da moldura pode ter um buraco, e um vão com buraco vira portal que
  // sobra para fora da pedra. Cada célula do vão e cada peça do anel é
  // conferida abaixo — foi o primeiro corte que eu quis pular.
  const celulas = []
  for (let i = 0; i < largura; i++) {
    for (let j = 0; j < altura; j++) {
      const cx = x0 + dx * i
      const cz = z0 + dz * i
      const cy = y0 + j
      if (!vago(blocoEm(cx, cy, cz))) return null
      celulas.push({ x: cx, y: cy, z: cz })
    }
    // base e topo desta coluna do vão
    if (blocoEm(x0 + dx * i, y0 - 1, z0 + dz * i) !== ID.obsidian) return null
    if (blocoEm(x0 + dx * i, y0 + altura, z0 + dz * i) !== ID.obsidian) return null
  }
  for (let j = 0; j < altura; j++) {
    if (blocoEm(x0 - dx, y0 + j, z0 - dz) !== ID.obsidian) return null
    if (blocoEm(x0 + dx * largura, y0 + j, z0 + dz * largura) !== ID.obsidian) return null
  }

  return { eixo, celulas, largura, altura }
}

/**
 * A moldura acesa a partir deste ponto, tentando os dois eixos — ou `null`.
 *
 * A ordem importa pouco e é fixa mesmo assim: uma moldura só pode valer nos
 * dois eixos se o jogador construiu uma caixa, e nesse caso qualquer resposta é
 * arbitrária. Fixa é melhor que aleatória porque é reproduzível.
 */
export function acharMoldura(blocoEm, x, y, z) {
  for (const eixo of EIXOS) {
    const m = molduraNoEixo(blocoEm, x, y, z, eixo)
    if (m) return m
  }
  return null
}

/**
 * As células a escrever para acender. Vazio quando não há moldura, ou quando
 * ela já está inteira acesa — e o vazio importa: quem chama não deve gastar o
 * isqueiro nem tocar o som se nada mudou.
 */
export function acender(blocoEm, x, y, z) {
  const m = acharMoldura(blocoEm, x, y, z)
  if (!m) return []
  const id = idDoPortal(m.eixo)
  return m.celulas.filter((c) => blocoEm(c.x, c.y, c.z) !== id).map((c) => ({ ...c, id }))
}

/**
 * O portal se APAGA quando a moldura quebra.
 *
 * ⚠️ SEM ISTO O PORTAL FLUTUA. Quebrar uma obsidiana da base deixaria o plano
 * de fogo roxo pendurado no ar, e — pior — atravessável: o jogador viajaria por
 * um portal que já não existe. Aqui a regra é a mesma do acendimento lida ao
 * contrário: a partir de uma célula de portal, se não há mais moldura válida,
 * todas as células ligadas a ela se apagam.
 *
 * A busca é por LIGAÇÃO e não por retângulo: o vão já pode estar quebrado, e é
 * justamente o caso em que se precisa apagar.
 */
export function apagar(blocoEm, x, y, z) {
  const idAqui = blocoEm(x, y, z)
  if (!ehPortal(idAqui)) return []
  const eixo = idAqui === ID.netherPortalX ? EIXOS[0] : EIXOS[1]
  const vistos = new Set([`${x},${y},${z}`])
  const fila = [{ x, y, z }]
  const achados = []
  while (fila.length) {
    const c = fila.pop()
    achados.push({ ...c, id: AIR })
    const vizinhos = [
      { x: c.x + eixo.dx, y: c.y, z: c.z + eixo.dz },
      { x: c.x - eixo.dx, y: c.y, z: c.z - eixo.dz },
      { x: c.x, y: c.y + 1, z: c.z },
      { x: c.x, y: c.y - 1, z: c.z },
    ]
    for (const v of vizinhos) {
      const k = `${v.x},${v.y},${v.z}`
      if (vistos.has(k)) continue
      if (blocoEm(v.x, v.y, v.z) !== idAqui) continue
      // Teto de segurança: o maior portal possível tem 21 × 21 células.
      if (achados.length + fila.length > LADO_MAXIMO * LADO_MAXIMO) return []
      vistos.add(k)
      fila.push(v)
    }
  }
  // Ainda há moldura? Então não é para apagar nada.
  if (molduraNoEixo(blocoEm, x, y, z, eixo)) return []
  return achados
}
