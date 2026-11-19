# Começar

_[English](../GETTING-STARTED.md) | Português_

> **Para quem:** quem clona o repo pela primeira vez e quer o jogo rodando e o gate verde.
> **O que tem aqui:** os pré-requisitos com o comando que confere cada um, cada passo com o que faz e como saber que deu certo, e os erros de primeira vez.
> **Onde ir para o resto:** todo comando em [REFERENCIA.md](REFERENCIA.md); o que cada falha quer dizer em [QUANDO-QUEBRA.md](QUANDO-QUEBRA.md).

## Sumário

1. [Pré-requisitos](#1-pré-requisitos)
2. [Instalar](#2-instalar)
3. [Rodar o jogo](#3-rodar-o-jogo)
4. [Jogar numa sala entre duas abas](#4-jogar-numa-sala-entre-duas-abas)
5. [Rodar o gate](#5-rodar-o-gate)
6. [Erros de primeira vez](#6-erros-de-primeira-vez)

## 1. Pré-requisitos

| Ferramenta | Versão                                                     | Confere                 |
| ---------- | ---------------------------------------------------------- | ----------------------- |
| Node       | 24 pelo [`.nvmrc`](../../.nvmrc), 22 no mínimo (`engines`) | `node -v`               |
| Yarn       | 1.22 (`packageManager: yarn@1.22.22`)                      | `yarn -v`               |
| git        | qualquer recente                                           | `git --version`         |
| navegador  | um com WebGL                                               | abrir o endereço do dev |

O repo usa Yarn. O `npm` não é o gerenciador de pacotes aqui: o lockfile é o
[`yarn.lock`](../../yarn.lock).

## 2. Instalar

```bash
git clone https://github.com/roqueos-games/roquecraft.git
cd roquecraft
yarn install --ignore-scripts
```

O `--ignore-scripts` é como o CI instala também ([`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)):
nada roda sozinho na instalação, e o `jogo check` reprova `package.json` que declara script de
instalação. Deu certo quando o yarn termina com `Done in ...` e existe
`node_modules/@roqueos-games/jogo-sdk` (o SDK vem do GitHub, tag `v0.3.0`).

## 3. Rodar o jogo

```bash
yarn dev
```

O Vite imprime um endereço local. Abra: a página é o [`index.html`](../../index.html) com o
[`dev/main.js`](../../dev/main.js), que monta o jogo com o host de desenvolvimento do SDK, o mesmo
`mount` que o RoqueOS chama. Aparecem os textos do carregamento ("Carregando texturas...", "Ligando o
motor...", "Gerando o terreno...", "Procurando um lugar seguro...") e depois o menu inicial. Clique
para jogar, ande com WASD, quebre com o botão esquerdo. O mundo fica salvo no `localStorage` do
navegador; recarregue e ele volta.

O host de desenvolvimento não tem conta nem `ia`, de propósito: o aldeão responde com as falas
locais e a caixa de texto para conversar com ele não aparece.

## 4. Jogar numa sala entre duas abas

Em "Jogar com amigos", crie a sala numa aba e abra o link (a própria página com `?sala=<código>`)
numa aba nova. Não duplique a aba, que vira o mesmo jogador. O host de desenvolvimento faz a sala
entre abas do mesmo navegador pelo `localStorage` e não emula as regras do banco.

## 5. Rodar o gate

```bash
yarn verificar
```

É `yarn lint && yarn format:check && yarn test && yarn jogo:check`, os mesmos quatro passos que o
CI roda e que o pre-push do mantenedor roda pelo `roqueos-gate`. Está verde quando o yarn imprime
`Done` e a última seção termina com `ok, o repo cumpre o contrato.` O passo de teste levou 499 s
num contêiner Linux em 18/11/2026; naquela rodada ele ficou vermelho por motivos que não são seus
(veja abaixo).

## 6. Erros de primeira vez

| O que aparece                                                                        | O que quer dizer                                                 |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `a última varredura foi há N dias (folga: 21)`                                       | a varredura das sondas no repo está velha; não foi a sua mudança |
| `a última medição foi há N dias (folga: 21). Rode node qa/bench-mesher.mjs --ledger` | o ledger do mesher está velho                                    |
| `expected <ms> to be less than 40` no `perf.spec.js`                                 | um teto de tempo numa máquina lenta ou ocupada                   |
| tela preta com "Não deu para iniciar o RoqueCraft" e "Tentar de novo"                | não há contexto WebGL neste navegador                            |

Cada um, com o conserto, está em [QUANDO-QUEBRA.md](QUANDO-QUEBRA.md).
