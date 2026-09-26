import { describe, it, expect } from 'vitest'
import { espelho } from '../../src/servicos/espelho.js'

// ⚠️ O QUE ESTE ARQUIVO SEGURA: o valor de AGORA, e nao a foto de antes.
//
// O estado vivo do componente e `let`, e `let` e REATRIBUIDO: o motor nasce no
// boot e nasce de novo na troca de qualidade, `ticks` anda todo quadro. Passar
// um `let` por valor entrega uma foto -- quem recebeu fica com aquele instante e
// nunca ve o proximo. Ja aconteceu neste jogo: `drops` viajou por valor e a
// lista do outro lado congelou.

describe('espelho: leitura viva', () => {
  it('a leitura acompanha a REATRIBUICAO, e nao a foto', () => {
    let motor = { nome: 'primeiro' }
    const v = espelho({ motor: () => motor })
    expect(v.motor.nome).toBe('primeiro')
    motor = { nome: 'segundo' } // a troca de qualidade recria o motor
    expect(v.motor.nome).toBe('segundo')
  })

  it('serve pra `null` no comeco, que e o estado antes do boot', () => {
    let mundo = null
    const v = espelho({ mundo: () => mundo })
    expect(v.mundo).toBe(null)
    mundo = { pronto: true }
    expect(v.mundo.pronto).toBe(true)
  })

  it('cada campo le o SEU, sem se misturar', () => {
    let a = 1
    let b = 2
    const v = espelho({ a: () => a, b: () => b })
    a = 10
    expect([v.a, v.b]).toEqual([10, 2])
  })
})

describe('espelho: escrita', () => {
  it('o par [ler, escrever] escreve de volta no `let` de verdade', () => {
    let ticks = 1000
    const v = espelho({ ticks: [() => ticks, (n) => (ticks = n)] })
    v.ticks = 18000
    expect(ticks).toBe(18000)
    expect(v.ticks).toBe(18000)
  })

  it('campo so de leitura RECLAMA em vez de falhar calado', () => {
    const v = espelho({ engine: () => 'motor' })
    expect(() => {
      v.engine = 'outro'
    }).toThrow(/engine/)
  })

  it('reclama TAMBEM fora do modo estrito, que e onde a sonda vive', () => {
    // ⚠️ ESTE TESTE EXISTE PORQUE O MUTANTE SOBREVIVEU SEM ELE.
    //
    // Modulo ES e sempre estrito, e no estrito escrever num acessador sem `set`
    // ja lanca sozinho -- entao dentro do Vitest o `set` explicito parecia
    // decoracao. Mas o gancho de QA e dirigido por `page.evaluate`, que roda em
    // script CLASSICO, NAO estrito: la a atribuicao falha CALADA. A sonda
    // escreveria `vivo.engine = x`, nada aconteceria, e o relatorio culparia o
    // jogo por um valor que ela mesma nunca conseguiu escrever.
    //
    // `new Function` cria funcao nao estrita, que e o contexto da sonda.
    const naoEstrito = new Function('alvo', 'alvo.engine = "outro"; return alvo.engine')
    const v = espelho({ engine: () => 'motor' })
    expect(() => naoEstrito(v)).toThrow(/engine/)

    // E a prova de que o contexto e mesmo nao estrito: sem o `set`, um objeto
    // so com getter engole a escrita sem reclamar.
    const semSet = Object.defineProperty({}, 'engine', { get: () => 'motor' })
    expect(naoEstrito(semSet)).toBe('motor')
  })

  it('o erro diz QUAL campo, e nao so "deu errado"', () => {
    const v = espelho({ mobilia: () => null })
    expect(() => {
      v.mobilia = {}
    }).toThrow(/mobilia/)
  })
})

describe('espelho: contrato', () => {
  it('campo sem funcao de leitura e erro NA HORA, nao no primeiro uso', () => {
    // Um `undefined` aqui viraria um acessador que quebra la na frente, dentro
    // do laco de render, longe da causa.
    expect(() => espelho({ engine: 'nao sou funcao' })).toThrow(/engine/)
    expect(() => espelho({ world: undefined })).toThrow(/world/)
  })

  it('os campos aparecem numa varredura do objeto', () => {
    // O gancho de QA serializa o contexto; campo invisivel nao chega na sonda.
    const v = espelho({ a: () => 1, b: [() => 2, () => {}] })
    expect(Object.keys(v).sort()).toEqual(['a', 'b'])
    expect({ ...v }).toEqual({ a: 1, b: 2 })
  })
})
