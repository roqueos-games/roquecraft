/**
 * Ícones de pixel do RoqueCraft, desenhados em grade de 8×8.
 *
 * ⚠️ POR QUE NÃO MATERIAL ICONS. O jogo é feito de cubos com pixel visível, e a
 * interface usava o conjunto de ícones do Android — globo, groups, tune. Era o
 * que mais denunciava "isto é um aplicativo": num print do menu, o ícone Material
 * é a primeira coisa que o olho reconhece como fora do lugar.
 *
 * ⚠️ A REGRA É "ÍCONE ONDE NÃO CABE RÓTULO", e ela corta nos dois sentidos.
 * Saíram os decorativos: Ajustes, Controles, Créditos e Voltar tinham desenho
 * ao lado de um rótulo que já dizia tudo — não ficavam mais claros, ficavam
 * mais cheios. Ficaram os que carregam sozinhos: o HUD, onde o espaço é de
 * 11px, os controles de toque do celular, onde não há texto nenhum, e as ações
 * principais do menu.
 *
 * A grade é 8×8 e não 16×16 de propósito: em 8 unidades não existe diagonal
 * suave, então toda diagonal sai escadinha — que é exatamente a mesma escadinha
 * do terreno. `crispEdges` impede o navegador de suavizar em tamanho fracionário.
 *
 * Retângulos em vez de `<path>`: caminho com coordenada inteira ainda deixa
 * errar sem perceber, e desenho errado num arquivo de dados é fácil de ler e
 * consertar. Cada linha aqui é uma fileira de pixels.
 */
export const DESENHOS = Object.freeze({
  // ── HUD ───────────────────────────────────────────────────────────────────
  bussola: [
    [3, 0, 2, 1],
    [2, 1, 4, 1],
    [1, 2, 6, 1],
    [0, 3, 8, 1],
    [0, 4, 8, 1],
    [1, 5, 6, 1],
    [2, 6, 4, 1],
    [3, 7, 2, 1],
  ],
  sol: [
    [3, 0, 2, 1],
    [1, 1, 1, 1],
    [3, 1, 2, 1],
    [6, 1, 1, 1],
    [2, 2, 4, 1],
    [0, 3, 8, 1],
    [0, 4, 8, 1],
    [2, 5, 4, 1],
    [1, 6, 1, 1],
    [3, 6, 2, 1],
    [6, 6, 1, 1],
    [3, 7, 2, 1],
  ],
  lua: [
    [2, 0, 3, 1],
    [1, 1, 3, 1],
    [0, 2, 3, 1],
    [0, 3, 3, 1],
    [0, 4, 3, 1],
    [0, 5, 3, 1],
    [1, 6, 3, 1],
    [2, 7, 3, 1],
  ],
  // Base larga e topo estreito. A primeira versão tinha um segundo pico que,
  // em 8 pixels, fundia com o primeiro e virava um montinho sem forma.
  montanha: [
    [3, 2, 2, 1],
    [2, 3, 4, 1],
    [1, 4, 6, 1],
    [0, 5, 8, 1],
    [0, 6, 8, 1],
  ],
  // Duas figuras de alturas diferentes, cada cabeça ENCOSTADA no próprio corpo.
  // Antes a cabeça flutuava dois pixels acima e lia como dois pontos soltos.
  // Duas figuras com um pixel de FOLGA entre elas (x4 vazio). Coladas, os dois
  // corpos viravam um bloco só e o desenho lia como muralha de castelo.
  gente: [
    [1, 1, 2, 2],
    [0, 3, 4, 5],
    [5, 1, 2, 2],
    [5, 3, 3, 5],
  ],
  // Triângulo com ponta de UM pixel. Com a ponta de dois ele saía cego, como se
  // faltasse um pedaço.
  // Largura máxima 6, não 4: o triângulo estreito lia como bandeirinha presa
  // num mastro, porque a coluna da esquerda virava uma barra vertical.
  // Degraus de UM pixel e sem a ponta de 1px. Saltando 1→2→4→6 apareciam
  // entalhes que quebravam a silhueta, e a fileira de um pixel só virava
  // mastro: o desenho lia como bandeirinha, não como triângulo.
  play: [
    [1, 0, 2, 1],
    [1, 1, 3, 1],
    [1, 2, 4, 1],
    [1, 3, 5, 1],
    [1, 4, 4, 1],
    [1, 5, 3, 1],
    [1, 6, 2, 1],
  ],
  globo: [
    [2, 0, 4, 1],
    [1, 1, 6, 1],
    [0, 2, 2, 1],
    [3, 2, 2, 1],
    [6, 2, 2, 1],
    [0, 3, 8, 1],
    [0, 4, 2, 1],
    [3, 4, 2, 1],
    [6, 4, 2, 1],
    [1, 5, 6, 1],
    [2, 6, 4, 1],
  ],
  fechar: [
    [0, 0, 2, 1],
    [6, 0, 2, 1],
    [1, 1, 2, 1],
    [5, 1, 2, 1],
    [2, 2, 2, 1],
    [4, 2, 2, 1],
    [3, 3, 2, 1],
    [3, 4, 2, 1],
    [2, 5, 2, 1],
    [4, 5, 2, 1],
    [1, 6, 2, 1],
    [5, 6, 2, 1],
    [0, 7, 2, 1],
    [6, 7, 2, 1],
  ],
  seta: [
    [4, 1, 2, 1],
    [5, 2, 2, 1],
    [0, 3, 8, 1],
    [0, 4, 8, 1],
    [5, 5, 2, 1],
    [4, 6, 2, 1],
  ],
  coracao: [
    [1, 0, 2, 1],
    [5, 0, 2, 1],
    [0, 1, 8, 1],
    [0, 2, 8, 1],
    [0, 3, 8, 1],
    [1, 4, 6, 1],
    [2, 5, 4, 1],
    [3, 6, 2, 1],
  ],
  // Fruta redonda com cabinho, e não coxa de frango: em 12px, que é o tamanho
  // do pip de fome, a coxa virava um borrão com rabo. Redondo lê na hora.
  // Cabinho de DOIS pixels e uma folha ao lado: com um pixel só o cabo sumia
  // no tamanho de exibição (12px) e a fruta virava um disco.
  comida: [
    [4, 0, 1, 2],
    [5, 1, 2, 1],
    [1, 2, 6, 1],
    [0, 3, 8, 1],
    [0, 4, 8, 1],
    [1, 5, 6, 1],
    [2, 6, 4, 1],
  ],

  // ── Controles de toque (celular) ─────────────────────────────────────────
  // Aqui não existe rótulo: o dedo cobre o botão e o desenho é a única
  // informação. Por isso são as silhuetas mais cheias e mais simples.
  //
  // Cabeça larga em cima, cabo reto descendo. A primeira versão desenhava o
  // cabo na diagonal, fiel a uma picareta de verdade — e em 8 pixels a diagonal
  // virou um zigue-zague que não lia como nada.
  // As pontas DESCEM duas fileiras. Com as pontas rentes à barra, o desenho
  // lia como martelo — e martelo não é picareta.
  // Arco de verdade: topo estreito, barra larga e as pontas caindo. A versão
  // com barra reta e dois cotocos lia como martelo, e martelo não é picareta.
  picareta: [
    [2, 0, 4, 1],
    [1, 1, 6, 1],
    [0, 2, 2, 1],
    [3, 2, 2, 1],
    [6, 2, 2, 1],
    [3, 3, 2, 1],
    [3, 4, 2, 1],
    [3, 5, 2, 1],
    [3, 6, 2, 1],
    [3, 7, 2, 1],
  ],
  pular: [
    [3, 0, 2, 1],
    [2, 1, 4, 1],
    [1, 2, 6, 1],
    [3, 3, 2, 1],
    [3, 4, 2, 1],
    [3, 5, 2, 1],
    [1, 7, 6, 1],
  ],
  // Mergulhar: o espelho exato do `pular`. A linha QUEBRADA em cima lê como
  // superfície d'água (numa arte de uma cor só, o buraco é o segundo tom) e a
  // seta desce pra dentro dela. Cheia, a linha viraria teto.
  mergulhar: [
    [0, 0, 2, 1],
    [3, 0, 2, 1],
    [6, 0, 2, 1],
    [3, 2, 2, 1],
    [3, 3, 2, 1],
    [3, 4, 2, 1],
    [1, 5, 6, 1],
    [2, 6, 4, 1],
    [3, 7, 2, 1],
  ],
  colocar: [
    [1, 1, 6, 1],
    [1, 2, 1, 1],
    [6, 2, 1, 1],
    [3, 3, 2, 2],
    [1, 3, 1, 1],
    [6, 3, 1, 1],
    [1, 4, 1, 1],
    [6, 4, 1, 1],
    [1, 5, 1, 1],
    [6, 5, 1, 1],
    [1, 6, 6, 1],
  ],
  // Baú: a tampa agora ENCOSTA no corpo. Solta, ela lia como dois objetos.
  // O trinco é a ausência de pixel — em desenho de uma cor, buraco é o único
  // jeito de ter dois tons.
  bau: [
    [1, 1, 6, 1],
    [1, 2, 6, 1],
    [0, 3, 8, 1],
    [0, 4, 3, 1],
    [5, 4, 3, 1],
    [0, 5, 8, 1],
    [0, 6, 8, 1],
  ],
  // Asa varrida para cima. Duas divisas empilhadas fundiam num "A".
  // Duas divisas VAZADAS subindo. A asa cheia da versão anterior tinha o peso
  // embaixo à esquerda e lia como seta apontando para a esquerda — o oposto.
  voar: [
    [3, 0, 2, 1],
    [2, 1, 2, 1],
    [4, 1, 2, 1],
    [1, 2, 2, 1],
    [5, 2, 2, 1],
    [0, 3, 2, 1],
    [6, 3, 2, 1],
    [3, 4, 2, 1],
    [2, 5, 2, 1],
    [4, 5, 2, 1],
    [1, 6, 2, 1],
    [5, 6, 2, 1],
    [0, 7, 2, 1],
    [6, 7, 2, 1],
  ],
  pausa: [
    [1, 1, 2, 6],
    [5, 1, 2, 6],
  ],

  // ── Toque (Goal 21) ───────────────────────────────────────────────────────
  //
  // ⚠️ O QUE O TECLADO ALCANÇA, O TOQUE ALCANÇA. Reger o mundo (K) e o chat (T)
  // nasceram só no teclado, e o founder joga no iPhone: eram invisíveis lá.
  //
  // Nuvem com sol atrás: uma bolha larga embaixo e o sol como quadrado no canto.
  nuvem: [
    [5, 0, 3, 1],
    [5, 1, 1, 1],
    [7, 1, 1, 1],
    [2, 3, 3, 1],
    [1, 4, 6, 1],
    [0, 5, 8, 2],
  ],
  // Balão de fala: retângulo, e o rabinho de dois degraus embaixo à esquerda.
  balao: [
    [0, 1, 8, 4],
    [1, 5, 3, 1],
    [1, 6, 1, 1],
  ],

  // ── Os lugares da armadura (inventário), vazios ───────────────────────────
  // Capacete: calota larga com a viseira aberta embaixo.
  capacete: [
    [2, 1, 4, 1],
    [1, 2, 6, 2],
    [1, 4, 1, 2],
    [6, 4, 1, 2],
  ],
  // Peitoral: ombros largos, o vão do pescoço, a cintura.
  peitoral: [
    [0, 1, 3, 1],
    [5, 1, 3, 1],
    [0, 2, 8, 2],
    [1, 4, 6, 2],
    [2, 6, 4, 1],
  ],
  // Calça: o cós e as duas pernas.
  calca: [
    [1, 1, 6, 2],
    [1, 3, 2, 4],
    [5, 3, 2, 4],
  ],
  // Bota: o cano e a sola comprida.
  bota: [
    [2, 1, 3, 3],
    [2, 4, 5, 2],
  ],

  // ── Lobby ─────────────────────────────────────────────────────────────────
  mais: [
    [3, 1, 2, 6],
    [1, 3, 6, 2],
  ],
  // Dois retângulos deslocados: copiar. A versão anterior tentava dois elos de
  // corrente e, com os furos sendo a única parte escura, saía lendo invertido.
  copiar: [
    [2, 1, 6, 1],
    [7, 2, 1, 1],
    [7, 3, 1, 1],
    [7, 4, 1, 1],
    [6, 5, 2, 1],
    [0, 3, 6, 1],
    [0, 4, 1, 1],
    [5, 4, 1, 1],
    [0, 5, 1, 1],
    [5, 5, 1, 1],
    [0, 6, 1, 1],
    [5, 6, 1, 1],
    [0, 7, 6, 1],
  ],
  // Parede à esquerda e a mesma seta do `seta`, deslocada: sair da sala.
  // Parede, FOLGA de um pixel, e a mesma seta do `seta`. Sem a folga o cabo da
  // seta encostava na parede e as duas formas viravam uma só.
  sair: [
    [0, 0, 2, 8],
    [4, 1, 2, 1],
    [5, 2, 2, 1],
    [3, 3, 5, 1],
    [3, 4, 5, 1],
    [5, 5, 2, 1],
    [4, 6, 2, 1],
  ],
})

/** Existe desenho com este nome? Usado pelo teste que varre os templates. */
export const temIcone = (nome) => Object.prototype.hasOwnProperty.call(DESENHOS, nome)

export const NOMES = Object.keys(DESENHOS)
