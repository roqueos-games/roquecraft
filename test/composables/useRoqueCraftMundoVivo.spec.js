import { describe, it, expect, vi } from 'vitest'
import {
  useRoqueCraftMundoVivo,
  ONDA_DA_EDICAO,
} from '../../src/composables/useRoqueCraftMundoVivo.js'
import { BLOCK_BY_KEY, AIR, ID } from '../../src/servicos/blocks.js'
import { FLUIDOS } from '../../src/servicos/fluidos.js'
import { AGUA } from '../../src/servicos/blocks.js'
import { WORLD_HEIGHT } from '../../src/servicos/constants.js'

// ⚠️ ESTA LIGACAO NUNCA TEVE TESTE, e a razao era o endereco.
//
// `fluidos.js`, `gravidade.js`, `quedas.js` e `atualizacoes.js` sao testados de
// sobra cada um por si. O que ninguem podia testar era a FIACAO entre eles: ela
// morava no componente, presa a `world`, `engine`, `mp` e ao autosave. E e na
// fiacao que moram as decisoes mais caras:
//
//  - fluido NAO passa por `editar` (senao o save engorda com estado derivado e
//    a rede afoga: encher uma cova sao milhares de celulas)
//  - encontro (pedra, obsidiana) PASSA por `editar` - e estado duravel
//  - toda edicao acorda a vizinhanca, e e so por isso que a areia cai
//  - em sala, a edicao vai pra REDE e nao pro save local
//  - cerca so escreve QUANDO MUDA, senao a fila se realimenta pra sempre
//  - quem desistiu de cair vira item na altura DELE, nao no destino

/**
 * Sorteio DETERMINÍSTICO que falha três vezes e passa na quarta — 25% exatos.
 * Ver a nota no teste da lavoura: `() => 0` faz o mutante sem reagendamento
 * passar, porque cada avanço chama `editar` e `editar` acorda a própria célula.
 */
const deQuatroEmQuatro = () => {
  let i = 0
  return () => (++i % 4 === 0 ? 0 : 0.9)
}

/** Mundo de teste: um Map de celulas, com o resto AR. */
function mundoDeTeste(inicial = {}) {
  const celulas = new Map(Object.entries(inicial))
  const k = (x, y, z) => `${x},${y},${z}`
  return {
    celulas,
    getBlock: (x, y, z) => (y < 0 || y >= WORLD_HEIGHT ? 0 : (celulas.get(k(x, y, z)) ?? AIR)),
    edit: (x, y, z, id) => celulas.set(k(x, y, z), id),
    liquidAt: () => 0,
    por: (x, y, z, id) => celulas.set(k(x, y, z), id),
  }
}

function montar(over = {}) {
  const world = over.world || mundoDeTeste()
  const ondas = []
  const caindo = []
  const motor = over.semMotor
    ? () => null
    : () => ({
        ondularAgua: (...a) => ondas.push(a),
        blocosCaindo: { sincronizar: (l) => caindo.push(l.length) },
      })
  const publicadas = []
  let guardou = 0
  const soltos = []
  const mv = useRoqueCraftMundoVivo({
    world: () => world,
    motor,
    rede: {
      ativo: () => over.emRede?.() ?? false,
      codigo: () => 'ABCD',
      publicar: (...a) => publicadas.push(a),
    },
    guardar: () => guardou++,
    soltarItem: (...a) => soltos.push(a),
    ...(over.luzEm ? { luzEm: over.luzEm } : {}),
    ...(over.sorteio ? { sorteio: over.sorteio } : {}),
  })
  return { mv, world, ondas, caindo, publicadas, soltos, guardou: () => guardou }
}

const AREIA = BLOCK_BY_KEY.sand.id
const PEDRA = BLOCK_BY_KEY.stone.id
const AGUA_FONTE = FLUIDOS[AGUA].fonte

describe('useRoqueCraftMundoVivo', () => {
  // ── Edição ───────────────────────────────────────────────────────────────
  it('editar escreve, acorda a vizinhança e agenda o save', () => {
    const { mv, world, guardou } = montar()
    mv.editar(10, 64, 10, PEDRA)
    expect(world.getBlock(10, 64, 10)).toBe(PEDRA)
    // É por acordar a vizinhança que a areia descobre que perdeu o apoio,
    // INDEPENDENTE de como perdeu.
    expect(mv.fila.tamanho + mv.fila.esperando, 'a edição não acordou ninguém').toBeGreaterThan(0)
    expect(guardou()).toBe(1)
    expect(mv.coletar().length, 'a edição não entrou no save').toBeGreaterThan(0)
  })

  it('em SALA a edição vai pra rede, e NÃO pro save local', () => {
    // Numa sala quem guarda é o anfitrião; gravar dos dois lados faria dois
    // mundos divergirem em silêncio.
    const { mv, publicadas, guardou } = montar({ emRede: () => true })
    mv.editar(1, 2, 3, PEDRA)
    expect(publicadas[0]).toEqual(['ABCD', 1, 2, 3, PEDRA])
    expect(guardou(), 'gravou no save local estando em sala').toBe(0)
    expect(mv.coletar()).toEqual([])
  })

  it('editar encostado na lâmina faz onda; longe dela, não', () => {
    const molhado = mundoDeTeste()
    molhado.liquidAt = (x, y) => (y === 65 ? 1 : 0)
    const naAgua = montar({ world: molhado })
    naAgua.mv.editar(4, 64, 4, PEDRA)
    expect(naAgua.ondas[0]).toEqual([4.5, 4.5, ONDA_DA_EDICAO])

    const seco = montar()
    seco.mv.editar(4, 64, 4, PEDRA)
    expect(seco.ondas, 'ondulou água que não existe').toEqual([])
  })

  it('sem motor, editar não explode', () => {
    // Entre destruir e recriar o engine existe um intervalo real.
    const { mv, world } = montar({ semMotor: true })
    expect(() => mv.editar(0, 64, 0, PEDRA)).not.toThrow()
    expect(world.getBlock(0, 64, 0)).toBe(PEDRA)
  })

  // ── Fluido ───────────────────────────────────────────────────────────────
  it('⚠️ o fluido NÃO passa por `editar`: ele não entra no save nem na rede', () => {
    // Encher uma cova são milhares de células. Registrar tudo encheria o save
    // de estado derivado e afogaria a rede. O que se guarda é a FONTE.
    const { mv, publicadas, guardou } = montar({ emRede: () => true })
    mv.escreverFluido(5, 60, 5, AGUA_FONTE, 5)
    expect(publicadas, 'a água foi pra rede').toEqual([])
    expect(guardou(), 'a água entrou no autosave').toBe(0)
    expect(mv.coletar(), 'a água entrou no payload do save').toEqual([])
  })

  it('o fluido agenda as SETE células (ele e os seis vizinhos)', () => {
    const { mv } = montar()
    mv.escreverFluido(0, 60, 0, AGUA_FONTE, 5)
    // O atraso dos vizinhos É a velocidade do fluxo. Sem ele o lago inteiro se
    // espalha num quadro.
    expect(mv.fila.esperando + mv.fila.tamanho).toBeGreaterThanOrEqual(7)
  })

  it('a água escorre de uma fonte e converge', () => {
    // Piso de pedra INFINITO em y<=59, fonte em (0,60,0). A água tem que
    // espalhar até o alcance dela e PARAR - fluxo que não converge é
    // travamento, e é justamente isso que este número mede.
    //
    // ⚠️ O piso precisa ser infinito: num tabuleiro pequeno a água cai pela
    // borda e despenca pra sempre num mundo de teste sem fundo, e o teste
    // acusaria "não converge" medindo o cenário, não o fluido.
    const w = mundoDeTeste()
    const base = w.getBlock
    w.getBlock = (x, y, z) => (y <= 59 && y >= 0 ? PEDRA : base(x, y, z))
    const { mv } = montar({ world: w })
    // Pelo MESMO caminho do jogo: `escreverFluido` poe a fonte e agenda as sete
    // celulas. Agendar so a fonte nao espalharia nada - ela se ve como fonte e
    // volta, e sao os VIZINHOS que descobrem o nivel deles.
    mv.escreverFluido(0, 60, 0, AGUA_FONTE, 0)

    let tiques = 0
    while (tiques < 400 && (mv.fila.tamanho > 0 || mv.fila.esperando > 0)) {
      mv.passo(1 / 20)
      tiques++
    }
    expect(tiques, 'o fluxo não convergiu em 400 tiques').toBeLessThan(400)
    expect(w.getBlock(1, 60, 0), 'a água não saiu da fonte').not.toBe(AIR)
  })

  // ── Gravidade ────────────────────────────────────────────────────────────
  it('a areia sem apoio cai, e o buraco fica no lugar dela', () => {
    const w = mundoDeTeste()
    w.por(0, 60, 0, PEDRA) // chão
    w.por(0, 65, 0, AREIA) // areia solta cinco blocos acima
    const { mv } = montar({ world: w })
    mv.fila.agendarEm(0, 65, 0, 0)
    for (let i = 0; i < 300; i++) mv.passo(1 / 60)
    expect(w.getBlock(0, 65, 0), 'a areia ficou pendurada').toBe(AIR)
    expect(w.getBlock(0, 61, 0), 'a areia não pousou em cima da pedra').toBe(AREIA)
  })

  it('congelar segura a queda no ar, e descongelar solta', () => {
    const w = mundoDeTeste()
    w.por(0, 60, 0, PEDRA)
    w.por(0, 65, 0, AREIA)
    const { mv } = montar({ world: w })
    mv.congelar(true)
    mv.fila.agendarEm(0, 65, 0, 0)
    for (let i = 0; i < 300; i++) mv.passo(1 / 60)
    expect(mv.congelado()).toBe(true)
    expect(w.getBlock(0, 61, 0), 'caiu com a queda congelada').toBe(AIR)

    mv.congelar(false)
    for (let i = 0; i < 300; i++) mv.passo(1 / 60)
    expect(w.getBlock(0, 61, 0)).toBe(AREIA)
  })

  it('quem DESISTIU de cair vira item na altura dele, não no destino', () => {
    // Usar o destino faria o item aparecer num chão que ela nunca alcançou -
    // possivelmente do outro lado de um abismo sem fundo.
    const { mv, soltos, world } = montar()
    mv.pousarQueda({ id: AREIA, x: 3, y: 90.7, z: 4, destino: 5 }, 'desistiu')
    expect(soltos.length, 'quem desistiu evaporou').toBe(1)
    expect(soltos[0][3], 'o item nasceu no destino que ela nunca alcançou').toBeCloseTo(90.3, 5)
    expect(world.getBlock(3, 5, 4)).toBe(AIR)
  })

  it('pousar em cima de algo que apareceu no caminho vira item', () => {
    const w = mundoDeTeste()
    w.por(2, 10, 2, PEDRA) // alguém construiu no destino enquanto ela caía
    const { mv, soltos } = montar({ world: w })
    mv.pousarQueda({ id: AREIA, x: 2, y: 40, z: 2, destino: 10 }, 'pousou')
    expect(soltos.length, 'a areia comeu o bloco de quem construiu').toBe(1)
    expect(w.getBlock(2, 10, 2)).toBe(PEDRA)
  })

  it('pousar no vazio escreve o bloco pelo caminho do save', () => {
    const { mv, world, guardou } = montar()
    mv.pousarQueda({ id: AREIA, x: 2, y: 40, z: 2, destino: 10 }, 'pousou')
    expect(world.getBlock(2, 10, 2)).toBe(AREIA)
    expect(guardou(), 'a areia pousada ficou de fora do save').toBeGreaterThan(0)
  })

  // ── Cerca ────────────────────────────────────────────────────────────────
  it('a cerca se reconecta na mesma fila que faz a areia cair', () => {
    const chave = Object.keys(BLOCK_BY_KEY).find((k) => /fence/i.test(k) && !/gate/i.test(k))
    if (!chave) return
    const cerca = BLOCK_BY_KEY[chave].id
    const w = mundoDeTeste()
    w.por(0, 64, 0, cerca)
    const { mv } = montar({ world: w })
    // Vizinho sólido de um lado: a variante tem que mudar.
    w.por(1, 64, 0, PEDRA)
    const mudou = mv.reconectarCerca(0, 64, 0)
    expect(mudou, 'a cerca ficou com a ponta solta ao lado da parede').toBe(true)

    // ⚠️ E SÓ ESCREVE QUANDO MUDA: chamar de novo tem que devolver false, senão
    // a fila se realimenta pra sempre e o save grava edição idêntica por quadro.
    expect(mv.reconectarCerca(0, 64, 0), 'a cerca se reescreveu sem mudar nada').toBe(false)
  })

  // ⚠️ `(def.opaque && def.solid)` sobrevivia a `||`, e o catálogo tem 80 e
  // poucos blocos SÓLIDOS QUE NÃO SÃO OPACOS: vidro, folha, escada, laje,
  // cama, bambu. Com `||`, a cerca nasce com um toco ligado no vidro da estufa
  // e na folha da árvore ao lado -- o curral fica costurado no cenário.
  it('a cerca liga em parede cheia, e NÃO em vidro nem em folha', () => {
    const chave = Object.keys(BLOCK_BY_KEY).find((k) => /fence/i.test(k) && !/gate/i.test(k))
    if (!chave) return
    const cerca = BLOCK_BY_KEY[chave].id

    const comVidro = mundoDeTeste()
    comVidro.por(0, 64, 0, cerca)
    comVidro.por(1, 64, 0, BLOCK_BY_KEY.glass.id)
    expect(
      montar({ world: comVidro }).mv.reconectarCerca(0, 64, 0),
      'a cerca costurou um toco no vidro',
    ).toBe(false)

    const comFolha = mundoDeTeste()
    comFolha.por(0, 64, 0, cerca)
    comFolha.por(1, 64, 0, BLOCK_BY_KEY.oakLeaves.id)
    expect(
      montar({ world: comFolha }).mv.reconectarCerca(0, 64, 0),
      'a cerca costurou um toco na folhagem',
    ).toBe(false)

    // E o portão, que NÃO é bloco cheio, tem que ligar assim mesmo: sem ele na
    // lista a cerca ao lado nasceria com a ponta solta bem na entrada.
    const comPortao = mundoDeTeste()
    comPortao.por(0, 64, 0, cerca)
    comPortao.por(1, 64, 0, BLOCK_BY_KEY.oakGate.id)
    expect(montar({ world: comPortao }).mv.reconectarCerca(0, 64, 0)).toBe(true)
  })

  it('bloco que não é cerca não vira cerca', () => {
    const w = mundoDeTeste()
    w.por(0, 64, 0, PEDRA)
    const { mv } = montar({ world: w })
    expect(mv.reconectarCerca(0, 64, 0)).toBe(false)
  })

  // ── Passo ────────────────────────────────────────────────────────────────
  it('o passo avança o relógio ANTES de drenar', () => {
    // Senão o fluxo perde um quadro a cada passo e escorre na metade da
    // velocidade. Uma célula agendada com atraso tem que sair na mesma chamada
    // em que o relógio a alcança.
    const w = mundoDeTeste()
    w.por(0, 59, 0, PEDRA)
    w.por(0, 60, 0, AGUA_FONTE)
    const { mv } = montar({ world: w })
    const drenar = vi.spyOn(mv.fila, 'drenar')
    const avancar = vi.spyOn(mv.fila, 'avancarTempo')
    mv.passo(1 / 20)
    expect(avancar.mock.invocationCallOrder[0]).toBeLessThan(drenar.mock.invocationCallOrder[0])
  })

  it('o passo entrega as quedas ao motor pra desenhar', () => {
    const { mv, caindo } = montar()
    mv.passo(1 / 60)
    expect(caindo.length, 'o motor não soube o que está caindo').toBe(1)
  })

  it('ID e AIR vêm do serviço, não de números soltos aqui', () => {
    // guarda de sanidade do próprio teste
    expect(AIR).toBe(0)
    expect(typeof ID).toBe('object')
  })
})

// ── A LAVOURA NA FILA ───────────────────────────────────────────────────────
//
// ⚠️ ESTA É A PARTE DA AGRICULTURA QUE `agricultura.js` NÃO PODE PROVAR.
//
// Lá mora a regra ("com luz 15 em solo arado, o estágio 3 vira 4"). Aqui mora a
// coisa que faz a regra acontecer sozinha: a fila deste jogo é REATIVA, só
// acorda quem tem vizinho mexido, e plantação não tem vizinho mexendo. Se a
// visita não se repuser na fila, o trigo plantado fica no estágio 0 para sempre
// e nada, em teste nenhum de unidade, acusa isso.
describe('lavoura', () => {
  const comSol = { luzEm: () => 15 }
  /**
   * (definido no topo do arquivo)
   * Sorteio DETERMINÍSTICO que falha três vezes e passa na quarta — 25% exatos.
   *
   * ⚠️ NÃO PODE SER `() => 0`, e isso custou um mutante. Com o sorteio sempre
   * favorável, toda visita avança o estágio e chama `editar`, que acorda os
   * SETE vizinhos (a própria célula entre eles): a cadeia se mantém sozinha e o
   * teste fica verde mesmo com o reagendamento REMOVIDO. O reagendamento só
   * importa quando o sorteio FALHA — é aí que a célula sairia da fila para
   * sempre. O sorteio que falha é o que dá dente ao teste.
   */
  const semSorte = { luzEm: () => 15, sorteio: deQuatroEmQuatro() }

  it('a visita avança o estágio e se REAGENDA', () => {
    const world = mundoDeTeste({ '0,10,0': ID.farmland, '0,11,0': ID.wheat0 })
    const { mv } = montar({ world, luzEm: () => 15, sorteio: deQuatroEmQuatro() })
    mv.fila.agendar(0, 11, 0)
    // ⚠️ A COBRANÇA É A ESPIGA MADURA, e não "andou um estágio".
    //
    // Com um estágio só, o teste passaria mesmo sem reagendamento nenhum: a
    // primeira visita tem 25% de chance de avançar, e um teste que passa em uma
    // de cada quatro execuções do mutante não prova nada. Chegar ao estágio 7
    // exige SETE visitas bem-sucedidas, e isso só acontece se a célula voltar
    // pra fila sozinha.
    for (let i = 0; i < 400; i++) {
      mv.fila.avancarTempo(1)
      mv.fila.drenar(mv.visitarCelula)
    }
    expect(world.getBlock(0, 11, 0)).toBe(ID.wheat7)
  })

  it('sem reagendamento a fila esvazia — a prova de que ela se repõe', () => {
    const world = mundoDeTeste({ '0,10,0': ID.farmland, '0,11,0': ID.wheat0 })
    const { mv } = montar({ world, ...comSol })
    mv.fila.agendar(0, 11, 0)
    mv.fila.drenar(mv.visitarCelula)
    // ⚠️ A COBRANÇA É "CONTINUA NA FILA", somando os dois lados, e cada
    // tentativa de ser mais específico deu teste FLAKY: quando a visita avança
    // o estágio ela chama `editar`, que acorda os sete vizinhos IMEDIATAMENTE —
    // e aí a célula fica em `pendentes` em vez de no anel. Cobrar `tamanho === 0`
    // reprovava em uma de cada quatro execuções; cobrar `esperando > 0`
    // reprovava nas outras três. O que importa é que ela não sumiu.
    expect(mv.fila.tamanho + mv.fila.esperando).toBeGreaterThan(0)
    let visitas = 0
    for (let i = 0; i < 100; i++) {
      mv.fila.avancarTempo(1)
      visitas += mv.fila.drenar(mv.visitarCelula)
    }
    expect(visitas).toBeGreaterThan(5)
  })

  it('no escuro ela é visitada e NÃO anda', () => {
    const world = mundoDeTeste({ '0,10,0': ID.farmland, '0,11,0': ID.wheat0 })
    const { mv } = montar({ world, luzEm: () => 2 })
    mv.fila.agendar(0, 11, 0)
    for (let i = 0; i < 200; i++) {
      mv.fila.avancarTempo(1)
      mv.fila.drenar(mv.visitarCelula)
    }
    expect(world.getBlock(0, 11, 0)).toBe(ID.wheat0)
  })

  it('quebrar o solo mata o talo e ele vira item', () => {
    const world = mundoDeTeste({ '0,10,0': ID.farmland, '0,11,0': ID.wheat3 })
    const { mv, soltos } = montar({ world, ...comSol })
    mv.editar(0, 10, 0, AIR)
    mv.fila.drenar(mv.visitarCelula)
    expect(world.getBlock(0, 11, 0)).toBe(AIR)
    expect(soltos.map((s) => s[0])).toContain('wheat_seeds')
  })

  it('a madura para de se reagendar: nada mais a fazer ali', () => {
    const world = mundoDeTeste({ '0,10,0': ID.farmland, '0,11,0': ID.wheat7 })
    const { mv } = montar({ world, ...comSol })
    mv.fila.agendar(0, 11, 0)
    let visitas = 0
    for (let i = 0; i < 100; i++) {
      mv.fila.avancarTempo(1)
      visitas += mv.fila.drenar(mv.visitarCelula)
    }
    expect(visitas).toBe(1)
    expect(world.getBlock(0, 11, 0)).toBe(ID.wheat7)
  })
})

// ── A MUDA NA FILA ──────────────────────────────────────────────────────────
describe('muda', () => {
  const comSol = { luzEm: () => 15 }

  it('plantada em terra com céu, vira árvore de verdade', () => {
    const world = mundoDeTeste({ '0,64,0': ID.dirt, '0,65,0': ID.oakSapling })
    const { mv } = montar({ world, luzEm: () => 15, sorteio: () => 0 })
    mv.fila.agendar(0, 65, 0)
    for (let i = 0; i < 600; i++) {
      mv.fila.avancarTempo(1)
      mv.fila.drenar(mv.visitarCelula)
    }
    // O pé virou tronco e há folha acima: é árvore, não muda.
    expect(world.getBlock(0, 65, 0)).toBe(ID.oakLog)
    let folhas = 0
    for (let y = 66; y < 80; y++) {
      for (let x = -2; x <= 2; x++) {
        for (let z = -2; z <= 2; z++) if (world.getBlock(x, y, z) === ID.oakLeaves) folhas++
      }
    }
    expect(folhas).toBeGreaterThan(8)
  })

  it('sem céu (teto de pedra) ela fica muda para sempre', () => {
    const celulas = { '0,64,0': ID.dirt, '0,65,0': ID.oakSapling }
    for (let y = 66; y < 72; y++) celulas[`0,${y},0`] = ID.stone
    const world = mundoDeTeste(celulas)
    const { mv } = montar({ world, ...comSol })
    mv.fila.agendar(0, 65, 0)
    for (let i = 0; i < 600; i++) {
      mv.fila.avancarTempo(1)
      mv.fila.drenar(mv.visitarCelula)
    }
    expect(world.getBlock(0, 65, 0)).toBe(ID.oakSapling)
  })

  it('quebrar o chão derruba a muda e devolve o item', () => {
    const world = mundoDeTeste({ '0,64,0': ID.dirt, '0,65,0': ID.oakSapling })
    const { mv, soltos } = montar({ world, ...comSol })
    mv.editar(0, 64, 0, AIR)
    mv.fila.drenar(mv.visitarCelula)
    expect(world.getBlock(0, 65, 0)).toBe(AIR)
    expect(soltos.map((s) => s[0])).toContain('oakSapling')
  })
})

// ── O CANTEIRO NA FILA ──────────────────────────────────────────────────────
describe('hidratação', () => {
  const rodar = (mv, n = 40) => {
    mv.fila.agendar(0, 64, 0)
    for (let i = 0; i < n; i++) {
      mv.fila.avancarTempo(1)
      mv.fila.drenar(mv.visitarCelula)
    }
  }

  it('água a quatro blocos molha o canteiro', () => {
    const world = mundoDeTeste({ '0,64,0': ID.farmland, '4,64,0': ID.water })
    world.liquidAt = (x, y, z) => world.getBlock(x, y, z) === ID.water
    const { mv } = montar({ world })
    rodar(mv)
    expect(world.getBlock(0, 64, 0)).toBe(ID.farmlandWet)
  })

  it('água a cinco blocos NÃO molha — o raio é o que desenha o canteiro', () => {
    const world = mundoDeTeste({ '0,64,0': ID.farmland, '5,64,0': ID.water })
    world.liquidAt = (x, y, z) => world.getBlock(x, y, z) === ID.water
    const { mv } = montar({ world })
    rodar(mv)
    expect(world.getBlock(0, 64, 0)).toBe(ID.farmland)
  })

  it('tirada a água, o canteiro seca sozinho', () => {
    const world = mundoDeTeste({ '0,64,0': ID.farmlandWet, '2,64,0': ID.water })
    world.liquidAt = (x, y, z) => world.getBlock(x, y, z) === ID.water
    const { mv } = montar({ world })
    rodar(mv, 10)
    expect(world.getBlock(0, 64, 0)).toBe(ID.farmlandWet)
    world.por(2, 64, 0, AIR)
    rodar(mv, 40)
    expect(world.getBlock(0, 64, 0)).toBe(ID.farmland)
  })
})

// ── O SAVE QUE VOLTA ────────────────────────────────────────────────────────
//
// ⚠️ ESTE É O DEFEITO QUE SÓ APARECE ENTRE DUAS SESSÕES, e por isso nenhum
// teste de crescimento o pegaria: dentro de UMA partida tudo funciona, porque
// quem plantou acabou de agendar a célula. Ao carregar um mundo salvo ninguém
// começa a cadeia — o jogador volta no dia seguinte e o broto está do mesmo
// tamanho, parado para sempre, até quebrar um bloco por perto sem querer.
describe('acordar o que cresce depois de carregar o save', () => {
  it('agenda lavoura, muda e canteiro que vieram do registro de edições', () => {
    const world = mundoDeTeste()
    const { mv } = montar({ world, luzEm: () => 15 })
    // Simula o que o carregamento faz: as edições do save entram no registro.
    const por = (x, y, z, id) => {
      world.por(x, y, z, id)
      mv.mapaDeEdicoes.set(`0,0`, mv.mapaDeEdicoes.get('0,0') || new Map())
      mv.mapaDeEdicoes.get('0,0').set((x * 16 + z) * 128 + y, id)
    }
    por(1, 64, 1, ID.farmland)
    por(1, 65, 1, ID.wheat0)
    por(2, 64, 2, ID.dirt) // terra comum não precisa de relógio
    por(2, 65, 2, ID.oakSapling)
    por(3, 64, 3, ID.stone) // nem pedra

    // Três: o canteiro, o broto e a muda. A terra e a pedra ficam de fora — e
    // é isso que impede a fila de encher com o mundo inteiro que o jogador
    // construiu ao longo de meses.
    expect(mv.acordarPlantios()).toBe(3)
  })

  it('e o que foi acordado cresce de verdade', () => {
    const world = mundoDeTeste({ '1,64,1': ID.farmland, '1,65,1': ID.wheat0 })
    const { mv } = montar({ world, luzEm: () => 15, sorteio: () => 0 })
    mv.mapaDeEdicoes.set('0,0', new Map([[(1 * 16 + 1) * 128 + 65, ID.wheat0]]))
    mv.acordarPlantios()
    for (let i = 0; i < 400; i++) {
      mv.fila.avancarTempo(1)
      mv.fila.drenar(mv.visitarCelula)
    }
    expect(world.getBlock(1, 65, 1)).toBe(ID.wheat7)
  })

  it('sem acordar, a lavoura do save fica parada — a prova do defeito', () => {
    const world = mundoDeTeste({ '1,64,1': ID.farmland, '1,65,1': ID.wheat0 })
    const { mv } = montar({ world, luzEm: () => 15 })
    for (let i = 0; i < 400; i++) {
      mv.fila.avancarTempo(1)
      mv.fila.drenar(mv.visitarCelula)
    }
    expect(world.getBlock(1, 65, 1)).toBe(ID.wheat0)
  })
})

// ── O CAULE NA FILA ─────────────────────────────────────────────────────────
describe('caule de abóbora', () => {
  const chao = () => {
    const c = { '0,64,0': ID.farmland, '0,65,0': ID.pumpkinStem7 }
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      c[`${dx},64,${dz}`] = ID.dirt
    }
    return c
  }
  const frutosEmVolta = (world) =>
    [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].filter(([dx, dz]) => world.getBlock(dx, 65, dz) === ID.pumpkin).length

  it('o caule maduro dá abóbora num dos lados', () => {
    const world = mundoDeTeste(chao())
    const { mv } = montar({ world, luzEm: () => 15, sorteio: () => 0 })
    mv.fila.agendar(0, 65, 0)
    for (let i = 0; i < 60; i++) {
      mv.fila.avancarTempo(1)
      mv.fila.drenar(mv.visitarCelula)
    }
    expect(frutosEmVolta(world)).toBeGreaterThan(0)
  })

  it('⚠️ e CONTINUA na fila depois de dar: a horta é máquina, não replantio', () => {
    const world = mundoDeTeste(chao())
    // ⚠️ SORTEIO QUE FALHA, e é o que dá dente ao teste. Com `() => 0` toda
    // visita frutifica, e `editar` do fruto acorda os vizinhos — o caule entre
    // eles: a cadeia se mantém sozinha e o mutante sem reagendamento passa. O
    // reagendamento só importa na visita que FALHA, que é quando nada é
    // editado e o caule sairia da fila para sempre.
    const { mv } = montar({ world, luzEm: () => 15, sorteio: deQuatroEmQuatro() })
    mv.fila.agendar(0, 65, 0)
    for (let i = 0; i < 300; i++) {
      mv.fila.avancarTempo(1)
      mv.fila.drenar(mv.visitarCelula)
    }
    // Com os quatro lados livres e o sorteio sempre favorável, ele enche os
    // quatro. Um caule que saísse da fila daria UMA abóbora na vida.
    expect(frutosEmVolta(world)).toBe(4)
    expect(world.getBlock(0, 65, 0)).toBe(ID.pumpkinStem7)
  })

  it('sem chão ao lado, não nasce fruto nenhum', () => {
    const world = mundoDeTeste({ '0,64,0': ID.farmland, '0,65,0': ID.pumpkinStem7 })
    const { mv } = montar({ world, luzEm: () => 15, sorteio: () => 0 })
    mv.fila.agendar(0, 65, 0)
    for (let i = 0; i < 100; i++) {
      mv.fila.avancarTempo(1)
      mv.fila.drenar(mv.visitarCelula)
    }
    expect(frutosEmVolta(world)).toBe(0)
  })

  it('o caule VERDE não dá nada, só cresce', () => {
    const c = chao()
    c['0,65,0'] = ID.pumpkinStem0
    const world = mundoDeTeste(c)
    const { mv } = montar({ world, luzEm: () => 15, sorteio: deQuatroEmQuatro() })
    mv.fila.agendar(0, 65, 0)
    for (let i = 0; i < 12; i++) {
      mv.fila.avancarTempo(1)
      mv.fila.drenar(mv.visitarCelula)
    }
    expect(frutosEmVolta(world)).toBe(0)
  })
})

// ── A CANA NA MARGEM ────────────────────────────────────────────────────────
describe('cana', () => {
  const margem = (altura = 1) => {
    const c = { '0,63,0': ID.sand, '1,63,0': ID.water }
    for (let i = 0; i < altura; i++) c[`0,${64 + i},0`] = ID.sugarCane
    return c
  }
  const comAgua = (world) => {
    world.liquidAt = (x, y, z) => world.getBlock(x, y, z) === ID.water
    return world
  }
  const rodar = (mv, x, y, z, n = 200) => {
    mv.fila.agendar(x, y, z)
    for (let i = 0; i < n; i++) {
      mv.fila.avancarTempo(1)
      mv.fila.drenar(mv.visitarCelula)
    }
  }
  const alturaDaCana = (world) => {
    let n = 0
    for (let y = 64; y < 72; y++) if (world.getBlock(0, y, 0) === ID.sugarCane) n++
    return n
  }

  it('sobe até três na margem, e para', () => {
    const world = comAgua(mundoDeTeste(margem()))
    const { mv } = montar({ world, luzEm: () => 15, sorteio: () => 0 })
    rodar(mv, 0, 64, 0)
    expect(alturaDaCana(world)).toBe(3)
  })

  it('⚠️ só o TOPO cresce: o pé não se multiplica pra dentro de si', () => {
    const world = comAgua(mundoDeTeste(margem(3)))
    const { mv } = montar({ world, luzEm: () => 15, sorteio: () => 0 })
    rodar(mv, 0, 64, 0)
    rodar(mv, 0, 65, 0)
    expect(alturaDaCana(world)).toBe(3)
  })

  it('sem água encostada na base, não cresce', () => {
    const world = mundoDeTeste({ '0,63,0': ID.sand, '0,64,0': ID.sugarCane })
    world.liquidAt = () => false
    const { mv } = montar({ world, luzEm: () => 15, sorteio: () => 0 })
    rodar(mv, 0, 64, 0)
    expect(alturaDaCana(world)).toBe(0) // e mais: ela CAI, porque perdeu a margem
  })

  it('em pedra não pega, mesmo com água do lado', () => {
    const world = comAgua(
      mundoDeTeste({ '0,63,0': ID.stone, '1,63,0': ID.water, '0,64,0': ID.sugarCane }),
    )
    const { mv } = montar({ world, luzEm: () => 15, sorteio: () => 0 })
    rodar(mv, 0, 64, 0)
    expect(world.getBlock(0, 64, 0)).toBe(AIR)
  })

  it('quem perde a margem vira item, e não some', () => {
    const world = comAgua(mundoDeTeste(margem(2)))
    const { mv, soltos } = montar({ world, luzEm: () => 15, sorteio: () => 0 })
    world.por(1, 63, 0, AIR) // tirou a água
    rodar(mv, 0, 65, 0, 40)
    expect(soltos.map((s) => s[0])).toContain('sugarCane')
  })
})
