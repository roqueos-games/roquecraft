# Goal 22 — O que o jogador vê, e o olho que faltava

Aberto em 19/09/2026, logo depois do Goal 21 e do incidente dos postes de luz.

## 1. Por que este goal existe

Em 18/09 o founder disse "os postes de luz estão todos bugados". A lanterna saía
como cubo cheio com textura recortada e virava uma caixa de vidro oca. O conserto
foi de uma tarde; o que interessa é **por que ninguém viu antes**, e a resposta
aparece duas vezes na mesma frase:

1. **Nenhuma sonda olha uma peça de perto.** A sonda da cidade fotografa a praça
   de longe, e de longe a caixa oca lia como lanterninha. O defeito viveu desde
   o Goal 19.
2. **O jogo calcula estado que o jogador não enxerga.** O arco carrega e a carga
   decide o dano — sem indicador. O escudo levanta a guarda — sem indicador. A
   poção arremessável é outro item — com o ícone da poção normal.

Os dois são a mesma doença: **coisa que existe e não se vê**. É a irmã do "item
morto" (existe e não se alcança), que já tem guarda desde a onda 4 do Goal 20.

Este goal fecha as lacunas de feedback visível e constrói o olho que teria pego
a lanterna no dia em que ela nasceu.

## 2. O método, igual ao do Goal 21

Cada etapa: serviço puro → teste + **mutação** → suíte inteira → gate → revisor →
commit/push → build → sonda → deploy → **produção conferida por hash** → registro
neste arquivo. Etapa que não muda `src/` não pede deploy nem revisor de stack (a
regra do gate é "só se tocou").

## 3. As ondas

### Onda 0 — o olho (mecanismo primeiro, como manda a casa)

| #   | etapa                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0.1 | Sonda **`pecas`**: folha de contato das peças de forma livre, fotografadas de PERTO (2 a 3 blocos), num platô limpo, de dia e de noite, uma por quadro |
| 0.2 | A mesma sonda AUDITA a geometria: caixa dentro da célula, face interna nunca `naBorda`, peça não-cubo que virou cubo                                   |

**Critério:** a folha de contato mostra tocha, lanterna, cerca, portão, alçapão,
porta, cama, laje e escada, cada uma identificável; e a auditoria reprova sozinha
se qualquer peça perder a forma. Entra no ledger com veredito.

### Onda 1 — o HUD conta a verdade

| #   | etapa                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------ |
| 1.1 | **Carga do arco** no HUD: o jogo já calcula `cargaDe`; o jogador atira no escuro                                   |
| 1.2 | **Guarda levantada** no HUD: `guardaLevantada` existe e é invisível                                                |
| 1.3 | **Splash se distingue da poção normal** no ícone, derivando do ícone que já existe (sem arte nova: ver a seção 3b) |

**Critério:** os três estados aparecem e somem na hora certa, medidos por sonda
no jogo — não só por teste de unidade.

### Onda 2 — o escudo honesto

| #   | etapa                                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------- |
| 2.1 | Golpe **aparado** não empurra o jogador. Hoje a guarda corta o dano e o empurrão passa inteiro — medido em 18/09 |

**Critério:** sonda mede a posição antes e depois de um golpe aparado e de um
golpe não aparado; o aparado não desloca (ou desloca muito menos), o outro sim.

### Onda 3 — limpeza com mecanismo

| #   | etapa                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------- |
| 3.1 | Matar `mp.skins.areia: 'undefined'` nos 10 idiomas, e **guarda** que reprova chave de skin sem skin no catálogo (e o contrário) |

**Critério:** o guarda reprova quando a chave morta volta, e quando uma skin nova
nasce sem tradução.

### Onda 4 — estrutura, que nenhuma onda baixou de verdade

| #   | etapa                                                                                                      |
| --- | ---------------------------------------------------------------------------------------------------------- |
| 4.1 | Extrair um bloco COESO do `ROSRoqueCraft.vue` (2.404 linhas, teto 2.405) e **descer a catraca** de verdade |

**Critério:** o arquivo cai pelo menos 150 linhas, a catraca desce junto, e nada
que saiu vira "mudança de endereço" — o que sair ganha teste próprio.

## 3b. Onde parar e perguntar, mesmo em loop

Herdado do Goal 21, com um item a mais:

1. **Arte NOVA** — a liberação de 18/09 cobriu porta, alçapão, portão, armadura,
   arco e escudo. A 1.3 **deriva** do ícone de poção que já existe (marca de
   canto/tinta), não inventa desenho. Se precisar de desenho novo, paro.
2. **Dependência nova no `package.json`** — nenhuma autorizada.
3. **Apagar ou mover o que não é meu** — listar e mostrar antes.
4. **Gate vermelho que eu não explico** — relato, nunca `--no-verify` calado.
5. **Mudança de mecânica que o founder não pediu** — a 2.1 é conserto de defeito
   medido, não regra nova; se virar "rebalancear o combate", paro.

## 4. O que NÃO entra

- Cristais, sopro e ovo do dragão (conteúdo novo; o Goal 21 já disse que ficou de
  fora com motivo).
- Sonda de toque do fim do jogo (Onda 5 do Goal 21): precisa de emulação móvel de
  ponta a ponta e é goal próprio.
- Firebase real com duas contas (Onda 6 do Goal 21): precisa de segunda conta.
- `fluxo.laminaBaixa` e o flake do `ROSAppManager.spec`: medição instável, não
  defeito de jogo. Ficam registrados, não entram.
- Rebalancear dano, alcance ou economia.

## 5. Registro das etapas

### Onda 0 (a folha de contato das peças) — 19/09/2026

A sonda `qa-roquecraft-pecas` planta cada peça de forma livre num pedestal de
pedra, põe a câmera **na altura dela** a 3 blocos, e fotografa um recorte de
420×420 no centro do canvas, de dia e de noite. Nove peças: lanterna, tocha,
cerca, portão, alçapão, porta, laje, escada e bambu. O gancho `formaDoBloco`
entrou em `qaDeTerreno` pra a sonda ler a MESMA `CAIXAS_DE_BLOCO` do render em
vez de reimplementar a tabela.

**O veredito mecânico de geometria não existe, e isso foi MEDIDO.** Tentei três
asserções em cima de diferença de pixel; as três sobreviveram ao mutante:

1. "a silhueta é mais estreita que a do cubo" — plantar QUALQUER bloco muda
   ~45 mil pixels (remesh e luz do chunk, nuvem, folhagem). Tocha, cerca, laje
   e escada deram todas entre 0,63 e 1,0 da referência.
2. "a peça difere de um cubo liso" — mutante: cerca sem faces próprias, virando
   cubo cheio. Passou verde com 31.799 px de diferença, porque o check
   comparava TEXTURA: um cubo de tábua difere de um de pedra sempre.
3. "a peça aparece na tela" — mutante: lanterna com zero faces. Passou verde
   com 53.180 px, porque a lanterna EMITE LUZ e a cena muda sem geometria.

Então a sonda é folha de contato, na categoria que o próprio
`sondas-com-veredito.spec.js` já descreve ("exigir veredito dela seria pedir que
a foto se julgasse sozinha"). O que ela afirma e pode reprovar é fato do MUNDO,
não inferência de pixel: a câmera está na célula (erro de mira medido por
`criarMirar`) e cada peça foi mesmo plantada (`blockKeyAt` responde a chave).
Mutante disso — tirar o `fill` — reprova com EXIT=1 em todas as nove: sem essa
linha a folha fotografaria célula vazia e chamaria de lanterna.

Duas correções de instrumento no caminho, as duas achadas medindo: a câmera
mirava DEPOIS de plantar (a tela inteira mudava entre as fotos, e a referência
"media" 1007 de 1024 px de largura), e a foto era a tela cheia (a peça saía do
tamanho de um respingo no meio da mata). Mira antes e uma vez; recorte no
centro. O revisor achou um terceiro: `altura: undefined` no relatório, porque
`silhueta` devolve perfil de coluna e não caixa envolvente.

Medido: sonda 11/11, ledger 102 verdes e 2 humanas, roqueos-gate 12/12, revisor
vue-quasar aprovou depois do conserto do campo undefined.

**Continua sem verificação, por nome:** o veredito mecânico de GEOMETRIA. Ele
pede outro instrumento — auditar a MALHA gerada, não o pixel da tela — e é
trabalho próprio, não remendo nesta sonda.

## Registro — Onda 2, o escudo honesto (19/09/2026)

O defeito: a guarda cortava o DANO e o empurrão passava inteiro. O jogador via
a pancada bater no escudo e voava do mesmo jeito. Nenhum teste de unidade via,
porque o dano medido estava certo — quem empurra é o mundo, não o corpo.

A correção: `machucar` devolve `{ aparado, aplicado }`; `aparado` só na aparada
CHEIA (escudo). A mão vazia corta metade, não é aparada, o tranco continua. Os
três sítios que empurram o jogador (flecha, explosão, golpe de criatura) leem
esse campo.

Mecanismo: a sonda `qa-roquecraft-escudo` ganhou o caso 8, que mede o
DESLOCAMENTO do jogador com e sem guarda contra um zumbi de verdade — `kx`/`kz`
decaem em ~0,4 s e uma leitura de velocidade daria zero nos dois lados.

Medido em 19/09/2026: sonda 12/12 (sem guarda andou 2,76 e perdeu 6 de vida;
com escudo andou 0,80 e a vida não caiu). Suíte 901 arquivos / 11.202 testes.
Ledger 102 verdes, 2 humanas. roqueos-gate 12/12. 9 mutantes mortos, incluindo
o portão removido NO JOGO (sonda EXIT=1, 2,76 dos dois lados). Commit 73c0dd7d,
produção build 2397, sha do bundle do jogo confere com o local.

Duas armadilhas da própria sonda, achadas antes do commit: `teleport` liga o
voo (as duas fases davam `andou: 0`) e a fase sem guarda zerava a vida antes da
fase com guarda. Hoje ela cura pelo caminho do jogo antes de cada fase e exige
vida ≥ 15 nas duas.

Revisor vue-quasar: 3 desvios, 2 acatados (JSDoc de `ctx.machucar` no gancho de
QA; `tomarEfeito('dano')` sem teste nenhum) e 1 rejeitado — ler o retorno de
`machucar(pontos, 'magic')` não faz falta onde não há empurrão.

NÃO MEDIDO: aparada em multijogador. O convidado não simula, e o tranco do
espelho não passa por este caminho.

## Registro — Onda 3, a skin que não existia (19/09/2026)

`roqueCraft.mp.skins.areia` existia nos dez idiomas com o valor literal
`'undefined'` — a string, não o valor. Nenhuma skin `areia` em `skins.js`. Fora
nos dez.

Por que nada acusava: o gate de chaves i18n compara os dez idiomas ENTRE SI, e
a órfã estava nos dez; e o `RCLobby.vue` monta três rótulos por TEMPLATE
(`mp.skins.${s.id}`, `mp.${mp.error}`, `mp.${mp.mode}`), e chave montada em
tempo de execução não aparece em varredura de chave literal.

Mecanismo: `tests/unit/architecture/lobby-i18n-por-template.spec.js` cruza os
dois lados na mão. Lê o MÓDULO, não o texto do arquivo — a primeira versão
usava regex e parava no primeiro `}`.

Medido em 19/09/2026: 7 mutantes mortos, suíte 901/11.202, gate 12/12. Commit
c02c5f72, produção build 2398.

Os dois últimos casos (erros e modos do lobby) entraram por achado do revisor, e
não eram hipótese: `mp.error` já carrega quatro valores e nenhum tinha guarda.

NÃO MEDIDO: as outras chaves montadas por template fora do lobby (comércio,
biomas, efeitos). O teste é do lobby de propósito.

## Registro — Onda 4, a entrada no mundo sai do componente (19/09/2026)

Duas extrações coesas, cada uma com teste próprio:
`useRoqueCraftAbertura` (menu em órbita, pousar, esperar o chunk, começar do
save, mundo novo, e a amarração da política de nascimento com o mundo vivo) e
`useRoqueCraftQualidade` (`applySettings` + `rebuildEngine`: o motor que morre e
nasce). Nenhuma das duas tinha teste, e o endereço era a razão.

Todos os `let` entram por par [ler, pôr]; as regras puras, por injeção.

O guarda `nascimentoChamadas.spec.js` foi ATRÁS do endereço novo — agora cobre
três arquivos e exige que a amarração fale com o mundo VIVO.

Medido em 19/09/2026: componente 2.404 → 2.291, catraca 2.405 → 2.292. Suíte 905
arquivos / 11.232 testes. Gate 12/12. 12 mutantes mortos. Sondas do caminho de
entrada no jogo: enterrado, entrada, menu-usavel, nascer, escudo, criativo —
todas verdes. Commit d1caedd3.

Um mutante SOBREVIVEU na primeira tentativa (o corte por `cancelado` na espera
do chão): o teste media o `false` e o limite era 9 s, então o tempo esgotando
dava o mesmo resultado. Agora mede o relógio.

NÃO BATEU A META: a onda pedia 150 linhas e desceu 113. O que sobra no
componente ou é fiação (payload do save, gancho de QA — tabelas que só mudariam
de endereço) ou é ciclo de vida. Forçar as outras 37 seria o que o critério da
onda proíbe.

Revisor vue-quasar: 4 desvios, 1 rejeitado (`pontoDeRetorno` é arrow sobre a
VARIÁVEL `noiseCtx`, não uma foto dela) e 3 acatados como um só: a
inconsistência do `?.` no leitor de blocos, fechada sem meia-defesa e com o
contrato escrito.

## Registro — Onda 1, o HUD conta a verdade (19/09/2026)

Defeito de SILÊNCIO, não de cálculo. `entidades.cargaDoArco()` existia, era
calculada a cada quadro e consumida por ninguém: o jogador puxava a corda no
escuro, e o arco é a única arma em que a espera muda o tiro.
`corpoDoJogador.guardaLevantada()` existia e só o gancho de QA lia — a única
prova de que a guarda estava de pé era levar pancada e não perder vida. E a
poção de arremesso era pixel por pixel igual à de beber: a diferença ficava no
rótulo que só aparece ao passar o mouse, num jogo que se joga com a mão na
hotbar e o olho na tela.

A mira virou `RCMira.vue` com quatro recibos (carga do golpe, crítico, carga do
arco, guarda) e `useRoqueCraftIndicadores` devolve o estado reativo, escrevendo
só quando muda — roda 60×/s. A marca do borrifo é derivada por CSS, no canto
livre do slot: arte nova está congelada e não foi pedida.

Mecanismo: sonda `qa-roquecraft-mira` mede os três mostradores no DOM do jogo
rodando, e não as props.

Medido em 19/09/2026: sonda 13/13 (a barra cresce de 3,6 px para 24 px com a
corda, acende só cheia, some quando a flecha sai — com sanidade de que a flecha
saiu mesmo). Suíte 906 arquivos / 11.245 testes. Ledger 103 verdes, 2 humanas.
Gate 12/12. 8 mutantes mortos na unidade e 2 NO JOGO (`:guarda="false"` e a
carga do arco fixada em 1, os dois com EXIT=1). Catraca do componente não
subiu: 2.291, teto 2.292.

Revisor vue-quasar: 1 desvio, e ele era artefato do material que EU mandei — o
`ROSRoqueCraft.vue` no staging era o da onda 4, sem a fiação da mira. Conferido
no arquivo real: importa e renderiza `RCMira`, e nenhuma classe antiga sobrou.
Os outros cinco pontos (tokens, primitivos, acessibilidade, props, órfãs) foram
verificados e passaram.

NÃO MEDIDO: nada disto foi visto em aparelho de verdade — a sonda roda em
Chromium no desktop. O tamanho dos alvos no celular e a legibilidade da barra
de 26 px numa tela de 5 polegadas continuam sem evidência.

## 6. Fechamento do Goal 22 — 19/09/2026

As cinco ondas estão fechadas e em produção, cada uma conferida por hash do
bundle do jogo contra o local:

| onda | o que fechou                                                 | commit     | produção   |
| ---- | ------------------------------------------------------------ | ---------- | ---------- |
| 0    | a folha de contato das peças                                 | `36a13dfe` | build 2396 |
| 2    | o escudo honesto (o tranco que a guarda não segurava)        | `73c0dd7d` | build 2397 |
| 3    | a skin que não existia tinha nome nos dez idiomas            | `c02c5f72` | build 2398 |
| 4    | a entrada no mundo e a troca de qualidade saem do componente | `d1caedd3` | build 2399 |
| 1    | o HUD passa a contar o que o jogo já sabia                   | `e182872a` | build 2400 |

A ordem executada não foi a escrita: a onda 1 precisava de espaço no
componente, que estava a UMA linha do teto, e a onda 4 é que abriu esse espaço.
Foi o próprio goal que descobriu a dependência.

**Números finais.** Suíte 906 arquivos / 11.245 testes. Ledger 103 sondas verdes,
2 humanas. roqueos-gate 12/12 em cada onda. 36 mutantes mortos ao todo, 3 deles
NO JOGO (sonda com EXIT=1). Componente 2.404 → 2.291 linhas, catraca 2.405 →
2.292.

**O que este goal aprendeu, e vale mais que as ondas:**

1. **Diferença de pixel não prova geometria.** Três asserções mecânicas
   sobreviveram ao mutante na onda 0, e a honesta foi apagar as três e registrar
   a folha de contato como humana. Um veredito de forma precisa de auditoria de
   malha, não de tela.
2. **Um check que mede o resultado certo pelo motivo errado passa igual.** Dois
   mutantes sobreviveram nesta sessão — o corte por `cancelado` (medi o `false`,
   e o tempo esgotando dava o mesmo `false`) e as três da onda 0. Nos dois casos
   o conserto foi mudar O QUE se mede, não afrouxar.
3. **Sanidade primeiro, sempre.** Metade dos casos novos desta sessão ganhou uma
   asserção anterior à medida ("o zumbi nem bateu", "a flecha não saiu", "a fase
   começou sem vida"). Três delas já pegaram um caso passando por omissão antes
   do commit.
4. **Chave montada por template não tem quem a cubra.** É a classe do defeito da
   onda 3, e o guarda novo cobre só o lobby. Comércio, biomas e efeitos montam
   chave do mesmo jeito e continuam descobertos.

### O que fica sem evidência

- **Nada disto foi visto em aparelho de verdade.** As sondas rodam em Chromium
  no desktop. O tamanho dos alvos no celular e a legibilidade da barra de 26 px
  numa tela de 5 polegadas continuam sem medida — e a regra da casa é explícita:
  verde no desktop não é verde no iPhone.
- **Aparada em multijogador** (o convidado não simula; o tranco do espelho não
  passa por este caminho).
- **Veredito mecânico de geometria de peça** — precisa de auditoria de malha.
- **As chaves montadas por template fora do lobby.**
- A onda 4 pedia 150 linhas e desceu 113, com o motivo escrito no registro dela.
