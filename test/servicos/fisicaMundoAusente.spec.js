import { describe, it, expect } from 'vitest'
import {
  stepPlayer,
  collides,
  desencalhar,
  PLAYER_HEIGHT,
  AUTO_STEP_HEIGHT,
} from '../../src/servicos/physics.js'
import { ALTURA_SOLIDA, BLOCKS, BLOCK_BY_KEY } from '../../src/servicos/blocks.js'

// O JOGADOR NÃO PODE CAIR PELO MUNDO. NUNCA.
//
// Print do founder em 2026-08-22, coordenada -36 · 63 · -39, bioma Nevado:
// câmera dentro do maciço, terreno em pedaços, "eu ando e caio no meio do
// bloco". A causa não estava na física: `worldClient.getBlock` respondia AR
// para chunk não carregado, e ar significa "pode passar". Quem andasse mais
// rápido que o carregador pisava no vazio, a gravidade puxava a 60 blocos/s, e
// o terreno materializava EM VOLTA do jogador.
//
// A correção tem três partes e cada uma tem um teste aqui:
//  1. o mundo responde SÓLIDO para o desconhecido (testado em worldClient);
//  2. a física CONGELA enquanto a coluna do jogador não existe;
//  3. quem já está enterrado é DESENCALHADO — os saves quebrados não se
//     consertam sozinhos.
//
// E o quarto teste é o que dava o sintoma "metade do bloco": bloco parcial
// (camada de neve) agora tem caixa de colisão de verdade.

const semTeclas = {
  forward: 0,
  strafe: 0,
  jump: false,
  sneak: false,
  sprint: false,
  flying: false,
  yaw: 0,
}
const semLiquido = () => false
const novoEstado = (y, extra = {}) => ({
  x: 0.5,
  y,
  z: 0.5,
  vx: 0,
  vy: 0,
  vz: 0,
  onGround: false,
  fallStart: y,
  ...extra,
})

describe('roquecraft - física contra mundo que não chegou', () => {
  it('CONGELA enquanto a coluna do jogador não está carregada', () => {
    // Mundo vazio (tudo ar) mas declarado NÃO carregado: é exatamente o estado
    // dos primeiros frames depois de abrir o jogo ou de andar pra fora da área
    // pronta.
    const env = { solidAt: () => 0, liquidAt: semLiquido, carregado: () => false }
    const s = novoEstado(70)
    let ultimo
    for (let i = 0; i < 120; i++) ultimo = stepPlayer(s, semTeclas, env, 1 / 60)

    expect(ultimo.suspenso, 'o passo tinha que se declarar suspenso').toBe(true)
    expect(s.y, 'dois segundos de mundo ausente e o jogador desceu — é a queda pelo cenário').toBe(
      70,
    )
    expect(s.vy, 'a gravidade não pode acumular velocidade enquanto o mundo falta').toBe(0)
  })

  it('volta a cair no instante em que a coluna chega', () => {
    let pronto = false
    const env = {
      solidAt: (x, y) => (y <= 63 ? 1 : 0),
      liquidAt: semLiquido,
      carregado: () => pronto,
    }
    const s = novoEstado(70)
    for (let i = 0; i < 60; i++) stepPlayer(s, semTeclas, env, 1 / 60)
    expect(s.y, 'não podia ter se mexido ainda').toBe(70)

    pronto = true
    for (let i = 0; i < 240; i++) stepPlayer(s, semTeclas, env, 1 / 60)
    expect(s.y, 'depois de carregar tinha que pousar em cima do chão').toBeCloseTo(64, 2)
    expect(s.onGround).toBe(true)
  })

  it('sem `carregado`, um mundo todo de ar ainda faz o jogador cair (o defeito original)', () => {
    // Este teste existe pra deixar explícito o que a guarda evita. Sem
    // `carregado`, a física não tem como saber a diferença entre "é ar" e "não
    // sei", e cair é o comportamento correto pra ar de verdade.
    const env = { solidAt: () => 0, liquidAt: semLiquido }
    const s = novoEstado(70)
    for (let i = 0; i < 120; i++) stepPlayer(s, semTeclas, env, 1 / 60)
    expect(s.y).toBeLessThan(40)
  })
})

describe('roquecraft - desencalhar', () => {
  const macico = () => 1 // mundo inteiramente sólido até y=79, ar acima
  const ateY = (topo) => (x, y) => (y <= topo ? 1 : 0)

  it('sobe o jogador enterrado até a primeira altura livre', () => {
    const s = novoEstado(77) // enterrado três blocos: sólido até 79
    const mexeu = desencalhar(ateY(79), s)
    expect(mexeu).toBe(true)
    expect(collides(ateY(79), s.x, s.y, s.z), 'continuou dentro de bloco sólido').toBe(false)
    expect(s.y, 'tinha que sair em cima do maciço').toBeCloseTo(80, 1)
    expect(s.vy, 'sair de dentro da pedra não pode manter velocidade de queda').toBe(0)
  })

  it('enterrado fundo demais vira `preso`, e a decisão sobe pro jogo', () => {
    const env = { solidAt: ateY(79), liquidAt: semLiquido, carregado: () => true }
    const s = novoEstado(50) // trinta blocos de rocha por cima
    const r = stepPlayer(s, semTeclas, env, 1 / 60)
    expect(r.preso, 'a física tinha que admitir que não resolveu').toBe(true)
    expect(s.y, 'e não pode teleportar pra estratosfera tentando').toBeLessThan(60)
  })

  it('não mexe em quem já está livre', () => {
    const s = novoEstado(80)
    expect(desencalhar(ateY(79), s)).toBe(false)
    expect(s.y).toBe(80)
  })

  it('desiste em vez de teleportar pra estratosfera quando não há saída', () => {
    const s = novoEstado(60)
    expect(desencalhar(macico, s, 8)).toBe(false)
    expect(s.y, 'sem saída, a posição fica intacta pra quem chamou decidir').toBe(60)
  })

  it('o passo de física desencalha sozinho um save quebrado', () => {
    const env = { solidAt: ateY(79), liquidAt: semLiquido, carregado: () => true }
    const s = novoEstado(77)
    const r = stepPlayer(s, semTeclas, env, 1 / 60)
    expect(collides(env.solidAt, s.x, s.y, s.z)).toBe(false)
    expect(r.preso).toBe(false)
  })
})

describe('roquecraft - a tabela de altura sólida', () => {
  it('a camada de neve é sólida e PARCIAL — nem fantasma, nem cubo cheio', () => {
    const neve = BLOCK_BY_KEY.snowLayer
    expect(neve, 'sumiu o bloco snowLayer').toBeTruthy()
    const h = ALTURA_SOLIDA[neve.id]
    expect(
      h,
      'a camada de neve voltou a ser atravessável: o jogador anda com os pés ' +
        'dentro da neve que está vendo',
    ).toBeGreaterThan(0)
    expect(h, 'a camada de neve virou cubo cheio: um degrau de neve fica alto demais').toBeLessThan(
      1,
    )
    expect(h).toBeCloseTo(neve.slab, 5)
  })

  it('todo bloco com `slab` tem essa fração como caixa de colisão', () => {
    for (const b of Object.values(BLOCKS)) {
      if (!b.slab) continue
      expect(b.solid, `${b.key} tem slab mas não é sólido — o desenho existe e a colisão não`).toBe(
        true,
      )
      expect(ALTURA_SOLIDA[b.id], `${b.key}: altura de colisão ≠ altura desenhada`).toBeCloseTo(
        b.slab,
        5,
      )
    }
  })

  it('bloco cheio é 1 e bloco não-sólido é 0', () => {
    expect(ALTURA_SOLIDA[BLOCK_BY_KEY.stone.id]).toBe(1)
    expect(ALTURA_SOLIDA[BLOCK_BY_KEY.grassBlock.id]).toBe(1)
    expect(ALTURA_SOLIDA[BLOCK_BY_KEY.tallGrass.id], 'mato não é obstáculo').toBe(0)
    expect(ALTURA_SOLIDA[BLOCK_BY_KEY.water.id], 'água não é obstáculo').toBe(0)
    expect(ALTURA_SOLIDA[0], 'ar').toBe(0)
  })

  it('o auto-degrau alcança um bloco cheio COM camada fina em cima', () => {
    // É o degrau real de terreno nevado: 1 + a camada de neve. Se o auto-degrau
    // não alcançar, o jogador trava em cada bloco em bioma frio.
    //
    // ⚠️ A conta era sobre a MAIOR `slab` do jogo, e isso deixou de ser certo
    // quando a laje entrou (24/08/2026): laje é meio bloco, e bloco cheio +
    // laje mede 1,5 — que o jogo de referência NÃO deixa subir andando, e nem
    // deveria. Subir 1,5 sem pular tiraria o sentido de construir escada.
    //
    // O invariante verdadeiro sempre foi sobre COBERTURA DE TERRENO — o que o
    // gerador espalha em cima do chão — e não sobre bloco de construção. É
    // isso que está escrito agora.
    const cobertura = Math.max(...['snowLayer', 'moss'].map((k) => BLOCK_BY_KEY[k]?.slab || 0))
    expect(cobertura, 'nenhuma cobertura fina no jogo: o teste perdeu o assunto').toBeGreaterThan(0)
    expect(
      AUTO_STEP_HEIGHT,
      `degrau nevado mede ${(1 + cobertura).toFixed(3)} e o auto-degrau só vai a ${AUTO_STEP_HEIGHT}`,
    ).toBeGreaterThanOrEqual(1 + cobertura)
    expect(AUTO_STEP_HEIGHT, 'auto-degrau não pode escalar parede de dois blocos').toBeLessThan(2)
  })

  it('bloco cheio COM LAJE em cima exige pulo — não se sobe andando', () => {
    // O outro lado da regra acima, escrito pra não ser afrouxado de novo: se um
    // dia o auto-degrau passar de 1,5, dá pra andar por cima de uma laje sobre
    // um bloco, e a escada perde a razão de existir.
    const laje = BLOCK_BY_KEY.stoneSlab
    expect(laje, 'a laje sumiu').toBeTruthy()
    expect(AUTO_STEP_HEIGHT).toBeLessThan(1 + laje.slab)
  })
})

describe('roquecraft - bloco parcial tem caixa de colisão', () => {
  // Camada de neve: sólida, 12,5% de altura, apoiada no chão da célula.
  const NEVE = 0.125
  // chão cheio até 63; neve na célula 64.
  const mundoNevado = (x, y) => (y <= 63 ? 1 : y === 64 ? NEVE : 0)

  it('a AABB do bloco parcial vai só até a fração de altura', () => {
    // pé em 64.2 está ACIMA da neve (que vai de 64 a 64.125): livre.
    expect(collides(mundoNevado, 0.5, 64.2, 0.5)).toBe(false)
    // pé em 64.05 está DENTRO da neve: colide.
    expect(collides(mundoNevado, 0.5, 64.05, 0.5)).toBe(true)
  })

  it('o jogador pousa EM CIMA da neve, não dentro dela', () => {
    const env = { solidAt: mundoNevado, liquidAt: semLiquido, carregado: () => true }
    const s = novoEstado(70)
    for (let i = 0; i < 300; i++) stepPlayer(s, semTeclas, env, 1 / 60)
    expect(
      s.y,
      `pousou em y=${s.y.toFixed(3)}; a superfície da neve é 64.125. Abaixo disso o ` +
        'jogador anda com os pés dentro da neve que ele está vendo.',
    ).toBeCloseTo(64 + NEVE, 2)
  })

  it('dá pra SUBIR num degrau coberto de neve', () => {
    // chão em 63; a partir de z>=3 sobe um bloco (64) e ainda tem neve em 65.
    const solidAt = (x, y, z) => {
      const alto = z >= 3
      if (y <= 63) return 1
      if (alto && y === 64) return 1
      if (alto && y === 65) return NEVE
      return 0
    }
    const env = { solidAt, liquidAt: semLiquido, carregado: () => true }
    const s = novoEstado(64, { onGround: true })
    const andar = { ...semTeclas, forward: 1 } // +forward = +z com yaw 0
    for (let i = 0; i < 240; i++) stepPlayer(s, andar, env, 1 / 60)
    expect(s.z, 'não avançou: travou no degrau nevado').toBeGreaterThan(3.5)
    expect(s.y, `parou em y=${s.y.toFixed(3)}; em cima da neve do degrau é 65.125`).toBeCloseTo(
      65 + NEVE,
      2,
    )
  })
})

describe('roquecraft - encostar de verdade ao pousar', () => {
  const chao = (x, y) => (y <= 63 ? 1 : 0)

  it('pousa colado no chão qualquer que seja a altura da queda e o passo de tempo', () => {
    for (const y0 of [64.9, 70, 90, 120, 127]) {
      for (const dt of [1 / 120, 1 / 60, 1 / 30, 0.05]) {
        const env = { solidAt: chao, liquidAt: semLiquido, carregado: () => true }
        const s = novoEstado(y0)
        for (let i = 0; i < 900; i++) stepPlayer(s, semTeclas, env, dt)
        const folga = s.y - 64
        expect(
          folga,
          `caiu de ${y0} com dt=${dt.toFixed(4)} e parou ${folga.toFixed(4)} acima do chão. ` +
            'A varredura discreta parava no último passo livre — até meio bloco flutuando.',
        ).toBeLessThan(0.01)
        expect(folga, 'afundou no chão').toBeGreaterThanOrEqual(-0.001)
      }
    }
  })

  it('não atravessa o chão nem caindo de 127 com passo de tempo grande', () => {
    const env = { solidAt: chao, liquidAt: semLiquido, carregado: () => true }
    const s = novoEstado(127)
    for (let i = 0; i < 600; i++) stepPlayer(s, semTeclas, env, 0.05)
    expect(s.y).toBeGreaterThan(63.9)
    expect(collides(chao, s.x, s.y, s.z)).toBe(false)
    expect(s.y + PLAYER_HEIGHT).toBeGreaterThan(64)
  })
})
