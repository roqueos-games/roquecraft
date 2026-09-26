# Rodada 9 — o mundo que se mexe, e o instrumento que mediu céu quatro vezes

## O que existia, e por que não servia

Havia gravidade. Ao QUEBRAR um bloco, se o de cima tivesse `gravity`, ele descia
UMA célula. Sete linhas dentro do `breakBlock`.

Três buracos, e os três aparecem em dois minutos de jogo:

- pilha de areia não desmorona — só a de baixo desce, as outras quatro ficam
  penduradas no ar;
- areia sobre buraco de vinte de fundo desce um e boia;
- e nada cai a não ser quebrando: colocar areia no ar, ou tirar o apoio com
  `fill`, deixa tudo parado.

## Onde a regra mora agora

Três peças pequenas em vez de um `if` no meio do quebrar:

`atualizacoes.js` — a fila. Dedupe (tirar o apoio de uma pilha agenda a mesma
célula por seis caminhos), limite por quadro (duna de seis mil não come o
quadro), ordem estável (sem ela nenhum teste pode afirmar nada). O lote é
FOTOGRAFADO antes de visitar: sem isso uma cascata vertical drenaria o mundo
inteiro num quadro só, que é exatamente o que o limite existe pra evitar.

`gravidade.js` — as regras. Quem cai, o que deixa passar, e até onde. A queda é
consulta de COLUNA, não passo. `atravessa()` tem um termo por caso: tocha e
grama alta deixam passar porque o que não segura o próprio peso não segura o de
ninguém; a laje NÃO deixa, e é o caso que "não sólido = passa" erraria.

`quedas.js` — quem está no ar. Física do original: g = 0,04 bloco/tique²,
arrasto 0,98, 20 tiques por segundo. Teto de 8 tiques por chamada — dois
segundos de quadro travado seriam 40 integrações e a areia atravessaria o mundo.

`render/blocosCaindo.js` — as malhas, de uma piscina que não encolhe. Criar e
destruir geometria a cada bloco enche o coletor justamente quando a duna
desmorona, que é quando mais se olha pra tela.

## O cubo preto que quase voltou

O material do mundo exige os atributos do mundo. Uma `BoxGeometry` crua não tem
`aLayer`/`aLight`/`aTint`/`aWind`: o shader lê 0 em tudo, amostra a camada 0 com
luz 0, e sai um cubo PRETO. Já aconteceu — 20/08/2026, a mão do jogador entrou
no quadro como um cubo preto ocupando um terço da tela.

Agora há teste fixando os quatro atributos e a camada por face, com prova de
vida: areia e cascalho têm que sair DIFERENTES, senão um emissor que ignorasse o
id e pintasse sempre a camada 0 passaria em tudo.

## O destaque que ensinava a mirar errado

Desde a laje (rodada 6) o contorno cercava o cubo inteiro numa peça de meia
altura, e o jogador via a mira "pegando" ar. A geometria agora sai de
`CAIXAS_DE_BLOCO`, a MESMA lista que a física e o raycast leem — se um dia
divergirem, o contorno mente de novo, e por isso ninguém aqui redescreve forma.

A medida que separa laje de cubo **não é contagem de vértice**: as duas têm 576,
uma caixa, seis faces, quatro barras. O que muda é ONDE eles estão. Por isso o
QA lê a caixa da MALHA — 0,516 na laje, 1,016 no cubo.

## Quatro armadilhas, todas do instrumento

Nenhuma era do jogo. As quatro passariam.

1. **Contar cor na tela toda mede o cenário.** Contei preto no quadro inteiro e
   deu 174 mil: era a sombra do piso. É o mesmo erro do detector de vermelho que
   achou os corações do HUD na rodada 8.

2. **Perseguir alvo rápido com mira iterativa é corrida perdida.** A areia cai
   onze blocos por segundo; a mira de malha fechada leva meio segundo pra
   convergir. Quando terminava, o bloco já tinha passado — projeção em v = 1,38,
   fora da tela por baixo.

3. **Entre projetar e o obturador abrir, o bloco anda 200 px.** Mesmo com mira
   fixa. O recorte mediu céu, e céu passou por "não é cubo preto" sem nunca ter
   visto o cubo.

4. **A projeção e a câmera renderizada não são a mesma câmera.** Com a cena
   congelada o recorte AINDA caiu no céu — e as duas caixas, a que cai e a
   parada, erraram na MESMA direção, ~100 px. Foi o desenho ASCII do recorte que
   mostrou isso; média de cor sozinha nunca teria contado.

A cura das quatro é a mesma: **parar de perguntar à projeção onde o objeto está,
e perguntar à diferença entre dois quadros.** O que mudou É o objeto, esteja
onde estiver na tela.

E o controle de cor deixou de ser limiar absoluto — que mede a hora do dia — e
virou o MESMO bloco pousado, no mesmo lugar da tela, mesma luz, mesma distância.
Caindo (154,3 158,4 142,5), pousada (144,8 151,2 135,6), centros a 36 px: o que
sobra de diferença é só "entidade" contra "malha do mundo".

## Dois tropeços de escrita que valem registro

O teto do mundo é 127. A primeira versão soltava a areia de y+30 = 128: o `fill`
não escrevia nada, a areia nunca existia, e a sonda seguiu medindo o nada — até
devolver área NEGATIVA. Agora a existência é conferida e a sonda diz que não
mediu, em vez de devolver zero.

E um teste travou a suíte inteira: passei fundo −1e9, e `destinoDaQueda` varre a
coluna. Um laço de um bilhão por célula atravessada. O custo está escrito no
código agora.

## Portão

Lint 0 erros (18 avisos pré-existentes). Suíte 6801 testes em 660 arquivos — 41
novos nesta rodada. Sonda da gravidade 9/9. `qa-roquecraft.mjs` nos 9 cenários,
todos prontos, zero erro de jogo. Build, push, deploy, produção conferida.

## Fica pendente

Escada de canto (#23). Trocar o perfil de qualidade pra `low` em tempo de
execução ainda cospe dois `INVALID_OPERATION` de `texImage3D` (#21) — anterior a
esta rodada, confirmado por `git stash`. Água e lava que escorrem, com balde: a
fila de atualização foi construída pensando nelas, e é o próximo grande buraco
de dinâmica de construção. Blocos de construção que o mundo ainda não gera
(argila, granito, andesito, diorito, obsidiana). Plantio. Recuo e crítico no
combate.

E fica registrada uma pergunta em aberto: **`projetar` discorda da câmera
desenhada por ~100 px**. Não afeta o jogo — nada no jogo usa `projetar` — mas é
o instrumento que quatro sondas usam pra mirar, e vale medir de onde vem antes
de confiar nele de novo pra recorte.
