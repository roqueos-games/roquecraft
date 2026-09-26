# GOAL 21 — RoqueCraft: o melhor trabalho possível

**Aberto em 18/09/2026, a pedido do founder:** _"analise profundamente as
próximas melhorias que faltam para garantirmos o melhor trabalho possível e
vamos criar um goal com todas as melhorias e correções e vamos executar em loop
até finalizarmos"_.

Base medida: `master` em `019a9a60`, produção com o mesmo bundle (sha conferido
em 16/09). Tudo abaixo que é número foi MEDIDO nesta análise, não lembrado.

---

## 1. O que a medição mostrou

### 1.1 As 91 sondas de QA, rodadas uma a uma contra o `dist` de produção

| resultado                                                         | quantas | quais                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------- | ------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| verdes                                                            |  **78** | —                                                                                                                                                                                                                                         |
| `.impl` (biblioteca, não sonda)                                   |       4 | `cachoeira`, `itens-mortos`, `jornada`, `malha` — o varredor não devia contá-las                                                                                                                                                          |
| precisam do WebKit, que **não está instalado**                    |       3 | `enterrado`, `olhar-cima`, `prod-mobile` — **a única aproximação do iPhone que existe no repo está morta**                                                                                                                                |
| obsoletas (vermelhas por estarem velhas, não por defeito no jogo) |       3 | `aldeia` (posição da vila cravada de 13/09; o Goal 19 mudou a grade), `interface` (acusa o disco redondo do minimapa como "raio gordo"), `itens-mortos` (lista de drops escrita à mão e não lê `mobs.js`, nem fermentação, nem caldeirão) |
| **vermelha de verdade**                                           |       1 | `prod`: o smoke de produção do jogo procura `.jogo__btn--primario` na landing — o site saiu do front no Goal 15 e o botão hoje é `a.btn.primary` → **não existe smoke de produção do RoqueCraft desde o Goal 15**                         |
| pulada (é para olho humano)                                       |       2 | `olho`, `ceu-fotos`                                                                                                                                                                                                                       |

Achado de lambuja no `itens-mortos`: `netherQuartzOre` existe como ITEM e o
minério dropa `quartz` — item que o jogador nunca alcança. Falta `semItem`.

**O que isto ensina:** as sondas não estão em gate nenhum. Apodrecem em
silêncio, e a que apodreceu primeiro foi a de produção. Regra sem mecanismo.

### 1.2 O toque não alcança o que o teclado alcança

Lido em `useRoqueCraftEntrada.js` × `RCMobile.vue`:

| ação                       | teclado                | toque                                                    |
| -------------------------- | ---------------------- | -------------------------------------------------------- |
| reger o mundo (clima/hora) | **K**                  | **não existe**                                           |
| chat em rede               | **T**                  | **não existe** — quem joga no celular numa sala não fala |
| largar item da mão         | **Q**                  | não existe                                               |
| pick block                 | botão do meio          | não existe                                               |
| fechar a tela do topo      | **Esc** (a pilha nova) | só o `x` de cada painel                                  |

O founder joga no iPhone. Tudo que entrou nesta semana (K, painel do criativo)
é invisível lá.

Medido também: com o painel do criativo aberto no viewport de iPhone 13, o véu
do painel COBRE o HUD móvel (o `elementFromPoint` no botão de pausa devolve
`rc-cri`), então o defeito do desktop não se repete no toque. Mas `RCMobile`
continua montado com `v-if="isMobile && !menuOpen"` — a sexta lista de tela, e
o gate `tela-unica` não a viu porque só reprova DUAS telas negadas na mesma
condição.

### 1.3 O que o jogo original faz e o RoqueCraft ainda não

Contado em `items.js`/`blocks.js`/`mobs.js` (zero ocorrências, não "acho"):

- **porta, alçapão, portão de cerca** — a vila tem vão aberto (o doc da onda 5
  já dizia); o aldeão não tem casa fechada
- **armadura, escudo, arco do jogador** — `flechas.js` existe só para o
  esqueleto atirar em nós
- **pesca, barco, carrinho, placa, bolo, leite, cogumelo, bússola, relógio**
- **o End**: `ceuDaDimensao.js`, `portal.js`, `netherWorldgen.js` e `creditos.js`
  existem; End, dragão e a altura variável por dimensão (a trava que ele cobra)
  não
- **o aldeão não tem rotina**: não vai para a cama, não foge do zumbi, não
  volta ao balcão
- **poções**: só nível I, sem arremesso, sem prazo dobrado (`efeitos.js` já
  aceita nível e prazo; falta quem os compre)
- **multiplayer sem autoridade** (T4 do plano de 12/09): qualquer cliente
  escreve qualquer coisa; 8.000 edições truncam a sala
- mobs: 12 espécies + aldeão. Sem enderman, blaze, lobo, cavalo, golem

### 1.4 O que continua sem evidência, como fato

- **Nenhum aparelho-alvo, nunca.** Todos os goals desde 24/08 fecham com "no
  iPhone não foi visto". O WebKit do Playwright é a aproximação barata e está
  desinstalado.
- **Mutação automática**: Stryker não está no repo; o gate é AVISO. Toda
  mutação é à mão, uma por conserto — funciona, e não escala.
- **Backlog 21 (rodada 5)**: trocar o perfil para `low` em execução emitia 2
  `INVALID_OPERATION` de WebGL. Nenhuma sonda lê `console.error`; só `pageerror`.
- `ROSRoqueCraft.vue`: **2.407** linhas; o `GOAL-ESTRUTURA` diz 1.500.

### 1.5 Ambiente (do lado do founder)

- `sudo xcodebuild -license accept` — o `git` da Apple está travado; o
  workaround `DEVELOPER_DIR=/Library/Developer/CommandLineTools` funciona, mas
  qualquer script que chame `git` sem ele (como o `games-catalog.mjs` fez) cai
  no fallback.
- O mount da sessão recusa `unlink`: `lint-staged` morre no stash. Os quatro
  passos do `pre-commit` rodam à mão, colados no commit. É trabalho de máquina
  feito por pessoa.

---

## 2. As ondas, em ordem de dano ÷ custo

Cada etapa fecha como no Goal 20: reproduzir → regra em serviço/composable →
teste + **mutação** → suíte inteira → commit/push → build → sonda → deploy →
**produção conferida por hash** → este arquivo atualizado.

### Onda 0 — a régua volta a funcionar (antes de qualquer conteúdo)

| #       | etapa                                                                                                                                                                                                        | mecanismo                                                                                                                                                              |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1 ✅  | `node scripts/qa-sondas.mjs`: roda as 85 sondas de verdade, ignora `.impl`, marca "não rodou" (WebKit ausente) separado de "vermelha", grava o ledger versionado                                             | `scripts/qa-roquecraft-varredura.json` (versionado) + gate `sondas-varridas`: vermelha = teto ZERO, sonda sem varredura reprova, varredura com mais de 21 dias reprova |
| 0.2 ✅  | `qa-roquecraft-prod` de volta: landing nova (`a.btn.primary` → `/jogar/roquecraft`) e o jogo montando em produção                                                                                            | roda no `deploy:composto` DEPOIS do deploy, como o `install.sh` já é medido                                                                                            |
| 0.3 ✅  | `aldeia` pergunta a posição ao gerador (como `aldeao` faz); `interface` aceita o disco do minimapa por classe; `itens-mortos` lê `mobs.js`, `fermentacao.js` e o caldeirão; `netherQuartzOre` vira `semItem` | as três voltam a verde; `itens-mortos` teto ZERO                                                                                                                       |
| 0.4 ✅  | WebKit do Playwright instalado → `enterrado`, `olhar-cima`, `prod-mobile` rodam; `prod-mobile` em WebKit passa a ser **a evidência de iPhone de todo goal**                                                  | entra na varredura e no fechamento de cada onda                                                                                                                        |
| 0.5 ✅  | gate `tela-unica` reprova QUALQUER tela negada em `v-if` fora de `telaAberta`/`paramOMundo`; `RCMobile` passa a `!telaAberta`                                                                                | mutação: devolver `!menuOpen` reprova                                                                                                                                  |
| 0.6 ✅  | sonda `console-limpo`: 60 s jogando, ultra→low→ultra, conta `console.error`; fecha o backlog 21                                                                                                              | teto ZERO de erro de WebGL                                                                                                                                             |
| ~~0.7~~ | ~~Stryker nos `criticalPaths`~~ — **recusado pelo founder em 18/09**: a mutação segue à mão, uma por conserto, e o gate segue AVISO                                                                          | —                                                                                                                                                                      |

### Onda 1 — o toque em paridade com o teclado

| #   | etapa                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------ |
| 1.1 | botão **reger o mundo** no HUD móvel (só criativo), abrindo o mesmo painel                                               |
| 1.2 | botão **chat** no HUD móvel quando `mp.active`; teclado virtual abre e o Enter envia                                     |
| 1.3 | **largar** (Q) por toque longo no slot da hotbar; **pick block** por toque longo na mira, no criativo                    |
| 1.4 | botão **voltar** no toque = `fecharDoTopo()` — a MESMA pilha do Esc, um lugar só                                         |
| 1.5 | sonda `interface` estendida aos painéis novos: nenhum alvo de toque < 44 px no criativo e no comércio, em iPhone 13 e SE |

### Onda 2 — a vila vira lugar

| #   | etapa                                                                                                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 | **porta e alçapão**: bloco com forma (2 alturas × 4 orientações × aberto/fechado), abre por interação, o aldeão atravessa. **Arte própria: decisão do founder** |
| 2.2 | ~~portão de cerca~~ **já existia** (`oakGate`, 8 ids, sonda `cerca` mede abre/fecha). A medição de 18/09 disse "0 ocorrências" e estava errada.                 |
| 2.3 | **rotina do aldeão**: dia no balcão, noite na cama, foge do zumbi a 8 blocos, volta. Pura em `npc.js`/`aldeia.js`, sonda com foto à noite                       |
| 2.4 | **a cidade fotografada**: nunca foi. Sonda com igreja, feira e ruas, mais a auditoria de malha                                                                  |
| 2.5 | as casas fecham (porta no vão) e o zumbi não entra                                                                                                              |

### Onda 3 — equipamento e defesa (a onda 4 do plano de 12/09)

| #   | etapa                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 3.1 | **armadura** em 3 materiais × 4 peças, redução de dano no `combate.js`, slots no inventário, durabilidade na morte (o RC-08 já cobre ferramenta) |
| 3.2 | **arco e flecha do jogador**: `flechas.js` já voa; falta o item, o gesto (segurar carrega) e o dano por carga                                    |
| 3.3 | **escudo**: bloqueio segurando o botão direito com a mão vazia ou o escudo                                                                       |

**Trava:** item novo é tile novo. A decisão de 24/08 congelou arte; desde então
entraram lavoura, ícones de poção e o aldeão por procedimento. **Esta onda não
começa sem o founder dizer que a arte procedural própria está liberada.**

### Onda 4 — poções completas

Arremessável (splash), nível II com glowstone, prazo dobrado com redstone —
`efeitos.js` já aceita os três; falta o suporte comprá-los e o item voar.

### Onda 5 — o End e o desafio final (a onda 6 do plano)

Altura variável por dimensão (a trava T2 pela metade: o registro existe, o
render e o save não usam), fortaleza com o portal, a ilha, o dragão, a
recompensa, o retorno e os créditos (`creditos.js` existe e nunca rolou).

**Critério:** partida nova chega ao fim por ações normais, no desktop e no
toque, salvando e reabrindo em cada dimensão.

### Onda 6 — cooperação com autoridade (a onda 5 do plano, T4)

Host autoritativo, intenção validada, baú e forno compartilhados, tempo e clima
sob uma autoridade só, reconexão, saída do host. Remove o truncamento de 8.000.
**Critério:** 2 a 4 clientes constroem, trocam, morrem e reconectam sem
duplicar nem perder, com 150 ms e 1% de perda simulados.

### Transversal — estrutura

Toda onda que passa por `ROSRoqueCraft.vue` sai com o arquivo MENOR e a catraca
apertada. Meta do `GOAL-ESTRUTURA`: 1.500. Não é onda própria: é o preço de
cada uma.

---

## 3. Decisões do founder, 18/09/2026

Tomadas antes de o loop começar, e não se reabrem sem pedido dele:

- **Arte procedural própria LIBERADA** para porta, alçapão, portão, armadura,
  arco e escudo. Nada da Mojang; desenho nosso, conferido na folha de contato.
  (Substitui o congelamento de 24/08 para estes itens.)
- **WebKit do Playwright: autorizado.** Stryker: **não**.
- **Escopo: ondas 0 a 6 em sequência, sem parar**, deploy a cada etapa.

## 3b. Onde parar e perguntar, mesmo em loop

1. **Arte fora da lista acima** — decisão dele.
2. **Dependência nova no `package.json`** — não há nenhuma autorizada.
3. **Apagar ou mover o que não é meu** — listar e mostrar antes.
4. **Gate vermelho que eu não explico** — relato, nunca `--no-verify`. (O
   `lint-staged` no mount é explicado e documentado; segue à mão até o
   founder decidir o que fazer com o mount.)

## 4. O que NÃO entra, dito agora

- Compatibilidade com save, mod ou resource pack do original.
- Reescrita do render, troca de stack, mexer no visual aprovado.
- Cópia da modelagem do original: desenho nosso, convenção do gênero.
- Onda 8 do plano (WASM, WebGPU, TV) — depois, nunca antes.

---

## 5. Registro das etapas

(uma entrada por etapa fechada: commit, o que foi medido, o que a mutação
reprovou, o hash em produção)

### Ondas 0 e 1 — fechadas em 18/09/2026

**Onda 0, a régua.**

- `scripts/qa-sondas.mjs` roda as sondas uma a uma e grava
  `scripts/qa-roquecraft-varredura.json`, versionado. `sondas-varridas.spec.js`
  lê o ledger: vermelha é teto ZERO, sonda sem varredura reprova, varredura com
  mais de 21 dias reprova, `nao-rodou` (navegador ausente) tem teto 3. Três
  mutantes no ledger (uma vermelha, data velha, sonda a menos), três reprovados.
  Varredura completa: **88 verdes, 2 humanas, 0 vermelhas** — ela levou 58 min.
- **Cinco sondas estavam mortas ou mentindo, e nenhuma por defeito no jogo:**
  `prod` e `prod-mobile` procuravam o botão da landing antiga (o site saiu do
  front no Goal 15) — agora entram por `/jogar/roquecraft`, que é do front, e
  perguntam à landing se ela ainda aponta para cá; `qa-roquecraft.mjs` (o
  harness de 19/08) servia `dist/pwa` com fallback para `index.html`, que
  depois do `compose-site` é o SITE — agora usa `servirDist`; `aldeia` tinha a
  coordenada da vila cravada e contava por uma faixa de altura fixa (0 podzol,
  0 vidro numa vila com 262 e 62); `interface` acusava o disco do minimapa;
  `itens-mortos` tinha doze drops escritos à mão e não lia `mobs.js` nem a
  fermentação — agora lê as duas fontes e o caldeirão (mutante: sem a
  fermentação acusa 8 poções). `netherQuartzOre` virou `semItem`.
- WebKit do Playwright instalado (autorizado): `enterrado`, `olhar-cima` e
  `prod-mobile` voltaram a rodar — `prod-mobile` em WebKit contra produção
  passou nos dois motores.
- **Backlog 21 fechado, e a causa não era a que eu supus.** A sonda nova
  `console-limpo` contou 9 `GL_INVALID_OPERATION: glTexStorage2D: Texture is
immutable` numa sessão com quatro trocas de perfil. Primeira hipótese (o
  atlas realocado com outra contagem de mips) — `dispose()` antes de
  `needsUpdate` não mudou nada: revertido, porque mudança de render sem
  medida é risco sem evidência. A instrumentação de `createTexture` +
  `texStorage2D` mostrou o handle #37 alocado durante a troca para `low` e
  REALOCADO na troca para `ultra`: o laço `frame` continuava desenhando com o
  motor descartado enquanto `rebuildEngine` esperava o novo (`await
montarMotor`), e o renderer morto subia textura num contexto que o seguinte
  herdava. Conserto: `engine = entities = null` durante o rebuild e `if
(!engine || !entities) return` no laço. Mutante (devolver o laço): 9 erros de
  volta. Depois: 0 em cinco perfis.
- `naPartida` no composable de telas; o gate `tela-unica` passou a reprovar
  QUALQUER tela negada em `v-if`/`v-show` sem uma positiva ao lado (mutante:
  `!menuOpen` de volta reprova).
- Stryker recusado pelo founder: a mutação segue à mão, uma por conserto.

**Onda 1, o toque.**

- HUD móvel: botão **reger o mundo** (só criativo) e botão **chat** (só em
  rede), ícones `nuvem` e `balao` na grade 8×8 do jogo. `RCMobile.spec.js`
  (7) e `RCHud.spec.js` (5), que não existiam.
- **Segurar o slot da hotbar larga o item** (o Q); toque curto seleciona pelo
  `touchend`, porque o `touchstart` tem que ser prevenido — sem isso o
  navegador tratava o dedo parado como gesto dele e mandava `touchcancel`
  antes dos 600 ms (medido: o item continuava na mão).
- **Segurar o dedo na mira, no criativo, é pick block** (`TOQUE_LONGO_MS`,
  `FOLGA_DO_TOQUE_LONGO`; arrastar cancela; `soltarComandos` cancela).
- **Achado de gameplay que a sonda do toque revelou:** o item largado caía a
  1,1 bloco do peito com carência de 0,4 s e VOLTAVA para a mão de quem ficou
  parado (64 → 63 → 64 em menos de um segundo). `CARENCIA_DE_QUEM_LARGA =
1,5 s`, aplicada por `entidades.largarAFrente` — a regra saiu do `.vue`.
- O chat entrou no design system do jogo (`--rc-*`, recuo escavado, `x` de
  `.rc-btn`); quatro tokens `--ros-roquecraft-*` que só ele lia foram
  removidos (o gate `tokens-fantasma` cobrou).
- `qa-roquecraft-toque.mjs`: dedo pelo protocolo (`Input.dispatchTouchEvent`),
  iPhone 13: **10/10**.

**Medido:** 876 arquivos, 10.942 testes, verdes. `roqueos-gate`: 12 passaram,
0 vermelhos (o `Cobertura` reprovou uma vez por teardown do
`ROSAppManager.spec` e passou sozinho e no gate seguinte — flaky, não é desta
mudança). Revisores: vue-quasar (1 achado, `onUnmounted` no timer do slot,
consertado — sem teste, porque o Vue engole `emit` de instância desmontada e
os dois mutantes passaram iguais) e supply-chain (nenhuma dependência).
`ROSRoqueCraft.vue`: 2.407 → 2.406, catraca 2.406.

### Onda 2.1 (porta) — fechada em 18/09/2026

**A porta de carvalho, arte nossa.** 16 ids (`oakDoor{''|Nx|Pz|Nz}{Aberta?}{Cima?}`),
`porta: {orient, aberta, cima}`, forma em `formas.js` (`portaEm`: fechada
1×1×3/16, aberta 3/16×1×1), serviço puro `porta.js` (encaixe em duas células,
outra metade, virar as duas), `colocacao.js` e `interacao.js` ligados,
`duplos.js` (cama ou porta: a outra metade) no `breakBlock`, textura
procedural `oak_door_bottom/top` (atlas 149 telhas), receita 6 tábuas → 3
portas, `vilaCasa.js` põe porta de verdade no vão. `TABELA_DE_IDS = 512`
(as tabelas por id eram `256` a seco; gate `tabelasPorId`). Os 13 itens de
bloco sem nome (cerca, portão, alga, bambu, netherrack, …) ganharam nome nos
10 idiomas; gate `itensComNome` (teto zero, chave dinâmica que os gates de
i18n não viam).

**O aldeão abre porta; o zumbi não.** `abrePortas` só no aldeão; ganchos
`portaFechadaEm/abrirPorta/fecharPorta/vaoDaPorta` em
`useRoqueCraftEntidades.ambiente()` (pelo `mundo.editar`, o mesmo caminho do
clique). Três coisas que a sonda achou e o teste puro não teria achado:

- **a porta fechada é fina e fica na face de FORA**: o aldeão entra na célula,
  abre, e a folha aberta nasce colada na quina dele. Centrado na célula ele
  não passa (0,35 de meia largura contra 0,3125 de folga) — `centroDoVao`
  (`formas.js`) dá o meio do que está livre, e o deslize de alinhamento entra
  DEPOIS do passo e sem `blocked` (mutante com `blocked` reproduz a trava em
  z=8,55 que a sonda fotografou);
- **o pulo de degrau olhava a coluna do CENTRO**: na soleira o centro é o vão
  (livre em cima) e a quina que barrou é a parede de dois — o aldeão quicava
  contra a parede (y=89,97 na sonda). `soUmDeAltura` olha a célula acima de
  cada quina que barrou. Par de controle: degrau de um continua sendo pulado;
- **mandar em vez de sortear**: `mandarMob(tipo, x, z)` em `qaDeMobs` — com o
  vagueio a sonda era loteria (abria, mudava de alvo, voltava, fechava).

**A régua, de novo:** `varridoEm` do ledger passou a ser a sonda mais VELHA —
rodar uma sonda só regravava a data da varredura inteira e zerava a folga de
21 dias (teste novo no `sondas-varridas.spec`; o ledger antigo reprovava nele).
**Achado registrado, não corrigido:** 31 sondas nunca chamam `process.exit`
(`amostras, auditoria, cama-forma, cama, cerca, ceu-fotos, ceu-pos, construcao,
construir, creeper, enterrado, entrada, escada, faces, flecha, fluxo, gravidade,
leito, mao, mobile, monta-mapa, nascer, noite, olhar-cima, olho, persistencia,
pouso, sombra-baixa, sombra, tocha, qa-roquecraft`) — para o ledger elas são
verdes por definição, mesmo imprimindo `FALHOU`. Parte é foto (humana de
fato), parte tem veredito e não o devolve. Entra como etapa 0.4 da próxima
rodada: cada uma ou sai com `exit 1` no veredito ou entra em `mostra` do
manifesto.

**Medido (18/09, 01:40–02:00 BRT):** `qa-roquecraft-porta`: 22/22 (coloca as
duas metades pelo clique; abre e fecha as duas; fechada barra z=−0,30, aberta
atravessa z=4,22; vila com 9 portas × 2 metades; aldeão abriu em 4,2 s, saiu
em 4,8 s, fechou em 6,2 s). Sondas mexidas por `mobs.js` rodadas de novo:
`aldeia, cama, cerca, mobs, portal, vila` verdes; ledger 89 verdes, 2 humanas.
Suíte: 881 arquivos, 10.981 testes. Mutantes mortos: 3 em `mobs` (não fecha /
zumbi abre / abre sem checar), 2 no deslize (eixo exato / com `blocked`), 1 no
pulo (coluna do centro), 1 em `vaoDaPorta`, 1 em `centroDoVao`, 1 em
`ambiente` (fecha o que está fechado), 1 em `duplos`, 1 em `itensComNome`,
1 em `tabelasPorId`. Revisor vue-quasar: reprovou por i18n e teste que não
tinha recebido; com os arquivos, aprovou. `ROSRoqueCraft.vue`: 2.406 → 2.404,
catraca 2.405.

**Em produção:** commit `c505f2f7`, `index-DaB_3vrF.js` e
`ROSRoqueCraft-uG0DbkRt.js` com sha256 idênticos local/ao vivo (18/09, 02:36
BRT), `qa-roquecraft-prod` 6/6 contra `roqueos.com.br/jogar/roquecraft`.

### Onda 2.1b (alçapão) — 18/09/2026

**O portão deitado.** 8 ids (`oakTrapdoor{orient}{Aberto?}`), `alcapao:
{orient, aberto}`, fechado é tampa de 3/16 no fundo da célula (pisa-se nela,
tapa o buraco), aberto é a tampa em pé no plano OPOSTO a quem colocou (a
dobradiça longe do jogador; no plano −Z a tampa levantada barraria justamente
quem quer descer). Clique vira (`interacao.js`), nasce virado pelo olhar
(`variante.js`), textura `oak_trapdoor` (atlas 150 telhas), receita 6 tábuas
→ 2, nome nos 10 idiomas. `alcapao.spec.js` (7). Sonda
`qa-roquecraft-alcapao.mjs`: 11/11 — fechado segura o jogador a y+3/16 sobre
um buraco de 3; aberto ele cai até o fundo (y−2); prova de vida 2,19 de
diferença.

**Defeito de 25/08 achado de tabela:** `idParaColocar` lia `PORTAO_DO_BLOCO`
(tábua → portão) em vez de `BLOCO_DO_PORTAO` (variante → família). Colocar
TÁBUA DE CARVALHO escrevia um portão, e o item de portão nascia sempre na
orientação 0. O `variante.spec` prendia o defeito: colocava a tábua e esperava
portão. Corrigido, teste invertido (tábua continua tábua; portão colocado
olhando +X e −Z dá `oakGateNx` / `oakGateNz`), e a sonda mede no jogo.
Ninguém tinha visto porque a sonda da cerca punha o portão por `fill`.

### Onda 2.3 + 2.5 (rotina do aldeão; as casas fecham) — 18/09/2026

**`rotina.js`, puro:** hostil a menos de 8 → foge para longe dele, ignorando o
relógio e reavaliado a cada quadro (mutante: só no timer → o aldeão andava 5 s
para a boca do zumbi); noite → anda até a origem (a casa; a porta ele abre) e
fica `idle` lá; dia → alvo sorteado AO REDOR DA CASA dentro de 6 (não ao redor
de onde está: é o que o traz de volta). Zero campo novo no save. A fuga passou
a aceitar um ponto (`fugaDe`) além do jogador; quem apanha do jogador zera.
`ameacaPerto` no ambiente. `rotina.spec` 13 testes, 5 mutantes mortos.

**Medido na vila real (`qa-roquecraft-rotina`, 11/11):** de dia máximo 4,01
da casa em 20 s; de noite os 9 moradores a ≤ 1,49 da casa em < 60 s e 0
portas abertas de 9; zumbi a 5 → 7 em 4 s (`flee`); jogador dentro da casa
com a porta fechada e zumbi a 7 do lado de fora: em 10 s o zumbi fica a 4,8,
não entra, e a porta continua `oakDoorNz` — o morador da casa fugiu para o
fundo (2,4 do centro) sem abrir a porta para o lado do zumbi. Três rodadas de
sonda até a cena ficar certa: `limparMobs` levava os moradores antes de ler a
casa; a origem é `round(c.x + 0.5)` e cai uma coluna ao lado do centro; `yaw
0` olha para −Z (a porta) e `Math.PI` punha o zumbi atrás da casa.

**A régua pegou a rotina:** `qa-roquecraft-vila` ficou vermelha ("oakDoorNz:
8 de 9") porque um aldeão abriu a porta no instante da contagem — porta em
uso continua sendo porta; a sonda passou a contar `oakDoor*` sem o estado.

### Onda 2.4 (a cidade fotografada) — 18/09/2026

**Nunca tinha sido fotografada, e a primeira foto achou três defeitos** — a
cidade existia só no plano:

1. `cidade.js`: `colunasDaIgreja` e `colunasDaBanca` passavam a CHAVE do
   material (`'oakPlanks'`) como id. `put` escreve num `Uint8Array`; a string
   vira 0. A igreja e a feira inteiras eram escritas como AR, e o teste do
   plano passava (o plano estava certo; o bloco, não). `ID[chave]`, como
   `vilaCasa.js` sempre fez; teste "toda peça é um ID NUMÉRICO" (mutante
   morto).
2. `aldeia.js` `colunaDaAldeia`: `dentroDoEscrito` sem o porte usava o raio da
   VILA (35) — as duas coroas de fora e a igreja (a ~59) nunca chegavam ao
   mundo: 20 casas no plano, 12 no mundo. E a coluna parava em
   `chao + ALTURA_DA_ALDEIA` (11): a torre (21) era serrada. `raioDoTerrenoDe`
   (o que `terrenoPlano` mede, inalterado) separado de `raioEscritoDe` (a
   cidade escreve até a igreja: `+ ALCANCE_DA_IGREJA`); pedir planície até lá
   zerava as cidades em 169 células. Teste "a cidade CHEGA AO MUNDO inteira"
   (dois mutantes mortos). Efeito colateral: a margem de `centroDaCelula` da
   cidade muda, logo o centro das cidades muda de lugar em relação aos
   mundos de antes (o porte tem 3 dias).
3. `useRoqueCraftEntidades.povoar`: `planoDaAldeia` (porte 'vila' por
   padrão) — só a vila ganhava moradores; a cidade e a aldeia nasciam vazias.
   `planoDoAssentamento`.

**Medido (`qa-roquecraft-cidade`, 8/8):** cidade em (328, 424); torre a 25
do chão; 5/5 bancas com toldo (15 blocos cada); 20 moradores para 20 casas,
com os quatro ofícios; malha sem buraco (0 em 71.515 blocos, 2.663 seções).
Três fotos: aérea, a praça com as bancas, a igreja com o campanário.
Revisor: um achado (`inventarioDoPlano` com o raio do porte), aplicado.

### Onda 3.1 (a armadura) — 18/09/2026

**`armadura.js`, puro:** 3 materiais × 4 peças (couro 7, ferro 15, diamante
20 pontos por conjunto), 4% por ponto até 20, fontes protegidas `mob`,
`arrow`, `explosion`, `cactus` (queda, afogamento e fome passam inteiros),
desgaste 1 ou dano/4 por golpe amenizado, a peça que zera some. Mora em
`survival.armadura` (estado de corpo: grava com a vida, cai com a morte, não
ocupa slot) — sem versão nova do save, `deserializeSurvival` sem o campo
devolve vazio. 12 itens de `ARMADURAS`, 12 receitas (forma da peça ×
ingrediente do material), 12 ícones no atlas de itens (arte própria: quatro
formas × três paletas). HUD com pinos de armadura acima da vida; inventário
com os quatro lugares e o total.

**O gesto:** shift+clique na peça veste (atalho de teclado); o LUGAR conversa
com o cursor — cursor vazio pega a peça vestida, cursor com uma peça daquele
lugar veste (e troca). É o único gesto que existe igual no mouse e no toque;
o revisor apontou que só o shift deixaria o celular sem vestir.
`onSlotClick` e `giveCreative` saíram do componente para `criarMaoDaBancada`
(`cliqueNoSlot`, `dar`): `ROSRoqueCraft.vue` 2.404 → 2.397.

**Medido (`qa-roquecraft-armadura`, 15/15):** shift+clique veste (8 pontos),
HUD com 4 pinos, 10 de `mob` tira 7 (10 × 0,68 → 7), 10 de `fall` tira 10,
peça perde 2 de durabilidade (528 → 526), pegar no lugar → pôr na hotbar →
pegar → vestir sem shift. Mutantes: sem desgaste, sem filtro de fonte, sem
redução — três mortos.

**Pendente da 2.1:** ~~alçapão~~ (feito); ícone da porta no inventário é o cubo
isométrico de todo bloco (a tocha também) — ícone plano é melhoria, não
defeito.

### Onda 3.2 (o arco do jogador) — 18/09/2026

**`arco.js`, puro:** `armar(agora)`/`soltar(agora)` devolvem a carga 0..1
(1 s enche; abaixo de 0,1 não sai flecha), dano 1..9 e velocidade 8..26 por
carga. A flecha do jogador (`dono: 'jogador'`) nasce na altura do olho
(`EYE_HEIGHT`) — da mão ela batia no chão a 3 blocos — e `criaturaAtingida`
mira o CENTRO do mob pela altura do tipo (porco 0,9: com 1,8 fixo a flecha
passava por cima). Item `bow` (ferramenta `kind: 'bow'`, 384 usos) e `arrow`
(pilha de 64); receitas 3 gravetos + 3 linhas → arco, sílex + graveto + pena
→ 4 flechas; dois ícones no atlas (94); `items.bow`/`items.arrow` em 10
línguas.

**O gesto:** segurar o botão direito (ou o toque de colocar) arma quando há
flecha no survival; soltar atira na direção da mira; perder o foco cancela
sem gastar. Consome 1 flecha e 1 de durabilidade por tiro. No
`passoDasFlechas` a flecha do jogador pula o jogador e acerta mobs com
`hurtMob(m, dano, true)` + empurrão. `qaDeEntrada.segurarColocar` passou a
usar `entrada().onMobilePlaceStart/End` (era um caminho paralelo por
`construcao`, que saiu do gancho de QA).

**Medido (`qa-roquecraft-arco`, 8/8):** toque de 40 ms não atira nem gasta;
0,35 s atira (flecha 8 → 7, arco 384 → 383, porco 10 → 6); 1,2 s atira a
segunda (porco 10 → 1, dano 9 > 4); sem flecha nada sai e o arco fica em 382.
A sonda recria o porco a 3 blocos e re-mira ao soltar — ele vagueia, e a
meia carga "errou" duas vezes antes disso. Mutantes: sem busca de mob, sem
consumo de flecha, sem cancelar na perda de foco — três mortos. Ledger 94
verdes, 2 humanas. Suíte 886 arquivos / 11.036 testes.

**Pendente:** indicador de carga no HUD (o arco carrega às cegas hoje).

### Onda 3.3 (o escudo, a guarda) — 18/09/2026

**`escudo.js`, puro:** segurar o botão direito (ou o toque de colocar)
levanta a guarda; soltar baixa; perder o foco baixa. COM O QUÊ se guarda é
decidido na hora do golpe, pelo item na mão — guardar "levantei com o
escudo" abriria a troca de slot com o botão segurado. Escudo apara tudo de
`mob`, `arrow` e `explosion` que vem PELA FRENTE (yaw 0 olha −Z) e desgasta
1, ou 1 + o dano a partir de 3. Mão vazia é braço: segura metade do golpe de
bicho e nada mais (decisão minha dentro do "mão vazia ou escudo" do plano;
se for pra mão vazia não guardar nada, é uma linha em `aparar`). Queda, fome
e golpe pelas costas passam inteiros. A guarda vem ANTES da armadura: o que
o escudo apara não gasta peça. Item `shield` (336 usos), receita 6 tábuas +
lingote, ícone próprio (95 no atlas), nome em 10 línguas.

**A origem do golpe:** `machucar(quanto, fonte, de)` ganhou `{x, z}`; os
três pontos de `useRoqueCraftEntidades` (flecha, estouro, bicho) mandam a
deles. Sem origem, conta como frente.

**De carona:** `gastarFerramentaNaMao` foi para `criarMaoDaBancada.gastar`
(com o inquebrável), e o `gastarFerramenta` do combate passou a usar o mesmo
caminho — antes a espada ignorava o inquebrável. `ROSRoqueCraft.vue` 2.410
→ 2.399.

**Medido (`qa-roquecraft-escudo`, 10/10):** guarda baixa 2 de mob tira 2;
segurando, 4 pela frente tira 0 e o escudo 336 → 331; pelas costas tira 2 sem
gastar; queda tira 2; soltou, tira 2; mão vazia: 4 de mob tira 2, 2 de flecha
tira 2; zumbi de verdade a 2 blocos, de noite, 3 s segurando: vida 8 → 9
(regenerou), escudo 331 → 319 (três golpes de 3). Mutantes: frente sempre
verdadeira, guarda ignorando o item na mão, sem desgaste — três mortos.
Ledger 95 verdes, 2 humanas. Suíte 887 arquivos / 11.048 testes.

**Pendente:** o golpe aparado ainda EMPURRA o jogador (a sonda mediu z 0,5
→ 3,42 em três golpes); no original o escudo segura o tranco. Indicador de
guarda no HUD/mão (o escudo não sobe visualmente).

### Onda 4 (poções modificadas) — 18/09/2026

**Sem item novo.** Nível II, prazo dobrado e arremessável são um campo
`pocao` NA PILHA (`{ nivel: 2 }`, `{ longa: true }`, `{ splash: true }`),
como `enc` e `dur` já eram — o motivo escrito em `fermentacao.js` para não
fazer (24 itens, 24 ícones, 240 traduções) deixou de existir. `modificar`
tem as regras do original: só poção com efeito; II só onde o efeito tem II;
prazo não estica instantâneo; II e prazo dobrado não se somam; nada duas
vezes. `doseDe(item, pocao)`: II corta o prazo pela metade, longa dobra.
Save: sexto campo do inventário e quarto da mobília (`'II'`, `'L'`, `'S'`
combinados); formato antigo continua abrindo.

**O frasco:** `arremesso.js` (puro). Voa como flecha (`forma: 'frasco'`, na
mesma lista, cubinho da cor da poção no render), quebra em bloco, criatura
ou fim da vida, e borrifa num raio de 4: dose cheia no centro, zero na
borda, prazo E instantâneo minguados pela distância. Jogador recebe tudo
por `tomarEfeito` (que ganhou o 4º argumento `pontos`); criatura só o
instantâneo (cura sobe, dano via `hurtMob`). Não devolve vidro.

**O rótulo:** `rotulo.js` (`nomeDaPilha`) substituiu três `itemLabel`
iguais em RCHud/RCInventory/RCContainer e escreve "Poção de força II",
"(longa)", "Arremessável: …" em 10 línguas.

**De carona, defeito antigo:** catar um item do chão chamava `addItem` sem
`dur`: a picareta em 3 de 1562 voltava NOVA. Agora a coleta carrega `dur`,
`enc` e `pocao`; o espólio da morte também leva `enc` e `pocao`.

**Achado pela sonda, não pelo teste:** o wrapper `ctx.jogador.tomarEfeito`
no componente tinha três parâmetros e o quarto (pontos minguados) caía no
chão — o respingo de dano II a 2 blocos chegava inteiro (13 → 7). O teste
de unidade do composable não vê o wrapper. Corrigido; a sonda mede 12 → 9.

**Medido (`qa-roquecraft-pocao-modificada`, 9/9):** suporte vivo com
glowstone → `{ nivel: 2 }` na garrafa e ingrediente consumido; beber força
II → nível 2, restante 89,6 s, vidro de volta; cura arremessável aos pés →
frasco em voo (`forma: 'frasco'`), some da mão, vida 10 → 12; dano II no
porco a 2 blocos → 10 → 5, respingo no jogador 12 → 9; rótulo
"Arremessável: Poção de veneno II". Mutantes: coleta sem extras, II sobre
longa, prazo sem minguar — três mortos. Ledger 96 verdes, 2 humanas.

**Pendente:** veneno e lentidão em criatura (não há mapa de efeitos no
mob); ícone da arremessável é o da poção comum (o rótulo distingue).

### Onda 5.1 (o Fim: a dimensão, o portal e a volta) — 18/09/2026

**A dimensão:** `end` no registro, 128 de altura como as outras — e é
decisão, não atalho: a ilha cabe (chão em 60, pilares até 97), e a "altura
variável por dimensão" do plano não paga nada aqui. Fica de fora desta onda,
dito. Sem mar, sem teto, sem bedrock: abaixo da ilha é o VAZIO, e ele mata
(`corpo`: abaixo de −4, 4 de dano por invulnerabilidade, causa `void`).
Céu próprio (`PALETA_DO_FIM`/`RIG_DO_FIM`: noite eterna com estrelas, luz
fria). `geradores.js` unificou a escolha de gerador (pipeline e travessia
tinham o mesmo ternário).

**A ilha (`endWorldgen.js`, puro):** raio ~56 roído por ruído, afina para
baixo; oito pilares de obsidiana num anel (76..97); fonte de bedrock 5×5 no
centro com o miolo vazio (o portal de saída acende quando o dragão cair);
plataforma de obsidiana de chegada em x = 44. Texturas próprias: pedra do
Fim, moldura (lado, topo, topo com olho), portal (155 telhas).

**O portal (`portalDoFim.js`, puro):** anel de doze molduras, olho por
clique (`interacao.js`, com `ender_eye` na mão, consome), o décimo segundo
acende o miolo 3×3. `travessia.js` decide pelo bloco pisado: portal do
Nether → Nether; portal do Fim → Fim (pouso na plataforma); do Fim → ponto
de renascimento (é o portal de saída). Morrer no Fim renasce no overworld
(`voltarDoFim` antes do corpo).

**Como se chega aos olhos:** pérola do Fim vendida pelo clérigo (5
esmeraldas, 4 usos); olho = pérola + pó luminoso. O guarda de itens mortos
passou a contar o comércio como quarta máquina (mutante: sem a oferta, ele
acusa `ender_pearl` e `ender_eye`). A fortaleza com o anel pronto é a 5.2.

**De carona:** `BLOCKS` estoura em id ou chave repetida (antes sobrescrevia
em silêncio — cada família aloca de um número solto); o HUD dizia "Oceano"
no Nether e no Fim (bioma 0), agora diz a dimensão; o espólio da morte
carrega `enc` e `pocao` (o componente passava só `dur`).

**Medido (`qa-roquecraft-fim`, 11/11):** clique com o olho enche a moldura e
acende o miolo (3 → 2 olhos); pisar no miolo leva ao Fim em 1.200 ms, em pé
na obsidiana (44,5, 60, 0,5); pedra do Fim no centro, obsidiana no pilar,
bedrock na fonte com miolo vazio, fora da ilha só ar; o vazio mata em 1,5 s;
renascer volta ao overworld. Mutantes: 12º olho não acende, portal do Fim
ignorado pela travessia, sem dano de vazio — três mortos. Ledger 97 verdes,
2 humanas. Suíte 892 arquivos / 11.097 testes.

**Fica para 5.2/5.3:** a fortaleza no overworld (o anel com alguns olhos e o
caminho até ela), o dragão, a recompensa, o portal de saída acendendo, os
créditos. O revisor apontou "teste do vazio ausente"; conferi: existe em
`useRoqueCraftCorpo.spec` (linha 335) desde antes do upload — e ganhou a
asserção da causa `void` de qualquer jeito.

### Onda 5.2 (a fortaleza e o olho que aponta) — 18/09/2026

**`fortaleza.js`, puro:** UMA por mundo. O centro sai da semente: 250..400
blocos da origem numa direção sorteada, pulando o mar (até doze ângulos).
Sala de pedra-tijolo 13×13×6 dezesseis blocos abaixo da superfície, com o
anel do portal do Fim no chão (2 a 4 olhos já postos, sorteio da semente),
glowstone nos cantos, e um POÇO 3×3 que desce reto da superfície até uma
piscina — a queda de 16 não fere. Na superfície fica só a boca de
pedra-tijolo, que é o que o jogador vê. `worldgen` escava tudo depois das
features (escreve inclusive ar), por chunk, com o plano recalculado (doze
alturas: barato).

**O olho aponta:** `ender_eye` usado ao ar livre avisa rumo (oito pontos) e
distância arredondada a dez, sem gastar — é o "o olho voa para lá" do
original sem a entidade. Na moldura ele entra pelo clique (5.1).
`geradores.fortalezaDaSemente` dá ao componente e ao QA o MESMO plano que o
gerador escreve.

**De carona:** `gastarFerramentaNaMao` virou uma linha (o "quebrou" avisa
por `aoQuebrar` em `criarMaoDaBancada`); o `avisar` duplicado do
`tryInteract` saiu. `ROSRoqueCraft.vue` em 2.404.

**Medido (`qa-roquecraft-fortaleza`, 13/13, semente 942457):** o olho avisa
"a fortaleza fica a 310 blocos, rumo nordeste" (centro em 260, −168) sem
gastar; boca de pedra-tijolo e vão aberto na superfície; piscina no fundo;
cair 16 blocos pelo poço deixa a vida em 20; o anel tem 12 molduras, 2 com
olho; pôr os 10 que faltam (cada um sai da mão) acende o miolo; pisar no
miolo leva ao Fim em 1.200 ms. Ledger 98 verdes, 2 humanas. Suíte 893
arquivos / 11.104 testes.

**O caminho inteiro até o Fim, por ações normais, existe agora:** esmeralda
→ clérigo → pérola → olho (pó luminoso do Nether) → o olho aponta → o poço →
o anel → o Fim. Falta o que está lá dentro: o dragão, a recompensa, o
portal de saída acendendo e os créditos (5.3).

**Flake registrado (5.2):** o gate Cobertura reprovou uma vez com "caught
after test environment was torn down" em `ROSAppManager.spec.js`
(`qa-out/_gate-fort-1-falhou.log`); na segunda rodada 12/12. A 2.4 tirou um
timer solto desse componente (`postInstall`); sobra outra fonte. Pendência
com evidência, não "flake conhecido".

### Onda 5.3 (o dragão, o portal de saída e os créditos) — 18/09/2026

**`dragao.js`, puro:** o único mob que VOA. Estado em `mob.voo` — não
reusa `estado`/`timer` do mob de terra (`estado` é a rotina do aldeão, e
reusá-lo foi o primeiro defeito deste arquivo: o dragão mergulhava no
primeiro quadro). Circula num anel dentro dos pilares (raio 24, altura 82),
mergulha no jogador a cada 8 s se ele está a menos de 70 do centro, morde
(6 de dano, recarga 2 s) e sobe. 200 de vida, 500 de XP, sem drop, nunca
some por distância. Modelo próprio (corpo, pescoço, cabeça com chifres,
cauda em três gomos, asas que batem em fases opostas), aprovado pela
anatomia do `mobModelo.spec`. Tipo registrado DEPOIS do aldeão: `MOB_KEYS`
é índice de save e de rede.

**`fimDeJogo.js`, puro — a ORDEM das três coisas:** o dragão cai → o portal
de saída acende no miolo da fonte no mesmo quadro, o save grava
`dragaoMorto` (ele não renasce ao reabrir), o aviso sai; os créditos só
rolam quando o jogador ATRAVESSA a saída — a recompensa é a volta.
`RCPause` ganhou `venceu`: abre direto nos créditos com "Você venceu o
Fim". `creditos.js` existia desde agosto e nunca tinha rolado.

**De carona:** `tickMining` virou `passoDaMineracao` (`mineracao.js`, com
spec — a extração que pagou o dragão no teto do componente);
`requestLock` trata a promessa que `requestPointerLock` devolve (a recusa
virava erro de página; visto duas vezes na sonda, não voltou na terceira
rodada, o passo fica marcado no log se voltar); `ferirMob` no QA.

**Medido (`qa-roquecraft-dragao`, 13/13):** ao chegar no Fim nasce UM
dragão com 200 de vida, a 84 de altura, e anda 15,6 blocos em 2 s; com 1
de vida a fonte segue vazia; ao cair, as nove células viram `endPortal`,
o save grava `dragaoMorto: true`, avisa "O dragão caiu…"; pisar na saída
volta ao overworld em 1.200 ms com a pausa nos créditos e o título da
vitória; Voltar → Continuar fecha; de volta ao Fim ele não renasce e o
portal continua. Mutantes: catch da promessa removido (entrada.spec
reprova); o resto pelos specs de 5.1/5.2. Ledger 99 verdes, 2 humanas.

**O critério da Onda 5 ("partida nova chega ao fim por ações normais")
agora tem o caminho inteiro:** esmeralda → clérigo → pérola → olho → o
olho aponta → poço → anel → o Fim → o dragão → a saída → os créditos. O
que fica: altura variável por dimensão (decisão: não paga), cristais e
sopro do dragão (pendência), ovo do dragão (arte), o toque nas sondas
desta onda (as sondas usam o mesmo caminho do mouse; a sonda de toque
própria fica para o passe transversal).

### Etapa 0.4 (as 28 sondas sem veredito) — 18/09/2026

O mecanismo já existia (`sondas-com-veredito.spec` + `semVeredito` no
manifesto, teto que só desce). O trabalho foi dar veredito de verdade a cada
uma: 26 ganharam `process.exit` a partir do que já mediam (objeto de
booleanos hoistado em `const veredito`, lista de alertas, 'OK'/'FALHOU'
aninhado, buracos da auditoria); `ceu-pos` e `mao` são folhas de contato e
foram para `mostra`. Teto: 31 → 1 (`qa-roquecraft.mjs`, a sonda-mãe).

**A primeira varredura com veredito reprovou SETE**, e cada vermelho foi
lido, não silenciado:

- `amostras`: a amostra longa é relatório (o próprio arquivo dizia); só a
  que não decodifica reprova.
- `cama-forma`: o travesseiro "no meio" era a taiga ao fundo balançando
  entre as duas fotos (6.244 pixels mudados num retângulo que ia até o
  céu). Janela central: 0,74 — na ponta. Instrumento, não jogo.
- `fluxo`: `laminaBaixa` deu 31, 142 e 18 pixels em três rodadas com o
  mesmo jogo — a mira sobre a calha varia. Fica no relatório, fora do
  código de saída, até a mira ser cravada. Pendência.
- `leito`: um pinguim dentro de uma alga de três de altura saía
  "encalhado" — alga e capim são `aguado` e a régua só aceitava `water`.
  Régua corrigida (segunda correção dela; a primeira foi em 26/08).
- `mobile`: a sonda apontava para `/jogos/roquecraft`, rota que morreu no
  Goal 15 — meses verde num 404. Agora `/jogar/roquecraft`, entra pelo
  mesmo botão que o `prod-mobile`, e o erro do service worker bloqueado é
  filtrado como artefato do harness. WebKit-iPhone e Chromium-iPhone
  chegam a `ready`.
- `pouso`: o item repousa 10 cm acima do apoio POR DESENHO
  (`passoDosItens`: `apoio + 0.1`); a régua do item é 10 ± 4 cm, a do
  bicho continua 4 cm.
- `sombra-baixa`: deserto, savana e planície são "sonda cega" (em chão
  liso a sombra baixa quase não desloca) e a floresta é viva. Vermelho é o
  instrumento MORTO (nenhum bioma vivo).

Depois disso: 26 verdes, 2 humanas novas. Ledger 99 verdes, 2 humanas.
Mutantes do guarda: entrada velha no manifesto reprova; `process.exit(0)`
não conta como veredito — dois mortos.

### Onda 6.1 (o mundo inteiro na sala; o relógio é do anfitrião) — 18/09/2026

Dois defeitos silenciosos do multijogador, os dois sem teste e sem aviso:

- **O teto de 8.000 edits.** `createRoom` semeava um write único e cortava o
  resto; o convidado entrava com a casa pela metade. Agora
  `lotesDeSemeadura(edits, 2000)` (pura) divide em multi-path updates e
  `createRoom` os manda em sequência, sem teto. `MAX_SEED_EDITS` morreu;
  `LOTE_DE_SEMEADURA` nasceu.
- **Cada cliente com o seu tempo.** O clima é `climaEm(semente, ticks)` —
  ticks diferentes, chuvas diferentes na mesma sala. Novo nó
  `roquecraftRooms/{code}/relogio { ticks, chuva, t }`, só o host escreve
  (a regra do `$code` já dava isso; ganhou teste no emulador). O anfitrião
  publica ao entrar e a cada 2 s (`PASSO_DO_RELOGIO`); o convidado assina e
  acerta só quando o desvio CIRCULAR passa de 40 ticks
  (`TOLERANCIA_DO_RELOGIO`, `relogioDaSala.js`), e adota a sobrescrita de
  chuva (painel de criativo) só quando ela muda — `forcar` pula a rampa. A
  sessão de rede ganhou `acertarRelogio`, `climaForcado`, `acertarClima`.

O componente ficou em 2.402 linhas (teto 2.405): o estado do save entra por
um aplicador só (`aplicarEstadoDoSave`), usado pelo boot e pela volta da
sala — eram duas listas de dez atribuições.

Medido: `relogioDaSala.spec` 4, `room.spec` 26 (+4), multijogador 26 (+4),
`qaDeTempo.spec` 11 (+1). Regras no emulador 84/84 (+1: "só o host escreve o
relógio"). Mutantes mortos: desvio linear, `>=` na tolerância, lote sem
corte, só o primeiro lote, host sem publicar ao entrar, acerto sem
tolerância, clima a cada mensagem, cadência desligada, regra do relógio
aberta a qualquer conta (1 falhou | 83), fiação `definirInstante` sem
escrita (sonda: "1000 → 1000", EXIT=1). Sonda `qa-roquecraft-relogio-da-sala`
8/8 no jogo (5.000 ticks acertam; 20 não; 23.990 contra 20 não pula; chuva
forçada chega à taiga como chuva 1,00; `null` devolve o mando).

O que a sonda NÃO mede: o lado do anfitrião publicando no Firebase de
verdade e dois clientes na mesma sala. Precisa de duas contas logadas; fica
para o harness de 2 a 4 clientes da 6.4.

### Onda 6.2 (a sucessão do host, a volta da queda, a sala que fecha com o último) — 18/09/2026

Até aqui a sala morria com o host: `enterRoom` armava
`onDisconnect(room).remove()`, e os convidados ficavam num mundo sem
criaturas, sem aviso. E uma queda de conexão apagava a presença sem
rearmar nada — o jogador voltava como fantasma.

- **Regra do banco:** `meta` ganhou `.write` de tomada — membro assume em
  nome próprio, com a mesma semente, e só enquanto o host de registro não
  está em `players`. Seis casos no emulador (90/90); mutante sem a condição
  de ausência: 2 falham.
- **Serviço:** `sucessorDoAnfitriao` (menor uid, igual em todo cliente),
  `claimHost`, `subscribeMeta`, `subscribeConnection` (`.info/connected`),
  `fecharSalaAoCair(code, armar)`, `leaveRoom({ fecharSala })`.
- **Composable:** assinaturas do papel separadas e `assumirPapel(host)`;
  `aoMudarMeta` (sala sumiu → sai e avisa; host mudou → troca papel e avisa
  quem assumiu); `sucederSePreciso` só depois de ter visto o host presente
  (a janela entre `createRoom` e `enterRoom` do host não vira tomada);
  `armarFechamento` só pelo host sozinho e só na mudança; `reentrar` na volta
  da queda (reapresenta, rearma, reconfere meta — o antigo host volta como
  convidado se outro assumiu). O último a sair leva a sala.
- **Medição do RTDB em produção:** `rules-e2e` ganhou 5 casos do Realtime
  Database (o `rules:drift`/`rules:audit` nunca olharam o RTDB; até hoje
  ninguém sabia se o RC-04 estava no ar — está: 5/5 como esperado).
  `rules-deploy --only database` com guarda e rollback por arquivo do alvo.
- i18n `mp.nowHost`/`mp.roomClosed` em 10 idiomas; `ui.avisar(chave)`.
- `recomecarEm(semente)` perdeu o `instante` (o relógio é do host desde a
  6.1). Componente em 2.402 linhas.

Medido: room.spec 29, multijogador 33. Mutantes mortos (10): toma a sala
sem ter visto o host; todo mundo reivindica; troca de papel sem assinar;
reentra na primeira conexão; convidado arma autodestruição; rearma a cada
snapshot; host acompanhado leva a sala; sucessor sem ordenar; `leaveRoom`
nunca fecha; regra sem a ausência do host. roqueos-gate 12/12. Revisor
vue-quasar aprovou sem achado.

Não medido no jogo: sucessão e reconexão com dois clientes de verdade
(precisa de duas contas) — harness da 6.4. A regra nova só vale em produção
depois do `rules:deploy --only database`; o app só sobe depois dela.

### Onda 6.3 (a mobília é da sala) — 18/09/2026

Baú, fornalha e suporte eram de cada cliente: o amigo abria o seu baú e via
o dele. Agora vivem em `roquecraftRooms/{code}/mobilia/{"x,y,z"}`, uma
entrada no formato do save por chave (`serializarEntrada`/
`desserializarEntrada`, extraídos do par de lista), e `null` apaga
(esvaziou ou foi quebrada).

- Quem mexe publica: o clique e o fechar do baú saem NA HORA
  (`paineis.mobiliaMudou` → `publicarMobilia(k, true)`); a fornalha que
  queima acumula em `mobiliaSuja` e sai a cada `PASSO_DA_MOBILIA` (1 s), só
  pelo anfitrião — o convidado não faz a fornalha queimar (`regeMobilia`)
  e recebe o estado. Último a escrever vence, por chave.
- A sala nasce com a mobília do anfitrião (`createRoom({ mobilia })`), como
  nasce com as edições; o convidado de outra semente limpa a dele
  (`recomecarEm` → `limparMobilia`).
- `quebrarMobilia` e `tique` saíram do componente para o `paineis`
  (2.403 linhas, teto 2.405).
- Regra: `mobilia` membro escreve; entrada sem `t` é recusada. Achado do
  emulador: `{ s: [] }` é um write VAZIO, que o banco trata como remoção e
  passa sem validar — o caso usa slot cheio. 91/91.

Medido: mobilia.spec +2, paineis +4, multijogador +4, room +3, regras +1.
Mutantes mortos (10): fornalha publica a cada tique; fila nunca esvazia;
convidado rege; sala nasce sem mobília; tique ignora quem rege; quebrar não
avisa; clique não avisa; remoção não chega; `avancarMobilia` não avisa;
`aplicarMobilia` sem redesenhar (a sonda reprovou: tela em [3, 12] com 7
mandado). Sonda `qa-roquecraft-mobilia-da-sala` 10/10 (a entrada da sala
vira baú no mundo; a tela aberta mostra [3, 12], redesenha para [7], esvazia
com null; quebrar devolve ao chão). Ledger 101 verdes, 2 humanas.
roqueos-gate 12/12. Revisor vue-quasar aprovou.

Pendência (6.4): `desserializarEntrada` aceita `count` sem teto de pilha de
quem está na sala — a validação de intenção é o lugar. Dois jogadores no
mesmo baú dentro da latência: último a escrever vence, pode perder item.

### Onda 6.4 (a intenção validada, o compare-and-set do baú e o harness) — 18/09/2026

O critério da Onda 6 é "2 a 4 clientes constroem, trocam, morrem e
reconectam sem duplicar nem perder, com 150 ms e 1% de perda simulados".
Esta etapa é o mecanismo que o prova e as duas autoridades que faltavam.

- **A intenção de golpe é validada pelo anfitrião** (`intencao.js`,
  puro): dano em (0, 40] (o teto da regra do banco), alvo existente,
  atacante com posição publicada e a menos de 10 blocos (criativo + folga
  da latência). O que não passa é contado (`golpesRecusados()`), não
  aplicado. A posição dos remotos passou a ser guardada fora do som da
  braçada (`posicaoDosRemotos`), que só existia com áudio.
- **O baú tem compare-and-set.** A entrada carrega `v`; o banco só aceita
  `v + 1` sobre o que tem (regra + emulador; mutante sem a condição: 1
  falha). O cliente sobe a versão por PUBLICAÇÃO (`versionar` em
  `entradaParaEnvio`), nunca por mudança (a fornalha muda 60× por segundo);
  os envios andam em fila POR CHAVE, um de cada vez, porque cada um é `v+1`
  sobre o anterior; recusado, desfaz os cliques da fila de trás pra frente
  (`fotoDoPrivado`: cursor e inventário — o baú vem da sala), conta, e relê
  a entrada (`getMobilia`). `publishMobilia` passou a responder
  aceito/recusado.
- **Forma fechada no que chega de fora**: `slotIn` recusa item inexistente
  e corta a pilha no teto do item. A fixture antiga do save usava
  `ironPickaxe`, chave que não existe — o teste passava com um item
  fantasma; agora é `iron_pickaxe`.
- **O harness**: `tests/unit/multijogador/redeSimulada.js` é um RTDB em
  memória com o MESMO contrato do composable (`rede` injetável): latência
  150 ms nos dois sentidos, perda de 1% só nas publicações de melhor
  esforço (posição, criaturas, relógio — as confiáveis não perdem, como no
  banco), quedas com `onDisconnect`, e as regras que importam (host-only,
  membro, CAS, sucessão, sala só o host apaga). `salaSimulada.spec.js`
  roda o composable DE VERDADE em 3 e 4 clientes: todos se veem e o
  relógio converge (<40 ticks); 60 edições de dois clientes chegam a
  todos; um pega do baú e todos convergem; DOIS pegam dentro da latência —
  um vence, o outro desfaz, o total fecha em 10; clique duplo em cima de
  um perdedor cai junto (sem a fila, o segundo sairia como v+2 sobre o v+1
  alheio e o banco ACEITARIA: 12 diamantes); golpe de perto entra e o de
  longe é recusado; quem cai some e volta na mesma semente; o anfitrião
  cai, o menor uid assume, publica relógio e criaturas, e o antigo volta
  convidado; o último a sair leva a sala; quatro clientes com 5% de perda
  fecham o total.

Medido: harness 10/10; intencao.spec 5; paineis 35; multijogador 41; room
32; mobilia 43; regras no emulador 92/92. Mutantes mortos: banco sem CAS
(2 cenários), recusa sem desfazer (2), envia sem esperar o anterior (o
clique duplo: total 8 ≠ 10), `versionar` não sobe (3), golpe sem
validação, todo mundo reivindica, relógio nunca acerta, regra sem o
`v + 1`; dez no unitário (validação de golpe por motivo, fila v+1, recusa
desfaz na ordem, forma fechada, `desfazer` não mexe no baú). roqueos-gate
12/12. Revisor vue-quasar aprovou.

Fora, com motivo: validar o ALCANCE da edição de bloco pede autor na
edição, e `blocks/{chunk}/{li}: number` é contrato com a regra e com quem
está na sala em versão anterior — fica para uma mudança de esquema com
migração. Apagar o baú (`null`) não passa pelo CAS (o banco não valida
remoção): quebrar um baú com base em estado velho ainda pode divergir.

O Firebase real com duas contas continua sem sonda: o harness prova o
composable e as regras; a rede de verdade, só a mão do founder.

### Fechamento do goal — 18/09/2026

Ondas 0 a 6 fechadas e em produção (último commit em produção: `6bc3ca51`,
build 2392; `version.json` e hash do bundle conferidos; smoke de produção
EXIT=0; `rules-e2e` em produção com 9 casos do RTDB como esperado,
inclusive o compare-and-set do baú).

**O que continua sem verificação, dito por nome:**

- Onda 5, critério "no toque": o fim do jogo por ações normais foi medido
  no desktop (sondas `fim`, `fortaleza`, `dragao`); no iPhone só há a
  evidência de montagem (`prod-mobile` em WebKit). Uma sonda que atravesse
  o portal e role os créditos por toque não existe.
- Onda 5, "altura variável por dimensão": decidido não fazer (o Fim cabe
  em 128); o registro existe e o render e o save não o usam.
- Onda 6: o Firebase real com duas contas; o alcance da edição de bloco
  (esquema); apagar o baú fora do CAS.
- Transversal: `ROSRoqueCraft.vue` em 2.404 linhas (teto 2.405), longe
  dos 1.500 do `GOAL-ESTRUTURA`. Cada onda saiu igual ou menor, nenhuma
  abaixou de verdade.
- Pendências de sonda: `fluxo.laminaBaixa` (mira instável), o flake do
  `ROSAppManager.spec` no gate (uma vez, 5.2), a guarda do escudo que ainda
  empurra o jogador, indicadores de carga do arco e de guarda no HUD,
  ícone do splash, cristais/sopro/ovo do dragão.
- Do founder: `sudo xcodebuild -license accept`; a chave morta
  `mp.skins.areia: 'undefined'` nos 10 idiomas (invisível, sem skin).
