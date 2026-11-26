# Integrações

_[English](../INTEGRATIONS.md) | Português_

> **Para quem:** quem trabalha no lado do RoqueOS do jogo (o host, o catálogo, o pin), ou num harness de QA que dirige o jogo.
> **O que tem aqui:** toda superfície por onde outro sistema conversa com o RoqueCraft: o contrato do `mount`, as capacidades, o manifesto, a sala, o save, o gancho de E2E e o pin.
> **Onde ir para o resto:** como o jogo é por dentro em [ARQUITETURA.md](ARQUITETURA.md); o que nunca muda em [DECISOES.md](DECISOES.md).

## Sumário

1. [O contrato do mount](#1-o-contrato-do-mount)
2. [As capacidades que o jogo usa](#2-as-capacidades-que-o-jogo-usa)
3. [A sala (salaAoVivo)](#3-a-sala-salaaovivo)
4. [O save (progresso)](#4-o-save-progresso)
5. [O manifesto jogo.json](#5-o-manifesto-jogojson)
6. [O gancho de QA](#6-o-gancho-de-qa)
7. [Como o RoqueOS instala o jogo](#7-como-o-roqueos-instala-o-jogo)

## 1. O contrato do mount

O [`src/index.js`](../../src/index.js) exporta `definirJogo({ id: 'roquecraft', capacidades, montar })`
do `@roqueos-games/jogo-sdk`. O host chama `jogo.mount(el, host, { ativo })`; o SDK confere o host
antes e recusa, com a lista do que falta, o host que não cumpre o contrato. O `montar` cria um app
Vue próprio dentro do `el` e devolve `{ ativar, desmontar }`. A página de desenvolvimento faz
exatamente o que o RoqueOS faz:

```js
import { criarHostDeDesenvolvimento } from '@roqueos-games/jogo-sdk/host-de-desenvolvimento'
import jogo from '../src/index.js'

const host = criarHostDeDesenvolvimento({ jogoId: jogo.id })
const montagem = jogo.mount(document.getElementById('jogo'), host, { ativo: true })
window.addEventListener('focus', () => montagem.ativar(true))
window.addEventListener('blur', () => montagem.ativar(false))
```

É o [`dev/main.js`](../../dev/main.js) encurtado; o de verdade também copia os avisos para uma
bandeja `__rosStore` de mentira, para as sondas.

## 2. As capacidades que o jogo usa

| Capacidade   | Exigida   | O que o jogo faz com ela                                                                      | Onde                                                                   |
| ------------ | --------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `salaAoVivo` | sim       | a sala em tempo real: criar, entrar, ler, escrever, observar, queda da presença               | [`roqueCraftRoom.js`](../../src/servicos/roqueCraftRoom.js)            |
| `progresso`  | sim       | o mundo salvo na conta: `disponivel`, `carregar`, `salvar`                                    | [`roqueCraftSave.js`](../../src/servicos/roqueCraftSave.js)            |
| `teclado`    | se houver | a janela ativa reivindica o teclado enquanto nenhuma tela do jogo está aberta                 | [`src/servicos/teclado.js`](../../src/servicos/teclado.js)             |
| `ia`         | se houver | a conversa do aldeão: `disponivel()` antes de perguntar, `completar` para o texto             | [`falaDoRoqueOS.js`](../../src/servicos/falaDoRoqueOS.js)              |
| `avisar`     | sempre    | os avisos ao jogador, com os tipos do contrato `info`, `sucesso`, `aviso`, `erro`, e o `fixo` | [`src/avisos.js`](../../src/avisos.js)                                 |
| `idioma`     | sempre    | `atual()` e `aoMudar`: os textos recarregam e vale a última troca                             | [`src/index.js`](../../src/index.js)                                   |
| `desempenho` | sempre    | `modoLeve()` faz o perfil de qualidade começar em `low`                                       | [`src/servicos/render/engine.js`](../../src/servicos/render/engine.js) |

`salaAoVivo` e `progresso` estão declaradas em `capacidades` porque sem elas o jogo não é o jogo.
`teclado` e `ia` são usadas se o host as tiver: o comentário do `src/index.js` registra que exigir as
duas derrubaria o jogo onde ele funciona sem elas.

## 3. A sala (salaAoVivo)

Os nomes dos nós e os campos são os de antes da extração, de propósito, porque do outro lado pode
estar um RoqueOS antigo ([`src/servicos/roqueCraftRoom.js`](../../src/servicos/roqueCraftRoom.js)):

| Nó                   | Quem escreve    | O que é                                                                                       |
| -------------------- | --------------- | --------------------------------------------------------------------------------------------- |
| `meta`               | o host e o jogo | `seed` e `mode` (do jogo); `host`, `hostName`, `createdAt` (do host); `host` muda na sucessão |
| `players/{uid}`      | cada jogador    | nome, skin, ação, posição, vida, item na mão, hora; presença a uns 10 Hz                      |
| `blocks/{chunk}/{i}` | todos           | o bloco que mudou; quem cria a sala semeia as edições do mundo dela em lotes de 2000          |
| `mobs`               | o anfitrião     | o retrato dos bichos (`snap`) e a hora                                                        |
| `relogio`            | o anfitrião     | a hora do dia (`ticks`) e a chuva forçada                                                     |
| `mobilia/{chave}`    | todos           | baús, fornalhas e suportes de poção, no formato do save                                       |
| `hits/{chave}`       | os convidados   | a intenção de golpe (`m`, `d`, `by`), que o anfitrião aplica e apaga                          |
| `chat/{chave}`       | todos           | `uid`, `name`, `text`, hora; a tela mostra as últimas 60, com até 160 caracteres cada         |

A chave do chunk é `${cx}_${cz}` (`chunkPath`). Sem conta, o host recusa com
`.codigo = 'sem-conta'` e o lobby diz que é preciso entrar na conta. No RoqueOS isso mora no nó
`roquecraftRooms/<code>` do Realtime Database, atrás do host; o jogo nunca vê o banco.

## 4. O save (progresso)

O `criarSaveDoRoqueCraft(progresso)` devolve `disponivel`, `saveRoqueCraft(payload)` e
`loadRoqueCraft()`. Gravar substitui o documento inteiro (sem `mesclar`); a recusa do host lança
(`o host recusou o save do RoqueCraft (veja o aviso do host no console)`), o que manda a falha para o
`aoFalhar` do autosave em vez de contar como gravado. Ler devolve o documento já passado pelo
`parseSave`, `null` quando não há save, e rejeita quando não consegue ler, que é o que o RC-02
precisa. Os campos estão em [ARQUITETURA.md](ARQUITETURA.md#7-dados-e-contratos) e em
[REFERENCIA.md](REFERENCIA.md#5-o-documento-do-save).

## 5. O manifesto jogo.json

O [`jogo.json`](../../jogo.json) é o que o RoqueOS lê para o catálogo: `id` e `slug` (`roquecraft`),
`versaoDoContrato` 1, o nome e a descrição nos dez idiomas, o texto de SEO em pt-BR e en-US,
`etiquetas`, `capa` e `icone` (caminhos em `public/`), `brilho`, o tamanho da janela,
`aceitaConvite: true`, `entraNoPodio: false`, `recorde: null` e
`capacidades: ["salaAoVivo", "progresso"]`. O `jogo check` valida e reprova quando `capa` ou `icone`
aponta para arquivo que não existe.

## 6. O gancho de QA

O `window.__roquecraft` é instalado pelo [`src/servicos/ganchoDeQA.js`](../../src/servicos/ganchoDeQA.js)
só quando o SDK diz que a página está em modo E2E (`window.__ROS_E2E__` definido antes de qualquer
script). Em produção a função sai na primeira linha. O componente lê duas chaves do estado E2E:
`roquecraftSeed` (a semente que o harness quer) e `roquecraftMenu` (manter o menu aberto). As sondas
de `qa/` e o QA do RoqueOS usam este gancho, e por isso a forma dele não muda.

## 7. Como o RoqueOS instala o jogo

O RoqueOS depende de `"@roqueos-games/roquecraft": "github:roqueos-games/roquecraft#v0.1.3"`, com o
commit travado no lockfile dele, monta o jogo pelo `mount` do SDK numa janela em
`/jogar/roquecraft` e serve `public/games/roquecraft/` em `/games/roquecraft/`. Uma mudança aqui só
chega ao RoqueOS quando uma tag nova é pinada lá, depois de revisada. O RoqueOS compila o jogo com o
Vite dele; o [`vite.config.js`](../../vite.config.js) daqui só serve o `yarn dev` e o `yarn test`.
