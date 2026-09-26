import { describe, it, expect } from 'vitest'
import { stepPlayer } from '../../src/servicos/physics.js'
import { criarPassoFixo, PASSO_DA_FISICA } from '../../src/servicos/passoFixo.js'

// ⚠️ ANDAR DEPENDIA DA TAXA DE QUADROS (RC-10).
//
// O laço de render limitava o `dt` a 0,1 s; `physics.js` limitava DE NOVO a
// 0,05 s. Num aparelho a 15 fps o quadro dura 0,067 s, a física recebia 0,05, e
// o jogador andava 25% menos por segundo do que alguém a 60 fps segurando a
// mesma tecla pelo mesmo tempo. O celular do founder não é o desktop dele.
//
// ⚠️ ESTE TESTE MEDE O DESLOCAMENTO, não a existência do acumulador. Um teste
// que conferisse "o acumulador foi chamado" passaria com o defeito inteiro de
// pé, porque o defeito não é a ausência da chamada: é o tempo que se perde.

/** Chão infinito em y=63: o jogador pisa em 64 e anda em linha reta. */
const MUNDO = {
  solidAt: (x, y) => y <= 63,
  liquidAt: () => false,
  carregado: () => true,
}
// `inWater: false` no corpo: `stepPlayer` lê e escreve esse campo.
const ANDANDO = {
  forward: 1,
  strafe: 0,
  jump: false,
  sneak: false,
  sprint: false,
  flying: false,
  yaw: 0,
  autoJump: true,
}

function corpoNovo() {
  return { x: 0, y: 64, z: 0, vx: 0, vy: 0, vz: 0, onGround: true, fallStart: 64, inWater: false }
}

/** Quanto o jogador anda em `segundos` segurando W, a uma dada taxa de quadros. */
function distancia(fps, segundos, { comPassoFixo }) {
  const corpo = corpoNovo()
  const dt = 1 / fps
  const quadros = Math.round(segundos * fps)
  const fixo = criarPassoFixo()
  for (let i = 0; i < quadros; i++) {
    if (comPassoFixo) fixo.avancar(dt, (p) => stepPlayer(corpo, ANDANDO, MUNDO, p))
    else stepPlayer(corpo, ANDANDO, MUNDO, dt)
  }
  return Math.hypot(corpo.x, corpo.z)
}

describe('andar 10 segundos dá a mesma distância em qualquer fps (RC-10)', () => {
  const SEGUNDOS = 10
  const TAXAS = [15, 30, 60, 120]

  it('o defeito existe sem o passo fixo — é ele que este arquivo conserta', () => {
    const d15 = distancia(15, SEGUNDOS, { comPassoFixo: false })
    const d60 = distancia(60, SEGUNDOS, { comPassoFixo: false })
    // Sem o acumulador, 15 fps perde uma fatia grande do deslocamento.
    expect(d15).toBeLessThan(d60 * 0.95)
  })

  it('com o passo fixo, as quatro taxas ficam dentro de 1%', () => {
    const medidas = TAXAS.map((fps) => ({
      fps,
      d: distancia(fps, SEGUNDOS, { comPassoFixo: true }),
    }))
    const ref = medidas.find((m) => m.fps === 60).d
    expect(ref, 'o jogador não saiu do lugar — teste inconclusivo').toBeGreaterThan(10)
    for (const m of medidas) {
      const erro = Math.abs(m.d - ref) / ref
      expect(
        erro,
        `${m.fps} fps andou ${m.d.toFixed(2)} contra ${ref.toFixed(2)} a 60 fps`,
      ).toBeLessThan(0.01)
    }
  })
})

describe('o acumulador', () => {
  it('120 fps roda física em metade dos quadros, e não em nenhum a menos', () => {
    const fixo = criarPassoFixo()
    let passos = 0
    for (let i = 0; i < 120; i++) fixo.avancar(1 / 120, () => passos++)
    expect(passos).toBe(60)
  })

  it('15 fps roda quatro passos por quadro', () => {
    const fixo = criarPassoFixo()
    let passos = 0
    fixo.avancar(1 / 15, () => passos++)
    expect(passos).toBe(4)
  })

  it('todo passo tem a MESMA duração — é isso que faz a conta fechar', () => {
    const fixo = criarPassoFixo()
    const duracoes = []
    fixo.avancar(0.037, (p) => duracoes.push(p))
    fixo.avancar(0.211, (p) => duracoes.push(p))
    expect(new Set(duracoes)).toEqual(new Set([PASSO_DA_FISICA]))
  })

  it('um quadro de dez segundos NÃO pede seiscentos passos', () => {
    // Sem teto, a espiral trava o navegador: cada quadro lento pede mais passos,
    // que deixam o quadro seguinte mais lento ainda.
    const fixo = criarPassoFixo()
    let passos = 0
    fixo.avancar(10, () => passos++)
    expect(passos).toBe(5)
  })

  it('o resto sobra para o quadro seguinte, em vez de ser jogado fora', () => {
    const fixo = criarPassoFixo()
    let passos = 0
    // Dois quadros de 1/90 somam mais que um passo de 1/60.
    fixo.avancar(1 / 90, () => passos++)
    expect(passos).toBe(0)
    fixo.avancar(1 / 90, () => passos++)
    expect(passos, 'o tempo do primeiro quadro evaporou').toBe(1)
  })

  it('zerar descarta o pendente (voltar de pausa, de sala, de outro mundo)', () => {
    const fixo = criarPassoFixo()
    let passos = 0
    fixo.avancar(1 / 90, () => passos++)
    fixo.zerar()
    fixo.avancar(1 / 90, () => passos++)
    expect(passos).toBe(0)
    expect(fixo.resto()).toBeCloseTo(1 / 90, 6)
  })

  it('dt inválido não faz nada', () => {
    const fixo = criarPassoFixo()
    let passos = 0
    for (const mau of [0, -1, NaN, undefined, null]) fixo.avancar(mau, () => passos++)
    expect(passos).toBe(0)
  })
})
