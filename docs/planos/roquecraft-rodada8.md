# Rodada 8 — a cama, e o instrumento que apontava pro lado errado

## O que entrou

Um clique, duas células: o pé onde se clicou, a cabeceira uma adiante na
direção do olhar. Duas células, e só duas — encaixe que erra o eixo escreve
uma terceira, e de longe as três desenham parecido.

De dia recusa e avisa. De noite pula pro amanhecer e grava o ponto de
renascimento. Quebrar uma metade leva a outra. Save v4 guarda o ponto com
guarda de validade: cama destruída volta ao nascimento do mundo.

## O `false` que teria passado

`monstroPerto` quase leu `m.hostil` da instância. Hostilidade mora na
DEFINIÇÃO (`hostile`), não na instância: `m.hostil` seria `undefined` para todo
mob, a função devolveria `false` sempre, e o jogador dormiria cercado de
esqueleto sem nunca ver o aviso.

Isso não aparece em print, não aparece em teste de caminho feliz e não aparece
em produção até alguém reclamar. O teste que pega reimplementa a versão ingênua
e EXIGE que ela erre. Se um dia a hostilidade migrar pra instância, o teste
quebra e alguém lê este parágrafo.

Por isso a função recebe lista já filtrada: quem sabe o que é hostil é quem
tem o catálogo na mão, não ela.

## O instrumento estava medindo o instrumento

Duas coisas quebradas nesta rodada não eram do jogo. As duas passariam.

**Primeira: igualdade contra um relógio que anda.** O veredito perguntava se
dormir de dia deixara `hora === 6000`. O relógio do jogo corre enquanto a sonda
espera — meio segundo vale ~12 ticks — então a resposta era sempre não, e a
rodada nasceu vermelha com o jogo certo. O que separa "continuou correndo" de
"pulou pro amanhecer" não é igualdade, é DISTÂNCIA: dormir salta dezoito mil
ticks, a deriva da espera não passa de dezenas.

**Segunda, e essa é a que importa: a mira acertava por sorte.** `mirar`
enumerava as convenções de yaw plausíveis e ficava com a de menor erro. Passou
em três rodadas. Passou porque as fotos eram picadas, quase de cima — e em foto
de cima o yaw quase não importa, o pitch domina, qualquer candidato cai perto
do centro.

A foto rasa do quarto revelou: erro de mira **0,95** — alvo fora da tela — e a
foto saiu de piso vazio. Quase culpei o `fill`. O mundo, relido, estava
perfeito: `bed`, `bedHead`, `chest`, `oakPlanks`, todos lá.

Foto sem leitura do mundo não distingue **"não construiu"** de **"olhou pro
lado"**, e esses dois defeitos pedem consertos opostos.

A correção não foi acrescentar candidatos — a enumeração nunca teria como saber
qual falta. Foi parar de adivinhar a convenção e MEDIR a resposta: gira um
tiquinho, olha quanto o alvo andou na tela, fecha a malha. Newton em duas
variáveis quase desacopladas. **0,95 → 0,006 em três passos**, seja qual for o
sinal, a ordem dos eixos ou o espelho.

Mora em `scripts/lib/rc-mirar.mjs`, e as quatro sondas usam a mesma. As três
irmãs foram rodadas depois da migração: escada 4/4, laje 3/3.

E o enquadramento virou critério do veredito. Foto desenquadrada agora reprova
em vez de passar calada.

## A contagem que achou os corações

Sem poder trazer o print pra cá, contei os pixels vermelhos no próprio Mac. A
primeira contagem deu a MESMA caixa nas duas fotos — x 438‑585, y 520‑530. É o
HUD: os corações. O detector teria dito "cama presente" numa foto de piso
vazio.

Mascarada a faixa do HUD, sobra a cama: 27 pixels no centro da foto rasa, 28 na
de cima, que eu tinha visto com os olhos. Qualquer contagem de pixel numa tela
com HUD mede o HUD primeiro.

## Portão

Lint 0 erros (18 avisos pré-existentes). Suíte 6760 testes, 656 arquivos — os
24 da cama entraram. `qa-roquecraft.mjs` nos 9 cenários, todos prontos, zero
erro de jogo. Sonda da cama 6/6. Build, push, deploy, produção conferida.

## Fica pendente

Backlog em `roquecraft-loop.md`. O destaque do bloco selecionado ainda é o cubo
cheio mesmo em laje e escada (#22), escada de canto não existe (#23), e trocar
o perfil de qualidade pra `low` em tempo de execução ainda cospe dois
`INVALID_OPERATION` de `texImage3D` no console (#21) — defeito anterior a esta
rodada, confirmado por `git stash` no build de antes.
