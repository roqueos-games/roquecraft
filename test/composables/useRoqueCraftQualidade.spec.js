import { describe, it, expect, vi } from 'vitest'
import { reactive } from 'vue'
import { useRoqueCraftQualidade } from '../../src/composables/useRoqueCraftQualidade.js'

// ⚠️ A TROCA DE QUALIDADE NUNCA TEVE TESTE, e o endereço era a razão: as duas
// funções moravam soltas dentro de `ROSRoqueCraft.vue` mexendo em `engine` e
// `entities`, dois `let` do componente. O que se prova aqui é o que só aparecia
// mexendo no menu de ajustes com o olho no canvas:
//
//  - motor e criaturas ficam NULOS enquanto o novo não existe (é o que segura
//    o laço de quadro; sem isso ele desenha num renderer descartado, e a sonda
//    `console-limpo` contou 9 `Texture is immutable` em 4 trocas)
//  - o mundo VOLTA com as edições (sem o `reset` com o mapa, trocar de
//    qualidade apagava o que foi construído)
//  - a falha avisa, em vez de deixar o jogador sem renderer nenhum

function montar(over = {}) {
  const ajustes = reactive({
    quality: 'high',
    fov: 72,
    renderDistance: 8,
    sound: true,
  })
  const ordem = []
  const camera = { fov: 0, updateProjectionMatrix: vi.fn() }
  let motor = { camera, dispose: vi.fn(() => ordem.push('motor morreu')) }
  let criaturas = { dispose: vi.fn(() => ordem.push('criaturas morreram')) }
  const mundo = {
    reset: vi.fn((...a) => ordem.push(['mundo voltou', ...a])),
    setRenderDistance: vi.fn(),
  }
  const som = { setEnabled: vi.fn() }
  const mapa = new Map([['0,0', 1]])
  const raios = []
  const saves = []
  const falhas = []
  // ⚠️ O DUBLÊ REGISTRA O QUE VIU NO INSTANTE DA CRIAÇÃO. É assim que se prova
  // a nulificação: se motor/criaturas não fossem zerados antes, ele veria os
  // velhos aqui.
  const montarMotor = over.montarMotor
    ? over.montarMotor
    : vi.fn(async () => {
        ordem.push(['motor nascendo', motor, criaturas])
        return { engine: { camera, novo: true }, entities: { novo: true } }
      })

  const q = useRoqueCraftQualidade({
    ajustes,
    motor: [() => motor, (v) => (motor = v)],
    criaturas: [() => criaturas, (v) => (criaturas = v)],
    som: () => som,
    mundo: () => mundo,
    texturas: () => ({ manifest: 'x' }),
    semente: () => 42,
    mapaDeEdicoes: () => mapa,
    tela: () => ({ canvas: 'CANVAS', container: 'RAIZ' }),
    raioDaRede: (r) => raios.push(r),
    agendarSave: () => saves.push(1),
    avisarDaFalha: (e) => falhas.push(e),
    montarMotor,
    ehE2E: () => false,
  })

  return {
    q,
    ajustes,
    ordem,
    mundo,
    som,
    raios,
    saves,
    falhas,
    montarMotor,
    mapa,
    motor: () => motor,
    criaturas: () => criaturas,
  }
}

describe('useRoqueCraftQualidade', () => {
  it('ajuste que NÃO é perfil não recria o motor', async () => {
    const c = montar()
    await c.q.aplicarAjustes({ ...c.ajustes, fov: 90, renderDistance: 6 })
    expect(c.montarMotor, 'recriou o motor por causa de um FOV').not.toHaveBeenCalled()
    expect(c.motor().camera.fov).toBe(90)
    expect(c.motor().camera.updateProjectionMatrix).toHaveBeenCalled()
    expect(c.mundo.setRenderDistance).toHaveBeenCalledWith(6)
    expect(c.raios, 'o raio da rede não pode passar do raio do mundo').toEqual([6])
    expect(c.saves.length, 'o ajuste não foi agendado pro save').toBe(1)
  })

  it('o raio da rede para em 8, mesmo com o mundo mais longe', async () => {
    const c = montar()
    await c.q.aplicarAjustes({ ...c.ajustes, renderDistance: 16 })
    expect(c.raios).toEqual([8])
  })

  // ⚠️ ESTA É A ORDEM QUE SEGURA O LAÇO DE QUADRO.
  it('trocar de perfil mata o motor, zera os dois, e só então cria o novo', async () => {
    const c = montar()
    await c.q.aplicarAjustes({ ...c.ajustes, quality: 'low' })
    expect(c.ordem[0]).toBe('criaturas morreram')
    expect(c.ordem[1]).toBe('motor morreu')
    const [rotulo, motorNoNascimento, criaturasNoNascimento] = c.ordem[2]
    expect(rotulo).toBe('motor nascendo')
    expect(motorNoNascimento, 'o motor velho ainda estava lá: o quadro desenha nele').toBe(null)
    expect(criaturasNoNascimento).toBe(null)
    expect(c.motor().novo, 'o motor novo não entrou').toBe(true)
    expect(c.criaturas().novo).toBe(true)
  })

  it('depois da troca o mundo volta COM as edições, e no raio de agora', async () => {
    const c = montar()
    await c.q.aplicarAjustes({ ...c.ajustes, quality: 'low', renderDistance: 4 })
    expect(c.mundo.reset, 'trocar de qualidade apagou o que foi construído').toHaveBeenCalledWith(
      42,
      c.mapa,
    )
    expect(c.mundo.setRenderDistance).toHaveBeenLastCalledWith(4)
  })

  it('o motor novo nasce pelo MESMO caminho do boot: perfil, tela e texturas de agora', async () => {
    const c = montar()
    await c.q.aplicarAjustes({ ...c.ajustes, quality: 'low' })
    expect(c.montarMotor.mock.calls[0][0]).toEqual({
      settings: c.ajustes,
      canvas: 'CANVAS',
      container: 'RAIZ',
      textures: { manifest: 'x' },
      ehE2E: false,
    })
  })

  // ⚠️ SEM O GUARDADO o jogador fica sem motor nenhum e sem saber por quê.
  it('se a criação falhar, avisa e não derruba o resto do ajuste', async () => {
    const bomba = new Error('sem WebGL2')
    const c = montar({
      montarMotor: vi.fn(async () => {
        throw bomba
      }),
    })
    await expect(c.q.aplicarAjustes({ ...c.ajustes, quality: 'low' })).resolves.toBeUndefined()
    expect(c.falhas).toEqual([bomba])
    expect(c.saves.length, 'a falha do motor engoliu o agendamento do save').toBe(1)
  })

  it('som desligado chega no áudio, e `false` não vira `true` por descuido', async () => {
    const c = montar()
    await c.q.aplicarAjustes({ ...c.ajustes, sound: false })
    expect(c.som.setEnabled).toHaveBeenLastCalledWith(false)
    await c.q.aplicarAjustes({ ...c.ajustes, sound: true })
    expect(c.som.setEnabled).toHaveBeenLastCalledWith(true)
  })

  // Entre a morte do motor e o nascimento do novo, `aplicarAjustes` pode ser
  // chamado de novo (dois cliques rápidos no menu). Ler `engine.camera` nulo
  // seria um TypeError no meio da troca.
  it('sem motor no ar, aplicar ajuste não quebra', async () => {
    const c = montar({
      montarMotor: vi.fn(async () => {
        throw new Error('nada')
      }),
    })
    await c.q.aplicarAjustes({ ...c.ajustes, quality: 'low' })
    expect(c.motor()).toBe(null)
    await expect(c.q.aplicarAjustes({ ...c.ajustes, fov: 100 })).resolves.toBeUndefined()
  })
})
