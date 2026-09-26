// RoqueCraft - a FORMA dos blocos que não são cubo.
//
// Duas tabelas, uma pergunta cada, e as duas derivadas da MESMA descrição:
//
//   `CAIXAS_DE_BLOCO[id]` — as caixas sólidas, em 0..1 dentro da célula. Quem
//   lê: a física (colisão) e o raycast (mira). Cubo cheio é uma caixa só.
//
//   `FACES_DE_BLOCO[id]`  — os retângulos que o mesher desenha, cada um com a
//   face canônica a que pertence e se ele encosta no plano da célula (só quem
//   encosta pode ser escondido por vizinho opaco). `null` para bloco de forma
//   simples, que continua saindo pelo caminho greedy.
//
// Existe separado de `blocks.js` porque `blocks.js` é CATÁLOGO — o que cada
// bloco é, quanto custa quebrar, o que dropa — e isto é GEOMETRIA. Elas mudam
// por motivos diferentes: catálogo muda quando entra um material, geometria
// muda quando entra uma forma.
//
// Puro: sem three, sem mundo, sem Vue.

import { TABELA_DE_IDS, BLOCKS, FORMA_BASE, FORMA_TOPO, registrarCaixas } from './blocks.js'

// Índice canônico de face: 0:+x 1:-x 2:+y 3:-y 4:+z 5:-z.
// Rotação de 90° em torno de Y que leva -Z em +X. Usada pra girar tanto os
// pontos quanto os índices de face, sem inventar uma segunda convenção.
const GIRA_FACE = { 0: 4, 4: 1, 1: 5, 5: 0, 2: 2, 3: 3 }
const giraPonto = ([x, y, z]) => [1 - z, y, x]

// Quantas vezes girar pra sair de -Z (a forma escrita à mão) até `orient`.
const VOLTAS = { 5: 0, 0: 1, 4: 2, 1: 3 }

/**
 * Um retângulo da forma livre.
 *
 * `uv` é OPCIONAL e existe por um motivo específico: o emissor deriva o uv da
 * POSIÇÃO do canto (u e v são dois dos três eixos do mundo). Isso serve pra
 * quase tudo — e não serve pro TAMPO de um móvel que gira.
 *
 * O tampo tem u e v os dois horizontais, então uv = f(x, z) é a mesma função
 * nas quatro orientações: girar os cantos gira o polígono e deixa a textura
 * parada, presa ao mundo. A cama girada saía com o travesseiro sempre no mesmo
 * canto do terreno, e as quatro variantes desenhavam igual — medido em
 * 24/08/2026: 8,6% dos pixels do tampo mudavam ao girar, quando deveriam ser
 * metade.
 *
 * Com `uv` explícito, o par viaja COM o canto: o canto muda de lugar, leva o uv
 * junto, e a textura gira com a peça.
 */
const face = (f, cantos, naBorda, uv = null) => ({ f, cantos, naBorda, uv })

/**
 * Um quad CRUZADO: plano vertical que mora na fatia de face +y.
 *
 * É a mesma peça que a cruz da planta, trazida pro caminho de forma livre. Ela
 * viola de propósito a regra de que a fatia de face diz a direção do polígono —
 * o polígono é vertical e a fatia é +y — e ganha duas coisas com isso: a camada
 * de textura própria (o mesher lê `FACE_LAYERS[id * 6 + 2]`) e a normal pra
 * cima, que é a certa pra peça fina e emissiva. Fogo recebe luz do CÉU, não da
 * parede em que encosta.
 *
 * ⚠️ A MARCA NÃO É DECORATIVA. `mesherFaces.spec.js` conta quantos triângulos
 * declaram +y sendo geometricamente verticais e exige que o número BATA com o
 * número de faces marcadas aqui. Não é uma isenção da regra de winding: é uma
 * contabilidade exata. Marcar uma face como cruzada sem ela ser vertical, ou
 * criar uma vertical sem marcar, quebra o teste dos dois lados.
 *
 * Só vale em bloco `cutout`, que é DoubleSide — é isso que torna o winding
 * irrelevante aqui, e o teste confere também isso.
 */
const faceCruzada = (cantos, uv, semente = 0) => ({
  f: 2,
  cantos,
  naBorda: false,
  uv,
  cruzada: true,
  // `semente` viaja no atributo `aWind` dos vértices (ver o emissor de forma
  // livre no mesher). É um número por FACE, igual nos quatro cantos — que é
  // exatamente o que a fase de uma partícula precisa: se variasse por vértice,
  // o quad se esticaria em vez de subir inteiro.
  semente,
})

/**
 * A escada, escrita UMA vez, com o degrau baixo apontando pro -Z.
 *
 * Dez retângulos. Poderiam ser oito se as laterais em L fossem um polígono só,
 * mas retângulo é o que o emissor sabe desenhar e o que a interpolação de luz
 * sabe sombrear — dois quads a mais por escada é preço de nada perto de manter
 * o caminho de desenho com um único formato.
 *
 * `naBorda` diz quais podem ser escondidas por vizinho opaco. As duas que
 * ficam em plano INTERNO — o tampo do degrau baixo e o espelho vertical — não
 * podem: não há vizinho do outro lado delas, só ar dentro da própria célula.
 */
// ⚠️ A ORDEM DOS CANTOS É A NORMAL. O emissor não recebe normal nenhuma: ela
// sai do produto vetorial (c1-c0) × (c3-c0), e tem que dar exatamente a
// direção da face declarada. Ordem trocada = face virada pra dentro = triângulo
// engolido pelo backface culling = buraco na escada que ninguém acha em print,
// porque buraco em escada parece sombra. `formas.spec.js` confere as 32
// variantes por conta; a primeira versão deste arquivo errou 192 de 320.
const ESCADA_NZ = [
  // piso inteiro
  face(
    3,
    [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
    true,
  ),
  // tampo do degrau baixo (plano interno, y = 0.5)
  face(
    2,
    [
      [0, 0.5, 0.5],
      [1, 0.5, 0.5],
      [1, 0.5, 0],
      [0, 0.5, 0],
    ],
    false,
  ),
  // tampo da parte alta
  face(
    2,
    [
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0.5],
      [0, 1, 0.5],
    ],
    true,
  ),
  // costas inteiras
  face(
    4,
    [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
    true,
  ),
  // frente baixa
  face(
    5,
    [
      [0, 0.5, 0],
      [1, 0.5, 0],
      [1, 0, 0],
      [0, 0, 0],
    ],
    true,
  ),
  // espelho do degrau (plano interno, z = 0.5)
  face(
    5,
    [
      [0, 1, 0.5],
      [1, 1, 0.5],
      [1, 0.5, 0.5],
      [0, 0.5, 0.5],
    ],
    false,
  ),
  // laterais: a de baixo cobre a célula inteira, a de cima só a metade alta
  face(
    1,
    [
      [0, 0, 0],
      [0, 0, 1],
      [0, 0.5, 1],
      [0, 0.5, 0],
    ],
    true,
  ),
  face(
    1,
    [
      [0, 0.5, 0.5],
      [0, 0.5, 1],
      [0, 1, 1],
      [0, 1, 0.5],
    ],
    true,
  ),
  face(
    0,
    [
      [1, 0.5, 0],
      [1, 0.5, 1],
      [1, 0, 1],
      [1, 0, 0],
    ],
    true,
  ),
  face(
    0,
    [
      [1, 1, 0.5],
      [1, 1, 1],
      [1, 0.5, 1],
      [1, 0.5, 0.5],
    ],
    true,
  ),
]

const CAIXAS_ESCADA_NZ = [
  [0, 0, 0, 1, 0.5, 1],
  [0, 0.5, 0.5, 1, 1, 1],
]

const CUBO = [[0, 0, 0, 1, 1, 1]]

// ── Transformações ──────────────────────────────────────────────────────────

const giraFace = (f) => ({
  f: GIRA_FACE[f.f],
  cantos: f.cantos.map(giraPonto),
  naBorda: f.naBorda,
  cruzada: f.cruzada,
  semente: f.semente,
  // ⚠️ O uv NÃO é transformado — ele viaja com o índice do canto. É essa
  // imobilidade que faz a textura girar junto com a peça: o canto muda de
  // lugar no mundo levando o mesmo pedaço de imagem consigo.
  uv: f.uv,
})

// Vira de cabeça pra baixo. O `reverse` dos cantos é obrigatório: espelhar em
// Y inverte a lateralidade do polígono, e sem reordenar o winding sai ao
// contrário — a face é descartada pelo backface culling e a escada de teto
// nasce com buracos. Custou uma leitura de tela pra achar na laje da neve.
const viraFace = (f) => ({
  f: f.f === 2 ? 3 : f.f === 3 ? 2 : f.f,
  cantos: f.cantos.map(([x, y, z]) => [x, 1 - y, z]).reverse(),
  naBorda: f.naBorda,
  // O `reverse` dos cantos exige o mesmo reverse no uv: eles são pares.
  uv: f.uv ? f.uv.slice().reverse() : null,
})

const giraCaixa = ([x0, y0, z0, x1, y1, z1]) => [1 - z1, y0, x0, 1 - z0, y1, x1]
const viraCaixa = ([x0, y0, z0, x1, y1, z1]) => [x0, 1 - y1, z0, x1, 1 - y0, z1]

function escadaEm(orient, topo) {
  let faces = ESCADA_NZ
  let caixas = CAIXAS_ESCADA_NZ
  for (let i = 0; i < VOLTAS[orient]; i++) {
    faces = faces.map(giraFace)
    caixas = caixas.map(giraCaixa)
  }
  if (topo) {
    faces = faces.map(viraFace)
    caixas = caixas.map(viraCaixa)
  }
  return { faces, caixas }
}

// ── A CAMA ──────────────────────────────────────────────────────────────────
//
// Escrita UMA vez, com a PONTA DE FORA virada pro -Z, e as outras três
// orientações saem de giro — a mesma máquina da escada.
//
// A ponta de fora é o que orienta cada metade, e as duas metades da MESMA cama
// apontam pra lados OPOSTOS: numa cama deitada com a cabeceira no -Z, a
// cabeceira tem ponta de fora no -Z e o pé tem ponta de fora no +Z. É isso que
// põe os dois pés de cada metade nos cantos certos — quatro pés no móvel
// inteiro, um em cada quina, e nenhum no meio.
//
// Medidas do original, em dezesseis avos:
//   · colchão de 3/16 a 9/16, ocupando a célula inteira em x e z
//   · pés de 3×3×3, do chão até 3/16, nos dois cantos da ponta de fora
//
// O vão embaixo é o que separa cama de laje vermelha. Sem ele o móvel é um
// bloco, e foi assim que a cama nasceu na rodada 8.
const P = 3 / 16 // altura do pé, e também a largura dele
const COLCHAO = 9 / 16

// Uma caixa 3D vira cinco retângulos: quatro lados e o fundo. O tampo não entra
// — ele fica encostado no colchão e nunca aparece.
function pe(x0, z0) {
  const x1 = x0 + P
  const z1 = z0 + P
  return [
    face(
      0,
      [
        [x1, 0, z1],
        [x1, 0, z0],
        [x1, P, z0],
        [x1, P, z1],
      ],
      false,
    ),
    face(
      1,
      [
        [x0, 0, z0],
        [x0, 0, z1],
        [x0, P, z1],
        [x0, P, z0],
      ],
      false,
    ),
    face(
      4,
      [
        [x0, 0, z1],
        [x1, 0, z1],
        [x1, P, z1],
        [x0, P, z1],
      ],
      false,
    ),
    face(
      5,
      [
        [x1, 0, z0],
        [x0, 0, z0],
        [x0, P, z0],
        [x1, P, z0],
      ],
      false,
    ),
    face(
      3,
      [
        [x0, 0, z0],
        [x1, 0, z0],
        [x1, 0, z1],
        [x0, 0, z1],
      ],
      true,
    ),
  ]
}

const CAMA_NZ = [
  // TAMPO DO COLCHÃO, com uv explícito.
  //
  // É o único retângulo da cama que precisa disso, e é o que carrega o desenho
  // que o jogador olha. `v = 0` na PONTA DE FORA: o travesseiro é desenhado lá,
  // e girando a peça ele acompanha.
  face(
    2,
    [
      [0, COLCHAO, 1],
      [1, COLCHAO, 1],
      [1, COLCHAO, 0],
      [0, COLCHAO, 0],
    ],
    false,
    [
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0],
    ],
  ),
  // fundo do colchão — aparece de baixo, entre os pés
  face(
    3,
    [
      [0, P, 0],
      [1, P, 0],
      [1, P, 1],
      [0, P, 1],
    ],
    false,
  ),
  // ponta de fora (−Z): a cabeceira ou o pé da cama, conforme a metade
  face(
    5,
    [
      [1, P, 0],
      [0, P, 0],
      [0, COLCHAO, 0],
      [1, COLCHAO, 0],
    ],
    true,
  ),
  // ponta de dentro (+Z): encostada na outra metade. Existe porque metade de
  // cama solta não pode ser vazada por dentro.
  face(
    4,
    [
      [0, P, 1],
      [1, P, 1],
      [1, COLCHAO, 1],
      [0, COLCHAO, 1],
    ],
    true,
  ),
  // laterais longas
  face(
    0,
    [
      [1, P, 1],
      [1, P, 0],
      [1, COLCHAO, 0],
      [1, COLCHAO, 1],
    ],
    true,
  ),
  face(
    1,
    [
      [0, P, 0],
      [0, P, 1],
      [0, COLCHAO, 1],
      [0, COLCHAO, 0],
    ],
    true,
  ),
  // os dois pés, nos cantos da ponta de fora
  ...pe(0, 0),
  ...pe(1 - P, 0),
]

/** A cama girada pra `orient` — a direção pra onde a PONTA DE FORA aponta. */
function camaEm(orient) {
  let faces = CAMA_NZ
  for (let i = 0; i < VOLTAS[orient]; i++) faces = faces.map(giraFace)
  return faces
}

// ── Cerca ───────────────────────────────────────────────────────────────────

/**
 * As seis faces de uma caixa qualquer, com o winding certo.
 *
 * ⚠️ A ORDEM DOS CANTOS É A NORMAL — o emissor não recebe normal nenhuma, ela
 * sai de (c1−c0) × (c3−c0). Escrever as 96 faces da cerca à mão seria repetir
 * 96 vezes a chance de inverter uma; esta função foi conferida canto a canto
 * contra as faces da ESCADA, que já estavam certas, e `formas.spec.js` confere
 * o resultado por produto vetorial.
 *
 * `naBorda` sai da própria geometria: só encosta no plano da célula quem tem a
 * coordenada em 0 ou 1. Um retângulo interno marcado como de borda seria
 * escondido por um vizinho opaco e a cerca ficaria vazada por dentro.
 */
const facesDaCaixa = ([x0, y0, z0, x1, y1, z1]) => [
  face(
    3,
    [
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y0, z1],
      [x0, y0, z1],
    ],
    y0 === 0,
  ),
  face(
    2,
    [
      [x0, y1, z1],
      [x1, y1, z1],
      [x1, y1, z0],
      [x0, y1, z0],
    ],
    y1 === 1,
  ),
  face(
    4,
    [
      [x0, y0, z1],
      [x1, y0, z1],
      [x1, y1, z1],
      [x0, y1, z1],
    ],
    z1 === 1,
  ),
  face(
    5,
    [
      [x0, y1, z0],
      [x1, y1, z0],
      [x1, y0, z0],
      [x0, y0, z0],
    ],
    z0 === 0,
  ),
  face(
    1,
    [
      [x0, y0, z0],
      [x0, y0, z1],
      [x0, y1, z1],
      [x0, y1, z0],
    ],
    x0 === 0,
  ),
  face(
    0,
    [
      [x1, y0, z1],
      [x1, y0, z0],
      [x1, y1, z0],
      [x1, y1, z1],
    ],
    x1 === 1,
  ),
]

// Medidas do original, em dezesseis avos: poste 4×16×4 no centro; travessa
// 2 de largura, nas alturas 6..9 e 12..15, indo do poste até a borda da célula.
const P0 = 6 / 16
const P1 = 10 / 16
const T0 = 7 / 16
const T1 = 9 / 16
const B0 = 6 / 16
const B1 = 9 / 16
const A0 = 12 / 16
const A1 = 15 / 16

const POSTE = [P0, 0, P0, P1, 1, P1]

// As travessas de cada lado. O braço vai do poste até a BORDA da célula — é
// isso que faz duas cercas vizinhas se encontrarem sem vão: cada uma cobre a
// própria metade.
const BRACOS = {
  1: [
    [T0, B0, 0, T1, B1, P0],
    [T0, A0, 0, T1, A1, P0],
  ], // −Z
  2: [
    [P1, B0, T0, 1, B1, T1],
    [P1, A0, T0, 1, A1, T1],
  ], // +X
  4: [
    [T0, B0, P1, T1, B1, 1],
    [T0, A0, P1, T1, A1, 1],
  ], // +Z
  8: [
    [0, B0, T0, P0, B1, T1],
    [0, A0, T0, P0, A1, T1],
  ], // −X
}

/**
 * A cerca com as conexões pedidas.
 *
 * ⚠️ A CAIXA DE COLISÃO É A MESMA GEOMETRIA, não um cubo cheio. Com cubo cheio,
 * um poste solto no meio do campo bloquearia a célula inteira e o jogador
 * esbarraria no ar ao lado dele. Com poste + braços, duas cercas vizinhas
 * fecham a passagem (os braços se encontram na divisa) e um poste solto se
 * contorna — que é o que o olho promete.
 *
 * ⚠️ E A ALTURA É 1, NÃO 1,5 COMO NO ORIGINAL. As caixas deste motor vivem
 * dentro da célula: uma caixa de 1,5 descreveria espaço que pertence à célula
 * de cima, e `solidAt(x, y, z)` deixaria de ser uma pergunta sobre (x,y,z). O
 * efeito prático é que o JOGADOR pula a cerca. A criatura não — `stepMob`
 * recusa o degrau quando o bloco é cerca (é o que faz o curral funcionar). O
 * portão é o conserto certo pro jogador, e reusa a textura da tábua.
 */
function cercaCom(bits) {
  const caixas = [POSTE]
  for (const bit of [1, 2, 4, 8]) {
    if (bits & bit) caixas.push(...BRACOS[bit])
  }
  return { caixas, faces: caixas.flatMap((c) => facesDaCaixa(c)) }
}

// ── Portão de cerca ─────────────────────────────────────────────────────────

// Medidas do original: dois montantes de 2 de largura nas beiradas, e duas
// travessas entre eles. O portão fica na faixa central de Z, alinhado com o
// braço da cerca (que também vive em 7..9), pra que os dois se encontrem sem
// degrau lateral.
const M0 = 0 // montante esquerdo, de x=0
const M1 = 2 / 16
const N0 = 14 / 16 // montante direito, até x=1
const N1 = 1
const PZ0 = 6 / 16
const PZ1 = 10 / 16
const TZ0 = 7 / 16
const TZ1 = 9 / 16
const PY0 = 5 / 16

/**
 * O portão escrito UMA vez, fechado, com o vão atravessando o eixo X.
 *
 * ⚠️ FECHADO ELE BARRA, ABERTO ELE NÃO — e é por isso que o aberto não é
 * sólido em `blocks.js`. As caixas do aberto existem só pro DESENHO e pro
 * contorno da mira: um portão aberto que continuasse colidindo seria um enfeite
 * que engana, e o jogador ficaria preso no próprio curral.
 */
const PORTAO_FECHADO = [
  [M0, PY0, PZ0, M1, 1, PZ1],
  [N0, PY0, PZ0, N1, 1, PZ1],
  [M1, 6 / 16, TZ0, N0, 9 / 16, TZ1],
  [M1, 12 / 16, TZ0, N0, 15 / 16, TZ1],
]

// Aberto: os montantes ficam, e as duas folhas giram pra encostar neles,
// correndo ao longo de Z. Sem as folhas, o portão aberto pareceria ter sumido.
const PORTAO_ABERTO = [
  [M0, PY0, PZ0, M1, 1, PZ1],
  [N0, PY0, PZ0, N1, 1, PZ1],
  [M0, 6 / 16, PZ1, M1, 9 / 16, 1],
  [M0, 12 / 16, PZ1, M1, 15 / 16, 1],
  [N0, 6 / 16, PZ1, N1, 9 / 16, 1],
  [N0, 12 / 16, PZ1, N1, 15 / 16, 1],
]

function portaoEm(orient, aberto) {
  let caixas = aberto ? PORTAO_ABERTO : PORTAO_FECHADO
  let faces = caixas.flatMap((c) => facesDaCaixa(c))
  for (let i = 0; i < VOLTAS[orient]; i++) {
    faces = faces.map(giraFace)
    caixas = caixas.map(giraCaixa)
  }
  return { caixas, faces }
}

// ── A PORTA ─────────────────────────────────────────────────────────────────
//
// Uma folha de 3/16 de espessura, célula inteira de altura (cada metade é uma
// célula). Fechada, a folha está no plano −Z da célula, com a dobradiça em
// x = 0; aberta, girou 90° em torno da dobradiça e está no plano −X. As duas
// metades usam a MESMA caixa: o que muda entre elas é só a textura
// (`oak_door_bottom` / `oak_door_top`), decidida em `blocks.js`.
//
// ⚠️ A ABERTA COLIDE NA FOLHA, e a folha aberta mora junto ao batente: 3/16 de
// parede e 13/16 de vão. Não é o portão (que registra caixa vazia): um portão
// aberto some da passagem inteira, uma porta aberta continua ocupando o canto
// — é o que impede o jogador de atravessar a folha desenhada.
const ESPESSURA_DA_PORTA = 3 / 16
const PORTA_FECHADA = [[0, 0, 0, 1, 1, ESPESSURA_DA_PORTA]]
const PORTA_ABERTA = [[0, 0, 0, ESPESSURA_DA_PORTA, 1, 1]]

function portaEm(orient, aberta) {
  let caixas = aberta ? PORTA_ABERTA : PORTA_FECHADA
  let faces = caixas.flatMap((c) => facesDaCaixa(c))
  for (let i = 0; i < VOLTAS[orient]; i++) {
    faces = faces.map(giraFace)
    caixas = caixas.map(giraCaixa)
  }
  return { caixas, faces }
}

// ── O ALÇAPÃO ───────────────────────────────────────────────────────────────
//
// Fechado: uma tampa de 3/16 deitada no chão da célula — pisa-se nela como
// numa camada de neve, e ela tapa o buraco de baixo. Aberto: a tampa em pé,
// encostada no plano +Z da célula, que com a orientação do olhar
// (`orientacaoPeloOlhar`) é o lado OPOSTO a quem colocou — a dobradiça fica
// longe do jogador, e o buraco se abre do lado dele. No plano −Z (o da folha
// fechada da porta) a tampa levantada barraria justamente quem quer descer.
// Uma célula só, e a orientação gira como a do portão.
const ALCAPAO_FECHADO = [[0, 0, 0, 1, ESPESSURA_DA_PORTA, 1]]
const ALCAPAO_ABERTO = [[0, 0, 1 - ESPESSURA_DA_PORTA, 1, 1, 1]]

function alcapaoEm(orient, aberto) {
  let caixas = aberto ? ALCAPAO_ABERTO : ALCAPAO_FECHADO
  let faces = caixas.flatMap((c) => facesDaCaixa(c))
  for (let i = 0; i < VOLTAS[orient]; i++) {
    faces = faces.map(giraFace)
    caixas = caixas.map(giraCaixa)
  }
  return { caixas, faces }
}

/**
 * O CENTRO DO VÃO de uma porta aberta, em fração da célula: `{ x, z }`, ou
 * `null` se o id não é porta aberta.
 *
 * ⚠️ NÃO É O CENTRO DA CÉLULA. A folha aberta fica encostada numa borda e come
 * 3/16; o que sobra é 13/16, e o aldeão tem 0,7 de largura — 0,11 de folga.
 * Centrado na célula, a quina dele encosta na folha e ele para na soleira: a
 * sonda da porta o fotografou parado em z=8,55, alinhado no meio e preso.
 * Quem quer atravessar mira o meio do que está LIVRE.
 */
export function centroDoVao(id) {
  const def = BLOCKS[id]
  if (!def?.porta?.aberta) return null
  const [x0, , z0, x1, , z1] = portaEm(def.porta.orient, true).caixas[0]
  const livre = (a, b) => (b - a < 0.5 ? (a <= 0 ? (b + 1) / 2 : a / 2) : 0.5)
  return { x: livre(x0, x1), z: livre(z0, z1) }
}

// ── Tabelas por id ──────────────────────────────────────────────────────────

// ── A TOCHA ─────────────────────────────────────────────────────────────────
//
// Antes de 25/08/2026 a tocha era `plant: true, scale: 0.16` — o desenho do
// MATINHO, duas folhas cruzadas, encolhido a 16% da célula. Um X de dois
// pixels e meio no chão. "A tocha também está horrorosa" (founder) é a
// descrição exata do que aquilo era, e nenhuma textura consertaria: o defeito
// era de FORMA.
//
// Agora são duas peças. Um POSTE, caixa de 2/16 de lado por 10/16 de altura, e
// uma CHAMA, dois quads cruzados na diagonal.
//
// A chama sai na fatia de face +y por dois motivos que andam juntos: é de lá
// que o mesher tira a camada de textura (`FACE_LAYERS[id * 6 + 2]`, declarada
// como `torch_flame` em blocks.js), e é de lá que sai a normal pra cima — a
// mesma que a cruz da planta usa, pelo mesmo motivo. Peça fina e emissiva
// recebe luz do CÉU, não da parede em que encosta.
//
// ⚠️ `naBorda: false` em tudo que é plano INTERNO. O poste tem 2/16 e mora no
// meio da célula: nenhuma das quatro laterais dele encosta na divisa, então
// nenhuma pode ser escondida por vizinho opaco. Só o pé (y = 0) está na divisa
// de verdade. Marcar as laterais como `naBorda: true` faria a tocha perder
// metade do poste ao ser encostada numa parede — e isso só apareceria com a
// tocha encostada, que é exatamente onde ela mais vive.
const TC0 = 7 / 16 // lado do poste
const TC1 = 9 / 16
const TCH = 10 / 16 // altura do poste

// A coluna de madeira dentro do tile `torch`: o gerador pinta o cabo em
// |x−32| < 5 e y > 20, e o v da amostragem é 1 − y/64 (a franja verde do
// `grass_side`, pintada em y pequeno, sai no ALTO do bloco — é a prova).
const TU0 = 27 / 64
const TU1 = 37 / 64
const TV0 = 0.02
const TV1 = 0.66

// A base da chama, para o tampo do poste: é a brasa.
const TE0 = 0.44
const TE1 = 0.56
const TEV0 = 0.22
const TEV1 = 0.31

// O tile inteiro da chama, para os dois quads cruzados.
const TF0 = 0.266
const TF1 = 0.734
const TFV0 = 0.25
const TFV1 = 0.9375

const CH_Y0 = 0.5 // a chama nasce dentro do topo do poste
const CH_Y1 = 0.9
const CH_H = 0.15 // meia diagonal dos quads cruzados

const retanguloUv = (u0, v0, u1, v1) => [
  [u0, v0],
  [u1, v0],
  [u1, v1],
  [u0, v1],
]

// O canto do tile da chama onde mora o pontinho da faísca (ver o gerador de
// textura). v = 1 − y/64, então o canto de BAIXO do desenho é v pequeno.
const TS_U0 = 3 / 64
const TS_U1 = 17 / 64
const TS_V0 = 1 / 64
const TS_V1 = 15 / 64

// Oito faíscas: posição de partida, meio-lado e SEMENTE de fase.
//
// ⚠️ TODA SEMENTE É MAIOR QUE ZERO, e isso é o que identifica a faísca no
// shader. Os quads da chama e os da faísca vivem na MESMA camada de textura (o
// canto livre do tile da chama), então a camada não os separa — quem separa é
// `aWind > 0`. Uma semente zero aqui faria aquela faísca ser tratada como
// chama: ela ficaria parada, colada no ar acima da tocha, e pior, ficaria
// PARADA no meio de quatro que sobem, que é mais visível que não ter faísca
// nenhuma.
//
// ⚠️ O MEIO-LADO É PEQUENO DE PROPÓSITO — 2 a 3 centésimos de bloco.
//
// A primeira versão usava 4 a 5 centésimos e as faíscas saíram do tamanho de
// marshmallows: a foto mostrou cinco bolotas brilhantes subindo em fila, que lê
// como fada, não como brasa. Brasa é um ponto. O bloom depois ENGORDA tudo que
// é emissivo, então o desenho tem que nascer menor do que se quer ver.
//
// Oito e não cinco: com partículas pequenas, poucas viram uma fileira de
// pontos; muitas viram um jato. O que faz o olho ler fogo é a quantidade
// desencontrada, não o tamanho de cada uma.
const FAISCAS = [
  [0.5, 0.84, 0.5, 0.026, 0.07],
  [0.44, 0.9, 0.56, 0.021, 0.19],
  [0.58, 0.87, 0.45, 0.025, 0.31],
  [0.47, 0.94, 0.43, 0.018, 0.44],
  [0.55, 0.86, 0.57, 0.023, 0.56],
  [0.42, 0.88, 0.47, 0.02, 0.68],
  [0.53, 0.92, 0.53, 0.024, 0.79],
  [0.5, 0.96, 0.46, 0.019, 0.91],
].map(([cx, cy, cz, h, semente], i) => {
  const diag = i % 2 === 0
  const a = diag ? [cx - h, cz - h] : [cx - h, cz + h]
  const b = diag ? [cx + h, cz + h] : [cx + h, cz - h]
  return faceCruzada(
    [
      [a[0], cy - h, a[1]],
      [b[0], cy - h, b[1]],
      [b[0], cy + h, b[1]],
      [a[0], cy + h, a[1]],
    ],
    retanguloUv(TS_U0, TS_V0, TS_U1, TS_V1),
    semente,
  )
})

const TOCHA_CHAO = [
  // as quatro laterais do poste
  face(
    0,
    [
      [TC1, 0, TC1],
      [TC1, 0, TC0],
      [TC1, TCH, TC0],
      [TC1, TCH, TC1],
    ],
    false,
    retanguloUv(TU0, TV0, TU1, TV1),
  ),
  face(
    1,
    [
      [TC0, 0, TC0],
      [TC0, 0, TC1],
      [TC0, TCH, TC1],
      [TC0, TCH, TC0],
    ],
    false,
    retanguloUv(TU0, TV0, TU1, TV1),
  ),
  face(
    4,
    [
      [TC0, 0, TC1],
      [TC1, 0, TC1],
      [TC1, TCH, TC1],
      [TC0, TCH, TC1],
    ],
    false,
    retanguloUv(TU0, TV0, TU1, TV1),
  ),
  face(
    5,
    [
      [TC1, 0, TC0],
      [TC0, 0, TC0],
      [TC0, TCH, TC0],
      [TC1, TCH, TC0],
    ],
    false,
    retanguloUv(TU0, TV0, TU1, TV1),
  ),
  // tampo do poste: a brasa
  face(
    2,
    [
      [TC0, TCH, TC1],
      [TC1, TCH, TC1],
      [TC1, TCH, TC0],
      [TC0, TCH, TC0],
    ],
    false,
    retanguloUv(TE0, TEV0, TE1, TEV1),
  ),
  // pé: única face na divisa de verdade, some quando há bloco embaixo
  face(
    3,
    [
      [TC0, 0, TC0],
      [TC1, 0, TC0],
      [TC1, 0, TC1],
      [TC0, 0, TC1],
    ],
    true,
    retanguloUv(TU0, TV0, TU1, TV0 + 0.02),
  ),
  // a chama: dois quads cruzados na diagonal. Diagonal e não paralelo aos
  // eixos porque quem anda pelo mundo anda olhando pros eixos — plano
  // paralelo ao eixo é plano que some de perfil bem na hora em que o jogador
  // está de frente pra ele.
  faceCruzada(
    [
      [0.5 - CH_H, CH_Y0, 0.5 - CH_H],
      [0.5 + CH_H, CH_Y0, 0.5 + CH_H],
      [0.5 + CH_H, CH_Y1, 0.5 + CH_H],
      [0.5 - CH_H, CH_Y1, 0.5 - CH_H],
    ],
    retanguloUv(TF0, TFV0, TF1, TFV1),
  ),
  faceCruzada(
    [
      [0.5 + CH_H, CH_Y0, 0.5 - CH_H],
      [0.5 - CH_H, CH_Y0, 0.5 + CH_H],
      [0.5 - CH_H, CH_Y1, 0.5 + CH_H],
      [0.5 + CH_H, CH_Y1, 0.5 - CH_H],
    ],
    retanguloUv(TF0, TFV0, TF1, TFV1),
  ),
  // ── AS FAÍSCAS ────────────────────────────────────────────────────────────
  //
  // "Precisamos que a chama tenha particulas e movimento simulando fogo real"
  // — founder, 25/08/2026.
  //
  // Cinco quadradinhos que o VÉRTICE faz subir, cada um com sua fase. Eles
  // moram na geometria do bloco em vez de num sistema de partículas separado, e
  // essa escolha é o que os torna baratos: viajam na malha do chunk como
  // qualquer outra face, não custam nada por quadro na CPU, não precisam de
  // estado, e aparecem e somem junto com o chunk. Um sistema de partículas de
  // verdade exigiria varrer o mundo atrás de tochas todo quadro.
  //
  // A diagonal ALTERNA entre as faíscas. Quad vertical some de perfil, e quem
  // anda pelo mundo anda olhando pros eixos: com todas na mesma diagonal,
  // metade das direções de olhar veria a tocha sem faísca nenhuma.
  ...FAISCAS,
]

const CAIXAS_TOCHA_CHAO = [[TC0, 0, TC0, TC1, TCH, TC1]]

// A tocha de parede é a MESMA peça inclinada, não outra peça. O pé encosta na
// parede do −Z e o topo se afasta dela — é o afastamento que tira a chama de
// dentro do bloco que a segura.
//
// O cisalhamento usa `min(y, TCH)` e não `y`: acima do topo do poste só existe
// chama, e continuar inclinando ali deixaria a chama à frente da própria
// cabeça do poste, boiando. Travado no topo do poste, a chama sobe reta a
// partir da brasa, que é o que o olho espera.
const deslocaZ = (y) => -0.4 + Math.min(y, TCH) * 0.55
const inclina = ([x, y, z]) => [x, y + 0.1, z + deslocaZ(y)]
// ⚠️ A CHAMA SOBE RETA, e por isso ela usa o deslocamento do TOPO DO POSTE nos
// quatro cantos em vez do deslocamento da própria altura.
//
// Com o deslocamento por canto, a base do quad (y = 0,5) andava menos que o
// topo (y = 0,9) e o plano saía TORTO. Não é só feio: um quad torto deixa de
// ser vertical, e aí a marca `cruzada` vira mentira — a normal declarada pra
// cima passa a divergir de verdade da geometria. `mesherFaces.spec.js` recusou
// as quatro variantes de parede por isto, com o texto exato "face cruzada NÃO
// é vertical", antes de existir qualquer print da tocha.
const inclinaChama = ([x, y, z]) => [x, y + 0.1, z + deslocaZ(TCH)]
// ⚠️ O PÉ CONTINUA NA LISTA, e `naBorda: false` é o motivo de ele existir aqui.
//
// A primeira versão desta peça descartava a face −y, copiando o raciocínio da
// tocha de chão — lá o pé encosta no bloco de baixo e nunca aparece. Na parede
// não encosta em nada: a peça está pendurada a 0,1 do chão da célula e a sola
// dela é visível de baixo, que é de onde se olha uma tocha de parede na maior
// parte do tempo. `mesherFaces.spec.js` recusou as quatro variantes por "sem
// -y" antes de qualquer print, e estava certo.
const TOCHA_PAREDE_NZ = TOCHA_CHAO.map((f) => ({
  ...f,
  cantos: f.cantos.map(f.cruzada ? inclinaChama : inclina),
  naBorda: false,
}))
// Caixa da mira: uma AABB que cobre o poste inclinado. Ela não pode ser a
// caixa do poste em pé — a peça saiu do lugar, e mira que não acompanha a
// forma é tocha que não dá pra quebrar de onde ela aparece.
const CAIXAS_TOCHA_PAREDE_NZ = [[TC0, 0.1, 0.0, TC1, 0.78, 0.62]]

function tochaEm(parede) {
  if (parede === null || parede === undefined) {
    return { faces: TOCHA_CHAO, caixas: CAIXAS_TOCHA_CHAO }
  }
  let faces = TOCHA_PAREDE_NZ
  let caixas = CAIXAS_TOCHA_PAREDE_NZ
  for (let i = 0; i < VOLTAS[parede]; i++) {
    faces = faces.map(giraFace)
    caixas = caixas.map(giraCaixa)
  }
  return { faces, caixas }
}

// ── O BAMBU ─────────────────────────────────────────────────────────────────
//
// Um colmo de 3/16 que atravessa a célula INTEIRA em altura — de y=0 a y=1 —
// para que blocos empilhados formem uma vara contínua. Se ele parasse antes do
// teto, cada junta de blocos abriria um vão e a touceira viraria uma pilha de
// tocos.
//
// `naBorda` é TRUE no pé e no topo, e só neles: são as duas únicas faces que
// encostam na divisa da célula. É isso que faz o colmo empilhado não desenhar
// tampa nenhuma entre um bloco e o seguinte — o vizinho de cima é bambu, e a
// face some. As quatro laterais ficam no meio da célula e nunca são escondidas.
const BB0 = 6.5 / 16
const BB1 = 9.5 / 16
// A coluna do tile onde o colmo foi desenhado (x de 24 a 40, ver o gerador).
const BU0 = 24 / 64
const BU1 = 40 / 64

const COLMO = [
  face(
    0,
    [
      [BB1, 0, BB1],
      [BB1, 0, BB0],
      [BB1, 1, BB0],
      [BB1, 1, BB1],
    ],
    false,
    retanguloUv(BU0, 0, BU1, 1),
  ),
  face(
    1,
    [
      [BB0, 0, BB0],
      [BB0, 0, BB1],
      [BB0, 1, BB1],
      [BB0, 1, BB0],
    ],
    false,
    retanguloUv(BU0, 0, BU1, 1),
  ),
  face(
    4,
    [
      [BB0, 0, BB1],
      [BB1, 0, BB1],
      [BB1, 1, BB1],
      [BB0, 1, BB1],
    ],
    false,
    retanguloUv(BU0, 0, BU1, 1),
  ),
  face(
    5,
    [
      [BB1, 0, BB0],
      [BB0, 0, BB0],
      [BB0, 1, BB0],
      [BB1, 1, BB0],
    ],
    false,
    retanguloUv(BU0, 0, BU1, 1),
  ),
  face(
    2,
    [
      [BB0, 1, BB1],
      [BB1, 1, BB1],
      [BB1, 1, BB0],
      [BB0, 1, BB0],
    ],
    true,
    retanguloUv(BU0, 0.45, BU1, 0.55),
  ),
  face(
    3,
    [
      [BB0, 0, BB0],
      [BB1, 0, BB0],
      [BB1, 0, BB1],
      [BB0, 0, BB1],
    ],
    true,
    retanguloUv(BU0, 0.45, BU1, 0.55),
  ),
]

// A folhagem: dois pares de quads cruzados, um mais baixo e menor, para a
// touceira não virar um disco. Semente ZERO em todos — folha não é faísca, e é
// a semente positiva que faz o vértice tratar a peça como partícula que sobe.
const FOLHA_BAMBU = [
  [0.5, 0.62, 0.5, 0.34],
  [0.5, 0.9, 0.5, 0.46],
].flatMap(([cx, cy, cz, h]) => [
  faceCruzada(
    [
      [cx - h, cy - h * 0.7, cz - h],
      [cx + h, cy - h * 0.7, cz + h],
      [cx + h, cy + h * 0.7, cz + h],
      [cx - h, cy + h * 0.7, cz - h],
    ],
    retanguloUv(0, 0, 1, 1),
  ),
  faceCruzada(
    [
      [cx + h, cy - h * 0.7, cz - h],
      [cx - h, cy - h * 0.7, cz + h],
      [cx - h, cy + h * 0.7, cz + h],
      [cx + h, cy + h * 0.7, cz - h],
    ],
    retanguloUv(0, 0, 1, 1),
  ),
])

const CAIXAS_BAMBU = [[BB0, 0, BB0, BB1, 1, BB1]]
const bambuEm = (folha) => ({
  faces: folha ? [...COLMO, ...FOLHA_BAMBU] : COLMO,
  caixas: CAIXAS_BAMBU,
})

// ── A LANTERNA ────────────────────────────────────────────────────────────────────
//
// A textura \`lantern\` foi desenhada pra um bloco CHEIO: o corpo luminoso no
// centro, com margens transparentes em volta. Renderizada como cubo 1×1 com
// \`cutout\`, as faces da frente e de trás recortavam essas margens e sobrava uma
// caixa de vidro OCA com dois painéis boiando dentro — "os postes de luz estão
// todos bugados" (founder, 18/09/2026). O defeito era de FORMA, o mesmo da
// tocha antes de 25/08: a lanterna nunca teve uma.
//
// Agora é uma caixa pequena (6/16 de lado, 10/16 de altura) que amostra só o
// CORPO da textura nas quatro laterais — então cada face é lanterna cheia, sem
// margem recortada — e a TAMPA metálica no tampo e no fundo. É sólida (o
// \`normalize\` a faz sólida), então a colisão encolhe da célula cheia para esta
// caixa — sem isso, o desenho seria a lanterninha e a física um cubo invisível.
const LL0 = 5 / 16
const LL1 = 11 / 16
const LLH = 10 / 16
// O corpo, no gerador de textura: |x−32| < 14, 16 < y < 50. O u é x/64; o v é
// 1 − y/64 (a mesma amostragem da tocha), então o topo do corpo (y baixo) sai
// no alto da caixa.
const LBU0 = 18 / 64
const LBU1 = 46 / 64
const LBV0 = 1 - 50 / 64
const LBV1 = 1 - 16 / 64
// A tampa: |x−32| < 10, 8 ≤ y ≤ 16.
const LCU0 = 22 / 64
const LCU1 = 42 / 64
const LCV0 = 1 - 16 / 64
const LCV1 = 1 - 8 / 64

const LANTERNA_FACES = (() => {
  const lado = retanguloUv(LBU0, LBV0, LBU1, LBV1)
  const tampa = retanguloUv(LCU0, LCV0, LCU1, LCV1)
  // Laterais e tampo vivem no MEIO da célula (x, z entre 5/16 e 11/16, tampo em
  // y=10/16): \`naBorda: false\`, nenhum encosta na divisa, então nenhum pode ser
  // escondido por vizinho opaco — senão a lanterna some encostada numa parede. O
  // FUNDO é a única face na divisa (y=0), como o pé da tocha: \`naBorda: true\` pra
  // sumir sobre chão opaco e aparecer pousada no poste de cerca (que não é opaco).
  return [
    face(
      0,
      [
        [LL1, 0, LL1],
        [LL1, 0, LL0],
        [LL1, LLH, LL0],
        [LL1, LLH, LL1],
      ],
      false,
      lado,
    ),
    face(
      1,
      [
        [LL0, 0, LL0],
        [LL0, 0, LL1],
        [LL0, LLH, LL1],
        [LL0, LLH, LL0],
      ],
      false,
      lado,
    ),
    face(
      4,
      [
        [LL0, 0, LL1],
        [LL1, 0, LL1],
        [LL1, LLH, LL1],
        [LL0, LLH, LL1],
      ],
      false,
      lado,
    ),
    face(
      5,
      [
        [LL1, 0, LL0],
        [LL0, 0, LL0],
        [LL0, LLH, LL0],
        [LL1, LLH, LL0],
      ],
      false,
      lado,
    ),
    face(
      2,
      [
        [LL0, LLH, LL1],
        [LL1, LLH, LL1],
        [LL1, LLH, LL0],
        [LL0, LLH, LL0],
      ],
      false,
      tampa,
    ),
    face(
      3,
      [
        [LL0, 0, LL0],
        [LL1, 0, LL0],
        [LL1, 0, LL1],
        [LL0, 0, LL1],
      ],
      true,
      tampa,
    ),
  ]
})()

const CAIXAS_LANTERNA = [[LL0, 0, LL0, LL1, LLH, LL1]]

export const CAIXAS_DE_BLOCO = (() => {
  const a = new Array(TABELA_DE_IDS).fill(null)
  for (const b of Object.values(BLOCKS)) {
    if (b.escada) {
      a[b.id] = escadaEm(b.escada.orient, b.escada.topo).caixas
      // A física lê pelo `solidAt`, que devolve o que está em SOLIDO_DE_BLOCO.
      // Só a forma livre precisa registrar: o resto já saiu certo de lá.
      if (b.solid) registrarCaixas(b.id, a[b.id])
    } else if (b.cerca) {
      a[b.id] = cercaCom(b.cerca.bits).caixas
      if (b.solid) registrarCaixas(b.id, a[b.id])
    } else if (b.porta) {
      a[b.id] = portaEm(b.porta.orient, b.porta.aberta).caixas
      registrarCaixas(b.id, a[b.id])
    } else if (b.alcapao) {
      a[b.id] = alcapaoEm(b.alcapao.orient, b.alcapao.aberto).caixas
      registrarCaixas(b.id, a[b.id])
    } else if (b.portao) {
      a[b.id] = portaoEm(b.portao.orient, b.portao.aberto).caixas
      // ⚠️ A MIRA E A FÍSICA LEEM TABELAS DIFERENTES, e é o que faz o portão
      // aberto funcionar: `CAIXAS_DE_BLOCO` (acima) guarda a forma DESENHADA,
      // que a mira e o contorno usam; `registrarCaixas` guarda o que COLIDE.
      // Aberto, a segunda é vazia — atravessa-se, mas continua sendo possível
      // clicar nele pra fechar. Com `solid: false` no lugar disto, a mira
      // deixava de ver o portão aberto e ele virava um bloco que não dava pra
      // fechar nem quebrar (achado pela sonda em 25/08/2026).
      registrarCaixas(b.id, b.portao.aberto ? [] : a[b.id])
    } else if (b.bambu) {
      a[b.id] = bambuEm(b.bambu.folha).caixas
      // O colmo COLIDE, e a caixa registrada é ele mesmo — 3/16 de lado —, não
      // o cubo cheio que `SOLIDO_DE_BLOCO` daria por padrão. Sem esta linha
      // andar num bambuzal seria esbarrar em paredes invisíveis de um bloco.
      if (b.solid) registrarCaixas(b.id, a[b.id])
    } else if (b.tocha) {
      // Só a mira: a tocha não é sólida, então nada de `registrarCaixas`. É a
      // mesma separação do portão aberto — dá pra clicar nela, não dá pra
      // esbarrar nela.
      a[b.id] = tochaEm(b.tocha.parede).caixas
    } else if (b.lanterna) {
      // Sólida (o `normalize` a faz sólida), então a colisão encolhe para a
      // caixa pequena — igual à cerca. Sem isto, o desenho seria a lanterninha
      // e a física continuaria um cubo cheio: uma parede invisível em volta.
      a[b.id] = CAIXAS_LANTERNA
      if (b.solid) registrarCaixas(b.id, a[b.id])
    } else a[b.id] = [[0, FORMA_BASE[b.id], 0, 1, FORMA_TOPO[b.id], 1]]
  }
  a[0] = null // ar não tem caixa
  return a
})()

export const FACES_DE_BLOCO = (() => {
  const a = new Array(TABELA_DE_IDS).fill(null)
  for (const b of Object.values(BLOCKS)) {
    if (b.escada) a[b.id] = escadaEm(b.escada.orient, b.escada.topo).faces
    else if (b.cerca) a[b.id] = cercaCom(b.cerca.bits).faces
    else if (b.portao) a[b.id] = portaoEm(b.portao.orient, b.portao.aberto).faces
    else if (b.porta) a[b.id] = portaEm(b.porta.orient, b.porta.aberta).faces
    else if (b.alcapao) a[b.id] = alcapaoEm(b.alcapao.orient, b.alcapao.aberto).faces
    else if (b.cama) a[b.id] = camaEm(b.cama.orient)
    else if (b.tocha) a[b.id] = tochaEm(b.tocha.parede).faces
    else if (b.bambu) a[b.id] = bambuEm(b.bambu.folha).faces
    else if (b.lanterna) a[b.id] = LANTERNA_FACES
  }
  return a
})()

/** O bloco tem forma livre (faces próprias) em vez de sair pelo greedy? */
export const EH_FORMA_LIVRE = (() => {
  const a = new Uint8Array(TABELA_DE_IDS)
  for (const b of Object.values(BLOCKS))
    a[b.id] =
      b.escada ||
      b.cama ||
      b.cerca ||
      b.portao ||
      b.porta ||
      b.alcapao ||
      b.tocha ||
      b.bambu ||
      b.lanterna
        ? 1
        : 0
  return a
})()

/**
 * Tudo que o passe greedy tem que PULAR: planta e forma livre.
 *
 * Uma tabela em vez de duas consultas, e não é preciosismo — esse teste roda
 * uma vez por face de cada célula da seção, 24 mil vezes por malha. Consultar
 * `IS_PLANT` e `EH_FORMA_LIVRE` separados custou 6% do tempo de malha quando a
 * escada entrou, medido em `bench-mesher.mjs`.
 */
export const PULA_GREEDY = (() => {
  const a = new Uint8Array(TABELA_DE_IDS)
  for (const b of Object.values(BLOCKS))
    a[b.id] =
      b.plant ||
      b.escada ||
      b.cama ||
      b.cerca ||
      b.portao ||
      b.porta ||
      b.alcapao ||
      b.tocha ||
      b.bambu ||
      b.lanterna
        ? 1
        : 0
  return a
})()

export { CUBO }
