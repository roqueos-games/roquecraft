// RoqueCraft — O ITEM NA MÃO É UM DESENHO EXTRUDADO, e não um punhado de caixas.
//
// ⚠️ ESTA É A DIFERENÇA DE PATAMAR QUE O FOUNDER APONTOU em 15/09/2026, olhando
// as fotos lado a lado: "a nossa modelagem está extremamente porcaria perto do
// jogo original". Ele estava certo, e a causa não era pose nem proporção — eu
// passei uma rodada inteira calibrando ângulo enquanto o problema era outro.
//
// A espada da onda 1 tinha CINCO caixas lisas: cabo, pomo, guarda, lâmina e
// ponta. Cinco retângulos não têm gume, não têm ponta afiada, não têm degrau de
// pixel na borda e não têm enrolamento no cabo. Nenhum ajuste de assento tira
// uma espada de cinco retângulos do lugar onde ela está.
//
// A técnica do gênero é outra: o item é uma TEXTURA de 16×16 pixels extrudada
// em voxel — cada pixel vira um bloquinho com um pixel de profundidade. É isso
// que dá silhueta recortada, contorno escuro por sombra lateral e detalhe fino.
// A técnica é pública; o DESENHO aqui é nosso, linha por linha.
//
// ⚠️ E ELE NÃO EXPLODE A CONTAGEM DE MALHAS, porque mescla. Uma extrusão
// ingênua de 16×16 daria até 256 caixas por item; `extrudarSprite` junta pixels
// vizinhos da mesma cor em retângulos (varredura gulosa em duas dimensões) e a
// espada sai com menos de trinta. O teste cobra esse teto.

/** O lado do desenho, em pixels. É a medida do gênero, e ela cabe na memória. */
export const LADO = 16

/** Um pixel do desenho vale isto em unidades de mundo. 16 px = 1 bloco. */
export const PIXEL = 1 / 16

/**
 * Os SÍMBOLOS do desenho, e o papel de cada um.
 *
 * ⚠️ SÍMBOLO E NÃO COR. O metal da picareta muda com o tier (madeira, pedra,
 * ferro, diamante) e o desenho é o MESMO: pintar cor no sprite obrigaria quatro
 * cópias de cada item e a quinta ficaria esquecida no dia em que entrasse um
 * tier novo. O símbolo diz "isto é metal"; quem resolve a cor é a paleta.
 */
export const SIMBOLOS = Object.freeze({
  '.': null, // vazio
  '#': 'metal',
  '+': 'metalClaro',
  '-': 'metalEscuro',
  c: 'cabo',
  C: 'caboEscuro',
  o: 'corda',
  f: 'chama',
  b: 'brasa',
})

/**
 * Os DESENHOS. Dezesseis linhas de dezesseis colunas, de cima para baixo.
 *
 * ⚠️ TODOS NA VERTICAL, com a ponta em cima e o cabo embaixo. O gênero desenha
 * a ferramenta na diagonal dentro do quadro de 16×16; aqui a diagonal é
 * trabalho do ASSENTO (`pecaNaMao.js`), que já gira a peça 22,9° medidos. Fazer
 * as duas coisas somaria dois ângulos e ninguém saberia qual mexer.
 */
export const DESENHOS = Object.freeze({
  // ⚠️ A CABEÇA É SÓLIDA NO MEIO, e a primeira versão não era: ela tinha as duas
  // pontas ligadas por um arco vazado, e na foto do ciclo de cavar a cabeça
  // aparecia SOLTA no ar, com o cabo noutro canto. Um pescoço de dois pixels não
  // sobrevive a um sprite de um pixel de profundidade visto de lado.
  pickaxe: [
    '..+##+....+##+..',
    '.+#--######--#+.',
    '.##-+######+-##.',
    '..+..+####+..+..',
    '......+##+......',
    '.......##.......',
    '.......cC.......',
    '.......cC.......',
    '.......cC.......',
    '.......cC.......',
    '.......cC.......',
    '.......cC.......',
    '.......cC.......',
    '.......cC.......',
    '.......cC.......',
    '.......-C.......',
  ],
  axe: [
    '....+####.......',
    '...+#####-......',
    '...##---##-.....',
    '...##...##-.....',
    '...+#...##-.....',
    '....+####-......',
    '.....+###.......',
    '.......##.......',
    '.......cC.......',
    '.......cC.......',
    '.......cC.......',
    '.......cC.......',
    '.......cC.......',
    '.......cC.......',
    '.......cC.......',
    '.......-C.......',
  ],
  shovel: [
    '......+##+......',
    '.....+####+.....',
    '.....######.....',
    '.....+####+.....',
    '......-##-......',
    '.......##.......',
    '.......cC.......',
    '.......cC.......',
    '.......cC.......',
    '.......cC.......',
    '.......cC.......',
    '.......cC.......',
    '.......cC.......',
    '.......cC.......',
    '.......cC.......',
    '.......-C.......',
  ],
  hoe: [
    '...+#####+......',
    '...+#---#+......',
    '...-#...-#......',
    '....-....##.....',
    '.........##.....',
    '.......####.....',
    '.......cC.......',
    '.......cC.......',
    '.......cC.......',
    '.......cC.......',
    '.......cC.......',
    '.......cC.......',
    '.......cC.......',
    '.......cC.......',
    '.......cC.......',
    '.......-C.......',
  ],
  sword: [
    '.......++.......',
    '......+##.......',
    '......+##.......',
    '......+##.......',
    '......+##.......',
    '......+##.......',
    '......+##.......',
    '......+##.......',
    '......+##.......',
    '.....-+##-......',
    '...-+######-....',
    '....--####-.....',
    '.......cC.......',
    '.......cC.......',
    '......-cC-......',
    '......-##-......',
  ],
  shears: [
    '....+#....#+....',
    '....+#....#+....',
    '....+#....#+....',
    '.....#....#.....',
    '.....+#..#+.....',
    '......+##+......',
    '.......##.......',
    '......o##o......',
    '.....oc..co.....',
    '....oc....co....',
    '....c......c....',
    '....c......c....',
    '....C......C....',
    '.....C....C.....',
    '......C..C......',
    '................',
  ],
  igniter: [
    '......+##.......',
    '.....+#--#......',
    '.....##..-#.....',
    '.....##...#.....',
    '.....+#--#+.....',
    '......+##+......',
    '.......cC.......',
    '.......cC.......',
    '.......cC.......',
    '.......cC.......',
    '.......cC.......',
    '.......cC.......',
    '.......cC.......',
    '.......cC.......',
    '.......-C.......',
    '................',
  ],
  torch: [
    '................',
    '.......ff.......',
    '......ffff......',
    '......fbbf......',
    '......fbbf......',
    '.......bb.......',
    '.......cC.......',
    '.......cC.......',
    '.......cC.......',
    '.......cC.......',
    '.......cC.......',
    '.......cC.......',
    '.......cC.......',
    '.......cC.......',
    '.......cC.......',
    '.......cC.......',
  ],
})

/**
 * Lê o desenho num grid de papéis, já validado.
 *
 * ⚠️ VALIDA A FORMA, e não confia. Uma linha com quinze caracteres em vez de
 * dezesseis desloca todo o resto do desenho meio pixel para a esquerda, e o
 * resultado não é um erro: é uma espada torta que alguém acha que foi de
 * propósito. Um símbolo que não existe na tabela vira buraco silencioso.
 */
export function gradeDoDesenho(linhas) {
  if (!Array.isArray(linhas) || linhas.length !== LADO) {
    throw new Error(`desenho precisa de ${LADO} linhas, veio ${linhas?.length}`)
  }
  return linhas.map((linha, y) => {
    if (typeof linha !== 'string' || linha.length !== LADO) {
      throw new Error(`linha ${y} precisa de ${LADO} colunas, veio ${linha?.length}`)
    }
    return [...linha].map((ch, x) => {
      if (!(ch in SIMBOLOS)) throw new Error(`símbolo "${ch}" desconhecido em (${x}, ${y})`)
      return SIMBOLOS[ch]
    })
  })
}

/**
 * EXTRUDA o desenho em caixas, mesclando vizinhos da mesma cor.
 *
 * A varredura é gulosa e em duas dimensões: parte de cada pixel ainda livre,
 * estica para a direita enquanto a cor for a mesma, depois estica para baixo
 * enquanto a FAIXA INTEIRA for da mesma cor. É o mesmo algoritmo que a malha do
 * mundo usa para juntar faces, e pelo mesmo motivo — trinta caixas desenham o
 * que duzentas e cinquenta e seis desenhariam, e a placa de vídeo sente.
 *
 * O eixo Y do desenho cresce para BAIXO (linha 0 é o topo) e o do mundo cresce
 * para cima: a conversão acontece aqui, uma vez, em vez de em cada desenho.
 *
 * @param linhas as 16 strings do desenho
 * @param profundidade em pixels (1 = a espessura do gênero)
 * @returns `[{ papel, w, h, d, x, y, z }]` em unidades de mundo, centrado
 */
export function extrudarSprite(linhas, profundidade = 1) {
  const grade = gradeDoDesenho(linhas)
  const usado = grade.map((l) => l.map(() => false))
  const caixas = []
  const meio = LADO / 2

  for (let y = 0; y < LADO; y++) {
    for (let x = 0; x < LADO; x++) {
      const papel = grade[y][x]
      if (!papel || usado[y][x]) continue

      // Estica para a direita.
      let larg = 1
      while (x + larg < LADO && !usado[y][x + larg] && grade[y][x + larg] === papel) larg++

      // Estica para baixo, mas só enquanto a faixa inteira acompanhar.
      //
      // ⚠️ AQUI NÃO SE CONSULTA `usado`, e isso é uma invariante, não um
      // esquecimento: a varredura vai de cima para baixo, então um retângulo
      // anterior que cobrisse (y+alt, x+i) teria começado numa linha ≤ y e
      // cobriria também (y, x+i) — que está livre, senão não estaríamos aqui.
      // A checagem existia e um mutante provou que ela nunca mudava nada:
      // condição que nunca decide é decoração, e decoração em laço quente é
      // pior, porque parece proteção.
      let alt = 1
      descer: while (y + alt < LADO) {
        for (let i = 0; i < larg; i++) {
          if (grade[y + alt][x + i] !== papel) break descer
        }
        alt++
      }

      for (let j = 0; j < alt; j++) for (let i = 0; i < larg; i++) usado[y + j][x + i] = true

      caixas.push({
        papel,
        w: larg * PIXEL,
        h: alt * PIXEL,
        d: profundidade * PIXEL,
        // O centro do retângulo, em unidades de mundo, com o desenho centrado
        // no (0,0) e o Y virado para cima.
        x: (x + larg / 2 - meio) * PIXEL,
        y: (meio - (y + alt / 2)) * PIXEL,
        z: 0,
        rx: 0,
        ry: 0,
        rz: 0,
      })
    }
  }
  return caixas
}

/** Quantos pixels do desenho estão pintados. Serve de prova de vida ao teste. */
export const pixeisPintados = (linhas) =>
  gradeDoDesenho(linhas).reduce((n, l) => n + l.filter(Boolean).length, 0)

/** O desenho desta classe, ou `null`. */
export const desenhoDe = (classe) => DESENHOS[classe] || null

/**
 * O TOM de um pixel de metal a partir da cor do tier.
 *
 * ⚠️ O VOLUME VEM DA PINTURA, e não da luz. Um sprite extrudado é quase chapado
 * de frente: a direcional bate igual em toda a face, e sem o gume claro e a
 * sombra escura a espada nova seria uma silhueta boa e cinza uniforme por
 * dentro. É por isso que o desenho tem três símbolos de metal e não um.
 *
 * ⚠️ E MORA AQUI, e não no `viewmodel`: enquanto era uma função local de lá,
 * nenhum teste alcançava, e um mutante que apagava o brilho (devolvendo a cor do
 * tier crua) passou por doze testes verdes sem ninguém notar.
 *
 * O clareado puxa para o branco além de multiplicar, senão um metal já escuro
 * (madeira) clareia para um marrom mais forte em vez de brilhar.
 */
export const BRILHO = 1.28
export const SOMBRA = 0.62

export function tomDoMetal(hex, fator) {
  const r = (hex >> 16) & 255
  const g = (hex >> 8) & 255
  const b = hex & 255
  const mistura = (v) => {
    const escalado = v * fator
    const final = fator > 1 ? escalado + (255 - escalado) * 0.18 : escalado
    return Math.max(0, Math.min(255, Math.round(final)))
  }
  return (mistura(r) << 16) | (mistura(g) << 8) | mistura(b)
}
