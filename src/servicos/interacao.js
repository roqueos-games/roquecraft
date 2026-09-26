//
// O CLIQUE DIREITO NUM BLOCO — a escada de decisão, inteira, num lugar.
//
// Irmã de `usarItemNaMao` em `usoDeFerramenta.js`: lá é "o que a mão faz quando
// não é bloco", aqui é "o que o BLOCO faz quando alguém clica nele". As duas
// moravam no componente e saíram pela mesma razão — a cada peça nova a escada
// crescia, e escada de decisão no componente é escada que ninguém testa.
//
// ⚠️ A ORDEM É A REGRA, e o último degrau é o que abre TELA. Bancada, cama,
// portão e alavanca respondem no mundo e devolvem o controle na hora; baú e
// fornalha tiram o cursor do jogo. Pôr o que abre tela antes faria uma alavanca
// em cima de um baú abrir o baú.
//
import { ID, blockDef, BLOCO_DO_ALCAPAO, VARIANTE_DE_ALCAPAO } from './blocks.js'
import { porOlho } from './portalDoFim.js'
import { virarPorta } from './porta.js'
import { alavancaTrocada } from './redstone.js'
import { toolOf } from './items.js'
import { planoDeEncanto, comEncanto } from './encantamento.js'

/**
 * Devolve `true` quando o clique foi tratado aqui.
 *
 * O contexto entra por injeção, um objeto só — é o que permite exercitar esta
 * escada com um mundo de mentira, sem three.js e sem montar o componente.
 */
export function interagirComBloco(hit, ctx) {
  if (!hit) return false
  const { x, y, z } = hit.hit
  const id = ctx.blocoEm(x, y, z)
  const def = blockDef(id)

  if (def?.interact === 'crafting') {
    ctx.abrirBancada()
    return true
  }
  if (def?.interact === 'sleep') return ctx.dormir(hit.hit)

  // O PORTÃO: clicar abre e fecha. É o que devolve ao jogador a passagem que a
  // cerca tirou — sem ele, cercar o rebanho é cercar a si mesmo.
  if (def?.interact === 'gate' && def.portao) {
    const chave = ctx.blocoDoPortao[def.key]
    const virada =
      ID[ctx.varianteDePortao[`${chave}|${def.portao.orient}|${def.portao.aberto ? 'f' : 'a'}`]]
    if (virada === undefined) return false
    ctx.editar(x, y, z, virada)
    ctx.tocar('wood')
    return true
  }

  // A MOLDURA DO PORTAL DO FIM: com o olho na mão, o olho entra; se era o
  // décimo segundo, o miolo vira portal (`portalDoFim.js`). Sem olho na mão
  // não faz nada — e devolve false, para o clique seguir a escada.
  if (def?.interact === 'endPortalFrame') {
    if (ctx.naMao?.()?.item !== 'ender_eye') return false
    const r = porOlho(ctx.blocoEm, x, y, z)
    if (!r) return false
    for (const c of r.edicoes) ctx.editar(c.x, c.y, c.z, c.id)
    ctx.consumir?.()
    ctx.tocar('stone')
    return true
  }

  // O ALÇAPÃO: clicar levanta e baixa a tampa. Uma célula só, sem metade.
  if (def?.interact === 'trapdoor' && def.alcapao) {
    const chave = BLOCO_DO_ALCAPAO[def.key]
    const virado =
      ID[VARIANTE_DE_ALCAPAO[`${chave}|${def.alcapao.orient}|${def.alcapao.aberto ? 'f' : 'a'}`]]
    if (virado === undefined) return false
    ctx.editar(x, y, z, virado)
    ctx.tocar('wood')
    return true
  }

  // A PORTA: clicar abre e fecha, e as duas metades viram juntas.
  if (def?.interact === 'door' && def.porta) {
    const escritas = virarPorta(id, x, y, z, ctx.blocoEm)
    if (!escritas.length) return false
    for (const e of escritas) ctx.editar(e.x, e.y, e.z, e.id)
    ctx.tocar('wood')
    return true
  }

  // A MESA DE ENCANTAMENTO: o único degrau que gasta XP.
  //
  // ⚠️ ELA NÃO ABRE TELA, e isso é decisão e não preguiça. Uma tela de mesa
  // pediria slot de item, slot de lápis-lazúli e três ofertas sorteadas com
  // semente presa ao bloco — e nada disso morde em lugar nenhum antes de a
  // terceira peça existir. O clique encanta o que está NA MÃO, cobra, e avisa.
  // O jogador vê o resultado onde ele importa: na ferramenta.
  //
  // A ordem aqui é: existe item? cabe encanto? tem nível? Só depois cobra. Ler
  // o bolso antes de saber o que vai comprar foi o erro da primeira versão da
  // fornalha, que gastava carvão pra descobrir que não tinha o que fundir.
  if (def?.interact === 'enchant') return encantarNaMao(ctx)

  // A ALAVANCA: o único gesto direto do jogador dentro de um circuito.
  const alavanca = alavancaTrocada(id)
  if (alavanca !== null) {
    ctx.editar(x, y, z, alavanca)
    ctx.tocar('stone')
    return true
  }

  // Baú e fornalha eram blocos INERTES: `interact: 'chest'` estava declarado e
  // ninguém lia, e `SMELTING` estava completo em `recipes.js` sem nenhuma tela
  // pra usá-lo. Metade da árvore de progressão dependia disto.
  const tipo = { chest: 'bau', furnace: 'fornalha', brew: 'suporte' }[def?.interact]
  if (!tipo) return false
  ctx.abrirMobilia(tipo, hit.hit)
  return true
}

/**
 * O clique na mesa, isolado porque é o único degrau com três saídas de aviso.
 *
 * Devolve sempre `true`: a mesa TRATOU o clique mesmo quando recusou. Devolver
 * `false` faria o clique cair para o degrau seguinte e o jogador colocaria um
 * bloco dentro da mesa ao tentar encantar sem nível — que é pior que o aviso.
 */
function encantarNaMao(ctx) {
  const s = ctx.naMao()
  const tipo = s ? toolOf(s.item)?.kind : null
  if (!tipo) {
    ctx.avisar('roqueCraft.encanto.semFerramenta')
    return true
  }
  const plano = planoDeEncanto({
    tipoDeFerramenta: tipo,
    encantos: s.enc,
    nivelDoJogador: ctx.nivelDoJogador(),
    sorteio: ctx.sorteio || Math.random,
  })
  if (!plano.ok) {
    ctx.avisar(
      plano.motivo === 'sem-nivel'
        ? 'roqueCraft.encanto.semNivel'
        : 'roqueCraft.encanto.nadaAEncantar',
    )
    return true
  }
  ctx.gastarNiveis(plano.custo)
  ctx.encantar(comEncanto(s.enc, plano.nome, plano.nivel))
  ctx.tocar('stone')
  // A chave é POR ENCANTO e não uma frase com o nome interpolado: em russo e em
  // árabe o número concorda com o substantivo, e "Eficiência {n} aplicada"
  // montada aqui obrigaria as dez traduções a caber na gramática do português.
  ctx.avisar(`roqueCraft.encanto.aplicado.${plano.nome}`, { nivel: plano.nivel })
  return true
}
