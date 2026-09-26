# Goal — Onda 3: a sobrevivência fecha o círculo

> 13/09/2026. Abre a onda 3 do plano `roquecraft-plano-2026-09-12.md`, com foco
> em agricultura. As travas T1 (espaço de id) e T2 (altura/dimensão) caíram em
> 12/09; sem elas, nada abaixo cabia.

## O estado, medido hoje antes de escrever qualquer coisa

|           | agora                                              |
| --------- | -------------------------------------------------- |
| blocos    | 160 ids, maior id 160 (teto 65.535 desde a paleta) |
| itens     | 134                                                |
| receitas  | 57                                                 |
| criaturas | 12                                                 |
| texturas  | 94 em uso, grade 10×10, **6 slots livres**         |

**Agricultura hoje: não existe.** Um único `oakSapling`, nenhuma semente,
nenhum solo arado, e **nem enxada** entre as 16 ferramentas. Cinco itens de
comida, todos caçados ou achados. Quem joga sobrevive matando bicho.

### Dois achados que mudam o plano original

**1. Não há bloqueio de arte.** O plano declarava que "item novo precisa de tile
novo no atlas, e arte está congelada desde 24/08". Medido: as texturas do
RoqueCraft são **100% procedurais**, geradas por `scripts/gen-roquecraft-
textures.mjs` — cada tile é uma função em `T`, autoral e CC0. A grade nem tem
teto: `cols = ceil(sqrt(names.length))` recalcula a folha sozinha. Textura de
bloco novo aqui é código, não desenho. **O bloqueio da onda 3 não existe** (o da
onda 4 precisa ser reavaliado com a mesma medição, e isso é decisão do founder).

**2. A reprodução de animais já está escrita, e é inalcançável.**
`pecuaria.js` declara `ITEM_DE_AMOR = { cow: 'wheat', sheep: 'wheat', pig:
'wheat', chicken: 'wheat' }` para as quatro espécies. O trigo não existe. Ou
seja: há um sistema inteiro de namoro, bebês, espera e lã pronto no código e
morto por falta de um item. A agricultura não acrescenta a reprodução — ela
**destrava** a que já está lá.

## O que este goal entrega

O círculo da comida renovável fechado, de ponta a ponta, sem `give` e sem gancho
de QA: mato alto → semente → solo arado → trigo → pão, e trigo → reprodução →
carne renovável.

## Regras que não se reabrem

- Textura nova é **procedural**, no `T` do gerador. Nada de asset da Mojang: a
  regra `36-games` proíbe e o risco de IP é real.
- Nenhuma etapa usa o gancho de E2E para entregar item. A sonda de jornada joga
  como jogador — se um elo exigir item inalcançável, ela reprova.
- Teste de mutação em toda etapa. Check que nunca reprovou não é check.
- Cada etapa sobe para produção e é medida no ar antes da seguinte.

## Etapas

### Etapa 0 — a sonda de jornada, ANTES da funcionalidade

`scripts/qa-roquecraft-jornada.mjs`: mundo novo, semente nova, inventário
vazio; a sonda tenta a corrente inteira e reporta onde ela arrebenta.

**Ela vai reprovar hoje, e é exatamente isso que prova que ela mede.** Uma
sonda escrita depois da funcionalidade nasce verde e nunca provou nada.

**Critério:** a sonda roda, reprova no primeiro elo que falta e diz qual.

### Etapa 1 — enxada e solo arado

Item `wood_hoe`/`stone_hoe`/`iron_hoe`/`diamond_hoe` com receita; bloco
`farmland` com textura procedural (terra revirada, sulcos, mais escura quando
hidratada); usar a enxada em `grass`/`dirt` vira `farmland`.

`tool: 'hoe'` **já é reconhecido** por `moss` em `blocks.js` — o tipo existe, o
item é que não.

**Critério:** enxada craftável a partir de madeira, e o chão vira solo arado.
**Mecanismo:** teste de que arar só funciona em grama/terra, com céu aberto.

**FEITA em 13/09/2026** — commits `3465db81` e `789e2b02`, no ar (a folha de
textura em produção bate byte a byte com o disco).

- 4 enxadas, receita `MM / ·S / ·S` na bancada; blocos `farmland` (161) e
  `farmlandWet` (162), que dropam terra e não são item
- `agricultura.js` (regra) + `usoDeFerramenta.js` (efeito, com balde junto):
  o componente caiu de 2.546 para 2.528 linhas e a catraca foi apertada
- sonda `qa-roquecraft-lavoura.mjs`: grassBlock → farmland, stone → stone,
  24/24 células do canteiro araradas, com foto
- dois portões novos: `atlasAlinhado.spec.js` (o manifesto no disco é
  EXATAMENTE `TEXTURE_NAMES` — peguei um deslize real de 2 camadas que teria
  texturizado o mundo inteiro errado) e os geradores formatando a própria saída
- pendência: as outras ~60 sondas `qa-roquecraft-*.mjs` ainda têm o servidor
  inline com fallback para `index.html`, então só rodam logo após `build:app`

### Etapa 2 — semente, plantio e crescimento

`tallGrass` passa a dropar `wheat_seeds` (hoje `drops: null`); semente plantada
em `farmland` vira `wheat` no estágio 0; o tique do mundo
(`atualizacoes.js`, o mesmo relógio de 20 Hz da água e da areia) avança os
estágios enquanto houver luz.

**Critério:** planta cresce, e só em solo arado, e só com luz.
**Mecanismo:** teste de que estágio não avança no escuro nem em terra comum.

**FEITA em 13/09/2026** — commit `79c7507d`, no ar.

- mato dropa `wheat_seeds` (12,5%); oito ids de trigo (163..170)
- crescimento pelo relógio de 20 Hz: a visita se REPÕE na fila a cada 3 s e
  sorteia 25% — o anel de baldes só vai até 63 tiques, então "volte em dois
  minutos" daria atraso silenciosamente encurtado
- talo sem canteiro embaixo morre e vira item
- medido: 3/3 sementes brotaram e chegaram a `wheat7` em 1.434 tiques

### Etapa 3 — FEITA em 13/09/2026 (commit `63725b7a`, no ar)

⚠️ O trabalho da etapa virou um conserto de defeito ANTIGO: `mira.js` usava só
`solidAt`, e planta tem `solid: false`. A mira atravessava mato, flor, muda e
trigo — **nunca deu pra quebrar mato neste jogo**. Ninguém notou porque mato
não dropava nada até a etapa 2. `EH_MIRAVEL` conserta, e `resolverColocacao`
passou a escrever NA célula do alvo substituível (senão a peça nasceria ao lado
do tufo).

Medido: mira `tallGrass` → quebrou → `air`; mira `wheat7` → +1 trigo.

### Etapa 3 (texto original) — colheita, trigo e pão

Colher no último estágio devolve trigo mais sementes; receita de pão; o pão
entra no `eat` de `survival.js`, que já existe.

**Critério:** o ciclo fecha — uma semente vira mais sementes e comida.
**Mecanismo:** a sonda de jornada da etapa 0 passa deste elo em diante.

### Etapa 4 — hidratação e reversão

Solo perto de água fica hidratado (cresce mais rápido); sem água, seca e volta a
terra. Pular em cima desfaz o solo arado.

**Critério:** os três comportamentos medidos, não inferidos.

### Etapa 5 — a reprodução destravada

Com o trigo existindo, `ITEM_DE_AMOR` sai do papel: alimentar duas vacas gera
bezerro. Nenhuma linha nova de pecuária — só a prova de que o elo morto voltou.

**Critério:** sonda alimenta duas criaturas e mede o filhote.

### Etapa 6 — árvore renovável

`oakSapling` existe como bloco e **não cresce** (nenhum código fora de
`blocks.js` o cita). Muda plantada vira árvore com espaço e luz.

**Critério:** madeira deixa de ser recurso finito do mapa.

### Etapa 7 — cenoura e batata

Comida que não precisa de forno, para quem ainda não tem carvão. Mesma mecânica
de estágio da etapa 2.

**Critério:** a sonda de jornada sobrevive cinco noites sem matar nenhum bicho.

## O que fica fora, dito agora

- Encantamento, poções, armadura e XP com consumidor: é onda 4, e depende da
  decisão do founder (que agora pode ser tomada sabendo que não há bloqueio de
  arte).
- Aldeia, comércio, abelha, todos os cultivos do original. A meta é a jornada
  fechada, não paridade de contagem.

---

## FECHAMENTO — 13/09/2026

As sete etapas estão feitas e no ar. A sonda de jornada fecha **os 11 elos**:
o jogador planta, colhe, assa, come e cria bicho sem caçar e sem `give`.

| Etapa                   | Commit                 | Prova no jogo                                   |
| ----------------------- | ---------------------- | ----------------------------------------------- |
| 1 enxada e solo arado   | `3465db81`, `789e2b02` | 24/24 células araradas, pedra recusada          |
| 2 semente e crescimento | `79c7507d`             | 3/3 sementes → `wheat7` em 1.434 tiques         |
| 3 colheita              | `63725b7a`             | mira `wheat7` → +1 trigo; mato quebrável        |
| 4 hidratação            | `dfbeac9e`             | a 3 blocos `farmlandWet`, a 8 `farmland`        |
| 5 reprodução            | (sem código novo)      | `qa-roquecraft-pecuaria`: `nasceuFilhote: true` |
| 6 muda → árvore         | `77bd12d0`             | `oakLog` com 6 de tronco e 30 de copa           |
| 7 cenoura e batata      | `9fefbd68`             | `carrot3` e `potato3` plantadas pelo jogador    |

### O que este goal achou de quebrado que ninguém sabia

1. **A mira atravessava toda planta.** `solidAt` era o único critério e planta
   tem `solid: false`: nunca deu pra quebrar mato neste jogo. Só apareceu
   porque o mato virou a fonte de semente.
2. **O atlas de textura podia deslizar em silêncio.** Duas texturas órfãs na
   folha empurraram 59 camadas duas casas. Nenhum teste olhava o manifesto
   gravado; agora `atlasAlinhado.spec.js` olha.
3. **As sondas de QA não abriam o jogo desde o Goal 15.** Depois de um deploy,
   `dist/pwa` tem o site na raiz e o app em `app.html` — as sondas serviam
   `index.html` e morriam em timeout com o jogo são.
4. **A sonda de jornada importava um módulo que nunca existiu** (`plantio.js`)
   dentro de um `try/catch`: o elo da árvore não podia ficar verde nem com a
   muda funcionando.

### As pendências, e o que foi feito com elas

Fechadas na mesma sessão (13/09), cada uma com mutante e medição no jogo:

- **A lavoura do save voltava morta** (`707166d8`). A fila é reativa e ninguém
  começava a cadeia ao carregar: o broto plantado ontem continuava igual hoje.
  `acordarPlantios` varre o registro de edições e agenda planta, muda e
  canteiro. Medido: `wheat0 → sem acordar: wheat0 → acordando 33: wheat7`.
- **O sorteio do crescimento saiu do `Math.random` interno** (`1e90b45f`): o
  pre-push reprovou com `expected 168 to be 170` e o código certo. E o sorteio
  do teste não pode ser `() => 0` — com ele o mutante sem reagendamento PASSA,
  porque cada avanço chama `editar` e `editar` acorda a própria célula.
- **As 57 sondas voltaram a abrir o jogo** (`5d58a33e`), com portão
  (`sondas-abrem-o-jogo.spec.js`) contra a recaída. Provado no caso que
  quebrava: com o dist COMPOSTO, cerca, construir e lavoura rodaram até o fim.
- **A arte da lavoura** (`d2f26434`): trigo mais denso, raízes com folha em
  leque e a parte comestível à mostra na madura.

Continua aberto, por escolha de escopo:

- Abóbora e melancia existem como bloco, não como cultivo. É onda 4.
