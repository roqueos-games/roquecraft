// RoqueCraft — ITEM MORTO: o que existe no catálogo e o jogador nunca alcança.
//
// ⚠️ ESTE É O DEFEITO MAIS CARO DESTE JOGO, e ele já apareceu cinco vezes:
// a tinta de lula (RC-09), a semente de trigo, a fatia de melancia, a cana e a
// abóbora. Em todas, o item tinha chave, ícone, fome, receita, e NADA no mundo
// o produzia — sistemas escritos e mortos, verdes em todo teste de unidade,
// porque "a chave existe" sempre foi verdade.
//
// A conta é a mesma da sonda de jornada: fecho transitivo do que o mundo dropa
// mais tudo que receita e fundição produzem a partir disso. O que ficar de fora
// é item que o jogador só vê no criativo.
//
//   node qa/qa-roquecraft-itens-mortos.mjs
//
// Sai 0 quando todo item alcançável — ou explicitamente dispensado — fecha.
//
// Os imports eram `src/services/roquecraft/...`, o caminho do motor no RoqueOS,
// que o Vite de lá resolvia pelo alias `src`. Aqui o motor é `src/servicos/`, e o
// import é relativo a esta pasta (v0.1.1).
//
// ⚠️ E ELA TINHA FICADO PARA TRÁS DO PORTÃO. Com o import consertado ela voltou a
// rodar e acusou três itens (`ender_pearl`, `ender_eye`, `endPortalFrame`) que o
// `test/arquitetura/itens-mortos.spec.js` aceita. Os dois mudaram juntos no Fim
// (Goal 21, Onda 5.1, 18/09/2026, `1a34d593` no RoqueOS): o portão ganhou a
// quarta máquina (o aldeão vende a pérola) e a dispensa da moldura do portal; a
// sonda não, e a varredura que a registrou verde é de antes disso. As duas
// peças abaixo são as do portão, com o mesmo texto, para a conta voltar a ser a
// mesma.
import { BLOCKS } from '../src/servicos/blocks.js'
import { ITEMS } from '../src/servicos/items.js'
import { RECIPES, SMELTING } from '../src/servicos/recipes.js'
import { MOB_TYPES } from '../src/servicos/mobs.js'
import { AGUA, FERMENTACOES } from '../src/servicos/fermentacao.js'
import { PROFISSOES } from '../src/servicos/comercio.js'

const defs = Object.values(BLOCKS)

/**
 * ITENS DISPENSADOS, com o motivo escrito.
 *
 * Dispensar é decisão, não esquecimento: o que entra aqui tem que ter uma razão
 * que sobrevive à pergunta "então por que ele existe?". A lista é curta de
 * propósito — quando ela cresce, é sinal de que o catálogo está inchando com
 * coisa que ninguém vai usar.
 */
const DISPENSADOS = {
  // ── O que o jogador pega SEM receita, e a conta não modela ──────────────
  //
  // O balde cheio não vem de receita: vem de encostar o balde vazio na água.
  // `balde.js` é quem faz a troca, e ela não é uma aresta do grafo de crafting.
  water_bucket: 'sai de usar o balde na água, não de receita',
  lava_bucket: 'sai de usar o balde na lava, não de receita',

  // ── O bloco que só se pega com TOQUE SUAVE, que este jogo não tem ───────
  //
  // Minério quebrado dá o minério beneficiado (carvão, ferro cru), nunca o
  // bloco. É o comportamento do original sem encantamento, e é deliberado: ter
  // o bloco de minério no inventário só serviria para decorar.
  coalOre: 'sem toque suave: dá carvão',
  ironOre: 'sem toque suave: dá ferro cru',
  copperOre: 'sem toque suave: dá cobre cru',
  goldOre: 'sem toque suave: dá ouro cru',
  diamondOre: 'sem toque suave: dá diamante',
  emeraldOre: 'sem toque suave: dá esmeralda',
  redstoneOre: 'sem toque suave: dá redstone',
  clay: 'sem toque suave: dá bola de argila (e ela volta a virar bloco no forno)',
  deepslate: 'sem toque suave: dá pedregulho, como a pedra',
  grassBlock: 'sem toque suave: dá terra, como no original',
  podzol: 'sem toque suave: dá terra',
  snowLayer: 'sem toque suave: dá bola de neve',
  deadBush: 'arbusto seco não dá nada mesmo com tesoura, como no original',

  // ── Fluido e fundo do mundo ────────────────────────────────────────────
  bedrock: 'não se pega: é o piso do mundo',
  water: 'líquido: pega-se com balde',
  lava: 'líquido: pega-se com balde',
  endPortalFrame: 'inquebrável: a fortaleza a produz; o item existe só no criativo',
}

const ingredientesDe = (r) =>
  r.type === 'shaped' ? [...new Set(Object.values(r.keyMap))] : [...new Set(r.items)]

function doMundo() {
  const base = new Set()
  for (const b of defs) {
    // ⚠️ INQUEBRÁVEL E LÍQUIDO NÃO DROPAM NADA, e a primeira versão desta
    // sonda dizia que sim: ela usava `b.drops ?? b.key`, e como bedrock e água
    // não declaram `drops`, os dois "caíam neles mesmos". O resultado era a
    // lista de dispensados acusando três itens à toa — falso vermelho na
    // própria ferramenta de achar falso verde.
    if (b.unbreakable || b.liquid) continue
    if (b.drops !== null) base.add(b.drops ?? b.key)
    // A tesoura é alcançável (dois lingotes de ferro), então o que ela derruba
    // conta: é assim que folha e mato entram no inventário sem virar drop de
    // mão. O bônus raro também conta — maçã e pederneira existem por ele.
    if (b.comTesoura) base.add(b.comTesoura)
    if (b.dropExtra?.item) base.add(b.dropExtra.item)
  }
  // ⚠️ O QUE O BICHO DERRUBA VEM DE `mobs.js`, não de uma lista escrita aqui.
  // A primeira versão tinha doze nomes de cor: quando a aranha passou a dropar
  // o olho (onda 5), a sonda continuou com a lista velha e acusou DOZE itens
  // mortos — o olho, o olho fermentado e as oito poções que nascem dele — num
  // jogo em que tudo isso está ao alcance. Falso vermelho na ferramenta de
  // achar falso verde, de novo, e pelo mesmo motivo: dado copiado envelhece.
  for (const def of Object.values(MOB_TYPES)) {
    for (const d of def.drops ?? []) if (ITEMS[d.item]) base.add(d.item)
  }
  // A garrafa d'água sai de encostar a garrafa vazia na água
  // (`usoDeFerramenta.encherGarrafa`), como o balde — não é aresta de receita.
  if (ITEMS[AGUA] && ITEMS.glass_bottle) base.add(AGUA)
  return base
}

function alcancaveis() {
  const tem = doMundo()
  const fundicao = Object.entries(SMELTING || {})
  let cresceu = true
  while (cresceu) {
    cresceu = false
    for (const r of RECIPES) {
      if (tem.has(r.result)) continue
      if (ingredientesDe(r).every((i) => tem.has(i))) {
        tem.add(r.result)
        cresceu = true
      }
    }
    for (const [entrada, saida] of fundicao) {
      const res = typeof saida === 'string' ? saida : saida?.result || saida?.out
      if (!res || tem.has(res)) continue
      if (tem.has(entrada)) {
        tem.add(res)
        cresceu = true
      }
    }
    // O suporte de poções é a terceira máquina do jogo: garrafa + ingrediente
    // → poção. `FERMENTACOES` é a tabela dele, lida de onde o jogo a lê.
    for (const [garrafa, ingrediente, resultado] of FERMENTACOES) {
      if (tem.has(resultado)) continue
      if (tem.has(garrafa) && tem.has(ingrediente)) {
        tem.add(resultado)
        cresceu = true
      }
    }
    // O comércio é a quarta máquina: o aldeão vende o que o jogador não fabrica
    // (a pérola do Fim é o caso). Uma oferta conta quando tudo que ela cobra é
    // alcançável — a esmeralda vem do minério. A mesma conta do portão.
    for (const prof of Object.values(PROFISSOES)) {
      for (const o of prof.ofertas) {
        if (tem.has(o.recebe.item)) continue
        if (o.paga.every((p) => tem.has(p.item))) {
          tem.add(o.recebe.item)
          cresceu = true
        }
      }
    }
  }
  return tem
}

const ALCANCE = alcancaveis()
const mortos = Object.values(ITEMS)
  .map((i) => i.key)
  .filter((k) => !ALCANCE.has(k) && !DISPENSADOS[k])
  .sort()

// E o contrário: item dispensado que PASSOU a ser alcançável. A lista tem que
// encolher quando o jogo cresce, senão vira desculpa acumulada.
const dispensadosAtoa = Object.keys(DISPENSADOS).filter((k) => ALCANCE.has(k))

console.log('')
console.log(
  `item morto — ${ALCANCE.size} itens ao alcance, ${Object.keys(ITEMS).length} no catálogo`,
)
console.log('')
if (mortos.length) {
  console.log(`  ${mortos.length} item(ns) que o jogador NUNCA alcança:`)
  for (const k of mortos) console.log(`    ✗ ${k}`)
} else {
  console.log('  nenhum item morto: tudo que está no catálogo, o jogador alcança')
}
if (dispensadosAtoa.length) {
  console.log('')
  console.log('  dispensados à toa (já são alcançáveis, tire da lista):')
  for (const k of dispensadosAtoa) console.log(`    · ${k}`)
}
console.log('')

process.exit(mortos.length || dispensadosAtoa.length ? 1 : 0)
