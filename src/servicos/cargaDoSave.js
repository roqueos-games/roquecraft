// RoqueCraft - O QUE ACONTECEU AO LER O SAVE, e se dá para gravar por cima.
//
// ⚠️ ESTE ARQUIVO EXISTE POR UM DEFEITO QUE APAGAVA MUNDO DE VERDADE (RC-02).
//
// O `boot` fazia assim:
//
//     try { salvo = await loadRoqueCraft(uid) }
//     catch (err) { console.error(err) }        // <- e seguia em frente
//
// Com `salvo` em `null`, `estadoInicial` devolve mundo NOVO -- que é a resposta
// certa para "este jogador nunca jogou" e a resposta desastrosa para "o
// Firestore não respondeu agora". O jogador cai num mundo vazio, coloca um
// bloco, e o autosave grava esse mundo vazio POR CIMA de meses de construção.
// Uma queda de rede de três segundos no boot apagava tudo, em silêncio.
//
// A causa não é a rede: é que **não ter save e não conseguir ler o save eram a
// mesma coisa** para o resto do jogo. Aqui elas passam a ser estados diferentes,
// e a gravação passa a perguntar antes.
//
// Puro de propósito: entra o que aconteceu na leitura, sai o estado. Sem rede,
// sem Vue, sem host -- para que o teste possa afirmar o caso que importa
// sem montar o jogo inteiro.

/**
 * Os quatro estados possíveis de uma tentativa de carga.
 *
 * ⚠️ `NAO_TENTOU` NÃO É `VAZIO`. Sem onde guardar (convidado, `progresso.disponivel()`
 * falso) ou em modo E2E o jogo nem chega a perguntar ao host: não há save para
 * ler e também não haverá gravação, porque a porta da conta já barra. Confundir os dois faria o harness parecer um
 * jogador novo, e um jogador novo pode gravar.
 */
export const CARGA = Object.freeze({
  /** Nem tentou ler: sem onde guardar, ou modo E2E. */
  NAO_TENTOU: 'nao_tentou',
  /** Leu e veio save. */
  CARREGADO: 'carregado',
  /** Leu e não havia save: jogador novo de verdade. */
  VAZIO: 'vazio',
  /** Tentou ler e FALHOU. O save pode existir e estar lá inteiro. */
  INDISPONIVEL: 'indisponivel',
})

/**
 * Classifica o que aconteceu na leitura.
 *
 * @param {object} e
 * @param {boolean} e.tentou  o jogo chegou a pedir o save?
 * @param {unknown} e.erro    o que a leitura estourou, se estourou
 * @param {object|null} e.salvo o que voltou
 */
export function classificarCarga({ tentou, erro = null, salvo = null }) {
  if (!tentou) return CARGA.NAO_TENTOU
  if (erro) return CARGA.INDISPONIVEL
  return salvo ? CARGA.CARREGADO : CARGA.VAZIO
}

/**
 * Pode gravar por cima do que está no servidor?
 *
 * ⚠️ A RESPOSTA É "NÃO" SÓ NUM CASO, e é de propósito que seja um só: qualquer
 * porta a mais aqui vira jogo que não salva por engano, e um jogo que não salva
 * por engano perde tanto quanto um que salva por cima. As outras portas
 * (conta, sala, harness) continuam em `useRoqueCraftPersistencia`, onde já moram.
 */
export function podeSalvar(estado) {
  return estado !== CARGA.INDISPONIVEL
}

/**
 * O jogador precisa ser avisado?
 *
 * Só quando a leitura falhou. Mundo novo não é aviso, é o começo do jogo.
 */
export function precisaAvisar(estado) {
  return estado === CARGA.INDISPONIVEL
}

/**
 * A chave i18n do aviso, ou `null` quando não há o que dizer.
 *
 * A chave e não o texto: serviço puro não sabe o idioma de ninguém.
 */
export function chaveDoAviso(estado) {
  return precisaAvisar(estado) ? 'roqueCraft.error.saveIndisponivel' : null
}

/**
 * Ler o save já classificado: o boot inteiro em uma chamada.
 *
 * ⚠️ ELA EXISTE PARA QUE O `.vue` NÃO DECIDA NADA. A versão anterior deste
 * conserto deixava o `try/catch`, a classificação e o aviso dentro do `boot`, e
 * o guard de tamanho de componente reprovou na hora (+24 linhas). Ele estava
 * certo por um motivo melhor que contagem: política dentro do componente é
 * política sem teste, e foi exatamente assim que o RC-02 nasceu.
 *
 * `ler` entra por parâmetro porque serviço puro não conhece o host.
 *
 * `disponivel` era `uid` até a extração: o jogo perguntava pela conta. Agora
 * quem sabe se há onde guardar é o host (`progresso.disponivel()`), e o jogo não
 * pergunta pelo uid de ninguém: no `yarn dev` do repo, sem conta, o save local
 * funciona, e no RoqueOS o convidado continua sem tentar.
 *
 * @param {object} e
 * @param {boolean} e.disponivel  há onde guardar?
 * @param {boolean} e.ehE2E
 * @param {() => Promise<object|null>} e.ler  rejeita quando não consegue ler
 * @returns {Promise<{salvo: object|null, estado: string, aviso: string|null, erro: unknown}>}
 */
export async function carregarSave({ disponivel, ehE2E = false, ler }) {
  if (!disponivel || ehE2E) {
    return { salvo: null, estado: CARGA.NAO_TENTOU, aviso: null, erro: null }
  }
  try {
    const salvo = await ler()
    const estado = classificarCarga({ tentou: true, salvo })
    return { salvo, estado, aviso: chaveDoAviso(estado), erro: null }
  } catch (erro) {
    const estado = classificarCarga({ tentou: true, erro })
    // `salvo: null` porque não há o que confiar; o que impede o estrago é o
    // `estado`, não este null.
    return { salvo: null, estado, aviso: chaveDoAviso(estado), erro }
  }
}

/**
 * O que o jogador e o console veem depois da carga.
 *
 * Recebe o `avisar` do host e o tradutor por parâmetro: assim o `.vue` só liga
 * os fios, e este pedaço -- que é o que o jogador de fato percebe quando o save
 * não abre -- passa a ter teste.
 *
 * ⚠️ `fixo: true` É REGRA, NÃO GOSTO. É este aviso que separa "meu mundo
 * sumiu" de "meu mundo está a salvo, tente de novo", e um aviso que some
 * sozinho em cinco segundos não separa coisa nenhuma. No RoqueOS era o
 * `timeout: 0` da notificação; no contrato do jogo-sdk é o `fixo` do `avisar`.
 *
 * @param {object} carga  o que `carregarSave` devolveu
 * @param {(chave: string) => string} t
 * @param {(mensagem: string, opcoes: { tipo: string, fixo?: boolean }) => void} avisar  o `host.avisar`
 * @returns {boolean} avisou o jogador?
 */
export function avisarDaCarga(carga, t, avisar, logar = console.error) {
  if (carga?.erro) logar('[RoqueCraft] falha ao carregar save:', carga.erro)
  if (!carga?.aviso) return false
  avisar(t(carga.aviso), { tipo: 'erro', fixo: true })
  return true
}
