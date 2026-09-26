// RoqueCraft - ESPELHO: ler um `let` de fora, sempre o valor de AGORA.
//
// ⚠️ O PROBLEMA QUE ISTO RESOLVE JA SHIPOU UM DEFEITO NESTE JOGO.
//
// Boa parte do estado vivo do componente e `let`, nao `ref`: `engine`, `world`,
// `audio`, `ticks`, `yaw`. Eles sao REATRIBUIDOS -- o motor nasce no boot e
// nasce de novo na troca de qualidade; `ticks` anda todo quadro. Passar um `let`
// por VALOR pra outro modulo entrega uma foto: quem recebeu fica com o valor
// daquele instante e nunca ve o proximo. Foi assim que `drops` viajou por valor
// numa rodada e a lista do outro lado congelou.
//
// A forma correta e um acessador. Escrita a mao, ela custa tres linhas por
// campo e some no meio do arquivo:
//
//     get engine() { return engine },
//     set ticks(v) { ticks = v },
//
// Aqui ela custa uma:
//
//     espelho({ engine: () => engine, ticks: [() => ticks, (v) => (ticks = v)] })
//
// Funcao sozinha = so leitura. Par `[ler, escrever]` = leitura e escrita.

/**
 * @param {Object<string, function|[function, function]>} campos
 * @returns {object} objeto cujas propriedades leem (e escrevem) o valor vivo
 */
export function espelho(campos) {
  const alvo = {}
  for (const [nome, acesso] of Object.entries(campos)) {
    const [ler, escrever] = Array.isArray(acesso) ? acesso : [acesso, null]
    if (typeof ler !== 'function') {
      throw new TypeError(`espelho: o campo "${nome}" precisa de uma funcao de leitura`)
    }
    const desc = { enumerable: true, configurable: false, get: ler }
    // ⚠️ Sem `set`, escrever num campo so-leitura falha em SILENCIO fora do
    // modo estrito. O `set` explicito que reclama e o que transforma "nao
    // funcionou e ninguem sabe por que" em uma linha de erro com o nome do
    // campo.
    desc.set = escrever
      ? escrever
      : () => {
          throw new TypeError(`espelho: "${nome}" e so de leitura`)
        }
    Object.defineProperty(alvo, nome, desc)
  }
  return alvo
}
