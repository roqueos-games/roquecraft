# Integrations

_English | [Português](pt-BR/INTEGRACOES.md)_

> **For whom:** whoever works on the RoqueOS side of the game (the host, the catalog, the pin), or on a QA harness that drives the game.
> **What is here:** every surface through which another system talks to RoqueCraft: the `mount` contract, the capabilities, the manifest, the room, the save, the E2E hook and the pin.
> **Where to go for the rest:** how the game is built inside in [ARCHITECTURE.md](ARCHITECTURE.md); what must never change in [DECISIONS.md](DECISIONS.md).

## Summary

1. [The mount contract](#1-the-mount-contract)
2. [Capabilities the game uses](#2-capabilities-the-game-uses)
3. [The room (salaAoVivo)](#3-the-room-salaaovivo)
4. [The save (progresso)](#4-the-save-progresso)
5. [The manifest jogo.json](#5-the-manifest-jogojson)
6. [The QA hook](#6-the-qa-hook)
7. [How RoqueOS installs the game](#7-how-roqueos-installs-the-game)

## 1. The mount contract

[`src/index.js`](../src/index.js) exports `definirJogo({ id: 'roquecraft', capacidades, montar })`
from `@roqueos-games/jogo-sdk`. The host calls `jogo.mount(el, host, { ativo })`; the SDK checks
the host first and refuses, with the list of what is missing, a host that does not fulfil the
contract. `montar` creates a Vue app of its own inside `el` and returns `{ ativar, desmontar }`.
The development page does exactly what RoqueOS does:

```js
import { criarHostDeDesenvolvimento } from '@roqueos-games/jogo-sdk/host-de-desenvolvimento'
import jogo from '../src/index.js'

const host = criarHostDeDesenvolvimento({ jogoId: jogo.id })
const montagem = jogo.mount(document.getElementById('jogo'), host, { ativo: true })
window.addEventListener('focus', () => montagem.ativar(true))
window.addEventListener('blur', () => montagem.ativar(false))
```

That is a shortened [`dev/main.js`](../dev/main.js), which also mirrors notices into a fake
`__rosStore` tray for the probes.

## 2. Capabilities the game uses

| Capability   | Required | What the game does with it                                                                    | Where                                                               |
| ------------ | -------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `salaAoVivo` | yes      | the real-time room: create, join, read, write, observe, presence drop                         | [`roqueCraftRoom.js`](../src/servicos/roqueCraftRoom.js)            |
| `progresso`  | yes      | the world saved on the account: `disponivel`, `carregar`, `salvar`                            | [`roqueCraftSave.js`](../src/servicos/roqueCraftSave.js)            |
| `teclado`    | if there | the active window claims the keyboard while no game screen is open                            | [`src/servicos/teclado.js`](../src/servicos/teclado.js)             |
| `ia`         | if there | the villager's conversation: `disponivel()` before asking, `completar` for the text           | [`falaDoRoqueOS.js`](../src/servicos/falaDoRoqueOS.js)              |
| `avisar`     | always   | notices to the player, with the contract types `info`, `sucesso`, `aviso`, `erro`, and `fixo` | [`src/avisos.js`](../src/avisos.js)                                 |
| `idioma`     | always   | `atual()` and `aoMudar`: the texts reload and the latest change wins                          | [`src/index.js`](../src/index.js)                                   |
| `desempenho` | always   | `modoLeve()` makes the quality profile start at `low`                                         | [`src/servicos/render/engine.js`](../src/servicos/render/engine.js) |

`salaAoVivo` and `progresso` are declared in `capacidades` because the game is not the game
without them. `teclado` and `ia` are used if the host has them: the comment in `src/index.js`
records that requiring them would break the game where it works without them.

## 3. The room (salaAoVivo)

The node names and fields are the ones from before the extraction, on purpose, because on the
other side there may be an older RoqueOS ([`src/servicos/roqueCraftRoom.js`](../src/servicos/roqueCraftRoom.js)):

| Node                 | Who writes        | What it is                                                                                                       |
| -------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| `meta`               | the host and game | `seed` and `mode` (from the game); `host`, `hostName`, `createdAt` (from the host); `host` changes on succession |
| `players/{uid}`      | each player       | name, skin, action, position, health, held item, time; presence about 10 Hz                                      |
| `blocks/{chunk}/{i}` | everyone          | the block that changed; whoever creates the room seeds its world edits in batches of 2000                        |
| `mobs`               | the host player   | the snapshot of the mobs (`snap`) and the time                                                                   |
| `relogio`            | the host player   | the time of day (`ticks`) and forced rain                                                                        |
| `mobilia/{chave}`    | everyone          | chests, furnaces and potion stands, in the save format                                                           |
| `hits/{chave}`       | the guests        | the intent of a hit (`m`, `d`, `by`), which the host applies and deletes                                         |
| `chat/{chave}`       | everyone          | `uid`, `name`, `text`, time; the screen shows the last 60, at most 160 characters each                           |

The chunk key is `${cx}_${cz}` (`chunkPath`). Without an account the host refuses with
`.codigo = 'sem-conta'` and the lobby says the player must sign in. In RoqueOS this lives on the
Realtime Database node `roquecraftRooms/<code>`, behind the host; the game never sees the database.

## 4. The save (progresso)

`criarSaveDoRoqueCraft(progresso)` returns `disponivel`, `saveRoqueCraft(payload)` and
`loadRoqueCraft()`. Saving replaces the whole document (no `mesclar`); a refusal from the host
throws (`o host recusou o save do RoqueCraft (veja o aviso do host no console)`), which sends the
failure to the autosave's `aoFalhar` instead of counting it as saved. Loading returns the document
already passed through `parseSave`, `null` when there is none, and rejects when it cannot read,
which is what RC-02 needs. The fields are in [ARCHITECTURE.md](ARCHITECTURE.md#7-data-and-contracts)
and in [REFERENCE.md](REFERENCE.md#5-the-save-document).

## 5. The manifest jogo.json

[`jogo.json`](../jogo.json) is what RoqueOS reads for the catalog: `id` and `slug` (`roquecraft`),
`versaoDoContrato` 1, the name and description in ten languages, SEO text in pt-BR and en-US,
`etiquetas`, `capa` and `icone` (paths under `public/`), `brilho`, the window size, `aceitaConvite:
true`, `entraNoPodio: false`, `recorde: null` and `capacidades: ["salaAoVivo", "progresso"]`.
`jogo check` validates it and fails when `capa` or `icone` points to a file that does not exist.

## 6. The QA hook

`window.__roquecraft` is installed by [`src/servicos/ganchoDeQA.js`](../src/servicos/ganchoDeQA.js)
only when the SDK says the page is in E2E mode (`window.__ROS_E2E__` set before any script). In
production the function returns on its first line. Two E2E state keys are read by the component:
`roquecraftSeed` (the seed the harness wants) and `roquecraftMenu` (keep the menu open). The probes
in `qa/` and the RoqueOS QA use this hook, so its shape does not change.

## 7. How RoqueOS installs the game

RoqueOS depends on `"@roqueos-games/roquecraft": "github:roqueos-games/roquecraft#v0.1.3"`, with
the commit locked in its lockfile, mounts the game through the SDK `mount` in a window at
`/jogar/roquecraft`, and serves `public/games/roquecraft/` at `/games/roquecraft/`. A change here
reaches RoqueOS only when a new tag is pinned there, after review. RoqueOS compiles the game with
its own Vite; [`vite.config.js`](../vite.config.js) here only serves `yarn dev` and `yarn test`.
