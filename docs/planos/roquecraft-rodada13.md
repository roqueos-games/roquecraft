# Rodada 13 — a mão, e o instrumento que não a via

**Origem:** o founder mandou um print do celular com a frase _"Você está
validando visualmente o que você está fazendo? Não vou aceitar essas
porcarias."_ Ele estava certo. As rodadas 8 a 12 subiram com portão verde —
lint 0, 6859 testes, sondas 10/10 — em cima de um jogo visivelmente quebrado.

## O que estava errado, e por que sobreviveu

A mão do jogador era uma **tábua chapada** atravessada no canto, em todos os
perfis, desde a rodada 8. Nenhuma sonda pegou porque quase todas **desligavam a
mão** (`setFx({hand:false})`): ela balançava e sujava a medição. O defeito
estava invisível para o instrumento **por construção**.

A lição não é "medir melhor". É que **olhar para número não é olhar para o
jogo**. Uma sonda numérica responde à pergunta que alguém pensou em fazer; o
olho responde à que ninguém pensou.

## Entregue

### 1. A mão vira um braço

| defeito                                                      | causa medida                                                                                      | conserto                                             |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Silhueta chapada                                             | normal da frente 0.87 contra a câmera, da lateral 0.14 — braço visto de raspão                    | `TORCAO = 0.38` em torno do eixo longo → 0.78 / 0.41 |
| Face sombreada a 46% da iluminada (medido nos pixels do PNG) | luz alta demais em (-0.6, 1, 0.8); a lateral torcida aponta pra baixo-esquerda e não recebia nada | luz pra (-0.9, 0.75, 0.75) → 1.00 / 0.82 / 0.57      |
| Pele lendo como tábua de madeira                             | grão de 16 texels a ±14%, magnificado 15× na tela, desenha faixas                                 | 32 texels a ±5%                                      |
| 17,7% da tela no celular                                     | âncora em unidades de MUNDO; o frustum do retrato é 4× mais estreito que o do 16:9                | alvo em NDC + teto de largura na tela                |
| Picareta flutuando ao lado da mão                            | cabeça em y=0.42 com o punho em 0.2675, e mais larga que ele                                      | escala 0.68 e assento em 0.235                       |

A escada de brilho 1.00 / 0.82 / 0.57 não é gosto: é a tabela de sombreamento
por face do original (topo 1.0, frente 0.8, lateral 0.6).

### 2. `texImage3D: FLIP_Y isn't allowed` — o bloqueador do perfil `low`

Duas rodadas foram gastas **lendo** código atrás de um `flipY = true` que não
existe no jogo. `DataArrayTexture` nasce com `flipY = false`, o three seta o
pixelStorei a partir de `texture.flipY` antes de cada upload, e não há uma
única atribuição de `flipY` no projeto. Pela leitura, o erro é impossível.

A armadilha (`scripts/lib/rc-armadilha-gl.mjs`) achou em um minuto: o valor não
vinha de textura nenhuma, vinha do **contexto**. Trocar de perfil reconstrói a
engine e chama `new THREE.WebGLRenderer` no MESMO canvas — e um canvas só tem
um contexto, então o renderer novo herda o `UNPACK_FLIP_Y` que o anterior
deixou ligado ao subir uma `CanvasTexture`. A primeira coisa que o `WebGLState`
do three faz no construtor é criar texturas vazias com `texImage3D`.

Conserto: zerar o estado de unpack antes de construir o renderer.
Contabilidade que fecha: `desktop-low` foi de 5 chamadas limpas + 2 infrações
para **7 limpas + 0 infrações**.

### 3. A sonda visual que estava fotografando o telhado

`gotoBiome` deixava o jogador em y=76 com o solo em 67: a foto de "floresta"
era a **copa vista de cima**, um mar de cubos verdes sem um tronco à vista.
Olhei essa foto uma rodada inteira acreditando estar olhando uma floresta.

Pior: a primeira checagem "estou perto do chão?" comparava a altura do jogador
com `surfaceAt` — e `surfaceAt` conta folha como topo. Os dois mediam a mesma
copa. **O instrumento concordava com o defeito**, que é o modo de falha mais
caro deste projeto.

Consertos, em camadas:

- `colunaEm(x, z)` — novo gancho de QA que devolve a coluna com o NOME de cada
  bloco, pra quem mede decidir o que é chão em vez de confiar num número.
- A sonda procura uma **clareira 5×5** (cai pra 3×3, depois 1×1, e registra qual
  usou). Uma coluna aberta sozinha colava a câmera num tronco: a foto virava um
  close de casca.
- `teleport` LIGA o voo — `setFlying(false)` vem depois dele. E ele procura
  ponto seguro por conta própria, então a sonda reporta a posição **final**, não
  a pretendida.
- O relatório carrega `bioma` medido DEPOIS de andar até a clareira: a busca
  atravessa fronteira, e a cena rotulada `forest` sai em `Pântano`.

## Evidência

- lint: 0 erros, 18 avisos (todos pré-existentes)
- testes: 6859 em 661 arquivos, todos passando
- folha de contato: 12 cenas, `erros: []`, todas no solo (`dossel=1`,
  `folga=2`), mão ligada em todas — **e abertas uma por uma**
- armadilha de GL: 0 infrações nos três perfis, com prova de vida (5 / 7 / 5
  chamadas limpas)

## Fica para a próxima

0. ~~O SPAWN COLA O JOGADOR NUM TRONCO~~ — **RETRATADO no mesmo dia. O defeito
   era meu, não do jogo.** Ver a nota abaixo; fica registrado porque o erro é
   mais instrutivo que o achado teria sido.
1. **Item na mão como sprite extrudado**, não como caixa montada. É como o
   original faz, e resolve picareta/espada/pá de uma vez em vez de esculpir
   cada ferramenta. Merece rodada própria, com sonda própria.
2. **Os quadriláteros cruzados chapados da foto do founder** não reproduzem no
   Chromium. Falta rodar a folha no **WebKit**, que é o motor do iPhone.
3. Blocos brancos aparecendo no pântano — apurar se é geração ou textura.
4. A sonda da mão mede % da JANELA inteira, incluindo a moldura do RoqueOS;
   devia medir % do canvas do jogo.

---

## Adendo — o achado retratado, uma hora depois

Fechei a rodada 13 anunciando um defeito novo: "o spawn cola o jogador num
tronco, é a primeira coisa que o jogador vê". Tinha dois prints de produção
mostrando casca de árvore em tela cheia, desktop e celular.

**Era meu.** De duas maneiras somadas, no mesmo script de conferência:

1. Chamei `rc.look(0.6, -0.12)` — **atropelando o yaw que o jogo tinha
   escolhido**. Fixei uma direção arbitrária e fotografei o que ela mostrava.
2. Entrei pelo atalho de E2E em vez do MENU. O atalho pula `leaveMenu()` e
   portanto pula `pousarSeguro()`, que é justamente quem chama `melhorVista`
   para virar as costas ao paredão. Ou seja: mesmo sem o `look()`, aquele
   caminho nunca teve enquadramento nenhum para atropelar.

A sonda que já existia — `scripts/qa-roquecraft-nascer.mjs`, escrita numa
rodada anterior, com grupo de controle `SEM_MENU` e um leque de 5 raios —
responde em três minutos: **10 sementes, `naParede: 0`, `naCopa: 0`, linha de
visão livre nos 12 blocos de alcance em todas.** O nascimento está correto.

Quase escrevi uma segunda sonda de nascimento do zero antes de descobrir que
essa existia. E cheguei a mexer em `melhorVista` e a criar um gancho de QA para
consertar o nada — tudo revertido.

### O que isso ensina, e é a mesma lição do dia inteiro

Passei esta rodada consertando três instrumentos que **concordavam com o
defeito** — a sonda que desligava a mão, a checagem de chão que media a copa
com `surfaceAt`, a busca de clareira que colava a câmera no tronco. E então,
uma hora depois, cometi o mesmo erro na conferência de produção: **construí o
enquadramento que eu ia julgar.**

Regra que sai daqui, e que vale para qualquer conferência de produção:

- **Conferir a primeira impressão é entrar pelo MENU.** O atalho de E2E é outro
  caminho de código, com outro resultado.
- **Não chamar `look()` quando a pergunta é para onde o jogo olha.** Se a sonda
  posiciona a câmera, ela não está medindo o jogo: está medindo a si mesma.
- **Procurar a sonda que já existe antes de escrever a próxima.** Duas sondas
  para a mesma pergunta dão duas respostas, e a mais nova costuma ser a pior.
