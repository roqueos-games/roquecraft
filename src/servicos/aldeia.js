//
// A ALDEIA — a primeira ESTRUTURA que este mundo tem.
//
// ⚠️ O PROBLEMA É O MESMO DA CACHOEIRA DE MONTANHA, e a solução também: uma
// estrutura atravessa chunks, e `runFeatures` roda para os NOVE chunks vizinhos
// escrevendo no buffer do atual. Quem decide "aqui tem casa" precisa chegar à
// MESMA resposta rodando de qualquer um dos nove — então a decisão só pode usar
// dado globalmente puro (hash da coordenada, altura do terreno), e nunca ler o
// buffer nem consumir um `rnd()` que depende de onde a varredura começou.
//
// É por isso que aqui não existe `rnd()`: tudo sai de `hash`, que é função da
// coordenada global e da semente. Duas casas atravessando a mesma divisa saem
// idênticas pelos dois lados, por construção e não por sorte.
//
// ⚠️ E A ALDEIA NÃO É PLANTADA NO RELEVO: ela EXIGE relevo plano. Uma casa
// posta num barranco fica com metade enterrada e metade no ar, e o jogador lê
// isso como mundo quebrado — foi o que aconteceu com a cachoeira antes de
// `baciaFechada` existir. Aqui a guarda é `terrenoPlano`.

import { ID } from './blocks.js'
import { NOMES_DE_PROFISSAO } from './comercio.js'
import { AR, BORDA_DA_CASA, MATERIAIS, blocoDaCasa, blocoDaChamine, plantaDe } from './vilaCasa.js'
import { RAIO_DA_PRACA, colunaDaPraca, postesDe } from './vilaPraca.js'
import { BORDA_DA_ROCA, animaisDe, colunaDaRoca, rocasDe } from './vilaFazenda.js'
import {
  ALCANCE_DA_IGREJA,
  ALTURA_DA_IGREJA,
  bancasDaFeira,
  colunasDaBanca,
  colunasDaIgreja,
} from './cidade.js'

/**
 * Lado, em chunks, da grade que decide onde CABE uma aldeia.
 *
 * ⚠️ ERA 24, E ISSO DAVA UMA VILA A CADA 2,4 QUILÔMETROS. O founder voou o mapa
 * inteiro e não achou nenhuma — e a medição concorda com ele: 2.431 blocos entre
 * vizinhas é longe demais para se topar com uma voando, e longe demais para uma
 * estrutura que é o único lugar do jogo onde se compra alguma coisa.
 *
 * ⚠️ E O PISO É 16, NÃO MENOS. A margem que mantém a vila dentro da própria
 * célula é de 6 chunks de cada lado (o raio escrito é 35 blocos), então uma
 * célula de 14 deixa `livre = 2`: o centro só pode cair em duas posições, e a
 * vila passa a nascer quase sempre no mesmo ponto da célula. O jogador vê isso
 * como uma GRADE — vilas alinhadas de 224 em 224 blocos —, que é pior que vila
 * rara. Com 16 sobram 4 posições, e a fileira desaparece.
 *
 * Medido: 1 vila a cada 1.095 blocos, contra 2.431 antes.
 */
export const CELULA = 16

/**
 * Os biomas que aceitam aldeia.
 *
 * ⚠️ ESTA LISTA ESTAVA COPIADA EM TRÊS ARQUIVOS — `worldgen.js`, `qaDeAldeia.js`
 * e `useRoqueCraftEntidades.js` —, cada um com a sua. Acrescentar um bioma
 * exigia lembrar dos três, e esquecer um faz a vila nascer no mundo sem os
 * moradores (ou o contrário), que é um defeito silencioso: a casa está lá e
 * ninguém mora nela.
 *
 * A floresta entrou porque ela é comum e a vila abre a própria clareira: o
 * quintal já derruba o mato e a árvore encostada. Ela sozinha tirou a distância
 * média de 1.237 para 1.095 blocos.
 */
export const BIOMAS_DA_ALDEIA = Object.freeze(['plains', 'savanna', 'forest'])
/**
 * Quantas casas a aldeia TENTA ter.
 *
 * ⚠️ ERA 5 E FIXO, e o anel de cinco com 72° exatos era o que garantia que duas
 * casas não se atravessassem. Com sete a nove casas esse anel não fecha: a
 * separação é 2·d·sen(180/N), que cai de 1,18·d com cinco para 0,68·d com nove
 * — a 13 blocos de raio isso dá 8,9 de separação contra 11 de casa com beiral.
 *
 * A resposta não foi esticar o raio (o terreno plano ficaria raro demais) nem
 * escolher um N que fecha: foi parar de deduzir a separação do ângulo e MEDIR,
 * candidata a candidata. Ver `casasDe`.
 */
export const CASAS = 9

/** Quantas casas, no mínimo, uma aldeia precisa ter para valer a pena existir. */
export const CASAS_MINIMAS = 6

/**
 * O miolo da vila é da praça: casa nenhuma nasce dentro dele.
 *
 * Reexportado de `vilaPraca.js`, que é o dono do número: a praça e a guarda de
 * casa precisam do MESMO raio, e duas constantes iguais em arquivos diferentes
 * é como um dos dois envelhece sem ninguém ver.
 */
export { RAIO_DA_PRACA }
/**
 * Lado da maior casa, paredes inclusas — a régua de separação entre vizinhas.
 *
 * ⚠️ NÃO É MAIS O TAMANHO DE TODA CASA. As plantas variam (ver `vilaCasa.js`) e
 * este número é o TETO delas, que é o que a separação precisa respeitar.
 */
export const LADO_DA_CASA = BORDA_DA_CASA * 2 + 1
/** Raio, em blocos, do quadrado onde os CENTROS das estruturas se espalham. */
export const RAIO = 28

/**
 * O quadrado que a aldeia realmente ESCREVE.
 *
 * ⚠️ `RAIO` SOZINHO CORTAVA A CASA DA BORDA. Ele limita onde o centro de uma
 * casa cai, mas a casa avança `BORDA_DA_CASA` a partir do centro dela — então
 * uma casa a 24 blocos do centro da vila escrevia até 30, e a guarda de raio
 * devolvia `null` para as últimas quatro colunas. O resultado era uma casa com
 * a parede leste faltando, sempre nas casas mais afastadas, e nenhum teste
 * olhava para lá.
 */
export const RAIO_DA_ROCA = RAIO + 3

export const RAIO_ESCRITO = RAIO_DA_ROCA + BORDA_DA_ROCA

// ⚠️ OS PORTES MORAM AQUI, DEPOIS DE `RAIO`, E NÃO LÁ EM CIMA JUNTO DE `CASAS`.
// A primeira versão os declarou logo após `CASAS_MINIMAS`, que lê melhor — e
// quebrou o módulo inteiro com `Cannot access 'RAIO' before initialization`:
// `const` tem zona morta temporal, e a tabela lê `RAIO` para montar a vila.
// Vinte e oito suítes pararam de CARREGAR de uma vez. Ordem de declaração em
// módulo não é estilo.
/**
 * OS TRÊS PORTES DE ASSENTAMENTO — aldeia, vila e cidade.
 *
 * ⚠️ A VILA É A DE SEMPRE, DERIVADA DAS CONSTANTES ACIMA E NÃO REDIGITADA.
 * A catraca `inventario-da-vila.json` mede a MEDIANA DE DOZE VILAS numa grade
 * de célula 16; mudar qualquer número dela trocaria quais doze são medidas e a
 * catraca acusaria regressão falsa — foi exatamente o que aconteceu na onda 8
 * do Goal 19, quando a célula foi de 24 para 16. Porte novo se acrescenta ao
 * lado; o que já estava medido não se mexe.
 *
 * ⚠️ E CADA PORTE TEM GRADE PRÓPRIA, com sal de hash próprio. Se os três
 * usassem o mesmo sal, a aldeia e a cidade cairiam no mesmo offset dentro da
 * célula e o jogador veria fileira — que é o defeito que a nota de `CELULA`
 * documenta para um porte só, multiplicado por três.
 *
 * A graduação é o produto: uma aldeia de quatro casas é comum e serve de
 * primeiro socorro; a vila é o lugar onde se compra; a cidade é rara o bastante
 * para ser contada a alguém.
 */
export const PORTES = Object.freeze({
  aldeia: {
    nome: 'aldeia',
    sal: 0,
    celula: 11,
    casas: 4,
    minimas: 3,
    raio: 18,
    candidatas: 6,
    coroas: 1,
    passo: 0,
    distancia: 12,
    folga: 4,
  },
  vila: {
    nome: 'vila',
    sal: 700,
    celula: CELULA,
    casas: CASAS,
    minimas: CASAS_MINIMAS,
    raio: RAIO,
    candidatas: 10,
    // ⚠️ UMA COROA, COMO SEMPRE FOI. A catraca mede a MEDIANA DE DOZE VILAS
    // desta grade; qualquer mudança na distribuição das candidatas troca quais
    // doze e ela acusa regressão falsa. Foi o que aconteceu ao escrever esta
    // onda: ao dar duas coroas à vila, `blocosSolidos`, `fontesDeLuz`, `moveis`
    // e `vidros` caíram todos de uma vez. A cidade é que precisa de coroas.
    coroas: 1,
    passo: 0,
    distancia: 20,
    folga: 5,
  },
  cidade: {
    nome: 'cidade',
    sal: 1400,
    celula: 38,
    casas: 26,
    minimas: 18,
    raio: 54,
    candidatas: 40,
    // ⚠️ QUATRO COROAS, E É O QUE FAZ CIDADE. Quarenta casas numa coroa só
    // ficariam ombro a ombro num círculo — um MURO de casas, não uma cidade.
    // Em coroas, de fora se vê casa atrás de casa, que é o que dá profundidade.
    coroas: 4,
    passo: 11,
    distancia: 20,
    folga: 5,
  },
})

/** Os portes do maior para o menor — a ordem em que a precedência os tenta. */
export const PORTES_POR_TAMANHO = Object.freeze(['cidade', 'vila', 'aldeia'])

/** O porte por nome, com a vila como recuo. */
export const porteDe = (nome) => PORTES[nome] || PORTES.vila

/** O quadrado que ESTE porte escreve, em blocos a partir do centro. */
/** O quadrado que `terrenoPlano` mede para aceitar o porte: casas e roças. */
export const raioDoTerrenoDe = (porte) => porteDe(porte).raio + 3 + BORDA_DA_ROCA
export const raioEscritoDe = (porte) => {
  const p = porteDe(porte)
  // ⚠️ A CIDADE ESCREVE ATÉ A IGREJA. Ela fica fora do miolo, a ~59 do centro,
  // e a torre recuada vai até ~73: com o raio de casa + roça (61) a igreja era
  // planejada e cortada — a primeira foto da cidade (Goal 21, 2.4) não tinha
  // campanário. O terreno NÃO precisa ser plano até lá (`raioDoTerrenoDe`):
  // pedir planície de 150 de lado zerava as cidades em 169 células; a coluna
  // da igreja aterra e limpa como a de qualquer casa.
  return raioDoTerrenoDe(porte) + (p.nome === 'cidade' ? ALCANCE_DA_IGREJA : 0)
}

/** Quanto a aldeia sobe acima do chão, a maior planta inclusa. */
export const ALTURA_DA_ALDEIA = 11
/** Desnível máximo tolerado no chão da aldeia. */
export const DESNIVEL_MAXIMO = 3

/**
 * Esta célula da grade tem aldeia, e onde?
 *
 * ⚠️ GRADE E NÃO SORTEIO POR COLUNA, pela mesma razão da cachoeira: com sorteio
 * livre, duas aldeias caem uma em cima da outra e as casas se atravessam. A
 * grade garante distância mínima por construção.
 */
export function centroDaCelula(hash, cx, cz, porte = 'vila') {
  const p = porteDe(porte)
  const gx = Math.floor(cx / p.celula)
  const gz = Math.floor(cz / p.celula)
  // ⚠️ O SAL SEPARA AS TRÊS GRADES. Sem ele, a aldeia e a cidade cairiam no
  // mesmo offset dentro da própria célula e o jogador veria FILEIRA — o defeito
  // que a nota de `CELULA` documenta para um porte só, três vezes.
  const h = hash(gx, gz, p.sal)
  // O centro fica no miolo da célula: encostado na borda, a aldeia vazaria para
  // a célula vizinha e a distância mínima deixaria de valer.
  const margem = Math.ceil((raioEscritoDe(porte) * 2) / 16) + 1
  const livre = Math.max(1, p.celula - margem * 2)
  const ox = margem + Math.floor(h * livre)
  const oz = margem + Math.floor(hash(gx, gz, p.sal + 1) * livre)
  return {
    gx,
    gz,
    porte: p.nome,
    x: (gx * p.celula + ox) * 16 + 8,
    z: (gz * p.celula + oz) * 16 + 8,
  }
}

/** O centro de uma estrutura cabe neste raio. */
export const dentroDoRaio = (centro, x, z, porte = null) => {
  const r = porte ? porteDe(porte).raio : RAIO
  return Math.abs(x - centro.x) <= r && Math.abs(z - centro.z) <= r
}

/** A aldeia inteira cabe neste; fora dele nenhuma coluna precisa perguntar. */
export const dentroDoEscrito = (centro, x, z, porte = null) => {
  const r = porte ? raioEscritoDe(porte) : RAIO_ESCRITO
  return Math.abs(x - centro.x) <= r && Math.abs(z - centro.z) <= r
}

/**
 * O chão aguenta uma aldeia — ou um castelo?
 *
 * ⚠️ O RAIO E O DESNÍVEL SÃO PARÂMETROS desde o castelo, e não constantes
 * escondidas: ele mede um quadrado maior e tolera mais barranco, porque tem
 * embasamento de pedra e a vila não. Deixá-los cravados aqui obrigaria o
 * castelo a copiar a função inteira, e duas cópias da mesma medida é como uma
 * delas envelhece sozinha.
 *
 * Mede o desnível nos quatro cantos e no centro. Cinco pontos e não a área
 * inteira: a área tem 53×53 colunas e cada `alturaEm` desce a coluna avaliando
 * densidade 3D — perguntar 2.809 vezes por chunk gerado é o que transforma
 * estrutura em engasgo.
 */
export function terrenoPlano(
  alturaEm,
  centro,
  nivelDoMar,
  raio = RAIO_ESCRITO,
  tolerancia = DESNIVEL_MAXIMO,
  dentroMinimo = 0.85,
) {
  // Acima disto não é ondulação, é penhasco — e penhasco nenhum terraço resolve.
  const teto = tolerancia + 4

  // ── 1. A PENEIRA BARATA ──────────────────────────────────────────────────
  //
  // Nove pontos matam montanha, praia e encosta por 25 microssegundos. O limite
  // dela é FROUXO de propósito (o dobro do teto): uma peneira mais apertada que
  // o critério final recusaria célula que o critério aceitaria, e aí quem
  // decide passa a ser a peneira — que mede nove pontos e não sabe de nada.
  const grosso = amostrar(alturaEm, centro, raio, 1, nivelDoMar)
  if (grosso === null || grosso.max - grosso.min > teto * 2) return null

  // ── 2. A MEDIÇÃO QUE VALE ────────────────────────────────────────────────
  //
  // ⚠️ CINCO PONTOS NOS CANTOS MENTIAM, e o founder viu antes de mim: "às vezes
  // as casas da vila ficam cortadas pela metade". Eles mediam um quadrado de
  // raio 24 enquanto a vila ESCREVE até 35, e não viam nada ENTRE os cantos —
  // uma lomba no meio passava inteira. A varredura de 14/09/2026 achou terreno
  // a +6 do chão declarado sob uma casa, com o desnível máximo escrito em 3: o
  // morro subia mais que a parede e a casa amanhecia enterrada até a janela.
  //
  // Sete por sete sobre o quadrado REAL são 49 pontos a cada 11 blocos: nenhuma
  // lomba de casa cabe inteira nesse intervalo. Custa 0,6 ms por chunk gerado, e
  // isso está medido, não estimado.
  const fino = amostrar(alturaEm, centro, raio, 3, nivelDoMar)
  if (fino === null) return null

  // ── 3. MEDIANA, E NÃO MÁXIMO MENOS MÍNIMO ────────────────────────────────
  //
  // ⚠️ TROCAR OS CINCO PONTOS PELOS 49 COM O CRITÉRIO ANTIGO CUSTOU 60% DAS
  // VILAS — de 10 para 4 em 289 células, medido. E não porque o terreno piorou:
  // porque `max − min` morre com UM ponto fora. Num quadrado de 70 por 70 de
  // terreno ruidoso quase sempre existe um.
  //
  // O que a vila precisa saber mudou quando o terraceamento entrou: não é mais
  // "o terreno é plano o bastante para a casa não ser cortada" — o terraço
  // resolve isso —, é "o corte e o aterro vão parecer um terreno preparado, e
  // não uma pedreira". Isso é a MASSA do terreno perto de um nível, com uma
  // folga para os poucos pontos que destoam, e um teto para o penhasco.
  //
  // Com mediana, 85% dentro de ±3 e teto de 7: 7 vilas de 72 células de bioma,
  // contra 10 da regra antiga que mentia e 4 do max−min honesto.
  const med = mediana(fino.alturas)
  let dentro = 0
  let pior = 0
  for (const h of fino.alturas) {
    const d = Math.abs(h - med)
    if (d <= tolerancia) dentro++
    if (d > pior) pior = d
  }
  if (pior > teto) return null
  if (dentro / fino.alturas.length < dentroMinimo) return null

  // ⚠️ O CHÃO É A MEDIANA, e não mais o ponto mais baixo. A nota antiga dizia
  // que subir ao mais alto deixaria casas flutuando sobre as depressões — e ela
  // estava certa ENQUANTO a vila não aplainava nada. Agora ela preenche o que
  // está abaixo e corta o que está acima, então o mais baixo só faz o aterro
  // crescer: a vila inteira nasceria sobre um pedestal da altura do buraco mais
  // fundo que ela encostou.
  return med
}

/** A mediana de uma lista de alturas. */
function mediana(alturas) {
  const ord = [...alturas].sort((a, b) => a - b)
  return ord[(ord.length - 1) >> 1]
}

/**
 * A grade (2n+1)² sobre o quadrado de lado 2·raio, ou `null` se algum ponto
 * estiver na água — aldeia com o pé na água não é aldeia.
 */
function amostrar(alturaEm, centro, raio, n, nivelDoMar) {
  const alturas = []
  let min = Infinity
  let max = -Infinity
  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      const h = alturaEm(
        centro.x + Math.round((i * raio) / n),
        centro.z + Math.round((j * raio) / n),
      )
      if (h <= nivelDoMar) return null
      alturas.push(h)
      if (h < min) min = h
      if (h > max) max = h
    }
  }
  return { min, max, alturas }
}

/**
 * As casas, em coordenada global — quantas couberem, em duas coroas.
 *
 * ⚠️ A NOTA ANTERIOR AQUI DEFENDIA CINCO ÂNGULOS EXATOS, e ela estava certa
 * para cinco casas: com 72° entre vizinhas a separação é 2·d·sen(36°) = 1,18·d,
 * e com d de 12 isso dava 14 contra 7 de lado de casa. A conta era boa; o que
 * ela não sobrevivia era a mudança do número de casas, porque a separação vinha
 * do ÂNGULO em vez de ser medida. Nove casas num anel dão 0,68·d, e a aldeia
 * amanheceria com duas casas atravessadas sem nada reprovar.
 *
 * Também recusa casa no miolo: o centro é da praça.
 */
export function casasDe(hash, centro, porte = 'vila') {
  const p = porteDe(porte)
  const aceitas = []
  // ⚠️ DUAS COROAS, E NÃO UM ANEL. Nove casas num anel só ficam com 0,68·d de
  // separação; em duas coroas cada uma tem menos vizinhas no mesmo raio e a
  // vila ganha profundidade — de fora dá pra ver casa atrás de casa, que é o que
  // faz um povoado parecer povoado e não um relógio com casas nos números.
  const giro = hash(centro.gx, centro.gz, 9) * Math.PI * 2
  // ⚠️ UMA COROA SÓ, E A TENTATIVA DE DUAS ESTÁ MEDIDA AQUI PARA NINGUÉM
  // REFAZÊ-LA. Duas coroas dariam profundidade — casa atrás de casa —, mas a
  // faixa útil não comporta: a praça é um QUADRADO de lado 15, então uma casa a
  // 45° precisa estar a 17 blocos do centro só para não cobrir a quina dela
  // (7 de praça + 5 de beiral, vezes √2). Com o raio de 28 sobra a faixa de 17
  // a 23: seis blocos, menos que uma casa. A coroa de dentro nascia e era
  // rejeitada inteira, e a aldeia vinha com três casas.
  //
  // Com DEZ candidatas numa coroa só a 20, a separação é 2·20·sen(18°) = 12,4
  // contra 10 da pior dupla de casas. O que dá profundidade é a folga de ±5 no
  // raio de cada uma: elas deixam de estar na mesma circunferência, e a vila
  // ganha casa mais perto e mais longe do meio em vez de um relógio.
  //
  // ⚠️ A FOLGA ERA ±3 E FOI ABERTA PARA ±5 DE PROPÓSITO, e o motivo é o teste de
  // mutação: com ±3 nenhuma candidata chegava perto da praça, a guarda que
  // protege o miolo nunca era exercida, e o mutante que a enfraquecia
  // SOBREVIVIA — guarda que nunca reprovou não é guarda, é decoração. Com ±5 a
  // candidata a 15 blocos existe, a guarda recusa, e o mutante morre. A
  // separação mínima cai para 9,3 e quem cuida disso é a rejeição, que é medida.
  const candidatas = []
  const QUANTAS = p.candidatas
  for (let i = 0; i < QUANTAS; i++) {
    // ⚠️ COM `coroas: 1` ESTA CONTA É, LINHA POR LINHA, A QUE A VILA SEMPRE
    // TEVE — e tem que continuar sendo: a catraca mede doze vilas desta grade.
    const coroa = i % p.coroas
    const a = giro + (i / QUANTAS) * Math.PI * 2 * p.coroas
    const d =
      p.distancia +
      coroa * p.passo +
      Math.round(hash(centro.gx, centro.gz, 40 + i) * (p.folga * 2)) -
      p.folga
    candidatas.push({
      x: centro.x + Math.round(Math.cos(a) * d),
      z: centro.z + Math.round(Math.sin(a) * d),
    })
  }

  for (const c of candidatas) {
    if (aceitas.length >= p.casas) break
    // ⚠️ A SEPARAÇÃO É MEDIDA, NÃO DEDUZIDA DO ÂNGULO. Enquanto ela saía da
    // geometria do anel, mudar o número de casas mudava em silêncio o quanto
    // elas se aproximavam — e a primeira aldeia com nove teria duas casas
    // atravessadas sem nada reprovar. Agora cada candidata pergunta às que já
    // entraram, e quem não cabe simplesmente não entra: a aldeia sai com sete
    // ou oito em vez de nove, e isso é uma vila, não um defeito.
    if (!dentroDoRaio(centro, c.x, c.z, p.nome)) continue
    const planta = plantaDe(hash, c)
    const bordaC = Math.max(planta.lx, planta.lz) + 1
    // ⚠️ A PRAÇA É MEDIDA PELA BORDA DA CASA, e não pelo centro dela. Medindo só
    // o centro, uma casa a 12 blocos com beiral de 5 avança até 7 do meio da
    // vila: ela cobre a quina da praça, o poste da esquina nasce dentro dela e
    // some. Foi assim que quatro dos onze postes sumiram sem ninguém ver — e é o
    // MESMO defeito que `RAIO_ESCRITO` consertou na onda 1, cometido de novo
    // duas horas depois, porque a guarda era outra.
    if (
      Math.abs(c.x - centro.x) <= RAIO_DA_PRACA + bordaC &&
      Math.abs(c.z - centro.z) <= RAIO_DA_PRACA + bordaC
    ) {
      continue
    }
    let cabe = true
    for (const a of aceitas) {
      const folga = bordaC + Math.max(a.planta.lx, a.planta.lz) + 1
      // Chebyshev e não euclidiana: as casas são caixas alinhadas aos eixos, e
      // duas caixas se tocam pelo maior dos dois eixos. Medir por distância
      // reta aceita duas casas encostadas na diagonal.
      if (Math.abs(c.x - a.x) <= folga && Math.abs(c.z - a.z) <= folga) {
        cabe = false
        break
      }
    }
    if (!cabe) continue
    aceitas.push({
      x: c.x,
      z: c.z,
      planta,
      // A profissão vem do índice: cada aldeia tem as quatro, e as casas
      // seguintes repetem a partir da primeira. Sortear faria vila sem ferreiro.
      profissao: NOMES_DE_PROFISSAO[aceitas.length % NOMES_DE_PROFISSAO.length],
    })
  }
  return aceitas
}

/**
 * O plano completo, ou `null` quando o terreno recusa.
 *
 * `mundo` é `{ alturaEm, nivelDoMar }` — nada de buffer, nada de chunk: é o que
 * torna esta função chamável dos nove vizinhos com a mesma resposta.
 */
export function planoDaAldeia(hash, mundo, cx, cz, porte = 'vila') {
  const p = porteDe(porte)
  const centro = centroDaCelula(hash, cx, cz, porte)
  // ⚠️ O BIOMA É O DO CENTRO, NÃO O DA COLUNA. Perguntar por coluna faria a
  // aldeia que encosta numa borda de bioma nascer com metade das casas: cada
  // coluna decidiria por si, e a divisa cortaria a estrutura ao meio. É a mesma
  // regra do "só dado global decide" da cachoeira, aplicada ao bioma.
  if (mundo.biomaEm && !mundo.biomaAceito(mundo.biomaEm(centro.x, centro.z))) return null
  const chao = terrenoPlano(mundo.alturaEm, centro, mundo.nivelDoMar, raioDoTerrenoDe(porte))
  if (chao === null) return null
  // ⚠️ O MATERIAL É DA VILA INTEIRA, e não de cada casa. Uma vila com metade
  // das casas de carvalho e metade de pinho não lê como um povoado: lê como
  // duas vilas encostadas. Quem varia dentro da vila é a PLANTA.
  const material = mundo.materialDaVila ? mundo.materialDaVila(centro) : MATERIAIS.carvalho
  const casas = casasDe(hash, centro, porte)
  // ⚠️ VILA DE TRÊS CASAS NÃO É VILA, é um acampamento — e com a colocação por
  // rejeição isso pode acontecer quando o sorteio das duas coroas cai mal. Sem
  // este piso, o jogador andaria semanas para achar uma "aldeia" com duas casas
  // e nenhum ofício, e leria isso como mundo quebrado.
  if (casas.length < p.minimas) return null
  for (const c of casas) c.material = material
  const plano = { centro, chao, casas, material, porte: p.nome }
  plano.postes = postesDe(plano)
  plano.rocas = rocasDe(hash, plano, p.raio + 3)
  // ⚠️ SÓ A CIDADE TEM IGREJA E FEIRA, e é isso que a faz cidade. Dar os dois à
  // vila apagaria a graduação inteira: se todo assentamento tem campanário,
  // achar um deixa de ser acontecimento.
  if (p.nome === 'cidade') {
    // A igreja fica FORA da praça e do miolo das casas, num raio próprio: ela é
    // grande e brigaria com qualquer coisa que já estivesse ali.
    const a = hash(centro.gx, centro.gz, 63) * Math.PI * 2
    const d = p.distancia + p.passo * (p.coroas - 1) + 6
    plano.igreja = {
      x: centro.x + Math.round(Math.cos(a) * d),
      z: centro.z + Math.round(Math.sin(a) * d),
    }
    plano.bancas = bancasDaFeira(RAIO_DA_PRACA).map((b) => ({
      x: centro.x + b.dx,
      z: centro.z + b.dz,
    }))
  }
  return plano
}

/**
 * O ASSENTAMENTO desta célula — cidade, vila ou aldeia, o maior que couber.
 *
 * ⚠️ AS TRÊS GRADES SE SOBREPÕEM, E A ORDEM SOZINHA RESOLVE. O maior é tentado
 * primeiro, e quem responde por um chunk responde por ele inteiro.
 *
 * ⚠️ EU ESCREVI UMA GUARDA DE SOBREPOSIÇÃO AQUI E ELA ERA DECORAÇÃO.
 * `maiorPorPerto` varria as células dos portes maiores procurando escrita
 * encostada, com um comentário grande explicando por que era indispensável.
 * Medido em 841 células de terreno real: 14 assentamentos menores recusados COM
 * ela e os MESMOS 14 sem ela. Ela nunca mudou uma resposta.
 *
 * O motivo é geométrico e vale sempre: a célula da cidade tem 38 chunks (608
 * blocos) e ela escreve 60 de raio, com o centro preso ao miolo por margem. A
 * área escrita CABE INTEIRA na própria célula — nenhum chunk de uma cidade cai
 * na célula de outra, e por isso perguntar "a cidade daqui existe?" já é a
 * pergunta certa. O teste `a cidade cabe dentro da própria célula` guarda essa
 * premissa: se alguém aumentar o raio ou encolher a célula, ele reprova, e aí
 * sim a guarda passa a ser necessária.
 *
 * É a mesma lição da onda 2 deste Goal, na minha própria mão: comentário que
 * aponta para o lugar errado faz a próxima pessoa proteger o que não precisa.
 */
export function planoDoAssentamento(hash, mundo, cx, cz) {
  for (const nome of PORTES_POR_TAMANHO) {
    const plano = planoDaAldeia(hash, mundo, cx, cz, nome)
    if (plano) return plano
  }
  return null
}

/**
 * ⚠️ AR EXPLÍCITO, e não `null`. `null` quer dizer "não é comigo, deixe o
 * terreno"; o miolo da casa precisa dizer "aqui é VAZIO", senão a casa nasce
 * cheia de terra e o jogador escava a própria sala. São duas respostas
 * diferentes e por isso são dois valores.
 *
 * ⚠️ E ELE MORA EM `vilaCasa.js` AGORA. Aqui fica o reexporte porque a sonda e
 * os testes já o importam daqui, e mudar o endereço de um valor que significa
 * "vazio" no meio de uma rodada de estrutura é pedir para alguém confundi-lo
 * com `null` outra vez.
 */
export const AIR_DA_CASA = AR

export { blocoDaCasa } from './vilaCasa.js'

/** O caminho de terra batida que liga as casas à praça. */
export function ehCaminho(plano, x, z) {
  const { centro } = plano
  for (const c of plano.casas) {
    // Segmento reto do centro até a porta da casa, com dois de largura.
    //
    // ⚠️ A PORTA NÃO ESTÁ MAIS A UMA DISTÂNCIA FIXA. Com plantas de tamanhos
    // diferentes, `METADE` cravado fazia o caminho parar três blocos antes da
    // porta da casa pequena e atravessar a parede da casa mestra.
    const lz = c.planta?.lz ?? 3
    const t = proximidadeDoSegmento(centro.x, centro.z, c.x, c.z - lz, x, z)
    if (t !== null && t <= 1.2) return true
  }
  return false
}

/** Distância de (px,pz) ao segmento (ax,az)-(bx,bz), ou null se cair fora dele. */
function proximidadeDoSegmento(ax, az, bx, bz, px, pz) {
  const vx = bx - ax
  const vz = bz - az
  const len2 = vx * vx + vz * vz
  if (len2 === 0) return null
  let t = ((px - ax) * vx + (pz - az) * vz) / len2
  if (t < 0 || t > 1) return null
  const qx = ax + vx * t
  const qz = az + vz * t
  return Math.hypot(px - qx, pz - qz)
}

/** Onde os aldeões nascem: um por casa, em pé no meio dela. */
export const aldeoesDe = (plano) =>
  plano.casas.map((c) => ({
    x: c.x + 0.5,
    y: plano.chao + 1,
    z: c.z + 0.5,
    profissao: c.profissao,
  }))

// ── O DESPACHANTE DA COLUNA ──────────────────────────────────────────────────
//
// ⚠️ ANTES, QUEM SABIA A FORMA DA ALDEIA ERA O `worldgen`. Ele varria as casas,
// varria o intervalo `chao..chao+4` cravado no laço, guardava um `escreveu` e só
// então perguntava pelo caminho. A consequência: acrescentar QUALQUER estrutura
// nova — poste, poço, cerca, torre — exigia mexer no gerador do mundo e no
// intervalo cravado, e o intervalo cravado é o que impede um telhado de existir.
//
// Agora a aldeia responde por COLUNA e diz a própria altura. `worldgen` escreve
// o que vier e não sabe mais o que é casa, o que é caminho, nem onde o telhado
// acaba. Estrutura nova entra aqui e chega no mundo sem tocar no gerador.
//
// ⚠️ NULO E LISTA VAZIA SÃO COISAS DIFERENTES, e a diferença é visível no jogo:
// `null` quer dizer "esta coluna não é da aldeia, ponha mato e árvore nela";
// lista vazia quer dizer "é da aldeia e é para ficar LIMPA" — que é o que impede
// um carvalho de nascer dentro da praça.

/**
 * O que esta coluna global recebe da aldeia, de baixo para cima.
 *
 * @returns `[{ y, id }]` — pode ser vazio — ou `null` quando a coluna não é da
 *          aldeia e o terreno segue o curso normal.
 */
/**
 * Traduz as colunas LOCAIS de uma estrutura de `cidade.js` na coluna global.
 *
 * Devolve `null` quando esta coluna não é da estrutura — o mesmo contrato dos
 * outros despachantes daqui, para que a precedência funcione do mesmo jeito.
 */
function colunaDeEstrutura(colunas, centro, chao, x, z) {
  const dx = x - centro.x
  const dz = z - centro.z
  let saida = null
  for (const c of colunas) {
    if (c.dx !== dx || c.dz !== dz) continue
    saida = saida || []
    for (let y = chao + c.de; y <= chao + c.ate; y++) saida.push({ y, id: c.id })
  }
  if (!saida) return null
  // Limpa o que houver acima, como a casa faz: estrutura com mato dentro não é
  // estrutura, e a copa entra por `putIfAir` exatamente no ar que escrevemos.
  const topo = Math.max(...saida.map((e) => e.y))
  for (let y = topo + 1; y <= chao + ALTURA_DA_IGREJA + 2; y++) saida.push({ y, id: AR })
  return saida
}

export function colunaDaAldeia(plano, x, z, alturaEm, hashDaVila = hashPadrao) {
  // ⚠️ COM O PORTE. Sem ele o raio é o da VILA (35), e a cidade (raio 54, igreja
  // a ~59) era cortada: as duas coroas de fora e a igreja nunca chegavam ao
  // mundo — o plano tinha 20 casas, o mundo 12. Achado na primeira foto da
  // cidade (Goal 21, 2.4), junto com a chave-em-vez-de-id de `cidade.js`.
  if (!plano || !dentroDoEscrito(plano.centro, x, z, plano.porte)) return null
  const chao = plano.chao
  const peca = new Map()
  let ehDaVila = false
  for (const casa of plano.casas) {
    for (let y = chao; y <= chao + ALTURA_DA_ALDEIA; y++) {
      const id = blocoDaCasa(casa, chao, x, y, z) ?? blocoDaChamine(casa, chao, x, y, z)
      if (id === null || id === undefined) continue
      peca.set(y, id)
      ehDaVila = true
    }
  }
  if (!ehDaVila && plano.igreja) {
    // ⚠️ A IGREJA VEM DEPOIS DA CASA E ANTES DA PRAÇA, na mesma lógica de
    // precedência: casa já colocada não pode ser comida por prédio público, e
    // prédio público não pode ser comido pelo piso do largo.
    const daIgreja = colunaDeEstrutura(colunasDaIgreja(plano.material), plano.igreja, chao, x, z)
    if (daIgreja !== null) {
      for (const e of daIgreja) peca.set(e.y, e.id)
      ehDaVila = true
    }
  }
  if (!ehDaVila && plano.bancas) {
    for (const b of plano.bancas) {
      const daBanca = colunaDeEstrutura(colunasDaBanca(plano.material), b, chao, x, z)
      if (daBanca === null) continue
      for (const e of daBanca) peca.set(e.y, e.id)
      ehDaVila = true
      break
    }
  }
  if (!ehDaVila) {
    // ⚠️ A CASA VEM PRIMEIRO, SEMPRE. Se a praça respondesse antes, o piso dela
    // apagaria a parede de uma casa que o sorteio pôs encostada no miolo. A
    // ordem aqui é a ordem de precedência da vila.
    const daPraca = colunaDaPraca(plano, plano.postes ?? [], x, z)
    const daRoca = daPraca === null ? colunaDaRoca(hashDaVila, plano, x, z) : null
    if (daPraca !== null) {
      for (const e of daPraca) peca.set(e.y, e.id)
      ehDaVila = true
    } else if (daRoca !== null) {
      for (const e of daRoca) peca.set(e.y, e.id)
      ehDaVila = true
    } else if (ehCaminho(plano, x, z)) {
      peca.set(chao, ID.podzol)
      ehDaVila = true
    }
  }
  if (!ehDaVila) {
    // ── O QUINTAL ──────────────────────────────────────────────────────────
    //
    // ⚠️ VILA COM ÁRVORE ENTRE AS CASAS NÃO É VILA, é mato com casas dentro. E
    // não é só estética: a copa é escrita com `putIfAir`, e `putIfAir` enxerga
    // como vazio exatamente o AR que a casa escreveu — a folha entra pela
    // janela, ocupa o sótão e cobre o telhado. A medição de 14/09/2026 achou
    // 460 folhas e 88 troncos a mais dentro do quadrado da vila.
    //
    // ⚠️ E O QUINTAL DEVOLVE LISTA VAZIA, não coluna cheia. Ele é o terceiro
    // tipo de coluna da vila e o único que não escreve nada: "é minha, deixe o
    // terreno como está, e não plante". Tratá-lo como estrutura calçaria o
    // quintal inteiro de pedregulho, e a vila viraria um pátio.
    if (!ehQuintal(plano, x, z)) return null
    return colunaDoQuintal(plano, alturaEm ? alturaEm(x, z) : chao)
  }

  // ── A COLUNA INTEIRA, e não só as peças ──────────────────────────────────
  //
  // ⚠️ A VILA PRECISA APLAINAR O QUE ENCONTRA, e por dois motivos medidos em
  // 14/09/2026:
  //
  // 1. ABAIXO DO CHÃO ELA TEM QUE PREENCHER. `terrenoPlano` mede CINCO pontos
  //    num quadrado de 56 de lado; uma poça, uma valeta ou a margem de um lago
  //    entre eles é invisível para ele. A casa que cai ali nascia com o piso
  //    pairando dois blocos acima da areia — e a sonda achou uma assim, com 63
  //    blocos de 200, porque a coluna inteira dela estava abaixo do nível do mar.
  //
  // 2. ACIMA DELE ELA TEM QUE LIMPAR. Sem apagar até o topo, o capim que já
  //    nasceu continua de pé dentro da sala, o barranco de um bloco entra pela
  //    parede, e a copa da árvore vizinha atravessa o telhado — `putIfAir` da
  //    folha enxerga como vazio exatamente o AR que a casa escreveu.
  //
  // O preenchimento usa o material de BASE da vila, que é o mesmo da fundação:
  // por fora não se distingue o que é embasamento do que é chão.
  const base = plano.material?.base ? ID[plano.material.base] : ID.cobblestone
  const terreno = alturaEm ? alturaEm(x, z) : chao
  const saida = []
  // ⚠️ ATÉ A PEÇA MAIS ALTA, não até `ALTURA_DA_ALDEIA`. A torre da igreja sobe
  // 21 acima da nave; com o teto da casa (11) ela era serrada na metade — o
  // plano tinha campanário, o mundo tinha um toco (Goal 21, 2.4).
  let teto = chao + ALTURA_DA_ALDEIA
  for (const y of peca.keys()) if (y > teto) teto = y
  for (let y = Math.min(terreno, chao); y <= teto; y++) {
    const id = peca.get(y)
    if (id !== undefined) saida.push({ y, id })
    else if (y < chao) saida.push({ y, id: base })
    else saida.push({ y, id: AR })
  }
  return saida
}

/**
 * ⚠️ O HASH DA ROÇA VEM COM PADRÃO porque `colunaDaAldeia` já é chamada de
 * quatro lugares (gerador, gancho de QA, testes, sonda) e nenhum deles tinha
 * motivo para carregar a semente até aqui. O estágio de cada pé é a única coisa
 * que depende dele, e um pé verde onde deveria haver um maduro não quebra nada:
 * é variação, não contrato.
 */
const hashPadrao = (a, b, c) => {
  let h = (a * 374761393 + b * 668265263 + c * 2246822519) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/**
 * O terreiro, aplainado no nível da vila.
 *
 * ⚠️ ANTES ELE DEVOLVIA LISTA VAZIA — "é minha, deixe o terreno como está" — e
 * era isso que cortava a casa pela metade. O terreno ao lado da casa continuava
 * onde estava: uma lomba de três blocos encostada na parede tapa a porta e a
 * janela, e o jogador lê a casa como enterrada, não como casa num morro.
 *
 * ⚠️ E O TERRAÇO É DE GRAMA, não do material de base. Calçar o terreiro com o
 * pedregulho da fundação transformaria a vila num pátio: o piso duro é a marca
 * da PRAÇA, e se ele vaza para o quintal a praça deixa de significar alguma
 * coisa. Terra debaixo, grama em cima, como o campo em volta.
 */
function colunaDoQuintal(plano, terreno) {
  const chao = plano.chao
  const saida = []
  for (let y = Math.min(terreno, chao); y <= Math.max(terreno + 1, chao + 2); y++) {
    if (y < chao) saida.push({ y, id: ID.dirt })
    else if (y === chao) saida.push({ y, id: ID.grassBlock })
    else saida.push({ y, id: AR })
  }
  return saida
}

/**
 * Esta coluna é o terreiro da vila: sem construção, mas sem mato nem árvore.
 *
 * A folga de três blocos além do beiral é a que a copa do carvalho alcança: com
 * menos, a árvore plantada na primeira coluna livre ainda toca o telhado.
 */
export function ehQuintal(plano, x, z) {
  const FOLGA = 3
  const dx = Math.abs(x - plano.centro.x)
  const dz = Math.abs(z - plano.centro.z)
  if (dx <= RAIO_DA_PRACA + FOLGA && dz <= RAIO_DA_PRACA + FOLGA) return true
  for (const c of plano.casas) {
    const borda = Math.max(c.planta.lx, c.planta.lz) + 1 + FOLGA
    if (Math.abs(x - c.x) <= borda && Math.abs(z - c.z) <= borda) return true
  }
  for (const r of plano.rocas ?? []) {
    const borda = BORDA_DA_ROCA + FOLGA
    if (Math.abs(x - r.x) <= borda && Math.abs(z - r.z) <= borda) return true
  }
  return false
}

/** Distância em blocos a partir da qual a aldeia ganha moradores. */
export const ALCANCE_DE_POVOAR = 64

/**
 * OS ALDEÕES QUE FALTAM NESTA ALDEIA, se o jogador estiver perto o bastante.
 *
 * ⚠️ ELES NÃO NASCEM PELO SISTEMA DE SPAWN POR BIOMA. Porco e vaca aparecem
 * onde o bioma permite e somem quando o jogador se afasta; um aldeão que
 * nascesse assim seria uma loja no meio do nada, e sumiria com a aldeia
 * construída em volta dele. Aqui eles vêm da ESTRUTURA: um por casa, no lugar
 * onde a casa está, e uma vez só.
 *
 * ⚠️ E A CONTA É "QUANTOS FALTAM", não "já povoei". Um sinalizador de "povoada"
 * perderia o aldeão morto ou empurrado para longe, e a aldeia ficaria vazia
 * para sempre — o jogador voltaria a uma cidade fantasma sem entender por quê.
 * Contando os que estão no lugar, a aldeia se repovoa ao longo do tempo, e
 * matar um custa a espera de voltar.
 *
 * @param jogador `{x, z}`
 * @param mobsPerto `(x, z, raio) => número de aldeões já ali`
 */
export function animaisQueFaltam(plano, jogador, mobsPerto) {
  if (!plano) return []
  const d = Math.hypot(jogador.x - plano.centro.x, jogador.z - plano.centro.z)
  if (d > ALCANCE_DE_POVOAR) return []
  // ⚠️ MESMA CONTA DOS ALDEÕES: "quantos faltam", nunca "já povoei". Um
  // sinalizador perderia o bicho comido pelo lobo e o curral ficaria vazio para
  // sempre. E o raio é PEQUENO de propósito: contar num raio grande acharia a
  // vaca selvagem do campo e o curral nunca se repovoaria.
  return animaisDe(plano).filter((a) => mobsPerto(a.x, a.z, 2) === 0)
}

export function aldeoesQueFaltam(plano, jogador, mobsPerto) {
  if (!plano) return []
  const d = Math.hypot(jogador.x - plano.centro.x, jogador.z - plano.centro.z)
  if (d > ALCANCE_DE_POVOAR) return []
  return aldeoesDe(plano).filter((a) => mobsPerto(a.x, a.z, LADO_DA_CASA / 2) === 0)
}
