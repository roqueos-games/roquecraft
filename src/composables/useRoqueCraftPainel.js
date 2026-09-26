// RoqueCraft - O PAINEL: o que a tela mostra, e a que ritmo.
//
// E COMPOSABLE E NAO SERVICO porque e dono dos refs que a tela le e dos
// acumuladores que dizem QUANDO atualiza-los. Nada aqui e conta; tudo aqui e
// cadencia.
//
// ⚠️ DUAS CADENCIAS, DE PROPOSITO.
//
// O contador de quadros anda a cada meio segundo; o resto do painel, quatro
// vezes por segundo. Escrever posicao, relogio, bioma e contagem de chunk em
// ref reativo a SESSENTA quadros por segundo poe o Vue pra trabalhar sessenta
// vezes por segundo pra desenhar um numero que muda devagar - e num jogo o
// orcamento de quadro e do render, nao do painel.
//
// A excecao mora fora daqui: a barra de carga do golpe escreve por QUADRO,
// porque numa recarga de 0,625 s quatro leituras por segundo dao tres degraus e
// a barra pula em vez de encher. Ela fica no laco do jogo, junto do combate.

import { BIOME_NAMES } from '../servicos/worldgen.js'
import { ref, reactive, markRaw } from 'vue'

/** Segundos entre duas leituras do contador de quadros. */
export const JANELA_DO_FPS = 0.5
/** Segundos entre duas atualizacoes do painel. */
export const PASSO_DO_PAINEL = 0.25
/** Quanto o flash vermelho de dano perde por atualizacao. */
export const DESBOTE_DO_FLASH = 0.25

/**
 * @param {object} ctx
 * @param {() => object} ctx.mundo  GETTER do cliente do mundo
 * @param {object} ctx.corpo  `{ pos, yaw, pitch, alturaDoOlho, flashDeDano }`
 * @param {() => number} ctx.instante  `ticks`
 * @param {(chave: string) => string} ctx.rotuloDoBioma  i18n fica fora: recebe
 *   `biomes.<nome>` ou `dimensao.<id>` e devolve o texto
 * @param {(indiceDoBioma: number) => void} ctx.aoLerBioma  clima e ambiente
 * @param {(pos: object, dir: object) => void} ctx.ouvinte  posiciona o audio 3D
 * @param {(t: number) => string} ctx.relogio  `clockLabel`
 * @param {(t: number) => boolean} ctx.ehNoite  `isNight`
 */
/**
 * A chave i18n do que o painel chama de "bioma". Fora do overworld o bioma é a
 * DIMENSÃO: o Nether e o Fim geram bioma 0, e o painel dizia "Oceano" no meio
 * da lava.
 */
export const chaveDoRotulo = (b, dimensao) =>
  dimensao && dimensao !== 'overworld' ? `dimensao.${dimensao}` : `biomes.${BIOME_NAMES[b]}`

export function useRoqueCraftPainel(ctx) {
  const { mundo, corpo, instante, rotuloDoBioma, aoLerBioma, ouvinte, relogio, ehNoite } = ctx

  const fps = ref(0)
  // ⚠️ `vivo` É O ESPELHO NÃO REATIVO DA POSE, ESCRITO POR QUADRO.
  //
  // A cadência de 4 Hz acima existe para não pôr o Vue a trabalhar sessenta
  // vezes por segundo desenhando um número que muda devagar, e continua valendo
  // para os campos reativos. Mas o minimapa não é um número: a 4 Hz ele ANDA AOS
  // PULOS, em degraus de 250 ms, e um mapa que pula é pior que nenhum.
  //
  // `markRaw` é o que fecha a conta: sem ele o `reactive` embrulharia este
  // objeto num proxy e as quatro escritas por quadro voltariam a acordar o
  // sistema reativo — que é exatamente o custo que a cadência evita. Quem lê daqui
  // lê de fora de um efeito do Vue (o `setInterval` do canvas) e por isso não
  // assina nada.
  const posicao = reactive({
    x: 0,
    y: 0,
    z: 0,
    vivo: markRaw({ x: 0, y: 0, z: 0, yaw: 0, semente: null, dimensao: null }),
  })
  const horario = ref('06:00')
  // ⚠️ O NÚMERO, ALÉM DO TEXTO. O painel de criativo precisa da POSIÇÃO do
  // relógio (um controle deslizante não sabe ler '06:00'), e `ticks` é um `let`
  // do componente — ninguém na tela consegue observá-lo. Este ref sai da MESMA
  // amostragem que já produz o texto, então não nasce um segundo dono do tempo:
  // é o mesmo valor, escrito uma vez, lido de duas formas.
  const instanteNaTela = ref(0)
  const ehDeNoite = ref(false)
  const chunksCarregados = ref(0)
  const bioma = ref('')

  let acumuladoDoFps = 0
  let quadros = 0
  let acumuladoDoPainel = 0

  /** O contador de quadros. Meio segundo e curto pra reagir e longo pra nao piscar. */
  function contarQuadro(dt) {
    acumuladoDoFps += dt
    quadros++
    if (acumuladoDoFps < JANELA_DO_FPS) return
    fps.value = Math.round(quadros / acumuladoDoFps)
    acumuladoDoFps = 0
    quadros = 0
  }

  /**
   * O painel, quatro vezes por segundo. Devolve `true` no quadro em que
   * atualizou - quem quiser pendurar mais coisa na mesma cadencia usa isso em
   * vez de criar um terceiro acumulador.
   */
  function atualizarPainel(dt) {
    // POR QUADRO, antes do acumulador: ver a nota do `vivo` acima.
    const vivo = posicao.vivo
    vivo.x = corpo.pos.x
    vivo.y = corpo.pos.y
    vivo.z = corpo.pos.z
    vivo.yaw = corpo.yaw()
    acumuladoDoPainel += dt
    if (acumuladoDoPainel <= PASSO_DO_PAINEL) return false
    acumuladoDoPainel = 0
    const world = mundo()
    if (!world) return false

    const p = corpo.pos
    posicao.x = p.x
    posicao.y = p.y
    posicao.z = p.z
    const t = instante()
    horario.value = relogio(t)
    instanteNaTela.value = t
    ehDeNoite.value = ehNoite(t)
    chunksCarregados.value = world.loadedCount
    // ⚠️ DO CLIENTE, e não do ref de semente do componente: depois de um `reset`
    // os dois divergem, e quem desenha terreno a partir da semente errada
    // desenha um mundo em que o jogador não está mais.
    posicao.vivo.semente = world.semente
    posicao.vivo.dimensao = world.dimensao
    const b = world.biomeAt(Math.floor(p.x), Math.floor(p.z))
    bioma.value = b >= 0 ? rotuloDoBioma(chaveDoRotulo(b, world.dimensao)) : ''
    // O flash vermelho desbota aqui e nao por quadro: ele e HUD, e a 4 Hz o
    // olho nao ve degrau nenhum num efeito que dura menos de um segundo.
    if (corpo.flashDeDano.value > 0)
      corpo.flashDeDano.value = Math.max(0, corpo.flashDeDano.value - DESBOTE_DO_FLASH)
    aoLerBioma(b)
    // Onde o ouvinte esta e pra onde olha. Sem isto, som posicionado - outro
    // jogador nadando - toca centralizado, como se estivesse dentro da cabeca.
    // 4x/s basta: o painner interpola, e a cabeca nao teleporta.
    const yaw = corpo.yaw()
    const pitch = corpo.pitch()
    ouvinte(
      { x: p.x, y: p.y + corpo.alturaDoOlho, z: p.z },
      {
        x: Math.sin(yaw) * Math.cos(pitch),
        y: Math.sin(pitch),
        z: -Math.cos(yaw) * Math.cos(pitch),
      },
    )
    return true
  }

  return {
    fps,
    posicao,
    horario,
    instanteNaTela,
    ehDeNoite,
    chunksCarregados,
    bioma,
    contarQuadro,
    atualizarPainel,
  }
}
