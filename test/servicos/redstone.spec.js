import { describe, it, expect } from 'vitest'
import {
  ehPo,
  nivelDoPo,
  idDoPo,
  forcaDaFonte,
  redeDoPo,
  niveisDaRede,
  recalcularRede,
  blocoEnergizado,
  proximoDaTocha,
  proximoDaLampada,
  alavancaTrocada,
  NIVEL_MAXIMO,
  TETO_DA_REDE,
} from '../../src/servicos/redstone.js'
import { AIR, ID } from '../../src/servicos/blocks.js'

// REDSTONE — a energia.
//
// ⚠️ O TESTE QUE MANDA NESTE ARQUIVO É O DO ANEL SEM FONTE. Toda implementação
// ingênua de propagação ("meu vizinho tem 12, logo eu tenho 11") funciona
// perfeitamente enquanto se LIGA e falha ao DESLIGAR: um fio em anel continua se
// alimentando, cada célula se justificando com a vizinha, para sempre. É o mesmo
// defeito que a água teria sem "o nível é a distância até a fonte". Se este
// arquivo tiver um teste só, é aquele.

function mundo(escrito = {}) {
  const m = new Map(Object.entries(escrito))
  const blocoEm = (x, y, z) => m.get(`${x},${y},${z}`) ?? AIR
  blocoEm.por = (x, y, z, id) => m.set(`${x},${y},${z}`, id)
  blocoEm.aplicar = (celulas) => celulas.forEach((c) => m.set(`${c.x},${c.y},${c.z}`, c.id))
  return blocoEm
}

/** Um fio reto de `n` blocos em x, no y dado, sobre pedra. */
function fio(w, n, y = 10, z = 0, x0 = 0) {
  for (let i = 0; i < n; i++) {
    w.por(x0 + i, y - 1, z, ID.stone)
    w.por(x0 + i, y, z, idDoPo(0))
  }
}

describe('o pó e seus níveis', () => {
  it('ida e volta entre id e nível', () => {
    for (let n = 0; n <= NIVEL_MAXIMO; n++) expect(nivelDoPo(idDoPo(n))).toBe(n)
  })

  it('satura em vez de estourar para fora da faixa', () => {
    expect(nivelDoPo(idDoPo(99))).toBe(NIVEL_MAXIMO)
    expect(nivelDoPo(idDoPo(-5))).toBe(0)
  })

  it('pedra não é pó', () => {
    expect(ehPo(ID.stone)).toBe(false)
    expect(nivelDoPo(ID.stone)).toBe(-1)
  })

  it('PÓ NÃO É FONTE — confundir os dois é o que faz o anel se sustentar', () => {
    expect(forcaDaFonte(idDoPo(15))).toBe(0)
    expect(forcaDaFonte(ID.leverOn)).toBe(NIVEL_MAXIMO)
    expect(forcaDaFonte(ID.leverOff)).toBe(0)
    expect(forcaDaFonte(ID.redstoneTorchOn)).toBe(NIVEL_MAXIMO)
    expect(forcaDaFonte(ID.redstoneTorchOff)).toBe(0)
  })
})

describe('a rede', () => {
  it('junta o fio conectado e para onde ele acaba', () => {
    const w = mundo()
    fio(w, 4)
    fio(w, 3, 10, 5, 20) // outro fio, longe
    expect(redeDoPo(w, 0, 10, 0)).toHaveLength(4)
    expect(redeDoPo(w, 20, 10, 5)).toHaveLength(3)
  })

  it('não sai do pó: pedra no meio corta a rede em duas', () => {
    const w = mundo()
    fio(w, 5)
    w.por(2, 10, 0, ID.stone)
    expect(redeDoPo(w, 0, 10, 0)).toHaveLength(2)
  })

  it('devolve null acima do teto, em vez de travar o quadro', () => {
    const w = mundo()
    fio(w, TETO_DA_REDE + 10)
    expect(redeDoPo(w, 0, 10, 0)).toBeNull()
    expect(recalcularRede(w, 0, 10, 0)).toEqual([])
  })
})

describe('ligar', () => {
  it('a alavanca alimenta o fio e ele decai de um em um', () => {
    const w = mundo()
    fio(w, 5)
    w.por(-1, 10, 0, ID.leverOn)
    w.aplicar(recalcularRede(w, 0, 10, 0))
    expect([0, 1, 2, 3, 4].map((x) => nivelDoPo(w(x, 10, 0)))).toEqual([15, 14, 13, 12, 11])
  })

  it('o fio morre quando a distância passa de quinze', () => {
    const w = mundo()
    fio(w, 20)
    w.por(-1, 10, 0, ID.leverOn)
    w.aplicar(recalcularRede(w, 0, 10, 0))
    expect(nivelDoPo(w(14, 10, 0))).toBe(1)
    expect(nivelDoPo(w(15, 10, 0))).toBe(0)
    expect(nivelDoPo(w(19, 10, 0))).toBe(0)
  })

  it('duas fontes: vence a mais perto, dos dois lados', () => {
    const w = mundo()
    fio(w, 9)
    w.por(-1, 10, 0, ID.leverOn)
    w.por(9, 10, 0, ID.leverOn)
    w.aplicar(recalcularRede(w, 4, 10, 0))
    expect(nivelDoPo(w(0, 10, 0))).toBe(15)
    expect(nivelDoPo(w(8, 10, 0))).toBe(15)
    expect(nivelDoPo(w(4, 10, 0))).toBe(11)
  })

  it('bifurcação que se reencontra: vence o caminho CURTO, não o primeiro a chegar', () => {
    // Dois caminhos da fonte até (6,10,0): um reto de 6 passos e um desvio de
    // 12. Uma busca que não garanta o caminho curto crava o nível ruim na célula
    // do encontro, e o fio "apaga no meio" sem nada explicar. Em `redstone.js`
    // há DOIS mecanismos que garantem isso (a fila e a relaxação) e cada um
    // sozinho basta: só com os dois quebrados é que este teste reprova.
    const w = mundo()
    fio(w, 7) // reto: x de 0 a 6
    for (let z = 1; z <= 3; z++) {
      w.por(0, 9, z, ID.stone)
      w.por(0, 10, z, idDoPo(0))
      w.por(6, 9, z, ID.stone)
      w.por(6, 10, z, idDoPo(0))
    }
    for (let x = 0; x <= 6; x++) {
      w.por(x, 9, 3, ID.stone)
      w.por(x, 10, 3, idDoPo(0))
    }
    w.por(-1, 10, 0, ID.leverOn)
    w.aplicar(recalcularRede(w, 0, 10, 0))
    // Pelo reto são 7 passos: 15 − 6 = 9. Pelo desvio seriam 15 − 12 = 3.
    expect(nivelDoPo(w(6, 10, 0))).toBe(9)
  })

  it('a tocha embaixo do fio alimenta: é onde ela fica em metade dos circuitos', () => {
    const w = mundo()
    fio(w, 3)
    w.por(0, 9, 0, ID.redstoneTorchOn)
    w.aplicar(recalcularRede(w, 0, 10, 0))
    expect(nivelDoPo(w(0, 10, 0))).toBe(15)
  })
})

describe('DESLIGAR — o teste que manda neste arquivo', () => {
  it('sem fonte, o fio reto vai a zero', () => {
    const w = mundo()
    fio(w, 5)
    w.por(-1, 10, 0, ID.leverOn)
    w.aplicar(recalcularRede(w, 0, 10, 0))
    expect(nivelDoPo(w(0, 10, 0))).toBe(15)
    w.por(-1, 10, 0, ID.leverOff)
    w.aplicar(recalcularRede(w, 0, 10, 0))
    expect([0, 1, 2, 3, 4].map((x) => nivelDoPo(w(x, 10, 0)))).toEqual([0, 0, 0, 0, 0])
  })

  it('⚠️ O ANEL SEM FONTE APAGA INTEIRO, e não se alimenta sozinho', () => {
    const w = mundo()
    // Um anel 5×5 de pó.
    for (let i = 0; i < 5; i++) {
      for (const [x, z] of [
        [i, 0],
        [i, 4],
        [0, i],
        [4, i],
      ]) {
        w.por(x, 9, z, ID.stone)
        w.por(x, 10, z, idDoPo(0))
      }
    }
    w.por(-1, 10, 0, ID.leverOn)
    w.aplicar(recalcularRede(w, 0, 10, 0))
    expect(nivelDoPo(w(0, 10, 0))).toBe(15)
    expect(nivelDoPo(w(2, 10, 4))).toBeGreaterThan(0)

    w.por(-1, 10, 0, ID.leverOff)
    w.aplicar(recalcularRede(w, 0, 10, 0))
    const sobrou = []
    for (let i = 0; i < 5; i++) {
      for (const [x, z] of [
        [i, 0],
        [i, 4],
        [0, i],
        [4, i],
      ]) {
        if (nivelDoPo(w(x, 10, z)) > 0) sobrou.push(`${x},${z}`)
      }
    }
    expect(sobrou).toEqual([])
  })
})

describe('o bloco energizado', () => {
  it('pó ACESO ao lado energiza; pó APAGADO não', () => {
    const w = mundo({ '0,10,0': ID.stone })
    w.por(1, 10, 0, idDoPo(0))
    expect(blocoEnergizado(w, 0, 10, 0)).toBe(false)
    w.por(1, 10, 0, idDoPo(4))
    expect(blocoEnergizado(w, 0, 10, 0)).toBe(true)
  })

  it('pó em cima energiza: o fio corre pelo teto do bloco', () => {
    const w = mundo({ '0,10,0': ID.stone })
    w.por(0, 11, 0, idDoPo(9))
    expect(blocoEnergizado(w, 0, 10, 0)).toBe(true)
  })

  it('fonte encostada energiza', () => {
    const w = mundo({ '0,10,0': ID.stone })
    w.por(1, 10, 0, ID.leverOn)
    expect(blocoEnergizado(w, 0, 10, 0)).toBe(true)
  })
})

describe('a tocha — o inversor', () => {
  const comSuporte = () => {
    const w = mundo()
    w.por(0, 9, 0, ID.stone)
    w.por(0, 10, 0, ID.redstoneTorchOn)
    return w
  }

  it('apaga quando o bloco em que está espetada ganha energia', () => {
    const w = comSuporte()
    expect(proximoDaTocha(w, 0, 10, 0)).toBeNull()
    w.por(1, 9, 0, ID.leverOn)
    expect(proximoDaTocha(w, 0, 10, 0)).toBe(ID.redstoneTorchOff)
  })

  it('acende de novo quando a energia sai — é o NÃO, e é dele que sai a lógica', () => {
    const w = comSuporte()
    w.por(0, 10, 0, ID.redstoneTorchOff)
    w.por(1, 9, 0, ID.leverOff)
    expect(proximoDaTocha(w, 0, 10, 0)).toBe(ID.redstoneTorchOn)
  })

  it('não decide nada sem chão sólido embaixo', () => {
    const w = mundo()
    w.por(0, 10, 0, ID.redstoneTorchOn)
    expect(proximoDaTocha(w, 0, 10, 0)).toBeNull()
  })

  it('não responde por quem não é tocha', () => {
    const w = mundo({ '0,10,0': ID.stone })
    expect(proximoDaTocha(w, 0, 10, 0)).toBeNull()
  })
})

describe('a lâmpada e a alavanca', () => {
  it('acende com fio aceso encostado e apaga sem ele', () => {
    const w = mundo({ '0,10,0': ID.redstoneLampOff })
    expect(proximoDaLampada(w, 0, 10, 0)).toBeNull()
    w.por(1, 10, 0, idDoPo(3))
    expect(proximoDaLampada(w, 0, 10, 0)).toBe(ID.redstoneLampOn)
    w.por(0, 10, 0, ID.redstoneLampOn)
    w.por(1, 10, 0, idDoPo(0))
    expect(proximoDaLampada(w, 0, 10, 0)).toBe(ID.redstoneLampOff)
  })

  it('a alavanca vira, e só ela', () => {
    expect(alavancaTrocada(ID.leverOff)).toBe(ID.leverOn)
    expect(alavancaTrocada(ID.leverOn)).toBe(ID.leverOff)
    expect(alavancaTrocada(ID.stone)).toBeNull()
  })
})

describe('o circuito inteiro: alavanca → fio → tocha → fio → lâmpada', () => {
  it('a lâmpada acende quando a alavanca DESLIGA — é um NÃO de verdade', () => {
    const w = mundo()
    // Alavanca alimenta um fio que energiza o bloco da tocha; a tocha, invertida,
    // alimenta o segundo fio, que acende a lâmpada.
    w.por(0, 9, 0, ID.stone)
    w.por(0, 10, 0, ID.leverOff)
    w.por(1, 9, 0, ID.stone)
    w.por(1, 10, 0, idDoPo(0))
    w.por(2, 10, 0, ID.stone) // o bloco em que a tocha está espetada
    w.por(2, 11, 0, ID.redstoneTorchOn)
    w.por(3, 11, 0, idDoPo(0))
    w.por(3, 10, 0, ID.stone)
    w.por(4, 11, 0, ID.redstoneLampOff)

    const passo = () => {
      w.aplicar(recalcularRede(w, 1, 10, 0))
      const t = proximoDaTocha(w, 2, 11, 0)
      if (t !== null) w.por(2, 11, 0, t)
      w.aplicar(recalcularRede(w, 3, 11, 0))
      const l = proximoDaLampada(w, 4, 11, 0)
      if (l !== null) w.por(4, 11, 0, l)
    }

    passo()
    expect(w(2, 11, 0), 'alavanca desligada: a tocha fica acesa').toBe(ID.redstoneTorchOn)
    expect(w(4, 11, 0), 'e a lâmpada acende').toBe(ID.redstoneLampOn)

    w.por(0, 10, 0, ID.leverOn)
    passo()
    passo()
    expect(w(2, 11, 0), 'alavanca ligada: a tocha APAGA').toBe(ID.redstoneTorchOff)
    expect(w(4, 11, 0), 'e a lâmpada apaga junto').toBe(ID.redstoneLampOff)
  })
})
