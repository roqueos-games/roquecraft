//
// O CASTELO GÓTICO.
//
// ⚠️ A PRIMEIRA VERSÃO PASSAVA NESTES TESTES E O FOUNDER CHAMOU DE "EXTREMAMENTE
// SIMPLÓRIO". Ele estava certo, e o diagnóstico é preciso: aquilo tinha a PLANTA
// de um castelo — muralha, torre, portão, menagem — e nenhuma das coisas que
// fazem o olho dizer "castelo gótico". Planta certa e leitura errada passam
// juntas, que é o mesmo defeito da casa-caixa da vila.
//
// Por isso os testes daqui cobram as TRÊS coisas que fazem o gótico, e não a
// presença das peças: verticalidade (a hierarquia de alturas), o arco ogival
// (que é a assinatura) e o contraforte (a nervura que tira o muro da condição de
// superfície plana).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  CELULA_DO_CASTELO,
  MURALHA,
  ALTO_DA_MURALHA,
  TORRE,
  ALTO_DA_TORRE,
  AGULHA,
  SALAO,
  ALTO_DO_SALAO,
  CRUZEIRO,
  ALTO_DO_CRUZEIRO,
  PORTARIA,
  PORTAO,
  RAIO_DO_CASTELO,
  ALTURA_DO_CASTELO,
  DESNIVEL_DO_CASTELO,
  ALTO_DA_ESCADA,
  agulha,
  arcoOgival,
  blocoDoCastelo,
  blocoIntegro,
  degrausDaEspiral,
  centroDoCastelo,
  colunaDoCastelo,
  planoDoCastelo,
} from '../../src/servicos/castelo.js'
import { RAIO_ESCRITO, centroDaCelula } from '../../src/servicos/aldeia.js'
import { ID, BLOCKS } from '../../src/servicos/blocks.js'
import { AR } from '../../src/servicos/vilaCasa.js'

const hash = (a, b, c) => {
  let h = (a * 374761393 + b * 668265263 + c * 2246822519) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
const planicie = { alturaEm: () => 70, nivelDoMar: 62 }
const CHAO = 70

/**
 * Acha uma célula com castelo do tipo pedido.
 *
 * ⚠️ O `ruina` IMPORTA. Uma versão anterior pegava o primeiro castelo que
 * achasse, e quando a ruína entrou ela devolveu um erodido: a catraca caiu e
 * reprovou uma entrega certa. Forma se cobra no castelo INTEIRO.
 */
const acharPlano = (ruina) => {
  for (let g = 0; g < 400; g++) {
    const p = planoDoCastelo(hash, planicie, g * CELULA_DO_CASTELO, 0)
    if (p && p.ruina === ruina) return p
  }
  return null
}
const plano = acharPlano(false)
const arruinado = acharPlano(true)
const inteiro = (dx, dy, dz) =>
  blocoIntegro(plano, plano.centro.x + dx, CHAO + dy, plano.centro.z + dz)

describe('as peças do gótico', () => {
  describe('o arco ogival', () => {
    it('abre reto, ESTREITA subindo e fecha em ponta', () => {
      // ⚠️ É A ASSINATURA, e é o que distingue gótico de românico. Um vão
      // retangular na pedra lê como parede quebrada; o que faz o olho ler
      // "porta" é o vão que se estreita até um ponto.
      const larguraEm = (dy) => {
        let n = 0
        for (let a = -6; a <= 6; a++) if (arcoOgival(a, dy, 2, 4, AR) === AR) n++
        return n
      }
      expect(larguraEm(1), 'a base do vão').toBe(5)
      expect(larguraEm(4), 'ainda reto no topo da ombreira').toBe(5)
      expect(larguraEm(5)).toBeLessThan(5)
      expect(larguraEm(6)).toBeLessThan(larguraEm(5))
    })

    it('a chave é bloco CHEIO, e não duas escadas de ponta', () => {
      // Duas escadas encostadas de ponta deixam um sulco no ápice, e sulco no
      // ápice é goteira.
      expect(arcoOgival(0, 7, 2, 4, AR)).toBe(ID.stoneBricks)
      expect(arcoOgival(1, 7, 2, 4, AR)).toBeNull()
    })

    it('as quinas do arco são ESCADA, apontando para fora do vão', () => {
      const esq = BLOCKS[arcoOgival(-2, 5, 2, 4, AR)]
      const dir = BLOCKS[arcoOgival(2, 5, 2, 4, AR)]
      expect(esq?.escada, 'a quina esquerda não é escada').toBeTruthy()
      expect(dir?.escada, 'a quina direita não é escada').toBeTruthy()
      expect(ALTO_DA_ESCADA[esq.escada.orient]).toBe('nx')
      expect(ALTO_DA_ESCADA[dir.escada.orient]).toBe('px')
    })

    it('e o vão pode ser de VIDRO: é a mesma peça que faz o janelão', () => {
      expect(arcoOgival(0, 1, 0, 6, ID.glass)).toBe(ID.glass)
    })
  })

  describe('a agulha', () => {
    it('afina a cada fiada e termina em UM bloco', () => {
      // ⚠️ Torre de topo chato lê como silo: o telhado plano diz "isto acabou
      // aqui", e a agulha diz "isto aponta". É a diferença entre altura e
      // verticalidade.
      const larguraEm = (dyTopo) => {
        let n = 0
        for (let dx = -5; dx <= 5; dx++) if (agulha(dx, 0, dyTopo, 3) !== null) n++
        return n
      }
      expect(larguraEm(0)).toBe(7)
      expect(larguraEm(1)).toBe(5)
      expect(larguraEm(2)).toBe(3)
      expect(larguraEm(3)).toBe(1)
      expect(agulha(0, 0, 3, 3)).toBe(ID.stone)
      expect(agulha(0, 0, 4, 3), 'a agulha não terminou').toBeNull()
    })

    it('é OCA: agulha maciça é um monte de pedra', () => {
      expect(agulha(0, 0, 0, 3)).toBe(AR)
    })
  })
})

describe('onde o castelo cabe', () => {
  it('a mesma célula dá SEMPRE o mesmo centro — o vizinho concorda', () => {
    const a = centroDoCastelo(hash, 5, 7)
    expect(a).toEqual(centroDoCastelo(hash, 5, 7 + 1))
    expect(centroDoCastelo(hash, 5 + CELULA_DO_CASTELO, 7)).not.toEqual(a)
  })

  it('NEM TODA CÉLULA TEM, e isso é o oposto da vila de propósito', () => {
    let tem = 0
    for (let g = 0; g < 80; g++) {
      if (planoDoCastelo(hash, planicie, g * CELULA_DO_CASTELO, 0)) tem++
    }
    expect(tem, 'castelo em toda célula é cenário de parque').toBeLessThan(80)
    expect(tem, 'castelo em nenhuma célula').toBeGreaterThan(0)
  })

  it('e ele NÃO CAI EM CIMA DE UMA ALDEIA', () => {
    // ⚠️ Grade independente só garante que duas do MESMO tipo não se encostam.
    // As células das duas não se alinham, então o quadrado do castelo pode cair
    // sobre a aldeia de qualquer uma das quatro células de aldeia que ele toca.
    for (let g = 0; g < 120; g++) {
      const p = planoDoCastelo(hash, planicie, g * CELULA_DO_CASTELO, g * CELULA_DO_CASTELO)
      if (!p) continue
      const meio = RAIO_DO_CASTELO + RAIO_ESCRITO
      for (const dx of [-RAIO_DO_CASTELO, RAIO_DO_CASTELO]) {
        for (const dz of [-RAIO_DO_CASTELO, RAIO_DO_CASTELO]) {
          const vila = centroDaCelula(
            hash,
            Math.floor((p.centro.x + dx) / 16),
            Math.floor((p.centro.z + dz) / 16),
          )
          const bate =
            Math.abs(vila.x - p.centro.x) <= meio && Math.abs(vila.z - p.centro.z) <= meio
          expect(bate, `castelo ${g} em cima de aldeia`).toBe(false)
        }
      }
    }
  })

  it('tolera mais barranco que a vila — ele tem embasamento', () => {
    expect(DESNIVEL_DO_CASTELO).toBeGreaterThan(3)
  })

  it('com o pé na água, recusa', () => {
    const mar = { alturaEm: () => 60, nivelDoMar: 62 }
    for (let g = 0; g < 40; g++) {
      expect(planoDoCastelo(hash, mar, g * CELULA_DO_CASTELO, 0)).toBeNull()
    }
  })
})

describe('a VERTICALIDADE', () => {
  it('a hierarquia tem TRÊS degraus, e cada um se vê de longe', () => {
    // ⚠️ A primeira tentativa foi 6/11/13 e as torres sumiam contra o muro; a
    // segunda, 7/12/16, ainda era a silhueta de um forte: baixo e largo. O que
    // se busca não é altura, é PROPORÇÃO.
    expect(ALTO_DA_TORRE, 'torre rasteira demais sobre o muro').toBeGreaterThan(ALTO_DA_MURALHA * 2)
    expect(ALTO_DO_CRUZEIRO, 'a torre da cruz não domina as de quina').toBeGreaterThan(
      ALTO_DA_TORRE + 6,
    )
  })

  it('e a coisa mais alta do castelo é a agulha da torre da cruz', () => {
    const altoEm = (dx, dz) => {
      let alto = -1
      for (let dy = 0; dy <= ALTURA_DO_CASTELO; dy++) if (inteiro(dx, dy, dz) !== null) alto = dy
      return alto
    }
    const cruz = altoEm(0, SALAO.z)
    expect(cruz).toBe(ALTURA_DO_CASTELO)
    expect(cruz).toBeGreaterThan(altoEm(MURALHA - 1, MURALHA - 1))
    expect(cruz).toBeGreaterThan(altoEm(PORTARIA.dx, -MURALHA))
  })

  it('toda torre termina em AGULHA, e nenhuma em topo chato', () => {
    for (const [dx, dz, alto, meia] of [
      [MURALHA - 1, MURALHA - 1, ALTO_DA_TORRE, TORRE],
      [PORTARIA.dx, -MURALHA, PORTARIA.alto, PORTARIA.lado],
      [0, SALAO.z, ALTO_DO_CRUZEIRO, CRUZEIRO],
    ]) {
      expect(inteiro(dx, alto + 1 + meia, dz), `a torre em ${dx},${dz} tem topo chato`).toBe(
        ID.stone,
      )
      expect(inteiro(dx, alto + 1 + meia + 1, dz), 'a agulha não terminou').toBeNull()
    }
    expect(AGULHA).toBeGreaterThan(CRUZEIRO)
  })
})

describe('o CONTRAFORTE', () => {
  it('a muralha tem nervura, e ela avança para FORA', () => {
    // ⚠️ É O DETALHE QUE SE LÊ DE LONGE. Uma parede de pedra lisa de trinta e
    // sete blocos é uma superfície; as nervuras a cada seis põem sombra vertical
    // nela e ela vira estrutura.
    expect(inteiro(MURALHA + 1, 3, 0), 'sem contraforte no múltiplo de seis').not.toBeNull()
    expect(inteiro(MURALHA + 1, 3, 1), 'contraforte em toda coluna: virou muro grosso').toBeNull()
  })

  it('e ela MORRE na parede em vez de ser cortada a faca', () => {
    const def = BLOCKS[inteiro(MURALHA + 1, ALTO_DA_MURALHA - 2, 0)]
    expect(def?.escada, 'o topo do contraforte não é escada').toBeTruthy()
    expect(def.escada.topo, 'escada de base no topo do contraforte pende ao contrário').toBe(true)
  })

  it('o salão também tem, e no eixo dele', () => {
    expect(inteiro(SALAO.lx + 1, 3, SALAO.z), 'salão sem contraforte').not.toBeNull()
  })
})

describe('a muralha e o adarve', () => {
  it('fecha os quatro lados', () => {
    for (const [dx, dz] of [
      [MURALHA, 0],
      [-MURALHA, 0],
      [0, MURALHA],
    ]) {
      expect(inteiro(dx, 4, dz), `muralha aberta em ${dx},${dz}`).not.toBeNull()
    }
  })

  it('TEM AMEIA no topo, uma sim uma não', () => {
    const topo = []
    for (let dz = -MURALHA + 6; dz <= MURALHA - 6; dz++)
      topo.push(inteiro(MURALHA, ALTO_DA_MURALHA, dz))
    expect(new Set(topo).size, 'o topo saiu todo igual: não é ameia').toBe(2)
    expect(topo).toContain(AR)
  })

  it('tem EMBASAMENTO de pedra bruta: o pé do muro pesa', () => {
    // ⚠️ Castelo inteiro de um cinza só lê como maquete: contraforte, muralha,
    // telhado e agulha com o mesmo tom não se separam a distância nenhuma.
    expect(inteiro(MURALHA, 1, 0)).toBe(ID.cobblestone)
    expect(inteiro(MURALHA, 5, 0)).toBe(ID.stoneBricks)
  })

  it('tem ADARVE, e uma ESCADA para chegar nele', () => {
    // ⚠️ Muralha sem acesso é cenografia: o jogador olha para cima, vê o caminho
    // de ronda e entende que aquilo não é para ele.
    expect(inteiro(MURALHA - 1, ALTO_DA_MURALHA - 1, 0)).not.toBeNull()
    let degraus = 0
    for (let dy = 1; dy <= ALTO_DA_MURALHA; dy++) {
      for (let dz = -MURALHA; dz <= MURALHA; dz++) {
        if (BLOCKS[inteiro(MURALHA - 2, dy, dz)]?.escada) degraus++
      }
    }
    expect(degraus, 'não há como subir na muralha').toBeGreaterThan(4)
  })
})

describe('a portaria', () => {
  it('o portão é um VÃO que o jogador atravessa', () => {
    expect(inteiro(0, 1, -MURALHA)).toBe(AR)
    expect(inteiro(0, 4, -MURALHA)).toBe(AR)
  })

  it('e ele é OGIVAL, com as quinas em escada', () => {
    let quinas = 0
    for (let dy = 7; dy <= 10; dy++) {
      for (const dx of [-PORTAO, PORTAO, -1, 1]) {
        if (BLOCKS[inteiro(dx, dy, -MURALHA)]?.escada) quinas++
      }
    }
    expect(quinas, 'o arco do portão é um buraco quadrado').toBeGreaterThan(2)
  })

  it('a PORTARIA sobe acima do muro — senão a ogiva nasce decapitada', () => {
    // ⚠️ Com o arco chegando a nove e o muro em oito, o ápice ficava cortado
    // pelo parapeito: o vão abria um buraco no alto da muralha em vez de
    // terminar em ponta. A portaria é um edifício, não um trecho de muro.
    const altoDoVao = (() => {
      for (let dy = ALTURA_DO_CASTELO; dy > 0; dy--) if (inteiro(0, dy, -MURALHA) === AR) return dy
      return 0
    })()
    expect(altoDoVao).toBeLessThan(ALTO_DA_MURALHA + 4)
  })

  it('tem DUAS torres ladeando, e elas passam do muro', () => {
    // Portão sozinho num muro é um buraco. O que faz ler "entrada defendida"
    // são as duas torres que o apertam.
    for (const s of [-1, 1]) {
      expect(inteiro(s * PORTARIA.dx, PORTARIA.alto, -MURALHA), `torre ${s}`).not.toBeNull()
    }
    expect(PORTARIA.alto).toBeGreaterThan(ALTO_DA_MURALHA)
  })

  it('e RASTRILHO no vão: grade, não porta de madeira', () => {
    let grade = 0
    for (let dx = -PORTAO; dx <= PORTAO; dx++) {
      if (BLOCKS[inteiro(dx, 9, -MURALHA)]?.cerca) grade++
    }
    expect(grade, 'sem rastrilho').toBeGreaterThan(2)
  })
})

describe('o grande salão', () => {
  it('tem telhado de duas águas, e ele é de pedra BRUTA', () => {
    // ⚠️ LONGE DO EIXO DA TORRE DA CRUZ. No meio do salão quem responde é o
    // cruzeiro, que atravessa o telhado — a primeira versão deste teste mediu a
    // cumeeira em ez=0 e achou o vazio de dentro da torre.
    const ez = SALAO.lz - 1
    const cume = inteiro(0, ALTO_DO_SALAO + 1 + SALAO.lx + 1, SALAO.z + ez)
    expect(cume).toBe(ID.cobblestone)
    const agua = BLOCKS[inteiro(2, ALTO_DO_SALAO + 1 + SALAO.lx - 1, SALAO.z + ez)]
    expect(agua?.escada, 'a água do telhado não é escada').toBeTruthy()
  })

  it('tem JANELÃO em ogiva, de vidro', () => {
    let vidros = 0
    for (let dy = 1; dy <= ALTO_DO_SALAO; dy++) {
      for (let dz = -SALAO.lz; dz <= SALAO.lz; dz++) {
        if (inteiro(SALAO.lx, dy, SALAO.z + dz) === ID.glass) vidros++
      }
    }
    expect(vidros, 'salão sem janela é galpão').toBeGreaterThan(4)
  })

  it('e a ROSÁCEA na empena — o único ponto de cor do castelo', () => {
    // ⚠️ O castelo inteiro é pedra cinza, e um ponto de cor numa fachada cinza
    // vale mais que cinco detalhes cinzas.
    let cor = 0
    for (let dx = -3; dx <= 3; dx++) {
      for (let dy = ALTO_DO_SALAO; dy <= ALTO_DO_SALAO + 7; dy++) {
        if (inteiro(dx, dy, SALAO.z + SALAO.lz) === ID.redWool) cor++
      }
    }
    expect(cor, 'sem rosácea').toBeGreaterThan(3)
  })
})

describe('a torre da cruz', () => {
  it('TEM COMO SUBIR, e cada degrau aponta para onde se sobe', () => {
    // ⚠️ É o que separa escada de enfeite. Subindo, o jogador pisa na metade
    // BAIXA do degrau seguinte vindo da metade ALTA do anterior — dois passos de
    // meio bloco. Virado ao contrário viram um de um bloco inteiro, que exige
    // pulo: a torre continua bonita e deixa de ter como subir.
    const degraus = degrausDaEspiral()
    expect(degraus.length).toBeGreaterThan(12)
    for (const d of degraus) {
      expect(ALTO_DA_ESCADA[d.orient], `degrau em dy=${d.dy} virado ao contrário`).toBe(d.ruma)
    }
    expect(new Set(degraus.map((d) => d.ruma)).size, 'a espiral não dá a volta').toBe(4)
  })

  it('e o BAÚ no alto — é o que paga a subida', () => {
    let achou = false
    for (let dx = -CRUZEIRO; dx <= CRUZEIRO; dx++) {
      for (let dz = -CRUZEIRO; dz <= CRUZEIRO; dz++) {
        for (let dy = 1; dy < ALTO_DO_CRUZEIRO; dy++) {
          if (inteiro(dx, dy, SALAO.z + dz) === ID.chest) achou = true
        }
      }
    }
    expect(achou, 'subir vinte e oito blocos e não achar nada é pior que não ter torre').toBe(true)
  })
})

describe('a coluna do castelo', () => {
  it('PREENCHE abaixo do chão — muralha em barranco não fica de pernas para o ar', () => {
    const col = colunaDoCastelo(plano, plano.centro.x + MURALHA, plano.centro.z, () => CHAO - 3)
    const abaixo = col.filter((e) => e.y < CHAO)
    expect(abaixo.length).toBe(3)
  })

  it('LIMPA até o topo, para a copa não atravessar a agulha', () => {
    const col = colunaDoCastelo(plano, plano.centro.x + MURALHA, plano.centro.z)
    expect(col.at(-1).y).toBe(CHAO + ALTURA_DO_CASTELO)
  })

  it('tem TERREIRO, e ele APLAINA como o da vila', () => {
    // ⚠️ Devolver lista vazia deixava o terreno como estava, e uma lomba
    // encostada na muralha corta a torre pela metade exatamente como cortava a
    // casa da vila. É o mesmo defeito, e o founder o viu na vila primeiro.
    const x = plano.centro.x + RAIO_DO_CASTELO + 2
    const morro = colunaDoCastelo(plano, x, plano.centro.z, () => CHAO + 4)
    expect(
      morro.filter((e) => e.y > CHAO).every((e) => e.id === AR),
      'a lomba ficou',
    ).toBe(true)
    expect(BLOCKS[morro.find((e) => e.y === CHAO).id]?.key).toBe('grassBlock')
    expect(colunaDoCastelo(plano, plano.centro.x + RAIO_DO_CASTELO + 9, plano.centro.z)).toBeNull()
  })
})

describe('a ruína', () => {
  // ⚠️ ELA É O MESMO CASTELO ERODIDO, e isso é decisão de engenharia e não de
  // estilo: um gerador próprio teria a própria muralha e o próprio portão, e as
  // duas versões divergiriam na primeira mudança em uma delas. É também o que
  // faz a ruína ser LIDA como ruína: quem já viu o castelo inteiro reconhece a
  // mesma planta faltando pedaços.
  const contar = (p) => {
    let solidos = 0
    const tipos = new Set()
    const R = RAIO_DO_CASTELO + 3
    for (let x = p.centro.x - R; x <= p.centro.x + R; x++) {
      for (let z = p.centro.z - R; z <= p.centro.z + R; z++) {
        for (const e of colunaDoCastelo(p, x, z) ?? []) {
          if (e.id === 0) continue
          solidos++
          tipos.add(e.id)
        }
      }
    }
    return { solidos, tipos }
  }

  it('existe, e não é todo castelo nem nenhum', () => {
    expect(arruinado, 'nenhum castelo em ruína em 400 células').not.toBeNull()
    let ruinas = 0
    let inteiros = 0
    for (let g = 0; g < 200; g++) {
      const p = planoDoCastelo(hash, planicie, g * CELULA_DO_CASTELO, 0)
      if (!p) continue
      if (p.ruina) ruinas++
      else inteiros++
    }
    expect(ruinas).toBeGreaterThan(0)
    expect(inteiros, 'todo castelo virou ruína: some o que dá sentido à ruína').toBeGreaterThan(0)
  })

  it('PERDE pedra, e a perda fica na FAIXA que o manifesto escreve', () => {
    // ⚠️ FAIXA E NÃO PISO. A ruína perde blocos por definição, então uma catraca
    // "só sobe" empurraria a erosão para baixo a cada rodada até ela sumir.
    const manifesto = JSON.parse(readFileSync(resolve('test/inventario-da-vila.json'), 'utf8'))
      .castelo.ruina
    const [min, max] = manifesto.faixaDePerda
    const perda = 1 - contar(arruinado).solidos / contar(plano).solidos
    expect(perda, `perdeu só ${(perda * 100).toFixed(1)}%: castelo sujo`).toBeGreaterThan(min)
    expect(perda, `perdeu ${(perda * 100).toFixed(1)}%: isso é entulho`).toBeLessThan(max)
    expect(manifesto._porque.length, 'faixa sem motivo é número solto').toBeGreaterThan(80)
  })

  it('ganha MUSGO — pedra limpa não é pedra velha', () => {
    expect([...contar(arruinado).tipos], 'a ruína saiu sem musgo').toContain(ID.mossyCobblestone)
    expect([...contar(plano).tipos], 'o castelo inteiro nasceu mofado').not.toContain(
      ID.mossyCobblestone,
    )
  })

  it('a erosão SOBE com a altura — o topo desmancha, a base fica', () => {
    // ⚠️ E A AMOSTRA É O CASTELO INTEIRO, não uma linha de muralha: 29 amostras
    // deram 0,24 nas duas alturas e empataram tudo. Instrumento com amostra
    // pequena não separa nada.
    const faltaNaFaixa = (de, ate) => {
      let total = 0
      let vazio = 0
      for (let dy = de; dy <= ate; dy++) {
        for (let dx = -MURALHA; dx <= MURALHA; dx++) {
          for (let dz = -MURALHA; dz <= MURALHA; dz++) {
            const cru = blocoIntegro(
              arruinado,
              arruinado.centro.x + dx,
              arruinado.chao + dy,
              arruinado.centro.z + dz,
            )
            if (cru === null || cru === AR) continue
            total++
            const id = blocoDoCastelo(
              arruinado,
              arruinado.centro.x + dx,
              arruinado.chao + dy,
              arruinado.centro.z + dz,
            )
            if (id === AR || id === null) vazio++
          }
        }
      }
      return { fracao: total ? vazio / total : 0, total }
    }
    const baixo = faltaNaFaixa(1, 4)
    const alto = faltaNaFaixa(ALTO_DO_CRUZEIRO - 4, ALTO_DO_CRUZEIRO)
    expect(baixo.total, 'amostra pequena demais').toBeGreaterThan(100)
    expect(alto.total, 'amostra pequena demais').toBeGreaterThan(20)
    expect(
      alto.fracao,
      `topo ${(alto.fracao * 100).toFixed(0)}% x base ${(baixo.fracao * 100).toFixed(0)}%`,
    ).toBeGreaterThan(baixo.fracao * 1.8)
  })

  it('e o CHÃO fica inteiro mesmo com o topo desmanchado', () => {
    let vazio = 0
    for (let dx = -MURALHA; dx <= MURALHA; dx++) {
      for (let dz = -MURALHA; dz <= MURALHA; dz++) {
        const id = blocoDoCastelo(
          arruinado,
          arruinado.centro.x + dx,
          arruinado.chao,
          arruinado.centro.z + dz,
        )
        if (id === AR) vazio++
      }
    }
    expect(vazio, 'buraco no piso lê como terreno quebrado, não como abandono').toBe(0)
  })

  it('UMA das quatro torres caiu — quatro iguais continuam simétricas', () => {
    const altoDaTorre = (sx, sz) => {
      let alto = 0
      for (let dy = 0; dy <= ALTO_DA_TORRE; dy++) {
        const id = blocoDoCastelo(
          arruinado,
          arruinado.centro.x + sx * (MURALHA - 1),
          arruinado.chao + dy,
          arruinado.centro.z + sz * (MURALHA - 1),
        )
        if (id !== null) alto = dy
      }
      return alto
    }
    const alturas = [altoDaTorre(1, 1), altoDaTorre(1, -1), altoDaTorre(-1, 1), altoDaTorre(-1, -1)]
    const menor = Math.min(...alturas)
    expect(
      Math.max(...alturas) - menor,
      'as quatro na mesma altura: isso é simetria',
    ).toBeGreaterThan(2)
    expect(alturas.filter((a) => a === menor).length, 'mais de uma torre caiu').toBe(1)
  })

  it('e ela deixa o mato chegar: ruína não tem terreiro', () => {
    const fora = RAIO_DO_CASTELO + 2
    expect(colunaDoCastelo(arruinado, arruinado.centro.x + fora, arruinado.centro.z)).toBeNull()
    expect(colunaDoCastelo(plano, plano.centro.x + fora, plano.centro.z)).not.toBeNull()
  })
})
