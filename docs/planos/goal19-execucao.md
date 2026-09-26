# Goal 19 — vilas e castelos que o jogador queira olhar

O plano está em `goal19-vilas-e-castelos.md`. Este arquivo é a EXECUÇÃO: o que
foi medido, o que foi decidido, e o critério de pronto de cada onda.

## O bloqueador do bundle não existe — medido em 14/09/2026

O plano abriu dizendo que o teto de 1148 KB gzip com 1147.1 medidos deixava
0,9 KB e que qualquer onda estouraria. **Errado, e a medição é esta:**

```
sem-pagamento    index-BGy67qin.js=0  ROSRoqueCraft-COxddCal.js=1
sem-oferta       index-BGy67qin.js=0  ROSRoqueCraft-COxddCal.js=1
esgotada         index-BGy67qin.js=0  ROSRoqueCraft-COxddCal.js=1
```

`comercio.js` é quem `aldeia.js` importa, e os três literais dele estão no chunk
do jogo, não no entry. Os nomes dos símbolos não sobrevivem à minificação, então
a prova teve que ser por literal de string — foi o que separou "acho que está
lazy" de "está lazy".

`tests/unit/architecture/teto-do-bundle.json` mede `index-*.js`, o entry. O
RoqueCraft inteiro já é chunk separado de 438 KB, carregado só quando a janela
abre. **A vila pode crescer sem tocar no teto.**

O teto que VALE para esta rodada é outro: `tamanho-dos-componentes.json` trava
`ROSRoqueCraft.vue` em 2411 linhas e o arquivo tem 2409. Sobram DUAS. Toda a
lógica desta rodada mora em `src/services/roquecraft/`, e a fiação no componente
tem que caber em duas linhas ou a catraca reprova. Isso é feature, não
obstáculo: gerador de mundo não é assunto de componente de UI.

## A régua — onda 0

Sem régua, "está mais bonito" é opinião e a rodada termina em discussão. Duas
peças:

1. `scripts/qa-roquecraft-vila.mjs` — abre o jogo, teleporta para a aldeia da
   semente conhecida, fotografa de quatro ângulos em luz de dia e de noite.
   Foto não reprova nada sozinha; ela é o que o founder olha.
2. `tests/unit/services/roquecraft/vila-inventario.spec.js` — roda o gerador
   puro e CONTA o que a vila tem: blocos por tipo, fontes de luz, móveis,
   plantas, estruturas. Os números entram numa catraca
   (`tests/unit/architecture/inventario-da-vila.json`) que só sobe. Uma onda que
   não aumenta nada não entregou nada, e o teste diz isso.

Critério de pronto da onda 0: o inventário roda, os números da vila ATUAL estão
gravados, e um mutante — apagar a janela de `blocoDaCasa` — reprova o teste.

## Critério de pronto das ondas 1 a 5

Cada onda fecha com: inventário subindo na catraca, `roqueos-gate` verde com
saída colada, e teste de mutação no check novo daquela onda.

## Onda 9 — o minimapa (15/09/2026)

O founder voou o mapa inteiro e não achou vila nem castelo. Nada estava
quebrado: a onda 8 mediu uma vila a cada 1.183 blocos e um castelo a cada
1.411, e quem voa em linha reta passa longe de todos. O que faltava não era
densidade, era INSTRUMENTO — nada no jogo dizia para que lado.

### O que entrou

- `src/services/roquecraft/minimapa.js` — puro. Cor por bioma, sombreado de
  encosta com a luz do noroeste, peça de 32×32 px (64 blocos) para o cache,
  varredura de célula, marca de vila/castelo/ruína e projeção presa na borda.
- `src/components/roqueos/apps/roquecraft/RCMinimapa.vue` — o canvas, o relógio
  de ~9 Hz e os dois caches. Disco de 132 px no canto superior direito (108 no
  celular, abaixo dos três botões do `RCMobile`).
- `scripts/qa-roquecraft-minimapa.mjs` — a sonda que confere por PIXEL.
- Tecla **M** liga e desliga (`useRoqueCraftEntrada` + `TECLAS_DO_JOGO`), clique
  no disco faz o mesmo, e o estado vive em `settings.minimapa` — um dono só.
  Persiste no save; ausência do campo vale LIGADO.
- `controlsHint` ganhou "M mostra o mapa" nos dez idiomas: atalho que ninguém
  descobre é atalho que não existe.

### As decisões que custaram

**O mapa não pergunta ao mundo carregado.** Raio de render vai a 256 blocos,
menos de um quarto da distância entre duas vilas: um mapa de chunk carregado
mostraria sempre um campo vazio — a mesma resposta que a janela já dava. Tudo
sai do ruído puro (`terrainHeight`, `biomeAt`, `planoDaAldeia`,
`planoDoCastelo`), que responde de qualquer distância e concorda com o mundo
por construção. Mesma escolha, e mesmo motivo, de `qaDeAldeia.js`.

**Duas alturas de propósito.** O desenho usa `terrainHeight` (barato, e a
caverna sob o morro não muda a cor do morro); o PLANO usa `solidTopAt`, porque é
o que o `worldgen` usa para decidir onde a vila cabe. Trocar uma pela outra faz
o mapa marcar vila em terreno que o gerador recusa — e o jogador anda 1.400
blocos até uma vila que não existe. Tem teste, e o mutante morre.

**O espelho vivo da pose.** `useRoqueCraftPainel` escreve posição, yaw, semente
e dimensão num objeto `markRaw` POR QUADRO, ao lado dos refs reativos que
continuam a 4 Hz. A cadência de 4 Hz existe para não pôr o Vue a trabalhar
sessenta vezes por segundo desenhando um número que muda devagar — mas o mapa
não é um número: a 4 Hz ele anda em degraus de 250 ms.

**A semente vem do cliente do mundo, não do ref.** `worldClient` ganhou
`get semente()`. Depois de um `reset` os dois divergem, e ler o ref faria o mapa
desenhar, com toda a precisão, o mundo anterior. Fora do supermundo o mapa
mostra só a seta: relevo e vila são do gerador do supermundo, e desenhá-los no
Nether seria um mapa legível de um lugar que não é onde o jogador está.

**`v-model`, e não o objeto de ajustes mutado no filho.** A primeira versão
recebia `settings` inteiro e escrevia nele — cabia no orçamento de linhas e
`vue/no-mutating-props` reprovou, com razão.

**O orçamento do `ROSRoqueCraft.vue` era de UMA linha, não duas.** A catraca
conta `split('\n').length` e o `wc -l` conta uma a menos. A saída não foi
espremer linha: foi tirar a prop `:seed` e ler a semente de quem realmente sabe
dela. A restrição melhorou o desenho.

**A lista de biomas do castelo estava em três lugares** (worldgen em ids,
qaDeAldeia em nomes, e o minimapa ia ser o terceiro). Virou
`BIOMAS_DO_CASTELO` em `castelo.js`. É o mesmo defeito do endereço da frota
escrito na prosa: uma cópia envelhece e ninguém vê.

### O que foi medido

- `minimapa.spec.js`: 31 testes. **11 mutantes, 11 mortos.**
  ⚠️ Dois deles SOBREVIVERAM na primeira rodada: a lista de biomas trocada e a
  altura do plano trocada. O teste de coerência procurava a vila com
  `mundo.vilaEm` e conferia que `marcasDoMinimapa` a marcava — os dois lados
  saíam da MESMA função, erravam juntos e a suíte passava. O conserto foi montar
  o ORÁCULO à mão, repetindo a fiação do `worldgen`. Quem reimplementa a conta
  testa a própria conta; quem compara a conta consigo mesma não testa nada.
- Fiação: 3 mutantes (M fora da entrada, M fora de `TECLAS_DO_JOGO`, `!!` no
  lugar de `!== false`), 3 mortos.
- `qa-roquecraft-minimapa.mjs`: 3 afirmações, **3 mutantes, 3 mortos** —
  marca não desenhada (reprova por pixel), peça não gerada (90,2% de disco
  vazio), tecla M removida.
  ⚠️ A primeira versão contava a cor da vila no disco INTEIRO e deu 37 — todos
  das setas de borda, que são da mesma cor. A vila a 85 blocos podia estar
  apagada e a sonda passava. Agora ela mede o PIXEL onde a vila cai.
  ⚠️ E ela espera a CONDIÇÃO, não o relógio: com seis segundos fixos o disco
  vazio mediu 1,9% numa rodada e 4,9% na seguinte, na mesma build.
- Gate: lint 0 erros / 28 avisos pré-existentes, `format:check` verde, i18n
  sincronizado nos 10, bundle 1147,1 KB de 1148 com o hash da entrada INTACTO
  (o minimapa cai no chunk do jogo), `tests/unit/architecture` +
  `tests/unit/composables` 1.977 testes verdes,
  `tests/unit/services/roquecraft` 2.455 de 2.456 — a única falha é
  `glslSemCrase.spec.js`, EPERM de `unlink` em `node_modules/.cache` nesta
  máquina, arquivo fora do diff.

### O revisor aprovou, e estava errado

`vue-quasar-reviewer` leu o diff certo (confirmou o hash `2036e6cd`) e devolveu
**APROVADO sem um único achado** em 1.740 linhas. Zero achado é o mesmo sinal que
já custou uma rodada neste Goal, então a afirmação mais frágil dele foi conferida
à mão — e ele tinha deixado passar um defeito de verdade.

**O portão da dimensão cobria a geração e não o desenho.** `procurar` e
`gerarUmaPeca` estavam sob `noSupermundo`; o laço do `drawImage` das peças em
cache, não. O cache não esvazia ao trocar de dimensão, e o Nether vive em
coordenada dividida por oito — dentro do quadrado que o jogador acabou de
percorrer. O sintoma: um mapa de supermundo perfeitamente legível desenhado por
cima do Nether, com a seta do jogador andando nele. O comentário logo acima do
`if` prometia exatamente o contrário. **O revisor citou esse comentário como
prova de que estava certo.**

Nenhum teste de unidade alcança isso: o defeito mora entre um `if` e um laço,
dentro de um componente. O mecanismo é a sonda, que ganhou a quarta afirmação —
atravessa um portal de verdade e confere que no Nether o disco apaga. Medido:
34 pixels acesos (só a seta) contra 12.096 com o mutante. **4 mutantes na sonda,
4 mortos.**

E a travessia também trocou relógio por condição: com 3.500 ms fixos o jogador
ficava no supermundo sob a carga do mapa desenhando, e a quarta afirmação
reprovava por não ter medido nada.

⚠️ A lição, que é a mesma da onda inteira em outra roupa: **comentário não é
evidência, e veredito de revisor é medição — que também pode apontar para o
lugar errado.**
