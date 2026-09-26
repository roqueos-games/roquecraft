import { describe, it, expect } from 'vitest'
import {
  custoDe,
  cabeNaFerramenta,
  encantosPossiveis,
  planoDeEncanto,
  fatorDeEficiencia,
  bonusDeAfiacao,
  gastaDurabilidade,
  comEncanto,
  encantosParaSave,
  encantosDoSave,
  maxNivelDe,
  NOMES_DE_ENCANTO,
  CUSTO_BASE,
} from '../../src/servicos/encantamento.js'

// ENCANTAMENTO — o primeiro consumidor de XP.
//
// ⚠️ O QUE ESTE ARQUIVO PROTEGE É O ENCANTO MORDER. Guardar `{eficiencia: 2}` no
// item e não mudar nada no jogo é a mesma barra de XP que não paga, uma camada
// abaixo — e é o defeito mais fácil de escrever sem perceber, porque tudo
// "funciona": a mesa aceita, o nível desce, o item mostra o encanto. Os testes de
// mordida (velocidade, dano, durabilidade) são os que impedem isso.

const sempre = (v) => () => v

describe('o que cabe em quê', () => {
  it('afiação é de arma, não de pá', () => {
    expect(cabeNaFerramenta('afiacao', 'sword')).toBe(true)
    expect(cabeNaFerramenta('afiacao', 'axe')).toBe(true)
    expect(cabeNaFerramenta('afiacao', 'shovel')).toBe(false)
  })

  it('eficiência é de ferramenta de quebrar, não de espada', () => {
    expect(cabeNaFerramenta('eficiencia', 'pickaxe')).toBe(true)
    expect(cabeNaFerramenta('eficiencia', 'sword')).toBe(false)
  })

  it('sem ferramenta nenhuma não cabe nada', () => {
    expect(cabeNaFerramenta('eficiencia', null)).toBe(false)
    expect(encantosPossiveis(null)).toEqual([])
  })

  it('o que já está no máximo sai da lista', () => {
    const cheio = Object.fromEntries(NOMES_DE_ENCANTO.map((n) => [n, maxNivelDe(n)]))
    expect(encantosPossiveis('pickaxe', cheio)).toEqual([])
  })
})

describe('o custo', () => {
  it('sobe com o que o item já tem — senão a barra volta a não significar nada', () => {
    expect(custoDe(0)).toBe(CUSTO_BASE)
    expect(custoDe(1)).toBe(CUSTO_BASE * 2)
    expect(custoDe(2)).toBe(CUSTO_BASE * 3)
  })
})

describe('o plano', () => {
  it('recusa com motivo quando falta nível, e diz quanto custa', () => {
    const r = planoDeEncanto({
      tipoDeFerramenta: 'pickaxe',
      nivelDoJogador: 1,
      sorteio: sempre(0),
    })
    expect(r.ok).toBe(false)
    expect(r.motivo).toBe('sem-nivel')
    expect(r.custo).toBe(CUSTO_BASE)
  })

  it('recusa com OUTRO motivo quando não há o que encantar', () => {
    const cheio = Object.fromEntries(NOMES_DE_ENCANTO.map((n) => [n, maxNivelDe(n)]))
    const r = planoDeEncanto({
      tipoDeFerramenta: 'pickaxe',
      encantos: cheio,
      nivelDoJogador: 99,
      sorteio: sempre(0),
    })
    expect(r.ok).toBe(false)
    expect(r.motivo).toBe('nada-a-encantar')
  })

  it('os dois motivos são DIFERENTES: o jogador precisa saber qual dos dois foi', () => {
    expect('sem-nivel').not.toBe('nada-a-encantar')
  })

  it('aceita e sobe um nível', () => {
    const r = planoDeEncanto({
      tipoDeFerramenta: 'sword',
      encantos: { afiacao: 1 },
      nivelDoJogador: 30,
      sorteio: sempre(0.99),
    })
    expect(r.ok).toBe(true)
    expect(r.nivel).toBeGreaterThan(0)
    expect(r.custo).toBeGreaterThanOrEqual(CUSTO_BASE)
  })

  it('o sorteio ESCOLHE: sorteios diferentes dão encantos diferentes', () => {
    const arg = (s) => ({ tipoDeFerramenta: 'axe', nivelDoJogador: 99, sorteio: sempre(s) })
    const possiveis = encantosPossiveis('axe')
    expect(possiveis.length).toBeGreaterThan(1)
    const nomes = new Set([planoDeEncanto(arg(0)).nome, planoDeEncanto(arg(0.99)).nome])
    expect(nomes.size).toBeGreaterThan(1)
  })
})

describe('a MORDIDA — sem isto o encanto é enfeite', () => {
  it('eficiência corta o tempo de quebra, e não zera', () => {
    expect(fatorDeEficiencia(0)).toBe(1)
    expect(fatorDeEficiencia(1)).toBeLessThan(1)
    expect(fatorDeEficiencia(3)).toBeLessThan(fatorDeEficiencia(1))
    expect(fatorDeEficiencia(3)).toBeGreaterThan(0)
  })

  it('afiação soma dano, e zero sem encanto', () => {
    expect(bonusDeAfiacao(0)).toBe(0)
    expect(bonusDeAfiacao(2)).toBeGreaterThan(bonusDeAfiacao(1))
  })

  it('inquebrável poupa, mas NUNCA zera: ferramenta eterna apaga a progressão', () => {
    expect(gastaDurabilidade(0, sempre(0.99))).toBe(true)
    // Com nível 3 gasta 1 em cada 4, em média — nunca 0 em 4.
    let gastos = 0
    for (let i = 0; i < 1000; i++) gastos += gastaDurabilidade(3, () => i / 1000) ? 1 : 0
    expect(gastos).toBeGreaterThan(0)
    expect(gastos).toBeLessThan(1000)
  })

  it('a média do inquebrável bate com a promessa: 1 a cada nivel+1', () => {
    const n = 20000
    let gastos = 0
    let semente = 1
    const rng = () => {
      semente = (semente * 1103515245 + 12345) % 2147483648
      return semente / 2147483648
    }
    for (let i = 0; i < n; i++) if (gastaDurabilidade(2, rng)) gastos++
    expect(gastos / n).toBeGreaterThan(0.28)
    expect(gastos / n).toBeLessThan(0.39)
  })
})

describe('o save', () => {
  it('a ida e a volta preservam os encantos', () => {
    const enc = comEncanto({ eficiencia: 1 }, 'inquebravel', 2)
    expect(encantosDoSave(encantosParaSave(enc))).toEqual(enc)
  })

  it('item sem encanto não ocupa espaço no save', () => {
    expect(encantosParaSave(null)).toBeNull()
    expect(encantosParaSave({})).toBeNull()
  })

  it('encanto que não existe mais no catálogo é jogado fora, não quebra a leitura', () => {
    expect(encantosDoSave([['naoExiste', 3]])).toBeNull()
    expect(encantosDoSave([['eficiencia', 99]])).toEqual({ eficiencia: maxNivelDe('eficiencia') })
    expect(encantosDoSave('lixo')).toBeNull()
    expect(encantosDoSave([null, ['eficiencia']])).toBeNull()
  })

  it('comEncanto não muda o mapa antigo', () => {
    const antes = { eficiencia: 1 }
    const depois = comEncanto(antes, 'eficiencia', 2)
    expect(antes.eficiencia).toBe(1)
    expect(depois.eficiencia).toBe(2)
  })
})
