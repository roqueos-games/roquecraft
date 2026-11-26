# Glossary

_English | [Português](pt-BR/GLOSSARIO.md)_

> **For whom:** whoever reads the code, the tests or the imported plans and meets a Portuguese term that means something specific here.
> **What is here:** each term as it appears in the code, what it is and where it lives.
> **Where to go for the rest:** the constants in [REFERENCE.md](REFERENCE.md); how the pieces connect in [ARCHITECTURE.md](ARCHITECTURE.md).

The code is in Brazilian Portuguese, so most terms are Portuguese words. They are kept as they
appear, because that is what you will search for.

| Term                      | What it is                                                                                           | Where                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `host`                    | the object the platform hands to the game in `mount`: RoqueOS, the development host or the fake host | `@roqueos-games/jogo-sdk`, [`src/index.js`](../src/index.js)                                 |
| capability (`capacidade`) | a named part of the host the game may use: `salaAoVivo`, `progresso`, `teclado`, `ia`, `avisar`...   | [INTEGRATIONS.md](INTEGRATIONS.md#2-capabilities-the-game-uses)                              |
| `salaAoVivo`              | the real-time room capability: many players, presence, host-only nodes                               | [`roqueCraftRoom.js`](../src/servicos/roqueCraftRoom.js)                                     |
| `progresso`               | the capability that saves the player's game on their account                                         | [`roqueCraftSave.js`](../src/servicos/roqueCraftSave.js)                                     |
| `anfitrião`               | the host player of a room: simulates mobs and the clock; not the same as the platform `host`         | [`roqueCraftRoom.js`](../src/servicos/roqueCraftRoom.js)                                     |
| `convidado`               | a guest in a room: draws what arrives and sends intents                                              | [`useRoqueCraftMultijogador.js`](../src/composables/useRoqueCraftMultijogador.js)            |
| sucessão (succession)     | choosing the next host player when the current one leaves                                            | `sucessorDoAnfitriao` in [`roqueCraftRoom.js`](../src/servicos/roqueCraftRoom.js)            |
| semeadura (seeding)       | the host writing its own world edits into a new room, in batches of `LOTE_DE_SEMEADURA`              | [`roqueCraftRoom.js`](../src/servicos/roqueCraftRoom.js)                                     |
| `edits`, edições          | the difference between the world and its seed: `[cx, cz, li, id, ...]`                               | [`chunkStore.js`](../src/servicos/chunkStore.js), [`edicoes.js`](../src/servicos/edicoes.js) |
| `li`                      | the local index of a block inside its chunk column, Y contiguous                                     | [`constants.js`](../src/servicos/constants.js)                                               |
| chunk, seção (section)    | a 16 × height × 16 column of blocks; a section is the 16³ piece that is meshed                       | [`constants.js`](../src/servicos/constants.js)                                               |
| dimensão (dimension)      | `overworld`, `nether` or `end`, each with its own heights, sea and ceiling                           | [`dimensoes.js`](../src/servicos/dimensoes.js)                                               |
| `outrasDimensoes`         | the edits of the dimensions the player is not in, in the save                                        | [`roqueCraftSave.js`](../src/servicos/roqueCraftSave.js)                                     |
| `mobilia` (furniture)     | chests, furnaces and potion stands with what they hold                                               | [`mobilia.js`](../src/servicos/mobilia.js)                                                   |
| `_a`                      | the wrapper `{ _a: [...] }` for a list directly inside another list in the save (v13)                | [`documentoDoSave.js`](../src/servicos/documentoDoSave.js)                                   |
| RC-02                     | the rule that a failed save read never writes over the world                                         | [`cargaDoSave.js`](../src/servicos/cargaDoSave.js)                                           |
| `CARGA`                   | the four load states: `NAO_TENTOU`, `CARREGADO`, `VAZIO`, `INDISPONIVEL`                             | [`cargaDoSave.js`](../src/servicos/cargaDoSave.js)                                           |
| perfil de qualidade       | `ultra`, `high`, `medium`, `low`: what the renderer turns on                                         | [`render/engine.js`](../src/servicos/render/engine.js)                                       |
| modo leve                 | the host's `desempenho.modoLeve()`: starts quality at `low`                                          | [`render/engine.js`](../src/servicos/render/engine.js)                                       |
| aldeão (villager)         | the NPC that trades and talks, through `ia` or local lines                                           | [`npc.js`](../src/servicos/npc.js), [`falaDoNpc.js`](../src/servicos/falaDoNpc.js)           |
| sonda (probe)             | a browser or Node script in `qa/` that opens the game and measures one thing                         | [`qa/README.md`](../qa/README.md)                                                            |
| varredura (sweep)         | running every probe and writing the result to `qa/qa-roquecraft-varredura.json`                      | [`qa/qa-sondas.mjs`](../qa/qa-sondas.mjs)                                                    |
| humana                    | a probe that exists for the eye and is not judged by exit code                                       | [`qa/qa-roquecraft-manifesto.json`](../qa/qa-roquecraft-manifesto.json)                      |
| régua (ruler)             | a test that measures the repo itself (age of the sweep, the mesher, tables), not game behaviour      | [`test/arquitetura/`](../test/arquitetura/)                                                  |
| ledger                    | a versioned measurement file a test reads: the sweep and `qa/bench-mesher.json`                      | [`qa/bench-mesher.mjs`](../qa/bench-mesher.mjs)                                              |
| dublê do three            | the stand-in for three.js the tests use, since jsdom has no WebGL                                    | [`test/threeStub.js`](../test/threeStub.js)                                                  |
| host falso                | the SDK's fake host, which records every call in `host.chamadas`                                     | `@roqueos-games/jogo-sdk/host-falso`                                                         |
| gancho de QA              | `window.__roquecraft`, the probe surface, only in E2E mode                                           | [`ganchoDeQA.js`](../src/servicos/ganchoDeQA.js)                                             |
| modo E2E                  | the page with `window.__ROS_E2E__` set: QA hook on, no save                                          | `emModoE2E` from the SDK                                                                     |
| `it.fails`                | a Vitest test that pins a known defect: it passes while the defect exists                            | [TESTING.md](TESTING.md)                                                                     |
| `jogo check`              | the SDK command that checks a game repo against the RoqueOS contract                                 | `yarn jogo:check`                                                                            |
| fiação (wiring)           | what the `.vue` component is allowed to contain: connecting services and composables                 | [ARCHITECTURE.md](ARCHITECTURE.md#5-where-each-thing-is-born)                                |
