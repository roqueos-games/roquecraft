# Goal — o passo, a câmera e a física de quebrar

> Aberto em **2026-08-23**. Fecha quando duas rodadas seguidas de medição não
> acharem nada novo.

## O objetivo

**Andar tem que ser uma coisa só: o pé bate, a câmera desce e o som sai no
mesmo instante. E quebrar bloco tem que ter peso.**

Hoje são três coisas soltas — a cadência do som, o balanço da mão e nada na
câmera — e o estilhaço do bloco é um punhado de cubos que sobe e some no ar.

## O que já está medido, antes de tocar em código

`scripts/qa-roquecraft-passo.mjs`, no jogo rodando, contando o que o áudio
registra:

| material   | parado, 6 s | andando 28 m | intervalo | m/passo |
| ---------- | ----------- | ------------ | --------- | ------- |
| grassBlock | 0           | 9            | 0,667 s   | 3,13    |
| sand       | 0           | 9            | 0,667 s   | 3,13    |
| stone      | 0           | 9            | 0,667 s   | 3,13    |
| gravel     | 0           | 9            | 0,667 s   | 3,13    |
| oakPlanks  | 0           | 9            | 0,667 s   | 3,14    |

**A cadência confirma o relato**: 0,667 s entre passos, mais de três metros por
passada. Um humano a 4,7 m/s dá passo a cada ~0,32 s. Está duas vezes lento.

E tem um defeito que ninguém relatou: **a cadência depende do frame rate**. O
acumulador zera ao disparar em vez de subtrair o limiar, então o excesso do
último quadro é jogado fora. A 60 fps sobra pouco; nesta bancada, a ~5 fps,
sobra muito — daí 3,13 m em vez dos 2,1 m nominais. No celular do founder o
ritmo muda conforme a máquina engasga.

### O passo na areia com o jogador parado: NÃO reproduzido

Cinco bancadas, todas com 0 disparos em 6 a 7 segundos parado:

1. pista seca de areia, desktop, teclado;
2. iPhone/WebKit com o **manche de toque real**, arrastado e solto (a suspeita
   mais forte, porque o input só é normalizado quando passa de 1 — um resíduo
   de 0,2 viraria 0,94 m/s, logo acima do portão de 0,9 do passo). O manche
   volta a zero: 0 passos, 0 deslocamento;
3. areia seca acima do nível do mar;
4. areia na beira d'água;
5. areia submersa rasa, com o jogador dentro d'água.

**Não vou consertar um caso que não reproduzi.** O que dá pra fazer com
honestidade é eliminar a CLASSE: a cadência passa a contar deslocamento real em
vez de velocidade. Sem deslocamento não há passo, não importa o que a
velocidade diga, se a física está oscilando ou se o pé está na água.

## Os mods do vídeo, e o que cabe na nossa versão

O founder mandou a lista da descrição. Eu não assisti ao vídeo — não consigo — e
o que segue é a leitura da ficha de cada mod contra o que o RoqueCraft já tem.

| Mod                       | O que faz                                                                  | Cabe aqui?                                                                                                                                                          |
| ------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Physics Mod**           | fratura de bloco, estilhaço com colisão, ragdoll, item físico, desabamento | **Sim, em parte, e é o pedido desta rodada.** Estilhaço com gravidade, quique e giro. Ragdoll e desabamento ficam fora: mexem em simulação de mundo, não em efeito. |
| **Complementary Shaders** | sombra volumétrica, reflexo de água, bloom                                 | Parcial e caro. Já temos névoa, ciclo de dia e espuma. Sombra volumétrica em WebGL num celular é outro projeto.                                                     |
| **OptiFine**              | desempenho, zoom, luz dinâmica, textura conectada                          | O zoom é barato e cabe. Luz dinâmica de tocha na mão é um passo natural depois desta rodada.                                                                        |
| **First Person Model**    | ver o próprio corpo em primeira pessoa                                     | Cabe e é barato — o modelo de jogador já existe (`buildPlayerModel`). Fica pra próxima: é escopo próprio.                                                           |
| **TerraForged**           | geração de terreno realista                                                | Fora de escopo aqui. Mexer em worldgen com o mundo recém-estabilizado é trocar risco por vaidade.                                                                   |
| **Forge**                 | carregador de mod                                                          | Não se aplica: não temos plataforma de mod.                                                                                                                         |

Desta lista, **o que esta rodada entrega é o estilhaço com física**. O resto
está registrado com um veredito honesto em vez de virar promessa.

## Critérios de aceite

| #   | Critério                                                            | Instrumento                        |
| --- | ------------------------------------------------------------------- | ---------------------------------- |
| 1   | Parado não dispara passo, em nenhum material nem dentro d'água      | harness, contador de disparos      |
| 2   | Andando, o intervalo fica em 0,30–0,38 s na velocidade de caminhada | harness                            |
| 3   | A cadência NÃO muda com o frame rate                                | spec pura, dt de 60 fps e de 8 fps |
| 4   | O som sai no mesmo instante em que a câmera chega no ponto baixo    | spec: mesma fase, por construção   |
| 5   | Câmera parada quando o jogador está parado                          | spec + harness                     |
| 6   | Estilhaço cai, quica no chão do bloco quebrado e gira               | spec de trajetória                 |
| 7   | Dá pra desligar o balanço (enjoo de movimento é acessibilidade)     | spec da preferência                |

## Registro das rodadas

### Rodada 1 — o instrumento, três vezes

O harness me devolveu tabela de zeros duas vezes com ar de resultado, e as duas
foram culpa dele: a primeira lia `g.state.player` UMA vez (é getter, devolve
cópia nova — distância deu 0 em tudo), a segunda procurava o contador em
`info()` quando ele mora em `bancoInfo`, e a terceira chamava `breakNow` com a
câmera no horizonte, sem bloco na mira.

Por isso o harness agora começa com **prova de vida**: destrava o áudio, olha
pros pés, quebra um bloco e confere que o contador se mexeu. Se não mexer, ele
ABORTA em vez de imprimir zeros. Um contador que só sabe devolver zero não é
medição.

### Rodada 2 — a cadência

|                    | antes   | depois      |
| ------------------ | ------- | ----------- |
| intervalo          | 0,667 s | **0,316 s** |
| metros por passada | 3,13    | **1,48**    |
| parado, 6 s        | 0       | 0           |

E o 1,48 é estável: nesta bancada o frame rate é baixo, e era exatamente aí que
o valor antigo inflava de 2,1 para 3,13. Subtrair o limiar em vez de zerar tirou
o ritmo do jogo das mãos do frame rate.

### Rodada 3 — sincronia por construção

Som, câmera e mão liam três relógios diferentes: o som tinha um acumulador no
componente, a mão tinha o próprio `bob` no `viewmodel`, e a câmera não tinha
nada. Agora os três leem a mesma fase de `passo.js`. Dessincronizar deixou de
ser improvável e passou a ser impossível — é o que o teste do quadro da passada
fixa: quando o som sai, a cabeça está no ponto mais baixo.

13 mutações aplicadas à mão, 13 pegas.

### O que NÃO consegui

**O passo na areia com o jogador parado não reproduziu em cinco bancadas.** A
correção elimina a classe (sem deslocamento não há passo), mas eu não vi o caso
dele acontecer. Se persistir, o que resolve é a coordenada: com x, z e bioma eu
reproduzo direto.

**O vídeo eu não assisti** — não consigo. A análise dos mods saiu da lista que o
founder colou e da ficha de cada um, não do conteúdo em vídeo.
