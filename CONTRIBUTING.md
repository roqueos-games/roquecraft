# Como contribuir

Obrigado por querer ajudar. A régua é a mesma para todo mundo, inclusive para quem mantém.

1. Abra uma issue antes de mudar regra do jogo ou o que o jogador vê. Correção pequena pode ir
   direto para o PR.
2. Faça o fork, crie um branch e rode `yarn install --ignore-scripts`.
3. Toda correção vem com um teste que reprova sem ela. Teste que passa com e sem a mudança
   não prova nada.
4. Texto novo entra nos dez `i18n/*.json`, com as mesmas chaves. O `jogo check` reprova se
   faltar um idioma.
5. Arquivo novo em `public/` precisa de uma linha no [ASSETS.md](ASSETS.md) com a licença e
   a origem. Asset sem origem clara não entra.
6. Rode `yarn verificar` antes de abrir o PR. É o mesmo que o CI roda.

Não mude as chaves de armazenamento (`best`, `muted`) nem os nomes de evento (`game_start`,
`game_over`): o recorde de quem já joga e o histórico de uso dependem deles.

O código, os comentários e as mensagens de commit são em português do Brasil. Issue e PR em
inglês são bem-vindos.

## Conduta

Crítica ao código, nunca à pessoa. Assédio, ofensa e exposição de dado pessoal de alguém
tiram a pessoa do projeto. Para reportar, use o contato de [SECURITY.md](SECURITY.md).

---

## Contributing (English)

Open an issue before changing gameplay; fork, branch, `yarn install --ignore-scripts`; every
fix comes with a test that fails without it; new text goes into all ten `i18n/*.json`; every
file in `public/` needs a line in `ASSETS.md`; run `yarn verificar` before the pull request.
Do not change storage keys or event names. Be kind: critique code, never people.
