# Goal 20 — a cidade viva

O founder jogou e trouxe seis coisas (15/09/2026). Cinco são defeito de
modelagem; a sexta é um sistema que não existe. Este documento é o plano, e a
régua de cada onda vem antes do conserto dela.

## O inventário, medido antes de planejar

Não é impressão: cada linha abaixo foi lida no código.

| queixa                          | o que o código faz hoje                                                                                                                   | arquivo                                            |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| tocha sem sentido na mão        | `setHeld` só conhece `hand`/`tool`/`block`; tocha cai em `block` e vira **cubo cheio de 0.125** com a textura nas seis faces              | `render/viewmodel.js:215-226`, `:312-329`          |
| não consigo cortar a grama      | `dropChance: 0.125` → 7 de 8 tufos não dão nada; no criativo **nunca** dá; `total` travado no piso de 0,05 s mata rachadura e som         | `blocks.js:512`, `ROSRoqueCraft.vue:1464`, `:1503` |
| ferramentas ruins na mão        | **uma geometria de picareta para tudo** — espada, machado, pá, enxada, tesoura. Só a cor do metal muda                                    | `viewmodel.js:171-201`                             |
| villager não tem nada a ver     | é o **mesmo `montarHumanoide` do zumbi e do esqueleto**, 13 caixas, sem nariz, sem avental, sem variação por ofício, imóvel quando parado | `render/entities.js:404-500`, `:703`               |
| cachoeira nunca passa de 1      | não existe constante de largura: a queda é **um par `(qx,qz)`** de uma nascente só, e `labioFechado` existe para garantir saída única     | `cachoeiraDeMontanha.js:236-245`, `:184-191`       |
| quero cidade com NPC de verdade | vila tem 3 tipos de construção, 6-9 aldeões, comércio completo — e **zero diálogo**: `abrirCom` vai direto para a tela de ofertas         | `aldeia.js`, `comercio.js:275`                     |

⚠️ **O que a queixa 2 revela é mais grave que a queixa.** "Não consigo cortar a
grama" não é a mira nem a dureza: o mato quebra em três quadros e some sem dar
nada. O jogo executa a ação certa e não conta ao jogador que executou. Feedback
ausente lê como defeito, e é.

## Duas decisões que não se reabrem

**Não copiamos a modelagem do jogo original.** O founder pediu "exatamente"; o
boneco do comerciante e os modelos de item deles são design protegido, e este
repo é produto em loja. O alvo é a CONVENÇÃO do gênero — ferramenta voxel na
diagonal, silhueta própria por classe, comerciante com nariz e avental que lê
como aldeão sem ser o deles. Julgue o desenho; a cópia não está em jogo.

**O modelo de linguagem só produz FALA.** Decidido com a referência de
arquitetura de NPC com LLM (ver Fontes): estado do NPC é dado estruturado, a
memória significativa é escrita pela LÓGICA DO JOGO e não sintetizada da
conversa, e mudança de estado só sai por intenção validada. No RoqueCraft isso
vira regra dura: troca, presente e amizade continuam pelos caminhos que já
existem e já têm teste. Um NPC que pudesse mudar estado seria um NPC que pode
inventar item — e o `assistantAgent` do RoqueOS, que é a outra ponte disponível,
DIRIGE O DESKTOP: ligar um aldeão nele seria dar ao aldeão o poder de abrir
aplicativo. A porta é a camada de provider do `rosChat`, que é completação pura.

## As nove ondas

- **0 — a régua.** Sonda que fotografa o item na mão nas seis classes, mede o
  corte de mato (tempo, som, drop), fotografa o aldeão, mede a largura da queda
  e o inventário dos três assentamentos. Cada afirmação morre com mutante antes
  de valer.
- **1 — a tocha e as ferramentas.** Geometria por classe no viewmodel; `syncHeld`
  para de jogar fora `tool.kind`; arco de golpe por classe.
- **2 — cortar a grama.** Cadência, som, partícula, drop honesto, tesoura como
  ferramenta certa.
- **3 — o aldeão.** Modelo próprio, nariz, avental, silhueta por ofício, ocioso.
- **4 — a cachoeira.** N nascentes, `labioFechado` só nas bordas da cortina.
- **5 — três tamanhos.** Aldeia (3-4 casas, comum), vila (6-9, como hoje),
  cidade (20-30, rara) com igreja, lojas, feira e ruas por subdivisão irregular
  de lote — grade quadriculada lê como cidade de computador.
- **6 — o NPC ganha dentro.** Nome, ofício, humor, amizade, memória de eventos.
  Diálogo local determinístico, offline, testável — e é o recuo da onda 7.
- **7 — a conversa aberta.** A porta `falaDoNpc()` com a implementação LLM.
- **8 — fechamento.** Gate, sondas, folha de contato, revisor, deploy medido, e
  a evidência no aparelho-alvo que ficou em aberto no Goal 19.

## A ordem tem motivo

As ondas 1 a 4 são as que o founder VÊ em dez segundos de jogo, e são baratas.
Elas vêm antes da cidade porque uma cidade de trinta casas cheia de aldeões
errados com tocha-cubo na mão é o mesmo defeito, trinta vezes maior.

## Fontes

- Arquitetura de NPC com LLM: memória em três camadas, evento significativo
  escrito pelo jogo, saída estruturada para que o modelo não fabrique estado,
  e recuo quando o modelo está lento — <https://www.respan.ai/resources/building-ai-npc-system>
- Geração de cidade medieval: bairros como polígonos irregulares, lote
  subdividido dentro do bairro, e a irregularidade como o que separa cidade de
  tabuleiro — <https://hackaday.com/2017/05/28/procedurally-generating-random-medieval-cities/>

## O que foi entregue (15/09/2026)

Sete ondas, sete commits no branch `goal20-cidade-viva`.

| onda | a queixa                      | a causa, medida                                                                                                                                                    |
| ---- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | tocha e ferramentas na mão    | o viewmodel tinha UMA geometria — a picareta — para seis classes; `syncHeld` descartava `tool.kind` na linha seguinte à que o obteve; a tocha caía no ramo do cubo |
| 2    | não consigo cortar a grama    | `hardness: 0` → quebra em 3 quadros → rachadura invisível, som de cavar nunca dispara                                                                              |
| 3    | villager sem cara de villager | o MESMO `montarHumanoide` do zumbi; `buildMobModel` não tinha onde receber a profissão                                                                             |
| 4    | cachoeira nunca passa de 1    | não havia constante: a largura era implícita numa nascente só                                                                                                      |
| 5    | quero cidade                  | não havia porte; vila era tudo que existia                                                                                                                         |
| 6-7  | NPC com IA                    | zero ocorrências de diálogo no repositório inteiro                                                                                                                 |

**Mutantes: 44 lançados, 44 mortos.** Seis deles só depois de consertar o
instrumento — e três desses seis eram erro meu de afirmação, não de código.

### Os três erros meus que o teste de mutação achou

1. **Onda 2.** Escrevi que a linha `tier: 0` no bloco segurava o drop na mão
   vazia. Apagá-la não reprovou nada: `normalize` já faz `tier: d.tier ?? 0` e a
   linha era decoração em cima do padrão.
2. **Onda 4.** Os testes afirmavam "cada coluna tem sua nascente" — verdade
   também para largura 1 — e todo mundo de teste tinha lábio plano. Travar a
   busca em `n = 1` e apagar `labioPlano` passaram os dois.
3. **Onda 5.** Escrevi uma guarda de sobreposição (`maiorPorPerto`) com um
   comentário grande explicando por que era indispensável. Medido em 841 células
   de terreno real: 14 recusas COM ela e os MESMOS 14 sem ela. Apagada, e no
   lugar entrou o teste da premissa geométrica que a dispensa.

### O que continua sem verificação

- **Nenhum aparelho-alvo.** Tudo medido em Chromium no desktop. No iPhone não
  foi visto — e a regra do projeto pede evidência no aparelho antes de declarar
  pronto. Vale para o Goal 19 (minimapa) e para este.
- **A conversa por LLM nunca falou com um modelo de verdade.** Os 12 mutantes
  cobrem prompt, injeção, recuo e corte; nenhum deles chama um endpoint. A
  primeira fala real precisa de uma chave e de alguém olhando.
- **`ROSRoqueCraft.vue` está em 2.409 de 2.411**, duas linhas de folga.
