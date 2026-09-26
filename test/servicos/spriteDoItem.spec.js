import { describe, it, expect } from 'vitest'
import {
  DESENHOS,
  LADO,
  PIXEL,
  SIMBOLOS,
  desenhoDe,
  extrudarSprite,
  gradeDoDesenho,
  pixeisPintados,
  BRILHO,
  SOMBRA,
  tomDoMetal,
} from '../../src/servicos/spriteDoItem.js'

//
// O ITEM NA MÃO COMO DESENHO EXTRUDADO — onda 10.
//
// ⚠️ ESTE ARQUIVO EXISTE POR UM VEREDITO DO FOUNDER, não por um defeito de
// código: "a nossa modelagem está extremamente porcaria perto do jogo original".
// Ele estava certo, e eu tinha passado a rodada anterior calibrando ângulo — a
// espada da onda 1 tinha CINCO caixas lisas, e cinco retângulos não têm gume,
// nem ponta, nem degrau de pixel na silhueta, por mais que se acerte a pose.
//
// O que se prova aqui é a MECÂNICA da extrusão. Que o resultado ficou bom é
// julgamento humano, e mora nas fotos da sonda.
//
const CLASSES = Object.keys(DESENHOS)

describe('o desenho do item', () => {
  it('há desenhos para examinar (prova de vida)', () => {
    expect(CLASSES.length).toBeGreaterThan(6)
  })

  it('todo desenho é 16 por 16 — e o validador acusa quando não é', () => {
    for (const c of CLASSES) expect(() => gradeDoDesenho(DESENHOS[c]), c).not.toThrow()
    // ⚠️ O VALIDADOR PRECISA SABER REPROVAR. Uma linha com 15 caracteres desloca
    // todo o resto do desenho meio pixel e o resultado não parece erro: parece
    // uma espada torta que alguém desenhou de propósito.
    expect(() => gradeDoDesenho(DESENHOS.sword.slice(0, 15))).toThrow(/16 linhas/)
    const curta = [...DESENHOS.sword]
    curta[3] = curta[3].slice(0, 15)
    expect(() => gradeDoDesenho(curta)).toThrow(/16 colunas/)
    const estranha = [...DESENHOS.sword]
    estranha[3] = 'Z'.repeat(LADO)
    expect(() => gradeDoDesenho(estranha)).toThrow(/desconhecido/)
  })

  it('todo símbolo do desenho existe na tabela de papéis', () => {
    const fora = []
    for (const c of CLASSES)
      for (const linha of DESENHOS[c]) for (const ch of linha) if (!(ch in SIMBOLOS)) fora.push(ch)
    expect([...new Set(fora)]).toEqual([])
  })

  it('cada desenho tem pintura de sobra — não é uma caixa disfarçada', () => {
    // A espada antiga tinha cinco caixas. Trinta pixels pintados é o piso do que
    // se consegue desenhar com gume, ponta e cabo.
    for (const c of CLASSES) expect(pixeisPintados(DESENHOS[c]), c).toBeGreaterThan(30)
  })

  // ── A EXTRUSÃO ────────────────────────────────────────────────────────────

  it('extruda em caixas, e MESCLA em vez de cuspir um cubo por pixel', () => {
    for (const c of CLASSES) {
      const caixas = extrudarSprite(DESENHOS[c])
      expect(caixas.length, `${c} não mesclou nada`).toBeLessThan(pixeisPintados(DESENHOS[c]))
      // 256 caixas por item é o que a extrusão ingênua daria, e a mão é o que
      // mais pesa no tempo de primeiro quadro do render.
      expect(caixas.length, `${c} explodiu a contagem`).toBeLessThan(40)
    }
  })

  it('a área extrudada é EXATAMENTE a área pintada — não sobra nem falta pixel', () => {
    // ⚠️ É O TESTE QUE PEGA A VARREDURA GULOSA ERRADA. Um retângulo que estica
    // por cima de um vizinho já usado pinta duas vezes; um que para cedo deixa
    // buraco. Os dois desenham algo que parece plausível na tela.
    for (const c of CLASSES) {
      const area = extrudarSprite(DESENHOS[c]).reduce(
        (n, b) => n + (b.w * b.h) / (PIXEL * PIXEL),
        0,
      )
      expect(Math.round(area), `${c}`).toBe(pixeisPintados(DESENHOS[c]))
    }
  })

  it('nenhuma caixa cobre um pixel de papel diferente', () => {
    for (const c of CLASSES) {
      const grade = gradeDoDesenho(DESENHOS[c])
      for (const b of extrudarSprite(DESENHOS[c])) {
        const x0 = Math.round(b.x / PIXEL - b.w / PIXEL / 2 + LADO / 2)
        const y0 = Math.round(LADO / 2 - b.y / PIXEL - b.h / PIXEL / 2)
        for (let j = 0; j < Math.round(b.h / PIXEL); j++)
          for (let i = 0; i < Math.round(b.w / PIXEL); i++)
            expect(grade[y0 + j][x0 + i], `${c} em (${x0 + i},${y0 + j})`).toBe(b.papel)
      }
    }
  })

  it('a peça sai CENTRADA e com o eixo Y do mundo, não o do desenho', () => {
    // A linha 0 do desenho é o TOPO; no mundo, Y cresce para cima. Trocar isso
    // deixa toda ferramenta de cabeça para baixo — e como a maioria é quase
    // simétrica no eixo longo, ninguém vê até a espada chegar.
    const caixas = extrudarSprite(DESENHOS.torch)
    const chama = caixas.filter((b) => b.papel === 'chama')
    const cabo = caixas.filter((b) => b.papel === 'cabo' || b.papel === 'caboEscuro')
    expect(chama.length).toBeGreaterThan(0)
    expect(cabo.length).toBeGreaterThan(0)
    expect(
      Math.max(...chama.map((b) => b.y)),
      'a chama tem que ficar ACIMA do cabo',
    ).toBeGreaterThan(Math.max(...cabo.map((b) => b.y)))
  })

  it('a peça inteira cabe em um bloco', () => {
    for (const c of CLASSES) {
      for (const b of extrudarSprite(DESENHOS[c])) {
        expect(Math.abs(b.x) + b.w / 2, `${c} vazou em x`).toBeLessThanOrEqual(0.5 + 1e-9)
        expect(Math.abs(b.y) + b.h / 2, `${c} vazou em y`).toBeLessThanOrEqual(0.5 + 1e-9)
      }
    }
  })

  it('a profundidade é de UM pixel, como no gênero', () => {
    for (const b of extrudarSprite(DESENHOS.sword)) expect(b.d).toBeCloseTo(PIXEL, 9)
    for (const b of extrudarSprite(DESENHOS.sword, 3)) expect(b.d).toBeCloseTo(3 * PIXEL, 9)
  })

  it('classe sem desenho devolve null em vez de estourar', () => {
    expect(desenhoDe('nao-existe')).toBe(null)
  })

  it('cada classe tem um desenho DIFERENTE', () => {
    const vistos = new Map()
    for (const c of CLASSES) {
      const chave = DESENHOS[c].join('|')
      expect(vistos.has(chave), `${c} é cópia de ${vistos.get(chave)}`).toBe(false)
      vistos.set(chave, c)
    }
  })

  // ── O TOM DO METAL ────────────────────────────────────────────────────────

  it('brilho e sombra dão três cores DIFERENTES a partir do mesmo tier', () => {
    // ⚠️ SEM ISTO A ESPADA É UMA SILHUETA BOA E CINZA UNIFORME POR DENTRO. Um
    // mutante que devolvia a cor do tier crua no lugar do gume sobreviveu a doze
    // testes verdes, porque a função morava dentro do `viewmodel` e ninguém
    // alcançava. O volume de um sprite extrudado vem da PINTURA, não da luz.
    for (const tier of [0x8a6a43, 0x9a9a9a, 0xd8d8d8, 0x5ae0d0]) {
      const claro = tomDoMetal(tier, BRILHO)
      const escuro = tomDoMetal(tier, SOMBRA)
      expect(claro, 'o gume empatou com o corpo').not.toBe(tier)
      expect(escuro, 'a sombra empatou com o corpo').not.toBe(tier)
      expect(claro).not.toBe(escuro)
    }
  })

  it('o claro é mais claro e o escuro é mais escuro, em cada canal', () => {
    const canais = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255]
    for (const tier of [0x8a6a43, 0x9a9a9a, 0x5ae0d0]) {
      const base = canais(tier)
      canais(tomDoMetal(tier, BRILHO)).forEach((v, i) => expect(v).toBeGreaterThan(base[i]))
      canais(tomDoMetal(tier, SOMBRA)).forEach((v, i) => expect(v).toBeLessThan(base[i]))
    }
  })

  it('nenhum tom estoura a faixa de um byte', () => {
    for (const f of [SOMBRA, 1, BRILHO, 3]) {
      const h = tomDoMetal(0xf0e8e0, f)
      for (const v of [(h >> 16) & 255, (h >> 8) & 255, h & 255]) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(255)
      }
    }
  })
})
