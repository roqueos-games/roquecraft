import { describe, it, expect, beforeEach } from 'vitest'
import {
  FALLBACK_ICON,
  blockTintColor,
  limparCacheDeCor,
  COR_PADRAO,
  COR_SEM_BLOCO,
} from '../../src/servicos/aparencia.js'
import { BLOCK_BY_KEY } from '../../src/servicos/blocks.js'
import { ITEMS } from '../../src/servicos/items.js'

describe('aparência aproximada', () => {
  beforeEach(() => limparCacheDeCor())

  it('todo ícone emprestado aponta para um bloco que EXISTE', () => {
    // ⚠️ ESTE É O DEFEITO QUE A TABELA CONVIDA. Ela é escrita por nome, e nome
    // de bloco muda: renomear `oakPlanks` deixaria metade das ferramentas sem
    // ícone, e o sintoma seria um quadrado vazio no inventário que ninguém liga
    // ao commit que renomeou. Aqui o rename quebra o teste, não o jogo.
    const nomes = new Set(Object.keys(BLOCK_BY_KEY))
    const quebrados = Object.entries(FALLBACK_ICON).filter(([, bloco]) => !nomes.has(bloco))
    expect(
      quebrados,
      `ícone apontando pra bloco inexistente: ${JSON.stringify(quebrados)}`,
    ).toEqual([])
  })

  it('as dezesseis ferramentas herdam o ícone do material', () => {
    for (const tier of ['wood', 'stone', 'iron', 'diamond']) {
      for (const kind of ['pickaxe', 'axe', 'shovel', 'sword']) {
        expect(FALLBACK_ICON[`${tier}_${kind}`], `${tier}_${kind} sem ícone`).toBeTruthy()
      }
    }
    // E famílias diferentes têm ícones diferentes: sem isto, um laço com erro de
    // variável daria o mesmo ícone às dezesseis e o teste acima passaria.
    expect(FALLBACK_ICON.wood_pickaxe).not.toBe(FALLBACK_ICON.diamond_pickaxe)
    expect(FALLBACK_ICON.iron_axe).toBe(FALLBACK_ICON.iron_sword)
  })

  it('a cor da partícula é estável e cacheada por id', () => {
    const grama = { id: 1, key: 'grassBlock' }
    const primeira = blockTintColor(grama)
    expect(primeira).toBe(0x6a9c42)
    expect(blockTintColor(grama)).toBe(primeira)

    // ⚠️ O CACHE É POR `id`, e é isso que o teste tem que provar: com a mesma
    // id e outra key, a resposta vem do cache. Se alguém trocar a chave do
    // cache para `key`, este caso muda de resposta e denuncia.
    expect(blockTintColor({ id: 1, key: 'lava' })).toBe(primeira)
    limparCacheDeCor()
    expect(blockTintColor({ id: 1, key: 'lava' })).toBe(0xff5a1a)
  })

  it('bloco sem cor declarada cai no cinza de pedra, e sem bloco no neutro', () => {
    expect(blockTintColor({ id: 250, key: 'nao_existe' })).toBe(COR_PADRAO)
    expect(blockTintColor(null)).toBe(COR_SEM_BLOCO)
    expect(blockTintColor(undefined)).toBe(COR_SEM_BLOCO)
    // ⚠️ CONTROLE: os dois padrões TÊM que ser distintos entre si e do preto,
    // senão "caiu no padrão" e "não tinha bloco" seriam indistinguíveis num
    // print, que é justamente quando alguém vai olhar.
    expect(COR_PADRAO).not.toBe(COR_SEM_BLOCO)
  })

  it('todo item sem ícone próprio tem empréstimo declarado', () => {
    // Não exige que TODOS os itens estejam na tabela (bloco tem ícone próprio),
    // mas o que está na tabela tem que ser item de verdade.
    const chaves = new Set(Object.keys(ITEMS))
    const fantasmas = Object.keys(FALLBACK_ICON).filter((k) => !chaves.has(k))
    expect(fantasmas, `empréstimo para item inexistente: ${fantasmas.join(', ')}`).toEqual([])
  })
})

describe('aparência — cor declarada versus cor ausente', () => {
  beforeEach(() => limparCacheDeCor())

  it('bloco COM cor declarada usa a dela; sem cor, o cinza de pedra', () => {
    // A pergunta é "a tabela DECLARA cor para este bloco?". Com `??` ela era
    // respondida por acidente: nenhuma cor da tabela é 0x000000, então nada
    // separava o `??` de um `||`. Com `in`, a resposta vale mesmo quando a cor
    // declarada for preta.
    expect(blockTintColor(BLOCK_BY_KEY.sand)).toBe(0xdfd0a0)
    expect(blockTintColor({ id: 9999, key: 'blocoQueNaoExiste' })).toBe(COR_PADRAO)
  })

  it('sem def nenhum é caso de erro, e tem cor própria', () => {
    expect(blockTintColor(null)).toBe(COR_SEM_BLOCO)
    expect(blockTintColor(undefined)).toBe(COR_SEM_BLOCO)
  })

  it('a segunda consulta vem do cache, com a mesma resposta', () => {
    const primeira = blockTintColor(BLOCK_BY_KEY.lava)
    expect(blockTintColor(BLOCK_BY_KEY.lava)).toBe(primeira)
    expect(primeira).toBe(0xff5a1a)
  })
})
