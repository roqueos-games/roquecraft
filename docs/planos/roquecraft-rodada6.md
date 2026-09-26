# Rodada 6 — a laje

## O que entrou

Quatro materiais (pedra, pedregulho, carvalho, pinheiro), cada um com metade de
baixo e metade de cima. A de cima existe no mundo e **não** no inventário: a
peça é uma só e a metade sai do encaixe, como no jogo de referência.

## A decisão de arquitetura, e por que ela não é a do plano

O backlog dizia "byte de estado por voxel" como habilitador. Não foi por aí, e
a troca é deliberada:

O byte custa uma tabela paralela em **todo chunk carregado** (32 KB por chunk, o
mesmo tamanho dos blocos) e atravessa worker, save, rede e multijogador. É
mudança de formato de dados, não funcionalidade — e entregaria zero pixel novo
na primeira rodada. A FORMA, por outro lado, já era conceito por id no mesher
desde que a camada de neve existe (`slab`). A laje entrou pelo caminho aberto.

O que se paga: 2 ids por material, num espaço de 256 onde 69 estavam em uso.
Escada custará 8 por material, e é aí que a conta aperta. Quando apertar,
`FORMA_BASE`/`FORMA_TOPO` já são a abstração que mesher e física leem — trocar a
fonte delas não mexe em nenhum dos dois. O byte fica pro dia em que a forma
depender de algo que o id não sabe.

## As quatro coisas que meia altura quebra, e como cada uma foi resolvida

| o quê            | como erra                               | conserto                                                             |
| ---------------- | --------------------------------------- | -------------------------------------------------------------------- |
| tabela de forma  | laje com altura de bloco cheio          | `FORMA_BASE`/`FORMA_TOPO`, fonte única                               |
| recorte de face  | buraco no chão em volta da laje de topo | `FACE_NA_BORDA`: face que flutua no meio da célula nunca é escondida |
| caixa de colisão | jogador dentro da pedra, ou preso no ar | `solidAt` devolve par `[base, topo]` quando a caixa flutua           |
| encaixe          | laje sempre na mesma metade             | `laje.js`: face antes da altura do clique                            |

**A ordem das regras de encaixe importa.** Face primeiro, altura depois. Numa
face horizontal o ponto de impacto cai no plano inteiro da célula (fração 0 ou

1. — ler a altura ali responderia sempre a mesma coisa, e o jogador não teria
   como pedir a outra metade.

**Fusão.** Encostar laje na metade vazia de outra do mesmo material vira o bloco
cheio, na célula da LAJE, não na vizinha. É o caminho de volta da laje, e ele
não passa pela bancada.

## Medido

- 30 testes novos em `laje.spec.js`, quatro reimplementando a regra antiga e
  afirmando que ela erra. Suíte em **6712**.
- `qa-roquecraft-laje` no jogo rodando: clique de cima dá a metade de baixo,
  segundo clique funde em bloco cheio, e andar contra a laje sobe exatamente
  meio bloco (pico 97,5 sobre piso 97).
- Custo do mesher: **+5%** por seção (1,60 → 1,68 ms), com contagem de vértices
  idêntica numa cena sem laje. Medido em `scripts/bench-mesher.mjs`, que existe
  porque "o teste de perf passou" e "não ficou mais lento" são frases
  diferentes: o teto do teste tem folga pra esconder 20%.

## Dois testes antigos reescritos — por mudança de regra, não por conveniência

`fisicaMundoAusente.spec.js` afirmava que o auto-degrau alcança "bloco cheio +
a maior `slab` do jogo". Com a laje isso vira 1,5, que o jogo de referência não
deixa subir andando — e nem deveria, senão a escada perde a razão de existir. O
invariante verdadeiro sempre foi sobre COBERTURA DE TERRENO (neve, musgo), e é
isso que está escrito agora. O outro lado da regra virou teste próprio: bloco
cheio com laje em cima **exige pulo**.

## Armadilhas desta rodada

1. `teleport` LIGA o voo. `setFlying(false)` antes do teleporte não desliga
   nada, e voando o auto-degrau nunca dispara (ele exige estar no chão). A
   sonda mediu "não sobe na laje" com o jogador flutuando.
2. Medir o y FINAL de uma travessia não responde "subiu": depois de passar por
   cima da laje o jogador desce de volta e o número volta ao inicial. Quem
   responde é o PICO.
3. Recalcular `surfaceAt` depois de construir devolve outra altura — a
   plataforma virou a superfície daquela coluna. A altura tem que vir de fora.
4. `String.replace` de chunk do three e `blocoEm` devolvendo chave, herdadas da
   rodada 5, continuam valendo.

## Fica em aberto

- **Silhueta do destaque** é o cubo inteiro, mesmo em laje. O raycast também
  trata a célula como cheia, então mirar na metade vazia de uma laje acerta a
  célula. Cosmético hoje; vira incômodo quando a escada entrar.
- **Escada** — 8 ids por material, e o `FORMA_*` precisa passar a carregar duas
  caixas em vez de uma. É a rodada seguinte natural.
- Trocar o perfil pra `low` em execução ainda emite dois erros de WebGL no
  console (pré-existente, confirmado no build anterior).
