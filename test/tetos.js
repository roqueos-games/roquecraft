/**
 * OS TETOS DE TEMPO DA SUÍTE, NUM LUGAR SÓ.
 *
 * Teto de tempo existe para pegar teste que TRAVA. Ele não mede a qualidade do
 * código nem a velocidade da máquina, e afrouxá-lo nunca é conserto de teste --
 * asserção é outra coisa, e nenhuma muda por causa deste arquivo.
 *
 * ⚠️ POR QUE UM TETO NÃO PODE SER NÚMERO CRAVADO NUM SPEC.
 *
 * O `vitest.config.js` já decidiu isto, com número medido: sob `--coverage` a
 * instrumentação v8 multiplica o custo de tudo (um teste de DSP do afinador vai
 * de 353 ms para 2193 ms), então o teto global é 15 s normal e 120 s
 * instrumentado. Um spec que escreve o teto dele à mão IGNORA essa decisão, e
 * quando escreve um número menor a ANULA -- exatamente na execução em que a
 * folga era necessária.
 *
 * O prejuízo apareceu em 28/08/2026, e não foi um teste vermelho: foi um teste
 * vermelho ERRADO. Seis specs do RoqueCraft fixavam 60 s;
 * `luzDoCliente.spec.js` leva 7.748 ms sem instrumentação e 68.729 ms com ela,
 * estourava, matava o worker do vitest (`Timeout calling "onTaskUpdate"`), e o
 * vitest culpava o arquivo que estivesse rodando na hora --
 * `ROSAppManager.spec.js`, que passa sozinho 3 de 3. Um vermelho que aponta
 * para o arquivo errado é pior que nenhum: manda procurar defeito onde não tem.
 *
 * O portão que impede a volta é `tests/unit/architecture/teto-de-tempo.spec.js`.
 * Ele recusa as DUAS formas de cravar: `vi.setConfig({ testTimeout: 60_000 })`
 * e o terceiro argumento, `it('nome', fn, 60_000)`.
 */

/**
 * Testes que GERAM MUNDO no RoqueCraft: raio 8 são 289 chunks de 65 mil blocos
 * de ruído 3D cada. É trabalho real, custa segundos, e custa o mesmo em
 * qualquer máquina.
 *
 * ⚠️ O NÚMERO INSTRUMENTADO SAIU DE MEDIÇÃO, e a medição corrigiu o palpite que
 * estava escrito. Rodando `yarn test:unit:coverage` duas vezes em 28/08/2026, o
 * teste mais lento da casa -- `espelho de luz do cliente > chega para os chunks
 * em volta do jogador` -- levou 68.729 ms e 70.982 ms. Os 120 s do teto global
 * deixariam 1,7x de folga, e 1,7x é justamente a margem que some quando há um
 * build ao lado: seria o mesmo vermelho dependente de carga, um pouco mais
 * tarde. 240 s são 3,4x o pior caso medido, e continuam sendo um detector de
 * travamento -- um teste que trava não termina em 240 s nem em 240 minutos.
 */
export const TETO_DE_MUNDO = process.env.VITEST_INSTRUMENTADO ? 240_000 : 60_000

/**
 * Testes pesados que NÃO geram mundo: montagem de componente grande, boot que
 * importa módulo de verdade. Medido em 28/08/2026 sob `yarn test:unit:coverage`:
 * `ROSAppMaker.spec.js` inteiro (210 testes) leva 13.357 ms instrumentado
 * contra 4.379 ms sem instrumentação, e `boot/firebase.spec.js` leva 5 ms.
 *
 * Os 60 s são 4,5x o ARQUIVO inteiro instrumentado, e o teste que carrega este
 * teto é um dos 210 -- folga de sobra. Os 20 s sem instrumentação preservam o
 * número que os dois specs já usavam, então nada aperta nem afrouxa hoje: o que
 * muda é que a instrumentação passou a ser levada em conta.
 */
export const TETO_LENTO = process.env.VITEST_INSTRUMENTADO ? 60_000 : 20_000
