// RoqueCraft — O MINIMAPA: o que existe no mapa, visto de cima.
//
// ⚠️ ELE NÃO PERGUNTA AO MUNDO CARREGADO, e é exatamente isso que o torna útil.
//
// O founder voou o mapa inteiro e não achou vila nem castelo (14/09/2026). Não
// estava quebrado: uma vila a cada ~1.180 blocos e um castelo a cada ~1.410
// significam que quem voa em linha reta passa longe de todos. O problema nunca
// foi a densidade — foi não haver instrumento nenhum que dissesse PARA QUE LADO.
//
// Um minimapa que só desenhasse chunk carregado não resolveria nada: o raio de
// render vai a 16 chunks (256 blocos), menos de um quarto da distância entre
// duas vilas. Ele mostraria sempre um campo vazio, que é a mesma resposta que o
// jogador já tinha olhando pela janela.
//
// Por isso aqui tudo sai do RUÍDO PURO — `terrainHeight`, `biomeAt`,
// `planoDaAldeia`, `planoDoCastelo` — as mesmas funções que o `worldgen` usa.
// Função pura da coordenada e da semente responde de qualquer distância e
// concorda com o mundo POR CONSTRUÇÃO, sem nada precisar estar gerado. É a
// mesma escolha, e pelo mesmo motivo, que `qaDeAldeia.js` documenta.
//
// ⚠️ E É SERVIÇO, NÃO COMPOSABLE: nada aqui guarda timer, canvas ou assinatura.
// Entra coordenada, sai número e cor. Quem tem `setInterval` e `<canvas>` é o
// `RCMinimapa.vue` — e é por isso que este arquivo tem teste de unidade e o
// componente não precisa de um para provar a conta.

import {
  BIOMES,
  BIOME_NAMES,
  biomeAt,
  createNoiseContext,
  solidTopAt,
  terrainHeight,
} from './worldgen.js'
import { CHUNK_SIZE, SEA_LEVEL } from './constants.js'
import { BIOMAS_DA_ALDEIA, CELULA, planoDaAldeia } from './aldeia.js'
import { BIOMAS_DO_CASTELO, CELULA_DO_CASTELO, planoDoCastelo } from './castelo.js'
import { hash3 } from './noise.js'

/**
 * Quantos blocos cabem num pixel do mapa.
 *
 * Dois, e não um: com 1 bloco por pixel um mapa de 132 px mostraria 132 blocos
 * — meia distância de render. Com 2 ele mostra 264, que já é terreno que o
 * jogador NÃO está vendo, que é a única informação que um mapa acrescenta.
 */
export const BLOCOS_POR_PIXEL = 2

/**
 * O lado da peça do cache, em pixels.
 *
 * ⚠️ O NÚMERO É ORÇAMENTO DE QUADRO, e não estética. Amostrar uma peça custa
 * `(LADO+1)²` pares de `terrainHeight`+`biomeAt`. Medido nesta máquina em
 * 14/09/2026: 4.096 amostras em 7,5 ms, ou ~1,8 µs cada. Com LADO 32 a peça sai
 * por ~2 ms e o componente gera NO MÁXIMO UMA POR TIQUE — 2 ms a cada 110 ms,
 * ou menos de 2% do relógio, num orçamento que é do render.
 *
 * Dobrar para 64 economizaria 4× em chamadas de `drawImage` e custaria 7,5 ms
 * num quadro só, que é meio quadro perdido a cada peça nova. Não vale.
 */
export const LADO_DA_PECA = 32

/** O lado da peça em BLOCOS. Derivado: peça e pixel não podem divergir. */
export const BLOCOS_DA_PECA = LADO_DA_PECA * BLOCOS_POR_PIXEL

/**
 * Até onde o minimapa procura vila e castelo, em blocos.
 *
 * ⚠️ MUITO MAIOR QUE O TERRENO DESENHADO, de propósito. O terreno vai a ~132
 * blocos do centro; a marca vai a 1.600 e, quando cai fora do disco, é PRESA NA
 * BORDA com a distância escrita ao lado. Um mapa que só mostrasse o que cabe na
 * moldura repetiria o problema que ele existe para resolver.
 *
 * 1.600 blocos cobrem, na média medida na onda 8, uma vila e um castelo.
 */
export const ALCANCE_DAS_MARCAS = 1600

/** Quanto a marca presa na borda recua para caber dentro do traço do disco. */
export const MARGEM_DA_BORDA = 7

/**
 * Cor de cada bioma, em sRGB 0-255.
 *
 * ⚠️ NÃO É `BIOME_TINT`. Aquilo é multiplicador de albedo LINEAR para o shader,
 * e serve para tingir grama sobre textura. Aqui a cor é a cor final de um pixel
 * de mapa, escolhida para SEPARAR bioma de bioma a 2 blocos por pixel — que é o
 * oposto do critério de lá, onde o vizinho tem que parecer contínuo.
 */
export const COR_DO_BIOMA = Object.freeze({
  [BIOMES.ocean]: [40, 74, 129],
  [BIOMES.beach]: [214, 198, 142],
  [BIOMES.plains]: [124, 168, 84],
  [BIOMES.forest]: [70, 122, 60],
  [BIOMES.desert]: [222, 204, 138],
  [BIOMES.savanna]: [172, 168, 92],
  [BIOMES.jungle]: [54, 125, 52],
  [BIOMES.taiga]: [84, 122, 100],
  [BIOMES.snowy]: [228, 234, 240],
  [BIOMES.mountains]: [136, 133, 131],
  [BIOMES.swamp]: [88, 108, 76],
})

/** Cor de recuo: bioma que o mapa não conhece sai cinza, e não invisível. */
export const COR_DESCONHECIDA = Object.freeze([120, 120, 120])

/** Quanto a água escurece do raso para o fundo, em blocos abaixo do nível. */
export const FUNDURA_CHEIA = 22

/**
 * A cor de UMA amostra.
 *
 * ⚠️ A ÁGUA MANDA ANTES DO BIOMA. `biomeAt` só devolve `ocean` abaixo de
 * `nivelDoMar - 3`: um lago dentro da planície volta como `plains`, e o mapa
 * pintaria de verde a coisa mais fácil de reconhecer de cima. Rio e lago são o
 * que faz um mapa ser legível — eles vêm primeiro.
 */
export function corDaAmostra(bioma, altura, nivelDoMar) {
  if (altura < nivelDoMar) {
    const f = Math.min(1, (nivelDoMar - altura) / FUNDURA_CHEIA)
    return [Math.round(58 - 26 * f), Math.round(106 - 46 * f), Math.round(154 - 44 * f)]
  }
  return COR_DO_BIOMA[bioma] ?? COR_DESCONHECIDA
}

/** Quanto um bloco de desnível mexe no brilho. */
export const GANHO_DO_RELEVO = 0.05
/** Teto do relevo, para o penhasco não virar preto nem branco puro. */
export const LIMITE_DO_RELEVO = 0.4

/**
 * O sombreado de encosta, com a luz vindo do NOROESTE.
 *
 * Sem ele o mapa é uma mancha chapada de bioma e o jogador não distingue morro
 * de planície — que é metade do que ele procura quando abre um mapa. A conta
 * usa o vizinho a sudeste, que a varredura da peça JÁ amostrou: o custo do
 * relevo é uma franja de uma amostra, e não um segundo passe.
 *
 * Vizinho mais baixo = encosta caindo para sudeste = de costas para a luz.
 */
export const relevo = (altura, vizinhoSudeste) =>
  1 +
  Math.max(
    -LIMITE_DO_RELEVO,
    Math.min(LIMITE_DO_RELEVO, (vizinhoSudeste - altura) * GANHO_DO_RELEVO),
  )

/**
 * Amostra altura e bioma de uma peça, COM UMA FRANJA de uma amostra.
 *
 * @param {object} mundo  `{ alturaEm(x,z), biomaEm(x,z,altura) }`
 * @param {number} bx  canto noroeste da peça, em blocos (múltiplo de BLOCOS_DA_PECA)
 * @param {number} bz
 */
export function campoDaPeca(mundo, bx, bz) {
  const lado = LADO_DA_PECA + 1
  const altura = new Int16Array(lado * lado)
  const bioma = new Uint8Array(lado * lado)
  for (let j = 0; j < lado; j++) {
    for (let i = 0; i < lado; i++) {
      const x = bx + i * BLOCOS_POR_PIXEL
      const z = bz + j * BLOCOS_POR_PIXEL
      const h = mundo.alturaEm(x, z)
      altura[j * lado + i] = h
      bioma[j * lado + i] = mundo.biomaEm(x, z, h)
    }
  }
  return { lado, altura, bioma }
}

/** O campo virado em RGBA de `LADO_DA_PECA²`, pronto para `putImageData`. */
export function pintarPeca(campo, nivelDoMar) {
  const { lado, altura, bioma } = campo
  const n = LADO_DA_PECA
  const rgba = new Uint8ClampedArray(n * n * 4)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * lado + i
      const h = altura[k]
      const cor = corDaAmostra(bioma[k], h, nivelDoMar)
      const luz = relevo(h, altura[(j + 1) * lado + i + 1])
      const o = (j * n + i) * 4
      rgba[o] = cor[0] * luz
      rgba[o + 1] = cor[1] * luz
      rgba[o + 2] = cor[2] * luz
      rgba[o + 3] = 255
    }
  }
  return rgba
}

/** O canto noroeste da peça que contém esta coordenada. */
export const cantoDaPeca = (v) => Math.floor(v / BLOCOS_DA_PECA) * BLOCOS_DA_PECA

/**
 * As células da grade cujo centro PODE cair dentro do alcance.
 *
 * Devolve coordenadas de CHUNK, que é o que `planoDaAldeia` e `planoDoCastelo`
 * recebem. Varrer por bloco aqui seria reimplementar a grade deles — e sonda
 * que reimplementa o gerador testa a própria conta.
 */
export function celulasNoAlcance(celulaEmChunks, centro, alcance) {
  const lado = celulaEmChunks * CHUNK_SIZE
  const saida = []
  const de = (v) => Math.floor((v - alcance) / lado)
  const ate = (v) => Math.floor((v + alcance) / lado)
  for (let gx = de(centro.x); gx <= ate(centro.x); gx++) {
    for (let gz = de(centro.z); gz <= ate(centro.z); gz++) {
      saida.push([gx * celulaEmChunks, gz * celulaEmChunks])
    }
  }
  return saida
}

/**
 * Tudo que o minimapa marca, ordenado da mais perto para a mais longe.
 *
 * @param {object} e
 * @param {(cx:number, cz:number) => object|null} e.vilaEm  plano da aldeia da célula
 * @param {(cx:number, cz:number) => object|null} e.casteloEm  plano do castelo da célula
 * @param {{x:number, z:number}} e.centro  onde o jogador está
 * @param {number} [e.alcance]
 * @returns {Array<{tipo:string, x:number, z:number, distancia:number}>}
 */
export function marcasDoMinimapa({ vilaEm, casteloEm, centro, alcance = ALCANCE_DAS_MARCAS }) {
  const marcas = []
  const juntar = (celula, achar, tipoDe) => {
    for (const [cx, cz] of celulasNoAlcance(celula, centro, alcance)) {
      const plano = achar(cx, cz)
      if (!plano) continue
      const distancia = Math.hypot(plano.centro.x - centro.x, plano.centro.z - centro.z)
      if (distancia > alcance) continue
      marcas.push({ tipo: tipoDe(plano), x: plano.centro.x, z: plano.centro.z, distancia })
    }
  }
  if (vilaEm) juntar(CELULA, vilaEm, () => 'vila')
  // ⚠️ RUÍNA É OUTRA MARCA. São 42% dos castelos e o jogador que anda 1.400
  // blocos atrás de um castelo inteiro e acha uma ruína tem direito de saber
  // antes de andar — e quem procura ruína, idem.
  if (casteloEm) juntar(CELULA_DO_CASTELO, casteloEm, (p) => (p.ruina ? 'ruina' : 'castelo'))
  return marcas.sort((a, b) => a.distancia - b.distancia)
}

/**
 * Onde a marca cai no disco do minimapa, PRESA NA BORDA quando está fora.
 *
 * `fora: true` é o que diz ao desenho para virar seta em vez de quadrado: a
 * posição presa mente sobre a distância de propósito, e quem mente precisa
 * avisar.
 */
export function projetar(marca, centro, raioEmPx, blocosPorPixel = BLOCOS_POR_PIXEL) {
  let px = (marca.x - centro.x) / blocosPorPixel
  let pz = (marca.z - centro.z) / blocosPorPixel
  const d = Math.hypot(px, pz)
  const limite = Math.max(0, raioEmPx - MARGEM_DA_BORDA)
  const fora = d > limite
  if (fora && d > 0) {
    px = (px / d) * limite
    pz = (pz / d) * limite
  }
  return { px, pz, fora }
}

/**
 * Distância em texto curto. Sem palavra e sem separador decimal de idioma:
 * o rótulo cabe em 34 px ao lado de uma seta e é lido igual nos dez idiomas.
 */
export function distanciaCurta(blocos) {
  if (blocos < 1000) return `${Math.round(blocos)}`
  return `${(blocos / 1000).toFixed(1)}k`
}

/**
 * A fiação do minimapa para UMA semente: onde pintar e onde marcar.
 *
 * ⚠️ DUAS ALTURAS DIFERENTES, E ISSO NÃO É DESCUIDO.
 *
 * O desenho usa `terrainHeight` — a altura do relevo, sem descer a densidade
 * 3D. É o que o mapa precisa (a caverna sob o morro não muda a cor do morro) e
 * custa um terço.
 *
 * O PLANO da vila e do castelo usa `solidTopAt`, porque é o que o `worldgen`
 * usa: trocar a função aqui faria o minimapa aceitar terreno que o gerador
 * recusa, e o jogador andaria 1.400 blocos até uma vila que não existe. Marca
 * errada num mapa é pior que mapa nenhum.
 */
export function mundoDoMinimapa(semente) {
  const nz = createNoiseContext(semente)
  const hash = (a, b, c) => hash3(a, b, c, semente)
  const alturaDoPlano = (x, z) => solidTopAt(nz, x, z)
  const biomaDoPonto = (x, z) => biomeAt(nz, x, z, terrainHeight(nz, x, z))
  const base = { alturaEm: alturaDoPlano, nivelDoMar: SEA_LEVEL, biomaEm: biomaDoPonto }
  return {
    nivelDoMar: SEA_LEVEL,
    // Para pintar: barato, e sem passar pela densidade.
    alturaEm: (x, z) => terrainHeight(nz, x, z),
    biomaEm: (x, z, altura) => biomeAt(nz, x, z, altura),
    vilaEm: (cx, cz) =>
      planoDaAldeia(
        hash,
        { ...base, biomaAceito: (b) => BIOMAS_DA_ALDEIA.includes(BIOME_NAMES[b]) },
        cx,
        cz,
      ),
    casteloEm: (cx, cz) =>
      planoDoCastelo(
        hash,
        { ...base, biomaAceito: (b) => BIOMAS_DO_CASTELO.includes(BIOME_NAMES[b]) },
        cx,
        cz,
      ),
  }
}

// ── AS CORES DO DESENHO ─────────────────────────────────────────────────────
//
// ⚠️ ELAS MORAM AQUI, E NÃO NO `.vue`. Não é arrumação: `cores-cravadas.spec.js`
// reprova cor dentro de regra de CSS, e o desenho do minimapa é CANVAS — a cor
// entra como argumento de `fillStyle`, não como declaração. Mantê-las no
// serviço deixa o componente sem uma única cor e põe a paleta onde o teste de
// unidade alcança.

/** A marca de cada tipo de estrutura, em sRGB 0-255. */
export const COR_DA_MARCA = Object.freeze({
  vila: [244, 201, 96],
  castelo: [230, 234, 242],
  ruina: [152, 138, 114],
})

/** Contorno de tudo que é desenhado por cima do terreno. */
export const COR_DO_CONTORNO = 'rgba(10, 10, 12, 0.88)'

/** O jogador. Branco: é a única marca que precisa ganhar de qualquer bioma. */
export const COR_DO_JOGADOR = 'rgba(255, 255, 255, 0.95)'

/** O fundo da peça que ainda não foi amostrada. */
export const COR_DO_VAZIO = 'rgb(24, 26, 30)'

/** `[r,g,b]` em `rgb()`, para `fillStyle`. */
export const emCss = (rgb) => `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`

/**
 * Quantas marcas o mapa desenha, da mais perto para a mais longe.
 *
 * ⚠️ TEM TETO PORQUE UM MAPA CHEIO NÃO INFORMA NADA. Num alcance de 1.600
 * blocos cabem ~30 estruturas; presas na borda elas viram um colar de setas em
 * que nenhuma se lê. Oito é o que ainda se conta de relance.
 */
export const MARCAS_DESENHADAS = 8
