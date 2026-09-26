# Rodada 14 — o índice que não podia ser interpolado

Rodada curta e de um assunto só: caçar o print do founder — vegetação chapada
em quadrados cruzados, com textura errada, num iPhone — que não reproduz em
lugar nenhum.

## O que foi descartado, com evidência

**Não é o motor.** A sonda do olho ganhou `MOTOR=webkit`: a MESMA folha de
contato, os mesmos 3 perfis × 4 biomas, rodando no WebKit, que é o motor do
iPhone. As 12 cenas saem iguais às do Chromium, `erros: []`, 0 infração de GL.
Rodar a mesma sonda em dois motores, em vez de escrever uma segunda sonda pro
celular, é o que mantém a comparação honesta: se a foto muda, mudou o motor.

**Não é um caminho de fallback de folhagem.** Não existe. `planta` = 2 quads
cruzados é a malha CORRETA de grama e flor, em todos os perfis — o `low` não
tem um modo simplificado que troque folha por cruz.

## O que foi encontrado, e é real

`vLayer` — o índice que escolhe qual das 81 camadas do `sampler2DArray` a face
amostra — estava declarado como `varying` comum. **Interpolado pelo triângulo.**

Um índice interpolado vale 40.9998 no meio do quad em vez de 41, e `texture()`
arredonda pro inteiro mais próximo: basta o erro cruzar 0.5 e a face inteira
amostra a **textura errada**. Que é literalmente o sintoma do print.

Por que só apareceria no celular: o erro é de precisão do interpolador. Onde o
fragment shader roda em `highp` a margem é enorme; onde cai pra `mediump`
(mantissa de 10 bits) ela encolhe na mesma proporção. E o greedy meshing
amplifica — um quad que cobre 16 blocos interpola por uma distância 16× maior.

Conserto: `flat varying float vLayer`, nas três declarações (vértice, fragmento
do material principal, fragmento do material de profundidade — os três têm que
casar ou o programa não linka). `flat` não interpola: cada fragmento recebe o
valor exato do vértice provocante. De quebra é mais barato.

**Honestidade sobre o alcance:** não reproduzi o defeito, então não posso dizer
que consertei o print. Isto entra como correção de SOLIDEZ — confiar que um
inteiro sobrevive à interpolação está errado mesmo onde funciona.

## Evidência de que não regrediu

Diff pixel a pixel das duas folhas de contato, antes e depois: **11.417 pixels
de 1.728.000** diferem, e o mapa mostra exatamente **vento na vegetação e a mão
balançando**. Nenhum quad inteiro mudou de cor — que é o que apareceria se o
`flat` tivesse pego o vértice provocante errado. Lint 0 erros, 6859 testes,
produção conferida no Chromium E no WebKit, sem erro de console.

## Achado lateral, com número

A semente 942457 abre com `leque` **6.0** (média de 5 raios) contra 10–12 das
outras nove. O raio central está livre nos 12 blocos de alcance — não é "cara
na parede" — mas metade do campo de visão é tronco. É um primeiro quadro
apertado, não um defeito.

Fica anotado COM O NÚMERO justamente porque a última tentativa de mexer no
nascimento se perdeu por melhorar uma média: o alvo é subir o `leque` das
piores sementes **sem baixar o das outras**, e agora existe como medir isso.

---

## INCIDENTE — a rodada 14 quebrou o jogo em produção, e foi revertida

**16:20** subi o `flat varying float vLayer`.
**16:43** o founder mandou o print: tronco com anéis concêntricos nas laterais,
copa como lajes marrons, areia listrada, pedra branca e azulada. "Você acabou
com o jogo que estava bom."
**16:47** revertido (`282accc0`) e no ar.

O sintoma é exatamente o que a mudança podia causar: **cada face amostrando a
camada errada do texture array**. Anel é a textura do TOPO do tronco aparecendo
na LATERAL — um deslocamento de índice, não uma textura nova.

### A causa raiz do erro não é o shader. É como eu decidi subir

A justificativa inteira do `flat` era uma hipótese **sobre o iPhone**:
"interpolação perde precisão em `mediump`, e por isso a textura sai errada lá".
Eu não tinha iPhone. Eu escrevi no próprio commit que não tinha reproduzido o
defeito. E subi assim mesmo, chamando de "correção de solidez".

Uma mudança cuja premissa é uma plataforma que eu não consigo medir **não pode
subir na minha assinatura**. O `flat` até pode estar teoricamente certo — a
mudança é defensável no papel, e é por isso que ela me convenceu. Mas o papel
não é o aparelho: o driver escolhe o vértice provocante, e o meu desktop
concordou com a minha teoria enquanto o aparelho do founder discordou.

Verde no Chromium e verde no WebKit de desktop **não são** verde no iPhone. Eu
tratei "rodei nos dois motores" como se fosse cobertura da plataforma, e não é:
é o mesmo motor em outro sistema operacional, com outro driver e outra GPU.

### Verificação do revert

Produção, WebKit, retrato de celular, bioma Praia, depois do revert: casca no
tronco, folha verde, areia lisa, sem erro de console. A foto está em
`scripts/.qa-praia/`.

### Regra que sai daqui

**Mudança de shader ou de GPU não sobe sem evidência no aparelho-alvo.** Se o
alvo é iPhone e eu não tenho iPhone, o caminho é: preparar a mudança, pedir ao
founder um teste de UM print antes do deploy, e só então subir. Não existe
"correção de solidez" em código que roda em driver que eu não consigo executar
— existe aposta, e a aposta foi paga com o jogo dele quebrado por 27 minutos.
