# Goal — a interface do RoqueCraft pertencer ao RoqueCraft

Pedido do founder (2026-08-23): "deixe a interface dos menus e HUD mais
equivalentes à identidade do jogo, analise na internet referências e crie algo
profissional para essa parte do jogo".

## Diagnóstico, com print

Os três prints do QA (`40-menu-desktop`, `08-desktop-pausa`,
`07-desktop-inventario`) mostram a mesma coisa: **um painel de administração
dark-mode colado num jogo de blocos**. Item por item:

| O que está lá                                | O que isso comunica                  |
| -------------------------------------------- | ------------------------------------ |
| `border-radius: 12px` em tudo                | app de celular                       |
| `backdrop-filter: blur(20px)` pesado         | iOS, não jogo                        |
| Ícones Material (globe, groups, tune)        | tela de ajustes do Android           |
| Helvetica/system-ui em tudo                  | nenhuma identidade                   |
| Verde `#4CAF50` (verde primário do Material) | botão de "salvar", não grama         |
| Menu numa coluna à esquerda                  | o mundo ao lado vira papel de parede |

O que JÁ tem identidade: os ícones de item (pixel art dos próprios blocos). Eles
são a prova de que o resto está fora de lugar — são a única coisa na tela que
parece do jogo.

E um defeito de verdade, não estético: **a hotbar aparece por baixo do menu, da
pausa e do inventário** nos três prints. É empilhamento.

## Referências e o que se tirou delas

- **Interface diegética** ([Wayline](https://www.wayline.io/blog/diegetic-interfaces-game-design)):
  os quatro princípios — consistência com o mundo, funcionalidade acima de
  beleza, integração em vez de sobreposição, e retorno imediato. A armadilha
  nomeada que mais serve aqui é _obscurity_: interface bonita e ilegível é pior
  que interface nenhuma.
- **Nine-slice / bisel** (Pedro Medeiros, Roblox UI docs): a borda de painel de
  jogo é canto + aresta + miolo, e é o bisel claro-em-cima / escuro-embaixo que
  faz uma superfície plana ler como volume. É exatamente a mesma leitura que já
  acontece na face de um cubo do mundo.

## ⚠️ A restrição que decidiu o desenho

O jogo está em **10 idiomas**, incluindo `ar`, `hi`, `ja`, `zh` e `ru`. Fonte
pixel (Silkscreen, Press Start 2P, Departure Mono) **não tem esses glifos**.
Trocar a tipografia por pixel quebraria metade das localizações — e "quebrar
cinco idiomas" não é preço de identidade visual, é defeito.

Então: **a identidade vem de MATERIAL e FORMA, não de tipografia.** A fonte
pixel fica reservada ao wordmark e a números latinos curtos, onde ela não
carrega texto.

## Direção escolhida: híbrido dirigido

Escolha do founder entre três caminhos apresentados.

- **HUD, hotbar e inventário** → linguagem de bloco pura. Aresta dura, bisel
  claro/escuro como a face de um cubo, slot com profundidade real. É a camada
  que o jogador olha durante o jogo, tem pouco texto, e é onde a identidade
  rende mais.
- **Menus, pausa, ajustes, lobby** → moderno com eco. Raio 2px, bisel discreto,
  paleta dos blocos, ícones próprios. É onde mora texto denso em 10 idiomas, e
  ali a legibilidade manda.

## Paleta — derivada, não inventada

Tirada do gerador de textura do próprio jogo
(`scripts/gen-roquecraft-textures.mjs`) e do tint de bioma
(`worldgen.js`), pra a UI e o mundo terem a mesma origem:

| Token       | Cor       | De onde veio                    |
| ----------- | --------- | ------------------------------- |
| ardósia     | `#3b3b42` | `T.deepslate` — fundo de painel |
| pedra       | `#8a8a90` | `T.stone` — borda e bisel       |
| terra       | `#7a5334` | `T.dirt` — acento quente        |
| terra funda | `#4c331d` | torrão de `T.dirt` — sombra     |
| grama       | `#5cb847` | tint de floresta — acento/ação  |

## Critérios de aceite

Todo critério é verificável por print ou por teste, não por opinião.

1. Nenhum `border-radius` maior que 2px em painel de menu, e 0 no HUD.
2. Nenhum ícone Material dentro de `apps/roquecraft/**`.
3. Nenhuma cor escrita à mão nos componentes: tudo por token.
4. A hotbar não aparece por cima nem por baixo de nenhum modal.
5. Painel, botão e slot têm bisel — a mesma leitura de volume da face do cubo.
6. Os 10 idiomas cabem: nenhum texto estoura ou é cortado em `ar`, `hi`, `ja`,
   `zh`, `ru`.
7. Contraste de texto ≥ 4.5:1 sobre o fundo do painel.
8. Alvo de toque ≥ 44px no mobile.
9. `yarn test:unit`, `yarn lint` e `yarn build` verdes.

## Rodadas

Uma rodada = aplicar, rodar o QA visual, LER cada print criticamente, listar o
que ficou errado. O loop fecha quando duas rodadas seguidas não acharem nada
novo.

### O que cada rodada achou

**R1 — a hotbar que não estava quebrada.** Anotei "hotbar vazando por cima dos
modais" olhando os três prints. Errado duas vezes: o rodapé colorido é o dock
do RoqueOS, e quando a sonda mediu de verdade ela acusou os nove slots como
bloqueados — pelo convite "clique pra jogar", que é de tela cheia por design e
some no pointer lock. A hotbar está correta (`bottom: 716`, topo do dock em
`716`). Duas leituras a olho, duas erradas; a medição corrigiu as duas.

**R2 — os ícones.** Vinte desenhos em grade 8×8, e só dá pra julgar vendo:
montei uma folha de contato e olhei. Primeira leva: `gente` virou dois pontos
soltos, `montanha` virou nuvem, `play` virou bandeirinha, `picareta` virou
zigue-zague, `voar` apontava pra ESQUERDA, `sair` era ilegível. Três rodadas até
os vinte lerem. Em 8 pixels, a diferença entre um ícone e uma mancha é um pixel.

**R3 — o bisel tímido.** Primeiro print do painel montado: cinza chapado, slots
como quadrados escuros. Os valores que bastam num painel de aplicativo (0,22 de
luz, 0,6 de sombra) somem em cima de um mundo de alto contraste. Subiram para
0,30 / 0,74, e o painel passou de 1px para 2px de borda. Bisel que não se vê é
só custo de render.

**R4 — o ritmo da coluna.** Dois dos cinco botões da pausa tinham ícone, três
não. A coluna ficava irregular sem motivo: ali sobra espaço pro rótulo, então o
ícone não estava pagando o próprio ruído. Saíram. Sobrou o cinza neutro puro,
que ao lado de um mundo de terra e madeira lê como janela de outro programa —
os painéis ganharam dois pontos de vermelho no canal.

## O que NÃO foi feito, e por quê

- **Fonte pixel.** Quebraria `ar`, `hi`, `ja`, `zh` e `ru`. A identidade veio de
  material e forma; a tipografia continua sendo a do sistema.
- **Textura de pedra nos painéis.** Estava na opção "skin de bloco assumido",
  que não foi a escolhida. Painel de menu carrega texto denso, e trama atrás de
  texto é ruído.
- **A hotbar sob o dock em janela não maximizada.** Medida e correta hoje
  (`--ros-dock-offset` resolve). Se um dia o dock cobrir, o conserto é no SO e
  vale pra todo aplicativo — não é do jogo.

## Verificação

`scripts/qa-roquecraft-interface.mjs` mede o que print não pega: ícone Material
restante, raio de aplicativo, `backdrop-filter`, cobertura real da hotbar por
`elementFromPoint`, e estouro de texto em 8 idiomas. Roda contra `dist/pwa`.
`tests/unit/components/roquecraft/icones.spec.js` pega o nome de ícone errado,
que é invisível: o componente desenha um SVG vazio e o botão fica cego.
