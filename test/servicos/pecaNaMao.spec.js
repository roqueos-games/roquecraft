//
// A PEÇA NA MÃO — a silhueta de cada coisa que o jogador empunha.
//
// ⚠️ ESTE TESTE EXISTE PORQUE A SUÍTE ESTAVA VERDE COM UMA PICARETA NA MÃO
// FAZENDO AS VEZES DE ESPADA, MACHADO, PÁ, ENXADA E TESOURA.
//
// Nada reprovava: o viewmodel tinha uma geometria só e trocava a cor do metal,
// e nenhum teste olhava para a forma. A tocha era pior — por ser bloco item ela
// caía no ramo do cubo e virava um cubo cheio com a textura de tocha nas seis
// faces. O founder viu em dez segundos de jogo o que a suíte não via.
//
// ⚠️ O QUE SE AFIRMA AQUI É SILHUETA, NÃO BELEZA. Beleza é a foto, e quem
// julga é o humano. O que a máquina sabe dizer sozinha é: duas classes não têm
// a mesma forma, a espada é comprida no eixo da lâmina, o machado é pesado de
// um lado só, a tocha é fina. Isso reprova a regressão que trouxe a queixa.
import { describe, it, expect } from 'vitest'
import {
  ASSENTOS,
  DURACAO_DO_GOLPE,
  GOLPES,
  INCLINACAO,
  PECAS,
  PECA_DE_BLOCO,
  TIERS,
  assentoDe,
  golpeDe,
  maoDoItem,
  pecaDe,
  tamanhoDaPeca,
  tierDe,
} from '../../src/servicos/pecaNaMao.js'
import { FIM_DO_RECUO, recuoDeGolpe } from '../../src/servicos/anim.js'
import { toolOf } from '../../src/servicos/items.js'

/** A caixa envolvente da peça, em unidades do viewmodel. */
const envolvente = (classe) => {
  const cx = PECAS[classe]
  const eixo = (k, tam) => {
    let min = Infinity
    let max = -Infinity
    for (const c of cx) {
      min = Math.min(min, c[k] - c[tam] / 2)
      max = Math.max(max, c[k] + c[tam] / 2)
    }
    return { min, max, tam: max - min }
  }
  return { x: eixo('x', 'w'), y: eixo('y', 'h'), z: eixo('z', 'd') }
}

const CLASSES_DE_FERRAMENTA = ['pickaxe', 'axe', 'shovel', 'sword', 'hoe', 'shears']

describe('toda classe tem peça e assento', () => {
  it('as seis classes de ferramenta de items.js têm desenho', () => {
    // ⚠️ ÂNCORA NA FONTE. Sem isto, apagar uma classe da tabela deixaria o
    // teste verde sobre uma espada que voltou a ser picareta.
    for (const c of CLASSES_DE_FERRAMENTA) {
      expect(pecaDe(c), `classe sem peça: ${c}`).toBeTruthy()
      expect(tamanhoDaPeca(c), `peça vazia: ${c}`).toBeGreaterThan(1)
    }
  })

  it('a tocha e o isqueiro também', () => {
    expect(tamanhoDaPeca('torch')).toBeGreaterThan(1)
    expect(tamanhoDaPeca('igniter')).toBeGreaterThan(1)
  })

  it('toda peça tem assento próprio, e nenhum assento é do tamanho zero', () => {
    for (const classe of Object.keys(PECAS)) {
      expect(ASSENTOS[classe], `assento faltando: ${classe}`).toBeDefined()
      // A faixa caiu na onda 10 junto com a escala: o desenho extrudado tem
      // 1,0 de altura contra ~0,5 das caixas à mão que ele substituiu.
      expect(ASSENTOS[classe].escala).toBeGreaterThan(0.1)
      expect(ASSENTOS[classe].escala).toBeLessThan(0.6)
    }
  })

  it('classe desconhecida cai na picareta em vez de sumir', () => {
    expect(pecaDe('flauta')).toBeNull()
    expect(assentoDe('flauta')).toEqual(ASSENTOS.pickaxe)
  })
})

describe('duas classes não têm a mesma silhueta', () => {
  it('nenhuma peça é igual a outra', () => {
    // O defeito literal que trouxe a queixa: uma geometria servindo seis
    // classes. Se alguém voltar a apontar duas classes para o mesmo desenho,
    // isto reprova.
    const vistas = new Map()
    for (const [classe, cx] of Object.entries(PECAS)) {
      const assinatura = JSON.stringify(cx)
      expect(vistas.has(assinatura), `${classe} desenha igual a ${vistas.get(assinatura)}`).toBe(
        false,
      )
      vistas.set(assinatura, classe)
    }
  })

  it('a espada é comprida no eixo da lâmina e fina de lado', () => {
    const e = envolvente('sword')
    expect(e.y.tam, 'espada curta demais para ler como espada').toBeGreaterThan(0.45)
    // Fina: a lâmina tem que ser mais estreita em profundidade que em largura,
    // senão ela lê como barra e não como lâmina.
    expect(e.z.tam).toBeLessThan(e.x.tam)
  })

  it('o machado é pesado de UM lado só', () => {
    // A assimetria é a classe inteira. Um machado simétrico é uma picareta.
    const e = envolvente('axe')
    expect(e.x.max, 'a massa do machado não está fora do cabo').toBeGreaterThan(0.1)
    expect(Math.abs(e.x.min), 'o machado tem massa dos dois lados: virou picareta').toBeLessThan(
      e.x.max / 2,
    )
  })

  it('a picareta é simétrica — é o contraste que faz o machado ler', () => {
    const e = envolvente('pickaxe')
    expect(Math.abs(e.x.min + e.x.max), 'a picareta perdeu a simetria').toBeLessThan(0.02)
  })

  it('a pá é uma chapa larga e chata', () => {
    const chapa = PECAS.shovel.find((c) => c.papel === 'metal' && c.h > 0.08)
    expect(chapa, 'a pá não tem chapa').toBeTruthy()
    expect(chapa.w, 'a chapa da pá é estreita demais').toBeGreaterThan(0.08)
    expect(chapa.d, 'a chapa da pá é grossa demais para ler como chapa').toBeLessThan(0.04)
  })

  it('a enxada tem a barra ATRAVESSADA, e a pá não', () => {
    const atravessa = (classe) => envolvente(classe).x.tam
    expect(atravessa('hoe')).toBeGreaterThan(atravessa('shovel'))
  })

  it('a tocha é uma haste fina com chama, e não um cubo', () => {
    // ⚠️ A AFIRMAÇÃO EXATA DA QUEIXA. Um cubo tem os três eixos iguais; a
    // tocha tem que ser muito mais alta que larga.
    const e = envolvente('torch')
    expect(e.y.tam / e.x.tam, 'a tocha está cúbica outra vez').toBeGreaterThan(3)
    expect(
      PECAS.torch.some((c) => c.papel === 'chama'),
      'a tocha não tem chama',
    ).toBe(true)
  })

  it('a tesoura cruza duas lâminas', () => {
    const laminas = PECAS.shears.filter((c) => c.papel === 'metal' && c.h > 0.15)
    expect(laminas.length).toBe(2)
    // Cruzadas: as duas inclinadas em sentidos opostos.
    expect(laminas[0].rz * laminas[1].rz, 'as lâminas não se cruzam').toBeLessThan(0)
  })
})

describe('o golpe muda com a classe', () => {
  it('a espada é mais rápida que o machado, e o machado desce mais', () => {
    // A segunda metade da queixa: era um arco só, na mesma amplitude, para
    // tudo. A diferença entre as duas classes é o que se sente como peso.
    expect(GOLPES.sword.velocidade).toBeGreaterThan(GOLPES.axe.velocidade)
    expect(GOLPES.axe.rx, 'o machado não cai mais que a espada').toBeGreaterThan(GOLPES.sword.rx)
    expect(GOLPES.sword.rz, 'a espada não atravessa mais que o machado').toBeGreaterThan(
      GOLPES.axe.rz,
    )
  })

  it('o machado tem recuo e a picareta não', () => {
    expect(GOLPES.axe.recuo).toBeGreaterThan(0.2)
    expect(GOLPES.padrao.recuo, 'a picareta ganhou recuo: o que já estava calibrado mudou').toBe(0)
  })

  it('cavar GANHA da classe', () => {
    // Segurar o botão numa pedra é o mesmo gesto com qualquer ferramenta. Um
    // machado "caindo" em loop a cada 0,24 s lê como falha de animação.
    expect(golpeDe('axe', 'dig')).toBe(GOLPES.cavar)
    expect(golpeDe('sword', 'dig')).toBe(GOLPES.cavar)
    expect(golpeDe('axe', 'hit')).toBe(GOLPES.axe)
  })

  it('classe sem golpe próprio usa o padrão', () => {
    expect(golpeDe('torch', 'hit')).toBe(GOLPES.padrao)
    expect(golpeDe(null, 'hit')).toBe(GOLPES.padrao)
    expect(GOLPES.padrao).toMatchObject({ rx: 0.8, ry: 0.3, rz: 0.26 })
  })

  //
  // A DURAÇÃO DO GOLPE — onda 10.
  //
  // ⚠️ ESTE BLOCO SUBSTITUI UMA TRAVA QUE ESTAVA ERRADA. A versão anterior
  // cravava `velocidade: 5.4` com o comentário "é o que o viewmodel tinha
  // cravado: se alguém mexer sem pedido, uma classe muda de sensação". A trava
  // funcionou — ela reprovou esta mudança — mas ela guardava o número ERRADO:
  // 5,4 ciclos por segundo é 0,185 s, e a duração canônica de um golpe no jogo
  // original é 0,3 s (`minecraft:swing_duration`, padrão 0.30000001192092896).
  // Travar o valor de casa em vez do valor de referência é como um check passa
  // sete meses defendendo um defeito.
  //
  it('o golpe padrão dura o CANÔNICO — 0,3 s, não a metade', () => {
    expect(DURACAO_DO_GOLPE).toBe(0.3)
    expect(1 / GOLPES.padrao.velocidade).toBeCloseTo(DURACAO_DO_GOLPE, 5)
  })

  it('nenhuma classe golpeia em menos da metade do canônico', () => {
    // 0,135 s (a espada de antes) são oito quadros a 60 Hz: não lê como golpe.
    const rapidas = Object.entries(GOLPES).filter(
      ([, g]) => 1 / g.velocidade < DURACAO_DO_GOLPE * 0.7,
    )
    expect(rapidas.map(([k, g]) => `${k}=${(1 / g.velocidade).toFixed(3)}s`)).toEqual([])
  })

  it('as classes continuam tendo PESO diferente, em volta do canônico', () => {
    // Ancorar todo mundo em 0,3 s exato mataria a diferença entre machado e
    // espada, que é o que a onda 1 entregou e o founder não pediu para desfazer.
    const dur = (k) => 1 / GOLPES[k].velocidade
    expect(dur('axe')).toBeGreaterThan(DURACAO_DO_GOLPE)
    expect(dur('sword')).toBeLessThan(DURACAO_DO_GOLPE)
    expect(dur('axe')).toBeGreaterThan(dur('sword'))
  })

  it('todas as ferramentas partilham a MESMA inclinação de assento', () => {
    // ⚠️ O NÚMERO BRUTO NÃO SE COMPARA COM REFERÊNCIA NENHUMA: a peça herda a
    // rotação do braço e a torção antes de chegar ao olho. Quem se compara com
    // a foto do founder é o ângulo NA TELA, e ele está travado em
    // `silhuetaDaMao.spec.js`. Aqui só se cobra que a tabela não volte a ter um
    // ângulo diferente por classe, que era o estado antes da onda 10.
    for (const classe of ['pickaxe', 'axe', 'shovel', 'sword', 'hoe', 'shears']) {
      expect(Math.abs(assentoDe(classe).rz), `${classe} fora da inclinação`).toBeCloseTo(
        INCLINACAO,
        6,
      )
    }
  })

  it('a tocha fica FORA da inclinação, e isso é de propósito', () => {
    // Uma tocha na diagonal derrama a chama para o lado.
    expect(Math.abs(assentoDe('torch').rz)).toBeLessThan(INCLINACAO / 2)
  })
})

describe('a curva do recuo', () => {
  it('sobe e volta dentro do começo do ciclo, e some depois', () => {
    expect(recuoDeGolpe(0)).toBeCloseTo(0, 10)
    expect(recuoDeGolpe(FIM_DO_RECUO / 2)).toBeCloseTo(1, 10)
    expect(recuoDeGolpe(FIM_DO_RECUO)).toBe(0)
    expect(recuoDeGolpe(0.5)).toBe(0)
    expect(recuoDeGolpe(1)).toBe(0)
  })

  it('NaN vira zero, e não um braço que some', () => {
    // A mesma armadilha que `clamp01` já guarda para as outras curvas:
    // `rotation.x = NaN` faz o three descartar a matriz e o braço SOME, calado.
    expect(recuoDeGolpe(NaN)).toBe(0)
    expect(recuoDeGolpe(-1)).toBe(0)
  })
})

describe('que peça cada item vira', () => {
  it('a espada de ferro vira peça de espada, tier iron', () => {
    expect(maoDoItem('iron_sword', toolOf('iron_sword'))).toEqual({
      kind: 'peca',
      classe: 'sword',
      tier: 'iron',
    })
  })

  it('cada classe de ferramenta chega com a SUA classe', () => {
    // ⚠️ O DEFEITO ERA AQUI. O componente mandava só o tier e descartava
    // `tool.kind`, e o viewmodel desenhava picareta para tudo.
    const vistos = new Set()
    for (const chave of ['wood_pickaxe', 'iron_axe', 'stone_shovel', 'diamond_sword', 'wood_hoe']) {
      const m = maoDoItem(chave, toolOf(chave))
      expect(m, `item sem peça: ${chave}`).toBeTruthy()
      vistos.add(m.classe)
    }
    expect(vistos.size, 'duas ferramentas diferentes viraram a mesma classe').toBe(5)
  })

  it('a tocha vira peça, e não cubo', () => {
    expect(maoDoItem('torch', null, 'torch')).toEqual({
      kind: 'peca',
      classe: 'torch',
      tier: 'wood',
    })
    expect(PECA_DE_BLOCO.torch).toBe('torch')
  })

  it('bloco comum continua sendo cubo', () => {
    expect(maoDoItem('stone', null, 'stone')).toBeNull()
    expect(maoDoItem('dirt', null, 'dirt')).toBeNull()
  })

  it('item que não é nada devolve null', () => {
    expect(maoDoItem('bread', null, null)).toBeNull()
  })
})

describe('o tier sai do número, não de quebrar a string', () => {
  it('usa tool.tier quando ele existe', () => {
    // O componente fazia `'iron_sword'.split('_')[0]`. Funciona enquanto todo
    // item se chamar `<tier>_<classe>`, e falha calado no dia em que um não se
    // chamar — que é o pior jeito de falhar.
    for (const [chave, esperado] of [
      ['wood_pickaxe', 'wood'],
      ['stone_axe', 'stone'],
      ['iron_shovel', 'iron'],
      ['diamond_sword', 'diamond'],
    ]) {
      expect(tierDe(chave, toolOf(chave)), chave).toBe(esperado)
    }
  })

  it('item de ferramenta com nome fora do padrão não vira madeira por engano', () => {
    // `shears` não se chama `<tier>_shears`, e tem tier 1.
    expect(tierDe('shears', toolOf('shears'))).toBe(TIERS[toolOf('shears').tier])
  })

  it('sem tool e sem prefixo conhecido, cai em madeira', () => {
    expect(tierDe('flauta', null)).toBe('wood')
    expect(tierDe(null, null)).toBe('wood')
  })
})
