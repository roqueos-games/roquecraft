//
// O MINIMAPA — a conta que decide o que o jogador vê de cima.
//
// ⚠️ O DEFEITO QUE ESTE TESTE GUARDA NÃO É "O MAPA FICOU FEIO". É MARCA ERRADA.
//
// O founder voou o mapa inteiro e não achou vila nem castelo. A resposta foi um
// mapa que aponta para eles a até 1.600 blocos. Um mapa que aponte para o lugar
// ERRADO é pior que o problema original: o jogador anda um quilômetro e meio
// atrás de uma vila que o gerador nunca pôs ali, e conclui que o jogo mente.
//
// Por isso o teste que importa mais aqui não é nenhum dos de forma e cor: é
// `a marca cai onde o gerador põe a estrutura`, que compara o minimapa com
// `planoDaAldeia`/`planoDoCastelo` — os mesmos que o `worldgen` chama.
import { describe, it, expect } from 'vitest'
import {
  ALCANCE_DAS_MARCAS,
  BLOCOS_DA_PECA,
  BLOCOS_POR_PIXEL,
  COR_DESCONHECIDA,
  COR_DO_BIOMA,
  GANHO_DO_RELEVO,
  LADO_DA_PECA,
  LIMITE_DO_RELEVO,
  MARGEM_DA_BORDA,
  campoDaPeca,
  cantoDaPeca,
  celulasNoAlcance,
  corDaAmostra,
  distanciaCurta,
  marcasDoMinimapa,
  mundoDoMinimapa,
  pintarPeca,
  projetar,
  relevo,
} from '../../src/servicos/minimapa.js'
import {
  BIOMES,
  createNoiseContext,
  solidTopAt,
  terrainHeight,
} from '../../src/servicos/worldgen.js'
import { CHUNK_SIZE, SEA_LEVEL } from '../../src/servicos/constants.js'
import { BIOMAS_DA_ALDEIA, CELULA, planoDaAldeia } from '../../src/servicos/aldeia.js'
import { BIOMAS_DO_CASTELO, CELULA_DO_CASTELO, planoDoCastelo } from '../../src/servicos/castelo.js'
import { BIOME_NAMES, biomeAt } from '../../src/servicos/worldgen.js'
import { hash3 } from '../../src/servicos/noise.js'

const MAR = 62

describe('a cor de uma amostra', () => {
  it('a água manda antes do bioma', () => {
    // O lago dentro da planície volta de `biomeAt` como `plains`. Pintá-lo de
    // verde apagaria do mapa a coisa mais fácil de reconhecer de cima.
    const seco = corDaAmostra(BIOMES.plains, MAR + 4, MAR)
    const molhado = corDaAmostra(BIOMES.plains, MAR - 4, MAR)
    expect(seco).toEqual(COR_DO_BIOMA[BIOMES.plains])
    expect(molhado[2]).toBeGreaterThan(molhado[0])
    expect(molhado).not.toEqual(seco)
  })

  it('o fundo é mais escuro que o raso', () => {
    const raso = corDaAmostra(BIOMES.ocean, MAR - 2, MAR)
    const fundo = corDaAmostra(BIOMES.ocean, MAR - 30, MAR)
    expect(fundo[0]).toBeLessThan(raso[0])
    expect(fundo[1]).toBeLessThan(raso[1])
    expect(fundo[2]).toBeLessThan(raso[2])
  })

  it('bioma que o mapa não conhece sai cinza, e não invisível', () => {
    expect(corDaAmostra(999, MAR + 10, MAR)).toEqual(COR_DESCONHECIDA)
  })

  it('todo bioma do gerador tem cor', () => {
    // ⚠️ Bioma novo no `worldgen` sem cor aqui sairia cinza no mapa inteiro, e
    // ninguém repara num cinza — repara-se numa falha.
    for (const id of Object.values(BIOMES)) expect(COR_DO_BIOMA[id]).toBeDefined()
  })

  it('duas cores de bioma não são iguais', () => {
    // Dois biomas com a mesma cor é um mapa que mente por omissão.
    const vistas = Object.values(COR_DO_BIOMA).map((c) => c.join(','))
    expect(new Set(vistas).size).toBe(vistas.length)
  })
})

describe('o sombreado de encosta', () => {
  it('terreno plano não muda o brilho', () => {
    expect(relevo(70, 70)).toBe(1)
  })

  it('encosta caindo para sudeste escurece, e subindo clareia', () => {
    expect(relevo(70, 66)).toBeLessThan(1)
    expect(relevo(70, 74)).toBeGreaterThan(1)
  })

  it('o penhasco não vira preto nem branco', () => {
    expect(relevo(10, 300)).toBe(1 + LIMITE_DO_RELEVO)
    expect(relevo(300, 10)).toBe(1 - LIMITE_DO_RELEVO)
  })

  it('o ganho é o que o módulo declara', () => {
    expect(relevo(70, 72)).toBeCloseTo(1 + 2 * GANHO_DO_RELEVO, 10)
  })
})

/** Um mundo de mentira: altura = x, bioma = z. Dá para conferir cada amostra. */
const mundoFalso = {
  alturaEm: (x) => x,
  biomaEm: (x, z) => z & 7,
}

describe('a peça do cache', () => {
  it('amostra uma franja de uma amostra além do lado', () => {
    // ⚠️ SEM A FRANJA O RELEVO NÃO FECHA: o último pixel da peça precisa do
    // vizinho a sudeste, que já é da peça seguinte. Sem ele, a borda de cada
    // peça sairia chapada e o mapa ganharia uma grade visível de 32 em 32 px.
    const campo = campoDaPeca(mundoFalso, 0, 0)
    expect(campo.lado).toBe(LADO_DA_PECA + 1)
    expect(campo.altura.length).toBe(campo.lado * campo.lado)
  })

  it('cada amostra sai da coordenada que o mapa promete', () => {
    const campo = campoDaPeca(mundoFalso, 128, 256)
    const i = 3
    const j = 5
    expect(campo.altura[j * campo.lado + i]).toBe(128 + i * BLOCOS_POR_PIXEL)
    expect(campo.bioma[j * campo.lado + i]).toBe((256 + j * BLOCOS_POR_PIXEL) & 7)
  })

  it('a pintura devolve RGBA opaco do lado da peça', () => {
    const rgba = pintarPeca(campoDaPeca(mundoFalso, 0, 0), SEA_LEVEL)
    expect(rgba.length).toBe(LADO_DA_PECA * LADO_DA_PECA * 4)
    for (let o = 3; o < rgba.length; o += 4) expect(rgba[o]).toBe(255)
  })

  it('a pintura é cor do bioma vezes o relevo', () => {
    const campo = campoDaPeca(mundoFalso, 0, 0)
    const rgba = pintarPeca(campo, 0) // nível do mar 0: nada é água aqui
    const i = 4
    const j = 6
    const k = j * campo.lado + i
    const esperada = corDaAmostra(campo.bioma[k], campo.altura[k], 0)
    const luz = relevo(campo.altura[k], campo.altura[(j + 1) * campo.lado + i + 1])
    const o = (j * LADO_DA_PECA + i) * 4
    expect(rgba[o]).toBe(Math.min(255, Math.round(esperada[0] * luz)))
  })

  it('o canto da peça alinha para baixo, inclusive no negativo', () => {
    // ⚠️ `Math.trunc` daria 0 para -1 e a peça de x negativo cairia meia peça
    // deslocada — costura de 32 px que só aparece a oeste da origem.
    expect(cantoDaPeca(0)).toBe(0)
    expect(cantoDaPeca(BLOCOS_DA_PECA - 1)).toBe(0)
    expect(cantoDaPeca(-1)).toBe(-BLOCOS_DA_PECA)
    expect(cantoDaPeca(-BLOCOS_DA_PECA)).toBe(-BLOCOS_DA_PECA)
  })
})

describe('as células varridas', () => {
  it('devolve coordenada de CHUNK, múltipla da célula', () => {
    const cels = celulasNoAlcance(CELULA, { x: 0, z: 0 }, 600)
    expect(cels.length).toBeGreaterThan(0)
    for (const [cx, cz] of cels) {
      expect(Math.abs(cx % CELULA)).toBe(0)
      expect(Math.abs(cz % CELULA)).toBe(0)
    }
  })

  it('cobre todo o quadrado do alcance', () => {
    const alcance = 900
    const centro = { x: 5000, z: -3000 }
    const lado = CELULA * CHUNK_SIZE
    const cels = celulasNoAlcance(CELULA, centro, alcance)
    const dentro = new Set(cels.map(([cx, cz]) => `${cx},${cz}`))
    for (const dx of [-alcance, 0, alcance]) {
      for (const dz of [-alcance, 0, alcance]) {
        const gx = Math.floor((centro.x + dx) / lado) * CELULA
        const gz = Math.floor((centro.z + dz) / lado) * CELULA
        expect(dentro.has(`${gx},${gz}`)).toBe(true)
      }
    }
  })
})

describe('as marcas', () => {
  const vila = (x, z) => ({ centro: { x, z } })
  const forte = (x, z, ruina) => ({ centro: { x, z }, ruina })

  it('classifica ruína e castelo como marcas diferentes', () => {
    // 42% dos castelos são ruína. Quem anda 1.400 blocos atrás de um castelo
    // inteiro tem direito de saber antes de andar.
    const m = marcasDoMinimapa({
      casteloEm: (cx, cz) => {
        if (cx === 0 && cz === 0) return forte(10, 0, false)
        if (cx === CELULA_DO_CASTELO && cz === 0) return forte(0, 20, true)
        return null
      },
      centro: { x: 0, z: 0 },
      alcance: 400,
    })
    expect(m.map((v) => v.tipo).sort()).toEqual(['castelo', 'ruina'])
  })

  it('recusa a estrutura que está fora do alcance de verdade', () => {
    // ⚠️ A VARREDURA É QUADRADA E O ALCANCE É REDONDO. Sem este filtro, a marca
    // do canto da varredura entraria a 1,41 × o alcance prometido — e apareceria
    // presa na borda com uma distância que o mapa disse não medir.
    const longe = { x: 900, z: 900 }
    const m = marcasDoMinimapa({
      vilaEm: (cx, cz) => (cx === 0 && cz === 0 ? vila(longe.x, longe.z) : null),
      centro: { x: 0, z: 0 },
      alcance: 1000,
    })
    expect(Math.hypot(longe.x, longe.z)).toBeGreaterThan(1000)
    expect(m).toEqual([])
  })

  it('vem ordenada da mais perto para a mais longe', () => {
    const pontos = [
      [0, 0, 600, 0],
      [CELULA, 0, 100, 0],
      [0, CELULA, 300, 0],
    ]
    const m = marcasDoMinimapa({
      vilaEm: (cx, cz) => {
        const p = pontos.find(([gx, gz]) => gx === cx && gz === cz)
        return p ? vila(p[2], p[3]) : null
      },
      centro: { x: 0, z: 0 },
      alcance: 1000,
    })
    expect(m.map((v) => Math.round(v.distancia))).toEqual([100, 300, 600])
  })

  it('sem nada para achar, devolve lista vazia e não estoura', () => {
    expect(marcasDoMinimapa({ centro: { x: 0, z: 0 } })).toEqual([])
  })
})

describe('a projeção no disco', () => {
  const centro = { x: 0, z: 0 }
  const RAIO = 66

  it('dentro do disco, a posição é a real', () => {
    const p = projetar({ x: 40, z: 0 }, centro, RAIO)
    expect(p.fora).toBe(false)
    expect(p.px).toBeCloseTo(40 / BLOCOS_POR_PIXEL, 10)
  })

  it('fora do disco, prende na borda e AVISA que prendeu', () => {
    // ⚠️ `fora` é o que separa quadrado de seta no desenho. A posição presa
    // mente sobre a distância de propósito; quem mente precisa avisar.
    const p = projetar({ x: 1600, z: 0 }, centro, RAIO)
    expect(p.fora).toBe(true)
    expect(p.px).toBeCloseTo(RAIO - MARGEM_DA_BORDA, 10)
  })

  it('a direção sobrevive à prisão na borda', () => {
    const p = projetar({ x: -1200, z: 1200 }, centro, RAIO)
    expect(p.px).toBeLessThan(0)
    expect(p.pz).toBeGreaterThan(0)
    expect(Math.hypot(p.px, p.pz)).toBeCloseTo(RAIO - MARGEM_DA_BORDA, 6)
  })

  it('a marca em cima do jogador não vira divisão por zero', () => {
    const p = projetar({ x: 0, z: 0 }, centro, RAIO)
    expect(Number.isFinite(p.px)).toBe(true)
    expect(Number.isFinite(p.pz)).toBe(true)
  })
})

describe('a distância escrita', () => {
  it('cabe em quatro caracteres', () => {
    expect(distanciaCurta(0)).toBe('0')
    expect(distanciaCurta(999)).toBe('999')
    expect(distanciaCurta(1000)).toBe('1.0k')
    expect(distanciaCurta(1587)).toBe('1.6k')
    for (const d of [0, 12, 999, 1000, 1587, ALCANCE_DAS_MARCAS]) {
      expect(distanciaCurta(d).length).toBeLessThanOrEqual(4)
    }
  })
})

describe('a marca cai onde o gerador põe a estrutura', () => {
  // ⚠️ ESTE É O TESTE QUE IMPORTA. Os de cima medem forma e cor; este mede se o
  // mapa CONTA A VERDADE. Ele roda com o ruído de verdade, sem planície de
  // mentira, porque o que decide se a célula tem vila é o bioma e o relevo.
  const SEMENTE = 1337
  const mundo = mundoDoMinimapa(SEMENTE)

  /** A primeira célula com estrutura, varrendo anéis a partir da origem. */
  const achar = (celula, plano, anéis) => {
    for (let anel = 0; anel <= anéis; anel++) {
      for (let gx = -anel; gx <= anel; gx++) {
        for (let gz = -anel; gz <= anel; gz++) {
          if (Math.max(Math.abs(gx), Math.abs(gz)) !== anel) continue
          const p = plano(gx * celula, gz * celula)
          if (p) return p
        }
      }
    }
    return null
  }

  it('a vila marcada é a vila que o gerador construiu', () => {
    const vila = achar(CELULA, mundo.vilaEm, 6)
    expect(vila, 'nenhuma vila em 13×13 células com a semente 1337').not.toBeNull()
    const marcas = marcasDoMinimapa({
      vilaEm: mundo.vilaEm,
      casteloEm: mundo.casteloEm,
      centro: { x: vila.centro.x, z: vila.centro.z },
      alcance: ALCANCE_DAS_MARCAS,
    })
    const aqui = marcas.find((m) => m.tipo === 'vila' && m.distancia < 1)
    expect(aqui, 'o minimapa não marcou a vila em que o jogador está em cima').toBeDefined()
    expect(aqui.x).toBe(vila.centro.x)
    expect(aqui.z).toBe(vila.centro.z)
  })

  it('o castelo marcado é o castelo que o gerador construiu, com a ruína certa', () => {
    const forte = achar(CELULA_DO_CASTELO, mundo.casteloEm, 6)
    expect(forte, 'nenhum castelo em 13×13 células com a semente 1337').not.toBeNull()
    const marcas = marcasDoMinimapa({
      casteloEm: mundo.casteloEm,
      centro: { x: forte.centro.x, z: forte.centro.z },
      alcance: ALCANCE_DAS_MARCAS,
    })
    const aqui = marcas.find((m) => m.distancia < 1)
    expect(aqui).toBeDefined()
    expect(aqui.tipo).toBe(forte.ruina ? 'ruina' : 'castelo')
  })

  it('o alcance declarado alcança alguma coisa', () => {
    // ⚠️ Um alcance menor que a distância típica entre estruturas devolveria
    // mapa vazio quase sempre — que é literalmente o defeito que o founder
    // relatou olhando pela janela.
    const marcas = marcasDoMinimapa({
      vilaEm: mundo.vilaEm,
      casteloEm: mundo.casteloEm,
      centro: { x: 0, z: 0 },
      alcance: ALCANCE_DAS_MARCAS,
    })
    expect(marcas.length).toBeGreaterThan(0)
    for (const m of marcas) expect(m.distancia).toBeLessThanOrEqual(ALCANCE_DAS_MARCAS)
  })

  // ⚠️ O ORÁCULO É MONTADO À MÃO, e não tirado de `mundoDoMinimapa`.
  //
  // A primeira versão deste bloco procurava a vila com `mundo.vilaEm` e depois
  // conferia que `marcasDoMinimapa` a marcava. Os dois lados saíam da MESMA
  // função: trocar a lista de biomas da vila pela do castelo, ou a altura do
  // plano por `terrainHeight`, deixava os dois lados errados JUNTOS e os 29
  // testes passavam. Medido com mutante em 14/09/2026 — os dois sobreviveram.
  //
  // O oráculo abaixo repete a fiação que o `worldgen` usa, que é a única
  // referência externa que existe. É a mesma lição do yaw da sonda de comércio:
  // quem reimplementa a conta testa a própria conta.
  const hash = (a, b, c) => hash3(a, b, c, SEMENTE)
  const nzDoOraculo = createNoiseContext(SEMENTE)
  const baseDoOraculo = {
    alturaEm: (x, z) => solidTopAt(nzDoOraculo, x, z),
    nivelDoMar: SEA_LEVEL,
    biomaEm: (x, z) => biomeAt(nzDoOraculo, x, z, terrainHeight(nzDoOraculo, x, z)),
  }
  const resumo = (p) => (p ? `${p.centro.x},${p.centro.z},${!!p.ruina}` : 'nada')

  it('a vila do minimapa é, célula por célula, a vila do gerador', () => {
    let vilas = 0
    for (let gx = -6; gx <= 6; gx++) {
      for (let gz = -6; gz <= 6; gz++) {
        const cx = gx * CELULA
        const cz = gz * CELULA
        const doGerador = planoDaAldeia(
          hash,
          { ...baseDoOraculo, biomaAceito: (b) => BIOMAS_DA_ALDEIA.includes(BIOME_NAMES[b]) },
          cx,
          cz,
        )
        if (doGerador) vilas++
        expect(resumo(mundo.vilaEm(cx, cz)), `célula ${cx},${cz}`).toBe(resumo(doGerador))
      }
    }
    expect(vilas, 'nenhuma vila em 169 células: o oráculo não está medindo nada').toBeGreaterThan(0)
  })

  it('o castelo do minimapa é, célula por célula, o castelo do gerador', () => {
    let fortes = 0
    let ruinas = 0
    for (let gx = -5; gx <= 5; gx++) {
      for (let gz = -5; gz <= 5; gz++) {
        const cx = gx * CELULA_DO_CASTELO
        const cz = gz * CELULA_DO_CASTELO
        const doGerador = planoDoCastelo(
          hash,
          { ...baseDoOraculo, biomaAceito: (b) => BIOMAS_DO_CASTELO.includes(BIOME_NAMES[b]) },
          cx,
          cz,
        )
        if (doGerador) fortes++
        if (doGerador?.ruina) ruinas++
        expect(resumo(mundo.casteloEm(cx, cz)), `célula ${cx},${cz}`).toBe(resumo(doGerador))
      }
    }
    expect(
      fortes,
      'nenhum castelo em 121 células: o oráculo não está medindo nada',
    ).toBeGreaterThan(0)
    // A ruína tem que aparecer, senão `resumo` nunca compara o campo `ruina`.
    expect(ruinas, 'nenhuma ruína nas 121 células: a comparação não cobre o tipo').toBeGreaterThan(
      0,
    )
  })

  it('o desenho e o plano perguntam alturas DIFERENTES', () => {
    // ⚠️ SÃO DUAS ALTURAS DE PROPÓSITO (ver a nota em `mundoDoMinimapa`): o
    // desenho usa `terrainHeight`, que é barato; o plano usa `solidTopAt`, que
    // é o que o `worldgen` usa para decidir onde a vila cabe. Trocar uma pela
    // outra é barato de fazer sem querer e caro de descobrir — o mapa passaria a
    // marcar vila em terreno que o gerador recusa.
    const nz = createNoiseContext(SEMENTE)
    let divergem = 0
    for (let i = 0; i < 200; i++) {
      const x = i * 37 - 3000
      const z = i * 53 + 1200
      expect(mundo.alturaEm(x, z)).toBe(terrainHeight(nz, x, z))
      if (solidTopAt(nz, x, z) !== mundo.alturaEm(x, z)) divergem++
    }
    expect(
      divergem,
      'as duas alturas deram o mesmo em 200 pontos: uma delas foi trocada',
    ).toBeGreaterThan(0)
  })
})
