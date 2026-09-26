import { describe, it, expect, vi } from 'vitest'
import { createAudio, GRUPO } from '../../src/servicos/audio.js'
import {
  DUR_MAX_PASSO,
  INTERVALO_MINIMO_PASSO,
  METROS_POR_PASSO,
  recortarPasso,
} from '../../src/servicos/passo.js'
import { WALK_SPEED, SPRINT_MULT } from '../../src/servicos/physics.js'

// O PASSO QUE NÃO PARA — as duas travas.
//
// Relato do founder (2026-08-23): "só o passo na areia que quando eu caio fica
// fazendo barulho de passo sozinho mesmo eu sem andar... percebi que na areia
// tem dois sons, um que está correto com o passo ao andar e outro que fica às
// vezes entrando junto e se repetindo infinitamente".
//
// Não eram dois sons. Era um só, empilhado: as amostras de areia duram de 0,30
// a 0,42 s e o intervalo entre passos correndo é 0,236 s. Cada passo começava
// antes do anterior acabar, a pilha crescia enquanto o jogador andasse, e ao
// parar as últimas vozes continuavam soando — "passo sozinho".
//
// Duas travas, e as duas são cobradas aqui:
//   1. ORÇAMENTO — amostra de passo é recortada na carga pra caber na cadência.
//   2. UMA VOZ    — o passo novo corta o anterior, dure o que durar.
//
// A segunda existe porque a primeira depende de um número: trocaram a amostra,
// o número volta a ser violado. Com voz única não há empilhamento possível.

const TAXA = 44100

const bufferFalso = (dur, canais = 1) => {
  const n = Math.round(dur * TAXA)
  const dados = Array.from({ length: canais }, () => {
    const a = new Float32Array(n)
    for (let i = 0; i < n; i++) a[i] = 0.5 // sinal constante: o fade fica óbvio
    return a
  })
  return {
    duration: n / TAXA,
    length: n,
    sampleRate: TAXA,
    numberOfChannels: canais,
    getChannelData: (c) => dados[c],
  }
}

/** AudioContext falso com buffers de verdade — o recorte precisa ler e escrever. */
function contextoFalso(durAmostra) {
  const criados = []
  const param = (v) => ({
    value: v,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  })
  const no = (tipo, extra = {}) => {
    const n = { tipo, connect: vi.fn(() => n), disconnect: vi.fn(), ...extra }
    criados.push(n)
    return n
  }
  return {
    criados,
    currentTime: 0,
    sampleRate: TAXA,
    state: 'running',
    destination: no('destination'),
    listener: { setPosition: vi.fn(), setOrientation: vi.fn() },
    createGain: () => no('gain', { gain: param(1) }),
    createBiquadFilter: () => no('filter', { frequency: param(20000), Q: param(1), type: '' }),
    createDynamicsCompressor: () =>
      no('comp', {
        threshold: param(0),
        knee: param(0),
        ratio: param(1),
        attack: param(0),
        release: param(0),
      }),
    createAnalyser: () => no('analyser', { fftSize: 2048, getFloatTimeDomainData: vi.fn() }),
    createBufferSource: () =>
      no('bufsrc', {
        buffer: null,
        loop: false,
        playbackRate: param(1),
        start: vi.fn(),
        stop: vi.fn(),
      }),
    createOscillator: () =>
      no('osc', { frequency: param(440), type: '', start: vi.fn(), stop: vi.fn() }),
    createPanner: () => no('panner', { setPosition: vi.fn() }),
    createBuffer: (c, n, sr) => bufferFalso(n / sr, c),
    decodeAudioData: async () => bufferFalso(durAmostra),
    close: vi.fn(),
  }
}

// Os nomes vêm de `GRUPO`, não escritos à mão: renomear um grupo em produção
// tem que quebrar aqui, não passar silencioso caindo na síntese.
const MANIFESTO = {
  versao: 1,
  grupos: {
    [GRUPO.passo.sand]: ['p-areia-0.ogg', 'p-areia-1.ogg'],
    [GRUPO.quebra.sand]: ['q-areia-0.ogg'],
    'amb.vento': ['amb-vento.ogg'],
  },
}
const N_AMOSTRAS = Object.values(MANIFESTO.grupos).flat().length

const buscarFalso = () =>
  vi.fn(async (url) =>
    url.endsWith('manifest.json')
      ? { ok: true, json: async () => MANIFESTO }
      : { ok: true, arrayBuffer: async () => new ArrayBuffer(64) },
  )

async function comBanco(durAmostra) {
  const ctx = contextoFalso(durAmostra)
  const a = createAudio({ criarContexto: () => ctx, buscar: buscarFalso() })
  a.unlock()
  await a.carregar()
  return { a, ctx }
}

const fontes = (ctx, desde = 0) => ctx.criados.slice(desde).filter((n) => n.tipo === 'bufsrc')

describe('roquecraft - orçamento de duração do passo', () => {
  it('o orçamento vem da CADÊNCIA, não de um número escrito à mão', () => {
    // Se alguém acelerar o sprint ou encurtar a passada, o teto acompanha.
    expect(INTERVALO_MINIMO_PASSO).toBeCloseTo(METROS_POR_PASSO / (WALK_SPEED * SPRINT_MULT), 6)
    expect(DUR_MAX_PASSO).toBeLessThan(INTERVALO_MINIMO_PASSO)
    // ...e o teto tem que ser folgado o bastante pra caber um passo audível.
    expect(DUR_MAX_PASSO).toBeGreaterThan(0.1)
  })

  it('amostra dentro do orçamento passa intacta', () => {
    const curta = [new Float32Array(Math.round(0.1 * TAXA)).fill(1)]
    expect(recortarPasso(curta, TAXA)).toBeNull()
  })

  it('amostra longa é encurtada até o teto', () => {
    const longa = [new Float32Array(Math.round(0.42 * TAXA)).fill(1)]
    const r = recortarPasso(longa, TAXA)
    expect(r).not.toBeNull()
    expect(r[0].length / TAXA).toBeLessThanOrEqual(DUR_MAX_PASSO)
    expect(r[0].length / TAXA).toBeGreaterThan(DUR_MAX_PASSO - 0.001)
  })

  it('o corte termina em silêncio: sem estalo no fim', () => {
    // Cortar uma onda no meio produz um degrau, e degrau é clique. O último
    // ponto tem que estar praticamente em zero e a descida tem que ser suave.
    const longa = [new Float32Array(Math.round(0.5 * TAXA)).fill(1)]
    const r = recortarPasso(longa, TAXA)[0]
    expect(Math.abs(r[r.length - 1])).toBeLessThan(0.02)
    expect(r[Math.floor(r.length / 2)]).toBeCloseTo(1, 5) // o miolo não é tocado
  })

  it('recorta todos os canais, não só o esquerdo', () => {
    const n = Math.round(0.4 * TAXA)
    const estereo = [new Float32Array(n).fill(1), new Float32Array(n).fill(1)]
    const r = recortarPasso(estereo, TAXA)
    expect(r).toHaveLength(2)
    expect(r[1].length).toBe(r[0].length)
    expect(Math.abs(r[1][r[1].length - 1])).toBeLessThan(0.02)
  })

  it('entrada degenerada não explode', () => {
    expect(recortarPasso([], TAXA)).toBeNull()
    expect(recortarPasso([new Float32Array(10)], 0)).toBeNull()
  })

  it('na CARGA, a amostra longa de areia já entra encurtada no banco', async () => {
    const { a, ctx } = await comBanco(0.42)
    expect(a.bancoInfo.amostras).toBe(N_AMOSTRAS)
    const antes = ctx.criados.length
    a.step('sand')
    const tocada = fontes(ctx, antes)[0]
    expect(tocada, 'passo não usou amostra').toBeTruthy()
    expect(tocada.buffer.duration).toBeLessThanOrEqual(DUR_MAX_PASSO)
  })

  it('amostra que já cabe não é copiada à toa', async () => {
    const { a, ctx } = await comBanco(0.12)
    const antes = ctx.criados.length
    a.step('sand')
    expect(fontes(ctx, antes)[0].buffer.duration).toBeCloseTo(0.12, 3)
  })
})

describe('roquecraft - o pé tem UMA voz', () => {
  it('o passo seguinte corta o anterior', async () => {
    // Esta é a trava que não depende de número nenhum: mesmo com amostra
    // gigante, duas passadas seguidas não deixam duas vozes tocando.
    const { a, ctx } = await comBanco(0.9)
    const antes = ctx.criados.length
    a.step('sand')
    a.step('sand')
    const f = fontes(ctx, antes)
    expect(f.length).toBe(2)
    expect(f[0].stop, 'a primeira voz continuou tocando por cima da segunda').toHaveBeenCalled()
    expect(f[1].stop, 'a voz mais nova foi cortada — ordem invertida').not.toHaveBeenCalled()
  })

  it('vinte passadas seguidas deixam no máximo uma voz viva', async () => {
    const { a, ctx } = await comBanco(0.42)
    const antes = ctx.criados.length
    for (let i = 0; i < 20; i++) a.step('sand')
    const f = fontes(ctx, antes)
    const vivas = f.filter((n) => !n.stop.mock.calls.length)
    expect(f.length).toBe(20)
    expect(vivas.length, `${vivas.length} vozes de passo sobrepostas`).toBe(1)
  })

  it('quebrar bloco NÃO é cortado pelo passo: a voz é só do pé', async () => {
    // Um corte global mataria o retorno da picareta a cada passada. A quebra
    // usa AMOSTRA aqui de propósito: a síntese agenda o próprio `stop` no fim
    // do envelope, e aí não daria pra distinguir "parou sozinha" de "foi
    // cortada" — o primeiro rascunho deste teste caiu nessa e acusou inocente.
    const { a, ctx } = await comBanco(0.42)
    const antes = ctx.criados.length
    a.breakBlock('sand')
    a.step('sand')
    a.step('sand')
    const f = fontes(ctx, antes)
    expect(f.length, 'a quebra não usou amostra — o teste mediria outra coisa').toBe(3)
    expect(f[0].stop).not.toHaveBeenCalled()
  })
})
