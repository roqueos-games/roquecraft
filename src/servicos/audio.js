// RoqueCraft — áudio.
//
// ────────────────────────────────────────────────────────────────────────────
// POR QUE ISTO DEIXOU DE SER SÍNTESE
//
// A versão anterior fabricava todo som na hora com Web Audio: ruído filtrado
// mais um corpo tonal curto. A escolha tinha uma razão real — a regra do
// projeto proíbe asset de terceiro com risco de IP — mas ela confundia "sem
// risco de IP" com "sem arquivo". O veredito do founder em 2026-08-22 foi
// direto: "o pack de som está horrível".
//
// Ele está certo, e a razão é física. Um passo na grama é um evento de contato
// caótico e de banda larga: dezenas de hastes cedendo em milissegundos
// diferentes. Ruído filtrado por um bandpass tem envelope liso e espectro
// estacionário — o ouvido reconhece na hora que aquilo não bateu em nada.
// Síntese de qualidade para isso é modelagem física, não um filtro.
//
// A saída não era abandonar a regra, era ler a regra: o que ela proíbe é asset
// de PROCEDÊNCIA duvidosa. CC0 é domínio público. Todo arquivo em
// `public/games/roquecraft/audio/` é CC0 com a licença conferida no
// `License.txt` de dentro do ZIP (Kenney) ou no campo da página do item
// (OpenGameArt) — não presumida por filtro de busca, que no OpenGameArt vaza.
// A procedência de cada grupo está em `CREDITOS.md`, ao lado dos arquivos.
//
// A síntese CONTINUA AQUI, como rede: se o banco não carregar — rede caiu, 404,
// `decodeAudioData` recusou — o jogo faz som em vez de ficar mudo.
//
// ────────────────────────────────────────────────────────────────────────────
// NÚMEROS QUE VIERAM DE FONTE, NÃO DE GOSTO
//
// · Submerso é FILTRO, não arquivo. Veloren põe um low-pass de 888 Hz no
//   barramento (`voxygen/src/audio/sfx/mod.rs`) e 20 kHz fora d'água, com
//   transição suave — o comentário do próprio código diz que sem o tween "a
//   ambiência fica muito saltitante". Aqui é um `BiquadFilterNode` no master.
//
// · Atenuação por distância: `inverse` (o padrão da spec W3C), `refDistance` 3
//   blocos — o Luanti documenta que "o ganho dado descreve o ganho a 3 nós" —
//   e `equalpower` em vez de HRTF, que custa caro por fonte.
//
// · Ganho relativo por material: a tabela do Luanti
//   (`mods/default/functions.lua`). Passo vive entre 0,05 (areia) e 0,45
//   (folhas); ação de bloco entre 0,35 e 1,0. É uma separação de ~14 dB entre
//   passo típico e quebra — bem maior do que a intuição sugere, e é ela que
//   impede o passo de mascarar o retorno da ação.
//
// · Níveis de barramento: os defaults do Veloren (`settings/audio.rs`) —
//   master 0,8, sfx 0,8, ambiência 0,8.
//
// O contexto de áudio só nasce no PRIMEIRO GESTO do usuário: navegador nenhum
// deixa tocar antes disso, e criar adiantado deixa um contexto 'suspended'
// pendurado que nunca mais toca.

// O orçamento de duração do passo é derivado da CADÊNCIA, que mora em passo.js
// junto com a fase que dispara o som. Um lugar só, nada de dois números que
// podem divergir.
import { recortarPasso } from './passo.js'
import { criarTrilha, definirMomento, avancarTrilha, noAr } from './trilha.js'

export const AUDIO_BASE = '/games/roquecraft/audio/'

// Veloren: 888 Hz submerso, 20 kHz fora. A transição de 500 ms é o tween que o
// código deles usa pra ambiência — sem ela o corte "salta".
export const LPF_SUBMERSO = 888
export const LPF_ABERTO = 20000
export const LPF_TRANSICAO = 0.5

export const FAMILIES = [
  'stone',
  'wood',
  'dirt',
  'sand',
  'gravel',
  'grass',
  'leaves',
  'snow',
  'glass',
  'wool',
  'metal',
  'liquid',
]

// De onde sai a família: o `key` do bloco. Mantido por PREFIXO/sufixo pra um
// bloco novo herdar o som certo sem precisar entrar numa tabela.
//
// ⚠️ A ordem importa. `snow` tem que ser testado ANTES de `stone`, senão
// `snowBlock` cai no ramo genérico — que foi o que aconteceu até hoje: metade
// do mapa é bioma frio e o jogador pisava em neve ouvindo pedra.
export function familyOf(key = '') {
  const k = String(key)
  if (/water|lava/i.test(k)) return 'liquid'
  if (/snow/i.test(k)) return 'snow'
  if (/glass|ice/i.test(k)) return 'glass'
  if (/wool|carpet|bed/i.test(k)) return 'wool'
  if (/iron|gold|copper|metal|anvil|rail/i.test(k)) return 'metal'
  if (/gravel/i.test(k)) return 'gravel'
  if (/sand/i.test(k)) return 'sand'
  if (/leaves|vine/i.test(k)) return 'leaves'
  if (/grass|plant|flower|sapling|crop|moss|cactus|mushroom/i.test(k)) return 'grass'
  if (/dirt|clay|soil|podzol|mud|farmland/i.test(k)) return 'dirt'
  if (/log|plank|wood|door|fence|bookshelf|crafting|chest/i.test(k)) return 'wood'
  return 'stone'
}

// Família → grupo de amostra, por ação. `null` cai na síntese.
export const GRUPO = {
  passo: {
    stone: 'passo.pedra',
    wood: 'passo.madeira',
    dirt: 'passo.terra',
    sand: 'passo.areia',
    gravel: 'passo.cascalho',
    grass: 'passo.grama',
    leaves: 'passo.folhas',
    snow: 'passo.neve',
    glass: 'passo.pedra',
    wool: 'passo.terra',
    metal: 'passo.pedra',
    liquid: 'agua.bracada',
  },
  quebra: {
    stone: 'quebra.pedra',
    wood: 'quebra.madeira',
    dirt: 'quebra.macio',
    sand: 'quebra.macio',
    gravel: 'quebra.pedra',
    grass: 'quebra.macio',
    leaves: 'quebra.macio',
    snow: 'quebra.macio',
    glass: 'quebra.vidro',
    wool: 'quebra.macio',
    metal: 'quebra.metal',
    liquid: 'agua.bracada',
  },
  // A batida repetida enquanto minera. O founder pediu "som de picareta" e
  // "som de batendo a mão na areia" por nome: são estes dois.
  bate: {
    stone: 'bate.picareta',
    wood: 'bate.machado',
    dirt: 'bate.pa',
    sand: 'bate.pa',
    gravel: 'bate.pa',
    grass: 'bate.mao',
    leaves: 'bate.mao',
    snow: 'bate.pa',
    glass: 'bate.picareta',
    wool: 'bate.mao',
    metal: 'bate.picareta',
    liquid: 'bate.mao',
  },
}

// GANHO POR MATERIAL E AÇÃO.
//
// A ORDEM vem do Luanti (`mods/default/functions.lua`) — é a melhor referência
// pública de "quanto mais alto que" entre passo, batida e quebra num jogo do
// gênero. Os VALORES ABSOLUTOS são meus, medidos, e divergem dos dele de
// propósito. Vale explicar por quê, porque parece contradição:
//
// A tabela do Luanti vai de 0,05 (passo na areia) a 1,0 (quebrar pedra) — 26 dB
// de distância. Mas os arquivos DELES não têm o mesmo pico: o passo na areia já
// é intrinsecamente baixo no arquivo, e o 0,05 é aplicado em cima disso. Os
// meus foram todos normalizados por PICO a −6 dBFS na construção do pacote, que
// é o certo pra evitar ceifamento — e isso apaga a diferença natural. Copiar
// 0,05 sobre uma amostra já emparelhada em pico soma as duas atenuações: medi
// −42,5 dBFS no passo na areia, que é inaudível num laptop.
//
// Então a escala foi refeita contra medição, mirando o que o dossiê aponta como
// faixa de efeito de ação (−12 a −6 dBFS) e mantendo a hierarquia:
//
//   quebrar          ≈  −8 dBFS
//   batida (repete)  ≈ −15 dBFS   ← de propósito abaixo: toca ~5× por bloco
//   passo típico     ≈ −19 dBFS
//   passo na areia   ≈ −21 dBFS   ← o mais baixo, como no Luanti
//
// Medido por renderização offline da cadeia inteira, com limitador e master —
// `somMedirOffline` no gancho de QA. A conta no papel não serve: o limitador
// não é linear e a curva medida (ganho → dBFS) não é uma reta.
export const GANHO = {
  passo: {
    sand: 0.22,
    wood: 0.3,
    wool: 0.3,
    stone: 0.33,
    metal: 0.33,
    snow: 0.33,
    liquid: 0.33,
    dirt: 0.37,
    gravel: 0.37,
    grass: 0.4,
    glass: 0.4,
    leaves: 0.5,
  },
  bate: {
    sand: 0.3,
    snow: 0.3,
    wool: 0.3,
    leaves: 0.3,
    liquid: 0.3,
    gravel: 0.35,
    wood: 0.4,
    dirt: 0.4,
    grass: 0.4,
    stone: 0.45,
    glass: 0.5,
    metal: 0.5,
  },
  quebra: {
    sand: 0.5,
    metal: 0.5,
    liquid: 0.5,
    snow: 0.6,
    wool: 0.6,
    leaves: 0.7,
    glass: 1.0,
    stone: 1.0,
    wood: 1.0,
    dirt: 1.0,
    gravel: 1.0,
    grass: 1.0,
  },
}

// Elevação global das amostras.
//
// Medida, não escolhida: com ganho 1,0 a cadeia entregava −17 dBFS na saída, e
// efeito de ação precisa viver entre −12 e −6. 2,8× são os +9 dB que faltavam.
// O limitador do barramento segura o pico; sem esta elevação o jogo inteiro
// soava um degrau abaixo de onde deveria, que é metade do "pack horrível".
export const GANHO_AMOSTRA = 2.8

// CORREÇÃO POR GRUPO DE AMOSTRA, EM dB. Medida, não escolhida.
//
// A tabela `GANHO` acima é INTENÇÃO DE PROJETO: quanto um passo deve ficar
// abaixo de uma quebra, por material. Ela não sabe nada sobre as gravações.
//
// Esta tabela é a outra metade: as fontes CC0 vêm de gravações diferentes, com
// microfones, distâncias e conteúdos diferentes, e nem a normalização por
// energia por grupo iguala isso — o teto de pico trava o ganho de um grupo
// percussivo antes de ele alcançar a energia do alvo.
//
// Medido no jogo rodando, por renderização offline, 6 disparos por caso
// (`scripts/qa-roquecraft-som.mjs`). Uma medição só descreve o sorteio, não o
// grupo: a variação entre amostras do mesmo grupo chega a 8 dB, e foi por isso
// que "passo na neve" apareceu 10 dB fora numa volta e dentro na seguinte.
//
// Antes da correção (média de 6, em dBFS):
//
//   passo grama   −18,0   ✓        passo areia    −9,0   ✗ 9 dB alto
//   passo madeira −19,8   ✓        passo neve     −9,5   ✗
//   passo pedra   −19,8   ✓        passo cascalho −6,4   ✗ 13 dB alto
//   passo terra   −18,5   ✓        passo folhas   −8,3   ✗
//
// O alvo é −19 dBFS pro passo, −15 pra batida e −8 pra quebra. Um número aqui
// que não venha de medição é chute; se mudar de amostra, remede.
export const CORRECAO_GRUPO = {
  'passo.areia': -10,
  'passo.neve': -9.5,
  'passo.cascalho': -12.5,
  'passo.folhas': -10.5,
  'bate.picareta': -4,
  'bate.mao': 6,
  'quebra.pedra': -2,
}

/** dB → fator linear. */
const dbParaFator = (db) => Math.pow(10, db / 20)

// Perfil da SÍNTESE DE EMERGÊNCIA. Só toca quando o banco de amostras não
// carregou: rede caiu, 404, `decodeAudioData` recusou o arquivo. Um jogo que
// fica mudo porque um `.ogg` não veio é pior do que um jogo que faz o som
// antigo — e "está mudo" é um dos sintomas mais caros de diagnosticar.
// [corte do filtro, Q, tipo, frequência do corpo, decaimento, ganho]
export const PROFILE = {
  stone: { hz: 2600, q: 1.4, type: 'bandpass', body: 180, decay: 0.13, gain: 2.6, noise: 1 },
  wood: { hz: 1100, q: 2.2, type: 'bandpass', body: 220, decay: 0.17, gain: 2.8, noise: 0.7 },
  dirt: { hz: 620, q: 1.1, type: 'lowpass', body: 120, decay: 0.16, gain: 2.2, noise: 1 },
  sand: { hz: 4200, q: 0.6, type: 'highpass', body: 0, decay: 0.22, gain: 1.8, noise: 1 },
  gravel: { hz: 2200, q: 0.9, type: 'bandpass', body: 90, decay: 0.18, gain: 2.0, noise: 1 },
  grass: { hz: 3200, q: 0.8, type: 'bandpass', body: 0, decay: 0.14, gain: 1.7, noise: 1 },
  leaves: { hz: 3800, q: 0.7, type: 'bandpass', body: 0, decay: 0.16, gain: 1.7, noise: 1 },
  snow: { hz: 5200, q: 0.5, type: 'highpass', body: 0, decay: 0.16, gain: 1.6, noise: 1 },
  glass: { hz: 5200, q: 2.6, type: 'bandpass', body: 1400, decay: 0.25, gain: 2.4, noise: 0.8 },
  wool: { hz: 900, q: 0.7, type: 'lowpass', body: 0, decay: 0.12, gain: 1.5, noise: 1 },
  metal: { hz: 3000, q: 3.4, type: 'bandpass', body: 640, decay: 0.4, gain: 2.2, noise: 0.6 },
  liquid: { hz: 1400, q: 0.9, type: 'lowpass', body: 0, decay: 0.3, gain: 2.0, noise: 1 },
}

/** Leitos de ambiente: grupo → ganho de repouso. */
export const LEITOS = {
  'amb.vento': 0.5,
  'amb.chuva': 0.75,
  'amb.passaros': 0.5,
  'amb.grilos': 0.45,
  'amb.ondas': 0.6,
  'amb.caverna': 0.6,
  'amb.submerso': 0.7,
  // Mais alto que os outros de proposito: cachoeira PERTO domina a paisagem
  // sonora, e um leito timido aqui soaria como torneira aberta noutro comodo.
  'amb.cachoeira': 0.85,
}

const clamp01 = (v) => Math.min(1, Math.max(0, v))

/**
 * `criarContexto` e `buscar` existem pra poder MEDIR e pra poder TESTAR.
 *
 * Num navegador headless o sink de áudio é nulo: o `AudioContext` fica
 * 'running', o tempo anda, e o grafo não renderiza um sample sequer — o medidor
 * lê -Infinity mesmo com tudo certo (medido em 2026-08-22). Injetando um
 * `OfflineAudioContext` o mesmo grafo renderiza em memória, sem hardware, e o
 * pico em dBFS vira número reproduzível. É como o harness prova que o jogo não
 * está mudo sem depender de placa de som.
 */
export function createAudio({
  volume = 0.7,
  criarContexto = null,
  buscar = null,
  // Injetável pelo mesmo motivo que `criarContexto`: em teste não existe
  // `<audio>`, e em produção não dá pra provar streaming sem um.
  criarElemento = null,
  volumeMusica = 0.55,
} = {}) {
  // A trilha entra ~5 dB abaixo do resto: ela é fundo, não é o jogo.
  let ganhoMusica = volumeMusica
  let ctx = null
  let master = null
  let filtro = null
  let busEfeitos = null
  let busAmbiente = null
  let busMusica = null
  let ligado = true
  let noiseBuf = null
  let medidor = null
  let amostras = null
  let submerso = false

  // grupo → AudioBuffer[]; e o último índice tocado, pra não repetir em seguida
  const banco = new Map()
  const ultimo = new Map()
  const tocando = new Map() // grupo do leito → { src, gain }
  let carregando = null
  let falhaBanco = null

  const agora = () => ctx?.currentTime ?? 0
  const fetchar = buscar || (typeof fetch === 'function' ? fetch.bind(globalThis) : null)

  function ensure() {
    if (ctx) return ctx
    if (criarContexto) {
      ctx = criarContexto()
    } else {
      const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
      if (!AC) return null
      ctx = new AC()
    }
    if (!ctx) return null
    master = ctx.createGain()
    master.gain.value = volume

    // ── SUBMERSO É FILTRO, NÃO ARQUIVO ─────────────────────────────────────
    // Veloren troca o corte do master entre 888 Hz e 20 kHz e não usa nenhum
    // "som subaquático". Um `BiquadFilterNode` no barramento custa quase nada e
    // pega TODA fonte de uma vez — inclusive as que já estavam tocando quando o
    // jogador mergulhou, que é o detalhe que um filtro por som não resolve.
    filtro = ctx.createBiquadFilter()
    filtro.type = 'lowpass'
    filtro.frequency.value = LPF_ABERTO
    filtro.Q.value = 0.7

    busEfeitos = ctx.createGain()
    busEfeitos.gain.value = 0.8 // default do Veloren
    busAmbiente = ctx.createGain()
    busAmbiente.gain.value = 0.8
    // ⚠️ A MÚSICA NÃO PASSA PELO FILTRO DE SUBMERSO.
    //
    // Efeito e ambiência abafam debaixo d'água porque a ÁGUA está entre eles e
    // o ouvido do jogador. A trilha não está no mundo — ela é a trilha. Passar
    // ela pelo mesmo low-pass faria o piano ficar abafado ao nadar, que é o
    // erro clássico de ligar tudo no mesmo barramento.
    busMusica = ctx.createGain()
    busMusica.gain.value = ganhoMusica
    busEfeitos.connect(filtro)
    busAmbiente.connect(filtro)
    filtro.connect(master)
    busMusica.connect(master)

    // COMPRESSOR no barramento. Com ganho de trabalho, dois efeitos no mesmo
    // frame (quebrar + passo + splash) somam e estouram em digital clipping,
    // que soa MUITO pior que som baixo. O compressor segura o pico sem tirar a
    // presença de um efeito sozinho.
    const limitador = ctx.createDynamicsCompressor()
    limitador.threshold.value = -8
    limitador.knee.value = 6
    limitador.ratio.value = 8
    limitador.attack.value = 0.002
    limitador.release.value = 0.12
    master.connect(limitador)
    // MEDIDOR no fim da cadeia, depois do limitador: é o sinal que sai mesmo.
    // Existe porque "o jogo está mudo" não é coisa que se depure ouvindo — som
    // baixo, contexto suspenso, ganho zero e toggle desligado dão o mesmo
    // sintoma. Um AnalyserNode é passivo e custa nada enquanto ninguém lê.
    medidor = ctx.createAnalyser()
    medidor.fftSize = 2048
    limitador.connect(medidor)
    medidor.connect(ctx.destination)
    amostras = new Float32Array(medidor.fftSize)

    // ⚠️ QUEM CRIA O CONTEXTO PEDE O BANCO. MEDIDO EM 13/09/2026.
    //
    // O banco só baixava dentro de `destravarAudio`, no componente — e os
    // ouvintes de gesto dele só entram no ar DEPOIS do boot, que leva segundos.
    // Quem dava o gesto antes (o clique que abre o jogo, por exemplo) ficava
    // com `banco=0` e `musica=0` pra sempre: o contexto nascia depois, por um
    // passo ou uma pancada, e ninguém mais pedia as amostras. O jogo tocava só
    // a síntese, a −45 dBFS, que é inaudível — o "às vezes começa mudo".
    //
    // Aqui é o único lugar que SEMPRE roda quando passa a ser possível baixar.
    // `carregar` tem guarda própria (`carregando`), então chamar duas vezes não
    // duplica nada, e o `catch` vazio é de propósito: falha de banco já vira
    // `falhaBanco`, e o jogo segue na síntese em vez de quebrar.
    Promise.resolve().then(() => carregar()?.catch?.(() => {}))
    return ctx
  }

  // ── BANCO DE AMOSTRAS ─────────────────────────────────────────────────────

  /**
   * Carrega o manifesto e decodifica tudo, com teto de simultaneidade.
   *
   * Sem o teto, 87 `fetch` + 87 `decodeAudioData` disparam no mesmo tick e
   * competem com o primeiro frame do jogo — que é exatamente quando o jogador
   * está olhando. Seis por vez enche o pipe sem roubar a partida.
   */
  async function carregar() {
    if (carregando) return carregando
    if (!ensure() || !fetchar) return null
    carregando = (async () => {
      const r = await fetchar(`${AUDIO_BASE}manifest.json`)
      if (!r.ok) throw new Error(`manifest ${r.status}`)
      const man = await r.json()
      const tarefas = []
      for (const [grupo, arquivos] of Object.entries(man.grupos || {}))
        for (const arq of arquivos) tarefas.push({ grupo, arq })

      const TETO = 6
      let i = 0
      const trabalhar = async () => {
        while (i < tarefas.length) {
          const { grupo, arq } = tarefas[i++]
          try {
            const res = await fetchar(AUDIO_BASE + arq)
            if (!res.ok) continue
            const bytes = await res.arrayBuffer()
            const buf = await ctx.decodeAudioData(bytes)
            if (!banco.has(grupo)) banco.set(grupo, [])
            banco.get(grupo).push(grupo.startsWith('passo.') ? encurtarPasso(buf) : buf)
          } catch {
            // uma amostra que não veio não derruba o pacote: o grupo fica menor
            // e, se ficar vazio, aquela ação cai na síntese sozinha.
          }
        }
      }
      // A trilha fica só CATALOGADA: nome do arquivo e duração. Quem toca é o
      // `<audio>`, e ele busca na hora de tocar.
      acervoMusica = man.musica || null
      await Promise.all(Array.from({ length: TETO }, trabalhar))
      return { grupos: banco.size, amostras: [...banco.values()].reduce((a, v) => a + v.length, 0) }
    })()
    try {
      return await carregando
    } catch (err) {
      falhaBanco = err?.message || String(err)
      return null
    }
  }

  /**
   * Escolhe uma amostra do grupo SEM repetir a anterior.
   *
   * Sorteio uniforme repete o mesmo arquivo duas vezes seguidas em 1 de N
   * passos, e repetição imediata é o que o ouvido identifica como "som de
   * videogame ruim" — muito antes de notar que só existem cinco variações.
   */
  function escolher(grupo) {
    const lista = banco.get(grupo)
    if (!lista || !lista.length) return null
    if (lista.length === 1) return lista[0]
    const prev = ultimo.get(grupo)
    let k = Math.floor(Math.random() * lista.length)
    if (k === prev) k = (k + 1 + Math.floor(Math.random() * (lista.length - 1))) % lista.length
    ultimo.set(grupo, k)
    return lista[k]
  }

  // ── TRILHA ────────────────────────────────────────────────────────────────
  //
  // ⚠️ A MÚSICA NÃO ENTRA NO BANCO DE AMOSTRAS. São 5,8 MB em sete faixas: como
  // `AudioBuffer` decodificado isso vira ~90 MB de RAM, e o `carregar()` já
  // busca 87 arquivos antes do primeiro frame. Música é STREAM — um
  // `<audio>` por voz, ligado ao grafo por `createMediaElementSource`, que
  // decodifica conforme toca e nunca segura a faixa inteira.
  //
  // Dois elementos fixos, alternados: `createMediaElementSource` só pode ser
  // chamado UMA vez por elemento, então trocar de faixa recriando elemento
  // vazaria um nó do grafo a cada troca. Dois bastam pro cruzamento.
  const FADE_MUSICA = 2.5
  const vozesMusica = []
  let vozAtual = 0
  let acervoMusica = null

  function fazerElemento() {
    if (criarElemento) return criarElemento()
    if (typeof document === 'undefined') return null
    const el = document.createElement('audio')
    el.crossOrigin = 'anonymous'
    el.preload = 'none'
    return el
  }

  function vozDeMusica(i) {
    if (vozesMusica[i]) return vozesMusica[i]
    const el = fazerElemento()
    if (!el || !ctx?.createMediaElementSource) return null
    const g = ctx.createGain()
    g.gain.value = 0
    ctx.createMediaElementSource(el).connect(g)
    g.connect(busMusica)
    vozesMusica[i] = { el, g }
    return vozesMusica[i]
  }

  const rampa = (param, alvo, seg) => {
    const t = agora()
    param.cancelScheduledValues(t)
    param.setValueAtTime(param.value, t)
    param.linearRampToValueAtTime(alvo, t + seg)
  }

  /** Cruza pra uma faixa nova; sem argumento, só some com o que está tocando. */
  function tocarMusica(arq) {
    if (!ensure()) return false
    const saindo = vozesMusica[vozAtual]
    if (saindo?.el && !saindo.el.paused) {
      rampa(saindo.g.gain, 0, FADE_MUSICA)
      const morrer = saindo.el
      setTimeout(() => {
        try {
          morrer.pause()
        } catch {
          /* já parou */
        }
      }, FADE_MUSICA * 1000)
    }
    if (!arq) return true
    vozAtual = 1 - vozAtual
    const v = vozDeMusica(vozAtual)
    if (!v) return false
    v.el.src = AUDIO_BASE + arq
    v.el.currentTime = 0
    v.g.gain.value = 0
    const p = v.el.play?.()
    if (p?.catch) p.catch(() => {})
    rampa(v.g.gain, 1, FADE_MUSICA)
    return true
  }

  // O DIRETOR mora em `trilha.js` (puro: escolhe faixa e tamanho do silêncio).
  // Aqui fica só a mão que aperta o play.
  const trilha = criarTrilha()

  /** Que momento o jogo está vivendo: 'menu' | 'dia' | 'noite' | 'tensao' | 'morte'. */
  function setMomento(nome) {
    if (definirMomento(trilha, nome)) tocarMusica(null) // urgência cortou a faixa
  }

  /** Chamar uma vez por quadro. Devolve o arquivo que começou, ou null. */
  function stepMusica(dt) {
    if (!ligado || !acervoMusica) return null
    const ordem = avancarTrilha(trilha, dt, acervoMusica)
    if (!ordem) return null
    return tocarMusica(ordem.arq) ? ordem.arq : null
  }

  function setVolumeMusica(v) {
    ganhoMusica = clamp01(v)
    if (busMusica) busMusica.gain.value = ganhoMusica
  }

  /**
   * Aplica `recortarPasso` a um AudioBuffer recém-decodificado.
   *
   * A matemática mora em `passo.js` (pura, testável sem navegador); aqui fica
   * só a parte que precisa de AudioContext. Amostra dentro do orçamento passa
   * direto, sem cópia.
   */
  function encurtarPasso(buf) {
    const canais = []
    for (let ch = 0; ch < buf.numberOfChannels; ch++) canais.push(buf.getChannelData(ch))
    const cortado = recortarPasso(canais, buf.sampleRate)
    if (!cortado) return buf
    const out = ctx.createBuffer(buf.numberOfChannels, cortado[0].length, buf.sampleRate)
    for (let ch = 0; ch < cortado.length; ch++) out.getChannelData(ch).set(cortado[ch])
    return out
  }

  /**
   * ⚠️ UMA VOZ POR PÉ — o defeito do "passo sozinho na areia".
   *
   * O founder relatou (2026-08-23) que na areia "tem dois sons, um que está
   * correto com o passo ao andar e outro que fica às vezes entrando junto e se
   * repetindo infinitamente". Não eram dois sons: era o MESMO som empilhado.
   *
   * `scripts/qa-roquecraft-amostras.mjs` decodificou o banco inteiro e mediu:
   * `passo.areia` dura de 0,30 a 0,42 s, `passo.cascalho` chega a 0,66 s. A
   * cadência de passo é 1,5 m por passo; correndo (4,7 × 1,35 = 6,345 m/s) sai
   * um passo a cada 0,236 s. Amostra mais longa que o intervalo se sobrepõe à
   * seguinte, e a sobreposição não tem fim enquanto o jogador anda — vira um
   * chiado contínuo que continua soando depois que ele para, porque as últimas
   * vozes ainda estão tocando.
   *
   * As amostras foram encurtadas, mas encurtar não é garantia: alguém troca um
   * arquivo daqui a três meses e o defeito volta. A garantia é estrutural — o
   * pé tem UMA voz, e o passo novo corta o anterior. Com corte não há empilhar
   * possível, dure a amostra o que durar.
   */
  const vozes = new Map() // nome da voz → { src, g }

  function cortarVoz(nome, quando) {
    const v = vozes.get(nome)
    if (!v) return
    vozes.delete(nome)
    try {
      // rampa curta em vez de stop seco: stop no meio da onda estala
      v.g.gain.cancelScheduledValues(quando)
      v.g.gain.setValueAtTime(v.g.gain.value, quando)
      v.g.gain.linearRampToValueAtTime(0.0001, quando + 0.012)
      v.src.stop(quando + 0.02)
    } catch {
      /* já terminou sozinho */
    }
  }

  /**
   * Toca uma amostra do grupo. Devolve false quando o grupo não está carregado,
   * pra quem chamou poder cair na síntese.
   *
   * `pos` posiciona a fonte no mundo — é o que faz OUTRO jogador nadando soar à
   * distância e do lado certo. `equalpower` em vez de HRTF de propósito: HRTF
   * convolve por fonte e o custo aparece com muitas fontes simultâneas.
   */
  function tocarAmostra(grupo, { ganho = 1, pitch = 1, pos = null, atraso = 0, voz = null } = {}) {
    if (!ligado || !ensure()) return false
    const buf = escolher(grupo)
    if (!buf) return false
    if (voz) cortarVoz(voz, agora() + atraso)
    const src = ctx.createBufferSource()
    src.buffer = buf
    // Variação de altura: 5 amostras com ±6% de pitch soam como muito mais que
    // 5. Sem isso, a quinta repetição já denuncia o tamanho do banco.
    src.playbackRate.value = pitch * (0.94 + Math.random() * 0.12)
    const g = ctx.createGain()
    g.gain.value = ganho * GANHO_AMOSTRA * dbParaFator(CORRECAO_GRUPO[grupo] || 0)
    src.connect(g)
    if (pos) {
      const p = ctx.createPanner()
      p.panningModel = 'equalpower'
      p.distanceModel = 'inverse' // padrão da spec W3C
      p.refDistance = 3 // o Luanti documenta o ganho "a 3 nós"
      p.maxDistance = 96
      p.rolloffFactor = 1
      if (p.positionX) {
        p.positionX.value = pos.x
        p.positionY.value = pos.y
        p.positionZ.value = pos.z
      } else if (p.setPosition) {
        p.setPosition(pos.x, pos.y, pos.z)
      }
      g.connect(p)
      p.connect(busEfeitos)
    } else {
      g.connect(busEfeitos)
    }
    const quando = agora() + atraso
    src.start(quando)
    if (voz) {
      vozes.set(voz, { src, g })
      src.onended = () => {
        if (vozes.get(voz)?.src === src) vozes.delete(voz)
      }
    }
    return true
  }

  /** Onde está o ouvinte. Sem isto, som posicionado toca sempre centralizado. */
  function setOuvinte(pos, frente) {
    if (!ensure() || !ctx.listener) return
    const l = ctx.listener
    if (l.positionX) {
      l.positionX.value = pos.x
      l.positionY.value = pos.y
      l.positionZ.value = pos.z
    } else if (l.setPosition) {
      l.setPosition(pos.x, pos.y, pos.z)
    }
    if (!frente) return
    if (l.forwardX) {
      l.forwardX.value = frente.x
      l.forwardY.value = frente.y
      l.forwardZ.value = frente.z
      l.upX.value = 0
      l.upY.value = 1
      l.upZ.value = 0
    } else if (l.setOrientation) {
      l.setOrientation(frente.x, frente.y, frente.z, 0, 1, 0)
    }
  }

  // ── SÍNTESE DE EMERGÊNCIA ─────────────────────────────────────────────────
  //
  // Só entra quando o banco de amostras não respondeu. 1 s de ruído branco
  // reaproveitado por todo efeito: gerar buffer por som custa alocação a cada
  // bloco quebrado, e quebrar bloco é o verbo do jogo.
  function ruidoBuf() {
    if (noiseBuf) return noiseBuf
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    return noiseBuf
  }

  function ruido(when, dur, { hz, q, type, gain }, detune = 1) {
    const src = ctx.createBufferSource()
    src.buffer = ruidoBuf()
    src.loop = true
    src.playbackRate.value = 0.8 + Math.random() * 0.5
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = hz * detune
    f.Q.value = q
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, when)
    g.gain.exponentialRampToValueAtTime(gain, when + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur)
    src.connect(f).connect(g).connect(busEfeitos)
    src.start(when)
    src.stop(when + dur + 0.02)
  }

  function corpo(when, dur, hz, gain, tipo = 'triangle') {
    if (!hz) return
    const o = ctx.createOscillator()
    o.type = tipo
    o.frequency.setValueAtTime(hz * (0.9 + Math.random() * 0.2), when)
    o.frequency.exponentialRampToValueAtTime(Math.max(40, hz * 0.55), when + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, when)
    g.gain.exponentialRampToValueAtTime(gain, when + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur)
    o.connect(g).connect(busEfeitos)
    o.start(when)
    o.stop(when + dur + 0.02)
  }

  // ── API ───────────────────────────────────────────────────────────────────

  // Chamar no primeiro clique/toque. Antes disso o navegador bloqueia.
  function unlock() {
    const c = ensure()
    // `resume` só existe em contexto ao vivo. Num `OfflineAudioContext` — o que
    // o harness injeta pra medir — chamar isso lança
    // "cannot resume an offline context that has not started", e o erro polui
    // o log do QA com oito linhas que não são defeito nenhum.
    if (c && c.state === 'suspended' && typeof c.resume === 'function' && !c.startRendering) {
      c.resume()
    }
    return !!c
  }

  function setEnabled(v) {
    ligado = !!v
    if (master) master.gain.value = ligado ? volume : 0
  }

  // "O jogo está mudo" é um relato; isto é o FATO. Sem medir, mudo pode ser
  // contexto que nunca nasceu, contexto suspenso, ganho zero ou toggle
  // desligado - quatro causas com o mesmo sintoma. O harness lê isto em vez de
  // tentar ouvir (2026-08-22).
  function info() {
    return {
      temCtx: !!ctx,
      estado: ctx ? ctx.state : null,
      ganho: master ? master.gain.value : null,
      ligado,
      volume,
    }
  }

  /**
   * O ganho VIVO de cada leito de ambiente, lido do grafo de áudio.
   *
   * ⚠️ NÃO É O QUE O JOGO PEDIU, É O QUE ESTÁ TOCANDO. `setAmbiente` agenda uma
   * rampa de 1,5 s; guardar a mistura pedida daria a uma sonda a resposta que
   * ela quer ouvir mesmo se o leito nunca tivesse entrado no grafo — que foi
   * exatamente o erro da primeira sonda de som, verde com o jogo mudo. Aqui o
   * número sai do `GainNode`, depois da rampa e depois do teto do leito.
   */
  function leitosVivos() {
    const saida = {}
    for (const [grupo, no] of tocando) saida[grupo] = no.gain.gain.value
    return saida
  }

  /**
   * Pico instantâneo na saída, em dBFS. `-Infinity` quando não há contexto.
   *
   * Referência: um efeito de ação precisa viver entre -12 e -6 dBFS. Abaixo de
   * -25 ele some debaixo de qualquer ambiente; o silêncio digital puro dá
   * -Infinity, e o piso de ruído da cadeia fica perto de -60.
   */
  function picoDbfs() {
    if (!medidor) return -Infinity
    if (!amostras || amostras.length !== medidor.fftSize) {
      amostras = new Float32Array(medidor.fftSize)
    }
    medidor.getFloatTimeDomainData(amostras)
    let pico = 0
    for (let i = 0; i < amostras.length; i++) pico = Math.max(pico, Math.abs(amostras[i]))
    // ⚠️ Sem ternário para o silêncio: `Math.log10(0)` JÁ é -Infinity, e o
    // `pico > 0 ? ... : -Infinity` que estava aqui era um comparador que
    // nenhum teste podia matar — os dois lados devolviam a mesma coisa.
    return 20 * Math.log10(pico)
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v))
    if (master && ligado) master.gain.value = volume
  }

  // ── LEITOS DE AMBIENTE ────────────────────────────────────────────────────
  //
  // Vento, chuva, pássaros, grilos, ondas, caverna e o borbulhar de submerso.
  // Cada um é um loop próprio com seu ganho, e a mistura é contínua: o jogo
  // manda "quanto de cada", não "toque este". É o que faz a praia virar floresta
  // sem um corte audível no meio.
  function leito(grupo, alvo, tempo = 1.5) {
    if (!ensure()) return
    const lista = banco.get(grupo)
    let no = tocando.get(grupo)
    if (!no) {
      if (!lista || !lista.length || alvo <= 0) return
      const src = ctx.createBufferSource()
      src.buffer = lista[0]
      src.loop = true
      const g = ctx.createGain()
      g.gain.value = 0
      src.connect(g)
      g.connect(busAmbiente)
      src.start()
      no = { src, gain: g }
      tocando.set(grupo, no)
    }
    const t = agora()
    const teto = LEITOS[grupo] ?? 0.5
    no.gain.gain.cancelScheduledValues(t)
    no.gain.gain.setValueAtTime(no.gain.gain.value, t)
    no.gain.gain.linearRampToValueAtTime(clamp01(alvo) * teto, t + tempo)
  }

  /**
   * Mistura de ambiente. Recebe 0..1 por leito; o que não vier é silenciado.
   *
   * O jogo decide a mistura porque só ele sabe o bioma, a hora e se o jogador
   * está debaixo da terra. O áudio não adivinha nada.
   */
  function setAmbiente(mix = {}) {
    if (!ensure()) return
    for (const grupo of Object.keys(LEITOS)) leito(grupo, mix[grupo] ?? 0)
  }

  /**
   * Entrou ou saiu d'água. Move o corte do master entre 888 Hz e 20 kHz.
   *
   * A rampa de 500 ms é o tween do Veloren, e o comentário do código deles diz
   * por que ela existe: sem transição, "a ambiência fica muito saltitante".
   */
  function setSubmerso(v) {
    const novo = !!v
    if (novo === submerso) return submerso
    submerso = novo
    if (!ensure()) return submerso
    const t = agora()
    filtro.frequency.cancelScheduledValues(t)
    filtro.frequency.setValueAtTime(filtro.frequency.value, t)
    filtro.frequency.linearRampToValueAtTime(
      submerso ? LPF_SUBMERSO : LPF_ABERTO,
      t + LPF_TRANSICAO,
    )
    return submerso
  }

  // ── EVENTOS DO JOGO ───────────────────────────────────────────────────────

  const ganhoDe = (acao, family) => GANHO[acao]?.[family] ?? GANHO[acao]?.stone ?? 0.5

  // Contador de disparos por evento.
  //
  // Existe por causa de um defeito específico: o jogo pedia um passo por FRAME
  // com o jogador parado (`landed` era "está apoiado" em vez de "acabou de
  // encostar"), e o founder ouviu isso antes de qualquer teste pegar. Contar
  // pedidos é o único jeito de um harness afirmar "não tocou passo nenhum" —
  // medir o nível de saída não separa passo de leito de ambiente, que foi
  // exatamente onde a primeira versão do harness se enganou.
  const disparos = Object.create(null)
  const contar = (nome) => {
    disparos[nome] = (disparos[nome] || 0) + 1
  }

  function dig(family) {
    contar('dig')
    const g = ganhoDe('bate', family)
    if (tocarAmostra(GRUPO.bate[family] || 'bate.picareta', { ganho: g })) return
    if (!ligado || !ensure()) return
    const p = PROFILE[family] || PROFILE.stone
    const t = agora() + 0.001
    ruido(t, p.decay * 0.45, { ...p, gain: p.gain * 0.5 }, 0.9 + Math.random() * 0.3)
  }

  function breakBlock(family) {
    contar('breakBlock')
    const g = ganhoDe('quebra', family)
    if (tocarAmostra(GRUPO.quebra[family] || 'quebra.pedra', { ganho: g })) return
    if (!ligado || !ensure()) return
    const p = PROFILE[family] || PROFILE.stone
    const t = agora() + 0.001
    ruido(t, p.decay, p, 1)
    if (p.body) corpo(t, p.decay, p.body, 0.18)
  }

  function place(family) {
    contar('place')
    // Colocar é a mesma batida da quebra, mais curta e mais baixa: o Luanti usa
    // 1,0 pra `place` em quase tudo, mas o arquivo dele é outro. Com o mesmo
    // arquivo, o mesmo ganho soaria como destruir o bloco que você acabou de pôr.
    const g = ganhoDe('bate', family) * 0.9
    if (tocarAmostra(GRUPO.bate[family] || 'bate.picareta', { ganho: g, pitch: 0.9 })) return
    if (!ligado || !ensure()) return
    const p = PROFILE[family] || PROFILE.stone
    const t = agora() + 0.001
    ruido(t, p.decay * 0.5, { ...p, gain: p.gain * 0.55 }, 0.9)
    corpo(t, p.decay * 0.5, (p.body || 160) * 0.7, 0.1)
  }

  function step(family) {
    contar('step')
    const g = ganhoDe('passo', family)
    if (tocarAmostra(GRUPO.passo[family] || 'passo.pedra', { ganho: g, voz: 'passo' })) return
    if (!ligado || !ensure()) return
    const p = PROFILE[family] || PROFILE.stone
    const t = agora() + 0.001
    ruido(t, 0.07, { ...p, gain: p.gain * 0.55 }, 0.7 + Math.random() * 0.4)
  }

  function hurt() {
    contar('hurt')
    if (!ligado || !ensure()) return
    const t = agora() + 0.001
    corpo(t, 0.22, 300, 0.16, 'square')
    ruido(t, 0.14, { hz: 800, q: 0.8, type: 'lowpass', gain: 0.2 })
  }

  /** Corpo entrando n'água. `forca` 0..1 escala com a velocidade da queda. */
  function splash(forca = 0.6) {
    contar('splash')
    if (tocarAmostra('agua.mergulho', { ganho: 0.45 + clamp01(forca) * 0.5 })) return
    if (!ligado || !ensure()) return
    const t = agora() + 0.001
    ruido(t, 0.34, { hz: 1800, q: 0.7, type: 'lowpass', gain: 0.45 })
    ruido(t + 0.05, 0.22, { hz: 3400, q: 0.9, type: 'highpass', gain: 0.22 })
  }

  /**
   * Braçada. `pos` posiciona a fonte: é assim que OUTRO jogador nadando soa do
   * lado certo e some com a distância, em vez de tocar dentro da sua cabeça.
   */
  function bracada(pos = null) {
    contar('bracada')
    if (tocarAmostra('agua.bracada', { ganho: pos ? 0.6 : 0.34, pos })) return
    if (!ligado || !ensure()) return
    const t = agora() + 0.001
    ruido(t, 0.2, { hz: 1500, q: 0.7, type: 'lowpass', gain: 0.22 })
  }

  /** Bolha solta debaixo d'água. */
  function bolha(pos = null) {
    contar('bolha')
    if (tocarAmostra('agua.bolha', { ganho: 0.4, pos })) return
    if (!ligado || !ensure()) return
    corpo(agora() + 0.001, 0.09, 700, 0.08, 'sine')
  }

  /**
   * TROVÃO, sintetizado.
   *
   * ⚠️ E SINTETIZADO DE PROPÓSITO, não por falta de arquivo. Trovão bom é longo
   * (3 a 8 s), e um .ogg longo o bastante para não repetir custaria centenas de
   * KB no primeiro carregamento do jogo — para um som que toca algumas vezes por
   * tempestade, em 8% do tempo. Sintetizado ele é diferente TODA vez e não pesa
   * um byte no download.
   *
   * A forma vem do fenômeno: o estouro é o canal de ar fechando de uma vez
   * (banda larga, ataque curto) e o ROLO é o mesmo estouro chegando de trechos
   * cada vez mais distantes do raio, que tem quilômetros de comprimento. Por
   * isso o rolo é feito de várias camadas atrasadas e cada vez mais graves: o ar
   * come o agudo no caminho.
   *
   * @param {number} distanciaKm distância do raio — decide grave, volume e duração
   */
  function trovao(distanciaKm = 2) {
    contar('trovao')
    if (!ligado || !ensure()) return
    const d = Math.max(0.1, Math.min(9, Number(distanciaKm) || 2))
    const t = agora() + 0.001
    // Longe = grave e fraco. O ar é um filtro passa-baixa com a distância, e
    // isso não é estilo: é por isso que trovão de longe é ronco e de perto é
    // estalo. 0,15 km estala em 5 kHz; 6 km rola em ~320 Hz.
    const perto = 1 - Math.min(1, (d - 0.15) / 6)
    const corte = 320 + perto * perto * 4700
    const forca = 0.1 + perto * 0.55
    const camadas = 4 + Math.round(perto * 3)
    for (let i = 0; i < camadas; i++) {
      // Cada camada chega um pouco depois e mais grave: é o comprimento do
      // próprio raio virando duração.
      const atraso = i * (0.12 + Math.random() * 0.42) * (0.6 + d * 0.25)
      const hz = corte * Math.pow(0.62, i) * (0.75 + Math.random() * 0.5)
      const dur = (0.5 + Math.random() * 1.1) * (1 + d * 0.2)
      ruido(t + atraso, dur, {
        hz: Math.max(70, hz),
        q: 0.5 + Math.random() * 0.6,
        type: 'lowpass',
        gain: forca * Math.pow(0.72, i) * (0.7 + Math.random() * 0.6),
      })
    }
    // O peito do trovão: o grave que se sente antes de ouvir.
    corpo(t + 0.02, 0.9 + d * 0.15, 44 + perto * 26, forca * 0.5, 'sine')
  }

  function pop() {
    contar('pop')
    if (!ligado || !ensure()) return
    const t = agora() + 0.001
    corpo(t, 0.09, 620, 0.1, 'sine')
  }

  function dispose() {
    for (const no of tocando.values()) {
      try {
        no.src.stop()
      } catch {
        // fonte já parada
      }
    }
    tocando.clear()
    banco.clear()
    ultimo.clear()
    try {
      ctx?.close()
    } catch {
      // contexto já fechado: nada a fazer
    }
    for (const v of vozesMusica) {
      try {
        v?.el?.pause()
        if (v?.el) v.el.src = ''
      } catch {
        // elemento já solto
      }
    }
    vozesMusica.length = 0
    ctx = null
    master = null
    filtro = null
    busEfeitos = null
    busAmbiente = null
    busMusica = null
    noiseBuf = null
    medidor = null
    amostras = null
    carregando = null
  }

  return {
    unlock,
    setEnabled,
    setVolume,
    setMomento,
    stepMusica,
    setVolumeMusica,
    info,
    picoDbfs,
    carregar,
    dig,
    breakBlock,
    place,
    step,
    hurt,
    splash,
    trovao,
    bracada,
    bolha,
    pop,
    setAmbiente,
    leitosVivos,
    setSubmerso,
    setOuvinte,
    dispose,
    /** Dispara um grupo com ganho explícito. Só pra calibração: mede a curva
     *  da cadeia sem a tabela de ganhos por material no caminho. */
    tocarCru: (grupo, ganho) => tocarAmostra(grupo, { ganho }),
    /** Zera o contador de disparos. O harness mede janelas, não totais. */
    zerarDisparos: () => {
      for (const k of Object.keys(disparos)) delete disparos[k]
    },
    // superfície de teste: o QA precisa afirmar "o banco carregou e este grupo
    // tem N amostras" sem depender de ouvir nada
    get bancoInfo() {
      return {
        grupos: banco.size,
        amostras: [...banco.values()].reduce((a, v) => a + v.length, 0),
        falha: falhaBanco,
        submerso,
        corte: filtro ? Math.round(filtro.frequency.value) : null,
        leitos: [...tocando.keys()],
        disparos: { ...disparos },
        musica: {
          momento: trilha.momento,
          noAr: noAr(trilha),
          acervo: acervoMusica ? Object.keys(acervoMusica).length : 0,
          vozes: vozesMusica.filter(Boolean).length,
        },
      }
    },
  }
}
