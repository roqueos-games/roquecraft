# Documentos que vieram do RoqueOS

O RoqueCraft nasceu dentro do roqueos-front e foi extraído para este repo em 26/09/2026, a
partir do `master` `7ab22a6f`. Os documentos desta pasta são os do front, copiados sem mudar uma
letra (conferido pelo hash do git contra `git rev-parse master:<caminho>`):

| aqui                                   | no roqueos-front                             |
| -------------------------------------- | -------------------------------------------- |
| `regras/44-roquecraft-arquitetura.md`  | `.claude/rules/44-roquecraft-arquitetura.md` |
| `planos/roquecraft-*.md` (25 arquivos) | `.claude/plans/roquecraft-*.md`              |
| `dev-docs/roquecraft-v2.md`            | `.claude/dev-docs/roquecraft-v2.md`          |

São o registro de como o jogo foi pensado e das decisões que ficaram no código, e por isso não
foram reescritos. **Todo caminho de arquivo citado neles é histórico**: fala da árvore do
roqueos-front, não deste repo. A tradução:

| no texto                                                           | neste repo                                                 |
| ------------------------------------------------------------------ | ---------------------------------------------------------- |
| `src/services/roquecraft/` (e `render/`)                           | `src/servicos/` (e `render/`)                              |
| `src/components/roqueos/apps/ROSRoqueCraft.vue`                    | `src/JogoRoqueCraft.vue`                                   |
| `src/components/roqueos/apps/roquecraft/` (`RC*.vue`, `styles/`)   | `src/componentes/`                                         |
| `src/composables/useRoqueCraft*.js`                                | `src/composables/`                                         |
| `src/css/roquecraft.scss`                                          | `src/estilos/roquecraft.scss`                              |
| `src/i18n/<idioma>/roqueCraft.js`                                  | `i18n/<idioma>.json`                                       |
| `tests/unit/services/roquecraft/`, `tests/unit/composables/`, etc. | `test/servicos/`, `test/composables/`, `test/componentes/` |
| `scripts/qa-roquecraft-*.mjs`, `scripts/gen-roquecraft-*`          | `qa/` (ver `qa/README.md`)                                 |

O que os documentos dizem sobre o RoqueOS em volta do jogo (Firebase, a regra do banco da sala,
o store de janelas, o Quasar, o `focoDoTeclado`, as notificações, o provedor do NPC) também é
histórico: aqui o jogo fala com o host pelo contrato do `@roqueos-games/jogo-sdk` (`salaAoVivo`,
`progresso`, `teclado`, `ia`, `avisar`), e o `CLAUDE.md` da raiz diz como.
