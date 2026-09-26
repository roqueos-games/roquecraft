# Rodada 15 — o golpe ganha ritmo

**Direção nova do founder (24/08):** o gráfico está bom e fica como está. O
trabalho agora é dinâmica, blocos e inimigos. Esta rodada é a primeira sob essa
regra, e nenhuma linha de shader, textura ou luz foi tocada.

Item #20 do backlog, escolhido por ser o de maior impacto ÷ custo em "inimigos".

## O que o combate era

Um número só: **recarga de 0,42 s pra qualquer coisa na mão e dano chapado.**
Atacar era segurar o botão. A espada de diamante e a mão vazia tinham o mesmo
ritmo — escolher arma mudava quanto o combate soma, nunca como ele se joga.

## O que entrou

Módulo de regra pura em `combate.js`, com os números medidos na documentação do
original, não estimados:

| regra                     | o que faz                                                                      |
| ------------------------- | ------------------------------------------------------------------------------ |
| **Ritmo por arma**        | Espada 1,6 golpes/s · picareta 1,2 · machado e pá 1,0 · enxada e mão vazia 4,0 |
| **Carga quadrática**      | Dano × `0.2 + 0.8p²` — martelar dá 20%, esperar dá 100%                        |
| **Crítico caindo**        | No ar, descendo, sem correr, carga ≥ 84,8% → × 1,5                             |
| **Correndo empurra mais** | Empurrão extra em vez do crítico — as duas coisas se excluem, como no original |

Uma decisão de desenho que não é do original e é deliberada: **o golpe sempre
sai**. Bloquear o botão até a recarga encher deixa a mão inerte e o jogador não
aprende o ritmo — sente travamento. Deixando o golpe sair fraco, o próprio dano
ensina.

E o retorno visual mínimo pra mecânica ser legível: uma barra de 26 px sob a
mira, que só aparece enquanto recarrega, mais um ✧ que pisca no crítico. Sem
isso um golpe de 20% lê como travamento, não como mecânica.

## Evidência

19 testes de unidade novos, incluindo dois que valem por todo o resto:

- a curva é **varrida** em 40 pontos pra provar monotonicidade — uma curva com
  um vale no meio passaria num teste de extremos e ensinaria o jogador a
  martelar;
- **um golpe martelado COM crítico dói menos que um carregado sem crítico**, que
  é a frase inteira da mecânica em um assert.

E a sonda no jogo rodando (`qa-roquecraft-combate.mjs`), com par de controle —
mesmo bicho, mesma arma, mesma sessão, só muda a espera:

```
carregado:  espada de ferro, carga 1.00 → dano 7.0
martelado:  mesma espada,    carga 0.00 → dano 1.4
razão: 5.00  (teto teórico é 1/0.2 = 5)
régua: espada 0.625 s · machado 1.000 s
```

Portão: lint 0 erros, **6878 testes** (era 6859), folha de contato com
`erros: []` e visualmente idêntica — o gráfico não se mexeu.

## O que a sonda me ensinou, e custou quatro corridas

A sonda reprovou a mecânica três vezes seguidas **por defeito dela**, não do
jogo. Vale registrar porque as três são a mesma família de erro:

1. **`ok: false`, dano 0.** O porco nascia fora do cone de ataque. Sem
   diagnóstico, "reprovado" era indistinguível de "não ligado".
2. **Dano base 1 em vez de 7** — ou seja, um golpe inteiro de MÃO VAZIA medido
   como se fosse espada de ferro. `give` + `slotOf` não arma bancada: `slotOf`
   só varre a hotbar e no criativo ela já vem cheia, então o item cai no slot
   10 e o `slotOf` devolve -1 **em silêncio**. Virou o gancho `equipar`, que
   devolve o que ficou na mão — e a sonda passou a reportar `naMao`.
3. **Carga 0.733 na "martelada".** Re-mirar entre o golpe de preparo e o golpe
   medido gastava 180 ms e a barra enchia sozinha. Martelar é atacar duas vezes
   no MESMO quadro.

O que quebrou o ciclo não foi a quarta tentativa: foi parar de tentar e
imprimir posição, yaw e pitch no instante do golpe. A resposta veio na hora —
`dot = 0.909` contra o limite de 0,92, reprovando por um fio.

## Fica para a próxima

1. **Bloco de construção que existe e nunca é gerado** (#13): argila, granito,
   andesito, diorito, obsidiana. Custo P, e é "blocos" direto.
2. **Agricultura** (#19): enxada, semente, trigo, pão.
3. Folha de bétula/pinheiro/selva dropando a própria folha (#5).
4. Escada em canto (#23) e o destaque que ainda é cubo inteiro em laje (#22).
