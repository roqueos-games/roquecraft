# RoqueCraft documentation

_English | [Português](pt-BR/INDEX.md)_

> **For whom:** anyone arriving at the repo with a question.
> **What is here:** the table from what you want to the document that answers it, the diagrams and their sources, and the documents imported from RoqueOS.
> **Where to go for the rest:** the overview is the [README](../README.md).

## Want to... read

| I want to...                                                       | Read                                     |
| ------------------------------------------------------------------ | ---------------------------------------- |
| run the game and the gate for the first time                       | [GETTING-STARTED.md](GETTING-STARTED.md) |
| understand how the engine, rendering, room and save fit together   | [ARCHITECTURE.md](ARCHITECTURE.md)       |
| find a command, script, file, constant or save field               | [REFERENCE.md](REFERENCE.md)             |
| release a version, update without breaking, undo                   | [OPERATIONS.md](OPERATIONS.md)           |
| fix a red gate, a game that does not open, a save or a room        | [WHEN-IT-BREAKS.md](WHEN-IT-BREAKS.md)   |
| know what a Portuguese term in the code means                      | [GLOSSARY.md](GLOSSARY.md)               |
| add a feature, block, item, recipe, text, asset or probe           | [EXTENDING.md](EXTENDING.md)             |
| work on the RoqueOS side: mount, capabilities, room, save, QA hook | [INTEGRATIONS.md](INTEGRATIONS.md)       |
| know what each test suite proves and what it cannot see            | [TESTING.md](TESTING.md)                 |
| know what is decided and must not be reopened                      | [DECISIONS.md](DECISIONS.md)             |
| contribute                                                         | [CONTRIBUTING.md](../CONTRIBUTING.md)    |
| know where each asset comes from                                   | [ASSETS.md](../ASSETS.md)                |
| run or write a QA probe                                            | [qa/README.md](../qa/README.md)          |
| report a vulnerability                                             | [SECURITY.md](../SECURITY.md)            |
| see what changed in each version                                   | [CHANGELOG.md](../CHANGELOG.md)          |

## Diagrams

All diagrams are Mermaid inside the Markdown; the source is the text of the document itself.

| Diagram               | Source and explanation                                             |
| --------------------- | ------------------------------------------------------------------ |
| the parts of the game | [README](../README.md#the-parts)                                   |
| context               | [ARCHITECTURE.md, section 2](ARCHITECTURE.md#2-context)            |
| opening the world     | [ARCHITECTURE.md, section 6](ARCHITECTURE.md#opening-the-world)    |
| autosave              | [ARCHITECTURE.md, section 6](ARCHITECTURE.md#autosave)             |
| room: create and join | [ARCHITECTURE.md, section 6](ARCHITECTURE.md#room-create-and-join) |

## Imported from RoqueOS

The game was born inside `roqueos-front` and was extracted on 26/09/2026. The rule, the plans and
the dev-doc it had there were copied without changing a letter, in Portuguese, with the front's
file paths. They are kept as a record of how the game was thought out, not as live documentation,
and are cited from outside (the RoqueOS rule 36 and the kit's context point here).
[`README.md`](README.md) in this folder explains where each came from and how to translate the paths.

| Document                                                                     | What it is                                            |
| ---------------------------------------------------------------------------- | ----------------------------------------------------- |
| [`regras/44-roquecraft-arquitetura.md`](regras/44-roquecraft-arquitetura.md) | rule 44: where each thing is born                     |
| [`dev-docs/roquecraft-v2.md`](dev-docs/roquecraft-v2.md)                     | the v2 dev-doc, with the shader traps of 19/08/2026   |
| `planos/` (31 files)                                                         | the plans, goals and rounds of the game's development |
