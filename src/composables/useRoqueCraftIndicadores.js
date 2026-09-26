import { reactive } from 'vue'

// OS RECIBOS DA MIRA: o que o jogo já sabe e o jogador não via.
//
// ⚠️ ESTE ARQUIVO EXISTE POR UM DEFEITO DE SILÊNCIO, não de cálculo. Três
// estados eram calculados a cada quadro, tinham função exportada, tinham teste
// de unidade — e NÃO CHEGAVAM NA TELA:
//
//  - `cargaDoArco()` existia em `useRoqueCraftEntidades` e era consumida por
//    ninguém: o jogador puxava a corda no escuro e soltava no chute. O arco é
//    a única arma do jogo em que a espera MUDA o tiro, e era a única sem
//    mostrador.
//  - `guardaLevantada()` existia em `useRoqueCraftCorpo` e só o gancho de QA
//    lia. Segurar o escudo não dava sinal nenhum: a única prova de que a
//    guarda estava de pé era levar pancada e não perder vida.
//  - a carga do GOLPE já aparecia — e é justamente por ela existir que as
//    outras duas não aparecerem era incoerência, não escolha.
//
// ⚠️ ESCREVE SÓ QUANDO MUDA, e isto não é micro-otimização. Estes refs são
// atualizados A CADA QUADRO (60 Hz), não nos 4 Hz do resto do painel: numa
// recarga de 0,625 s, 4 Hz dão três degraus e a barra pula em vez de encher.
// Escrever sempre renderizaria o HUD 60 vezes por segundo o tempo todo —
// inclusive parado, com a barra cheia e nada acontecendo.
//
// Puro de Vue pra fora: recebe GETTERS e devolve refs. Quem chama `passo` é o
// laço de quadro, uma vez, e é por isso que um teste consegue medir quantas
// escritas aconteceram.

/**
 * @param {object} ctx  getters do estado vivo
 * @param {() => number} ctx.cargaDoGolpe  0..1, cheia quando pode bater
 * @param {() => boolean} ctx.critico  o último golpe foi crítico?
 * @param {() => number} ctx.cargaDoArco  0..1; 0 com o arco desarmado
 * @param {() => boolean} ctx.arcoArmado
 * @param {() => boolean} ctx.guardaLevantada
 */
export function useRoqueCraftIndicadores(ctx) {
  // ⚠️ UM OBJETO REATIVO, e não cinco refs soltos: o consumidor é UM só (a
  // mira), e cinco refs obrigavam o componente a desestruturar — sete linhas
  // de fiação num arquivo que está sob catraca de tamanho justamente pra caber
  // funcionalidade nova como esta.
  const estado = reactive({
    cargaDoGolpe: 1,
    critico: false,
    cargaDoArco: 0,
    arcoArmado: false,
    guarda: false,
  })

  /** Um quadro. Cada campo só é escrito quando o valor mudou de verdade. */
  function passo() {
    const g = ctx.cargaDoGolpe()
    if (estado.cargaDoGolpe !== g) estado.cargaDoGolpe = g
    const c = !!ctx.critico()
    if (estado.critico !== c) estado.critico = c
    // ⚠️ O ARMADO É PERGUNTA SEPARADA DA CARGA. Carga 0 acontece nos dois
    // casos: arco no chão e corda recém-puxada. Se o mostrador saísse de
    // `carga > 0`, ele só apareceria depois do primeiro instante de puxada —
    // e sumiria de novo no quadro em que a flecha sai, antes de o jogador
    // entender que ela saiu.
    const armado = !!ctx.arcoArmado()
    if (estado.arcoArmado !== armado) estado.arcoArmado = armado
    const ca = armado ? ctx.cargaDoArco() : 0
    if (estado.cargaDoArco !== ca) estado.cargaDoArco = ca
    const gu = !!ctx.guardaLevantada()
    if (estado.guarda !== gu) estado.guarda = gu
  }

  return { estado, passo }
}
