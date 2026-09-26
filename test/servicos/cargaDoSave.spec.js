import { describe, it, expect, vi } from 'vitest'
import {
  CARGA,
  classificarCarga,
  podeSalvar,
  precisaAvisar,
  chaveDoAviso,
  carregarSave,
  avisarDaCarga,
} from '../../src/servicos/cargaDoSave.js'

describe('carga do save (RC-02)', () => {
  it('sem tentativa não é jogador novo', () => {
    expect(classificarCarga({ tentou: false })).toBe(CARGA.NAO_TENTOU)
  })

  it('leu e veio save', () => {
    expect(classificarCarga({ tentou: true, salvo: { seed: 7 } })).toBe(CARGA.CARREGADO)
  })

  it('leu e não havia save', () => {
    expect(classificarCarga({ tentou: true, salvo: null })).toBe(CARGA.VAZIO)
  })

  it('erro na leitura NÃO vira jogador novo', () => {
    // O defeito inteiro morava nesta linha: com `catch` mudo, o erro chegava
    // aqui como `salvo: null` e virava mundo novo.
    expect(classificarCarga({ tentou: true, erro: new Error('offline'), salvo: null })).toBe(
      CARGA.INDISPONIVEL,
    )
  })

  it('erro vence até quando algo voltou junto', () => {
    // Leitura parcial que estourou no meio não é leitura.
    expect(classificarCarga({ tentou: true, erro: new Error('x'), salvo: { seed: 1 } })).toBe(
      CARGA.INDISPONIVEL,
    )
  })

  it('só o indisponível barra a gravação', () => {
    expect(podeSalvar(CARGA.INDISPONIVEL)).toBe(false)
    expect(podeSalvar(CARGA.CARREGADO)).toBe(true)
    expect(podeSalvar(CARGA.VAZIO)).toBe(true)
    expect(podeSalvar(CARGA.NAO_TENTOU)).toBe(true)
  })

  it('o mundo novo não gera aviso; a falha gera', () => {
    expect(precisaAvisar(CARGA.VAZIO)).toBe(false)
    expect(precisaAvisar(CARGA.INDISPONIVEL)).toBe(true)
    expect(chaveDoAviso(CARGA.VAZIO)).toBe(null)
    expect(chaveDoAviso(CARGA.INDISPONIVEL)).toBe('roqueCraft.error.saveIndisponivel')
  })

  it('a jornada do defeito, ponta a ponta', () => {
    // Jogador com mundo de meses. O Firestore cai no boot.
    const estado = classificarCarga({ tentou: true, erro: new Error('unavailable'), salvo: null })
    // O jogo começa mundo novo (não há o que carregar)...
    expect(estado).toBe(CARGA.INDISPONIVEL)
    // ...mas NÃO grava esse mundo novo por cima do que está no servidor.
    expect(podeSalvar(estado)).toBe(false)
    // E o jogador fica sabendo, em vez de descobrir depois.
    expect(chaveDoAviso(estado)).toBeTruthy()
  })
})

// ⚠️ AS DUAS DE BAIXO NÃO TINHAM TESTE NO FRONT, e as duas mudaram na extração:
// `carregarSave` perguntava pelo uid e agora pergunta ao host se há onde
// guardar; `avisarDaCarga` falava com a store do RoqueOS (`timeout: 0`) e agora
// fala com o `host.avisar` (`fixo: true`). Mudança sem teste é a próxima RC-02.
describe('carregarSave, a carga já classificada', () => {
  it('sem onde guardar (convidado) nem pergunta: NÃO_TENTOU', async () => {
    const ler = vi.fn()
    const r = await carregarSave({ disponivel: false, ler })
    expect(r).toEqual({ salvo: null, estado: CARGA.NAO_TENTOU, aviso: null, erro: null })
    expect(ler).not.toHaveBeenCalled()
  })

  it('em modo E2E também não pergunta: o harness não lê o save do founder', async () => {
    const ler = vi.fn()
    expect((await carregarSave({ disponivel: true, ehE2E: true, ler })).estado).toBe(
      CARGA.NAO_TENTOU,
    )
    expect(ler).not.toHaveBeenCalled()
  })

  it('com conta, lê: CARREGADO ou VAZIO, sem aviso', async () => {
    const cheio = await carregarSave({ disponivel: true, ler: async () => ({ seed: 7 }) })
    expect(cheio).toMatchObject({ salvo: { seed: 7 }, estado: CARGA.CARREGADO, aviso: null })
    const vazio = await carregarSave({ disponivel: true, ler: async () => null })
    expect(vazio).toMatchObject({ salvo: null, estado: CARGA.VAZIO, aviso: null })
  })

  it('leitura que rejeita vira INDISPONÍVEL com o aviso, e guarda o erro', async () => {
    const erro = Object.assign(new Error('fora do ar'), { codigo: 'indisponivel' })
    const r = await carregarSave({ disponivel: true, ler: () => Promise.reject(erro) })
    expect(r.estado).toBe(CARGA.INDISPONIVEL)
    expect(r.aviso).toBe('roqueCraft.error.saveIndisponivel')
    expect(r.erro).toBe(erro)
    expect(r.salvo).toBe(null)
  })
})

describe('avisarDaCarga, o que o jogador vê', () => {
  it('a falha vira aviso de ERRO e FIXO (fica até o jogador fechar), e vai ao console', () => {
    const avisar = vi.fn()
    const logar = vi.fn()
    const carga = { aviso: 'roqueCraft.error.saveIndisponivel', erro: new Error('x') }
    expect(avisarDaCarga(carga, (k) => `T:${k}`, avisar, logar)).toBe(true)
    expect(avisar).toHaveBeenCalledWith('T:roqueCraft.error.saveIndisponivel', {
      tipo: 'erro',
      fixo: true,
    })
    expect(logar).toHaveBeenCalledTimes(1)
  })

  it('mundo novo (ou convidado) não é aviso', () => {
    const avisar = vi.fn()
    expect(avisarDaCarga({ aviso: null, erro: null }, (k) => k, avisar, vi.fn())).toBe(false)
    expect(avisar).not.toHaveBeenCalled()
  })
})
