import { describe, it, expect } from 'vitest'
import { criarQaDeMira } from '../../src/servicos/qaDeMira.js'

// ⚠️ O RISCO QUE A EXTRAÇÃO CRIOU É O MESMO DE `qaDeCena`: `engine` e `world`
// eram closures no componente, e viraram parâmetros. A forma errada (receber
// o valor) só quebra quando o motor é RECRIADO — troca de qualidade ou mundo
// novo — e o sintoma é uma sonda medindo o contorno de uma cena que já saiu
// da tela. Os testes abaixo travam o getter e o caminho do nulo.

function motorFalso(nome, comHighlight = true) {
  const filho = {
    material: { depthTest: true, color: { setHex() {} }, needsUpdate: false },
    frustumCulled: true,
    geometry: { attributes: { position: { count: 24 } } },
  }
  return {
    nome,
    highlight: comHighlight
      ? {
          visible: true,
          children: [filho],
          position: { x: 1, y: 2, z: 3 },
          scale: {
            valor: 1,
            setScalar(v) {
              this.valor = v
            },
          },
        }
      : null,
    destaque: { idAtual: nome, formasEmCache: 2, caixaDaMalha: [0, 0, 0, 1, 1, 1] },
  }
}

const mundoFalso = (id = 0) => ({ getBlock: () => id })

describe('qaDeMira', () => {
  it('segue o motor VIVO quando ele é recriado', () => {
    let engine = motorFalso('primeiro')
    const qa = criarQaDeMira({
      engine: () => engine,
      world: () => mundoFalso(),
      currentTarget: () => ({ hit: { x: 0, y: 0, z: 0 } }),
    })
    expect(qa.destaqueInfo().forma).toBe('primeiro')
    engine = motorFalso('segundo')
    expect(qa.destaqueInfo().forma, 'a mira ficou presa no motor morto').toBe('segundo')
  })

  it('não explode sem motor, sem contorno, ou sem alvo', () => {
    const semMotor = criarQaDeMira({
      engine: () => null,
      world: () => mundoFalso(),
      currentTarget: () => null,
    })
    expect(semMotor.destaqueDebug({ escala: 3 })).toBe(false)
    expect(semMotor.destaqueInfo().existe).toBe(false)
    expect(semMotor.blocoMirado()).toBe(null)

    // Entre destruir e recriar o motor existe um intervalo em que `highlight`
    // ainda não foi montado. Uma sonda que perguntar ali não pode derrubar o jogo.
    const semContorno = criarQaDeMira({
      engine: () => motorFalso('m', false),
      world: () => mundoFalso(),
      currentTarget: () => null,
    })
    expect(semContorno.destaqueDebug()).toBe(false)
    const info = semContorno.destaqueInfo()
    expect(info.existe).toBe(false)
    expect(info.alvo).toBe(null)
    expect(info.caixas).toBe(null)
  })

  it('destaqueDebug escreve mesmo no material da cena', () => {
    const engine = motorFalso('m')
    const qa = criarQaDeMira({
      engine: () => engine,
      world: () => mundoFalso(),
      currentTarget: () => null,
    })
    expect(qa.destaqueDebug({ escala: 4, depthTest: false })).toBe(true)
    expect(engine.highlight.scale.valor).toBe(4)
    const c = engine.highlight.children[0]
    expect(c.material.depthTest).toBe(false)
    expect(c.material.needsUpdate).toBe(true)
    // CONTROLE: sem `frustumCulled = false` o contorno some do quadro quando
    // a caixa dele cai fora do frustum, e a foto de QA volta sem contorno sem
    // que nada tenha desligado.
    expect(c.frustumCulled).toBe(false)
  })

  it('destaqueInfo devolve o alvo do raycast VIVO, não um congelado', () => {
    let alvo = { hit: { x: 1, y: 2, z: 3 } }
    const qa = criarQaDeMira({
      engine: () => motorFalso('m'),
      world: () => mundoFalso(),
      currentTarget: () => alvo,
    })
    expect(qa.destaqueInfo().alvo).toEqual([1, 2, 3])
    alvo = { hit: { x: 9, y: 8, z: 7 } }
    expect(qa.destaqueInfo().alvo, 'o alvo ficou congelado na criação').toEqual([9, 8, 7])
    expect(qa.destaqueInfo().vertices).toEqual([24])
  })
})

// ⚠️ UMA SONDA DE QA NÃO PODE LAVAR ESTADO RUIM. `?? PADRAO` só troca AUSÊNCIA
// pelo padrão; com `||`, todo valor falsy-porém-PRESENTE (`0`, `''`) vira o
// padrão, e a sonda relata "não existe" onde existe algo quebrado.
describe('qaDeMira — a sonda distingue "vazio" de "não existe"', () => {
  const comFilho = (geometry) => ({
    highlight: {
      visible: true,
      children: [{ material: { color: { setHex() {} } }, geometry }],
      position: { x: 0, y: 0, z: 0 },
      scale: { setScalar() {} },
    },
    destaque: { idAtual: 'cubo', formasEmCache: 0, caixaDaMalha: null },
  })

  it('malha de contorno com ZERO vértices é 0, não -1', () => {
    // ⚠️ Este é o estado que a sonda existe pra pegar: um contorno que EXISTE
    // mas está vazio. `?.count ?? -1` com `||` o relata como -1, que é o
    // código de "não tem geometria" — e o QA conclui que o contorno nem foi
    // criado, mandando consertar a metade errada do problema.
    const engine = comFilho({ attributes: { position: { count: 0 } } })
    const qa = criarQaDeMira({
      engine: () => engine,
      world: () => mundoFalso(),
      currentTarget: () => ({ hit: { x: 0, y: 0, z: 0 } }),
    })
    expect(qa.destaqueInfo().vertices).toEqual([0])
  })

  it('filho SEM geometria nenhuma é -1', () => {
    const engine = comFilho(undefined)
    const qa = criarQaDeMira({
      engine: () => engine,
      world: () => mundoFalso(),
      currentTarget: () => ({ hit: { x: 0, y: 0, z: 0 } }),
    })
    expect(qa.destaqueInfo().vertices).toEqual([-1])
  })

  it('cache vazio é 0, e caixa ausente é null', () => {
    const engine = comFilho({ attributes: { position: { count: 24 } } })
    const qa = criarQaDeMira({
      engine: () => engine,
      world: () => mundoFalso(),
      currentTarget: () => ({ hit: { x: 0, y: 0, z: 0 } }),
    })
    const info = qa.destaqueInfo()
    expect(info.formasEmCache).toBe(0)
    expect(info.caixaDaMalha).toBeNull()
    expect(info.filhos).toBe(1)
  })

  it('sem contorno nenhum, a conta é ZERO — não um', () => {
    // Os padrões `?? 0` são o que faz a sonda dizer "não há nada aqui". Virando
    // 1, ela relata UM filho e UMA forma em cache num motor que não tem
    // contorno nenhum: o QA passa a acreditar que o contorno existe e vai
    // procurar o defeito na cor, na escala, no material — em tudo menos na
    // ausência.
    const qa = criarQaDeMira({
      engine: () => ({ highlight: null }),
      world: () => mundoFalso(),
      currentTarget: () => null,
    })
    const info = qa.destaqueInfo()
    expect(info.existe).toBe(false)
    expect(info.filhos).toBe(0)
    expect(info.formasEmCache).toBe(0)
    expect(info.vertices).toEqual([])
  })

  it('sem motor nenhum, também é zero', () => {
    const qa = criarQaDeMira({
      engine: () => null,
      world: () => mundoFalso(),
      currentTarget: () => null,
    })
    const info = qa.destaqueInfo()
    expect(info.filhos).toBe(0)
    expect(info.formasEmCache).toBe(0)
    expect(info.forma).toBeNull()
  })

  it('mexer no contorno só escreve o que foi PEDIDO', () => {
    // `depthTest !== null` e `cor !== null` invertidos trocam a regra: o que
    // não foi pedido é escrito e o que foi pedido é ignorado. A sonda existe
    // pra isolar a causa de um contorno invisível — invertida, ela passa a
    // MUDAR a cena que deveria só observar.
    const filho = {
      material: { depthTest: true, color: { setHex() {} }, needsUpdate: false },
      frustumCulled: true,
      geometry: { attributes: { position: { count: 24 } } },
    }
    const engine = {
      highlight: {
        visible: true,
        children: [filho],
        position: { x: 0, y: 0, z: 0 },
        scale: { setScalar() {} },
      },
      destaque: { idAtual: 'cubo', formasEmCache: 0, caixaDaMalha: null },
    }
    const qa = criarQaDeMira({
      engine: () => engine,
      world: () => mundoFalso(),
      currentTarget: () => null,
    })

    expect(qa.destaqueDebug({})).toBe(true)
    expect(filho.material.depthTest, 'não foi pedido, não pode mudar').toBe(true)
    // `needsUpdate = true` e `frustumCulled = false` valem SEMPRE: são o que
    // faz a mudança aparecer na tela e o contorno não ser descartado.
    expect(filho.material.needsUpdate).toBe(true)
    expect(filho.frustumCulled).toBe(false)

    expect(qa.destaqueDebug({ depthTest: false })).toBe(true)
    expect(filho.material.depthTest).toBe(false)
  })
})
