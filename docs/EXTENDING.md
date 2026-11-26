# Extending

_English | [Português](pt-BR/ESTENDER.md)_

> **For whom:** whoever adds something the game was built to receive: a feature, a block, an item, a recipe, a text, an asset or a QA probe.
> **What is here:** where each piece goes, what else has to change with it, and which test or check fails when a step is missing.
> **Where to go for the rest:** the reasons behind the placement in [ARCHITECTURE.md](ARCHITECTURE.md); the contribution steps in [CONTRIBUTING.md](../CONTRIBUTING.md).

## Summary

1. [A feature](#1-a-feature)
2. [A block](#2-a-block)
3. [An item or a recipe](#3-an-item-or-a-recipe)
4. [A text](#4-a-text)
5. [An asset](#5-an-asset)
6. [A QA probe](#6-a-qa-probe)
7. [What enforces each step](#7-what-enforces-each-step)

## 1. A feature

A new feature is born in a service or a composable, never in
[`src/JogoRoqueCraft.vue`](../src/JogoRoqueCraft.vue), which only gains the wiring. Decide by
lifecycle: if it keeps a timer, a subscription or a listener, it is a composable in
`src/composables/useRoqueCraft<Name>.js` with an `encerrar()` called on unmount; if not, it is a
service in `src/servicos/`, even when it is large or only QA uses it. Drawing goes to
`src/servicos/render/`, and that folder only changes with evidence on a real iPhone. Every `let` of
the component that the new module reads enters by getter (`() => world`), never by value
([ARCHITECTURE.md](ARCHITECTURE.md#5-where-each-thing-is-born)).

A pure service gets a spec in `test/servicos/`; a composable, in `test/composables/`. A fix comes
with a test that fails without it.

## 2. A block

Blocks are declared in `BLOCKS` in [`src/servicos/blocks.js`](../src/servicos/blocks.js), each with
a stable numeric id:

```js
{ id: 5, key: 'sand', all: 'sand', hardness: 0.5, tool: 'shovel', gravity: true },
```

1. Add the new block **at the end**, with the next free id. Never renumber an existing id: ids are
   written in saves and in the room's `blocks` diffs.
2. The id must stay below `TABELA_DE_IDS` (512); every per-id table is sized by it, and
   `test/servicos/tabelasPorId.spec.js` fails if a table goes back to a literal.
3. Textures are layers by name (`all`, or `faces` with `top`, `side`, `bottom`). A new texture is
   drawn in [`qa/gen-roquecraft-textures.mjs`](../qa/gen-roquecraft-textures.mjs), then the
   generator is run again; the PNG is never edited by hand.
4. The visible name is the i18n key `blocks.<key>` in all ten `i18n/*.json`.
5. A block that drops itself gets an item of the same name automatically
   ([`src/servicos/items.js`](../src/servicos/items.js)).

## 3. An item or a recipe

Items that are not blocks are declared in [`src/servicos/items.js`](../src/servicos/items.js)
(`MATERIALS` and the tables after it): `kind` is `block`, `tool`, `food` or `material`, and the
key is the same string used in drops and recipes. The icon comes from
[`qa/gen-roquecraft-items.mjs`](../qa/gen-roquecraft-items.mjs).

Recipes are in [`src/servicos/recipes.js`](../src/servicos/recipes.js), pure functions over a slot
array:

```js
shapeless('oakPlanks', 4, ['oakLog'], false),
```

`shaped(result, count, pattern, keyMap, needsTable)` declares rows of characters and a map from
character to item; the matcher trims the smallest occupied rectangle, so one recipe works in any
corner of a 3×3 grid. An item nothing produces is a dead item:
`test/arquitetura/itens-mortos.spec.js` fails when an item in the catalog cannot be reached.

## 4. A text

Every visible string is a key in [`i18n/pt-BR.json`](../i18n/pt-BR.json), the canonical language,
and the same key in the other nine files. The screens read them through the `t` provided by the
component. `jogo check` fails on a missing language, a missing key, an extra key the pt-BR file
does not have, or an empty text.

## 5. An asset

A file in `public/games/roquecraft/` lives at the path the game loads it from
(`/games/roquecraft/...`). It needs a line in [`ASSETS.md`](../ASSETS.md) with path, licence and
origin; the licence must be one of the open list (CC0-1.0, CC-BY-4.0, MIT, BSD-3-Clause or
original). Textures, item icons and art come out of the generators in `qa/` and `arte/`: change the
generator, run it again, commit the output.

## 6. A QA probe

A probe is a script `qa/qa-roquecraft-<name>.mjs` that opens the game against the `dist/pwa`
prepared by `node qa/lib/preparar-dist.mjs` and drives it through `window.__roquecraft`. It exits 0
when what it measured is right. A probe that exists only for the eye goes into the `mostra` list
of [`qa/qa-roquecraft-manifesto.json`](../qa/qa-roquecraft-manifesto.json). After adding it, run
`node qa/qa-sondas.mjs <name>` so the sweep records it.

If the probe needs a new method on the QA hook, add it in a `src/servicos/qaDe<Area>.js` service
and register it in [`src/servicos/ganchoDeQA.js`](../src/servicos/ganchoDeQA.js) without changing
the shape of what is already there.

## 7. What enforces each step

| Step                          | What fails when it is missing                                                                                              |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| block id inside the tables    | `test/servicos/tabelasPorId.spec.js`                                                                                       |
| item reachable                | `test/arquitetura/itens-mortos.spec.js`                                                                                    |
| text in all ten languages     | `yarn jogo:check`, section `textos nos dez idiomas`                                                                        |
| asset with origin and licence | `yarn jogo:check`, section `origem dos assets`                                                                             |
| probe swept                   | `test/arquitetura/sondas-varridas.spec.js`                                                                                 |
| probe with a verdict          | `test/arquitetura/sondas-com-veredito.spec.js`                                                                             |
| no database import            | `yarn jogo:check`, section `o jogo não fala com banco`                                                                     |
| a feature born in the `.vue`  | nothing automatic here; review, and rule 44 ([`regras/44-roquecraft-arquitetura.md`](regras/44-roquecraft-arquitetura.md)) |
