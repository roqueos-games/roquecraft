import { describe, it, expect } from 'vitest'
import { olhoSeguro, tapaVisao, ALTURA_DO_OLHO } from '../../src/servicos/olho.js'
import { criarRegistroDeEdicoes, TETO_DO_PAYLOAD } from '../../src/servicos/edicoes.js'

// Duas regras que moravam no componente de 4.500 linhas e agora são serviço.
// Nenhuma das duas precisa de mundo, de three.js ou de Vue — só pareciam
// precisar porque estavam num arquivo que precisa.

// ── Mundo de mentira: um conjunto de blocos sólidos por "x,y,z" ─────────────
function mundo(solidos = [], folhas = []) {
  const s = new Set(solidos)
  const f = new Set(folhas)
  return {
    ehOpaco: (x, y, z) => s.has(`${x},${y},${z}`),
    chaveEm: (x, y, z) => (f.has(`${x},${y},${z}`) ? 'oakLeaves' : 'air'),
  }
}

describe('olho - onde a câmera cabe', () => {
  it('céu aberto: o olho fica onde deveria, 1,62 acima do pé', () => {
    const [x, y, z] = olhoSeguro(mundo(), 0.5, 64, 0.5)
    expect([x, z]).toEqual([0.5, 0.5])
    expect(y).toBeCloseTo(64 + ALTURA_DO_OLHO, 5)
  })

  it('teto baixo: sobe até achar ar', () => {
    // Pé em 64 → olho em 65,62 → bloco 65 é o que conta. Tapa 65, deixa 66.
    const m = mundo(['0,65,0'])
    const [, y] = olhoSeguro(m, 0.5, 64, 0.5)
    expect(y, 'não saiu do bloco').toBeGreaterThan(65.62)
    expect(Math.floor(y), 'devia ter subido pro 66').toBe(66)
  })

  it('folha tapa a visão mesmo não sendo opaca', () => {
    const m = mundo([], ['0,65,0'])
    expect(tapaVisao(m, 0, 65, 0), 'folha na cara deveria contar').toBe(true)
    const [, y] = olhoSeguro(m, 0.5, 64, 0.5)
    expect(Math.floor(y), 'a câmera devia ter saído da copa').not.toBe(65)
  })

  it('soterrado com o pé livre: a câmera acaba na célula do pé, não na pedra', () => {
    // Tudo sólido de 65 a 67; o pé (64) é o único ar.
    //
    // ⚠️ A primeira versão deste teste afirmava o VALOR exato 64,1, contando a
    // história de que só o degrau explícito do pé salvaria o caso. Errado: com
    // o pé em 64 a descida chega em 64,87 e já está livre. Eu estava afirmando
    // por qual RAMO o código passa, e não o que ele tem que entregar — que é a
    // forma mais fácil de escrever um teste que quebra quando o código melhora.
    //
    // O degrau do pé continua no código e continua certo (é o último recurso
    // quando a descida não alcança); o que ele não é, é o único caminho.
    const m = mundo(['0,65,0', '0,66,0', '0,67,0'])
    const [, y] = olhoSeguro(m, 0.5, 64, 0.5)
    expect(Math.floor(y), 'a câmera ficou dentro da pedra').toBe(64)
    expect(tapaVisao(m, 0, Math.floor(y), 0), 'acabou num bloco que tapa').toBe(false)
  })

  it('sem saída nenhuma, devolve o alvo em vez de nada', () => {
    // Coluna inteira sólida. Câmera meio metro fora do lugar é ruim; câmera
    // `null` é tela preta sem explicação.
    const solidos = []
    for (let y = 60; y <= 70; y++) solidos.push(`0,${y},0`)
    const [, y] = olhoSeguro(mundo(solidos), 0.5, 64, 0.5)
    expect(Number.isFinite(y), 'devolveu algo não-numérico').toBe(true)
    expect(y).toBeCloseTo(64 + ALTURA_DO_OLHO, 5)
  })

  it('a busca pra cima tem teto de 2 blocos', () => {
    // Sólido de 65 a 68: subir não resolve dentro do teto, então a regra tem
    // que cair pro caminho de descida em vez de subir para sempre.
    const m = mundo(['0,65,0', '0,66,0', '0,67,0', '0,68,0'])
    const [, y] = olhoSeguro(m, 0.5, 64, 0.5)
    expect(y, 'subiu além do teto de 2 blocos').toBeLessThan(65.62 + 2.01)
  })
})

// ── Registro de edições ─────────────────────────────────────────────────────
//
// Aritmética de chunk de mentira, com 16 de lado: o que se testa é a REGRA do
// registro, não a matemática de coordenada (que tem dono próprio).
const coords = {
  chunkKey: (cx, cz) => `${cx},${cz}`,
  parseChunkKey: (k) => {
    const i = String(k).indexOf(',')
    if (i < 0) return null
    const cx = Number(k.slice(0, i))
    const cz = Number(k.slice(i + 1))
    return Number.isFinite(cx) && Number.isFinite(cz) ? { cx, cz } : null
  },
  toChunkCoord: (v) => Math.floor(v / 16),
  toLocalCoord: (v) => ((v % 16) + 16) % 16,
  localIndex: (lx, y, lz) => (y * 16 + lz) * 16 + lx,
}

describe('edições - o que o jogador mudou', () => {
  it('registra e achata em quádruplas', () => {
    const r = criarRegistroDeEdicoes(coords)
    r.registrar(1, 64, 2, 7)
    const saida = r.coletar()
    expect(saida.length, 'uma edição são quatro números').toBe(4)
    expect(saida[0], 'chunk x').toBe(0)
    expect(saida[1], 'chunk z').toBe(0)
    expect(saida[3], 'id do bloco').toBe(7)
  })

  it('editar o MESMO lugar duas vezes deixa uma entrada, com o valor novo', () => {
    // É a razão de a estrutura ser Map e não lista: quebrar e recolocar não
    // pode dobrar o tamanho do save.
    const r = criarRegistroDeEdicoes(coords)
    r.registrar(1, 64, 2, 7)
    r.registrar(1, 64, 2, 0)
    expect(r.quantos).toBe(1)
    const saida = r.coletar()
    expect(saida.length).toBe(4)
    expect(saida[3], 'ficou o valor antigo').toBe(0)
  })

  it('separa por chunk', () => {
    const r = criarRegistroDeEdicoes(coords)
    r.registrar(1, 64, 1, 7) // chunk 0,0
    r.registrar(17, 64, 1, 8) // chunk 1,0
    r.registrar(1, 64, 33, 9) // chunk 0,2
    expect(r.mapa.size, 'três chunks distintos').toBe(3)
    expect(r.quantos).toBe(3)
  })

  it('coordenada negativa cai no chunk certo (o -1 é a pegadinha clássica)', () => {
    const r = criarRegistroDeEdicoes(coords)
    r.registrar(-1, 64, -1, 5)
    const saida = r.coletar()
    expect([saida[0], saida[1]], 'x=-1 é chunk -1, não chunk 0').toEqual([-1, -1])
  })

  // ⚠️ O teto existe pra que o save não morra em silêncio no autosave.
  it('trunca no teto em vez de crescer sem limite', () => {
    const r = criarRegistroDeEdicoes(coords)
    // 70.000 blocos = 280.000 números, bem acima do teto de 240.000.
    for (let i = 0; i < 70000; i++) r.registrar(i % 1000, 60 + ((i / 1000) | 0), 0, 1)
    const saida = r.coletar()
    expect(saida.length, 'passou do teto').toBeLessThanOrEqual(TETO_DO_PAYLOAD)
    expect(saida.length, 'truncou cedo demais').toBeGreaterThan(TETO_DO_PAYLOAD - 4)
  })

  it('registro vazio devolve lista vazia, não undefined', () => {
    const r = criarRegistroDeEdicoes(coords)
    expect(r.coletar()).toEqual([])
    expect(r.quantos).toBe(0)
  })
})
