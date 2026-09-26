//
// COMÉRCIO — a esmeralda ganha o que fazer.
//
// ⚠️ TERCEIRA VEZ QUE ESTE JOGO TEM UM RECURSO QUE NÃO PAGA, e a terceira com a
// mesma forma. Medido em 13/09, no catálogo: `emerald` aparece em ZERO receitas
// e em ZERO fundições. O jogador acha o minério mais raro do mundo, quebra,
// guarda a pedra verde no bolso — e ela não compra nada. É a barra de XP antes
// da mesa de encantamento e a poção antes do suporte, uma terceira vez.
//
// O aldeão é o consumidor. Ele COMPRA o que o jogador produz (pagando em
// esmeralda) e VENDE o que ele não consegue fazer (cobrando em esmeralda), e
// esses dois lados juntos são o que transforma lavoura e mina em economia.
//
// ⚠️ ESTE MÓDULO NÃO CONHECE MOB, MUNDO NEM TELA. Ele sabe que profissão tem que
// oferta, o que uma oferta custa, e o que sobra do inventário depois. Quem
// segura o aldeão é `mobs.js`; quem desenha é o componente.

/**
 * ⚠️ A ESMERALDA É A MOEDA DOS DOIS LADOS, e isso não é enfeite: com o aldeão
 * comprando por esmeralda e vendendo por esmeralda, o jogador que só planta
 * consegue comprar ferro, e o que só minera consegue comprar pão. Uma troca
 * direta item-por-item faria cada profissão ser um beco.
 */
import { precoCom, registrar } from './npc.js'

export const MOEDA = 'emerald'

/**
 * As quatro profissões, e cada uma existe por uma ponta solta do jogo:
 *
 *  · fazendeiro — a lavoura produz mais do que o jogador come. Sem quem compre,
 *    o excedente é lixo, e plantar para de crescer depois do primeiro campo.
 *  · ferreiro   — ferro e diamante são da mina. Quem joga em cima da terra
 *    (lavoura, rebanho) não tinha caminho nenhum até ferramenta boa.
 *  · bibliotecário — papel e livro dependem de cana e de couro, e a estante
 *    custa três livros. É a profissão que abre a mesa de encantamento.
 *  · clérigo   — verruga e olho de aranha vêm do Nether e da noite. Ele é a
 *    saída de emergência da fermentação para quem ainda não foi ao Nether.
 *
 * `paga` é o que o JOGADOR entrega; `recebe` é o que ele leva.
 */
export const PROFISSOES = {
  fazendeiro: {
    ofertas: [
      { paga: [{ item: 'wheat', count: 18 }], recebe: { item: MOEDA, count: 1 }, usos: 12 },
      { paga: [{ item: 'carrot', count: 20 }], recebe: { item: MOEDA, count: 1 }, usos: 12 },
      { paga: [{ item: 'potato', count: 24 }], recebe: { item: MOEDA, count: 1 }, usos: 12 },
      { paga: [{ item: MOEDA, count: 1 }], recebe: { item: 'bread', count: 6 }, usos: 12 },
      { paga: [{ item: MOEDA, count: 1 }], recebe: { item: 'cooked_beef', count: 4 }, usos: 8 },
    ],
  },
  ferreiro: {
    ofertas: [
      { paga: [{ item: 'coal', count: 15 }], recebe: { item: MOEDA, count: 1 }, usos: 12 },
      { paga: [{ item: 'raw_iron', count: 9 }], recebe: { item: MOEDA, count: 1 }, usos: 12 },
      { paga: [{ item: MOEDA, count: 4 }], recebe: { item: 'iron_ingot', count: 3 }, usos: 8 },
      { paga: [{ item: MOEDA, count: 8 }], recebe: { item: 'iron_pickaxe', count: 1 }, usos: 4 },
      { paga: [{ item: MOEDA, count: 12 }], recebe: { item: 'diamond', count: 1 }, usos: 3 },
    ],
  },
  bibliotecario: {
    ofertas: [
      { paga: [{ item: 'paper', count: 24 }], recebe: { item: MOEDA, count: 1 }, usos: 12 },
      { paga: [{ item: MOEDA, count: 1 }], recebe: { item: 'book', count: 1 }, usos: 12 },
      { paga: [{ item: MOEDA, count: 5 }], recebe: { item: 'bookshelf', count: 1 }, usos: 6 },
      { paga: [{ item: MOEDA, count: 9 }], recebe: { item: 'enchantingTable', count: 1 }, usos: 2 },
    ],
  },
  clerigo: {
    ofertas: [
      { paga: [{ item: 'redstone', count: 18 }], recebe: { item: MOEDA, count: 1 }, usos: 12 },
      { paga: [{ item: 'spider_eye', count: 8 }], recebe: { item: MOEDA, count: 1 }, usos: 12 },
      { paga: [{ item: MOEDA, count: 3 }], recebe: { item: 'nether_wart', count: 4 }, usos: 6 },
      // A pérola do Fim: não há enderman aqui, e o clérigo é quem vende o que
      // vem de longe — é o mesmo papel dele no original. Cara de propósito: doze
      // olhos custam sessenta esmeraldas, e é isso que faz o Fim ser o fim.
      { paga: [{ item: MOEDA, count: 5 }], recebe: { item: 'ender_pearl', count: 1 }, usos: 4 },
      { paga: [{ item: MOEDA, count: 2 }], recebe: { item: 'glass_bottle', count: 3 }, usos: 8 },
      { paga: [{ item: MOEDA, count: 4 }], recebe: { item: 'brewingStand', count: 1 }, usos: 2 },
    ],
  },
}

export const NOMES_DE_PROFISSAO = Object.keys(PROFISSOES)

/** Quantas ofertas um aldeão mostra. Menos que o total: cada um é diferente. */
export const OFERTAS_POR_ALDEAO = 3

/**
 * ⚠️ AS OFERTAS SÃO SORTEADAS UMA VEZ E GUARDADAS NO ALDEÃO, nunca recalculadas
 * na hora de abrir a tela. Sorteio por abertura faria o jogador fechar e abrir
 * até cair a oferta que ele quer — o que não é comércio, é caça-níquel.
 *
 * O sorteio é injetado para que o teste (e o save) sejam determinísticos.
 */
export function sortearOfertas(profissao, sorteio = Math.random) {
  const def = PROFISSOES[profissao]
  if (!def) return []
  const pool = def.ofertas.map((o, i) => ({ o, i }))
  const fora = []
  while (fora.length < Math.min(OFERTAS_POR_ALDEAO, def.ofertas.length)) {
    const k = Math.min(pool.length - 1, Math.floor(sorteio() * pool.length))
    const [{ o }] = pool.splice(k, 1)
    fora.push({ ...o, paga: o.paga.map((p) => ({ ...p })), restam: o.usos })
  }
  // Ordem estável: quem vende esmeralda primeiro. Duas listas com as mesmas
  // ofertas em ordens diferentes fariam a tela dançar entre duas aberturas.
  return fora.sort((a, b) =>
    a.recebe.item === b.recebe.item ? 0 : a.recebe.item === MOEDA ? -1 : 1,
  )
}

/** Quanto deste item o inventário tem. Conta a pilha inteira, não o slot. */
export function quantoTem(inventario, item) {
  let n = 0
  for (const s of inventario || []) if (s?.item === item) n += s.count
  return n
}

/**
 * Dá para fechar esta troca? Devolve o MOTIVO quando não — "não tenho o que
 * pagar" e "a oferta acabou" são coisas diferentes, e o jogador precisa saber
 * qual das duas foi.
 */
/**
 * O QUE O JOGADOR PAGA DE FATO A ESTE ALDEÃO — a amizade entra aqui.
 *
 * ⚠️ UMA FUNÇÃO SÓ, E AS DUAS PONTAS A CHAMAM. Descontar na tela e cobrar cheio
 * no fechamento (ou o contrário) é o defeito clássico de preço com desconto: o
 * jogador vê 6 esmeraldas, clica, e some 8. Enquanto `motivoDeRecusa` e
 * `fecharTroca` lerem daqui, a conta é a MESMA por construção.
 *
 * ⚠️ E SÓ A MOEDA CAI. Amizade é desconto de COMPRA, não bônus de venda: mexer
 * no que o aldeão paga em esmeralda pelo trigo daria ao jogador uma bomba de
 * esmeralda — faz amizade, vende mais caro, compra mais barato — e a economia
 * de escassez que `PROFISSOES` equilibra iria junto.
 */
export function pagamentoDe(oferta, npc) {
  if (!oferta?.paga) return []
  if (!npc) return oferta.paga
  return oferta.paga.map((p) => (p.item === MOEDA ? { ...p, count: precoCom(npc, p.count) } : p))
}

export function motivoDeRecusa(oferta, inventario, espacoPara, npc = null) {
  if (!oferta) return 'sem-oferta'
  if (oferta.restam <= 0) return 'esgotada'
  for (const p of pagamentoDe(oferta, npc))
    if (quantoTem(inventario, p.item) < p.count) return 'sem-pagamento'
  // ⚠️ O ESPAÇO É CONFERIDO ANTES DE TIRAR O PAGAMENTO. Conferir depois foi
  // exatamente o RC-01 da bancada: os ingredientes sumiam e o resultado não
  // cabia. Aqui sumiria a esmeralda do jogador, que é pior.
  if (espacoPara && espacoPara(oferta.recebe.item) < oferta.recebe.count) return 'sem-espaco'
  return null
}

export const podeTrocar = (oferta, inventario, espacoPara) =>
  motivoDeRecusa(oferta, inventario, espacoPara) === null

/**
 * Fecha a troca. Devolve `{ ok, motivo }` e MUTA a oferta (`restam`) e o
 * inventário pelas funções injetadas — que são as mesmas que a bancada usa, e
 * não uma segunda cópia da conta de empilhar.
 *
 * @param remover `(inventario, item, count) => void`
 * @param adicionar `(inventario, item, count) => number` sobra
 */
export function fecharTroca(oferta, inventario, { remover, adicionar, espacoPara, npc = null }) {
  const motivo = motivoDeRecusa(oferta, inventario, espacoPara, npc)
  if (motivo) return { ok: false, motivo }
  // ⚠️ O MESMO ARRAY é usado para cobrar e para devolver. Recalcular o
  // pagamento na devolução leria a amizade DEPOIS do evento da troca e
  // devolveria um valor diferente do cobrado — trapaça a favor da casa.
  const pago = pagamentoDe(oferta, npc)
  for (const p of pago) remover(inventario, p.item, p.count)
  const sobrou = adicionar(inventario, oferta.recebe.item, oferta.recebe.count)
  // Não deveria acontecer (o espaço foi conferido), mas se acontecer o certo é
  // devolver o pagamento em vez de o jogador pagar por nada.
  if (sobrou > 0) {
    for (const p of pago) adicionar(inventario, p.item, p.count)
    return { ok: false, motivo: 'sem-espaco' }
  }
  oferta.restam -= 1
  return { ok: true, motivo: null }
}

/** Segundos até uma oferta esgotada voltar ao estoque. */
export const ESPERA_DO_REABASTECIMENTO = 120

/**
 * Reabastece o que esgotou. Devolve quantas ofertas voltaram.
 *
 * ⚠️ ESTOQUE QUE NUNCA VOLTA TRANSFORMA O ALDEÃO EM BAÚ DE USO ÚNICO, e o
 * jogador aprende a matá-lo em vez de manter uma aldeia viva. Estoque INFINITO
 * apaga a escassez e a esmeralda deixa de valer alguma coisa. O meio é o do
 * jogo de referência: volta sozinho, devagar.
 */
export function reabastecer(aldeao, dt) {
  if (!aldeao?.ofertas?.length) return 0
  const esgotadas = aldeao.ofertas.filter((o) => o.restam <= 0)
  if (!esgotadas.length) {
    aldeao.relogioDeEstoque = 0
    return 0
  }
  aldeao.relogioDeEstoque = (aldeao.relogioDeEstoque || 0) + dt
  if (aldeao.relogioDeEstoque < ESPERA_DO_REABASTECIMENTO) return 0
  aldeao.relogioDeEstoque = 0
  for (const o of esgotadas) o.restam = o.usos
  return esgotadas.length
}

// ── Save ───────────────────────────────────────────────────────────────────
// Só `restam` viaja: profissão e sorteio reconstroem o resto. Gravar as ofertas
// inteiras custaria cinco objetos por aldeão num save que já tem teto.

export const ofertasParaSave = (ofertas) =>
  Array.isArray(ofertas) && ofertas.length ? ofertas.map((o) => o.restam | 0) : null

/**
 * Reconstrói as ofertas do aldeão a partir da profissão e do sorteio dele, e
 * aplica o que restava de estoque.
 */
export function ofertasDoSave(profissao, sorteio, restantes) {
  const ofertas = sortearOfertas(profissao, sorteio)
  if (!Array.isArray(restantes)) return ofertas
  for (let i = 0; i < ofertas.length; i++) {
    const r = restantes[i]
    if (Number.isFinite(r)) ofertas[i].restam = Math.max(0, Math.min(ofertas[i].usos, r | 0))
  }
  return ofertas
}

/**
 * A COLA DO COMÉRCIO COM OS REFS, irmã de `criarMaoDaBancada`.
 *
 * Mesma razão de existir: a forma "chama a regra, e se ela disse ok escreve no
 * ref e agenda o save" repetida é onde um `if` se perde. Aqui ela aparece uma
 * vez só, e o componente fica com três linhas.
 *
 * As contas de empilhar entram por injeção — são as MESMAS de `inventory.js`
 * que a bancada e a mobília usam, e não uma terceira cópia.
 */
export function criarMaoDoComercio({
  inventario,
  aldeao,
  maquina,
  salvar,
  avisar,
  quando = () => 0,
}) {
  return {
    /** As ofertas do aldeão aberto, com o que se pode fechar agora. */
    ofertas() {
      const a = aldeao.get()
      if (!a?.ofertas) return []
      const inv = inventario.get()
      return a.ofertas.map((o, i) => ({
        indice: i,
        // O preço JÁ COM A AMIZADE: a tela nunca mostra um número que o
        // fechamento não vai honrar. Ver `pagamentoDe`.
        paga: pagamentoDe(o, a.npc),
        cheio: o.paga,
        recebe: o.recebe,
        restam: o.restam,
        usos: o.usos,
        motivo: motivoDeRecusa(o, inv, (item) => maquina.espacoPara(inv, item), a.npc),
      }))
    },

    /** Fecha a troca de índice `i`. Devolve `true` quando fechou. */
    trocar(i) {
      const a = aldeao.get()
      const o = a?.ofertas?.[i]
      const inv = inventario.get()
      const r = fecharTroca(o, inv, {
        remover: maquina.remover,
        adicionar: maquina.adicionar,
        espacoPara: (item) => maquina.espacoPara(inv, item),
        npc: a?.npc || null,
      })
      if (!r.ok) {
        avisar(`roqueCraft.comercio.${r.motivo}`)
        return false
      }
      // ⚠️ A AMIZADE SÓ SOBE POR TROCA FECHADA — evento do jogo, nunca da
      // conversa. É a regra que `npc.js` inteiro existe para proteger: uma
      // amizade que o modelo pudesse mover seria uma amizade que o jogador
      // negocia com o modelo, e o desconto viria de prompt em vez de comércio.
      if (a?.npc) a.npc = registrar(a.npc, 'trocou', quando())
      // ⚠️ A TROCA DE REFERÊNCIA É O QUE A TELA VÊ. `remover` e `adicionar`
      // mutam o array; sem esta linha o inventário muda e nada redesenha — o
      // mesmo defeito que a mobília teve antes de `avisarMobilia` existir.
      inventario.set(inv.slice())
      salvar()
      return true
    },
  }
}

/**
 * A SESSÃO DE COMÉRCIO: com quem se negocia, o que ele oferece, e o clique.
 *
 * ⚠️ É SERVIÇO E NÃO COMPOSABLE, pelo critério que já está escrito em
 * `useRoqueCraftPersistencia`: não guarda ciclo de vida. Não há timer, nem
 * assinatura, nem nada para cancelar quando a janela fecha — só um `ref` de
 * quem está aberto e a cola com o inventário. `ref` é estado, não ciclo.
 *
 * Os `ref` entram por injeção (o componente é dono deles) e o Vue não é
 * importado aqui, que é o que deixa isto exercitável sem montar o jogo.
 */
export function criarComercioDaSessao({
  aberto,
  revisao,
  inventario,
  maquina,
  salvar,
  avisar,
  quando = () => 0,
}) {
  const mao = criarMaoDoComercio({
    inventario,
    aldeao: { get: () => aberto.get() },
    maquina,
    salvar,
    avisar,
    quando,
  })
  const redesenhar = () => revisao.set((revisao.get() + 1) % 1e6)
  return {
    /** O aldeão clicado vira o aldeão aberto. `false` quando não comercia. */
    abrirCom(mob, comercia) {
      if (!comercia) return false
      aberto.set(mob)
      return true
    },
    /** Quem está aberto — a conversa precisa dele, e não deve cavar no ref. */
    aldeao: () => aberto.get(),
    /**
     * PRESENTEAR: tira um do que está na mão e sobe a amizade.
     *
     * ⚠️ MORA NO COMÉRCIO, e não na conversa, porque MEXE NO INVENTÁRIO — e
     * inventário é economia. Um presente que não custa item é um botão de subir
     * amizade de graça, e aí o desconto de 25% sai em vinte cliques.
     */
    presentear(item) {
      const a = aberto.get()
      if (!a?.npc || !item) return false
      const inv = inventario.get()
      if (quantoTem(inv, item) < 1) return false
      maquina.remover(inv, item, 1)
      inventario.set(inv.slice())
      a.npc = registrar(a.npc, 'presenteou', quando())
      salvar()
      redesenhar()
      return true
    },
    fechar: () => aberto.set(null),
    ofertas: () => mao.ofertas(),
    trocar(i) {
      const ok = mao.trocar(i)
      redesenhar()
      return ok
    },
    /**
     * Um passo do estoque de TODOS os aldeões vivos. Devolve `true` se a tela
     * aberta precisa redesenhar — quem chama não precisa saber comparar mobs.
     */
    passo(mobs, dt) {
      let mexeu = false
      for (const m of mobs) {
        if (m.ofertas && reabastecer(m, dt) && m === aberto.get()) mexeu = true
      }
      if (mexeu) redesenhar()
      return mexeu
    },
  }
}
