# Correção: o clima entrou no lugar errado

> **ESTADO: executado em 26/08.** Cinco rodadas, cada uma medida contra as
> sondas antes de subir. `ROSRoqueCraft.vue`: **5.398 → 4.802 linhas (-596)**.
> O que saiu, e com quantas dependências reais cada corte tinha:
>
> | rodada | o que saiu                          | destino                                      | deps |
> | ------ | ----------------------------------- | -------------------------------------------- | ---- |
> | 1      | clima (o meu débito)                | `composables/useRoqueCraftClima.js`          | 7    |
> | 2      | ícone emprestado e cor de partícula | `services/roquecraft/aparencia.js`           | 0    |
> | 3      | auditoria de malha                  | `services/roquecraft/auditoriaDeMalha.js`    | 3    |
> | 4      | QA de cena (motor + mundo)          | `services/roquecraft/qaDeCena.js`            | 4    |
> | 5      | navegação de QA                     | `services/roquecraft/qaDeNavegacao.js`       | 6    |
> | 6      | a porta fechada                     | `.claude/rules/44-roquecraft-arquitetura.md` | n/a  |
> | 7      | QA de audio                         | `services/roquecraft/qaDeSom.js`             | 3    |
>
> ⚠️ **A rodada 3 mudou de forma no meio, por medida.** O plano abaixo dizia
> "extrair o gancho de E2E inteiro, ~1.070 linhas". Contei os identificadores
> livres antes de cortar: 102, dos quais 69 são estado do componente. Um
> contexto de 69 propriedades não é separação, é mudança de endereço. O corte
> passou a ser por ASSUNTO, e é por isso que ele virou três rodadas em vez de
> uma.
>
> ⚠️ **E o loop parou por CRITÉRIO, não por cansaço.** O que sobrou do gancho de
> E2E são 754 linhas em 85 métodos, e o maior deles tem 37 linhas. Não há mais
> bloco: há uma superfície de depuração, larga por natureza, porque existe
> justamente para expor tudo. Continuar fatiando em módulos de 30 linhas com
> contextos sobrepostos seria fragmentação, e a regra que a rodada 6 escreveu
> ("se o corte passa de uma dúzia de dependências, ele está no lugar errado")
> corta também para o outro lado.
>
> **Arquitetura no fim:** 4.740 linhas no componente, 2.719 em oito
> subcomponentes, 272 em dois composables, e 21.978 em 65 módulos de serviço. O
> `.vue` é 16% do código do jogo.

> Aberto em 26/08/2026, depois do founder perguntar: _"Você não seguiu as boas
> práticas de construção de software do harness do roqueos? Lá definimos
> claramente uso de store, composables, componentes e etc."_
>
> Ele está certo. Este documento não é defesa, é o conserto medido.

## O veredito, com número

A rodada do clima (chuva, neve, tempestade) entregou **1.034 linhas**. A
distribuição:

| destino                                   | linhas   | está certo?                        |
| ----------------------------------------- | -------- | ---------------------------------- |
| `src/services/roquecraft/clima.js`        | 214      | ✅ regra pura, testada, sem Vue    |
| `src/services/roquecraft/render/chuva.js` | 199      | ✅ módulo de render, como os pares |
| `render/engine.js`                        | +177     | ✅ é o dono do laço de desenho     |
| `render/voxelMaterial.js`                 | +82      | ✅ é o dono do shader              |
| `services/roquecraft/audio.js`            | +47      | ✅ é o dono do som                 |
| `render/sky.js`                           | +23      | ✅ é o dono da cúpula              |
| `worldClient.js`                          | +30      | ✅ é o dono do estado de chunk     |
| **`ROSRoqueCraft.vue`**                   | **+246** | ❌ **aqui está a falha**           |

Das 266 linhas adicionadas ao componente, 130 são comentário: são **136 linhas
de código de verdade** no lugar errado. O arquivo foi de **5.152 para 5.398**.

Ou seja: 72% do que escrevi foi para serviço e módulo, corretamente. O erro não
é difuso, é um bloco identificável, e é por isso que ele sai inteiro.

## A regra que eu não segui, e ela já estava escrita

Não é interpretação minha do que seria bonito. É o **passo 4 do método deste
loop**, em [`roquecraft-loop.md`](./roquecraft-loop.md):

> 4. **Construir**, extraindo composable quando a rodada tocar um trecho grande
>    (refatoração paga por demanda, junto com o recurso que a exige, nunca como
>    uma reescrita solta).

O clima é um trecho grande e novo. Ele exigia o composable e eu não paguei.

E havia **precedente na mesma tela**: `src/composables/useRoqueCraftPersistencia.js`
já existe, com 93 linhas, teste próprio de 265 linhas, e um cabeçalho que abre
com _"Antes disto o salvamento morava no componente de 4.500 linhas"_. O caminho
estava aberto, sinalizado, com exemplo funcionando. Eu não olhei.

Pior: aquele mesmo cabeçalho define o critério de escolha entre composable e
serviço, e o clima cai nele com folga:

> É composable e não serviço porque tem **CICLO DE VIDA**: um temporizador que
> precisa ser cancelado quando o app fecha. Serviço puro não guarda timer.

O clima guarda **uma fila de `setTimeout`** (`trovoesNoAr`), que precisa ser
cancelada no `onBeforeUnmount` senão um trovão toca com o motor de áudio já
destruído. É literalmente o mesmo critério, no mesmo app, escrito por mim numa
sessão anterior.

## O que NÃO está errado, para o conserto não virar reescrita

Vale delimitar, senão a correção estraga o que funciona:

- **`clima.js` fica onde está.** Regra pura, sem Vue, 20 testes, determinística.
  Serviço é o lugar certo dela, e o composable vai **consumir** esse serviço.
- **`chuva.js` fica onde está.** É irmão de `destaque.js` e `blocosCaindo.js`,
  no mesmo diretório, com a mesma forma (`criarX(THREE) → { grupo, update, dispose }`).
- **O que entrou em `engine.js`, `voxelMaterial.js`, `sky.js` e `audio.js` fica.**
  Cada um é o dono legítimo daquele pedaço.
- **Nenhuma medida se perde.** Os números de aceite de cada recurso já existem e
  viram o gate desta correção (ver "A garantia" abaixo).

## O plano de correção

### Passo 1, `useRoqueCraftClima` (o meu débito, e só ele)

Sai do `.vue` e vai para `src/composables/useRoqueCraftClima.js`:

| bloco               | linha hoje | o que é                                  |
| ------------------- | ---------- | ---------------------------------------- |
| `climaAgora`        | 1414       | estado reativo do tempo aqui             |
| `ceuSobreOOlho`     | ~1416      | cache 4×/s de `skyExposed`               |
| `aplicarClima`      | 1417       | bioma tem voto + rampa + envio ao engine |
| `climaForcado`      | ~1440      | sobrescrita de QA                        |
| `ultimoRaio`        | 1528       | identidade do raio já disparado          |
| `trovoesNoAr`       | ~1530      | **a fila de timers** (o critério)        |
| `passoDaTempestade` | 1535       | agenda o trovão pela distância           |

**Assinatura**, seguindo a forma do `useRoqueCraftPersistencia` (parâmetros como
objeto, refs de volta, nada desempacotado):

```js
export function useRoqueCraftClima({
  semente,          // () => number
  ticks,            // () => number
  biomaAtual,       // () => number
  nomeDoBioma,      // (id) => string
  ceuAberto,        // () => boolean   (envolve world.skyExposed)
  aplicarNoMotor,   // (clima) => void (envolve engine.setClima)
  tocarTrovao,      // (km) => void    (envolve audio.trovao)
})
// devolve { clima, forcar, passoPorQuadro, passoLento, encerrar }
```

Os três chamadores de hoje viram três linhas no componente:

- `stepGame` (1322) → `clima.passoPorQuadro(now / 1000)`
- tique do HUD (1379) → `clima.passoLento(b)`
- `climaQA` (4221) → `clima.forcar(...)`

E o `onBeforeUnmount` chama `clima.encerrar()`, que cancela a fila, hoje isso é
um `for` solto lá dentro, e é exatamente o tipo de limpeza que a regra
[`15-composables.md`](../rules/15-composables.md) manda morar no composable.

**Teste ao lado**: `tests/unit/composables/useRoqueCraftClima.spec.js`, no mesmo
diretório e no mesmo estilo do spec da persistência. O que ele trava, e cada item
é um defeito que a rodada de hoje realmente cometeu antes de ser pego:

1. a sobrescrita entra **antes** da regra de bioma (o gelo molhava);
2. chuva e neve nunca positivas juntas;
3. a rampa suaviza, e `imediato` pula a rampa (senão a sonda mede 72% e chama de cheio);
4. `encerrar()` cancela toda a fila de trovões;
5. o mesmo raio não dispara dois trovões.

**Efeito no arquivo**: 5.398 → **~5.152**, que é exatamente onde ele estava antes
de eu chegar. O meu débito zera.

**Risco: baixo**, e por evidência e não por otimismo. O critério de acoplamento
do [`roquecraft-loop.md`](./roquecraft-loop.md) é _"quem escreve estado dentro de
`frame()`"_. `aplicarClima` roda 4×/s, não por quadro. `passoDaTempestade` roda
por quadro mas só **lê** uma função pura e agenda um timer: não escreve estado
que o quadro seguinte leia. É a mesma assinatura fria da persistência, que saiu
sem incidente.

### Passo 2, retomar os tiers que já estavam definidos

Isto **não é meu débito**, é o que já estava mapeado na auditoria de 24/08 e
ficou parado. Fica aqui para não se perder de novo, na ordem original:

| tier | o que sai                                                       | linhas | risco       |
| ---- | --------------------------------------------------------------- | ------ | ----------- |
| 0    | `FALLBACK_ICON`, `TINT_CACHE`+`blockTintColor`, `VIZINHAS`      | 75     | nominal     |
| 1    | Política de nascimento, registro de edições, `olhoSeguro`, nado | 232    | baixo       |
| 2    | Lobby/chat, entrada, **gancho E2E (~1.070 linhas)**             | ~1.340 | médio       |
| ,    | Laço, criaturas, mirar/quebrar, fluidos, ataque                 | 1.258  | **NÃO SAI** |

Somando com o passo 1: **5.398 → ~3.400**, e o que sobra é o núcleo quente que a
própria análise diz para não tocar.

⚠️ **O gancho E2E (`window.__roquecraft`) é o maior bloco e o de menor risco de
produto**: se ele quebrar, o jogo não sente. Quem sente sou eu, nas sondas. Por
isso ele é o candidato natural depois do passo 1, apesar de estar no tier 2. Ele
referencia 66 identificadores e vaza **duas** variáveis para o caminho de
produção (`qaJogadores`, `quedasCongeladas`, ambas inertes em jogo).

### Passo 3, fechar a porta

Uma regra nova em `.claude/rules/` com `paths:` apontando para
`src/components/roqueos/apps/ROSRoqueCraft.vue`, dizendo em uma linha: **recurso
novo neste app nasce em composable ou serviço; o `.vue` só ganha fiação.** Hoje
essa instrução existe só no passo 4 de um plano, que não auto-carrega quando
alguém abre o componente. Foi por isso que eu não a vi.

## A garantia de não perder nada

Cada passo é **preservador de comportamento**, e isso não é promessa: é medida,
porque os números de aceite de cada recurso já existem de hoje.

O gate de cada extração:

1. `yarn lint` sem erro e a suíte inteira verde (hoje: 685 arquivos / 7.263 testes);
2. `node scripts/qa-roquecraft-chuva.mjs` devolvendo os **mesmos** números,
   dentro do ruído já medido:

   | cena         | antes  | ruído do par |
   | ------------ | ------ | ------------ |
   | descampado   | −34,2% | ≤ 0,04%      |
   | caverna      | 0,2%   | ≤ 0,04%      |
   | campo gelado | −0,1%  | ≤ 0,04%      |
   | mar          | 17,5%  | ≤ 0,04%      |

3. `node scripts/qa-roquecraft-raio.mjs`: campo +248%, caverna 0%;
4. as sondas de água (`refracao`, `reflexo`, `caustica`, `onda`) sem recusar por
   deriva, elas são as mais sensíveis a mexida no laço de desenho.

Se qualquer número sair da faixa, a extração está errada e volta. Não existe
"parece que ficou igual".

**E o comentário viaja com o código.** 48% do que eu adicionei é a razão de cada
decisão escrita ao lado dela: as três armadilhas de vazamento global, o teto e o
piso da perda de luz, por que a sobrescrita vem antes da regra de bioma. Mover o
código e deixar o porquê para trás perderia a parte que mais custou.

## O que eu faria diferente, para não repetir

O erro não foi de gosto arquitetural, foi de **ordem de leitura**: eu abri o
componente e comecei a escrever. A checagem que teria evitado custa um comando e
entra no método do loop, entre o passo 3 (medir) e o 4 (construir):

```bash
ls src/composables/ | grep -i <app>     # já existe dono para isto?
wc -l <o arquivo que vou tocar>          # ele já é grande?
```

Se o arquivo passa de mil linhas e o recurso é novo, ele **não** nasce ali.
