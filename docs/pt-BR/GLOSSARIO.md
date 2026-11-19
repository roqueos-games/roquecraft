# Glossário

_[English](../GLOSSARY.md) | Português_

> **Para quem:** quem lê o código, os testes ou os planos importados e encontra um termo que aqui quer dizer coisa específica.
> **O que tem aqui:** cada termo como aparece no código, o que é e onde mora.
> **Onde ir para o resto:** as constantes em [REFERENCIA.md](REFERENCIA.md); como as peças se ligam em [ARQUITETURA.md](ARQUITETURA.md).

O código é em português do Brasil, então a maioria dos termos são palavras do dia a dia que aqui
ganharam sentido próprio. Ficam como aparecem, porque é isso que você vai procurar.

| Termo               | O que é                                                                                                 | Onde                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `host`              | o objeto que a plataforma entrega ao jogo no `mount`: o RoqueOS, o host de desenvolvimento ou o falso   | `@roqueos-games/jogo-sdk`, [`src/index.js`](../../src/index.js)                                    |
| capacidade          | uma parte nomeada do host que o jogo pode usar: `salaAoVivo`, `progresso`, `teclado`, `ia`, `avisar`... | [INTEGRACOES.md](INTEGRACOES.md#2-as-capacidades-que-o-jogo-usa)                                   |
| `salaAoVivo`        | a capacidade da sala em tempo real: muitos jogadores, presença, nós que só o anfitrião escreve          | [`roqueCraftRoom.js`](../../src/servicos/roqueCraftRoom.js)                                        |
| `progresso`         | a capacidade que guarda o jogo do jogador na conta dele                                                 | [`roqueCraftSave.js`](../../src/servicos/roqueCraftSave.js)                                        |
| `anfitrião`         | o jogador dono da sala: simula os bichos e o relógio; não é o mesmo que o `host` da plataforma          | [`roqueCraftRoom.js`](../../src/servicos/roqueCraftRoom.js)                                        |
| `convidado`         | quem entrou na sala: desenha o que chega e manda intenções                                              | [`useRoqueCraftMultijogador.js`](../../src/composables/useRoqueCraftMultijogador.js)               |
| sucessão            | escolher o próximo anfitrião quando o atual sai                                                         | `sucessorDoAnfitriao` em [`roqueCraftRoom.js`](../../src/servicos/roqueCraftRoom.js)               |
| semeadura           | o anfitrião gravando as edições do próprio mundo numa sala nova, em lotes de `LOTE_DE_SEMEADURA`        | [`roqueCraftRoom.js`](../../src/servicos/roqueCraftRoom.js)                                        |
| `edits`, edições    | a diferença entre o mundo e a semente dele: `[cx, cz, li, id, ...]`                                     | [`chunkStore.js`](../../src/servicos/chunkStore.js), [`edicoes.js`](../../src/servicos/edicoes.js) |
| `li`                | o índice local de um bloco dentro da coluna do chunk, com Y contíguo                                    | [`constants.js`](../../src/servicos/constants.js)                                                  |
| chunk, seção        | uma coluna de 16 × altura × 16 blocos; a seção é o pedaço de 16³ que se malha                           | [`constants.js`](../../src/servicos/constants.js)                                                  |
| dimensão            | `overworld`, `nether` ou `end`, cada uma com as próprias alturas, mar e teto                            | [`dimensoes.js`](../../src/servicos/dimensoes.js)                                                  |
| `outrasDimensoes`   | as edições das dimensões em que o jogador não está, no save                                             | [`roqueCraftSave.js`](../../src/servicos/roqueCraftSave.js)                                        |
| `mobilia`           | baús, fornalhas e suportes de poção com o que eles guardam                                              | [`mobilia.js`](../../src/servicos/mobilia.js)                                                      |
| `_a`                | o embrulho `{ _a: [...] }` de uma lista diretamente dentro de outra no save (v13)                       | [`documentoDoSave.js`](../../src/servicos/documentoDoSave.js)                                      |
| RC-02               | a regra de que leitura do save que falhou nunca grava por cima do mundo                                 | [`cargaDoSave.js`](../../src/servicos/cargaDoSave.js)                                              |
| `CARGA`             | os quatro estados da carga: `NAO_TENTOU`, `CARREGADO`, `VAZIO`, `INDISPONIVEL`                          | [`cargaDoSave.js`](../../src/servicos/cargaDoSave.js)                                              |
| perfil de qualidade | `ultra`, `high`, `medium`, `low`: o que o renderer liga                                                 | [`render/engine.js`](../../src/servicos/render/engine.js)                                          |
| modo leve           | o `desempenho.modoLeve()` do host: começa a qualidade em `low`                                          | [`render/engine.js`](../../src/servicos/render/engine.js)                                          |
| aldeão              | o NPC que negocia e conversa, pela `ia` ou pelas falas locais                                           | [`npc.js`](../../src/servicos/npc.js), [`falaDoNpc.js`](../../src/servicos/falaDoNpc.js)           |
| sonda               | um script de navegador ou de Node em `qa/` que abre o jogo e mede uma coisa                             | [`qa/README.md`](../../qa/README.md)                                                               |
| varredura           | rodar todas as sondas e gravar o resultado no `qa/qa-roquecraft-varredura.json`                         | [`qa/qa-sondas.mjs`](../../qa/qa-sondas.mjs)                                                       |
| humana              | sonda que existe para o olho e não é julgada pelo código de saída                                       | [`qa/qa-roquecraft-manifesto.json`](../../qa/qa-roquecraft-manifesto.json)                         |
| régua               | teste que mede o próprio repo (idade da varredura, o mesher, as tabelas), não o comportamento do jogo   | [`test/arquitetura/`](../../test/arquitetura/)                                                     |
| ledger              | arquivo de medição versionado que um teste lê: a varredura e o `qa/bench-mesher.json`                   | [`qa/bench-mesher.mjs`](../../qa/bench-mesher.mjs)                                                 |
| dublê do three      | o substituto do three.js que o teste usa, porque o jsdom não tem WebGL                                  | [`test/threeStub.js`](../../test/threeStub.js)                                                     |
| host falso          | o host falso do SDK, que anota cada chamada em `host.chamadas`                                          | `@roqueos-games/jogo-sdk/host-falso`                                                               |
| gancho de QA        | o `window.__roquecraft`, a superfície das sondas, só em modo E2E                                        | [`ganchoDeQA.js`](../../src/servicos/ganchoDeQA.js)                                                |
| modo E2E            | a página com `window.__ROS_E2E__` definido: gancho de QA ligado, sem save                               | `emModoE2E` do SDK                                                                                 |
| `it.fails`          | teste do Vitest que pina um defeito conhecido: passa enquanto o defeito existe                          | [TESTES.md](TESTES.md)                                                                             |
| `jogo check`        | o comando do SDK que confere um repo de jogo contra o contrato do RoqueOS                               | `yarn jogo:check`                                                                                  |
| fiação              | o que o componente `.vue` pode conter: ligar serviços e composables                                     | [ARQUITETURA.md](ARQUITETURA.md#5-onde-cada-coisa-nasce)                                           |
