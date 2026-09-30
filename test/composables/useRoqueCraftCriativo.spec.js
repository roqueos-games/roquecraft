import { describe, it, expect } from 'vitest'
import { ref, nextTick } from 'vue'
import { useRoqueCraftCriativo } from '../../src/composables/useRoqueCraftCriativo.js'

//
// O ESTADO DA REGÊNCIA — quem pode abrir, o que o cadeado faz, e o que acontece
// quando o modo muda por baixo do painel.
//
// ⚠️ A REGRA PURA JÁ TEM TESTE EM `criativo.spec.js`. O que se prova aqui é a
// FIAÇÃO: que o composable chama os donos de fora (o clima, o relógio) em vez
// de guardar cópias, e que o vigia do modo desarma o painel. Repetir aqui a
// aritmética de `velocidadeDoRelogio` seria testar o teste do vizinho.
//

function montar(modoInicial = 'creative', over = {}) {
  const modo = ref(modoInicial)
  // ⚠️ `avisos` guarda a CHAVE, e não um contador. Eram dois caminhos de
  // recado (`avisarSoCriativo` e `avisar`) fazendo a mesma chamada com chaves
  // diferentes; viraram um só, e o teste passou a conferir O QUE foi dito.
  const chamadas = { chuva: [], avisos: [], horas: [], raios: 0, destinos: [], pontos: [] }
  // O mundo de mentira da onda 4: a dimensão e a posição MUDAM quando a
  // travessia aceita, como no jogo, senão "voltar" não teria de onde voltar.
  const mundo = { dimensao: over.dimensaoInicial ?? 'overworld', x: 10.5, y: 70, z: -20.5 }
  const c = useRoqueCraftCriativo({
    modo: () => modo.value,
    forcarChuva: (v) => chamadas.chuva.push(v),
    instante: () => 7200,
    irParaHora: (t) => chamadas.horas.push(t),
    chuvaForcada: () => 0.4,
    bioma: () => 'Tundra',
    nevando: () => true,
    soltarRaio: () => chamadas.raios++,
    dimensao: over.dimensao ?? (() => mundo.dimensao),
    irParaDimensao: (d, alvo = null) => {
      chamadas.destinos.push(alvo ? { d, alvo } : d)
      if (over.travessiaAceita === false) return false
      mundo.dimensao = d
      if (alvo) Object.assign(mundo, { x: alvo.x, y: alvo.y, z: alvo.z })
      return true
    },
    irAte: (alvo) => {
      chamadas.pontos.push({ ...alvo })
      if (over.pousoAceito === false) return false
      Object.assign(mundo, { x: alvo.x, y: alvo.y ?? 64, z: alvo.z })
      return true
    },
    posicao: () => ({ x: mundo.x, y: mundo.y, z: mundo.z }),
    lugar: over.lugar ?? (() => null),
    emSala: over.emSala ?? (() => false),
    avisar: (chave) => chamadas.avisos.push(chave),
  })
  c.vigiarModo(modo)
  return { c, modo, chamadas, mundo }
}

describe('useRoqueCraftCriativo', () => {
  it('no criativo o painel abre e fecha na mesma porta', () => {
    const { c } = montar('creative')
    expect(c.aberto.value).toBe(false)
    expect(c.alternar()).toBe(true)
    expect(c.aberto.value).toBe(true)
    expect(c.alternar()).toBe(false)
    expect(c.aberto.value).toBe(false)
  })

  it('⚠️ em sobrevivência ele NÃO abre, e avisa', () => {
    const { c, chamadas } = montar('survival')
    expect(c.alternar()).toBe(false)
    expect(c.aberto.value, 'abriu onde não devia').toBe(false)
    expect(chamadas.avisos, 'recusou calado — o jogador acha que a tecla quebrou').toEqual([
      'roqueCraft.flyCreativeOnly',
    ])
  })

  it('⚠️ trocar de modo com o painel aberto fecha e SOLTA o cadeado', () => {
    const { c, modo } = montar('creative')
    c.alternar()
    c.travado.value = true
    modo.value = 'survival'
    return nextTick().then(() => {
      expect(c.aberto.value, 'painel de criativo sobreviveu em sobrevivência').toBe(false)
      expect(
        c.travado.value,
        'relógio ficou travado sem porta para destravar: o mundo parou para sempre',
      ).toBe(false)
    })
  })

  it('o vigia só reage quando o modo SAI do criativo', async () => {
    const { c, modo } = montar('creative')
    c.alternar()
    modo.value = 'creative'
    await nextTick()
    expect(c.aberto.value, 'fechou sem motivo').toBe(true)
  })

  it('a velocidade do relógio segue o cadeado', () => {
    const { c } = montar()
    expect(c.velocidade()).toBe(1)
    c.travado.value = true
    expect(c.velocidade()).toBe(0)
  })

  it('soltar devolve o clima ao MUNDO e destrava', () => {
    const { c, chamadas } = montar()
    c.travado.value = true
    c.soltar()
    expect(c.travado.value).toBe(false)
    // `null`, e não zero: zero seria céu limpo forçado.
    expect(chamadas.chuva).toEqual([null])
  })

  it('a vista sai dos donos de fora, e não de cópias', () => {
    const { c } = montar()
    expect(c.vista.value).toEqual({
      ticks: 7200,
      travado: false,
      chuva: 0.4,
      bioma: 'Tundra',
      neva: true,
      // A dimensão e a sala entraram na onda 3: o painel desliga o botão de
      // onde o jogador já está, e explica a recusa em sala.
      dimensao: 'overworld',
      emSala: false,
      // Onda 4: "voltar" e a cama são ligados ou desligados pelo painel.
      podeVoltar: false,
      temCama: false,
    })
  })

  it('cada ação bate no dono certo', () => {
    const { c, chamadas } = montar()
    c.alternar()
    c.acoes.hora(18000)
    c.acoes.chuva(0.7)
    c.acoes.raio()
    c.acoes.travar(true)
    expect(chamadas.horas).toEqual([18000])
    expect(chamadas.chuva).toEqual([0.7])
    expect(chamadas.raios).toBe(1)
    expect(c.travado.value).toBe(true)
    c.acoes.close()
    expect(c.aberto.value).toBe(false)
  })

  it('vigiarModo não estoura sem ninguém observando', () => {
    const { c } = montar()
    expect(() => c.vigiarModo(ref('creative'))).not.toThrow()
  })
})

// ⚠️ O TELEPORTE (Goal 23, onda 3). As três recusas são DITAS ao jogador, e não
// engolidas: um botão que não faz nada e não explica é o pior dos três estados
// — o jogador clica de novo, acha que o jogo travou, e o defeito que ele relata
// é "o teleporte não funciona", sem dizer que estava numa sala.
describe('useRoqueCraftCriativo — o teleporte', () => {
  it('no criativo, manda o destino para a travessia', () => {
    const { c, chamadas } = montar('creative')
    expect(c.teleportar('nether')).toBe(true)
    expect(chamadas.destinos).toEqual(['nether'])
    expect(chamadas.avisos, 'avisou sem precisar').toEqual([])
  })

  it('em sobrevivência NÃO teleporta, e diz por quê', () => {
    const { c, chamadas } = montar('survival')
    expect(c.teleportar('nether')).toBe(false)
    expect(chamadas.destinos, 'a travessia foi chamada em sobrevivência').toEqual([])
    expect(chamadas.avisos).toEqual(['roqueCraft.flyCreativeOnly'])
  })

  it('em sala NÃO teleporta, e diz por quê', () => {
    const { c, chamadas } = montar('creative', { emSala: () => true })
    expect(c.teleportar('nether')).toBe(false)
    expect(chamadas.destinos, 'publicaria netherrack no mundo dos outros').toEqual([])
    expect(chamadas.avisos).toEqual(['roqueCraft.criativo.naSalaNao'])
  })

  it('ir para onde já se está não faz nada, e não avisa: não é erro', () => {
    const { c, chamadas } = montar('creative', { dimensao: () => 'nether' })
    expect(c.teleportar('nether')).toBe(false)
    expect(chamadas.destinos).toEqual([])
    expect(chamadas.avisos, 'assustou o jogador por um clique inofensivo').toEqual([])
  })

  // A travessia recusa sozinha no meio de outra troca. Se ela disse não, o
  // jogador precisa saber por que o clique não fez nada.
  it('se a travessia recusar, o jogador é avisado', () => {
    const { c, chamadas } = montar('creative', { travessiaAceita: false })
    expect(c.teleportar('end')).toBe(false)
    expect(chamadas.destinos).toEqual(['end'])
    expect(chamadas.avisos).toEqual(['roqueCraft.criativo.agoraNao'])
  })

  it('a vista leva a dimensão viva e o estado de sala para o painel', () => {
    const { c } = montar('creative', { dimensao: () => 'end', emSala: () => true })
    expect(c.vista.value.dimensao).toBe('end')
    expect(c.vista.value.emSala).toBe(true)
  })
})

// GOAL 23, ONDA 4: lugares, coordenada e voltar. O que se prova é a FIAÇÃO e
// as recusas ditas; onde cada lugar fica é de `lugares.js`, e o pouso é da
// travessia.
describe('useRoqueCraftCriativo — lugares, coordenada e voltar', () => {
  const LUGARES = {
    nascimento: { dimensao: 'overworld', x: 0.5, y: 66, z: 0.5 },
    vila: { dimensao: 'overworld', x: -392, y: 65, z: -104 },
    fortaleza: { dimensao: 'overworld', x: 260, y: 67, z: -168 },
  }
  const comLugares = (over = {}) =>
    montar('creative', { lugar: (chave) => LUGARES[chave] ?? null, ...over })

  it('um lugar na mesma dimensão é POUSO (`irAte`), e lembra de onde saiu', () => {
    const { c, chamadas, mundo } = comLugares()
    expect(c.irAoLugar('vila')).toBe(true)
    expect(chamadas.pontos).toEqual([LUGARES.vila])
    expect(chamadas.destinos, 'reconstruiu o mundo para andar na mesma dimensão').toEqual([])
    expect(mundo.x).toBe(-392)
    expect(c.historico.value).toEqual([{ dimensao: 'overworld', x: 10.5, y: 70, z: -20.5 }])
    expect(c.vista.value.podeVoltar).toBe(true)
  })

  it('um lugar em OUTRA dimensão é travessia com alvo, e não coordenada escalada', () => {
    const { c, chamadas } = comLugares({ dimensaoInicial: 'nether' })
    expect(c.irAoLugar('fortaleza')).toBe(true)
    expect(chamadas.destinos).toEqual([{ d: 'overworld', alvo: LUGARES.fortaleza }])
    expect(chamadas.pontos).toEqual([])
  })

  it('a cama que não existe é DITA, e a vila que a semente não tem também', () => {
    const { c, chamadas } = comLugares()
    expect(c.irAoLugar('cama')).toBe(false)
    expect(chamadas.avisos).toEqual(['roqueCraft.criativo.semCama'])
    expect(c.vista.value.temCama).toBe(false)
    const semVila = montar('creative', { lugar: () => null })
    expect(semVila.c.irAoLugar('vila')).toBe(false)
    expect(semVila.chamadas.avisos).toEqual(['roqueCraft.criativo.semVila'])
  })

  it('com cama, o painel sabe (`temCama`) e vai até ela', () => {
    const cama = { dimensao: 'overworld', x: 3.5, y: 65, z: 4.5 }
    const { c, chamadas } = montar('creative', { lugar: (k) => (k === 'cama' ? cama : null) })
    expect(c.vista.value.temCama).toBe(true)
    expect(c.irAoLugar('cama')).toBe(true)
    expect(chamadas.pontos).toEqual([cama])
  })

  it('em sobrevivência e em sala, lugar e coordenada são recusados e ditos', () => {
    const sobrevivencia = comLugares()
    sobrevivencia.modo.value = 'survival'
    expect(sobrevivencia.c.irAoLugar('vila')).toBe(false)
    expect(sobrevivencia.c.irACoordenada({ x: '1', z: '2' })).toBe(false)
    expect(sobrevivencia.chamadas.avisos).toEqual([
      'roqueCraft.flyCreativeOnly',
      'roqueCraft.flyCreativeOnly',
    ])
    const sala = comLugares({ emSala: () => true })
    expect(sala.c.irAoLugar('vila')).toBe(false)
    expect(sala.c.voltar()).toBe(false)
    expect(sala.chamadas.avisos).toEqual([
      'roqueCraft.criativo.naSalaNao',
      'roqueCraft.criativo.naSalaNao',
    ])
    expect(sala.chamadas.pontos).toEqual([])
  })

  it('a coordenada digitada vai ao meio do bloco; sem Y, o Y fica para a travessia', () => {
    const { c, chamadas } = comLugares()
    expect(c.irACoordenada({ x: ' 300 ', y: '', z: '-200' })).toBe(true)
    expect(chamadas.pontos).toEqual([{ dimensao: 'overworld', x: 300.5, y: null, z: -199.5 }])
    expect(c.irACoordenada({ x: '1', y: '80', z: '1' })).toBe(true)
    expect(chamadas.pontos[1]).toEqual({ dimensao: 'overworld', x: 1.5, y: 80, z: 1.5 })
  })

  it('coordenada que não é coordenada é recusada e DITA, sem mexer no jogador', () => {
    const { c, chamadas } = comLugares()
    expect(c.irACoordenada({ x: 'abc', z: '1' })).toBe(false)
    expect(c.irACoordenada({ x: '1', z: '' })).toBe(false)
    expect(chamadas.avisos).toEqual([
      'roqueCraft.criativo.coordenadaInvalida',
      'roqueCraft.criativo.coordenadaInvalida',
    ])
    expect(chamadas.pontos).toEqual([])
    expect(c.historico.value).toEqual([])
  })

  it('se a travessia recusar o pouso, avisa e NÃO lembra: não houve saída', () => {
    const { c, chamadas } = comLugares({ pousoAceito: false })
    expect(c.irAoLugar('vila')).toBe(false)
    expect(chamadas.avisos).toEqual(['roqueCraft.criativo.agoraNao'])
    expect(c.historico.value).toEqual([])
  })

  it('voltar devolve à dimensão E à posição de origem, e anda o histórico', () => {
    const { c, chamadas, mundo } = comLugares()
    // Supermundo (10,70,−20) → Nether pelo botão da dimensão → vila (supermundo).
    expect(c.teleportar('nether')).toBe(true)
    mundo.x = 1
    mundo.z = -2
    expect(c.irAoLugar('vila')).toBe(true)
    expect(c.historico.value).toHaveLength(2)
    // Primeira volta: ao Nether, onde estava antes da vila (travessia com alvo).
    expect(c.voltar()).toBe(true)
    expect(chamadas.destinos.at(-1)).toEqual({
      d: 'nether',
      alvo: { dimensao: 'nether', x: 1, y: 70, z: -2 },
    })
    expect(mundo.dimensao).toBe('nether')
    expect(c.historico.value).toHaveLength(1)
    // Segunda volta: ao supermundo, onde tudo começou. Duas voltas andam duas
    // para trás, e não quicam entre os dois últimos pontos.
    expect(c.voltar()).toBe(true)
    expect(chamadas.destinos.at(-1)).toEqual({
      d: 'overworld',
      alvo: { dimensao: 'overworld', x: 10.5, y: 70, z: -20.5 },
    })
    expect(c.historico.value).toEqual([])
    expect(c.vista.value.podeVoltar).toBe(false)
    // Sem de onde voltar, não faz nada e não assusta.
    expect(c.voltar()).toBe(false)
    expect(chamadas.avisos).toEqual([])
  })

  it('as ações do painel batem nas mesmas portas', () => {
    const { c, chamadas } = comLugares()
    c.acoes.lugar('nascimento')
    c.acoes.coordenada({ x: '5', y: '', z: '5' })
    c.acoes.voltar()
    expect(chamadas.pontos).toHaveLength(3)
    expect(chamadas.pontos[0]).toEqual(LUGARES.nascimento)
    expect(chamadas.pontos[2].x).toBe(0.5)
  })
})
