# When it breaks

_English | [Português](pt-BR/QUANDO-QUEBRA.md)_

> **For whom:** whoever has a red gate, a game that does not open, a world that does not save or a room that does not connect.
> **What is here:** a first diagnostic command, then by area a table of what appears, the cause and what to do, with the literal message. Failures that already happened carry the date.
> **Where to go for the rest:** what each suite proves in [TESTING.md](TESTING.md); the routine that keeps the gate green in [OPERATIONS.md](OPERATIONS.md).

The messages are quoted as the program prints them, in Portuguese when the program writes
Portuguese. Console messages start with `[RoqueCraft]`.

## Summary

1. [First diagnosis](#1-first-diagnosis)
2. [Install](#2-install)
3. [The gate](#3-the-gate)
4. [The game in the browser](#4-the-game-in-the-browser)
5. [Save](#5-save)
6. [Room](#6-room)
7. [QA probes](#7-qa-probes)

## 1. First diagnosis

```bash
yarn lint; yarn format:check; yarn jogo:check; yarn test 2>&1 | grep -E "FAIL|AssertionError" | head -20
```

Running the four steps separately shows which one fails; `yarn verificar` stops at the first. In
the browser, open the console and filter by `[RoqueCraft]`.

## 2. Install

| What appears                                                                                | Cause                                                     | What to do                                                         |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------ |
| yarn fails fetching `jogo-sdk`                                                              | the SDK comes from `github:roqueos-games/jogo-sdk#v0.3.0` | check access to GitHub; the repo is public                         |
| `package.json declara "<script>", que roda sozinho no install de quem depende deste pacote` | an install-time script was added to `package.json`        | remove it; RoqueOS installs the game and nothing may run by itself |
| a `node` version error                                                                      | Node below 22                                             | use the version in `.nvmrc` (24)                                   |

## 3. The gate

| What appears                                                                                                            | Cause                                                                                                                                               | What to do                                                                     |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `a última varredura foi há 50 dias (folga: 21). Rode node qa/qa-sondas.mjs — leva ~1 h.`                                | the committed sweep is from 30/09/2026; red since 21/10/2026, seen on 18/11/2026                                                                    | `node qa/lib/preparar-dist.mjs`, then `node qa/qa-sondas.mjs`, commit the JSON |
| `a última medição foi há 50 dias (folga: 21). Rode node qa/bench-mesher.mjs --ledger`                                   | the mesher ledger is from 30/09/2026; seen on 18/11/2026                                                                                            | `node qa/bench-mesher.mjs --ledger` and commit `qa/bench-mesher.json`          |
| `expected 54.30237100000022 to be less than 40` in `perf.spec.js` (`malha um chunk inteiro em tempo de frame`)          | wall-clock ceiling on a slower or busy machine; seen on 18/11/2026 in a Linux container, with the ceiling of 14 ms for chunk generation failing too | run it alone on a quiet machine; never loosen the ceiling to make it pass      |
| `i18n/<lang>.json sem: <keys>`                                                                                          | a text key added to some languages and not to all ten                                                                                               | add the key to every `i18n/*.json`                                             |
| `<file> sem linha no ASSETS.md (caminho \| licença \| origem)`                                                          | a new file in `public/` with no line in `ASSETS.md`                                                                                                 | add the line with licence and origin                                           |
| `<file>:<line> importa "firebase": o jogo não fala com banco, quem fala é o host (salaAoVivo, progresso, placar, sala)` | code under `src/` imports Firebase                                                                                                                  | go through `salaAoVivo` or `progresso`                                         |
| `Code style issues found` from Prettier                                                                                 | a formatted file changed by hand                                                                                                                    | `yarn format`, except under `src/servicos/render/`, which is ignored           |
| an `it.fails` test reported as failed                                                                                   | the defect it pins was fixed                                                                                                                        | turn `it.fails` into `it` in the same commit as the fix                        |

## 4. The game in the browser

| What appears                                                                                                 | Cause                                                            | What to do                                                                           |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| "RoqueCraft could not start" with "Try again"; console `[RoqueCraft] init falhou:`                           | the engine could not start, usually no WebGL context             | try another browser or close other 3D tabs, then "Try again"                         |
| "The GPU dropped the game context. Close other 3D windows and try again."                                    | the WebGL context was lost                                       | close other 3D windows and retry                                                     |
| "Could not change quality"; console `[RoqueCraft] troca de qualidade falhou:`                                | the engine failed to be recreated with the new profile           | go back to the previous quality; report with the console output                      |
| console `[RoqueCraft] sem Web Worker, modo inline:` or `[RoqueCraft] worker falhou, caindo pro modo inline:` | the Worker did not start (old browser, CSP, tests)               | the game keeps running, slower to load; check the Worker URL pattern was not changed |
| `[roquecraft] host não cumpre o contrato: ...`                                                               | the host lacks `salaAoVivo` or `progresso`, or has a wrong shape | fix the host; the list after the colon says what is missing                          |
| the window does not open and the console shows `TypeError: "<shader>" is not a function`                     | a backtick inside a GLSL template string, 19/08/2026             | see [`dev-docs/roquecraft-v2.md`](dev-docs/roquecraft-v2.md)                         |
| the world does not appear while draw calls keep counting                                                     | a GLSL compile error does not stop the page, 19/08/2026          | look for `Shader Error` or `not compiled` in the console                             |

## 5. Save

| What appears                                                                                                         | Cause                                                                        | What to do                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| fixed notice "Couldn't read your saved world. It's still stored — the game won't overwrite it. Reload to try again." | the host rejected `progresso.carregar()` (RC-02)                             | reload; the saved world is untouched and nothing is written over it                                                       |
| console `[RoqueCraft] falha ao salvar:` with `o host recusou o save do RoqueCraft (veja o aviso do host no console)` | the host refused `salvar`                                                    | read the host's notice in the console                                                                                     |
| `Nested arrays are not supported` from Firestore                                                                     | a save with a list inside a list; the v12 format, fixed in v13 on 30/09/2026 | make sure the payload passes through `semListaDentroDeLista` ([`documentoDoSave.js`](../src/servicos/documentoDoSave.js)) |
| the world does not save inside a room                                                                                | by design: the world belongs to the room's host                              | nothing; it saves again outside the room                                                                                  |
| the world does not save in `yarn dev` with E2E mode                                                                  | by design: E2E never saves                                                   | nothing                                                                                                                   |

## 6. Room

| What appears                                                                        | Cause                                                 | What to do                                                   |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------ |
| "Sign in to play online with friends."                                              | no account: the host refused with `sem-conta`         | sign in on RoqueOS                                           |
| "Room not found. Check the code."                                                   | the code does not match a room                        | check the code                                               |
| "Could not connect. Try again."; console `[RoqueCraft] entrar na sala falhou:`      | joining failed at the host                            | try again; read the error after the colon                    |
| console `[RoqueCraft] criar sala falhou:` with `a semeadura de <code> foi recusada` | the host refused a batch of seeded edits              | check the host's room rules for `blocks`                     |
| the host left and nobody became host                                                | known limit: presence stays when the connection drops | none yet; pinned by `it.fails` in `salaComHostFalso.spec.js` |
| in `yarn dev`, the second tab is the same player                                    | the tab was duplicated                                | open the invite link in a new tab instead                    |

## 7. QA probes

| What appears                                                        | Cause                                                                 | What to do                                     |
| ------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------- |
| a probe waits forever for `window.__rosStore`                       | `dist/pwa` was not prepared from this repo                            | `node qa/lib/preparar-dist.mjs` first          |
| `qa-roquecraft-cachoeira`, `-ceu`, `-malha`, `-mobs` fail on import | they read the engine from the front's path `src/services/roquecraft/` | known; see [`qa/README.md`](../qa/README.md)   |
| `qa-roquecraft-prod` and `-prod-mobile` measure something else      | they target the published RoqueOS                                     | expected                                       |
| a probe marked `nao-rodou`                                          | the browser it needs is not installed                                 | install the Playwright browser the sweep names |
