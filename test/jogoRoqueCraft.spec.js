// O RoqueCraft inteiro, montado pelo contrato do jogo-sdk com o host falso.
//
// ⚠️ O COMPONENTE DO JOGO NUNCA FOI MONTADO POR TESTE NENHUM (até o
// `roquecraftMonta.spec.js` do front, de onde vêm os seis casos marcados com
// "Do front:"). O spec que existia antes dele dizia que "um mount completo em
// jsdom seria frágil" e conferia só que o arquivo exporta alguma coisa. O
// resultado é que TODA a fiação — o boot, a ordem em que os composables nascem,
// o teardown — não tinha guard nenhum: 9.836 testes verdes e ninguém provava
// que o jogo ABRE. Foi assim que um `ReferenceError` no setup (26/08) passou
// por lint e por 7.445 testes enquanto o jogo inteiro não subia.
//
// O que este arquivo monta é o jogo de verdade, pela mesma porta que o RoqueOS
// usa (`jogo.mount(el, host, { ativo })`). O que ele troca por dublê é só o que
// não existe em jsdom: WebGL (o `three` e a cena) e o laço de quadros. O Worker
// do terreno não existe em jsdom e o jogo cai no modo inline, que é o mesmo
// código. Nenhum mock de store, Firebase ou i18n do RoqueOS: se o jogo ainda
// alcançasse algo do RoqueOS, este arquivo não rodaria fora dele.
//
// ⚠️ E ELE NÃO É UM TESTE DE RENDER. Nada aqui afirma que a tela está bonita:
// isso é trabalho da folha de contato, e confundir os dois foi o que deixou o
// jogo cinco rodadas quebrado com o portão verde.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { VERSAO_DO_CONTRATO } from '@roqueos-games/jogo-sdk'
import { criarHostFalso } from '@roqueos-games/jogo-sdk/host-falso'
import jogo from '../src/index.js'
import { buildSavePayload } from '../src/servicos/roqueCraftSave.js'
import { criarCena } from '../src/servicos/cena.js'
import { criarFalaDoRoqueOS } from '../src/servicos/falaDoRoqueOS.js'
import manifesto from '../jogo.json'
import ptBR from '../i18n/pt-BR.json'
import enUS from '../i18n/en-US.json'

vi.mock('three', async () => (await import('./threeStub.js')).makeThreeStub())

const { motorFalso } = vi.hoisted(() => ({ motorFalso: vi.fn() }))

// A cena é a fronteira com a GPU: tudo que ela devolve é o que o componente
// fia. Trocá-la por um dublê é o que deixa o boot inteiro rodar em jsdom.
vi.mock('../src/servicos/cena.js', () => ({
  criarCena: vi.fn(async ({ aoProgredir }) => {
    aoProgredir?.(40, 'roqueCraft.boot.engine')
    return {
      textures: { layers: {}, atlas: {}, pack: null },
      engine: {
        camera: { fov: 70, updateProjectionMatrix: vi.fn(), position: { set: vi.fn() } },
        scene: { add: vi.fn(), remove: vi.fn() },
        renderer: { domElement: document.createElement('canvas'), dispose: vi.fn() },
        viewmodel: { setHeld: vi.fn(), setVisible: vi.fn(), swing: vi.fn() },
        setSection: vi.fn(),
        removeChunk: vi.fn(),
        render: vi.fn(),
        resize: vi.fn(),
        dispose: motorFalso,
        setFx: vi.fn(),
        setClima: vi.fn(),
      },
      audio: null,
      entities: {
        dispose: vi.fn(),
        syncMobs: vi.fn(),
        syncDrops: vi.fn(),
        stepParticles: vi.fn(),
      },
      pack: null,
    }
  }),
  montarMotor: vi.fn(),
}))
// Os ícones do inventário são desenhados em canvas 2D a partir das imagens das
// texturas, e o jsdom não carrega imagem nem tem canvas 2D: sem isto o boot
// espera para sempre em "Ligando o motor". O jogo trata ícone faltando.
vi.mock('../src/servicos/icones.js', async (real) => ({
  ...(await real()),
  montarIconesDoJogo: async () => ({}),
}))
// A ponte do aldeão até a `ia` do host, espiada para o teste da fiação.
vi.mock('../src/servicos/falaDoRoqueOS.js', async (real) => {
  const r = await real()
  return { ...r, criarFalaDoRoqueOS: vi.fn(r.criarFalaDoRoqueOS) }
})

let el = null
let host = null
let montagem = null
let avisosDoVue = []

const ctx2d = () => {
  const stub = new Proxy(function () {}, {
    get: (_t, prop) => (prop === Symbol.toPrimitive ? () => 0 : stub),
    set: () => true,
    apply: () => stub,
  })
  return stub
}

const palco = () => {
  el = document.createElement('div')
  document.body.appendChild(el)
  return el
}
const $ = (sel) => el.querySelector(sel)
const novoHost = (opcoes = {}) => criarHostFalso({ jogoId: 'roquecraft', ...opcoes })
/** Monta pelo contrato e espera o app subir (ele só sobe com o texto do idioma). */
async function montarCom(h, { ativo = true } = {}) {
  host = h
  montagem = jogo.mount(palco(), host, { ativo })
  await vi.waitFor(() => {
    if (!$('.ros-roquecraft')) throw new Error('o RoqueCraft ainda não montou')
  })
  await nextTick()
}
/** Espera o boot terminar: a tela de carregamento some. */
const bootou = () =>
  vi.waitFor(
    () => {
      if ($('.ros-roquecraft__boot')) throw new Error('ainda carregando')
    },
    { timeout: 12000, interval: 20 },
  )
function desmontar() {
  montagem?.desmontar()
  el?.remove()
  montagem = null
  el = null
}
const pedidos = (capacidade, metodo) =>
  host.chamadas.filter((c) => c.capacidade === capacidade && c.metodo === metodo)

/**
 * Conta listener por TIPO, e compara adiciona × remove.
 *
 * ⚠️ A PRIMEIRA VERSÃO CONTAVA UM SALDO GLOBAL E ACEITAVA "menos que 30". O
 * controle de mutantes derrubou ela na hora: apagar `entrada.encerrar()` do
 * teardown — que vaza QUATRO listeners por ciclo — passava folgado. Um guard
 * com folga arbitrária não guarda nada.
 *
 * `once: true` é ignorado de propósito: esse listener se remove sozinho ao
 * disparar e nunca chama `removeEventListener`, então contá-lo acusaria vazamento
 * onde não há (é o caso do desbloqueio de áudio no primeiro toque).
 */
function espiaoDeListeners() {
  const saldo = new Map()
  const orig = {
    winAdd: window.addEventListener,
    winRem: window.removeEventListener,
    docAdd: document.addEventListener,
    docRem: document.removeEventListener,
  }
  const conta = (alvo, tipo, n, opts) => {
    if (opts && typeof opts === 'object' && opts.once) return
    const chave = `${alvo}:${tipo}`
    saldo.set(chave, (saldo.get(chave) || 0) + n)
  }
  window.addEventListener = function (t, f, o) {
    conta('window', t, 1, o)
    return orig.winAdd.call(window, t, f, o)
  }
  window.removeEventListener = function (t, f, o) {
    conta('window', t, -1, o)
    return orig.winRem.call(window, t, f, o)
  }
  document.addEventListener = function (t, f, o) {
    conta('document', t, 1, o)
    return orig.docAdd.call(document, t, f, o)
  }
  document.removeEventListener = function (t, f, o) {
    conta('document', t, -1, o)
    return orig.docRem.call(document, t, f, o)
  }
  return {
    /** Só o que sobrou pendurado, com nome e quantidade. */
    vazados: () => [...saldo].filter(([, n]) => n > 0).map(([k, n]) => `${k} x${n}`),
    parar: () => {
      window.addEventListener = orig.winAdd
      window.removeEventListener = orig.winRem
      document.addEventListener = orig.docAdd
      document.removeEventListener = orig.docRem
    },
  }
}

beforeEach(() => {
  window.__ROS_E2E__ = undefined
  motorFalso.mockClear()
  // O aviso do Vue imprime o host inteiro; aqui ele é guardado e conferido.
  avisosDoVue = []
  const avisar = console.warn
  vi.spyOn(console, 'warn').mockImplementation((...args) => {
    if (String(args[0]).includes('[Vue warn]')) avisosDoVue.push(String(args[0]))
    else avisar(...args)
  })
  // O laço do jogo roda no requestAnimationFrame e desenha com o motor. Aqui o
  // quadro não anda sozinho: o que se testa é a fiação, e o motor é um dublê.
  vi.stubGlobal('requestAnimationFrame', () => 0)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  // O minimapa e a mira desenham em canvas 2D, que o jsdom não tem. Este
  // contexto aceita qualquer chamada e não desenha nada.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx2d())
  // O minimapa pinta pixel a pixel num ImageData, que o jsdom também não tem.
  vi.stubGlobal(
    'ImageData',
    class {
      constructor(largura, altura) {
        this.width = largura
        this.height = altura
        this.data = new Uint8ClampedArray(largura * altura * 4)
      }
    },
  )
})
afterEach(() => {
  desmontar()
  host = null
  delete window.__ROS_E2E__
  delete window.__roquecraft
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('RoqueCraft pelo jogo-sdk: o contrato', () => {
  it('é um jogo do SDK, com o id do catálogo, e pede a sala ao vivo e o progresso', () => {
    expect(jogo.id).toBe('roquecraft')
    expect(manifesto.id).toBe('roquecraft')
    expect(jogo.versaoDoContrato).toBe(VERSAO_DO_CONTRATO)
    expect(jogo.capacidades).toEqual(['salaAoVivo', 'progresso'])
    expect(manifesto.capacidades).toEqual(jogo.capacidades)
    expect(manifesto.aceitaConvite).toBe(true)
  })

  it('host sem sala ao vivo ou sem progresso é recusado na montagem, com o que falta', () => {
    expect(() => jogo.mount(palco(), novoHost({ salaAoVivo: false }))).toThrow(/salaAoVivo/)
    expect(() => jogo.mount(palco(), novoHost({ progresso: false }))).toThrow(/progresso/)
  })

  it('fala o idioma do host, e troca quando o host troca', async () => {
    await montarCom(novoHost({ idioma: 'en-US' }))
    await bootou()
    expect($('.rc-start__tag').textContent).toBe(enUS.menu.tagline)
    host.disparar('idioma', 'pt-BR')
    await vi.waitFor(() => expect($('.rc-start__tag').textContent).toBe(ptBR.menu.tagline))
  })

  it('em árabe a tela vira da direita para a esquerda', async () => {
    await montarCom(novoHost({ idioma: 'ar-AR' }))
    expect($('.ros-roquecraft').getAttribute('dir')).toBe('rtl')
  })

  it('o jogo não guarda nada no armazenamento do aparelho nem manda evento de métrica', async () => {
    // Não tinha no RoqueOS (`bestKey: null` e nenhum `trackFeature`): o mundo é
    // o save da conta. Chave nova ou evento novo passa a ser decisão nova.
    await montarCom(novoHost({ uid: 'u1', nome: 'Ana' }))
    await bootou()
    desmontar()
    await vi.waitFor(() => expect(pedidos('progresso', 'salvar').length).toBe(1))
    expect(host.chamadas.filter((c) => c.capacidade === 'armazenamento')).toEqual([])
    expect(host.chamadas.filter((c) => c.capacidade === 'metricas')).toEqual([])
    expect(host.chamadas.filter((c) => c.capacidade === 'placar')).toEqual([])
  })
})

describe('o jogo abre', () => {
  it('Do front: monta sem estourar, que é o que nenhum teste provava', async () => {
    await montarCom(novoHost())
    await bootou()
    expect($('.ros-roquecraft'), 'a raiz do jogo não chegou ao DOM').toBeTruthy()
    expect($('.ros-roquecraft__error'), $('.ros-roquecraft__error')?.textContent).toBeNull()
  })

  it('Do front: desmontar não estoura e não deixa o motor vivo', async () => {
    await montarCom(novoHost())
    await bootou()
    desmontar()
    await nextTick()
    // O engine falso conta as chamadas de `dispose`: um motor que sobrevive ao
    // fechamento é contexto WebGL vazado, e são poucos por aba.
    expect(motorFalso.mock.calls.length, 'o motor não foi descartado ao fechar').toBeGreaterThan(0)
  })

  it('Do front: um ciclo de abrir e fechar não deixa NENHUM listener pendurado', async () => {
    const espiao = espiaoDeListeners()
    try {
      await montarCom(novoHost())
      await bootou()
      desmontar()
      await nextTick()
    } finally {
      espiao.parar()
    }
    expect(espiao.vazados(), 'listener pendurado depois de fechar o jogo').toEqual([])
  })

  it('Do front: abrir e fechar trinta vezes não acumula nada', async () => {
    // O critério de lifecycle do plano: 30 ciclos sem crescimento persistente.
    // Um listener que sobra por ciclo vira trinta laços rodando sobre jogos
    // mortos — e o trigésimo escreve num mundo que foi descartado.
    const espiao = espiaoDeListeners()
    try {
      for (let i = 0; i < 30; i++) {
        await montarCom(novoHost())
        await bootou()
        desmontar()
        await nextTick()
      }
    } finally {
      espiao.parar()
    }
    expect(espiao.vazados(), 'listener acumulado em 30 ciclos').toEqual([])
  }, 60000)

  it('Do front: sem conta, o jogo começa mundo novo e NÃO grava nada sozinho', async () => {
    // Sem conta não há gravação: o jogador anônimo não escreve num documento que
    // ninguém lê de volta. É a primeira das quatro portas da persistência. No
    // RoqueOS era "sem uid"; agora é o host dizendo que não há onde guardar.
    await montarCom(novoHost())
    await bootou()
    desmontar()
    await nextTick()
    expect(pedidos('progresso', 'carregar')).toEqual([])
    expect(pedidos('progresso', 'salvar')).toEqual([])
    expect(host.progressoGuardado()).toBe(null)
  })

  it('Do front: falha ao LER o save não derruba o jogo e não grava por cima (RC-02)', async () => {
    // `cargaDoSave.spec.js` prova a política; aqui se prova que o componente
    // continua de pé quando ela dispara — o jogo abre, e não grava por cima.
    const meses = buildSavePayload({ seed: 4242, edits: [0, 0, 5, 21] })
    await montarCom(
      novoHost({ uid: 'u1', nome: 'Ana', progresso: { salvo: meses, falharLeitura: true } }),
    )
    await bootou()
    expect($('.ros-roquecraft')).toBeTruthy()
    desmontar()
    await nextTick()
    expect(pedidos('progresso', 'salvar')).toEqual([])
    expect(host.progressoGuardado()).toEqual(meses)
  })
})

describe('o Vue não reclama da fiação', () => {
  // ⚠️ ACHADO PRÉ-EXISTENTE, só relatado: `RCTelas` declara a prop `fogo` como
  // objeto e recebe um número (`fracaoDeFogo`, de `useRoqueCraftPaineis`). É só
  // aviso de desenvolvimento (o Vue não reclama em produção) e veio igual do
  // front. Qualquer OUTRO aviso reprova.
  const CONHECIDO = /Invalid prop: type check failed for prop "fogo"/
  it('montar, bootar e fechar não levanta aviso do Vue além do conhecido', async () => {
    await montarCom(novoHost())
    await bootou()
    desmontar()
    expect(avisosDoVue.filter((a) => !CONHECIDO.test(a))).toEqual([])
  })
})

describe('o save na conta, pelo host', () => {
  it('a leitura que falhou avisa o jogador com um aviso FIXO (não some sozinho)', async () => {
    await montarCom(novoHost({ uid: 'u1', nome: 'Ana', progresso: { falharLeitura: true } }))
    await bootou()
    const avisos = pedidos('avisar', 'avisar').map((c) => c.args)
    expect(avisos).toEqual([[ptBR.error.saveIndisponivel, { tipo: 'erro', fixo: true }]])
  })

  it('com conta, abre o mundo salvo e, ao fechar, pede ao host para SUBSTITUIR o documento', async () => {
    const salvo = { ...buildSavePayload({ seed: 4242, mode: 'creative' }), campoVelho: 'lixo' }
    await montarCom(novoHost({ uid: 'u1', nome: 'Ana', progresso: { salvo } }))
    await bootou()
    expect(pedidos('progresso', 'carregar')).toHaveLength(1)
    desmontar()
    await vi.waitFor(() => expect(pedidos('progresso', 'salvar')).toHaveLength(1))
    const [dados, opcoes] = pedidos('progresso', 'salvar')[0].args
    // Sem `mesclar`: é o `setDoc` sem merge de antes.
    expect(opcoes?.mesclar ?? false).toBe(false)
    expect(dados.seed).toBe(4242)
    expect(dados.mode).toBe('creative')
    expect(dados.version).toBeGreaterThanOrEqual(12)
  })

  // ⚠️ ACHADO PRÉ-EXISTENTE, MAIOR QUE O DO PORTAL, NÃO CONSERTADO (o founder
  // decide o formato): o INVENTÁRIO vai para o save como lista de listas
  // (`serializeInventory`: `[[slot, item, quantidade], …]`), e o Firestore não
  // aceita array dentro de array. Medido em 26/09/2026 com o `firebase` 12.7.0
  // do front, sem rede: `setDoc` com `inventory: [[0, 'wooden_pickaxe', 1]]`
  // lança "Nested arrays are not supported". Pela leitura do código, todo save
  // com UM item no inventário falha no RoqueOS (vai para o `aoFalhar`, só
  // console), e o host falso recusa igual. O mesmo vale para a mobília com
  // itens (`s: [[item, n]]`). Quando o formato for consertado, este teste passa
  // a passar e a marca `fails` sai junto.
  it.fails('com conta, ao fechar, o mundo CHEGA à conta, substituindo o documento', async () => {
    const salvo = { ...buildSavePayload({ seed: 4242, mode: 'creative' }), campoVelho: 'lixo' }
    await montarCom(novoHost({ uid: 'u1', nome: 'Ana', progresso: { salvo } }))
    await bootou()
    desmontar()
    await vi.waitFor(() => expect(pedidos('progresso', 'salvar')).toHaveLength(1))
    expect(host.avisosDoHost).toEqual([])
    expect(host.progressoGuardado().campoVelho).toBeUndefined()
    expect(host.progressoGuardado().seed).toBe(4242)
  })
})

describe('o teclado e a janela ativa', () => {
  // Modo E2E sem o menu: o jogo entra direto no mundo, que é onde ele pede o
  // teclado. O autosave fica fechado em E2E, e isso aqui não importa.
  const noJogo = () => {
    window.__ROS_E2E__ = {}
  }

  it('dentro do jogo pede o teclado ao host; perdendo o foco, devolve; fechando, devolve', async () => {
    noJogo()
    await montarCom(novoHost())
    await bootou()
    await vi.waitFor(() => expect(host.contar('teclado', 'reivindicar')).toBeGreaterThan(0))
    expect(window.__roquecraft.tecladoEhDoJogo()).toBe(true)
    const antes = host.contar('teclado', 'liberar')
    montagem.ativar(false)
    await nextTick()
    expect(host.contar('teclado', 'liberar')).toBe(antes + 1)
    expect(window.__roquecraft.tecladoEhDoJogo()).toBe(false)
    desmontar()
    expect(host.contar('teclado', 'liberar')).toBeGreaterThan(antes + 1)
  })

  it('só a janela ativa ouve o teclado', async () => {
    noJogo()
    await montarCom(novoHost(), { ativo: false })
    await bootou()
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', key: 'e' }))
    await nextTick()
    expect($('.rc-inv'), 'a janela de trás abriu o inventário').toBeNull()
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE', key: 'e' }))

    montagem.ativar(true)
    await nextTick()
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', key: 'e' }))
    await nextTick()
    expect($('.rc-inv'), 'a janela ativa não abriu o inventário').toBeTruthy()
  })

  it('o aviso do jogo chega ao host.avisar, com o tipo do contrato', async () => {
    noJogo()
    await montarCom(novoHost())
    await bootou()
    const antes = pedidos('avisar', 'avisar').length
    // F na sobrevivência não voa: o jogo avisa que o voo é do criativo.
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', key: 'f' }))
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF', key: 'f' }))
    const novos = pedidos('avisar', 'avisar')
      .slice(antes)
      .map((c) => c.args)
    expect(novos).toEqual([[ptBR.flyCreativeOnly, { tipo: 'info' }]])
  })
})

describe('o perfil leve do host', () => {
  // A qualidade detectada entra no jogo pelo `detectQuality({ leve })`; antes era
  // o atributo `data-low-end` do `<html>` do RoqueOS. O que conta é a qualidade
  // com que o motor nasce: os `settings` que a cena recebe.
  const qualidade = async (opcoes) => {
    vi.mocked(criarCena).mockClear()
    await montarCom(novoHost(opcoes))
    await bootou()
    expect(criarCena).toHaveBeenCalledTimes(1)
    return criarCena.mock.calls[0][0].settings.quality
  }

  it('com o modo leve, o jogo começa na qualidade baixa', async () => {
    expect(await qualidade({ modoLeve: true })).toBe('low')
  })

  it('sem ele, o mesmo aparelho começa acima da baixa', async () => {
    expect(await qualidade({ modoLeve: false })).not.toBe('low')
  })
})

describe('o aldeão pela ia do host', () => {
  // Achar um aldeão de verdade em jsdom pede vila perto do nascimento e o laço de
  // quadros rodando; o que este caso prova é a FIAÇÃO: a `ia` que o host deu é a
  // que chega à fala do aldeão. A fala em si tem o `falaDoRoqueOS.spec.js`.
  it('a fala do aldeão nasce da ia deste host, e pede a ele', async () => {
    vi.mocked(criarFalaDoRoqueOS).mockClear()
    await montarCom(novoHost({ ia: async () => 'Ferro bom pede carvão bom.', iaDisponivel: true }))
    expect(criarFalaDoRoqueOS).toHaveBeenCalledTimes(1)
    const falar = criarFalaDoRoqueOS.mock.results[0].value
    expect(falar, 'o aldeão ficou sem a ia do host').toBeTypeOf('function')
    expect(falar.pronto()).toBe(true)
    const retrato = { nome: 'Benedito', oficio: 'ferreiro', humor: 'cordial' }
    expect(await falar(retrato, 'e o ferro?')).toBe('Ferro bom pede carvão bom.')
    expect(pedidos('ia', 'completar')).toHaveLength(1)
  })
})

describe('a sala pelo host', () => {
  it('sem conta, o lobby mostra o aviso de conta depois que o host recusa a sala', async () => {
    await montarCom(novoHost())
    await bootou()
    $('[data-test="rc-friends"]').click()
    // O botão "com amigos" abre o lobby; criar a sala é recusado pelo host.
    await vi.waitFor(() => expect($('.rc-lobby')).toBeTruthy())
    $('.rc-lobby__action').click()
    await vi.waitFor(() => expect($('.rc-lobby__hint--big')).toBeTruthy())
    expect($('.rc-lobby__hint--big').textContent.trim()).toBe(ptBR.mp.needAccount)
    expect(pedidos('salaAoVivo', 'criar')).toHaveLength(1)
  })

  it('o convite com que a janela abriu entra na sala sozinho, e o jogador aparece nela', async () => {
    const h = novoHost({ uid: 'z', nome: 'Zé', convite: 'SALA7' })
    h.disparar('salaAoVivo', {
      acao: 'criar',
      codigo: 'SALA7',
      uid: 'a',
      nome: 'Ana',
      meta: { seed: 77, mode: 'survival' },
    })
    await montarCom(h)
    await bootou()
    await vi.waitFor(() => expect(host.arvoreDaSala('SALA7').players?.z).toBeTruthy(), {
      timeout: 12000,
    })
    expect(host.arvoreDaSala('SALA7').players.z.name).toBe('Zé')
    expect(pedidos('salaAoVivo', 'entrar')[0].args[0]).toBe('SALA7')
  })
})
