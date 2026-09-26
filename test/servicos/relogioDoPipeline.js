// O RELÓGIO DO PIPELINE NÃO PODE SER O DA PAREDE.
//
// `pipe.tick(ms)` gasta um orçamento em MILISSEGUNDOS DE PAREDE, então quanto
// trabalho drena por tick depende da máquina e da carga do momento. Um teste
// que monta o mundo em N ticks monta, por isso, um mundo DIFERENTE em cada
// execução: no Mac ocioso ele sai inteiro; sob `--coverage`, que instrumenta
// cada linha do gerador, ele sai pela metade.
//
// Foi assim que `yarn test:unit:coverage` ficou vermelho com 16 testes
// enquanto `yarn test:unit:ci` passava com os mesmos 7.820: a mesma suíte, uma
// máquina mais lenta. E o vermelho não apontava para o defeito procurado, e sim
// para a PREMISSA do teste -- "o mundo de referência nasceu vazio", "as
// sementes de teste realmente têm neve pra examinar". Guarda que depende da
// carga ensina a ignorar o vermelho, que é o oposto do que ela existe pra
// fazer.
//
// O pipeline já nasceu com relógio injetável (`agora`), por causa do teste de
// ordem que oscilava por 0,12 ms. Aqui isso vira o padrão de quem monta mundo
// em teste.

/**
 * Um milissegundo sintético a cada `1 / porLeitura` leituras do relógio.
 *
 * O orçamento continua significando alguma coisa -- `tick(2)` faz menos
 * trabalho que `tick(32)` -- e passa a significar A MESMA COISA em toda
 * máquina, que é justamente o que um teste de granularidade precisa.
 *
 * ⚠️ O PASSO NÃO PODE SER 1 MS POR LEITURA, e o motivo é um comportamento real
 * do pipeline: na fase da luz, todo chunk cujos 8 vizinhos ainda não geraram é
 * ADIADO, e adiar custa uma leitura do relógio. No começo do mundo todos são
 * adiados, então um `tick(8)` que só compra 7 operações gasta as 7 remexendo a
 * fila de luz e nunca chega na fase 3, que é a GERAÇÃO -- o mundo trava em
 * zero. Com 100 operações por milissétimo sintético a fase da luz se paga e a
 * geração anda, que é o que um milissegundo de parede sempre fez aqui.
 */
export const relogioSintetico = ({ porLeitura = 0.01 } = {}) => {
  let t = 0
  return () => (t += porLeitura)
}

/**
 * Roda o pipeline até o mundo parar de crescer, com teto de trabalho.
 *
 * ⚠️ NÃO EXISTE "ESPERAR A FILA ESVAZIAR". `tick()` devolve
 * `did || genQueue.length || meshQueue.length || lightQueue.length`, e a fila
 * de luz guarda para sempre os chunks adiados por estarem fora do raio: eles
 * voltam para a fila a cada tick, de propósito. Ou seja, `tick()` nunca devolve
 * falso num mundo montado, e todo `while (pipe.tick(50) && n < 2000)` desta
 * suíte sempre terminou pelo CONTADOR -- o que fazia o orçamento de parede ser
 * o único a decidir quanto mundo existia no fim.
 *
 * Quem sabe dizer se acabou é o teste, olhando o que ele mesmo coletou: quando
 * `progresso()` para de subir por `quieto` ticks seguidos, não vem mais nada.
 * Com o relógio sintético isso acontece no MESMO tick em toda máquina.
 *
 * ⚠️ ESTOURAR O TETO É FALHA, NÃO FIM DE LOOP. A forma antiga saía calada no
 * `n < 2000` e devolvia um mundo pela metade; o teste então reprovava lá na
 * frente, com uma mensagem que não tinha nada a ver -- foi assim que
 * `--coverage` ficou vermelho reclamando que "o mundo de referência nasceu
 * vazio". Se o teto não bastar, quem lê o vermelho sabe disso na primeira
 * linha.
 *
 * `trabalho` é o teto, em milissegundos sintéticos. `orcamento` é o tamanho do
 * pedaço: dois runs com `orcamento` diferente moem a mesma coisa em pedaços de
 * tamanhos diferentes, que é o que um teste de "o orçamento não muda o
 * resultado" precisa comparar.
 */
export async function moer(
  pipe,
  { orcamento = 50, trabalho = 4_000, quieto = 12, progresso, folego = 1 } = {},
) {
  const ticks = Math.ceil(trabalho / orcamento)
  let ultimo = -1
  let parado = 0
  for (let i = 0; i < ticks; i++) {
    pipe.tick(orcamento)
    // ⚠️ DEVOLVER O EVENT LOOP DE VEZ EM QUANDO NÃO É ENFEITE. Gerar um mundo de
    // raio 8 são 19 milhões de blocos de ruído, e sob `--coverage` isso passa de
    // um minuto TRAVADO -- tempo em que o worker do vitest não responde o
    // `onTaskUpdate` do processo principal. O runner então derruba a rodada com
    // `[vitest-worker]: Timeout calling "onTaskUpdate"`, quatro vezes, sem dizer
    // qual teste: 7.820 verdes e saída 1. Um respiro a cada `folego` ticks custa
    // quase nada e devolve o vermelho ao lugar onde ele significa alguma coisa.
    //
    // ⚠️ `folego` NASCEU 20 E ISSO NÃO RESPIROU NADA: com o `progresso` cortando
    // o loop no tick 15, o primeiro respiro (tick 20) nunca chegava, e os dois
    // testes de raio 8 continuaram bloqueando 62s. Um por tick é o certo -- cada
    // tick já são milhares de operações, e o custo do respiro some ao lado.
    if (i % folego === folego - 1) await new Promise((r) => setTimeout(r, 0))
    if (!progresso) continue
    const agora = progresso()
    if (agora !== ultimo) {
      ultimo = agora
      parado = 0
    } else if (++parado >= quieto) {
      return i + 1
    }
  }
  if (progresso) {
    throw new Error(
      `o mundo não parou de crescer em ${trabalho}ms sintéticos (pedaços de ${orcamento}ms) -- ` +
        `mundo incompleto, não adianta medir nada em cima dele`,
    )
  }
  return ticks
}
