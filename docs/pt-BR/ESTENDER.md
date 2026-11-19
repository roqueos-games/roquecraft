# Estender

_[English](../EXTENDING.md) | Português_

> **Para quem:** quem acrescenta algo que o jogo foi feito para receber: um recurso, um bloco, um item, uma receita, um texto, um asset ou uma sonda de QA.
> **O que tem aqui:** onde cada peça entra, o que mais muda junto, e qual teste ou conferência reprova quando falta um passo.
> **Onde ir para o resto:** o porquê de cada lugar em [ARQUITETURA.md](ARQUITETURA.md); os passos de contribuição em [CONTRIBUTING.md](CONTRIBUTING.md).

## Sumário

1. [Um recurso](#1-um-recurso)
2. [Um bloco](#2-um-bloco)
3. [Um item ou uma receita](#3-um-item-ou-uma-receita)
4. [Um texto](#4-um-texto)
5. [Um asset](#5-um-asset)
6. [Uma sonda de QA](#6-uma-sonda-de-qa)
7. [O que cobra cada passo](#7-o-que-cobra-cada-passo)

## 1. Um recurso

Recurso novo nasce em serviço ou composable, nunca no
[`src/JogoRoqueCraft.vue`](../../src/JogoRoqueCraft.vue), que só ganha a fiação. Decida pelo ciclo
de vida: se guarda timer, assinatura ou listener, é composable em
`src/composables/useRoqueCraft<Nome>.js`, com um `encerrar()` chamado no desmonte; se não, é serviço
em `src/servicos/`, mesmo grande e mesmo que só o QA use. Desenho vai para `src/servicos/render/`, e
essa pasta só muda com evidência num iPhone de verdade. Todo `let` do componente que o módulo novo lê
entra por getter (`() => world`), nunca por valor ([ARQUITETURA.md](ARQUITETURA.md#5-onde-cada-coisa-nasce)).

Serviço puro ganha spec em `test/servicos/`; composable, em `test/composables/`. Correção vem com
teste que reprova sem ela.

## 2. Um bloco

Os blocos estão declarados em `BLOCKS` no [`src/servicos/blocks.js`](../../src/servicos/blocks.js),
cada um com um id numérico estável:

```js
{ id: 5, key: 'sand', all: 'sand', hardness: 0.5, tool: 'shovel', gravity: true },
```

1. Ponha o bloco novo **no fim**, com o próximo id livre. Nunca renumere um id existente: os ids
   estão gravados nos saves e nas diferenças de `blocks` da sala.
2. O id tem de ficar abaixo de `TABELA_DE_IDS` (512); toda tabela por id tem esse tamanho, e o
   `test/servicos/tabelasPorId.spec.js` reprova se uma tabela voltar a um literal.
3. As texturas são camadas por nome (`all`, ou `faces` com `top`, `side`, `bottom`). Textura nova é
   desenhada no [`qa/gen-roquecraft-textures.mjs`](../../qa/gen-roquecraft-textures.mjs) e o gerador
   roda de novo; o PNG nunca é editado à mão.
4. O nome visível é a chave `blocks.<key>` nos dez `i18n/*.json`.
5. Bloco que dropa a si mesmo ganha automaticamente um item de mesmo nome
   ([`src/servicos/items.js`](../../src/servicos/items.js)).

## 3. Um item ou uma receita

Os itens que não são bloco estão declarados no [`src/servicos/items.js`](../../src/servicos/items.js)
(`MATERIALS` e as tabelas que vêm depois): o `kind` é `block`, `tool`, `food` ou `material`, e a
chave é a mesma string usada nos drops e nas receitas. O ícone sai do
[`qa/gen-roquecraft-items.mjs`](../../qa/gen-roquecraft-items.mjs).

As receitas estão no [`src/servicos/recipes.js`](../../src/servicos/recipes.js), funções puras sobre
um array de slots:

```js
shapeless('oakPlanks', 4, ['oakLog'], false),
```

O `shaped(result, count, pattern, keyMap, needsTable)` declara linhas de caracteres e um mapa de
caractere para item; o matcher recorta o menor retângulo ocupado, então uma receita funciona em
qualquer canto de uma grade 3×3. Item que nada produz é item morto: o
`test/arquitetura/itens-mortos.spec.js` reprova quando um item do catálogo não está ao alcance.

## 4. Um texto

Todo texto visível é uma chave no [`i18n/pt-BR.json`](../../i18n/pt-BR.json), o idioma canônico, e a
mesma chave nos outros nove arquivos. As telas leem pelo `t` que o componente provê. O `jogo check`
reprova idioma faltando, chave faltando, chave a mais que o pt-BR não tem, ou texto vazio.

## 5. Um asset

Arquivo em `public/games/roquecraft/` mora no caminho em que o jogo o carrega
(`/games/roquecraft/...`). Ele precisa de uma linha no [`ASSETS.md`](../../ASSETS.md) com caminho,
licença e origem; a licença tem de ser da lista aberta (CC0-1.0, CC-BY-4.0, MIT, BSD-3-Clause ou
autoral). Textura, ícone de item e arte saem dos geradores de `qa/` e de `arte/`: mude o gerador, rode
de novo, faça commit da saída.

## 6. Uma sonda de QA

Uma sonda é um script `qa/qa-roquecraft-<nome>.mjs` que abre o jogo contra o `dist/pwa` preparado
pelo `node qa/lib/preparar-dist.mjs` e o dirige pelo `window.__roquecraft`. Ela sai 0 quando o que
mediu está certo. Sonda que existe só para o olho entra na lista `mostra` do
[`qa/qa-roquecraft-manifesto.json`](../../qa/qa-roquecraft-manifesto.json). Depois de acrescentar,
rode `node qa/qa-sondas.mjs <nome>` para a varredura registrá-la.

Se a sonda precisar de um método novo no gancho de QA, acrescente num serviço
`src/servicos/qaDe<Area>.js` e registre no [`src/servicos/ganchoDeQA.js`](../../src/servicos/ganchoDeQA.js)
sem mudar a forma do que já está lá.

## 7. O que cobra cada passo

| Passo                          | O que reprova quando falta                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| id do bloco dentro das tabelas | `test/servicos/tabelasPorId.spec.js`                                                                                           |
| item ao alcance                | `test/arquitetura/itens-mortos.spec.js`                                                                                        |
| texto nos dez idiomas          | `yarn jogo:check`, seção `textos nos dez idiomas`                                                                              |
| asset com origem e licença     | `yarn jogo:check`, seção `origem dos assets`                                                                                   |
| sonda varrida                  | `test/arquitetura/sondas-varridas.spec.js`                                                                                     |
| sonda com veredito             | `test/arquitetura/sondas-com-veredito.spec.js`                                                                                 |
| nenhum import de banco         | `yarn jogo:check`, seção `o jogo não fala com banco`                                                                           |
| recurso nascido no `.vue`      | nada automático aqui; a revisão, e a rule 44 ([`regras/44-roquecraft-arquitetura.md`](../regras/44-roquecraft-arquitetura.md)) |
