# Goal 23 — Chegar em qualquer lugar, e chegar lá pelo teclado

Aberto em 19/09/2026, logo depois de fechar o Goal 22.

## 1. Por que este goal existe

Pedido do founder, em duas partes: **teleporte para as áreas no menu K** e
**melhorar exponencialmente a navegação dos menus**. Medi o estado antes de
planejar, e os dois pedidos apontam para a mesma lacuna.

**O menu K é o painel de criativo** (`RCCriativo.vue`, 277 linhas): hora, clima
e soltar espólio, numa coluna única. As três dimensões existem e estão
registradas em `dimensoes.js` — `overworld`, `nether`, `end` —, mas o único
caminho até elas é o portal, por `travessia.js`. No criativo, onde o jogador
voa e enche o inventário com um clique, ele ainda precisa minerar obsidiana.

**Navegação por teclado dentro dos menus não existe.** Medido: zero `@keydown`,
zero `tabindex`, zero seta ou Tab nos dez componentes de tela. `Escape` fecha a
tela do topo, `E` abre o inventário, `K` o criativo, `T` o chat — e acabou. Uma
vez dentro de um painel, só o mouse funciona. O inventário criativo é uma grade
de todos os blocos rolando, sem busca.

## 2. O escopo, decidido pelo founder em 19/09

**Teleporte** (as quatro opções, todas): as três dimensões; pontos do mundo
(nascimento, cama, fortaleza, vila); coordenada digitada; e voltar de onde veio.
**Só no criativo** — o menu K já só abre lá, e o portal continua sendo o único
caminho na sobrevivência.

**Navegação** (as quatro, todas): teclado e foco em todo menu; busca no
inventário criativo; abas no menu K; trânsito entre menus.

## 3. A restrição que manda na arquitetura

`ROSRoqueCraft.vue` está em **2.291 linhas, teto 2.292**. O Goal 22 abriu 113
linhas e a onda 1 dele consumiu quase todas. Ou seja: **quase nada deste goal
pode morar no componente**. Serviço puro e composable, com a fiação mínima — e
quando não couber, a onda tem que abrir espaço antes, como a 4 do Goal 22 fez.

## 4. A decisão arquitetural que não se reabre

**Teleporte de dimensão NÃO ganha caminho próprio.** `travessia.js` já sabe a
sequência inteira: guardar as edições da dimensão que sai, restaurar as do
destino, reconstruir o mundo (`ctx.resetar`) e pôr o jogador em pé
(`ctx.pousar`). Um segundo caminho que fizesse "quase isso" é a política de
nascimento em três cópias de novo — que custou três rodadas e um jogador
enterrado na montanha. O teleporte entra como porta nova NA travessia, com a
mesma sequência.

E herda as duas recusas dela: **não se atravessa em sala** (a dimensão no
multijogador é outra fatia, e meia promessa é pior que nenhuma) e **mundo ainda
chegando não decide nada**.

## 5. As ondas

### Onda 0 — o olho (mecanismo primeiro)

| #   | etapa                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------- |
| 0.1 | Sonda `navegacao`: percorre cada tela **só pelo teclado** e mede abrir, focar, circular, acionar, fechar e devolver |
| 0.2 | Guarda arquitetural: toda tela da lista de `useRoqueCraftTelas` declara armadilha de foco — a lista é a mesma       |

**Critério:** a sonda reprova quando uma tela deixa o foco escapar para trás do
véu, e o guarda reprova quando uma tela nova nasce sem foco. Sem os dois, a onda
1 é decoração.

### Onda 1 — a malha de foco

| #   | etapa                                                                                            |
| --- | ------------------------------------------------------------------------------------------------ |
| 1.1 | Serviço puro `focoDeTela.js`: ordem dos focáveis, setas e Tab, volta no fim, entrada e devolução |
| 1.2 | Composable que pendura a malha nas sete telas, sem tocar no componente                           |

**Critério:** cada tela abre com foco no primeiro controle, circula sem escapar,
aciona no Enter, fecha no Esc e DEVOLVE o foco a quem a abriu.

### Onda 2 — o menu K vira abas

| #   | etapa                                                                                    |
| --- | ---------------------------------------------------------------------------------------- |
| 2.1 | `RCCriativo` ganha seções (Hora, Clima, Lugares) com navegação por teclado entre as abas |

**Critério:** a aba muda por seta, o conteúdo troca, e o foco entra no conteúdo
da aba escolhida. A aba "Lugares" nasce vazia aqui — a onda 3 é que a enche.

### Onda 3 — as três dimensões

| #   | etapa                                                                           |
| --- | ------------------------------------------------------------------------------- |
| 3.1 | `travessia.irPara(dimensao)`: a MESMA sequência de `atravessar`, sem portal     |
| 3.2 | Pouso pela política comum (`chaoParaNascer`), recusa em sala e fora do criativo |

**Critério:** sonda vai ao Nether, ao Fim e volta, conferindo a dimensão viva e
o jogador em pé sobre bloco sólido nas três. Mutante: recusa em sala removida.

### Onda 4 — lugares e coordenada

| #   | etapa                                                                          |
| --- | ------------------------------------------------------------------------------ |
| 4.1 | Nascimento, cama, fortaleza e vila — pelos serviços que já localizam cada um   |
| 4.2 | Coordenada digitada, com pouso seguro                                          |
| 4.3 | Voltar de onde veio: guarda a posição E a dimensão anteriores a cada teleporte |

**Critério:** cada destino chega no lugar certo, medido por sonda; e voltar
devolve à dimensão de origem, não só à coordenada.

### Onda 5 — a busca no inventário criativo

**Critério:** digitar filtra, o teclado navega o resultado, e Enter põe na mão.

### Onda 6 — trânsito entre menus

**Critério:** ir do inventário ao criativo sem passar pelo jogo, e o foco
acompanhar a troca.

## 6. Onde parar e perguntar

1. **Arte nova** — nada aqui pede desenho novo. Se uma aba precisar de ícone que
   não existe, paro.
2. **Dependência nova no `package.json`** — nenhuma autorizada.
3. **Mudança de mecânica na SOBREVIVÊNCIA** — o teleporte é do criativo. Se algo
   escorregar para a sobrevivência, paro.
4. **Apagar ou mover o que não é meu** — listar e mostrar antes.
5. **Gate vermelho que eu não explico** — relato, nunca `--no-verify` calado.

## 7. O que NÃO entra

- Teleporte em multijogador (a travessia já recusa em sala, e com motivo).
- Gamepad. Teclado e foco primeiro; gamepad é goal próprio e precisa de aparelho.
- Redesenhar o inventário. A onda 5 acrescenta busca, não refaz a grade.
- Mexer no minimapa além de ler o que ele já localiza.

## 8. Registro das etapas

### Registro — Onda 1, a malha de foco (20/09/2026)

As ondas 0 e 1 do plano **viraram uma só**, e o motivo é honesto: uma sonda de
navegação escrita antes da malha nasceria VERMELHA, e sonda vermelha não entra
no ledger nem passa no gate. Mecanismo e implementação saíram juntos — a sonda,
o guarda e a malha no mesmo commit.

`focoDeTela.js` (puro) decide para onde o foco vai: anel que volta no fim,
entrada pela ponta certa quando nada está focado, lista vazia sem dividir por
zero, e de quem é a seta. `useFocoDeTela` pendura nas sete telas o que precisa
de DOM: a entrada, a armadilha e a devolução.

Medido em 20/09/2026: sonda `qa-roquecraft-navegacao` 20/20 no jogo rodando —
inventário (284 focáveis, 286 Tabs, 284 alvos distintos), pausa, criativo e
lobby, e em nenhuma o foco saiu. Suíte 909 arquivos / 11.277 testes. Ledger 104
sondas verdes, 2 humanas. Gate 12/12. 17 mutantes mortos na unidade e 1 NO JOGO
(remover `@keydown` do criativo e o foco-ao-abrir: EXIT=1, 7 casos vermelhos).

**Quatro checks nasceram medindo a coisa errada, e os quatro foram corrigidos —
não afrouxados:**

1. `focaveisDe` filtrava por `offsetParent`, que é sempre nulo no jsdom: a lista
   vinha VAZIA em todo teste de unidade. Agora o que dá para saber sem layout
   sai do serviço, e o que só o layout sabe sai por `checkVisibility` — onde ele
   não existe, esta função não afirma nada, e quem cobre é a sonda.
2. O guarda arquitetural casava a palavra `useFocoDeTela` em qualquer lugar, e o
   COMENTÁRIO que aponta para o composable bastava para ficar verde. Apaguei o
   import e a chamada de uma tela e ele passou feliz. Agora casa o import e a
   chamada.
3. O teste da devolução usava o `<body>` como abridor, e `body.focus()` não tira
   o foco de ninguém: o mutante "devolve sempre" sobrevivia.
4. A sonda identificava o controle focado por `tagName`, e todos os botões de um
   menu viram a mesma string: o inventário contou UM alvo em 286 Tabs e acusou
   "o Tab não moveu o foco" com a navegação funcionando. Agora identifica por
   índice na lista.

**Revisor vue-quasar: 6 desvios, 3 rejeitados e 3 acatados.** Os três rejeitados
eram artefato do material que EU mandei — não stageei RCComercio, RCContainer e
RCLobby, e o revisor os reportou como sem a malha; conferido no repo, os sete
têm import, chamada e `@keydown`, e o guarda arquitetural verde prova.

O mais importante dos acatados era defeito de verdade, e eu não tinha visto: o
painel de criativo tem dois `<input type="range">` — a hora e a chuva —, e num
range **a seta é o jeito de ajustar o valor**. A malha roubava
ArrowUp/ArrowDown, e arrastar o sol pelo teclado deixava de funcionar no mesmo
dia em que a navegação por teclado passou a existir. Agora a seta é do controle
quando o controle a usa (range, select, textarea, número, texto) e o Tab
continua sendo da malha. Os outros dois: `role="dialog"` faltava em RCPause e
RCLobby, e `aria-modal` faltava em todas — enquanto o Tab escapava, chamar
aquilo de modal seria mentira; agora que a malha prende o foco de verdade,
declarar virou obrigação, e a catraca cobra.

NÃO MEDIDO: nada disto foi visto em aparelho de verdade nem com leitor de tela.
A sonda roda em Chromium no desktop, e navegação por teclado é exatamente o
tipo de coisa que um leitor de tela julga diferente.

### Registro — Onda 2, o menu K vira abas (20/09/2026)

O painel de criativo era uma coluna que crescia sem fim, e vai crescer muito
mais: as ondas 3 e 4 acrescentam teleporte ao MESMO painel. Numa coluna só,
chegar ao último controle custa uma rolagem inteira — e pelo teclado, uma volta
inteira de Tab.

Duas abas (Hora, Clima) num `role="tablist"` de verdade: só a ativa tem
`tabindex="0"`, setas e Home/End andam na fila e levam o foco junto, e cada
painel é `tabpanel` amarrado à sua aba nos dois sentidos. A regra de qual-é-a-
próxima mora em `criativo.js`, pura — três noções de "próxima aba" (clique,
seta, leitor de tela) é como as quatro listas de tela nasceram.

`usaAsSetas` passou a reconhecer o `tablist`: num tablist a seta é do grupo de
abas, não da malha de foco. É o padrão ARIA.

Medido em 20/09/2026: suíte 909 arquivos / 11.292 testes. Sondas
`qa-roquecraft-criativo` e `qa-roquecraft-navegacao` verdes. Gate 12/12. 7
mutantes mortos.

Um mutante SOBREVIVEU: apagar a regra do `tablist` em `usaAsSetas` não quebrava
nada, porque o `stopPropagation` do componente já bastava naquela
implementação. Regra sem teste é decoração — o teste foi escrito no serviço
puro, onde a regra vale para todos, e não no componente que por acaso a torna
redundante hoje.

**Revisor vue-quasar: 4 desvios, 1 rejeitado e 3 acatados.** O rejeitado ("falta
`criativo.clima` em en-US") era artefato do material que eu mandei — stageei só
pt-BR; as dez línguas têm a chave, e o gate de i18n prova.

O acatado que importa: os painéis usavam `v-show`, e com `v-show` o conteúdo da
aba escondida CONTINUA no DOM — a malha de foco varre a raiz inteira, e o Tab
pousaria num controle que o jogador não está vendo. No navegador
`checkVisibility` filtraria, mas depender disso é depender de LAYOUT para uma
regra de navegação. Virou `v-if`: fora do DOM não há o que filtrar. Os outros
dois: Home/End na fila de abas, e `aria-orientation` declarado.

A troca para `v-if` quebrou quatro testes antigos do clima e uma sonda — e isso
é sinal de que eles mediam o caminho certo: o clima mudou de endereço, e agora
o teste e a sonda abrem a aba antes, que é o que o jogador faz.

### Registro — Onda 3, as três dimensões no menu K (20/09/2026)

`travessia.irPara(destino)` é a porta nova, e ela NÃO é uma segunda travessia:
`atravessar` passou a aceitar um plano pronto de fora, e a sequência inteira
— guardar as edições de onde se sai, restaurar as do destino, reconstruir o
mundo, pôr o jogador em pé, marcar a imunidade — continua sendo uma só. O que o
teleporte traz de diferente é só PARA ONDE.

`planoDoTeleporte` (puro) escala a coordenada por quem é cada lado: para o
Nether divide por oito, vindo dele multiplica, e com o Fim em qualquer ponta a
coordenada é crua — o Fim é uma ilha em torno da origem, e escalar jogaria quem
está a 4.000 blocos de casa a 32.000 do centro, no vazio.

**Teleporte não constrói portal.** O portal de chegada existe porque quem
atravessa a pé precisa de como voltar; quem teleporta tem o menu. Cavar
obsidiana no mundo de alguém por causa de um clique seria uma edição que o
jogador não pediu e não desfaz.

As três recusas são DITAS: sobrevivência, sala, e a travessia ocupada. Um botão
que não faz nada e não explica é o pior dos três estados.

Para caber no componente (2.292, teto 2.292) saiu `useRoqueCraftOlho`: a
posição da câmera e a profundidade de água moravam a setecentas linhas uma da
outra no mesmo arquivo, e são a mesma pergunta feita duas vezes. Catraca desceu
para 2.276.

Medido em 20/09/2026: sonda `qa-roquecraft-teleporte` 9/9 NO JOGO — supermundo
→ Nether (pousou em soulSand, y=95, vy=0) → Fim (obsidian, y=60) → supermundo,
o botão do destino atual desligado, e ZERO portal cavado nos três teleportes.
Suíte 910 arquivos / 11.320 testes. Gate 12/12. 8 mutantes mortos.

**ACHADO DA PRÓPRIA SONDA, NÃO CORRIGIDO NESTA ONDA:** na volta ao supermundo o
jogador pousou sobre `spruceLeaves` — a copa de uma árvore. `acharPouso` aceita
folha porque folha é sólida, e é o mesmo defeito de classe que o Goal 22
documentou ("folha colide, então o primeiro apoio de cima pra baixo numa
floresta é a copa"). `nascimento.js` já resolve isso com `topoDoSolo` e
`apoiadoEmArvore`; a travessia não usa. NÃO é regressão desta onda — a travessia
a pé sempre pousou assim —, e consertar aqui mudaria o comportamento da viagem
de portal, que ninguém pediu. Entra na onda 4, que já vai mexer em pouso.

Revisor vue-quasar: as cinco questões de arquitetura que eu levantei foram
aprovadas sem achado (o `planoPronto`, a imunidade, a coordenada crua do Fim, a
corrida em `atravessando`, e a coesão da extração do olho). Os 6 desvios que ele
reportou eram TODOS artefato do meu staging — pela terceira vez neste goal
mandei só parte dos arquivos. Conferido no repo: `LUGARES` existe, as seis
chaves novas estão nas dez línguas, e os três specs existem e passam.
