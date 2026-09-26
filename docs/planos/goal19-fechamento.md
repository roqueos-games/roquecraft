# Goal 19 — fechamento, com a evidência

Seis commits, 19 arquivos, 3.690 linhas a mais e 180 a menos. Branch
`goal19-vilas-e-castelos`.

## O que mudou, em números medidos

A catraca de `tests/unit/architecture/inventario-da-vila.json`, do começo ao fim:

| régua                | antes | onda 1 | onda 2 | onda 3 |
| -------------------- | ----- | ------ | ------ | ------ |
| colunas da vila      | 413   | 510    | 2.364  | 2.844  |
| blocos sólidos       | 1.008 | 1.345  | 2.961  | 3.330  |
| tipos de bloco       | 4     | 9      | 13     | 35     |
| fontes de luz        | 0     | 0      | 13     | 13     |
| móveis               | 0     | 10     | 18     | 37     |
| janelas              | 15    | 30     | 62     | 62     |
| altura acima do chão | 4     | 10     | 11     | 11     |
| estruturas           | 5     | 5      | 7–9    | 7–9    |

O castelo, que não existia: 1.369 colunas, 2.581 blocos, 17 de altura, em 71 de
cada 200 células. A ruína, 42% deles, perdendo de 10% a 55% da pedra — faixa e
não catraca, porque ela perde blocos por definição e um piso mínimo empurraria a
erosão para baixo até ela sumir.

## O que reprova, e o que cada instrumento enxerga

Os três medem coisas diferentes e nenhum substitui o outro. Isso foi medido com
mutante, não deduzido:

- **`vila-inventario.spec.js` e `castelo.spec.js`** — a vila ficou mais pobre.
- **`qa-roquecraft-vila.mjs`** — a vila não chegou no mundo (compara plano com
  mundo, tipo a tipo, e aponta a primeira divergência com coordenada).
- **as 18 fotos** — a vila ficou feia, e quem julga é o humano.

Um mutante que apaga a parede da casa SOBREVIVE na sonda, porque plano e mundo
saem da mesma função e encolhem juntos. Morre na catraca, na hora.

## Gate, rodado em 14/09/2026

```
lint            ok       0 erros, 28 avisos (todos pré-existentes, nenhum nos arquivos da rodada)
format:check    ok       All matched files use Prettier code style!
teto-do-bundle  ok       index-BGy67qin.js: 1147.1 KB gzip, teto 1148 KB
test:unit       1 falha  10.526 testes em 6 fatias; a única vermelha é ambiental
i18n hardcoded  ok       rc=0
qa sobe         ok       12 s
qa vila         ok       "a vila planejada é a vila construída"
qa colisao      ok       penetracao/barrou/faces/console OK
qa coerencia    ok       ocoAbaixo/solidoAcima/console OK
vue-quasar-reviewer  APROVADO (depois de reprovar por teste ausente, e com razão)
```

A falha de `glslSemCrase.spec.js` é do ambiente desta sessão e não do código: o
mount recusa `unlink`, e o CONTROLE daquele teste apaga um arquivo em
`node_modules/.cache`. O arquivo não está no diff desta branch.

O hash do bundle de entrada (`index-BGy67qin.js`) é o MESMO de antes da rodada:
todo o código novo caiu no chunk lazy do RoqueCraft, que foi de 158 para 166 KB
gzip.

## O que ficou de fora, e está dito

- **O baú do torreão está vazio.** Encher de recompensa é sistema de loot, que
  este repo não tem.
- **`ROSRoqueCraft.vue` não foi tocado** e continua em 2.409 linhas, duas abaixo
  do teto. Toda a rodada mora em `src/services/roquecraft/`.
- **Nada foi empurrado para o GitHub.** Esta máquina não tem chave SSH para o
  remoto, e não há `gh` nem token. Os seis commits estão locais na branch.

## Os seis defeitos que a medição achou, e que nenhum teste de forma pegaria

1. **Uma casa inteira não existia**, desde sempre: o ramo do nível do mar dá
   `continue` na coluna antes de chegar na aldeia, e a casa que encosta na
   margem de um lago tinha metade das colunas pulada em silêncio.
2. **`RAIO` cortava a casa da borda** — ele limita onde o CENTRO cai, e a casa
   avança a partir dele.
3. **A guarda da praça olhava o centro da casa**, e o mesmo erro sumiu com quatro
   dos doze postes.
4. **A régua subcontava desde a onda 0**: varria `RAIO` em vez de `RAIO_ESCRITO`.
   Como a catraca só sobe, o erro nunca reprovou nada — só escondeu entrega.
5. **A espiral da menagem não subia**: duas das quatro pernas com o degrau virado
   ao contrário. Os degraus estavam todos lá.
6. **A sonda mentiu duas vezes**, as duas por número cravado nela.
