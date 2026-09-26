import { describe, it, expect } from 'vitest'
import { stepPlayer, SWIM_DOWN, SWIM_UP } from '../../src/servicos/physics.js'

// "estou sentindo falta de poder mergulhar" — founder, 25/08/2026.
//
// Não era dificuldade, era FALTA DE VERBO: o empuxo de Arquimedes estabiliza o
// corpo em 1/FLUTUACAO = 43% submerso e a única entrada vertical na água era o
// pular. `input.sneak` só descia com `flying` ligado. O jogador entrava no mar,
// boiava, e a água não aceitava nenhum pedido de descer.
//
// Física é pura: dá pra provar sem abrir o jogo — e o teste que importa não é
// "existe a constante", é "o jogador CHEGA mais fundo".

/** Um oceano: sólido até y<=39, água de y=40 a y=64, ar acima. */
const oceano = {
  solidAt: (x, y) => (y <= 39 ? 1 : 0),
  liquidAt: (x, y) => y >= 40 && y <= 64,
  carregado: () => true,
}

const jogador = (y) => ({
  x: 0.5,
  y,
  z: 0.5,
  vx: 0,
  vy: 0,
  vz: 0,
  onGround: false,
  fallStart: y,
  inWater: true,
})

const entrada = (o = {}) => ({
  forward: 0,
  strafe: 0,
  jump: false,
  sneak: false,
  sprint: false,
  flying: false,
  yaw: 0,
  autoJump: true,
  ...o,
})

function correr(p, inp, frames) {
  for (let i = 0; i < frames; i++) stepPlayer(p, inp, oceano, 1 / 60)
  return p
}

describe('roquecraft - dá pra mergulhar', () => {
  it('boiando parado, o jogador NÃO afunda sozinho', () => {
    // O controle. Sem ele, um teste de mergulho passaria de graça num jogo onde
    // o corpo simplesmente afunda — e eu teria "provado" um verbo que não
    // existe.
    const p = jogador(64)
    correr(p, entrada(), 240)
    expect(p.y).toBeGreaterThan(62.5)
  })

  it('segurando agachar, afunda — e chega ao fundo', () => {
    const p = jogador(64)
    correr(p, entrada({ sneak: true }), 240)
    // Quatro segundos a 2,6 m/s dariam 10 blocos; a coluna tem 24. O que o
    // teste exige é fundo de verdade, não um mergulhinho de meio bloco.
    expect(p.y).toBeLessThan(56)
  })

  it('agachar afunda MAIS do que não agachar, na mesma cena', () => {
    // O par de controle na MESMA sessão: é a diferença entre as duas colunas
    // que prova o verbo, não o valor absoluto de nenhuma delas.
    const solto = jogador(64)
    const afundando = jogador(64)
    correr(solto, entrada(), 180)
    correr(afundando, entrada({ sneak: true }), 180)
    expect(solto.y - afundando.y).toBeGreaterThan(5)
  })

  it('pular vence agachar quando as duas entradas vêm juntas', () => {
    // Quem anda agachado no teclado chega na água com Shift preso. Nesse
    // momento, pedir Espaço é pedir AR — e ar tem que ganhar.
    const p = jogador(50)
    correr(p, entrada({ sneak: true, jump: true }), 60)
    expect(p.y).toBeGreaterThan(50)
  })

  it('depois de mergulhar, o jogador FICA no fundo em vez de ser cuspido pra cima', () => {
    // ⚠️ O defeito que só a sonda pegou: descer funcionava e PARAR não. Com o
    // empuxo de superfície valendo em toda profundidade, soltar o controle
    // devolvia o jogador à tona a ~8,7 m/s — a sonda mediu 7 blocos de descida
    // e fotografou o jogador boiando 1,3 s depois.
    const p = jogador(64)
    correr(p, entrada({ sneak: true }), 180)
    const fundo = p.y
    correr(p, entrada(), 180)
    // Três segundos parado não podem devolver mais que meio bloco.
    expect(p.y - fundo).toBeLessThan(0.5)
    expect(p.y).toBeLessThan(58)
  })

  it('mas quem larga o controle acaba voltando à tona', () => {
    // O contrapeso do teste acima. Empuxo submerso EXATAMENTE neutro deixaria
    // um jogador afogando parado no fundo pra sempre; ele é levemente positivo.
    const p = jogador(64)
    correr(p, entrada({ sneak: true }), 120)
    const fundo = p.y
    correr(p, entrada(), 3600)
    expect(p.y).toBeGreaterThan(fundo)
  })

  it('o balanço na superfície sobrevive à mudança do empuxo', () => {
    // A rodada do empuxo de Arquimedes custou caro e o founder gostou do
    // resultado. O regime de superfície NÃO pode ter mudado: quem está com a
    // cabeça fora d'água continua estabilizando em ~43% do corpo submerso.
    const p = jogador(64)
    correr(p, entrada(), 600)
    expect(p.y).toBeGreaterThan(62.5)
    expect(p.y).toBeLessThan(64.5)
  })

  it('descer é mais lento que subir, de propósito', () => {
    expect(SWIM_DOWN).toBeLessThan(0)
    expect(Math.abs(SWIM_DOWN)).toBeLessThan(SWIM_UP)
  })

  it('fora da água, agachar não empurra ninguém pra baixo', () => {
    // `sneak` continua sendo agachar em terra firme. Se este teste falhar, o
    // mergulho vazou pro chão e o jogador afunda na pedra.
    const terra = {
      solidAt: (x, y) => (y <= 63 ? 1 : 0),
      liquidAt: () => false,
      carregado: () => true,
    }
    const p = { ...jogador(64), onGround: true, inWater: false }
    for (let i = 0; i < 120; i++) stepPlayer(p, entrada({ sneak: true }), terra, 1 / 60)
    expect(p.y).toBeCloseTo(64, 2)
  })
})
