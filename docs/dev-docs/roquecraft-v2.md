# RoqueCraft v2 — arquitetura, decisões e armadilhas

> Dev-doc do jogo `roquecraft`. Carrega sob demanda: nada aqui é invariante de
> projeto. É o mapa de **onde as coisas estão** e o registro do **que já mordeu**,
> pra ninguém (humano ou agente) pagar o mesmo pedágio duas vezes.

## O que mudou da v1 para a v2

A v1 era uma ilha fixa de raio 24, mundo em um array único no thread principal,
sem sobrevivência, sem multiplayer e com iluminação por face constante. A v2 é
uma reescrita completa:

| eixo    | v1                    | v2                                                       |
| ------- | --------------------- | -------------------------------------------------------- |
| mundo   | ilha 49×49 fechada    | **infinito**, streaming de chunks 16×128×16              |
| geração | heightmap por coluna  | **campo de densidade 3D** (penhasco, saliência, caverna) |
| malha   | quad por face         | **greedy meshing** + AO por vértice + luz suave          |
| luz     | fator por face        | **skylight + blocklight** com BFS de propagação          |
| thread  | tudo no main          | **Web Worker** dono do mundo, transferíveis              |
| modos   | criativo              | criativo **+ sobrevivência** (vida, fome, mobs, minério) |
| rede    | —                     | **multiplayer** por RTDB com assinatura por chunk        |
| visual  | `MeshLambertMaterial` | PBR (`MeshStandardMaterial` enxertado) + pós             |

## Mapa dos módulos

Tudo em `src/services/roquecraft/` é **puro** (sem three, sem DOM) exceto
`render/`. Essa fronteira é o que deixa 132 testes de unidade rodarem em
milissegundos e o worker existir.

```
constants.js      tamanhos, índice local, chaves de chunk
noise.js          perlin com semente, fbm, ridged
blocks.js         68 blocos (IDs ESTÁVEIS — vão pro Firestore/RTDB)
items.js          itens, ferramentas, durabilidade
recipes.js        receitas com/sem grade, fornalha
inventory.js      36 slots, clique com botão, shift-click
chunkStore.js     chunk, mundo, edits, serialização
worldgen.js       11 biomas, densidade 3D, cavernas, veios, features
lighting.js       skylight/blocklight em BFS, remoção e re-add
mesher.js         greedy meshing, AO, buckets opaco/recorte/transparente
neighborhood.js   cópia achatada do chunk + 8 vizinhos (o pulo do gato de perf)
chunkPipeline.js  fila de geração → luz → malha, com orçamento por tick
chunkWorker.js    entrada do worker
worldClient.js    espelho no main thread; cai pra inline se não houver Worker
physics.js        AABB, varredura, auto-step
voxelRaycast.js   DDA com convenção de canto
daycycle.js       hora do dia: sol, céu, névoa, exposição — FONTE ÚNICA
survival.js       vida, fome, afogamento, regeneração
mobs.js           7 criaturas, máquina de estados
roqueCraftSave.js Firestore: semente + edits (nunca voxels)
roqueCraftRoom.js RTDB: sala, jogadores, blocos por chunk, chat
render/            textures, voxelMaterial, sky, entities, engine
```

## Decisões que não são óbvias

**Salvar semente + edits, nunca voxels.** O mundo é infinito; o terreno é
reproduzível a partir da semente. O save é `seed + Map<chunk, Map<índice, id>>`.
Um jogador que construiu bastante ocupa alguns milhares de entradas.

**IDs de bloco são imutáveis.** Estão gravados em save de usuário e em sala de
multiplayer. Renumerar quebra o mundo de todo mundo. Adicionar sempre no fim.

**`daycycle.js` é fonte única.** Céu, névoa, direcional, ambiente, exposição e o
multiplicador de skylight do shader saem todos daqui. O defeito clássico do
gênero — céu noturno com chão iluminado de dia — é estrutural quando cada um
calcula o seu.

**Multiplayer assina por chunk, não pelo mundo.** `createBlockSync` mantém
assinaturas só dos chunks no raio do jogador, com histerese de ±2 pra não
tremular na fronteira. Sem isso, entrar numa sala com muita construção baixaria
o mundo inteiro.

**Modelos de criatura são caixas.** A regra `36-games` proíbe "primitivos como
arte", e com razão — mas num jogo de voxels a caixa **é** a direção de arte. O
que não é aceitável seria a esfera cinza sem textura; os mobs têm textura
procedural com grão e proporção deliberada.

## Desempenho: onde estava o custo

Medido no MacBook (`tests/unit/services/roquecraft/perf.spec.js` guarda os
tetos):

| etapa           | antes  | depois | o que resolveu                                                                               |
| --------------- | ------ | ------ | -------------------------------------------------------------------------------------------- |
| malha / seção   | 130 ms | ~4 ms  | copiar uma região 18³ achatada **uma vez** e trabalhar em arrays planos                      |
| luz / chunk     | 120 ms | 0,5 ms | memo de um slot pro chunk atual, sem alocar `{c,i}`, poda por teto e por vizinho mais escuro |
| geração / chunk | —      | 2,0 ms | —                                                                                            |

O padrão comum: **o custo não estava no algoritmo, estava no acesso**. Buscar
`world.chunks.get(key)` por voxel dentro de um laço de 32 mil iterações domina
qualquer coisa que o laço faça.

## Armadilhas — o registro de incidentes

### 1. Crase dentro de template de GLSL (mordeu **três** vezes)

```js
const FRAG = /* glsl */ `
  // p.x = x do mundo (é um vec2 - usar `.z` aqui foi um erro)   ← ☠️
  vec2 p = vWorldPos.xz;
`
```

A crase **fecha a string**. O resultado não é erro de sintaxe: vira
`templateA.z` seguido de outro template — uma **chamada de template com tag** —
que só explode em runtime, no import do chunk, como:

```
TypeError: "<o shader inteiro> is not a function"
```

No app isso aparece como **"a janela do jogo não abre"**, e o motivo fica
escondido dentro do `payload` de um evento `vite:preloadError`. As duas
primeiras vezes o sintoma foi um `Parsing error: Unexpected token <palavra>` do
eslint dezenas de linhas adiante.

Guarda: `tests/unit/services/roquecraft/shaders.spec.js`. A **primeira** versão
desse teste procurava os templates com `/crase[^crase]*crase/` — por construção
o corpo nunca continha crase e o teste passava sempre. A versão que presta:

- do marcador `/* glsl */ crase` até a linha que é só uma crase, nenhuma crase pode aparecer;
- e, principalmente, o arquivo **importa `createVoxelMaterials` e o executa**. Qualquer template quebrado derruba o import e o teste fica vermelho antes de qualquer QA visual.

### 2. Erro de compilação de GLSL some em silêncio

`vec2 p; ... p.z` → `ERROR: 0:1545: 'z' : vector field selection out of range`.
Um erro assim invalida o **programa inteiro** do `MeshStandardMaterial` do
mundo. O jogo continua rodando, `renderer.info.render.calls` continua contando
1500+ draw calls, `triangles` continua em 700 mil — e **nada de terreno
aparece**. Foram várias rodadas de QA perseguindo "névoa", "exposição" e
"bloom" antes de ler as mensagens de console.

Guarda: o harness de QA transforma qualquer console que case
`/Shader Error|not compiled|INVALID_OPERATION: useProgram/i` em **falha do
cenário**.

### 3. sRGB tratado como linear (a causa sistêmica do mundo pastel)

`gen-roquecraft-textures.mjs` guarda albedo **linear** e converte pra sRGB na
gravação. Mas `hex(0x8b8b90)` — escolhido a olho como "cinza médio" — entrava
como `0.545` **linear** e saía gravado como sRGB `196`, quase branco. As 81
texturas nasciam ~1,4× mais claras do que a cor escolhida; com o sol de
meio-dia por cima, o mundo inteiro virava pastel lavado.

O mesmo erro estava em `BIOME_TINT`: `[0.63, 0.86, 0.34]` como multiplicador
linear é verde-menta claro, não o verde de planície que se vê num seletor.

Correção: `hex()` e os tints decodificam sRGB→linear. Onde a receita escreve
valor cru (`grass_top`, `grass_side`, folhas, neve, musgo), o valor é escrito em
sRGB e passado por `lin()`. Três receitas também **estouravam em 1.0**
(`0.58 + ruído*0.5 + grumo*0.22` chega a 1.30), o que matava justamente o
desenho que o ruído criava.

### 4. A luz de voxel multiplicava a luz da cena — e a sombra ia a preto

O shader fazia `diffuseColor *= voxelLight`, e depois o three multiplicava de
novo pelo shadow map e pelo ambiente. Uma face na sombra de uma copa levava as
duas reduções: tronco de carvalho (albedo real `rgb(136,102,59)`) saía na tela
em `rgb(29,28,24)` — **preto**.

Três correções, todas calibradas **medindo pixel** (`scripts` de histograma e
de amostragem de região), não no olho:

1. rampa da skylight com expoente **0.45**: levanta o meio-tom sem levantar o zero (caverna fechada continua zero);
2. luz de bloco virou **aditiva** (`totalEmissiveRadiance`), não multiplicativa — uma tocha no fundo da caverna agora ilumina de verdade e o shadow map do sol não tem como apagá-la;
3. ambiente e direcional recalibrados **lembrando do π**: o BRDF de Lambert do three divide a irradiância por π, então `1.0` de intensidade vale ~0,32 na tela.

### 5. Ambiente demais apaga a sombra projetada

Depois de (4), o primeiro chute foi ambiente `2.75`. O tronco ficou legível — e
**a sombra das árvores sumiu da grama**. O ambiente afogava o sol.

O que resolveu foi ter um diagnóstico que responde à pergunta em vez de chutar:
`setFx({ ambientMul, sunMul, flatVoxelLight })` no motor, e dois prints de
bisseção (`só sol` / `só ambiente`). Com `ambientMul: 0.06` a sombra apareceu
nítida — logo o shadow map estava certo o tempo todo. Valor final: ambiente
`0.55 + dia*0.95`, direcional `dia*3.0`.

### 6. Franja da grama sem tint = "neve" na beira de todo barranco

`grass` usa `tintFaces: [2]` (só o topo recebe a cor do bioma — se a lateral
recebesse, a **terra** ficaria verde junto). Mas a franja no alto da textura
lateral estava pintada em cinza neutro, esperando um tint que nunca chega.
Correção: a franja é pintada **verde na textura**.

### 7. Reflexo especular da água virando duas bolhas brancas

`roughnessFactor = 0.05` (quase espelho) + bloom = o reflexo do sol na água,
visto de cima, estourava em duas bolhas brancas gigantes. Correção: espalhar um
pouco (`0.11`) e **quebrar o brilho com a própria onda**
(`+ 0.07 * abs(dx + dz)`).

### 8. Água virando lençol branco de raspão

O fresnel era `pow(1-cos, 4) * 0.72` na direção da cor **crua** do céu. De
raspão o oceano inteiro virava um lençol branco. Correção: Schlick de verdade
(`F0 = 0.02`), misturando pro céu **atenuado**.

### 9. Terreno em terraço de arrozal

Preencher a coluna por heightmap dá degrau em tudo. Trocado por **campo de
densidade 3D** (`density()`), que dá penhasco e saliência. Duas consequências
que precisaram de correção própria:

- **confete de ilhas flutuantes** → filtro de laje fina (espessura ≤2 com ≥3 de ar embaixo é apagada);
- **árvore flutuando ou enterrada** → as features usavam a altura _teórica_ do ruído, que diverge do topo real sob densidade 3D. Agora usam `solidTopAt()`, e checam se o solo é terra (nada de grama nascendo em pedra nua).

Pelo mesmo motivo, `worldClient.heightAt` devolvia a altura teórica; hoje o
pipeline emite o **heightmap real** (`recomputeHeightmap`).

### 10. QA que não reproduz não é QA

Quatro coisas quebravam o harness de formas diferentes:

- **semente aleatória por boot** → `window.__ROS_E2E__.roquecraftSeed`, honrado só sob `isE2EMode()`;
- **screenshot de canvas em branco** → `preserveDrawingBuffer: isE2EMode()` no renderer (custa performance; por isso só em E2E);
- **service worker servindo precache velho** depois de cada rebuild, disparando o laço de recuperação de chunk do app → `serviceWorkers: 'block'` em todo contexto do Playwright;
- **o reload de recuperação corria com `openWindow('roquecraft')`** → helper `openGame(page)` que espera `__rosStore`, deixa assentar e re-tenta por até 60 s.

### 11. Nascer no meio do oceano

A escala continental é de ~1100 blocos e `findSpawn` só varria ±192 — metade
das rodadas de QA começava boiando. Correção: `spawnBias()`, uma gaussiana que
garante terra na origem, e busca em anéis até ~1400 blocos com fallback que
nunca devolve oceano.

## Arte, ícone e tela inicial (20/08/2026)

**Capa ilustrada por ordem do founder.** A regra 36-games manda frame de gameplay
real; o founder abriu exceção nominal pra este jogo. A arte não é screenshot com
filtro: `scripts/gen-roquecraft-art.mjs` tem um renderizador isométrico próprio
(cada voxel vira três polígonos SVG) e a cena é **composta** - ilha flutuante,
casa com telhado de duas águas, cachoeira, mar de nuvens, sol raso. O Chromium do
Playwright rasteriza. O mesmo script gera o fundo do menu e os dois ícones.

Quatro coisas que só apareceram desenhando:

- **Montanha de fundo com o renderizador iso projeta pra CIMA** e vira bloco
  gigante boiando no céu. Fundo distante é silhueta, não geometria.
- **Telhado estreitando nos DOIS eixos** vira zigurate de pagode. Duas águas =
  cumeeira num eixo, só o outro estreita.
- **Taper da ilha com t²** deixa o centro 12 blocos mais fundo que a borda e a
  ilha ganha duas pernas de pedra. Expoente ~1.15 dá gota.
- **Grão do ícone sem `clipPath`** vaza pra fora da silhueta - o ícone fica com
  sujeira em volta que só se vê ampliado.

**Ícone**: `public/games/roquecraft/icon.svg` (vetor, serve o dock a 24px) e
`icon.png` 512 com grão. Entra em `apps.js` como `icon: 'img:/games/roquecraft/icon.svg'`

- `img:` é como o QIcon do Quasar carrega arquivo, já usado em `ROSLoginScreen`.

**Tela inicial** (`RCStart.vue`): o mundo termina de carregar e, em vez de cair
direto no jogo, a câmera sobe e orbita (0,055 rad/s) atrás do menu. Continuar /
Novo mundo / Jogar com amigos / Ajustes. "Continuar" só aparece se há save - botão
que não continua nada é mentira, e o teste cobre isso. Sob `isE2EMode()` o menu é
pulado por padrão (o harness fotografa o mundo, não a porta) e ligado sob demanda
com `__ROS_E2E__.roquecraftMenu`.

## Os três defeitos do founder (20/08/2026) — e o que cada um ensinou

O relato foi curto: _"caio do céu e morro"_, _"a quebra não tem som nem mão"_,
_"a água não parece água"_. Os três já estavam "prontos" na rodada anterior, com
prints bonitos. É o padrão que interessa aqui: **nenhum dos três era um bug de
implementação — eram três formas diferentes de o QA ter provado a coisa errada.**

### 1. Cair do céu — o harness entrava por uma porta que o jogador não usa

Sob `isE2EMode()` o QA pulava a tela inicial e caía direto no mundo. O caminho
do jogador é o menu, e era só nele que a câmera ficava a +26 blocos e o
`leaveMenu` desligava o voo. Ninguém tinha fotografado esse caminho.

- `landingSpot(solidAt, x, z, topHint)` varre **de cima pra baixo** procurando
  sólido com 2 de ar acima. `safeSpawn` varria de baixo pra cima e parava na
  primeira caverna com teto.
- `pousarSeguro()` segura no ar até o chunk chegar (`waitForSpawnChunk`), acha o
  chão real, e **zera `fallStart`** — sem isso o motor acha que o jogador
  despencou e cobra o dano mesmo depois do teleporte.
- O cenário `spawn` do harness agora entra **pelo menu** e mede vida antes e
  depois. Print bonito não prova; 20 de vida prova.

### 2. A mão — estava desenhada, fora da tela

A cena existia, a luz existia, o draw call acontecia. O rig nascia em y=-0.46 e
o punho pendia até -0.76, com meia-altura de frustum de **0.344**: dois quadros
abaixo da borda. Um teste de "a mão está na cena?" ficaria verde pra sempre.

O teste certo **projeta em NDC** (`viewmodel.spec.js`): mão, cabeça da ferramenta
e cubo, em repouso e no pico do golpe, em seis aspectos de tela. Rodando contra
a geometria antiga ele acusa `y = -2.02`.

Três defeitos vieram atrás, cada um escondido pelo anterior:

- **`resize()` só no resize de janela.** A câmera nasce com aspecto 1; nesse
  aspecto a meia-largura é menor que o x de repouso. Agora `resize` é chamado na
  criação **e** ancora o x pela largura real do frustum (retrato no celular
  jogava a mão pra fora pelo outro lado).
- **O cubo na mão saía preto.** Ele usa o material do mundo, e material do mundo
  exige os atributos do mundo: sem `aLayer/aLight/aTint/aWind` o shader amostra
  a camada 0 com luz 0. A ordem de faces da `BoxGeometry` (+x,-x,+y,-y,+z,-z)
  é a mesma de `FACE_LAYERS`, então as camadas por face copiam direto.
- **Cáustica em cima do cubo.** O ramo só testava `vWorldPos.y < uSeaLevel`, e o
  cubo vive em y≈0.5 na cena do viewmodel. O piso `uSeaLevel - 6.0` conserta e
  ainda mata trabalho morto: `prof` já zerava a cáustica a 6 de profundidade.
- **Luz e cor da mão.** Intensidades vêm do BRDF, não do gosto: a saída é
  `albedo·(intensidade/π)`. Key 2.8 + hemi 1.45 dava 1,35× o albedo — mão
  estourada. E a `CanvasTexture` do grain precisava de `SRGBColorSpace`: o mesmo
  erro de espaço de cor que já tinha deixado as 81 texturas do mundo 1,4× claras.

**Som:** `destravarAudio()` só era chamado por `requestLock()`, que no celular
não existe. O jogo inteiro rodava mudo no touch. Agora o primeiro `touchstart`
destrava.

### 3. A água — o defeito não estava na água

O print mostrava "cubos soltos boiando". Três diagnósticos possíveis: malha,
deslocamento por vértice, ou sombreamento. O que resolveu foi **medir**:

- `blockKeyAt` + varredura de coluna: 289 colunas, topo de água em y=62 em
  **todas**, zero faces laterais expostas. A malha estava perfeita.
- `setFx({ waterFx: false })`: os cubos continuavam. Não era o deslocamento.
- `setFx({ solid: false })`: os cubos **sumiam**. Eram o LEITO DO MAR — degraus
  de areia e pedras — aparecendo através de uma lâmina com 28% de transparência.

A água não estava quebrada; estava transparente demais pra ser água. O conserto
é físico, não cosmético: opacidade `mix(0.93, 0.995, fresnel)` **menos** a
margem (o AO baixo do vértice já marca a beira), então o fundo fecha no mar
aberto e continua aberto na praia. Somado a isso, reflexo do céu regido pelo
fresnel de Schlick e **cintilância do sol** (`uSunDir`, expoente 190) — que é o
cacoete visual que mais diz "isto é água".

`uSunDir` também rendeu um teste: **pôr um uniforme em `shared` não o declara no
GLSL**. Faltou o `uniform vec3 uSunDir;` e o material inteiro parou de compilar —
mundo invisível, erro só no console do navegador. `shaders.spec.js` agora cruza
`Object.keys(shared)` com as declarações de cada estágio.

### O padrão

Em todos os três, o defeito estava **entre** o código e a prova, não no código:
o QA entrava por outra porta, media a cena em vez do quadro, ou fotografava o
sintoma sem separar as camadas. `setFx` existe pra bisseção e foi ela que
resolveu a água em três prints. O harness ganhou `spawn`, `mao` e `agua`, e
`diffCanto()` — porque "a mão apareceu" e "a água mexe" não são afirmações que
um print sozinho sustenta: são diferenças entre dois prints.

## Hooks de teste

`window.__roquecraft` (só sob `isE2EMode()`), em `ROSRoqueCraft.vue`:

`state` · `setTime` · `teleport` · `land` · `look` · `place` · `breakNow` ·
`give` · `openInventory` · `openLobby` · `openPause` · `setMode` · `setQuality` ·
`spawnMob` · `hurt` · `stage` · `waitReady` · `waitChunks` · `gotoBiome` ·
`debug` · `inspect` · `setFx` · `blockKeyAt` · `setSlot` · `selectSlot` ·
`slotOf` · `surfaceAt` · `openMenu` · `menuContinue` · `menuNewWorld`

`blockKeyAt(x,y,z)` lê o mundo carregado — é o que separa "defeito de shader" de
"defeito de terreno". `setSlot(i, item)` põe o item DIRETO na hotbar: `give`
empilha no primeiro slot livre e, com a hotbar cheia do criativo, a picareta ia
parar no slot 12 — o QA fotografava outra coisa achando que era a picareta.

`inspect()` devolve malhas, distância mínima, frustum, `lastStats`, névoa e um
bloco **`shadow`** (shadow map ligado, `castShadow`, posição/alvo do sol,
quantos casters, ambiente) — foi o que fechou o incidente 5.

`setFx()` aceita `fog`, `post`, `sky`, `solid`, `water`, `mips`, `aniso`,
`ambientMul`, `sunMul`, `flatVoxelLight`, `waterFx`, `wireframe`. Serve pra
**bisseção**: desligar uma camada de cada vez até o sintoma mudar. Foi
`{solid:false}` que provou que os "cubos boiando na água" eram o leito do mar.

## Regra que este jogo deixa pro resto do repo

Quando o sintoma é visual, **medir antes de mexer**. Histograma
(luminância, saturação, % de pixel escuro) e amostragem de região dão o número;
o número diz se a hipótese vale. Todo ajuste de iluminação aqui foi decidido
por medição — e o primeiro chute, o de sempre, estava errado por um fator de π.
