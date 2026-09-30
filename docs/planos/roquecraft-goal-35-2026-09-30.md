# RoqueCraft, Goal 35: o mundo que cresce (30/09/2026)

Pedido do founder, textual: "vamos analisar e planejar as próximas evoluções do
RoqueCraft, quero que você analise ele profundamente para criar um grande goal
para evoluirmos muito o nosso projeto, me traga um plano completo do que podemos
fazer".

Este documento é análise e plano. Nenhuma linha de código foi tocada. Tudo que
tem número aqui foi medido em 30/09/2026 no repo `roqueos-games/roquecraft`
(`main`, `9b76e11`, clone em `~/workspaces/roqueos-repos/roquecraft`), salvo
onde diz o contrário. O que é estimativa está escrito como estimativa.

A direção que vale continua a de 12/09, dada pelo founder: cumprir tudo o que o
original faz **e** ser mais capaz. E as regras que não se reabrem continuam:
só asset CC0/MIT/BSD/domínio público (nada do original); o perfil `low` é dono
do orçamento de desempenho; nenhuma sonda desliga a mão do jogador nem monta o
enquadramento que ela julga; a arte está congelada desde 24/08 (a liberação de
18/09 cobriu porta, alçapão, portão, armadura, arco e escudo, e só).

---

## 1. Onde o jogo está, medido

### 1.1 O repo

| o quê | medido |
| --- | --- |
| pacote | `@roqueos-games/roquecraft` 0.1.1, MIT, `main`; tags v0.1.0 e v0.1.1 |
| no RoqueOS | `roqueos-front/package.json:92` pina `github:roqueos-games/roquecraft#v0.1.1`; SDK `jogo-sdk#v0.3.0` |
| código | `src/JogoRoqueCraft.vue` 2.301 linhas; `src/servicos/` 137 arquivos (+ `render/` com 11); 16 composables; 13 componentes `RC*`; i18n em 10 idiomas |
| testes | 229 arquivos em `test/`, 3.310 `it(` contados por grep; CI (`ci.yml`) roda `yarn verificar` = lint + prettier + vitest + `jogo check`, `timeout-minutes: 10`, runner `ubuntu-latest` |
| sondas | 112 `qa/qa-roquecraft-*.mjs`; a varredura `qa/qa-roquecraft-varredura.json` registra 107 (105 verde, 2 humana), a mais antiga de 18/09 e a mais nova de 26/09 |
| host | `host.avisar` (6 usos), `salaAoVivo` (4), `progresso` (2), `idioma` (2), `ia` (2), `desempenho` (2), `teclado` (1), `identidade` (1). `jogo.json` declara `capacidades: ["salaAoVivo", "progresso"]`; `ia` e `teclado` são opcionais e o jogo funciona sem |
| save | `roqueCraftSave.js:276` grava `version: 12`; um documento por conta (`users/{uid}/roqueos/roquecraft`) com `worldId` |
| conteúdo | 254 blocos (maior id 254), 192 itens, 90 receitas, 11 fundições, 14 criaturas, 3 dimensões (overworld, nether, end) |
| ids | `TABELA_DE_IDS = 512` (`blocks.js:30`); **257 ids livres até 511**; o mundo aceita 65.535 pela paleta por chunk (`paleta.js`, onda 2 de 13/09) |
| render | `three` 0.171.0, `WebGLRenderer` (`render/engine.js:352`); um `Worker` de chunk (`worldClient.js:133`) |

Correção de uma medida minha de ontem: contei "1 id livre" contra um teto de
255. O teto de 255 caiu em 13/09 com a paleta por chunk; as tabelas por id
foram para 512 em 18/09 (`blocks.js:19-30`), e `tabelasPorId.spec.js` cobra
que nenhuma volte ao literal. O espaço de id **não é mais a trava**. A trava
que sobrou dele está em outro repo (§1.4).

### 1.2 O que os goals 17 a 23 fecharam (para não propor o que já existe)

Redstone existe: fio com 16 níveis, tocha, alavanca e lâmpada, com a rede
inteira recalculada por mudança e teto de 4.096 células (`redstone.js`).
Encantamento, poções com efeito, nível II, prazo dobrado e frasco arremessável
(`arremesso.js`) existem. Aldeia com casas que fecham, aldeão com rotina, comércio
e fala por LLM quando o host tem `ia`. Nether e End completos, com fortaleza,
olho que aponta, dragão, portal de saída e créditos. Armadura, arco, escudo.
Porta, alçapão, portão. Multijogador com autoridade: presença, blocos por chunk,
mobília com compare-and-set, intenção validada, sucessão do anfitrião, volta da
queda, chat, relógio do anfitrião (Goal 21, ondas 6.1 a 6.4). HUD honesto, olho
de contato, skins (Goal 22). Menu K com abas, foco por teclado, teleporte entre
dimensões (Goal 23, ondas 1 a 3).

### 1.3 O que o original faz e o RoqueCraft ainda não (zero ocorrências em `src/`)

Contado por grep, em português e inglês, em 30/09: pistão, repetidor, funil,
botão, placa de pressão, vagonete e trilho, barco, cavalo, placa de texto,
bigorna, pesca, tingimento de lã e vidro, gamepad, conquistas, tutorial guiado,
exportar ou importar mundo, vários mundos por conta. Mobs: 14 espécies; sem
enderman, blaze, lobo, golem (a lista do Goal 21 §1.3 continua valendo aqui).

### 1.4 As travas de agora, uma a uma

**A. O save para de gravar na conta (P0, aberto desde 26/09).** `serializeInventory`
e `outrasDimensoes` escrevem array dentro de array; o Firestore 12.7.0 recusa
(`Nested arrays are not supported`). Pela leitura do código: qualquer item no
inventário, ou a primeira travessia de portal, e o autosave passa a cair em
`aoFalhar` em silêncio. Quatro `it.fails` documentam o defeito:
`test/composables/salaComHostFalso.spec.js:283`, `test/jogoRoqueCraft.spec.js:387`,
`test/servicos/saveNaConta.spec.js:86` e `:177`. Não reproduzi com conta no
Firestore de produção. É a coisa mais cara da lista: é progresso sendo perdido
hoje, se a leitura estiver certa.

**B. Um mundo por conta.** O save é um documento só, com `worldId`. "Novo mundo"
troca a semente (a sonda `entrada` mede isso) e o autosave seguinte substitui o
documento. Pela leitura: começar um mundo novo apaga o anterior. Não reproduzi
com conta. Para um jogo cujo valor é "meses de construção", isso é perda de
dados por desenho, não por defeito.

**C. O teto de 255 mudou de repo.** A regra do RTDB no front
(`roqueos-front/firebase/database.rules.json`, nó `roquecraftRooms/$code/blocks/$chunk/$li`)
valida `newData.val() <= 255`. O jogo aceita ids até 511 nas tabelas. Hoje o
maior id é 254: **o segundo bloco novo (id 256) é recusado pela sala em
silêncio**, porque escrita recusada resolve `false` e ninguém avisa. É contrato
entre repos, e nenhum teste dos dois lados liga o literal da regra ao
`TABELA_DE_IDS` do jogo.

**D. A varredura das sondas é herdada.** Das 107 registradas, 8 rodaram contra
este repo (26/09, `qa/README.md`); as outras 99 são o veredito de 18/09 contra o
front, antes da extração. A régua `sondas-varridas.spec.js` aceita 21 dias de
folga: **em 09/10 o `yarn test` fica vermelho sozinho** se ninguém rodar
`node qa/qa-sondas.mjs` (cerca de uma hora). As sondas que precisam de duas
contas no Firebase não têm como rodar no host de desenvolvimento.

**E. O orçamento de quadro não é cobrado em lugar nenhum.** O runner do CI tem 2
vCPU e o frame budget deixou de ser afirmado nele na extração (plano de 25/09).
`qa/bench-mesher.mjs` existe e mede, mas nada lê o resultado dele.

**F. Nenhum aparelho-alvo, nunca.** Todos os goals desde 24/08 fecham com "no
iPhone não foi visto". A sonda `mobile` roda WebKit e Chromium no Mac com
qualidade `low` (703 seções, ~110 mil triângulos). É aproximação, não evidência.

**G. Goal 23 ficou pela metade.** Ondas 4 (lugares, coordenada digitada, voltar
de onde veio), 5 (busca no inventário criativo) e 6 (trânsito entre menus) estão
desenhadas, decididas pelo founder em 19/09, e não feitas. A sonda de teleporte
achou o retorno pousando em `spruceLeaves` (`acharPouso` aceita folha).

**H. Quatro pendências assumidas travadas por arte ou asset:** flecha cravada não
vira item (`useRoqueCraftEntidades.js:294`), veneno e lentidão em criatura
(`:340`), chiado e estouro do creeper sem áudio CC0 (`:429`), carne podre do
zumbi (`mobs.js:109`).

**I. Mutação é à mão.** Stryker não está no repo. Cada conserto tem uma mutação,
feita por pessoa. Funciona e não escala para 3.310 testes.

**J. A instrução do Projeto sobre "a tarefa programada do RoqueCraft a cada 6
horas" está velha:** medido em 25 e 27/09, essa tarefa não existe mais.

---

## 2. Onde somos melhores, e o que vira vantagem

A tabela de 12/09 continua verdadeira: abre no navegador, mesma URL em cinco
alvos, save na conta, sala por código sem servidor, dez idiomas, roda dentro de
um SO, atualiza sozinho. Desde então somaram-se: repo público MIT que qualquer
um clona e roda (`yarn dev`), sala entre abas sem rede no host de
desenvolvimento, e o aldeão que conversa por LLM com a chave no servidor.

O que ainda pode virar vantagem e o original não tem: mundo que viaja por link
(a sala já é um link; o mundo salvo ainda não), o RoqueOS como guia dentro do
jogo (`ia` já está no contrato), TV com controle (o RoqueOS já roda na TV; o
jogo não ouve gamepad), e conquistas no Pódio do sistema (`entraNoPodio: false`
hoje).

---

## 3. As ondas, em ordem de dano ÷ custo

Cada onda fecha do mesmo jeito dos goals 21, 22 e 23: regra pura em módulo
próprio, teste ao lado com mutação que reprova, sonda no jogo, `yarn verificar`
verde colado no chat, commit e push, registro no fim deste arquivo. Nada é
declarado pronto por inferência; o que fica sem medir é escrito como fato.

### Onda 0: a régua, antes de qualquer conteúdo

**0.1 O save volta a gravar.** Formato v13 sem array aninhado: `outrasDimensoes`
vira lista de objetos `{ id, recorte }` (ou mapa por id) e o inventário vira
lista de objetos ou strings; `parseSave` lê v12 e v13, como já lê v1 e v2.
Os quatro `it.fails` viram `it`. Mecanismo: já existe. O host do SDK 0.3.0
recusa array dentro de array com a mesma mensagem do Firestore
(`jogo-sdk/src/host/progresso.js:47`), e é por isso que os quatro testes
reprovam hoje. Mutação: voltar uma linha ao formato aninhado e os quatro
reprovam de novo. Critério: sonda
`persistencia` com item no inventário e depois de um portal, e **uma gravação
real com conta** no Firestore de produção, olhando o console do autosave. Blast:
`roqueos-graph blast src/servicos/roqueCraftSave.js` (rodar antes de tocar; a
regra do Firestore é `users/{uid}/roqueos/{document=**}` e não conhece o
formato, então a expectativa é raio vazio, mas é o comando que diz).

**0.2 O teto de 255 vira contrato com teste.** A regra do front passa a
`<= 511` e um teste no front (`tests/rules/roquecraftRoom.rules.spec.js`, no
emulador) importa `TABELA_DE_IDS` do pacote do jogo e prova: id 300 aceito, id
512 recusado, literal da regra igual a `TABELA_DE_IDS - 1`. No jogo,
`tabelasPorId.spec.js` ganha o espelho: `maior id < TABELA_DE_IDS`. Mutação:
mudar o literal da regra → o teste do front reprova; registrar o bloco 512 → o
do jogo reprova. Blast obrigatório antes de editar
`roqueos-front/firebase/database.rules.json`. **Deploy de regra é passo
irreversível: para e pergunta.** Precisa estar feito antes do segundo bloco novo
de qualquer onda.

**0.3 A varredura passa a ser deste repo.** `node qa/lib/preparar-dist.mjs` e
`node qa/qa-sondas.mjs` inteiro no Mac; as que exigem duas contas no Firebase
saem com `humana` ou `nao-rodou` com motivo escrito, nunca verde herdado. O
mecanismo já existe (`sondas-varridas.spec.js`, teto zero, folga 21 dias). O
que muda é o ledger. Prazo dado pela régua: 09/10.

**0.4 O orçamento de quadro ganha ledger.** `bench-mesher.mjs` grava
`qa/bench-mesher.json` com data, máquina e custo por seção; uma régua no molde
da varredura cobra idade (21 dias) e teto (o valor de hoje, medido antes de
qualquer onda de conteúdo, mais 10 %). Mutação: dobrar o custo à mão no JSON →
reprova. Não é o frame budget no iPhone (isso continua sem evidência, §1.4 F);
é a única régua de custo que cabe numa máquina de verdade.

**0.5 O Goal 23 fecha.** Ondas 4, 5 e 6 como desenhadas em
`roquecraft-goal-23-2026-09-19.md`, mais `acharPouso` recusando folha
(`nascimento.js` já tem `topoDoSolo` e `apoiadoEmArvore`). Sondas `teleporte` e
`navegacao` estendidas. Sem decisão nova: tudo já foi decidido em 19/09.

### Onda 1: mundos (vários por conta, exportar, importar, por link)

É a resposta à trava B, e é onde o jogo mais perde para o original hoje.

**1.1 Vários mundos.** Documento de índice `users/{uid}/roqueos/roquecraft`
continua sendo "o mundo atual" (compatibilidade com quem já tem save) e cada
mundo mora em `roqueos/roquecraft-<worldId>`. A regra do Firestore já cobre
(`{document=**}`). O que não cobre é o contrato: `progresso` dá **um** documento
por jogo (`contrato.js:215`). Precisa de `progresso.carregar({ chave })` e
`salvar(dados, { chave })`, ou capacidade nova. **É mudança de forma de
capacidade: versão nova do SDK (0.4.0), host do front, host de desenvolvimento e
host falso, nessa ordem, com `blast` do `jogo-sdk` antes.** Há um desenho de
0.4.0 no Projeto (`desenho_app_sdk_040_2026-09-28.md`): conferir se já prevê
isso antes de desenhar de novo. Tela: lista de mundos no `RCStart` (nome,
semente, dimensão em que parou, data), criar, renomear, apagar com confirmação.
Mutação: `salvar` sem `chave` gravando por cima do índice → reprova. Critério:
dois mundos na mesma conta, jogados alternadamente, reabrem cada um no lugar
certo, no host falso e com conta de verdade. Limite a medir antes: o tamanho do
documento de um mundo jogado (Firestore recusa acima de 1 MiB); a sonda
`persistencia` já tem o payload real, falta pesar.

**1.2 Exportar e importar.** O mundo como arquivo (`<nome>.roquecraft.json`,
comprimido com `CompressionStream` do navegador, sem dependência), download e
upload pelo `RCStart`. Sem host: é File API. Mesmo `parseSave`, mesma validação
de versão. Critério: exportar, apagar, importar, e o `worldId` e as edições
batem byte a byte. É também o backup que o jogador não tem hoje.

**1.3 Mundo por link.** O jogador publica uma cópia do mundo e o link abre uma
sala com aquele mundo semeado. Precisa de onde guardar a cópia (Storage do
Firebase, com regra nova em `storage.rules`, ou documento público no
Firestore). É contrato com o front e decisão de produto (o que é público, por
quanto tempo, quem apaga). **Desenhar dentro da onda, decidir com o founder,
não começar antes da decisão.**

### Onda 2: redstone e automação (o que falta da onda 7 de 12/09)

Escopo declarado antes de começar, como o plano de 12/09 mandou: qual
subconjunto de circuito entra e o que difere do original.

Entram: botão (6 orientações × 2 = 12 ids), placa de pressão (2), repetidor (4
orientações × 4 atrasos × 2 = 32), pistão e pistão pegajoso (6 × 2 × 2 = 24, mais
6 de cabeça), e porta, alçapão e portão respondendo a energia (já são blocos;
não medi se algum já responde, e `blocoEnergizado` existe em `redstone.js`). Total estimado: 76 ids, dentro dos 257 livres, e
por cima do 255 da regra do RTDB (0.2 é pré-requisito). O pistão é a peça cara:
move blocos, e mover bloco é mexer no mesher, na luz, na fila de atualização e
na sala (edição de mais de um voxel numa intenção). Ficam de fora, ditos agora:
comparador, funil, dispensador, observador, tremonha.

Mecanismo: `redstone.js` puro ganha os novos tipos e a `filaDeAtualizacoes`
ganha atraso (o repetidor precisa de tick com ordem definida); testes de rede
com mutação (anel sem fonte tem que apagar; repetidor de 4 ticks não pode
disparar em 3); sonda `qa-roquecraft-redstone.mjs` montando um circuito e lendo
a lâmpada. Blast: `blocks.js` e `edicoes.js` tocam a sala (formato de edição de
múltiplos voxels).

**Arte: cada bloco novo pede textura, e a arte está congelada.** Esta onda não
começa sem uma liberação explícita do founder, com a lista exata (botão, placa,
repetidor, pistão e cabeça), como foi feito em 18/09.

### Onda 3: transporte e a vida no mundo

Trilho e vagonete (trilho reto, curva e subida: 10 ids; trilho energizado: 4;
vagonete como entidade com a física de `passoFixo`), barco (entidade sobre
`fluidos.js`), placa de texto (bloco com texto guardado na `mobilia` da sala e
no save, como o baú já guarda estado), pesca (vara, minigame de fisgada, o peixe
já existe desde o RC-09), e as quatro pendências de §1.4 H. Lobo e golem como
criaturas 15 e 16, se a arte permitir.

Cada peça é conteúdo em cima de sistemas que existem; nenhuma abre arquitetura
nova. Ordem dentro da onda: placa (só texto e um bloco), pesca (só item e
tempo), trilho e vagonete (entidade nova, a mais cara), barco. Mesmo bloqueio de
arte da onda 2: lista exata para o founder antes de começar.

### Onda 4: cooperação mais funda

T4 fechou no Goal 21. O que a onda 5 de 12/09 pedia e ainda não foi medido:
drop e projétil visíveis pelo convidado, forno compartilhado como o baú, e
**latência simulada** (150 ms e 1 % de perda, via CDP em duas páginas do mesmo
navegador contra o host de desenvolvimento). Primeiro medir o que o convidado
vê hoje (o Goal 22 registrou "o convidado não simula"); depois fechar o que
faltar. Sonda `qa-roquecraft-rede-lenta.mjs` como mecanismo permanente.
Nenhuma mudança de regra do RTDB prevista; se aparecer, é blast e parada.

### Onda 5: o jogo fala com o RoqueOS

**5.1 Controle e TV.** Gamepad API em `useRoqueCraftEntrada` (andar, olhar,
pular, quebrar, colocar, hotbar, menu), no molde da paridade toque × teclado do
Goal 21 Onda 1: uma tabela de ações que teclado, toque e controle têm que
alcançar inteira, e um teste que reprova quando um alcança o que o outro não.
Sonda com `navigator.getGamepads` falso injetado (o CDP não emula controle).
Sem evidência numa TV de verdade, fica escrito assim.

**5.2 Conquistas no Pódio.** `entraNoPodio: false` e `recorde: null` hoje. O
que entra no Pódio é decisão de produto (dias sobrevividos, dragão vencido,
blocos colocados) e muda `jogo.json` e a vitrine (`perfil-da-org` cobra). As
conquistas em si são regra pura (`conquistas.js`) sobre eventos que o jogo já
emite. **Métrica do Pódio: para e pergunta.**

**5.3 O RoqueOS como guia.** O `comoJogar` do `jogo.json` vira os cinco
primeiros minutos guiados (nascer, quebrar, colocar, bancada, noite), com
`host.ia` opcional para responder "como faço X" quando há modelo, e a fala
local quando não há (o mesmo padrão do aldeão). Mecanismo: cada passo do guia é
um estado em `tutorial.js` puro com teste; sonda percorre os cinco.

### Onda 6: desempenho e alcance, só com medida (a onda 8 de 12/09)

Continua "depois, nunca antes". O que muda é que agora existe régua (0.4) para
dizer se vale. Ordem: (a) medir `bench-mesher` e a latência do pipeline de chunk
(`chunkPipeline.js`) no Mac e no WebKit; (b) segundo worker se
`hardwareConcurrency` permitir, só se (a) mostrar fila; (c) WASM no mesher só
se (a) mostrar que o mesher é o custo; (d) WebGPU paralelo (`three` 0.171 tem
`WebGPURenderer`) **só com evidência no iPhone**, com queda automática para o
WebGL. OPFS como cache local de chunks só se a carga do save for o gargalo
medido na onda 1. Cada item entra com o perfil `low` como dono do orçamento e
nada aqui é promessa.

### Transversal (corre junto, não atrasa onda)

- **Mutação automática.** Avaliar Stryker em `src/servicos/*.js` puros, primeiro
  como aviso no CI, com o número de mutantes sobreviventes registrado por onda;
  vira gate quando o número parar de cair. É o mecanismo que faz "check que
  nunca reprovou não é check" escalar.
- **Tamanho.** `JogoRoqueCraft.vue` em 2.301; a catraca continua só descendo, e
  cada onda extrai um composable a mais (a 0.5 já tira o que sobrou do olho).
- **Contexto.** A instrução do Projeto sobre a tarefa de 6 horas sai; o
  `roqueos-context` do kit passa a citar o repo `roqueos-games/roquecraft` como
  casa do jogo. Proposta ao founder no fim.

---

## 4. Onde parar e perguntar, mesmo em loop

- Arte ou áudio novo (ondas 2, 3 e as pendências H): lista exata, uma vez, antes
  da onda.
- Mudança de forma de capacidade do SDK (onda 1.1) e qualquer versão nova do
  `jogo-sdk`.
- Deploy de regra do RTDB, do Firestore ou do Storage (0.2, 1.3).
- Métrica do Pódio (5.2) e o que é público no mundo por link (1.3).
- WebGPU ou shader novo sem evidência no iPhone (onda 6).
- Qualquer toque no `roqueos-front` fora do pin de versão e da regra de 0.2.

## 5. O que NÃO entra, dito agora

Compatibilidade com save, mod, servidor ou resource pack do original. Paridade
de contagem (mil blocos não é meta; jornada completa é). Reescrita do render ou
troca de stack. Mexer no visual aprovado. Asset que não seja CC0/MIT/BSD/domínio
público. Comparador, funil, dispensador, observador (onda 2 declara o
subconjunto). Cavalo e montaria (entidade montável é sistema novo; fica para um
goal seguinte).

## 6. Tamanho, como estimativa

Onda 0 é a menor em código e a maior em valor: 0.1 e 0.2 são dezenas de linhas
cada e fecham duas perdas silenciosas; 0.3 é uma hora de máquina; 0.5 já está
desenhado. Onda 1.1 é a mais cara em contrato (SDK, dois hosts, front) e a
mais barata em jogo. Ondas 2 e 3 são as mais caras em código de jogo (pistão e
vagonete são as duas peças grandes) e as únicas travadas por arte. Ondas 4, 5 e
6 dependem de medição antes de qualquer linha. Cada onda das grandes é do
tamanho de um goal anterior (o 21 fechou sete ondas em um dia de loop; 2 e 3
são maiores que isso).

## 7. O que foi medido e o que não foi

Medido em 30/09/2026 no Mac do founder, pelo Desktop Commander, no repo
`roquecraft` em `9b76e11`: contagens de arquivos, testes, sondas e conteúdo
(`node -e` importando `blocks.js`, `items.js`, `recipes.js`, `mobs.js`,
`dimensoes.js`); `TABELA_DE_IDS` e o maior id; a regra do RTDB no front; o
ledger da varredura (107, datas); `jogo.json`; os usos de `host.*`; a versão do
save; os pins do front.

Não verificado: o save deixando de gravar e o mundo novo apagando o anterior
são leitura de código, não reprodução com conta; nada rodou em iPhone ou TV; os
totais de ids das ondas 2 e 3 são contas de cabeça sobre orientações e estados,
não catálogo escrito; o tamanho do documento de um mundo jogado não foi pesado;
o desenho de SDK 0.4.0 do Projeto não foi lido nesta análise.

---

## 8. Registro das etapas

### Onda 0.1: o save volta a gravar (30/09/2026)

Correção ao §1.4 A: dos quatro `it.fails`, três eram deste defeito
(`saveNaConta.spec.js:86` e `:177`, `jogoRoqueCraft.spec.js:387`); o quarto
(`salaComHostFalso.spec.js:283`) é outro achado, o anfitrião com companhia que
cai e fica na sala como fantasma (`onDisconnect(sala).cancel()` cancela os
filhos). Continua `it.fails`, e entra na Onda 4.

O conserto é uma regra na fronteira, e não um formato novo em cada
serializador: `src/servicos/documentoDoSave.js` embrulha toda lista que está
dentro de lista em `{ _a: [...] }` na ida (`buildSavePayload`, agora v13) e
desembrulha na volta (`parseSave`, que lê v12 e v13 iguais). Uma regra, porque
o v12 aninhava em QUATRO lugares (inventário, outras dimensões, efeitos,
conteúdo da mobília), não em um, e o quinto lugar vai aparecer. O formato em
memória, o da sala e os testes de cada serializador não mudaram. `_a` e não
`l`, que o rebanho já usa.

Medido: `yarn verificar` verde, 230 arquivos e 3.516 testes (eram 3.310 `it(`
por grep; a suíte conta parametrizados). Mutantes, os dois reprovados: sem o
embrulho na ida, 7 testes vermelhos em 4 arquivos; sem o desembrulho na volta,
5 vermelhos em 3. A sonda `persistencia` ganhou item no inventário e passa o
payload real pelo mesmo detector do teste: `versao 13`, `itensNoInventario 9`,
`listaDentroDeLista null`, `erros []`, varredura verde em 7 s.

Não verificado: gravação com conta de verdade no Firestore de produção. O
host falso recusa com a mesma mensagem do Firestore, mas é o host falso.
