# Reference

_English | [Português](pt-BR/REFERENCIA.md)_

> **For whom:** whoever needs the exact name of a command, file, constant or field.
> **What is here:** the commands, the QA and generator scripts, the files and folders, the constants that matter, the save document field by field, and the environment variables.
> **Where to go for the rest:** why things are this way in [ARCHITECTURE.md](ARCHITECTURE.md); the room nodes in [INTEGRATIONS.md](INTEGRATIONS.md#3-the-room-salaaovivo).

## Summary

1. [Commands](#1-commands)
2. [QA and generator scripts](#2-qa-and-generator-scripts)
3. [Files and folders](#3-files-and-folders)
4. [Constants and settings](#4-constants-and-settings)
5. [The save document](#5-the-save-document)
6. [Environment variables](#6-environment-variables)

## 1. Commands

All from [`package.json`](../package.json), Yarn 1.22, run at the repo root.

| Command                         | What it does                                                                                    | Exit code                      |
| ------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------ |
| `yarn install --ignore-scripts` | installs exactly what the lockfile says, with no install scripts                                | 0 when installed               |
| `yarn dev`                      | Vite serving `index.html` and `dev/main.js` with the development host                           | runs until stopped             |
| `yarn test`                     | `vitest run`, every `test/**/*.spec.js` in jsdom                                                | 1 when any test fails          |
| `yarn lint`                     | `eslint .` with [`eslint.config.js`](../eslint.config.js)                                       | 1 on any error                 |
| `yarn format`                   | `prettier --write .`                                                                            | 0                              |
| `yarn format:check`             | `prettier --check .`, honouring [`.prettierignore`](../.prettierignore)                         | 1 when a file is not formatted |
| `yarn jogo:check`               | `jogo check` from the SDK: install scripts, manifest, ten languages, asset origins, no database | 1 with `REPROVOU` on a section |
| `yarn verificar`                | lint, format check, tests and `jogo check`, in this order                                       | the first failure stops it     |

## 2. QA and generator scripts

| Script                                | Input                                                              | Output                                                                           |
| ------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `node qa/lib/preparar-dist.mjs`       | the repo                                                           | `dist/pwa` with the dev page and a fake `app.html`; prints the Worker chunk name |
| `node qa/qa-sondas.mjs [filter ...]`  | the probes listed in `qa/`                                         | rewrites `qa/qa-roquecraft-varredura.json`                                       |
| `node qa/bench-mesher.mjs`            | the engine in `src/servicos/`                                      | prints the cost of meshing a section                                             |
| `node qa/bench-mesher.mjs --ledger`   | same                                                               | also appends the measurement to `qa/bench-mesher.json`                           |
| `node qa/qa-roquecraft-<name>.mjs`    | a running `dist/pwa`                                               | photos and reports in `scripts/.qa-<name>/` (git-ignored)                        |
| `node qa/gen-roquecraft-textures.mjs` | nothing; procedural                                                | `public/games/roquecraft/tex/` albedo, normal, MER, items and `manifest.json`    |
| `node qa/gen-roquecraft-items.mjs`    | nothing; drawn by recipe                                           | item icons                                                                       |
| `node qa/gen-roquecraft-art.mjs`      | [`arte/manifesto.json`](../arte/manifesto.json) and `arte/fontes/` | checks the exported cover, icon and menu art                                     |

The probes and generators came from the RoqueOS `scripts/` folder; their usage lines still say
`node scripts/...`, which here is `node qa/...` ([`qa/README.md`](../qa/README.md)).
`qa/gen-roquecraft-i18n.mjs` still writes the front's path (`src/i18n/<lang>/roqueCraft.js`), not
`i18n/*.json`.

## 3. Files and folders

| Path                                     | Who writes                          | Who reads                                         |
| ---------------------------------------- | ----------------------------------- | ------------------------------------------------- |
| `src/`                                   | developers                          | RoqueOS's Vite, `yarn dev`, Vitest                |
| `i18n/<lang>.json`                       | developers, same keys in all ten    | [`src/textos.js`](../src/textos.js), `jogo check` |
| `public/games/roquecraft/`               | the generators in `qa/`             | the game at `/games/roquecraft/`                  |
| `public/capa.jpg`, `public/icone.svg`    | the art pipeline (`arte/`)          | `jogo.json`, the catalog, this README             |
| `ASSETS.md`                              | whoever adds a file to `public/`    | `jogo check`                                      |
| `jogo.json`                              | developers                          | RoqueOS, `jogo check`                             |
| `qa/qa-roquecraft-varredura.json`        | `qa/qa-sondas.mjs`                  | `test/arquitetura/sondas-varridas.spec.js`        |
| `qa/qa-roquecraft-manifesto.json`        | developers                          | `qa-sondas.mjs`, `sondas-com-veredito.spec.js`    |
| `qa/bench-mesher.json`                   | `qa/bench-mesher.mjs --ledger`      | `test/arquitetura/mesher-medido.spec.js`          |
| `test/arquitetura/altura-cravada.json`   | developers                          | `altura-cravada.spec.js`                          |
| `docs/docs.json`, `docs/.docs-hash.json` | developers, `roqueos-docs --update` | `roqueos-docs`                                    |
| `CHANGELOG.md`                           | whoever releases                    | reviewers, RoqueOS when bumping the pin           |

## 4. Constants and settings

| Name                 | Value                            | Effect                                             | Where                                                                             |
| -------------------- | -------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------- |
| `CHUNK_SIZE`         | 16                               | width and depth of a chunk                         | [`constants.js`](../src/servicos/constants.js)                                    |
| `SECTION_HEIGHT`     | 16                               | height of a meshed section                         | [`dimensoes.js`](../src/servicos/dimensoes.js)                                    |
| overworld `altura`   | 128 (eight sections)             | world height of the default dimension              | [`dimensoes.js`](../src/servicos/dimensoes.js)                                    |
| `TABELA_DE_IDS`      | 512                              | size of every per-id lookup table                  | [`blocks.js`](../src/servicos/blocks.js)                                          |
| `ESPERA_DO_AUTOSAVE` | 2500 ms                          | delay after the last change before saving          | [`useRoqueCraftPersistencia.js`](../src/composables/useRoqueCraftPersistencia.js) |
| `MAX_SAVED_EDITS`    | 60000                            | ceiling on saved edits                             | [`roqueCraftSave.js`](../src/servicos/roqueCraftSave.js)                          |
| `GERADOR_ATUAL`      | 1                                | `generatorVersion` of new worlds                   | [`roqueCraftSave.js`](../src/servicos/roqueCraftSave.js)                          |
| `LOTE_DE_SEMEADURA`  | 2000                             | edits per batch when seeding a new room            | [`roqueCraftRoom.js`](../src/servicos/roqueCraftRoom.js)                          |
| `CHAT_LIMIT`         | 60                               | chat messages shown                                | [`roqueCraftRoom.js`](../src/servicos/roqueCraftRoom.js)                          |
| `MAX_CHAT_LEN`       | 160                              | characters per chat message                        | [`roqueCraftRoom.js`](../src/servicos/roqueCraftRoom.js)                          |
| `renderDistance`     | 3 to 16                          | render distance limits in the options screen       | [`ajustes.js`](../src/servicos/ajustes.js)                                        |
| `fov`                | 55 to 100, 78 on phone           | field of view                                      | [`ajustes.js`](../src/servicos/ajustes.js)                                        |
| quality profiles     | `ultra`, `high`, `medium`, `low` | `detectQuality` picks one; `modoLeve` forces `low` | [`render/engine.js`](../src/servicos/render/engine.js)                            |
| `FOLGA_DIAS`         | 21                               | maximum age of the probe sweep                     | [`sondas-varridas.spec.js`](../test/arquitetura/sondas-varridas.spec.js)          |
| `testTimeout`        | 15000 ms                         | global test ceiling                                | [`vite.config.js`](../vite.config.js)                                             |

## 5. The save document

Version 13, built by `buildSavePayload` and read by `parseSave` in
[`src/servicos/roqueCraftSave.js`](../src/servicos/roqueCraftSave.js). Every list directly inside
another list is written as `{ _a: [...] }` ([`documentoDoSave.js`](../src/servicos/documentoDoSave.js)).

| Field              | Type                         | Default when missing on read       |
| ------------------ | ---------------------------- | ---------------------------------- |
| `version`          | number, 13 on write          | 1                                  |
| `worldId`          | string                       | `w<seed>`                          |
| `dimensionId`      | string                       | `overworld`                        |
| `generatorVersion` | number                       | 1                                  |
| `seed`             | number                       | 1                                  |
| `mode`             | `survival` or `creative`     | `survival`                         |
| `edits`            | flat `[cx, cz, li, id, ...]` | empty                              |
| `outrasDimensoes`  | `[id, edits]` pairs          | empty                              |
| `player`           | `{ x, y, z, yaw, pitch }`    | `null`, spawn where the world says |
| `inventory`        | serialized inventory         | empty                              |
| `survival`         | health, hunger, breath       | defaults of `deserializeSurvival`  |
| `efeitos`          | potion effects or `null`     | none, with the duration capped     |
| `ticks`            | time of day                  | 1000                               |
| `hotbar`           | 0 to 8                       | 0                                  |
| `settings`         | the options screen values    | `null`                             |
| `mobilia`          | furniture with contents      | empty                              |
| `renascimento`     | bed spawn `{ x, y, z }`      | `null`                             |
| `dragaoMorto`      | boolean                      | `false`                            |
| `drops`            | items on the ground          | empty                              |
| `mobs`             | the herd, villagers included | empty; the world repopulates       |
| `updatedAt`        | `Date.now()`                 | not read                           |

## 6. Environment variables

| Variable               | Default | Effect                                                                       | Where                               |
| ---------------------- | ------- | ---------------------------------------------------------------------------- | ----------------------------------- |
| `VITEST_INSTRUMENTADO` | unset   | raises `TETO_DE_MUNDO` from 60 s to 240 s and `TETO_LENTO` from 20 s to 60 s | [`test/tetos.js`](../test/tetos.js) |

The game itself reads no environment variable. E2E mode comes from `window.__ROS_E2E__` on the page,
not from the environment ([INTEGRATIONS.md](INTEGRATIONS.md#6-the-qa-hook)).
