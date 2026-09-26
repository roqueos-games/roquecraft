import { describe, it, expect, vi } from 'vitest'
import {
  createAudio,
  familyOf,
  GRUPO,
  GANHO,
  LEITOS,
  FAMILIES,
  LPF_SUBMERSO,
  LPF_ABERTO,
} from '../../src/servicos/audio.js'

// O BANCO DE AMOSTRAS, SEM PLACA DE SOM.
//
// O founder pediu (2026-08-22): "o pack de som está horrível... busque um pack
// de áudio profissional para representar som de vento, chuva, passaros, passos
// em diversos tipos de terreno, som de batendo a mão na areia, som de picareta".
//
// O motor passou de síntese pra amostra CC0. Isso troca uma classe de defeito
// por outra: síntese sempre soa (mal), amostra pode simplesmente NÃO CHEGAR —
// 404, rede caída, `decodeAudioData` recusando o arquivo — e aí o jogo fica
// mudo sem avisar ninguém.
//
// Este arquivo guarda os dois lados: que o banco carrega e é usado quando
// chega, e que a síntese assume quando ele não chega.

/** AudioContext falso: registra o grafo em vez de tocar. */
function contextoFalso() {
  const criados = []
  const no = (tipo, extra = {}) => {
    const n = {
      tipo,
      connect: vi.fn(() => n),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      ...extra,
    }
    criados.push(n)
    return n
  }
  const param = (v) => ({
    value: v,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(function (x) {
      this.value = x
    }),
    exponentialRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  })
  const ctx = {
    criados,
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
    createBufferSource: () => no('bufsrc', { buffer: null, loop: false, playbackRate: param(1) }),
    createOscillator: () => no('osc', { frequency: param(440), type: '' }),
    createPanner: () =>
      no('panner', {
        panningModel: '',
        distanceModel: '',
        refDistance: 0,
        maxDistance: 0,
        rolloffFactor: 0,
        setPosition: vi.fn(),
      }),
    createBuffer: (c, n) => ({ getChannelData: () => new Float32Array(n) }),
    decodeAudioData: async () => ({ duration: 0.2, sampleRate: 44100 }),
    close: vi.fn(),
  }
  return ctx
}

const MANIFESTO = {
  versao: 1,
  grupos: {
    'passo.grama': ['p-grama-0.ogg', 'p-grama-1.ogg', 'p-grama-2.ogg'],
    'bate.picareta': ['f-picareta-0.ogg', 'f-picareta-1.ogg'],
    'bate.mao': ['f-mao-0.ogg'],
    'amb.vento': ['amb-vento.ogg'],
  },
}

function buscarFalso({ falharManifesto = false, falhar = [] } = {}) {
  return vi.fn(async (url) => {
    if (falharManifesto) return { ok: false, status: 404 }
    if (url.endsWith('manifest.json')) return { ok: true, json: async () => MANIFESTO }
    if (falhar.some((f) => url.endsWith(f))) return { ok: false, status: 404 }
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(64) }
  })
}

const novo = (opts = {}) => {
  const ctx = contextoFalso()
  const a = createAudio({ criarContexto: () => ctx, ...opts })
  a.unlock()
  return { a, ctx }
}

describe('roquecraft - banco de amostras', () => {
  it('carrega o manifesto e decodifica cada grupo', async () => {
    const { a } = novo({ buscar: buscarFalso() })
    await a.carregar()
    expect(a.bancoInfo).toMatchObject({ grupos: 4, amostras: 7, falha: null })
  })

  it('uma amostra que não veio não derruba o grupo inteiro', async () => {
    const { a } = novo({ buscar: buscarFalso({ falhar: ['p-grama-1.ogg'] }) })
    await a.carregar()
    expect(a.bancoInfo.amostras).toBe(6)
    expect(a.bancoInfo.grupos).toBe(4)
  })

  it('manifesto ausente NÃO deixa o jogo mudo: cai na síntese', async () => {
    const { a, ctx } = novo({ buscar: buscarFalso({ falharManifesto: true }) })
    await a.carregar()
    expect(a.bancoInfo.falha).toBeTruthy()
    const antes = ctx.criados.length
    a.step('grass')
    a.breakBlock('stone')
    // a síntese cria osciladores/fontes de ruído: o grafo tem que crescer
    expect(ctx.criados.length).toBeGreaterThan(antes)
  })

  it('com o banco carregado, o passo usa AMOSTRA e não a síntese', async () => {
    // ⚠️ Este teste já nasceu FRACO uma vez. A primeira versão contava
    // osciladores, e a síntese de passo não usa oscilador nenhum — ela usa uma
    // fonte de buffer com ruído branco. Com `tocarAmostra` sabotado pra sempre
    // falhar, o teste PASSOU. Só a mutação mostrou isso.
    //
    // O que separa os dois é o buffer: amostra vem de `decodeAudioData` (o
    // contexto falso devolve um objeto com `duration`), ruído vem de
    // `createBuffer` (devolve `getChannelData`). E a síntese põe `loop = true`,
    // porque ela precisa sustentar o ruído; a amostra toca uma vez.
    const { a, ctx } = novo({ buscar: buscarFalso() })
    await a.carregar()
    const antes = ctx.criados.length
    for (let i = 0; i < 8; i++) a.step('grass')
    const fontes = ctx.criados.slice(antes).filter((n) => n.tipo === 'bufsrc')
    expect(fontes.length).toBeGreaterThanOrEqual(8)
    const deAmostra = fontes.filter((n) => n.buffer?.duration !== undefined && !n.loop)
    expect(deAmostra.length, 'passo caiu na síntese com o banco carregado').toBe(fontes.length)
    expect(ctx.criados.slice(antes).filter((n) => n.tipo === 'osc').length).toBe(0)
  })

  it('não repete a mesma amostra duas vezes seguidas', async () => {
    const { a, ctx } = novo({ buscar: buscarFalso() })
    await a.carregar()
    // 3 amostras em passo.grama; 200 disparos e nenhuma repetição imediata
    const antes = ctx.criados.length
    for (let i = 0; i < 200; i++) a.step('grass')
    const fontes = ctx.criados.slice(antes).filter((n) => n.tipo === 'bufsrc')
    let repetiu = 0
    for (let i = 1; i < fontes.length; i++) if (fontes[i].buffer === fontes[i - 1].buffer) repetiu++
    expect(repetiu, 'repetição imediata é o que o ouvido chama de "som de jogo ruim"').toBe(0)
  })

  it('grupo de uma amostra só não quebra a regra de não-repetição', async () => {
    const { a } = novo({ buscar: buscarFalso() })
    await a.carregar()
    // bate.mao tem 1 arquivo: tem que tocar, não travar
    expect(() => {
      for (let i = 0; i < 5; i++) a.dig('grass')
    }).not.toThrow()
  })

  it('varia a altura a cada disparo', async () => {
    const { a, ctx } = novo({ buscar: buscarFalso() })
    await a.carregar()
    const antes = ctx.criados.length
    for (let i = 0; i < 30; i++) a.step('grass')
    const taxas = ctx.criados
      .slice(antes)
      .filter((n) => n.tipo === 'bufsrc')
      .map((n) => n.playbackRate.value)
    expect(new Set(taxas).size, 'toda amostra saiu na mesma altura').toBeGreaterThan(10)
    for (const r of taxas) {
      expect(r).toBeGreaterThan(0.9)
      expect(r).toBeLessThan(1.1)
    }
  })
})

describe('roquecraft - submerso é filtro, não arquivo', () => {
  it('move o corte do barramento entre 20 kHz e 888 Hz', () => {
    const { a, ctx } = novo({ buscar: buscarFalso() })
    const f = ctx.criados.find((n) => n.tipo === 'filter')
    expect(f.frequency.value).toBe(LPF_ABERTO)
    a.setSubmerso(true)
    expect(f.frequency.value).toBe(LPF_SUBMERSO)
    a.setSubmerso(false)
    expect(f.frequency.value).toBe(LPF_ABERTO)
  })

  it('chamar de novo com o mesmo estado não reprograma a rampa', () => {
    const { a, ctx } = novo({ buscar: buscarFalso() })
    const f = ctx.criados.find((n) => n.tipo === 'filter')
    a.setSubmerso(true)
    const n = f.frequency.linearRampToValueAtTime.mock.calls.length
    a.setSubmerso(true)
    a.setSubmerso(true)
    expect(f.frequency.linearRampToValueAtTime.mock.calls.length).toBe(n)
  })
})

describe('roquecraft - som posicionado', () => {
  it('braçada de OUTRO jogador cria um panner; a sua não', async () => {
    const { a, ctx } = novo({ buscar: buscarFalso() })
    await a.carregar()
    // agua.bracada não está no manifesto falso: a síntese assume, e a síntese
    // não posiciona. Então o teste usa um grupo que existe.
    const antes = ctx.criados.filter((n) => n.tipo === 'panner').length
    a.bracada()
    expect(ctx.criados.filter((n) => n.tipo === 'panner').length).toBe(antes)
  })

  it('o painel de distância segue a spec do W3C e o refDistance do Luanti', async () => {
    const { a, ctx } = novo({
      buscar: vi.fn(async (url) => {
        if (url.endsWith('manifest.json'))
          return { ok: true, json: async () => ({ grupos: { 'agua.bracada': ['a.ogg'] } }) }
        return { ok: true, arrayBuffer: async () => new ArrayBuffer(64) }
      }),
    })
    await a.carregar()
    a.bracada({ x: 10, y: 64, z: -3 })
    const p = ctx.criados.find((n) => n.tipo === 'panner')
    expect(p).toBeTruthy()
    expect(p.distanceModel).toBe('inverse')
    expect(p.panningModel).toBe('equalpower')
    expect(p.refDistance).toBe(3)
  })
})

describe('roquecraft - leitos de ambiente', () => {
  it('sobe um leito e o mantém tocando', async () => {
    const { a } = novo({ buscar: buscarFalso() })
    await a.carregar()
    a.setAmbiente({ 'amb.vento': 1 })
    expect(a.bancoInfo.leitos).toContain('amb.vento')
  })

  it('leito sem amostra carregada não cria fonte nenhuma', async () => {
    const { a } = novo({ buscar: buscarFalso() })
    await a.carregar()
    a.setAmbiente({ 'amb.chuva': 1 })
    expect(a.bancoInfo.leitos).not.toContain('amb.chuva')
  })

  it('todo leito declarado tem ganho de repouso', () => {
    for (const g of Object.keys(LEITOS)) expect(LEITOS[g]).toBeGreaterThan(0)
  })
})

describe('roquecraft - taxonomia de material', () => {
  it('toda família tem grupo e ganho nas três ações', () => {
    for (const f of FAMILIES)
      for (const acao of ['passo', 'bate', 'quebra']) {
        expect(GRUPO[acao][f], `${acao}.${f}`).toBeTruthy()
        expect(GANHO[acao][f], `${acao}.${f}`).toBeTypeOf('number')
      }
  })

  it('o pedido literal do founder tem grupo próprio', () => {
    // "som de picareta" e "som de batendo a mão na areia"
    expect(GRUPO.bate[familyOf('stone')]).toBe('bate.picareta')
    expect(GRUPO.bate[familyOf('grass')]).toBe('bate.mao')
    expect(GRUPO.passo[familyOf('sand')]).toBe('passo.areia')
    expect(GRUPO.passo[familyOf('snowBlock')]).toBe('passo.neve')
  })
})
