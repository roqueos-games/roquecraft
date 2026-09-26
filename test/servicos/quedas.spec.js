import { describe, it, expect } from 'vitest'

// A superfície REAL do módulo: `fApp`, `fAuth`, `fAnalytics`, `fDb`, `fStore`,
// `fStorage`, `fFunctions`. Já esteve dublado como `db`/`auth`/`default`, que o
// módulo não tem -- quem importasse o nome de verdade recebia `undefined`.

import { criarQuedas, SEGUNDOS_ATE_DESISTIR } from '../../src/servicos/quedas.js'
import { ID, AIR } from '../../src/servicos/blocks.js'

const mundo =
  (celulas = {}) =>
  (x, y, z) =>
    celulas[`${x},${y},${z}`] ?? AIR

const passos = (q, blocoEm, aoPousar, n, dt = 1 / 20) => {
  for (let i = 0; i < n; i++) q.passo(dt, blocoEm, aoPousar)
}

describe('quedas — o registro', () => {
  it('começa uma queda e a mantém no ar', () => {
    const q = criarQuedas()
    expect(q.comecar(ID.sand, 0, 20, 0, 10)).toBeTruthy()
    expect(q.quantas).toBe(1)
  })

  it('a fila cheia RECUSA e conta — não cresce sem fim nem some calada', () => {
    // Uma duna de seis mil blocos viraria seis mil malhas e mataria o quadro.
    // Mas recusar em silêncio faz a areia sumir do mundo, que é pior. Quem
    // chama tem que ver o `null` e pousar na hora.
    const q = criarQuedas({ maximo: 2 })
    expect(q.comecar(ID.sand, 0, 20, 0, 10)).toBeTruthy()
    expect(q.comecar(ID.sand, 1, 20, 0, 10)).toBeTruthy()
    expect(q.comecar(ID.sand, 2, 20, 0, 10)).toBe(null)
    expect(q.recusadas).toBe(1)
    expect(q.quantas).toBe(2)
  })
})

describe('quedas — o passo', () => {
  it('desce, e cada passo desce mais que o anterior', () => {
    const q = criarQuedas()
    const r = q.comecar(ID.sand, 0, 20, 0, 0)
    const b = mundo()
    const alturas = [r.y]
    for (let i = 0; i < 5; i++) {
      q.passo(1 / 20, b, () => {})
      alturas.push(r.y)
    }
    for (let i = 2; i < alturas.length; i++) {
      expect(alturas[i - 1] - alturas[i]).toBeGreaterThan(alturas[i - 2] - alturas[i - 1])
    }
  })

  it('pousa no destino e sai da lista', () => {
    const q = criarQuedas()
    q.comecar(ID.sand, 0, 12, 0, 10)
    const pousadas = []
    passos(q, mundo({ '0,9,0': ID.stone }), (r, m) => pousadas.push([r.x, r.destino, r.z, m]), 60)
    expect(pousadas).toEqual([[0, 10, 0, 'pousou']])
    expect(q.quantas).toBe(0)
  })

  it('reconfere o destino no meio da queda: alguém construiu embaixo', () => {
    // ⚠️ Sem reconferir, a areia atravessaria o bloco novo e pousaria embaixo
    // dele — comendo a construção de quem chegou primeiro.
    const celulas = { '0,0,0': ID.stone }
    const b = mundo(celulas)
    const q = criarQuedas()
    q.comecar(ID.sand, 0, 30, 0, 1)
    passos(q, b, () => {}, 10)
    // O jogador põe uma pedra em 20, no caminho.
    celulas['0,20,0'] = ID.stone
    const pousadas = []
    passos(q, b, (r, m) => pousadas.push([r.destino, m]), 120)
    expect(pousadas).toEqual([[21, 'pousou']])
  })

  it('com chão, pousa no chão do mundo — nunca cai pra fora por baixo', () => {
    const q = criarQuedas()
    q.comecar(ID.sand, 0, 100, 0, -100000)
    const fim = []
    for (let i = 0; i < 400; i++) q.passo(1 / 20, mundo(), (r, m) => fim.push([r.destino, m]))
    // O fundo padrão é 0. Mesmo com um destino absurdo, a reconferência de
    // meio de queda traz a areia pro piso do mundo.
    expect(fim).toEqual([[0, 'pousou']])
  })

  it('SEM chão nenhum, desiste no tempo do original em vez de cair pra sempre', () => {
    // Rede de segurança, não caminho de todo dia: num mundo com piso em y=0 a
    // areia sempre acha onde pousar. Isto aqui é o que sobra se um dia o fundo
    // sumir — mundo sem piso, coluna descarregada, destino calculado errado.
    // Sem a rede, a entidade fica no ar pra sempre consumindo malha.
    const q = criarQuedas()
    q.comecar(ID.sand, 0, 100, 0, -2000)
    const fim = []
    // Passos grandes: o teto interno de 8 tiques por chamada impede o
    // teletransporte, então o tempo passa mesmo com dt grande.
    for (let i = 0; i < 400; i++) {
      // ⚠️ Fundo modesto de propósito. `destinoDaQueda` VARRE a coluna: um
      // fundo de −1e9 vira um laço de um bilhão a cada célula atravessada, e
      // este teste travou o vitest inteiro na primeira escrita.
      q.passo(SEGUNDOS_ATE_DESISTIR / 100, mundo(), (r, m) => fim.push(m), -2000)
    }
    expect(fim).toEqual(['desistiu'])
    expect(q.quantas).toBe(0)
  })

  it('duas quedas na mesma coluna não se atropelam na hora de sair da lista', () => {
    // Remover de dentro de um laço crescente pula o vizinho. O laço anda de
    // trás pra frente exatamente por isso, e este teste fixa o comportamento.
    const q = criarQuedas()
    q.comecar(ID.sand, 0, 11, 0, 10)
    q.comecar(ID.sand, 1, 11, 0, 10)
    q.comecar(ID.sand, 2, 11, 0, 10)
    const pousadas = []
    passos(q, mundo(), (r) => pousadas.push(r.x), 40)
    expect(pousadas.sort()).toEqual([0, 1, 2])
    expect(q.quantas).toBe(0)
  })

  it('limpar esvazia tudo', () => {
    const q = criarQuedas({ maximo: 1 })
    q.comecar(ID.sand, 0, 20, 0, 0)
    q.comecar(ID.sand, 1, 20, 0, 0)
    q.limpar()
    expect(q.quantas).toBe(0)
    expect(q.recusadas).toBe(0)
  })
})

describe('quedas — o pouso e a reconferência', () => {
  it('chegar EXATAMENTE no destino já é pousar', () => {
    // `q.y <= q.destino`. Apertado para `<`, o bloco que chega no ponto exato
    // do destino não pousa: continua na lista, o passo seguinte o leva ABAIXO
    // do chão, e só a rede de segurança dos 30 s o tira de lá.
    const q = criarQuedas()
    // Pedra em 19: o destino relido no meio da queda continua sendo 20.
    const chao = mundo({ '0,19,0': ID.stone })
    expect(q.comecar(ID.sand, 0, 20, 0, 20)).toBeTruthy()

    const pousados = []
    q.passo(1 / 20, chao, (registro, motivo) => pousados.push([registro.y, motivo]))

    expect(pousados).toEqual([[20, 'pousou']])
    expect(q.quantas).toBe(0)
  })

  it('queda que JÁ está no destino pousa mesmo num quadro de duração zero', () => {
    // ⚠️ `q.y <= q.destino`. O caso que separa `<=` de `<` é a igualdade exata,
    // e ela só acontece num quadro que não andou: dois quadros no mesmo
    // milissegundo dão `dt` zero, e a física devolve a mesma altura. Com `<`,
    // um bloco enfileirado depois que o apoio voltou fica no ar PARA SEMPRE —
    // até a rede de segurança dos 30 s, consumindo uma malha da piscina.
    const q = criarQuedas()
    q.comecar(ID.sand, 0, 20, 0, 20)

    const pousados = []
    q.passo(0, mundo({ '0,19,0': ID.stone }), (registro, motivo) =>
      pousados.push([registro.y, motivo]),
    )

    expect(pousados).toEqual([[20, 'pousou']])
    expect(q.quantas).toBe(0)
  })

  it('construir embaixo NO MEIO da queda muda onde a areia pousa', () => {
    // ⚠️ Esta é a razão de existir da releitura: o jogador tapa o buraco
    // enquanto a areia cai, e ela tem que pousar no piso NOVO.
    //
    // `Math.floor(q.y) !== anterior` invertido inverte QUANDO se relê: passa a
    // reler enquanto o bloco está dentro da mesma célula, e a parar justamente
    // quando ele cruza uma divisa. Numa queda rápida — que cruza célula todo
    // quadro — a releitura nunca acontece, e a areia atravessa o piso novo.
    const q = criarQuedas()
    const queda = q.comecar(ID.sand, 0, 45, 0, 0)
    queda.vy = -1.02 // já vinha caindo: cruza uma célula por quadro

    let piso = null
    const blocoEm = (x, y) => (piso !== null && y <= piso ? ID.stone : AIR)

    passos(q, blocoEm, () => {}, 3)
    expect(q.quantas).toBe(1)

    piso = 30 // alguém constrói embaixo, no meio da queda

    const pousados = []
    passos(q, blocoEm, (registro, motivo) => pousados.push([registro.y, motivo]), 30)
    expect(pousados).toEqual([[31, 'pousou']])
  })
})
