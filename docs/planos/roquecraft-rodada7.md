# Rodada 7 — a escada, e a mira que enxerga a forma

## O que entrou

Quatro materiais × quatro orientações × duas metades = 32 ids. Só a variante
canônica é item; as outras 31 existem no mundo, dropam a canônica e nunca
aparecem no inventário. A orientação sai do OLHAR: o degrau baixo nasce virado
pro jogador, que é o lado de onde se sobe.

Junto: o raycast passou a enxergar a forma. Antes, mirar no vazio acima de uma
laje ou no vão de um degrau acertava a célula como se fosse cubo.

## Onde a geometria mora agora

`formas.js` é novo e é a GEOMETRIA — as caixas sólidas e os retângulos que o
mesher desenha. `blocks.js` continua sendo o CATÁLOGO: o que cada bloco é,
quanto custa quebrar, o que dropa. Elas mudam por motivos diferentes.

A escada é escrita UMA vez, com o degrau baixo pro -Z, e as outras sete
variantes saem de giro e espelho. Trinta e duas formas de uma descrição.

## O teste que existe pelo defeito

**A ordem dos cantos é a normal.** O emissor não recebe normal nenhuma: ela sai
do produto vetorial dos lados do retângulo. Ordem trocada = face virada pra
dentro = triângulo engolido pelo backface culling = buraco na escada.

E buraco em escada **parece sombra**. Não dá pra achar em print.

A primeira versão de `formas.js` errou **192 de 320** normais. O teste que
confere as 32 variantes por produto vetorial pegou na primeira execução, antes
de qualquer pixel. Sem ele, isso teria ido pra produção e voltado como "tem uma
sombra estranha na escada" semanas depois.

O segundo teste da mesma família: o degrau baixo tem que ficar do lado da
orientação. Volume, área e normal podem estar todos certos numa escada virada
180° — ela desenha bem, colide bem, e é impossível subir. Só essa conta separa
as duas, e é a única que o jogador percebe.

## Malha

A escada não passa pelo greedy: ele fabrica um retângulo por célula e por face,
e a escada tem dez retângulos de tamanhos diferentes. Ganhou passe próprio.

**A luz vem do mesmo lugar que a dos cubos vizinhos** — os quatro cantos da face
da célula, interpolados na posição do canto do retângulo. Sombreá-la chapada,
como planta, deixaria a escada flutuando visualmente no meio da alvenaria.

Custo medido em `bench-mesher.mjs`: 1,68 → 1,74 ms por seção (**+3,6%**), com
contagem de vértices idêntica numa cena sem escada. No caminho: a primeira
versão custava +12% porque varria a seção duas vezes (um passe pra planta,
outro pra forma livre) e +6% a mais porque consultava duas tabelas onde cabia
uma. As duas voltas estão registradas no código.

## Física

`solidAt` passou a devolver LISTA DE CAIXAS quando a forma não é "uma caixa
encostada no chão ocupando a célula inteira em X e Z". Bloco simples continua
devolvendo o número de sempre — é o que mantém todo teste que retorna
`true`/`0.125` na mão funcionando sem saber que formas existem.

X e Z entraram na conta de colisão. Enquanto toda forma ocupava a célula
inteira no plano, bastava o laço de células.

Medido no jogo rodando, com controle: pousar no degrau baixo para em **+0,5**,
na parte alta em **+1,0**, e o MESMO par de pontos sobre um cubo cheio para em
+1,0 nos dois. Sem o controle, "parou em 1" não distinguiria escada de caixa.

## O teste de perf que mentia

`perf.spec.js` reprovava na suíte cheia e passava sozinho três vezes seguidas —
101 ms contra teto de 40, sem regressão nenhuma por trás. Duas causas, as duas
consertadas:

1. o fator de calibração da máquina era amostrado UMA vez no carregamento do
   módulo, e a malha rodava com a máquina em outro estado;
2. uma amostra só, num sistema com ~650 arquivos de teste em paralelo, pega a
   cauda do escalonador em vez do piso.

Agora o fator é amostrado adjacente ao trecho medido, e as duas pontas usam o
MELHOR de três. Três suítes cheias seguidas, verdes. O orçamento nominal não
mudou — o que mudou foi a régua.

## Armadilhas desta rodada

1. `mirar()` mirava a partir dos PÉS. A câmera fica ~1,6 acima de `player.y`, e
   a 3 blocos de distância esse offset é maior que o desnível — a sonda relatou
   "não achei alvo" quatro vezes seguidas.
2. A silhueta em texto começou com recorte de pixels chutado e caiu no terreno
   de fundo: as duas imagens saíram idênticas e o controle não controlou nada.
   O recorte agora é PROJETADO.
3. Comparar duas fotos sem congelar o relógio compara sombra, não forma: o sol
   anda entre elas e caracteres viram de nível no quadro inteiro.
4. A primeira cena de silhueta usava o lance inteiro, construído sobre uma rampa
   de pedra — trocar a escada por cubo mexia num bloco de cada coluna e a
   silhueta quase não mudava. Uma escada só, isolada, contra o céu, responde.
5. Minha própria expectativa no eixo Z estava invertida na sonda. O código
   estava certo; a sonda pegou o meu erro de contabilidade, que é para o que
   ela serve.

## Fica em aberto

- **O destaque ainda é o cubo inteiro.** A mira já enxerga a forma; o contorno
  branco não. Agora que a escada existe, a diferença é visível.
- **Escada em canto** (o degrau em L do jogo de referência, que se forma sozinho
  quando duas escadas se encontram) não existe. São mais 8 formas por material,
  e a conta de ids começa a pesar: 109 de 256 já estão em uso.
- Trocar o perfil pra `low` em execução ainda emite dois erros de WebGL no
  console (pré-existente).

## Nota de fechamento

As fotos foram conferidas a olho depois, quando o desktop voltou (a
autenticação tinha expirado no meio da rodada e o envio de arquivo foi
negado por um tempo). Confirmado nas imagens: os quatro materiais, as duas
metades, o perfil em L nítido, a escada invertida pendurada no teto com o
degrau embaixo, e sombra coerente com a forma. Nenhum buraco, nenhuma face
invertida.

Produção verificada em `qa-roquecraft-prod`: abriu, desenhou, assets, áudio e
console todos OK, zero erros.
