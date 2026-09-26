import { describe, it, expect } from 'vitest'
import {
  CELULA,
  CASAS,
  CASAS_MINIMAS,
  RAIO_DA_PRACA,
  RAIO,
  DESNIVEL_MAXIMO,
  centroDaCelula,
  dentroDoRaio,
  terrenoPlano,
  planoDaAldeia,
  ehCaminho,
  aldeoesDe,
  colunaDaAldeia,
  dentroDoEscrito,
} from '../../src/servicos/aldeia.js'
import { PLANTAS, BORDA_DA_CASA } from '../../src/servicos/vilaCasa.js'
import { NOMES_DE_PROFISSAO } from '../../src/servicos/comercio.js'

/** Hash determinístico e globalmente puro, como o do worldgen. */
const hash = (a, b, c) => {
  let h = (a * 374761393 + b * 668265263 + c * 2246822519) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
const planicie = (altura = 70) => ({ alturaEm: () => altura, nivelDoMar: 62 })

describe('onde a aldeia cabe', () => {
  it('a mesma célula dá SEMPRE o mesmo centro — o vizinho concorda', () => {
    // ⚠️ É a regra que a cachoeira aprendeu na marra: `runFeatures` roda para os
    // nove chunks vizinhos, e cada um tem que chegar à mesma resposta. Duas
    // colunas da mesma aldeia calculadas de chunks diferentes:
    const a = centroDaCelula(hash, 5, 7)
    const b = centroDaCelula(hash, 5 + CELULA - 1, 7)
    const c = centroDaCelula(hash, 5, 7 + 1)
    expect(a).toEqual(c)
    expect(b).not.toEqual(a) // célula diferente, centro diferente
  })

  it('duas células vizinhas nunca põem aldeias sobrepostas', () => {
    // Sem a grade, sorteio livre põe duas aldeias uma dentro da outra e as casas
    // se atravessam.
    for (let gx = 0; gx < 6; gx++) {
      for (let gz = 0; gz < 6; gz++) {
        const a = centroDaCelula(hash, gx * CELULA, gz * CELULA)
        const b = centroDaCelula(hash, (gx + 1) * CELULA, gz * CELULA)
        const d = Math.hypot(a.x - b.x, a.z - b.z)
        expect(d, `${gx},${gz}`).toBeGreaterThan(RAIO * 2)
      }
    }
  })

  it('o centro fica no miolo da célula, com margem para o raio', () => {
    for (let g = 0; g < 40; g++) {
      const c = centroDaCelula(hash, g * CELULA, 3 * CELULA)
      const x0 = g * CELULA * 16
      expect(c.x - RAIO).toBeGreaterThanOrEqual(x0)
      expect(c.x + RAIO).toBeLessThanOrEqual(x0 + CELULA * 16)
    }
  })

  it('dentroDoRaio fecha o quadrado certo', () => {
    const c = { x: 100, z: 200 }
    expect(dentroDoRaio(c, 100, 200)).toBe(true)
    expect(dentroDoRaio(c, 100 + RAIO, 200)).toBe(true)
    expect(dentroDoRaio(c, 100 + RAIO + 1, 200)).toBe(false)
    expect(dentroDoRaio(c, 100, 200 - RAIO - 1)).toBe(false)
  })
})

describe('o terreno decide', () => {
  const centro = { gx: 0, gz: 0, x: 0, z: 0 }

  it('planície plana aceita, e o chão é o nível medido', () => {
    expect(terrenoPlano(() => 70, centro, 62)).toBe(70)
  })

  it('desnível acima do limite RECUSA', () => {
    // Casa posta num barranco fica metade enterrada e metade no ar.
    const acidentado = (x) => (x < 0 ? 70 : 70 + DESNIVEL_MAXIMO + 1)
    expect(terrenoPlano(acidentado, centro, 62)).toBe(null)
  })

  it('desnível NO limite ainda aceita', () => {
    const suave = (x) => (x < 0 ? 70 : 70 + DESNIVEL_MAXIMO)
    expect(terrenoPlano(suave, centro, 62)).not.toBeNull()
  })

  it('o chão é a MEDIANA, e não mais o ponto mais baixo', () => {
    // ⚠️ A nota antiga defendia o mais baixo dizendo que subir ao mais alto
    // deixaria casas flutuando sobre as depressões — e ela estava certa
    // ENQUANTO a vila não aplainava nada. Agora ela preenche o que está abaixo
    // e corta o que está acima, então o mais baixo só faz o aterro crescer: a
    // vila inteira nasceria sobre um pedestal da altura do buraco mais fundo
    // que ela encostou.
    const quaseTodoEm70 = (x, z) => (x === centro.x && z === centro.z ? 66 : 70)
    expect(terrenoPlano(quaseTodoEm70, centro, 62)).toBe(70)
  })

  it('com o pé na água, recusa', () => {
    expect(terrenoPlano(() => 62, centro, 62)).toBe(null)
    expect(terrenoPlano(() => 50, centro, 62)).toBe(null)
  })

  it('mede em DUAS etapas: a peneira barata e a que vale', () => {
    // ⚠️ A VERSÃO ANTERIOR COBRAVA CINCO PONTOS, e esse teste protegia o defeito
    // que o founder viu na tela: cinco cantos a raio 24 sobre uma vila que
    // escreve até 35 não veem nada ENTRE os cantos, e uma lomba no meio passa
    // inteira. Achamos terreno a +6 do chão declarado sob uma casa, com o
    // desnível máximo escrito em 3.
    //
    // O que precisa ser barato é a RECUSA, não a aceitação: célula de montanha
    // tem que morrer na peneira de nove pontos. Quem passa paga os 49.
    let n = 0
    terrenoPlano(() => (n++, 70), centro, 62)
    expect(n, 'a medição fina não rodou').toBeGreaterThan(40)

    let m = 0
    const encosta = (x) => {
      m++
      return x < centro.x ? 70 : 90
    }
    expect(terrenoPlano(encosta, centro, 62), 'encosta aceita').toBeNull()
    expect(m, 'a encosta pagou a medição fina em vez de morrer na peneira').toBeLessThanOrEqual(9)
  })

  it('e ela cobre a área que a vila ESCREVE, não só onde os centros caem', () => {
    // ⚠️ ESTA LOMBA É INVISÍVEL PARA A REGRA ANTIGA DE PROPÓSITO. Ela só existe
    // ENTRE 26 e o raio escrito — os cinco pontos antigos (centro e os quatro
    // cantos a 24) caem todos em terreno de 70 e diriam "plano". A casa mais
    // afastada nasce a 30 do centro, em cima dela.
    const lomba = (x, z) =>
      Math.max(Math.abs(x - centro.x), Math.abs(z - centro.z)) > 26 ? 70 + DESNIVEL_MAXIMO + 2 : 70
    const r = 24
    for (const [x, z] of [
      [centro.x, centro.z],
      [centro.x - r, centro.z - r],
      [centro.x + r, centro.z + r],
    ]) {
      expect(lomba(x, z), 'o falso não representa o defeito: a regra antiga veria a lomba').toBe(70)
    }
    expect(terrenoPlano(lomba, centro, 62), 'a lomba sob a casa da borda passou').toBeNull()
  })
})

describe('as casas', () => {
  const plano = () => planoDaAldeia(hash, planicie(), 0, 0)

  it('a planície vira plano; o barranco não', () => {
    expect(plano()).not.toBe(null)
    const morro = { alturaEm: (x) => 70 + Math.abs(x), nivelDoMar: 62 }
    expect(planoDaAldeia(hash, morro, 0, 0)).toBe(null)
  })

  it('são quantas COUBEREM, nunca menos que o piso, todas dentro do raio', () => {
    // ⚠️ O NÚMERO NÃO É FIXO DESDE A ONDA 2. A colocação é por rejeição: quem
    // não cabe não entra, e a aldeia sai com sete ou oito em vez de nove. O que
    // não pode é sair com três, que é acampamento e não vila.
    const p = plano()
    expect(p.casas.length).toBeGreaterThanOrEqual(CASAS_MINIMAS)
    expect(p.casas.length).toBeLessThanOrEqual(CASAS)
    for (const c of p.casas) expect(dentroDoRaio(p.centro, c.x, c.z)).toBe(true)
  })

  it('casa nenhuma INVADE a praça — e a conta é pela borda, não pelo centro', () => {
    // ⚠️ A PRIMEIRA VERSÃO DESTE TESTE MEDIA O CENTRO DA CASA, e por isso ele
    // passava verde sobre o defeito que existia: uma casa a 12 blocos com
    // beiral de 5 avança até 7 do meio da vila, cobre a quina da praça e o
    // poste da esquina nasce dentro dela e some. Quatro dos onze postes sumiram
    // assim. O mutante que devolvia a guarda fraca ao código SOBREVIVEU a este
    // teste — porque o teste tinha o mesmo erro que o código.
    //
    // A propriedade que importa é geométrica: a CAIXA da casa e o QUADRADO da
    // praça não podem se sobrepor.
    for (let g = 0; g < 30; g++) {
      const p = planoDaAldeia(hash, planicie(), g * CELULA, g * CELULA)
      if (!p) continue
      for (const c of p.casas) {
        const b = Math.max(c.planta.lx, c.planta.lz) + 1
        const sobrepoe =
          Math.abs(c.x - p.centro.x) <= RAIO_DA_PRACA + b &&
          Math.abs(c.z - p.centro.z) <= RAIO_DA_PRACA + b
        expect(sobrepoe, `aldeia ${g}: a casa ${c.planta.nome} entra na praça`).toBe(false)
      }
    }
  })

  it('nenhuma casa encosta na outra', () => {
    for (let g = 0; g < 30; g++) {
      const p = planoDaAldeia(hash, planicie(), g * CELULA, g * CELULA)
      if (!p) continue
      for (let i = 0; i < p.casas.length; i++) {
        for (let j = i + 1; j < p.casas.length; j++) {
          const a = p.casas[i]
          const b = p.casas[j]
          // ⚠️ A FOLGA É A SOMA DAS BORDAS DAS DUAS, e não o dobro da maior.
          // Medir pela maior reprovaria duas casas pequenas legitimamente
          // vizinhas — o teste ficaria mais rígido que o código e cobraria uma
          // rua que a vila não precisa ter.
          const borda = (c) => Math.max(c.planta.lx, c.planta.lz) + 1
          const folga = borda(a) + borda(b)
          const longe = Math.abs(a.x - b.x) > folga || Math.abs(a.z - b.z) > folga
          expect(longe, `aldeia ${g}: casas ${i} e ${j} se atravessam`).toBe(true)
        }
      }
    }
  })

  it('toda aldeia tem as quatro profissões', () => {
    // Sortear faria aldeia sem ferreiro — e o ferreiro é o único caminho até
    // ferramenta boa para quem joga em cima da terra.
    const p = plano()
    const profs = new Set(p.casas.map((c) => c.profissao))
    for (const n of NOMES_DE_PROFISSAO) expect(profs.has(n), n).toBe(true)
  })

  it('as casas mudam de aldeia para aldeia', () => {
    const a = planoDaAldeia(hash, planicie(), 0, 0)
    const b = planoDaAldeia(hash, planicie(), CELULA * 16, 0)
    expect(a.casas.map((c) => [c.x - a.centro.x, c.z - a.centro.z])).not.toEqual(
      b.casas.map((c) => [c.x - b.centro.x, c.z - b.centro.z]),
    )
  })
})

describe('a casa, pelo plano da aldeia', () => {
  // ⚠️ A FORMA DA CASA MUDOU DE ENDEREÇO. Ela mora em `vilaCasa.js` desde a
  // onda 1 do Goal 19, e os testes dela em `vilaCasa.spec.js`. O que sobra aqui
  // é o que só a ALDEIA sabe: que cada casa recebeu uma planta, que o material
  // é da vila inteira, e que a casa cabe no que a aldeia escreve.
  const plano = () => planoDaAldeia(hash, planicie(), 0, 0)

  it('cada casa tem planta, e a vila não é cinco vezes a mesma', () => {
    // Cinco casas idênticas em anel leem como cenário de jogo de tabuleiro.
    const p = plano()
    for (const c of p.casas) expect(PLANTAS).toContain(c.planta)
    const nomes = new Set(p.casas.map((c) => c.planta.nome))
    expect(nomes.size, 'a aldeia inteira saiu com uma planta só').toBeGreaterThan(1)
  })

  it('o material é da VILA, e não de cada casa', () => {
    // Metade de carvalho e metade de pinho lê como duas vilas encostadas.
    const p = plano()
    for (const c of p.casas) expect(c.material).toBe(p.material)
  })

  it('a casa inteira cabe no que a aldeia ESCREVE', () => {
    // ⚠️ `RAIO` limita o CENTRO da casa; a casa avança `BORDA_DA_CASA` a partir
    // dele. Com a guarda de escrita no raio antigo, a casa mais afastada
    // amanhecia sem a parede de fora — e nenhum teste olhava para lá.
    for (let g = 0; g < 30; g++) {
      const p = planoDaAldeia(hash, planicie(), g * CELULA, g * CELULA)
      if (!p) continue
      for (const c of p.casas) {
        const b = BORDA_DA_CASA
        for (const [x, z] of [
          [c.x - b, c.z - b],
          [c.x + b, c.z + b],
        ]) {
          expect(
            dentroDoEscrito(p.centro, x, z),
            `aldeia ${g}: canto da casa fora da escrita`,
          ).toBe(true)
        }
      }
    }
  })

  it('a coluna da casa sobe acima da parede — o telhado existe no despachante', () => {
    const p = plano()
    const c = p.casas[0]
    const col = colunaDaAldeia(p, c.x, c.z)
    expect(col, 'o centro da casa não é da vila').not.toBeNull()
    const topo = Math.max(...col.map((e) => e.y))
    expect(topo, 'a casa parou no topo da parede: telhado plano de novo').toBeGreaterThan(
      p.chao + c.planta.pe,
    )
  })
})

describe('o caminho e os moradores', () => {
  it('o caminho passa pelo centro e pela porta de cada casa', () => {
    const p = planoDaAldeia(hash, planicie(), 0, 0)
    expect(ehCaminho(p, p.centro.x, p.centro.z)).toBe(true)
    for (const c of p.casas) {
      // A porta fica na parede de −Z da planta DAQUELA casa: com plantas de
      // tamanhos diferentes, uma distância cravada erra as duas pontas.
      expect(ehCaminho(p, c.x, c.z - c.planta.lz), c.planta.nome).toBe(true)
    }
  })

  it('longe das casas não há caminho', () => {
    const p = planoDaAldeia(hash, planicie(), 0, 0)
    expect(ehCaminho(p, p.centro.x + RAIO * 3, p.centro.z + RAIO * 3)).toBe(false)
  })

  it('um aldeão por casa, em pé no chão da aldeia', () => {
    const p = planoDaAldeia(hash, planicie(), 0, 0)
    const a = aldeoesDe(p)
    expect(a).toHaveLength(p.casas.length)
    for (const x of a) {
      expect(x.y).toBe(p.chao + 1)
      expect(NOMES_DE_PROFISSAO).toContain(x.profissao)
    }
  })
})
