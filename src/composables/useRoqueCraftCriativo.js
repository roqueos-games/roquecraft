import { ref, watch, computed } from 'vue'
import {
  podeReger,
  soltarTudo,
  velocidadeDoRelogio,
  coordenadaDigitada,
  lembrarDeOndeSaiu,
} from '../servicos/criativo.js'

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
 * @param {(d: string, alvo?: object|null) => boolean} ctx.irParaDimensao  a porta
 *   da travessia; com `alvo`, pousa perto dele em vez de escalar a coordenada
 * @param {(alvo: {x,y,z}) => boolean} ctx.irAte  um ponto na dimensão de agora
 *   (`y: null` = o chão, que a travessia acha)
 * @param {() => {x:number,y:number,z:number}} ctx.posicao  onde o jogador está
 * @param {(chave: string) => object|null} ctx.lugar  onde fica um lugar do
 *   mundo (`nascimento`, `cama`, `vila`, `fortaleza`) como `{dimensao,x,y,z}`,
 *   ou `null` quando ele não existe (sem cama, semente sem vila)
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
  irAte = () => false,
  posicao = () => ({ x: 0, y: 0, z: 0 }),
  lugar = () => null,
  emSala,
  avisar,
}) {
  const aberto = ref(false)
  const travado = ref(false)
  /** De onde cada teleporte saiu, para "voltar". Lista nova a cada mudança. */
  const historico = ref([])

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
  function podeTeleportar() {
    if (!podeReger(modo())) {
      avisar('roqueCraft.flyCreativeOnly')
      return false
    }
    if (emSala()) {
      avisar('roqueCraft.criativo.naSalaNao')
      return false
    }
    return true
  }

  /** Onde o jogador está agora, com a dimensão: é o que "voltar" devolve. */
  const aqui = () => ({ dimensao: dimensao(), ...posicao() })

  /**
   * Leva a um ponto, na dimensão que for: a mesma dimensão é pouso
   * (`irAte`), outra é travessia com alvo (`irParaDimensao`). Antes de ir,
   * lembra de onde saiu; é o ÚNICO lugar que escreve no histórico, para o
   * lugar, a coordenada e a própria volta lembrarem do mesmo jeito.
   */
  function irAoPonto(ponto, { lembrar = true } = {}) {
    const de = aqui()
    const foi =
      ponto.dimensao === de.dimensao ? irAte(ponto) : irParaDimensao(ponto.dimensao, ponto)
    if (!foi) {
      avisar('roqueCraft.criativo.agoraNao')
      return false
    }
    if (lembrar) historico.value = lembrarDeOndeSaiu(historico.value, de)
    return true
  }

  function teleportar(destino) {
    if (!podeTeleportar()) return false
    if (destino === dimensao()) return false
    const de = aqui()
    const foi = irParaDimensao(destino)
    // A travessia recusa sozinha no meio de outra troca. Se ela disse não, o
    // jogador precisa saber por que o clique não fez nada.
    if (!foi) avisar('roqueCraft.criativo.agoraNao')
    else historico.value = lembrarDeOndeSaiu(historico.value, de)
    return foi
  }

  /** Um lugar do mundo pelo nome (Goal 23, onda 4). Lugar que não existe é DITO. */
  function irAoLugar(chave) {
    if (!podeTeleportar()) return false
    const ponto = lugar(chave)
    if (!ponto) {
      avisar(chave === 'cama' ? 'roqueCraft.criativo.semCama' : 'roqueCraft.criativo.semVila')
      return false
    }
    return irAoPonto(ponto)
  }

  /**
   * Uma coordenada digitada, na dimensão de agora. Sem Y (`null`), quem acha o
   * chão é a travessia (`irAte`): o mundo é dela, não deste painel.
   */
  function irACoordenada(digitada) {
    if (!podeTeleportar()) return false
    const c = coordenadaDigitada(digitada)
    if (!c) {
      avisar('roqueCraft.criativo.coordenadaInvalida')
      return false
    }
    return irAoPonto({ dimensao: dimensao(), x: c.x + 0.5, y: c.y, z: c.z + 0.5 })
  }

  /** De volta a de onde saiu no último teleporte, e o histórico anda um. */
  function voltar() {
    if (!podeTeleportar()) return false
    const lista = historico.value
    if (!lista.length) return false
    const destino = lista[lista.length - 1]
    // A volta NÃO se lembra: "voltar, voltar" tem que andar duas para trás, e
    // não ficar quicando entre os dois últimos pontos.
    const foi = irAoPonto(destino, { lembrar: false })
    if (foi) historico.value = lista.slice(0, -1)
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
    podeVoltar: historico.value.length > 0,
    temCama: !!lugar('cama'),
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
    lugar: (chave) => irAoLugar(chave),
    coordenada: (c) => irACoordenada(c),
    voltar: () => voltar(),
  }

  return {
    aberto,
    travado,
    historico,
    alternar,
    soltar,
    teleportar,
    irAoLugar,
    irACoordenada,
    voltar,
    vigiarModo,
    velocidade,
    vista,
    acoes,
  }
}
