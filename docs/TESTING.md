# Testing

_English | [Português](pt-BR/TESTES.md)_

> **For whom:** whoever runs the gate, reads a red test, or writes a new one.
> **What is here:** what each suite proves, what it cannot prove, the tests that pin known defects, the time ceilings, and the acceptance criterion.
> **Where to go for the rest:** fixing each red in [WHEN-IT-BREAKS.md](WHEN-IT-BREAKS.md); the probes in [`qa/README.md`](../qa/README.md).

## Summary

1. [The acceptance criterion](#1-the-acceptance-criterion)
2. [The suites](#2-the-suites)
3. [What the tests cannot see](#3-what-the-tests-cannot-see)
4. [Known defects pinned by it.fails](#4-known-defects-pinned-by-itfails)
5. [Time ceilings](#5-time-ceilings)
6. [Measured on 18/11/2026](#6-measured-on-18112026)

## 1. The acceptance criterion

A change is accepted when `yarn verificar` exits 0 on the maintainer's machine and the
`verificar` workflow is green on the pull request ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)).
Every fix comes with a test that fails without it. A visible change also needs the game opened in
`yarn dev` with a screenshot, and a GPU change needs evidence on a real iPhone
([`.claude/loop.md`](../.claude/loop.md), [`CLAUDE.md`](../CLAUDE.md)). A test is never weakened to
make the gate pass.

```bash
yarn verificar
```

## 2. The suites

All suites run with Vitest in jsdom ([`vite.config.js`](../vite.config.js)), with
[`test/preparar.js`](../test/preparar.js) supplying what jsdom lacks (`ResizeObserver`,
`matchMedia`).

| Folder               | What it proves                                                                                                             |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `test/servicos/`     | the engine rules: worldgen, mesher, light, physics, mobs, crafting, redstone, fluids, save, room, perf                     |
| `test/composables/`  | the lifecycle pieces, including the room over the SDK fake host (`salaComHostFalso.spec.js`)                               |
| `test/componentes/`  | the `RC*.vue` screens: focus, keyboard, trade, inventory, creative panel, touch controls                                   |
| `test/multijogador/` | a simulated network speaking the `criarSalaDoRoqueCraft` contract: three and four clients, 150 ms, 1% and 5% loss          |
| `test/arquitetura/`  | rulers on the repo itself: sweep and mesher ledger freshness, dead items, tables by id, single screen, probes with verdict |
| `test/` root         | the whole game mounted through the contract (`jogoRoqueCraft.spec.js`), notices, imported art                              |

`yarn jogo:check` adds the contract checks from the SDK: install scripts, manifest, texts in the
ten languages, asset origins and no database import.

## 3. What the tests cannot see

jsdom has no WebGL, so `three` is replaced by a stand-in ([`test/threeStub.js`](../test/threeStub.js)).
Green says nothing about what is drawn on the GPU: shaders, shadows, water, sky, textures and
quality profiles. The live two-client room against a real database is not automated either; the
probes in `qa/` cover part of the browser behaviour and are swept by hand, about an hour per sweep.

## 4. Known defects pinned by it.fails

A test marked `it.fails` passes while the defect it describes exists, and turns red the moment
the defect is fixed; the mark comes out in the same commit as the fix.

| Test                                                                           | Defect                                                                                                                                                                               |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `o anfitrião com companhia que cai some da sala (e a sucessão pode acontecer)` | when the host's connection drops with people in the room, presence stays and succession does not happen ([`salaComHostFalso.spec.js`](../test/composables/salaComHostFalso.spec.js)) |

The save with nested arrays had three `it.fails` until 0.1.2 (30/09/2026), when save v13 fixed it
and they became `it` ([`CHANGELOG.md`](../CHANGELOG.md)).

## 5. Time ceilings

Time ceilings exist to catch a test that hangs; they do not measure the machine and are never
loosened as a fix. They live in one place, [`test/tetos.js`](../test/tetos.js): `TETO_DE_MUNDO`
(60 s, 240 s with `VITEST_INSTRUMENTADO`) for tests that generate a world, `TETO_LENTO` (20 s, 60 s
instrumented), and the global `testTimeout` of 15 s. The performance budgets in
[`test/servicos/perf.spec.js`](../test/servicos/perf.spec.js) are wall-clock and only assert outside
coverage runs.

## 6. Measured on 18/11/2026

In a Linux container, Node 22.23.5, after `yarn install --frozen-lockfile --ignore-scripts`:
`yarn lint` 0, `yarn format:check` 0, `yarn jogo:check` 0, and `yarn test` 1, with 233 files and
3572 tests, 4 failed, in 499 s:

| Failed test                                                                          | Why                                                |
| ------------------------------------------------------------------------------------ | -------------------------------------------------- |
| `sondas-varridas` > `a varredura não está velha demais para significar alguma coisa` | the sweep is 50 days old, the limit is 21          |
| `mesher-medido` > `existe, é recente, e o mesher não ficou mais lento`               | the mesher ledger is 50 days old, the limit is 21  |
| `perf` > `malha um chunk inteiro em tempo de frame`                                  | 54.3 ms against a ceiling of 40 ms on that machine |
| `perf` > `gerar um chunk é rápido o bastante pro worker`                             | above the 14 ms ceiling on that machine            |

The first two are dates passing, not code; whether the last two also fail on another machine was
not measured.
