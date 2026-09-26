import { describe, it, expect } from 'vitest'
import {
  mixDeAmbiente,
  estaSobATerra,
  ALTURA_DO_VENTO,
  VENTO_DE_FUNDO,
  TETO_DA_CAVERNA,
} from '../../src/servicos/ambiente.js'

// ⚠️ O QUE ESTE ARQUIVO SEGURA.
//
// A mistura de ambiente morava dentro de `atualizarAmbiente`, no componente,
// lendo `player`, `world`, `nightNow` e `climaAgora` direto. Para exercitar uma
// unica linha dela era preciso montar o jogo inteiro: carregar textura, criar o
// motor, gerar o mundo e mover o jogador ate uma caverna. Ninguem faz isso num
// teste de unidade, e por isso a regra que decide o que o jogador OUVE nunca
// teve nenhum.
//
// Nao e um detalhe de audio. Um leito ligado na hora errada e a diferenca entre
// uma caverna e um bug: vento assobiando dentro da pedra, ou passaro cantando as
// duas da manha.

const NENHUM = {
  bioma: 'plains',
  noite: false,
  subterraneo: false,
  submerso: false,
  altura: 64,
  chuva: 0,
}

describe('mixDeAmbiente: ceuAberto manda em todos os leitos de fora', () => {
  it('debaixo d agua o mundo externo vai a ZERO, nao a "abafado"', () => {
    const m = mixDeAmbiente({ ...NENHUM, bioma: 'ocean', chuva: 1, submerso: true })
    // Os quatro leitos de fora somem juntos. Um deles sobrevivendo seria o
    // defeito de mixagem que o cabecalho do servico descreve.
    expect(m['amb.vento']).toBe(0)
    expect(m['amb.ondas']).toBe(0)
    expect(m['amb.passaros']).toBe(0)
    expect(m['amb.chuva']).toBe(0)
    expect(m['amb.submerso']).toBe(1)
  })

  it('debaixo da terra a chuva de fora tambem some', () => {
    const m = mixDeAmbiente({ ...NENHUM, chuva: 1, subterraneo: true })
    expect(m['amb.chuva']).toBe(0)
    expect(m['amb.vento']).toBe(0)
    expect(m['amb.caverna']).toBe(1)
  })

  it('ao ar livre a chuva chega com a forca do clima', () => {
    expect(mixDeAmbiente({ ...NENHUM, chuva: 0.4 })['amb.chuva']).toBeCloseTo(0.4, 6)
  })
})

describe('mixDeAmbiente: submerso vence subterraneo', () => {
  it('um lago dentro da caverna e agua, nao caverna', () => {
    const m = mixDeAmbiente({ ...NENHUM, subterraneo: true, submerso: true })
    // Os dois ligados somariam dois lugares num so: eco de pedra por cima do
    // abafamento da agua.
    expect(m['amb.caverna']).toBe(0)
    expect(m['amb.submerso']).toBe(1)
  })

  it('a caverna seca continua soando como caverna', () => {
    expect(mixDeAmbiente({ ...NENHUM, subterraneo: true })['amb.caverna']).toBe(1)
  })
})

describe('mixDeAmbiente: passaro e grilo sao o mesmo leito em horarios opostos', () => {
  it('de dia canta passaro e nenhum grilo', () => {
    const m = mixDeAmbiente({ ...NENHUM, bioma: 'forest' })
    expect(m['amb.passaros']).toBe(1)
    expect(m['amb.grilos']).toBe(0)
  })

  it('de noite canta grilo e nenhum passaro', () => {
    const m = mixDeAmbiente({ ...NENHUM, bioma: 'forest', noite: true })
    expect(m['amb.passaros']).toBe(0)
    expect(m['amb.grilos']).toBe(1)
  })

  it('NUNCA tocam juntos, em nenhuma combinacao de bioma e hora', () => {
    for (const bioma of ['forest', 'jungle', 'taiga', 'plains', 'savanna', 'desert', 'ocean']) {
      for (const noite of [false, true]) {
        const m = mixDeAmbiente({ ...NENHUM, bioma, noite })
        expect(m['amb.passaros'] * m['amb.grilos']).toBe(0)
      }
    }
  })

  it('no deserto nao ha nem passaro nem grilo: nao e arborizado', () => {
    const dia = mixDeAmbiente({ ...NENHUM, bioma: 'desert' })
    const noite = mixDeAmbiente({ ...NENHUM, bioma: 'desert', noite: true })
    expect(dia['amb.passaros']).toBe(0)
    expect(noite['amb.grilos']).toBe(0)
  })
})

describe('mixDeAmbiente: ondas so no litoral', () => {
  it('praia e oceano tem onda; floresta nao', () => {
    expect(mixDeAmbiente({ ...NENHUM, bioma: 'beach' })['amb.ondas']).toBe(1)
    expect(mixDeAmbiente({ ...NENHUM, bioma: 'ocean' })['amb.ondas']).toBe(1)
    expect(mixDeAmbiente({ ...NENHUM, bioma: 'forest' })['amb.ondas']).toBe(0)
  })
})

describe('mixDeAmbiente: o vento sobe com a altitude', () => {
  it('no nivel do mar o vento e so o fundo do terreno', () => {
    const clareira = mixDeAmbiente({ ...NENHUM, bioma: 'forest', altura: 64 })
    expect(clareira['amb.vento']).toBeCloseTo(VENTO_DE_FUNDO.resto, 6)
  })

  it('o descampado assobia mais que a clareira na MESMA altura', () => {
    const a = mixDeAmbiente({ ...NENHUM, bioma: 'desert', altura: 64 })['amb.vento']
    const b = mixDeAmbiente({ ...NENHUM, bioma: 'forest', altura: 64 })['amb.vento']
    expect(a).toBeGreaterThan(b)
    expect(a).toBeCloseTo(VENTO_DE_FUNDO.descampado, 6)
  })

  it('subir aumenta o vento, e ele nunca passa de 1', () => {
    const base = ALTURA_DO_VENTO.base
    const meio = mixDeAmbiente({ ...NENHUM, bioma: 'forest', altura: base + 20 })['amb.vento']
    const pico = mixDeAmbiente({ ...NENHUM, bioma: 'forest', altura: base + 500 })['amb.vento']
    expect(meio).toBeGreaterThan(VENTO_DE_FUNDO.resto)
    expect(pico).toBe(1)
  })

  it('abaixo da base o vento nao fica NEGATIVO', () => {
    // Sem o `preso` a altitude vira negativa no subsolo e chega a CANCELAR o
    // fundo: o jogador desce e o vento silencia sem motivo.
    const fundo = mixDeAmbiente({ ...NENHUM, bioma: 'forest', altura: 5 })['amb.vento']
    expect(fundo).toBeCloseTo(VENTO_DE_FUNDO.resto, 6)
  })
})

describe('mixDeAmbiente: bioma desconhecido nao quebra', () => {
  it('sem nome de bioma sobra so o vento de fundo', () => {
    const m = mixDeAmbiente({ ...NENHUM, bioma: '' })
    expect(m['amb.ondas']).toBe(0)
    expect(m['amb.passaros']).toBe(0)
    expect(m['amb.vento']).toBeCloseTo(VENTO_DE_FUNDO.resto, 6)
  })

  it('todo ganho fica entre 0 e 1, sempre', () => {
    for (const bioma of ['ocean', 'desert', 'forest', 'mountains', '']) {
      for (const chuva of [-1, 0, 0.5, 3]) {
        const m = mixDeAmbiente({ ...NENHUM, bioma, chuva, altura: 200 })
        for (const g of Object.values(m)) {
          expect(g).toBeGreaterThanOrEqual(0)
          expect(g).toBeLessThanOrEqual(1)
        }
      }
    }
  })
})

describe('estaSobATerra: caverna e ter mundo POR CIMA, nao estar fundo', () => {
  it('num vale ao ar livre a y=40 NAO e caverna', () => {
    // A coluna acaba na cabeca do jogador: nao ha pedra em cima dele.
    expect(estaSobATerra(40, 41)).toBe(false)
  })

  it('a mesma altura, com trinta blocos por cima, E caverna', () => {
    expect(estaSobATerra(40, 70)).toBe(true)
  })

  it('uma gruta alta na montanha nao conta: passou do teto', () => {
    const acima = TETO_DA_CAVERNA.altura + 2
    expect(estaSobATerra(acima, acima + 40)).toBe(false)
  })

  it('a folga e uma fronteira, nao um "quase"', () => {
    const { folga } = TETO_DA_CAVERNA
    expect(estaSobATerra(20, 20 + folga)).toBe(false)
    expect(estaSobATerra(20, 20 + folga + 1)).toBe(true)
  })

  it('sem mundo carregado nao ha caverna nenhuma', () => {
    // `world?.heightAt(...)` devolve undefined antes do mundo existir. Sem esta
    // guarda a conta viraria NaN e o leito de caverna piscaria no boot.
    expect(estaSobATerra(20, undefined)).toBe(false)
    expect(estaSobATerra(20, NaN)).toBe(false)
  })
})

// ⚠️ A CACHOEIRA É O ÚNICO LEITO QUE NÃO OBEDECE `ceuAberto`.
//
// Vento, chuva, onda e pássaro são o mundo LÁ FORA, e por isso somem quando se
// entra numa caverna. Cachoeira não é o mundo lá fora: é uma coisa que está
// ali, a dez blocos, caindo. Uma gruta com queda d'água dentro é um dos lugares
// mais bonitos que este jogo consegue fazer, e calar a água justamente ali
// seria trocar o efeito pela regra.
//
// Este bloco existe porque DOIS mutantes sobreviveram sem ele: eu tinha
// acrescentado o leito à mistura e não afirmado nada sobre ele.
describe('mixDeAmbiente: a cachoeira toca onde o resto do mundo cala', () => {
  it('DENTRO da caverna ela continua tocando, enquanto o vento some', () => {
    const m = mixDeAmbiente({ ...NENHUM, subterraneo: true, chuva: 1, cachoeira: 0.8 })
    expect(m['amb.cachoeira']).toBeCloseTo(0.8, 6)
    expect(m['amb.vento']).toBe(0)
    expect(m['amb.chuva']).toBe(0)
  })

  it('debaixo d água ela some: lá o que se ouve é o abafamento', () => {
    // O leito de `amb.submerso` já conta essa história inteira.
    const m = mixDeAmbiente({ ...NENHUM, submerso: true, cachoeira: 1 })
    expect(m['amb.cachoeira']).toBe(0)
    expect(m['amb.submerso']).toBe(1)
  })

  it('submerso DENTRO da caverna também cala a queda', () => {
    const m = mixDeAmbiente({ ...NENHUM, submerso: true, subterraneo: true, cachoeira: 1 })
    expect(m['amb.cachoeira']).toBe(0)
  })

  it('ao ar livre ela chega com a força que a queda tem', () => {
    expect(mixDeAmbiente({ ...NENHUM, cachoeira: 0.35 })['amb.cachoeira']).toBeCloseTo(0.35, 6)
  })

  it('sem queda nenhuma é silêncio, e o padrão é silêncio', () => {
    expect(mixDeAmbiente({ ...NENHUM, cachoeira: 0 })['amb.cachoeira']).toBe(0)
    expect(mixDeAmbiente({ ...NENHUM })['amb.cachoeira']).toBe(0)
  })

  it('força fora da faixa não estoura o ganho', () => {
    expect(mixDeAmbiente({ ...NENHUM, cachoeira: 5 })['amb.cachoeira']).toBe(1)
    expect(mixDeAmbiente({ ...NENHUM, cachoeira: -3 })['amb.cachoeira']).toBe(0)
  })
})
