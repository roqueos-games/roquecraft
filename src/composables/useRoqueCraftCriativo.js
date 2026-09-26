import { ref, watch, computed } from 'vue'
import { podeReger, soltarTudo, velocidadeDoRelogio } from '../servicos/criativo.js'

/**
 * REGER O MUNDO — o estado do painel de criativo.
 *
 * ⚠️ ELE NÃO GUARDA O TEMPO NEM O CLIMA. Os donos já existem: `ticks` é do
 * componente e a chuva é de `useRoqueCraftClima`. Este composable guarda só o
 * que é DELE — se o painel está aberto e se o relógio está travado — e manda
 * nos donos. Um segundo dono para "que horas são" é o defeito do minimapa de
 * novo: duas verdades para a mesma pergunta, e a que o jogador vê é a que
 * escreveu por último.
 *
 * Nasceu como 68 linhas dentro de `ROSRoqueCraft.vue` e a catraca de tamanho
 * recusou, com razão: o componente está na lista dos vigiados e a regra é
 * dividir antes de adicionar.
 *
 * ⚠️ ELE MONTA A PRÓPRIA VISTA E OS PRÓPRIOS EVENTOS (`vista` e `acoes`). Não é
 * elegância: `ROSRoqueCraft.vue` está na catraca de tamanho, e catorze linhas
 * de `<RCCriativo :isto="..." @aquilo="..." />` no template dele não passavam.
 * A fiação existe de qualquer jeito; a escolha é em qual arquivo ela mora, e o
 * lugar certo é junto de quem conhece as regras — não no componente de 2.400
 * linhas que já não cabe na cabeça de ninguém.
 *
 * @param {object} ctx
 * @param {() => string} ctx.modo  GETTER do modo de jogo (`mode.value`)
 * @param {(c:number|null) => void} ctx.forcarChuva  já com o bioma resolvido
 * @param {() => number} ctx.instante  GETTER do relógio amostrado para a tela
 * @param {(t:number) => void} ctx.irParaHora  escreve `ticks` de volta no dono
 * @param {() => number|null} ctx.chuvaForcada  `clima.forcado.value`
 * @param {() => string} ctx.bioma  o rótulo do bioma, para chuva ou neve
 * @param {() => boolean} ctx.nevando
 * @param {() => void} ctx.soltarRaio
 * @param {() => string} ctx.dimensao  GETTER da dimensão viva
 * @param {(d: string) => boolean} ctx.irParaDimensao  a porta da travessia
 * @param {() => boolean} ctx.emSala  multijogador: a dimensão é outra fatia
 * @param {(chave: string) => void} ctx.avisar  recado curto na tela, por chave
 *   de i18n. ⚠️ UM CAMINHO SÓ para todo recado deste painel: eram dois
 *   (`avisarSoCriativo` e `avisar`) fazendo a mesma chamada com chaves
 *   diferentes, e o segundo nasceu sem ninguém notar o primeiro — que é como
 *   duas noções da mesma coisa começam.
 */
export function useRoqueCraftCriativo({
  modo,
  forcarChuva,
  instante,
  irParaHora,
  chuvaForcada,
  bioma,
  nevando,
  soltarRaio,
  dimensao,
  irParaDimensao,
  emSala,
  avisar,
}) {
  const aberto = ref(false)
  const travado = ref(false)

  function alternar() {
    if (!podeReger(modo())) {
      avisar('roqueCraft.flyCreativeOnly')
      return false
    }
    aberto.value = !aberto.value
    return aberto.value
  }

  function soltar() {
    const solto = soltarTudo()
    travado.value = solto.travado
    forcarChuva(solto.chuva)
  }

  // ⚠️ TROCAR DE MODO FECHA O PAINEL, e não é capricho: dá para ir a
  // sobrevivência pelo menu de pausa com o painel aberto, e um painel de
  // criativo sobrevivendo ali é um jeito de reger o mundo em sobrevivência —
  // exatamente o que `podeReger` existe para impedir. O cadeado solta junto: um
  // relógio parado que o jogador não tem mais como destravar é um mundo travado.
  function vigiarModo(fonte) {
    watch(fonte, (m) => {
      if (podeReger(m)) return
      aberto.value = false
      travado.value = false
    })
  }

  /** A velocidade que o laço de quadro passa para `advanceTime`. */
  const velocidade = () => velocidadeDoRelogio(travado.value)

  /**
   * TELEPORTAR (Goal 23, onda 3).
   *
   * ⚠️ AS TRÊS RECUSAS SÃO DITAS AO JOGADOR, e não engolidas. Um botão que não
   * faz nada e não explica é o pior dos três estados: o jogador clica de novo,
   * acha que o jogo travou, e o defeito que ele relata é "o teleporte não
   * funciona" — sem dizer que estava numa sala.
   */
  function teleportar(destino) {
    if (!podeReger(modo())) {
      avisar('roqueCraft.flyCreativeOnly')
      return false
    }
    if (emSala()) {
      avisar('roqueCraft.criativo.naSalaNao')
      return false
    }
    if (destino === dimensao()) return false
    const foi = irParaDimensao(destino)
    // A travessia recusa sozinha no meio de outra troca. Se ela disse não, o
    // jogador precisa saber por que o clique não fez nada.
    if (!foi) avisar('roqueCraft.criativo.agoraNao')
    return foi
  }

  /** O que o painel lê, num objeto só para `v-bind`. */
  const vista = computed(() => ({
    ticks: instante(),
    travado: travado.value,
    chuva: chuvaForcada(),
    bioma: bioma(),
    neva: nevando(),
    dimensao: dimensao(),
    emSala: emSala(),
  }))

  /** O que o painel dispara, num objeto só para `v-on`. */
  const acoes = {
    close: () => (aberto.value = false),
    hora: (t) => irParaHora(t),
    travar: (v) => (travado.value = !!v),
    chuva: (c) => forcarChuva(c),
    raio: () => soltarRaio(),
    soltar,
    teleportar: (d) => teleportar(d),
  }

  return {
    aberto,
    travado,
    alternar,
    soltar,
    teleportar,
    vigiarModo,
    velocidade,
    vista,
    acoes,
  }
}
