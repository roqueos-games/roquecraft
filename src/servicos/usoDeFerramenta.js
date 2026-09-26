// RoqueCraft - O CLIQUE DIREITO COM ITEM QUE NÃO É BLOCO.
//
// Balde e enxada são a mesma família de ação: o botão de colocar, com uma coisa
// na mão que não vira cubo. As duas moravam dentro do componente porque tocam
// no mundo, no inventário, no som e no save — e, por morarem lá, nenhuma das
// duas tinha teste do EFEITO. `balde.js` e `agricultura.js` testam a REGRA; o
// que ninguém cobria era "despejou no lugar certo", "gastou o balde", "arou e
// limpou o mato de cima".
//
// O contexto entra por injeção, um objeto só. Não é elegância: é o que permite
// a este arquivo ser exercitado com um mundo de mentira de dez linhas, sem
// three.js, sem Firebase e sem montar o componente de 2.500 linhas.

import { AIR, ID, blockDef, isReplaceable } from './blocks.js'
import { familyOf } from './audio.js'
import { oQueEnche, gastaBalde, ondeDespejar } from './balde.js'
import { ararComEnxada, plantar } from './agricultura.js'
import { acender } from './portal.js'
import { ehPocao, doseDe } from './fermentacao.js'

/**
 * O balde: encher numa fonte, despejar numa célula livre.
 *
 * Só FONTE enche. Encostar o balde numa lâmina que escorre não dá nada — no
 * original é assim, e o motivo é bom: se lâmina enchesse balde, um rio de sete
 * blocos viraria sete baldes e a água deixaria de ter custo.
 *
 * Despejar escreve a fonte por `editar` — ela é estado DURÁVEL, gravado no save
 * e publicado no multiplayer. É o oposto do fluxo, que não se grava porque se
 * recalcula. A fonte é a única gota que o mundo precisa lembrar.
 *
 * ⚠️ O `hit` vem da mira de LÍQUIDO, não da normal. A mira normal atravessa
 * líquido: com ela o balde jamais encheria, porque a fonte nunca é o alvo.
 */
export function usarBalde(def, hit, ctx) {
  if (!hit) return false
  const molhar = (x, y, z, id, chave) => {
    ctx.editar(x, y, z, id)
    if (gastaBalde(ctx.modo)) ctx.trocar(chave)
    ctx.tocar('stone')
    ctx.balancar()
    ctx.salvar()
    return true
  }

  if (def.balde.contem === null) {
    const { x, y, z } = hit.hit
    const cheio = oQueEnche(ctx.mundo.getBlock(x, y, z))
    if (!cheio) return false
    return molhar(x, y, z, AIR, cheio)
  }

  const alvo = hit.hit
  const { x, y, z } = ondeDespejar({
    alvo,
    destino: hit.place,
    ehLamina: !!ctx.mundo.liquidAt(alvo.x, alvo.y, alvo.z),
  })
  if (y < 0 || y >= ctx.alturaDoMundo) return false
  if (!isReplaceable(ctx.mundo.getBlock(x, y, z))) return false
  if (ctx.dentroDoJogador(x, y, z)) return false
  return molhar(x, y, z, ID[def.balde.contem], 'bucket')
}

/**
 * A ENXADA: transforma grama ou terra em solo arado.
 *
 * A regra (o que se ara, o que atrapalha por cima) mora em `agricultura.js`.
 * Aqui fica o acesso ao mundo e o efeito — a mesma divisão do balde.
 *
 * ⚠️ A CÉLULA É A DO ALVO, não a do `place`. Arar é mudar o bloco em que se
 * clicou, e não pôr peça nova na face de fora: usar `hit.place` faria a enxada
 * virar chão a célula de AR acima da grama, e o jogador veria o clique não
 * fazer nada.
 *
 * Gasta durabilidade no survival como qualquer outro uso de ferramenta. Sem
 * isso a enxada seria a única ferramenta eterna do jogo.
 */
export function usarEnxada(hit, ctx) {
  if (!hit) return false
  const { x, y, z } = hit.hit
  const plano = ararComEnxada(ctx.mundo.getBlock(x, y, z), ctx.mundo.getBlock(x, y + 1, z))
  if (!plano) return false

  if (plano.limpaAcima) ctx.editar(x, y + 1, z, AIR)
  ctx.editar(x, y, z, plano.solo)
  // O som é o da TERRA, e sai de `familyOf` em vez de uma string cravada: no
  // dia em que a lavoura ganhar família própria, ela muda num lugar só.
  ctx.tocar(familyOf(blockDef(plano.solo)?.key))
  ctx.balancar()
  if (ctx.modo === 'survival') {
    ctx.cansar()
    ctx.gastarFerramenta()
  }
  ctx.salvar()
  return true
}

/**
 * SEMEAR: a semente vai na célula ACIMA do solo arado em que se clicou.
 *
 * ⚠️ ACIMA DO ALVO, e não em `hit.place`. Clicar na face LATERAL de um canteiro
 * de borda tem que plantar em cima dele, como no original — com `place` a
 * semente iria parar flutuando ao lado, apoiada em nada, e morreria na visita
 * seguinte da fila. O jogador veria o item sumir sem entender.
 *
 * A regra de onde se pode plantar mora em `agricultura.js`; aqui fica o acesso
 * ao mundo e o gasto do item.
 */
export function plantarSemente(item, hit, ctx) {
  if (!hit) return false
  const { x, y, z } = hit.hit
  const broto = plantar(item, ctx.mundo.getBlock(x, y, z), ctx.mundo.getBlock(x, y + 1, z))
  if (broto === null) return false
  ctx.editar(x, y + 1, z, broto)
  ctx.tocar('grass')
  ctx.balancar()
  if (ctx.modo !== 'creative') ctx.consumir()
  ctx.salvar()
  return true
}

/**
 * O ISQUEIRO: acende o vão de uma moldura de obsidiana.
 *
 * ⚠️ A CÉLULA É O `place`, NÃO O ALVO. Clica-se NA obsidiana e o fogo pega no
 * vão ao lado dela — mirar a própria obsidiana e acender ali dentro não acende
 * nada, porque a célula não está vaga. Foi o primeiro jeito que eu tentei e o
 * clique simplesmente não fazia nada, sem erro nenhum: `acharMoldura` recusava
 * um ponto que não é vão, corretamente.
 *
 * Só gasta o isqueiro se ALGUMA célula mudou. Um portal já aceso devolve lista
 * vazia, e clicar nele de novo não pode comer durabilidade.
 */
export function usarIsqueiro(hit, ctx) {
  if (!hit) return false
  const { x, y, z } = hit.place
  const celulas = acender((a, b, c) => ctx.mundo.getBlock(a, b, c), x, y, z)
  if (!celulas.length) return false
  for (const c of celulas) ctx.editar(c.x, c.y, c.z, c.id)
  ctx.tocar('stone')
  ctx.balancar()
  if (ctx.modo === 'survival') ctx.gastarFerramenta()
  ctx.salvar()
  return true
}

/**
 * O QUE A MÃO FAZ QUANDO NÃO É BLOCO — a escada de decisão, inteira, num lugar.
 *
 * Devolve `true`/`false` quando o item foi tratado aqui, e `null` para "não é
 * caso meu, siga para colocar bloco". Os três valores são necessários: `false`
 * é "era balde e não deu", e virar `null` faria o balde tentar virar cubo.
 *
 * ⚠️ A ORDEM É A REGRA, E CADA DEGRAU CUSTOU UM DEFEITO:
 *
 *  · PLANTAR ANTES DE COMER. A cenoura é comida E semente; com comida na
 *    frente, clicar no canteiro COMIA a cenoura. E sem o `&&` que deixa cair
 *    para o degrau seguinte, uma cenoura que não pode ser plantada deixaria de
 *    ser comida.
 *  · BALDE, ENXADA E ISQUEIRO ANTES DE COLOCAR. Nenhum dos três é bloco: se
 *    chegassem ao `resolverColocacao` sairiam de lá como "não dá pra colocar",
 *    e o clique não faria nada.
 *
 * Isto morava no componente e veio para cá junto com o isqueiro, que seria o
 * quarto degrau da mesma escada — a regra do repo: extrair na rodada que passa
 * pelo trecho.
 */
export function usarItemNaMao(def, item, alvos, ctx) {
  if (def?.planta && plantarSemente(item, alvos.alvo, ctx)) return true
  if (def?.kind === 'food') {
    if (!ctx.comer(def)) return false
    ctx.consumir()
    ctx.salvar()
    return true
  }
  if (def?.balde) return usarBalde(def, alvos.liquido, ctx)
  if (item === 'glass_bottle') return encherGarrafa(alvos.liquido, ctx)
  if (ehPocao(item)) {
    // A ARREMESSÁVEL VOA em vez de descer: `ctx.pocaoNaMao` são os
    // modificadores da pilha na mão (`fermentacao.js`).
    const pocao = ctx.pocaoNaMao?.() ?? null
    return pocao?.splash ? arremessarPocao(item, pocao, ctx) : beberPocao(item, pocao, ctx)
  }
  if (def?.tool?.kind === 'hoe') return usarEnxada(alvos.alvo, ctx)
  if (def?.tool?.kind === 'igniter') return usarIsqueiro(alvos.alvo, ctx)
  // O ARCO: apertar arma; quem atira é o soltar do botão (`arco.js`, pela
  // entrada). Devolve `true` para o clique não cair na colocação de bloco.
  if (def?.tool?.kind === 'bow') return ctx.armarArco?.() ?? true
  // O OLHO DO FIM ao ar livre APONTA: rumo e distância da fortaleza, no aviso.
  // (Na moldura ele entra pelo clique no bloco — `interacao.js` vem antes.)
  if (item === 'ender_eye') {
    const onde = ctx.fortaleza?.()
    if (!onde) return false
    ctx.avisar?.('roqueCraft.fim.olhoAponta', {
      dist: onde.dist,
      rumo: ctx.rumo?.(onde.rumo) ?? onde.rumo,
    })
    return true
  }
  // O ESCUDO: apertar levanta a guarda; quem baixa é o soltar do botão
  // (`escudo.js`, pela entrada).
  if (def?.tool?.kind === 'shield') return ctx.levantarGuarda?.() ?? true
  return null
}

/**
 * ENCHER A GARRAFA NA ÁGUA. Mesma mira do balde (o alvo de líquido), e de
 * propósito: o jogador já aprendeu esse gesto com o balde, e um segundo gesto
 * para "pegar água" seria uma regra a mais para a mesma coisa.
 *
 * ⚠️ SÓ ÁGUA, e a garrafa NÃO consome o bloco. Encher um balde tira a água do
 * mundo porque o balde carrega um bloco inteiro; a garrafa tira um gole. Com a
 * água sumindo, encher três garrafas esvaziaria o lago de casa.
 */
export function encherGarrafa(hit, ctx) {
  if (!hit) return false
  const { x, y, z } = hit.hit
  if (ctx.mundo.getBlock(x, y, z) !== ID.water) return false
  ctx.trocar('water_bottle')
  ctx.tocar('stone')
  ctx.balancar()
  ctx.salvar()
  return true
}

/**
 * BEBER. A garrafa vira vidro vazio, sempre — inclusive quando a poção não faz
 * nada (a estranha). Sumir com a garrafa seria perder o vidro; não gastá-la
 * faria uma poção valer por infinitas.
 *
 * ⚠️ NO CRIATIVO TAMBÉM GASTA. A poção não é bloco: o item que ela vira (vidro)
 * é o que o jogador leva de volta ao suporte, e um criativo que não devolve o
 * vidro deixaria o suporte parecer quebrado justamente onde se testa.
 */
export function beberPocao(item, pocao, ctx) {
  const dose = doseDe(item, pocao)
  if (dose) ctx.tomarEfeito(dose.efeito, dose.nivel, dose.duracao || null)
  ctx.trocar('glass_bottle')
  ctx.tocar('stone')
  ctx.balancar()
  ctx.salvar()
  return true
}

/**
 * ARREMESSAR. O frasco sai pelo motor de entidades (`ctx.arremessar`) e a
 * garrafa some da mão — a arremessável não devolve vidro, como no original: o
 * vidro quebrou no chão. Sem o gancho não faz nada e devolve `false`, pra não
 * cair na colocação de bloco.
 */
export function arremessarPocao(item, pocao, ctx) {
  if (!ctx.arremessar?.(item, pocao)) return false
  ctx.consumir()
  ctx.balancar()
  ctx.salvar()
  return true
}
