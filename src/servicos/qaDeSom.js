/**
 * QA de áudio: o que as sondas de som perguntam ao motor de áudio.
 *
 * ⚠️ `somMedirGanho` e `somMedirOffline` existem porque medir volume com o
 * alto-falante ligado é medir a sala, não o jogo. Elas rodam o grafo num
 * `OfflineAudioContext`, que devolve a amostra que o motor produziria, sem
 * placa de som no meio. Foi assim que o leito de ondas foi calibrado.
 *
 * Serviço e não composable: não guarda estado nem ciclo de vida. O motor de
 * áudio entra por GETTER porque ele é recriado ao destravar o som (o navegador
 * exige gesto do usuário antes do primeiro contexto).
 */

import { createAudio } from './audio.js'

/**
 * @param {object} ctx
 * @param {() => object} ctx.audio motor de áudio VIVO
 * @param {() => Promise<void>} ctx.destravar destrava o contexto (gesto do usuário)
 */
export function criarQaDeSom(ctx) {
  const audio = () => ctx.audio()
  const destravarAudio = () => ctx.destravar()
  return {
    somInfo: () => ({ instancia: !!audio(), ...(audio()?.info?.() || {}) }),
    // Estado do BANCO de amostras: quantos grupos vieram, quantos arquivos,
    // se falhou, e onde está o corte do filtro de submerso. "O som está ruim"
    // e "o banco não carregou e caiu na síntese" soam parecido pra quem ouve —
    // aqui a diferença é um número.

    somBanco: () => audio()?.bancoInfo || null,

    // Ganho VIVO de cada leito de ambiente. É por aqui que uma sonda afirma
    // "a cachoeira está sendo OUVIDA", e não só "existe água caindo no mapa".
    somLeitos: () => audio()?.leitosVivos?.() || {},

    somCarregar: () => audio()?.carregar?.(),

    somZerarDisparos: () => audio()?.zerarDisparos?.(),
    // Curva da cadeia inteira (ganho da amostra → bus → master → limitador)
    // medida, não deduzida: o limitador não é linear e a conta no papel erra.

    somMedirGanho: async (ganho = 1) => {
      const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext
      if (!OAC) return null
      const taxa = 44100
      const oc = new OAC(1, Math.round(taxa * 2), taxa)
      const a = createAudio({ volume: 0.85, criarContexto: () => oc })
      await a.carregar()
      a.tocarCru?.('quebra.pedra', ganho)
      const buf = await oc.startRendering()
      const d = buf.getChannelData(0)
      let pico = 0
      for (let i = 0; i < d.length; i++) {
        const v = d[i] < 0 ? -d[i] : d[i]
        if (v > pico) pico = v
      }
      return pico > 0 ? Number((20 * Math.log10(pico)).toFixed(1)) : null
    },

    somSubmerso: (v) => audio()?.setSubmerso?.(v),

    somAmbiente: (mix) => audio()?.setAmbiente?.(mix),

    somPico: () => audio()?.picoDbfs?.() ?? -Infinity,
    // Renderiza UM efeito num contexto offline e devolve o pico em dBFS. Nao
    // depende de placa de som, entao funciona no headless - e e o unico jeito
    // honesto de afirmar "da pra ouvir" num harness.

    somMedirOffline: async (familia = 'stone', acao = 'dig', comBanco = true) => {
      const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext
      if (!OAC) return null
      const taxa = 44100
      const oc = new OAC(1, Math.round(taxa * 2), taxa)
      const a = createAudio({ volume: 0.85, criarContexto: () => oc })
      // ⚠️ CARREGAR O BANCO ANTES DE RENDERIZAR.
      //
      // A primeira versão disto media uma instância recém-criada e portanto
      // VAZIA: todo efeito caía na síntese de emergência, e o relatório
      // apresentava os níveis da síntese como se fossem os das amostras. Os
      // números pareciam plausíveis, que é o pior tipo de erro de medição.
      // `decodeAudioData` funciona num contexto offline; só é preciso esperar.
      if (comBanco) {
        a.unlock()
        await a.carregar()
      }
      if (acao === 'break') a.breakBlock(familia)
      else if (acao === 'step') a.step(familia)
      else a.dig(familia)
      const buf = await oc.startRendering()
      const d = buf.getChannelData(0)
      let pico = 0
      for (let i = 0; i < d.length; i++) {
        const v = d[i] < 0 ? -d[i] : d[i]
        if (v > pico) pico = v
      }
      return pico > 0 ? Number((20 * Math.log10(pico)).toFixed(1)) : null
    },

    somDestravar: () => destravarAudio(),
  }
}
