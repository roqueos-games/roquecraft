import { describe, it, expect } from 'vitest'
import { criarQaDeCena } from '../../src/servicos/qaDeCena.js'

// ⚠️ ESTE TESTE EXISTE POR CAUSA DE UM RISCO QUE A EXTRAÇÃO CRIOU.
//
// No componente, `engine` e `world` eram variáveis de closure: sempre vivas,
// porque o closure lê o valor ATUAL. Ao virar módulo, a única forma de manter
// isso é receber GETTERS, e a forma errada (receber os valores) compilaria,
// passaria no lint e funcionaria em toda sonda que roda num mundo só.
//
// O sintoma da forma errada só apareceria ao trocar de perfil de qualidade ou
// abrir mundo novo, que é quando o motor é RECRIADO: a superfície de QA
// continuaria falando com o motor MORTO, e a sonda mediria uma cena que não
// está mais na tela. É o tipo de defeito que se descobre depois de um dia
// inteiro medindo a coisa errada.

/** Motor falso com identidade, para saber com qual deles a superfície falou. */
function motorFalso(nome) {
  return {
    nome,
    setFx(o) {
      this.ultimoFx = o
      return nome
    },
    inspect: () => ({ de: nome }),
    inspecionarAgua: () => ({ de: nome }),
    ondularAgua: () => true,
  }
}

function mundoFalso(nome) {
  return {
    nome,
    solidAt: () => 1,
    isLoaded: () => true,
    getBlock: () => 0,
  }
}

describe('qaDeCena', () => {
  it('segue o motor VIVO quando ele é recriado', () => {
    let engine = motorFalso('primeiro')
    let world = mundoFalso('primeiro')
    const qa = criarQaDeCena({
      engine: () => engine,
      world: () => world,
      profundidadeDoOlho: () => 0,
      submerso: () => false,
    })
    expect(qa.inspect().de).toBe('primeiro')

    // Trocar de perfil de qualidade recria o motor. A superfície tem que ir
    // junto, e é exatamente isto que a forma errada não faria.
    engine = motorFalso('segundo')
    world = mundoFalso('segundo')
    expect(qa.inspect().de, 'a superfície ficou presa no motor morto').toBe('segundo')
    expect(qa.aguaVisual().de).toBe('segundo')
  })

  it('não explode com motor ou mundo ausentes', () => {
    const qa = criarQaDeCena({
      engine: () => null,
      world: () => null,
      profundidadeDoOlho: () => 0,
      submerso: () => false,
    })
    // Entre destruir e recriar o mundo existe um intervalo em que os dois são
    // nulos, e uma sonda que perguntar nesse intervalo não pode derrubar o jogo.
    expect(() => qa.setFx({})).not.toThrow()
    expect(() => qa.inspect()).not.toThrow()
    expect(qa.solidoEm(0, 0, 0)).toBe(0)
    expect(qa.carregado(0, 0)).toBe(false)
  })

  it('lê o olho pelo getter, não por um valor congelado', () => {
    let prof = 0
    let submerso = false
    const qa = criarQaDeCena({
      engine: () => motorFalso('m'),
      world: () => mundoFalso('m'),
      profundidadeDoOlho: () => prof,
      submerso: () => submerso,
    })
    expect(qa.aguaVisual().submerso).toBe(false)
    prof = 7
    submerso = true
    const depois = qa.aguaVisual()
    expect(depois.submerso, 'o submerso ficou congelado no valor da criação').toBe(true)
    expect(depois.profundidadeDoOlho).toBe(7)
  })
})

// ⚠️ UMA SONDA DE QA NÃO PODE LAVAR ESTADO RUIM, e não pode inventar cena.
describe('qaDeCena — a coluna d’água e as sobrescritas de sombra', () => {
  const mundoDagua = ({ topo = 60, fundo = 50 } = {}) => ({
    liquidAt: (x, y) => y <= topo && y >= fundo,
    solidAt: (x, y) => (y < fundo ? 1 : 0),
    isLoaded: () => true,
    getBlock: () => 0,
  })

  const qaCom = (over = {}) =>
    criarQaDeCena({
      engine: () => motorFalso('m'),
      world: () => mundoDagua(),
      profundidadeDoOlho: () => 0,
      submerso: () => false,
      ...over,
    })

  it('a varredura vai até a camada ZERO do mundo', () => {
    // `for (let y = WORLD_HEIGHT - 1; y >= 0; y--)` apertado para `> 0` deixa
    // de olhar a camada do piso: um lago que chega ao fundo do mundo passaria a
    // não ser visto pela sonda.
    const qa = qaCom({ world: () => mundoDagua({ topo: 0, fundo: 0 }) })
    expect(qa.profundidadeAgua(0, 0)).toBe(1)
  })

  it('a coluna d’água é medida até 32 blocos, e para no fundo', () => {
    // `d < 32 && liquidAt(...)`: virando `||`, a medição vai até 32 mesmo
    // depois de acabar a água — e todo lago raso vira "32 de profundidade".
    const qa = qaCom({ world: () => mundoDagua({ topo: 60, fundo: 55 }) })
    expect(qa.profundidadeAgua(0, 0)).toBe(6)
  })

  it('bloco sólido antes da água significa que não há água ali', () => {
    const seco = {
      liquidAt: () => false,
      solidAt: (x, y) => (y === 70 ? 1 : 0),
      isLoaded: () => true,
      getBlock: () => 0,
    }
    expect(qaCom({ world: () => seco }).profundidadeAgua(0, 0)).toBe(0)
  })

  it('sem mundo, a profundidade é zero', () => {
    expect(qaCom({ world: () => null }).profundidadeAgua(0, 0)).toBe(0)
  })

  it('sombraQA só escreve o que foi PEDIDO, e devolve o que foi LIDO', () => {
    // Os `!== undefined` invertidos trocam a regra inteira: o que não foi
    // pedido é escrito (com `undefined`) e o que foi pedido é ignorado. Uma
    // sonda que MEXE na cena que deveria só observar destrói o A/B que ela
    // existe pra permitir.
    const sombra = {
      bias: -0.0005,
      normalBias: 0.02,
      radius: 4,
      camera: { right: 64 },
      mapSize: { width: 2048, height: 2048 },
      needsUpdate: false,
    }
    const materiais = { opaque: { shadowSide: 0, needsUpdate: false } }
    const engine = { sun: { shadow: sombra }, materials: materiais }
    const qa = qaCom({ engine: () => engine })

    const semPedir = qa.sombraQA({})
    expect(sombra.bias, 'não foi pedido, não pode mudar').toBe(-0.0005)
    expect(sombra.needsUpdate, 'a mudança tem que chegar na tela').toBe(true)
    // `shadowSide` 0 é FrontSide — um lado de verdade, não "sem lado".
    expect(semPedir.lado).toBe(0)

    const pedindo = qa.sombraQA({ bias: -0.001, lado: 2 })
    expect(sombra.bias).toBe(-0.001)
    expect(materiais.opaque.shadowSide).toBe(2)
    expect(pedindo.lado).toBe(2)
    expect(pedindo).toMatchObject({ normalBias: 0.02, radius: 4, raio: 64, mapa: [2048, 2048] })
  })

  it('sem sol na cena, sombraQA devolve null em vez de estourar', () => {
    expect(qaCom({ engine: () => ({}) }).sombraQA({ bias: 1 })).toBeNull()
  })
})
