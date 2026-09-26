# RoqueCraft — o loop

**Aberto em 24/08/2026, a pedido do founder.** Este arquivo é a memória do loop:
ele sobrevive a compactação de contexto e a troca de sessão. Quem retomar o
trabalho lê este arquivo primeiro.

## O OBJETIVO (definido pelo founder em 24/08/2026, à noite)

> Um RoqueCraft **de qualidade de produto e próximo do original**, com o código
> no padrão RoqueOS. O loop roda sem parar até o founder dizer que chega.

Isso se decompõe em quatro frentes, e uma rodada fecha uma frente por vez:

**1. Jogabilidade próxima do original.** Cada mecânica é medida contra o
comportamento documentado do jogo original — número, não lembrança. Quando a
memória e o wiki discordarem, vence o wiki; quando o wiki e o que se sente na
mão discordarem, vence a mão, e a divergência fica registrada com a razão.

**2. Detalhe.** O que separa "funciona" de "produto" é o que ninguém pediu: o
retorno de um golpe fraco, o bloco que cai quando se mina embaixo, a cadeia que
começa num bloco que o mundo produz. Toda rodada procura o circuito que existe
e não fecha.

**3. Padrão RoqueOS.** Composable, store, serviço e componente cada um no seu
lugar. A regra é a mesma de sempre neste projeto: **extração paga pela rodada
que passa por cima do trecho** — nunca uma reescrita solta.

**4. Gráfico congelado.** O founder aprovou o visual em 24/08. Não se mexe em
shader, textura, luz, modelo ou enquadramento. A folha de contato deixa de ser
ferramenta de melhoria e passa a ser **rede de proteção**: ela existe pra
provar que a jogabilidade não estragou a tela.

### O estado da arquitetura, medido em 24/08

Auditoria com o arquivo vivo (4.629 linhas), não com lembrança:

| frente         | estado                                                                            |
| -------------- | --------------------------------------------------------------------------------- |
| Serviços       | ✅ 40 módulos de regra pura, **61 specs**. Só `chunkWorker` (79 linhas) sem teste |
| Primitivos ROS | ✅ 3 usos de Quasar cru no app inteiro (2 `q-icon`, 1 `q-spinner-dots`)           |
| Store          | ✅ `useAuthStore` e `rosStore` usados; estado de jogo corretamente fora de store  |
| **Componente** | ❌ **4.629 linhas, 20 responsabilidades.** É a única dívida real                  |

Quatro blocos concentram **2.494 linhas (60% do script)**: gancho E2E 982,
mirar/quebrar/colocar 549, boot 539, laço principal 424.

**48 `let` de módulo**, e o censo desarma o susto: 39 são efêmeros de render e
rede, já agrupados por função (marcha, toque, throttle, laço). O estado de jogo
que importa mora em `const` reativos. Dos 9 de jogo, **3 não são salvos** —
`mobs`, `drops` e `dropId`: criatura e item no chão evaporam ao recarregar. Isso
é decisão de produto pendente, não refatoração.

### A ordem de corte, do menor risco para o maior

Descoberta pela análise de acoplamento (quem escreve estado dentro de `frame()`),
não por gosto. **19 dos 48 `let` são escritos por quadro** — esse é o núcleo que
não se toca.

| tier | o que sai                                                       | linhas | risco   |
| ---- | --------------------------------------------------------------- | ------ | ------- |
| 0    | `FALLBACK_ICON`, `TINT_CACHE`+`blockTintColor`, `VIZINHAS`      | 75     | nominal |
| 1    | Política de nascimento, registro de edições, `olhoSeguro`, nado | 232    | baixo   |
| 2    | Persistência, lobby/chat, entrada, gancho E2E                   | ~1.430 | médio   |
| —    | Laço, criaturas, mirar/quebrar, fluidos, ataque                 | 1.258  | NÃO SAI |

**O que só PARECE acoplado, com evidência:** persistência tem 19 chamadores mas
zero participação no quadro; o gancho E2E referencia 66 identificadores e vaza
exatamente DUAS variáveis pro caminho de produção (`qaJogadores` e
`quedasCongeladas`, ambas inertes em jogo); 190 das 312 linhas de multiplayer
rodam por clique, não por quadro.

## O objetivo original (quando o loop abriu)

RoqueCraft chega a: **bonito, performático, completo, com dinâmicas de
construção e jogabilidade à altura do jogo original — e escrito com código
pequeno e bem separado.**

**Quem decide quando parou:** o founder, e só ele. O loop não tem critério de
saída próprio. Ele para quando o founder disser "está bom o suficiente".

## O método, por rodada

1. **Escolher pelo maior impacto ÷ custo**, do backlog abaixo, com bug sempre
   ganhando de funcionalidade nova quando o impacto empata.
2. **Pesquisar** quando a rodada for visual — referência real, com licença
   verificada. Nunca asset da Mojang, nunca código de shader pack proprietário:
   lê-se a técnica e reimplementa-se.
3. **Medir antes de mexer.** Instrumento com PROVA DE VIDA: um contador que só
   sabe devolver zero não é medida. Esta regra já pegou seis erros neste
   projeto, três deles do próprio instrumento.
4. **Construir**, extraindo composable quando a rodada tocar um trecho grande —
   refatoração paga por demanda, junto com o recurso que a exige, nunca como
   uma reescrita solta.
5. **Verificar**: lint, testes, build, e a sonda de QA que couber.
6. **OLHAR.** `node scripts/qa-roquecraft-olho.mjs`, e então ABRIR os PNGs — os
   doze, um por um. Não o resumo, não o número: a imagem.
7. **Subir**: commit em português, push no `master`, `yarn deploy`, e conferir
   em produção — não no build local.
8. **Relatar curto** e seguir para a próxima.

### Por que o passo 6 existe (24/08/2026)

O founder mandou um print do celular com a mensagem: _"Você está validando
visualmente o que você está fazendo? Não vou aceitar essas porcarias."_ Ele
estava certo, e a causa é específica o bastante para valer o registro.

Rodadas 8 a 12 subiram com portão verde: lint 0, 6859 testes, sondas 10/10,
harness com 0 erro de jogo, produção conferida. **E o jogo estava visivelmente
quebrado.** A mão do jogador era uma tábua chapada atravessada no canto, em
todos os perfis, desde a rodada 8.

Nenhuma sonda pegou porque quase todas **desligavam a mão**
(`setFx({hand:false})`) — ela balançava e sujava a medição. O defeito estava
invisível para o instrumento **por construção**. Cinco rodadas de verde em cima
de uma tela quebrada.

A lição não é "medir melhor". É que **olhar para número não é olhar para o
jogo**. Uma sonda numérica responde a pergunta que alguém pensou em fazer; o
olho responde a que ninguém pensou. As duas coisas são necessárias e nenhuma
substitui a outra.

## Regras que não se reabrem

- Só CC0, MIT, BSD ou domínio público. Nada da Mojang, nada de Sketchfab, nada
  de shader pack proprietário.
- Nunca enfraquecer um teste existente para o gate passar.
- Yarn, nunca npm.
- Perfil `low` é o dono do orçamento: efeito bonito no desktop que mata o
  celular não entra.
- Cada rodada sobe sozinha para produção (autorização do founder em 24/08) —
  **exceto** se a folha de contato não tiver sido aberta. Portão verde com
  folha não olhada não é autorização: é a rodada 8 de novo.
- **Nenhuma sonda desliga a mão.** Se a mão atrapalha a medição, mede-se por
  DIFERENÇA entre quadros, não apagando o que atrapalha. Desligar o que
  incomoda é como o defeito sobreviveu a cinco rodadas.
- **A sonda não constrói o que vai julgar.** Se a pergunta é "para onde o jogo
  aponta a câmera", a sonda não chama `look()`. Se a pergunta é "como o jogo
  abre", ela entra pelo MENU, não pelo atalho de E2E — que pula `pousarSeguro`
  e, com ele, a escolha de yaw. Em 24/08 eu reportei um defeito de nascimento
  que era só isso: eu tinha fixado o enquadramento e fotografado o meu próprio
  arbítrio.
- **Shader e GPU não sobem sem evidência no APARELHO-ALVO.** Verde no Chromium
  e verde no WebKit de desktop não são verde no iPhone: é o mesmo motor em
  outro sistema, com outro driver e outra GPU. Em 24/08 subi um `flat varying`
  cuja justificativa inteira era uma hipótese sobre o iPhone, sem ter iPhone, e
  escrevendo no próprio commit que não havia reproduzido o defeito. Quebrou o
  jogo do founder por 27 minutos: cada face passou a amostrar a camada errada
  do texture array — anel de tronco na lateral, copa marrom, areia listrada.
  Se o alvo é um aparelho que eu não executo, a mudança fica PRONTA e ESPERA um
  print dele antes do deploy. Não existe "correção de solidez" em driver que eu
  não rodo: existe aposta.
- **Procurar a sonda que já existe antes de escrever a próxima.** Duas sondas
  para a mesma pergunta dão duas respostas, e a mais nova costuma ser a pior.
  `qa-roquecraft-nascer.mjs` já respondia a pergunta do nascimento, com grupo
  de controle, e eu quase escrevi uma segunda do zero.

## O diagnóstico de abertura

Auditoria de 24/08/2026 (jogabilidade + qualidade de código). A frase que
resume: **a engine — física, mesher, worldgen, luz, áudio, multiplayer — está
num nível bem acima do jogo.** O que falta não é motor: é fechar circuitos que
já foram construídos e ficaram desconectados.

Quatro circuitos abertos, todos com o trabalho pesado já feito:

| circuito      | o que existe                                                                        | o que falta                                            |
| ------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Fundição      | `SMELTING` completo em `recipes.js`, `smeltingFor` exportado, combustível nos itens | a tela. `tryInteract` só trata `'crafting'`            |
| Armazenamento | `interact: 'chest'` declarado no bloco                                              | tudo o resto                                           |
| Mob hostil    | 430 linhas de `mobs.js` com IA, spawn por luz, tipos                                | `lightAt: () => 15` numa linha anula o arquivo inteiro |
| Shift-clique  | `quickMove()` escrito e testado em `inventory.js`                                   | ninguém chama                                          |

## Backlog vivo

Ordenado por impacto ÷ custo. Reordenar a cada rodada com o que se aprendeu.

| #   | item                                                                                               | custo | risco  | estado                          |
| --- | -------------------------------------------------------------------------------------------------- | ----- | ------ | ------------------------------- | --- |
| 1   | ~~Bugs de inventário: duplicação no craft, perda no drop~~                                         | P     | nenhum | ✅ rodada 1                     |
| 3   | ~~Shift-clique ligando o `quickMove` que já existe~~                                               | P     | nenhum | ✅ rodada 1                     |
| 4   | ~~`blocked()` do mob testa só uma diagonal~~                                                       | P     | baixo  | ✅ rodada 1                     |
| 6   | Colocar segurando o botão / arrastando                                                             | P     | baixo  | ⏳ rodada 2                     |
| 7   | Pick block (botão do meio)                                                                         | P     | nenhum | ⏳ rodada 2                     |
| 8   | Sneak não cair da borda                                                                            | P     | baixo  | ⏳ rodada 2                     |
| 10  | Preview fantasma do bloco                                                                          | P     | baixo  | ⏳ rodada 2                     |
| 2   | `lightAt` real → mob hostil passa a existir                                                        | M     | médio  | ⏳ rodada 3                     |
| 5   | Folha de bétula/pinheiro/selva dropa a própria folha                                               | P     | nenhum | com a rodada de agricultura     |
| 9   | Cascata de gravidade em areia e cascalho                                                           | P     | baixo  |                                 |
| 10  | Preview fantasma do bloco antes de colocar                                                         | P     | baixo  |                                 |
| 11  | **Fornalha** — destrava ferro, vidro, tijolo, comida cozida                                        | M     | baixo  |                                 |
| 12  | **Baú** — sem armazenamento não existe base                                                        | M     | médio  |                                 |
| 13  | Blocos de construção que existem e não são gerados (argila, granito, andesito, diorito, obsidiana) | P     | baixo  |                                 |
| 14  | ~~Visual: folhagem balançando~~ (água melhor e SSAO continuam)                                     | M     | médio  | ✅ rodada 5 (só o vento)        |
| 21  | Trocar o perfil pra `low` em execução emite 2 erros de WebGL no console (pré-existente)            | P     | baixo  | achado na rodada 5              |
| 15  | ~~Byte de estado por voxel~~ — **recusado na rodada 6**, ver `roquecraft-rodada6.md`               | G     | alto   | ❌ forma por id no lugar        |
| 16  | ~~Laje e escada~~                                                                                  | G     | médio  | ✅ rodadas 6 e 7                |
| 22  | Destaque branco ainda é o cubo inteiro, mesmo em laje e escada                                     | P     | baixo  | achado na rodada 7              |
| 23  | Escada em canto (o L que se forma quando duas se encontram) — mais 8 formas por material           | M     | médio  | rodada 7 deixou em aberto       |
| 17  | Água e lava fluindo + balde (depende do 15)                                                        | G     | alto   |                                 |
| 18  | Cama e ponto de renascimento                                                                       | M     | baixo  |                                 |
| 19  | Agricultura: enxada, semente, trigo, pão                                                           | M     | baixo  |                                 |
| 20  | ~~Combate: knockback, cooldown por arma, crítico~~                                                 | P     | baixo  | ✅ rodada 15 (razão 5,0 medida) |     |

## A dívida de tamanho

`ROSRoqueCraft.vue` tem 3626 linhas e acumula 14 responsabilidades. O founder
pediu explicitamente para não haver código gigante.

**A decisão:** não fazer uma reescrita solta. Extrair composable **junto com a
rodada que toca aquele trecho** — a refatoração vem paga pelo recurso que a
exige, e cada extração é verificável pelos testes que já existem. Uma reescrita
de 3626 linhas sem recurso novo é risco sem retorno visível, e o founder está
testando em produção a cada rodada.

Ordem prevista, conforme as rodadas forem passando por cada trecho:

| composable                                             | linhas hoje | rodada que paga            |
| ------------------------------------------------------ | ----------- | -------------------------- |
| `useConstrucao` (minerar, quebrar, colocar, interagir) | ~217        | 6, 7, 9, 10                |
| `useInventario` (craft, hotbar, slots)                 | ~78         | 1, 3                       |
| `useCriaturas` (mobs, drops)                           | ~80         | 2, 4                       |
| `useSobrevivencia` (dano, morte, renascimento)         | ~50         | 18                         |
| `useMultijogador`                                      | ~312        | quando o multiplayer mudar |
| gancho de E2E (729 linhas, inerte em produção)         | ~729        | mover para arquivo próprio |

## Registro das rodadas

| #   | o que entrou                                                  | commit     | medida                                                                                                     |
| --- | ------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------- |
| —   | (o céu, antes do loop abrir)                                  | `6d1234a0` | 0 manchas, nuvem responde, pós 45× menor ao meio-dia                                                       |
| 1   | O inventário para de mentir e o mob para de atravessar parede |            | 25 testes novos, 2 deles reprovando a regra antiga; shift+clique confirmado no navegador com prova de vida |
| 2   | Construir deixa de ser um clique por bloco                    | `1cce7f4b` | 24 testes novos; colocar segurando, pick block, fantasma, sneak na borda                                   |
| 3   | A noite passa a ter perigo                                    | `4fbbeb9f` | ponte de luz cliente↔worker (11 testes), mob hostil, empurrão em `kx/kz` (10 testes)                       |
| 4   | Fornalha e baú deixam de ser blocos inertes                   | `ed6dfd77` | 24 testes de mobília; bug real do carvão (7 fundições em vez de 8) achado por conta, não por print         |
| 5   | O mundo passa a respirar                                      | `5c7b2d1a` | copa sai de parada (1.03 vs 0.855 no A/B antigo) para 1.036 vs 0.000; 12 testes novos; custo 0-1 fps       |
| 6   | A laje                                                        | `945005dc` | 30 testes novos; encaixe e fusão provados no jogo rodando; sobe meio bloco andando; mesher +5%             |
| 7   | A escada, e a mira que enxerga a forma                        |            | 24 testes novos; winding conferido nas 32 variantes (192/320 errados na 1ª versão); mesher +3,6%           |

## Rodada 5 — o que ficou registrado

**O que entrou.** A folhagem passou a ceder ao vento (antes só a grama cedia:
o `emitQuad` escrevia zero fixo no atributo e a copa das árvores era a única
vegetação congelada do mundo). A onda virou soma de quatro triangulares
suavizadas nas frequências do Crysis, com rajada lenta atravessando o campo e
inclinação constante a favor do vento. A fase passou a ser ancorada no BLOCO, e
a cruz da planta recuou 1/64 pra caber inteira na célula — sem isso metade da
moita balançava com a fase de um bloco e metade com a de outro. Folha deixou de
fundir no greedy (junção em T). E o bucket recortado ganhou material de
PROFUNDIDADE próprio: sombra de folha com furo e acompanhando o vento.

**Armadilhas descobertas (custaram rodada):**

1. `blocoEm` devolve a CHAVE do bloco, não o id. Comparar com `12` não dá erro:
   dá `false` sempre, e a sonda relata "não achei árvore" numa floresta.
2. `surfaceAt` é o primeiro espaço LIVRE acima do topo sólido — e folha é
   sólida. Numa coluna com copa ele devolve o topo da COPA, e varrer pra cima a
   partir dele varre só ar.
3. A convenção de yaw da câmera não é a da física. Chutar custou duas fotos do
   lado errado do mundo, com a cena construída existindo e não aparecendo.
   Conserto: `mirar()` na sonda testa as convenções e CONFERE com `projetar`.
4. A mão do jogador oscila sozinha e come 5% da tela numa medida de movimento —
   maior que o efeito medido. Virou `setFx({hand})`.
5. Cena construída por `fill` com 6 mil edições não sobrevive. Com 338 sobrevive
   — e mesmo assim o resultado tem que ser CONFERIDO relendo o mundo.
6. Ao meio-dia a sombra da copa cai exatamente em cima da mancha da luz de céu
   do voxel: duas coisas empilhadas no mesmo retângulo, e nenhuma A/B separa as
   duas ali. Com o sol de lado a sombra desliza e a medida passa a existir.
7. `String.replace` com alvo ausente devolve a string intacta e não avisa. O
   material de profundidade agora emite RECIBO (`userData.enxertado`), lido pela
   sonda e pelo teste.

**Defeito pré-existente encontrado e ainda aberto:** trocar o perfil de
qualidade para `low` em tempo de execução emite dois
`WebGL: INVALID_OPERATION: texImage3D: FLIP_Y or PREMULTIPLY_ALPHA isn't allowed
for uploading 3D textures` no console. Confirmado no build ANTERIOR (via
`git stash`), então não é desta rodada. Não aparece quando o jogo NASCE em
`low` — só na troca. Entra no backlog.

**O que NÃO foi medido, e está dito assim de propósito:** o custo do vento no
perfil baixo. A cena bate no teto de 120 fps com e sem, e o perfil limita o
pixelRatio — nem subir a escala quebra o teto. Zero de teto não é zero de custo.

---

## Rodadas 21–24 (25/08/2026, madrugada) — o que foi feito e o que foi APRENDIDO

Quatro rodadas, todas medidas, todas no ar.

**21 — autosave com dono próprio.** `useRoqueCraftPersistencia`. O achado não foi
o composable: foi que `buildSavePayload` era chamado em DOIS lugares (o autosave
e o gancho de QA), com a lista de campos copiada. As cópias concordavam por
enquanto. Virou `montarPayloadDeSave`, fonte única, com guard estrutural que
conta as chamadas.
_Regra nova:_ **`podeAgendar` e `podeGravar` são portas diferentes.** Entre
armar o temporizador e ele disparar passam 2,5 s, e o login pode terminar nesse
meio. Igualar as duas perde o primeiro save de quem construiu antes do auth.

**22 — save v6, o rebanho.** O curral não volta mais vazio. O hostil vai junto
de propósito: a vida do JOGADOR é gravada, então sumir com o zumbi transformaria
fechar o app em botão de fuga.
_Regra nova:_ **quando a única fiscalização possível é `grep` no arquivo, extraia
a regra.** O laço de restaurar morava solto no boot e só dava pra vigiar
procurando `bicho.health = m.health` como TEXTO — um guard que não sabe dizer se
o laço chega a rodar. Virou `restaurarMobs(salvos, criar)`, pura, e o teste passou
a RODAR a regra.

**23 — o creeper.** `explosao.js` puro, pavio com histerese (acende a 3, apaga a
7, e no meio o pavio VOLTA), buraco irregular por `applyEdit`, água e lava
intactas.
_Duas coisas que só a foto achou:_ o brilho do pavio ia a 2.0 de intensidade e o
bicho virava um retângulo branco chapado — aviso que esconde o que está avisando
não avisa nada; e a foto "calma" saía com o pavio já aceso, então o par de
controle mostrava a mesma coisa duas vezes. A sonda agora reporta
`pavioNaFotoCalma` e **denuncia a si mesma**.
_Regra nova:_ **classe em guard é REGRA, não lista de nomes.** `mobModelo.spec`
classificava "cabeça em cima" por `key === 'zombie' || key === 'skeleton'`.
Virou `height/width >= 2.5`, e ganhou uma exigência a mais (a cabeça não pode
estar jogada pra trás). Guard que se conserta acrescentando um nome não é guard.

**24 — o esqueleto atira e RECUA.** `flechas.js` puro; mira com compensação
balística; caminho amostrado (a 26 b/s um quadro de 200 ms move 5,2 blocos);
linha de tiro por `ehOpaco`, não `solidAt`.
_Regra nova, e é a mais cara desta noite:_ **há coisas que a sonda visual não
pode julgar, e reconhecer isso é o resultado.** Quatro tentativas de fotografar
a flecha: de frente não dá (o esqueleto mira no JOGADOR, o jogador é a lente, e
uma haste de 6 cm apontada pra lente é um ponto); de cima é a mesma coisa na
diagonal; de lado não dá porque entre o `evaluate` que mede "está a 3,5 blocos"
e o `screenshot` passam ~150 ms — QUATRO BLOCOS. Segurar o jogo pra fotografar
mudaria a coisa sob julgamento. A orientação foi medida onde dá: no GRAFO DE
CENA, comparando o eixo da malha com o vetor velocidade. O motivo está escrito
no topo da sonda pra ninguém gastar a quinta tentativa.
_Segundo achado:_ a sonda estava **medindo um cadáver** — contava tiros depois de
esperar a flecha sumir, e a essa altura o esqueleto já tinha queimado ao sol.

### Backlog conferido nesta noite (itens que estavam ERRADOS)

- ~~#22 highlight é cubo cheio em laje~~ — **já estava resolvido** desde a rodada
  9: `caixasDe` devolve `[[0,0,0,1,0.5,1]]` pra laje e duas caixas pra escada.
- ~~agachar/correr faltando~~ — **existem**, com trava de borda em `physics.js`.

### O que falta de verdade (medido, não suposto)

- **Não existem** porta, cerca, portão, escada de mão, alçapão, botão, alavanca
  nem placa de pressão (`grep -c "door|fence|ladder"` em `blocks.js` → 0).
  Cerca e portão reusariam a textura da madeira, como laje e escada já fazem —
  não precisam de arte nova, precisam de FORMA e de conexão com o vizinho.
- **Não existe interação com criatura**: nem alimentar, nem procriar, nem
  tosquiar. `shears` e `wheat` existem no jogo e não fazem nada com bicho.
- **Escada de canto** (interna/externa) continua faltando: as 8 variantes são
  orientação × topo, sem canto.
- Item novo está BLOQUEADO por arte: carne podre, carne de galinha, flecha
  cravada e TNT precisam de tile novo em `items.png`/atlas — congelado por
  decisão do founder.

## Rodadas 25–26 (25/08/2026, manhã) — a fazenda

**25 — pecuária.** Alimentar (trigo), procriar, filhote, tosquiar.
`pecuaria.js` puro; os relógios rodam dentro do `stepMob` e há um teste que
AMARRA os dois — sem ele, esquecer a chamada congelaria o amor e o curral
entraria em produção infinita. Quatro travas, cada uma com teste e cada uma
inventada a partir de "o que quebra daqui a dez minutos de jogo": espera de
procriação, amor zerado nos dois, filhote sem drop, ovelha tosquiada sem lã ao
morrer.
_Regra nova:_ **a mira em criatura deixou de ser cone.** Era `dot >= 0.92` +
"o mais perto ganha", e com duas vacas lado a lado você alimentava sempre a
mesma. Virou interseção raio-caixa, ficando com o PRIMEIRO acerto. O mesmo cone
servia o golpe.
_Regra nova, e é sobre instrumento:_ **`place()` devolvendo `false` era ambíguo**
— o raio errou, ou a regra recusou? Criei `miradoQA`, que reporta quem o JOGO
mirou. Foi ele que provou que a mira estava certa e a vizinha estava mesmo no
caminho: **o defeito era a cena da sonda, não o jogo.** Sem esse gancho eu teria
"consertado" a metade errada.

**26 — o curral que sobrevive à caminhada.** `shouldDespawn` apagava TUDO a 72
blocos, inclusive o que o jogador acabou de criar.
_Regra nova, e é a lição do par:_ **uma rodada pode ser anulada por uma constante
de outra parte do sistema.** A pecuária estava correta, testada e no ar — e não
existiria no jogo, porque uma linha escrita meses antes apagava o resultado dela
a 72 blocos. Ao entregar um recurso novo, procure a constante velha que o
desfaz. Aqui foram duas: a distância de despawn e o teto único de criaturas (um
curral de vinte vacas desligava a noite).
_Erro meu, registrado:_ um `sed` que subiu a versão do save 7→8 nos testes
também trocou um `toBe(7)` que era a VIDA de uma vaca. **Substituição cega em
arquivo de teste é como um guard vira enfeite.**

### A trava do próximo grande passo (MEDIDA, não suposta)

`blocks.js` tem **128 blocos usados de 256** — o id é um `Uint8Array` no chunk
(16 × 128 × 16 = 32 KB por chunk). Sobram 127 ids.

Isso decide o que dá pra fazer a seguir:

- **Cerca**: 16 estados de conexão × material. Com UM material (carvalho) são 16
  ids — cabe. A conexão pode ser recalculada na colocação e no acordar de
  vizinho, usando a `filaDeAtualizacoes` que já existe (é ela que faz a areia
  cair). Aí a forma continua estática por id, e mesher, colisão e destaque
  seguem funcionando como estão.
- **Escada de canto**: 24 variantes por material (8 × interna/externa/reta).
  Com 4 materiais são 96 ids novos — cabe uma vez e trava o resto.
- **Porta / escada de mão / alçapão**: bloqueados por ARTE, não por id.
- Passar o id pra `Uint16` dobra a memória de bloco por chunk (32 → 64 KB). Não
  foi medido no telefone. **Não faça isso sem medir.**

**Desvio assumido se a cerca entrar:** a caixa de colisão vai até o topo da
célula (1.0), não 1.5 como no original. O jogador pula a cerca; a criatura não,
porque o degrau de `stepMob` passa a recusar cerca. Portão é o conserto certo, e
ele reusa a textura da tábua.

## Rodada 27 — a cerca

Cabia nos 127 ids livres com UM material (16 estados de conexão), e a reconexão
entrou na fila que já existia: quem coloca ou quebra um bloco acorda os vizinhos
por `applyEdit`, então a cerca se reconecta sozinha e **não existe nenhum código
de "avisar as cercas em volta"** espalhado pelo componente. Só escreve quando o
id muda — senão a fila se realimenta e o save grava edição idêntica por quadro.

_Regra nova:_ **quando a forma tem dezenas de retângulos, gere, não escreva.**
São 96 retângulos no estado cheio; à mão seriam 96 chances de inverter um
winding, que não quebra nada — só faz a peça sumir pelo backface culling.
`facesDaCaixa` foi conferida canto a canto contra as faces da escada, que já
estavam certas, e o teste confere as 16 variantes por produto vetorial.

**Três defeitos meus nesta rodada, e o que cada um ensina:**

1. `normalize` em `blocks.js` copia campo a campo, e eu esqueci de declarar
   `cerca`. As variantes existiam, entravam em `BLOCKS`, e chegavam em
   `formas.js` sem o campo: **todas saíam cubo cheio, e nada acusava.** Campo não
   declarado num normalizador é campo que some em silêncio.
2. A recusa do degrau perguntava pela célula do CENTRO da criatura. A vaca é
   barrada quando a QUINA encosta, meio bloco antes — a pergunta caía na célula
   errada e a vaca pulava a cerca. **Quem pergunta sobre o obstáculo tem que
   amostrar do mesmo jeito que quem detectou o obstáculo.**
3. A sonda fotografou a floresta atrás da câmera (`yaw = 0` olha pra −Z neste
   jogo). **Terceira vez que a convenção de yaw custa uma foto** — está anotada
   nas armadilhas lá em cima e continuou custando.

**Desvio assumido e escrito no código:** a cerca tem 1 de altura, não 1,5. As
caixas deste motor vivem dentro da célula. O jogador pula a cerca; a criatura
não. O portão conserta isso pro jogador e reusa a textura da tábua.

## Rodada 31 — a sombra encosta na base do bloco (peter-panning)

O founder descreveu o defeito com precisão de quem mediu: "descola da base do
bloco e o contato fica sem sombra, pior com sol baixo". Está certo, e o "pior com
sol baixo" é a chave — o deslocamento no contato é `normalBias / tan(elevação)`,
então ele cresce sem limite quando o sol desce e vale ZERO com o sol no zênite.

**Medido antes de mexer, no objeto em execução e não na declaração:**
`PCFSoftShadowMap`, `bias -0,0006`, `normalBias 0,055`, `radius` NUNCA escrito no
código (ficava no padrão 1 do three — o valor real só aparecia em runtime),
mapa 2048/2048/1024/512, frustum ±46/±38/±30/±20, sem texel snapping.

**`shadowSide = BackSide` era um no-op MEDIDO.** O three 0.171 já mapeia
`FrontSide → BackSide` para casters (linha 8628 do bundle): o material sólido já
projetava da face de trás. Foi escrito assim mesmo, como contrato explícito, com
o motivo no código — zerar o `bias` depende dele, e um dia alguém troca o `side`.

**Aplicado:** `bias 0`, `normalBias 0,02`, `radius 2`, `shadowRadius` 46→34 /
38→30 / 30→24 com `mapSize` INTACTO (o frustum é quadrado de lado 2R sobre
`shadowSize` texels: encolher R sozinho levou o ultra de 0,045 para 0,033 bloco
por texel sem custar um byte), e texel snapping no alvo da luz com guarda para a
base degenerada quando o sol fica paralelo ao eixo Y.

### ⚠️ ACHADO ESTRUTURAL: a folha de contato do olho é CEGA para este defeito

`qa-roquecraft-olho.mjs` tira as doze fotos com `setTime(6000)`, que é meio-dia,
e ao meio-dia `sunDirection(6000)` devolve (0,1,0) cravado. O deslocamento no
contato é `normalBias/tan(90°) = 0`. **As doze folhas não mostravam o defeito
antes da correção e não mostram a correção depois** — aprovar esta rodada por
elas seria o instrumento concordando com o defeito outra vez.

Elas continuam servindo para o que servem (regressão de enquadramento, acne,
erro de shader, HUD) e foram abertas: nenhuma regressão, e o WebKit — motor do
iPhone — desenhou a areia branca do deserto sem uma listra de acne, que é
exatamente onde `bias = 0` falharia primeiro.

Para o defeito em si nasceu `qa-roquecraft-sombra-baixa.mjs`: mesmo quadro, sol a
18°, uma foto com os parâmetros de ontem e outra com os de hoje, via o gancho
novo `sombraQA`. **Prova de vida antes do veredito:** na floresta a troca muda
4,07% dos pixels contra 0,61% de piso de ruído (6,7×) — a sonda enxerga a
diferença que corrigimos. Na planície o piso de ruído sobe para 2,1% porque a
grama balança sozinha, e o mapa de diferença mostra isso na cara: os tufos
acendem no ruído, e o que só aparece no sinal são as manchas largas de chão
entre as árvores.

**A primeira versão desta sonda foi jogada fora, e o contador é que salvou.**
Ela caçava um bloco isolado sobre chão plano e limpo para medir a fresta em
blocos. Um contador por etapa da peneira mostrou o custo real: de 3.721 colunas
do mapa, 4 tinham chão limpo e NENHUMA pegava sol rasante — com o sol a 13° a
sombra de uma copa de 10 blocos alcança 40 blocos e o mundo inteiro está na
sombra de alguma coisa. Sem o contador, o erro seria sempre o mesmo "não achei
poste" e eu teria apertado o filtro errado por mais uma rodada.

**Novo gancho `sombraQA`**, no mesmo espírito do `matTransparente` que já
existia: troca `bias`/`normalBias`/`radius` em tempo de execução. Ele NÃO mexe no
frustum de propósito — o tamanho do frustum entra no cálculo do texel do
snapping, e trocar só a câmera montaria um estado que nunca existiu, nem o de
antes nem o de agora. Frustum e snapping se conferem pelo número
(`blocosPorTexel`), não por foto.

**Não subiu para produção.** O founder pediu evidência no iPhone antes, e a
evidência não pode sair de produção sem já ter subido — então foi para um canal
de preview do Firebase Hosting, com produção intocada (`live` continua no release
de 10:01).

### Aberto, em ordem de valor (nada disso está prometido — é o mapa)

- **Portão de cerca**: 8 ids (4 orientações × aberto/fechado), textura de tábua.
  É o que devolve ao jogador a passagem que a cerca tirou.
- **Mais madeiras de cerca**: 16 ids cada. Só se o founder pedir.
- **Escada de canto**: 96 ids em quatro materiais — cabe uma vez e trava o
  resto. Decidir antes de gastar.
- **Item novo** (carne podre, carne de galinha, flecha cravada, TNT): bloqueado
  por ARTE, que o founder congelou.
- **Som de creeper e de tiro**: bloqueado por asset — precisa ser CC0.
