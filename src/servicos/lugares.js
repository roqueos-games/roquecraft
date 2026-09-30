// RoqueCraft — OS LUGARES DO MUNDO, pela semente (Goal 23, onda 4).
//
// O menu K leva ao nascimento, à cama, à fortaleza e à vila. Três deles são
// função pura da semente, e é assim que têm de ser achados: perguntar ao mundo
// carregado (`world.surfaceY`) não acha vila nenhuma, porque a vila mais
// próxima costuma estar a milhares de blocos de tudo que já foi gerado. A sonda
// de aldeia aprendeu isso em 26/08 (`qaDeAldeia.js`), e a regra dela mora aqui
// agora, para o jogo e a sonda perguntarem à MESMA conta.
//
// A cama não é da semente: é do save (`renascimento`), e quem a conhece é o
// componente. Ela entra em `useRoqueCraftCriativo` pela porta `lugar`.
import {
  BIOME_NAMES,
  createNoiseContext,
  findSpawn,
  solidTopAt,
  terrainHeight,
  biomeAt,
} from './worldgen.js'
import { hash3 } from './noise.js'
import { SEA_LEVEL } from './constants.js'
import { BIOMAS_DA_ALDEIA, CELULA, planoDaAldeia } from './aldeia.js'
import { MATERIAIS } from './vilaCasa.js'
import { fortalezaDaSemente } from './geradores.js'

/** Quantas células a vila é procurada em volta da origem, em anéis. */
export const ANEIS_DA_VILA = 6

/**
 * O plano da vila cuja célula contém `(cx, cz)`, ou `null`. O mundo responde
 * pelo ruído da semente: `solidTopAt` e `biomeAt` são as funções que o gerador
 * usa, então a resposta concorda com o terreno por construção.
 */
export function planoDaVilaEm(nz, semente, cx, cz, porte = 'vila') {
  return planoDaAldeia(
    (a, b, c) => hash3(a, b, c, semente),
    {
      alturaEm: (x, z) => solidTopAt(nz, x, z),
      nivelDoMar: SEA_LEVEL,
      biomaEm: (x, z) => biomeAt(nz, x, z, terrainHeight(nz, x, z)),
      biomaAceito: (b) => BIOMAS_DA_ALDEIA.includes(BIOME_NAMES[b]),
      materialDaVila: (c) =>
        BIOME_NAMES[biomeAt(nz, c.x, c.z, terrainHeight(nz, c.x, c.z))] === 'savanna'
          ? MATERIAIS.pinho
          : MATERIAIS.carvalho,
    },
    cx,
    cz,
    porte,
  )
}

/** A vila mais perto da origem, varrendo as células em espiral; `null` se não há. */
export function vilaMaisPertoDaOrigem(nz, semente, larguraEmCelulas = ANEIS_DA_VILA) {
  for (let anel = 0; anel <= larguraEmCelulas; anel++) {
    for (let gx = -anel; gx <= anel; gx++) {
      for (let gz = -anel; gz <= anel; gz++) {
        if (Math.max(Math.abs(gx), Math.abs(gz)) !== anel) continue
        const plano = planoDaVilaEm(nz, semente, gx * CELULA, gz * CELULA)
        if (plano) return { ...plano, anel }
      }
    }
  }
  return null
}

/**
 * Quem sabe onde cada lugar fica NESTA semente. Cada resposta é
 * `{ dimensao, x, y, z }` (o Y é o de um pé no chão), ou `null` quando o lugar
 * não existe. As contas caras (`findSpawn`, a espiral da vila) ficam guardadas
 * por semente: o jogador clica no mesmo botão mais de uma vez.
 *
 * @param {{ semente: () => number }} ctx
 */
export function criarLocalizadorDeLugares({ semente }) {
  let nz = null
  let nzDe = null
  let guardado = {}
  const ruido = () => {
    const s = semente()
    if (nz === null || nzDe !== s) {
      nz = createNoiseContext(s)
      nzDe = s
      guardado = {}
    }
    return nz
  }
  const lembrado = (chave, calcular) => {
    ruido()
    if (!(chave in guardado)) guardado[chave] = calcular()
    return guardado[chave]
  }
  const noSupermundo = (p) => (p ? { dimensao: 'overworld', x: p.x, y: p.y, z: p.z } : null)

  return {
    nascimento: () => lembrado('nascimento', () => noSupermundo(findSpawn(ruido()))),
    fortaleza: () =>
      lembrado('fortaleza', () => {
        const f = fortalezaDaSemente(semente())
        if (!f?.centro) return null
        // A boca do poço fica na superfície, em cima da sala: é onde se chega.
        return noSupermundo({ x: f.centro.x, y: f.centro.chao + 1, z: f.centro.z })
      }),
    vila: () =>
      lembrado('vila', () => {
        const v = vilaMaisPertoDaOrigem(ruido(), semente())
        return v ? noSupermundo({ x: v.centro.x, y: v.chao + 1, z: v.centro.z }) : null
      }),
  }
}
