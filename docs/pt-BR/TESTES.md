# Testes

_[English](../TESTING.md) | Português_

> **Para quem:** quem roda o gate, lê um teste vermelho ou escreve um novo.
> **O que tem aqui:** o que cada suíte prova, o que ela não consegue provar, os testes que pinam defeito conhecido, os tetos de tempo, e o critério de aceite.
> **Onde ir para o resto:** como consertar cada vermelho em [QUANDO-QUEBRA.md](QUANDO-QUEBRA.md); as sondas no [`qa/README.md`](../../qa/README.md).

## Sumário

1. [O critério de aceite](#1-o-critério-de-aceite)
2. [As suítes](#2-as-suítes)
3. [O que o teste não vê](#3-o-que-o-teste-não-vê)
4. [Defeitos conhecidos pinados por it.fails](#4-defeitos-conhecidos-pinados-por-itfails)
5. [Tetos de tempo](#5-tetos-de-tempo)
6. [Medido em 18/11/2026](#6-medido-em-18112026)

## 1. O critério de aceite

Uma mudança é aceita quando o `yarn verificar` sai 0 na máquina do mantenedor e o workflow
`verificar` está verde no PR ([`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)). Toda
correção vem com um teste que reprova sem ela. Mudança visível também precisa do jogo aberto no
`yarn dev` com print, e mudança de GPU precisa de evidência num iPhone de verdade
([`.claude/loop.md`](../../.claude/loop.md), [`CLAUDE.md`](../../CLAUDE.md)). Teste nunca é
enfraquecido para o gate passar.

```bash
yarn verificar
```

## 2. As suítes

Todas rodam com o Vitest no jsdom ([`vite.config.js`](../../vite.config.js)), com o
[`test/preparar.js`](../../test/preparar.js) suprindo o que o jsdom não tem (`ResizeObserver`,
`matchMedia`).

| Pasta                | O que prova                                                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `test/servicos/`     | as regras do motor: worldgen, mesher, luz, física, bichos, fabricação, redstone, fluidos, save, sala, desempenho                       |
| `test/composables/`  | as peças com ciclo de vida, inclusive a sala sobre o host falso do SDK (`salaComHostFalso.spec.js`)                                    |
| `test/componentes/`  | as telas `RC*.vue`: foco, teclado, comércio, inventário, painel do criativo, controles de toque                                        |
| `test/multijogador/` | uma rede simulada falando o contrato de `criarSalaDoRoqueCraft`: três e quatro clientes, 150 ms, 1% e 5% de perda                      |
| `test/arquitetura/`  | réguas sobre o próprio repo: frescor da varredura e do ledger do mesher, itens mortos, tabelas por id, tela única, sondas com veredito |
| raiz de `test/`      | o jogo inteiro montado pelo contrato (`jogoRoqueCraft.spec.js`), os avisos, a arte importada                                           |

O `yarn jogo:check` acrescenta as conferências do contrato do SDK: scripts de instalação, manifesto,
textos nos dez idiomas, origem dos assets e nenhum import de banco.

## 3. O que o teste não vê

O jsdom não tem WebGL, então o `three` é trocado por um dublê ([`test/threeStub.js`](../../test/threeStub.js)).
Verde não diz nada sobre o que é desenhado na GPU: shaders, sombras, água, céu, texturas e perfis de
qualidade. A sala ao vivo com dois clientes contra um banco de verdade também não é automatizada; as
sondas de `qa/` cobrem parte do comportamento no navegador e são varridas à mão, cerca de uma hora por
varredura.

## 4. Defeitos conhecidos pinados por it.fails

Um teste marcado `it.fails` passa enquanto o defeito que ele descreve existe e fica vermelho no
momento em que o defeito é consertado; a marca sai no mesmo commit do conserto.

| Teste                                                                          | Defeito                                                                                                                                                                        |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `o anfitrião com companhia que cai some da sala (e a sucessão pode acontecer)` | quando a conexão do anfitrião cai com gente na sala, a presença fica e a sucessão não acontece ([`salaComHostFalso.spec.js`](../../test/composables/salaComHostFalso.spec.js)) |

O save com lista dentro de lista teve três `it.fails` até a 0.1.2 (30/09/2026), quando o save v13
consertou e eles viraram `it` ([`CHANGELOG.md`](../../CHANGELOG.md)).

## 5. Tetos de tempo

Teto de tempo existe para pegar teste que trava; ele não mede a máquina e nunca é afrouxado como
conserto. Os tetos moram num lugar só, o [`test/tetos.js`](../../test/tetos.js): `TETO_DE_MUNDO`
(60 s, 240 s com `VITEST_INSTRUMENTADO`) para os testes que geram mundo, `TETO_LENTO` (20 s, 60 s
instrumentado), e o `testTimeout` global de 15 s. Os orçamentos de desempenho do
[`test/servicos/perf.spec.js`](../../test/servicos/perf.spec.js) são de relógio de parede e só afirmam
fora de rodada com cobertura.

## 6. Medido em 18/11/2026

Num contêiner Linux, Node 22.23.5, depois de `yarn install --frozen-lockfile --ignore-scripts`:
`yarn lint` 0, `yarn format:check` 0, `yarn jogo:check` 0, e `yarn test` 1, com 233 arquivos e 3572
testes, 4 reprovados, em 499 s:

| Teste reprovado                                                                      | Por quê                                         |
| ------------------------------------------------------------------------------------ | ----------------------------------------------- |
| `sondas-varridas` > `a varredura não está velha demais para significar alguma coisa` | a varredura tem 50 dias, o limite é 21          |
| `mesher-medido` > `existe, é recente, e o mesher não ficou mais lento`               | o ledger do mesher tem 50 dias, o limite é 21   |
| `perf` > `malha um chunk inteiro em tempo de frame`                                  | 54,3 ms contra um teto de 40 ms naquela máquina |
| `perf` > `gerar um chunk é rápido o bastante pro worker`                             | acima do teto de 14 ms naquela máquina          |

Os dois primeiros são datas passando, não código; se os dois últimos reprovam também em outra
máquina não foi medido.
