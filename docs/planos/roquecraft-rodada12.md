# Rodada 12 — a cama de verdade

Relato do founder, 24/08/2026: _"a cama não está igual a cama do jogo original,
temos que olhar isso no detalhe"_.

## A causa estava escrita como comentário

```js
// vinco do travesseiro: uma dobra suave no meio, sem direção dominante
// coberta: tecido com trama fina, sem listra (listra teria direção)
```

Na rodada 8 as texturas foram desenhadas **de propósito sem direção**. Não era
preguiça: a cama tinha dois ids e não sabia pra onde estava virada, então
qualquer direção no desenho apontaria errado em três das quatro posições.

E a nota no catálogo defendia isso **invertido**:

> "Duas ids, e não oito. […] ela só precisaria virar id se o DESENHO do topo
> tivesse direção. Não tem, de propósito."

O desenho não tinha direção PORQUE não havia id pra guardá-la. A limitação
virou justificativa, e a justificativa fechou a porta.

## O que a medição do "antes" mostrou

|                                           | antes                  | depois                   |
| ----------------------------------------- | ---------------------- | ------------------------ |
| quatro direções dão pares de id distintos | **não** (1 par)        | sim (4 pares)            |
| o tampo gira com a peça                   | **não** (0%)           | sim (54,8%)              |
| tem vão embaixo                           | **não** (maciça)       | sim (estreitamento 0,15) |
| travesseiro na cabeceira                  | **não** (0,506 = meio) | sim (0,248 = ponta)      |
| altura 9/16, sobe andando                 | sim                    | sim                      |

A altura já estava certa desde a rodada 8. Todo o resto, não.

## Oito ids, e o móvel

Duas metades × quatro direções, pelo caminho que a escada abriu na rodada 7. Só
a variante −Z é item; as outras sete existem no mundo, dropam a `bed` e nunca
aparecem no inventário.

A cama virou MÓVEL: colchão de 3/16 a 9/16 sobre quatro pés de 3×3×3 — dois por
metade, nos cantos da ponta de fora de cada uma. É essa regra que distribui os
quatro pés pelas quatro quinas: as duas metades da mesma cama apontam pra lados
OPOSTOS. Se apontassem pro mesmo, os quatro pés ficariam empilhados numa ponta e
a cama seria uma prancheta.

A COLISÃO continua a caixa cheia de 9/16 do original. O desenho ganhou pés; o
passo não tropeça neles.

E `outraMetade` deixou de ser ambígua. A nota antiga registrava a dívida —
_"custaria mais quatro ids por metade, e o caso é raro o bastante pra não pagar
esse preço agora"_ — e agora que os ids existem, a busca é exata. O caminho
antigo ficou só pra save anterior a esta rodada.

## Duas descobertas de motor, as duas MEDIDAS

**1. O uv da forma livre saía da posição.** `uv = (canto[F.u], canto[F.v])` —
serve pra quase tudo, e não serve pro tampo de um móvel que gira: lá u e v são
os dois horizontais, então a mesma função de (x,z) devolve a mesma textura nas
quatro orientações. A peça girava e a textura ficava parada, presa ao mundo.
Com `uv` explícito por canto, o par viaja COM o canto.

**2. O v do TAMPO não é invertido, e o das LATERAIS é.** A dedução dizia o
contrário, e a dedução era boa: "a madeira do estrado é desenhada em y > 13/16 e
aparece embaixo no bloco, logo v = 1 − y". Vale pras laterais. Não vale pro
tampo — o motor tem um `flip` por face e o emissor de forma livre não o aplica
como o caminho greedy.

Com a inversão, o travesseiro caía na junção das duas metades: uma faixa branca
atravessada no meio da cama, como um cinto. Duas execuções da mesma cena, só
essa linha mudando: **0,506 contra 0,248**.

O experimento custou um build. A dedução tinha custado três.

## A sonda, e as seis medições que ela reprovou antes de acertar

`qa-roquecraft-cama-forma.mjs` é novo. A sonda da rodada 8 mede o que a cama
FAZ — encaixa, recusa de dia, pula a noite, grava o renascimento. Esta mede como
ela É.

Seis medições foram escritas e descartadas antes de as cinco atuais medirem
alguma coisa. Nenhuma delas falhava por defeito do jogo:

- **`slotOf` só olha a hotbar.** `setMode('creative')` recria o inventário e
  enche os nove slots; o `give('bed')` caía fora, `slotOf` devolvia −1, e a
  sonda colocou GRAMA quatro vezes achando que colocava cama.
- **Mira a prumo é o caso degenerado.** Fotografar "de cima" com a câmera
  exatamente sobre o alvo: girar não move o alvo na tela, a derivada é zero, a
  malha fechada desiste. As duas fotos saíram do horizonte.
- **Duas fotos de cenas diferentes sempre diferem.** A primeira versão do teste
  de giro comparava duas camas em corredores diferentes: 46 mil pixels de
  diferença, aprovado — e passaria com o jogo exatamente como estava.
- **`fill` de chave inexistente não escreve nada.** A segunda versão comparava a
  variante nova contra uma célula VAZIA e aprovava a diferença.
- **Buraco em faixa escolhida a dedo.** Três tentativas: faixa por coluna nunca
  chegava na altura dos pés; faixa global por mínimo e máximo ia parar 80 px
  abaixo da cama; e a de limiar baixo media a iluminação espalhada. O que separa
  cama de bloco não precisa de faixa: é o PERFIL. Linha a linha, a razão entre a
  mais estreita e a mais larga — 1,0 é caixa, 0,15 é colchão sobre dois pés.
- **Pedra clara passa em teste de "claro e neutro".** O travesseiro apareceu no
  meio da cama numa medição em que ele estava na ponta: o filtro contava pedra
  iluminada em volta. Mudança de luz raramente passa de 150 de diferença; troca
  de bloco sempre passa.

E duas armadilhas já pagas em rodadas anteriores, pagas de novo aqui:
`setFlying(false)` antes do teleporte (não adianta, o teleporte liga o voo), e
medir o y FINAL de uma travessia em vez do PICO.

## Portão

Lint 0 erros (18 avisos pré-existentes). Suíte 6859 testes em 661 arquivos — 10
novos, incluindo as normais das oito variantes por produto vetorial e o uv que
gira. Sonda da forma 5/5. Sonda da rodada 8 ainda 6/6, agora com variantes.
`qa-roquecraft.mjs` nos 9 cenários, zero erro de jogo. Build, push, deploy,
produção conferida.

## Fica pendente

As faces LONGAS da cama ainda são simétricas: o original mostra a beirada do
travesseiro na lateral da cabeceira, e a nossa não. Não foi feito porque exige
descobrir qual eixo do uv corre ao longo da cama em cada uma das quatro
variantes — e depois de duas deduções erradas sobre eixo nesta rodada, isso pede
experimento, não raciocínio.

Do backlog anterior: escada de canto (#23), os `INVALID_OPERATION` do perfil
`low` (#21), blocos que o mundo não gera, plantio, combate com recuo.
