# Operação

_[English](../OPERATIONS.md) | Português_

> **Para quem:** o mantenedor, e quem prepara uma versão para o RoqueOS pinar.
> **O que tem aqui:** a rotina de manutenção, como sai uma versão, como atualizar sem quebrar, como desfazer, onde moram os dados e o que observar.
> **Onde ir para o resto:** sintomas e consertos em [QUANDO-QUEBRA.md](QUANDO-QUEBRA.md); o gate em [TESTES.md](TESTES.md).

## Sumário

1. [A rotina](#1-a-rotina)
2. [Publicar uma versão](#2-publicar-uma-versão)
3. [Atualizar sem quebrar](#3-atualizar-sem-quebrar)
4. [Desfazer](#4-desfazer)
5. [Backup e restauração](#5-backup-e-restauração)
6. [O que observar](#6-o-que-observar)

## 1. A rotina

Não há servidor nem agenda: o jogo é um pacote que o RoqueOS instala. A rotina de manutenção está
escrita em [`.claude/loop.md`](../../.claude/loop.md), uma coisa por iteração, parando na primeira
que tiver trabalho:

1. gate vermelho: `roqueos-gate` (o `yarn verificar`);
2. CI do GitHub vermelho: `gh run list --limit 3`;
3. issue ou PR de fora sem resposta: `gh issue list`, `gh pr list`;
4. asset sem origem no `ASSETS.md`;
5. SDK atrás: tag nova do `jogo-sdk` com capacidade que o jogo usa vira bump;
6. deriva de documentação entre README, CONTRIBUTING e `jogo.json`.

Duas regras de frescor moram no gate e vencem pela data, não pela mudança: a varredura das sondas e
o ledger do mesher têm de ter até 21 dias. Refazer os dois faz parte da rotina:

```bash
node qa/lib/preparar-dist.mjs
node qa/qa-sondas.mjs
node qa/bench-mesher.mjs --ledger
```

A varredura leva cerca de uma hora ([`qa/qa-sondas.mjs`](../../qa/qa-sondas.mjs)) e precisa dos
navegadores do Playwright. Faça commit do `qa/qa-roquecraft-varredura.json` e do `qa/bench-mesher.json`
reescritos.

## 2. Publicar uma versão

Não há script de release neste repo. O que o histórico mostra (as tags `v0.1.1` a `v0.1.3` no
GitHub, as seções do [`CHANGELOG.md`](../../CHANGELOG.md) e o pin do RoqueOS) é esta ordem:

```bash
yarn verificar
# suba a "version" do package.json e escreva a seção do CHANGELOG
git commit -am "..."
git tag v0.1.4
git push origin v0.1.4
```

Depois, no `roqueos-front`, o pin `"@roqueos-games/roquecraft": "github:roqueos-games/roquecraft#v<versão>"`
sobe e é revisado. Nada daqui chega ao jogador antes disso. O `v0.1.4` acima é exemplo. Em
18/11/2026 o `package.json` diz 0.1.3 e a última seção do CHANGELOG é a 0.1.2: a versão 0.1.3 (a capa
e o ícone novos) não tem seção no CHANGELOG.

Mudança visível não fecha sem o jogo aberto de verdade (`yarn dev`) e um print; mudança de GPU só com
evidência num iPhone de verdade ([`CLAUDE.md`](../../CLAUDE.md)).

## 3. Atualizar sem quebrar

- **O SDK.** O `@roqueos-games/jogo-sdk` é pinado por tag no `package.json`. O bump vai com o
  `yarn verificar` verde e o CHANGELOG dizendo o que mudou.
- **O three.js.** Não troque a versão do `three`: a de `devDependencies` é a que o RoqueOS instala,
  para o teste e o `yarn dev` verem o que o jogador vê.
- **A sala.** Os nomes dos nós e os campos não mudam; do outro lado pode estar um RoqueOS antigo.
- **O save.** Campo novo entra com padrão no `parseSave`, para os saves antigos continuarem abrindo.
  Mudança de formato sobe a `version` e continua lendo as anteriores, como a v13 continua lendo a v12.
- **Os ids de bloco.** Nunca renumere um id existente; bloco novo entra no fim
  ([`src/servicos/blocks.js`](../../src/servicos/blocks.js)). Os ids estão gravados no save e nas
  diferenças de `blocks` da sala.

## 4. Desfazer

| Passo                          | Como desfazer                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| uma tag ruim pinada no RoqueOS | volte o pin para a tag anterior no `roqueos-front`; as tags daqui ficam                                       |
| um commit ruim no `main`       | `git revert <sha>` e uma tag nova; nunca reescreva uma tag publicada                                          |
| save gravado num formato novo  | não se desfaz daqui: os documentos dos jogadores já o carregam. Mantenha o `parseSave` lendo todas as versões |
| id de bloco renumerado         | não se desfaz: os mundos salvos e as diferenças da sala apontam para o número antigo                          |
| textura regenerada             | rode de novo o gerador na versão anterior dele; nunca edite o PNG                                             |

## 5. Backup e restauração

O repo não tem dado próprio para guardar: o código e os assets estão no GitHub. Os mundos dos
jogadores moram do lado do host, pelo `progresso` (no RoqueOS, a conta do jogador; no `yarn dev`, o
`localStorage` do navegador). O jogo nunca apaga um save, e leitura que falhou nunca grava por cima
(RC-02, [`src/servicos/cargaDoSave.js`](../../src/servicos/cargaDoSave.js)). O backup das contas é
responsabilidade do RoqueOS, não deste repo.

## 6. O que observar

| Sinal                | Saudável                            | Onde                              |
| -------------------- | ----------------------------------- | --------------------------------- |
| `yarn verificar`     | sai 0                               | a máquina do mantenedor           |
| CI `verificar`       | verde no `main` e nos PRs           | `gh run list --limit 3`           |
| varredura das sondas | até 21 dias, nenhuma sonda vermelha | `qa/qa-roquecraft-varredura.json` |
| ledger do mesher     | até 21 dias, sem ficar mais lento   | `qa/bench-mesher.json`            |
| `jogo check`         | `ok, o repo cumpre o contrato.`     | `yarn jogo:check`                 |

Medido em 18/11/2026: a varredura é de 30/09/2026 (103 verdes, 4 humanas) e o ledger do mesher, de
30/09/2026 (1,005 ms por seção num Apple M5 Max); as duas regras de frescor estão vermelhas.
