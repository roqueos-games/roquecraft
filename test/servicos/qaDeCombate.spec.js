import { describe, it, expect } from 'vitest'
import { criarQaDeCombate } from '../../src/servicos/qaDeCombate.js'

// ⚠️ TODO O ESTADO DE COMBATE É `let` DO COMPONENTE E ANDA A CADA QUADRO.
//
// `attackCooldown`, `recargaAtual` e `ultimoGolpe` mudam sessenta vezes por
// segundo. Capturá-los na criação daria à sonda, pra sempre, o estado do
// instante em que o gancho foi montado - "recarga zero, nenhum golpe" - e o
// teste passaria feliz medindo nada. Por isso os três entram por getter.
//
// `flechas` é reatribuída ao entrar e sair do multiplayer: getter também.

function contexto(over = {}) {
  let restante = 0
  let total = 0.625
  let ultimo = null
  let flechas = []
  const survival = { dead: false }
  const golpes = []
  const danos = []
  const ctx = {
    restante: () => restante,
    total: () => total,
    ultimo: () => ultimo,
    atacar: () => golpes.push(1),
    machucar: (n, fonte) => {
      danos.push([n, fonte])
      if (n >= 20) survival.dead = true
    },
    survival,
    flechas: () => flechas,
    ...over,
  }
  return {
    qa: criarQaDeCombate(ctx),
    survival,
    golpes,
    danos,
    andar: (r, t, u) => {
      restante = r
      total = t
      ultimo = u
    },
    trocarFlechas: (f) => {
      flechas = f
    },
  }
}

describe('qaDeCombate', () => {
  it('hurt leva a FONTE até `machucar`, e armaduraVestida lê o corpo', () => {
    const { qa, danos, survival } = contexto()
    qa.hurt(3, 'mob')
    qa.hurt(2)
    expect(danos).toEqual([
      [3, 'mob'],
      [2, 'generic'],
    ])
    survival.armadura = {
      helmet: null,
      chestplate: { item: 'iron_chestplate', dur: 5 },
      leggings: null,
      boots: null,
    }
    expect(qa.armaduraVestida()).toEqual({
      pecas: { helmet: null, chestplate: 'iron_chestplate', leggings: null, boots: null },
      pontos: 6,
    })
  })

  it('lê a recarga VIVA, não a do instante da criação', () => {
    const { qa, andar } = contexto()
    expect(qa.combateInfo()).toMatchObject({ restante: 0, total: 0.625, ultimo: null })
    andar(0.5, 1, { carga: 0.4, critico: false })
    const agora = qa.combateInfo()
    expect(agora.restante, 'a recarga ficou congelada na criação').toBe(0.5)
    expect(agora.total).toBe(1)
    expect(agora.ultimo).toEqual({ carga: 0.4, critico: false })
  })

  it('a carga sai de `cargaDe`, não de uma conta reinventada aqui', () => {
    const { qa, andar } = contexto()
    // Recarga cheia: carga 0. Recarga zerada: carga 1.
    andar(1, 1, null)
    expect(qa.combateInfo().carga).toBe(0)
    andar(0, 1, null)
    expect(qa.combateInfo().carga).toBe(1)
    andar(0.5, 1, null)
    expect(qa.combateInfo().carga).toBeCloseTo(0.5, 6)
  })

  it('só o que a sonda precisa do último golpe atravessa', () => {
    const { qa, andar } = contexto()
    andar(0, 1, { carga: 1, critico: true, alvo: 'segredo', dano: 7 })
    // CONTROLE: passar o objeto inteiro deixaria a sonda depender de campos
    // internos do resolvedor de golpe, e um refactor lá quebraria o QA aqui.
    expect(qa.combateInfo().ultimo).toEqual({ carga: 1, critico: true })
  })

  it('attack e hurt passam pelo caminho do jogo', () => {
    const { qa, golpes, danos } = contexto()
    qa.attack()
    expect(golpes.length, 'o golpe não chegou no `tryAttack` do jogo').toBe(1)
    qa.hurt(3)
    expect(danos[0]).toEqual([3, 'generic'])
  })

  it('matar aplica dano de verdade e devolve o estado DEPOIS', () => {
    const { qa, danos, survival } = contexto()
    expect(survival.dead).toBe(false)
    expect(qa.matar()).toBe(true)
    expect(danos[0]).toEqual([999, 'generic'])
    // CONTROLE: ler `survival.dead` antes de machucar devolveria `false` e a
    // sonda concluiria que o jogador é imortal.
    expect(survival.dead).toBe(true)
  })

  it('flechasInfo lê a lista VIVA e arredonda pra comparação estável', () => {
    const { qa, trocarFlechas } = contexto()
    expect(qa.flechasInfo()).toEqual([])
    trocarFlechas([
      { id: 'f1', x: 1.23456, y: 2, z: 3, idade: 0.98765 },
      { id: 'f2', x: 0, y: 0, z: 0, idade: 0, forma: 'frasco' },
    ])
    // A FORMA vai junto: a sonda da poção distingue o frasco da flecha por ela.
    expect(qa.flechasInfo(), 'ficou preso na lista da partida morta').toEqual([
      { id: 'f1', x: 1.23, y: 2, z: 3, idade: 0.99, forma: 'flecha' },
      { id: 'f2', x: 0, y: 0, z: 0, idade: 0, forma: 'frasco' },
    ])
  })
})
