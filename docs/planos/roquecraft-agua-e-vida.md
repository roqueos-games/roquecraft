# Goal: fechar os nove pontos do founder de 25/08/2026

## O que este documento é

O founder listou nove queixas num turno só e pediu "um goal com um loop para
fechar de forma precisa e detalhada todos os demais pontos". Este arquivo é esse
goal. Ele existe no repo, e não só no chat, porque o loop atravessa contextos: a
sessão que continuar daqui precisa saber o que já fechou, o que falta, e QUAL É O
CRITÉRIO — sem isso o loop vira uma sequência de mudanças bonitas sem veredito.

**A regra que vale para todos os itens:** nada é declarado pronto por parecer
melhor numa foto. Cada item tem um critério mensurável e um instrumento, e o
instrumento tem que provar que ENXERGA o defeito antes de ter o verde aceito.
Foi assim que as rodadas de sombra, água e onda foram fechadas, e foi o que pegou
três defeitos que a leitura ingênua do pedido teria deixado passar (o mergulho
que não segurava o jogador no fundo, a sonda cega pela própria onda, o zumbi que
nascia no leito do mar).

## Estado do pedido

| #   | Ponto do founder                             | Estado                                                                                                             |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1   | Malha de água repetindo vista de cima        | **fechado** — 8 oitavas, lacunaridade 1,37; repique de autocorrelação 0,0142 → 0                                   |
| 2   | Zumbi e aranha debaixo d'água                | **fechado** — `liquidAt` na regra de spawn, 5 testes                                                               |
| 3   | Lava sem movimento                           | **fechado** — crosta viscosa por deformação de domínio; A/B no relógio da lava                                     |
| 4   | Água escorrendo mal feita                    | **fechado** — face vertical animada + rampa no mesher (o vão de 0,102 bloco fechou)                                |
| 5   | Reflexo do sol nas ondas para dentro da água | **fechado** — cáustica derivada da própria onda; reflexo planar do cenário                                         |
| 6   | Blur de fora d'água olhando o fundo          | **fechado** — nitidez do leito 3,228 → 2,079 (−36%), deriva 0,017                                                  |
| 7   | Tocha horrorosa                              | **fechado** — poste 0,939 × 0,283 bloco (razão 3,32), controle 0 px; chama 690 contra 10                           |
| 8   | Algas e bambu                                | **fechado** — 63 algas e 264 capins em 2.025 colunas de oceano, 0 e 0 no deserto; 158 bambus na selva, 0 no oceano |
| 9   | Vida marinha (peixe, lula, polvo, pinguim)   | **fechado** — 16 bichos em 26 s de oceano (12 peixes, 3 pinguins, 1 polvo), zero encalhados                        |

Os dois herdados de turnos anteriores. B tinha culpado desde 25/08; A ainda não:

| A | Contorno claro na borda da sombra | **aberto, mas agora com régua e com dois suspeitos a menos.** O pós inteiro já tinha sido inocentado por bisseção. Em 25/08 o SHADOW MAP também caiu: régua diferencial (par de fotos com e sem sombra, bordas localizadas pela máscara, perfis alinhados e somados), calibrada com halo plantado a mão — recupera 2 níveis de luma 1:1, ruído entre fotos idênticas 0,01 a 0,37. Varrido em 4 biomas (deserto, campo, floresta, savana), 5 elevações de sol (18° a 84°, incluindo os 11:03 do print), os dois perfis (ultra e o `medium` do iPhone do founder) e 4 valores de `normalBias` (0, 0,02, 0,055 do build antigo, 0,35): a faixa colada na sombra está SEMPRE mais escura que o chão iluminado (−5 a −30), e ZERO pixel ganha luz quando a sombra liga. Uma linha clara acima de 2 níveis teria sido vista e não foi. ⚠️ Não confundir com o contorno DEBAIXO d'água, que era o SSAO e está fechado. Varrido também em DUAS DENSIDADES DE TELA (1280×720 com pixel ratio 1, e iPhone deitado 852×393 com pixel ratio 3) — o eixo que faltava, porque o FXAA do perfil `medium` trabalha em espaço de TELA e o print do founder é de iPhone: −1,73 lá também, ruído 0,33, zero pixel ganhando luz. ⚠️ **E O QUE ESTA RÉGUA NÃO MEDE, POR CONSTRUÇÃO:** ela localiza a borda pela máscara (com sombra menos sem sombra), então silhueta de objeto CANCELA e some — de propósito, porque era justamente a confusão da régua antiga. Logo o que está provado é que não há linha clara na borda de SOMBRA. Franja na silhueta de um objeto contra o céu seria outro fenômeno, e esta régua é cega para ele por desenho. **O que falta é do founder:** olhar o build de hoje e dizer se ainda vê, e onde — se for na silhueta e não na sombra, é outra régua que precisa existir. |
| B | Mapa "monta errado" ao entrar | **fechado** — a auditoria só sabia contar BURACO; passou a contar SOBRA e a sonda `qa-roquecraft-entrada.mjs`, refazendo o passo do founder (menu → novo mundo), reproduziu: 1.035 faces desenhadas em células de AR. Causa: `worldClient.reset` esquecia os chunks sem disparar `onUnload`, e `engine.removeChunk` só é alcançável por ali. Depois do conserto: 0, sem a gambiarra do gráfico mínimo→ultra. |

## A fronteira do BSL

O founder mandou o BSL Shaders como referência de qualidade. **A EULA do
Continuum/BSL proíbe redistribuição**, e a regra do projeto é explícita: só CC0,
MIT, BSD ou domínio público; de shader pack proprietário se lê a TÉCNICA e se
reimplementa. Então o BSL entra como alvo de APARÊNCIA — "a lâmina tem que ler
assim" — e nunca como fonte de código ou de asset. Nenhum arquivo deles entra no
repo, nenhum trecho é copiado.

## A arte descongelou, e isso é uma suposição minha

O founder congelou o gerador de textura em agosto ("o grafico pode deixar como
está"). Os pontos 7, 8 e 9 são impossíveis sem mexer nele: tocha nova, alga,
bambu e quatro criaturas marinhas são arte. Ele respondeu "faça junto com todo o
restante do pedido" e depois pediu para fechar todos os pontos — estou lendo isso
como o descongelamento para ESTES itens, e só para eles. Se estiver errado, os
itens 7 a 9 param e os de shader seguem.

---

## Rodada 1 — lava com movimento, água escorrendo decente

### 3. Lava sem movimento

**O que está errado, no código:** `blocks.js` declara a lava com `liquid: true`,
então ela entra no mesmo material de líquido da água. Só que toda a animação de
lâmina no `voxelMaterial` está atrás do teste `gIsWater`, que compara a camada da
textura com `uWaterLayer`. A lava cai fora de todo ramo animado: onda, normal
ondulada, espuma, cáustica. Ela é uma textura parada com emissão.

**O que construir:** lava não é água lenta — é fluido viscoso. A referência certa
não é onda de gravidade, é rolagem lenta de domínio com deformação: duas camadas
da mesma textura andando em direções e velocidades diferentes, misturadas por um
ruído que também anda. Mais crosta escura na superfície com veios brilhantes
abrindo e fechando (é o que dá a leitura de "está quente e está se movendo").
Emissão modulada pelo mesmo padrão, senão a crosta brilha igual ao veio.

**Critério de aceite:** com a câmera parada sobre uma poça de lava, dois quadros
separados por 1 s diferem acima do piso de ruído — e o CONTROLE, uma face de
pedra no mesmo quadro, não difere. Sem o par, "a lava mexe" seria indistinguível
de "a câmera tremeu".

**Instrumento:** `qa-roquecraft-lava.mjs`, com o mesmo método de diferença de
quadro já usado na água, e o recorte separando lava de pedra pela projeção
(`projetar`), não por chute de retângulo.

### 4. Água escorrendo horrível

**O que está errado:** ainda não medido. A hipótese é a GEOMETRIA da queda: o
mesher desenha a lâmina caindo como quads verticais de bloco cheio, sem
estreitamento e sem a animação de rolagem vertical que faz uma queda ler como
queda. Antes de escrever uma linha, medir: fotografar uma cachoeira e olhar a
malha (`auditarMalha`) e o quad da face vertical.

**Critério de aceite:** a face vertical da água em queda tem rolagem de textura
para BAIXO (diferença de quadro > ruído na face vertical, com a lâmina parada
do lado servindo de controle), e a coluna que cai é mais estreita que o bloco.

---

### Item 4 fechado — e a retratação de um achado que eu publiquei errado

O shader da face vertical está no ar. A prova é o A/B no tempo: a mesma janela
sobre a parede de água mede **4,50 com o relógio da água andando e 0,05 com ele
congelado** — noventa vezes.

**⚠️ RETRATAÇÃO.** Antes disso eu escrevi, num commit e neste documento, que
"água colocada não cai" e que isso era "provavelmente a causa REAL" da queixa do
founder. **Estava errado, e o erro era meu, não do jogo.** Dois defeitos na
sonda, nesta ordem:

1. **Esperar relógio de parede.** A fila de atualização drena por TIQUE, com
   limite por lote, e ao entrar num mundo recém-carregado ela já vem com mais de
   mil células pendentes. Dormir segundos no headless — onde o
   `requestAnimationFrame` ainda é estrangulado — não faz a fila andar. O gancho
   `escoarFluidos` já existia exatamente pra isso: ele roda a fila até convergir.
   Com ele, a queda desce a parede inteira em 117 tiques sem sobrar nada.
2. **Perguntar pela chave errada.** `blocoEm` só devolve `'water'` para a
   FONTE: água caindo e água escorrendo são outros ids, e só um bloco em
   `blocks.js` tem `key: 'water'`. Medindo por chave, a sonda contou ZERO numa
   parede molhada de cima a baixo. Quem responde é `nivelDeAguaEm`.

A lição não é "medir com mais cuidado". É que **um número baixo vindo de uma
sonda não é um achado até a sonda provar que sabe produzir um número alto.** Eu
tinha essa regra e não a apliquei aqui: aceitei o "2 blocos" sem antes exigir da
sonda uma cena onde ela DEVESSE ver a queda inteira.

O que continua valendo do que eu disse: **o worldgen não gera cachoeira**. Isso
foi medido por outro caminho (nenhuma célula de água com ar ao lado em cinco
biomas) e segue de pé como conteúdo que falta — rio e queda d'água não existem
no mundo, só na água de balde.

## Rodada 2 — a luz dentro da água

### 5. Reflexo do sol nas ondas para dentro da água

**O que o founder quer:** o feixe que entra pela superfície e desenha a malha de
luz movendo no fundo — e, olhando de baixo, os raios descendo. Metade disso já
existe: a cáustica no leito está no shader desde agosto, e os raios submersos
entraram na rodada da água (corte 0,42 submerso). O que falta é a ligação entre
os dois: a cáustica hoje é um padrão próprio, não é derivada da MESMA onda que a
superfície desenha, então a luz no fundo não bate com a crista de cima.

**O que construir:** alimentar a cáustica com `rcOndaCompleta` — a mesma função
que faz a superfície — em vez do padrão de senos separado que ela usa hoje. A
malha de luz passa a ser a projeção da onda real, e crista na superfície vira
linha clara no fundo, no lugar certo.

**Critério de aceite:** a posição da linha de cáustica no fundo se desloca junto
com a crista da onda quando o tempo anda — medido por correlação cruzada entre a
faixa de cáustica no leito e a faixa de crista na superfície, no mesmo quadro.
Correlação alta = a luz vem da onda. Baixa = continuam sendo dois padrões.

### 6. Blur de fora d'água olhando o fundo

**Por que é obra maior:** o leito visto através da lâmina é geometria desenhada
ANTES da água, no passe opaco. Borrar o que está atrás de um material transparente
exige uma cópia do buffer de cor da cena (é o que o `transmission` do three faz, e
é o que os packs chamam de refração). Precisa: cópia do alvo opaco, um borrão de
meia resolução, e o shader da água amostrando essa cópia com deslocamento pela
normal da onda e peso crescendo com a profundidade.

Já existe a infraestrutura equivalente da rodada do reflexo (alvo, matriz,
uniformes), então é o mesmo padrão de novo, com a diferença de que aqui a cópia é
da cena e não do espelho.

**Critério de aceite:** a NITIDEZ do leito visto através da lâmina cai com a
profundidade. Medida: energia de gradiente (soma de |∇luminância|) numa faixa de
leito raso contra a mesma medida numa faixa de leito fundo, no mesmo quadro. O
controle é o leito SECO na mesma foto, cuja nitidez não pode ter mudado.

---

## Rodada 3 — a tocha

### 7. Tocha horrorosa

**O que está errado, no código:** `blocks.js` declara a tocha com `plant: true` e
`scale: 0.16`. Ou seja: ela usa a geometria de PLANTA — dois quads em cruz —
encolhida. É por isso que ela lê como um adesivo, e não como um objeto: não tem
volume, não tem chama separada do cabo, e não muda de forma quando é posta na
parede.

**O que construir:** forma própria em `formas.js`, no mesmo sistema de caixas que
já serve escada, laje, cerca e portão: um bastão fino (2/16 de largura), com
variante de PAREDE inclinada, e um quad de chama emissiva no topo, animado. A luz
já é 14 e já pisca? — verificar; se não pisca, um tremor sutil na intensidade.

**Critério de aceite:** a tocha tem caixa própria (não é mais `plant`), a variante
de parede existe e aponta para o lado certo (teste puro sobre `formas.js`, como o
da cerca), a chama anima (diferença de quadro), e o ícone do inventário continua
legível a 16 px.

**Risco conhecido e já pago uma vez:** `normalize()` em `blocks.js` copia campo a
campo. Toda forma nova precisa declarar seu campo lá, senão ela sai cubo cheio e
NADA acusa — foi exatamente assim que as 16 variantes de cerca saíram cubo.

---

## Rodada 4 — a flora aquática

### 8. Algas e bambu

**Blocos novos:** `seagrass` (1 alto), `kelp` (coluna que cresce), `kelpTop`,
`bamboo`, `bambooTop`. Espaço de id: o mundo usa 8 bits por bloco e 152 dos 256
já estão gastos — cabe, mas é o recurso que vai acabar primeiro, e a escada de
canto (96 ids) não cabe junto. Decidir antes de gastar.

**Textura:** entram no `gen-roquecraft-textures.mjs`, na ORDEM que define a camada
do texture array. A ordem TEM que casar com `layerOf` — mexer nela sem regenerar
as três folhas troca a textura de todos os blocos seguintes.

**Worldgen:** alga no leito raso do oceano, bambu em selva. Ambas com densidade
por ruído, não uniforme.

**Critério de aceite:** uma sonda anda pelo oceano e pela selva e CONTA os blocos
gerados (`blocoEm`), e uma foto mostra que eles são cruz e não cubo — o teste de
cubo é obrigatório pela lição da cerca.

---

## Rodada 5 — vida marinha

### 9. Peixe, lula, polvo, pinguim

**Por que é a maior:** `stepMob` é inteiramente terrestre. Ele tem gravidade,
degrau, recusa de cerca, pouso, queima no sol. Nada disso serve para um peixe, e
enfiar `if (aquatico)` no meio dessa função é como o defeito do spawn nasceu —
duas regras diferentes num booleano só.

**O que construir:** um passo de nado SEPARADO (`nado.js`), puro, com sua própria
regra: alvo de rumo em três eixos, ficar dentro do líquido (nunca encalhar), virar
devagar, cardume para o peixe (separação, alinhamento, coesão), jato para a lula.
E uma regra de spawn própria — a inversa da que acabei de escrever para os mobs
de terra.

**Arte:** quatro criaturas em caixa de voxel, no mesmo estilo do gado e do
esqueleto que já existem em `entities.js`. Pinguim é o caso estranho: ele anda no
gelo E nada, então ele é o único que precisa dos DOIS passos.

**Critério de aceite:** (a) nenhum peixe fora d'água em 5 minutos de simulação —
teste puro, mundo montado à mão; (b) o cardume se mantém junto (dispersão média
abaixo de um limiar) sem colapsar num ponto; (c) uma foto submersa mostra as
quatro; (d) o save sobrevive a ida e volta com os novos tipos.

---

## Ordem e por quê

Rodadas 1 e 2 primeiro porque são shader puro: não gastam id de bloco, não mexem
no gerador de textura, e são as que mais mudam a aparência por hora gasta. A
rodada 3 é contida. As rodadas 4 e 5 são as caras e as que consomem recurso
escasso (id de bloco, arte, uma máquina de estado nova) — vão por último, quando
o resto já estiver no ar e julgado pelo founder.

## O que fecha o loop

O loop fecha quando os nove itens estiverem no ar e o founder disser que está bom.
Não antes, e não por eu achar que está.

Em 25/08/2026 os nove estão no ar, e mais cinco que não estavam na lista:
partícula de fogo na tocha, som de onda de 24 s, o contorno submerso, o mapa novo
que montava quebrado, e **a chuva**. **O loop segue aberto** — o que fecha não é
a lista terminar, é o founder dizer.

### Chuva (rodada 6, 25/08)

Tempo como FUNÇÃO de (semente, tick), não sorteio: sobrevive ao save, ao
multiplayer e ao QA. Medido em 400 dias × 4 sementes — 15% chovendo, 41%
nublado, 44% limpo, uma chuva a cada três dias. A superfície molhada segue o
modelo de Lagarde (albedo escurece, rugosidade cai, F0 não muda, porosidade
derivada da própria rugosidade) e só molha quem o céu alcança. A cortina não tem
estado por gota: a queda é `mod(tempo)` no vertex shader e a CPU escreve dois
uniformes por quadro.

Três defeitos achados pelo CONTROLE, nenhum visível a olho: a chuva ACENDIA a
caverna (+37%, o ambiente é luz global), a cortina desenhava DENTRO da pedra
(+181%), e o conjunto escurecia demais (−60,6%, que lê como noite às onze da
manhã) — este último **aprovado por um teste que tinha piso e não tinha teto**.
Depois dos consertos: descampado −33,8%, caverna 0,2%, ruído do par 0,02%.

**Neve fechada na mesma rodada.** A mesma cortina serve os dois — floco e gota
são a mesma coisa caindo com número diferente (7× mais devagar, disco no lugar
do risco, e uma deriva que faz o floco vaguear). E neve NÃO molha: ela acumula e
clareia, o oposto do modelo de superfície molhada.

O terceiro controle da sonda (campo gelado) achou o defeito que os outros dois
não pegariam: o gelo escurecia 14% sob "neve", porque a sobrescrita de QA estava
DEPOIS da regra do bioma em vez de antes, e forçava chuva=1 e neve=1 juntas. É o
mesmo erro do `IS_PLANT` como proxy de "frágil" — duas regras, e a antiga ainda
aceitando quem pertence à nova. Ninguém veria a olho: no gelo tudo já é branco
demais para denunciar 14% a menos de brilho.

Medido, três cenas no mesmo par de ida e volta: descampado −34,42%, caverna
0,21%, campo gelado −0,13%.

### Tempestade (rodada 7, 25/08)

Tempestade é o topo da chuva, não um estado à parte — 8% do tempo, ~6 raios por
minuto no auge, céu aceso 1,7% do tempo, raios de 0,15 a 6,4 km. O relâmpago é
função pura de (semente, tempo) por fatias de 5 s: o engine chama para acender o
quadro e o jogo chama para agendar o trovão, com a mesma resposta. Não existe
canal entre os dois para dessincronizar.

O trovão é sintetizado (não cabe um .ogg longo o bastante para não repetir) e
sai atrasado pela distância — é o que faz a tempestade parecer um lugar em vez
de um efeito.

**Pela terceira vez na sequência, o controle da caverna pegou um vazamento**: o
clarão deixava o fundo da caverna 55,7% mais claro, por duas causas globais (a
exposição e `uSkyFactor` multiplicado inteiro, porque `uShadeFloor` dá um resto
de céu até na pedra). A lição já tem nome: **multiplicador global vaza pra
dentro; o que não vaza é o que já está modulado por quanto de céu a face
enxerga.** Depois do conserto: campo +248%, caverna 0%.

E uma retratação: eu ia commitar a separação de `clarao` e `distanciaKm` como
conserto de defeito. O teste passou também na versão antiga — a mistura não podia
acontecer, porque as janelas são de 5 s e o envelope morre em 0,42 s. Código
confuso, não errado. O teste ficou, agora com um mutante como controle.

### A chuva na água, e o conserto das próprias sondas (25/08)

A última peça: chuva que ignora a água deixa o mar espelho enquanto a praia
molha ao lado. O caminho óbvio era errado — `ondularAgua` já existe, mas a
piscina de ondulações tem 8 slots de 2,8 s e é **do jogador**; a chuva comeria
todos e ele perderia a própria onda ao nadar. Roubar um efeito para fazer outro
não é troca. O certo é agitar a normal: chuva na água, de longe, não é uma
coleção de anéis, é a superfície perdendo o espelho.

E a verificação do dia inteiro, rodando as 15 sondas anteriores contra o build
novo, achou duas coisas que **eu** tinha quebrado e que nenhum teste unitário
veria:

| o que                                        | como apareceu                                                                                                                                                                                                                                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gotoBiome` ganhou padrão `puro = 14`        | mudou a CENA de todas as sondas em silêncio; a da cáustica quebrou ("sem lâmina rasa"), porque praia é fronteira por definição e disco puro de praia não existe. Padrão de volta a zero: quem precisa pede.                                                                                 |
| a cortina de chuva andava na frente da lente | a sonda da refração passou a recusar o próprio número — deriva 0,177 contra sinal 0,376. Com a chuva parada, 0,017. Conserto no interruptor que todas já usam: `congelarAgua` para a chuva também, congelando o RELÓGIO (as gotas ficam paradas no ar, a foto continua provando que chove). |

Quatro cenas no par de ida e volta, cada uma respondendo pergunta diferente:
descampado −34,23% (molha), caverna 0,21% (não entra onde não chega), campo
gelado −0,12% (neve não molha), mar 17,51% (a lâmina perde o espelho). Ruído
máximo do par: 0,01%.

O que está na mesa para as próximas rodadas, em ordem de quanto atrapalha quem
joga: (A) o contorno na borda da sombra, o mais antigo e o único ponto do founder
sem culpado; a régua atual mistura silhueta de árvore com borda de sombra e por
isso não sabe acusar. (B) desempenho — nada foi medido em quadro por segundo
desde a rodada da cáustica, e cinco efeitos entraram depois disso. (C) o
orçamento de id de bloco: 160 dos 256 gastos, e a escada de canto sozinha pede
96 — decidir antes de gastar, não depois.
