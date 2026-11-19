# Documentação do RoqueCraft

_[English](../INDEX.md) | Português_

> **Para quem:** quem chega ao repo com uma pergunta.
> **O que tem aqui:** a tabela do que você quer para o documento que responde, os diagramas e as fontes deles, e os documentos importados do RoqueOS.
> **Onde ir para o resto:** a visão geral é o [README](../../README.pt-BR.md).

## Quero... leia

| Quero...                                                             | Leia                                 |
| -------------------------------------------------------------------- | ------------------------------------ |
| rodar o jogo e o gate pela primeira vez                              | [COMECAR.md](COMECAR.md)             |
| entender como o motor, o desenho, a sala e o save se encaixam        | [ARQUITETURA.md](ARQUITETURA.md)     |
| achar um comando, script, arquivo, constante ou campo do save        | [REFERENCIA.md](REFERENCIA.md)       |
| publicar uma versão, atualizar sem quebrar, desfazer                 | [OPERACAO.md](OPERACAO.md)           |
| consertar gate vermelho, jogo que não abre, save ou sala             | [QUANDO-QUEBRA.md](QUANDO-QUEBRA.md) |
| saber o que um termo do código quer dizer                            | [GLOSSARIO.md](GLOSSARIO.md)         |
| acrescentar recurso, bloco, item, receita, texto, asset ou sonda     | [ESTENDER.md](ESTENDER.md)           |
| trabalhar do lado do RoqueOS: mount, capacidades, sala, save, gancho | [INTEGRACOES.md](INTEGRACOES.md)     |
| saber o que cada suíte de teste prova e o que ela não vê             | [TESTES.md](TESTES.md)               |
| saber o que está decidido e não se reabre                            | [DECISOES.md](DECISOES.md)           |
| contribuir                                                           | [CONTRIBUTING.md](CONTRIBUTING.md)   |
| saber de onde vem cada asset                                         | [ASSETS.md](../../ASSETS.md)         |
| rodar ou escrever uma sonda de QA                                    | [qa/README.md](../../qa/README.md)   |
| reportar uma vulnerabilidade                                         | [SECURITY.md](../../SECURITY.md)     |
| ver o que mudou em cada versão                                       | [CHANGELOG.md](../../CHANGELOG.md)   |

## Diagramas

Todo diagrama é Mermaid dentro do Markdown; a fonte é o texto do próprio documento.

| Diagrama             | Fonte e explicação                                            |
| -------------------- | ------------------------------------------------------------- |
| as partes do jogo    | [README](../../README.pt-BR.md#as-partes)                     |
| contexto             | [ARQUITETURA.md, seção 2](ARQUITETURA.md#2-contexto)          |
| abrir o mundo        | [ARQUITETURA.md, seção 6](ARQUITETURA.md#abrir-o-mundo)       |
| autosave             | [ARQUITETURA.md, seção 6](ARQUITETURA.md#autosave)            |
| sala: criar e entrar | [ARQUITETURA.md, seção 6](ARQUITETURA.md#sala-criar-e-entrar) |

## Importados do RoqueOS

O jogo nasceu dentro do `roqueos-front` e foi extraído em 26/09/2026. A regra, os planos e o dev-doc
que ele tinha lá foram copiados sem mudar uma letra, em português, com os caminhos de arquivo do
front. Ficam como registro de como o jogo foi pensado, não como documentação viva, e são citados de
fora (a rule 36 do RoqueOS e o contexto do kit apontam para cá). O [`README.md`](../README.md) da
pasta `docs/` explica de onde veio cada um e como traduzir os caminhos.

| Documento                                                                       | O que é                                                    |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| [`regras/44-roquecraft-arquitetura.md`](../regras/44-roquecraft-arquitetura.md) | a rule 44: onde cada coisa nasce                           |
| [`dev-docs/roquecraft-v2.md`](../dev-docs/roquecraft-v2.md)                     | o dev-doc da v2, com as armadilhas de shader de 19/08/2026 |
| `planos/` (31 arquivos)                                                         | os planos, goals e rodadas do desenvolvimento do jogo      |
