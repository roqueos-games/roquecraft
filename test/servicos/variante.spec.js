import { describe, it, expect } from 'vitest'
import {
  idParaColocar,
  paredeDaTocha,
  podePendurarTocha,
  PAREDE_DA_FACE,
} from '../../src/servicos/variante.js'
import { ID, BLOCK_BY_KEY, blockDef, TOCHA_DE_PAREDE } from '../../src/servicos/blocks.js'

// ⚠️ O QUE ESTE ARQUIVO SEGURA: a peca virada pro lado certo.
//
// Escolher a variante errada nao levanta erro nenhum. Levanta uma tocha
// pendurada do lado de fora da parede, ou um portao de lado que nao da passagem
// -- e o jogador so descobre quando tenta atravessar.
//
// Isto morava num ternario aninhado de quatro niveis dentro de `doPlace`, e nao
// tinha teste: para chegar nele era preciso raycast, mundo e motor.

const TOCHA = BLOCK_BY_KEY.torch.id
const PEDRA = BLOCK_BY_KEY.stone.id
const VIDRO = BLOCK_BY_KEY.glass.id
const TABUA = BLOCK_BY_KEY.oakPlanks.id
const OLHAR_LESTE = { x: 1, z: 0 }

describe('paredeDaTocha: a parede e o OPOSTO da face clicada', () => {
  it('os quatro lados apontam de volta pro bloco em que se clicou', () => {
    // Trocar os dois pendura a tocha do lado de fora, flutuando no ar.
    expect(paredeDaTocha(0)).toBe(1)
    expect(paredeDaTocha(1)).toBe(0)
    expect(paredeDaTocha(4)).toBe(5)
    expect(paredeDaTocha(5)).toBe(4)
  })

  it('topo e base nao penduram nada: la a tocha e de chao', () => {
    expect(paredeDaTocha(2)).toBe(-1)
    expect(paredeDaTocha(3)).toBe(-1)
  })

  it('a tabela e uma involucao: aplicar duas vezes volta a face', () => {
    for (const f of Object.keys(PAREDE_DA_FACE).map(Number)) {
      expect(paredeDaTocha(paredeDaTocha(f))).toBe(f)
    }
  })

  it('face fora da faixa nao vira uma parede qualquer', () => {
    expect(paredeDaTocha(9)).toBe(-1)
    expect(paredeDaTocha(undefined)).toBe(-1)
  })
})

describe('podePendurarTocha: so em parede opaca', () => {
  it('em pedra, sim', () => {
    expect(podePendurarTocha({ blockId: TOCHA, face: 0, alvoId: PEDRA })).toBe(true)
  })

  it('em vidro, NAO: a peca ficaria no ar com o pe enfiado em nada', () => {
    expect(blockDef(VIDRO)?.opaque).toBeFalsy()
    expect(podePendurarTocha({ blockId: TOCHA, face: 0, alvoId: VIDRO })).toBe(false)
  })

  it('no topo do bloco, nao: ali entra a tocha de chao', () => {
    expect(podePendurarTocha({ blockId: TOCHA, face: 2, alvoId: PEDRA })).toBe(false)
  })

  it('so a tocha se pendura: pedra na parede continua pedra', () => {
    expect(podePendurarTocha({ blockId: PEDRA, face: 0, alvoId: PEDRA })).toBe(false)
  })
})

describe('idParaColocar: a ordem das perguntas E a regra', () => {
  it('o encaixe vence tudo: uma laje nao vira tocha por acaso da face', () => {
    // Se a tocha viesse antes, clicar na lateral com uma laje na mao poderia
    // trocar a peca no meio do caminho.
    const encaixe = { id: 999, dupla: false }
    expect(
      idParaColocar({ blockId: TOCHA, encaixe, face: 0, olhar: OLHAR_LESTE, alvoId: PEDRA }),
    ).toBe(999)
  })

  it('tocha na lateral de pedra vira a variante de PAREDE daquele lado', () => {
    const id = idParaColocar({
      blockId: TOCHA,
      encaixe: null,
      face: 4,
      olhar: OLHAR_LESTE,
      alvoId: PEDRA,
    })
    expect(id).toBe(ID[TOCHA_DE_PAREDE[5]])
    expect(blockDef(id)?.tocha?.parede).toBe(5)
  })

  it('cada face lateral da uma variante DIFERENTE', () => {
    const ids = [0, 1, 4, 5].map((face) =>
      idParaColocar({ blockId: TOCHA, encaixe: null, face, olhar: OLHAR_LESTE, alvoId: PEDRA }),
    )
    expect(new Set(ids).size).toBe(4)
  })

  it('tocha no topo continua tocha de chao', () => {
    expect(
      idParaColocar({ blockId: TOCHA, encaixe: null, face: 2, olhar: OLHAR_LESTE, alvoId: PEDRA }),
    ).toBe(TOCHA)
  })

  it('tocha contra vidro continua tocha de chao', () => {
    expect(
      idParaColocar({ blockId: TOCHA, encaixe: null, face: 0, olhar: OLHAR_LESTE, alvoId: VIDRO }),
    ).toBe(TOCHA)
  })

  it('o portao nasce VIRADO PRO JOGADOR, e fechado', () => {
    // ⚠️ O BLOCO DO ITEM É O PORTÃO, não a tábua. Este teste colocava TABUA e
    // esperava portão — e prendia um defeito de 25/08: tábua de carvalho
    // virava portão ao ser colocada, e o item de portão nascia sempre na mesma
    // orientação (`PORTAO_DO_BLOCO` no lugar de `BLOCO_DO_PORTAO`).
    const PORTAO = BLOCK_BY_KEY.oakGate.id
    const olhando = (x, z) =>
      idParaColocar({ blockId: PORTAO, encaixe: null, face: 2, olhar: { x, z }, alvoId: PEDRA })
    const leste = olhando(1, 0)
    const norte = olhando(0, -1)
    expect(blockDef(leste)?.key).toMatch(/oakGate/)
    // Fechado: um portao que nasce aberto deixa passar sem que ninguem tenha
    // aberto, e cerca com portao aberto nao e cerca.
    expect(blockDef(leste)?.key).not.toMatch(/Aberto/)
    // Olhar para o leste e olhar para o norte dao variantes distintas: e isso
    // que faz o vao ficar perpendicular a quem colocou.
    expect(leste).not.toBe(norte)
  })

  it('o mesmo bloco fora do portao continua ele mesmo', () => {
    expect(
      idParaColocar({ blockId: PEDRA, encaixe: null, face: 2, olhar: OLHAR_LESTE, alvoId: PEDRA }),
    ).toBe(PEDRA)
    // A TÁBUA CONTINUA TÁBUA. Era ela que virava portão.
    expect(
      idParaColocar({ blockId: TABUA, encaixe: null, face: 2, olhar: OLHAR_LESTE, alvoId: PEDRA }),
    ).toBe(TABUA)
  })

  it('nunca devolve undefined: sempre ha um id pra escrever', () => {
    for (const blockId of [TOCHA, PEDRA, TABUA, VIDRO]) {
      for (const face of [0, 1, 2, 3, 4, 5]) {
        const id = idParaColocar({
          blockId,
          encaixe: null,
          face,
          olhar: OLHAR_LESTE,
          alvoId: PEDRA,
        })
        expect(Number.isFinite(id), `${blockId} na face ${face}`).toBe(true)
      }
    }
  })
})

describe('variante — as três condições da tocha de parede', () => {
  const tocha = BLOCK_BY_KEY.torch.id
  const pedra = BLOCK_BY_KEY.stone.id
  const vidro = BLOCK_BY_KEY.glass.id

  it('a face 0 (+x) é uma face de parede válida — o índice 0 conta', () => {
    // `paredeDaTocha(face) >= 0`: a tabela devolve a parede OPOSTA, e para a
    // face +x essa parede é a de índice 0. Apertado para `>`, a face que
    // devolve exatamente 0 deixa de valer, e pendurar tocha numa das quatro
    // paredes para de funcionar — só nessa.
    expect(paredeDaTocha(1)).toBe(0)
    expect(podePendurarTocha({ blockId: tocha, face: 1, alvoId: pedra })).toBe(true)
  })

  it('as quatro paredes valem; topo e base não', () => {
    expect(podePendurarTocha({ blockId: tocha, face: 0, alvoId: pedra })).toBe(true)
    expect(podePendurarTocha({ blockId: tocha, face: 4, alvoId: pedra })).toBe(true)
    expect(podePendurarTocha({ blockId: tocha, face: 5, alvoId: pedra })).toBe(true)
    expect(podePendurarTocha({ blockId: tocha, face: 2, alvoId: pedra })).toBe(false)
    expect(podePendurarTocha({ blockId: tocha, face: 3, alvoId: pedra })).toBe(false)
  })

  it('as três condições valem JUNTAS, não em alternativa', () => {
    // Os dois `&&` viram `||` e cada um estraga de um jeito: com o primeiro,
    // QUALQUER bloco vira tocha de parede; com o segundo, a tocha se pendura em
    // vidro e folhagem, e a peça fica no ar com o pé enfiado em nada.
    expect(podePendurarTocha({ blockId: pedra, face: 0, alvoId: pedra })).toBe(false)
    expect(podePendurarTocha({ blockId: tocha, face: 0, alvoId: vidro })).toBe(false)
    expect(podePendurarTocha({ blockId: tocha, face: 2, alvoId: pedra })).toBe(false)
  })

  it('só a tocha pendura — nem o bloco parecido', () => {
    // `blockDef(blockId)?.key === 'torch'` invertido faz TODO bloco que não é
    // tocha virar tocha de parede.
    expect(podePendurarTocha({ blockId: vidro, face: 0, alvoId: pedra })).toBe(false)
    expect(podePendurarTocha({ blockId: undefined, face: 0, alvoId: pedra })).toBe(false)
  })
})
