import { describe, it, expect, vi } from 'vitest'
import { createAudio, AUDIO_BASE } from '../../src/servicos/audio.js'

// O TOCADOR da trilha. O DIRETOR (quem escolhe faixa e silêncio) é puro e mora
// em `trilha.js`, com teste próprio. Aqui se afirma a parte que precisa de
// navegador: que a música é STREAM e não vira `AudioBuffer` no banco, que o
// volume dela é independente do resto, e que ela não é abafada debaixo d'água.

const MANIFESTO = {
  versao: 2,
  grupos: { 'passo.grama': ['p-grama-0.ogg'] },
  musica: {
    dia: [{ arq: 'm-dia-0.mp3', dur: 30 }],
    morte: [{ arq: 'm-morte-0.mp3', dur: 20 }],
  },
}

function elementoFalso() {
  const el = {
    src: '',
    currentTime: 0,
    paused: true,
    crossOrigin: null,
    preload: null,
    play: vi.fn(function () {
      this.paused = false
      return Promise.resolve()
    }),
    pause: vi.fn(function () {
      this.paused = true
    }),
  }
  return el
}

function contextoFalso() {
  const criados = []
  const elementos = []
  const param = (v) => ({
    value: v,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(function (x) {
      this.value = x
    }),
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
    elementos,
    currentTime: 0,
    sampleRate: 44100,
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
    createMediaElementSource: (el) => {
      elementos.push(el)
      return no('media', { el })
    },
    createBuffer: (c, n) => ({ getChannelData: () => new Float32Array(n) }),
    decodeAudioData: async () => ({ duration: 0.15, sampleRate: 44100 }),
    close: vi.fn(),
  }
}

const buscar = () =>
  vi.fn(async (url) =>
    url.endsWith('manifest.json')
      ? { ok: true, json: async () => MANIFESTO }
      : { ok: true, arrayBuffer: async () => new ArrayBuffer(64) },
  )

async function novo(opts = {}) {
  const ctx = contextoFalso()
  const feitos = []
  const a = createAudio({
    criarContexto: () => ctx,
    buscar: buscar(),
    criarElemento: () => {
      const el = elementoFalso()
      feitos.push(el)
      return el
    },
    ...opts,
  })
  a.unlock()
  await a.carregar()
  return { a, ctx, feitos }
}

/** Avança a trilha até ela mandar tocar alguma coisa (ou desistir). */
const ateTocar = (a, limite = 1200) => {
  for (let s = 0; s < limite; s += 1) {
    const arq = a.stepMusica(1)
    if (arq) return arq
  }
  return null
}

describe('roquecraft - a trilha é stream, não banco', () => {
  it('⚠️ música NÃO entra no banco de amostras', async () => {
    // São 5,8 MB em sete faixas; decodificadas viram ~90 MB de RAM e ainda
    // atrasam o primeiro frame. O manifesto lista a trilha em `musica`, fora de
    // `grupos`, e o carregador não pode confundir os dois.
    const { a } = await novo()
    expect(a.bancoInfo.amostras).toBe(1) // só o passo.grama
    expect(a.bancoInfo.musica.acervo).toBe(2)
  })

  it('nenhum `<audio>` é criado antes de a música começar', async () => {
    const { a, feitos } = await novo()
    expect(feitos).toHaveLength(0)
    expect(a.bancoInfo.musica.vozes).toBe(0)
  })

  it('quando toca, sai do arquivo certo e por streaming', async () => {
    const { a, feitos } = await novo()
    a.setMomento('dia')
    const arq = ateTocar(a)
    expect(arq).toBe('m-dia-0.mp3')
    expect(feitos).toHaveLength(1)
    expect(feitos[0].src).toBe(AUDIO_BASE + 'm-dia-0.mp3')
    expect(feitos[0].play).toHaveBeenCalled()
  })

  it('⚠️ reaproveita os elementos: trocar de faixa não vaza nó no grafo', async () => {
    // `createMediaElementSource` só pode ser chamado uma vez por elemento. Um
    // elemento novo por faixa vazaria um nó a cada troca — invisível até o
    // navegador engasgar depois de meia hora de jogo.
    const { a, ctx, feitos } = await novo()
    a.setMomento('dia')
    for (let i = 0; i < 6; i++) {
      ateTocar(a)
      a.setMomento(i % 2 ? 'dia' : 'morte')
    }
    expect(feitos.length).toBeLessThanOrEqual(2)
    expect(ctx.elementos.length).toBeLessThanOrEqual(2)
  })

  it('morrer troca a faixa no ar', async () => {
    const { a, feitos } = await novo()
    a.setMomento('dia')
    expect(ateTocar(a)).toBe('m-dia-0.mp3')
    a.setMomento('morte')
    expect(ateTocar(a)).toBe('m-morte-0.mp3')
    const tocadas = feitos.map((e) => e.src)
    expect(tocadas).toContain(AUDIO_BASE + 'm-morte-0.mp3')
  })

  it('o volume da música é independente do resto', async () => {
    const { a, ctx } = await novo({ volumeMusica: 0.4 })
    a.setMomento('dia')
    ateTocar(a)
    const ganhos = ctx.criados.filter((n) => n.tipo === 'gain')
    expect(ganhos.some((g) => Math.abs(g.gain.value - 0.4) < 1e-6)).toBe(true)
    a.setVolumeMusica(0)
    expect(ganhos.some((g) => g.gain.value === 0)).toBe(true)
  })

  it('⚠️ mergulhar NÃO abafa a trilha', async () => {
    // Efeito e ambiência passam pelo low-pass porque a ÁGUA está entre eles e o
    // ouvido. A trilha não está no mundo. Ligar tudo no mesmo barramento é o
    // erro fácil, e o sintoma é piano abafado ao nadar.
    const { a, ctx } = await novo()
    a.setMomento('dia')
    ateTocar(a)
    const filtro = ctx.criados.find((n) => n.tipo === 'filter')
    const ligadosAoFiltro = ctx.criados.filter((n) =>
      n.connect.mock.calls.some((c) => c[0] === filtro),
    )
    // o barramento de música não pode estar entre eles
    const busMusica = ctx.criados.find((n) => n.tipo === 'gain' && n.gain.value === 0.55)
    expect(busMusica, 'não achei o barramento de música').toBeTruthy()
    expect(ligadosAoFiltro).not.toContain(busMusica)
  })

  it('sem manifesto de música, o jogo não quebra — só fica sem trilha', async () => {
    const ctx = contextoFalso()
    const a = createAudio({
      criarContexto: () => ctx,
      buscar: vi.fn(async (url) =>
        url.endsWith('manifest.json')
          ? { ok: true, json: async () => ({ versao: 1, grupos: {} }) }
          : { ok: true, arrayBuffer: async () => new ArrayBuffer(8) },
      ),
      criarElemento: elementoFalso,
    })
    a.unlock()
    await a.carregar()
    a.setMomento('dia')
    expect(ateTocar(a, 60)).toBeNull()
    expect(a.bancoInfo.musica.acervo).toBe(0)
  })

  it('som desligado silencia a trilha também', async () => {
    const { a } = await novo()
    a.setEnabled(false)
    a.setMomento('dia')
    expect(ateTocar(a, 300)).toBeNull()
  })
})
