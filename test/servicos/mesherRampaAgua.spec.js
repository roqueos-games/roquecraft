import { describe, it, expect } from 'vitest'
import { meshSection } from '../../src/servicos/mesher.js'
import { BLOCK_BY_KEY, AIR, ALTURA_LIQUIDA, ID_DE_NIVEL, AGUA } from '../../src/servicos/blocks.js'

// "os vertices do quadrado deveriam ficar na diagonal, da forma que ficou,
// ficou espacos entre os diferentes niveis de agua" — founder, 25/08/2026, com
// print da praia.
//
// O diagnóstico dele está exato. Cada nível de água desenhava um quad PLANO na
// altura do próprio nível; entre um nível e o seguinte sobrava um degrau, e como
// a lateral do degrau não é emitida (água não esconde água), o que se vê é o vão.
//
// ⚠️ O TESTE QUE PEGA ISSO NÃO É "tem buraco na tela". Buraco é pixel, some com
// a câmera, e um teste de pixel não diz por quê. O que se testa é a INVARIANTE
// que faz o buraco existir ou não:
//
//   duas células de níveis diferentes, lado a lado, têm que ter EXATAMENTE a
//   mesma altura no canto que compartilham.
//
// Se compartilham, não há vão possível — a superfície é contínua por
// construção. Se não compartilham, o vão é a diferença.

const stone = BLOCK_BY_KEY.stone.id
const idDeNivel = (n) => ID_DE_NIVEL[AGUA][n]

/**
 * Uma rampa de níveis: coluna x=2 com nível 0 (fonte), x=3 nível 1, x=4 nível 2.
 * É o degrau da praia, reduzido ao mínimo que ainda tem o defeito.
 */
function rampa() {
  return {
    block: (bx, by, bz) => {
      if (bz < 2 || bz > 4) return AIR
      if (by < 8) return bx >= 2 && bx <= 4 ? stone : AIR
      if (by !== 8) return AIR
      if (bx === 2) return idDeNivel(0)
      if (bx === 3) return idDeNivel(1)
      if (bx === 4) return idDeNivel(2)
      return AIR
    },
    light: () => 0xf0,
    tint: () => [0.3, 0.5, 0.9],
  }
}

/** Os quads de TOPO da água, com os quatro vértices em (x, y, z). */
function topos(geo) {
  if (!geo) return []
  const out = []
  const { position, normal, count } = geo
  for (let i = 0; i < count; i += 4) {
    if (Math.round(normal[i * 3 + 1] / 127) !== 1) continue
    const v = []
    for (let k = 0; k < 4; k++) {
      v.push({
        x: position[(i + k) * 3],
        y: position[(i + k) * 3 + 1],
        z: position[(i + k) * 3 + 2],
      })
    }
    out.push(v)
  }
  return out
}

/** Altura do topo da água na coluna x, no canto (cx, cz), com tolerância. */
function alturaNoCanto(quads, cx, cz) {
  for (const q of quads) {
    for (const v of q) {
      if (Math.abs(v.x - cx) < 1e-4 && Math.abs(v.z - cz) < 1e-4) return v.y
    }
  }
  return null
}

describe('roquecraft - a superfície do líquido é rampa, não degrau', () => {
  const malha = () => meshSection(rampa(), 0, 0, 0, { size: 16 })

  it('CONTROLE: os três níveis existem e têm alturas DIFERENTES entre si', () => {
    // Sem isto, um mundo onde todos os níveis fossem iguais passaria no teste
    // de continuidade sem provar nada — é o falso verde de sempre.
    expect(ALTURA_LIQUIDA[idDeNivel(0)]).toBeGreaterThan(ALTURA_LIQUIDA[idDeNivel(1)])
    expect(ALTURA_LIQUIDA[idDeNivel(1)]).toBeGreaterThan(ALTURA_LIQUIDA[idDeNivel(2)])
  })

  it('duas células de níveis diferentes compartilham a altura no canto comum', () => {
    const geo = malha()
    const quads = topos(geo.transparent || geo.opaque)
    expect(quads.length, 'nenhum quad de topo de água na malha').toBeGreaterThan(0)

    // A divisa entre x=2 (nível 0) e x=3 (nível 1) fica em x=3. Os dois quads
    // têm vértice ali; se as alturas divergem, existe o vão.
    const alturas = []
    for (const q of quads) {
      for (const v of q) {
        if (Math.abs(v.x - 3) < 1e-4 && Math.abs(v.z - 3) < 1e-4) alturas.push(v.y)
      }
    }
    expect(alturas.length, 'esperava dois quads encostando na divisa x=3').toBeGreaterThanOrEqual(2)
    const menor = Math.min(...alturas)
    const maior = Math.max(...alturas)
    expect(
      maior - menor,
      `os dois lados da divisa estão em alturas ${menor} e ${maior} — o vão é a diferença`,
    ).toBeLessThan(1e-3)
  })

  it('a superfície DESCE do nível 0 para o nível 2 — é rampa, não patamar', () => {
    // Continuidade sozinha seria satisfeita por uma superfície toda plana. O
    // que faz dela rampa é a altura CAIR ao longo dos níveis.
    const quads = topos(malha().transparent || malha().opaque)
    const aFonte = alturaNoCanto(quads, 2, 3)
    const aFim = alturaNoCanto(quads, 5, 3)
    expect(aFonte, 'sem vértice na borda da fonte').not.toBeNull()
    expect(aFim, 'sem vértice na borda do último nível').not.toBeNull()
    expect(aFonte).toBeGreaterThan(aFim)
  })
})
