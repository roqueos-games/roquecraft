//
// O CASTELO GÓTICO — a segunda estrutura grande do mundo, e a primeira que não
// é para morar.
//
// ⚠️ ELE EXISTE POR UM MOTIVO DIFERENTE DA VILA. A aldeia dá comércio e cama; o
// castelo dá HORIZONTE. Um mundo em que a coisa mais alta é um carvalho é plano
// por dentro por mais relevo que tenha — o jogador anda sem nada para andar EM
// DIREÇÃO A. Silhueta vista de longe é o que transforma exploração em rumo.
//
// ⚠️ A PRIMEIRA VERSÃO ERA UMA CAIXA DE PEDRA COM AMEIA, e o founder disse na
// tela: "extremamente simplório". Ele estava certo, e o diagnóstico é preciso —
// aquilo tinha a PLANTA de um castelo (muralha, torre, portão, menagem) e
// nenhuma das coisas que fazem o olho dizer "castelo gótico". Planta certa e
// leitura errada passam juntas, que é o mesmo defeito da casa-caixa da vila.
//
// GÓTICO SÃO TRÊS COISAS, e cada uma tem tradução em voxel:
//
//   1. VERTICALIDADE. Não é altura: é PROPORÇÃO. Uma torre de 12 num recinto de
//      30 é um toco; a mesma torre num recinto de 16 é uma torre. O que se busca
//      é a linha que puxa o olho para cima, e por isso a agulha (`AGULHA`) vale
//      mais que os blocos que ela custa.
//   2. ARCO OGIVAL. É a assinatura, e é o que distingue gótico de românico. Um
//      vão retangular na pedra lê como parede quebrada; o arco que se estreita
//      subindo até um ponto lê como porta, janela, nave. Mora em `arcoOgival`.
//   3. CONTRAFORTE. As nervuras verticais na parede são o que tira o muro da
//      condição de superfície plana e o põe na de estrutura. São também o único
//      detalhe desta lista que se lê a cem blocos de distância, porque é ele que
//      faz a sombra vertical.
//
// O resto (rosácea, agulha nas torres, mata-cães sobre o portão, bandeiras,
// escada de acesso ao adarve) é o que separa um castelo de UM castelo.
//
// ⚠️ E ELE NÃO PODE CAIR EM CIMA DA VILA. As duas usam grades independentes, e
// grade independente não garante nada sozinha: ela só garante que duas do MESMO
// tipo não se encostam. `planoDoCastelo` recusa quando o quadrado dele atravessa
// o quadrado escrito de qualquer aldeia vizinha — e a conta é barata porque
// `centroDaCelula` é hash puro, sem tocar no terreno.
//
// Tudo função pura da coordenada, como o resto: `runFeatures` roda para os NOVE
// chunks vizinhos e todos precisam chegar à mesma resposta.

import { ID, VARIANTE_DE_ESCADA, LAJE_DO_BLOCO } from './blocks.js'
import { AR } from './vilaCasa.js'
import { RAIO_ESCRITO, centroDaCelula, terrenoPlano } from './aldeia.js'

/** Lado, em chunks, da grade que decide onde CABE um castelo. */
export const CELULA_DO_CASTELO = 19

/**
 * Onde um castelo pode nascer, por NOME de bioma.
 *
 * ⚠️ MAIS BIOMAS QUE A ALDEIA, de propósito: o castelo é ruína de alguém que
 * foi embora, e o que o torna memorável é achá-lo onde não se mora. Planície,
 * savana, taiga, deserto e floresta — nunca dentro d'água.
 *
 * ⚠️ E A LISTA MORA AQUI PORQUE ESTAVA EM TRÊS LUGARES. `worldgen.js` tinha uma
 * cópia em ids, `qaDeAldeia.js` outra em nomes, e o minimapa ia ser a terceira.
 * Três cópias de um critério de geração é o mesmo defeito que o endereço da
 * frota escrito na prosa: uma delas envelhece e ninguém vê, e o sintoma é uma
 * sonda (ou um mapa) prometendo castelo onde o mundo não põe nenhum.
 */
export const BIOMAS_DO_CASTELO = Object.freeze(['plains', 'savanna', 'taiga', 'desert', 'forest'])

// ── AS MEDIDAS ──────────────────────────────────────────────────────────────
//
// ⚠️ A HIERARQUIA DE ALTURAS É O QUE FAZ LER COMO CASTELO, e a primeira
// tentativa errou os três números (muralha 6, torre 11, menagem 13): na foto as
// torres sumiam contra o muro. A segunda acertou a hierarquia e errou a
// PROPORÇÃO — 7/12/16 num recinto de 29 ainda é baixo e largo, que é a silhueta
// de um forte, não de um castelo.
//
// Aqui cada degrau quase DOBRA o anterior, e o recinto encolheu em relação às
// torres: muralha 8, torres de quina 20, agulha da cruz a 33. Vinte e cinco
// blocos entre o muro e a ponta é o que se vê de três chunks de distância.

/** Metade do lado da muralha. */
export const MURALHA = 18
/** Altura da muralha (o parapeito fica em `ALTO_DA_MURALHA`). */
export const ALTO_DA_MURALHA = 8
/** Metade do lado de uma torre de quina, e onde o centro dela cai. */
export const TORRE = 3
const CENTRO_DA_TORRE = MURALHA - 1
/** Altura do corpo da torre de quina, sem a agulha. */
export const ALTO_DA_TORRE = 18

/** O grande salão: metades em x e z, e onde o centro dele cai. */
export const SALAO = { lx: 5, lz: 5, z: 8 }
/** Altura da parede do salão; o telhado sobe `SALAO.lx` acima dela. */
export const ALTO_DO_SALAO = 12
/** Metade do lado da torre da cruz, que atravessa o telhado do salão. */
export const CRUZEIRO = 3
/** Altura do corpo da torre da cruz. */
export const ALTO_DO_CRUZEIRO = 28

/**
 * Altura que uma agulha acrescenta ao que ela cobre.
 *
 * ⚠️ ELA NÃO É UM NÚMERO LIVRE: a agulha perde meia largura por fiada e termina
 * em um bloco, então uma torre de meia largura `m` ganha exatamente `m + 1`. A
 * primeira versão cravou 6 aqui enquanto a geometria dava 4, e `ALTURA_DO_CASTELO`
 * — que sai desta conta — passou a prometer dois blocos que não existiam: a
 * coluna limpava dois a mais e o teste do ponto mais alto reprovou apontando
 * para o vazio. Constante derivada é constante que não mente.
 */
export const AGULHA = CRUZEIRO + 1

/** As duas torres que ladeiam o portão, e o meio vão dele. */
export const PORTARIA = { dx: 6, lado: 2, alto: 15 }
export const PORTAO = 2

/** O quadrado que o castelo escreve, a partir do centro. */
export const RAIO_DO_CASTELO = MURALHA + 2
/** Quanto o castelo sobe acima do chão: a ponta da agulha da cruz. */
export const ALTURA_DO_CASTELO = ALTO_DO_CRUZEIRO + AGULHA

/** Desnível que o castelo tolera. Mais que a vila: ele tem embasamento. */
export const DESNIVEL_DO_CASTELO = 5

// ── OS MATERIAIS ────────────────────────────────────────────────────────────
//
// ⚠️ CASTELO INTEIRO DE UM CINZA SÓ LÊ COMO MAQUETE. A primeira versão gótica
// tinha a forma certa e uma pedra só, e na foto o conjunto virou uma massa —
// contraforte, muralha, telhado e agulha com o mesmo tom não se separam a
// distância nenhuma. Três pedras que o catálogo já tem resolvem: a alvenaria
// fina no corpo, a pedra bruta no embasamento e no telhado, e a pedra lisa nas
// nervuras e nas agulhas, que é a mais clara e por isso puxa a linha vertical.
const CORPO = () => ID.stoneBricks
const EMBASAMENTO = () => ID.cobblestone
const NERVURA = () => ID.stone

const escada = (orient) => ID[VARIANTE_DE_ESCADA[`stoneStairs|${orient}|b`]]
const escadaBruta = (orient) => ID[VARIANTE_DE_ESCADA[`cobblestoneStairs|${orient}|b`]]
const escadaDeTopo = (orient) => ID[VARIANTE_DE_ESCADA[`stoneStairs|${orient}|t`]]
const lajeDePedra = () => ID[LAJE_DO_BLOCO.stone.base]

/**
 * ⚠️ A METADE ALTA DE CADA ORIENTAÇÃO, derivada de `giraCaixa` em `formas.js` e
 * não adivinhada: a caixa alta da forma base (orientação 5) fica no +Z, e cada
 * giro a leva um quarto adiante. Errar isto faz degrau invertido — bonito de
 * longe, buraco de perto —, e já custou uma espiral que não subia.
 */
export const ALTO_DA_ESCADA = Object.freeze({ 5: 'pz', 0: 'nx', 4: 'nz', 1: 'px' })
/** A orientação cuja metade alta aponta para o lado pedido. */
const ORIENT_PARA = Object.freeze({ pz: 5, nx: 0, nz: 4, px: 1 })

/**
 * O ARCO OGIVAL — a assinatura do gótico, e a peça mais reusada deste arquivo.
 *
 * ⚠️ UM VÃO RETANGULAR NA PEDRA LÊ COMO PAREDE QUEBRADA. O que faz o olho ler
 * "porta" ou "janela" é o vão que se ESTREITA subindo até um ponto: a ogiva.
 * Ela é o que separa gótico de românico, e em voxel sai de graça — o vão perde
 * meia largura por fiada e as quinas viram escada, que é a mesma peça do
 * telhado da casa da vila.
 *
 * @param aoLongo  distância ao eixo do vão, na direção da parede
 * @param dy       altura acima da soleira (1 é a primeira fiada livre)
 * @param meia     meia largura do vão na base
 * @param alto     até onde o vão é reto, antes de começar a fechar
 * @param dentro   o que preenche o vão (AR numa porta, vidro numa janela)
 * @param ladoA    para onde aponta a metade alta da escada de um lado
 * @returns o bloco, ou `null` quando esta célula não é do arco
 */
export function arcoOgival(aoLongo, dy, meia, alto, dentro, ladoA = 'nx', ladoB = 'px') {
  if (dy < 1) return null
  const a = Math.abs(aoLongo)
  if (dy <= alto) return a <= meia ? dentro : null
  const k = dy - alto
  const largura = meia - k + 1
  if (largura < 0) return null
  if (largura === 0) {
    // A chave da ogiva: bloco cheio, e não escada. Duas escadas encostadas de
    // ponta deixam um sulco no ápice, e sulco no ápice é goteira.
    return a === 0 ? ID.stoneBricks : null
  }
  if (a < largura) return dentro
  if (a === largura) return escada(ORIENT_PARA[aoLongo < 0 ? ladoA : ladoB])
  return null
}

/**
 * A AGULHA — a pirâmide escalonada que fecha uma torre.
 *
 * ⚠️ ELA É O QUE PUXA O OLHO PARA CIMA, e custa quatro fiadas de escada. Torre
 * de topo chato lê como silo: o telhado plano diz "isto acabou aqui", e a
 * agulha diz "isto aponta". É a diferença entre altura e verticalidade.
 *
 * @param dx,dz  distância ao eixo da torre
 * @param dyTopo altura acima do topo do corpo da torre (0 é a primeira fiada)
 * @param meia   meia largura da torre
 */
export function agulha(dx, dz, dyTopo, meia) {
  if (dyTopo < 0) return null
  const m = meia - dyTopo
  if (m < 0) return null
  const adx = Math.abs(dx)
  const adz = Math.abs(dz)
  if (adx > m || adz > m) return null
  if (m === 0) return NERVURA()
  if (adx === m || adz === m) {
    // A saia da fiada: escada virada para fora, que é o que dá o perfil
    // inclinado. Por dentro fica vazio — agulha maciça é um monte de pedra.
    const paraFora = adx >= adz ? (dx < 0 ? 'nx' : 'px') : dz < 0 ? 'nz' : 'pz'
    return escadaBruta(ORIENT_PARA[paraFora])
  }
  return AR
}

/** A célula é ameia? As ameias são as peças ALTAS do parapeito, uma sim uma não. */
const ehAmeia = (aoLongo) => ((aoLongo % 2) + 2) % 2 === 0

/**
 * O ruído da ruína: função pura da coordenada GLOBAL, e só dela.
 *
 * ⚠️ NÃO PRECISA DA SEMENTE DO MUNDO, e isso não é descuido: a POSIÇÃO do
 * castelo já varia com a semente, então dois mundos diferentes erodem pontos
 * diferentes do mapa. Carregar a semente até aqui custaria plumbing em quatro
 * chamadores para não mudar nada que o jogador veja.
 *
 * ⚠️ E ELE É POR CÉLULA (x,y,z), não por coluna: erosão por coluna derruba a
 * parede inteira de uma vez e o resultado é um castelo com paredes faltando, que
 * lê como bug. O que lê como ruína é a parede esburacada.
 */
function ruidoDaRuina(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2246822519 + 0x9e3779b9) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/**
 * O que o tempo fez com esta célula: o bloco, outro bloco, ou nada.
 *
 * ⚠️ A EROSÃO SOBE COM A ALTURA. Ruína que falta igual em cima e embaixo parece
 * queijo; o que o olho reconhece como arruinado é a base quase inteira e o topo
 * desmanchado, porque é assim que uma construção cai de verdade — o que está em
 * cima não tem o que o segure.
 *
 * ⚠️ E O CHÃO NÃO ERODE. Com o piso esburacado a ruína fica intransitável e o
 * jogador cai no embasamento; pior, o buraco no piso lê como terreno quebrado e
 * não como abandono.
 */
function erodir(plano, x, y, z, id) {
  if (!plano.ruina || id === null || id === AR) return id
  const dy = y - plano.chao
  if (dy === 0) return musgo(x, y, z, id)
  const r = ruidoDaRuina(x, y, z)
  const chance = 0.1 + 0.55 * Math.min(1, dy / ALTO_DO_CRUZEIRO)
  if (r < chance) return AR
  return musgo(x, y, z, id)
}

/** O musgo: metade do pedregulho e um terço da pedra-tijolo, e nada mais. */
function musgo(x, y, z, id) {
  if (id !== ID.cobblestone && id !== ID.stoneBricks) return id
  const r = ruidoDaRuina(x + 7919, y, z - 6271)
  if (id === ID.cobblestone) return r < 0.5 ? ID.mossyCobblestone : id
  return r < 0.3 ? ID.mossyCobblestone : id
}

/**
 * A torre que caiu.
 *
 * ⚠️ UMA DAS QUATRO, E NÃO TODAS. Quatro torres tocadas igual continuam
 * simétricas, e simetria é o contrário de ruína. Uma cortada pela metade é o que
 * dá a leitura de "isto aqui desabou" — e é o único jeito de a silhueta da
 * ruína não ser a silhueta do castelo com menos blocos.
 */
function torreQuebrada(plano, dx, dz, dy) {
  if (!plano.ruina) return false
  const qual = Math.floor(ruidoDaRuina(plano.centro.x, 0, plano.centro.z) * 4)
  const sx = dx < 0 ? 0 : 1
  const sz = dz < 0 ? 0 : 1
  if (sx * 2 + sz !== qual) return false
  return dy > Math.floor(ALTO_DA_TORRE / 2)
}

/** Onde cabe um castelo nesta célula da grade dele. */
export function centroDoCastelo(hash, cx, cz) {
  const gx = Math.floor(cx / CELULA_DO_CASTELO)
  const gz = Math.floor(cz / CELULA_DO_CASTELO)
  const margem = Math.ceil((RAIO_DO_CASTELO * 2) / 16) + 1
  const livre = CELULA_DO_CASTELO - margem * 2
  const ox = margem + Math.floor(hash(gx, gz, 101) * livre)
  const oz = margem + Math.floor(hash(gx, gz, 102) * livre)
  return {
    gx,
    gz,
    x: (gx * CELULA_DO_CASTELO + ox) * 16 + 8,
    z: (gz * CELULA_DO_CASTELO + oz) * 16 + 8,
  }
}

/**
 * Quantos dos castelos estão em RUÍNA.
 *
 * ⚠️ A RUÍNA NÃO É OUTRA ESTRUTURA, É A MESMA ERODIDA — e isso é uma decisão de
 * engenharia, não de estilo. Um gerador de ruína próprio teria a própria
 * muralha, o próprio portão e a própria menagem, e as duas versões
 * divergiriam na primeira mudança que alguém fizesse em uma delas. Aqui só
 * existe UM castelo; a ruína é o que sobra dele depois de `erodir`.
 *
 * E é o que faz a ruína ser lida como ruína: o jogador que já viu um castelo
 * inteiro reconhece a MESMA planta faltando pedaços. Uma ruína de planta
 * diferente é só um monte de pedra.
 */
const EH_RUINA = 0.42

/**
 * ⚠️ NEM TODA CÉLULA TEM CASTELO, e isso é o oposto da vila de propósito. Uma
 * aldeia em toda célula é povoamento; um castelo em toda célula é cenário de
 * parque. Ele precisa ser a coisa que o jogador conta para alguém ter achado.
 */
const TEM_CASTELO = 0.45

/**
 * O castelo desta célula bate em alguma aldeia?
 *
 * ⚠️ AS CÉLULAS DAS DUAS GRADES NÃO SE ALINHAM, então o quadrado do castelo pode
 * cair sobre a aldeia de qualquer uma das células de aldeia que ele toca. São
 * até quatro, e todas precisam ser perguntadas: perguntar só à de baixo deixa
 * passar exatamente o caso da divisa, que é onde o defeito mora.
 */
function bateEmAldeia(hash, centro) {
  const meio = RAIO_DO_CASTELO + RAIO_ESCRITO
  for (const dx of [-RAIO_DO_CASTELO, RAIO_DO_CASTELO]) {
    for (const dz of [-RAIO_DO_CASTELO, RAIO_DO_CASTELO]) {
      const vila = centroDaCelula(
        hash,
        Math.floor((centro.x + dx) / 16),
        Math.floor((centro.z + dz) / 16),
      )
      if (Math.abs(vila.x - centro.x) <= meio && Math.abs(vila.z - centro.z) <= meio) return true
    }
  }
  return false
}

/**
 * O plano do castelo, ou `null`.
 *
 * `mundo` é `{ alturaEm, nivelDoMar, biomaEm, biomaAceito }` — nada de buffer.
 */
export function planoDoCastelo(hash, mundo, cx, cz) {
  const centro = centroDoCastelo(hash, cx, cz)
  if (hash(centro.gx, centro.gz, 103) > TEM_CASTELO) return null
  if (mundo.biomaEm && !mundo.biomaAceito(mundo.biomaEm(centro.x, centro.z))) return null
  if (bateEmAldeia(hash, centro)) return null
  const chao = terrenoPlano(
    mundo.alturaEm,
    centro,
    mundo.nivelDoMar,
    RAIO_DO_CASTELO,
    DESNIVEL_DO_CASTELO,
  )
  if (chao === null) return null
  return { centro, chao, ruina: hash(centro.gx, centro.gz, 104) < EH_RUINA }
}

// ── AS PARTES ───────────────────────────────────────────────────────────────

/**
 * A MURALHA, com contraforte, adarve e parapeito ameado.
 *
 * ⚠️ O CONTRAFORTE É O DETALHE QUE SE LÊ DE LONGE, e por isso ele vem antes de
 * qualquer outro enfeite. Uma parede de pedra lisa de trinta e sete blocos é uma
 * superfície; as nervuras a cada seis põem sombra vertical nela e ela vira
 * estrutura. É também o único destes detalhes que sobrevive à distância de
 * renderização.
 */
function blocoDaMuralha(dx, dz, dy) {
  const adx = Math.abs(dx)
  const adz = Math.abs(dz)
  const naMuralha = adx === MURALHA || adz === MURALHA
  const aoLongo = adx === MURALHA ? dz : dx

  // O contraforte avança uma fiada para FORA, e ele afina no topo: a escada de
  // topo na última fiada é o que faz a nervura "morrer" na parede em vez de ser
  // cortada a faca.
  if ((adx === MURALHA + 1 || adz === MURALHA + 1) && Math.max(adx, adz) === MURALHA + 1) {
    const eixo = adx === MURALHA + 1 ? dz : dx
    if (Math.abs(adx === MURALHA + 1 ? dz : dx) > MURALHA) return null
    if (((eixo % 6) + 6) % 6 !== 0) return null
    if (dy < 1) return null
    if (dy < ALTO_DA_MURALHA - 2) return NERVURA()
    if (dy === ALTO_DA_MURALHA - 2) {
      const paraFora = adx === MURALHA + 1 ? (dx < 0 ? 'nx' : 'px') : dz < 0 ? 'nz' : 'pz'
      return escadaDeTopo(ORIENT_PARA[paraFora])
    }
    return null
  }

  if (!naMuralha) return null
  if (dy < 1) return null
  if (dy > ALTO_DA_MURALHA) return null
  // O embasamento: duas fiadas de pedra bruta na base, que é o que dá peso ao
  // pé do muro e o separa do gramado.
  if (dy <= 2) return EMBASAMENTO()
  // O parapeito: ameia sim, ameia não, na última fiada.
  if (dy === ALTO_DA_MURALHA) return ehAmeia(aoLongo) ? ID.stoneBricks : AR
  // Seteira: fresta alta e estreita a cada doze, para a muralha não ser um bloco.
  if (((aoLongo % 12) + 12) % 12 === 6 && dy >= 4 && dy <= 6) return AR
  return ID.stoneBricks
}

/** O ADARVE: o caminho de ronda por dentro do parapeito. */
function blocoDoAdarve(dx, dz, dy) {
  const adx = Math.abs(dx)
  const adz = Math.abs(dz)
  if (adx > MURALHA - 1 || adz > MURALHA - 1) return null
  if (adx !== MURALHA - 1 && adz !== MURALHA - 1) return null
  if (dy === ALTO_DA_MURALHA - 1) return lajeDePedra()
  if (dy > 0 && dy < ALTO_DA_MURALHA - 1) return AR
  return null
}

/**
 * AS TORRES DE QUINA, com agulha.
 *
 * ⚠️ ELAS SÃO O DOBRO E MEIO DA MURALHA, e isso é a proporção que o founder
 * cobrou. A versão anterior tinha torre de 12 sobre muro de 7: cinco blocos de
 * diferença num objeto de trinta de largura não se veem. Vinte sobre oito, mais
 * a agulha, dá doze blocos de torre livre acima do muro.
 */
function blocoDaTorre(plano, dx, dz, dy) {
  const cx = dx < 0 ? -CENTRO_DA_TORRE : CENTRO_DA_TORRE
  const cz = dz < 0 ? -CENTRO_DA_TORRE : CENTRO_DA_TORRE
  const ex = dx - cx
  const ez = dz - cz
  if (Math.abs(ex) > TORRE || Math.abs(ez) > TORRE) return null
  if (dy < 0) return null
  if (dy > ALTO_DA_TORRE) return agulha(ex, ez, dy - ALTO_DA_TORRE - 1, TORRE)
  if (dy === 0) return ID.stoneBricks
  if (torreQuebrada(plano, dx, dz, dy)) return null
  const naBorda = Math.abs(ex) === TORRE || Math.abs(ez) === TORRE
  if (!naBorda) return AR
  if (dy === ALTO_DA_TORRE) return CORPO()
  // O mata-cães: a fiada que avança sobre o vazio, logo abaixo do topo. É o
  // detalhe que diz "daqui se defende", e ele quebra a linha reta da torre.
  if (dy === ALTO_DA_TORRE - 1) return lajeDePedra()
  // Seteiras em cruz, de três em três fiadas.
  if (dy >= 4 && (dy - 4) % 4 === 0 && (ex === 0 || ez === 0)) return AR
  return ID.stoneBricks
}

/**
 * A PORTARIA: duas torres ladeando o portão, com mata-cães e rastrilho.
 *
 * ⚠️ O PORTÃO SOZINHO NUM MURO É UM BURACO. O que faz o olho ler "entrada
 * defendida" são as duas torres que o apertam e a fiada que avança por cima —
 * a mesma coisa que uma porta com batente faz na casa da vila, em outra escala.
 */
function blocoDaPortaria(dx, dz, dy) {
  const naFrente = dz === -MURALHA
  const adx = Math.abs(dx)

  // As torres gêmeas, centradas em ±PORTARIA.dx sobre a linha da muralha.
  const cx = dx < 0 ? -PORTARIA.dx : PORTARIA.dx
  const ex = dx - cx
  const ez = dz + MURALHA
  if (Math.abs(ex) <= PORTARIA.lado && Math.abs(ez) <= PORTARIA.lado) {
    if (dy < 0) return null
    if (dy > PORTARIA.alto) return agulha(ex, ez, dy - PORTARIA.alto - 1, PORTARIA.lado)
    if (dy === 0) return ID.stoneBricks
    const naBorda = Math.abs(ex) === PORTARIA.lado || Math.abs(ez) === PORTARIA.lado
    if (!naBorda) return AR
    if (dy === PORTARIA.alto) return ID.stoneBricks
    if (dy === PORTARIA.alto - 1) return lajeDePedra()
    if (dy === 5 && ez === -PORTARIA.lado) return AR
    return ID.stoneBricks
  }

  if (!naFrente) return null
  if (adx > PORTAO + 2) return null
  if (dy < 0) return null

  // ⚠️ O CORPO DA PORTARIA SOBE ACIMA DO MURO. Com o arco do portão chegando a
  // nove e o muro em oito, o ápice da ogiva ficava DECAPITADO pelo parapeito: o
  // vão abria um buraco no alto da muralha em vez de terminar em ponta. A
  // portaria é um edifício, não um trecho de muro, e por isso ela tem altura
  // própria — que é também o que põe o mata-cães acima da cabeça de quem entra.
  const altoDaPortaria = ALTO_DA_MURALHA + 4
  if (dy === altoDaPortaria) return ehAmeia(dx) ? CORPO() : AR
  // O mata-cães: a fiada que avança sobre o vão, apoiada em mísulas.
  if (dy === altoDaPortaria - 1) return lajeDePedra()
  if (dy > altoDaPortaria) return null

  // O vão em ogiva, de cinco de largura.
  const arco = arcoOgival(dx, dy, PORTAO, 6, AR, 'nx', 'px')
  if (arco !== null) return arco
  // O rastrilho: a grade de ferro que desce. Cerca é o que o catálogo tem de
  // vazado, e vazado é o que faz grade.
  if (adx <= PORTAO && dy === 9) return ID[`oakFence`]
  if (dy <= 2) return EMBASAMENTO()
  return CORPO()
}

/**
 * O GRANDE SALÃO: nave alta, contrafortes, janelões em ogiva e telhado de duas
 * águas — e a ROSÁCEA na empena dos fundos.
 *
 * ⚠️ A ROSÁCEA É O ÚNICO LUGAR ONDE ENTRA COR, e é de propósito: o castelo
 * inteiro é pedra cinza, e um ponto de cor numa fachada cinza vale mais que
 * cinco detalhes cinzas. Ela é feita de vidro com um anel de lã, que é o que o
 * catálogo tem — não há vitral, e inventar bloco novo é arte nova, que está
 * congelada.
 */
function blocoDoSalao(dx, dz, dy) {
  const ez = dz - SALAO.z
  const adx = Math.abs(dx)
  const aez = Math.abs(ez)

  // O contraforte do salão, avançando em x.
  if (adx === SALAO.lx + 1 && aez <= SALAO.lz && ((ez % 4) + 4) % 4 === 0) {
    if (dy < 1 || dy > ALTO_DO_SALAO - 3) return null
    if (dy === ALTO_DO_SALAO - 3) return escadaDeTopo(ORIENT_PARA[dx < 0 ? 'nx' : 'px'])
    return NERVURA()
  }

  if (adx > SALAO.lx || aez > SALAO.lz) return null
  if (dy < 0) return null

  const topo = ALTO_DO_SALAO

  // O telhado: duas águas com a cumeeira no eixo Z.
  if (dy > topo) {
    const altura = topo + 1 + (SALAO.lx + 1 - adx)
    if (adx <= SALAO.lx && dy === altura) {
      if (adx === 0) return EMBASAMENTO()
      return escadaBruta(ORIENT_PARA[dx < 0 ? 'px' : 'nx'])
    }
    if (dy > altura) return null
    // A empena: fechada nas duas pontas, com a rosácea na dos fundos.
    if (aez === SALAO.lz) {
      if (ez > 0 && dy >= topo + 2 && dy <= topo + 5 && adx <= 2)
        return blocoDaRosacea(dx, dy - topo - 3)
      return ID.stoneBricks
    }
    return AR
  }

  if (dy === 0) return ID.stoneBricks
  const naParede = adx === SALAO.lx || aez === SALAO.lz
  if (!naParede) return AR

  // A porta do salão, virada para o portão.
  if (ez === -SALAO.lz) {
    const porta = arcoOgival(dx, dy, 1, 4, AR, 'nx', 'px')
    if (porta !== null) return porta
  }
  // Os janelões: ogiva alta e estreita, de vidro, a cada quatro.
  const aoLongo = adx === SALAO.lx ? ez : dx
  if (((aoLongo % 4) + 4) % 4 === 0 && !(ez === -SALAO.lz && adx <= 1)) {
    const janela = arcoOgival(0, dy - 2, 0, 6, ID.glass, 'nx', 'px')
    if (janela !== null) return janela
  }
  return ID.stoneBricks
}

/** A rosácea: vidro num anel de lã, na empena dos fundos do salão. */
function blocoDaRosacea(dx, dy) {
  const d = Math.abs(dx) + Math.abs(dy)
  if (d > 2) return null
  if (d === 2) return ID.redWool
  return ID.glass
}

/**
 * A TORRE DA CRUZ: ela atravessa o telhado do salão e é a coisa mais alta do
 * castelo.
 *
 * ⚠️ É ELA QUE DÁ A VERTICALIDADE. As torres de quina marcam o recinto; esta
 * marca o EDIFÍCIO, e é o que se vê antes de tudo. Sem ela o castelo é um
 * quadrado com quatro pontas iguais, que é um forte — a hierarquia entre o
 * recinto e o que ele guarda é o que faz um castelo.
 */
function blocoDoCruzeiro(dx, dz, dy) {
  const ez = dz - SALAO.z
  if (Math.abs(dx) > CRUZEIRO || Math.abs(ez) > CRUZEIRO) return null
  if (dy < 0) return null
  if (dy > ALTO_DO_CRUZEIRO) return agulha(dx, ez, dy - ALTO_DO_CRUZEIRO - 1, CRUZEIRO)
  if (dy === 0) return ID.stoneBricks
  const naBorda = Math.abs(dx) === CRUZEIRO || Math.abs(ez) === CRUZEIRO
  if (!naBorda) {
    const degrau = escadaDaEspiral(dx, ez, dy)
    if (degrau !== null) return degrau
    if (dy === ALTO_DO_CRUZEIRO - 1 && dx === -(CRUZEIRO - 1) && ez === CRUZEIRO - 1)
      return ID.chest
    return AR
  }
  if (dy === ALTO_DO_CRUZEIRO) return ID.stoneBricks
  if (dy === ALTO_DO_CRUZEIRO - 1) return lajeDePedra()
  // O campanário: quatro ogivas altas no último terço, que é o que faz a torre
  // parecer torre de sino e não chaminé.
  if (dy >= ALTO_DO_CRUZEIRO - 8 && dy <= ALTO_DO_CRUZEIRO - 3 && (dx === 0 || ez === 0)) {
    const a = arcoOgival(0, dy - (ALTO_DO_CRUZEIRO - 9), 0, 4, AR, 'nx', 'px')
    if (a !== null) return a
  }
  if (dy >= 4 && (dy - 4) % 5 === 0 && (dx === 0 || ez === 0)) return AR
  return ID.stoneBricks
}

/**
 * A ESCADA DO ADARVE: como se sobe na muralha.
 *
 * ⚠️ MURALHA SEM ACESSO É CENOGRAFIA. A versão anterior tinha adarve e nenhum
 * jeito de chegar nele a não ser empilhando bloco — o jogador olha para cima,
 * vê o caminho de ronda e entende que aquilo não é para ele.
 */
function blocoDaEscadaDoAdarve(dx, dz, dy) {
  const x0 = MURALHA - 2
  if (dx !== x0 && dx !== x0 - 1) return null
  const passo = dz + MURALHA - 3
  if (passo < 0 || passo > ALTO_DA_MURALHA - 2) return null
  if (dy === passo + 1) return escada(ORIENT_PARA['pz'])
  if (dy <= passo) return ID.cobblestone
  return null
}

/** As bandeiras do pátio: pano pendurado nos mastros, diante do salão. */
function blocoDaBandeira(dx, dz, dy) {
  if (dz !== SALAO.z - SALAO.lz - 3) return null
  if (Math.abs(dx) !== 5 && Math.abs(dx) !== 9) return null
  if (dy < 1) return null
  if (dy <= 6) return ID[`oakFence`]
  if (dy <= 9) return Math.abs(dx) === 5 ? ID.redWool : ID.blueWool
  return null
}

/**
 * O que vai nesta célula do castelo, `AR` para vazio dele, ou `null`.
 *
 * ⚠️ A ORDEM DOS RAMOS É A ORDEM DE PRECEDÊNCIA, e ela importa em três lugares:
 * a torre da cruz atravessa o telhado do salão e precisa ganhar dele; as torres
 * de quina nascem em cima da quina da muralha e precisam ganhar dela; e a
 * portaria substitui o trecho de muralha onde o portão está. Em todos, quem
 * ganha é a peça MENOR e mais específica — a maior é o fundo.
 */
export function blocoIntegro(plano, x, y, z) {
  const dx = x - plano.centro.x
  const dz = z - plano.centro.z
  if (Math.abs(dx) > RAIO_DO_CASTELO || Math.abs(dz) > RAIO_DO_CASTELO) return null
  const dy = y - plano.chao
  if (dy < 0) return null
  if (dy > ALTURA_DO_CASTELO) return null

  const cruzeiro = blocoDoCruzeiro(dx, dz, dy)
  if (cruzeiro !== null) return cruzeiro

  const torre = blocoDaTorre(plano, dx, dz, dy)
  if (torre !== null) return torre

  const portaria = blocoDaPortaria(dx, dz, dy)
  if (portaria !== null) return portaria

  const salao = blocoDoSalao(dx, dz, dy)
  if (salao !== null) return salao

  const muralha = blocoDaMuralha(dx, dz, dy)
  if (muralha !== null) return muralha

  const bandeira = blocoDaBandeira(dx, dz, dy)
  if (bandeira !== null) return bandeira

  const escadaDoAdarve = blocoDaEscadaDoAdarve(dx, dz, dy)
  if (escadaDoAdarve !== null) return escadaDoAdarve

  const adarve = blocoDoAdarve(dx, dz, dy)
  if (adarve !== null) return adarve

  // ── O PÁTIO ──────────────────────────────────────────────────────────────
  if (Math.abs(dx) > MURALHA || Math.abs(dz) > MURALHA) return null
  if (dy === 0) return ID.cobblestone
  if (dy <= 2) return AR
  return null
}

/** O castelo com o tempo em cima: inteiro, ou o que sobrou dele. */
export function blocoDoCastelo(plano, x, y, z) {
  return erodir(plano, x, y, z, blocoIntegro(plano, x, y, z))
}

/**
 * O degrau da espiral da torre da cruz nesta célula, ou `null`.
 *
 * A subida corre encostada na parede de dentro, um degrau por altura, dando a
 * volta: quatro lances por volta completa.
 */
function escadaDaEspiral(dx, dz, dy) {
  if (dy < 1 || dy >= ALTO_DO_CRUZEIRO - 1) return null
  const r = CRUZEIRO - 1
  const volta = 2 * r * 4
  const passo = ((dy - 1) % volta) + 1
  const alvo = posicaoDaEspiral(passo, r)
  if (alvo === null) return null
  if (alvo.x !== dx || alvo.z !== dz) return null
  return escada(alvo.orient)
}

/**
 * O ponto da espiral no passo `p`, andando pela parede de dentro.
 *
 * ⚠️ A ORIENTAÇÃO DE CADA DEGRAU APONTA PARA ONDE SE SOBE, e isso não é
 * estética: é o que separa escada de enfeite. Uma escada de bloco tem duas
 * alturas — a metade da frente a meio bloco, a de trás a um bloco cheio.
 * Subindo, o jogador pisa na metade BAIXA do degrau seguinte vindo da metade
 * ALTA do anterior: são dois passos de meio bloco, e meio bloco se sobe andando.
 * Com o degrau virado ao contrário, os dois viram um passo de um bloco inteiro,
 * que exige pulo — a torre continua bonita e deixa de ter como subir.
 *
 * A primeira versão acertou duas pernas de quatro, e as outras duas ficaram
 * viradas para trás: a espiral subia metade da torre e travava.
 */
function posicaoDaEspiral(p, r) {
  const lado = 2 * r
  const i = (p - 1) % (lado * 4)
  if (i < lado) return { x: -r + i, z: -r, orient: 1, ruma: 'px' }
  if (i < lado * 2) return { x: r, z: -r + (i - lado), orient: 5, ruma: 'pz' }
  if (i < lado * 3) return { x: r - (i - lado * 2), z: r, orient: 0, ruma: 'nx' }
  return { x: -r, z: r - (i - lado * 3), orient: 4, ruma: 'nz' }
}

/** A espiral inteira, do primeiro ao último degrau. Serve ao teste e ao QA. */
export function degrausDaEspiral() {
  const r = CRUZEIRO - 1
  const fora = []
  for (let dy = 1; dy < ALTO_DO_CRUZEIRO - 1; dy++) {
    const passo = ((dy - 1) % (2 * r * 4)) + 1
    fora.push({ dy, ...posicaoDaEspiral(passo, r) })
  }
  return fora
}

/**
 * A coluna inteira do castelo, ou `null` quando não é assunto dele.
 *
 * ⚠️ MESMO CONTRATO DA VILA, e pelos mesmos dois motivos medidos: abaixo do
 * nível dele o castelo PREENCHE (senão a muralha que pega um barranco nasce de
 * pernas para o ar), e acima ele LIMPA até o topo (senão a copa da árvore
 * vizinha atravessa a ameia — `putIfAir` da folha enxerga como vazio exatamente
 * o AR que a estrutura escreveu).
 */
export function colunaDoCastelo(plano, x, z, alturaEm) {
  if (!plano) return null
  const dx = Math.abs(x - plano.centro.x)
  const dz = Math.abs(z - plano.centro.z)
  const FOLGA = 3
  if (dx > RAIO_DO_CASTELO + FOLGA || dz > RAIO_DO_CASTELO + FOLGA) return null
  const chao = plano.chao
  const peca = new Map()
  let ehDoCastelo = false
  for (let y = chao; y <= chao + ALTURA_DO_CASTELO; y++) {
    const id = blocoDoCastelo(plano, x, y, z)
    if (id === null) continue
    ehDoCastelo = true
    peca.set(y, id)
  }
  if (!ehDoCastelo) {
    // ⚠️ RUÍNA NÃO TEM TERREIRO, de propósito. O castelo inteiro mantém o campo
    // limpo em volta porque é um lugar em uso; a ruína é justamente o lugar que
    // parou de ser cuidado, e mato encostado na muralha é metade da leitura. É
    // a mesma decisão da vila vista pelo avesso.
    if (plano.ruina) return null
    if (dx > RAIO_DO_CASTELO + FOLGA || dz > RAIO_DO_CASTELO + FOLGA) return null
    // ⚠️ O TERREIRO APLAINA, e não só impede o mato. Devolver lista vazia deixava
    // o terreno como estava, e uma lomba encostada na muralha corta a torre pela
    // metade exatamente como cortava a casa da vila. É o mesmo defeito, e o
    // founder o viu na vila primeiro.
    const terrenoAqui = alturaEm ? alturaEm(x, z) : chao
    const terraco = []
    for (let y = Math.min(terrenoAqui, chao); y <= Math.max(terrenoAqui + 1, chao + 2); y++) {
      if (y < chao) terraco.push({ y, id: ID.dirt })
      else if (y === chao) terraco.push({ y, id: ID.grassBlock })
      else terraco.push({ y, id: AR })
    }
    return terraco
  }

  const terreno = alturaEm ? alturaEm(x, z) : chao
  const saida = []
  for (let y = Math.min(terreno, chao); y <= chao + ALTURA_DO_CASTELO; y++) {
    const id = peca.get(y)
    if (id !== undefined) saida.push({ y, id })
    else if (y < chao) saida.push({ y, id: ID.stoneBricks })
    else saida.push({ y, id: AR })
  }
  return saida
}
