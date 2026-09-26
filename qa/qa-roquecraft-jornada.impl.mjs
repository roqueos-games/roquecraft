// RoqueCraft — A JORNADA DA SOBREVIVÊNCIA: o que o jogador ALCANÇA.
//
// ⚠️ ESTA SONDA NASCEU VERMELHA, DE PROPÓSITO (Goal onda 3, 13/09/2026).
//
// Escrita ANTES da agricultura existir, e o que ela acusa é o que a onda 3 veio
// construir. Sonda escrita depois da funcionalidade nasce verde e nunca provou
// nada — ninguém viu ela reprovar, e "check que nunca reprovou não é check".
//
// ⚠️ ELA MEDE ALCANCE, NÃO EXISTÊNCIA DE CHAVE. A primeira versão perguntava
// "ITEMS.wheat existe?" e passava — porque o item EXISTE. Existem também a
// receita de pão (`WWW` de trigo) e a reprodução das quatro espécies, que
// `pecuaria.js` declara com `ITEM_DE_AMOR = { cow: 'wheat', ... }`. Três
// sistemas escritos e MORTOS, porque nada no mundo produz trigo. Perguntar "a
// chave existe?" dava verde num jogo onde o jogador não chega lá.
//
// A pergunta certa: partindo de um mundo novo e de mãos vazias, o jogador
// CHEGA neste item? O fecho é transitivo — o que cai de bloco, mais tudo que
// receita e forno fazem a partir disso, repetido até parar de crescer.
//
// O QUE ELA NÃO FAZ: `ganchoDeQA`. Nada de `give`, nada de inventário semeado.
// O gancho de E2E existe para testar UI, não para fingir progressão.
//
//   node scripts/qa-roquecraft-jornada.mjs
//
// Sai 0 quando a corrente inteira fecha. Sai 1 com a lista do que falta.
// BLOCKS é indexado por ID; BLOCK_BY_KEY é o que responde por nome. A primeira
// versão usou BLOCKS para as duas coisas e acusou `oakSapling` de não existir —
// um falso vermelho, que é tão ruim quanto um falso verde: manda procurar
// defeito onde não tem.
import { BLOCKS, BLOCK_BY_KEY } from 'src/services/roquecraft/blocks.js'
import { ITEMS } from 'src/services/roquecraft/items.js'
import { RECIPES, SMELTING } from 'src/services/roquecraft/recipes.js'
import { ITEM_DE_AMOR } from 'src/services/roquecraft/pecuaria.js'
import { createSurvivalState, eat, MAX_HUNGER } from 'src/services/roquecraft/survival.js'

const defs = Object.values(BLOCKS)

/**
 * O que o mundo entrega de graça: todo bloco que a geração coloca e que devolve
 * alguma coisa ao ser quebrado. `drops: null` não devolve nada; sem `drops`, o
 * bloco cai nele mesmo.
 */
function doMundo() {
  const base = new Set()
  for (const b of defs) {
    if (b.drops === null) continue
    base.add(b.drops ?? b.key)
  }
  // Criatura não é bloco, e a carne é a comida que o jogo já dá hoje: sem ela a
  // conta fingiria que o jogador começa com menos do que começa.
  for (const m of [
    'raw_beef',
    'raw_porkchop',
    'raw_chicken',
    'raw_fish',
    'leather',
    'feather',
    'wool',
  ])
    if (ITEMS[m]) base.add(m)
  return base
}

const ingredientesDe = (r) =>
  r.type === 'shaped' ? [...new Set(Object.values(r.keyMap))] : [...new Set(r.items)]

/** Fecho transitivo: o que se alcança partindo do mundo, por receita e forno. */
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
  }
  return tem
}

const ALCANCE = alcancaveis()
const alcanca = (k) => ALCANCE.has(k)
const existeBloco = (k) => Object.hasOwn(BLOCK_BY_KEY, k)
const receitaDe = (res) => RECIPES.find((r) => r.result === res)

/** Diz o que falta nomeando a peça — "não implementado" não ajuda ninguém. */
const elos = [
  {
    nome: 'madeira → tábua → bancada',
    falta: () => (alcanca('craftingTable') ? null : 'bancada inalcançável a partir do mundo'),
  },
  {
    nome: 'enxada na mão',
    falta: () => {
      const tipos = ['wood_hoe', 'stone_hoe', 'iron_hoe', 'diamond_hoe']
      if (!tipos.some((t) => ITEMS[t])) return `item ${tipos.join('/')}`
      return tipos.some((t) => alcanca(t))
        ? null
        : 'nenhuma enxada é craftável (receita faltando ou ingrediente fora do alcance)'
    },
  },
  {
    nome: 'solo arado',
    falta: () => (existeBloco('farmland') ? null : 'bloco farmland'),
  },
  {
    nome: 'semente que o mundo entrega',
    falta: () => {
      if (!ITEMS.wheat_seeds) return 'item wheat_seeds'
      const fonte = defs.find((b) => b.drops === 'wheat_seeds')
      if (!fonte) return 'nenhum bloco dropa wheat_seeds: o ciclo não tem começo'
      return alcanca('wheat_seeds') ? null : `wheat_seeds só cai de ${fonte.key}, fora do alcance`
    },
  },
  {
    nome: 'plantação de trigo',
    // ⚠️ A PERGUNTA É PELOS ESTÁGIOS, não por um bloco `wheat`. A sonda nasceu
    // cobrando a chave `wheat` porque na hora de escrevê-la ninguém sabia como
    // o estágio seria representado; ele virou UM ID POR ESTÁGIO (`wheat0` a
    // `wheat7`), e a pergunta velha continuaria vermelha com a lavoura inteira
    // funcionando. Cobrar o broto E a espiga é o que prova que a escada existe
    // dos dois lados: só o broto seria uma planta que nunca dá nada.
    falta: () => {
      const estagios = defs.filter((b) => b.cultivo?.tipo === 'wheat')
      if (estagios.length < 2) return 'os estágios de crescimento do trigo'
      if (!estagios.some((b) => b.cultivo.estagio === 0)) return 'o broto (estágio 0)'
      if (!estagios.some((b) => b.drops === 'wheat'))
        return 'o estágio maduro, que é o que dá trigo'
      return null
    },
  },
  {
    nome: 'TRIGO alcançável',
    falta: () => {
      if (!ITEMS.wheat) return 'item wheat'
      return alcanca('wheat')
        ? null
        : 'o item wheat EXISTE e nada no mundo o produz — é dele que dependem o pão e a reprodução'
    },
  },
  {
    nome: 'pão na mão',
    falta: () => {
      if (!ITEMS.bread) return 'item bread'
      const r = receitaDe('bread')
      if (!r) return 'receita de bread'
      if (!ingredientesDe(r).includes('wheat'))
        return 'a receita de bread não usa wheat: comida não renovável'
      return alcanca('bread')
        ? null
        : 'a receita de pão existe e é inalcançável: falta a fonte de wheat'
    },
  },
  {
    nome: 'o pão repõe fome de verdade',
    falta: () => {
      if (!ITEMS.bread) return 'item bread'
      const s = createSurvivalState()
      s.hunger = 4
      eat(s, ITEMS.bread)
      if (s.hunger <= 4) return 'comer pão não repõe fome'
      if (s.hunger > MAX_HUNGER) return 'comer pão passa do teto de fome'
      return null
    },
  },
  {
    nome: 'reprodução: carne renovável',
    falta: () => {
      const especies = Object.entries(ITEM_DE_AMOR).filter(([, i]) => i === 'wheat')
      if (!especies.length) return 'nenhuma espécie come wheat (ITEM_DE_AMOR mudou?)'
      return alcanca('wheat')
        ? null
        : `${especies.length} espécies (${especies.map(([e]) => e).join(', ')}) esperam wheat e não se reproduzem sem`
    },
  },
  {
    nome: 'árvore renovável',
    falta: () => {
      if (!existeBloco('oakSapling')) return 'bloco oakSapling'
      if (!globalThis.__rcCresce()) return 'muda não cresce: madeira continua finita no mapa'
      return null
    },
  },
  {
    nome: 'comida sem forno (raízes)',
    falta: () => {
      const raizes = ['carrot', 'potato'].filter((r) => ITEMS[r])
      if (!raizes.length) return 'item carrot/potato'
      return raizes.some((r) => alcanca(r)) ? null : 'raízes existem e são inalcançáveis'
    },
  },
]

// ⚠️ ESTA PONTE APONTAVA PARA UM MÓDULO QUE NUNCA EXISTIU.
//
// A sonda nasceu antes da implementação e chutou o endereço: `plantio.js`, com
// uma lista `CRESCEM`. O crescimento acabou em `agricultura.js`, com
// `mudaVaiCrescer` — e o `catch` silencioso mantinha o elo VERMELHO com a muda
// funcionando no jogo (medido em `qa-roquecraft-muda.mjs`: virou `oakLog` com
// 30 folhas). Endereço chutado dentro de um try/catch é um teste que nunca
// pode ficar verde.
//
// A pergunta certa é sobre a REGRA, e ela é exercitada de verdade: uma muda em
// terra, com luz e céu, com o sorteio favorável, tem que virar árvore.
try {
  const m = await import('src/services/roquecraft/agricultura.js')
  globalThis.__rcCresce = () =>
    typeof m.mudaVaiCrescer === 'function' &&
    m.mudaVaiCrescer({
      idCelula: BLOCK_BY_KEY.oakSapling?.id,
      idSolo: BLOCK_BY_KEY.dirt?.id,
      luz: 15,
      colunaLivre: 12,
      rng: () => 0,
    })
} catch {
  globalThis.__rcCresce = () => false
}

console.log(`\njornada da sobrevivência — ${ALCANCE.size} itens ao alcance de um jogador novo\n`)

const quebrados = []
for (const elo of elos) {
  let motivo
  try {
    motivo = elo.falta()
  } catch (e) {
    motivo = `a checagem estourou: ${e.message}`
  }
  if (motivo) {
    quebrados.push(elo.nome)
    console.log(`  ✗ ${elo.nome.padEnd(32)} falta: ${motivo}`)
  } else {
    console.log(`  ✓ ${elo.nome}`)
  }
}

console.log('')
if (quebrados.length) {
  console.log(
    `${quebrados.length} de ${elos.length} elos arrebentados. O jogador NÃO fecha o círculo:\n` +
      `sobrevive caçando, e para de sobreviver quando o bicho acaba.\n`,
  )
  process.exit(1)
}
console.log(`todos os ${elos.length} elos fecham: comida renovável sem caçar e sem give.\n`)
process.exit(0)
