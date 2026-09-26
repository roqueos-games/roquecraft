import { describe, it, expect } from 'vitest'
import { SKINS, SKIN_IDS, SKIN_PADRAO, skinDe, normalizeSkinId } from '../../src/servicos/skins.js'
import { curvaDeGolpe, repiqueDeGolpe } from '../../src/servicos/anim.js'

// A skin existe pra RESOLVER UM PROBLEMA: numa sala, saber quem é quem. Um
// teste que só conferisse "tem 8 skins" não mede isso. Estes medem separação
// de cor e estabilidade da escolha.
describe('skins', () => {
  it('duas skins quaisquer se distinguem pela camisa', () => {
    // Distância euclidiana em RGB. 90 é o piso que separa cores que uma pessoa
    // chama de "diferentes" num boneco de 30 px na tela.
    for (let i = 0; i < SKINS.length; i++) {
      for (let j = i + 1; j < SKINS.length; j++) {
        const a = SKINS[i].camisa
        const b = SKINS[j].camisa
        const d = Math.hypot(
          ((a >> 16) & 255) - ((b >> 16) & 255),
          ((a >> 8) & 255) - ((b >> 8) & 255),
          (a & 255) - (b & 255),
        )
        expect(
          d,
          `${SKINS[i].id} e ${SKINS[j].id} têm camisas parecidas (${d.toFixed(0)})`,
        ).toBeGreaterThan(90)
      }
    }
  })

  it('ids são únicos', () => {
    expect(new Set(SKIN_IDS).size).toBe(SKINS.length)
  })

  it('sem escolha, a skin é sorteada pela semente e NÃO muda entre chamadas', () => {
    const a = skinDe('', 'uid-abc')
    const b = skinDe('', 'uid-abc')
    expect(a).toBe(b)
    // e sementes diferentes tendem a cair em skins diferentes
    const vistas = new Set()
    for (let i = 0; i < 40; i++) vistas.add(skinDe('', `uid-${i}`).id)
    expect(vistas.size, 'o sorteio está concentrado numa skin só').toBeGreaterThan(3)
  })

  it('nunca devolve undefined, nem com lixo na entrada', () => {
    for (const v of [null, undefined, 42, {}, 'nao-existe', '']) {
      expect(skinDe(v, 'x')).toBeTruthy()
      expect(skinDe(v, 'x').camisa).toBeTypeOf('number')
    }
  })

  it('normalizeSkinId barra id desconhecido', () => {
    expect(normalizeSkinId('roque')).toBe('roque')
    expect(normalizeSkinId('<script>')).toBe('')
    expect(normalizeSkinId(undefined)).toBe('')
  })
})

// A curva é compartilhada entre a mão em primeira pessoa e o braço remoto. Se
// ela deixar de ser assimétrica, os dois viram aceno ao mesmo tempo.
describe('curva do golpe', () => {
  it('sobe rápido e desce devagar (pico no primeiro quarto)', () => {
    let iPico = 0
    let melhor = -1
    for (let i = 0; i <= 100; i++) {
      const v = curvaDeGolpe(i / 100)
      if (v > melhor) {
        melhor = v
        iPico = i
      }
    }
    expect(iPico / 100, `pico em t=${iPico / 100}`).toBeLessThan(0.34)
    expect(melhor).toBeCloseTo(1, 2)
  })

  it('começa e termina em repouso', () => {
    expect(curvaDeGolpe(0)).toBeCloseTo(0, 6)
    expect(curvaDeGolpe(1)).toBeCloseTo(0, 6)
  })

  it('aguenta t fora de 0..1 sem devolver NaN', () => {
    for (const t of [-1, -0.001, 1.5, NaN]) {
      expect(Number.isNaN(curvaDeGolpe(t))).toBe(false)
      expect(Number.isNaN(repiqueDeGolpe(t))).toBe(false)
    }
  })
})

describe('skins — o id que vai pro protocolo', () => {
  it('só um id de skin CONHECIDO passa', () => {
    // `typeof id === 'string' && POR_ID.has(id)`: com `||`, qualquer string
    // passa (inclusive um id inventado por outro cliente, que o render não sabe
    // desenhar); e com o `===` invertido, o id de verdade é o único recusado.
    expect(normalizeSkinId(SKIN_IDS[0])).toBe(SKIN_IDS[0])
    expect(normalizeSkinId('skinQueNaoExiste')).toBe('')
    expect(normalizeSkinId(123)).toBe('')
    expect(normalizeSkinId(null)).toBe('')
    expect(normalizeSkinId(undefined)).toBe('')
  })

  it('a skin padrão é a PRIMEIRA da lista', () => {
    // `SKINS[0].id`: com índice 1, todo jogador que nunca escolheu abre com a
    // segunda skin, e o padrão deixa de ser o que a lista anuncia.
    expect(SKIN_PADRAO).toBe(SKINS[0].id)
    expect(SKIN_IDS[0]).toBe(SKINS[0].id)
  })

  it('o sorteio pela semente USA a semente inteira, não só o primeiro caractere', () => {
    // O hash é `h * 31 + charCodeAt(i)`. Virando `-`, nomes com o mesmo começo
    // colidem muito mais, e a sala inteira vira gente de camisa igual.
    //
    // Aqui se afirma o que importa: dois nomes que só diferem NO FIM têm que
    // poder cair em skins diferentes, e a escolha tem que ser estável.
    const a = skinDe(undefined, 'roque-aaaa')
    const b = skinDe(undefined, 'roque-zzzz')
    expect(skinDe(undefined, 'roque-aaaa')).toBe(a)
    expect(skinDe(undefined, 'roque-zzzz')).toBe(b)

    // Entre um punhado de nomes com prefixo comum, mais de uma skin aparece.
    const nomes = ['jogador1', 'jogador2', 'jogador3', 'jogador4', 'jogador5', 'jogador6']
    const distintas = new Set(nomes.map((n) => skinDe(undefined, n).id))
    expect(distintas.size).toBeGreaterThan(1)
  })

  it('semente vazia ainda devolve uma skin de verdade', () => {
    // O render não tem plano B: `undefined` aqui vira boneco invisível.
    expect(SKINS).toContain(skinDe(undefined, ''))
    expect(SKINS).toContain(skinDe('idInvalido', ''))
  })
})

describe('skins — o sorteio é um contrato de compatibilidade', () => {
  it('a mesma semente dá a MESMA skin, hoje e depois de uma atualização', () => {
    // ⚠️ VALOR CONGELADO, DE PROPÓSITO — mesma ideia do céu verbatim do Call of
    // Roque. O hash `h * 31 + charCodeAt(i)` não é detalhe interno: ele decide
    // qual skin cada jogador que NUNCA escolheu recebe. Trocar a conta (o `+`
    // virando `-`, por exemplo) continua dando um sorteio estável e bem
    // espalhado — nenhuma propriedade estatística acusa —, mas TODO jogador
    // antigo aparece de roupa diferente no dia da atualização, e para ele isso
    // é o jogo perdendo a cara dele.
    //
    // Uma semente de um caractere expõe a conta inteira: o hash é o próprio
    // código do caractere, e a skin é ele módulo o tamanho da lista.
    expect(skinDe(undefined, 'a').id).toBe(SKINS['a'.charCodeAt(0) % SKINS.length].id)
    expect(skinDe(undefined, 'R').id).toBe(SKINS['R'.charCodeAt(0) % SKINS.length].id)
  })
})
