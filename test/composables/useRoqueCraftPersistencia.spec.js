/**
 * O autosave do RoqueCraft.
 *
 * Este arquivo não testa "o composable funciona". Ele testa as quatro coisas
 * que já quebraram um save de verdade, e cada `describe` nomeia o defeito:
 *
 *  1. o debounce COLAPSA (uma parede = uma escrita), sem ENGOLIR (a última
 *     versão é a que vai pro disco);
 *  2. cada porta de saída barra de verdade, e o teste prova que barrou a
 *     ESCRITA — não que a função voltou cedo;
 *  3. `cancelar` impede o disparo pós-morte, que leria `world` destruído;
 *  4. uma falha do Firestore não conta como gravação, senão o contador vira
 *     um instrumento que concorda com o defeito.
 *
 * ⚠️ PROVA DE VIDA: todo teste que espera "não gravou" tem, no mesmo `it` ou no
 * `describe` ao lado, o par de controle que GRAVA. Sem o par, um `podeGravar`
 * quebrado que negasse sempre passaria em metade da suíte.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  useRoqueCraftPersistencia,
  ESPERA_DO_AUTOSAVE,
} from '../../src/composables/useRoqueCraftPersistencia.js'

/** Monta o composable com tudo aberto e um `gravar` que registra o que recebeu. */
function montar(extra = {}) {
  const escritas = []
  const estado = { versao: 1 }
  const persistencia = useRoqueCraftPersistencia({
    montarPayload: () => ({ ...estado }),
    gravar: (p) => {
      escritas.push(p)
    },
    podeGravar: () => true,
    ...extra,
  })
  return { persistencia, escritas, estado }
}

describe('useRoqueCraftPersistencia', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  describe('o debounce colapsa sem engolir', () => {
    it('sessenta blocos numa parede viram UMA escrita', async () => {
      const { persistencia, escritas } = montar()

      for (let i = 0; i < 60; i++) persistencia.agendar()
      expect(escritas).toHaveLength(0)

      await vi.advanceTimersByTimeAsync(ESPERA_DO_AUTOSAVE)
      expect(escritas).toHaveLength(1)
    })

    it('a escrita leva o estado do DISPARO, não o do agendamento', async () => {
      const { persistencia, escritas, estado } = montar()

      persistencia.agendar()
      estado.versao = 2 // o jogador continuou construindo depois de agendar
      await vi.advanceTimersByTimeAsync(ESPERA_DO_AUTOSAVE)

      expect(escritas[0]).toEqual({ versao: 2 })
    })

    it('cada agendamento EMPURRA o prazo — a parede inteira espera o último bloco', async () => {
      const { persistencia, escritas } = montar()

      persistencia.agendar()
      await vi.advanceTimersByTimeAsync(ESPERA_DO_AUTOSAVE - 100)
      persistencia.agendar()
      await vi.advanceTimersByTimeAsync(200)
      // Sem o `clearTimeout`, o primeiro timer teria disparado aqui.
      expect(escritas).toHaveLength(0)

      await vi.advanceTimersByTimeAsync(ESPERA_DO_AUTOSAVE)
      expect(escritas).toHaveLength(1)
    })

    it('duas paredes separadas no tempo dão DUAS escritas', async () => {
      const { persistencia, escritas } = montar()

      persistencia.agendar()
      await vi.advanceTimersByTimeAsync(ESPERA_DO_AUTOSAVE)
      persistencia.agendar()
      await vi.advanceTimersByTimeAsync(ESPERA_DO_AUTOSAVE)

      expect(escritas).toHaveLength(2)
      expect(persistencia.gravacoes.value).toBe(2)
    })

    it('`agendado` sobe ao armar e desce ao disparar', async () => {
      const { persistencia } = montar()

      expect(persistencia.agendado.value).toBe(false)
      persistencia.agendar()
      expect(persistencia.agendado.value).toBe(true)

      await vi.advanceTimersByTimeAsync(ESPERA_DO_AUTOSAVE)
      expect(persistencia.agendado.value).toBe(false)
    })
  })

  describe('as portas de saída barram a ESCRITA, não só a chamada', () => {
    it('sem uid não grava; com uid grava (par de controle)', async () => {
      let uid = null
      const { persistencia, escritas } = montar({ podeGravar: () => !!uid })

      expect(await persistencia.agora()).toBe(false)
      expect(escritas).toHaveLength(0)

      uid = 'abc'
      expect(await persistencia.agora()).toBe(true)
      expect(escritas).toHaveLength(1)
    })

    it('a porta é lida NO DISPARO: quem perdeu o uid no meio da espera não grava', async () => {
      let uid = 'abc'
      const { persistencia, escritas } = montar({ podeGravar: () => !!uid })

      persistencia.agendar()
      uid = null // deslogou durante os 2,5 s
      await vi.advanceTimersByTimeAsync(ESPERA_DO_AUTOSAVE)

      expect(escritas).toHaveLength(0)
    })

    it('`montarPayload` NÃO roda quando a porta está fechada', async () => {
      const montarPayload = vi.fn(() => ({}))
      const persistencia = useRoqueCraftPersistencia({
        montarPayload,
        gravar: () => {},
        podeGravar: () => false,
      })

      await persistencia.agora()
      // Importa porque `montarPayload` lê `world` e `player`: rodá-la depois do
      // teardown é exatamente o erro de console que queremos impossível.
      expect(montarPayload).not.toHaveBeenCalled()
    })
  })

  describe('agendar e gravar são portas independentes', () => {
    it('em sala/E2E nem ARMA o temporizador', async () => {
      const { persistencia, escritas } = montar({
        podeGravar: () => false,
        podeAgendar: () => false,
      })

      expect(persistencia.agendar()).toBe(false)
      expect(persistencia.agendado.value).toBe(false)
      await vi.advanceTimersByTimeAsync(ESPERA_DO_AUTOSAVE * 2)
      expect(escritas).toHaveLength(0)
    })

    it('sem uid ARMA mesmo assim — e grava se o login chegar durante a espera', async () => {
      let uid = null
      const { persistencia, escritas } = montar({
        podeGravar: () => !!uid,
        podeAgendar: () => true,
      })

      expect(persistencia.agendar()).toBe(true)
      uid = 'abc' // o auth resolveu no meio dos 2,5 s
      await vi.advanceTimersByTimeAsync(ESPERA_DO_AUTOSAVE)

      // É este save que se perdia quando as duas portas eram a mesma.
      expect(escritas).toHaveLength(1)
    })

    it('sem `podeAgendar`, as duas portas são a mesma (retrocompatível)', () => {
      const { persistencia } = montar({ podeGravar: () => false })
      expect(persistencia.agendar()).toBe(false)
    })
  })

  describe('cancelar mata o disparo pós-morte', () => {
    it('nada grava depois de `cancelar`', async () => {
      const { persistencia, escritas } = montar()

      persistencia.agendar()
      persistencia.cancelar()
      await vi.advanceTimersByTimeAsync(ESPERA_DO_AUTOSAVE * 2)

      expect(escritas).toHaveLength(0)
      expect(persistencia.agendado.value).toBe(false)
    })

    it('mas o mesmo agendamento SEM cancelar grava (prova de vida)', async () => {
      const { persistencia, escritas } = montar()

      persistencia.agendar()
      await vi.advanceTimersByTimeAsync(ESPERA_DO_AUTOSAVE)

      expect(escritas).toHaveLength(1)
    })

    it('`cancelar` não impede um `agora()` explícito — é o save do onBeforeUnmount', async () => {
      const { persistencia, escritas } = montar()

      persistencia.cancelar()
      await persistencia.agora()

      expect(escritas).toHaveLength(1)
    })

    it('cancelar duas vezes seguidas não explode', async () => {
      const { persistencia } = montar()
      persistencia.agendar()
      persistencia.cancelar()
      expect(() => persistencia.cancelar()).not.toThrow()
    })
  })

  describe('falha de rede não vira gravação de mentira', () => {
    it('o contador NÃO sobe quando o Firestore recusa', async () => {
      const aoFalhar = vi.fn()
      const persistencia = useRoqueCraftPersistencia({
        montarPayload: () => ({}),
        gravar: () => Promise.reject(new Error('offline')),
        podeGravar: () => true,
        aoFalhar,
      })

      expect(await persistencia.agora()).toBe(false)
      expect(persistencia.gravacoes.value).toBe(0)
      expect(aoFalhar).toHaveBeenCalledTimes(1)
    })

    it('uma falha não trava as gravações seguintes', async () => {
      let quebrado = true
      const escritas = []
      const persistencia = useRoqueCraftPersistencia({
        montarPayload: () => ({}),
        gravar: (p) => {
          if (quebrado) return Promise.reject(new Error('offline'))
          escritas.push(p)
          return Promise.resolve()
        },
        podeGravar: () => true,
        aoFalhar: () => {},
      })

      await persistencia.agora()
      quebrado = false
      await persistencia.agora()

      expect(escritas).toHaveLength(1)
      expect(persistencia.gravacoes.value).toBe(1)
    })

    it('o erro NÃO vaza pro chamador — o jogo não pode morrer por causa do save', async () => {
      const persistencia = useRoqueCraftPersistencia({
        montarPayload: () => ({}),
        gravar: () => {
          throw new Error('síncrono')
        },
        podeGravar: () => true,
        aoFalhar: () => {},
      })

      await expect(persistencia.agora()).resolves.toBe(false)
    })
  })
})
