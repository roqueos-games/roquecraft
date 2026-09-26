---
paths:
  - 'src/components/roqueos/apps/ROSRoqueCraft.vue'
  - 'src/components/roqueos/apps/roquecraft/**'
  - 'src/services/roquecraft/**'
  - 'src/composables/useRoqueCraft*.js'
---

# RoqueCraft: onde cada coisa nasce

> Esta rule existe porque a instrução já estava escrita e mesmo assim foi
> furada. Ela vivia no passo 4 do método em `.claude/plans/roquecraft-loop.md`,
> que **não auto-carrega** quando alguém abre o componente. Em 25/08 uma rodada
> inteira de clima (chuva, neve, tempestade) entregou 246 linhas dentro do
> `.vue`, que já tinha 5.152. O founder cobrou, com razão. Agora a instrução
> mora onde ela é lida: colada no arquivo.

## A regra, em uma linha

**Recurso novo neste jogo nasce em serviço ou composable. O `.vue` só ganha
fiação.**

Se você abriu `ROSRoqueCraft.vue` para ADICIONAR comportamento, pare e decida o
destino antes de escrever a primeira linha.

## Onde cada coisa mora

| o que é                                                    | onde nasce                                       |
| ---------------------------------------------------------- | ------------------------------------------------ |
| Regra pura, determinística, sem Vue e sem timer            | `src/services/roquecraft/*.js`                   |
| Desenho, shader, malha, material                           | `src/services/roquecraft/render/*.js`            |
| Estado com **ciclo de vida** (timer, assinatura, listener) | `src/composables/useRoqueCraft*.js`              |
| Pedaço de interface com template próprio                   | `src/components/roqueos/apps/roquecraft/RC*.vue` |
| Superfície de QA e E2E                                     | `src/services/roquecraft/qaDe*.js`               |
| Ligar uma coisa na outra                                   | o `.vue`, e só isso                              |

## O critério entre serviço e composable

Está escrito desde a extração da persistência, e vale nos dois sentidos:

> É composable e não serviço porque tem **CICLO DE VIDA**: um temporizador que
> precisa ser cancelado quando o app fecha. Serviço puro não guarda timer.

Então:

- **Guarda timer, assinatura ou listener?** Composable, com `encerrar()` chamado
  no `onBeforeUnmount`. Exemplos: `useRoqueCraftPersistencia` (debounce de
  autosave), `useRoqueCraftClima` (fila de trovões com até 18 s de vida).
- **Não guarda nada disso?** Serviço, mesmo que seja grande e mesmo que só o QA
  use. Exemplos: `clima.js` (regra pura do tempo), `aparencia.js` (tabelas),
  `auditoriaDeMalha.js`, `qaDeCena.js`, `qaDeNavegacao.js`.

Sair do componente **não** transforma nada em composable: quem não tem ciclo de
vida vira serviço.

## ⚠️ Todo `let` do componente entra por GETTER, nunca por valor

A primeira versão desta regra dizia "engine e world". **Era estreita demais, e a
versão estreita me deixou embarcar o defeito em 26/08**: `qaDeInventario` nasceu
recebendo `drops` por valor, e `drops` é `let` reatribuída em quatro lugares
(entrar no multijogador, sair, desmontar o jogo). O gancho teria contado os
itens de uma partida morta, em silêncio, e o teste que escrevi na hora não pegou
porque o falso que montei nunca trocava de lista.

A regra é a natureza da declaração, não o nome da variável:

| declaração no `.vue`                        | como entra no módulo                |
| ------------------------------------------- | ----------------------------------- |
| `const` (ref, reactive, objeto, fila, mapa) | por VALOR - é sempre o mesmo objeto |
| `let` lido pelo módulo                      | por GETTER `() => x`                |
| `let` ESCRITO pelo módulo                   | por par getter + setter             |

Os `let` deste componente hoje: `world`, `engine`, `mobs`, `drops`, `flechas`,
`mobilia`, `ticks`, `yaw`, `pitch`, `quedasCongeladas`, `attackCooldown`,
`recargaAtual`, `ultimoGolpe`, `noiseCtx`, `audio`.

```js
// ✅ o módulo pergunta toda vez
criarQaDeCena({ engine: () => engine, world: () => world })

// ✅ e devolve a escrita pro dono
criarQaDeQuedas({
  congelado: () => quedasCongeladas,
  congelar: (v) => {
    quedasCongeladas = v
  },
})

// ❌ compila, passa no lint, e mente depois da primeira troca
criarQaDeCena({ engine, world })
```

Travado por teste em `qaDeCena.spec.js`, `qaDeInventario.spec.js`,
`qaDeMobs.spec.js` e `qaDeQuedas.spec.js`, todos plantando a forma errada e
exigindo o vermelho.

> **O falso do teste tem que TROCAR.** Um teste cujo contexto devolve sempre o
> mesmo array passa com getter e sem getter - ele não testa nada. O falso tem
> que reatribuir no meio do teste, que é o que o componente faz de verdade.

## ⚠️ Escrita em `yaw`, `pitch` e `ticks` volta por setter

São variáveis de módulo do componente. Escrever nelas de dentro de um serviço
escreveria numa cópia, e o sintoma seria silencioso: a câmera simplesmente não
vira. Quem precisa escrever recebe a função (`olhar(y, p)`), e quem escreve é o
componente.

## ⚠️ ORDEM DE DECLARAÇÃO: o composable vem DEPOIS do que ele recebe por valor

Em `<script setup>` não há hoisting de `const`. Um composable que recebe uma ref
**por valor** (`telas: { chatOpen, lobbyOpen }`) precisa ser declarado DEPOIS
dela; o que entra por getter (`() => world`) pode vir antes, porque só é lido na
chamada.

Em 26/08 eu pus `useRoqueCraftEntrada` no alto do arquivo passando `chatOpen` e
`lobbyOpen`, que nascem do composable de multijogador lá embaixo. O resultado:

- `yarn lint` - 0 erros
- `yarn test:unit` - 7.445 testes verdes
- o jogo - **morto**. `ReferenceError` no setup, e o componente nunca ficava
  pronto. As dez sondas deram `waitForFunction: Timeout 120000ms`.

Nenhum teste de unidade pega isto, porque nenhum deles monta o componente. A
sonda pega, e é por isso que ela é parte do gate e não um extra.

Na mesma rodada eu quebrei de novo, de outro jeito e com o mesmo silêncio: o
componente desestruturou `keys` de um composable que exporta `teclas`. Virou
`undefined`, e o laço de física quebrou por quadro. Lint verde, testes verdes.

**A resposta foi uma sonda nova, e ela é a mais barata da casa:**

```bash
node scripts/qa-roquecraft-sobe.mjs   # ~20 s, codigo 0 ou 1
```

Ela não mede nada do jogo. Responde três perguntas e para: o componente montou,
o gancho instalou, e o console ficou limpo. As dez sondas caras levavam dez
minutos pra estourar `waitForFunction` sem dizer qual era o erro; esta diz o
erro em vinte segundos. **Rode-a logo depois do build, antes das outras.**

Regra prática: monte os composables na ordem em que as coisas nascem. Quem só
depende de `let` do módulo (por getter) pode subir; quem recebe ref por valor
desce até depois dela. Na dúvida, passe por função: `() => x.metodo()` nunca
tem TDZ.

## Corte por ASSUNTO, não por tamanho

Antes de mover um bloco grande, **conte os identificadores livres dele**. O
gancho de E2E tem 1.240 linhas e 102 identificadores livres, dos quais 69 são
estado do componente: um contexto de 69 propriedades não é separação, é mudança
de endereço, e entrega arquivo menor com desenho pior.

Os cortes que valeram tinham 3, 4 e 6 dependências reais. Se o seu passa de
uma dúzia, o corte está no lugar errado.

### ⚠️ Import NÃO é dependência — e essa confusão já fez o loop parar cedo

Contar identificador livre e parar aí **superestima** o custo do corte, porque
mistura duas coisas de natureza diferente:

- **Import** (`AGUA`, `blockDef`, `SEA_LEVEL`, `nivelDaAgua`, `toChunkCoord`) —
  o módulo novo importa direto do serviço de origem. Custo zero. Não entra na
  conta.
- **Estado do componente** (`world`, `player`, `inventory`, `filaDeAtualizacoes`)
  — só chega por parâmetro. É isto que se conta.

Em 26/08 eu declarei o loop fechado dizendo que o que sobrava era "cauda longa
fragmentada". Ao medir de verdade, separando import de estado, os oito grupos
que sobravam tinham **4, 5, 6, 6, 9, 9, 10 e 14** dependências de estado — sete
deles abaixo do limite que eu mesmo tinha escrito aqui. O critério era meu, e eu
não o apliquei: **afirmei em vez de medir**, que é exatamente o erro que este
arquivo existe para impedir.

```bash
# a conta certa: livres MENOS os que o módulo novo pode importar
# (o medidor de uma rodada vive em .medir-e2e.mjs enquanto ela dura)
```

```bash
# antes de escrever a primeira linha num arquivo grande
ls src/composables/ | grep -i roquecraft   # já existe dono para isto?
ls src/services/roquecraft/qaDe*.js        # o gancho de QA já tem 11 donos
wc -l src/components/roqueos/apps/ROSRoqueCraft.vue
```

## O que SOBRA no `.vue` depois do loop, e por quê

Em 26/08 o loop de separação foi até o fim e mediu o que restou. Estes números
existem pra ninguém "descobrir" de novo que dá pra cortar aqui:

| o que fica           | linhas | dependências de estado |
| -------------------- | ------ | ---------------------- |
| `installE2EHook`     | ~340   | 67                     |
| `boot`               | 194    | 44                     |
| `stepGame`           | 173    | 46                     |
| `frame`              | 141    | 48                     |
| multijogador (15 fn) | 283    | 42                     |
| `doPlace`            | 128    | 19                     |

Todos passam MUITO da dúzia, e todos pelo mesmo motivo: são o CENTRO da fiação.
`frame` e `stepGame` são o laço; `boot` e `installE2EHook` são a montagem. Puxar
qualquer um deles pra fora exigiria um contexto de quarenta propriedades, que é
mudança de endereço, não separação.

O que ficou abaixo da dúzia e mesmo assim fica (`explodir` 8, `visitarCelula` 9,
`usarBalde` 10, `stepDrops` 5, `mobEnv` 5) é o outro caso da tabela de destinos:
**a REGRA já mora no serviço** (`explosao.js`, `fluidos.js`, `quedas.js`,
`items.js`, `mobs.js`) e o que está no `.vue` é a chamada mais o efeito. Ligar
uma coisa na outra é o trabalho do `.vue`.

## A prova de que a extração não perdeu nada

Não é ler o diff. É rodar as sondas e comparar com os números registrados, que
estão em `.claude/plans/roquecraft-clima-para-composable.md`:

| sonda      | número de aceite                              |
| ---------- | --------------------------------------------- |
| `chuva`    | campo ~34%, caverna ~0,2%, gelo ~0%, mar ~17% |
| `raio`     | campo ~+248%, caverna 0%                      |
| `leito`    | 63 algas e 264 capins em 2.025 colunas        |
| `entrada`  | BURACOS 0, SOBRAS 0                           |
| `refracao` | nitidez ~3,18 → ~2,04, deriva < 0,05          |

Número fora da faixa significa extração errada, e volta. Não existe "parece que
ficou igual".

### ⚠️ Vermelho não é confissão: MEÇA se ele é seu

Duas vezes em 26/08 uma sonda ficou vermelha durante o loop e a resposta certa
foi medir em vez de consertar:

- `entrada` traz dois `GL_INVALID_OPERATION: glTexStorage2D` no `erros`. Medido
  idêntico num build SEM a mudança - pré-existente.
- `colisao` sai com código 1 (`barrou: ATRAVESSOU em norte, sul, oeste`).
  Também medido idêntico sem a mudança - pré-existente, e é o próximo item.

O controle custa um `git stash -u`, um build e uma sonda. Não vale trocar isso
por um palpite, nos dois sentidos: nem assumir a culpa nem descartá-la.

## O controle de mutantes tem dois jeitos de mentir

Os dois aconteceram no mesmo dia, na mesma rodada, e os dois produzem um verde
que não vale nada. Quem roda mutante precisa saber os dois de cor.

### 1. O mutante que nunca existiu

Um `perl -0pi -e "s/.../.../"` cujo padrão **não casa** não muta nada. O arquivo
fica intacto, os testes passam, e a saída diz `SOBREVIVEU` — que se lê como
"teste fraco" quando na verdade é "mutante inexistente". Foi exatamente o que
aconteceu quando troquei `?? 0` por `|| 0` no código e esqueci de atualizar o
padrão do mutante que ainda procurava `?? 0`.

**O harness confere sozinho.** Antes de rodar o teste, compare o arquivo com a
cópia pristina; se forem iguais, o mutante não aplicou:

```sh
run() {
  if diff -q $F /tmp/orig.js >/dev/null; then
    echo "NAO APLICOU $1  <-- o padrao nao casou; o mutante nunca existiu"
    return
  fi
  ...
}
```

### 2. O mutante que ficou no arquivo

`zsh mutantes.sh | head -3` mata o script com **SIGPIPE** quando o `head` fecha
o cano — e ele morre _antes_ do `cp` que restaura o arquivo. O mutante fica no
código-fonte, e o próximo commit o leva junto.

Aconteceu comigo: `avisar('itens', err)` ficou apagado em `icones.js` e só o
gate completo pegou (um teste do próprio arquivo, vermelho). Se o mutante
tivesse caído num trecho sem teste, teria ido pra produção.

**Duas defesas, use as duas:**

- Nunca pipe o harness por `head`/`tail`. Redirecione para arquivo e leia
  depois: `zsh mutantes.sh > /tmp/mut.txt 2>&1; cat /tmp/mut.txt`.
- Ponha um `trap` no script, pra ele restaurar até quando for morto:
  `trap 'cp /tmp/orig.js $F' EXIT INT TERM PIPE`

E depois de qualquer rodada de mutantes, `git diff --stat` nos arquivos
mutados antes de seguir. Custa um segundo e é a única prova de que o código
voltou ao que era.

## Onde o loop de estruturação parou, e como a gente sabe

Números medidos em 26/08/2026, não estimados. Quem for continuar daqui começa
sabendo o que já foi feito e — mais importante — por qual régua.

### O componente

`ROSRoqueCraft.vue` saiu de **5.398 linhas** (início do loop) para **2.739**.

Mas linha é a régua fraca. As duas que importam:

**1. Ele deixou de ser o arquivo gigante do projeto.** Hoje há **doze**
componentes maiores que ele no mesmo repositório — ROSChat tem 5.905,
ROSAppManager 5.615, ROSFinder 3.579, e até o ROSDesktop tem 2.983. Ele saiu de
segundo-maior para décimo-terceiro sem que ninguém mexesse nos outros.

**2. Ele deixou de ter o jogo dentro.** Das 2.739 linhas: 216 de template, 256
de estilo, e 2.266 de script — das quais ~181 são import, ~603 comentário, ~125
em branco, e **~1.357 de código de verdade**, quase todo orquestração: montar,
ligar, delegar, desligar.

Mundo, malha, física, criaturas, blocos, áudio, combate, inventário, bancada,
mira, câmera, cena, ambiente, clima, multijogador, entidades, entrada, corpo,
painel, persistência, colocação e o gancho de QA moram em **87 serviços e 10
composables**, com mais de 18 mil linhas — e com teste.

### A régua que vale pra próxima rodada

Se uma extração não faz nenhuma destas três coisas, ela é **mudança de
endereço** e não vale a rodada:

- **tira uma DECISÃO do componente** (uma regra que se pode afirmar sem montar
  o jogo);
- **junta duas cópias da mesma resposta** (foi o que achou o `origin` global, o
  fantasma que mentia na fusão de laje, o relógio da simulação e a chave de
  chunk);
- **abre um teste que antes era impossível** — porque o código só existia depois
  de uma GPU responder.

Uma rodada que só move linhas de um arquivo pro outro deixa o total igual e o
sistema pior: mais um lugar pra procurar, nenhuma pergunta a mais respondida.
Duas rodadas deste loop AUMENTARAM o componente em algumas linhas e mesmo assim
valeram, porque tiraram regra de dentro dele. O contrário — encolher sem tirar
decisão — não vale nunca.
