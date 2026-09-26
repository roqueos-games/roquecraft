import { BIOME_NAMES } from '../../src/servicos/worldgen.js'
import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import {
  useRoqueCraftPainel,
  JANELA_DO_FPS,
  PASSO_DO_PAINEL,
  DESBOTE_DO_FLASH,
} from '../../src/composables/useRoqueCraftPainel.js'

// ⚠️ A CADENCIA E O ASSUNTO DESTE ARQUIVO, e ela nunca teve teste.
//
// O painel morava dentro de `frame`, no meio do laco de render. Escrever
// posicao, relogio, bioma e contagem de chunk em ref reativo a SESSENTA quadros
// por segundo poe o Vue pra trabalhar sessenta vezes por segundo pra desenhar
// um numero que muda devagar - e num jogo o orcamento de quadro e do render.
//
// Um teste que so olhasse os valores finais passaria com as duas cadencias
// erradas. O que se afirma aqui e QUANDO cada coisa e escrita.

function montar(over = {}) {
  let world = over.world ?? {
    loadedCount: 42,
    biomeAt: () => 3,
  }
  const p = { x: 1.7, y: 64, z: -2.3 }
  const flashDeDano = ref(0)
  const biomasLidos = []
  const ouvintes = []
  const painel = useRoqueCraftPainel({
    mundo: () => world,
    corpo: {
      pos: p,
      yaw: () => over.yaw ?? 0,
      pitch: () => over.pitch ?? 0,
      alturaDoOlho: 1.62,
      flashDeDano,
    },
    instante: () => over.ticks ?? 6000,
    relogio: () => '12:00',
    ehNoite: () => !!over.noite,
    rotuloDoBioma: (chave) => `rotulo:${chave}`,
    aoLerBioma: (b) => biomasLidos.push(b),
    ouvinte: (pos, dir) => ouvintes.push([pos, dir]),
  })
  return { painel, p, flashDeDano, biomasLidos, ouvintes, trocarMundo: (w) => (world = w) }
}

describe('useRoqueCraftPainel', () => {
  it('o contador de quadros só escreve na janela dele', () => {
    const { painel } = montar()
    for (let i = 0; i < 10; i++) painel.contarQuadro(1 / 60)
    expect(painel.fps.value, 'escreveu o fps antes de fechar a janela').toBe(0)
    for (let i = 0; i < 25; i++) painel.contarQuadro(1 / 60)
    expect(painel.fps.value).toBe(60)
  })

  it('o fps é a média da janela, não o inverso do último quadro', () => {
    // Um quadro solto de 100 ms no meio de uma corrida de 60 fps não pode
    // derrubar o número pra 10: o painel vira um medidor de soluço.
    const { painel } = montar()
    painel.contarQuadro(0.1)
    for (let i = 0; i < 25; i++) painel.contarQuadro(1 / 60)
    expect(painel.fps.value).toBeGreaterThan(30)
    expect(painel.fps.value).toBeLessThan(60)
  })

  it('o painel NÃO escreve a cada quadro', () => {
    const { painel, p } = montar()
    p.x = 999
    // Um quadro de 60 fps está muito abaixo do passo do painel.
    expect(painel.atualizarPainel(1 / 60), 'escreveu o painel a 60 Hz').toBe(false)
    expect(painel.posicao.x, 'a posição vazou fora da cadência').toBe(0)
    expect(painel.horario.value).toBe('06:00')
  })

  it('passado o passo, ele escreve tudo de uma vez', () => {
    const { painel, p, biomasLidos, ouvintes } = montar()
    p.x = 10.5
    p.y = 70
    p.z = -3.25
    expect(painel.atualizarPainel(PASSO_DO_PAINEL + 0.01)).toBe(true)
    expect(painel.posicao).toMatchObject({ x: 10.5, y: 70, z: -3.25 })
    expect(painel.horario.value).toBe('12:00')
    expect(painel.chunksCarregados.value).toBe(42)
    // Bioma 3 é o que `BIOME_NAMES[3]` chama, pela chave i18n `biomes.<nome>`.
    expect(painel.bioma.value).toBe(`rotulo:biomes.${BIOME_NAMES[3]}`)
    expect(biomasLidos).toEqual([3])
    expect(ouvintes.length).toBe(1)
  })

  it('fora do overworld o "bioma" é a dimensão: no Fim não se lê "Oceano"', () => {
    const { painel } = montar({ world: { loadedCount: 1, biomeAt: () => 0, dimensao: 'end' } })
    painel.atualizarPainel(PASSO_DO_PAINEL + 0.01)
    expect(painel.bioma.value).toBe('rotulo:dimensao.end')
  })

  it('o acumulador ZERA: dois passos não viram três atualizações', () => {
    const { painel, biomasLidos } = montar()
    painel.atualizarPainel(PASSO_DO_PAINEL + 0.01)
    painel.atualizarPainel(1 / 60)
    painel.atualizarPainel(1 / 60)
    expect(biomasLidos.length, 'o acumulador não zerou e o painel disparou de novo').toBe(1)
    painel.atualizarPainel(PASSO_DO_PAINEL)
    expect(biomasLidos.length).toBe(2)
  })

  it('bioma negativo (fora do mundo carregado) vira rótulo vazio', () => {
    const { painel } = montar({ world: { loadedCount: 0, biomeAt: () => -1 } })
    painel.atualizarPainel(PASSO_DO_PAINEL + 0.01)
    expect(painel.bioma.value, 'inventou nome de bioma pra célula sem bioma').toBe('')
  })

  // ⚠️ `bioma.value = b >= 0 ? rotulo : ''` sobrevivia a `>`, e o bioma ZERO é
  // um bioma de verdade -- o primeiro da tabela. Com `>`, quem estivesse nele
  // veria o campo do painel em branco, como se estivesse fora do mundo
  // carregado. O teste que existia usava -1, que reprova nos dois lados.
  it('o bioma de índice ZERO tem nome, não é "fora do mundo"', () => {
    const { painel } = montar({ world: { loadedCount: 1, biomeAt: () => 0 } })
    painel.atualizarPainel(PASSO_DO_PAINEL + 0.01)
    expect(painel.bioma.value).not.toBe('')
    expect(typeof painel.bioma.value).toBe('string')
  })

  // ⚠️ `if (acumuladoDoPainel <= PASSO_DO_PAINEL) return false` sobrevivia a
  // `<`: no valor EXATO do passo o painel escreveria, e a cadência de 4 Hz
  // viraria 4 Hz mais um quadro a cada volta. O teste acima soma
  // `PASSO + 0.01`, que passa nas duas versões.
  it('o passo EXATO ainda não dispara; um fio a mais dispara', () => {
    const { painel, biomasLidos } = montar()
    painel.atualizarPainel(PASSO_DO_PAINEL)
    expect(biomasLidos.length).toBe(0)
    painel.atualizarPainel(Number.EPSILON * 8)
    expect(biomasLidos.length).toBe(1)
  })

  // ⚠️ `if (corpo.flashDeDano.value > 0)` sobrevivia a `>=`: com o flash já em
  // zero, a conta rodaria à toa e escreveria zero num ref reativo quatro vezes
  // por segundo, para sempre -- o Vue acorda a cada escrita, mesmo com o mesmo
  // valor não sendo mudança, e o painel é justamente o que não pode custar.
  it('flash em zero não é reescrito', () => {
    const { painel, flashDeDano } = montar()
    let escritas = 0
    const cru = flashDeDano
    Object.defineProperty(cru, 'value', {
      configurable: true,
      get: () => 0,
      set: () => {
        escritas++
      },
    })
    painel.atualizarPainel(PASSO_DO_PAINEL + 0.01)
    expect(escritas).toBe(0)
  })

  it('sem mundo, o painel não escreve e não explode', () => {
    // Entre destruir e recriar o mundo existe um intervalo real, e o laço de
    // render continua rodando nele.
    const { painel, trocarMundo } = montar()
    trocarMundo(null)
    expect(() => painel.atualizarPainel(1)).not.toThrow()
    expect(painel.atualizarPainel(1)).toBe(false)
    expect(painel.chunksCarregados.value).toBe(0)
  })

  it('o flash de dano desbota NA CADÊNCIA do painel, não por quadro', () => {
    const { painel, flashDeDano } = montar()
    flashDeDano.value = 1
    painel.atualizarPainel(1 / 60)
    expect(flashDeDano.value, 'desbotou fora da cadência').toBe(1)
    painel.atualizarPainel(PASSO_DO_PAINEL + 0.01)
    expect(flashDeDano.value).toBeCloseTo(1 - DESBOTE_DO_FLASH, 6)
  })

  it('o flash não passa de zero', () => {
    const { painel, flashDeDano } = montar()
    flashDeDano.value = DESBOTE_DO_FLASH / 2
    painel.atualizarPainel(PASSO_DO_PAINEL + 0.01)
    expect(flashDeDano.value, 'o flash foi pra opacidade negativa').toBe(0)
  })

  it('o ouvinte aponta pra onde a cabeça olha', () => {
    // Sem isto, som posicionado toca centralizado, como se estivesse dentro da
    // cabeça. A direção é a MESMA convenção do resto do jogo: yaw 0 olha pro -Z.
    const { painel, ouvintes } = montar({ yaw: 0, pitch: 0 })
    painel.atualizarPainel(PASSO_DO_PAINEL + 0.01)
    const [pos, dir] = ouvintes[0]
    expect(pos.y).toBeCloseTo(64 + 1.62, 6)
    expect(dir.x).toBeCloseTo(0, 6)
    expect(dir.z).toBeCloseTo(-1, 6)

    const leste = montar({ yaw: Math.PI / 2 })
    leste.painel.atualizarPainel(PASSO_DO_PAINEL + 0.01)
    expect(leste.ouvintes[0][1].x).toBeCloseTo(1, 6)
  })

  it('as duas cadências são independentes', () => {
    // Uma so faria o fps atualizar a 4 Hz (lento demais pra ler soluço) ou o
    // painel a 2 Hz (ref reativo caro por nada).
    expect(JANELA_DO_FPS).not.toBe(PASSO_DO_PAINEL)
    const { painel, biomasLidos } = montar()
    for (let i = 0; i < 31; i++) painel.contarQuadro(1 / 60)
    expect(painel.fps.value).toBeGreaterThan(0)
    expect(biomasLidos, 'contar quadro mexeu no painel').toEqual([])
  })
})
