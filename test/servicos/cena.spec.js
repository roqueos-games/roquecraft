import { describe, it, expect } from 'vitest'
import {
  criarCena,
  montarMotor,
  somLigado,
  temParticulas,
  VOLUME_INICIAL,
  ETAPAS,
} from '../../src/servicos/cena.js'

// ⚠️ O QUE ESTE ARQUIVO SEGURA.
//
// Quatro decisoes que so existiam dentro do navegador, no meio de vinte e cinco
// linhas de `boot`, e uma delas escrita DUAS VEZES -- a segunda copia na troca
// de qualidade, livre pra divergir da primeira em silencio.
//
// Nenhuma delas quebra o build quando esta errada. Elas quebram a experiencia:
// o jogo abre mudo pra quem jogou antes da opcao de som existir, o celular fraco
// cospe particula ate travar, o print do QA volta em branco, ou o jogador ve o
// campo de visao corrigir sozinho no primeiro segundo.

/** Dublês: registram o que receberam, sem GPU nenhuma. */
function bancada({ profile = { shadows: true } } = {}) {
  const chamadas = { motor: null, entidades: null, audio: null, texturas: 0, progresso: [] }
  const camera = { fov: 0, projecoes: 0, updateProjectionMatrix: () => (camera.projecoes += 1) }
  return {
    chamadas,
    camera,
    fabricas: {
      carregarTexturas: async () => {
        chamadas.texturas += 1
        return { manifest: {}, pack: 'padrao' }
      },
      criarMotor: async (opcoes) => {
        chamadas.motor = opcoes
        return { camera, scene: 'CENA', profile }
      },
      criarAudio: (opcoes) => {
        chamadas.audio = { ...opcoes, ligado: null }
        return { setEnabled: (v) => (chamadas.audio.ligado = v) }
      },
      criarEntidades: (scene, opcoes) => {
        chamadas.entidades = { scene, ...opcoes }
        return 'ENTIDADES'
      },
    },
  }
}

const AJUSTES = { quality: 'high', fov: 82, sound: true }

describe('somLigado: `!== false`, e nao `=== true`', () => {
  it('quem nunca escolheu tem som', () => {
    // Save de versao anterior nao tem o campo. Com `=== true`, todo mundo que
    // jogou antes da opcao existir abriria o jogo mudo -- e mudo parece jogo
    // quebrado, nao jogo configurado.
    expect(somLigado({})).toBe(true)
    expect(somLigado({ sound: undefined })).toBe(true)
    expect(somLigado(undefined)).toBe(true)
  })

  it('quem desligou continua desligado', () => {
    expect(somLigado({ sound: false })).toBe(false)
  })
})

describe('temParticulas: sai no aparelho fraco', () => {
  it('so o perfil low desliga', () => {
    expect(temParticulas({ quality: 'low' })).toBe(false)
    expect(temParticulas({ quality: 'medium' })).toBe(true)
    expect(temParticulas({ quality: 'high' })).toBe(true)
  })
})

describe('criarCena: a ordem e as decisoes da montagem', () => {
  it('o motor nasce COM as texturas, e a barra anda antes de cada etapa', async () => {
    const b = bancada()
    const cena = await criarCena({
      settings: AJUSTES,
      canvas: 'C',
      container: 'R',
      fabricas: b.fabricas,
      aoProgredir: (pct, msg) => b.chamadas.progresso.push([pct, msg]),
    })
    expect(b.chamadas.texturas).toBe(1)
    expect(b.chamadas.motor.textures).toBe(cena.textures)
    expect(b.chamadas.progresso).toEqual([
      [ETAPAS.texturas.pct, ETAPAS.texturas.msg],
      [ETAPAS.motor.pct, ETAPAS.motor.msg],
    ])
    // A barra so anda pra frente: uma etapa com pct menor que a anterior faria
    // a barra voltar na cara de quem espera.
    expect(ETAPAS.motor.pct).toBeGreaterThan(ETAPAS.texturas.pct)
  })

  it('as entidades nascem NA cena do motor, nao numa cena qualquer', async () => {
    const b = bancada()
    await criarCena({ settings: AJUSTES, canvas: 'C', container: 'R', fabricas: b.fabricas })
    expect(b.chamadas.entidades.scene).toBe('CENA')
  })

  it('o audio abre no volume mestre e no estado que o jogador escolheu', async () => {
    const b = bancada()
    await criarCena({
      settings: { ...AJUSTES, sound: false },
      canvas: 'C',
      container: 'R',
      fabricas: b.fabricas,
    })
    // ⚠️ O VALOR, NAO A CONSTANTE. Afirmar `toBe(VOLUME_INICIAL)` compara o
    // codigo com ele mesmo: se alguem trocar a constante para 1.85, o teste
    // continua verde e o jogo abre estourando o alto-falante. A varredura de
    // mutacao pegou exatamente isso aqui.
    expect(VOLUME_INICIAL).toBe(0.85)
    expect(b.chamadas.audio.volume).toBe(0.85)
    expect(b.chamadas.audio.ligado).toBe(false)
  })

  it('o pacote de textura chega ao painel', async () => {
    const b = bancada()
    const cena = await criarCena({
      settings: AJUSTES,
      canvas: 'C',
      container: 'R',
      fabricas: b.fabricas,
    })
    expect(cena.pack).toBe('padrao')
  })

  it('sem pacote, `pack` e null e nao undefined', async () => {
    const b = bancada()
    b.fabricas.carregarTexturas = async () => ({ manifest: {} })
    const cena = await criarCena({
      settings: AJUSTES,
      canvas: 'C',
      container: 'R',
      fabricas: b.fabricas,
    })
    expect(cena.pack).toBe(null)
  })
})

describe('montarMotor: o mesmo caminho no boot e na troca de qualidade', () => {
  it('o FOV do jogador vale no PRIMEIRO quadro', async () => {
    // Aplicado depois, o jogo abre no campo de visao padrao e corrige na frente
    // do jogador.
    const b = bancada()
    await montarMotor({ settings: AJUSTES, canvas: 'C', container: 'R', fabricas: b.fabricas })
    expect(b.camera.fov).toBe(82)
    expect(b.camera.projecoes).toBe(1)
  })

  it('a sombra segue o PERFIL DO MOTOR, nao a preferencia do jogador', async () => {
    // O perfil ja negociou com a GPU de verdade; a preferencia nao pode prometer
    // uma sombra que o aparelho nao desenha.
    const b = bancada({ profile: { shadows: false } })
    await montarMotor({
      settings: { ...AJUSTES, quality: 'high' },
      canvas: 'C',
      container: 'R',
      fabricas: b.fabricas,
    })
    expect(b.chamadas.entidades.shadows).toBe(false)
  })

  it('a particula sai no perfil low', async () => {
    const b = bancada()
    await montarMotor({
      settings: { ...AJUSTES, quality: 'low' },
      canvas: 'C',
      container: 'R',
      fabricas: b.fabricas,
    })
    expect(b.chamadas.entidades.particles).toBe(false)
  })

  it('o buffer so fica preso no E2E: o print volta em branco sem ele', async () => {
    const b = bancada()
    await montarMotor({ settings: AJUSTES, canvas: 'C', container: 'R', fabricas: b.fabricas })
    expect(b.chamadas.motor.preserveDrawingBuffer).toBe(false)

    const c = bancada()
    await montarMotor({
      settings: AJUSTES,
      canvas: 'C',
      container: 'R',
      ehE2E: true,
      fabricas: c.fabricas,
    })
    expect(c.chamadas.motor.preserveDrawingBuffer).toBe(true)
  })

  it('a troca de qualidade monta EXATAMENTE como o boot', async () => {
    // Este teste e o motivo de `montarMotor` existir: enquanto as quatro linhas
    // estavam escritas duas vezes, as duas podiam divergir em silencio.
    const doBoot = bancada({ profile: { shadows: false } })
    const cena = await criarCena({
      settings: { ...AJUSTES, quality: 'low' },
      canvas: 'C',
      container: 'R',
      fabricas: doBoot.fabricas,
    })
    const daTroca = bancada({ profile: { shadows: false } })
    await montarMotor({
      settings: { ...AJUSTES, quality: 'low' },
      canvas: 'C',
      container: 'R',
      textures: cena.textures,
      fabricas: daTroca.fabricas,
    })
    expect(daTroca.chamadas.entidades).toEqual(doBoot.chamadas.entidades)
    expect(daTroca.camera.fov).toBe(doBoot.camera.fov)
    expect(daTroca.chamadas.motor.quality).toBe(doBoot.chamadas.motor.quality)
    expect(daTroca.chamadas.motor.preserveDrawingBuffer).toBe(
      doBoot.chamadas.motor.preserveDrawingBuffer,
    )
  })
})
