# Rodada 10 — a água escorre

## O que existia

Um id, altura fixa, parada. Um lago era um decalque azul: dava pra nadar nele,
mas furar o fundo não fazia nada e não existia maneira de fazer água ir de um
lugar a outro.

## Puxado, não empurrado

O estado de uma célula é função dos vizinhos dela, e de mais nada. Ninguém manda
água pra ninguém.

Empurrando — cada célula distribuindo pros lados — parece mais natural e é onde
mora o bug: dois vizinhos disputam a mesma célula no mesmo tique, a ordem de
visita decide quem ganha, e a mesma cena dá resultado diferente a cada execução.
Puxando, a ordem não importa: pergunte a qualquer célula, a qualquer hora, e ela
dá a mesma resposta.

E a drenagem sai **de graça**. O nível é a distância até a fonte: nível 3 só
existe encostado em nível 2. Tire a fonte e todo mundo passa a ver vizinhos
piores que si, o número sobe, passa de 7 e a água some — de dentro pra fora, que
é como escoa de verdade. Não existe ilha estável sem fonte: duas células que
tentassem se sustentar uma na outra veriam o nível subir a cada rodada até
estourar. Isso é um teste, não uma esperança.

## O atraso, e por que é um anel

Areia cai no quadro seguinte; água não. No original ela anda um bloco a cada
cinco tiques. Sem atraso, um lago furado se espalha inteiro num quadro — o que
além de errado esconde a única coisa que dá prazer de olhar, que é a água
ACHANDO o caminho.

O atraso é em tiques do JOGO, não em segundos de relógio: o mesmo rio escorre na
mesma velocidade a 30 e a 144 quadros. A estrutura é um anel de baldes, um por
tique. Com prazo por item, cada quadro percorreria tudo que espera — e o que
espera pode ser um lago inteiro. Com o anel, avançar o tempo é trocar de balde.

## A beirada

Busca em largura de até cinco passos, contornando quinas, andando só por células
atravessáveis. Duas recusas, as duas do original:

- **quem pode descer, desce** — água em cima de buraco não se espalha pros
  lados, despenca;
- **quem não pode descer escolhe** — entre os lados abertos, só os que levam ao
  buraco mais perto recebem. Empate recebe junto; sem buraco à vista, todos
  recebem, e aí sim vira o losango.

A busca não anda por cima de sólido. Andaria, e a água escolheria uma direção
onde nunca vai conseguir passar — o buraco do outro lado do muro.

## O que NÃO entra no save

O fluido não passa por `applyEdit`. Encher uma cova muda milhares de células;
registrar todas encheria o save de estado derivado e afogaria o multiplayer.

O que se guarda é a FONTE; o resto se recalcula. É por isso que o nível ser
função dos vizinhos importa: carregar o mundo e reagendar as fontes reproduz o
rio inteiro sem ter gravado uma gota dele. Medido: 41 edições gravadas depois de
cinco cenas de alagamento.

## A altura que já estava paga

A malha já rebaixava o topo da água em `WATER_DROP = 0,12` — a borda visível na
praia. A fonte do original fica em 8/9 ≈ 0,889, ou seja, um rebaixamento de
0,111. Os números batem porque saem da mesma ideia.

Então o rebaixamento deixou de ser constante e virou tabela por id
(`ALTURA_LIQUIDA`). Para a fonte o valor é 1 − WATER_DROP, exatamente o que o
motor já desenhava: nada do que existia mudou de aparência, e os sete níveis
ganharam altura de graça em cima da máquina que a laje trouxe na rodada 6.

## As duas bancadas que mediram errado

**A fita unidimensional.** Os testes de fluido eram escritos como uma linha só
em Z. Só que o mundo tem três eixos: a busca de buraco saía da fita pelo Z,
achava "chão ausente" logo ali, e concluía que o buraco mais perto ficava a um
passo na direção errada. Cinco testes reprovaram com o código certo. Uma bancada
sem paredes não mede fluido nenhum — tudo vaza pela borda. Agora fora do mapa é
rocha.

**O topo que era a parede.** A foto da calha mede a silhueta da lâmina por
diferença entre a calha seca e a cheia. A primeira versão pegava o topo de
qualquer pixel alterado — e encher a calha muda também a PAREDE, porque a água é
translúcida e mexe na luz que chega na pedra atrás. Resultado: espalhamento de
312 px com nível e 310 px sem, ou seja, mediu a parede nas duas e não viu lâmina
nenhuma. A lâmina é azul; a pedra iluminada não. Com o filtro e a inclinação por
mínimos quadrados: **29 px de descida com nível, 4 px no controle plano**, mesma
câmera nas duas.

E o tique exato não se crava em ponto flutuante: somar `dt × 20` setenta e duas
vezes dá 9,99999 e não 10. O teste de independência de taxa de quadros enquadra
— antes e depois — em vez de cravar a casa decimal.

## Portão

Lint 0 erros (18 avisos pré-existentes). Suíte 6833 testes em 661 arquivos — 32
novos. Sonda do fluxo 8/8. A sonda ANTIGA da água (onda, espuma, profundidade,
empuxo) continua 5/5, o que era a pergunta importante depois de mexer na altura
da lâmina. `qa-roquecraft.mjs` nos 9 cenários, zero erro de jogo. Build, push,
deploy, produção conferida.

## Fica pendente

**O balde** — é o que põe a água na mão do jogador, e precisa de arte nova no
gerador de texturas. Primeiro item da rodada 11.

Lava que escorre, com os três encontros do original (lava em água corrente vira
pedregulho; lava caindo em água vira pedra; água em fonte de lava vira
obsidiana) — a fila já tem atraso configurável, que é o que a lava de 30 tiques
precisa. Escada de canto (#23). O perfil `low` em tempo de execução ainda cospe
dois `INVALID_OPERATION` de `texImage3D` (#21). Blocos que o mundo não gera
(argila, granito, andesito, diorito, obsidiana). Plantio. Recuo e crítico no
combate.

E segue em aberto: `projetar` discorda da câmera desenhada por ~100 px. Não
afeta o jogo — nada no jogo usa `projetar` — mas quatro sondas miram com ele.
