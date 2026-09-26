# RoqueCraft — o céu

**Pedido (23/08/2026):** _"dar uma grande atenção para o céu do jogo. Já está
maravilhoso, mas acho que pode melhorar com nuvens e verificar alguns brilhos
estranhos que partem de uns pontos do céu onde o céu não está, analise
criteriosamente e procure na internet referência de céus com alta definição
para three.js"_

Quatro coisas: nuvens, os brilhos estranhos, análise criteriosa, e referência.

---

## 1. Os instrumentos, antes de qualquer conserto

Um print mostra 72° de céu de um ponto só. "Brilho que parte de um ponto" é uma
afirmação sobre uma DIREÇÃO — pra achar direção é preciso varrer a esfera
inteira. Foram feitas três sondas, e cada uma teve que provar que enxerga antes
de qualquer zero dela valer:

| sonda                                 | o que mede                                                                                                                                                                                                                            | prova de vida                                                                                                                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/qa-roquecraft-ceu.mjs`       | roda o `SKY_FRAG` REAL (lido do módulo) num mapa equirretangular 2048×640 com o mesmo tonemap ACES + sRGB do renderer; acha manchas de excesso sobre o fundo local, mede forma das estrelas numa lente gnomônica e cobertura de nuvem | brilho gaussiano plantado em az 137° / el 41° tem que ser achado ali; nuvem desligada tem que dar cobertura 0 e cobertura alta tem que dar muito mais que cobertura baixa |
| `scripts/qa-roquecraft-ceu-pos.mjs`   | diferença entre o MESMO quadro com e sem cada passe de pós (`setFx({godRays, bloom, ssao})`), com um par de controle pra descontar ruído de quadro                                                                                    | olhando pro sol ao meio-dia o ganho tem que ser grande                                                                                                                    |
| `scripts/qa-roquecraft-ceu-fotos.mjs` | fotos no jogo de verdade em 12 momentos, fps por cena, e o preço das nuvens ligando/desligando                                                                                                                                        | o modo `ESCALA=3` existe porque no teto de 120 fps a diferença dá zero — zero de teto, não de custo                                                                       |

### Três erros das próprias sondas, corrigidos

1. **Área em pixels do mapa.** A primeira rodada reportou "mancha de 2,87
   graus² no zênite" em três horários diferentes. Perto do polo o
   equirretangular estica 360° de azimute sobre um círculo de 3,8°: UMA estrela
   vira um risco de 91 px. Com o peso `cos(el)` a mesma mancha dá 0,030 graus²
   — exatamente uma estrela. A bisseção (`sem-estrelas` derruba o pico de 0,666
   pra 0,063) confirmou.
2. **A mão balança entre as duas capturas.** A sonda de pós creditava ao
   bloom uns focos de 300–1000 px no canto inferior direito, em todo horário e
   todo azimute. Era o viewmodel, que é desenhado FORA do composer e se mexe
   nos 260 ms entre um quadro e o outro. Corrigido com um par de controle
   (mesmo estado nos dois quadros) descontado da medida.
3. **Redondeza medida no mapa.** Deu 1,000 (quadrado perfeito) em todos os
   horários — porque a estrela mede 0,05° e o pixel do mapa mede 0,159°. Uma
   medida que devolve o mesmo número pro campo novo e pro velho não é medida.
   Foi pra lente gnomônica, onde a estrela ocupa dezenas de pixels.

### E uma hipótese refutada

A literatura aponta a grade `floor(direção * N)` como causa clássica de
"brilhos em pontos": o jacobiano `1/(1+a²+b²)^1.5` adensa as células 5,2× na
direção dos cantos do cubo (JCGT 7(2) 2018). **Medido, não era isso aqui:** a
razão de densidade de estrela por faixa de `max(|x|,|y|,|z|)` ficou em 1,55, e
um controle com hash esférico deu 2,25 — mais ruidoso, não mais plano. A grade
cartesiana estragava a FORMA das estrelas (quadrados e triângulos alinhados ao
eixo), não a distribuição.

---

## 2. O que estava errado, medido

### a. As nuvens não existiam

`CLOUD_FRAG` lia `vP = position.xz` de um `PlaneGeometry`. Num PlaneGeometry os
vértices vivem no plano XY — **`position.z` é zero em todos**. Então `vP` era
`(x, 0)`: o ruído variava numa direção só e, na escala usada (0,0035), o céu
visível inteiro cabia em MENOS DE UM PERÍODO do ruído. A cobertura era um
número quase constante sobre a abóbada toda. As fotos de QA ao meio-dia e à
tarde não têm nuvem nenhuma.

De brinde, o plano trazia o corte reto onde o far plane o cruzava (a 3000×3000
com `camera.far` de 326 e o fade só começando em 700), a ordenação de
transparência por centroide, e o teto achatado olhando pra cima.

### b. Os raios de sol desenhavam um sol que não estava na tela

Duas coisas somadas:

- O passe ligava com `sunVec · frente > 0,05` — **87° fora do eixo**. Com FOV
  72° em 16:9 o sol SAI do quadro por volta de 50°. Olhando na altura do sol o
  produto escalar é `0,5·cos(Δ) + 0,5`, que passa de 0,05 até **Δ = 155°**: os
  raios seguiam ligados por mais 105° de giro depois de o sol sumir.
- A marcha radial usava `clamp(uv, 0.0, 1.0)`. Ao passar da borda ela
  reamostrava o MESMO texel de borda em todas as iterações restantes, somando o
  mesmo pixel até 12 vezes com peso decrescente.

O resultado é uma barra de luz colada na borda do quadro apontando pra um ponto
onde não há fonte nenhuma. É a leitura mais direta de _"brilho estranho que
parte de um ponto do céu onde o céu não está"_.

### c. Sol e lua fora de escala

Sol com 3,6° de diâmetro e lua com 2,7°. O sol real mede 0,533° e a lua 0,518°
— quase idênticos entre si, que é por isso que eclipse total existe. Sete vezes
o real, e o sol 33% maior que a lua.

### d. Estrelas eram células de grade pintadas inteiras

`floor(d * 340.0)`, e cada estrela era a célula toda: quadrados e triângulos
alinhados ao eixo, do mesmo tamanho, do mesmo brilho, sem antialias, sem
extinção junto ao horizonte.

### e. Sem dithering

Gradiente grande e suave em 8 bits é o pior caso possível para banding.

---

## 3. Referência consultada (só licença compatível)

| fonte                                                                                                                                                                          | licença | o que veio dela                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [three.js r183 `Sky.js`](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/objects/Sky.js)                                                                              | MIT     | ruído de gradiente com deriva por oitava, cobertura modulada por ruído de baixa frequência, par Beer-powder, nuvem projetada no domo em vez de num plano, constantes de hash de Dave Hoskins |
| [Schneider & Vos, HZD, SIGGRAPH 2015](https://advances.realtimerendering.com/s2015/The%20Real-time%20Volumetric%20Cloudscapes%20of%20Horizon%20-%20Zero%20Dawn%20-%20ARTR.pdf) | paper   | gradiente de altura, cone de amostras pro sol, contagem de passos por elevação                                                                                                               |
| [clayjohn/realtime_clouds](https://github.com/clayjohn/realtime_clouds)                                                                                                        | MIT     | forma compacta da fase Henyey-Greenstein e do Beer duplo                                                                                                                                     |
| [Zotti & Wilkie, WSCG 2007](https://www.cg.tuwien.ac.at/research/publications/2007/zotti-2007-wscg/zotti-2007-wscg-paper.pdf)                                                  | paper   | o Preetham deixa a faixa do horizonte grossa e clara demais; a faixa real é fina (0–5°)                                                                                                      |
| [Hosek & Wilkie, SIGGRAPH 2012](https://cgg.mff.cuni.cz/projects/SkylightModelling/HosekWilkie_SkylightModel_SIGGRAPH2012_Preprint_lowres.pdf)                                 | BSD-3   | modelo com albedo de solo; **não adotado** (ver §6)                                                                                                                                          |
| [Zucker & Higashi, JCGT 7(2) 2018](https://www.jcgt.org/published/0007/02/01/paper-lowres.pdf)                                                                                 | paper   | o erro de área da grade cartesiana na esfera — a hipótese que a medição refutou                                                                                                              |
| [Jarzynski & Olano, JCGT](https://www.jcgt.org/published/0009/03/02/paper.pdf) + [danilw](https://danilw.github.io/blog/Hash_Noise_in_GPU_Shaders/)                            | paper   | hash de seno varia entre GPUs; usar hash sem seno                                                                                                                                            |
| [Jimenez, SIGGRAPH 2014](https://advances.realtimerendering.com/s2014/index.html) via [frost.kiwi](https://blog.frost.kiwi/GLSL-noise-and-radial-gradient/)                    | —       | dithering por ruído de gradiente entrelaçado, depois do tonemap                                                                                                                              |
| [Maxime Heckel, _On Rendering the Sky_](https://blog.maximeheckel.com/posts/on-rendering-the-sky-sunsets-and-planets/)                                                         | —       | constantes de espalhamento e o papel do ozônio no crepúsculo                                                                                                                                 |
| [Minecraft Wiki: Cloud](https://minecraft.wiki/w/Cloud)                                                                                                                        | —       | altitude de referência (Y 192–196), pra a camada não ficar fora do costume do gênero                                                                                                         |

Shadertoy é **CC BY-NC-SA por padrão** — inclusive o "Clouds" do Íñigo Quílez.
Nada de lá foi copiado; o que foi lido serviu de algoritmo e foi reescrito.

---

## 4. O que foi feito

`src/services/roquecraft/render/sky.js` — reescrito. Tudo num shader só.

- **Nuvens dentro da cúpula**, por interseção de raio com casca esférica
  (`R = 5200`, cúmulo a 210, cirro a 620). Sem geometria: sem borda, sem far
  plane, sem sort de transparência, e o horizonte comprime sozinho — o
  horizonte de nuvem fecha em `sqrt(2·R·h) ≈ 1478` blocos, muito além de
  qualquer distância de renderização.
- Ruído de **gradiente** (não de valor) com deriva por oitava, cobertura
  modulada por ruído de baixa frequência, Beer-powder para o volume, lobo de
  Henyey-Greenstein para o silver lining, perspectiva aérea dissolvendo a nuvem
  distante na cor do céu, e a nuvem opaca tapando a aureola do sol.
- **Duas camadas**: cúmulo (4 oitavas) sempre, cirro (3 oitavas) só em
  `ultra`/`high`. Cor vinda da paleta do `daycycle`, escurecida à noite pelo
  fator de dia — nuvem branca em céu noturno é o erro clássico.
- **Sol e lua com o mesmo tamanho angular**, 2× o real (1,067° e 1,036°) — o
  mesmo exagero que o `Sky.js` do three usa. O que dá a impressão de "sol
  grande" passou a ser a aureola, não o disco. Radiância do disco limitada
  antes do tonemap.
- **Estrelas** em parametrização esférica de área igual, posição sorteada
  dentro da célula e desenho como disco medido em radianos, com antialias por
  `uPixelAng` (fov/altura, vindo do motor — exato e testável, sem depender de
  extensão de derivada). Distribuição de magnitude `pow(hash,3)`, cor variando
  de azul-branco a quente, extinção junto ao horizonte, e **preservação de
  energia sub-pixel**: estrela menor que um pixel escurece em vez de encolher.
- **Via Láctea** adensando as estrelas e acendendo nebulosidade em projeção
  estereográfica (sem costura no azimute).
- **Dithering** por ruído de gradiente entrelaçado, depois do tonemap e do
  espaço de cor.
- **A cúpula desenha por último** (`depthFunc: LessEqualDepth`, renderOrder 900) em vez de por primeiro com `depthTest: false`. Com até 10 oitavas por
  pixel, sombrear pixel que um bloco vai tapar é jogar fora meio quadro.
- `skyColorAt()` — a mesma conta do gradiente avaliada na CPU, exportada.

`src/services/roquecraft/render/engine.js`

- Raios de sol: intensidade agora cai a zero quando o sol chega à borda do
  quadro (85%→100% do NDC), e a marcha **para** ao sair da tela em vez de
  grudar no texel de borda.
- Joelho do limiar do bloom de 0,01 (degrau) para 0,22 — pixel que oscila em
  volta do limiar deixa de virar vaga-lume.
- **Névoa casada com o horizonte do céu**, via `sky.skyColorAt()` na direção da
  câmera. Uma função só nos dois lados: a silhueta do terreno para de encostar
  numa faixa de cor diferente da do céu atrás dela.
- `setFx({ godRays, bloom, ssao, clouds, cover })` — interruptor por passe.
  Sem isso a medição de "o que o pós acrescentou" soma três efeitos e não acusa
  ninguém; foi o que travou o diagnóstico por duas rodadas.
- Perfis: `cloudQuality` 2 / 2 / 1 / 0 em ultra / high / medium / low.

`src/components/roqueos/apps/ROSRoqueCraft.vue` — o botão "clique para jogar"
ainda usava `q-icon name="mouse"`, sobra da passada de interface. Virou
`RCIcon nome="play"`.

---

## 5. Como ficou, medido

| medida                                                | antes                                         | depois                                                            |
| ----------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------- |
| manchas de luz sem fonte, 9 horários, esfera inteira  | instrumento inválido (área em pixels do mapa) | **0**                                                             |
| cobertura de nuvem                                    | 0% (campo constante)                          | 13–31%, e responde: `cover` 0,2 → 0,6% · 0,36 → 26% · 0,8 → 99,8% |
| forma da estrela (lente, 6°)                          | célula de grade quadrada/triangular           | redondeza 0,797 (disco perfeito = π/4 = 0,785), alongamento 1,06  |
| razão borda/miolo do ganho de pós, sol fora do quadro | 1,24 e ganho não-nulo até 135°                | ≤ 0,75 sempre; ganho zera em 120°                                 |
| medidas (48) com borda > 30% acima do miolo           | —                                             | **0**                                                             |
| diâmetro sol / lua                                    | 3,6° / 2,7°                                   | 1,067° / 1,036°                                                   |
| ganho médio do pós sobre o céu, ao meio-dia           | 0,0314                                        | **0,0007** (45× menos)                                            |
| idem, meio da manhã                                   | 0,0242                                        | 0,0069                                                            |

### O achado que eu não estava procurando

O ganho de pós ao meio-dia caiu 45×, e é isso que explica a diferença mais
visível da comparação lado a lado: **o mundo parou de sair leitoso de dia**. O
bloom nascia com `smoothWidth = 0,01` — degrau — e limiar 0,93. O céu de
meio-dia inteiro passa de 0,93, então o passe pegava o céu TODO e espalhava
pela tela; o terreno chegava lavado. Com o joelho em 0,22 só o sol e a nuvem
mais clara entram, e com o disco solar 3,4× menor e com radiância limitada
antes do tonemap sobra ainda menos. A correção foi feita contra o piscar de
estrela; a paisagem limpa veio junto.

Gates: lint 0 erros · **6575 testes** (645 arquivos) · build verde ·
`qa-roquecraft.mjs` 9 cenários prontos, 0 erros relevantes ·
`qa-roquecraft-agua.mjs` veredito OK nos 5 itens.

Custo: 71–120 fps nas 12 cenas. Ligando e desligando as nuvens a 2880×1620
(4× os pixels) a diferença ficou dentro do ruído e o quadro seguiu no teto de
120 fps olhando pra cima. **Isso é um limite superior nesta máquina, não uma
medida de custo zero** — numa GPU integrada custa mais, e é por isso que `low`
não tem nuvem e `medium` não tem cirro.

---

## 6. O que NÃO foi feito, e por quê

- **Hosek-Wilkie ou espalhamento por LUT.** Seria trocar a paleta autoral do
  `daycycle` por um modelo físico. A paleta é a fonte única que mantém céu,
  névoa, luz direcional e skylight em sincronia, foi calibrada por medição de
  pixel em rodadas anteriores, e o founder disse que o céu "já está
  maravilhoso". Melhorei a FORMA (faixa do horizonte fina, aureola, disco), não
  a cor. Nem Preetham nem H-W têm noite, e ambos falham abaixo de 5° de
  elevação — trocar traria um problema novo para resolver o que não estava
  quebrado.
- **Nuvem volumétrica por raymarching.** Os números publicados
  (`@takram/three-clouds`: 36–53 fps num iPhone 13 no perfil baixo) dizem que
  não cabe num jogo que precisa rodar em GPU integrada e celular. A camada
  projetada com Beer-powder entrega a maior parte do resultado por uma fração
  do custo.
- **Ozônio na extinção.** É a mudança de 3 linhas com maior retorno num
  crepúsculo — mas só faz sentido sobre um modelo de espalhamento, que é o item
  acima.
- **Catálogo real de estrelas.** O HYG é CC BY-SA 4.0 (ShareAlike). O Yale BSC5
  não reivindica licença e caberia, mas 9.100 estrelas viram uma tabela pra
  carregar e um shader diferente. O campo procedural com distribuição de
  magnitude já resolve o que se via.
- **Ícones do erro fatal.** `ROSRoqueCraft.vue` ainda tem dois `q-icon`
  (`error_outline` e `refresh`) na tela de erro. Não há ícone equivalente no
  catálogo 8×8, e desenhar dois novos no meio de uma mudança de céu misturaria
  dois assuntos. Fica registrado.
- **O `smoothWidth` do bloom não tem teste de comportamento**, só de presença
  da linha. Provar que o piscar sumiu exigiria medir a variância de um pixel de
  estrela ao longo de dezenas de quadros com a câmera em movimento — vale a
  pena se alguém relatar cintilação.
