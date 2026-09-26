//
// AS TELAS QUE UM BLOCO OU UM BICHO ABREM.
//
// Baú, fornalha, suporte de poções e comércio de aldeão são quatro coisas
// diferentes no mundo e UMA coisa só na interface: um painel que toma o cursor
// do jogo, mostra slots, e devolve o controle ao fechar. Estavam espalhadas em
// setenta linhas do componente — quatro `ref`, cinco `computed` e quatro
// funções — e cada painel novo custava mais setenta.
//
// ⚠️ É COMPOSABLE E NÃO SERVIÇO, pelo critério escrito em
// `useRoqueCraftPersistencia`: aqui nascem `ref` e `computed`, que são estado
// reativo do Vue. Serviço é o que é função pura com tabela — `mobilia.js`,
// `fermentacao.js` e `comercio.js`, que continuam sendo quem SABE as regras.
// Isto aqui é a ligação delas com a tela, e nada mais.
//
// ⚠️ A REVISÃO EXPLÍCITA (`revisaoMobilia`) existe porque a mobília NÃO é
// reativa: ela é um `Map` de objetos simples, escrito sessenta vezes por
// segundo pelo passo do mundo. Torná-la reativa poria um `Proxy` no caminho
// quente para redesenhar um painel que quase sempre está fechado. O contador é
// a dependência que o `computed` consegue ver.

import { ref, shallowRef, computed } from 'vue'
import {
  mobiliaEm,
  esvaziarMobilia,
  avancarMobilia,
  serializarEntrada,
  desserializarEntrada,
  versionar,
  chaveDaMobilia,
  fracaoDeFogo,
  fracaoDeFundicao,
  cliqueNaMobilia,
} from '../servicos/mobilia.js'
import { fracaoDaFermentada } from '../servicos/fermentacao.js'
import { criarComercioDaSessao } from '../servicos/comercio.js'
import { devolverCursorAoFechar } from '../servicos/fecharMobilia.js'
import { criarFalaDoRoqueOS } from '../servicos/falaDoRoqueOS.js'
import { falaDoNpc } from '../servicos/falaDoNpc.js'
import { humorDe } from '../servicos/npc.js'

/**
 * @param ctx.mobilia GETTER do registro de mobília (recriado em mundo novo)
 * @param ctx.inventario `{get, set}` do inventário do jogador
 * @param ctx.cursor `{get, set}` do que está preso ao ponteiro
 * @param ctx.maquina `{remover, adicionar, espacoPara}` — as contas de empilhar
 * @param ctx.salvar agenda o save
 * @param [ctx.mobiliaMudou] `(k, desfazer) => void` — a mobília mudou por um clique
 *   ou quebra (a sala, Onda 6.3). `desfazer()` devolve cursor e inventário ao
 *   que eram ANTES do clique, para quando a sala recusa (Onda 6.4).
 * @param [ctx.mobiliaQueimou] `(k) => void` — fornalha/suporte avançou no tique
 * @param [ctx.regeMobilia] `() => boolean` — este cliente faz a fornalha queimar? (na sala, só o anfitrião)
 * @param ctx.avisar `(chave) => void`
 * @param [ctx.ia] a capacidade `ia` do host (o aldeão que conversa); sem ela, fala local
 * @param ctx.soltarPonteiro / ctx.prenderPonteiro
 */
export function useRoqueCraftPaineis(ctx) {
  /** O bloco aberto: `{ tipo, x, y, z }`. */
  const aberto = ref(null)
  /**
   * O aldeão aberto: o MOB vivo, e não uma cópia — ver `comercio.js`.
   *
   * ⚠️ `shallowRef` E NÃO `ref`, por dois motivos, e o segundo é um defeito de
   * verdade que o teste deste arquivo pegou:
   *
   *  1. um mob é escrito sessenta vezes por segundo pela IA. `ref` embrulharia
   *     o objeto inteiro num `Proxy` reativo e poria um observador no caminho
   *     quente — o mesmo motivo pelo qual a mobília não é reativa.
   *  2. o `Proxy` QUEBRA A IDENTIDADE. `aldeaoAberto.value` devolveria o proxy
   *     enquanto a lista de criaturas guarda o objeto cru, e o
   *     `m === aberto.get()` do passo de estoque nunca seria verdade: a tela
   *     aberta jamais redesenharia quando o estoque voltasse, e ninguém ligaria
   *     esse sintoma a uma decisão de reatividade.
   */
  const aldeaoAberto = shallowRef(null)
  const revisaoMobilia = ref(0)
  const revisaoDoComercio = ref(0)
  const avisarMobilia = () => (revisaoMobilia.value = (revisaoMobilia.value + 1) % 1e6)

  /**
   * A FALA ABERTA: o balão do aldeão.
   *
   * ⚠️ `pensando` É UM ESTADO DE VERDADE, e não enfeite de carregamento. A
   * resposta do modelo leva segundos e pode não vir; sem um estado visível, o
   * jogador clica de novo, e de novo, e cada clique é uma chamada.
   */
  const fala = ref({ texto: '', fonte: '', pensando: false })
  // ⚠️ MONTADA UMA VEZ, NO `setup()`. `criarFalaDoRoqueOS` liga a `ia` do host
  // (antes, a store do RoqueOS), e já confere se há modelo A CADA FALA por dentro.
  const modeloDeFala = criarFalaDoRoqueOS(ctx.ia)
  /** Quantas falas foram pedidas: a última a chegar é a única que vale. */
  let pedidoDaFala = 0

  const comercio = criarComercioDaSessao({
    aberto: { get: () => aldeaoAberto.value, set: (v) => (aldeaoAberto.value = v) },
    revisao: { get: () => revisaoDoComercio.value, set: (v) => (revisaoDoComercio.value = v) },
    inventario: ctx.inventario,
    maquina: ctx.maquina,
    salvar: ctx.salvar,
    avisar: ctx.avisar,
    quando: ctx.quando || (() => 0),
  })

  const mobiliaAberta = computed(() => {
    revisaoMobilia.value // dependência explícita: ver o cabeçalho
    const a = aberto.value
    return a ? mobiliaEm(ctx.mobilia(), a.x, a.y, a.z) : null
  })

  // Os slots num array plano — a tela não conhece o formato interno de nenhuma.
  const conteudoAberto = computed(() => {
    revisaoMobilia.value
    const e = mobiliaAberta.value
    if (!e) return []
    if (e.tipo === 'bau') return e.slots
    // O suporte: ingrediente no índice 0, garrafas em 1..3.
    if (e.tipo === 'suporte') return [e.ingrediente, ...e.garrafas]
    return [e.entrada, e.combustivel, e.saida]
  })

  const fogoAberto = computed(() => (revisaoMobilia.value, fracaoDeFogo(mobiliaAberta.value)))

  // A MESMA barra serve às duas mobílias com relógio: fundida na fornalha,
  // fermentada no suporte. Duas props fariam a tela conhecer os dois formatos
  // para desenhar um retângulo.
  const progressoAberto = computed(() => {
    revisaoMobilia.value
    const e = mobiliaAberta.value
    return e?.tipo === 'suporte' ? fracaoDaFermentada(e) : fracaoDeFundicao(e)
  })

  const ofertasDoAldeao = computed(() => (revisaoDoComercio.value, comercio.ofertas()))

  /**
   * TUDO O QUE A TELA DO ALDEÃO PRECISA SABER, num objeto só.
   *
   * ⚠️ UM `computed`, E NÃO SEIS PROPS. `ROSRoqueCraft.vue` está a duas linhas
   * do teto da catraca de tamanho: cada prop nova ali é uma linha que precisa
   * sair de outro lugar. E o painel passa a ter UMA entrada, o que torna
   * possível testá-lo com um objeto literal.
   */
  const conversaDoAldeao = computed(() => {
    revisaoDoComercio.value
    const a = aldeaoAberto.value
    if (!a?.npc) return null
    return {
      nome: a.npc.nome,
      oficio: a.npc.profissao,
      amizade: a.npc.amizade,
      humor: humorDe(a.npc.amizade),
      texto: fala.value.texto,
      fonte: fala.value.fonte,
      pensando: fala.value.pensando,
      // O que está na mão AGORA: é o que o botão de presente vai entregar.
      presente: ctx.naMao ? ctx.naMao() : '',
      // ⚠️ VIAJA JUNTO, e não como prop separada, pelo mesmo motivo do resto:
      // `ROSRoqueCraft.vue` está no teto da catraca de tamanho, e uma prop nova
      // custa uma linha lá que teria de sair de outro lugar.
      modelo: !!modeloDeFala?.pronto?.(),
    }
  })

  /**
   * Pede uma fala. `pergunta` vazia é o botão; com texto, é a caixa.
   *
   * ⚠️ A FALA LOCAL APARECE ANTES DE O MODELO RESPONDER, e isso é de propósito:
   * o aldeão nunca fica mudo. Se o modelo vier, ele SUBSTITUI; se não vier, o
   * que está na tela já era a resposta certa.
   */
  async function conversar(assunto = 'saudacao', pergunta = '') {
    const a = aldeaoAberto.value
    if (!a?.npc) return
    const meu = ++pedidoDaFala
    fala.value = { texto: '', fonte: '', pensando: true }
    const r = await falaDoNpc({ npc: a.npc, assunto, pergunta, modelo: modeloDeFala })
    // ⚠️ SÓ A ÚLTIMA VALE. Sem esta linha, clicar duas vezes com o modelo lento
    // deixa a primeira resposta chegar DEPOIS da segunda e sobrescrevê-la — o
    // aldeão responde à pergunta anterior, e parece que ele não entendeu.
    if (meu !== pedidoDaFala || aldeaoAberto.value !== a) return
    fala.value = { texto: r.texto, fonte: r.fonte, pensando: false }
  }

  /**
   * A PORTA ÚNICA DO PAINEL DO ALDEÃO: trocar, falar, presentear.
   *
   * ⚠️ UMA PORTA, e não três eventos. Mesmo motivo do `computed` acima — cada
   * `@evento` no template do componente é uma linha, e ele não tem folga.
   */
  function acaoDoAldeao(tipo, arg) {
    if (tipo === 'trocar') {
      const ok = comercio.trocar(arg)
      // A amizade acabou de subir: a saudação velha na tela vira mentira.
      if (ok) fala.value = { texto: '', fonte: '', pensando: false }
      return ok
    }
    if (tipo === 'presentear') {
      if (!comercio.presentear(arg)) return ctx.avisar('roqueCraft.npc.semPresente')
      return conversar('saudacao')
    }
    if (tipo === 'perguntar') return conversar('livre', String(arg || ''))
    return conversar(tipo === 'oficio' ? 'oficio' : 'saudacao')
  }

  function fecharMobilia() {
    // O item na mão costuma ser DO BAÚ, e fechar apagava as 64 pedras: RC-01.
    const e = mobiliaAberta.value
    const r = devolverCursorAoFechar({
      inventario: ctx.inventario.get(),
      container: e?.tipo === 'bau' ? e.slots : [],
      cursor: ctx.cursor.get(),
    })
    const desfazer = fotoDoPrivado()
    ctx.inventario.set(r.inventario)
    ctx.cursor.set(r.cursor)
    if (e?.tipo === 'bau') for (let i = 0; i < r.container.length; i++) e.slots[i] = r.container[i]
    if (e?.tipo === 'bau' && r.container.length) avisarMudanca(desfazer)
    if (r.podeFechar) aberto.value = null
    ctx.salvar()
  }

  /**
   * O lado PRIVADO de um clique (cursor e inventário), para desfazer se a
   * sala recusar. O baú NÃO entra na foto: o que vale nele é o que a sala
   * responder, e isso chega pela assinatura.
   */
  function fotoDoPrivado() {
    const cursor = ctx.cursor.get()
    const inventario = ctx.inventario.get().map((s) => (s ? { ...s } : null))
    return () => {
      ctx.cursor.set(cursor ? { ...cursor } : null)
      ctx.inventario.set(inventario.map((s) => (s ? { ...s } : null)))
      avisarMobilia()
    }
  }

  const avisarMudanca = (desfazer = () => {}) => {
    const a = aberto.value
    if (a) ctx.mobiliaMudou?.(chaveDaMobilia(a.x, a.y, a.z), desfazer)
  }

  /** O tique da fornalha e do suporte. Na sala, o convidado só recebe o estado. */
  function tique(dt) {
    if (ctx.regeMobilia && !ctx.regeMobilia()) return
    if (avancarMobilia(ctx.mobilia(), dt, (k) => ctx.mobiliaQueimou?.(k)) && aberto.value)
      avisarMobilia()
  }

  /** A entrada no formato da sala/save, ou `null` se vazia ou inexistente. */
  const entradaDeMobilia = (k) => serializarEntrada(ctx.mobilia().get(k))

  /** A entrada pronta pra SAIR: sobe a versão e serializa, num passo só. */
  const entradaParaEnvio = (k) => {
    const e = ctx.mobilia().get(k)
    versionar(e)
    return serializarEntrada(e)
  }

  /** A sala mandou uma entrada (`null` = apagada). Redesenha se estiver aberta. */
  function aplicarMobilia(k, dado) {
    const e = desserializarEntrada(dado)
    if (e) ctx.mobilia().set(k, e)
    else ctx.mobilia().delete(k)
    avisarMobilia()
  }

  /**
   * O bloco foi quebrado: devolve o conteúdo (pra virar drop), fecha a tela
   * se era ele e avisa a sala. Conteúdo sumindo em silêncio é a pior coisa que
   * um jogo de construção faz com o tempo de alguém.
   */
  function quebrarMobilia(x, y, z) {
    const fora = esvaziarMobilia(ctx.mobilia(), x, y, z)
    const a = aberto.value
    if (a && a.x === x && a.y === y && a.z === z) aberto.value = null
    ctx.mobiliaMudou?.(chaveDaMobilia(x, y, z), () => {})
    return fora
  }

  /**
   * Clique num slot. A regra (empilhar, dividir, a saída que só entrega, o
   * shift do baú) mora em `cliqueNaMobilia`; aqui só a ligação com os refs.
   */
  function onContainerClick(index, button) {
    const desfazer = fotoDoPrivado()
    const r = cliqueNaMobilia(mobiliaAberta.value, {
      index,
      button,
      cursor: ctx.cursor.get(),
      inventario: ctx.inventario.get(),
    })
    if (!r) return
    ctx.cursor.set(r.cursor)
    if (r.mexeuNoInventario) ctx.inventario.set(ctx.inventario.get().slice())
    avisarMobilia()
    avisarMudanca(desfazer)
    ctx.salvar()
  }

  return {
    aberto,
    aldeaoAberto,
    revisaoMobilia,
    avisarMobilia,
    mobiliaAberta,
    conteudoAberto,
    fogoAberto,
    progressoAberto,
    fecharMobilia,
    quebrarMobilia,
    tique,
    entradaDeMobilia,
    entradaParaEnvio,
    aplicarMobilia,
    onContainerClick,
    comercio,
    ofertasDoAldeao,
    conversaDoAldeao,
    conversar,
    acaoDoAldeao,
    fecharComercio() {
      comercio.fechar()
      fala.value = { texto: '', fonte: '', pensando: false }
      ctx.prenderPonteiro()
    },
    /** Um passo do estoque dos aldeões vivos. */
    passoDoComercio: (mobs, dt) => comercio.passo(mobs, dt),
  }
}
