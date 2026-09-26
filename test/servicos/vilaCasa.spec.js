//
// A CASA — a forma dela, célula por célula.
//
// ⚠️ ESTES TESTES SUBSTITUEM OS DA CAIXA. A versão anterior provava que a casa
// era sete por sete com teto plano de tábua e TRÊS janelas, e passava verde
// enquanto o founder olhava a tela e dizia que estava feio. Um teste que prova
// que a caixa é uma caixa não protege nada: ele CONGELA a caixa.
//
// O que vale provar é o que faz a casa ler como casa e o que quebra em silêncio:
// que ela é FECHADA (chuva não entra, terra não invade), que ela tem ENTRADA,
// que o telhado INCLINA, e que o sótão não é um buraco aberto de lado.
import { describe, it, expect } from 'vitest'
import {
  PLANTAS,
  MATERIAIS,
  BORDA_DA_CASA,
  blocoDaCasa,
  blocoDaChamine,
  plantaDe,
  AR,
} from '../../src/servicos/vilaCasa.js'
import { ID, BLOCKS } from '../../src/servicos/blocks.js'

const CHAO = 70
const hash = (a, b, c) => {
  let h = (a * 374761393 + b * 668265263 + c * 2246822519) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
const casaCom = (planta, material = MATERIAIS.carvalho) => ({
  x: 0,
  z: 0,
  profissao: 'ferreiro',
  planta,
  material,
})
const bloco = (casa, dx, y, dz) => blocoDaCasa(casa, CHAO, dx, y, dz)

describe('as plantas', () => {
  it('são quatro, e nenhuma passa da borda que a separação garante', () => {
    // ⚠️ A CONTA ESTÁ NO COMENTÁRIO DE `casasDe`: com d mínimo de 13 a separação
    // entre vizinhas é 1,18·13 = 15,3. Duas casas de borda 5 ocupam 11 colunas,
    // e sobram 4 de rua. Uma planta maior faria duas casas se atravessarem.
    expect(PLANTAS.length).toBe(4)
    for (const p of PLANTAS) {
      expect(Math.max(p.lx, p.lz) + 1, p.nome).toBeLessThanOrEqual(BORDA_DA_CASA)
    }
  })

  it('a planta sai da COORDENADA da casa, não do índice dela', () => {
    // Com o índice, a casa do ferreiro seria a mesma planta em toda aldeia do
    // mundo, e a vila do lado seria a cópia desta.
    const vistas = new Set()
    for (let i = 0; i < 40; i++) vistas.add(plantaDe(hash, { x: i * 17, z: i * 31 }).nome)
    expect(vistas.size, 'o hash está devolvendo sempre a mesma planta').toBeGreaterThan(1)
  })

  it('a mesma casa dá SEMPRE a mesma planta — o chunk vizinho concorda', () => {
    // A regra de ouro desta pasta: `runFeatures` roda para os nove vizinhos.
    for (const c of [
      { x: 7, z: -3 },
      { x: -100, z: 250 },
    ]) {
      expect(plantaDe(hash, c)).toBe(plantaDe(hash, c))
    }
  })
})

for (const planta of PLANTAS) {
  describe(`a casa "${planta.nome}"`, () => {
    const casa = casaCom(planta)
    const topoDaParede = CHAO + planta.pe
    const transversal = planta.eixo === 'x' ? planta.lz : planta.lx
    const cume = topoDaParede + 1 + transversal + 1

    it('o piso é inteiro, sem um buraco', () => {
      for (let dx = -planta.lx; dx <= planta.lx; dx++) {
        for (let dz = -planta.lz; dz <= planta.lz; dz++) {
          expect(bloco(casa, dx, CHAO, dz), `piso ${dx},${dz}`).toBe(ID[casa.material.base])
        }
      }
    })

    it('o miolo é AR explícito, e não null', () => {
      // `null` quer dizer "deixe o terreno": o miolo precisa dizer VAZIO, senão
      // a casa nasce cheia de terra e o jogador escava a própria sala.
      expect(bloco(casa, 0, CHAO + 2, 0)).toBe(AR)
      expect(bloco(casa, 0, CHAO + 3, 0)).toBe(AR)
    })

    it('⚠️ TEM PORTA, fechada e virada para fora, com duas metades e batente', () => {
      // Até 18/09 (Goal 21) o vão era AR: casa aberta, zumbi entrando pela
      // frente. A folha fica na face de −Z da célula — a de FORA da parede —
      // e nasce fechada.
      const baixo = BLOCKS[bloco(casa, 0, CHAO + 1, -planta.lz)]
      const cima = BLOCKS[bloco(casa, 0, CHAO + 2, -planta.lz)]
      expect(baixo?.porta, 'a metade de baixo não é porta').toEqual({
        orient: 5,
        aberta: false,
        cima: false,
      })
      expect(cima?.porta, 'a metade de cima não é porta').toEqual({
        orient: 5,
        aberta: false,
        cima: true,
      })
      expect(bloco(casa, 0, CHAO + 3, -planta.lz), 'a verga').toBe(ID[casa.material.viga])
      expect(bloco(casa, 1, CHAO + 1, -planta.lz), 'o batente').toBe(ID[casa.material.viga])
      expect(bloco(casa, -1, CHAO + 1, -planta.lz), 'o batente').toBe(ID[casa.material.viga])
    })

    it('as quinas são viga, e a parede da porta não tem janela', () => {
      expect(bloco(casa, planta.lx, CHAO + 1, planta.lz)).toBe(ID[casa.material.viga])
      expect(bloco(casa, -planta.lx, CHAO + 2, -planta.lz)).toBe(ID[casa.material.viga])
      for (let dx = -planta.lx; dx <= planta.lx; dx++) {
        expect(bloco(casa, dx, CHAO + 2, -planta.lz), `janela na frente em ${dx}`).not.toBe(
          ID.glass,
        )
      }
    })

    it('tem janela nas outras três paredes, na altura dos olhos', () => {
      expect(bloco(casa, planta.lx, CHAO + 2, 1)).toBe(ID.glass)
      expect(bloco(casa, -planta.lx, CHAO + 2, 1)).toBe(ID.glass)
      expect(bloco(casa, 1, CHAO + 2, planta.lz)).toBe(ID.glass)
    })

    it('O TELHADO INCLINA: cada fiada sobe um, e a cumeeira é bloco cheio', () => {
      // ⚠️ É A SILHUETA. Telhado plano lido de longe é laje, e laje é galpão.
      const alturaEm = (t) => {
        const co = planta.eixo === 'x' ? [0, t] : [t, 0]
        for (let y = cume; y > topoDaParede; y--) {
          if (bloco(casa, co[0], y, co[1]) !== null) return y
        }
        return null
      }
      let anterior = null
      for (let t = transversal + 1; t >= 0; t--) {
        const y = alturaEm(t)
        expect(y, `sem telhado a ${t} do eixo`).not.toBeNull()
        if (anterior !== null) expect(y, `degrau errado em ${t}`).toBe(anterior + 1)
        anterior = y
      }
      expect(anterior, 'a cumeeira não está onde a conta diz').toBe(cume)
      expect(bloco(casa, 0, cume, 0), 'cumeeira de escada deixa sulco no meio da casa').toBe(
        ID[casa.material.parede],
      )
    })

    it('a água do telhado usa ESCADA, e cada lado aponta para fora', () => {
      const num = (t) =>
        planta.eixo === 'x' ? bloco(casa, 0, alturaDe(t), t) : bloco(casa, t, alturaDe(t), 0)
      const alturaDe = (t) => topoDaParede + 1 + (transversal + 1 - Math.abs(t))
      for (const lado of [-1, 1]) {
        const id = num(lado * (transversal + 1))
        const def = BLOCKS[id]
        expect(def?.escada, `a água ${lado > 0 ? '+' : '−'} não é escada`).toBeTruthy()
        // A forma base tem o degrau ALTO no +Z. Descer para −Z é orientação 5.
        expect(def.escada.orient, 'o degrau saiu invertido').toBe(lado < 0 ? 5 : 4)
        expect(def.escada.topo, 'escada de topo no telhado pendura ao contrário').toBe(false)
      }
    })

    it('o BEIRAL avança um bloco além da parede', () => {
      // Telhado que termina exatamente na parede parece corte de faca.
      const t = transversal + 1
      const id =
        planta.eixo === 'x'
          ? bloco(casa, 0, topoDaParede + 1, t)
          : bloco(casa, t, topoDaParede + 1, 0)
      expect(id, 'sem beiral').not.toBeNull()
      expect(id).not.toBe(AR)
    })

    it('a EMPENA fecha o sótão: de lado não se vê a sala', () => {
      // ⚠️ SEM ELA A CASA É UM ALPENDRE, e foi o primeiro defeito que a foto
      // pegou. O triângulo entre o topo da parede e a água fica aberto nas duas
      // pontas, e de fora dá pra ver a casa inteira por baixo do beiral.
      const aoLongo = planta.eixo === 'x' ? planta.lx : planta.lz
      for (const lado of [-1, 1]) {
        for (let y = topoDaParede + 1; y < cume; y++) {
          const id =
            planta.eixo === 'x'
              ? bloco(casa, lado * aoLongo, y, 0)
              : bloco(casa, 0, y, lado * aoLongo)
          expect(id, `empena aberta em y=${y - CHAO}`).toBe(ID[casa.material.parede])
        }
      }
    })

    it('TEM CAMA, com as duas metades apontando para lados opostos', () => {
      // É o que separa casa de barraco, e é onde o aldeão mora em vez de ficar
      // em pé no meio do cômodo.
      const canto = -(planta.lx - 1)
      expect(bloco(casa, canto, CHAO + 1, planta.lz - 1)).toBe(ID.bedHeadPz)
      expect(bloco(casa, canto, CHAO + 1, planta.lz - 2)).toBe(ID.bed)
      expect(BLOCKS[ID.bedHeadPz].cama.orient).not.toBe(BLOCKS[ID.bed].cama.orient)
    })

    it('a cama NÃO fica no vão da porta', () => {
      // Móvel na entrada tranca o aldeão dentro de casa.
      expect(bloco(casa, 0, CHAO + 1, -planta.lz + 1)).toBe(AR)
    })

    it('fora do beiral não é assunto dela', () => {
      expect(bloco(casa, planta.lx + 2, CHAO + 1, 0)).toBeNull()
      expect(bloco(casa, 0, CHAO - 1, 0)).toBeNull()
      expect(bloco(casa, 0, cume + 2, 0)).toBeNull()
    })
  })
}

describe('a chaminé', () => {
  const mestra = PLANTAS.find((p) => p.chamine)
  it('só a casa mestra tem, e ela passa do telhado', () => {
    // É o que dá altura e assimetria à silhueta da vila: cinco casas da mesma
    // altura em anel leem como condomínio.
    const casa = casaCom(mestra)
    const cume = CHAO + mestra.pe + 1 + mestra.lz + 1
    expect(blocoDaChamine(casa, CHAO, mestra.lx, cume + 1, 1)).toBe(ID.cobblestone)
    const semChamine = casaCom(PLANTAS.find((p) => !p.chamine))
    expect(blocoDaChamine(semChamine, CHAO, 3, cume + 1, 1)).toBeNull()
  })
})

describe('os materiais', () => {
  it('savana e planície não constroem com a mesma madeira', () => {
    // Duas vilas de carvalho leem como o mesmo lugar duas vezes.
    expect(MATERIAIS.pinho.parede).not.toBe(MATERIAIS.carvalho.parede)
    expect(MATERIAIS.pinho.escada).not.toBe(MATERIAIS.carvalho.escada)
    expect(MATERIAIS.pinho.base).not.toBe(MATERIAIS.carvalho.base)
  })

  it('a casa de pinho sai de pinho, e não de carvalho por engano', () => {
    const casa = casaCom(PLANTAS[1], MATERIAIS.pinho)
    expect(bloco(casa, 0, CHAO, 0)).toBe(ID.stoneBricks)
    expect(bloco(casa, PLANTAS[1].lx, CHAO + 1, -2)).toBe(ID.sprucePlanks)
  })
})
