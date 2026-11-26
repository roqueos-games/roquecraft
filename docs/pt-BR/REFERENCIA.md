# Referência

_[English](../REFERENCE.md) | Português_

> **Para quem:** quem precisa do nome exato de um comando, arquivo, constante ou campo.
> **O que tem aqui:** os comandos, os scripts de QA e os geradores, os arquivos e pastas, as constantes que importam, o documento do save campo a campo, e as variáveis de ambiente.
> **Onde ir para o resto:** por que as coisas são assim em [ARQUITETURA.md](ARQUITETURA.md); os nós da sala em [INTEGRACOES.md](INTEGRACOES.md#3-a-sala-salaaovivo).

## Sumário

1. [Comandos](#1-comandos)
2. [Scripts de QA e geradores](#2-scripts-de-qa-e-geradores)
3. [Arquivos e pastas](#3-arquivos-e-pastas)
4. [Constantes e ajustes](#4-constantes-e-ajustes)
5. [O documento do save](#5-o-documento-do-save)
6. [Variáveis de ambiente](#6-variáveis-de-ambiente)

## 1. Comandos

Todos do [`package.json`](../../package.json), Yarn 1.22, rodados na raiz do repo.

| Comando                         | O que faz                                                                                          | Código de saída                        |
| ------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `yarn install --ignore-scripts` | instala exatamente o que o lockfile diz, sem script de instalação                                  | 0 quando instalou                      |
| `yarn dev`                      | o Vite servindo `index.html` e `dev/main.js` com o host de desenvolvimento                         | roda até parar                         |
| `yarn test`                     | `vitest run`, todo `test/**/*.spec.js` no jsdom                                                    | 1 quando algum teste reprova           |
| `yarn lint`                     | `eslint .` com o [`eslint.config.js`](../../eslint.config.js)                                      | 1 em qualquer erro                     |
| `yarn format`                   | `prettier --write .`                                                                               | 0                                      |
| `yarn format:check`             | `prettier --check .`, respeitando o [`.prettierignore`](../../.prettierignore)                     | 1 quando um arquivo não está formatado |
| `yarn jogo:check`               | o `jogo check` do SDK: scripts de instalação, manifesto, dez idiomas, origem dos assets, sem banco | 1 com `REPROVOU` numa seção            |
| `yarn verificar`                | lint, conferência de formato, testes e `jogo check`, nessa ordem                                   | a primeira falha para tudo             |

## 2. Scripts de QA e geradores

| Script                                | Entrada                                                               | Saída                                                                                                    |
| ------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `node qa/lib/preparar-dist.mjs`       | o repo                                                                | `dist/pwa` com a página de desenvolvimento e um `app.html` de mentira; imprime o nome do chunk do Worker |
| `node qa/qa-sondas.mjs [filtro ...]`  | as sondas de `qa/`                                                    | reescreve o `qa/qa-roquecraft-varredura.json`                                                            |
| `node qa/bench-mesher.mjs`            | o motor de `src/servicos/`                                            | imprime quanto custa malhar uma seção                                                                    |
| `node qa/bench-mesher.mjs --ledger`   | o mesmo                                                               | também acrescenta a medição ao `qa/bench-mesher.json`                                                    |
| `node qa/qa-roquecraft-<nome>.mjs`    | um `dist/pwa` rodando                                                 | fotos e relatórios em `scripts/.qa-<nome>/` (fora do git)                                                |
| `node qa/gen-roquecraft-textures.mjs` | nada; procedural                                                      | `public/games/roquecraft/tex/`: albedo, normal, MER, itens e `manifest.json`                             |
| `node qa/gen-roquecraft-items.mjs`    | nada; desenhado por receita                                           | os ícones de item                                                                                        |
| `node qa/gen-roquecraft-art.mjs`      | o [`arte/manifesto.json`](../../arte/manifesto.json) e `arte/fontes/` | confere a capa, o ícone e a arte do menu exportados                                                      |

As sondas e os geradores vieram do `scripts/` do RoqueOS; as linhas de uso deles ainda dizem
`node scripts/...`, que aqui é `node qa/...` ([`qa/README.md`](../../qa/README.md)). O
`qa/gen-roquecraft-i18n.mjs` ainda escreve no caminho do front (`src/i18n/<idioma>/roqueCraft.js`),
não em `i18n/*.json`.

## 3. Arquivos e pastas

| Caminho                                  | Quem escreve                               | Quem lê                                                  |
| ---------------------------------------- | ------------------------------------------ | -------------------------------------------------------- |
| `src/`                                   | quem desenvolve                            | o Vite do RoqueOS, o `yarn dev`, o Vitest                |
| `i18n/<idioma>.json`                     | quem desenvolve, as mesmas chaves nos dez  | o [`src/textos.js`](../../src/textos.js), o `jogo check` |
| `public/games/roquecraft/`               | os geradores de `qa/`                      | o jogo, em `/games/roquecraft/`                          |
| `public/capa.jpg`, `public/icone.svg`    | o pipeline de arte (`arte/`)               | o `jogo.json`, o catálogo, o README                      |
| `ASSETS.md`                              | quem põe arquivo em `public/`              | o `jogo check`                                           |
| `jogo.json`                              | quem desenvolve                            | o RoqueOS, o `jogo check`                                |
| `qa/qa-roquecraft-varredura.json`        | o `qa/qa-sondas.mjs`                       | o `test/arquitetura/sondas-varridas.spec.js`             |
| `qa/qa-roquecraft-manifesto.json`        | quem desenvolve                            | o `qa-sondas.mjs`, o `sondas-com-veredito.spec.js`       |
| `qa/bench-mesher.json`                   | o `qa/bench-mesher.mjs --ledger`           | o `test/arquitetura/mesher-medido.spec.js`               |
| `test/arquitetura/altura-cravada.json`   | quem desenvolve                            | o `altura-cravada.spec.js`                               |
| `docs/docs.json`, `docs/.docs-hash.json` | quem desenvolve, o `roqueos-docs --update` | o `roqueos-docs`                                         |
| `CHANGELOG.md`                           | quem publica                               | quem revisa, o RoqueOS ao subir o pin                    |

## 4. Constantes e ajustes

| Nome                  | Valor                            | Efeito                                                 | Onde                                                                                 |
| --------------------- | -------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `CHUNK_SIZE`          | 16                               | largura e profundidade de um chunk                     | [`constants.js`](../../src/servicos/constants.js)                                    |
| `SECTION_HEIGHT`      | 16                               | altura de uma seção malhada                            | [`dimensoes.js`](../../src/servicos/dimensoes.js)                                    |
| `altura` do overworld | 128 (oito seções)                | altura do mundo na dimensão padrão                     | [`dimensoes.js`](../../src/servicos/dimensoes.js)                                    |
| `TABELA_DE_IDS`       | 512                              | tamanho de toda tabela de consulta por id              | [`blocks.js`](../../src/servicos/blocks.js)                                          |
| `ESPERA_DO_AUTOSAVE`  | 2500 ms                          | espera depois da última mudança antes de gravar        | [`useRoqueCraftPersistencia.js`](../../src/composables/useRoqueCraftPersistencia.js) |
| `MAX_SAVED_EDITS`     | 60000                            | teto de edições gravadas                               | [`roqueCraftSave.js`](../../src/servicos/roqueCraftSave.js)                          |
| `GERADOR_ATUAL`       | 1                                | `generatorVersion` dos mundos novos                    | [`roqueCraftSave.js`](../../src/servicos/roqueCraftSave.js)                          |
| `LOTE_DE_SEMEADURA`   | 2000                             | edições por lote ao semear uma sala nova               | [`roqueCraftRoom.js`](../../src/servicos/roqueCraftRoom.js)                          |
| `CHAT_LIMIT`          | 60                               | mensagens de chat mostradas                            | [`roqueCraftRoom.js`](../../src/servicos/roqueCraftRoom.js)                          |
| `MAX_CHAT_LEN`        | 160                              | caracteres por mensagem de chat                        | [`roqueCraftRoom.js`](../../src/servicos/roqueCraftRoom.js)                          |
| `renderDistance`      | 3 a 16                           | limites da distância de renderização na tela de opções | [`ajustes.js`](../../src/servicos/ajustes.js)                                        |
| `fov`                 | 55 a 100, 78 no celular          | campo de visão                                         | [`ajustes.js`](../../src/servicos/ajustes.js)                                        |
| perfis de qualidade   | `ultra`, `high`, `medium`, `low` | o `detectQuality` escolhe um; o `modoLeve` força `low` | [`render/engine.js`](../../src/servicos/render/engine.js)                            |
| `FOLGA_DIAS`          | 21                               | idade máxima da varredura das sondas                   | [`sondas-varridas.spec.js`](../../test/arquitetura/sondas-varridas.spec.js)          |
| `testTimeout`         | 15000 ms                         | teto global de teste                                   | [`vite.config.js`](../../vite.config.js)                                             |

## 5. O documento do save

Versão 13, montado pelo `buildSavePayload` e lido pelo `parseSave` em
[`src/servicos/roqueCraftSave.js`](../../src/servicos/roqueCraftSave.js). Toda lista diretamente
dentro de outra lista é gravada como `{ _a: [...] }` ([`documentoDoSave.js`](../../src/servicos/documentoDoSave.js)).

| Campo              | Tipo                          | Padrão quando falta na leitura      |
| ------------------ | ----------------------------- | ----------------------------------- |
| `version`          | número, 13 na gravação        | 1                                   |
| `worldId`          | texto                         | `w<semente>`                        |
| `dimensionId`      | texto                         | `overworld`                         |
| `generatorVersion` | número                        | 1                                   |
| `seed`             | número                        | 1                                   |
| `mode`             | `survival` ou `creative`      | `survival`                          |
| `edits`            | plano `[cx, cz, li, id, ...]` | vazio                               |
| `outrasDimensoes`  | pares `[id, edições]`         | vazio                               |
| `player`           | `{ x, y, z, yaw, pitch }`     | `null`, nasce onde o mundo manda    |
| `inventory`        | o inventário serializado      | vazio                               |
| `survival`         | vida, fome, fôlego            | os padrões do `deserializeSurvival` |
| `efeitos`          | efeitos de poção ou `null`    | nenhum, com o prazo preso ao teto   |
| `ticks`            | hora do dia                   | 1000                                |
| `hotbar`           | 0 a 8                         | 0                                   |
| `settings`         | os valores da tela de opções  | `null`                              |
| `mobilia`          | a mobília com conteúdo        | vazio                               |
| `renascimento`     | o ponto da cama `{ x, y, z }` | `null`                              |
| `dragaoMorto`      | booleano                      | `false`                             |
| `drops`            | itens no chão                 | vazio                               |
| `mobs`             | o rebanho, aldeões inclusive  | vazio; o mundo repovoa              |
| `updatedAt`        | `Date.now()`                  | não é lido                          |

## 6. Variáveis de ambiente

| Variável               | Padrão    | Efeito                                                                       | Onde                                   |
| ---------------------- | --------- | ---------------------------------------------------------------------------- | -------------------------------------- |
| `VITEST_INSTRUMENTADO` | sem valor | sobe o `TETO_DE_MUNDO` de 60 s para 240 s e o `TETO_LENTO` de 20 s para 60 s | [`test/tetos.js`](../../test/tetos.js) |

O jogo em si não lê variável de ambiente nenhuma. O modo E2E vem do `window.__ROS_E2E__` na página,
não do ambiente ([INTEGRACOES.md](INTEGRACOES.md#6-o-gancho-de-qa)).
