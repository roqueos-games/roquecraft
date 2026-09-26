import { describe, it, expect } from 'vitest'

import { buildSavePayload, parseSave } from '../../src/servicos/roqueCraftSave.js'

// ITEM NO CHÃO ERA ESTADO DE JOGO TRATADO COMO EFÊMERO.
//
// A auditoria de 24/08 não achou isso lendo o jogo: achou classificando os 48
// `let` de módulo do componente em "estado de jogo" e "efêmero de render", e
// cruzando a primeira lista com o que o save grava. Sobraram três — `mobs`,
// `drops` e `dropId` — e um deles o jogador percebe na hora: você quebra um baú
// cheio, o telefone toca, e ao voltar o chão está limpo.
//
// O save já cresceu duas vezes por motivo parecido (v3 pra mobília, v4 pra
// cama). Este é o v5.

const drop = (over = {}) => ({
  item: 'stone',
  count: 3,
  x: 1.5,
  y: 64.2,
  z: -2.25,
  age: 12,
  ...over,
})

describe('save v5 - item no chão', () => {
  it('grava e devolve o item com posição, quantidade e IDADE', () => {
    const p = buildSavePayload({ seed: 1, drops: [drop()] })
    // A asserção ANDOU com a versão (v5 → v6, o rebanho) em vez de ser
    // afrouxada pra `>= 5`: o ponto dela é que a versão SOBE quando o formato
    // muda, e um `>=` deixaria de acusar exatamente o esquecimento que ela
    // vigia. Quem entrar aqui de novo, suba o número — não troque o operador.
    // Piso e não igualdade: ver a nota em `saveMobs.spec.js`.
    expect(
      p.version,
      'a versão tem que subir, senão save antigo e novo se confundem',
    ).toBeGreaterThanOrEqual(9)
    const lido = parseSave(p)
    expect(lido.drops).toHaveLength(1)
    expect(lido.drops[0]).toMatchObject({ item: 'stone', count: 3, x: 1.5, y: 64.2, z: -2.25 })
    // ⚠️ A IDADE é o campo que ninguém lembra de gravar. Item some sozinho aos
    // 240 s; sem ela, recarregar dá vida nova a tudo e o chão de uma base
    // antiga vira depósito permanente.
    expect(lido.drops[0].age, 'a idade não sobreviveu').toBe(12)
  })

  it('save antigo (v4, sem o campo) carrega com chão limpo em vez de quebrar', () => {
    const antigo = { version: 4, seed: 7 }
    const lido = parseSave(antigo)
    expect(lido.drops, 'save antigo tem que virar lista vazia, não undefined').toEqual([])
  })

  it('payload sem drops nenhum grava lista vazia, não undefined', () => {
    const p = buildSavePayload({ seed: 1 })
    expect(p.drops).toEqual([])
    expect(parseSave(p).drops).toEqual([])
  })

  it('descarta entrada corrompida em vez de gravar NaN no chão', () => {
    // Um `{x: NaN}` gravado vira item em lugar nenhum, e o coletor tenta
    // alcançá-lo pra sempre. Mesma família do `pontoValido` do renascimento.
    const p = buildSavePayload({
      seed: 1,
      drops: [drop(), drop({ x: NaN }), drop({ item: null }), drop({ count: 0 }), null, undefined],
    })
    expect(p.drops, 'só o item válido devia passar').toHaveLength(1)
  })

  it('a leitura também se defende de lixo vindo do disco', () => {
    // O save pode ter sido corrompido por outra versão, por edição manual, ou
    // por um bug antigo. `parseSave` é a fronteira: nada de lá entra sem passar.
    const lido = parseSave({
      version: 5,
      seed: 1,
      drops: [{ i: 'stone', n: 2, x: 1, y: 2, z: 3, a: 5 }, { i: 'x' }, null, 42, 'oi'],
    })
    expect(lido.drops).toHaveLength(1)
    expect(lido.drops[0].item).toBe('stone')
  })

  it('quantidade é presa entre 1 e 64 nos dois sentidos', () => {
    const p = buildSavePayload({ seed: 1, drops: [drop({ count: 9999 })] })
    expect(p.drops[0].n, 'pilha maior que 64 não existe').toBe(64)
    const lido = parseSave({ version: 5, seed: 1, drops: [{ i: 'stone', n: 0, x: 0, y: 0, z: 0 }] })
    expect(lido.drops[0].count, 'pilha de zero não é item, é bug').toBe(1)
  })

  it('idade negativa vinda do disco vira zero', () => {
    const lido = parseSave({
      version: 5,
      seed: 1,
      drops: [{ i: 'stone', n: 1, x: 0, y: 0, z: 0, a: -50 }],
    })
    expect(lido.drops[0].age).toBe(0)
  })

  // ⚠️ O teto existe pelo mesmo motivo do teto das edições: o documento do save
  // tem limite, e estourá-lo mata o autosave em silêncio.
  it('trunca em 400 itens em vez de deixar o documento estourar', () => {
    const muitos = Array.from({ length: 1200 }, (_, i) => drop({ x: i }))
    const p = buildSavePayload({ seed: 1, drops: muitos })
    expect(p.drops.length).toBe(400)
    // E descarta os MAIS NOVOS: o que o jogador largou primeiro é o que ele
    // provavelmente organizou; o que caiu por último é entulho.
    expect(p.drops[0].x, 'guardou o fim da lista em vez do começo').toBe(0)
  })

  it('a ida e a volta são estáveis: gravar o que se leu não muda nada', () => {
    // Se o formato não fosse idempotente, cada autosave degradaria o save um
    // pouquinho, e ninguém notaria até o mundo ficar errado.
    const p1 = buildSavePayload({ seed: 1, drops: [drop()] })
    const lido1 = parseSave(p1)
    const p2 = buildSavePayload({ seed: 1, drops: lido1.drops })
    expect(p2.drops).toEqual(p1.drops)
  })

  it('não mexeu no que já funcionava: mobília e renascimento continuam de pé', () => {
    const p = buildSavePayload({
      seed: 1,
      mobilia: [{ k: '1,2,3', tipo: 'chest' }],
      renascimento: { x: 1, y: 2, z: 3 },
      drops: [drop()],
    })
    const lido = parseSave(p)
    expect(lido.mobilia).toHaveLength(1)
    expect(lido.renascimento).toEqual({ x: 1, y: 2, z: 3 })
    expect(lido.drops).toHaveLength(1)
  })
})
