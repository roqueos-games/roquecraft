# Contributing

_English | [Português](docs/pt-BR/CONTRIBUTING.md)_

> **For whom:** anyone who wants to fix or add something to RoqueCraft, maintainers included.
> **What is here:** the steps from issue to pull request, what must not change, the languages, and the conduct.
> **Where to go for the rest:** where each piece goes in [docs/EXTENDING.md](docs/EXTENDING.md); the gate in [docs/TESTING.md](docs/TESTING.md).

Thank you for wanting to help. The bar is the same for everyone, maintainers included.

## Steps

1. Open an issue before changing a game rule or what the player sees. A small fix can go straight
   to the pull request.
2. Fork, create a branch and run `yarn install --ignore-scripts`.
3. Every fix comes with a test that fails without it. A test that passes with and without the
   change proves nothing.
4. New text goes into all ten `i18n/*.json`, with the same keys. `jogo check` fails if a language
   is missing.
5. A new file in `public/` needs a line in [ASSETS.md](ASSETS.md) with the licence and the origin.
   An asset without a clear origin does not go in.
6. Run `yarn verificar` before opening the pull request. It is the same as CI.

```bash
yarn install --ignore-scripts
yarn verificar
```

## What does not change

Do not change the room nodes and fields (`meta`, `players/{uid}`, `blocks`, `mobs`, `relogio`,
`mobilia`, `hits`, `chat`): on the other side of the room there may be a RoqueOS with the previous
version of the game. Nor the save format without a migration: the world of whoever already plays is
in it. RoqueCraft stores nothing in the device's storage and sends no metrics events; starting to
store or to send is a new decision, with an issue first. The full list is in
[docs/DECISIONS.md](docs/DECISIONS.md).

## Languages

Code, comments and commit messages are in Brazilian Portuguese. Issues and pull requests in English
are welcome.

## Conduct

Criticize the code, never the person. Harassment, insults and exposing someone's personal data get
the person removed from the project. To report, use the contact in [SECURITY.md](SECURITY.md); the
full code is in [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
