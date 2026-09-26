import { describe, it, expect } from 'vitest'
import {
  POTENCIA_DO_CREEPER,
  DANO_MAXIMO,
  raioDeDano,
  danoDaExplosao,
  exposicaoEntre,
  blocosDaExplosao,
  podeExplodir,
} from '../../src/servicos/explosao.js'
import { BLOCKS, BLOCK_BY_KEY } from '../../src/servicos/blocks.js'

/**
 * A EXPLOSÃO DO CREEPER.
 *
 * O bicho sem o buraco no chão não é o bicho: vira um número tirando vida, e o
 * jogador nunca aprende a correr. Então o que se testa aqui é o buraco e o
 * alcance do dano, não "a função devolve um array".
 */

/** Sorteio fixo: sem isto o formato do buraco muda a cada corrida. */
const rndFixo =
  (v = 0.5) =>
  () =>
    v
const tudoDestrutivel = () => true
const semParede = () => false

describe('dano — quem está perto morre, quem está longe se assusta', () => {
  it('encostado passa da vida cheia: ponto-vazio mata, como no original', () => {
    expect(danoDaExplosao(POTENCIA_DO_CREEPER, 0)).toBe(DANO_MAXIMO)
    expect(DANO_MAXIMO, 'a vida cheia do jogador é 20').toBeGreaterThan(20)
  })

  it('o dano acaba a 2× a potência, e não um pouco antes', () => {
    const limite = raioDeDano(POTENCIA_DO_CREEPER)
    expect(limite).toBe(6)
    // Um bloco antes do limite ainda dói. (Não se testa `limite - 0.01`: o dano
    // é inteiro, e nessa distância a conta dá 0,04 — arredondar pra zero ali é
    // certo, e exigir o contrário seria testar o arredondamento, não a regra.)
    expect(danoDaExplosao(POTENCIA_DO_CREEPER, limite - 1)).toBeGreaterThan(0)
    expect(danoDaExplosao(POTENCIA_DO_CREEPER, limite)).toBe(0)
    expect(danoDaExplosao(POTENCIA_DO_CREEPER, 99)).toBe(0)
  })

  it('cai LINEAR: na metade do raio sobra metade do dano', () => {
    // Queda quadrática deixaria isto perto de zero, e o jogador aprenderia que
    // dá pra ficar a três blocos de um creeper. Não dá.
    const meio = danoDaExplosao(POTENCIA_DO_CREEPER, raioDeDano(POTENCIA_DO_CREEPER) / 2)
    expect(meio).toBe(Math.round(DANO_MAXIMO / 2))
    expect(meio, 'metade do raio ainda tem que doer de verdade').toBeGreaterThan(9)
  })

  it('exposição zero (parede inteira no meio) zera o dano mesmo encostado', () => {
    expect(danoDaExplosao(POTENCIA_DO_CREEPER, 0.5, 0)).toBe(0)
    // Par de controle: a MESMA distância sem parede machuca.
    expect(danoDaExplosao(POTENCIA_DO_CREEPER, 0.5, 1)).toBeGreaterThan(20)
  })

  it('exposição fora da faixa não vira dano negativo nem dobrado', () => {
    expect(danoDaExplosao(POTENCIA_DO_CREEPER, 1, -3)).toBe(0)
    expect(danoDaExplosao(POTENCIA_DO_CREEPER, 1, 5)).toBe(
      danoDaExplosao(POTENCIA_DO_CREEPER, 1, 1),
    )
  })

  it('distância inválida não vira dano', () => {
    expect(danoDaExplosao(POTENCIA_DO_CREEPER, NaN)).toBe(0)
    expect(danoDaExplosao(POTENCIA_DO_CREEPER, -1)).toBe(0)
  })
})

describe('exposição — parede protege, campo aberto não', () => {
  it('campo aberto entrega a explosão inteira', () => {
    expect(exposicaoEntre(semParede, 0, 64, 0, 4, 64, 0)).toBe(1)
  })

  it('parede sólida no caminho zera', () => {
    expect(exposicaoEntre(() => true, 0, 64, 0, 4, 64, 0)).toBe(0)
  })

  it('uma parede FINA protege em parte — e o teste sabe achar a parede', () => {
    // Coluna opaca em x=2, entre a explosão (x=0) e o alvo (x=4).
    const parede = (x) => x === 2
    const meio = exposicaoEntre(parede, 0, 64, 0, 4, 64, 0)
    expect(meio).toBeLessThan(1)
    expect(meio).toBeGreaterThan(0)
    // Prova de vida do preditor: sem a parede o mesmo trajeto dá 1.
    expect(exposicaoEntre(() => false, 0, 64, 0, 4, 64, 0)).toBe(1)
  })

  it('o CHÃO embaixo dos dois não conta como proteção', () => {
    // O caso que acontece toda vez: creeper e jogador em pé na grama, um ao
    // lado do outro. Se o chão entrasse na conta, todo estouro ao ar livre
    // seria lido como abafado e o bicho não machucaria ninguém.
    const chao = (x, y) => y < 64
    expect(exposicaoEntre(chao, 0.5, 64.9, 0.5, 2.5, 64.9, 0.5)).toBe(1)
  })

  it('encostado, sem parede, a explosão chega inteira', () => {
    expect(exposicaoEntre(semParede, 1.2, 64.9, 0, 1.4, 64.9, 0)).toBe(1)
  })
})

describe('o buraco', () => {
  it('leva o bloco do centro e não passa da potência', () => {
    const lista = blocosDaExplosao(
      { ehDestrutivel: tudoDestrutivel, rnd: rndFixo(0.99) },
      10.5,
      64.5,
      -3.5,
    )
    expect(lista.length).toBeGreaterThan(20)
    // ⚠️ `Math.floor(-3.5)` é −4, não −3. A primeira versão deste teste errou
    // isso e acusou o código; a conta certa é a do `floor`, e é ela que decide
    // em que bloco o creeper está de pé.
    expect(lista[0], 'a lista sai do centro pra fora').toEqual([10, 64, -4])
    for (const [x, y, z] of lista) {
      expect(Math.hypot(x - 10, y - 64, z + 4)).toBeLessThanOrEqual(POTENCIA_DO_CREEPER)
    }
  })

  it('a borda é IRREGULAR — não é uma esfera de fórmula', () => {
    const opts = { ehDestrutivel: tudoDestrutivel }
    const cheio = blocosDaExplosao({ ...opts, rnd: rndFixo(0.99) }, 0.5, 64.5, 0.5)
    const roido = blocosDaExplosao({ ...opts, rnd: rndFixo(0.01) }, 0.5, 64.5, 0.5)
    // Com sorteio baixo, a casca some; com sorteio alto, fica. Se os dois
    // dessem o mesmo tamanho, o sorteio não estaria sendo lido.
    expect(roido.length).toBeLessThan(cheio.length)
    expect(roido.length).toBeGreaterThan(0)
  })

  it('o MIOLO nunca é sorteado — nada de pedra boiando dentro do buraco', () => {
    const roido = blocosDaExplosao(
      { ehDestrutivel: tudoDestrutivel, rnd: rndFixo(0) },
      0.5,
      64.5,
      0.5,
    )
    const chaves = new Set(roido.map((c) => c.join(',')))
    // Tudo dentro de 72% da potência tem que estar lá, com o sorteio no pior
    // valor possível.
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          expect(chaves.has(`${dx},${64 + dy},${dz}`), `sobrou bloco em ${dx},${dy},${dz}`).toBe(
            true,
          )
        }
      }
    }
  })

  it('o que não pode ser levado não entra — e o resto entra (prova de vida)', () => {
    const soPedraSolta = (x, y, z) => y === 64 && x === 0 && z === 0
    const lista = blocosDaExplosao(
      { ehDestrutivel: soPedraSolta, rnd: rndFixo(0.99) },
      0.5,
      64.5,
      0.5,
    )
    expect(lista).toEqual([[0, 64, 0]])
    // Par de controle: com tudo destrutível a mesma chamada acha dezenas.
    expect(
      blocosDaExplosao({ ehDestrutivel: tudoDestrutivel, rnd: rndFixo(0.99) }, 0.5, 64.5, 0.5)
        .length,
    ).toBeGreaterThan(20)
  })

  it('a lista sai ordenada do centro pra fora', () => {
    const lista = blocosDaExplosao(
      { ehDestrutivel: tudoDestrutivel, rnd: rndFixo(0.99) },
      0.5,
      64.5,
      0.5,
    )
    const dists = lista.map(([x, y, z]) => Math.hypot(x, y - 64, z))
    // Importa porque quem aplica pode ter teto: cortar a lista tem que sobrar o
    // miolo do buraco, nunca um anel oco.
    expect(dists).toEqual([...dists].sort((a, b) => a - b))
  })

  it('potência maior faz buraco maior', () => {
    const p3 = blocosDaExplosao(
      { potencia: 3, ehDestrutivel: tudoDestrutivel, rnd: rndFixo(0.99) },
      0.5,
      64.5,
      0.5,
    )
    const p5 = blocosDaExplosao(
      { potencia: 5, ehDestrutivel: tudoDestrutivel, rnd: rndFixo(0.99) },
      0.5,
      64.5,
      0.5,
    )
    expect(p5.length).toBeGreaterThan(p3.length)
  })
})

describe('podeExplodir — o que resiste', () => {
  it('a rocha-mãe resiste, a pedra não', () => {
    expect(podeExplodir(BLOCK_BY_KEY.bedrock)).toBe(false)
    expect(podeExplodir(BLOCK_BY_KEY.stone)).toBe(true)
  })

  it('ÁGUA E LAVA FICAM — senão o buraco seco no lago se enche no quadro seguinte', () => {
    expect(podeExplodir(BLOCK_BY_KEY.water)).toBe(false)
    expect(podeExplodir(BLOCK_BY_KEY.lava)).toBe(false)
  })

  it('bloco inexistente (ar) não é levado', () => {
    expect(podeExplodir(undefined)).toBe(false)
    expect(podeExplodir(null)).toBe(false)
  })

  it('todo bloco quebrável do jogo é explodível — nenhum some por falta de campo', () => {
    // Prova de vida do critério: se `podeExplodir` dependesse de um campo que
    // metade dos blocos não tem, esta lista viria cheia e ninguém notaria — o
    // creeper faria buracos com furos.
    const quebravelMasNaoExplodivel = Object.values(BLOCKS).filter(
      (b) => b.hardness >= 0 && !b.unbreakable && !b.liquid && !podeExplodir(b),
    )
    expect(quebravelMasNaoExplodivel.map((b) => b.key)).toEqual([])
  })
})

describe('explosão — as bordas exatas', () => {
  it('exatamente no limite do raio o dano já é ZERO', () => {
    // `distancia >= limite` afrouxado para `>`: quem está no anel exato do
    // limite passa a levar dano 0 mesmo assim (a força ali é 0), mas o mutante
    // sobrevive pelo OUTRO lado — `!(distancia >= 0)` virando `!(distancia > 0)`
    // faz o alvo NO CENTRO da explosão, distância zero, sair ileso. É o alvo
    // que deveria morrer na hora.
    const limite = raioDeDano(POTENCIA_DO_CREEPER)
    expect(danoDaExplosao(POTENCIA_DO_CREEPER, limite)).toBe(0)
    expect(danoDaExplosao(POTENCIA_DO_CREEPER, 0)).toBe(DANO_MAXIMO)
  })

  it('distância negativa não vira dano', () => {
    expect(danoDaExplosao(POTENCIA_DO_CREEPER, -1)).toBe(0)
    expect(danoDaExplosao(POTENCIA_DO_CREEPER, NaN)).toBe(0)
  })

  it('bloco com dureza ZERO ainda explode', () => {
    // `def.hardness >= 0`. Apertado para `>`, todo bloco de dureza zero — a
    // grama alta, a flor, a tocha — para de ser levado pela explosão e fica
    // boiando dentro da cratera.
    expect(podeExplodir({ hardness: 0 })).toBe(true)
    expect(podeExplodir({ hardness: -1 })).toBe(false)
    expect(podeExplodir({ hardness: 1, unbreakable: true })).toBe(false)
    expect(podeExplodir({ hardness: 1, liquid: true })).toBe(false)
    expect(podeExplodir(null)).toBe(false)
  })

  it('o bloco na distância EXATA da potência entra na cratera', () => {
    // `d > potencia` afrouxado para `>=` corta o anel externo inteiro da
    // cratera: ela sai menor do que a explosão que a fez.
    const levados = blocosDaExplosao(
      { potencia: 3, ehDestrutivel: () => true, rnd: () => 1 },
      0,
      0,
      0,
    )
    const chaves = new Set(levados.map((c) => c.join(',')))
    expect(chaves.has('3,0,0')).toBe(true)
    expect(chaves.has('4,0,0')).toBe(false)
  })

  it('a casca é sorteada; o miolo vai sempre', () => {
    // `casca > 0.72 && rnd() < ...`: com `rnd` sempre 0 o sorteio recusa toda a
    // casca, e com `rnd` sempre 1 ele aceita tudo. A diferença entre as duas
    // craterass é exatamente a casca.
    const tudo = blocosDaExplosao({ potencia: 3, ehDestrutivel: () => true, rnd: () => 1 }, 0, 0, 0)
    const soMiolo = blocosDaExplosao(
      { potencia: 3, ehDestrutivel: () => true, rnd: () => 0 },
      0,
      0,
      0,
    )
    expect(soMiolo.length).toBeLessThan(tudo.length)
    // O centro sobrevive ao sorteio nos dois casos.
    expect(soMiolo.some((c) => c.join(',') === '0,0,0')).toBe(true)
  })

  it('a cratera sai ordenada do centro pra fora', () => {
    const levados = blocosDaExplosao(
      { potencia: 2, ehDestrutivel: () => true, rnd: () => 1 },
      10,
      20,
      30,
    )
    expect(levados[0]).toEqual([10, 20, 30])
    const distancias = levados.map(([x, y, z]) => Math.hypot(x - 10, y - 20, z - 30))
    expect([...distancias].sort((a, b) => a - b)).toEqual(distancias)
  })
})
