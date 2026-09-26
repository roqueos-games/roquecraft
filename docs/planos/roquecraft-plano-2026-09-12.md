# RoqueCraft — análise profunda e plano de evolução

**Data:** 12/09/2026. **Base medida:** `master` em `6e933cde`.
**Último commit que toca o jogo:** `d8e9fa92`, 29/08/2026. Entre 29/08 e hoje nenhuma
linha de gameplay entrou: a auditoria de 06/09 (`roquecraft-conclusao-java-codex.md`)
foi planejamento e declarou isso.

**O que este documento é:** a análise do estado real do código de hoje, a distância
medida para o jogo de referência, e o plano para chegar lá e passar. Ele não
substitui o plano de 06/09 — assume os marcos M0–M8 dele como válidos e acrescenta
três coisas que faltavam: os números do inventário real, as travas duras que
decidem a ordem, e a resposta à pergunta "onde ficamos melhores que o original".

**O que NÃO foi feito nesta análise, dito como fato:** não rodei teste, lint nem
build. A sessão executa num Linux e o `node_modules` do repo é `darwin/arm64` — o
`vitest` aborta em `rollup/native`. Nenhuma afirmação de desempenho, de contagem de
testes aprovados ou de comportamento em execução aqui é medição. Tudo abaixo que é
número saiu de leitura do código ou de execução dos próprios módulos do jogo com
`node`, e está marcado como tal.

---

## 1. O estado, medido hoje

Contagens obtidas importando `blocks.js`, `items.js` e `recipes.js` com `node` — não
por `grep`, não por lembrança:

| coisa                    | RoqueCraft hoje | de onde veio                      |
| ------------------------ | --------------: | --------------------------------- |
| ids de bloco em uso      |             160 | `Object.keys(BLOCKS)`             |
| maior id alocado         |             160 | idem                              |
| **ids livres até 255**   |          **95** | idem                              |
| blocos que viram item    |              82 | `!semItem`                        |
| itens no registro        |             132 | `Object.keys(ITEMS)`              |
| receitas de bancada      |              57 | `RECIPES.length`                  |
| fundições                |              10 | `SMELTING`                        |
| espécies de criatura     |              12 | `mobs.js`                         |
| biomas                   |              11 | `BIOMES`                          |
| dimensões                |               1 | não há `nether`/`end` no código   |
| altura do mundo          |             128 | `WORLD_HEIGHT`, literal           |
| versão do save           |               8 | `roqueCraftSave.js`               |
| specs de serviço do jogo |             111 | `tests/unit/services/roquecraft/` |
| specs totais do jogo     |             120 | inclui composables e componente   |
| sondas de QA             |              73 | `scripts/qa-roquecraft-*`         |
| linhas de serviço        |         ~19.000 | `wc -l`                           |
| `ROSRoqueCraft.vue`      |           2.545 | era 4.629 em 24/08                |

Duas leituras que valem registro:

**A arquitetura aguentou.** O componente caiu de 4.629 para 2.545 linhas sem
reescrita solta, exatamente pelo método que o loop combinou: extrair junto com a
rodada que passa pelo trecho. Oito composables e 73 serviços depois, a regra 44
está sendo cumprida.

**O motor continua acima do jogo.** Isso já era o diagnóstico de abertura em 24/08 e
segue verdadeiro, agora com mais evidência: greedy meshing, AO, luz propagada,
worker de chunk, céu e clima, quatro perfis de qualidade, física com degrau e
natação, multiplayer por sala, dez idiomas. O que falta não é motor. É conteúdo,
circuito fechado e formato de dados.

---

## 2. A distância para o jogo original

O original tem, em ordem de grandeza: cerca de mil blocos distintos, mais de mil e
quinhentos itens, algo perto de noventa criaturas, mais de sessenta biomas, três
dimensões e altura de 384 (de −64 a 320). A contagem exata por versão é entrega de
M0 — e a fonte é o `Java Edition data values` do wiki, não memória.

A comparação honesta não é razão de números. É por sistema:

| sistema       | RoqueCraft                                                | falta para a experiência                                            | o que bloqueia              |
| ------------- | --------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------- |
| Mundo         | seed determinística, 11 biomas, cavernas, minérios        | estruturas, vilas, cavernas grandes, altura, dimensões              | T1 e T2                     |
| Construção    | laje, escada, cerca, portão, cama, tocha de parede        | porta, alçapão, escada de mão, botão, alavanca, placa, muro, parede | T1 (id) e arte              |
| Materiais     | 4 madeiras, 1 delas em cerca/portão                       | as outras 3 em cerca, portão, escada, laje, porta                   | T1 — é aqui que o id acaba  |
| Sobrevivência | vida, fome, saturação, morte, cama, XP                    | **agricultura não existe**: `wheat` é item sem semente e sem solo   | nada — é trabalho           |
| Comida        | 4 cozidas/cruas, pão, maçã, melancia                      | cadeia renovável de verdade; criação por espécie                    | agricultura                 |
| Equipamento   | 4 tiers de ferramenta com durabilidade                    | **armadura, escudo, offhand e arco do jogador não existem**         | arte (tile novo) + sistema  |
| Combate       | golpe com recarga, crítico, empurrão; flecha do esqueleto | arco do jogador, projétil do jogador, resistência por armadura      | idem                        |
| XP            | acumula e tem barra                                       | **nenhum consumidor**: sem encantamento, sem bigorna                | nada — é trabalho           |
| Poções        | —                                                         | fermentação inteira, caldeirão, ingredientes                        | nada — é trabalho           |
| Redstone      | só o **minério** e o pó                                   | energia, propagação, ordem de tick, pistão, funil, repetidor        | T2 (tick de mundo) + T1     |
| Transporte    | —                                                         | barco, trilho, carrinho                                             | entidade com física própria |
| Comércio      | —                                                         | aldeão, vila, profissão, preço                                      | estrutura + IA de mob       |
| Dimensões     | uma                                                       | Nether, End, portal, chefe final                                    | **T2 — não há onde nascer** |
| Persistência  | Firestore, 1 documento por usuário, teto de 240k números  | armazenamento por chunk, backup, múltiplos mundos                   | T3                          |
| Multiplayer   | RTDB, presença, blocos, mobs, chat                        | autoridade, economia compartilhada, containers, reconexão           | **T4**                      |
| Interface     | desktop, toque, 10 idiomas, primitivos ROS                | remapeamento, acessibilidade, jornada completa no toque             | nada — é trabalho           |

**A conclusão que importa:** a distância não está distribuída por igual. Quatro
travas seguram a maior parte da lista, e três delas são de formato de dados, não de
conteúdo. Enquanto elas estiverem de pé, cada rodada de conteúdo fica mais cara que
a anterior — e a partir de certo ponto algumas param de ser possíveis.

---

## 3. As quatro travas duras

### T1 — o espaço de id acabou (95 livres de 255)

A rodada 6 recusou o byte de estado por voxel com um argumento correto e deixou a
condição escrita: _"o byte fica pro dia em que a forma depender de algo que o id não
sabe"_. **Esse dia chegou**, e a conta é aritmética, não opinião:

| peça a acrescentar                       | ids que custa |
| ---------------------------------------- | ------------: |
| cerca, 1 madeira                         |            16 |
| portão, 1 madeira                        |             8 |
| escada, 1 material                       |             8 |
| laje, 1 material                         |             2 |
| porta (2 metades × 4 orient × 2 abertas) |            16 |
| escada de canto, 1 material              |       mais 16 |

Completar cerca + portão + escada + laje nas três madeiras que faltam (bétula, selva,
pinheiro já tem laje/escada) custa perto de 90 ids. **É o estoque inteiro, e sobra
nada para porta, alavanca, placa, muro, Nether ou End.**

Não estou reabrindo a decisão da rodada 6: estou dizendo que a condição que ela mesma
escreveu foi atingida, com número. E a saída não é o byte global que ela recusou — é
**paleta por chunk**: cada chunk guarda a lista dos blocos que usa e o voxel guarda o
índice dentro dessa lista. Um chunk de terreno usa 8 a 12 blocos distintos; o índice
continua cabendo em um byte na esmagadora maioria, e o chunk que precisar de mais
sobe para 16 bits **sozinho**. O custo que a rodada 6 recusou (32 KB paralelos em
todo chunk) não acontece: a paleta de um chunk tem dezenas de bytes.

O que isso atravessa, e precisa de `blast` antes: mesher, worker, save v8, diffs do
RTDB, `edicoes.js`, `chunkStore`. É a mudança mais cara do plano inteiro e é a que
destrava metade da tabela acima.

### T2 — uma dimensão, 128 de altura, tudo literal

`WORLD_HEIGHT = 128` é constante, `y` vai de 0 a 127, e não existe `minY`, `maxY`,
`dimensionId` nem `worldId` em lugar nenhum. Nether e End não estão "faltando": não
há onde eles nascerem. Chunk, worker, save, mesher e rede todos assumem uma coluna
única de 128.

Sem isto: sem Nether, sem End, sem chefe final, sem caverna profunda, sem montanha
alta. Com isto: os quatro de uma vez, porque passam a ser conteúdo e não arquitetura.

### T3 — a integridade do progresso (P0 ainda abertos)

Conferido hoje, no código de hoje:

- **RC-01, de pé.** `bancada.js` — `montarDireto` confere os ingredientes antes de
  gastar (foi corrigido, e a nota de aviso está no arquivo), mas o resultado entra
  por `addItem(inv, receita.result, receita.count)` **sem checar se coube**.
  `devolverAoInventario` faz o mesmo com o cursor e a grade. `addItem` acomoda o que
  cabe e **descarta o resto em silêncio**. Inventário cheio + craft = ingrediente
  gasto, resultado no lixo.
- **RC-02, de pé.** `ROSRoqueCraft.vue:729` — `catch` do `loadRoqueCraft` só faz
  `console.error`, e o fluxo segue para `estadoInicial({ salvo: null })`. Falha de
  leitura é indistinguível de save inexistente, e o autosave grava por cima. **Uma
  queda de rede no boot apaga o mundo de quem jogou meses.** É o defeito mais caro
  da lista, e é de uma linha de política, não de arquitetura.
- **RC-03, de pé.** Restauração solo depois de sala guarda seed e ticks, não a sessão.
- **RC-04, de pé.** Ver T4.

### T4 — não existe autoridade no multiplayer

`firebase/database.rules.json`, conferido hoje:

```
"blocks": { ".write": "auth != null", ... }
"hits":   { ".write": "auth != null", ... }
```

Qualquer usuário autenticado do RoqueOS escreve bloco e dano **em qualquer sala**,
sem ser membro dela, sem validação de alcance e sem ritmo. `mobs` é a única que
exige ser o host. Não é hipótese de exploração: é o que a regra literalmente permite.
Isso bloqueia toda a onda de cooperação — não dá para compartilhar baú, forno ou
economia por cima de um canal onde qualquer um escreve qualquer coisa.

---

## 4. Onde já somos melhores, e onde podemos ser muito melhores

A pergunta "ser mais capaz que o original" não se responde contando blocos. Contando
blocos a gente perde para sempre, e perder para sempre é a definição de meta errada.
Responde-se pelo que a plataforma permite e o original não pode fazer.

### O que já é vantagem, hoje, sem escrever uma linha

| vantagem                      | o original                                  |
| ----------------------------- | ------------------------------------------- |
| Abre no navegador             | precisa de client instalado e de conta paga |
| Mesma URL em 5 alvos          | build por plataforma                        |
| Save na conta                 | save no disco da máquina                    |
| Sala por código, sem servidor | servidor ou realm                           |
| 10 idiomas desde o nascimento | idioma por pacote                           |
| Roda dentro de um SO          | é o aplicativo inteiro                      |
| Atualiza sozinho              | launcher, versão, mod que quebra            |

### O que pode virar vantagem — e o pedágio de cada uma

Isto é **proposta**, não decisão. Cada linha tem o custo escrito porque proposta sem
custo é publicidade.

**1. Mundo grande de verdade, por WASM.** `worldgen`, mesher e luz em Rust ou
AssemblyScript compilado para WASM dão o orçamento que hoje limita distância de
render e altura. Ganho: T2 fica barata. Custo: uma cadeia de build nova no repo e um
contrato de memória com o worker. **Pedágio: o perfil `low` continua sendo o dono do
orçamento — WASM que só ajuda no desktop não entra.**

**2. Armazenamento de verdade, por OPFS.** Hoje o mundo inteiro é **um documento do
Firestore**, com teto duro de 1 MiB por documento e o teto interno de 240.000 números
que `edicoes.js` aplica para não estourar. OPFS (Origin Private File System) com
gravação por chunk acaba com os dois tetos, permite mundo grande, backup, exportar e
importar, e múltiplos mundos. Custo: camada de storage nova e migração do save v8.
**Isto é o que transforma "meu mundo" em "meus mundos", e o original só faz isso
porque tem disco.**

**3. WebGPU.** Hoje ele está em todos os navegadores principais, Safari do iOS 26
incluído. Compute shader para luz e para mesher é ganho real. **Pedágio, e é a regra
que já custou o jogo do founder uma vez: shader e GPU não sobem sem print do
aparelho-alvo. WebGPU entra como caminho PARALELO ao WebGL, com queda automática,
nunca como substituição.**

**4. Multiplayer com autoridade, por WebTransport ou DataChannel.** O RTDB é um banco
sincronizado, não um canal de tick: ele é ótimo para presença e chat e é o motivo de
`hits` existir como caminho aberto. Host autoritativo sobre um DataChannel resolve
T4 pela raiz. Custo: sinalização (que o RTDB já pode fazer) e o host que cai.
**Atenção ao que NÃO dá:** `SharedArrayBuffer` e pool de workers com memória
compartilhada exigem `Cross-Origin-Embedder-Policy: require-corp`. O `firebase.json`
hoje serve `Cross-Origin-Opener-Policy: same-origin-allow-popups` e **não** serve
COEP — e desde o Goal 15 a origem é dividida com o `roqueos-site`. Ligar COEP
quebraria o site inteiro e o popup de auth do Firebase. Pool de workers, então, é com
`postMessage` e transferência, não com memória compartilhada. Isso é decisão, não
limitação a contornar.

**5. O jogo na TV.** O Big Picture existe, o D-pad existe, o `RCMobile.vue` existe. O
RoqueCraft com Gamepad API no modo TV é uma vantagem que o original tem só no
console pago. Custo: camada de ações nomeadas com adaptadores, que o M0 já prevê por
outro motivo (remapeamento).

**6. A IA do RoqueOS dentro do jogo.** É a vantagem que ninguém pode copiar, porque
depende do produto em volta. Três formas, da mais barata para a mais cara: um
companheiro que responde pergunta sobre o próprio mundo ("onde tem ferro perto
daqui"); um construtor assistido que recebe descrição e devolve uma estrutura
colocável (com prévia e desfazer, nunca aplicação direta); um NPC com objetivo. **A
primeira cabe numa rodada. A terceira é um produto.** Nada disto entra antes das
ondas 0 a 2 — jogo com save frágil e sem autoridade não ganha IA, ganha bug com
vocabulário.

**7. Mundo compartilhado por link.** Save na conta + armazenamento por chunk =
publicar um mundo como link somente-leitura, que qualquer pessoa abre no navegador
sem instalar nada. O original precisa de servidor para isso.

---

## 5. O plano, em ondas

Regra da casa aplicada aqui: **regra sem mecanismo é decoração.** Cada onda declara o
que impede a regressão dela — e mecanismo não é "vou lembrar", é teste, gate, guard
ou sonda que **reprova** quando quebrado.

### Onda 0 — o chão de medição (curta, e é pré-requisito de tudo)

O M0 da auditoria de 06/09, reduzido ao que trava as outras ondas:

1. Montar o componente de verdade num teste e executar: abrir, primeira noite, salvar,
   recarregar, entrar em sala, sair. Hoje a spec do componente só confere que ele
   exporta.
2. Triar as 73 sondas: quais fazem assertion e quais só imprimem. Uma sonda que falha
   tem que sair com código diferente de zero. **Teste de mutação: quebre uma de
   propósito e confirme que o CI reprova.**
3. Capturar a linha de base em aparelho real (desktop e o iPhone), com seed, distância,
   resolução e duração registradas.
4. A matriz de referência: mecânica, regra do original, o que temos, decisão de
   adaptação, teste. É ela que substitui "achamos que falta" por "falta isto".

**Mecanismo:** o gate do front passa a exigir a spec de montagem do componente; a
triagem vira um manifesto com a lista das sondas que reprovam.

### Onda 1 — o progresso para de poder sumir (P0)

RC-01 a RC-04, em PRs pequenos e nessa ordem. RC-02 primeiro: é o de maior dano e o
mais barato.

**Critério:** inventário cheio nunca perde item — a operação recusa inteira ou devolve
a sobra explicitamente. Falha de leitura no boot bloqueia o autosave e aparece na
tela. Solo → sala → solo devolve inventário, vida, posição, edições e mobília, com a
mesma seed e com seed diferente. O emulador do RTDB recusa não membro.

**Mecanismo:** teste de conservação que soma o inventário antes e depois de cada
operação; teste do emulador com caso negativo; e o guard que já existe em
`montarPayloadDeSave` estendido para a porta de gravação.

### Onda 2 — o formato que destrava o resto (T1 + T2 + T3)

A onda mais cara e a que paga por mais tempo. Em fatias compatíveis, cada uma com
migração testada contra fixture de save v8 real:

1. `worldId`, `dimensionId`, `schemaVersion`, `generatorVersion`. Seed não identifica
   sessão.
2. Paleta por chunk. `blast` obrigatório antes de tocar: mesher, worker, save, RTDB,
   `edicoes.js`.
3. `minY`/`maxY` centralizados; os literais 126/127/128 saem do código.
4. Armazenamento por chunk em OPFS, com o Firestore como sincronização e não como
   disco. Backup, exportar, importar, múltiplos mundos.

**Critério:** fixture v8 abre sem perda; mais de 256 estados fazem ida e volta; 100 mil
edições não truncam; queda no meio da gravação recupera o último commit válido.

**Mecanismo:** teste de migração com save real congelado no repo; guard que reprova
qualquer literal de altura fora do módulo de dimensão.

### Onda 3 — a sobrevivência fecha o círculo

Agricultura inteira (semente, enxada, solo arado, água, crescimento, colheita,
replantio), árvore renovável, dieta e reprodução por espécie, cozimento coerente,
cama e renascimento revalidados. Fechar a corrente madeira → ferramenta → pedra →
forno → ferro → base sem nenhum atalho de QA.

**Critério:** jogador novo, seed nova, inventário vazio, sobrevive cinco noites,
produz comida renovável e se recupera da morte. Sem `give`.

**Mecanismo:** uma sonda de jornada que joga a sequência inteira e reprova se algum
elo exigir item inalcançável — e ela **não** usa o gancho de E2E para entregar item.

### Onda 4 — equipamento e progressão

Armadura, escudo, mão secundária, arco e flecha do jogador, resistência e dano com
feedback. XP com consumidor: encantamento, bigorna, custo. Fermentação e poções.

**Bloqueio conhecido:** item novo precisa de tile novo no atlas, e arte está congelada
por decisão do founder desde 24/08. **Esta onda não começa sem essa decisão ser
reaberta explicitamente.** Está dito aqui como fato, não como pedido.

### Onda 5 — cooperação de verdade

Host autoritativo, intenção validada, baú e forno compartilhados, drop e projétil
visíveis, tempo e clima sob uma autoridade só, reconexão, saída do host. Remove o
truncamento de 8.000 edições da sala.

**Critério:** 2 a 4 clientes constroem, trocam, morrem e reconectam sem duplicar nem
perder, com 150 ms de latência e 1% de perda simulados.

### Onda 6 — Nether, End e o desafio final

Só é possível depois da onda 2. Portal com destino seguro nos dois sentidos, geração
própria, recursos que a progressão exige, estrutura do End, chefe, recompensa e
retorno.

**Critério:** partida nova chega ao final por ações normais, no desktop e no toque,
salvando e reabrindo em cada dimensão.

### Onda 7 — automação e construção

Redstone com energia, propagação e ordem de atualização definida (a `filaDeAtualizacoes`
que faz a areia cair é a semente disso), pistão, funil, repetidor. Transporte. Porta,
alçapão, escada de mão, botão, alavanca, placa — todos baratos **depois** da paleta.

**Escopo declarado antes de começar:** qual subconjunto de circuito é suportado e o
que difere do original. Prometer equivalência de circuito sem essa lista é promessa
que alguém confere.

### Onda 8 — as tecnologias que passam o original

WASM, OPFS avançado, WebGPU paralelo, TV com gamepad, IA do RoqueOS, mundo por link.
**Depois, nunca antes.** Cada uma entra com a mesma barra: evidência no aparelho-alvo,
perfil `low` como dono do orçamento, e queda automática para o caminho antigo.

---

## 6. O que não vamos fazer, dito agora

- Compatibilidade com servidor, mod, save ou resource pack do original. O carregador
  de textura atual não é isso e não vira isso.
- Paridade de contagem: mil blocos e mil e quinhentos itens não são meta. A meta é
  jornada completa, e a matriz de M0 é que diz quais itens ela exige.
- Reescrita do render ou troca de stack. Vue, JavaScript, yarn e os primitivos ROS
  ficam.
- Mexer no visual aprovado. A folha de contato continua sendo rede de proteção, e o
  passo 6 do método segue inegociável.

---

## 7. Pendências, como fato

- Não rodei teste, lint nem build nesta análise: o `node_modules` do repo é de macOS
  e a sessão executa em Linux. A verificação de execução fica pendente e tem que ser
  feita no terminal da máquina.
- `public/jogos/catalogo.json` está modificado na árvore de trabalho — só reformatação
  do prettier, de outra sessão. Não toquei.
- O defeito pré-existente de WebGL ao trocar o perfil para `low` em execução (dois
  `INVALID_OPERATION` no console) continua no backlog desde a rodada 5, não conferido
  nesta análise.
- A onda 4 depende de uma decisão do founder sobre arte nova no atlas. Sem ela, a
  onda não tem como começar.
- A proposta de congelar a comparação em uma versão documental do original (feita em
  06/09) continua sem resposta do founder.
