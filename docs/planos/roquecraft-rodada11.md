# Rodada 11 — o balde e a lava

## Uma regra, dois materiais

A regra de fluido da rodada 10 virou tabela. O que separa água de lava são três
números:

|      | passo por bloco | tiques por passo | duas fontes fazem uma terceira |
| ---- | --------------- | ---------------- | ------------------------------ |
| água | 1               | 5                | sim                            |
| lava | 2               | 30               | não                            |

Sete blocos de alcance contra três. Seis vezes mais devagar. É a lentidão que
torna possível correr da lava, e é o alcance curto que faz uma poça de lava ser
um obstáculo em vez de uma inundação.

A lava só declara nível PAR. Como ela sobe de dois em dois a partir de zero, os
ímpares são estados que nenhuma regra sabe produzir — declará-los seria gastar
quatro ids num alfabeto que ninguém fala.

E a lava não faz fonte nova. Se fizesse, qualquer poça viraria fábrica de
obsidiana e a lava deixaria de ser um recurso.

## Os três encontros

- fonte de lava encostada em água (em cima ou nos lados) → **obsidiana**
- lava **escorrendo** encostada em água → **pedregulho**
- água com lava **em cima** → **pedra**

A assimetria é do original e não é capricho: obsidiana só de fonte é o que a
mantém um recurso que se planeja, em vez de subproduto de qualquer respingo.

E o lado de BAIXO não conta pra lava. Se contasse, toda lava que escorre pra
dentro d'água endureceria antes de encostar — e não existiria o gesto de tapar
lava com um balde d'água, que é metade do que um balde serve.

O encontro é consultado ANTES do fluxo: uma célula que virou pedra não é mais
fluido, e perguntar o nível dela primeiro seria perguntar o nível de uma pedra.
E ele vai por `applyEdit`, ao contrário do fluxo — pedra, pedregulho e obsidiana
são estado DURÁVEL. O jogador construiu aquilo, mesmo sem querer.

## O balde, e o defeito que só ele revelaria

Três lingotes em V. Ícone novo, desenhado no gerador: os três baldes têm o mesmo
corpo e se distinguem pela cor do miolo, porque é isso que se enxerga na hotbar
a 32 pixels.

Só FONTE enche. Se lâmina enchesse, um rio de sete blocos viraria sete baldes e
a água deixaria de ter custo.

**A mira atravessa líquido.** De propósito: quebrar mira no bloco atrás do lago,
e um contorno piscando na superfície da água a cada passo seria ruído. Mas com
ela o balde nunca encheria, porque a fonte jamais é o alvo — a sonda mediu
`alvo: null` com a fonte exatamente sob a mira. Agora são duas miras, duas
perguntas diferentes: _o que eu quebro daqui?_ e _o que eu pego daqui?_.

`trocarItem` existe por um motivo específico, e ele está escrito como teste:
consumir e adicionar em duas chamadas PERDE o balde. O consumo acontece, o
`addItem` falha por falta de espaço, e o jogador fica sem nada. Aqui, se o troco
não couber, a troca inteira é cancelada.

## Três bancadas que mediram errado

Nenhuma era do jogo.

**As duas poças que se encostaram.** Água em z = 0 e lava em z = 6 — só que a
água alaga sete blocos em todas as direções. Ela chegou na lava, endureceu tudo,
e a sonda concluiu que a lava não anda.

**As duas poças que caíram da plataforma.** Afastadas pras bordas, cada uma
encontrou a BEIRADA a quatro passos e despencou por ela em vez de se espalhar —
a regra do buraco mais perto funcionando exatamente como devia, na cena errada.
A cura foi medir as duas no MESMO ponto, em série: mesma geometria, mesma
distância de tudo, só o líquido muda. É o par de controle mais honesto que
existe, e as duas tentativas anteriores tinham sido tentativas de evitá-lo.

**A poça que voltou.** Cada encontro limpava um retângulo antes de montar. Mas
a água do encontro anterior tinha alagado muito além do retângulo, e voltava
assim que a limpeza terminava. Agora cada encontro tem sua caixa MURADA.

## O que o tamanho do mapa não responde

A prova de que o fluxo não entra no save era "o número de edições gravadas
cresceu pouco". Não serve: o mapa é por célula, e despejar numa célula que já
tinha sido editada não aumenta o tamanho em nada. A sonda não distinguia "não
gravou" de "já estava gravada".

A pergunta certa é sobre a célula. Uma calha construída só com as PAREDES — a
fileira do meio nunca escrita por `fill` — e depois: a fileira estava virgem
(quatro `null`), a água correu por ela (níveis 0, 1, 2, 3), a **fonte** ficou
gravada (id 21) e a **lâmina** não (`null`, `null`, `null`).

## A silhueta que passou e reprovou com o mesmo jogo

A foto da lâmina d'água da rodada 10 comparava a descida de cada calha contra um
limiar. Numa execução a calha plana desceu 4 px; na seguinte, 20,6 — com o mesmo
jogo. A causa: superfície plana vista de esguelha já desce sozinha na tela, e
quanto desce depende de onde a mira de malha fechada parou.

As duas fotos são tiradas da MESMA câmera, sem mexer nela entre uma e outra.
Subtrair uma da outra apaga a perspectiva e deixa só o nível: **37,3 − (−19,2) =
56,5**, contra 32,9 na execução anterior. Duas medidas do mesmo fenômeno, agora
concordando.

## Portão

Lint 0 erros (18 avisos pré-existentes). Suíte 6849 testes em 661 arquivos — 16
novos. Sonda da lava e do balde 10/10. Sonda do fluxo da água 8/8 (regressão
depois de generalizar a regra). `qa-roquecraft.mjs` nos 9 cenários, zero erro de
jogo. Build, push, deploy, produção conferida.

## Fica pendente

Escada de canto (#23). O perfil `low` em tempo de execução ainda cospe dois
`INVALID_OPERATION` de `texImage3D` (#21). Blocos que o mundo não gera (argila,
granito, andesito, diorito). Plantio. Recuo e crítico no combate. Folhas que não
são de carvalho dropando a folha certa.

Lava na Nether — não existe Nether, mas a tabela já tem lugar pro `passo: 1` que
ela usaria.

E segue em aberto: `projetar` discorda da câmera desenhada por ~100 px. Não
afeta o jogo, mas quatro sondas miram com ele.
