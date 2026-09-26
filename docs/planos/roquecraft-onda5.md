# RoqueCraft — onda 5

Pedido do founder, 13/09/2026, textual:

> Gostei! Pode fazer todos! Crie um goal e entre em loop e só pare quando fechar
> todos os próximos passos! E eu quero cachoeiras em montanhas também! Precisamos
> também garantir o carregamento nos sons, porque tem vezes que o jogo começa
> mudo

Seis frentes. Cada uma fecha com: regra pura em módulo próprio, teste ao lado com
teste de mutação, sonda no jogo rodando quando a mudança é visível ou audível,
gate, commit, push e deploy medido.

## 1. Som que às vezes começava mudo — FECHADO (commit `ee68d196`)

O gesto que ABRE o jogo era gasto antes de os ouvintes de destrave entrarem no
ar, porque eles só se registravam depois do `boot()` assíncrono. Medido:

    gesto antes do boot → banco=0 musica=0 pico −46,8 dBFS
    depois do conserto  → banco=88 musica=5 pico −5,5 dBFS

Sonda `qa-roquecraft-som-arranque`. Mutante reprova com 4 falhas.

## 2. Cachoeiras em montanhas — FECHADO (commit `ec40347a`)

O relevo não tem paredão: em 160.801 colunas da semente 1337, o maior desnível
para o vizinho imediato dentro do bioma de montanha é 4 blocos, em 8 colunas das
7.290 — o típico é 1. `cachoeira.js` exige coluna contígua de 3. Fonte solta ali
seria riacho em degraus de um bloco, sem som e sem borrifo.

Então a queda é esculpida junto com a nascente (`cachoeiraDeMontanha.js`), e a
água é escrita inteira — a fila de atualização é reativa e ninguém varre chunk
recém-gerado atrás de líquido.

Critério: o PONTO FIXO da regra dos fluidos. Três sementes, 33×33 chunks cada:
73 colunas caindo, todas de altura 8, zero células que a regra mudaria.

No jogo: leito `amb.cachoeira` 0,214 perto e 0,000 longe; 17 gotas de borrifo
perto e 0 longe. Sonda `qa-roquecraft-cachoeira`.

## 3. Dimensões — EM ANDAMENTO

O plano de 12/09 pôs Nether e End na onda 6, atrás da trava T2 ("uma dimensão,
128 de altura, tudo literal"). **Discordo de uma parte, com número:** a altura
não é o que barra, porque o Nether também tem 128 — o caminho quente
(`localIndex`, mesher, luz) continua valendo sem uma linha de mudança. E o
espaço de id, medido em 13/09, tinha 60 livres de 255 antes desta fatia. O que
realmente faltava da T2 era `dimensionId`, que é a parte barata. Altura variável
por dimensão segue aberta, e é o End que vai cobrar.

### 3a. O Nether existe, gerado — FECHADO

Registro ganhou `nether` (mar de LAVA em 31, sem céu, teto indestrutível), mais
dois campos validados: `liquidoDoMar` e `tetoIndestrutivel`. Quatro blocos novos
(netherrack, areia das almas, minério de quartzo, magma) com textura
procedural, e o item quartzo.

`netherWorldgen.js` é o NEGATIVO do overworld: o volume inteiro é rocha e o
ruído abre nele. Três defeitos de palpite morreram de medição e estão travados
em teste: `fbm2` tem sinal (buraco no teto do mundo), o limiar "quase metade"
abria 17% (portal para dentro de rocha), e sem viés de altura tudo que abre
abaixo de 31 vira lava (oceano sem margem). Seis mutantes, seis reprovados.

**Ninguém alcança o Nether ainda:** não há portal nem troca de dimensão. Os
blocos estão no catálogo e o gerador roda, e é só isso que está afirmado.

### 3b. Portal — FECHADO

A moldura se RECONHECE a partir do ponto aceso; o canto fica fora do anel, como
no original. O corte que eu quis pular: medir não é verificar — a busca acha os
limites por uma linha e uma coluna, e sem conferir o anel inteiro uma moldura
furada vira portal que sobra para fora da pedra. E o portal apaga quando a
moldura quebra, senão fica pendurado no ar e atravessável.

Isqueiro fecha a corrente sem atalho: cascalho → pederneira, ferro → lingote,
bancada. Cinco mutantes na regra, cinco reprovados.

### 3c. Travessia — FECHADO (sem gravar o Nether)

O destino é calculado ANTES de o mundo trocar, gerando o terreno de chegada sob
demanda com o mesmo gerador puro do worker: a travessia é síncrona e não depende
de quanto o worker adiantou. Razão 1:8 no plano, Y não se divide. O portal de
chegada é CONSTRUÍDO — sem ele o jogador fica preso do outro lado.

Dois defeitos que só a sonda no jogo achou, e nenhum deles aparece lendo o
código:

- o guardado é array e o leitor quer mapa: explodiu só na VOLTA, porque na ida o
  destino ainda não tinha nada guardado e o `?.get` passava batido
- a imunidade de chegada caía sozinha: logo depois da troca o chunk do pouso
  ainda não voltou do worker, `getBlock` responde AR, e a regra lia isso como "o
  jogador saiu do portal". A sonda FILMOU o pêndulo — nether, overworld, nether,
  overworld a cada 1,2 s com o jogador parado — e a sonda estava VERDE, porque
  ela só olhava o começo e o fim

**O Nether não é gravado ainda.** O save tem UM mapa de edições, e gravar
estando lá escreveria a caverna por cima do mundo do jogador. A quinta porta do
save recusa fora do overworld; construir no Nether vale pela sessão. Edição por
dimensão no save é a fatia 3e, e ela pede fixture v8 real.

**Não se atravessa em sala.** A sala publica edição por quadro e todos leem do
mesmo mapa.

### 3e. Save com edição por dimensão — FECHADO (v10)

O save ganhou `outrasDimensoes`. A dimensão onde o jogador está enche o teto
primeiro e as outras dividem a sobra — o teto de 240.000 números não dobrou por
existir uma segunda dimensão, ele é o que o documento aguenta. Save v9 abre sem
perda: sem o campo, lista vazia, e quem gravou estava no overworld.

A quinta porta do save (recusar gravação fora do overworld) viveu um commit e
saiu: ela existia porque havia um mapa só.

Medido no payload REAL, pela mesma função que o autosave usa: `dimensao
overworld, 296 números aqui, outras dimensões [["nether",236]]`. Cinco mutantes
no save e um na travessia, todos reprovados.

### 3d. Céu e luz do Nether — FECHADO

A paleta e o aparelho de luz do overworld são função de `ticks`. Debaixo de um
teto de bedrock isso faria a MESMA cena mudar de humor conforme a hora de um dia
que não existe ali. `ceuDaDimensao.js` deixa o overworld intacto e dá ao Nether
um céu PARADO: zênite mais escuro que o horizonte (em cima é rocha, não
abóbada), névoa vermelha e curta, direcional fraca vinda de cima, zero estrelas.

O teste pegou na primeira rodada uma cópia rasa que PARECIA funda: `directional`
era copiado, mas `dir` continuava sendo o mesmo objeto — e é exatamente esse que
o consumidor normaliza por quadro. A luz do Nether iria girando sozinha.

Medido no jogo, do grafo da cena e não de screenshot: névoa `#783c38` no Nether
contra `#b7acb7` no overworld, e ela volta ao atravessar de novo. Cinco mutantes
na regra e um na fiação (o engine ignorando a dimensão), todos reprovados.

## 4. Redstone — FECHADO (fio, tocha, alavanca, lâmpada)

A energia não se propaga célula a célula: a REDE inteira se recalcula. O caminho
intuitivo ("meu vizinho tem 12, logo eu tenho 11") funciona ao ligar e falha ao
DESLIGAR — um fio em anel continua se alimentando, cada célula se justificando
com a vizinha, para sempre.

A tocha é o inversor, e é só por causa dela que existe lógica. O teste pegou na
primeira rodada que ela energizava o PRÓPRIO suporte: lia o suporte como
energizado, se mandava apagar, e apagada o suporte ficava sem energia e ela se
mandava acender — um oscilador de um tique que ninguém pediu.

⚠️ A trava "T2 — tick de mundo" que o plano listava para redstone já estava
resolvida desde a agricultura: a fila de atualização É o tique. O que faltava era
acordar o vizinho do VIZINHO — a tocha espetada no bloco ao lado do fio é
diagonal a ele, e a fila só acorda os seis vizinhos.

Oito mutantes, e um deles (fila virar pilha) SOBREVIVEU e mostrou que minha
justificativa estava errada.

## 5a. Encantamento — FECHADO (commit `dc62fcc4`)

O plano de 12/09 dizia, com estas palavras: "XP: acumula e tem barra | falta:
NENHUM CONSUMIDOR". A mesa é o primeiro consumidor.

Três encantos, escolhidos porque cada um tem um ponto EXISTENTE onde entra —
guardar `{eficiencia: 2}` no item sem mudar nada no jogo seria a mesma barra que
não paga, uma camada abaixo: `eficiencia` no tempo de quebra, `afiacao` no dano
do golpe, `inquebravel` no gasto de durabilidade.

A mesa não abre tela, e isso é decisão: tela pediria slot de item, lápis-lazúli
e três ofertas sorteadas, e nada disso morde em lugar nenhum. O clique encanta o
que está na mão, cobra, e avisa.

Medido no jogo (`qa-roquecraft-encanto`):

    sem nivel            nivel 0 → 0    encantos {}
    com nivel            nivel 40 → 28  encantos {"inquebravel":2,"eficiencia":1}
    quebra da pedra      limpa 395ms    eficiencia III 152ms
    gasto em 12 quebras  limpa 12       inquebravel III 4

Dois mutantes na fiação, um por mordida, cada um reprovando só na sua linha.

### O i18n do jogo saiu do bundle de entrada

O build reprovou em +1,6 KB e a causa não era a fatia: `src/i18n/index.js`
importa os dez idiomas estaticamente, e os ~300 textos × 10 línguas do RoqueCraft
(120 KB brutos) viajavam no `index-*.js` que TODO visitante de /app baixa. Mesma
conta do Goal 16 com as páginas públicas, uma pasta adiante.

    teto do bundle  1181 → 1146 KB gzip, JÁ COM os textos novos da fatia

A catraca cobra o peso e cobra tarde, no build. A guarda nova
(`roquecraft-i18n-preguicoso.spec.js`) cobra a causa em milissegundos. Cinco
mutantes — e o da carga descendo pra depois do `boot()` precisou de duas
tentativas, porque a primeira não chegou a mudar o arquivo e eu quase contei um
sobrevivente que não existia.

Catraca de tamanho do componente: 2468 → 2464, por três extrações de verdade
(`cliqueNaMobilia`, `cliqueNoInventario`, `aplicarPickBlock`) — decisão pura
presa no componente, e por isso sem teste nenhum até hoje.

## 5b. Poções — FECHADO (commits `1f338682` e `8e9cd81f`)

Duas fatias, e a ordem importa: primeiro o que MORDE, depois o caminho até ele.
Efeito que não muda nada no jogo é a barra de XP que não paga, uma camada
abaixo — e um caminho até um efeito que não existe não é caminho.

### Os efeitos (`1f338682`)

Sete efeitos, cada um escolhido por ter um ponto EXISTENTE onde entra:
velocidade e lentidão no multiplicador de passo da física, força na base do
golpe (ao lado da afiação, SOMANDO — um `if` faria a poção parecer quebrada pra
quem já tem espada afiada), regeneração e veneno no tique de `stepSurvival`,
respiração no consumo de fôlego, cura e dano instantâneos.

E `efeitos.js` não conhece nenhum deles: guarda nome, nível e prazo. Quem morde
é quem tem o ponto.

Três regras com teste: renovar é o MAIOR prazo e nunca a soma; velocidade e
lentidão se cancelam pela MESMA conta (com `if`, a poção ruim vira
interruptor); o veneno para em 1 de vida e NÃO mata.

    3 s andando         sem efeito 14,10  velocidade II 19,74  lentidao II 9,87
    veneno II, 9 s      vida 20 → 13  vivo true
    prazo de 2 s        ["forca"] → []

14,10 em 3 s é exatamente WALK_SPEED, e isso importa: a primeira versão da sonda
mediu 39 e ficou VERDE. Era `FLY_SPEED` — `teleport` liga o voo pra enquadrar
cena, e ela provava a mordida no ramo errado da física. A medida agora tem teto
além de piso.

Save v11. Onze mutantes de unidade e um de fiação, todos reprovados.

### A fermentação (`8e9cd81f`)

    água + verruga → estranha → (açúcar | melancia | olho | peixe | magma)
    e o olho fermentado CORROMPE poção pronta em lentidão e dano

A água não vira poção direto, e é esse degrau que dá função à verruga — que só
nasce na areia das almas do Nether. Nenhuma poção existe sem a viagem entre
dimensões: foi o que transformou a dimensão de cenário em destino.

    suporte   water_bottle → pocao_estranha → pocao_velocidade
    beber     efeitos ["velocidade"]  na mao glass_bottle

Doze mutantes — e um SOBREVIVEU na primeira rodada, mostrando que meu teste era
decoração: eu somava 0,1 duzentas vezes "porque isso dá 19,999…". Dá
20,000000000000014. Onze passos que dividem 20 caem abaixo por ponto flutuante,
e dois deles são tempos de quadro reais.

Fora nesta fatia, e escrito em vez de descoberto: pó de blaze como combustível
(o mob não existe), glowstone e redstone (24 itens por um modificador), e o
plantio da verruga (o ciclo da lavoura por uma planta de uma dimensão só).

Quatro portões do repo pegaram erro meu, e os quatro estavam certos:
`atlasAlinhado` (nome de textura de bloco num campo de sprite de item),
`itens-mortos` (a fermentação faltava na conta de alcance), `cores-cravadas` e
`netherWorldgen`. E o teste novo achou o pior: `water_bottle` tinha
`contem: 'water'` por simetria com o balde, e `contem` é o campo que faz um item
SER balde — a garrafa cheia DESPEJAVA um bloco de água no mundo.

## 5c. Poções arremessáveis, nível II e prazo dobrado — ABERTO

`efeitos.js` já aceita nível e prazo; o que falta é quem os compre (glowstone e
redstone no suporte) e a garrafa que se joga.

## 6. Aldeias e comércio — FECHADO (commit `7ac8d6a4`)

**Terceira vez que este jogo tem um recurso que não paga**, e a terceira com a
mesma forma. Medido no catálogo em 13/09: `emerald` aparecia em ZERO receitas e
ZERO fundições. O jogador achava o minério mais raro do mundo e a pedra verde
não comprava nada — a barra de XP antes da mesa, a poção antes do suporte, mais
uma vez.

O aldeão COMPRA o que o jogador produz e VENDE o que ele não consegue fazer, e
são os dois lados juntos que fazem economia: com um lado só, cada profissão é um
beco. As quatro existem por uma ponta solta — fazendeiro (o excedente da lavoura
era lixo), ferreiro (quem joga em cima da terra não chegava a ferramenta boa),
bibliotecário (abre a mesa sem passar por cana e couro), clérigo (a fermentação
para quem ainda não foi ao Nether).

### A primeira ESTRUTURA deste mundo

Mesmo problema da cachoeira, mesma solução: `runFeatures` roda para os nove
chunks vizinhos, então só dado globalmente puro decide. Não há `rnd()` em
`aldeia.js` — tudo sai de `hash3` da coordenada e da semente. O bioma também é o
do CENTRO: por coluna, a aldeia na borda nasceria com metade das casas.

Medido no mundo gerado (semente 1337), e o jogo bate com o gerador puro:

    tabua 580  pedregulho 245  vidro 15  caminho 169
    moradores 5 — fazendeiro, ferreiro, bibliotecario, clerigo
    tela de mao vazia   abriu (3 ofertas)
    troca               paga 40→20  recebe 0→1
    troca sem pagar     0 → 0

580 é a conta exata de cinco casas de 7×7. Duas recusas de projeto, escritas no
código: o aldeão não dropa nada e não dá XP (senão o jogo ensina a matar a aldeia
em vez de mantê-la), e o estoque não é infinito (aí a esmeralda deixa de valer).

### O teste do composable pegou o que a sonda não pegaria

`aldeaoAberto` era `ref(null)`. Um `ref` fundo embrulha o mob num `Proxy`, e o
`m === aberto.get()` do passo de estoque nunca casaria com o objeto cru da lista
de criaturas: a tela aberta jamais redesenharia quando o estoque voltasse. A
sonda não veria — ela mede a troca, e a troca funciona (o proxy escreve
através). O que quebrava era só o redesenho, dois minutos depois. Virou
`shallowRef`.

E a sonda pegou dois erros DA SONDA: mirava na horizontal enquanto `teleport`
sobe o jogador (120 miras vazias, e o relato teria sido "o comércio não abre"), e
reimplementava a convenção de yaw do jogo. Agora o pitch é geometria calculada e
o yaw é varrido — quem responde pela convenção é o raycast do jogo.

Dezessete mutantes, dezessete reprovados, mais um de ponta a ponta: pôr o degrau
do comércio depois do `held` faz a sonda reprovar — é ele que permite clicar no
aldeão de mão vazia, que é como o jogador chega na aldeia.

Catraca: 2464 → 2411, por `useRoqueCraftPaineis`, `golpear` e
`montarIconesDoJogo`.

## 7. O que ficou aberto

- **5c**: poções arremessáveis, nível II e prazo dobrado. `efeitos.js` já aceita
  nível e prazo; falta quem os compre (glowstone e redstone no suporte).
- **6b**: o aldeão ainda não anda até a cama, não foge de zumbi e não tem porta
  de verdade (não há bloco de porta no catálogo; o vão fica aberto).
- **3f**: o End. A altura variável por dimensão continua a trava, e é ele que a
  cobra.

## Ordem

Da que mais mexe em contrato para a que menos mexe: dimensões (toca save,
worldgen, luz e céu), depois redstone (toca a fila de atualização), depois
encantamento e poções (toca inventário e combate), por último aldeias e comércio
(toca mobs e UI).
