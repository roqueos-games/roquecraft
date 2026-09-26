//
// CACHOEIRA DE MONTANHA — a forma da queda, pura, sem mundo e sem three.js.
//
// "e eu quero cachoeiras em montanhas também" — founder, 13/09/2026.
//
// ⚠️ O RELEVO NÃO TEM PAREDÃO. Eu tentei primeiro o caminho óbvio — achar uma
// beirada natural e só abrir a torneira — e MEDI que ele não existe. Varredura
// de 160.801 colunas com a semente 1337, em 13/09/2026:
//
//   bioma mountains: 7.290 colunas
//   maior desnível para o vizinho IMEDIATO: 4 blocos, em 8 colunas das 7.290
//   desnível típico para o vizinho imediato: 1 bloco
//
// E `cachoeira.js` exige coluna CONTÍGUA de `ALTURA_MINIMA = 3` para chamar
// aquilo de cachoeira — de propósito, para que escadinha não soe como paredão.
// Ou seja: com o terreno como ele é, uma fonte solta na montanha viraria um
// riacho que desce em degraus de um bloco, sem uma única coluna de altura 3.
// Som nenhum, borrifo nenhum. A medição matou a ideia bonita.
//
// Então a queda é ESCULPIDA junto com a nascente: abre-se um patamar na
// encosta, e a nascente fica no lábio dele. O que sai é o que a montanha faria
// se tivesse rocha mais dura em cima — um degrau, uma queda e uma poça.
//
// ⚠️ E A ÁGUA É ESCRITA INTEIRA, não só a fonte. A fila de atualização é
// REATIVA: ela acorda por edição perto do jogador, e ninguém varre chunk
// recém-gerado atrás de líquido (varrer acordaria o oceano inteiro a cada
// chunk). Uma fonte solta ficaria parada para sempre, pendurada no ar, até
// alguém cavar do lado. Por isso este arquivo escreve o ponto fixo COMPLETO da
// regra de `fluidos.js` — nascente, coluna caindo e lâmina da poça —, e a
// simulação, quando enfim acordar, encontra exatamente o que ela mesma teria
// calculado e não muda nada.
//
import { AIR, AGUA, ID, ID_DE_NIVEL, NIVEL_CAINDO } from './blocks.js'

/** O id da célula de coluna caindo. É ele que `cachoeira.js` procura. */
export const AGUA_CAINDO = ID_DE_NIVEL[AGUA][NIVEL_CAINDO]

/**
 * Quantos blocos separam a nascente do fundo de pedra do patamar.
 *
 * ⚠️ NÃO É A ALTURA DA QUEDA. Dois blocos se perdem no caminho e é aritmética,
 * não gosto: o primeiro, logo abaixo da nascente, é lâmina que ESCORRE (a
 * célula ao lado da fonte, que ainda não tem água por cima); o último é a
 * lâmina da poça. Sobram `PROFUNDIDADE − 2` células caindo — com 10, são 8, e
 * `pesoDaAltura(8)` dá 0,56 do ganho máximo do leito de cachoeira. Baixar para
 * 5 daria 3, o mínimo absoluto de `cachoeira.js`, e a queda ficaria quase muda.
 */
export const PROFUNDIDADE = 10

/** Quantos passos encosta abaixo o patamar avança. */
export const COMPRIMENTO = 4

/** Meia-largura MÍNIMA do patamar. 1 = três colunas de largura. */
export const LARGURA = 1

/**
 * A meia-largura do patamar que esta cortina exige.
 *
 * ⚠️ DERIVADA, E NÃO UMA CONSTANTE MAIOR. A primeira versão desta onda subiu
 * `LARGURA` de 1 para 2 direto, achando que bastava caber. O resultado, medido
 * no ruído de verdade: ZERO cachoeiras no mundo inteiro. `baciaFechada` exige
 * rocha sob TODA coluna do patamar e parede em TODO o anel — cinco colunas de
 * largura pedem um platô que a montanha quase nunca tem. Alargar a poça para
 * uma cortina que talvez nem seja larga é pagar o preço sem levar nada.
 *
 * Agora a poça cresce só quando a cortina cresce, e sempre com uma coluna de
 * folga de cada lado, que é o que impede a água da ponta de vazar pela borda.
 */
export const meiaDoPatamar = (deslocamentos) =>
  Math.max(LARGURA, Math.max(...deslocamentos.map(Math.abs)) + 1)

/**
 * A LARGURA DA CORTINA — o que esta onda conserta.
 *
 * ⚠️ O FOUNDER DISSE QUE "AS CACHOEIRAS NUNCA SÃO MAIORES QUE UM BLOCO", E NÃO
 * HAVIA CONSTANTE NENHUMA PARA MUDAR. A largura 1 era IMPLÍCITA: o plano
 * escrevia UMA nascente e derivava dela UM par `(qx, qz)`. Não havia número
 * errado para corrigir — havia uma forma que só sabia fazer um fio.
 *
 * Três coisas seguravam isso, e as três precisaram de resposta:
 *   1. a regra de fluido — água que CAI não alimenta os lados, então uma
 *      nascente só nunca produz duas colunas caindo. Resposta: N nascentes,
 *      uma por coluna, lado a lado no lábio.
 *   2. `labioFechado` — ele existe para garantir saída ÚNICA, e o comentário
 *      dele conta o defeito que consertou. Resposta: ele continua valendo,
 *      porque o vizinho de uma nascente dentro da cortina é OUTRA nascente
 *      apoiada em rocha na altura do lábio — não é buraco, não empata.
 *   3. o lábio precisa ser PLANO ao longo da cortina, senão uma nascente nasce
 *      no ar ou enterrada. Resposta: `labioPlano`.
 */
export const LARGURA_MAXIMA_DA_QUEDA = 3

/**
 * Os deslocamentos perpendiculares das colunas da cortina, centrados.
 *
 * 1 → [0] · 2 → [0, 1] · 3 → [−1, 0, 1]. A de duas colunas é a única
 * assimétrica, e é de propósito: cortina par não tem coluna do meio, e forçar
 * simetria pediria meia coluna.
 */
export function deslocamentosDaQueda(n) {
  const largura = Math.max(1, Math.min(LARGURA_MAXIMA_DA_QUEDA, n | 0))
  if (largura === 1) return [0]
  if (largura === 2) return [0, 1]
  return [-1, 0, 1]
}

/**
 * Quantas colunas esta cachoeira tem. Função pura da coordenada e da semente,
 * como tudo em worldgen: a mesma nascente dá a mesma cortina em qualquer
 * chunk vizinho que a calcule.
 */
export function larguraDaQueda(hash, x, z) {
  return 1 + Math.floor(hash(x, 29, z) * LARGURA_MAXIMA_DA_QUEDA)
}

/** A altura da coluna caindo que esta forma produz. Derivada, nunca digitada. */
export const ALTURA_DA_QUEDA = PROFUNDIDADE - 2

/** O quanto o plano se afasta da nascente: patamar mais o anel da bacia. */
export const ALCANCE_DO_PLANO = COMPRIMENTO + 1

/** Lado da célula da grade que sorteia UMA nascente candidata. */
export const CELULA = 12

/**
 * Margem da célula onde a candidata pode cair.
 *
 * ⚠️ É ELA QUE PROÍBE DUAS CACHOEIRAS SE CRUZAREM, e o número não é gosto. A
 * candidata de uma célula cai no offset 5 ou 6; a da célula seguinte, no 17 ou
 * 18 da mesma régua. A menor distância possível entre duas é 11 — e o plano
 * escreve no máximo 4 blocos e LÊ no máximo 5 para cada lado da nascente. Nem
 * as escritas se tocam nem uma escrita cai dentro do que a outra mediu.
 *
 * Sem isto, a medição de 13/09/2026 pegou dois patamares encaixados: o segundo
 * escavou POR BAIXO da poça do primeiro, e a poça de cima ficou pendurada. A
 * água não sumia — fonte é fonte —, mas o arranjo deixava de ser o que a regra
 * calcularia, e a fila terminava o serviço na frente do jogador.
 */
export const MARGEM = 5
const LIVRES = CELULA - 2 * MARGEM

/**
 * Esta coluna é a candidata da sua célula?
 *
 * Grade e não sorteio: a decisão passou a ser função PURA da coordenada, o que
 * garante o espaçamento acima e, de quebra, não consome mais número do
 * sorteador do chunk — as árvores e a grama do mundo continuam exatamente onde
 * já estavam.
 */
export function ehCandidata(hash, x, z) {
  const cx = Math.floor(x / CELULA)
  const cz = Math.floor(z / CELULA)
  const ox = MARGEM + Math.floor(hash(cx, 11, cz) * LIVRES)
  const oz = MARGEM + Math.floor(hash(cx, 13, cz) * LIVRES)
  return x - cx * CELULA === ox && z - cz * CELULA === oz
}

const DIRECOES = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

/**
 * Para onde a encosta desce, aqui.
 *
 * Devolve `null` no platô — sem desnível nenhum, a nascente não teria para onde
 * correr e o patamar viraria um poço no meio do nada.
 */
export function direcaoDaDescida(alturaEm, x, z) {
  const aqui = alturaEm(x, z)
  let melhor = null
  let menor = aqui
  for (const [dx, dz] of DIRECOES) {
    const h = alturaEm(x + dx, z + dz)
    if (h < menor) {
      menor = h
      melhor = [dx, dz]
    }
  }
  return melhor
}

/** As colunas do patamar, em coordenada global. */
function colunasDoPatamar(x, z, [dx, dz], meia = LARGURA) {
  const px = dz
  const pz = -dx
  const saida = []
  for (let s = 1; s <= COMPRIMENTO; s++) {
    for (let t = -meia; t <= meia; t++) {
      saida.push([x + dx * s + px * t, z + dz * s + pz * t])
    }
  }
  return saida
}

/**
 * A poça fica DENTRO de uma bacia, ou não fica.
 *
 * ⚠️ Sem esta checagem a lâmina vaza pela borda mais baixa e o patamar
 * amanhece seco — e pior: seco no ponto fixo, porque o que eu escrevi como
 * poça deixa de ser o que a regra calcularia, e a primeira visita da fila
 * apagaria tudo. Toda coluna do anel que cerca o patamar precisa ter rocha na
 * altura da lâmina; a nascente e o seu lábio entram no anel pelo mesmo motivo.
 */
function baciaFechada({ alturaEm, rochaEm }, x, z, direcao, lamina, meia = LARGURA) {
  const colunas = colunasDoPatamar(x, z, direcao, meia)
  const dentro = new Set(colunas.map(([cx, cz]) => `${cx},${cz}`))
  // ⚠️ CHÃO ANTES DE PAREDE. A primeira versão só media parede e deixou poça
  // pendurada sobre caverna — 32 células numa única semente, medidas em
  // 13/09/2026. `alturaEm` dá o TOPO da coluna e não diz nada sobre o que há
  // nove blocos abaixo dele, que é justamente onde a poça se apoia.
  for (const [cx, cz] of colunas) {
    if (!rochaEm(cx, lamina - 1, cz)) return false
  }
  for (const [cx, cz] of colunas) {
    for (const [dx, dz] of DIRECOES) {
      const vx = cx + dx
      const vz = cz + dz
      if (dentro.has(`${vx},${vz}`)) continue
      if (alturaEm(vx, vz) < lamina) return false
      if (!rochaEm(vx, lamina, vz)) return false
    }
  }
  return true
}

/**
 * A nascente só pode ter UMA saída, e é a queda.
 *
 * ⚠️ Este foi o defeito que a primeira medição pegou, em 13/09/2026: três
 * cachoeiras nasceram e DUAS divergiam do ponto fixo — a regra queria escrever
 * lâmina de nível 1 numa célula de ar ao lado da nascente. A causa é a regra de
 * escolha de `fluidos.js`: a fonte procura buraco nas quatro direções e alimenta
 * TODAS as que empatam na menor distância. Se o vizinho lateral também tiver
 * vão embaixo, ele empata com a queda e recebe água junto — e o que eu escrevi
 * deixa de ser o que a regra calcularia. Na prática: a nascente escorreria
 * também pelo lado, e a primeira visita da fila abriria um segundo fio.
 *
 * Exigir rocha na altura do lábio nos outros três lados desempata por
 * construção: sem buraco a um passo, só a direção da queda tem distância 1.
 */
function labioFechado({ alturaEm, rochaEm }, x, z, [dx, dz], altura, deslocamentos = [0], meu = 0) {
  // ⚠️ O VIZINHO DENTRO DA CORTINA É EXCEÇÃO, e é o que permite largura > 1.
  //
  // A regra original exigia rocha nos três lados que não são a queda, e existia
  // para desempatar: sem buraco a um passo, só a direção da queda tem distância
  // 1. Numa cortina, o vizinho lateral é OUTRA NASCENTE — água, não buraco —
  // apoiada no mesmo lábio de rocha. Ela não empata com a queda e não abre fio
  // nenhum. Exigir rocha ali reprovaria toda cachoeira larga, por um motivo que
  // não se aplica.
  const px = dz
  const pz = -dx
  const dentro = new Set()
  for (const t of deslocamentos) {
    if (t === meu) continue
    dentro.add(`${px * (t - meu)},${pz * (t - meu)}`)
  }
  for (const [vx, vz] of DIRECOES) {
    if (vx === dx && vz === dz) continue
    if (dentro.has(`${vx},${vz}`)) continue
    if (alturaEm(x + vx, z + vz) < altura) return false
    if (!rochaEm(x + vx, altura, z + vz)) return false
  }
  return true
}

/**
 * O lábio é PLANO ao longo da cortina?
 *
 * ⚠️ SEM ISTO, A CORTINA NASCE TORTA. Cada coluna da queda precisa de uma
 * nascente apoiada no lábio, e a nascente fica em `altura + 1` da coluna do
 * meio. Onde o lábio sobe um bloco, aquela nascente ficaria ENTERRADA; onde
 * desce, ficaria boiando um bloco acima do chão e a regra a derrubaria por ali
 * em vez de pela queda — dois fios, um deles no lugar errado.
 */
function labioPlano({ alturaEm }, x, z, [dx, dz], altura, deslocamentos) {
  const px = dz
  const pz = -dx
  for (const t of deslocamentos) {
    if (t === 0) continue
    if (alturaEm(x + px * t, z + pz * t) !== altura) return false
  }
  return true
}

/**
 * O plano da cachoeira em (x, z), ou `null` se aqui não dá.
 *
 * `mundo.alturaEm(x, z)` é o topo sólido e `mundo.rochaEm(x, y, z)` diz se há
 * rocha numa célula — os dois em coordenada GLOBAL, e tem que ser global mesmo:
 * o patamar quase sempre cruza a divisa do chunk, e ler só o array local
 * devolveria −1 do outro lado e reprovaria toda cachoeira de beira de chunk.
 *
 * Devolve células em coordenada absoluta, na ordem em que devem ser escritas:
 * primeiro o vazio do patamar, depois a água. A ordem importa — a escavação
 * passa por cima da lâmina se vier depois dela.
 */
export function planoDaCachoeira(mundo, x, z, hash = null) {
  const { alturaEm } = mundo
  const altura = alturaEm(x, z)
  const nascente = altura + 1
  const fundo = nascente - PROFUNDIDADE
  const lamina = fundo + 1
  if (fundo < 1) return null

  const direcao = direcaoDaDescida(alturaEm, x, z)
  if (!direcao) return null

  // ⚠️ O TERRENO DECIDE A LARGURA, E SEMPRE HÁ RECUO ATÉ 1.
  //
  // A montanha raramente oferece um lábio plano de três colunas COM bacia
  // fechada de cinco. Exigir a largura sorteada e desistir quando ela não cabe
  // foi o que zerou as cachoeiras na primeira tentativa desta onda. Tentar da
  // mais larga para a mais estreita entrega cortina larga onde o relevo permite
  // e, onde não permite, exatamente a cachoeira que existia antes — que nunca
  // foi um defeito, só era a única possível.
  //
  // Sem `hash` a busca começa em 1: os testes antigos continuam valendo.
  const [ldx, ldz] = direcao
  const lpx = ldz
  const lpz = -ldx
  let deslocamentos = null
  let meia = LARGURA
  for (let n = hash ? larguraDaQueda(hash, x, z) : 1; n >= 1; n--) {
    const tentativa = deslocamentosDaQueda(n)
    const m = meiaDoPatamar(tentativa)
    if (!labioPlano(mundo, x, z, direcao, altura, tentativa)) continue
    const labiosOk = tentativa.every((t) =>
      labioFechado(mundo, x + lpx * t, z + lpz * t, direcao, altura, tentativa, t),
    )
    if (!labiosOk) continue
    if (!baciaFechada(mundo, x, z, direcao, lamina, m)) continue
    deslocamentos = tentativa
    meia = m
    break
  }
  if (!deslocamentos) return null

  const celulas = []
  const colunas = colunasDoPatamar(x, z, direcao, meia)

  // 1. ESCAVAR. Cada coluna do patamar é aberta da lâmina para cima até o topo
  //    sólido dela — e até a altura da nascente pelo menos, senão a coluna que
  //    recebe a água não teria por onde recebê-la.
  for (const [cx, cz] of colunas) {
    const topo = Math.max(alturaEm(cx, cz), nascente)
    for (let y = lamina + 1; y <= topo; y++) celulas.push({ x: cx, y, z: cz, id: AIR })
  }

  // 2. A POÇA, em fontes. Fonte não se deriva de ninguém: é o único estado de
  //    líquido que a regra devolve igual para sempre, sem depender de vizinho.
  for (const [cx, cz] of colunas) celulas.push({ x: cx, y: lamina, z: cz, id: ID.water })

  // 3 e 4. AS NASCENTES E A CORTINA, uma coluna por deslocamento.
  //
  // ⚠️ UMA NASCENTE POR COLUNA, e não uma nascente alimentando várias. Água
  // que CAI não alimenta os lados: quem tem buraco embaixo despenca em vez de
  // se espalhar. Era essa regra que travava a largura em 1, e a resposta não é
  // burlá-la — é dar a cada fio a sua fonte, no lábio, apoiada em chão que a
  // escavação não tocou.
  const [dx, dz] = direcao
  const px = dz
  const pz = -dx
  for (const t of deslocamentos) {
    const nx = x + px * t
    const nz = z + pz * t
    celulas.push({ x: nx, y: nascente, z: nz, id: ID.water })
    const qx = nx + dx
    const qz = nz + dz
    celulas.push({ x: qx, y: nascente, z: qz, id: ID_DE_NIVEL[AGUA][1] })
    for (let y = nascente - 1; y > lamina; y--) {
      celulas.push({ x: qx, y, z: qz, id: AGUA_CAINDO })
    }
  }

  return {
    direcao,
    nascente,
    lamina,
    fundo,
    altura: ALTURA_DA_QUEDA,
    largura: deslocamentos.length,
    celulas,
  }
}
