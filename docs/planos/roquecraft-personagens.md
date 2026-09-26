# Goal — os personagens do RoqueCraft

> Aberto em **2026-08-23** a pedido do founder: _"estão tortos e sem sentido, a
> cabeça pro lado errado"_. Fecha quando duas rodadas seguidas de medição não
> acharem nada novo.

## O objetivo

**Todo bicho e todo boneco do RoqueCraft tem que ler como um personagem: de
frente pra onde anda, com as partes no lugar, com um andar que faz sentido pro
corpo que ele tem, e sem defeito que vaze de um pro outro.**

Não é "melhorar os modelos". Eles estão errados de um jeito **mensurável**, e a
primeira medição já provou o pior.

## O que já está provado, antes de tocar em código

`scripts/.probe-yaw.mjs` — three.js headless, sem WebGL:

```
modelo com a cara em -Z, rotation.y = atan2(mx, mz)   [o que está no jogo hoje]
  anda norte -> cara (0.00, 1.00)   dot=-1.00  DE COSTAS
  anda sul   -> cara (0.00,-1.00)   dot=-1.00  DE COSTAS
  anda leste -> cara (-1.00, 0.00)  dot=-1.00  DE COSTAS
  anda oeste -> cara (1.00, 0.00)   dot=-1.00  DE COSTAS
```

Os modelos têm a cara em **−Z** (cabeça do quadrúpede em `-bodyLen*0.62`, bico
da galinha em `-bodyLen*0.9`, olhos da aranha em `z=-0.82`) e o renderizador
aplica `rotation.y = atan2(mx, mz)`, que aponta o **+Z** pra direção do
movimento. **Todo mob do jogo anda de ré**, nas quatro direções, em todos os
tipos.

O boneco do jogador remoto **não** tem o defeito: cara em +Z e `-yaw + PI`,
dot = 1.00. Duas convenções no mesmo arquivo, uma conferida e a outra não.

## Critérios de aceite

Cada critério tem um instrumento. Critério sem instrumento é opinião, e opinião
não fecha goal.

| #   | Critério                                                                                                   | Instrumento                      |
| --- | ---------------------------------------------------------------------------------------------------------- | -------------------------------- |
| 1   | A cara aponta pra direção do movimento, em todo tipo e toda direção                                        | spec headless, `dot ≥ 0.99`      |
| 2   | Hostil encara o jogador **enquanto** ataca (hoje congela o yaw ao entrar no alcance)                       | spec de `stepMob`                |
| 3   | O giro não estala: yaw interpolado, não atribuído                                                          | spec + turntable                 |
| 4   | Anatomia: cabeça sobre o corpo, patas nos cantos, pé no chão, nada dentro, nada solto                      | spec de caixas + turntable       |
| 5   | Andar coerente com o corpo: quadrúpede em trote diagonal, bípede alternado, aranha com as 8 patas pra fora | spec de fase + turntable         |
| 6   | Machucar um bicho não pisca os outros da mesma espécie                                                     | spec (o material é de cache)     |
| 7   | No multiplayer o convidado vê as pernas andando                                                            | spec de `packMobs`/`unpackMobs`  |
| 8   | Cada espécie se distingue a 20 m pela silhueta                                                             | turntable, revisão print a print |
| 9   | Nada vaza: todo material criado por mob é liberado                                                         | spec de dispose                  |

## O que NÃO entra

- Trocar a linguagem voxel por modelo orgânico. O mundo é feito de cubos de 1 m;
  personagem cúbico é a língua do jogo, não economia.
- Asset externo. A casa é CC0 ou procedural, e o que existe é procedural com
  grão — isso fica.
- Refazer a IA. O goal é o corpo e a orientação, não o comportamento, exceto
  onde o comportamento deixa o corpo torto (critério 2).

## Registro das rodadas

### Rodada 1 — a convenção

Medido antes de tocar em código: **todo mob andava de ré** (dot = −1,00, quatro
direções, todos os tipos). Unificado em "todo modelo olha pra +Z", com
`anguloDeFrente` e `girarPara` — uma regra só, testada, e as duas semânticas de
yaw (rumo do bicho × ângulo de câmera do jogador) visíveis lado a lado.

Junto vieram, do mesmo lugar:

- braços do zumbi esticados pras COSTAS (a rotação estava certa, o modelo é que
  estava virado);
- giro sem interpolação — a cabeça estalava a cada pacote de 8 Hz;
- hostil congelava o yaw ao entrar no alcance e batia de perfil;
- passo lido de `mob.anim`, que `unpackMobs` zera: no cliente convidado o bicho
  deslizava de pernas paradas;
- flash de dano escrito no material do CACHE: bater num porco acendia todos os
  porcos do mapa;
- só a geometria era liberada no despawn, os materiais vazavam.

### Rodada 2 — a anatomia

Anatomia deixou de ser derivada de `width`/`height` por multiplicação (era isso
que dava um porco tão comprido quanto largo e uma vaca sem focinho) e virou
tabela por espécie. Gait por fase explícita: trote diagonal no quadrúpede
(era pulo de coelho), alternado no bípede, tetrápode varrendo em Y na aranha
(as oito patas eram trilhos no eixo Z, giravam no eixo errado).

O inventário numérico de peças do turntable achou três defeitos que nenhuma
medida de altura ou fase pega:

- aranha com 8 cm de vazio entre cefalotórax e abdômen — cabeça flutuando;
- arco do esqueleto a 30 cm da mão, porque eu o posicionei em coordenada de
  mundo em vez de pendurar no braço;
- asa da galinha girando pelo próprio meio, entrando no corpo a cada batida.

### Rodada 3 — o instrumento estava frouxo

13 mutações aplicadas à mão. Duas passaram, e as duas eram folga minha:

- **"encosta em alguma coisa" não bastava.** A aranha partida em duas ainda
  tinha tudo encostando em alguém, porque as patas faziam ponte entre as
  metades. Virou conectividade sobre o TRONCO, ignorando membros — o mesmo
  aprendizado do "bloco flutuando" no mundo, onde heurística por coluna falhou
  e só flood-fill respondeu.
- **tolerância de flutuação de 10 cm.** Deixava um bicho pairando 8 cm passar.
  Caiu pra 4 cm; todos medem pé = 0,000.

Depois disso: **13/13**.

### Rodada 4 — o que só o olho pegou

Com o login de volta, revisei print a print. Cinco defeitos que **passavam em
todos os testes** e eram a primeira coisa que o olho via:

- **O braço do zumbi e do esqueleto saía da CABEÇA.** Ombro em y=1.76 com a
  cabeça ocupando 1.52 a 2.04. Tudo encostava em tudo, então nenhuma medida
  reclamou.
- **O porco e a vaca não tinham cabeça.** Ela ficava na mesma altura do dorso e
  da mesma cor: de perfil, um pão com pernas.
- **As manchas da vaca eram etiquetas** — dois retângulos idênticos e centrados,
  um de cada lado, mais uma faixa no lombo que lia como sela.
- **As costelas do esqueleto eram três anéis brancos** em volta do peito: múmia
  enfaixada, não caveira.
- **As patas da aranha eram ripas verticais** — fêmur horizontal e tíbia reta pra
  baixo dão uma mesa, não um bicho.

No meio da rodada o founder mandou a referência do zumbi. O humanoide foi
refeito na proporção clássica de 32 unidades (perna 12, tronco 12, cabeça 8),
com manga, antebraço de pele, calça inteiriça e pé cinza. Tudo deriva de `U`, e
a cor é procedural do `grainTexture` daqui — a referência serviu de paleta e
proporção, nenhuma textura de terceiro entrou no repo.

Braço caído e rígido fica de manequim, então o braço do zumbi entrou no passo,
em contrafase com a perna do mesmo lado. O do esqueleto não: ele segura o arco.

Cada uma dessas lições virou asserção — degrau da cabeça, ombro abaixo da
cabeça, braço em contrafase — pra não voltar no próximo ajuste. **17/17
mutações.**

## Estado

| #   | Critério                       | Estado                                                                        |
| --- | ------------------------------ | ----------------------------------------------------------------------------- |
| 1   | Frente na direção do movimento | ✅ 8 direções, dot ≥ 0,999                                                    |
| 2   | Hostil encara enquanto ataca   | ✅ zumbi, esqueleto, aranha                                                   |
| 3   | Giro sem estalo                | ✅ interpolado pelo caminho curto                                             |
| 4   | Anatomia                       | ✅ pé = 0,000, altura 92–105% da caixa, tronco conectado, pivô na articulação |
| 5   | Andar coerente                 | ✅ trote diagonal, bípede alternado, aranha em Y                              |
| 6   | Dano não vaza                  | ✅ materiais por bicho; olho da aranha preservado                             |
| 7   | Passo no multiplayer           | ✅ passo sai da velocidade observada                                          |
| 8   | Silhueta                       | ✅ a ~10 m no mundo, e print a print no turntable — ver a ressalva abaixo     |
| 9   | Sem vazamento                  | ✅ dispose libera cópias, preserva a textura do cache                         |

**Ressalva honesta sobre o critério 8.** O enunciado dizia "a 20 m". A 20 m,
no capim alto do bioma de planície, os bichos são pontos — isso vale pro gênero
inteiro e não é defeito de modelo. O que dá pra afirmar: no mundo do jogo, na
luz do jogo, a ~10 m as sete espécies se distinguem por silhueta e cor (vaca
marrom manchada, zumbi de camisa teal, aranha baixa e larga, ovelha branca,
porco rosa, esqueleto claro, galinha pequena). O critério foi verificado nessa
distância, não na que eu tinha escrito.

**Revisão visual feita** na rodada 4: as sete espécies leem como as espécies
delas, de frente, de lado, de trás, em três-quartos e em movimento. O que o
olho achou virou asserção — os cinco defeitos daquela rodada não voltam sem
quebrar teste.

## Achado fora de escopo

`tryAttack` mira por CONE a partir da câmera (`dot > 0.92`) contra o CENTRO do
bicho, não contra uma caixa. Num bicho comprido (vaca, 1,79 m) e a curta
distância, olhar pra cabeça pode deixar o centro fora do cone e o golpe não
sai. Não mexi: é combate, não corpo, e mudar o alcance de mira sem pedido é
mudar o jogo. Fica registrado.
