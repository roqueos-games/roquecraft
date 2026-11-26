# Getting started

_English | [Português](pt-BR/COMECAR.md)_

> **For whom:** whoever clones the repo for the first time and wants the game running and the gate green.
> **What is here:** the prerequisites with the command that checks each one, every step with what it does and how to know it worked, and the first-time errors.
> **Where to go for the rest:** every command in [REFERENCE.md](REFERENCE.md); what each failure means in [WHEN-IT-BREAKS.md](WHEN-IT-BREAKS.md).

## Summary

1. [Prerequisites](#1-prerequisites)
2. [Install](#2-install)
3. [Run the game](#3-run-the-game)
4. [Play in a room between two tabs](#4-play-in-a-room-between-two-tabs)
5. [Run the gate](#5-run-the-gate)
6. [First-time errors](#6-first-time-errors)

## 1. Prerequisites

| Tool    | Version                                                 | Check            |
| ------- | ------------------------------------------------------- | ---------------- |
| Node    | 24 per [`.nvmrc`](../.nvmrc), 22 at minimum (`engines`) | `node -v`        |
| Yarn    | 1.22 (`packageManager: yarn@1.22.22`)                   | `yarn -v`        |
| git     | any recent                                              | `git --version`  |
| browser | one with WebGL                                          | open the dev URL |

The repo uses Yarn. `npm` is not the package manager here: the lockfile is
[`yarn.lock`](../yarn.lock).

## 2. Install

```bash
git clone https://github.com/roqueos-games/roquecraft.git
cd roquecraft
yarn install --ignore-scripts
```

`--ignore-scripts` is how CI installs too ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)):
nothing runs by itself at install time, and `jogo check` fails a `package.json` that declares an
install script. It worked when yarn ends with `Done in ...` and `node_modules/@roqueos-games/jogo-sdk`
exists (the SDK comes from GitHub, tag `v0.3.0`).

## 3. Run the game

```bash
yarn dev
```

Vite prints a local address. Open it: the page is [`index.html`](../index.html) with
[`dev/main.js`](../dev/main.js), which mounts the game with the SDK development host, exactly the
`mount` RoqueOS calls. You will see the loading texts ("Loading textures...", "Starting the
engine...", "Generating terrain...", "Finding a safe place...") and then the start menu. Click to
play, walk with WASD, break with the left button. The world is saved in the browser's
`localStorage`; reload and it comes back.

The development host has no account and no `ia`, on purpose: the villager answers with local lines
and the text box for talking to him does not appear.

## 4. Play in a room between two tabs

In "Play with friends", create a room in one tab and open its link (the same page with
`?sala=<code>`) in a new tab. Do not duplicate the tab, which becomes the same player. The
development host makes the room between tabs of the same browser through `localStorage` and does
not emulate the database rules.

## 5. Run the gate

```bash
yarn verificar
```

That is `yarn lint && yarn format:check && yarn test && yarn jogo:check`, the same four steps CI
runs and the maintainer's pre-push runs through `roqueos-gate`. It is green when yarn prints `Done`
and the last section ends with `ok, o repo cumpre o contrato.` The test step took 499 s in a Linux
container on 18/11/2026; on that run it was red for reasons that are not yours (see below).

## 6. First-time errors

| What you see                                                                         | What it means                                               |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `a última varredura foi há N dias (folga: 21)`                                       | the committed probe sweep is old; not caused by your change |
| `a última medição foi há N dias (folga: 21). Rode node qa/bench-mesher.mjs --ledger` | the mesher ledger is old                                    |
| `expected <ms> to be less than 40` in `perf.spec.js`                                 | a time ceiling on a slow or busy machine                    |
| a black screen with "RoqueCraft could not start" and "Try again"                     | no WebGL context in this browser                            |

Each one, with the fix, is in [WHEN-IT-BREAKS.md](WHEN-IT-BREAKS.md).
