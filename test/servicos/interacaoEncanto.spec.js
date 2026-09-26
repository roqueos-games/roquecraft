import { describe, it, expect } from 'vitest'
import { AIR, ID } from '../../src/servicos/blocks.js'
import { interagirComBloco } from '../../src/servicos/interacao.js'
import { custoDe, maxNivelDe } from '../../src/servicos/encantamento.js'
// o texto do jogo mora em `i18n/`; aqui vai o arquivo direto
import roqueCraftPtBR from '../../i18n/pt-BR.json'
const ptBR = { roqueCraft: roqueCraftPtBR }

//
// O DEGRAU DA MESA, exercitado sem three.js e sem montar o componente.
//
// `encantamento.spec.js` prova a REGRA (o que custa, o que cabe, o que sorteia).
// Aqui é o EFEITO: cobrou do jogador, escreveu no item, tocou som, avisou com a
// chave certa — e, nas três recusas, NÃO cobrou nada.
//
// A recusa que não cobra é o ponto. A primeira versão da fornalha gastava
// carvão para descobrir que não tinha o que fundir, e é o mesmo erro de forma:
// ler o bolso antes de saber o que se vai comprar.

const alvo = { hit: { x: 4, y: 64, z: 7 } }

function contexto({ naMao = null, nivel = 30, sorteio = () => 0 } = {}) {
  const log = { avisos: [], tocou: [], gastou: 0, encantou: null }
  return {
    log,
    blocoEm: () => ID.enchantingTable,
    naMao: () => naMao,
    nivelDoJogador: () => nivel,
    gastarNiveis: (n) => {
      log.gastou += n
    },
    encantar: (enc) => {
      log.encantou = enc
    },
    avisar: (chave, p) => log.avisos.push([chave, p]),
    tocar: (f) => log.tocou.push(f),
    sorteio,
    // os degraus anteriores, para provar que nenhum deles é atingido
    abrirBancada: () => {
      throw new Error('a mesa caiu no degrau da bancada')
    },
    abrirMobilia: () => {
      throw new Error('a mesa caiu no degrau da mobília')
    },
    editar: () => {
      throw new Error('a mesa escreveu no mundo')
    },
  }
}

describe('a mesa de encantamento', () => {
  it('encanta a ferramenta na mão, cobra o custo e avisa com a chave do encanto', () => {
    const ctx = contexto({ naMao: { item: 'iron_pickaxe', count: 1, dur: 250 }, nivel: 30 })
    expect(interagirComBloco(alvo, ctx)).toBe(true)
    expect(ctx.log.gastou).toBe(custoDe(0))
    const nome = Object.keys(ctx.log.encantou)[0]
    expect(ctx.log.encantou[nome]).toBe(1)
    expect(ctx.log.tocou).toEqual(['stone'])
    expect(ctx.log.avisos).toEqual([[`roqueCraft.encanto.aplicado.${nome}`, { nivel: 1 }]])
  })

  it('soma no que o item já tinha, sem apagar o outro encanto', () => {
    // ⚠️ O ENCANTO QUE SOBE TEM QUE SER OUTRO. Com um encanto só no item, um
    // `comEncanto({}, ...)` (mapa novo, esquecendo o que havia) devolveria
    // exatamente o mesmo objeto e o teste passaria verde com o defeito dentro.
    // Picareta com eficiência II; o sorteio no fim da lista pega inquebrável.
    const ctx = contexto({
      naMao: { item: 'iron_pickaxe', count: 1, dur: 250, enc: { eficiencia: 2 } },
      nivel: 60,
      sorteio: () => 0.99,
    })
    interagirComBloco(alvo, ctx)
    expect(ctx.log.encantou.inquebravel).toBe(1)
    expect(ctx.log.encantou.eficiencia).toBe(2)
    expect(ctx.log.gastou).toBe(custoDe(0))
  })

  it('subir um encanto que já existe cobra pelo degrau atual', () => {
    const ctx = contexto({
      naMao: { item: 'iron_sword', count: 1, dur: 250, enc: { afiacao: 1, inquebravel: 3 } },
      nivel: 60,
      sorteio: () => 0,
    })
    interagirComBloco(alvo, ctx)
    expect(ctx.log.encantou.afiacao).toBe(2)
    expect(ctx.log.encantou.inquebravel).toBe(3)
    expect(ctx.log.gastou).toBe(custoDe(1))
  })

  it('mão vazia: avisa e NÃO cobra', () => {
    const ctx = contexto({ naMao: null, nivel: 99 })
    expect(interagirComBloco(alvo, ctx)).toBe(true)
    expect(ctx.log.gastou).toBe(0)
    expect(ctx.log.encantou).toBe(null)
    expect(ctx.log.avisos).toEqual([['roqueCraft.encanto.semFerramenta', undefined]])
  })

  it('item que não é ferramenta: avisa e NÃO cobra', () => {
    const ctx = contexto({ naMao: { item: 'stone', count: 64 }, nivel: 99 })
    expect(interagirComBloco(alvo, ctx)).toBe(true)
    expect(ctx.log.gastou).toBe(0)
    expect(ctx.log.avisos[0][0]).toBe('roqueCraft.encanto.semFerramenta')
  })

  it('sem nível: avisa, NÃO cobra e NÃO encanta', () => {
    const ctx = contexto({ naMao: { item: 'iron_pickaxe', count: 1, dur: 250 }, nivel: 0 })
    expect(interagirComBloco(alvo, ctx)).toBe(true)
    expect(ctx.log.gastou).toBe(0)
    expect(ctx.log.encantou).toBe(null)
    expect(ctx.log.avisos).toEqual([['roqueCraft.encanto.semNivel', undefined]])
  })

  it('ferramenta no máximo: avisa que não há o que encantar', () => {
    const cheia = {
      item: 'iron_pickaxe',
      count: 1,
      dur: 250,
      enc: { eficiencia: maxNivelDe('eficiencia'), inquebravel: maxNivelDe('inquebravel') },
    }
    const ctx = contexto({ naMao: cheia, nivel: 999 })
    expect(interagirComBloco(alvo, ctx)).toBe(true)
    expect(ctx.log.gastou).toBe(0)
    expect(ctx.log.avisos).toEqual([['roqueCraft.encanto.nadaAEncantar', undefined]])
  })

  it('recusar NÃO deixa o clique cair no degrau seguinte', () => {
    // `contexto` estoura se algum outro degrau for atingido; o teste é o `true`
    // somado ao fato de nenhuma das três armadilhas ter disparado.
    for (const naMao of [null, { item: 'stone', count: 1 }]) {
      const ctx = contexto({ naMao, nivel: 0 })
      // o `true` é a metade que importa: `false` faria o clique seguir a escada
      expect(interagirComBloco(alvo, ctx)).toBe(true)
    }
    // e a terceira recusa, a que tem item válido mas bolso vazio
    const pobre = contexto({ naMao: { item: 'iron_pickaxe', count: 1, dur: 250 }, nivel: 1 })
    expect(interagirComBloco(alvo, pobre)).toBe(true)
  })

  it('outro bloco qualquer não vira mesa', () => {
    const ctx = contexto({ naMao: { item: 'iron_pickaxe', count: 1, dur: 250 } })
    ctx.blocoEm = () => ID.stone
    expect(interagirComBloco(alvo, ctx)).toBe(false)
    expect(ctx.log.gastou).toBe(0)
  })

  it('mesa sem alvo não faz nada', () => {
    const ctx = contexto({ naMao: { item: 'iron_pickaxe', count: 1, dur: 250 } })
    expect(interagirComBloco(null, ctx)).toBe(false)
    expect(ctx.log.gastou).toBe(0)
    expect(ctx.blocoEm(0, 0, 0)).toBe(ID.enchantingTable)
    expect(AIR).toBe(0)
  })
})

//
// A GUARDA DAS DEZ TRADUÇÕES.
//
// As chaves de aviso são montadas por template (`...aplicado.${nome}`), então o
// `usedKeysExist.spec.js`, que lê literais, não enxerga nenhuma delas. Sem esta
// guarda, encanto novo em `ENCANTOS` sairia no jogo mostrando o caminho da
// chave na tela — que é exatamente o defeito de 2026-07-30 que aquele teste
// nasceu para pegar, entrando pela porta que ele não vigia.
describe('as chaves de encanto existem no idioma de referência', () => {
  const nomes = Object.keys(ptBR.roqueCraft.encanto.aplicado)

  it('há um nome e uma frase de aplicado para cada encanto do catálogo', async () => {
    const { NOMES_DE_ENCANTO } = await import('../../src/servicos/encantamento.js')
    expect(nomes.sort()).toEqual([...NOMES_DE_ENCANTO].sort())
    for (const n of NOMES_DE_ENCANTO) {
      expect(typeof ptBR.roqueCraft.encanto.aplicado[n]).toBe('string')
      // a frase interpola o nível: sem isso o jogador não sabe qual grau saiu
      expect(ptBR.roqueCraft.encanto.aplicado[n]).toContain('{nivel}')
    }
  })

  it('as três recusas têm texto', () => {
    for (const k of ['semFerramenta', 'semNivel', 'nadaAEncantar']) {
      expect(ptBR.roqueCraft.encanto[k].length).toBeGreaterThan(5)
    }
  })

  it('a mesa tem nome de bloco', () => {
    expect(ptBR.roqueCraft.blocks.enchantingTable.length).toBeGreaterThan(3)
  })
})
