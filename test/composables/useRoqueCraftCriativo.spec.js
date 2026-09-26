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
  const chamadas = { chuva: [], avisos: [], horas: [], raios: 0, destinos: [] }
  const c = useRoqueCraftCriativo({
    modo: () => modo.value,
    forcarChuva: (v) => chamadas.chuva.push(v),
    instante: () => 7200,
    irParaHora: (t) => chamadas.horas.push(t),
    chuvaForcada: () => 0.4,
    bioma: () => 'Tundra',
    nevando: () => true,
    soltarRaio: () => chamadas.raios++,
    dimensao: over.dimensao ?? (() => 'overworld'),
    irParaDimensao: (d) => {
      chamadas.destinos.push(d)
      return over.travessiaAceita ?? true
    },
    emSala: over.emSala ?? (() => false),
    avisar: (chave) => chamadas.avisos.push(chave),
  })
  c.vigiarModo(modo)
  return { c, modo, chamadas }
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
