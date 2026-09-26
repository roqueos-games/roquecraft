import { describe, it, expect, vi, afterEach } from 'vitest'
import { packDisponivel, lerPack, PACK_BASE } from '../../src/servicos/render/resourcePack.js'

// O carregador de pack local é opcional: quem não instalou nada joga com as 81
// texturas procedurais. O teste que importa é o do caminho NEGATIVO, porque é o
// que roda pra todo mundo em produção.
//
// E o negativo tem uma armadilha específica: este site é uma SPA e o hosting
// reescreve caminho desconhecido pro index.html com status **200**. Um teste de
// `r.ok` passaria, e em produção o jogo pediria as 85 imagens do pack em toda
// carga (medido em roqueos.web.app, 2026-08-22).
const resposta = (ok, corpo) => ({ ok, text: () => Promise.resolve(corpo) })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('packDisponivel', () => {
  it('diz NÃO quando o hosting devolve o index.html da SPA com 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(resposta(true, '<!doctype html><html lang=pt-BR>…'))),
    )
    expect(await packDisponivel()).toBe(false)
  })

  it('diz NÃO em 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(resposta(false, 'Not found'))),
    )
    expect(await packDisponivel()).toBe(false)
  })

  it('diz NÃO quando a rede cai', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    )
    expect(await packDisponivel()).toBe(false)
  })

  it('diz NÃO pra JSON válido que não é um pack.mcmeta', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(resposta(true, '{"foo":1}'))),
    )
    expect(await packDisponivel()).toBe(false)
  })

  it('diz SIM pro pack.mcmeta de verdade', async () => {
    const meta = JSON.stringify({ pack: { pack_format: 15, description: 'x' } })
    const espiao = vi.fn(() => Promise.resolve(resposta(true, meta)))
    vi.stubGlobal('fetch', espiao)
    expect(await packDisponivel()).toBe(true)
    expect(espiao.mock.calls[0][0]).toBe(`${PACK_BASE}pack.mcmeta`)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// O CARREGADOR EM SI nunca teve teste, porque ele depende de `Image` e de um
// canvas 2D — e o jsdom não tem nem um nem outro de verdade. O resultado é que
// as decisões mais fáceis de errar do arquivo (o recorte do primeiro quadro, o
// nome alternativo da textura, e a flag que evita ler pixel de volta da GPU)
// estavam sem dono nenhum.
//
// Os dois são falsos aqui, mas os NÚMEROS são de verdade: o que se afirma é
// exatamente com que argumentos o recorte e a leitura acontecem.
// ─────────────────────────────────────────────────────────────────────────────
describe('lerPack — o recorte, o nome alternativo e a flag do canvas', () => {
  /** `Image` de mentira: `src` dispara `onload` com o tamanho combinado. */
  const instalarImagens = (porUrl) => {
    const pedidas = []
    class FakeImage {
      set src(url) {
        pedidas.push(url)
        const medida = porUrl(url)
        queueMicrotask(() => (medida ? this.onload?.() : this.onerror?.()))
        if (medida) {
          this.width = medida.width
          this.height = medida.height
        }
      }
    }
    vi.stubGlobal('Image', FakeImage)
    return pedidas
  }

  /** Canvas de mentira que registra cada chamada do contexto 2D. */
  const instalarCanvas = () => {
    const chamadas = { getContext: [], clearRect: [], drawImage: [], getImageData: [] }
    const ctx = {
      clearRect: (...a) => chamadas.clearRect.push(a),
      drawImage: (...a) => chamadas.drawImage.push(a),
      getImageData: (...a) => {
        chamadas.getImageData.push(a)
        return { data: new Uint8ClampedArray(4) }
      },
    }
    const canvas = {
      width: 0,
      height: 0,
      getContext: (...a) => {
        chamadas.getContext.push(a)
        return ctx
      },
    }
    const original = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag) =>
      tag === 'canvas' ? canvas : original(tag),
    )
    return { chamadas, canvas }
  }

  it('recorta o PRIMEIRO QUADRO da tira animada, a partir do canto', () => {
    // ⚠️ Água e lava vêm como TIRA VERTICAL de quadros. Sem o recorte, o mar
    // entra esticado em 1/32 da altura e vira listra. Os zeros do `drawImage`
    // são o canto de onde o recorte sai: virando 1, a atlas inteira sai
    // deslocada um pixel — costura visível em todo bloco do jogo.
    const pedidas = instalarImagens((url) =>
      url.endsWith('water.png') ? { width: 16, height: 512 } : null,
    )
    const { chamadas, canvas } = instalarCanvas()

    return lerPack(['water']).then((r) => {
      expect(r).toMatchObject({ tile: 16, total: 1 })
      expect(canvas.width).toBe(16)
      expect(canvas.height).toBe(16)
      expect(chamadas.drawImage[0].slice(1)).toEqual([0, 0, 16, 16, 0, 0, 16, 16])
      expect(chamadas.clearRect[0]).toEqual([0, 0, 16, 16])
      expect(chamadas.getImageData[0]).toEqual([0, 0, 16, 16])
      expect(pedidas.some((u) => u.endsWith('water.png'))).toBe(true)
    })
  })

  it('o canvas é aberto com willReadFrequently — a atlas é LIDA de volta camada a camada', () => {
    // `willReadFrequently: true` virando `false` faz o navegador acelerar o
    // canvas na GPU e depois trazer cada `getImageData` de volta pela ponte —
    // 85 leituras síncronas no carregamento do mundo.
    instalarImagens((url) => (url.endsWith('stone.png') ? { width: 32, height: 32 } : null))
    const { chamadas } = instalarCanvas()
    return lerPack(['stone']).then(() => {
      expect(chamadas.getContext[0]).toEqual(['2d', { willReadFrequently: true }])
    })
  })

  it('nome sem alternativa declarada ainda é tentado com o próprio nome', () => {
    // `MAPA[nome] || [nome]` virando `&&`: um nome fora da tabela de apelidos
    // vira `undefined`, e o `for...of` estoura no carregamento do pack. Um
    // nome DENTRO da tabela perde os apelidos e o pack fica sem a textura.
    const pedidas = instalarImagens((url) =>
      url.endsWith('bedrock.png') ? { width: 16, height: 16 } : null,
    )
    instalarCanvas()
    return lerPack(['bedrock']).then((r) => {
      expect(r.total).toBe(1)
      expect(pedidas).toEqual([`${PACK_BASE}assets/minecraft/textures/block/bedrock.png`])
    })
  })

  it('apelido: cai no segundo nome quando o primeiro não existe', () => {
    const pedidas = instalarImagens((url) =>
      url.endsWith('reeds.png') ? { width: 16, height: 16 } : null,
    )
    instalarCanvas()
    return lerPack(['sugar_cane']).then((r) => {
      expect(r.total).toBe(1)
      expect(pedidas.map((u) => u.split('/').pop())).toEqual(['sugar_cane.png', 'reeds.png'])
    })
  })

  it('nenhuma textura encontrada devolve null, e o jogo fica no procedural', () => {
    instalarImagens(() => null)
    instalarCanvas()
    return lerPack(['stone', 'dirt']).then((r) => expect(r).toBeNull())
  })

  it('tira mais larga que o teto é reamostrada pro teto', () => {
    instalarImagens((url) => (url.endsWith('stone.png') ? { width: 1024, height: 1024 } : null))
    const { chamadas } = instalarCanvas()
    return lerPack(['stone'], { tileMax: 256 }).then((r) => {
      expect(r.tile).toBe(256)
      expect(chamadas.drawImage[0].slice(1)).toEqual([0, 0, 1024, 1024, 0, 0, 256, 256])
    })
  })
})
