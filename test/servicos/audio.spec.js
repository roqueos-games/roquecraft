import { describe, it, expect } from 'vitest'
import {
  familyOf,
  createAudio,
  FAMILIES,
  GRUPO,
  GANHO,
  GANHO_AMOSTRA,
} from '../../src/servicos/audio.js'
import { landingSpot, safeSpawn, melhorVista } from '../../src/servicos/physics.js'

describe('audio - familia de material', () => {
  it('reconhece a familia pela CHAVE, sem tabela por bloco', () => {
    // Um bloco novo tem que herdar o som certo sem entrar em lista nenhuma -
    // por isso o casamento e por prefixo/sufixo, nao por id.
    expect(familyOf('oakLog')).toBe('wood')
    expect(familyOf('birchPlanks')).toBe('wood')
    expect(familyOf('stone')).toBe('stone')
    expect(familyOf('cobblestone')).toBe('stone')
    expect(familyOf('dirt')).toBe('dirt')
    expect(familyOf('sand')).toBe('sand')
    expect(familyOf('grass')).toBe('grass')
    expect(familyOf('glass')).toBe('glass')
    expect(familyOf('whiteWool')).toBe('wool')
    expect(familyOf('ironBlock')).toBe('metal')
    expect(familyOf('water')).toBe('liquid')
    expect(familyOf('lava')).toBe('liquid')
  })

  it('neve, cascalho e folhas têm família PRÓPRIA', () => {
    // ⚠️ Mudança deliberada de contrato em 2026-08-22, não afrouxamento de
    // teste. Este arquivo afirmava `gravel → sand` e `oakLeaves → grass`, o que
    // estava certo enquanto o som era sintetizado: as três famílias
    // compartilhavam um perfil de filtro e separá-las não mudaria nada.
    //
    // Com o pacote CC0 existem amostras distintas de cascalho e de folhas, e o
    // agrupamento passou a apagar diferença audível.
    //
    // A NEVE é o caso grave, e era um defeito de verdade: `snowBlock` não
    // casava com nenhum ramo e caía no `return 'stone'` do fim. Metade do mapa
    // é bioma frio — o jogador pisava em neve e ouvia pedra.
    expect(familyOf('snowBlock')).toBe('snow')
    expect(familyOf('snowLayer')).toBe('snow')
    expect(familyOf('gravel')).toBe('gravel')
    expect(familyOf('oakLeaves')).toBe('leaves')
    expect(familyOf('vine')).toBe('leaves')
    // gelo continua com vidro: o timbre é o mesmo e não há amostra separada
    expect(familyOf('ice')).toBe('glass')
  })

  it('toda família tem grupo de amostra nas três ações', () => {
    // Uma família sem entrada em `GRUPO` cai no fallback e perde o som próprio
    // — silenciosamente. Aqui isso vira erro.
    for (const f of FAMILIES) {
      for (const acao of ['passo', 'bate', 'quebra']) {
        expect(GRUPO[acao][f], `${acao}.${f} sem grupo`).toBeTruthy()
        expect(GANHO[acao][f], `${acao}.${f} sem ganho`).toBeTypeOf('number')
      }
    }
  })

  it('passo é MUITO mais baixo que quebrar, em toda família', () => {
    // A tabela do Luanti separa as duas colunas por ~14 dB. Sem essa distância
    // o passo mascara o retorno da ação — que é metade do que faz o jogo
    // responder ao dedo.
    for (const f of FAMILIES) {
      expect(GANHO.passo[f], `passo em ${f} não é mais baixo que quebrar`).toBeLessThan(
        GANHO.quebra[f],
      )
    }
  })

  it('bloco desconhecido cai em pedra, nunca em undefined', () => {
    expect(FAMILIES).toContain(familyOf('bloco_que_nao_existe'))
    expect(FAMILIES).toContain(familyOf(''))
    expect(FAMILIES).toContain(familyOf(undefined))
  })
})

describe('landingSpot - onde o jogador pousa', () => {
  // mundo de teste: chao solido ate y=63, uma caverna vazia de 40 a 44
  const solidAt = (x, y) => y <= 63 && !(y >= 40 && y <= 44)

  it('devolve a superficie, nao a caverna', () => {
    // Este e o bug: `safeSpawn` varre de BAIXO pra cima e para na primeira
    // bolha de ar - que aqui e o CHAO da caverna, 24 blocos abaixo da superficie.
    const dentro = safeSpawn(solidAt, 0.5, 0.5, 1)
    expect(dentro.y).toBe(40)

    const fora = landingSpot(solidAt, 0.5, 0.5, 63)
    expect(fora.y).toBe(64)
  })

  it('centraliza no bloco (nada de nascer preso na quina)', () => {
    const p = landingSpot(solidAt, 12.9, -3.1, 63)
    expect(p.x).toBe(12.5)
    expect(p.z).toBe(-3.5)
  })

  it('coluna sem chao nenhum devolve null em vez de inventar altura', () => {
    expect(landingSpot(() => false, 0, 0, 100)).toBe(null)
  })

  it('nao devolve ponto com o teto colado (o corpo tem 1,8 de altura)', () => {
    // chao em 63, e um bloco em 65: sobra so 1 de ar, nao cabe
    const apertado = (x, y) => y <= 63 || y === 65
    const p = landingSpot(apertado, 0, 0, 70)
    expect(p === null || p.y > 65).toBe(true)
  })
})

describe('melhorVista - pra onde olhar ao nascer', () => {
  // Chao plano em y=63 com um paredao de terra a leste (x >= 3). Olhar pra
  // leste e o print 50 do QA de 20/08: pouso perfeito, cara na parede.
  const comParede = (x, y) => {
    if (y <= 62) return true // chao
    if (x >= 3 && x <= 6 && y <= 70) return true // paredao a leste
    return false
  }

  it('vira as costas pro paredao', () => {
    const yaw = melhorVista(comParede, 0.5, 63, 0.5)
    const dx = Math.sin(yaw)
    expect(dx, 'o olhar nao pode apontar pro lado do paredao (x crescente)').toBeLessThan(0.5)
  })

  it('em campo totalmente aberto devolve um yaw valido', () => {
    const plano = (x, y) => y <= 62
    const yaw = melhorVista(plano, 0.5, 63, 0.5)
    expect(Number.isFinite(yaw)).toBe(true)
    expect(yaw).toBeGreaterThanOrEqual(0)
    expect(yaw).toBeLessThan(Math.PI * 2)
  })

  it('dentro de um corredor escolhe o eixo do corredor', () => {
    // paredes em x = -2 e x = +2: so sobra o eixo z
    const corredor = (x, y) => y <= 62 || Math.abs(x) >= 2
    const yaw = melhorVista(corredor, 0.5, 63, 0.5)
    expect(Math.abs(Math.sin(yaw)), 'nao pode apontar pra parede lateral').toBeLessThan(0.3)
  })
})

describe('landingSpot - nao pousa em cima de arvore', () => {
  // Coluna: chao solido ate y=63, tronco/copa de 70 a 73. Sem o filtro, o
  // primeiro apoio de cima pra baixo e a COPA - e o jogo comeca com o jogador
  // empoleirado num galho a 10 blocos do chao (QA de 20/08/2026).
  const solidAt = (x, y) => y <= 63 || (y >= 70 && y <= 73)
  const ehFolha = (x, y) => y >= 72 && y <= 73

  it('sem filtro, pousa na copa', () => {
    const p = landingSpot(solidAt, 0, 0, 90)
    expect(p.y).toBe(74)
  })

  it('com filtro de folha, desce ate o chao', () => {
    const p = landingSpot(solidAt, 0, 0, 90, 1, (x, y, z) => !ehFolha(x, y, z))
    expect(p.y, 'tinha que ter descido ate o chao de verdade').toBe(64)
  })

  it('o filtro nao impede pousar quando nao ha arvore', () => {
    const p = landingSpot(
      (x, y) => y <= 63,
      0,
      0,
      90,
      1,
      () => true,
    )
    expect(p.y).toBe(64)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// O MOTOR DE ÁUDIO EM SI nunca teve teste: `familyOf` e as tabelas de ganho são
// puras e foram testadas acima, mas tudo que depende do `AudioContext` ficou de
// fora — e é lá que moram as decisões que somem sem sintoma (um leito de
// ambiente tocando em silêncio para sempre, o medidor lendo um buffer do
// tamanho errado, um ganho declarado zero virando o ganho da pedra).
//
// `createAudio` aceita `criarContexto` e `buscar` injetados exatamente para
// isto. O contexto abaixo é falso, mas registra tudo que o grafo pede.
// ─────────────────────────────────────────────────────────────────────────────
function contextoFalso({ fftSize = 8 } = {}) {
  const criados = { fontes: [], ganhos: [], panners: 0 }
  const param = (v = 0) => ({
    value: v,
    setValueAtTime: () => {},
    linearRampToValueAtTime: (alvo) => {
      param.ultimoAlvo = alvo
    },
    exponentialRampToValueAtTime: () => {},
    cancelScheduledValues: () => {},
    setTargetAtTime: () => {},
  })
  const no = (extra = {}) => ({ connect: (d) => d, disconnect: () => {}, ...extra })
  const ctx = {
    currentTime: 0,
    sampleRate: 48000,
    state: 'running',
    destination: {},
    criados,
    analisador: null,
    createGain: () => {
      const g = no({ gain: param(1) })
      criados.ganhos.push(g)
      return g
    },
    createBufferSource: () => {
      const s = no({
        buffer: null,
        loop: false,
        playbackRate: param(1),
        start: (...a) => (s.iniciouEm = a),
        stop: () => {},
      })
      criados.fontes.push(s)
      return s
    },
    createBiquadFilter: () => no({ type: '', frequency: param(20000), Q: param(1) }),
    createDynamicsCompressor: () =>
      no({
        threshold: param(),
        knee: param(),
        ratio: param(),
        attack: param(),
        release: param(),
      }),
    createAnalyser: () => {
      const a = no({
        fftSize,
        // Só devolve sinal quando o array tem o tamanho que o analisador pede:
        // é assim que o teste percebe um buffer velho sendo reusado.
        getFloatTimeDomainData: (arr) => {
          if (arr.length === ctx.analisador.fftSize) arr[0] = 0.5
        },
      })
      ctx.analisador = a
      return a
    },
    createPanner: () => {
      criados.panners++
      return no({
        panningModel: '',
        distanceModel: '',
        refDistance: 0,
        maxDistance: 0,
        rolloffFactor: 0,
        setPosition: () => {},
      })
    },
    createBuffer: (canais, len, taxa) => ({
      numberOfChannels: canais,
      length: len,
      sampleRate: taxa,
      duration: len / taxa,
      getChannelData: () => new Float32Array(len),
    }),
    createOscillator: () =>
      no({ type: '', frequency: param(440), start: () => {}, stop: () => {} }),
    decodeAudioData: async () => ctx.createBuffer(1, 4800, 48000),
    listener: {},
    resume: async () => {},
    close: async () => {},
  }
  return ctx
}

const buscarFalso = () => {
  const manifesto = {
    grupos: { 'passo.pedra': ['passo/pedra1.ogg'], 'amb.vento': ['amb/vento1.ogg'] },
  }
  return async (url) => ({
    ok: true,
    status: 200,
    json: async () => manifesto,
    arrayBuffer: async () => new ArrayBuffer(8),
    url,
  })
}

describe('audio do RoqueCraft — o leito de ambiente', () => {
  it('leito pedido em ZERO não cria fonte nenhuma', () => {
    // ⚠️ `!lista || !lista.length || alvo <= 0` apertado para `<`: pedir um
    // leito com volume zero — que é o que `setAmbiente` faz com TODO leito que
    // o bioma não usa — passa a criar a fonte, ligar `loop` e dar `start()`.
    // São sete loops tocando em silêncio para sempre, em toda partida.
    const ctx = contextoFalso()
    const a = createAudio({ criarContexto: () => ctx })
    a.unlock()
    const antes = ctx.criados.fontes.length
    a.setAmbiente({})
    expect(ctx.criados.fontes.length).toBe(antes)
  })

  it('leito sem amostra carregada também não cria fonte', () => {
    const ctx = contextoFalso()
    const a = createAudio({ criarContexto: () => ctx })
    a.unlock()
    const antes = ctx.criados.fontes.length
    a.setAmbiente({ 'amb.vento': 1 })
    expect(ctx.criados.fontes.length).toBe(antes)
  })

  it('COM amostra carregada, o volume zero continua não criando fonte', async () => {
    // ⚠️ Este é o teste que prende o `alvo <= 0`: com o banco vazio a guarda
    // anterior (`!lista.length`) já barrava tudo, e o comparador nunca era
    // alcançado. Com o leito carregado, é ele e mais ninguém que impede sete
    // loops de tocarem em silêncio a partida inteira.
    const ctx = contextoFalso()
    const a = createAudio({ criarContexto: () => ctx, buscar: buscarFalso() })
    a.unlock()
    await a.carregar()

    const antes = ctx.criados.fontes.length
    a.setAmbiente({})
    expect(ctx.criados.fontes.length, 'volume zero criou fonte').toBe(antes)

    a.setAmbiente({ 'amb.vento': 0.8 })
    expect(ctx.criados.fontes.length, 'volume de verdade não criou fonte').toBe(antes + 1)
  })
})

describe('audio do RoqueCraft — o medidor de pico', () => {
  it('sem contexto, o pico é silêncio digital', () => {
    const a = createAudio({ criarContexto: () => contextoFalso() })
    expect(a.picoDbfs()).toBe(-Infinity)
  })

  it('o buffer de leitura ACOMPANHA a mudança de tamanho da FFT', () => {
    // ⚠️ `amostras.length !== medidor.fftSize` invertido inverte a regra: o
    // buffer é recriado quando o tamanho BATE e reusado quando não bate. Trocar
    // o perfil de qualidade troca a FFT, e o medidor passaria a ler um array do
    // tamanho antigo — o harness mediria -Infinity com o jogo tocando.
    const ctx = contextoFalso({ fftSize: 8 })
    const a = createAudio({ criarContexto: () => ctx })
    a.unlock()
    expect(a.picoDbfs()).toBeCloseTo(20 * Math.log10(0.5), 6)

    ctx.analisador.fftSize = 64
    expect(a.picoDbfs()).toBeCloseTo(20 * Math.log10(0.5), 6)
  })
})

describe('audio do RoqueCraft — o AudioContext do navegador', () => {
  it('sem contexto injetado, usa o do navegador', () => {
    // `typeof window !== 'undefined' && (window.AudioContext || ...)` invertido
    // desliga o áudio inteiro em qualquer navegador: `ensure()` devolve null e
    // nenhum som sai, em silêncio.
    const ctx = contextoFalso()
    const original = Object.getOwnPropertyDescriptor(window, 'AudioContext')
    Object.defineProperty(window, 'AudioContext', {
      value: function () {
        return ctx
      },
      configurable: true,
      writable: true,
    })
    try {
      const a = createAudio({})
      a.unlock()
      expect(a.bancoInfo.corte).toBe(20000)
    } finally {
      if (original) Object.defineProperty(window, 'AudioContext', original)
      else delete window.AudioContext
    }
  })
})

describe('audio do RoqueCraft — ganho declarado por material', () => {
  const comBanco = async () => {
    const ctx = contextoFalso()
    const a = createAudio({ criarContexto: () => ctx, buscar: buscarFalso() })
    a.unlock()
    await a.carregar()
    return { ctx, a }
  }

  it('família sem ganho próprio herda o da PEDRA', async () => {
    const { ctx, a } = await comBanco()
    const antes = ctx.criados.ganhos.length
    a.step('familiaQueNaoExiste')
    const g = ctx.criados.ganhos[antes]
    expect(g.gain.value).toBeCloseTo(GANHO.passo.stone * GANHO_AMOSTRA, 6)
  })

  it('ganho declarado ZERO é silêncio pedido, não ausência de ganho', async () => {
    // ⚠️ ESTE É O CASO QUE SEPARA `??` DE `||`. Uma família declarada com ganho
    // 0 — um material que não faz barulho nenhum ao ser pisado — cairia, com
    // `||`, no ganho da PEDRA: o material mudo passa a soar como pedra.
    const original = GANHO.passo.stone
    GANHO.passo.familiaMuda = 0
    try {
      const { ctx, a } = await comBanco()
      const antes = ctx.criados.ganhos.length
      a.step('familiaMuda')
      expect(ctx.criados.ganhos[antes].gain.value).toBe(0)
      expect(original).toBeGreaterThan(0)
    } finally {
      delete GANHO.passo.familiaMuda
    }
  })
})
