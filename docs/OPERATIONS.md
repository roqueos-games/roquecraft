# Operations

_English | [Português](pt-BR/OPERACAO.md)_

> **For whom:** the maintainer, and whoever prepares a release for RoqueOS to pin.
> **What is here:** the maintenance routine, how a version is released, how to update without breaking, how to undo, where the data lives and what to watch.
> **Where to go for the rest:** symptoms and fixes in [WHEN-IT-BREAKS.md](WHEN-IT-BREAKS.md); the gate in [TESTING.md](TESTING.md).

## Summary

1. [The routine](#1-the-routine)
2. [Releasing a version](#2-releasing-a-version)
3. [Updating without breaking](#3-updating-without-breaking)
4. [Undoing](#4-undoing)
5. [Backup and restore](#5-backup-and-restore)
6. [What to watch](#6-what-to-watch)

## 1. The routine

There is no server and no schedule: the game is a package that RoqueOS installs. The maintenance
routine is written in [`.claude/loop.md`](../.claude/loop.md), one thing per iteration, stopping at
the first that has work:

1. red gate: `roqueos-gate` (the `yarn verificar`);
2. red CI on GitHub: `gh run list --limit 3`;
3. an outside issue or pull request with no answer: `gh issue list`, `gh pr list`;
4. an asset with no origin in `ASSETS.md`;
5. the SDK behind: a new `jogo-sdk` tag with a capability the game uses becomes a bump;
6. documentation drift between README, CONTRIBUTING and `jogo.json`.

Two freshness rules live in the gate and expire by date, not by change: the probe sweep and the
mesher ledger must be at most 21 days old. Refreshing them is part of the routine:

```bash
node qa/lib/preparar-dist.mjs
node qa/qa-sondas.mjs
node qa/bench-mesher.mjs --ledger
```

The sweep takes about an hour ([`qa/qa-sondas.mjs`](../qa/qa-sondas.mjs)) and needs the
Playwright browsers. Commit the rewritten `qa/qa-roquecraft-varredura.json` and `qa/bench-mesher.json`.

## 2. Releasing a version

There is no release script in this repo. What the history shows (the tags `v0.1.1` to `v0.1.3` on
GitHub, the sections of [`CHANGELOG.md`](../CHANGELOG.md) and the RoqueOS pin) is this order:

```bash
yarn verificar
# bump "version" in package.json and write the CHANGELOG section
git commit -am "..."
git tag v0.1.4
git push origin v0.1.4
```

Then, in `roqueos-front`, the pin `"@roqueos-games/roquecraft": "github:roqueos-games/roquecraft#v<version>"`
is bumped and reviewed. Nothing here reaches players until that bump. `v0.1.4` above is an
example. On 18/11/2026 `package.json` says 0.1.3 and the last CHANGELOG section is 0.1.2: the 0.1.3
release (the new cover and icon) has no CHANGELOG section.

Visible changes do not close without the game actually open (`yarn dev`) and a screenshot; GPU
changes only with evidence on a real iPhone ([`CLAUDE.md`](../CLAUDE.md)).

## 3. Updating without breaking

- **The SDK.** `@roqueos-games/jogo-sdk` is pinned by tag in `package.json`. A bump goes with
  `yarn verificar` green and the CHANGELOG saying what changed.
- **three.js.** Do not change the `three` version: the one in `devDependencies` is the one RoqueOS
  installs, so tests and `yarn dev` see what the player sees.
- **The room.** Node names and fields do not change; an older RoqueOS may be on the other side.
- **The save.** A new field is added with a default in `parseSave`, so older saves still open. A
  change of format bumps `version` and keeps reading the previous ones, as v13 keeps reading v12.
- **Block ids.** Never renumber an existing id; a new block goes at the end
  ([`src/servicos/blocks.js`](../src/servicos/blocks.js)). Ids are written in the save and in the
  room's `blocks` diffs.

## 4. Undoing

| Step                           | How to undo                                                                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| a bad tag pinned in RoqueOS    | pin the previous tag back in `roqueos-front`; the tags here stay                                            |
| a bad commit on `main`         | `git revert <sha>` and a new tag; never rewrite a published tag                                             |
| a save written in a new format | not reversible from here: players' documents already carry it. Keep `parseSave` reading every older version |
| a renumbered block id          | not reversible: saved worlds and room diffs point to the old number                                         |
| a regenerated texture          | run the generator again from the previous version of the generator; never edit the PNG                      |

## 5. Backup and restore

The repo has no data of its own to back up: the code and assets are on GitHub. Players' worlds live
on the host side, through `progresso` (in RoqueOS, the player's account; in `yarn dev`, the
browser's `localStorage`). The game never deletes a save, and a failed read never writes over it
(RC-02, [`src/servicos/cargaDoSave.js`](../src/servicos/cargaDoSave.js)). Backup of the accounts is
RoqueOS's responsibility, not this repo's.

## 6. What to watch

| Signal           | Healthy                              | Where                             |
| ---------------- | ------------------------------------ | --------------------------------- |
| `yarn verificar` | exits 0                              | the maintainer's machine          |
| CI `verificar`   | green on `main` and on pull requests | `gh run list --limit 3`           |
| probe sweep      | at most 21 days old, no red probe    | `qa/qa-roquecraft-varredura.json` |
| mesher ledger    | at most 21 days old, not slower      | `qa/bench-mesher.json`            |
| `jogo check`     | `ok, o repo cumpre o contrato.`      | `yarn jogo:check`                 |

Measured on 18/11/2026: the sweep is from 30/09/2026 (103 green, 4 human) and the mesher ledger
from 30/09/2026 (1.005 ms per section on an Apple M5 Max), so both freshness rules are red.
