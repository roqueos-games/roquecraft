# GOAL — RoqueCraft: do plano de 12/09 até a paridade, e além

**Aberto em 12/09/2026, a pedido do founder.** Ele autorizou explicitamente o
modo autônomo: _"rode em loop até concluir, suba para produção a cada etapa,
gere evidência, siga automaticamente para a próxima, não fique esperando nenhuma
ação minha"_.

O plano que este goal executa é `.claude/plans/roquecraft-plano-2026-09-12.md`.
Quem retomar o trabalho lê os dois, nesta ordem.

## O que "concluir" significa aqui

Não é chegar ao fim da lista. É cada etapa fechar assim, sem exceção:

1. O defeito ou a lacuna é REPRODUZIDO antes de ser consertado.
2. A regra nova nasce em serviço ou composable — nunca no `.vue` (regra 44).
3. Teste que prova. E **teste de mutação**: quebrar de propósito e confirmar que
   reprova. Check que nunca reprovou não é check.
4. Suíte inteira verde, colada no chat sem resumir.
5. Commit em português, push, merge no `master`, push do `master`.
6. Build, a folha de contato do olho quando a mudança for visível, deploy.
7. Produção conferida — a versão nova respondendo, não o build local.
8. Este arquivo atualizado, e a próxima etapa começa.

## As regras que não se reabrem neste goal

Herdadas de `roquecraft-loop.md` e das regras da casa. Estão aqui porque o modo
autônomo é exatamente onde elas seriam atropeladas por pressa:

- **Nunca enfraquecer um teste para o gate passar.** Se um guard reprova, ele
  está certo até prova em contrário — e a prova é código, não teto novo.
- **Nunca `--no-verify`.** Vermelho de ambiente para e relata.
- **Gráfico congelado.** Nada de shader, textura, luz, modelo ou enquadramento.
- **Shader e GPU não sobem sem evidência no aparelho-alvo.**
- **Só asset CC0/MIT/BSD/domínio público.** Nada da Mojang.
- **yarn, nunca npm.**
- **O perfil `low` é o dono do orçamento de performance.**
- **Nenhuma sonda desliga a mão do jogador, nenhuma constrói o que vai julgar.**
- **Arte nova está congelada por decisão do founder.** A onda 4 (armadura, arco,
  poção) depende de reabrir isso. Não se reabre sozinho.
- **git só pelo Desktop Commander.** O `device_bash` não apaga arquivo, então ele
  deixa `.git/index.lock` órfão e trava o repo. Aconteceu em 12/09.

## Onde parar e perguntar, mesmo em modo autônomo

O founder liberou seguir sem esperar. Isso não cobre três coisas, e elas param:

1. **Arte nova no atlas** — decisão dele, congelada desde 24/08.
2. **Apagar, sobrescrever ou mover o que não é meu** — a regra da casa manda
   listar e mostrar antes.
3. **Um gate vermelho que eu não consiga explicar.** Vermelho inexplicado não
   vira `--no-verify`: vira relato.

## Etapas

Ordem por dano ÷ custo, não pela numeração do plano. A onda 0 completa (matriz de
referência, baseline em aparelho) é cara e não bloqueia os P0 — ela entra depois
que o progresso parar de poder sumir.

| #   | etapa                                                            | onda | estado                |
| --- | ---------------------------------------------------------------- | ---- | --------------------- |
| 0   | Devolver o `master` ao verde (catraca de testes mudos)           | —    | ✅ `d6ded7a5`         |
| 1   | RC-02 — falha de leitura do save não grava por cima              | 1    | ✅ `bdb6be5e`         |
| 1b  | A hotbar no desktop ficava atrás da dock (achado da folha)       | —    | ✅ `746628e6`         |
| 2   | RC-01 — conservação no inventário e na bancada                   | 1    | ✅ `7102cf77`         |
| 3   | RC-04 — regras do RTDB: membership, alcance e ritmo              | 1    | ✅ `c9fa6828`         |
| 4   | RC-03 — solo → sala → solo devolve a sessão inteira              | 1    | ✅ `08efa4e6`         |
| 5   | RC-08/09 — durabilidade na morte e drops com id válido           | 1    | ✅ `5d008c4e`         |
| 6   | RC-13 — foco de janela e cancelamento de toque                   | 1    | ✅ `22b5cf24`         |
| 7   | RC-05/06/11 — worker ocioso, fallback e heightmap                | 1    | ✅ `ccd49128` + RC-05 |
| 8   | RC-10 — passo físico fixo                                        | 1    | ✅ `a5289310`         |
| 9   | RC-12 — distância de render respeita o orçamento do aparelho     | 1    | ✅ nesta rodada       |
| 10  | Onda 0 — montagem real do componente e triagem das 73 sondas     | 0    | ✅ `cd5455ab`         |
| 11  | Onda 0 — matriz de referência contra o jogo original             | 0    |                       |
| 12  | Onda 2 — identidade de mundo (`worldId`, `dimensionId`, versões) | 2    | ✅ `e678da06`         |
| 13  | Onda 2 — paleta por chunk (a trava T1: 95 ids livres)            | 2    | ⏳ próxima            |
| 14  | Onda 2 — `minY`/`maxY` centralizados (a trava T2)                | 2    |                       |
| 15  | Onda 2 — armazenamento por chunk em OPFS, backup e migração      | 2    |                       |
| 16  | Onda 3 — agricultura inteira (hoje `wheat` é item sem cadeia)    | 3    |                       |
| 17  | Onda 3 — dieta e reprodução por espécie, cozimento coerente      | 3    |                       |
| 18+ | Ondas 4 a 8, conforme o plano                                    | 4-8  |                       |

## Registro das etapas

### Etapa 0 — o `master` estava vermelho antes de eu tocar em nada

`d6ded7a5`. A catraca `qualidade-dos-testes` reprovava: 14 testes sem asserção
para um teto de 13. O mudo era o print do relógio (`relogio-visual.spec.js`), que
fotografava oito telas e não afirmava nada — e como o clique na aba é `?.click()`,
um rótulo trocado fotografaria a MESMA aba oito vezes sem erro nenhum.

Três asserções, nenhuma inventada pela sonda: a aba foi achada, a raiz passou a
carregar `ros-clock--<aba>` (o app dizendo qual aba abriu), o print tem bytes.

**A lição, e vale para o goal inteiro:** subir o teto da catraca resolveria o
vermelho em uma linha e teria escondido o mesmo buraco de 31/08 — o buraco de
fotografar sem olhar.

### Etapa 1 — RC-02: falha ao LER o save deixava de existir

`bdb6be5e`. O `boot` tratava "não consegui ler" como "nunca jogou", e o autosave
gravava o mundo vazio por cima. Três segundos de rede ruim apagavam meses.

`cargaDoSave.js`: quatro estados, e só `INDISPONIVEL` fecha a porta de gravar. A
porta entra em `podeGravar` **e** em `podeAgendar`.

Evidência: 12 testes novos; mutação em duas frentes (a política devolvendo o
comportamento antigo reprova 4 testes; tirar a porta do `.vue` reprova o guard de
estrutura); suíte inteira 805 arquivos / 9766 testes verde.

**O que o guard ensinou:** a primeira versão deixou o `try/catch` e a
classificação dentro do `boot`, e o guard de tamanho de componente reprovou
(+24 linhas). Ele estava certo por um motivo melhor que contagem — política
dentro do componente é política sem teste, que é exatamente como o RC-02 nasceu.
Depois da extração o `.vue` **caiu** de 2546 para 2541.

**Achado de passagem:** `mobile.dive` estava nos 10 arquivos de i18n gerados e
fora da tabela que os gera. O gerador se recusou a rodar para não apagar
tradução — e estava certo. Foi trazido para a tabela.

**Produção conferida:** `roqueos.com.br/version.json` responde build 2248, commit
`bdb6be5e` — o mesmo do `master`. O bundle `ROSRoqueCraft-B5nLb09n.js` servido em
produção contém a chave `saveIndisponivel` e o estado `indisponivel`: a política
está no ar, não só no build local.

**Achado da folha de contato, e ele NÃO é meu:** nas quatro cenas de desktop
(ultra e low, todos os biomas) a hotbar do jogador é uma **faixa preta chapada de
~17px**, sem nenhum slot desenhado, espremida entre os corações e a dock do
RoqueOS. Nas quatro cenas de celular a hotbar aparece inteira, com os slots. O
jogador de desktop não vê a própria hotbar. Não toquei em UI nesta etapa, então é
pré-existente — e é exatamente o tipo de coisa que só a folha pega: nenhuma sonda
numérica pergunta "a hotbar tem altura". Virou a etapa 1b.

### Etapa 1b — a hotbar coberta pela dock (medida, e o meu erro de leitura junto)

**Eu li o print errado, e a medição me desmentiu.** Escrevi acima "faixa preta de
~17px, sem nenhum slot desenhado". Falso: `scripts/qa-roquecraft-hotbar.mjs`, que
mede o elemento vivo com `getBoundingClientRect`, mostra a hotbar com **56px de
altura, 448px de largura e os 9 slots de 46px, em todas as telas**. O que o print
mostrava era a barra PARCIALMENTE ATRÁS de outra coisa, e eu completei o resto com
imaginação. Fica registrado porque é a armadilha do passo 6 ao contrário: olhar é
obrigatório, e continua não sendo medir.

**O defeito é real, e agora tem nome:** em 1280×720 quem está na frente do
primeiro slot, perguntado ao navegador com `elementFromPoint`, é
`q-icon < ros-dock-item__icon < ros-dock-item < ros-dock__pinned < ros-dock`. A
**dock do RoqueOS** cobre a hotbar do RoqueCraft. Em 430×932 (celular) não cobre.

**Duas coisas que a sonda aprendeu sobre si mesma antes de acusar o jogo:**

1. A primeira versão reprovou `ros-roquecraft__play` — a cortina de "clique para
   jogar". É o estado normal de quem não clicou: a sonda estava fotografando a
   porta de entrada e chamando de defeito.
2. A tentação seguinte era `display: none` na cortina, que é o que a folha de
   contato faz. Esconder o que atrapalha é exatamente como o defeito da mão
   sobreviveu a cinco rodadas. A sonda entra por `entrarNoJogo()` — o mesmo
   caminho do clique — e trata a cortina como consequência do headless (sem
   janela real não há pointer lock), não como obstáculo.

**Onde isto parou, e por quê:** `src/css/roqueos/window.scss` já posiciona a
janela com `bottom: var(--ros-dock-offset, 0px)`, então a janela DEVERIA parar
acima da dock e em 1280×720 não para. Isso aponta para o layout de janela do
RoqueOS, não para o HUD do jogo — e mexer ali muda TODOS os apps, não só o
RoqueCraft. Antes de tocar, `roqueos-kit:blast` e a decisão de onde o conserto
mora: subir o HUD do jogo esconde o sintoma num app e deixa os outros com o
mesmo problema.

**Fechamento da 1b:** a causa estava em `windowManagement.js` e não no jogo. Ao
ABRIR uma janela, `fitToDesktop`/`fitPosition` limitavam pelo topo e pela
viewport e não pela dock — enquanto `windowSnapping.js` já descontava a dock ao
encaixar uma janela na lateral. É a segunda metade do defeito do Roqueman de
08/08/2026, cujo conserto parou no meio.

As duas funções saíram do store para `utils/desktop/ajusteDeJanela.js`. Não foi
arrumação: dentro do store elas não TINHAM como ser testadas (o módulo importa o
log de atividade, que importa o boot do Firebase, que exige variável de
ambiente), e duas funções de aritmética pura sem teste possível é exatamente
como o defeito entrou. 7 testes novos; mutação reprova 3 deles; a sonda passou a
dar verde nas 3 telas. Produção: build 2250, commit `746628e6`.

### Etapa 2 — RC-01: o que não cabe parava de existir

`7102cf77`. Três lugares jogavam fora o retorno de `addItem` — que é quanto NÃO
coube — e o que não coube ia junto:

1. `fecharMobilia`: o item na mão costuma vir DO BAÚ. Pegar 64 de pedra num baú
   com o inventário cheio e apertar Esc destruía as 64. Agora o resto volta para
   o container, e se nem lá couber a janela não fecha: preso é recuperável.
2. `montarDireto`: ingredientes consumidos e resultado no lixo com o inventário
   cheio. A conferência é DEPOIS da remoção, na cópia — são os próprios
   ingredientes que abrem espaço, e conferir antes reprovaria craft possível.
3. `devolverAoInventario`: a sobra fica no cursor e na grade, à vista.

**O controle de mutantes pegou um teste MEU frouxo**, e é o achado da etapa: com
UM tronco no slot, consumi-lo esvazia o slot e as tábuas cabem nele — o teste
passava com e sem o conserto. Com uma pilha de 64 o slot continua ocupado por 63
e o teste passa a valer. Um teste que nunca reprovou não é teste.

Todos os 10 testes somam o mundo INTEIRO antes e depois (inventário + cursor +
grade + container): somar só o inventário deixaria passar justamente o defeito,
que é o item sair de um lado e não chegar no outro.

Suíte: 807 arquivos, 9783 testes, verde. Produção: build 2251, commit `7102cf77`.

### Etapa 3 — RC-04: a sala não tinha dono

`c9fa6828`. `blocks` e `hits` diziam `".write": "auth != null"`: qualquer conta
do RoqueOS escrevia bloco e dano em QUALQUER sala, sem estar nela, sabendo só o
código de 4 letras. E o Realtime Database não tinha teste nenhum — o emulador
dele nem subia junto com os outros dois.

Agora escrever exige estar em `players/<uid>`; o dano vem assinado (`by ===
auth.uid`) e limitado a 1–40, então um pedido de 99999 é recusado pelo banco.

**Um buraco maior apareceu por um teste MEU que passou quando devia falhar:** a
regra do nó da sala era `!data.exists() || host === auth.uid`, e o primeiro ramo
concede TUDO enquanto a sala não existe — dava para criar uma sala já declarando
OUTRA pessoa como host.

O caso que quebraria a produção tem teste próprio: `createRoom` grava o `meta` e
despeja as edições do mundo solo em `blocks` ANTES de `enterRoom` criar o nó do
jogador. Membership escrita sem olhar essa ordem transformaria "criar sala" em
erro de permissão para todo mundo.

21 casos novos, 83 no total verdes; mutação (devolver `auth != null`) reprova 4.
Regras publicadas com `firebase deploy --only database` — o serviço respondeu
"released successfully"; não exerci as regras contra produção.

**Fica em aberto, como fato:** `yarn rules:audit` olha `firestore.rules` e
`storage.rules` e NÃO olha o `database.rules.json`. O RTDB nunca foi auditado
por ele. Isso é do `roqueos-kit`, não deste repo.

### Etapa 4 — RC-03: sair da sala devolvia dois números

`08efa4e6`. Guardava `{ semente, instante }` e só restaurava se a semente
tivesse mudado — e o anfitrião joga a sala na própria semente. Ele saía com o
inventário, a vida, as edições e as criaturas DA SALA, e o autosave gravava isso
por cima do save solo. Semente igual não é sessão igual.

`sessaoSolo.js` tem a lista e a ORDEM dos cinco passos, e a ordem é o que o teste
guarda. `sessaoDeRede.js` levou a ponte para fora do `.vue`: o guard de tamanho
reprovou o conserto e estava certo — ela deixou de ser fiação e virou contrato.
Um teste ANTIGO afirmava o defeito e foi invertido, com o motivo escrito.

### Etapa 5 — RC-08 e RC-09: morrer consertava ferramenta, e o peixe não existia

`5d008c4e`. O laço da morte ignorava `dur`: morrer com a picareta em 3 de 1562 e
recolher os itens devolvia uma picareta nova. Morrer virava oficina.

E `mobs.js` dropava `raw_fish` e `ink_sac` desde que os aquáticos entraram, sem
que nenhum dos dois existisse em `items.js`: o item vinha sem ícone, sem nome, e
o save o descartava no recarregamento.

Os dois ícones **não são arte nova** — o atlas de item é gerado por procedimento
e as receitas usam as primitivas dos outros 50. O guard é um cruzamento de
planilha (drops × itens × receitas), TETO ZERO: item fantasma não é dívida a
pagar aos poucos, é promessa já feita ao jogador.

### Etapa 6 — RC-13: o jogador saía andando sozinho

`22b5cf24`. O navegador entrega `keydown` e nunca o `keyup` quando a janela perde
o foco no meio: alt-tab com o W apertado e o W ficava preso para sempre. No
celular o toque some sem `touchend` quando chega uma ligação, e o botão de
quebrar ficava segurado. Não havia `blur`, `visibilitychange` nem `touchcancel`
em lugar nenhum do jogo.

Os listeners moram no composable, não na fiação do `.vue`: eles têm ciclo de
vida próprio (rule 44) e existem para um evento que não é "o jogador mandou" —
é "o jogador sumiu".

`visible` não solta nada, e há teste para isso: apagar o comando de quem acabou
de voltar seria trocar um defeito por outro.

### Etapa 7 — RC-11 e RC-06: o cliente respondia o terreno de antes

`ccd49128`. O worker recalculava o heightmap dele a cada `setBlock`; o cliente
escrevia o bloco e deixava `c.heights` como estava — e `heights` só chega de
novo quando o chunk INTEIRO é reenviado, o que uma edição não faz. Quem cavasse
um buraco continuava, deste lado, com o chão onde não há mais chão.

E `worker.onerror` chamava `startInline(cx, cz, edits)` com os argumentos do
BOOT: se o worker morre depois de o jogador ter andado ou entrado numa sala de
outra semente, o modo inline renascia em outro mundo, em outro lugar, sem as
construções. Esse caminho nunca tinha sido exercido porque `Worker` não existe
no ambiente de teste — o teste novo usa um dublê que só serve para estourar
`onerror`.

**RC-05 entrou logo depois, e não era medida de desempenho: era um defeito de
fila.** O halo — a margem de chunks gerada além do raio, para a borda ter vizinho
— entrava na fila de luz e nunca virava elegível, porque acender só acontece até
`distance + 1`. O job voltava para a MESMA fila, ela nunca esvaziava, `tick`
respondia "ainda tem trabalho" para sempre, e o `pump` do worker reagendava a
cada 0 ms com o jogador PARADO. O sinal já existia e nunca era alcançado:
`emit({ t: 'idle' })` só roda quando `tick` devolve `false`.

Agora há duas filas: adiado por VIZINHO AUSENTE é trabalho pendente e continua na
principal; adiado por DISTÂNCIA espera fora, sem manter o pipeline acordado, até
o jogador andar ou a distância mudar.

A mutação mostra o tamanho: com o código antigo o teste estoura 4.000 ticks sem
o pipeline nunca parar.

### Etapa 8 — RC-10: a física andava no relógio do monitor

`a5289310`. Dois cortes de tempo, em lugares diferentes e com valores diferentes:
0,1 s no laço e 0,05 s dentro de `physics.js`. A 15 fps o quadro dura 0,067 s, a
física recebia 0,05, e o jogador andava 25% menos por segundo do que alguém a
60 fps segurando a mesma tecla. O celular do founder não é o desktop dele.

O corte não era o erro — tempo demais para um passo só vira VÁRIOS passos, não
um passo menor. O teto de subpassos não é otimização: sem ele um quadro de dez
segundos pede seiscentos passos e a espiral trava o navegador.

O primeiro teste PROVA o defeito (sem o acumulador, 15 fps anda menos de 95% do
que 60 fps); com ele, as quatro taxas ficam dentro de 1% em 10 s de caminhada,
que é o critério do plano.

### Etapa 9 — RC-12: meia regra não protege

A regra "`low` nunca é elevado por um save" valia só para a QUALIDADE. O save que
dizia `renderDistance: 16` passava inteiro, porque o único limite aplicado era o
global (3 a 16): o celular que acabou de se declarar incapaz recebia 16 chunks de
raio — mais de mil chunks para gerar, malhar e desenhar, no aparelho que não
aguenta nem a sombra.

O teto vem do PERFIL, não de um número escrito à mão. Fora do `low`, o jogador
manda até o limite global — quem tem máquina para ver longe escolhe ver longe.

**Fica em aberto, como fato:** o "retorno na UI" que o plano pede (avisar o
jogador de que a distância dele foi limitada) não entra aqui. O que entra é o
dano: o aparelho fraco parar de tentar o impossível.

### Etapa 10 — o componente passou a ser montado, e as sondas a reprovar

`9f3caf60` e `cd5455ab`. O spec do jogo dizia, com todas as letras, que "um
mount completo em jsdom seria frágil" e conferia só que o arquivo exporta
alguma coisa: 9.836 testes verdes e ninguém provava que o jogo ABRE. Agora ele é
montado de verdade; vira dublê só o que não existe em jsdom (WebGL, worker,
Firebase, áudio).

**O controle de mutantes derrubou a primeira versão do guard de ciclo de vida.**
Ela contava um saldo global de listeners e aceitava "menos que 30 depois de 30
ciclos" — apagar `entrada.encerrar()`, que vaza quatro por ciclo, passava
folgado. Agora conta por tipo, exige zero, e o vermelho vem com nome:
`window:blur x30`.

E das 64 sondas de QA, 33 mediam e saíam com código zero de qualquer jeito.
**O meu próprio instrumento errou primeiro:** a régua procurava
`process.exit(1)` e classificou como muda a `texturas`, que termina em
`process.exit(... ? 1 : 0)` — sete sondas acusadas injustamente, e o número caiu
de 40 para 33 ao consertar a régua. Três ganharam veredito (inventário, forno,
pecuária) e o teto foi a 30. Duas ficam fora por decisão: `olho` e `ceu-fotos`
existem para o humano olhar.

### Etapa 12 — identidade do mundo: save v9

`e678da06`. `worldId` responde qual mundo é este, `dimensionId` responde onde
dentro dele, `generatorVersion` é o que permite mudar a geração sem trocar o chão
debaixo da casa de quem já construiu.

O id de save antigo é DERIVADO (`w<semente>`) e não sorteado: sorteio daria um id
novo a cada leitura enquanto o jogador não salvasse, que é exatamente o que a
identidade existe para impedir. `dimensionId` entra agora, valendo `overworld`
para todos, porque migrar save no dia em que o Nether existir seria migrar às
cegas.

`roqueos-graph blast` respondeu "sem raio de impacto": a mudança fica no front.

Quatro testes travavam `version` em 8 e foram atualizados para 9 — não
enfraquecidos: a mensagem deles é "a versão tem que subir", e ela subiu.

---

## Incidente de 12/09: o site saiu da raiz do domínio por 4h19

Não foi uma etapa do goal. Foi um dano que EU causei enquanto rodava o goal, e
que o founder viu antes de mim.

**O que aconteceu.** Para publicar cada etapa eu rodei `yarn deploy`. Esse
script era `yarn build:all && firebase deploy --only hosting`, e
`firebase deploy` sem `--config` lê o `firebase.json` — que é o front puro, com
o shell do app na raiz. A composição do Goal 15 (site Nuxt na raiz, RoqueOS em
`/app`) vive no `firebase.compose.json`, gerado pelo `compose-site.mjs`, e só
sai pelo `deploy:composto`. Onze deploys depois, `roqueos.com.br` servia o app
na raiz e o site tinha sumido.

**A janela, medida na API de Hosting, não estimada** (`releases` do site
`roqueos`, `rewrites=30` é composto, `rewrites=1` é cru):

| quando (UTC)            | versão             | estado                       |
| ----------------------- | ------------------ | ---------------------------- |
| 2026-09-10T16:15:07Z    | `c11aff25a0a8c51c` | composto — última boa        |
| 2026-09-12T15:15:04Z    | `f2477fff85520805` | **cru — o site sai da raiz** |
| … mais dez deploys crus |                    |                              |
| 2026-09-12T19:30:25Z    | `6c58fb4476cbd3e2` | cru — o último               |
| 2026-09-12T19:34:36Z    | `c5008d83f2021af1` | composto — de volta          |

Quatro horas e dezenove minutos. No commit do conserto eu escrevi "oito
deploys": era o que eu lembrava de ter rodado, não o que o Hosting registrou.
São onze. **Contei pela memória em vez de medir, no mesmo dia em que o dano foi
não ter medido nada.**

**Por que a regra não bastou.** O fluxo composto estava documentado e havia
`deploy:composto` ao lado. O que não havia era mecanismo: nada recusava o
caminho cru. Regra sem mecanismo é decoração — e esta decorou por dois dias.

**O mecanismo** (`678587ff`), em três catracas:

1. `firebase.json` ganha um predeploy que recusa sempre
   (`scripts/guarda-hosting-composto.mjs`). Quem executa é o firebase, então
   vale para qualquer caminho: yarn, mão, script, CI. Medido com o CLI de
   verdade — `firebase deploy --only hosting --dry-run` para em
   `hosting predeploy error` com a mensagem que manda rodar `yarn deploy`.
2. `compose-site.mjs` remove essa guarda ao escrever o `firebase.compose.json`,
   sem levar junto o guard do docs nem o `check-install-bom`. É a única
   configuração por onde o hosting sai.
3. `package.json`: `deploy` passa a ser o fluxo composto — que compõe, mede
   depois de publicar e reverte sozinho.

`tests/unit/architecture/hosting-sempre-composto.spec.js` cobra as três, e pega
o caso escondido atrás de um `yarn` de outro script e o `firebase deploy` pelado
sem `--only`. Teste de mutação, quatro mutantes, todos reprovados: voltar o
`deploy` ao comando do incidente (2 falhas), tirar a guarda do `firebase.json`
(3), fazer a guarda sair com 0 (1), fazer o compose parar de removê-la (2).

**O que continua sem mecanismo.** `yarn build:app` regera
`public/jogos/catalogo.json` com um `geradoEm` novo e num formato que o Prettier
reprova, então todo build suja a árvore e trava o `pre-push`. Eu restaurei o
arquivo (conferi antes: fora o timestamp, o JSON é idêntico ao do HEAD). Se o
arquivo é artefato de build, ou ele sai do versionamento ou o gerador escreve
formatado e sem timestamp — é decisão do founder, não invento.

### Onda 2, fatia T2 — o mundo ganha piso e teto com nome

`3c65efc7`. `WORLD_HEIGHT = 128` era constante única e o piso era o zero
implícito de todo `y < 0`. Agora existe `dimensoes.js`: cada dimensão declara
`minY`, altura, nível do mar, piso indestrutível e se tem céu, e o registro se
**valida** (altura e minY múltiplos da seção, mar e piso dentro do mundo).
Dimensão desconhecida estoura em vez de virar overworld em silêncio.

Nenhum número mudou. `constants.js` deriva da dimensão padrão em vez de cravar,
e `physics.js` parou de cravar 126 e 127.

**A medição desmontou o tamanho que eu supus.** O plano dizia "os literais
126/127/128 saem do código" como se fossem muitos: a varredura achou **cinco em
código no RoqueCraft inteiro**, e três não são altura (normal de vértice em int8
do mesher, x em pixels do rótulo do canvas). O trabalho real da T2 não era
caçar literal, era dar nome ao piso.

Ordem trocada de propósito: a fatia 3 do plano rodou antes da 2. As duas são da
mesma onda, a 3 é a de menor risco, e ela deixa o lugar onto o Nether entra.

Catraca: `altura-cravada` (manifesto de exceções com motivo, teto 5 que só desce,
exceção sem ocorrência reprova). Cinco mutantes, todos reprovados.

### Onda 2, fatia T1 — a paleta por chunk

`177ada06`. O mundo cabia em 255 tipos de bloco porque `chunk.blocks` era um
`Uint8Array` de ids globais. 160 em uso, 95 livres.

**Medi antes de escolher.** A saída óbvia (Uint16Array) leva os voxels de
68,1 MB para 102,1 MB na distância de render máxima — 34 MB a mais num aparelho
onde o Safari mata a aba. Por isso paleta, e não porque estava escrito no plano.

`blocks` guarda índice local; a paleta do chunk diz o id. Duas decisões seguram
o resto: o índice 0 é ar **sempre** (chunk novo nasce zerado, e todo
`blocks[i] !== 0` do código antigo continua valendo sem tradução), e chunk que
estoura 256 tipos é **promovido** a 16 bits em vez de recusar a edição do
jogador. Compacta antes de promover, senão entrada órfã de cavar-e-recolocar
promoveria um chunk de três tipos.

A fronteira ficou em cinco arquivos. O mesher não mudou uma linha: quem traduz é
a vizinhança, que virou `Uint16Array` de ids globais. A luz reprojeta as tabelas
globais sobre os 256 índices do chunk uma vez, então o laço quente continua com
um lookup só.

**Custo medido nos dois lados, em worktree do commit anterior, 3 rodadas cada:**
chunk inteiro 15,6/15,8/15,9 → 14,9/16,0/15,2 ms; geração 7,6/7,8/7,8 →
7,5/7,5/7,7; luz 1,1/1,2/1,2 → 1,2/1,2/1,2. Dentro do ruído.

**O teste de mutação pegou o buraco que importava.** O mutante "a vizinhança
copia índice como se fosse id" sobreviveu à primeira rodada: `core.spec` não
cobria a tradução. Entraram os testes que faltavam — dois vizinhos com paletas
diferentes não trocam de bloco na moldura — e ele morreu.

Produção: build 2270, commit `177ada06`, medido no ar — site na raiz, app em
`/app`, install.sh com o mesmo sha256. Foi o primeiro `yarn deploy` depois da
guarda, e ele compôs: o mecanismo do incidente funcionou no caminho real.
