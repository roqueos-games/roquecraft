import { describe, it, expect } from 'vitest'
import { criarEstilhacos, passoEstilhacos, fracaoAssentada } from '../../src/servicos/estilhaco.js'

/**
 * O CACO DE BLOCO TEM QUE TER PESO.
 *
 * Antes eram doze cubinhos com gravidade que subiam, desciam e sumiam no ar em
 * 0,85 s: nada encostava no chão. O founder pediu "um efeito com física
 * quebrando o bloco", e a lista de mods que ele mandou tem o Physics Mod, cujo
 * pedaço aplicável aqui é justamente estilhaço que cai, bate e quica.
 *
 * Aleatoriedade injetada pra o teste ser determinístico: trajetória sorteada
 * não se afirma, e sem isso o único jeito de conferir seria olhar.
 */

/** Gerador previsível — sequência fixa, sem depender de Math.random. */
function rndFixo(semente = 1) {
  let s = semente
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const simular = (cacos, chao, segundos, dt = 1 / 60) => {
  for (let t = 0; t < segundos; t += dt) passoEstilhacos(cacos, dt, chao)
  return cacos
}

describe('roquecraft - estilhaço ao quebrar bloco', () => {
  it('nasce em volta do bloco quebrado, não num ponto só', () => {
    const c = criarEstilhacos(10, 64, 20, 18, rndFixo())
    expect(c).toHaveLength(18)
    const xs = c.map((p) => p.x)
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.3)
    for (const p of c) {
      expect(Math.abs(p.x - 10.5)).toBeLessThan(0.5)
      expect(Math.abs(p.z - 20.5)).toBeLessThan(0.5)
    }
  })

  /*
   * Todo caco começa SUBINDO. Um que nasce descendo atravessa o piso antes do
   * primeiro quadro e a explosão perde metade dos pedaços logo na saída.
   */
  it('todos saem para cima', () => {
    for (const p of criarEstilhacos(0, 0, 0, 30, rndFixo(7))) {
      expect(p.vy).toBeGreaterThan(0)
    }
  })

  /*
   * O DEFEITO CENTRAL DO EFEITO ANTIGO: o caco caía para sempre. Aqui ele bate
   * no piso da célula quebrada, que é o topo do bloco de baixo.
   */
  it('bate no chão e volta a subir — quica', () => {
    const c = criarEstilhacos(0, 10, 0, 1, rndFixo(3))
    const p = c[0]
    p.x = 0.5
    p.z = 0.5
    p.vx = 0
    p.vz = 0
    p.y = 11
    p.vy = 0
    let tocou = false
    let subiuDepois = false
    for (let i = 0; i < 400; i++) {
      const antes = p.vy
      passoEstilhacos(c, 1 / 120, 10)
      if (antes < 0 && p.vy > 0) tocou = true
      if (tocou && p.vy > 0) subiuDepois = true
    }
    expect(tocou, 'nunca inverteu a velocidade: não bateu no chão').toBe(true)
    expect(subiuDepois).toBe(true)
  })

  it('nenhum caco atravessa o chão', () => {
    const c = criarEstilhacos(0, 10, 0, 24, rndFixo(11))
    simular(c, 10, 4)
    for (const p of c) expect(p.y).toBeGreaterThanOrEqual(10 - 1e-6)
  })

  /*
   * O quique perde energia. Sem perda o caco vira bola de borracha e fica
   * pulando até o efeito acabar — pedra não faz isso.
   */
  it('cada quique é mais baixo que o anterior', () => {
    const c = criarEstilhacos(0, 10, 0, 1, rndFixo(5))
    const p = c[0]
    p.x = 0.5
    p.z = 0.5
    p.vx = 0
    p.vz = 0
    p.y = 12
    p.vy = 0
    const picos = []
    let subindo = false
    for (let i = 0; i < 1200; i++) {
      const yAntes = p.y
      passoEstilhacos(c, 1 / 240, 10)
      if (p.y > yAntes) subindo = true
      else if (subindo) {
        picos.push(yAntes)
        subindo = false
      }
    }
    expect(picos.length, 'não houve quique nenhum').toBeGreaterThan(1)
    for (let i = 1; i < picos.length; i++) expect(picos[i]).toBeLessThan(picos[i - 1])
  })

  it('assenta e para: o efeito termina em repouso, não tremendo', () => {
    const c = criarEstilhacos(0, 10, 0, 24, rndFixo(13))
    simular(c, 10, 3.5)
    expect(fracaoAssentada(c), 'sobrou caco no ar depois de 3,5 s').toBeGreaterThan(0.9)
    for (const p of c) {
      if (!p.parado) continue
      expect(p.vy).toBe(0)
      expect(Math.abs(p.wx), 'caco parado ainda girando').toBe(0)
    }
  })

  it('o caco assentado escorrega até parar, não congela no ar', () => {
    const c = criarEstilhacos(0, 10, 0, 12, rndFixo(17))
    simular(c, 10, 1.5, 1 / 120)
    const assentados = c.filter((p) => p.parado)
    expect(assentados.length).toBeGreaterThan(0)
    const antes = assentados.map((p) => Math.hypot(p.vx, p.vz))
    simular(c, 10, 1.2, 1 / 120)
    const depois = assentados.map((p) => Math.hypot(p.vx, p.vz))
    for (let i = 0; i < antes.length; i++) {
      if (antes[i] > 0.05) expect(depois[i]).toBeLessThan(antes[i])
    }
  })

  it('gira enquanto voa', () => {
    const c = criarEstilhacos(0, 10, 0, 12, rndFixo(19))
    const antes = c.map((p) => p.rx)
    passoEstilhacos(c, 0.1, 10)
    expect(c.some((p, i) => Math.abs(p.rx - antes[i]) > 1e-6)).toBe(true)
  })

  /*
   * O passo de simulação não pode explodir com dt grande — no celular do
   * founder o quadro engasga, e um caco que teleporta pra baixo do mundo num
   * quadro longo é pior que caco nenhum.
   */
  it('quadro longo não faz o caco escapar pelo chão', () => {
    const c = criarEstilhacos(0, 10, 0, 18, rndFixo(23))
    for (let i = 0; i < 40; i++) passoEstilhacos(c, 0.25, 10)
    for (const p of c) {
      expect(Number.isFinite(p.y)).toBe(true)
      expect(p.y).toBeGreaterThanOrEqual(10 - 1e-6)
    }
  })
})

describe('estilhaço — o toque no piso', () => {
  it('encostar EXATAMENTE no piso já é toque', () => {
    // ⚠️ `p.y <= piso && p.vy < 0`. Apertado para `<`, o caco que chega no
    // ponto exato do piso não toca: continua caindo, e no quadro seguinte já
    // está ABAIXO do chão. Como o teste é feito a cada quadro, um caco que
    // pouse alinhado ao piso atravessa o mundo e some.
    const caco = {
      s: 10, // meio = 0.5
      x: 0,
      y: 0.5, // exatamente o piso (chaoY 0 + meio 0.5)
      z: 0,
      vx: 0,
      vy: -0.5, // abaixo do repouso: assenta em vez de quicar
      vz: 0,
      rx: 0,
      ry: 0,
      wx: 3,
      wy: 3,
      parado: false,
    }
    passoEstilhacos([caco], 0, 0)
    expect(caco.parado).toBe(true)
    expect(caco.y).toBe(0.5)
    expect(caco.vy).toBe(0)
    // Caco imóvel girando no chão é pior que caco imóvel.
    expect(caco.wx).toBe(0)
    expect(caco.wy).toBe(0)
  })

  it('caco subindo NÃO é freado pelo piso', () => {
    // `p.vy < 0` é o que separa "está caindo" de "acabou de quicar". Sem ele o
    // caco que sobe pelo piso seria zerado no ar.
    const caco = {
      s: 10,
      x: 0,
      y: 0.5,
      z: 0,
      vx: 0,
      vy: 4,
      vz: 0,
      rx: 0,
      ry: 0,
      wx: 3,
      wy: 3,
      parado: false,
    }
    passoEstilhacos([caco], 0, 0)
    expect(caco.parado).toBeFalsy()
    expect(caco.vy).toBe(4)
  })
})
