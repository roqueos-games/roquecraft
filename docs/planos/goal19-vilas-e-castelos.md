# Goal 19 — a vila vira lugar, e o mapa ganha castelo

> "Eu achei as vilas, os villagers e etc muito ruins... está bem feio" — founder,
> 14/09/2026.

Ele está certo, e dá para dizer o quanto com número.

## O diagnóstico, medido antes de propor

`src/services/roquecraft/aldeia.js`, 248 linhas. Uma vila hoje é:

| o que                              | quanto                                                        |
| ---------------------------------- | ------------------------------------------------------------- |
| casas                              | 5, **todas idênticas**, 7×7                                   |
| tipos de planta de casa            | **1**                                                         |
| blocos usados na vila              | **3** de 82 disponíveis (`cobblestone`, `oakPlanks`, `glass`) |
| fontes de luz                      | **0**                                                         |
| móveis dentro da casa              | **0**                                                         |
| telhado                            | plano — uma laje de `oakPlanks` em cima                       |
| porta                              | um vão de 2 células, sem batente                              |
| janelas                            | 3 de vidro, todas na mesma altura                             |
| fazenda, poço, praça, cerca, poste | **nenhum**                                                    |
| aldeões                            | 1 por casa, sem ofício ligado a nada                          |

Ou seja: cinco caixas iguais de dois materiais, sem luz e sem nada dentro, ligadas
por uma trilha de terra. Não é falta de capricho no detalhe — é ausência de
vocabulário.

## O que o jogo JÁ TEM e a vila não usa

Isto é o achado que muda o tamanho do trabalho. O `formas.js` (34 KB) já
implementa, com orientação, giro e conexão:

- **escada** (`ESCADA_NZ`, com topo/base e giro) → telhado inclinado de verdade
- **cama** (`CAMA_NZ`, com cabeceira e as duas metades apontando certo)
- **cerca** (`cerca: { bits }`, com conexão codificada no id) → quintal, curral
- **laje**, **tocha de parede**, **poste**

E no catálogo de 82 blocos, parados: `lantern`, `glowstone`, `stoneBricks`,
`mossyCobblestone`, `bricks`, `sandstone`, `terracotta`, `sprucePlanks`,
`birchLog`, as quatro lãs, `farmland`, `farmlandWet`, `pumpkin`, `melon`,
`craftingTable`, `furnace`, `chest`, `bookshelf`, `brewingStand`.

**Quase nada precisa ser inventado.** O trabalho é de composição, não de motor.

## A referência

Pelo que compõe uma vila em jogo de voxel de referência
([Minecraft Wiki — Village](https://minecraft.wiki/w/Village)): casas de tamanhos
variados com cama, prédios de ofício sem cama, poço, ponto de encontro central,
postes de luz, fazendas com plantação, caminhos que ligam tudo e seguem o relevo,
e iluminação distribuída.

⚠️ **Composição e função, nunca arte.** Nada de copiar blueprint bloco a bloco nem
textura: as estruturas são nossas, feitas com os nossos 82 blocos e a nossa arte,
que está congelada. O que se copia é o PRINCÍPIO — uma vila tem centro, tem luz,
tem trabalho, tem variedade.

---

# As ondas

## Onda 0 — a régua, porque "bonito" não se mede no olho de quem fez

Sem isto, todas as ondas seguintes viram opinião.

**Entrega**

1. `scripts/qa-roquecraft-vila.mjs` — gera a vila de uma semente FIXA e captura
   print de 4 ângulos (nível do chão, alto, entrada, interior de uma casa), claro
   e escuro. O repo já faz isso em dezenas de sondas (`qa-roquecraft-ceu-fotos`,
   `capture-roquecraft-cover`) — é padrão da casa, não infraestrutura nova.
2. `tests/unit/services/roquecraft/vila-inventario.spec.js` — uma varredura que
   CONTA, para uma semente fixa: tipos de bloco distintos, plantas de casa
   distintas, fontes de luz, móveis, estruturas não-residenciais.

**Critério de aceite**: a linha de base fica cravada no teste — 3 blocos, 1 planta,
0 luzes, 0 móveis — e cada onda tem que subir esse número. É catraca, como o
`teto-do-bundle`: só anda numa direção.

**Mutação**: baixar um número à mão e ver o teste reprovar.

---

## Onda 1 — a casa deixa de ser caixa

**Entrega**

- **Telhado inclinado** com a escada que já existe. Duas águas, beiral de uma
  célula. É a mudança de silhueta que mais muda a leitura à distância.
- **Quatro plantas de casa**, não uma: pequena (5×5), média (7×7), comprida (9×5)
  e a de dois andares (7×7 com sótão). Sorteadas por casa, com o mesmo hash
  determinístico que já escolhe posição.
- **Interior**: cama (forma pronta), mesa de trabalho ou baú, e uma tocha na
  parede. Casa sem nada dentro é cenário; casa com cama é lugar onde alguém mora.
- **Batente na porta**: moldura de `oakLog` em volta do vão. Custa dois blocos e
  tira o ar de buraco na parede.
- **Material por bioma**: `oakPlanks` na planície, `sprucePlanks` na taiga,
  `sandstone` no deserto, `birchLog` na floresta de bétula.

**Critério de aceite**

- inventário: ≥ 12 blocos distintos, ≥ 4 plantas, ≥ 5 luzes, ≥ 10 móveis
- print dos 4 ângulos, lido criticamente — e a casa tem que ser reconhecível como
  casa num print de 400px
- nenhuma casa com cama flutuando, teto aberto ou porta bloqueada (teste de
  invariante, como o `netherWorldgen` já faz com a soul sand)

---

## Onda 2 — a vila vira um lugar, não um conjunto de prédios

**Entrega**

- **Praça central** com **poço** (`cobblestone` + água + borda + telhadinho).
  O centro hoje é um ponto matemático onde os caminhos se cruzam; passa a ser
  destino.
- **Postes de luz**: poste de `oakLog` com `lantern` no topo, ao longo dos
  caminhos. Resolve de uma vez a vila escura e a vila invadida de noite.
- **Caminhos melhores**: largura variável, material por bioma (terra batida na
  planície, `sandstone` no deserto), e que ACOMPANHAM o relevo em vez de exigir
  chão plano.
- **Cerca e portão** delimitando quintal, com a forma de cerca que já existe.
- **Densidade**: 5 casas em raio 26 é esparso demais. Subir para 7–9 estruturas e
  apertar o raio, mantendo a distância mínima que o teste da quinta casa já
  protege.

**Critério de aceite**

- inventário: ≥ 18 blocos, ≥ 8 luzes, 1 poço, ≥ 6 postes
- **prova de noite**: print noturno em que nenhuma parte do caminho fica sem luz
- teste de sobreposição continua verde: nenhuma estrutura atravessa outra

---

## Onda 3 — trabalho e comida, que é o que faz parecer habitada

**Entrega**

- **Fazendas**: canteiro de `farmland` com água no meio, plantação em estágio
  aleatório, cercado. Abóbora e melancia em canteiro próprio.
- **Prédios de ofício**, sem cama e com o móvel que dá o nome: ferreiro
  (`furnace` + `chest`), biblioteca (`bookshelf`), alquimista (`brewingStand`),
  marcenaria (`craftingTable`).
- **Curral** com cerca e animal dentro — a pecuária já existe no jogo.
- **Aldeão com ofício**: o aldeão nasce ligado ao prédio mais próximo, e o
  `comercio.js` (12 KB, já pronto) passa a oferecer troca coerente com ele.
  Hoje o ofício é sorteado solto; passa a ter endereço.

**Critério de aceite**

- inventário: ≥ 25 blocos, ≥ 4 prédios de ofício, ≥ 2 fazendas
- teste: todo prédio de ofício tem o móvel que o define, e nenhum tem cama
- o `itens-mortos.spec.js` continua verde — se a fazenda introduzir cultura nova,
  ela precisa ter uso

---

## Onda 4 — castelo

**Entrega**

- Estrutura grande e RARA (uma a cada N células, muito mais esparsa que vila):
  muralha com ameias, duas a quatro torres de canto, portão com arco, pátio
  interno, torre de menagem com escada de verdade subindo.
- Material: `stoneBricks` com `mossyCobblestone` salpicado.
- Baú com recompensa no topo da menagem — senão é cenário, e cenário não dá
  motivo para atravessar o mapa.

**Critério de aceite**

- print de 4 ângulos, incluindo um de longe que mostra a silhueta
- teste de integridade: escada chega no topo sem buraco, portão é atravessável,
  não nasce dentro de água nem cortado por bioma
- **medição de custo**: quanto o castelo acrescenta ao tempo de geração do chunk.
  Os specs de mundo já levam 209s instrumentados; isto não pode piorar sozinho

---

## Onda 5 — ruína de castelo

**Entrega**

- O MESMO gerador da onda 4, com uma função de erosão por cima: derruba trechos
  de muralha, abre o teto, troca `stoneBricks` por `mossyCobblestone`, mete
  `tallGrass` e árvore nova crescendo dentro do pátio.
- Reaproveitar o gerador é o ponto: ruína como variação, não como segundo
  gerador. Dois geradores independentes seriam duas coisas para manter e uma para
  esquecer.

**Critério de aceite**

- a mesma semente gera castelo inteiro e ruína com a mesma planta — provável por
  teste, comparando as duas saídas
- print de 4 ângulos
- ruína NÃO tem baú de recompensa cheio (senão a ruína vira o castelo fácil)

---

# Os riscos, que são reais

**1. O bundle.** O teto é 1148 KB gzip e hoje está em 1147.1 — **sobram 0,9 KB.**
Qualquer onda desta lista estoura. A onda 0 precisa incluir a decisão: ou o
RoqueCraft entra em chunk lazy próprio (como a i18n dele já entrou), ou o teto
sobe com justificativa no commit. **Isto bloqueia a onda 1 e precisa ser resolvido
primeiro.**

**2. O tempo de geração.** Os seis specs de mundo do RoqueCraft já levam 209s
instrumentados — foi o que quebrou o gate de Cobertura hoje. Mais estrutura por
chunk piora isso. Cada onda mede o tempo de geração antes e depois.

**3. A tarefa programada.** Ela dispara a cada 6h e trabalha sozinha neste mesmo
repo. Cada onda confere que ela não está rodando antes de começar — e o goal
inteiro talvez peça pausar a tarefa enquanto durar.

**4. Evidência no aparelho-alvo.** "Verde no desktop não é verde no iPhone, e isso
já quebrou o jogo uma vez." Vila com muito mais bloco por chunk é exatamente o
tipo de mudança que aparece no celular primeiro. Onda 2 em diante precisa de print
no device, não só no desktop.

# O que fica de fora de propósito

- **Arte nova.** A arte está congelada; tudo aqui se monta com os 82 blocos que já
  existem. Se alguma onda provar que falta um bloco, isso vira decisão sua, não
  item de tarefa.
- **Aldeão com IA de rotina** (acordar, trabalhar, dormir). É um goal inteiro por
  si; aqui o aldeão ganha endereço e ofício, não agenda.
- **Vila de outros biomas além dos quatro citados.**

# A ordem, e por quê

0 → 1 → 2 → 3 são sequenciais: a régua antes de tudo, a casa antes da vila, a vila
antes do trabalho. **4 e 5 são independentes** e podem ir em paralelo depois da 1,
porque castelo não depende de nada da vila além do vocabulário de construção.

O ganho visual por esforço é maior na **onda 1** (telhado e variedade mudam a
leitura à distância) e na **onda 2** (luz muda a leitura de noite). Se o goal
tivesse que parar no meio, para nessas duas.
